"use client";

import { Strikethrough } from "lucide-react";
import type {
  AnswerPayload,
  SanitizedQuestion,
  SavedAnswerState,
} from "@/types/cbt";

interface Props {
  question: SanitizedQuestion;
  currentAns: SavedAnswerState;
  textSizeClass: string;
  eliminatedOptionIds: number[];
  onToggleEliminate: (questionId: number, optionId: number) => void;
  onUpdateAnswer: (
    questionId: number,
    nextJawaban: AnswerPayload,
    nextRagu?: boolean,
    debounce?: boolean
  ) => void;
}

/**
 * Merender teks soal, gambar, dan input jawaban untuk 4 tipe soal (PG, Isian, Menjodohkan, Essay).
 */
export default function ExamQuestionCard({
  question,
  currentAns,
  textSizeClass,
  eliminatedOptionIds,
  onToggleEliminate,
  onUpdateAnswer,
}: Props) {
  return (
    <>
      {/* Teks & Gambar Soal (Anti-seleksi teks, aman dari horizontal overflow) */}
      <div
        className={`${textSizeClass} leading-relaxed whitespace-pre-wrap break-words select-none`}
      >
        {question.teks}
      </div>

      {question.gambar && (
        <div>
          <img
            src={question.gambar}
            alt="Gambar soal"
            className="max-w-full h-auto max-h-80 rounded-xl border border-slate-200 object-contain"
          />
        </div>
      )}

      {/* Input Jawaban Sesuai 4 Tipe */}
      {question.tipe === "pg" && (
        <div className="space-y-2.5 pt-2">
          {(question.options || []).map((opt, idx) => {
            const letter = String.fromCharCode(65 + idx);
            const selected = currentAns.jawaban.option_id === opt.id;
            const isElim = eliminatedOptionIds.includes(opt.id);
            return (
              <div key={opt.id} className="flex items-stretch gap-2">
                <button
                  type="button"
                  onClick={() =>
                    onUpdateAnswer(
                      question.id,
                      { option_id: opt.id },
                      undefined,
                      false
                    )
                  }
                  className={`flex-1 min-w-0 min-h-[48px] text-left px-3.5 sm:px-4 py-3 rounded-xl border-2 flex items-start gap-3 transition cursor-pointer ${
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
                  <span className={`${textSizeClass} pt-0.5 break-words select-none`}>
                    {opt.teks}
                  </span>
                </button>

                {/* Tombol Coret Opsi (minimum tap target 44x44px) */}
                <button
                  type="button"
                  onClick={() => onToggleEliminate(question.id, opt.id)}
                  title={isElim ? "Batal Coret Opsi" : "Coret Opsi Salah"}
                  aria-label={
                    isElim
                      ? `Batal coret opsi ${letter}`
                      : `Coret opsi ${letter}`
                  }
                  className={`min-w-[44px] min-h-[44px] px-3 rounded-xl border text-xs flex items-center justify-center shrink-0 cursor-pointer ${
                    isElim
                      ? "bg-slate-800 text-white border-slate-800"
                      : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  <Strikethrough className="w-4 h-4" aria-hidden="true" />
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
              onUpdateAnswer(
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
            Pasangkan setiap pernyataan di sisi kiri dengan pilihan yang tepat
            di sisi kanan:
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
                      onUpdateAnswer(
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
              onUpdateAnswer(
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
            {(currentAns.jawaban.text || "")
              .trim()
              .split(/\s+/)
              .filter(Boolean).length}{" "}
            kata
          </div>
        </div>
      )}
    </>
  );
}
