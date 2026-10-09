import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SeriesPage from "@/app/serie/page";
import type { AnalysisResource } from "@/lib/api/resources";
import { _resetCreditsStore } from "@/lib/credits-store";
import { buildSeries, SAMPLE_SPECS } from "@/lib/__tests__/fixtures/series";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: "user-1" } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
  }),
}));

const { report, files } = buildSeries(SAMPLE_SPECS.slice(0, 3), [1, 2, 3]);

function job(status: AnalysisResource["status"], completedSteps: AnalysisResource["progress"]["completedSteps"] = []): AnalysisResource {
  return {
    object: "analysis",
    id: "job-1",
    type: "series",
    status,
    imageCount: 3,
    credits: 3,
    locale: "de",
    files,
    createdAt: new Date().toISOString(),
    startedAt: status === "queued" ? null : new Date().toISOString(),
    completedAt: status === "completed" ? new Date().toISOString() : null,
    error: null,
    progress: { steps: ["consistency", "market", "prompts"], completedSteps },
    ...(status === "completed" ? { report } : {}),
  };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const usage = (balance: number) => json({ object: "usage", credits: { balance, costPerImage: 1 }, limits: {} });
const problem = (status: number, code: string, detail: string) =>
  new Response(JSON.stringify({ type: `urn:auralens:error:${code}`, title: "x", status, code, detail, requestId: "r" }), {
    status,
    headers: { "Content-Type": "application/problem+json" },
  });

type Route = (url: string, init?: RequestInit) => Response | undefined;
let fetchMock: ReturnType<typeof vi.fn>;

/** Signed-URL upload step of startAnalysis: hands out slots and accepts the PUTs. */
function uploadStep(url: string, init?: RequestInit): Response | undefined {
  if (url === "/api/v1/uploads" && init?.method === "POST") {
    const { files } = JSON.parse(init.body as string) as { files: { name: string; type: string }[] };
    const uploads = files.map((file, i) => ({
      index: i + 1,
      name: file.name,
      path: `u/b/${i + 1}-${file.name}`,
      uploadUrl: `https://storage.test/${i + 1}`,
      token: "t",
      contentType: file.type,
    }));
    return json({ object: "upload_batch", expiresAt: "x", uploads }, 201);
  }
  if (url.startsWith("https://storage.test/")) return json({ Key: url });
}

function routeFetch(handler: Route) {
  fetchMock = vi.fn(
    async (url: string, init?: RequestInit) =>
      uploadStep(url, init) ?? handler(url, init) ?? new Response("not mocked", { status: 500 })
  );
  vi.stubGlobal("fetch", fetchMock);
}

const photo = (name: string) => new File([new Uint8Array(100)], name, { type: "image/jpeg" });

async function selectThreeImages(user: ReturnType<typeof userEvent.setup>) {
  await user.upload(screen.getByTestId("series-uploader-input"), [photo("a.jpg"), photo("b.jpg"), photo("c.jpg")]);
}

beforeEach(() => {
  _resetCreditsStore();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  window.history.replaceState(null, "", "/serie");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Serien-Seite mit API v1", () => {
  it("startet die Analyse asynchron, zeigt echten Fortschritt und danach den Report", async () => {
    let balance = 20;
    let polls = 0;
    routeFetch((url, init) => {
      if (url === "/api/v1/usage") return usage(balance);
      if (url === "/api/v1/analyses" && init?.method === "POST") {
        balance -= 3;
        return json(job("queued"), 202);
      }
      if (url === "/api/v1/analyses/job-1") {
        polls += 1;
        return json(polls === 1 ? job("running", ["prompts"]) : job("completed"));
      }
    });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<SeriesPage />);

    expect(await screen.findByTestId("credit-badge")).toHaveTextContent("20 Credits");
    await selectThreeImages(user);
    expect(screen.getByText("kostet 3 Credits")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "3 Bilder analysieren" }));

    // First poll: the prompts part is done, the other two still run in parallel.
    const promptsStep = await screen.findByText("Stil-Spezifikation & Prompts für 4 Bild-KIs");
    await vi.waitFor(() => expect(promptsStep.closest("li")).toHaveAttribute("data-state", "done"));
    expect(screen.getByText("Markt-Fit, Master-Palette & Stock-SEO").closest("li")).toHaveAttribute("data-state", "active");
    expect(window.location.search).toBe("?analysis=job-1");

    const post = fetchMock.mock.calls.find(([url, init]) => url === "/api/v1/analyses" && init?.method === "POST")!;
    expect((post[1].headers as Record<string, string>)["Idempotency-Key"]).toMatch(/[0-9a-f-]{36}/);
    expect(JSON.parse(post[1].body as string).uploads).toHaveLength(3);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).startsWith("https://storage.test/"))).toHaveLength(3);

    await act(() => vi.advanceTimersByTimeAsync(2600));

    expect(await screen.findByRole("heading", { name: "Test" })).toBeInTheDocument();
    expect(screen.getByText(/In deiner Historie gespeichert/)).toBeInTheDocument();
    await vi.waitFor(() => expect(screen.getByTestId("credit-badge")).toHaveTextContent("17 Credits"));
  });

  it("zeigt bei 402 den Hinweis „Beta-Guthaben aufgebraucht“ statt einer Analyse", async () => {
    routeFetch((url, init) => {
      if (url === "/api/v1/usage") return usage(1);
      if (url === "/api/v1/analyses" && init?.method === "POST") {
        return problem(402, "insufficient_credits", "Nicht genug Credits: benötigt 3, verfügbar 1.");
      }
    });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<SeriesPage />);

    await screen.findByTestId("credit-badge");
    await selectThreeImages(user);
    await user.click(screen.getByRole("button", { name: "3 Bilder analysieren" }));

    const dialog = await screen.findByRole("dialog", { name: "Beta-Guthaben aufgebraucht" });
    expect(within(dialog).getByText("Nicht genug Credits: benötigt 3, verfügbar 1.")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Schließen" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // The selection is kept, nothing was started.
    expect(screen.getByRole("button", { name: "3 Bilder analysieren" })).toBeInTheDocument();
  });

  it("zeigt andere API-Fehler als verständliche Meldung", async () => {
    routeFetch((url, init) => {
      if (url === "/api/v1/usage") return usage(20);
      if (url === "/api/v1/analyses" && init?.method === "POST") {
        return problem(429, "too_many_active_analyses", "");
      }
    });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<SeriesPage />);

    await screen.findByTestId("credit-badge");
    await selectThreeImages(user);
    await user.click(screen.getByRole("button", { name: "3 Bilder analysieren" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Es laufen bereits zu viele Analysen");
  });

  it("setzt eine laufende Analyse aus der URL nach einem Neuladen fort", async () => {
    window.history.replaceState(null, "", "/serie?analysis=job-1");
    routeFetch((url) => {
      if (url === "/api/v1/usage") return usage(17);
      if (url === "/api/v1/analyses/job-1") return json(job("completed"));
    });
    render(<SeriesPage />);

    expect(await screen.findByRole("heading", { name: "Test" })).toBeInTheDocument();
  });

  it("bittet abgemeldete Besucher um Anmeldung statt einen Upload anzubieten", async () => {
    routeFetch((url) => (url === "/api/v1/usage" ? problem(401, "unauthorized", "Nicht authentifiziert.") : undefined));
    render(<SeriesPage />);

    expect(await screen.findByText("Melde dich an, um Analysen zu starten")).toBeInTheDocument();
    expect(screen.queryByTestId("series-uploader-input")).not.toBeInTheDocument();
  });
});
