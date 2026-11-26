"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SESSION_COOKIE_NAME } from "@/lib/auth-utils";
import ExamWorkspace from "@/components/ExamWorkspace";
import type { ExamSessionPayload, StudentAvailableExam } from "@/types/cbt";
import {
  Clock,
  FileText,
  KeyRound,
  AlertCircle,
  ShieldAlert,
  Play,
  ArrowLeft,
} from "lucide-react";

function getClientSessionCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${SESSION_COOKIE_NAME}=`));
  return match ? decodeURIComponent(match.split("=")[1]) : null;
}

export default function SiswaUjianPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = createClient();
  const examId = Number(params.id);

  const [examInfo, setExamInfo] = useState<StudentAvailableExam | null>(null);
  const [session, setSession] = useState<ExamSessionPayload | null>(null);
  const [token, setToken] = useState("");
  const [loadingInfo, setLoadingInfo] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!examId) return;
    supabase.rpc("get_student_available_exams").then(async ({ data, error: err }) => {
      if (err) {
        setError(err.message);
        setLoadingInfo(false);
        return;
      }
      const list = (data?.exams || []) as StudentAvailableExam[];
      const found = list.find((e) => e.exam_id === examId) || null;
      setExamInfo(found);

      // Jika sudah berstatus sedang mengerjakan, langsung lanjutkan tanpa minta token lagi
      if (found?.attempt_status === "mengerjakan") {
        const { data: resumed, error: resErr } = await supabase.rpc(
          "start_or_resume_exam",
          {
            p_exam_id: examId,
            p_token: null,
            p_session_id: getClientSessionCookie(),
          }
        );
        if (resErr) {
          setError(resErr.message);
        } else if (resumed) {
          setSession(resumed as ExamSessionPayload);
        }
      } else if (
        found?.attempt_id &&
        (found.attempt_status === "selesai" ||
          found.attempt_status === "menunggu_koreksi")
      ) {
        router.replace(`/siswa/hasil/${found.attempt_id}`);
        return;
      }
      setLoadingInfo(false);
    });
  }, [examId, supabase, router]);

  async function handleStart(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setStarting(true);

    // Minta layar penuh saat klik Mulai (opsional, jika browser mengizinkan)
    document.documentElement.requestFullscreen?.().catch(() => {});

    const { data, error: err } = await supabase.rpc("start_or_resume_exam", {
      p_exam_id: examId,
      p_token: token.trim().toUpperCase(),
      p_session_id: getClientSessionCookie(),
    });

    if (err) {
      setError(err.message);
      setStarting(false);
      return;
    }

    setSession(data as ExamSessionPayload);
    setStarting(false);
  }

  // Jika ujian sudah berjalan, tampilkan ExamWorkspace layar penuh (menutupi padding shell)
  if (session) {
    return (
      <div className="fixed inset-0 z-40 overflow-y-auto bg-slate-50">
        <ExamWorkspace mode="live" session={session} />
      </div>
    );
  }

  if (loadingInfo) {
    return (
      <div className="p-8 text-center text-slate-500 text-sm">
        Memuat informasi ujian...
      </div>
    );
  }

  if (!examInfo) {
    return (
      <div className="max-w-lg mx-auto bg-white rounded-xl border border-slate-200 p-6 text-center space-y-3">
        <p className="text-sm text-slate-600">
          {error || "Ujian tidak ditemukan atau tidak dijadwalkan untuk kelas Anda."}
        </p>
        <button
          onClick={() => router.push("/siswa")}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium cursor-pointer"
        >
          Kembali ke Daftar Ujian
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <button
        onClick={() => router.push("/siswa")}
        className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" /> Kembali ke Daftar Ujian
      </button>

      <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 space-y-6">
        <div>
          <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-700">
            {examInfo.jenis === "latihan" ? "Latihan" : "Ujian Resmi"}
          </span>
          <h1 className="text-2xl font-bold text-slate-900 mt-2">
            {examInfo.judul}
          </h1>
          <p className="text-sm text-slate-500">{examInfo.mapel}</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
            <div className="text-xs text-slate-500 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" /> Durasi
            </div>
            <div className="font-bold text-slate-900 mt-0.5">
              {examInfo.durasi} Menit
            </div>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
            <div className="text-xs text-slate-500 flex items-center gap-1">
              <FileText className="w-3.5 h-3.5" /> Jumlah Soal
            </div>
            <div className="font-bold text-slate-900 mt-0.5">
              {examInfo.jumlah_soal} Soal
            </div>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 col-span-2 sm:col-span-1">
            <div className="text-xs text-slate-500">Navigasi</div>
            <div className="font-bold text-slate-900 mt-0.5">
              {examInfo.navigasi === "bebas" ? "Bebas" : "Berurutan"}
            </div>
          </div>
        </div>

        {/* Petunjuk & Aturan Ujian */}
        <div className="space-y-3">
          {examInfo.petunjuk && (
            <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 text-sm text-blue-950">
              <div className="font-semibold mb-1">Petunjuk Pengerjaan:</div>
              <p className="whitespace-pre-wrap">{examInfo.petunjuk}</p>
            </div>
          )}

          <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs sm:text-sm text-amber-900 space-y-1.5">
            <div className="font-semibold flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4" /> Aturan Ujian:
            </div>
            <ul className="list-disc pl-5 space-y-1">
              <li>Waktu dihitung dari server dan ujian akan terkumpul otomatis saat waktu habis.</li>
              <li>Setiap jawaban tersimpan otomatis. Jika koneksi terputus, Anda dapat melanjutkan dengan sisa waktu yang tersisa.</li>
              <li>Perpindahan tab atau keluar dari layar penuh akan tercatat otomatis di layar pengawas.</li>
              <li>Gunakan hanya 1 perangkat aktif selama ujian berlangsung.</li>
            </ul>
          </div>
        </div>

        {error && (
          <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleStart} className="space-y-4 pt-2 border-t border-slate-200">
          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-1.5">
              Masukkan Token Ujian (6 Karakter)
            </label>
            <div className="relative max-w-xs">
              <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                required
                maxLength={10}
                value={token}
                onChange={(e) => setToken(e.target.value.toUpperCase())}
                placeholder="Contoh: A7K9P2"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 font-mono text-base tracking-widest uppercase focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={starting}
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold rounded-xl text-sm cursor-pointer"
          >
            <Play className="w-4 h-4" />
            {starting ? "Memulai Ujian..." : "Mulai Ujian Sekarang"}
          </button>
        </form>
      </div>
    </div>
  );
}
