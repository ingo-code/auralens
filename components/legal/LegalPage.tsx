import { SiteHeader } from "@/components/SiteHeader";
import type { ReactNode } from "react";
import { getMessages } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/server";

/** Shared frame of the legal pages: logo, title, German-only notice, prose styles. */
export async function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  const locale = await getRequestLocale();
  const t = getMessages(locale);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <article className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 sm:px-8">
        <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-muted">
          <span className="inline-block h-2 w-2 bg-signal" aria-hidden="true" />
          AuraLens
        </span>
        <h1 className="mt-2 text-4xl text-ink">{title}</h1>
        {locale !== "de" && (
          <p className="mt-3 border-l-2 border-signal bg-panel px-3 py-2 text-sm text-ink-muted">{t.legal.germanOnly}</p>
        )}
        <div className="legal-prose mt-8 space-y-4 text-[15px] leading-relaxed text-ink-muted [&_a]:text-signal-soft [&_a]:underline [&_h2]:mt-10 [&_h2]:text-2xl [&_h2]:text-ink [&_h3]:mt-6 [&_h3]:font-semibold [&_h3]:text-ink [&_strong]:text-ink [&_li]:ml-5 [&_li]:list-disc">
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
    <div role="alert" className="border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
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
