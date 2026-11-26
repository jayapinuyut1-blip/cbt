import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  Users,
  BookOpen,
  FileText,
  CalendarClock,
  Activity,
  Download,
} from "lucide-react";

export default async function AdminDashboardPage() {
  const supabase = await createServerSupabase();

  const [
    { count: siswaCount },
    { count: guruCount },
    { count: kelasCount },
    { count: soalCount },
    { count: ujianCount },
    { count: activeAttempts },
    { data: activeYear },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "siswa")
      .eq("aktif", true),
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "guru")
      .eq("aktif", true),
    supabase.from("classes").select("id", { count: "exact", head: true }),
    supabase.from("questions").select("id", { count: "exact", head: true }),
    supabase.from("exams").select("id", { count: "exact", head: true }),
    supabase
      .from("attempts")
      .select("id", { count: "exact", head: true })
      .eq("status", "mengerjakan"),
    supabase
      .from("academic_years")
      .select("nama")
      .eq("aktif", true)
      .maybeSingle(),
  ]);

  const stats = [
    { label: "Siswa Aktif", value: siswaCount || 0, icon: Users, color: "bg-blue-50 text-blue-700" },
    { label: "Guru Aktif", value: guruCount || 0, icon: Users, color: "bg-indigo-50 text-indigo-700" },
    { label: "Kelas", value: kelasCount || 0, icon: BookOpen, color: "bg-emerald-50 text-emerald-700" },
    { label: "Total Bank Soal", value: soalCount || 0, icon: FileText, color: "bg-amber-50 text-amber-700" },
    { label: "Paket Ujian", value: ujianCount || 0, icon: CalendarClock, color: "bg-purple-50 text-purple-700" },
    { label: "Sedang Mengerjakan", value: activeAttempts || 0, icon: Activity, color: "bg-rose-50 text-rose-700" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Beranda Admin</h1>
          <p className="text-sm text-slate-500">
            Tahun Ajaran Aktif:{" "}
            <span className="font-semibold text-slate-800">
              {activeYear?.nama || "Belum diatur"}
            </span>
          </p>
        </div>
        <a
          href="/api/admin/backup"
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-medium"
        >
          <Download className="w-4 h-4" />
          Backup Database (.sql)
        </a>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <div
              key={s.label}
              className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4"
            >
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${s.color}`}>
                <Icon className="w-5 h-5" />
              </div>
              <div>
                <div className="text-2xl font-bold text-slate-900">{s.value}</div>
                <div className="text-xs text-slate-500">{s.label}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Link
          href="/admin/monitoring"
          className="bg-white rounded-xl border border-slate-200 p-5 hover:border-blue-400 transition"
        >
          <div className="font-semibold text-slate-900 mb-1">
            Monitoring Real-time
          </div>
          <p className="text-sm text-slate-500">
            Pantau status peserta, log pindah tab, reset login, tambah waktu, atau paksa selesai.
          </p>
        </Link>
        <Link
          href="/admin/jadwal"
          className="bg-white rounded-xl border border-slate-200 p-5 hover:border-blue-400 transition"
        >
          <div className="font-semibold text-slate-900 mb-1">
            Jadwal, Token & Daftar Hadir
          </div>
          <p className="text-sm text-slate-500">
            Atur sesi ujian kelas, ganti token 6 karakter, pengecualian susulan, dan cetak daftar hadir.
          </p>
        </Link>
        <Link
          href="/admin/pengguna"
          className="bg-white rounded-xl border border-slate-200 p-5 hover:border-blue-400 transition"
        >
          <div className="font-semibold text-slate-900 mb-1">
            Impor Excel & Kartu Login
          </div>
          <p className="text-sm text-slate-500">
            Impor data siswa dan guru dari Excel, buat sandi otomatis, lalu cetak kartu login peserta.
          </p>
        </Link>
      </div>
    </div>
  );
}
