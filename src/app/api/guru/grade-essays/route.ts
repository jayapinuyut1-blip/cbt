import { NextResponse } from "next/server";
import { getCurrentUserProfile } from "@/lib/server-auth";
import {
  createAdminSupabase,
  createServerSupabase,
} from "@/lib/supabase/server";
import {
  AI_MAX_BATCHES_PER_WINDOW,
  consumeAiRateLimit,
} from "@/lib/rate-limit";
import {
  normalizeAiGradingResponse,
  type EssayAiItemInput,
} from "@/lib/essay-ai";

export const maxDuration = 60;

// Antrian FIFO concurrency server-side agar tidak memicu 429 Gemini
const MAX_CONCURRENT_AI = 2;
let activeJobs = 0;
const waitQueue: Array<() => void> = [];

function acquireSlot(): Promise<void> {
  if (activeJobs < MAX_CONCURRENT_AI) {
    activeJobs++;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    waitQueue.push(() => {
      activeJobs++;
      resolve();
    });
  });
}

function releaseSlot() {
  activeJobs = Math.max(0, activeJobs - 1);
  const next = waitQueue.shift();
  if (next) next();
}

const GEMINI_MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-flash-latest",
  "gemini-3.8-flash",
];

const RESPONSE_SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      answerId: { type: "INTEGER" },
      score: { type: "NUMBER" },
      reason: { type: "STRING" },
    },
    required: ["answerId", "score", "reason"],
  },
};

function tryParseArray(rawText: string): unknown[] | null {
  const cleaned = rawText
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const candidates = [cleaned];
  const first = cleaned.indexOf("[");
  const last = cleaned.lastIndexOf("]");
  if (first !== -1 && last > first) {
    candidates.push(cleaned.slice(first, last + 1));
  }

  for (const text of candidates) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed;
      if (
        parsed &&
        typeof parsed === "object" &&
        Array.isArray((parsed as { results?: unknown[] }).results)
      ) {
        return (parsed as { results: unknown[] }).results;
      }
    } catch {
      // Coba kandidat berikutnya
    }
  }
  return null;
}

export async function POST(request: Request) {
  const { profile } = await getCurrentUserProfile();
  if (!profile || (profile.role !== "guru" && profile.role !== "admin")) {
    return NextResponse.json(
      { error: "Akses khusus Guru atau Admin." },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const examId = Number(body.examId);
    const subjectName = String(body.subjectName || "").trim();
    const rawItems: unknown[] = Array.isArray(body.items) ? body.items : [];

    if (!examId) {
      return NextResponse.json(
        { error: "ID ujian wajib disertakan." },
        { status: 400 }
      );
    }

    if (rawItems.length === 0) {
      return NextResponse.json(
        { error: "Tidak ada jawaban essay yang dikirim untuk dinilai." },
        { status: 400 }
      );
    }

    if (rawItems.length > 12) {
      return NextResponse.json(
        { error: "Maksimal 12 jawaban essay per batch agar proses tetap stabil." },
        { status: 400 }
      );
    }

    // Verifikasi akses guru terhadap mata pelajaran ujian ini
    if (profile.role === "guru") {
      const supabase = await createServerSupabase();
      const { data: examRow } = await supabase
        .from("exams")
        .select("subject_id")
        .eq("id", examId)
        .maybeSingle();

      if (!examRow?.subject_id) {
        return NextResponse.json(
          { error: "Ujian tidak ditemukan." },
          { status: 404 }
        );
      }

      const { data: link } = await supabase
        .from("teacher_subjects")
        .select("subject_id")
        .eq("guru_id", profile.id)
        .eq("subject_id", examRow.subject_id)
        .maybeSingle();

      if (!link) {
        return NextResponse.json(
          { error: "Anda tidak mengampu mata pelajaran ujian ini." },
          { status: 403 }
        );
      }
    }

    const items: EssayAiItemInput[] = [];
    const maxScoreByAnswerId = new Map<number, number>();

    for (const raw of rawItems) {
      if (!raw || typeof raw !== "object") continue;
      const obj = raw as Record<string, unknown>;
      const answerId = Number(obj.answerId);
      const maxScore = Number(obj.maxScore);
      const questionText = String(obj.questionText || "").trim().slice(0, 1500);
      const studentAnswer = String(obj.studentAnswer || "").trim().slice(0, 3000);
      const rubric = String(obj.rubric || "").trim().slice(0, 1000);

      if (!Number.isFinite(answerId) || !questionText || !studentAnswer) continue;
      const safeMax = Number.isFinite(maxScore) && maxScore > 0 ? maxScore : 1;

      items.push({
        answerId,
        questionText,
        maxScore: safeMax,
        rubric,
        studentAnswer,
      });
      maxScoreByAnswerId.set(answerId, safeMax);
    }

    if (items.length === 0) {
      return NextResponse.json(
        { error: "Tidak ada jawaban essay berisi teks yang valid." },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY || "";
    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "GEMINI_API_KEY belum disetel di server. Gunakan opsi 'Mode Prompt Gratis' atau hubungi Admin.",
        },
        { status: 400 }
      );
    }

    // Rate-limit serverless-safe berbasis DB (memakai ulang batas AI per guru)
    const admin = createAdminSupabase();
    const allowed = await consumeAiRateLimit(admin, profile.id);
    if (!allowed) {
      return NextResponse.json(
        {
          error: `Batas pemakaian AI sementara tercapai (maks ${AI_MAX_BATCHES_PER_WINDOW} batch per 10 menit). Coba lagi beberapa menit lagi atau gunakan Mode Prompt Gratis.`,
        },
        { status: 429 }
      );
    }

    const anonymizedPayload = items.map((it) => ({
      answerId: it.answerId,
      pertanyaan: it.questionText,
      bobot_maks: it.maxScore,
      rubrik_guru:
        it.rubric || "(Tidak ada rubrik khusus; nilai berdasarkan ketepatan dan kelengkapan terhadap pertanyaan)",
      jawaban_siswa: it.studentAnswer,
    }));

    const prompt = `Anda adalah asisten koreksi essay profesional untuk guru SMK di Indonesia.
Mata Pelajaran: ${subjectName || "Umum SMK"}

Tugas Anda adalah memberi usulan skor dan alasan singkat secara objektif, adil, dan konsisten untuk setiap jawaban anonim di bawah ini.

Pedoman penilaian:
1. Skor wajib berada di rentang 0 sampai bobot_maks tiap soal, dalam kelipatan 0.5 (contoh: 0, 1, 2.5, 4, 5).
2. Jika rubrik_guru tersedia, jadikan poin rubrik sebagai acuan utama.
3. Berikan skor penuh jika seluruh konsep inti benar dan lengkap; skor parsial jika hanya sebagian benar; skor 0 jika melenceng total, asal ketik, atau menyalin soal tanpa menjawab.
4. Toleransi kesalahan ejaan/typo ringan selama makna teknisnya tepat.
5. Tulis "reason" maksimal 1 kalimat ringkas dalam Bahasa Indonesia yang jelas (jangan gunakan karakter em dash).
6. Nilai SEMUA answerId yang diberikan. Kembalikan HANYA JSON array sesuai skema.

Data jawaban anonim:
${JSON.stringify(anonymizedPayload, null, 2)}`;

    await acquireSlot();

    let lastError = "Gagal menghubungi Gemini API.";
    let parsedArray: unknown[] | null = null;

    try {
      for (const model of GEMINI_MODELS) {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(
          apiKey
        )}`;
        const resp = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 4096,
              responseMimeType: "application/json",
              responseSchema: RESPONSE_SCHEMA,
            },
          }),
        });

        if (!resp.ok) {
          const errText = await resp.text();
          lastError = `Gemini (${model}) error ${resp.status}: ${errText.slice(0, 160)}`;
          if (resp.status === 429 || resp.status === 503) {
            await new Promise((r) => setTimeout(r, 700));
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
          lastError = `Gemini (${model}) mengembalikan respon kosong.`;
          continue;
        }

        const arr = tryParseArray(rawText);
        if (arr && arr.length > 0) {
          parsedArray = arr;
          break;
        }
        lastError = `Format JSON dari ${model} tidak lengkap.`;
      }
    } finally {
      releaseSlot();
    }

    if (!parsedArray) {
      return NextResponse.json(
        { error: `${lastError} Silakan ulangi atau gunakan Mode Prompt Gratis.` },
        { status: 502 }
      );
    }

    const results = normalizeAiGradingResponse(parsedArray, maxScoreByAnswerId);
    if (results.length === 0) {
      return NextResponse.json(
        { error: "AI tidak mengembalikan skor yang cocok dengan jawaban." },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, results });
  } catch (err) {
    console.error("AI grade essays error:", err);
    return NextResponse.json(
      { error: "Terjadi kesalahan saat menilai essay dengan AI." },
      { status: 500 }
    );
  }
}
