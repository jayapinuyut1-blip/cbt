import { NextResponse } from "next/server";
import { getCurrentUserProfile } from "@/lib/server-auth";
import {
  createAdminSupabase,
  createServerSupabase,
} from "@/lib/supabase/server";
import {
  AI_MAX_BATCHES_PER_WINDOW,
  consumeAiRateLimit,
} from "@/lib/rate-limit";
import {
  normalizeAiGradingResponse,
  type EssayAiItemInput,
} from "@/lib/essay-ai";
import {
  callGeminiJsonArray,
  getConfiguredGeminiApiKeys,
} from "@/lib/gemini-client";

export const maxDuration = 60;

const RESPONSE_SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      answerId: { type: "INTEGER" },
      score: { type: "NUMBER" },
      reason: { type: "STRING" },
    },
    required: ["answerId", "score", "reason"],
  },
};

export async function POST(request: Request) {
  const { profile } = await getCurrentUserProfile();
  if (!profile || (profile.role !== "guru" && profile.role !== "admin")) {
    return NextResponse.json(
      { error: "Akses khusus Guru atau Admin." },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const examId = Number(body.examId);
    const subjectName = String(body.subjectName || "").trim();
    const rawItems: unknown[] = Array.isArray(body.items) ? body.items : [];

    if (!examId) {
      return NextResponse.json(
        { error: "ID ujian wajib disertakan." },
        { status: 400 }
      );
    }

    if (rawItems.length === 0) {
      return NextResponse.json(
        { error: "Tidak ada jawaban essay yang dikirim untuk dinilai." },
        { status: 400 }
      );
    }

    if (rawItems.length > 12) {
      return NextResponse.json(
        { error: "Maksimal 12 jawaban essay per batch agar proses tetap stabil." },
        { status: 400 }
      );
    }

    // Verifikasi akses guru terhadap mata pelajaran ujian ini
    if (profile.role === "guru") {
      const supabase = await createServerSupabase();
      const { data: examRow } = await supabase
        .from("exams")
        .select("subject_id")
        .eq("id", examId)
        .maybeSingle();

      if (!examRow?.subject_id) {
        return NextResponse.json(
          { error: "Ujian tidak ditemukan." },
          { status: 404 }
        );
      }

      const { data: link } = await supabase
        .from("teacher_subjects")
        .select("subject_id")
        .eq("guru_id", profile.id)
        .eq("subject_id", examRow.subject_id)
        .maybeSingle();

      if (!link) {
        return NextResponse.json(
          { error: "Anda tidak mengampu mata pelajaran ujian ini." },
          { status: 403 }
        );
      }
    }

    const items: EssayAiItemInput[] = [];
    const maxScoreByAnswerId = new Map<number, number>();

    for (const raw of rawItems) {
      if (!raw || typeof raw !== "object") continue;
      const obj = raw as Record<string, unknown>;
      const answerId = Number(obj.answerId);
      const maxScore = Number(obj.maxScore);
      const questionText = String(obj.questionText || "").trim().slice(0, 1500);
      const studentAnswer = String(obj.studentAnswer || "").trim().slice(0, 3000);
      const rubric = String(obj.rubric || "").trim().slice(0, 1000);

      if (!Number.isFinite(answerId) || !questionText || !studentAnswer) continue;
      const safeMax = Number.isFinite(maxScore) && maxScore > 0 ? maxScore : 1;

      items.push({
        answerId,
        questionText,
        maxScore: safeMax,
        rubric,
        studentAnswer,
      });
      maxScoreByAnswerId.set(answerId, safeMax);
    }

    if (items.length === 0) {
      return NextResponse.json(
        { error: "Tidak ada jawaban essay berisi teks yang valid." },
        { status: 400 }
      );
    }

    if (getConfiguredGeminiApiKeys().length === 0) {
      return NextResponse.json(
        {
          error:
            "GEMINI_API_KEY belum disetel di server. Gunakan opsi 'Mode Prompt Gratis' atau hubungi Admin.",
        },
        { status: 400 }
      );
    }

    // Rate-limit serverless-safe berbasis DB (memakai ulang batas AI per guru)
    const admin = createAdminSupabase();
    const allowed = await consumeAiRateLimit(admin, profile.id);
    if (!allowed) {
      return NextResponse.json(
        {
          error: `Batas pemakaian AI sementara tercapai (maks ${AI_MAX_BATCHES_PER_WINDOW} batch per 10 menit). Coba lagi beberapa menit lagi atau gunakan Mode Prompt Gratis.`,
        },
        { status: 429 }
      );
    }

    const anonymizedPayload = items.map((it) => ({
      answerId: it.answerId,
      pertanyaan: it.questionText,
      bobot_maks: it.maxScore,
      rubrik_guru:
        it.rubric ||
        "(Tidak ada rubrik khusus; nilai berdasarkan ketepatan dan kelengkapan terhadap pertanyaan)",
      jawaban_siswa: it.studentAnswer,
    }));

    const prompt = `Anda adalah asisten koreksi essay profesional untuk guru SMK di Indonesia.
Mata Pelajaran: ${subjectName || "Umum SMK"}

Tugas Anda adalah memberi usulan skor dan alasan singkat secara objektif, adil, dan konsisten untuk setiap jawaban anonim di bawah ini.

Pedoman penilaian:
1. Skor wajib berada di rentang 0 sampai bobot_maks tiap soal, dalam kelipatan 0.5 (contoh: 0, 1, 2.5, 4, 5).
2. Jika rubrik_guru tersedia, jadikan poin rubrik sebagai acuan utama.
3. Berikan skor penuh jika seluruh konsep inti benar dan lengkap; skor parsial jika hanya sebagian benar; skor 0 jika melenceng total, asal ketik, atau menyalin soal tanpa menjawab.
4. Toleransi kesalahan ejaan/typo ringan selama makna teknisnya tepat.
5. Tulis "reason" maksimal 1 kalimat ringkas dalam Bahasa Indonesia yang jelas (jangan gunakan karakter em dash).
6. Nilai SEMUA answerId yang diberikan. Kembalikan HANYA JSON array sesuai skema.

Data jawaban anonim:
${JSON.stringify(anonymizedPayload, null, 2)}`;

    const aiRes = await callGeminiJsonArray({
      prompt,
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0.2,
      maxOutputTokens: 4096,
      wrapperArrayKeys: ["results"],
    });

    if (!aiRes.ok) {
      return NextResponse.json(
        {
          error: `${aiRes.error} Silakan ulangi atau gunakan Mode Prompt Gratis.`,
        },
        { status: aiRes.status }
      );
    }

    const results = normalizeAiGradingResponse(aiRes.items, maxScoreByAnswerId);
    if (results.length === 0) {
      return NextResponse.json(
        { error: "AI tidak mengembalikan skor yang cocok dengan jawaban." },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      results,
      meta: { model: aiRes.model, keySlot: aiRes.keyLabel },
    });
  } catch (err) {
    console.error("AI grade essays error:", err);
    return NextResponse.json(
      { error: "Terjadi kesalahan saat menilai essay dengan AI." },
      { status: 500 }
    );
  }
}
