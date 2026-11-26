"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { generateExamToken } from "@/lib/auth-utils";
import { questionTypeLabel } from "@/lib/format";
import ExamWeightPanel from "@/components/ExamWeightPanel";
import ExamScheduleSection from "@/components/guru/ExamScheduleSection";
import {
  computeComposition,
  parseWeightInputs,
  type WeightInputs,
} from "@/lib/exam-weights";
import {
  combineDateAndTimeToIso,
  extractLocalDateAndTime,
  getSlotsForDate,
  type ExamSlotKey,
} from "@/lib/exam-slots";
import type {
  AcademicYear,
  Exam,
  ExamKind,
  ExamNavigation,
  ExamRemedialRule,
  ExamResultVisibility,
  ExamSchedule,
  ExamTypeWeights,
  Question,
  SchoolClass,
  Subject,
} from "@/types/cbt";
import { X } from "lucide-react";

function getTodayLocalDate(): string {
  const dt = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

interface ExamFormModalProps {
  editingExam: Exam | null;
  existingSchedules: ExamSchedule[];
  subjects: Subject[];
  classes: SchoolClass[];
  years: AcademicYear[];
  userId: string | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function ExamFormModal({
  editingExam,
  existingSchedules,
  subjects,
  classes,
  years,
  userId,
  onClose,
  onSaved,
}: ExamFormModalProps) {
  const supabase = createClient();
  const activeYr = years.find((y) => y.aktif);

  const initialSchedule = useMemo(() => {
    if (editingExam) {
      if (existingSchedules.length > 0) {
        const first = existingSchedules[0];
        const st = extractLocalDateAndTime(first.mulai);
        const en = extractLocalDateAndTime(first.selesai);
        const slots = getSlotsForDate(st.date);
        const foundSlot = slots.find(
          (sl) => sl.startTime === st.time && sl.endTime === en.time
        );
        return {
          enabled: true,
          classIds: existingSchedules.map((s) => s.kelas_id),
          date: st.date,
          startTime: st.time,
          endTime: en.time,
          slotKey: (foundSlot ? foundSlot.key : "manual") as ExamSlotKey,
          durasi: String(editingExam.durasi),
        };
      }
      const today = getTodayLocalDate();
      const firstSlot = getSlotsForDate(today)[0];
      return {
        enabled: false,
        classIds: [] as number[],
        date: today,
        startTime: firstSlot.startTime,
        endTime: firstSlot.endTime,
        slotKey: "jam_2" as ExamSlotKey,
        durasi: String(editingExam.durasi),
      };
    }

    const today = getTodayLocalDate();
    const matched =
      getSlotsForDate(today).find((s) => s.key === "jam_2") ||
      getSlotsForDate(today)[0];
    return {
      enabled: true,
      classIds: [] as number[],
      date: today,
      startTime: matched.startTime,
      endTime: matched.endTime,
      slotKey: "jam_2" as ExamSlotKey,
      durasi: String(matched.durationMinutes),
    };
  }, [editingExam, existingSchedules]);

  const [judul, setJudul] = useState(editingExam?.judul || "");
  const [subjectId, setSubjectId] = useState(
    editingExam
      ? String(editingExam.subject_id)
      : subjects[0]
      ? String(subjects[0].id)
      : ""
  );
  const [tahunAjaranId, setTahunAjaranId] = useState(
    editingExam?.tahun_ajaran_id
      ? String(editingExam.tahun_ajaran_id)
      : activeYr
      ? String(activeYr.id)
      : ""
  );
  const [durasi, setDurasi] = useState(initialSchedule.durasi);
  const [kkm, setKkm] = useState(editingExam ? String(editingExam.kkm) : "75");
  const [jenis, setJenis] = useState<ExamKind>(editingExam?.jenis || "resmi");
  const [sourceMode, setSourceMode] = useState<"manual" | "acak">(
    editingExam?.jumlah_soal_acak && editingExam.jumlah_soal_acak > 0
      ? "acak"
      : "manual"
  );
  const [jumlahSoalAcak, setJumlahSoalAcak] = useState(
    editingExam?.jumlah_soal_acak && editingExam.jumlah_soal_acak > 0
      ? String(editingExam.jumlah_soal_acak)
      : "20"
  );
  const [acakSoal, setAcakSoal] = useState(editingExam ? editingExam.acak_soal : true);
  const [acakOpsi, setAcakOpsi] = useState(editingExam ? editingExam.acak_opsi : true);
  const [navigasi, setNavigasi] = useState<ExamNavigation>(
    editingExam?.navigasi || "bebas"
  );
  const [tampilHasil, setTampilHasil] = useState<ExamResultVisibility>(
    editingExam?.tampil_hasil || "nilai"
  );
  const [aturanRemedial, setAturanRemedial] = useState<ExamRemedialRule>(
    editingExam?.aturan_remedial || "maks_kkm"
  );
  const [maksPelanggaran, setMaksPelanggaran] = useState(
    editingExam?.maks_pelanggaran !== undefined &&
      editingExam?.maks_pelanggaran !== null
      ? String(editingExam.maks_pelanggaran)
      : "3"
  );
  const [petunjuk, setPetunjuk] = useState(
    editingExam
      ? editingExam.petunjuk || ""
      : "Berdoalah sebelum mengerjakan. Periksa kembali jawaban Anda sebelum mengumpulkan ujian."
  );

  const [enableSchedule, setEnableSchedule] = useState(initialSchedule.enabled);
  const [examDate, setExamDate] = useState(initialSchedule.date);
  const [slotKey, setSlotKey] = useState<ExamSlotKey>(initialSchedule.slotKey);
  const [startTime, setStartTime] = useState(initialSchedule.startTime);
  const [endTime, setEndTime] = useState(initialSchedule.endTime);
  const [selectedClassIds, setSelectedClassIds] = useState<number[]>(
    initialSchedule.classIds
  );

  const [bankQuestions, setBankQuestions] = useState<Question[]>([]);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);

  const [weightMode, setWeightMode] = useState<"bobot_soal" | "persen_tipe">(
    editingExam?.bobot_tipe && typeof editingExam.bobot_tipe === "object"
      ? "persen_tipe"
      : "bobot_soal"
  );
  const [typeWeights, setTypeWeights] = useState<WeightInputs>(
    editingExam?.bobot_tipe && typeof editingExam.bobot_tipe === "object"
      ? {
          pg: String(editingExam.bobot_tipe.pg ?? 0),
          isian: String(editingExam.bobot_tipe.isian ?? 0),
          jodoh: String(editingExam.bobot_tipe.jodoh ?? 0),
          essay: String(editingExam.bobot_tipe.essay ?? 0),
        }
      : { pg: "70", isian: "0", jodoh: "0", essay: "30" }
  );

  // Muat daftar bank soal untuk mapel aktif
  useEffect(() => {
    if (!subjectId) {
      setBankQuestions([]);
      return;
    }
    supabase
      .from("questions")
      .select("id, tipe, teks, bobot, subject_id, guru_id, gambar, created_at")
      .eq("subject_id", Number(subjectId))
      .order("id")
      .then(({ data }) => setBankQuestions((data || []) as Question[]));
  }, [supabase, subjectId]);

  // Muat soal manual terpilih bila sedang mengedit ujian mode manual
  useEffect(() => {
    if (!editingExam || (editingExam.jumlah_soal_acak && editingExam.jumlah_soal_acak > 0)) {
      return;
    }
    supabase
      .from("exam_questions")
      .select("question_id")
      .eq("exam_id", editingExam.id)
      .order("urutan")
      .then(({ data }) =>
        setSelectedQuestionIds((data || []).map((r) => r.question_id))
      );
  }, [supabase, editingExam]);

  function applySlot(dateVal: string, nextSlot: ExamSlotKey) {
    setExamDate(dateVal);
    setSlotKey(nextSlot);
    if (nextSlot === "manual") return;
    const slots = getSlotsForDate(dateVal);
    const matched = slots.find((s) => s.key === nextSlot);
    if (matched) {
      setStartTime(matched.startTime);
      setEndTime(matched.endTime);
      setDurasi(String(matched.durationMinutes));
    }
  }

  function toggleClass(cid: number) {
    setSelectedClassIds((prev) =>
      prev.includes(cid) ? prev.filter((id) => id !== cid) : [...prev, cid]
    );
  }

  function selectGradeClasses(prefix: "X " | "XI " | "XII ") {
    const matched = classes
      .filter((c) => c.nama.toUpperCase().startsWith(prefix))
      .map((c) => c.id);
    if (matched.length === 0) return;
    const allSelected = matched.every((id) => selectedClassIds.includes(id));
    if (allSelected) {
      setSelectedClassIds((prev) => prev.filter((id) => !matched.includes(id)));
    } else {
      setSelectedClassIds((prev) => Array.from(new Set([...prev, ...matched])));
    }
  }

  function toggleQuestion(qid: number) {
    setSelectedQuestionIds((prev) =>
      prev.includes(qid) ? prev.filter((id) => id !== qid) : [...prev, qid]
    );
  }

  const parsedTypeWeights = useMemo(
    () => parseWeightInputs(typeWeights),
    [typeWeights]
  );

  const compositionStats = useMemo(
    () =>
      computeComposition({
        questions:
          sourceMode === "manual"
            ? bankQuestions.filter((q) => selectedQuestionIds.includes(q.id))
            : bankQuestions,
        weightMode,
        sourceMode,
        weights: parsedTypeWeights,
      }),
    [bankQuestions, selectedQuestionIds, sourceMode, weightMode, parsedTypeWeights]
  );

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!judul.trim() || !subjectId) return;
    if (sourceMode === "manual" && selectedQuestionIds.length === 0) {
      alert(
        "Pilih minimal 1 soal dari bank soal, atau gunakan mode Acak dari Bank."
      );
      return;
    }
    if (weightMode === "persen_tipe") {
      if (Math.abs(parsedTypeWeights.total - 100) > 0.01) {
        alert(
          `Total persentase bobot tipe soal harus tepat 100% (saat ini ${parsedTypeWeights.total}%).`
        );
        return;
      }
      if (
        sourceMode === "manual" &&
        compositionStats.missingWeightForSelected.length > 0
      ) {
        const names = compositionStats.missingWeightForSelected
          .map((r) => r.label)
          .join(", ");
        const ok = confirm(
          `Peringatan: Soal bertipe ${names} ada di paket ujian ini tetapi persentasenya 0% (tidak menambah nilai). Tetap simpan?`
        );
        if (!ok) return;
      }
    }
    if (enableSchedule && selectedClassIds.length === 0) {
      alert(
        "Pilih minimal 1 kelas peserta untuk menjadwalkan ujian (atau nonaktifkan centang Jadwalkan Ujian)."
      );
      return;
    }

    setSaving(true);
    try {
      const bobotTipeValue: ExamTypeWeights | null =
        weightMode === "persen_tipe"
          ? {
              pg: parsedTypeWeights.pg,
              isian: parsedTypeWeights.isian,
              jodoh: parsedTypeWeights.jodoh,
              essay: parsedTypeWeights.essay,
            }
          : null;

      const basePayload = {
        judul: judul.trim(),
        subject_id: Number(subjectId),
        guru_id: userId,
        tahun_ajaran_id: tahunAjaranId ? Number(tahunAjaranId) : null,
        durasi: Number(durasi) || 60,
        kkm: Number(kkm) || 75,
        jenis,
        jumlah_soal_acak:
          sourceMode === "acak"
            ? Math.max(1, Number(jumlahSoalAcak) || 10)
            : null,
        acak_soal: acakSoal,
        acak_opsi: acakOpsi,
        navigasi,
        petunjuk: petunjuk.trim(),
        tampil_hasil: tampilHasil,
        aturan_remedial: aturanRemedial,
      };
      const payload = {
        ...basePayload,
        bobot_tipe: bobotTipeValue,
        maks_pelanggaran: Math.max(0, Number(maksPelanggaran) || 0),
      };

      const editingId = editingExam?.id ?? null;
      let targetId = editingId;

      if (editingId) {
        let { error } = await supabase
          .from("exams")
          .update(payload)
          .eq("id", editingId);
        if (
          error &&
          (error.message?.includes("bobot_tipe") ||
            error.message?.includes("maks_pelanggaran"))
        ) {
          if (weightMode === "persen_tipe" && error.message?.includes("bobot_tipe")) {
            throw new Error(
              "Kolom bobot_tipe belum tersedia di database. Jalankan file supabase/patch_exam_type_weights.sql di Supabase SQL Editor terlebih dahulu."
            );
          }
          const retryPayload = {
            ...basePayload,
            ...(error.message?.includes("bobot_tipe")
              ? {}
              : { bobot_tipe: bobotTipeValue }),
          };
          const retry = await supabase
            .from("exams")
            .update(retryPayload)
            .eq("id", editingId);
          error = retry.error;
        }
        if (error) throw error;
      } else {
        let { data, error } = await supabase
          .from("exams")
          .insert({ ...payload, token: generateExamToken() })
          .select("id")
          .single();
        if (
          error &&
          (error.message?.includes("bobot_tipe") ||
            error.message?.includes("maks_pelanggaran"))
        ) {
          if (weightMode === "persen_tipe" && error.message?.includes("bobot_tipe")) {
            throw new Error(
              "Kolom bobot_tipe belum tersedia di database. Jalankan file supabase/patch_exam_type_weights.sql di Supabase SQL Editor terlebih dahulu."
            );
          }
          const retryPayload = {
            ...basePayload,
            ...(error.message?.includes("bobot_tipe")
              ? {}
              : { bobot_tipe: bobotTipeValue }),
          };
          const retry = await supabase
            .from("exams")
            .insert({ ...retryPayload, token: generateExamToken() })
            .select("id")
            .single();
          data = retry.data;
          error = retry.error;
        }
        if (error || !data) throw error || new Error("Gagal membuat ujian");
        targetId = data.id;
      }

      if (targetId) {
        await supabase.from("exam_questions").delete().eq("exam_id", targetId);
        if (sourceMode === "manual" && selectedQuestionIds.length > 0) {
          await supabase.from("exam_questions").insert(
            selectedQuestionIds.map((qid, idx) => ({
              exam_id: targetId,
              question_id: qid,
              urutan: idx + 1,
            }))
          );
        }

        // Simpan jadwal otomatis berbasis Jam II / Jam III ke exam_schedules
        if (enableSchedule && examDate && startTime && endTime) {
          const slots = getSlotsForDate(examDate);
          const matchedSlot = slots.find((s) => s.key === slotKey);
          const sesiLabel = matchedSlot ? matchedSlot.sesiLabel : "Manual";
          const mulaiIso = combineDateAndTimeToIso(examDate, startTime);
          const selesaiIso = combineDateAndTimeToIso(examDate, endTime);

          const schRes = await fetch("/api/guru/exam-schedules", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              exam_id: targetId,
              kelas_ids: selectedClassIds,
              sesi: sesiLabel,
              mulai: mulaiIso,
              selesai: selesaiIso,
            }),
          });
          if (!schRes.ok) {
            const d = await schRes.json();
            throw new Error(d.error || "Gagal menyimpan jadwal ujian.");
          }
        } else if (!enableSchedule && editingId) {
          await fetch("/api/guru/exam-schedules", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ exam_id: targetId, kelas_ids: [] }),
          });
        }
      }

      onSaved();
      onClose();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Gagal menyimpan ujian.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[92vh] overflow-y-auto p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-lg text-slate-900">
            {editingExam ? "Edit Paket Ujian" : "Buat Paket Ujian Baru"}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Judul Ujian
              </label>
              <input
                type="text"
                required
                value={judul}
                onChange={(e) => setJudul(e.target.value)}
                placeholder="Misal: Penilaian Akhir Semester Ganjil - ATPH"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Mata Pelajaran
              </label>
              <select
                required
                value={subjectId}
                onChange={(e) => {
                  setSubjectId(e.target.value);
                  setSelectedQuestionIds([]);
                }}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
              >
                <option value="">-- Pilih Mapel --</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nama}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Tahun Ajaran
              </label>
              <select
                value={tahunAjaranId}
                onChange={(e) => setTahunAjaranId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
              >
                <option value="">-- Pilih TA --</option>
                {years.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.nama} {y.aktif ? "(Aktif)" : ""}
                  </option>
                ))}
              </select>
            </div>

            <ExamScheduleSection
              enableSchedule={enableSchedule}
              onToggleEnable={setEnableSchedule}
              examDate={examDate}
              slotKey={slotKey}
              startTime={startTime}
              endTime={endTime}
              durasi={durasi}
              classes={classes}
              selectedClassIds={selectedClassIds}
              onApplySlot={applySlot}
              onStartTimeChange={(val, nextDur) => {
                setStartTime(val);
                setDurasi(nextDur);
              }}
              onEndTimeChange={(val, nextDur) => {
                setEndTime(val);
                setDurasi(nextDur);
              }}
              onDurasiChange={setDurasi}
              onToggleClass={toggleClass}
              onSelectGradeClasses={selectGradeClasses}
            />

            {!enableSchedule && (
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Durasi Pengerjaan (Menit)
                </label>
                <input
                  type="number"
                  min={5}
                  required
                  value={durasi}
                  onChange={(e) => setDurasi(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                KKM
              </label>
              <input
                type="number"
                min={0}
                max={100}
                required
                value={kkm}
                onChange={(e) => setKkm(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Jenis Ujian
              </label>
              <select
                value={jenis}
                onChange={(e) => setJenis(e.target.value as ExamKind)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
              >
                <option value="resmi">Ujian Resmi</option>
                <option value="latihan">
                  Latihan (Nilai & kunci langsung tampil setelah kumpul)
                </option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Mode Navigasi Siswa
              </label>
              <select
                value={navigasi}
                onChange={(e) => setNavigasi(e.target.value as ExamNavigation)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
              >
                <option value="bebas">Bebas (Boleh lompat & kembali)</option>
                <option value="berurutan">
                  Berurutan (Tidak bisa kembali ke soal sebelumnya)
                </option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Yang Boleh Dilihat Siswa Setelah Ujian
              </label>
              <select
                value={tampilHasil}
                onChange={(e) =>
                  setTampilHasil(e.target.value as ExamResultVisibility)
                }
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
              >
                <option value="tidak">
                  Tidak ada (Hanya ucapan terima kasih)
                </option>
                <option value="nilai">Nilai saja</option>
                <option value="nilai_kunci">Nilai beserta jawaban benar</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Aturan Nilai Jika Remedial
              </label>
              <select
                value={aturanRemedial}
                onChange={(e) =>
                  setAturanRemedial(e.target.value as ExamRemedialRule)
                }
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
              >
                <option value="maks_kkm">Maksimal KKM (Cap KKM)</option>
                <option value="nilai_terbaik">Nilai Terbaik (MAX)</option>
                <option value="nilai_terakhir">Nilai Remedial Terakhir</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Keamanan Anti-Curang (Pindah Tab / Minimize / Split-Screen)
              </label>
              <select
                value={maksPelanggaran}
                onChange={(e) => setMaksPelanggaran(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
              >
                <option value="3">
                  Mode Ketat — Kunci Layar setelah 3x pelanggaran (Direkomendasikan)
                </option>
                <option value="2">
                  Sangat Ketat — Kunci Layar setelah 2x pelanggaran
                </option>
                <option value="5">
                  Moderat — Kunci Layar setelah 5x pelanggaran
                </option>
                <option value="0">
                  Catat Saja — Tidak mengunci layar (cocok untuk Latihan)
                </option>
              </select>
              <p className="text-[11px] text-slate-500 mt-1">
                Jika layar siswa terkunci, siswa wajib melapor ke Pengawas agar dibuka kembali dari halaman Monitoring. Copy-paste & klik kanan tetap diblokir.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-5 text-sm">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={acakSoal}
                onChange={(e) => setAcakSoal(e.target.checked)}
              />
              <span>Acak urutan soal</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={acakOpsi}
                onChange={(e) => setAcakOpsi(e.target.checked)}
              />
              <span>Acak urutan opsi jawaban</span>
            </label>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Petunjuk Pengerjaan
            </label>
            <textarea
              rows={2}
              value={petunjuk}
              onChange={(e) => setPetunjuk(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
            />
          </div>

          {/* Pemilihan Soal */}
          <div className="border-t border-slate-200 pt-4 space-y-3">
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setSourceMode("manual")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                  sourceMode === "manual"
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-700"
                }`}
              >
                Pilih Soal Manual ({selectedQuestionIds.length} dipilih)
              </button>
              <button
                type="button"
                onClick={() => setSourceMode("acak")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                  sourceMode === "acak"
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-700"
                }`}
              >
                Ambil Sejumlah Soal Acak dari Bank ({bankQuestions.length} tersedia)
              </button>
            </div>

            {sourceMode === "acak" ? (
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Jumlah soal acak yang diambil untuk tiap siswa (maks{" "}
                  {bankQuestions.length})
                </label>
                <input
                  type="number"
                  min={1}
                  max={Math.max(1, bankQuestions.length)}
                  value={jumlahSoalAcak}
                  onChange={(e) => setJumlahSoalAcak(e.target.value)}
                  className="w-40 px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500">
                    Centang soal yang dimasukkan ke ujian ini:
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedQuestionIds(
                        selectedQuestionIds.length === bankQuestions.length
                          ? []
                          : bankQuestions.map((q) => q.id)
                      )
                    }
                    className="text-blue-600 hover:underline cursor-pointer"
                  >
                    {selectedQuestionIds.length === bankQuestions.length
                      ? "Batal Pilih Semua"
                      : "Pilih Semua"}
                  </button>
                </div>
                <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                  {bankQuestions.map((q, idx) => (
                    <label
                      key={q.id}
                      className="flex items-start gap-2.5 p-2.5 text-xs hover:bg-slate-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={selectedQuestionIds.includes(q.id)}
                        onChange={() => toggleQuestion(q.id)}
                      />
                      <div className="min-w-0 flex-1">
                        <span className="font-semibold text-blue-700 mr-1.5">
                          [{questionTypeLabel(q.tipe)}]
                        </span>
                        <span className="text-[11px] text-slate-500 mr-1.5">
                          (Bobot {q.bobot})
                        </span>
                        <span className="text-slate-800 line-clamp-2">
                          {idx + 1}. {q.teks}
                        </span>
                      </div>
                    </label>
                  ))}
                  {bankQuestions.length === 0 && (
                    <div className="p-4 text-center text-slate-400 text-xs">
                      Belum ada soal di bank soal mapel ini.
                    </div>
                  )}
                </div>
              </div>
            )}

            <ExamWeightPanel
              weightMode={weightMode}
              onWeightModeChange={setWeightMode}
              typeWeights={typeWeights}
              onTypeWeightsChange={setTypeWeights}
              sourceMode={sourceMode}
              composition={compositionStats}
              parsedWeights={parsedTypeWeights}
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm font-medium cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold cursor-pointer"
            >
              {saving ? "Menyimpan..." : "Simpan Ujian"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
