import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  Users,
  BookOpen,
  FileText,
  CalendarClock,
  Activity,
  Download,
  Palette,
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

  const activeCount = activeAttempts || 0;

  const schoolMetrics = [
    { label: "Siswa Aktif", value: siswaCount || 0, icon: Users },
    { label: "Guru Aktif", value: guruCount || 0, icon: Users },
    { label: "Kelas", value: kelasCount || 0, icon: BookOpen },
    { label: "Total Bank Soal", value: soalCount || 0, icon: FileText },
    { label: "Paket Ujian", value: ujianCount || 0, icon: CalendarClock },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Beranda Admin</h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Tahun Ajaran Aktif:{" "}
            <span className="font-semibold text-slate-900">
              {activeYear?.nama || "Belum diatur"}
            </span>
          </p>
        </div>
        <a
          href="/api/admin/backup"
          className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 rounded-lg text-sm font-semibold transition"
        >
          <Download className="w-4 h-4" aria-hidden="true" />
          <span>Backup Database (.sql)</span>
        </a>
      </div>

      {/* Fokus Utama: Status Pelaksanaan Ujian Berjalan */}
      <section
        aria-label="Status pelaksanaan ujian saat ini"
        className="bg-white rounded-2xl border border-slate-200 overflow-hidden"
      >
        <div
          className="h-1"
          style={{ background: "var(--cbt-auth-bar)" }}
          aria-hidden="true"
        />
        <div className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-start gap-4">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
              style={{
                backgroundColor: "var(--cbt-accent-soft)",
                color: "var(--cbt-accent)",
              }}
            >
              <Activity className="w-6 h-6" aria-hidden="true" />
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-600">
                Sedang Mengerjakan Ujian Saat Ini
              </div>
              <div className="text-3xl font-extrabold text-slate-900 leading-tight mt-0.5">
                {activeCount}{" "}
                <span className="text-sm font-medium text-slate-600">
                  peserta aktif
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-1">
                Pantau log pelanggaran, buka kunci layar terkunci, reset login, atau tambah waktu peserta dari halaman Monitoring.
              </p>
            </div>
          </div>
          <Link
            href="/admin/monitoring"
            className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 cbt-btn-primary rounded-xl text-sm font-semibold shrink-0 transition"
          >
            <Activity className="w-4 h-4" aria-hidden="true" />
            <span>Buka Monitoring Ujian</span>
          </Link>
        </div>
      </section>

      {/* Ringkasan Data Sekolah (Palet Netral + 1 Aksen Tema, Tanpa Warna Pelangi) */}
      <section aria-label="Ringkasan data sekolah" className="space-y-2.5">
        <h2 className="text-xs font-semibold text-slate-600">
          Ringkasan Data Sekolah
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {schoolMetrics.map((m) => {
            const Icon = m.icon;
            return (
              <div
                key={m.label}
                className="bg-white rounded-xl border border-slate-200 p-4 space-y-2"
              >
                <div className="flex items-center justify-between text-slate-600">
                  <span className="text-xs font-medium">{m.label}</span>
                  <Icon className="w-4 h-4 opacity-70" aria-hidden="true" />
                </div>
                <div className="text-2xl font-bold text-slate-900">
                  {m.value}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Pintasan Operasional Harian (Komposisi Variatif, Bukan 3 Kartu Identik) */}
      <section aria-label="Pintasan operasional" className="grid lg:grid-cols-12 gap-4">
        <Link
          href="/admin/jadwal"
          className="lg:col-span-5 bg-white rounded-xl border border-slate-200 p-5 hover:border-[var(--cbt-accent)] transition flex flex-col justify-between gap-3"
        >
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-slate-900 font-semibold">
              <CalendarClock
                className="w-4 h-4"
                style={{ color: "var(--cbt-accent)" }}
                aria-hidden="true"
              />
              <span>Jadwal, Token &amp; Berita Acara</span>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">
              Atur sesi kelas (Jam II / Jam III), perbarui token 6 karakter, kelola susulan per siswa, dan cetak daftar hadir serta berita acara ujian.
            </p>
          </div>
          <span
            className="text-xs font-semibold"
            style={{ color: "var(--cbt-accent)" }}
          >
            Kelola jadwal ujian
          </span>
        </Link>

        <Link
          href="/admin/pengguna"
          className="lg:col-span-4 bg-white rounded-xl border border-slate-200 p-5 hover:border-[var(--cbt-accent)] transition flex flex-col justify-between gap-3"
        >
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-slate-900 font-semibold">
              <Users
                className="w-4 h-4"
                style={{ color: "var(--cbt-accent)" }}
                aria-hidden="true"
              />
              <span>Siswa, Guru &amp; Kartu Login</span>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">
              Impor akun dari Excel, atur mapel ampu guru, kelola kenaikan kelas, dan cetak kartu login peserta.
            </p>
          </div>
          <span
            className="text-xs font-semibold"
            style={{ color: "var(--cbt-accent)" }}
          >
            Buka daftar pengguna
          </span>
        </Link>

        <Link
          href="/admin/pengaturan"
          className="lg:col-span-3 bg-white rounded-xl border border-slate-200 p-5 hover:border-[var(--cbt-accent)] transition flex flex-col justify-between gap-3"
        >
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-slate-900 font-semibold">
              <Palette
                className="w-4 h-4"
                style={{ color: "var(--cbt-accent)" }}
                aria-hidden="true"
              />
              <span>Identitas &amp; Tema</span>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">
              Ubah logo sekolah, banner pengumuman login, dan tema tampilan Mobile maupun Desktop.
            </p>
          </div>
          <span
            className="text-xs font-semibold"
            style={{ color: "var(--cbt-accent)" }}
          >
            Atur tampilan
          </span>
        </Link>
      </section>
    </div>
  );
}
