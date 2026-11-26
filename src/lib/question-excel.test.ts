import { describe, expect, it } from "vitest";
import { parseExcelQuestionRows, questionsToExcelRows } from "./question-excel";
import type { Question } from "@/types/cbt";

describe("question-excel helpers", () => {
  it("mem-parsing 4 tipe soal (pg, isian, jodoh, essay) dan mengabaikan baris tidak valid", () => {
    const parsed = parseExcelQuestionRows([
      {
        Tipe: "pg",
        Pertanyaan: "2 + 2 = ?",
        Bobot: 1,
        Opsi_A: "3",
        Opsi_B: "4",
        Opsi_C: "5",
        Kunci: "b",
      },
      {
        tipe: "isian",
        pertanyaan: "Ibu kota Sulawesi Utara?",
        bobot: 2,
        kunci: "Manado | Kota Manado",
      },
      {
        Tipe: "jodoh",
        Pertanyaan: "Pasangkan pupuk:",
        Bobot: 3,
        Pasangan: "Urea=Nitrogen|KCl=Kalium",
      },
      {
        Tipe: "essay",
        Pertanyaan: "Jelaskan fotosintesis.",
        Bobot: 5,
      },
      {
        Tipe: "unknown",
        Pertanyaan: "Harus diabaikan",
      },
      {
        Tipe: "pg",
        Pertanyaan: "   ",
      },
    ]);

    expect(parsed).toHaveLength(4);
    expect(parsed[0].tipe).toBe("pg");
    expect(parsed[0].options).toHaveLength(3);
    expect(parsed[0].options[1].benar).toBe(true);
    expect(parsed[1].options.map((o) => o.teks)).toEqual(["Manado", "Kota Manado"]);
    expect(parsed[2].options).toEqual([
      { urutan: 1, teks: "Urea", pasangan: "Nitrogen", benar: true },
      { urutan: 2, teks: "KCl", pasangan: "Kalium", benar: true },
    ]);
    expect(parsed[3]).toEqual({
      tipe: "essay",
      teks: "Jelaskan fotosintesis.",
      bobot: 5,
      options: [],
    });
  });

  it("mengonversi bank soal menjadi baris ekspor Excel secara akurat", () => {
    const sample: Question[] = [
      {
        id: 1,
        subject_id: 1,
        guru_id: null,
        tipe: "pg",
        teks: "Contoh PG",
        gambar: null,
        bobot: 1,
        created_at: "",
        question_options: [
          { id: 1, question_id: 1, urutan: 1, teks: "Salah", pasangan: null, benar: false },
          { id: 2, question_id: 1, urutan: 2, teks: "Benar", pasangan: null, benar: true },
        ],
      },
      {
        id: 2,
        subject_id: 1,
        guru_id: null,
        tipe: "jodoh",
        teks: "Contoh Jodoh",
        gambar: null,
        bobot: 3,
        created_at: "",
        question_options: [
          { id: 3, question_id: 2, urutan: 1, teks: "A", pasangan: "1", benar: true },
          { id: 4, question_id: 2, urutan: 2, teks: "B", pasangan: "2", benar: true },
        ],
      },
    ];

    const rows = questionsToExcelRows(sample);
    expect(rows[0].Kunci).toBe("B");
    expect(rows[0].Opsi_B).toBe("Benar");
    expect(rows[1].Pasangan).toBe("A=1|B=2");
  });
});
