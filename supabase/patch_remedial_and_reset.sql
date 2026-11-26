-- ============================================================================
-- PATCH: Dukungan Remedial Multi-Percobaan (attempt_ke) & Aturan Nilai Remedial
-- Jalankan skrip ini di Supabase Dashboard -> SQL Editor -> New Query
-- ============================================================================

-- 1. Tambah kolom aturan remedial di tabel exams
alter table public.exams
  add column if not exists aturan_remedial text not null default 'maks_kkm'
  check (aturan_remedial in ('maks_kkm', 'nilai_terbaik', 'nilai_terakhir'));

-- 2. Tambah kolom attempt_ke & is_remedial di tabel attempts, ubah unique constraint
alter table public.attempts
  add column if not exists attempt_ke int not null default 1;

alter table public.attempts
  add column if not exists is_remedial boolean not null default false;

alter table public.attempts
  drop constraint if exists attempts_exam_id_student_id_key;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'attempts_exam_student_ke_key'
  ) then
    alter table public.attempts
      add constraint attempts_exam_student_ke_key unique (exam_id, student_id, attempt_ke);
  end if;
end $$;

-- 3. Tambah kolom izin remedial di tabel exam_overrides
alter table public.exam_overrides
  add column if not exists allow_remedial boolean not null default false;

alter table public.exam_overrides
  add column if not exists remedial_ke int not null default 1;

-- 4. Update RPC get_student_available_exams agar membaca percobaan terbaru & status remedial
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
      e.aturan_remedial,
      coalesce(sch.sesi, 'Susulan / Remedial') as sesi,
      coalesce(ov.mulai, sch.mulai) as mulai_efektif,
      coalesce(ov.selesai, sch.selesai) as selesai_efektif,
      case
        when e.jumlah_soal_acak is not null and e.jumlah_soal_acak > 0 then e.jumlah_soal_acak
        else (select count(*) from public.exam_questions eq where eq.exam_id = e.id)
      end as jumlah_soal,
      att.id as attempt_id,
      att.attempt_ke,
      att.is_remedial,
      att.status as attempt_status,
      att.mulai as attempt_mulai,
      att.selesai as attempt_selesai,
      case
        when att.status = 'selesai' and (e.jenis = 'latihan' or e.tampil_hasil in ('nilai', 'nilai_kunci')) then att.nilai
        when att.status = 'menunggu_koreksi' and (e.jenis = 'latihan' or e.tampil_hasil in ('nilai', 'nilai_kunci')) then att.nilai_sementara
        else null
      end as nilai_tampil,
      (
        coalesce(ov.allow_remedial, false) = true
        and coalesce(ov.remedial_ke, 1) > coalesce(att.attempt_ke, 0)
        and (att.status is null or att.status <> 'mengerjakan')
      ) as remedial_tersedia,
      coalesce(ov.remedial_ke, 1) as remedial_ke,
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
    left join lateral (
      select a.* from public.attempts a
      where a.exam_id = e.id and a.student_id = v_profile.id
      order by a.attempt_ke desc
      limit 1
    ) att on true
    where sch.id is not null or ov.id is not null or att.id is not null
  ) row_data;

  return jsonb_build_object(
    'server_now', now(),
    'is_blocked', v_profile.is_blocked,
    'exams', v_result
  );
end;
$$;

-- 5. Update RPC start_or_resume_exam agar mendukung pembuatan attempt remedial baru (attempt_ke = 2, 3, dst.)
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

  -- 3. Ambil attempt terbaru siswa pada ujian ini
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

    -- Bangun urutan soal & opsi acak baru
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

  -- 4. Hitung Deadline Berbasis Waktu Server + Extra Minutes
  v_deadline := least(
    v_attempt.mulai + make_interval(mins => v_effective_durasi),
    coalesce(v_effective_selesai, v_attempt.mulai + make_interval(mins => v_effective_durasi))
  ) + make_interval(mins => v_attempt.extra_minutes);

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
    'attempt_ke', v_attempt.attempt_ke,
    'is_remedial', v_attempt.is_remedial,
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

-- 6. Update RPC get_attempt_result untuk menyertakan info remedial
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
    'attempt_ke', v_attempt.attempt_ke,
    'is_remedial', v_attempt.is_remedial,
    'status', v_attempt.status,
    'mulai', v_attempt.mulai,
    'selesai', v_attempt.selesai,
    'exam', jsonb_build_object(
      'id', v_exam.id,
      'judul', v_exam.judul,
      'mapel', v_mapel,
      'kkm', v_exam.kkm,
      'jenis', v_exam.jenis,
      'tampil_hasil', v_exam.tampil_hasil,
      'aturan_remedial', v_exam.aturan_remedial
    ),
    'show_score', v_show_score,
    'show_key', v_show_key,
    'nilai', case when v_show_score then v_attempt.nilai else null end,
    'nilai_sementara', case when v_show_score then v_attempt.nilai_sementara else null end,
    'details', v_details
  );
end;
$$;
