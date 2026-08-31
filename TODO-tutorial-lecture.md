# TODO – Tutorial-Lecture

Rückmeldungen aus einem Durchgang durch `lectures/tutorial/` (Audience- und
Lectern-View, Desktop und iPad). Die Original-Nummern sind als `[#n]` erhalten.

**Abschnitte C und D – der ganze Textdurchgang und alle vier Umbau-Blöcke –
sind fertig.** Was hier steht, ist das, was noch offen ist; der Rest ist unter
*Was erledigt ist* zusammengefasst und steht ausführlich in den Commits.
Erledigte Punkte sind aus der Liste entfernt, nicht abgehakt: eine Handoff-Datei,
in der man sechs offene Punkte zwischen fünfzig erledigten suchen muss, ist
keine.

---

## Was noch offen ist

Sechs Punkte. **Zwei davon fangen mit einer Messung an, nicht mit einer
Änderung** – bei `#1` und `#41` widerspricht der Code der Beobachtung, und ohne
Reproduktion ändert man das Falsche.

### A. Engine – Mini-Fixes ← hier weitermachen

Jeder Punkt eine überschaubare Änderung an `build.js`, mit klarem Befund.

- [ ] **[#9] Bei großer Schrift überlagern die EXP-Buttons den Text.**
      *Befund:* `.exps` ist `position: absolute; bottom: …` im Chunk und skaliert
      mit `--zoom`; der Fließtext wächst darunter durch.
      *Vorschlag:* Am Chunk mit Expansions unten Platz reservieren, statt die
      Buttons aus dem Chunk zu ziehen – die Geste „Knopf in der Ecke der Folie“
      soll bleiben. Die Leistenhöhe ist zoomabhängig, also über dieselbe
      `em`-Rechnung wie `.exp-chev` als `padding-block-end` an `.chunk-content`.
      *Warnung aus `[#17]`:* `em` erbt dort die zoomskalierte Foliengröße. Das
      ist hier **richtig** – der Platz soll ja mitwachsen –, war es bei einem
      Bedienelement aber nicht. Nicht reflexhaft auf `rem` umstellen.

- [ ] **[#10, Teil Desktop] Geöffnete Expansions nutzen zu wenig Breite.**
      *Befund:* `.chunk.expanded` ist ein Zweispalten-Grid mit `minmax(0, 36em)`
      rechts – fix, unabhängig von der Chunkbreite.
      *Vorschlag:* Rechte Spalte an die Chunkbreite koppeln.
      Der Mobile-Teil von `[#10]` ist mit `[#17]` erledigt: unter 900 px
      überlagert die Expansion die Folie, statt in eine halbe Spalte gequetscht
      zu werden.

- [ ] **[#1] Zeilenumbruch: zweite Zeile oft länger als die erste.**
      *Befund – kleiner als der Punkt klingt, aber anders gelagert als gedacht:*
      `text-wrap` ist längst breit im Einsatz. `PRINT_CSS` hat die zwei
      allgemeinen Regeln (`h1…h4` `balance`, `p, li, dd` `pretty`).
      `AUDIENCE_CSS` hat acht Regeln, darunter **schon** eine für genau den
      beklagten Fall: `[data-collapse=topic-bold] .reveal-segment p, li,
      .sentence-rest strong { text-wrap: balance }`. Überschriften, Cards und
      die Inhaltsliste ebenfalls. `SPEAKER_CSS` hat keine eigenen und braucht
      auch keine, es erbt `AUDIENCE_CSS`.
      **Was fehlt:** eine allgemeine `p { text-wrap: pretty }` in
      `AUDIENCE_CSS`. Der **volle Text** (`C` einmal gedrückt) bekommt also gar
      keine Behandlung.
      *Erster Schritt:* herausfinden, in welchem der beiden `C`-Modi die Klage
      gemeint war. Wenn im kollabierten, ist `balance` dort schon aktiv, und es
      geht um eine Grenze von `balance` selbst – Chrome hört ab einer bestimmten
      Zeilenzahl auf zu balancieren. Das ist **nicht verifiziert** und wäre das
      Erste zum Nachmessen. Ein Test mit demselben Wort wiederholt beweist
      nichts, dann sind alle Zeilen ohnehin gleich breit; echten Fließtext
      nehmen.
      *Beachten:* `body:not([data-wrap=none])` steht vor jeder dieser Regeln.
      Das ist der `style: {wrap: none}`-Schalter, mit dem ein fertiger
      Foliensatz sich gegen ein Neu-Umbrechen wehren kann. Neue Regeln tragen
      ihn mit.

### B. Engine – größer

Zwei Reproduktionen und eine Aufnahme. Keiner ist bisher nachgestellt.

- [ ] **[#5] iPad, Lectern-View: `f` öffnet manchmal die Suche statt den Font zu
      wechseln.** Auch nach Antippen der Folie.
      *Status:* **nicht reproduziert, braucht ein echtes iPad.**
      *Verdacht:* ein Fokusproblem – der `keydown`-Handler hängt am `window`,
      aber ein Feld (Notizen, Annotation, Suchfeld) hat noch den Fokus und
      schluckt oder verschiebt die Taste. Erster Schritt: prüfen, ob
      `endSearch()` / `blurAnnotation()` auf iPadOS den Fokus wirklich abgeben,
      und ob `startSearch()` von einem `beforeinput` statt von `keydown`
      erreicht wird.

- [ ] **[#41] iPad: Diagram-Steps laufen angeblich nur bei fokussierter
      Abbildung.** Bei normal geöffnetem Chunk springe Vorwärts direkt zum
      nächsten Chunk.
      *Status:* **nicht reproduziert, und es widerspricht dem Code** –
      `countSegments()` zählt `chunkBeats()` unabhängig vom Fokus.
      *Verdacht:* Der beobachtete Chunk war schon durchgelaufen; dann ist es
      `[#43]` von der anderen Seite – „Vorwärts auf einer fokussierten Abbildung
      wechselte den Chunk“, behoben in `e7dfc45`. **Vor jeder
      Änderung reproduzieren**, mit `revealed[chunkId]` im Blick.

- [ ] **[#30] Das eingebettete Video zeigt kein bewegtes Bild.**
      *Befund:* `assets/reveal-demo.mp4` ist intakt – 960×540, h264, 72 Frames
      auf 6 s. Es bewegt sich, zeigt aber drei fast statische Stufen einer Folie,
      also sieht ein Standbild fast genauso aus.
      **Entschieden: neuer Clip**, kein Bug. Kandidat: ein Kameraschwenk über das
      Overview-Board (`O`, dann Ziehen und Scrollen) oder ein
      `autoplay`-Diagramm beim Durchlaufen. Muss unter `MAX_INLINE_VIDEO_BYTES`
      (12 MB) bleiben und sollte in der Größenordnung der jetzigen 34 KB liegen,
      sonst wächst jede der vier Views.

---

## Wie hier verifiziert wird

```bash
node lint.js lectures/                # alle fünf Lectures, zero-dep
npm run gate                          # 422 Assertions, ~0,5 s, kein Browser
npm run settings                      # 244 Assertions, ~1 min, baut selbst
node test/run.mjs                     # 583 Assertions, ~6 min, baut selbst
node test/run.mjs nav                 # nur die Specs, deren Name passt
```

Beim Anfassen der Live-Views mindestens `nav`, bei `editor.mjs` auch `editor`.
Prosa geht durch `writing-skills:human-writing` und
`writing-skills:prose-passes`; alles an Grammatik oder Renderern durch die
`psi-slides-*`-Skills.

**Getrackte Outputs neu bauen und mitcommitten**, sobald `build.js` oder eine
der drei Quellen sich ändert – sonst schlägt der Release-Workflow fehl:

```bash
node build.js lectures/tutorial/source.md      # alle vier Views
node build.js lectures/diagrams/source.md      # alle vier Views
node build.js lectures/decoration/source.md --audience-only
node build.js lectures/decoration/source.md --print-only
```

## Zwei Fallen, in die ich gelaufen bin

**Ein rohes Backtick in einem Kommentar innerhalb eines Template-Literals**
beendet das Literal, und `build.js` parst nicht mehr. Dreimal passiert, jedes
Mal in einem Kommentar, der ein Ding beim Namen nennen wollte. Der
`SyntaxError` zeigt auf den Bezeichner *danach*, achttausend Zeilen tief. Seit
Commit `674cbcd` findet `node test/gates/run.mjs inlined` das in Millisekunden
und nennt Literal und Zeile – **vor** einem Build laufen lassen, nicht danach
rätseln.

**`node build.js … 2>&1 >/dev/null` verschluckt genau diesen Fehler** und lässt
das *vorherige* HTML auf der Platte. Der Browser zeigt dann einen alten Build,
der aussieht wie eine Änderung ohne Wirkung. Nach jedem Eingriff in inlined
CSS/JS die neue Regel per `grep -F` im gebauten HTML nachweisen.

---

## Was erledigt ist

Elf Slices. Die Commit-Nachrichten tragen die Begründungen; diese Tabelle ist
der Index. Was in C und D im Einzelnen geändert wurde, steht dort und nicht
mehr hier.

| # | Was | Commit |
|---|---|---|
| 1 | Plan angelegt und jeder Punkt gegen den Code verifiziert – die *Befund*-Zeilen bei den offenen Punkten sind das Ergebnis, nicht Vermutungen. Drei Punkte kippten dabei; sie stehen unter *Entschieden*. | – |
| 2 | **Engine-Slice 1:** `#16` Suchindex, `#31` Formel-Zoom, `#43` Fokus als Navigationsstufe, `#55` `rule`-Divider, `#6` `option` im `?`-Overlay. Im Browser gemessen: `/welcome` findet die Divider-Folie; die Formel wächst beim Klick von 77 auf 230 px Höhe, gleich bei 1440 und 1920 breit; Vorwärts auf einer fokussierten Abbildung ohne Steps schließt die Karte und bleibt auf dem Chunk, der zweite Druck geht weiter. | `e7dfc45` |
| 3 | **Text-Slice 1**, die unstrittigen Streichungen und Faktenfehler: `#2`, `#3`, `#11`, `#13`, `#14`, `#15`, `#52`, `#6`. | `bfdff5f` |
| 4 | **[#8] Navigationsmodell.** `←`/`→` sind überall Vor/Zurück, `Shift`+`←`/`→` wechselt die Spalte von jedem Chunk aus. Mit weggefallen: der `sideways`-Guard in der Key-Map, das gleichnamige Feld in `markColumnEdges()`, die beiden `‹ ›`-Marken samt CSS. `nextCol`/`prevCol` stehen jetzt still, wenn es keine Spalte in die Richtung gibt – vorher fiel `nextCol` auf den letzten Chunk der Lecture durch, was der alte Guard unerreichbar hielt und `Shift` von jeder Folie der letzten Spalte aus erreichbar gemacht hätte. Mitgezogen: `?`-Overlay, `PRD.md` §5, `README.md`, `speaker.md`, Tutorial `#arrows`, `CHANGELOG.md`, `test/harness.mjs` (`hints` ist jetzt ein Zeichen statt drei), `test/nav.mjs`, `test/nav-cockpit.mjs`. | `e9c3730` |
| 5 | **Nebenprodukt: `test/gates/inlined.mjs`.** Prüft die beiden statisch entscheidbaren Fallen in den Template-Literalen von `build.js`: rohes Backtick und einfacher Regex-Backslash (`/\s+/g` wird zu `/s+/g` und geht still in Produktion). Beide Hälften gegengeprüft, indem der Defekt eingebaut und das Gate fallen gesehen wurde. Die dritte Falle, unterminiertes `/*`, hat mit `assertStylesheetsWellFormed()` längst einen harten Build-Fehler und wird nicht doppelt geprüft. `CLAUDE.md` und `run.mjs` sagen jetzt beide „sechs Gates“. | `674cbcd` |
| 6 | **[#17/#4/#10-mobile] Touch-Bedienung.** Die Leiste lag nur in `audience.html` – nicht in dem Fenster, das man am Rednerpult in der Hand hält – und trug ausgerechnet das, was Tippen und Pinchen ohnehin können. Jetzt in beiden Live-Views, mit `⋯`-Palette für `C` `F` `A` `#`, Suche und Textauswahl. Drei echte CSS-Fehler kamen erst beim Messen heraus: eine ID-Regel schlug `[hidden]`, `em` erbte die zoomskalierte Foliengröße (441 px Leiste auf einem 390-px-Telefon, und `rem` war wegen Text-Autosizing nicht besser – jetzt `clamp()` gegen die Viewportbreite, Untergrenze 44 px), und `left: 50%` gibt einem fixierten Element ohne Breite nur die halbe Viewportbreite als *Layout*raum. In zehn Konfigurationen gemessen. | `12f67d4` |
| 7 | **Text-Slice 2 – der ganze Textdurchgang (Abschnitt C, 27 Punkte).** `#39` und `#54` zuerst, wie geplant: „document“ als Name für die Print-Views ist überall durch `print.html` / `print-notes.html` ersetzt (vorher geprüft, dass `> annot:` wirklich in *beiden* Dateien landet – `annotationHtml` hängt nicht an `withNotes`), „saying nothing“ durch „the default“. Dann die restlichen 19 Punkte. `#22` heißt jetzt „auto-fit“, weil `?`-Overlay, Frontmatter-Key und Flash-Meldung das Ding alle so nennen. `#28` zeigt ein Bild mit Alt-Text, statt die Caption-Regel zu behaupten. | `d52fd3b` |
| 8 | **D-Block 1 – Decoration.** `#deco-cards` und `#deco-picture` sind aufgelöst: die Konstrukte werden jetzt genau einmal eingeführt, in einem Lauf, und dort *gezeigt* statt abgedruckt. Neu `#cards-look` mit `{accent}` und `{outline middle}` als sichtbaren Beispielen; die gerenderten Klassen (`cg-accent`/`cv-top` gegen `cg-outline`/`cv-middle`) bestätigen die Behauptungen. Die Cards-Demo trägt jetzt eine gefaltete zweite Ebene, damit `C` auf der Folie tut, was der Satz daneben sagt. | `c5cdd9b` |
| 9 | **D-Block 2 – Diagramme.** `#diagram` war der längste Chunk der Lecture *und* die erste Begegnung mit `::: draw`. Jetzt vier Chunks: fünf Zeilen und ihre Zeichnung, dieselbe Zeichnung mit zwei `step`-Blöcken, die sechs Slots, Placement. Im gebauten Page nachgezählt: dg1 ohne Frames-Payload (statisch), dg2 mit `n:3`. Eigene id `#diagram-beats` – `#diagram-steps` gehört der großen Alice/Eve-Figur, und ids sind eingefroren. | `3259d90` |
| 10 | **D-Block 3 – Kernidee.** `#topic-sentence` sagte „der Topic Sentence“, Singular; PRD §4.5 und `splitSentencesIn` nehmen den ersten Satz **jedes** Absatzes. Trägt jetzt die Arbeitsreihenfolge (erst Prosa, dann die Eröffnungen schärfen), die sonst nirgends stand, und ist selbst vier Absätze – am gebauten Page nachgezählt, nicht geschätzt. `#33` gestrichen, `#19` ohne die Abbildung umformuliert, die es nie gab. | `d5d4bca` |
| 11 | **D-Block 4 – `::: footnote`.** `::: margin` baut weiter und ist nirgends mehr dokumentiert. `word` merkt sich die geschriebene Schreibweise, damit „was never closed“ die getippte Zeile zitiert. `test/settings.mjs` sichert den Alias in **beiden** Views ab (`.margin-note` live, `.chunk-expansion-margin` auf Papier) – gegengeprüft, indem `margin` aus dem Parser entfernt und der Test fallen gesehen wurde. | `04c2921` |

### Beim Verifizieren nebenbei gefunden

Vier Fehler, die in keinem Punkt der Liste standen – jeder kam heraus, weil eine
Behauptung des Tutorials gegen den Code geprüft wurde statt geglaubt:

- **`lectures/decoration` dokumentierte vier `::: backdrop`-Slot-Gruppen, es
  sind fünf.** `focus` (`sharp` | `blur`) fehlte in genau der Lecture, die
  jedes Konstrukt zeigen soll. Das Tutorial hatte es richtig. (`1593233`)
- **`#figure-focus`: „click any figure, code block or margin note“.** Eine
  Margin Note war nie klickbar – `FOCUSABLE_SEL` führt `.marginalia` und nicht
  `.margin-note`. (`04c2921`)
- **`#margin-demo`: „the label reads NOTE unless you say otherwise“.** Die
  Direktive nimmt kein Label, es ist auf `note` festverdrahtet. Es gab kein
  „otherwise“. (`04c2921`)
- **`#cards`: „`ground: photo`“ ist keine Syntax.** `parseSlotClasses` liest
  blanke Wörter in Klammern; ein `key: value` in einem Tail hätte den Build
  angehalten. (`c5cdd9b`)

### Entschieden – nicht wieder aufmachen

Drei Punkte kippten beim Prüfen und sind bewusst *keine* Arbeit:

- **[#44] Der Link „in the decoration lecture“ hat keinen QR-Code – richtig so.**
  QR-Codes gibt es nur für `https?://`-Adressen (`marked`-Renderer, `isExternal`).
  Ein relativer Pfad ist auf einem fremden Telefon nichts wert.
- **[#30] Das Video ist kein Bug** – die Datei ist intakt, der Clip zeigt nur
  fast nichts. Bleibt als Aufnahme-Aufgabe in B stehen.
- **[#41] widerspricht dem Code** – `countSegments()` zählt `chunkBeats()`
  unabhängig vom Fokus. Steht in B als Reproduktion, nicht als Fix.

Drei Punkte kamen anders heraus als der Plan vorschlug, jeweils mit Grund:

- **[#19]** hat die Abbildung aus dem *Satz* verloren, statt eine in den Chunk zu
  bekommen: `::: draw` wird erst in der Beyond-Spalte eingeführt, und es dort zu
  benutzen wäre genau der Fehler, den `#21` und `#25` beschreiben.
- **[#32]** blieb ein Chunk statt zwei – das sichtbare `C`-Beispiel ist
  `#derived-mode`, ein zweites hätte die Sache zum dritten Mal erklärt.
  `#topic-sentence` trägt jetzt die Arbeitsreihenfolge, `#derived-mode` den
  Mechanismus.
- **[#45]** wurde durch `#47`/`#49` gegenstandslos: `#deco-cards` ist ganz
  aufgelöst, `#deco-idea` eröffnet den Decoration-Lauf vor `#covers`.
