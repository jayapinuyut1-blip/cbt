import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getCurrentUserProfile } from "@/lib/server-auth";

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
    const examId = Number(body.exam_id);
    const classIds: number[] = Array.isArray(body.kelas_ids)
      ? body.kelas_ids
          .map((x: unknown) => Number(x))
          .filter((n: number) => Number.isFinite(n) && n > 0)
      : [];
    const sesi = String(body.sesi || "Jam II").trim();
    const mulai = String(body.mulai || "");
    const selesai = String(body.selesai || "");

    if (!examId) {
      return NextResponse.json(
        { error: "ID ujian tidak valid." },
        { status: 400 }
      );
    }

    const admin = createAdminSupabase();

    // Cek keberadaan ujian & izin mapel jika user adalah Guru
    const { data: exam } = await admin
      .from("exams")
      .select("id, subject_id")
      .eq("id", examId)
      .single();

    if (!exam) {
      return NextResponse.json(
        { error: "Ujian tidak ditemukan." },
        { status: 404 }
      );
    }

    if (profile.role === "guru") {
      const { data: link } = await admin
        .from("teacher_subjects")
        .select("subject_id")
        .eq("guru_id", profile.id)
        .eq("subject_id", exam.subject_id)
        .maybeSingle();
      if (!link) {
        return NextResponse.json(
          { error: "Anda tidak mengampu mata pelajaran ujian ini." },
          { status: 403 }
        );
      }
    }

    // Hapus jadwal lama ujian ini lalu tulis jadwal baru bila kelas & waktu diisi
    await admin.from("exam_schedules").delete().eq("exam_id", examId);

    if (classIds.length > 0 && mulai && selesai) {
      if (new Date(selesai).getTime() <= new Date(mulai).getTime()) {
        return NextResponse.json(
          { error: "Waktu selesai harus lebih besar dari waktu mulai." },
          { status: 400 }
        );
      }

      const rows = classIds.map((kelas_id) => ({
        exam_id: examId,
        kelas_id,
        sesi,
        mulai,
        selesai,
      }));

      const { error: insErr } = await admin.from("exam_schedules").insert(rows);
      if (insErr) {
        return NextResponse.json({ error: insErr.message }, { status: 400 });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Save exam schedule error:", err);
    return NextResponse.json(
      { error: "Gagal menyimpan jadwal ujian." },
      { status: 500 }
    );
  }
}
