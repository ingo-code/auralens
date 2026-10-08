# AuraLens – Projektstatus (Stand 09.10.2026)

> **Übergabedokument für eine externe Gesamtanalyse (z. B. Gemini).** Es beschreibt, was existiert, was nachweislich funktioniert (mit Messwerten), welche Architekturentscheidungen getroffen wurden und was bis zum marktreifen Produkt fehlt. Bitte auf dieser Basis prüfen, kritisieren und einen priorisierten Fahrplan erstellen. Die Fragen stehen in Abschnitt 8. Ergänzende Dokumente: `docs/market-strategy-2026.md` (Markt, Preise, Marketing), `docs/API-v1.md` (öffentliche API), `docs/API.md` (Report-Aufbau).

## 0. Neu seit der letzten Analyse (08.10. → 09.10.2026)

**Ausgangslage:** Die Web-Oberfläche nutzte noch die alten synchronen Routen. Serien aus der UI wurden nicht gespeichert, verbrauchten keine Credits, und die Seite wartete ca. 1 Minute ohne Rückmeldung.

**Umgesetzt:**
1. **UI vollständig auf API v1:** Startseite und `/serie` starten Analysen per `POST /api/v1/analyses` (Sitzungs-Cookie), erhalten sofort `202` + ID und fragen alle 2,5 s `GET /api/v1/analyses/{id}` ab. Kurze Netzaussetzer werden toleriert (Abbruch erst nach 5 Fehlschlägen in Folge, die Analyse läuft serverseitig weiter). Laufende Analysen überleben ein Neuladen (`?analysis=<id>`) und lassen sich „im Hintergrund weiterlaufen“. Ein Idempotency-Key pro Bildauswahl verhindert Doppelabbuchungen beim erneuten Senden.
2. **Echter Live-Fortschritt (Backend-Erweiterung):** Die drei parallelen Claude-Teile einer Serie melden ihren Abschluss einzeln (`analyzeSeries(…, onPartComplete)` → SQL-Funktion `complete_analysis_step`, Migration `20261009090000_analysis_progress.sql`). Die API liefert neu `progress: { steps, completedSteps }`. Die UI hakt Upload → Serverstart → Konsistenz / Markt / Prompts (parallel) → Zusammenführen einzeln ab; geschätzt wird nur das Vorrücken des Balkens innerhalb eines laufenden Schritts.
3. **Credits in der UI:** Guthaben-Anzeige in der Navigation (gemeinsamer Client-Store, aktualisiert nach Start, Abschluss und An-/Abmelden), Kostenhinweis vor dem Start, modaler Dialog „Beta-Guthaben aufgebraucht“ bei `402`. Analysen erfordern jetzt ein Konto; Abgemeldete sehen einen Anmelde-Hinweis.
4. **Fehlerbehandlung:** Neuer Browser-Client `lib/api-client.ts` setzt RFC-9457-Antworten in Meldungen um (Server-`detail` in der Sprache des Nutzers, sonst Fallback-Text pro Fehlercode; HTML-Fehlerseiten von Proxys und Netzwerkfehler werden ebenfalls abgefangen).
5. **Dashboard:** listet Serien und Einzelbilder der API v1 (Palette als Vorschau, Status, Löschen mit Bestätigung) plus Alt-Einträge als „Archiv“. **Neue Detailansicht** `/dashboard/analyses/{id}` mit vollem Report; laufende Analysen sind dort live verfolgbar.
6. **Aufgeräumt:** synchroner Serien-Client entfernt; Fortschrittskomponente neu (`components/analysis/`); Hook `lib/use-analysis-job.ts` kapselt Start/Polling/Fortsetzen.

**Verifiziert:** 164 Tests in 24 Dateien grün (nach Abschaltung der Alt-Routen; deren Analyse-Logik ist jetzt direkt an den Services getestet) (neu u. a.: API-Client inkl. Polling-Wiederholungen und Abbruch, Fortschrittsanzeige, Integrationstest der Serien-Seite mit simuliertem Backend: Upload → 202 → Teilschritte → Report, 402-Dialog, Fehlertext, Fortsetzen per URL, Abgemeldet-Hinweis); `tsc`, ESLint, `next build` sauber; Migration auf lokalem Supabase angewendet, Rechte geprüft (`anon` darf `complete_analysis_step` nicht aufrufen).

**Live verifiziert (09.10.2026, echter Stack + Claude):** Serie mit 2 Bildern über den UI-Weg (Sitzungs-Cookie): 202 sofort, Fortschritt real gemeldet – 28 s Prompts fertig, 41 s Konsistenz, 51 s komplett; Dashboard listet die Serie, Detailansicht rendert den Report, Guthaben 20 → 18. Alte Routen antworten live mit `410`. **Noch offen:** ein manueller Klicktest im Browser.

**Bitte besonders prüfen:** (a) UX des Fortschritts bei 40–60 s Laufzeit und ob Teil-*Inhalte* (z. B. Prompts vor dem Rest) den Mehraufwand wert sind; (b) ob die Abschaltung der alten anonymen Routen (jetzt `410 Gone`) vollständig ist oder weitere Kostenpfade existieren; (c) Polling (2,5 s) vs. Server-Sent Events bei vielen gleichzeitigen Nutzern.

## 1. Produkt in einem Satz

KI-gestützter Stil- und Konsistenz-Analyst für Fotografen: Einzelbild oder Serie (2–10 Bilder) hochladen → Claude Vision liefert Stil, Farbpalette, **Konsistenz-Bewertung der Serie mit konkreten Korrekturwerten für Ausreißer**, Dramaturgie, Markt-Fit, Stock-SEO und Prompts für vier Bild-KIs. Exporte: 1-Click-Copy, Tailwind-Tokens, Adobe-Stock-CSV. Alles ist zusätzlich über eine öffentliche API mit API-Keys und Credits nutzbar.

**Positionierung:** Keyword-Tools (AutoKeyWorder, Noamax, Pixify) beschriften Einzelbilder für 0–0,04 $ pro Bild. AuraLens prüft, ob eine Serie *zusammenpasst*, und sagt, wie man den Ausreißer korrigiert. Zielgruppe: Kampagnen-, Produkt- und Stock-Fotografen, KI-Serien-Creator, Agenturen. Details und Preismodell in `docs/market-strategy-2026.md`.

## 2. Tech-Stack

- Next.js 16.3 (App Router, Turbopack, `proxy.ts` statt Middleware, `after()` für Hintergrundarbeit), React 19.2, TypeScript, Tailwind CSS v4
- Anthropic Claude API (Vision) über `@anthropic-ai/sdk`, Structured Outputs mit Zod (`messages.parse` / `messages.stream` + `zodOutputFormat`); Modell per `ANTHROPIC_MODEL`, Default `claude-opus-5`
- Supabase: Auth (E-Mail + Passwort), Postgres mit Row Level Security, privater Storage-Bucket; **Service-Role-Key nur für die Public API** (siehe 5.1)
- `sharp` für Bildnormalisierung (max. 1568 px, JPEG q82)
- Vitest + React Testing Library; GitHub-Actions-Workflow (Lint, Typecheck, Tests, Build, Docker-Build)
- Docker Multi-Stage-Build (`standalone`), `docker-compose.yml`
- UI zweisprachig (DE/EN, Cookie + `?lang=`), Wörterbücher typgeprüft identisch

## 3. Funktionsumfang

### 3.1 Web-Oberfläche
- **Einzelbild** (`/`, `POST /api/analyze`): Stil, Palette (3–6 Hex), Emotionen, 4 Plattform-Prompts, Stock-SEO (Kategorie, Titel, Beschreibung, 25 Keywords); Speicherung in der Historie, wenn angemeldet. Funktioniert auch anonym (IP-Rate-Limit).
- **Serie** (`/serie`, `POST /api/analyze/series`): drei parallele, gestreamte Claude-Aufrufe (Konsistenz | Markt & Stock | Prompts), serverseitig zusammengeführt und plausibilisiert. Sortieren/Gruppieren deterministisch ohne Claude (`POST /api/series/organize`). JSON-Export.
- **Prompt-Engine** (`lib/prompt-engine.ts`), Versionsstand Oktober 2026: Midjourney V8.2 (`--ar` aus echten Pixelmaßen, `--raw --v 8.2`), FLUX.2/FLUX 3 (Motiv zuerst, Hex-Farben am Objekt, kein Negativ-Prompt; Negativ nur für SDXL), Adobe Firefly Image 5 (ohne Marken/Künstler), ChatGPT Images 2.5 (natürlichsprachig, Seitenverhältnis im Text).
- **Exporte:** Prompts (Plattform-Umschalter), Tailwind v4/v3-Tokens, Adobe-Stock-CSV.
- **Web-UI nutzt die API v1** (seit 09.10.2026): Startseite und `/serie` starten Analysen asynchron über `POST /api/v1/analyses` (Sitzungs-Cookie), fragen alle 2,5 s den Status ab und zeigen **echten Fortschritt**: Die drei parallelen Serien-Teile werden einzeln abgehakt, sobald der Server sie meldet (`progress.completedSteps`). Laufende Analysen überleben ein Neuladen (`?analysis=<id>`) und können „im Hintergrund weiterlaufen“. Analysen erfordern ein Konto (Beta: 20 Credits); Abgemeldete sehen einen Anmelde-Hinweis.
- **Credits in der UI:** Guthaben-Anzeige in der Navigation (aktualisiert sich nach Start und Abschluss), Kosten-Hinweis vor dem Start, Dialog „Beta-Guthaben aufgebraucht“ bei `402`; alle RFC-9457-Fehler erscheinen als verständliche Meldung (Server-`detail`, sonst Fallback-Text pro Fehlercode).
- **Dashboard** (`/dashboard`): Serien und Einzelbilder aus der API v1 (Palette als Vorschau, Status, Löschen) plus ältere Einträge als „Archiv“; **Detailansicht `/dashboard/analyses/{id}`** mit vollem Report, laufende Analysen dort live verfolgbar. `/dashboard/api`: API-Keys, Guthaben, Schnellstart.

### 3.2 Public API v1 (neu, `docs/API-v1.md`)
| Endpunkt | Zweck |
|---|---|
| `POST /api/v1/analyses` | 1 Bild = Einzelbild, 2–10 = Serie; antwortet sofort `202` + ID, Analyse läuft im Hintergrund |
| `GET /api/v1/analyses` | Liste ohne Reports, Keyset-Pagination per Cursor, Filter `status`/`type` |
| `GET /api/v1/analyses/{id}` | Status + Report; Serien zusätzlich sortiert/gruppiert per `?sort=&order=&group=` |
| `DELETE /api/v1/analyses/{id}` | Löschen |
| `GET /api/v1/usage` | Guthaben + Limits |
| `GET/POST /api/v1/api-keys`, `DELETE …/{id}` | Key-Verwaltung, **nur mit Browser-Sitzung** |

Eigenschaften:
- **Auth:** `Authorization: Bearer al_live_…` (256-bit-Zufall, gespeichert nur als SHA-256), Scopes `analyses:read`/`analyses:write`. Alternativ das Sitzungs-Cookie der eigenen Web-App, mit Origin-Prüfung bei schreibenden Requests.
- **Credits:** 1 Credit = 1 Bild, Reservierung atomar beim Start (SQL-Funktion mit Advisory-Lock), automatische Erstattung bei Fehlschlag (höchstens einmal). Neue Konten: 20 Beta-Credits per Trigger.
- **Idempotenz:** `Idempotency-Key`-Header; eine Wiederholung liefert die bestehende Analyse (`200`, `Idempotent-Replayed: true`), derselbe Key mit anderen Bildern `409`. Auch das Rennen zweier paralleler Anfragen ist abgefangen.
- **Fehler:** RFC 9457 (`application/problem+json`) mit stabilem `code`, lokalisiertem `detail`, `requestId` (auch als `X-Request-Id` und im Server-Log).
- **Limits:** `RateLimit-*`-Header, 30 Starts/10 min, 300 Lesezugriffe/min, max. 5 aktive Analysen pro Konto, max. 4 gleichzeitige Analysen pro Server-Prozess (Warteschlange).
- **Datenschutz:** Bilder werden für API-Analysen **nicht gespeichert**, nur während der Analyse im Speicher gehalten; gespeichert werden Report und Datei-Metadaten.
- **Ausfallsicherheit:** Durch einen Serverneustart verwaiste Jobs werden beim nächsten Abruf als `processing_interrupted` markiert und erstattet.

## 4. Qualitätsstand (verifiziert am 08.10.2026)

| Prüfung | Ergebnis |
|---|---|
| Unit-/Route-/Komponenten-Tests (Vitest) | **24 Dateien, 164 Tests, alle grün** (Anthropic/Supabase gemockt), darunter ein Integrationstest der Serien-Seite: Upload → 202 → Polling mit Teilschritten → Report, 402-Dialog, Fehlertext, Fortsetzen per URL, Abgemeldet-Hinweis |
| `tsc --noEmit`, ESLint, `next build` | sauber |
| SQL-Migration API v1 | in eingebettetem Postgres (PGlite) durchgespielt **und** auf echtem lokalem Supabase angewendet: Reservierung, Überziehungsschutz, Idempotenz-Unique, Einmal-Erstattung, Erkennung hängender Jobs, Rechte (`anon`/`authenticated` dürfen die Funktionen nicht aufrufen) |
| **End-to-End gegen echten Stack** (Produktions-Build + lokales Supabase + echte Claude-API) | **44/44 Prüfungen bestanden:** Auth/Fehlerformat, Key-Lebenszyklus (nur Hash in der DB), Scopes, CSRF-Schutz, Einzelbild + Serie, Idempotenz-Replay und -Konflikt, Credits (Reservierung, 402 ohne Abbuchung, Erstattung), Pagination, manipulierter Cursor, Mandantentrennung (fremde Analyse = 404), Widerruf, Legacy-Route |
| Prompt-Qualität real | Midjourney-Prompt endet korrekt mit `--ar 3:2 --raw --stylize 150 --v 8.2` |
| Serien-Konsistenz real | Testserie mit absichtlich warmem Bild: Scores 92 / **18** / 84, Ausreißer korrekt erkannt; Korrekturvorschlag „Temperatur ca. −1400 K, Tint ca. −8 Richtung Grün; anschließend Grauabgleich auf den Sand setzen“ |
| `/dashboard/api` | serverseitig mit echter Sitzung geprüft (DE/EN, Umleitung ohne Login); **kein Klicktest im Browser** (Browser-Automatisierung war nicht verfügbar) |
| UI-Anbindung an API v1 (09.10.) | 164 Tests + `next build` grün; Migration angewendet; **live mit echtem Claude-Aufruf geprüft** (Fortschritt 28 s → 41 s → 51 s, Dashboard + Detailansicht, Credits); Browser-Klicktest steht aus |

**Gemessene Kosten und Latenz** (`claude-opus-5`, 5 $/25 $ pro Mio. Tokens):
- Serie, 3 Bilder: 44 s; Teile Konsistenz 6,1k/3,0k, Markt 6,1k/2,6k, Prompts 5,8k/1,4k Tokens (Input/Output) → zusammen **18,0k In / 6,9k Out ≈ 0,26 $**
- Einzelbild: 34 s; Tokens nicht geloggt (Lücke, s. 6), geschätzt ≈ 0,08 $

## 5. Architekturentscheidungen zur Prüfung

1. **Service-Role-Key für die Public API.** Requests mit API-Key haben keine Supabase-Sitzung, RLS greift daher nicht. Lösung: Service-Role-Client nur in `lib/api/repository.ts`; jede Abfrage filtert ausdrücklich nach `user_id`; die SQL-Funktionen sind für `anon`/`authenticated` gesperrt. Die Web-UI läuft weiter mit Nutzerrechten. Verworfene Alternative: Security-Definer-RPCs mit Key-Hash als Parameter (deutlich komplexer, Storage nicht abdeckbar).
2. **Jobs im Webserver-Prozess statt separatem Worker.** Ausführung über Next.js `after()` mit Semaphore (4 parallel). Einfach und für einen einzelnen Docker-Container ausreichend. Grenzen: Ein Neustart bricht laufende Jobs ab (werden erstattet); horizontale Skalierung und Serverless mit kurzen Timeouts brauchen später eine echte Queue (z. B. pgmq/pg-boss + Worker).
3. **Credits pro Bild statt pro Analyse**, damit Serien mit 10 Bildern kein Verlustgeschäft werden (Begründung in `market-strategy-2026.md`).
4. **Die Web-Oberfläche ist selbst API-Client** (seit 09.10.): Sie nutzt dieselben `/api/v1`-Endpunkte wie Integrationen, authentifiziert per Sitzungs-Cookie. Fortschritt per Polling (2,5 s) statt Server-Sent Events – einfacher und robust hinter Proxys, erzeugt aber mehr Requests.
5. **Interne JSON-Schlüssel `flux`/`dalle3` bleiben stabil**, obwohl die Modelle heute FLUX.2/3 und ChatGPT Images 2.5 heißen (Abwärtskompatibilität).

## 6. Bekannte Lücken bis zum fertigen Produkt

**Betrieb**
- Git-Repo vorhanden (7 Commits), aber **kein Remote** und **57 nicht committete Änderungen** – der CI-Workflow läuft deshalb nirgends
- Kein Hosting, Supabase nur lokal; Hosting muss Requests bzw. Hintergrundarbeit von 1–5 Minuten erlauben
- Rate-Limits nur im Speicher pro Prozess (für mehrere Instanzen: Redis/Upstash)
- Kein Error-Tracking/Monitoring; Einzelbild-Analysen loggen keine Token-Zahlen
- `next start` warnt wegen `output: standalone` (Produktion: `node .next/standalone/server.js` bzw. Docker)

**Produkt**
- **Keine Bezahlung:** Das Credit-System existiert, Credits gibt es aber nur als Beta-Startguthaben (Kauf/Abo fehlt; laut Strategie erst nach Gewerbeanmeldung)
- ~~Offene Kostenlücke der alten anonymen Routen~~ – **geschlossen am 09.10.2026:** `POST /api/analyze` und `/api/analyze/series` antworten nur noch mit `410 Gone` (RFC 9457, Verweis auf `/api/v1/analyses`), lesen keinen Body und rufen Claude nie auf. Jede Analyse braucht jetzt Konto + Credits.
- Fortschritt zeigt erledigte Teilschritte, aber noch keine Teil-*Inhalte* (z. B. Prompts vor dem Rest); Vorschaubilder gibt es nur in der Sitzung, in der hochgeladen wurde (API speichert keine Bilder)
- Alte Einzelanalysen (Tabelle `analyses`) haben keine Detailansicht und teils noch das Feld `imagePrompt`
- Kein Lightroom-`.xmp`-Export der Korrekturen (stärkstes potenzielles Alleinstellungsmerkmal), kein Shutterstock-CSV
- Keine Landingpage mit Positionierung, kein Onboarding, **keine Rechtstexte** (Impressum, Datenschutz, AGB/API-Bedingungen, AV-Vertrag; Bilder gehen an einen US-Dienst), keine Löschfristen
- Kostenloser Köder aus der Strategie (Paletten-Tool, Serien-Quick-Check ohne Claude) noch nicht gebaut

**Phase 2/3 der API (geplant)**
- OpenAPI-3.1-Spezifikation aus den Zod-Schemas, interaktive Doku-Seite, generierte SDKs
- Test-Keys (`al_test_…`) mit festen Antworten ohne Claude-Kosten
- Export-Endpunkte (CSV, Tailwind, XMP), signierte Webhooks (`analysis.completed`), Upload per URL
- MCP-Server, n8n/Make/Zapier, Lightroom-Plugin

**Technische Schulden**
- `CLAUDE.md` nennt noch „Claude 3.5 Sonnet“ (tatsächlich `claude-opus-5`, konfigurierbar)
- Kein Prompt-Caching, keine Modellwahl pro Teil (Kostenhebel laut Strategie ca. −45 %)
- Keine Browser-E2E-Tests (Playwright); die API-E2E-Skripte lagen nur im Scratchpad und sind nicht im Repo

## 7. Wichtige Dateien

```
app/api/v1/…                     Public API v1 (Routen)
lib/api/{auth,errors,handler,repository,jobs,resources,pagination,limits}.ts
lib/services/{image-analysis,series-analysis}.ts   Claude-Aufrufe (geteilt von UI und API)
lib/prompt-engine.ts             Plattform-Prompts + Seitenverhältnis
supabase/migrations/20261008120000_api_v1.sql   Keys, Jobs, Credit-Ledger, SQL-Funktionen
supabase/migrations/20261009090000_analysis_progress.sql   Live-Fortschritt pro Teilschritt
lib/api-client.ts · lib/use-analysis-job.ts · lib/credits-store.ts   Browser-Seite der API v1
components/analysis/…            Fortschritt, Credits-Dialog, Statushinweise, Detailansicht
app/dashboard/analyses/[id]/page.tsx   Report-Detailansicht
docs/API-v1.md · docs/API.md · docs/market-strategy-2026.md
```

## 8. Fragen an die Analyse

1. **Sicherheit:** Hält das Modell „Service-Role-Key + explizite `user_id`-Filter + gesperrte SQL-Funktionen“ einer Prüfung stand? Fehlen Schutzmaßnahmen (z. B. Key-Rotation, IP-Allowlists, Audit-Log)?
2. **Skalierung:** Ab welcher Last muss die In-Process-Ausführung (`after()` + Semaphore) einer echten Queue weichen, und welche (pgmq, pg-boss, Inngest, Trigger.dev) passt zu Supabase + Docker?
3. **Reihenfolge:** Alt-Routen schließen, Bezahlung, Rechtstexte, Hosting, `.xmp`-Export, Gratis-Köder: Was führt am schnellsten zu zahlenden Nutzern?
4. **Kosten:** Bei gemessenen ≈ 0,26 $ für 3 Bilder: Welche Kombination aus Modellwahl pro Teil (Opus 5.5 / Sonnet 5.5), Prompt-Caching und kürzeren Schemas senkt die Kosten, ohne die Konsistenz-Erkennung zu verschlechtern? Wie misst man die Qualität (Eval-Set)?
5. **API-Design:** Sind Ressourcenmodell, Fehlercodes, Idempotenz und Pagination für Integratoren (n8n, Lightroom-Plugin, Agenturen) so richtig, bevor die Version eingefroren wird?
6. **DSGVO:** Was ist zwingend nötig, wenn Nutzer Bilder mit Personen an einen US-KI-Dienst senden (AV-Vertrag, Drittlandtransfer, Löschfristen, Hinweise im Upload)?
