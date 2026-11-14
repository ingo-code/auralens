-- Cache reads are priced per model: 0.05x the input price on Claude Opus 5.5
-- and Sonnet 5.5, 0.1x on older models. Adds Claude Haiku 5.5.
-- Same columns as in 20261114120000_analysis_usage.sql.

create or replace view public.analysis_costs
with (security_invoker = true)
as
with prices (model_prefix, input_usd, output_usd, cache_read_factor) as (
  values
    ('claude-opus-5-5', 4.0, 20.0, 0.05),
    ('claude-opus-5', 5.0, 25.0, 0.1),
    ('claude-sonnet-5-5', 2.0, 10.0, 0.05),
    ('claude-haiku-5-5', 0.10, 0.50, 0.1),
    ('claude-haiku-4-5', 1.0, 5.0, 0.1)
),
parts as (
  select
    j.id as analysis_id,
    j.type,
    j.status,
    j.image_count,
    j.created_at,
    p ->> 'part' as part,
    p ->> 'model' as model,
    coalesce((p ->> 'inputTokens')::bigint, 0) as input_tokens,
    coalesce((p ->> 'outputTokens')::bigint, 0) as output_tokens,
    coalesce((p ->> 'cacheReadTokens')::bigint, 0) as cache_read_tokens,
    coalesce((p ->> 'cacheWriteTokens')::bigint, 0) as cache_write_tokens,
    coalesce((p ->> 'ms')::bigint, 0) as ms
  from public.analysis_jobs j
  cross join lateral jsonb_array_elements(j.usage -> 'parts') p
  where j.usage is not null
),
priced as (
  select
    parts.*,
    (
      parts.input_tokens * price.input_usd
      + parts.cache_read_tokens * price.input_usd * price.cache_read_factor
      + parts.cache_write_tokens * price.input_usd * 1.25
      + parts.output_tokens * price.output_usd
    ) / 1000000.0 as cost_usd
  from parts
  -- Longest prefix wins, so "claude-opus-5-5" is not priced as "claude-opus-5".
  left join lateral (
    select pr.input_usd, pr.output_usd, pr.cache_read_factor
    from prices pr
    where parts.model like pr.model_prefix || '%'
    order by length(pr.model_prefix) desc
    limit 1
  ) price on true
)
select
  analysis_id,
  type,
  status,
  image_count,
  created_at,
  string_agg(distinct model, ', ') as models,
  count(*) as parts,
  sum(input_tokens) as input_tokens,
  sum(output_tokens) as output_tokens,
  sum(cache_read_tokens) as cache_read_tokens,
  sum(cache_write_tokens) as cache_write_tokens,
  max(ms) as longest_part_ms,
  -- null as soon as one part has an unknown model
  case when bool_and(cost_usd is not null) then round(sum(cost_usd)::numeric, 4) end as cost_usd,
  case
    when bool_and(cost_usd is not null) then round((sum(cost_usd) / greatest(image_count, 1))::numeric, 4)
  end as cost_per_image_usd
from priced
group by analysis_id, type, status, image_count, created_at;

revoke all on public.analysis_costs from public, anon, authenticated;
grant select on public.analysis_costs to service_role;
