import type { StyleAnalysis } from "@/lib/analysis-schema";
import { buildXmpSidecar, type EmbeddableMetadata } from "@/lib/embedded-metadata";
import type { Messages } from "@/lib/i18n";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { formatCorrection, measurementFormat } from "@/lib/measure/format";
import type { ImageMeasurements } from "@/lib/measure/image-metrics";
import { seriesMeasurementOf } from "@/lib/measure/series-comparison";
import type { SeriesAnalysis, SeriesImageFile, StockMetadata } from "@/lib/series-analysis-schema";
import { CSV_PORTAL_FILENAMES, CSV_PORTALS, toPortalCsv, type StockCsvEntry } from "@/lib/stock-export";
import { uniquePath, type ZipEntry } from "@/lib/zip";

/*
 * The downloadable report package: a readable report (Markdown), the raw
 * JSON, one metadata CSV per stock portal and an XMP sidecar per image.
 * Built in the browser from the report the user already has - nothing is
 * fetched or stored for it.
 */

export type ReportPackageInput =
  | { type: "image"; report: StyleAnalysis; files: SeriesImageFile[] }
  | { type: "series"; report: SeriesAnalysis; files: SeriesImageFile[] };

export function stockToEmbeddable(stock: StockMetadata): EmbeddableMetadata {
  return { title: stock.title, description: stock.description, keywords: stock.keywords };
}

function baseName(filename: string): string {
  const name = filename.split(/[\\/]/).pop() ?? filename;
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

/** Stock metadata per image, keyed by the original file name when known. */
export function stockEntriesOf(input: ReportPackageInput): { index: number; filename?: string; stock: StockMetadata }[] {
  const nameOf = (index: number) => input.files.find((file) => file.index === index)?.name;
  if (input.type === "image") return [{ index: 1, filename: nameOf(1) ?? input.files[0]?.name, stock: input.report.stock }];
  return input.report.images.map((image) => ({ index: image.index, filename: nameOf(image.index), stock: image.stock }));
}

function seriesMarkdown(report: SeriesAnalysis, files: SeriesImageFile[], t: Messages): string {
  const r = t.series.results;
  const p = t.reportPackage;
  const nameOf = (index: number) => files.find((file) => file.index === index)?.name;
  const lines: string[] = [
    `# ${report.series.title}`,
    "",
    report.series.summary,
    "",
    `## ${r.overall}: ${report.consistency.overallScore}/100 – ${r.band(report.consistency.overallScore)}`,
    "",
    ...(["color", "lighting", "postProcessing", "composition"] as const).map(
      (key) => `- ${r.dimensions[key]}: ${report.consistency.dimensions[key]}/100`
    ),
    "",
    report.consistency.verdict,
    "",
    `### ${r.recommendations}`,
    "",
    ...report.consistency.recommendations.map((item, i) => `${i + 1}. ${item}`),
    "",
    `## ${p.imagesHeading}`,
  ];

  for (const image of report.images) {
    const name = nameOf(image.index);
    lines.push(
      "",
      `### ${t.common.image(image.index)}${name ? ` – ${name}` : ""} · ${r.consistency} ${image.consistencyScore}/100`,
      "",
      image.summary,
      ""
    );
    if (image.deviations.length === 0) {
      lines.push(`- ${r.recipeNone}`);
    } else {
      for (const deviation of image.deviations) {
        lines.push(
          `- **${t.labels.deviations[deviation.aspect]}** (${r.severity[deviation.severity]}): ${deviation.description}`,
          `  - ${r.recipe}: ${deviation.fix}`
        );
      }
    }
  }

  lines.push(
    "",
    `## ${r.masterPalette}`,
    "",
    ...report.masterPalette.colors.map((color) => `- \`${color.hex}\` ${color.name}`),
    "",
    `${r.harmony}: ${t.labels.harmonies[report.masterPalette.harmony.type]} – ${report.masterPalette.harmony.description}`,
    "",
    `## ${r.dramaturgy}`,
    "",
    report.narrative.arcSummary,
    "",
    `${r.suggestedOrder} ${report.narrative.suggestedOrder.join(" → ")}`,
    "",
    report.narrative.orderRationale
  );
  if (report.narrative.missingShots.length) lines.push("", `${r.missing} ${report.narrative.missingShots.join(", ")}`);
  return lines.join("\n");
}

function imageMarkdown(report: StyleAnalysis, files: SeriesImageFile[], t: Messages): string {
  const name = files[0]?.name;
  return [
    `# ${report.stock.title}`,
    ...(name ? ["", name] : []),
    "",
    `## ${t.report.style}`,
    "",
    report.style.summary,
    "",
    report.style.tags.join(" · "),
    "",
    `## ${t.report.palette}`,
    "",
    ...report.colorPalette.map((color) => `- \`${color.hex}\` ${color.name}`),
    "",
    `## ${t.report.emotions}`,
    "",
    report.emotions.join(", "),
  ].join("\n");
}

function measurementMarkdown(input: ReportPackageInput, t: Messages, locale: Locale): string | null {
  const { num, signed, pct } = measurementFormat(locale);
  const mt = t.measurement;
  if (input.type === "image") {
    const m: ImageMeasurements | undefined = input.files[0]?.measurements;
    if (!m) return null;
    const v = mt.values;
    return [
      `## ${mt.heading}`,
      "",
      mt.imageIntro,
      "",
      `- ${v.key}: ${signed(m.exposure.keyEv, 2)} EV`,
      `- ${v.whiteBalance}: ${m.whiteBalance.kelvin} K`,
      `- ${v.cast}: ${signed(m.whiteBalance.neutral.a)} / ${signed(m.whiteBalance.neutral.b)}`,
      `- ${v.duv}: ${signed(m.whiteBalance.duv, 4)}`,
      `- ${v.contrast}: ${num(m.contrast.rms)}`,
      `- ${v.chroma}: ${num(m.color.meanChroma)} / ${num(m.color.colorfulness)}`,
      `- ${v.sharpness}: ${Math.round(m.sharpness.focus)} / ${Math.round(m.sharpness.global)}`,
      `- ${v.noise}: ${num(m.noise.sigma, 2)}`,
      `- ${v.clipping}: ${pct(m.clipping.highlights)} / ${pct(m.clipping.shadows)}`,
      `- ${v.palette}: ${m.palette.map((color) => `${color.hex} ${pct(color.share)}`).join(", ")}`,
      "",
      `${mt.neutralHint} ${mt.notes}`,
    ].join("\n");
  }

  const series = seriesMeasurementOf(input.files);
  if (!series) return null;
  const c = mt.columns;
  const ref = series.reference;
  const byIndex = new Map(input.files.map((file) => [file.index, file.measurements!]));
  const lines = [
    `## ${mt.heading}`,
    "",
    `${mt.seriesIntro} ${mt.measuredScore}: ${series.overallScore}/100`,
    "",
    `| ${[c.image, c.score, c.exposure, c.whiteBalance, c.tint, c.contrast, c.chroma, c.sharpness, c.noise, c.clipping, c.correction].join(" | ")} |`,
    `|${" --- |".repeat(11)}`,
    `| ${mt.reference} | – | ${num(ref.keyEv, 2)} EV | ${ref.kelvin} K | ${num(ref.duv, 4)} | ${num(ref.contrastRms)} | ${num(ref.meanChroma)} | ${Math.round(ref.focus)} | ${num(ref.noiseSigma, 2)} | – | – |`,
  ];
  for (const image of series.images) {
    const m = byIndex.get(image.index)!;
    const extra = image.deviations
      .filter((d) => ["sharpness", "noise", "highlights", "shadows"].includes(d.aspect))
      .map((d) => `${mt.aspects[d.aspect]} (${t.series.results.severity[d.severity]})`);
    const correction = [...formatCorrection(image.correction, t, locale), ...extra].join("; ") || mt.none;
    lines.push(
      `| ${t.common.image(image.index)} | ${image.score} | ${num(m.exposure.keyEv, 2)} EV | ${m.whiteBalance.kelvin} K | ` +
        `${num(m.whiteBalance.duv, 4)} | ${num(m.contrast.rms)} | ${num(m.color.meanChroma)} | ${Math.round(m.sharpness.focus)} | ` +
        `${num(m.noise.sigma, 2)} | ${pct(m.clipping.highlights)} / ${pct(m.clipping.shadows)} | ${correction} |`
    );
  }
  lines.push("", mt.notes);
  return lines.join("\n");
}

function stockMarkdown(entries: ReturnType<typeof stockEntriesOf>, t: Messages): string {
  const lines = [`## ${t.reportPackage.stockHeading}`];
  for (const entry of entries) {
    lines.push(
      "",
      `### ${t.common.image(entry.index)}${entry.filename ? ` – ${entry.filename}` : ""}`,
      "",
      `- ${t.series.card.title}: ${entry.stock.title}`,
      `- ${t.exports.description}: ${entry.stock.description}`,
      `- ${t.series.card.keywords}: ${entry.stock.keywords.join(", ")}`
    );
  }
  return lines.join("\n");
}

export function reportMarkdown(
  input: ReportPackageInput,
  t: Messages,
  createdAt?: string,
  locale: Locale = DEFAULT_LOCALE
): string {
  const content = input.type === "series" ? seriesMarkdown(input.report, input.files, t) : imageMarkdown(input.report, input.files, t);
  const measured = measurementMarkdown(input, t, locale);
  const body = measured ? `${content}\n\n${measured}` : content;
  const footer = [
    "---",
    "",
    t.reportPackage.footer(createdAt ? new Date(createdAt).toISOString().slice(0, 10) : undefined),
    "",
    t.reportPackage.contentsHint,
  ];
  return [body, "", stockMarkdown(stockEntriesOf(input), t), "", ...footer, ""].join("\n");
}

export function buildReportPackage(
  input: ReportPackageInput,
  t: Messages,
  createdAt?: string,
  locale: Locale = DEFAULT_LOCALE
): ZipEntry[] {
  const p = t.reportPackage;
  const entries: ZipEntry[] = [
    { path: p.reportFile, data: reportMarkdown(input, t, createdAt, locale) },
    { path: "report.json", data: JSON.stringify({ type: input.type, files: input.files, report: input.report }, null, 2) },
  ];

  const stock = stockEntriesOf(input);
  const named = stock.filter((entry): entry is StockCsvEntry & { index: number } => Boolean(entry.filename));
  if (named.length === stock.length) {
    for (const portal of CSV_PORTALS) {
      entries.push({ path: `csv/${CSV_PORTAL_FILENAMES[portal]}`, data: toPortalCsv(portal, named) });
    }
  }

  const used = new Set<string>();
  for (const entry of stock) {
    const stem = entry.filename ? baseName(entry.filename) : `image-${entry.index}`;
    entries.push({ path: `xmp/${uniquePath(`${stem}.xmp`, used)}`, data: buildXmpSidecar(stockToEmbeddable(entry.stock)) });
  }
  return entries;
}
