-- Stores saved AuraLens style reports per authenticated user.
create table if not exists public.analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  image_path text not null,
  report jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists analyses_user_id_created_at_idx
  on public.analyses (user_id, created_at desc);

alter table public.analyses enable row level security;

create policy "Users can view their own analyses"
  on public.analyses for select
  using (auth.uid() = user_id);

create policy "Users can insert their own analyses"
  on public.analyses for insert
  with check (auth.uid() = user_id);

create policy "Users can delete their own analyses"
  on public.analyses for delete
  using (auth.uid() = user_id);

-- Private bucket for the source images behind saved analyses. Objects are
-- stored under `${user_id}/...` so storage.foldername(name) can scope
-- access to the owner without a service-role key.
insert into storage.buckets (id, name, public)
values ('analysis-images', 'analysis-images', false)
on conflict (id) do nothing;

create policy "Users can upload their own analysis images"
  on storage.objects for insert
  with check (
    bucket_id = 'analysis-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can view their own analysis images"
  on storage.objects for select
  using (
    bucket_id = 'analysis-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can delete their own analysis images"
  on storage.objects for delete
  using (
    bucket_id = 'analysis-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
