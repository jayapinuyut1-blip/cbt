-- ============================================================================
-- PATCH RATE-LIMIT LOGIN PERSISTEN (SERVERLESS-SAFE DI VERCEL)
-- Jalankan skrip ini di Supabase Dashboard -> SQL Editor -> New Query
-- Mengganti penyimpanan rate-limit in-memory agar tahan lintas instance Vercel.
-- ============================================================================

create table if not exists public.login_rate_limits (
  rate_key text primary key,
  attempts int not null default 0,
  window_expires_at timestamptz not null
);

create index if not exists idx_login_rate_limits_expires
  on public.login_rate_limits(window_expires_at);

-- Aktifkan RLS tanpa policy publik: HANYA bisa diakses server (service_role)
alter table public.login_rate_limits enable row level security;
