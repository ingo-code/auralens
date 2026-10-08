import type { StyleAnalysis } from "@/lib/analysis-schema";
import type { PlatformPrompts } from "@/lib/prompt-engine";

export const SAMPLE_PROMPTS: PlatformPrompts = {
  midjourney: "calm minimalist interior, soft window light, 35mm lens --ar 3:2 --raw --v 8.2",
  flux: {
    positive: "A calm minimalist interior lit by soft window light from the left",
    negative: "harsh flash, oversaturated, watermark",
  },
  firefly: "A calm minimalist interior with linen textures, lit by soft morning window light.",
  dalle3: "Create a photorealistic image of a calm minimalist interior that feels safe and quiet.",
};

/** A complete, schema-valid single-image report. */
export const VALID_STYLE_REPORT: StyleAnalysis = {
  style: { summary: "Ruhige, minimalistische Bildsprache.", tags: ["minimalistisch", "ruhig", "warm"] },
  colorPalette: [
    { hex: "#112233", name: "Tiefes Blau" },
    { hex: "#AABBCC", name: "Nebelgrau" },
    { hex: "#FF8800", name: "Bernstein" },
  ],
  emotions: ["Ruhe", "Geborgenheit"],
  prompts: SAMPLE_PROMPTS,
  stock: {
    category: "lifestyle",
    title: "Calm minimalist interior in soft window light",
    description: "A calm minimalist interior in soft natural light, ideal for lifestyle and home decor.",
    keywords: Array.from({ length: 25 }, (_, i) => `keyword${i}`),
  },
};
