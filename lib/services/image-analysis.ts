import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { StyleAnalysisSchema, type StyleAnalysis } from "@/lib/analysis-schema";
import { buildSystemPrompt, CLAUDE_MODEL, getClaudeClient, outputLanguage } from "@/lib/claude/client";
import { AnalysisError } from "@/lib/claude/errors";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import type { ProcessedImage } from "@/lib/image-processing";
import { aspectRatioInstruction, closestAspectRatio } from "@/lib/prompt-engine";

const USER_PROMPT =
  "Analysiere den visuellen Stil, die dominante Farbpalette (als Hex-Codes) und die " +
  "vermittelten Emotionen dieses Bildes. Leite daraus außerdem ab:\n" +
  "1. Bildgenerierungs-Prompts für Midjourney V8.2, FLUX.2/FLUX 3, Adobe Firefly Image 5 und " +
  "ChatGPT Images 2.5, " +
  "die dieses konkrete Bild möglichst originalgetreu rekonstruieren - jeweils im Stil, auf " +
  "den die Plattform am besten reagiert.\n" +
  "2. Verkaufsstarke Stock-Metadaten (Titel, Beschreibung, 25 Keywords) für Adobe Stock / " +
  "Shutterstock.\n" +
  "Prompts und Stock-Metadaten immer auf Englisch.";

// Four platform prompts plus 25 stock keywords need far more room than the
// original single prompt did.
const MAX_TOKENS = 8000;

/**
 * Runs the single-image style analysis with Claude Vision. The image must
 * already be normalized (see `compressImageForAnalysis`). Throws
 * `AnalysisError` or an Anthropic SDK error - map with `mapAnalysisError`.
 */
export async function analyzeImage(image: ProcessedImage, locale: Locale = DEFAULT_LOCALE): Promise<StyleAnalysis> {
  const aspectRatio = closestAspectRatio(image.originalWidth, image.originalHeight);

  const response = await getClaudeClient().messages.parse({
    model: CLAUDE_MODEL,
    max_tokens: MAX_TOKENS,
    system: buildSystemPrompt(locale),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: image.mediaType,
              data: image.data.toString("base64"),
            },
          },
          {
            type: "text",
            text:
              `${USER_PROMPT}\n\n${aspectRatioInstruction(aspectRatio)}\n\n` +
              `Ausgabesprache aller übrigen Texte: ${outputLanguage(locale)}.`,
          },
        ],
      },
    ],
    output_config: {
      format: zodOutputFormat(StyleAnalysisSchema),
    },
  });

  if (!response.parsed_output) {
    throw new AnalysisError("unparsableReport", 502);
  }
  return response.parsed_output;
}
