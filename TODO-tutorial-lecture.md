# TODO – Tutorial-Lecture

Rückmeldungen aus einem Durchgang durch `lectures/tutorial/` (Audience- und
Lectern-View, Desktop und iPad). Die Original-Nummern sind als `[#n]` erhalten.

**Abschnitte A, C und D sind fertig** – der ganze Textdurchgang, alle vier
Umbau-Blöcke und die drei Engine-Mini-Fixes. Was hier steht, ist das, was noch
offen ist; der Rest ist unter *Was erledigt ist* zusammengefasst und steht
ausführlich in den Commits. Erledigte Punkte sind aus der Liste entfernt, nicht
abgehakt: eine Handoff-Datei, in der man drei offene Punkte zwischen fünfzig
erledigten suchen muss, ist keine.

---

## Was noch offen ist

Ein Punkt, und er braucht ein echtes iPad. Die Bildschirmaufnahme (`[#30]`)
ist gemacht, und `[#5]` ist beantwortet: es war Safaris Seitensuche. Alles, was ohne ein Gerät zu klären war, ist
geklärt – bei `[#5]` sind unten zwei Mechanismen mit Messung
ausgeschlossen und eine Frage formuliert, die der nächste iPad-Durchgang in
fünf Sekunden beantwortet.

### B. Engine – größer ← hier weitermachen

- [x] **[#5] iPad, Lectern-View: `f` öffnet manchmal die Suche statt den Font
      zu wechseln.** – *geschlossen, kein Fehler im Code.*
      **Es war Safaris eigene Seitensuche**, nicht das Suchpanel der Lecture –
      beantwortet beim iPad-Durchgang. Damit ist die Frage, die hier stand,
      beantwortet und die Diagnose steht: `⌘F` ist durchgekommen. Wie, ist eine
      Frage an die Tastatur (Sticky Keys, Globe-Taste, Belegung) und nicht an
      `build.js`.

      Die zwei Ausschlüsse, die vorher hier standen, bleiben als Messung
      wertvoll und sind der Grund, dass diese Antwort genügt: `startSearch()`
      hat genau zwei Aufrufer (`case '/'` und den `search`-Knopf), es gibt
      keinen Type-to-Search-Zweig, und die zwölf Knöpfe der Touch-Palette sind
      an sechs iPad-Größen vermessen – 56 × 56 px, kein Überlappen, `F` und `⌕`
      liegen nicht nebeneinander. Ein `f` konnte das Panel nie öffnen.

- [ ] **[#41] iPad: Diagram-Steps laufen angeblich nur bei fokussierter
      Abbildung.** Bei normal geöffnetem Chunk springe Vorwärts direkt zum
      nächsten Chunk.
      *Status:* **nicht reproduziert, und es widerspricht dem Code** –
      `countSegments()` zählt `chunkBeats()` unabhängig vom Fokus.
      *Verdacht:* Der beobachtete Chunk war schon durchgelaufen; dann ist es
      `[#43]` von der anderen Seite – „Vorwärts auf einer fokussierten Abbildung
      wechselte den Chunk“, behoben in `e7dfc45`. **Vor jeder
      Änderung reproduzieren**, mit `revealed[chunkId]` im Blick.

- [x] **[#30] Das eingebettete Video zeigt kein bewegtes Bild.** – *erledigt.*
      Neu aufgenommen: ein Schwenk über das Overview-Board, aufgezeichnet mit
      Playwrights `recordVideo` über denselben Browser, den `test/harness.mjs`
      findet, und über dieselbe `serve()`-Funktion. 640×360, 10 fps, 7,2 s,
      h264 crf 36, **78 KB**. Im gebauten Page nachgemessen: als `data:`-URI
      eingebettet, `readyState` 4, **null Netzwerk-Requests**, und sechs
      Stichproben im Abstand von 0,4 s liefern sechs verschiedene Bilder – was
      beim alten Clip gerade nicht der Fall war.

      Zwei Zahlen für den nächsten, der ihn ersetzt. Ein Schwenk über dichten
      Text ist teuer: bei 960×540 kostete derselbe Clip 212 KB bei crf 36 und
      596 KB bei crf 28. Die Auflösung ist der Hebel, nicht die Qualität – das
      Board liest man als Formen, nicht als Text. Und der Clip landet in
      **jeder** der vier Views, hier +59 KB auf `audience.html`.

---

## Wie hier verifiziert wird

```bash
node lint.js lectures/                # alle fünf Lectures, zero-dep
npm run gate                          # 440 Assertions, ~0,5 s, kein Browser
npm run settings                      # 329 Assertions, ~1 min, baut selbst
node test/run.mjs                     # 827 Assertions, ~7 min, baut selbst
node test/run.mjs nav                 # nur die Specs, deren Name passt

node build.js <source.md> --squint    # was die Projektion malt, als Text
node build.js <source.md> --check-fit # Folien, die passen und trotzdem raushängen
```

**Vor jeder inhaltlichen Diskussion über eine Folie: `--squint` laufen lassen
und `squint.txt` lesen.** Der Collapse ist CSS und JS – wer `source.md` liest,
liest nicht die Folie, und genau diese Verwechslung hat an einem Tag sechs
Defekte produziert.

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

### Ein Layout im Browser messen, statt es anzuschauen

Die drei A-Punkte waren alle drei anders gelagert, als sie aussahen, und in
allen drei Fällen hat dasselbe Vorgehen es gezeigt: `test/harness.mjs`
importieren, `serve()` + `openDeck()`, und dann **die Kästen ausrechnen lassen,
statt sie zu beurteilen**. Für Textzeilen liefert `Range.getClientRects()` pro
Zeile ein Rechteck – damit ist „der Knopf liegt auf dem Text“ ein Schnitttest
und keine Meinung, und „die zweite Zeile ist länger als die erste“ eine Zahl.

Zwei Fallen dabei, beide selbst hineingetappt:

- **Karten und Zeilen sind keine Absätze.** `::: cards` und `::: rows` sind
  Raster; wer ihre Felder als Zeilen misst, liest Spalten als Umbrüche und
  bekommt eine Fehlerquote von 14 %, die es nicht gibt. Filtern, und prüfen,
  ob alle Zeilen an derselben linken Kante beginnen.
- **`openDeck()` hat keinen groben Zeiger.** Die Touch-Leiste hängt an
  `@media (pointer: coarse)`; im Standardkontext ist sie schlicht nicht im
  Dokument, und die Messung meldet fröhlich null Überlappungen bei null
  Knöpfen. Für so etwas einen eigenen Kontext mit
  `{ hasTouch: true, isMobile: true }` aufmachen.

## Zwei Fallen, in die ich gelaufen bin

**Ein rohes Backtick in einem Kommentar innerhalb eines Template-Literals**
beendet das Literal, und `build.js` parst nicht mehr. Viermal passiert, jedes
Mal in einem Kommentar, der ein Ding beim Namen nennen wollte – das vierte Mal
in genau dem CSS-Kommentar, der die `padding`-Eigenschaft erwähnen wollte. Der
`SyntaxError` zeigt auf den Bezeichner *danach*, achttausend Zeilen tief. Seit
Commit `674cbcd` findet `node test/gates/run.mjs inlined` das in Millisekunden
und nennt Literal und Zeile – **vor** einem Build laufen lassen, nicht danach
rätseln. Es hat beim vierten Mal genau das getan.

**`node build.js … 2>&1 >/dev/null` verschluckt genau diesen Fehler** und lässt
das *vorherige* HTML auf der Platte. Der Browser zeigt dann einen alten Build,
der aussieht wie eine Änderung ohne Wirkung. Nach jedem Eingriff in inlined
CSS/JS die neue Regel per `grep -F` im gebauten HTML nachweisen.

---

## Was erledigt ist

Dreizehn Slices. Die Commit-Nachrichten tragen die Begründungen; diese Tabelle
ist der Index. Was in C und D im Einzelnen geändert wurde, steht dort und nicht
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
| 12 | **Abschnitt A – die drei Engine-Mini-Fixes**, alle drei anders gelagert als der Befund im Plan. `[#9]` reproduziert erst ab Zoom 1,65, dafür sicher: eine echte Prosazeile lag bei 1,65, 1,95 und 2,2 im Knopfrechteck. `[#10]` lag nicht an der `36em`-Kappe, die nie greift, sondern an den 14 % Seitenrand – beide Spalten kamen an jeder Fenstergröße und bei jeder Breitenklasse gleich breit heraus, 21,0em bei 1440, schmaler als `narrow`. Und dahinter steckte ein dritter Fehler, der in keinem Punkt stand: die Kamera zentrierte die Expansion statt des Chunks, unter 900 px auf ein `position: fixed` in einem transformierten Vorfahren, was das Deck um 40 850 px verschob. `[#1]` siehe *Entschieden*. Neu dazu `test/expansion.mjs`, 19 Assertions: der Kamerafehler hat vom ersten Audience-Renderer an gelebt, weil ein Screenshot der Karte richtig aussieht. Alle vier Defekte gegengeprüft, indem jeder einzeln wieder eingebaut und der Spec fallen gesehen wurde – jeder fällt genau an den Zeilen, die ihn benennen. | – |
| 13 | **Zweite Runde durch die Lecture, vier Punkte.** `#four-views` zeigt jetzt den zweiten Input: drei Bildrahmen unter `source.md`, mit `images` darüber und einer gestrichelten Linie **ohne Spitze** – ein Pfeil *in* die Box hätte behauptet, die Bilder steckten in der Quelldatei, und sie stehen daneben. Neues Asset `assets/photo.svg` nach der Konvention von `avatar-alice.svg` (inline `<style>` mit `--ink`-Fallback), also färbt es auf `A` mit; ein Raster täte das nicht. `#audience-now` behauptete „This is `audience.html`“ in allen vier Views, also in zweien falsch – und `#one-source` eine Folie davor genauso („the projection you are reading“), was in keinem Punkt der Liste stand. Beide sagen jetzt, was in jeder Ansicht stimmt. `#figure-focus` erklärte im zweiten Absatz Links: die vier Absätze sind der eigene Chunk `#links`, und der Code-Block steht nicht mehr am Fuß der Folie, sondern direkt unter dem Absatz, der zum Klicken auffordert. `#search` war `.wide` zwischen zwei `.standard`-Folien – 52em nach 36em, mitten in einer Spalte, die dreimal dasselbe erklärt; jetzt `.standard`. `#overview` und `#toc` heißen „Open the Overview“ und „Open the Table of Contents“, weil die Folien einen Handgriff zeigen und keinen Gegenstand. | – |

### Beim Verifizieren nebenbei gefunden

Sechs Fehler, die in keinem Punkt der Liste standen – jeder kam heraus, weil eine
Behauptung des Tutorials oder des Stylesheets gegen den Code geprüft wurde statt
geglaubt:

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
- **`#one-source`: „`audience.html` is the projection you are reading“.** Der
  gemeldete Punkt war `#audience-now`; dieselbe Behauptung stand eine Folie
  davor und in allen vier Views, also in `print.html` und `print-notes.html`
  falsch. Wer nur den gemeldeten Chunk anfasst, lässt die erste Stelle stehen.
- **Die Expansions-Kamera und das `position: fixed` darunter.** Der
  CSS-Kommentar sagte, unter 900 px decke die Karte die Folie zu. Sie deckte
  nichts zu: die Folie war 37 000 px weit weg, und die Karte stand auf leerer
  Seite. Zwei Fehler, die sich in genau einem Rechteck aufhoben und sonst
  nirgends – das ist die Sorte, die man nur findet, wenn man einen anfasst.

### Entschieden – nicht wieder aufmachen

Vier Punkte kippten beim Prüfen und sind bewusst *keine* Arbeit:

- **[#44] Der Link „in the decoration lecture“ hat keinen QR-Code – richtig so.**
  QR-Codes gibt es nur für `https?://`-Adressen (`marked`-Renderer, `isExternal`).
  Ein relativer Pfad ist auf einem fremden Telefon nichts wert.
- **[#30] Das Video ist kein Bug** – die Datei ist intakt, der Clip zeigt nur
  fast nichts. Bleibt als Aufnahme-Aufgabe in B stehen.
- **[#41] widerspricht dem Code** – `countSegments()` zählt `chunkBeats()`
  unabhängig vom Fokus. Steht in B als Reproduktion, nicht als Fix.
- **[#1] „zweite Zeile oft länger als die erste“ ist auf Fließtext nicht
  reproduzierbar**, in keinem der beiden `C`-Modi. Gemessen über die ganze
  Tutorial-Lecture, Zeile für Zeile: kollabiert, wo `balance` läuft, ein Fall
  unter 97; im Lesemodus null unter 59. Wo es wirklich so aussieht, ist es
  `::: cards` und `::: rows` – dort sind die vermeintlichen zwei Zeilen zwei
  Rasterspalten, und die Beschwerde beschreibt das Layout, nicht den Umbruch.
  Der eine echte Fall ist `#search`: `balance` kann nur eine Containerbreite
  wählen und dann gierig füllen, und bei zwei Zeilen kommt dabei 514/672
  heraus. Dagegen gibt es kein CSS.

  **Die Lücke, die der Plan daneben genannt hat, war dagegen echt und ist zu**:
  die Live-Views hatten für Prosa überhaupt keine `text-wrap`-Regel, also im
  Lesemodus 31 % Absätze mit einer letzten Zeile unter einem Viertel der
  Satzbreite. `p, li` bekommen jetzt dasselbe `pretty` wie die Print-Views.
  Mit ehrlicher Buchführung: gegen sich selbst gemessen (`data-wrap=none` ist
  genau der Schalter) bricht die Regel auf Chromium 149 zwei von 59 Absätzen
  neu um. Sie ist richtig und kostet nichts, aber sie ist keine Lösung für die
  31 % – Chromes `pretty` ist zurückhaltend, und Silbentrennung, die das
  wirklich schließen würde, ist in den Live-Views mit Absicht aus.

Vier Punkte kamen anders heraus als der Plan vorschlug, jeweils mit Grund:

- **[#19]** hat die Abbildung aus dem *Satz* verloren, statt eine in den Chunk zu
  bekommen: `::: draw` wird erst in der Beyond-Spalte eingeführt, und es dort zu
  benutzen wäre genau der Fehler, den `#21` und `#25` beschreiben.
- **[#32]** blieb ein Chunk statt zwei – das sichtbare `C`-Beispiel ist
  `#derived-mode`, ein zweites hätte die Sache zum dritten Mal erklärt.
  `#topic-sentence` trägt jetzt die Arbeitsreihenfolge, `#derived-mode` den
  Mechanismus.
- **[#45]** wurde durch `#47`/`#49` gegenstandslos: `#deco-cards` ist ganz
  aufgelöst, `#deco-idea` eröffnet den Decoration-Lauf vor `#covers`.
- **[#10]** hat die vorgeschlagene Änderung *nicht* bekommen. „Rechte Spalte an
  die Chunkbreite koppeln“ hätte an keiner gemessenen Fenstergröße etwas
  bewirkt: die `36em`-Kappe bindet nie, beide Spuren teilen sich den Rest
  gleichmäßig, und mit `max(36em, --content-w)` täten sie das weiterhin. Der
  Hebel war der Seitenrand.
