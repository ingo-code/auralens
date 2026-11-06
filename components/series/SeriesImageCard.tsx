"use client";

import { useI18n } from "@/lib/i18n/client";
import type { SeriesImageAnalysis, SeriesImageFile } from "@/lib/series-analysis-schema";

/** Text color for a 0-100 score on the darkroom background. */
export function scoreColor(score: number) {
  if (score >= 80) return "text-emerald-700 bg-emerald-50";
  if (score >= 60) return "text-amber-700 bg-amber-50";
  return "text-red-700 bg-red-50";
}

/** An image needs attention when it scores low or has a medium/strong deviation. */
export function needsCorrection(image: SeriesImageAnalysis) {
  return image.consistencyScore < 70 || image.deviations.some((deviation) => deviation.severity !== "low");
}

type SeriesImageCardProps = {
  image: SeriesImageAnalysis;
  file: SeriesImageFile;
  /** Object URL of the uploaded file; absent when the report is reopened later. */
  previewUrl?: string;
  selected?: boolean;
  onSelect?: () => void;
};

/** One frame on the contact sheet. Shows only the user's own upload, never sample imagery. */
export function SeriesImageCard({ image, file, previewUrl, selected = false, onSelect }: SeriesImageCardProps) {
  const { t } = useI18n();
  const labels = t.series.results;
  const card = t.series.card;
  const fix = needsCorrection(image);
  const number = String(image.index).padStart(2, "0");

  return (
    <article
      aria-label={t.common.image(image.index)}
      className={`relative flex flex-col bg-panel ${
        selected ? "ring-2 ring-signal" : fix ? "ring-1 ring-signal/60" : "ring-1 ring-hairline"
      }`}
    >
      {fix && (
        <span className="absolute -top-2.5 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap bg-signal px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-on-signal">
          {labels.outlierFlag}
        </span>
      )}
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        aria-label={labels.inspect(image.index)}
        className="group relative block aspect-[3/2] w-full overflow-hidden bg-room-deep text-left"
      >
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- object URL of the user's own upload
          <img
            src={previewUrl}
            alt={image.summary}
            className="h-full w-full object-cover transition-transform duration-300 motion-safe:group-hover:scale-105"
          />
        ) : (
          <span className="flex h-full w-full flex-col items-center justify-center gap-1 px-2 text-center font-mono text-[10px] text-ink-muted">
            <span className="max-w-full truncate text-ink">{file.name}</span>
            <span>{labels.noPreview}</span>
          </span>
        )}
        <span
          className={`absolute left-1 top-1 px-1 py-0.5 font-mono text-[10px] ${
            fix ? "bg-signal font-bold text-on-signal" : "bg-room-deep/90 text-ink"
          }`}
        >
          #{number}
        </span>
        <span
          className={`absolute right-1 top-1 px-1 py-0.5 font-mono text-[10px] font-semibold ${scoreColor(image.consistencyScore)}`}
          title={card.consistencyTitle}
        >
          {image.consistencyScore}
        </span>
      </button>

      <div className={`flex flex-col gap-1 p-2 font-mono text-[10px] ${fix ? "bg-panel-high" : ""}`}>
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-ink">
            {t.labels.roles[image.narrativeRole]} · {t.labels.shots[image.shotType]}
          </span>
          <span className={`shrink-0 font-bold uppercase ${fix ? "text-signal-soft" : "text-emerald-700"}`}>
            {fix ? labels.statusFix : labels.statusOk}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 text-ink-muted">
          <span className="truncate">{t.labels.categories[image.stock.category]}</span>
          <span className={`shrink-0 ${file.stockResolutionOk ? "" : "text-amber-700"}`}>
            {file.stockResolutionOk ? card.stockOk : card.stockTooSmall}
          </span>
        </div>
      </div>
    </article>
  );
}
