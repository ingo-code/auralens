import { z } from "zod";

export const StyleAnalysisSchema = z.object({
  style: z.object({
    summary: z
      .string()
      .describe(
        "Prägnante Beschreibung (1-2 Sätze) des visuellen Gesamtstils, z. B. Bildsprache, Licht, Komposition."
      ),
    tags: z
      .array(z.string())
      .min(3)
      .max(8)
      .describe("Stil-Schlagworte, z. B. 'minimalistisch', 'cineastisch', 'hoher Kontrast'."),
  }),
  colorPalette: z
    .array(
      z.object({
        hex: z
          .string()
          .regex(/^#[0-9A-Fa-f]{6}$/)
          .describe("Hex-Code der Farbe, z. B. #1A2B3C"),
        name: z.string().describe("Menschenlesbarer Farbname, z. B. 'Tiefes Petrol'."),
      })
    )
    .min(3)
    .max(6)
    .describe("Die dominanten Farben des Bildes als Hex-Codes."),
  emotions: z
    .array(z.string())
    .min(2)
    .max(6)
    .describe("Emotionen bzw. Stimmungen, die das Bild vermittelt."),
  imagePrompt: z
    .string()
    .describe(
      "Ein einsatzbereiter Bildgenerierungs-Prompt für ChatGPT (DALL-E 3): eine klare, " +
        "natürlich formulierte Beschreibung von Motiv, Stil, Lichtstimmung, Farbgebung und " +
        "Komposition des Bildes in fließenden Sätzen, direkt als Anfrage an ChatGPT nutzbar " +
        "(z. B. 'Erstelle ein Bild von...'). Keine Parameter-Flags (z. B. --ar, --stylize) und " +
        "kein Keyword-Stacking wie '8k, highly detailed' - ChatGPT reagiert am besten auf " +
        "natürliche Sprache statt Schlagwortlisten."
    ),
});

export type StyleAnalysis = z.infer<typeof StyleAnalysisSchema>;
