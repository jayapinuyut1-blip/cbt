import { describe, expect, it } from "vitest";
import { computeAttemptScore, type TypeScores } from "./scoring";

const scores = (o: Partial<TypeScores> = {}): TypeScores => ({
  pg: { earned: 0, max: 0 },
  isian: { earned: 0, max: 0 },
  jodoh: { earned: 0, max: 0 },
  essay: { earned: 0, max: 0 },
  ...o,
});

describe("computeAttemptScore - mode bobot per soal (default)", () => {
  it("menghitung proporsional dari total bobot", () => {
    const r = computeAttemptScore({
      scores: scores({ pg: { earned: 3, max: 5 }, essay: { earned: 5, max: 10 } }),
      percents: null,
      hasUngradedEssay: false,
    });
    expect(r.nilai).toBe(53.33);
    expect(r.status).toBe("selesai");
  });

  it("nilai akhir null & status menunggu_koreksi jika essay belum dinilai", () => {
    const r = computeAttemptScore({
      scores: scores({ pg: { earned: 4, max: 5 }, essay: { earned: 0, max: 5 } }),
      percents: null,
      hasUngradedEssay: true,
    });
    expect(r.nilai).toBeNull();
    expect(r.nilaiSementara).toBe(40);
    expect(r.status).toBe("menunggu_koreksi");
  });

  it("aman bila tidak ada soal (total bobot 0)", () => {
    const r = computeAttemptScore({ scores: scores(), percents: null, hasUngradedEssay: false });
    expect(r.nilai).toBe(0);
  });
});

describe("computeAttemptScore - mode persentase per tipe", () => {
  it("70% PG : 30% Essay, semua benar = 100", () => {
    const r = computeAttemptScore({
      scores: scores({ pg: { earned: 10, max: 10 }, essay: { earned: 20, max: 20 } }),
      percents: { pg: 70, essay: 30 },
      hasUngradedEssay: false,
    });
    expect(r.nilai).toBe(100);
  });

  it("PG penuh + essay nol = 70", () => {
    const r = computeAttemptScore({
      scores: scores({ pg: { earned: 10, max: 10 }, essay: { earned: 0, max: 20 } }),
      percents: { pg: 70, essay: 30 },
      hasUngradedEssay: false,
    });
    expect(r.nilai).toBe(70);
  });

  it("bobot soal tidak mempengaruhi porsi tipe", () => {
    const a = computeAttemptScore({
      scores: scores({ pg: { earned: 5, max: 10 }, essay: { earned: 5, max: 10 } }),
      percents: { pg: 40, essay: 60 },
      hasUngradedEssay: false,
    });
    const b = computeAttemptScore({
      scores: scores({ pg: { earned: 50, max: 100 }, essay: { earned: 1, max: 2 } }),
      percents: { pg: 40, essay: 60 },
      hasUngradedEssay: false,
    });
    expect(a.nilai).toBe(50);
    expect(b.nilai).toBe(50);
  });

  it("tipe yang tidak ada di ujian dinormalisasi (tidak merugikan siswa)", () => {
    // Persentase isian 20% tetapi tidak ada soal isian -> dinormalisasi ke tipe yang hadir
    const r = computeAttemptScore({
      scores: scores({ pg: { earned: 10, max: 10 } }),
      percents: { pg: 60, isian: 20, essay: 20 },
      hasUngradedEssay: false,
    });
    expect(r.nilai).toBe(100);
  });

  it("nilai sementara = porsi tipe objektif dari total (batas bawah) saat essay belum dinilai", () => {
    // PG 70% penuh, essay 30% belum dinilai -> sementara 70 (sama logikanya dengan mode default)
    const r = computeAttemptScore({
      scores: scores({ pg: { earned: 10, max: 10 }, essay: { earned: 0, max: 20 } }),
      percents: { pg: 70, essay: 30 },
      hasUngradedEssay: true,
    });
    expect(r.nilai).toBeNull();
    expect(r.nilaiSementara).toBe(70);
  });

  it("jika semua persentase 0, fallback ke mode bobot per soal", () => {
    const r = computeAttemptScore({
      scores: scores({ pg: { earned: 5, max: 10 } }),
      percents: { pg: 0, essay: 0 },
      hasUngradedEssay: false,
    });
    expect(r.nilai).toBe(50);
  });
});
