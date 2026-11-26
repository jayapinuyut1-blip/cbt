"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { generateExamToken } from "@/lib/auth-utils";
import { formatDateTime } from "@/lib/format";
import {
  combineDateAndTimeToIso,
  getDayNameId,
  getSlotsForDate,
  isFridayDate,
  type ExamSlotKey,
} from "@/lib/exam-slots";
import type {
  Exam,
  ExamOverride,
  ExamSchedule,
  Profile,
  SchoolClass,
  SchoolSettings,
} from "@/types/cbt";
import BeritaAcaraPrintView from "@/components/admin/BeritaAcaraPrintView";
import { Plus, RefreshCw, Trash2, Printer, UserCheck, FileText } from "lucide-react";

export default function AdminJadwalPage() {
  const supabase = createClient();
  const [exams, setExams] = useState<Exam[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [students, setStudents] = useState<Profile[]>([]);
  const [schedules, setSchedules] = useState<ExamSchedule[]>([]);
  const [overrides, setOverrides] = useState<ExamOverride[]>([]);
  const [settings, setSettings] = useState<SchoolSettings>({
    nama_sekolah: "SMK Negeri 3 Kotamobagu",
    logo: "",
    alamat_sekolah: "",
  });

  // Form Jadwal (Preset Jam II / Jam III + Deteksi Hari Jumat)
  const [examId, setExamId] = useState("");
  const [kelasId, setKelasId] = useState("");
  const [examDate, setExamDate] = useState(() => {
    const dt = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  });
  const [slotKey, setSlotKey] = useState<ExamSlotKey>("jam_2");
  const [sesi, setSesi] = useState("Jam II");
  const [mulai, setMulai] = useState("");
  const [selesai, setSelesai] = useState("");

  // Form Override per siswa
  const [ovExamId, setOvExamId] = useState("");
  const [ovStudentId, setOvStudentId] = useState("");
  const [ovDurasi, setOvDurasi] = useState("");
  const [ovMulai, setOvMulai] = useState("");
  const [ovSelesai, setOvSelesai] = useState("");

  // Mode cetak daftar hadir & berita acara
  const [attendanceSchedule, setAttendanceSchedule] =
    useState<ExamSchedule | null>(null);
  const [beritaAcaraSchedule, setBeritaAcaraSchedule] =
    useState<ExamSchedule | null>(null);

  const loadAll = useCallback(async () => {
    const [
      { data: ex },
      { data: cl },
      { data: st },
      { data: sch },
      { data: ov },
      { data: setRows },
    ] = await Promise.all([
      supabase.from("exams").select("*, subjects(id, nama)").order("id", { ascending: false }),
      supabase.from("classes").select("*").order("nama"),
      supabase
        .from("profiles")
        .select("*, classes(id, nama)")
        .eq("role", "siswa")
        .eq("aktif", true)
        .order("nama"),
      supabase
        .from("exam_schedules")
        .select("*, exams(*, subjects(id, nama)), classes(*)")
        .order("mulai", { ascending: false }),
      supabase
        .from("exam_overrides")
        .select("*, exams(id, judul), profiles(id, nama, username)")
        .order("id", { ascending: false }),
      supabase.from("settings").select("kunci, nilai"),
    ]);

    setExams((ex || []) as Exam[]);
    setClasses((cl || []) as SchoolClass[]);
    setStudents((st || []) as Profile[]);
    setSchedules((sch || []) as ExamSchedule[]);
    setOverrides((ov || []) as ExamOverride[]);

    const map: Record<string, string> = {};
    (setRows || []).forEach((r) => (map[r.kunci] = r.nilai));
    setSettings({
      nama_sekolah: map.nama_sekolah || "SMK Negeri 3 Kotamobagu",
      logo: map.logo || "",
      alamat_sekolah: map.alamat_sekolah || "",
    });
  }, [supabase]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  async function addSchedule(e: React.FormEvent) {
    e.preventDefault();
    if (!examId || !kelasId) return;

    let mulaiIso = "";
    let selesaiIso = "";
    let sesiFinal = sesi.trim() || "Jam II";
    let autoDuration: number | null = null;

    if (slotKey !== "manual") {
      if (!examDate) return;
      const slot = getSlotsForDate(examDate).find((s) => s.key === slotKey);
      if (!slot) return;
      mulaiIso = combineDateAndTimeToIso(examDate, slot.startTime);
      selesaiIso = combineDateAndTimeToIso(examDate, slot.endTime);
      sesiFinal = slot.sesiLabel;
      autoDuration = slot.durationMinutes;
    } else {
      if (!mulai || !selesai) return;
      mulaiIso = new Date(mulai).toISOString();
      selesaiIso = new Date(selesai).toISOString();
    }

    const { error } = await supabase.from("exam_schedules").insert({
      exam_id: Number(examId),
      kelas_id: Number(kelasId),
      sesi: sesiFinal,
      mulai: mulaiIso,
      selesai: selesaiIso,
    });
    if (error) {
      alert(error.message);
      return;
    }

    if (autoDuration) {
      await supabase
        .from("exams")
        .update({ durasi: autoDuration })
        .eq("id", Number(examId));
    }

    setMulai("");
    setSelesai("");
    loadAll();
  }

  async function deleteSchedule(id: number) {
    if (!confirm("Hapus jadwal ini?")) return;
    await supabase.from("exam_schedules").delete().eq("id", id);
    loadAll();
  }

  async function regenerateToken(targetExamId: number) {
    const newToken = generateExamToken();
    const { error } = await supabase
      .from("exams")
      .update({ token: newToken })
      .eq("id", targetExamId);
    if (error) alert(error.message);
    else loadAll();
  }

  async function addOverride(e: React.FormEvent) {
    e.preventDefault();
    if (!ovExamId || !ovStudentId) return;
    const { error } = await supabase.from("exam_overrides").upsert(
      {
        exam_id: Number(ovExamId),
        student_id: ovStudentId,
        durasi: ovDurasi ? Number(ovDurasi) : null,
        mulai: ovMulai ? new Date(ovMulai).toISOString() : null,
        selesai: ovSelesai ? new Date(ovSelesai).toISOString() : null,
      },
      { onConflict: "exam_id,student_id" }
    );
    if (error) alert(error.message);
    else {
      setOvDurasi("");
      setOvMulai("");
      setOvSelesai("");
      loadAll();
    }
  }

  async function deleteOverride(id: number) {
    await supabase.from("exam_overrides").delete().eq("id", id);
    loadAll();
  }

  // Cetak Berita Acara Pelaksanaan Ujian
  if (beritaAcaraSchedule) {
    const peserta = students.filter(
      (s) => s.kelas_id === beritaAcaraSchedule.kelas_id
    );
    return (
      <BeritaAcaraPrintView
        schedule={beritaAcaraSchedule}
        peserta={peserta}
        settings={settings}
        onBack={() => setBeritaAcaraSchedule(null)}
      />
    );
  }

  // Cetak Daftar Hadir
  if (attendanceSchedule) {
    const peserta = students.filter(
      (s) => s.kelas_id === attendanceSchedule.kelas_id
    );
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between no-print bg-white p-4 rounded-xl border border-slate-200">
          <div className="font-semibold text-slate-900">
            Pratinjau Daftar Hadir — {attendanceSchedule.exams?.judul} (
            {attendanceSchedule.classes?.nama})
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium cursor-pointer"
            >
              <Printer className="w-4 h-4" /> Cetak Daftar Hadir
            </button>
            <button
              onClick={() => setAttendanceSchedule(null)}
              className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium cursor-pointer"
            >
              Kembali
            </button>
          </div>
        </div>

        <div className="bg-white p-8 rounded-xl border border-slate-200">
          <div className="flex items-center gap-4 border-b-2 border-slate-900 pb-4 mb-5">
            {settings.logo && (
              <img src={settings.logo} alt="Logo" className="w-16 h-16 object-contain" />
            )}
            <div className="flex-1 text-center">
              <div className="text-lg font-bold uppercase">
                DAFTAR HADIR PESERTA UJIAN CBT
              </div>
              <div className="font-semibold text-base">
                {settings.nama_sekolah}
              </div>
              {settings.alamat_sekolah && (
                <div className="text-xs text-slate-600">
                  {settings.alamat_sekolah}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-sm mb-5">
            <div>
              <strong>Ujian:</strong> {attendanceSchedule.exams?.judul}
            </div>
            <div>
              <strong>Kelas / Sesi:</strong> {attendanceSchedule.classes?.nama} /{" "}
              {attendanceSchedule.sesi}
            </div>
            <div>
              <strong>Mata Pelajaran:</strong>{" "}
              {attendanceSchedule.exams?.subjects?.nama || "-"}
            </div>
            <div>
              <strong>Jadwal:</strong> {formatDateTime(attendanceSchedule.mulai)}
            </div>
          </div>

          <table className="w-full text-sm border-collapse border border-slate-800">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-800 px-3 py-2 w-12">No</th>
                <th className="border border-slate-800 px-3 py-2 text-left w-32">
                  NIS
                </th>
                <th className="border border-slate-800 px-3 py-2 text-left">
                  Nama Peserta
                </th>
                <th className="border border-slate-800 px-3 py-2 w-40">
                  Tanda Tangan
                </th>
                <th className="border border-slate-800 px-3 py-2 w-32">Ket</th>
              </tr>
            </thead>
            <tbody>
              {peserta.map((p, idx) => (
                <tr key={p.id}>
                  <td className="border border-slate-800 px-3 py-2.5 text-center">
                    {idx + 1}
                  </td>
                  <td className="border border-slate-800 px-3 py-2.5 font-mono text-xs">
                    {p.username}
                  </td>
                  <td className="border border-slate-800 px-3 py-2.5">
                    {p.nama}
                  </td>
                  <td className="border border-slate-800 px-3 py-2.5 text-xs text-slate-400">
                    {idx + 1}.
                  </td>
                  <td className="border border-slate-800 px-3 py-2.5"></td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-10 flex justify-end">
            <div className="w-60 text-sm text-center">
              <div>Pengawas Ujian,</div>
              <div className="h-16" />
              <div className="border-t border-slate-800 pt-1">
                (.......................................)
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Jadwal Ujian, Token & Pengecualian
        </h1>
        <p className="text-sm text-slate-500">
          Atur jadwal per kelas & sesi, kelola token 6 karakter, cetak daftar hadir, serta atur durasi ekstra atau susulan per siswa.
        </p>
      </div>

      {/* Token Ujian */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
        <h2 className="font-semibold text-slate-900">
          Token Ujian Aktif (6 Karakter)
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {exams.map((ex) => (
            <div
              key={ex.id}
              className="p-3.5 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-between gap-2"
            >
              <div className="min-w-0">
                <div className="font-medium text-sm text-slate-900 truncate">
                  {ex.judul}
                </div>
                <div className="text-xs text-slate-500">
                  {ex.subjects?.nama} • {ex.durasi} mnt
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-mono font-bold text-base px-2.5 py-1 rounded bg-blue-100 text-blue-800 tracking-widest">
                  {ex.token}
                </span>
                <button
                  onClick={() => regenerateToken(ex.id)}
                  title="Ganti Token Baru"
                  className="p-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-600 cursor-pointer"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
          {exams.length === 0 && (
            <div className="text-sm text-slate-400">
              Belum ada paket ujian. Minta Guru membuat ujian terlebih dahulu.
            </div>
          )}
        </div>
      </div>

      {/* Form Tambah Jadwal */}
      <form
        onSubmit={addSchedule}
        className="bg-white rounded-xl border border-slate-200 p-5 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-slate-900">Tambah Jadwal Ujian</h2>
          {slotKey !== "manual" && examDate && (
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium">
              Hari {getDayNameId(examDate)}
              {isFridayDate(examDate) ? " (Jadwal Khusus Jumat)" : ""} — Durasi ujian otomatis diselaraskan
            </span>
          )}
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <select
            required
            value={examId}
            onChange={(e) => setExamId(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-300 text-sm"
          >
            <option value="">-- Pilih Ujian --</option>
            {exams.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {ex.judul}
              </option>
            ))}
          </select>
          <select
            required
            value={kelasId}
            onChange={(e) => setKelasId(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-300 text-sm"
          >
            <option value="">-- Pilih Kelas --</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nama}
              </option>
            ))}
          </select>
          <input
            type="date"
            required={slotKey !== "manual"}
            value={examDate}
            onChange={(e) => setExamDate(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-300 text-sm"
            title="Tanggal Ujian"
          />
          <select
            value={slotKey}
            onChange={(e) => {
              const v = e.target.value as ExamSlotKey;
              setSlotKey(v);
              if (v === "jam_2") setSesi("Jam II");
              else if (v === "jam_3") setSesi("Jam III");
            }}
            className="px-3 py-2 rounded-lg border border-slate-300 text-sm"
          >
            {getSlotsForDate(examDate).map((sl) => (
              <option key={sl.key} value={sl.key}>
                {sl.label}
              </option>
            ))}
            <option value="manual">Manual (Pilih Jam Sendiri)</option>
          </select>
        </div>

        {slotKey === "manual" && (
          <div className="grid sm:grid-cols-3 gap-3">
            <input
              type="text"
              value={sesi}
              onChange={(e) => setSesi(e.target.value)}
              placeholder="Sesi (misal: Sesi 1)"
              className="px-3 py-2 rounded-lg border border-slate-300 text-sm"
            />
            <input
              type="datetime-local"
              required
              value={mulai}
              onChange={(e) => setMulai(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-300 text-sm"
              title="Waktu Mulai"
            />
            <input
              type="datetime-local"
              required
              value={selesai}
              onChange={(e) => setSelesai(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-300 text-sm"
              title="Waktu Selesai"
            />
          </div>
        )}
        <button
          type="submit"
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium cursor-pointer"
        >
          <Plus className="w-4 h-4" /> Simpan Jadwal
        </button>
      </form>

      {/* Tabel Jadwal */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="text-left px-4 py-3">Ujian</th>
              <th className="text-left px-4 py-3">Kelas & Sesi</th>
              <th className="text-left px-4 py-3">Mulai</th>
              <th className="text-left px-4 py-3">Selesai</th>
              <th className="text-right px-4 py-3">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {schedules.map((s) => (
              <tr key={s.id}>
                <td className="px-4 py-2.5 font-medium text-slate-900">
                  {s.exams?.judul || "-"}
                  <div className="text-xs text-slate-500">
                    Token: <span className="font-mono font-bold">{s.exams?.token}</span>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-slate-700">
                  {s.classes?.nama} • <span className="text-xs text-slate-500">{s.sesi}</span>
                </td>
                <td className="px-4 py-2.5 text-xs text-slate-600">
                  {formatDateTime(s.mulai)}
                </td>
                <td className="px-4 py-2.5 text-xs text-slate-600">
                  {formatDateTime(s.selesai)}
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      onClick={() => setAttendanceSchedule(s)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-medium text-slate-700 cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" /> Daftar Hadir
                    </button>
                    <button
                      onClick={() => setBeritaAcaraSchedule(s)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-xs font-medium text-blue-700 cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5" /> Berita Acara
                    </button>
                    <button
                      onClick={() => deleteSchedule(s.id)}
                      className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {schedules.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  Belum ada jadwal ujian.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pengecualian Per Siswa (Override Susulan / Waktu Ekstra) */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <UserCheck className="w-5 h-5 text-blue-600" />
          <div>
            <h2 className="font-semibold text-slate-900">
              Pengecualian Per Siswa (Durasi Ekstra / Ujian Susulan)
            </h2>
            <p className="text-xs text-slate-500">
              Tambahkan durasi khusus atau buka jendela jadwal susulan untuk 1 siswa tertentu.
            </p>
          </div>
        </div>

        <form onSubmit={addOverride} className="grid sm:grid-cols-2 lg:grid-cols-6 gap-2.5">
          <select
            required
            value={ovExamId}
            onChange={(e) => setOvExamId(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-300 text-sm"
          >
            <option value="">-- Ujian --</option>
            {exams.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {ex.judul}
              </option>
            ))}
          </select>
          <select
            required
            value={ovStudentId}
            onChange={(e) => setOvStudentId(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-300 text-sm"
          >
            <option value="">-- Siswa --</option>
            {students.map((st) => (
              <option key={st.id} value={st.id}>
                {st.nama} ({st.username})
              </option>
            ))}
          </select>
          <input
            type="number"
            min={5}
            value={ovDurasi}
            onChange={(e) => setOvDurasi(e.target.value)}
            placeholder="Durasi (mnt, opsional)"
            className="px-3 py-2 rounded-lg border border-slate-300 text-sm"
          />
          <input
            type="datetime-local"
            value={ovMulai}
            onChange={(e) => setOvMulai(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-300 text-sm"
            title="Mulai Susulan"
          />
          <input
            type="datetime-local"
            value={ovSelesai}
            onChange={(e) => setOvSelesai(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-300 text-sm"
            title="Selesai Susulan"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium cursor-pointer"
          >
            Simpan
          </button>
        </form>

        {overrides.length > 0 && (
          <div className="divide-y divide-slate-100 border border-slate-100 rounded-lg text-sm">
            {overrides.map((ov) => (
              <div
                key={ov.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5"
              >
                <div>
                  <span className="font-medium text-slate-900">
                    {ov.profiles?.nama} ({ov.profiles?.username})
                  </span>{" "}
                  — <span className="text-slate-600">{ov.exams?.judul}</span>
                  <div className="text-xs text-slate-500">
                    Durasi khusus: {ov.durasi ? `${ov.durasi} mnt` : "Default"} | Jadwal:{" "}
                    {ov.mulai ? `${formatDateTime(ov.mulai)} s.d. ${formatDateTime(ov.selesai)}` : "Ikut kelas"}
                  </div>
                </div>
                <button
                  onClick={() => deleteOverride(ov.id)}
                  className="text-red-600 hover:bg-red-50 p-1.5 rounded-lg cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
