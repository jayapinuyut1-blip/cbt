"use client";

import { Lock, RefreshCw, ShieldAlert } from "lucide-react";

export interface WarningNotice {
  count: number;
  max: number;
  reason: string;
}

interface Props {
  /** Overlay keamanan hanya aktif pada mode ujian sungguhan (bukan pratinjau guru). */
  live: boolean;
  studentWatermark?: string;
  securityToast: string;
  warningNotice: WarningNotice | null;
  isLocked: boolean;
  lockedReason: string;
  violationCount: number;
  maxViolations: number;
  checkingUnlock: boolean;
  onDismissWarning: () => void;
  onCheckUnlock: () => void;
}

/**
 * Lapisan UI keamanan ujian: watermark identitas, toast blokir copy/paste,
 * modal peringatan bertingkat, dan layar kunci permanen (Mode Ketat Opsi A).
 */
export default function ExamSecurityOverlays({
  live,
  studentWatermark,
  securityToast,
  warningNotice,
  isLocked,
  lockedReason,
  violationCount,
  maxViolations,
  checkingUnlock,
  onDismissWarning,
  onCheckUnlock,
}: Props) {
  return (
    <>
      {/* Watermark Transparan Identitas Siswa (Anti Foto / Sebar Soal) */}
      {live && studentWatermark && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-10 overflow-hidden select-none opacity-[0.045] flex flex-wrap items-center justify-around gap-16 -rotate-12 scale-110"
        >
          {Array.from({ length: 12 }).map((_, i) => (
            <span
              key={i}
              className="text-sm sm:text-base font-extrabold tracking-widest uppercase text-slate-900 whitespace-nowrap"
            >
              {studentWatermark}
            </span>
          ))}
        </div>
      )}

      {/* Toast Singkat Blokir Copy/Paste/Klik Kanan */}
      {securityToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold shadow-lg flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{securityToast}</span>
        </div>
      )}

      {/* Modal Peringatan Bertingkat (Pelanggaran 1 .. N-1) */}
      {warningNotice && !isLocked && (
        <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white text-slate-900 rounded-2xl max-w-md w-full p-6 space-y-4 border-2 border-amber-400 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900">
                  Peringatan Keamanan Ujian ({warningNotice.count}/
                  {warningNotice.max})
                </h3>
                <p className="text-xs text-amber-800 font-medium">
                  Aktivitas mencurigakan tercatat ke Pengawas
                </p>
              </div>
            </div>
            <div className="text-sm text-slate-700 space-y-2">
              <p>
                Sistem mendeteksi: <strong>{warningNotice.reason}</strong>.
              </p>
              <p className="text-xs bg-rose-50 border border-rose-200 text-rose-800 rounded-lg p-3">
                Jika mencapai <strong>{warningNotice.max}x pelanggaran</strong>,
                layar ujian Anda akan <strong>TERKUNCI OTOMATIS</strong> dan
                hanya dapat dibuka kembali oleh Pengawas Ujian.
              </p>
            </div>
            <button
              type="button"
              onClick={onDismissWarning}
              className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-sm cursor-pointer"
            >
              Saya Mengerti, Kembali ke Ujian
            </button>
          </div>
        </div>
      )}

      {/* Layar Kunci Permanen (Mode Ketat Opsi A — Wajib Dibuka Pengawas dari Monitoring) */}
      {isLocked && (
        <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-white text-slate-900 rounded-2xl max-w-md w-full p-6 sm:p-7 space-y-4 text-center shadow-2xl border-2 border-rose-500">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center">
              <Lock className="w-8 h-8" />
            </div>
            <div>
              <span className="inline-block px-3 py-0.5 rounded-full bg-rose-600 text-white text-xs font-bold uppercase tracking-wider">
                Layar Ujian Terkunci
              </span>
              <h3 className="font-extrabold text-xl text-slate-900 mt-2">
                Batas Pelanggaran Tercapai
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                {lockedReason ||
                  `Anda telah mencapai ${violationCount}/${maxViolations} pelanggaran.`}
              </p>
            </div>

            {studentWatermark && (
              <div className="px-3 py-2 rounded-xl bg-slate-100 text-xs font-semibold text-slate-700">
                Peserta: {studentWatermark}
              </div>
            )}

            <div className="text-xs text-left bg-rose-50 border border-rose-200 text-rose-900 rounded-xl p-3.5 space-y-1.5">
              <p className="font-semibold">Cara membuka kunci ujian:</p>
              <ol className="list-decimal pl-4 space-y-1">
                <li>
                  Tetap di halaman ini (jawaban sebelumnya sudah tersimpan
                  aman).
                </li>
                <li>Angkat tangan dan lapor kepada Pengawas di ruang ujian.</li>
                <li>
                  Pengawas akan mengklik <strong>Buka Kunci</strong> pada
                  halaman Monitoring.
                </li>
                <li>
                  Halaman ini akan terbuka otomatis begitu Pengawas menyetujui.
                </li>
              </ol>
            </div>

            <button
              type="button"
              disabled={checkingUnlock}
              onClick={onCheckUnlock}
              className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white font-semibold text-sm inline-flex items-center justify-center gap-2 cursor-pointer"
            >
              <RefreshCw
                className={`w-4 h-4 ${checkingUnlock ? "animate-spin" : ""}`}
              />
              {checkingUnlock
                ? "Memeriksa izin pengawas..."
                : "Cek Status Buka Kunci"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
