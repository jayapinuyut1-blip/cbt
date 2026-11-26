import { describe, expect, it } from "vitest";
import {
  BATCH_SIZE,
  MAX_PER_TYPE,
  buildBatches,
  buildCopyablePrompt,
  clampQuestionCount,
  parsePastedAiJson,
} from "./ai-question-utils";

describe("ai-question-utils", () => {
  it("menggabungkan menjadi 1 batch cepat jika total <= BATCH_SIZE", () => {
    const batches = buildBatches(5, 2, 1, 2);
    expect(batches).toHaveLength(1);
    expect(batches[0].total).toBe(10);
    expect(batches[0].label).toBe("5 PG, 2 Isian, 1 Jodoh, 2 Essay");
  });

  it("memecah permintaan besar menjadi beberapa batch per BATCH_SIZE", () => {
    const batches = buildBatches(25, 0, 0, 5);
    expect(batches).toHaveLength(4);
    expect(batches.map((b) => b.total)).toEqual([BATCH_SIZE, BATCH_SIZE, 5, 5]);
    expect(batches[3].countEssay).toBe(5);
  });

  it("mengembalikan array kosong jika semua jumlah 0", () => {
    expect(buildBatches(0, 0, 0, 0)).toEqual([]);
  });

  it("membatasi jumlah soal antara 0 dan MAX_PER_TYPE", () => {
    expect(clampQuestionCount("-5")).toBe(0);
    expect(clampQuestionCount("abc")).toBe(0);
    expect(clampQuestionCount("12.9")).toBe(12);
    expect(clampQuestionCount("999")).toBe(MAX_PER_TYPE);
  });

  it("mem-parsing JSON hasil AI termasuk yang terbungkus pagar markdown", () => {
    const res = parsePastedAiJson(
      '```json\n[{"tipe":"essay","teks":"Jelaskan!","bobot":5}]\n```'
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.questions).toHaveLength(1);
      expect(res.questions[0].teks).toBe("Jelaskan!");
    }

    const bad = parsePastedAiJson("[]");
    expect(bad.ok).toBe(false);

    const invalid = parsePastedAiJson("bukan json");
    expect(invalid.ok).toBe(false);
  });

  it("menyusun prompt siap salin yang memuat mapel, CP, dan jumlah soal", () => {
    const prompt = buildCopyablePrompt({
      subjectName: "Matematika",
      gradeLabel: "Kelas X SMK (Fase E)",
      difficulty: "HOTS",
      selectedCps: [{ elemen: "Bilangan", deskripsi: "Operasi eksponen" }],
      topic: "Logaritma",
      countPg: 10,
      countIsian: 0,
      countJodoh: 0,
      countEssay: 2,
    });
    expect(prompt).toContain("Matematika");
    expect(prompt).toContain("[Bilangan] Operasi eksponen");
    expect(prompt).toContain("Logaritma");
    expect(prompt).toContain("Pilihan Ganda (pg): 10 soal");
    expect(prompt).toContain("Essay (essay): 2 soal");
  });
});
