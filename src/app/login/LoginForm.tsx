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
    <div className="min-h-[100dvh] flex items-center justify-center cbt-auth-canvas p-4">
      <div className="w-full max-w-md cbt-auth-card rounded-2xl shadow-xl border border-slate-200/80 overflow-hidden">
        <div className="h-1.5 cbt-auth-bar" />
        <div className="p-6 sm:p-8">
        <div className="flex flex-col items-center text-center mb-6">
          {settings.logo ? (
            <img
              src={settings.logo}
              alt="Logo Sekolah"
              className="w-16 h-16 object-contain mb-3"
            />
          ) : (
            <div className="w-14 h-14 rounded-2xl cbt-avatar text-white flex items-center justify-center mb-3 shadow-md">
              <GraduationCap className="w-8 h-8" />
            </div>
          )}
          <h1 className="text-lg sm:text-xl font-bold text-slate-900">
            {settings.nama_sekolah}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Aplikasi Ujian Berbasis Komputer (CBT)
          </p>
        </div>

        {settings.pengumuman_login?.trim() && (
          <div className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 text-xs sm:text-sm flex items-start gap-2.5">
            <Megaphone className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <div className="whitespace-pre-wrap leading-relaxed">
              {settings.pengumuman_login.trim()}
            </div>
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              NIS / Username
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                required
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Masukkan NIS atau username"
                className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-slate-300 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Kata Sandi
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type={showPwd ? "text" : "password"}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Masukkan kata sandi"
                className="w-full pl-10 pr-10 py-2.5 rounded-lg border border-slate-300 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <button
                type="button"
                onClick={() => setShowPwd(!showPwd)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                tabIndex={-1}
              >
                {showPwd ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 cbt-btn-primary disabled:opacity-60 font-semibold rounded-lg text-sm transition cursor-pointer shadow-xs"
          >
            {loading ? "Memverifikasi..." : "Masuk"}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-slate-100 text-center text-xs text-slate-400">
          Gunakan NIS dan kata sandi dari kartu login ujian Anda.
        </div>
        </div>
      </div>
    </div>
  );
}
