# Panduan Database (Supabase) — CBT SMKN 3 Kotamobagu

Semua skrip dijalankan di **Supabase Dashboard → SQL Editor → New Query**.
Seluruh skrip bersifat idempotent (aman dijalankan ulang).

## Instalasi Baru (database kosong)
Cukup jalankan **satu file**:

1. [`schema.sql`](./schema.sql) — skema terbaru lengkap (tabel, RLS, RPC, kolom bobot persentase & anti-curang).

Lalu jalankan [`patch_security_hardening.sql`](./patch_security_hardening.sql) bila ingin
memastikan pencabutan izin `EXECUTE` dari `PUBLIC`/`anon` pada seluruh RPC ujian.

## Database yang Sudah Berjalan (urutan patch historis)
Jalankan hanya patch yang belum pernah dijalankan, **berurutan**:

| Urutan | File | Fungsi |
|---|---|---|
| 1 | `schema.sql` | Skema awal |
| 2 | `patch_teacher_subjects.sql` | Relasi guru ↔ mapel + RLS per mapel |
| 3 | `patch_remedial_and_reset.sql` | Remedial (`attempt_ke`) & reset ujian |
| 4 | `patch_security_hardening.sql` | Kunci `recalculate_attempt_score`, single-session ketat |
| 5 | `patch_exam_type_weights.sql` | Kolom `exams.bobot_tipe` + rumus nilai persentase per tipe |
| 6 | `patch_exam_anticheat.sql` | Mode Ketat: `maks_pelanggaran`, kunci layar server-side |
| 7 | `patch_login_rate_limit.sql` | Tabel `login_rate_limits` persisten (tahan lintas instance Vercel) |

> Status produksi saat ini: patch **1–6 sudah dijalankan**; jalankan patch **7** untuk mengaktifkan rate-limit login persisten di database (sebelum dijalankan, sistem tetap aman dengan fallback in-memory).

## Catatan Rumus Nilai
Rumus di `recalculate_attempt_score` (PostgreSQL) dicerminkan oleh
[`src/lib/scoring.ts`](../src/lib/scoring.ts) dan diuji otomatis di
[`src/lib/scoring.test.ts`](../src/lib/scoring.test.ts) (`npm test`).
**Bila rumus SQL diubah, ubah juga fungsi TypeScript tersebut agar tes tetap relevan.**

## Cadangan Data
Admin dapat mengunduh backup `.sql` 1-klik dari **Admin → Rekap Nilai & Backup**.
