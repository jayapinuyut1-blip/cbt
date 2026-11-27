import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { getSchoolSettings } from "@/lib/server-auth";
import { getThemeMeta } from "@/lib/themes";
import NavigationProgress from "@/components/NavigationProgress";
import "katex/dist/katex.min.css";
import "./globals.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  title: "CBT Sekolah: Ujian Berbasis Komputer",
  description: "Aplikasi Ujian Online Ringan untuk Sekolah",
};

export async function generateViewport(): Promise<Viewport> {
  const settings = await getSchoolSettings();
  const theme = getThemeMeta(settings.tema);
  return {
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
    themeColor: theme.themeColor,
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const settings = await getSchoolSettings();
  const theme = getThemeMeta(settings.tema);

  return (
    <html
      lang="id"
      data-theme={theme.id}
      className={`light ${plusJakartaSans.variable}`}
    >
      <body className="min-h-[100dvh] cbt-canvas antialiased selection:bg-blue-100 selection:text-blue-900">
        <NavigationProgress />
        {children}
      </body>
    </html>
  );
}
