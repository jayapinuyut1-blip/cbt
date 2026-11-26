"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { compressImageFile } from "@/lib/image";
import {
  APP_THEMES,
  DEFAULT_THEME_ID,
  getThemeMeta,
  normalizeThemeId,
  type AppThemeId,
} from "@/lib/themes";
import { Save, Upload, CheckCircle2, Palette, Check } from "lucide-react";

export default function AdminPengaturanPage() {
  const router = useRouter();
  const supabase = createClient();
  const [namaSekolah, setNamaSekolah] = useState("");
  const [alamatSekolah, setAlamatSekolah] = useState("");
  const [logo, setLogo] = useState("");
  const [tema, setTema] = useState<AppThemeId>(DEFAULT_THEME_ID);
  const savedTemaRef = useRef<AppThemeId>(DEFAULT_THEME_ID);

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");

  function applyThemeToDocument(themeId: AppThemeId) {
    const meta = getThemeMeta(themeId);
    document.documentElement.dataset.theme = meta.id;
    const tc = document.querySelector('meta[name="theme-color"]');
    if (tc) tc.setAttribute("content", meta.themeColor);
  }

  useEffect(() => {
    supabase
      .from("settings")
      .select("kunci, nilai")
      .then(({ data }) => {
        (data || []).forEach((row) => {
          if (row.kunci === "nama_sekolah") setNamaSekolah(row.nilai);
          if (row.kunci === "alamat_sekolah") setAlamatSekolah(row.nilai);
          if (row.kunci === "logo") setLogo(row.nilai);
          if (row.kunci === "tema") {
            const norm = normalizeThemeId(row.nilai);
            setTema(norm);
            savedTemaRef.current = norm;
            applyThemeToDocument(norm);
          }
        });
      });

    return () => {
      // Jika meninggalkan halaman tanpa menyimpan, kembalikan ke tema yang tersimpan
      applyThemeToDocument(savedTemaRef.current);
    };
  }, [supabase]);

  function handleSelectTheme(nextId: AppThemeId) {
    setTema(nextId);
    setSavedMsg("");
    applyThemeToDocument(nextId);
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const compressed = await compressImageFile(file, 400, 0.85);
      const fd = new FormData();
      fd.append("file", compressed);
      fd.append("folder", "school");

      const res = await fetch("/api/upload-image", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        alert("Gagal upload logo: " + (data.error || "Kesalahan server"));
      } else {
        if (logo && logo !== data.url) {
          fetch("/api/upload-image", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: logo }),
          }).catch(() => {});
        }
        setLogo(data.url);
      }
    } finally {
      setUploading(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSavedMsg("");
    const { error } = await supabase.from("settings").upsert([
      { kunci: "nama_sekolah", nilai: namaSekolah.trim() },
      { kunci: "alamat_sekolah", nilai: alamatSekolah.trim() },
      { kunci: "logo", nilai: logo.trim() },
      { kunci: "tema", nilai: tema },
    ]);
    setSaving(false);
    if (error) {
      alert("Gagal menyimpan pengaturan: " + error.message);
      return;
    }
    savedTemaRef.current = tema;
    applyThemeToDocument(tema);
    setSavedMsg(
      "Identitas sekolah & tema tampilan berhasil disimpan untuk semua pengguna (Mobile & Desktop)."
    );
    router.refresh();
  }

  const isThemeDirty = tema !== savedTemaRef.current;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Identitas & Tema Sekolah
        </h1>
        <p className="text-sm text-slate-500">
          Atur nama, logo, dan tema tampilan aplikasi CBT. Perubahan tema otomatis berlaku seragam di tampilan Mobile maupun Desktop.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Kartu Identitas Sekolah */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-5 shadow-2xs">
          <h2 className="font-bold text-base text-slate-900">
            Identitas Sekolah
          </h2>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Nama Sekolah
            </label>
            <input
              type="text"
              required
              value={namaSekolah}
              onChange={(e) => setNamaSekolah(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-base sm:text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Alamat Sekolah
            </label>
            <input
              type="text"
              value={alamatSekolah}
              onChange={(e) => setAlamatSekolah(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-base sm:text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Logo Sekolah
            </label>
            <div className="flex flex-wrap items-center gap-4">
              {logo ? (
                <img
                  src={logo}
                  alt="Logo Sekolah"
                  className="w-16 h-16 object-contain rounded-xl border border-slate-200 p-1.5 bg-white"
                />
              ) : (
                <div className="w-16 h-16 rounded-xl border border-dashed border-slate-300 flex items-center justify-center text-xs text-slate-400">
                  Belum ada
                </div>
              )}
              <label className="inline-flex items-center gap-2 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm font-medium text-slate-700 cursor-pointer transition">
                <Upload className="w-4 h-4" />
                <span>
                  {uploading ? "Mengunggah..." : "Unggah Logo (PNG/JPG)"}
                </span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={handleLogoUpload}
                  disabled={uploading}
                />
              </label>
              {logo && (
                <button
                  type="button"
                  onClick={() => setLogo("")}
                  className="text-xs text-red-600 hover:underline cursor-pointer"
                >
                  Hapus Logo
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Kartu Pemilih Tema Tampilan (Live Preview) */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-4 shadow-2xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Palette className="w-5 h-5 text-blue-600" />
              <div>
                <h2 className="font-bold text-base text-slate-900">
                  Tema Tampilan Aplikasi
                </h2>
                <p className="text-xs text-slate-500">
                  Klik salah satu tema untuk pratinjau langsung, lalu klik{" "}
                  <strong>Simpan Perubahan</strong>.
                </p>
              </div>
            </div>
            {isThemeDirty && (
              <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-amber-100 text-amber-800">
                Pratinjau aktif — belum disimpan
              </span>
            )}
          </div>

          <div className="grid sm:grid-cols-2 gap-3.5">
            {APP_THEMES.map((item) => {
              const selected = tema === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectTheme(item.id)}
                  className={`text-left rounded-xl border-2 p-3.5 transition cursor-pointer flex flex-col gap-3 ${
                    selected
                      ? "border-blue-600 ring-2 ring-blue-100 bg-blue-50/30"
                      : "border-slate-200 hover:border-slate-300 bg-white"
                  }`}
                >
                  {/* Mini Mockup Desktop + Mobile */}
                  <div
                    className="h-20 rounded-lg border border-slate-200/80 overflow-hidden flex shadow-2xs"
                    style={{ background: item.preview.canvasBg }}
                  >
                    {/* Mini Sidebar */}
                    <div
                      className="w-16 flex flex-col border-r"
                      style={{
                        background: item.preview.sidebarBg,
                        borderColor: item.preview.isDarkSidebar
                          ? "#1e293b"
                          : "#e2e8f0",
                      }}
                    >
                      <div
                        className="h-5 w-full"
                        style={{
                          background: item.preview.headerBg,
                          borderBottom: `2px solid ${item.preview.secondaryAccent}`,
                        }}
                      />
                      <div className="p-1.5 space-y-1">
                        <div
                          className="h-2 rounded-sm w-11"
                          style={{ background: item.preview.accentColor }}
                        />
                        <div
                          className="h-1.5 rounded-sm w-9 opacity-40"
                          style={{
                            background: item.preview.isDarkSidebar
                              ? "#94a3b8"
                              : "#64748b",
                          }}
                        />
                        <div
                          className="h-1.5 rounded-sm w-10 opacity-30"
                          style={{
                            background: item.preview.isDarkSidebar
                              ? "#94a3b8"
                              : "#64748b",
                          }}
                        />
                      </div>
                    </div>

                    {/* Mini Konten */}
                    <div className="flex-1 p-2 flex flex-col justify-between">
                      <div className="flex items-center justify-between gap-1">
                        <div className="h-2 w-16 rounded-sm bg-slate-300/80" />
                        <div
                          className="h-2.5 w-8 rounded-full"
                          style={{ background: item.preview.secondaryAccent }}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        <div className="h-9 rounded bg-white border border-slate-200/80 p-1.5 space-y-1">
                          <div className="h-1.5 w-8 rounded bg-slate-200" />
                          <div
                            className="h-2 w-6 rounded"
                            style={{ background: item.preview.accentColor }}
                          />
                        </div>
                        <div className="h-9 rounded bg-white border border-slate-200/80 p-1.5 space-y-1">
                          <div className="h-1.5 w-8 rounded bg-slate-200" />
                          <div className="h-2 w-10 rounded bg-emerald-500/80" />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Nama & Deskripsi Tema */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-sm text-slate-900">
                        {item.name}
                      </span>
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 inline-flex items-center gap-1 ${
                          selected
                            ? "bg-blue-600 text-white"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {selected && <Check className="w-3 h-3" />}
                        {selected ? "Dipilih" : item.badge}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      {item.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {savedMsg && (
          <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{savedMsg}</span>
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-6 py-2.5 cbt-btn-primary disabled:opacity-60 rounded-xl text-sm font-semibold cursor-pointer shadow-xs"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? "Menyimpan..." : "Simpan Perubahan"}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
