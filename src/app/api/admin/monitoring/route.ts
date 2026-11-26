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
