"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { AcademicYear, SchoolClass, Subject } from "@/types/cbt";
import { Plus, Trash2, CheckCircle, ArrowUpRight } from "lucide-react";

export default function AdminMasterPage() {
  const supabase = createClient();
  const [tab, setTab] = useState<"kelas" | "mapel" | "ta">("kelas");
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);

  const [newClassName, setNewClassName] = useState("");
  const [newClassYearId, setNewClassYearId] = useState<string>("");
  const [newSubjectName, setNewSubjectName] = useState("");
  const [newYearName, setNewYearName] = useState("");

  // Kenaikan kelas mapping: { [fromKelasId]: toKelasId | 'lulus' }
  const [promoMap, setPromoMap] = useState<Record<number, string>>({});
  const [promoLoading, setPromoLoading] = useState(false);

  const loadAll = useCallback(async () => {
    const [{ data: y }, { data: c }, { data: s }] = await Promise.all([
      supabase.from("academic_years").select("*").order("id", { ascending: false }),
      supabase
        .from("classes")
        .select("*, academic_years(id, nama, aktif)")
        .order("nama"),
      supabase.from("subjects").select("*").order("nama"),
    ]);
    const yList = (y || []) as AcademicYear[];
    setYears(yList);
    setClasses((c || []) as SchoolClass[]);
    setSubjects((s || []) as Subject[]);
    const aktif = yList.find((item) => item.aktif);
    if (aktif && !newClassYearId) setNewClassYearId(String(aktif.id));
  }, [supabase, newClassYearId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  async function addClass(e: React.FormEvent) {
    e.preventDefault();
    if (!newClassName.trim()) return;
    const { error } = await supabase.from("classes").insert({
      nama: newClassName.trim(),
      tahun_ajaran_id: newClassYearId ? Number(newClassYearId) : null,
    });
    if (error) alert(error.message);
    else {
      setNewClassName("");
      loadAll();
    }
  }

  async function deleteClass(id: number) {
    if (!confirm("Hapus kelas ini?")) return;
    const { error } = await supabase.from("classes").delete().eq("id", id);
    if (error) alert(error.message);
    else loadAll();
  }

  async function addSubject(e: React.FormEvent) {
    e.preventDefault();
    if (!newSubjectName.trim()) return;
    const { error } = await supabase
      .from("subjects")
      .insert({ nama: newSubjectName.trim() });
    if (error) alert(error.message);
    else {
      setNewSubjectName("");
      loadAll();
    }
  }

  async function deleteSubject(id: number) {
    if (!confirm("Hapus mata pelajaran ini? Bank soal terkait ikut terhapus.")) return;
    const { error } = await supabase.from("subjects").delete().eq("id", id);
    if (error) alert(error.message);
    else loadAll();
  }

  async function addYear(e: React.FormEvent) {
    e.preventDefault();
    if (!newYearName.trim()) return;
    const { error } = await supabase
      .from("academic_years")
      .insert({ nama: newYearName.trim(), aktif: false });
    if (error) alert(error.message);
    else {
      setNewYearName("");
      loadAll();
    }
  }

  async function activateYear(id: number) {
    await supabase.from("academic_years").update({ aktif: false }).neq("id", 0);
    await supabase.from("academic_years").update({ aktif: true }).eq("id", id);
    loadAll();
  }

  async function runPromotion() {
    const mappings = Object.entries(promoMap)
      .filter(([, target]) => target)
      .map(([fromId, target]) => ({
        from_kelas_id: Number(fromId),
        to_kelas_id: target === "lulus" ? "lulus" : Number(target),
      }));
    if (mappings.length === 0) {
      alert("Pilih minimal satu tujuan kenaikan kelas / lulus.");
      return;
    }
    if (
      !confirm(
        "Jalankan proses kenaikan kelas? Siswa yang ditandai Lulus akan dinonaktifkan akunnya, sedangkan arsip nilai tetap tersimpan."
      )
    ) {
      return;
    }
    setPromoLoading(true);
    try {
      const res = await fetch("/api/admin/promote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mappings }),
      });
      const data = await res.json();
      if (!res.ok) alert(data.error || "Gagal.");
      else {
        alert(
          `Selesai! ${data.promoted} siswa naik kelas, ${data.graduated} siswa diluluskan/diarsipkan.`
        );
        setPromoMap({});
      }
    } finally {
      setPromoLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Kelas, Mata Pelajaran & Tahun Ajaran
        </h1>
        <p className="text-sm text-slate-500">
          Kelola data master sekolah dan proses kenaikan kelas tahun ajaran baru.
        </p>
      </div>

      <div className="flex gap-2 border-b border-slate-200 pb-2">
        {[
          { id: "kelas", label: `Kelas (${classes.length})` },
          { id: "mapel", label: `Mata Pelajaran (${subjects.length})` },
          { id: "ta", label: `Tahun Ajaran & Kenaikan Kelas` },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as typeof tab)}
            className={`px-4 py-2 rounded-lg text-sm font-medium cursor-pointer ${
              tab === t.id
                ? "bg-blue-600 text-white"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "kelas" && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-5">
          <form onSubmit={addClass} className="flex flex-wrap gap-3">
            <input
              type="text"
              required
              value={newClassName}
              onChange={(e) => setNewClassName(e.target.value)}
              placeholder="Nama kelas (misal: X ATPH 1)"
              className="flex-1 min-w-48 px-3 py-2 rounded-lg border border-slate-300 text-sm"
            />
            <select
              value={newClassYearId}
              onChange={(e) => setNewClassYearId(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-300 text-sm"
            >
              <option value="">-- Tahun Ajaran --</option>
              {years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.nama} {y.aktif ? "(Aktif)" : ""}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Tambah Kelas
            </button>
          </form>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="text-left px-4 py-2.5">Nama Kelas</th>
                  <th className="text-left px-4 py-2.5">Tahun Ajaran</th>
                  <th className="text-right px-4 py-2.5">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {classes.map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-2.5 font-medium text-slate-900">{c.nama}</td>
                    <td className="px-4 py-2.5 text-slate-600">
                      {c.academic_years?.nama || "-"}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        onClick={() => deleteClass(c.id)}
                        className="text-red-600 hover:bg-red-50 p-1.5 rounded-lg cursor-pointer"
                        title="Hapus"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {classes.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-6 text-center text-slate-400">
                      Belum ada kelas.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "mapel" && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-5">
          <form onSubmit={addSubject} className="flex flex-wrap gap-3">
            <input
              type="text"
              required
              value={newSubjectName}
              onChange={(e) => setNewSubjectName(e.target.value)}
              placeholder="Nama mata pelajaran (misal: Agribisnis Tanaman Pangan)"
              className="flex-1 min-w-64 px-3 py-2 rounded-lg border border-slate-300 text-sm"
            />
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Tambah Mapel
            </button>
          </form>

          <div className="divide-y divide-slate-100 border border-slate-100 rounded-lg">
            {subjects.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between px-4 py-2.5 text-sm"
              >
                <span className="font-medium text-slate-900">{s.nama}</span>
                <button
                  onClick={() => deleteSubject(s.id)}
                  className="text-red-600 hover:bg-red-50 p-1.5 rounded-lg cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            {subjects.length === 0 && (
              <div className="px-4 py-6 text-center text-slate-400 text-sm">
                Belum ada mata pelajaran.
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "ta" && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
            <h2 className="font-semibold text-slate-900">Daftar Tahun Ajaran</h2>
            <form onSubmit={addYear} className="flex gap-3">
              <input
                type="text"
                required
                value={newYearName}
                onChange={(e) => setNewYearName(e.target.value)}
                placeholder="Misal: 2027/2028"
                className="flex-1 max-w-xs px-3 py-2 rounded-lg border border-slate-300 text-sm"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Tambah TA
              </button>
            </form>

            <div className="divide-y divide-slate-100">
              {years.map((y) => (
                <div
                  key={y.id}
                  className="flex items-center justify-between py-2.5 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-900">{y.nama}</span>
                    {y.aktif && (
                      <span className="px-2 py-0.5 text-xs rounded-full bg-emerald-100 text-emerald-700 font-medium">
                        Aktif
                      </span>
                    )}
                  </div>
                  {!y.aktif && (
                    <button
                      onClick={() => activateYear(y.id)}
                      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline cursor-pointer"
                    >
                      <CheckCircle className="w-3.5 h-3.5" /> Jadikan Aktif
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
            <div>
              <h2 className="font-semibold text-slate-900">
                Kenaikan Kelas & Arsip Siswa Lulus
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Pindahkan siswa aktif ke kelas baru pada awal tahun ajaran, atau tandai Lulus agar akun dinonaktifkan sambil tetap menyimpan arsip nilai.
              </p>
            </div>

            <div className="space-y-2">
              {classes.map((c) => (
                <div
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200 text-sm"
                >
                  <span className="font-medium text-slate-800">
                    {c.nama}{" "}
                    <span className="text-xs text-slate-400">
                      ({c.academic_years?.nama || "-"})
                    </span>
                  </span>
                  <div className="flex items-center gap-2">
                    <ArrowUpRight className="w-4 h-4 text-slate-400" />
                    <select
                      value={promoMap[c.id] || ""}
                      onChange={(e) =>
                        setPromoMap((prev) => ({ ...prev, [c.id]: e.target.value }))
                      }
                      className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-sm"
                    >
                      <option value="">-- Tidak diubah --</option>
                      <option value="lulus">Lulus (Nonaktifkan Akun)</option>
                      {classes
                        .filter((t) => t.id !== c.id)
                        .map((t) => (
                          <option key={t.id} value={t.id}>
                            Naik ke {t.nama} ({t.academic_years?.nama || "-"})
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={runPromotion}
              disabled={promoLoading}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-semibold cursor-pointer"
            >
              {promoLoading ? "Memproses..." : "Proses Kenaikan Kelas"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
