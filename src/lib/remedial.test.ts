import { describe, expect, it } from "vitest";
import { aggregateGradesByStudent, type RawStudentAttempt } from "./remedial";

const att = (o: Partial<RawStudentAttempt> & { id: number }): RawStudentAttempt => ({
  student_id: "s1",
  attempt_ke: 1,
  status: "selesai",
  nilai: 0,
  nilai_sementara: null,
  mulai: "2026-01-01T00:00:00Z",
  selesai: "2026-01-01T01:00:00Z",
  profiles: { username: "01", nama: "Siswa A", classes: { nama: "X ATPH" } },
  ...o,
});

describe("aggregateGradesByStudent", () => {
  it("siswa di atas KKM = Tuntas, tidak perlu remedial", () => {
    const [g] = aggregateGradesByStudent([att({ id: 1, nilai: 80 })], 75);
    expect(g.keterangan).toBe("Tuntas");
    expect(g.needs_remedial).toBe(false);
  });

  it("siswa di bawah KKM tanpa remedial = Belum Tuntas & perlu remedial", () => {
    const [g] = aggregateGradesByStudent([att({ id: 1, nilai: 50 })], 75);
    expect(g.keterangan).toBe("Belum Tuntas");
    expect(g.needs_remedial).toBe(true);
  });

  it("aturan maks_kkm: remedial lulus dicap sebesar KKM", () => {
    const [g] = aggregateGradesByStudent(
      [att({ id: 1, nilai: 50 }), att({ id: 2, attempt_ke: 2, nilai: 95 })],
      75,
      "maks_kkm"
    );
    expect(g.nilai_akhir).toBe(75);
    expect(g.keterangan).toBe("Tuntas Remedial");
  });

  it("aturan nilai_terbaik: ambil nilai tertinggi", () => {
    const [g] = aggregateGradesByStudent(
      [att({ id: 1, nilai: 50 }), att({ id: 2, attempt_ke: 2, nilai: 95 })],
      75,
      "nilai_terbaik"
    );
    expect(g.nilai_akhir).toBe(95);
  });

  it("aturan nilai_terakhir: pakai nilai remedial walau lebih rendah", () => {
    const [g] = aggregateGradesByStudent(
      [att({ id: 1, nilai: 70 }), att({ id: 2, attempt_ke: 2, nilai: 60 })],
      75,
      "nilai_terakhir"
    );
    expect(g.nilai_akhir).toBe(60);
  });

  it("status menunggu_koreksi tidak dianggap perlu remedial", () => {
    const [g] = aggregateGradesByStudent(
      [att({ id: 1, status: "menunggu_koreksi", nilai: null, nilai_sementara: 40 })],
      75
    );
    expect(g.keterangan).toBe("Menunggu Koreksi");
    expect(g.needs_remedial).toBe(false);
  });
});
