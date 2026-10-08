import type { PostgrestError } from "@supabase/supabase-js";
import type { StyleAnalysis } from "@/lib/analysis-schema";
import type { AnalysisStep } from "@/lib/analysis-steps";
import type { AnalysisErrorCode } from "@/lib/claude/errors";
import type { SeriesAnalysis, SeriesImageFile } from "@/lib/series-analysis-schema";
import { getAdminClient } from "@/lib/supabase/admin";

/*
 * Data access of the public API. Runs with the service-role client, which
 * bypasses RLS - so every function takes the user id and filters by it.
 * Never add a query here that isn't scoped to one user.
 */

export type AnalysisType = "image" | "series";
export type AnalysisStatus = "queued" | "running" | "completed" | "failed";

export type AnalysisJobRow = {
  id: string;
  user_id: string;
  api_key_id: string | null;
  type: AnalysisType;
  status: AnalysisStatus;
  locale: string;
  image_count: number;
  files: SeriesImageFile[];
  credits: number;
  report: StyleAnalysis | SeriesAnalysis | null;
  error: { code: AnalysisErrorCode } | null;
  completed_steps: AnalysisStep[];
  idempotency_key: string | null;
  request_hash: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
};

export type ApiKeyRow = {
  id: string;
  user_id: string;
  name: string;
  prefix: string;
  scopes: string[];
  created_at: string;
  last_used_at: string | null;
};

const API_KEY_COLUMNS = "id, user_id, name, prefix, scopes, created_at, last_used_at";

function fail(operation: string, error: PostgrestError): never {
  throw new Error(`[api-repository] ${operation}: ${error.code} ${error.message}`);
}

// ---------------------------------------------------------------------------
// API keys
// ---------------------------------------------------------------------------

/** Resolves an active key by its hash and records the use. */
export async function findActiveApiKeyByHash(hash: string): Promise<ApiKeyRow | null> {
  const db = getAdminClient();
  const { data, error } = await db
    .from("api_keys")
    .select(API_KEY_COLUMNS)
    .eq("key_hash", hash)
    .is("revoked_at", null)
    .maybeSingle<ApiKeyRow>();
  if (error) fail("findActiveApiKeyByHash", error);
  if (!data) return null;

  // Best effort - a failed timestamp update must not fail the request.
  const { error: touchError } = await db
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id);
  if (touchError) console.error("[api-repository] last_used_at:", touchError.message);

  return data;
}

export async function listApiKeys(userId: string): Promise<ApiKeyRow[]> {
  const { data, error } = await getAdminClient()
    .from("api_keys")
    .select(API_KEY_COLUMNS)
    .eq("user_id", userId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .returns<ApiKeyRow[]>();
  if (error) fail("listApiKeys", error);
  return data ?? [];
}

export async function insertApiKey(input: {
  userId: string;
  name: string;
  prefix: string;
  hash: string;
  scopes: string[];
}): Promise<ApiKeyRow> {
  const { data, error } = await getAdminClient()
    .from("api_keys")
    .insert({
      user_id: input.userId,
      name: input.name,
      prefix: input.prefix,
      key_hash: input.hash,
      scopes: input.scopes,
    })
    .select(API_KEY_COLUMNS)
    .single<ApiKeyRow>();
  if (error) fail("insertApiKey", error);
  return data;
}

/** Returns false if the key doesn't exist, belongs to someone else or is already revoked. */
export async function revokeApiKey(userId: string, id: string): Promise<boolean> {
  const { data, error } = await getAdminClient()
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId)
    .is("revoked_at", null)
    .select("id");
  if (error) fail("revokeApiKey", error);
  return (data ?? []).length > 0;
}

// ---------------------------------------------------------------------------
// Analysis jobs
// ---------------------------------------------------------------------------

export type JobCreationFailure = "insufficient_credits" | "too_many_active" | "duplicate_idempotency_key";

export class JobCreationError extends Error {
  constructor(readonly reason: JobCreationFailure) {
    super(reason);
    this.name = "JobCreationError";
  }
}

/**
 * Inserts a queued job and reserves its credits atomically (SQL function
 * `create_analysis_job`). Throws `JobCreationError` for expected refusals.
 */
export async function createAnalysisJob(input: {
  userId: string;
  apiKeyId: string | null;
  type: AnalysisType;
  locale: string;
  files: SeriesImageFile[];
  credits: number;
  idempotencyKey: string | null;
  requestHash: string;
  maxActive: number;
}): Promise<AnalysisJobRow> {
  const { data, error } = await getAdminClient()
    .rpc("create_analysis_job", {
      p_user: input.userId,
      p_type: input.type,
      p_locale: input.locale,
      p_files: input.files,
      p_credits: input.credits,
      p_api_key_id: input.apiKeyId,
      p_idempotency_key: input.idempotencyKey,
      p_request_hash: input.requestHash,
      p_max_active: input.maxActive,
    })
    .single<AnalysisJobRow>();

  if (error) {
    if (error.code === "P0402") throw new JobCreationError("insufficient_credits");
    if (error.code === "P0429") throw new JobCreationError("too_many_active");
    if (error.code === "23505") throw new JobCreationError("duplicate_idempotency_key");
    fail("createAnalysisJob", error);
  }
  return data;
}

export async function findJobByIdempotencyKey(userId: string, key: string): Promise<AnalysisJobRow | null> {
  const { data, error } = await getAdminClient()
    .from("analysis_jobs")
    .select("*")
    .eq("user_id", userId)
    .eq("idempotency_key", key)
    .maybeSingle<AnalysisJobRow>();
  if (error) fail("findJobByIdempotencyKey", error);
  return data;
}

export async function getJob(userId: string, id: string): Promise<AnalysisJobRow | null> {
  const { data, error } = await getAdminClient()
    .from("analysis_jobs")
    .select("*")
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle<AnalysisJobRow>();
  if (error) fail("getJob", error);
  return data;
}

/** List rows leave out the (large) report; fetch a single job for it. */
const LIST_COLUMNS =
  "id, user_id, api_key_id, type, status, locale, image_count, files, credits, error, completed_steps, " +
  "idempotency_key, request_hash, created_at, started_at, completed_at";

export type JobListCursor = { createdAt: string; id: string };

export async function listJobs(
  userId: string,
  options: { limit: number; cursor?: JobListCursor; status?: AnalysisStatus; type?: AnalysisType }
): Promise<{ rows: Omit<AnalysisJobRow, "report">[]; hasMore: boolean }> {
  let query = getAdminClient()
    .from("analysis_jobs")
    .select(LIST_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(options.limit + 1);

  if (options.status) query = query.eq("status", options.status);
  if (options.type) query = query.eq("type", options.type);
  if (options.cursor) {
    // Keyset pagination: strictly "older than" the last row of the previous
    // page. Values are quoted because timestamps contain ':' and '+'.
    const { createdAt, id } = options.cursor;
    query = query.or(`created_at.lt."${createdAt}",and(created_at.eq."${createdAt}",id.lt.${id})`);
  }

  const { data, error } = await query.returns<Omit<AnalysisJobRow, "report">[]>();
  if (error) fail("listJobs", error);
  const rows = data ?? [];
  return { rows: rows.slice(0, options.limit), hasMore: rows.length > options.limit };
}

export async function deleteJob(userId: string, id: string): Promise<boolean> {
  const { data, error } = await getAdminClient()
    .from("analysis_jobs")
    .delete()
    .eq("user_id", userId)
    .eq("id", id)
    .select("id");
  if (error) fail("deleteJob", error);
  return (data ?? []).length > 0;
}

/** queued -> running. False if the job was deleted (or already picked up) meanwhile. */
export async function markJobRunning(id: string): Promise<boolean> {
  const { data, error } = await getAdminClient()
    .from("analysis_jobs")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "queued")
    .select("id");
  if (error) fail("markJobRunning", error);
  return (data ?? []).length > 0;
}

/** running -> completed. False if the job was deleted or failed as stale meanwhile. */
export async function completeJob(id: string, report: StyleAnalysis | SeriesAnalysis): Promise<boolean> {
  const { data, error } = await getAdminClient()
    .from("analysis_jobs")
    .update({ status: "completed", report, completed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "running")
    .select("id");
  if (error) fail("completeJob", error);
  return (data ?? []).length > 0;
}

/** Records a finished processing step of a running job (live progress). */
export async function completeStep(id: string, step: AnalysisStep): Promise<void> {
  const { error } = await getAdminClient().rpc("complete_analysis_step", { p_job: id, p_step: step });
  if (error) fail("completeStep", error);
}

/** -> failed, with credit refund (SQL function `fail_analysis_job`, refunds at most once). */
export async function failJob(id: string, code: AnalysisErrorCode): Promise<boolean> {
  const { data, error } = await getAdminClient().rpc("fail_analysis_job", { p_job: id, p_error: { code } });
  if (error) fail("failJob", error);
  return data === true;
}

/** Fails and refunds this user's jobs orphaned by a server restart. */
export async function failStaleJobs(userId: string): Promise<number> {
  const { data, error } = await getAdminClient().rpc("fail_stale_analysis_jobs", { p_user: userId });
  if (error) fail("failStaleJobs", error);
  return Number(data ?? 0);
}

// ---------------------------------------------------------------------------
// Credits
// ---------------------------------------------------------------------------

export async function getCreditBalance(userId: string): Promise<number> {
  const { data, error } = await getAdminClient().rpc("credit_balance", { p_user: userId });
  if (error) fail("getCreditBalance", error);
  return Number(data ?? 0);
}
