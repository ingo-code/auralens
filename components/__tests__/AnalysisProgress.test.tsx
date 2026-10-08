import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AnalysisProgress } from "@/components/analysis/AnalysisProgress";
import type { AnalysisResource } from "@/lib/api/resources";

function series(status: AnalysisResource["status"], completedSteps: AnalysisResource["progress"]["completedSteps"]): AnalysisResource {
  return {
    object: "analysis",
    id: "job-1",
    type: "series",
    status,
    imageCount: 3,
    credits: 3,
    locale: "de",
    files: [],
    createdAt: new Date().toISOString(),
    startedAt: status === "queued" ? null : new Date().toISOString(),
    completedAt: null,
    error: null,
    progress: { steps: ["consistency", "market", "prompts"], completedSteps },
  };
}

/** Step label -> state, in display order. */
function stepStates() {
  return Object.fromEntries(
    screen.getAllByRole("listitem")
      .filter((item) => item.dataset.state)
      .map((item) => [item.textContent?.replace(/^[✓·]/, "").replace(/parallel$/, "").trim(), item.dataset.state])
  );
}

describe("AnalysisProgress", () => {
  it("zeigt während des Uploads nur den ersten Schritt aktiv", () => {
    render(<AnalysisProgress analysis={null} imageCount={3} />);

    expect(stepStates()).toMatchObject({
      "Bilder hochladen & normalisieren": "active",
      "Analyse auf dem Server starten": "pending",
      "Konsistenz-Prüfung: Farbe, Licht, Bearbeitung": "pending",
    });
    expect(screen.getByText(/kostet 3 Credits/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Hintergrund/ })).not.toBeInTheDocument();
  });

  it("hakt parallele Teilschritte einzeln ab, sobald der Server sie meldet", () => {
    render(<AnalysisProgress analysis={series("running", ["prompts"])} imageCount={3} onBackground={() => {}} />);

    expect(stepStates()).toEqual({
      "Bilder hochladen & normalisieren": "done",
      "Analyse auf dem Server starten": "done",
      "Konsistenz-Prüfung: Farbe, Licht, Bearbeitung": "active",
      "Markt-Fit, Master-Palette & Stock-SEO": "active",
      "Stil-Spezifikation & Prompts für 4 Bild-KIs": "done",
      "Report zusammenführen & speichern": "pending",
    });
    const percent = Number(screen.getByRole("progressbar").getAttribute("aria-valuenow"));
    expect(percent).toBeGreaterThanOrEqual(15 + 80 / 3 - 1);
    expect(percent).toBeLessThan(99);
    expect(screen.getByRole("button", { name: "Im Hintergrund weiterlaufen lassen" })).toBeInTheDocument();
  });

  it("zeigt das Zusammenführen, wenn alle Teile fertig sind", () => {
    render(<AnalysisProgress analysis={series("running", ["prompts", "market", "consistency"])} imageCount={3} />);

    expect(stepStates()["Report zusammenführen & speichern"]).toBe("active");
  });

  it("zeigt für Einzelbilder einen einzigen Analyse-Schritt", () => {
    render(<AnalysisProgress analysis={null} imageCount={1} />);

    expect(screen.getByText("Stil, Farben, Prompts & Stock-SEO")).toBeInTheDocument();
    expect(screen.queryByText(/Konsistenz-Prüfung/)).not.toBeInTheDocument();
    expect(screen.getByText(/kostet 1 Credit$/)).toBeInTheDocument();
  });
});
