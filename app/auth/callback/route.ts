import { NextResponse, type NextRequest } from "next/server";
import { BETA_TERMS_VERSION } from "@/lib/legal";
import { createClient } from "@/lib/supabase/server";

/**
 * OAuth return target (Google). Supabase redirects here with a one-time
 * `code`, which is exchanged for a session cookie (PKCE).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=oauth", origin));
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    console.error("OAuth-Anmeldung fehlgeschlagen:", error);
    return NextResponse.redirect(new URL("/login?error=oauth", origin));
  }

  // Google sign-ups skip the e-mail form, so record the beta-terms consent
  // (given next to the Google button) the same way the form does.
  if (!data.user.user_metadata?.beta_terms_version) {
    const { error: updateError } = await supabase.auth.updateUser({
      data: { beta_terms_version: BETA_TERMS_VERSION, beta_terms_accepted_at: new Date().toISOString() },
    });
    if (updateError) console.error("Einwilligung konnte nicht gespeichert werden:", updateError);
  }

  return NextResponse.redirect(new URL("/dashboard", origin));
}
