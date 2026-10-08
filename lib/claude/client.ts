import Anthropic from "@anthropic-ai/sdk";
import type { Locale } from "@/lib/i18n/config";

/** Model used for all vision analyses; override per deployment via env. */
export const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-5";

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
