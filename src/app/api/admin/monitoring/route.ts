import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getCurrentUserProfile } from "@/lib/server-auth";

export async function POST(request: Request) {
  const { profile } = await getCurrentUserProfile();
  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Akses khusus Admin." }, { status: 403 });
  }

  try {
    const body = await request.json();
    const action = String(body.action || "");
    const studentId = body.student_id ? String(body.student_id) : null;
    const attemptId = body.attempt_id ? Number(body.attempt_id) : null;

    const admin = createAdminSupabase();

    if (action === "reset_login" && studentId) {
      await admin
        .from("profiles")
        .update({ active_session_id: null })
        .eq("id", studentId);

      if (attemptId) {
        await admin.from("attempt_logs").insert({
          attempt_id: attemptId,
          jenis: "reset_login",
        });
      }
      return NextResponse.json({ ok: true });
    }

    if (action === "reset_login_bulk") {
      const studentIds: string[] = Array.isArray(body.student_ids)
        ? body.student_ids.map((x: unknown) => String(x)).filter(Boolean)
        : [];
      if (studentIds.length === 0) {
        return NextResponse.json(
          { error: "Tidak ada siswa yang dipilih." },
          { status: 400 }
        );
      }
      await admin
        .from("profiles")
        .update({ active_session_id: null })
        .in("id", studentIds);
      return NextResponse.json({ ok: true, count: studentIds.length });
    }

    if (action === "reset_attempt_total" && attemptId) {
      // Hapus percobaan bermasalah (beserta jawaban & log) agar siswa bisa mulai dari awal
      const { error: delErr } = await admin
        .from("attempts")
        .delete()
        .eq("id", attemptId);
      if (delErr) {
        return NextResponse.json({ error: delErr.message }, { status: 400 });
      }
      if (studentId) {
        await admin
          .from("profiles")
          .update({ active_session_id: null })
          .eq("id", studentId);
      }
      return NextResponse.json({ ok: true });
    }

    if (action === "add_time" && attemptId) {
      const minutes = Math.max(1, Math.min(180, Number(body.minutes || 10)));
      const { data: att } = await admin
        .from("attempts")
        .select("extra_minutes")
        .eq("id", attemptId)
        .single();

      if (!att) {
        return NextResponse.json({ error: "Attempt tidak ditemukan." }, { status: 404 });
      }

      await admin
        .from("attempts")
        .update({ extra_minutes: (att.extra_minutes || 0) + minutes })
        .eq("id", attemptId);

      return NextResponse.json({ ok: true });
    }

    if (action === "force_finish" && attemptId) {
      const { data, error } = await admin.rpc("recalculate_attempt_score", {
        p_attempt_id: attemptId,
      });
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      return NextResponse.json({ ok: true, result: data });
    }

    if (action === "reopen_attempt" && attemptId) {
      const minutes = Math.max(5, Number(body.minutes || 30));
      const { data: att } = await admin
        .from("attempts")
        .select("extra_minutes")
        .eq("id", attemptId)
        .single();

      if (!att) {
        return NextResponse.json({ error: "Attempt tidak ditemukan." }, { status: 404 });
      }

      await admin
        .from("attempts")
        .update({
          status: "mengerjakan",
          selesai: null,
          extra_minutes: (att.extra_minutes || 0) + minutes,
          last_active_at: new Date().toISOString(),
        })
        .eq("id", attemptId);

      return NextResponse.json({ ok: true });
    }

    if (action === "unlock_attempt" && attemptId) {
      const { error: updErr } = await admin
        .from("attempts")
        .update({
          is_locked: false,
          locked_reason: null,
          pelanggaran_count: 0,
          last_active_at: new Date().toISOString(),
        })
        .eq("id", attemptId);
      if (updErr) {
        return NextResponse.json({ error: updErr.message }, { status: 400 });
      }
      await admin.from("attempt_logs").insert({
        attempt_id: attemptId,
        jenis: "buka_kunci",
      });
      return NextResponse.json({ ok: true });
    }

    if (action === "toggle_block" && studentId) {
      const is_blocked = Boolean(body.is_blocked);
      await admin
        .from("profiles")
        .update({
          is_blocked,
          ...(is_blocked ? { active_session_id: null } : {}),
        })
        .eq("id", studentId);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Aksi tidak dikenali." }, { status: 400 });
  } catch (err) {
    console.error("Monitoring action error:", err);
    return NextResponse.json({ error: "Gagal memproses aksi." }, { status: 500 });
  }
}
