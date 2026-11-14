// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { compressImageForAnalysis } from "@/lib/image-processing";
import { VALID_STYLE_REPORT } from "@/lib/__tests__/fixtures/style-report";

const parseMock = vi.fn();

vi.mock("@anthropic-ai/sdk", async () => {
  const actual = await vi.importActual<typeof import("@anthropic-ai/sdk")>("@anthropic-ai/sdk");
  class MockAnthropic {
    messages = { parse: parseMock };
  }
  Object.assign(MockAnthropic, {
    AuthenticationError: actual.AuthenticationError,
    RateLimitError: actual.RateLimitError,
    BadRequestError: actual.BadRequestError,
    APIError: actual.APIError,
    AnthropicError: actual.AnthropicError,
  });
  return { ...actual, default: MockAnthropic };
});

const { analyzeImage } = await import("@/lib/services/image-analysis");

// 1x1 transparent PNG - tiny but valid input for sharp.
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

describe("analyzeImage", () => {
  beforeEach(() => {
    parseMock.mockReset();
  });

  it("schickt das normalisierte Bild samt gemessenem Seitenverhältnis und liefert den Report", async () => {
    parseMock.mockResolvedValueOnce({ parsed_output: VALID_STYLE_REPORT });

    const report = await analyzeImage(await compressImageForAnalysis(TINY_PNG));

    expect(report).toEqual(VALID_STYLE_REPORT);
    const params = parseMock.mock.calls[0][0];
    expect(params.messages[0].content[0].source.media_type).toBe("image/jpeg");
    // The Midjourney aspect ratio is measured from the upload, not guessed.
    expect(params.messages[0].content[1].text).toMatch(/--ar 1:1/);
    expect(params.system).toMatch(/Ausgabesprache für alle frei formulierten Texte: Deutsch/);
    // Opus 5.5 would default to "medium" - the analysis keeps the depth of Opus 5.
    expect(params.output_config.effort).toBe("high");
  });

  it("lässt Claude auf Englisch antworten, wenn die Sprache Englisch ist", async () => {
    parseMock.mockResolvedValueOnce({ parsed_output: VALID_STYLE_REPORT });

    await analyzeImage(await compressImageForAnalysis(TINY_PNG), "en");

    const params = parseMock.mock.calls[0][0];
    expect(params.system).toMatch(/Ausgabesprache für alle frei formulierten Texte: Englisch/);
    expect(params.messages[0].content[1].text).toMatch(/Ausgabesprache aller übrigen Texte: Englisch/);
  });

  it("meldet den Token-Verbrauch und reicht das Abbruchsignal an die API weiter", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    parseMock.mockResolvedValueOnce({
      parsed_output: VALID_STYLE_REPORT,
      model: "claude-opus-5",
      stop_reason: "end_turn",
      usage: { input_tokens: 2800, output_tokens: 2100, cache_read_input_tokens: 0, cache_creation_input_tokens: null },
    });
    const onUsage = vi.fn();
    const controller = new AbortController();

    await analyzeImage(await compressImageForAnalysis(TINY_PNG), "de", { signal: controller.signal, onUsage });

    expect(parseMock.mock.calls[0][1]).toEqual({ signal: controller.signal });
    expect(onUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        part: "image",
        model: "claude-opus-5",
        inputTokens: 2800,
        outputTokens: 2100,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      })
    );
  });

  it("meldet den Verbrauch auch bei einer unbrauchbaren Antwort (sie kostet trotzdem)", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    parseMock.mockResolvedValueOnce({ parsed_output: null, usage: { input_tokens: 10, output_tokens: 20 } });
    const onUsage = vi.fn();

    await expect(analyzeImage(await compressImageForAnalysis(TINY_PNG), "de", { onUsage })).rejects.toMatchObject({
      messageKey: "unparsableReport",
    });
    expect(onUsage).toHaveBeenCalledWith(expect.objectContaining({ inputTokens: 10, outputTokens: 20 }));
  });

  it("meldet eine Antwort ohne verwertbaren Report als Analysefehler (502)", async () => {
    parseMock.mockResolvedValueOnce({ parsed_output: null });

    await expect(analyzeImage(await compressImageForAnalysis(TINY_PNG))).rejects.toMatchObject({
      messageKey: "unparsableReport",
      status: 502,
    });
  });
});
