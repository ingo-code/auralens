import { describe, expect, it } from "vitest";
import { describeImageFile, getOrientation, OrganizeError, organizeSeries } from "@/lib/series-organize";
import { buildSeries, SAMPLE_SPECS } from "./fixtures/series";

const { report, files } = buildSeries(SAMPLE_SPECS, [3, 1, 4, 2]);

describe("describeImageFile", () => {
  it("berechnet Megapixel, Format und Stock-Tauglichkeit aus den Pixelmaßen", () => {
    expect(describeImageFile(1, "a.jpg", 6000, 4000)).toEqual({
      index: 1,
      name: "a.jpg",
      width: 6000,
      height: 4000,
      megapixels: 24,
      orientation: "landscape",
      stockResolutionOk: true,
    });
    expect(describeImageFile(2, "b.jpg", 1200, 1600)).toMatchObject({
      megapixels: 1.9,
      orientation: "portrait",
      stockResolutionOk: false,
    });
  });

  it("wertet exakt 4 MP als stock-tauglich", () => {
    expect(describeImageFile(1, "a.jpg", 2000, 2000).stockResolutionOk).toBe(true);
  });

  it("behandelt fast quadratische Bilder als quadratisch", () => {
    expect(getOrientation(1020, 1000)).toBe("square");
    expect(getOrientation(1100, 1000)).toBe("landscape");
  });
});

describe("organizeSeries – Sortierung", () => {
  const sorted = (options: Parameters<typeof organizeSeries>[2]) =>
    organizeSeries(report, files, options).sortedIndices;

  it("nutzt ohne Optionen die Upload-Reihenfolge", () => {
    expect(organizeSeries(report, files)).toMatchObject({ sort: "upload", order: "asc", group: "none" });
    expect(sorted({})).toEqual([1, 2, 3, 4]);
  });

  it("sortiert nach der empfohlenen Dramaturgie", () => {
    expect(sorted({ sort: "story" })).toEqual([3, 1, 4, 2]);
  });

  it("sortiert nach Konsistenz-Score, bei Gleichstand stabil nach Upload-Reihenfolge", () => {
    expect(sorted({ sort: "consistency" })).toEqual([2, 1, 4, 3]);
    // Desc reverses the scores, but ties (1 and 4 both 80) keep upload order.
    expect(sorted({ sort: "consistency", order: "desc" })).toEqual([3, 1, 4, 2]);
  });

  it("sortiert nach deutschem Kategorienamen", () => {
    // Essen < Landschaften < Reisen
    expect(sorted({ sort: "category" })).toEqual([2, 4, 1, 3]);
  });

  it("sortiert nach Einstellungsgröße von weit nach nah", () => {
    expect(sorted({ sort: "shot" })).toEqual([1, 3, 2, 4]);
  });

  it("sortiert nach Auflösung", () => {
    expect(sorted({ sort: "resolution", order: "desc" })).toEqual([1, 4, 3, 2]);
  });
});

describe("organizeSeries – Gruppierung", () => {
  it("liefert ohne Gruppierung eine einzige Gruppe mit allen Bildern", () => {
    expect(organizeSeries(report, files).groups).toEqual([
      { key: "all", label: "Alle Bilder", indices: [1, 2, 3, 4] },
    ]);
  });

  it("gruppiert nach Kategorie, Gruppen in Reihenfolge ihres ersten Bildes", () => {
    expect(organizeSeries(report, files, { group: "category", sort: "consistency", order: "desc" }).groups).toEqual([
      { key: "travel", label: "Reisen", indices: [3, 1] },
      { key: "landscapes", label: "Landschaften", indices: [4] },
      { key: "food", label: "Essen", indices: [2] },
    ]);
  });

  it("gruppiert nach Format und Stock-Tauglichkeit anhand der Dateidaten", () => {
    expect(organizeSeries(report, files, { group: "orientation" }).groups.map((g) => [g.key, g.indices])).toEqual([
      ["landscape", [1, 4]],
      ["portrait", [2]],
      ["square", [3]],
    ]);
    expect(organizeSeries(report, files, { group: "stock_ready" }).groups).toEqual([
      { key: "ok", label: "Stock-tauglich (≥ 4 MP)", indices: [1, 3, 4] },
      { key: "too_small", label: "Zu klein für Stock (< 4 MP)", indices: [2] },
    ]);
  });

  it("gruppiert nach Rolle in der Serie mit deutschen Bezeichnungen", () => {
    expect(organizeSeries(report, files, { group: "role", sort: "story" }).groups.map((g) => g.label)).toEqual([
      "Hero-Shot",
      "Einstiegsbild",
      "Abschluss",
      "Detailaufnahme",
    ]);
  });
});

describe("organizeSeries – Fehlerfälle", () => {
  it("lehnt Dateiangaben ab, die nicht zum Report passen", () => {
    expect(() => organizeSeries(report, files.slice(0, 3))).toThrow(OrganizeError);
    expect(() => organizeSeries(report, [...files, { ...files[0], index: 5 }])).toThrow(OrganizeError);
  });

  it("lehnt unbekannte Sortier- oder Gruppierschlüssel ab", () => {
    // @ts-expect-error - invalid on purpose, as an untyped API client could send it
    expect(() => organizeSeries(report, files, { sort: "beliebt" })).toThrow();
  });
});
