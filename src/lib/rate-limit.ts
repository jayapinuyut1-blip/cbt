import type { SupabaseClient } from "@supabase/supabase-js";

export const LOGIN_MAX_ATTEMPTS = 8;
export const LOGIN_WINDOW_MS = 5 * 60 * 1000; // 5 menit

export interface RateLimitEntry {
  attempts: number;
  windowExpiresAt: number; // epoch ms
}

// Fallback in-memory bila tabel login_rate_limits belum dibuat di Supabase
const memoryFallback = new Map<string, RateLimitEntry>();

/** Logika murni: tentukan apakah request masih diizinkan. */
export function isRateLimitAllowed(
  entry: RateLimitEntry | null,
  nowMs: number,
  maxAttempts = LOGIN_MAX_ATTEMPTS
): boolean {
  if (!entry) return true;
  if (nowMs >= entry.windowExpiresAt) return true;
  return entry.attempts < maxAttempts;
}

/** Logika murni: hitung state baru saat percobaan login gagal. */
export function computeNextFailureEntry(
  entry: RateLimitEntry | null,
  nowMs: number,
  windowMs = LOGIN_WINDOW_MS
): RateLimitEntry {
  if (!entry || nowMs >= entry.windowExpiresAt) {
    return { attempts: 1, windowExpiresAt: nowMs + windowMs };
  }
  return {
    attempts: entry.attempts + 1,
    windowExpiresAt: entry.windowExpiresAt,
  };
}

export async function checkLoginRateLimit(
  admin: SupabaseClient,
  rateKey: string,
  nowMs = Date.now()
): Promise<boolean> {
  try {
    const { data, error } = await admin
      .from("login_rate_limits")
      .select("attempts, window_expires_at")
      .eq("rate_key", rateKey)
      .maybeSingle();

    if (error) {
      // Fallback mulus bila tabel belum dipatch
      return isRateLimitAllowed(memoryFallback.get(rateKey) || null, nowMs);
    }

    if (!data) return true;
    const entry: RateLimitEntry = {
      attempts: Number(data.attempts || 0),
      windowExpiresAt: new Date(data.window_expires_at).getTime(),
    };
    return isRateLimitAllowed(entry, nowMs);
  } catch {
    return isRateLimitAllowed(memoryFallback.get(rateKey) || null, nowMs);
  }
}

export async function recordLoginFailure(
  admin: SupabaseClient,
  rateKey: string,
  nowMs = Date.now()
): Promise<void> {
  try {
    const { data, error } = await admin
      .from("login_rate_limits")
      .select("attempts, window_expires_at")
      .eq("rate_key", rateKey)
      .maybeSingle();

    if (error) {
      const next = computeNextFailureEntry(
        memoryFallback.get(rateKey) || null,
        nowMs
      );
      memoryFallback.set(rateKey, next);
      return;
    }

    const current: RateLimitEntry | null = data
      ? {
          attempts: Number(data.attempts || 0),
          windowExpiresAt: new Date(data.window_expires_at).getTime(),
        }
      : null;

    const next = computeNextFailureEntry(current, nowMs);
    await admin.from("login_rate_limits").upsert({
      rate_key: rateKey,
      attempts: next.attempts,
      window_expires_at: new Date(next.windowExpiresAt).toISOString(),
    });

    // Bersihkan entri kadaluarsa secara berkala agar tabel tetap kecil
    if (Math.random() < 0.1) {
      await admin
        .from("login_rate_limits")
        .delete()
        .lt("window_expires_at", new Date(nowMs).toISOString());
    }
  } catch {
    const next = computeNextFailureEntry(
      memoryFallback.get(rateKey) || null,
      nowMs
    );
    memoryFallback.set(rateKey, next);
  }
}

export async function clearLoginRateLimit(
  admin: SupabaseClient,
  rateKey: string
): Promise<void> {
  memoryFallback.delete(rateKey);
  try {
    await admin.from("login_rate_limits").delete().eq("rate_key", rateKey);
  } catch {
    // Abaikan bila tabel belum tersedia
  }
}
