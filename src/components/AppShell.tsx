"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
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
  Loader2,
  Menu,
  X,
} from "lucide-react";
import { getThemeMeta } from "@/lib/themes";
import type { Profile, SchoolSettings } from "@/types/cbt";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavGroup {
  label?: string;
  items: NavItem[];
}

const ADMIN_NAV_GROUPS: NavGroup[] = [
  {
    label: "Pelaksanaan",
    items: [
      { href: "/admin", label: "Beranda", icon: LayoutDashboard },
      { href: "/admin/monitoring", label: "Monitoring Ujian", icon: Activity },
      { href: "/admin/jadwal", label: "Jadwal & Token", icon: CalendarClock },
    ],
  },
  {
    label: "Data Sekolah",
    items: [
      { href: "/admin/pengguna", label: "Siswa & Guru", icon: Users },
      { href: "/admin/master", label: "Kelas, Mapel & TA", icon: BookOpen },
    ],
  },
  {
    label: "Arsip & Sistem",
    items: [
      { href: "/admin/nilai", label: "Rekap Nilai & Backup", icon: FileSpreadsheet },
      { href: "/admin/pengaturan", label: "Identitas & Tema", icon: Settings },
    ],
  },
];

const GURU_NAV_GROUPS: NavGroup[] = [
  {
    label: "Ruang Guru",
    items: [
      { href: "/guru", label: "Beranda", icon: LayoutDashboard },
      { href: "/guru/bank-soal", label: "Bank Soal", icon: FileText },
      { href: "/guru/ujian", label: "Kelola Ujian", icon: ClipboardList },
      { href: "/guru/koreksi", label: "Koreksi, Nilai & Analisis", icon: PenTool },
    ],
  },
];

const SISWA_NAV_GROUPS: NavGroup[] = [
  {
    items: [{ href: "/siswa", label: "Daftar Ujian", icon: ClipboardList }],
  },
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
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const menuBtnRef = useRef<HTMLButtonElement | null>(null);

  const navGroups =
    profile.role === "admin"
      ? ADMIN_NAV_GROUPS
      : profile.role === "guru"
      ? GURU_NAV_GROUPS
      : SISWA_NAV_GROUPS;

  const userInitial = (profile.nama || profile.username || "U")
    .trim()
    .charAt(0)
    .toUpperCase();

  // Sinkronkan atribut tema & meta theme-color browser dengan pengaturan sekolah terbaru
  useEffect(() => {
    const meta = getThemeMeta(settings.tema);
    document.documentElement.dataset.theme = meta.id;
    const tc = document.querySelector('meta[name="theme-color"]');
    if (tc) tc.setAttribute("content", meta.themeColor);
  }, [settings.tema]);

  // Tutup drawer & reset indikator loading otomatis saat berpindah halaman
  useEffect(() => {
    setOpen(false);
    setPendingHref(null);
  }, [pathname]);

  function closeDrawerAndRestoreFocus() {
    setOpen(false);
    requestAnimationFrame(() => menuBtnRef.current?.focus());
  }

  // Tutup drawer dengan tombol Escape & kunci scroll body saat drawer terbuka
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        requestAnimationFrame(() => menuBtnRef.current?.focus());
      }
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
      <nav
        aria-label="Navigasi utama"
        className="flex-1 p-3 space-y-4 overflow-y-auto"
      >
        {navGroups.map((group, gIdx) => (
          <div key={group.label || gIdx} className="space-y-1">
            {group.label && (
              <div className="px-3 pb-1 text-[11px] font-semibold cbt-profile-sub">
                {group.label}
              </div>
            )}
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = isActiveRoute(item.href);
              const loading = pendingHref === item.href && !active;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  onClick={() => {
                    if (!active) setPendingHref(item.href);
                    onSelect?.();
                  }}
                  className={`flex items-center gap-3 min-h-[44px] px-3 py-2 rounded-lg text-sm transition ${
                    active
                      ? "cbt-nav-item-active font-semibold"
                      : loading
                      ? "cbt-nav-item-active font-medium opacity-85"
                      : "cbt-nav-item font-medium"
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      active || loading ? "cbt-nav-icon-active" : "cbt-nav-icon"
                    }`}
                  />
                  <span className="truncate flex-1">{item.label}</span>
                  {loading && (
                    <Loader2
                      className="w-3.5 h-3.5 animate-spin shrink-0 opacity-80"
                      aria-hidden="true"
                    />
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    );
  }

  function renderProfileFooter(onSelect?: () => void) {
    return (
      <div className="p-3 border-t cbt-sidebar-footer space-y-1.5">
        <div className="px-2.5 py-2 rounded-xl border cbt-profile-card flex items-center gap-2.5">
          <div
            aria-hidden="true"
            className="w-8 h-8 rounded-lg cbt-avatar text-white font-bold text-xs flex items-center justify-center shrink-0"
          >
            {userInitial}
          </div>
          <div className="min-w-0 text-xs">
            <div className="font-semibold cbt-profile-name truncate">
              {profile.nama}
            </div>
            <div className="cbt-profile-sub truncate">
              {profile.username}
              {profile.classes?.nama ? ` • ${profile.classes.nama}` : ""}
            </div>
          </div>
        </div>
        <Link
          href="/ganti-sandi"
          onClick={onSelect}
          className="flex items-center gap-2.5 min-h-[44px] px-3 py-2 rounded-lg text-sm font-medium cbt-nav-item transition"
        >
          <KeyRound className="w-4 h-4 cbt-nav-icon" aria-hidden="true" />
          <span>Ganti Kata Sandi</span>
        </Link>
        <button
          type="button"
          onClick={handleLogout}
          className="w-full flex items-center gap-2.5 min-h-[44px] px-3 py-2 rounded-lg text-sm font-medium cbt-logout-btn transition"
        >
          <LogOut className="w-4 h-4" aria-hidden="true" />
          <span>Keluar</span>
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] flex cbt-canvas">
      {/* Sidebar Desktop (mengikuti tema aktif secara penuh) */}
      <aside className="hidden md:flex md:w-64 md:flex-col md:sticky md:top-0 md:h-[100dvh] cbt-sidebar border-r no-print shrink-0">
        <div className="px-4 py-3.5 cbt-header text-white flex items-center gap-3">
          {settings.logo ? (
            <div className="w-9 h-9 rounded-lg bg-white/95 p-1 flex items-center justify-center shrink-0">
              <img
                src={settings.logo}
                alt={`Logo ${settings.nama_sekolah}`}
                width={32}
                height={32}
                className="w-full h-full object-contain"
              />
            </div>
          ) : (
            <div className="w-9 h-9 rounded-lg bg-white/15 border border-white/25 text-white flex items-center justify-center shrink-0">
              <GraduationCap className="w-5 h-5" aria-hidden="true" />
            </div>
          )}
          <div className="min-w-0">
            <div className="font-bold text-sm leading-tight truncate">
              {settings.nama_sekolah}
            </div>
            <div className="text-[11px] text-white/85 capitalize font-medium mt-0.5">
              Panel {profile.role}
            </div>
          </div>
        </div>

        {renderNavList()}
        {renderProfileFooter()}
      </aside>

      {/* Main Column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar Mobile (Sticky, identitas identik dengan Desktop Sidebar) */}
        <header className="md:hidden sticky top-0 z-30 cbt-header text-white shadow-xs px-3.5 py-2.5 flex items-center justify-between gap-3 no-print">
          <div className="flex items-center gap-2.5 min-w-0">
            {settings.logo ? (
              <div className="w-8 h-8 rounded-lg bg-white/95 p-1 flex items-center justify-center shrink-0">
                <img
                  src={settings.logo}
                  alt={`Logo ${settings.nama_sekolah}`}
                  width={28}
                  height={28}
                  className="w-full h-full object-contain"
                />
              </div>
            ) : (
              <div className="w-8 h-8 rounded-lg bg-white/15 border border-white/25 text-white flex items-center justify-center shrink-0">
                <GraduationCap className="w-4 h-4" aria-hidden="true" />
              </div>
            )}
            <div className="min-w-0">
              <div className="font-bold text-sm leading-tight truncate">
                {settings.nama_sekolah}
              </div>
              <div className="text-[11px] text-white/85 capitalize font-medium truncate">
                Panel {profile.role} • {profile.nama}
              </div>
            </div>
          </div>

          <button
            ref={menuBtnRef}
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="w-11 h-11 rounded-lg bg-white/10 hover:bg-white/20 active:bg-white/25 text-white transition flex items-center justify-center shrink-0"
            aria-label={open ? "Tutup menu" : "Buka menu"}
            aria-expanded={open}
          >
            {open ? (
              <X className="w-5 h-5" aria-hidden="true" />
            ) : (
              <Menu className="w-5 h-5" aria-hidden="true" />
            )}
          </button>
        </header>

        {/* Mobile Slide-Over Drawer */}
        {open && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Menu navigasi"
            className="md:hidden fixed inset-0 z-50 flex no-print"
          >
            <div
              className="fixed inset-0 bg-slate-900/50"
              onClick={closeDrawerAndRestoreFocus}
              aria-hidden="true"
            />
            <aside className="relative z-10 w-72 max-w-[85vw] h-[100dvh] cbt-sidebar shadow-xl flex flex-col">
              <div className="px-4 py-3.5 cbt-header text-white flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  {settings.logo ? (
                    <div className="w-8 h-8 rounded-lg bg-white/95 p-1 flex items-center justify-center shrink-0">
                      <img
                        src={settings.logo}
                        alt={`Logo ${settings.nama_sekolah}`}
                        width={28}
                        height={28}
                        className="w-full h-full object-contain"
                      />
                    </div>
                  ) : (
                    <div className="w-8 h-8 rounded-lg bg-white/15 border border-white/25 flex items-center justify-center shrink-0">
                      <GraduationCap className="w-4 h-4" aria-hidden="true" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="font-bold text-sm leading-tight truncate">
                      {settings.nama_sekolah}
                    </div>
                    <div className="text-[11px] text-white/85 capitalize">
                      Panel {profile.role}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeDrawerAndRestoreFocus}
                  className="w-10 h-10 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
                  aria-label="Tutup menu"
                >
                  <X className="w-4 h-4" aria-hidden="true" />
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
