import { NextRequest, NextResponse } from "next/server";
import { getMessages } from "@/lib/i18n";
import { localeFromRequest } from "@/lib/i18n/server";
import { checkRateLimit, getClientIdentifier } from "@/lib/rate-limit";
import {
  describeValidationError,
  OrganizeRequestSchema,
  type ApiErrorResponse,
  type OrganizeResponse,
} from "@/lib/series-api";
import { OrganizeError, organizeSeries } from "@/lib/series-organize";

export const runtime = "nodejs";

// A full 10-image report is ~30 KB; anything far beyond that isn't a report.
const MAX_BODY_SIZE = 1024 * 1024; // 1 MB

// Pure computation without Claude calls - cheap, so the limit only guards
// against floods, not cost.
const RATE_LIMIT = {
  limit: Number(process.env.ORGANIZE_RATE_LIMIT ?? 120),
  windowMs: 60 * 1000,
};

function errorResponse(message: string, status: number, headers?: HeadersInit) {
  return NextResponse.json<ApiErrorResponse>({ error: message }, { status, headers });
}

/**
 * Re-sorts and re-groups a previous series analysis without re-running it.
 * Body: `{ report, files, sort?, order?, group? }` as returned by
 * GET /api/v1/analyses/{id}.
 */
export async function POST(request: NextRequest) {
  const locale = localeFromRequest(request);
  const t = getMessages(locale);
  const rateLimit = checkRateLimit(`organize:${getClientIdentifier(request.headers)}`, RATE_LIMIT);
  if (!rateLimit.success) {
    const retryAfterSeconds = Math.ceil((rateLimit.resetAt - Date.now()) / 1000);
    return errorResponse(t.errors.organizeRateLimited, 429, {
      "Retry-After": String(retryAfterSeconds),
    });
  }

  if (Number(request.headers.get("content-length")) > MAX_BODY_SIZE) {
    return errorResponse(t.errors.bodyTooLarge, 413);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(t.errors.expectedJson, 400);
  }

  const parsed = OrganizeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(describeValidationError(parsed.error, t), 400);
  }

  const { report, files, ...options } = parsed.data;
  try {
    return NextResponse.json<OrganizeResponse>({ organization: organizeSeries(report, files, options, locale) });
  } catch (error) {
    if (error instanceof OrganizeError) return errorResponse(error.message, 400);
    throw error;
  }
}
