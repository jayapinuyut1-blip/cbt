"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SESSION_COOKIE_NAME } from "@/lib/auth-utils";
import { formatCountdown, questionTypeLabel } from "@/lib/format";
import ExamSecurityOverlays from "@/components/ExamSecurityOverlays";
import ExamQuestionNav from "@/components/ExamQuestionNav";
import ExamQuestionCard from "@/components/ExamQuestionCard";
import { useExamAntiCheat } from "@/hooks/useExamAntiCheat";
import type {
  AnswerPayload,
  ExamSessionPayload,
  SanitizedQuestion,
  SavedAnswerState,
} from "@/types/cbt";
import {
  Clock,
  Eye,
  EyeOff,
  Flag,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Contrast,
  Type,
  Maximize,
  Send,
  Cloud,
  Loader2,
  LayoutGrid,
  X,
  ShieldAlert,
} from "lucide-react";

function getClientSessionCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${SESSION_COOKIE_NAME}=`));
  return match ? decodeURIComponent(match.split("=")[1]) : null;
}

function isQuestionAnswered(
  q: SanitizedQuestion,
  ans?: SavedAnswerState
): boolean {
  if (!ans || !ans.jawaban) return false;
  if (q.tipe === "pg") return ans.jawaban.option_id != null;
  if (q.tipe === "isian" || q.tipe === "essay") {
    return typeof ans.jawaban.text === "string" && ans.jawaban.text.trim() !== "";
  }
  if (q.tipe === "jodoh") {
    const pairs = ans.jawaban.pairs || {};
    return Object.values(pairs).some((v) => v && v.trim() !== "");
  }
  return false;
}

export default function ExamWorkspace({
  mode,
  session,
  onExitPreview,
}: {
  mode: "live" | "preview";
  session: ExamSessionPayload;
  onExitPreview?: () => void;
}) {
  const router = useRouter();
  const supabase = createClient();

  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, SavedAnswerState>>(
    session.answers || {}
  );
  const [eliminated, setEliminated] = useState<Record<string, number[]>>({});
  const [hideTimer, setHideTimer] = useState(false);
  const [highContrast, setHighContrast] = useState(false);
  const [textScale, setTextScale] = useState<number>(1); // 0 = sm, 1 = base, 2 = lg, 3 = xl
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [submitting, setSubmitting] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showMobileNav, setShowMobileNav] = useState(false);
  const [conflictError, setConflictError] = useState("");

  // Sinkronisasi waktu berbasis server (bukan jam lokal perangkat siswa)
  const serverOffsetRef = useRef<number>(
    new Date(session.server_now).getTime() - Date.now()
  );
  const deadlineMsRef = useRef<number>(new Date(session.deadline).getTime());

  const [remainingSec, setRemainingSec] = useState<number>(() =>
    Math.max(
      0,
      Math.floor(
        (new Date(session.deadline).getTime() -
          new Date(session.server_now).getTime()) /
          1000
      )
    )
  );

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSubmittedRef = useRef(false);

  // Anti-Curang Mode Ketat (Opsi A: Peringatan Bertingkat + Kunci Layar Server-Side)
  const maxViolations =
    session.maks_pelanggaran ?? session.exam.maks_pelanggaran ?? 3;

  const syncServerClock = useCallback((serverNow: string, deadline: string) => {
    serverOffsetRef.current = new Date(serverNow).getTime() - Date.now();
    deadlineMsRef.current = new Date(deadline).getTime();
  }, []);

  const handleTimeExpired = useCallback(() => {
    router.push(`/siswa/hasil/${session.attempt_id}`);
  }, [router, session.attempt_id]);

  const {
    isFullscreen,
    violationCount,
    isLocked,
    lockedReason,
    warningNotice,
    securityToast,
    checkingUnlock,
    requestFullscreen,
    checkUnlockStatus,
    dismissWarning,
    lockAttempt,
  } = useExamAntiCheat({
    mode,
    supabase,
    attemptId: session.attempt_id,
    examId: session.exam.id,
    initialViolationCount: session.pelanggaran_count ?? 0,
    maxViolations,
    initialIsLocked: Boolean(session.is_locked),
    initialLockedReason: session.locked_reason || "",
    submitting,
    autoSubmittedRef,
    getSessionId: getClientSessionCookie,
    onSyncClock: syncServerClock,
    onTimeExpired: handleTimeExpired,
    onConflictError: setConflictError,
  });

  // Muat coretan opsi dari localStorage per attempt
  useEffect(() => {
    if (mode !== "live") return;
    try {
      const raw = localStorage.getItem(`cbt_elim_${session.attempt_id}`);
      if (raw) setEliminated(JSON.parse(raw));
    } catch {
      // ignore
    }
  }, [mode, session.attempt_id]);

  // Simpan coretan opsi ke localStorage
  function toggleEliminate(questionId: number, optionId: number) {
    setEliminated((prev) => {
      const key = String(questionId);
      const list = prev[key] || [];
      const next = list.includes(optionId)
        ? list.filter((id) => id !== optionId)
        : [...list, optionId];
      const updated = { ...prev, [key]: next };
      if (mode === "live") {
        try {
          localStorage.setItem(
            `cbt_elim_${session.attempt_id}`,
            JSON.stringify(updated)
          );
        } catch {
          // ignore
        }
      }
      return updated;
    });
  }

  // Kirim jawaban ke PostgreSQL RPC
  const persistAnswer = useCallback(
    async (questionId: number, jawaban: AnswerPayload, ragu: boolean) => {
      if (mode !== "live") return;
      setSaveStatus("saving");
      const { data, error } = await supabase.rpc("save_student_answer", {
        p_attempt_id: session.attempt_id,
        p_question_id: questionId,
        p_jawaban: jawaban,
        p_ragu: ragu,
        p_session_id: getClientSessionCookie(),
      });

      if (error) {
        setSaveStatus("error");
        const msg = error.message || "";
        if (msg.includes("ATTEMPT_LOCKED")) {
          lockAttempt(
            "Layar ujian Anda sedang terkunci karena melampaui batas pelanggaran."
          );
        } else if (
          msg.includes("SESSION_CONFLICT") ||
          msg.includes("BLOCKED") ||
          msg.includes("ATTEMPT_CLOSED")
        ) {
          setConflictError(msg);
        } else if (msg.includes("TIME_EXPIRED")) {
          router.push(`/siswa/hasil/${session.attempt_id}`);
        }
      } else {
        setSaveStatus("saved");
        // Sinkronisasi ulang deadline (kalau Admin baru saja klik +Tambah Waktu!)
        if (data?.deadline && data?.server_now) {
          syncServerClock(data.server_now, data.deadline);
        }
      }
    },
    [mode, supabase, session.attempt_id, router, lockAttempt, syncServerClock]
  );

  function updateAnswer(
    questionId: number,
    nextJawaban: AnswerPayload,
    nextRagu?: boolean,
    debounce = false
  ) {
    const key = String(questionId);
    const current = answers[key] || { jawaban: {}, ragu: false };
    const raguVal = nextRagu !== undefined ? nextRagu : current.ragu;
    const nextState: SavedAnswerState = { jawaban: nextJawaban, ragu: raguVal };

    setAnswers((prev) => ({ ...prev, [key]: nextState }));

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (debounce) {
      debounceRef.current = setTimeout(() => {
        persistAnswer(questionId, nextJawaban, raguVal);
      }, 900);
    } else {
      persistAnswer(questionId, nextJawaban, raguVal);
    }
  }

  const handleSubmitExam = useCallback(async () => {
    if (mode === "preview") {
      alert("Ini adalah mode Pratinjau Guru. Tidak ada data yang disimpan.");
      onExitPreview?.();
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    try {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      // Pastikan soal aktif terakhir tersimpan
      const activeQ = session.questions[currentIdx];
      if (activeQ) {
        const currAns = answers[String(activeQ.id)];
        if (currAns) {
          await supabase.rpc("save_student_answer", {
            p_attempt_id: session.attempt_id,
            p_question_id: activeQ.id,
            p_jawaban: currAns.jawaban,
            p_ragu: currAns.ragu,
            p_session_id: getClientSessionCookie(),
          });
        }
      }

      const { error } = await supabase.rpc("submit_exam_attempt", {
        p_attempt_id: session.attempt_id,
        p_session_id: getClientSessionCookie(),
      });
      if (error) {
        alert("Gagal mengumpulkan ujian: " + error.message);
        setSubmitting(false);
        return;
      }

      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
      router.push(`/siswa/hasil/${session.attempt_id}`);
      router.refresh();
    } catch {
      alert("Terjadi kesalahan jaringan saat mengumpulkan ujian. Coba lagi.");
      setSubmitting(false);
    }
  }, [
    mode,
    onExitPreview,
    submitting,
    session.questions,
    session.attempt_id,
    currentIdx,
    answers,
    supabase,
    router,
  ]);

  // Countdown Timer Berbasis Waktu Server + Auto-Submit Saat Waktu Habis
  useEffect(() => {
    const timer = setInterval(() => {
      const serverNowMs = Date.now() + serverOffsetRef.current;
      const diff = Math.max(
        0,
        Math.floor((deadlineMsRef.current - serverNowMs) / 1000)
      );
      setRemainingSec(diff);

      if (diff <= 300 && diff > 0) {
        // Paksa tampilkan timer saat sisa <= 5 menit
        setHideTimer(false);
      }

      if (diff <= 0 && mode === "live" && !autoSubmittedRef.current) {
        autoSubmittedRef.current = true;
        handleSubmitExam();
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [mode, handleSubmitExam]);

  const question = session.questions[currentIdx];
  const currentAns = question
    ? answers[String(question.id)] || { jawaban: {}, ragu: false }
    : { jawaban: {}, ragu: false };

  const textSizeClass =
    textScale === 0
      ? "text-sm"
      : textScale === 1
      ? "text-base"
      : textScale === 2
      ? "text-lg"
      : "text-xl";

  const isLowTime = remainingSec <= 300;
  const answeredCount = session.questions.filter((q) =>
    isQuestionAnswered(q, answers[String(q.id)])
  ).length;
  const raguCount = session.questions.filter(
    (q) => answers[String(q.id)]?.ragu
  ).length;

  const isSequential = session.exam.navigasi === "berurutan";

  if (!question) {
    return (
      <div className="p-8 text-center text-slate-500">
        Tidak ada soal pada ujian ini.
      </div>
    );
  }

  return (
    <div
      className={`min-h-[100dvh] flex flex-col ${
        highContrast ? "high-contrast" : "cbt-canvas"
      }`}
    >
      {/* Banner Mode Pratinjau Guru */}
      {mode === "preview" && (
        <div className="bg-indigo-700 text-white px-3.5 sm:px-4 py-2 text-xs sm:text-sm flex items-center justify-between gap-2">
          <span className="truncate">
            <strong>PRATINJAU GURU:</strong> Tampilan identik dengan layar siswa.
          </span>
          <button
            onClick={onExitPreview}
            className="px-3 py-1 bg-white text-indigo-800 rounded font-semibold text-xs cursor-pointer shrink-0"
          >
            Keluar
          </button>
        </div>
      )}

      {/* Banner Konflik Sesi / Diblokir */}
      {conflictError && (
        <div className="bg-red-600 text-white px-4 py-3 text-sm flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span>{conflictError}</span>
          </div>
          <button
            onClick={() => router.push("/login")}
            className="px-3 py-1 bg-white text-red-700 rounded font-semibold text-xs cursor-pointer shrink-0"
          >
            Kembali ke Login
          </button>
        </div>
      )}

      {/* Header Ujian (Tema & aksen konsisten Desktop & Mobile) */}
      <header
        style={
          highContrast ? undefined : { borderTopColor: "var(--cbt-exam-top)" }
        }
        className={`sticky top-0 z-20 bg-white border-b border-slate-200 border-t-[3px] px-3.5 sm:px-4 py-2.5 sm:py-3 shadow-2xs hc-card ${
          highContrast ? "border-t-yellow-400" : ""
        }`}
      >
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
          <div className="flex items-center justify-between gap-2 min-w-0">
            <div className="min-w-0">
              <div className="font-bold text-sm sm:text-base truncate">
                {session.exam.judul}
              </div>
              <div className="text-[11px] sm:text-xs text-slate-500 hc-muted truncate">
                {session.exam.mapel} • Soal {currentIdx + 1}/{session.questions.length}
              </div>
            </div>

            {/* Timer ringkas kanan atas khusus Mobile */}
            <div
              className={`sm:hidden flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-mono font-bold shrink-0 ${
                isLowTime
                  ? "bg-red-50 border-red-400 text-red-700 animate-pulse"
                  : "bg-blue-50/70 border-blue-200 text-blue-900 hc-option"
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>
                {hideTimer && !isLowTime
                  ? "Tersembunyi"
                  : formatCountdown(remainingSec)}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-1.5 sm:gap-2 flex-wrap">
            {/* Indikator Simpan Otomatis */}
            {mode === "live" && (
              <div className="text-[11px] sm:text-xs flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 hc-option">
                {saveStatus === "saving" ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                    <span>Menyimpan...</span>
                  </>
                ) : saveStatus === "error" ? (
                  <span className="text-red-600 font-medium">Gagal simpan</span>
                ) : (
                  <>
                    <Cloud className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Tersimpan</span>
                  </>
                )}
              </div>
            )}

            {/* Indikator Pelanggaran (Mode Ketat Opsi A) */}
            {mode === "live" && maxViolations > 0 && violationCount > 0 && (
              <div className="text-[11px] sm:text-xs flex items-center gap-1 px-2 py-1 rounded-full bg-rose-100 text-rose-700 font-bold border border-rose-200">
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>
                  {violationCount}/{maxViolations}
                </span>
              </div>
            )}

            {/* Timer Desktop/Tablet */}
            <div
              className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-mono font-bold ${
                isLowTime
                  ? "bg-red-50 border-red-400 text-red-700 animate-pulse"
                  : "bg-blue-50/70 border-blue-200 text-blue-900 hc-option"
              }`}
            >
              <Clock className="w-4 h-4" />
              <span>
                {hideTimer && !isLowTime
                  ? "Disembunyikan"
                  : formatCountdown(remainingSec)}
              </span>
              {!isLowTime && (
                <button
                  type="button"
                  onClick={() => setHideTimer(!hideTimer)}
                  title={hideTimer ? "Tampilkan Timer" : "Sembunyikan Timer"}
                  className="ml-1 text-slate-500 hover:text-slate-900 cursor-pointer"
                >
                  {hideTimer ? (
                    <Eye className="w-3.5 h-3.5" />
                  ) : (
                    <EyeOff className="w-3.5 h-3.5" />
                  )}
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              {/* Kontrol Aksesibilitas: Ukuran Teks & Kontras Tinggi (min tap target 44px) */}
              <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden hc-option">
                <button
                  type="button"
                  onClick={() => setTextScale((s) => Math.max(0, s - 1))}
                  title="Perkecil Teks"
                  aria-label="Perkecil ukuran teks"
                  className="min-w-[40px] min-h-[40px] sm:min-h-[36px] px-2.5 py-1.5 text-xs font-bold hover:bg-slate-100 cursor-pointer"
                >
                  A-
                </button>
                <button
                  type="button"
                  onClick={() => setTextScale((s) => Math.min(3, s + 1))}
                  title="Perbesar Teks"
                  aria-label="Perbesar ukuran teks"
                  className="min-w-[40px] min-h-[40px] sm:min-h-[36px] px-2.5 py-1.5 text-xs font-bold hover:bg-slate-100 border-l border-slate-200 cursor-pointer"
                >
                  <Type className="w-3.5 h-3.5 inline mr-0.5" aria-hidden="true" />+
                </button>
              </div>

              <button
                type="button"
                onClick={() => setHighContrast(!highContrast)}
                title="Mode Kontras Tinggi"
                aria-label={highContrast ? "Matikan mode kontras tinggi" : "Aktifkan mode kontras tinggi"}
                aria-pressed={highContrast}
                className={`min-w-[40px] min-h-[40px] sm:min-h-[36px] p-2 rounded-lg border cursor-pointer flex items-center justify-center ${
                  highContrast
                    ? "bg-yellow-400 text-black border-yellow-400"
                    : "border-slate-200 hover:bg-slate-100"
                }`}
              >
                <Contrast className="w-4 h-4" aria-hidden="true" />
              </button>

              {mode === "live" && !isFullscreen && (
                <button
                  type="button"
                  onClick={requestFullscreen}
                  title="Masuk Layar Penuh"
                  aria-label="Masuk layar penuh"
                  className="hidden sm:inline-flex p-2 rounded-lg border border-slate-200 hover:bg-slate-100 cursor-pointer"
                >
                  <Maximize className="w-4 h-4" aria-hidden="true" />
                </button>
              )}

              {/* Tombol Buka Daftar Nomor Soal khusus Mobile/Tablet */}
              <button
                type="button"
                onClick={() => setShowMobileNav(true)}
                aria-label="Buka daftar nomor soal"
                className="lg:hidden inline-flex items-center gap-1 min-h-[40px] px-3 py-1.5 rounded-lg cbt-btn-primary text-xs font-semibold cursor-pointer"
              >
                <LayoutGrid className="w-3.5 h-3.5" aria-hidden="true" />
                <span>
                  {answeredCount}/{session.questions.length}
                </span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Peringatan Sisa 5 Menit */}
      {isLowTime && (
        <div className="bg-red-600 text-white text-center text-xs sm:text-sm py-1.5 font-semibold px-4">
          Perhatian: Sisa waktu kurang dari 5 menit! Jawaban akan terkumpul otomatis saat waktu habis.
        </div>
      )}

      {/* Konten Utama: 1 Soal per Layar + Panel Nomor Soal (ruang bawah aman dari bottom bar) */}
      <div className="flex-1 max-w-6xl w-full mx-auto p-3.5 sm:p-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] lg:pb-6 grid lg:grid-cols-12 gap-5 items-start">
        {/* Area Soal */}
        <section className="lg:col-span-8 min-w-0 bg-white rounded-2xl border border-slate-200 p-4 sm:p-7 space-y-5 hc-card">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-lg bg-blue-600 text-white font-bold text-sm">
                Soal No. {currentIdx + 1}
              </span>
              <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                {questionTypeLabel(question.tipe)}
              </span>
            </div>

            <button
              type="button"
              onClick={() =>
                updateAnswer(
                  question.id,
                  currentAns.jawaban,
                  !currentAns.ragu,
                  false
                )
              }
              className={`inline-flex items-center gap-1.5 min-h-[44px] sm:min-h-[36px] px-3.5 py-2 sm:py-1.5 rounded-lg text-xs font-semibold border cursor-pointer transition ${
                currentAns.ragu
                  ? "bg-amber-400 text-slate-900 border-amber-500"
                  : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-amber-50"
              }`}
            >
              <Flag className="w-3.5 h-3.5" aria-hidden="true" />
              {currentAns.ragu ? "Ditandai Ragu-ragu" : "Tandai Ragu-ragu"}
            </button>
          </div>

          <ExamQuestionCard
            question={question}
            currentAns={currentAns}
            textSizeClass={textSizeClass}
            eliminatedOptionIds={eliminated[String(question.id)] || []}
            onToggleEliminate={toggleEliminate}
            onUpdateAnswer={updateAnswer}
          />

          {/* Navigasi Sebelumnya / Berikutnya (Desktop) */}
          <div className="hidden lg:flex items-center justify-between pt-4 border-t border-slate-200">
            <button
              type="button"
              disabled={currentIdx === 0 || isSequential}
              onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-800 text-sm font-semibold cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              Sebelumnya
            </button>

            {currentIdx < session.questions.length - 1 ? (
              <button
                type="button"
                onClick={() =>
                  setCurrentIdx((i) =>
                    Math.min(session.questions.length - 1, i + 1)
                  )
                }
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold cursor-pointer"
              >
                Berikutnya
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowConfirmModal(true)}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold cursor-pointer"
              >
                <Send className="w-4 h-4" />
                Kumpulkan Ujian
              </button>
            )}
          </div>
        </section>

        {/* Panel Daftar Nomor Soal (Desktop Sidebar) */}
        <aside className="hidden lg:block lg:col-span-4 bg-white rounded-2xl border border-slate-200 p-5 space-y-4 hc-card sticky top-20">
          <div>
            <h2 className="font-bold text-sm">Daftar Nomor Soal</h2>
            <p className="text-xs text-slate-500 hc-muted mt-0.5">
              Terjawab: {answeredCount}/{session.questions.length} • Ragu:{" "}
              {raguCount}
            </p>
          </div>
          <ExamQuestionNav
            questions={session.questions}
            answers={answers}
            currentIdx={currentIdx}
            isSequential={isSequential}
            isQuestionAnswered={isQuestionAnswered}
            onSelect={setCurrentIdx}
            onSubmitClick={() => setShowConfirmModal(true)}
            variant="desktop"
          />
        </aside>
      </div>

      {/* Bilah Navigasi Bawah Tetap Khusus Mobile/Tablet (Target Sentuh >= 44px) */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-20 bg-white border-t border-slate-200 px-3.5 pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgba(15,23,42,0.06)] hc-card">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-2.5">
          <button
            type="button"
            disabled={currentIdx === 0 || isSequential}
            onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
            className="inline-flex items-center gap-1 min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-800 text-xs sm:text-sm font-semibold cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" aria-hidden="true" />
            <span>Prev</span>
          </button>

          <button
            type="button"
            onClick={() => setShowMobileNav(true)}
            className="inline-flex items-center gap-1.5 min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 text-xs sm:text-sm font-semibold cursor-pointer hc-option"
          >
            <LayoutGrid className="w-4 h-4 text-blue-600" aria-hidden="true" />
            <span>
              No. {currentIdx + 1}/{session.questions.length}
            </span>
          </button>

          {currentIdx < session.questions.length - 1 ? (
            <button
              type="button"
              onClick={() =>
                setCurrentIdx((i) =>
                  Math.min(session.questions.length - 1, i + 1)
                )
              }
              className="inline-flex items-center gap-1 min-h-[44px] px-4 py-2.5 rounded-xl cbt-btn-primary text-xs sm:text-sm font-semibold cursor-pointer"
            >
              <span>Next</span>
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowConfirmModal(true)}
              className="inline-flex items-center gap-1.5 min-h-[44px] px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-semibold cursor-pointer"
            >
              <Send className="w-4 h-4" aria-hidden="true" />
              <span>Kumpulkan</span>
            </button>
          )}
        </div>
      </div>

      {/* Sheet Daftar Nomor Soal Khusus Mobile/Tablet */}
      {showMobileNav && (
        <div className="lg:hidden fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-[1px]"
            onClick={() => setShowMobileNav(false)}
          />
          <div className="relative z-10 w-full sm:max-w-md max-h-[82dvh] overflow-y-auto bg-white rounded-t-2xl sm:rounded-2xl border border-slate-200 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] space-y-4 hc-card">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="font-bold text-base">Daftar Nomor Soal</h2>
                <p className="text-xs text-slate-500 hc-muted">
                  Terjawab: {answeredCount}/{session.questions.length} • Ragu:{" "}
                  {raguCount}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowMobileNav(false)}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-slate-100 cursor-pointer"
                aria-label="Tutup daftar nomor"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>
            <ExamQuestionNav
              questions={session.questions}
              answers={answers}
              currentIdx={currentIdx}
              isSequential={isSequential}
              isQuestionAnswered={isQuestionAnswered}
              onSelect={(idx) => {
                setCurrentIdx(idx);
                setShowMobileNav(false);
              }}
              onSubmitClick={() => {
                setShowMobileNav(false);
                setShowConfirmModal(true);
              }}
              variant="mobile"
            />
          </div>
        </div>
      )}

      {/* Modal Konfirmasi Kumpulkan */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white text-slate-900 rounded-2xl max-w-md w-full p-6 space-y-4">
            <h3 className="font-bold text-lg">Kumpulkan Ujian Sekarang?</h3>
            <div className="text-sm text-slate-600 space-y-1.5">
              <p>
                Soal terjawab:{" "}
                <strong>
                  {answeredCount} dari {session.questions.length}
                </strong>
              </p>
              {session.questions.length - answeredCount > 0 && (
                <p className="text-amber-700 font-medium">
                  Masih ada {session.questions.length - answeredCount} soal yang belum dijawab.
                </p>
              )}
              {raguCount > 0 && (
                <p className="text-amber-700">
                  Masih ada {raguCount} soal ditandai ragu-ragu.
                </p>
              )}
              <p className="text-xs text-slate-500 pt-1">
                Setelah dikumpulkan, Anda tidak dapat mengubah jawaban lagi.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm font-medium cursor-pointer"
              >
                Periksa Lagi
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleSubmitExam}
                className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold cursor-pointer"
              >
                {submitting ? "Mengumpulkan..." : "Ya, Kumpulkan"}
              </button>
            </div>
          </div>
        </div>
      )}

      <ExamSecurityOverlays
        live={mode === "live"}
        studentWatermark={session.student_watermark}
        securityToast={securityToast}
        warningNotice={warningNotice}
        isLocked={isLocked}
        lockedReason={lockedReason}
        violationCount={violationCount}
        maxViolations={maxViolations}
        checkingUnlock={checkingUnlock}
        onDismissWarning={dismissWarning}
        onCheckUnlock={checkUnlockStatus}
      />
    </div>
  );
}
