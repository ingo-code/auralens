import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { SeriesResults } from "@/components/series/SeriesResults";
import { ExportTabs } from "@/components/exports/ExportTabs";
import { LocaleProvider } from "@/lib/i18n/client";
import { organizeSeries } from "@/lib/series-organize";
import { buildSeries, SAMPLE_SPECS } from "@/lib/__tests__/fixtures/series";
import { SAMPLE_PROMPTS, VALID_STYLE_REPORT } from "@/lib/__tests__/fixtures/style-report";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

const { report, files } = buildSeries(SAMPLE_SPECS, [3, 1, 4, 2]);
const result = { report, files, imageCount: 4, organization: organizeSeries(report, files) };

describe("LanguageSwitcher", () => {
  afterEach(() => {
    document.cookie = "auralens-locale=; path=/; max-age=0";
    refresh.mockClear();
  });

  it("zeigt die aktive Sprache und speichert die neue Wahl im Cookie", async () => {
    const user = userEvent.setup();
    render(
      <LocaleProvider locale="de">
        <LanguageSwitcher />
      </LocaleProvider>
    );

    expect(screen.getByRole("radio", { name: "Deutsch" })).toHaveAttribute("aria-checked", "true");

    await user.click(screen.getByRole("radio", { name: "English" }));

    expect(document.cookie).toContain("auralens-locale=en");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("lädt nicht neu, wenn die aktive Sprache erneut gewählt wird", async () => {
    const user = userEvent.setup();
    render(
      <LocaleProvider locale="en">
        <LanguageSwitcher />
      </LocaleProvider>
    );

    await user.click(screen.getByRole("radio", { name: "English" }));
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("Englische Oberfläche", () => {
  it("beschriftet Serien-Ergebnisse, Labels und Gruppen auf Englisch", async () => {
    const user = userEvent.setup();
    render(
      <LocaleProvider locale="en">
        <SeriesResults result={result} previewUrls={[]} />
      </LocaleProvider>
    );

    expect(screen.getByText("Consistency")).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Image 3" })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Group by"), "category");
    const headings = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual(["Travel (2)", "Landscapes (1)", "Food (1)"]);
  });

  it("übersetzt die Export-Tabs", async () => {
    const user = userEvent.setup();
    render(
      <LocaleProvider locale="en">
        <ExportTabs prompts={SAMPLE_PROMPTS} colors={VALID_STYLE_REPORT.colorPalette} stock={[{ label: "Image 1", stock: VALID_STYLE_REPORT.stock }]} />
      </LocaleProvider>
    );

    expect(screen.getByRole("button", { name: "1-click copy" })).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Stock SEO" }));
    expect(screen.getByText(/Adobe Stock weights the first 10 keywords/)).toBeInTheDocument();
  });
});
