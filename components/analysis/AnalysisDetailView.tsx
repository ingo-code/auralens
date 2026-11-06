"use client";

import { useEffect } from "react";
import { AnalysisReport } from "@/components/AnalysisReport";
import { AnalysisProgress } from "@/components/analysis/AnalysisProgress";
import { AnalysisFailedNotice, RequestErrorNotice } from "@/components/analysis/JobNotices";
import { SeriesResults } from "@/components/series/SeriesResults";
import { ReportActions } from "@/components/exports/ReportActions";
import type { AnalysisResource } from "@/lib/api/resources";
import { imageReportOf, seriesResultOf } from "@/lib/analysis-view";
import { useAnalysisJob } from "@/lib/use-analysis-job";

/**
 * Report view for one stored analysis. Finished analyses render directly
 * from the server-loaded resource; running ones are polled live until done.
 */
export function AnalysisDetailView({ initial }: { initial: AnalysisResource }) {
  const job = useAnalysisJob();
  const { watch } = job;
  const finished = initial.status === "completed" || initial.status === "failed";

  useEffect(() => {
    if (!finished) void watch(initial);
  }, [finished, initial, watch]);

  const { state } = job;
  const analysis =
    state.phase === "processing" || state.phase === "completed" || state.phase === "failed" ? state.analysis : initial;

  if (state.phase === "error") return <RequestErrorNotice message={state.message} />;
  if (analysis.status === "failed") return <AnalysisFailedNotice analysis={analysis} />;
  if (analysis.status !== "completed") {
    return <AnalysisProgress analysis={analysis} imageCount={analysis.imageCount} />;
  }

  const series = seriesResultOf(analysis);
  const report = series ? null : imageReportOf(analysis);
  if (!series && !report) return null;
  return (
    <div className="space-y-6">
      <ReportActions analysis={analysis} canShare />
      {series ? <SeriesResults result={series} previewUrls={[]} /> : report && <AnalysisReport report={report} measurements={analysis.files[0]?.measurements} />}
    </div>
  );
}
