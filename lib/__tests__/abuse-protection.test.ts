import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { secondsUntilBerlinMidnight } from "@/lib/api/limits";
import { DISPOSABLE_EMAIL_DOMAINS, isDisposableEmail } from "@/lib/disposable-email";

const MIGRATION = readFileSync(
  join(process.cwd(), "supabase/migrations/20261026120000_abuse_protection.sql"),
  "utf8"
);

describe("Wegwerf-E-Mail-Adressen", () => {
  it("erkennt gelistete Domains und deren Subdomains, unabhängig von Groß-/Kleinschreibung", () => {
    expect(isDisposableEmail("bot@mailinator.com")).toBe(true);
    expect(isDisposableEmail("Bot@YOPMAIL.com ")).toBe(true);
    expect(isDisposableEmail("bot@eu.trashmail.com")).toBe(true);
  });

  it("lässt normale Adressen und ähnlich klingende Domains durch", () => {
    expect(isDisposableEmail("fotograf@gmail.com")).toBe(false);
    expect(isDisposableEmail("info@notmailinator.com")).toBe(false);
    expect(isDisposableEmail("keine-adresse")).toBe(false);
  });

  it("stimmt mit der Sperrliste der Datenbank-Migration überein", () => {
    const insert = MIGRATION.slice(
      MIGRATION.indexOf("insert into public.blocked_email_domains"),
      MIGRATION.indexOf("on conflict (domain) do nothing")
    );
    const sqlDomains = [...insert.matchAll(/\('([^']+)'\)/g)].map((match) => match[1]);

    expect([...sqlDomains].sort()).toEqual([...DISPOSABLE_EMAIL_DOMAINS].sort());
    expect(DISPOSABLE_EMAIL_DOMAINS.every((domain) => domain === domain.toLowerCase())).toBe(true);
  });
});

describe("Kostenbremse und Missbrauchsschutz in der Migration", () => {
  it("vergibt Beta-Credits erst nach bestätigter E-Mail und höchstens einmal", () => {
    expect(MIGRATION).toMatch(/if new\.email_confirmed_at is null then\s+return new;/);
    expect(MIGRATION).toMatch(/after update of email_confirmed_at on auth\.users/);
    expect(MIGRATION).toMatch(/if not exists \(select 1 from public\.credit_ledger where user_id = new\.id and reason = 'grant'\)/);
  });

  it("sperrt alle neuen Funktionen für anon und authenticated", () => {
    const functions = [...MIGRATION.matchAll(/create or replace function (public\.\w+)\(/g)].map((match) => match[1]);
    for (const name of functions) {
      expect(MIGRATION).toMatch(new RegExp(`revoke execute on function ${name.replace(".", "\\.")}\\([^)]*\\)\\s+from public, anon, authenticated`));
    }
  });
});

describe("secondsUntilBerlinMidnight", () => {
  it("rechnet in Berliner Zeit, auch über die Sommerzeit", () => {
    // 22:00 UTC im Winter = 23:00 in Berlin -> 1 Stunde bis Mitternacht.
    expect(secondsUntilBerlinMidnight(new Date("2026-12-01T22:00:00Z"))).toBe(3600);
    // 21:30 UTC im Sommer = 23:30 in Berlin -> 30 Minuten.
    expect(secondsUntilBerlinMidnight(new Date("2026-07-01T21:30:00Z"))).toBe(1800);
  });
});
