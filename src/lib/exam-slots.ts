export type ExamSlotKey = "jam_2" | "jam_3" | "manual";

export interface ExamSlotInfo {
  key: Exclude<ExamSlotKey, "manual">;
  label: string;
  sesiLabel: string;
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  durationMinutes: number;
}

export function isFridayDate(dateStr: string): boolean {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getDay() === 5; // 5 = Jumat
}

export function getDayNameId(dateStr: string): string {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return "";
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return new Intl.DateTimeFormat("id-ID", { weekday: "long" }).format(dt);
}

/**
 * Alokasi waktu resmi ujian sekolah SMKN 3 Kotamobagu:
 * - Senin, Selasa, Rabu, Kamis, Sabtu:
 *   Jam I (07.15-08.00 Apel Pagi), Jam II (08.00-10.00 / 120 mnt),
 *   Istirahat (10.00-10.30), Jam III (10.30-12.30 / 120 mnt)
 * - Jumat:
 *   Jam I (07.15-07.45 Apel Pagi), Jam II (07.45-09.15 / 90 mnt),
 *   Istirahat (09.15-09.45), Jam III (09.45-11.00 / 75 mnt)
 */
export function getSlotsForDate(dateStr: string): ExamSlotInfo[] {
  if (isFridayDate(dateStr)) {
    return [
      {
        key: "jam_2",
        label: "Jam II — 07.45 s.d. 09.15 (90 menit • Khusus Jumat)",
        sesiLabel: "Jam II",
        startTime: "07:45",
        endTime: "09:15",
        durationMinutes: 90,
      },
      {
        key: "jam_3",
        label: "Jam III — 09.45 s.d. 11.00 (75 menit • Khusus Jumat)",
        sesiLabel: "Jam III",
        startTime: "09:45",
        endTime: "11:00",
        durationMinutes: 75,
      },
    ];
  }

  return [
    {
      key: "jam_2",
      label: "Jam II — 08.00 s.d. 10.00 (120 menit)",
      sesiLabel: "Jam II",
      startTime: "08:00",
      endTime: "10:00",
      durationMinutes: 120,
    },
    {
      key: "jam_3",
      label: "Jam III — 10.30 s.d. 12.30 (120 menit)",
      sesiLabel: "Jam III",
      startTime: "10:30",
      endTime: "12:30",
      durationMinutes: 120,
    },
  ];
}

export function combineDateAndTimeToIso(
  dateStr: string,
  timeStr: string
): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0).toISOString();
}

export function diffMinutesBetweenTimes(
  startTime: string,
  endTime: string
): number {
  if (!startTime || !endTime) return 60;
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  const diff = eh * 60 + em - (sh * 60 + sm);
  return diff > 0 ? diff : 60;
}

export function extractLocalDateAndTime(iso: string): {
  date: string;
  time: string;
} {
  const dt = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`,
    time: `${pad(dt.getHours())}:${pad(dt.getMinutes())}`,
  };
}
