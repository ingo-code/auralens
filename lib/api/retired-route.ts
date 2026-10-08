import type { NextRequest } from "next/server";
import { ApiError, problemResponse } from "@/lib/api/errors";
import { getMessages } from "@/lib/i18n";
import { localeFromRequest } from "@/lib/i18n/server";

/**
 * Answer of the retired anonymous analysis routes (`/api/analyze`,
 * `/api/analyze/series`). They ran Claude without login or credits; now
 * every analysis goes through `/api/v1/analyses`. Kept as 410 instead of
 * removed so old scripts get a clear pointer rather than a bare 404 -
 * no body is read and Claude is never called.
 */
export function retiredAnalysisRoute(request: NextRequest): Response {
  const t = getMessages(localeFromRequest(request));
  const error = new ApiError(410, "gone", t.errors.routeRetired, { Link: '</api/v1/analyses>; rel="successor-version"' });
  return problemResponse(error, crypto.randomUUID());
}
