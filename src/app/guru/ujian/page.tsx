"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { generateExamToken } from "@/lib/auth-utils";
import { formatDateTime, questionTypeLabel } from "@/lib/format";
import { fetchAllowedSubjectsForCurrentUser } from "@/lib/teacher-subjects";
import {
  combineDateAndTimeToIso,
  diffMinutesBetweenTimes,
  extractLocalDateAndTime,
  getDayNameId,
  getSlotsForDate,
  isFridayDate,
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
  QuestionType,
  SchoolClass,
  Subject,
} from "@/types/cbt";
import {
  Plus,
  Eye,
  Trash2,
  Edit3,
  X,
  CalendarClock,
  PieChart,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";

const QUESTION_TYPES_META: {
  key: QuestionType;
  label: string;
  shortLabel: string;
  barClass: string;
  badgeClass: string;
}[] = [
  {
    key: "pg",
    label: "Pilihan Ganda",
    shortLabel: "PG",
    barClass: "bg-blue-500",
    badgeClass: "bg-blue-50 text-blue-700 border-blue-200",
  },
  {
    key: "isian",
    label: "Isian Singkat",
    shortLabel: "Isian",
    barClass: "bg-emerald-500",
    badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  {
    key: "jodoh",
    label: "Menjodohkan",
    shortLabel: "Jodoh",
    barClass: "bg-amber-500",
    badgeClass: "bg-amber-50 text-amber-700 border-amber-200",
  },
  {
    key: "essay",
    label: "Essay / Uraian",
    shortLabel: "Essay",
    barClass: "bg-purple-500",
    badgeClass: "bg-purple-50 text-purple-700 border-purple-200",
  },
];

function formatBobotTipeSummary(weights?: ExamTypeWeights | null): string | null {
  if (!weights) return null;
  const parts = QUESTION_TYPES_META.map((m) => {
    const val = Number(weights[m.key] ?? 0);
    return val > 0 ? `${m.shortLabel} ${val}%` : null;
  }).filter(Boolean);
  return parts.length > 0 ? parts.join(" • ") : null;
}

function getTodayLocalDate(): string {
  const dt = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

export default function GuruUjianPage() {
  const supabase = createClient();
  const [exams, setExams] = useState<Exam[]>([]);
  const [schedulesByExam, setSchedulesByExam] = useState<
    Record<number, ExamSchedule[]>
  >({});
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [userId, setUserId] = useState<string | null>(null);

  // Modal Form Ujian
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [judul, setJudul] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [tahunAjaranId, setTahunAjaranId] = useState("");
  const [durasi, setDurasi] = useState("120");
  const [kkm, setKkm] = useState("75");
  const [jenis, setJenis] = useState<ExamKind>("resmi");
  const [sourceMode, setSourceMode] = useState<"manual" | "acak">("manual");
  const [jumlahSoalAcak, setJumlahSoalAcak] = useState("20");
  const [acakSoal, setAcakSoal] = useState(true);
  const [acakOpsi, setAcakOpsi] = useState(true);
  const [navigasi, setNavigasi] = useState<ExamNavigation>("bebas");
  const [tampilHasil, setTampilHasil] = useState<ExamResultVisibility>("nilai");
  const [aturanRemedial, setAturanRemedial] =
    useState<ExamRemedialRule>("maks_kkm");
  const [petunjuk, setPetunjuk] = useState(
    "Berdoalah sebelum mengerjakan. Periksa kembali jawaban Anda sebelum mengumpulkan ujian."
  );

  // Jadwal Otomatis Berbasis Jam Ujian (Jam II / Jam III + Deteksi Hari Jumat)
  const [enableSchedule, setEnableSchedule] = useState(true);
  const [examDate, setExamDate] = useState(getTodayLocalDate());
  const [slotKey, setSlotKey] = useState<ExamSlotKey>("jam_2");
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("10:00");
  const [selectedClassIds, setSelectedClassIds] = useState<number[]>([]);

  // Soal manual yang dipilih
  const [bankQuestions, setBankQuestions] = useState<Question[]>([]);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);

  // Mode & bobot persentase per tipe soal
  const [weightMode, setWeightMode] = useState<"bobot_soal" | "persen_tipe">(
    "bobot_soal"
  );
  const [typeWeights, setTypeWeights] = useState<Record<QuestionType, string>>({
    pg: "70",
    isian: "0",
    jodoh: "0",
    essay: "30",
  });

  // Sinkronkan jam mulai, selesai, dan durasi otomatis saat tanggal / jam berubah
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

  const loadAll = useCallback(async () => {
    const [{ userId: uid, subjects: allowedSub }, { data: yr }, { data: cl }] =
      await Promise.all([
        fetchAllowedSubjectsForCurrentUser(supabase),
        supabase
          .from("academic_years")
          .select("*")
          .order("id", { ascending: false }),
        supabase.from("classes").select("*").order("nama"),
      ]);
    setUserId(uid);
    setSubjects(allowedSub);
    setClasses((cl || []) as SchoolClass[]);

    const allowedIds = allowedSub.map((s) => s.id);
    if (allowedIds.length > 0) {
      const { data: ex } = await supabase
        .from("exams")
        .select("*, subjects(id, nama)")
        .in("subject_id", allowedIds)
        .order("id", { ascending: false });
      const exList = (ex || []) as Exam[];
      setExams(exList);

      const exIds = exList.map((e) => e.id);
      if (exIds.length > 0) {
        const { data: sch } = await supabase
          .from("exam_schedules")
          .select("*, classes(id, nama)")
          .in("exam_id", exIds)
          .order("mulai", { ascending: false });
        const map: Record<number, ExamSchedule[]> = {};
        ((sch || []) as ExamSchedule[]).forEach((row) => {
          if (!map[row.exam_id]) map[row.exam_id] = [];
          map[row.exam_id].push(row);
        });
        setSchedulesByExam(map);
      } else {
        setSchedulesByExam({});
      }
    } else {
      setExams([]);
      setSchedulesByExam({});
    }

    const yList = (yr || []) as AcademicYear[];
    setYears(yList);
    const activeYr = yList.find((y) => y.aktif);
    if (activeYr && !tahunAjaranId) setTahunAjaranId(String(activeYr.id));
  }, [supabase, tahunAjaranId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

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

  function openCreate() {
    setEditingId(null);
    setJudul("");
    setSubjectId(subjects[0] ? String(subjects[0].id) : "");
    setKkm("75");
    setJenis("resmi");
    setSourceMode("manual");
    setJumlahSoalAcak("20");
    setAcakSoal(true);
    setAcakOpsi(true);
    setNavigasi("bebas");
    setTampilHasil("nilai");
    setAturanRemedial("maks_kkm");
    setPetunjuk(
      "Berdoalah sebelum mengerjakan. Periksa kembali jawaban Anda sebelum mengumpulkan ujian."
    );
    setSelectedQuestionIds([]);
    setWeightMode("bobot_soal");
    setTypeWeights({ pg: "70", isian: "0", jodoh: "0", essay: "30" });
    setEnableSchedule(true);
    setSelectedClassIds([]);
    const today = getTodayLocalDate();
    applySlot(today, "jam_2");
    setShowModal(true);
  }

  async function openEdit(ex: Exam) {
    setEditingId(ex.id);
    setJudul(ex.judul);
    setSubjectId(String(ex.subject_id));
    setTahunAjaranId(ex.tahun_ajaran_id ? String(ex.tahun_ajaran_id) : "");
    setDurasi(String(ex.durasi));
    setKkm(String(ex.kkm));
    setJenis(ex.jenis);
    if (ex.jumlah_soal_acak && ex.jumlah_soal_acak > 0) {
      setSourceMode("acak");
      setJumlahSoalAcak(String(ex.jumlah_soal_acak));
      setSelectedQuestionIds([]);
    } else {
      setSourceMode("manual");
      const { data: eq } = await supabase
        .from("exam_questions")
        .select("question_id")
        .eq("exam_id", ex.id)
        .order("urutan");
      setSelectedQuestionIds((eq || []).map((r) => r.question_id));
    }
    setAcakSoal(ex.acak_soal);
    setAcakOpsi(ex.acak_opsi);
    setNavigasi(ex.navigasi);
    setTampilHasil(ex.tampil_hasil);
    setAturanRemedial(ex.aturan_remedial || "maks_kkm");
    setPetunjuk(ex.petunjuk || "");
    if (ex.bobot_tipe && typeof ex.bobot_tipe === "object") {
      setWeightMode("persen_tipe");
      setTypeWeights({
        pg: String(ex.bobot_tipe.pg ?? 0),
        isian: String(ex.bobot_tipe.isian ?? 0),
        jodoh: String(ex.bobot_tipe.jodoh ?? 0),
        essay: String(ex.bobot_tipe.essay ?? 0),
      });
    } else {
      setWeightMode("bobot_soal");
      setTypeWeights({ pg: "70", isian: "0", jodoh: "0", essay: "30" });
    }

    // Muat jadwal ujian yang ada (jika ada)
    const exSchedules = schedulesByExam[ex.id] || [];
    if (exSchedules.length > 0) {
      setEnableSchedule(true);
      setSelectedClassIds(exSchedules.map((s) => s.kelas_id));
      const first = exSchedules[0];
      const st = extractLocalDateAndTime(first.mulai);
      const en = extractLocalDateAndTime(first.selesai);
      setExamDate(st.date);
      setStartTime(st.time);
      setEndTime(en.time);
      const slots = getSlotsForDate(st.date);
      const foundSlot = slots.find(
        (sl) => sl.startTime === st.time && sl.endTime === en.time
      );
      setSlotKey(foundSlot ? foundSlot.key : "manual");
    } else {
      setEnableSchedule(false);
      setSelectedClassIds([]);
      const today = getTodayLocalDate();
      setExamDate(today);
      setSlotKey("jam_2");
      const firstSlot = getSlotsForDate(today)[0];
      setStartTime(firstSlot.startTime);
      setEndTime(firstSlot.endTime);
    }

    setShowModal(true);
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

  const parsedTypeWeights = useMemo(() => {
    const num = (v: string) => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
    };
    const pg = num(typeWeights.pg);
    const isian = num(typeWeights.isian);
    const jodoh = num(typeWeights.jodoh);
    const essay = num(typeWeights.essay);
    const total = Math.round((pg + isian + jodoh + essay) * 100) / 100;
    return { pg, isian, jodoh, essay, total };
  }, [typeWeights]);

  const compositionStats = useMemo(() => {
    const sourceQuestions =
      sourceMode === "manual"
        ? bankQuestions.filter((q) => selectedQuestionIds.includes(q.id))
        : bankQuestions;

    const counts: Record<QuestionType, number> = {
      pg: 0,
      isian: 0,
      jodoh: 0,
      essay: 0,
    };
    const bobots: Record<QuestionType, number> = {
      pg: 0,
      isian: 0,
      jodoh: 0,
      essay: 0,
    };
    let totalCount = 0;
    let totalBobot = 0;

    for (const q of sourceQuestions) {
      counts[q.tipe] += 1;
      const b = Number(q.bobot) || 1;
      bobots[q.tipe] += b;
      totalCount += 1;
      totalBobot += b;
    }

    const activeCustomPctSum = QUESTION_TYPES_META.reduce((acc, m) => {
      return acc + (counts[m.key] > 0 ? parsedTypeWeights[m.key] : 0);
    }, 0);

    const rows = QUESTION_TYPES_META.map((m) => {
      const count = counts[m.key];
      const sumBobot = bobots[m.key];
      const bobotPct = totalBobot > 0 ? (sumBobot / totalBobot) * 100 : 0;
      const configuredPct = parsedTypeWeights[m.key];
      const effectivePct =
        weightMode === "persen_tipe"
          ? sourceMode === "manual"
            ? count > 0 && activeCustomPctSum > 0
              ? (configuredPct / activeCustomPctSum) * 100
              : 0
            : parsedTypeWeights.total > 0
            ? (configuredPct / parsedTypeWeights.total) * 100
            : 0
          : bobotPct;
      const poinPerSoal =
        sourceMode === "manual" && count > 0 ? effectivePct / count : null;

      return {
        ...m,
        count,
        sumBobot,
        bobotPct,
        configuredPct,
        effectivePct,
        poinPerSoal,
      };
    });

    const missingWeightForSelected =
      weightMode === "persen_tipe" && sourceMode === "manual"
        ? rows.filter((r) => r.count > 0 && r.configuredPct <= 0)
        : [];
    const weightWithoutQuestions =
      weightMode === "persen_tipe" && sourceMode === "manual"
        ? rows.filter((r) => r.count === 0 && r.configuredPct > 0)
        : [];

    return {
      totalCount,
      totalBobot,
      rows,
      missingWeightForSelected,
      weightWithoutQuestions,
    };
  }, [bankQuestions, selectedQuestionIds, sourceMode, weightMode, parsedTypeWeights]);

  function applyWeightPreset(preset: Record<QuestionType, number>) {
    setWeightMode("persen_tipe");
    setTypeWeights({
      pg: String(preset.pg),
      isian: String(preset.isian),
      jodoh: String(preset.jodoh),
      essay: String(preset.essay),
    });
  }

  function applyAutoWeightsFromSelected() {
    const present = compositionStats.rows.filter((r) => r.count > 0);
    if (present.length === 0) return;
    const next: Record<QuestionType, number> = {
      pg: 0,
      isian: 0,
      jodoh: 0,
      essay: 0,
    };
    let assigned = 0;
    present.forEach((r, idx) => {
      if (idx === present.length - 1) {
        next[r.key] = Math.max(0, Math.round(100 - assigned));
      } else {
        const val = Math.round(r.bobotPct);
        next[r.key] = val;
        assigned += val;
      }
    });
    applyWeightPreset(next);
  }

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
      const payload = { ...basePayload, bobot_tipe: bobotTipeValue };

      let targetId = editingId;
      if (editingId) {
        let { error } = await supabase
          .from("exams")
          .update(payload)
          .eq("id", editingId);
        if (error && error.message?.includes("bobot_tipe")) {
          if (weightMode === "persen_tipe") {
            throw new Error(
              "Kolom bobot_tipe belum tersedia di database. Jalankan file supabase/patch_exam_type_weights.sql di Supabase SQL Editor terlebih dahulu."
            );
          }
          const retry = await supabase
            .from("exams")
            .update(basePayload)
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
        if (error && error.message?.includes("bobot_tipe")) {
          if (weightMode === "persen_tipe") {
            throw new Error(
              "Kolom bobot_tipe belum tersedia di database. Jalankan file supabase/patch_exam_type_weights.sql di Supabase SQL Editor terlebih dahulu."
            );
          }
          const retry = await supabase
            .from("exams")
            .insert({ ...basePayload, token: generateExamToken() })
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

      setShowModal(false);
      loadAll();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Gagal menyimpan ujian.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteExam(id: number, title: string) {
    if (!confirm(`Hapus ujian "${title}" beserta seluruh riwayat nilainya?`))
      return;
    await supabase.from("exams").delete().eq("id", id);
    loadAll();
  }

  function toggleQuestion(qid: number) {
    setSelectedQuestionIds((prev) =>
      prev.includes(qid) ? prev.filter((id) => id !== qid) : [...prev, qid]
    );
  }

  const currentSlots = getSlotsForDate(examDate);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Kelola Ujian</h1>
          <p className="text-sm text-slate-500">
            Susun paket ujian, pilih jam ujian (Jam II / Jam III otomatis sesuai jadwal sekolah), dan pratinjau tampilan siswa.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold cursor-pointer"
        >
          <Plus className="w-4 h-4" /> Buat Ujian Baru
        </button>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {exams.map((ex) => {
          const exSchedules = schedulesByExam[ex.id] || [];
          return (
            <div
              key={ex.id}
              className="bg-white rounded-xl border border-slate-200 p-5 space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        ex.jenis === "latihan"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-blue-100 text-blue-700"
                      }`}
                    >
                      {ex.jenis === "latihan" ? "Latihan" : "Resmi"}
                    </span>
                    <span className="text-xs text-slate-500">
                      {ex.subjects?.nama}
                    </span>
                  </div>
                  <h2 className="font-bold text-slate-900 mt-1">{ex.judul}</h2>
                </div>
                <span className="font-mono text-xs font-bold px-2 py-1 rounded bg-slate-100 text-slate-700">
                  Token: {ex.token}
                </span>
              </div>

              <div className="text-xs text-slate-600 flex flex-wrap gap-x-4 gap-y-1">
                <span>Durasi: {ex.durasi} mnt</span>
                <span>KKM: {ex.kkm}</span>
                <span>
                  Soal:{" "}
                  {ex.jumlah_soal_acak
                    ? `${ex.jumlah_soal_acak} acak dari bank`
                    : "Pilihan manual"}
                </span>
                <span>
                  Navigasi: {ex.navigasi === "bebas" ? "Bebas" : "Berurutan"}
                </span>
                <span>
                  Hasil:{" "}
                  {ex.tampil_hasil === "tidak"
                    ? "Disembunyikan"
                    : ex.tampil_hasil === "nilai"
                    ? "Nilai saja"
                    : "Nilai + Kunci"}
                </span>
                <span
                  className={
                    formatBobotTipeSummary(ex.bobot_tipe)
                      ? "text-purple-700 font-semibold"
                      : "text-slate-500"
                  }
                >
                  Bobot:{" "}
                  {formatBobotTipeSummary(ex.bobot_tipe) || "Otomatis per soal"}
                </span>
              </div>

              {exSchedules.length > 0 && (
                <div className="text-xs bg-blue-50/70 border border-blue-100 rounded-lg p-2.5 space-y-1 text-blue-950">
                  <div className="font-semibold flex items-center gap-1">
                    <CalendarClock className="w-3.5 h-3.5 text-blue-600" />
                    {exSchedules[0].sesi}: {formatDateTime(exSchedules[0].mulai)} –{" "}
                    {extractLocalDateAndTime(exSchedules[0].selesai).time}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {exSchedules.map((s) => (
                      <span
                        key={s.id}
                        className="px-1.5 py-0.5 rounded bg-white border border-blue-200 text-[11px]"
                      >
                        {s.classes?.nama || `Kelas #${s.kelas_id}`}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <Link
                  href={`/guru/ujian/${ex.id}/preview`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold"
                >
                  <Eye className="w-3.5 h-3.5" /> Pratinjau Tampilan Siswa
                </Link>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openEdit(ex)}
                    className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 cursor-pointer"
                    title="Edit Ujian"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => deleteExam(ex.id, ex.judul)}
                    className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 cursor-pointer"
                    title="Hapus Ujian"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        {exams.length === 0 && (
          <div className="md:col-span-2 bg-white rounded-xl border border-slate-200 p-10 text-center text-slate-400 text-sm">
            Belum ada paket ujian. Klik &quot;Buat Ujian Baru&quot; untuk memulai.
          </div>
        )}
      </div>

      {/* Modal Buat / Ubah Ujian */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[92vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-lg text-slate-900">
                {editingId ? "Edit Paket Ujian" : "Buat Paket Ujian Baru"}
              </h2>
              <button
                onClick={() => setShowModal(false)}
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

                {/* Alokasi Waktu & Jadwal Otomatis (Jam II / Jam III + Deteksi Jumat) */}
                <div className="sm:col-span-2 p-4 rounded-xl bg-blue-50/70 border border-blue-200 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <label className="flex items-center gap-2 text-xs font-bold text-blue-950 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={enableSchedule}
                        onChange={(e) => setEnableSchedule(e.target.checked)}
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
                            onChange={(e) => applySlot(e.target.value, slotKey)}
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
                              applySlot(examDate, e.target.value as ExamSlotKey)
                            }
                            className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm"
                          >
                            {currentSlots.map((sl) => (
                              <option key={sl.key} value={sl.key}>
                                {sl.label}
                              </option>
                            ))}
                            <option value="manual">
                              Manual (Atur Jam Sendiri)
                            </option>
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
                              setStartTime(val);
                              setDurasi(
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
                              setEndTime(val);
                              setDurasi(
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
                            onChange={(e) => setDurasi(e.target.value)}
                            className={`w-full px-3 py-2 rounded-lg border text-sm ${
                              slotKey !== "manual"
                                ? "bg-slate-100 border-slate-200 text-blue-800 font-bold"
                                : "bg-white border-slate-300"
                            }`}
                          />
                        </div>
                      </div>

                      {/* Pilih Kelas Peserta */}
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
                                onClick={() => selectGradeClasses(lvl)}
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
                                onChange={() => toggleClass(c.id)}
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
                    onChange={(e) =>
                      setNavigasi(e.target.value as ExamNavigation)
                    }
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
                    <option value="nilai_kunci">
                      Nilai beserta jawaban benar
                    </option>
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
                    Ambil Sejumlah Soal Acak dari Bank ({bankQuestions.length}{" "}
                    tersedia)
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

                {/* Indikator Persentase Nilai & Mode Bobot per Tipe Soal */}
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                      <PieChart className="w-4 h-4 text-purple-600" />
                      Komposisi & Persentase Nilai per Tipe Soal
                    </div>
                    <span className="text-[11px] text-slate-500">
                      {sourceMode === "manual"
                        ? `${compositionStats.totalCount} soal dipilih • Total bobot soal: ${compositionStats.totalBobot}`
                        : `Bank mapel: ${compositionStats.totalCount} soal`}
                    </span>
                  </div>

                  {/* Mode Penilaian Toggle */}
                  <div className="grid sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setWeightMode("bobot_soal")}
                      className={`text-left p-2.5 rounded-lg border text-xs transition cursor-pointer ${
                        weightMode === "bobot_soal"
                          ? "bg-blue-50 border-blue-400 text-blue-950 ring-1 ring-blue-300"
                          : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <div className="font-semibold">
                        Otomatis dari Bobot Soal (Default)
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Nilai dihitung proporsional sesuai bobot tiap soal di Bank Soal.
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setWeightMode("persen_tipe")}
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

                  {/* Input Persentase + Preset jika Mode Persentase per Tipe Aktif */}
                  {weightMode === "persen_tipe" && (
                    <div className="bg-white rounded-lg border border-purple-200 p-3 space-y-3">
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                        <span className="font-semibold text-slate-600 mr-1">
                          Preset Cepat:
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            applyWeightPreset({
                              pg: 70,
                              isian: 0,
                              jodoh: 0,
                              essay: 30,
                            })
                          }
                          className="px-2 py-0.5 rounded bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 font-medium cursor-pointer"
                        >
                          70% PG : 30% Essay
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            applyWeightPreset({
                              pg: 80,
                              isian: 0,
                              jodoh: 0,
                              essay: 20,
                            })
                          }
                          className="px-2 py-0.5 rounded bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 font-medium cursor-pointer"
                        >
                          80% PG : 20% Essay
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            applyWeightPreset({
                              pg: 50,
                              isian: 15,
                              jodoh: 15,
                              essay: 20,
                            })
                          }
                          className="px-2 py-0.5 rounded bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 font-medium cursor-pointer"
                        >
                          50 / 15 / 15 / 20 (4 Tipe)
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            applyWeightPreset({
                              pg: 60,
                              isian: 20,
                              jodoh: 20,
                              essay: 0,
                            })
                          }
                          className="px-2 py-0.5 rounded bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 font-medium cursor-pointer"
                        >
                          60 / 20 / 20 (Objektif)
                        </button>
                        {compositionStats.totalCount > 0 && (
                          <button
                            type="button"
                            onClick={applyAutoWeightsFromSelected}
                            className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 font-medium cursor-pointer"
                          >
                            Ikuti Soal Dipilih
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        {QUESTION_TYPES_META.map((m) => (
                          <div key={m.key}>
                            <label className="block text-[11px] font-medium text-slate-700 mb-1">
                              {m.label} (%)
                            </label>
                            <div className="relative">
                              <input
                                type="number"
                                min={0}
                                max={100}
                                step="1"
                                value={typeWeights[m.key]}
                                onChange={(e) =>
                                  setTypeWeights((prev) => ({
                                    ...prev,
                                    [m.key]: e.target.value,
                                  }))
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
                        {Math.abs(parsedTypeWeights.total - 100) <= 0.01 ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Total: 100%
                            (Valid)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-red-600 font-semibold">
                            <AlertTriangle className="w-3.5 h-3.5" /> Total:{" "}
                            {parsedTypeWeights.total}% (Harus tepat 100%)
                          </span>
                        )}
                        <span className="text-[11px] text-slate-500">
                          Di dalam tipe yg sama, soal tetap proporsional sesuai bobot soalnya.
                        </span>
                      </div>

                      {compositionStats.missingWeightForSelected.length > 0 && (
                        <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          <span>
                            Tipe{" "}
                            <b>
                              {compositionStats.missingWeightForSelected
                                .map((r) => r.label)
                                .join(", ")}
                            </b>{" "}
                            memiliki soal terpilih tetapi persentasenya masih 0%.
                          </span>
                        </div>
                      )}
                      {compositionStats.weightWithoutQuestions.length > 0 && (
                        <div className="text-[11px] text-blue-800 bg-blue-50 border border-blue-200 rounded-lg px-2.5 py-1.5">
                          Info: Tipe{" "}
                          <b>
                            {compositionStats.weightWithoutQuestions
                              .map((r) => r.label)
                              .join(", ")}
                          </b>{" "}
                          belum memiliki soal terpilih. Jika tidak ada soalnya saat ujian, porsi otomatis dinormalisasi ke tipe yang hadir.
                        </div>
                      )}
                    </div>
                  )}

                  {/* Progress Bar & Ringkasan Otomatis per Tipe Soal */}
                  <div className="space-y-2">
                    <div className="h-2.5 w-full rounded-full bg-slate-200 overflow-hidden flex">
                      {compositionStats.rows.map((r) =>
                        r.effectivePct > 0 ? (
                          <div
                            key={r.key}
                            style={{ width: `${r.effectivePct}%` }}
                            className={`${r.barClass} transition-all duration-200`}
                            title={`${r.label}: ${r.effectivePct.toFixed(1)}%`}
                          />
                        ) : null
                      )}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {compositionStats.rows.map((r) => (
                        <div
                          key={r.key}
                          className={`rounded-lg border px-2.5 py-2 text-[11px] ${
                            r.effectivePct > 0 || r.count > 0
                              ? r.badgeClass
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
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
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
      )}
    </div>
  );
}
