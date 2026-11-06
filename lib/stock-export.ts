import { STOCK_CATEGORIES, type StockCategory, type StockMetadata } from "@/lib/series-analysis-schema";

/*
 * Metadata files for the contributor portals that accept a CSV upload. Each
 * portal applies a row to the uploaded file with the same name, so a whole
 * series gets tagged in one step. Portals without a CSV import (Pexels,
 * Dreamstime, Alamy, 123RF, ...) read the metadata embedded in the file
 * instead - see lib/embedded-metadata.ts.
 */

export type StockCsvEntry = { filename: string; stock: StockMetadata };

export const CSV_PORTALS = ["adobe", "shutterstock", "freepik"] as const;
export type CsvPortal = (typeof CSV_PORTALS)[number];

/** Adobe Stock's numeric category IDs follow the order of STOCK_CATEGORIES (1 = animals ... 21 = travel). */
export function adobeCategoryId(category: StockMetadata["category"]): number {
  return STOCK_CATEGORIES.indexOf(category) + 1;
}

/**
 * Closest Shutterstock category for each Adobe Stock category. Shutterstock
 * has its own list and no "travel" or "lifestyle"; users can change it in
 * the portal before submitting.
 */
export const SHUTTERSTOCK_CATEGORIES: Record<StockCategory, string> = {
  animals: "Animals/Wildlife",
  architecture: "Buildings/Landmarks",
  business: "Business/Finance",
  drinks: "Food and Drink",
  environment: "Nature",
  states_of_mind: "Abstract",
  food: "Food and Drink",
  graphic_resources: "Backgrounds/Textures",
  hobbies_leisure: "Sports/Recreation",
  industry: "Industrial",
  landscapes: "Nature",
  lifestyle: "People",
  people: "People",
  plants_flowers: "Nature",
  culture_religion: "Religion",
  science: "Science",
  social_issues: "Miscellaneous",
  sports: "Sports/Recreation",
  technology: "Technology",
  transport: "Transportation",
  travel: "Parks/Outdoor",
};

/** RFC 4180 field: quote when needed, double embedded quotes. */
function csvField(value: string, delimiter: string): string {
  const needsQuotes = value.includes(delimiter) || /["\r\n]/.test(value);
  return needsQuotes ? `"${value.replace(/"/g, '""')}"` : value;
}

function toCsv(rows: string[][], delimiter = ","): string {
  return rows.map((row) => row.map((field) => csvField(field, delimiter)).join(delimiter)).join("\r\n") + "\r\n";
}

/** Adobe Stock contributor CSV: Filename, Title, Keywords, Category, Releases. */
export function toAdobeStockCsv(entries: StockCsvEntry[]): string {
  return toCsv([
    ["Filename", "Title", "Keywords", "Category", "Releases"],
    ...entries.map(({ filename, stock }) => [
      filename,
      stock.title,
      stock.keywords.join(", "),
      String(adobeCategoryId(stock.category)),
      "",
    ]),
  ]);
}

/**
 * Shutterstock contributor CSV. Description is Shutterstock's only text
 * field (max. 200 characters); Illustration / Mature Content / Editorial
 * stay empty so the contributor decides them in the portal.
 */
export function toShutterstockCsv(entries: StockCsvEntry[]): string {
  return toCsv([
    ["Filename", "Description", "Keywords", "Categories", "Illustration", "Mature Content", "Editorial"],
    ...entries.map(({ filename, stock }) => [
      filename,
      (stock.description || stock.title).slice(0, 200),
      stock.keywords.join(","),
      SHUTTERSTOCK_CATEGORIES[stock.category],
      "",
      "",
      "",
    ]),
  ]);
}

/**
 * Freepik (Magnific) contributor CSV: semicolon-separated, title max. 100
 * characters. Prompt and Model are only for AI-generated files and stay empty.
 */
export function toFreepikCsv(entries: StockCsvEntry[]): string {
  return toCsv(
    [
      ["File name", "Title", "Keywords", "Prompt", "Model"],
      ...entries.map(({ filename, stock }) => [filename, stock.title.slice(0, 100), stock.keywords.join(","), "", ""]),
    ],
    ";"
  );
}

export function toPortalCsv(portal: CsvPortal, entries: StockCsvEntry[]): string {
  switch (portal) {
    case "adobe":
      return toAdobeStockCsv(entries);
    case "shutterstock":
      return toShutterstockCsv(entries);
    case "freepik":
      return toFreepikCsv(entries);
  }
}

export const CSV_PORTAL_FILENAMES: Record<CsvPortal, string> = {
  adobe: "adobe-stock.csv",
  shutterstock: "shutterstock.csv",
  freepik: "freepik.csv",
};
