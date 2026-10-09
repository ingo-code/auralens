-- Shared fixed-window rate limiter for the public API. The in-memory limiter
-- in lib/rate-limit.ts only sees one process; on serverless platforms
-- (Vercel) every instance has its own memory, so limits must live here.

create table if not exists public.rate_limits (
  key text primary key,
  count int not null,
  reset_at timestamptz not null
);

alter table public.rate_limits enable row level security;
-- No policies: only the service role (which bypasses RLS) touches this table.

create index if not exists rate_limits_reset_at_idx on public.rate_limits (reset_at);

-- Counts one hit against `p_key` and reports whether it is within the limit.
-- A single upsert keeps it atomic under concurrent requests.
create or replace function public.hit_rate_limit(p_key text, p_limit int, p_window_ms int)
returns table (success boolean, remaining int, reset_at timestamptz)
language plpgsql
set search_path = public
as $$
declare
  v_count int;
  v_reset timestamptz;
begin
  insert into public.rate_limits as r (key, count, reset_at)
  values (p_key, 1, now() + make_interval(secs => p_window_ms / 1000.0))
  on conflict (key) do update
    set count = case when r.reset_at <= now() then 1 else r.count + 1 end,
        reset_at = case when r.reset_at <= now() then excluded.reset_at else r.reset_at end
  returning r.count, r.reset_at into v_count, v_reset;

  -- Opportunistic cleanup of expired windows (~1 % of calls).
  if random() < 0.01 then
    delete from public.rate_limits where rate_limits.reset_at < now() - interval '1 hour';
  end if;

  return query select v_count <= p_limit, greatest(p_limit - v_count, 0), v_reset;
end;
$$;

revoke execute on function public.hit_rate_limit(text, int, int) from public, anon, authenticated;
grant execute on function public.hit_rate_limit(text, int, int) to service_role;
