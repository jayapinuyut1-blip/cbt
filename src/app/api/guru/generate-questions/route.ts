import { NextResponse } from "next/server";
import { getCurrentUserProfile } from "@/lib/server-auth";
import { createServerSupabase } from "@/lib/supabase/server";

export interface GeneratedQuestion {
  tipe: "pg" | "isian" | "jodoh" | "essay";
  teks: string;
  bobot: number;
  opsi_pg?: Array<{ teks: string; benar: boolean }>;
  kunci_isian?: string[];
  pasangan_jodoh?: Array<{ kiri: string; kanan: string }>;
}

// Prioritaskan model cepat & stabil dengan fallback otomatis bila ada 503 / gagal parse
const GEMINI_MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-flash-latest",
  "gemini-3.8-flash",
];

// Skema JSON ketat agar Gemini selalu mengeluarkan JSON valid tanpa terpotong formatnya
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
    const gradeLevel = String(body.gradeLevel || "Kelas X SMK (Fase E)").trim();
    const difficulty = String(body.difficulty || "Sedang").trim();
    const countPg = Math.max(0, Math.min(30, Number(body.countPg || 0)));
    const countIsian = Math.max(0, Math.min(15, Number(body.countIsian || 0)));
    const countJodoh = Math.max(0, Math.min(10, Number(body.countJodoh || 0)));
    const countEssay = Math.max(0, Math.min(10, Number(body.countEssay || 0)));

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
    if (totalRequested > 40) {
      return NextResponse.json(
        { error: "Maksimal 40 soal per sekali generate agar hasil akurat." },
        { status: 400 }
      );
    }

    // Verifikasi akses mapel guru
    if (profile.role === "guru" && subjectId) {
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

    const cpBlock =
      selectedCps.length > 0
        ? selectedCps
            .map((cp, idx) => `${idx + 1}. [${cp.elemen}] ${cp.deskripsi}`)
            .join("\n")
        : "(Mengikuti topik/materi acuan di bawah)";

    const prompt = `Anda adalah guru SMK profesional di Indonesia pembuat soal ujian CBT berkualitas tinggi sesuai Kurikulum Merdeka (BSKAP).
Buatkan soal ujian dalam Bahasa Indonesia yang jelas, baku, tidak ambigu, dan kontekstual untuk siswa SMK.

Detail Permintaan:
- Mata Pelajaran: ${subjectName || "Umum SMK"}
- Jenjang / Kelas & Fase: ${gradeLevel}
- Tingkat Kesulitan: ${difficulty}
- Capaian Pembelajaran (CP) yang Diujikan:
${cpBlock}
${topic ? `- Fokus Topik / Materi Tambahan dari Guru:\n"""\n${topic}\n"""` : ""}

Jumlah soal yang WAJIB dibuat:
- Pilihan Ganda (tipe "pg"): ${countPg} soal (masing-masing 5 opsi A-E di "opsi_pg", tepat 1 opsi benar=true, bobot 1, JANGAN tulis label "A."/"B." di teks opsi, acak posisi jawaban benar)
- Isian Singkat (tipe "isian"): ${countIsian} soal (sertakan 1-3 variasi kunci jawaban singkat di "kunci_isian", bobot 2)
- Menjodohkan (tipe "jodoh"): ${countJodoh} soal (masing-masing 3-4 pasangan kiri & kanan unik di "pasangan_jodoh", bobot 3)
- Essay / Uraian (tipe "essay"): ${countEssay} soal (pertanyaan uraian yang jelas, bobot 5)

Kembalikan HANYA JSON array sesuai skema.`;

    let lastError = "Gagal menghubungi Gemini API.";
    let parsedArray: unknown[] | null = null;

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
            temperature: 0.7,
            maxOutputTokens: 16384,
            responseMimeType: "application/json",
            responseSchema: RESPONSE_SCHEMA,
          },
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        lastError = `Gemini (${model}) error ${resp.status}: ${errText.slice(0, 180)}`;
        continue;
      }

      const data = await resp.json();
      const parts: Array<{ thought?: boolean; text?: string }> =
        data?.candidates?.[0]?.content?.parts || [];

      // Saring keluar bagian "thought" dari thinking models agar hanya JSON jawaban yang diambil
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

    if (!parsedArray) {
      return NextResponse.json(
        { error: `${lastError} Silakan coba klik Generate ulang.` },
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
        { error: "AI tidak menghasilkan soal yang valid. Coba ulangi." },
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
