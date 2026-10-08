"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import type { SeriesImageAnalysis, SeriesImageFile } from "@/lib/series-analysis-schema";
import { CopyButton } from "@/components/series/CopyButton";

export function scoreColor(score: number) {
  if (score >= 80) return "text-emerald-700 bg-emerald-50";
  if (score >= 60) return "text-amber-700 bg-amber-50";
  return "text-red-700 bg-red-50";
}

const SEVERITY_STYLES = {
  high: "border-red-200 bg-red-50/60 text-red-800",
  medium: "border-amber-200 bg-amber-50/60 text-amber-800",
  low: "border-stone-300 text-stone-700",
} as const;

type SeriesImageCardProps = {
  image: SeriesImageAnalysis;
  file: SeriesImageFile;
  previewUrl?: string;
};

export function SeriesImageCard({ image, file, previewUrl }: SeriesImageCardProps) {
  const { t } = useI18n();
  const card = t.series.card;
  const [showStock, setShowStock] = useState(false);

  return (
    <article aria-label={t.common.image(image.index)} className="flex flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      <div className="relative">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- Objekt-URL einer lokalen Datei
          <img src={previewUrl} alt={image.summary} className="aspect-[4/3] w-full object-cover" />
        ) : (
          <div className="aspect-[4/3] w-full bg-stone-100" />
        )}
        <span className="absolute left-2 top-2 rounded bg-white/90 px-2 py-0.5 text-xs font-medium text-stone-900">
          {t.common.image(image.index)}
        </span>
        <span
          className={`absolute right-2 top-2 rounded px-2 py-0.5 text-xs font-semibold ${scoreColor(image.consistencyScore)}`}
          title={card.consistencyTitle}
        >
          {image.consistencyScore}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <p className="text-sm text-stone-700">{image.summary}</p>

        <div className="flex flex-wrap gap-1.5 text-xs">
          <span className="rounded-full bg-violet-100/70 px-2 py-0.5 text-violet-700">
            {t.labels.categories[image.stock.category]}
          </span>
          <span className="rounded-full bg-stone-100 px-2 py-0.5 text-stone-700">
            {t.labels.roles[image.narrativeRole]}
          </span>
          <span className="rounded-full bg-stone-100 px-2 py-0.5 text-stone-700">{t.labels.shots[image.shotType]}</span>
        </div>

        <p className="text-xs text-stone-500">
          {file.width} × {file.height} px · {file.megapixels} MP · {t.labels.orientations[file.orientation]} ·{" "}
          <span className={file.stockResolutionOk ? "text-emerald-600" : "text-amber-600"}>
            {file.stockResolutionOk ? card.stockOk : card.stockTooSmall}
          </span>
        </p>

        {image.deviations.length > 0 && (
          <ul className="space-y-2">
            {image.deviations.map((deviation, i) => (
              <li key={i} className={`rounded-lg border px-3 py-2 text-xs ${SEVERITY_STYLES[deviation.severity]}`}>
                <p className="font-medium">
                  {t.labels.deviations[deviation.aspect]}: {deviation.description}
                </p>
                <p className="mt-1 text-stone-600">→ {deviation.fix}</p>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-auto border-t border-stone-200 pt-3">
          <button
            type="button"
            onClick={() => setShowStock((value) => !value)}
            className="text-xs font-medium text-stone-600 transition-colors hover:text-stone-900"
            aria-expanded={showStock}
          >
            {showStock ? "▾" : "▸"} {card.stockMetadata}
          </button>
          {showStock && (
            <div className="mt-2 space-y-2 text-xs">
              <div className="flex items-start justify-between gap-2">
                <p className="text-stone-800">{image.stock.title}</p>
                <CopyButton text={image.stock.title} label={card.title} />
              </div>
              <p className="text-stone-600">{image.stock.description}</p>
              <div className="flex items-start justify-between gap-2">
                <p className="text-stone-500">{image.stock.keywords.join(", ")}</p>
                <CopyButton text={image.stock.keywords.join(", ")} label={card.keywords} />
              </div>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
