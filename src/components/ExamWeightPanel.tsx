"use client";

import { PieChart, AlertTriangle, CheckCircle2 } from "lucide-react";
import type { QuestionType } from "@/types/cbt";
import {
  QUESTION_TYPE_KEYS,
  QUESTION_TYPE_LABELS,
  WEIGHT_PRESETS,
  buildAutoWeights,
  weightsToInputs,
  type Composition,
  type ParsedWeights,
  type WeightInputs,
  type WeightMode,
  type WeightSourceMode,
} from "@/lib/exam-weights";

const TYPE_STYLES: Record<QuestionType, { bar: string; badge: string }> = {
  pg: { bar: "bg-blue-500", badge: "bg-blue-50 text-blue-700 border-blue-200" },
  isian: {
    bar: "bg-emerald-500",
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  jodoh: {
    bar: "bg-amber-500",
    badge: "bg-amber-50 text-amber-700 border-amber-200",
  },
  essay: {
    bar: "bg-purple-500",
    badge: "bg-purple-50 text-purple-700 border-purple-200",
  },
};

interface Props {
  weightMode: WeightMode;
  onWeightModeChange: (mode: WeightMode) => void;
  typeWeights: WeightInputs;
  onTypeWeightsChange: (next: WeightInputs) => void;
  sourceMode: WeightSourceMode;
  composition: Composition;
  parsedWeights: ParsedWeights;
}

/** Panel "Komposisi & Persentase Nilai per Tipe Soal" pada form Kelola Ujian. */
export default function ExamWeightPanel({
  weightMode,
  onWeightModeChange,
  typeWeights,
  onTypeWeightsChange,
  sourceMode,
  composition,
  parsedWeights,
}: Props) {
  function applyPreset(values: Record<QuestionType, number>) {
    onWeightModeChange("persen_tipe");
    onTypeWeightsChange(weightsToInputs(values));
  }

  const totalOk = Math.abs(parsedWeights.total - 100) <= 0.01;

  return (
    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
          <PieChart className="w-4 h-4 text-purple-600" />
          Komposisi & Persentase Nilai per Tipe Soal
        </div>
        <span className="text-[11px] text-slate-500">
          {sourceMode === "manual"
            ? `${composition.totalCount} soal dipilih • Total bobot soal: ${composition.totalBobot}`
            : `Bank mapel: ${composition.totalCount} soal`}
        </span>
      </div>

      <div className="grid sm:grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onWeightModeChange("bobot_soal")}
          className={`text-left p-2.5 rounded-lg border text-xs transition cursor-pointer ${
            weightMode === "bobot_soal"
              ? "bg-blue-50 border-blue-400 text-blue-950 ring-1 ring-blue-300"
              : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
          }`}
        >
          <div className="font-semibold">Otomatis dari Bobot Soal (Default)</div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Nilai dihitung proporsional sesuai bobot tiap soal di Bank Soal.
          </div>
        </button>
        <button
          type="button"
          onClick={() => onWeightModeChange("persen_tipe")}
          className={`text-left p-2.5 rounded-lg border text-xs transition cursor-pointer ${
            weightMode === "persen_tipe"
              ? "bg-purple-50 border-purple-400 text-purple-950 ring-1 ring-purple-300"
              : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
          }`}
        >
          <div className="font-semibold">
            Atur Persentase per Tipe Soal (Opsional)
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Tetapkan porsi tetap, misal 70% PG & 30% Essay (total 100%).
          </div>
        </button>
      </div>

      {weightMode === "persen_tipe" && (
        <div className="bg-white rounded-lg border border-purple-200 p-3 space-y-3">
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="font-semibold text-slate-600 mr-1">Preset Cepat:</span>
            {WEIGHT_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => applyPreset(p.values)}
                className="px-2 py-0.5 rounded bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 font-medium cursor-pointer"
              >
                {p.label}
              </button>
            ))}
            {composition.totalCount > 0 && (
              <button
                type="button"
                onClick={() => applyPreset(buildAutoWeights(composition.rows))}
                className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 font-medium cursor-pointer"
              >
                Ikuti Soal Dipilih
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {QUESTION_TYPE_KEYS.map((key) => (
              <div key={key}>
                <label className="block text-[11px] font-medium text-slate-700 mb-1">
                  {QUESTION_TYPE_LABELS[key].label} (%)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="1"
                    value={typeWeights[key]}
                    onChange={(e) =>
                      onTypeWeightsChange({ ...typeWeights, [key]: e.target.value })
                    }
                    className="w-full px-2.5 py-1.5 pr-7 rounded-lg border border-slate-300 text-sm font-semibold"
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                    %
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
            {totalOk ? (
              <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5" /> Total: 100% (Valid)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-red-600 font-semibold">
                <AlertTriangle className="w-3.5 h-3.5" /> Total:{" "}
                {parsedWeights.total}% (Harus tepat 100%)
              </span>
            )}
            <span className="text-[11px] text-slate-500">
              Di dalam tipe yg sama, soal tetap proporsional sesuai bobot soalnya.
            </span>
          </div>

          {composition.missingWeightForSelected.length > 0 && (
            <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>
                Tipe{" "}
                <b>
                  {composition.missingWeightForSelected
                    .map((r) => r.label)
                    .join(", ")}
                </b>{" "}
                memiliki soal terpilih tetapi persentasenya masih 0%.
              </span>
            </div>
          )}
          {composition.weightWithoutQuestions.length > 0 && (
            <div className="text-[11px] text-blue-800 bg-blue-50 border border-blue-200 rounded-lg px-2.5 py-1.5">
              Info: Tipe{" "}
              <b>
                {composition.weightWithoutQuestions.map((r) => r.label).join(", ")}
              </b>{" "}
              belum memiliki soal terpilih. Jika tidak ada soalnya saat ujian,
              porsi otomatis dinormalisasi ke tipe yang hadir.
            </div>
          )}
        </div>
      )}

      <div className="space-y-2">
        <div className="h-2.5 w-full rounded-full bg-slate-200 overflow-hidden flex">
          {composition.rows.map((r) =>
            r.effectivePct > 0 ? (
              <div
                key={r.key}
                style={{ width: `${r.effectivePct}%` }}
                className={`${TYPE_STYLES[r.key].bar} transition-all duration-200`}
                title={`${r.label}: ${r.effectivePct.toFixed(1)}%`}
              />
            ) : null
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {composition.rows.map((r) => (
            <div
              key={r.key}
              className={`rounded-lg border px-2.5 py-2 text-[11px] ${
                r.effectivePct > 0 || r.count > 0
                  ? TYPE_STYLES[r.key].badge
                  : "bg-white border-slate-200 text-slate-400"
              }`}
            >
              <div className="flex items-center justify-between font-bold">
                <span>{r.shortLabel}</span>
                <span>{r.effectivePct.toFixed(1)}%</span>
              </div>
              <div className="mt-0.5 text-[10px] opacity-85">
                {r.count} soal
                {r.poinPerSoal !== null
                  ? ` • ~${r.poinPerSoal.toFixed(2)} poin/soal`
                  : ""}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
