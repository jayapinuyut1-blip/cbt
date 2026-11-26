"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/client";
import { questionTypeLabel } from "@/lib/format";
import {
  GRADE_LABELS,
  getCapaianForSubject,
  type GradeOption,
} from "@/lib/capaian-pembelajaran";
import type { Subject } from "@/types/cbt";
import type { GeneratedQuestion } from "@/app/api/guru/generate-questions/route";
import {
  Sparkles,
  X,
  Copy,
  Check,
  Download,
  Save,
  Trash2,
  Loader2,
  ClipboardPaste,
  BookOpenCheck,
} from "lucide-react";

export function buildExcelWorkbookFromGenerated(
  items: GeneratedQuestion[],
  sheetName = "Bank Soal"
) {
  const letters = ["A", "B", "C", "D", "E"];
  const rows = items.map((q) => {
    if (q.tipe === "pg") {
      const opts = q.opsi_pg || [];
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
        Kunci: kunciIdx >= 0 ? letters[kunciIdx] : "A",
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
        Kunci: (q.kunci_isian || []).join("|"),
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
        Pasangan: (q.pasangan_jodoh || [])
          .map((p) => `${p.kiri}=${p.kanan}`)
          .join("|"),
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
  ws["!cols"] = [
    { wch: 10 },
    { wch: 52 },
    { wch: 8 },
    { wch: 24 },
    { wch: 24 },
    { wch: 24 },
    { wch: 24 },
    { wch: 24 },
    { wch: 22 },
    { wch: 40 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return wb;
}

export default function AiQuestionModal({
  initialSubjectId,
  allowedSubjects,
  userId,
  onClose,
  onSaved,
}: {
  initialSubjectId: number;
  allowedSubjects: Subject[];
  userId: string | null;
  onClose: () => void;
  onSaved: (savedSubjectId: number) => void;
}) {
  const supabase = createClient();
  const [mode, setMode] = useState<"auto" | "prompt">("auto");
  const [activeSubjectId, setActiveSubjectId] = useState<number>(initialSubjectId);
  const [grade, setGrade] = useState<GradeOption>("X");
  const [selectedCpIds, setSelectedCpIds] = useState<string[]>([]);
  const [topic, setTopic] = useState("");
  const [showCustomTopic, setShowCustomTopic] = useState(false);
  const [difficulty, setDifficulty] = useState("Sedang (Campuran C2-C4)");
  const [countPg, setCountPg] = useState(5);
  const [countIsian, setCountIsian] = useState(2);
  const [countJodoh, setCountJodoh] = useState(1);
  const [countEssay, setCountEssay] = useState(1);

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<GeneratedQuestion[]>([]);
  const [saving, setSaving] = useState(false);

  const [copied, setCopied] = useState(false);
  const [pastedJson, setPastedJson] = useState("");

  const activeSubjectName =
    allowedSubjects.find((s) => s.id === activeSubjectId)?.nama ||
    "Mata Pelajaran";

  const availableCps = useMemo(
    () => getCapaianForSubject(activeSubjectName, grade),
    [activeSubjectName, grade]
  );

  // Reset pilihan CP saat ganti mapel atau kelas, otomatis centang CP pertama agar praktis
  useEffect(() => {
    if (availableCps.length > 0) {
      setSelectedCpIds([availableCps[0].id]);
    } else {
      setSelectedCpIds([]);
    }
  }, [availableCps]);

  const selectedCps = useMemo(
    () => availableCps.filter((cp) => selectedCpIds.includes(cp.id)),
    [availableCps, selectedCpIds]
  );

  function toggleCp(id: string) {
    setSelectedCpIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function buildCopyablePrompt() {
    const cpLines =
      selectedCps.length > 0
        ? selectedCps
            .map((cp, i) => `${i + 1}. [${cp.elemen}] ${cp.deskripsi}`)
            .join("\n")
        : "(Sesuai topik di bawah)";

    return `Buatkan soal ujian CBT dalam Bahasa Indonesia sesuai Kurikulum Merdeka SMK:
- Mata Pelajaran: ${activeSubjectName}
- Jenjang / Kelas: ${GRADE_LABELS[grade].label}
- Tingkat Kesulitan: ${difficulty}
- Capaian Pembelajaran (CP):
${cpLines}
${topic.trim() ? `- Topik / Catatan Khusus: ${topic.trim()}` : ""}

Jumlah soal:
- Pilihan Ganda (pg): ${countPg} soal (5 opsi A-E, 1 benar, bobot 1)
- Isian Singkat (isian): ${countIsian} soal (1-2 variasi kunci, bobot 2)
- Menjodohkan (jodoh): ${countJodoh} soal (3-4 pasangan kiri & kanan, bobot 3)
- Essay (essay): ${countEssay} soal (bobot 5)

PENTING: Keluarkan HANYA JSON array valid (tanpa teks pembuka/penutup) persis mengikuti format ini:
[
  {"tipe":"pg","teks":"Pertanyaan...","bobot":1,"opsi_pg":[{"teks":"Opsi A","benar":false},{"teks":"Opsi B","benar":true},{"teks":"Opsi C","benar":false},{"teks":"Opsi D","benar":false},{"teks":"Opsi E","benar":false}]},
  {"tipe":"isian","teks":"Pertanyaan...","bobot":2,"kunci_isian":["jawaban 1","jawaban 2"]},
  {"tipe":"jodoh","teks":"Pasangkan item berikut:","bobot":3,"pasangan_jodoh":[{"kiri":"Item 1","kanan":"Pasangan 1"},{"kiri":"Item 2","kanan":"Pasangan 2"}]},
  {"tipe":"essay","teks":"Pertanyaan uraian...","bobot":5}
]`;
  }

  async function copyPrompt() {
    await navigator.clipboard.writeText(buildCopyablePrompt());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function parsePastedJson() {
    setError("");
    try {
      const cleaned = pastedJson
        .trim()
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "");
      const arr = JSON.parse(cleaned);
      if (!Array.isArray(arr) || arr.length === 0) {
        setError("Format harus berupa JSON array [...] berisi minimal 1 soal.");
        return;
      }
      setResults(arr as GeneratedQuestion[]);
    } catch {
      setError(
        "JSON tidak valid. Pastikan Anda menyalin seluruh tanda [ ... ] dari hasil ChatGPT/Gemini."
      );
    }
  }

  async function handleAutoGenerate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (selectedCps.length === 0 && !topic.trim()) {
      setError("Pilih minimal 1 Capaian Pembelajaran atau tulis topik materi.");
      return;
    }

    setGenerating(true);
    try {
      const res = await fetch("/api/guru/generate-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectId: activeSubjectId,
          subjectName: activeSubjectName,
          gradeLevel: GRADE_LABELS[grade].label,
          selectedCps: selectedCps.map((c) => ({
            elemen: c.elemen,
            deskripsi: c.deskripsi,
          })),
          topic,
          difficulty,
          countPg,
          countIsian,
          countJodoh,
          countEssay,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Gagal generate soal.");
      } else {
        setResults(data.questions || []);
      }
    } catch {
      setError("Koneksi ke server terputus.");
    } finally {
      setGenerating(false);
    }
  }

  async function saveAllToBank() {
    if (results.length === 0) return;
    setSaving(true);
    setError("");
    try {
      let savedCount = 0;
      for (const q of results) {
        const { data: qRow, error: qErr } = await supabase
          .from("questions")
          .insert({
            subject_id: activeSubjectId,
            guru_id: userId,
            tipe: q.tipe,
            teks: q.teks.trim(),
            bobot: Number(q.bobot) || 1,
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

        if (q.tipe === "pg" && q.opsi_pg) {
          q.opsi_pg.forEach((o, idx) => {
            optsInsert.push({
              question_id: qRow.id,
              urutan: idx + 1,
              teks: o.teks.trim(),
              pasangan: null,
              benar: Boolean(o.benar),
            });
          });
        } else if (q.tipe === "isian" && q.kunci_isian) {
          q.kunci_isian.forEach((k, idx) => {
            optsInsert.push({
              question_id: qRow.id,
              urutan: idx + 1,
              teks: k.trim(),
              pasangan: null,
              benar: true,
            });
          });
        } else if (q.tipe === "jodoh" && q.pasangan_jodoh) {
          q.pasangan_jodoh.forEach((p, idx) => {
            optsInsert.push({
              question_id: qRow.id,
              urutan: idx + 1,
              teks: p.kiri.trim(),
              pasangan: p.kanan.trim(),
              benar: true,
            });
          });
        }

        if (optsInsert.length > 0) {
          await supabase.from("question_options").insert(optsInsert);
        }
        savedCount++;
      }

      alert(`Berhasil menyimpan ${savedCount} soal hasil AI ke Bank Soal!`);
      onSaved(activeSubjectId);
      onClose();
    } catch {
      setError("Gagal menyimpan ke database.");
    } finally {
      setSaving(false);
    }
  }

  function exportGeneratedToExcel() {
    if (results.length === 0) return;
    const wb = buildExcelWorkbookFromGenerated(results, "Soal AI");
    const safeName = activeSubjectName.replace(/[^a-zA-Z0-9_-]/g, "_");
    XLSX.writeFile(wb, `soal-ai-${safeName}-kelas-${grade}.xlsx`);
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[92vh] overflow-y-auto p-6 space-y-5">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-lg text-slate-900">
                Mode AI Generator Soal (Kurikulum Merdeka SMK)
              </h2>
              <p className="text-xs text-slate-500">
                Pilih mapel yang Anda ampu, kelas, dan Capaian Pembelajaran (CP) resmi BSKAP.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Pilihan Mode */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMode("auto")}
            className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold cursor-pointer ${
              mode === "auto"
                ? "bg-purple-600 text-white"
                : "bg-slate-100 text-slate-700"
            }`}
          >
            Generate Otomatis (Gemini AI)
          </button>
          <button
            type="button"
            onClick={() => setMode("prompt")}
            className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold cursor-pointer ${
              mode === "prompt"
                ? "bg-purple-600 text-white"
                : "bg-slate-100 text-slate-700"
            }`}
          >
            Mode Prompt Gratis (ChatGPT / Gemini Web)
          </button>
        </div>

        {/* Mapel yang Diampu, Kelas & Tingkat Kesulitan */}
        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Mata Pelajaran Diampu
            </label>
            <select
              value={activeSubjectId}
              onChange={(e) => setActiveSubjectId(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
            >
              {allowedSubjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nama}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Kelas & Fase
            </label>
            <select
              value={grade}
              onChange={(e) => setGrade(e.target.value as GradeOption)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
            >
              <option value="X">Kelas X SMK (Fase E)</option>
              <option value="XI">Kelas XI SMK (Fase F)</option>
              <option value="XII">Kelas XII SMK (Fase F)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Tingkat Kesulitan
            </label>
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
            >
              <option value="Mudah (C1-C2)">Mudah (Pemahaman Dasar)</option>
              <option value="Sedang (Campuran C2-C4)">Sedang (Campuran)</option>
              <option value="HOTS (C4-C6 Penalaran)">HOTS (Analisis & Penalaran)</option>
            </select>
          </div>
        </div>

        {/* Pilihan Capaian Pembelajaran (CP) Dinamis */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
              <BookOpenCheck className="w-4 h-4 text-purple-600" />
              Capaian Pembelajaran (CP) — {activeSubjectName} ({GRADE_LABELS[grade].label})
            </label>
            {availableCps.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  setSelectedCpIds(
                    selectedCpIds.length === availableCps.length
                      ? []
                      : availableCps.map((c) => c.id)
                  )
                }
                className="text-xs text-purple-700 hover:underline font-medium cursor-pointer"
              >
                {selectedCpIds.length === availableCps.length
                  ? "Batal Pilih Semua"
                  : `Pilih Semua (${availableCps.length} CP)`}
              </button>
            )}
          </div>

          {availableCps.length > 0 ? (
            <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
              {availableCps.map((cp) => {
                const checked = selectedCpIds.includes(cp.id);
                return (
                  <label
                    key={cp.id}
                    className={`flex items-start gap-2.5 p-3 cursor-pointer transition ${
                      checked ? "bg-purple-50/70" : "hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={checked}
                      onChange={() => toggleCp(cp.id)}
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900">
                        {cp.elemen}
                      </div>
                      <div className="text-xs text-slate-600 leading-relaxed mt-0.5">
                        {cp.deskripsi}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
              Katalog CP bawaan untuk mapel ini belum tersedia. Silakan tulis topik atau tempel teks materi di kolom bawah.
            </div>
          )}
        </div>

        {/* Jumlah Soal per Tipe */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Pilihan Ganda
            </label>
            <input
              type="number"
              min={0}
              max={30}
              value={countPg}
              onChange={(e) => setCountPg(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Isian Singkat
            </label>
            <input
              type="number"
              min={0}
              max={15}
              value={countIsian}
              onChange={(e) => setCountIsian(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Menjodohkan
            </label>
            <input
              type="number"
              min={0}
              max={10}
              value={countJodoh}
              onChange={(e) => setCountJodoh(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Essay
            </label>
            <input
              type="number"
              min={0}
              max={10}
              value={countEssay}
              onChange={(e) => setCountEssay(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
            />
          </div>
        </div>

        {/* Catatan / Materi Tambahan (Toggle Opsional jika CP tersedia) */}
        {availableCps.length === 0 || showCustomTopic ? (
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-slate-700">
                Catatan / Materi Khusus{" "}
                <span className="text-slate-400 font-normal">
                  ({availableCps.length > 0 ? "Opsional" : "Wajib"})
                </span>
              </label>
              {availableCps.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setShowCustomTopic(false);
                    setTopic("");
                  }}
                  className="text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
                >
                  Sembunyikan
                </button>
              )}
            </div>
            <textarea
              rows={3}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Contoh: Fokus pada studi kasus praktik lapangan, atau tempel ringkasan bab tertentu..."
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
            />
          </div>
        ) : (
          <div>
            <button
              type="button"
              onClick={() => setShowCustomTopic(true)}
              className="text-xs text-purple-700 hover:underline font-medium cursor-pointer"
            >
              + Tambah Catatan / Materi Khusus (Opsional)
            </button>
          </div>
        )}

        {mode === "auto" ? (
          <form onSubmit={handleAutoGenerate}>
            <button
              type="submit"
              disabled={generating || (selectedCps.length === 0 && !topic.trim())}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white rounded-xl text-sm font-semibold cursor-pointer"
            >
              {generating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Sedang Membuat Soal...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" /> Generate Soal Sekarang
                </>
              )}
            </button>
          </form>
        ) : (
          <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-slate-600">
                <strong>Langkah 1:</strong> Salin prompt (sudah otomatis berisi Mapel, Kelas & CP pilihan Anda) lalu tempel ke ChatGPT / Gemini Web.
              </div>
              <button
                type="button"
                onClick={copyPrompt}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-semibold cursor-pointer shrink-0"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? "Prompt Tersalin!" : "Salin Prompt AI"}
              </button>
            </div>
            <div>
              <label className="block text-xs text-slate-600 mb-1">
                <strong>Langkah 2:</strong> Tempel hasil JSON <code>[ ... ]</code> dari AI di bawah ini:
              </label>
              <textarea
                rows={4}
                value={pastedJson}
                onChange={(e) => setPastedJson(e.target.value)}
                placeholder='[{"tipe":"pg","teks":"..."}]'
                className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono text-xs bg-white"
              />
            </div>
            <button
              type="button"
              onClick={parsePastedJson}
              disabled={!pastedJson.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white rounded-lg text-xs font-semibold cursor-pointer"
            >
              <ClipboardPaste className="w-4 h-4" /> Muat Pratinjau Soal
            </button>
          </div>
        )}

        {error && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs sm:text-sm">
            {error}
          </div>
        )}

        {/* Pratinjau Hasil Generate AI */}
        {results.length > 0 && (
          <div className="border-t border-slate-200 pt-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-bold text-sm text-slate-900">
                Pratinjau Hasil ({results.length} Soal — {activeSubjectName} Kelas {grade})
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={exportGeneratedToExcel}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-semibold cursor-pointer"
                >
                  <Download className="w-4 h-4" /> Unduh ke Excel
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={saveAllToBank}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white rounded-lg text-xs font-semibold cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  {saving
                    ? "Menyimpan..."
                    : `Simpan Semua (${results.length}) ke Bank Soal`}
                </button>
              </div>
            </div>

            <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
              {results.map((q, idx) => (
                <div
                  key={idx}
                  className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-700">#{idx + 1}</span>
                      <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-800 font-medium">
                        {questionTypeLabel(q.tipe)}
                      </span>
                      <span className="text-slate-500">Bobot: {q.bobot}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setResults((prev) => prev.filter((_, i) => i !== idx))
                      }
                      title="Hapus soal ini dari daftar"
                      className="text-red-500 hover:bg-red-50 p-1 rounded cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="text-sm text-slate-900 whitespace-pre-wrap">
                    {q.teks}
                  </div>

                  {q.tipe === "pg" && q.opsi_pg && (
                    <div className="grid sm:grid-cols-2 gap-1">
                      {q.opsi_pg.map((o, i) => (
                        <div
                          key={i}
                          className={`px-2 py-1 rounded border ${
                            o.benar
                              ? "bg-emerald-50 border-emerald-300 text-emerald-900 font-semibold"
                              : "bg-white border-slate-200 text-slate-700"
                          }`}
                        >
                          {String.fromCharCode(65 + i)}. {o.teks}
                        </div>
                      ))}
                    </div>
                  )}

                  {q.tipe === "isian" && q.kunci_isian && (
                    <div className="text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded">
                      <strong>Kunci:</strong> {q.kunci_isian.join(" / ")}
                    </div>
                  )}

                  {q.tipe === "jodoh" && q.pasangan_jodoh && (
                    <div className="grid sm:grid-cols-2 gap-1">
                      {q.pasangan_jodoh.map((p, i) => (
                        <div
                          key={i}
                          className="px-2 py-1 rounded bg-white border border-slate-200"
                        >
                          {p.kiri} →{" "}
                          <strong className="text-emerald-700">{p.kanan}</strong>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
