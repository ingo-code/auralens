"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AuthStatus } from "@/components/AuthStatus";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useI18n } from "@/lib/i18n/client";

/** Darkroom header shared by the app pages: wordmark, main nav, account, language. */
export function SiteHeader() {
  const { t } = useI18n();
  const pathname = usePathname();

  const links = [
    { href: "/", label: t.nav.analyze },
    { href: "/serie", label: t.nav.series },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-hairline bg-panel/95 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-8">
        <Link href="/" aria-label={t.nav.home} className="flex items-center gap-2.5">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-6 w-6 text-signal" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="12" r="4" />
            <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
          </svg>
          <span className="text-base font-semibold tracking-tight text-ink">AuraLens</span>
          <span className="hidden border border-hairline bg-room px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-ink-muted md:inline-block">
            Beta
          </span>
        </Link>

        <nav className="hidden h-full items-center gap-6 sm:flex">
          {links.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`flex h-full items-center border-b-2 text-sm transition-colors ${
                  active ? "border-signal font-medium text-ink" : "border-transparent text-ink-muted hover:text-ink"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-4">
          <AuthStatus />
          <LanguageSwitcher />
        </div>
      </div>
      {/* Compact nav for phones */}
      <nav className="flex gap-6 border-t border-hairline px-4 py-2 text-sm sm:hidden">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            aria-current={pathname === link.href ? "page" : undefined}
            className={pathname === link.href ? "font-medium text-ink" : "text-ink-muted"}
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
