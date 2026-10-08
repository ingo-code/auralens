import type { Messages } from "@/lib/i18n";

export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

export const MAX_IMAGE_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export type ImageValidationError = {
  status: 400 | 413;
  message: string;
};

function isAllowedType(type: string): type is AllowedImageType {
  return (ALLOWED_IMAGE_TYPES as readonly string[]).includes(type);
}

/**
 * Checks type and size of an uploaded image. `label` prefixes the message
 * so multi-image uploads can say which file was rejected.
 */
export function validateImageFile(file: File, t: Messages, label?: string): ImageValidationError | null {
  const prefix = label ? `${label}: ` : "";

  if (!isAllowedType(file.type)) {
    return { status: 400, message: `${prefix}${t.errors.unsupportedType(file.type)}` };
  }

  if (file.size > MAX_IMAGE_FILE_SIZE) {
    return { status: 413, message: `${prefix}${t.errors.fileTooLarge}` };
  }

  return null;
}
