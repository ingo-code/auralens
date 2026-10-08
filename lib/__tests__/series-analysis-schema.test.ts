import { describe, expect, it } from "vitest";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import {
  ConsistencyPartSchema,
  MarketPartSchema,
  SeriesAnalysisSchema,
} from "@/lib/series-analysis-schema";

describe("SeriesAnalysisSchema", () => {
  it("lässt beide Teil-Schemas als Structured-Output-Format für die Claude API zu", () => {
    // The merged schema itself is too large for the API's grammar limit and
    // is never sent - only the two parts are.
    expect(() => zodOutputFormat(ConsistencyPartSchema)).not.toThrow();
    expect(() => zodOutputFormat(MarketPartSchema)).not.toThrow();
  });

  it("lehnt Konsistenz-Scores außerhalb von 0-100 ab", () => {
    const score = SeriesAnalysisSchema.shape.consistency.shape.overallScore;
    expect(score.safeParse(100).success).toBe(true);
    expect(score.safeParse(101).success).toBe(false);
    expect(score.safeParse(-1).success).toBe(false);
    expect(score.safeParse(55.5).success).toBe(false);
  });

  it("lehnt ungültige Hex-Codes in der Master-Palette ab", () => {
    const color = SeriesAnalysisSchema.shape.masterPalette.shape.colors.element;
    expect(color.safeParse({ hex: "#A1B2C3", name: "Test", role: "primary" }).success).toBe(true);
    expect(color.safeParse({ hex: "A1B2C3", name: "Test", role: "primary" }).success).toBe(false);
    expect(color.safeParse({ hex: "#A1B2C3", name: "Test", role: "hero" }).success).toBe(false);
  });

  it("verlangt 20-30 Stock-Keywords pro Bild", () => {
    const keywords = SeriesAnalysisSchema.shape.images.element.shape.stock.shape.keywords;
    expect(keywords.safeParse(Array(25).fill("k")).success).toBe(true);
    expect(keywords.safeParse(Array(10).fill("k")).success).toBe(false);
  });
});
