import { z } from "zod";
import type { Messages } from "@/lib/i18n";
import { SeriesAnalysisSchema, SeriesImageFileSchema, type SeriesAnalysis, type SeriesImageFile } from "@/lib/series-analysis-schema";
import { OrganizeOptionsSchema, type SeriesOrganization } from "@/lib/series-organize";

/*
 * Public request/response contracts of the series API. See docs/API.md.
 */

/** A completed series analysis as the report views consume it (see lib/analysis-view.ts). */
export type SeriesAnalysisResponse = {
  report: SeriesAnalysis;
  imageCount: number;
  files: SeriesImageFile[];
  organization: SeriesOrganization;
};

/** Request body of POST /api/series/organize - a previous analysis plus view options. */
export const OrganizeRequestSchema = OrganizeOptionsSchema.extend({
  report: SeriesAnalysisSchema,
  files: z.array(SeriesImageFileSchema).min(1),
});

/** Response body of POST /api/series/organize on success. */
export type OrganizeResponse = {
  organization: SeriesOrganization;
};

/** Response body of every API route on failure. */
export type ApiErrorResponse = {
  error: string;
};

/** Turns the first zod issue into a short, user-facing message. */
export function describeValidationError(error: z.ZodError, t: Messages): string {
  const issue = error.issues[0];
  return t.errors.invalidParameter(issue.path.join("."), issue.message);
}
