import { describe, expect, it } from "vitest";
import { buildSeries, SAMPLE_SPECS } from "@/lib/__tests__/fixtures/series";
import { getMessages } from "@/lib/i18n";
import { linearToSrgb } from "@/lib/measure/color";
import { measurePixels, type ImageMeasurements } from "@/lib/measure/image-metrics";
import { measuredFactsPrompt } from "@/lib/measure/prompt-facts";
import { reportMarkdown } from "@/lib/report-package";

const W = 128;
const H = 96;

function measured({ cast = 0 } = {}): ImageMeasurements {
  const data = new Uint8Array(W * H * 3);
  for (let i = 0; i < W * H; i++) {
    const x = i % W;
    const v = linearToSrgb(x < W / 2 ? 0.18 : (Math.floor(x / 4) + Math.floor(i / W / 4)) % 2 ? 0.3 : 0.06);
    data[i * 3] = Math.min(255, v + cast);
    data[i * 3 + 1] = v;
    data[i * 3 + 2] = Math.max(0, v - cast);
  }
  return measurePixels(data, W, H);
}

describe("measuredFactsPrompt", () => {
  it("gibt Claude die gemessenen Werte und Korrekturen als verbindliche Fakten", () => {
    const prompt = measuredFactsPrompt([measured(), measured({ cast: 14 }), measured()])!;
    expect(prompt).toContain("GEMESSENE PIXELWERTE");
    expect(prompt).toMatch(/Bild 2: .*Gemessene Korrektur zur Serie: .*Temperatur −\d+ K/);
    expect(prompt).toContain("Bild 1: ");
    expect(prompt).toContain("Keine messbare Farb-/Belichtungsabweichung");
    expect(prompt).toContain("erfinde keine eigenen Zahlen");
  });

  it("entfällt, wenn ein Bild nicht gemessen wurde", () => {
    expect(measuredFactsPrompt([measured(), undefined])).toBeNull();
  });
});

describe("Prüfbericht mit Messwerten", () => {
  it("enthält die Messtabelle mit Referenz und Korrektur", () => {
    const { report, files } = buildSeries(SAMPLE_SPECS);
    const measuredFiles = files.map((file, i) => ({ ...file, measurements: measured({ cast: i === 1 ? 14 : 0 }) }));
    const markdown = reportMarkdown({ type: "series", report, files: measuredFiles }, getMessages("de"));
    expect(markdown).toContain("## Gemessene Werte");
    expect(markdown).toContain("| Serie (Median) |");
    expect(markdown).toMatch(/\| Bild 2 \| \d+ \|.*Temperatur −[\d.]+ K/);
  });

  it("lässt den Abschnitt bei alten Analysen ohne Messung weg", () => {
    const { report, files } = buildSeries(SAMPLE_SPECS);
    expect(reportMarkdown({ type: "series", report, files }, getMessages("de"))).not.toContain("Gemessene Werte");
  });
});
