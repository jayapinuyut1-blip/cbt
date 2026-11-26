"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
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

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Sidebar Desktop */}
      <aside className="hidden md:flex md:w-64 md:flex-col bg-white border-r border-slate-200 no-print">
        <div className="p-4 border-b border-slate-200 flex items-center gap-3">
          {settings.logo ? (
            <img
              src={settings.logo}
              alt="Logo"
              className="w-9 h-9 object-contain shrink-0"
            />
          ) : (
            <div className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0">
              <GraduationCap className="w-5 h-5" />
            </div>
          )}
          <div className="min-w-0">
            <div className="font-bold text-sm text-slate-900 truncate">
              {settings.nama_sekolah}
            </div>
            <div className="text-xs text-slate-500 uppercase tracking-wide">
              Panel {profile.role}
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active =
              item.href === `/${profile.role}`
                ? pathname === item.href
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition ${
                  active
                    ? "bg-blue-50 text-blue-700"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-200 space-y-1">
          <div className="px-3 py-2 text-xs text-slate-500">
            <div className="font-semibold text-slate-800 truncate">
              {profile.nama}
            </div>
            <div>
              {profile.username}
              {profile.classes?.nama ? ` • ${profile.classes.nama}` : ""}
            </div>
          </div>
          <Link
            href="/ganti-sandi"
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100"
          >
            <KeyRound className="w-4 h-4" />
            <span>Ganti Kata Sandi</span>
          </Link>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Keluar</span>
          </button>
        </div>
      </aside>

      {/* Main Column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar Mobile */}
        <header className="md:hidden bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between no-print">
          <div className="flex items-center gap-2.5 min-w-0">
            {settings.logo ? (
              <img src={settings.logo} alt="Logo" className="w-7 h-7 object-contain" />
            ) : (
              <GraduationCap className="w-6 h-6 text-blue-600" />
            )}
            <span className="font-bold text-sm truncate">
              {settings.nama_sekolah}
            </span>
          </div>
          <button
            onClick={() => setOpen(!open)}
            className="p-2 rounded-lg text-slate-600 hover:bg-slate-100"
            aria-label="Menu"
          >
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </header>

        {/* Mobile Drawer */}
        {open && (
          <div className="md:hidden bg-white border-b border-slate-200 p-3 space-y-1 no-print">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-100"
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
            <hr className="my-2 border-slate-200" />
            <Link
              href="/ganti-sandi"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-600"
            >
              <KeyRound className="w-4 h-4" />
              <span>Ganti Kata Sandi</span>
            </Link>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-red-600"
            >
              <LogOut className="w-4 h-4" />
              <span>Keluar</span>
            </button>
          </div>
        )}

        <main className="flex-1 p-4 md:p-6 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
