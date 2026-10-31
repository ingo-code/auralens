import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LoginPage from "@/app/login/page";
import { BETA_NOTICE_VERSION, BETA_TERMS_VERSION } from "@/lib/legal";

const signUp = vi.hoisted(() => vi.fn());
const signInWithPassword = vi.hoisted(() => vi.fn());
const signInWithOAuth = vi.hoisted(() => vi.fn());
const resend = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { signUp, signInWithPassword, signInWithOAuth, resend } }),
}));

const VALID_CODE = "AURALENS-BETA-2026-7KQ4M9TX";
const fetchMock = vi.fn();

/** The invite check endpoint: 200 for VALID_CODE, otherwise the 400 problem. */
function inviteEndpoint(url: string, init?: RequestInit) {
  expect(url).toBe("/api/v1/invite-codes/validate");
  const { code } = JSON.parse(String(init?.body));
  if (code === VALID_CODE) return Promise.resolve(Response.json({ object: "invite_code_check", valid: true }));
  return Promise.resolve(
    Response.json(
      { code: "invalid_invite_code", status: 400, detail: "Der Einladungscode ist ungültig oder wurde bereits verwendet." },
      { status: 400, headers: { "Content-Type": "application/problem+json" } }
    )
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation(inviteEndpoint);
  // Confirmation required: Supabase returns the user but no session yet.
  signUp.mockResolvedValue({ data: { user: { id: "u1" }, session: null }, error: null });
  signInWithPassword.mockResolvedValue({ data: {}, error: null });
  signInWithOAuth.mockResolvedValue({ data: {}, error: null });
  resend.mockResolvedValue({ data: {}, error: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.cookie = "auralens-invite=; Path=/auth/callback; Max-Age=0";
});

async function openSignUp() {
  const user = userEvent.setup();
  render(<LoginPage />);
  await user.click(screen.getByRole("button", { name: "Noch kein Konto? Registrieren" }));
  return user;
}

async function fillSignUp(email: string, code = VALID_CODE) {
  const user = await openSignUp();
  await user.type(screen.getByLabelText("E-Mail"), email);
  await user.type(screen.getByLabelText("Passwort"), "geheim123");
  await user.type(screen.getByLabelText("Beta-Einladungscode"), code);
  for (const box of screen.getAllByRole("checkbox")) await user.click(box);
  return user;
}

describe("Registrierung", () => {
  it("verlangt Einladungscode, Beta-Hinweis und Beta-Bedingungen und speichert die Zustimmung", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Beta-Einladungscode")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Noch kein Konto? Registrieren" }));

    const code = screen.getByLabelText("Beta-Einladungscode");
    expect(code).toBeRequired();
    const [notice, terms] = screen.getAllByRole("checkbox");
    expect(notice).toBeRequired();
    expect(terms).toBeRequired();
    expect(
      screen.getByText(
        "Ich nehme an einer kostenlosen, nicht-kommerziellen geschlossenen Beta-Testphase teil. Mir ist bewusst, " +
          "dass zu Testzwecken hochgeladene Bilder an Anthropic (USA) übermittelt werden und keine urheberrechtlich " +
          "geschützten Bilder von Dritten oder Personen ohne Einwilligung hochgeladen werden dürfen."
      )
    ).toBeInTheDocument();
    expect(screen.getByText("Geschlossene Beta – Aktuell kostenlos für Tester mit Einladungscode.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Beta-Bedingungen" })).toHaveAttribute("href", "/beta-bedingungen");

    await user.type(screen.getByLabelText("E-Mail"), "tester@example.org");
    await user.type(screen.getByLabelText("Passwort"), "geheim123");
    await user.type(code, ` ${VALID_CODE.toLowerCase()} `);
    await user.click(terms);
    await user.click(screen.getByRole("button", { name: "Registrieren" }));
    // The browser blocks the form while a required box is unticked.
    expect(signUp).not.toHaveBeenCalled();

    await user.click(notice);
    await user.click(screen.getByRole("button", { name: "Registrieren" }));

    expect(signUp).toHaveBeenCalledWith({
      email: "tester@example.org",
      password: "geheim123",
      options: {
        data: {
          beta_terms_version: BETA_TERMS_VERSION,
          beta_terms_accepted_at: expect.any(String),
          beta_notice_version: BETA_NOTICE_VERSION,
          beta_notice_accepted_at: expect.any(String),
          invite_code: VALID_CODE,
        },
        emailRedirectTo: "http://localhost:3000/auth/callback?flow=signup",
      },
    });
  });

  it("zeigt einen klaren Fehler für einen ungültigen oder benutzten Code und registriert nicht", async () => {
    const user = await fillSignUp("tester@example.org", "AURALENS-BETA-2026-FALSCH99");
    await user.click(screen.getByRole("button", { name: "Registrieren" }));

    expect(await screen.findByText("Der Einladungscode ist ungültig oder wurde bereits verwendet.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(signUp).not.toHaveBeenCalled();
  });

  it("prüft offensichtlich falsch geformte Codes gar nicht erst beim Server", async () => {
    const user = await fillSignUp("tester@example.org", "abc");
    await user.click(screen.getByRole("button", { name: "Registrieren" }));

    expect(await screen.findByText(/Einladungscode ist ungültig/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(signUp).not.toHaveBeenCalled();
  });

  it("bittet nach der Registrierung, die E-Mail-Adresse zu bestätigen", async () => {
    const user = await fillSignUp("tester@example.org");
    await user.click(screen.getByRole("button", { name: "Registrieren" }));

    expect(await screen.findByText(/E-Mail an tester@example.org geschickt/)).toBeInTheDocument();
    expect(screen.getByText(/Erst danach werden die 20 Beta-Credits gutgeschrieben/)).toBeInTheDocument();
  });

  it("lehnt Wegwerf-Adressen ab, ohne Supabase zu fragen", async () => {
    const user = await fillSignUp("bot@mailinator.com");
    await user.click(screen.getByRole("button", { name: "Registrieren" }));

    expect(await screen.findByText(/Wegwerf-E-Mail-Adressen sind nicht erlaubt/)).toBeInTheDocument();
    expect(signUp).not.toHaveBeenCalled();
  });

  it("erklärt eine Ablehnung durch die Datenbank (z. B. Code gerade verbraucht)", async () => {
    signUp.mockResolvedValue({ data: { user: null, session: null }, error: { message: "Database error saving new user" } });
    const user = await fillSignUp("tester@example.org");
    await user.click(screen.getByRole("button", { name: "Registrieren" }));

    expect(await screen.findByText(/Registrierung abgelehnt: Der Einladungscode ist ungültig/)).toBeInTheDocument();
  });
});

describe("Registrierung mit Google", () => {
  it("bleibt gesperrt, bis Code und beide Zustimmungen vorliegen", async () => {
    const user = await openSignUp();
    const google = screen.getByRole("button", { name: "Mit Google registrieren" });
    expect(google).toBeDisabled();

    await user.type(screen.getByLabelText("Beta-Einladungscode"), VALID_CODE);
    const [notice, terms] = screen.getAllByRole("checkbox");
    await user.click(terms);
    expect(google).toBeDisabled();
    await user.click(notice);
    expect(google).toBeEnabled();
  });

  it("prüft den Code und gibt ihn samt Zustimmung per Cookie an den Rückweg mit", async () => {
    const written: string[] = [];
    const cookieSetter = vi.spyOn(document, "cookie", "set").mockImplementation((value: string) => {
      written.push(value);
    });
    const user = await fillSignUp("egal@example.org");
    await user.click(screen.getByRole("button", { name: "Mit Google registrieren" }));
    cookieSetter.mockRestore();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: "http://localhost:3000/auth/callback" },
    });
    const cookie = written.find((entry) => entry.startsWith("auralens-invite="));
    expect(cookie).toMatch(/; Path=\/auth\/callback; Max-Age=600; SameSite=Lax$/);
    const payload = JSON.parse(decodeURIComponent(cookie!.split(";")[0].slice("auralens-invite=".length)));
    expect(payload).toEqual({
      code: VALID_CODE,
      consent: {
        beta_terms_version: BETA_TERMS_VERSION,
        beta_terms_accepted_at: expect.any(String),
        beta_notice_version: BETA_NOTICE_VERSION,
        beta_notice_accepted_at: expect.any(String),
      },
    });
  });

  it("startet Google nicht mit einem ungültigen Code", async () => {
    const user = await fillSignUp("egal@example.org", "AURALENS-BETA-2026-FALSCH99");
    await user.click(screen.getByRole("button", { name: "Mit Google registrieren" }));

    expect(await screen.findByText(/Einladungscode ist ungültig/)).toBeInTheDocument();
    expect(signInWithOAuth).not.toHaveBeenCalled();
  });
});

describe("Anmeldung mit unbestätigter E-Mail", () => {
  it("erklärt den Grund und sendet die Bestätigung auf Wunsch erneut", async () => {
    signInWithPassword.mockResolvedValue({
      data: {},
      error: { message: "Email not confirmed", code: "email_not_confirmed" },
    });
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.type(screen.getByLabelText("E-Mail"), "tester@example.org");
    await user.type(screen.getByLabelText("Passwort"), "geheim123");
    await user.click(screen.getByRole("button", { name: "Anmelden" }));

    expect(await screen.findByText(/noch nicht bestätigt/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Bestätigungs-E-Mail erneut senden" }));

    expect(resend).toHaveBeenCalledWith({
      type: "signup",
      email: "tester@example.org",
      options: { emailRedirectTo: "http://localhost:3000/auth/callback?flow=signup" },
    });
    expect(await screen.findByText(/neue Bestätigungs-E-Mail/)).toBeInTheDocument();
  });
});
