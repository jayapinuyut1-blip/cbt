import type { ExamTypeWeights, QuestionType } from "@/types/cbt";

/**
 * Logika murni (tanpa React) untuk komposisi & bobot persentase per tipe soal.
 * Dipisah dari halaman Kelola Ujian agar mudah diuji otomatis.
 */

export const QUESTION_TYPE_KEYS: QuestionType[] = [
  "pg",
  "isian",
  "jodoh",
  "essay",
];

export const QUESTION_TYPE_LABELS: Record<
  QuestionType,
  { label: string; shortLabel: string }
> = {
  pg: { label: "Pilihan Ganda", shortLabel: "PG" },
  isian: { label: "Isian Singkat", shortLabel: "Isian" },
  jodoh: { label: "Menjodohkan", shortLabel: "Jodoh" },
  essay: { label: "Essay / Uraian", shortLabel: "Essay" },
};

export type WeightMode = "bobot_soal" | "persen_tipe";
export type WeightSourceMode = "manual" | "acak";
export type WeightInputs = Record<QuestionType, string>;
export type ParsedWeights = Record<QuestionType, number> & { total: number };

export const WEIGHT_PRESETS: Array<{
  label: string;
  values: Record<QuestionType, number>;
}> = [
  { label: "70% PG : 30% Essay", values: { pg: 70, isian: 0, jodoh: 0, essay: 30 } },
  { label: "80% PG : 20% Essay", values: { pg: 80, isian: 0, jodoh: 0, essay: 20 } },
  { label: "50 / 15 / 15 / 20 (4 Tipe)", values: { pg: 50, isian: 15, jodoh: 15, essay: 20 } },
  { label: "60 / 20 / 20 (Objektif)", values: { pg: 60, isian: 20, jodoh: 20, essay: 0 } },
];

export function formatBobotTipeSummary(
  weights?: ExamTypeWeights | null
): string | null {
  if (!weights) return null;
  const parts = QUESTION_TYPE_KEYS.map((key) => {
    const val = Number(weights[key] ?? 0);
    return val > 0 ? `${QUESTION_TYPE_LABELS[key].shortLabel} ${val}%` : null;
  }).filter(Boolean);
  return parts.length > 0 ? parts.join(" • ") : null;
}

export function parseWeightInputs(inputs: WeightInputs): ParsedWeights {
  const num = (v: string) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
  };
  const pg = num(inputs.pg);
  const isian = num(inputs.isian);
  const jodoh = num(inputs.jodoh);
  const essay = num(inputs.essay);
  const total = Math.round((pg + isian + jodoh + essay) * 100) / 100;
  return { pg, isian, jodoh, essay, total };
}

export function weightsToInputs(values: Record<QuestionType, number>): WeightInputs {
  return {
    pg: String(values.pg),
    isian: String(values.isian),
    jodoh: String(values.jodoh),
    essay: String(values.essay),
  };
}

export interface CompositionQuestion {
  tipe: QuestionType;
  bobot: number | string | null | undefined;
}

export interface CompositionRow {
  key: QuestionType;
  label: string;
  shortLabel: string;
  count: number;
  sumBobot: number;
  bobotPct: number;
  configuredPct: number;
  effectivePct: number;
  poinPerSoal: number | null;
}

export interface Composition {
  totalCount: number;
  totalBobot: number;
  rows: CompositionRow[];
  missingWeightForSelected: CompositionRow[];
  weightWithoutQuestions: CompositionRow[];
}

export function computeComposition(args: {
  questions: CompositionQuestion[];
  weightMode: WeightMode;
  sourceMode: WeightSourceMode;
  weights: ParsedWeights;
}): Composition {
  const { questions, weightMode, sourceMode, weights } = args;

  const counts: Record<QuestionType, number> = { pg: 0, isian: 0, jodoh: 0, essay: 0 };
  const bobots: Record<QuestionType, number> = { pg: 0, isian: 0, jodoh: 0, essay: 0 };
  let totalCount = 0;
  let totalBobot = 0;

  for (const q of questions) {
    counts[q.tipe] += 1;
    const b = Number(q.bobot) || 1;
    bobots[q.tipe] += b;
    totalCount += 1;
    totalBobot += b;
  }

  const activeCustomPctSum = QUESTION_TYPE_KEYS.reduce(
    (acc, key) => acc + (counts[key] > 0 ? weights[key] : 0),
    0
  );

  const rows: CompositionRow[] = QUESTION_TYPE_KEYS.map((key) => {
    const count = counts[key];
    const sumBobot = bobots[key];
    const bobotPct = totalBobot > 0 ? (sumBobot / totalBobot) * 100 : 0;
    const configuredPct = weights[key];
    let effectivePct = bobotPct;
    if (weightMode === "persen_tipe") {
      if (sourceMode === "manual") {
        effectivePct =
          count > 0 && activeCustomPctSum > 0
            ? (configuredPct / activeCustomPctSum) * 100
            : 0;
      } else {
        effectivePct =
          weights.total > 0 ? (configuredPct / weights.total) * 100 : 0;
      }
    }
    const poinPerSoal =
      sourceMode === "manual" && count > 0 ? effectivePct / count : null;

    return {
      key,
      label: QUESTION_TYPE_LABELS[key].label,
      shortLabel: QUESTION_TYPE_LABELS[key].shortLabel,
      count,
      sumBobot,
      bobotPct,
      configuredPct,
      effectivePct,
      poinPerSoal,
    };
  });

  const custom = weightMode === "persen_tipe" && sourceMode === "manual";
  return {
    totalCount,
    totalBobot,
    rows,
    missingWeightForSelected: custom
      ? rows.filter((r) => r.count > 0 && r.configuredPct <= 0)
      : [],
    weightWithoutQuestions: custom
      ? rows.filter((r) => r.count === 0 && r.configuredPct > 0)
      : [],
  };
}

/** Bagi 100% sesuai proporsi bobot tipe yang hadir; sisa pembulatan ke tipe terakhir. */
export function buildAutoWeights(rows: CompositionRow[]): Record<QuestionType, number> {
  const next: Record<QuestionType, number> = { pg: 0, isian: 0, jodoh: 0, essay: 0 };
  const present = rows.filter((r) => r.count > 0);
  let assigned = 0;
  present.forEach((r, idx) => {
    if (idx === present.length - 1) {
      next[r.key] = Math.max(0, Math.round(100 - assigned));
    } else {
      const val = Math.round(r.bobotPct);
      next[r.key] = val;
      assigned += val;
    }
  });
  return next;
}
