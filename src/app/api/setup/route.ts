import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { usernameToEmail } from "@/lib/auth-utils";

export async function GET() {
  try {
    const admin = createAdminSupabase();
    const { count, error } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");

    if (error) {
      return NextResponse.json(
        {
          ready: false,
          hasAdmin: false,
          error:
            "Tabel database belum siap. Jalankan file supabase/schema.sql di SQL Editor Supabase terlebih dahulu.",
        },
        { status: 200 }
      );
    }

    return NextResponse.json({
      ready: true,
      hasAdmin: (count || 0) > 0,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ready: false,
        hasAdmin: false,
        error:
          err instanceof Error
            ? err.message
            : "Konfigurasi .env Supabase belum lengkap.",
      },
      { status: 200 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const username = String(body.username || "").trim();
    const nama = String(body.nama || "").trim();
    const password = String(body.password || "");
    const secret = String(body.secret || "").trim();

    const expectedSecret = process.env.CBT_SETUP_SECRET;
    if (expectedSecret && secret !== expectedSecret) {
      return NextResponse.json(
        { error: "Kode rahasia setup tidak sesuai." },
        { status: 403 }
      );
    }

    if (!username || !nama || password.length < 6) {
      return NextResponse.json(
        { error: "Username, nama, dan kata sandi (min 6 karakter) wajib diisi." },
        { status: 400 }
      );
    }

    const admin = createAdminSupabase();
    const { count } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");

    if ((count || 0) > 0) {
      return NextResponse.json(
        { error: "Akun admin sudah ada. Halaman setup sudah terkunci." },
        { status: 403 }
      );
    }

    const email = usernameToEmail(username);
    const { data: created, error: createErr } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

    if (createErr || !created.user) {
      return NextResponse.json(
        { error: createErr?.message || "Gagal membuat akun auth." },
        { status: 400 }
      );
    }

    const { error: profErr } = await admin.from("profiles").insert({
      id: created.user.id,
      username,
      nama,
      role: "admin",
      wajib_ganti_sandi: false,
      aktif: true,
    });

    if (profErr) {
      await admin.auth.admin.deleteUser(created.user.id);
      return NextResponse.json({ error: profErr.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Setup error:", err);
    return NextResponse.json(
      { error: "Gagal membuat akun admin." },
      { status: 500 }
    );
  }
}
