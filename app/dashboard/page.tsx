import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { DeleteAnalysisButton } from "@/components/DeleteAnalysisButton";
import { DashboardNav } from "@/components/DashboardNav";
import { SiteHeader } from "@/components/SiteHeader";
import { failStaleJobs, type AnalysisStatus, type AnalysisType } from "@/lib/api/repository";
import { getMessages } from "@/lib/i18n";
import { INTL_LOCALES } from "@/lib/i18n/config";
import { getRequestLocale } from "@/lib/i18n/server";
import type { StyleAnalysis } from "@/lib/analysis-schema";

/** Light projection of an analysis job - the full report stays in the DB. */
type JobSummaryRow = {
  id: string;
  type: AnalysisType;
  status: AnalysisStatus;
  image_count: number;
  created_at: string;
  series_title: string | null;
  style_summary: string | null;
  palette: { hex: string }[] | null;
  master_colors: { hex: string }[] | null;
};

type Item =
  | {
      kind: "v1";
      id: string;
      createdAt: string;
      type: AnalysisType;
      status: AnalysisStatus;
      imageCount: number;
      title: string | null;
      colors: string[];
    }
  | { kind: "legacy"; id: string; createdAt: string; report: StyleAnalysis; imageUrl: string | null };

const STATUS_STYLES: Record<AnalysisStatus, string> = {
  queued: "bg-stone-100 text-stone-600",
  running: "bg-violet-100 text-violet-700",
  completed: "bg-emerald-50 text-emerald-700",
  failed: "bg-red-50 text-red-700",
};

export default async function DashboardPage() {
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

  if (!userId) {
    redirect("/login");
  }

  try {
    // Fails and refunds analyses orphaned by a server restart.
    await failStaleJobs(userId);
  } catch (error) {
    console.error("Aufräumen hängender Analysen fehlgeschlagen:", error);
  }

  // Both queries run with the user's session, so RLS limits them to own rows.
  const [{ data: jobs }, { data: analyses }] = await Promise.all([
    supabase
      .from("analysis_jobs")
      .select(
        "id, type, status, image_count, created_at, " +
          "series_title:report->series->>title, style_summary:report->style->>summary, " +
          "palette:report->colorPalette, master_colors:report->masterPalette->colors"
      )
      .order("created_at", { ascending: false })
      .limit(50)
      .returns<JobSummaryRow[]>(),
    supabase.from("analyses").select("id, image_path, report, created_at").order("created_at", { ascending: false }),
  ]);

  const legacyItems = await Promise.all(
    (analyses ?? []).map(async (row): Promise<Item> => {
      const { data: signed } = await supabase.storage
        .from("analysis-images")
        .createSignedUrl(row.image_path as string, 60 * 60);

      return {
        kind: "legacy",
        id: row.id as string,
        createdAt: row.created_at as string,
        report: row.report as StyleAnalysis,
        imageUrl: signed?.signedUrl ?? null,
      };
    })
  );

  const jobItems: Item[] = (jobs ?? []).map((job) => ({
    kind: "v1",
    id: job.id,
    createdAt: job.created_at,
    type: job.type,
    status: job.status,
    imageCount: job.image_count,
    title: job.series_title ?? job.style_summary,
    colors: (job.master_colors ?? job.palette ?? []).map((color) => color.hex).slice(0, 6),
  }));

  const items = [...jobItems, ...legacyItems].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const formatDate = (iso: string) => new Date(iso).toLocaleString(INTL_LOCALES[locale]);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-10 sm:px-8">
        <DashboardNav title={t.dashboard.title} />

        {items.length === 0 ? (
          <p className="border border-dashed border-stone-300 bg-room-deep p-10 text-center font-mono text-sm text-ink-muted">
            {t.dashboard.empty}
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) =>
              item.kind === "v1" ? (
                <article
                  key={item.id}
                  className="flex gap-4 border border-hairline bg-panel p-4 transition-colors hover:border-stone-300"
                >
                  <Link href={`/dashboard/analyses/${item.id}`} className="flex min-w-0 flex-1 gap-4">
                    <Swatches colors={item.colors} pending={item.status === "queued" || item.status === "running"} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5 text-xs">
                        <span className="bg-violet-50 px-2 py-0.5 text-violet-700">
                          {item.type === "series" ? t.dashboard.seriesBadge(item.imageCount) : t.dashboard.imageBadge}
                        </span>
                        {item.status !== "completed" && (
                          <span className={`px-2 py-0.5 ${STATUS_STYLES[item.status]}`}>
                            {t.dashboard.status[item.status]}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 font-mono text-[11px] text-ink-muted">{formatDate(item.createdAt)}</p>
                      {item.title && <p className="mt-1 line-clamp-2 text-sm text-stone-700">{item.title}</p>}
                      <p className="mt-2 text-xs font-medium text-violet-700">{t.dashboard.open}</p>
                    </div>
                  </Link>
                  <DeleteAnalysisButton id={item.id} kind="v1" />
                </article>
              ) : (
                <article
                  key={item.id}
                  className="flex gap-4 border border-hairline bg-panel p-4"
                >
                  {item.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element -- signierte Supabase-Storage-URL, kein optimierbares Remote-Bild
                    <img
                      src={item.imageUrl}
                      alt=""
                      className="h-20 w-20 shrink-0  object-cover ring-1 ring-stone-200"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-stone-500">
                      <span className="bg-stone-100 px-2 py-0.5 text-stone-600" title={t.dashboard.archivedHint}>
                        {t.dashboard.archived}
                      </span>{" "}
                      {formatDate(item.createdAt)}
                    </p>
                    <p className="mt-1 line-clamp-2 text-sm text-stone-700">{item.report.style.summary}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {item.report.emotions.slice(0, 3).map((emotion) => (
                        <span key={emotion} className="bg-violet-50 px-2 py-0.5 text-xs text-violet-700">
                          {emotion}
                        </span>
                      ))}
                    </div>
                  </div>
                  <DeleteAnalysisButton id={item.id} />
                </article>
              )
            )}
          </div>
        )}
      </main>
    </div>
  );
}

/** Palette preview instead of a thumbnail - API analyses don't store images. */
function Swatches({ colors, pending }: { colors: string[]; pending: boolean }) {
  if (colors.length === 0) {
    return <div className={`h-20 w-20 shrink-0 bg-panel-high ${pending ? "animate-pulse" : ""}`} aria-hidden="true" />;
  }
  return (
    <div className="grid h-20 w-20 shrink-0 grid-cols-2 overflow-hidden  ring-1 ring-stone-200" aria-hidden="true">
      {colors.slice(0, 4).map((hex, i) => (
        <span key={`${hex}-${i}`} style={{ backgroundColor: hex }} />
      ))}
    </div>
  );
}
