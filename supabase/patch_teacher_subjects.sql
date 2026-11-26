-- ============================================================================
-- PATCH: Pasangan Mata Pelajaran per Guru (teacher_subjects) + RLS Isolasi Mapel
-- Jalankan skrip ini di Supabase Dashboard -> SQL Editor -> New Query
-- ============================================================================

create table if not exists public.teacher_subjects (
  guru_id uuid not null references public.profiles(id) on delete cascade,
  subject_id bigint not null references public.subjects(id) on delete cascade,
  primary key (guru_id, subject_id)
);

create index if not exists idx_teacher_subjects_guru on public.teacher_subjects(guru_id);
create index if not exists idx_teacher_subjects_subject on public.teacher_subjects(subject_id);

alter table public.teacher_subjects enable row level security;

drop policy if exists "teacher_subjects_select" on public.teacher_subjects;
create policy "teacher_subjects_select" on public.teacher_subjects for select
  using (guru_id = auth.uid() or public.is_admin());

drop policy if exists "teacher_subjects_admin_all" on public.teacher_subjects;
create policy "teacher_subjects_admin_all" on public.teacher_subjects for all
  using (public.is_admin()) with check (public.is_admin());

-- Helper: Admin boleh akses semua mapel; Guru hanya mapel yang dipasangkan
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

-- Perketat RLS agar guru hanya bisa melihat/mengelola soal, ujian, & nilai mapel yang diampu
drop policy if exists "questions_guru_admin" on public.questions;
create policy "questions_guru_admin" on public.questions for all
  using (public.can_access_subject(subject_id))
  with check (public.can_access_subject(subject_id));

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

drop policy if exists "exams_guru_admin" on public.exams;
create policy "exams_guru_admin" on public.exams for all
  using (public.can_access_subject(subject_id))
  with check (public.can_access_subject(subject_id));

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

-- Juga perketat akses pratinjau ujian agar guru hanya bisa melihat mapelnya
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
