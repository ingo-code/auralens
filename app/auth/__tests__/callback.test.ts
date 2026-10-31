// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { BETA_NOTICE_VERSION, BETA_TERMS_VERSION } from "@/lib/legal";

const auth = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
  signOut: vi.fn(),
  updateUser: vi.fn(),
}));
const repo = vi.hoisted(() => ({
  hasBetaAccess: vi.fn(),
  redeemInviteCode: vi.fn(),
  deleteUserAccount: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth }) }));
vi.mock("@/lib/api/repository", () => repo);

const { GET } = await import("@/app/auth/callback/route");

const USER_ID = "11111111-1111-4111-8111-111111111111";
const CODE = "AURALENS-BETA-2026-7KQ4M9TX";
const CONSENT = {
  beta_terms_version: BETA_TERMS_VERSION,
  beta_terms_accepted_at: "2026-10-27T10:00:00.000Z",
  beta_notice_version: BETA_NOTICE_VERSION,
  beta_notice_accepted_at: "2026-10-27T10:00:00.000Z",
};

function callback(query: string, inviteCookie?: unknown) {
  const headers: Record<string, string> = {};
  if (inviteCookie !== undefined) {
    headers.cookie = `auralens-invite=${encodeURIComponent(JSON.stringify(inviteCookie))}`;
  }
  return GET(new NextRequest(`http://localhost:3001/auth/callback${query}`, { headers }));
}

function signedIn(user: Record<string, unknown> = {}) {
  auth.exchangeCodeForSession.mockResolvedValue({
    data: { user: { id: USER_ID, app_metadata: { provider: "google" }, user_metadata: {}, ...user } },
    error: null,
  });
}

const location = (res: Response) => new URL(res.headers.get("location")!).pathname + new URL(res.headers.get("location")!).search;
const inviteCookieCleared = (res: Response) => /auralens-invite=;.*Max-Age=0/i.test(res.headers.get("set-cookie") ?? "");

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  auth.signOut.mockResolvedValue({ error: null });
  auth.updateUser.mockResolvedValue({ error: null });
  repo.deleteUserAccount.mockResolvedValue(undefined);
});

describe("/auth/callback im geschlossenen Beta-Test", () => {
  it("lässt bestehende Konten mit Beta-Zugang direkt durch", async () => {
    signedIn({ user_metadata: { beta_terms_version: BETA_TERMS_VERSION } });
    repo.hasBetaAccess.mockResolvedValue(true);

    const res = await callback("?code=abc");

    expect(location(res)).toBe("/dashboard");
    expect(repo.redeemInviteCode).not.toHaveBeenCalled();
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("löst bei einer Google-Registrierung den Code aus dem Cookie ein und speichert die Zustimmung", async () => {
    signedIn();
    repo.hasBetaAccess.mockResolvedValue(false);
    repo.redeemInviteCode.mockResolvedValue(true);

    const res = await callback("?code=abc", { code: CODE, consent: CONSENT });

    expect(repo.redeemInviteCode).toHaveBeenCalledWith(USER_ID, CODE);
    expect(auth.updateUser).toHaveBeenCalledWith({ data: CONSENT });
    expect(location(res)).toBe("/dashboard");
    expect(inviteCookieCleared(res)).toBe(true);
    expect(repo.deleteUserAccount).not.toHaveBeenCalled();
  });

  it("löscht ein neues Google-Konto ohne Code wieder und meldet invite_required", async () => {
    signedIn();
    repo.hasBetaAccess.mockResolvedValue(false);

    const res = await callback("?code=abc");

    expect(auth.signOut).toHaveBeenCalled();
    expect(repo.deleteUserAccount).toHaveBeenCalledWith(USER_ID);
    expect(location(res)).toBe("/login?error=invite_required");
  });

  it("löscht ein neues Google-Konto auch bei verbrauchtem Code", async () => {
    signedIn();
    repo.hasBetaAccess.mockResolvedValue(false);
    repo.redeemInviteCode.mockResolvedValue(false);

    const res = await callback("?code=abc", { code: CODE, consent: CONSENT });

    expect(repo.deleteUserAccount).toHaveBeenCalledWith(USER_ID);
    expect(location(res)).toBe("/login?error=invite_required");
    expect(inviteCookieCleared(res)).toBe(true);
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("ignoriert manipulierte Cookies", async () => {
    signedIn();
    repo.hasBetaAccess.mockResolvedValue(false);

    const res = await callback("?code=abc", { code: CODE, consent: "ja" });

    expect(repo.redeemInviteCode).not.toHaveBeenCalled();
    expect(location(res)).toBe("/login?error=invite_required");
  });

  it("meldet sich ab, wenn der Zugang nicht prüfbar ist, statt ihn zu gewähren", async () => {
    signedIn();
    repo.hasBetaAccess.mockRejectedValue(new Error("db down"));

    const res = await callback("?code=abc");

    expect(auth.signOut).toHaveBeenCalled();
    expect(repo.deleteUserAccount).not.toHaveBeenCalled();
    expect(location(res)).toBe("/login?error=oauth");
  });

  it("schickt bestätigte E-Mail-Registrierungen ohne Sitzung zur Anmeldung", async () => {
    auth.exchangeCodeForSession.mockResolvedValue({ data: { user: null }, error: new Error("verifier missing") });

    const res = await callback("?code=abc&flow=signup");

    expect(location(res)).toBe("/login?confirmed=1");
    expect(repo.hasBetaAccess).not.toHaveBeenCalled();
  });
});
