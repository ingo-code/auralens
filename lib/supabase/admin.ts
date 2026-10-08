import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase client with the service-role (secret) key. It bypasses Row Level
 * Security, so it is used only by the public API (lib/api/repository.ts),
 * where callers authenticate with an API key instead of a session and every
 * query is explicitly scoped to the authenticated user's id.
 *
 * Server-only: SUPABASE_SERVICE_ROLE_KEY must never get a NEXT_PUBLIC_ prefix.
 */
export class AdminClientNotConfiguredError extends Error {
  constructor() {
    super("SUPABASE_SERVICE_ROLE_KEY (and a Supabase URL) must be set for the public API.");
    this.name = "AdminClientNotConfiguredError";
  }
}

let admin: SupabaseClient | undefined;

export function getAdminClient(): SupabaseClient {
  if (admin) return admin;

  // Same server-side URL override as lib/supabase/server.ts (Docker).
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new AdminClientNotConfiguredError();

  admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return admin;
}
