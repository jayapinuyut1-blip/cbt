"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SESSION_COOKIE_NAME } from "@/lib/auth-utils";
import { formatCountdown, questionTypeLabel } from "@/lib/format";
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
  CheckCircle2,
  AlertTriangle,
  Contrast,
  Type,
  Maximize,
  Strikethrough,
  Send,
  Cloud,
  Loader2,
  LayoutGrid,
  X,
  Lock,
  ShieldAlert,
  RefreshCw,
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
  const [isFullscreen, setIsFullscreen] = useState(false);

  // State Anti-Curang Mode Ketat (Opsi A: Peringatan Bertingkat + Kunci Layar Server-Side)
  const maxViolations =
    session.maks_pelanggaran ?? session.exam.maks_pelanggaran ?? 3;
  const [violationCount, setViolationCount] = useState<number>(
    session.pelanggaran_count ?? 0
  );
  const [isLocked, setIsLocked] = useState<boolean>(Boolean(session.is_locked));
  const [lockedReason, setLockedReason] = useState<string>(
    session.locked_reason || ""
  );
  const [warningNotice, setWarningNotice] = useState<{
    count: number;
    max: number;
    reason: string;
  } | null>(null);
  const [securityToast, setSecurityToast] = useState("");
  const [checkingUnlock, setCheckingUnlock] = useState(false);

  const lastViolationTsRef = useRef<number>(0);
  const lastCopyLogTsRef = useRef<number>(0);
  const baselineViewportRef = useRef<{ w: number; h: number } | null>(null);

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
          setIsLocked(true);
          setLockedReason(
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
          serverOffsetRef.current =
            new Date(data.server_now).getTime() - Date.now();
          deadlineMsRef.current = new Date(data.deadline).getTime();
        }
      }
    },
    [mode, supabase, session.attempt_id, router]
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

  // Fungsi catat pelanggaran ke server + tampilkan peringatan / kunci layar (Mode Ketat Opsi A)
  const recordViolation = useCallback(
    async (
      jenis: "pindah_tab" | "keluar_layar_penuh" | "split_screen",
      humanReason: string
    ) => {
      if (mode !== "live" || isLocked || submitting || autoSubmittedRef.current) {
        return;
      }
      // Cooldown 2.5 detik agar 1 perpindahan tab tidak terhitung ganda oleh blur + visibilitychange
      const now = Date.now();
      if (now - lastViolationTsRef.current < 2500) return;
      lastViolationTsRef.current = now;

      const { data } = await supabase.rpc("log_attempt_event", {
        p_attempt_id: session.attempt_id,
        p_jenis: jenis,
        p_session_id: getClientSessionCookie(),
      });

      const res = data as
        | {
            ok?: boolean;
            pelanggaran_count?: number;
            maks_pelanggaran?: number;
            is_locked?: boolean;
            locked_reason?: string | null;
          }
        | null;

      const nextCount =
        typeof res?.pelanggaran_count === "number"
          ? res.pelanggaran_count
          : violationCount + 1;
      const limit =
        typeof res?.maks_pelanggaran === "number"
          ? res.maks_pelanggaran
          : maxViolations;
      const locked = Boolean(
        res?.is_locked || (limit > 0 && nextCount >= limit)
      );

      setViolationCount(nextCount);
      if (locked) {
        setIsLocked(true);
        setLockedReason(
          res?.locked_reason ||
            `Melebihi batas pelanggaran (${nextCount}/${limit}): ${humanReason}`
        );
        setWarningNotice(null);
      } else if (limit > 0) {
        setWarningNotice({
          count: nextCount,
          max: limit,
          reason: humanReason,
        });
      }
    },
    [mode, isLocked, submitting, supabase, session.attempt_id, violationCount, maxViolations]
  );

  // Deteksi Anti-Curang: Pindah Tab, Minimize/Blur, Keluar Layar Penuh, & Split-Screen
  useEffect(() => {
    if (mode !== "live") return;

    baselineViewportRef.current = {
      w: window.innerWidth,
      h: window.innerHeight,
    };

    function handleVisibility() {
      if (document.hidden) {
        recordViolation("pindah_tab", "Berpindah tab atau keluar dari browser");
      }
    }

    function handleWindowBlur() {
      // Tunda sedikit agar klik elemen form/select internal tidak false positive
      setTimeout(() => {
        if (!document.hasFocus() && !document.hidden) {
          recordViolation(
            "pindah_tab",
            "Berpindah ke aplikasi / jendela lain (kehilangan fokus)"
          );
        }
      }, 250);
    }

    function handleFullscreenChange() {
      const inFs = Boolean(document.fullscreenElement);
      setIsFullscreen(inFs);
      if (!inFs) {
        recordViolation("keluar_layar_penuh", "Keluar dari mode layar penuh");
      }
    }

    function handleResize() {
      const base = baselineViewportRef.current;
      if (!base) return;
      // Abaikan jika keyboard HP muncul saat siswa mengetik di input/textarea
      const activeTag = document.activeElement?.tagName?.toLowerCase();
      const isTyping = activeTag === "input" || activeTag === "textarea";
      const wRatio = window.innerWidth / Math.max(1, base.w);
      const hRatio = window.innerHeight / Math.max(1, base.h);
      if (wRatio < 0.65 || (!isTyping && hRatio < 0.62)) {
        recordViolation(
          "split_screen",
          "Layar mengecil drastis / mode layar terbagi (split-screen)"
        );
      } else if (window.innerWidth > base.w && window.innerHeight > base.h) {
        baselineViewportRef.current = {
          w: window.innerWidth,
          h: window.innerHeight,
        };
      }
    }

    // Blokir Copy, Cut, Paste, Klik Kanan, dan Pintasan Keyboard (Ctrl+C/V/U, F12)
    function notifyBlockedCopy(msg: string) {
      setSecurityToast(msg);
      setTimeout(() => setSecurityToast(""), 2500);
      const now = Date.now();
      if (now - lastCopyLogTsRef.current > 10000) {
        lastCopyLogTsRef.current = now;
        supabase.rpc("log_attempt_event", {
          p_attempt_id: session.attempt_id,
          p_jenis: "copy_paste",
          p_session_id: getClientSessionCookie(),
        });
      }
    }

    function handleContextMenu(e: MouseEvent) {
      e.preventDefault();
      notifyBlockedCopy("Klik kanan dinonaktifkan selama ujian.");
    }

    function handleClipboard(e: ClipboardEvent) {
      e.preventDefault();
      notifyBlockedCopy("Salin / tempel (Copy-Paste) diblokir selama ujian.");
    }

    function handleKeyDown(e: KeyboardEvent) {
      const key = e.key.toLowerCase();
      if (
        e.key === "F12" ||
        ((e.ctrlKey || e.metaKey) &&
          (key === "c" || key === "v" || key === "x" || key === "u" || key === "s" || key === "p")) ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && (key === "i" || key === "j" || key === "c"))
      ) {
        e.preventDefault();
        notifyBlockedCopy("Pintasan keyboard ini dinonaktifkan selama ujian.");
      }
    }

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("blur", handleWindowBlur);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    window.addEventListener("resize", handleResize);
    document.addEventListener("contextmenu", handleContextMenu);
    document.addEventListener("copy", handleClipboard);
    document.addEventListener("cut", handleClipboard);
    document.addEventListener("paste", handleClipboard);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("blur", handleWindowBlur);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      window.removeEventListener("resize", handleResize);
      document.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("copy", handleClipboard);
      document.removeEventListener("cut", handleClipboard);
      document.removeEventListener("paste", handleClipboard);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [mode, recordViolation, supabase, session.attempt_id]);

  // Cek otomatis apakah Pengawas/Admin sudah mengklik "Buka Kunci" di Monitoring
  const checkUnlockStatus = useCallback(async () => {
    if (mode !== "live") return;
    setCheckingUnlock(true);
    try {
      const { data, error } = await supabase.rpc("start_or_resume_exam", {
        p_exam_id: session.exam.id,
        p_token: null,
        p_session_id: getClientSessionCookie(),
      });
      if (error) {
        const msg = error.message || "";
        if (msg.includes("TIME_EXPIRED")) {
          router.push(`/siswa/hasil/${session.attempt_id}`);
        } else if (msg.includes("SESSION_CONFLICT") || msg.includes("BLOCKED")) {
          setConflictError(msg);
        }
        return;
      }
      const resumed = data as ExamSessionPayload | null;
      if (resumed && !resumed.is_locked) {
        setIsLocked(false);
        setLockedReason("");
        setViolationCount(resumed.pelanggaran_count ?? 0);
        if (resumed.deadline && resumed.server_now) {
          serverOffsetRef.current =
            new Date(resumed.server_now).getTime() - Date.now();
          deadlineMsRef.current = new Date(resumed.deadline).getTime();
        }
      }
    } finally {
      setCheckingUnlock(false);
    }
  }, [mode, supabase, session.exam.id, session.attempt_id, router]);

  useEffect(() => {
    if (mode !== "live" || !isLocked) return;
    const interval = setInterval(() => {
      checkUnlockStatus();
    }, 6000);
    return () => clearInterval(interval);
  }, [mode, isLocked, checkUnlockStatus]);

  function requestFullscreen() {
    document.documentElement.requestFullscreen?.().catch(() => {});
  }

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
            <strong>PRATINJAU GURU</strong> — Tampilan identik dengan layar siswa.
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
              {/* Kontrol Aksesibilitas: Ukuran Teks & Kontras Tinggi */}
              <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden hc-option">
                <button
                  type="button"
                  onClick={() => setTextScale((s) => Math.max(0, s - 1))}
                  title="Perkecil Teks"
                  className="px-2 py-1.5 text-xs font-bold hover:bg-slate-100 cursor-pointer"
                >
                  A-
                </button>
                <button
                  type="button"
                  onClick={() => setTextScale((s) => Math.min(3, s + 1))}
                  title="Perbesar Teks"
                  className="px-2 py-1.5 text-xs font-bold hover:bg-slate-100 border-l border-slate-200 cursor-pointer"
                >
                  <Type className="w-3.5 h-3.5 inline mr-0.5" />+
                </button>
              </div>

              <button
                type="button"
                onClick={() => setHighContrast(!highContrast)}
                title="Mode Kontras Tinggi"
                className={`p-1.5 sm:p-2 rounded-lg border cursor-pointer ${
                  highContrast
                    ? "bg-yellow-400 text-black border-yellow-400"
                    : "border-slate-200 hover:bg-slate-100"
                }`}
              >
                <Contrast className="w-4 h-4" />
              </button>

              {mode === "live" && !isFullscreen && (
                <button
                  type="button"
                  onClick={requestFullscreen}
                  title="Masuk Layar Penuh"
                  className="hidden sm:inline-flex p-2 rounded-lg border border-slate-200 hover:bg-slate-100 cursor-pointer"
                >
                  <Maximize className="w-4 h-4" />
                </button>
              )}

              {/* Tombol Buka Daftar Nomor Soal khusus Mobile/Tablet */}
              <button
                type="button"
                onClick={() => setShowMobileNav(true)}
                className="lg:hidden inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold cursor-pointer"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
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

      {/* Konten Utama: 1 Soal per Layar + Panel Nomor Soal */}
      <div className="flex-1 max-w-6xl w-full mx-auto p-3.5 sm:p-4 pb-24 lg:pb-6 grid lg:grid-cols-12 gap-5 items-start">
        {/* Area Soal */}
        <section className="lg:col-span-8 bg-white rounded-2xl border border-slate-200 p-5 sm:p-7 space-y-5 hc-card">
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-lg bg-blue-600 text-white font-bold text-sm">
                Soal No. {currentIdx + 1}
              </span>
              <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600">
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
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer transition ${
                currentAns.ragu
                  ? "bg-amber-400 text-slate-900 border-amber-500"
                  : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-amber-50"
              }`}
            >
              <Flag className="w-3.5 h-3.5" />
              {currentAns.ragu ? "Ditandai Ragu-ragu" : "Tandai Ragu-ragu"}
            </button>
          </div>

          {/* Teks & Gambar Soal (Anti-seleksi teks) */}
          <div className={`${textSizeClass} leading-relaxed whitespace-pre-wrap select-none`}>
            {question.teks}
          </div>

          {question.gambar && (
            <div>
              <img
                src={question.gambar}
                alt="Gambar soal"
                className="max-h-80 rounded-xl border border-slate-200 object-contain"
              />
            </div>
          )}

          {/* Input Jawaban Sesuai 4 Tipe */}
          {question.tipe === "pg" && (
            <div className="space-y-2.5 pt-2">
              {(question.options || []).map((opt, idx) => {
                const letter = String.fromCharCode(65 + idx);
                const selected = currentAns.jawaban.option_id === opt.id;
                const isElim = (eliminated[String(question.id)] || []).includes(
                  opt.id
                );
                return (
                  <div key={opt.id} className="flex items-stretch gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        updateAnswer(
                          question.id,
                          { option_id: opt.id },
                          undefined,
                          false
                        )
                      }
                      className={`flex-1 text-left px-4 py-3 rounded-xl border-2 flex items-start gap-3 transition cursor-pointer ${
                        selected
                          ? "border-blue-600 bg-blue-50 text-blue-950 font-medium hc-option-selected"
                          : "border-slate-200 hover:border-blue-300 bg-white hc-option"
                      } ${isElim ? "opacity-45 line-through" : ""}`}
                    >
                      <span
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                          selected
                            ? "bg-blue-600 text-white"
                            : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {letter}
                      </span>
                      <span className={`${textSizeClass} pt-0.5 select-none`}>{opt.teks}</span>
                    </button>

                    {/* Tombol Coret Opsi (Bluebook-style) */}
                    <button
                      type="button"
                      onClick={() => toggleEliminate(question.id, opt.id)}
                      title={isElim ? "Batal Coret Opsi" : "Coret Opsi Salah"}
                      className={`px-3 rounded-xl border text-xs flex items-center justify-center cursor-pointer ${
                        isElim
                          ? "bg-slate-800 text-white border-slate-800"
                          : "bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      <Strikethrough className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {question.tipe === "isian" && (
            <div className="pt-2">
              <label className="block text-xs font-medium text-slate-500 hc-muted mb-1.5">
                Ketik jawaban singkat Anda:
              </label>
              <input
                type="text"
                value={currentAns.jawaban.text || ""}
                onChange={(e) =>
                  updateAnswer(
                    question.id,
                    { text: e.target.value },
                    undefined,
                    true
                  )
                }
                placeholder="Tulis jawaban di sini..."
                className={`w-full px-4 py-3 rounded-xl border-2 border-slate-300 focus:border-blue-600 focus:outline-none bg-white text-slate-900 ${textSizeClass}`}
              />
            </div>
          )}

          {question.tipe === "jodoh" && (
            <div className="space-y-3 pt-2">
              <div className="text-xs text-slate-500 hc-muted">
                Pasangkan setiap pernyataan di sisi kiri dengan pilihan yang tepat di sisi kanan:
              </div>
              {(question.left_items || []).map((item, idx) => {
                const pairs = currentAns.jawaban.pairs || {};
                const selectedRight = pairs[String(item.id)] || "";
                return (
                  <div
                    key={item.id}
                    className="grid sm:grid-cols-12 gap-2.5 items-center p-3 rounded-xl border border-slate-200 bg-slate-50 hc-option"
                  >
                    <div className={`sm:col-span-6 font-medium ${textSizeClass}`}>
                      {idx + 1}. {item.teks}
                    </div>
                    <div className="sm:col-span-6">
                      <select
                        value={selectedRight}
                        onChange={(e) => {
                          const nextPairs = {
                            ...pairs,
                            [String(item.id)]: e.target.value,
                          };
                          updateAnswer(
                            question.id,
                            { pairs: nextPairs },
                            undefined,
                            false
                          );
                        }}
                        className="w-full px-3 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-900 text-sm"
                      >
                        <option value="">-- Pilih pasangan --</option>
                        {(question.right_items || []).map((rText, rIdx) => (
                          <option key={rIdx} value={rText}>
                            {rText}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {question.tipe === "essay" && (
            <div className="pt-2 space-y-1.5">
              <label className="block text-xs font-medium text-slate-500 hc-muted">
                Tuliskan jawaban uraian Anda:
              </label>
              <textarea
                rows={7}
                value={currentAns.jawaban.text || ""}
                onChange={(e) =>
                  updateAnswer(
                    question.id,
                    { text: e.target.value },
                    undefined,
                    true
                  )
                }
                placeholder="Ketik jawaban lengkap di sini..."
                className={`w-full px-4 py-3 rounded-xl border-2 border-slate-300 focus:border-blue-600 focus:outline-none bg-white text-slate-900 ${textSizeClass}`}
              />
              <div className="text-xs text-slate-400 text-right">
                {(currentAns.jawaban.text || "").trim().split(/\s+/).filter(Boolean).length}{" "}
                kata
              </div>
            </div>
          )}

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
            {isSequential && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mt-2">
                Mode Berurutan: Anda tidak dapat kembali ke nomor sebelumnya.
              </p>
            )}
          </div>

          <div className="grid grid-cols-5 gap-2">
            {session.questions.map((q, idx) => {
              const st = answers[String(q.id)];
              const answered = isQuestionAnswered(q, st);
              const ragu = Boolean(st?.ragu);
              const isCurrent = idx === currentIdx;
              const disabled = isSequential && idx < currentIdx;

              let btnStyle =
                "bg-slate-50 border-slate-300 text-slate-700 hover:border-blue-400";
              if (ragu) {
                btnStyle = "bg-amber-400 border-amber-500 text-slate-900 font-bold";
              } else if (answered) {
                btnStyle =
                  "bg-emerald-600 border-emerald-600 text-white font-bold";
              }

              return (
                <button
                  key={q.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => setCurrentIdx(idx)}
                  className={`h-10 rounded-lg border text-sm transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${btnStyle} ${
                    isCurrent ? "ring-2 ring-blue-600 ring-offset-2" : ""
                  }`}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-3 text-xs text-slate-500 hc-muted pt-2 border-t border-slate-200">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-emerald-600 inline-block" />
              Dijawab
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-amber-400 inline-block" />
              Ragu-ragu
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded border border-slate-400 bg-slate-50 inline-block" />
              Belum
            </span>
          </div>

          <button
            type="button"
            onClick={() => setShowConfirmModal(true)}
            className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl text-sm flex items-center justify-center gap-2 cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4" />
            Selesai & Kumpulkan
          </button>
        </aside>
      </div>

      {/* Bilah Navigasi Bawah Tetap Khusus Mobile/Tablet (Tema Identik Desktop) */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-20 bg-white/95 backdrop-blur border-t border-slate-200 px-3.5 pt-2.5 pb-[max(0.65rem,env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgba(15,23,42,0.06)] hc-card">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-2">
          <button
            type="button"
            disabled={currentIdx === 0 || isSequential}
            onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
            className="inline-flex items-center gap-1 px-3.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-800 text-xs sm:text-sm font-semibold cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Prev</span>
          </button>

          <button
            type="button"
            onClick={() => setShowMobileNav(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 text-xs sm:text-sm font-semibold cursor-pointer hc-option"
          >
            <LayoutGrid className="w-4 h-4 text-blue-600" />
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
              className="inline-flex items-center gap-1 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-semibold cursor-pointer"
            >
              <span>Next</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowConfirmModal(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-semibold cursor-pointer"
            >
              <Send className="w-4 h-4" />
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
                className="p-2 rounded-lg hover:bg-slate-100 cursor-pointer"
                aria-label="Tutup daftar nomor"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {isSequential && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                Mode Berurutan: Anda tidak dapat kembali ke nomor sebelumnya.
              </p>
            )}

            <div className="grid grid-cols-5 sm:grid-cols-6 gap-2">
              {session.questions.map((q, idx) => {
                const st = answers[String(q.id)];
                const answered = isQuestionAnswered(q, st);
                const ragu = Boolean(st?.ragu);
                const isCurrent = idx === currentIdx;
                const disabled = isSequential && idx < currentIdx;

                let btnStyle =
                  "bg-slate-50 border-slate-300 text-slate-700";
                if (ragu) {
                  btnStyle = "bg-amber-400 border-amber-500 text-slate-900 font-bold";
                } else if (answered) {
                  btnStyle =
                    "bg-emerald-600 border-emerald-600 text-white font-bold";
                }

                return (
                  <button
                    key={q.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      setCurrentIdx(idx);
                      setShowMobileNav(false);
                    }}
                    className={`h-11 rounded-lg border text-sm transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${btnStyle} ${
                      isCurrent ? "ring-2 ring-blue-600 ring-offset-2" : ""
                    }`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap gap-3 text-xs text-slate-500 hc-muted pt-2 border-t border-slate-200">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-emerald-600 inline-block" />
                Dijawab
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-amber-400 inline-block" />
                Ragu-ragu
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded border border-slate-400 bg-slate-50 inline-block" />
                Belum
              </span>
            </div>

            <button
              type="button"
              onClick={() => {
                setShowMobileNav(false);
                setShowConfirmModal(true);
              }}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl text-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              Selesai & Kumpulkan
            </button>
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

      {/* Watermark Transparan Identitas Siswa (Anti Foto / Sebar Soal) */}
      {mode === "live" && session.student_watermark && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-10 overflow-hidden select-none opacity-[0.045] flex flex-wrap items-center justify-around gap-16 -rotate-12 scale-110"
        >
          {Array.from({ length: 12 }).map((_, i) => (
            <span
              key={i}
              className="text-sm sm:text-base font-extrabold tracking-widest uppercase text-slate-900 whitespace-nowrap"
            >
              {session.student_watermark}
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
                  Peringatan Keamanan Ujian ({warningNotice.count}/{warningNotice.max})
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
                Jika mencapai <strong>{warningNotice.max}x pelanggaran</strong>, layar ujian Anda akan <strong>TERKUNCI OTOMATIS</strong> dan hanya dapat dibuka kembali oleh Pengawas Ujian.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setWarningNotice(null);
                requestFullscreen();
              }}
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

            {session.student_watermark && (
              <div className="px-3 py-2 rounded-xl bg-slate-100 text-xs font-semibold text-slate-700">
                Peserta: {session.student_watermark}
              </div>
            )}

            <div className="text-xs text-left bg-rose-50 border border-rose-200 text-rose-900 rounded-xl p-3.5 space-y-1.5">
              <p className="font-semibold">Cara membuka kunci ujian:</p>
              <ol className="list-decimal pl-4 space-y-1">
                <li>Tetap di halaman ini (jawaban sebelumnya sudah tersimpan aman).</li>
                <li>Angkat tangan dan lapor kepada Pengawas di ruang ujian.</li>
                <li>Pengawas akan mengklik <strong>Buka Kunci</strong> pada halaman Monitoring.</li>
                <li>Halaman ini akan terbuka otomatis begitu Pengawas menyetujui.</li>
              </ol>
            </div>

            <button
              type="button"
              disabled={checkingUnlock}
              onClick={checkUnlockStatus}
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
    </div>
  );
}
