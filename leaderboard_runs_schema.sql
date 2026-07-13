begin;

create extension if not exists pgcrypto;

create table if not exists public.leaderboard_runs (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid references auth.users(id) on delete set null,
  status text not null default 'prepared' check (status in ('prepared', 'active', 'verified', 'disqualified', 'expired')),
  questions jsonb not null,
  answer_key jsonb not null,
  prepared_at timestamptz not null default now(),
  prepared_expires_at timestamptz not null default (now() + interval '2 minutes'),
  starts_at timestamptz,
  ends_at timestamptz,
  submitted_at timestamptz,
  transcript_hash text,
  verified_score integer,
  verified_qpm integer,
  verified_accuracy integer,
  verified_skips integer,
  eligibility_reason text,
  claimed_at timestamptz,
  leaderboard_id uuid,
  constraint leaderboard_runs_batch_size check (
    jsonb_typeof(questions) = 'array' and jsonb_array_length(questions) = 300 and
    jsonb_typeof(answer_key) = 'array' and jsonb_array_length(answer_key) = 300
  )
);

alter table public.leaderboard_runs enable row level security;
revoke all on table public.leaderboard_runs from anon, authenticated;
revoke insert on table public.leaderboard from anon, authenticated;

create index if not exists leaderboard_runs_expiry_idx
  on public.leaderboard_runs (prepared_expires_at, ends_at);

create or replace function public.expire_leaderboard_runs()
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  changed integer;
begin
  update public.leaderboard_runs
  set status = 'expired', eligibility_reason = 'run_expired'
  where status in ('prepared', 'active')
    and coalesce(ends_at + interval '30 seconds', prepared_expires_at) < now();
  get diagnostics changed = row_count;
  return changed;
end;
$$;

create or replace function public.prepare_leaderboard_run(
  p_token_hash text,
  p_user_id uuid,
  p_questions jsonb,
  p_answer_key jsonb
)
returns table(run_id uuid, prepared_expires_at timestamptz)
language plpgsql security definer set search_path = public
as $$
begin
  if p_token_hash !~ '^[0-9a-f]{64}$'
     or jsonb_typeof(p_questions) <> 'array'
     or jsonb_array_length(p_questions) <> 300
     or jsonb_typeof(p_answer_key) <> 'array'
     or jsonb_array_length(p_answer_key) <> 300 then
    raise exception 'INVALID_RUN_BATCH';
  end if;

  perform public.expire_leaderboard_runs();

  return query
  insert into public.leaderboard_runs(token_hash, user_id, questions, answer_key)
  values (p_token_hash, p_user_id, p_questions, p_answer_key)
  returning id, leaderboard_runs.prepared_expires_at;
end;
$$;

create or replace function public.begin_leaderboard_run(p_run_id uuid, p_token_hash text)
returns table(starts_at timestamptz, ends_at timestamptz)
language plpgsql security definer set search_path = public
as $$
declare
  selected public.leaderboard_runs%rowtype;
begin
  select * into selected from public.leaderboard_runs
  where id = p_run_id and token_hash = p_token_hash for update;
  if not found then raise exception 'RUN_NOT_FOUND'; end if;
  if selected.status = 'active' then
    return query select selected.starts_at, selected.ends_at;
    return;
  end if;
  if selected.status <> 'prepared' then raise exception 'RUN_ALREADY_FINISHED'; end if;
  if selected.prepared_expires_at <= now() then
    raise exception 'RUN_EXPIRED';
  end if;

  return query
  update public.leaderboard_runs
  set status = 'active', starts_at = now(), ends_at = now() + interval '120 seconds'
  where id = p_run_id
  returning leaderboard_runs.starts_at, leaderboard_runs.ends_at;
end;
$$;

create or replace function public.submit_leaderboard_run(
  p_run_id uuid,
  p_token_hash text,
  p_transcript jsonb
)
returns table(score integer, qpm integer, accuracy integer, skips integer, eligible boolean, eligibility_reason text)
language plpgsql security definer set search_path = public, extensions
as $$
declare
  selected public.leaderboard_runs%rowtype;
  action jsonb;
  expected_index integer := 0;
  expected_answer integer;
  supplied_answer integer;
  elapsed integer;
  previous_elapsed integer := -1;
  mistake_count integer;
  total_mistakes integer := 0;
  calculated_score integer := 0;
  calculated_skips integer := 0;
  calculated_accuracy integer;
  calculated_qpm integer;
  digest_value text;
  reason text := null;
begin
  if jsonb_typeof(p_transcript) <> 'array' or jsonb_array_length(p_transcript) > 300 then
    raise exception 'INVALID_TRANSCRIPT';
  end if;
  digest_value := encode(digest(p_transcript::text, 'sha256'), 'hex');

  select * into selected from public.leaderboard_runs
  where id = p_run_id and token_hash = p_token_hash for update;
  if not found then raise exception 'RUN_NOT_FOUND'; end if;

  if selected.status in ('verified', 'disqualified') then
    if selected.transcript_hash <> digest_value then raise exception 'TRANSCRIPT_CONFLICT'; end if;
    return query select selected.verified_score, selected.verified_qpm, selected.verified_accuracy,
      selected.verified_skips, selected.status = 'verified', selected.eligibility_reason;
    return;
  end if;
  if selected.status <> 'active' then raise exception 'INVALID_RUN_STATE'; end if;
  if now() < selected.ends_at then raise exception 'TOO_EARLY_TO_SUBMIT'; end if;
  if now() > selected.ends_at + interval '30 seconds' then
    raise exception 'RUN_EXPIRED';
  end if;

  for action in select value from jsonb_array_elements(p_transcript)
  loop
    if jsonb_typeof(action) <> 'object'
       or not (action ?& array['questionIndex', 'type', 'elapsedMs', 'mistakes'])
       or (action->>'questionIndex')::integer <> expected_index
       or action->>'type' not in ('answered', 'skipped') then
      raise exception 'INVALID_TRANSCRIPT_ORDER';
    end if;
    elapsed := (action->>'elapsedMs')::integer;
    mistake_count := coalesce((action->>'mistakes')::integer, 0);
    if elapsed < previous_elapsed or elapsed < 0 or elapsed > 120000
       or mistake_count < 0 or mistake_count > 100 then
      raise exception 'INVALID_TRANSCRIPT_TIMING';
    end if;
    previous_elapsed := elapsed;
    total_mistakes := total_mistakes + mistake_count;
    expected_answer := (selected.answer_key->>expected_index)::integer;

    if action->>'type' = 'skipped' then
      calculated_skips := calculated_skips + 1;
    else
      if not (action ? 'answer') then raise exception 'INVALID_TRANSCRIPT_ANSWER'; end if;
      supplied_answer := (action->>'answer')::integer;
      if supplied_answer = expected_answer then calculated_score := calculated_score + 1; end if;
    end if;
    expected_index := expected_index + 1;
  end loop;

  calculated_qpm := round(calculated_score / 2.0);
  calculated_accuracy := case when calculated_score + total_mistakes = 0 then 0
    else round(calculated_score * 100.0 / (calculated_score + total_mistakes)) end;
  if calculated_skips > 0 then reason := 'skipped_question'; end if;
  if calculated_score = 0 and reason is null then reason := 'no_correct_answers'; end if;

  update public.leaderboard_runs
  set status = case when reason is null then 'verified' else 'disqualified' end,
      submitted_at = now(), transcript_hash = digest_value,
      verified_score = calculated_score, verified_qpm = calculated_qpm,
      verified_accuracy = calculated_accuracy, verified_skips = calculated_skips,
      eligibility_reason = reason
  where id = p_run_id;

  return query select calculated_score, calculated_qpm, calculated_accuracy,
    calculated_skips, reason is null, reason;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'INVALID_TRANSCRIPT_VALUE';
end;
$$;

create or replace function public.claim_leaderboard_run(
  p_run_id uuid,
  p_token_hash text,
  p_user_id uuid,
  p_username text
)
returns table(leaderboard_id uuid, already_claimed boolean)
language plpgsql security definer set search_path = public
as $$
declare
  selected public.leaderboard_runs%rowtype;
  inserted_id uuid;
begin
  select * into selected from public.leaderboard_runs
  where id = p_run_id and token_hash = p_token_hash for update;
  if not found then raise exception 'RUN_NOT_FOUND'; end if;
  if selected.user_id is not null and selected.user_id <> p_user_id then raise exception 'INVALID_RUN_OWNER'; end if;
  if selected.status <> 'verified' then raise exception 'RUN_NOT_ELIGIBLE'; end if;
  if selected.claimed_at is not null then
    if selected.user_id <> p_user_id then raise exception 'RUN_ALREADY_CLAIMED'; end if;
    return query select selected.leaderboard_id, true;
    return;
  end if;

  insert into public.leaderboard(user_id, username, score, qpm, accuracy)
  values (p_user_id, left(coalesce(nullif(trim(p_username), ''), 'Player'), 24),
    selected.verified_score, selected.verified_qpm, selected.verified_accuracy)
  returning id into inserted_id;

  update public.leaderboard_runs
  set user_id = p_user_id, claimed_at = now(), leaderboard_id = inserted_id
  where id = p_run_id;
  return query select inserted_id, false;
end;
$$;

revoke all on function public.prepare_leaderboard_run(text, uuid, jsonb, jsonb) from public;
revoke all on function public.expire_leaderboard_runs() from public;
revoke all on function public.begin_leaderboard_run(uuid, text) from public;
revoke all on function public.submit_leaderboard_run(uuid, text, jsonb) from public;
revoke all on function public.claim_leaderboard_run(uuid, text, uuid, text) from public;
grant execute on function public.prepare_leaderboard_run(text, uuid, jsonb, jsonb) to service_role;
grant execute on function public.expire_leaderboard_runs() to service_role;
grant execute on function public.begin_leaderboard_run(uuid, text) to service_role;
grant execute on function public.submit_leaderboard_run(uuid, text, jsonb) to service_role;
grant execute on function public.claim_leaderboard_run(uuid, text, uuid, text) to service_role;

commit;
