"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useI18n } from "@/lib/i18n/client";

/** Title row + tabs shared by the signed-in area (analyses, API keys, account). */
export function DashboardNav({ title, children }: { title: string; children?: ReactNode }) {
  const { t } = useI18n();
  const pathname = usePathname();

  const tabs = [
    { href: "/dashboard", label: t.nav.myAnalyses },
    { href: "/dashboard/api", label: t.apiKeys.navLink },
    { href: "/dashboard/account", label: t.account.navLink },
  ];

  return (
    <div className="mb-8 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-muted">
            <span className="inline-block h-2 w-2 bg-signal" aria-hidden="true" />
            {t.nav.myAnalyses}
          </span>
          <h1 className="text-balance text-3xl text-ink sm:text-4xl">{title}</h1>
          {children}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/serie"
            className="border border-stone-300 bg-panel-high px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-stone-300"
          >
            {t.dashboard.newSeries}
          </Link>
          <Link
            href="/"
            className="bg-signal px-4 py-2 text-sm font-semibold text-on-signal transition-colors hover:bg-signal-soft"
          >
            {t.dashboard.newAnalysis}
          </Link>
        </div>
      </div>
      <nav className="flex gap-6 overflow-x-auto border-b border-hairline text-sm">
        {tabs.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={`-mb-px whitespace-nowrap border-b-2 pb-2 transition-colors ${
                active ? "border-signal text-ink" : "border-transparent text-ink-muted hover:text-ink"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
