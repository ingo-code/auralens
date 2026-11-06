import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { authenticate } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { apiRoute, enforceRateLimit, isUuid, methodNotAllowed } from "@/lib/api/handler";
import { API_RATE_LIMITS } from "@/lib/api/limits";
import { getJob, recordAuditEvent, setShareToken } from "@/lib/api/repository";
import { toShareResource, type ShareResource } from "@/lib/api/resources";

export const runtime = "nodejs";

type Params = { id: string };

/*
 * Read-only share link for one completed analysis. The link shows the report
 * text only (images are never stored). POST is idempotent: an active link is
 * returned unchanged; DELETE disables it, a new POST then creates a new one.
 */

function withUrl(share: ShareResource, origin: string): ShareResource {
  return { ...share, url: `${origin}${share.path}` };
}

export const GET = apiRoute<Params>(async (ctx, { id }) => {
  const principal = await authenticate(ctx, { scope: "analyses:read" });
  await enforceRateLimit(ctx, `v1:read:${principal.userId}`, API_RATE_LIMITS.read);

  const job = isUuid(id) ? await getJob(principal.userId, id) : null;
  if (!job) throw new ApiError(404, "not_found", ctx.t.errors.analysisNotFound);
  const share = toShareResource(job);
  if (!share) throw new ApiError(404, "not_found", ctx.t.errors.analysisNotFound);
  return NextResponse.json<ShareResource>(withUrl(share, ctx.request.nextUrl.origin));
});

export const POST = apiRoute<Params>(async (ctx, { id }) => {
  const principal = await authenticate(ctx, { scope: "analyses:write" });
  await enforceRateLimit(ctx, `v1:write:${principal.userId}`, API_RATE_LIMITS.write);

  const job = isUuid(id) ? await getJob(principal.userId, id) : null;
  if (!job) throw new ApiError(404, "not_found", ctx.t.errors.analysisNotFound);
  if (job.status !== "completed") throw new ApiError(400, "invalid_request", ctx.t.errors.analysisNotShareable);

  const existing = toShareResource(job);
  if (existing) return NextResponse.json<ShareResource>(withUrl(existing, ctx.request.nextUrl.origin));

  const updated = await setShareToken(principal.userId, id, randomBytes(32).toString("base64url"));
  const share = updated && toShareResource(updated);
  if (!share) throw new ApiError(404, "not_found", ctx.t.errors.analysisNotFound);

  await recordAuditEvent({
    userId: principal.userId,
    event: "analysis.shared",
    details: { analysisId: id },
    apiKeyId: principal.apiKeyId,
    requestId: ctx.requestId,
  });
  return NextResponse.json<ShareResource>(withUrl(share, ctx.request.nextUrl.origin), { status: 201 });
});

export const DELETE = apiRoute<Params>(async (ctx, { id }) => {
  const principal = await authenticate(ctx, { scope: "analyses:write" });
  await enforceRateLimit(ctx, `v1:write:${principal.userId}`, API_RATE_LIMITS.write);

  const job = isUuid(id) ? await getJob(principal.userId, id) : null;
  if (!job) throw new ApiError(404, "not_found", ctx.t.errors.analysisNotFound);

  if (job.share_token) {
    await setShareToken(principal.userId, id, null);
    await recordAuditEvent({
      userId: principal.userId,
      event: "analysis.unshared",
      details: { analysisId: id },
      apiKeyId: principal.apiKeyId,
      requestId: ctx.requestId,
    });
  }
  return new NextResponse(null, { status: 204 });
});

export const { PUT, PATCH } = methodNotAllowed("GET, POST, DELETE");
