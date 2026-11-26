import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getCurrentUserProfile } from "@/lib/server-auth";

export async function POST(request: Request) {
  const { profile } = await getCurrentUserProfile();
  if (!profile || (profile.role !== "admin" && profile.role !== "guru")) {
    return NextResponse.json(
      { error: "Akses khusus Admin atau Guru." },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const examId = Number(body.exam_id);
    const studentIds: string[] = Array.isArray(body.student_ids)
      ? body.student_ids.map((x: unknown) => String(x)).filter(Boolean)
      : [];
    const mulai = String(body.mulai || "");
    const selesai = String(body.selesai || "");
    const durasi = body.durasi ? Number(body.durasi) : null;
    const aturanRemedial = body.aturan_remedial
      ? String(body.aturan_remedial)
      : null;

    if (!examId || studentIds.length === 0 || !mulai || !selesai) {
      return NextResponse.json(
        { error: "Ujian, daftar siswa, dan jadwal remedial wajib diisi." },
        { status: 400 }
      );
    }

    if (new Date(selesai).getTime() <= new Date(mulai).getTime()) {
      return NextResponse.json(
        { error: "Waktu selesai remedial harus lebih besar dari waktu mulai." },
        { status: 400 }
      );
    }

    const admin = createAdminSupabase();

    const { data: exam } = await admin
      .from("exams")
      .select("id, subject_id, durasi")
      .eq("id", examId)
      .single();

    if (!exam) {
      return NextResponse.json(
        { error: "Ujian tidak ditemukan." },
        { status: 404 }
      );
    }

    // Jika Guru, verifikasi mapel yang diampu
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

    // Update aturan remedial pada ujian jika dipilih
    if (
      aturanRemedial &&
      ["maks_kkm", "nilai_terbaik", "nilai_terakhir"].includes(aturanRemedial)
    ) {
      await admin
        .from("exams")
        .update({ aturan_remedial: aturanRemedial })
        .eq("id", examId);
    }

    // Cari percobaan tertinggi masing-masing siswa untuk membuka attempt_ke berikutnya
    const { data: existingAttempts } = await admin
      .from("attempts")
      .select("student_id, attempt_ke")
      .eq("exam_id", examId)
      .in("student_id", studentIds);

    const maxKeByStudent = new Map<string, number>();
    for (const a of existingAttempts || []) {
      const curr = maxKeByStudent.get(a.student_id) || 0;
      const ke = a.attempt_ke || 1;
      if (ke > curr) maxKeByStudent.set(a.student_id, ke);
    }

    const overrideRows = studentIds.map((student_id) => ({
      exam_id: examId,
      student_id,
      durasi: durasi || exam.durasi,
      mulai,
      selesai,
      allow_remedial: true,
      remedial_ke: Math.max(2, (maxKeByStudent.get(student_id) || 1) + 1),
    }));

    const { error: upErr } = await admin
      .from("exam_overrides")
      .upsert(overrideRows, { onConflict: "exam_id,student_id" });

    if (upErr) {
      return NextResponse.json(
        {
          error:
            upErr.message +
            " (Pastikan supabase/patch_remedial_and_reset.sql sudah dijalankan di Supabase SQL Editor)",
        },
        { status: 400 }
      );
    }

    // Reset active_session_id agar siswa remedial bisa login dengan mulus
    await admin
      .from("profiles")
      .update({ active_session_id: null })
      .in("id", studentIds);

    return NextResponse.json({
      ok: true,
      openedCount: studentIds.length,
    });
  } catch (err) {
    console.error("Open remedial error:", err);
    return NextResponse.json(
      { error: "Gagal membuka jadwal remedial." },
      { status: 500 }
    );
  }
}
