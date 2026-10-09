# AuraLens Public API v1

Basis-URL: `https://<host>/api/v1` (lokal `http://localhost:3001/api/v1`). Alle Antworten sind JSON, Feldnamen in camelCase. Die Version steckt im Pfad: Innerhalb von `v1` kommen nur Felder **hinzu**, nichts wird umbenannt oder entfernt.

| Endpunkt | Zweck | Scope | Kosten |
|---|---|---|---|
| `POST /uploads` | Upload-URLs für 1–10 Bilder anfordern | `analyses:write` | – |
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

## Bilder hochladen

Bilder gehen **direkt in den Speicher** (Supabase Storage), nicht durch den API-Server. So gilt die Größengrenze des Hosters nicht – Vercel nimmt pro Anfrage höchstens 4,5 MB an, ein einzelnes Kamerafoto ist oft größer.

```bash
# 1. Upload-URLs anfordern (Name, MIME-Typ und Größe in Bytes pro Bild)
curl -H "Authorization: Bearer $AURALENS_KEY" -H "Content-Type: application/json" \
     -d '{"files":[{"name":"bild1.jpg","type":"image/jpeg","size":8123456}]}' \
     https://<host>/api/v1/uploads
# → 201 { "object": "upload_batch", "expiresAt": "…",
#         "uploads": [{ "index": 1, "name": "bild1.jpg", "path": "…", "uploadUrl": "https://…", "contentType": "image/jpeg", … }] }

# 2. Jede Datei unverändert per PUT an ihre uploadUrl schicken (ohne Authorization-Header)
curl -X PUT -H "Content-Type: image/jpeg" --data-binary @bild1.jpg "<uploadUrl>"

# 3. Analyse mit den Pfaden starten
curl -H "Authorization: Bearer $AURALENS_KEY" -H "Content-Type: application/json" \
     -H "Idempotency-Key: shooting-2026-10-08" \
     -d '{"uploads":[{"path":"<path>","name":"bild1.jpg"}]}' \
     https://<host>/api/v1/analyses
```

Die Server-Prüfung (Typ, max. 10 MB pro Bild, 50 MB gesamt) greift schon bei Schritt 1. Der Server liest die Bilder in Schritt 3 einmal ein und **löscht sie sofort**; nicht verwendete Uploads werden nach `expiresAt` (1 Stunde) gelöscht. `name` ist optional (Standard: Dateiname aus dem Pfad, auf ASCII vereinfacht). Pfade anderer Konten werden abgelehnt.

**Kleine Bilder direkt:** `POST /analyses` nimmt weiterhin `multipart/form-data` mit dem Feld `images` an. Das ist bequem für Tests, aber durch den Hoster begrenzt – `GET /usage` meldet die Grenze als `limits.maxDirectUploadBytes` (Vercel: 4,5 MB für die ganze Anfrage, `null` = keine Grenze).

## Ablauf: asynchrone Analyse

Analysen dauern 30–60 s (Serie mit 10 Bildern bis ca. 3 min). Damit Clients und Proxys nicht in Timeouts laufen, antwortet `POST` sofort mit `202` und einer ID:

```bash
# 1. Starten (hier der Kürze halber als Direkt-Upload für kleine Bilder;
#    große Bilder über POST /uploads, siehe oben)
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

JSON `{ "uploads": [ "<path>" | { "path": "<path>", "name": "…" }, … ] }` mit 1–10 Pfaden aus `POST /uploads` – oder `multipart/form-data` mit dem Feld `images` ein- bis zehnmal (siehe oben). JPEG, PNG, WEBP, GIF; max. 10 MB pro Bild, 50 MB gesamt. Die Reihenfolge bestimmt die Bildnummern (1-basiert). `?lang=de|en` legt die Sprache der Freitexte im Report fest; Stock-Metadaten und Bild-Prompts sind immer Englisch.

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
              "maxTotalUploadBytes": 52428800, "maxDirectUploadBytes": 4718592,
              "maxActiveAnalyses": 5 } }
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
| 404 | `not_found` | Auch: unbekannter API-Pfad |
| 405 | `method_not_allowed` | Methode am Endpunkt nicht unterstützt (Header `Allow` nennt die erlaubten) |
| 413 | `payload_too_large` | Bild > 10 MB oder Upload > 50 MB |
| 429 | `rate_limited` | Request-Limit erreicht (siehe `Retry-After`) |
| 429 | `too_many_active_analyses` | Mehr als 5 Analysen gleichzeitig in Arbeit |
| 500 | `internal_error` | Serverfehler |

## Aufrufe aus dem Browser (CORS)

Die API erlaubt Aufrufe von jeder Origin (`Access-Control-Allow-Origin: *`) mit den Headern `Authorization`, `Content-Type` und `Idempotency-Key`; `Location`, `Retry-After`, `RateLimit-*`, `X-Request-Id` und `Idempotent-Replayed` sind lesbar. Cookies werden dabei nie mitgeschickt – fremde Seiten können also nur mit einem API-Key zugreifen. Achtung: Ein Key im Browser-Code ist für jeden Besucher sichtbar; für öffentliche Seiten besser über einen eigenen Server gehen.

## Limits

Jede Antwort enthält `RateLimit-Limit`, `RateLimit-Remaining` und `RateLimit-Reset` (Sekunden). Standard pro Konto: 30 Analyse-Starts / 10 min, 300 Lesezugriffe / min, 60 sonstige Schreibzugriffe (inkl. `POST /uploads`) / min, höchstens 5 Analysen gleichzeitig in Arbeit. Die Zähler liegen in Supabase und gelten damit über alle Server-Instanzen hinweg. Bei `429` steht die Wartezeit in `Retry-After`.

## Betrieb (für Selbsthoster)

- Server-Umgebungsvariable `SUPABASE_SERVICE_ROLE_KEY` (Supabase-Secret-Key) ist Pflicht für die API. Er umgeht Row Level Security; die API filtert deshalb jede Abfrage selbst nach Nutzer (`lib/api/repository.ts`).
- Migration `20261009200000_analysis_uploads.sql` legt den privaten Bucket `analysis-uploads` für die Direkt-Uploads an.
- Analysen laufen im Webserver-Prozess nach der Antwort (`after()`), höchstens `API_JOB_CONCURRENCY` (Standard 4) gleichzeitig. Bilder liegen nur bis zum Einlesen im Upload-Bucket (danach sofort gelöscht, verwaiste nach 1 Stunde) und während der Analyse im Arbeitsspeicher.
- Wird der Server während einer Analyse neu gestartet, markiert AuraLens den Job beim nächsten Abruf als `failed` (`processing_interrupted`) und erstattet die Credits.
- Weitere Stellschrauben: `API_MAX_ACTIVE_ANALYSES`, `API_CREATE_RATE_LIMIT`, `API_READ_RATE_LIMIT`.
