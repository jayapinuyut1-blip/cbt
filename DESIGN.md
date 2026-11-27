# DESIGN.md: Aplikasi CBT SMK Negeri 3 Kotamobagu

## Identitas & Karakter
- **Produk:** Aplikasi Ujian Berbasis Komputer (CBT) resmi SMK Negeri 3 Kotamobagu.
- **Pengguna:** Siswa SMK (dominan mobile & PC lab), Dewan Guru, dan Admin/Pengawas Ujian.
- **Karakter Visual:** Akademik, tegas, tenang, minim distraksi saat ujian berlangsung, serta konsisten antara Desktop dan Mobile.
- **Dial:** `ENERGY 1 / RHYTHM 2 / MOTION 1`
  - **ENERGY 1 (Tenang):** Lingkungan ujian tidak boleh ramai; fokus utama selalu pada soal, jadwal aktif, dan status peserta.
  - **RHYTHM 2 (Terstruktur dengan variasi terukur):** Setiap halaman membedakan fokus utama (hero/aksi kunci) dari informasi pendukung; tidak menyusun seluruh halaman sebagai grid kartu seragam.
  - **MOTION 1 (Fungsional halus):** Hanya transisi hover, bilah progres navigasi tipis, dan perpindahan fokus; tanpa animasi mengambang atau loop dekoratif.

## Sistem Warna (4 Tema Terkurasi)
Setiap tema dibatasi maksimal 2 warna inti + 1 aksen di atas dasar netral terang (WCAG AA >= 4.5:1):
1. **`navy-gold` (Default, Khas SMKN 3):** Navy `#0f2b5b` / `#1e3a8a`, Emas `#eab308` sebagai aksen garis identitas, kanvas `#f4f6fb`.
2. **`dark-saas` (Kontras Gelap-Terang):** Chrome gelap `#0f172a` untuk sidebar/topbar, biru fokus `#2563eb` dan aksen `#38bdf8`, area soal tetap putih bersih `#f8fafc`.
3. **`soft-glass` (Biru Akademik Modern):** Biru kobalt `#1d4ed8` / `#4338ca` dengan aksen cyan `#0284c7`, kanvas `#f1f5fd`, dan efek frosted glass dibatasi 1 elemen (kartu login) agar hierarki tetap tajam.
4. **`warm-paper` (Nyaman Mata 90-120 Menit):** Hijau emerald `#064e3b` / `#047857`, aksen amber `#d97706`, kanvas kertas hangat `#faf8f4` minim silau.

## Tipografi & Hierarki
- **Font Utama:** `Plus Jakarta Sans` (dibaca sangat jelas pada soal panjang di layar HP maupun monitor lab; proporsi angka tegas untuk timer dan nilai).
- **Monospace:** Hanya dipakai untuk data teknis nyata (Token 6 karakter, NIP/NISN, dan timer hitung mundur).

## Motif Identitas Berulang
- **Garis Aksen Atas (`border-bottom` 2px di header & bilah `6px` di atas kartu login / ujian):** Menggunakan warna aksen tema aktif sebagai penanda konsisten identitas sekolah di seluruh halaman.
- **Penanda Navigasi Aktif:** Kombinasi bilah vertikal kiri + latar lembut + teks tebal (tidak mengandalkan warna saja).

## Aksesibilitas & Performa
- Kontras teks normal >= 4.5:1 (minimal `slate-600` di latar terang; tanpa `slate-400` untuk teks informatif).
- Target sentuh minimal 44px pada navigasi dan tombol utama mobile.
- Indikator `:focus-visible` tegas, dukungan keyboard penuh (`Tab`, `Enter`, `Escape`), dan penghormatan `prefers-reduced-motion: reduce`.
- Seluruh media (`<img>`) menyertakan dimensi eksplisit untuk mencegah pergeseran tata letak (CLS).
