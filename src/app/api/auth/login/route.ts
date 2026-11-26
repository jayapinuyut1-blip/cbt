import { NextResponse, type NextRequest } from "next/server";
import crypto from "crypto";
import { createServerSupabase, createAdminSupabase } from "@/lib/supabase/server";
import { SESSION_COOKIE_NAME, usernameToEmail } from "@/lib/auth-utils";

// Rate limit sederhana in-memory (per IP + username): maks 8 percobaan gagal / 5 menit
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(key, { count: 0, resetAt: now + 5 * 60 * 1000 });
    return true;
  }
  return entry.count < 8;
}

function recordFailure(key: string) {
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(key, { count: 1, resetAt: now + 5 * 60 * 1000 });
  } else {
    entry.count += 1;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const username = String(body.username || "").trim();
    const password = String(body.password || "");

    if (!username || !password) {
      return NextResponse.json(
        { error: "NIS / Username dan kata sandi wajib diisi." },
        { status: 400 }
      );
    }

    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    const rateKey = `${ip}:${username.toLowerCase()}`;
    if (!checkRateLimit(rateKey)) {
      return NextResponse.json(
        {
          error:
            "Terlalu banyak percobaan login gagal. Silakan tunggu 5 menit lagi.",
        },
        { status: 429 }
      );
    }

    const supabase = await createServerSupabase();
    const email = usernameToEmail(username);

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.user) {
      recordFailure(rateKey);
      return NextResponse.json(
        { error: "NIS / Username atau kata sandi salah." },
        { status: 401 }
      );
    }

    const admin = createAdminSupabase();
    const { data: profile, error: profErr } = await admin
      .from("profiles")
      .select("*")
      .eq("id", data.user.id)
      .single();

    if (profErr || !profile) {
      await supabase.auth.signOut();
      return NextResponse.json(
        { error: "Profil pengguna tidak ditemukan di database." },
        { status: 403 }
      );
    }

    if (!profile.aktif) {
      await supabase.auth.signOut();
      return NextResponse.json(
        { error: "Akun Anda sudah tidak aktif. Hubungi admin sekolah." },
        { status: 403 }
      );
    }

    if (profile.is_blocked) {
      await supabase.auth.signOut();
      return NextResponse.json(
        { error: "Akun Anda sedang diblokir oleh pengawas ujian." },
        { status: 403 }
      );
    }

    const existingCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;

    // Penegakan 1 sesi aktif untuk siswa
    if (
      profile.role === "siswa" &&
      profile.active_session_id &&
      profile.active_session_id !== existingCookie
    ) {
      await supabase.auth.signOut();
      return NextResponse.json(
        {
          error:
            "Akun siswa sedang aktif di perangkat lain. Minta Admin/Pengawas untuk klik 'Reset Login'.",
        },
        { status: 409 }
      );
    }

    const sessionId =
      profile.role === "siswa" && profile.active_session_id
        ? profile.active_session_id
        : crypto.randomUUID();

    await admin
      .from("profiles")
      .update({ active_session_id: sessionId })
      .eq("id", profile.id);

    loginAttempts.delete(rateKey);

    const redirectTo = profile.wajib_ganti_sandi
      ? "/ganti-sandi"
      : `/${profile.role}`;

    const res = NextResponse.json({
      ok: true,
      role: profile.role,
      redirectTo,
    });

    res.cookies.set(SESSION_COOKIE_NAME, sessionId, {
      httpOnly: false,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 12,
    });

    return res;
  } catch (err) {
    console.error("Login error:", err);
    return NextResponse.json(
      { error: "Terjadi kesalahan server saat login." },
      { status: 500 }
    );
  }
}
