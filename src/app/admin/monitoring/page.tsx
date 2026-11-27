"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime } from "@/lib/format";
import type { Exam, Profile, SchoolClass } from "@/types/cbt";
import {
  Activity,
  RotateCcw,
  Clock,
  CheckSquare,
  Ban,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Unlock,
  Trash2,
  Users,
} from "lucide-react";

interface AttemptRow {
  id: number;
  exam_id: number;
  student_id: string;
  attempt_ke?: number;
  is_remedial?: boolean;
  mulai: string;
  selesai: string | null;
  status: "mengerjakan" | "menunggu_koreksi" | "selesai";
  nilai: number | null;
  nilai_sementara: number | null;
  extra_minutes: number;
  pelanggaran_count?: number;
  is_locked?: boolean;
  locked_reason?: string | null;
  question_order: unknown[];
  last_active_at: string;
}

interface LogRow {
  id: number;
  attempt_id: number;
  jenis:
    | "pindah_tab"
    | "keluar_layar_penuh"
    | "split_screen"
    | "copy_paste"
    | "reset_login"
    | "buka_kunci";
  waktu: string;
}

export default function AdminMonitoringPage() {
  const supabase = createClient();
  const [exams, setExams] = useState<Exam[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<string>("");
  const [selectedKelasId, setSelectedKelasId] = useState<string>("");

  const [students, setStudents] = useState<Profile[]>([]);
  const [attempts, setAttempts] = useState<AttemptRow[]>([]);
  const [answerCounts, setAnswerCounts] = useState<Record<number, number>>({});
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [selectedLogs, setSelectedLogs] = useState<{
    nama: string;
    items: LogRow[];
  } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    Promise.all([
      supabase
        .from("exams")
        .select("*, subjects(id, nama)")
        .order("id", { ascending: false }),
      supabase.from("classes").select("*").order("nama"),
    ]).then(([{ data: ex }, { data: cl }]) => {
      const exList = (ex || []) as Exam[];
      setExams(exList);
      setClasses((cl || []) as SchoolClass[]);
      if (exList[0]) setSelectedExamId(String(exList[0].id));
    });
  }, [supabase]);

  const loadMonitoring = useCallback(async () => {
    if (!selectedExamId) return;
    setLoading(true);
    try {
      let studentQuery = supabase
        .from("profiles")
        .select("*, classes(id, nama)")
        .eq("role", "siswa")
        .eq("aktif", true)
        .order("nama");

      if (selectedKelasId) {
        studentQuery = studentQuery.eq("kelas_id", Number(selectedKelasId));
      }

      const [{ data: stu }, { data: att }] = await Promise.all([
        studentQuery,
        supabase
          .from("attempts")
          .select("*")
          .eq("exam_id", Number(selectedExamId))
          .order("id", { ascending: true }),
      ]);

      const attList = (att || []) as AttemptRow[];
      setStudents((stu || []) as Profile[]);
      setAttempts(attList);

      const attIds = attList.map((a) => a.id);
      if (attIds.length > 0) {
        const [{ data: ans }, { data: lg }] = await Promise.all([
          supabase
            .from("answers")
            .select("attempt_id, jawaban")
            .in("attempt_id", attIds),
          supabase
            .from("attempt_logs")
            .select("*")
            .in("attempt_id", attIds)
            .order("waktu", { ascending: false }),
        ]);

        const counts: Record<number, number> = {};
        (ans || []).forEach((a) => {
          const j = a.jawaban as Record<string, unknown> | null;
          const hasAnswer =
            j &&
            (j.option_id != null ||
              (typeof j.text === "string" && j.text.trim() !== "") ||
              (j.pairs && Object.keys(j.pairs as object).length > 0));
          if (hasAnswer) {
            counts[a.attempt_id] = (counts[a.attempt_id] || 0) + 1;
          }
        });
        setAnswerCounts(counts);
        setLogs((lg || []) as LogRow[]);
      } else {
        setAnswerCounts({});
        setLogs([]);
      }
    } finally {
      setLoading(false);
    }
  }, [supabase, selectedExamId, selectedKelasId]);

  useEffect(() => {
    loadMonitoring();
  }, [loadMonitoring]);

  // Supabase Realtime untuk update otomatis status, jawaban, dan log pelanggaran
  useEffect(() => {
    if (!selectedExamId) return;
    const channel = supabase
      .channel(`monitoring-exam-${selectedExamId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "attempts",
          filter: `exam_id=eq.${selectedExamId}`,
        },
        () => loadMonitoring()
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "attempt_logs" },
        () => loadMonitoring()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "answers" },
        () => loadMonitoring()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, selectedExamId, loadMonitoring]);

  async function doAction(
    payload: Record<string, unknown>,
    confirmMsg?: string,
    successMsg?: string
  ) {
    if (confirmMsg && !confirm(confirmMsg)) return;
    const res = await fetch("/api/admin/monitoring", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) alert(data.error || "Gagal memproses aksi.");
    else {
      if (successMsg) alert(successMsg);
      loadMonitoring();
    }
  }

  // Ambil percobaan TERBARU per siswa (termasuk bila sedang/sudah remedial)
  const latestAttemptByStudent = new Map<string, AttemptRow>();
  for (const a of attempts) {
    const prev = latestAttemptByStudent.get(a.student_id);
    if (!prev || (a.attempt_ke || 1) >= (prev.attempt_ke || 1)) {
      latestAttemptByStudent.set(a.student_id, a);
    }
  }

  const selectedExam = exams.find((e) => String(e.id) === selectedExamId);

  const summary = {
    belum: students.filter((s) => !latestAttemptByStudent.has(s.id)).length,
    mengerjakan: students.filter(
      (s) => latestAttemptByStudent.get(s.id)?.status === "mengerjakan"
    ).length,
    terkunci: students.filter(
      (s) =>
        latestAttemptByStudent.get(s.id)?.status === "mengerjakan" &&
        Boolean(latestAttemptByStudent.get(s.id)?.is_locked)
    ).length,
    selesai: students.filter((s) => {
      const st = latestAttemptByStudent.get(s.id)?.status;
      return st === "selesai" || st === "menunggu_koreksi";
    }).length,
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Activity className="w-6 h-6 text-emerald-600" />
            Monitoring Ujian Real-time
          </h1>
          <p className="text-sm text-slate-500">
            Pantau peserta langsung, reset login (ganti perangkat tanpa kehilangan jawaban), tambah waktu, atau reset ulang dari nol.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={() =>
              doAction(
                {
                  action: "reset_login_bulk",
                  student_ids: students.map((s) => s.id),
                },
                `Reset login untuk SEMUA ${students.length} siswa yang tampil di daftar ini? (Jawaban & sisa waktu tetap aman, siswa bisa langsung login ulang di perangkat baru)`,
                `Berhasil mereset sesi login untuk ${students.length} siswa.`
              )
            }
            disabled={students.length === 0}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3.5 py-2 cbt-btn-primary disabled:opacity-50 rounded-lg text-xs sm:text-sm font-semibold cursor-pointer"
          >
            <Users className="w-4 h-4" aria-hidden="true" />
            <span>Reset Login Massal ({students.length})</span>
          </button>
          <button
            type="button"
            onClick={loadMonitoring}
            className="inline-flex items-center justify-center gap-2 min-h-[44px] px-3.5 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 rounded-lg text-xs sm:text-sm font-medium cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
            <span>Muat Ulang</span>
          </button>
        </div>
      </div>

      {/* Filter (Reflow 1 kolom di HP, baris di Tablet/Desktop) */}
      <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2.5 sm:gap-3">
        <select
          value={selectedExamId}
          onChange={(e) => setSelectedExamId(e.target.value)}
          aria-label="Pilih paket ujian"
          className="w-full sm:w-auto sm:flex-1 sm:min-w-56 min-w-0 min-h-[44px] px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
        >
          <option value="">-- Pilih Ujian --</option>
          {exams.map((ex) => (
            <option key={ex.id} value={ex.id}>
              {ex.judul} ({ex.subjects?.nama}) | Token: {ex.token}
            </option>
          ))}
        </select>

        <select
          value={selectedKelasId}
          onChange={(e) => setSelectedKelasId(e.target.value)}
          aria-label="Filter kelas"
          className="w-full sm:w-auto min-h-[44px] px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
        >
          <option value="">Semua Kelas</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nama}
            </option>
          ))}
        </select>

        {selectedExam && (
          <div className="px-3 py-2 rounded-lg bg-blue-50 border border-blue-200 text-sm flex items-center justify-between sm:justify-start gap-2">
            <span className="text-slate-700">Token:</span>
            <span className="font-mono font-bold text-blue-900 tracking-widest">
              {selectedExam.token}
            </span>
          </div>
        )}
      </div>

      {/* Ringkasan Status */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500">Belum Mulai</div>
          <div className="text-2xl font-bold text-slate-700">{summary.belum}</div>
        </div>
        <div className="bg-white rounded-xl border border-amber-200 p-4">
          <div className="text-xs text-amber-700">Sedang Mengerjakan</div>
          <div className="text-2xl font-bold text-amber-700">
            {summary.mengerjakan}
          </div>
        </div>
        <div
          className={`bg-white rounded-xl border p-4 ${
            summary.terkunci > 0 ? "border-rose-400 bg-rose-50/40" : "border-rose-200"
          }`}
        >
          <div className="text-xs text-rose-700 font-semibold">
            Layar Terkunci (Curang)
          </div>
          <div className="text-2xl font-bold text-rose-700">
            {summary.terkunci}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-emerald-200 p-4">
          <div className="text-xs text-emerald-700">Selesai</div>
          <div className="text-2xl font-bold text-emerald-700">
            {summary.selesai}
          </div>
        </div>
      </div>

      {/* Keterangan Perbedaan Reset */}
      <div className="bg-slate-100 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-600 flex flex-wrap gap-x-6 gap-y-1">
        <span>
          <strong className="text-blue-700">Reset Login:</strong> Buka kunci perangkat jika HP/PC hang (jawaban & sisa waktu <u>tetap aman</u>).
        </span>
        <span>
          <strong className="text-rose-700">Reset Ulang:</strong> Hapus percobaan & jawaban siswa agar mengulang dari awal.
        </span>
      </div>

      {/* Tampilan Kartu Khusus Mobile & Tablet Sempit (Zero Horizontal Scroll) */}
      <div className="lg:hidden space-y-3">
        {students.map((st) => {
          const att = latestAttemptByStudent.get(st.id);
          const totalQ = Array.isArray(att?.question_order)
            ? att.question_order.length
            : 0;
          const answered = att ? answerCounts[att.id] || 0 : 0;
          const attLogs = att
            ? logs.filter((l) => l.attempt_id === att.id)
            : [];
          const warnCount = attLogs.filter(
            (l) =>
              l.jenis === "pindah_tab" ||
              l.jenis === "keluar_layar_penuh" ||
              l.jenis === "split_screen"
          ).length;
          const isLocked = Boolean(
            att?.is_locked && att.status === "mengerjakan"
          );

          return (
            <div
              key={st.id}
              className={`rounded-xl border p-4 space-y-3 ${
                isLocked
                  ? "bg-rose-50/80 border-rose-300"
                  : st.is_blocked
                  ? "bg-red-50/50 border-red-200"
                  : "bg-white border-slate-200"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold text-sm text-slate-900 break-words">
                    {st.nama}
                  </div>
                  <div className="text-xs text-slate-600 mt-0.5 break-words">
                    {st.username} • {st.classes?.nama || "-"}
                    {st.is_blocked && (
                      <span className="ml-1.5 text-red-700 font-semibold">
                        [DIBLOKIR]
                      </span>
                    )}
                  </div>
                </div>
                <div className="shrink-0 flex flex-col items-end gap-1">
                  {!att ? (
                    <span className="px-2 py-0.5 text-xs rounded-md bg-slate-100 text-slate-700 font-medium">
                      Belum Mulai
                    </span>
                  ) : att.status === "mengerjakan" ? (
                    isLocked ? (
                      <span className="px-2 py-0.5 text-xs rounded-md bg-rose-600 text-white font-bold">
                        TERKUNCI ({att.pelanggaran_count || warnCount}x)
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 text-xs rounded-md bg-amber-100 text-amber-900 font-medium">
                        Mengerjakan
                        {att.extra_minutes > 0 ? ` (+${att.extra_minutes}m)` : ""}
                      </span>
                    )
                  ) : att.status === "menunggu_koreksi" ? (
                    <span className="px-2 py-0.5 text-xs rounded-md bg-indigo-100 text-indigo-900 font-medium">
                      Menunggu Koreksi
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 text-xs rounded-md bg-emerald-100 text-emerald-900 font-medium">
                      Selesai ({att.nilai ?? "-"})
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 bg-slate-50/90 px-3 py-2 rounded-lg border border-slate-200/70">
                <span>
                  Terjawab:{" "}
                  <strong className="font-mono text-slate-900">
                    {att ? `${answered}/${totalQ}` : "-"}
                  </strong>
                </span>
                {warnCount > 0 ? (
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedLogs({ nama: st.nama, items: attLogs })
                    }
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-rose-100 text-rose-800 font-semibold"
                  >
                    <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                    Log {warnCount}x
                  </button>
                ) : (
                  <span>Log: Normal</span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                {isLocked && att && (
                  <button
                    type="button"
                    onClick={() =>
                      doAction(
                        { action: "unlock_attempt", attempt_id: att.id },
                        `Buka kunci layar ujian untuk ${st.nama}? (Hitungan pelanggaran akan direset ke 0 agar siswa dapat melanjutkan)`,
                        `Kunci layar ${st.nama} berhasil dibuka.`
                      )
                    }
                    className="col-span-2 inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold"
                  >
                    <Unlock className="w-4 h-4" aria-hidden="true" />
                    Buka Kunci Layar
                  </button>
                )}

                <button
                  type="button"
                  onClick={() =>
                    doAction(
                      {
                        action: "reset_login",
                        student_id: st.id,
                        attempt_id: att?.id,
                      },
                      undefined,
                      `Sesi login ${st.nama} berhasil direset.`
                    )
                  }
                  className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3 py-2 rounded-lg bg-blue-50 text-blue-800 hover:bg-blue-100 border border-blue-200 text-xs font-semibold"
                >
                  <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                  Reset Login
                </button>

                {att && att.status === "mengerjakan" && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        const m = prompt("Tambah waktu berapa menit?", "10");
                        if (m && Number(m) > 0) {
                          doAction({
                            action: "add_time",
                            attempt_id: att.id,
                            minutes: Number(m),
                          });
                        }
                      }}
                      className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3 py-2 rounded-lg bg-amber-50 text-amber-900 hover:bg-amber-100 border border-amber-200 text-xs font-semibold"
                    >
                      <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                      +Waktu
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        doAction(
                          { action: "force_finish", attempt_id: att.id },
                          `Paksa selesai ujian untuk ${st.nama}?`
                        )
                      }
                      className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3 py-2 rounded-lg bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200 text-xs font-semibold"
                    >
                      <CheckSquare className="w-3.5 h-3.5" aria-hidden="true" />
                      Paksa Selesai
                    </button>
                  </>
                )}

                {att && att.status !== "mengerjakan" && (
                  <button
                    type="button"
                    onClick={() => {
                      const m = prompt(
                        `Buka kembali ujian untuk ${st.nama}? Tambah waktu berapa menit?`,
                        "30"
                      );
                      if (m && Number(m) > 0) {
                        doAction({
                          action: "reopen_attempt",
                          attempt_id: att.id,
                          minutes: Number(m),
                        });
                      }
                    }}
                    className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3 py-2 rounded-lg bg-indigo-50 text-indigo-800 hover:bg-indigo-100 border border-indigo-200 text-xs font-semibold"
                  >
                    <Unlock className="w-3.5 h-3.5" aria-hidden="true" />
                    Buka Lagi
                  </button>
                )}

                {att && (
                  <button
                    type="button"
                    onClick={() =>
                      doAction(
                        {
                          action: "reset_attempt_total",
                          attempt_id: att.id,
                          student_id: st.id,
                        },
                        `PERINGATAN: Hapus percobaan & seluruh jawaban ${st.nama} pada percobaan ini agar siswa mengulang dari NOL?`,
                        `Percobaan ${st.nama} berhasil direset ulang dari nol.`
                      )
                    }
                    className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3 py-2 rounded-lg bg-rose-50 text-rose-800 hover:bg-rose-100 border border-rose-200 text-xs font-semibold"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    Reset Ulang
                  </button>
                )}

                <button
                  type="button"
                  onClick={() =>
                    doAction({
                      action: "toggle_block",
                      student_id: st.id,
                      is_blocked: !st.is_blocked,
                    })
                  }
                  className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold"
                >
                  {st.is_blocked ? (
                    <>
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
                      Buka Blokir
                    </>
                  ) : (
                    <>
                      <Ban className="w-3.5 h-3.5 text-rose-700" aria-hidden="true" />
                      Blokir
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
        {students.length === 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-600 text-sm">
            Tidak ada peserta untuk filter ini.
          </div>
        )}
      </div>

      {/* Tabel Peserta (Khusus Desktop) */}
      <div className="hidden lg:block bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="text-left px-4 py-3">Peserta</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Terjawab</th>
              <th className="text-left px-4 py-3">Aktif</th>
              <th className="text-left px-4 py-3">Log</th>
              <th className="text-right px-4 py-3">Tindakan Pengawas</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {students.map((st) => {
              const att = latestAttemptByStudent.get(st.id);
              const totalQ = Array.isArray(att?.question_order)
                ? att.question_order.length
                : 0;
              const answered = att ? answerCounts[att.id] || 0 : 0;
              const attLogs = att
                ? logs.filter((l) => l.attempt_id === att.id)
                : [];
              const warnCount = attLogs.filter(
                (l) =>
                  l.jenis === "pindah_tab" ||
                  l.jenis === "keluar_layar_penuh" ||
                  l.jenis === "split_screen"
              ).length;
              const isLocked = Boolean(att?.is_locked && att.status === "mengerjakan");

              return (
                <tr
                  key={st.id}
                  className={
                    isLocked
                      ? "bg-rose-50/70"
                      : st.is_blocked
                      ? "bg-red-50/40"
                      : ""
                  }
                >
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-slate-900">{st.nama}</div>
                    <div className="text-xs text-slate-500">
                      {st.username} • {st.classes?.nama || "-"}
                      {st.is_blocked && (
                        <span className="ml-2 text-red-600 font-semibold">
                          [DIBLOKIR]
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap items-center gap-1">
                      {att && (att.attempt_ke || 1) > 1 && (
                        <span className="px-1.5 py-0.5 text-[11px] rounded bg-purple-100 text-purple-800 font-semibold">
                          Remedial #{(att.attempt_ke || 2) - 1}
                        </span>
                      )}
                      {!att ? (
                        <span className="px-2 py-0.5 text-xs rounded-full bg-slate-100 text-slate-600">
                          Belum Mulai
                        </span>
                      ) : att.status === "mengerjakan" ? (
                        <>
                          {isLocked ? (
                            <span className="px-2 py-0.5 text-xs rounded-full bg-rose-600 text-white font-bold animate-pulse">
                              TERKUNCI ({att.pelanggaran_count || warnCount}x)
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 text-xs rounded-full bg-amber-100 text-amber-800 font-medium">
                              Mengerjakan
                              {att.extra_minutes > 0
                                ? ` (+${att.extra_minutes}m)`
                                : ""}
                            </span>
                          )}
                        </>
                      ) : att.status === "menunggu_koreksi" ? (
                        <span className="px-2 py-0.5 text-xs rounded-full bg-indigo-100 text-indigo-800">
                          Menunggu Koreksi
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 text-xs rounded-full bg-emerald-100 text-emerald-800 font-medium">
                          Selesai ({att.nilai ?? "-"})
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs">
                    {att ? `${answered} / ${totalQ}` : "-"}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-600">
                    {att ? formatDateTime(att.last_active_at) : "-"}
                  </td>
                  <td className="px-4 py-2.5">
                    {warnCount > 0 ? (
                      <button
                        onClick={() =>
                          setSelectedLogs({ nama: st.nama, items: attLogs })
                        }
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 text-xs font-medium cursor-pointer"
                      >
                        <AlertTriangle className="w-3.5 h-3.5" />
                        {warnCount}x
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400">Normal</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap items-center justify-end gap-1">
                      <button
                        onClick={() =>
                          doAction(
                            {
                              action: "reset_login",
                              student_id: st.id,
                              attempt_id: att?.id,
                            },
                            undefined,
                            `Sesi login ${st.nama} berhasil direset.`
                          )
                        }
                        title="Reset Login (Izinkan ganti HP/PC tanpa hapus jawaban)"
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-medium cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" /> Reset Login
                      </button>

                      {att && att.status === "mengerjakan" && (
                        <>
                          {isLocked && (
                            <button
                              onClick={() =>
                                doAction(
                                  {
                                    action: "unlock_attempt",
                                    attempt_id: att.id,
                                  },
                                  `Buka kunci layar ujian untuk ${st.nama}? (Hitungan pelanggaran akan direset ke 0 agar siswa dapat melanjutkan)`,
                                  `Kunci layar ${st.nama} berhasil dibuka.`
                                )
                              }
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer shadow-2xs"
                            >
                              <Unlock className="w-3.5 h-3.5" /> Buka Kunci
                            </button>
                          )}
                          <button
                            onClick={() => {
                              const m = prompt("Tambah waktu berapa menit?", "10");
                              if (m && Number(m) > 0) {
                                doAction({
                                  action: "add_time",
                                  attempt_id: att.id,
                                  minutes: Number(m),
                                });
                              }
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-50 text-amber-800 hover:bg-amber-100 text-xs font-medium cursor-pointer"
                          >
                            <Clock className="w-3.5 h-3.5" /> +Waktu
                          </button>
                          <button
                            onClick={() =>
                              doAction(
                                { action: "force_finish", attempt_id: att.id },
                                `Paksa selesai ujian untuk ${st.nama}?`
                              )
                            }
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-xs font-medium cursor-pointer"
                          >
                            <CheckSquare className="w-3.5 h-3.5" /> Selesai
                          </button>
                        </>
                      )}

                      {att && att.status !== "mengerjakan" && (
                        <button
                          onClick={() => {
                            const m = prompt(
                              `Buka kembali ujian untuk ${st.nama}? Tambah waktu berapa menit?`,
                              "30"
                            );
                            if (m && Number(m) > 0) {
                              doAction({
                                action: "reopen_attempt",
                                attempt_id: att.id,
                                minutes: Number(m),
                              });
                            }
                          }}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-xs font-medium cursor-pointer"
                        >
                          <Unlock className="w-3.5 h-3.5" /> Buka Lagi
                        </button>
                      )}

                      {att && (
                        <button
                          onClick={() =>
                            doAction(
                              {
                                action: "reset_attempt_total",
                                attempt_id: att.id,
                                student_id: st.id,
                              },
                              `PERINGATAN: Hapus percobaan & seluruh jawaban ${st.nama} pada percobaan ini agar siswa mengulang dari NOL?`,
                              `Percobaan ${st.nama} berhasil direset ulang dari nol.`
                            )
                          }
                          title="Reset Ulang dari Nol (Hapus jawaban percobaan ini)"
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 text-xs font-medium cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Reset Ulang
                        </button>
                      )}

                      <button
                        onClick={() =>
                          doAction({
                            action: "toggle_block",
                            student_id: st.id,
                            is_blocked: !st.is_blocked,
                          })
                        }
                        title={st.is_blocked ? "Buka Blokir" : "Blokir Peserta"}
                        className="p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer"
                      >
                        {st.is_blocked ? (
                          <CheckCircle className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <Ban className="w-4 h-4 text-rose-600" />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {students.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-600">
                  Tidak ada peserta untuk filter ini.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Detail Log */}
      {selectedLogs && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900">
                Log Aktivitas: {selectedLogs.nama}
              </h3>
              <button
                onClick={() => setSelectedLogs(null)}
                className="text-sm text-slate-500 hover:text-slate-900 cursor-pointer"
              >
                Tutup
              </button>
            </div>
            <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 text-sm">
              {selectedLogs.items.map((l) => (
                <div key={l.id} className="py-2 flex items-center justify-between">
                  <span className="font-medium text-slate-800">
                    {l.jenis === "pindah_tab"
                      ? "Berpindah Tab / Jendela / Minimize"
                      : l.jenis === "keluar_layar_penuh"
                      ? "Keluar Layar Penuh"
                      : l.jenis === "split_screen"
                      ? "Layar Terbagi (Split-Screen)"
                      : l.jenis === "copy_paste"
                      ? "Percobaan Copy / Paste"
                      : l.jenis === "buka_kunci"
                      ? "Kunci Layar Dibuka Pengawas"
                      : "Reset Login oleh Admin"}
                  </span>
                  <span className="text-xs text-slate-500">
                    {formatDateTime(l.waktu)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
