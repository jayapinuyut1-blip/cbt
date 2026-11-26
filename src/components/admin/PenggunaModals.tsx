"use client";

import { useState } from "react";
import { Printer } from "lucide-react";
import type {
  Profile,
  SchoolClass,
  SchoolSettings,
  Subject,
  UserRole,
} from "@/types/cbt";

/** Pratinjau & Cetak Kartu Login untuk Siswa / Guru / Admin */
export function LoginCardsPrintView({
  users,
  roleFilter,
  settings,
  onBack,
}: {
  users: Profile[];
  roleFilter: UserRole;
  settings: SchoolSettings;
  onBack: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between no-print bg-white p-4 rounded-xl border border-slate-200">
        <div>
          <h2 className="font-bold text-slate-900">Pratinjau Kartu Login</h2>
          <p className="text-xs text-slate-500">
            Menampilkan {users.length} akun {roleFilter}. Klik Cetak untuk
            mencetak atau simpan PDF.
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
            onClick={onBack}
            className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium cursor-pointer"
          >
            Kembali
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {users.map((u) => (
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

/** Modal Edit Data Pengguna (CRUD Update) */
export function EditUserModal({
  user,
  classes,
  onClose,
  onSaved,
}: {
  user: Profile;
  classes: SchoolClass[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [username, setUsername] = useState(user.username);
  const [nama, setNama] = useState(user.nama);
  const [kelasId, setKelasId] = useState(
    user.kelas_id ? String(user.kelas_id) : ""
  );
  const [aktif, setAktif] = useState(user.aktif);
  const [blocked, setBlocked] = useState(user.is_blocked);
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: user.id,
          action: "update",
          username: username.trim(),
          nama: nama.trim(),
          kelas_id: user.role === "siswa" && kelasId ? Number(kelasId) : null,
          aktif,
          is_blocked: blocked,
          new_password: newPassword.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Gagal menyimpan perubahan.");
      } else {
        onSaved();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-lg text-slate-900">
            Edit Data{" "}
            {user.role === "siswa"
              ? "Siswa"
              : user.role === "guru"
              ? "Guru"
              : "Admin"}
          </h2>
          <button
            onClick={onClose}
            className="text-sm text-slate-500 hover:text-slate-900 cursor-pointer"
          >
            Tutup
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              {user.role === "siswa" ? "NIS / Username" : "Username / NIP"}
            </label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
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
              value={nama}
              onChange={(e) => setNama(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
            />
          </div>

          {user.role === "siswa" && (
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Kelas / Jurusan
              </label>
              <select
                value={kelasId}
                onChange={(e) => setKelasId(e.target.value)}
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
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Minimal 6 karakter..."
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
            />
          </div>

          <div className="flex flex-wrap gap-5 pt-1 text-sm">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={aktif}
                onChange={(e) => setAktif(e.target.checked)}
              />
              <span>Akun Aktif (tidak lulus/nonaktif)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={blocked}
                onChange={(e) => setBlocked(e.target.checked)}
              />
              <span className="text-rose-700">Diblokir</span>
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm font-medium cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-semibold cursor-pointer"
            >
              {saving ? "Menyimpan..." : "Simpan Perubahan"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** Modal Atur Pasangan Mapel Guru */
export function TeacherSubjectsModal({
  guru,
  subjects,
  initialSubjectIds,
  onClose,
  onSaved,
}: {
  guru: Profile;
  subjects: Subject[];
  initialSubjectIds: number[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [selectedIds, setSelectedIds] = useState<number[]>(initialSubjectIds);
  const [saving, setSaving] = useState(false);

  function toggleSubject(subjectId: number) {
    setSelectedIds((prev) =>
      prev.includes(subjectId)
        ? prev.filter((id) => id !== subjectId)
        : [...prev, subjectId]
    );
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: guru.id,
          action: "set_subjects",
          subject_ids: selectedIds,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(
          data.error ||
            "Gagal menyimpan pasangan mapel. Pastikan patch_teacher_subjects.sql sudah dijalankan di Supabase."
        );
      } else {
        onSaved();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-bold text-lg text-slate-900">
              Atur Mapel Diampu
            </h2>
            <p className="text-xs text-slate-500">
              Guru: <strong>{guru.nama}</strong> ({guru.username})
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-sm text-slate-500 hover:text-slate-900 cursor-pointer"
          >
            Tutup
          </button>
        </div>

        <p className="text-xs text-slate-500">
          Centang mata pelajaran yang diampu guru ini. Setelah login, guru hanya
          dapat melihat bank soal, ujian, koreksi essay, dan nilai untuk mapel
          yang dipilih.
        </p>

        <div className="max-h-72 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
          {subjects.map((subj) => {
            const checked = selectedIds.includes(subj.id);
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
                  onChange={() => toggleSubject(subj.id)}
                />
                <span className="font-medium text-slate-800">{subj.nama}</span>
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
            {selectedIds.length} mapel dipilih
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm font-medium cursor-pointer"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={handleSave}
              className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-semibold cursor-pointer"
            >
              {saving ? "Menyimpan..." : "Simpan Mapel"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Modal Sinkronisasi Kelas, Guru, dan Siswa dari SMK3 Absensi */
export function SyncAbsensiModal({
  onClose,
  onSynced,
}: {
  onClose: () => void;
  onSynced: () => void;
}) {
  const [authMode, setAuthMode] = useState<"login" | "secret">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSyncing(true);
    setMessage("");
    try {
      const payload =
        authMode === "secret"
          ? { secretKey }
          : { adminEmail: email, adminPassword: password };
      const res = await fetch("/api/admin/sync-absensi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(`Gagal: ${data.error || "Kesalahan sinkronisasi."}`);
      } else {
        setMessage(
          `Sinkronisasi selesai! Kelas baru: ${data.classesAdded} (total ${data.totalClassesFound}), Guru baru: ${data.teachersCreated} (lewati: ${data.teachersSkipped}), Siswa baru: ${data.studentsCreated} (lewati: ${data.studentsSkipped}).`
        );
        onSynced();
      }
    } catch {
      setMessage("Gagal menghubungi server.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-lg text-slate-900">
            Tarik Data dari SMK3 Absensi
          </h2>
          <button
            onClick={onClose}
            className="text-sm text-slate-500 hover:text-slate-900 cursor-pointer"
          >
            Tutup
          </button>
        </div>
        <p className="text-xs text-slate-500">
          Otomatis menyinkronkan <strong>Kelas</strong>, <strong>Guru</strong>,
          dan <strong>Siswa</strong> (beserta kelasnya) dari database SMK3
          Absensi, sekaligus membuatkan sandi awal siap cetak di Kartu Login.
        </p>

        <div className="flex gap-2 text-xs">
          <button
            type="button"
            onClick={() => setAuthMode("login")}
            className={`flex-1 py-2 rounded-lg font-medium cursor-pointer ${
              authMode === "login"
                ? "bg-indigo-600 text-white"
                : "bg-slate-100 text-slate-700"
            }`}
          >
            Login Admin Absensi
          </button>
          <button
            type="button"
            onClick={() => setAuthMode("secret")}
            className={`flex-1 py-2 rounded-lg font-medium cursor-pointer ${
              authMode === "secret"
                ? "bg-indigo-600 text-white"
                : "bg-slate-100 text-slate-700"
            }`}
          >
            Secret Key Supabase
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {authMode === "login" ? (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Email Admin SMK3 Absensi
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
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
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
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
                value={secretKey}
                onChange={(e) => setSecretKey(e.target.value)}
                placeholder="sb_secret_... atau eyJhbGci..."
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
              />
            </div>
          )}

          {message && (
            <div
              className={`p-3 rounded-lg text-xs border ${
                message.startsWith("Gagal")
                  ? "bg-red-50 border-red-200 text-red-700"
                  : "bg-emerald-50 border-emerald-200 text-emerald-800"
              }`}
            >
              {message}
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
  );
}
