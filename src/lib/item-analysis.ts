import type { QuestionType } from "@/types/cbt";

/** Logika murni Analisis Butir Soal (dipisah dari halaman agar bisa diuji otomatis). */

export type DifficultyCategory = "Mudah" | "Sedang" | "Sulit" | "Belum Dinilai";

export interface AnalysisAnswerRow {
  question_id: number;
  jawaban: {
    option_id?: number | null;
    text?: string;
    pairs?: Record<string, string>;
  } | null;
  skor: number | null;
  questions: {
    id: number;
    teks: string;
    bobot: number;
    tipe: QuestionType;
    question_options?: Array<{
      id: number;
      urutan: number;
      teks: string;
      pasangan: string | null;
      benar: boolean;
    }>;
  } | null;
}

export interface QuestionItemAnalysis {
  question_id: number;
  tipe: QuestionType;
  teks: string;
  bobot: number;
  responden: number;
  gradedCount: number;
  benarPenuh: number;
  parsial: number;
  salah: number;
  belumDinilai: number;
  tingkatPenguasaan: number | null; // 0..100
  kategori: DifficultyCategory;
  optionStats: Array<{
    id: number;
    letter: string;
    teks: string;
    benar: boolean;
    pickedCount: number;
    pickedPct: number;
  }>;
  topDistractor: { letter: string; pickedPct: number } | null;
}

/** >75% Mudah, 30–75% Sedang, <30% Sulit. */
export function classifyDifficulty(pct: number | null): DifficultyCategory {
  if (pct === null) return "Belum Dinilai";
  if (pct > 75) return "Mudah";
  if (pct >= 30) return "Sedang";
  return "Sulit";
}

export function analyzeItems(rows: AnalysisAnswerRow[]): QuestionItemAnalysis[] {
  const grouped = new Map<
    number,
    { q: NonNullable<AnalysisAnswerRow["questions"]>; rows: AnalysisAnswerRow[] }
  >();

  for (const row of rows) {
    if (!row.questions) continue;
    const existing = grouped.get(row.question_id);
    if (existing) existing.rows.push(row);
    else grouped.set(row.question_id, { q: row.questions, rows: [row] });
  }

  const result: QuestionItemAnalysis[] = [];
  for (const [qid, { q, rows: group }] of grouped.entries()) {
    const bobot = Number(q.bobot) || 1;
    const responden = group.length;
    let gradedCount = 0;
    let benarPenuh = 0;
    let parsial = 0;
    let salah = 0;
    let belumDinilai = 0;
    let ratioSum = 0;
    const optionPickCounts = new Map<number, number>();

    for (const r of group) {
      if (q.tipe === "pg" && r.jawaban?.option_id != null) {
        const oid = Number(r.jawaban.option_id);
        optionPickCounts.set(oid, (optionPickCounts.get(oid) || 0) + 1);
      }
      if (r.skor === null || r.skor === undefined) {
        belumDinilai += 1;
      } else {
        gradedCount += 1;
        const sc = Number(r.skor);
        ratioSum += Math.min(1, Math.max(0, sc / bobot));
        if (sc >= bobot - 0.01) benarPenuh += 1;
        else if (sc > 0) parsial += 1;
        else salah += 1;
      }
    }

    const tingkatPenguasaan =
      gradedCount > 0 ? Math.round((ratioSum / gradedCount) * 1000) / 10 : null;

    const sortedOpts = [...(q.question_options || [])].sort(
      (a, b) => a.urutan - b.urutan
    );
    const optionStats =
      q.tipe === "pg"
        ? sortedOpts.map((opt, idx) => {
            const pickedCount = optionPickCounts.get(opt.id) || 0;
            return {
              id: opt.id,
              letter: String.fromCharCode(65 + idx),
              teks: opt.teks,
              benar: opt.benar,
              pickedCount,
              pickedPct:
                responden > 0
                  ? Math.round((pickedCount / responden) * 1000) / 10
                  : 0,
            };
          })
        : [];

    const wrong = optionStats
      .filter((o) => !o.benar && o.pickedCount > 0)
      .sort((a, b) => b.pickedCount - a.pickedCount);
    const topDistractor =
      wrong[0] && wrong[0].pickedPct >= 25
        ? { letter: wrong[0].letter, pickedPct: wrong[0].pickedPct }
        : null;

    result.push({
      question_id: qid,
      tipe: q.tipe,
      teks: q.teks,
      bobot,
      responden,
      gradedCount,
      benarPenuh,
      parsial,
      salah,
      belumDinilai,
      tingkatPenguasaan,
      kategori: classifyDifficulty(tingkatPenguasaan),
      optionStats,
      topDistractor,
    });
  }

  return result.sort((a, b) => a.question_id - b.question_id);
}

export function summarizeAnalysis(items: QuestionItemAnalysis[]) {
  const graded = items.filter((i) => i.tingkatPenguasaan !== null);
  return {
    total: items.length,
    mudah: items.filter((i) => i.kategori === "Mudah").length,
    sedang: items.filter((i) => i.kategori === "Sedang").length,
    sulit: items.filter((i) => i.kategori === "Sulit").length,
    avgPenguasaan:
      graded.length > 0
        ? Math.round(
            (graded.reduce((a, i) => a + (i.tingkatPenguasaan || 0), 0) /
              graded.length) *
              10
          ) / 10
        : null,
  };
}
