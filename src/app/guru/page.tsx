import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { getCurrentUserProfile } from "@/lib/server-auth";
import { formatDateTime } from "@/lib/format";
import CopyTokenButton from "@/components/CopyTokenButton";
import {
  FileText,
  ClipboardList,
  PenTool,
  AlertTriangle,
  CalendarClock,
  BarChart3,
  CheckCircle2,
  Plus,
  Activity,
  ArrowRight,
  RotateCcw,
} from "lucide-react";

interface ExamRow {
  id: number;
  judul: string;
  subject_id: number;
  kkm: number;
  durasi: number;
  jenis: string;
  token: string;
  created_at: string;
  subjects: { nama: string } | null;
}

interface ScheduleRow {
  id: number;
  exam_id: number;
  kelas_id: number;
  sesi: string;
  mulai: string;
  selesai: string;
  classes: { nama: string } | null;
}

interface AttemptRow {
  id: number;
  exam_id: number;
  student_id: string;
  attempt_ke: number | null;
  status: string;
  nilai: number | null;
}

export default async function GuruDashboardPage() {
  const supabase = await createServerSupabase();
  const { profile } = await getCurrentUserProfile();

  let allowedSubjects: Array<{ id: number; nama: string }> = [];
  const isAdmin = profile?.role === "admin";

  if (isAdmin) {
    const { data } = await supabase
      .from("subjects")
      .select("id, nama")
      .order("nama");
    allowedSubjects = data || [];
  } else if (profile) {
    const { data: links } = await supabase
      .from("teacher_subjects")
      .select("subject_id, subjects(id, nama)")
      .eq("guru_id", profile.id);
    allowedSubjects = (links || [])
      .map((l) => l.subjects as unknown as { id: number; nama: string } | null)
      .filter((s): s is { id: number; nama: string } => Boolean(s && s.id))
      .sort((a, b) => a.nama.localeCompare(b.nama));
  }

  const subjectIds = allowedSubjects.map((s) => s.id);

  let qCount = 0;
  const qByType = { pg: 0, isian: 0, jodoh: 0, essay: 0 };
  let exams: ExamRow[] = [];
  let schedules: ScheduleRow[] = [];
  let attempts: AttemptRow[] = [];

  if (subjectIds.length > 0) {
    const [{ data: qRows }, { data: examRows }] = await Promise.all([
      supabase
        .from("questions")
        .select("id, tipe")
        .in("subject_id", subjectIds),
      supabase
        .from("exams")
        .select("id, judul, subject_id, kkm, durasi, jenis, token, created_at, subjects(nama)")
        .in("subject_id", subjectIds)
        .order("id", { ascending: false }),
    ]);

    const questionsList = (qRows || []) as Array<{ id: number; tipe: string }>;
    qCount = questionsList.length;
    for (const q of questionsList) {
      if (q.tipe === "pg") qByType.pg += 1;
      else if (q.tipe === "isian") qByType.isian += 1;
      else if (q.tipe === "jodoh") qByType.jodoh += 1;
      else if (q.tipe === "essay") qByType.essay += 1;
    }

    exams = (examRows || []) as unknown as ExamRow[];
    const examIds = exams.map((e) => e.id);

    if (examIds.length > 0) {
      const [{ data: schRows }, { data: attRows }] = await Promise.all([
        supabase
          .from("exam_schedules")
          .select("id, exam_id, kelas_id, sesi, mulai, selesai, classes(nama)")
          .in("exam_id", examIds)
          .order("mulai", { ascending: true }),
        supabase
          .from("attempts")
          .select("id, exam_id, student_id, attempt_ke, status, nilai")
          .in("exam_id", examIds),
      ]);
      schedules = (schRows || []) as unknown as ScheduleRow[];
      attempts = (attRows || []) as AttemptRow[];
    }
  }

  const nowMs = Date.now();
  const sevenDaysMs = nowMs + 14 * 24 * 60 * 60 * 1000;
  const examMap = new Map<number, ExamRow>(exams.map((e) => [e.id, e]));

  // Kelompokkan jadwal per ujian + jendela waktu (mulai-selesai)
  const scheduledExamIds = new Set<number>();
  const scheduleGroups = new Map<
    string,
    {
      exam: ExamRow;
      sesi: string;
      mulai: string;
      selesai: string;
      kelasNames: string[];
      isLive: boolean;
      isToday: boolean;
    }
  >();

  const todayWita = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Makassar",
  }).format(new Date(nowMs));

  for (const s of schedules) {
    scheduledExamIds.add(s.exam_id);
    const ex = examMap.get(s.exam_id);
    if (!ex) continue;
    const startMs = new Date(s.mulai).getTime();
    const endMs = new Date(s.selesai).getTime();
    const isLive = nowMs >= startMs && nowMs <= endMs;
    const isUpcoming = startMs > nowMs && startMs <= sevenDaysMs;
    if (!isLive && !isUpcoming) continue;

    const groupKey = `${s.exam_id}|${s.mulai}|${s.selesai}`;
    const existing = scheduleGroups.get(groupKey);
    const kelasName = s.classes?.nama || `Kelas #${s.kelas_id}`;
    if (existing) {
      if (!existing.kelasNames.includes(kelasName)) {
        existing.kelasNames.push(kelasName);
      }
    } else {
      const startDayWita = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Makassar",
      }).format(new Date(startMs));
      scheduleGroups.set(groupKey, {
        exam: ex,
        sesi: s.sesi,
        mulai: s.mulai,
        selesai: s.selesai,
        kelasNames: [kelasName],
        isLive,
        isToday: startDayWita === todayWita,
      });
    }
  }

  const upcomingSchedules = Array.from(scheduleGroups.values())
    .sort((a, b) => {
      if (a.isLive !== b.isLive) return a.isLive ? -1 : 1;
      return new Date(a.mulai).getTime() - new Date(b.mulai).getTime();
    })
    .slice(0, 6);

  // Statistik attempts & KKM per ujian
  let pendingEssay = 0;
  let activeWorkingTotal = 0;
  const activeWorkingByExam = new Map<number, number>();
  const finishedByExam = new Map<number, number>();
  const attemptsByExam = new Map<number, AttemptRow[]>();

  for (const a of attempts) {
    if (a.status === "menunggu_koreksi") pendingEssay += 1;
    if (a.status === "mengerjakan") {
      activeWorkingTotal += 1;
      activeWorkingByExam.set(
        a.exam_id,
        (activeWorkingByExam.get(a.exam_id) || 0) + 1
      );
    } else {
      finishedByExam.set(a.exam_id, (finishedByExam.get(a.exam_id) || 0) + 1);
    }
    const arr = attemptsByExam.get(a.exam_id) || [];
    arr.push(a);
    attemptsByExam.set(a.exam_id, arr);
  }

  let totalBelowKkm = 0;
  let firstBelowKkmExamId: number | null = null;
  let firstPendingEssayExamId: number | null = null;

  const examPerformance = exams
    .map((ex) => {
      const list = attemptsByExam.get(ex.id) || [];
      if (list.some((a) => a.status === "menunggu_koreksi") && !firstPendingEssayExamId) {
        firstPendingEssayExamId = ex.id;
      }
      // Ambil nilai terbaik per siswa untuk ujian ini
      const bestByStudent = new Map<string, number>();
      for (const a of list) {
        if (a.status === "selesai" && a.nilai !== null) {
          const prev = bestByStudent.get(a.student_id);
          if (prev === undefined || a.nilai > prev) {
            bestByStudent.set(a.student_id, Number(a.nilai));
          }
        }
      }
      const scores = Array.from(bestByStudent.values());
      const selesaiCount = scores.length;
      const tuntasCount = scores.filter((sc) => sc >= ex.kkm).length;
      const belowCount = selesaiCount - tuntasCount;
      if (belowCount > 0) {
        totalBelowKkm += belowCount;
        if (!firstBelowKkmExamId) firstBelowKkmExamId = ex.id;
      }
      const avg =
        selesaiCount > 0
          ? Math.round(
              (scores.reduce((acc, v) => acc + v, 0) / selesaiCount) * 10
            ) / 10
          : null;
      const maxScore = selesaiCount > 0 ? Math.max(...scores) : null;
      const minScore = selesaiCount > 0 ? Math.min(...scores) : null;
      const passPct =
        selesaiCount > 0 ? Math.round((tuntasCount / selesaiCount) * 100) : 0;

      return {
        exam: ex,
        selesaiCount,
        tuntasCount,
        belowCount,
        avg,
        maxScore,
        minScore,
        passPct,
        workingCount: activeWorkingByExam.get(ex.id) || 0,
      };
    })
    .filter((item) => item.selesaiCount > 0 || item.workingCount > 0)
    .slice(0, 5);

  const unscheduledCount = exams.filter((e) => !scheduledExamIds.has(e.id)).length;
  const hasActionItems =
    pendingEssay > 0 || totalBelowKkm > 0 || unscheduledCount > 0;

  return (
    <div className="space-y-6">
      {/* Header + Pintasan Cepat */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Beranda Guru</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Pantau jadwal ujian, salin token cepat, koreksi essay, dan lihat ringkasan ketuntasan KKM.
          </p>

          {!isAdmin && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-medium text-slate-500 mr-1">
                Mapel Diampu:
              </span>
              {allowedSubjects.length > 0 ? (
                allowedSubjects.map((s) => (
                  <span
                    key={s.id}
                    className="px-2.5 py-0.5 text-xs rounded-full bg-blue-50 text-blue-800 border border-blue-200 font-medium"
                  >
                    {s.nama}
                  </span>
                ))
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                  <AlertTriangle className="w-3.5 h-3.5" /> Belum ada mapel yang dipasangkan oleh Admin
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2 shrink-0">
          <Link
            href="/guru/bank-soal"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 rounded-xl text-xs font-semibold shadow-2xs transition"
          >
            <Plus className="w-3.5 h-3.5 text-blue-600" /> Bank Soal
          </Link>
          <Link
            href="/guru/ujian"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 cbt-btn-primary rounded-xl text-xs font-semibold shadow-2xs transition"
          >
            <Plus className="w-3.5 h-3.5" /> Kelola Ujian
          </Link>
        </div>
      </div>

      {/* 4 Kartu Statistik Utama */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3.5 shadow-2xs">
          <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-2xl font-bold text-slate-900">{qCount}</div>
            <div className="text-xs text-slate-500 truncate">Total Bank Soal</div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3.5 shadow-2xs">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
            <ClipboardList className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-2xl font-bold text-slate-900">
              {exams.length}
            </div>
            <div className="text-xs text-slate-500 truncate">Paket Ujian</div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3.5 shadow-2xs">
          <div
            className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
              activeWorkingTotal > 0
                ? "bg-indigo-100 text-indigo-700"
                : "bg-slate-100 text-slate-500"
            }`}
          >
            <Activity className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-2xl font-bold text-slate-900">
              {activeWorkingTotal}
            </div>
            <div className="text-xs text-slate-500 truncate">
              Sedang Mengerjakan
            </div>
          </div>
        </div>

        <div
          className={`bg-white rounded-2xl border p-4 flex items-center gap-3.5 shadow-2xs ${
            pendingEssay > 0 ? "border-amber-300" : "border-slate-200"
          }`}
        >
          <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
            <PenTool className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-2xl font-bold text-amber-700">
              {pendingEssay}
            </div>
            <div className="text-xs text-slate-500 truncate">
              Perlu Koreksi Essay
            </div>
          </div>
        </div>
      </div>

      {/* Kotak "Perlu Tindakan" (Notifikasi Prioritas Guru) */}
      {hasActionItems && (
        <div className="bg-white rounded-2xl border border-amber-200 p-4 sm:p-5 space-y-3 shadow-2xs">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <span>Perlu Tindakan Guru</span>
          </div>
          <div className="grid sm:grid-cols-3 gap-2.5">
            {pendingEssay > 0 && (
              <Link
                href={
                  firstPendingEssayExamId
                    ? `/guru/koreksi?examId=${firstPendingEssayExamId}&tab=essay`
                    : "/guru/koreksi"
                }
                className="flex items-center justify-between gap-2 p-3 rounded-xl bg-amber-50 hover:bg-amber-100/80 border border-amber-200 text-amber-950 transition"
              >
                <div className="text-xs">
                  <div className="font-bold">
                    {pendingEssay} Jawaban Essay Belum Dinilai
                  </div>
                  <div className="text-amber-800 mt-0.5">
                    Klik untuk langsung mengoreksi
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 shrink-0 text-amber-700" />
              </Link>
            )}

            {totalBelowKkm > 0 && (
              <Link
                href={
                  firstBelowKkmExamId
                    ? `/guru/koreksi?examId=${firstBelowKkmExamId}&tab=nilai`
                    : "/guru/koreksi?tab=nilai"
                }
                className="flex items-center justify-between gap-2 p-3 rounded-xl bg-purple-50 hover:bg-purple-100/80 border border-purple-200 text-purple-950 transition"
              >
                <div className="text-xs">
                  <div className="font-bold flex items-center gap-1">
                    <RotateCcw className="w-3.5 h-3.5" />
                    {totalBelowKkm} Siswa Di Bawah KKM
                  </div>
                  <div className="text-purple-800 mt-0.5">
                    Buka remedial 1-klik di Rekap Nilai
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 shrink-0 text-purple-700" />
              </Link>
            )}

            {unscheduledCount > 0 && (
              <Link
                href="/guru/ujian"
                className="flex items-center justify-between gap-2 p-3 rounded-xl bg-blue-50 hover:bg-blue-100/80 border border-blue-200 text-blue-950 transition"
              >
                <div className="text-xs">
                  <div className="font-bold">
                    {unscheduledCount} Paket Ujian Belum Dijadwalkan
                  </div>
                  <div className="text-blue-800 mt-0.5">
                    Atur kelas & jam ujian di Kelola Ujian
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 shrink-0 text-blue-700" />
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Grid Utama: Jadwal & Token Cepat + Statistik KKM */}
      <div className="grid lg:grid-cols-12 gap-5">
        {/* Jadwal Ujian Hari Ini & Mendatang + Salin Token */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-5 space-y-4 shadow-2xs">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CalendarClock className="w-5 h-5 text-blue-600" />
              <div>
                <h2 className="font-bold text-base text-slate-900">
                  Jadwal Ujian Aktif & Mendatang
                </h2>
                <p className="text-xs text-slate-500">
                  Salin token 1-klik untuk dibagikan ke siswa di ruang ujian.
                </p>
              </div>
            </div>
            <Link
              href="/guru/ujian"
              className="text-xs font-semibold text-blue-600 hover:underline shrink-0"
            >
              Kelola →
            </Link>
          </div>

          {upcomingSchedules.length > 0 ? (
            <div className="space-y-2.5">
              {upcomingSchedules.map((item, idx) => {
                const liveWorking = activeWorkingByExam.get(item.exam.id) || 0;
                const doneCount = finishedByExam.get(item.exam.id) || 0;
                return (
                  <div
                    key={`${item.exam.id}-${idx}`}
                    className={`rounded-xl border p-3.5 space-y-2 ${
                      item.isLive
                        ? "border-emerald-300 bg-emerald-50/40"
                        : "border-slate-200 bg-slate-50/50"
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {item.isLive ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-600 text-white">
                              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                              Sedang Berlangsung
                            </span>
                          ) : item.isToday ? (
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                              Hari Ini
                            </span>
                          ) : (
                            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                              Mendatang
                            </span>
                          )}
                          <span className="text-xs text-slate-500">
                            {item.exam.subjects?.nama}
                          </span>
                        </div>
                        <div className="font-bold text-sm text-slate-900 mt-1">
                          {item.exam.judul}
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                          Token
                        </span>
                        <CopyTokenButton token={item.exam.token} />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                      <span>
                        {item.sesi} • {formatDateTime(item.mulai)}
                      </span>
                      {(liveWorking > 0 || doneCount > 0) && (
                        <span className="text-[11px] font-medium text-slate-700">
                          {liveWorking > 0 && (
                            <strong className="text-indigo-700 mr-2">
                              {liveWorking} mengerjakan
                            </strong>
                          )}
                          {doneCount > 0 && (
                            <span className="text-emerald-700">
                              {doneCount} selesai
                            </span>
                          )}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-1">
                      {item.kelasNames.map((k) => (
                        <span
                          key={k}
                          className="text-[11px] px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-700"
                        >
                          {k}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500 space-y-2">
              <p>
                Belum ada jadwal ujian yang sedang aktif atau dalam 14 hari ke depan.
              </p>
              <Link
                href="/guru/ujian"
                className="inline-flex items-center gap-1 text-blue-600 font-semibold hover:underline"
              >
                Buat atau jadwalkan ujian sekarang →
              </Link>
            </div>
          )}
        </div>

        {/* Statistik Kelulusan KKM & Komposisi Bank Soal */}
        <div className="lg:col-span-5 space-y-5">
          {/* Komposisi Bank Soal */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3 shadow-2xs">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-sm text-slate-900">
                Komposisi Bank Soal Anda
              </h2>
              <Link
                href="/guru/bank-soal"
                className="text-xs font-semibold text-blue-600 hover:underline"
              >
                Kelola →
              </Link>
            </div>

            {qCount > 0 ? (
              <>
                <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden flex">
                  {qByType.pg > 0 && (
                    <div
                      style={{ width: `${(qByType.pg / qCount) * 100}%` }}
                      className="bg-blue-500"
                      title={`PG: ${qByType.pg}`}
                    />
                  )}
                  {qByType.isian > 0 && (
                    <div
                      style={{ width: `${(qByType.isian / qCount) * 100}%` }}
                      className="bg-emerald-500"
                      title={`Isian: ${qByType.isian}`}
                    />
                  )}
                  {qByType.jodoh > 0 && (
                    <div
                      style={{ width: `${(qByType.jodoh / qCount) * 100}%` }}
                      className="bg-amber-500"
                      title={`Menjodohkan: ${qByType.jodoh}`}
                    />
                  )}
                  {qByType.essay > 0 && (
                    <div
                      style={{ width: `${(qByType.essay / qCount) * 100}%` }}
                      className="bg-purple-500"
                      title={`Essay: ${qByType.essay}`}
                    />
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-blue-50/70 text-blue-900">
                    <span>Pilihan Ganda</span>
                    <strong>{qByType.pg}</strong>
                  </div>
                  <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-emerald-50/70 text-emerald-900">
                    <span>Isian Singkat</span>
                    <strong>{qByType.isian}</strong>
                  </div>
                  <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-amber-50/70 text-amber-900">
                    <span>Menjodohkan</span>
                    <strong>{qByType.jodoh}</strong>
                  </div>
                  <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-purple-50/70 text-purple-900">
                    <span>Essay / Uraian</span>
                    <strong>{qByType.essay}</strong>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-xs text-slate-400">
                Belum ada soal di bank soal mapel Anda. Gunakan impor Excel atau generator AI untuk membuat soal cepat.
              </p>
            )}
          </div>

          {/* Ringkasan Ketuntasan KKM Ujian Terakhir */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3.5 shadow-2xs">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-emerald-600" />
                <h2 className="font-bold text-sm text-slate-900">
                  Ketuntasan KKM Ujian Terakhir
                </h2>
              </div>
              <Link
                href="/guru/koreksi?tab=analisis"
                className="text-xs font-semibold text-blue-600 hover:underline"
              >
                Analisis →
              </Link>
            </div>

            {examPerformance.length > 0 ? (
              <div className="space-y-3">
                {examPerformance.map((p) => (
                  <div
                    key={p.exam.id}
                    className="p-3 rounded-xl border border-slate-200/80 bg-slate-50/60 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold text-xs text-slate-900 truncate">
                          {p.exam.judul}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          KKM {p.exam.kkm} • {p.selesaiCount} dinilai
                          {p.avg !== null && (
                            <>
                              {" "}
                              • Rata-rata{" "}
                              <strong className="text-slate-800">
                                {p.avg}
                              </strong>
                            </>
                          )}
                        </div>
                      </div>
                      <Link
                        href={`/guru/koreksi?examId=${p.exam.id}&tab=analisis`}
                        className="text-[11px] font-semibold text-blue-600 hover:underline shrink-0"
                      >
                        Butir Soal
                      </Link>
                    </div>

                    {p.selesaiCount > 0 ? (
                      <>
                        <div className="h-2 w-full rounded-full bg-rose-200 overflow-hidden">
                          <div
                            style={{ width: `${p.passPct}%` }}
                            className="h-full bg-emerald-500 rounded-full"
                          />
                        </div>
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-emerald-700 font-semibold inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> {p.passPct}%
                            Tuntas ({p.tuntasCount}/{p.selesaiCount})
                          </span>
                          <span className="text-slate-500">
                            Min {p.minScore} • Maks {p.maxScore}
                          </span>
                        </div>
                      </>
                    ) : (
                      <div className="text-[11px] text-indigo-700 font-medium">
                        {p.workingCount} siswa sedang mengerjakan...
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-slate-400 text-center py-4">
                Belum ada data hasil ujian siswa untuk dianalisis.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Menu Cepat */}
      <div className="grid sm:grid-cols-3 gap-4">
        <Link
          href="/guru/bank-soal"
          className="bg-white rounded-2xl border border-slate-200 p-5 hover:border-blue-400 transition shadow-2xs"
        >
          <div className="font-semibold text-slate-900 mb-1">Bank Soal</div>
          <p className="text-xs text-slate-500 leading-relaxed">
            Tambah soal PG, Isian, Menjodohkan, dan Essay, impor Excel, atau buat otomatis dengan AI sesuai CP SMK.
          </p>
        </Link>
        <Link
          href="/guru/ujian"
          className="bg-white rounded-2xl border border-slate-200 p-5 hover:border-blue-400 transition shadow-2xs"
        >
          <div className="font-semibold text-slate-900 mb-1">Kelola Ujian</div>
          <p className="text-xs text-slate-500 leading-relaxed">
            Susun paket ujian, atur persentase bobot per tipe soal, jadwalkan jam sekolah, dan pratinjau tampilan siswa.
          </p>
        </Link>
        <Link
          href="/guru/koreksi?tab=analisis"
          className="bg-white rounded-2xl border border-slate-200 p-5 hover:border-blue-400 transition shadow-2xs"
        >
          <div className="font-semibold text-slate-900 mb-1">
            Koreksi, Nilai & Analisis Butir Soal
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            Koreksi essay, buka remedial 1-klik, dan lihat tingkat kesukaran tiap nomor soal serta ekspor Excel.
          </p>
        </Link>
      </div>
    </div>
  );
}
