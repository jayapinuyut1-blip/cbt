"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { GraduationCap, Lock, User, Eye, EyeOff, AlertCircle, Megaphone } from "lucide-react";
import { getThemeMeta } from "@/lib/themes";
import type { SchoolSettings } from "@/types/cbt";

export default function LoginForm({
  settings,
  initialError,
}: {
  settings: SchoolSettings;
  initialError: string;
}) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(initialError);

  useEffect(() => {
    const meta = getThemeMeta(settings.tema);
    document.documentElement.dataset.theme = meta.id;
    const tc = document.querySelector('meta[name="theme-color"]');
    if (tc) tc.setAttribute("content", meta.themeColor);
  }, [settings.tema]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Gagal masuk.");
        setLoading(false);
        return;
      }
      router.push(data.redirectTo || "/");
      router.refresh();
    } catch {
      setError("Koneksi ke server terganggu. Coba lagi.");
      setLoading(false);
    }
  }

  return (
    <main className="min-h-[100dvh] flex items-center justify-center cbt-auth-canvas p-4">
      <div className="w-full max-w-md cbt-auth-card rounded-2xl shadow-md border border-slate-200/90 overflow-hidden">
        <div className="h-1.5 cbt-auth-bar" />
        <div className="p-6 sm:p-8">
        <div className="flex flex-col items-center text-center mb-6">
          {settings.logo ? (
            <img
              src={settings.logo}
              alt={`Logo ${settings.nama_sekolah}`}
              width={64}
              height={64}
              fetchPriority="high"
              className="w-16 h-16 object-contain mb-3"
            />
          ) : (
            <div className="w-14 h-14 rounded-2xl cbt-avatar text-white flex items-center justify-center mb-3">
              <GraduationCap className="w-8 h-8" aria-hidden="true" />
            </div>
          )}
          <h1 className="text-lg sm:text-xl font-bold text-slate-900">
            {settings.nama_sekolah}
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 mt-1">
            Aplikasi Ujian Berbasis Komputer (CBT)
          </p>
        </div>

        {settings.pengumuman_login?.trim() && (
          <div className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 text-xs sm:text-sm flex items-start gap-2.5">
            <Megaphone className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" aria-hidden="true" />
            <div className="whitespace-pre-wrap leading-relaxed">
              {settings.pengumuman_login.trim()}
            </div>
          </div>
        )}

        {error && (
          <div role="alert" className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="login-username" className="block text-sm font-medium text-slate-700 mb-1">
              NISN / NIP
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
              <input
                id="login-username"
                type="text"
                required
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Masukkan NISN atau NIP"
                className="w-full min-h-[44px] pl-10 pr-3 py-2.5 rounded-lg border border-slate-300 text-base sm:text-sm focus:border-[var(--cbt-accent)]"
              />
            </div>
          </div>

          <div>
            <label htmlFor="login-password" className="block text-sm font-medium text-slate-700 mb-1">
              Kata Sandi
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
              <input
                id="login-password"
                type={showPwd ? "text" : "password"}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Masukkan kata sandi"
                className="w-full min-h-[44px] pl-10 pr-11 py-2.5 rounded-lg border border-slate-300 text-base sm:text-sm focus:border-[var(--cbt-accent)]"
              />
              <button
                type="button"
                onClick={() => setShowPwd(!showPwd)}
                aria-label={showPwd ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-md flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition"
              >
                {showPwd ? (
                  <EyeOff className="w-4 h-4" aria-hidden="true" />
                ) : (
                  <Eye className="w-4 h-4" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full min-h-[44px] py-2.5 px-4 cbt-btn-primary disabled:opacity-60 font-semibold rounded-lg text-sm transition"
          >
            {loading ? "Memverifikasi..." : "Masuk ke CBT"}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-slate-200/80 text-center text-xs text-slate-600">
          Gunakan NISN / NIP dan kata sandi dari kartu login ujian Anda.
        </div>
        </div>
      </div>
    </main>
  );
}
