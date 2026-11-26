-- ============================================================================
-- PATCH ANTI-CURANG MODE KETAT (OPSI A: BATAS PELANGGARAN & KUNCI LAYAR SERVER-SIDE)
-- Jalankan skrip ini di Supabase Dashboard -> SQL Editor -> New Query
-- Fitur:
-- 1. exams.maks_pelanggaran (default 3; 0 = catat saja tanpa kunci)
-- 2. attempts.pelanggaran_count, attempts.is_locked, attempts.locked_reason
-- 3. Perluasan attempt_logs.jenis ('pindah_tab', 'keluar_layar_penuh', 'split_screen', 'copy_paste', 'reset_login', 'buka_kunci')
-- 4. Penegakan kunci layar langsung di server (log_attempt_event, save_student_answer, start_or_resume_exam)
--    sehingga refresh browser TIDAK dapat membuka kunci tanpa persetujuan Pengawas/Admin.
-- ============================================================================

-- 1. Tambah kolom keamanan di tabel exams & attempts
alter table public.exams
  add column if not exists maks_pelanggaran int not null default 3 check (maks_pelanggaran >= 0);

alter table public.attempts
  add column if not exists pelanggaran_count int not null default 0,
  add column if not exists is_locked boolean not null default false,
  add column if not exists locked_reason text;

-- 2. Perluas jenis log aktivitas di attempt_logs
alter table public.attempt_logs
  drop constraint if exists attempt_logs_jenis_check;

alter table public.attempt_logs
  add constraint attempt_logs_jenis_check
  check (jenis in ('pindah_tab', 'keluar_layar_penuh', 'split_screen', 'copy_paste', 'reset_login', 'buka_kunci'));

-- 3. Perbarui start_or_resume_exam agar menyertakan status kunci, pelanggaran, & watermark siswa
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
  v_has_attempt boolean := false;
  v_need_new_attempt boolean := false;
  v_next_ke int := 1;
  v_is_remedial boolean := false;
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
  if v_profile.active_session_id is null or p_session_id is null or v_profile.active_session_id <> p_session_id then
    raise exception 'SESSION_CONFLICT: Sesi login Anda tidak valid atau telah direset pengawas. Silakan login ulang.';
  end if;

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

  select * into v_attempt
  from public.attempts
  where exam_id = p_exam_id and student_id = v_profile.id
  order by attempt_ke desc
  limit 1;

  v_has_attempt := found;

  if not v_has_attempt then
    v_need_new_attempt := true;
    v_next_ke := 1;
    v_is_remedial := false;
  elsif v_attempt.status = 'mengerjakan' then
    v_need_new_attempt := false;
    update public.attempts set last_active_at = now() where id = v_attempt.id;
  elsif coalesce(v_override.allow_remedial, false) = true and coalesce(v_override.remedial_ke, 1) > v_attempt.attempt_ke then
    v_need_new_attempt := true;
    v_next_ke := v_override.remedial_ke;
    v_is_remedial := true;
  else
    raise exception 'Ujian sudah selesai dikumpulkan.';
  end if;

  if v_need_new_attempt then
    if now() < v_effective_mulai then
      raise exception 'Ujian belum dimulai. Jadwal mulai: %', to_char(v_effective_mulai at time zone 'Asia/Makassar', 'DD Mon YYYY HH24:MI');
    end if;
    if now() > v_effective_selesai then
      raise exception 'Waktu jadwal ujian sudah berakhir.';
    end if;
    if upper(trim(coalesce(p_token, ''))) <> upper(trim(v_exam.token)) then
      raise exception 'Token ujian salah. Periksa kembali token dari pengawas.';
    end if;

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

    insert into public.attempts (exam_id, student_id, attempt_ke, is_remedial, mulai, status, question_order, last_active_at)
    values (p_exam_id, v_profile.id, v_next_ke, v_is_remedial, now(), 'mengerjakan', v_q_order, now())
    returning * into v_attempt;
  end if;

  v_deadline := least(
    v_attempt.mulai + make_interval(mins => v_effective_durasi),
    coalesce(v_effective_selesai, v_attempt.mulai + make_interval(mins => v_effective_durasi))
  ) + make_interval(mins => v_attempt.extra_minutes);

  if now() >= v_deadline then
    perform set_config('app.internal_grade', 'true', true);
    perform public.recalculate_attempt_score(v_attempt.id);
    raise exception 'TIME_EXPIRED: Waktu ujian Anda telah habis dan jawaban telah dikumpulkan otomatis.';
  end if;

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
        'id', v_q.id, 'tipe', v_q.tipe, 'teks', v_q.teks, 'gambar', v_q.gambar, 'bobot', v_q.bobot, 'options', v_opts
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
        'id', v_q.id, 'tipe', v_q.tipe, 'teks', v_q.teks, 'gambar', v_q.gambar, 'bobot', v_q.bobot,
        'left_items', v_left_items, 'right_items', coalesce(v_item->'right_order', '[]'::jsonb)
      );

    else
      v_questions_payload := v_questions_payload || jsonb_build_object(
        'id', v_q.id, 'tipe', v_q.tipe, 'teks', v_q.teks, 'gambar', v_q.gambar, 'bobot', v_q.bobot
      );
    end if;
  end loop;

  for v_ans in select question_id, jawaban, ragu from public.answers where attempt_id = v_attempt.id
  loop
    v_answers_payload := v_answers_payload || jsonb_build_object(
      v_ans.question_id::text,
      jsonb_build_object('jawaban', v_ans.jawaban, 'ragu', v_ans.ragu)
    );
  end loop;

  return jsonb_build_object(
    'attempt_id', v_attempt.id,
    'attempt_ke', v_attempt.attempt_ke,
    'is_remedial', v_attempt.is_remedial,
    'is_locked', coalesce(v_attempt.is_locked, false),
    'locked_reason', v_attempt.locked_reason,
    'pelanggaran_count', coalesce(v_attempt.pelanggaran_count, 0),
    'maks_pelanggaran', coalesce(v_exam.maks_pelanggaran, 3),
    'student_watermark', v_profile.nama || ' • ' || v_profile.username,
    'exam', jsonb_build_object(
      'id', v_exam.id, 'judul', v_exam.judul, 'mapel', v_mapel,
      'durasi', v_effective_durasi + v_attempt.extra_minutes,
      'jenis', v_exam.jenis, 'navigasi', v_exam.navigasi, 'petunjuk', v_exam.petunjuk,
      'maks_pelanggaran', coalesce(v_exam.maks_pelanggaran, 3)
    ),
    'server_now', now(),
    'deadline', v_deadline,
    'questions', v_questions_payload,
    'answers', v_answers_payload
  );
end;
$$;

-- 4. Perketat save_student_answer: tolak simpan jawaban jika attempt sedang TERKUNCI
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
  if not v_profile.aktif then
    raise exception 'Akun Anda tidak aktif';
  end if;
  if v_profile.is_blocked then
    raise exception 'BLOCKED: Akun Anda diblokir oleh pengawas.';
  end if;
  if v_profile.active_session_id is null or p_session_id is null or v_profile.active_session_id <> p_session_id then
    raise exception 'SESSION_CONFLICT: Sesi Anda telah berakhir karena login di perangkat lain atau direset admin.';
  end if;

  select * into v_attempt from public.attempts where id = p_attempt_id and student_id = v_profile.id;
  if not found then
    raise exception 'Percobaan ujian tidak ditemukan';
  end if;
  if v_attempt.status <> 'mengerjakan' then
    raise exception 'ATTEMPT_CLOSED: Ujian sudah ditutup atau dikumpulkan.';
  end if;
  if coalesce(v_attempt.is_locked, false) = true then
    raise exception 'ATTEMPT_LOCKED: Layar ujian Anda sedang terkunci karena melampaui batas pelanggaran. Hubungi pengawas untuk membuka kunci.';
  end if;

  if not exists (
    select 1 from jsonb_array_elements(v_attempt.question_order) elem
    where (elem->>'question_id')::bigint = p_question_id
  ) then
    raise exception 'Soal tidak valid untuk percobaan ujian ini.';
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
    perform set_config('app.internal_grade', 'true', true);
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

-- 5. Perbarui log_attempt_event: hitung pelanggaran & kunci otomatis di server saat batas tercapai (Opsi A)
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
  v_profile public.profiles%rowtype;
  v_attempt public.attempts%rowtype;
  v_exam public.exams%rowtype;
  v_new_count int;
  v_maks int;
  v_should_lock boolean := false;
  v_reason text;
begin
  if p_jenis not in ('pindah_tab', 'keluar_layar_penuh', 'split_screen', 'copy_paste') then
    raise exception 'Jenis log tidak valid';
  end if;

  select * into v_profile from public.profiles where id = auth.uid();
  if not found or v_profile.role <> 'siswa' then
    return jsonb_build_object('ok', false);
  end if;

  if v_profile.active_session_id is null or p_session_id is null or v_profile.active_session_id <> p_session_id then
    return jsonb_build_object('ok', false, 'reason', 'SESSION_CONFLICT');
  end if;

  select * into v_attempt from public.attempts where id = p_attempt_id and student_id = auth.uid();
  if not found or v_attempt.status <> 'mengerjakan' then
    return jsonb_build_object('ok', false);
  end if;

  select * into v_exam from public.exams where id = v_attempt.exam_id;
  v_maks := coalesce(v_exam.maks_pelanggaran, 3);

  insert into public.attempt_logs (attempt_id, jenis, waktu)
  values (p_attempt_id, p_jenis, now());

  -- Jika sudah terkunci sebelumnya, jangan tambah count berlebih, kembalikan status terkunci
  if coalesce(v_attempt.is_locked, false) = true then
    return jsonb_build_object(
      'ok', true,
      'pelanggaran_count', coalesce(v_attempt.pelanggaran_count, 0),
      'maks_pelanggaran', v_maks,
      'is_locked', true,
      'locked_reason', v_attempt.locked_reason
    );
  end if;

  -- Pelanggaran serius (pindah tab / keluar layar penuh / split screen) menambah counter
  if p_jenis in ('pindah_tab', 'keluar_layar_penuh', 'split_screen') then
    v_new_count := coalesce(v_attempt.pelanggaran_count, 0) + 1;
    if v_maks > 0 and v_new_count >= v_maks then
      v_should_lock := true;
      v_reason := 'Melebihi batas pelanggaran (' || v_new_count || '/' || v_maks || ')';
    end if;

    update public.attempts
    set
      pelanggaran_count = v_new_count,
      is_locked = case when v_should_lock then true else is_locked end,
      locked_reason = case when v_should_lock then v_reason else locked_reason end,
      last_active_at = now()
    where id = p_attempt_id;
  else
    v_new_count := coalesce(v_attempt.pelanggaran_count, 0);
    update public.attempts set last_active_at = now() where id = p_attempt_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'pelanggaran_count', v_new_count,
    'maks_pelanggaran', v_maks,
    'is_locked', v_should_lock,
    'locked_reason', v_reason
  );
end;
$$;

-- 6. Pastikan izin EXECUTE RPC tetap aman (hanya authenticated & service_role)
revoke all on function public.start_or_resume_exam(bigint, text, text) from public, anon;
revoke all on function public.save_student_answer(bigint, bigint, jsonb, boolean, text) from public, anon;
revoke all on function public.log_attempt_event(bigint, text, text) from public, anon;

grant execute on function public.start_or_resume_exam(bigint, text, text) to authenticated, service_role;
grant execute on function public.save_student_answer(bigint, bigint, jsonb, boolean, text) to authenticated, service_role;
grant execute on function public.log_attempt_event(bigint, text, text) to authenticated, service_role;
