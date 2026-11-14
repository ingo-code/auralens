import { runInBackground } from "@/lib/api/background";
import {
  completeJob,
  completeStep,
  failJob,
  markJobRunning,
  saveJobUsage,
  type AnalysisType,
} from "@/lib/api/repository";
import type { SeriesStep } from "@/lib/analysis-steps";
import { mapAnalysisError, type AnalysisErrorCode } from "@/lib/claude/errors";
import type { ClaudeUsageEntry } from "@/lib/claude/usage";
import { getMessages } from "@/lib/i18n";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/config";
import type { ProcessedImage } from "@/lib/image-processing";
import { analyzeImage } from "@/lib/services/image-analysis";
import { analyzeSeries } from "@/lib/services/series-analysis";

/*
 * Analysis jobs run in the web server process, after the 202 response. A
 * small semaphore caps how many run at once, so a burst of API requests
 * queues up instead of firing dozens of parallel Claude calls. Jobs lost to
 * a restart are failed and refunded by `fail_stale_analysis_jobs`.
 */

const MAX_CONCURRENT_JOBS = Math.max(1, Number(process.env.API_JOB_CONCURRENCY ?? 4));

let running = 0;
const waiting: (() => void)[] = [];

async function acquireSlot(): Promise<void> {
  if (running < MAX_CONCURRENT_JOBS) {
    running += 1;
    return;
  }
  // The releasing job hands its slot over directly, so `running` stays put.
  await new Promise<void>((resolve) => waiting.push(resolve));
}

function releaseSlot(): void {
  const next = waiting.shift();
  if (next) next();
  else running -= 1;
}

/*
 * Hard deadline for one analysis, counted from the start of the request.
 * On Vercel the whole function (upload, image processing, Claude, saving)
 * is killed at `maxDuration` (300 s) - then the catch below never runs and
 * the credits only come back with the stale-job sweep minutes later. Aborting
 * a bit earlier fails the job cleanly and refunds at once.
 */
export const ANALYSIS_DEADLINE_MS = Math.max(10_000, Number(process.env.API_ANALYSIS_DEADLINE_MS ?? 270_000));

export type QueuedJob = {
  id: string;
  type: AnalysisType;
  locale: string;
  /** Epoch ms after which the analysis is aborted; default: ANALYSIS_DEADLINE_MS from now. */
  deadlineAt?: number;
};

/** Schedules the analysis; the caller has already answered 202. */
export function enqueueAnalysis(job: QueuedJob, images: ProcessedImage[]): void {
  runInBackground(() => processAnalysis(job, images));
}

/** Best effort: missing cost data must never fail or block an analysis. */
async function storeUsage(jobId: string, parts: ClaudeUsageEntry[]): Promise<void> {
  if (parts.length === 0) return;
  try {
    await saveJobUsage(jobId, { parts });
  } catch (error) {
    console.error(`[api-job] id=${jobId} Token-Verbrauch nicht speicherbar:`, error);
  }
}

/** Exported for tests; never throws. */
export async function processAnalysis(job: QueuedJob, images: ProcessedImage[]): Promise<void> {
  const locale = isLocale(job.locale) ? job.locale : DEFAULT_LOCALE;
  const startedAt = Date.now();
  const deadlineAt = job.deadlineAt ?? startedAt + ANALYSIS_DEADLINE_MS;
  const usage: ClaudeUsageEntry[] = [];
  let deadline: AbortSignal | undefined;

  await acquireSlot();
  try {
    // False if the job was deleted while waiting - nothing to do then.
    if (!(await markJobRunning(job.id))) return;

    // Time spent waiting for a slot counts against the deadline as well.
    deadline = AbortSignal.timeout(Math.max(1, deadlineAt - Date.now()));
    const options = { signal: deadline, onUsage: (entry: ClaudeUsageEntry) => usage.push(entry) };

    // Progress is cosmetic - a failed update must never fail the analysis.
    const recordStep = (step: SeriesStep) => {
      completeStep(job.id, step).catch((error: unknown) =>
        console.error(`[api-job] id=${job.id} Fortschritt ${step} nicht speicherbar:`, error)
      );
    };
    const report =
      job.type === "image"
        ? await analyzeImage(images[0], locale, options)
        : await analyzeSeries(images, locale, recordStep, options);

    const stored = await completeJob(job.id, report);
    await storeUsage(job.id, usage);
    console.info(
      `[api-job] id=${job.id} type=${job.type} images=${images.length} status=completed ` +
        `ms=${Date.now() - startedAt}${stored ? "" : " (job vanished, report dropped)"}`
    );
  } catch (error) {
    const timedOut = deadline?.aborted === true;
    const code: AnalysisErrorCode = timedOut ? "processing_interrupted" : mapAnalysisError(error, getMessages(locale)).code;
    console.error(
      `[api-job] id=${job.id} type=${job.type} status=failed code=${code} ms=${Date.now() - startedAt}` +
        (timedOut ? " (Zeitlimit erreicht)" : "")
    );
    try {
      await failJob(job.id, code);
    } catch (failError) {
      // The stale-job sweep will still fail and refund it later.
      console.error(`[api-job] id=${job.id} Fehlerstatus nicht speicherbar:`, failError);
    }
    // Failed runs cost money too - keep what the finished parts used.
    await storeUsage(job.id, usage);
  } finally {
    releaseSlot();
  }
}
