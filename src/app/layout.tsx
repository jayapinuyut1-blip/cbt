import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CBT Sekolah — Ujian Berbasis Komputer",
  description: "Aplikasi Ujian Online Ringan untuk Sekolah",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
