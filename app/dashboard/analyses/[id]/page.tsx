import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { AnalysisDetailView } from "@/components/analysis/AnalysisDetailView";
import { CreditBadge } from "@/components/CreditBadge";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { isUuid } from "@/lib/api/handler";
import { failStaleJobs, type AnalysisJobRow } from "@/lib/api/repository";
import { toAnalysisResource } from "@/lib/api/resources";
import { getMessages } from "@/lib/i18n";
import { INTL_LOCALES } from "@/lib/i18n/config";
import { getRequestLocale } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";

export default async function AnalysisDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const locale = await getRequestLocale();
  const t = getMessages(locale);
  const supabase = await createClient();

  let userId: string | undefined;
  try {
    const { data: claims } = await supabase.auth.getClaims();
    userId = claims?.claims.sub;
  } catch (error) {
    console.error("Supabase-Sitzung konnte nicht geprüft werden:", error);
  }
  if (!userId) redirect("/login");
  if (!isUuid(id)) notFound();

  try {
    await failStaleJobs(userId);
  } catch (error) {
    // Only a cleanup step - the page works without it.
    console.error("Aufräumen hängender Analysen fehlgeschlagen:", error);
  }

  // Read with the user's own session: RLS limits this to their analyses.
  const { data: row } = await supabase
    .from("analysis_jobs")
    .select("*")
    .eq("id", id)
    .maybeSingle<AnalysisJobRow>();
  if (!row) notFound();

  const analysis = toAnalysisResource(row, t, { includeReport: true });

  return (
    <div className="min-h-screen px-6 py-12 text-stone-900">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link href="/dashboard" className="text-sm text-stone-500 transition-colors hover:text-stone-900">
              {t.dashboard.back}
            </Link>
            <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-stone-500">
              <span className="rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-medium text-violet-700">
                {analysis.type === "series" ? t.dashboard.seriesBadge(analysis.imageCount) : t.dashboard.imageBadge}
              </span>
              <span>{t.dashboard.created(new Date(analysis.createdAt).toLocaleString(INTL_LOCALES[locale]))}</span>
              <span>· {t.dashboard.credits(analysis.credits)}</span>
            </p>
          </div>
          <div className="flex items-center gap-4">
            <CreditBadge />
            <LanguageSwitcher />
          </div>
        </div>
        <AnalysisDetailView initial={analysis} />
      </div>
    </div>
  );
}
