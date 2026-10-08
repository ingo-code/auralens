/*
 * Locale handling shared by server and client. The active locale lives in a
 * cookie (no /de, /en URL prefixes), so every route, API call included,
 * sees the same language without changing any URLs.
 */

export const LOCALES = ["de", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "de";
export const LOCALE_COOKIE = "auralens-locale";

export const LOCALE_NAMES: Record<Locale, string> = { de: "Deutsch", en: "English" };

/** BCP-47 tags for Intl APIs (dates, collation). */
export const INTL_LOCALES: Record<Locale, string> = { de: "de-DE", en: "en-US" };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** Picks the best supported language from an Accept-Language header, honoring q-weights. */
export function localeFromAcceptLanguage(header: string | null | undefined): Locale | undefined {
  if (!header) return undefined;

  const ranked = header
    .split(",")
    .map((part, position) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((param) => param.trim()).find((param) => param.startsWith("q="));
      return { language: tag.split("-")[0].toLowerCase(), q: q ? Number(q.slice(2)) : 1, position };
    })
    .filter((entry) => entry.language && !Number.isNaN(entry.q) && entry.q > 0)
    .sort((a, b) => b.q - a.q || a.position - b.position);

  return ranked.map((entry) => entry.language).find(isLocale);
}

/**
 * Resolution order: explicit choice (e.g. `?lang=en` for API clients), then
 * the cookie set by the language switcher, then the browser language.
 */
export function resolveLocale(sources: {
  explicit?: string | null;
  cookie?: string | null;
  acceptLanguage?: string | null;
}): Locale {
  if (isLocale(sources.explicit)) return sources.explicit;
  if (isLocale(sources.cookie)) return sources.cookie;
  return localeFromAcceptLanguage(sources.acceptLanguage) ?? DEFAULT_LOCALE;
}
