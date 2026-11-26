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
    // mappings: [{ from_kelas_id: number, to_kelas_id: number | 'lulus' }]
    const mappings: Array<{ from_kelas_id: number; to_kelas_id: number | "lulus" }> =
      body.mappings || [];

    const admin = createAdminSupabase();
    let promoted = 0;
    let graduated = 0;

    for (const m of mappings) {
      if (!m.from_kelas_id || !m.to_kelas_id) continue;
      if (m.to_kelas_id === "lulus") {
        const { data } = await admin
          .from("profiles")
          .update({ aktif: false, active_session_id: null })
          .eq("role", "siswa")
          .eq("kelas_id", m.from_kelas_id)
          .eq("aktif", true)
          .select("id");
        graduated += data?.length || 0;
      } else {
        const { data } = await admin
          .from("profiles")
          .update({ kelas_id: Number(m.to_kelas_id) })
          .eq("role", "siswa")
          .eq("kelas_id", m.from_kelas_id)
          .eq("aktif", true)
          .select("id");
        promoted += data?.length || 0;
      }
    }

    return NextResponse.json({ ok: true, promoted, graduated });
  } catch (err) {
    console.error("Promote error:", err);
    return NextResponse.json(
      { error: "Gagal memproses kenaikan kelas." },
      { status: 500 }
    );
  }
}
