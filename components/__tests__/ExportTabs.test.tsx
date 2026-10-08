import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExportTabs } from "@/components/exports/ExportTabs";
import { SAMPLE_PROMPTS, VALID_STYLE_REPORT } from "@/lib/__tests__/fixtures/style-report";

const COLORS = [
  { hex: "#112233", name: "Tiefes Blau", role: "primary" },
  { hex: "#FF8800", name: "Bernstein", role: "accent" },
];

function renderTabs(filename?: string) {
  return render(
    <ExportTabs
      prompts={SAMPLE_PROMPTS}
      colors={COLORS}
      stock={[{ label: "Bild 1", filename, stock: VALID_STYLE_REPORT.stock }]}
    />
  );
}

describe("ExportTabs", () => {
  it("zeigt standardmäßig den Midjourney-Prompt und wechselt zwischen Plattformen", async () => {
    const user = userEvent.setup();
    renderTabs();

    expect(screen.getByRole("tab", { name: "Prompts" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText(SAMPLE_PROMPTS.midjourney)).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "FLUX.2 / FLUX 3" }));
    expect(screen.getByText(SAMPLE_PROMPTS.flux.positive)).toBeInTheDocument();
    expect(screen.getByText(SAMPLE_PROMPTS.flux.negative)).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "Firefly Image 5" }));
    expect(screen.getByText(SAMPLE_PROMPTS.firefly)).toBeInTheDocument();
  });

  it("kopiert den Prompt mit einem Klick in die Zwischenablage", async () => {
    const user = userEvent.setup();
    renderTabs();
    const writeText = vi.spyOn(navigator.clipboard, "writeText");

    await user.click(screen.getByRole("radio", { name: "ChatGPT Images 2.5" }));
    await user.click(screen.getByRole("button", { name: "1-Click-Copy" }));

    expect(writeText).toHaveBeenCalledWith(SAMPLE_PROMPTS.dalle3);
  });

  it("erzeugt Tailwind-Tokens und schaltet zwischen v4 und v3 um", async () => {
    const user = userEvent.setup();
    renderTabs();

    await user.click(screen.getByRole("tab", { name: "Design-Token" }));
    expect(screen.getByText(/--color-brand-primary: #112233/)).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: /Tailwind v3/ }));
    expect(screen.getByText(/theme: \{/)).toBeInTheDocument();
  });

  it("navigiert per Pfeiltaste zwischen den Tabs", async () => {
    const user = userEvent.setup();
    renderTabs();

    await user.click(screen.getByRole("tab", { name: "Prompts" }));
    await user.keyboard("{ArrowLeft}");

    expect(screen.getByRole("tab", { name: "Stock-SEO" })).toHaveFocus();
    expect(screen.getByRole("tab", { name: "Stock-SEO" })).toHaveAttribute("aria-selected", "true");
  });

  it("bietet den Adobe-Stock-CSV-Export nur an, wenn Dateinamen bekannt sind", async () => {
    const user = userEvent.setup();
    const { unmount } = renderTabs();
    await user.click(screen.getByRole("tab", { name: "Stock-SEO" }));
    expect(screen.getByText(VALID_STYLE_REPORT.stock.title)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "25 Keywords" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Adobe-Stock-CSV" })).not.toBeInTheDocument();
    unmount();

    renderTabs("bild1.jpg");
    await user.click(screen.getByRole("tab", { name: "Stock-SEO" }));
    expect(screen.getByRole("button", { name: "Adobe-Stock-CSV" })).toBeInTheDocument();
  });
});
