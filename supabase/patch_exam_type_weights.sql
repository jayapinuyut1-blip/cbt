-- ============================================================================
-- PATCH BOBOT PERSENTASE PER TIPE SOAL (exams.bobot_tipe)
-- Jalankan skrip ini di Supabase Dashboard -> SQL Editor -> New Query
-- Fitur:
-- 1. Menambah kolom bobot_tipe (JSONB, opsional) pada tabel public.exams
--    - NULL  : mode default (hitung otomatis dari bobot masing-masing soal)
--    - JSONB : mode persentase per tipe, contoh {"pg":70,"isian":0,"jodoh":0,"essay":30}
-- 2. Memperbarui fungsi recalculate_attempt_score agar mendukung kedua mode
--    sekaligus mempertahankan seluruh proteksi keamanan (anti-anon/anti-siswa).
-- 3. Memastikan hak EXECUTE RPC hanya untuk authenticated & service_role.
-- ============================================================================

alter table public.exams
  add column if not exists bobot_tipe jsonb;

create or replace function public.recalculate_attempt_score(p_attempt_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt public.attempts%rowtype;
  v_exam public.exams%rowtype;
  v_jwt_role text;
  v_internal text;
  v_item jsonb;
  v_q public.questions%rowtype;
  v_ans public.answers%rowtype;

  -- Akumulator global (mode bobot per soal)
  v_total_bobot numeric(10,2) := 0;
  v_total_skor numeric(10,2) := 0;
  v_obj_skor numeric(10,2) := 0;

  -- Akumulator per tipe soal (mode persentase per tipe)
  v_bobot_pg numeric(10,2) := 0;
  v_skor_pg numeric(10,2) := 0;
  v_bobot_isian numeric(10,2) := 0;
  v_skor_isian numeric(10,2) := 0;
  v_bobot_jodoh numeric(10,2) := 0;
  v_skor_jodoh numeric(10,2) := 0;
  v_bobot_essay numeric(10,2) := 0;
  v_skor_essay numeric(10,2) := 0;

  v_pct_pg numeric(10,4) := 0;
  v_pct_isian numeric(10,4) := 0;
  v_pct_jodoh numeric(10,4) := 0;
  v_pct_essay numeric(10,4) := 0;
  v_active_pct numeric(10,4) := 0;
  v_weighted_obj numeric(12,6) := 0;
  v_weighted_total numeric(12,6) := 0;

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
  v_jwt_role := coalesce(current_setting('request.jwt.claim.role', true), '');
  v_internal := coalesce(current_setting('app.internal_grade', true), 'false');

  if v_internal <> 'true' and v_jwt_role <> 'service_role' and auth.uid() is null then
    raise exception 'Akses ditolak';
  end if;

  select * into v_attempt from public.attempts where id = p_attempt_id;
  if not found then
    raise exception 'Percobaan ujian tidak ditemukan';
  end if;

  select * into v_exam from public.exams where id = v_attempt.exam_id;

  -- Validasi otorisasi pemanggil: blokir anon & siswa langsung
  if v_internal <> 'true' and v_jwt_role <> 'service_role' then
    if not public.can_access_subject(v_exam.subject_id) then
      raise exception 'Akses ditolak: hanya Admin atau Guru pengampu mapel yang berhak menghitung ulang nilai.';
    end if;
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
      v_bobot_pg := v_bobot_pg + v_q.bobot;
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
      v_skor_pg := v_skor_pg + v_skor;
      v_obj_skor := v_obj_skor + v_skor;
      v_total_skor := v_total_skor + v_skor;

    elsif v_q.tipe = 'isian' then
      v_bobot_isian := v_bobot_isian + v_q.bobot;
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
      v_skor_isian := v_skor_isian + v_skor;
      v_obj_skor := v_obj_skor + v_skor;
      v_total_skor := v_total_skor + v_skor;

    elsif v_q.tipe = 'jodoh' then
      v_bobot_jodoh := v_bobot_jodoh + v_q.bobot;
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
      v_skor_jodoh := v_skor_jodoh + v_skor;
      v_obj_skor := v_obj_skor + v_skor;
      v_total_skor := v_total_skor + v_skor;

    elsif v_q.tipe = 'essay' then
      v_has_essay := true;
      v_bobot_essay := v_bobot_essay + v_q.bobot;
      if not found then
        insert into public.answers (attempt_id, question_id, jawaban, ragu, skor)
        values (p_attempt_id, v_q.id, '{"text":""}'::jsonb, false, null)
        on conflict (attempt_id, question_id) do nothing;
        v_has_ungraded_essay := true;
      elsif v_ans.skor is null then
        v_has_ungraded_essay := true;
      else
        v_skor_essay := v_skor_essay + v_ans.skor;
        v_total_skor := v_total_skor + v_ans.skor;
      end if;
    end if;
  end loop;

  -- Hitung nilai: cek apakah ujian memakai mode persentase per tipe (bobot_tipe)
  if v_exam.bobot_tipe is not null and jsonb_typeof(v_exam.bobot_tipe) = 'object' then
    v_pct_pg := greatest(coalesce(nullif(v_exam.bobot_tipe->>'pg', '')::numeric, 0), 0);
    v_pct_isian := greatest(coalesce(nullif(v_exam.bobot_tipe->>'isian', '')::numeric, 0), 0);
    v_pct_jodoh := greatest(coalesce(nullif(v_exam.bobot_tipe->>'jodoh', '')::numeric, 0), 0);
    v_pct_essay := greatest(coalesce(nullif(v_exam.bobot_tipe->>'essay', '')::numeric, 0), 0);

    v_active_pct :=
      (case when v_bobot_pg > 0 then v_pct_pg else 0 end) +
      (case when v_bobot_isian > 0 then v_pct_isian else 0 end) +
      (case when v_bobot_jodoh > 0 then v_pct_jodoh else 0 end) +
      (case when v_bobot_essay > 0 then v_pct_essay else 0 end);
  end if;

  if v_active_pct > 0 then
    v_weighted_obj :=
      (case when v_bobot_pg > 0 then (v_skor_pg / v_bobot_pg) * v_pct_pg else 0 end) +
      (case when v_bobot_isian > 0 then (v_skor_isian / v_bobot_isian) * v_pct_isian else 0 end) +
      (case when v_bobot_jodoh > 0 then (v_skor_jodoh / v_bobot_jodoh) * v_pct_jodoh else 0 end);

    v_weighted_total := v_weighted_obj +
      (case when v_bobot_essay > 0 then (v_skor_essay / v_bobot_essay) * v_pct_essay else 0 end);

    v_nilai_sementara := least(100, greatest(0, round((v_weighted_obj / v_active_pct) * 100, 2)));

    if v_has_essay and v_has_ungraded_essay then
      v_final_status := 'menunggu_koreksi';
      v_nilai := null;
    else
      v_final_status := 'selesai';
      v_nilai := least(100, greatest(0, round((v_weighted_total / v_active_pct) * 100, 2)));
    end if;
  else
    -- Mode default: proporsional berdasarkan bobot tiap soal
    v_nilai_sementara := case when v_total_bobot > 0 then round((v_obj_skor / v_total_bobot) * 100, 2) else 0 end;

    if v_has_essay and v_has_ungraded_essay then
      v_final_status := 'menunggu_koreksi';
      v_nilai := null;
    else
      v_final_status := 'selesai';
      v_nilai := case when v_total_bobot > 0 then round((v_total_skor / v_total_bobot) * 100, 2) else 0 end;
    end if;
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

-- Pastikan izin EXECUTE semua fungsi RPC ujian dicabut dari PUBLIC dan anon
revoke all on function public.recalculate_attempt_score(bigint) from public, anon;
revoke all on function public.get_student_available_exams() from public, anon;
revoke all on function public.start_or_resume_exam(bigint, text, text) from public, anon;
revoke all on function public.save_student_answer(bigint, bigint, jsonb, boolean, text) from public, anon;
revoke all on function public.log_attempt_event(bigint, text, text) from public, anon;
revoke all on function public.submit_exam_attempt(bigint, text) from public, anon;
revoke all on function public.get_attempt_result(bigint) from public, anon;
revoke all on function public.get_exam_preview(bigint) from public, anon;

grant execute on function public.recalculate_attempt_score(bigint) to authenticated, service_role;
grant execute on function public.get_student_available_exams() to authenticated, service_role;
grant execute on function public.start_or_resume_exam(bigint, text, text) to authenticated, service_role;
grant execute on function public.save_student_answer(bigint, bigint, jsonb, boolean, text) to authenticated, service_role;
grant execute on function public.log_attempt_event(bigint, text, text) to authenticated, service_role;
grant execute on function public.submit_exam_attempt(bigint, text) to authenticated, service_role;
grant execute on function public.get_attempt_result(bigint) to authenticated, service_role;
grant execute on function public.get_exam_preview(bigint) to authenticated, service_role;
