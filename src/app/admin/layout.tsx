import AppShell from "@/components/AppShell";
import { getSchoolSettings, requireRole } from "@/lib/server-auth";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [profile, settings] = await Promise.all([
    requireRole(["admin"]),
    getSchoolSettings(),
  ]);

  return (
    <AppShell profile={profile} settings={settings}>
      {children}
    </AppShell>
  );
}
