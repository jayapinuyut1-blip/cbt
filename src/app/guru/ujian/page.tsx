"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { generateExamToken } from "@/lib/auth-utils";
import { questionTypeLabel } from "@/lib/format";
import type {
  AcademicYear,
  Exam,
  ExamKind,
  ExamNavigation,
  ExamResultVisibility,
  Question,
  Subject,
} from "@/types/cbt";
import { Plus, Eye, Trash2, Edit3, X } from "lucide-react";

export default function GuruUjianPage() {
  const supabase = createClient();
  const [exams, setExams] = useState<Exam[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [userId, setUserId] = useState<string | null>(null);

  // Modal Form Ujian
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [judul, setJudul] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [tahunAjaranId, setTahunAjaranId] = useState("");
  const [durasi, setDurasi] = useState("60");
  const [kkm, setKkm] = useState("75");
  const [jenis, setJenis] = useState<ExamKind>("resmi");
  const [sourceMode, setSourceMode] = useState<"manual" | "acak">("manual");
  const [jumlahSoalAcak, setJumlahSoalAcak] = useState("20");
  const [acakSoal, setAcakSoal] = useState(true);
  const [acakOpsi, setAcakOpsi] = useState(true);
  const [navigasi, setNavigasi] = useState<ExamNavigation>("bebas");
  const [tampilHasil, setTampilHasil] = useState<ExamResultVisibility>("nilai");
  const [petunjuk, setPetunjuk] = useState(
    "Berdoalah sebelum mengerjakan. Periksa kembali jawaban Anda sebelum mengumpulkan ujian."
  );

  // Soal manual yang dipilih
  const [bankQuestions, setBankQuestions] = useState<Question[]>([]);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);

  const loadAll = useCallback(async () => {
    const [{ data: u }, { data: ex }, { data: sub }, { data: yr }] =
      await Promise.all([
        supabase.auth.getUser(),
        supabase
          .from("exams")
          .select("*, subjects(id, nama)")
          .order("id", { ascending: false }),
        supabase.from("subjects").select("*").order("nama"),
        supabase
          .from("academic_years")
          .select("*")
          .order("id", { ascending: false }),
      ]);
    setUserId(u.user?.id || null);
    setExams((ex || []) as Exam[]);
    setSubjects((sub || []) as Subject[]);
    const yList = (yr || []) as AcademicYear[];
    setYears(yList);
    const activeYr = yList.find((y) => y.aktif);
    if (activeYr && !tahunAjaranId) setTahunAjaranId(String(activeYr.id));
  }, [supabase, tahunAjaranId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!subjectId) {
      setBankQuestions([]);
      return;
    }
    supabase
      .from("questions")
      .select("id, tipe, teks, bobot, subject_id, guru_id, gambar, created_at")
      .eq("subject_id", Number(subjectId))
      .order("id")
      .then(({ data }) => setBankQuestions((data || []) as Question[]));
  }, [supabase, subjectId]);

  function openCreate() {
    setEditingId(null);
    setJudul("");
    setSubjectId(subjects[0] ? String(subjects[0].id) : "");
    setDurasi("60");
    setKkm("75");
    setJenis("resmi");
    setSourceMode("manual");
    setJumlahSoalAcak("20");
    setAcakSoal(true);
    setAcakOpsi(true);
    setNavigasi("bebas");
    setTampilHasil("nilai");
    setPetunjuk(
      "Berdoalah sebelum mengerjakan. Periksa kembali jawaban Anda sebelum mengumpulkan ujian."
    );
    setSelectedQuestionIds([]);
    setShowModal(true);
  }

  async function openEdit(ex: Exam) {
    setEditingId(ex.id);
    setJudul(ex.judul);
    setSubjectId(String(ex.subject_id));
    setTahunAjaranId(ex.tahun_ajaran_id ? String(ex.tahun_ajaran_id) : "");
    setDurasi(String(ex.durasi));
    setKkm(String(ex.kkm));
    setJenis(ex.jenis);
    if (ex.jumlah_soal_acak && ex.jumlah_soal_acak > 0) {
      setSourceMode("acak");
      setJumlahSoalAcak(String(ex.jumlah_soal_acak));
      setSelectedQuestionIds([]);
    } else {
      setSourceMode("manual");
      const { data: eq } = await supabase
        .from("exam_questions")
        .select("question_id")
        .eq("exam_id", ex.id)
        .order("urutan");
      setSelectedQuestionIds((eq || []).map((r) => r.question_id));
    }
    setAcakSoal(ex.acak_soal);
    setAcakOpsi(ex.acak_opsi);
    setNavigasi(ex.navigasi);
    setTampilHasil(ex.tampil_hasil);
    setPetunjuk(ex.petunjuk || "");
    setShowModal(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!judul.trim() || !subjectId) return;
    if (sourceMode === "manual" && selectedQuestionIds.length === 0) {
      alert("Pilih minimal 1 soal dari bank soal, atau gunakan mode Acak dari Bank.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        judul: judul.trim(),
        subject_id: Number(subjectId),
        guru_id: userId,
        tahun_ajaran_id: tahunAjaranId ? Number(tahunAjaranId) : null,
        durasi: Number(durasi) || 60,
        kkm: Number(kkm) || 75,
        jenis,
        jumlah_soal_acak:
          sourceMode === "acak" ? Math.max(1, Number(jumlahSoalAcak) || 10) : null,
        acak_soal: acakSoal,
        acak_opsi: acakOpsi,
        navigasi,
        petunjuk: petunjuk.trim(),
        tampil_hasil: tampilHasil,
      };

      let targetId = editingId;
      if (editingId) {
        const { error } = await supabase
          .from("exams")
          .update(payload)
          .eq("id", editingId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("exams")
          .insert({ ...payload, token: generateExamToken() })
          .select("id")
          .single();
        if (error || !data) throw error || new Error("Gagal membuat ujian");
        targetId = data.id;
      }

      if (targetId) {
        await supabase.from("exam_questions").delete().eq("exam_id", targetId);
        if (sourceMode === "manual" && selectedQuestionIds.length > 0) {
          await supabase.from("exam_questions").insert(
            selectedQuestionIds.map((qid, idx) => ({
              exam_id: targetId,
              question_id: qid,
              urutan: idx + 1,
            }))
          );
        }
      }

      setShowModal(false);
      loadAll();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Gagal menyimpan ujian.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteExam(id: number, title: string) {
    if (!confirm(`Hapus ujian "${title}" beserta seluruh riwayat nilainya?`)) return;
    await supabase.from("exams").delete().eq("id", id);
    loadAll();
  }

  function toggleQuestion(qid: number) {
    setSelectedQuestionIds((prev) =>
      prev.includes(qid) ? prev.filter((id) => id !== qid) : [...prev, qid]
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Kelola Ujian</h1>
          <p className="text-sm text-slate-500">
            Susun paket ujian resmi atau latihan dan pratinjau tampilan siswa sebelum dijadwalkan Admin.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold cursor-pointer"
        >
          <Plus className="w-4 h-4" /> Buat Ujian Baru
        </button>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {exams.map((ex) => (
          <div
            key={ex.id}
            className="bg-white rounded-xl border border-slate-200 p-5 space-y-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      ex.jenis === "latihan"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-blue-100 text-blue-700"
                    }`}
                  >
                    {ex.jenis === "latihan" ? "Latihan" : "Resmi"}
                  </span>
                  <span className="text-xs text-slate-500">
                    {ex.subjects?.nama}
                  </span>
                </div>
                <h2 className="font-bold text-slate-900 mt-1">{ex.judul}</h2>
              </div>
              <span className="font-mono text-xs font-bold px-2 py-1 rounded bg-slate-100 text-slate-700">
                Token: {ex.token}
              </span>
            </div>

            <div className="text-xs text-slate-600 flex flex-wrap gap-x-4 gap-y-1">
              <span>Durasi: {ex.durasi} mnt</span>
              <span>KKM: {ex.kkm}</span>
              <span>
                Soal:{" "}
                {ex.jumlah_soal_acak
                  ? `${ex.jumlah_soal_acak} acak dari bank`
                  : "Pilihan manual"}
              </span>
              <span>
                Navigasi: {ex.navigasi === "bebas" ? "Bebas" : "Berurutan"}
              </span>
              <span>
                Hasil:{" "}
                {ex.tampil_hasil === "tidak"
                  ? "Disembunyikan"
                  : ex.tampil_hasil === "nilai"
                  ? "Nilai saja"
                  : "Nilai + Kunci"}
              </span>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <Link
                href={`/guru/ujian/${ex.id}/preview`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold"
              >
                <Eye className="w-3.5 h-3.5" /> Pratinjau Tampilan Siswa
              </Link>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => openEdit(ex)}
                  className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 cursor-pointer"
                  title="Edit Ujian"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => deleteExam(ex.id, ex.judul)}
                  className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 cursor-pointer"
                  title="Hapus Ujian"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
        {exams.length === 0 && (
          <div className="md:col-span-2 bg-white rounded-xl border border-slate-200 p-10 text-center text-slate-400 text-sm">
            Belum ada paket ujian. Klik &quot;Buat Ujian Baru&quot; untuk memulai.
          </div>
        )}
      </div>

      {/* Modal Buat / Ubah Ujian */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-lg text-slate-900">
                {editingId ? "Edit Paket Ujian" : "Buat Paket Ujian Baru"}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Judul Ujian
                  </label>
                  <input
                    type="text"
                    required
                    value={judul}
                    onChange={(e) => setJudul(e.target.value)}
                    placeholder="Misal: Penilaian Akhir Semester Ganjil - ATPH"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Mata Pelajaran
                  </label>
                  <select
                    required
                    value={subjectId}
                    onChange={(e) => {
                      setSubjectId(e.target.value);
                      setSelectedQuestionIds([]);
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  >
                    <option value="">-- Pilih Mapel --</option>
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nama}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Tahun Ajaran
                  </label>
                  <select
                    value={tahunAjaranId}
                    onChange={(e) => setTahunAjaranId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  >
                    <option value="">-- Pilih TA --</option>
                    {years.map((y) => (
                      <option key={y.id} value={y.id}>
                        {y.nama} {y.aktif ? "(Aktif)" : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Durasi (Menit)
                  </label>
                  <input
                    type="number"
                    min={5}
                    required
                    value={durasi}
                    onChange={(e) => setDurasi(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    KKM
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    required
                    value={kkm}
                    onChange={(e) => setKkm(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Jenis Ujian
                  </label>
                  <select
                    value={jenis}
                    onChange={(e) => setJenis(e.target.value as ExamKind)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  >
                    <option value="resmi">Ujian Resmi</option>
                    <option value="latihan">
                      Latihan (Nilai & kunci langsung tampil setelah kumpul)
                    </option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Mode Navigasi Siswa
                  </label>
                  <select
                    value={navigasi}
                    onChange={(e) =>
                      setNavigasi(e.target.value as ExamNavigation)
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  >
                    <option value="bebas">Bebas (Boleh lompat & kembali)</option>
                    <option value="berurutan">
                      Berurutan (Tidak bisa kembali ke soal sebelumnya)
                    </option>
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Yang Boleh Dilihat Siswa Setelah Ujian
                  </label>
                  <select
                    value={tampilHasil}
                    onChange={(e) =>
                      setTampilHasil(e.target.value as ExamResultVisibility)
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  >
                    <option value="tidak">Tidak ada (Hanya ucapan terima kasih)</option>
                    <option value="nilai">Nilai saja</option>
                    <option value="nilai_kunci">Nilai beserta jawaban benar</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap gap-5 text-sm">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={acakSoal}
                    onChange={(e) => setAcakSoal(e.target.checked)}
                  />
                  <span>Acak urutan soal</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={acakOpsi}
                    onChange={(e) => setAcakOpsi(e.target.checked)}
                  />
                  <span>Acak urutan opsi jawaban</span>
                </label>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Petunjuk Pengerjaan
                </label>
                <textarea
                  rows={2}
                  value={petunjuk}
                  onChange={(e) => setPetunjuk(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </div>

              {/* Pemilihan Soal */}
              <div className="border-t border-slate-200 pt-4 space-y-3">
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setSourceMode("manual")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                      sourceMode === "manual"
                        ? "bg-blue-600 text-white"
                        : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    Pilih Soal Manual ({selectedQuestionIds.length} dipilih)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSourceMode("acak")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                      sourceMode === "acak"
                        ? "bg-blue-600 text-white"
                        : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    Ambil Sejumlah Soal Acak dari Bank ({bankQuestions.length} tersedia)
                  </button>
                </div>

                {sourceMode === "acak" ? (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Jumlah soal acak yang diambil untuk tiap siswa (maks{" "}
                      {bankQuestions.length})
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={Math.max(1, bankQuestions.length)}
                      value={jumlahSoalAcak}
                      onChange={(e) => setJumlahSoalAcak(e.target.value)}
                      className="w-40 px-3 py-2 rounded-lg border border-slate-300 text-sm"
                    />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-500">
                        Centang soal yang dimasukkan ke ujian ini:
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedQuestionIds(
                            selectedQuestionIds.length === bankQuestions.length
                              ? []
                              : bankQuestions.map((q) => q.id)
                          )
                        }
                        className="text-blue-600 hover:underline cursor-pointer"
                      >
                        {selectedQuestionIds.length === bankQuestions.length
                          ? "Batal Pilih Semua"
                          : "Pilih Semua"}
                      </button>
                    </div>
                    <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                      {bankQuestions.map((q, idx) => (
                        <label
                          key={q.id}
                          className="flex items-start gap-2.5 p-2.5 text-xs hover:bg-slate-50 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            className="mt-0.5"
                            checked={selectedQuestionIds.includes(q.id)}
                            onChange={() => toggleQuestion(q.id)}
                          />
                          <div className="min-w-0">
                            <span className="font-semibold text-blue-700 mr-1.5">
                              [{questionTypeLabel(q.tipe)}]
                            </span>
                            <span className="text-slate-800 line-clamp-2">
                              {idx + 1}. {q.teks}
                            </span>
                          </div>
                        </label>
                      ))}
                      {bankQuestions.length === 0 && (
                        <div className="p-4 text-center text-slate-400 text-xs">
                          Belum ada soal di bank soal mapel ini.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm font-medium cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold cursor-pointer"
                >
                  {saving ? "Menyimpan..." : "Simpan Ujian"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
