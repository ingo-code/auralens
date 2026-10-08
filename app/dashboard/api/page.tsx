import { redirect } from "next/navigation";
import Link from "next/link";
import { ApiKeysManager } from "@/components/api/ApiKeysManager";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { getMessages } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";

export default async function ApiSettingsPage() {
  const t = getMessages(await getRequestLocale());
  const supabase = await createClient();

  let userId: string | undefined;
  try {
    const { data: claims } = await supabase.auth.getClaims();
    userId = claims?.claims.sub;
  } catch (error) {
    console.error("Supabase-Sitzung konnte nicht geprüft werden:", error);
  }

  if (!userId) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen px-6 py-12 text-stone-900">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <Link href="/" className="text-lg font-semibold tracking-tight">
              Aura<span className="bg-gradient-to-r from-violet-600 to-fuchsia-500 bg-clip-text text-transparent">Lens</span>
            </Link>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">{t.apiKeys.title}</h1>
          </div>
          <div className="flex items-center gap-4">
            <LanguageSwitcher />
            <Link href="/dashboard" className="text-sm text-stone-500 transition-colors hover:text-stone-900">
              {t.apiKeys.back}
            </Link>
          </div>
        </div>
        <ApiKeysManager />
      </div>
    </div>
  );
}
