// @vitest-environment node
import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { _resetRateLimitStore } from "@/lib/rate-limit";
import type { AnalysisJobRow, ApiKeyRow } from "@/lib/api/repository";
import { VALID_STYLE_REPORT } from "@/lib/__tests__/fixtures/style-report";
import { buildSeries, SAMPLE_SPECS } from "@/lib/__tests__/fixtures/series";

const repo = vi.hoisted(() => ({
  findActiveApiKeyByHash: vi.fn(),
  listApiKeys: vi.fn(),
  insertApiKey: vi.fn(),
  revokeApiKey: vi.fn(),
  createAnalysisJob: vi.fn(),
  findJobByIdempotencyKey: vi.fn(),
  getJob: vi.fn(),
  listJobs: vi.fn(),
  deleteJob: vi.fn(),
  markJobRunning: vi.fn(),
  completeJob: vi.fn(),
  completeStep: vi.fn(),
  failJob: vi.fn(),
  failStaleJobs: vi.fn(),
  getCreditBalance: vi.fn(),
}));
const getClaimsMock = vi.hoisted(() => vi.fn());
const backgroundTasks = vi.hoisted(() => [] as (() => Promise<void>)[]);
const parseMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/repository", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/repository")>("@/lib/api/repository");
  return { ...actual, ...repo };
});
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getClaims: getClaimsMock } }),
}));
vi.mock("@/lib/api/background", () => ({
  runInBackground: (task: () => Promise<void>) => backgroundTasks.push(task),
}));
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

const analyses = await import("@/app/api/v1/analyses/route");
const analysis = await import("@/app/api/v1/analyses/[id]/route");
const usage = await import("@/app/api/v1/usage/route");
const apiKeys = await import("@/app/api/v1/api-keys/route");
const apiKey = await import("@/app/api/v1/api-keys/[id]/route");
const { JobCreationError } = await import("@/lib/api/repository");
const { encodeCursor } = await import("@/lib/api/pagination");

const BASE = "http://localhost:3001/api/v1";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const JOB_ID = "22222222-2222-4222-8222-222222222222";
const KEY_ID = "33333333-3333-4333-8333-333333333333";
const API_KEY = "al_live_0123456789abcdefghijklmnopqrstuvwxyzABCDEFG";

// 1x1 transparent PNG - tiny but valid input for sharp.
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

function pngFile(name: string) {
  return new File([TINY_PNG], name, { type: "image/png" });
}

function keyRow(scopes = ["analyses:read", "analyses:write"]): ApiKeyRow {
  return {
    id: KEY_ID,
    user_id: USER_ID,
    name: "Test",
    prefix: "al_live_0123",
    scopes,
    created_at: "2026-10-08T10:00:00+00:00",
    last_used_at: null,
  };
}

function jobRow(overrides: Partial<AnalysisJobRow> = {}): AnalysisJobRow {
  return {
    id: JOB_ID,
    user_id: USER_ID,
    api_key_id: KEY_ID,
    type: "image",
    status: "queued",
    locale: "de",
    image_count: 1,
    files: [],
    credits: 1,
    report: null,
    error: null,
    completed_steps: [],
    idempotency_key: null,
    request_hash: "hash",
    created_at: "2026-10-08T10:00:00.123456+00:00",
    started_at: null,
    completed_at: null,
    ...overrides,
  };
}

const params = <P>(value: P) => ({ params: Promise.resolve(value) });
const noParams = params({} as Record<string, never>);

function request(path: string, init: { method?: string; headers?: Record<string, string>; body?: BodyInit } = {}) {
  return new NextRequest(`${BASE}${path}`, {
    method: init.method ?? "GET",
    headers: { "x-forwarded-for": "9.9.9.9", ...init.headers },
    body: init.body,
  });
}

function withKey(headers: Record<string, string> = {}) {
  return { authorization: `Bearer ${API_KEY}`, ...headers };
}

function uploadRequest(fileNames: string[], headers: Record<string, string> = withKey()) {
  const form = new FormData();
  fileNames.forEach((name) => form.append("images", pngFile(name)));
  return request("/analyses", { method: "POST", headers, body: form });
}

beforeEach(() => {
  vi.clearAllMocks();
  _resetRateLimitStore();
  backgroundTasks.length = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
  repo.findActiveApiKeyByHash.mockResolvedValue(keyRow());
  repo.failStaleJobs.mockResolvedValue(0);
  repo.findJobByIdempotencyKey.mockResolvedValue(null);
  getClaimsMock.mockResolvedValue({ data: null });
});

describe("Authentifizierung und Fehlerformat", () => {
  it("antwortet ohne Zugangsdaten mit 401 im Problem-Details-Format", async () => {
    const res = await analyses.GET(request("/analyses"), noParams);

    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).toBe("application/problem+json");
    const body = await res.json();
    expect(body).toMatchObject({ status: 401, code: "unauthorized", type: "urn:auralens:error:unauthorized" });
    expect(body.requestId).toBe(res.headers.get("x-request-id"));
  });

  it("schlägt den Key per SHA-256-Hash nach und lehnt unbekannte Keys ab", async () => {
    repo.findActiveApiKeyByHash.mockResolvedValue(null);

    const res = await analyses.GET(request("/analyses", { headers: withKey() }), noParams);

    expect(res.status).toBe(401);
    expect(repo.findActiveApiKeyByHash).toHaveBeenCalledWith(createHash("sha256").update(API_KEY).digest("hex"));
  });

  it("verweigert einem Nur-Lesen-Key das Starten von Analysen", async () => {
    repo.findActiveApiKeyByHash.mockResolvedValue(keyRow(["analyses:read"]));

    const res = await analyses.POST(uploadRequest(["a.png"]), noParams);

    expect(res.status).toBe(403);
    expect((await res.json()).detail).toMatch(/analyses:write/);
    expect(repo.createAnalysisJob).not.toHaveBeenCalled();
  });

  it("akzeptiert die Browser-Sitzung, blockt aber fremde Origins bei Schreibzugriffen", async () => {
    getClaimsMock.mockResolvedValue({ data: { claims: { sub: USER_ID } } });

    const res = await analyses.POST(
      uploadRequest(["a.png"], { origin: "https://evil.example", host: "localhost:3001" }),
      noParams
    );

    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("forbidden");
  });

  it("antwortet in der Sprache der Anfrage", async () => {
    const res = await analyses.GET(request("/analyses?lang=en"), noParams);
    expect((await res.json()).detail).toMatch(/Not authenticated/);
  });
});

describe("POST /api/v1/analyses", () => {
  it("legt eine Serie an, reserviert 1 Credit pro Bild und antwortet sofort mit 202", async () => {
    repo.createAnalysisJob.mockImplementation(async (input) =>
      jobRow({ type: input.type, image_count: input.files.length, credits: input.credits, files: input.files })
    );

    const res = await analyses.POST(uploadRequest(["eins.png", "zwei.png"]), noParams);

    expect(res.status).toBe(202);
    expect(res.headers.get("location")).toBe(`/api/v1/analyses/${JOB_ID}`);
    expect(res.headers.get("ratelimit-limit")).toBeTruthy();
    const body = await res.json();
    expect(body).toMatchObject({ object: "analysis", id: JOB_ID, type: "series", status: "queued", credits: 2 });
    expect(body.files.map((file: { name: string }) => file.name)).toEqual(["eins.png", "zwei.png"]);

    const input = repo.createAnalysisJob.mock.calls[0][0];
    expect(input).toMatchObject({ userId: USER_ID, apiKeyId: KEY_ID, type: "series", credits: 2, locale: "de" });
    expect(backgroundTasks).toHaveLength(1);
  });

  it("wertet ein einzelnes Bild als Einzelbild-Analyse", async () => {
    repo.createAnalysisJob.mockResolvedValue(jobRow());

    await analyses.POST(uploadRequest(["a.png"]), noParams);

    expect(repo.createAnalysisJob.mock.calls[0][0]).toMatchObject({ type: "image", credits: 1 });
  });

  it("lehnt Anfragen ohne Bilder ab, bevor Credits reserviert werden", async () => {
    const res = await analyses.POST(request("/analyses", { method: "POST", headers: withKey(), body: new FormData() }), noParams);

    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("invalid_request");
    expect(repo.createAnalysisJob).not.toHaveBeenCalled();
  });

  it("meldet fehlende Credits mit 402 und nennt Bedarf und Guthaben", async () => {
    repo.createAnalysisJob.mockRejectedValue(new JobCreationError("insufficient_credits"));
    repo.getCreditBalance.mockResolvedValue(1);

    const res = await analyses.POST(uploadRequest(["a.png", "b.png", "c.png"]), noParams);

    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.code).toBe("insufficient_credits");
    expect(body.detail).toMatch(/3.*1/);
    expect(backgroundTasks).toHaveLength(0);
  });

  it("begrenzt gleichzeitig laufende Analysen mit 429", async () => {
    repo.createAnalysisJob.mockRejectedValue(new JobCreationError("too_many_active"));

    const res = await analyses.POST(uploadRequest(["a.png"]), noParams);

    expect(res.status).toBe(429);
    expect((await res.json()).code).toBe("too_many_active_analyses");
  });

  describe("Idempotency-Key", () => {
    async function firstRequestHash(): Promise<string> {
      repo.createAnalysisJob.mockResolvedValue(jobRow());
      await analyses.POST(uploadRequest(["a.png"], withKey({ "idempotency-key": "k1" })), noParams);
      const input = repo.createAnalysisJob.mock.calls[0][0];
      expect(input.idempotencyKey).toBe("k1");
      return input.requestHash;
    }

    it("liefert bei einer Wiederholung die bestehende Analyse statt einer neuen", async () => {
      const hash = await firstRequestHash();
      repo.createAnalysisJob.mockClear();
      repo.findJobByIdempotencyKey.mockResolvedValue(jobRow({ idempotency_key: "k1", request_hash: hash, status: "running" }));

      const res = await analyses.POST(uploadRequest(["a.png"], withKey({ "idempotency-key": "k1" })), noParams);

      expect(res.status).toBe(200);
      expect(res.headers.get("idempotent-replayed")).toBe("true");
      expect((await res.json()).status).toBe("running");
      expect(repo.createAnalysisJob).not.toHaveBeenCalled();
    });

    it("lehnt denselben Key mit anderen Bildern mit 409 ab", async () => {
      repo.findJobByIdempotencyKey.mockResolvedValue(jobRow({ idempotency_key: "k1", request_hash: "anderer-hash" }));

      const res = await analyses.POST(uploadRequest(["a.png"], withKey({ "idempotency-key": "k1" })), noParams);

      expect(res.status).toBe(409);
      expect((await res.json()).code).toBe("idempotency_conflict");
    });

    it("übernimmt bei einem Wettlauf zweier gleicher Anfragen das Ergebnis der ersten", async () => {
      const hash = await firstRequestHash();
      repo.createAnalysisJob.mockRejectedValue(new JobCreationError("duplicate_idempotency_key"));
      repo.findJobByIdempotencyKey
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(jobRow({ idempotency_key: "k1", request_hash: hash }));

      const res = await analyses.POST(uploadRequest(["a.png"], withKey({ "idempotency-key": "k1" })), noParams);

      expect(res.status).toBe(200);
      expect(res.headers.get("idempotent-replayed")).toBe("true");
    });
  });

  describe("Verarbeitung im Hintergrund", () => {
    async function startSingleImageJob() {
      repo.createAnalysisJob.mockResolvedValue(jobRow());
      repo.markJobRunning.mockResolvedValue(true);
      repo.completeJob.mockResolvedValue(true);
      repo.failJob.mockResolvedValue(true);
      await analyses.POST(uploadRequest(["a.png"]), noParams);
      expect(backgroundTasks).toHaveLength(1);
    }

    it("speichert den Report, wenn Claude erfolgreich antwortet", async () => {
      await startSingleImageJob();
      parseMock.mockResolvedValue({ parsed_output: VALID_STYLE_REPORT });

      await backgroundTasks[0]();

      expect(repo.markJobRunning).toHaveBeenCalledWith(JOB_ID);
      expect(repo.completeJob).toHaveBeenCalledWith(JOB_ID, VALID_STYLE_REPORT);
      expect(repo.failJob).not.toHaveBeenCalled();
    });

    it("markiert den Job bei Claude-Fehlern als fehlgeschlagen (mit Erstattung)", async () => {
      await startSingleImageJob();
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      parseMock.mockRejectedValue(
        new Anthropic.RateLimitError(429, { type: "error", error: { type: "rate_limit_error", message: "slow" } }, "slow", new Headers())
      );

      await backgroundTasks[0]();

      expect(repo.failJob).toHaveBeenCalledWith(JOB_ID, "upstream_rate_limited");
      expect(repo.completeJob).not.toHaveBeenCalled();
    });

    it("überspringt Jobs, die vor dem Start gelöscht wurden", async () => {
      await startSingleImageJob();
      repo.markJobRunning.mockResolvedValue(false);

      await backgroundTasks[0]();

      expect(parseMock).not.toHaveBeenCalled();
    });
  });
});

describe("GET /api/v1/analyses", () => {
  it("liefert eine Seite ohne Reports und einen Cursor für die nächste", async () => {
    const rows = [jobRow({ id: JOB_ID }), jobRow({ id: "44444444-4444-4444-8444-444444444444" })];
    repo.listJobs.mockResolvedValue({ rows, hasMore: true });

    const res = await analyses.GET(request("/analyses?limit=2&status=completed", { headers: withKey() }), noParams);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ object: "list", hasMore: true });
    expect(body.data).toHaveLength(2);
    expect(body.data[0]).not.toHaveProperty("report");
    expect(body.nextCursor).toBe(encodeCursor({ createdAt: rows[1].created_at, id: rows[1].id }));
    expect(repo.listJobs).toHaveBeenCalledWith(USER_ID, { limit: 2, cursor: undefined, status: "completed", type: undefined });
    expect(repo.failStaleJobs).toHaveBeenCalledWith(USER_ID);
  });

  it("reicht einen gültigen Cursor dekodiert weiter", async () => {
    repo.listJobs.mockResolvedValue({ rows: [], hasMore: false });
    const cursor = { createdAt: "2026-10-08T10:00:00.123456+00:00", id: JOB_ID };

    await analyses.GET(request(`/analyses?cursor=${encodeCursor(cursor)}`, { headers: withKey() }), noParams);

    expect(repo.listJobs.mock.calls[0][1].cursor).toEqual(cursor);
  });

  it("lehnt manipulierte Cursor und ungültige Limits mit 400 ab", async () => {
    const forged = Buffer.from(JSON.stringify(["x),or(id.neq.0", JOB_ID])).toString("base64url");
    const badCursor = await analyses.GET(request(`/analyses?cursor=${forged}`, { headers: withKey() }), noParams);
    const badLimit = await analyses.GET(request("/analyses?limit=500", { headers: withKey() }), noParams);

    expect(badCursor.status).toBe(400);
    expect(badLimit.status).toBe(400);
    expect(repo.listJobs).not.toHaveBeenCalled();
  });
});

describe("GET/DELETE /api/v1/analyses/{id}", () => {
  it("liefert eine abgeschlossene Serie mit Report und sortierter Organisation", async () => {
    const { report, files } = buildSeries(SAMPLE_SPECS);
    repo.getJob.mockResolvedValue(
      jobRow({ type: "series", status: "completed", report, files, image_count: files.length, credits: files.length })
    );

    const res = await analysis.GET(
      request(`/analyses/${JOB_ID}?sort=consistency&order=desc`, { headers: withKey() }),
      params({ id: JOB_ID })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.report).toEqual(report);
    // Scores 80/20/95/80: best first, the weak image last.
    expect(body.organization).toMatchObject({ sort: "consistency", order: "desc", group: "none" });
    expect(body.organization.sortedIndices[0]).toBe(3);
    expect(body.organization.sortedIndices.at(-1)).toBe(2);
    expect(repo.getJob).toHaveBeenCalledWith(USER_ID, JOB_ID);
  });

  it("übersetzt den Fehlercode eines fehlgeschlagenen Jobs in eine Meldung", async () => {
    repo.getJob.mockResolvedValue(jobRow({ status: "failed", error: { code: "processing_interrupted" } }));

    const res = await analysis.GET(request(`/analyses/${JOB_ID}?lang=en`, { headers: withKey() }), params({ id: JOB_ID }));

    const body = await res.json();
    expect(body.error).toEqual({ code: "processing_interrupted", message: expect.stringMatching(/refunded/) });
    expect(body.report).toBeNull();
  });

  it("meldet den Fortschritt einer laufenden Serie pro Teil", async () => {
    repo.getJob.mockResolvedValue(jobRow({ type: "series", status: "running", completed_steps: ["prompts"] }));

    const res = await analysis.GET(request(`/analyses/${JOB_ID}`, { headers: withKey() }), params({ id: JOB_ID }));

    expect((await res.json()).progress).toEqual({
      steps: ["consistency", "market", "prompts"],
      completedSteps: ["prompts"],
    });
  });

  it("zählt bei abgeschlossenen Einzelbildern den einzigen Schritt als erledigt", async () => {
    repo.getJob.mockResolvedValue(jobRow({ status: "completed", report: VALID_STYLE_REPORT }));

    const res = await analysis.GET(request(`/analyses/${JOB_ID}`, { headers: withKey() }), params({ id: JOB_ID }));

    expect((await res.json()).progress).toEqual({ steps: ["analysis"], completedSteps: ["analysis"] });
  });

  it("antwortet bei unbekannten oder ungültigen IDs mit 404", async () => {
    repo.getJob.mockResolvedValue(null);

    const unknown = await analysis.GET(request(`/analyses/${JOB_ID}`, { headers: withKey() }), params({ id: JOB_ID }));
    const malformed = await analysis.GET(request("/analyses/abc", { headers: withKey() }), params({ id: "abc" }));

    expect(unknown.status).toBe(404);
    expect(malformed.status).toBe(404);
    expect(repo.getJob).toHaveBeenCalledTimes(1);
  });

  it("löscht eine Analyse mit 204", async () => {
    repo.deleteJob.mockResolvedValue(true);

    const res = await analysis.DELETE(request(`/analyses/${JOB_ID}`, { method: "DELETE", headers: withKey() }), params({ id: JOB_ID }));

    expect(res.status).toBe(204);
    expect(repo.deleteJob).toHaveBeenCalledWith(USER_ID, JOB_ID);
  });
});

describe("GET /api/v1/usage", () => {
  it("liefert Guthaben und Limits", async () => {
    repo.getCreditBalance.mockResolvedValue(17);

    const res = await usage.GET(request("/usage", { headers: withKey() }), noParams);

    const body = await res.json();
    expect(body).toMatchObject({ object: "usage", credits: { balance: 17, costPerImage: 1 } });
    expect(body.limits.maxImagesPerAnalysis).toBe(10);
  });
});

describe("/api/v1/api-keys", () => {
  beforeEach(() => {
    getClaimsMock.mockResolvedValue({ data: { claims: { sub: USER_ID } } });
  });

  it("ist mit einem API-Key nicht erreichbar", async () => {
    const res = await apiKeys.GET(request("/api-keys", { headers: withKey() }), noParams);
    expect(res.status).toBe(403);
    expect(repo.listApiKeys).not.toHaveBeenCalled();
  });

  it("erzeugt einen Key, zeigt ihn einmal und speichert nur den Hash", async () => {
    repo.listApiKeys.mockResolvedValue([]);
    repo.insertApiKey.mockImplementation(async (input) => ({ ...keyRow(input.scopes), name: input.name, prefix: input.prefix }));

    const res = await apiKeys.POST(
      request("/api-keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "  Lightroom  ", scopes: ["analyses:write", "analyses:read"] }),
      }),
      noParams
    );

    expect(res.status).toBe(201);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body.key).toMatch(/^al_live_[A-Za-z0-9_-]{43}$/);
    expect(body.key.startsWith(body.prefix)).toBe(true);

    const stored = repo.insertApiKey.mock.calls[0][0];
    expect(stored).toMatchObject({ userId: USER_ID, name: "Lightroom", scopes: ["analyses:read", "analyses:write"] });
    expect(stored.hash).toBe(createHash("sha256").update(body.key).digest("hex"));
    expect(JSON.stringify(stored)).not.toContain(body.key);
  });

  it("begrenzt die Zahl aktiver Keys", async () => {
    repo.listApiKeys.mockResolvedValue(Array.from({ length: 10 }, () => keyRow()));

    const res = await apiKeys.POST(
      request("/api-keys", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "x" }) }),
      noParams
    );

    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("api_key_limit_reached");
  });

  it("widerruft Keys und meldet unbekannte mit 404", async () => {
    repo.revokeApiKey.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    const ok = await apiKey.DELETE(request(`/api-keys/${KEY_ID}`, { method: "DELETE" }), params({ id: KEY_ID }));
    const missing = await apiKey.DELETE(request(`/api-keys/${KEY_ID}`, { method: "DELETE" }), params({ id: KEY_ID }));

    expect(ok.status).toBe(204);
    expect(missing.status).toBe(404);
    expect(repo.revokeApiKey).toHaveBeenCalledWith(USER_ID, KEY_ID);
  });
});
