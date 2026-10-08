"use client";

import { useEffect, useState } from "react";
import type { AnalysisResource } from "@/lib/api/resources";
import { stepsFor, type AnalysisStep } from "@/lib/analysis-steps";
import { useI18n } from "@/lib/i18n/client";

/*
 * Progress of one analysis, driven by the job state the API reports:
 * upload -> server start -> the Claude step(s) -> merge & save. A series
 * runs its three steps in parallel and each one is ticked off as the server
 * records it, so the list reflects real progress. Only the bar's movement
 * *within* a running step is estimated from typical durations.
 */

type StepState = "done" | "active" | "pending";

type AnalysisProgressProps = {
  /** null while the images are still being uploaded. */
  analysis: AnalysisResource | null;
  imageCount: number;
  /** Shown once the job runs on the server; stops watching, not the job. */
  onBackground?: () => void;
};

// Typical duration of the Claude step(s), measured on real runs; only used
// to let the bar creep forward while a step is running.
const EXPECTED_SECONDS = { image: 35, series: 50 } as const;

// Share of the bar per phase, in percent.
const WEIGHT = { upload: 10, queue: 5, steps: 80, finalize: 5 } as const;

export function AnalysisProgress({ analysis, imageCount, onBackground }: AnalysisProgressProps) {
  const { t } = useI18n();
  const labels = t.analysis.progress;
  const { now, mountedAt } = useClock();
  // Wall time since the analysis was created (or since this view opened).
  const createdAt = analysis ? Math.min(Date.parse(analysis.createdAt), mountedAt) : mountedAt;
  const elapsed = Math.max(0, Math.floor((now - createdAt) / 1000));

  const type = analysis?.type ?? (imageCount > 1 ? "series" : "image");
  const serverSteps = stepsFor(type);
  const completed = new Set<AnalysisStep>(analysis?.progress.completedSteps ?? []);
  const status = analysis?.status;
  const running = status === "running";
  const allStepsDone = serverSteps.every((step) => completed.has(step));

  const uploadState: StepState = analysis ? "done" : "active";
  const queueState: StepState = !analysis ? "pending" : status === "queued" ? "active" : "done";
  const stepState = (step: AnalysisStep): StepState =>
    completed.has(step) ? "done" : running ? "active" : "pending";
  const finalizeState: StepState = status === "completed" ? "done" : running && allStepsDone ? "active" : "pending";

  // Bar: finished phases count fully; running steps creep towards 90 % of
  // their share based on elapsed time, so the bar never stalls or overshoots.
  const stepShare = WEIGHT.steps / serverSteps.length;
  const sinceStart = analysis?.startedAt ? Math.max(0, (now - Date.parse(analysis.startedAt)) / 1000) : 0;
  const creep = Math.min(0.9, sinceStart / EXPECTED_SECONDS[type]);
  let percent = 0;
  if (uploadState === "done") percent += WEIGHT.upload;
  if (queueState === "done") percent += WEIGHT.queue;
  for (const step of serverSteps) {
    const state = stepState(step);
    percent += state === "done" ? stepShare : state === "active" ? stepShare * creep : 0;
  }
  if (finalizeState === "done") percent += WEIGHT.finalize;
  percent = Math.round(Math.min(percent, status === "completed" ? 100 : 99));

  return (
    <div className="w-full space-y-6">
      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm" role="status" aria-live="polite">
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-semibold uppercase tracking-wider text-violet-700">{labels.running}</p>
          <p className="font-mono text-sm text-stone-600">{elapsed}s</p>
        </div>

        <div
          className="mt-4 h-2 overflow-hidden rounded-full bg-stone-100"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-label={labels.running}
        >
          <div
            className="h-2 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-[width] duration-700 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>

        <ol className="mt-5 space-y-3">
          <Step state={uploadState} label={labels.steps.upload} />
          <Step state={queueState} label={labels.steps.queue} />
          {type === "series" ? (
            <li>
              <ol className="ml-3 space-y-3 border-l-2 border-dashed border-violet-100 pl-5" aria-label={labels.parallel}>
                {serverSteps.map((step) => (
                  <Step key={step} state={stepState(step)} label={labels.steps[step]} badge={labels.parallel} />
                ))}
              </ol>
            </li>
          ) : (
            <Step state={stepState("analysis")} label={labels.steps.analysis} />
          )}
          <Step state={finalizeState} label={labels.steps.finalize} />
        </ol>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-2 text-xs text-stone-500">
          <span>
            {labels.duration(imageCount)} · {labels.cost(imageCount)}
          </span>
          {analysis && onBackground && (
            <button type="button" onClick={onBackground} className="transition-colors hover:text-stone-900">
              {labels.background}
            </button>
          )}
        </div>
      </div>

      {type === "series" && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3" aria-hidden="true">
          {Array.from({ length: imageCount }, (_, i) => (
            <div key={i} className="animate-pulse space-y-2 rounded-xl border border-stone-200 bg-white p-3">
              <div className="aspect-[4/3] rounded-lg bg-stone-100" />
              <div className="h-3 w-2/3 rounded bg-stone-100" />
              <div className="h-3 w-1/3 rounded bg-stone-100" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Step({ state, label, badge }: { state: StepState; label: string; badge?: string }) {
  return (
    <li className="flex items-center gap-3 text-sm" data-state={state}>
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${
          state === "done"
            ? "bg-emerald-100 text-emerald-700"
            : state === "active"
              ? "bg-violet-100 text-violet-700"
              : "bg-stone-100 text-stone-400"
        }`}
        aria-hidden="true"
      >
        {state === "done" ? "✓" : state === "active" ? <Spinner /> : "·"}
      </span>
      <span className={state === "pending" ? "text-stone-500" : "text-stone-800"}>{label}</span>
      {badge && state === "active" && (
        <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] uppercase tracking-wider text-violet-600">
          {badge}
        </span>
      )}
    </li>
  );
}

function Spinner() {
  return <span className="h-3 w-3 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />;
}

/** Current time, ticking once per second, plus the time the view mounted. */
function useClock(): { now: number; mountedAt: number } {
  const [mountedAt] = useState(() => Date.now());
  const [now, setNow] = useState(mountedAt);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return { now, mountedAt };
}
