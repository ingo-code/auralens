/*
 * Turns an extracted palette into copy-paste Tailwind snippets. Pure and
 * deterministic (no Claude call), so the UI can regenerate it for free.
 */

export type PaletteColor = { hex: string; name: string; role?: string };

export type ColorToken = { key: string; hex: string; name: string };

/** Namespace for the generated utilities (`bg-brand-primary`) - avoids clashing with Tailwind's own `neutral` scale. */
export const TOKEN_NAMESPACE = "brand";

const UMLAUTS: Record<string, string> = { ä: "ae", ö: "oe", ü: "ue", ß: "ss" };

/** "Tiefes Petrol" -> "tiefes-petrol"; empty when nothing usable is left. */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[äöüß]/g, (char) => UMLAUTS[char])
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Derives unique token keys: the design-system role when the palette has one
 * (series master palette), otherwise the slugified color name. Repeated keys
 * get a numeric suffix (`neutral`, `neutral-2`).
 */
export function buildColorTokens(colors: PaletteColor[]): ColorToken[] {
  const seen = new Map<string, number>();

  return colors.map((color, i) => {
    const base = color.role ?? (slugify(color.name) || `color-${i + 1}`);
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return { key: count === 1 ? base : `${base}-${count}`, hex: color.hex.toUpperCase(), name: color.name };
  });
}

/** Tailwind v4: CSS-first `@theme` block for the main stylesheet. */
export function toTailwindV4Theme(tokens: ColorToken[]): string {
  const lines = tokens.map(
    (token) => `  --color-${TOKEN_NAMESPACE}-${token.key}: ${token.hex}; /* ${token.name} */`
  );
  return `@import "tailwindcss";\n\n@theme {\n${lines.join("\n")}\n}\n`;
}

/** Tailwind v3: `tailwind.config.js` with the palette under `theme.extend.colors`. */
export function toTailwindV3Config(tokens: ColorToken[]): string {
  const lines = tokens.map((token) => `          "${token.key}": "${token.hex}", // ${token.name}`);
  return (
    "/** @type {import('tailwindcss').Config} */\n" +
    "module.exports = {\n" +
    "  theme: {\n" +
    "    extend: {\n" +
    "      colors: {\n" +
    `        ${TOKEN_NAMESPACE}: {\n` +
    `${lines.join("\n")}\n` +
    "        },\n" +
    "      },\n" +
    "    },\n" +
    "  },\n" +
    "};\n"
  );
}

/** Example utility classes so users see how the tokens are meant to be used. */
export function exampleClasses(tokens: ColorToken[]): string[] {
  return tokens.slice(0, 3).map((token, i) => `${["bg", "text", "border"][i]}-${TOKEN_NAMESPACE}-${token.key}`);
}
