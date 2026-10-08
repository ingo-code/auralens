import { beforeEach, describe, expect, it, vi } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { AnalysisError, mapAnalysisError } from "@/lib/claude/errors";
import { getMessages } from "@/lib/i18n";

const de = getMessages("de");
const en = getMessages("en");

function badRequest(message: string) {
  return new Anthropic.BadRequestError(
    400,
    { type: "error", error: { type: "invalid_request_error", message } },
    message,
    new Headers()
  );
}

describe("mapAnalysisError", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("übersetzt AnalysisError in die Sprache der Anfrage und behält den Status", () => {
    const error = new AnalysisError("refusal", 422);
    expect(mapAnalysisError(error, de)).toEqual({ status: 422, message: de.errors.refusal, code: "content_refused" });
    expect(mapAnalysisError(error, en)).toEqual({ status: 422, message: en.errors.refusal, code: "content_refused" });
    expect(en.errors.refusal).toMatch(/declined/);
  });

  it("meldet ein abgelehntes Antwort-Schema als Serverfehler statt als Bildfehler", () => {
    const mapped = mapAnalysisError(badRequest("The compiled grammar is too large"), de);
    expect(mapped.status).toBe(500);
    expect(mapped.message).toMatch(/Konfigurationsfehler/);
  });

  it("meldet sonstige Bad Requests weiterhin als Bildproblem", () => {
    const mapped = mapAnalysisError(badRequest("Could not process image"), de);
    expect(mapped.status).toBe(400);
    expect(mapped.message).toMatch(/Bild/);
  });

  it("unterscheidet ungültige strukturierte Antworten von Konfigurationsfehlern", () => {
    expect(mapAnalysisError(new Anthropic.AnthropicError("Failed to parse structured output: x"), de).status).toBe(502);
    expect(mapAnalysisError(new Anthropic.AnthropicError("Could not resolve authentication method"), de).status).toBe(500);
  });
});
