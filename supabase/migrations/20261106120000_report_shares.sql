-- Shareable review reports: the owner can create a read-only link to one
-- completed analysis (report text only - images are never stored). The
-- random token is the only credential, so it is long (32 bytes, base64url)
-- and can be revoked at any time by setting it back to null.

alter table public.analysis_jobs
  add column if not exists share_token text unique
    check (share_token is null or share_token ~ '^[A-Za-z0-9_-]{43}$'),
  add column if not exists shared_at timestamptz;

-- Sharing and revoking are recorded in the audit log.
alter table public.audit_log drop constraint if exists audit_log_event_check;
alter table public.audit_log
  add constraint audit_log_event_check
  check (event in ('api_key.created', 'api_key.revoked', 'account.exported', 'analysis.shared', 'analysis.unshared'));
