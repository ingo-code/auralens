import { z } from "zod";
import { platformPromptsSchema } from "@/lib/prompt-engine";

/**
 * Schemas for the multi-image series analysis. Single source of truth for
 * both the Claude structured-output formats and the TypeScript types the UI
 * consumes. Enum values are stable English keys; localized display labels
 * live in the i18n dictionaries (`labels.*`) so prompts/UI can change
 * without breaking stored reports.
 *
 * Note: The API strips numeric/length/array-size constraints from the schema
 * it enforces; the SDK re-validates them client-side. Every such constraint
 * is therefore also spelled out in the field description so the model
 * actually aims for it instead of failing validation after the fact.
 */

export const MAX_SERIES_IMAGES = 10;
export const MIN_SERIES_IMAGES = 2;

const Score = z.number().int().min(0).max(100);

const HexColor = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/)
  .describe("Hex-Code der Farbe im Format #RRGGBB, z. B. #1A2B3C");

const ColorSchema = z.object({
  hex: HexColor,
  name: z.string().describe("Menschenlesbarer Farbname, z. B. 'Tiefes Petrol'."),
});

export const NARRATIVE_ROLES = [
  "opener",
  "context",
  "detail",
  "hero",
  "transition",
  "closer",
] as const;
export type NarrativeRole = (typeof NARRATIVE_ROLES)[number];


export const DEVIATION_ASPECTS = [
  "color_cast",
  "white_balance",
  "exposure",
  "contrast",
  "saturation",
  "lighting",
  "composition",
  "post_processing",
  "subject_style",
] as const;
export type DeviationAspect = (typeof DEVIATION_ASPECTS)[number];


/** Adobe Stock's official category list - what a stock upload asks for. */
export const STOCK_CATEGORIES = [
  "animals",
  "architecture",
  "business",
  "drinks",
  "environment",
  "states_of_mind",
  "food",
  "graphic_resources",
  "hobbies_leisure",
  "industry",
  "landscapes",
  "lifestyle",
  "people",
  "plants_flowers",
  "culture_religion",
  "science",
  "social_issues",
  "sports",
  "technology",
  "transport",
  "travel",
] as const;
export type StockCategory = (typeof STOCK_CATEGORIES)[number];


export const SHOT_TYPES = [
  "extreme_wide",
  "wide",
  "medium",
  "close_up",
  "detail",
  "aerial",
  "overhead",
] as const;
export type ShotType = (typeof SHOT_TYPES)[number];


export const SEVERITIES = ["low", "medium", "high"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const PALETTE_ROLES = ["primary", "secondary", "accent", "neutral", "background"] as const;
export type PaletteRole = (typeof PALETTE_ROLES)[number];

export const HARMONY_TYPES = [
  "monochromatic",
  "analogous",
  "complementary",
  "split_complementary",
  "triadic",
  "neutral",
] as const;
export type HarmonyType = (typeof HARMONY_TYPES)[number];


const DeviationSchema = z.object({
  aspect: z.enum(DEVIATION_ASPECTS),
  severity: z.enum(SEVERITIES),
  description: z
    .string()
    .describe(
      "Konkrete Abweichung im Vergleich zum Rest der Serie, z. B. 'Deutlich kühlerer Blaustich " +
        "in den Schatten als bei den übrigen Bildern'."
    ),
  fix: z
    .string()
    .describe(
      "Konkreter Korrekturvorschlag für die Bildbearbeitung, z. B. 'Temperatur ca. +400 K, " +
        "Tint leicht Richtung Magenta'."
    ),
});

export const StockMetadataSchema = z.object({
  category: z
    .enum(STOCK_CATEGORIES)
    .describe("Die eine Adobe-Stock-Kategorie, die das Hauptmotiv des Bildes am besten trifft."),
  title: z
    .string()
    .describe(
      "Verkaufsstarker, präziser Stock-Titel auf Englisch (max. ca. 70 Zeichen), wie er bei " +
        "Adobe Stock / Shutterstock performt: Motiv + Kontext, keine Füllwörter."
    ),
  description: z
    .string()
    .describe(
      "Stock-Beschreibung auf Englisch (1-2 Sätze, max. ca. 200 Zeichen), die Motiv, " +
        "Setting und Einsatzzweck beschreibt."
    ),
  keywords: z
    .array(z.string())
    .min(20)
    .max(30)
    .describe(
      "Genau 25 englische Stock-Keywords, nach Relevanz absteigend sortiert (die ersten 10 " +
        "sind bei Adobe Stock am wichtigsten). Mix aus Motiv, Konzept, Stimmung, Stil und " +
        "Einsatzzweck; Kleinbuchstaben, keine Duplikate, keine Markennamen."
    ),
});

const ImageIndex = z
  .number()
  .int()
  .min(1)
  .max(MAX_SERIES_IMAGES)
  .describe("1-basierte Position des Bildes in der übergebenen Reihenfolge (Bild 1 = 1).");

const ImageAnalysisCoreSchema = z.object({
  index: ImageIndex,
  summary: z.string().describe("Ein Satz: Was zeigt das Bild und wie wirkt es?"),
  consistencyScore: Score.describe(
    "Ganzzahl 0-100: Wie gut fügt sich dieses Bild stilistisch und farblich in die Serie ein?"
  ),
  narrativeRole: z
    .enum(NARRATIVE_ROLES)
    .describe("Dramaturgische Funktion des Bildes innerhalb der Serie."),
  shotType: z.enum(SHOT_TYPES).describe("Einstellungsgröße bzw. Perspektive des Bildes."),
  dominantColors: z
    .array(ColorSchema)
    .min(2)
    .max(5)
    .describe("2-5 dominante Farben dieses einzelnen Bildes."),
  deviations: z
    .array(DeviationSchema)
    .max(5)
    .describe(
      "0-5 stilistische/farbliche Abweichungen gegenüber dem Rest der Serie. Leeres Array, " +
        "wenn das Bild konsistent ist."
    ),
});

const StockEntrySchema = StockMetadataSchema.extend({ index: ImageIndex });

const sections = {
  series: z.object({
    title: z.string().describe("Prägnanter Arbeitstitel für die Serie/Kampagne."),
    summary: z
      .string()
      .describe("2-3 Sätze zum gemeinsamen Look & Feel der Serie (Bildsprache, Licht, Grading)."),
    styleTags: z
      .array(z.string())
      .min(3)
      .max(8)
      .describe("3-8 Stil-Schlagworte für die gesamte Serie."),
  }),
  consistency: z.object({
    overallScore: Score.describe(
      "Ganzzahl 0-100: Gesamt-Konsistenz der Serie. 90+ = wie aus einem Guss, 70-89 = " +
        "stimmig mit kleinen Ausreißern, 50-69 = erkennbare Brüche, <50 = keine einheitliche Serie."
    ),
    dimensions: z.object({
      color: Score.describe("Ganzzahl 0-100: Konsistenz von Farbtemperatur, Farbstich und Sättigung."),
      lighting: Score.describe("Ganzzahl 0-100: Konsistenz von Lichtqualität, -richtung und Kontrast."),
      postProcessing: Score.describe("Ganzzahl 0-100: Konsistenz von Grading, Körnung, Schärfe, Look."),
      composition: Score.describe("Ganzzahl 0-100: Konsistenz von Bildsprache, Perspektive, Framing."),
    }),
    verdict: z
      .string()
      .describe(
        "1-2 Sätze Gesamturteil, das Ausreißer konkret benennt, z. B. 'Bild 4 hat einen zu " +
          "kalten Blaustich im Vergleich zum Rest.'"
      ),
    recommendations: z
      .array(z.string())
      .min(1)
      .max(6)
      .describe("1-6 priorisierte, konkrete Maßnahmen, um die Serie zu vereinheitlichen."),
  }),
  masterPalette: z.object({
    colors: z
      .array(
        ColorSchema.extend({
          role: z
            .enum(PALETTE_ROLES)
            .describe("Rolle der Farbe in einem Design-System, das aus der Serie abgeleitet wird."),
        })
      )
      .min(4)
      .max(8)
      .describe(
        "4-8 Farben der gemeinsamen Master-Palette für die gesamte Kampagne. Genau eine Farbe " +
          "mit Rolle 'primary'; die übrigen Rollen sinnvoll verteilen."
      ),
    harmony: z.object({
      type: z.enum(HARMONY_TYPES).describe("Farbharmonie-Typ der Master-Palette."),
      description: z
        .string()
        .describe("1-2 Sätze, wie die Farben über die Serie hinweg zusammenwirken."),
    }),
  }),
  narrative: z.object({
    arcSummary: z
      .string()
      .describe("2-3 Sätze zum visuellen Spannungsbogen der Serie in der übergebenen Reihenfolge."),
    suggestedOrder: z
      .array(z.number().int().min(1).max(MAX_SERIES_IMAGES))
      .describe(
        "Empfohlene Reihenfolge für die stärkste Dramaturgie (z. B. für ein Instagram-Karussell " +
          "oder eine Shop-Galerie) als Liste der 1-basierten Bildnummern. Muss jede Bildnummer " +
          "genau einmal enthalten."
      ),
    orderRationale: z.string().describe("1-2 Sätze, warum diese Reihenfolge stärker wirkt."),
    missingShots: z
      .array(z.string())
      .max(4)
      .describe(
        "0-4 Motive/Einstellungen, die der Serie dramaturgisch fehlen (z. B. 'Ein Detail-Shot " +
          "der Materialstruktur'). Leeres Array, wenn die Serie vollständig wirkt."
      ),
  }),
  market: z.object({
    industries: z
      .array(
        z.object({
          name: z.string().describe("Branche, z. B. 'Interior Design', 'Tech-SaaS', 'Outdoor-Fashion'."),
          fitScore: Score.describe("Ganzzahl 0-100: Wie gut passt die Serie zu dieser Branche?"),
          rationale: z.string().describe("Ein Satz Begründung."),
          useCases: z
            .array(z.string())
            .min(1)
            .max(4)
            .describe("1-4 konkrete Einsatzzwecke, z. B. 'Landingpage-Hero', 'Instagram-Ads'."),
        })
      )
      .min(3)
      .max(6)
      .describe("3-6 Branchen, nach fitScore absteigend sortiert."),
    targetAudiences: z
      .array(
        z.object({
          segment: z.string().describe("Zielgruppe, z. B. 'Urbane Millennials mit Fokus auf Nachhaltigkeit'."),
          rationale: z.string().describe("Ein Satz, warum die Bildsprache dieses Segment anspricht."),
        })
      )
      .min(2)
      .max(4),
    psychology: z
      .array(
        z.object({
          emotion: z.string().describe("Unbewusst getriggerte Emotion, z. B. 'Vertrauen', 'Exklusivität', 'Nostalgie'."),
          intensity: Score.describe("Ganzzahl 0-100: Stärke der Wirkung."),
          trigger: z
            .string()
            .describe("Welches konkrete Bildelement diese Wirkung auslöst (Farbe, Licht, Motiv, Perspektive)."),
        })
      )
      .min(3)
      .max(6)
      .describe("3-6 psychologische Wirkungen, nach Intensität absteigend sortiert."),
  }),
  aiPrompts: z.object({
    photographicSpec: z.object({
      focalLength: z.string().describe("Geschätzte Brennweite (KB-äquivalent), z. B. '35mm'."),
      aperture: z.string().describe("Geschätzte Blende / Schärfentiefe, z. B. 'f/1.8, flache Schärfentiefe'."),
      lighting: z.string().describe("Lichtsetzung, z. B. 'weiches Fensterlicht von links, goldene Stunde'."),
      filmStock: z
        .string()
        .describe("Filmstock bzw. Look-Referenz, z. B. 'Kodak Portra 400', 'Fujifilm Classic Chrome'."),
      colorGrading: z.string().describe("Grading-Beschreibung, z. B. 'warme Highlights, entsättigte Grüntöne'."),
      mood: z.string().describe("Stimmung in wenigen Worten."),
    }),
    ...platformPromptsSchema("series").shape,
  }),
};

const ONE_PER_IMAGE = "Genau ein Eintrag pro übergebenem Bild, in der übergebenen Reihenfolge.";

/*
 * The complete report exceeds the API's structured-output grammar limit
 * ("compiled grammar is too large"), so it is requested in three parts that
 * run in parallel and are merged afterwards. Splitting along these lines
 * also keeps each prompt focused: part 1 compares the images with each
 * other, part 2 derives commercial assets, part 3 writes the generative
 * prompts for four different image models.
 */

/** Part 1: consistency, narrative and per-image comparison. */
export const ConsistencyPartSchema = z.object({
  series: sections.series,
  consistency: sections.consistency,
  narrative: sections.narrative,
  images: z.array(ImageAnalysisCoreSchema).min(1).max(MAX_SERIES_IMAGES).describe(ONE_PER_IMAGE),
});

/** Part 2: master palette, market fit and per-image stock metadata. */
export const MarketPartSchema = z.object({
  masterPalette: sections.masterPalette,
  market: sections.market,
  stock: z.array(StockEntrySchema).min(1).max(MAX_SERIES_IMAGES).describe(ONE_PER_IMAGE),
});

/** Part 3: photographic style spec and the multi-model prompt engine. */
export const PromptsPartSchema = z.object({
  aiPrompts: sections.aiPrompts,
});

/** The merged report as returned to clients. */
export const SeriesAnalysisSchema = z.object({
  ...sections,
  images: z
    .array(ImageAnalysisCoreSchema.extend({ stock: StockMetadataSchema }))
    .min(1)
    .max(MAX_SERIES_IMAGES)
    .describe(ONE_PER_IMAGE),
});

export type ConsistencyPart = z.infer<typeof ConsistencyPartSchema>;
export type MarketPart = z.infer<typeof MarketPartSchema>;
export type PromptsPart = z.infer<typeof PromptsPartSchema>;
export type SeriesAnalysis = z.infer<typeof SeriesAnalysisSchema>;
export type SeriesImageAnalysis = SeriesAnalysis["images"][number];
export type StockMetadata = SeriesImageAnalysis["stock"];
export type ImageDeviation = SeriesImageAnalysis["deviations"][number];
export type MasterPaletteColor = SeriesAnalysis["masterPalette"]["colors"][number];
export type IndustryMatch = SeriesAnalysis["market"]["industries"][number];

export const ORIENTATIONS = ["landscape", "portrait", "square"] as const;
export type Orientation = (typeof ORIENTATIONS)[number];


/** Adobe Stock rejects uploads below 4 megapixels. */
export const MIN_STOCK_MEGAPIXELS = 4;

/**
 * Facts measured from the uploaded file itself (no AI involved), keyed by
 * the same 1-based index as the report's images.
 */
export const SeriesImageFileSchema = z.object({
  index: z.number().int().min(1).max(MAX_SERIES_IMAGES),
  name: z.string(),
  /** Pixel dimensions of the original upload, EXIF rotation applied. */
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  megapixels: z.number().nonnegative(),
  orientation: z.enum(ORIENTATIONS),
  stockResolutionOk: z.boolean(),
});
export type SeriesImageFile = z.infer<typeof SeriesImageFileSchema>;
