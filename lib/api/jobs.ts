import { runInBackground } from "@/lib/api/background";
import { completeJob, completeStep, failJob, markJobRunning, type AnalysisType } from "@/lib/api/repository";
import type { SeriesStep } from "@/lib/analysis-steps";
import { mapAnalysisError } from "@/lib/claude/errors";
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

export type QueuedJob = { id: string; type: AnalysisType; locale: string };

/** Schedules the analysis; the caller has already answered 202. */
export function enqueueAnalysis(job: QueuedJob, images: ProcessedImage[]): void {
  runInBackground(() => processAnalysis(job, images));
}

/** Exported for tests; never throws. */
export async function processAnalysis(job: QueuedJob, images: ProcessedImage[]): Promise<void> {
  const locale = isLocale(job.locale) ? job.locale : DEFAULT_LOCALE;
  const startedAt = Date.now();

  await acquireSlot();
  try {
    // False if the job was deleted while waiting - nothing to do then.
    if (!(await markJobRunning(job.id))) return;

    // Progress is cosmetic - a failed update must never fail the analysis.
    const recordStep = (step: SeriesStep) => {
      completeStep(job.id, step).catch((error: unknown) =>
        console.error(`[api-job] id=${job.id} Fortschritt ${step} nicht speicherbar:`, error)
      );
    };
    const report =
      job.type === "image" ? await analyzeImage(images[0], locale) : await analyzeSeries(images, locale, recordStep);

    const stored = await completeJob(job.id, report);
    console.info(
      `[api-job] id=${job.id} type=${job.type} images=${images.length} status=completed ` +
        `ms=${Date.now() - startedAt}${stored ? "" : " (job vanished, report dropped)"}`
    );
  } catch (error) {
    const { code } = mapAnalysisError(error, getMessages(locale));
    console.error(`[api-job] id=${job.id} type=${job.type} status=failed code=${code}`);
    try {
      await failJob(job.id, code);
    } catch (failError) {
      // The stale-job sweep will still fail and refund it later.
      console.error(`[api-job] id=${job.id} Fehlerstatus nicht speicherbar:`, failError);
    }
  } finally {
    releaseSlot();
  }
}
