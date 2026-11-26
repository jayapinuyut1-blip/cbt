"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import ExamWorkspace from "@/components/ExamWorkspace";
import type { ExamSessionPayload } from "@/types/cbt";

export default function GuruExamPreviewPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = createClient();
  const [payload, setPayload] = useState<ExamSessionPayload | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const examId = Number(params.id);
    if (!examId) return;

    supabase
      .rpc("get_exam_preview", { p_exam_id: examId })
      .then(({ data, error: err }) => {
        if (err || !data) {
          setError(err?.message || "Gagal memuat pratinjau ujian.");
          return;
        }
        const now = new Date();
        const deadline = new Date(
          now.getTime() + (data.exam?.durasi || 60) * 60 * 1000
        );
        setPayload({
          attempt_id: 0,
          exam: data.exam,
          server_now: now.toISOString(),
          deadline: deadline.toISOString(),
          questions: data.questions || [],
          answers: {},
        });
      });
  }, [params.id, supabase]);

  if (error) {
    return (
      <div className="p-6 max-w-lg mx-auto bg-white rounded-xl border border-red-200 text-red-700 space-y-3">
        <div className="font-bold">Gagal Membuka Pratinjau</div>
        <p className="text-sm">{error}</p>
        <button
          onClick={() => router.push("/guru/ujian")}
          className="px-4 py-2 bg-slate-800 text-white rounded-lg text-sm cursor-pointer"
        >
          Kembali ke Kelola Ujian
        </button>
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="p-8 text-center text-slate-500 text-sm">
        Memuat pratinjau tampilan siswa...
      </div>
    );
  }

  return (
    <div className="-m-4 md:-m-6">
      <ExamWorkspace
        mode="preview"
        session={payload}
        onExitPreview={() => router.push("/guru/ujian")}
      />
    </div>
  );
}
