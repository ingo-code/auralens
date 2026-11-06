import { redirect } from "next/navigation";
import { AccountDataPanel } from "@/components/account/AccountDataPanel";
import { DashboardNav } from "@/components/DashboardNav";
import { SiteHeader } from "@/components/SiteHeader";
import { getMessages } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";

export default async function AccountPage() {
  const t = getMessages(await getRequestLocale());
  const supabase = await createClient();

  let email: string | undefined;
  try {
    const { data } = await supabase.auth.getUser();
    email = data.user?.email ?? undefined;
  } catch (error) {
    console.error("Supabase-Sitzung konnte nicht geprüft werden:", error);
  }
  if (!email) redirect("/login");

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-10 sm:px-8">
        <DashboardNav title={t.account.title}>
          <p className="text-sm text-ink-muted">{t.account.intro}</p>
        </DashboardNav>
        <div className="max-w-3xl">
          <AccountDataPanel email={email} />
        </div>
      </main>
    </div>
  );
}
