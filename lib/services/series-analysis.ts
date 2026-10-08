import type Anthropic from "@anthropic-ai/sdk";
import type { SeriesStep } from "@/lib/analysis-steps";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { buildSystemPrompt, CLAUDE_MODEL, getClaudeClient, outputLanguage } from "@/lib/claude/client";
import { AnalysisError } from "@/lib/claude/errors";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import type { ProcessedImage } from "@/lib/image-processing";
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

function buildImageContent(images: ProcessedImage[]): Anthropic.ContentBlockParam[] {
  return images.flatMap((image, i): Anthropic.ContentBlockParam[] => [
    // Explicit labels let the model reference images reliably by number.
    { type: "text", text: `Bild ${i + 1}:` },
    {
      type: "image",
      source: { type: "base64", media_type: image.mediaType, data: image.data.toString("base64") },
    },
  ]);
}

async function requestPart<T extends z.ZodType>(
  part: string,
  imageContent: Anthropic.ContentBlockParam[],
  prompt: string,
  schema: T,
  locale: Locale,
  signal: AbortSignal
): Promise<z.infer<T>> {
  const startedAt = Date.now();
  const stream = getClaudeClient().messages.stream(
    {
      model: CLAUDE_MODEL,
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
      output_config: { format: zodOutputFormat(schema) },
    },
    { signal }
  );

  const message = await stream.finalMessage();

  // One line per part keeps cost and latency observable in production logs.
  console.info(
    `[series-analysis] part=${part} stop=${message.stop_reason} ` +
      `input_tokens=${message.usage?.input_tokens} output_tokens=${message.usage?.output_tokens} ` +
      `ms=${Date.now() - startedAt}`
  );

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
 * part finishes, for live progress; it must not throw.
 */
export async function analyzeSeries(
  images: ProcessedImage[],
  locale: Locale = DEFAULT_LOCALE,
  onPartComplete?: (part: SeriesStep) => void
): Promise<SeriesAnalysis> {
  const imageContent = buildImageContent(images);
  const controller = new AbortController();

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

  const [consistency, market, prompts] = await Promise.all([
    track(
      "consistency",
      requestPart("consistency", imageContent, CONSISTENCY_PROMPT, ConsistencyPartSchema, locale, controller.signal)
    ),
    track("market", requestPart("market", imageContent, MARKET_PROMPT, MarketPartSchema, locale, controller.signal)),
    track(
      "prompts",
      requestPart(
        "prompts",
        imageContent,
        buildPromptsPrompt(aspectRatio),
        PromptsPartSchema,
        locale,
        controller.signal
      )
    ),
  ]);

  return mergeSeriesParts(consistency, market, prompts, images.length);
}
