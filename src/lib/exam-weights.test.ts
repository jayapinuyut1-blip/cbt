import { describe, expect, it } from "vitest";
import {
  buildAutoWeights,
  computeComposition,
  formatBobotTipeSummary,
  parseWeightInputs,
} from "./exam-weights";

const weights = (pg = 0, isian = 0, jodoh = 0, essay = 0) =>
  parseWeightInputs({
    pg: String(pg),
    isian: String(isian),
    jodoh: String(jodoh),
    essay: String(essay),
  });

describe("parseWeightInputs", () => {
  it("menjumlahkan total & mengabaikan input tidak valid / negatif", () => {
    const w = parseWeightInputs({ pg: "70", isian: "abc", jodoh: "-5", essay: "30" });
    expect(w).toEqual({ pg: 70, isian: 0, jodoh: 0, essay: 30, total: 100 });
  });
});

describe("computeComposition", () => {
  const qs = [
    { tipe: "pg" as const, bobot: 1 },
    { tipe: "pg" as const, bobot: 1 },
    { tipe: "essay" as const, bobot: 3 },
  ];

  it("mode bobot_soal: persentase = proporsi bobot tiap tipe", () => {
    const c = computeComposition({
      questions: qs,
      weightMode: "bobot_soal",
      sourceMode: "manual",
      weights: weights(),
    });
    expect(c.totalBobot).toBe(5);
    expect(c.rows.find((r) => r.key === "pg")!.effectivePct).toBeCloseTo(40);
    expect(c.rows.find((r) => r.key === "essay")!.effectivePct).toBeCloseTo(60);
  });

  it("mode persen_tipe manual: dinormalisasi ke tipe yang hadir + poin per soal", () => {
    const c = computeComposition({
      questions: qs,
      weightMode: "persen_tipe",
      sourceMode: "manual",
      weights: weights(60, 20, 0, 20),
    });
    // isian 20% tidak punya soal -> pembagi 80
    expect(c.rows.find((r) => r.key === "pg")!.effectivePct).toBeCloseTo(75);
    expect(c.rows.find((r) => r.key === "essay")!.effectivePct).toBeCloseTo(25);
    expect(c.rows.find((r) => r.key === "pg")!.poinPerSoal).toBeCloseTo(37.5);
    expect(c.weightWithoutQuestions.map((r) => r.key)).toEqual(["isian"]);
  });

  it("memberi peringatan bila tipe terpilih punya persentase 0", () => {
    const c = computeComposition({
      questions: qs,
      weightMode: "persen_tipe",
      sourceMode: "manual",
      weights: weights(100, 0, 0, 0),
    });
    expect(c.missingWeightForSelected.map((r) => r.key)).toEqual(["essay"]);
  });
});

describe("buildAutoWeights & formatBobotTipeSummary", () => {
  it("selalu berjumlah 100 untuk tipe yang hadir", () => {
    const c = computeComposition({
      questions: [
        { tipe: "pg", bobot: 1 },
        { tipe: "pg", bobot: 1 },
        { tipe: "pg", bobot: 1 },
        { tipe: "essay", bobot: 1 },
      ],
      weightMode: "bobot_soal",
      sourceMode: "manual",
      weights: weights(),
    });
    const auto = buildAutoWeights(c.rows);
    expect(auto.pg + auto.isian + auto.jodoh + auto.essay).toBe(100);
  });

  it("meringkas bobot hanya tipe > 0", () => {
    expect(formatBobotTipeSummary({ pg: 70, essay: 30 })).toBe("PG 70% • Essay 30%");
    expect(formatBobotTipeSummary(null)).toBeNull();
  });
});
