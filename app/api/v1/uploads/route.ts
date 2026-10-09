import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { apiRoute, enforceRateLimit, methodNotAllowed, readJsonBody } from "@/lib/api/handler";
import { runInBackground } from "@/lib/api/background";
import { API_LIMITS, API_RATE_LIMITS } from "@/lib/api/limits";
import type { UploadBatchResource } from "@/lib/api/resources";
import { createUploadSlots, purgeStaleUploads, UPLOAD_TTL_MS } from "@/lib/api/uploads";
import { ALLOWED_IMAGE_TYPES } from "@/lib/image-validation";
import { describeValidationError } from "@/lib/series-api";

export const runtime = "nodejs";

const UploadRequestSchema = z.object({
  files: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(255),
        type: z.string(),
        size: z.number().int().positive(),
      })
    )
    .min(1)
    .max(API_LIMITS.maxImagesPerAnalysis),
});

/**
 * Hands out signed upload URLs for the images of one analysis. The client
 * PUTs each file to its `uploadUrl` (straight to storage, no body-size cap
 * of the API host) and then starts the analysis with the returned paths.
 */
export const POST = apiRoute(async (ctx) => {
  const { t } = ctx;
  const principal = await authenticate(ctx, { scope: "analyses:write" });
  await enforceRateLimit(ctx, `v1:write:${principal.userId}`, API_RATE_LIMITS.write);

  const parsed = UploadRequestSchema.safeParse(await readJsonBody(ctx, 16 * 1024));
  if (!parsed.success) throw new ApiError(400, "invalid_request", describeValidationError(parsed.error, t));
  const { files } = parsed.data;

  for (const [i, file] of files.entries()) {
    const label = t.common.image(i + 1);
    if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
      throw new ApiError(400, "invalid_request", `${label}: ${t.errors.unsupportedType(file.type)}`);
    }
    if (file.size > API_LIMITS.maxImageBytes) {
      throw new ApiError(413, "payload_too_large", `${label}: ${t.errors.fileTooLarge}`);
    }
  }
  if (files.reduce((sum, file) => sum + file.size, 0) > API_LIMITS.maxTotalUploadBytes) {
    throw new ApiError(413, "payload_too_large", t.errors.seriesTotalTooLarge);
  }

  const slots = await createUploadSlots(
    principal.userId,
    files.map((file) => file.name)
  );
  runInBackground(() =>
    purgeStaleUploads(principal.userId).catch((error) =>
      console.error(`[api] request_id=${ctx.requestId} Aufräumen alter Uploads fehlgeschlagen:`, error)
    )
  );

  return NextResponse.json<UploadBatchResource>(
    {
      object: "upload_batch",
      expiresAt: new Date(Date.now() + UPLOAD_TTL_MS).toISOString(),
      uploads: slots.map((slot, i) => ({ ...slot, contentType: files[i].type })),
    },
    { status: 201 }
  );
});

export const { GET, PUT, PATCH, DELETE } = methodNotAllowed("POST");
