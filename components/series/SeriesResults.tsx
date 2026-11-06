"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import type { SeriesAnalysisResponse } from "@/lib/series-api";
import { GROUP_KEYS, organizeSeries, SORT_KEYS, type OrganizeOptions } from "@/lib/series-organize";
import { ExportTabs } from "@/components/exports/ExportTabs";
import { SeriesMeasurementTable } from "@/components/measure/MeasurementPanels";
import { CopyButton } from "@/components/series/CopyButton";
import { needsCorrection, scoreColor, SeriesImageCard } from "@/components/series/SeriesImageCard";

type SeriesResultsProps = {
  result: SeriesAnalysisResponse;
  /** Object URLs of the uploaded files (index 0 = image 1). Empty when reopened from the dashboard. */
  previewUrls: string[];
};

const DIMENSIONS = ["color", "lighting", "postProcessing", "composition"] as const;

const SEVERITY_STYLES = {
  high: "text-red-700",
  medium: "text-amber-700",
  low: "text-ink-muted",
} as const;

/*
 * Series report in the "calibrated darkroom" look. Every number, color and
 * image on this page comes from the user's own analysis - previews are the
 * object URLs of the files they uploaded; without them a neutral placeholder
 * with the file name is shown.
 */

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-2 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-ink-muted">
      <span className="inline-block h-2 w-2 bg-signal" aria-hidden="true" />
      {children}
    </span>
  );
}

function Tile({ label, aside, children }: { label: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col justify-between gap-2 bg-panel p-4">
      <div className="flex items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-wider text-ink-muted">
        <span>{label}</span>
        {aside}
      </div>
      {children}
    </div>
  );
}

function Bar({ value }: { value: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden bg-panel-high">
      <div className="h-full bg-signal" style={{ width: `${value}%` }} />
    </div>
  );
}

function Preview({ url, alt, name, hint, className = "" }: { url?: string; alt: string; name: string; hint: string; className?: string }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element -- object URL of the user's own upload
    <img src={url} alt={alt} className={`h-full w-full object-cover ${className}`} />
  ) : (
    <span className="flex h-full w-full flex-col items-center justify-center gap-1 px-2 text-center font-mono text-[10px] text-ink-muted">
      <span className="max-w-full truncate text-ink">{name}</span>
      <span>{hint}</span>
    </span>
  );
}

export function SeriesResults({ result, previewUrls }: SeriesResultsProps) {
  const { report, files } = result;
  const { locale, t } = useI18n();
  const labels = t.series.results;
  const [options, setOptions] = useState<OrganizeOptions>({ sort: "story", order: "asc", group: "none" });

  // Same pure function the API uses - re-sorting is instant and free.
  const organization = useMemo(
    () => organizeSeries(report, files, options, locale),
    [report, files, options, locale]
  );
  const imagesByIndex = useMemo(() => new Map(report.images.map((image) => [image.index, image])), [report]);
  const filesByIndex = useMemo(() => new Map(files.map((file) => [file.index, file])), [files]);

  const flagged = useMemo(() => report.images.filter(needsCorrection), [report]);
  const weakest = useMemo(
    () => report.images.reduce((low, image) => (image.consistencyScore < low.consistencyScore ? image : low)),
    [report]
  );
  const [selectedIndex, setSelectedIndex] = useState(weakest.index);
  const selected = imagesByIndex.get(selectedIndex) ?? weakest;
  const selectedFile = filesByIndex.get(selected.index);

  const shotsFound = useMemo(() => {
    const byShot = new Map<string, number[]>();
    for (const image of report.images) byShot.set(image.shotType, [...(byShot.get(image.shotType) ?? []), image.index]);
    return [...byShot.entries()];
  }, [report]);

  const overall = report.consistency.overallScore;
  const summaryText =
    `${report.series.title} – ${labels.overall}: ${overall}/100 (${labels.band(overall)}). ` + report.consistency.verdict;
  const recipeText = [
    `${t.common.image(selected.index)} – ${labels.recipe}`,
    ...selected.deviations.map(
      (deviation) =>
        `- ${t.labels.deviations[deviation.aspect]} (${labels.severity[deviation.severity]}): ${deviation.fix}`
    ),
  ].join("\n");

  const downloadJson = () => {
    const blob = new Blob([JSON.stringify({ ...result, organization }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `auralens-serie-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const buttonClass =
    "border border-hairline bg-panel px-3 py-1.5 font-mono text-xs text-ink transition-colors hover:bg-panel-high hover:text-ink";

  return (
    <div className="w-full space-y-8">
      {/* Summary */}
      <section className="space-y-4 bg-room-deep p-4 sm:p-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div className="min-w-0 space-y-2">
            <Eyebrow>{labels.eyebrow(result.imageCount)}</Eyebrow>
            <h1 className="text-balance text-3xl text-ink">{report.series.title}</h1>
            <p className="max-w-3xl text-sm leading-relaxed text-ink-muted">{report.series.summary}</p>
            <div className="flex flex-wrap gap-1.5">
              {report.series.styleTags.map((tag) => (
                <span key={tag} className="border border-hairline px-2 py-0.5 font-mono text-[11px] text-ink">
                  {tag}
                </span>
              ))}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <CopyButton text={summaryText} label={labels.copySummary} className={buttonClass} />
            <button type="button" onClick={downloadJson} className="bg-signal px-3 py-1.5 font-mono text-xs font-semibold text-on-signal transition-colors hover:bg-signal-soft">
              {labels.exportJson}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Tile label={labels.consistency}>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-3xl font-semibold text-ink">{overall}</span>
              <span className="font-mono text-xs text-ink-muted">/ 100</span>
            </div>
            <Bar value={overall} />
            <span className="font-mono text-[11px] text-signal-soft">{labels.band(overall)}</span>
          </Tile>

          <Tile
            label={labels.outliers}
            aside={flagged.length > 0 && <span className="bg-panel-high px-1 text-signal-soft">{flagged.length}</span>}
          >
            <span className={`font-mono text-3xl font-semibold ${flagged.length > 0 ? "text-signal" : "text-emerald-700"}`}>
              {flagged.length > 0 ? flagged.map((image) => `#${String(image.index).padStart(2, "0")}`).join(" ") : labels.outliersNone}
            </span>
            <span className="font-mono text-[11px] text-ink-muted">{labels.weakest(weakest.index, weakest.consistencyScore)}</span>
            <span className="font-mono text-[10px] text-ink-muted">{labels.outlierHint}</span>
          </Tile>

          <Tile label={labels.byArea}>
            <div className="space-y-1.5">
              {DIMENSIONS.map((key) => (
                <div key={key} className="space-y-0.5">
                  <div className="flex justify-between font-mono text-[10px] text-ink-muted">
                    <span>{labels.dimensions[key]}</span>
                    <span className="text-ink">{report.consistency.dimensions[key]}</span>
                  </div>
                  <Bar value={report.consistency.dimensions[key]} />
                </div>
              ))}
            </div>
          </Tile>

          <Tile label={labels.harmony}>
            <span className="text-sm font-semibold text-ink">{t.labels.harmonies[report.masterPalette.harmony.type]}</span>
            <div className="flex h-6 overflow-hidden border border-hairline">
              {report.masterPalette.colors.map((color, i) => (
                <span key={`${color.hex}-${i}`} className="flex-1" style={{ backgroundColor: color.hex }} title={color.hex} />
              ))}
            </div>
            <span className="line-clamp-2 text-[11px] text-ink-muted">{report.masterPalette.harmony.description}</span>
          </Tile>
        </div>

        <div className="border-l-2 border-signal bg-panel p-3">
          <p className="text-sm text-ink">{report.consistency.verdict}</p>
          <p className="mt-3 font-mono text-[10px] uppercase tracking-wider text-ink-muted">{labels.recommendations}</p>
          <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-ink-muted">
            {report.consistency.recommendations.map((recommendation) => (
              <li key={recommendation}>{recommendation}</li>
            ))}
          </ol>
        </div>
      </section>

      {/* Contact sheet */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-xl text-ink">{labels.contactSheet}</h2>
            <span className="bg-panel-high px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-ink-muted">
              {labels.imagesCount(result.imageCount)}
            </span>
          </div>
          <div className="flex items-center gap-4 font-mono text-[10px] text-ink-muted">
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 bg-panel-high ring-1 ring-stone-300" aria-hidden="true" /> {labels.legendOk}
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 bg-signal" aria-hidden="true" /> {labels.legendFix}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="font-mono text-[10px] uppercase tracking-wider text-ink-muted">
            {labels.sortBy}
            <select
              value={options.sort}
              onChange={(event) => setOptions({ ...options, sort: event.target.value as OrganizeOptions["sort"] })}
              className="mt-1 block border border-hairline bg-panel px-3 py-1.5 font-sans text-sm normal-case tracking-normal text-ink"
            >
              {SORT_KEYS.map((key) => (
                <option key={key} value={key}>
                  {t.labels.sorts[key]}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => setOptions({ ...options, order: options.order === "asc" ? "desc" : "asc" })}
            className={buttonClass}
            title={labels.reverse}
          >
            {options.order === "asc" ? labels.ascending : labels.descending}
          </button>
          <label className="font-mono text-[10px] uppercase tracking-wider text-ink-muted">
            {labels.groupBy}
            <select
              value={options.group}
              onChange={(event) => setOptions({ ...options, group: event.target.value as OrganizeOptions["group"] })}
              className="mt-1 block border border-hairline bg-panel px-3 py-1.5 font-sans text-sm normal-case tracking-normal text-ink"
            >
              {GROUP_KEYS.map((key) => (
                <option key={key} value={key}>
                  {t.labels.groups[key]}
                </option>
              ))}
            </select>
          </label>
        </div>

        {organization.groups.map((group) => (
          <div key={group.key} className="space-y-3">
            {options.group !== "none" && (
              <h3 className="font-mono text-xs uppercase tracking-wider text-ink">
                {group.label} <span className="text-ink-muted">({group.indices.length})</span>
              </h3>
            )}
            <div className="grid grid-cols-2 gap-x-2 gap-y-4 pt-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
              {group.indices.map((index) => (
                <SeriesImageCard
                  key={index}
                  image={imagesByIndex.get(index)!}
                  file={filesByIndex.get(index)!}
                  previewUrl={previewUrls[index - 1]}
                  selected={index === selected.index}
                  onSelect={() => setSelectedIndex(index)}
                />
              ))}
            </div>
          </div>
        ))}

        {/* Inspector for the selected frame */}
        <div className="flex flex-col gap-6 bg-panel p-4 sm:p-6 lg:flex-row" aria-live="polite">
          <div className="flex w-full flex-col gap-3 lg:w-5/12">
            <div className="flex items-center justify-between gap-2">
              <Eyebrow>{labels.inspector(selected.index)}</Eyebrow>
              <span className={`px-1.5 py-0.5 font-mono text-[10px] font-semibold ${scoreColor(selected.consistencyScore)}`}>
                {selected.consistencyScore} / 100
              </span>
            </div>
            <div className="relative aspect-[3/2] w-full overflow-hidden bg-room-deep">
              <Preview
                url={previewUrls[selected.index - 1]}
                alt={selected.summary}
                name={selectedFile?.name ?? t.common.image(selected.index)}
                hint={labels.noPreview}
              />
            </div>
            <p className="text-sm text-ink">{selected.summary}</p>
            <div className="space-y-1">
              <span className="font-mono text-[10px] uppercase tracking-wider text-ink-muted">{labels.imageColors}</span>
              <div className="flex h-8 overflow-hidden border border-hairline">
                {selected.dominantColors.map((color, i) => (
                  <span
                    key={`${color.hex}-${i}`}
                    className="flex flex-1 items-end justify-center pb-0.5 font-mono text-[9px] text-[#ffffff] mix-blend-difference"
                    style={{ backgroundColor: color.hex }}
                    title={`${color.name} · ${color.hex}`}
                  >
                    {color.hex}
                  </span>
                ))}
              </div>
            </div>
            {selectedFile && (
              <p className="font-mono text-[10px] text-ink-muted">
                {selectedFile.name} · {selectedFile.width} × {selectedFile.height} px · {selectedFile.megapixels} MP ·{" "}
                {t.labels.orientations[selectedFile.orientation]}
              </p>
            )}
          </div>

          <div className="flex w-full flex-col gap-4 lg:w-7/12">
            <p className="text-base font-semibold text-ink">{labels.recipe}</p>
            {selected.deviations.length === 0 ? (
              <p className="bg-panel-high p-3 text-sm text-emerald-700">{labels.recipeNone}</p>
            ) : (
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {selected.deviations.map((deviation, i) => (
                  <div key={i} className="flex flex-col gap-1 bg-panel-high p-3">
                    <div className="flex items-center justify-between gap-2 font-mono text-[10px] font-semibold uppercase">
                      <span className="flex items-center gap-1.5 text-ink">
                        <span className="h-1.5 w-1.5 bg-signal" aria-hidden="true" />
                        {t.labels.deviations[deviation.aspect]}
                      </span>
                      <span className={SEVERITY_STYLES[deviation.severity]}>{labels.severity[deviation.severity]}</span>
                    </div>
                    <p className="text-sm text-ink">{deviation.fix}</p>
                    <p className="text-xs text-ink-muted">{deviation.description}</p>
                  </div>
                ))}
              </div>
            )}
            {selected.deviations.length > 0 && (
              <CopyButton text={recipeText} label={labels.copyRecipe} className={`self-start ${buttonClass}`} />
            )}

            <details className="border-t border-hairline pt-3 text-xs">
              <summary className="cursor-pointer font-mono uppercase tracking-wider text-ink-muted hover:text-ink">
                {t.series.card.stockMetadata} · {t.labels.categories[selected.stock.category]}
              </summary>
              <div className="mt-2 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-ink">{selected.stock.title}</p>
                  <CopyButton text={selected.stock.title} label={t.series.card.title} />
                </div>
                <p className="text-ink-muted">{selected.stock.description}</p>
                <div className="flex items-start justify-between gap-2">
                  <p className="font-mono text-[11px] text-ink-muted">{selected.stock.keywords.join(", ")}</p>
                  <CopyButton text={selected.stock.keywords.join(", ")} label={t.series.card.keywords} />
                </div>
              </div>
            </details>
          </div>
        </div>
      </section>

      {/* Master palette */}
      <section className="space-y-3 bg-room-deep p-4 sm:p-6">
        <div className="flex flex-col justify-between gap-1 md:flex-row md:items-end">
          <div>
            <Eyebrow>{t.labels.harmonies[report.masterPalette.harmony.type]}</Eyebrow>
            <h2 className="mt-1 text-xl text-ink">{labels.masterPalette}</h2>
          </div>
          <p className="max-w-md text-xs text-ink-muted">{report.masterPalette.harmony.description}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
          {report.masterPalette.colors.map((color, i) => (
            <div key={`${color.hex}-${i}`} className="flex flex-col bg-panel">
              <div className="h-20" style={{ backgroundColor: color.hex }} />
              <div className="flex flex-col gap-0.5 p-2 font-mono">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-semibold text-ink">{color.hex}</span>
                  <CopyButton text={color.hex} label={labels.hex} className="font-mono text-[10px]" />
                </div>
                <span className="truncate text-[10px] text-ink-muted">{color.name}</span>
                <span className="text-[10px] uppercase text-ink-muted">{color.role}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Sequencing & shot sizes */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="flex flex-col gap-4 bg-panel p-4 sm:p-6 lg:col-span-7">
          <h2 className="text-xl text-ink">{labels.dramaturgy}</h2>
          <p className="text-sm text-ink-muted">{report.narrative.arcSummary}</p>
          <div>
            <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-ink-muted">{labels.suggestedOrder}</p>
            <ol className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {report.narrative.suggestedOrder.map((index, position) => {
                const image = imagesByIndex.get(index);
                const file = filesByIndex.get(index);
                if (!image) return null;
                return (
                  <li key={index} className="flex flex-col bg-panel-high">
                    <div className="relative aspect-[3/2] overflow-hidden bg-room-deep">
                      <Preview url={previewUrls[index - 1]} alt={image.summary} name={file?.name ?? ""} hint="" />
                      <span className="absolute left-1 top-1 bg-room-deep/90 px-1 font-mono text-[10px] text-signal-soft">
                        {String(position + 1).padStart(2, "0")}
                      </span>
                    </div>
                    <div className="p-1.5 font-mono text-[10px]">
                      <p className="truncate text-ink">{t.common.image(index)}</p>
                      <p className="truncate text-ink-muted">{t.labels.roles[image.narrativeRole]}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
          <p className="border-l-2 border-signal bg-panel-high p-3 text-sm text-ink-muted">{report.narrative.orderRationale}</p>
        </div>

        <div className="flex flex-col gap-3 bg-panel p-4 sm:p-6 lg:col-span-5">
          <h2 className="text-xl text-ink">{labels.shotSizes}</h2>
          <ul className="flex flex-col gap-1.5 font-mono text-xs">
            {shotsFound.map(([shot, indices]) => (
              <li key={shot} className="flex items-center justify-between gap-2 bg-panel-high px-2 py-1.5">
                <span className="text-ink">✓ {t.labels.shots[shot as keyof typeof t.labels.shots]}</span>
                <span className="shrink-0 text-[10px] uppercase text-emerald-700">
                  {labels.found} · {indices.map((n) => `#${String(n).padStart(2, "0")}`).join(" ")}
                </span>
              </li>
            ))}
            {report.narrative.missingShots.map((shot) => (
              <li key={shot} className="flex items-center justify-between gap-2 bg-panel-high px-2 py-1.5">
                <span className="text-signal-soft">
                  {labels.missingShot}: {shot}
                </span>
                <span className="shrink-0 bg-room px-1 text-[10px] font-bold uppercase text-signal-soft">{labels.gap}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Market fit */}
      <section className="space-y-4 bg-room-deep p-4 sm:p-6">
        <h2 className="text-xl text-ink">{labels.marketFit}</h2>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-3">
            <Eyebrow>{labels.industries}</Eyebrow>
            {report.market.industries.map((industry) => (
              <div key={industry.name}>
                <div className="flex justify-between text-sm">
                  <span className="text-ink">{industry.name}</span>
                  <span className="font-mono text-ink-muted">{industry.fitScore}</span>
                </div>
                <div className="mt-1">
                  <Bar value={industry.fitScore} />
                </div>
                <p className="mt-1 text-xs text-ink-muted">{industry.useCases.join(" · ")}</p>
              </div>
            ))}
          </div>
          <div className="space-y-3">
            <Eyebrow>{labels.psychology}</Eyebrow>
            {report.market.psychology.map((effect) => (
              <div key={effect.emotion} className="text-sm">
                <span className="text-ink">{effect.emotion}</span>{" "}
                <span className="font-mono text-xs text-ink-muted">({effect.intensity})</span>
                <p className="text-xs text-ink-muted">{effect.trigger}</p>
              </div>
            ))}
            <Eyebrow>{labels.audiences}</Eyebrow>
            {report.market.targetAudiences.map((audience) => (
              <p key={audience.segment} className="text-sm text-ink">
                {audience.segment} <span className="text-xs text-ink-muted">– {audience.rationale}</span>
              </p>
            ))}
          </div>
        </div>
      </section>

      {/* Pixel measurements: exact values and corrections (only for newly measured analyses) */}
      <SeriesMeasurementTable files={result.files} />

      {/* Exports: prompts, design tokens, stock SEO */}
      <ExportTabs
        prompts={report.aiPrompts}
        photographicSpec={report.aiPrompts.photographicSpec}
        colors={report.masterPalette.colors}
        stock={report.images.map((image) => ({
          label: t.common.image(image.index),
          filename: filesByIndex.get(image.index)?.name,
          stock: image.stock,
        }))}
      />
    </div>
  );
}
