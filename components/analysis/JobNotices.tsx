"use client";

import Link from "next/link";
import type { AnalysisResource } from "@/lib/api/resources";
import { useI18n } from "@/lib/i18n/client";

/** Shown instead of the upload area while signed out - v1 needs an account. */
export function SignInPrompt() {
  const { t } = useI18n();
  const labels = t.analysis.signIn;
  return (
    <div className="w-full rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-fuchsia-50 p-6 text-center shadow-sm">
      <h2 className="text-lg font-semibold text-stone-900">{labels.title}</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-stone-600">{labels.body}</p>
      <Link
        href="/login"
        className="mt-4 inline-block rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-500 px-5 py-2 text-sm font-medium text-white shadow-sm transition hover:brightness-110"
      >
        {labels.cta}
      </Link>
    </div>
  );
}

/** The analysis failed on the server; credits were refunded automatically. */
export function AnalysisFailedNotice({ analysis, onRetry }: { analysis: AnalysisResource; onRetry?: () => void }) {
  const { t } = useI18n();
  return (
    <div role="alert" className="w-full rounded-2xl border border-red-200 bg-red-50 p-5 text-sm">
      <p className="font-semibold text-red-800">{t.analysis.failedTitle}</p>
      <p className="mt-1 text-red-700">{analysis.error?.message}</p>
      <p className="mt-1 text-red-700/80">{t.analysis.refunded(analysis.credits)}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-lg bg-white px-3 py-1.5 text-red-700 ring-1 ring-red-200 transition-colors hover:bg-red-100"
        >
          {t.analysis.tryAgain}
        </button>
      )}
    </div>
  );
}

/** The user stopped watching; the analysis continues server-side. */
export function DetachedNotice({ analysisId }: { analysisId: string }) {
  const { t } = useI18n();
  return (
    <div role="status" className="w-full rounded-2xl border border-stone-200 bg-white p-5 text-sm shadow-sm">
      <p className="text-stone-700">{t.analysis.detached}</p>
      <Link href={`/dashboard/analyses/${analysisId}`} className="mt-2 inline-block font-medium text-violet-700 hover:text-violet-900">
        {t.analysis.openDashboard} →
      </Link>
    </div>
  );
}

/** A request error (validation, network, limits) - nothing is running. */
export function RequestErrorNotice({ message }: { message: string }) {
  return (
    <p role="alert" className="w-full rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {message}
    </p>
  );
}
