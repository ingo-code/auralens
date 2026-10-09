-- Transit storage for analysis images. Serverless hosts cap request bodies
-- (Vercel: 4.5 MB), so clients upload originals straight to this bucket via
-- signed upload URLs (POST /api/v1/uploads) and only send the object paths
-- to POST /api/v1/analyses. The server reads each object once and deletes
-- it immediately; abandoned uploads are purged after an hour.
--
-- Private and without RLS policies: uploads go through single-use signed
-- URLs, reads and deletes through the service role only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'analysis-uploads',
  'analysis-uploads',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
