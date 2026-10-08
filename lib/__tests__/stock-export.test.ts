import { describe, expect, it } from "vitest";
import { adobeCategoryId, toAdobeStockCsv } from "@/lib/stock-export";

describe("adobeCategoryId", () => {
  it("bildet die Kategorien auf Adobe Stocks numerische IDs ab", () => {
    expect(adobeCategoryId("animals")).toBe(1);
    expect(adobeCategoryId("landscapes")).toBe(11);
    expect(adobeCategoryId("travel")).toBe(21);
  });
});

describe("toAdobeStockCsv", () => {
  it("erzeugt Kopfzeile und eine Zeile pro Bild, mit korrekt maskierten Feldern", () => {
    const csv = toAdobeStockCsv([
      {
        filename: "beach.jpg",
        stock: {
          category: "travel",
          title: 'Sunset at the "golden" beach, Portugal',
          description: "unused",
          keywords: ["beach", "sunset"],
        },
      },
    ]);

    expect(csv.split("\r\n")).toEqual([
      "Filename,Title,Keywords,Category,Releases",
      'beach.jpg,"Sunset at the ""golden"" beach, Portugal","beach, sunset",21,',
      "",
    ]);
  });
});
