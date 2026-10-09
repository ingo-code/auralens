import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate, type Principal } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { apiRoute, enforceRateLimit, methodNotAllowed, readJsonBody, type ApiContext } from "@/lib/api/handler";
import { enqueueAnalysis } from "@/lib/api/jobs";
import { API_LIMITS, API_RATE_LIMITS } from "@/lib/api/limits";
import { decodeCursor, encodeCursor } from "@/lib/api/pagination";
import {
  createAnalysisJob,
  failStaleJobs,
  findJobByIdempotencyKey,
  getCreditBalance,
  JobCreationError,
  listJobs,
  type AnalysisJobRow,
} from "@/lib/api/repository";
import { toAnalysisResource, type AnalysisResource, type ListResource } from "@/lib/api/resources";
import { downloadUploads, isOwnUploadPath, removeUploads, UploadNotFoundError } from "@/lib/api/uploads";
import { compressImageForAnalysis, type ProcessedImage } from "@/lib/image-processing";
import { validateImageFile } from "@/lib/image-validation";
import { describeValidationError } from "@/lib/series-api";
import { describeImageFile } from "@/lib/series-organize";

export const runtime = "nodejs";
// The analysis itself runs after the response (see lib/api/jobs.ts); on
// serverless platforms `after` work is bounded by this duration.
export const maxDuration = 300;

const MAX_TOTAL_SIZE = API_LIMITS.maxTotalUploadBytes;
// Must stay below `proxyClientMaxBodySize` in next.config.ts.
const MAX_BODY_SIZE = MAX_TOTAL_SIZE + 1024 * 1024;

const MAX_IDEMPOTENCY_KEY_LENGTH = 255;

/**
 * Starts an analysis. 1 image = single-image analysis, 2-10 = series.
 * Answers 202 immediately; poll `GET /api/v1/analyses/{id}` for the result.
 */
export const POST = apiRoute(async (ctx) => {
  const { t } = ctx;
  const principal = await authenticate(ctx, { scope: "analyses:write" });
  await enforceRateLimit(ctx, `v1:create:${principal.userId}`, API_RATE_LIMITS.createAnalysis);

  const idempotencyKey = readIdempotencyKey(ctx);

  const { entries, uploadPaths } = await readImageEntries(ctx, principal.userId);
  if (entries.length === 0) throw new ApiError(400, "invalid_request", t.errors.apiNoImages);
  if (entries.length > API_LIMITS.maxImagesPerAnalysis) {
    throw new ApiError(400, "invalid_request", t.errors.seriesTooMany(API_LIMITS.maxImagesPerAnalysis));
  }

  const files: File[] = [];
  for (const [i, entry] of entries.entries()) {
    const label = t.common.image(i + 1);
    if (!(entry instanceof File)) throw new ApiError(400, "invalid_request", `${label}: ${t.errors.notAFile}`);
    const invalid = validateImageFile(entry, t, label);
    if (invalid) {
      throw new ApiError(invalid.status, invalid.status === 413 ? "payload_too_large" : "invalid_request", invalid.message);
    }
    files.push(entry);
  }
  if (files.reduce((sum, file) => sum + file.size, 0) > MAX_TOTAL_SIZE) {
    throw new ApiError(413, "payload_too_large", t.errors.seriesTotalTooLarge);
  }

  const buffers = await Promise.all(files.map(async (file) => Buffer.from(await file.arrayBuffer())));
  // The images are in memory now; the transit copies must not outlive the request.
  await removeUploads(uploadPaths);
  const requestHash = hashUpload(buffers);

  // A retried request must not start (and bill) a second analysis.
  if (idempotencyKey) {
    const existing = await findJobByIdempotencyKey(principal.userId, idempotencyKey);
    if (existing) return replay(ctx, existing, requestHash);
  }

  const processed = await processImages(ctx, buffers);
  const fileInfo = processed.map((image, i) =>
    describeImageFile(i + 1, files[i].name, image.originalWidth, image.originalHeight)
  );
  const credits = processed.length * API_LIMITS.creditsPerImage;

  let job: AnalysisJobRow;
  try {
    job = await createAnalysisJob({
      userId: principal.userId,
      apiKeyId: principal.apiKeyId,
      type: processed.length === 1 ? "image" : "series",
      locale: ctx.locale,
      files: fileInfo,
      credits,
      idempotencyKey,
      requestHash,
      maxActive: API_LIMITS.maxActiveAnalyses,
    });
  } catch (error) {
    if (!(error instanceof JobCreationError)) throw error;
    return handleCreationRefusal(ctx, principal, error, credits, idempotencyKey, requestHash);
  }

  enqueueAnalysis({ id: job.id, type: job.type, locale: job.locale }, processed);

  return NextResponse.json<AnalysisResource>(toAnalysisResource(job, t), {
    status: 202,
    headers: { Location: `/api/v1/analyses/${job.id}` },
  });
});

const UploadsBodySchema = z.object({
  uploads: z
    .array(
      z.union([
        z.string(),
        z.object({ path: z.string(), name: z.string().trim().min(1).max(255).optional() }),
      ])
    )
    .min(1)
    .max(API_LIMITS.maxImagesPerAnalysis),
});

/**
 * Reads the images of a new analysis, either as JSON `{ "uploads": [...] }`
 * referencing objects from POST /api/v1/uploads (no size cap of the host),
 * or as multipart/form-data with the files in `images` (capped by the host,
 * on Vercel 4.5 MB per request).
 */
async function readImageEntries(
  ctx: ApiContext,
  userId: string
): Promise<{ entries: FormDataEntryValue[]; uploadPaths: string[] }> {
  const { t } = ctx;
  if ((ctx.request.headers.get("content-type") ?? "").includes("application/json")) {
    const parsed = UploadsBodySchema.safeParse(await readJsonBody(ctx, 64 * 1024));
    if (!parsed.success) throw new ApiError(400, "invalid_request", describeValidationError(parsed.error, t));

    const uploads = parsed.data.uploads.map((upload, i) => {
      const { path, name } = typeof upload === "string" ? { path: upload, name: undefined } : upload;
      if (!isOwnUploadPath(userId, path)) throw new ApiError(400, "invalid_request", t.errors.apiUploadForeign(i + 1));
      return { path, name: name ?? path.split("/")[2].replace(/^\d+-/, "") };
    });
    try {
      const downloaded = await downloadUploads(uploads);
      return { entries: downloaded.map((upload) => upload.file), uploadPaths: uploads.map((upload) => upload.path) };
    } catch (error) {
      if (!(error instanceof UploadNotFoundError)) throw error;
      const index = uploads.findIndex((upload) => upload.path === error.path);
      throw new ApiError(400, "invalid_request", t.errors.apiUploadNotFound(index + 1));
    }
  }

  if (Number(ctx.request.headers.get("content-length")) > MAX_BODY_SIZE) {
    throw new ApiError(413, "payload_too_large", t.errors.seriesTotalTooLarge);
  }
  try {
    const formData = await ctx.request.formData();
    return { entries: formData.getAll("images"), uploadPaths: [] };
  } catch {
    throw new ApiError(400, "invalid_request", t.errors.apiExpectedImages);
  }
}

const ListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
  status: z.enum(["queued", "running", "completed", "failed"]).optional(),
  type: z.enum(["image", "series"]).optional(),
});

/** Lists analyses, newest first, without reports. Cursor-paginated. */
export const GET = apiRoute(async (ctx) => {
  const principal = await authenticate(ctx, { scope: "analyses:read" });
  await enforceRateLimit(ctx, `v1:read:${principal.userId}`, API_RATE_LIMITS.read);

  const query = ListQuerySchema.safeParse(Object.fromEntries(ctx.request.nextUrl.searchParams));
  if (!query.success) throw new ApiError(400, "invalid_request", describeValidationError(query.error, ctx.t));

  const cursor = query.data.cursor ? decodeCursor(query.data.cursor) : undefined;
  if (cursor === null) throw new ApiError(400, "invalid_request", ctx.t.errors.invalidParameter("cursor", "unknown cursor"));

  await failStaleJobs(principal.userId);
  const { rows, hasMore } = await listJobs(principal.userId, {
    limit: query.data.limit,
    cursor,
    status: query.data.status,
    type: query.data.type,
  });

  const last = rows.at(-1);
  return NextResponse.json<ListResource<AnalysisResource>>({
    object: "list",
    data: rows.map((row) => toAnalysisResource(row, ctx.t)),
    hasMore,
    nextCursor: hasMore && last ? encodeCursor({ createdAt: last.created_at, id: last.id }) : null,
  });
});

export const { PUT, PATCH, DELETE } = methodNotAllowed("GET, POST");

function readIdempotencyKey(ctx: ApiContext): string | null {
  const value = ctx.request.headers.get("idempotency-key");
  if (value === null) return null;
  const key = value.trim();
  if (key.length === 0 || key.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    throw new ApiError(400, "invalid_request", ctx.t.errors.apiInvalidIdempotencyKey);
  }
  return key;
}

/** Fingerprint of the uploaded files, in order, to detect a reused idempotency key. */
function hashUpload(buffers: Buffer[]): string {
  const hash = createHash("sha256");
  for (const buffer of buffers) {
    hash.update(String(buffer.length)).update(":").update(buffer);
  }
  return hash.digest("hex");
}

function replay(ctx: ApiContext, job: AnalysisJobRow, requestHash: string): Response {
  if (job.request_hash !== requestHash) {
    throw new ApiError(409, "idempotency_conflict", ctx.t.errors.apiIdempotencyConflict);
  }
  return NextResponse.json<AnalysisResource>(toAnalysisResource(job, ctx.t), {
    status: 200,
    headers: { Location: `/api/v1/analyses/${job.id}`, "Idempotent-Replayed": "true" },
  });
}

async function processImages(ctx: ApiContext, buffers: Buffer[]): Promise<ProcessedImage[]> {
  return Promise.all(
    buffers.map(async (buffer, i) => {
      try {
        return await compressImageForAnalysis(buffer);
      } catch (error) {
        console.error(`[api] request_id=${ctx.requestId} Bild ${i + 1} nicht verarbeitbar:`, error);
        throw new ApiError(
          400,
          "image_not_processable",
          `${ctx.t.common.image(i + 1)}: ${ctx.t.errors.imageNotProcessable}`
        );
      }
    })
  );
}

async function handleCreationRefusal(
  ctx: ApiContext,
  principal: Principal,
  error: JobCreationError,
  credits: number,
  idempotencyKey: string | null,
  requestHash: string
): Promise<Response> {
  switch (error.reason) {
    case "insufficient_credits": {
      const balance = await getCreditBalance(principal.userId);
      throw new ApiError(402, "insufficient_credits", ctx.t.errors.insufficientCredits(credits, balance));
    }
    case "too_many_active":
      throw new ApiError(429, "too_many_active_analyses", ctx.t.errors.tooManyActiveAnalyses(API_LIMITS.maxActiveAnalyses));
    case "duplicate_idempotency_key": {
      // Lost a race against a parallel request with the same key.
      const existing = idempotencyKey ? await findJobByIdempotencyKey(principal.userId, idempotencyKey) : null;
      if (!existing) throw error;
      return replay(ctx, existing, requestHash);
    }
  }
}
