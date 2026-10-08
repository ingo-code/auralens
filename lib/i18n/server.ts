import { cookies, headers } from "next/headers";
import type { NextRequest } from "next/server";
import { LOCALE_COOKIE, resolveLocale, type Locale } from "@/lib/i18n/config";

/** Locale of the current request inside Server Components and layouts. */
export async function getRequestLocale(): Promise<Locale> {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  return resolveLocale({
    cookie: cookieStore.get(LOCALE_COOKIE)?.value,
    acceptLanguage: headerStore.get("accept-language"),
  });
}

/** Locale of an API request: `?lang=` beats the cookie, which beats Accept-Language. */
export function localeFromRequest(request: NextRequest): Locale {
  return resolveLocale({
    explicit: request.nextUrl.searchParams.get("lang"),
    cookie: request.cookies.get(LOCALE_COOKIE)?.value,
    acceptLanguage: request.headers.get("accept-language"),
  });
}
