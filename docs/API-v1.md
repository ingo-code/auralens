# AuraLens Public API v1

Basis-URL: `https://<host>/api/v1` (lokal `http://localhost:3001/api/v1`). Alle Antworten sind JSON, Feldnamen in camelCase. Die Version steckt im Pfad: Innerhalb von `v1` kommen nur Felder **hinzu**, nichts wird umbenannt oder entfernt.

| Endpunkt | Zweck | Scope | Kosten |
|---|---|---|---|
| `POST /analyses` | Analyse starten (1 Bild = Einzelbild, 2–10 = Serie) | `analyses:write` | 1 Credit pro Bild |
| `GET /analyses` | Analysen auflisten (ohne Report), Cursor-Pagination | `analyses:read` | – |
| `GET /analyses/{id}` | Status + Report, bei Serien sortiert/gruppiert | `analyses:read` | – |
| `DELETE /analyses/{id}` | Analyse löschen | `analyses:write` | – |
| `GET /usage` | Credit-Guthaben und Limits | `analyses:read` | – |
| `GET/POST /api-keys`, `DELETE /api-keys/{id}` | Keys verwalten | nur Browser-Sitzung | – |

## Authentifizierung

```
Authorization: Bearer al_live_…
```

Keys erstellt und widerruft man unter **Dashboard → API & Credits** (`/dashboard/api`). Der Klartext-Key wird genau einmal angezeigt; gespeichert ist nur sein SHA-256-Hash. Scopes: `analyses:read`, `analyses:write`. Die Key-Verwaltung selbst ist absichtlich nur mit Browser-Anmeldung erreichbar: Ein geleakter Key kann keine neuen Keys erzeugen.

Die AuraLens-Weboberfläche nutzt dieselben Endpunkte mit ihrem Sitzungs-Cookie. Schreibende Anfragen mit Cookie werden bei fremder `Origin` abgelehnt.

## Ablauf: asynchrone Analyse

Analysen dauern 30–60 s (Serie mit 10 Bildern bis ca. 3 min). Damit Clients und Proxys nicht in Timeouts laufen, antwortet `POST` sofort mit `202` und einer ID:

```bash
# 1. Starten
curl -H "Authorization: Bearer $AURALENS_KEY" \
     -H "Idempotency-Key: shooting-2026-10-08" \
     -F images=@bild1.jpg -F images=@bild2.jpg -F images=@bild3.jpg \
     https://<host>/api/v1/analyses
# → 202 { "object": "analysis", "id": "…", "status": "queued", "credits": 3, … }
#   Location: /api/v1/analyses/<id>

# 2. Abfragen, bis status "completed" oder "failed" ist (Empfehlung: alle 3–5 s)
curl -H "Authorization: Bearer $AURALENS_KEY" \
     "https://<host>/api/v1/analyses/<id>?sort=consistency&order=asc"
```

PowerShell: `curl.exe` statt `curl` und Zeilenumbrüche mit `` ` ``.

### `POST /analyses`

`multipart/form-data`, Feld `images` ein- bis zehnmal. JPEG, PNG, WEBP, GIF; max. 10 MB pro Bild, 50 MB gesamt. Die Reihenfolge bestimmt die Bildnummern (1-basiert). `?lang=de|en` legt die Sprache der Freitexte im Report fest; Stock-Metadaten und Bild-Prompts sind immer Englisch.

Credits werden beim Start reserviert. Scheitert die Analyse, werden sie **automatisch erstattet**. Ungültige Anfragen (falsches Format, zu groß, kein Bild) kosten nichts.

**`Idempotency-Key`** (optional, 1–255 Zeichen, empfohlen): Wiederholt ein Client nach einem Netzwerkfehler dieselbe Anfrage mit demselben Key, gibt es **keine** zweite Analyse und keine zweite Abbuchung, sondern `200` mit der bestehenden Analyse und dem Header `Idempotent-Replayed: true`. Derselbe Key mit anderen Bildern ergibt `409 idempotency_conflict`. Keys gelten pro Konto dauerhaft.

### Das `analysis`-Objekt

```jsonc
{
  "object": "analysis",
  "id": "17be18f5-4697-41a9-bf65-a1a3bc04cdb6",
  "type": "series",                 // "image" | "series"
  "status": "completed",            // "queued" | "running" | "completed" | "failed"
  "imageCount": 3,
  "credits": 3,
  "locale": "de",
  "files": [{ "index": 1, "name": "bild1.jpg", "width": 6000, "height": 4000,
              "megapixels": 24, "orientation": "landscape", "stockResolutionOk": true }],
  "createdAt": "2026-10-08T14:20:11.512+00:00",
  "startedAt": "…", "completedAt": "…",
  "error": null,                    // bei "failed": { "code": "…", "message": "…" }
  "progress": {                     // Live-Fortschritt
    "steps": ["consistency", "market", "prompts"],      // Serie; Einzelbild: ["analysis"]
    "completedSteps": ["prompts"]                       // parallel, Reihenfolge beliebig
  },
  "report": { … },                  // nur bei GET /analyses/{id}; Aufbau siehe docs/API.md
  "organization": { … }             // nur bei abgeschlossenen Serien
}
```

`report` hat für `type: "image"` den Aufbau der Einzelbild-Analyse (`style`, `colorPalette`, `emotions`, `prompts`, `stock`), für `type: "series"` den der Serien-Analyse (`series`, `consistency`, `narrative`, `masterPalette`, `market`, `aiPrompts`, `images`). Beide sind in [API.md](API.md) beschrieben.

**`organization`** (nur Serien): `GET /analyses/{id}` nimmt dieselben Query-Parameter wie die Web-Oberfläche – `sort` (`upload`, `story`, `consistency`, `category`, `shot`, `resolution`), `order` (`asc`, `desc`), `group` (`none`, `category`, `role`, `shot`, `orientation`, `stock_ready`) – und liefert `sortedIndices` plus `groups`. Neu sortieren kostet nichts.

**`error.code`** bei `failed` (Credits sind dann bereits erstattet):

| Code | Bedeutung |
|---|---|
| `content_refused` | Die KI hat die Analyse der Bilder abgelehnt |
| `analysis_truncated` | Antwort zu lang – weniger Bilder schicken |
| `invalid_ai_response` | Ungültige KI-Antwort – erneut versuchen |
| `image_not_processable` | Bild vom KI-Dienst nicht verarbeitbar |
| `upstream_rate_limited` / `upstream_unavailable` | KI-Dienst überlastet/nicht erreichbar – später erneut |
| `processing_interrupted` | Serverneustart während der Analyse |
| `internal_error` | Sonstiger Serverfehler |

### `GET /analyses`

Neueste zuerst, ohne `report`. Query: `limit` (1–100, Standard 20), `cursor` (aus `nextCursor` der vorigen Seite), optional `status`, `type`.

```json
{ "object": "list", "data": [ { "object": "analysis", … } ], "hasMore": true, "nextCursor": "WyIyMDI2…" }
```

### `GET /usage`

```json
{ "object": "usage",
  "credits": { "balance": 16, "costPerImage": 1 },
  "limits": { "maxImagesPerAnalysis": 10, "maxImageBytes": 10485760,
              "maxTotalUploadBytes": 52428800, "maxActiveAnalyses": 5 } }
```

Neue Konten starten in der Beta mit 20 Credits.

## Fehler

Alle Fehler kommen als `application/problem+json` nach RFC 9457:

```json
{
  "type": "urn:auralens:error:insufficient_credits",
  "title": "Insufficient credits",
  "status": 402,
  "code": "insufficient_credits",
  "detail": "Nicht genug Credits: benötigt 3, verfügbar 1.",
  "requestId": "6f1c…"
}
```

Programme sollten auf `code` reagieren (stabil), Menschen lesen `detail` (lokalisiert per `?lang=`). `requestId` steht auch im Header `X-Request-Id` und in den Server-Logs – bei Supportanfragen bitte mitschicken.

| Status | `code` | Wann |
|---|---|---|
| 400 | `invalid_request` | Formatfehler, ungültige Parameter oder Cursor |
| 400 | `image_not_processable` | Datei ist kein lesbares Bild |
| 401 | `unauthorized` | Kein, ungültiger oder widerrufener Key |
| 402 | `insufficient_credits` | Guthaben reicht nicht für alle Bilder |
| 403 | `forbidden` | Scope fehlt, Key-Verwaltung per Key, fremde Origin |
| 404 | `not_found` | Unbekannte oder fremde ID |
| 409 | `idempotency_conflict` | Idempotency-Key mit anderen Bildern wiederverwendet |
| 409 | `api_key_limit_reached` | Mehr als 10 aktive Keys |
| 413 | `payload_too_large` | Bild > 10 MB oder Upload > 50 MB |
| 429 | `rate_limited` | Request-Limit erreicht (siehe `Retry-After`) |
| 429 | `too_many_active_analyses` | Mehr als 5 Analysen gleichzeitig in Arbeit |
| 500 | `internal_error` | Serverfehler |

## Limits

Jede Antwort enthält `RateLimit-Limit`, `RateLimit-Remaining` und `RateLimit-Reset` (Sekunden). Standard pro Konto: 30 Analyse-Starts / 10 min, 300 Lesezugriffe / min, höchstens 5 Analysen gleichzeitig in Arbeit. Bei `429` steht die Wartezeit in `Retry-After`.

## Betrieb (für Selbsthoster)

- Server-Umgebungsvariable `SUPABASE_SERVICE_ROLE_KEY` (Supabase-Secret-Key) ist Pflicht für die API. Er umgeht Row Level Security; die API filtert deshalb jede Abfrage selbst nach Nutzer (`lib/api/repository.ts`).
- Analysen laufen im Webserver-Prozess nach der Antwort (`after()`), höchstens `API_JOB_CONCURRENCY` (Standard 4) gleichzeitig. Bilder liegen nur während der Analyse im Arbeitsspeicher und werden nicht gespeichert.
- Wird der Server während einer Analyse neu gestartet, markiert AuraLens den Job beim nächsten Abruf als `failed` (`processing_interrupted`) und erstattet die Credits.
- Weitere Stellschrauben: `API_MAX_ACTIVE_ANALYSES`, `API_CREATE_RATE_LIMIT`, `API_READ_RATE_LIMIT`.
