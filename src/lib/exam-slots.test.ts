import { describe, expect, it } from "vitest";
import {
  combineDateAndTimeToIso,
  diffMinutesBetweenTimes,
  getSlotsForDate,
  isFridayDate,
} from "./exam-slots";

describe("exam-slots", () => {
  it("mendeteksi hari Jumat", () => {
    expect(isFridayDate("2026-11-27")).toBe(true); // Jumat
    expect(isFridayDate("2026-11-26")).toBe(false); // Kamis
    expect(isFridayDate("bukan-tanggal")).toBe(false);
  });

  it("hari Jumat memakai Jam II 90 menit & Jam III 75 menit", () => {
    const slots = getSlotsForDate("2026-11-27");
    expect(slots.map((s) => [s.startTime, s.endTime, s.durationMinutes])).toEqual([
      ["07:45", "09:15", 90],
      ["09:45", "11:00", 75],
    ]);
  });

  it("hari biasa memakai Jam II & Jam III masing-masing 120 menit", () => {
    const slots = getSlotsForDate("2026-11-26");
    expect(slots.map((s) => [s.startTime, s.endTime, s.durationMinutes])).toEqual([
      ["08:00", "10:00", 120],
      ["10:30", "12:30", 120],
    ]);
  });

  it("diffMinutesBetweenTimes konsisten dengan durasi slot, fallback 60", () => {
    expect(diffMinutesBetweenTimes("07:45", "09:15")).toBe(90);
    expect(diffMinutesBetweenTimes("10:00", "08:00")).toBe(60);
    expect(diffMinutesBetweenTimes("", "")).toBe(60);
  });

  it("combineDateAndTimeToIso menghasilkan ISO yang valid", () => {
    expect(() => new Date(combineDateAndTimeToIso("2026-11-26", "08:00")).toISOString()).not.toThrow();
  });
});
