import { describe, expect, it } from "vitest";
import { StyleAnalysisSchema } from "@/lib/analysis-schema";
import { VALID_STYLE_REPORT } from "@/lib/__tests__/fixtures/style-report";

const VALID_REPORT = VALID_STYLE_REPORT;

describe("StyleAnalysisSchema", () => {
  it("akzeptiert einen vollständigen, gültigen Report", () => {
    const result = StyleAnalysisSchema.safeParse(VALID_REPORT);
    expect(result.success).toBe(true);
  });

  it("lehnt ungültige Hex-Codes ab", () => {
    const invalid = {
      ...VALID_REPORT,
      colorPalette: [{ hex: "not-a-hex", name: "Kaputt" }, ...VALID_REPORT.colorPalette.slice(1)],
    };
    const result = StyleAnalysisSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("lehnt zu wenige Farben ab (Minimum 3)", () => {
    const invalid = { ...VALID_REPORT, colorPalette: VALID_REPORT.colorPalette.slice(0, 2) };
    const result = StyleAnalysisSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("lehnt zu wenige Stil-Tags ab (Minimum 3)", () => {
    const invalid = { ...VALID_REPORT, style: { ...VALID_REPORT.style, tags: ["nur-eins"] } };
    const result = StyleAnalysisSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("verlangt einen Prompt für jede der vier Plattformen", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { firefly: _firefly, ...withoutFirefly } = VALID_REPORT.prompts;
    const result = StyleAnalysisSchema.safeParse({ ...VALID_REPORT, prompts: withoutFirefly });
    expect(result.success).toBe(false);
  });

  it("verlangt Flux/SDXL-Prompts mit Positiv- und Negativ-Teil", () => {
    const invalid = { ...VALID_REPORT, prompts: { ...VALID_REPORT.prompts, flux: { positive: "x" } } };
    expect(StyleAnalysisSchema.safeParse(invalid).success).toBe(false);
  });

  it("lehnt Stock-Metadaten mit zu wenigen Keywords ab (Minimum 20)", () => {
    const invalid = { ...VALID_REPORT, stock: { ...VALID_REPORT.stock, keywords: ["one", "two"] } };
    expect(StyleAnalysisSchema.safeParse(invalid).success).toBe(false);
  });
});
