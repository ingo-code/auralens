import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { deleteUserAccount, hasBetaAccess, redeemInviteCode } from "@/lib/api/repository";
import { INVITE_COOKIE } from "@/lib/invite-codes";
import { BETA_TERMS_VERSION } from "@/lib/legal";
import { createClient } from "@/lib/supabase/server";

/** Set by the sign-up form right before it leaves for Google. */
const InviteCookieSchema = z.object({
  code: z.string().max(100),
  consent: z.object({
    beta_terms_version: z.string().max(40),
    beta_terms_accepted_at: z.string().max(40),
    beta_notice_version: z.string().max(40),
    beta_notice_accepted_at: z.string().max(40),
  }),
});

function readInviteCookie(request: NextRequest): z.infer<typeof InviteCookieSchema> | null {
  const raw = request.cookies.get(INVITE_COOKIE)?.value;
  if (!raw) return null;
  try {
    const parsed = InviteCookieSchema.safeParse(JSON.parse(decodeURIComponent(raw)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function redirect(origin: string, path: string): NextResponse {
  const response = NextResponse.redirect(new URL(path, origin));
  // Single use: the invite cookie never outlives this request.
  response.cookies.set(INVITE_COOKIE, "", { path: "/auth/callback", maxAge: 0 });
  return response;
}

/**
 * Return target of Google sign-ins and of the confirmation link in the
 * sign-up e-mail (`?flow=signup`). Supabase redirects here with a one-time
 * `code`, which is exchanged for a session cookie (PKCE).
 *
 * Closed beta: e-mail sign-ups claim their invite code in the database while
 * the user is created. Google sign-ups can't, so a Google account without
 * beta access claims the code from the invite cookie here - or is signed out
 * and deleted again, leaving no data behind.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  // Supabase has already confirmed the address before redirecting here. If
  // the session exchange fails (link opened in another browser, so the PKCE
  // verifier cookie is missing), the account is still confirmed - ask the
  // user to sign in instead of reporting an error.
  const failureTarget = searchParams.get("flow") === "signup" ? "/login?confirmed=1" : "/login?error=oauth";

  if (!code) {
    return redirect(origin, failureTarget);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    console.error("Anmeldung über Rückleitung fehlgeschlagen:", error);
    return redirect(origin, failureTarget);
  }
  const user = data.user;

  try {
    if (!(await hasBetaAccess(user.id))) {
      const invite = readInviteCookie(request);
      if (!invite || !(await redeemInviteCode(user.id, invite.code))) {
        await supabase.auth.signOut();
        // Only OAuth accounts can exist without access (e-mail sign-ups
        // without a code fail in the database), so this is a fresh, empty one.
        if (user.app_metadata?.provider !== "email") await deleteUserAccount(user.id);
        console.info(`[auth] Registrierung ohne gültigen Einladungscode abgelehnt (user=${user.id})`);
        return redirect(origin, "/login?error=invite_required");
      }
      // Consent given on the sign-up form, before leaving for Google.
      const { error: consentError } = await supabase.auth.updateUser({ data: invite.consent });
      if (consentError) console.error("Einwilligung konnte nicht gespeichert werden:", consentError);
      return redirect(origin, "/dashboard");
    }
  } catch (accessError) {
    console.error("Beta-Zugang konnte nicht geprüft werden:", accessError);
    await supabase.auth.signOut();
    return redirect(origin, "/login?error=oauth");
  }

  // Google sign-ins of existing accounts: record the beta-terms consent
  // (given next to the Google button) the same way the form does.
  if (!user.user_metadata?.beta_terms_version) {
    const { error: updateError } = await supabase.auth.updateUser({
      data: { beta_terms_version: BETA_TERMS_VERSION, beta_terms_accepted_at: new Date().toISOString() },
    });
    if (updateError) console.error("Einwilligung konnte nicht gespeichert werden:", updateError);
  }

  return redirect(origin, "/dashboard");
}
