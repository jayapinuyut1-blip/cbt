export const ESSAY_AI_BATCH_SIZE = 10;

export interface EssayAiItemInput {
  answerId: number;
  questionText: string;
  maxScore: number;
  rubric?: string;
  studentAnswer: string;
}

export interface EssayAiSuggestion {
  answerId: number;
  score: number;
  reason: string;
}

/** Bulatkan skor ke kelipatan 0.5 terdekat dan batasi pada rentang [0, maxScore]. */
export function roundHalfStep(score: number, maxScore: number): number {
  const safeMax = Number.isFinite(maxScore) && maxScore > 0 ? maxScore : 1;
  if (!Number.isFinite(score)) return 0;
  const clamped = Math.max(0, Math.min(safeMax, score));
  const rounded = Math.round(clamped * 2) / 2;
  return Math.min(safeMax, Math.max(0, rounded));
}

/**
 * Pisahkan jawaban kosong (langsung diberi skor 0 lokal tanpa memanggil API AI)
 * dan pecah jawaban berisi teks menjadi batch berukuran maksimal batchSize.
 */
export function partitionAndChunkEssays(
  items: EssayAiItemInput[],
  batchSize = ESSAY_AI_BATCH_SIZE
): {
  emptyAutoZero: EssayAiSuggestion[];
  batches: EssayAiItemInput[][];
} {
  const emptyAutoZero: EssayAiSuggestion[] = [];
  const nonEmpty: EssayAiItemInput[] = [];

  for (const item of items) {
    if (!item.studentAnswer || item.studentAnswer.trim() === "") {
      emptyAutoZero.push({
        answerId: item.answerId,
        score: 0,
        reason: "Siswa tidak mengisi jawaban.",
      });
    } else {
      nonEmpty.push({
        ...item,
        studentAnswer: item.studentAnswer.trim(),
      });
    }
  }

  const size = Math.max(1, batchSize);
  const batches: EssayAiItemInput[][] = [];
  for (let i = 0; i < nonEmpty.length; i += size) {
    batches.push(nonEmpty.slice(i, i + size));
  }

  return { emptyAutoZero, batches };
}

/** Validasi dan normalisasi array JSON hasil penilaian AI agar aman dipakai UI. */
export function normalizeAiGradingResponse(
  rawArray: unknown[],
  maxScoreByAnswerId: Map<number, number>
): EssayAiSuggestion[] {
  const seen = new Set<number>();
  const valid: EssayAiSuggestion[] = [];

  for (const entry of rawArray) {
    if (!entry || typeof entry !== "object") continue;
    const obj = entry as Record<string, unknown>;
    const answerId = Number(obj.answerId ?? obj.answer_id ?? obj.id);
    if (!Number.isFinite(answerId) || seen.has(answerId)) continue;
    const maxScore = maxScoreByAnswerId.get(answerId);
    if (maxScore === undefined) continue;

    const rawScore = Number(obj.score ?? obj.skor);
    if (Number.isNaN(rawScore)) continue;

    const reason = String(obj.reason ?? obj.alasan ?? "")
      .trim()
      .slice(0, 220);

    seen.add(answerId);
    valid.push({
      answerId,
      score: roundHalfStep(rawScore, maxScore),
      reason: reason || "Dinilai berdasarkan kesesuaian dengan pertanyaan.",
    });
  }

  return valid;
}

/** Susun prompt koreksi anonim (tanpa nama/NISN siswa) untuk Mode Prompt Gratis. */
export function buildFreeGradingPrompt(
  items: EssayAiItemInput[],
  subjectName: string
): string {
  const payload = items.map((it) => ({
    answerId: it.answerId,
    pertanyaan: it.questionText,
    bobot_maks: it.maxScore,
    rubrik_guru: it.rubric?.trim() || "(Belum diisi, nilai berdasarkan ketepatan konsep)",
    jawaban_siswa: it.studentAnswer,
  }));

  return `Anda adalah guru SMK profesional di Indonesia yang membantu mengoreksi jawaban essay siswa secara objektif, adil, dan konsisten.
Mata Pelajaran: ${subjectName || "Umum SMK"}

Aturan penilaian:
1. Berikan skor antara 0 sampai bobot_maks (kelipatan 0.5, contoh: 0, 1, 2.5, 4, 5).
2. Jika rubrik_guru tersedia, prioritaskan poin kunci pada rubrik tersebut.
3. Toleransi typo ringan atau bahasa sehari-hari selama konsep utamanya benar.
4. Berikan alasan singkat maksimal 1 kalimat dalam Bahasa Indonesia (tanpa tanda em dash).

Daftar jawaban anonim yang harus dinilai:
${JSON.stringify(payload, null, 2)}

PENTING: Kembalikan HANYA JSON array valid tanpa teks pembuka atau penutup dengan format:
[
  {"answerId": 101, "score": 4.5, "reason": "Menyebutkan 3 langkah inti dengan benar, kurang detail pada tahap akhir."}
]`;
}

/** Parse hasil JSON yang ditempel guru dari ChatGPT / Gemini Web. */
export function parsePastedGradingJson(
  raw: string,
  maxScoreByAnswerId: Map<number, number>
): { ok: true; results: EssayAiSuggestion[] } | { ok: false; error: string } {
  const cleaned = raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const candidates = [cleaned];
  const firstBracket = cleaned.indexOf("[");
  const lastBracket = cleaned.lastIndexOf("]");
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    candidates.push(cleaned.slice(firstBracket, lastBracket + 1));
  }

  for (const text of candidates) {
    try {
      const parsed = JSON.parse(text);
      const arr = Array.isArray(parsed)
        ? parsed
        : parsed &&
          typeof parsed === "object" &&
          Array.isArray((parsed as { results?: unknown[] }).results)
        ? (parsed as { results: unknown[] }).results
        : null;
      if (!arr) continue;
      const normalized = normalizeAiGradingResponse(arr, maxScoreByAnswerId);
      if (normalized.length > 0) {
        return { ok: true, results: normalized };
      }
      return {
        ok: false,
        error:
          "JSON terbaca, tetapi tidak ada answerId yang cocok dengan daftar jawaban essay pada ujian ini.",
      };
    } catch {
      // Coba kandidat berikutnya
    }
  }

  return {
    ok: false,
    error:
      "Format JSON tidak valid. Pastikan Anda menyalin seluruh tanda [ ... ] dari hasil AI.",
  };
}
