// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AnalysisError } from "@/lib/claude/errors";
import { compressImageForAnalysis, type ProcessedImage } from "@/lib/image-processing";
import type { ConsistencyPart, MarketPart, PromptsPart } from "@/lib/series-analysis-schema";

const streamMock = vi.fn();

vi.mock("@anthropic-ai/sdk", async () => {
  const actual = await vi.importActual<typeof import("@anthropic-ai/sdk")>("@anthropic-ai/sdk");

  class MockAnthropic {
    messages = { stream: streamMock };
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

const { analyzeSeries } = await import("@/lib/services/series-analysis");

// 1x1 transparent PNG - tiny but valid input for sharp to process.
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function buildConsistencyPart(imageIndices: number[], suggestedOrder = imageIndices): ConsistencyPart {
  return {
    series: { title: "Ruhe", summary: "Ruhige Serie.", styleTags: ["minimalistisch", "ruhig", "warm"] },
    consistency: {
      overallScore: 82,
      dimensions: { color: 80, lighting: 85, postProcessing: 78, composition: 84 },
      verdict: "Bild 2 ist etwas kühler.",
      recommendations: ["Weißabgleich von Bild 2 angleichen."],
    },
    narrative: {
      arcSummary: "Vom Überblick ins Detail.",
      suggestedOrder,
      orderRationale: "Stärkerer Einstieg.",
      missingShots: [],
    },
    images: imageIndices.map((index) => ({
      index,
      summary: `Bild ${index}`,
      consistencyScore: 80,
      narrativeRole: "detail",
      shotType: "wide",
      dominantColors: [
        { hex: "#112233", name: "Tiefes Blau" },
        { hex: "#AABBCC", name: "Nebelgrau" },
      ],
      deviations: [],
    })),
  };
}

function buildMarketPart(imageIndices: number[]): MarketPart {
  return {
    masterPalette: {
      colors: [
        { hex: "#112233", name: "Tiefes Blau", role: "primary" },
        { hex: "#AABBCC", name: "Nebelgrau", role: "neutral" },
        { hex: "#FF8800", name: "Bernstein", role: "accent" },
        { hex: "#F5F1EA", name: "Leinen", role: "background" },
      ],
      harmony: { type: "complementary", description: "Blau und Bernstein ergänzen sich." },
    },
    market: {
      industries: [
        { name: "Interior Design", fitScore: 90, rationale: "Ruhige Räume.", useCases: ["Landingpage-Hero"] },
        { name: "Tech-SaaS", fitScore: 70, rationale: "Klar.", useCases: ["Blog-Header"] },
        { name: "Wellness", fitScore: 65, rationale: "Ruhig.", useCases: ["Social Ads"] },
      ],
      targetAudiences: [
        { segment: "Urbane Millennials", rationale: "Minimalismus." },
        { segment: "Design-Agenturen", rationale: "Klarheit." },
      ],
      psychology: [
        { emotion: "Ruhe", intensity: 90, trigger: "Weiches Licht" },
        { emotion: "Vertrauen", intensity: 70, trigger: "Klare Linien" },
        { emotion: "Exklusivität", intensity: 50, trigger: "Reduzierte Palette" },
      ],
    },
    stock: imageIndices.map((index) => ({
      index,
      category: "landscapes",
      title: `Calm minimalist interior ${index}`,
      description: "A calm minimalist interior in soft light.",
      keywords: Array.from({ length: 25 }, (_, i) => `keyword${i}`),
    })),
  };
}

function buildPromptsPart(): PromptsPart {
  return {
    aiPrompts: {
      photographicSpec: {
        focalLength: "35mm",
        aperture: "f/2",
        lighting: "Fensterlicht",
        filmStock: "Kodak Portra 400",
        colorGrading: "warm",
        mood: "ruhig",
      },
      midjourney: "[subject], soft window light --ar 1:1 --raw --v 8.2",
      flux: { positive: "[subject] in soft window light", negative: "harsh flash" },
      firefly: "A calm interior scene with [subject] in soft window light.",
      dalle3: "Create a photorealistic image of [subject] in a calm interior.",
    },
  };
}

type StreamParams = {
  output_config: { format: { schema: { properties: Record<string, unknown> } } };
};

type Part = "consistency" | "market" | "prompts";

/** Identifies a request by the schema it asks for rather than by call order. */
function partOf(params: StreamParams): Part {
  const { properties } = params.output_config.format.schema;
  if ("consistency" in properties) return "consistency";
  if ("aiPrompts" in properties) return "prompts";
  return "market";
}

const ok = (parsed_output: unknown) => ({ stop_reason: "end_turn", parsed_output });

/** Answers each of the three parallel requests with the matching part. */
function mockParts(consistency: unknown, market: unknown, prompts: unknown = ok(buildPromptsPart())) {
  const messages = { consistency, market, prompts };
  streamMock.mockImplementation((params: StreamParams) => {
    const message = messages[partOf(params)];
    return { finalMessage: () => Promise.resolve(message) };
  });
}

/** n normalized 1x1 images, as the job runner passes them in. */
async function images(n: number): Promise<ProcessedImage[]> {
  const image = await compressImageForAnalysis(Buffer.from(TINY_PNG_BASE64, "base64"));
  return Array.from({ length: n }, () => image);
}

describe("analyzeSeries", () => {
  beforeEach(() => {
    streamMock.mockReset();
  });

  it("sendet alle Bilder nummeriert an alle drei Teil-Analysen und führt sie sortiert zusammen", async () => {
    mockParts(ok(buildConsistencyPart([3, 1, 2], [2, 1, 3])), ok(buildMarketPart([2, 3, 1])));

    const report = await analyzeSeries(await images(3));

    expect(report.images.map((image) => image.index)).toEqual([1, 2, 3]);
    // Stock metadata is joined by index, not by array position.
    expect(report.images[1].stock.title).toBe("Calm minimalist interior 2");
    expect(report.images[1].stock).not.toHaveProperty("index");
    expect(report.narrative.suggestedOrder).toEqual([2, 1, 3]);
    expect(report.masterPalette.colors).toHaveLength(4);
    expect(report.aiPrompts.firefly).toMatch(/calm interior/);
    expect(report.aiPrompts.flux.negative).toBe("harsh flash");

    expect(streamMock).toHaveBeenCalledTimes(3);
    expect(streamMock.mock.calls.map(([params]) => partOf(params)).sort()).toEqual(["consistency", "market", "prompts"]);
    for (const [params] of streamMock.mock.calls) {
      const content = params.messages[0].content;
      expect(content.filter((block: { type: string }) => block.type === "image")).toHaveLength(3);
      expect(content[0]).toEqual({ type: "text", text: "Bild 1:" });
      expect(content[1].source.media_type).toBe("image/jpeg");
    }
  });

  it("meldet jeden fertigen Teil sofort für den Live-Fortschritt", async () => {
    mockParts(ok(buildConsistencyPart([1, 2])), ok(buildMarketPart([1, 2])));
    const done: string[] = [];

    await analyzeSeries(await images(2), "de", (part) => done.push(part));

    expect(done.sort()).toEqual(["consistency", "market", "prompts"]);
  });

  it("analysiert auf Englisch, wenn die Sprache Englisch ist", async () => {
    mockParts(ok(buildConsistencyPart([1, 2])), ok(buildMarketPart([1, 2])));

    await analyzeSeries(await images(2), "en");

    for (const [params] of streamMock.mock.calls) {
      expect(params.system).toMatch(/Englisch/);
    }
  });

  it("ersetzt eine ungültige Reihenfolge-Empfehlung durch die Upload-Reihenfolge", async () => {
    mockParts(ok(buildConsistencyPart([1, 2], [2, 2])), ok(buildMarketPart([1, 2])));

    const report = await analyzeSeries(await images(2));

    expect(report.narrative.suggestedOrder).toEqual([1, 2]);
  });

  it("meldet eine Konsistenz-Analyse, die nicht alle Bilder abdeckt, als unvollständig (502)", async () => {
    mockParts(ok(buildConsistencyPart([1])), ok(buildMarketPart([1, 2])));

    await expect(analyzeSeries(await images(2))).rejects.toMatchObject({ messageKey: "incompleteSeries", status: 502 });
  });

  it("meldet fehlende Stock-Daten für ein Bild als unvollständig", async () => {
    mockParts(ok(buildConsistencyPart([1, 2])), ok(buildMarketPart([1, 1])));

    await expect(analyzeSeries(await images(2))).rejects.toBeInstanceOf(AnalysisError);
  });

  it("meldet eine Ablehnung durch das Modell als 422", async () => {
    mockParts({ stop_reason: "refusal", parsed_output: null }, ok(buildMarketPart([1, 2])));

    await expect(analyzeSeries(await images(2))).rejects.toMatchObject({ messageKey: "refusal", status: 422 });
  });

  it("meldet abgeschnittene Antworten als truncated", async () => {
    mockParts({ stop_reason: "max_tokens", parsed_output: null }, ok(buildMarketPart([1, 2])));

    await expect(analyzeSeries(await images(2))).rejects.toMatchObject({ messageKey: "truncated" });
  });

  it("bricht die übrigen Teil-Analysen ab, sobald eine fehlschlägt", async () => {
    const pendingSignals: AbortSignal[] = [];
    streamMock.mockImplementation((params: StreamParams, options: { signal: AbortSignal }) => {
      if (partOf(params) === "consistency") {
        return { finalMessage: () => Promise.reject(new Error("network boom")) };
      }
      pendingSignals.push(options.signal);
      // Never settles on its own - only the abort ends it.
      return { finalMessage: () => new Promise(() => {}) };
    });

    await expect(analyzeSeries(await images(2))).rejects.toThrow("network boom");
    expect(pendingSignals).toHaveLength(2);
    expect(pendingSignals.every((signal) => signal.aborted)).toBe(true);
  });

  it("gibt dem Prompt-Teil das Seitenverhältnis der Serie für Midjourney mit", async () => {
    mockParts(ok(buildConsistencyPart([1, 2])), ok(buildMarketPart([1, 2])));

    await analyzeSeries(await images(2));

    const [promptsParams] = streamMock.mock.calls.find(([params]) => partOf(params) === "prompts")!;
    expect(promptsParams.messages[0].content.at(-1).text).toMatch(/--ar 1:1/);
  });
});
