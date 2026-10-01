"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

export function AuthStatus() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setLoaded(true);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  };

  if (!loaded) {
    return <div className="h-5 w-24" aria-hidden="true" />;
  }

  return (
    <div className="flex items-center gap-4 text-sm">
      {user ? (
        <>
          <Link href="/dashboard" className="text-zinc-400 transition-colors hover:text-zinc-200">
            Meine Analysen
          </Link>
          <button
            type="button"
            onClick={handleSignOut}
            className="text-zinc-400 transition-colors hover:text-zinc-200"
          >
            Abmelden
          </button>
        </>
      ) : (
        <Link href="/login" className="text-zinc-400 transition-colors hover:text-zinc-200">
          Anmelden
        </Link>
      )}
    </div>
  );
}
