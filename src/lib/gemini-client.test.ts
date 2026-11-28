import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  callGeminiJsonArray,
  getConfiguredGeminiApiKeys,
  orderGeminiKeysByHealth,
  resetGeminiKeyHealth,
  tryParseGeminiJsonArray,
} from "./gemini-client";

describe("getConfiguredGeminiApiKeys", () => {
  it("mengumpulkan PRIMARY, BACKUP, KEY_N berurutan numerik, dan GEMINI_API_KEYS tanpa duplikat", () => {
    const keys = getConfiguredGeminiApiKeys({
      GEMINI_API_KEY: "key-main",
      GEMINI_API_KEY_BACKUP: "key-backup",
      GEMINI_API_KEY_10: "key-ten",
      GEMINI_API_KEY_2: "key-two",
      GEMINI_API_KEYS: "key-main, key-pool-a; key-pool-b\nkey-two",
    });

    expect(keys).toEqual([
      { label: "PRIMARY", key: "key-main" },
      { label: "BACKUP", key: "key-backup" },
      { label: "KEY_2", key: "key-two" },
      { label: "KEY_10", key: "key-ten" },
      { label: "POOL_2", key: "key-pool-a" },
      { label: "POOL_3", key: "key-pool-b" },
    ]);
  });

  it("mengembalikan array kosong jika tidak ada env key terisi", () => {
    expect(getConfiguredGeminiApiKeys({})).toEqual([]);
  });
});

describe("tryParseGeminiJsonArray", () => {
  it("mem-parsing array JSON dalam code fence markdown maupun object wrapper", () => {
    expect(tryParseGeminiJsonArray('```json\n[{"id":1}]\n```')).toEqual([
      { id: 1 },
    ]);
    expect(tryParseGeminiJsonArray('{"questions":[{"tipe":"pg"}]}')).toEqual([
      { tipe: "pg" },
    ]);
  });
});

describe("callGeminiJsonArray failover", () => {
  beforeEach(() => {
    resetGeminiKeyHealth();
  });

  it("otomatis failover ke GEMINI_API_KEY_BACKUP saat key utama kena 429 dan melewati key utama pada request berikutnya", async () => {
    const calledUrls: string[] = [];
    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calledUrls.push(url);
      if (url.includes("key=key-primary")) {
        return new Response("RESOURCE_EXHAUSTED quota exceeded", {
          status: 429,
        });
      }
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ text: JSON.stringify([{ answerId: 1, score: 4 }]) }],
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as unknown as typeof fetch;

    const env = {
      GEMINI_API_KEY: "key-primary",
      GEMINI_API_KEY_BACKUP: "key-backup",
    };

    const res1 = await callGeminiJsonArray({
      prompt: "test",
      responseSchema: {},
      temperature: 0.2,
      maxOutputTokens: 1024,
      models: ["gemini-test-model"],
      env,
      fetchImpl: mockFetch,
      retryDelayMs: 0,
    });

    expect(res1.ok).toBe(true);
    if (res1.ok) {
      expect(res1.keyLabel).toBe("BACKUP");
      expect(res1.keysAvailable).toBe(2);
      expect(res1.items).toEqual([{ answerId: 1, score: 4 }]);
    }

    // Request kedua langsung memilih BACKUP dulu karena PRIMARY sedang cooldown 60 detik
    const ordered = orderGeminiKeysByHealth(getConfiguredGeminiApiKeys(env));
    expect(ordered[0].label).toBe("BACKUP");

    calledUrls.length = 0;
    const res2 = await callGeminiJsonArray({
      prompt: "test 2",
      responseSchema: {},
      temperature: 0.2,
      maxOutputTokens: 1024,
      models: ["gemini-test-model"],
      env,
      fetchImpl: mockFetch,
      retryDelayMs: 0,
    });
    expect(res2.ok).toBe(true);
    expect(calledUrls).toHaveLength(1);
    expect(calledUrls[0]).toContain("key=key-backup");
  });

  it("otomatis failover ke key cadangan saat key utama error 403 dan menyamarkan potongan API key di pesan error", async () => {
    const mockFetch = vi.fn(async () => {
      return new Response("API key AIzaSySecret1234567890 invalid", {
        status: 403,
      });
    }) as unknown as typeof fetch;

    const res = await callGeminiJsonArray({
      prompt: "test",
      responseSchema: {},
      temperature: 0.2,
      maxOutputTokens: 1024,
      models: ["m1", "m2"],
      env: { GEMINI_API_KEY: "key-a", GEMINI_API_KEY_2: "key-b" },
      fetchImpl: mockFetch,
      retryDelayMs: 0,
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).not.toContain("AIzaSySecret");
      expect(res.error).toContain("[REDACTED_KEY]");
    }
    // 403 langsung break dari inner loop model sehingga hanya 1 panggilan per key (2 total, bukan 4)
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
