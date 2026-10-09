"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useI18n } from "@/lib/i18n/client";
import { createClient } from "@/lib/supabase/client";
import { BETA_TERMS_VERSION } from "@/lib/legal";

type Mode = "signin" | "signup";

export default function LoginPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // /auth/callback sends failed Google sign-ins back here with ?error=oauth.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("error") === "oauth") {
      setError(t.login.oauthFailed); // eslint-disable-line react-hooks/set-state-in-effect
    }
  }, [t]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);

    const supabase = createClient();

    const { error: authError } =
      mode === "signin"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            // Proof of consent to the beta terms (version + time), stored with the account.
            options: { data: { beta_terms_version: BETA_TERMS_VERSION, beta_terms_accepted_at: new Date().toISOString() } },
          });

    setLoading(false);

    if (authError) {
      setError(authError.message);
      return;
    }

    if (mode === "signup") {
      setInfo(t.login.accountCreated);
      setMode("signin");
      return;
    }

    router.push("/dashboard");
    router.refresh();
  };

  const handleGoogle = async () => {
    setError(null);
    setInfo(null);
    setLoading(true);
    const { error: authError } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    // On success the browser is already navigating to Google.
    if (authError) {
      setLoading(false);
      setError(authError.message);
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center px-6 text-stone-900">
      <Link
        href="/"
        className="absolute left-6 top-6 text-sm text-stone-500 transition-colors hover:text-stone-900"
      >
        {t.login.back}
      </Link>
      <div className="absolute right-6 top-6">
        <LanguageSwitcher />
      </div>
      <div className="w-full max-w-sm space-y-6 rounded-3xl border border-stone-200 bg-white/90 p-8 shadow-xl shadow-violet-500/5 backdrop-blur">
        <div className="text-center">
          <p className="text-xl font-semibold tracking-tight">Aura<span className="bg-gradient-to-r from-violet-600 to-fuchsia-500 bg-clip-text text-transparent">Lens</span></p>
          <h1 className="mt-3 text-lg font-medium text-stone-700">
            {mode === "signin" ? t.login.signIn : t.login.signUp}
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm text-stone-600">
              {t.login.email}
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm text-stone-600">
              {t.login.password}
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10"
            />
          </div>

          {mode === "signup" && (
            <label className="flex items-start gap-2 text-xs leading-relaxed text-stone-600">
              <input
                type="checkbox"
                required
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-violet-600"
              />
              <span>
                {t.legal.consentBefore}
                <Link href="/beta-bedingungen" target="_blank" className="text-violet-700 underline">
                  {t.legal.terms}
                </Link>
                {t.legal.consentMiddle}
                <Link href="/datenschutz" target="_blank" className="text-violet-700 underline">
                  {t.legal.privacy}
                </Link>
                {t.legal.consentAfter}
              </span>
            </label>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
          {info && <p className="text-sm text-emerald-600">{info}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl px-4 py-2.5 text-sm font-medium bg-gradient-to-r from-violet-600 to-fuchsia-500 text-white shadow-md shadow-violet-500/20 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? t.login.wait : mode === "signin" ? t.login.signIn : t.login.register}
          </button>
        </form>

        <div className="space-y-3">
          <div className="flex items-center gap-3 text-xs text-stone-400">
            <span className="h-px flex-1 bg-stone-200" />
            {t.login.or}
            <span className="h-px flex-1 bg-stone-200" />
          </div>
          <button
            type="button"
            onClick={handleGoogle}
            disabled={loading || (mode === "signup" && !acceptedTerms)}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 shadow-sm transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4">
              <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.4 14.6 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12s4.3 9.6 9.6 9.6c5.5 0 9.2-3.9 9.2-9.4 0-.6-.07-1.1-.15-1.6H12z" />
            </svg>
            {mode === "signin" ? t.login.googleSignIn : t.login.googleSignUp}
          </button>
          {mode === "signin" && (
            <p className="text-center text-xs leading-relaxed text-stone-500">
              {t.login.googleConsentBefore}
              <Link href="/beta-bedingungen" target="_blank" className="text-violet-700 underline">
                {t.legal.terms}
              </Link>
              {t.login.googleConsentMiddle}
              <Link href="/datenschutz" target="_blank" className="text-violet-700 underline">
                {t.legal.privacy}
              </Link>
              {t.login.googleConsentAfter}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError(null);
            setInfo(null);
          }}
          className="w-full text-center text-sm text-stone-500 transition-colors hover:text-stone-900"
        >
          {mode === "signin" ? t.login.toSignUp : t.login.toSignIn}
        </button>
      </div>
    </div>
  );
}
