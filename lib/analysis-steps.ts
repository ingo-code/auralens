/*
 * Processing steps of an analysis, as reported in `analysis.progress`.
 * Shared by the job runner (server) and the progress display (browser).
 * Part of the public API - only add steps, never rename them.
 */

/** The three parallel Claude requests of a series analysis. */
export const SERIES_STEPS = ["consistency", "market", "prompts"] as const;
/** A single-image analysis is one Claude request. */
export const IMAGE_STEPS = ["analysis"] as const;

export type SeriesStep = (typeof SERIES_STEPS)[number];
export type AnalysisStep = SeriesStep | (typeof IMAGE_STEPS)[number];

export function stepsFor(type: "image" | "series"): readonly AnalysisStep[] {
  return type === "series" ? SERIES_STEPS : IMAGE_STEPS;
}
