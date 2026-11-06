import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AnalysisReport } from "@/components/AnalysisReport";
import { ReportActions } from "@/components/exports/ReportActions";
import { SiteHeader } from "@/components/SiteHeader";
import { SeriesResults } from "@/components/series/SeriesResults";
import { getSharedJob, type AnalysisJobRow } from "@/lib/api/repository";
import { toAnalysisResource } from "@/lib/api/resources";
import { imageReportOf, seriesResultOf } from "@/lib/analysis-view";
import { getMessages } from "@/lib/i18n";
import { INTL_LOCALES } from "@/lib/i18n/config";
import { getRequestLocale } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export async function generateMetadata(): Promise<Metadata> {
  const t = getMessages(await getRequestLocale());
  return {
    title: t.sharedReport.metaTitle,
    // Private links: keep them out of search engines and referrer headers.
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}

async function loadShared(token: string): Promise<AnalysisJobRow | null> {
  if (!TOKEN_PATTERN.test(token)) return null;
  try {
    return await getSharedJob(token);
  } catch (error) {
    console.error("Geteilter Bericht konnte nicht geladen werden:", error);
    return null;
  }
}

/** Public, read-only view of a shared report. Shows report text only - no images, no account data. */
export default async function SharedReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const locale = await getRequestLocale();
  const t = getMessages(locale);

  const row = await loadShared(token);
  if (!row) notFound();

  const analysis = toAnalysisResource(row, t, { includeReport: true });
  const series = seriesResultOf(analysis);
  const image = imageReportOf(analysis);
  if (!series && !image) notFound();

  const sharedOn = new Date(row.shared_at ?? row.completed_at ?? row.created_at).toLocaleDateString(INTL_LOCALES[locale]);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-6 px-4 py-10 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3 border border-hairline bg-panel p-4">
          <div className="space-y-1">
            <p className="flex items-center gap-2 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-ink-muted">
              <span className="inline-block h-2 w-2 bg-signal" aria-hidden="true" />
              {t.sharedReport.eyebrow}
            </p>
            <p className="text-sm text-ink-muted">{t.sharedReport.note(sharedOn)}</p>
          </div>
          <Link href="/" className="text-sm text-ink transition-colors hover:text-signal-soft">
            {t.sharedReport.cta}
          </Link>
        </div>
        <ReportActions analysis={analysis} />
        {series ? <SeriesResults result={series} previewUrls={[]} /> : image && <AnalysisReport report={image} measurements={analysis.files[0]?.measurements} />}
      </main>
    </div>
  );
}
