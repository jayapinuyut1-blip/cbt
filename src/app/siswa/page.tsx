"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime } from "@/lib/format";
import type { StudentAvailableExam } from "@/types/cbt";
import {
  Clock,
  FileText,
  Play,
  CheckCircle2,
  Ban,
  RefreshCw,
} from "lucide-react";

export default function SiswaDashboardPage() {
  const supabase = createClient();
  const [exams, setExams] = useState<StudentAvailableExam[]>([]);
  const [isBlocked, setIsBlocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadExams() {
    setLoading(true);
    setError("");
    const { data, error: err } = await supabase.rpc(
      "get_student_available_exams"
    );
    if (err) {
      setError(err.message);
    } else if (data) {
      setIsBlocked(Boolean(data.is_blocked));
      setExams((data.exams || []) as StudentAvailableExam[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadExams();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Daftar Ujian</h1>
          <p className="text-sm text-slate-600">
            Pilih ujian yang sedang dibuka lalu masukkan token dari pengawas.
          </p>
        </div>
        <button
          type="button"
          onClick={loadExams}
          disabled={loading}
          className="inline-flex items-center gap-1.5 min-h-[44px] px-3.5 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 rounded-lg text-sm font-medium transition"
        >
          <RefreshCw
            className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
            aria-hidden="true"
          />
          <span>{loading ? "Memuat..." : "Segarkan"}</span>
        </button>
      </div>

      {isBlocked && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-900 flex items-center gap-3 text-sm"
        >
          <Ban className="w-5 h-5 shrink-0" aria-hidden="true" />
          <span>
            Akun Anda sedang diblokir oleh pengawas ujian. Silakan hubungi pengawas di ruang ujian.
          </span>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 flex flex-wrap items-center justify-between gap-3 text-sm"
        >
          <span>Gagal memuat daftar ujian: {error}</span>
          <button
            type="button"
            onClick={loadExams}
            className="px-3 py-1.5 rounded-lg bg-red-700 hover:bg-red-800 text-white text-xs font-semibold"
          >
            Coba Lagi
          </button>
        </div>
      )}

      {/* Loading Skeleton (R-27) */}
      {loading && exams.length === 0 && (
        <div
          className="grid md:grid-cols-2 gap-4"
          role="status"
          aria-label="Memuat daftar ujian"
        >
          {[0, 1].map((idx) => (
            <div
              key={idx}
              className="bg-white rounded-xl border border-slate-200 p-5 space-y-3"
            >
              <div className="flex justify-between">
                <div className="h-5 w-24 rounded bg-slate-200 cbt-shimmer" />
                <div className="h-4 w-16 rounded bg-slate-200 cbt-shimmer" />
              </div>
              <div className="h-6 w-3/4 rounded bg-slate-200 cbt-shimmer" />
              <div className="h-4 w-1/2 rounded bg-slate-200 cbt-shimmer" />
              <div className="h-14 w-full rounded-lg bg-slate-100 cbt-shimmer" />
              <div className="h-11 w-full rounded-lg bg-slate-200 cbt-shimmer" />
            </div>
          ))}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {exams.map((ex) => {
          const isFinished =
            ex.attempt_status === "selesai" ||
            ex.attempt_status === "menunggu_koreksi";
          const isInProgress = ex.attempt_status === "mengerjakan";

          return (
            <div
              key={ex.exam_id}
              className="bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col justify-between"
            >
              {ex.sedang_dibuka && !isFinished && !isBlocked && (
                <div
                  className="h-1"
                  style={{ background: "var(--cbt-auth-bar)" }}
                  aria-hidden="true"
                />
              )}
              <div className="p-5 flex-1 flex flex-col justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-xs px-2.5 py-0.5 rounded-md font-semibold ${
                        ex.jenis === "latihan"
                          ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                          : "border"
                      }`}
                      style={
                        ex.jenis === "latihan"
                          ? undefined
                          : {
                              backgroundColor: "var(--cbt-accent-soft)",
                              color: "var(--cbt-accent)",
                              borderColor: "var(--cbt-nav-active-ring)",
                            }
                      }
                    >
                      {ex.jenis === "latihan" ? "Latihan" : "Ujian Resmi"}
                    </span>
                    <span className="text-xs font-medium text-slate-600">
                      {ex.sesi}
                    </span>
                  </div>

                  <h2 className="font-bold text-lg text-slate-900">
                    {ex.judul}
                  </h2>
                  <div className="text-sm text-slate-700">{ex.mapel}</div>

                  <div className="flex flex-wrap gap-3 text-xs text-slate-600 pt-1">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" aria-hidden="true" />{" "}
                      {ex.durasi} menit
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <FileText className="w-3.5 h-3.5" aria-hidden="true" />{" "}
                      {ex.jumlah_soal} soal
                    </span>
                  </div>

                  <div className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-200/80 space-y-0.5">
                    <div>Mulai: {formatDateTime(ex.mulai_efektif)}</div>
                    <div>Selesai: {formatDateTime(ex.selesai_efektif)}</div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-200/80 flex flex-col gap-2">
                  {ex.remedial_tersedia ? (
                    <>
                      <div className="flex items-center justify-between text-xs">
                        <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-900 border border-amber-200 font-semibold">
                          Remedial #{Math.max(1, (ex.remedial_ke || 2) - 1)} Dibuka
                        </span>
                        {ex.attempt_id && (
                          <Link
                            href={`/siswa/hasil/${ex.attempt_id}`}
                            className="text-slate-700 hover:underline font-medium"
                          >
                            Lihat Hasil Sebelumnya
                          </Link>
                        )}
                      </div>
                      {ex.sedang_dibuka && !isBlocked ? (
                        <Link
                          href={`/siswa/ujian/${ex.exam_id}`}
                          className="w-full min-h-[44px] py-2.5 cbt-btn-primary rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition"
                        >
                          <Play className="w-4 h-4" aria-hidden="true" />
                          <span>Ikuti Ujian Remedial</span>
                        </Link>
                      ) : (
                        <div className="w-full text-center py-2.5 rounded-lg bg-slate-100 text-slate-600 text-xs font-medium">
                          {isBlocked
                            ? "Akun Diblokir"
                            : "Menunggu Jadwal Remedial"}
                        </div>
                      )}
                    </>
                  ) : isFinished ? (
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs">
                        <span className="inline-flex items-center gap-1 text-emerald-800 font-semibold">
                          <CheckCircle2
                            className="w-4 h-4"
                            aria-hidden="true"
                          />
                          {ex.attempt_status === "menunggu_koreksi"
                            ? "Menunggu Koreksi Essay"
                            : ex.is_remedial
                            ? `Selesai (Remedial #${Math.max(1, (ex.attempt_ke || 2) - 1)})`
                            : "Selesai"}
                        </span>
                        {ex.nilai_tampil !== null && (
                          <div className="text-slate-700 mt-0.5">
                            Nilai: <strong>{ex.nilai_tampil}</strong>
                          </div>
                        )}
                      </div>
                      {ex.attempt_id && (
                        <Link
                          href={`/siswa/hasil/${ex.attempt_id}`}
                          className="inline-flex items-center min-h-[44px] px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition"
                        >
                          Lihat Hasil
                        </Link>
                      )}
                    </div>
                  ) : isInProgress ? (
                    <Link
                      href={`/siswa/ujian/${ex.exam_id}`}
                      className="w-full min-h-[44px] py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition"
                    >
                      <Play className="w-4 h-4" aria-hidden="true" />
                      <span>Lanjutkan Mengerjakan</span>
                    </Link>
                  ) : ex.sedang_dibuka && !isBlocked ? (
                    <Link
                      href={`/siswa/ujian/${ex.exam_id}`}
                      className="w-full min-h-[44px] py-2.5 cbt-btn-primary rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition"
                    >
                      <Play className="w-4 h-4" aria-hidden="true" />
                      <span>Ikuti Ujian</span>
                    </Link>
                  ) : (
                    <div className="w-full text-center py-2.5 rounded-lg bg-slate-100 text-slate-600 text-xs font-medium">
                      {isBlocked ? "Akun Diblokir" : "Di Luar Jadwal Ujian"}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {!loading && exams.length === 0 && !error && (
          <div className="md:col-span-2 bg-white rounded-xl border border-slate-200 p-8 text-center space-y-3">
            <div className="text-sm font-semibold text-slate-800">
              Belum ada jadwal ujian yang terbuka untuk kelas Anda saat ini.
            </div>
            <p className="text-xs text-slate-600 max-w-md mx-auto">
              Jadwal akan muncul otomatis saat jam ujian dimulai. Jika pengawas sudah mengumumkan ujian dimulai, tekan tombol di bawah untuk memuat ulang.
            </p>
            <button
              type="button"
              onClick={loadExams}
              className="inline-flex items-center gap-1.5 min-h-[44px] px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-semibold transition"
            >
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Periksa Ulang Jadwal</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
