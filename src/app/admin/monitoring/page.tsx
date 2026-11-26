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
} from "lucide-react";

interface AttemptRow {
  id: number;
  exam_id: number;
  student_id: string;
  mulai: string;
  selesai: string | null;
  status: "mengerjakan" | "menunggu_koreksi" | "selesai";
  nilai: number | null;
  nilai_sementara: number | null;
  extra_minutes: number;
  question_order: unknown[];
  last_active_at: string;
}

interface LogRow {
  id: number;
  attempt_id: number;
  jenis: "pindah_tab" | "keluar_layar_penuh" | "reset_login";
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
      supabase.from("exams").select("*, subjects(id, nama)").order("id", { ascending: false }),
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
          .eq("exam_id", Number(selectedExamId)),
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

  async function doAction(payload: Record<string, unknown>, confirmMsg?: string) {
    if (confirmMsg && !confirm(confirmMsg)) return;
    const res = await fetch("/api/admin/monitoring", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) alert(data.error || "Gagal memproses aksi.");
    else loadMonitoring();
  }

  const attemptByStudent = new Map(attempts.map((a) => [a.student_id, a]));
  const selectedExam = exams.find((e) => String(e.id) === selectedExamId);

  const summary = {
    belum: students.filter((s) => !attemptByStudent.has(s.id)).length,
    mengerjakan: students.filter(
      (s) => attemptByStudent.get(s.id)?.status === "mengerjakan"
    ).length,
    selesai: students.filter((s) => {
      const st = attemptByStudent.get(s.id)?.status;
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
            Pembaruan otomatis saat siswa menjawab, selesai, berpindah tab, atau keluar layar penuh.
          </p>
        </div>
        <button
          onClick={loadMonitoring}
          className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-sm font-medium cursor-pointer"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Muat Ulang
        </button>
      </div>

      {/* Filter */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-wrap items-center gap-3">
        <select
          value={selectedExamId}
          onChange={(e) => setSelectedExamId(e.target.value)}
          className="flex-1 min-w-56 px-3 py-2 rounded-lg border border-slate-300 text-sm"
        >
          <option value="">-- Pilih Ujian --</option>
          {exams.map((ex) => (
            <option key={ex.id} value={ex.id}>
              {ex.judul} ({ex.subjects?.nama}) — Token: {ex.token}
            </option>
          ))}
        </select>

        <select
          value={selectedKelasId}
          onChange={(e) => setSelectedKelasId(e.target.value)}
          className="px-3 py-2 rounded-lg border border-slate-300 text-sm"
        >
          <option value="">Semua Kelas</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nama}
            </option>
          ))}
        </select>

        {selectedExam && (
          <div className="px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-sm">
            Token:{" "}
            <span className="font-mono font-bold text-blue-800 tracking-widest">
              {selectedExam.token}
            </span>
          </div>
        )}
      </div>

      {/* Ringkasan Status */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500">Belum Mulai</div>
          <div className="text-2xl font-bold text-slate-700">{summary.belum}</div>
        </div>
        <div className="bg-white rounded-xl border border-amber-200 p-4">
          <div className="text-xs text-amber-700">Sedang Mengerjakan</div>
          <div className="text-2xl font-bold text-amber-700">{summary.mengerjakan}</div>
        </div>
        <div className="bg-white rounded-xl border border-emerald-200 p-4">
          <div className="text-xs text-emerald-700">Selesai</div>
          <div className="text-2xl font-bold text-emerald-700">{summary.selesai}</div>
        </div>
      </div>

      {/* Tabel Peserta */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="text-left px-4 py-3">Peserta</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Terjawab</th>
              <th className="text-left px-4 py-3">Terakhir Aktif</th>
              <th className="text-left px-4 py-3">Log Aktivitas</th>
              <th className="text-right px-4 py-3">Tindakan</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {students.map((st) => {
              const att = attemptByStudent.get(st.id);
              const totalQ = Array.isArray(att?.question_order)
                ? att.question_order.length
                : 0;
              const answered = att ? answerCounts[att.id] || 0 : 0;
              const attLogs = att
                ? logs.filter((l) => l.attempt_id === att.id)
                : [];
              const warnCount = attLogs.filter(
                (l) => l.jenis === "pindah_tab" || l.jenis === "keluar_layar_penuh"
              ).length;

              return (
                <tr key={st.id} className={st.is_blocked ? "bg-red-50/40" : ""}>
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
                    {!att ? (
                      <span className="px-2 py-0.5 text-xs rounded-full bg-slate-100 text-slate-600">
                        Belum Mulai
                      </span>
                    ) : att.status === "mengerjakan" ? (
                      <span className="px-2 py-0.5 text-xs rounded-full bg-amber-100 text-amber-800 font-medium">
                        Mengerjakan
                        {att.extra_minutes > 0 ? ` (+${att.extra_minutes}m)` : ""}
                      </span>
                    ) : att.status === "menunggu_koreksi" ? (
                      <span className="px-2 py-0.5 text-xs rounded-full bg-indigo-100 text-indigo-800">
                        Menunggu Koreksi
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 text-xs rounded-full bg-emerald-100 text-emerald-800 font-medium">
                        Selesai ({att.nilai ?? "-"})
                      </span>
                    )}
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
                        {warnCount} peringatan
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400">Normal</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() =>
                          doAction({
                            action: "reset_login",
                            student_id: st.id,
                            attempt_id: att?.id,
                          })
                        }
                        title="Reset Login"
                        className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 cursor-pointer"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>

                      {att && att.status === "mengerjakan" && (
                        <>
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
                            title="Tambah Waktu"
                            className="p-1.5 rounded-lg text-amber-600 hover:bg-amber-50 cursor-pointer"
                          >
                            <Clock className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() =>
                              doAction(
                                { action: "force_finish", attempt_id: att.id },
                                `Paksa selesai ujian untuk ${st.nama}?`
                              )
                            }
                            title="Paksa Selesai"
                            className="p-1.5 rounded-lg text-emerald-700 hover:bg-emerald-50 cursor-pointer"
                          >
                            <CheckSquare className="w-4 h-4" />
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
                          title="Buka Kembali Ujian (Susulan)"
                          className="p-1.5 rounded-lg text-indigo-600 hover:bg-indigo-50 cursor-pointer"
                        >
                          <Unlock className="w-4 h-4" />
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
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
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
                Log Aktivitas — {selectedLogs.nama}
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
                      ? "Berpindah Tab / Jendela"
                      : l.jenis === "keluar_layar_penuh"
                      ? "Keluar Layar Penuh"
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
