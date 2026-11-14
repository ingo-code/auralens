/*
 * Cost/quality comparison of model and effort settings per series part
 * ("Stufe 2"). Runs the real series analysis on the test series in
 * ../testbilder and writes a Markdown report to ../eval-ergebnisse/.
 *
 * Costs real money (about 2 USD for all configurations) - it only runs with
 *   EVAL_CONFIRM=1 npx vitest run -c vitest.eval.config.mts
 * Optional: EVAL_CONFIGS=basis,sonnet-low (comma-separated names below).
 *
 * Ground truth of the test series: image 2 has a deliberate warm cast, image
 * 5 shows a different motif (old town instead of beach). A good consistency
 * check rates exactly these two lowest and tells image 2 to go cooler.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { SeriesStep } from "@/lib/analysis-steps";
import type { PartSettings } from "@/lib/claude/client";
import type { ClaudeUsageEntry } from "@/lib/claude/usage";
import { compressImageForAnalysis } from "@/lib/image-processing";
import type { SeriesAnalysis } from "@/lib/series-analysis-schema";

const ROOT = path.resolve(process.cwd(), "..");
const IMAGE_DIR = path.join(ROOT, "testbilder");
const OUT_DIR = path.join(ROOT, "eval-ergebnisse");
const FILES = ["s1-wide.jpg", "s2-footprints-WARMCAST.jpg", "s3-trees.jpg", "s4-water.jpg", "s5-bridge.jpg"];
const OUTLIERS = [2, 5];
const WARM_IMAGE = 2;

const OPUS = "claude-opus-5-5";
const SONNET = "claude-sonnet-5-5";
const HAIKU = "claude-haiku-5-5";
const s = (model: string, effort: PartSettings["effort"]): PartSettings => ({ model, effort });

type Config = { name: string; label: string; settings: Record<SeriesStep, PartSettings> };

const CONFIGS: Config[] = [
  {
    name: "basis",
    label: "Heute: alles Opus 5.5 high",
    settings: { consistency: s(OPUS, "high"), market: s(OPUS, "high"), prompts: s(OPUS, "high") },
  },
  {
    name: "basis-2",
    label: "Heute (2. Lauf, Streuung)",
    settings: { consistency: s(OPUS, "high"), market: s(OPUS, "high"), prompts: s(OPUS, "high") },
  },
  {
    name: "opus-low",
    label: "Markt + Prompts: Opus low",
    settings: { consistency: s(OPUS, "high"), market: s(OPUS, "low"), prompts: s(OPUS, "low") },
  },
  {
    name: "sonnet-low",
    label: "Markt + Prompts: Sonnet 5.5 low",
    settings: { consistency: s(OPUS, "high"), market: s(SONNET, "low"), prompts: s(SONNET, "low") },
  },
  {
    name: "haiku",
    label: "Markt + Prompts: Haiku 5.5 medium",
    settings: { consistency: s(OPUS, "high"), market: s(HAIKU, "medium"), prompts: s(HAIKU, "medium") },
  },
  {
    name: "konsistenz-medium",
    label: "Konsistenz medium, Markt + Prompts Opus low",
    settings: { consistency: s(OPUS, "medium"), market: s(OPUS, "low"), prompts: s(OPUS, "low") },
  },
];

/** USD per million tokens - same list as the SQL view `analysis_costs`. */
const PRICES: { prefix: string; input: number; output: number; cacheRead: number }[] = [
  { prefix: "claude-opus-5-5", input: 4, output: 20, cacheRead: 0.05 },
  { prefix: "claude-opus-5", input: 5, output: 25, cacheRead: 0.1 },
  { prefix: "claude-sonnet-5-5", input: 2, output: 10, cacheRead: 0.05 },
  { prefix: "claude-haiku-5-5", input: 0.1, output: 0.5, cacheRead: 0.1 },
];

function costUsd(entry: ClaudeUsageEntry): number {
  const price = [...PRICES]
    .sort((a, b) => b.prefix.length - a.prefix.length)
    .find((p) => entry.model.startsWith(p.prefix));
  if (!price) return NaN;
  return (
    (entry.inputTokens * price.input +
      entry.cacheReadTokens * price.input * price.cacheRead +
      entry.cacheWriteTokens * price.input * 1.25 +
      entry.outputTokens * price.output) /
    1e6
  );
}

/** Only the API key is taken from .env.local; it is never printed. */
function loadApiKey(): void {
  if (process.env.ANTHROPIC_API_KEY) return;
  const line = readFileSync(path.resolve(process.cwd(), ".env.local"), "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith("ANTHROPIC_API_KEY="));
  const key = line?.slice("ANTHROPIC_API_KEY=".length).replace(/["'\s]/g, "");
  if (!key) throw new Error("ANTHROPIC_API_KEY fehlt in .env.local");
  process.env.ANTHROPIC_API_KEY = key;
}

type Checks = {
  outliersLowest: boolean;
  scoreGap: number;
  warmFixCooler: boolean;
  keywordsOk: boolean;
  midjourneyAr: boolean;
};

function checkQuality(report: SeriesAnalysis): Checks {
  const scores = new Map(report.images.map((image) => [image.index, image.consistencyScore]));
  const lowestTwo = [...scores.entries()].sort((a, b) => a[1] - b[1]).slice(0, 2).map(([index]) => index);
  const outlierMax = Math.max(...OUTLIERS.map((i) => scores.get(i) ?? 100));
  const othersMin = Math.min(...[...scores.entries()].filter(([i]) => !OUTLIERS.includes(i)).map(([, v]) => v));
  const warm = report.images.find((image) => image.index === WARM_IMAGE);
  const warmText = (warm?.deviations ?? []).map((d) => `${d.description} ${d.fix}`).join(" ");
  return {
    outliersLowest: [...lowestTwo].sort().join() === [...OUTLIERS].sort().join(),
    scoreGap: othersMin - outlierMax,
    // "-1400 K", "−800 K", "kühler", "Richtung Blau" ...
    warmFixCooler: /[-−–]\s?\d{2,4}\s?K\b|kühler|Richtung Blau|cooler/i.test(warmText),
    keywordsOk: report.images.every((image) => image.stock.keywords.length >= 20),
    midjourneyAr: /--ar \d+:\d+/.test(JSON.stringify(report.aiPrompts.midjourney)),
  };
}

type RunResult = {
  config: Config;
  ms: number;
  usage: ClaudeUsageEntry[];
  cost: number;
  report?: SeriesAnalysis;
  checks?: Checks;
  error?: string;
};

const yes = (ok: boolean | undefined) => (ok ? "✅" : "❌");
const usd = (value: number) => (Number.isFinite(value) ? `${value.toFixed(3)} $` : "?");

function renderReport(results: RunResult[], images: number): string {
  const base = results.find((r) => r.config.name === "basis")?.cost;
  const lines = [
    `# Stufe 2 – Kosten/Qualität (${new Date().toLocaleString("de-DE")})`,
    "",
    `Testserie: ${images} Bilder aus \`testbilder/\`. Soll: Bild 2 (Gelbstich) und Bild 5 (anderes Motiv) am niedrigsten, Bild 2 soll kühler werden.`,
    "",
    "| Variante | Kosten | pro Bild | vs. heute | Dauer | Ausreißer 2+5 | Abstand | Bild 2 kühler | Keywords | --ar |",
    "|---|---:|---:|---:|---:|:-:|---:|:-:|:-:|:-:|",
  ];
  for (const r of results) {
    const c = r.checks;
    const delta = base ? `${Math.round((r.cost / base - 1) * 100)} %` : "–";
    lines.push(
      r.error
        ? `| ${r.config.label} | ${usd(r.cost)} | | | | Fehler: ${r.error} | | | | |`
        : `| ${r.config.label} | ${usd(r.cost)} | ${usd(r.cost / images)} | ${delta} | ${Math.round(r.ms / 1000)} s | ` +
            `${yes(c?.outliersLowest)} | ${c?.scoreGap} | ${yes(c?.warmFixCooler)} | ${yes(c?.keywordsOk)} | ${yes(c?.midjourneyAr)} |`
    );
  }
  lines.push("", "## Details pro Variante (zum Vergleichen mit dem Auge)", "");
  for (const r of results) {
    lines.push(`### ${r.config.label}`, "");
    lines.push(
      "Tokens: " +
        r.usage.map((u) => `${u.part} (${u.model}): ${u.inputTokens} in / ${u.outputTokens} out = ${usd(costUsd(u))}`).join(" · "),
      ""
    );
    if (!r.report) continue;
    const rep = r.report;
    lines.push(`- **Scores:** ${rep.images.map((i) => `Bild ${i.index}: ${i.consistencyScore}`).join(", ")}`);
    lines.push(`- **Urteil:** ${rep.consistency.verdict}`);
    const warm = rep.images.find((i) => i.index === WARM_IMAGE);
    for (const d of warm?.deviations ?? []) lines.push(`- **Bild 2 – ${d.aspect}:** ${d.description} → _${d.fix}_`);
    lines.push(`- **Stock Bild 1:** ${rep.images[0].stock.title} – ${rep.images[0].stock.keywords.slice(0, 10).join(", ")}`);
    lines.push(`- **Midjourney:** ${JSON.stringify(rep.aiPrompts.midjourney).slice(0, 300)}`, "");
  }
  return lines.join("\n");
}

const confirmed = process.env.EVAL_CONFIRM === "1";

describe.skipIf(!confirmed)("Stufe 2: Kosten/Qualität pro Teil", () => {
  it("vergleicht die Varianten auf der Testserie", async () => {
    loadApiKey();
    // Imported after the key is set; the client is created lazily anyway.
    const { analyzeSeries } = await import("@/lib/services/series-analysis");

    const wanted = process.env.EVAL_CONFIGS?.split(",").map((n) => n.trim());
    const configs = wanted ? CONFIGS.filter((c) => wanted.includes(c.name)) : CONFIGS;
    expect(configs.length).toBeGreaterThan(0);

    const images = await Promise.all(
      FILES.map((file) => compressImageForAnalysis(readFileSync(path.join(IMAGE_DIR, file))))
    );

    const results: RunResult[] = [];
    // One after the other: parallel runs would distort the timings and hit rate limits.
    for (const config of configs) {
      const usage: ClaudeUsageEntry[] = [];
      const startedAt = Date.now();
      console.info(`[eval] ${config.name} ...`);
      try {
        const report = await analyzeSeries(images, "de", undefined, {
          settings: config.settings,
          onUsage: (entry) => usage.push(entry),
        });
        const cost = usage.reduce((sum, u) => sum + costUsd(u), 0);
        results.push({ config, ms: Date.now() - startedAt, usage, cost, report, checks: checkQuality(report) });
      } catch (error) {
        const cost = usage.reduce((sum, u) => sum + costUsd(u), 0);
        results.push({ config, ms: Date.now() - startedAt, usage, cost, error: String(error).slice(0, 200) });
      }
      console.info(`[eval] ${config.name}: ${usd(results.at(-1)!.cost)}`);
    }

    mkdirSync(OUT_DIR, { recursive: true });
    const file = path.join(OUT_DIR, `stufe2-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.md`);
    writeFileSync(file, renderReport(results, images.length));
    writeFileSync(file.replace(/\.md$/, ".json"), JSON.stringify(results, null, 2));
    console.info(`[eval] Bericht: ${file}`);
    console.info(`[eval] Gesamtkosten: ${usd(results.reduce((sum, r) => sum + r.cost, 0))}`);
  });
});
