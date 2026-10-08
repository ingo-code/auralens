"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiProblem, pollAnalysis, startAnalysis } from "@/lib/api-client";
import type { AnalysisResource } from "@/lib/api/resources";
import { refreshCredits } from "@/lib/credits-store";
import { useI18n } from "@/lib/i18n/client";

/*
 * Drives one analysis through the public API v1 from the browser:
 * upload (202) -> poll every few seconds -> completed | failed.
 * The job runs on the server, so leaving or reloading the page doesn't stop
 * it; with `syncUrl` the job id is kept in `?analysis=` and picked up again.
 */

export type AnalysisJobState =
  | { phase: "idle" }
  | { phase: "uploading"; imageCount: number }
  /** Loading a job started earlier (reload, dashboard link). */
  | { phase: "resuming" }
  | { phase: "processing"; analysis: AnalysisResource }
  | { phase: "completed"; analysis: AnalysisResource }
  /** The analysis itself failed on the server (credits refunded). */
  | { phase: "failed"; analysis: AnalysisResource }
  /** A request failed (validation, credits, network) - nothing is running. */
  | { phase: "error"; message: string; code: ApiProblem["code"] | null }
  /** The user stopped watching; the analysis continues on the server. */
  | { phase: "detached"; analysisId: string };

type Options = {
  /** Keep the running job's id in `?analysis=` so a reload resumes it. */
  syncUrl?: boolean;
  pollIntervalMs?: number;
};

const URL_PARAM = "analysis";

function setUrlParam(id: string | null) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set(URL_PARAM, id);
  else url.searchParams.delete(URL_PARAM);
  window.history.replaceState(window.history.state, "", url);
}

/** Same files in the same order -> same idempotency key on a retry. */
function selectionSignature(files: File[]): string {
  return files.map((file) => `${file.name}:${file.size}:${file.lastModified}`).join("|");
}

export function useAnalysisJob({ syncUrl = false, pollIntervalMs }: Options = {}) {
  const { t } = useI18n();
  const [state, setState] = useState<AnalysisJobState>({ phase: "idle" });
  /** Detail of the 402 answer while the "credits exhausted" dialog is open. */
  const [creditsExhausted, setCreditsExhausted] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const attemptRef = useRef<{ signature: string; key: string } | null>(null);

  const stopPolling = () => {
    controllerRef.current?.abort();
    controllerRef.current = null;
  };

  const follow = useCallback(
    async (initial: AnalysisResource | { id: string }) => {
      stopPolling();
      const controller = new AbortController();
      controllerRef.current = controller;
      setState("status" in initial ? { phase: "processing", analysis: initial } : { phase: "resuming" });

      try {
        const final = await pollAnalysis(initial.id, t, {
          signal: controller.signal,
          intervalMs: pollIntervalMs,
          onUpdate: (analysis) => {
            if (analysis.status === "queued" || analysis.status === "running") {
              setState({ phase: "processing", analysis });
            }
          },
        });
        setState(final.status === "completed" ? { phase: "completed", analysis: final } : { phase: "failed", analysis: final });
        // Failed analyses are refunded - either way the balance changed.
        void refreshCredits();
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        const problem = error instanceof ApiProblem ? error : null;
        if (problem?.status === 404 && syncUrl) setUrlParam(null);
        setState({ phase: "error", message: problem?.message ?? t.home.unknownError, code: problem?.code ?? null });
      } finally {
        if (controllerRef.current === controller) controllerRef.current = null;
      }
    },
    [pollIntervalMs, syncUrl, t]
  );

  const start = useCallback(
    async (files: File[]) => {
      stopPolling();
      const signature = selectionSignature(files);
      if (attemptRef.current?.signature !== signature) {
        attemptRef.current = { signature, key: crypto.randomUUID() };
      }
      setState({ phase: "uploading", imageCount: files.length });

      const controller = new AbortController();
      controllerRef.current = controller;
      let queued: AnalysisResource;
      try {
        queued = await startAnalysis(files, t, { idempotencyKey: attemptRef.current.key, signal: controller.signal });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        const problem = error instanceof ApiProblem ? error : null;
        if (problem?.code === "insufficient_credits") {
          setCreditsExhausted(problem.message);
          setState({ phase: "idle" });
        } else {
          setState({ phase: "error", message: problem?.message ?? t.home.unknownError, code: problem?.code ?? null });
        }
        void refreshCredits();
        return;
      }

      // Accepted - a new selection must get a new key from now on.
      attemptRef.current = null;
      if (syncUrl) setUrlParam(queued.id);
      void refreshCredits();
      await follow(queued);
    },
    [follow, syncUrl, t]
  );

  /** Picks up an analysis started earlier (reload, dashboard link). */
  const resume = useCallback((id: string) => follow({ id }), [follow]);

  /** Follows an analysis already loaded elsewhere (e.g. server-rendered). */
  const watch = useCallback((analysis: AnalysisResource) => follow(analysis), [follow]);

  /** Stops watching without cancelling the server-side analysis. */
  const detach = useCallback(() => {
    stopPolling();
    setState((current) =>
      current.phase === "processing" ? { phase: "detached", analysisId: current.analysis.id } : current
    );
    if (syncUrl) setUrlParam(null);
  }, [syncUrl]);

  const reset = useCallback(() => {
    stopPolling();
    attemptRef.current = null;
    setState({ phase: "idle" });
    if (syncUrl) setUrlParam(null);
  }, [syncUrl]);

  // Resume a job from the URL once, and stop polling on unmount.
  useEffect(() => {
    if (syncUrl) {
      const id = new URL(window.location.href).searchParams.get(URL_PARAM);
      // Syncing from an external source (the URL) once on mount is what this
      // effect is for; `follow` then updates state as polls come in.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (id) void follow({ id });
    }
    return stopPolling;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run only on mount
  }, []);

  return {
    state,
    start,
    resume,
    watch,
    detach,
    reset,
    creditsExhausted,
    dismissCreditsExhausted: () => setCreditsExhausted(null),
  };
}
