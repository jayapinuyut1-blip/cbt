import type { SupabaseClient } from "@supabase/supabase-js";
import type { Subject } from "@/types/cbt";

/**
 * Mengambil daftar mata pelajaran yang boleh diakses pengguna yang sedang login.
 * - Admin: semua mata pelajaran
 * - Guru: hanya mata pelajaran yang dipasangkan di tabel teacher_subjects
 */
export async function fetchAllowedSubjectsForCurrentUser(
  supabase: SupabaseClient
): Promise<{ userId: string | null; role: string | null; subjects: Subject[] }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { userId: null, role: null, subjects: [] };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = profile?.role || null;

  if (role === "admin") {
    const { data } = await supabase.from("subjects").select("*").order("nama");
    return { userId: user.id, role, subjects: (data || []) as Subject[] };
  }

  const { data: links } = await supabase
    .from("teacher_subjects")
    .select("subject_id, subjects(id, nama)")
    .eq("guru_id", user.id);

  const list: Subject[] = [];
  for (const row of links || []) {
    const s = row.subjects as unknown as Subject | null;
    if (s && s.id) list.push(s);
  }
  list.sort((a, b) => a.nama.localeCompare(b.nama));

  return { userId: user.id, role, subjects: list };
}
