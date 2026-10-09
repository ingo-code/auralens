import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_AUTH_COOKIE_NAME } from "@/lib/supabase/cookie-name";

/*
 * CORS for the public API, so integrations may call it from a browser with an
 * API key. Wildcard origin without Allow-Credentials: browsers never attach
 * the session cookie to such cross-origin calls, and cookie-authenticated
 * writes additionally reject foreign origins (lib/api/auth.ts).
 */
const API_CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Idempotency-Key",
  "Access-Control-Expose-Headers":
    "Location, Retry-After, RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset, X-Request-Id, Idempotent-Replayed",
  "Access-Control-Max-Age": "86400",
};

export async function proxy(request: NextRequest) {
  const isPublicApi = request.nextUrl.pathname.startsWith("/api/v1/");
  if (isPublicApi && request.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: API_CORS_HEADERS });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;

  const supabase = createServerClient(
    supabaseUrl,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: { name: SUPABASE_AUTH_COOKIE_NAME },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  try {
    // Refreshes the session cookie when the access token is close to expiry.
    // Required reading for anything downstream that relies on auth state.
    await supabase.auth.getClaims();
  } catch (error) {
    // Supabase unreachable/misconfigured must not take the whole site down -
    // fall through as unauthenticated rather than 500ing every request.
    console.error("Supabase-Sitzung konnte nicht aktualisiert werden:", error);
  }

  if (isPublicApi) {
    for (const [name, value] of Object.entries(API_CORS_HEADERS)) supabaseResponse.headers.set(name, value);
  }
  return supabaseResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
