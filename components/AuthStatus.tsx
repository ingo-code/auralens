"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { useI18n } from "@/lib/i18n/client";
import { createClient } from "@/lib/supabase/client";
import { CreditBadge } from "@/components/CreditBadge";
import { refreshCredits } from "@/lib/credits-store";

export function AuthStatus() {
  const { t } = useI18n();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setLoaded(true);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      // The balance belongs to the account - reload it when that changes.
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") void refreshCredits();
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
          <CreditBadge />
          <Link href="/dashboard" className="text-stone-600 transition-colors hover:text-stone-900">
            {t.nav.myAnalyses}
          </Link>
          <button
            type="button"
            onClick={handleSignOut}
            className="text-stone-600 transition-colors hover:text-stone-900"
          >
            {t.nav.signOut}
          </button>
        </>
      ) : (
        <Link href="/login" className="text-stone-600 transition-colors hover:text-stone-900">
          {t.nav.signIn}
        </Link>
      )}
    </div>
  );
}
