import { z } from "zod";

/*
 * Multi-model prompt engine: one schema per analysis mode that asks Claude
 * for a prompt optimized for each of the four most popular image models.
 * Each platform gets its own field description because they reward very
 * different prompt styles - flags and aesthetics (Midjourney), subject-first
 * descriptions without negatives (FLUX; negatives only for SDXL), commercially
 * safe scene descriptions (Firefly) and natural-language storytelling
 * (ChatGPT Images / GPT Image).
 *
 * Model versions as of October 2026. The JSON keys (`flux`, `dalle3`) stay
 * stable so stored reports and API clients keep working; only labels and
 * prompt rules follow the current models.
 */

/** Pinned so prompts don't silently switch model behavior; bump deliberately. */
export const MIDJOURNEY_VERSION_FLAG = "--v 8.2";

/** Raw mode on V7+; the older `--style raw` is not valid on V8.x. */
export const MIDJOURNEY_RAW_FLAG = "--raw";

/** Aspect ratios Midjourney users actually use; uploads snap to the closest one. */
const COMMON_ASPECT_RATIOS = [
  [1, 1],
  [4, 5],
  [5, 4],
  [3, 4],
  [4, 3],
  [2, 3],
  [3, 2],
  [9, 16],
  [16, 9],
  [21, 9],
] as const;

/**
 * Snaps pixel dimensions to the closest common aspect ratio, e.g. 6000x4000
 * -> "3:2". Compared on a log scale so 2:1 vs 1:2 count as equally far off.
 */
export function closestAspectRatio(width: number, height: number): string {
  const target = Math.log(width / height);
  let best: (typeof COMMON_ASPECT_RATIOS)[number] = COMMON_ASPECT_RATIOS[0];
  for (const ratio of COMMON_ASPECT_RATIOS) {
    if (Math.abs(Math.log(ratio[0] / ratio[1]) - target) < Math.abs(Math.log(best[0] / best[1]) - target)) {
      best = ratio;
    }
  }
  return `${best[0]}:${best[1]}`;
}

/** Most frequent aspect ratio of a series; ties go to the earlier image. */
export function dominantAspectRatio(sizes: { width: number; height: number }[]): string {
  const counts = new Map<string, number>();
  for (const { width, height } of sizes) {
    const ratio = closestAspectRatio(width, height);
    counts.set(ratio, (counts.get(ratio) ?? 0) + 1);
  }
  let best = "1:1";
  let bestCount = 0;
  for (const [ratio, count] of counts) {
    if (count > bestCount) {
      best = ratio;
      bestCount = count;
    }
  }
  return best;
}

export type PromptMode = "image" | "series";

const GOAL: Record<PromptMode, string> = {
  image:
    "Ziel ist eine möglichst originalgetreue, fotorealistische Rekonstruktion dieses konkreten " +
    "Bildes: exaktes Motiv (Personen/Objekte, Anzahl, Pose, Position), Bildausschnitt, " +
    "Kamerawinkel, Hintergrund, Lichtrichtung, Materialien und Farbgebung.",
  series:
    "Ziel ist eine wiederverwendbare Stil-Vorlage für den gemeinsamen Look der Serie, nicht ein " +
    "einzelnes Motiv: Das Motiv steht als Platzhalter '[subject]' im Prompt, alles andere " +
    "(Licht, Optik, Grading, Stimmung) beschreibt den Serien-Look.",
};

/** Builds the per-platform prompt schema for single images or whole series. */
export function platformPromptsSchema(mode: PromptMode) {
  const goal = GOAL[mode];

  return z.object({
    midjourney: z
      .string()
      .describe(
        `Midjourney-V8.2-Prompt auf Englisch. ${goal} Fokus auf Ästhetik: Motiv zuerst, dann ` +
          "Kamera und Objektiv (z. B. 'shot on 85mm lens, f/1.8'), Lichtsetzung (z. B. " +
          "'soft golden hour backlight'), Filmlook/Grading und Stimmung als präzise, " +
          "beschreibende Phrasen statt Keyword-Ketten. Endet mit Parametern in genau dieser " +
          `Form: '--ar <Seitenverhältnis aus der Anfrage> ${MIDJOURNEY_RAW_FLAG} ` +
          `${MIDJOURNEY_VERSION_FLAG}', optional davor '--stylize <0-1000>' (für fotorealistische ` +
          "Ergebnisse niedrig halten). Nicht '--style raw' verwenden, das ist in V8 ungültig. " +
          "Keine Künstlernamen."
      ),
    flux: z.object({
      positive: z
        .string()
        .describe(
          `Prompt für FLUX.2 / FLUX 3 (Black Forest Labs), auch nutzbar für Stable Diffusion XL, ` +
            `auf Englisch. ${goal} 30-80 Wörter in natürlichen, präzisen Sätzen, geordnet nach ` +
            "Wichtigkeit, weil FLUX Früheres stärker gewichtet: Motiv, Handlung, Stil, Kontext, " +
            "Details. Konkrete Kamera- und Optikangaben (z. B. '35mm, f/1.4'), Licht, Texturen, " +
            "Komposition. Schlüsselfarben als Hex-Code direkt an ein Objekt gebunden (z. B. " +
            "'walls in hex #C4725A'). Nur beschreiben, was zu sehen sein soll, keine Verneinungen " +
            "('no people' -> 'empty, deserted'). Kein Keyword-Stacking wie " +
            "'8k, masterpiece, best quality'."
        ),
      negative: z
        .string()
        .describe(
          "Negative-Prompt auf Englisch nur für SDXL (FLUX unterstützt keine Negative-Prompts): " +
            "kommagetrennte Begriffe, " +
            "die typische Fehler und Stilbrüche für genau diesen Look ausschließen (z. B. " +
            "'harsh flash, oversaturated, plastic skin, cartoon, extra fingers, watermark, text')."
        ),
    }),
    firefly: z
      .string()
      .describe(
        `Prompt für Adobe Firefly Image Model 5 auf Englisch. ${goal} Kommerziell sauber: ` +
          "beschreibt Szenen-Setup, Materialien und Oberflächen, Licht und Stimmung in 2-4 " +
          "sachlichen Sätzen wie ein Fotografie-Briefing. Strikt verboten: Marken, Logos, Produktnamen, Künstler-, " +
          "Fotografen- oder Filmnamen, Kamerahersteller, Filmstock-Markennamen und reale Personen. " +
          "Keine Parameter-Flags."
      ),
    dalle3: z
      .string()
      .describe(
        `Prompt für ChatGPT Images 2.5 (GPT Image) auf Englisch. ${goal} Präzises, ` +
          "natürlichsprachliches Storytelling in 3-6 fließenden Sätzen als direkte Anfrage " +
          "('Create a photorealistic image of ...'): Was passiert in der Szene, in welchem " +
          "Kontext, welche Emotion soll das Bild exakt auslösen und durch welche Bildelemente. " +
          "Nennt das Seitenverhältnis aus der Anfrage im Text (z. B. 'in a 3:2 landscape " +
          "format'). Keine Parameter-Flags, keine Schlagwortlisten."
      ),
  });
}

export type PlatformPrompts = z.infer<ReturnType<typeof platformPromptsSchema>>;

export const PROMPT_PLATFORMS = ["midjourney", "flux", "firefly", "dalle3"] as const;
export type PromptPlatform = (typeof PROMPT_PLATFORMS)[number];

/** Product names - identical in every language; usage hints live in the dictionaries. */
export const PROMPT_PLATFORM_LABELS: Record<PromptPlatform, string> = {
  midjourney: "Midjourney V8.2",
  flux: "FLUX.2 / FLUX 3",
  firefly: "Firefly Image 5",
  dalle3: "ChatGPT Images 2.5",
};

export type PromptPart = { kind: "main" | "positive" | "negative"; text: string };

/** The text blocks a platform's prompt consists of, in display/copy order. */
export function promptParts(prompts: PlatformPrompts, platform: PromptPlatform): PromptPart[] {
  if (platform === "flux") {
    return [
      { kind: "positive", text: prompts.flux.positive },
      { kind: "negative", text: prompts.flux.negative },
    ];
  }
  return [{ kind: "main", text: prompts[platform] }];
}

/** Request-side instruction that pins the aspect ratio for the Midjourney and ChatGPT prompts. */
export function aspectRatioInstruction(ratio: string): string {
  return (
    `Seitenverhältnis: ${ratio} (im Midjourney-Prompt als --ar ${ratio}, im ChatGPT-Prompt im ` +
    "Text). Formuliere die vier Plattform-Prompts (Midjourney V8.2, FLUX.2/FLUX 3, Firefly " +
    "Image 5, ChatGPT Images 2.5) jeweils im Stil, auf den die jeweilige Plattform am besten " +
    "reagiert - nicht viermal denselben Text."
  );
}
