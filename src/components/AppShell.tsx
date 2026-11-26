"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  GraduationCap,
  LayoutDashboard,
  Users,
  BookOpen,
  CalendarClock,
  Activity,
  FileSpreadsheet,
  Settings,
  FileText,
  ClipboardList,
  PenTool,
  KeyRound,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import type { Profile, SchoolSettings } from "@/types/cbt";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "Beranda", icon: LayoutDashboard },
  { href: "/admin/monitoring", label: "Monitoring Ujian", icon: Activity },
  { href: "/admin/jadwal", label: "Jadwal & Token", icon: CalendarClock },
  { href: "/admin/pengguna", label: "Siswa & Guru", icon: Users },
  { href: "/admin/master", label: "Kelas, Mapel & TA", icon: BookOpen },
  { href: "/admin/nilai", label: "Rekap Nilai & Backup", icon: FileSpreadsheet },
  { href: "/admin/pengaturan", label: "Identitas Sekolah", icon: Settings },
];

const GURU_NAV: NavItem[] = [
  { href: "/guru", label: "Beranda", icon: LayoutDashboard },
  { href: "/guru/bank-soal", label: "Bank Soal", icon: FileText },
  { href: "/guru/ujian", label: "Kelola Ujian", icon: ClipboardList },
  { href: "/guru/koreksi", label: "Koreksi Essay & Nilai", icon: PenTool },
];

const SISWA_NAV: NavItem[] = [
  { href: "/siswa", label: "Daftar Ujian", icon: ClipboardList },
];

export default function AppShell({
  profile,
  settings,
  children,
}: {
  profile: Profile;
  settings: SchoolSettings;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const navItems =
    profile.role === "admin"
      ? ADMIN_NAV
      : profile.role === "guru"
      ? GURU_NAV
      : SISWA_NAV;

  const userInitial = (profile.nama || profile.username || "U")
    .trim()
    .charAt(0)
    .toUpperCase();

  // Tutup drawer otomatis saat berpindah halaman
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Tutup drawer dengan tombol Escape & kunci scroll body saat drawer terbuka
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function isActiveRoute(href: string) {
    return href === `/${profile.role}`
      ? pathname === href
      : pathname.startsWith(href);
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  function renderNavList(onSelect?: () => void) {
    return (
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActiveRoute(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onSelect}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition ${
                active
                  ? "bg-blue-50 text-blue-700 font-semibold ring-1 ring-blue-200/80 shadow-2xs"
                  : "text-slate-600 font-medium hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              <Icon
                className={`w-4 h-4 shrink-0 ${
                  active ? "text-blue-600" : "text-slate-400"
                }`}
              />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    );
  }

  function renderProfileFooter(onSelect?: () => void) {
    return (
      <div className="p-3 border-t border-slate-200 bg-slate-50/70 space-y-1.5">
        <div className="px-2.5 py-2 rounded-xl bg-white border border-slate-200/80 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-600 text-white font-bold text-xs flex items-center justify-center shrink-0">
            {userInitial}
          </div>
          <div className="min-w-0 text-xs">
            <div className="font-semibold text-slate-800 truncate">
              {profile.nama}
            </div>
            <div className="text-slate-500 truncate">
              {profile.username}
              {profile.classes?.nama ? ` • ${profile.classes.nama}` : ""}
            </div>
          </div>
        </div>
        <Link
          href="/ganti-sandi"
          onClick={onSelect}
          className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-200/60 hover:text-slate-900 transition"
        >
          <KeyRound className="w-4 h-4 text-slate-400" />
          <span>Ganti Kata Sandi</span>
        </Link>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium text-red-600 hover:bg-red-50 transition cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
          <span>Keluar</span>
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] flex bg-slate-50 text-slate-900">
      {/* Sidebar Desktop (Tema Biru SMKN 3 konsisten dengan Mobile Topbar) */}
      <aside className="hidden md:flex md:w-64 md:flex-col md:sticky md:top-0 md:h-[100dvh] bg-white border-r border-slate-200 shadow-xs no-print shrink-0">
        <div className="px-4 py-3.5 bg-gradient-to-r from-blue-700 to-blue-600 text-white flex items-center gap-3">
          {settings.logo ? (
            <div className="w-9 h-9 rounded-lg bg-white/95 p-1 flex items-center justify-center shrink-0 shadow-xs">
              <img
                src={settings.logo}
                alt="Logo"
                className="w-full h-full object-contain"
              />
            </div>
          ) : (
            <div className="w-9 h-9 rounded-lg bg-white/15 border border-white/25 text-white flex items-center justify-center shrink-0">
              <GraduationCap className="w-5 h-5" />
            </div>
          )}
          <div className="min-w-0">
            <div className="font-bold text-sm leading-tight truncate">
              {settings.nama_sekolah}
            </div>
            <div className="text-[11px] text-blue-100 uppercase tracking-wider font-medium mt-0.5">
              Panel {profile.role}
            </div>
          </div>
        </div>

        {renderNavList()}
        {renderProfileFooter()}
      </aside>

      {/* Main Column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar Mobile (Sticky, tema warna & identitas identik dengan Desktop Sidebar) */}
        <header className="md:hidden sticky top-0 z-30 bg-gradient-to-r from-blue-700 to-blue-600 text-white shadow-sm px-3.5 py-2.5 flex items-center justify-between gap-3 no-print">
          <div className="flex items-center gap-2.5 min-w-0">
            {settings.logo ? (
              <div className="w-8 h-8 rounded-lg bg-white/95 p-1 flex items-center justify-center shrink-0 shadow-xs">
                <img
                  src={settings.logo}
                  alt="Logo"
                  className="w-full h-full object-contain"
                />
              </div>
            ) : (
              <div className="w-8 h-8 rounded-lg bg-white/15 border border-white/25 text-white flex items-center justify-center shrink-0">
                <GraduationCap className="w-4 h-4" />
              </div>
            )}
            <div className="min-w-0">
              <div className="font-bold text-sm leading-tight truncate">
                {settings.nama_sekolah}
              </div>
              <div className="text-[10px] text-blue-100 uppercase tracking-wider font-medium">
                Panel {profile.role} • {profile.nama}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 active:bg-white/25 text-white transition cursor-pointer shrink-0"
            aria-label={open ? "Tutup menu" : "Buka menu"}
            aria-expanded={open}
          >
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </header>

        {/* Mobile Slide-Over Drawer (identik dengan Desktop Sidebar) */}
        {open && (
          <div className="md:hidden fixed inset-0 z-50 flex no-print">
            <div
              className="fixed inset-0 bg-slate-900/50 backdrop-blur-[1px]"
              onClick={() => setOpen(false)}
              aria-hidden="true"
            />
            <aside className="relative z-10 w-72 max-w-[85vw] h-[100dvh] bg-white shadow-2xl flex flex-col">
              <div className="px-4 py-3.5 bg-gradient-to-r from-blue-700 to-blue-600 text-white flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  {settings.logo ? (
                    <div className="w-8 h-8 rounded-lg bg-white/95 p-1 flex items-center justify-center shrink-0">
                      <img
                        src={settings.logo}
                        alt="Logo"
                        className="w-full h-full object-contain"
                      />
                    </div>
                  ) : (
                    <div className="w-8 h-8 rounded-lg bg-white/15 border border-white/25 flex items-center justify-center shrink-0">
                      <GraduationCap className="w-4 h-4" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="font-bold text-sm leading-tight truncate">
                      {settings.nama_sekolah}
                    </div>
                    <div className="text-[11px] text-blue-100 uppercase tracking-wider">
                      Panel {profile.role}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer"
                  aria-label="Tutup menu"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {renderNavList(() => setOpen(false))}
              {renderProfileFooter(() => setOpen(false))}
            </aside>
          </div>
        )}

        <main className="flex-1 p-3.5 sm:p-5 md:p-6 max-w-7xl w-full mx-auto pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          {children}
        </main>
      </div>
    </div>
  );
}
