-- Abuse and cost protection:
--   1. Beta credits only for confirmed e-mail addresses, never for
--      disposable domains (signups with those are rejected outright).
--   2. Global daily image budget across all accounts (cost guardrail
--      against credit farming with many accounts).
--   3. Stale jobs are failed and refunded every 5 minutes for all users
--      (pg_cron), not only when their owner happens to read the list.
--   4. Audit log for security-relevant account events.

-- ---------------------------------------------------------------------------
-- 1. Disposable e-mail domains
-- ---------------------------------------------------------------------------
-- Keep in sync with lib/disposable-email.ts (a test compares both lists).
create table if not exists public.blocked_email_domains (
  domain text primary key check (domain = lower(domain))
);

alter table public.blocked_email_domains enable row level security;
-- No policies: only the service role and security-definer functions read it.

insert into public.blocked_email_domains (domain) values
  ('0-mail.com'), ('10minutemail.com'), ('10minutemail.net'), ('20minutemail.com'),
  ('33mail.com'), ('anonbox.net'), ('burnermail.io'), ('byom.de'),
  ('discard.email'), ('dispostable.com'), ('dropmail.me'), ('einrot.com'),
  ('emailondeck.com'), ('fakeinbox.com'), ('fakemail.net'), ('getairmail.com'),
  ('getnada.com'), ('guerrillamail.biz'), ('guerrillamail.com'), ('guerrillamail.de'),
  ('guerrillamail.info'), ('guerrillamail.net'), ('guerrillamail.org'), ('guerrillamailblock.com'),
  ('harakirimail.com'), ('inboxbear.com'), ('incognitomail.org'), ('jetable.org'),
  ('mail-temp.com'), ('mailcatch.com'), ('maildrop.cc'), ('mailinator.com'),
  ('mailinator.net'), ('mailnesia.com'), ('mailpoof.com'), ('mintemail.com'),
  ('mohmal.com'), ('mytemp.email'), ('mytrashmail.com'), ('nada.email'),
  ('sharklasers.com'), ('spam4.me'), ('spambog.com'), ('spambox.us'),
  ('spamgourmet.com'), ('spoofmail.de'), ('temp-mail.io'), ('temp-mail.org'),
  ('tempail.com'), ('tempinbox.com'), ('tempmail.com'), ('tempmail.dev'),
  ('tempmail.net'), ('tempmail.plus'), ('tempmailo.com'), ('tempr.email'),
  ('throwawaymail.com'), ('trash-mail.com'), ('trashmail.com'), ('trashmail.de'),
  ('trashmail.net'), ('wegwerfmail.de'), ('wegwerfmail.net'), ('wegwerfmail.org'),
  ('yopmail.com'), ('yopmail.fr'), ('yopmail.net'), ('zetmail.com')
on conflict (domain) do nothing;

/** True for addresses at a blocked domain or one of its subdomains. */
create or replace function public.is_blocked_email(p_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.blocked_email_domains b
    where lower(split_part(p_email, '@', 2)) = b.domain
       or lower(split_part(p_email, '@', 2)) like '%.' || b.domain
  );
$$;

-- Rejects signups with disposable addresses before the user row exists.
-- Supabase Auth answers such a signup with "Database error saving new user";
-- the login page checks the same list first and shows a proper message.
create or replace function public.reject_blocked_email_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is not null and public.is_blocked_email(new.email) then
    raise exception 'blocked_email_domain' using errcode = 'P0403';
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_reject_blocked_email on auth.users;
create trigger on_auth_user_reject_blocked_email
  before insert on auth.users
  for each row execute function public.reject_blocked_email_signup();

-- ---------------------------------------------------------------------------
-- Beta credits only after e-mail confirmation
-- ---------------------------------------------------------------------------
-- Before: 20 credits on every insert into auth.users, so unconfirmed bot
-- accounts could spend them. Now the grant waits for `email_confirmed_at`
-- (set at insert for Google sign-ins and when confirmations are disabled,
-- otherwise when the confirmation link is clicked). At most one grant per
-- account, however often the trigger fires.
create or replace function public.grant_signup_credits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email_confirmed_at is null then
    return new;
  end if;
  if new.email is not null and public.is_blocked_email(new.email) then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.id::text, 0));
  if not exists (select 1 from public.credit_ledger where user_id = new.id and reason = 'grant') then
    insert into public.credit_ledger (user_id, delta, reason) values (new.id, 20, 'grant');
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_grant_credits on auth.users;
create trigger on_auth_user_created_grant_credits
  after insert on auth.users
  for each row execute function public.grant_signup_credits();

drop trigger if exists on_auth_user_confirmed_grant_credits on auth.users;
create trigger on_auth_user_confirmed_grant_credits
  after update of email_confirmed_at on auth.users
  for each row
  when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function public.grant_signup_credits();

-- ---------------------------------------------------------------------------
-- 2. Global daily image budget
-- ---------------------------------------------------------------------------
-- Counts every image of every started analysis per calendar day (Berlin
-- time). Refunds don't lower it: a failed analysis may still have cost
-- Claude tokens, and the budget is a cost guardrail, not a billing record.
-- No foreign keys, so deleting accounts or analyses can't reset it.
create table if not exists public.daily_usage (
  day date primary key,
  images int not null default 0
);

alter table public.daily_usage enable row level security;

drop function if exists public.create_analysis_job(uuid, text, text, jsonb, int, uuid, text, text, int);

/*
 * Creates a queued job and reserves its credits in one transaction. A per-user
 * advisory lock serializes concurrent requests, so two parallel uploads can't
 * both spend the last credits; the daily_usage row lock serializes the
 * global budget. Errors:
 *   P0402 insufficient_credits, P0429 too_many_active_analyses,
 *   P0503 daily_budget_exhausted, 23505 unique_violation (idempotency key).
 * p_daily_image_budget null = no global limit.
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
  p_max_active int,
  p_daily_image_budget int
)
returns public.analysis_jobs
language plpgsql
set search_path = public
as $$
declare
  v_job public.analysis_jobs;
  v_images int := jsonb_array_length(p_files);
  v_day date := (now() at time zone 'Europe/Berlin')::date;
  v_used int;
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

  insert into public.daily_usage as d (day, images) values (v_day, v_images)
  on conflict (day) do update set images = d.images + excluded.images
  returning d.images into v_used;

  if p_daily_image_budget is not null and v_used > p_daily_image_budget then
    -- Rolls back the counter increment together with everything else.
    raise exception 'daily_budget_exhausted' using errcode = 'P0503';
  end if;

  insert into public.analysis_jobs (
    user_id, api_key_id, type, locale, image_count, files, credits, idempotency_key, request_hash
  ) values (
    p_user, p_api_key_id, p_type, p_locale, v_images, p_files, p_credits,
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

-- ---------------------------------------------------------------------------
-- 3. Stale jobs: tighter thresholds and a global sweep
-- ---------------------------------------------------------------------------
-- A job runs inside one server request (`after()`, maxDuration 300 s on
-- Vercel). Running longer than 7 minutes means the function was killed;
-- queued longer than 15 minutes means it never got a slot.
create or replace function public.fail_stale_analysis_jobs_where(p_user uuid)
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
    where (p_user is null or user_id = p_user)
      and (
        (status = 'running' and started_at < now() - interval '7 minutes')
        or (status = 'queued' and created_at < now() - interval '15 minutes')
      )
  loop
    if public.fail_analysis_job(v_id, jsonb_build_object('code', 'processing_interrupted')) then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

create or replace function public.fail_stale_analysis_jobs(p_user uuid)
returns int
language sql
set search_path = public
as $$
  select public.fail_stale_analysis_jobs_where(p_user);
$$;

/** All users at once; scheduled below. */
create or replace function public.fail_all_stale_analysis_jobs()
returns int
language sql
set search_path = public
as $$
  select public.fail_stale_analysis_jobs_where(null);
$$;

create extension if not exists pg_cron with schema pg_catalog;

do $$
begin
  perform cron.unschedule(jobid) from cron.job
  where jobname in ('auralens-fail-stale-jobs', 'auralens-cleanup-rate-limits');

  perform cron.schedule('auralens-fail-stale-jobs', '*/5 * * * *', 'select public.fail_all_stale_analysis_jobs()');
  perform cron.schedule(
    'auralens-cleanup-rate-limits',
    '17 * * * *',
    $cron$delete from public.rate_limits where reset_at < now() - interval '1 hour'$cron$
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Audit log
-- ---------------------------------------------------------------------------
-- Security-relevant account events (API keys, data export). Sign-ins and
-- password changes are already logged by Supabase Auth (auth.audit_log_entries).
-- No IP addresses: the request id links an entry to the server log.
create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  event text not null check (event in ('api_key.created', 'api_key.revoked', 'account.exported')),
  details jsonb not null default '{}',
  api_key_id uuid,
  request_id text,
  created_at timestamptz not null default now()
);

create index if not exists audit_log_user_idx on public.audit_log (user_id, created_at desc);

alter table public.audit_log enable row level security;

create policy "Users can view their own audit log"
  on public.audit_log for select
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------
revoke execute on function public.is_blocked_email(text) from public, anon, authenticated;
revoke execute on function public.reject_blocked_email_signup() from public, anon, authenticated;
revoke execute on function public.grant_signup_credits() from public, anon, authenticated;
revoke execute on function public.create_analysis_job(uuid, text, text, jsonb, int, uuid, text, text, int, int)
  from public, anon, authenticated;
revoke execute on function public.fail_stale_analysis_jobs_where(uuid) from public, anon, authenticated;
revoke execute on function public.fail_stale_analysis_jobs(uuid) from public, anon, authenticated;
revoke execute on function public.fail_all_stale_analysis_jobs() from public, anon, authenticated;

grant execute on function public.is_blocked_email(text) to service_role;
grant execute on function public.create_analysis_job(uuid, text, text, jsonb, int, uuid, text, text, int, int)
  to service_role;
grant execute on function public.fail_stale_analysis_jobs(uuid) to service_role;
grant execute on function public.fail_all_stale_analysis_jobs() to service_role;
