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
  });

  it("lässt Claude auf Englisch antworten, wenn die Sprache Englisch ist", async () => {
    parseMock.mockResolvedValueOnce({ parsed_output: VALID_STYLE_REPORT });

    await analyzeImage(await compressImageForAnalysis(TINY_PNG), "en");

    const params = parseMock.mock.calls[0][0];
    expect(params.system).toMatch(/Ausgabesprache für alle frei formulierten Texte: Englisch/);
    expect(params.messages[0].content[1].text).toMatch(/Ausgabesprache aller übrigen Texte: Englisch/);
  });

  it("meldet eine Antwort ohne verwertbaren Report als Analysefehler (502)", async () => {
    parseMock.mockResolvedValueOnce({ parsed_output: null });

    await expect(analyzeImage(await compressImageForAnalysis(TINY_PNG))).rejects.toMatchObject({
      messageKey: "unparsableReport",
      status: 502,
    });
  });
});
