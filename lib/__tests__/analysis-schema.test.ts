import { describe, expect, it } from "vitest";
import { StyleAnalysisSchema } from "@/lib/analysis-schema";

const VALID_REPORT = {
  style: { summary: "Ruhige, minimalistische Bildsprache.", tags: ["minimalistisch", "ruhig", "warm"] },
  colorPalette: [
    { hex: "#112233", name: "Tiefes Blau" },
    { hex: "#AABBCC", name: "Nebelgrau" },
    { hex: "#FF8800", name: "Bernstein" },
  ],
  emotions: ["Ruhe", "Geborgenheit"],
  midjourneyPrompt: "a calm minimalist gradient, soft light --ar 3:2 --style raw",
};

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

  it("lehnt fehlenden Midjourney-Prompt ab", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { midjourneyPrompt: _midjourneyPrompt, ...withoutPrompt } = VALID_REPORT;
    const result = StyleAnalysisSchema.safeParse(withoutPrompt);
    expect(result.success).toBe(false);
  });
});
