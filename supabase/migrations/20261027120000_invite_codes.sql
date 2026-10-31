-- Closed beta: registration only with a single-use invite code.
--
-- E-mail sign-ups send the code (and the beta upload notice consent) as user
-- metadata; the AFTER INSERT trigger on auth.users claims the code in the
-- same transaction as the user row, so a missing, unknown or already used
-- code rolls the whole sign-up back - also for requests that bypass the web
-- form and call Supabase Auth directly.
--
-- OAuth sign-ups (Google) can't carry metadata. They are inserted without a
-- code; /auth/callback claims the code the browser kept in a short-lived
-- cookie, and deletes the fresh account again if that fails. Until a code is
-- claimed such an account gets no credits.

create table if not exists public.invite_codes (
  code text primary key check (code = upper(code) and char_length(code) between 8 and 64),
  is_used boolean not null default false,
  -- One code per account. Kept "used" when the account is deleted later.
  used_by_user_id uuid unique references auth.users (id) on delete set null,
  used_at timestamptz,
  -- Free text for the operator, e.g. who the code was handed to.
  note text,
  created_at timestamptz not null default now(),
  check (is_used or (used_by_user_id is null and used_at is null))
);

alter table public.invite_codes enable row level security;
-- No policies: codes are read and claimed only through the service role and
-- the security-definer functions below.

/** Codes are case-insensitive and tolerate surrounding blanks. */
create or replace function public.normalize_invite_code(p_code text)
returns text
language sql
immutable
as $$
  select upper(btrim(coalesce(p_code, '')));
$$;

/*
 * Marks the code as used by p_user. The conditional UPDATE takes the row
 * lock, so of two concurrent claims exactly one succeeds. Returns false for
 * unknown or already used codes.
 */
create or replace function public.claim_invite_code(p_user uuid, p_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.invite_codes
  set is_used = true, used_by_user_id = p_user, used_at = now()
  where code = public.normalize_invite_code(p_code) and not is_used;
  return found;
end;
$$;

/** Available = exists and not yet used. Only a hint for the sign-up form; the claim decides. */
create or replace function public.invite_code_available(p_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.invite_codes where code = public.normalize_invite_code(p_code) and not is_used
  );
$$;

/*
 * Beta access: a claimed invite code, or an account from before the invite
 * system (recognisable by its credit grant).
 */
create or replace function public.has_beta_access(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.invite_codes where used_by_user_id = p_user)
      or exists (select 1 from public.credit_ledger where user_id = p_user and reason = 'grant');
$$;

/*
 * 20 beta credits once the account is confirmed, invited and not on a
 * disposable domain. At most one grant per account however often it runs.
 */
create or replace function public.grant_beta_credits_if_eligible(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user auth.users;
begin
  select * into v_user from auth.users where id = p_user;
  if not found or v_user.email_confirmed_at is null then
    return;
  end if;
  if v_user.email is not null and public.is_blocked_email(v_user.email) then
    return;
  end if;
  if not exists (select 1 from public.invite_codes where used_by_user_id = p_user) then
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 0));
  if not exists (select 1 from public.credit_ledger where user_id = p_user and reason = 'grant') then
    insert into public.credit_ledger (user_id, delta, reason) values (p_user, 20, 'grant');
  end if;
end;
$$;

/*
 * New auth user. E-mail sign-ups must carry the upload-notice consent and a
 * valid invite code; otherwise the sign-up fails (Supabase Auth answers
 * "Database error saving new user", the form explains the reason up front).
 * Users without a provider entry are treated like e-mail sign-ups, so an
 * unknown path fails closed.
 */
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.raw_app_meta_data ->> 'provider', 'email') = 'email' then
    if coalesce(new.raw_user_meta_data ->> 'beta_notice_accepted_at', '') = '' then
      raise exception 'beta_notice_required' using errcode = 'P0400';
    end if;
    if not public.claim_invite_code(new.id, new.raw_user_meta_data ->> 'invite_code') then
      raise exception 'invalid_invite_code' using errcode = 'P0400';
    end if;
  end if;

  perform public.grant_beta_credits_if_eligible(new.id);
  return new;
end;
$$;

/** OAuth sign-ups (see /auth/callback): claim the code, then grant the credits. */
create or replace function public.redeem_invite_code(p_user uuid, p_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.claim_invite_code(p_user, p_code) then
    return false;
  end if;
  perform public.grant_beta_credits_if_eligible(p_user);
  return true;
end;
$$;

create or replace function public.handle_auth_user_confirmed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.grant_beta_credits_if_eligible(new.id);
  return new;
end;
$$;

-- Replace the credit triggers of 20261026120000_abuse_protection.sql.
drop trigger if exists on_auth_user_created_grant_credits on auth.users;
drop trigger if exists on_auth_user_confirmed_grant_credits on auth.users;
drop function if exists public.grant_signup_credits();

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

create trigger on_auth_user_confirmed
  after update of email_confirmed_at on auth.users
  for each row
  when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function public.handle_auth_user_confirmed();

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------
revoke execute on function public.normalize_invite_code(text) from public, anon, authenticated;
revoke execute on function public.claim_invite_code(uuid, text) from public, anon, authenticated;
revoke execute on function public.invite_code_available(text) from public, anon, authenticated;
revoke execute on function public.has_beta_access(uuid) from public, anon, authenticated;
revoke execute on function public.grant_beta_credits_if_eligible(uuid) from public, anon, authenticated;
revoke execute on function public.handle_new_auth_user() from public, anon, authenticated;
revoke execute on function public.handle_auth_user_confirmed() from public, anon, authenticated;
revoke execute on function public.redeem_invite_code(uuid, text) from public, anon, authenticated;

grant execute on function public.normalize_invite_code(text) to service_role;
grant execute on function public.claim_invite_code(uuid, text) to service_role;
grant execute on function public.invite_code_available(text) to service_role;
grant execute on function public.has_beta_access(uuid) to service_role;
grant execute on function public.grant_beta_credits_if_eligible(uuid) to service_role;
grant execute on function public.redeem_invite_code(uuid, text) to service_role;
