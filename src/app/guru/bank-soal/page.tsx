"use client";

import { useCallback, useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/client";
import { questionTypeLabel } from "@/lib/format";
import { fetchAllowedSubjectsForCurrentUser } from "@/lib/teacher-subjects";
import {
  buildQuestionExportWorkbook,
  buildQuestionTemplateWorkbook,
  parseExcelQuestionRows,
} from "@/lib/question-excel";
import AiQuestionModal from "@/components/AiQuestionModal";
import QuestionFormModal from "@/components/guru/QuestionFormModal";
import type { Question, Subject } from "@/types/cbt";
import { Plus, Upload, Download, Trash2, Edit3, Sparkles } from "lucide-react";

export default function GuruBankSoalPage() {
  const supabase = createClient();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [userId, setUserId] = useState<string | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [importing, setImporting] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);

  useEffect(() => {
    fetchAllowedSubjectsForCurrentUser(supabase).then(
      ({ userId: uid, subjects: list }) => {
        setUserId(uid);
        setSubjects(list);
        if (list[0]) setSelectedSubjectId(String(list[0].id));
      }
    );
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
    setEditingQuestion(null);
    setShowModal(true);
  }

  function openEditModal(q: Question) {
    setEditingQuestion(q);
    setShowModal(true);
  }

  async function deleteQuestion(id: number) {
    if (!confirm("Hapus soal ini dari bank soal?")) return;
    const target = questions.find((q) => q.id === id);
    await supabase.from("questions").delete().eq("id", id);
    if (target?.gambar) {
      fetch("/api/upload-image", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: target.gambar }),
      }).catch(() => {});
    }
    loadQuestions();
  }

  function downloadTemplate() {
    const wb = buildQuestionTemplateWorkbook();
    XLSX.writeFile(wb, "template-bank-soal-cbt.xlsx");
  }

  function exportBankSoal() {
    const wb = buildQuestionExportWorkbook(questions);
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
      const parsed = parseExcelQuestionRows(rows);

      let okCount = 0;
      for (const item of parsed) {
        const { data: qRow, error: qErr } = await supabase
          .from("questions")
          .insert({
            subject_id: Number(selectedSubjectId),
            guru_id: userId,
            tipe: item.tipe,
            teks: item.teks,
            bobot: item.bobot,
          })
          .select("id")
          .single();

        if (qErr || !qRow) continue;

        if (item.options.length > 0) {
          await supabase.from("question_options").insert(
            item.options.map((opt) => ({
              question_id: qRow.id,
              ...opt,
            }))
          );
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

      {showModal && selectedSubjectId && (
        <QuestionFormModal
          key={editingQuestion ? `edit-q-${editingQuestion.id}` : "new-q"}
          editingQuestion={editingQuestion}
          subjectId={Number(selectedSubjectId)}
          userId={userId}
          onClose={() => setShowModal(false)}
          onSaved={loadQuestions}
        />
      )}

      {showAiModal && selectedSubjectId && (
        <AiQuestionModal
          initialSubjectId={Number(selectedSubjectId)}
          allowedSubjects={subjects}
          userId={userId}
          onClose={() => setShowAiModal(false)}
          onSaved={(savedSubjId) => {
            setSelectedSubjectId(String(savedSubjId));
            loadQuestions();
          }}
        />
      )}
    </div>
  );
}
