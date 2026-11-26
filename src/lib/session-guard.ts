import type { UserRole } from "@/types/cbt";

export interface ActiveAttemptSnapshot {
  mulai: string;
  durasiMenit: number;
  tambahanWaktuMenit?: number | null;
}

export interface ConcurrentLoginCheckInput {
  role: UserRole;
  activeSessionId: string | null | undefined;
  existingCookie: string | null | undefined;
  activeAttempt: ActiveAttemptSnapshot | null;
  nowMs?: number;
}

/**
 * Smart Session Lock:
 * - Memblokir login ganda siswa (409) HANYA jika siswa sedang memiliki ujian aktif
 *   (`status = 'sedang_mengerjakan'`) yang batas waktunya belum habis.
 * - Jika siswa lupa klik "Keluar" kemarin / selesai Mapel 1 lalu pindah perangkat /
 *   cookie 12 jam kedaluwarsa di Hari ke-2, login otomatis diizinkan dengan sesi baru.
 */
export function shouldBlockConcurrentStudentLogin({
  role,
  activeSessionId,
  existingCookie,
  activeAttempt,
  nowMs = Date.now(),
}: ConcurrentLoginCheckInput): boolean {
  if (role !== "siswa") return false;
  if (!activeSessionId) return false;
  if (existingCookie && activeSessionId === existingCookie) return false;
  if (!activeAttempt) return false;

  const startMs = new Date(activeAttempt.mulai).getTime();
  if (!Number.isFinite(startMs)) {
    // Jika timestamp tidak terbaca, ambil posisi aman: tetap blokir
    return true;
  }

  const totalMinutes =
    Math.max(0, Number(activeAttempt.durasiMenit || 0)) +
    Math.max(0, Number(activeAttempt.tambahanWaktuMenit || 0));
  const deadlineMs = startMs + totalMinutes * 60 * 1000;

  // Blokir hanya bila ujian masih berjalan (belum melewati deadline)
  return nowMs < deadlineMs;
}
