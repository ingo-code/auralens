import { NextResponse } from "next/server";
import { authenticate } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { apiRoute, enforceRateLimit, isUuid } from "@/lib/api/handler";
import { API_RATE_LIMITS } from "@/lib/api/limits";
import { revokeApiKey } from "@/lib/api/repository";

export const runtime = "nodejs";

/** Revokes a key immediately; requests with it get 401 from then on. Session-only. */
export const DELETE = apiRoute<{ id: string }>(async (ctx, { id }) => {
  const principal = await authenticate(ctx, { sessionOnly: true });
  await enforceRateLimit(ctx, `v1:write:${principal.userId}`, API_RATE_LIMITS.write);

  if (!isUuid(id) || !(await revokeApiKey(principal.userId, id))) {
    throw new ApiError(404, "not_found", ctx.t.errors.apiKeyNotFound);
  }
  return new NextResponse(null, { status: 204 });
});
