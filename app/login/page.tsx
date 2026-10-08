"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useI18n } from "@/lib/i18n/client";
import { createClient } from "@/lib/supabase/client";

type Mode = "signin" | "signup";

export default function LoginPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);

    const supabase = createClient();

    const { error: authError } =
      mode === "signin"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });

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

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center px-6 text-stone-900">
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
