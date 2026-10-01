"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Mode = "signin" | "signup";

export default function LoginPage() {
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
      setInfo("Konto erstellt. Du kannst dich jetzt anmelden.");
      setMode("signin");
      return;
    }

    router.push("/dashboard");
    router.refresh();
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-black px-6 text-zinc-100">
      <div className="w-full max-w-sm space-y-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-8">
        <div className="text-center">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-violet-400">AuraLens</p>
          <h1 className="mt-2 text-xl font-semibold">
            {mode === "signin" ? "Anmelden" : "Konto erstellen"}
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm text-zinc-400">
              E-Mail
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-violet-400"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm text-zinc-400">
              Passwort
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-violet-400"
            />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}
          {info && <p className="text-sm text-emerald-400">{info}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-violet-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Bitte warten…" : mode === "signin" ? "Anmelden" : "Registrieren"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError(null);
            setInfo(null);
          }}
          className="w-full text-center text-sm text-zinc-500 transition-colors hover:text-zinc-300"
        >
          {mode === "signin" ? "Noch kein Konto? Registrieren" : "Schon registriert? Anmelden"}
        </button>
      </div>
    </div>
  );
}
