"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime } from "@/lib/format";
import {
  aggregateGradesByStudent,
  remedialRuleLabel,
  type RawStudentAttempt,
  type RemedialRule,
} from "@/lib/remedial";
import RemedialModal from "@/components/RemedialModal";
import type { AcademicYear, Exam, SchoolClass } from "@/types/cbt";
import { Download, FileSpreadsheet, Database, RotateCcw } from "lucide-react";

export default function AdminNilaiPage() {
  const supabase = createClient();
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [selectedYearId, setSelectedYearId] = useState("");
  const [selectedExamId, setSelectedExamId] = useState("");
  const [selectedKelasId, setSelectedKelasId] = useState("");
  const [rawAttempts, setRawAttempts] = useState<RawStudentAttempt[]>([]);

  const [remedialModalOpen, setRemedialModalOpen] = useState(false);
  const [remedialPreselect, setRemedialPreselect] = useState<string[]>([]);

  const loadExams = useCallback(async () => {
    const [{ data: y }, { data: ex }, { data: cl }] = await Promise.all([
      supabase
        .from("academic_years")
        .select("*")
        .order("id", { ascending: false }),
      supabase
        .from("exams")
        .select("*, subjects(id, nama)")
        .order("id", { ascending: false }),
      supabase.from("classes").select("*").order("nama"),
    ]);
    setYears((y || []) as AcademicYear[]);
    const exList = (ex || []) as Exam[];
    setExams(exList);
    setClasses((cl || []) as SchoolClass[]);
    if (exList[0] && !selectedExamId) setSelectedExamId(String(exList[0].id));
  }, [supabase, selectedExamId]);

  useEffect(() => {
    loadExams();
  }, [loadExams]);

  const filteredExams = exams.filter((e) =>
    selectedYearId ? String(e.tahun_ajaran_id || "") === selectedYearId : true
  );

  const loadScores = useCallback(async () => {
    if (!selectedExamId) {
      setRawAttempts([]);
      return;
    }
    const { data } = await supabase
      .from("attempts")
      .select(
        "id, student_id, attempt_ke, is_remedial, status, nilai, nilai_sementara, mulai, selesai, profiles(id, username, nama, kelas_id, classes(nama))"
      )
      .eq("exam_id", Number(selectedExamId))
      .order("id");

    const list = (data || []) as unknown as RawStudentAttempt[];
    setRawAttempts(
      selectedKelasId
        ? list.filter(
            (r) => String(r.profiles?.kelas_id || "") === selectedKelasId
          )
        : list
    );
  }, [supabase, selectedExamId, selectedKelasId]);

  useEffect(() => {
    loadScores();
  }, [loadScores]);

  const selectedExam = exams.find((e) => String(e.id) === selectedExamId);
  const remedialRule: RemedialRule =
    (selectedExam?.aturan_remedial as RemedialRule) || "maks_kkm";

  const aggregated = useMemo(() => {
    if (!selectedExam) return [];
    return aggregateGradesByStudent(rawAttempts, selectedExam.kkm, remedialRule);
  }, [rawAttempts, selectedExam, remedialRule]);

  const belowKkmList = aggregated.filter((a) => a.needs_remedial);

  function exportExcel() {
    if (!selectedExam) return;
    const exportData = aggregated.map((r, idx) => ({
      No: idx + 1,
      NIS: r.username,
      Nama: r.nama,
      Kelas: r.kelas_nama,
      "Nilai Utama": r.nilai_utama ?? "-",
      "Nilai Remedial": r.nilai_remedial ?? "-",
      "Nilai Akhir": r.nilai_akhir ?? "-",
      KKM: selectedExam.kkm,
      "Aturan Remedial": remedialRuleLabel(remedialRule),
      Keterangan: r.keterangan,
      "Mulai Utama": formatDateTime(r.mulai),
      "Selesai Terakhir": formatDateTime(r.selesai),
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    ws["!cols"] = [
      { wch: 5 },
      { wch: 15 },
      { wch: 28 },
      { wch: 26 },
      { wch: 13 },
      { wch: 15 },
      { wch: 13 },
      { wch: 8 },
      { wch: 22 },
      { wch: 18 },
      { wch: 20 },
      { wch: 20 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Rekap Nilai");
    const safeTitle = selectedExam.judul.replace(/[^a-zA-Z0-9_-]/g, "_");
    XLSX.writeFile(wb, `rekap-nilai-${safeTitle}.xlsx`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Rekap Nilai, Remedial & Backup Database
          </h1>
          <p className="text-sm text-slate-500">
            Lihat nilai utama & remedial lintas tahun ajaran, buka remedial 1-klik untuk siswa &lt; KKM, ekspor Excel, dan backup database.
          </p>
        </div>

        <a
          href="/api/admin/backup"
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-medium"
        >
          <Database className="w-4 h-4" /> Backup Database (.sql)
        </a>
      </div>

      {/* Filter */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-wrap gap-3 items-center">
        <select
          value={selectedYearId}
          onChange={(e) => setSelectedYearId(e.target.value)}
          className="px-3 py-2 rounded-lg border border-slate-300 text-sm"
        >
          <option value="">Semua Tahun Ajaran</option>
          {years.map((y) => (
            <option key={y.id} value={y.id}>
              {y.nama} {y.aktif ? "(Aktif)" : "(Arsip)"}
            </option>
          ))}
        </select>

        <select
          value={selectedExamId}
          onChange={(e) => setSelectedExamId(e.target.value)}
          className="flex-1 min-w-52 px-3 py-2 rounded-lg border border-slate-300 text-sm"
        >
          <option value="">-- Pilih Ujian --</option>
          {filteredExams.map((ex) => (
            <option key={ex.id} value={ex.id}>
              {ex.judul} ({ex.subjects?.nama})
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

        {selectedExam && aggregated.length > 0 && (
          <button
            onClick={() => {
              setRemedialPreselect(belowKkmList.map((b) => b.student_id));
              setRemedialModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" /> Buka Remedial ({belowKkmList.length}{" "}
            &lt; KKM)
          </button>
        )}

        <button
          onClick={exportExcel}
          disabled={aggregated.length === 0}
          className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white rounded-lg text-sm font-medium cursor-pointer"
        >
          <FileSpreadsheet className="w-4 h-4" /> Ekspor Excel
        </button>
      </div>

      {selectedExam && (
        <div className="text-xs text-slate-600 flex flex-wrap gap-4 px-1">
          <span>
            <strong>KKM:</strong> {selectedExam.kkm}
          </span>
          <span>
            <strong>Aturan Remedial:</strong> {remedialRuleLabel(remedialRule)}
          </span>
          <span>
            <strong>Siswa &lt; KKM:</strong>{" "}
            <span className="text-rose-700 font-semibold">
              {belowKkmList.length} siswa
            </span>
          </span>
        </div>
      )}

      {/* Tabel Rekap */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="text-left px-4 py-3">NIS</th>
              <th className="text-left px-4 py-3">Nama Peserta</th>
              <th className="text-left px-4 py-3">Kelas</th>
              <th className="text-center px-3 py-3">Nilai Utama</th>
              <th className="text-center px-3 py-3">Remedial</th>
              <th className="text-center px-3 py-3">Nilai Akhir</th>
              <th className="text-left px-4 py-3">Keterangan</th>
              <th className="text-right px-4 py-3">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {aggregated.map((r) => (
              <tr key={r.student_id}>
                <td className="px-4 py-2.5 font-mono text-xs">{r.username}</td>
                <td className="px-4 py-2.5 font-medium text-slate-900">
                  {r.nama}
                </td>
                <td className="px-4 py-2.5 text-slate-600 text-xs">
                  {r.kelas_nama}
                </td>
                <td className="px-3 py-2.5 text-center font-medium text-slate-700">
                  {r.nilai_utama ?? "-"}
                </td>
                <td className="px-3 py-2.5 text-center font-medium text-purple-700">
                  {r.nilai_remedial ?? "-"}
                </td>
                <td className="px-3 py-2.5 text-center font-bold text-slate-900">
                  {r.nilai_akhir ?? "-"}
                </td>
                <td className="px-4 py-2.5">
                  <span
                    className={`px-2 py-0.5 text-xs rounded-full font-medium ${
                      r.keterangan === "Tuntas"
                        ? "bg-emerald-100 text-emerald-700"
                        : r.keterangan === "Tuntas Remedial"
                        ? "bg-blue-100 text-blue-700"
                        : r.keterangan === "Belum Tuntas"
                        ? "bg-rose-100 text-rose-700"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {r.keterangan}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right">
                  {r.needs_remedial && (
                    <button
                      onClick={() => {
                        setRemedialPreselect([r.student_id]);
                        setRemedialModalOpen(true);
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-semibold cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Remedial
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {aggregated.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                  Belum ada data nilai untuk ujian ini.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Catatan Backup */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-900 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-semibold">Tip Pemeliharaan (Sesuai PRD)</div>
          <p className="text-xs text-blue-800 mt-0.5">
            Unduh berkas backup <code>.sql</code> sebelum dan sesudah ujian besar, lalu simpan salinannya di laptop sekolah atau Google Drive.
          </p>
        </div>
        <a
          href="/api/admin/backup"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold"
        >
          <Download className="w-3.5 h-3.5" /> Unduh Backup Sekarang
        </a>
      </div>

      {remedialModalOpen && selectedExam && (
        <RemedialModal
          examId={selectedExam.id}
          examTitle={selectedExam.judul}
          kkm={selectedExam.kkm}
          initialRule={remedialRule}
          candidates={aggregated}
          preselectedIds={remedialPreselect}
          onClose={() => setRemedialModalOpen(false)}
          onSuccess={() => {
            loadExams();
            loadScores();
          }}
        />
      )}
    </div>
  );
}
