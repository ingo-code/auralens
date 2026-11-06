"use client";

import { ExportTabs } from "@/components/exports/ExportTabs";
import { ImageMeasurementPanel } from "@/components/measure/MeasurementPanels";
import type { ImageMeasurements } from "@/lib/measure/image-metrics";
import { CopyButton } from "@/components/series/CopyButton";
import { useI18n } from "@/lib/i18n/client";
import type { StyleAnalysis } from "@/lib/analysis-schema";

type AnalysisReportProps = {
  report: StyleAnalysis;
  /** Object URL of the user's own upload; absent when the report is reopened later. */
  previewUrl?: string;
  /** Pixel measurements of the image, when the analysis has them. */
  measurements?: ImageMeasurements;
};

function Label({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-ink-muted">
      <span className="inline-block h-2 w-2 bg-signal" aria-hidden="true" />
      {children}
    </h2>
  );
}

/** Single-image report in the darkroom look - only the user's own image and Claude's real results. */
export function AnalysisReport({ report, previewUrl, measurements }: AnalysisReportProps) {
  const { t } = useI18n();

  return (
    <div className="w-full space-y-6">
      <div className="grid grid-cols-1 gap-6 bg-room-deep p-4 sm:p-6 lg:grid-cols-12">
        {previewUrl && (
          <div className="lg:col-span-5">
            <div className="overflow-hidden border border-hairline bg-panel">
              {/* eslint-disable-next-line @next/next/no-img-element -- object URL of the user's own upload */}
              <img src={previewUrl} alt={t.home.previewAlt} className="max-h-[480px] w-full object-contain" />
            </div>
          </div>
        )}

        <div className={`flex flex-col gap-6 ${previewUrl ? "lg:col-span-7" : "lg:col-span-12"}`}>
          <section className="space-y-3">
            <Label>{t.report.style}</Label>
            <p className="font-display text-2xl leading-snug text-ink">{report.style.summary}</p>
            <div className="flex flex-wrap gap-1.5">
              {report.style.tags.map((tag) => (
                <span key={tag} className="border border-hairline px-2 py-0.5 font-mono text-[11px] text-ink">
                  {tag}
                </span>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <Label>{t.report.palette}</Label>
            <div className="flex h-10 overflow-hidden border border-hairline" aria-hidden="true">
              {report.colorPalette.map((color) => (
                <span key={color.hex} className="flex-1" style={{ backgroundColor: color.hex }} />
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {report.colorPalette.map((color) => (
                <div key={color.hex} className="flex items-center gap-2 bg-panel p-2">
                  <span className="h-8 w-8 shrink-0 border border-hairline" style={{ backgroundColor: color.hex }} aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs text-ink">{color.name}</p>
                    <p className="font-mono text-[11px] text-ink-muted">{color.hex}</p>
                  </div>
                  <CopyButton text={color.hex} label="Hex" className="font-mono text-[10px]" />
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <Label>{t.report.emotions}</Label>
            <div className="flex flex-wrap gap-1.5">
              {report.emotions.map((emotion) => (
                <span key={emotion} className="bg-panel-high px-2 py-1 text-xs text-signal-soft">
                  {emotion}
                </span>
              ))}
            </div>
          </section>
        </div>
      </div>

      {measurements && <ImageMeasurementPanel measurements={measurements} />}

      <ExportTabs
        prompts={report.prompts}
        colors={report.colorPalette}
        stock={[{ label: t.report.thisImage, stock: report.stock }]}
      />
    </div>
  );
}
