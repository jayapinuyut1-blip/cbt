import { NextResponse } from "next/server";
import { createServerSupabase, createAdminSupabase } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Belum login." }, { status: 401 });
    }

    const body = await request.json();
    const newPassword = String(body.password || "");
    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: "Kata sandi baru minimal 6 karakter." },
        { status: 400 }
      );
    }

    const admin = createAdminSupabase();
    const { data: currProf } = await admin
      .from("profiles")
      .select("aktif, is_blocked")
      .eq("id", user.id)
      .single();

    if (!currProf || !currProf.aktif || currProf.is_blocked) {
      return NextResponse.json(
        { error: "Akun tidak aktif atau sedang diblokir." },
        { status: 403 }
      );
    }

    const { error: authErr } = await admin.auth.admin.updateUserById(user.id, {
      password: newPassword,
    });
    if (authErr) {
      return NextResponse.json({ error: authErr.message }, { status: 400 });
    }

    const { data: profile } = await admin
      .from("profiles")
      .update({
        wajib_ganti_sandi: false,
        kata_sandi_awal: null,
      })
      .eq("id", user.id)
      .select("role")
      .single();

    return NextResponse.json({
      ok: true,
      redirectTo: profile?.role ? `/${profile.role}` : "/",
    });
  } catch (err) {
    console.error("Change password error:", err);
    return NextResponse.json(
      { error: "Gagal mengubah kata sandi." },
      { status: 500 }
    );
  }
}
