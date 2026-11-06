"use client";

import { useMemo } from "react";
import { useI18n } from "@/lib/i18n/client";
import { formatCorrection, measurementFormat } from "@/lib/measure/format";
import type { ImageMeasurements } from "@/lib/measure/image-metrics";
import { seriesMeasurementOf } from "@/lib/measure/series-comparison";
import type { SeriesImageFile } from "@/lib/series-analysis-schema";

const SEVERITY_STYLES = { high: "text-red-700", medium: "text-amber-700", low: "text-ink-muted" } as const;

function useFormat() {
  const { locale, t } = useI18n();
  return useMemo(() => ({ t, locale, ...measurementFormat(locale) }), [locale, t]);
}

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-ink-muted">
      <span className="inline-block h-2 w-2 bg-signal" aria-hidden="true" />
      {children}
    </h2>
  );
}

/** Measured comparison table of a series; renders nothing for analyses without measurements. */
export function SeriesMeasurementTable({ files }: { files: SeriesImageFile[] }) {
  const { t, locale, num, pct } = useFormat();
  const series = useMemo(() => seriesMeasurementOf(files), [files]);
  if (!series) return null;
  const c = t.measurement.columns;
  const ref = series.reference;
  const byIndex = new Map(files.map((file) => [file.index, file]));

  return (
    <section className="space-y-3 border border-hairline bg-panel p-4 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Heading>{t.measurement.heading}</Heading>
        <span className="font-mono text-xs text-ink-muted">
          {t.measurement.measuredScore}: <span className="text-ink">{series.overallScore}</span>/100
        </span>
      </div>
      <p className="text-xs text-ink-muted">{t.measurement.seriesIntro}</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] border-collapse font-mono text-[11px]">
          <thead>
            <tr className="border-b border-hairline text-left text-ink-muted">
              {[c.image, c.score, c.exposure, c.whiteBalance, c.tint, c.contrast, c.chroma, c.sharpness, c.noise, c.clipping, c.correction].map(
                (label) => (
                  <th key={label} scope="col" className="px-2 py-1.5 font-medium">
                    {label}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-hairline text-ink-muted">
              <th scope="row" className="px-2 py-1.5 text-left font-medium">
                {t.measurement.reference}
              </th>
              <td className="px-2 py-1.5">–</td>
              <td className="px-2 py-1.5">{num(ref.keyEv, 2)} EV</td>
              <td className="px-2 py-1.5">{ref.kelvin} K</td>
              <td className="px-2 py-1.5">{num(ref.duv, 4)}</td>
              <td className="px-2 py-1.5">{num(ref.contrastRms)}</td>
              <td className="px-2 py-1.5">{num(ref.meanChroma)}</td>
              <td className="px-2 py-1.5">{Math.round(ref.focus)}</td>
              <td className="px-2 py-1.5">{num(ref.noiseSigma, 2)}</td>
              <td className="px-2 py-1.5">–</td>
              <td className="px-2 py-1.5">–</td>
            </tr>
            {series.images.map((image) => {
              const m = byIndex.get(image.index)!.measurements!;
              const flagged = new Map(image.deviations.map((d) => [d.aspect, d.severity]));
              const cell = (aspect: Parameters<typeof flagged.get>[0]) =>
                `px-2 py-1.5 ${flagged.has(aspect) ? SEVERITY_STYLES[flagged.get(aspect)!] + " font-semibold" : "text-ink"}`;
              const correction = formatCorrection(image.correction, t, locale);
              const other = image.deviations.filter((d) => ["sharpness", "noise", "highlights", "shadows"].includes(d.aspect));
              return (
                <tr key={image.index} className="border-b border-hairline align-top">
                  <th scope="row" className="px-2 py-1.5 text-left font-medium text-ink">
                    {t.common.image(image.index)}
                  </th>
                  <td className={`px-2 py-1.5 ${image.score < 70 ? "text-signal-soft" : "text-ink"}`}>{image.score}</td>
                  <td className={cell("exposure")}>{num(m.exposure.keyEv, 2)} EV</td>
                  <td className={cell("white_balance")}>{m.whiteBalance.kelvin} K</td>
                  <td className={cell("tint")}>{num(m.whiteBalance.duv, 4)}</td>
                  <td className={cell("contrast")}>{num(m.contrast.rms)}</td>
                  <td className={cell("saturation")}>{num(m.color.meanChroma)}</td>
                  <td className={cell("sharpness")}>{Math.round(m.sharpness.focus)}</td>
                  <td className={cell("noise")}>{num(m.noise.sigma, 2)}</td>
                  <td className={flagged.has("highlights") || flagged.has("shadows") ? "px-2 py-1.5 font-semibold text-amber-700" : "px-2 py-1.5 text-ink"}>
                    {pct(m.clipping.highlights)} / {pct(m.clipping.shadows)}
                  </td>
                  <td className="px-2 py-1.5 font-sans text-xs text-ink">
                    {correction.length === 0 && other.length === 0 ? (
                      <span className="text-ink-muted">{t.measurement.none}</span>
                    ) : (
                      <ul className="space-y-0.5">
                        {correction.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                        {other.map((d) => (
                          <li key={d.aspect} className={SEVERITY_STYLES[d.severity]}>
                            {t.measurement.aspects[d.aspect]} ({t.series.results.severity[d.severity]})
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-ink-muted">{t.measurement.notes}</p>
    </section>
  );
}

/** Absolute measured values of a single image. */
export function ImageMeasurementPanel({ measurements: m }: { measurements: ImageMeasurements }) {
  const { t, num, signed, pct } = useFormat();
  const v = t.measurement.values;
  const rows: [string, string][] = [
    [v.key, `${signed(m.exposure.keyEv, 2)} EV`],
    [v.lightness, `${num(m.exposure.lightness.p2)} / ${num(m.exposure.lightness.p50)} / ${num(m.exposure.lightness.p98)}`],
    [v.whiteBalance, `${m.whiteBalance.kelvin} K`],
    [v.cast, `${signed(m.whiteBalance.neutral.a)} / ${signed(m.whiteBalance.neutral.b)}`],
    [v.duv, signed(m.whiteBalance.duv, 4)],
    [v.contrast, num(m.contrast.rms)],
    [v.chroma, `${num(m.color.meanChroma)} / ${num(m.color.colorfulness)}`],
    [v.sharpness, `${Math.round(m.sharpness.focus)} / ${Math.round(m.sharpness.global)}`],
    [v.noise, num(m.noise.sigma, 2)],
    [v.clipping, `${pct(m.clipping.highlights)} / ${pct(m.clipping.shadows)}`],
  ];

  return (
    <section className="space-y-3 border border-hairline bg-panel p-4 sm:p-6">
      <Heading>{t.measurement.heading}</Heading>
      <p className="text-xs text-ink-muted">{t.measurement.imageIntro}</p>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3 border-b border-hairline py-1 text-xs">
            <dt className="text-ink-muted">{label}</dt>
            <dd className="font-mono text-ink">{value}</dd>
          </div>
        ))}
      </dl>
      {m.clipping.highlights >= 0.01 && <p className="text-xs text-amber-700">{t.measurement.clipWarning(pct(m.clipping.highlights))}</p>}
      <div className="space-y-1.5">
        <p className="text-xs text-ink-muted">{v.palette}</p>
        <div className="flex h-6 overflow-hidden border border-hairline" aria-hidden="true">
          {m.palette.map((color) => (
            <span key={color.hex} style={{ backgroundColor: color.hex, flexGrow: color.share }} />
          ))}
        </div>
        <p className="font-mono text-[11px] text-ink-muted">
          {m.palette.map((color) => `${color.hex} ${pct(color.share)}`).join(" · ")}
        </p>
      </div>
      <p className="text-[11px] text-ink-muted">
        {t.measurement.neutralHint} {t.measurement.notes}
      </p>
    </section>
  );
}
