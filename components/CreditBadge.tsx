"use client";

import Link from "next/link";
import { useCredits } from "@/lib/credits-store";
import { useI18n } from "@/lib/i18n/client";

/** Credit balance for the nav bar; renders nothing while signed out. */
export function CreditBadge() {
  const { t } = useI18n();
  const credits = useCredits();
  if (credits.status !== "ready") return null;

  const low = credits.balance < 2;
  return (
    <Link
      href="/dashboard/api"
      title={t.nav.creditsTitle}
      data-testid="credit-badge"
      className={`rounded-full px-3 py-1 text-xs font-medium ring-1 transition-colors ${
        low
          ? "bg-amber-50 text-amber-800 ring-amber-200 hover:bg-amber-100"
          : "bg-violet-50 text-violet-700 ring-violet-200 hover:bg-violet-100"
      }`}
    >
      ✦ {t.nav.credits(credits.balance)}
    </Link>
  );
}
