import { STOCK_CATEGORIES, type StockMetadata } from "@/lib/series-analysis-schema";

/*
 * Adobe Stock contributor CSV (Filename, Title, Keywords, Category, Releases).
 * Uploading it in the contributor portal applies the metadata to files with
 * matching names, so a whole series gets tagged in one step.
 */

/** Adobe Stock's numeric category IDs follow the order of STOCK_CATEGORIES (1 = animals ... 21 = travel). */
export function adobeCategoryId(category: StockMetadata["category"]): number {
  return STOCK_CATEGORIES.indexOf(category) + 1;
}

/** RFC 4180 field: quote when needed, double embedded quotes. */
function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toAdobeStockCsv(entries: { filename: string; stock: StockMetadata }[]): string {
  const header = ["Filename", "Title", "Keywords", "Category", "Releases"];
  const rows = entries.map(({ filename, stock }) => [
    filename,
    stock.title,
    stock.keywords.join(", "),
    String(adobeCategoryId(stock.category)),
    "",
  ]);
  return [header, ...rows].map((row) => row.map(csvField).join(",")).join("\r\n") + "\r\n";
}
