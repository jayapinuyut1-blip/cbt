import { describe, expect, it } from "vitest";
import {
  buildFreeGradingPrompt,
  normalizeAiGradingResponse,
  parsePastedGradingJson,
  partitionAndChunkEssays,
  roundHalfStep,
} from "./essay-ai";

describe("essay-ai pure helpers", () => {
  it("membulatkan skor ke kelipatan 0.5 dan membatasi antara 0 dan maxScore", () => {
    expect(roundHalfStep(3.74, 5)).toBe(3.5);
    expect(roundHalfStep(3.76, 5)).toBe(4);
    expect(roundHalfStep(-2, 5)).toBe(0);
    expect(roundHalfStep(99, 5)).toBe(5);
    expect(roundHalfStep(Number.NaN, 5)).toBe(0);
  });

  it("memisahkan jawaban kosong menjadi skor 0 otomatis dan memecah sisanya ke batch", () => {
    const items = [
      { answerId: 1, questionText: "Q1", maxScore: 5, studentAnswer: "   " },
      { answerId: 2, questionText: "Q1", maxScore: 5, studentAnswer: "Jawaban A" },
      { answerId: 3, questionText: "Q1", maxScore: 5, studentAnswer: "Jawaban B" },
      { answerId: 4, questionText: "Q1", maxScore: 5, studentAnswer: "Jawaban C" },
    ];
    const { emptyAutoZero, batches } = partitionAndChunkEssays(items, 2);
    expect(emptyAutoZero).toHaveLength(1);
    expect(emptyAutoZero[0]).toEqual({
      answerId: 1,
      score: 0,
      reason: "Siswa tidak mengisi jawaban.",
    });
    expect(batches).toHaveLength(2);
    expect(batches[0].map((x) => x.answerId)).toEqual([2, 3]);
    expect(batches[1].map((x) => x.answerId)).toEqual([4]);
  });

  it("menormalisasi respon AI, membuang answerId tak dikenal dan duplikat", () => {
    const allowed = new Map<number, number>([
      [10, 5],
      [11, 10],
    ]);
    const res = normalizeAiGradingResponse(
      [
        { answerId: 10, score: 4.8, reason: "Sangat lengkap" },
        { answerId: 10, score: 1, reason: "Duplikat harus diabaikan" },
        { answerId: 11, score: 15, reason: "Melebihi batas harus dijepit" },
        { answerId: 999, score: 5, reason: "ID asing harus dibuang" },
      ],
      allowed
    );
    expect(res).toEqual([
      { answerId: 10, score: 5, reason: "Sangat lengkap" },
      { answerId: 11, score: 10, reason: "Melebihi batas harus dijepit" },
    ]);
  });

  it("mem-parsing hasil tempel Mode Prompt Gratis termasuk blok markdown", () => {
    const allowed = new Map<number, number>([[21, 5]]);
    const ok = parsePastedGradingJson(
      '```json\n[{"answerId":21,"score":3.6,"reason":"Konsep dasar tepat."}]\n```',
      allowed
    );
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.results).toEqual([
        { answerId: 21, score: 3.5, reason: "Konsep dasar tepat." },
      ]);
    }

    const mismatch = parsePastedGradingJson('[{"answerId":999,"score":2}]', allowed);
    expect(mismatch.ok).toBe(false);

    const invalid = parsePastedGradingJson("teks biasa", allowed);
    expect(invalid.ok).toBe(false);
  });

  it("menyusun prompt koreksi anonim yang memuat rubrik tanpa data pribadi", () => {
    const prompt = buildFreeGradingPrompt(
      [
        {
          answerId: 50,
          questionText: "Apa fungsi router?",
          maxScore: 5,
          rubric: "Menghubungkan dua jaringan berbeda",
          studentAnswer: "Menghubungkan jaringan lokal ke internet",
        },
      ],
      "Informatika"
    );
    expect(prompt).toContain("Informatika");
    expect(prompt).toContain("Menghubungkan dua jaringan berbeda");
    expect(prompt).toContain('"answerId": 50');
  });
});
