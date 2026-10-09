"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnalysisProgress } from "@/components/analysis/AnalysisProgress";
import { CreditsExhaustedDialog } from "@/components/analysis/CreditsExhaustedDialog";
import {
  AnalysisFailedNotice,
  DetachedNotice,
  RequestErrorNotice,
  SignInPrompt,
} from "@/components/analysis/JobNotices";
import { AuthStatus } from "@/components/AuthStatus";
import { UploadNotice } from "@/components/legal/UploadNotice";
import { SeriesResults } from "@/components/series/SeriesResults";
import { SeriesUploader, type SelectedImage } from "@/components/series/SeriesUploader";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { seriesResultOf } from "@/lib/analysis-view";
import { useCredits } from "@/lib/credits-store";
import { useI18n } from "@/lib/i18n/client";
import { MAX_SERIES_IMAGES } from "@/lib/series-analysis-schema";
import { validateSeriesSelection } from "@/lib/series-client";
import { useAnalysisJob } from "@/lib/use-analysis-job";

export default function SeriesPage() {
  const { t } = useI18n();
  const credits = useCredits();
  const job = useAnalysisJob({ syncUrl: true });
  const { state } = job;
  const [images, setImages] = useState<SelectedImage[]>([]);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const imagesRef = useRef(images);

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  // Release preview object URLs when leaving the page. The analysis itself
  // keeps running on the server and can be resumed via `?analysis=`.
  useEffect(() => () => imagesRef.current.forEach((image) => URL.revokeObjectURL(image.previewUrl)), []);

  const addFiles = (files: File[]) => {
    setSelectionError(null);
    setImages((current) => {
      const room = MAX_SERIES_IMAGES - current.length;
      if (files.length > room) setSelectionError(t.series.tooManyIgnored(MAX_SERIES_IMAGES, files.length - room));
      const added = files.slice(0, Math.max(room, 0)).map((file) => ({ file, previewUrl: URL.createObjectURL(file) }));
      return [...current, ...added];
    });
  };

  const removeImage = (index: number) => {
    setImages((current) => {
      URL.revokeObjectURL(current[index].previewUrl);
      return current.filter((_, i) => i !== index);
    });
  };

  const startAnalysis = () => {
    const files = images.map((image) => image.file);
    const validationError = validateSeriesSelection(files, t);
    if (validationError) {
      setSelectionError(validationError);
      return;
    }
    setSelectionError(null);
    void job.start(files);
  };

  const reset = () => {
    images.forEach((image) => URL.revokeObjectURL(image.previewUrl));
    setImages([]);
    setSelectionError(null);
    job.reset();
  };

  const result = state.phase === "completed" ? seriesResultOf(state.analysis) : null;
  const running = state.phase === "uploading" || state.phase === "processing";
  // Previews only exist for images selected in this browser session.
  const previewUrls = images.map((image) => image.previewUrl);

  return (
    <div className="flex min-h-screen flex-col text-stone-900">
      <nav className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 pt-6 text-sm">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          Aura<span className="bg-gradient-to-r from-violet-600 to-fuchsia-500 bg-clip-text text-transparent">Lens</span>
        </Link>
        <div className="flex items-center gap-6">
          <Link href="/" className="text-stone-600 transition-colors hover:text-stone-900">
            {t.nav.singleAnalysis}
          </Link>
          <AuthStatus />
          <LanguageSwitcher />
        </div>
      </nav>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-10">
        {!result && (
          <header>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t.series.title}</h1>
            <p className="mt-2 max-w-2xl text-stone-600">{t.series.intro(MAX_SERIES_IMAGES)}</p>
          </header>
        )}

        {running ? (
          <AnalysisProgress
            analysis={state.phase === "processing" ? state.analysis : null}
            imageCount={state.phase === "processing" ? state.analysis.imageCount : state.imageCount}
            onBackground={job.detach}
          />
        ) : state.phase === "resuming" ? (
          <p role="status" className="flex items-center gap-2 text-sm text-stone-600">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
            {t.analysis.progress.resuming}
          </p>
        ) : result ? (
          <>
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-medium text-emerald-700">
                {t.home.done} · {t.analysis.saved}
              </p>
              <button type="button" onClick={reset} className="rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-stone-700">
                {t.series.newSeries}
              </button>
            </div>
            <SeriesResults result={result} previewUrls={previewUrls} />
          </>
        ) : state.phase === "detached" ? (
          <>
            <DetachedNotice analysisId={state.analysisId} />
            <button type="button" onClick={reset} className="self-start text-sm text-stone-500 hover:text-stone-900">
              {t.series.newSeries}
            </button>
          </>
        ) : credits.status === "signed-out" ? (
          <SignInPrompt />
        ) : (
          <>
            <SeriesUploader images={images} onAdd={addFiles} onRemove={removeImage} />
            <UploadNotice />
            {state.phase === "failed" && (
              <AnalysisFailedNotice analysis={state.analysis} onRetry={images.length >= 2 ? startAnalysis : undefined} />
            )}
            {state.phase === "error" && <RequestErrorNotice message={state.message} />}
            {selectionError && <RequestErrorNotice message={selectionError} />}
            <div className="flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={startAnalysis}
                disabled={images.length < 2 || credits.status === "loading"}
                className="rounded-xl px-5 py-2.5 text-sm font-medium bg-gradient-to-r from-violet-600 to-fuchsia-500 text-white shadow-md shadow-violet-500/20 transition hover:brightness-110 disabled:cursor-not-allowed disabled:from-stone-200 disabled:to-stone-200 disabled:text-stone-400 disabled:shadow-none"
              >
                {images.length < 2 ? t.series.selectAtLeastTwo : t.series.analyzeN(images.length)}
              </button>
              {images.length >= 2 && (
                <span className="text-xs text-stone-500">{t.analysis.progress.cost(images.length)}</span>
              )}
              {images.length > 0 && (
                <button type="button" onClick={reset} className="text-sm text-stone-500 hover:text-stone-900">
                  {t.series.removeAll}
                </button>
              )}
            </div>
          </>
        )}
      </main>

      {job.creditsExhausted && (
        <CreditsExhaustedDialog detail={job.creditsExhausted} onClose={job.dismissCreditsExhausted} />
      )}
    </div>
  );
}
