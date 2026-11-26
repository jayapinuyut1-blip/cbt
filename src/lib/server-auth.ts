import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth-utils";
import type { Profile, SchoolSettings, UserRole } from "@/types/cbt";

function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export async function getCurrentUserProfile(): Promise<{
  profile: Profile | null;
  sessionMismatch: boolean;
}> {
  if (!isSupabaseConfigured()) {
    return { profile: null, sessionMismatch: false };
  }
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { profile: null, sessionMismatch: false };

  const { data: profile } = await supabase
    .from("profiles")
    .select("*, classes(id, nama)")
    .eq("id", user.id)
    .single();

  if (!profile) return { profile: null, sessionMismatch: false };

  const cookieStore = await cookies();
  const localSessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  const sessionMismatch = Boolean(
    profile.role === "siswa" &&
      (!profile.active_session_id ||
        !localSessionId ||
        profile.active_session_id !== localSessionId)
  );

  return { profile: profile as Profile, sessionMismatch };
}

export async function requireRole(allowedRoles: UserRole[]): Promise<Profile> {
  const { profile, sessionMismatch } = await getCurrentUserProfile();
  if (!profile) {
    redirect("/login");
  }
  if (!profile.aktif) {
    redirect("/login?error=akun_nonaktif");
  }
  if (sessionMismatch) {
    redirect("/login?error=sesi_ganda");
  }
  if (profile.wajib_ganti_sandi) {
    redirect("/ganti-sandi");
  }
  if (!allowedRoles.includes(profile.role)) {
    redirect(`/${profile.role}`);
  }
  return profile;
}

export async function getSchoolSettings(): Promise<SchoolSettings> {
  if (!isSupabaseConfigured()) {
    return {
      nama_sekolah: "SMK Negeri 3 Kotamobagu",
      logo: "",
      alamat_sekolah: "",
    };
  }
  try {
    const supabase = await createServerSupabase();
    const { data } = await supabase.from("settings").select("kunci, nilai");
    const map: Record<string, string> = {};
    (data || []).forEach((row) => {
      map[row.kunci] = row.nilai;
    });
    return {
      nama_sekolah: map.nama_sekolah || "SMK Negeri 3 Kotamobagu",
      logo: map.logo || "",
      alamat_sekolah: map.alamat_sekolah || "",
    };
  } catch {
    return {
      nama_sekolah: "SMK Negeri 3 Kotamobagu",
      logo: "",
      alamat_sekolah: "",
    };
  }
}
