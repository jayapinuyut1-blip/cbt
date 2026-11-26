"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime } from "@/lib/format";
import { fetchAllowedSubjectsForCurrentUser } from "@/lib/teacher-subjects";
import { formatBobotTipeSummary } from "@/lib/exam-weights";
import { extractLocalDateAndTime } from "@/lib/exam-slots";
import ExamFormModal from "@/components/guru/ExamFormModal";
import type {
  AcademicYear,
  Exam,
  ExamSchedule,
  SchoolClass,
  Subject,
} from "@/types/cbt";
import { Plus, Eye, Trash2, Edit3, CalendarClock } from "lucide-react";

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

  const [showModal, setShowModal] = useState(false);
  const [editingExam, setEditingExam] = useState<Exam | null>(null);

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
    setYears((yr || []) as AcademicYear[]);

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
  }, [supabase]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  function openCreate() {
    setEditingExam(null);
    setShowModal(true);
  }

  function openEdit(ex: Exam) {
    setEditingExam(ex);
    setShowModal(true);
  }

  async function deleteExam(id: number, title: string) {
    if (!confirm(`Hapus ujian "${title}" beserta seluruh riwayat nilainya?`))
      return;
    await supabase.from("exams").delete().eq("id", id);
    loadAll();
  }

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
                <span
                  className={
                    (ex.maks_pelanggaran ?? 3) > 0
                      ? "text-rose-700 font-semibold"
                      : "text-slate-500"
                  }
                >
                  Anti-Curang:{" "}
                  {(ex.maks_pelanggaran ?? 3) > 0
                    ? `Kunci setelah ${ex.maks_pelanggaran ?? 3}x`
                    : "Catat saja"}
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

      {showModal && (
        <ExamFormModal
          key={editingExam ? `edit-${editingExam.id}` : "new-exam"}
          editingExam={editingExam}
          existingSchedules={
            editingExam ? schedulesByExam[editingExam.id] || [] : []
          }
          subjects={subjects}
          classes={classes}
          years={years}
          userId={userId}
          onClose={() => setShowModal(false)}
          onSaved={loadAll}
        />
      )}
    </div>
  );
}
