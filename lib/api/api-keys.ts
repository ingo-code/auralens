import { createHash, randomBytes } from "node:crypto";

export const API_KEY_PREFIX = "al_live_";

/** Permissions an API key can carry. Session (browser) access implies all. */
export const API_SCOPES = ["analyses:read", "analyses:write"] as const;
export type ApiScope = (typeof API_SCOPES)[number];

/** Characters of the secret kept in `prefix` so users can tell keys apart. */
const VISIBLE_SECRET_CHARS = 4;

export type GeneratedApiKey = {
  /** Full key - returned to the user exactly once, never stored. */
  key: string;
  /** Display form, e.g. "al_live_AbCd". */
  prefix: string;
  /** SHA-256 (hex) stored in the database for lookup. */
  hash: string;
};

export function generateApiKey(): GeneratedApiKey {
  const secret = randomBytes(32).toString("base64url");
  const key = `${API_KEY_PREFIX}${secret}`;
  return { key, prefix: `${API_KEY_PREFIX}${secret.slice(0, VISIBLE_SECRET_CHARS)}`, hash: hashApiKey(key) };
}

/**
 * A plain SHA-256 is enough here (no bcrypt/argon2): keys are 256-bit
 * random secrets, not guessable passwords, and the hash must be cheap to
 * compute on every request.
 */
export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function looksLikeApiKey(value: string): boolean {
  return value.startsWith(API_KEY_PREFIX) && value.length > API_KEY_PREFIX.length + 20;
}
