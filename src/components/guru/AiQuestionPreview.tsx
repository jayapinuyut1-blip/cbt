"use client";

import { questionTypeLabel } from "@/lib/format";
import MathText from "@/components/MathText";
import type { GeneratedQuestion } from "@/app/api/guru/generate-questions/route";
import { Download, Save, Trash2 } from "lucide-react";

interface AiQuestionPreviewProps {
  results: GeneratedQuestion[];
  subjectName: string;
  grade: string;
  runningQueue: boolean;
  saving: boolean;
  onExportExcel: () => void;
  onSaveAll: () => void;
  onRemoveAt: (idx: number) => void;
}

export default function AiQuestionPreview({
  results,
  subjectName,
  grade,
  runningQueue,
  saving,
  onExportExcel,
  onSaveAll,
  onRemoveAt,
}: AiQuestionPreviewProps) {
  if (results.length === 0) return null;

  return (
    <div className="border-t border-slate-200 pt-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-bold text-sm text-slate-900">
          Pratinjau Hasil ({results.length} Soal: {subjectName} Kelas {grade})
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={runningQueue}
            onClick={onExportExcel}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-800 rounded-lg text-xs font-semibold cursor-pointer"
          >
            <Download className="w-4 h-4" /> Unduh ke Excel
          </button>
          <button
            type="button"
            disabled={saving || runningQueue}
            onClick={onSaveAll}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white rounded-lg text-xs font-semibold cursor-pointer"
          >
            <Save className="w-4 h-4" />
            {saving
              ? "Menyimpan..."
              : `Simpan Semua (${results.length}) ke Bank Soal`}
          </button>
        </div>
      </div>

      <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
        {results.map((q, idx) => (
          <div
            key={idx}
            className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2 text-xs"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-700">#{idx + 1}</span>
                <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-800 font-medium">
                  {questionTypeLabel(q.tipe)}
                </span>
                <span className="text-slate-500">Bobot: {q.bobot}</span>
              </div>
              <button
                type="button"
                disabled={runningQueue}
                onClick={() => onRemoveAt(idx)}
                title="Hapus soal ini dari daftar"
                className="text-red-500 hover:bg-red-50 p-1 rounded cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="text-sm text-slate-900 whitespace-pre-wrap break-words">
              <MathText text={q.teks} />
            </div>

            {q.tipe === "pg" && q.opsi_pg && (
              <div className="grid sm:grid-cols-2 gap-1">
                {q.opsi_pg.map((o, i) => (
                  <div
                    key={i}
                    className={`px-2 py-1 rounded border break-words ${
                      o.benar
                        ? "bg-emerald-50 border-emerald-300 text-emerald-900 font-semibold"
                        : "bg-white border-slate-200 text-slate-700"
                    }`}
                  >
                    {String.fromCharCode(65 + i)}. <MathText text={o.teks} />
                  </div>
                ))}
              </div>
            )}

            {q.tipe === "isian" && q.kunci_isian && (
              <div className="text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded">
                <strong>Kunci:</strong> {q.kunci_isian.join(" / ")}
              </div>
            )}

            {q.tipe === "jodoh" && q.pasangan_jodoh && (
              <div className="grid sm:grid-cols-2 gap-1">
                {q.pasangan_jodoh.map((p, i) => (
                  <div
                    key={i}
                    className="px-2 py-1 rounded bg-white border border-slate-200 break-words"
                  >
                    <MathText text={p.kiri} /> →{" "}
                    <strong className="text-emerald-700">
                      <MathText text={p.kanan} />
                    </strong>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
