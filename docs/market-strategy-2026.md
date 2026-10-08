# AuraLens – Marktstrategie 2026

> Stand: 08.10.2026 · Grundlage: `docs/PROJEKTSTATUS.md`, Code-Stand im Repo, öffentliche Preis- und Produktangaben der Wettbewerber (Quellen am Ende).
> Ton: bewusst ungeschönt. Wo Zahlen geschätzt sind, steht das dabei.

---

## TL;DR

1. **AuraLens ist kein Keywording-Tool und darf nie als solches wahrgenommen werden.** Keywording kostet bei der Konkurrenz 0,005–0,04 $ pro Bild (Pixify sogar 0 €). AuraLens kostet uns selbst schon **~0,08 $ pro Bild**. Im Preiskampf um Metadaten verlieren wir garantiert.
2. **Die echte Lücke ist die Serie, nicht das Einzelbild:** Keines der untersuchten Tools prüft, ob 10 Bilder *zusammenpassen*, und keines sagt, *wie man den Ausreißer korrigiert*. Das ist verkaufbar. „Uneinholbar“ ist es aber nicht: Ein Wettbewerber mit Vision-API baut einen einfachen Serien-Vergleich in wenigen Wochen nach. Der Vorsprung muss aus **Workflow-Tiefe** kommen (Lightroom-`.xmp`-Korrektur, Kampagnen-Historie), nicht aus dem Prompt.
3. **Die Multi-Model-Prompt-Engine ist das schwächste Verkaufsargument.** Prompts sind Massenware (jeder Chatbot liefert sie), und die Zielversionen im Code sind veraltet (`--v 6.1`, DALL-E 3). Sie lohnt sich nur als Teil eines geschlossenen Kreislaufs: *Serie analysieren → Stil-Prompt → passende Bilder generieren → Konsistenz prüfen → Metadaten exportieren.*
4. **Die Unit Economics gehen auf, wenn Credits an die Bildzahl gekoppelt sind**, nicht an „Analysen“. Eine Serie mit 10 Bildern kostet mit dem aktuellen Setup geschätzt ~0,55 $, also mehr als die angenommene Spanne von 0,25–0,40 $.
5. **Ohne Gewerbeanmeldung darf kein Geld fließen.** Die Testphase misst also *Zahlungsbereitschaft* (Fake-Door-Preisseite, Vorbestellungs-Warteliste), nicht Umsatz. Impressum und Datenschutzerklärung braucht die öffentliche Beta trotzdem.

---

## 1. Konkurrenz- & Lücken-Analyse

### 1.1 Marktbild

| Tool | Kernversprechen | Preis (öffentlich) | Einheit |
|---|---|---|---|
| **AutoKeyWorder** | Chrome-Extension, füllt Titel/Keywords/Kategorie direkt in Upload-Formulare von 5 Plattformen (Adobe Stock, Shutterstock, Zedge, Displate, TeePublic) | 3,99 $/100 Credits bis 49,99 $/Monat für 10.000 | **0,005–0,04 $ pro Bild** |
| **Noamax AI** | Keywording für Microstock: gerankte Keywords, Titel, Beschreibung; Fotos, Vektoren, Video | Credit-/Abo-Modell | Pro Bild |
| **Pixify (Studio)** | Titel, Beschreibung, Keywords in Sekunden, Video-Support | **kostenlos** | Pro Bild |
| **PhotoKeyworder / AI Stock Keywords u. a.** | Dasselbe Muster | Ähnlich niedrig | Pro Bild |
| **MyPhotoAI Style Analyzer, Manus, imagedescriber** | Stil-/Farbbeschreibung eines Bildes | Freemium | Pro Bild |

**Wichtigste Beobachtung:** Der ganze Markt ist auf *Durchsatz pro Einzelbild* optimiert. Zielgruppe ist vor allem der KI-Microstock-Creator, der Hunderte Bilder pro Woche hochlädt. AutoKeyWorder richtet sich ausdrücklich an „AI creators“. Diese Leute zahlen Cent-Beträge und erwarten Antworten in unter 5 Sekunden.

### 1.2 Wo diese Tools bei echten Shootings versagen

1. **Bild-für-Bild-Isoliertheit.** Jedes Bild wird so verschlagwortet, als wäre es das einzige. Bei einem Shooting mit 40 Bildern derselben Location entstehen 40 leicht unterschiedliche Keyword-Sets. Das sieht nach Duplikat-Spam aus, und Keywords widersprechen sich zwischen Geschwisterbildern („sunset“ / „golden hour“ / „evening“ wahllos gemischt).
2. **Keine Aussage zur Konsistenz.** Kein Tool merkt, dass Bild 7 einen Kelvin-Shift von +400 K hat oder dass zwei Bilder anders gecroppt und gegradet sind. Für Kampagnen-, Produkt- und Editorial-Fotografen *ist das aber der Job*: Ein Kunde nimmt ein Set nur ab, wenn es einheitlich aussieht.
3. **Diagnose ohne Handlung.** Selbst Stil-Analyzer *beschreiben* („warm, moody“), sagen aber nicht, *was zu ändern ist*. Es gibt keine Korrekturwerte und keinen Export in die Bildbearbeitung.
4. **Keine Dramaturgie.** Kein Tool schlägt eine Reihenfolge vor, keines erkennt fehlende Einstellungsgrößen („Detail-Shot fehlt“) oder die Rolle eines Bildes in der Serie (Opener, Closer).
5. **Kein Kampagnen-Gedächtnis.** Man kann nicht prüfen, ob das Shooting von heute zum Look vom letzten Quartal passt.

### 1.3 Warum Serien-Konsistenz + Prompt-Engine eine Lücke besetzt und wie belastbar das ist

**Die Lücke ist echt.** AuraLens beantwortet eine Frage, die kein Wettbewerber stellt: *„Ist das hier ein Set, und was muss ich tun, damit es eins wird?“* Dazu kommt ein Kreislauf, den Keyword-Tools strukturell nicht abbilden:

```
Serie hochladen ──► Konsistenz-Score + Ausreißer + Korrekturwerte
      ▲                         │
      │                         ▼
 neue Bilder ◄── Stil-Prompt (Midjourney/Flux/Firefly/GPT-Image) mit [subject]
      │
      ▼
 Metadaten-Export (konsistent über die ganze Serie) ──► Adobe Stock / Shutterstock
```

Der stärkste Teilmarkt dafür sind **KI-Stock-Creator, die Serien generieren**. Sie haben genau das Konsistenzproblem (Midjourney driftet zwischen Generierungen) *und* brauchen Prompts *und* Metadaten. Hier ergänzt die Prompt-Engine den Konsistenz-Check sinnvoll, statt nur ein Zusatz-Gimmick zu sein.

**Warum die Lücke nicht „uneinholbar“ ist:**

- Technisch ist der Kern ein Multi-Image-Vision-Call mit gutem Schema. Noamax oder AutoKeyWorder können „Batch-Konsistenz“ nachbauen, sobald Kunden danach fragen.
- Prompts sind Massenware: ChatGPT, Midjourney `/describe` und kostenlose Tools liefern sie gratis.
- **Prompt-Ziele (am 08.10.2026 aktualisiert):** Die Engine zielt jetzt auf Midjourney V8.2 (`--raw --v 8.2`), FLUX.2/FLUX 3, Firefly Image 5 und ChatGPT Images 2.5. Bildmodelle wechseln etwa alle 3–6 Monate; ohne regelmäßige Pflege veraltet das Feature schnell wieder.
- Latenz: ~1 Minute pro Serie gegen <5 s pro Bild bei der Konkurrenz. Für Kampagnenarbeit ist das akzeptabel, für Massen-Upload nicht.

**Was den Vorsprung verteidigt (Burggraben, nach Wirkung sortiert):**

1. **Lightroom-`.xmp`-Preset-Export der Korrekturvorschläge.** Aus „Bild 7 ist zu warm“ wird „Klick, Bild 7 ist korrigiert“. Damit wird aus der Diagnose ein Werkzeug, und das ist das Feature, für das Profis zahlen.
2. **Serien-konsistente Metadaten:** gemeinsamer Keyword-Kern plus bildspezifische Keywords, Export als Adobe- *und* Shutterstock-CSV.
3. **Kampagnen-Historie / Look-Referenz:** „Prüfe das neue Shooting gegen Referenzserie X.“ Damit entsteht Bindung: Wer seine Looks bei AuraLens gespeichert hat, wechselt nicht.
4. **Fokus auf die Nische**, die Keyword-Tools nicht bedienen: Kampagnen-, Produkt- und Hochzeitsfotografen, kleine Agenturen, KI-Serien-Creator.

**Positionierung in einem Satz:**
> *„Keyword-Tools beschriften Bilder. AuraLens macht aus einem Shooting ein Set: findet den Ausreißer, liefert die Korrektur und exportiert konsistente Metadaten für die ganze Serie.“*

---

## 2. Monetarisierungs-Optimierung

### 2.1 Was eine Analyse wirklich kostet

Preise laut Anthropic-Preisliste (Stand 25.09.2026, pro 1 Mio. Tokens Input/Output):

| Modell | Input | Output | Bemerkung |
|---|---|---|---|
| Claude Opus 5 (aktueller Default im Code) | 5,00 $ | 25,00 $ | |
| Claude Opus 5.5 | 4,00 $ | 20,00 $ | gleiche Fähigkeitsklasse, 20 % günstiger; Thinking lässt sich nicht abschalten, nur per `effort` drosseln |
| Claude Sonnet 5.5 | 2,00 $ | 10,00 $ | |
| Claude Haiku 4.5 | 1,00 $ | 5,00 $ | |
| Prompt-Cache-Read | ~0,1× Input | | Cache-Write ~1,25× Input |
| Batch API | −50 % | −50 % | asynchron, nicht für Live-UI |

**Gemessener Ausgangspunkt:** 4 Bilder, 2 Teile, Opus 5: 13,5k Input + 7k Output = 0,068 $ + 0,175 $ ≈ **0,24 $**. Das passt zur Messung im Projektstatus.

**Hochrechnung auf das jetzige 3-Teile-Setup (Schätzung, noch nicht gemessen):**

| Serie | Input (geschätzt) | Output (geschätzt) | Kosten Opus 5 |
|---|---|---|---|
| 2 Bilder | ~12k | ~8k | **~0,26 $** |
| 4 Bilder | ~20k | ~9,5k | **~0,34 $** |
| 10 Bilder | ~45k | ~13k | **~0,55 $** |
| Einzelbild | ~3k | ~3k | **~0,09 $** |

Erkenntnisse daraus:

- **Rund 70 % der Kosten sind Output-Tokens**, nicht Bilder. Kürzere Schemas (weniger Freitext, `maxItems`) sparen mehr als kleinere Bilder.
- **Eine Serie mit 10 Bildern liegt über der Spanne von 0,25–0,40 $.** Ein Pauschalpreis „pro Serie“ wäre deshalb ein Verlustrisiko: Power-User laden immer 10 Bilder hoch.
- Adaptive Thinking wird als Output abgerechnet. Die echten Werte können darüber liegen. **Vor jeder Preisfestlegung mit echten Calls auf `testbilder/` messen.**

### 2.2 Kostenhebel, nach Wirkung sortiert

| # | Hebel | Erwartete Ersparnis | Aufwand |
|---|---|---|---|
| 1 | **Modell pro Teil wählen:** Konsistenz (Kern-USP) bleibt auf Opus 5.5, Markt- und Prompt-Teil auf Sonnet 5.5 | ~40–50 % | gering (ein Env-Var pro Teil) |
| 2 | **Opus 5 → Opus 5.5** für den Konsistenz-Teil, `effort` explizit setzen | ~20 % auf diesen Teil | gering, Qualität messen |
| 3 | **Output-Disziplin:** Freitextfelder kürzen, Listen begrenzen | 15–30 % | gering |
| 4 | **Kleinere Bilder für Markt- und Prompt-Teil** (~1000 px statt 1568 px; Farben und Stil brauchen keine volle Auflösung) | ~halbe Bild-Tokens in 2 von 3 Calls | gering |
| 5 | **Prompt-Caching der Bilder** über die 3 Teil-Calls (Cache vorwärmen, dann parallel feuern) | ~10–15 % (wirkt nur auf Input) | mittel, kostet Latenz |
| 6 | **Batch API (−50 %)** als „Über-Nacht-Modus“ für Agency-Massenaufträge | 50 % auf diese Aufträge | mittel |
| 7 | **Alles Deterministische ohne Claude:** Palette, Seitenverhältnis, Auflösung, Sortierung, Vor-Check der Farbtemperatur | 100 % auf diese Features | gering bis mittel |

**Zielwert nach Hebeln 1–4 (Schätzung): ~0,18 $ für 4 Bilder, ~0,30 $ für 10 Bilder.** Das sind etwa 45 % weniger als heute.

### 2.3 Preismodell: Credits = Bilder

**Grundregel: 1 Credit = 1 analysiertes Bild.** Eine Serie mit 6 Bildern kostet 6 Credits, ein Einzelbild 1 Credit. So steigen Kosten und Erlös immer gemeinsam, und die 10-Bilder-Serie ist kein Verlustgeschäft mehr.
Kostenobergrenze pro Credit (heute): ~0,09 $ ≈ 0,08 € (Annahme: 1 $ ≈ 0,90 €).

| Tarif | Preis (brutto) | Inhalt | Für wen |
|---|---|---|---|
| **Free** | 0 € | Paletten-Tool und Quick-Check ohne Login (0 € API-Kosten, s. Kap. 3), **1 Serie bis 4 Bilder** nach Registrierung | Köder |
| **Starter-Paket** | **12 € einmalig** | 30 Credits, 12 Monate gültig, kein Abo | Hobbyisten, Ausprobierer |
| **Pro** | **29 €/Monat** (Jahresabo 290 €) | 120 Credits/Monat, Serien-Historie, `.xmp`-Export, Adobe- + Shutterstock-CSV, Nachkauf 0,35 €/Credit | Profi-Fotografen, KI-Serien-Creator |
| **Agency** | **ab 99 €/Monat** | 500 Credits, 3 Plätze, Look-Referenzen, API-Zugang, Batch-Modus, Nachkauf 0,30 €/Credit | Agenturen, Studios |

**Deckungsbeitrag im schlechtesten Fall** (alle Credits verbraucht, heutige Kosten, 19 % USt., Merchant-of-Record-Gebühr ~5 % + 0,50 $):

| Tarif | Netto nach USt. + Gebühr | Max. API-Kosten | Deckungsbeitrag | Marge |
|---|---|---|---|---|
| Starter 12 € | ~9,10 € | ~2,40 € | ~6,70 € | ~74 % |
| Pro 29 € | ~22,50 € | ~9,70 € | ~12,80 € | ~57 % |
| Agency 99 € | ~77,80 € | ~40,50 € | ~37,30 € | ~48 % |

Erfahrungsgemäß nutzen Abonnenten ihr Kontingent bei Weitem nicht aus. Bei ~40 % Auslastung liegen Pro und Agency bei **75–80 % Marge**, nach den Kostenhebeln aus 2.2 noch höher.

**Ehrlicher Abgleich mit der Konkurrenz:** Pro kostet ~0,24 € pro Bild, AutoKeyWorder ~0,007 $. Das ist ein Faktor 30. **Dieser Preis ist nur mit Serien- und Korrektur-Nutzen zu rechtfertigen und nie mit Keywords.** Landingpage und Preisseite dürfen deshalb nicht mit „Keywords“ aufmachen.

### 2.4 Wie uns die API-Kosten nicht auffressen

1. **Kein „Unlimited“-Tarif.** Niemals.
2. **Credit-Buchhaltung mit Reservierung:** Credits werden *vor* dem Call reserviert, nach Erfolg verbucht und bei Fehler oder Abbruch erstattet (Supabase-Tabelle `credit_ledger`, Buchung serverseitig, RLS).
3. **Globaler Notschalter:** In der Anthropic Console ein Monatslimit setzen, zusätzlich ein serverseitiges Tagesbudget. Wird es überschritten, geht es nur noch per Warteschlange weiter, und der Admin wird benachrichtigt.
4. **Free-Tier ohne Claude:** Alles, was ohne Login erreichbar ist, läuft deterministisch (`sharp` bzw. Browser-Canvas).
5. **Rate-Limit nach Konto statt nur nach IP** und auf Redis/Upstash umstellen, sobald mehrere Instanzen laufen.
6. **Kosten pro Analyse loggen und anzeigen** (die Token-Logs gibt es schon): Wöchentlich prüfen, ob die tatsächlichen Kosten pro Credit unter 0,10 $ bleiben.

---

## 3. Der „Null-Euro-Marketing“-Fahrplan

### 3.0 Grundregeln

- **90/10-Regel:** 90 % der Beiträge haben einen eigenständigen Nutzen, höchstens 10 % erwähnen AuraLens.
- **Erst Reputation, dann Link.** Neue Accounts mit Werbelink werden auf Reddit fast immer automatisch gefiltert. Vorher 2–3 Wochen echte Hilfe in Kommentaren leisten.
- **Vor jedem Post die Subreddit-Regeln in der Sidebar lesen.** Viele Foto-Subs erlauben Eigenwerbung nur in Megathreads oder an bestimmten Tagen. Im Zweifel vorher per Modmail fragen (*„Darf ich ein kostenloses Tool zeigen, das ich gebaut habe? Kein Login, keine Bezahlung.“*). Moderatoren reagieren auf diese Frage fast immer besser als auf ungefragte Posts.

### 3.1 Build in Public

**Kanäle nach Passung:**

| Kanal | Zielgruppe | Format |
|---|---|---|
| r/stockphotography, Microstock-Foren (z. B. MicrostockGroup), Adobe-Stock-Contributor-Community | Stock-Profis | Erkenntnis-Posts, Daten, Tool erst auf Nachfrage |
| r/photography, r/AskPhotography, r/postprocessing | Fotografen allgemein | Vorher/Nachher zur Serien-Konsistenz, Lightroom-Tipps |
| r/midjourney, r/StableDiffusion, KI-Stock-Gruppen | KI-Serien-Creator | „So bleibt deine Midjourney-Serie konsistent“ |
| r/SideProject, r/IndieHackers, Show HN, Product Hunt | Gründer, Early Adopter | offenes Build-in-Public mit Zahlen |
| X/Threads, LinkedIn | Agenturen, Design-Leute | wöchentliche Updates mit Screenshots |

**Post-Muster, die nicht gelöscht werden (Wert zuerst):**

**A) Erkenntnis-Post (Foto-Subs):**
> **Titel:** „Ich habe 30 meiner Shootings auf Farbkonsistenz geprüft. Der häufigste Fehler war nicht der Weißabgleich.“
> **Inhalt:** konkrete Beobachtungen mit Beispielbildern (eigene!), Lightroom-Werte, ein klarer Tipp. *Kein Link.* Am Ende: „Ich baue gerade ein Tool, das das automatisch prüft. Wer's testen will, schreibt mir einen Kommentar.“
> → Wer kommentiert, bekommt den Link per DM. Das ist regelkonform, und die Kommentare zeigen den Moderatoren echtes Interesse.

**B) Daten-Post (Stock-Subs):**
> „Was Adobe-Stock-Reviewer bei Serien ablehnen: meine Auswertung von N eigenen Uploads.“
> Nur echte eigene Daten verwenden, nichts erfinden. In diesen Communities fällt Erfundenes sofort auf und ruiniert den Ruf.

**C) Build-in-Public (Gründer-Subs, Show HN):**
> „Ich habe einen Konsistenz-Checker für Fotoserien gebaut. Er kostet mich 0,34 $ pro Analyse. Hier ist, wie ich das auf 0,18 $ gedrückt habe.“
> Ehrliche Zahlen, Architektur, Fehler. Hier ist der Link erlaubt und erwünscht.

**Rhythmus:** 1 wertvoller Post pro Woche, dazu täglich 15 Minuten echte Kommentar-Hilfe.

### 3.2 Der Trojanische-Pferd-Trick: kostenloser Köder ohne API-Kosten

**Kernidee:** Das kostenlose Feature darf **keinen einzigen Claude-Call** auslösen, sonst wird Viralität zur Kostenfalle.

**Köder 1: „Palette aus Foto“ (`/palette`, ohne Login)**
- Bild rein → 5–6 Hex-Farben (k-means/Median-Cut serverseitig mit `sharp` oder direkt im Browser per Canvas) → Kopieren als HEX / CSS / Tailwind-Token. Den Tailwind-Export gibt es schon deterministisch in `lib/design-tokens.ts`.
- **Teilbare Karte:** schönes OG-Bild mit Palette und kleinem „made with AuraLens“-Hinweis, eigene URL. Jeder geteilte Link ist Werbung.
- **SEO-Effekt:** Suchanfragen wie „Farbpalette aus Foto extrahieren“ oder „color palette from image tailwind“ bringen dauerhaft Besucher, auch Designer und Entwickler als zweite Zielgruppe.

**Köder 2 (stärker): „Serien-Quick-Check“ (bis 5 Bilder, ohne Login, deterministisch)**
- Mittlere Farbtemperatur, Helligkeit und Sättigung pro Bild berechnen, Abweichung zum Serien-Median als Ampel darstellen: *„Bild 3 weicht deutlich ab.“*
- **Der Haken:** *„Warum, und mit welchen Lightroom-Werten korrigierst du es? → Kostenlose KI-Analyse nach Registrierung.“*
- Das ist der eigentliche Trichter: Das Gratis-Tool zeigt das Problem, die Bezahlversion löst es. Die Konkurrenz hat nichts Vergleichbares.

**Messen:** Besucher des Gratis-Tools → Registrierung (Ziel ≥ 5 %), Registrierung → erste KI-Serie (Ziel ≥ 40 %).

### 3.3 Community-Outreach an Profis, ohne aufdringlich zu wirken

**Prinzip: geben, bevor man fragt. Der Kontakt beginnt mit einem fertigen Ergebnis, nicht mit einem Pitch.**

1. **Auswahl:** 20 Fotografen pro Woche, deren *öffentliche* Serien sichtbar sind (Stock-Portfolio, Instagram, Behance) und die aktiv posten.
2. **Vorarbeit:** Eine öffentlich sichtbare Serie selbst durch AuraLens laufen lassen, Ergebnis kurz prüfen und als 1-seitiges PDF oder Screenshot aufbereiten.
3. **Kontakt über die Plattform** (DM, Kommentar, Forum), **keine Kaltakquise per E-Mail.** In Deutschland ist unverlangte Werbung per E-Mail auch an Gewerbetreibende nach § 7 UWG grundsätzlich unzulässig.
4. **Nachrichtenvorlage:**
   > „Hi [Name], deine [Serie X] hat mir gefallen, vor allem [konkretes Detail]. Ich baue gerade ein Tool, das Serien auf Konsistenz prüft, und hab deine testweise durchlaufen lassen. Es hat bei Bild 4 einen leichten Grünstich gegenüber dem Rest gefunden. Falls es dich interessiert, schick ich dir den Report. Kein Verkauf, ich suche nur ehrliches Feedback von Leuten, die das beruflich machen.“
5. **Nachfassen:** Höchstens einmal. Wer antwortet, bekommt einen kostenlosen Pro-Zugang für die Beta und wird um 15 Minuten Feedback-Gespräch gebeten.
6. **Ziel:** 5–10 Beta-Profis, die (a) echtes Feedback geben und (b) später als Referenz mit Zitat dienen.

> **Hinweis:** Fremde Bilder nur von öffentlichen Seiten verwenden, nicht speichern und nur der Person selbst zeigen. Bilder mit erkennbaren Personen auslassen (DSGVO).

---

## 4. Actionable Next Steps

### Vorab: der rechtliche Rahmen der Testphase *(keine Rechtsberatung)*

- **Ohne Gewerbeanmeldung kein Umsatz.** Wer Abos oder Credit-Pakete verkauft, handelt gewerblich, und das muss *vor* der ersten Einnahme angemeldet sein (online, typischerweise 20–65 €; Kleinunternehmerregelung nach § 19 UStG prüfen). Die Testphase misst deshalb **Zahlungsbereitschaft ohne Bezahlung**.
- **Impressum + Datenschutzerklärung sind trotzdem Pflicht**, sobald die Beta öffentlich ist: Die Seite wird erkennbar mit späterer Bezahlabsicht betrieben (§ 5 DDG), und Bilder gehen an einen US-Dienst und werden in Supabase gespeichert (DSGVO). Dazu Löschfristen festlegen.
- **API-Kosten der Beta trägt man privat:** Ein hartes Monatslimit in der Anthropic Console ist Pflicht (Empfehlung: 30–50 $).

### Die 3 wichtigsten Schritte in der Claude CLI

#### Schritt 1 – Kosten messen und senken, Credit-System bauen *(Programmierung, ~2–3 Sessions)*
- Echte Serien-Calls auf `testbilder/` mit 2, 4 und 10 Bildern fahren, Tokens, Kosten und Dauer pro Teil protokollieren. **Das ist der wichtigste offene Messwert im ganzen Projekt.**
- Modell pro Teil konfigurierbar machen (`ANTHROPIC_MODEL_CONSISTENCY`, `…_MARKET`, `…_PROMPTS`), Sonnet 5.5 für Markt und Prompts testen, Opus 5.5 für Konsistenz, `effort` explizit setzen. Danach die Qualität mit derselben Testserie vergleichen.
- Bilder für Markt- und Prompt-Teil verkleinern, Freitext im Schema straffen.
- Supabase-Tabelle `credit_ledger` (reservieren/verbuchen/erstatten) plus Beta-Kontingent (z. B. 20 Credits pro Konto) plus serverseitiges Tagesbudget als Notschalter.
- Prompt-Engine auf aktuelle Midjourney-, Flux- und Firefly-Versionen sowie das aktuelle OpenAI-Bildmodell bringen.
- **Erfolgskriterium:** gemessene Kosten ≤ 0,20 $ für eine Serie mit 4 Bildern, bei gleicher Konsistenz-Qualität.

#### Schritt 2 – Gratis-Köder und Landingpage mit Fake-Door-Preisen *(Programmierung + Marketing, ~2 Sessions)*
- `/palette` und den Serien-Quick-Check deterministisch bauen (ohne Login, ohne Claude), teilbare OG-Karte inklusive.
- Landingpage mit der Positionierung aus 1.3 („aus einem Shooting ein Set machen“, nicht „Keywords“), Vorher/Nachher-Beispiel einer Serie, Impressum, Datenschutz.
- **Preisseite mit den echten Tarifen aus 2.3**. Die Buttons „Pro wählen“ führen zur Warteliste: *„Pro startet am [Datum]. Trag dich ein und sichere dir 3 Monate zum Gründerpreis.“* Klicks und Eintragungen pro Tarif werden getrackt, datensparsam (z. B. Plausible/Umami oder eigene Supabase-Tabelle).
- Deployment auf eine Plattform, die 1–5 Minuten lange Requests erlaubt (z. B. Docker-Host oder Fly.io/Railway; Vercel nur mit passendem Plan bzw. passender Function-Laufzeit), Supabase-Cloud-Projekt in einer EU-Region, CI-Workflow an ein Remote-Repo hängen.
- **Erfolgskriterium:** öffentlich erreichbar, rechtlich sauber, alle Trichter-Events messbar.

#### Schritt 3 – 4-Wochen-Beta-Sprint mit Outreach und Build in Public *(Marketing)*
- Woche 1–2: Reddit-Reputation aufbauen (täglich hilfreiche Kommentare), Erkenntnis-Post A, Show-HN- bzw. r/SideProject-Post C.
- Jede Woche: 20 personalisierte Serien-Audits nach 3.3, 1 Build-in-Public-Update mit echten Zahlen.
- Feedback-Gespräche mit den ersten 5–10 Profis. Kernfrage: *„Was müsste das Tool können, damit du 29 € im Monat zahlst?“* Damit wird geprüft, ob `.xmp`-Export das Kaufmotiv ist.
- **Go/No-Go nach 4 Wochen** (Gewerbeanmeldung und Bezahlintegration erst bei „Go“):

| Kennzahl | Ziel für „Go“ |
|---|---|
| Registrierte Beta-Nutzer | ≥ 100 |
| Registrierung → erste KI-Serie | ≥ 40 % |
| Wiederkehrende Nutzer (≥ 2 Serien in 2 Wochen) | ≥ 20 % |
| Fake-Door-Klicks auf Pro/Agency, gemessen an aktiven Nutzern | ≥ 10 % |
| Wartelisten-Einträge mit Gründerpreis-Zusage | ≥ 15 |
| Profis, die als Referenz zitiert werden dürfen | ≥ 3 |
| Gemessene Kosten pro Credit | ≤ 0,10 $ |

Werden die Ziele verfehlt, eher die Positionierung schärfen (z. B. ganz auf KI-Serien-Creator gehen) als mehr Features bauen.

---

## Quellen

- AutoKeyWorder: Preise und Funktionen – [autokeyworder.com/alternatives](https://autokeyworder.com/alternatives), [shyft.ai/tools/autokeyworder](https://www.shyft.ai/tools/autokeyworder), [Best stock photo keywording tools](https://autokeyworder.com/blog/best-stock-photo-keywording-tools)
- Noamax AI: [Trustpilot](https://uk.trustpilot.com/review/noamax.ai)
- Pixify: [mystockphoto.org – Pixify AI Keywording Tool](https://www.mystockphoto.org/pixify-ai-keywording-tool/), [similarlabs.com/de/p/pixify](https://similarlabs.com/de/p/pixify)
- Claude-API-Preise: Anthropic-Modellübersicht (Stand 25.09.2026)
- Projektinterne Messung: `docs/PROJEKTSTATUS.md`, Abschnitt 4
