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
    name: "Kontras Gelap-Terang",
    badge: "Fokus Tinggi",
    description:
      "Sidebar dan topbar gelap berjarak kontras tinggi, dipadu area soal putih bersih agar mata tetap fokus selama ujian.",
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
    name: "Cobalt Bersih",
    badge: "Modern Ringan",
    description:
      "Nuansa biru kobalt sejuk dengan permukaan kartu bersih dan aksen kaca tipis pada layar masuk.",
    themeColor: "#1d4ed8",
    preview: {
      headerBg: "linear-gradient(135deg, #1d4ed8 0%, #3730a3 100%)",
      sidebarBg: "#ffffff",
      canvasBg: "#f1f5fd",
      accentColor: "#1d4ed8",
      secondaryAccent: "#0284c7",
      isDarkSidebar: false,
    },
  },
  {
    id: "warm-paper",
    name: "Warm Paper Eye-Care",
    badge: "Nyaman Mata",
    description:
      "Latar krem hangat minim silau dengan aksen hijau emerald. Nyaman untuk ujian panjang 90 hingga 120 menit.",
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
