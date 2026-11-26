export const SESSION_COOKIE_NAME = "cbt_session_id";

export function usernameToEmail(username: string): string {
  const clean = username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
  const domain =
    process.env.NEXT_PUBLIC_CBT_EMAIL_DOMAIN || "cbt.smkn3.local";
  if (clean.includes("@")) return clean;
  return `${clean}@${domain}`;
}

export function generateInitialPassword(length = 6): string {
  // Karakter tanpa huruf/angka mirip (0/O, 1/I/l) agar mudah dibaca di kartu login
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function generateExamToken(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
