import type { Metadata } from "next";
import { Filled, LegalPage, MissingConfigNotice } from "@/components/legal/LegalPage";
import { getLegalConfig, missingLegalFields } from "@/lib/legal";

// Operator details come from runtime env vars, not from the build.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Impressum – AuraLens" };

export default function ImpressumPage() {
  const legal = getLegalConfig();

  return (
    <LegalPage title="Impressum">
      <MissingConfigNotice missing={missingLegalFields(legal)} />

      <h2>Angaben gemäß § 5 DDG</h2>
      <p>
        <Filled value={legal.operatorName} />
        <br />
        {legal.addressLines.length > 0 ? (
          legal.addressLines.map((line) => (
            <span key={line}>
              {line}
              <br />
            </span>
          ))
        ) : (
          <Filled value={null} />
        )}
      </p>

      <h2>Kontakt</h2>
      <p>
        E-Mail:{" "}
        {legal.email ? <a href={`mailto:${legal.email}`}>{legal.email}</a> : <Filled value={null} />}
        {legal.phone && (
          <>
            <br />
            Telefon: {legal.phone}
          </>
        )}
      </p>

      <h2>Hinweis zum Angebot</h2>
      <p>
        AuraLens befindet sich in einem <strong>geschlossenen, nicht-kommerziellen Beta-Test</strong>. Der Zugang
        erfolgt nur auf Einladung; es werden keine Entgelte erhoben und keine Verträge gegen Bezahlung geschlossen.
        Es gelten die <a href="/beta-bedingungen">Beta-Bedingungen</a>.
      </p>

      <h2>Haftung für Inhalte und Links</h2>
      <p>
        Die Analyseergebnisse werden automatisiert von einem KI-Modell erzeugt und können fehlerhaft sein. Für Inhalte
        externer Websites, auf die verlinkt wird, sind ausschließlich deren Betreiber verantwortlich.
      </p>
    </LegalPage>
  );
}
