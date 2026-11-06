import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Playfair_Display } from "next/font/google";
import "./globals.css";
import { getMessages } from "@/lib/i18n";
import { LocaleProvider } from "@/lib/i18n/client";
import { getRequestLocale } from "@/lib/i18n/server";
import { LegalFooter } from "@/components/legal/LegalFooter";

// next/font downloads the fonts at build time and serves them from our own
// domain - no request to Google from the visitor's browser (GDPR).
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  return { title: "AuraLens", description: getMessages(locale).meta.description };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getRequestLocale();

  return (
    <html
      lang={locale}
      className={`${inter.variable} ${jetbrainsMono.variable} ${playfair.variable} h-full antialiased`}
    >
      {/* Browser extensions (e.g. Grammarly) inject attributes into <body> before
          React hydrates; this silences only that element's attribute mismatch. */}
      <body className="flex min-h-full flex-col text-stone-900" suppressHydrationWarning>
        <LocaleProvider locale={locale}>{children}</LocaleProvider>
        <LegalFooter />
      </body>
    </html>
  );
}
