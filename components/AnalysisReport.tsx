"use client";

import { ExportTabs } from "@/components/exports/ExportTabs";
import { useI18n } from "@/lib/i18n/client";
import type { StyleAnalysis } from "@/lib/analysis-schema";

type AnalysisReportProps = {
  report: StyleAnalysis;
};

export function AnalysisReport({ report }: AnalysisReportProps) {
  const { t } = useI18n();

  return (
    <div className="w-full space-y-8 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-violet-700">{t.report.style}</h2>
        <p className="mt-2 text-lg leading-relaxed text-stone-900">{report.style.summary}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {report.style.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-stone-300 bg-stone-50 px-3 py-1 text-xs text-stone-700"
            >
              {tag}
            </span>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-violet-700">{t.report.palette}</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {report.colorPalette.map((color) => (
            <div
              key={color.hex}
              className="flex items-center gap-3 rounded-xl border border-stone-200 bg-stone-50 p-2"
            >
              <span
                className="h-8 w-8 shrink-0 rounded-md border border-black/10"
                style={{ backgroundColor: color.hex }}
                aria-hidden="true"
              />
              <div className="min-w-0">
                <p className="truncate text-sm text-stone-800">{color.name}</p>
                <p className="font-mono text-xs text-stone-500">{color.hex}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-violet-700">{t.report.emotions}</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {report.emotions.map((emotion) => (
            <span
              key={emotion}
              className="rounded-full bg-violet-50 px-3 py-1 text-xs text-violet-700"
            >
              {emotion}
            </span>
          ))}
        </div>
      </section>

      <ExportTabs
        prompts={report.prompts}
        colors={report.colorPalette}
        stock={[{ label: t.report.thisImage, stock: report.stock }]}
      />
    </div>
  );
}
