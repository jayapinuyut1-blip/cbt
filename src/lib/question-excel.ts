import * as XLSX from "xlsx";
import type { Question, QuestionType } from "@/types/cbt";

export interface ParsedExcelOption {
  urutan: number;
  teks: string;
  pasangan: string | null;
  benar: boolean;
}

export interface ParsedExcelQuestion {
  tipe: QuestionType;
  teks: string;
  bobot: number;
  options: ParsedExcelOption[];
}

export interface ExcelQuestionRow {
  Tipe: string;
  Pertanyaan: string;
  Bobot: number;
  Opsi_A: string;
  Opsi_B: string;
  Opsi_C: string;
  Opsi_D: string;
  Opsi_E: string;
  Kunci: string;
  Pasangan: string;
}

const LETTERS = ["A", "B", "C", "D", "E"] as const;

export function buildQuestionTemplateWorkbook(): XLSX.WorkBook {
  const sample: ExcelQuestionRow[] = [
    {
      Tipe: "pg",
      Pertanyaan: "Apa tujuan utama pengolahan tanah sebelum penanaman?",
      Bobot: 1,
      Opsi_A: "Membunuh semua mikroba tanah",
      Opsi_B: "Menggemburkan tanah dan memperbaiki aerasi",
      Opsi_C: "Mengurangi kadar air secara drastis",
      Opsi_D: "Memadatkan lapisan tanah",
      Opsi_E: "Mengubah warna tanah",
      Kunci: "B",
      Pasangan: "",
    },
    {
      Tipe: "pg",
      Pertanyaan:
        "Teknik pembiakan vegetatif dengan menyambung pucuk batang atas dan batang bawah disebut...",
      Bobot: 1,
      Opsi_A: "Mencangkok",
      Opsi_B: "Menyetek",
      Opsi_C: "Mengenten (Grafting)",
      Opsi_D: "Merunduk",
      Opsi_E: "Okulasi",
      Kunci: "C",
      Pasangan: "",
    },
    {
      Tipe: "isian",
      Pertanyaan:
        "Proses pembuatan makanan pada tumbuhan dengan bantuan cahaya matahari disebut...",
      Bobot: 2,
      Opsi_A: "",
      Opsi_B: "",
      Opsi_C: "",
      Opsi_D: "",
      Opsi_E: "",
      Kunci: "fotosintesis|photosynthesis",
      Pasangan: "",
    },
    {
      Tipe: "jodoh",
      Pertanyaan: "Pasangkan jenis pupuk berikut dengan unsur hara utamanya:",
      Bobot: 3,
      Opsi_A: "",
      Opsi_B: "",
      Opsi_C: "",
      Opsi_D: "",
      Opsi_E: "",
      Kunci: "",
      Pasangan: "Urea=Nitrogen|SP-36=Fosfor|KCl=Kalium",
    },
    {
      Tipe: "essay",
      Pertanyaan:
        "Jelaskan langkah-langkah penyemaian benih tanaman hortikultura yang baik!",
      Bobot: 5,
      Opsi_A: "",
      Opsi_B: "",
      Opsi_C: "",
      Opsi_D: "",
      Opsi_E: "",
      Kunci: "",
      Pasangan: "",
    },
  ];

  const ws = XLSX.utils.json_to_sheet(sample);
  ws["!cols"] = [
    { wch: 10 },
    { wch: 52 },
    { wch: 8 },
    { wch: 24 },
    { wch: 24 },
    { wch: 24 },
    { wch: 24 },
    { wch: 24 },
    { wch: 24 },
    { wch: 42 },
  ];

  const guide = [
    {
      Kolom: "Tipe",
      Keterangan:
        "Wajib diisi salah satu: pg | isian | jodoh | essay (huruf kecil).",
    },
    {
      Kolom: "Pertanyaan",
      Keterangan:
        "Teks soal lengkap. Jika soal butuh gambar, tambahkan gambar setelah impor.",
    },
    {
      Kolom: "Bobot",
      Keterangan:
        "Angka bobot nilai soal (contoh: PG=1, Isian=2, Jodoh=3, Essay=5).",
    },
    {
      Kolom: "Opsi_A s.d. Opsi_E",
      Keterangan:
        "Khusus tipe pg. Kosongkan Opsi_E jika hanya 4 pilihan (A-D).",
    },
    {
      Kolom: "Kunci",
      Keterangan:
        "Untuk pg: isi huruf A/B/C/D/E. Untuk isian: isi kunci jawaban, pisahkan variasi dengan tanda | (contoh: fotosintesis|photosynthesis).",
    },
    {
      Kolom: "Pasangan",
      Keterangan:
        "Khusus tipe jodoh: format Kiri=Kanan dan pisahkan antar pasangan dengan | (contoh: Urea=Nitrogen|KCl=Kalium).",
    },
    {
      Kolom: "Tips",
      Keterangan:
        "Jangan ubah nama judul kolom di baris pertama sheet 'Template Soal'.",
    },
  ];
  const wsGuide = XLSX.utils.json_to_sheet(guide);
  wsGuide["!cols"] = [{ wch: 20 }, { wch: 95 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Template Soal");
  XLSX.utils.book_append_sheet(wb, wsGuide, "Panduan Pengisian");
  return wb;
}

export function questionsToExcelRows(questions: Question[]): ExcelQuestionRow[] {
  return questions.map((q) => {
    const opts = q.question_options || [];
    if (q.tipe === "pg") {
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
        Kunci: kunciIdx >= 0 ? LETTERS[kunciIdx] : "",
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
        Kunci: opts.map((o) => o.teks).join("|"),
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
        Pasangan: opts.map((o) => `${o.teks}=${o.pasangan || ""}`).join("|"),
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
}

export function buildQuestionExportWorkbook(questions: Question[]): XLSX.WorkBook {
  const ws = XLSX.utils.json_to_sheet(questionsToExcelRows(questions));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Bank Soal");
  return wb;
}

/** Parsing murni baris Excel menjadi daftar soal siap simpan ke Supabase. */
export function parseExcelQuestionRows(
  rows: Record<string, unknown>[]
): ParsedExcelQuestion[] {
  const result: ParsedExcelQuestion[] = [];

  for (const r of rows) {
    const rawTipe = String(r.Tipe ?? r.tipe ?? "pg")
      .trim()
      .toLowerCase() as QuestionType;
    if (!["pg", "isian", "jodoh", "essay"].includes(rawTipe)) continue;
    const pertanyaan = String(r.Pertanyaan ?? r.pertanyaan ?? "").trim();
    if (!pertanyaan) continue;
    const qBobot = Number(r.Bobot ?? r.bobot ?? 1) || 1;

    const options: ParsedExcelOption[] = [];

    if (rawTipe === "pg") {
      const kunci = String(r.Kunci ?? r.kunci ?? "A")
        .trim()
        .toUpperCase();
      LETTERS.forEach((L, idx) => {
        const val = String(
          r[`Opsi_${L}`] ?? r[`opsi_${L.toLowerCase()}`] ?? ""
        ).trim();
        if (val) {
          options.push({
            urutan: idx + 1,
            teks: val,
            pasangan: null,
            benar: kunci === L,
          });
        }
      });
    } else if (rawTipe === "isian") {
      const keys = String(r.Kunci ?? r.kunci ?? "")
        .split("|")
        .map((k) => k.trim())
        .filter(Boolean);
      keys.forEach((k, idx) => {
        options.push({
          urutan: idx + 1,
          teks: k,
          pasangan: null,
          benar: true,
        });
      });
    } else if (rawTipe === "jodoh") {
      const pairs = String(r.Pasangan ?? r.pasangan ?? "")
        .split("|")
        .map((p) => p.trim())
        .filter(Boolean);
      pairs.forEach((pair, idx) => {
        const [kiri, kanan] = pair.split("=").map((x) => x.trim());
        if (kiri && kanan) {
          options.push({
            urutan: idx + 1,
            teks: kiri,
            pasangan: kanan,
            benar: true,
          });
        }
      });
    }

    result.push({
      tipe: rawTipe,
      teks: pertanyaan,
      bobot: qBobot,
      options,
    });
  }

  return result;
}
