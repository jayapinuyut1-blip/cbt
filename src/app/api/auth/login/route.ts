import { NextResponse, type NextRequest } from "next/server";
import crypto from "crypto";
import { createServerSupabase, createAdminSupabase } from "@/lib/supabase/server";
import { SESSION_COOKIE_NAME, usernameToEmail } from "@/lib/auth-utils";
import {
  checkLoginRateLimit,
  clearLoginRateLimit,
  recordLoginFailure,
} from "@/lib/rate-limit";
import { shouldBlockConcurrentStudentLogin } from "@/lib/session-guard";

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

    const admin = createAdminSupabase();
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    const rateKey = `${ip}:${username.toLowerCase()}`;
    const allowed = await checkLoginRateLimit(admin, rateKey);
    if (!allowed) {
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
      await recordLoginFailure(admin, rateKey);
      return NextResponse.json(
        { error: "NIS / Username atau kata sandi salah." },
        { status: 401 }
      );
    }

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

    // Smart Session Lock untuk siswa:
    // Blokir login ganda (409) hanya saat siswa sedang mengerjakan ujian aktif yang belum habis waktunya.
    // Jika sudah selesai ujian / lupa klik Keluar kemarin / ganti hari, izinkan otomatis dengan sesi baru.
    if (
      profile.role === "siswa" &&
      profile.active_session_id &&
      profile.active_session_id !== existingCookie
    ) {
      const { data: activeAttemptRow } = await admin
        .from("attempts")
        .select("mulai, tambahan_waktu, exams(durasi)")
        .eq("siswa_id", profile.id)
        .eq("status", "sedang_mengerjakan")
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();

      const examRef = activeAttemptRow?.exams as
        | { durasi?: number }
        | Array<{ durasi?: number }>
        | null
        | undefined;
      const durasiMenit = Array.isArray(examRef)
        ? Number(examRef[0]?.durasi || 0)
        : Number(examRef?.durasi || 0);

      const blocked = shouldBlockConcurrentStudentLogin({
        role: profile.role,
        activeSessionId: profile.active_session_id,
        existingCookie,
        activeAttempt: activeAttemptRow
          ? {
              mulai: activeAttemptRow.mulai,
              durasiMenit,
              tambahanWaktuMenit: activeAttemptRow.tambahan_waktu,
            }
          : null,
      });

      if (blocked) {
        await supabase.auth.signOut();
        return NextResponse.json(
          {
            error:
              "Akun siswa sedang mengerjakan ujian di perangkat lain. Minta Admin/Pengawas untuk klik 'Reset Login'.",
          },
          { status: 409 }
        );
      }
    }

    const sessionId =
      profile.role === "siswa" &&
      profile.active_session_id &&
      profile.active_session_id === existingCookie
        ? profile.active_session_id
        : crypto.randomUUID();

    await admin
      .from("profiles")
      .update({ active_session_id: sessionId })
      .eq("id", profile.id);

    await clearLoginRateLimit(admin, rateKey);

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
