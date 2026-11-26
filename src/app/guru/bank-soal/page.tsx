"use client";

import { useCallback, useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/client";
import { compressImageFile } from "@/lib/image";
import { questionTypeLabel } from "@/lib/format";
import { fetchAllowedSubjectsForCurrentUser } from "@/lib/teacher-subjects";
import AiQuestionModal from "@/components/AiQuestionModal";
import type { Question, QuestionType, Subject } from "@/types/cbt";
import {
  Plus,
  Upload,
  Download,
  Trash2,
  Edit3,
  Image as ImageIcon,
  X,
  Sparkles,
} from "lucide-react";

interface DraftOption {
  teks: string;
  pasangan: string;
  benar: boolean;
}

const DEFAULT_PG_OPTIONS = (): DraftOption[] => [
  { teks: "", pasangan: "", benar: true },
  { teks: "", pasangan: "", benar: false },
  { teks: "", pasangan: "", benar: false },
  { teks: "", pasangan: "", benar: false },
  { teks: "", pasangan: "", benar: false },
];

export default function GuruBankSoalPage() {
  const supabase = createClient();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [userId, setUserId] = useState<string | null>(null);

  // Modal Form Soal
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [tipe, setTipe] = useState<QuestionType>("pg");
  const [teks, setTeks] = useState("");
  const [bobot, setBobot] = useState("1");
  const [gambar, setGambar] = useState("");
  const [options, setOptions] = useState<DraftOption[]>(DEFAULT_PG_OPTIONS());
  const [uploadingImg, setUploadingImg] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);

  useEffect(() => {
    fetchAllowedSubjectsForCurrentUser(supabase).then(({ userId: uid, subjects: list }) => {
      setUserId(uid);
      setSubjects(list);
      if (list[0]) setSelectedSubjectId(String(list[0].id));
    });
  }, [supabase]);

  const loadQuestions = useCallback(async () => {
    if (!selectedSubjectId) {
      setQuestions([]);
      return;
    }
    let query = supabase
      .from("questions")
      .select("*, question_options(*)")
      .eq("subject_id", Number(selectedSubjectId))
      .order("id", { ascending: false });

    if (typeFilter) query = query.eq("tipe", typeFilter);

    const { data } = await query;
    const normalized = ((data || []) as Question[]).map((q) => ({
      ...q,
      question_options: [...(q.question_options || [])].sort(
        (a, b) => a.urutan - b.urutan
      ),
    }));
    setQuestions(normalized);
  }, [supabase, selectedSubjectId, typeFilter]);

  useEffect(() => {
    loadQuestions();
  }, [loadQuestions]);

  function openNewModal() {
    setEditingId(null);
    setTipe("pg");
    setTeks("");
    setBobot("1");
    setGambar("");
    setOptions(DEFAULT_PG_OPTIONS());
    setShowModal(true);
  }

  function openEditModal(q: Question) {
    setEditingId(q.id);
    setTipe(q.tipe);
    setTeks(q.teks);
    setBobot(String(q.bobot));
    setGambar(q.gambar || "");
    if (q.tipe === "pg") {
      const existing = (q.question_options || []).map((o) => ({
        teks: o.teks,
        pasangan: "",
        benar: o.benar,
      }));
      while (existing.length < 4) existing.push({ teks: "", pasangan: "", benar: false });
      setOptions(existing);
    } else if (q.tipe === "isian") {
      setOptions(
        (q.question_options || []).length > 0
          ? (q.question_options || []).map((o) => ({
              teks: o.teks,
              pasangan: "",
              benar: true,
            }))
          : [{ teks: "", pasangan: "", benar: true }]
      );
    } else if (q.tipe === "jodoh") {
      setOptions(
        (q.question_options || []).length > 0
          ? (q.question_options || []).map((o) => ({
              teks: o.teks,
              pasangan: o.pasangan || "",
              benar: true,
            }))
          : [
              { teks: "", pasangan: "", benar: true },
              { teks: "", pasangan: "", benar: true },
            ]
      );
    } else {
      setOptions([]);
    }
    setShowModal(true);
  }

  function handleChangeType(nextType: QuestionType) {
    setTipe(nextType);
    if (nextType === "pg") setOptions(DEFAULT_PG_OPTIONS());
    else if (nextType === "isian")
      setOptions([{ teks: "", pasangan: "", benar: true }]);
    else if (nextType === "jodoh")
      setOptions([
        { teks: "", pasangan: "", benar: true },
        { teks: "", pasangan: "", benar: true },
        { teks: "", pasangan: "", benar: true },
      ]);
    else setOptions([]);
  }

  async function handleUploadImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImg(true);
    try {
      const compressed = await compressImageFile(file, 1200, 0.8);
      const ext = file.type === "image/png" ? "png" : "jpg";
      const path = `questions/q-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 7)}.${ext}`;
      const { error } = await supabase.storage
        .from("cbt-assets")
        .upload(path, compressed, { contentType: compressed.type });
      if (error) alert("Gagal upload gambar: " + error.message);
      else {
        const { data } = supabase.storage.from("cbt-assets").getPublicUrl(path);
        setGambar(data.publicUrl);
      }
    } finally {
      setUploadingImg(false);
    }
  }

  async function handleSaveQuestion(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSubjectId || !teks.trim()) return;

    // Validasi opsi sesuai tipe
    let cleanOpts: Array<{
      urutan: number;
      teks: string;
      pasangan: string | null;
      benar: boolean;
    }> = [];

    if (tipe === "pg") {
      const filled = options.filter((o) => o.teks.trim() !== "");
      if (filled.length < 2) {
        alert("Minimal isi 2 opsi jawaban untuk Pilihan Ganda.");
        return;
      }
      if (!filled.some((o) => o.benar)) {
        alert("Pilih satu jawaban yang benar.");
        return;
      }
      cleanOpts = filled.map((o, i) => ({
        urutan: i + 1,
        teks: o.teks.trim(),
        pasangan: null,
        benar: o.benar,
      }));
    } else if (tipe === "isian") {
      const filled = options.filter((o) => o.teks.trim() !== "");
      if (filled.length === 0) {
        alert("Masukkan minimal satu kunci jawaban isian.");
        return;
      }
      cleanOpts = filled.map((o, i) => ({
        urutan: i + 1,
        teks: o.teks.trim(),
        pasangan: null,
        benar: true,
      }));
    } else if (tipe === "jodoh") {
      const filled = options.filter(
        (o) => o.teks.trim() !== "" && o.pasangan.trim() !== ""
      );
      if (filled.length < 2) {
        alert("Masukkan minimal 2 pasangan item kiri dan kanan.");
        return;
      }
      cleanOpts = filled.map((o, i) => ({
        urutan: i + 1,
        teks: o.teks.trim(),
        pasangan: o.pasangan.trim(),
        benar: true,
      }));
    }

    setSaving(true);
    try {
      let qId = editingId;
      if (editingId) {
        const { error } = await supabase
          .from("questions")
          .update({
            tipe,
            teks: teks.trim(),
            gambar: gambar.trim() || null,
            bobot: Number(bobot) || 1,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingId);
        if (error) throw error;
        await supabase.from("question_options").delete().eq("question_id", editingId);
      } else {
        const { data, error } = await supabase
          .from("questions")
          .insert({
            subject_id: Number(selectedSubjectId),
            guru_id: userId,
            tipe,
            teks: teks.trim(),
            gambar: gambar.trim() || null,
            bobot: Number(bobot) || 1,
          })
          .select("id")
          .single();
        if (error || !data) throw error || new Error("Gagal simpan soal");
        qId = data.id;
      }

      if (cleanOpts.length > 0 && qId) {
        const { error: optErr } = await supabase
          .from("question_options")
          .insert(cleanOpts.map((o) => ({ ...o, question_id: qId })));
        if (optErr) throw optErr;
      }

      setShowModal(false);
      loadQuestions();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Gagal menyimpan soal.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteQuestion(id: number) {
    if (!confirm("Hapus soal ini dari bank soal?")) return;
    await supabase.from("questions").delete().eq("id", id);
    loadQuestions();
  }

  function downloadTemplate() {
    const sample = [
      {
        Tipe: "pg",
        Pertanyaan: "Apa tujuan utama pengolahan tanah sebelum penanaman?",
        Bobot: 1,
        Opsi_A: "Membunuh semua mikroba tanah",
        Opsi_B: "Menggemburkan tanah dan memperbaiki aerasi",
        Opsi_C: "Mengurangi kadar air secara drastis",
        Opsi_D: "Memadatkan lapisan tanah",
        Opsi_E: "Mengubah warna tanah",
        Kunci: "B",
        Pasangan: "",
      },
      {
        Tipe: "pg",
        Pertanyaan: "Teknik pembiakan vegetatif dengan menyambung pucuk batang atas dan batang bawah disebut...",
        Bobot: 1,
        Opsi_A: "Mencangkok",
        Opsi_B: "Menyetek",
        Opsi_C: "Mengenten (Grafting)",
        Opsi_D: "Merunduk",
        Opsi_E: "Okulasi",
        Kunci: "C",
        Pasangan: "",
      },
      {
        Tipe: "isian",
        Pertanyaan: "Proses pembuatan makanan pada tumbuhan dengan bantuan cahaya matahari disebut...",
        Bobot: 2,
        Opsi_A: "",
        Opsi_B: "",
        Opsi_C: "",
        Opsi_D: "",
        Opsi_E: "",
        Kunci: "fotosintesis|photosynthesis",
        Pasangan: "",
      },
      {
        Tipe: "jodoh",
        Pertanyaan: "Pasangkan jenis pupuk berikut dengan unsur hara utamanya:",
        Bobot: 3,
        Opsi_A: "",
        Opsi_B: "",
        Opsi_C: "",
        Opsi_D: "",
        Opsi_E: "",
        Kunci: "",
        Pasangan: "Urea=Nitrogen|SP-36=Fosfor|KCl=Kalium",
      },
      {
        Tipe: "essay",
        Pertanyaan: "Jelaskan langkah-langkah penyemaian benih tanaman hortikultura yang baik!",
        Bobot: 5,
        Opsi_A: "",
        Opsi_B: "",
        Opsi_C: "",
        Opsi_D: "",
        Opsi_E: "",
        Kunci: "",
        Pasangan: "",
      },
    ];
    const ws = XLSX.utils.json_to_sheet(sample);
    ws["!cols"] = [
      { wch: 10 },
      { wch: 52 },
      { wch: 8 },
      { wch: 24 },
      { wch: 24 },
      { wch: 24 },
      { wch: 24 },
      { wch: 24 },
      { wch: 24 },
      { wch: 42 },
    ];

    const guide = [
      { Kolom: "Tipe", Keterangan: "Wajib diisi salah satu: pg | isian | jodoh | essay (huruf kecil)." },
      { Kolom: "Pertanyaan", Keterangan: "Teks soal lengkap. Jika soal butuh gambar, tambahkan gambar setelah impor." },
      { Kolom: "Bobot", Keterangan: "Angka bobot nilai soal (contoh: PG=1, Isian=2, Jodoh=3, Essay=5)." },
      { Kolom: "Opsi_A s.d. Opsi_E", Keterangan: "Khusus tipe pg. Kosongkan Opsi_E jika hanya 4 pilihan (A-D)." },
      { Kolom: "Kunci", Keterangan: "Untuk pg: isi huruf A/B/C/D/E. Untuk isian: isi kunci jawaban, pisahkan variasi dengan tanda | (contoh: fotosintesis|photosynthesis)." },
      { Kolom: "Pasangan", Keterangan: "Khusus tipe jodoh: format Kiri=Kanan dan pisahkan antar pasangan dengan | (contoh: Urea=Nitrogen|KCl=Kalium)." },
      { Kolom: "Tips", Keterangan: "Jangan ubah nama judul kolom di baris pertama sheet 'Template Soal'." },
    ];
    const wsGuide = XLSX.utils.json_to_sheet(guide);
    wsGuide["!cols"] = [{ wch: 20 }, { wch: 95 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template Soal");
    XLSX.utils.book_append_sheet(wb, wsGuide, "Panduan Pengisian");
    XLSX.writeFile(wb, "template-bank-soal-cbt.xlsx");
  }

  function exportBankSoal() {
    const rows = questions.map((q) => {
      const opts = q.question_options || [];
      if (q.tipe === "pg") {
        const letters = ["A", "B", "C", "D", "E"];
        const kunciIdx = opts.findIndex((o) => o.benar);
        return {
          Tipe: "pg",
          Pertanyaan: q.teks,
          Bobot: q.bobot,
          Opsi_A: opts[0]?.teks || "",
          Opsi_B: opts[1]?.teks || "",
          Opsi_C: opts[2]?.teks || "",
          Opsi_D: opts[3]?.teks || "",
          Opsi_E: opts[4]?.teks || "",
          Kunci: kunciIdx >= 0 ? letters[kunciIdx] : "",
          Pasangan: "",
        };
      }
      if (q.tipe === "isian") {
        return {
          Tipe: "isian",
          Pertanyaan: q.teks,
          Bobot: q.bobot,
          Opsi_A: "",
          Opsi_B: "",
          Opsi_C: "",
          Opsi_D: "",
          Opsi_E: "",
          Kunci: opts.map((o) => o.teks).join("|"),
          Pasangan: "",
        };
      }
      if (q.tipe === "jodoh") {
        return {
          Tipe: "jodoh",
          Pertanyaan: q.teks,
          Bobot: q.bobot,
          Opsi_A: "",
          Opsi_B: "",
          Opsi_C: "",
          Opsi_D: "",
          Opsi_E: "",
          Kunci: "",
          Pasangan: opts.map((o) => `${o.teks}=${o.pasangan || ""}`).join("|"),
        };
      }
      return {
        Tipe: "essay",
        Pertanyaan: q.teks,
        Bobot: q.bobot,
        Opsi_A: "",
        Opsi_B: "",
        Opsi_C: "",
        Opsi_D: "",
        Opsi_E: "",
        Kunci: "",
        Pasangan: "",
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Bank Soal");
    const subj = subjects.find((s) => String(s.id) === selectedSubjectId);
    XLSX.writeFile(
      wb,
      `bank-soal-${(subj?.nama || "mapel").replace(/[^a-zA-Z0-9_-]/g, "_")}.xlsx`
    );
  }

  async function handleExcelImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !selectedSubjectId) return;
    setImporting(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

      let okCount = 0;
      for (const r of rows) {
        const rawTipe = String(r.Tipe ?? r.tipe ?? "pg").trim().toLowerCase() as QuestionType;
        if (!["pg", "isian", "jodoh", "essay"].includes(rawTipe)) continue;
        const pertanyaan = String(r.Pertanyaan ?? r.pertanyaan ?? "").trim();
        if (!pertanyaan) continue;
        const qBobot = Number(r.Bobot ?? r.bobot ?? 1) || 1;

        const { data: qRow, error: qErr } = await supabase
          .from("questions")
          .insert({
            subject_id: Number(selectedSubjectId),
            guru_id: userId,
            tipe: rawTipe,
            teks: pertanyaan,
            bobot: qBobot,
          })
          .select("id")
          .single();

        if (qErr || !qRow) continue;

        const optsInsert: Array<{
          question_id: number;
          urutan: number;
          teks: string;
          pasangan: string | null;
          benar: boolean;
        }> = [];

        if (rawTipe === "pg") {
          const letters = ["A", "B", "C", "D", "E"];
          const kunci = String(r.Kunci ?? r.kunci ?? "A").trim().toUpperCase();
          letters.forEach((L, idx) => {
            const val = String(r[`Opsi_${L}`] ?? r[`opsi_${L.toLowerCase()}`] ?? "").trim();
            if (val) {
              optsInsert.push({
                question_id: qRow.id,
                urutan: idx + 1,
                teks: val,
                pasangan: null,
                benar: kunci === L,
              });
            }
          });
        } else if (rawTipe === "isian") {
          const keys = String(r.Kunci ?? r.kunci ?? "")
            .split("|")
            .map((k) => k.trim())
            .filter(Boolean);
          keys.forEach((k, idx) => {
            optsInsert.push({
              question_id: qRow.id,
              urutan: idx + 1,
              teks: k,
              pasangan: null,
              benar: true,
            });
          });
        } else if (rawTipe === "jodoh") {
          const pairs = String(r.Pasangan ?? r.pasangan ?? "")
            .split("|")
            .map((p) => p.trim())
            .filter(Boolean);
          pairs.forEach((pair, idx) => {
            const [kiri, kanan] = pair.split("=").map((x) => x.trim());
            if (kiri && kanan) {
              optsInsert.push({
                question_id: qRow.id,
                urutan: idx + 1,
                teks: kiri,
                pasangan: kanan,
                benar: true,
              });
            }
          });
        }

        if (optsInsert.length > 0) {
          await supabase.from("question_options").insert(optsInsert);
        }
        okCount++;
      }

      alert(`Berhasil mengimpor ${okCount} soal ke bank soal.`);
      loadQuestions();
    } catch {
      alert("Gagal membaca file Excel.");
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Bank Soal</h1>
          <p className="text-sm text-slate-500">
            Kelola soal Pilihan Ganda, Isian Singkat, Menjodohkan, dan Essay per mata pelajaran.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowAiModal(true)}
            disabled={!selectedSubjectId}
            className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-300 text-white rounded-lg text-sm font-semibold cursor-pointer"
          >
            <Sparkles className="w-4 h-4" /> Buat Soal dengan AI
          </button>
          <button
            onClick={openNewModal}
            disabled={!selectedSubjectId}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-lg text-sm font-semibold cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Tambah Soal
          </button>
        </div>
      </div>

      {/* Filter & Impor/Ekspor */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-wrap items-center gap-3">
        <select
          value={selectedSubjectId}
          onChange={(e) => setSelectedSubjectId(e.target.value)}
          className="flex-1 min-w-52 px-3 py-2 rounded-lg border border-slate-300 text-sm"
        >
          <option value="">-- Pilih Mata Pelajaran --</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nama}
            </option>
          ))}
        </select>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-2 rounded-lg border border-slate-300 text-sm"
        >
          <option value="">Semua Tipe ({questions.length})</option>
          <option value="pg">Pilihan Ganda</option>
          <option value="isian">Isian Singkat</option>
          <option value="jodoh">Menjodohkan</option>
          <option value="essay">Essay</option>
        </select>

        <button
          onClick={downloadTemplate}
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" /> Template Excel
        </button>

        <label className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium cursor-pointer">
          <Upload className="w-3.5 h-3.5" />
          <span>{importing ? "Mengimpor..." : "Impor Excel"}</span>
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={handleExcelImport}
            disabled={importing || !selectedSubjectId}
          />
        </label>

        <button
          onClick={exportBankSoal}
          disabled={questions.length === 0}
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-900 disabled:bg-slate-300 text-white rounded-lg text-xs font-medium cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" /> Ekspor Excel
        </button>
      </div>

      {/* Daftar Soal */}
      <div className="space-y-3">
        {questions.map((q, idx) => (
          <div
            key={q.id}
            className="bg-white rounded-xl border border-slate-200 p-4 space-y-2.5"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                  #{idx + 1}
                </span>
                <span className="text-xs font-medium px-2 py-0.5 rounded bg-blue-50 text-blue-700">
                  {questionTypeLabel(q.tipe)}
                </span>
                <span className="text-xs text-slate-500">Bobot: {q.bobot}</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => openEditModal(q)}
                  className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 cursor-pointer"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => deleteQuestion(q.id)}
                  className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="text-sm text-slate-900 whitespace-pre-wrap">
              {q.teks}
            </div>

            {q.gambar && (
              <img
                src={q.gambar}
                alt="Gambar soal"
                className="max-h-48 rounded-lg border border-slate-200"
              />
            )}

            {q.tipe === "pg" && (
              <div className="grid sm:grid-cols-2 gap-1.5 pt-1">
                {(q.question_options || []).map((o, i) => (
                  <div
                    key={o.id}
                    className={`text-xs px-2.5 py-1.5 rounded border ${
                      o.benar
                        ? "bg-emerald-50 border-emerald-300 text-emerald-900 font-semibold"
                        : "bg-slate-50 border-slate-200 text-slate-700"
                    }`}
                  >
                    {String.fromCharCode(65 + i)}. {o.teks}
                  </div>
                ))}
              </div>
            )}

            {q.tipe === "isian" && (
              <div className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded">
                <strong>Kunci Jawaban:</strong>{" "}
                {(q.question_options || []).map((o) => o.teks).join(" / ")}
              </div>
            )}

            {q.tipe === "jodoh" && (
              <div className="grid sm:grid-cols-2 gap-1.5 pt-1 text-xs">
                {(q.question_options || []).map((o) => (
                  <div
                    key={o.id}
                    className="px-2.5 py-1.5 rounded bg-slate-50 border border-slate-200"
                  >
                    <span className="font-medium">{o.teks}</span> →{" "}
                    <span className="text-emerald-700 font-semibold">
                      {o.pasangan}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {questions.length === 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-slate-400 text-sm">
            Belum ada soal pada mata pelajaran ini. Klik &quot;Tambah Soal&quot; atau &quot;Impor Excel&quot;.
          </div>
        )}
      </div>

      {/* Modal Tambah / Ubah Soal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-lg text-slate-900">
                {editingId ? "Ubah Soal" : "Tambah Soal Baru"}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveQuestion} className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Tipe Soal
                  </label>
                  <select
                    value={tipe}
                    onChange={(e) =>
                      handleChangeType(e.target.value as QuestionType)
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  >
                    <option value="pg">Pilihan Ganda (A–E)</option>
                    <option value="isian">Isian Singkat</option>
                    <option value="jodoh">Menjodohkan</option>
                    <option value="essay">Essay</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Bobot Skor
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0.5"
                    required
                    value={bobot}
                    onChange={(e) => setBobot(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Teks Pertanyaan
                </label>
                <textarea
                  rows={4}
                  required
                  value={teks}
                  onChange={(e) => setTeks(e.target.value)}
                  placeholder="Tuliskan pertanyaan soal..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </div>

              {/* Gambar Opsional (1 gambar per soal) */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Gambar Soal (Opsional, maks 1 gambar)
                </label>
                <div className="flex items-center gap-3">
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-medium cursor-pointer">
                    <ImageIcon className="w-4 h-4" />
                    <span>{uploadingImg ? "Mengunggah..." : "Pilih Gambar"}</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={handleUploadImage}
                      disabled={uploadingImg}
                    />
                  </label>
                  {gambar && (
                    <button
                      type="button"
                      onClick={() => setGambar("")}
                      className="text-xs text-red-600 hover:underline cursor-pointer"
                    >
                      Hapus Gambar
                    </button>
                  )}
                </div>
                {gambar && (
                  <img
                    src={gambar}
                    alt="Preview"
                    className="mt-2 max-h-40 rounded-lg border border-slate-200"
                  />
                )}
              </div>

              {/* Opsi dinamis sesuai tipe */}
              {tipe === "pg" && (
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-slate-700">
                    Opsi Jawaban (Centang bulatan untuk kunci yang benar)
                  </label>
                  {options.map((opt, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="pg_correct"
                        checked={opt.benar}
                        onChange={() =>
                          setOptions((prev) =>
                            prev.map((p, idx) => ({ ...p, benar: idx === i }))
                          )
                        }
                      />
                      <span className="text-xs font-bold w-5">
                        {String.fromCharCode(65 + i)}.
                      </span>
                      <input
                        type="text"
                        value={opt.teks}
                        onChange={(e) =>
                          setOptions((prev) =>
                            prev.map((p, idx) =>
                              idx === i ? { ...p, teks: e.target.value } : p
                            )
                          )
                        }
                        placeholder={`Opsi ${String.fromCharCode(65 + i)}`}
                        className="flex-1 px-3 py-1.5 rounded-lg border border-slate-300 text-sm"
                      />
                    </div>
                  ))}
                </div>
              )}

              {tipe === "isian" && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-medium text-slate-700">
                      Kunci Jawaban Benar (boleh lebih dari satu; huruf besar/kecil & spasi diabaikan)
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        setOptions((prev) => [
                          ...prev,
                          { teks: "", pasangan: "", benar: true },
                        ])
                      }
                      className="text-xs text-blue-600 hover:underline cursor-pointer"
                    >
                      + Tambah Variasi Kunci
                    </button>
                  </div>
                  {options.map((opt, i) => (
                    <div key={i} className="flex gap-2">
                      <input
                        type="text"
                        value={opt.teks}
                        onChange={(e) =>
                          setOptions((prev) =>
                            prev.map((p, idx) =>
                              idx === i ? { ...p, teks: e.target.value } : p
                            )
                          )
                        }
                        placeholder={`Kunci jawaban ${i + 1}`}
                        className="flex-1 px-3 py-1.5 rounded-lg border border-slate-300 text-sm"
                      />
                      {options.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setOptions((prev) => prev.filter((_, idx) => idx !== i))
                          }
                          className="text-red-500 px-2"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {tipe === "jodoh" && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-medium text-slate-700">
                      Pasangan Item Kiri dan Item Kanan
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        setOptions((prev) => [
                          ...prev,
                          { teks: "", pasangan: "", benar: true },
                        ])
                      }
                      className="text-xs text-blue-600 hover:underline cursor-pointer"
                    >
                      + Tambah Pasangan
                    </button>
                  </div>
                  {options.map((opt, i) => (
                    <div key={i} className="grid grid-cols-12 gap-2 items-center">
                      <input
                        type="text"
                        value={opt.teks}
                        onChange={(e) =>
                          setOptions((prev) =>
                            prev.map((p, idx) =>
                              idx === i ? { ...p, teks: e.target.value } : p
                            )
                          )
                        }
                        placeholder={`Item kiri ${i + 1}`}
                        className="col-span-5 px-3 py-1.5 rounded-lg border border-slate-300 text-sm"
                      />
                      <span className="col-span-1 text-center text-slate-400">→</span>
                      <input
                        type="text"
                        value={opt.pasangan}
                        onChange={(e) =>
                          setOptions((prev) =>
                            prev.map((p, idx) =>
                              idx === i ? { ...p, pasangan: e.target.value } : p
                            )
                          )
                        }
                        placeholder={`Pasangan kanan ${i + 1}`}
                        className="col-span-5 px-3 py-1.5 rounded-lg border border-slate-300 text-sm"
                      />
                      {options.length > 2 && (
                        <button
                          type="button"
                          onClick={() =>
                            setOptions((prev) => prev.filter((_, idx) => idx !== i))
                          }
                          className="col-span-1 text-red-500 flex justify-center"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

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
                  {saving ? "Menyimpan..." : "Simpan Soal"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Modal Mode AI Generator Soal */}
      {showAiModal && selectedSubjectId && (
        <AiQuestionModal
          subjectId={Number(selectedSubjectId)}
          subjectName={
            subjects.find((s) => String(s.id) === selectedSubjectId)?.nama ||
            "Mata Pelajaran"
          }
          userId={userId}
          onClose={() => setShowAiModal(false)}
          onSaved={() => loadQuestions()}
        />
      )}
    </div>
  );
}
