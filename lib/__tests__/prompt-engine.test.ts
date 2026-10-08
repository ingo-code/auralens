import { describe, expect, it } from "vitest";
import {
  closestAspectRatio,
  dominantAspectRatio,
  platformPromptsSchema,
  promptParts,
} from "@/lib/prompt-engine";
import { SAMPLE_PROMPTS } from "@/lib/__tests__/fixtures/style-report";

describe("closestAspectRatio", () => {
  it.each([
    [6000, 4000, "3:2"],
    [4000, 6000, "2:3"],
    [1920, 1080, "16:9"],
    [1080, 1350, "4:5"],
    [3000, 3000, "1:1"],
    [4032, 3024, "4:3"],
    [3440, 1440, "21:9"],
  ])("%i x %i -> %s", (width, height, expected) => {
    expect(closestAspectRatio(width, height)).toBe(expected);
  });
});

describe("dominantAspectRatio", () => {
  it("nimmt das häufigste Format der Serie", () => {
    const sizes = [
      { width: 1080, height: 1350 },
      { width: 6000, height: 4000 },
      { width: 1080, height: 1350 },
    ];
    expect(dominantAspectRatio(sizes)).toBe("4:5");
  });

  it("entscheidet Gleichstände zugunsten des früheren Bildes", () => {
    expect(dominantAspectRatio([{ width: 1920, height: 1080 }, { width: 1000, height: 1000 }])).toBe("16:9");
  });
});

describe("platformPromptsSchema", () => {
  it("beschreibt Einzelbild und Serie unterschiedlich", () => {
    const image = platformPromptsSchema("image").shape.midjourney.description;
    const series = platformPromptsSchema("series").shape.midjourney.description;
    expect(image).toMatch(/Rekonstruktion/);
    expect(series).toMatch(/\[subject\]/);
  });

  it("verlangt die aktuellen Midjourney-V8-Parameter statt der alten V6-Syntax", () => {
    const description = platformPromptsSchema("image").shape.midjourney.description;
    expect(description).toContain("--raw --v 8.2");
    expect(description).not.toMatch(/--style raw --v/);
  });

  it("verbietet bei Firefly Marken- und Künstlerbezüge", () => {
    expect(platformPromptsSchema("image").shape.firefly.description).toMatch(/Marken.*Künstler/);
  });
});

describe("promptParts", () => {
  it("liefert für Flux/SDXL Positiv- und Negativ-Prompt", () => {
    expect(promptParts(SAMPLE_PROMPTS, "flux").map((part) => part.text)).toEqual([
      SAMPLE_PROMPTS.flux.positive,
      SAMPLE_PROMPTS.flux.negative,
    ]);
  });

  it("liefert für die übrigen Plattformen genau einen Prompt", () => {
    expect(promptParts(SAMPLE_PROMPTS, "dalle3")).toEqual([{ kind: "main", text: SAMPLE_PROMPTS.dalle3 }]);
  });
});
