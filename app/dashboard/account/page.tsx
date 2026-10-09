import { redirect } from "next/navigation";
import Link from "next/link";
import { AccountDataPanel } from "@/components/account/AccountDataPanel";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
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
    <div className="min-h-screen px-6 py-12 text-stone-900">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <Link href="/dashboard" className="text-sm text-stone-500 transition-colors hover:text-stone-900">
              {t.dashboard.back}
            </Link>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">{t.account.title}</h1>
            <p className="mt-1 text-sm text-stone-500">{t.account.intro}</p>
          </div>
          <LanguageSwitcher />
        </div>
        <AccountDataPanel email={email} />
      </div>
    </div>
  );
}
