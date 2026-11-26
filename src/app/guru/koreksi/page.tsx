"use client";

import { useCallback, useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/client";
import type { Exam } from "@/types/cbt";
import { CheckCircle2, FileSpreadsheet, PenTool } from "lucide-react";

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
    status: string;
    profiles: {
      nama: string;
      username: string;
      classes: { nama: string } | null;
    } | null;
  } | null;
}

interface GradeRow {
  id: number;
  status: string;
  nilai: number | null;
  nilai_sementara: number | null;
  profiles: {
    nama: string;
    username: string;
    classes: { nama: string } | null;
  } | null;
}

export default function GuruKoreksiPage() {
  const supabase = createClient();
  const [exams, setExams] = useState<Exam[]>([]);
  const [selectedExamId, setSelectedExamId] = useState("");
  const [tab, setTab] = useState<"essay" | "nilai">("essay");

  const [essayRows, setEssayRows] = useState<EssayAnswerRow[]>([]);
  const [scoreInputs, setScoreInputs] = useState<Record<number, string>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [gradeRows, setGradeRows] = useState<GradeRow[]>([]);

  useEffect(() => {
    supabase
      .from("exams")
      .select("*, subjects(id, nama)")
      .order("id", { ascending: false })
      .then(({ data }) => {
        const list = (data || []) as Exam[];
        setExams(list);
        if (list[0]) setSelectedExamId(String(list[0].id));
      });
  }, [supabase]);

  const loadData = useCallback(async () => {
    if (!selectedExamId) return;

    const { data: attempts } = await supabase
      .from("attempts")
      .select("id, status, nilai, nilai_sementara, profiles(nama, username, classes(nama))")
      .eq("exam_id", Number(selectedExamId))
      .order("id");

    const attList = (attempts || []) as unknown as GradeRow[];
    setGradeRows(attList);

    const attIds = attList.map((a) => a.id);
    if (attIds.length === 0) {
      setEssayRows([]);
      return;
    }

    const { data: ans } = await supabase
      .from("answers")
      .select(
        "id, attempt_id, question_id, jawaban, skor, questions!inner(teks, bobot, tipe), attempts!inner(id, exam_id, status, profiles(nama, username, classes(nama)))"
      )
      .in("attempt_id", attIds)
      .eq("questions.tipe", "essay")
      .order("id");

    const list = (ans || []) as unknown as EssayAnswerRow[];
    setEssayRows(list);

    const initialScores: Record<number, string> = {};
    list.forEach((row) => {
      initialScores[row.id] = row.skor !== null ? String(row.skor) : "";
    });
    setScoreInputs(initialScores);
  }, [supabase, selectedExamId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

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

      // Hitung ulang nilai akhir & ubah status dari menunggu_koreksi -> selesai
      const { error: rpcErr } = await supabase.rpc("recalculate_attempt_score", {
        p_attempt_id: row.attempt_id,
      });
      if (rpcErr) throw rpcErr;

      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Gagal menyimpan skor.");
    } finally {
      setSavingId(null);
    }
  }

  function exportNilaiExcel() {
    const ex = exams.find((e) => String(e.id) === selectedExamId);
    if (!ex) return;
    const data = gradeRows.map((g, i) => ({
      No: i + 1,
      NIS: g.profiles?.username || "-",
      Nama: g.profiles?.nama || "-",
      Kelas: g.profiles?.classes?.nama || "-",
      Status: g.status,
      Nilai: g.status === "selesai" ? g.nilai : g.nilai_sementara,
      KKM: ex.kkm,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Nilai");
    XLSX.writeFile(
      wb,
      `nilai-${ex.judul.replace(/[^a-zA-Z0-9_-]/g, "_")}.xlsx`
    );
  }

  const selectedExam = exams.find((e) => String(e.id) === selectedExamId);
  const ungradedCount = essayRows.filter((r) => r.skor === null).length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Koreksi Essay & Nilai Ujian
        </h1>
        <p className="text-sm text-slate-500">
          Beri skor 0 sampai bobot soal pada jawaban essay. Nilai akhir siswa otomatis dihitung ulang.
        </p>
      </div>

      <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <select
          value={selectedExamId}
          onChange={(e) => setSelectedExamId(e.target.value)}
          className="flex-1 min-w-60 px-3 py-2 rounded-lg border border-slate-300 text-sm"
        >
          <option value="">-- Pilih Ujian --</option>
          {exams.map((ex) => (
            <option key={ex.id} value={ex.id}>
              {ex.judul} ({ex.subjects?.nama})
            </option>
          ))}
        </select>

        <div className="flex gap-2">
          <button
            onClick={() => setTab("essay")}
            className={`px-4 py-2 rounded-lg text-sm font-medium cursor-pointer ${
              tab === "essay"
                ? "bg-blue-600 text-white"
                : "bg-slate-100 text-slate-700"
            }`}
          >
            Koreksi Essay ({ungradedCount} belum dinilai)
          </button>
          <button
            onClick={() => setTab("nilai")}
            className={`px-4 py-2 rounded-lg text-sm font-medium cursor-pointer ${
              tab === "nilai"
                ? "bg-blue-600 text-white"
                : "bg-slate-100 text-slate-700"
            }`}
          >
            Rekap Nilai ({gradeRows.length})
          </button>
        </div>
      </div>

      {tab === "essay" ? (
        <div className="space-y-3">
          {essayRows.map((row) => (
            <div
              key={row.id}
              className={`bg-white rounded-xl border p-5 space-y-3 ${
                row.skor === null ? "border-amber-300" : "border-slate-200"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-bold text-slate-900 text-sm">
                    {row.attempts?.profiles?.nama}
                  </span>{" "}
                  <span className="text-xs text-slate-500">
                    ({row.attempts?.profiles?.username} •{" "}
                    {row.attempts?.profiles?.classes?.nama || "-"})
                  </span>
                </div>
                {row.skor !== null ? (
                  <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Dinilai: {row.skor} /{" "}
                    {row.questions?.bobot}
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

              <div className="flex items-center gap-3 pt-1">
                <label className="text-xs font-medium text-slate-700">
                  Skor (0 – {row.questions?.bobot}):
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
                  disabled={savingId === row.id}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold cursor-pointer"
                >
                  {savingId === row.id ? "Menyimpan..." : "Simpan Skor"}
                </button>
              </div>
            </div>
          ))}
          {essayRows.length === 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-slate-400 text-sm">
              Tidak ada jawaban essay untuk dikoreksi pada ujian ini.
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex justify-between items-center">
            <div className="text-sm font-semibold text-slate-800">
              Daftar Nilai — {selectedExam?.judul}
            </div>
            <button
              onClick={exportNilaiExcel}
              disabled={gradeRows.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white rounded-lg text-xs font-medium cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" /> Ekspor Excel
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="text-left px-4 py-3">NIS</th>
                  <th className="text-left px-4 py-3">Nama</th>
                  <th className="text-left px-4 py-3">Kelas</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Nilai</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {gradeRows.map((g) => (
                  <tr key={g.id}>
                    <td className="px-4 py-2.5 font-mono text-xs">
                      {g.profiles?.username}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-slate-900">
                      {g.profiles?.nama}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">
                      {g.profiles?.classes?.nama || "-"}
                    </td>
                    <td className="px-4 py-2.5 text-xs">
                      {g.status === "selesai"
                        ? "Selesai"
                        : g.status === "menunggu_koreksi"
                        ? "Menunggu Koreksi"
                        : "Mengerjakan"}
                    </td>
                    <td className="px-4 py-2.5 font-bold">
                      {g.status === "selesai"
                        ? g.nilai
                        : g.status === "menunggu_koreksi"
                        ? `${g.nilai_sementara} (sementara)`
                        : "-"}
                    </td>
                  </tr>
                ))}
                {gradeRows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                      Belum ada peserta yang mengerjakan ujian ini.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
