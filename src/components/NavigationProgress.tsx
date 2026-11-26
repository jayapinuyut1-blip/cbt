"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

function NavigationProgressInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = `${pathname}?${searchParams?.toString() || ""}`;

  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showPill, setShowPill] = useState(false);

  const activeRef = useRef(false);
  const trickleRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pillTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (trickleRef.current) {
      clearInterval(trickleRef.current);
      trickleRef.current = null;
    }
    if (pillTimerRef.current) {
      clearTimeout(pillTimerRef.current);
      pillTimerRef.current = null;
    }
    if (finishTimerRef.current) {
      clearTimeout(finishTimerRef.current);
      finishTimerRef.current = null;
    }
    if (safetyTimerRef.current) {
      clearTimeout(safetyTimerRef.current);
      safetyTimerRef.current = null;
    }
  }, []);

  const done = useCallback(() => {
    if (!activeRef.current) return;
    activeRef.current = false;
    clearTimers();
    setProgress(100);
    setShowPill(false);
    finishTimerRef.current = setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, 220);
  }, [clearTimers]);

  const start = useCallback(() => {
    clearTimers();
    activeRef.current = true;
    setVisible(true);
    setProgress(18);
    setShowPill(false);

    // Tampilkan badge "Memuat halaman..." hanya jika navigasi > 200ms agar tidak berkedip
    pillTimerRef.current = setTimeout(() => {
      if (activeRef.current) setShowPill(true);
    }, 200);

    // Progres bertahap mendekati 90%
    trickleRef.current = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 90) return prev;
        const step = prev < 50 ? 10 : prev < 75 ? 5 : 2;
        return Math.min(90, prev + step);
      });
    }, 220);

    // Pengaman maksimal 9 detik agar tidak pernah macet bila navigasi dibatalkan
    safetyTimerRef.current = setTimeout(() => {
      done();
    }, 9000);
  }, [clearTimers, done]);

  // Selesaikan animasi setiap kali rute tujuan selesai dirender
  useEffect(() => {
    done();
  }, [routeKey, done]);

  // Deteksi klik pada link internal (<Link> / <a>) dan tombol back/forward browser
  useEffect(() => {
    function handleDocumentClick(e: MouseEvent) {
      if (
        e.defaultPrevented ||
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      ) {
        return;
      }

      const target = e.target as HTMLElement | null;
      const anchor = target?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;

      const rawHref = anchor.getAttribute("href") || "";
      if (
        !rawHref ||
        rawHref.startsWith("#") ||
        rawHref.startsWith("mailto:") ||
        rawHref.startsWith("tel:") ||
        rawHref.startsWith("javascript:")
      ) {
        return;
      }

      try {
        const dest = new URL(anchor.href, window.location.href);
        if (dest.origin !== window.location.origin) return;
        const samePath =
          dest.pathname === window.location.pathname &&
          dest.search === window.location.search;
        if (samePath) return;
        start();
      } catch {
        // Abaikan URL tidak valid
      }
    }

    function handlePopState() {
      start();
    }

    document.addEventListener("click", handleDocumentClick, true);
    window.addEventListener("popstate", handlePopState);
    return () => {
      document.removeEventListener("click", handleDocumentClick, true);
      window.removeEventListener("popstate", handlePopState);
      clearTimers();
    };
  }, [start, clearTimers]);

  if (!visible) return null;

  return (
    <div className="no-print pointer-events-none" aria-live="polite">
      {/* Bilah progres tipis di bagian paling atas layar (mengikuti warna tema aktif) */}
      <div className="fixed top-0 left-0 right-0 z-[100] h-[3px] bg-transparent overflow-hidden">
        <div
          className="h-full cbt-progress-bar transition-[width] duration-200 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Pil indikator ringan saat memuat halaman > 200ms */}
      {showPill && (
        <div className="fixed bottom-4 right-4 z-[99] flex items-center gap-2 px-3.5 py-2 rounded-full bg-slate-900/90 text-white text-xs font-medium shadow-lg backdrop-blur-sm animate-cbt-fade-in">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-300" />
          <span>Memuat halaman...</span>
        </div>
      )}
    </div>
  );
}

export default function NavigationProgress() {
  return (
    <Suspense fallback={null}>
      <NavigationProgressInner />
    </Suspense>
  );
}
