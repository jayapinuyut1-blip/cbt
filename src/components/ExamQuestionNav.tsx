"use client";

import { CheckCircle2 } from "lucide-react";
import type { SanitizedQuestion, SavedAnswerState } from "@/types/cbt";

interface Props {
  questions: SanitizedQuestion[];
  answers: Record<string, SavedAnswerState>;
  currentIdx: number;
  isSequential: boolean;
  isQuestionAnswered: (q: SanitizedQuestion, ans?: SavedAnswerState) => boolean;
  onSelect: (idx: number) => void;
  onSubmitClick: () => void;
  variant?: "desktop" | "mobile";
}

/**
 * Grid daftar nomor soal + legenda status + tombol kumpulkan.
 * Dipakai bersama di sidebar desktop dan bottom sheet mobile ExamWorkspace.
 */
export default function ExamQuestionNav({
  questions,
  answers,
  currentIdx,
  isSequential,
  isQuestionAnswered,
  onSelect,
  onSubmitClick,
  variant = "desktop",
}: Props) {
  return (
    <>
      {isSequential && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
          Mode Berurutan: Anda tidak dapat kembali ke nomor sebelumnya.
        </p>
      )}

      <div
        className={
          variant === "mobile"
            ? "grid grid-cols-5 sm:grid-cols-6 gap-2"
            : "grid grid-cols-5 gap-2"
        }
      >
        {questions.map((q, idx) => {
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
              onClick={() => onSelect(idx)}
              className={`${
                variant === "mobile" ? "h-11" : "h-10"
              } rounded-lg border text-sm transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${btnStyle} ${
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
        onClick={onSubmitClick}
        className="w-full min-h-[44px] py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl text-sm flex items-center justify-center gap-2 cursor-pointer"
      >
        <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
        Selesai &amp; Kumpulkan
      </button>
    </>
  );
}
