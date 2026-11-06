import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { AnalysisDetailView } from "@/components/analysis/AnalysisDetailView";
import { SiteHeader } from "@/components/SiteHeader";
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

  const analysis = toAnalysisResource(row, t, { includeReport: true, includeShare: true });

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-8">
        <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 font-mono text-[11px] text-ink-muted">
          <Link href="/dashboard" className="text-ink transition-colors hover:text-signal-soft">
            {t.dashboard.back}
          </Link>
          <span className="text-stone-300">/</span>
          <span className="bg-panel-high px-2 py-0.5 uppercase tracking-wider text-signal-soft">
            {analysis.type === "series" ? t.dashboard.seriesBadge(analysis.imageCount) : t.dashboard.imageBadge}
          </span>
          <span>{t.dashboard.created(new Date(analysis.createdAt).toLocaleString(INTL_LOCALES[locale]))}</span>
          <span>· {t.dashboard.credits(analysis.credits)}</span>
        </div>
        <AnalysisDetailView initial={analysis} />
      </main>
    </div>
  );
}
