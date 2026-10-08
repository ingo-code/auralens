import type { Locale } from "@/lib/i18n/config";
import { de, type Messages } from "@/lib/i18n/messages/de";
import { en } from "@/lib/i18n/messages/en";

export type { Messages };

const MESSAGES: Record<Locale, Messages> = { de, en };

/** Both dictionaries are small, so they are bundled statically instead of lazy-loaded. */
export function getMessages(locale: Locale): Messages {
  return MESSAGES[locale];
}
