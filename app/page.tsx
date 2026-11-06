"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ImageDropzone } from "@/components/ImageDropzone";
import { AnalysisReport } from "@/components/AnalysisReport";
import { ReportActions } from "@/components/exports/ReportActions";
import { SiteHeader } from "@/components/SiteHeader";
import { UploadNotice } from "@/components/legal/UploadNotice";
import { AnalysisProgress } from "@/components/analysis/AnalysisProgress";
import { CreditsExhaustedDialog } from "@/components/analysis/CreditsExhaustedDialog";
import {
  AnalysisFailedNotice,
  DetachedNotice,
  RequestErrorNotice,
  SignInPrompt,
} from "@/components/analysis/JobNotices";
import { CopyButton } from "@/components/series/CopyButton";
import { SeriesResults } from "@/components/series/SeriesResults";
import { imageReportOf, seriesResultOf } from "@/lib/analysis-view";
import { useCredits } from "@/lib/credits-store";
import { useI18n } from "@/lib/i18n/client";
import { validateSeriesSelection } from "@/lib/series-client";
import { useAnalysisJob } from "@/lib/use-analysis-job";

/*
 * Landing page in the "calibrated darkroom" look. Everything shown in the
 * sample sections is clearly labelled as an example; the upload zone at the
 * bottom is the real tool (1 image = single analysis, 2-10 = series).
 *
 * Photos live in /public/landing/ (exported from the Stitch project).
 */
const PHOTOS = {
  wedding: "/landing/hochzeit.jpg",
  forest: "/landing/wald.jpg",
  ceramic: "/landing/keramik.png",
};

const DEMO_FRAMES = [
  { score: 94, position: "object-center" },
  { score: 91, position: "object-top" },
  { score: 58, position: "object-right", outlier: true },
  { score: 92, position: "object-bottom" },
  { score: 89, position: "object-left" },
  { score: 90, position: "object-center" },
];

const PALETTE = ["#1A2621", "#283830", "#475A4E", "#7E8B83", "#C2C9C3"];

const PLATFORMS = ["Midjourney V8.2", "FLUX.2 / FLUX 3 + SDXL", "Adobe Firefly Image 5", "ChatGPT Images 2.5"];

/** Simulates the too-warm outlier of the sample series. */
const WARM_CAST = "sepia(0.35) saturate(1.35) hue-rotate(-12deg)";

function Photo({ src, alt, className = "", sizes, style }: { src: string; alt: string; className?: string; sizes: string; style?: React.CSSProperties }) {
  return <Image src={src} alt={alt} fill sizes={sizes} className={`object-cover ${className}`} style={style} />;
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-signal-soft">
      <span className="inline-block h-2 w-2 bg-signal" aria-hidden="true" />
      {children}
    </span>
  );
}

function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border border-hairline bg-panel px-3 py-2 font-mono text-[11px]">
      <span className="text-ink-muted">{label}</span>
      <span className="text-right font-semibold text-ink">{value}</span>
    </div>
  );
}

export default function Home() {
  const { t } = useI18n();
  const credits = useCredits();
  const job = useAnalysisJob({ syncUrl: true });
  const { state } = job;
  const [files, setFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const workspaceRef = useRef<HTMLElement>(null);

  const busy = state.phase === "uploading" || state.phase === "processing" || state.phase === "resuming";
  const workspaceActive = state.phase !== "idle" || selectionError !== null;

  // Release preview object URLs when leaving the page.
  const previewsRef = useRef<string[]>([]);
  useEffect(() => {
    previewsRef.current = previewUrls;
  }, [previewUrls]);
  useEffect(() => () => previewsRef.current.forEach((url) => URL.revokeObjectURL(url)), []);

  // Bring the running analysis into view once it starts.
  const wasActive = useRef(false);
  useEffect(() => {
    if (workspaceActive && !wasActive.current) {
      workspaceRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    wasActive.current = workspaceActive;
  }, [workspaceActive]);

  const replacePreviews = (next: File[]) => {
    setPreviewUrls((previous) => {
      previous.forEach((url) => URL.revokeObjectURL(url));
      return next.map((file) => URL.createObjectURL(file));
    });
  };

  const analyze = useCallback(
    (selected: File[]) => {
      if (selected.length > 1) {
        const error = validateSeriesSelection(selected, t);
        if (error) {
          setSelectionError(error);
          return;
        }
      }
      setSelectionError(null);
      setFiles(selected);
      replacePreviews(selected);
      void job.start(selected);
    },
    [job, t]
  );

  const reset = () => {
    job.reset();
    setFiles([]);
    setSelectionError(null);
    replacePreviews([]);
  };

  const imageReport = state.phase === "completed" ? imageReportOf(state.analysis) : null;
  const seriesResult = state.phase === "completed" ? seriesResultOf(state.analysis) : null;
  const imageCount =
    state.phase === "processing" ? state.analysis.imageCount : state.phase === "uploading" ? state.imageCount : files.length;
  const retry = files.length > 0 ? () => analyze(files) : undefined;

  const uploadZone =
    credits.status === "signed-out" ? (
      <SignInPrompt />
    ) : (
      <>
        <ImageDropzone
          multiple
          onFilesSelected={analyze}
          disabled={busy || credits.status === "loading"}
          title={t.home.uploadTitle}
          hint={t.home.uploadHint}
          buttonLabel={t.home.uploadButton}
        />
        <UploadNotice />
      </>
    );

  return (
    <div className="flex min-h-screen flex-col bg-room text-ink">
      <SiteHeader />

      {/* Status ticker */}
      <section className="border-b border-hairline bg-room-deep px-4 py-1.5 sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-muted">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {t.home.ticker.map((item, i) => (
              <span key={item} className={`flex items-center gap-3 ${i === 2 ? "hidden md:flex" : ""}`}>
                {i > 0 && <span className="text-stone-300">/</span>}
                {i === 0 && <span className="inline-block h-1.5 w-1.5 bg-signal motion-safe:animate-pulse" aria-hidden="true" />}
                <span className={i === 0 ? "text-signal-soft" : ""}>{item}</span>
              </span>
            ))}
          </div>
          <span className="bg-panel-high px-1.5 py-0.5 text-ink">{t.home.tickerBeta}</span>
        </div>
      </section>

      {/* Hero */}
      <section className="px-4 pb-6 pt-12 sm:px-8 sm:pt-16">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-8 xl:flex-row xl:items-end">
          <div className="max-w-3xl">
            <div className="mb-5 border border-hairline bg-panel px-2 py-1">
              <Eyebrow>{t.home.eyebrow}</Eyebrow>
            </div>
            <h1 className="mb-5 text-balance text-4xl leading-[1.06] text-ink sm:text-5xl lg:text-6xl">{t.home.title}</h1>
            <p className="max-w-2xl text-[15px] leading-relaxed text-ink-muted">{t.home.intro}</p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-3">
            <a
              href="#analyse"
              className="bg-signal px-6 py-3.5 text-sm font-semibold uppercase tracking-wide text-on-signal shadow-black/40 transition-colors hover:bg-signal-soft"
            >
              {t.home.ctaAnalyze}
            </a>
            <a
              href="#funktionen"
              className="border border-stone-300 bg-panel-high px-6 py-3.5 text-sm font-semibold text-ink transition-colors hover:bg-stone-300"
            >
              {t.home.ctaHow}
            </a>
          </div>
        </div>
      </section>

      {/* Workspace: appears once an analysis runs or a result is shown */}
      {workspaceActive && (
        <section ref={workspaceRef} id="analyse" className="scroll-mt-20 px-4 py-6 sm:px-8">
          <div className="mx-auto flex max-w-5xl flex-col gap-6">
            {previewUrls.length > 0 && (
              <div className="flex flex-wrap items-center gap-4 border border-hairline bg-panel p-3">
                <div className="flex flex-wrap gap-2">
                  {previewUrls.map((url, i) => (
                    // eslint-disable-next-line @next/next/no-img-element -- object URL of a local file, nothing to optimize
                    <img
                      key={url}
                      src={url}
                      alt={previewUrls.length > 1 ? t.home.seriesPreviewAlt(i + 1) : t.home.previewAlt}
                      className="h-16 w-16 object-cover ring-1 ring-stone-300"
                    />
                  ))}
                </div>
                <div className="min-w-0 flex-1 font-mono text-xs">
                  {busy && (
                    <p className="flex items-center gap-2 text-ink-muted">
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-signal border-t-transparent" />
                      {state.phase === "resuming"
                        ? t.analysis.progress.resuming
                        : imageCount > 1
                          ? t.home.analyzingSeries(imageCount)
                          : t.home.analyzing}
                    </p>
                  )}
                  {state.phase === "completed" && (
                    <p className="font-medium text-emerald-700">
                      {t.home.done} · {t.analysis.saved}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={reset}
                  className="shrink-0 border border-stone-300 px-3 py-1.5 text-sm text-ink-muted transition-colors hover:bg-panel-high hover:text-ink"
                >
                  {t.home.newAnalysis}
                </button>
              </div>
            )}

            {state.phase === "resuming" && previewUrls.length === 0 && (
              <p role="status" className="flex items-center gap-2 text-sm text-ink-muted">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-signal border-t-transparent" />
                {t.analysis.progress.resuming}
              </p>
            )}

            {(state.phase === "uploading" || state.phase === "processing") && (
              <AnalysisProgress
                analysis={state.phase === "processing" ? state.analysis : null}
                imageCount={Math.max(imageCount, 1)}
                onBackground={job.detach}
              />
            )}
            {state.phase === "failed" && <AnalysisFailedNotice analysis={state.analysis} onRetry={retry} />}
            {state.phase === "error" && <RequestErrorNotice message={state.message} />}
            {state.phase === "detached" && <DetachedNotice analysisId={state.analysisId} />}
            {state.phase === "completed" && (imageReport || seriesResult) && (
              <ReportActions analysis={state.analysis} canShare />
            )}
            {imageReport && <AnalysisReport report={imageReport} previewUrl={previewUrls[0]} measurements={state.phase === "completed" ? state.analysis.files[0]?.measurements : undefined} />}
            {seriesResult && <SeriesResults result={seriesResult} previewUrls={previewUrls} />}

            {(selectionError || state.phase === "failed" || state.phase === "error" || state.phase === "detached") && (
              <>
                {selectionError && <RequestErrorNotice message={selectionError} />}
                {uploadZone}
              </>
            )}
            {(state.phase === "completed" || state.phase === "detached") && previewUrls.length === 0 && (
              <button type="button" onClick={reset} className="self-start text-sm text-ink-muted hover:text-ink">
                {t.home.newAnalysis}
              </button>
            )}
          </div>
        </section>
      )}

      {!workspaceActive && (
        <>
          {/* Light table: sample report */}
          <section className="px-4 py-6 sm:px-8" aria-label={t.home.demoLabel}>
            <div className="mx-auto flex max-w-7xl flex-col gap-4 border border-hairline bg-room-deep p-2 sm:p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline pb-2 font-mono text-[10px] uppercase tracking-wider">
                <span className="flex items-center gap-2 text-ink-muted">
                  <span className="inline-block h-2.5 w-2.5 bg-signal" aria-hidden="true" />
                  {t.home.demoLabel}
                </span>
                <span className="border border-signal/50 px-1.5 py-0.5 text-signal-soft">{t.home.demoBadge}</span>
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                {/* Hero frame + contact strip */}
                <div className="flex flex-col gap-2 lg:col-span-8">
                  <div className="relative aspect-[16/10] w-full overflow-hidden bg-panel sm:aspect-[16/9]">
                    <Photo src={PHOTOS.wedding} alt={t.home.exampleImage} sizes="(min-width: 1024px) 60vw, 100vw" />
                    <div className="pointer-events-none absolute inset-0 border border-[#ffffff]/10" />
                    <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-[#ffffff]/10" />
                    <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-[#ffffff]/10" />
                    <div className="absolute left-3 top-3 flex items-center gap-2 border border-hairline bg-room-deep/95 p-2 font-mono text-[10px]">
                      <span className="h-2 w-2 bg-signal" aria-hidden="true" />
                      <div>
                        <div className="font-bold uppercase tracking-wider text-ink">{t.home.demoAnchor}</div>
                        <div className="text-ink-muted">{t.home.demoAnchorSub}</div>
                      </div>
                    </div>
                    <div className="absolute inset-x-3 bottom-3 flex flex-wrap items-center justify-between gap-2 border border-hairline bg-room-deep/90 px-2 py-1.5 font-mono text-[10px] uppercase">
                      <span className="font-bold text-signal-soft">{t.home.demoSummary}</span>
                      <span className="text-ink-muted">{t.home.demoOutlierCount}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
                    {DEMO_FRAMES.map((frame, i) => (
                      <div
                        key={i}
                        className={`flex flex-col gap-1 p-1 ${
                          frame.outlier ? "border-2 border-signal bg-panel-high" : "border border-hairline bg-panel"
                        }`}
                      >
                        <div className="relative aspect-[3/2] overflow-hidden bg-panel-high">
                          <Photo
                            src={PHOTOS.wedding}
                            alt={t.common.image(i + 1)}
                            sizes="160px"
                            className={frame.position}
                            style={frame.outlier ? { filter: WARM_CAST } : undefined}
                          />
                          {frame.outlier && (
                            <span className="absolute right-0 top-0 bg-signal px-1 font-mono text-[8px] font-bold text-on-signal">!</span>
                          )}
                        </div>
                        <div className={`flex justify-between font-mono text-[9px] ${frame.outlier ? "text-signal-soft" : "text-ink-muted"}`}>
                          <span className={frame.outlier ? "font-bold" : ""}>
                            #{String(i + 1).padStart(2, "0")} {frame.outlier ? t.home.demoOutlierShort : ""}
                          </span>
                          <span>{frame.score}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Outlier inspector */}
                <div className="flex flex-col justify-between gap-4 border border-hairline bg-panel p-4 lg:col-span-4">
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between border-b border-hairline pb-2">
                      <span className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase text-signal-soft">
                        <span className="inline-block h-2 w-2 bg-signal" aria-hidden="true" />
                        {t.home.demoOutlierTitle}
                      </span>
                      <span className="bg-signal px-1.5 py-0.5 font-mono text-[10px] font-bold text-on-signal">
                        {t.home.demoScore(58)}
                      </span>
                    </div>

                    <div className="relative aspect-[4/3] overflow-hidden border border-hairline bg-panel-high">
                      <Photo src={PHOTOS.wedding} alt={t.home.exampleImage} sizes="(min-width: 1024px) 30vw, 100vw" />
                      <div className="absolute inset-y-0 left-0 w-1/2 overflow-hidden border-r-2 border-signal">
                        <div className="relative h-full w-[200%]">
                          <Photo src={PHOTOS.wedding} alt="" sizes="(min-width: 1024px) 30vw, 100vw" style={{ filter: WARM_CAST }} />
                        </div>
                      </div>
                      <span className="absolute left-2 top-2 bg-room-deep/90 px-1.5 py-0.5 font-mono text-[10px] text-signal-soft">
                        {t.home.demoIs}
                      </span>
                      <span className="absolute right-2 top-2 bg-room-deep/90 px-1.5 py-0.5 font-mono text-[10px] text-ink">
                        {t.home.demoTarget}
                      </span>
                    </div>

                    <div className="space-y-1.5 border border-hairline bg-room-deep p-2 font-mono text-[10px]">
                      <div className="flex justify-between text-ink-muted">
                        <span>{t.home.demoTemperature}</span>
                        <span className="font-bold text-signal-soft">{t.home.demoTemperatureValue}</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden bg-panel-high">
                        <div className="h-full w-3/4 bg-signal" />
                      </div>
                      <div className="flex justify-between text-ink-muted">
                        <span>{t.home.demoTint}</span>
                        <span className="font-bold text-signal-soft">{t.home.demoTintValue}</span>
                      </div>
                      <div className="flex justify-between text-ink-muted">
                        <span>{t.home.demoStep}</span>
                        <span className="text-ink">{t.home.demoStepValue}</span>
                      </div>
                    </div>

                    <p className="border-l-2 border-signal bg-panel-high p-2 font-mono text-[11px] leading-relaxed text-ink-muted">
                      <span className="font-bold text-ink">{t.home.demoRecipeLabel}</span> {t.home.demoRecipe}
                    </p>
                  </div>

                  <CopyButton
                    text={t.home.demoRecipe}
                    label={t.home.demoCopy}
                    className="w-full border border-stone-300 bg-panel-high py-2.5 font-mono uppercase tracking-wider text-ink hover:bg-stone-300 hover:text-ink"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Features */}
          <section id="funktionen" className="scroll-mt-16 border-y border-hairline bg-room-deep px-4 py-14 sm:px-8">
            <div className="mx-auto flex max-w-7xl flex-col gap-10">
              <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
                <div>
                  <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-muted">{t.home.featuresEyebrow}</div>
                  <h2 className="text-balance text-3xl text-ink">{t.home.featuresTitle}</h2>
                </div>
                <p className="max-w-sm font-mono text-[11px] leading-relaxed text-ink-muted">{t.home.featuresIntro}</p>
              </div>

              {/* Palette & sequencing */}
              <div className="grid grid-cols-1 overflow-hidden border border-hairline bg-panel xl:grid-cols-12">
                <div className="group relative min-h-[380px] overflow-hidden bg-panel-high sm:min-h-[480px] xl:col-span-8">
                  <Photo
                    src={PHOTOS.forest}
                    alt={t.home.exampleImage}
                    sizes="(min-width: 1280px) 60vw, 100vw"
                    className="transition-transform duration-700 motion-safe:group-hover:scale-105"
                  />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-room-deep/90 via-transparent to-room-deep/30" />
                  <div className="absolute inset-x-4 bottom-4 border border-hairline bg-room-deep/90 p-3 backdrop-blur-md">
                    <div className="mb-1.5 font-mono text-[10px] uppercase text-ink-muted">{t.home.paletteLabel}</div>
                    <div className="mb-1.5 grid h-9 grid-cols-5 overflow-hidden border border-hairline">
                      {PALETTE.map((hex, i) => (
                        <div
                          key={hex}
                          className={`flex items-center justify-center font-mono text-[9px] sm:text-[10px] ${i === PALETTE.length - 1 ? "text-black/70" : "text-[#e5e2e1]/80"}`}
                          style={{ backgroundColor: hex }}
                        >
                          {hex}
                        </div>
                      ))}
                    </div>
                    <div className="hidden grid-cols-5 font-mono text-[10px] text-ink-muted sm:grid">
                      {t.home.paletteNames.map((name) => (
                        <span key={name} className="truncate">
                          {name}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex flex-col justify-between gap-6 border-t border-hairline bg-room-deep p-6 xl:col-span-4 xl:border-l xl:border-t-0">
                  <div>
                    <div className="mb-3">
                      <Eyebrow>{t.home.paletteEyebrow}</Eyebrow>
                    </div>
                    <h3 className="mb-3 font-display text-2xl text-ink">{t.home.paletteTitle}</h3>
                    <p className="mb-5 text-sm leading-relaxed text-ink-muted">{t.home.paletteText}</p>
                    <div className="space-y-1.5">
                      {t.home.paletteSpecs.map(([label, value]) => (
                        <SpecRow key={label} label={label} value={value} />
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Stock SEO & prompts */}
              <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-12">
                <div className="flex flex-col justify-between gap-6 border border-hairline bg-panel p-6 lg:col-span-5">
                  <div>
                    <div className="mb-3">
                      <Eyebrow>{t.home.stockEyebrow}</Eyebrow>
                    </div>
                    <h3 className="mb-3 font-display text-2xl text-ink">{t.home.stockTitle}</h3>
                    <p className="mb-5 text-sm leading-relaxed text-ink-muted">{t.home.stockText}</p>
                    <div className="mb-5 space-y-2 border border-hairline bg-room-deep p-4">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[10px] font-bold uppercase text-signal-soft">{t.home.stockPromptLabel}</span>
                        <CopyButton text={t.home.stockPrompt} className="font-mono text-ink-muted hover:text-signal-soft" />
                      </div>
                      <p className="border border-hairline bg-panel p-2 font-mono text-[11px] leading-relaxed text-ink">{t.home.stockPrompt}</p>
                    </div>
                    <div className="space-y-1.5">
                      {t.home.stockSpecs.map(([label, value]) => (
                        <SpecRow key={label} label={label} value={value} />
                      ))}
                    </div>
                  </div>
                </div>
                <div className="group relative min-h-[320px] overflow-hidden border border-hairline bg-panel-high lg:col-span-7">
                  <Photo
                    src={PHOTOS.ceramic}
                    alt={t.home.exampleImage}
                    sizes="(min-width: 1024px) 55vw, 100vw"
                    className="transition-transform duration-700 motion-safe:group-hover:scale-105"
                  />
                  <span className="absolute right-4 top-4 border border-hairline bg-room-deep/90 px-2 py-1 font-mono text-[10px] uppercase text-ink-muted">
                    {t.home.exampleImage}
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* The real tool */}
          <section id="analyse" className="scroll-mt-16 px-4 py-14 sm:px-8">
            <div className="mx-auto flex max-w-4xl flex-col gap-4">{uploadZone}</div>
          </section>

          {/* What you get */}
          <section className="border-t border-hairline bg-panel px-4 py-8 sm:px-8">
            <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 font-mono text-xs lg:flex-row lg:items-center">
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] uppercase tracking-[0.14em] text-ink-muted">{t.home.platformsLabel}</span>
                <div className="flex flex-wrap gap-2 text-ink">
                  {PLATFORMS.map((name) => (
                    <span key={name} className="border border-hairline bg-room px-2 py-1">
                      {name}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] uppercase tracking-[0.14em] text-ink-muted">{t.home.exportsLabel}</span>
                <div className="flex flex-wrap gap-2 text-ink">
                  {t.home.exports.map((name) => (
                    <span key={name} className="border border-hairline bg-room px-2 py-1">
                      {name}
                    </span>
                  ))}
                </div>
              </div>
              <div className="lg:text-right">
                <div className="text-[10px] uppercase tracking-[0.14em] text-ink-muted">{t.home.languagesLabel}</div>
                <div className="font-bold text-signal-soft">{t.home.languages}</div>
              </div>
            </div>
          </section>
        </>
      )}

      {job.creditsExhausted && (
        <CreditsExhaustedDialog detail={job.creditsExhausted} onClose={job.dismissCreditsExhausted} />
      )}
    </div>
  );
}
