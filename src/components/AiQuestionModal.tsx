"use client";

import { useState } from "react";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/client";
import { questionTypeLabel } from "@/lib/format";
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
  subjectId,
  subjectName,
  userId,
  onClose,
  onSaved,
}: {
  subjectId: number;
  subjectName: string;
  userId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const supabase = createClient();
  const [mode, setMode] = useState<"auto" | "prompt">("auto");
  const [topic, setTopic] = useState("");
  const [gradeLevel, setGradeLevel] = useState("Kelas X SMK");
  const [difficulty, setDifficulty] = useState("Sedang (Campuran C2-C4)");
  const [countPg, setCountPg] = useState(5);
  const [countIsian, setCountIsian] = useState(2);
  const [countJodoh, setCountJodoh] = useState(1);
  const [countEssay, setCountEssay] = useState(1);
  const [customApiKey, setCustomApiKey] = useState("");

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<GeneratedQuestion[]>([]);
  const [saving, setSaving] = useState(false);

  // Mode Prompt Gratis (copy-paste JSON)
  const [copied, setCopied] = useState(false);
  const [pastedJson, setPastedJson] = useState("");

  function buildCopyablePrompt() {
    return `Buatkan soal ujian CBT dalam Bahasa Indonesia untuk mata pelajaran "${subjectName}", jenjang ${gradeLevel}, tingkat kesulitan ${difficulty}.
Materi / Topik:
${topic || "(Tulis topik atau tempel ringkasan materi Anda di sini)"}

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
    setGenerating(true);
    try {
      const res = await fetch("/api/guru/generate-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectId,
          subjectName,
          topic,
          gradeLevel,
          difficulty,
          countPg,
          countIsian,
          countJodoh,
          countEssay,
          apiKey: customApiKey,
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
            subject_id: subjectId,
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
      onSaved();
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
    const safeName = subjectName.replace(/[^a-zA-Z0-9_-]/g, "_");
    XLSX.writeFile(wb, `soal-ai-${safeName}.xlsx`);
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
                Mode AI Generator Soal
              </h2>
              <p className="text-xs text-slate-500">
                Mapel: <strong>{subjectName}</strong> — Hasil dapat ditinjau, diunduh ke Excel, atau langsung disimpan ke Bank Soal.
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

        {/* Pengaturan Soal Bersama */}
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Kelas / Jenjang
            </label>
            <select
              value={gradeLevel}
              onChange={(e) => setGradeLevel(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
            >
              <option value="Kelas X SMK">Kelas X SMK</option>
              <option value="Kelas XI SMK">Kelas XI SMK</option>
              <option value="Kelas XII SMK">Kelas XII SMK</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Tingkat Kesulitan
            </label>
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
            >
              <option value="Mudah (C1-C2)">Mudah (Pemahaman Dasar)</option>
              <option value="Sedang (Campuran C2-C4)">Sedang (Campuran)</option>
              <option value="HOTS (C4-C6 Penalaran)">HOTS (Analisis & Penalaran)</option>
            </select>
          </div>
        </div>

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

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            Topik, Kisi-kisi, atau Tempel Teks Ringkasan Materi
          </label>
          <textarea
            rows={4}
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Contoh: Pengolahan tanah, jenis pupuk organik & anorganik, pembiakan vegetatif (cangkok, okulasi, stek), dan pengendalian hama padi."
            className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
          />
        </div>

        {mode === "auto" ? (
          <form onSubmit={handleAutoGenerate} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Gemini API Key (Opsional — kosongkan jika sudah diatur di server <code>.env.local</code> / Vercel)
              </label>
              <input
                type="password"
                value={customApiKey}
                onChange={(e) => setCustomApiKey(e.target.value)}
                placeholder="AIzaSy... (opsional)"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
              />
            </div>

            <button
              type="submit"
              disabled={generating || !topic.trim()}
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
                <strong>Langkah 1:</strong> Salin prompt ini lalu tempel ke ChatGPT / Gemini Web.
              </div>
              <button
                type="button"
                onClick={copyPrompt}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-semibold cursor-pointer"
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
                Pratinjau Hasil ({results.length} Soal)
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
