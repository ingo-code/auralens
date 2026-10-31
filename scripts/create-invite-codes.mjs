#!/usr/bin/env node
/*
 * Creates beta invite codes in the `invite_codes` table and prints them.
 *
 *   npm run invite-codes                                 # 30 codes, .env.local
 *   npm run invite-codes -- 5 --note "Fotoclub Köln"
 *   npm run invite-codes -- --env .env.production.local
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and
 * SUPABASE_SERVICE_ROLE_KEY. The database decides whether a code is valid,
 * so the codes are printed here once and nowhere stored in the repository.
 */
import { existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
// Node >= 22.18 runs TypeScript files directly (type stripping).
import { generateInviteCode } from "../lib/invite-codes.ts";

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args.splice(index, 2)[1];
};
const envFile = option("--env") ?? ".env.local";
const note = option("--note") ?? null;
const count = Number(args[0] ?? 30);

if (!Number.isInteger(count) || count < 1 || count > 500) {
  console.error("Anzahl muss eine ganze Zahl zwischen 1 und 500 sein.");
  process.exit(1);
}
if (existsSync(envFile)) process.loadEnvFile(envFile);

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error(`Supabase-URL oder SUPABASE_SERVICE_ROLE_KEY fehlt (gelesen: ${envFile}).`);
  process.exit(1);
}

const codes = [...new Set(Array.from({ length: count }, () => generateInviteCode()))];
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { error } = await db.from("invite_codes").insert(codes.map((code) => ({ code, note })));
if (error) {
  console.error(`Codes konnten nicht gespeichert werden: ${error.message}`);
  console.error("Ist die Migration 20261027120000_invite_codes.sql angewendet?");
  process.exit(1);
}

console.error(`${codes.length} Einladungscodes in ${new URL(url).host} angelegt:\n`);
console.log(codes.join("\n"));
