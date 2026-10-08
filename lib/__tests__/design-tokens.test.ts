import { describe, expect, it } from "vitest";
import { buildColorTokens, slugify, toTailwindV3Config, toTailwindV4Theme } from "@/lib/design-tokens";

describe("slugify", () => {
  it("wandelt deutsche Farbnamen in Token-Namen um", () => {
    expect(slugify("Tiefes Petrol")).toBe("tiefes-petrol");
    expect(slugify("Grünes Glühen")).toBe("gruenes-gluehen");
    expect(slugify("Crème Brûlée")).toBe("creme-brulee");
  });
});

describe("buildColorTokens", () => {
  it("nutzt die Design-System-Rolle der Master-Palette und nummeriert Dopplungen", () => {
    const tokens = buildColorTokens([
      { hex: "#112233", name: "Tiefes Blau", role: "primary" },
      { hex: "#aabbcc", name: "Nebelgrau", role: "neutral" },
      { hex: "#ddeeff", name: "Hellgrau", role: "neutral" },
    ]);
    expect(tokens.map((token) => token.key)).toEqual(["primary", "neutral", "neutral-2"]);
    expect(tokens[1].hex).toBe("#AABBCC");
  });

  it("fällt ohne Rolle auf den Farbnamen und notfalls auf eine Nummer zurück", () => {
    const tokens = buildColorTokens([
      { hex: "#112233", name: "Tiefes Petrol" },
      { hex: "#445566", name: "!!!" },
    ]);
    expect(tokens.map((token) => token.key)).toEqual(["tiefes-petrol", "color-2"]);
  });
});

describe("Tailwind-Snippets", () => {
  const tokens = buildColorTokens([
    { hex: "#112233", name: "Tiefes Blau", role: "primary" },
    { hex: "#FF8800", name: "Bernstein", role: "accent" },
  ]);

  it("erzeugt einen @theme-Block für Tailwind v4", () => {
    const css = toTailwindV4Theme(tokens);
    expect(css).toContain("@theme {");
    expect(css).toContain("--color-brand-primary: #112233; /* Tiefes Blau */");
    expect(css).toContain("--color-brand-accent: #FF8800;");
  });

  it("erzeugt eine gültige theme.extend.colors-Konfiguration für Tailwind v3", () => {
    const config = toTailwindV3Config(tokens);
    // Evaluate the snippet to prove it is valid JavaScript with the expected shape.
    const fakeModule = { exports: {} as { theme: { extend: { colors: { brand: Record<string, string> } } } } };
    new Function("module", config)(fakeModule);
    expect(fakeModule.exports.theme.extend.colors.brand).toEqual({ primary: "#112233", accent: "#FF8800" });
  });
});
