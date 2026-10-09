import { NextResponse } from "next/server";
import { z } from "zod";
import { API_SCOPES, generateApiKey } from "@/lib/api/api-keys";
import { authenticate } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { apiRoute, enforceRateLimit, methodNotAllowed, readJsonBody } from "@/lib/api/handler";
import { API_LIMITS, API_RATE_LIMITS } from "@/lib/api/limits";
import { insertApiKey, listApiKeys } from "@/lib/api/repository";
import {
  toApiKeyResource,
  type ApiKeyResource,
  type CreatedApiKeyResource,
  type ListResource,
} from "@/lib/api/resources";
import { describeValidationError } from "@/lib/series-api";

export const runtime = "nodejs";

/*
 * API key management. Session-only: a leaked API key must not be able to
 * mint new keys or enumerate existing ones.
 */

/** Active (non-revoked) keys of the signed-in user. Secrets are never returned. */
export const GET = apiRoute(async (ctx) => {
  const principal = await authenticate(ctx, { sessionOnly: true });
  await enforceRateLimit(ctx, `v1:read:${principal.userId}`, API_RATE_LIMITS.read);

  const rows = await listApiKeys(principal.userId);
  return NextResponse.json<ListResource<ApiKeyResource>>({
    object: "list",
    data: rows.map(toApiKeyResource),
    hasMore: false,
    nextCursor: null,
  });
});

const CreateKeySchema = z.object({
  name: z.string().trim().min(1).max(100),
  scopes: z.array(z.enum(API_SCOPES)).min(1).default([...API_SCOPES]),
});

export const POST = apiRoute(async (ctx) => {
  const principal = await authenticate(ctx, { sessionOnly: true });
  await enforceRateLimit(ctx, `v1:write:${principal.userId}`, API_RATE_LIMITS.write);

  const parsed = CreateKeySchema.safeParse(await readJsonBody(ctx, 10 * 1024));
  if (!parsed.success) throw new ApiError(400, "invalid_request", describeValidationError(parsed.error, ctx.t));

  const existing = await listApiKeys(principal.userId);
  if (existing.length >= API_LIMITS.maxActiveApiKeys) {
    throw new ApiError(409, "api_key_limit_reached", ctx.t.errors.apiKeyLimit(API_LIMITS.maxActiveApiKeys));
  }

  const generated = generateApiKey();
  const row = await insertApiKey({
    userId: principal.userId,
    name: parsed.data.name,
    prefix: generated.prefix,
    hash: generated.hash,
    // Stored in canonical order so equal permission sets look equal.
    scopes: API_SCOPES.filter((scope) => parsed.data.scopes.includes(scope)),
  });

  return NextResponse.json<CreatedApiKeyResource>(
    { ...toApiKeyResource(row), key: generated.key },
    { status: 201, headers: { "Cache-Control": "no-store" } }
  );
});

export const { PUT, PATCH, DELETE } = methodNotAllowed("GET, POST");
