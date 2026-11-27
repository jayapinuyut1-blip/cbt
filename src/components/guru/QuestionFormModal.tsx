"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { compressImageFile, normalizeExternalImageUrl } from "@/lib/image";
import {
  convertWordHtmlToMathText,
  hasMathSyntax,
  normalizePastedPlainText,
  type MathSnippet,
} from "@/lib/math-format";
import MathText from "@/components/MathText";
import MathToolbar from "@/components/guru/MathToolbar";
import type { Question, QuestionType } from "@/types/cbt";
import { Eye, Image as ImageIcon, X } from "lucide-react";

interface DraftOption {
  teks: string;
  pasangan: string;
  benar: boolean;
}

type ActiveField =
  | { kind: "teks" }
  | { kind: "opt"; index: number }
  | { kind: "pair"; index: number };

const DEFAULT_PG_OPTIONS = (): DraftOption[] => [
  { teks: "", pasangan: "", benar: true },
  { teks: "", pasangan: "", benar: false },
  { teks: "", pasangan: "", benar: false },
  { teks: "", pasangan: "", benar: false },
  { teks: "", pasangan: "", benar: false },
];

function buildInitialOptions(q: Question | null): DraftOption[] {
  if (!q) return DEFAULT_PG_OPTIONS();
  if (q.tipe === "pg") {
    const existing = (q.question_options || []).map((o) => ({
      teks: o.teks,
      pasangan: "",
      benar: o.benar,
    }));
    while (existing.length < 4) {
      existing.push({ teks: "", pasangan: "", benar: false });
    }
    return existing;
  }
  if (q.tipe === "isian") {
    return (q.question_options || []).length > 0
      ? (q.question_options || []).map((o) => ({
          teks: o.teks,
          pasangan: "",
          benar: true,
        }))
      : [{ teks: "", pasangan: "", benar: true }];
  }
  if (q.tipe === "jodoh") {
    return (q.question_options || []).length > 0
      ? (q.question_options || []).map((o) => ({
          teks: o.teks,
          pasangan: o.pasangan || "",
          benar: true,
        }))
      : [
          { teks: "", pasangan: "", benar: true },
          { teks: "", pasangan: "", benar: true },
        ];
  }
  return [];
}

interface QuestionFormModalProps {
  editingQuestion: Question | null;
  subjectId: number;
  userId: string | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function QuestionFormModal({
  editingQuestion,
  subjectId,
  userId,
  onClose,
  onSaved,
}: QuestionFormModalProps) {
  const supabase = createClient();
  const [tipe, setTipe] = useState<QuestionType>(editingQuestion?.tipe || "pg");
  const [teks, setTeks] = useState(editingQuestion?.teks || "");
  const [bobot, setBobot] = useState(
    editingQuestion ? String(editingQuestion.bobot) : "1"
  );
  const [gambar, setGambar] = useState(editingQuestion?.gambar || "");
  const [uploadMeta, setUploadMeta] = useState("");
  const [pasteNotice, setPasteNotice] = useState("");
  const [options, setOptions] = useState<DraftOption[]>(() =>
    buildInitialOptions(editingQuestion)
  );
  const [uploadingImg, setUploadingImg] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeField, setActiveField] = useState<ActiveField>({ kind: "teks" });

  const teksRef = useRef<HTMLTextAreaElement | null>(null);
  const optRefs = useRef<Record<string, HTMLInputElement | null>>({});

  function getFieldKey(field: ActiveField): string {
    if (field.kind === "teks") return "teks";
    return `${field.kind}-${field.index}`;
  }

  function getFieldElement(
    field: ActiveField
  ): HTMLTextAreaElement | HTMLInputElement | null {
    if (field.kind === "teks") return teksRef.current;
    return optRefs.current[getFieldKey(field)] || null;
  }

  function getActiveFieldLabel(): string {
    if (activeField.kind === "teks") return "Teks Pertanyaan";
    if (tipe === "pg") {
      return `Opsi ${String.fromCharCode(65 + activeField.index)}`;
    }
    if (tipe === "isian") return `Kunci Isian #${activeField.index + 1}`;
    if (activeField.kind === "pair") {
      return `Pasangan Kanan #${activeField.index + 1}`;
    }
    return `Item Kiri #${activeField.index + 1}`;
  }

  function isFieldUnicodeOnly(field: ActiveField): boolean {
    if (field.kind === "teks") return false;
    if (tipe === "isian") return true;
    if (tipe === "jodoh" && field.kind === "pair") return true;
    return false;
  }

  function showTemporaryNotice(msg: string) {
    setPasteNotice(msg);
    window.setTimeout(() => {
      setPasteNotice((cur) => (cur === msg ? "" : cur));
    }, 4500);
  }

  function applyTextInsertion(
    field: ActiveField,
    insertedText: string,
    selectStartOffset?: number,
    selectEndOffset?: number
  ) {
    const el = getFieldElement(field);
    const currentValue =
      field.kind === "teks"
        ? teks
        : field.kind === "opt"
        ? options[field.index]?.teks || ""
        : options[field.index]?.pasangan || "";

    const start = el?.selectionStart ?? currentValue.length;
    const end = el?.selectionEnd ?? currentValue.length;
    const nextValue =
      currentValue.slice(0, start) + insertedText + currentValue.slice(end);

    if (field.kind === "teks") {
      setTeks(nextValue);
    } else if (field.kind === "opt") {
      setOptions((prev) =>
        prev.map((p, idx) =>
          idx === field.index ? { ...p, teks: nextValue } : p
        )
      );
    } else {
      setOptions((prev) =>
        prev.map((p, idx) =>
          idx === field.index ? { ...p, pasangan: nextValue } : p
        )
      );
    }

    const nextSelStart =
      selectStartOffset !== undefined
        ? start + selectStartOffset
        : start + insertedText.length;
    const nextSelEnd =
      selectEndOffset !== undefined
        ? start + selectEndOffset
        : nextSelStart;

    requestAnimationFrame(() => {
      const target = getFieldElement(field);
      if (target) {
        target.focus();
        target.setSelectionRange(nextSelStart, nextSelEnd);
      }
    });
  }

  function handleInsertSnippet(snippet: MathSnippet) {
    applyTextInsertion(
      activeField,
      snippet.insert,
      snippet.selectStart,
      snippet.selectEnd
    );
  }

  function handleInsertSymbol(symbol: string) {
    applyTextInsertion(activeField, symbol);
  }

  function handleChangeType(nextType: QuestionType) {
    setTipe(nextType);
    setActiveField({ kind: "teks" });
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

  async function uploadImageFile(file: File, sourceLabel = "Terkompres WebP") {
    setUploadingImg(true);
    setUploadMeta("");
    try {
      const compressed = await compressImageFile(file, 900, 0.78);
      const fd = new FormData();
      fd.append("file", compressed);
      fd.append("folder", "questions");

      const res = await fetch("/api/upload-image", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        alert("Gagal upload gambar: " + (data.error || "Kesalahan server"));
      } else {
        if (gambar && gambar !== data.url) {
          fetch("/api/upload-image", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: gambar }),
          }).catch(() => {});
        }
        setGambar(data.url);
        const kb = Math.max(
          1,
          Math.round((data.bytes || compressed.size) / 1024)
        );
        const prov =
          data.provider === "cloudinary" ? "Cloudinary CDN" : "Supabase Storage";
        setUploadMeta(`${sourceLabel} (${kb} KB) • ${prov}`);
      }
    } finally {
      setUploadingImg(false);
    }
  }

  async function handleUploadImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadImageFile(file);
    e.target.value = "";
  }

  function handleSmartPaste(
    e: React.ClipboardEvent<HTMLTextAreaElement | HTMLInputElement>,
    field: ActiveField
  ) {
    const clipboard = e.clipboardData;
    if (!clipboard) return;

    // 1. Cek apakah guru menempel gambar / screenshot (mis. Win+Shift+S dari Word)
    const imageItem = Array.from(clipboard.items || []).find((item) =>
      item.type.startsWith("image/")
    );
    const html = clipboard.getData("text/html");
    const plain = clipboard.getData("text/plain");

    // Jika murni gambar (tanpa teks bermakna), unggah otomatis sebagai gambar soal
    if (imageItem && !plain.trim()) {
      const imgFile = imageItem.getAsFile();
      if (imgFile) {
        e.preventDefault();
        uploadImageFile(imgFile, "Screenshot ditempel & dikompres WebP");
        showTemporaryNotice(
          "Screenshot/gambar dari clipboard otomatis diunggah sebagai Gambar Soal."
        );
        return;
      }
    }

    const unicodeOnly = isFieldUnicodeOnly(field);

    // 2. Cek HTML dari Microsoft Word / Google Docs (pangkat, indeks, Word Equation OMML/MathML)
    if (html) {
      const converted = convertWordHtmlToMathText(html, { unicodeOnly });
      if (converted) {
        e.preventDefault();
        applyTextInsertion(field, converted);
        if (hasMathSyntax(converted) || /[²³⁰¹⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉]/.test(converted)) {
          showTemporaryNotice(
            "Smart Paste Word: format pangkat/indeks/rumus berhasil dikonversi otomatis."
          );
        }
        return;
      }
    }

    // 3. Cek plain text LaTeX mentah (hasil Word Equation -> LaTeX) atau karakter aneh Word
    if (plain) {
      const normalized = normalizePastedPlainText(plain, { unicodeOnly });
      if (normalized !== plain) {
        e.preventDefault();
        applyTextInsertion(field, normalized);
        if (hasMathSyntax(normalized) && !plain.includes("$")) {
          showTemporaryNotice(
            "Rumus LaTeX dari Word otomatis dibungkus agar langsung tampil rapi."
          );
        }
      }
    }
  }

  function handleRemoveImage() {
    if (gambar) {
      fetch("/api/upload-image", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: gambar }),
      }).catch(() => {});
    }
    setGambar("");
    setUploadMeta("");
  }

  async function handleSaveQuestion(e: React.FormEvent) {
    e.preventDefault();
    if (!subjectId || !teks.trim()) return;

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
      const editingId = editingQuestion?.id ?? null;
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
        await supabase
          .from("question_options")
          .delete()
          .eq("question_id", editingId);
      } else {
        const { data, error } = await supabase
          .from("questions")
          .insert({
            subject_id: subjectId,
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

      onSaved();
      onClose();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Gagal menyimpan soal.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[92dvh] overflow-y-auto p-4 sm:p-6 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-bold text-lg text-slate-900">
            {editingQuestion ? "Ubah Soal" : "Tambah Soal Baru"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup form soal"
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-5 h-5" aria-hidden="true" />
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
                className="w-full min-h-[40px] px-3 py-2 rounded-lg border border-slate-300 text-sm"
              >
                <option value="pg">Pilihan Ganda (A-E)</option>
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
                className="w-full min-h-[40px] px-3 py-2 rounded-lg border border-slate-300 text-sm"
              />
            </div>
          </div>

          {/* Toolbar Rumus & Simbol Matematika (aktif untuk Pertanyaan maupun Opsi) */}
          <MathToolbar
            activeFieldLabel={getActiveFieldLabel()}
            unicodeOnlyField={isFieldUnicodeOnly(activeField)}
            onInsertSnippet={handleInsertSnippet}
            onInsertSymbol={handleInsertSymbol}
          />

          {pasteNotice && (
            <div className="text-xs px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 font-medium">
              {pasteNotice}
            </div>
          )}

          <div className="space-y-2">
            <label className="block text-xs font-medium text-slate-700">
              Teks Pertanyaan
            </label>
            <textarea
              ref={teksRef}
              rows={4}
              required
              value={teks}
              onFocus={() => setActiveField({ kind: "teks" })}
              onPaste={(e) => handleSmartPaste(e, { kind: "teks" })}
              onChange={(e) => setTeks(e.target.value)}
              placeholder="Tuliskan pertanyaan soal, tempel dari Word, atau klik tombol rumus di atas..."
              className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:border-blue-600 focus:outline-none text-sm"
            />

            {hasMathSyntax(teks) && (
              <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3 space-y-1">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-blue-800">
                  <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Pratinjau Tampilan Siswa</span>
                </div>
                <div className="text-sm text-slate-900 whitespace-pre-wrap break-words leading-relaxed">
                  <MathText text={teks} />
                </div>
              </div>
            )}
          </div>

          {/* Gambar Opsional (maks 1 gambar, otomatis kompres WebP + opsi URL/Drive + Ctrl+V screenshot) */}
          <div className="space-y-2">
            <label className="block text-xs font-medium text-slate-700">
              Gambar Soal (Opsional, maks 1 gambar, otomatis dikompres WebP hemat kuota)
            </label>
            <div className="flex flex-wrap items-center gap-2.5">
              <label className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-medium cursor-pointer">
                <ImageIcon className="w-4 h-4" aria-hidden="true" />
                <span>
                  {uploadingImg ? "Mengompres & Mengunggah..." : "Unggah Gambar"}
                </span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={handleUploadImage}
                  disabled={uploadingImg}
                />
              </label>
              <input
                type="url"
                value={gambar}
                onChange={(e) => {
                  setGambar(normalizeExternalImageUrl(e.target.value));
                  setUploadMeta("");
                }}
                placeholder="Atau tempel URL gambar / link share Google Drive..."
                className="flex-1 min-w-0 sm:min-w-52 min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-300 text-xs"
              />
              {gambar && (
                <button
                  type="button"
                  onClick={handleRemoveImage}
                  className="text-xs text-red-600 hover:underline cursor-pointer"
                >
                  Hapus
                </button>
              )}
            </div>
            {uploadMeta && (
              <div className="text-[11px] text-emerald-700 font-medium">
                {uploadMeta}
              </div>
            )}
            {gambar && (
              <img
                src={gambar}
                alt="Preview"
                className="mt-1 max-w-full h-auto max-h-40 rounded-lg border border-slate-200"
              />
            )}
          </div>

          {/* Opsi dinamis sesuai tipe */}
          {tipe === "pg" && (
            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-700">
                Opsi Jawaban (Centang bulatan untuk kunci yang benar; klik kolom opsi lalu klik toolbar rumus untuk menyisipkan)
              </label>
              {options.map((opt, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="pg_correct"
                      checked={opt.benar}
                      onChange={() =>
                        setOptions((prev) =>
                          prev.map((p, idx) => ({ ...p, benar: idx === i }))
                        )
                      }
                      aria-label={`Tandai Opsi ${String.fromCharCode(65 + i)} benar`}
                    />
                    <span className="text-xs font-bold w-5">
                      {String.fromCharCode(65 + i)}.
                    </span>
                    <input
                      ref={(el) => {
                        optRefs.current[`opt-${i}`] = el;
                      }}
                      type="text"
                      value={opt.teks}
                      onFocus={() => setActiveField({ kind: "opt", index: i })}
                      onPaste={(e) =>
                        handleSmartPaste(e, { kind: "opt", index: i })
                      }
                      onChange={(e) =>
                        setOptions((prev) =>
                          prev.map((p, idx) =>
                            idx === i ? { ...p, teks: e.target.value } : p
                          )
                        )
                      }
                      placeholder={`Opsi ${String.fromCharCode(65 + i)}`}
                      className="flex-1 min-w-0 min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-300 focus:border-blue-600 focus:outline-none text-sm"
                    />
                  </div>
                  {hasMathSyntax(opt.teks) && (
                    <div className="ml-11 px-2.5 py-1 rounded-md bg-blue-50/50 border border-blue-100 text-xs text-slate-800 break-words">
                      <span className="text-[10px] font-semibold text-blue-700 mr-1.5">
                        Pratinjau:
                      </span>
                      <MathText text={opt.teks} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {tipe === "isian" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
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
                  className="text-xs text-blue-600 hover:underline cursor-pointer shrink-0"
                >
                  + Tambah Variasi Kunci
                </button>
              </div>
              {options.map((opt, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    ref={(el) => {
                      optRefs.current[`opt-${i}`] = el;
                    }}
                    type="text"
                    value={opt.teks}
                    onFocus={() => setActiveField({ kind: "opt", index: i })}
                    onPaste={(e) =>
                      handleSmartPaste(e, { kind: "opt", index: i })
                    }
                    onChange={(e) =>
                      setOptions((prev) =>
                        prev.map((p, idx) =>
                          idx === i ? { ...p, teks: e.target.value } : p
                        )
                      )
                    }
                    placeholder={`Kunci jawaban ${i + 1}`}
                    className="flex-1 min-w-0 min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-300 text-sm"
                  />
                  {options.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setOptions((prev) => prev.filter((_, idx) => idx !== i))
                      }
                      aria-label={`Hapus kunci ${i + 1}`}
                      className="text-red-500 px-2 cursor-pointer"
                    >
                      <X className="w-4 h-4" aria-hidden="true" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {tipe === "jodoh" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
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
                  className="text-xs text-blue-600 hover:underline cursor-pointer shrink-0"
                >
                  + Tambah Pasangan
                </button>
              </div>
              {options.map((opt, i) => (
                <div key={i} className="space-y-1">
                  <div className="grid grid-cols-12 gap-2 items-center">
                    <input
                      ref={(el) => {
                        optRefs.current[`opt-${i}`] = el;
                      }}
                      type="text"
                      value={opt.teks}
                      onFocus={() => setActiveField({ kind: "opt", index: i })}
                      onPaste={(e) =>
                        handleSmartPaste(e, { kind: "opt", index: i })
                      }
                      onChange={(e) =>
                        setOptions((prev) =>
                          prev.map((p, idx) =>
                            idx === i ? { ...p, teks: e.target.value } : p
                          )
                        )
                      }
                      placeholder={`Item kiri ${i + 1}`}
                      className="col-span-5 min-w-0 min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-300 text-sm"
                    />
                    <span className="col-span-1 text-center text-slate-500">→</span>
                    <input
                      ref={(el) => {
                        optRefs.current[`pair-${i}`] = el;
                      }}
                      type="text"
                      value={opt.pasangan}
                      onFocus={() => setActiveField({ kind: "pair", index: i })}
                      onPaste={(e) =>
                        handleSmartPaste(e, { kind: "pair", index: i })
                      }
                      onChange={(e) =>
                        setOptions((prev) =>
                          prev.map((p, idx) =>
                            idx === i ? { ...p, pasangan: e.target.value } : p
                          )
                        )
                      }
                      placeholder={`Pasangan kanan ${i + 1}`}
                      className="col-span-5 min-w-0 min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-300 text-sm"
                    />
                    {options.length > 2 && (
                      <button
                        type="button"
                        onClick={() =>
                          setOptions((prev) => prev.filter((_, idx) => idx !== i))
                        }
                        aria-label={`Hapus pasangan ${i + 1}`}
                        className="col-span-1 text-red-500 flex justify-center cursor-pointer"
                      >
                        <X className="w-4 h-4" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                  {hasMathSyntax(opt.teks) && (
                    <div className="px-2.5 py-1 rounded-md bg-blue-50/50 border border-blue-100 text-xs text-slate-800 break-words">
                      <span className="text-[10px] font-semibold text-blue-700 mr-1.5">
                        Pratinjau Kiri #{i + 1}:
                      </span>
                      <MathText text={opt.teks} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[42px] px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="min-h-[42px] px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold cursor-pointer"
            >
              {saving ? "Menyimpan..." : "Simpan Soal"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
