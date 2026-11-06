"use client";

import { useState, useSyncExternalStore } from "react";
import { CopyButton } from "@/components/series/CopyButton";
import { ApiProblem, createShareLink, deleteShareLink } from "@/lib/api-client";
import type { AnalysisResource, ShareResource } from "@/lib/api/resources";
import type { StyleAnalysis } from "@/lib/analysis-schema";
import { downloadBlob, todayStamp } from "@/lib/download";
import { useI18n } from "@/lib/i18n/client";
import { buildReportPackage, type ReportPackageInput } from "@/lib/report-package";
import type { SeriesAnalysis } from "@/lib/series-analysis-schema";
import { createZip } from "@/lib/zip";

type ReportActionsProps = {
  analysis: AnalysisResource;
  /** Owner view: offer a share link. Off on the public shared page. */
  canShare?: boolean;
};

const noSubscription = () => () => {};

export function packageInputOf(analysis: AnalysisResource): ReportPackageInput | null {
  if (analysis.status !== "completed" || !analysis.report) return null;
  return analysis.type === "series"
    ? { type: "series", report: analysis.report as SeriesAnalysis, files: analysis.files }
    : { type: "image", report: analysis.report as StyleAnalysis, files: analysis.files };
}

/** Download of the full report package and, for the owner, a read-only share link. */
export function ReportActions({ analysis, canShare = false }: ReportActionsProps) {
  const { t, locale } = useI18n();
  const a = t.reportActions;
  const [share, setShare] = useState<ShareResource | null>(analysis.share ?? null);
  const [busy, setBusy] = useState<"share" | "revoke" | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The origin is only known in the browser; the server renders the relative path.
  const origin = useSyncExternalStore(
    noSubscription,
    () => window.location.origin,
    () => ""
  );

  const input = packageInputOf(analysis);
  if (!input) return null;

  const download = () => {
    const zip = createZip(buildReportPackage(input, t, analysis.completedAt ?? undefined, locale));
    downloadBlob(zip as BlobPart, `auralens-${analysis.type === "series" ? "serie" : "bild"}-${todayStamp()}.zip`, "application/zip");
  };

  const run = async (kind: "share" | "revoke") => {
    setBusy(kind);
    setError(null);
    try {
      if (kind === "share") setShare(await createShareLink(analysis.id, t));
      else {
        await deleteShareLink(analysis.id, t);
        setShare(null);
      }
    } catch (caught) {
      const fallback = kind === "share" ? a.shareFailed : a.revokeFailed;
      setError(caught instanceof ApiProblem ? caught.message || fallback : fallback);
    } finally {
      setBusy(null);
    }
  };

  const shareUrl = share ? (share.url ?? `${origin}${share.path}`) : null;

  return (
    <section aria-label={a.heading} className="space-y-3 border border-hairline bg-panel p-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={download}
          className="bg-signal px-4 py-2 text-sm font-semibold text-on-signal transition-colors hover:bg-signal-soft"
        >
          {a.downloadZip}
        </button>
        {canShare && !share && (
          <button
            type="button"
            onClick={() => void run("share")}
            disabled={busy !== null}
            className="border border-hairline px-4 py-2 text-sm text-ink transition-colors hover:bg-panel-high disabled:opacity-60"
          >
            {busy === "share" ? a.sharing : a.share}
          </button>
        )}
        <p className="text-xs text-ink-muted">{a.downloadHint}</p>
      </div>

      {canShare && shareUrl && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <input
              readOnly
              value={shareUrl}
              aria-label={a.copyLink}
              onFocus={(event) => event.currentTarget.select()}
              className="min-w-0 flex-1 border border-hairline bg-room px-2 py-1.5 font-mono text-xs text-ink"
            />
            <CopyButton text={shareUrl} label={a.copyLink} className="border border-hairline px-3 py-1.5" />
            <button
              type="button"
              onClick={() => void run("revoke")}
              disabled={busy !== null}
              className="px-3 py-1.5 text-xs text-ink-muted transition-colors hover:text-ink disabled:opacity-60"
            >
              {busy === "revoke" ? a.revoking : a.revoke}
            </button>
          </div>
        </div>
      )}
      {canShare && <p className="text-xs text-ink-muted">{a.shareHint}</p>}
      {error && (
        <p role="alert" className="text-xs text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}
