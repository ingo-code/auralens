import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  generateInviteCode,
  INVITE_CODE_ALPHABET,
  INVITE_CODE_PREFIX,
  INVITE_CODE_RANDOM_LENGTH,
  looksLikeInviteCode,
  normalizeInviteCode,
} from "@/lib/invite-codes";

const MIGRATION = readFileSync(join(process.cwd(), "supabase/migrations/20261027120000_invite_codes.sql"), "utf8");

describe("Einladungscodes", () => {
  it("erzeugt Codes im Format AURALENS-BETA-2026-XXXXXXXX ohne verwechselbare Zeichen", () => {
    const codes = Array.from({ length: 500 }, () => generateInviteCode());
    const pattern = new RegExp(`^${INVITE_CODE_PREFIX}[${INVITE_CODE_ALPHABET}]{${INVITE_CODE_RANDOM_LENGTH}}$`);

    for (const code of codes) {
      expect(code).toMatch(pattern);
      expect(code.slice(INVITE_CODE_PREFIX.length)).not.toMatch(/[01OIL]/);
      expect(looksLikeInviteCode(code)).toBe(true);
    }
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("verwirft Zufallsbytes, die die Verteilung verzerren würden", () => {
    // 248 = 8 * 31 is the first biased byte; only bytes below it may be used.
    const bytes = [255, 250, 248, 0, 1, 2, 3, 4, 5, 6, 7];
    const code = generateInviteCode((buffer) => {
      buffer.fill(0);
      buffer.set(bytes.slice(0, buffer.length));
      return buffer;
    });
    expect(code).toBe(`${INVITE_CODE_PREFIX}23456789`);
  });

  it("normalisiert wie die Datenbank: Groß-/Kleinschreibung und Leerzeichen egal", () => {
    expect(normalizeInviteCode("  auralens-beta-2026-7kq4m9tx ")).toBe("AURALENS-BETA-2026-7KQ4M9TX");
    expect(MIGRATION).toMatch(/select upper\(btrim\(coalesce\(p_code, ''\)\)\);/);
  });

  it("lehnt offensichtlich falsche Eingaben ab", () => {
    expect(looksLikeInviteCode("")).toBe(false);
    expect(looksLikeInviteCode("kurz")).toBe(false);
    expect(looksLikeInviteCode("AURALENS BETA 2026")).toBe(false);
    expect(looksLikeInviteCode("x".repeat(65))).toBe(false);
  });
});

describe("Migration invite_codes", () => {
  it("löst den Code in derselben Transaktion wie die Registrierung ein", () => {
    expect(MIGRATION).toMatch(/after insert on auth\.users\s+for each row execute function public\.handle_new_auth_user\(\)/);
    expect(MIGRATION).toMatch(/where code = public\.normalize_invite_code\(p_code\) and not is_used;/);
    expect(MIGRATION).toMatch(/raise exception 'invalid_invite_code'/);
    expect(MIGRATION).toMatch(/raise exception 'beta_notice_required'/);
  });

  it("sperrt alle Funktionen für anon und authenticated", () => {
    const functions = [...MIGRATION.matchAll(/create or replace function (public\.\w+)\(/g)].map((match) => match[1]);
    expect(functions.length).toBeGreaterThan(5);
    for (const name of functions) {
      expect(MIGRATION).toMatch(new RegExp(`revoke execute on function ${name.replace(".", "\\.")}\\([^)]*\\)\\s+from public, anon, authenticated`));
    }
  });
});
