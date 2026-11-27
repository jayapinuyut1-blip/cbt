"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/client";
import { fetchAllowedSubjectsForCurrentUser } from "@/lib/teacher-subjects";
import { questionTypeLabel } from "@/lib/format";
import {
  aggregateGradesByStudent,
  remedialRuleLabel,
  type RawStudentAttempt,
  type RemedialRule,
} from "@/lib/remedial";
import RemedialModal from "@/components/RemedialModal";
import EssayAiGradingPanel from "@/components/guru/EssayAiGradingPanel";
import type { EssayAiSuggestion } from "@/lib/essay-ai";
import {
  analyzeItems,
  summarizeAnalysis,
  type AnalysisAnswerRow,
} from "@/lib/item-analysis";
import type { Exam } from "@/types/cbt";
import {
  CheckCircle2,
  FileSpreadsheet,
  PenTool,
  RotateCcw,
  BarChart3,
  AlertTriangle,
  Bot,
} from "lucide-react";

interface EssayAnswerRow {
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
  attempts: {
    id: number;
    exam_id: number;
    attempt_ke?: number;
    status: string;
    profiles: {
      nama: string;
      username: string;
      classes: { nama: string } | null;
    } | null;
  } | null;
}

export default function GuruKoreksiPage() {
  const supabase = createClient();
  const [exams, setExams] = useState<Exam[]>([]);
  const [selectedExamId, setSelectedExamId] = useState("");
  const [tab, setTab] = useState<"essay" | "nilai" | "analisis">("essay");
  const [difficultyFilter, setDifficultyFilter] = useState<
    "semua" | "Sulit" | "Sedang" | "Mudah"
  >("semua");

  const [essayRows, setEssayRows] = useState<EssayAnswerRow[]>([]);
  const [allAnswerRows, setAllAnswerRows] = useState<AnalysisAnswerRow[]>([]);
  const [scoreInputs, setScoreInputs] = useState<Record<number, string>>({});
  const [aiSuggestions, setAiSuggestions] = useState<
    Record<number, EssayAiSuggestion>
  >({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [savingBatch, setSavingBatch] = useState(false);
  const [rawAttempts, setRawAttempts] = useState<RawStudentAttempt[]>([]);

  const [remedialModalOpen, setRemedialModalOpen] = useState(false);
  const [remedialPreselect, setRemedialPreselect] = useState<string[]>([]);

  // Baca parameter URL opsional (?examId=...&tab=essay|nilai|analisis)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const qTab = sp.get("tab");
    if (qTab === "essay" || qTab === "nilai" || qTab === "analisis") {
      setTab(qTab);
    }
    const qExamId = sp.get("examId");
    if (qExamId) {
      setSelectedExamId(qExamId);
    }
  }, []);

  const loadExams = useCallback(async () => {
    const { subjects: allowedSub } =
      await fetchAllowedSubjectsForCurrentUser(supabase);
    const allowedIds = allowedSub.map((s) => s.id);
    if (allowedIds.length === 0) {
      setExams([]);
      setSelectedExamId("");
      return;
    }
    const { data } = await supabase
      .from("exams")
      .select("*, subjects(id, nama)")
      .in("subject_id", allowedIds)
      .order("id", { ascending: false });
    const list = (data || []) as Exam[];
    setExams(list);
    setSelectedExamId((prev) => {
      if (prev && list.some((e) => String(e.id) === prev)) return prev;
      return list[0] ? String(list[0].id) : "";
    });
  }, [supabase]);

  useEffect(() => {
    loadExams();
  }, [loadExams]);

  const loadData = useCallback(async () => {
    if (!selectedExamId) return;

    const { data: attempts } = await supabase
      .from("attempts")
      .select(
        "id, student_id, attempt_ke, is_remedial, status, nilai, nilai_sementara, mulai, selesai, profiles(id, nama, username, kelas_id, classes(nama))"
      )
      .eq("exam_id", Number(selectedExamId))
      .order("id");

    const attList = (attempts || []) as unknown as RawStudentAttempt[];
    setRawAttempts(attList);

    const attIds = attList.map((a) => a.id);
    if (attIds.length === 0) {
      setEssayRows([]);
      setAllAnswerRows([]);
      return;
    }

    const submittedAttIds = attList
      .filter((a) => a.status !== "mengerjakan")
      .map((a) => a.id);

    const [{ data: ans }, { data: allAns }] = await Promise.all([
      supabase
        .from("answers")
        .select(
          "id, attempt_id, question_id, jawaban, skor, questions!inner(teks, bobot, tipe), attempts!inner(id, exam_id, attempt_ke, status, profiles(nama, username, classes(nama)))"
        )
        .in("attempt_id", attIds)
        .eq("questions.tipe", "essay")
        .order("id"),
      submittedAttIds.length > 0
        ? supabase
            .from("answers")
            .select(
              "id, attempt_id, question_id, jawaban, skor, questions!inner(id, teks, bobot, tipe, question_options(id, urutan, teks, pasangan, benar))"
            )
            .in("attempt_id", submittedAttIds)
            .order("question_id")
        : Promise.resolve({ data: [] }),
    ]);

    const list = (ans || []) as unknown as EssayAnswerRow[];
    setEssayRows(list);
    setAllAnswerRows((allAns || []) as unknown as AnalysisAnswerRow[]);

    const initialScores: Record<number, string> = {};
    list.forEach((row) => {
      initialScores[row.id] = row.skor !== null ? String(row.skor) : "";
    });
    setScoreInputs(initialScores);
    setAiSuggestions({});
  }, [supabase, selectedExamId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const selectedExam = exams.find((e) => String(e.id) === selectedExamId);
  const remedialRule: RemedialRule =
    (selectedExam?.aturan_remedial as RemedialRule) || "maks_kkm";

  const aggregated = useMemo(() => {
    if (!selectedExam) return [];
    return aggregateGradesByStudent(rawAttempts, selectedExam.kkm, remedialRule);
  }, [rawAttempts, selectedExam, remedialRule]);

  const belowKkmList = aggregated.filter((a) => a.needs_remedial);

  // Analisis Butir Soal Otomatis (logika murni & teruji di src/lib/item-analysis.ts)
  const itemAnalysis = useMemo(() => analyzeItems(allAnswerRows), [allAnswerRows]);
  const analysisSummary = useMemo(
    () => summarizeAnalysis(itemAnalysis),
    [itemAnalysis]
  );

  const filteredAnalysis = useMemo(() => {
    if (difficultyFilter === "semua") return itemAnalysis;
    return itemAnalysis.filter((i) => i.kategori === difficultyFilter);
  }, [itemAnalysis, difficultyFilter]);

  async function saveEssayScore(row: EssayAnswerRow) {
    const raw = scoreInputs[row.id];
    if (raw === "" || raw === undefined) {
      alert("Masukkan skor terlebih dahulu.");
      return;
    }
    const maxBobot = row.questions?.bobot ?? 100;
    const val = Number(raw);
    if (Number.isNaN(val) || val < 0 || val > maxBobot) {
      alert(`Skor harus antara 0 sampai ${maxBobot}.`);
      return;
    }

    setSavingId(row.id);
    try {
      const { error } = await supabase
        .from("answers")
        .update({ skor: val })
        .eq("id", row.id);
      if (error) throw error;

      const { error: rpcErr } = await supabase.rpc("recalculate_attempt_score", {
        p_attempt_id: row.attempt_id,
      });
      if (rpcErr) throw rpcErr;

      setAiSuggestions((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Gagal menyimpan skor.");
    } finally {
      setSavingId(null);
    }
  }

  function handleApplyAiSuggestions(suggestions: EssayAiSuggestion[]) {
    setAiSuggestions((prev) => {
      const next = { ...prev };
      for (const s of suggestions) next[s.answerId] = s;
      return next;
    });
    setScoreInputs((prev) => {
      const next = { ...prev };
      for (const s of suggestions) next[s.answerId] = String(s.score);
      return next;
    });
  }

  async function saveAllAiDrafts() {
    const draftRows = essayRows.filter((r) => Boolean(aiSuggestions[r.id]));
    if (draftRows.length === 0) return;

    // Validasi semua angka sebelum menyimpan ke database
    const updates: Array<{ row: EssayAnswerRow; val: number }> = [];
    for (const row of draftRows) {
      const raw = scoreInputs[row.id];
      const maxBobot = row.questions?.bobot ?? 100;
      const val = Number(raw);
      if (raw === "" || raw === undefined || Number.isNaN(val) || val < 0 || val > maxBobot) {
        alert(
          `Skor untuk ${row.attempts?.profiles?.nama || "siswa"} harus antara 0 sampai ${maxBobot}.`
        );
        return;
      }
      updates.push({ row, val });
    }

    setSavingBatch(true);
    try {
      const affectedAttempts = new Set<number>();
      for (const { row, val } of updates) {
        const { error } = await supabase
          .from("answers")
          .update({ skor: val })
          .eq("id", row.id);
        if (error) throw error;
        affectedAttempts.add(row.attempt_id);
      }

      // Hitung ulang nilai akhir sekali per attempt unik (hemat RPC)
      for (const attemptId of affectedAttempts) {
        const { error: rpcErr } = await supabase.rpc("recalculate_attempt_score", {
          p_attempt_id: attemptId,
        });
        if (rpcErr) throw rpcErr;
      }

      alert(
        `Berhasil menyimpan ${updates.length} skor essay dan memperbarui nilai ${affectedAttempts.size} peserta.`
      );
      await loadData();
    } catch (err) {
      alert(
        err instanceof Error
          ? err.message
          : "Gagal menyimpan sebagian skor essay."
      );
    } finally {
      setSavingBatch(false);
    }
  }

  function exportNilaiExcel() {
    if (!selectedExam) return;
    const data = aggregated.map((g, i) => ({
      No: i + 1,
      NIS: g.username,
      Nama: g.nama,
      Kelas: g.kelas_nama,
      "Nilai Utama": g.nilai_utama ?? "-",
      "Nilai Remedial": g.nilai_remedial ?? "-",
      "Nilai Akhir": g.nilai_akhir ?? "-",
      KKM: selectedExam.kkm,
      Keterangan: g.keterangan,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Nilai");
    XLSX.writeFile(
      wb,
      `nilai-${selectedExam.judul.replace(/[^a-zA-Z0-9_-]/g, "_")}.xlsx`
    );
  }

  function exportAnalisisExcel() {
    if (!selectedExam || itemAnalysis.length === 0) return;
    const data = itemAnalysis.map((item, idx) => ({
      "No Soal": idx + 1,
      "ID Soal": item.question_id,
      Tipe: questionTypeLabel(item.tipe),
      "Ringkasan Soal": item.teks.slice(0, 140),
      "Bobot Maks": item.bobot,
      Responden: item.responden,
      "Benar Penuh": item.benarPenuh,
      Parsial: item.parsial,
      Salah: item.salah,
      "Belum Dinilai": item.belumDinilai,
      "Penguasaan (%)":
        item.tingkatPenguasaan !== null ? item.tingkatPenguasaan : "-",
      "Kategori Kesukaran": item.kategori,
      "Distraktor Dominan (PG)": item.topDistractor
        ? `Opsi ${item.topDistractor.letter} (${item.topDistractor.pickedPct}%)`
        : "-",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Analisis Butir Soal");
    XLSX.writeFile(
      wb,
      `analisis-butir-soal-${selectedExam.judul.replace(
        /[^a-zA-Z0-9_-]/g,
        "_"
      )}.xlsx`
    );
  }

  const ungradedCount = essayRows.filter((r) => r.skor === null).length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Koreksi Essay, Nilai & Analisis Butir Soal
        </h1>
        <p className="text-sm text-slate-500">
          Beri skor jawaban essay siswa, pantau rekap nilai & remedial, serta evaluasi tingkat kesukaran tiap nomor soal.
        </p>
      </div>

      <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div className="flex-1 min-w-60 space-y-1.5">
          <select
            value={selectedExamId}
            onChange={(e) => setSelectedExamId(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
          >
            <option value="">-- Pilih Ujian --</option>
            {exams.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {ex.judul} ({ex.subjects?.nama})
              </option>
            ))}
          </select>
          {selectedExam?.bobot_tipe && (
            <div className="text-xs text-purple-800 bg-purple-50 border border-purple-200 rounded-lg px-2.5 py-1 inline-flex flex-wrap items-center gap-1.5">
              <span className="font-semibold">Skema Bobot Persentase:</span>
              {(["pg", "isian", "jodoh", "essay"] as const)
                .filter((k) => Number(selectedExam.bobot_tipe?.[k] ?? 0) > 0)
                .map((k) => (
                  <span
                    key={k}
                    className="px-1.5 py-0.5 bg-white rounded border border-purple-200 font-medium"
                  >
                    {k === "pg"
                      ? "PG"
                      : k === "isian"
                      ? "Isian"
                      : k === "jodoh"
                      ? "Jodoh"
                      : "Essay"}{" "}
                    {selectedExam.bobot_tipe?.[k]}%
                  </span>
                ))}
              <span className="text-purple-600">
                (Skor essay 0–bobot soal otomatis dikonversi ke porsi %)
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setTab("essay")}
            className={`px-3.5 py-2 rounded-lg text-xs sm:text-sm font-medium cursor-pointer ${
              tab === "essay"
                ? "bg-blue-600 text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            Koreksi Essay ({ungradedCount})
          </button>
          <button
            onClick={() => setTab("nilai")}
            className={`px-3.5 py-2 rounded-lg text-xs sm:text-sm font-medium cursor-pointer ${
              tab === "nilai"
                ? "bg-blue-600 text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            Rekap Nilai ({aggregated.length})
          </button>
          <button
            onClick={() => setTab("analisis")}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-medium cursor-pointer ${
              tab === "analisis"
                ? "bg-blue-600 text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            Analisis Butir Soal ({itemAnalysis.length})
          </button>
        </div>
      </div>

      {tab === "essay" ? (
        <div className="space-y-3">
          {selectedExam && (
            <EssayAiGradingPanel
              examId={selectedExam.id}
              subjectName={selectedExam.subjects?.nama || ""}
              essayRows={essayRows}
              draftCount={Object.keys(aiSuggestions).length}
              savingBatch={savingBatch}
              onApplySuggestions={handleApplyAiSuggestions}
              onSaveAllDrafts={saveAllAiDrafts}
            />
          )}

          {essayRows.map((row) => {
            const suggestion = aiSuggestions[row.id];
            return (
            <div
              key={row.id}
              className={`bg-white rounded-xl border p-5 space-y-3 ${
                suggestion
                  ? "border-[var(--cbt-accent)]"
                  : row.skor === null
                  ? "border-amber-300"
                  : "border-slate-200"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-900 text-sm">
                    {row.attempts?.profiles?.nama}
                  </span>
                  <span className="text-xs text-slate-500">
                    ({row.attempts?.profiles?.username} •{" "}
                    {row.attempts?.profiles?.classes?.nama || "-"})
                  </span>
                  {(row.attempts?.attempt_ke || 1) > 1 && (
                    <span className="text-[11px] px-2 py-0.5 rounded bg-purple-100 text-purple-800 font-semibold">
                      Remedial #{(row.attempts?.attempt_ke || 2) - 1}
                    </span>
                  )}
                </div>
                {row.skor !== null ? (
                  <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Dinilai: {row.skor}{" "}
                    / {row.questions?.bobot}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium">
                    <PenTool className="w-3.5 h-3.5" /> Belum Dinilai
                  </span>
                )}
              </div>

              <div className="text-xs text-slate-500 bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div className="font-semibold text-slate-700 mb-1">
                  Pertanyaan (Bobot maks: {row.questions?.bobot}):
                </div>
                <div className="whitespace-pre-wrap">{row.questions?.teks}</div>
              </div>

              <div className="text-sm text-slate-900 bg-blue-50/40 p-3.5 rounded-lg border border-blue-100">
                <div className="text-xs font-semibold text-blue-800 mb-1">
                  Jawaban Siswa:
                </div>
                <div className="whitespace-pre-wrap">
                  {row.jawaban?.text?.trim() || (
                    <span className="italic text-slate-400">
                      (Siswa tidak mengisi jawaban)
                    </span>
                  )}
                </div>
              </div>

              {suggestion && (
                <div
                  className="p-3 rounded-lg border text-xs flex flex-wrap items-start justify-between gap-2"
                  style={{
                    backgroundColor: "var(--cbt-accent-soft)",
                    borderColor: "var(--cbt-nav-active-ring)",
                  }}
                >
                  <div className="space-y-0.5 text-slate-800">
                    <div
                      className="font-semibold inline-flex items-center gap-1.5"
                      style={{ color: "var(--cbt-accent)" }}
                    >
                      <Bot className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>
                        Usulan AI (Draf, belum disimpan): {suggestion.score} /{" "}
                        {row.questions?.bobot}
                      </span>
                    </div>
                    <div className="text-slate-700">{suggestion.reason}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setAiSuggestions((prev) => {
                        const next = { ...prev };
                        delete next[row.id];
                        return next;
                      })
                    }
                    className="text-[11px] text-slate-600 hover:underline font-medium"
                  >
                    Tutup catatan
                  </button>
                </div>
              )}

              <div className="flex items-center gap-3 pt-1">
                <label className="text-xs font-medium text-slate-700">
                  Skor (0 - {row.questions?.bobot}):
                </label>
                <input
                  type="number"
                  step="0.5"
                  min={0}
                  max={row.questions?.bobot}
                  value={scoreInputs[row.id] ?? ""}
                  onChange={(e) =>
                    setScoreInputs((prev) => ({
                      ...prev,
                      [row.id]: e.target.value,
                    }))
                  }
                  className="w-24 px-3 py-1.5 rounded-lg border border-slate-300 text-sm"
                />
                <button
                  onClick={() => saveEssayScore(row)}
                  disabled={savingId === row.id || savingBatch}
                  className="px-4 py-1.5 cbt-btn-primary disabled:opacity-50 rounded-lg text-xs font-semibold cursor-pointer"
                >
                  {savingId === row.id ? "Menyimpan..." : "Simpan Skor"}
                </button>
              </div>
            </div>
            );
          })}
          {essayRows.length === 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-slate-400 text-sm">
              Tidak ada jawaban essay untuk dikoreksi pada ujian ini.
            </div>
          )}
        </div>
      ) : tab === "nilai" ? (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex flex-wrap justify-between items-center gap-2">
            <div>
              <div className="text-sm font-semibold text-slate-800">
                Daftar Nilai — {selectedExam?.judul}
              </div>
              {selectedExam && (
                <div className="text-xs text-slate-500">
                  KKM: {selectedExam.kkm} • Aturan Remedial:{" "}
                  {remedialRuleLabel(remedialRule)}
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedExam && aggregated.length > 0 && (
                <button
                  onClick={() => {
                    setRemedialPreselect(belowKkmList.map((b) => b.student_id));
                    setRemedialModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-medium cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Buka Remedial (
                  {belowKkmList.length} &lt; KKM)
                </button>
              )}
              <button
                onClick={exportNilaiExcel}
                disabled={aggregated.length === 0}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white rounded-lg text-xs font-medium cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4" /> Ekspor Excel
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="text-left px-4 py-3">NIS</th>
                  <th className="text-left px-4 py-3">Nama</th>
                  <th className="text-left px-4 py-3">Kelas</th>
                  <th className="text-center px-3 py-3">Nilai Utama</th>
                  <th className="text-center px-3 py-3">Remedial</th>
                  <th className="text-center px-3 py-3">Nilai Akhir</th>
                  <th className="text-left px-4 py-3">Keterangan</th>
                  <th className="text-right px-4 py-3">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {aggregated.map((g) => (
                  <tr key={g.student_id}>
                    <td className="px-4 py-2.5 font-mono text-xs">
                      {g.username}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-slate-900">
                      {g.nama}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600 text-xs">
                      {g.kelas_nama}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {g.nilai_utama ?? "-"}
                    </td>
                    <td className="px-3 py-2.5 text-center text-purple-700 font-medium">
                      {g.nilai_remedial ?? "-"}
                    </td>
                    <td className="px-3 py-2.5 text-center font-bold">
                      {g.nilai_akhir ?? "-"}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`px-2 py-0.5 text-xs rounded-full font-medium ${
                          g.keterangan === "Tuntas"
                            ? "bg-emerald-100 text-emerald-700"
                            : g.keterangan === "Tuntas Remedial"
                            ? "bg-blue-100 text-blue-700"
                            : g.keterangan === "Belum Tuntas"
                            ? "bg-rose-100 text-rose-700"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {g.keterangan}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {g.needs_remedial && (
                        <button
                          onClick={() => {
                            setRemedialPreselect([g.student_id]);
                            setRemedialModalOpen(true);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-semibold cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" /> Remedial
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {aggregated.length === 0 && (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-8 text-center text-slate-400"
                    >
                      Belum ada peserta yang mengerjakan ujian ini.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* TAB 3: ANALISIS BUTIR SOAL OTOMATIS */
        <div className="space-y-4">
          {/* Ringkasan Kategori Kesukaran */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="text-xs text-slate-500">Soal Dianalisis</div>
              <div className="text-2xl font-bold text-slate-900 mt-0.5">
                {analysisSummary.total}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Rata-rata penguasaan:{" "}
                <strong>
                  {analysisSummary.avgPenguasaan !== null
                    ? `${analysisSummary.avgPenguasaan}%`
                    : "-"}
                </strong>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-emerald-200 p-4">
              <div className="text-xs text-emerald-700 font-medium">
                Kategori Mudah (&gt;75%)
              </div>
              <div className="text-2xl font-bold text-emerald-700 mt-0.5">
                {analysisSummary.mudah}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Mayoritas siswa menjawab benar
              </div>
            </div>
            <div className="bg-white rounded-xl border border-blue-200 p-4">
              <div className="text-xs text-blue-700 font-medium">
                Kategori Sedang (30–75%)
              </div>
              <div className="text-2xl font-bold text-blue-700 mt-0.5">
                {analysisSummary.sedang}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Daya pembeda ideal
              </div>
            </div>
            <div className="bg-white rounded-xl border border-rose-200 p-4">
              <div className="text-xs text-rose-700 font-medium">
                Kategori Sulit (&lt;30%)
              </div>
              <div className="text-2xl font-bold text-rose-700 mt-0.5">
                {analysisSummary.sulit}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Perlu evaluasi materi / soal
              </div>
            </div>
          </div>

          {/* Filter & Ekspor Excel */}
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5 text-xs">
              {(["semua", "Sulit", "Sedang", "Mudah"] as const).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setDifficultyFilter(cat)}
                  className={`px-3 py-1.5 rounded-lg font-medium cursor-pointer transition ${
                    difficultyFilter === cat
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {cat === "semua" ? "Semua Soal" : cat}
                </button>
              ))}
            </div>
            <button
              onClick={exportAnalisisExcel}
              disabled={itemAnalysis.length === 0}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white rounded-lg text-xs font-semibold cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" /> Ekspor Analisis Excel
            </button>
          </div>

          {/* Daftar Kartu Analisis per Nomor Soal */}
          <div className="space-y-3">
            {filteredAnalysis.map((item, idx) => {
              const badgeColor =
                item.kategori === "Mudah"
                  ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                  : item.kategori === "Sedang"
                  ? "bg-blue-100 text-blue-800 border-blue-200"
                  : item.kategori === "Sulit"
                  ? "bg-rose-100 text-rose-800 border-rose-200"
                  : "bg-amber-100 text-amber-800 border-amber-200";
              const barColor =
                item.kategori === "Mudah"
                  ? "bg-emerald-500"
                  : item.kategori === "Sedang"
                  ? "bg-blue-500"
                  : item.kategori === "Sulit"
                  ? "bg-rose-500"
                  : "bg-amber-400";

              return (
                <div
                  key={item.question_id}
                  className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 space-y-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-lg bg-slate-900 text-white font-bold text-xs">
                        Butir #{idx + 1}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium">
                        {questionTypeLabel(item.tipe)} (Bobot {item.bobot})
                      </span>
                      <span
                        className={`text-xs px-2.5 py-0.5 rounded-full font-semibold border ${badgeColor}`}
                      >
                        {item.kategori}
                        {item.tingkatPenguasaan !== null
                          ? ` • ${item.tingkatPenguasaan}%`
                          : ""}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500">
                      Responden: <strong>{item.responden}</strong> • Benar:{" "}
                      <strong className="text-emerald-700">
                        {item.benarPenuh}
                      </strong>
                      {item.parsial > 0 && (
                        <>
                          {" "}
                          • Parsial:{" "}
                          <strong className="text-blue-700">
                            {item.parsial}
                          </strong>
                        </>
                      )}{" "}
                      • Salah:{" "}
                      <strong className="text-rose-700">{item.salah}</strong>
                      {item.belumDinilai > 0 && (
                        <>
                          {" "}
                          • Belum dinilai:{" "}
                          <strong className="text-amber-700">
                            {item.belumDinilai}
                          </strong>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Bar Persentase Penguasaan */}
                  {item.tingkatPenguasaan !== null && (
                    <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                      <div
                        style={{ width: `${item.tingkatPenguasaan}%` }}
                        className={`h-full rounded-full ${barColor}`}
                      />
                    </div>
                  )}

                  <div className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
                    {item.teks}
                  </div>

                  {/* Peringatan Distraktor Dominan (jika ada opsi pengecoh dipilih >= 25% siswa) */}
                  {item.topDistractor && (
                    <div className="text-xs bg-amber-50 border border-amber-200 text-amber-900 rounded-lg px-3 py-2 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>
                        Pengecoh kuat terdeteksi: <strong>Opsi {item.topDistractor.letter}</strong>{" "}
                        (salah) dipilih oleh <strong>{item.topDistractor.pickedPct}%</strong> siswa.
                        Periksa kembali apakah materi atau redaksi soal membingungkan.
                      </span>
                    </div>
                  )}

                  {/* Distribusi Pilihan Opsi untuk Soal PG */}
                  {item.tipe === "pg" && item.optionStats.length > 0 && (
                    <div className="grid sm:grid-cols-2 gap-2 pt-1">
                      {item.optionStats.map((opt) => (
                        <div
                          key={opt.id}
                          className={`rounded-lg border px-3 py-2 text-xs space-y-1 ${
                            opt.benar
                              ? "bg-emerald-50/70 border-emerald-300 text-emerald-950"
                              : "bg-slate-50 border-slate-200 text-slate-700"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold truncate">
                              {opt.letter}. {opt.teks}
                              {opt.benar ? " ✓ (Kunci)" : ""}
                            </span>
                            <span className="font-mono font-bold shrink-0">
                              {opt.pickedCount} ({opt.pickedPct}%)
                            </span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-white/80 overflow-hidden">
                            <div
                              style={{ width: `${opt.pickedPct}%` }}
                              className={`h-full rounded-full ${
                                opt.benar ? "bg-emerald-500" : "bg-slate-400"
                              }`}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {filteredAnalysis.length === 0 && (
              <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-slate-400 text-sm">
                {itemAnalysis.length === 0
                  ? "Belum ada jawaban siswa yang terkumpul untuk dianalisis pada ujian ini."
                  : `Tidak ada soal pada kategori "${difficultyFilter}".`}
              </div>
            )}
          </div>
        </div>
      )}

      {remedialModalOpen && selectedExam && (
        <RemedialModal
          examId={selectedExam.id}
          examTitle={selectedExam.judul}
          kkm={selectedExam.kkm}
          initialRule={remedialRule}
          candidates={aggregated}
          preselectedIds={remedialPreselect}
          onClose={() => setRemedialModalOpen(false)}
          onSuccess={loadData}
        />
      )}
    </div>
  );
}
