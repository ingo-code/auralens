-- Live progress for analysis jobs: a series runs three Claude requests in
-- parallel (consistency, market, prompts); each one is recorded here as it
-- finishes, so clients can show real progress instead of a guessed timer.

alter table public.analysis_jobs
  add column if not exists completed_steps text[] not null default '{}';

/*
 * Appends a finished step. The row lock of the UPDATE serializes the parallel
 * parts; the guard keeps the list free of duplicates and ignores jobs that
 * are no longer running (deleted, failed as stale, already completed).
 */
create or replace function public.complete_analysis_step(p_job uuid, p_step text)
returns void
language sql
set search_path = public
as $$
  update public.analysis_jobs
  set completed_steps = array_append(completed_steps, p_step)
  where id = p_job
    and status = 'running'
    and not (p_step = any (completed_steps));
$$;

revoke execute on function public.complete_analysis_step(uuid, text) from public, anon, authenticated;
grant execute on function public.complete_analysis_step(uuid, text) to service_role;
