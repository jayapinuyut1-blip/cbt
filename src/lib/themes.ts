export type AppThemeId = "navy-gold" | "dark-saas" | "soft-glass" | "warm-paper";

export interface AppThemeMeta {
  id: AppThemeId;
  name: string;
  badge: string;
  description: string;
  themeColor: string;
  preview: {
    headerBg: string;
    sidebarBg: string;
    canvasBg: string;
    accentColor: string;
    secondaryAccent: string;
    isDarkSidebar: boolean;
  };
}

export const DEFAULT_THEME_ID: AppThemeId = "navy-gold";

export const APP_THEMES: AppThemeMeta[] = [
  {
    id: "navy-gold",
    name: "Academic Navy & Gold",
    badge: "Khas SMKN 3",
    description:
      "Biru navy elegan dengan sentuhan emas selaras logo SMKN 3 Kotamobagu. Resmi, modern, dan fokus.",
    themeColor: "#0f2b5b",
    preview: {
      headerBg: "linear-gradient(135deg, #0f2b5b 0%, #1e3a8a 100%)",
      sidebarBg: "#ffffff",
      canvasBg: "#f4f6fb",
      accentColor: "#1e3a8a",
      secondaryAccent: "#eab308",
      isDarkSidebar: false,
    },
  },
  {
    id: "dark-saas",
    name: "Pro SaaS Dark-Chrome",
    badge: "Tren Dashboard",
    description:
      "Sidebar & topbar gelap premium gaya Linear/Vercel, dipadu area soal putih bersih agar tetap terang saat ujian.",
    themeColor: "#0f172a",
    preview: {
      headerBg: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
      sidebarBg: "#0f172a",
      canvasBg: "#f8fafc",
      accentColor: "#2563eb",
      secondaryAccent: "#38bdf8",
      isDarkSidebar: true,
    },
  },
  {
    id: "soft-glass",
    name: "Soft Glass & Mesh",
    badge: "Modern Tech",
    description:
      "Nuansa biru-indigo segar dengan efek mesh gradient lembut dan kartu kaca halus (frosted glass).",
    themeColor: "#2563eb",
    preview: {
      headerBg: "linear-gradient(135deg, #2563eb 0%, #4f46e5 100%)",
      sidebarBg: "#f8fbff",
      canvasBg: "#eff6ff",
      accentColor: "#4f46e5",
      secondaryAccent: "#06b6d4",
      isDarkSidebar: false,
    },
  },
  {
    id: "warm-paper",
    name: "Warm Paper Eye-Care",
    badge: "Anti-Lelah Mata",
    description:
      "Latar krem hangat minim silau dengan aksen hijau emerald. Sangat nyaman untuk ujian panjang 90–120 menit.",
    themeColor: "#065f46",
    preview: {
      headerBg: "linear-gradient(135deg, #065f46 0%, #047857 100%)",
      sidebarBg: "#fffdf9",
      canvasBg: "#faf8f4",
      accentColor: "#047857",
      secondaryAccent: "#d97706",
      isDarkSidebar: false,
    },
  },
];

export function normalizeThemeId(value?: string | null): AppThemeId {
  if (
    value === "navy-gold" ||
    value === "dark-saas" ||
    value === "soft-glass" ||
    value === "warm-paper"
  ) {
    return value;
  }
  return DEFAULT_THEME_ID;
}

export function getThemeMeta(value?: string | null): AppThemeMeta {
  const id = normalizeThemeId(value);
  return APP_THEMES.find((t) => t.id === id) || APP_THEMES[0];
}
