import type { StyleAnalysis } from "@/lib/analysis-schema";
import { stepsFor, type AnalysisStep } from "@/lib/analysis-steps";
import type { AnalysisErrorCode, ErrorMessageKey } from "@/lib/claude/errors";
import type { Messages } from "@/lib/i18n";
import type { AnalysisJobRow, AnalysisStatus, AnalysisType, ApiKeyRow } from "@/lib/api/repository";
import type { SeriesAnalysis, SeriesImageFile } from "@/lib/series-analysis-schema";
import type { SeriesOrganization } from "@/lib/series-organize";

/*
 * Public JSON shapes of the API v1 resources. Field names are part of the
 * contract (see docs/API-v1.md) - add fields, never rename or remove.
 */

export type AnalysisResource = {
  object: "analysis";
  id: string;
  type: AnalysisType;
  status: AnalysisStatus;
  imageCount: number;
  credits: number;
  locale: string;
  files: SeriesImageFile[];
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  error: { code: AnalysisErrorCode; message: string } | null;
  /**
   * Processing steps and those already finished. A series runs its three
   * steps in parallel, so they can complete in any order.
   */
  progress: { steps: AnalysisStep[]; completedSteps: AnalysisStep[] };
  /** Only on single-resource responses, once `status` is "completed". */
  report?: StyleAnalysis | SeriesAnalysis | null;
  /** Only for completed series, arranged per `?sort=&order=&group=`. */
  organization?: SeriesOrganization;
};

export type ListResource<T> = {
  object: "list";
  data: T[];
  hasMore: boolean;
  nextCursor: string | null;
};

export type ApiKeyResource = {
  object: "api_key";
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
};

export type CreatedApiKeyResource = ApiKeyResource & {
  /** The full secret - only in this one response. */
  key: string;
};

export type UsageResource = {
  object: "usage";
  credits: { balance: number; costPerImage: number };
  limits: {
    maxImagesPerAnalysis: number;
    maxImageBytes: number;
    maxTotalUploadBytes: number;
    maxDirectUploadBytes: number | null;
    maxActiveAnalyses: number;
  };
};

/** Answer of POST /api/v1/uploads. */
export type UploadBatchResource = {
  object: "upload_batch";
  /** Objects not analyzed by then are deleted. */
  expiresAt: string;
  uploads: {
    index: number;
    name: string;
    path: string;
    /** PUT the raw file here with the given Content-Type. */
    uploadUrl: string;
    token: string;
    contentType: string;
  }[];
};

const ERROR_MESSAGES: Record<AnalysisErrorCode, ErrorMessageKey> = {
  content_refused: "refusal",
  analysis_truncated: "truncated",
  invalid_ai_response: "invalidAiResponse",
  image_not_processable: "imageNotProcessable",
  upstream_rate_limited: "claudeRateLimited",
  upstream_unavailable: "claudeUnavailable",
  processing_interrupted: "processingInterrupted",
  internal_error: "apiInternal",
};

export function toAnalysisResource(
  row: Omit<AnalysisJobRow, "report"> & { report?: AnalysisJobRow["report"] },
  t: Messages,
  extras: { includeReport?: boolean; organization?: SeriesOrganization } = {}
): AnalysisResource {
  const errorCode = row.error?.code;
  const resource: AnalysisResource = {
    object: "analysis",
    id: row.id,
    type: row.type,
    status: row.status,
    imageCount: row.image_count,
    credits: row.credits,
    locale: row.locale,
    files: row.files,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    error: errorCode ? { code: errorCode, message: t.errors[ERROR_MESSAGES[errorCode] ?? "apiInternal"] } : null,
    progress: {
      steps: [...stepsFor(row.type)],
      // A completed job has finished every step, also the single-image one
      // that never reports separately.
      completedSteps: row.status === "completed" ? [...stepsFor(row.type)] : (row.completed_steps ?? []),
    },
  };
  if (extras.includeReport) resource.report = row.report ?? null;
  if (extras.organization) resource.organization = extras.organization;
  return resource;
}

export function toApiKeyResource(row: ApiKeyRow): ApiKeyResource {
  return {
    object: "api_key",
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    scopes: row.scopes,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  };
}
