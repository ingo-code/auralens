// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/series/organize/route";
import { _resetRateLimitStore } from "@/lib/rate-limit";
import { buildSeries, SAMPLE_SPECS } from "@/lib/__tests__/fixtures/series";

const { report, files } = buildSeries(SAMPLE_SPECS, [3, 1, 4, 2]);

function buildRequest(body: unknown, ip = "3.0.0.1") {
  return new NextRequest("http://localhost:3000/api/series/organize", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
  });
}

describe("POST /api/series/organize", () => {
  beforeEach(() => {
    _resetRateLimitStore();
  });

  it("sortiert und gruppiert einen vorhandenen Report ohne neue Analyse", async () => {
    const res = await POST(buildRequest({ report, files, sort: "consistency", order: "desc", group: "category" }));

    expect(res.status).toBe(200);
    const { organization } = await res.json();
    expect(organization.sortedIndices).toEqual([3, 1, 4, 2]);
    expect(organization.groups.map((g: { key: string }) => g.key)).toEqual(["travel", "landscapes", "food"]);
  });

  it("nutzt Standardwerte, wenn keine Optionen angegeben sind", async () => {
    const res = await POST(buildRequest({ report, files }));
    expect((await res.json()).organization).toMatchObject({ sort: "upload", order: "asc", group: "none" });
  });

  it("lehnt ungültiges JSON mit 400 ab", async () => {
    const res = await POST(buildRequest("{kaputt"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/JSON/);
  });

  it("nennt das ungültige Feld bei falschen Optionen", async () => {
    const res = await POST(buildRequest({ report, files, group: "farbe" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/'group'/);
  });

  it("lehnt einen unvollständigen Report ab", async () => {
    const res = await POST(buildRequest({ report: { ...report, images: undefined }, files }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/'report.images'/);
  });

  it("lehnt Dateiangaben ab, die nicht zum Report passen", async () => {
    const res = await POST(buildRequest({ report, files: files.slice(0, 2) }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/files/);
  });

  it("lehnt zu große Anfragen anhand von Content-Length ab", async () => {
    const req = new NextRequest("http://localhost:3000/api/series/organize", {
      method: "POST",
      body: "{}",
      headers: { "content-length": String(2 * 1024 * 1024), "x-forwarded-for": "3.0.0.2" },
    });
    expect((await POST(req)).status).toBe(413);
  });
});
