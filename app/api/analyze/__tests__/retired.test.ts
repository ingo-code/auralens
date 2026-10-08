// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const parseMock = vi.hoisted(() => vi.fn());
const streamMock = vi.hoisted(() => vi.fn());
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { parse: parseMock, stream: streamMock };
  },
}));

const single = await import("@/app/api/analyze/route");
const series = await import("@/app/api/analyze/series/route");

// 1x1 PNG - a valid image, so nothing but the retirement can stop the call.
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

function upload(path: string, field: string, count: number, headers: Record<string, string> = {}) {
  const form = new FormData();
  for (let i = 0; i < count; i++) form.append(field, new File([TINY_PNG], `${i}.png`, { type: "image/png" }));
  return new NextRequest(`http://localhost:3001${path}`, { method: "POST", body: form, headers });
}

describe("Abgeschaltete anonyme Analyse-Routen", () => {
  it.each([
    ["/api/analyze", single.POST, upload("/api/analyze", "image", 1)],
    ["/api/analyze/series", series.POST, upload("/api/analyze/series", "images", 3)],
  ])("%s antwortet mit 410 und verweist auf die API v1, ohne Claude aufzurufen", async (_path, POST, req) => {
    const res = POST(req);

    expect(res.status).toBe(410);
    expect(res.headers.get("content-type")).toBe("application/problem+json");
    expect(res.headers.get("link")).toContain("/api/v1/analyses");
    const body = await res.json();
    expect(body).toMatchObject({ status: 410, code: "gone" });
    expect(body.detail).toMatch(/POST \/api\/v1\/analyses/);
    expect(parseMock).not.toHaveBeenCalled();
    expect(streamMock).not.toHaveBeenCalled();
  });

  it("antwortet in der Sprache der Anfrage", async () => {
    const res = single.POST(upload("/api/analyze", "image", 1, { "accept-language": "en" }));
    expect((await res.json()).detail).toMatch(/has been retired/);
  });
});
