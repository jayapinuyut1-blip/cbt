import type { QuestionType } from "@/types/cbt";

/**
 * Cermin (mirror) rumus penilaian di PostgreSQL `recalculate_attempt_score`.
 * Fungsi ini dipakai sebagai spesifikasi yang diuji otomatis, sehingga bila rumus
 * di SQL diubah, tes ini mengingatkan agar kedua sisi tetap konsisten.
 */

export interface TypeScore {
  earned: number;
  max: number;
}

export type TypeScores = Record<QuestionType, TypeScore>;
export type TypePercents = Partial<Record<QuestionType, number>>;

const KEYS: QuestionType[] = ["pg", "isian", "jodoh", "essay"];
const OBJECTIVE: QuestionType[] = ["pg", "isian", "jodoh"];

const clamp = (n: number) => Math.min(100, Math.max(0, n));
const round2 = (n: number) => Math.round(n * 100) / 100;

export interface ComputedScore {
  /** null bila masih ada essay yang belum dikoreksi */
  nilai: number | null;
  nilaiSementara: number;
  status: "selesai" | "menunggu_koreksi";
}

export function computeAttemptScore(args: {
  scores: TypeScores;
  percents: TypePercents | null;
  hasUngradedEssay: boolean;
}): ComputedScore {
  const { scores, percents, hasUngradedEssay } = args;
  const totalMax = KEYS.reduce((a, k) => a + scores[k].max, 0);
  const totalEarned = KEYS.reduce((a, k) => a + scores[k].earned, 0);
  const objEarned = OBJECTIVE.reduce((a, k) => a + scores[k].earned, 0);

  const pct = (k: QuestionType) => Math.max(0, Number(percents?.[k] ?? 0));
  const activePct = percents
    ? KEYS.reduce((a, k) => a + (scores[k].max > 0 ? pct(k) : 0), 0)
    : 0;

  if (percents && activePct > 0) {
    const ratio = (k: QuestionType) =>
      scores[k].max > 0 ? (scores[k].earned / scores[k].max) * pct(k) : 0;
    const weightedObj = OBJECTIVE.reduce((a, k) => a + ratio(k), 0);
    const weightedTotal = weightedObj + ratio("essay");
    return {
      nilaiSementara: clamp(round2((weightedObj / activePct) * 100)),
      nilai: hasUngradedEssay ? null : clamp(round2((weightedTotal / activePct) * 100)),
      status: hasUngradedEssay ? "menunggu_koreksi" : "selesai",
    };
  }

  return {
    nilaiSementara: totalMax > 0 ? round2((objEarned / totalMax) * 100) : 0,
    nilai: hasUngradedEssay ? null : totalMax > 0 ? round2((totalEarned / totalMax) * 100) : 0,
    status: hasUngradedEssay ? "menunggu_koreksi" : "selesai",
  };
}
