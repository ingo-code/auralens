"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_LOCALE, LOCALE_COOKIE, type Locale } from "@/lib/i18n/config";
import { getMessages, type Messages } from "@/lib/i18n";

type I18nContextValue = { locale: Locale; t: Messages };

// Falls back to the default locale so components also render outside the
// provider (e.g. in isolated component tests).
const I18nContext = createContext<I18nContextValue>({ locale: DEFAULT_LOCALE, t: getMessages(DEFAULT_LOCALE) });

export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const value = useMemo(() => ({ locale, t: getMessages(locale) }), [locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/** Persists the choice and re-renders server components in the new language. */
export function useSetLocale() {
  const router = useRouter();
  return (locale: Locale) => {
    document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
    router.refresh();
  };
}
