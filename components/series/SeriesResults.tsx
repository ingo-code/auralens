"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import type { SeriesAnalysisResponse } from "@/lib/series-api";
import { GROUP_KEYS, organizeSeries, SORT_KEYS, type OrganizeOptions } from "@/lib/series-organize";
import { ExportTabs } from "@/components/exports/ExportTabs";
import { CopyButton } from "@/components/series/CopyButton";
import { scoreColor, SeriesImageCard } from "@/components/series/SeriesImageCard";

type SeriesResultsProps = {
  result: SeriesAnalysisResponse;
  previewUrls: string[];
};

const DIMENSIONS = ["color", "lighting", "postProcessing", "composition"] as const;

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-sm font-semibold uppercase tracking-wider text-violet-700">{children}</h2>;
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

  const downloadJson = () => {
    const blob = new Blob([JSON.stringify({ ...result, organization }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `auralens-serie-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-full space-y-10">
      {/* Overview */}
      <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold text-stone-900">{report.series.title}</h1>
            <p className="mt-2 text-stone-600">{report.series.summary}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {report.series.styleTags.map((tag) => (
                <span key={tag} className="rounded-full border border-stone-300 px-2.5 py-0.5 text-xs text-stone-700">
                  {tag}
                </span>
              ))}
            </div>
          </div>
          <div className={`shrink-0 rounded-2xl px-6 py-4 text-center ${scoreColor(report.consistency.overallScore)}`}>
            <p className="text-4xl font-semibold">{report.consistency.overallScore}</p>
            <p className="text-xs uppercase tracking-wider">{labels.consistency}</p>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-4">
          {DIMENSIONS.map((key) => (
            <div key={key}>
              <div className="flex justify-between text-xs text-stone-600">
                <span>{labels.dimensions[key]}</span>
                <span>{report.consistency.dimensions[key]}</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-stone-100">
                <div
                  className="h-1.5 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500"
                  style={{ width: `${report.consistency.dimensions[key]}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        <p className="mt-6 text-stone-800">{report.consistency.verdict}</p>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-stone-600">
          {report.consistency.recommendations.map((recommendation) => (
            <li key={recommendation}>{recommendation}</li>
          ))}
        </ol>
      </section>

      {/* Images: sort & group */}
      <section className="space-y-5">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-stone-600">
            {labels.sortBy}
            <select
              value={options.sort}
              onChange={(event) => setOptions({ ...options, sort: event.target.value as OrganizeOptions["sort"] })}
              className="mt-1 block rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-900"
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
            className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm text-stone-700 hover:border-stone-400"
            title={labels.reverse}
          >
            {options.order === "asc" ? labels.ascending : labels.descending}
          </button>
          <label className="text-xs text-stone-600">
            {labels.groupBy}
            <select
              value={options.group}
              onChange={(event) => setOptions({ ...options, group: event.target.value as OrganizeOptions["group"] })}
              className="mt-1 block rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-900"
            >
              {GROUP_KEYS.map((key) => (
                <option key={key} value={key}>
                  {t.labels.groups[key]}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={downloadJson}
            className="ml-auto rounded-lg bg-violet-100/70 px-3 py-1.5 text-sm font-medium text-violet-700 hover:bg-violet-100"
          >
            {labels.exportJson}
          </button>
        </div>

        {organization.groups.map((group) => (
          <div key={group.key} className="space-y-3">
            {options.group !== "none" && (
              <h3 className="text-sm font-medium text-stone-700">
                {group.label} <span className="text-stone-500">({group.indices.length})</span>
              </h3>
            )}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {group.indices.map((index) => (
                <SeriesImageCard
                  key={index}
                  image={imagesByIndex.get(index)!}
                  file={filesByIndex.get(index)!}
                  previewUrl={previewUrls[index - 1]}
                />
              ))}
            </div>
          </div>
        ))}

        <div className="rounded-2xl border border-stone-200 bg-white p-4 text-sm shadow-sm">
            <p className="text-stone-700">{report.narrative.arcSummary}</p>
            <p className="mt-2 text-stone-600">
              {labels.suggestedOrder}{" "}
              <span className="font-mono text-stone-800">
                {report.narrative.suggestedOrder.map((index) => t.common.image(index)).join(" → ")}
              </span>{" "}
              – {report.narrative.orderRationale}
            </p>
            {report.narrative.missingShots.length > 0 && (
              <p className="mt-2 text-stone-500">
                {labels.missing} {report.narrative.missingShots.join(" · ")}
              </p>
            )}
        </div>
      </section>

      {/* Master palette */}
      <section className="space-y-3">
        <SectionTitle>
          {labels.masterPalette} · {t.labels.harmonies[report.masterPalette.harmony.type]}
        </SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {report.masterPalette.colors.map((color, i) => (
            <div key={`${color.hex}-${i}`} className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
              <div className="h-14" style={{ backgroundColor: color.hex }} />
              <div className="flex items-center justify-between gap-2 p-2">
                <div className="min-w-0">
                  <p className="truncate text-xs text-stone-800">{color.name}</p>
                  <p className="font-mono text-xs text-stone-500">
                    {color.hex} · {color.role}
                  </p>
                </div>
                <CopyButton text={color.hex} label={labels.hex} />
              </div>
            </div>
          ))}
        </div>
        <p className="text-sm text-stone-500">{report.masterPalette.harmony.description}</p>
      </section>

      {/* Market fit */}
      <section className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-3">
          <SectionTitle>{labels.industries}</SectionTitle>
          {report.market.industries.map((industry) => (
            <div key={industry.name}>
              <div className="flex justify-between text-sm">
                <span className="text-stone-800">{industry.name}</span>
                <span className="text-stone-600">{industry.fitScore}</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-stone-100">
                <div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${industry.fitScore}%` }} />
              </div>
              <p className="mt-1 text-xs text-stone-500">{industry.useCases.join(" · ")}</p>
            </div>
          ))}
        </div>
        <div className="space-y-3">
          <SectionTitle>{labels.psychology}</SectionTitle>
          {report.market.psychology.map((effect) => (
            <div key={effect.emotion} className="text-sm">
              <span className="text-stone-800">{effect.emotion}</span>{" "}
              <span className="text-stone-500">({effect.intensity})</span>
              <p className="text-xs text-stone-500">{effect.trigger}</p>
            </div>
          ))}
          <SectionTitle>{labels.audiences}</SectionTitle>
          {report.market.targetAudiences.map((audience) => (
            <p key={audience.segment} className="text-sm text-stone-700">
              {audience.segment} <span className="text-xs text-stone-500">– {audience.rationale}</span>
            </p>
          ))}
        </div>
      </section>

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
