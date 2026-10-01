# AuraLens

Ein KI-gestützter visueller Stil- und Storytelling-Analyst für Fotografen und Kreative. Bild hochladen → Claude Vision liefert einen strukturierten Report: visueller Stil, Farbpalette (Hex-Codes), vermittelte Emotionen und einen einsatzbereiten Midjourney-Prompt.

## Tech Stack

- **Frontend & Backend:** Next.js (App Router), TypeScript, Tailwind CSS
- **KI:** Anthropic Claude API (Vision) mit strukturierten JSON-Outputs (Zod-Schema)
- **Bildverarbeitung:** `sharp` (serverseitige Kompression/Normalisierung vor dem API-Call)
- **Tests:** Vitest + React Testing Library
- **Deployment:** Docker (Multi-Stage-Build, Next.js `standalone` Output)

## Architektur

```
app/page.tsx              Landing Page, Dropzone, Status-Handling
app/api/analyze/route.ts  POST-Endpoint: Validierung → Rate-Limit → Kompression → Claude Vision → Report
lib/analysis-schema.ts    Zod-Schema für den strukturierten Report (Single Source of Truth für Typen)
lib/image-processing.ts   Bildkompression/-normalisierung via sharp vor dem API-Call
lib/rate-limit.ts         In-Memory Rate-Limiter (pro IP, fixed window)
components/               ImageDropzone, AnalysisReport (Darstellung des Reports)
```

Der Report wird über `client.messages.parse()` mit `output_config.format` (Zod-Schema) angefordert — die Antwort kommt bereits typsicher geparst zurück, kein manuelles JSON-Parsing/Validieren nötig.

## Setup

```bash
cp .env.local.example .env.local   # ANTHROPIC_API_KEY eintragen
npm install
npm run dev
```

→ [http://localhost:3000](http://localhost:3000)

Ohne `ANTHROPIC_API_KEY` läuft die App, aber `/api/analyze` liefert eine kontrollierte Fehlermeldung statt eines Reports.

## Mit Docker

```bash
cp .env.local.example .env.local   # ANTHROPIC_API_KEY eintragen
docker compose up -d --build
```

→ [http://localhost:3100](http://localhost:3100) (Port in `docker-compose.yml` anpassbar)

## Tests

```bash
npm run test         # einmalig
npm run test:watch   # Watch-Modus
```

Abgedeckt: Zod-Schema-Validierung, Rate-Limiter-Logik, Dropzone-Verhalten (Dateityp-Validierung, Drag & Drop), API-Route (inkl. Erfolgsfall, Fehlerfall, Rate-Limit-Durchsetzung) mit gemocktem Anthropic-Client.

## Produktions-Hygiene

- **Rate-Limiting:** `ANALYZE_RATE_LIMIT` (Default 10) Requests pro `ANALYZE_RATE_LIMIT_WINDOW_MS` (Default 10 Min) pro Client-IP. In-Memory, also pro Prozess — für Mehrinstanz-Deployments durch einen geteilten Store (z. B. Upstash/Redis) ersetzen.
- **Bildkompression:** Jeder Upload wird vor dem API-Call auf max. 1568px Kantenlänge verkleinert und als JPEG (Qualität 82) normalisiert — reduziert Token-Kosten und Latenz bei großen Fotos.
- **CI:** GitHub Actions (`.github/workflows/ci.yml`) führt bei jedem Push/PR Lint, Typecheck, Tests und Docker-Build aus.

## Weitere Doku

- [Next.js Dokumentation](https://nextjs.org/docs)
- [Anthropic API Dokumentation](https://docs.anthropic.com)
