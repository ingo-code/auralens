import { NextResponse } from "next/server";
import { authenticate } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { apiRoute, enforceRateLimit, isUuid, methodNotAllowed } from "@/lib/api/handler";
import { API_RATE_LIMITS } from "@/lib/api/limits";
import { deleteJob, failStaleJobs, getJob } from "@/lib/api/repository";
import { toAnalysisResource, type AnalysisResource } from "@/lib/api/resources";
import type { SeriesAnalysis } from "@/lib/series-analysis-schema";
import { describeValidationError } from "@/lib/series-api";
import { OrganizeError, OrganizeOptionsSchema, organizeSeries, type SeriesOrganization } from "@/lib/series-organize";

export const runtime = "nodejs";

type Params = { id: string };

/**
 * Status and, once completed, the full report. Completed series also get an
 * `organization` arranged per `?sort=&order=&group=` (no extra credits).
 */
export const GET = apiRoute<Params>(async (ctx, { id }) => {
  const principal = await authenticate(ctx, { scope: "analyses:read" });
  await enforceRateLimit(ctx, `v1:read:${principal.userId}`, API_RATE_LIMITS.read);

  // Validated up front so a typo fails the same way regardless of job state.
  const options = OrganizeOptionsSchema.safeParse(Object.fromEntries(ctx.request.nextUrl.searchParams));
  if (!options.success) throw new ApiError(400, "invalid_request", describeValidationError(options.error, ctx.t));

  if (!isUuid(id)) throw new ApiError(404, "not_found", ctx.t.errors.analysisNotFound);
  await failStaleJobs(principal.userId);
  const job = await getJob(principal.userId, id);
  if (!job) throw new ApiError(404, "not_found", ctx.t.errors.analysisNotFound);

  let organization: SeriesOrganization | undefined;
  if (job.type === "series" && job.status === "completed" && job.report) {
    try {
      organization = organizeSeries(job.report as SeriesAnalysis, job.files, options.data, ctx.locale);
    } catch (error) {
      // A stored report is always consistent with its files; if not, still
      // return the report rather than failing the whole request.
      if (!(error instanceof OrganizeError)) throw error;
      console.error(`[api] request_id=${ctx.requestId} organize fehlgeschlagen für ${id}:`, error.message);
    }
  }

  return NextResponse.json<AnalysisResource>(
    toAnalysisResource(job, ctx.t, { includeReport: true, organization })
  );
});

/** Deletes the analysis and its report. Credits of a running analysis are not refunded. */
export const DELETE = apiRoute<Params>(async (ctx, { id }) => {
  const principal = await authenticate(ctx, { scope: "analyses:write" });
  await enforceRateLimit(ctx, `v1:write:${principal.userId}`, API_RATE_LIMITS.write);

  if (!isUuid(id) || !(await deleteJob(principal.userId, id))) {
    throw new ApiError(404, "not_found", ctx.t.errors.analysisNotFound);
  }
  return new NextResponse(null, { status: 204 });
});

export const { POST, PUT, PATCH } = methodNotAllowed("GET, DELETE");
