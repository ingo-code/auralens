# AuraLens

Ein KI-gestützter visueller Stil- und Storytelling-Analyst für Fotografen und Kreative. Bild hochladen → Claude Vision liefert einen strukturierten Report: visueller Stil, Farbpalette (Hex-Codes), vermittelte Emotionen und einen auf möglichst fotorealistische, originalgetreue Rekonstruktion ausgelegten Bild-Prompt für ChatGPT (kostenlos mit Login nutzbar). Angemeldete Nutzer:innen bekommen jede Analyse automatisch in einer persönlichen Historie gespeichert.

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
app/api/analyze/route.ts       POST: Validierung → Rate-Limit → Kompression → Claude Vision → Report → Persistenz (falls angemeldet)
app/api/analyses/[id]/route.ts DELETE: entfernt eine gespeicherte Analyse (Bild + DB-Zeile)
proxy.ts                       Next.js Proxy (ehem. Middleware) - hält Supabase-Session-Cookies aktuell
lib/analysis-schema.ts         Zod-Schema für den strukturierten Report (Single Source of Truth für Typen)
lib/image-processing.ts        Bildkompression/-normalisierung via sharp vor dem API-Call
lib/rate-limit.ts              In-Memory Rate-Limiter (pro IP, fixed window)
lib/analyses.ts                Speichert Bild (Storage) + Report (DB) für angemeldete Nutzer:innen
lib/supabase/client.ts         Supabase-Client für Client Components
lib/supabase/server.ts         Supabase-Client für Server Components/Route Handler (cookie-basiert)
supabase/migrations/           SQL-Migrationen: `analyses`-Tabelle, RLS-Policies, Storage-Bucket
components/                    ImageDropzone, AnalysisReport, AuthStatus, DeleteAnalysisButton
```

Der Report wird über `client.messages.parse()` mit `output_config.format` (Zod-Schema) angefordert — die Antwort kommt bereits typsicher geparst zurück, kein manuelles JSON-Parsing/Validieren nötig.

**Persistenz ist additiv, nicht verpflichtend:** Die Analyse funktioniert für alle, auch ohne Login (Rate-Limit pro IP schützt vor Missbrauch). Ist man angemeldet, wird das Ergebnis automatisch gespeichert — kein separater "Speichern"-Schritt nötig.

## Setup

### 1. Supabase (lokal, kein Account nötig)

```bash
npx supabase start   # zieht Postgres/Auth/Storage/Studio als Docker-Container
```

Gibt `API_URL`, `ANON_KEY` etc. aus. Studio-UI zum Daten-Anschauen: [http://127.0.0.1:54323](http://127.0.0.1:54323)

Für ein **gehostetes** Supabase-Projekt stattdessen: Projekt auf [supabase.com](https://supabase.com) anlegen, unter Settings → API die URL/Anon-Key holen, und die Migration in `supabase/migrations/` im SQL-Editor des Projekts ausführen (oder `npx supabase link` + `npx supabase db push`).

### 2. App

```bash
cp .env.local.example .env.local
# ANTHROPIC_API_KEY, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY eintragen
npm install
npm run dev
```

→ [http://localhost:3000](http://localhost:3000)

Ohne `ANTHROPIC_API_KEY` läuft die App, aber `/api/analyze` liefert eine kontrollierte Fehlermeldung statt eines Reports. Ohne Supabase-Konfiguration funktioniert die Analyse weiterhin (anonym, ohne Speicherung) — nur Login/Dashboard sind dann nicht nutzbar.

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

- **Rate-Limiting:** `ANALYZE_RATE_LIMIT` (Default 10) Requests pro `ANALYZE_RATE_LIMIT_WINDOW_MS` (Default 10 Min) pro Client-IP. In-Memory, also pro Prozess — für Mehrinstanz-Deployments durch einen geteilten Store (z. B. Upstash/Redis) ersetzen.
- **Bildkompression:** Jeder Upload wird vor dem API-Call auf max. 1568px Kantenlänge verkleinert und als JPEG (Qualität 82) normalisiert — reduziert Token-Kosten und Latenz bei großen Fotos.
- **Row Level Security:** Jede Nutzerin sieht/ändert ausschließlich eigene Zeilen in `analyses` und eigene Objekte im `analysis-images`-Bucket (Pfad-Präfix `${user_id}/...`). Kein Service-Role-Key im Einsatz — die App läuft komplett mit Nutzer-Rechten (Least Privilege).
- **Persistenz ist best-effort:** Schlägt das Speichern fehl (z. B. Supabase down), bricht die Analyse-Antwort nicht ab — der Report wird trotzdem zurückgegeben, der Fehler nur geloggt.
- **CI:** GitHub Actions (`.github/workflows/ci.yml`) führt bei jedem Push/PR Lint, Typecheck, Tests und Docker-Build aus.

## Weitere Doku

- [Next.js Dokumentation](https://nextjs.org/docs)
- [Anthropic API Dokumentation](https://docs.anthropic.com)
- [Supabase Dokumentation](https://supabase.com/docs)
