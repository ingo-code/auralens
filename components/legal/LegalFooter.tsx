import Link from "next/link";
import { getMessages } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/server";

/** Imprint, privacy and beta terms - reachable from every page (§ 5 DDG: "leicht erkennbar"). */
export async function LegalFooter() {
  const t = getMessages(await getRequestLocale());

  return (
    <footer className="mt-auto border-t border-stone-200/70 px-6 py-6 text-xs text-stone-500">
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 sm:flex-row">
        <p>{t.legal.closedBeta}</p>
        <nav aria-label="Rechtliches" className="flex gap-5">
          <Link href="/impressum" className="hover:text-stone-900">
            {t.legal.imprint}
          </Link>
          <Link href="/datenschutz" className="hover:text-stone-900">
            {t.legal.privacy}
          </Link>
          <Link href="/beta-bedingungen" className="hover:text-stone-900">
            {t.legal.terms}
          </Link>
        </nav>
      </div>
    </footer>
  );
}
