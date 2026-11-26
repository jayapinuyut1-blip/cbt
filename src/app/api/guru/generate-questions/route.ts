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

export const maxDuration = 60;

export interface GeneratedQuestion {
  tipe: "pg" | "isian" | "jodoh" | "essay";
  teks: string;
  bobot: number;
  opsi_pg?: Array<{ teks: string; benar: boolean }>;
  kunci_isian?: string[];
  pasangan_jodoh?: Array<{ kiri: string; kanan: string }>;
}

// Antrian FIFO server-side: maksimal 2 request AI aktif bersamaan agar tidak kena rate-limit 429
const MAX_CONCURRENT_AI = 2;
let activeAiJobs = 0;
const waitQueue: Array<() => void> = [];

function acquireAiSlot(): Promise<void> {
  if (activeAiJobs < MAX_CONCURRENT_AI) {
    activeAiJobs++;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    waitQueue.push(() => {
      activeAiJobs++;
      resolve();
    });
  });
}

function releaseAiSlot() {
  activeAiJobs = Math.max(0, activeAiJobs - 1);
  const next = waitQueue.shift();
  if (next) next();
}

const GEMINI_MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-flash-latest",
  "gemini-3.8-flash",
];

const RESPONSE_SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      tipe: {
        type: "STRING",
        enum: ["pg", "isian", "jodoh", "essay"],
      },
      teks: { type: "STRING" },
      bobot: { type: "NUMBER" },
      opsi_pg: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            teks: { type: "STRING" },
            benar: { type: "BOOLEAN" },
          },
          required: ["teks", "benar"],
        },
      },
      kunci_isian: {
        type: "ARRAY",
        items: { type: "STRING" },
      },
      pasangan_jodoh: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            kiri: { type: "STRING" },
            kanan: { type: "STRING" },
          },
          required: ["kiri", "kanan"],
        },
      },
    },
    required: ["tipe", "teks", "bobot"],
  },
};

function tryParseJsonArray(rawText: string): unknown[] | null {
  const cleaned = rawText
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const candidates = [cleaned];
  const firstBracket = cleaned.indexOf("[");
  const lastBracket = cleaned.lastIndexOf("]");
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    candidates.push(cleaned.slice(firstBracket, lastBracket + 1));
  }

  for (const text of candidates) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed;
      if (
        parsed &&
        typeof parsed === "object" &&
        Array.isArray((parsed as { questions?: unknown[] }).questions)
      ) {
        return (parsed as { questions: unknown[] }).questions;
      }
    } catch {
      // Coba kandidat berikutnya
    }
  }
  return null;
}

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
    const subjectId = Number(body.subjectId);
    const subjectName = String(body.subjectName || "").trim();
    const topic = String(body.topic || "").trim();
    const selectedCps: Array<{ elemen: string; deskripsi: string }> =
      Array.isArray(body.selectedCps) ? body.selectedCps : [];
    const avoidQuestions: string[] = Array.isArray(body.avoidQuestions)
      ? body.avoidQuestions.map((s: unknown) => String(s).slice(0, 120)).slice(-30)
      : [];
    const gradeLevel = String(body.gradeLevel || "Kelas X SMK (Fase E)").trim();
    const difficulty = String(body.difficulty || "Sedang").trim();
    const countPg = Math.max(0, Math.min(15, Number(body.countPg || 0)));
    const countIsian = Math.max(0, Math.min(15, Number(body.countIsian || 0)));
    const countJodoh = Math.max(0, Math.min(15, Number(body.countJodoh || 0)));
    const countEssay = Math.max(0, Math.min(15, Number(body.countEssay || 0)));

    if (!topic && selectedCps.length === 0) {
      return NextResponse.json(
        {
          error:
            "Pilih minimal satu Capaian Pembelajaran (CP) atau isi catatan materi.",
        },
        { status: 400 }
      );
    }

    const totalRequested = countPg + countIsian + countJodoh + countEssay;
    if (totalRequested <= 0) {
      return NextResponse.json(
        { error: "Pilih minimal 1 soal untuk dibuat." },
        { status: 400 }
      );
    }
    if (totalRequested > 15) {
      return NextResponse.json(
        { error: "Maksimal 15 soal per batch antrian agar server ringan." },
        { status: 400 }
      );
    }

    // Verifikasi akses mapel guru (wajib menyertakan subjectId yang diampu)
    if (profile.role === "guru") {
      if (!subjectId) {
        return NextResponse.json(
          { error: "Mata pelajaran wajib dipilih sebelum generate soal AI." },
          { status: 400 }
        );
      }
      const supabase = await createServerSupabase();
      const { data: link } = await supabase
        .from("teacher_subjects")
        .select("subject_id")
        .eq("guru_id", profile.id)
        .eq("subject_id", subjectId)
        .maybeSingle();
      if (!link) {
        return NextResponse.json(
          { error: "Anda tidak mengampu mata pelajaran ini." },
          { status: 403 }
        );
      }
    }

    const apiKey = process.env.GEMINI_API_KEY || "";
    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "GEMINI_API_KEY belum disetel di server (.env.local / Vercel). Gunakan tab 'Mode Prompt Gratis' atau hubungi Admin.",
        },
        { status: 400 }
      );
    }

    // Rate-limit serverless-safe berbasis DB per guru/admin agar kuota API tetap aman di multi-instance Vercel
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

    const cpBlock =
      selectedCps.length > 0
        ? selectedCps
            .map((cp, idx) => `${idx + 1}. [${cp.elemen}] ${cp.deskripsi}`)
            .join("\n")
        : "(Mengikuti topik/materi acuan di bawah)";

    const avoidBlock =
      avoidQuestions.length > 0
        ? `\nHINDARI mengulang atau membuat soal yang mirip dengan pertanyaan yang sudah ada berikut:\n${avoidQuestions
            .map((q, i) => `- (${i + 1}) ${q}`)
            .join("\n")}\n`
        : "";

    const prompt = `Anda adalah guru SMK profesional di Indonesia pembuat soal ujian CBT berkualitas tinggi sesuai Kurikulum Merdeka (BSKAP).
Buatkan soal ujian dalam Bahasa Indonesia yang jelas, baku, tidak ambigu, dan kontekstual untuk siswa SMK.

Detail Permintaan:
- Mata Pelajaran: ${subjectName || "Umum SMK"}
- Jenjang / Kelas & Fase: ${gradeLevel}
- Tingkat Kesulitan: ${difficulty}
- Capaian Pembelajaran (CP) yang Diujikan:
${cpBlock}
${topic ? `- Fokus Topik / Materi Tambahan dari Guru:\n"""\n${topic}\n"""` : ""}
${avoidBlock}
Jumlah soal yang WAJIB dibuat pada batch ini:
- Pilihan Ganda (tipe "pg"): ${countPg} soal (masing-masing 5 opsi A-E di "opsi_pg", tepat 1 opsi benar=true, bobot 1, JANGAN tulis label "A."/"B." di teks opsi, acak posisi jawaban benar)
- Isian Singkat (tipe "isian"): ${countIsian} soal (sertakan 1-3 variasi kunci jawaban singkat di "kunci_isian", bobot 2)
- Menjodohkan (tipe "jodoh"): ${countJodoh} soal (masing-masing 3-4 pasangan kiri & kanan unik di "pasangan_jodoh", bobot 3)
- Essay / Uraian (tipe "essay"): ${countEssay} soal (pertanyaan uraian yang jelas, bobot 5)

Kembalikan HANYA JSON array sesuai skema.`;

    // Masuk ke antrian FIFO server-side
    await acquireAiSlot();

    let lastError = "Gagal menghubungi Gemini API.";
    let parsedArray: unknown[] | null = null;

    try {
      for (const model of GEMINI_MODELS) {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(
          apiKey
        )}`;
        const resp = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.75,
              maxOutputTokens: 12288,
              responseMimeType: "application/json",
              responseSchema: RESPONSE_SCHEMA,
            },
          }),
        });

        if (!resp.ok) {
          const errText = await resp.text();
          lastError = `Gemini (${model}) error ${resp.status}: ${errText.slice(0, 160)}`;
          if (resp.status === 429 || resp.status === 503) {
            // Jedai sejenak sebelum mencoba model fallback berikutnya
            await new Promise((r) => setTimeout(r, 700));
          }
          continue;
        }

        const data = await resp.json();
        const parts: Array<{ thought?: boolean; text?: string }> =
          data?.candidates?.[0]?.content?.parts || [];

        const rawText = parts
          .filter((p) => !p.thought && typeof p.text === "string")
          .map((p) => p.text)
          .join("")
          .trim();

        if (!rawText) {
          lastError = `Gemini (${model}) mengembalikan respon kosong.`;
          continue;
        }

        const arr = tryParseJsonArray(rawText);
        if (arr && arr.length > 0) {
          parsedArray = arr;
          break;
        }
        lastError = `Format JSON dari ${model} tidak lengkap (finishReason: ${
          data?.candidates?.[0]?.finishReason || "unknown"
        }).`;
      }
    } finally {
      releaseAiSlot();
    }

    if (!parsedArray) {
      return NextResponse.json(
        { error: `${lastError} Silakan ulangi batch ini.` },
        { status: 502 }
      );
    }

    const valid: GeneratedQuestion[] = [];
    for (const item of parsedArray) {
      if (!item || typeof item !== "object") continue;
      const obj = item as Record<string, unknown>;
      const tipe = String(obj.tipe || "").toLowerCase();
      const teks = String(obj.teks || "").trim();
      const bobot = Number(obj.bobot) > 0 ? Number(obj.bobot) : 1;
      if (!teks || !["pg", "isian", "jodoh", "essay"].includes(tipe)) continue;

      if (tipe === "pg" && Array.isArray(obj.opsi_pg)) {
        const opsi = obj.opsi_pg
          .map((o: unknown) => {
            const r = o as Record<string, unknown>;
            return {
              teks: String(r?.teks || "")
                .trim()
                .replace(/^[A-Ea-e][.)]\s+/, ""),
              benar: Boolean(r?.benar),
            };
          })
          .filter((o) => o.teks !== "");
        if (opsi.length >= 2) {
          if (!opsi.some((o) => o.benar)) opsi[0].benar = true;
          valid.push({ tipe: "pg", teks, bobot, opsi_pg: opsi });
        }
      } else if (tipe === "isian" && Array.isArray(obj.kunci_isian)) {
        const kunci = obj.kunci_isian
          .map((k) => String(k || "").trim())
          .filter(Boolean);
        if (kunci.length > 0) {
          valid.push({ tipe: "isian", teks, bobot, kunci_isian: kunci });
        }
      } else if (tipe === "jodoh" && Array.isArray(obj.pasangan_jodoh)) {
        const pairs = obj.pasangan_jodoh
          .map((p: unknown) => {
            const r = p as Record<string, unknown>;
            return {
              kiri: String(r?.kiri || "").trim(),
              kanan: String(r?.kanan || "").trim(),
            };
          })
          .filter((p) => p.kiri && p.kanan);
        if (pairs.length >= 2) {
          valid.push({ tipe: "jodoh", teks, bobot, pasangan_jodoh: pairs });
        }
      } else if (tipe === "essay") {
        valid.push({ tipe: "essay", teks, bobot });
      }
    }

    if (valid.length === 0) {
      return NextResponse.json(
        { error: "AI tidak menghasilkan soal yang valid. Coba ulangi batch." },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, questions: valid });
  } catch (err) {
    console.error("AI generate error:", err);
    return NextResponse.json(
      { error: "Terjadi kesalahan saat generate soal AI." },
      { status: 500 }
    );
  }
}
