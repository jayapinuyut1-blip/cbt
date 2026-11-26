"use client";

import { useCallback, useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime } from "@/lib/format";
import type { AcademicYear, Exam, SchoolClass } from "@/types/cbt";
import { Download, FileSpreadsheet, Database } from "lucide-react";

interface ScoreRow {
  id: number;
  status: string;
  nilai: number | null;
  nilai_sementara: number | null;
  mulai: string;
  selesai: string | null;
  profiles: {
    username: string;
    nama: string;
    kelas_id: number | null;
    classes: { nama: string } | null;
  } | null;
}

export default function AdminNilaiPage() {
  const supabase = createClient();
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [selectedYearId, setSelectedYearId] = useState("");
  const [selectedExamId, setSelectedExamId] = useState("");
  const [selectedKelasId, setSelectedKelasId] = useState("");
  const [rows, setRows] = useState<ScoreRow[]>([]);

  useEffect(() => {
    Promise.all([
      supabase.from("academic_years").select("*").order("id", { ascending: false }),
      supabase.from("exams").select("*, subjects(id, nama)").order("id", { ascending: false }),
      supabase.from("classes").select("*").order("nama"),
    ]).then(([{ data: y }, { data: ex }, { data: cl }]) => {
      setYears((y || []) as AcademicYear[]);
      const exList = (ex || []) as Exam[];
      setExams(exList);
      setClasses((cl || []) as SchoolClass[]);
      if (exList[0]) setSelectedExamId(String(exList[0].id));
    });
  }, [supabase]);

  const filteredExams = exams.filter((e) =>
    selectedYearId ? String(e.tahun_ajaran_id || "") === selectedYearId : true
  );

  const loadScores = useCallback(async () => {
    if (!selectedExamId) {
      setRows([]);
      return;
    }
    const { data } = await supabase
      .from("attempts")
      .select(
        "id, status, nilai, nilai_sementara, mulai, selesai, profiles(username, nama, kelas_id, classes(nama))"
      )
      .eq("exam_id", Number(selectedExamId))
      .order("id");

    const list = (data || []) as unknown as ScoreRow[];
    setRows(
      selectedKelasId
        ? list.filter((r) => String(r.profiles?.kelas_id || "") === selectedKelasId)
        : list
    );
  }, [supabase, selectedExamId, selectedKelasId]);

  useEffect(() => {
    loadScores();
  }, [loadScores]);

  const selectedExam = exams.find((e) => String(e.id) === selectedExamId);

  function exportExcel() {
    if (!selectedExam) return;
    const exportData = rows.map((r, idx) => {
      const nilaiFinal = r.status === "selesai" ? r.nilai : r.nilai_sementara;
      return {
        No: idx + 1,
        NIS: r.profiles?.username || "-",
        Nama: r.profiles?.nama || "-",
        Kelas: r.profiles?.classes?.nama || "-",
        Status:
          r.status === "selesai"
            ? "Selesai"
            : r.status === "menunggu_koreksi"
            ? "Menunggu Koreksi Essay"
            : "Mengerjakan",
        Nilai: nilaiFinal ?? "-",
        KKM: selectedExam.kkm,
        Keterangan:
          r.status === "selesai" && r.nilai !== null
            ? r.nilai >= selectedExam.kkm
              ? "Tuntas"
              : "Belum Tuntas"
            : "-",
        Mulai: formatDateTime(r.mulai),
        Selesai: formatDateTime(r.selesai),
      };
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
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
            Rekap Nilai & Backup Database
          </h1>
          <p className="text-sm text-slate-500">
            Lihat hasil ujian lintas tahun ajaran, ekspor ke Excel, dan unduh backup database satu tombol.
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

        <button
          onClick={exportExcel}
          disabled={rows.length === 0}
          className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white rounded-lg text-sm font-medium cursor-pointer"
        >
          <FileSpreadsheet className="w-4 h-4" /> Ekspor Excel
        </button>
      </div>

      {/* Tabel Rekap */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="text-left px-4 py-3">NIS</th>
              <th className="text-left px-4 py-3">Nama Peserta</th>
              <th className="text-left px-4 py-3">Kelas</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Nilai</th>
              <th className="text-left px-4 py-3">Keterangan (KKM {selectedExam?.kkm ?? "-"})</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => {
              const tuntas =
                r.status === "selesai" &&
                r.nilai !== null &&
                selectedExam &&
                r.nilai >= selectedExam.kkm;
              return (
                <tr key={r.id}>
                  <td className="px-4 py-2.5 font-mono text-xs">
                    {r.profiles?.username || "-"}
                  </td>
                  <td className="px-4 py-2.5 font-medium text-slate-900">
                    {r.profiles?.nama || "-"}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">
                    {r.profiles?.classes?.nama || "-"}
                  </td>
                  <td className="px-4 py-2.5 text-xs">
                    {r.status === "selesai"
                      ? "Selesai"
                      : r.status === "menunggu_koreksi"
                      ? "Menunggu Koreksi"
                      : "Mengerjakan"}
                  </td>
                  <td className="px-4 py-2.5 font-bold text-slate-900">
                    {r.status === "selesai" ? (
                      r.nilai
                    ) : r.status === "menunggu_koreksi" ? (
                      <span className="text-amber-700">
                        {r.nilai_sementara} (sementara)
                      </span>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {r.status === "selesai" && r.nilai !== null ? (
                      <span
                        className={`px-2 py-0.5 text-xs rounded-full font-medium ${
                          tuntas
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-rose-100 text-rose-700"
                        }`}
                      >
                        {tuntas ? "Tuntas" : "Belum Tuntas"}
                      </span>
                    ) : (
                      "-"
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
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
    </div>
  );
}
