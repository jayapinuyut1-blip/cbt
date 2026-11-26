"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime, questionTypeLabel } from "@/lib/format";
import { CheckCircle2, Clock, ArrowLeft } from "lucide-react";

interface ResultDetail {
  question_id: number;
  tipe: "pg" | "isian" | "jodoh" | "essay";
  teks: string;
  gambar: string | null;
  bobot: number;
  jawaban: {
    option_id?: number;
    text?: string;
    pairs?: Record<string, string>;
  };
  skor: number | null;
  options: Array<{
    id: number;
    teks: string;
    pasangan: string | null;
    benar: boolean;
  }>;
}

interface ResultPayload {
  attempt_id: number;
  status: string;
  mulai: string;
  selesai: string | null;
  exam: {
    id: number;
    judul: string;
    mapel: string;
    kkm: number;
    jenis: string;
    tampil_hasil: string;
  };
  show_score: boolean;
  show_key: boolean;
  nilai: number | null;
  nilai_sementara: number | null;
  details: ResultDetail[];
}

export default function SiswaHasilPage() {
  const params = useParams();
  const supabase = createClient();
  const [result, setResult] = useState<ResultPayload | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const attemptId = Number(params.attemptId);
    if (!attemptId) return;
    supabase
      .rpc("get_attempt_result", { p_attempt_id: attemptId })
      .then(({ data, error: err }) => {
        if (err) setError(err.message);
        else setResult(data as ResultPayload);
      });
  }, [params.attemptId, supabase]);

  if (error) {
    return (
      <div className="max-w-lg mx-auto bg-white p-6 rounded-xl border border-red-200 text-red-700 text-sm">
        {error}
      </div>
    );
  }

  if (!result) {
    return (
      <div className="p-8 text-center text-slate-500 text-sm">
        Memuat hasil ujian...
      </div>
    );
  }

  const displayScore =
    result.status === "selesai" ? result.nilai : result.nilai_sementara;
  const isTuntas =
    result.status === "selesai" &&
    result.nilai !== null &&
    result.nilai >= result.exam.kkm;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Link
        href="/siswa"
        className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="w-4 h-4" /> Kembali ke Daftar Ujian
      </Link>

      <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 text-center space-y-4">
        <div className="w-14 h-14 mx-auto rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
          {result.status === "menunggu_koreksi" ? (
            <Clock className="w-7 h-7 text-amber-600" />
          ) : (
            <CheckCircle2 className="w-7 h-7" />
          )}
        </div>

        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Ujian Telah Dikumpulkan
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {result.exam.judul} — {result.exam.mapel}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">
            Selesai pada {formatDateTime(result.selesai)}
          </p>
        </div>

        {result.show_score ? (
          <div className="max-w-xs mx-auto p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
            <div className="text-xs text-slate-500 uppercase tracking-wide">
              {result.status === "menunggu_koreksi"
                ? "Nilai Sementara (Soal Otomatis)"
                : "Nilai Akhir"}
            </div>
            <div className="text-4xl font-extrabold text-blue-700">
              {displayScore ?? 0}
            </div>
            {result.status === "menunggu_koreksi" ? (
              <div className="text-xs text-amber-700 font-medium pt-1">
                Status: Menunggu koreksi jawaban Essay oleh guru.
              </div>
            ) : (
              <div className="pt-1">
                <span
                  className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${
                    isTuntas
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-rose-100 text-rose-700"
                  }`}
                >
                  {isTuntas
                    ? `Tuntas (KKM ${result.exam.kkm})`
                    : `Belum Tuntas (KKM ${result.exam.kkm})`}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-600">
            Terima kasih telah mengikuti ujian. Hasil nilai akan diumumkan oleh guru atau sekolah.
          </div>
        )}
      </div>

      {/* Pembahasan Kunci Jawaban (Jika diizinkan guru / ujian latihan) */}
      {result.show_key && result.details.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-bold text-lg text-slate-900">
            Pembahasan & Kunci Jawaban
          </h2>
          {result.details.map((item, idx) => (
            <div
              key={item.question_id}
              className="bg-white rounded-xl border border-slate-200 p-5 space-y-3"
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-700">
                  Soal #{idx + 1} ({questionTypeLabel(item.tipe)})
                </span>
                <span className="px-2 py-0.5 rounded bg-slate-100 font-semibold text-slate-700">
                  Skor: {item.skor ?? "Menunggu koreksi"} / {item.bobot}
                </span>
              </div>

              <div className="text-sm text-slate-900 whitespace-pre-wrap">
                {item.teks}
              </div>

              {item.gambar && (
                <img
                  src={item.gambar}
                  alt="Gambar soal"
                  className="max-h-48 rounded-lg border border-slate-200"
                />
              )}

              {item.tipe === "pg" && (
                <div className="space-y-1.5 text-xs">
                  {item.options.map((o) => {
                    const isPicked = item.jawaban?.option_id === o.id;
                    return (
                      <div
                        key={o.id}
                        className={`px-3 py-2 rounded-lg border ${
                          o.benar
                            ? "bg-emerald-50 border-emerald-300 text-emerald-900 font-semibold"
                            : isPicked
                            ? "bg-rose-50 border-rose-300 text-rose-900"
                            : "bg-slate-50 border-slate-200 text-slate-600"
                        }`}
                      >
                        {o.teks}
                        {o.benar && " ✓ (Kunci Benar)"}
                        {isPicked && !o.benar && " ✗ (Jawaban Anda)"}
                        {isPicked && o.benar && " — Jawaban Anda"}
                      </div>
                    );
                  })}
                </div>
              )}

              {item.tipe === "isian" && (
                <div className="text-xs space-y-1">
                  <div>
                    <strong>Jawaban Anda:</strong>{" "}
                    {item.jawaban?.text || "(kosong)"}
                  </div>
                  <div className="text-emerald-700">
                    <strong>Kunci Benar:</strong>{" "}
                    {item.options.map((o) => o.teks).join(" / ")}
                  </div>
                </div>
              )}

              {item.tipe === "jodoh" && (
                <div className="space-y-1.5 text-xs">
                  {item.options.map((o) => {
                    const picked = item.jawaban?.pairs?.[String(o.id)] || "-";
                    const correct = picked === o.pasangan;
                    return (
                      <div
                        key={o.id}
                        className={`px-3 py-1.5 rounded border ${
                          correct
                            ? "bg-emerald-50 border-emerald-200"
                            : "bg-rose-50 border-rose-200"
                        }`}
                      >
                        <strong>{o.teks}</strong> → Jawaban Anda:{" "}
                        <span className="font-medium">{picked}</span> | Kunci:{" "}
                        <span className="text-emerald-700 font-semibold">
                          {o.pasangan}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {item.tipe === "essay" && (
                <div className="text-xs bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <div className="font-semibold text-slate-700 mb-1">
                    Jawaban Anda:
                  </div>
                  <div className="whitespace-pre-wrap">
                    {item.jawaban?.text || "(kosong)"}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
