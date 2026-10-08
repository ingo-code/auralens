# AuraLens API

> **Analysen laufen ausschließlich über die [Public API v1](API-v1.md)** (`POST /api/v1/analyses`, mit Anmeldung oder API-Key, Credits, asynchron). Dieses Dokument beschreibt den **Aufbau der Reports**, die v1 in `GET /api/v1/analyses/{id}` als `report` liefert, sowie den kostenlosen Umsortier-Endpunkt.

| Endpunkt | Zweck | Claude-Aufruf / Kosten |
|---|---|---|
| `POST /api/series/organize` | Vorhandenen Serien-Report neu sortieren/gruppieren | **nein**, kostenlos, Millisekunden |
| ~~`POST /api/analyze`~~, ~~`POST /api/analyze/series`~~ | **Abgeschaltet** (09.10.2026): antworten mit `410 Gone` und Verweis auf `/api/v1/analyses` | – |

Die früheren anonymen Analyse-Routen liefen ohne Login und ohne Credits und waren damit eine offene Kostenlücke. Sie lesen den Request nicht mehr und rufen Claude nie auf.

---

## Aufbau des Serien-Reports

So sieht eine abgeschlossene Serien-Analyse aus. `GET /api/v1/analyses/{id}` liefert `report`, `files` und – mit `?sort=&order=&group=` – `organization` in genau dieser Form (eingebettet in das `analysis`-Objekt, siehe [API-v1.md](API-v1.md)).

**Query-Parameter für `organization`:**

| Parameter | Werte | Default |
|---|---|---|
| `sort` | `upload` · `story` (empfohlene Dramaturgie) · `consistency` · `category` · `shot` (Einstellungsgröße weit → nah) · `resolution` | `upload` |
| `order` | `asc` · `desc` | `asc` |
| `group` | `none` · `category` · `role` · `shot` · `orientation` · `stock_ready` | `none` |

**Antwort `200`:**

```jsonc
{
  "imageCount": 3,
  "report": {
    "series":        { "title": "…", "summary": "…", "styleTags": ["…"] },
    "consistency":   { "overallScore": 52, "dimensions": { "color": 38, "lighting": 62, "postProcessing": 40, "composition": 78 },
                       "verdict": "…", "recommendations": ["…"] },
    "narrative":     { "arcSummary": "…", "suggestedOrder": [1, 3, 2], "orderRationale": "…", "missingShots": ["…"] },
    "masterPalette": { "colors": [{ "hex": "#1CA5A8", "name": "Lagunen-Türkis", "role": "primary" }],
                       "harmony": { "type": "analogous", "description": "…" } },
    "market":        { "industries": [{ "name": "Reise & Tourismus", "fitScore": 97, "rationale": "…", "useCases": ["…"] }],
                       "targetAudiences": [{ "segment": "…", "rationale": "…" }],
                       "psychology": [{ "emotion": "Entspannung", "intensity": 94, "trigger": "…" }] },
    "aiPrompts":     { "photographicSpec": { "focalLength": "…", "aperture": "…", "lighting": "…", "filmStock": "…", "colorGrading": "…", "mood": "…" },
                       // Prompt-Engine: Stil-Vorlage mit [subject]-Platzhalter, je Plattform optimiert
                       "midjourney": "… --ar 4:5 --raw --v 8.2",
                       "flux":       { "positive": "…", "negative": "…" },   // negative nur für SDXL (FLUX kennt keinen)
                       "firefly":    "…",                                    // ohne Marken/Künstler
                       "dalle3":     "…" },                                    // ChatGPT Images 2.5 (Key historisch)
    "images": [{
      "index": 1,
      "summary": "…",
      "consistencyScore": 82,
      "narrativeRole": "opener",          // opener | context | detail | hero | transition | closer
      "shotType": "wide",                  // extreme_wide | wide | medium | close_up | detail | aerial | overhead
      "dominantColors": [{ "hex": "#F3EDE4", "name": "…" }],
      "deviations": [{ "aspect": "color_cast", "severity": "high", "description": "…", "fix": "…" }],
      "stock": {
        "category": "travel",              // Adobe-Stock-Kategorie, siehe unten
        "title": "…", "description": "…", "keywords": ["… 25 Stück …"]
      }
    }]
  },
  // Aus der Datei gemessen, nicht von der KI geschätzt:
  "files": [{
    "index": 1, "name": "bild1.jpg",
    "width": 6000, "height": 4000, "megapixels": 24,
    "orientation": "landscape",            // landscape | portrait | square
    "stockResolutionOk": true              // ≥ 4 MP (Adobe-Stock-Minimum)
  }],
  "organization": {
    "sort": "consistency", "order": "desc", "group": "category",
    "sortedIndices": [3, 1, 2],
    "groups": [{ "key": "travel", "label": "Reisen", "indices": [3, 1] },
               { "key": "food", "label": "Essen", "indices": [2] }]
  }
}
```

`groups` stehen in der Reihenfolge ihres ersten Bildes in `sortedIndices`; innerhalb einer Gruppe gilt die Sortierung. Bei Gleichstand entscheidet stabil die Upload-Reihenfolge. Mit `group=none` gibt es genau eine Gruppe `all`.

**Fehler:**

| Status | Wann |
|---|---|
| `400` | ungültige Query-Parameter, < 2 oder > 10 Bilder, falscher Dateityp, Datei nicht lesbar (Meldung nennt die Bildnummer) |
| `413` | Einzelbild > 10 MB oder gesamt > 50 MB |
| `422` | Claude hat die Analyse abgelehnt |
| `429` | Rate-Limit (Default 5 Serien / 10 Min / IP), Header `Retry-After` |
| `500` | Server-/Konfigurationsfehler (z. B. fehlender API-Key) |
| `502` | Claude-Antwort unvollständig/ungültig oder Claude nicht erreichbar – erneut versuchen |

---

## `POST /api/series/organize`

Sortiert/gruppiert einen bereits vorhandenen Report neu – ohne erneute Analyse und ohne Kosten. Ideal für Integrationen, die verschiedene Ansichten derselben Serie brauchen.

**Request:** `application/json` (max. 1 MB)

```jsonc
{
  "report": { /* report aus GET /api/v1/analyses/{id} */ },
  "files":  [ /* files aus GET /api/v1/analyses/{id} */ ],
  "sort": "category",      // optional, wie oben
  "order": "asc",          // optional
  "group": "stock_ready"   // optional
}
```

**Beispiel (PowerShell)** – nimmt die gespeicherte Analyse und gruppiert nach Stock-Tauglichkeit:

```powershell
$serie = Get-Content serie.json -Raw | ConvertFrom-Json
$body  = @{ report = $serie.report; files = $serie.files; sort = "resolution"; order = "desc"; group = "stock_ready" } |
         ConvertTo-Json -Depth 20
Invoke-RestMethod -Method Post -Uri http://localhost:3001/api/series/organize `
  -ContentType "application/json; charset=utf-8" -Body ([Text.Encoding]::UTF8.GetBytes($body))
```

**Antwort `200`:** `{ "organization": { … wie oben … } }`

**Fehler:** `400` (kein JSON, ungültiges Feld – die Meldung nennt den Pfad, z. B. `'report.images'`, oder `files` passen nicht zum Report), `413` (> 1 MB), `429` (Default 120 / Minute / IP).

---

## Referenz: Schlüssel und deutsche Bezeichnungen

**`stock.category`** (Adobe-Stock-Kategorien): `animals` Tiere · `architecture` Gebäude & Architektur · `business` Business · `drinks` Getränke · `environment` Umwelt · `states_of_mind` Gefühle & Stimmungen · `food` Essen · `graphic_resources` Grafische Elemente · `hobbies_leisure` Hobbys & Freizeit · `industry` Industrie · `landscapes` Landschaften · `lifestyle` Lifestyle · `people` Menschen · `plants_flowers` Pflanzen & Blumen · `culture_religion` Kultur & Religion · `science` Wissenschaft · `social_issues` Soziale Themen · `sports` Sport · `technology` Technologie · `transport` Verkehr & Transport · `travel` Reisen

**`shotType`:** `extreme_wide` Panorama · `wide` Totale · `medium` Halbnah · `close_up` Nah · `detail` Detail/Makro · `aerial` Luftaufnahme · `overhead` Draufsicht/Flat Lay

**`narrativeRole`:** `opener` Einstiegsbild · `context` Kontext · `detail` Detailaufnahme · `hero` Hero-Shot · `transition` Übergang · `closer` Abschluss

Die Schlüssel sind stabil; Bezeichnungen können sich ändern. Single Source of Truth: `lib/series-analysis-schema.ts` und `lib/series-organize.ts`.
