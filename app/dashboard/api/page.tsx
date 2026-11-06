import { redirect } from "next/navigation";
import { ApiKeysManager } from "@/components/api/ApiKeysManager";
import { DashboardNav } from "@/components/DashboardNav";
import { SiteHeader } from "@/components/SiteHeader";
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
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-10 sm:px-8">
        <DashboardNav title={t.apiKeys.title} />
        <div className="max-w-3xl">
          <ApiKeysManager />
        </div>
      </main>
    </div>
  );
}
