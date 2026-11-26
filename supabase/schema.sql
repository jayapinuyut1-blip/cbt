-- ============================================================================
-- CBT Sekolah SMKN 3 - Skema Database PostgreSQL, RLS, Storage & RPC Functions
-- Jalankan seluruh skrip ini di Supabase Dashboard -> SQL Editor -> New Query
-- ============================================================================

-- 1. Ekstensi
create extension if not exists "pgcrypto";

-- ============================================================================
-- 2. TABEL UTAMA (Sesuai PRD Bagian 9 + Kolom Pendukung Sesi & Pengacakan)
-- ============================================================================

-- Tahun Ajaran
create table if not exists public.academic_years (
  id bigint generated always as identity primary key,
  nama text not null unique,
  aktif boolean not null default false,
  created_at timestamptz not null default now()
);

-- Kelas
create table if not exists public.classes (
  id bigint generated always as identity primary key,
  nama text not null,
  tahun_ajaran_id bigint references public.academic_years(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Mata Pelajaran
create table if not exists public.subjects (
  id bigint generated always as identity primary key,
  nama text not null unique,
  created_at timestamptz not null default now()
);

-- Profil Pengguna (terhubung ke auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique, -- NIS untuk siswa, NIP/username untuk guru & admin
  nama text not null,
  role text not null check (role in ('admin', 'guru', 'siswa')),
  kelas_id bigint references public.classes(id) on delete set null,
  wajib_ganti_sandi boolean not null default true,
  kata_sandi_awal text, -- disimpan sementara untuk cetak kartu login, dihapus saat user ganti sandi
  active_session_id text, -- memastikan 1 akun = 1 sesi aktif
  is_blocked boolean not null default false, -- blokir peserta dari halaman monitoring
  aktif boolean not null default true, -- nonaktifkan akun siswa yang sudah lulus
  created_at timestamptz not null default now()
);

-- Relasi Pasangan Mata Pelajaran per Guru
create table if not exists public.teacher_subjects (
  guru_id uuid not null references public.profiles(id) on delete cascade,
  subject_id bigint not null references public.subjects(id) on delete cascade,
  primary key (guru_id, subject_id)
);

-- Bank Soal
create table if not exists public.questions (
  id bigint generated always as identity primary key,
  subject_id bigint not null references public.subjects(id) on delete cascade,
  guru_id uuid references public.profiles(id) on delete set null,
  tipe text not null check (tipe in ('pg', 'isian', 'jodoh', 'essay')),
  teks text not null,
  gambar text, -- URL gambar dari Supabase Storage
  bobot numeric(6,2) not null default 1 check (bobot > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Opsi / Kunci / Pasangan Soal (dipakai bersama untuk pg, isian, jodoh)
create table if not exists public.question_options (
  id bigint generated always as identity primary key,
  question_id bigint not null references public.questions(id) on delete cascade,
  urutan int not null default 1,
  teks text not null, -- PG: teks opsi | Isian: salah satu kunci | Jodoh: item kiri
  pasangan text, -- Jodoh: item kanan pasangan yang benar
  benar boolean not null default false -- PG: true untuk kunci jawaban
);

-- Ujian
create table if not exists public.exams (
  id bigint generated always as identity primary key,
  judul text not null,
  subject_id bigint not null references public.subjects(id) on delete cascade,
  guru_id uuid references public.profiles(id) on delete set null,
  tahun_ajaran_id bigint references public.academic_years(id) on delete set null,
  durasi int not null default 60 check (durasi > 0), -- menit
  kkm numeric(5,2) not null default 75,
  jenis text not null default 'resmi' check (jenis in ('resmi', 'latihan')),
  jumlah_soal_acak int, -- NULL = pakai exam_questions manual; >0 = ambil N soal acak dari bank mapel
  acak_soal boolean not null default true,
  acak_opsi boolean not null default true,
  navigasi text not null default 'bebas' check (navigasi in ('bebas', 'berurutan')),
  petunjuk text not null default '',
  tampil_hasil text not null default 'nilai' check (tampil_hasil in ('tidak', 'nilai', 'nilai_kunci')),
  token text not null default upper(substr(md5(random()::text), 1, 6)),
  created_at timestamptz not null default now()
);

-- Relasi Soal Manual per Ujian
create table if not exists public.exam_questions (
  exam_id bigint not null references public.exams(id) on delete cascade,
  question_id bigint not null references public.questions(id) on delete cascade,
  urutan int not null default 1,
  primary key (exam_id, question_id)
);

-- Jadwal Ujian per Kelas & Sesi
create table if not exists public.exam_schedules (
  id bigint generated always as identity primary key,
  exam_id bigint not null references public.exams(id) on delete cascade,
  kelas_id bigint not null references public.classes(id) on delete cascade,
  sesi text not null default 'Sesi 1',
  mulai timestamptz not null,
  selesai timestamptz not null,
  check (selesai > mulai)
);

-- Pengecualian Per Siswa (Waktu Ekstra / Ujian Susulan)
create table if not exists public.exam_overrides (
  id bigint generated always as identity primary key,
  exam_id bigint not null references public.exams(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  durasi int check (durasi is null or durasi > 0),
  mulai timestamptz,
  selesai timestamptz,
  unique (exam_id, student_id)
);

-- Percobaan Ujian Siswa
create table if not exists public.attempts (
  id bigint generated always as identity primary key,
  exam_id bigint not null references public.exams(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  mulai timestamptz not null default now(),
  selesai timestamptz,
  status text not null default 'mengerjakan' check (status in ('mengerjakan', 'menunggu_koreksi', 'selesai')),
  nilai numeric(6,2),
  nilai_sementara numeric(6,2),
  total_bobot numeric(8,2) not null default 0,
  extra_minutes int not null default 0,
  question_order jsonb not null default '[]'::jsonb,
  last_active_at timestamptz not null default now(),
  unique (exam_id, student_id)
);

-- Jawaban Siswa (constraint unik attempt_id + question_id untuk UPSERT autosave)
create table if not exists public.answers (
  id bigint generated always as identity primary key,
  attempt_id bigint not null references public.attempts(id) on delete cascade,
  question_id bigint not null references public.questions(id) on delete cascade,
  jawaban jsonb not null default '{}'::jsonb,
  ragu boolean not null default false,
  skor numeric(6,2),
  updated_at timestamptz not null default now(),
  unique (attempt_id, question_id)
);

-- Log Aktivitas Ujian (Pindah Tab, Keluar Layar Penuh, Reset Login)
create table if not exists public.attempt_logs (
  id bigint generated always as identity primary key,
  attempt_id bigint not null references public.attempts(id) on delete cascade,
  jenis text not null check (jenis in ('pindah_tab', 'keluar_layar_penuh', 'reset_login')),
  waktu timestamptz not null default now()
);

-- Pengaturan Identitas Sekolah
create table if not exists public.settings (
  kunci text primary key,
  nilai text not null default ''
);

-- Indeks Performa
create index if not exists idx_profiles_role on public.profiles(role);
create index if not exists idx_profiles_kelas on public.profiles(kelas_id);
create index if not exists idx_teacher_subjects_guru on public.teacher_subjects(guru_id);
create index if not exists idx_teacher_subjects_subject on public.teacher_subjects(subject_id);
create index if not exists idx_questions_subject on public.questions(subject_id);
create index if not exists idx_question_options_question on public.question_options(question_id);
create index if not exists idx_exam_schedules_kelas on public.exam_schedules(kelas_id);
create index if not exists idx_exam_schedules_exam on public.exam_schedules(exam_id);
create index if not exists idx_attempts_exam on public.attempts(exam_id);
create index if not exists idx_attempts_student on public.attempts(student_id);
create index if not exists idx_answers_attempt on public.answers(attempt_id);
create index if not exists idx_attempt_logs_attempt on public.attempt_logs(attempt_id);

-- Data Awal Identitas Sekolah & Tahun Ajaran Default
insert into public.settings (kunci, nilai) values
  ('nama_sekolah', 'SMK Negeri 3 Kotamobagu'),
  ('logo', ''),
  ('alamat_sekolah', 'Kotamobagu, Sulawesi Utara')
on conflict (kunci) do nothing;

insert into public.academic_years (nama, aktif)
values ('2026/2027', true)
on conflict (nama) do nothing;

insert into public.subjects (nama) values
  ('Pendidikan Agama Islam'),
  ('Pendidikan Agama Kristen'),
  ('Sejarah'),
  ('Matematika'),
  ('PKn'),
  ('PJOK'),
  ('Seni Budaya'),
  ('Bahasa Inggris'),
  ('Informatika'),
  ('KKA'),
  ('Projek IPAS'),
  ('Bahasa Indonesia'),
  ('Dasar-Dasar Geologi Pertambangan'),
  ('Dasar-Dasar Agribisnis Tanaman'),
  ('Dasar-Dasar Teknik Jaringan Telekomunikasi'),
  ('Dasar-Dasar Pemasaran')
on conflict (nama) do nothing;

-- ============================================================================
-- 3. FUNGSI BANTU ROLE (SECURITY DEFINER agar tidak memicu rekursi RLS)
-- ============================================================================

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() limit 1;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.is_guru_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role in ('admin', 'guru') from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.can_access_subject(p_subject_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin() or exists (
    select 1 from public.teacher_subjects
    where guru_id = auth.uid() and subject_id = p_subject_id
  );
$$;

-- ============================================================================
-- 4. ROW LEVEL SECURITY (RLS)
-- Siswa TIDAK PERNAH bisa SELECT langsung ke tabel questions / question_options
-- Semua akses ujian siswa melalui RPC SECURITY DEFINER yang menyaring kunci!
-- ============================================================================

alter table public.academic_years enable row level security;
alter table public.classes enable row level security;
alter table public.subjects enable row level security;
alter table public.profiles enable row level security;
alter table public.teacher_subjects enable row level security;
alter table public.questions enable row level security;
alter table public.question_options enable row level security;
alter table public.exams enable row level security;
alter table public.exam_questions enable row level security;
alter table public.exam_schedules enable row level security;
alter table public.exam_overrides enable row level security;
alter table public.attempts enable row level security;
alter table public.answers enable row level security;
alter table public.attempt_logs enable row level security;
alter table public.settings enable row level security;

-- settings: semua boleh baca (untuk logo & nama sekolah di halaman login), hanya admin ubah
drop policy if exists "settings_select_all" on public.settings;
create policy "settings_select_all" on public.settings for select using (true);
drop policy if exists "settings_admin_all" on public.settings;
create policy "settings_admin_all" on public.settings for all using (public.is_admin()) with check (public.is_admin());

-- academic_years, classes, subjects: semua user login boleh baca, admin boleh kelola
drop policy if exists "academic_years_select" on public.academic_years;
create policy "academic_years_select" on public.academic_years for select using (auth.uid() is not null);
drop policy if exists "academic_years_admin" on public.academic_years;
create policy "academic_years_admin" on public.academic_years for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "classes_select" on public.classes;
create policy "classes_select" on public.classes for select using (auth.uid() is not null);
drop policy if exists "classes_admin" on public.classes;
create policy "classes_admin" on public.classes for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "subjects_select" on public.subjects;
create policy "subjects_select" on public.subjects for select using (auth.uid() is not null);
drop policy if exists "subjects_admin" on public.subjects;
create policy "subjects_admin" on public.subjects for all using (public.is_admin()) with check (public.is_admin());

-- profiles: user baca profil sendiri; admin & guru baca semua; admin kelola semua
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles for select
  using (id = auth.uid() or public.is_guru_or_admin());
drop policy if exists "profiles_admin_all" on public.profiles;
create policy "profiles_admin_all" on public.profiles for all
  using (public.is_admin()) with check (public.is_admin());

-- teacher_subjects: guru baca miliknya, admin kelola semua
drop policy if exists "teacher_subjects_select" on public.teacher_subjects;
create policy "teacher_subjects_select" on public.teacher_subjects for select
  using (guru_id = auth.uid() or public.is_admin());
drop policy if exists "teacher_subjects_admin_all" on public.teacher_subjects;
create policy "teacher_subjects_admin_all" on public.teacher_subjects for all
  using (public.is_admin()) with check (public.is_admin());

-- questions & question_options: HANYA admin atau guru pengampu mapel! Siswa DILARANG baca langsung!
drop policy if exists "questions_guru_admin" on public.questions;
create policy "questions_guru_admin" on public.questions for all
  using (public.can_access_subject(subject_id)) with check (public.can_access_subject(subject_id));

drop policy if exists "question_options_guru_admin" on public.question_options;
create policy "question_options_guru_admin" on public.question_options for all
  using (
    exists (
      select 1 from public.questions q
      where q.id = question_id and public.can_access_subject(q.subject_id)
    )
  )
  with check (
    exists (
      select 1 from public.questions q
      where q.id = question_id and public.can_access_subject(q.subject_id)
    )
  );

-- exams & exam_questions: admin atau guru pengampu mapel
drop policy if exists "exams_guru_admin" on public.exams;
create policy "exams_guru_admin" on public.exams for all
  using (public.can_access_subject(subject_id)) with check (public.can_access_subject(subject_id));

drop policy if exists "exam_questions_guru_admin" on public.exam_questions;
create policy "exam_questions_guru_admin" on public.exam_questions for all
  using (
    exists (
      select 1 from public.exams e
      where e.id = exam_id and public.can_access_subject(e.subject_id)
    )
  )
  with check (
    exists (
      select 1 from public.exams e
      where e.id = exam_id and public.can_access_subject(e.subject_id)
    )
  );

-- exam_schedules & exam_overrides: guru & admin kelola/baca
drop policy if exists "exam_schedules_guru_admin" on public.exam_schedules;
create policy "exam_schedules_guru_admin" on public.exam_schedules for select using (public.is_guru_or_admin());
drop policy if exists "exam_schedules_admin_write" on public.exam_schedules;
create policy "exam_schedules_admin_write" on public.exam_schedules for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "exam_overrides_guru_admin" on public.exam_overrides;
create policy "exam_overrides_guru_admin" on public.exam_overrides for select using (public.is_guru_or_admin());
drop policy if exists "exam_overrides_admin_write" on public.exam_overrides;
create policy "exam_overrides_admin_write" on public.exam_overrides for all using (public.is_admin()) with check (public.is_admin());

-- attempts, answers, attempt_logs: admin atau guru pengampu mapel; siswa hanya lewat RPC
drop policy if exists "attempts_guru_admin" on public.attempts;
create policy "attempts_guru_admin" on public.attempts for all
  using (
    exists (
      select 1 from public.exams e
      where e.id = exam_id and public.can_access_subject(e.subject_id)
    )
  )
  with check (
    exists (
      select 1 from public.exams e
      where e.id = exam_id and public.can_access_subject(e.subject_id)
    )
  );

drop policy if exists "answers_guru_admin" on public.answers;
create policy "answers_guru_admin" on public.answers for all
  using (
    exists (
      select 1 from public.attempts a
      join public.exams e on e.id = a.exam_id
      where a.id = attempt_id and public.can_access_subject(e.subject_id)
    )
  )
  with check (
    exists (
      select 1 from public.attempts a
      join public.exams e on e.id = a.exam_id
      where a.id = attempt_id and public.can_access_subject(e.subject_id)
    )
  );

drop policy if exists "attempt_logs_guru_admin" on public.attempt_logs;
create policy "attempt_logs_guru_admin" on public.attempt_logs for all
  using (
    exists (
      select 1 from public.attempts a
      join public.exams e on e.id = a.exam_id
      where a.id = attempt_id and public.can_access_subject(e.subject_id)
    )
  )
  with check (
    exists (
      select 1 from public.attempts a
      join public.exams e on e.id = a.exam_id
      where a.id = attempt_id and public.can_access_subject(e.subject_id)
    )
  );

-- ============================================================================
-- 5. RPC FUNCTIONS (Logika Ujian Server-Side di PostgreSQL)
-- ============================================================================

-- 5.1 Menghitung ulang nilai & status attempt (dipanggil saat submit & koreksi essay)
create or replace function public.recalculate_attempt_score(p_attempt_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt public.attempts%rowtype;
  v_item jsonb;
  v_q public.questions%rowtype;
  v_ans public.answers%rowtype;
  v_total_bobot numeric(10,2) := 0;
  v_total_skor numeric(10,2) := 0;
  v_obj_skor numeric(10,2) := 0;
  v_has_essay boolean := false;
  v_has_ungraded_essay boolean := false;
  v_skor numeric(6,2);
  v_norm_ans text;
  v_pair_total int;
  v_pair_correct int;
  v_opt record;
  v_final_status text;
  v_nilai numeric(6,2);
  v_nilai_sementara numeric(6,2);
begin
  select * into v_attempt from public.attempts where id = p_attempt_id;
  if not found then
    raise exception 'Percobaan ujian tidak ditemukan';
  end if;

  for v_item in select * from jsonb_array_elements(v_attempt.question_order)
  loop
    select * into v_q from public.questions where id = (v_item->>'question_id')::bigint;
    if not found then
      continue;
    end if;

    v_total_bobot := v_total_bobot + v_q.bobot;

    select * into v_ans
    from public.answers
    where attempt_id = p_attempt_id and question_id = v_q.id;

    if v_q.tipe = 'pg' then
      v_skor := 0;
      if found and (v_ans.jawaban ? 'option_id') and nullif(v_ans.jawaban->>'option_id', '') is not null then
        if exists (
          select 1 from public.question_options
          where id = (v_ans.jawaban->>'option_id')::bigint
            and question_id = v_q.id
            and benar = true
        ) then
          v_skor := v_q.bobot;
        end if;
      end if;

      if found then
        update public.answers set skor = v_skor where id = v_ans.id;
      end if;
      v_obj_skor := v_obj_skor + v_skor;
      v_total_skor := v_total_skor + v_skor;

    elsif v_q.tipe = 'isian' then
      v_skor := 0;
      if found and (v_ans.jawaban ? 'text') then
        v_norm_ans := lower(regexp_replace(trim(coalesce(v_ans.jawaban->>'text', '')), '\s+', ' ', 'g'));
        if v_norm_ans <> '' and exists (
          select 1 from public.question_options
          where question_id = v_q.id
            and lower(regexp_replace(trim(teks), '\s+', ' ', 'g')) = v_norm_ans
        ) then
          v_skor := v_q.bobot;
        end if;
      end if;

      if found then
        update public.answers set skor = v_skor where id = v_ans.id;
      end if;
      v_obj_skor := v_obj_skor + v_skor;
      v_total_skor := v_total_skor + v_skor;

    elsif v_q.tipe = 'jodoh' then
      v_skor := 0;
      select count(*) into v_pair_total from public.question_options where question_id = v_q.id;
      v_pair_correct := 0;

      if found and v_pair_total > 0 and (v_ans.jawaban ? 'pairs') then
        for v_opt in select id, pasangan from public.question_options where question_id = v_q.id
        loop
          if coalesce((v_ans.jawaban->'pairs')->>(v_opt.id::text), '') = coalesce(v_opt.pasangan, '') then
            v_pair_correct := v_pair_correct + 1;
          end if;
        end loop;
        v_skor := round((v_pair_correct::numeric / v_pair_total::numeric) * v_q.bobot, 2);
      end if;

      if found then
        update public.answers set skor = v_skor where id = v_ans.id;
      end if;
      v_obj_skor := v_obj_skor + v_skor;
      v_total_skor := v_total_skor + v_skor;

    elsif v_q.tipe = 'essay' then
      v_has_essay := true;
      if not found then
        -- Jika siswa tidak menjawab essay, pastikan tetap ada baris jawaban agar guru bisa melihat & menilai 0
        insert into public.answers (attempt_id, question_id, jawaban, ragu, skor)
        values (p_attempt_id, v_q.id, '{"text":""}'::jsonb, false, null)
        on conflict (attempt_id, question_id) do nothing;
        v_has_ungraded_essay := true;
      elsif v_ans.skor is null then
        v_has_ungraded_essay := true;
      else
        v_total_skor := v_total_skor + v_ans.skor;
      end if;
    end if;
  end loop;

  v_nilai_sementara := case when v_total_bobot > 0 then round((v_obj_skor / v_total_bobot) * 100, 2) else 0 end;

  if v_has_essay and v_has_ungraded_essay then
    v_final_status := 'menunggu_koreksi';
    v_nilai := null;
  else
    v_final_status := 'selesai';
    v_nilai := case when v_total_bobot > 0 then round((v_total_skor / v_total_bobot) * 100, 2) else 0 end;
  end if;

  update public.attempts
  set
    status = v_final_status,
    selesai = coalesce(selesai, now()),
    total_bobot = v_total_bobot,
    nilai_sementara = v_nilai_sementara,
    nilai = v_nilai,
    last_active_at = now()
  where id = p_attempt_id;

  return jsonb_build_object(
    'attempt_id', p_attempt_id,
    'status', v_final_status,
    'nilai', v_nilai,
    'nilai_sementara', v_nilai_sementara,
    'total_bobot', v_total_bobot
  );
end;
$$;

-- 5.2 Daftar Ujian Tersedia untuk Siswa yang Login
create or replace function public.get_student_available_exams()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_result jsonb;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if not found or v_profile.role <> 'siswa' then
    raise exception 'Akses khusus siswa';
  end if;

  select coalesce(jsonb_agg(row_data order by mulai_efektif desc), '[]'::jsonb)
  into v_result
  from (
    select
      e.id as exam_id,
      e.judul,
      s.nama as mapel,
      coalesce(ov.durasi, e.durasi) as durasi,
      e.kkm,
      e.jenis,
      e.navigasi,
      e.petunjuk,
      e.tampil_hasil,
      coalesce(sch.sesi, 'Susulan') as sesi,
      coalesce(ov.mulai, sch.mulai) as mulai_efektif,
      coalesce(ov.selesai, sch.selesai) as selesai_efektif,
      case
        when e.jumlah_soal_acak is not null and e.jumlah_soal_acak > 0 then e.jumlah_soal_acak
        else (select count(*) from public.exam_questions eq where eq.exam_id = e.id)
      end as jumlah_soal,
      att.id as attempt_id,
      att.status as attempt_status,
      att.mulai as attempt_mulai,
      att.selesai as attempt_selesai,
      case
        when att.status = 'selesai' and (e.jenis = 'latihan' or e.tampil_hasil in ('nilai', 'nilai_kunci')) then att.nilai
        when att.status = 'menunggu_koreksi' and (e.jenis = 'latihan' or e.tampil_hasil in ('nilai', 'nilai_kunci')) then att.nilai_sementara
        else null
      end as nilai_tampil,
      (now() between coalesce(ov.mulai, sch.mulai) and coalesce(ov.selesai, sch.selesai)) as sedang_dibuka,
      now() as server_now
    from public.exams e
    join public.subjects s on s.id = e.subject_id
    left join lateral (
      select es.* from public.exam_schedules es
      where es.exam_id = e.id and es.kelas_id = v_profile.kelas_id
      order by es.mulai desc
      limit 1
    ) sch on true
    left join public.exam_overrides ov on ov.exam_id = e.id and ov.student_id = v_profile.id
    left join public.attempts att on att.exam_id = e.id and att.student_id = v_profile.id
    where sch.id is not null or ov.id is not null or att.id is not null
  ) row_data;

  return jsonb_build_object(
    'server_now', now(),
    'is_blocked', v_profile.is_blocked,
    'exams', v_result
  );
end;
$$;

-- 5.3 Mulai atau Lanjutkan Ujian (Tanpa Pernah Mengirim Kunci Jawaban!)
create or replace function public.start_or_resume_exam(
  p_exam_id bigint,
  p_token text default null,
  p_session_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_exam public.exams%rowtype;
  v_schedule public.exam_schedules%rowtype;
  v_override public.exam_overrides%rowtype;
  v_attempt public.attempts%rowtype;
  v_effective_mulai timestamptz;
  v_effective_selesai timestamptz;
  v_effective_durasi int;
  v_deadline timestamptz;
  v_q_order jsonb := '[]'::jsonb;
  v_q_rec record;
  v_opt_order jsonb;
  v_right_order jsonb;
  v_questions_payload jsonb := '[]'::jsonb;
  v_answers_payload jsonb := '{}'::jsonb;
  v_item jsonb;
  v_q public.questions%rowtype;
  v_opts jsonb;
  v_left_items jsonb;
  v_ans record;
  v_mapel text;
begin
  -- 1. Validasi Profil & Sesi Tunggal
  select * into v_profile from public.profiles where id = auth.uid();
  if not found or v_profile.role <> 'siswa' then
    raise exception 'Akses khusus siswa';
  end if;
  if not v_profile.aktif then
    raise exception 'Akun Anda tidak aktif';
  end if;
  if v_profile.is_blocked then
    raise exception 'Akun Anda sedang diblokir oleh pengawas. Hubungi pengawas ujian.';
  end if;
  if v_profile.active_session_id is not null and p_session_id is not null and v_profile.active_session_id <> p_session_id then
    raise exception 'SESSION_CONFLICT: Akun Anda sedang login di perangkat lain.';
  end if;

  -- 2. Ambil Ujian, Jadwal, dan Override
  select * into v_exam from public.exams where id = p_exam_id;
  if not found then
    raise exception 'Ujian tidak ditemukan';
  end if;
  select nama into v_mapel from public.subjects where id = v_exam.subject_id;

  select * into v_schedule
  from public.exam_schedules
  where exam_id = p_exam_id and kelas_id = v_profile.kelas_id
  order by mulai desc
  limit 1;

  select * into v_override
  from public.exam_overrides
  where exam_id = p_exam_id and student_id = v_profile.id;

  if v_schedule.id is null and v_override.id is null then
    raise exception 'Ujian ini tidak dijadwalkan untuk kelas Anda';
  end if;

  v_effective_mulai := coalesce(v_override.mulai, v_schedule.mulai);
  v_effective_selesai := coalesce(v_override.selesai, v_schedule.selesai);
  v_effective_durasi := coalesce(v_override.durasi, v_exam.durasi);

  -- 3. Cek apakah sudah ada attempt
  select * into v_attempt
  from public.attempts
  where exam_id = p_exam_id and student_id = v_profile.id;

  if not found then
    -- Validasi jadwal buka & token untuk memulai ujian baru
    if now() < v_effective_mulai then
      raise exception 'Ujian belum dimulai. Jadwal mulai: %', to_char(v_effective_mulai at time zone 'Asia/Makassar', 'DD Mon YYYY HH24:MI');
    end if;
    if now() > v_effective_selesai then
      raise exception 'Waktu jadwal ujian sudah berakhir.';
    end if;
    if upper(trim(coalesce(p_token, ''))) <> upper(trim(v_exam.token)) then
      raise exception 'Token ujian salah. Periksa kembali token dari pengawas.';
    end if;

    -- Bangun urutan soal & opsi acak yang konsisten per attempt
    if v_exam.jumlah_soal_acak is not null and v_exam.jumlah_soal_acak > 0 then
      for v_q_rec in
        select id, tipe from public.questions
        where subject_id = v_exam.subject_id
        order by random()
        limit v_exam.jumlah_soal_acak
      loop
        if v_q_rec.tipe = 'pg' then
          select coalesce(jsonb_agg(id order by case when v_exam.acak_opsi then random() else urutan::double precision end), '[]'::jsonb)
          into v_opt_order
          from public.question_options where question_id = v_q_rec.id;
          v_right_order := '[]'::jsonb;
        elsif v_q_rec.tipe = 'jodoh' then
          select coalesce(jsonb_agg(id order by case when v_exam.acak_opsi then random() else urutan::double precision end), '[]'::jsonb)
          into v_opt_order
          from public.question_options where question_id = v_q_rec.id;
          select coalesce(jsonb_agg(pasangan order by random()), '[]'::jsonb)
          into v_right_order
          from public.question_options where question_id = v_q_rec.id;
        else
          v_opt_order := '[]'::jsonb;
          v_right_order := '[]'::jsonb;
        end if;

        v_q_order := v_q_order || jsonb_build_object(
          'question_id', v_q_rec.id,
          'option_order', v_opt_order,
          'right_order', v_right_order
        );
      end loop;
    else
      for v_q_rec in
        select q.id, q.tipe, eq.urutan
        from public.exam_questions eq
        join public.questions q on q.id = eq.question_id
        where eq.exam_id = p_exam_id
        order by case when v_exam.acak_soal then random() else eq.urutan::double precision end
      loop
        if v_q_rec.tipe = 'pg' then
          select coalesce(jsonb_agg(id order by case when v_exam.acak_opsi then random() else urutan::double precision end), '[]'::jsonb)
          into v_opt_order
          from public.question_options where question_id = v_q_rec.id;
          v_right_order := '[]'::jsonb;
        elsif v_q_rec.tipe = 'jodoh' then
          select coalesce(jsonb_agg(id order by case when v_exam.acak_opsi then random() else urutan::double precision end), '[]'::jsonb)
          into v_opt_order
          from public.question_options where question_id = v_q_rec.id;
          select coalesce(jsonb_agg(pasangan order by random()), '[]'::jsonb)
          into v_right_order
          from public.question_options where question_id = v_q_rec.id;
        else
          v_opt_order := '[]'::jsonb;
          v_right_order := '[]'::jsonb;
        end if;

        v_q_order := v_q_order || jsonb_build_object(
          'question_id', v_q_rec.id,
          'option_order', v_opt_order,
          'right_order', v_right_order
        );
      end loop;
    end if;

    if jsonb_array_length(v_q_order) = 0 then
      raise exception 'Ujian ini belum memiliki soal. Hubungi guru atau admin.';
    end if;

    insert into public.attempts (exam_id, student_id, mulai, status, question_order, last_active_at)
    values (p_exam_id, v_profile.id, now(), 'mengerjakan', v_q_order, now())
    returning * into v_attempt;
  else
    if v_attempt.status <> 'mengerjakan' then
      raise exception 'Ujian sudah selesai dikumpulkan.';
    end if;
    update public.attempts set last_active_at = now() where id = v_attempt.id;
  end if;

  -- 4. Hitung Deadline Berbasis Waktu Server + Extra Minutes
  v_deadline := least(
    v_attempt.mulai + make_interval(mins => v_effective_durasi),
    coalesce(v_effective_selesai, v_attempt.mulai + make_interval(mins => v_effective_durasi))
  ) + make_interval(mins => v_attempt.extra_minutes);

  -- Jika waktu sudah habis saat resume, otomatis kumpulkan
  if now() >= v_deadline then
    perform public.recalculate_attempt_score(v_attempt.id);
    raise exception 'TIME_EXPIRED: Waktu ujian Anda telah habis dan jawaban telah dikumpulkan otomatis.';
  end if;

  -- 5. Susun Daftar Soal TANPA Kunci Jawaban
  for v_item in select * from jsonb_array_elements(v_attempt.question_order)
  loop
    select * into v_q from public.questions where id = (v_item->>'question_id')::bigint;
    if not found then
      continue;
    end if;

    if v_q.tipe = 'pg' then
      select coalesce(jsonb_agg(
        jsonb_build_object('id', qo.id, 'teks', qo.teks)
        order by ord.idx
      ), '[]'::jsonb)
      into v_opts
      from jsonb_array_elements_text(v_item->'option_order') with ordinality as ord(opt_id, idx)
      join public.question_options qo on qo.id = ord.opt_id::bigint;

      v_questions_payload := v_questions_payload || jsonb_build_object(
        'id', v_q.id,
        'tipe', v_q.tipe,
        'teks', v_q.teks,
        'gambar', v_q.gambar,
        'bobot', v_q.bobot,
        'options', v_opts
      );

    elsif v_q.tipe = 'jodoh' then
      select coalesce(jsonb_agg(
        jsonb_build_object('id', qo.id, 'teks', qo.teks)
        order by ord.idx
      ), '[]'::jsonb)
      into v_left_items
      from jsonb_array_elements_text(v_item->'option_order') with ordinality as ord(opt_id, idx)
      join public.question_options qo on qo.id = ord.opt_id::bigint;

      v_questions_payload := v_questions_payload || jsonb_build_object(
        'id', v_q.id,
        'tipe', v_q.tipe,
        'teks', v_q.teks,
        'gambar', v_q.gambar,
        'bobot', v_q.bobot,
        'left_items', v_left_items,
        'right_items', coalesce(v_item->'right_order', '[]'::jsonb)
      );

    else
      -- isian & essay: jangan kirim question_options sama sekali!
      v_questions_payload := v_questions_payload || jsonb_build_object(
        'id', v_q.id,
        'tipe', v_q.tipe,
        'teks', v_q.teks,
        'gambar', v_q.gambar,
        'bobot', v_q.bobot
      );
    end if;
  end loop;

  -- 6. Muat Jawaban Tersimpan Sebelumnya
  for v_ans in select question_id, jawaban, ragu from public.answers where attempt_id = v_attempt.id
  loop
    v_answers_payload := v_answers_payload || jsonb_build_object(
      v_ans.question_id::text,
      jsonb_build_object('jawaban', v_ans.jawaban, 'ragu', v_ans.ragu)
    );
  end loop;

  return jsonb_build_object(
    'attempt_id', v_attempt.id,
    'exam', jsonb_build_object(
      'id', v_exam.id,
      'judul', v_exam.judul,
      'mapel', v_mapel,
      'durasi', v_effective_durasi + v_attempt.extra_minutes,
      'jenis', v_exam.jenis,
      'navigasi', v_exam.navigasi,
      'petunjuk', v_exam.petunjuk
    ),
    'server_now', now(),
    'deadline', v_deadline,
    'questions', v_questions_payload,
    'answers', v_answers_payload
  );
end;
$$;

-- 5.4 Simpan Jawaban Otomatis (UPSERT + Validasi Sesi & Waktu Server)
create or replace function public.save_student_answer(
  p_attempt_id bigint,
  p_question_id bigint,
  p_jawaban jsonb,
  p_ragu boolean default false,
  p_session_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_attempt public.attempts%rowtype;
  v_exam public.exams%rowtype;
  v_schedule public.exam_schedules%rowtype;
  v_override public.exam_overrides%rowtype;
  v_effective_durasi int;
  v_effective_selesai timestamptz;
  v_deadline timestamptz;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if not found or v_profile.role <> 'siswa' then
    raise exception 'Akses ditolak';
  end if;
  if v_profile.is_blocked then
    raise exception 'BLOCKED: Akun Anda diblokir oleh pengawas.';
  end if;
  if v_profile.active_session_id is not null and p_session_id is not null and v_profile.active_session_id <> p_session_id then
    raise exception 'SESSION_CONFLICT: Sesi Anda telah berakhir karena login di perangkat lain atau direset admin.';
  end if;

  select * into v_attempt from public.attempts where id = p_attempt_id and student_id = v_profile.id;
  if not found then
    raise exception 'Percobaan ujian tidak ditemukan';
  end if;
  if v_attempt.status <> 'mengerjakan' then
    raise exception 'ATTEMPT_CLOSED: Ujian sudah ditutup atau dikumpulkan.';
  end if;

  select * into v_exam from public.exams where id = v_attempt.exam_id;
  select * into v_schedule from public.exam_schedules where exam_id = v_attempt.exam_id and kelas_id = v_profile.kelas_id order by mulai desc limit 1;
  select * into v_override from public.exam_overrides where exam_id = v_attempt.exam_id and student_id = v_profile.id;

  v_effective_durasi := coalesce(v_override.durasi, v_exam.durasi);
  v_effective_selesai := coalesce(v_override.selesai, v_schedule.selesai);
  v_deadline := least(
    v_attempt.mulai + make_interval(mins => v_effective_durasi),
    coalesce(v_effective_selesai, v_attempt.mulai + make_interval(mins => v_effective_durasi))
  ) + make_interval(mins => v_attempt.extra_minutes);

  if now() > v_deadline + interval '20 seconds' then
    perform public.recalculate_attempt_score(v_attempt.id);
    raise exception 'TIME_EXPIRED: Waktu habis.';
  end if;

  insert into public.answers (attempt_id, question_id, jawaban, ragu, updated_at)
  values (p_attempt_id, p_question_id, coalesce(p_jawaban, '{}'::jsonb), coalesce(p_ragu, false), now())
  on conflict (attempt_id, question_id)
  do update set
    jawaban = excluded.jawaban,
    ragu = excluded.ragu,
    updated_at = now();

  update public.attempts set last_active_at = now() where id = p_attempt_id;

  return jsonb_build_object(
    'ok', true,
    'saved_at', now(),
    'server_now', now(),
    'deadline', v_deadline
  );
end;
$$;

-- 5.5 Catat Log Aktivitas (Pindah Tab / Keluar Fullscreen) - Hanya Mencatat, Tidak Memblokir
create or replace function public.log_attempt_event(
  p_attempt_id bigint,
  p_jenis text,
  p_session_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt public.attempts%rowtype;
begin
  if p_jenis not in ('pindah_tab', 'keluar_layar_penuh') then
    raise exception 'Jenis log tidak valid';
  end if;

  select * into v_attempt from public.attempts where id = p_attempt_id and student_id = auth.uid();
  if not found or v_attempt.status <> 'mengerjakan' then
    return jsonb_build_object('ok', false);
  end if;

  insert into public.attempt_logs (attempt_id, jenis, waktu)
  values (p_attempt_id, p_jenis, now());

  update public.attempts set last_active_at = now() where id = p_attempt_id;

  return jsonb_build_object('ok', true);
end;
$$;

-- 5.6 Kumpulkan Ujian oleh Siswa
create or replace function public.submit_exam_attempt(
  p_attempt_id bigint,
  p_session_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_attempt public.attempts%rowtype;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if not found or v_profile.role <> 'siswa' then
    raise exception 'Akses ditolak';
  end if;

  select * into v_attempt from public.attempts where id = p_attempt_id and student_id = v_profile.id;
  if not found then
    raise exception 'Percobaan ujian tidak ditemukan';
  end if;

  if v_attempt.status <> 'mengerjakan' then
    return jsonb_build_object('attempt_id', v_attempt.id, 'status', v_attempt.status);
  end if;

  return public.recalculate_attempt_score(p_attempt_id);
end;
$$;

-- 5.7 Lihat Hasil Ujian Siswa (Menghormati Pengaturan tampil_hasil & Jenis Latihan)
create or replace function public.get_attempt_result(p_attempt_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt public.attempts%rowtype;
  v_exam public.exams%rowtype;
  v_mapel text;
  v_role text;
  v_show_score boolean := false;
  v_show_key boolean := false;
  v_details jsonb := '[]'::jsonb;
  v_item jsonb;
  v_q public.questions%rowtype;
  v_ans public.answers%rowtype;
  v_opts jsonb;
begin
  v_role := public.current_user_role();
  select * into v_attempt from public.attempts where id = p_attempt_id;
  if not found then
    raise exception 'Hasil ujian tidak ditemukan';
  end if;

  if v_role = 'siswa' and v_attempt.student_id <> auth.uid() then
    raise exception 'Akses ditolak';
  end if;

  select * into v_exam from public.exams where id = v_attempt.exam_id;
  select nama into v_mapel from public.subjects where id = v_exam.subject_id;

  if v_role in ('admin', 'guru') then
    v_show_score := true;
    v_show_key := true;
  else
    if v_exam.jenis = 'latihan' then
      v_show_score := true;
      v_show_key := true;
    elsif v_exam.tampil_hasil = 'nilai' then
      v_show_score := true;
    elsif v_exam.tampil_hasil = 'nilai_kunci' then
      v_show_score := true;
      v_show_key := true;
    end if;
  end if;

  if v_show_key then
    for v_item in select * from jsonb_array_elements(v_attempt.question_order)
    loop
      select * into v_q from public.questions where id = (v_item->>'question_id')::bigint;
      if not found then continue; end if;

      select * into v_ans from public.answers where attempt_id = p_attempt_id and question_id = v_q.id;
      select coalesce(jsonb_agg(
        jsonb_build_object('id', id, 'teks', teks, 'pasangan', pasangan, 'benar', benar)
        order by urutan
      ), '[]'::jsonb)
      into v_opts
      from public.question_options where question_id = v_q.id;

      v_details := v_details || jsonb_build_object(
        'question_id', v_q.id,
        'tipe', v_q.tipe,
        'teks', v_q.teks,
        'gambar', v_q.gambar,
        'bobot', v_q.bobot,
        'jawaban', coalesce(v_ans.jawaban, '{}'::jsonb),
        'skor', v_ans.skor,
        'options', v_opts
      );
    end loop;
  end if;

  return jsonb_build_object(
    'attempt_id', v_attempt.id,
    'status', v_attempt.status,
    'mulai', v_attempt.mulai,
    'selesai', v_attempt.selesai,
    'exam', jsonb_build_object(
      'id', v_exam.id,
      'judul', v_exam.judul,
      'mapel', v_mapel,
      'kkm', v_exam.kkm,
      'jenis', v_exam.jenis,
      'tampil_hasil', v_exam.tampil_hasil
    ),
    'show_score', v_show_score,
    'show_key', v_show_key,
    'nilai', case when v_show_score then v_attempt.nilai else null end,
    'nilai_sementara', case when v_show_score then v_attempt.nilai_sementara else null end,
    'details', v_details
  );
end;
$$;

-- 5.8 Pratinjau Ujian untuk Guru (Tampilan Siswa Sebelum Dijadwalkan)
create or replace function public.get_exam_preview(p_exam_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exam public.exams%rowtype;
  v_mapel text;
  v_questions jsonb := '[]'::jsonb;
  v_q record;
  v_opts jsonb;
  v_right jsonb;
begin
  if not public.is_guru_or_admin() then
    raise exception 'Akses khusus guru/admin';
  end if;

  select * into v_exam from public.exams where id = p_exam_id;
  if not found then
    raise exception 'Ujian tidak ditemukan';
  end if;
  if not public.can_access_subject(v_exam.subject_id) then
    raise exception 'Anda tidak memiliki akses ke mata pelajaran ujian ini';
  end if;
  select nama into v_mapel from public.subjects where id = v_exam.subject_id;

  if v_exam.jumlah_soal_acak is not null and v_exam.jumlah_soal_acak > 0 then
    for v_q in
      select * from public.questions where subject_id = v_exam.subject_id order by random() limit v_exam.jumlah_soal_acak
    loop
      if v_q.tipe = 'pg' then
        select coalesce(jsonb_agg(jsonb_build_object('id', id, 'teks', teks) order by urutan), '[]'::jsonb)
        into v_opts from public.question_options where question_id = v_q.id;
        v_questions := v_questions || jsonb_build_object('id', v_q.id, 'tipe', v_q.tipe, 'teks', v_q.teks, 'gambar', v_q.gambar, 'bobot', v_q.bobot, 'options', v_opts);
      elsif v_q.tipe = 'jodoh' then
        select coalesce(jsonb_agg(jsonb_build_object('id', id, 'teks', teks) order by urutan), '[]'::jsonb)
        into v_opts from public.question_options where question_id = v_q.id;
        select coalesce(jsonb_agg(pasangan order by random()), '[]'::jsonb)
        into v_right from public.question_options where question_id = v_q.id;
        v_questions := v_questions || jsonb_build_object('id', v_q.id, 'tipe', v_q.tipe, 'teks', v_q.teks, 'gambar', v_q.gambar, 'bobot', v_q.bobot, 'left_items', v_opts, 'right_items', v_right);
      else
        v_questions := v_questions || jsonb_build_object('id', v_q.id, 'tipe', v_q.tipe, 'teks', v_q.teks, 'gambar', v_q.gambar, 'bobot', v_q.bobot);
      end if;
    end loop;
  else
    for v_q in
      select q.* from public.exam_questions eq join public.questions q on q.id = eq.question_id where eq.exam_id = p_exam_id order by eq.urutan
    loop
      if v_q.tipe = 'pg' then
        select coalesce(jsonb_agg(jsonb_build_object('id', id, 'teks', teks) order by urutan), '[]'::jsonb)
        into v_opts from public.question_options where question_id = v_q.id;
        v_questions := v_questions || jsonb_build_object('id', v_q.id, 'tipe', v_q.tipe, 'teks', v_q.teks, 'gambar', v_q.gambar, 'bobot', v_q.bobot, 'options', v_opts);
      elsif v_q.tipe = 'jodoh' then
        select coalesce(jsonb_agg(jsonb_build_object('id', id, 'teks', teks) order by urutan), '[]'::jsonb)
        into v_opts from public.question_options where question_id = v_q.id;
        select coalesce(jsonb_agg(pasangan order by random()), '[]'::jsonb)
        into v_right from public.question_options where question_id = v_q.id;
        v_questions := v_questions || jsonb_build_object('id', v_q.id, 'tipe', v_q.tipe, 'teks', v_q.teks, 'gambar', v_q.gambar, 'bobot', v_q.bobot, 'left_items', v_opts, 'right_items', v_right);
      else
        v_questions := v_questions || jsonb_build_object('id', v_q.id, 'tipe', v_q.tipe, 'teks', v_q.teks, 'gambar', v_q.gambar, 'bobot', v_q.bobot);
      end if;
    end loop;
  end if;

  return jsonb_build_object(
    'exam', jsonb_build_object(
      'id', v_exam.id,
      'judul', v_exam.judul,
      'mapel', v_mapel,
      'durasi', v_exam.durasi,
      'jenis', v_exam.jenis,
      'navigasi', v_exam.navigasi,
      'petunjuk', v_exam.petunjuk
    ),
    'questions', v_questions
  );
end;
$$;

-- ============================================================================
-- 6. SUPABASE STORAGE BUCKET (Gambar Soal & Logo Sekolah)
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('cbt-assets', 'cbt-assets', true)
on conflict (id) do nothing;

drop policy if exists "cbt_assets_public_read" on storage.objects;
create policy "cbt_assets_public_read" on storage.objects
  for select using (bucket_id = 'cbt-assets');

drop policy if exists "cbt_assets_guru_admin_write" on storage.objects;
create policy "cbt_assets_guru_admin_write" on storage.objects
  for insert with check (bucket_id = 'cbt-assets' and public.is_guru_or_admin());

drop policy if exists "cbt_assets_guru_admin_update" on storage.objects;
create policy "cbt_assets_guru_admin_update" on storage.objects
  for update using (bucket_id = 'cbt-assets' and public.is_guru_or_admin());

drop policy if exists "cbt_assets_guru_admin_delete" on storage.objects;
create policy "cbt_assets_guru_admin_delete" on storage.objects
  for delete using (bucket_id = 'cbt-assets' and public.is_guru_or_admin());

-- ============================================================================
-- 7. AKTIFKAN REALTIME UNTUK MONITORING ADMIN
-- ============================================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'attempts'
  ) then
    alter publication supabase_realtime add table public.attempts;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'attempt_logs'
  ) then
    alter publication supabase_realtime add table public.attempt_logs;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'answers'
  ) then
    alter publication supabase_realtime add table public.answers;
  end if;
end $$;
