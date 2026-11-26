"use client";

import { useCallback, useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/client";
import type { Profile, SchoolClass, SchoolSettings, UserRole } from "@/types/cbt";
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
} from "lucide-react";

export default function AdminPenggunaPage() {
  const supabase = createClient();
  const [roleFilter, setRoleFilter] = useState<UserRole>("siswa");
  const [kelasFilter, setKelasFilter] = useState<string>("");
  const [users, setUsers] = useState<Profile[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [settings, setSettings] = useState<SchoolSettings>({
    nama_sekolah: "SMK Negeri 3 Kotamobagu",
    logo: "",
    alamat_sekolah: "",
  });

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

  const loadData = useCallback(async () => {
    const [{ data: u }, { data: c }, { data: st }] = await Promise.all([
      supabase
        .from("profiles")
        .select("*, classes(id, nama)")
        .eq("role", roleFilter)
        .order("nama"),
      supabase.from("classes").select("*").order("nama"),
      supabase.from("settings").select("kunci, nilai"),
    ]);
    setUsers((u || []) as Profile[]);
    setClasses((c || []) as SchoolClass[]);
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
      return String(u.kelas_id || "") === kelasFilter;
    }
    return true;
  });

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
        <button
          onClick={() => setPrintMode(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-medium cursor-pointer"
        >
          <Printer className="w-4 h-4" /> Cetak Kartu Login
        </button>
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

        {roleFilter === "siswa" && (
          <select
            value={kelasFilter}
            onChange={(e) => setKelasFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm"
          >
            <option value="">Semua Kelas</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nama}
              </option>
            ))}
          </select>
        )}
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

      {/* Tabel Pengguna */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="text-left px-4 py-3">
                {roleFilter === "siswa" ? "NIS" : "Username"}
              </th>
              <th className="text-left px-4 py-3">Nama</th>
              {roleFilter === "siswa" && (
                <th className="text-left px-4 py-3">Kelas</th>
              )}
              <th className="text-left px-4 py-3">Sandi Awal</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-right px-4 py-3">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredUsers.map((u) => (
              <tr key={u.id} className={!u.aktif ? "opacity-50" : ""}>
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
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  Belum ada data {roleFilter}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
