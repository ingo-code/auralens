import type { Metadata } from "next";
import { Filled, LegalPage, MissingConfigNotice } from "@/components/legal/LegalPage";
import { getLegalConfig, missingLegalFields } from "@/lib/legal";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Datenschutzerklärung – AuraLens" };

/*
 * Describes what the code actually does - keep in sync when data flows
 * change (new provider, new cookie, images stored, analytics, ...).
 */
export default function DatenschutzPage() {
  const legal = getLegalConfig();

  return (
    <LegalPage title="Datenschutzerklärung">
      <MissingConfigNotice missing={missingLegalFields(legal)} />
      <p className="text-sm text-stone-500">Stand: 9. Oktober 2026 · gilt für den geschlossenen Beta-Test</p>

      <h2>1. Verantwortlicher</h2>
      <p>
        <Filled value={legal.operatorName} />
        <br />
        {legal.addressLines.length > 0 ? legal.addressLines.join(", ") : <Filled value={null} />}
        <br />
        E-Mail: {legal.email ? <a href={`mailto:${legal.email}`}>{legal.email}</a> : <Filled value={null} />}
      </p>
      <p>Für alle Fragen zum Datenschutz und zur Ausübung deiner Rechte genügt eine E-Mail an diese Adresse.</p>

      <h2>2. Überblick</h2>
      <ul>
        <li>AuraLens ist ein geschlossener, kostenloser Beta-Test. Es werden keine Zahlungsdaten verarbeitet.</li>
        <li>Es gibt <strong>keine Werbung, kein Tracking, keine Analyse-Tools</strong> und keine Weitergabe zu Werbezwecken.</li>
        <li>Es werden nur technisch notwendige Cookies gesetzt (Abschnitt 8) – deshalb gibt es kein Cookie-Banner.</li>
        <li>Deine Bilder werden zur Analyse an Anthropic (USA) übermittelt und von AuraLens <strong>nicht gespeichert</strong> (Abschnitt 5).</li>
      </ul>

      <h2>3. Hosting und Server-Protokolle</h2>
      <p>
        Die Anwendung wird betrieben bei: <Filled value={legal.hosting} />. Beim Aufruf verarbeitet der Server technisch
        notwendige Daten: IP-Adresse, Zeitpunkt, aufgerufene Adresse, Browser-Kennung. AuraLens protokolliert darüber
        hinaus Request-Kennungen, Laufzeiten und Token-Mengen der Analysen, aber keine Bildinhalte. IP-Adressen werden
        zur Abwehr von Missbrauch (Begrenzung der Anfragen) höchstens 10 Minuten im Arbeitsspeicher gehalten und nicht
        dauerhaft gespeichert.
      </p>
      <p>
        Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO (sicherer und stabiler Betrieb). Server-Protokolle werden nur so
        lange aufbewahrt, wie es für Betrieb und Fehleranalyse nötig ist, höchstens 30 Tage.
      </p>

      <h2>4. Benutzerkonto</h2>
      <p>
        Für die Teilnahme brauchst du ein Konto. Verarbeitet werden E-Mail-Adresse, Passwort (nur als
        kryptografischer Hash), Zeitpunkte von Registrierung und Anmeldung sowie der Zeitpunkt, zu dem du den
        Beta-Bedingungen zugestimmt hast. Die Anmeldung erfolgt über den Dienst Supabase:{" "}
        <Filled value={legal.database} />.
      </p>
      <p>
        Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO (Teilnahme am Beta-Test). Speicherdauer: bis du dein Konto löschst,
        spätestens 3 Monate nach Ende des Beta-Tests.
      </p>

      <h2>5. Bildanalyse mit Claude (Anthropic)</h2>
      <p>
        Wenn du eine Analyse startest, werden deine Bilder auf unserem Server verkleinert und als JPEG neu erzeugt.
        Dabei werden eingebettete Metadaten (z. B. GPS-Position, Kameradaten) entfernt. Anschließend werden die Bilder
        an die KI-Schnittstelle von <strong>Anthropic, PBC (San Francisco, USA)</strong> übermittelt, die den Report
        erstellt.
      </p>
      <ul>
        <li>
          <strong>AuraLens speichert deine Bilder nicht.</strong> Sie liegen nur während der Analyse im Arbeitsspeicher.
          Gespeichert werden der Report, Dateinamen, Pixelmaße und der Bearbeitungsstatus.
        </li>
        <li>
          Anthropic verarbeitet die Daten als unser Auftragsverarbeiter, speichert Ein- und Ausgaben nach eigenen
          Angaben bis zu 30 Tage und verwendet sie nicht zum Training seiner Modelle.
        </li>
        <li>
          Die Übermittlung in die USA erfolgt auf Grundlage der EU-Standardvertragsklauseln (Art. 46 Abs. 2 lit. c
          DSGVO), die Bestandteil der Auftragsverarbeitungsvereinbarung von Anthropic sind.
        </li>
        <li>
          Bitte lade <strong>keine Bilder erkennbarer Personen</strong> hoch, ohne dass diese eingewilligt haben, und
          keine Bilder mit sensiblen Informationen (z. B. Ausweise, Gesundheitsdaten).
        </li>
      </ul>
      <p>
        Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO (Erbringung der angefragten Analyse). Speicherdauer der Reports:
        bis du sie löschst oder dein Konto löschst. Frühere Versionen von AuraLens haben bei Einzelanalysen auch das
        Bild gespeichert („Archiv“-Einträge); diese Bilder werden mit dem Eintrag bzw. dem Konto gelöscht.
      </p>
      <p>
        Die Analyse ist eine automatisierte Auswertung von Bildern, aber <strong>keine automatisierte Entscheidung</strong>{" "}
        über dich im Sinne von Art. 22 DSGVO; sie hat keine rechtliche Wirkung.
      </p>

      <h2>6. API-Keys und Credits</h2>
      <p>
        Wenn du API-Keys erstellst, speichern wir Name, Anfangszeichen, Berechtigungen, Zeitpunkte von Erstellung und
        letzter Nutzung sowie einen kryptografischen Hash des Keys – nie den Key selbst. Credits werden als Buchungen
        (Gutschrift, Reservierung, Erstattung) zu deinem Konto gespeichert. Credits haben keinen Geldwert.
        Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO. Speicherdauer: wie beim Konto.
      </p>

      <h2>7. Empfänger und Auftragsverarbeiter</h2>
      <ul>
        <li>Hosting: <Filled value={legal.hosting} /></li>
        <li>Datenbank und Anmeldung: <Filled value={legal.database} /></li>
        <li>KI-Analyse: Anthropic, PBC, USA (Abschnitt 5)</li>
      </ul>
      <p>Mit allen Dienstleistern bestehen Verträge zur Auftragsverarbeitung nach Art. 28 DSGVO.</p>

      <h2>8. Cookies</h2>
      <ul>
        <li>
          <code>sb-auralens-auth-token</code> – hält dich angemeldet; wird beim Abmelden gelöscht.
        </li>
        <li>
          <code>auralens-locale</code> – speichert die gewählte Sprache (Deutsch/Englisch), 1 Jahr.
        </li>
      </ul>
      <p>
        Beide sind für den von dir gewünschten Dienst unbedingt erforderlich (§ 25 Abs. 2 Nr. 2 TDDDG) und benötigen
        keine Einwilligung. Weitere Cookies, Local Storage zu Tracking-Zwecken oder Einbindungen von Drittanbietern
        (z. B. Schriften von Google-Servern) gibt es nicht.
      </p>

      <h2>9. Deine Rechte</h2>
      <p>
        Du hast das Recht auf Auskunft (Art. 15), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung der
        Verarbeitung (Art. 18), Datenübertragbarkeit (Art. 20) und Widerspruch gegen Verarbeitungen auf Grundlage
        berechtigter Interessen (Art. 21 DSGVO).
      </p>
      <p>
        <strong>Selbst erledigen:</strong> Unter <a href="/dashboard/account">Meine Analysen → Konto &amp; Daten</a>{" "}
        kannst du alle deine Daten als JSON-Datei herunterladen und dein Konto samt aller Daten endgültig löschen.
      </p>
      <p>
        Du kannst dich außerdem bei einer Datenschutz-Aufsichtsbehörde beschweren (Art. 77 DSGVO), insbesondere in dem
        Bundesland bzw. Mitgliedstaat deines Wohnorts.
      </p>
    </LegalPage>
  );
}
