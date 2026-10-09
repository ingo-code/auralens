import Link from "next/link";
import type { ReactNode } from "react";
import { getMessages } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/server";

/** Shared frame of the legal pages: logo, title, German-only notice, prose styles. */
export async function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  const locale = await getRequestLocale();
  const t = getMessages(locale);

  return (
    <div className="min-h-screen px-6 py-12 text-stone-900">
      <article className="mx-auto max-w-3xl">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          Aura<span className="bg-gradient-to-r from-violet-600 to-fuchsia-500 bg-clip-text text-transparent">Lens</span>
        </Link>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight">{title}</h1>
        {locale !== "de" && (
          <p className="mt-3 rounded-lg bg-stone-100 px-3 py-2 text-sm text-stone-600">{t.legal.germanOnly}</p>
        )}
        <div className="legal-prose mt-8 space-y-4 text-[15px] leading-relaxed text-stone-700 [&_a]:text-violet-700 [&_a]:underline [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-stone-900 [&_h3]:mt-6 [&_h3]:font-semibold [&_h3]:text-stone-900 [&_li]:ml-5 [&_li]:list-disc">
          {children}
        </div>
      </article>
    </div>
  );
}

/** Visible warning while operator details are missing - never ship placeholders silently. */
export function MissingConfigNotice({ missing }: { missing: string[] }) {
  if (missing.length === 0) return null;
  return (
    <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
      <p className="font-semibold">Angaben unvollständig – so nicht veröffentlichen.</p>
      <p className="mt-1">
        Fehlende Umgebungsvariablen: <code>{missing.join(", ")}</code> (siehe <code>docs/RECHTLICHES.md</code>).
      </p>
    </div>
  );
}

/** Renders a configured value or a clearly marked gap. */
export function Filled({ value }: { value: string | null }) {
  return value ? <>{value}</> : <mark className="bg-amber-100 px-1">[bitte ergänzen]</mark>;
}
