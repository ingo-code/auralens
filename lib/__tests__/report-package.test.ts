import { describe, expect, it } from "vitest";
import { buildSeries, SAMPLE_SPECS } from "@/lib/__tests__/fixtures/series";
import { VALID_STYLE_REPORT } from "@/lib/__tests__/fixtures/style-report";
import { getMessages } from "@/lib/i18n";
import { buildReportPackage, reportMarkdown } from "@/lib/report-package";
import { toFreepikCsv, toShutterstockCsv } from "@/lib/stock-export";
import { createZip, uniquePath } from "@/lib/zip";
import { matchOriginals } from "@/components/exports/EmbedMetadataPanel";

const t = getMessages("de");

describe("buildReportPackage", () => {
  it("enthält Bericht, Rohdaten, CSVs aller Portale und eine XMP-Datei pro Bild", () => {
    const { report, files } = buildSeries(SAMPLE_SPECS);
    const paths = buildReportPackage({ type: "series", report, files }, t).map((entry) => entry.path);

    expect(paths).toEqual(
      expect.arrayContaining([
        "pruefbericht.md",
        "report.json",
        "csv/adobe-stock.csv",
        "csv/shutterstock.csv",
        "csv/freepik.csv",
      ])
    );
    expect(paths.filter((path) => path.startsWith("xmp/"))).toHaveLength(files.length);
  });

  it("lässt die CSVs weg, wenn Dateinamen fehlen", () => {
    const paths = buildReportPackage({ type: "image", report: VALID_STYLE_REPORT, files: [] }, t).map((e) => e.path);
    expect(paths.some((path) => path.startsWith("csv/"))).toBe(false);
    expect(paths).toContain("xmp/image-1.xmp");
  });

  it("schreibt Scores und Korrektur-Rezepte in den lesbaren Bericht", () => {
    const { report, files } = buildSeries(SAMPLE_SPECS);
    const markdown = reportMarkdown({ type: "series", report, files }, t);
    expect(markdown).toContain(`${t.series.results.overall}: ${report.consistency.overallScore}/100`);
    expect(markdown).toContain(`${t.common.image(2)}`);
  });
});

describe("Portal-CSVs", () => {
  const entry = {
    filename: "dune.jpg",
    stock: { category: "travel" as const, title: "Dunes; at dusk", description: "Sand dunes at dusk.", keywords: ["dune", "sand"] },
  };

  it("Shutterstock: Beschreibung, kommagetrennte Keywords und gemappte Kategorie", () => {
    expect(toShutterstockCsv([entry]).split("\r\n")).toEqual([
      "Filename,Description,Keywords,Categories,Illustration,Mature Content,Editorial",
      'dune.jpg,Sand dunes at dusk.,"dune,sand",Parks/Outdoor,,,',
      "",
    ]);
  });

  it("Freepik: Semikolon als Trenner, Felder mit Semikolon werden maskiert", () => {
    expect(toFreepikCsv([entry]).split("\r\n")).toEqual([
      "File name;Title;Keywords;Prompt;Model",
      'dune.jpg;"Dunes; at dusk";dune,sand;;',
      "",
    ]);
  });
});

describe("createZip", () => {
  it("schreibt gültige Local-Header mit CRC-32", () => {
    const zip = createZip([{ path: "a.txt", data: "hello" }]);
    const view = new DataView(zip.buffer);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint32(14, true)).toBe(0x3610a686); // crc32("hello")
    expect(view.getUint32(zip.length - 22, true)).toBe(0x06054b50);
  });

  it("vergibt doppelte Dateinamen eindeutig", () => {
    const used = new Set<string>();
    expect([uniquePath("a.jpg", used), uniquePath("A.jpg", used), uniquePath("a.jpg", used)]).toEqual([
      "a.jpg",
      "A (2).jpg",
      "a (3).jpg",
    ]);
  });
});

describe("matchOriginals", () => {
  const stock = VALID_STYLE_REPORT.stock;
  const entries = [
    { label: "Bild 1", filename: "IMG_0001.png", stock },
    { label: "Bild 2", filename: "IMG_0002.jpg", stock },
  ];

  it("ordnet Originale über den Dateinamen ohne Endung zu", () => {
    const { matched, unmatched } = matchOriginals(
      [{ name: "img_0001.JPG" }, { name: "IMG_0002.jpeg" }, { name: "other.jpg" }],
      entries
    );
    expect(matched.map((m) => m.entry.label)).toEqual(["Bild 1", "Bild 2"]);
    expect(unmatched.map((f) => f.name)).toEqual(["other.jpg"]);
  });

  it("akzeptiert beim Einzelbild jede Datei", () => {
    const { matched } = matchOriginals([{ name: "anything.jpg" }], [{ label: "Dieses Bild", filename: "x.jpg", stock }]);
    expect(matched).toHaveLength(1);
  });
});
