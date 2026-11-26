import * as XLSX from "xlsx";
import type { GeneratedQuestion } from "@/app/api/guru/generate-questions/route";

export const BATCH_SIZE = 10; // Maks 10 soal per gelombang antrian agar cepat & tidak timeout Vercel
export const MAX_PER_TYPE = 50; // Maks 50 per tipe soal

export interface BatchQueueItem {
  id: number;
  label: string;
  countPg: number;
  countIsian: number;
  countJodoh: number;
  countEssay: number;
  total: number;
  status: "queued" | "running" | "done" | "error" | "cancelled";
  generatedCount?: number;
  errorMsg?: string;
}

export function clampQuestionCount(val: string | number): number {
  const n = Number(val);
  if (Number.isNaN(n) || n < 0) return 0;
  return Math.min(MAX_PER_TYPE, Math.floor(n));
}

export function buildBatches(
  pg: number,
  isian: number,
  jodoh: number,
  essay: number
): BatchQueueItem[] {
  const batches: BatchQueueItem[] = [];
  let idCounter = 1;

  const addTypeBatches = (
    typeKey: "pg" | "isian" | "jodoh" | "essay",
    typeLabel: string,
    total: number
  ) => {
    let remaining = total;
    while (remaining > 0) {
      const take = Math.min(BATCH_SIZE, remaining);
      batches.push({
        id: idCounter++,
        label: `${take} ${typeLabel}`,
        countPg: typeKey === "pg" ? take : 0,
        countIsian: typeKey === "isian" ? take : 0,
        countJodoh: typeKey === "jodoh" ? take : 0,
        countEssay: typeKey === "essay" ? take : 0,
        total: take,
        status: "queued",
      });
      remaining -= take;
    }
  };

  // Jika total semua tipe <= BATCH_SIZE, gabungkan jadi 1 batch super cepat!
  const grandTotal = pg + isian + jodoh + essay;
  if (grandTotal > 0 && grandTotal <= BATCH_SIZE) {
    const parts: string[] = [];
    if (pg > 0) parts.push(`${pg} PG`);
    if (isian > 0) parts.push(`${isian} Isian`);
    if (jodoh > 0) parts.push(`${jodoh} Jodoh`);
    if (essay > 0) parts.push(`${essay} Essay`);
    return [
      {
        id: 1,
        label: parts.join(", "),
        countPg: pg,
        countIsian: isian,
        countJodoh: jodoh,
        countEssay: essay,
        total: grandTotal,
        status: "queued",
      },
    ];
  }

  addTypeBatches("pg", "Pilihan Ganda", pg);
  addTypeBatches("isian", "Isian Singkat", isian);
  addTypeBatches("jodoh", "Menjodohkan", jodoh);
  addTypeBatches("essay", "Essay", essay);

  return batches;
}

export function buildCopyablePrompt(params: {
  subjectName: string;
  gradeLabel: string;
  difficulty: string;
  selectedCps: Array<{ elemen: string; deskripsi: string }>;
  topic: string;
  countPg: number;
  countIsian: number;
  countJodoh: number;
  countEssay: number;
}): string {
  const cpLines =
    params.selectedCps.length > 0
      ? params.selectedCps
          .map((cp, i) => `${i + 1}. [${cp.elemen}] ${cp.deskripsi}`)
          .join("\n")
      : "(Sesuai topik di bawah)";

  return `Buatkan soal ujian CBT dalam Bahasa Indonesia sesuai Kurikulum Merdeka SMK:
- Mata Pelajaran: ${params.subjectName}
- Jenjang / Kelas: ${params.gradeLabel}
- Tingkat Kesulitan: ${params.difficulty}
- Capaian Pembelajaran (CP):
${cpLines}
${params.topic.trim() ? `- Topik / Catatan Khusus: ${params.topic.trim()}` : ""}

Jumlah soal:
- Pilihan Ganda (pg): ${params.countPg} soal (5 opsi A-E, 1 benar, bobot 1)
- Isian Singkat (isian): ${params.countIsian} soal (1-2 variasi kunci, bobot 2)
- Menjodohkan (jodoh): ${params.countJodoh} soal (3-4 pasangan kiri & kanan, bobot 3)
- Essay (essay): ${params.countEssay} soal (bobot 5)

PENTING: Keluarkan HANYA JSON array valid (tanpa teks pembuka/penutup) persis mengikuti format ini:
[
  {"tipe":"pg","teks":"Pertanyaan...","bobot":1,"opsi_pg":[{"teks":"Opsi A","benar":false},{"teks":"Opsi B","benar":true},{"teks":"Opsi C","benar":false},{"teks":"Opsi D","benar":false},{"teks":"Opsi E","benar":false}]},
  {"tipe":"isian","teks":"Pertanyaan...","bobot":2,"kunci_isian":["jawaban 1","jawaban 2"]},
  {"tipe":"jodoh","teks":"Pasangkan item berikut:","bobot":3,"pasangan_jodoh":[{"kiri":"Item 1","kanan":"Pasangan 1"},{"kiri":"Item 2","kanan":"Pasangan 2"}]},
  {"tipe":"essay","teks":"Pertanyaan uraian...","bobot":5}
]`;
}

export function parsePastedAiJson(
  raw: string
): { ok: true; questions: GeneratedQuestion[] } | { ok: false; error: string } {
  try {
    const cleaned = raw
      .trim()
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "");
    const arr = JSON.parse(cleaned);
    if (!Array.isArray(arr) || arr.length === 0) {
      return {
        ok: false,
        error: "Format harus berupa JSON array [...] berisi minimal 1 soal.",
      };
    }
    return { ok: true, questions: arr as GeneratedQuestion[] };
  } catch {
    return {
      ok: false,
      error:
        "JSON tidak valid. Pastikan Anda menyalin seluruh tanda [ ... ] dari hasil ChatGPT/Gemini.",
    };
  }
}

export function buildExcelWorkbookFromGenerated(
  items: GeneratedQuestion[],
  sheetName = "Bank Soal"
) {
  const letters = ["A", "B", "C", "D", "E"];
  const rows = items.map((q) => {
    if (q.tipe === "pg") {
      const opts = q.opsi_pg || [];
      const kunciIdx = opts.findIndex((o) => o.benar);
      return {
        Tipe: "pg",
        Pertanyaan: q.teks,
        Bobot: q.bobot,
        Opsi_A: opts[0]?.teks || "",
        Opsi_B: opts[1]?.teks || "",
        Opsi_C: opts[2]?.teks || "",
        Opsi_D: opts[3]?.teks || "",
        Opsi_E: opts[4]?.teks || "",
        Kunci: kunciIdx >= 0 ? letters[kunciIdx] : "A",
        Pasangan: "",
      };
    }
    if (q.tipe === "isian") {
      return {
        Tipe: "isian",
        Pertanyaan: q.teks,
        Bobot: q.bobot,
        Opsi_A: "",
        Opsi_B: "",
        Opsi_C: "",
        Opsi_D: "",
        Opsi_E: "",
        Kunci: (q.kunci_isian || []).join("|"),
        Pasangan: "",
      };
    }
    if (q.tipe === "jodoh") {
      return {
        Tipe: "jodoh",
        Pertanyaan: q.teks,
        Bobot: q.bobot,
        Opsi_A: "",
        Opsi_B: "",
        Opsi_C: "",
        Opsi_D: "",
        Opsi_E: "",
        Kunci: "",
        Pasangan: (q.pasangan_jodoh || [])
          .map((p) => `${p.kiri}=${p.kanan}`)
          .join("|"),
      };
    }
    return {
      Tipe: "essay",
      Pertanyaan: q.teks,
      Bobot: q.bobot,
      Opsi_A: "",
      Opsi_B: "",
      Opsi_C: "",
      Opsi_D: "",
      Opsi_E: "",
      Kunci: "",
      Pasangan: "",
    };
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [
    { wch: 10 },
    { wch: 52 },
    { wch: 8 },
    { wch: 24 },
    { wch: 24 },
    { wch: 24 },
    { wch: 24 },
    { wch: 24 },
    { wch: 22 },
    { wch: 40 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return wb;
}
