"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { compressImageFile } from "@/lib/image";
import { Save, Upload, CheckCircle2 } from "lucide-react";

export default function AdminPengaturanPage() {
  const supabase = createClient();
  const [namaSekolah, setNamaSekolah] = useState("");
  const [alamatSekolah, setAlamatSekolah] = useState("");
  const [logo, setLogo] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");

  useEffect(() => {
    supabase
      .from("settings")
      .select("kunci, nilai")
      .then(({ data }) => {
        (data || []).forEach((row) => {
          if (row.kunci === "nama_sekolah") setNamaSekolah(row.nilai);
          if (row.kunci === "alamat_sekolah") setAlamatSekolah(row.nilai);
          if (row.kunci === "logo") setLogo(row.nilai);
        });
      });
  }, [supabase]);

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const compressed = await compressImageFile(file, 400, 0.85);
      const ext = file.type === "image/png" ? "png" : "jpg";
      const path = `school/logo-${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from("cbt-assets")
        .upload(path, compressed, { upsert: true, contentType: compressed.type });
      if (error) {
        alert("Gagal upload logo: " + error.message);
      } else {
        const { data } = supabase.storage.from("cbt-assets").getPublicUrl(path);
        setLogo(data.publicUrl);
      }
    } finally {
      setUploading(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSavedMsg("");
    await supabase.from("settings").upsert([
      { kunci: "nama_sekolah", nilai: namaSekolah.trim() },
      { kunci: "alamat_sekolah", nilai: alamatSekolah.trim() },
      { kunci: "logo", nilai: logo.trim() },
    ]);
    setSaving(false);
    setSavedMsg("Identitas sekolah berhasil disimpan.");
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Identitas Sekolah</h1>
        <p className="text-sm text-slate-500">
          Nama dan logo sekolah akan tampil di halaman login, kartu login, daftar hadir, dan rekap nilai.
        </p>
      </div>

      <form
        onSubmit={handleSave}
        className="bg-white rounded-xl border border-slate-200 p-6 space-y-5"
      >
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Nama Sekolah
          </label>
          <input
            type="text"
            required
            value={namaSekolah}
            onChange={(e) => setNamaSekolah(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
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
            className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Logo Sekolah
          </label>
          <div className="flex items-center gap-4">
            {logo ? (
              <img
                src={logo}
                alt="Logo Sekolah"
                className="w-16 h-16 object-contain rounded-lg border border-slate-200 p-1"
              />
            ) : (
              <div className="w-16 h-16 rounded-lg border border-dashed border-slate-300 flex items-center justify-center text-xs text-slate-400">
                Belum ada
              </div>
            )}
            <label className="inline-flex items-center gap-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm font-medium text-slate-700 cursor-pointer">
              <Upload className="w-4 h-4" />
              <span>{uploading ? "Mengunggah..." : "Unggah Logo (PNG/JPG)"}</span>
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

        {savedMsg && (
          <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            <span>{savedMsg}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold cursor-pointer"
        >
          <Save className="w-4 h-4" />
          <span>{saving ? "Menyimpan..." : "Simpan Perubahan"}</span>
        </button>
      </form>
    </div>
  );
}
