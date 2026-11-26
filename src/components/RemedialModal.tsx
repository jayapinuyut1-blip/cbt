"use client";

import { useState } from "react";
import {
  combineDateAndTimeToIso,
  diffMinutesBetweenTimes,
  getDayNameId,
  getSlotsForDate,
  isFridayDate,
  type ExamSlotKey,
} from "@/lib/exam-slots";
import type { AggregatedStudentGrade, RemedialRule } from "@/lib/remedial";
import { RotateCcw, X, CalendarClock } from "lucide-react";

function todayLocal(): string {
  const dt = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

export default function RemedialModal({
  examId,
  examTitle,
  kkm,
  initialRule,
  candidates,
  preselectedIds,
  onClose,
  onSuccess,
}: {
  examId: number;
  examTitle: string;
  kkm: number;
  initialRule: RemedialRule;
  candidates: AggregatedStudentGrade[];
  preselectedIds: string[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>(preselectedIds);
  const [aturan, setAturan] = useState<RemedialRule>(initialRule || "maks_kkm");
  const [dateStr, setDateStr] = useState<string>(todayLocal());
  const [slotKey, setSlotKey] = useState<ExamSlotKey>("jam_2");
  const [startTime, setStartTime] = useState<string>(() => getSlotsForDate(todayLocal())[0].startTime);
  const [endTime, setEndTime] = useState<string>(() => getSlotsForDate(todayLocal())[0].endTime);
  const [durasi, setDurasi] = useState<string>(() =>
    String(getSlotsForDate(todayLocal())[0].durationMinutes)
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function applySlot(nextDate: string, nextSlot: ExamSlotKey) {
    setDateStr(nextDate);
    setSlotKey(nextSlot);
    if (nextSlot === "manual") return;
    const found = getSlotsForDate(nextDate).find((s) => s.key === nextSlot);
    if (found) {
      setStartTime(found.startTime);
      setEndTime(found.endTime);
      setDurasi(String(found.durationMinutes));
    }
  }

  function toggleStudent(sid: string) {
    setSelectedIds((prev) =>
      prev.includes(sid) ? prev.filter((id) => id !== sid) : [...prev, sid]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selectedIds.length === 0) {
      setError("Pilih minimal 1 siswa untuk mengikuti remedial.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const mulaiIso = combineDateAndTimeToIso(dateStr, startTime);
      const selesaiIso = combineDateAndTimeToIso(dateStr, endTime);
      const res = await fetch("/api/remedial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exam_id: examId,
          student_ids: selectedIds,
          mulai: mulaiIso,
          selesai: selesaiIso,
          durasi: Number(durasi) || 60,
          aturan_remedial: aturan,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Gagal membuka remedial.");
        setSaving(false);
        return;
      }
      alert(
        `Jadwal remedial berhasil dibuka untuk ${data.openedCount} siswa! Nilai ujian utama tetap tersimpan aman.`
      );
      onSuccess();
      onClose();
    } catch {
      setError("Kesalahan jaringan.");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[92vh] overflow-y-auto p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-lg text-slate-900">
                Buka Ujian Remedial
              </h2>
              <p className="text-xs text-slate-500">
                {examTitle} (KKM: {kkm}) — Nilai ujian utama siswa tidak akan tertimpa.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Aturan Nilai Akhir Remedial */}
          <div>
            <label className="block text-xs font-semibold text-slate-800 mb-1">
              Aturan Nilai Akhir Remedial
            </label>
            <select
              value={aturan}
              onChange={(e) => setAturan(e.target.value as RemedialRule)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
            >
              <option value="maks_kkm">
                Maksimal KKM ({kkm}) — Jika remedial ≥ {kkm}, nilai akhir dicatat {kkm} (Paling umum di SMK)
              </option>
              <option value="nilai_terbaik">
                Nilai Terbaik (MAX) — Ambil nilai tertinggi antara ujian utama & remedial
              </option>
              <option value="nilai_terakhir">
                Nilai Remedial Terakhir — Gunakan nilai terbaru hasil remedial
              </option>
            </select>
          </div>

          {/* Jadwal Remedial (Otomatis Jam II/III + Deteksi Jumat) */}
          <div className="p-4 rounded-xl bg-purple-50/70 border border-purple-200 space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-purple-950">
              <span className="flex items-center gap-1.5">
                <CalendarClock className="w-4 h-4 text-purple-600" />
                Jadwal & Durasi Remedial
              </span>
              {dateStr && (
                <span className="px-2 py-0.5 rounded-full bg-white border border-purple-200 text-purple-800">
                  Hari {getDayNameId(dateStr)}
                  {isFridayDate(dateStr) ? " (Jadwal Jumat)" : ""}
                </span>
              )}
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Tanggal Remedial
                </label>
                <input
                  type="date"
                  required
                  value={dateStr}
                  onChange={(e) => applySlot(e.target.value, slotKey)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Jam Pelaksanaan
                </label>
                <select
                  value={slotKey}
                  onChange={(e) =>
                    applySlot(dateStr, e.target.value as ExamSlotKey)
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm"
                >
                  {getSlotsForDate(dateStr).map((sl) => (
                    <option key={sl.key} value={sl.key}>
                      {sl.label}
                    </option>
                  ))}
                  <option value="manual">Manual (Atur Jam Sendiri)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Mulai
                </label>
                <input
                  type="time"
                  value={startTime}
                  readOnly={slotKey !== "manual"}
                  onChange={(e) => {
                    setStartTime(e.target.value);
                    setDurasi(
                      String(diffMinutesBetweenTimes(e.target.value, endTime))
                    );
                  }}
                  className={`w-full px-3 py-2 rounded-lg border text-sm ${
                    slotKey !== "manual" ? "bg-slate-100" : "bg-white"
                  }`}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Selesai
                </label>
                <input
                  type="time"
                  value={endTime}
                  readOnly={slotKey !== "manual"}
                  onChange={(e) => {
                    setEndTime(e.target.value);
                    setDurasi(
                      String(diffMinutesBetweenTimes(startTime, e.target.value))
                    );
                  }}
                  className={`w-full px-3 py-2 rounded-lg border text-sm ${
                    slotKey !== "manual" ? "bg-slate-100" : "bg-white"
                  }`}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Durasi (Menit)
                </label>
                <input
                  type="number"
                  min={5}
                  required
                  value={durasi}
                  readOnly={slotKey !== "manual"}
                  onChange={(e) => setDurasi(e.target.value)}
                  className={`w-full px-3 py-2 rounded-lg border text-sm ${
                    slotKey !== "manual"
                      ? "bg-slate-100 font-bold text-purple-800"
                      : "bg-white"
                  }`}
                />
              </div>
            </div>
          </div>

          {/* Daftar Peserta Remedial */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-800">
                Siswa Peserta Remedial ({selectedIds.length} dipilih):
              </span>
              <button
                type="button"
                onClick={() => {
                  const belowKkm = candidates
                    .filter((c) => c.needs_remedial)
                    .map((c) => c.student_id);
                  setSelectedIds(belowKkm);
                }}
                className="text-purple-700 hover:underline font-medium cursor-pointer"
              >
                Pilih Semua Siswa &lt; KKM (
                {candidates.filter((c) => c.needs_remedial).length})
              </button>
            </div>

            <div className="max-h-52 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
              {candidates.map((c) => {
                const checked = selectedIds.includes(c.student_id);
                return (
                  <label
                    key={c.student_id}
                    className={`flex items-center justify-between gap-2 px-3.5 py-2 text-xs cursor-pointer ${
                      checked ? "bg-purple-50/70" : "hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleStudent(c.student_id)}
                      />
                      <div className="truncate">
                        <span className="font-semibold text-slate-900">
                          {c.nama}
                        </span>{" "}
                        <span className="text-slate-500">
                          ({c.username} • {c.kelas_nama})
                        </span>
                      </div>
                    </div>
                    <span
                      className={`shrink-0 font-bold px-2 py-0.5 rounded-full ${
                        c.needs_remedial
                          ? "bg-rose-100 text-rose-700"
                          : "bg-emerald-100 text-emerald-700"
                      }`}
                    >
                      Nilai: {c.nilai_akhir ?? "-"}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm font-medium cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving || selectedIds.length === 0}
              className="px-5 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white text-sm font-semibold cursor-pointer"
            >
              {saving
                ? "Membuka Remedial..."
                : `Buka Remedial (${selectedIds.length} Siswa)`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
