import Anthropic from "@anthropic-ai/sdk";
import type { SeriesStep } from "@/lib/analysis-steps";
import type { Locale } from "@/lib/i18n/config";

/**
 * Model used for all vision analyses; override per deployment via env.
 * Opus 5.5 is in the same class as Opus 5 at 20 % lower prices.
 */
export const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5";

export const CLAUDE_EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type ClaudeEffort = (typeof CLAUDE_EFFORTS)[number];

/**
 * Thinking depth. Set explicitly: Opus 5.5 defaults to "medium", Opus 5 ran
 * at "high" - keeping "high" keeps the analysis quality of Opus 5. Must be
 * the same on every request that shares a cached prefix.
 */
export const CLAUDE_EFFORT: ClaudeEffort = "high";

/** One Claude request of an analysis: the three series parts or the single-image call. */
export type ClaudePart = SeriesStep | "image";
export type PartSettings = { model: string; effort: ClaudeEffort };

function envEffort(name: string): ClaudeEffort | undefined {
  const value = process.env[name]?.trim();
  if (!value) return undefined;
  if ((CLAUDE_EFFORTS as readonly string[]).includes(value)) return value as ClaudeEffort;
  console.warn(`[claude] ${name}="${value}" ist keine gültige Effort-Stufe - nutze "${CLAUDE_EFFORT}".`);
  return undefined;
}

/**
 * Model and effort of one part. Defaults to ANTHROPIC_MODEL / "high"; each
 * part can be tuned separately, e.g. ANTHROPIC_MODEL_MARKET=claude-sonnet-5-5
 * and ANTHROPIC_EFFORT_PROMPTS=low - the consistency check (the core of the
 * product) can stay on the strongest settings while the rest gets cheaper.
 * Read per call, so an env change only needs a redeploy.
 */
export function partSettings(part: ClaudePart): PartSettings {
  const key = part.toUpperCase();
  return {
    model: process.env[`ANTHROPIC_MODEL_${key}`]?.trim() || CLAUDE_MODEL,
    effort: envEffort(`ANTHROPIC_EFFORT_${key}`) ?? CLAUDE_EFFORT,
  };
}

/**
 * Prompt caching of the series images across the three parallel parts
 * (see lib/services/series-analysis.ts). Opt-in with "on": measured on
 * 2026-11-14 the parts never hit a shared entry, because their different
 * output schemas come before the images - the cache only added write cost.
 */
export const PROMPT_CACHE_ENABLED = process.env.API_PROMPT_CACHE === "on";

const LANGUAGE_NAMES: Record<Locale, string> = { de: "Deutsch", en: "Englisch (English)" };

/**
 * The language for all free-text report fields. Instructions and schema
 * descriptions stay German either way; this line decides the output.
 * Stock metadata and image prompts are always English (see the prompts).
 */
export function outputLanguage(locale: Locale): string {
  return LANGUAGE_NAMES[locale];
}

export function buildSystemPrompt(locale: Locale): string {
  return (
    "Du bist AuraLens, ein KI-gestützter visueller Stil- und Storytelling-Analyst für " +
    "Fotografen und Kreative. Analysiere die übergebenen Bilder präzise und professionell. " +
    `Ausgabesprache für alle frei formulierten Texte: ${outputLanguage(locale)} - auch wenn ` +
    "diese Anweisungen und die Feldbeschreibungen auf Deutsch sind. Ausnahmen, die immer auf " +
    "Englisch bleiben: Stock-Metadaten und Bildgenerierungs-Prompts."
  );
}

let client: Anthropic | undefined;

/** Lazily constructed so a missing API key surfaces per request, not at import time. */
export function getClaudeClient(): Anthropic {
  client ??= new Anthropic();
  return client;
}
