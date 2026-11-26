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
    const id = String(body.id || "");
    const action = String(body.action || "update");
    if (!id) {
      return NextResponse.json({ error: "ID pengguna wajib ada." }, { status: 400 });
    }

    const admin = createAdminSupabase();

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
