import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getCurrentUserProfile } from "@/lib/server-auth";
import { generateInitialPassword, usernameToEmail } from "@/lib/auth-utils";

const DEFAULT_ABSENSI_URL = "https://itzjuewgpzveuksvtgag.supabase.co";
const DEFAULT_ABSENSI_ANON =
  "sb_publishable_0pdXdb2g2VZWl1UHtX3bfQ_g5MsBEit";

export async function POST(request: Request) {
  const { profile } = await getCurrentUserProfile();
  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Akses khusus Admin." }, { status: 403 });
  }

  try {
    const body = await request.json();
    const absensiUrl = String(body.absensiUrl || DEFAULT_ABSENSI_URL).trim();
    const secretKey = String(body.secretKey || "").trim();
    const adminEmail = String(body.adminEmail || "").trim();
    const adminPassword = String(body.adminPassword || "");

    if (!secretKey && (!adminEmail || !adminPassword)) {
      return NextResponse.json(
        {
          error:
            "Isi Secret Key Supabase Absensi, ATAU isi Email & Password Admin SMK3 Absensi.",
        },
        { status: 400 }
      );
    }

    // 1. Koneksi ke Supabase SMK3 Absensi
    const sourceClient = createSupabaseClient(
      absensiUrl,
      secretKey || DEFAULT_ABSENSI_ANON,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    if (!secretKey) {
      const { error: signInErr } = await sourceClient.auth.signInWithPassword({
        email: adminEmail,
        password: adminPassword,
      });
      if (signInErr) {
        return NextResponse.json(
          { error: `Gagal login ke SMK3 Absensi: ${signInErr.message}` },
          { status: 401 }
        );
      }
    }

    // 2. Tarik Kelas, Profiles, Teachers, Students dari SMK3 Absensi
    const [
      { data: srcClasses, error: clsErr },
      { data: srcProfiles, error: profErr },
      { data: srcTeachers },
      { data: srcStudents },
    ] = await Promise.all([
      sourceClient
        .from("classes")
        .select("id, name, is_active")
        .eq("is_active", true),
      sourceClient
        .from("profiles")
        .select("id, role, full_name, username, email, status"),
      sourceClient.from("teachers").select("profile_id, nip, subject"),
      sourceClient
        .from("students")
        .select("profile_id, nis, nisn, current_class_id"),
    ]);

    if (clsErr) {
      return NextResponse.json(
        { error: `Gagal baca tabel classes Absensi: ${clsErr.message}` },
        { status: 400 }
      );
    }
    if (profErr) {
      return NextResponse.json(
        { error: `Gagal baca tabel profiles Absensi: ${profErr.message}` },
        { status: 400 }
      );
    }
    if (!srcProfiles || srcProfiles.length === 0) {
      return NextResponse.json(
        {
          error:
            "Tidak ada data profil yang terbaca dari SMK3 Absensi. Pastikan kredensial memiliki hak Admin/Secret Key.",
        },
        { status: 403 }
      );
    }

    const cbtAdmin = createAdminSupabase();

    // 3. Sinkronkan Kelas ke CBT (terkait Tahun Ajaran aktif)
    const { data: activeYear } = await cbtAdmin
      .from("academic_years")
      .select("id")
      .eq("aktif", true)
      .maybeSingle();

    const { data: existingClasses } = await cbtAdmin
      .from("classes")
      .select("id, nama");
    const classNameToCbtId = new Map<string, number>(
      (existingClasses || []).map((c) => [c.nama.trim().toLowerCase(), c.id])
    );

    const srcClassIdToCbtId = new Map<string, number>();
    let classesAdded = 0;

    for (const sc of srcClasses || []) {
      const key = String(sc.name || "").trim().toLowerCase();
      if (!key) continue;
      let cbtId = classNameToCbtId.get(key);
      if (!cbtId) {
        const { data: inserted } = await cbtAdmin
          .from("classes")
          .insert({
            nama: sc.name.trim(),
            tahun_ajaran_id: activeYear?.id || null,
          })
          .select("id")
          .single();
        if (inserted) {
          const newId = Number(inserted.id);
          cbtId = newId;
          classNameToCbtId.set(key, newId);
          classesAdded++;
        }
      }
      if (cbtId) {
        srcClassIdToCbtId.set(sc.id, cbtId);
      }
    }

    // 4. Sinkronkan Mata Pelajaran (jika ada di tabel teachers.subject)
    const uniqueSubjects = Array.from(
      new Set(
        (srcTeachers || [])
          .map((t) => String(t.subject || "").trim())
          .filter(Boolean)
      )
    );
    let subjectsAdded = 0;
    for (const subName of uniqueSubjects) {
      const { error } = await cbtAdmin
        .from("subjects")
        .upsert({ nama: subName }, { onConflict: "nama", ignoreDuplicates: true });
      if (!error) subjectsAdded++;
    }

    // 5. Kumpulkan Username CBT yang sudah ada
    const { data: existingProfiles } = await cbtAdmin
      .from("profiles")
      .select("id, username");
    const existingUsernames = new Set(
      (existingProfiles || []).map((p) => p.username.trim().toLowerCase())
    );

    const teacherByProfile = new Map(
      (srcTeachers || []).map((t) => [t.profile_id, t])
    );
    const studentByProfile = new Map(
      (srcStudents || []).map((s) => [s.profile_id, s])
    );

    let teachersCreated = 0;
    let teachersSkipped = 0;
    let studentsCreated = 0;
    let studentsSkipped = 0;
    const errors: string[] = [];

    for (const p of srcProfiles) {
      if (p.status === "rejected" || p.status === "suspended") continue;

      if (p.role === "guru") {
        const t = teacherByProfile.get(p.id);
        const rawUser =
          (t?.nip && t.nip.trim()) ||
          (p.username && p.username.trim()) ||
          (p.email && p.email.split("@")[0].trim()) ||
          "";
        const cleanUser = rawUser.replace(/[^a-zA-Z0-9._-]/g, "");
        if (!cleanUser) {
          errors.push(`Guru "${p.full_name}" tidak punya NIP/username.`);
          continue;
        }
        if (existingUsernames.has(cleanUser.toLowerCase())) {
          teachersSkipped++;
          continue;
        }

        const pwd = generateInitialPassword(6);
        const { data: created, error: cErr } =
          await cbtAdmin.auth.admin.createUser({
            email: usernameToEmail(cleanUser),
            password: pwd,
            email_confirm: true,
          });
        if (cErr || !created.user) {
          errors.push(`Guru ${cleanUser}: ${cErr?.message || "gagal"}`);
          continue;
        }
        const { error: insErr } = await cbtAdmin.from("profiles").insert({
          id: created.user.id,
          username: cleanUser,
          nama: p.full_name,
          role: "guru",
          wajib_ganti_sandi: true,
          kata_sandi_awal: pwd,
          aktif: true,
        });
        if (insErr) {
          await cbtAdmin.auth.admin.deleteUser(created.user.id);
          errors.push(`Guru ${cleanUser}: ${insErr.message}`);
          continue;
        }
        existingUsernames.add(cleanUser.toLowerCase());
        teachersCreated++;
      } else if (p.role === "siswa") {
        const s = studentByProfile.get(p.id);
        const rawUser =
          (s?.nis && s.nis.trim()) ||
          (s?.nisn && s.nisn.trim()) ||
          (p.username && p.username.trim()) ||
          (p.email && p.email.split("@")[0].trim()) ||
          "";
        const cleanUser = rawUser.replace(/[^a-zA-Z0-9._-]/g, "");
        if (!cleanUser) {
          errors.push(`Siswa "${p.full_name}" tidak punya NIS/NISN/username.`);
          continue;
        }
        const cbtKelasId = s?.current_class_id
          ? srcClassIdToCbtId.get(s.current_class_id) || null
          : null;

        if (existingUsernames.has(cleanUser.toLowerCase())) {
          studentsSkipped++;
          continue;
        }

        const pwd = generateInitialPassword(6);
        const { data: created, error: cErr } =
          await cbtAdmin.auth.admin.createUser({
            email: usernameToEmail(cleanUser),
            password: pwd,
            email_confirm: true,
          });
        if (cErr || !created.user) {
          errors.push(`Siswa ${cleanUser}: ${cErr?.message || "gagal"}`);
          continue;
        }
        const { error: insErr } = await cbtAdmin.from("profiles").insert({
          id: created.user.id,
          username: cleanUser,
          nama: p.full_name,
          role: "siswa",
          kelas_id: cbtKelasId,
          wajib_ganti_sandi: true,
          kata_sandi_awal: pwd,
          aktif: true,
        });
        if (insErr) {
          await cbtAdmin.auth.admin.deleteUser(created.user.id);
          errors.push(`Siswa ${cleanUser}: ${insErr.message}`);
          continue;
        }
        existingUsernames.add(cleanUser.toLowerCase());
        studentsCreated++;
      }
    }

    return NextResponse.json({
      ok: true,
      classesAdded,
      totalClassesFound: srcClasses?.length || 0,
      subjectsAdded,
      teachersCreated,
      teachersSkipped,
      studentsCreated,
      studentsSkipped,
      errors,
    });
  } catch (err) {
    console.error("Sync Absensi error:", err);
    return NextResponse.json(
      { error: "Terjadi kesalahan saat sinkronisasi data SMK3 Absensi." },
      { status: 500 }
    );
  }
}
