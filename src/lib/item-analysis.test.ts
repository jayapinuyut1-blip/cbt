import { describe, expect, it } from "vitest";
import {
  analyzeItems,
  classifyDifficulty,
  summarizeAnalysis,
  type AnalysisAnswerRow,
} from "./item-analysis";

describe("classifyDifficulty", () => {
  it("memakai ambang >75 Mudah, 30–75 Sedang, <30 Sulit", () => {
    expect(classifyDifficulty(76)).toBe("Mudah");
    expect(classifyDifficulty(75)).toBe("Sedang");
    expect(classifyDifficulty(30)).toBe("Sedang");
    expect(classifyDifficulty(29.9)).toBe("Sulit");
    expect(classifyDifficulty(null)).toBe("Belum Dinilai");
  });
});

describe("analyzeItems", () => {
  const q = {
    id: 1,
    teks: "Soal PG",
    bobot: 1,
    tipe: "pg" as const,
    question_options: [
      { id: 10, urutan: 1, teks: "A", pasangan: null, benar: true },
      { id: 11, urutan: 2, teks: "B", pasangan: null, benar: false },
    ],
  };
  const row = (optionId: number, skor: number | null): AnalysisAnswerRow => ({
    question_id: 1,
    jawaban: { option_id: optionId },
    skor,
    questions: q,
  });

  it("menghitung penguasaan, distribusi opsi, dan pengecoh dominan", () => {
    const items = analyzeItems([row(10, 1), row(11, 0), row(11, 0), row(11, 0)]);
    expect(items).toHaveLength(1);
    const it0 = items[0];
    expect(it0.responden).toBe(4);
    expect(it0.benarPenuh).toBe(1);
    expect(it0.salah).toBe(3);
    expect(it0.tingkatPenguasaan).toBe(25);
    expect(it0.kategori).toBe("Sulit");
    expect(it0.topDistractor).toEqual({ letter: "B", pickedPct: 75 });
  });

  it("menghitung soal belum dinilai terpisah dari penguasaan", () => {
    const [item] = analyzeItems([row(10, 1), row(10, null)]);
    expect(item.belumDinilai).toBe(1);
    expect(item.gradedCount).toBe(1);
    expect(item.tingkatPenguasaan).toBe(100);
  });

  it("summarizeAnalysis merangkum kategori & rata-rata", () => {
    const s = summarizeAnalysis(analyzeItems([row(10, 1), row(10, 1)]));
    expect(s).toMatchObject({ total: 1, mudah: 1, sedang: 0, sulit: 0, avgPenguasaan: 100 });
  });
});
