"use client";

import {
  diffMinutesBetweenTimes,
  getDayNameId,
  getSlotsForDate,
  isFridayDate,
  type ExamSlotKey,
} from "@/lib/exam-slots";
import type { SchoolClass } from "@/types/cbt";
import { CalendarClock } from "lucide-react";

interface ExamScheduleSectionProps {
  enableSchedule: boolean;
  onToggleEnable: (enabled: boolean) => void;
  examDate: string;
  slotKey: ExamSlotKey;
  startTime: string;
  endTime: string;
  durasi: string;
  classes: SchoolClass[];
  selectedClassIds: number[];
  onApplySlot: (dateVal: string, nextSlot: ExamSlotKey) => void;
  onStartTimeChange: (time: string, computedDuration: string) => void;
  onEndTimeChange: (time: string, computedDuration: string) => void;
  onDurasiChange: (val: string) => void;
  onToggleClass: (cid: number) => void;
  onSelectGradeClasses: (prefix: "X " | "XI " | "XII ") => void;
}

export default function ExamScheduleSection({
  enableSchedule,
  onToggleEnable,
  examDate,
  slotKey,
  startTime,
  endTime,
  durasi,
  classes,
  selectedClassIds,
  onApplySlot,
  onStartTimeChange,
  onEndTimeChange,
  onDurasiChange,
  onToggleClass,
  onSelectGradeClasses,
}: ExamScheduleSectionProps) {
  const currentSlots = getSlotsForDate(examDate);

  return (
    <div className="sm:col-span-2 p-4 rounded-xl bg-blue-50/70 border border-blue-200 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-xs font-bold text-blue-950 cursor-pointer">
          <input
            type="checkbox"
            checked={enableSchedule}
            onChange={(e) => onToggleEnable(e.target.checked)}
          />
          <CalendarClock className="w-4 h-4 text-blue-600" />
          Atur Tanggal & Jam Ujian Otomatis (Alokasi Waktu Sekolah)
        </label>
        {enableSchedule && examDate && (
          <span
            className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
              isFridayDate(examDate)
                ? "bg-amber-100 text-amber-800"
                : "bg-blue-100 text-blue-800"
            }`}
          >
            Hari {getDayNameId(examDate)}
            {isFridayDate(examDate) ? " (Jadwal Jumat)" : ""}
          </span>
        )}
      </div>

      {enableSchedule && (
        <>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Tanggal Ujian
              </label>
              <input
                type="date"
                required={enableSchedule}
                value={examDate}
                onChange={(e) => onApplySlot(e.target.value, slotKey)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Pilih Jam Ke- (Otomatis Mulai, Selesai & Durasi)
              </label>
              <select
                value={slotKey}
                onChange={(e) =>
                  onApplySlot(examDate, e.target.value as ExamSlotKey)
                }
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm"
              >
                {currentSlots.map((sl) => (
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
                Waktu Mulai
              </label>
              <input
                type="time"
                value={startTime}
                readOnly={slotKey !== "manual"}
                onChange={(e) => {
                  const val = e.target.value;
                  onStartTimeChange(
                    val,
                    String(diffMinutesBetweenTimes(val, endTime))
                  );
                }}
                className={`w-full px-3 py-2 rounded-lg border text-sm ${
                  slotKey !== "manual"
                    ? "bg-slate-100 border-slate-200 text-slate-700 font-semibold"
                    : "bg-white border-slate-300"
                }`}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Waktu Selesai
              </label>
              <input
                type="time"
                value={endTime}
                readOnly={slotKey !== "manual"}
                onChange={(e) => {
                  const val = e.target.value;
                  onEndTimeChange(
                    val,
                    String(diffMinutesBetweenTimes(startTime, val))
                  );
                }}
                className={`w-full px-3 py-2 rounded-lg border text-sm ${
                  slotKey !== "manual"
                    ? "bg-slate-100 border-slate-200 text-slate-700 font-semibold"
                    : "bg-white border-slate-300"
                }`}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Waktu Pengerjaan (Menit)
              </label>
              <input
                type="number"
                min={5}
                required
                value={durasi}
                readOnly={slotKey !== "manual"}
                onChange={(e) => onDurasiChange(e.target.value)}
                className={`w-full px-3 py-2 rounded-lg border text-sm ${
                  slotKey !== "manual"
                    ? "bg-slate-100 border-slate-200 text-blue-800 font-bold"
                    : "bg-white border-slate-300"
                }`}
              />
            </div>
          </div>

          <div className="space-y-1.5 pt-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-700">
                Kelas Peserta ({selectedClassIds.length} dipilih):
              </span>
              <div className="flex gap-1.5 text-[11px]">
                {(["X ", "XI ", "XII "] as const).map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => onSelectGradeClasses(lvl)}
                    className="px-2 py-0.5 rounded bg-white border border-blue-300 text-blue-700 hover:bg-blue-100 font-medium cursor-pointer"
                  >
                    Semua Kelas {lvl.trim()}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-36 overflow-y-auto bg-white p-2.5 rounded-lg border border-blue-200">
              {classes.map((c) => (
                <label
                  key={c.id}
                  className="flex items-center gap-2 text-xs text-slate-800 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedClassIds.includes(c.id)}
                    onChange={() => onToggleClass(c.id)}
                  />
                  <span className="truncate">{c.nama}</span>
                </label>
              ))}
              {classes.length === 0 && (
                <span className="text-xs text-slate-400">
                  Belum ada data kelas.
                </span>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
