import type { Messages } from "@/lib/i18n";
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_FILE_SIZE } from "@/lib/image-validation";
import { MAX_SERIES_IMAGES, MIN_SERIES_IMAGES } from "@/lib/series-analysis-schema";

const MAX_TOTAL_SIZE = 50 * 1024 * 1024;

/**
 * Checks a selection the same way the API does, so users get instant
 * feedback instead of waiting for a rejected upload. Returns an error
 * message or null.
 */
export function validateSeriesSelection(files: File[], t: Messages): string | null {
  if (files.length < MIN_SERIES_IMAGES) return t.errors.selectAtLeast(MIN_SERIES_IMAGES);
  if (files.length > MAX_SERIES_IMAGES) return t.errors.selectAtMost(MAX_SERIES_IMAGES);

  for (const [i, file] of files.entries()) {
    if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
      return t.errors.fileUnsupported(i + 1, file.name);
    }
    if (file.size > MAX_IMAGE_FILE_SIZE) return t.errors.fileOver10mb(i + 1, file.name);
  }

  const total = files.reduce((sum, file) => sum + file.size, 0);
  if (total > MAX_TOTAL_SIZE) return t.errors.selectionOver50mb;

  return null;
}
