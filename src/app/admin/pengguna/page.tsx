"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/client";
import type {
  Profile,
  SchoolClass,
  SchoolSettings,
  Subject,
  UserRole,
} from "@/types/cbt";
import {
  Plus,
  Upload,
  Download,
  Printer,
  KeyRound,
  RotateCcw,
  Ban,
  CheckCircle,
  Trash2,
  RefreshCw,
  BookOpen,
  ArrowUpCircle,
  FileText,
  Users,
  Search,
  Edit3,
} from "lucide-react";

export default function AdminPenggunaPage() {
  const supabase = createClient();
  const [roleFilter, setRoleFilter] = useState<UserRole>("siswa");
  const [kelasFilter, setKelasFilter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [bulkTargetClassId, setBulkTargetClassId] = useState<string>("");
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [users, setUsers] = useState<Profile[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [teacherSubjects, setTeacherSubjects] = useState<Record<string, number[]>>({});
  const [settings, setSettings] = useState<SchoolSettings>({
    nama_sekolah: "SMK Negeri 3 Kotamobagu",
    logo: "",
    alamat_sekolah: "",
  });

  // Modal Edit Pengguna (CRUD Update)
  const [editUser, setEditUser] = useState<Profile | null>(null);
  const [editUsername, setEditUsername] = useState("");
  const [editNama, setEditNama] = useState("");
  const [editKelasId, setEditKelasId] = useState("");
  const [editAktif, setEditAktif] = useState(true);
  const [editBlocked, setEditBlocked] = useState(false);
  const [editNewPassword, setEditNewPassword] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // Modal Pasangan Mapel Guru
  const [mapelModalUser, setMapelModalUser] = useState<Profile | null>(null);
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<number[]>([]);
  const [savingSubjects, setSavingSubjects] = useState(false);

  // Form tambah satuan
  const [username, setUsername] = useState("");
  const [nama, setNama] = useState("");
  const [kelasId, setKelasId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Import Excel
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string>("");

  // Mode cetak kartu login
  const [printMode, setPrintMode] = useState(false);

  // Sinkronisasi dari SMK3 Absensi
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [syncAuthMode, setSyncAuthMode] = useState<"login" | "secret">("login");
  const [absensiEmail, setAbsensiEmail] = useState("");
  const [absensiPassword, setAbsensiPassword] = useState("");
  const [absensiSecretKey, setAbsensiSecretKey] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");

  const loadData = useCallback(async () => {
    const [{ data: u }, { data: c }, { data: sub }, { data: ts }, { data: st }] =
      await Promise.all([
        supabase
          .from("profiles")
          .select("*, classes(id, nama)")
          .eq("role", roleFilter)
          .order("nama"),
        supabase.from("classes").select("*").order("nama"),
        supabase.from("subjects").select("*").order("nama"),
        supabase.from("teacher_subjects").select("guru_id, subject_id"),
        supabase.from("settings").select("kunci, nilai"),
      ]);
    setUsers((u || []) as Profile[]);
    setClasses((c || []) as SchoolClass[]);
    setSubjects((sub || []) as Subject[]);

    const tsMap: Record<string, number[]> = {};
    (ts || []).forEach((row) => {
      if (!tsMap[row.guru_id]) tsMap[row.guru_id] = [];
      tsMap[row.guru_id].push(row.subject_id);
    });
    setTeacherSubjects(tsMap);

    const map: Record<string, string> = {};
    (st || []).forEach((r) => (map[r.kunci] = r.nilai));
    setSettings({
      nama_sekolah: map.nama_sekolah || "SMK Negeri 3 Kotamobagu",
      logo: map.logo || "",
      alamat_sekolah: map.alamat_sekolah || "",
    });
  }, [supabase, roleFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredUsers = users.filter((u) => {
    if (roleFilter === "siswa" && kelasFilter) {
      if (kelasFilter === "__none__") {
        if (u.kelas_id !== null) return false;
      } else if (String(u.kelas_id || "") !== kelasFilter) {
        return false;
      }
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      if (
        !u.nama.toLowerCase().includes(q) &&
        !u.username.toLowerCase().includes(q)
      ) {
        return false;
      }
    }
    return true;
  });

  function toggleStudentSelect(id: string) {
    setSelectedStudentIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function toggleSelectAllStudents() {
    const visibleIds = filteredUsers.map((u) => u.id);
    const allChecked =
      visibleIds.length > 0 &&
      visibleIds.every((id) => selectedStudentIds.includes(id));
    if (allChecked) {
      setSelectedStudentIds((prev) =>
        prev.filter((id) => !visibleIds.includes(id))
      );
    } else {
      setSelectedStudentIds((prev) =>
        Array.from(new Set([...prev, ...visibleIds]))
      );
    }
  }

  async function handleBulkAssignClass() {
    if (selectedStudentIds.length === 0) {
      alert("Centang minimal 1 siswa terlebih dahulu.");
      return;
    }
    if (!bulkTargetClassId) {
      alert("Pilih kelas / jurusan tujuan terlebih dahulu.");
      return;
    }
    const targetName =
      classes.find((c) => String(c.id) === bulkTargetClassId)?.nama || "";
    if (
      !confirm(
        `Pasangkan ${selectedStudentIds.length} siswa terpilih ke kelas/jurusan "${targetName}"?`
      )
    ) {
      return;
    }
    setBulkProcessing(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "bulk_assign_class",
          student_ids: selectedStudentIds,
          kelas_id: Number(bulkTargetClassId),
        }),
      });
      const data = await res.json();
      if (!res.ok) alert(data.error || "Gagal memasangkan kelas/jurusan.");
      else {
        alert(
          `Berhasil memasangkan ${data.updatedCount} siswa ke "${targetName}".`
        );
        setSelectedStudentIds([]);
        loadData();
      }
    } finally {
      setBulkProcessing(false);
    }
  }

  function openEditModal(u: Profile) {
    setEditUser(u);
    setEditUsername(u.username);
    setEditNama(u.nama);
    setEditKelasId(u.kelas_id ? String(u.kelas_id) : "");
    setEditAktif(u.aktif);
    setEditBlocked(u.is_blocked);
    setEditNewPassword("");
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editUser) return;
    setSavingEdit(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editUser.id,
          action: "update",
          username: editUsername.trim(),
          nama: editNama.trim(),
          kelas_id:
            editUser.role === "siswa" && editKelasId
              ? Number(editKelasId)
              : null,
          aktif: editAktif,
          is_blocked: editBlocked,
          new_password: editNewPassword.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Gagal menyimpan perubahan.");
      } else {
        setEditUser(null);
        loadData();
      }
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleBulkDeleteStudents() {
    if (selectedStudentIds.length === 0) return;
    if (
      !confirm(
        `HAPUS PERMANEN ${selectedStudentIds.length} siswa terpilih beserta seluruh riwayat ujiannya? Tindakan ini tidak dapat dibatalkan.`
      )
    ) {
      return;
    }
    setBulkProcessing(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedStudentIds }),
      });
      const data = await res.json();
      if (!res.ok) alert(data.error || "Gagal menghapus siswa.");
      else {
        alert(`Berhasil menghapus ${data.deletedCount} akun siswa.`);
        setSelectedStudentIds([]);
        loadData();
      }
    } finally {
      setBulkProcessing(false);
    }
  }

  async function handleBulkPromoteSmart() {
    if (selectedStudentIds.length === 0) {
      alert("Centang siswa yang ingin dinaikkan kelasnya terlebih dahulu.");
      return;
    }
    if (
      !confirm(
        `Proses naik kelas otomatis untuk ${selectedStudentIds.length} siswa terpilih?\n\n• Kelas X → XI (jurusan sama)\n• Kelas XI → XII (jurusan sama)\n• Kelas XII → Lulus (akun dinonaktifkan, arsip nilai & raport tetap tersimpan)`
      )
    ) {
      return;
    }
    setBulkProcessing(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "bulk_promote_smart",
          student_ids: selectedStudentIds,
        }),
      });
      const data = await res.json();
      if (!res.ok) alert(data.error || "Gagal memproses naik kelas.");
      else {
        alert(
          `Selesai! ${data.promotedCount} siswa naik kelas, ${data.graduatedCount} siswa diluluskan/diarsipkan` +
            (data.unmatchedCount > 0
              ? `, ${data.unmatchedCount} belum punya kelas tujuan yang cocok.`
              : ".")
        );
        setSelectedStudentIds([]);
        loadData();
      }
    } finally {
      setBulkProcessing(false);
    }
  }

  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          nama,
          role: roleFilter,
          kelas_id: roleFilter === "siswa" && kelasId ? Number(kelasId) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.errorCount > 0) {
        alert(data.errors?.[0]?.reason || data.error || "Gagal menambah user.");
      } else {
        const pwd = data.created?.[0]?.password;
        alert(`Berhasil dibuat! Kata sandi awal: ${pwd}`);
        setUsername("");
        setNama("");
        loadData();
      }
    } finally {
      setSubmitting(false);
    }
  }

  function downloadTemplate() {
    const sample =
      roleFilter === "siswa"
        ? [
            { NIS: "2026001", Nama: "Budi Santoso", Kelas: classes[0]?.nama || "X ATPH 1" },
            { NIS: "2026002", Nama: "Siti Aminah", Kelas: classes[0]?.nama || "X ATPH 1" },
          ]
        : [
            { Username: "guru01", Nama: "Drs. Ahmad Yani" },
            { Username: "guru02", Nama: "Rina Kartika, S.Pd" },
          ];
    const ws = XLSX.utils.json_to_sheet(sample);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, roleFilter === "siswa" ? "Siswa" : "Guru");
    XLSX.writeFile(wb, `template-impor-${roleFilter}.xlsx`);
  }

  async function handleExcelImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult("");
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

      const classByName = new Map(
        classes.map((c) => [c.nama.trim().toLowerCase(), c.id])
      );

      const payload = rows.map((r) => {
        const rawUser =
          r.NIS ?? r.nis ?? r.Username ?? r.username ?? r.NIP ?? r.nip ?? "";
        const rawNama = r.Nama ?? r.nama ?? r.Name ?? "";
        const rawKelas = String(r.Kelas ?? r.kelas ?? "").trim().toLowerCase();
        return {
          username: String(rawUser).trim(),
          nama: String(rawNama).trim(),
          role: roleFilter,
          kelas_id:
            roleFilter === "siswa" ? classByName.get(rawKelas) || null : null,
        };
      });

      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ users: payload }),
      });
      const data = await res.json();
      if (!res.ok) {
        setImportResult(`Gagal impor: ${data.error || "kesalahan server"}`);
      } else {
        setImportResult(
          `Impor selesai: ${data.createdCount} berhasil dibuat, ${data.errorCount} dilewati/gagal.`
        );
        loadData();
      }
    } catch {
      setImportResult("Gagal membaca file Excel. Pastikan format sesuai template.");
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  }

  async function userAction(
    id: string,
    action: "reset_password" | "reset_login" | "toggle_block",
    extra?: Record<string, unknown>
  ) {
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action, ...extra }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Gagal.");
      return;
    }
    if (action === "reset_password") {
      alert(`Kata sandi direset menjadi: ${data.newPassword}`);
    }
    loadData();
  }

  async function deleteUser(id: string, userNama: string) {
    if (!confirm(`Hapus akun "${userNama}"?`)) return;
    const res = await fetch(`/api/admin/users?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const d = await res.json();
      alert(d.error || "Gagal menghapus.");
    } else {
      loadData();
    }
  }

  function openMapelModal(guru: Profile) {
    setMapelModalUser(guru);
    setSelectedSubjectIds(teacherSubjects[guru.id] || []);
  }

  function toggleSubjectSelection(subjectId: number) {
    setSelectedSubjectIds((prev) =>
      prev.includes(subjectId)
        ? prev.filter((id) => id !== subjectId)
        : [...prev, subjectId]
    );
  }

  async function saveTeacherSubjects() {
    if (!mapelModalUser) return;
    setSavingSubjects(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: mapelModalUser.id,
          action: "set_subjects",
          subject_ids: selectedSubjectIds,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(
          data.error ||
            "Gagal menyimpan pasangan mapel. Pastikan patch_teacher_subjects.sql sudah dijalankan di Supabase."
        );
      } else {
        setMapelModalUser(null);
        loadData();
      }
    } finally {
      setSavingSubjects(false);
    }
  }

  async function handleSyncAbsensi(e: React.FormEvent) {
    e.preventDefault();
    setSyncing(true);
    setSyncMessage("");
    try {
      const payload =
        syncAuthMode === "secret"
          ? { secretKey: absensiSecretKey }
          : { adminEmail: absensiEmail, adminPassword: absensiPassword };
      const res = await fetch("/api/admin/sync-absensi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setSyncMessage(`Gagal: ${data.error || "Kesalahan sinkronisasi."}`);
      } else {
        setSyncMessage(
          `Sinkronisasi selesai! Kelas baru: ${data.classesAdded} (total ${data.totalClassesFound}), Guru baru: ${data.teachersCreated} (lewati: ${data.teachersSkipped}), Siswa baru: ${data.studentsCreated} (lewati: ${data.studentsSkipped}).`
        );
        loadData();
      }
    } catch {
      setSyncMessage("Gagal menghubungi server.");
    } finally {
      setSyncing(false);
    }
  }

  // Tampilan Cetak Kartu Login
  if (printMode) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between no-print bg-white p-4 rounded-xl border border-slate-200">
          <div>
            <h2 className="font-bold text-slate-900">Pratinjau Kartu Login</h2>
            <p className="text-xs text-slate-500">
              Menampilkan {filteredUsers.length} akun {roleFilter}. Klik Cetak untuk mencetak atau simpan PDF.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium cursor-pointer"
            >
              <Printer className="w-4 h-4" /> Cetak Sekarang
            </button>
            <button
              onClick={() => setPrintMode(false)}
              className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium cursor-pointer"
            >
              Kembali
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {filteredUsers.map((u) => (
            <div
              key={u.id}
              className="bg-white border-2 border-slate-800 rounded-lg p-4 print-break-inside-avoid"
            >
              <div className="flex items-center gap-3 border-b border-slate-300 pb-2 mb-3">
                {settings.logo && (
                  <img
                    src={settings.logo}
                    alt="Logo"
                    className="w-10 h-10 object-contain"
                  />
                )}
                <div>
                  <div className="font-bold text-sm uppercase">
                    KARTU LOGIN CBT
                  </div>
                  <div className="text-xs text-slate-600">
                    {settings.nama_sekolah}
                  </div>
                </div>
              </div>
              <table className="w-full text-xs">
                <tbody>
                  <tr>
                    <td className="py-0.5 text-slate-500 w-28">Nama</td>
                    <td className="py-0.5 font-semibold">: {u.nama}</td>
                  </tr>
                  {u.role === "siswa" && (
                    <tr>
                      <td className="py-0.5 text-slate-500">Kelas</td>
                      <td className="py-0.5">: {u.classes?.nama || "-"}</td>
                    </tr>
                  )}
                  <tr>
                    <td className="py-0.5 text-slate-500">
                      {u.role === "siswa" ? "NIS / Login" : "Username"}
                    </td>
                    <td className="py-0.5 font-mono font-bold">: {u.username}</td>
                  </tr>
                  <tr>
                    <td className="py-0.5 text-slate-500">Sandi Awal</td>
                    <td className="py-0.5 font-mono font-bold">
                      : {u.kata_sandi_awal || "(Sudah diganti pengguna)"}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Kelola Siswa & Guru
          </h1>
          <p className="text-sm text-slate-500">
            Tambah manual atau impor dari Excel, kata sandi awal dibuat otomatis dan kartu login dapat dicetak.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => {
              setSyncMessage("");
              setShowSyncModal(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" /> Tarik Data dari SMK3 Absensi
          </button>
          <button
            onClick={() => setPrintMode(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-medium cursor-pointer"
          >
            <Printer className="w-4 h-4" /> Cetak Kartu Login
          </button>
        </div>
      </div>

      {/* Tabs Role & Filter Kelas */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {(["siswa", "guru", "admin"] as UserRole[]).map((r) => (
            <button
              key={r}
              onClick={() => {
                setRoleFilter(r);
                setKelasFilter("");
                setSelectedStudentIds([]);
              }}
              className={`px-4 py-2 rounded-lg text-sm font-medium capitalize cursor-pointer ${
                roleFilter === r
                  ? "bg-blue-600 text-white"
                  : "bg-white text-slate-600 border border-slate-200"
              }`}
            >
              {r}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama / NIS..."
              className="pl-9 pr-3 py-2 rounded-lg border border-slate-300 bg-white text-sm w-48"
            />
          </div>
          {roleFilter === "siswa" && (
            <select
              value={kelasFilter}
              onChange={(e) => {
                setKelasFilter(e.target.value);
                setSelectedStudentIds([]);
              }}
              className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm"
            >
              <option value="">Semua Kelas / Jurusan</option>
              <option value="__none__">Belum Punya Kelas / Jurusan</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nama}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Form Tambah Satuan + Impor Excel */}
      <div className="grid lg:grid-cols-2 gap-4">
        <form
          onSubmit={handleAddUser}
          className="bg-white rounded-xl border border-slate-200 p-4 space-y-3"
        >
          <div className="font-semibold text-sm text-slate-800">
            Tambah {roleFilter} Baru
          </div>
          <div className="grid sm:grid-cols-2 gap-2.5">
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={roleFilter === "siswa" ? "NIS" : "Username / NIP"}
              className="px-3 py-2 rounded-lg border border-slate-300 text-sm"
            />
            <input
              type="text"
              required
              value={nama}
              onChange={(e) => setNama(e.target.value)}
              placeholder="Nama Lengkap"
              className="px-3 py-2 rounded-lg border border-slate-300 text-sm"
            />
          </div>
          <div className="flex gap-2.5">
            {roleFilter === "siswa" && (
              <select
                value={kelasId}
                onChange={(e) => setKelasId(e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-sm"
              >
                <option value="">-- Pilih Kelas --</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nama}
                  </option>
                ))}
              </select>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium cursor-pointer"
            >
              <Plus className="w-4 h-4" /> {submitting ? "Menyimpan..." : "Tambah"}
            </button>
          </div>
        </form>

        {roleFilter !== "admin" && (
          <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
            <div className="font-semibold text-sm text-slate-800">
              Impor Massal {roleFilter} dari Excel
            </div>
            <p className="text-xs text-slate-500">
              Kolom wajib: {roleFilter === "siswa" ? "NIS, Nama, Kelas (harus sesuai nama kelas di Master)" : "Username, Nama"}. Kata sandi awal dibuat otomatis.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={downloadTemplate}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium cursor-pointer"
              >
                <Download className="w-4 h-4" /> Unduh Template
              </button>
              <label className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium cursor-pointer">
                <Upload className="w-4 h-4" />
                <span>{importing ? "Mengimpor..." : "Pilih File Excel (.xlsx)"}</span>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={handleExcelImport}
                  disabled={importing}
                />
              </label>
            </div>
            {importResult && (
              <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 p-2 rounded-lg">
                {importResult}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Panel Aksi Massal Siswa: Pasangkan ke Jurusan/Kelas & Naik Kelas Otomatis */}
      {roleFilter === "siswa" && (
        <div className="bg-indigo-50/70 border border-indigo-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-indigo-950">
            <Users className="w-4 h-4 text-indigo-600 shrink-0" />
            <span>
              <strong>{selectedStudentIds.length}</strong> siswa dipilih{" "}
              <span className="text-xs text-indigo-700">
                (centang kotak di tabel bawah untuk pasangkan ke jurusan atau naik kelas massal)
              </span>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={bulkTargetClassId}
              onChange={(e) => setBulkTargetClassId(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-indigo-300 bg-white text-xs sm:text-sm"
            >
              <option value="">-- Pilih Kelas / Jurusan Tujuan --</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nama}
                </option>
              ))}
            </select>

            <button
              type="button"
              disabled={bulkProcessing || selectedStudentIds.length === 0 || !bulkTargetClassId}
              onClick={handleBulkAssignClass}
              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white rounded-lg text-xs sm:text-sm font-semibold cursor-pointer"
            >
              Pasangkan ke Jurusan
            </button>

            <button
              type="button"
              disabled={bulkProcessing || selectedStudentIds.length === 0}
              onClick={handleBulkPromoteSmart}
              title="Otomatis naikkan X→XI, XI→XII pada jurusan sama, dan XII→Lulus"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-300 text-white rounded-lg text-xs sm:text-sm font-semibold cursor-pointer"
            >
              <ArrowUpCircle className="w-4 h-4" />
              Naik Kelas Otomatis
            </button>

            <button
              type="button"
              disabled={bulkProcessing || selectedStudentIds.length === 0}
              onClick={handleBulkDeleteStudents}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 disabled:bg-rose-300 text-white rounded-lg text-xs sm:text-sm font-semibold cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              Hapus Terpilih
            </button>
          </div>
        </div>
      )}

      {/* Tabel Pengguna */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              {roleFilter === "siswa" && (
                <th className="px-3 py-3 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={
                      filteredUsers.length > 0 &&
                      filteredUsers.every((u) =>
                        selectedStudentIds.includes(u.id)
                      )
                    }
                    onChange={toggleSelectAllStudents}
                    title="Pilih Semua Siswa yang Tampil"
                  />
                </th>
              )}
              <th className="text-left px-4 py-3">
                {roleFilter === "siswa" ? "NIS" : "Username"}
              </th>
              <th className="text-left px-4 py-3">Nama</th>
              {roleFilter === "siswa" && (
                <th className="text-left px-4 py-3">Kelas</th>
              )}
              {roleFilter === "guru" && (
                <th className="text-left px-4 py-3">Mapel Diampu</th>
              )}
              <th className="text-left px-4 py-3">Sandi Awal</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-right px-4 py-3">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredUsers.map((u) => (
              <tr
                key={u.id}
                className={`${!u.aktif ? "opacity-50" : ""} ${
                  selectedStudentIds.includes(u.id) ? "bg-indigo-50/40" : ""
                }`}
              >
                {roleFilter === "siswa" && (
                  <td className="px-3 py-2.5 text-center">
                    <input
                      type="checkbox"
                      checked={selectedStudentIds.includes(u.id)}
                      onChange={() => toggleStudentSelect(u.id)}
                    />
                  </td>
                )}
                <td className="px-4 py-2.5 font-mono text-xs font-semibold">
                  {u.username}
                </td>
                <td className="px-4 py-2.5 font-medium text-slate-900">
                  {u.nama}
                </td>
                {roleFilter === "siswa" && (
                  <td className="px-4 py-2.5 text-slate-600">
                    {u.classes?.nama || "-"}
                  </td>
                )}
                {roleFilter === "guru" && (
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap items-center gap-1">
                      {(teacherSubjects[u.id] || []).length > 0 ? (
                        (teacherSubjects[u.id] || []).map((sid) => {
                          const subj = subjects.find((s) => s.id === sid);
                          return (
                            <span
                              key={sid}
                              className="px-2 py-0.5 text-xs rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200"
                            >
                              {subj?.nama || `#${sid}`}
                            </span>
                          );
                        })
                      ) : (
                        <span className="text-xs text-amber-600 italic">
                          Belum diatur
                        </span>
                      )}
                    </div>
                  </td>
                )}
                <td className="px-4 py-2.5 font-mono text-xs text-slate-600">
                  {u.kata_sandi_awal || (
                    <span className="text-slate-400 italic">Sudah diganti</span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {!u.aktif && (
                      <span className="px-2 py-0.5 text-xs rounded-full bg-slate-200 text-slate-600">
                        Lulus/Nonaktif
                      </span>
                    )}
                    {u.is_blocked ? (
                      <span className="px-2 py-0.5 text-xs rounded-full bg-red-100 text-red-700">
                        Diblokir
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 text-xs rounded-full bg-emerald-50 text-emerald-700">
                        Aktif
                      </span>
                    )}
                    {u.active_session_id && (
                      <span className="px-2 py-0.5 text-xs rounded-full bg-blue-50 text-blue-700">
                        Sedang Login
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center justify-end gap-1">
                    {roleFilter === "siswa" && (
                      <Link
                        href={`/admin/raport/${u.id}`}
                        title="Lihat & Cetak Raport Sementara Siswa"
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-xs font-medium"
                      >
                        <FileText className="w-3.5 h-3.5" /> Raport
                      </Link>
                    )}
                    {roleFilter === "guru" && (
                      <button
                        onClick={() => openMapelModal(u)}
                        title="Atur Pasangan Mapel Guru"
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-xs font-medium cursor-pointer"
                      >
                        <BookOpen className="w-3.5 h-3.5" /> Mapel
                      </button>
                    )}
                    <button
                      onClick={() => openEditModal(u)}
                      title="Edit Data Pengguna"
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 text-xs font-medium cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" /> Edit
                    </button>
                    <button
                      onClick={() => userAction(u.id, "reset_login")}
                      title="Reset Login (Izinkan login ulang di perangkat baru)"
                      className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 cursor-pointer"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => userAction(u.id, "reset_password")}
                      title="Reset Kata Sandi"
                      className="p-1.5 rounded-lg text-amber-600 hover:bg-amber-50 cursor-pointer"
                    >
                      <KeyRound className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() =>
                        userAction(u.id, "toggle_block", {
                          is_blocked: !u.is_blocked,
                        })
                      }
                      title={u.is_blocked ? "Buka Blokir" : "Blokir Peserta"}
                      className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 cursor-pointer"
                    >
                      {u.is_blocked ? (
                        <CheckCircle className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <Ban className="w-4 h-4 text-rose-600" />
                      )}
                    </button>
                    <button
                      onClick={() => deleteUser(u.id, u.nama)}
                      title="Hapus Pengguna"
                      className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filteredUsers.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  Belum ada data {roleFilter}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Edit Pengguna (CRUD Update) */}
      {editUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-lg text-slate-900">
                Edit Data{" "}
                {editUser.role === "siswa"
                  ? "Siswa"
                  : editUser.role === "guru"
                  ? "Guru"
                  : "Admin"}
              </h2>
              <button
                onClick={() => setEditUser(null)}
                className="text-sm text-slate-500 hover:text-slate-900 cursor-pointer"
              >
                Tutup
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {editUser.role === "siswa" ? "NIS / Username" : "Username / NIP"}
                </label>
                <input
                  type="text"
                  required
                  value={editUsername}
                  onChange={(e) => setEditUsername(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Nama Lengkap
                </label>
                <input
                  type="text"
                  required
                  value={editNama}
                  onChange={(e) => setEditNama(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </div>

              {editUser.role === "siswa" && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Kelas / Jurusan
                  </label>
                  <select
                    value={editKelasId}
                    onChange={(e) => setEditKelasId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                  >
                    <option value="">-- Belum Punya Kelas --</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nama}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Ganti Kata Sandi Baru{" "}
                  <span className="text-slate-400 font-normal">
                    (Opsional — kosongkan jika tidak diubah)
                  </span>
                </label>
                <input
                  type="text"
                  minLength={6}
                  value={editNewPassword}
                  onChange={(e) => setEditNewPassword(e.target.value)}
                  placeholder="Minimal 6 karakter..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </div>

              <div className="flex flex-wrap gap-5 pt-1 text-sm">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editAktif}
                    onChange={(e) => setEditAktif(e.target.checked)}
                  />
                  <span>Akun Aktif (tidak lulus/nonaktif)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editBlocked}
                    onChange={(e) => setEditBlocked(e.target.checked)}
                  />
                  <span className="text-rose-700">Diblokir</span>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEditUser(null)}
                  className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm font-medium cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-semibold cursor-pointer"
                >
                  {savingEdit ? "Menyimpan..." : "Simpan Perubahan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Atur Pasangan Mapel Guru */}
      {mapelModalUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-bold text-lg text-slate-900">
                  Atur Mapel Diampu
                </h2>
                <p className="text-xs text-slate-500">
                  Guru: <strong>{mapelModalUser.nama}</strong> ({mapelModalUser.username})
                </p>
              </div>
              <button
                onClick={() => setMapelModalUser(null)}
                className="text-sm text-slate-500 hover:text-slate-900 cursor-pointer"
              >
                Tutup
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Centang mata pelajaran yang diampu guru ini. Setelah login, guru hanya dapat melihat bank soal, ujian, koreksi essay, dan nilai untuk mapel yang dipilih.
            </p>

            <div className="max-h-72 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
              {subjects.map((subj) => {
                const checked = selectedSubjectIds.includes(subj.id);
                return (
                  <label
                    key={subj.id}
                    className={`flex items-center gap-3 px-3.5 py-2.5 text-sm cursor-pointer ${
                      checked ? "bg-indigo-50/60" : "hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSubjectSelection(subj.id)}
                    />
                    <span className="font-medium text-slate-800">
                      {subj.nama}
                    </span>
                  </label>
                );
              })}
              {subjects.length === 0 && (
                <div className="p-4 text-center text-xs text-slate-400">
                  Belum ada mata pelajaran. Tambahkan di menu Kelas, Mapel & TA.
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-slate-500">
                {selectedSubjectIds.length} mapel dipilih
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setMapelModalUser(null)}
                  className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm font-medium cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={savingSubjects}
                  onClick={saveTeacherSubjects}
                  className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-semibold cursor-pointer"
                >
                  {savingSubjects ? "Menyimpan..." : "Simpan Mapel"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Sinkronisasi dari SMK3 Absensi */}
      {showSyncModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-lg text-slate-900">
                Tarik Data dari SMK3 Absensi
              </h2>
              <button
                onClick={() => setShowSyncModal(false)}
                className="text-sm text-slate-500 hover:text-slate-900 cursor-pointer"
              >
                Tutup
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Otomatis menyinkronkan <strong>Kelas</strong>, <strong>Guru</strong>, dan{" "}
              <strong>Siswa</strong> (beserta kelasnya) dari database SMK3 Absensi, sekaligus membuatkan sandi awal siap cetak di Kartu Login.
            </p>

            <div className="flex gap-2 text-xs">
              <button
                type="button"
                onClick={() => setSyncAuthMode("login")}
                className={`flex-1 py-2 rounded-lg font-medium cursor-pointer ${
                  syncAuthMode === "login"
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-100 text-slate-700"
                }`}
              >
                Login Admin Absensi
              </button>
              <button
                type="button"
                onClick={() => setSyncAuthMode("secret")}
                className={`flex-1 py-2 rounded-lg font-medium cursor-pointer ${
                  syncAuthMode === "secret"
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-100 text-slate-700"
                }`}
              >
                Secret Key Supabase
              </button>
            </div>

            <form onSubmit={handleSyncAbsensi} className="space-y-3">
              {syncAuthMode === "login" ? (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Email Admin SMK3 Absensi
                    </label>
                    <input
                      type="email"
                      required
                      value={absensiEmail}
                      onChange={(e) => setAbsensiEmail(e.target.value)}
                      placeholder="admin@smkn3..."
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Password Admin SMK3 Absensi
                    </label>
                    <input
                      type="password"
                      required
                      value={absensiPassword}
                      onChange={(e) => setAbsensiPassword(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                    />
                  </div>
                </>
              ) : (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Secret / Service Role Key Supabase Absensi
                  </label>
                  <input
                    type="password"
                    required
                    value={absensiSecretKey}
                    onChange={(e) => setAbsensiSecretKey(e.target.value)}
                    placeholder="sb_secret_... atau eyJhbGci..."
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                </div>
              )}

              {syncMessage && (
                <div
                  className={`p-3 rounded-lg text-xs border ${
                    syncMessage.startsWith("Gagal")
                      ? "bg-red-50 border-red-200 text-red-700"
                      : "bg-emerald-50 border-emerald-200 text-emerald-800"
                  }`}
                >
                  {syncMessage}
                </div>
              )}

              <button
                type="submit"
                disabled={syncing}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-lg text-sm font-semibold cursor-pointer"
              >
                {syncing ? "Menarik Data..." : "Mulai Sinkronisasi Sekarang"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
