import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getCurrentUserProfile } from "@/lib/server-auth";
import { generateInitialPassword, usernameToEmail } from "@/lib/auth-utils";

async function assertAdmin() {
  const { profile } = await getCurrentUserProfile();
  if (!profile || profile.role !== "admin") {
    return null;
  }
  return profile;
}

export async function POST(request: Request) {
  const me = await assertAdmin();
  if (!me) {
    return NextResponse.json({ error: "Akses khusus Admin." }, { status: 403 });
  }

  try {
    const body = await request.json();
    const list: Array<{
      username: string;
      nama: string;
      role: "admin" | "guru" | "siswa";
      kelas_id?: number | null;
      subject_ids?: number[];
      password?: string;
    }> = Array.isArray(body.users) ? body.users : [body];

    const admin = createAdminSupabase();
    const created: Array<{ username: string; nama: string; password: string }> = [];
    const errors: Array<{ username: string; reason: string }> = [];

    for (const item of list) {
      const username = String(item.username || "").trim();
      const nama = String(item.nama || "").trim();
      const role = item.role || "siswa";
      if (!username || !nama) {
        errors.push({ username: username || "(kosong)", reason: "Username/NIS dan nama wajib diisi." });
        continue;
      }

      const rawPassword =
        item.password && String(item.password).trim().length >= 6
          ? String(item.password).trim()
          : generateInitialPassword(6);

      const email = usernameToEmail(username);
      const { data: authData, error: authErr } = await admin.auth.admin.createUser({
        email,
        password: rawPassword,
        email_confirm: true,
      });

      if (authErr || !authData.user) {
        errors.push({
          username,
          reason: authErr?.message || "Username/NIS mungkin sudah terdaftar.",
        });
        continue;
      }

      const { error: profErr } = await admin.from("profiles").insert({
        id: authData.user.id,
        username,
        nama,
        role,
        kelas_id: role === "siswa" ? item.kelas_id || null : null,
        wajib_ganti_sandi: role !== "admin",
        kata_sandi_awal: rawPassword,
        aktif: true,
      });

      if (profErr) {
        await admin.auth.admin.deleteUser(authData.user.id);
        errors.push({ username, reason: profErr.message });
        continue;
      }

      if (role === "guru" && Array.isArray(item.subject_ids) && item.subject_ids.length > 0) {
        await admin.from("teacher_subjects").insert(
          item.subject_ids.map((sid) => ({
            guru_id: authData.user.id,
            subject_id: Number(sid),
          }))
        );
      }

      created.push({ username, nama, password: rawPassword });
    }

    return NextResponse.json({
      ok: true,
      createdCount: created.length,
      errorCount: errors.length,
      created,
      errors,
    });
  } catch (err) {
    console.error("Admin users POST error:", err);
    return NextResponse.json({ error: "Gagal menambah pengguna." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const me = await assertAdmin();
  if (!me) {
    return NextResponse.json({ error: "Akses khusus Admin." }, { status: 403 });
  }

  try {
    const body = await request.json();
    const action = String(body.action || "update");
    const admin = createAdminSupabase();

    // Aksi Massal: Pasangkan banyak siswa ke kelas / jurusan
    if (action === "bulk_assign_class") {
      const studentIds: string[] = Array.isArray(body.student_ids)
        ? body.student_ids.map((x: unknown) => String(x)).filter(Boolean)
        : [];
      const kelasId = body.kelas_id ? Number(body.kelas_id) : null;
      if (studentIds.length === 0) {
        return NextResponse.json(
          { error: "Pilih minimal 1 siswa terlebih dahulu." },
          { status: 400 }
        );
      }

      const { error: upErr } = await admin
        .from("profiles")
        .update({ kelas_id: kelasId, aktif: true })
        .eq("role", "siswa")
        .in("id", studentIds);

      if (upErr) {
        return NextResponse.json({ error: upErr.message }, { status: 400 });
      }
      return NextResponse.json({ ok: true, updatedCount: studentIds.length });
    }

    // Aksi Massal: Naik Kelas Otomatis berdasarkan pola kelas SMKN 3 (X -> XI -> XII -> Lulus)
    if (action === "bulk_promote_smart") {
      const studentIds: string[] = Array.isArray(body.student_ids)
        ? body.student_ids.map((x: unknown) => String(x)).filter(Boolean)
        : [];
      if (studentIds.length === 0) {
        return NextResponse.json(
          { error: "Pilih minimal 1 siswa untuk naik kelas." },
          { status: 400 }
        );
      }

      const [{ data: allClasses }, { data: targetStudents }] = await Promise.all([
        admin.from("classes").select("id, nama"),
        admin
          .from("profiles")
          .select("id, kelas_id")
          .eq("role", "siswa")
          .in("id", studentIds),
      ]);

      const classById = new Map<number, string>(
        (allClasses || []).map((c) => [c.id, c.nama.trim()])
      );
      const classByNormName = new Map<string, number>(
        (allClasses || []).map((c) => [c.nama.trim().toLowerCase(), c.id])
      );

      let promotedCount = 0;
      let graduatedCount = 0;
      let unmatchedCount = 0;

      for (const st of targetStudents || []) {
        if (!st.kelas_id) {
          unmatchedCount++;
          continue;
        }
        const currName = classById.get(st.kelas_id) || "";
        const upper = currName.toUpperCase();

        if (upper.startsWith("XII ") || upper.startsWith("XII.")) {
          await admin
            .from("profiles")
            .update({ aktif: false, active_session_id: null })
            .eq("id", st.id);
          graduatedCount++;
        } else if (upper.startsWith("XI ") || upper.startsWith("XI.")) {
          const rest = currName.slice(2).trim();
          const nextId =
            classByNormName.get(`xii ${rest}`.toLowerCase()) ||
            classByNormName.get(`xii.${rest}`.toLowerCase());
          if (nextId) {
            await admin
              .from("profiles")
              .update({ kelas_id: nextId })
              .eq("id", st.id);
            promotedCount++;
          } else {
            unmatchedCount++;
          }
        } else if (upper.startsWith("X ") || upper.startsWith("X.")) {
          const rest = currName.slice(1).trim();
          const nextId =
            classByNormName.get(`xi ${rest}`.toLowerCase()) ||
            classByNormName.get(`xi.${rest}`.toLowerCase());
          if (nextId) {
            await admin
              .from("profiles")
              .update({ kelas_id: nextId })
              .eq("id", st.id);
            promotedCount++;
          } else {
            unmatchedCount++;
          }
        } else {
          unmatchedCount++;
        }
      }

      return NextResponse.json({
        ok: true,
        promotedCount,
        graduatedCount,
        unmatchedCount,
      });
    }

    const id = String(body.id || "");
    if (!id) {
      return NextResponse.json({ error: "ID pengguna wajib ada." }, { status: 400 });
    }

    if (action === "reset_password") {
      const newPassword =
        body.password && String(body.password).length >= 6
          ? String(body.password)
          : generateInitialPassword(6);

      const { error: authErr } = await admin.auth.admin.updateUserById(id, {
        password: newPassword,
      });
      if (authErr) {
        return NextResponse.json({ error: authErr.message }, { status: 400 });
      }

      await admin
        .from("profiles")
        .update({
          wajib_ganti_sandi: true,
          kata_sandi_awal: newPassword,
          active_session_id: null,
        })
        .eq("id", id);

      return NextResponse.json({ ok: true, newPassword });
    }

    if (action === "reset_login") {
      await admin
        .from("profiles")
        .update({ active_session_id: null })
        .eq("id", id);
      return NextResponse.json({ ok: true });
    }

    if (action === "set_subjects") {
      const subjectIds: number[] = Array.isArray(body.subject_ids)
        ? body.subject_ids.map((x: unknown) => Number(x)).filter((n: number) => Number.isFinite(n) && n > 0)
        : [];

      const { error: delErr } = await admin
        .from("teacher_subjects")
        .delete()
        .eq("guru_id", id);
      if (delErr) {
        return NextResponse.json({ error: delErr.message }, { status: 400 });
      }

      if (subjectIds.length > 0) {
        const { error: insErr } = await admin.from("teacher_subjects").insert(
          subjectIds.map((subject_id) => ({ guru_id: id, subject_id }))
        );
        if (insErr) {
          return NextResponse.json({ error: insErr.message }, { status: 400 });
        }
      }
      return NextResponse.json({ ok: true });
    }

    if (action === "toggle_block") {
      const is_blocked = Boolean(body.is_blocked);
      await admin
        .from("profiles")
        .update({
          is_blocked,
          ...(is_blocked ? { active_session_id: null } : {}),
        })
        .eq("id", id);
      return NextResponse.json({ ok: true });
    }

    const updates: Record<string, unknown> = {};
    if (body.nama !== undefined) updates.nama = String(body.nama).trim();
    if (body.kelas_id !== undefined) updates.kelas_id = body.kelas_id || null;
    if (body.aktif !== undefined) updates.aktif = Boolean(body.aktif);

    const { error } = await admin.from("profiles").update(updates).eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Admin users PATCH error:", err);
    return NextResponse.json({ error: "Gagal mengubah pengguna." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const me = await assertAdmin();
  if (!me) {
    return NextResponse.json({ error: "Akses khusus Admin." }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "ID pengguna wajib ada." }, { status: 400 });
    }
    if (id === me.id) {
      return NextResponse.json(
        { error: "Tidak dapat menghapus akun sendiri." },
        { status: 400 }
      );
    }

    const admin = createAdminSupabase();
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Admin users DELETE error:", err);
    return NextResponse.json({ error: "Gagal menghapus pengguna." }, { status: 500 });
  }
}
