"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/client";
import {
  GRADE_LABELS,
  getCapaianForSubject,
  type GradeOption,
} from "@/lib/capaian-pembelajaran";
import {
  BATCH_SIZE,
  MAX_PER_TYPE,
  buildBatches,
  buildCopyablePrompt,
  buildExcelWorkbookFromGenerated,
  clampQuestionCount,
  parsePastedAiJson,
  type BatchQueueItem,
} from "@/lib/ai-question-utils";
import AiQuestionPreview from "@/components/guru/AiQuestionPreview";
import type { Subject } from "@/types/cbt";
import type { GeneratedQuestion } from "@/app/api/guru/generate-questions/route";
import {
  Sparkles,
  X,
  Copy,
  Check,
  Loader2,
  ClipboardPaste,
  BookOpenCheck,
  StopCircle,
  RotateCcw,
  CheckCircle2,
  Clock,
  AlertCircle,
} from "lucide-react";

export { buildExcelWorkbookFromGenerated } from "@/lib/ai-question-utils";

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
  const [activeSubjectId, setActiveSubjectId] =
    useState<number>(initialSubjectId);
  const [grade, setGrade] = useState<GradeOption>("X");
  const [selectedCpIds, setSelectedCpIds] = useState<string[]>([]);
  const [topic, setTopic] = useState("");
  const [showCustomTopic, setShowCustomTopic] = useState(false);
  const [difficulty, setDifficulty] = useState("Sedang (Campuran C2-C4)");
  const [countPg, setCountPg] = useState(10);
  const [countIsian, setCountIsian] = useState(0);
  const [countJodoh, setCountJodoh] = useState(0);
  const [countEssay, setCountEssay] = useState(0);

  // State Sistem Antrian (Auto-Batching)
  const [queue, setQueue] = useState<BatchQueueItem[]>([]);
  const [runningQueue, setRunningQueue] = useState(false);
  const cancelFlagRef = useRef(false);

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

  const totalRequested =
    Math.min(MAX_PER_TYPE, Math.max(0, countPg)) +
    Math.min(MAX_PER_TYPE, Math.max(0, countIsian)) +
    Math.min(MAX_PER_TYPE, Math.max(0, countJodoh)) +
    Math.min(MAX_PER_TYPE, Math.max(0, countEssay));

  function toggleCp(id: string) {
    setSelectedCpIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function copyPrompt() {
    const prompt = buildCopyablePrompt({
      subjectName: activeSubjectName,
      gradeLabel: GRADE_LABELS[grade].label,
      difficulty,
      selectedCps,
      topic,
      countPg,
      countIsian,
      countJodoh,
      countEssay,
    });
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleParsePastedJson() {
    setError("");
    const parsed = parsePastedAiJson(pastedJson);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setResults(parsed.questions);
  }

  // Eksekutor 1 batch di dalam antrian
  async function executeSingleBatch(
    batch: BatchQueueItem,
    existingTexts: string[]
  ): Promise<GeneratedQuestion[]> {
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
        countPg: batch.countPg,
        countIsian: batch.countIsian,
        countJodoh: batch.countJodoh,
        countEssay: batch.countEssay,
        avoidQuestions: existingTexts.slice(-25),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Gagal generate batch.");
    }
    return (data.questions || []) as GeneratedQuestion[];
  }

  // Jalankan antrian batch secara berurutan (FIFO) dengan cooldown ringan & anti-duplikat
  async function processQueue(
    initialQueue: BatchQueueItem[],
    startingResults: GeneratedQuestion[]
  ) {
    cancelFlagRef.current = false;
    setRunningQueue(true);
    setError("");

    const accumulated = [...startingResults];

    for (let i = 0; i < initialQueue.length; i++) {
      const item = initialQueue[i];
      if (item.status === "done") continue;

      if (cancelFlagRef.current) {
        setQueue((prev) =>
          prev.map((q, idx) =>
            idx >= i && q.status === "queued"
              ? { ...q, status: "cancelled" }
              : q
          )
        );
        break;
      }

      setQueue((prev) =>
        prev.map((q) =>
          q.id === item.id
            ? { ...q, status: "running", errorMsg: undefined }
            : q
        )
      );

      try {
        const batchQuestions = await executeSingleBatch(
          item,
          accumulated.map((x) => x.teks)
        );
        accumulated.push(...batchQuestions);
        setResults([...accumulated]);

        setQueue((prev) =>
          prev.map((q) =>
            q.id === item.id
              ? { ...q, status: "done", generatedCount: batchQuestions.length }
              : q
          )
        );
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Gagal memproses batch.";
        setQueue((prev) =>
          prev.map((q) =>
            q.id === item.id ? { ...q, status: "error", errorMsg: msg } : q
          )
        );
      }

      // Cooldown 700ms antar batch agar server & kuota RPM Gemini tetap stabil
      if (i < initialQueue.length - 1 && !cancelFlagRef.current) {
        await new Promise((r) => setTimeout(r, 700));
      }
    }

    setRunningQueue(false);
  }

  async function handleStartQueue(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (selectedCps.length === 0 && !topic.trim()) {
      setError("Pilih minimal 1 Capaian Pembelajaran atau tulis catatan materi.");
      return;
    }
    if (totalRequested <= 0) {
      setError("Masukkan minimal 1 soal untuk dibuat.");
      return;
    }

    const batches = buildBatches(countPg, countIsian, countJodoh, countEssay);
    setQueue(batches);
    setResults([]);
    await processQueue(batches, []);
  }

  async function retryFailedBatch(batchId: number) {
    if (runningQueue) return;
    const target = queue.find((q) => q.id === batchId);
    if (!target) return;

    const updatedQueue = queue.map((q) =>
      q.id === batchId
        ? { ...q, status: "queued" as const, errorMsg: undefined }
        : q
    );
    setQueue(updatedQueue);
    await processQueue(updatedQueue, results);
  }

  function handleCancelQueue() {
    cancelFlagRef.current = true;
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

  const doneBatches = queue.filter((q) => q.status === "done").length;
  const progressPct =
    queue.length > 0 ? Math.round((doneBatches / queue.length) * 100) : 0;

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
                Mode AI Generator Soal (Sistem Antrian & Auto-Batching)
              </h2>
              <p className="text-xs text-slate-500">
                Maksimal 50 soal per tipe — otomatis dipecah ke antrian per{" "}
                {BATCH_SIZE} soal agar server ringan & bebas timeout.
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              cancelFlagRef.current = true;
              onClose();
            }}
            className="p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Pilihan Mode */}
        <div className="flex gap-2">
          <button
            type="button"
            disabled={runningQueue}
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
            disabled={runningQueue}
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

        {/* Mapel Diampu, Kelas & Tingkat Kesulitan */}
        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Mata Pelajaran Diampu
            </label>
            <select
              disabled={runningQueue}
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
              disabled={runningQueue}
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
              disabled={runningQueue}
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
            >
              <option value="Mudah (C1-C2)">Mudah (Pemahaman Dasar)</option>
              <option value="Sedang (Campuran C2-C4)">Sedang (Campuran)</option>
              <option value="HOTS (C4-C6 Penalaran)">
                HOTS (Analisis & Penalaran)
              </option>
            </select>
          </div>
        </div>

        {/* Pilihan Capaian Pembelajaran (CP) */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
              <BookOpenCheck className="w-4 h-4 text-purple-600" />
              Capaian Pembelajaran (CP) — {activeSubjectName} (
              {GRADE_LABELS[grade].label})
            </label>
            {availableCps.length > 0 && (
              <button
                type="button"
                disabled={runningQueue}
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
            <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
              {availableCps.map((cp) => {
                const checked = selectedCpIds.includes(cp.id);
                return (
                  <label
                    key={cp.id}
                    className={`flex items-start gap-2.5 p-2.5 cursor-pointer transition ${
                      checked ? "bg-purple-50/70" : "hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      disabled={runningQueue}
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
              Katalog CP bawaan untuk mapel ini belum tersedia. Silakan tulis catatan materi di kolom bawah.
            </div>
          )}
        </div>

        {/* Jumlah Soal per Tipe (Maks 50 per tipe) */}
        <div className="space-y-1.5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Pilihan Ganda", val: countPg, set: setCountPg },
              { label: "Isian Singkat", val: countIsian, set: setCountIsian },
              { label: "Menjodohkan", val: countJodoh, set: setCountJodoh },
              { label: "Essay", val: countEssay, set: setCountEssay },
            ].map((field) => (
              <div key={field.label}>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {field.label}{" "}
                  <span className="text-slate-400">(maks {MAX_PER_TYPE})</span>
                </label>
                <input
                  type="number"
                  disabled={runningQueue}
                  min={0}
                  max={MAX_PER_TYPE}
                  value={field.val}
                  onChange={(e) => field.set(clampQuestionCount(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </div>
            ))}
          </div>
          {totalRequested > BATCH_SIZE && (
            <p className="text-[11px] text-purple-700">
              Total {totalRequested} soal akan diproses otomatis melalui sistem antrian (
              {buildBatches(countPg, countIsian, countJodoh, countEssay).length}{" "}
              gelombang × maks {BATCH_SIZE} soal) agar server tetap ringan.
            </p>
          )}
        </div>

        {/* Catatan / Materi Tambahan (Toggle Opsional) */}
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
                  disabled={runningQueue}
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
              disabled={runningQueue}
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
              disabled={runningQueue}
              onClick={() => setShowCustomTopic(true)}
              className="text-xs text-purple-700 hover:underline font-medium cursor-pointer"
            >
              + Tambah Catatan / Materi Khusus (Opsional)
            </button>
          </div>
        )}

        {mode === "auto" ? (
          <form
            onSubmit={handleStartQueue}
            className="flex flex-wrap items-center gap-2"
          >
            <button
              type="submit"
              disabled={
                runningQueue ||
                totalRequested <= 0 ||
                (selectedCps.length === 0 && !topic.trim())
              }
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white rounded-xl text-sm font-semibold cursor-pointer"
            >
              {runningQueue ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Memproses
                  Antrian...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" /> Generate {totalRequested} Soal
                </>
              )}
            </button>

            {runningQueue && (
              <button
                type="button"
                onClick={handleCancelQueue}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-rose-100 hover:bg-rose-200 text-rose-800 rounded-xl text-sm font-semibold cursor-pointer"
              >
                <StopCircle className="w-4 h-4" /> Hentikan Antrian
              </button>
            )}
          </form>
        ) : (
          <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-slate-600">
                <strong>Langkah 1:</strong> Salin prompt (sudah otomatis berisi Mapel, Kelas & CP) lalu tempel ke ChatGPT / Gemini Web.
              </div>
              <button
                type="button"
                onClick={copyPrompt}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-semibold cursor-pointer shrink-0"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
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
              onClick={handleParsePastedJson}
              disabled={!pastedJson.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white rounded-lg text-xs font-semibold cursor-pointer"
            >
              <ClipboardPaste className="w-4 h-4" /> Muat Pratinjau Soal
            </button>
          </div>
        )}

        {/* Panel Status Sistem Antrian */}
        {queue.length > 0 && (
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-800">
                Status Antrian Pembuatan Soal ({doneBatches}/{queue.length} gelombang selesai • {results.length} soal terkumpul)
              </span>
              <span className="font-bold text-purple-700">{progressPct}%</span>
            </div>

            <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden">
              <div
                className="h-full bg-purple-600 transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>

            <div className="grid sm:grid-cols-2 gap-1.5 max-h-36 overflow-y-auto">
              {queue.map((b, idx) => (
                <div
                  key={b.id}
                  className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {b.status === "running" && (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-600 shrink-0" />
                    )}
                    {b.status === "done" && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    )}
                    {b.status === "queued" && (
                      <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    )}
                    {b.status === "error" && (
                      <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                    )}
                    {b.status === "cancelled" && (
                      <StopCircle className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    )}
                    <span className="truncate font-medium text-slate-800">
                      Antrian #{idx + 1}: {b.label}
                    </span>
                  </div>
                  <div className="shrink-0">
                    {b.status === "done" && (
                      <span className="text-emerald-700 font-semibold">
                        +{b.generatedCount}
                      </span>
                    )}
                    {b.status === "running" && (
                      <span className="text-purple-700">Proses...</span>
                    )}
                    {b.status === "queued" && (
                      <span className="text-slate-400">Menunggu</span>
                    )}
                    {b.status === "cancelled" && (
                      <span className="text-slate-400">Batal</span>
                    )}
                    {b.status === "error" && (
                      <button
                        type="button"
                        disabled={runningQueue}
                        onClick={() => retryFailedBatch(b.id)}
                        title={b.errorMsg}
                        className="inline-flex items-center gap-1 text-rose-700 hover:underline font-semibold cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" /> Ulangi
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs sm:text-sm">
            {error}
          </div>
        )}

        <AiQuestionPreview
          results={results}
          subjectName={activeSubjectName}
          grade={grade}
          runningQueue={runningQueue}
          saving={saving}
          onExportExcel={exportGeneratedToExcel}
          onSaveAll={saveAllToBank}
          onRemoveAt={(idx) =>
            setResults((prev) => prev.filter((_, i) => i !== idx))
          }
        />
      </div>
    </div>
  );
}
