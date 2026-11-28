/**
 * Client server-side bersama untuk panggilan Gemini API (Buat Soal AI & Koreksi Essay AI).
 * Mendukung multi-key backup otomatis via Environment Variables + cooldown pintar saat kena limit 429/403.
 */

export const DEFAULT_GEMINI_MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-flash-latest",
  "gemini-3.8-flash",
] as const;

export interface GeminiKeyEntry {
  label: string;
  key: string;
}

export interface GeminiJsonCallOptions {
  prompt: string;
  responseSchema: Record<string, unknown>;
  temperature: number;
  maxOutputTokens: number;
  models?: readonly string[];
  wrapperArrayKeys?: string[];
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  /** Jeda tunggu dalam ms saat 429/503 (bisa disetel 0 di unit test) */
  retryDelayMs?: number;
}

export type GeminiJsonCallResult =
  | {
      ok: true;
      items: unknown[];
      model: string;
      keyLabel: string;
      keysAvailable: number;
    }
  | {
      ok: false;
      error: string;
      status: number;
      keysAvailable: number;
    };

const COOLDOWN_RATE_LIMIT_MS = 60_000;
const COOLDOWN_AUTH_ERROR_MS = 300_000;

// Menyimpan timestamp expiry cooldown per API key (di-key berdasarkan hash/value di memori server)
const keyCooldownUntil = new Map<string, number>();

// Antrian FIFO concurrency server-side bersama untuk seluruh endpoint AI
let activeAiJobs = 0;
const waitQueue: Array<() => void> = [];

function acquireAiSlot(maxConcurrent: number): Promise<void> {
  if (activeAiJobs < maxConcurrent) {
    activeAiJobs++;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    waitQueue.push(() => {
      activeAiJobs++;
      resolve();
    });
  });
}

function releaseAiSlot() {
  activeAiJobs = Math.max(0, activeAiJobs - 1);
  const next = waitQueue.shift();
  if (next) next();
}

export function resetGeminiKeyHealth() {
  keyCooldownUntil.clear();
}

/**
 * Membaca seluruh Gemini API key dari environment variables secara terurut & tanpa duplikat:
 * 1. GEMINI_API_KEY (utama)
 * 2. GEMINI_API_KEY_BACKUP (cadangan 1)
 * 3. GEMINI_API_KEY_1 .. GEMINI_API_KEY_10 (cadangan bernomor)
 * 4. GEMINI_API_KEYS (daftar dipisah koma / baris baru / titik koma)
 */
export function getConfiguredGeminiApiKeys(
  env: Record<string, string | undefined> = process.env
): GeminiKeyEntry[] {
  const seen = new Set<string>();
  const entries: GeminiKeyEntry[] = [];

  const pushKey = (raw: string | undefined, label: string) => {
    const cleaned = (raw || "").trim();
    if (!cleaned || seen.has(cleaned)) return;
    seen.add(cleaned);
    entries.push({ label, key: cleaned });
  };

  pushKey(env.GEMINI_API_KEY, "PRIMARY");
  pushKey(env.GEMINI_API_KEY_BACKUP, "BACKUP");

  // Kumpulkan variabel bernomor GEMINI_API_KEY_1, GEMINI_API_KEY_2, dst. secara urut numerik
  const numberedKeys = Object.keys(env)
    .map((name) => {
      const m = /^GEMINI_API_KEY_(\d+)$/.exec(name);
      return m ? { name, num: Number(m[1]) } : null;
    })
    .filter((item): item is { name: string; num: number } => item !== null)
    .sort((a, b) => a.num - b.num);

  for (const item of numberedKeys) {
    pushKey(env[item.name], `KEY_${item.num}`);
  }

  // Kumpulkan daftar dipisah koma/titik-koma/baris baru di GEMINI_API_KEYS
  const poolRaw = (env.GEMINI_API_KEYS || "").trim();
  if (poolRaw) {
    const parts = poolRaw
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    parts.forEach((k, idx) => pushKey(k, `POOL_${idx + 1}`));
  }

  return entries;
}

/**
 * Mengurutkan API key: key yang sehat (tidak dalam cooldown) di depan,
 * key yang sedang cooldown tetap ditaruh di belakang sebagai cadangan terakhir.
 */
export function orderGeminiKeysByHealth(
  keys: GeminiKeyEntry[],
  now = Date.now()
): GeminiKeyEntry[] {
  const healthy: GeminiKeyEntry[] = [];
  const cooling: Array<{ entry: GeminiKeyEntry; until: number }> = [];

  for (const entry of keys) {
    const until = keyCooldownUntil.get(entry.key) || 0;
    if (until > now) {
      cooling.push({ entry, until });
    } else {
      if (until > 0) keyCooldownUntil.delete(entry.key);
      healthy.push(entry);
    }
  }

  cooling.sort((a, b) => a.until - b.until);
  return [...healthy, ...cooling.map((c) => c.entry)];
}

export function tryParseGeminiJsonArray(
  rawText: string,
  wrapperKeys: string[] = ["questions", "results"]
): unknown[] | null {
  const cleaned = rawText
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const candidates = [cleaned];
  const firstBracket = cleaned.indexOf("[");
  const lastBracket = cleaned.lastIndexOf("]");
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    candidates.push(cleaned.slice(firstBracket, lastBracket + 1));
  }

  for (const text of candidates) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && typeof parsed === "object") {
        const record = parsed as Record<string, unknown>;
        for (const wk of wrapperKeys) {
          if (Array.isArray(record[wk])) {
            return record[wk] as unknown[];
          }
        }
      }
    } catch {
      // Lanjut kandidat berikutnya
    }
  }
  return null;
}

function sanitizeErrorSnippet(raw: string): string {
  // Pastikan tidak pernah membocorkan potongan API key (format AIza... atau AQ....) di pesan error
  return raw
    .replace(/AIza[0-9A-Za-z_-]{10,}/g, "[REDACTED_KEY]")
    .replace(/AQ\.[0-9A-Za-z._-]{10,}/g, "[REDACTED_KEY]")
    .slice(0, 160);
}

/**
 * Memanggil Gemini API dengan failover otomatis antar-key backup dan antar-model.
 */
export async function callGeminiJsonArray(
  options: GeminiJsonCallOptions
): Promise<GeminiJsonCallResult> {
  const {
    prompt,
    responseSchema,
    temperature,
    maxOutputTokens,
    models = DEFAULT_GEMINI_MODELS,
    wrapperArrayKeys = ["questions", "results"],
    env = process.env,
    fetchImpl = fetch,
    retryDelayMs = 500,
  } = options;

  const configuredKeys = getConfiguredGeminiApiKeys(env);
  if (configuredKeys.length === 0) {
    return {
      ok: false,
      status: 400,
      keysAvailable: 0,
      error:
        "GEMINI_API_KEY belum disetel di server (.env.local / Vercel). Gunakan opsi 'Mode Prompt Gratis' atau hubungi Admin.",
    };
  }

  const orderedKeys = orderGeminiKeysByHealth(configuredKeys);
  const maxConcurrent = Math.min(4, Math.max(2, orderedKeys.length));

  await acquireAiSlot(maxConcurrent);

  let lastError = "Gagal menghubungi Gemini API.";
  let parsedArray: unknown[] | null = null;
  let successModel = "";
  let successKeyLabel = "";

  try {
    for (let keyIdx = 0; keyIdx < orderedKeys.length; keyIdx++) {
      const keyEntry = orderedKeys[keyIdx];
      const hasRemainingKey = keyIdx < orderedKeys.length - 1;

      for (const model of models) {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(
          keyEntry.key
        )}`;

        let resp: Response;
        try {
          resp = await fetchImpl(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                temperature,
                maxOutputTokens,
                responseMimeType: "application/json",
                responseSchema,
              },
            }),
          });
        } catch (networkErr) {
          lastError = `Koneksi ke Gemini (${model}, ${keyEntry.label}) gagal: ${
            networkErr instanceof Error ? networkErr.message : "network error"
          }`;
          continue;
        }

        if (!resp.ok) {
          const errText = await resp.text().catch(() => "");
          lastError = `Gemini (${model}, ${keyEntry.label}) error ${resp.status}: ${sanitizeErrorSnippet(errText)}`;

          if (resp.status === 401 || resp.status === 403) {
            // Key tidak valid / diblokir: cooldown lama dan langsung lompat ke key cadangan berikutnya
            keyCooldownUntil.set(
              keyEntry.key,
              Date.now() + COOLDOWN_AUTH_ERROR_MS
            );
            break;
          }

          if (resp.status === 429) {
            // Kuota key habis: tandai cooldown sementara
            keyCooldownUntil.set(
              keyEntry.key,
              Date.now() + COOLDOWN_RATE_LIMIT_MS
            );
            if (hasRemainingKey) {
              // Langsung pindah ke key cadangan agar cepat tanpa menunda di key yang limit
              break;
            }
            if (retryDelayMs > 0) {
              await new Promise((r) => setTimeout(r, retryDelayMs));
            }
            continue;
          }

          if (resp.status === 503 && retryDelayMs > 0) {
            await new Promise((r) => setTimeout(r, retryDelayMs));
          }
          continue;
        }

        const data = await resp.json();
        const parts: Array<{ thought?: boolean; text?: string }> =
          data?.candidates?.[0]?.content?.parts || [];

        const rawText = parts
          .filter((p) => !p.thought && typeof p.text === "string")
          .map((p) => p.text)
          .join("")
          .trim();

        if (!rawText) {
          lastError = `Gemini (${model}, ${keyEntry.label}) mengembalikan respon kosong.`;
          continue;
        }

        const arr = tryParseGeminiJsonArray(rawText, wrapperArrayKeys);
        if (arr && arr.length > 0) {
          parsedArray = arr;
          successModel = model;
          successKeyLabel = keyEntry.label;
          break;
        }

        lastError = `Format JSON dari ${model} (${keyEntry.label}) tidak lengkap (finishReason: ${
          data?.candidates?.[0]?.finishReason || "unknown"
        }).`;
      }

      if (parsedArray) break;
    }
  } finally {
    releaseAiSlot();
  }

  if (!parsedArray) {
    return {
      ok: false,
      status: 502,
      keysAvailable: configuredKeys.length,
      error: lastError,
    };
  }

  return {
    ok: true,
    items: parsedArray,
    model: successModel,
    keyLabel: successKeyLabel,
    keysAvailable: configuredKeys.length,
  };
}
