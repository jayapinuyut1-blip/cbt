"use client";

import { useState } from "react";
import {
  MATH_SNIPPETS,
  UNICODE_MATH_SYMBOLS,
  type MathSnippet,
} from "@/lib/math-format";
import { Calculator, Sparkles } from "lucide-react";

interface MathToolbarProps {
  activeFieldLabel: string;
  /** Jika true (misal kolom pasangan kanan Menjodohkan), tampilkan tab Simbol Unicode sebagai default */
  unicodeOnlyField?: boolean;
  onInsertSnippet: (snippet: MathSnippet) => void;
  onInsertSymbol: (symbol: string) => void;
}

/**
 * Toolbar rumus matematika & simbol cepat untuk editor soal manual guru.
 * Menggunakan onMouseDown preventDefault agar fokus & posisi kursor input aktif tidak hilang saat tombol diklik.
 */
export default function MathToolbar({
  activeFieldLabel,
  unicodeOnlyField = false,
  onInsertSnippet,
  onInsertSymbol,
}: MathToolbarProps) {
  const [tab, setTab] = useState<"rumus" | "simbol">("rumus");
  const effectiveTab = unicodeOnlyField ? "simbol" : tab;

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/90 p-2.5 sm:p-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Calculator className="w-4 h-4 text-blue-700 shrink-0" aria-hidden="true" />
          <span className="text-xs font-semibold text-slate-800">
            Sisipkan Rumus & Simbol
          </span>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-600">
            Target: <strong className="text-slate-900">{activeFieldLabel}</strong>
          </span>
        </div>

        <div className="inline-flex rounded-lg bg-white border border-slate-200 p-0.5 text-xs">
          <button
            type="button"
            disabled={unicodeOnlyField}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setTab("rumus")}
            className={`px-2.5 py-1 rounded-md font-medium transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
              effectiveTab === "rumus"
                ? "bg-blue-600 text-white"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Rumus (KaTeX)
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setTab("simbol")}
            className={`px-2.5 py-1 rounded-md font-medium transition cursor-pointer ${
              effectiveTab === "simbol"
                ? "bg-blue-600 text-white"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Simbol Cepat
          </button>
        </div>
      </div>

      {effectiveTab === "rumus" ? (
        <div className="flex flex-wrap gap-1.5">
          {MATH_SNIPPETS.map((item) => (
            <button
              key={item.label}
              type="button"
              title={`${item.title} (${item.insert})`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onInsertSnippet(item)}
              className="min-h-[34px] px-2.5 py-1 rounded-lg bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-300 text-xs font-semibold text-slate-800 transition cursor-pointer"
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap gap-1">
          {UNICODE_MATH_SYMBOLS.map((sym) => (
            <button
              key={sym.char}
              type="button"
              title={sym.title}
              aria-label={sym.title}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onInsertSymbol(sym.char)}
              className="min-w-[34px] min-h-[34px] px-2 py-1 rounded-lg bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-300 text-sm font-medium text-slate-800 transition cursor-pointer"
            >
              {sym.char}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-start gap-1.5 text-[11px] text-slate-600 leading-snug">
        <Sparkles className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
        <span>
          {unicodeOnlyField ? (
            <>
              Kolom ini tampil di pilihan dropdown/isian, jadi gunakan{" "}
              <strong>Simbol Cepat (Unicode)</strong> seperti <code>x²</code> atau{" "}
              <code>H₂O</code>.
            </>
          ) : (
            <>
              <strong>Smart Paste Word aktif:</strong> copy-paste pangkat/indeks/equation dari
              Word langsung dikonversi otomatis. Bisa juga{" "}
              <strong>Ctrl+V screenshot</strong> rumus/grafik langsung sebagai gambar soal.
            </>
          )}
        </span>
      </div>
    </div>
  );
}
