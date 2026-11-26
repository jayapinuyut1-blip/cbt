import { describe, expect, it } from "vitest";
import {
  LOGIN_MAX_ATTEMPTS,
  LOGIN_WINDOW_MS,
  computeNextFailureEntry,
  isRateLimitAllowed,
} from "./rate-limit";

describe("rate-limit pure helpers", () => {
  const now = 1_700_000_000_000;

  it("mengizinkan request baru tanpa riwayat", () => {
    expect(isRateLimitAllowed(null, now)).toBe(true);
  });

  it("memblokir setelah mencapai batas maksimum percobaan gagal", () => {
    let entry = null;
    for (let i = 0; i < LOGIN_MAX_ATTEMPTS; i++) {
      expect(isRateLimitAllowed(entry, now + i * 1000)).toBe(true);
      entry = computeNextFailureEntry(entry, now + i * 1000);
    }
    expect(entry?.attempts).toBe(LOGIN_MAX_ATTEMPTS);
    expect(isRateLimitAllowed(entry, now + 10_000)).toBe(false);
  });

  it("mereset jendela otomatis setelah masa blokir berlalu", () => {
    const expired = { attempts: LOGIN_MAX_ATTEMPTS, windowExpiresAt: now };
    expect(isRateLimitAllowed(expired, now)).toBe(true);

    const next = computeNextFailureEntry(expired, now + 100);
    expect(next.attempts).toBe(1);
    expect(next.windowExpiresAt).toBe(now + 100 + LOGIN_WINDOW_MS);
  });

  it("mempertahankan windowExpiresAt yang sama selama masih dalam jendela aktif", () => {
    const first = computeNextFailureEntry(null, now);
    const second = computeNextFailureEntry(first, now + 5000);
    expect(second.attempts).toBe(2);
    expect(second.windowExpiresAt).toBe(first.windowExpiresAt);
  });
});
