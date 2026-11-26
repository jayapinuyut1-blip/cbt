import { redirect } from "next/navigation";
import { getCurrentUserProfile, getSchoolSettings } from "@/lib/server-auth";
import LoginForm from "./LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const { profile, sessionMismatch } = await getCurrentUserProfile();

  if (profile && !sessionMismatch && !params.error) {
    if (profile.wajib_ganti_sandi) redirect("/ganti-sandi");
    redirect(`/${profile.role}`);
  }

  const settings = await getSchoolSettings();

  let initialError = "";
  if (params.error === "sesi_ganda") {
    initialError =
      "Sesi Anda telah berakhir karena login di perangkat lain atau direset oleh Admin.";
  } else if (params.error === "akun_nonaktif") {
    initialError = "Akun Anda sudah dinonaktifkan.";
  }

  return <LoginForm settings={settings} initialError={initialError} />;
}
