import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SeriesResults } from "@/components/series/SeriesResults";
import { organizeSeries } from "@/lib/series-organize";
import { buildSeries, SAMPLE_SPECS } from "@/lib/__tests__/fixtures/series";

const { report, files } = buildSeries(SAMPLE_SPECS, [3, 1, 4, 2]);
const result = { report, files, imageCount: 4, organization: organizeSeries(report, files) };

/** Image numbers of all cards, in the order they are rendered. */
function renderedOrder() {
  return screen.getAllByRole("article").map((card) => card.getAttribute("aria-label"));
}

describe("SeriesResults", () => {
  it("zeigt die Bilder standardmäßig in der empfohlenen Dramaturgie", () => {
    render(<SeriesResults result={result} previewUrls={[]} />);
    expect(renderedOrder()).toEqual(["Bild 3", "Bild 1", "Bild 4", "Bild 2"]);
  });

  it("sortiert nach Auswahl um und kehrt die Reihenfolge um", async () => {
    const user = userEvent.setup();
    render(<SeriesResults result={result} previewUrls={[]} />);

    await user.selectOptions(screen.getByLabelText("Sortieren nach"), "consistency");
    expect(renderedOrder()).toEqual(["Bild 2", "Bild 1", "Bild 4", "Bild 3"]);

    await user.click(screen.getByRole("button", { name: /aufsteigend/ }));
    expect(renderedOrder()).toEqual(["Bild 3", "Bild 1", "Bild 4", "Bild 2"]);
  });

  it("gruppiert nach Kategorie mit Überschrift und Anzahl", async () => {
    const user = userEvent.setup();
    render(<SeriesResults result={result} previewUrls={[]} />);

    await user.selectOptions(screen.getByLabelText("Gruppieren nach"), "category");

    const headings = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual(["Reisen (2)", "Landschaften (1)", "Essen (1)"]);
  });

  it("zeigt Kategorie und Stock-Tauglichkeit auf jeder Bildkarte", () => {
    render(<SeriesResults result={result} previewUrls={[]} />);
    const card = screen.getByRole("article", { name: "Bild 2" });
    expect(within(card).getByText("Essen")).toBeInTheDocument();
    expect(within(card).getByText("zu klein für Stock")).toBeInTheDocument();
  });
});
