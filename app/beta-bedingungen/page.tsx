import type { Metadata } from "next";
import { Filled, LegalPage } from "@/components/legal/LegalPage";
import { BETA_TERMS_VERSION, getLegalConfig } from "@/lib/legal";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Beta-Bedingungen – AuraLens" };

export default function BetaBedingungenPage() {
  const legal = getLegalConfig();

  return (
    <LegalPage title="Bedingungen für den Beta-Test">
      <p className="text-sm text-stone-500">Version {BETA_TERMS_VERSION}</p>

      <h2>1. Art des Angebots</h2>
      <p>
        AuraLens wird von <Filled value={legal.operatorName} /> als <strong>geschlossener, nicht-kommerzieller
        Beta-Test</strong> bereitgestellt. Die Teilnahme ist kostenlos und nur auf Einladung möglich. Es werden keine
        Entgelte erhoben; ein Anspruch auf Teilnahme oder auf eine spätere kostenpflichtige Version besteht nicht.
      </p>

      <h2>2. Credits</h2>
      <p>
        Für Analysen werden Credits verbraucht (1 Credit pro Bild). Credits sind ein reines Kontingent für den Test,
        haben keinen Geldwert, sind nicht übertragbar, nicht auszahlbar und verfallen mit dem Ende des Beta-Tests.
        Credits fehlgeschlagener Analysen werden automatisch erstattet.
      </p>

      <h2>3. Deine Pflichten beim Hochladen</h2>
      <ul>
        <li>Du lädst nur Bilder hoch, an denen du die erforderlichen Rechte hast.</li>
        <li>
          Bilder, auf denen Personen erkennbar sind, lädst du nur mit deren Einwilligung hoch. Keine Bilder mit
          sensiblen Daten (z. B. Ausweise, Gesundheitsdaten) und keine rechtswidrigen Inhalte.
        </li>
        <li>Du gibst deine Zugangsdaten und API-Keys nicht an Dritte weiter.</li>
      </ul>

      <h2>4. Verarbeitung durch einen KI-Dienst</h2>
      <p>
        Die Analyse erfolgt durch das KI-Modell Claude von Anthropic (USA). Einzelheiten stehen in der{" "}
        <a href="/datenschutz">Datenschutzerklärung</a>.
      </p>

      <h2>5. Ergebnisse</h2>
      <p>
        Reports, Farbwerte, Metadaten und Prompts werden automatisiert erzeugt. Sie können unvollständig oder falsch
        sein und ersetzen keine fachliche Prüfung. Du darfst die Ergebnisse frei verwenden; ob an ihnen Schutzrechte
        bestehen oder ob sie Rechte Dritter berühren, musst du vor einer Verwendung selbst prüfen.
      </p>

      <h2>6. Verfügbarkeit und Gewährleistung</h2>
      <p>
        Es handelt sich um eine Testversion. Funktionen können sich ändern, ausfallen oder entfallen; Daten können im
        Testbetrieb verloren gehen. Eine bestimmte Verfügbarkeit wird nicht zugesagt.
      </p>

      <h2>7. Haftung</h2>
      <p>
        Da die Leistung unentgeltlich erbracht wird, haftet der Anbieter nur für Vorsatz und grobe Fahrlässigkeit
        (entsprechend §§ 521, 599 BGB). Die Haftung für Verletzungen von Leben, Körper oder Gesundheit sowie nach dem
        Produkthaftungsgesetz bleibt unberührt.
      </p>

      <h2>8. Ende der Teilnahme</h2>
      <p>
        Du kannst die Teilnahme jederzeit beenden, indem du dein Konto unter „Konto &amp; Daten“ löschst. Der Anbieter
        kann den Beta-Test jederzeit beenden oder einzelne Zugänge sperren, insbesondere bei Verstößen gegen Abschnitt 3.
        Nach dem Ende des Beta-Tests werden Konten und Daten spätestens nach 3 Monaten gelöscht.
      </p>

      <h2>9. Änderungen und anwendbares Recht</h2>
      <p>
        Ändern sich diese Bedingungen wesentlich, wirst du vor der weiteren Nutzung darauf hingewiesen. Es gilt das
        Recht der Bundesrepublik Deutschland; zwingende Verbraucherschutzvorschriften deines Wohnsitzstaates bleiben
        unberührt.
      </p>
    </LegalPage>
  );
}
