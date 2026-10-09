import type { ApiErrorCode, ProblemDetails } from "@/lib/api/errors";
import type { AnalysisResource, UploadBatchResource, UsageResource } from "@/lib/api/resources";
import type { Messages } from "@/lib/i18n";

/*
 * Browser client of the public API v1, used by the AuraLens web UI itself.
 * Authenticates with the session cookie (same origin), so no API key is
 * involved. All failures surface as `ApiProblem` with a user-facing message.
 */

/** How often a running analysis is polled. */
const ANALYSIS_POLL_INTERVAL_MS = 2500;
/** Consecutive failed polls (network hiccups, restarts) before giving up. */
const MAX_POLL_FAILURES = 5;

/** A failed API call. `code` is the stable RFC 9457 code, or "network_error". */
export class ApiProblem extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode | "network_error",
    message: string
  ) {
    super(message);
    this.name = "ApiProblem";
  }
}

function isProblem(body: unknown): body is ProblemDetails {
  return typeof body === "object" && body !== null && "code" in body && typeof body.code === "string";
}

/**
 * The server already localizes `detail` (it reads the same locale cookie),
 * so it is preferred. The dictionary covers bodies without a usable detail,
 * e.g. an HTML error page from a proxy.
 */
async function toProblem(res: Response, t: Messages): Promise<ApiProblem> {
  const body: unknown = await res.json().catch(() => null);
  if (isProblem(body)) {
    const message = body.detail || t.apiErrors[body.code] || t.apiErrors.internal_error;
    return new ApiProblem(res.status, body.code, message);
  }
  return new ApiProblem(res.status, "internal_error", t.errors.unexpectedResponse(res.status, ""));
}

async function request<T>(url: string, t: Messages, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, credentials: "same-origin" });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiProblem(0, "network_error", t.errors.serverUnreachable);
  }
  if (!res.ok) throw await toProblem(res, t);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/**
 * Starts an analysis (1 image = single, 2-10 = series); resolves with the
 * queued job. The files go straight to storage through signed upload URLs
 * (POST /api/v1/uploads), so the host's request-size cap (Vercel: 4.5 MB)
 * doesn't apply; only their paths are sent to POST /api/v1/analyses.
 * Pass the same `idempotencyKey` when retrying the same selection, so a
 * request that did reach the server isn't started (and billed) twice.
 */
export async function startAnalysis(
  files: File[],
  t: Messages,
  options: { idempotencyKey: string; signal?: AbortSignal }
): Promise<AnalysisResource> {
  const { idempotencyKey, signal } = options;
  const batch = await request<UploadBatchResource>("/api/v1/uploads", t, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ files: files.map((file) => ({ name: file.name, type: file.type, size: file.size })) }),
    signal,
  });

  await Promise.all(batch.uploads.map((slot, i) => uploadFile(slot.uploadUrl, files[i], slot.index, t, signal)));

  return request<AnalysisResource>("/api/v1/analyses", t, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({ uploads: batch.uploads.map((slot) => ({ path: slot.path, name: slot.name })) }),
    signal,
  });
}

/** PUTs one file to its signed storage URL (cross-origin, no cookies). */
async function uploadFile(url: string, file: File, index: number, t: Messages, signal?: AbortSignal): Promise<void> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": file.type },
      credentials: "omit",
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiProblem(0, "network_error", t.errors.uploadFailed(index));
  }
  if (!res.ok) throw new ApiProblem(res.status, "internal_error", t.errors.uploadFailed(index));
}

function fetchAnalysis(id: string, t: Messages, signal?: AbortSignal): Promise<AnalysisResource> {
  return request<AnalysisResource>(`/api/v1/analyses/${encodeURIComponent(id)}`, t, { signal });
}

export function fetchUsage(t: Messages): Promise<UsageResource> {
  return request<UsageResource>("/api/v1/usage", t);
}

function isFinished(analysis: AnalysisResource): boolean {
  return analysis.status === "completed" || analysis.status === "failed";
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true }
    );
  });
}

/**
 * Polls until the analysis is completed or failed and resolves with the
 * final state; `onUpdate` sees every intermediate state (for progress).
 * Tolerates a few failed polls in a row - the job keeps running server-side
 * either way. Rejects with an AbortError when `signal` aborts.
 */
export async function pollAnalysis(
  id: string,
  t: Messages,
  options: { signal?: AbortSignal; intervalMs?: number; onUpdate?: (analysis: AnalysisResource) => void } = {}
): Promise<AnalysisResource> {
  const { signal, intervalMs = ANALYSIS_POLL_INTERVAL_MS, onUpdate } = options;
  let failures = 0;

  for (;;) {
    try {
      const analysis = await fetchAnalysis(id, t, signal);
      failures = 0;
      onUpdate?.(analysis);
      if (isFinished(analysis)) return analysis;
    } catch (error) {
      const retryable =
        error instanceof ApiProblem && (error.code === "network_error" || error.status === 429 || error.status >= 500);
      if (!retryable) throw error;
      failures += 1;
      if (failures >= MAX_POLL_FAILURES) {
        throw new ApiProblem(error.status, error.code, t.analysis.connectionLost);
      }
    }
    await wait(intervalMs, signal);
  }
}
