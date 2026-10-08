"use client";

import { LOCALE_NAMES, LOCALES } from "@/lib/i18n/config";
import { useI18n, useSetLocale } from "@/lib/i18n/client";

export function LanguageSwitcher() {
  const { locale, t } = useI18n();
  const setLocale = useSetLocale();

  return (
    <div role="radiogroup" aria-label={t.common.languageSwitcher} className="flex rounded-full bg-stone-100 p-0.5 text-xs">
      {LOCALES.map((code) => (
        <button
          key={code}
          type="button"
          role="radio"
          aria-checked={locale === code}
          aria-label={LOCALE_NAMES[code]}
          lang={code}
          onClick={() => locale !== code && setLocale(code)}
          className={`rounded-full px-2.5 py-1 font-medium uppercase transition-colors ${
            locale === code ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-800"
          }`}
        >
          {code}
        </button>
      ))}
    </div>
  );
}
