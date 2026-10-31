import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const limit = vi.fn();
const purgeAllStaleUploads = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  getAdminClient: () => ({ from: () => ({ select: () => ({ limit }) }) }),
}));
vi.mock("@/lib/api/uploads", () => ({ purgeAllStaleUploads: () => purgeAllStaleUploads() }));

import { GET } from "../route";

const call = (auth?: string) =>
  GET(new NextRequest("http://localhost/api/cron/keepalive", { headers: auth ? { authorization: auth } : {} }));

describe("GET /api/cron/keepalive", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", "geheim");
    limit.mockReset().mockResolvedValue({ error: null });
    purgeAllStaleUploads.mockReset().mockResolvedValue(3);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("fragt mit gültigem Secret die Datenbank ab und räumt alte Uploads aller Nutzer auf", async () => {
    const res = await call("Bearer geheim");
    expect(res.status).toBe(200);
    expect(limit).toHaveBeenCalledWith(1);
    expect(purgeAllStaleUploads).toHaveBeenCalledOnce();
    expect(await res.json()).toEqual({ ok: true, uploadFoldersChecked: 3 });
  });

  it("meldet 502, wenn das Aufräumen scheitert", async () => {
    purgeAllStaleUploads.mockRejectedValue(new Error("storage down"));
    expect((await call("Bearer geheim")).status).toBe(502);
  });

  it("lehnt fehlendes oder falsches Secret ab, ohne die Datenbank anzufragen", async () => {
    expect((await call()).status).toBe(401);
    expect((await call("Bearer falsch")).status).toBe(401);
    expect(limit).not.toHaveBeenCalled();
    expect(purgeAllStaleUploads).not.toHaveBeenCalled();
  });

  it("lehnt alles ab, solange CRON_SECRET nicht gesetzt ist", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await call("Bearer ")).status).toBe(401);
  });

  it("meldet 502, wenn Supabase nicht antwortet", async () => {
    limit.mockResolvedValue({ error: { message: "timeout" } });
    expect((await call("Bearer geheim")).status).toBe(502);
  });
});
