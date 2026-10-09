import type { NextRequest } from "next/server";
import { ApiError, problemResponse } from "@/lib/api/errors";
import { AdminClientNotConfiguredError } from "@/lib/supabase/admin";
import { getMessages, type Messages } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";
import { localeFromRequest } from "@/lib/i18n/server";
import { hitRateLimit } from "@/lib/api/repository";
import { checkRateLimit, type RateLimitOptions, type RateLimitResult } from "@/lib/rate-limit";

export type ApiContext = {
  request: NextRequest;
  /** Echoed as `X-Request-Id` and in every error body; also in server logs. */
  requestId: string;
  locale: Locale;
  t: Messages;
  /** Headers added to whatever response the handler produces (e.g. rate limits). */
  headers: Headers;
};

type RouteContext<P> = { params: Promise<P> };

/**
 * Wraps a public API route handler: assigns a request id, resolves the
 * locale, and turns every thrown error into an RFC 9457 problem response so
 * clients always get the same error shape.
 */
export function apiRoute<P = Record<string, never>>(
  handler: (ctx: ApiContext, params: P) => Promise<Response>
) {
  return async (request: NextRequest, context: RouteContext<P>): Promise<Response> => {
    const locale = localeFromRequest(request);
    const ctx: ApiContext = {
      request,
      requestId: crypto.randomUUID(),
      locale,
      t: getMessages(locale),
      headers: new Headers(),
    };

    let response: Response;
    try {
      response = await handler(ctx, await context.params);
    } catch (error) {
      response = problemResponse(toApiError(error, ctx), ctx.requestId);
    }

    ctx.headers.forEach((value, key) => response.headers.set(key, value));
    response.headers.set("X-Request-Id", ctx.requestId);
    return response;
  };
}

function toApiError(error: unknown, ctx: ApiContext): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof AdminClientNotConfiguredError) {
    console.error(`[api] request_id=${ctx.requestId} ${error.message}`);
    return new ApiError(500, "internal_error", ctx.t.errors.apiNotConfigured);
  }
  console.error(`[api] request_id=${ctx.requestId} unerwarteter Fehler:`, error);
  return new ApiError(500, "internal_error", ctx.t.errors.apiInternal);
}

/**
 * Applies a fixed-window rate limit and exposes it via the IETF draft
 * `RateLimit-*` headers on every response. Throws 429 when exhausted.
 *
 * Counts in Supabase so the limit holds across serverless instances; falls
 * back to the per-process limiter when the database is not configured or
 * unreachable (a rate limiter outage must not take the API down).
 */
export async function enforceRateLimit(ctx: ApiContext, key: string, options: RateLimitOptions): Promise<void> {
  const result = await sharedRateLimit(ctx, key, options);
  const resetSeconds = Math.max(0, Math.ceil((result.resetAt - Date.now()) / 1000));

  ctx.headers.set("RateLimit-Limit", String(result.limit));
  ctx.headers.set("RateLimit-Remaining", String(result.remaining));
  ctx.headers.set("RateLimit-Reset", String(resetSeconds));

  if (!result.success) {
    throw new ApiError(429, "rate_limited", ctx.t.errors.rateLimited, { "Retry-After": String(resetSeconds) });
  }
}

async function sharedRateLimit(ctx: ApiContext, key: string, options: RateLimitOptions): Promise<RateLimitResult> {
  try {
    const hit = await hitRateLimit(key, options.limit, options.windowMs);
    return { ...hit, limit: options.limit };
  } catch (error) {
    if (!(error instanceof AdminClientNotConfiguredError)) {
      console.error(`[api] request_id=${ctx.requestId} Rate-Limit-Speicher nicht erreichbar, nutze Prozess-Limit:`, error);
    }
    return checkRateLimit(key, options);
  }
}

/** Parses a JSON body of at most `maxBytes`; throws 400/413 problem errors. */
export async function readJsonBody(ctx: ApiContext, maxBytes: number): Promise<unknown> {
  if (Number(ctx.request.headers.get("content-length")) > maxBytes) {
    throw new ApiError(413, "payload_too_large", ctx.t.errors.bodyTooLarge);
  }
  try {
    return await ctx.request.json();
  } catch {
    throw new ApiError(400, "invalid_request", ctx.t.errors.expectedJson);
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ids that aren't UUIDs can't exist - answer 404 without asking the database. */
export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}
