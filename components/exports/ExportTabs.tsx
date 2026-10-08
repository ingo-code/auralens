"use client";

import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { CopyButton } from "@/components/series/CopyButton";
import {
  buildColorTokens,
  exampleClasses,
  toTailwindV3Config,
  toTailwindV4Theme,
  type PaletteColor,
} from "@/lib/design-tokens";
import { useI18n } from "@/lib/i18n/client";
import {
  PROMPT_PLATFORM_LABELS,
  PROMPT_PLATFORMS,
  promptParts,
  type PlatformPrompts,
  type PromptPlatform,
} from "@/lib/prompt-engine";
import type { StockMetadata } from "@/lib/series-analysis-schema";
import { toAdobeStockCsv } from "@/lib/stock-export";

export type StockExportEntry = {
  /** Display label, e.g. "Bild 3". */
  label: string;
  /** Original file name; enables the Adobe Stock CSV export when present for all entries. */
  filename?: string;
  stock: StockMetadata;
};

type ExportTabsProps = {
  prompts: PlatformPrompts;
  colors: PaletteColor[];
  stock: StockExportEntry[];
  /** Optional style spec shown above the prompts (series only). */
  photographicSpec?: Record<string, string>;
};

const TABS = ["prompts", "tokens", "stock"] as const;
type TabKey = (typeof TABS)[number];

function CodeBlock({ text }: { text: string }) {
  return (
    <pre className="whitespace-pre-wrap break-words rounded-lg border border-stone-200 bg-stone-50 p-3 font-mono text-xs leading-relaxed text-stone-700">
      {text}
    </pre>
  );
}

function downloadText(content: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function PromptsPanel({ prompts, photographicSpec }: Pick<ExportTabsProps, "prompts" | "photographicSpec">) {
  const { t } = useI18n();
  const [platform, setPlatform] = useState<PromptPlatform>("midjourney");
  const parts = promptParts(prompts, platform);
  const partLabel = { main: PROMPT_PLATFORM_LABELS[platform], positive: t.exports.positive, negative: t.exports.negativeSdxl };

  return (
    <div className="space-y-4">
      {photographicSpec && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl bg-stone-50 p-3 text-xs sm:grid-cols-3">
          {Object.entries(photographicSpec).map(([key, value]) => (
            <div key={key} className="min-w-0">
              <dt className="text-stone-500">{t.exports.spec[key] ?? key}</dt>
              <dd className="text-stone-800">{value}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t.exports.platform}>
        {PROMPT_PLATFORMS.map((key) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={platform === key}
            onClick={() => setPlatform(key)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              platform === key
                ? "border-violet-300 bg-violet-50 text-violet-700"
                : "border-stone-200 text-stone-600 hover:border-stone-300"
            }`}
          >
            {PROMPT_PLATFORM_LABELS[key]}
          </button>
        ))}
      </div>

      {parts.map((part) => (
        <div key={`${platform}-${part.kind}`} className="space-y-1">
          <div className="flex items-center justify-between">
            <p className="text-xs text-stone-600">{partLabel[part.kind]}</p>
            <CopyButton text={part.text} label={t.exports.oneClickCopy} />
          </div>
          <CodeBlock text={part.text} />
        </div>
      ))}
      <p className="text-xs text-stone-500">{t.exports.platformHints[platform]}</p>
    </div>
  );
}

function TokensPanel({ colors }: Pick<ExportTabsProps, "colors">) {
  const { t } = useI18n();
  const [version, setVersion] = useState<"v4" | "v3">("v4");
  const tokens = useMemo(() => buildColorTokens(colors), [colors]);
  const snippet = version === "v4" ? toTailwindV4Theme(tokens) : toTailwindV3Config(tokens);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {tokens.map((token) => (
          <span
            key={token.key}
            className="flex items-center gap-1.5 rounded-full border border-stone-200 py-0.5 pl-0.5 pr-2.5 text-xs text-stone-700"
          >
            <span className="h-5 w-5 rounded-full border border-black/10" style={{ backgroundColor: token.hex }} />
            {token.key}
          </span>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1 rounded-lg bg-stone-100 p-0.5 text-xs" role="radiogroup" aria-label={t.exports.tailwindVersion}>
          {(["v4", "v3"] as const).map((key) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={version === key}
              onClick={() => setVersion(key)}
              className={`rounded-md px-2.5 py-1 font-medium ${
                version === key ? "bg-white text-stone-900 shadow-sm" : "text-stone-500"
              }`}
            >
              {key === "v4" ? "Tailwind v4 (@theme)" : "Tailwind v3 (config)"}
            </button>
          ))}
        </div>
        <CopyButton text={snippet} label={t.exports.copySnippet} />
      </div>
      <CodeBlock text={snippet} />
      <p className="text-xs text-stone-500">
        {t.exports.usage} <span className="font-mono">{exampleClasses(tokens).join(" · ")}</span>
      </p>
    </div>
  );
}

function StockPanel({ stock }: Pick<ExportTabsProps, "stock">) {
  const { t } = useI18n();
  const csvEntries = stock.every((entry) => entry.filename)
    ? stock.map((entry) => ({ filename: entry.filename!, stock: entry.stock }))
    : null;

  return (
    <div className="space-y-4">
      {csvEntries && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-violet-50/60 p-3 text-xs text-stone-600">
          <span>{t.exports.csvHint}</span>
          <button
            type="button"
            onClick={() =>
              downloadText(
                toAdobeStockCsv(csvEntries),
                `auralens-adobe-stock-${new Date().toISOString().slice(0, 10)}.csv`,
                "text/csv;charset=utf-8"
              )
            }
            className="rounded-lg bg-violet-100/70 px-3 py-1.5 font-medium text-violet-700 hover:bg-violet-100"
          >
            {t.exports.csvButton}
          </button>
        </div>
      )}

      {stock.map((entry) => (
        <div key={entry.label} className="space-y-2 rounded-xl border border-stone-200 p-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            {stock.length > 1 && <span className="font-medium text-stone-900">{entry.label}</span>}
            <span className="rounded-full bg-violet-100/70 px-2 py-0.5 text-violet-700">
              {t.labels.categories[entry.stock.category]}
            </span>
          </div>
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm text-stone-800">
              {entry.stock.title}{" "}
              <span className="text-xs text-stone-500">({t.exports.characters(entry.stock.title.length)})</span>
            </p>
            <CopyButton text={entry.stock.title} label={t.series.card.title} />
          </div>
          <div className="flex items-start justify-between gap-2">
            <p className="text-stone-600">{entry.stock.description}</p>
            <CopyButton text={entry.stock.description} label={t.exports.description} />
          </div>
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-wrap gap-1">
              {entry.stock.keywords.map((keyword, i) => (
                <span
                  key={`${i}-${keyword}`}
                  className={`rounded px-1.5 py-0.5 ${i < 10 ? "bg-stone-200/70 text-stone-800" : "bg-stone-100 text-stone-500"}`}
                >
                  {keyword}
                </span>
              ))}
            </div>
            <CopyButton
              text={entry.stock.keywords.join(", ")}
              label={t.exports.keywordsN(entry.stock.keywords.length)}
              className="shrink-0"
            />
          </div>
        </div>
      ))}
      <p className="text-xs text-stone-500">
        {t.exports.topKeywordsHint}
      </p>
    </div>
  );
}

/** Tabbed export section: platform prompts, Tailwind design tokens and stock SEO. */
export function ExportTabs({ prompts, colors, stock, photographicSpec }: ExportTabsProps) {
  const { t } = useI18n();
  const [active, setActive] = useState<TabKey>("prompts");
  const baseId = useId();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // WAI-ARIA tabs pattern: arrow keys move between tabs, Home/End jump.
  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const next =
      event.key === "ArrowRight"
        ? (index + 1) % TABS.length
        : event.key === "ArrowLeft"
          ? (index - 1 + TABS.length) % TABS.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? TABS.length - 1
              : null;
    if (next === null) return;
    event.preventDefault();
    setActive(TABS[next]);
    tabRefs.current[next]?.focus();
  };

  return (
    <section className="rounded-3xl border border-stone-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-x-3 border-b border-stone-200 px-4 pt-4 sm:px-6">
        <h2 className="pb-3 text-sm font-semibold uppercase tracking-wider text-violet-700">{t.exports.heading}</h2>
        <div role="tablist" aria-label={t.exports.heading} className="flex gap-1">
          {TABS.map((tab, i) => (
            <button
              key={tab}
              ref={(element) => {
                tabRefs.current[i] = element;
              }}
              id={`${baseId}-tab-${tab}`}
              type="button"
              role="tab"
              aria-selected={active === tab}
              aria-controls={`${baseId}-panel-${tab}`}
              tabIndex={active === tab ? 0 : -1}
              onClick={() => setActive(tab)}
              onKeyDown={(event) => onKeyDown(event, i)}
              className={`-mb-px border-b-2 px-3 pb-3 text-sm font-medium transition-colors ${
                active === tab
                  ? "border-fuchsia-500 text-stone-900"
                  : "border-transparent text-stone-500 hover:text-stone-800"
              }`}
            >
              {t.exports.tabs[tab]}
            </button>
          ))}
        </div>
      </div>

      <div
        id={`${baseId}-panel-${active}`}
        role="tabpanel"
        aria-labelledby={`${baseId}-tab-${active}`}
        tabIndex={0}
        className="p-4 sm:p-6"
      >
        {active === "prompts" && <PromptsPanel prompts={prompts} photographicSpec={photographicSpec} />}
        {active === "tokens" && <TokensPanel colors={colors} />}
        {active === "stock" && <StockPanel stock={stock} />}
      </div>
    </section>
  );
}
