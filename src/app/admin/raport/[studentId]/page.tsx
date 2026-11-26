"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/client";
import {
  aggregateGradesByStudent,
  type RawStudentAttempt,
  type RemedialRule,
} from "@/lib/remedial";
import type { AcademicYear, Profile, SchoolSettings } from "@/types/cbt";
import {
  ArrowLeft,
  Printer,
  FileSpreadsheet,
  GraduationCap,
} from "lucide-react";

interface StudentExamAttempt {
  id: number;
  exam_id: number;
  student_id: string;
  attempt_ke?: number | null;
  is_remedial?: boolean | null;
  status: string;
  nilai: number | null;
  nilai_sementara: number | null;
  mulai: string;
  selesai: string | null;
  exams: {
    id: number;
    judul: string;
    kkm: number;
    jenis: string;
    tahun_ajaran_id: number | null;
    aturan_remedial?: string | null;
    subjects: { id: number; nama: string } | null;
  } | null;
}

interface SubjectReportRow {
  subjectId: number;
  subjectName: string;
  kkm: number;
  examCount: number;
  rataRata: number;
  predikat: string;
  keterangan: string;
  details: Array<{
    examId: number;
    judul: string;
    nilaiUtama: number | null;
    nilaiRemedial: number | null;
    nilaiAkhir: number | null;
    kkm: number;
    keterangan: string;
  }>;
}

function getPredikat(nilai: number, kkm: number): string {
  if (nilai >= 90) return "A (Sangat Baik)";
  if (nilai >= 80) return "B (Baik)";
  if (nilai >= kkm) return "C (Cukup / Tuntas)";
  return "D (Perlu Bimbingan)";
}

function extractJurusanFromClass(kelasNama?: string | null): string {
  if (!kelasNama) return "-";
  return kelasNama.replace(/^(XII|XI|X)[\s.]+/i, "").trim() || kelasNama;
}

export default function AdminRaportSiswaPage() {
  const params = useParams();
  const studentId = String(params.studentId || "");
  const supabase = createClient();

  const [student, setStudent] = useState<Profile | null>(null);
  const [settings, setSettings] = useState<SchoolSettings>({
    nama_sekolah: "SMK Negeri 3 Kotamobagu",
    logo: "",
    alamat_sekolah: "",
  });
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [selectedYearId, setSelectedYearId] = useState<string>("");
  const [attempts, setAttempts] = useState<StudentExamAttempt[]>([]);
  const [onlyResmi, setOnlyResmi] = useState(true);
  const [showDetails, setShowDetails] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!studentId) return;
    Promise.all([
      supabase
        .from("profiles")
        .select("*, classes(id, nama)")
        .eq("id", studentId)
        .single(),
      supabase.from("settings").select("kunci, nilai"),
      supabase
        .from("academic_years")
        .select("*")
        .order("id", { ascending: false }),
      supabase
        .from("attempts")
        .select(
          "id, exam_id, student_id, attempt_ke, is_remedial, status, nilai, nilai_sementara, mulai, selesai, exams(id, judul, kkm, jenis, tahun_ajaran_id, aturan_remedial, subjects(id, nama))"
        )
        .eq("student_id", studentId)
        .order("id"),
    ]).then(([{ data: st }, { data: setRows }, { data: yr }, { data: att }]) => {
      setStudent((st as Profile) || null);
      const map: Record<string, string> = {};
      (setRows || []).forEach((r) => (map[r.kunci] = r.nilai));
      setSettings({
        nama_sekolah: map.nama_sekolah || "SMK Negeri 3 Kotamobagu",
        logo: map.logo || "",
        alamat_sekolah: map.alamat_sekolah || "",
      });

      const yList = (yr || []) as AcademicYear[];
      setYears(yList);
      const aktif = yList.find((y) => y.aktif);
      if (aktif) setSelectedYearId(String(aktif.id));

      setAttempts((att || []) as unknown as StudentExamAttempt[]);
      setLoading(false);
    });
  }, [studentId, supabase]);

  // Kelompokkan attempt per exam -> hitung nilai akhir (termasuk aturan remedial) -> rata-rata per Mapel
  const reportRows: SubjectReportRow[] = useMemo(() => {
    const filtered = attempts.filter((a) => {
      if (!a.exams) return false;
      if (onlyResmi && a.exams.jenis !== "resmi") return false;
      if (
        selectedYearId &&
        a.exams.tahun_ajaran_id &&
        String(a.exams.tahun_ajaran_id) !== selectedYearId
      ) {
        return false;
      }
      return true;
    });

    // Grup per exam_id dulu
    const byExam = new Map<number, StudentExamAttempt[]>();
    for (const a of filtered) {
      if (!byExam.has(a.exam_id)) byExam.set(a.exam_id, []);
      byExam.get(a.exam_id)!.push(a);
    }

    // Grup hasil per subject_id
    const bySubject = new Map<number, SubjectReportRow>();

    for (const [examId, examAtts] of byExam.entries()) {
      const ex = examAtts[0].exams!;
      const subjId = ex.subjects?.id || 0;
      const subjName = ex.subjects?.nama || "Mata Pelajaran";
      const rule = (ex.aturan_remedial as RemedialRule) || "maks_kkm";

      const rawLike: RawStudentAttempt[] = examAtts.map((x) => ({
        id: x.id,
        student_id: x.student_id,
        attempt_ke: x.attempt_ke,
        is_remedial: x.is_remedial,
        status: x.status,
        nilai: x.nilai,
        nilai_sementara: x.nilai_sementara,
        mulai: x.mulai,
        selesai: x.selesai,
        profiles: student
          ? {
              id: student.id,
              username: student.username,
              nama: student.nama,
              kelas_id: student.kelas_id,
              classes: student.classes || null,
            }
          : null,
      }));

      const [agg] = aggregateGradesByStudent(rawLike, ex.kkm, rule);
      if (!agg) continue;

      if (!bySubject.has(subjId)) {
        bySubject.set(subjId, {
          subjectId: subjId,
          subjectName: subjName,
          kkm: ex.kkm,
          examCount: 0,
          rataRata: 0,
          predikat: "-",
          keterangan: "-",
          details: [],
        });
      }

      const row = bySubject.get(subjId)!;
      row.details.push({
        examId,
        judul: ex.judul,
        nilaiUtama: agg.nilai_utama,
        nilaiRemedial: agg.nilai_remedial,
        nilaiAkhir: agg.nilai_akhir,
        kkm: ex.kkm,
        keterangan: agg.keterangan,
      });
    }

    const finalRows: SubjectReportRow[] = [];
    for (const row of bySubject.values()) {
      const scored = row.details.filter((d) => d.nilaiAkhir !== null);
      row.examCount = row.details.length;
      if (scored.length > 0) {
        const avg =
          scored.reduce((acc, d) => acc + (d.nilaiAkhir || 0), 0) /
          scored.length;
        row.rataRata = Math.round(avg * 100) / 100;
        row.predikat = getPredikat(row.rataRata, row.kkm);
        const usedRemedial = row.details.some(
          (d) => d.keterangan === "Tuntas Remedial"
        );
        row.keterangan =
          row.rataRata >= row.kkm
            ? usedRemedial
              ? "Tuntas (Remedial)"
              : "Tuntas"
            : "Belum Tuntas";
      } else {
        row.rataRata = 0;
        row.predikat = "-";
        row.keterangan = "Menunggu Koreksi";
      }
      finalRows.push(row);
    }

    return finalRows.sort((a, b) => a.subjectName.localeCompare(b.subjectName));
  }, [attempts, onlyResmi, selectedYearId, student]);

  const overallAverage = useMemo(() => {
    const valid = reportRows.filter((r) => r.keterangan !== "Menunggu Koreksi");
    if (valid.length === 0) return 0;
    const sum = valid.reduce((a, b) => a + b.rataRata, 0);
    return Math.round((sum / valid.length) * 100) / 100;
  }, [reportRows]);

  const tuntasCount = reportRows.filter((r) =>
    r.keterangan.startsWith("Tuntas")
  ).length;
  const belumTuntasCount = reportRows.filter(
    (r) => r.keterangan === "Belum Tuntas"
  ).length;

  function exportExcel() {
    if (!student) return;
    const rows = reportRows.map((r, i) => ({
      No: i + 1,
      "Mata Pelajaran": r.subjectName,
      "Jumlah Ujian": r.examCount,
      KKM: r.kkm,
      "Nilai Akhir": r.rataRata,
      Predikat: r.predikat,
      Keterangan: r.keterangan,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [
      { wch: 5 },
      { wch: 36 },
      { wch: 13 },
      { wch: 8 },
      { wch: 13 },
      { wch: 22 },
      { wch: 20 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Raport Sementara");
    XLSX.writeFile(
      wb,
      `raport-sementara-${student.username}-${student.nama.replace(
        /[^a-zA-Z0-9_-]/g,
        "_"
      )}.xlsx`
    );
  }

  const activeYearName =
    years.find((y) => String(y.id) === selectedYearId)?.nama || "Semua Tahun";

  if (loading) {
    return (
      <div className="p-8 text-center text-slate-500 text-sm">
        Memuat Raport Sementara...
      </div>
    );
  }

  if (!student) {
    return (
      <div className="p-8 text-center text-slate-500 text-sm space-y-3">
        <p>Data siswa tidak ditemukan.</p>
        <Link href="/admin/pengguna" className="text-blue-600 underline">
          Kembali ke Data Siswa
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      {/* Toolbar Non-Print */}
      <div className="no-print bg-white p-4 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <Link
            href="/admin/pengguna"
            className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="w-4 h-4" /> Kembali
          </Link>
          <select
            value={selectedYearId}
            onChange={(e) => setSelectedYearId(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs bg-white"
          >
            <option value="">Semua Tahun Ajaran</option>
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                TA {y.nama} {y.aktif ? "(Aktif)" : ""}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={onlyResmi}
              onChange={(e) => setOnlyResmi(e.target.checked)}
            />
            Hanya Ujian Resmi
          </label>
          <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={showDetails}
              onChange={(e) => setShowDetails(e.target.checked)}
            />
            Tampilkan Rincian Ujian
          </label>
        </div>

        <div className="flex gap-2">
          <button
            onClick={exportExcel}
            disabled={reportRows.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white rounded-lg text-xs font-semibold cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" /> Ekspor Excel
          </button>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold cursor-pointer"
          >
            <Printer className="w-4 h-4" /> Cetak / Simpan PDF
          </button>
        </div>
      </div>

      {/* Lembar Raport Sementara (Print-Ready) */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 sm:p-10 space-y-6">
        {/* Kop Sekolah */}
        <div className="flex items-center gap-4 border-b-2 border-slate-900 pb-4">
          {settings.logo ? (
            <img
              src={settings.logo}
              alt="Logo"
              className="w-16 h-16 object-contain shrink-0"
            />
          ) : (
            <div className="w-14 h-14 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0">
              <GraduationCap className="w-8 h-8" />
            </div>
          )}
          <div className="flex-1 text-center">
            <div className="text-base sm:text-lg font-bold uppercase tracking-wide">
              LAPORAN HASIL BELAJAR SEMENTARA (RAPORT CBT)
            </div>
            <div className="text-sm sm:text-base font-bold text-slate-900">
              {settings.nama_sekolah}
            </div>
            {settings.alamat_sekolah && (
              <div className="text-xs text-slate-600">
                {settings.alamat_sekolah}
              </div>
            )}
          </div>
        </div>

        {/* Identitas Peserta Didik */}
        <div className="grid sm:grid-cols-2 gap-x-8 gap-y-1.5 text-sm">
          <div className="flex">
            <span className="w-36 text-slate-500">Nama Peserta Didik</span>
            <span className="font-bold text-slate-900">: {student.nama}</span>
          </div>
          <div className="flex">
            <span className="w-36 text-slate-500">Kelas</span>
            <span className="font-semibold text-slate-900">
              : {student.classes?.nama || "Belum diatur"}
            </span>
          </div>
          <div className="flex">
            <span className="w-36 text-slate-500">NIS / Username</span>
            <span className="font-mono font-semibold text-slate-900">
              : {student.username}
            </span>
          </div>
          <div className="flex">
            <span className="w-36 text-slate-500">Program Keahlian</span>
            <span className="text-slate-900">
              : {extractJurusanFromClass(student.classes?.nama)}
            </span>
          </div>
          <div className="flex">
            <span className="w-36 text-slate-500">Tahun Ajaran</span>
            <span className="text-slate-900">: {activeYearName}</span>
          </div>
          <div className="flex">
            <span className="w-36 text-slate-500">Status Siswa</span>
            <span className="text-slate-900">
              : {student.aktif ? "Aktif" : "Lulus / Arsip"}
            </span>
          </div>
        </div>

        {/* Tabel Nilai Mapel */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse border border-slate-800">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-800 px-3 py-2 w-10">No</th>
                <th className="border border-slate-800 px-3 py-2 text-left">
                  Mata Pelajaran
                </th>
                <th className="border border-slate-800 px-2 py-2 w-16 text-center">
                  KKM
                </th>
                <th className="border border-slate-800 px-2 py-2 w-24 text-center">
                  Nilai Akhir
                </th>
                <th className="border border-slate-800 px-3 py-2 text-left w-40">
                  Predikat
                </th>
                <th className="border border-slate-800 px-3 py-2 text-left w-36">
                  Keterangan
                </th>
              </tr>
            </thead>
            <tbody>
              {reportRows.map((row, idx) => (
                <tr key={row.subjectId}>
                  <td className="border border-slate-800 px-3 py-2 text-center">
                    {idx + 1}
                  </td>
                  <td className="border border-slate-800 px-3 py-2">
                    <div className="font-medium text-slate-900">
                      {row.subjectName}
                    </div>
                    {showDetails && (
                      <ul className="mt-1 space-y-0.5 text-[11px] text-slate-600 list-disc pl-4">
                        {row.details.map((d) => (
                          <li key={d.examId}>
                            {d.judul}: Utama {d.nilaiUtama ?? "-"}
                            {d.nilaiRemedial !== null
                              ? `, Remedial ${d.nilaiRemedial}`
                              : ""}{" "}
                            → <strong>{d.nilaiAkhir ?? "-"}</strong>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="border border-slate-800 px-2 py-2 text-center">
                    {row.kkm}
                  </td>
                  <td className="border border-slate-800 px-2 py-2 text-center font-bold">
                    {row.keterangan === "Menunggu Koreksi" ? "-" : row.rataRata}
                  </td>
                  <td className="border border-slate-800 px-3 py-2 text-xs">
                    {row.predikat}
                  </td>
                  <td className="border border-slate-800 px-3 py-2 text-xs font-semibold">
                    <span
                      className={
                        row.keterangan === "Belum Tuntas"
                          ? "text-rose-700"
                          : row.keterangan.startsWith("Tuntas")
                          ? "text-emerald-700"
                          : "text-amber-700"
                      }
                    >
                      {row.keterangan}
                    </span>
                  </td>
                </tr>
              ))}
              {reportRows.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="border border-slate-800 px-4 py-8 text-center text-slate-400"
                  >
                    Belum ada nilai ujian CBT untuk siswa ini pada filter yang dipilih.
                  </td>
                </tr>
              )}
              {reportRows.length > 0 && (
                <tr className="bg-slate-50 font-bold">
                  <td
                    colSpan={3}
                    className="border border-slate-800 px-3 py-2 text-right"
                  >
                    Rata-Rata Nilai Keseluruhan
                  </td>
                  <td className="border border-slate-800 px-2 py-2 text-center text-base">
                    {overallAverage}
                  </td>
                  <td
                    colSpan={2}
                    className="border border-slate-800 px-3 py-2 text-xs font-medium"
                  >
                    Tuntas: {tuntasCount} mapel • Belum Tuntas:{" "}
                    {belumTuntasCount} mapel
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Catatan & Tanda Tangan */}
        <div className="text-xs text-slate-500">
          * Raport sementara ini dihasilkan otomatis dari rekap nilai ujian CBT sekolah (sudah memperhitungkan hasil remedial sesuai aturan KKM).
        </div>

        <div className="grid grid-cols-3 gap-4 pt-6 text-xs sm:text-sm text-center print-break-inside-avoid">
          <div>
            <div>Mengetahui,</div>
            <div>Orang Tua / Wali</div>
            <div className="h-16" />
            <div className="border-t border-slate-800 mx-4 pt-1">
              (...............................)
            </div>
          </div>
          <div>
            <div>&nbsp;</div>
            <div>Wali Kelas</div>
            <div className="h-16" />
            <div className="border-t border-slate-800 mx-4 pt-1">
              (...............................)
            </div>
          </div>
          <div>
            <div>
              {new Intl.DateTimeFormat("id-ID", {
                day: "numeric",
                month: "long",
                year: "numeric",
              }).format(new Date())}
            </div>
            <div>Kepala Sekolah</div>
            <div className="h-16" />
            <div className="border-t border-slate-800 mx-4 pt-1">
              (...............................)
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
