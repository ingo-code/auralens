import type {
  NarrativeRole,
  SeriesAnalysis,
  SeriesImageFile,
  ShotType,
  StockCategory,
} from "@/lib/series-analysis-schema";
import { describeImageFile } from "@/lib/series-organize";
import { SAMPLE_PROMPTS } from "@/lib/__tests__/fixtures/style-report";

export type ImageSpec = {
  score: number;
  category: StockCategory;
  role: NarrativeRole;
  shot: ShotType;
  width: number;
  height: number;
};

/** Builds a complete, schema-valid report + file list from compact per-image specs. */
export function buildSeries(specs: ImageSpec[], suggestedOrder?: number[]) {
  const indices = specs.map((_, i) => i + 1);

  const report: SeriesAnalysis = {
    series: { title: "Test", summary: "Testserie.", styleTags: ["a", "b", "c"] },
    consistency: {
      overallScore: 70,
      dimensions: { color: 70, lighting: 70, postProcessing: 70, composition: 70 },
      verdict: "ok",
      recommendations: ["nichts"],
    },
    narrative: {
      arcSummary: "Bogen.",
      suggestedOrder: suggestedOrder ?? indices,
      orderRationale: "weil",
      missingShots: [],
    },
    masterPalette: {
      colors: [
        { hex: "#111111", name: "a", role: "primary" },
        { hex: "#222222", name: "b", role: "secondary" },
        { hex: "#333333", name: "c", role: "accent" },
        { hex: "#444444", name: "d", role: "background" },
      ],
      harmony: { type: "neutral", description: "neutral" },
    },
    market: {
      industries: [
        { name: "A", fitScore: 90, rationale: "x", useCases: ["x"] },
        { name: "B", fitScore: 80, rationale: "x", useCases: ["x"] },
        { name: "C", fitScore: 70, rationale: "x", useCases: ["x"] },
      ],
      targetAudiences: [
        { segment: "A", rationale: "x" },
        { segment: "B", rationale: "x" },
      ],
      psychology: [
        { emotion: "A", intensity: 90, trigger: "x" },
        { emotion: "B", intensity: 80, trigger: "x" },
        { emotion: "C", intensity: 70, trigger: "x" },
      ],
    },
    aiPrompts: {
      photographicSpec: { focalLength: "x", aperture: "x", lighting: "x", filmStock: "x", colorGrading: "x", mood: "x" },
      ...SAMPLE_PROMPTS,
    },
    images: specs.map((spec, i) => ({
      index: i + 1,
      summary: `Bild ${i + 1}`,
      consistencyScore: spec.score,
      narrativeRole: spec.role,
      shotType: spec.shot,
      dominantColors: [
        { hex: "#111111", name: "a" },
        { hex: "#222222", name: "b" },
      ],
      deviations: [],
      stock: {
        category: spec.category,
        title: `Title ${i + 1}`,
        description: "d",
        keywords: Array.from({ length: 25 }, (_, k) => `k${k}`),
      },
    })),
  };

  const files: SeriesImageFile[] = specs.map((spec, i) =>
    describeImageFile(i + 1, `bild${i + 1}.jpg`, spec.width, spec.height)
  );

  return { report, files };
}

/** Four varied images used across organize tests. */
export const SAMPLE_SPECS: ImageSpec[] = [
  { score: 80, category: "travel", role: "opener", shot: "wide", width: 6000, height: 4000 }, // 24 MP, quer
  { score: 20, category: "food", role: "detail", shot: "detail", width: 1200, height: 1600 }, // 1.9 MP, hoch
  { score: 95, category: "travel", role: "hero", shot: "medium", width: 3000, height: 3000 }, // 9 MP, quadratisch
  { score: 80, category: "landscapes", role: "closer", shot: "aerial", width: 4000, height: 3000 }, // 12 MP, quer
];
