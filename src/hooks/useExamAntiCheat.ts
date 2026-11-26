"use client";

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { WarningNotice } from "@/components/ExamSecurityOverlays";
import type { ExamSessionPayload } from "@/types/cbt";

interface UseExamAntiCheatParams {
  mode: "live" | "preview";
  supabase: SupabaseClient;
  attemptId: number;
  examId: number;
  initialViolationCount: number;
  maxViolations: number;
  initialIsLocked: boolean;
  initialLockedReason: string;
  submitting: boolean;
  autoSubmittedRef: MutableRefObject<boolean>;
  getSessionId: () => string | null;
  onSyncClock: (serverNow: string, deadline: string) => void;
  onTimeExpired: () => void;
  onConflictError: (msg: string) => void;
}

/**
 * Mengelola proteksi Anti-Curang Mode Ketat (Opsi A):
 * - Deteksi pindah tab, kehilangan fokus jendela, keluar layar penuh, & split-screen
 * - Blokir klik kanan, copy/cut/paste, dan pintasan DevTools/cetak
 * - Peringatan bertingkat + kunci layar server-side & polling status buka kunci pengawas
 */
export function useExamAntiCheat({
  mode,
  supabase,
  attemptId,
  examId,
  initialViolationCount,
  maxViolations,
  initialIsLocked,
  initialLockedReason,
  submitting,
  autoSubmittedRef,
  getSessionId,
  onSyncClock,
  onTimeExpired,
  onConflictError,
}: UseExamAntiCheatParams) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [violationCount, setViolationCount] = useState<number>(initialViolationCount);
  const [isLocked, setIsLocked] = useState<boolean>(initialIsLocked);
  const [lockedReason, setLockedReason] = useState<string>(initialLockedReason);
  const [warningNotice, setWarningNotice] = useState<WarningNotice | null>(null);
  const [securityToast, setSecurityToast] = useState("");
  const [checkingUnlock, setCheckingUnlock] = useState(false);

  const lastViolationTsRef = useRef<number>(0);
  const lastCopyLogTsRef = useRef<number>(0);
  const baselineViewportRef = useRef<{ w: number; h: number } | null>(null);

  const lockAttempt = useCallback((reason: string) => {
    setIsLocked(true);
    setLockedReason(reason);
    setWarningNotice(null);
  }, []);

  const requestFullscreen = useCallback(() => {
    document.documentElement.requestFullscreen?.().catch(() => {});
  }, []);

  const dismissWarning = useCallback(() => {
    setWarningNotice(null);
    requestFullscreen();
  }, [requestFullscreen]);

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
        p_attempt_id: attemptId,
        p_jenis: jenis,
        p_session_id: getSessionId(),
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
      const locked = Boolean(res?.is_locked || (limit > 0 && nextCount >= limit));

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
    [
      mode,
      isLocked,
      submitting,
      autoSubmittedRef,
      supabase,
      attemptId,
      getSessionId,
      violationCount,
      maxViolations,
    ]
  );

  // Deteksi Anti-Curang: Pindah Tab, Minimize/Blur, Keluar Layar Penuh, Split-Screen, & Copy-Paste
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
          p_attempt_id: attemptId,
          p_jenis: "copy_paste",
          p_session_id: getSessionId(),
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
          (key === "c" ||
            key === "v" ||
            key === "x" ||
            key === "u" ||
            key === "s" ||
            key === "p")) ||
        ((e.ctrlKey || e.metaKey) &&
          e.shiftKey &&
          (key === "i" || key === "j" || key === "c"))
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
  }, [mode, recordViolation, supabase, attemptId, getSessionId]);

  // Cek otomatis apakah Pengawas/Admin sudah mengklik "Buka Kunci" di Monitoring
  const checkUnlockStatus = useCallback(async () => {
    if (mode !== "live") return;
    setCheckingUnlock(true);
    try {
      const { data, error } = await supabase.rpc("start_or_resume_exam", {
        p_exam_id: examId,
        p_token: null,
        p_session_id: getSessionId(),
      });
      if (error) {
        const msg = error.message || "";
        if (msg.includes("TIME_EXPIRED")) {
          onTimeExpired();
        } else if (msg.includes("SESSION_CONFLICT") || msg.includes("BLOCKED")) {
          onConflictError(msg);
        }
        return;
      }
      const resumed = data as ExamSessionPayload | null;
      if (resumed && !resumed.is_locked) {
        setIsLocked(false);
        setLockedReason("");
        setViolationCount(resumed.pelanggaran_count ?? 0);
        if (resumed.deadline && resumed.server_now) {
          onSyncClock(resumed.server_now, resumed.deadline);
        }
      }
    } finally {
      setCheckingUnlock(false);
    }
  }, [
    mode,
    supabase,
    examId,
    getSessionId,
    onTimeExpired,
    onConflictError,
    onSyncClock,
  ]);

  useEffect(() => {
    if (mode !== "live" || !isLocked) return;
    const interval = setInterval(() => {
      checkUnlockStatus();
    }, 6000);
    return () => clearInterval(interval);
  }, [mode, isLocked, checkUnlockStatus]);

  return {
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
  };
}
