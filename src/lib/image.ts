/**
 * Kompres gambar di sisi browser ke format WebP (lebar maks 900px) sebelum upload
 * sehingga ukuran 1 gambar soal rata-rata hanya 40-80 KB (hemat kuota & cepat di HP siswa).
 */
export async function compressImageFile(
  file: File,
  maxWidth = 900,
  quality = 0.78
): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(file);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);

      // Utamakan WebP (jauh lebih kecil, tetap mendukung transparansi logo PNG)
      const targetMime = "image/webp";
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file);
            return;
          }
          const ext = blob.type === "image/webp" ? "webp" : "jpg";
          const baseName = file.name.replace(/\.[^.]+$/, "") || "image";
          resolve(new File([blob], `${baseName}.${ext}`, { type: blob.type }));
        },
        targetMime,
        quality
      );
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });
}

/**
 * Normalisasi URL gambar eksternal — otomatis mengonversi link share Google Drive
 * menjadi URL thumbnail resolusi tinggi agar bisa tampil di tag <img>.
 */
export function normalizeExternalImageUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return "";

  // Format: https://drive.google.com/file/d/FILE_ID/view...
  const matchFile = trimmed.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (matchFile?.[1]) {
    return `https://drive.google.com/thumbnail?id=${matchFile[1]}&sz=w1200`;
  }

  // Format: https://drive.google.com/open?id=FILE_ID atau uc?id=FILE_ID
  const matchId = trimmed.match(/drive\.google\.com\/(?:open|uc)\?.*[?&]?id=([a-zA-Z0-9_-]+)/);
  if (matchId?.[1]) {
    return `https://drive.google.com/thumbnail?id=${matchId[1]}&sz=w1200`;
  }

  return trimmed;
}
