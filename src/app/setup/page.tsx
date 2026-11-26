"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, AlertCircle, CheckCircle2 } from "lucide-react";

export default function SetupPage() {
  const router = useRouter();
  const [status, setStatus] = useState<{
    loading: boolean;
    ready: boolean;
    hasAdmin: boolean;
    error?: string;
  }>({ loading: true, ready: false, hasAdmin: false });

  const [username, setUsername] = useState("admin");
  const [nama, setNama] = useState("Administrator CBT");
  const [password, setPassword] = useState("");
  const [secret, setSecret] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch("/api/setup")
      .then((r) => r.json())
      .then((d) => setStatus({ loading: false, ...d }))
      .catch(() =>
        setStatus({
          loading: false,
          ready: false,
          hasAdmin: false,
          error: "Gagal memeriksa status database.",
        })
      );
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, nama, password, secret }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || "Gagal membuat admin.");
        setSubmitting(false);
        return;
      }
      setDone(true);
      setTimeout(() => router.push("/login"), 1200);
    } catch {
      setFormError("Kesalahan jaringan.");
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg border border-slate-200 p-8">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">
              Setup Awal CBT Sekolah
            </h1>
            <p className="text-xs text-slate-500">
              Buat akun Administrator pertama kali.
            </p>
          </div>
        </div>

        {status.loading ? (
          <p className="text-sm text-slate-500">Memeriksa koneksi Supabase...</p>
        ) : !status.ready ? (
          <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
            {status.error}
          </div>
        ) : status.hasAdmin ? (
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">
              Akun Admin sudah terdaftar. Halaman setup otomatis terkunci.
            </div>
            <button
              onClick={() => router.push("/login")}
              className="w-full py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold cursor-pointer"
            >
              Ke Halaman Login
            </button>
          </div>
        ) : done ? (
          <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5" />
            <span>Akun Admin berhasil dibuat! Mengalihkan ke login...</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {formError && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{formError}</span>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Username Admin
              </label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
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
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Kata Sandi (min. 6 karakter)
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Kode Rahasia Setup (CBT_SETUP_SECRET)
              </label>
              <input
                type="password"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder="Kosongkan jika tidak disetel di .env"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold cursor-pointer"
            >
              {submitting ? "Membuat Akun..." : "Buat Akun Admin"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
