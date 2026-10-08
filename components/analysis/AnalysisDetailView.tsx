"use client";

import { useEffect } from "react";
import { AnalysisReport } from "@/components/AnalysisReport";
import { AnalysisProgress } from "@/components/analysis/AnalysisProgress";
import { AnalysisFailedNotice, RequestErrorNotice } from "@/components/analysis/JobNotices";
import { SeriesResults } from "@/components/series/SeriesResults";
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
  if (series) return <SeriesResults result={series} previewUrls={[]} />;
  const report = imageReportOf(analysis);
  return report ? <AnalysisReport report={report} /> : null;
}
