import type { StyleAnalysis } from "@/lib/analysis-schema";
import type { AnalysisResource } from "@/lib/api/resources";
import type { SeriesAnalysis } from "@/lib/series-analysis-schema";
import type { SeriesAnalysisResponse } from "@/lib/series-api";
import { organizeSeries } from "@/lib/series-organize";

/*
 * Adapters from the API v1 `analysis` resource to the props the existing
 * report components expect, so the same views render live results, resumed
 * jobs and dashboard details.
 */

export function imageReportOf(analysis: AnalysisResource): StyleAnalysis | null {
  return analysis.type === "image" && analysis.status === "completed" && analysis.report
    ? (analysis.report as StyleAnalysis)
    : null;
}

export function seriesResultOf(analysis: AnalysisResource): SeriesAnalysisResponse | null {
  if (analysis.type !== "series" || analysis.status !== "completed" || !analysis.report) return null;
  const report = analysis.report as SeriesAnalysis;
  return {
    report,
    files: analysis.files,
    imageCount: analysis.imageCount,
    organization: analysis.organization ?? organizeSeries(report, analysis.files),
  };
}
