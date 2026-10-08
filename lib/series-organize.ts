import { z } from "zod";
import { getMessages, type Messages } from "@/lib/i18n";
import { DEFAULT_LOCALE, INTL_LOCALES, type Locale } from "@/lib/i18n/config";
import {
  MIN_STOCK_MEGAPIXELS,
  SHOT_TYPES,
  type Orientation,
  type SeriesAnalysis,
  type SeriesImageAnalysis,
  type SeriesImageFile,
} from "@/lib/series-analysis-schema";

/*
 * Pure, deterministic sorting/grouping of an analyzed series. Shared by the
 * API (GET /api/v1/analyses/{id}, POST /api/series/organize) and the UI so
 * both always produce identical results. Never calls Claude.
 */

export const SORT_KEYS = ["upload", "story", "consistency", "category", "shot", "resolution"] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export const GROUP_KEYS = ["none", "category", "role", "shot", "orientation", "stock_ready"] as const;
export type GroupKey = (typeof GROUP_KEYS)[number];

export const SORT_ORDERS = ["asc", "desc"] as const;
export type SortOrder = (typeof SORT_ORDERS)[number];

export const OrganizeOptionsSchema = z.object({
  sort: z.enum(SORT_KEYS).default("upload"),
  order: z.enum(SORT_ORDERS).default("asc"),
  group: z.enum(GROUP_KEYS).default("none"),
});
export type OrganizeOptions = z.infer<typeof OrganizeOptionsSchema>;

export type ImageGroup = {
  /** Stable machine key, e.g. "landscapes" or "portrait". */
  key: string;
  /** Display label in the requested locale. */
  label: string;
  /** 1-based image indices in sort order. */
  indices: number[];
};

export type SeriesOrganization = OrganizeOptions & {
  /** All 1-based image indices in sort order. */
  sortedIndices: number[];
  /** Groups in order of their first image in the sorted list. */
  groups: ImageGroup[];
};

type Item = { image: SeriesImageAnalysis; file: SeriesImageFile; storyPosition: number };

export function getOrientation(width: number, height: number): Orientation {
  const ratio = width / height;
  if (ratio > 1.05) return "landscape";
  if (ratio < 1 / 1.05) return "portrait";
  return "square";
}

/** Measures what a stock upload needs to know about a file - no AI involved. */
export function describeImageFile(index: number, name: string, width: number, height: number): SeriesImageFile {
  const megapixels = Math.round((width * height) / 100_000) / 10;
  return {
    index,
    name,
    width,
    height,
    megapixels,
    orientation: getOrientation(width, height),
    stockResolutionOk: megapixels >= MIN_STOCK_MEGAPIXELS,
  };
}

// Ascending comparators; "desc" reverses them. Ties always fall back to the
// upload order so results are stable and reproducible.
function buildComparators(t: Messages, locale: Locale): Record<SortKey, (a: Item, b: Item) => number> {
  const categoryLabel = (item: Item) => t.labels.categories[item.image.stock.category];
  return {
    upload: () => 0,
    story: (a, b) => a.storyPosition - b.storyPosition,
    consistency: (a, b) => a.image.consistencyScore - b.image.consistencyScore,
    category: (a, b) => categoryLabel(a).localeCompare(categoryLabel(b), INTL_LOCALES[locale]),
    shot: (a, b) => SHOT_TYPES.indexOf(a.image.shotType) - SHOT_TYPES.indexOf(b.image.shotType),
    resolution: (a, b) => a.file.megapixels - b.file.megapixels,
  };
}

function buildGroupers(t: Messages): Record<Exclude<GroupKey, "none">, (item: Item) => { key: string; label: string }> {
  return {
    category: (item) => ({ key: item.image.stock.category, label: t.labels.categories[item.image.stock.category] }),
    role: (item) => ({ key: item.image.narrativeRole, label: t.labels.roles[item.image.narrativeRole] }),
    shot: (item) => ({ key: item.image.shotType, label: t.labels.shots[item.image.shotType] }),
    orientation: (item) => ({ key: item.file.orientation, label: t.labels.orientations[item.file.orientation] }),
    stock_ready: (item) =>
      item.file.stockResolutionOk
        ? { key: "ok", label: t.labels.stockReady(MIN_STOCK_MEGAPIXELS) }
        : { key: "too_small", label: t.labels.stockTooSmall(MIN_STOCK_MEGAPIXELS) },
  };
}

export class OrganizeError extends Error {}

/**
 * Sorts and groups the images of an analyzed series; group labels (and the
 * category sort) follow `locale`. Throws OrganizeError if report and file
 * list don't describe the same images.
 */
export function organizeSeries(
  report: SeriesAnalysis,
  files: SeriesImageFile[],
  options: Partial<OrganizeOptions> = {},
  locale: Locale = DEFAULT_LOCALE
): SeriesOrganization {
  const { sort, order, group } = OrganizeOptionsSchema.parse(options);
  const t = getMessages(locale);

  const filesByIndex = new Map(files.map((file) => [file.index, file]));
  const storyOrder = report.narrative.suggestedOrder;

  const items: Item[] = report.images.map((image) => {
    const file = filesByIndex.get(image.index);
    if (!file) throw new OrganizeError(t.errors.missingFileInfo(image.index));
    const storyPosition = storyOrder.indexOf(image.index);
    return { image, file, storyPosition: storyPosition === -1 ? Infinity : storyPosition };
  });
  if (files.length !== items.length) {
    throw new OrganizeError(t.errors.filesMismatch);
  }

  const direction = order === "desc" ? -1 : 1;
  const compare = buildComparators(t, locale)[sort];
  const sorted = [...items].sort((a, b) => direction * compare(a, b) || a.image.index - b.image.index);
  const sortedIndices = sorted.map((item) => item.image.index);

  if (group === "none") {
    return { sort, order, group, sortedIndices, groups: [{ key: "all", label: t.labels.allImages, indices: sortedIndices }] };
  }

  const groupBy = buildGroupers(t)[group];
  const groups = new Map<string, ImageGroup>();
  for (const item of sorted) {
    const { key, label } = groupBy(item);
    const existing = groups.get(key);
    if (existing) existing.indices.push(item.image.index);
    else groups.set(key, { key, label, indices: [item.image.index] });
  }

  return { sort, order, group, sortedIndices, groups: [...groups.values()] };
}
