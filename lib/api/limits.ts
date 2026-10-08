import { MAX_SERIES_IMAGES } from "@/lib/series-analysis-schema";

/** Limits of the public API, also reported by `GET /api/v1/usage`. */
export const API_LIMITS = {
  creditsPerImage: 1,
  maxImagesPerAnalysis: MAX_SERIES_IMAGES,
  maxImageBytes: 10 * 1024 * 1024,
  maxTotalUploadBytes: 50 * 1024 * 1024,
  maxActiveAnalyses: Math.max(1, Number(process.env.API_MAX_ACTIVE_ANALYSES ?? 5)),
  maxActiveApiKeys: 10,
} as const;

/**
 * Per-user request budgets. Credits are the real cost guard for analyses;
 * these only stop floods and runaway scripts.
 */
export const API_RATE_LIMITS = {
  createAnalysis: { limit: Number(process.env.API_CREATE_RATE_LIMIT ?? 30), windowMs: 10 * 60 * 1000 },
  read: { limit: Number(process.env.API_READ_RATE_LIMIT ?? 300), windowMs: 60 * 1000 },
  write: { limit: 60, windowMs: 60 * 1000 },
} as const;
