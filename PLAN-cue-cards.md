# PLAN: Karteikarten-Modus im Cockpit (cue cards)

Ein zweites Layout für `speaker.html`: statt Spiegel groß und Notes als
Fließtext im Textarea zeigt das Cockpit eine Spalte aus Karten – die
`> note:`-Blöcke des aktuellen Beats, Absatz für Absatz, mit den
Bold-Phrasen als Bullets – und der Spiegel der Projektion wandert klein in
eine Ecke. Space läuft über die Karten, dann über die echten Reveals, dann
zur nächsten Folie. Anlass: eine 45-Minuten-Keynote mit ausformuliertem
Redetext und minimalen Folien, bei der das Textarea rechts zu schmal, zu
lang und zu scrollbedürftig ist, um aus dem Augenwinkel gelesen zu werden.

Status: im Bau auf Branch `cue-cards`. Fortschritt in §11, Entscheidungen
unterwegs in §12, offene Fragen in §13 – alle drei am Ende der Datei.

Gestalterische Vorgabe (aus den zwei Entwürfen gewählt): **Entwurf B
„Spur“** – keine Kästen, eine Spur mit Punkten links neben dem Text, Klicks
als Rauten, Cursor als roter Punkt; wenig Chrome, weil jedes Rahmenstück
visuelle Unruhe ist. Abweichend vom Entwurf: der Spiegel deutlich kleiner,
der Redetext bekommt den Platz; und der Redetext serifenlos (die
Sans-Familie der Vorlesung), nicht in der Serifen.

Status: Plan geschrieben, Bau läuft. Keine Änderung am Quellformat, die einen
bestehenden `source.md` anders baut – das Feature liest nur ein Feld mehr.

## 1. Die drei Entscheidungen

**(a) Karten sind ein speaker-lokaler Cursor vor dem Zähler, kein
Sync-Zustand.** `revealed[chunkId]` bleibt der einzige geteilte Reveal-Zustand
(`chunkBeats` build.js:11882, `countSegments` :11938, `advanceReveal`
:12513, `retreatReveal` :12645). Der Kartencursor sitzt *davor*: Space
rückt den Cursor, solange auf dem aktuellen Beat Karten übrig sind, und
erst danach tut Space, was es heute tut. Die Audience, `snapshot()`,
`applyRemoteState`, die Freeze-Gate und die localStorage-Recovery werden
nicht angefasst. Kein toter Space auf dem Projektor, kein neues Feld im
Snapshot, `--audience-only` gegen einen älteren Peer bleibt kompatibel. Das
ist genau die Regel aus CLAUDE.md, die Diagrammschritte auf denselben Zähler
gesetzt hat statt auf einen eigenen: was in nur einem Fenster zählt, macht
die zwei Fenster uneins.

**(b) Alle Karten des aktuellen Beats stehen sichtbar da, der Cursor
wandert.** Nicht eine nach der anderen einblenden. Erledigte Karten gedimmt,
die aktuelle hell und groß, die kommenden leicht abgesetzt darunter. Man
sieht, wo man ist *und* was kommt, und drückt nie blind.

**(c) Die echten Reveals und der Folienwechsel stehen als Einträge in
derselben Spalte.** Zwischen den Karten liegt ein schmaler Balken
„▶ Reveal: ‹erste Worte des nächsten Segments›“ bzw. am Ende
„▶ Folie n+1: ‹Heading›“. Den Text des nächsten Segments liefert die
Reveal-Vorschau, die `applyReveal` (build.js:11950) heute schon mit
`data-next` markiert und nur das Speaker-Stylesheet zeichnet (speaker.md
§4.1 „Reveal preview“); den Folientitel liefert `flatChunks[idx+1]` so, wie
`populatePreviewStrip` (build.js:16080) ihn schon liest. Damit ist die
Verzahnung gelesen statt gemerkt: eine Liste von oben nach unten, jeder
Space ein Eintrag weiter, egal ob Karte oder Klick auf dem Projektor.

## 2. Quellformat

Keine neue Grammatik. `> note:`-Blöcke (build.js:3667–3700, `flushNoteBlock`
:3339) – **nicht** `> annot:`, das ist die öffentliche Annotation, die per
`N` getippt und per `Shift-E` exportiert wird und über den Snapshot auf den
Projektor wandert. Mehrere `> note:`-Blöcke pro Chunk gibt es längst
(`currentChunk.speakerNotes` ist ein Array; das Content-Repo hat Dutzende
Chunks mit mehr als einem Block).

**Kartenableitung aus einem Note-Block:**

| in der Note | auf der Karte |
| --- | --- |
| Absatz (durch Leerzeile getrennt) | eine Karte |
| `**bold**` im Absatz | ein Bullet je Bold-Phrase, der Rest des Absatzes entfällt |
| Absatz ohne Bold | der ganze Absatz in kleiner Type – nichts geht verloren |
| Markdown-Liste (`- ` / `1. `) | Bullets wie geschrieben |
| `#### Titel` | Kartentitel für die folgende Karte |
| `@12:30` allein in einer Zeile oder am Absatzanfang | Sollzeit ab Start; das Cockpit zeigt an dieser Karte die Drift („+1:40“ / „−0:50“) |

Ein Block mit mehreren Absätzen ergibt mehrere Karten; wer eine Karte pro
Block will, schreibt einen Block pro Absatz – beides ist dasselbe.
`print-notes.html` bleibt ein Manuskript: Bolds sind dort Hervorhebungen,
`####` eine Zwischenüberschrift, die Zeitmarke wird als kleine Randnotiz
gesetzt oder gestrichen (Entscheidung im Slice, nicht hier).

**Die Position der Note im Chunk ist ihr Beat.** Eine Note vor dem ersten
`---` gehört zu Beat 1, eine nach dem ersten `---` zu Beat 2 usw. Das ist
die Regel, nach der `chunkBeats` verschachtelte Beats ordnet:
Dokumentreihenfolge ist Reihenfolge. Heute wirft `flushNoteBlock` den Text
in `currentChunk.speakerNotes` und vergisst die Stelle; das Splitten an
`---` passiert erst in `flushChunk` (build.js:3413–3428), fence-aware, und
filtert leere Segmente (`nonEmpty`, :3429).

Änderung im Parser:

- `speakerNotes` wird ein Array von `{text, seg}` statt Strings – oder ein
  paralleles `speakerNoteSegs`, damit die drei bestehenden Leser
  (`renderChunk` :5208/5277 für print-notes, das Template in
  `renderSpeaker` :14742, die Notes-Wortzählung in `--squint` :18256)
  weiter Strings sehen. Empfehlung: paralleles Array, dann bleibt der Diff
  an den Lesern null.
- `flushNoteBlock` merkt sich `bodyLines.length` (die Zeile, an der die
  Note im Body steht) und ob gerade ein Fence offen ist. `flushChunk`
  rechnet beim Splitten für jede Note aus, im wievielten *nicht-leeren*
  Segment ihre Zeile lag. Liegt sie in einem leeren Segment (ein `---`,
  hinter dem nur die Note steht), wandert sie ins vorige. Kein zweiter
  Fence-Zähler, die Zuordnung benutzt den Lauf, der schon da ist.
- Nur top-level `---` zählt. Ein `---` unter der Top-Ebene wird zu
  `BEAT_MARK` (build.js:3818–3843) und ist zur Parse-Zeit im Body, nicht in
  den Segmenten; Diagrammschritte kennt erst der Compiler. Beides sind
  Beats, die der Runtime in `chunkBeats` zwischen zwei Segmenten
  einsortiert. Die Karten eines Segments stehen dann *vor* diesen
  Zwischen-Beats, die als „▶“-Einträge folgen. Das ist die dokumentierte
  Grenze von v1; wer Karten pro Diagrammschritt will, schreibt top-level
  `---`. Erweiterung später: der Parser zählt zusätzlich `BEAT_MARK`-Pushes
  (:3539, :3731, :3842) und `model.steps.length` beim Compile (:3481–3507)
  und liefert eine Positionsnummer, die `chunkBeats.pos` entspricht – das
  ist dann eine zweite Stelle, die mit `chunkBeats` kongruent bleiben muss,
  und deshalb nicht v1.
- **Wo Notes heute vorkommen dürfen:** der Note-Zweig (:3679) liegt *vor*
  den Capture-Zweigen für Overlay, Dock, Expansion und vor der
  Layout-Verarbeitung, also wird eine Note in `::: side`, `::: cols`,
  `::: overlay`, `::: dock` und `::: expand` erkannt und dem Chunk
  zugeschlagen. In `::: draw` (:3458–3519) und `::: cards` / `::: rows`
  (:3529–3562) wird die Zeile in den Block geschluckt – dort ist eine Note
  heute schon ein Fehler und bleibt einer. Der Segment-Index einer Note in
  einem Pane ist der des Top-Level-Segments, in dem das Pane steht. Nichts
  davon ändert sich.

**Bestandsregel: Notes nur im letzten Segment sind Chunk-Notes und
gehören auf Beat 1.** In jedem heutigen Deck stehen die `> note:`-Blöcke am
Chunk-Ende, also *hinter* dem Text des letzten Segments und ohne weiteres
`---` dahinter. Die reine Positionsregel legte sie auf den letzten Beat, und
das ist für ein Deck, das nie an Beats gedacht hat, falsch herum: die Stütze
käme erst nach dem letzten Reveal. Die Regel ist deshalb ein Fallback auf
Chunk-Ebene, nicht pro Note: **hat ein Chunk Notes ausschließlich in seinem
letzten nicht-leeren Segment, bekommen alle den Segment-Index 0.** Sobald
irgendeine Note des Chunks in einem früheren Segment steht, hat der Autor
die Positionsregel benutzt, und dann gilt sie für jede Note des Chunks,
auch für die im letzten Segment. Ein Chunk ohne `---` hat genau ein Segment,
da fallen beide Lesarten zusammen. Bestehende Decks bauen identisch und
zeigen im Kartenmodus alles auf Beat 1; feiner wird es erst, wenn jemand
einen Block hinter ein früheres `---` schiebt. Beide Fälle als Fixture im
Gate (§7). Wer eine Note wirklich auf dem letzten Beat allein haben will,
setzt davor eine Note auf einen früheren Beat – ein Chunk, dessen Stütze
erst nach dem letzten Klick beginnt, ist ohnehin keine, die man bauen will.

**lint.js-Spiegel** (lint.js:2381 `inMetaBlock`, :3160 der `---`-Zähler
`chunkReveals`): dieselbe Zuordnung, plus Warnung `note-in-empty-beat`,
wenn ein Note-Block in einem Segment steht, das sonst leer ist und nicht
das letzte ist – die Note würde ins vorige wandern, was der Autor vermutlich
nicht meint. Kein Fehler, weil der Build es akzeptiert. Wie bei jeder
Parser-Regel: build.js und lint.js im selben Commit.

## 3. Tasten

Heute (`document.addEventListener('keydown')`, build.js:14048–14262, ein
Handler für beide Views): `Space`, `↓`, `PageDown` und `Enter` sind alle
`goForward()` (:12685: erst `advanceReveal`, dann `nextChunk`); `Backspace`,
`↑`, `PageUp` sind `goBack()`; `→`/`←` sind ebenfalls `goForward`/`goBack`
(:14108), `Shift-→`/`Shift-←` die Spalten. **speaker.md §4.2 sagt, Enter sei
lokal für Expansions – das ist veraltet, Expansions liegen auf `1`–`9`
(:14135), Enter ist seit dem Umbau „Down, Space, Enter and a presenter's
forward button are one key“ (:14111) ein Vorwärts-Schritt.** Die Zeile in
speaker.md wird in diesem Zug korrigiert.

Im Kartenmodus:

| Taste | tut |
| --- | --- |
| `Space`, `↓`, `PageDown`, `→` | das Nächste: Karte, sonst Reveal, sonst nächste Folie |
| `Backspace`, `↑`, `PageUp`, `←` | dasselbe rückwärts: Karte zurück, sonst Reveal zurück, sonst vorige Folie (Cursor landet auf der letzten Karte des Ziel-Beats) |
| `Enter` | alle Karten dieses Chunks überspringen und zur nächsten Folie (`nextChunk()`, :12712) – die noch nicht gezeigten Reveals bleiben, wo sie sind |
| `Shift-→` / `Shift-←` | unverändert Spalten |
| `K` | Kartenmodus an/aus (Toggle, lokal, persistiert) |
| `Shift-N` | schaltet in den klassischen Modus und fokussiert das Textarea (Notes tippen bleibt dort) |

**Enter-Konflikt:** Es gibt keinen mit Expansions. Der einzige Konflikt ist
mit Enter = goForward, und der wird bewusst *nur im Kartenmodus* umbelegt:
außerhalb bleibt Enter ein Vorwärts-Schritt, weil Presenter-Fernbedienungen
und Gewohnheit daran hängen. Risiko benennen: eine Fernbedienung, die
„weiter“ als Enter sendet (die meisten senden PageDown oder `→`), springt im
Kartenmodus Folien. Das steht im Help-Overlay und in speaker.md.

**Toggle-Taste `K`.** Freie Buchstaben in beiden Key-Maps (nach :14176–14262
und `renderHelpOverlay` :6742): g, h, i, j, k, m, q, r, u, w, x, y, z. `K`
für Karten; `S` ist in der Audience das Öffnen des Cockpits und im Cockpit
ein No-op, das lassen wir. Dazu ein Footer-Button „▤ cards“ neben
„⇄ layout“ (:14813–14817), weil jede Cockpit-Funktion einen Mausweg braucht
(speaker.md §4.1 „Footer“). Persistenz wie `PREVIEW_ORIENTATION_KEY`
(:16243–16258): ein globaler localStorage-Schlüssel, kein Lecture-Präfix –
wer den Modus mag, will ihn beim nächsten Deck wieder.

**Einhängen des Cursors:** nicht im Key-Handler, sondern in `goForward` /
`goBack` selbst über zwei neue `viewHooks` (`viewHooks.consumeForward`,
`viewHooks.consumeBack`, Default `() => false`; die Familie existiert:
`onActiveChange`, `shouldBroadcast`, `onN`, :11328/:15659/:16234). Dann
laufen Tastatur, Touch-Rail und alles, was `goForward` ruft, durch denselben
Cursor; ein zweiter Pfad wäre die Stelle, an der ein Klick anders zählt als
eine Taste. Der Cursor ist ein einziges Objekt `{chunkId, beat, card}` im
SPEAKER_JS, nicht persistiert; er wird in `viewHooks.onActiveChange` und
nach jedem `applyReveal` auf Karte 1 des aktuellen Beats gesetzt, wenn er
nicht zu diesem Chunk und Beat gehört. Ein `→` in ein anderes Segment oder
eine andere Folie setzt ihn also auf Karte 1, übersprungene Karten werden
nicht markiert – übersprungen heißt, man wusste es.

## 4. Layout

Neuer Body-Zustand `body[data-view=speaker].cue-cards`, ein dritter
Grid-Zustand neben dem Standard (:14850–14858) und `.preview-right`
(:15563–15575). Kartenspalte in der Mitte an Stelle von `#stage-cell`;
`#stage-cell` wird zum Bild in einer Ecke (oben rechts, unter dem Scrubber),
Preview-Strip und Notes-Textarea ausgeblendet, Footer und Scrubber bleiben.

- **Spiegel bleibt derselbe DOM.** `sizeStageViewport` (:15633–15647) setzt
  `--stage-scale` aus `#stage-cell`s Maßen über einen ResizeObserver; die
  Ecke ist nur ein kleineres `#stage-cell`, mehr muss nicht passieren.
  Reveal-Vorschau, Blank, Demo-Badge laufen darin weiter.
- **Laserpointer per Hover bleibt.** Der Sender hängt an
  `viewport.pointermove` (:16463–16472) und schickt `x`/`y` als Anteil der
  `getBoundingClientRect()` des aktiven Chunks; die Audience setzt den Punkt
  bei `r.left + px * r.width` (:11701). Der Maßstab kommt also nirgends vor,
  ein kleiner Spiegel zeigt genauso richtig – nur mit gröberer Hand. Prüfen
  im Spec, dass `pointerleave` im kleinen Zustand den Punkt noch löscht.
- **Kopfzeile der Kartenspalte:** Spaltenüberschrift › Chunk-Heading;
  fehlt das Heading (Keynote-Stil), die erste Zeile des Chunks (erster `p`
  im ersten `.reveal-segment`, gekürzt). Rechts „Folie n/N · Beat k/K ·
  Karte i/I“. Spaltenüberschrift steht schon im Scrubber (`.col-btn`,
  :14752), Chunk-Heading in `.chunk-heading`.
- **Uhr, beide Layouts.** Der Timer sitzt heute als 11-px-Mono-Span im
  Footer (:14810, `#speaker-footer #timer` :15214) neben dem Key-Crib und
  ist dort nicht zu sehen. Er wird ein eigenes Element `#clock` außerhalb
  des Footers: im klassischen Layout oben rechts *über* dem Letterbox-Rand
  von `#stage-cell` (dort steht schon `#add-note-btn`, :14795), im
  Kartenmodus in der Kopfzeile der Spalte. Groß, mono, tabellarische
  Ziffern. Der Footer-Span entfällt. Dazu zwei Dinge, die der alte Timer
  nicht kann und eine Keynote braucht: `tStart` ist heute der Seitenaufruf
  (:16218), also zehn Minuten zu früh, wenn das Cockpit vor dem Vortrag
  offen ist – ein Klick auf die Uhr startet neu (und ein zweiter Klick
  hält an), und mit Zeitmarken zeigt sie neben der Laufzeit die Drift an
  der aktuellen Karte. Klick statt Taste, aus demselben Grund wie die
  Notes-Zoom-Buttons: jede freie Taste ist eine Navigation.
- **Karten aus demselben Text wie das Textarea.** `loadNotesFor(id)`
  (:15953) liefert Override aus `localStorage` (`noteOverrideKey`,
  `speakernote:<id>`, :15947) oder den Template-Text (`sourceNotesFor`,
  :15948), `populateNotesPane` (:15992) schreibt ihn ins Textarea, der
  `input`-Listener (:15997) speichert. Die Karten lesen denselben
  `loadNotesFor`-Text – siehe §5 für das Wie.

## 5. Rendern der Karten – Empfehlung

`marked` ist im Speaker-Runtime nicht vorhanden; es läuft nur zur Build-Zeit
(`marked.parse` in den Renderern, Templates tragen den *rohen* Notes-Text
escaped, :14735–14746). Drei Wege:

1. Karten zur Build-Zeit mit `marked` vorrendern als zweites Template pro
   Block mit `data-seg`, Overrides aus dem Textarea im Kartenmodus mit einem
   Mini-Parser nachrendern → zwei Renderer für einen Text, die auseinander
   laufen.
2. Overrides im Kartenmodus nicht unterstützen → die Probenkorrektur, die
   das Textarea genau dafür hat, gilt dann in dem Modus nicht, in dem sie
   gebraucht wird.
3. **Empfehlung: ein zero-dep Modul `cue-cards.mjs` mit einer einzigen
   reinen Funktion `notesToCards(text) → [{title, bullets, prose, at}]`**,
   das build.js zur Build-Zeit importiert *und* als Text in `SPEAKER_JS`
   splict – das Muster von `diagram-core.mjs` und dem QR-Encoder
   (`qrLibJs()`, :14829): ein Text, zwei Laufzeiten. Die Kartengrammatik ist
   absichtlich winzig (Leerzeile, `**…**`, `- `/`1. `, `####`, `@mm:ss`);
   Inline-Code, Links, Kursiv werden auf Text reduziert. Das Textarea
   bleibt Rohtext, die Karten werden im Runtime aus `loadNotesFor` gebaut,
   Override und Quelle gehen denselben Weg, und die Funktion ist ohne
   Browser und ohne `npm install` testbar (§7). Die Segment-Zuordnung
   bleibt am Block: das Template trägt pro Block ein eigenes
   `<template data-notes-for=id data-seg=k>`; das bestehende
   `data-notes-for`-Template (ein Text pro Chunk, Blöcke mit Leerzeilen
   verbunden) bleibt für Textarea, `--squint` und Overrides, wie es ist.
   Ein Override überschreibt den ganzen Chunk-Text; seine Karten landen
   dann alle auf Beat 1, weil ein Textarea keine Segmentgrenzen kennt –
   akzeptiert und im Help-Text gesagt. Wer es feiner will, ändert die
   Quelle.

## 6. Nicht-Ziele

- Kein Teleprompter, kein scrollender Fließtext – das ist der Modus, den es
  schon gibt, nur größer, und er erzeugt den abgelesenen Vortrag.
- Bullets werden nicht einzeln eingeblendet. Feinere Granularität ist ein
  zweiter Absatz.
- `> annot:` wird nicht angefasst.
- `audience.html`, das Sync-Protokoll (speaker.md §2/§3), `chunkBeats`,
  `countSegments`, `applyReveal`, `FROM_SEL`, `FOCUSABLE_SEL` werden nicht
  angefasst. Der einzige Eingriff in `AUDIENCE_JS` sind die zwei
  `viewHooks`-Aufrufe in `goForward`/`goBack`, deren Default `false` ist.
- Keine Zeitmarken-Automatik (kein Verteilen der Sollzeit auf Karten).

## 7. Tests

`test/README.md`: was ohne Browser entscheidbar ist, gehört in `lint.js`
oder `test/gates/`, das Browser-Suite ist keine Unit-Suite. Die Gates sind
zero-dep – `build.js` (und damit `parseLecture`) ist dort nicht ladbar.

**Gate `cue-cards`** (neu, zero-dep, weil `cue-cards.mjs` es ist):
`notesToCards` gegen Fixtures – Absatz mit drei Bolds, Absatz ohne Bold,
Liste, `####`, `@mm:ss` am Absatzanfang und allein, Inline-Code und Link
zu Text reduziert, leerer Text. Dazu, wie beim `inlined`-Gate: der Text des
Moduls kommt unverändert in `SPEAKER_JS` an (Backtick- und
Backslash-Prüfung, §9).

**Parser-Segmentindex** braucht `parseLecture`, also `node_modules`: kommt
in die Browser-Suite als Fixture-Deck nach dem Muster der sieben Specs, die
ein eigenes Deck bauen (`test/settings.mjs` als Vorbild) – ein Chunk mit
drei Segmenten und Notes davor, dazwischen, dahinter, eine Note in einem
leeren letzten Segment, eine Note in `::: side`, ein Chunk mit allen Notes
am Ende und keinem `---`. Gelesen wird `data-seg` an den Templates in der
gebauten `speaker.html`. Dasselbe Deck durch `lint.js` für
`note-in-empty-beat`.

**Browser-Spec `cue-cards.mjs`** (Familie Navigation, neben `nav-cockpit`):
Audience + Cockpit über `S`; `K` schaltet um, `body.cue-cards` und die
Persistenz; auf einem Chunk mit zwei Karten und zwei Segmenten: Space ×
(2 Karten + 1 Reveal + Folienwechsel) und nach jedem Druck `revealed` in
*beiden* Fenstern gleich und `activeIdx` gleich; Backspace denselben Weg
zurück; Enter springt Folie bei stehendem `revealed`; `→` auf eine andere
Folie setzt den Cursor auf Karte 1; Hover auf dem kleinen Spiegel erzeugt
`cursor`-Messages mit `x`/`y` in [0, 1] und `pointerleave` löscht;
`#clock` existiert in beiden Layouts, Klick setzt zurück; Drift-Anzeige
bei einer `@0:00`-Karte nach zwei Sekunden „+0:02“.

## 8. Doku, die mitzieht

- `speaker.md` §4.1 (Layout: dritter Zustand, Uhr, Kopfzeile), §4.2
  (Tastentabelle: `K`, Enter im Kartenmodus, die veraltete Enter-Zeile
  korrigieren), §5 (neuer globaler localStorage-Schlüssel).
- `renderHelpOverlay` (build.js:6742): `K` in der Speaker-Gruppe, Enter mit
  seinem Modus-Vorbehalt, Klick auf die Uhr als Mausgeste.
- `CLAUDE.md`: Absatz unter *Four outputs* zu `cue-cards.mjs` als drittes
  gesplictes zero-dep Modul; `viewHooks.consumeForward` neben
  `FOCUSABLE_SEL`/`FROM_SEL` als „eine Stelle, nicht zwei“.
- `.claude/skills/psi-slides-authoring/SKILL.md` (Notes-Abschnitt ab
  Zeile ~370): die Kartenregeln, die Positionsregel, `@mm:ss`.
- `HANDOFF.md`: Slice-Eintrag; `CHANGELOG.md` unter `## [Unreleased]`.
- `lectures/tutorial/source.md`: ein Chunk, der Notes hinter `---` und eine
  Zeitmarke zeigt; danach alle vier Views neu bauen und committen.

## 9. Risiken

- **Template-Literal-Fallen** (CLAUDE.md *Conventions*): alles Neue in
  `SPEAKER_JS` und dem Speaker-CSS liegt in Backtick-Literalen. Kein
  Backtick, auch nicht im Kommentar; Regex-Backslashes doppelt
  (`/\\*\\*(.+?)\\*\\*/`); `node test/gates/run.mjs inlined` vor jedem
  Build-Urteil. Das Splicen von `cue-cards.mjs` als Text umgeht die Falle
  für die Kartengrammatik vollständig, weshalb die Bold-Regex *dort* lebt
  und nicht im Literal.
- Ein unterminiertes `/*` im neuen CSS frisst Regeln bis zum nächsten
  `*/`; `assertStylesheetsWellFormed()` fängt es, aber nur beim Build.
- `2>&1 >/dev/null` verbirgt den SyntaxError und lässt die alte HTML
  liegen; nach jeder Änderung `grep -F` des neuen Bezeichners in der
  gebauten `speaker.html`.
- Die Positionsregel dreht die Zuordnung bestehender Notes-am-Ende-Chunks
  um, wenn die Leeres-Segment-Regel nicht greift (Note steht hinter einem
  `---` mit Text davor). Das Fixture-Deck in §7 hat genau diesen Fall.
- Enter im Kartenmodus und Fernbedienungen, §3.

## 10. Slices, in dieser Reihenfolge

1. **Parser + lint:** `seg` pro Note, Leeres-Segment-Regel, zweites
   Template mit `data-seg`, `note-in-empty-beat`; Fixture-Deck und
   Lint-Assertion. Baut jeden bestehenden `source.md` byte-identisch bis auf
   die neuen Templates.
2. **`cue-cards.mjs` + Gate:** `notesToCards`, Splice in `SPEAKER_JS`,
   Gate mit Fixtures und Splice-Prüfung.
3. **Uhr:** `#clock` in beiden Layouts, Klick-Reset, Footer-Span raus,
   speaker.md §4.1. Eigener Commit, weil unabhängig nützlich.
4. **Kartenspalte + Layout:** `.cue-cards`-Grid, Spiegel in der Ecke,
   Kopfzeile, Karten-Rendering mit Cursor-Zuständen, `K` + Footer-Button +
   Persistenz, Help-Overlay.
5. **Cursor:** `viewHooks.consumeForward`/`consumeBack`, Enter im Modus,
   Reset in `onActiveChange`, die „▶“-Einträge aus `data-next` und
   `flatChunks[idx+1]`.
6. **Zeitmarken + Drift.**
7. **Browser-Spec, Tutorial-Chunk, Doku, CHANGELOG, HANDOFF.**

## 11. Fortschritt

- [x] Slice 1 Parser + lint – `noteSegments()` in build.js, `speakerNoteSegs` parallel zu `speakerNotes`, zweites Template `data-cards-for`/`data-seg`; lint `note-in-empty-beat`. Fixture-Deck mit fünf Fällen von Hand geprüft, Korpus und Content-Repo linten ohne neue Warnung.
- [ ] Slice 2 `cue-cards.mjs` + Gate
- [ ] Slice 3 Uhr
- [ ] Slice 4 Kartenspalte + Layout
- [ ] Slice 5 Cursor
- [ ] Slice 6 Zeitmarken + Drift
- [ ] Slice 7 Spec, Tutorial, Doku

## 12. Entscheidungen unterwegs

- **Zweites Template heißt `data-cards-for`, nicht `data-notes-for`.**
  Zwei Templates mit demselben Attribut hätten `sourceNotesFor` (liest das
  erste per `querySelector`) umgebogen; ein eigener Name lässt Textarea,
  Overrides und `--squint` unberührt.
- **lint.js zählt nur top-level `---`** (`!activeDirective &&
  !layoutStack.length`), wie der Build: ein `---` im Pane wird dort zu
  `BEAT_MARK` und erreicht die Segment-Aufteilung nie.

## 13. Offene Fragen an den Autor
