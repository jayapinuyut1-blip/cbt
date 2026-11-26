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

const GEMINI_MODELS = [
  "gemini-flash-latest",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-3.8-flash",
];

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
    const selectedCps: Array<{ elemen: string; deskripsi: string }> = Array.isArray(
      body.selectedCps
    )
      ? body.selectedCps
      : [];
    const gradeLevel = String(body.gradeLevel || "Kelas X SMK (Fase E)").trim();
    const difficulty = String(body.difficulty || "Sedang").trim();
    const countPg = Math.max(0, Math.min(30, Number(body.countPg || 0)));
    const countIsian = Math.max(0, Math.min(15, Number(body.countIsian || 0)));
    const countJodoh = Math.max(0, Math.min(10, Number(body.countJodoh || 0)));
    const countEssay = Math.max(0, Math.min(10, Number(body.countEssay || 0)));
    const customApiKey = String(body.apiKey || "").trim();

    if (!topic && selectedCps.length === 0) {
      return NextResponse.json(
        {
          error:
            "Pilih minimal satu Capaian Pembelajaran (CP) atau isi topik/materi acuan.",
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

    const apiKey = customApiKey || process.env.GEMINI_API_KEY || "";
    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "GEMINI_API_KEY belum disetel di server (.env.local / Vercel). Masukkan API key Anda di kolom opsional, atau gunakan tab 'Mode Prompt Gratis (Copy-Paste)'.",
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
- Pilihan Ganda (tipe "pg"): ${countPg} soal (masing-masing 5 opsi A-E, tepat 1 opsi benar, bobot 1)
- Isian Singkat (tipe "isian"): ${countIsian} soal (sertakan 1-3 variasi kunci jawaban singkat di "kunci_isian", bobot 2)
- Menjodohkan (tipe "jodoh"): ${countJodoh} soal (masing-masing 3-4 pasangan kiri & kanan yang unik dan tidak ambigu di "pasangan_jodoh", bobot 3)
- Essay / Uraian (tipe "essay"): ${countEssay} soal (pertanyaan uraian yang jelas, bobot 5)

ATURAN OUTPUT:
Kembalikan HANYA JSON valid berbentuk array of objects tanpa markdown atau teks tambahan.
Format setiap objek:
1) Untuk tipe "pg":
{"tipe":"pg","teks":"...","bobot":1,"opsi_pg":[{"teks":"...","benar":false},{"teks":"...","benar":true},{"teks":"...","benar":false},{"teks":"...","benar":false},{"teks":"...","benar":false}]}
2) Untuk tipe "isian":
{"tipe":"isian","teks":"...","bobot":2,"kunci_isian":["jawaban 1","variasi 2"]}
3) Untuk tipe "jodoh":
{"tipe":"jodoh","teks":"Pasangkan pernyataan berikut dengan tepat:","bobot":3,"pasangan_jodoh":[{"kiri":"...","kanan":"..."},{"kiri":"...","kanan":"..."},{"kiri":"...","kanan":"..."}]}
4) Untuk tipe "essay":
{"tipe":"essay","teks":"...","bobot":5}

Pastikan jawaban benar pada PG tersebar acak (tidak selalu di opsi pertama) dan jangan tulis label "A.", "B." di dalam teks opsi.`;

    let lastError = "Gagal menghubungi Gemini API.";
    let rawText = "";

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
            responseMimeType: "application/json",
          },
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        lastError = `Gemini (${model}) error ${resp.status}: ${errText.slice(0, 220)}`;
        continue;
      }

      const data = await resp.json();
      rawText =
        data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      if (rawText) break;
    }

    if (!rawText) {
      return NextResponse.json({ error: lastError }, { status: 502 });
    }

    const cleaned = rawText
      .trim()
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "");

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return NextResponse.json(
        { error: "Respon AI bukan JSON valid. Coba klik Generate ulang." },
        { status: 502 }
      );
    }

    const arr = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as { questions?: unknown[] })?.questions)
      ? (parsed as { questions: unknown[] }).questions
      : [];

    const valid: GeneratedQuestion[] = [];
    for (const item of arr) {
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
            return { teks: String(r?.teks || "").trim(), benar: Boolean(r?.benar) };
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
