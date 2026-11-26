import { redirect } from "next/navigation";
import { getCurrentUserProfile } from "@/lib/server-auth";

export default async function HomePage() {
  const { profile, sessionMismatch } = await getCurrentUserProfile();
  if (!profile || sessionMismatch) {
    redirect("/login");
  }
  if (profile.wajib_ganti_sandi) {
    redirect("/ganti-sandi");
  }
  redirect(`/${profile.role}`);
}
