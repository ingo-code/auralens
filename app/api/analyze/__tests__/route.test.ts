// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { _resetRateLimitStore } from "@/lib/rate-limit";

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

const { POST } = await import("@/app/api/analyze/route");

// 1x1 transparent PNG - tiny but valid input for sharp to process.
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

const VALID_REPORT = {
  style: { summary: "Ruhige Bildsprache.", tags: ["minimalistisch", "ruhig", "warm"] },
  colorPalette: [
    { hex: "#112233", name: "Tiefes Blau" },
    { hex: "#AABBCC", name: "Nebelgrau" },
    { hex: "#FF8800", name: "Bernstein" },
  ],
  emotions: ["Ruhe", "Geborgenheit"],
  imagePrompt: "a calm minimalist gradient, soft natural light, highly detailed, 8k",
};

function buildPngFile(name = "test.png") {
  return new File([Buffer.from(TINY_PNG_BASE64, "base64")], name, { type: "image/png" });
}

function buildRequest(body: FormData, headers: Record<string, string>) {
  return new NextRequest("http://localhost:3000/api/analyze", {
    method: "POST",
    body,
    headers,
  });
}

describe("POST /api/analyze", () => {
  beforeEach(() => {
    parseMock.mockReset();
    _resetRateLimitStore();
  });

  it("lehnt Requests ohne Bild mit 400 ab", async () => {
    const form = new FormData();
    const res = await POST(buildRequest(form, { "x-forwarded-for": "1.1.1.1" }));
    expect(res.status).toBe(400);
  });

  it("lehnt nicht unterstützte Dateitypen mit 400 ab", async () => {
    const form = new FormData();
    form.set("image", new File(["x"], "test.txt", { type: "text/plain" }));
    const res = await POST(buildRequest(form, { "x-forwarded-for": "1.1.1.2" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/Dateityp/);
  });

  it("liefert den geparsten Report bei Erfolg", async () => {
    parseMock.mockResolvedValueOnce({ parsed_output: VALID_REPORT });

    const form = new FormData();
    form.set("image", buildPngFile());
    const res = await POST(buildRequest(form, { "x-forwarded-for": "1.1.1.3" }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.report).toEqual(VALID_REPORT);

    // Image is normalized to JPEG before being sent to Claude.
    const callArgs = parseMock.mock.calls[0][0];
    const imageBlock = callArgs.messages[0].content[0];
    expect(imageBlock.source.media_type).toBe("image/jpeg");
  });

  it("gibt bei unerwartetem SDK-Fehler einen sauberen 500er zurück, ohne zu crashen", async () => {
    parseMock.mockRejectedValueOnce(new Error("network boom"));

    const form = new FormData();
    form.set("image", buildPngFile());
    const res = await POST(buildRequest(form, { "x-forwarded-for": "1.1.1.4" }));

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toMatch(/Unerwarteter Fehler/);
  });

  it("meldet eine ungültige strukturierte Antwort als Parse-Fehler, nicht als Konfigurationsfehler", async () => {
    const actual = await vi.importActual<typeof import("@anthropic-ai/sdk")>("@anthropic-ai/sdk");
    parseMock.mockRejectedValueOnce(
      new actual.AnthropicError("Failed to parse structured output: invalid hex")
    );

    const form = new FormData();
    form.set("image", buildPngFile());
    const res = await POST(buildRequest(form, { "x-forwarded-for": "1.1.1.5" }));

    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error).toMatch(/ungültig formatiert/);
  });

  it("blockt nach Erreichen des Rate-Limits mit 429", async () => {
    parseMock.mockResolvedValue({ parsed_output: VALID_REPORT });
    const ip = "9.9.9.9";
    const defaultLimit = 10; // matches lib/rate-limit default used by the route

    for (let i = 0; i < defaultLimit; i++) {
      const form = new FormData();
      form.set("image", buildPngFile());
      const res = await POST(buildRequest(form, { "x-forwarded-for": ip }));
      expect(res.status).toBe(200);
    }

    const form = new FormData();
    form.set("image", buildPngFile());
    const res = await POST(buildRequest(form, { "x-forwarded-for": ip }));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeTruthy();
  });
});
