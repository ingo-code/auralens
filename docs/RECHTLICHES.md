# Rechtliches & Datenschutz – geschlossener Beta-Test

> Keine Rechtsberatung. Dieser Stand deckt die **Mindestanforderungen für einen geschlossenen, kostenlosen Test** (keine Zahlungen, Zugang nur auf Einladung) ab. Vor einem öffentlichen oder kostenpflichtigen Start sollten die Texte anwaltlich oder mit einem Generator (z. B. eRecht24, Datenschutz-Generator.de) geprüft werden.

## Was im Code umgesetzt ist

| Vorschrift | Umsetzung |
|---|---|
| Impressum (§ 5 DDG) | Seite `/impressum`, Angaben aus Umgebungsvariablen; Link auf jeder Seite im Footer |
| Informationspflichten (Art. 13 DSGVO) | `/datenschutz` beschreibt jede tatsächliche Verarbeitung (Konto, Bildanalyse, API-Keys, Credits, Logs, Cookies), Rechtsgrundlagen, Empfänger, Drittlandübermittlung, Speicherdauer, Rechte, Beschwerderecht |
| Information bei der Erhebung | Hinweis direkt unter jedem Upload: Übermittlung an Anthropic (USA), keine Speicherung, Rechte am Bild, Personen nur mit Einwilligung |
| Nutzungsbedingungen | `/beta-bedingungen` (kostenlos, Credits ohne Geldwert, Pflichten beim Upload, keine Gewähr, Haftung nur Vorsatz/grobe Fahrlässigkeit) |
| Zustimmung bei Registrierung | Pflicht-Checkbox; Version und Zeitpunkt werden im Konto gespeichert (`beta_terms_version`, `beta_terms_accepted_at`) |
| Cookies (§ 25 TDDDG) | Nur zwei technisch notwendige Cookies (Anmeldung, Sprache) → kein Banner nötig. Keine Tracker, keine Analytics, Schriften lokal ausgeliefert |
| Auskunft & Datenübertragbarkeit (Art. 15, 20) | *Meine Analysen → Konto & Daten → Meine Daten herunterladen* (JSON mit allen Daten, ohne Secrets) |
| Löschung (Art. 17) | *Konto & Daten → Konto endgültig löschen* (Bestätigung per E-Mail-Eingabe): löscht Konto, Analysen, Reports, gespeicherte Bilder, API-Keys, Credits |
| Datenminimierung (Art. 5, 25) | Bilder werden nicht gespeichert; EXIF/GPS wird vor der Übermittlung entfernt (per Test abgesichert); API-Keys nur als Hash; IP-Adressen nur 10 Min im Arbeitsspeicher |
| Sicherheit (Art. 32) | Row Level Security, Service-Key nur serverseitig, Passwörter gehasht (Supabase), CSRF-Schutz, Rate-Limits |

## Was du erledigen musst (Pflicht vor dem ersten Tester)

1. **Angaben eintragen** – lokal in `.env.local`, später beim Hosting als Variablen:
   ```
   LEGAL_OPERATOR_NAME=Vorname Nachname
   LEGAL_ADDRESS=Straße Nr. | PLZ Ort | Deutschland
   LEGAL_EMAIL=kontakt@deine-domain.de
   LEGAL_HOSTING=Anbieter, Sitz – Serverstandort (z. B. „Railway Corp., USA – Server in der EU“)
   LEGAL_DATABASE=Supabase Inc., USA – Server in Frankfurt (EU)
   ```
   Solange Name, Anschrift oder E-Mail fehlen, zeigen Impressum und Datenschutzerklärung einen gelben Warnhinweis. Eine ladungsfähige Anschrift ist Pflicht; ein Postfach genügt nicht.
2. **Auftragsverarbeitungsverträge (Art. 28 DSGVO)** abschließen bzw. akzeptieren und ablegen:
   - **Anthropic:** Data Processing Addendum (Teil der Commercial Terms der API; enthält die EU-Standardvertragsklauseln). Im Console-Konto prüfen, dass es für deine Organisation gilt.
   - **Supabase:** DPA im Dashboard unter *Organization → Legal Documents* anfordern/unterzeichnen.
   - **Hosting-Anbieter** (z. B. Railway): dessen DPA akzeptieren.
3. **Serverstandorte:** Supabase-Projekt in der EU (Frankfurt); beim Hosting eine EU-Region wählen. Log-Aufbewahrung beim Hosting auf **höchstens 30 Tage** prüfen (so steht es in der Datenschutzerklärung).
4. **Testerkonten von Hand angelegt?** Dann haben diese Tester nicht selbst per Checkbox zugestimmt. Schicke ihnen mit den Zugangsdaten die Links zu `/beta-bedingungen` und `/datenschutz` und lass dir die Kenntnisnahme per E-Mail bestätigen.
5. **Verzeichnis der Verarbeitungstätigkeiten (Art. 30)** – kurz schriftlich festhalten (eine Seite genügt):

   | Tätigkeit | Daten | Zweck / Rechtsgrundlage | Empfänger | Löschung |
   |---|---|---|---|---|
   | Beta-Konten | E-Mail, Passwort-Hash, Zustimmung | Teilnahme, Art. 6 (1) b | Supabase | Kontolöschung, spätestens 3 Monate nach Beta-Ende |
   | Bildanalyse | Bilder (flüchtig), Reports, Dateinamen | Analyse, Art. 6 (1) b | Anthropic (USA, SCC) | Bilder nicht gespeichert; Reports bei Löschung |
   | API-Keys / Credits | Key-Hash, Buchungen | Teilnahme, Art. 6 (1) b | Supabase | mit dem Konto |
   | Server-Logs | IP, Zeit, URL, User-Agent | Betrieb/Sicherheit, Art. 6 (1) f | Hosting | ≤ 30 Tage |
6. **Datenpanne:** Bei einer Verletzung des Schutzes personenbezogener Daten binnen **72 Stunden** die zuständige Aufsichtsbehörde informieren (Art. 33). Ansprechpartner und Ablauf vorab notieren.
7. **Ende des Beta-Tests:** Konten und Daten spätestens 3 Monate danach löschen (z. B. Nutzer im Supabase-Dashboard löschen; Analysen, Keys und Credits werden kaskadierend mitgelöscht, Archivbilder vorher im Storage-Bucket `analysis-images`).

## Erst für einen kommerziellen Start nötig

- Gewerbeanmeldung, steuerliche Erfassung; im Impressum ggf. USt-IdNr.
- AGB mit Preisen, Leistungsbeschreibung, Widerrufsbelehrung und Muster-Widerrufsformular (Verbraucher), Preisangaben nach PAngV, Zahlungsanbieter in der Datenschutzerklärung
- Anwaltlich geprüfte Texte; ggf. Datenschutz-Folgenabschätzung, falls in großem Umfang Bilder von Personen verarbeitet werden
- Bei Zahlungs- oder Abo-Funktionen: Kündigungsbutton (§ 312k BGB)

Wenn sich Datenflüsse ändern (neuer Dienstleister, Bilder werden doch gespeichert, Analytics, neue Cookies), müssen `app/datenschutz/page.tsx` und diese Checkliste mit angepasst werden.
