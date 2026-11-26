import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabase, createAdminSupabase } from "@/lib/supabase/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth-utils";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const localSession = request.cookies.get(SESSION_COOKIE_NAME)?.value;
      const admin = createAdminSupabase();
      const { data: profile } = await admin
        .from("profiles")
        .select("active_session_id")
        .eq("id", user.id)
        .single();

      // Hanya hapus active_session_id jika cocok dengan perangkat ini
      if (
        !profile?.active_session_id ||
        profile.active_session_id === localSession
      ) {
        await admin
          .from("profiles")
          .update({ active_session_id: null })
          .eq("id", user.id);
      }
    }

    await supabase.auth.signOut();

    const res = NextResponse.json({ ok: true });
    res.cookies.delete(SESSION_COOKIE_NAME);
    return res;
  } catch (err) {
    console.error("Logout error:", err);
    return NextResponse.json({ ok: true });
  }
}
