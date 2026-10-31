import { MAX_SERIES_IMAGES } from "@/lib/series-analysis-schema";

/** Limits of the public API, also reported by `GET /api/v1/usage`. */
export const API_LIMITS = {
  creditsPerImage: 1,
  maxImagesPerAnalysis: MAX_SERIES_IMAGES,
  maxImageBytes: 10 * 1024 * 1024,
  maxTotalUploadBytes: 50 * 1024 * 1024,
  maxActiveAnalyses: Math.max(1, Number(process.env.API_MAX_ACTIVE_ANALYSES ?? 5)),
  maxActiveApiKeys: 10,
  /**
   * Images all accounts together may analyze per day (Berlin time). Cost
   * guardrail against credit farming with many free accounts; 0 or less
   * disables it. Keep a hard monthly limit in the Anthropic Console as well.
   */
  dailyImageBudget: Number(process.env.API_DAILY_IMAGE_BUDGET ?? 200),
  /**
   * Cap on a direct multipart upload to POST /analyses, set by the host:
   * Vercel rejects request bodies over 4.5 MB before they reach the app.
   * Larger images go through POST /uploads. Null = no host cap.
   */
  maxDirectUploadBytes: process.env.VERCEL ? 4.5 * 1024 * 1024 : null,
} as const;

/**
 * Per-user request budgets. Credits are the real cost guard for analyses;
 * these only stop floods and runaway scripts.
 */
export const API_RATE_LIMITS = {
  createAnalysis: { limit: Number(process.env.API_CREATE_RATE_LIMIT ?? 30), windowMs: 10 * 60 * 1000 },
  read: { limit: Number(process.env.API_READ_RATE_LIMIT ?? 300), windowMs: 60 * 1000 },
  write: { limit: 60, windowMs: 60 * 1000 },
  /** Invite code checks per IP: enough for typos, useless for guessing. */
  inviteCheck: { limit: 10, windowMs: 10 * 60 * 1000 },
} as const;

/** The daily budget resets at midnight, Berlin time (same day boundary as the SQL function). */
export function secondsUntilBerlinMidnight(now = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const elapsed = value("hour") * 3600 + value("minute") * 60 + value("second");
  return Math.max(1, 24 * 3600 - elapsed);
}
