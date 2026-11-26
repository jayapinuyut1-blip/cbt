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
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Daftar Ujian</h1>
          <p className="text-sm text-slate-500">
            Pilih ujian yang sedang dibuka lalu masukkan token dari pengawas.
          </p>
        </div>
        <button
          onClick={loadExams}
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-sm font-medium cursor-pointer"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Segarkan
        </button>
      </div>

      {isBlocked && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 flex items-center gap-3 text-sm">
          <Ban className="w-5 h-5 shrink-0" />
          <span>
            Akun Anda sedang diblokir oleh pengawas ujian. Silakan hubungi pengawas di ruang ujian.
          </span>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
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
              className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col justify-between gap-4"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                      ex.jenis === "latihan"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-blue-100 text-blue-700"
                    }`}
                  >
                    {ex.jenis === "latihan" ? "Latihan" : "Ujian Resmi"}
                  </span>
                  <span className="text-xs text-slate-500">{ex.sesi}</span>
                </div>

                <h2 className="font-bold text-lg text-slate-900">{ex.judul}</h2>
                <div className="text-sm text-slate-600">{ex.mapel}</div>

                <div className="flex flex-wrap gap-3 text-xs text-slate-500 pt-1">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" /> {ex.durasi} menit
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5" /> {ex.jumlah_soal} soal
                  </span>
                </div>

                <div className="text-xs text-slate-500 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                  <div>Mulai: {formatDateTime(ex.mulai_efektif)}</div>
                  <div>Selesai: {formatDateTime(ex.selesai_efektif)}</div>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 flex flex-col gap-2">
                {ex.remedial_tersedia ? (
                  <>
                    <div className="flex items-center justify-between text-xs">
                      <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 font-semibold">
                        Remedial #{Math.max(1, (ex.remedial_ke || 2) - 1)} Dibuka
                      </span>
                      {ex.attempt_id && (
                        <Link
                          href={`/siswa/hasil/${ex.attempt_id}`}
                          className="text-slate-600 hover:underline font-medium"
                        >
                          Lihat Hasil Sebelumnya
                        </Link>
                      )}
                    </div>
                    {ex.sedang_dibuka && !isBlocked ? (
                      <Link
                        href={`/siswa/ujian/${ex.exam_id}`}
                        className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2"
                      >
                        <Play className="w-4 h-4" /> Ikuti Ujian Remedial
                      </Link>
                    ) : (
                      <div className="w-full text-center py-2 rounded-lg bg-slate-100 text-slate-500 text-xs font-medium">
                        {isBlocked ? "Akun Diblokir" : "Menunggu Jadwal Remedial"}
                      </div>
                    )}
                  </>
                ) : isFinished ? (
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs">
                      <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                        <CheckCircle2 className="w-4 h-4" />
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
                        className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold"
                      >
                        Lihat Hasil
                      </Link>
                    )}
                  </div>
                ) : isInProgress ? (
                  <Link
                    href={`/siswa/ujian/${ex.exam_id}`}
                    className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2"
                  >
                    <Play className="w-4 h-4" /> Lanjutkan Mengerjakan
                  </Link>
                ) : ex.sedang_dibuka && !isBlocked ? (
                  <Link
                    href={`/siswa/ujian/${ex.exam_id}`}
                    className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2"
                  >
                    <Play className="w-4 h-4" /> Ikuti Ujian
                  </Link>
                ) : (
                  <div className="w-full text-center py-2 rounded-lg bg-slate-100 text-slate-500 text-xs font-medium">
                    {isBlocked ? "Akun Diblokir" : "Di Luar Jadwal Ujian"}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {!loading && exams.length === 0 && (
          <div className="md:col-span-2 bg-white rounded-xl border border-slate-200 p-10 text-center text-slate-400 text-sm">
            Belum ada ujian yang dijadwalkan untuk kelas Anda saat ini.
          </div>
        )}
      </div>
    </div>
  );
}
