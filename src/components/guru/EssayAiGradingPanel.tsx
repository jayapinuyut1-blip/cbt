"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ESSAY_AI_BATCH_SIZE,
  buildFreeGradingPrompt,
  parsePastedGradingJson,
  partitionAndChunkEssays,
  type EssayAiItemInput,
  type EssayAiSuggestion,
} from "@/lib/essay-ai";
import {
  Bot,
  BookOpenCheck,
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardPaste,
  Copy,
  Loader2,
  Save,
  ShieldCheck,
  StopCircle,
} from "lucide-react";

export interface EssayGradingRowLite {
  id: number;
  attempt_id: number;
  question_id: number;
  jawaban: { text?: string };
  skor: number | null;
  questions: {
    teks: string;
    bobot: number;
    tipe: string;
  } | null;
}

interface EssayAiGradingPanelProps {
  examId: number;
  subjectName: string;
  essayRows: EssayGradingRowLite[];
  draftCount: number;
  savingBatch: boolean;
  onApplySuggestions: (suggestions: EssayAiSuggestion[]) => void;
  onSaveAllDrafts: () => void;
}

export default function EssayAiGradingPanel({
  examId,
  subjectName,
  essayRows,
  draftCount,
  savingBatch,
  onApplySuggestions,
  onSaveAllDrafts,
}: EssayAiGradingPanelProps) {
  const [showRubrics, setShowRubrics] = useState(false);
  const [showPromptMode, setShowPromptMode] = useState(false);
  const [rubrics, setRubrics] = useState<Record<number, string>>({});

  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [statusMsg, setStatusMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const cancelRef = useRef(false);

  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [pastedJson, setPastedJson] = useState("");

  // Muat rubrik tersimpan dari localStorage per ujian agar tidak hilang saat refresh
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`cbt_essay_rubrics_${examId}`);
      setRubrics(raw ? JSON.parse(raw) : {});
    } catch {
      setRubrics({});
    }
    setStatusMsg("");
    setErrorMsg("");
  }, [examId]);

  function updateRubric(questionId: number, value: string) {
    setRubrics((prev) => {
      const next = { ...prev, [questionId]: value };
      try {
        localStorage.setItem(`cbt_essay_rubrics_${examId}`, JSON.stringify(next));
      } catch {
        // Abaikan jika storage penuh
      }
      return next;
    });
  }

  const uniqueQuestions = useMemo(() => {
    const map = new Map<number, { id: number; teks: string; bobot: number }>();
    for (const row of essayRows) {
      if (!row.questions || map.has(row.question_id)) continue;
      map.set(row.question_id, {
        id: row.question_id,
        teks: row.questions.teks,
        bobot: row.questions.bobot,
      });
    }
    return Array.from(map.values());
  }, [essayRows]);

  const ungradedRows = useMemo(
    () => essayRows.filter((r) => r.skor === null),
    [essayRows]
  );

  function toAiInputs(rows: EssayGradingRowLite[]): EssayAiItemInput[] {
    return rows
      .filter((r) => Boolean(r.questions))
      .map((r) => ({
        answerId: r.id,
        questionText: r.questions!.teks,
        maxScore: r.questions!.bobot,
        rubric: rubrics[r.question_id] || "",
        studentAnswer: r.jawaban?.text || "",
      }));
  }

  async function runAiGrading(mode: "ungraded" | "all") {
    const targetRows = mode === "ungraded" ? ungradedRows : essayRows;
    if (targetRows.length === 0) {
      setStatusMsg("Semua jawaban essay pada ujian ini sudah dinilai.");
      return;
    }

    setErrorMsg("");
    setStatusMsg("");
    cancelRef.current = false;

    const inputs = toAiInputs(targetRows);
    const { emptyAutoZero, batches } = partitionAndChunkEssays(
      inputs,
      ESSAY_AI_BATCH_SIZE
    );

    let gradedCount = 0;
    if (emptyAutoZero.length > 0) {
      onApplySuggestions(emptyAutoZero);
      gradedCount += emptyAutoZero.length;
    }

    if (batches.length === 0) {
      setStatusMsg(
        `${gradedCount} jawaban kosong otomatis diisi skor 0 (draf). Tinjau lalu klik Simpan.`
      );
      return;
    }

    setRunning(true);
    setProgress({ done: 0, total: batches.length });

    let failedBatches = 0;
    let lastErr = "";

    for (let i = 0; i < batches.length; i++) {
      if (cancelRef.current) break;
      const batch = batches[i];

      try {
        const res = await fetch("/api/guru/grade-essays", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            examId,
            subjectName,
            items: batch,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          failedBatches++;
          lastErr = data.error || "Gagal memproses batch koreksi AI.";
          // Hentikan segera jika rate limit / API key belum tersedia
          if (res.status === 429 || res.status === 400 || res.status === 403) {
            break;
          }
        } else if (Array.isArray(data.results)) {
          onApplySuggestions(data.results as EssayAiSuggestion[]);
          gradedCount += data.results.length;
        }
      } catch {
        failedBatches++;
        lastErr = "Koneksi terganggu saat menghubungi server koreksi AI.";
      }

      setProgress({ done: i + 1, total: batches.length });
      if (i < batches.length - 1 && !cancelRef.current) {
        await new Promise((r) => setTimeout(r, 600));
      }
    }

    setRunning(false);
    if (failedBatches > 0) {
      setErrorMsg(lastErr);
    }
    if (gradedCount > 0) {
      setStatusMsg(
        `${gradedCount} usulan skor AI siap ditinjau sebagai draf. Periksa angka di bawah lalu klik Simpan Semua Skor Draf.`
      );
    }
  }

  async function handleCopyFreePrompt() {
    const targetRows = ungradedRows.length > 0 ? ungradedRows : essayRows;
    const inputs = toAiInputs(targetRows);
    const { emptyAutoZero, batches } = partitionAndChunkEssays(inputs, 50);

    if (emptyAutoZero.length > 0) {
      onApplySuggestions(emptyAutoZero);
    }

    const nonEmpty = batches.flat();
    if (nonEmpty.length === 0) {
      setStatusMsg("Semua jawaban target kosong dan sudah diberi usulan skor 0.");
      return;
    }

    const prompt = buildFreeGradingPrompt(nonEmpty, subjectName);
    await navigator.clipboard.writeText(prompt);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  }

  function handleLoadPastedJson() {
    setErrorMsg("");
    setStatusMsg("");
    const maxScoreByAnswerId = new Map<number, number>();
    for (const r of essayRows) {
      if (r.questions) maxScoreByAnswerId.set(r.id, r.questions.bobot);
    }
    const parsed = parsePastedGradingJson(pastedJson, maxScoreByAnswerId);
    if (!parsed.ok) {
      setErrorMsg(parsed.error);
      return;
    }
    onApplySuggestions(parsed.results);
    setPastedJson("");
    setShowPromptMode(false);
    setStatusMsg(
      `${parsed.results.length} usulan skor dari JSON berhasil dimuat sebagai draf. Tinjau lalu klik Simpan.`
    );
  }

  const hasEssays = essayRows.length > 0;
  const pct =
    progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <section
      aria-label="Asisten Koreksi Essay AI"
      className="bg-white rounded-xl border border-slate-200 overflow-hidden"
    >
      <div
        className="h-1"
        style={{ background: "var(--cbt-auth-bar)" }}
        aria-hidden="true"
      />
      <div className="p-4 sm:p-5 space-y-3.5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{
                backgroundColor: "var(--cbt-accent-soft)",
                color: "var(--cbt-accent)",
              }}
            >
              <Bot className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="font-bold text-sm sm:text-base text-slate-900">
                Asisten Koreksi Essay AI (Tinjau Sebelum Simpan)
              </h2>
              <p className="text-xs text-slate-600 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span>
                  {hasEssays
                    ? "AI memberi usulan skor dan alasan 1 kalimat sebagai draf. Guru tetap menentukan nilai akhir."
                    : "Belum ada jawaban essay masuk pada ujian ini. Tombol koreksi AI akan aktif otomatis setelah siswa mengumpulkan jawaban essay."}
                </span>
                <span className="inline-flex items-center gap-1 text-emerald-800 font-medium">
                  <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
                  Anonim (nama &amp; NISN tidak dikirim ke AI)
                </span>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={running || !hasEssays}
              onClick={() => setShowRubrics((v) => !v)}
              className="inline-flex items-center gap-1.5 min-h-[40px] px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50 text-slate-800 text-xs font-semibold transition"
            >
              <BookOpenCheck className="w-4 h-4" aria-hidden="true" />
              <span>Rubrik Kunci ({uniqueQuestions.length} soal)</span>
              {showRubrics ? (
                <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
              )}
            </button>

            <button
              type="button"
              disabled={running || !hasEssays}
              onClick={() => setShowPromptMode((v) => !v)}
              className="inline-flex items-center gap-1.5 min-h-[40px] px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50 text-slate-800 text-xs font-semibold transition"
            >
              <ClipboardPaste className="w-4 h-4" aria-hidden="true" />
              <span>Mode Prompt Gratis</span>
            </button>
          </div>
        </div>

        {/* Tombol Aksi Utama */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="button"
            disabled={running || ungradedRows.length === 0}
            onClick={() => runAiGrading("ungraded")}
            className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 cbt-btn-primary disabled:opacity-50 rounded-lg text-xs sm:text-sm font-semibold transition"
          >
            {running ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                <span>Menilai Batch {progress.done}/{progress.total}...</span>
              </>
            ) : (
              <>
                <Bot className="w-4 h-4" aria-hidden="true" />
                <span>
                  Bantu Nilai dengan AI ({ungradedRows.length} belum dinilai)
                </span>
              </>
            )}
          </button>

          {!running && essayRows.length > ungradedRows.length && (
            <button
              type="button"
              onClick={() => runAiGrading("all")}
              className="inline-flex items-center gap-1.5 min-h-[44px] px-3.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold transition"
            >
              Nilai Ulang Semua ({essayRows.length})
            </button>
          )}

          {running && (
            <button
              type="button"
              onClick={() => {
                cancelRef.current = true;
              }}
              className="inline-flex items-center gap-1.5 min-h-[44px] px-3.5 py-2 rounded-lg bg-red-50 hover:bg-red-100 text-red-800 border border-red-200 text-xs font-semibold transition"
            >
              <StopCircle className="w-4 h-4" aria-hidden="true" />
              <span>Hentikan</span>
            </button>
          )}

          {draftCount > 0 && !running && (
            <button
              type="button"
              disabled={savingBatch}
              onClick={onSaveAllDrafts}
              className="inline-flex items-center gap-1.5 min-h-[44px] px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-xs sm:text-sm font-semibold transition ml-auto"
            >
              <Save className="w-4 h-4" aria-hidden="true" />
              <span>
                {savingBatch
                  ? "Menyimpan..."
                  : `Simpan Semua Skor Draf (${draftCount})`}
              </span>
            </button>
          )}
        </div>

        {/* Bilah Progres Batch */}
        {running && progress.total > 0 && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-slate-600 font-medium">
              <span>
                Memproses antrian koreksi ({ESSAY_AI_BATCH_SIZE} jawaban per gelombang)...
              </span>
              <span>{pct}%</span>
            </div>
            <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden">
              <div
                className="h-full cbt-progress-bar transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )}

        {/* Panel Rubrik Opsional per Soal */}
        {showRubrics && (
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="text-xs text-slate-700">
              <strong>Rubrik / Poin Kunci Acuan (Opsional):</strong> Tulis poin jawaban yang Anda harapkan untuk tiap nomor soal essay agar penilaian AI semakin presisi.
            </div>
            <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
              {uniqueQuestions.map((q, idx) => (
                <div
                  key={q.id}
                  className="bg-white p-3 rounded-lg border border-slate-200 space-y-1.5"
                >
                  <label
                    htmlFor={`rubric-${q.id}`}
                    className="block text-xs font-semibold text-slate-800"
                  >
                    Soal Essay #{idx + 1} (Bobot maks {q.bobot}):{" "}
                    <span className="font-normal text-slate-600 line-clamp-2">
                      {q.teks}
                    </span>
                  </label>
                  <input
                    id={`rubric-${q.id}`}
                    type="text"
                    value={rubrics[q.id] || ""}
                    onChange={(e) => updateRubric(q.id, e.target.value)}
                    placeholder="Contoh: Menyebutkan minimal 3 langkah utama beserta alasannya..."
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs bg-white"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Panel Mode Prompt Gratis (Fallback ChatGPT / Gemini Web) */}
        {showPromptMode && (
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-slate-700">
                <strong>Langkah 1:</strong> Salin prompt berisi jawaban anonim &amp; rubrik lalu tempel ke ChatGPT / Gemini Web.
              </p>
              <button
                type="button"
                onClick={handleCopyFreePrompt}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold"
              >
                {copiedPrompt ? (
                  <Check className="w-3.5 h-3.5" aria-hidden="true" />
                ) : (
                  <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                )}
                <span>
                  {copiedPrompt ? "Prompt Tersalin!" : "Salin Prompt Koreksi"}
                </span>
              </button>
            </div>
            <div>
              <label
                htmlFor="pasted-grading-json"
                className="block text-xs text-slate-700 mb-1"
              >
                <strong>Langkah 2:</strong> Tempel hasil JSON <code>[ ... ]</code> dari AI:
              </label>
              <textarea
                id="pasted-grading-json"
                rows={3}
                value={pastedJson}
                onChange={(e) => setPastedJson(e.target.value)}
                placeholder='[{"answerId": 101, "score": 4.5, "reason": "..."}]'
                className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono text-xs bg-white"
              />
            </div>
            <button
              type="button"
              disabled={!pastedJson.trim()}
              onClick={handleLoadPastedJson}
              className="inline-flex items-center gap-1.5 px-4 py-2 cbt-btn-primary disabled:opacity-50 rounded-lg text-xs font-semibold"
            >
              <ClipboardPaste className="w-4 h-4" aria-hidden="true" />
              <span>Muat Usulan Skor ke Draf</span>
            </button>
          </div>
        )}

        {statusMsg && (
          <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-medium">
            {statusMsg}
          </div>
        )}

        {errorMsg && (
          <div
            role="alert"
            className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs font-medium"
          >
            {errorMsg}
          </div>
        )}
      </div>
    </section>
  );
}
