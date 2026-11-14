import type Anthropic from "@anthropic-ai/sdk";
import type { SeriesStep } from "@/lib/analysis-steps";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import {
  buildSystemPrompt,
  CLAUDE_EFFORT,
  CLAUDE_MODEL,
  getClaudeClient,
  outputLanguage,
  partSettings,
  PROMPT_CACHE_ENABLED,
  type PartSettings,
} from "@/lib/claude/client";
import { AnalysisError } from "@/lib/claude/errors";
import { logUsage, toUsageEntry, type UsageSink } from "@/lib/claude/usage";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import type { ProcessedImage } from "@/lib/image-processing";
import { measuredFactsPrompt } from "@/lib/measure/prompt-facts";
import { aspectRatioInstruction, dominantAspectRatio } from "@/lib/prompt-engine";
import {
  ConsistencyPartSchema,
  MarketPartSchema,
  PromptsPartSchema,
  type ConsistencyPart,
  type MarketPart,
  type PromptsPart,
  type SeriesAnalysis,
} from "@/lib/series-analysis-schema";

// A 10-image part (e.g. 10x stock metadata with 25 keywords) plus adaptive
// thinking can exceed the 16k that is safe without streaming, so requests
// are streamed and only the final message is used.
const MAX_TOKENS = 32000;

const SERIES_CONTEXT =
  "Die Bilder oben bilden eine zusammenhängende Serie (z. B. eine Kampagne, ein " +
  "Instagram-Karussell oder eine Webshop-Galerie). Bildnummern sind 1-basiert und entsprechen " +
  "der Reihenfolge, in der die Bilder übergeben wurden. Liefere für jedes Bild genau einen Eintrag.";

const CONSISTENCY_PROMPT =
  `${SERIES_CONTEXT}\n\n` +
  "Analysiere die Serie als Ganzes:\n" +
  "1. Konsistenz: Vergleiche Farbtemperatur, Farbstich, Sättigung, Licht, Kontrast, Grading und " +
  "Bildsprache aller Bilder miteinander. Benenne Ausreißer konkret mit Bildnummer und gib " +
  "umsetzbare Korrekturvorschläge für die Bildbearbeitung. Bewerte streng: Ein Score über 90 nur, " +
  "wenn die Serie wirklich wie aus einem Guss wirkt.\n" +
  "2. Visueller Spannungsbogen: Bestimme die dramaturgische Rolle jedes Bildes und schlage die " +
  "wirkungsvollste Reihenfolge vor.";

// Shared by parts 2 and 3, which both derive assets from the series' look.
const MAJORITY_LOOK =
  "Maßgeblich ist der gemeinsame Look der Mehrheit der Bilder: Weicht ein einzelnes Bild in " +
  "Farbe, Grading oder Belichtung deutlich vom Rest ab, ist das ein Fehler in der Serie und kein " +
  "Stilmerkmal - übernimm es nicht.";

const MARKET_PROMPT =
  `${SERIES_CONTEXT}\n\n` +
  `Leite aus der Serie kommerziell verwertbare Assets ab. ${MAJORITY_LOOK}\n` +
  "1. Master-Farbpalette: Eine gemeinsame Palette für die gesamte Kampagne, nutzbar als " +
  "Design-System.\n" +
  "2. Markt-Fit: Für welche Branchen, Zielgruppen und Einsatzzwecke eignet sich die Serie, und " +
  "welche unbewussten Emotionen löst sie aus?\n" +
  "3. Stock-Readiness: Pro Bild verkaufsstarke Stock-Metadaten (Titel, Beschreibung, 25 Keywords) " +
  "für Adobe Stock / Shutterstock.\n\n" +
  "Stock-Metadaten immer auf Englisch.";

function buildPromptsPrompt(aspectRatio: string): string {
  return (
    `${SERIES_CONTEXT}\n\n` +
    `Destilliere den gemeinsamen fotografischen Stil der Serie. ${MAJORITY_LOOK}\n` +
    "1. Stil-Spezifikation: Brennweite, Blende, Licht, Filmstock, Grading, Stimmung.\n" +
    "2. Prompt-Engine: Daraus je ein Prompt für Midjourney V8.2, FLUX.2/FLUX 3, Adobe Firefly " +
    "Image 5 und ChatGPT Images 2.5, mit dem sich neue Motive im Look dieser Serie erzeugen lassen.\n" +
    `${aspectRatioInstruction(aspectRatio)}\n\n` +
    "Alle Prompts immer auf Englisch."
  );
}

/**
 * The numbered images - the identical start of all three part requests. With
 * caching on, the last image carries the cache breakpoint, so system prompt +
 * images are written to the cache once and read by every part.
 */
function buildImageContent(images: ProcessedImage[], cache: boolean): Anthropic.ContentBlockParam[] {
  return images.flatMap((image, i): Anthropic.ContentBlockParam[] => [
    // Explicit labels let the model reference images reliably by number.
    { type: "text", text: `Bild ${i + 1}:` },
    {
      type: "image",
      source: { type: "base64", media_type: image.mediaType, data: image.data.toString("base64") },
      ...(cache && i === images.length - 1 ? { cache_control: { type: "ephemeral" as const } } : {}),
    },
  ]);
}

/*
 * The three parts start at the same moment, so without help each would write
 * its own cache entry. A `max_tokens: 0` request first writes the entry
 * (system + images, ~1.25x input price, no output), then all three parts read
 * it (0.05x on Opus 5.5) instead of paying the images three times.
 * Model, system prompt, thinking and effort must match the part requests.
 * A failed pre-warm only costs the saving - the parts still run.
 */
async function prewarmImageCache(
  imageContent: Anthropic.ContentBlockParam[],
  locale: Locale,
  signal: AbortSignal,
  onUsage?: UsageSink
): Promise<void> {
  const startedAt = Date.now();
  try {
    const message = await getClaudeClient().messages.create(
      {
        model: CLAUDE_MODEL,
        max_tokens: 0,
        system: buildSystemPrompt(locale),
        messages: [{ role: "user", content: imageContent }],
        output_config: { effort: CLAUDE_EFFORT },
      },
      { signal }
    );
    const usage = toUsageEntry("cache", message.model ?? CLAUDE_MODEL, message.usage, startedAt);
    logUsage("series-analysis", usage, message.stop_reason);
    onUsage?.(usage);
  } catch (error) {
    if (signal.aborted) throw error;
    console.error("[series-analysis] Cache-Vorwärmen fehlgeschlagen, Analyse läuft ohne Cache weiter:", error);
  }
}

async function requestPart<T extends z.ZodType>(
  part: SeriesStep,
  imageContent: Anthropic.ContentBlockParam[],
  prompt: string,
  schema: T,
  locale: Locale,
  signal: AbortSignal,
  options: SeriesOptions
): Promise<z.infer<T>> {
  const startedAt = Date.now();
  const { model, effort } = options.settings?.[part] ?? partSettings(part);
  const stream = getClaudeClient().messages.stream(
    {
      model,
      max_tokens: MAX_TOKENS,
      system: buildSystemPrompt(locale),
      messages: [
        {
          role: "user",
          content: [
            ...imageContent,
            { type: "text", text: `${prompt}\n\nAusgabesprache aller übrigen Texte: ${outputLanguage(locale)}.` },
          ],
        },
      ],
      output_config: { format: zodOutputFormat(schema), effort },
    },
    { signal }
  );

  const message = await stream.finalMessage();

  // Recorded before the checks below: refused or truncated answers are billed too.
  const usage = toUsageEntry(part, message.model ?? model, message.usage, startedAt);
  logUsage("series-analysis", usage, message.stop_reason);
  options.onUsage?.(usage);

  if (message.stop_reason === "refusal") {
    throw new AnalysisError("refusal", 422);
  }
  if (message.stop_reason === "max_tokens") {
    throw new AnalysisError("truncated", 502);
  }
  if (message.parsed_output == null) {
    throw new AnalysisError("unparsableReport", 502);
  }

  return message.parsed_output as z.infer<T>;
}

export type SeriesOptions = {
  /** Aborts all parts (deadline of the job runner). */
  signal?: AbortSignal;
  /** Receives the token usage of every finished request. */
  onUsage?: UsageSink;
  /** Per-part model/effort; defaults to `partSettings` (env). Used by the cost/quality eval. */
  settings?: Partial<Record<SeriesStep, PartSettings>>;
};

/**
 * Merges all three parts into the client-facing report and cross-checks what the
 * schema can't express because it depends on the number of uploaded images.
 * Per-image entries come back sorted by index.
 */
export function mergeSeriesParts(
  consistency: ConsistencyPart,
  market: MarketPart,
  prompts: PromptsPart,
  imageCount: number
): SeriesAnalysis {
  const expected = Array.from({ length: imageCount }, (_, i) => i + 1);
  const coversAllImages = (values: number[]) =>
    values.length === imageCount &&
    [...values].sort((a, b) => a - b).every((value, i) => value === expected[i]);

  if (
    !coversAllImages(consistency.images.map((image) => image.index)) ||
    !coversAllImages(market.stock.map((entry) => entry.index))
  ) {
    throw new AnalysisError("incompleteSeries", 502);
  }

  const stockByIndex = new Map(market.stock.map(({ index, ...stock }) => [index, stock]));

  // A broken suggested order isn't worth failing an otherwise complete
  // report over - fall back to the uploaded order instead.
  const suggestedOrder = coversAllImages(consistency.narrative.suggestedOrder)
    ? consistency.narrative.suggestedOrder
    : expected;

  return {
    series: consistency.series,
    consistency: consistency.consistency,
    narrative: { ...consistency.narrative, suggestedOrder },
    masterPalette: market.masterPalette,
    market: market.market,
    aiPrompts: prompts.aiPrompts,
    images: [...consistency.images]
      .sort((a, b) => a.index - b.index)
      .map((image) => ({ ...image, stock: stockByIndex.get(image.index)! })),
  };
}

/**
 * Runs the multi-image series analysis with Claude Vision as three parallel
 * requests (see ConsistencyPartSchema / MarketPartSchema / PromptsPartSchema
 * for why). Images
 * must already be normalized (see `compressImageForAnalysis`) and are
 * referenced as "Bild 1..n" in upload order. `onPartComplete` fires as each
 * part finishes, for live progress; it must not throw. `signal` aborts all
 * parts (deadline of the job runner); `onUsage` receives the token usage of
 * every finished part.
 */
export async function analyzeSeries(
  images: ProcessedImage[],
  locale: Locale = DEFAULT_LOCALE,
  onPartComplete?: (part: SeriesStep) => void,
  options: SeriesOptions = {}
): Promise<SeriesAnalysis> {
  const imageContent = buildImageContent(images, PROMPT_CACHE_ENABLED);
  const controller = new AbortController();
  const signal = options.signal ? AbortSignal.any([controller.signal, options.signal]) : controller.signal;

  if (PROMPT_CACHE_ENABLED) await prewarmImageCache(imageContent, locale, signal, options.onUsage);

  // If one part fails the report is useless, so stop paying for the others.
  const track = <T>(part: SeriesStep, promise: Promise<T>) =>
    promise.then(
      (result) => {
        onPartComplete?.(part);
        return result;
      },
      (error: unknown) => {
        controller.abort();
        throw error;
      }
    );

  const aspectRatio = dominantAspectRatio(
    images.map((image) => ({ width: image.originalWidth, height: image.originalHeight }))
  );

  // Measured pixel values replace estimates for every correction number.
  const facts = measuredFactsPrompt(images.map((image) => image.measurements));
  const consistencyPrompt = facts ? `${CONSISTENCY_PROMPT}\n\n${facts}` : CONSISTENCY_PROMPT;

  const [consistency, market, prompts] = await Promise.all([
    track(
      "consistency",
      requestPart(
        "consistency",
        imageContent,
        consistencyPrompt,
        ConsistencyPartSchema,
        locale,
        signal,
        options
      )
    ),
    track(
      "market",
      requestPart("market", imageContent, MARKET_PROMPT, MarketPartSchema, locale, signal, options)
    ),
    track(
      "prompts",
      requestPart(
        "prompts",
        imageContent,
        buildPromptsPrompt(aspectRatio),
        PromptsPartSchema,
        locale,
        signal,
        options
      )
    ),
  ]);

  return mergeSeriesParts(consistency, market, prompts, images.length);
}
