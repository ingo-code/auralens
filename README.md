# AuraLens

Ein KI-gestützter visueller Stil- und Storytelling-Analyst für Fotografen und Kreative. Bild hochladen → Claude Vision liefert einen strukturierten Report: visueller Stil, Farbpalette (Hex-Codes), vermittelte Emotionen, je einen optimierten Prompt für Midjourney V8.2, FLUX.2/FLUX 3 (plus SDXL-Negativ-Prompt), Adobe Firefly Image 5 und ChatGPT Images 2.5 sowie Stock-SEO (Titel + 25 Keywords). Exporte (1-Click-Copy, Tailwind-Design-Tokens, Adobe-Stock-CSV) liegen in Tabs unter jedem Report. Angemeldete Nutzer:innen bekommen jede Analyse automatisch in einer persönlichen Historie gespeichert.

## Tech Stack

- **Frontend & Backend:** Next.js (App Router), TypeScript, Tailwind CSS
- **KI:** Anthropic Claude API (Vision) mit strukturierten JSON-Outputs (Zod-Schema)
- **Auth, DB & Storage:** Supabase (Postgres + Row Level Security, Auth, Storage)
- **Bildverarbeitung:** `sharp` (serverseitige Kompression/Normalisierung vor dem API-Call)
- **Tests:** Vitest + React Testing Library
- **Deployment:** Docker (Multi-Stage-Build, Next.js `standalone` Output)

## Architektur

```
app/page.tsx                   Landing Page, Dropzone, Status-Handling, Auth-Status
app/login/page.tsx             Anmelden/Registrieren (Supabase Auth, E-Mail+Passwort)
app/dashboard/page.tsx         Analyse-Historie (geschützt, Server Component)
app/api/analyze*/route.ts      Abgeschaltet: 410 Gone mit Verweis auf /api/v1/analyses (früher anonyme Analysen ohne Credits)
app/serie/page.tsx             Serien-Analyse im Browser: Mehrfach-Upload, Fortschritt, Dashboard mit Sortieren/Gruppieren, JSON-Export
app/api/series/organize/route.ts POST: vorhandenen Serien-Report neu sortieren/gruppieren (kein Claude-Aufruf)
app/api/analyses/[id]/route.ts DELETE: entfernt eine gespeicherte Analyse (Bild + DB-Zeile)
app/api/v1/                    Public API v1 (API-Keys, asynchrone Analyse-Jobs, Credits) – siehe docs/API-v1.md
app/dashboard/api/page.tsx     API-Keys erstellen/widerrufen, Credit-Guthaben, Schnellstart
lib/api/                       Auth (Key/Sitzung), RFC-9457-Fehler, Repository (Service-Role, immer user-gefiltert), Job-Queue
lib/services/image-analysis.ts Einzelbild-Analyse mit Claude Vision (geteilt von Web-Route und API v1)
proxy.ts                       Next.js Proxy (ehem. Middleware) - hält Supabase-Session-Cookies aktuell
lib/analysis-schema.ts         Zod-Schema für den strukturierten Report (Single Source of Truth für Typen)
lib/series-analysis-schema.ts  Zod-Schema + Typen der Serienanalyse (Konsistenz, Master-Palette, Dramaturgie, Markt-Fit, Stock-SEO, AI-Prompts)
lib/services/series-analysis.ts Drei parallele, gestreamte Claude-Aufrufe (Konsistenz | Markt & Stock | Prompts), Zusammenführung + Plausibilitätsprüfung
lib/prompt-engine.ts           Multi-Model-Prompt-Schema (Midjourney, FLUX/SDXL, Firefly, ChatGPT Images) + Seitenverhältnis-Erkennung
lib/design-tokens.ts           Palette → Tailwind v4 `@theme` / v3 `tailwind.config.js` (deterministisch, ohne Claude)
lib/stock-export.ts            Adobe-Stock-Contributor-CSV (Filename, Title, Keywords, Category, Releases)
components/exports/ExportTabs.tsx Tabs „Prompts | Design-Token | Stock-SEO“, genutzt von Einzel- und Serienanalyse
lib/series-organize.ts         Sortier-/Gruppierlogik (Kategorie, Dramaturgie, Score, Einstellungsgröße, Auflösung, Format) - geteilt von API und UI
lib/series-api.ts              Öffentliche Request-/Response-Verträge der Serien-API
lib/series-client.ts           Browser-Client für die Serien-API (robust auch bei Nicht-JSON-Antworten)
docs/API-v1.md                 Doku der Public API v1 für Integrationen
docs/API.md                    Interne Web-Routen + Aufbau der Reports
lib/claude/                    Gemeinsamer Anthropic-Client, Modellwahl (`ANTHROPIC_MODEL`), Fehler-Mapping auf HTTP-Status
lib/image-validation.ts        Gemeinsame Dateityp-/Größenprüfung für Uploads
lib/image-processing.ts        Bildkompression/-normalisierung via sharp vor dem API-Call
lib/rate-limit.ts              In-Memory Rate-Limiter (pro IP, fixed window)
lib/analyses.ts                Speichert Bild (Storage) + Report (DB) für angemeldete Nutzer:innen
lib/supabase/client.ts         Supabase-Client für Client Components
lib/supabase/server.ts         Supabase-Client für Server Components/Route Handler (cookie-basiert)
lib/supabase/admin.ts          Service-Role-Client, ausschließlich für die Public API
supabase/migrations/           SQL-Migrationen: `analyses`, Storage-Bucket, API v1 (`api_keys`, `analysis_jobs`, `credit_ledger` + SQL-Funktionen)
components/                    ImageDropzone, AnalysisReport, AuthStatus, DeleteAnalysisButton
```

Der Report wird über `client.messages.parse()` mit `output_config.format` (Zod-Schema) angefordert — die Antwort kommt bereits typsicher geparst zurück, kein manuelles JSON-Parsing/Validieren nötig.

**Serienanalyse in drei Teilen:** Das vollständige Serien-Schema überschreitet das Grammatik-Limit der Structured Outputs (`compiled grammar is too large`). Die Analyse läuft deshalb als drei parallele Requests mit je einem Teil-Schema (`ConsistencyPartSchema`, `MarketPartSchema`, `PromptsPartSchema`), die serverseitig zu einem `SeriesAnalysis`-Report zusammengeführt werden. Schlägt ein Teil fehl, werden die anderen abgebrochen. Pro Teil wird eine Logzeile mit Tokens und Dauer geschrieben (`[series-analysis] ...`). Gemessen am 08.10.2026 (3 Teile, 3 Bilder, `claude-opus-5`): 44 s, zusammen 18,0k Input- und 6,9k Output-Tokens (≈ 0,26 $).

**Zweisprachig (DE/EN):** Die Sprache steht im Cookie `auralens-locale` (Umschalter oben rechts), beim ersten Besuch gilt die Browsersprache, sonst Deutsch. Wörterbücher: `lib/i18n/messages/de.ts` (Referenz) und `en.ts` – TypeScript und ein Test erzwingen identische Schlüssel. Claude schreibt alle Freitexte in der gewählten Sprache; Stock-Metadaten und Bild-Prompts bleiben immer Englisch. API-Clients wählen die Sprache mit `?lang=de|en`.

**Prompt-Engine:** `lib/prompt-engine.ts` definiert ein Schema mit einem Feld pro Plattform; die Feldbeschreibungen enthalten die plattformspezifischen Regeln (z. B. Firefly ohne Marken/Künstler, Midjourney mit `--ar … --raw --v 8.2`, FLUX ohne Negativ-Prompt). Einzelbild = originalgetreue Rekonstruktion, Serie = Stil-Vorlage mit `[subject]`-Platzhalter. Das Seitenverhältnis für `--ar` wird aus den Pixelmaßen des Uploads berechnet, nicht vom Modell geschätzt.

**Persistenz ist additiv, nicht verpflichtend:** Die Analyse funktioniert für alle, auch ohne Login (Rate-Limit pro IP schützt vor Missbrauch). Ist man angemeldet, wird das Ergebnis automatisch gespeichert — kein separater "Speichern"-Schritt nötig.

## Setup

### 1. Supabase (lokal, kein Account nötig)

```bash
npx supabase start   # zieht Postgres/Auth/Storage/Studio als Docker-Container
```

Gibt u. a. `Project URL`, den `Publishable`- und den `Secret`-Key aus (ältere CLI-Versionen: `API_URL` / `ANON_KEY` / `SERVICE_ROLE_KEY`) – diese als `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` bzw. `SUPABASE_SERVICE_ROLE_KEY` (nur für die Public API) eintragen. Neue Migrationen bei schon laufendem Stack: `npx supabase migration up --local`. Studio-UI zum Daten-Anschauen: [http://127.0.0.1:54323](http://127.0.0.1:54323)

Für ein **gehostetes** Supabase-Projekt stattdessen: Projekt auf [supabase.com](https://supabase.com) anlegen, unter Settings → API die URL/Anon-Key holen, und die Migration in `supabase/migrations/` im SQL-Editor des Projekts ausführen (oder `npx supabase link` + `npx supabase db push`).

### 2. App

```bash
cp .env.local.example .env.local
# ANTHROPIC_API_KEY, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY eintragen
npm install
npm run dev
```

→ [http://localhost:3001](http://localhost:3001)

Der Port ist bewusst fest auf **3001** gesetzt (`package.json`), weil 3000 auf Entwicklungsrechnern oft schon belegt ist. Ist 3001 belegt, bricht `npm run dev` mit einer Fehlermeldung ab, statt still auf einen anderen Port auszuweichen. So landen Anfragen nie versehentlich bei einer anderen App.

Analysen brauchen ein Konto und Credits (Beta: 20 pro Konto), also ein laufendes Supabase inklusive `SUPABASE_SERVICE_ROLE_KEY`. Ohne `ANTHROPIC_API_KEY` startet die App, Analysen schlagen dann aber mit einer kontrollierten Fehlermeldung fehl (Credits werden erstattet).

### 3. Serien-Analyse

**Im Browser:** [http://localhost:3001/serie](http://localhost:3001/serie) (oder Link „Serien-Analyse →“ auf der Startseite).

**Per API** (Doku: [`docs/API-v1.md`](docs/API-v1.md)): API-Key unter *Meine Analysen → API & Credits* erstellen, dann z. B. aus PowerShell (`curl.exe`, nicht `curl`):

```powershell
$key = "al_live_…"
$job = curl.exe -s -H "Authorization: Bearer $key" -F images=@bild1.jpg -F images=@bild2.jpg -F images=@bild3.jpg `
  http://localhost:3001/api/v1/analyses | ConvertFrom-Json
# alle paar Sekunden abfragen, bis status = completed
$r = curl.exe -s -H "Authorization: Bearer $key" "http://localhost:3001/api/v1/analyses/$($job.id)?sort=consistency" | ConvertFrom-Json
$r.status; $r.report.images | Select-Object index, consistencyScore, narrativeRole
```

1–10 Bilder (1 = Einzelbild, ab 2 = Serie), 1 Credit pro Bild. Dauer ca. 30–60 s, Kosten ca. 0,26 $ pro 3 Bilder.

## Mit Docker

```bash
npx supabase start                 # falls noch nicht gestartet
cp .env.local.example .env.local   # ANTHROPIC_API_KEY + Supabase-Werte eintragen
docker compose up -d --build
```

→ [http://localhost:3100](http://localhost:3100) (Port in `docker-compose.yml` anpassbar)

**Hinweis Docker-Networking:** `NEXT_PUBLIC_SUPABASE_URL` (z. B. `http://127.0.0.1:54321`) wird zur Build-Zeit in den Browser-Bundle eingebacken und muss vom Host aus erreichbar sein. Der Server-Code *im Container* erreicht ein lokales `supabase start` darüber aber nicht (eigener Netzwerk-Namespace) — dafür überschreibt `SUPABASE_URL=http://host.docker.internal:54321` in `docker-compose.yml` die URL serverseitig. Bei einem gehosteten Supabase-Projekt ist das nicht nötig, einfach `NEXT_PUBLIC_SUPABASE_URL` auf die Projekt-URL setzen.

## Tests

```bash
npm run test         # einmalig
npm run test:watch   # Watch-Modus
```

Abgedeckt: Zod-Schema-Validierung, Rate-Limiter-Logik, Dropzone-Verhalten (Dateityp-Validierung, Drag & Drop), API-Route (inkl. Erfolgsfall, Fehlerfall, Rate-Limit-Durchsetzung) mit gemocktem Anthropic-Client, `saveAnalysis`-Persistenzlogik mit gemocktem Supabase-Client.

Nicht automatisiert getestet (manuell gegen den lokalen Supabase-Stack verifiziert): Auth-Flow (Sign-up/Login/Logout), Routenschutz von `/dashboard`, End-to-End-Persistenz inkl. Storage-Signed-URLs und Löschen — das Mocken von `@supabase/ssr`s cookie-basiertem Server-Client ist deutlich aufwändiger als der Anthropic-Mock und war für den aktuellen Scope nicht im Verhältnis.

## Produktions-Hygiene

- **Upload-Größen:** `next.config.ts` setzt `experimental.proxyClientMaxBodySize: "55mb"`. Ohne diese Einstellung puffert `proxy.ts` nur 10 MB, und größere Uploads kommen abgeschnitten im Route Handler an (nachgewiesen: schon 19 MB scheitern). Die Serien-Route lehnt Requests über 51 MB vorab per `Content-Length` mit 413 ab.
- **Rate-Limiting & Kostenkontrolle:** Analysen nur mit Konto und Credits (1 pro Bild, Erstattung bei Fehlern). Pro Konto 30 Analyse-Starts / 10 Min, max. 5 gleichzeitig (`API_CREATE_RATE_LIMIT`, `API_MAX_ACTIVE_ANALYSES`). In-Memory, also pro Prozess — für Mehrinstanz-Deployments durch einen geteilten Store (z. B. Upstash/Redis) ersetzen.
- **Bildkompression:** Jeder Upload wird vor dem API-Call auf max. 1568px Kantenlänge verkleinert und als JPEG (Qualität 82) normalisiert — reduziert Token-Kosten und Latenz bei großen Fotos.
- **Row Level Security:** Jede Nutzerin sieht/ändert ausschließlich eigene Zeilen in `analyses` und eigene Objekte im `analysis-images`-Bucket (Pfad-Präfix `${user_id}/...`). Die Web-Oberfläche läuft komplett mit Nutzer-Rechten. Nur die Public API (`/api/v1`) nutzt den Service-Role-Key, weil API-Key-Aufrufe keine Supabase-Sitzung haben; jede Abfrage in `lib/api/repository.ts` filtert dort ausdrücklich nach `user_id`, und die SQL-Funktionen sind für `anon`/`authenticated` gesperrt.
- **Persistenz ist best-effort:** Schlägt das Speichern fehl (z. B. Supabase down), bricht die Analyse-Antwort nicht ab — der Report wird trotzdem zurückgegeben, der Fehler nur geloggt.
- **CI:** GitHub Actions (`.github/workflows/ci.yml`) führt bei jedem Push/PR Lint, Typecheck, Tests und Docker-Build aus.

## Weitere Doku

- [Next.js Dokumentation](https://nextjs.org/docs)
- [Anthropic API Dokumentation](https://docs.anthropic.com)
- [Supabase Dokumentation](https://supabase.com/docs)
