-- Public API v1: API keys, analysis jobs (single images and series) and a
-- credit ledger. All writes go through the server with the service-role key
-- and are scoped to one user_id there; RLS only grants owners read access.

-- ---------------------------------------------------------------------------
-- API keys
-- ---------------------------------------------------------------------------
create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  -- First characters of the key, safe to display ("al_live_AbCd").
  prefix text not null,
  -- SHA-256 (hex) of the full key; the key itself is never stored.
  key_hash text not null unique,
  scopes text[] not null default array['analyses:read', 'analyses:write'],
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create index if not exists api_keys_user_id_idx on public.api_keys (user_id, created_at desc);

alter table public.api_keys enable row level security;

create policy "Users can view their own API keys"
  on public.api_keys for select
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Analysis jobs
-- ---------------------------------------------------------------------------
create table if not exists public.analysis_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  api_key_id uuid references public.api_keys (id) on delete set null,
  type text not null check (type in ('image', 'series')),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'failed')),
  locale text not null,
  image_count int not null check (image_count between 1 and 10),
  -- Per-image metadata (name, pixel size, orientation, ...). The images
  -- themselves are only held in memory while the analysis runs.
  files jsonb not null,
  credits int not null check (credits >= 0),
  report jsonb,
  -- { "code": "<AnalysisErrorCode>" }; the message is localized on read.
  error jsonb,
  idempotency_key text check (char_length(idempotency_key) between 1 and 255),
  -- SHA-256 of the uploaded files; detects a reused key with other content.
  request_hash text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  unique (user_id, idempotency_key)
);

create index if not exists analysis_jobs_user_created_idx
  on public.analysis_jobs (user_id, created_at desc, id desc);

alter table public.analysis_jobs enable row level security;

create policy "Users can view their own analysis jobs"
  on public.analysis_jobs for select
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Credits: append-only ledger, balance = sum(delta)
-- ---------------------------------------------------------------------------
create table if not exists public.credit_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  delta int not null,
  reason text not null check (reason in ('grant', 'reserve', 'refund', 'adjust')),
  analysis_id uuid references public.analysis_jobs (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists credit_ledger_user_idx on public.credit_ledger (user_id);

alter table public.credit_ledger enable row level security;

create policy "Users can view their own credit transactions"
  on public.credit_ledger for select
  using (auth.uid() = user_id);

-- Free beta credits for every account (1 credit = 1 analyzed image).
create or replace function public.grant_signup_credits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.credit_ledger (user_id, delta, reason) values (new.id, 20, 'grant');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_grant_credits on auth.users;
create trigger on_auth_user_created_grant_credits
  after insert on auth.users
  for each row execute function public.grant_signup_credits();

-- Accounts that existed before this migration get the same start balance.
insert into public.credit_ledger (user_id, delta, reason)
select u.id, 20, 'grant'
from auth.users u
where not exists (select 1 from public.credit_ledger l where l.user_id = u.id);

-- ---------------------------------------------------------------------------
-- Functions (service role only)
-- ---------------------------------------------------------------------------
create or replace function public.credit_balance(p_user uuid)
returns int
language sql
stable
set search_path = public
as $$
  select coalesce(sum(delta), 0)::int from public.credit_ledger where user_id = p_user;
$$;

/*
 * Creates a queued job and reserves its credits in one transaction. A per-user
 * advisory lock serializes concurrent requests, so two parallel uploads can't
 * both spend the last credits. Errors:
 *   P0402 insufficient_credits, P0429 too_many_active_analyses,
 *   23505 unique_violation when the idempotency key already exists.
 */
create or replace function public.create_analysis_job(
  p_user uuid,
  p_type text,
  p_locale text,
  p_files jsonb,
  p_credits int,
  p_api_key_id uuid,
  p_idempotency_key text,
  p_request_hash text,
  p_max_active int
)
returns public.analysis_jobs
language plpgsql
set search_path = public
as $$
declare
  v_job public.analysis_jobs;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 0));

  if (
    select count(*) from public.analysis_jobs
    where user_id = p_user and status in ('queued', 'running')
  ) >= p_max_active then
    raise exception 'too_many_active_analyses' using errcode = 'P0429';
  end if;

  if public.credit_balance(p_user) < p_credits then
    raise exception 'insufficient_credits' using errcode = 'P0402';
  end if;

  insert into public.analysis_jobs (
    user_id, api_key_id, type, locale, image_count, files, credits, idempotency_key, request_hash
  ) values (
    p_user, p_api_key_id, p_type, p_locale, jsonb_array_length(p_files), p_files, p_credits,
    p_idempotency_key, p_request_hash
  )
  returning * into v_job;

  if p_credits > 0 then
    insert into public.credit_ledger (user_id, delta, reason, analysis_id)
    values (p_user, -p_credits, 'reserve', v_job.id);
  end if;

  return v_job;
end;
$$;

/*
 * Marks a job as failed and refunds its credits. Only queued/running jobs
 * qualify, so a job can never be refunded twice. Returns false if the job was
 * already finished or deleted.
 */
create or replace function public.fail_analysis_job(p_job uuid, p_error jsonb)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  v_job public.analysis_jobs;
begin
  update public.analysis_jobs
  set status = 'failed', error = p_error, completed_at = now()
  where id = p_job and status in ('queued', 'running')
  returning * into v_job;

  if not found then
    return false;
  end if;

  if v_job.credits > 0 then
    insert into public.credit_ledger (user_id, delta, reason, analysis_id)
    values (v_job.user_id, v_job.credits, 'refund', v_job.id);
  end if;

  return true;
end;
$$;

/*
 * Jobs run inside the web server process. If it restarts mid-analysis, the
 * job would stay "running" forever - this fails (and refunds) such jobs once
 * they are clearly older than any real analysis takes.
 */
create or replace function public.fail_stale_analysis_jobs(p_user uuid)
returns int
language plpgsql
set search_path = public
as $$
declare
  v_id uuid;
  v_count int := 0;
begin
  for v_id in
    select id from public.analysis_jobs
    where user_id = p_user
      and (
        (status = 'running' and started_at < now() - interval '10 minutes')
        or (status = 'queued' and created_at < now() - interval '60 minutes')
      )
  loop
    if public.fail_analysis_job(v_id, jsonb_build_object('code', 'processing_interrupted')) then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

-- Supabase grants EXECUTE on new public functions to anon/authenticated by
-- default. These take a user id as a parameter and must never be callable
-- with the public anon key.
revoke execute on function public.credit_balance(uuid) from public, anon, authenticated;
revoke execute on function public.create_analysis_job(uuid, text, text, jsonb, int, uuid, text, text, int)
  from public, anon, authenticated;
revoke execute on function public.fail_analysis_job(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.fail_stale_analysis_jobs(uuid) from public, anon, authenticated;
revoke execute on function public.grant_signup_credits() from public, anon, authenticated;

grant execute on function public.credit_balance(uuid) to service_role;
grant execute on function public.create_analysis_job(uuid, text, text, jsonb, int, uuid, text, text, int)
  to service_role;
grant execute on function public.fail_analysis_job(uuid, jsonb) to service_role;
grant execute on function public.fail_stale_analysis_jobs(uuid) to service_role;
