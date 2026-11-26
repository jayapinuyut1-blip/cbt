import { describe, expect, it } from "vitest";
import { shouldBlockConcurrentStudentLogin } from "./session-guard";

describe("shouldBlockConcurrentStudentLogin (Smart Session Lock)", () => {
  const baseStart = "2026-11-26T01:00:00.000Z";
  const duringExam = new Date("2026-11-26T01:30:00.000Z").getTime(); // 30 mnt berjalan
  const afterExam = new Date("2026-11-26T03:05:00.000Z").getTime(); // lewat 120 mnt

  it("tidak pernah memblokir guru atau admin", () => {
    expect(
      shouldBlockConcurrentStudentLogin({
        role: "guru",
        activeSessionId: "sess-1",
        existingCookie: null,
        activeAttempt: { mulai: baseStart, durasiMenit: 120 },
        nowMs: duringExam,
      })
    ).toBe(false);
  });

  it("mengizinkan siswa yang belum punya active_session_id", () => {
    expect(
      shouldBlockConcurrentStudentLogin({
        role: "siswa",
        activeSessionId: null,
        existingCookie: null,
        activeAttempt: { mulai: baseStart, durasiMenit: 120 },
        nowMs: duringExam,
      })
    ).toBe(false);
  });

  it("mengizinkan siswa login ulang di perangkat yang sama (cookie cocok)", () => {
    expect(
      shouldBlockConcurrentStudentLogin({
        role: "siswa",
        activeSessionId: "sess-1",
        existingCookie: "sess-1",
        activeAttempt: { mulai: baseStart, durasiMenit: 120 },
        nowMs: duringExam,
      })
    ).toBe(false);
  });

  it("mengizinkan siswa di Hari ke-2 / lupa logout bila tidak ada ujian sedang berjalan", () => {
    expect(
      shouldBlockConcurrentStudentLogin({
        role: "siswa",
        activeSessionId: "sess-kemarin",
        existingCookie: null,
        activeAttempt: null,
        nowMs: duringExam,
      })
    ).toBe(false);
  });

  it("MEMBLOKIR login perangkat lain saat siswa sedang mengerjakan ujian aktif", () => {
    expect(
      shouldBlockConcurrentStudentLogin({
        role: "siswa",
        activeSessionId: "sess-hp-1",
        existingCookie: "sess-hp-2",
        activeAttempt: { mulai: baseStart, durasiMenit: 120, tambahanWaktuMenit: 0 },
        nowMs: duringExam,
      })
    ).toBe(true);
  });

  it("tetap memperhitungkan tambahan_waktu dari pengawas sebelum mengizinkan perangkat lain", () => {
    expect(
      shouldBlockConcurrentStudentLogin({
        role: "siswa",
        activeSessionId: "sess-hp-1",
        existingCookie: null,
        activeAttempt: { mulai: baseStart, durasiMenit: 120, tambahanWaktuMenit: 15 },
        nowMs: afterExam, // 125 menit < 135 menit (120 + 15)
      })
    ).toBe(true);
  });

  it("mengizinkan login perangkat lain jika ujian kemarin sudah melewati deadline", () => {
    expect(
      shouldBlockConcurrentStudentLogin({
        role: "siswa",
        activeSessionId: "sess-kemarin",
        existingCookie: null,
        activeAttempt: { mulai: baseStart, durasiMenit: 120, tambahanWaktuMenit: 0 },
        nowMs: afterExam,
      })
    ).toBe(false);
  });
});
