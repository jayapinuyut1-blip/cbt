/**
 * Kompres gambar di sisi browser sebelum upload ke Supabase Storage
 * agar kuota penyimpanan 1 GB Free Tier sangat hemat dan loading ujian cepat.
 */
export async function compressImageFile(
  file: File,
  maxWidth = 1200,
  quality = 0.8
): Promise<Blob> {
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
      canvas.toBlob(
        (blob) => {
          if (!blob) resolve(file);
          else resolve(blob);
        },
        file.type === "image/png" ? "image/png" : "image/jpeg",
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
