import { NextResponse } from "next/server";
import crypto from "crypto";
import { getCurrentUserProfile } from "@/lib/server-auth";
import { createAdminSupabase } from "@/lib/supabase/server";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB batas mentah setelah kompresi browser

function hasCloudinaryConfig() {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
  );
}

export async function POST(request: Request) {
  const { profile } = await getCurrentUserProfile();
  if (!profile || (profile.role !== "guru" && profile.role !== "admin")) {
    return NextResponse.json(
      { error: "Akses khusus Guru atau Admin." },
      { status: 403 }
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const folderRaw = String(formData.get("folder") || "questions");
    if (folderRaw === "school" && profile.role !== "admin") {
      return NextResponse.json(
        { error: "Hanya Admin yang dapat mengunggah logo sekolah." },
        { status: 403 }
      );
    }
    const folder = folderRaw === "school" ? "school" : "questions";

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Berkas gambar tidak ditemukan." },
        { status: 400 }
      );
    }

    if (!file.type.startsWith("image/")) {
      return NextResponse.json(
        { error: "Hanya berkas gambar (WebP, PNG, JPG) yang diperbolehkan." },
        { status: 400 }
      );
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "Ukuran gambar terlalu besar (maksimal 5 MB)." },
        { status: 400 }
      );
    }

    // 1. Prioritas Utama: Cloudinary (25 GB gratis tanpa kartu kredit + CDN global)
    if (hasCloudinaryConfig()) {
      const cloudName = process.env.CLOUDINARY_CLOUD_NAME!;
      const apiKey = process.env.CLOUDINARY_API_KEY!;
      const apiSecret = process.env.CLOUDINARY_API_SECRET!;
      const timestamp = Math.floor(Date.now() / 1000);
      const targetFolder = `cbt-smkn3/${folder}`;

      // Signature SHA-1 resmi Cloudinary (parameter urut alfabet)
      const paramsToSign = `folder=${targetFolder}&timestamp=${timestamp}${apiSecret}`;
      const signature = crypto
        .createHash("sha1")
        .update(paramsToSign)
        .digest("hex");

      const cloudForm = new FormData();
      cloudForm.append("file", file);
      cloudForm.append("api_key", apiKey);
      cloudForm.append("timestamp", String(timestamp));
      cloudForm.append("folder", targetFolder);
      cloudForm.append("signature", signature);

      const resp = await fetch(
        `https://api.cloudinary.com/v1_1/${encodeURIComponent(
          cloudName
        )}/image/upload`,
        {
          method: "POST",
          body: cloudForm,
        }
      );

      if (!resp.ok) {
        const errText = await resp.text();
        return NextResponse.json(
          { error: `Gagal upload ke Cloudinary: ${errText.slice(0, 180)}` },
          { status: 502 }
        );
      }

      const data = await resp.json();
      return NextResponse.json({
        ok: true,
        provider: "cloudinary",
        url: data.secure_url,
        bytes: file.size,
      });
    }

    // 2. Fallback Otomatis: Supabase Storage (bucket cbt-assets)
    const admin = createAdminSupabase();
    const arrayBuffer = await file.arrayBuffer();
    const ext =
      file.type === "image/webp"
        ? "webp"
        : file.type === "image/png"
        ? "png"
        : "jpg";
    const filePath = `${folder}/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 7)}.${ext}`;

    const { error: upErr } = await admin.storage
      .from("cbt-assets")
      .upload(filePath, Buffer.from(arrayBuffer), {
        contentType: file.type,
        upsert: true,
      });

    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 400 });
    }

    const { data: pub } = admin.storage
      .from("cbt-assets")
      .getPublicUrl(filePath);

    return NextResponse.json({
      ok: true,
      provider: "supabase",
      url: pub.publicUrl,
      bytes: file.size,
    });
  } catch (err) {
    console.error("Upload image error:", err);
    return NextResponse.json(
      { error: "Terjadi kesalahan saat mengunggah gambar." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const { profile } = await getCurrentUserProfile();
  if (!profile || (profile.role !== "guru" && profile.role !== "admin")) {
    return NextResponse.json({ error: "Akses ditolak." }, { status: 403 });
  }

  try {
    const body = await request.json();
    const url = String(body.url || "").trim();
    if (!url) return NextResponse.json({ ok: true });

    // Hapus otomatis jika file berasal dari Supabase Storage kita
    const marker = "/storage/v1/object/public/cbt-assets/";
    const idx = url.indexOf(marker);
    if (idx !== -1) {
      const storagePath = decodeURIComponent(url.slice(idx + marker.length));
      if (storagePath.startsWith("school/") && profile.role !== "admin") {
        return NextResponse.json({ error: "Akses ditolak." }, { status: 403 });
      }
      if (!storagePath.startsWith("questions/") && !storagePath.startsWith("school/")) {
        return NextResponse.json({ error: "Path berkas tidak valid." }, { status: 400 });
      }
      const admin = createAdminSupabase();
      await admin.storage.from("cbt-assets").remove([storagePath]);
      return NextResponse.json({ ok: true, deleted: "supabase" });
    }

    // Hapus otomatis jika file berasal dari Cloudinary kita
    if (hasCloudinaryConfig() && url.includes("res.cloudinary.com/")) {
      const match = url.match(/\/upload\/(?:v\d+\/)?(.+)\.[a-zA-Z0-9]+$/);
      if (match?.[1]) {
        const publicId = match[1];
        const allowedPrefix =
          profile.role === "admin" ? "cbt-smkn3/" : "cbt-smkn3/questions/";
        if (!publicId.startsWith(allowedPrefix)) {
          return NextResponse.json({ error: "Akses ditolak." }, { status: 403 });
        }
        const cloudName = process.env.CLOUDINARY_CLOUD_NAME!;
        const apiKey = process.env.CLOUDINARY_API_KEY!;
        const apiSecret = process.env.CLOUDINARY_API_SECRET!;
        const timestamp = Math.floor(Date.now() / 1000);
        const signature = crypto
          .createHash("sha1")
          .update(`public_id=${publicId}&timestamp=${timestamp}${apiSecret}`)
          .digest("hex");

        const form = new FormData();
        form.append("public_id", publicId);
        form.append("api_key", apiKey);
        form.append("timestamp", String(timestamp));
        form.append("signature", signature);

        await fetch(
          `https://api.cloudinary.com/v1_1/${encodeURIComponent(
            cloudName
          )}/image/destroy`,
          { method: "POST", body: form }
        );
        return NextResponse.json({ ok: true, deleted: "cloudinary" });
      }
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
