# Aplikasi CBT Sekolah (Vercel + GitHub + Supabase)

Aplikasi ujian online berbasis komputer (CBT) ringan sesuai PRD untuk sekolah (SMKN 3 Kotamobagu).

## Fitur Utama
- **3 Peran:** Admin (termasuk Pengawas), Guru, dan Siswa.
- **4 Tipe Soal:** Pilihan Ganda (A–E), Isian Singkat (multi-kunci), Menjodohkan (dropdown), dan Essay (koreksi manual guru), masing-masing mendukung 1 gambar.
- **Keamanan Ujian:** Kunci jawaban tidak pernah dikirim ke browser siswa (disaring melalui PostgreSQL RLS + RPC `SECURITY DEFINER`), timer dihitung dari waktu server (`NOW()`), 1 sesi aktif per akun siswa, wajib ganti kata sandi saat login pertama, dan pembatasan percobaan login.
- **Pengalaman Siswa:** Satu soal per layar, daftar nomor soal, tandai ragu-ragu, simpan otomatis, coret opsi PG, timer bisa disembunyikan (muncul otomatis saat sisa ≤ 5 menit), perbesar teks, mode kontras tinggi, kumpul otomatis saat waktu habis, serta pencatat pindah tab / keluar layar penuh.
- **Admin & Monitoring Real-time:** Impor siswa/guru dari Excel, cetak kartu login, cetak daftar hadir, token 6 karakter, pengecualian durasi/susulan per siswa, monitoring real-time (reset login, tambah waktu, paksa selesai, buka kembali, blokir), rekap nilai Excel, kenaikan kelas/arsip tahun ajaran, dan backup database 1 tombol (`.sql`).

---

## Panduan Pemasangan (Kurang dari 30 Menit)

### 1. Setup Database Supabase
1. Buka **Supabase Dashboard** → pilih project Anda (disarankan region **Singapore `ap-southeast-1`**).
2. Buka menu **SQL Editor** → **New Query**.
3. Salin seluruh isi file `supabase/schema.sql`, tempelkan, lalu klik **Run**.
4. Ambil kredensial di **Project Settings → API**:
   - `Project URL` → untuk `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → untuk `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → untuk `SUPABASE_SERVICE_ROLE_KEY` *(rahasia, hanya di server!)*

### 2. Uji Coba Lokal (Opsional)
```bash
cp .env.example .env.local
# Isi nilai .env.local dengan kredensial Supabase Anda
npm install
npm run dev
```
Buka `http://localhost:3000/setup` untuk membuat akun **Admin** pertama kali.

### 3. Push ke GitHub & Deploy ke Vercel
1. Inisialisasi git & push folder `cbt-smkn3` ke repository GitHub Anda:
   ```bash
   git init
   git add .
   git commit -m "Initial CBT app"
   git branch -M main
   git remote add origin https://github.com/USERNAME/REPO-ANDA.git
   git push -u origin main
   ```
2. Buka **Vercel Dashboard** → **Add New Project** → pilih repo GitHub Anda.
3. Di bagian **Environment Variables**, masukkan:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `NEXT_PUBLIC_CBT_EMAIL_DOMAIN` = `cbt.smkn3.local`
   - `CBT_SETUP_SECRET` = *(buat kode rahasia sendiri, misal `smkn3-setup-2026`)*
4. Klik **Deploy**.
5. Setelah live, buka `https://domain-anda/setup` sekali saja untuk membuat akun Admin pertama (setelah Admin ada, `/setup` otomatis terkunci).

### 4. Hubungkan Subdomain Sekolah di cPanel Rumahweb → Vercel
1. Di **Vercel Project Settings → Domains**, tambahkan `dbt.smkn3kotamobagu.sch.id`.
2. Di **cPanel Rumahweb → Zone Editor → Manage** pada domain `smkn3kotamobagu.sch.id`, tambah record:
   - **Type:** `CNAME`
   - **Name:** `dbt`
   - **Record / Target:** `cname.vercel-dns.com`
3. Tunggu propagasi DNS (biasanya 5–30 menit); SSL HTTPS akan aktif otomatis dari Vercel.

### 5. Aktifkan Anti Auto-Pause Supabase Free Tier (Penting!)
Agar project Supabase gratis tidak *pause* setelah 7 hari tanpa aktivitas:
1. Buka repository GitHub Anda → **Settings → Secrets and variables → Actions**.
2. Tambahkan 2 Repository Secrets:
   - `SUPABASE_URL` (sama dengan `NEXT_PUBLIC_SUPABASE_URL`)
   - `SUPABASE_ANON_KEY` (sama dengan `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
3. Workflow `.github/workflows/keep-alive.yml` akan otomatis melakukan ping ringan setiap 3 hari sekali.
