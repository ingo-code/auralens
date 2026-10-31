/*
 * Invite codes of the closed beta (table `invite_codes`, migration
 * 20261027120000_invite_codes.sql). Shared by the sign-up form, the
 * validation endpoint, /auth/callback and scripts/create-invite-codes.mjs.
 */

export const INVITE_CODE_PREFIX = "AURALENS-BETA-2026-";

/** Without 0/O, 1/I/L: codes are typed in by hand. */
export const INVITE_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** Random part; 31^8 ≈ 8.5e11 combinations, so codes can't be guessed. */
export const INVITE_CODE_RANDOM_LENGTH = 8;

/**
 * Google sign-ups leave the page for Google, so the code travels to
 * /auth/callback in this short-lived cookie (deleted there).
 */
export const INVITE_COOKIE = "auralens-invite";
export const INVITE_COOKIE_MAX_AGE_SECONDS = 10 * 60;

/** Same rule as `normalize_invite_code` in SQL: case-insensitive, blanks trimmed. */
export function normalizeInviteCode(code: string): string {
  return code.trim().toUpperCase();
}

/** Cheap format check before asking the server; the database decides. */
export function looksLikeInviteCode(code: string): boolean {
  return /^[A-Z0-9-]{8,64}$/.test(normalizeInviteCode(code));
}

/** A fresh code like AURALENS-BETA-2026-7KQ4M9TX, from a cryptographic RNG. */
export function generateInviteCode(random: (bytes: Uint8Array) => Uint8Array = (b) => crypto.getRandomValues(b)): string {
  const alphabet = INVITE_CODE_ALPHABET;
  // Rejection sampling keeps every character equally likely.
  const limit = 256 - (256 % alphabet.length);
  let suffix = "";
  while (suffix.length < INVITE_CODE_RANDOM_LENGTH) {
    for (const byte of random(new Uint8Array(16))) {
      if (byte < limit && suffix.length < INVITE_CODE_RANDOM_LENGTH) suffix += alphabet[byte % alphabet.length];
    }
  }
  return INVITE_CODE_PREFIX + suffix;
}
