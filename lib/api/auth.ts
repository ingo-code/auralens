import { API_SCOPES, hashApiKey, looksLikeApiKey, type ApiScope } from "@/lib/api/api-keys";
import { ApiError } from "@/lib/api/errors";
import type { ApiContext } from "@/lib/api/handler";
import { findActiveApiKeyByHash } from "@/lib/api/repository";
import { createClient } from "@/lib/supabase/server";

export type Principal = {
  userId: string;
  /** Null when authenticated by a browser session. */
  apiKeyId: string | null;
  scopes: readonly string[];
  via: "api_key" | "session";
};

type AuthOptions = {
  /** Permission the endpoint needs. */
  scope?: ApiScope;
  /** Key management must not be reachable with a (possibly leaked) API key. */
  sessionOnly?: boolean;
};

/**
 * Authenticates a public API request: `Authorization: Bearer al_live_…`
 * for integrations, or the Supabase session cookie for the AuraLens web app
 * itself. Throws 401/403 problem errors.
 */
export async function authenticate(ctx: ApiContext, options: AuthOptions = {}): Promise<Principal> {
  const { t } = ctx;
  const header = ctx.request.headers.get("authorization");

  const principal = header ? await fromApiKey(ctx, header) : await fromSession(ctx);

  if (options.sessionOnly && principal.via !== "session") {
    throw new ApiError(403, "forbidden", t.errors.apiSessionRequired);
  }
  if (options.scope && !principal.scopes.includes(options.scope)) {
    throw new ApiError(403, "forbidden", t.errors.apiMissingScope(options.scope));
  }
  return principal;
}

async function fromApiKey(ctx: ApiContext, header: string): Promise<Principal> {
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  if (!match) {
    throw new ApiError(401, "unauthorized", ctx.t.errors.apiMalformedAuth, { "WWW-Authenticate": "Bearer" });
  }

  const key = match[1];
  const row = looksLikeApiKey(key) ? await findActiveApiKeyByHash(hashApiKey(key)) : null;
  if (!row) {
    throw new ApiError(401, "unauthorized", ctx.t.errors.apiInvalidKey, {
      "WWW-Authenticate": 'Bearer error="invalid_token"',
    });
  }

  return { userId: row.user_id, apiKeyId: row.id, scopes: row.scopes, via: "api_key" };
}

async function fromSession(ctx: ApiContext): Promise<Principal> {
  let userId: string | undefined;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    userId = data?.claims.sub;
  } catch (error) {
    console.error(`[api] request_id=${ctx.requestId} Supabase-Sitzung nicht prüfbar:`, error);
  }

  if (!userId) {
    throw new ApiError(401, "unauthorized", ctx.t.errors.apiUnauthorized, { "WWW-Authenticate": "Bearer" });
  }

  // Cookies ride along on cross-site requests; SameSite=Lax already blocks
  // cross-site POSTs, this check is defense in depth for every state change.
  const method = ctx.request.method.toUpperCase();
  const origin = ctx.request.headers.get("origin");
  if (method !== "GET" && method !== "HEAD" && origin && !isSameOrigin(origin, ctx.request.headers.get("host"))) {
    throw new ApiError(403, "forbidden", ctx.t.errors.apiCrossOrigin);
  }

  return { userId, apiKeyId: null, scopes: API_SCOPES, via: "session" };
}

function isSameOrigin(origin: string, host: string | null): boolean {
  try {
    return host !== null && new URL(origin).host === host;
  } catch {
    return false;
  }
}
