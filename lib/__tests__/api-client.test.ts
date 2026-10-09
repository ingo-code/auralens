import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiProblem, fetchUsage, pollAnalysis, startAnalysis } from "@/lib/api-client";
import type { AnalysisResource } from "@/lib/api/resources";
import { getMessages } from "@/lib/i18n";

const t = getMessages("de");

function analysis(status: AnalysisResource["status"], completedSteps: AnalysisResource["progress"]["completedSteps"] = []): AnalysisResource {
  return {
    object: "analysis",
    id: "job-1",
    type: "series",
    status,
    imageCount: 2,
    credits: 2,
    locale: "de",
    files: [],
    createdAt: "2026-10-09T10:00:00Z",
    startedAt: null,
    completedAt: null,
    error: null,
    progress: { steps: ["consistency", "market", "prompts"], completedSteps },
  };
}

const json = (body: unknown, status = 200, contentType = "application/json") =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": contentType } });

const problem = (status: number, code: string, detail: string) =>
  json({ type: `urn:auralens:error:${code}`, title: "x", status, code, detail, requestId: "r" }, status, "application/problem+json");

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Fehler im RFC-9457-Format", () => {
  it("übernimmt die lokalisierte Meldung und den stabilen Code", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(problem(402, "insufficient_credits", "Nicht genug Credits: benötigt 3, verfügbar 1.")));

    const error = await startAnalysis([], t, { idempotencyKey: "k" }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiProblem);
    expect(error).toMatchObject({ status: 402, code: "insufficient_credits", message: "Nicht genug Credits: benötigt 3, verfügbar 1." });
  });

  it("ergänzt eine deutsche Meldung, wenn das Problem keinen detail-Text hat", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(problem(429, "too_many_active_analyses", "")));

    await expect(fetchUsage(t)).rejects.toThrow(t.apiErrors.too_many_active_analyses);
  });

  it("meldet HTML-Fehlerseiten (z. B. vom Proxy) verständlich statt abzustürzen", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>Bad Gateway</html>", { status: 502 })));

    await expect(fetchUsage(t)).rejects.toMatchObject({ status: 502, message: expect.stringMatching(/HTTP 502/) });
  });

  it("meldet Netzwerkfehler als nicht erreichbaren Server", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(fetchUsage(t)).rejects.toMatchObject({ code: "network_error", message: t.errors.serverUnreachable });
  });

  it("lädt die Bilder per signierter URL hoch und startet die Analyse mit den Pfaden", async () => {
    const slot = (index: number, name: string) => ({
      index,
      name,
      path: `u/b/${index}-${name}`,
      uploadUrl: `https://storage.example/${index}`,
      token: "tok",
      contentType: "image/jpeg",
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ object: "upload_batch", expiresAt: "x", uploads: [slot(1, "a.jpg"), slot(2, "b.jpg")] }, 201))
      .mockResolvedValueOnce(json({ Key: "1" }))
      .mockResolvedValueOnce(json({ Key: "2" }))
      .mockResolvedValueOnce(json(analysis("queued"), 202));
    vi.stubGlobal("fetch", fetchMock);
    const files = [new File(["a"], "a.jpg", { type: "image/jpeg" }), new File(["b"], "b.jpg", { type: "image/jpeg" })];

    await startAnalysis(files, t, { idempotencyKey: "key-1" });

    const [uploadsUrl, uploadsInit] = fetchMock.mock.calls[0];
    expect(uploadsUrl).toBe("/api/v1/uploads");
    expect(JSON.parse(uploadsInit.body)).toEqual({
      files: [
        { name: "a.jpg", type: "image/jpeg", size: 1 },
        { name: "b.jpg", type: "image/jpeg", size: 1 },
      ],
    });

    const puts = fetchMock.mock.calls.slice(1, 3);
    expect(puts.map(([url, init]) => [url, init.method, init.body, init.credentials])).toEqual([
      ["https://storage.example/1", "PUT", files[0], "omit"],
      ["https://storage.example/2", "PUT", files[1], "omit"],
    ]);

    const [url, init] = fetchMock.mock.calls[3];
    expect(url).toBe("/api/v1/analyses");
    expect(init.headers).toEqual({ "Content-Type": "application/json", "Idempotency-Key": "key-1" });
    expect(JSON.parse(init.body)).toEqual({
      uploads: [
        { path: "u/b/1-a.jpg", name: "a.jpg" },
        { path: "u/b/2-b.jpg", name: "b.jpg" },
      ],
    });
  });

  it("meldet einen fehlgeschlagenen Upload mit der Bildnummer und startet keine Analyse", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        json({
          object: "upload_batch",
          expiresAt: "x",
          uploads: [{ index: 1, name: "a.jpg", path: "p", uploadUrl: "https://s/1", token: "t", contentType: "image/jpeg" }],
        }, 201)
      )
      .mockResolvedValueOnce(new Response("denied", { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(startAnalysis([new File(["a"], "a.jpg", { type: "image/jpeg" })], t, { idempotencyKey: "k" })).rejects.toMatchObject({
      message: t.errors.uploadFailed(1),
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("pollAnalysis", () => {
  it("fragt ab, bis die Analyse fertig ist, und meldet jeden Zwischenstand", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(json(analysis("queued")))
        .mockResolvedValueOnce(json(analysis("running", ["prompts"])))
        .mockResolvedValueOnce(json(analysis("completed")))
    );
    const updates: string[] = [];

    const final = await pollAnalysis("job-1", t, {
      intervalMs: 1,
      onUpdate: (a) => updates.push(`${a.status}:${a.progress.completedSteps.join(",")}`),
    });

    expect(final.status).toBe("completed");
    expect(updates).toEqual(["queued:", "running:prompts", "completed:"]);
  });

  it("übersteht kurze Aussetzer, gibt aber nach mehreren Fehlern in Folge auf", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(problem(503, "internal_error", "kurz weg"))
      .mockResolvedValueOnce(json(analysis("completed")));
    vi.stubGlobal("fetch", fetchMock);

    await expect(pollAnalysis("job-1", t, { intervalMs: 1 })).resolves.toMatchObject({ status: "completed" });

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    await expect(pollAnalysis("job-1", t, { intervalMs: 1 })).rejects.toThrow(t.analysis.connectionLost);
  });

  it("bricht bei endgültigen Fehlern wie 404 sofort ab", async () => {
    const fetchMock = vi.fn().mockResolvedValue(problem(404, "not_found", "Analyse nicht gefunden."));
    vi.stubGlobal("fetch", fetchMock);

    await expect(pollAnalysis("job-1", t, { intervalMs: 1 })).rejects.toMatchObject({ status: 404 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("lässt sich abbrechen", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => json(analysis("running"))));
    const controller = new AbortController();

    const polling = pollAnalysis("job-1", t, { intervalMs: 50, signal: controller.signal });
    controller.abort();

    await expect(polling).rejects.toMatchObject({ name: "AbortError" });
  });
});
