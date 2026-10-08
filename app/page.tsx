"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ImageDropzone } from "@/components/ImageDropzone";
import { AnalysisReport } from "@/components/AnalysisReport";
import { AuthStatus } from "@/components/AuthStatus";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { AnalysisProgress } from "@/components/analysis/AnalysisProgress";
import { CreditsExhaustedDialog } from "@/components/analysis/CreditsExhaustedDialog";
import {
  AnalysisFailedNotice,
  DetachedNotice,
  RequestErrorNotice,
  SignInPrompt,
} from "@/components/analysis/JobNotices";
import { imageReportOf } from "@/lib/analysis-view";
import { useCredits } from "@/lib/credits-store";
import { useI18n } from "@/lib/i18n/client";
import { useAnalysisJob } from "@/lib/use-analysis-job";

export default function Home() {
  const { t } = useI18n();
  const credits = useCredits();
  const job = useAnalysisJob({ syncUrl: true });
  const { state } = job;
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);

  const busy = state.phase === "uploading" || state.phase === "processing" || state.phase === "resuming";

  // Release the preview's object URL when leaving the page.
  const previewRef = useRef<string | null>(null);
  useEffect(() => {
    previewRef.current = previewUrl;
  }, [previewUrl]);
  useEffect(
    () => () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    },
    []
  );

  const analyzeImage = useCallback(
    (selected: File) => {
      setFile(selected);
      setPreviewUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return URL.createObjectURL(selected);
      });
      void job.start([selected]);
    },
    [job]
  );

  const reset = () => {
    job.reset();
    setFile(null);
    setPreviewUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return null;
    });
  };

  const report = state.phase === "completed" ? imageReportOf(state.analysis) : null;
  const retry = file ? () => analyzeImage(file) : undefined;

  return (
    <div className="flex min-h-screen flex-col">
      <nav className="mx-auto flex w-full max-w-5xl items-center justify-between gap-6 px-6 pt-6">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          Aura<span className="bg-gradient-to-r from-violet-600 to-fuchsia-500 bg-clip-text text-transparent">Lens</span>
        </Link>
        <div className="flex items-center gap-6">
          <Link
            href="/serie"
            className="rounded-full border border-violet-200 bg-white/70 px-4 py-1.5 text-sm font-medium text-violet-700 shadow-sm backdrop-blur transition-colors hover:border-violet-300 hover:bg-violet-50"
          >
            {t.nav.seriesAnalysis}
          </Link>
          <AuthStatus />
          <LanguageSwitcher />
        </div>
      </nav>

      <header className="mx-auto w-full max-w-4xl px-6 pt-14 text-center sm:pt-20">
        <p className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white/70 px-3 py-1 text-xs font-medium text-stone-600 shadow-sm backdrop-blur">
          <span className="h-1.5 w-1.5 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500" />
          {t.home.badge}
        </p>
        <h1 className="mt-6 text-4xl font-semibold tracking-tight text-balance text-stone-900 sm:text-6xl">
          {t.home.titleBefore}{" "}
          <span className="bg-gradient-to-r from-violet-600 via-fuchsia-500 to-amber-500 bg-clip-text text-transparent">
            {t.home.titleHighlight}
          </span>{" "}
          {t.home.titleAfter}
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-balance text-lg text-stone-600">
          {t.home.intro}
        </p>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center gap-8 px-6 py-12">
        {credits.status === "signed-out" ? (
          <SignInPrompt />
        ) : (
          <ImageDropzone onFileSelected={analyzeImage} disabled={busy || credits.status === "loading"} />
        )}

        {(previewUrl || state.phase !== "idle") && (
          <div className="flex w-full items-center gap-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
            {previewUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- Objekt-URL einer lokalen Datei, kein optimierbares Remote-Bild
              <img
                src={previewUrl}
                alt={t.home.previewAlt}
                className="h-20 w-20 rounded-xl object-cover ring-1 ring-stone-200"
              />
            )}
            <div className="min-w-0 flex-1">
              {busy && (
                <p className="flex items-center gap-2 text-sm text-stone-600">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
                  {state.phase === "resuming" ? t.analysis.progress.resuming : t.home.analyzing}
                </p>
              )}
              {state.phase === "completed" && (
                <p className="text-sm font-medium text-emerald-700">
                  {t.home.done} · {t.analysis.saved}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={reset}
              className="shrink-0 rounded-full px-3 py-1.5 text-sm text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-800"
            >
              {t.common.reset}
            </button>
          </div>
        )}

        {(state.phase === "uploading" || state.phase === "processing") && (
          <AnalysisProgress
            analysis={state.phase === "processing" ? state.analysis : null}
            imageCount={1}
            onBackground={job.detach}
          />
        )}
        {state.phase === "failed" && <AnalysisFailedNotice analysis={state.analysis} onRetry={retry} />}
        {state.phase === "error" && <RequestErrorNotice message={state.message} />}
        {state.phase === "detached" && <DetachedNotice analysisId={state.analysisId} />}
        {report && <AnalysisReport report={report} />}
      </main>

      <footer className="mx-auto w-full max-w-3xl px-6 pb-10 text-center text-xs text-stone-400">
        {t.home.footer}
      </footer>

      {job.creditsExhausted && (
        <CreditsExhaustedDialog detail={job.creditsExhausted} onClose={job.dismissCreditsExhausted} />
      )}
    </div>
  );
}
