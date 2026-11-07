# Projekt: AuraLens
Ein KI-gestützter visueller Stil- und Storytelling-Analyst für Fotografen und Kreative.

## Tech Stack
- Frontend & Backend: Next.js (App Router), TypeScript, Tailwind CSS
- Datenbank & Storage: Supabase
- KI: Anthropic Claude API (Vision, Structured Outputs; Modell per `ANTHROPIC_MODEL`, Default in `lib/claude/client.ts`)

## Regeln für die Entwicklung
- Schreibe sauberen, modularen TypeScript-Code.
- Design "Calibrated Darkroom": neutrales Dunkelgrau wie in Lightroom/Capture One, Farbe nur aus den Fotos, ein Signal-Orange für Aktionen und Ausreißer. Schriften: Playfair Display (Headlines), Inter (UI), JetBrains Mono (technische Werte). Kantige Flächen, Haarlinien statt Schatten.
- Das Farbsystem steht zentral in `app/globals.css`. Neue Komponenten nutzen die Darkroom-Tokens (`bg-room`, `bg-panel`, `text-ink`, `text-ink-muted`, `border-hairline`, `bg-signal` …); die alten stone/violet-Klassen sind dort auf Dunkel umgemappt.
- Marketing-Texte nennen nur Funktionen, die AuraLens wirklich hat (UWG).
- Achte auf sauberes Error Handling bei API-Aufrufen (insb. Bild-Uploads und Claude Vision).