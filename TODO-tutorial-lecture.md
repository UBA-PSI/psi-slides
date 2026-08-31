# TODO – Tutorial-Lecture

Rückmeldungen aus einem Durchgang durch `lectures/tutorial/` (Audience- und
Lectern-View, Desktop und iPad). Die Original-Nummern sind als `[#n]` erhalten,
damit die Liste rückwärts lesbar bleibt.

Sortiert nach **wo die Arbeit hingeht** und nach **wie weitreichend sie ist** –
nicht nach der Reihenfolge, in der die Punkte aufgeschrieben wurden. Ein
Textfehler im Tutorial und eine Änderung am Navigationsmodell sehen in einer
flachen Liste gleich aus und sind es nicht.

---

## Wo die Arbeit steht

**Erledigt:** die Engine-Mini-Fixes bis auf drei, das Navigationsmodell, die
Touch-Bedienung, und ein erster Textdurchgang über die unstrittigen
Streichungen. Fünf Commits – `git log b36bc24..` liest sie in Reihenfolge.

**Als Nächstes:** Abschnitt **C**, der Textdurchgang durch
`lectures/tutorial/source.md`. Rund 20 offene Punkte, fast alle eine
Formulierung. `#39` und `#54` zuerst, weil beide Suchen-und-Ersetzen über den
ganzen Text sind und jede spätere Umformulierung sonst zweimal angefasst wird.

**Danach:** **D** (Umbauten am Chunk-Aufbau, in vier Blöcken), dann die drei
Reste in **A**, dann die drei Reproduktionen in **B**.

**Alle Entscheidungsfragen sind beantwortet** – nichts wartet auf Rückmeldung.
Die Antworten stehen fett beim jeweiligen Punkt.

### Wie hier verifiziert wird

```bash
node lint.js lectures/                # alle fünf Lectures, zero-dep
npm run gate                          # 422 Assertions, ~0,5 s, kein Browser
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

### Zwei Fallen, in die ich gelaufen bin

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

## Fortschritt

| # | Was | Commit |
|---|---|---|
| 1 | Plan angelegt, jeder Punkt gegen den Code verifiziert – die *Befund*-Zeilen unten sind das Ergebnis, nicht Vermutungen. Drei Punkte kippten dabei: `#44` ist kein Fehler, `#30` ist kein Fehler, `#41` widerspricht dem Code. | – |
| 2 | **Engine-Slice 1:** `#16` Suchindex, `#31` Formel-Zoom, `#43` Fokus als Navigationsstufe, `#55` `rule`-Divider, `#6` `option` im `?`-Overlay. Im Browser gemessen: `/welcome` findet die Divider-Folie; die Formel wächst beim Klick von 77 auf 230 px Höhe, gleich bei 1440 und 1920 breit; Vorwärts auf einer fokussierten Abbildung ohne Steps schließt die Karte und bleibt auf dem Chunk, der zweite Druck geht weiter. | `e7dfc45` |
| 3 | **Text-Slice 1**, die unstrittigen Streichungen und Faktenfehler: `#2`, `#3`, `#11`, `#13`, `#14`, `#15`, `#52`, `#6`. | `bfdff5f` |
| 4 | **[#8] Navigationsmodell.** `←`/`→` sind überall Vor/Zurück, `Shift`+`←`/`→` wechselt die Spalte von jedem Chunk aus. Mit weggefallen: der `sideways`-Guard in der Key-Map, das gleichnamige Feld in `markColumnEdges()`, die beiden `‹ ›`-Marken samt CSS. `nextCol`/`prevCol` stehen jetzt still, wenn es keine Spalte in die Richtung gibt – vorher fiel `nextCol` auf den letzten Chunk der Lecture durch, was der alte Guard unerreichbar hielt und `Shift` von jeder Folie der letzten Spalte aus erreichbar gemacht hätte. Mitgezogen: `?`-Overlay, `PRD.md` §5, `README.md`, `speaker.md`, Tutorial `#arrows`, `CHANGELOG.md`, `test/harness.mjs` (`hints` ist jetzt ein Zeichen statt drei), `test/nav.mjs`, `test/nav-cockpit.mjs`. | `e9c3730` |
| 5 | **Nebenprodukt: `test/gates/inlined.mjs`.** Prüft die beiden statisch entscheidbaren Fallen in den Template-Literalen von `build.js`: rohes Backtick und einfacher Regex-Backslash (`/\s+/g` wird zu `/s+/g` und geht still in Produktion). Beide Hälften gegengeprüft, indem der Defekt eingebaut und das Gate fallen gesehen wurde. Die dritte Falle, unterminiertes `/*`, hat mit `assertStylesheetsWellFormed()` längst einen harten Build-Fehler und wird nicht doppelt geprüft. `CLAUDE.md` und `run.mjs` sagen jetzt beide „sechs Gates“. | `674cbcd` |
| 6 | **[#17/#4/#10-mobile] Touch-Bedienung.** Siehe den Punkt in B – drei echte CSS-Fehler kamen erst beim Messen heraus. | `12f67d4` |

---

## A. Engine – Mini-Fixes

Alles hier ist eine überschaubare Änderung an `build.js`, mit klarem Befund.

- [x] **[#16] Column-Heads fehlten im Suchindex.** „welcome“ war nicht findbar.
      *Befund:* Der Divider ist ein eigener `.chunk` (steht in `flatChunks`),
      trägt aber `.section-heading` statt `.chunk-heading` und hat keinen
      `.chunk-body`. `buildSearchIndex()` las nur die beiden letzteren, also
      landete jeder Divider als `(untitled)` mit leerem Body im Index.
      *Gemacht:* Rückfall auf `.section-heading` / `.section-body`; bei einem
      `outline`-Divider auf das aktuelle Listenelement, weil dort die Überschrift
      nicht neben der Liste steht, sondern *ist*.

- [x] **[#31] Formeln öffneten nicht vergrößert.**
      *Befund:* Ein fokussiertes Bild bekommt `width: 95vw`, ein Codeblock eine
      `clamp()` gegen `--slide-h` – für `.math-display` gab es keine Regel, also
      blieb die Formel bei ihrer Fließtextgröße auf einer Papierkarte.
      *Gemacht:* Gleiche Behandlung wie der Codeblock, gleiche Einheit.

- [x] **[#55] `section: rule` sah gequetscht aus.** Statt zweier dünner Linien
      über und unter der Überschrift jetzt eine dickere darunter.

- [x] **[#43] Fokussierte Abbildung: Vorwärts wechselte den Chunk.**
      *Befund:* `goForward()` fiel nach `advanceReveal()` direkt in
      `nextChunk()` → `jumpTo()`, und `jumpTo` schloss die Karte beiläufig mit.
      Eine Taste nahm also die Abbildung weg **und** wechselte die Folie.
      *Gemacht:* Der Fokus ist in beiden Richtungen eine eigene Stufe, so wie er
      es bei `Esc` schon war.

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

---

## B. Engine – größer

- [x] **[#8] Navigationsmodell geändert.** Siehe Fortschritt Nr. 4.
      **Entschieden war:** `Shift`+`←`/`→` von **jedem** Chunk aus, damit es eine
      Regel statt einer Ausnahme ist; die `‹ ›`-Marken entfallen ersatzlos, weil
      es keinen Sonderfall mehr gibt, den sie ankündigen müssten. `⌄` bleibt – es
      sagt, wohin Vorwärts *führt*, nicht was eine Taste bedeutet.

- [x] **[#17, #4, #10-Mobile] Touch-Bedienung.**
      *Befund war:* Eine Leiste existierte schon (`#touch-controls`, fünf Knöpfe,
      `@media (pointer: coarse)`), wurde aber **nur in `audience.html`
      gerendert** – nicht in dem Fenster, das man am Rednerpult in der Hand hält
      –, und trug ausgerechnet die Funktionen, die Tippen und Pinchen ohnehin
      können.
      *Gebaut:* Die Leiste liegt jetzt in einer geteilten Konstante und wird in
      **beide** Live-Views gerendert. Ein `⋯`-Knopf öffnet eine zweite Pille mit
      `C`, `F`, `A`, `#`, Suche und Textauswahl. Jeder Knopf ruft die Funktion
      seiner Taste und nichts sonst.
      **Abweichung von der ursprünglichen Notiz:** Textauswahl ist ein **Knopf in
      der Palette**, kein Long-Press. Ein Long-Press ist nicht auffindbar, und
      die Entscheidung lautete „alles in der Palette erreichbar“. Der Modus hat
      ein eigenes Flag – `altSelectHeld` hätte der `selectionchange`-Listener
      beim nächsten Tap zurückgesetzt.
      *Drei echte Fehler, die erst das Messen zeigte:*
      (a) die `#touch-palette`-ID-Regel schlug das `[hidden]`-Attribut, die
      Palette stand also immer offen;
      (b) `em`-Maße erbten die zoomskalierte Foliengröße – sechs Knöpfe liefen
      441 px breit auf einem 390-px-Telefon. `rem` war nicht besser, weil
      Mobile-Browser die Root-Größe per Text-Autosizing selbst setzen: dieselbe
      Regel ergab 63 px auf dem iPad quer und 83 px auf demselben iPad hochkant.
      Jetzt `clamp()` gegen die Viewportbreite, Untergrenze 44 px;
      (c) `left: 50%` gibt einem fixierten Element ohne Breite nur die halbe
      Viewportbreite als **Layout**raum – das `translateX` verschiebt bloß
      optisch. Also brach die Leiste auf einem 320-px-Telefon in zwei Reihen um,
      wo Platz für eine war. Jetzt `left: 0; right: 0`, zentriert vom Flex.
      *Gemessen* in zehn Konfigurationen (iPad quer/hoch, iPhone 13/SE, kleines
      Android × beide Views, mit hochgedrehtem Folienzoom): je eine Reihe, Ziele
      44–56 px, kein Overflow, keine Page-Errors.

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
      `[#43]` von der anderen Seite, und `[#43]` ist behoben. **Vor jeder
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

## C. Tutorial-Text – Mini-Fixes ← **hier weitermachen**

Formulierung, Präzision, Faktenfehler. Alles in `lectures/tutorial/source.md`.
Der rote Faden über fast alle Punkte: **weniger blumig, weniger belehrend,
weniger Andeutung – das Ding beim Namen nennen.**

**`#39` und `#54` zuerst.** Beide sind Suchen-und-Ersetzen über den ganzen
Text; jede Umformulierung davor müsste sonst zweimal angefasst werden.

### Faktenfehler

- [x] **[#2] `#expand`: die Behauptung, `C` schließe Expansions.** Stimmte nicht –
      `cycleCollapse()` fasst weder `.exps` noch `.exp-body` an. Text ersetzt.
- [x] **[#3] `#expand`: „`Enter` does not open expansions“** gestrichen.
- [x] **[#6] Markieren: `Alt` / `option`** – im Tutorial und im `?`-Overlay.
- [x] **[#11] `#expand`: `1` öffnet die erste Expansion *und schließt sie wieder*.**
- [ ] **[#7] `#audience-now`: „What you are seeing is the audience view“ stimmt
      nicht unbedingt** – man kann die Folie auch in der Lectern-View lesen.
      Umformulieren, sodass beide Fälle stimmen.
- [ ] **[#23] `#knobs` erklärt `B` zweimal** – einmal in der Liste, einmal im
      Absatz darunter. Eine Erklärung reicht.
- [ ] **[#28] `#images` zeigt keinen Alt-Text auf der Folie.** Der Chunk erklärt
      „the alt text becomes a caption“ und enthält gar kein Bild. Ein
      Beispielbild mit Alt-Text einsetzen, damit die Regel sichtbar wird statt
      behauptet.

### Ungenaue oder kryptische Sprache

- [ ] **[#39] „document“ als Wort für die Print-View aufgeben – überall.** Der
      Leser weiß nicht, dass die zwei Handouts gemeint sind. Stattdessen die
      Dateinamen: `print.html` und `print-notes.html`. Betrifft den ganzen Text,
      nicht nur `#view-defaults`. Dort außerdem streichen: „a document having no
      keyboard to cycle it with“.
- [ ] **[#54] „when you say nothing“ / „saying nothing“ → „default“.** Gemeint
      ist schlicht: die Einstellung ist weggelassen. Kommt an vielen Stellen vor.
- [ ] **[#20] `#labels` (`.bare`): „takes it off“ → „hides“**, und „the two
      documents“ durch die Dateinamen ersetzen.
- [ ] **[#22] „`#` hands zoom to the tool“ → „`#` enables auto-fit, which …“.**
- [ ] **[#24] `#layout-axes`: „You decide a layout twice“** klingt nach Nachteil.
      Umformulieren: zwei unabhängige Entscheidungen, Breite und Anordnung.
- [ ] **[#25] `#cols-demo`: „Segments work inside `::: cols`“** – „segments“ ist
      an der Stelle nicht eingeführt. „revealed segments (`---`)“ schreiben.
- [ ] **[#51, Teil 1] `#side-ratio`: „A card row *is* welcome in a pane“.** „is
      welcome“ ist blumig; „pane“ ist ein normales englisches Wort und wurde nie
      als Fachbegriff eingeführt. Klar sagen: eine Hälfte eines
      `::: side`-Blocks. (Prüfen, ob „pane“ an weiteren Stellen so benutzt wird.)
- [x] **[#52] `#figure-focus`: „the mark“ → „the QR code symbol“.**
- [ ] **[#29] `#images`: der Absatz über das 2-MB-Limit ist kryptisch.** Wer die
      Folie in der kollabierten Ansicht liest, versteht nicht, dass Bilder
      **standardmäßig** in die HTML eingebettet werden, und schon gar nicht,
      warum.
      *Befund:* Die Regel steht zwar da, aber an der falschen Stelle. „Anything
      under 2 MB a file and 10 MB in total goes inside the HTML without your
      asking“ ist der **dritte** Satz eines Absatzes in einem `::: cols
      2`-Block, erscheint also nie auf der Folie. Der Topic-Sentence des
      nächsten Absatzes – „A picture over the 2 MB limit stops the build“ –
      setzt genau diese Regel voraus und ist der erste, den der Raum sieht. Die
      Folie führt also mit der Ausnahme und lässt die Regel im Handout.
      *Fix:* Das Einbetten zum Topic-Sentence machen und das Limit zur Folge
      davon. Das *Warum* (die Datei soll allein reisen können) gehört in
      denselben ersten Satz – es ist der Grund, warum das Werkzeug so
      entschieden hat, nicht ein Detail dahinter.

- [ ] **[#53, Teil 2] `#bundled-fonts`: der erste Satz des `ligatures:`-Absatzes
      ist kryptisch** – und er ist der einzige, der auf der Folie steht.
- [ ] **[#57] `#labels`, erster Absatz: „A tag word above a chunk is two
      different things wearing one name“** – umformulieren, ohne Pointe.
- [ ] **[#58] `#labels`: „It is a key of its own and not part of `rules` …“** –
      erklärt eine Design-Entscheidung, nach der niemand gefragt hat, und
      erklärt sie unverständlich. Streichen oder auf „`rules` schaltet die
      Linien, `labels` die Wörter“ eindampfen.
- [ ] **[#59] `#closing`: die drei Absätze über „tag und nicht zweites
      `title:`“, „trägt weder Namen noch `info`“, „die vier
      Bildkompositionen“** – alles Begründungen für nicht gestellte Fragen. Auf
      das eindampfen, was man tun muss.

### Belehrender Ton

- [x] **[#13] `#figure-focus`: der Satz über QR-Codes für Folien ohne Links.**
- [x] **[#14] `#overview`: „in a lecture you did not write“.**
- [x] **[#15] `#toc`: „and renders normally“.**
- [ ] **[#18] `#derived-mode`: „A chunk that makes an argument lives with that
      easily“** – umformulieren.
- [ ] **[#34] `#read-more`: „The craft only shows in lectures somebody wrote“** –
      streichen. Stattdessen schlicht: psi-slides bringt Beispiel-Foliensätze
      mit, zum Anschauen und Abgucken.
- [ ] **[#36] `#authoring`: „Three commands cover the whole of writing a
      lecture“** – die Anzahl ist egal. Ohne Zählung formulieren.
- [ ] **[#56] `#section-dividers`: der Card-Text** ist belehrend („The signal
      that arrives across a room before any word does“). Sachlich neu schreiben.
- [ ] **[#53, Teil 1] `#bundled-fonts`: die Iosevka-Entscheidungsgeschichte
      streichen.** Interessiert außer dem Autor niemanden.

### Inhaltlich unnötig oder falsch platziert

- [ ] **[#21] `#tag-effects`: „And the checker will not mention it“** – der
      Linter ist an der Stelle noch nicht eingeführt, er kommt erst in
      `#authoring`. Streichen oder nach hinten verschieben.
- [ ] **[#35] `#read-more`: `PRD.md` und `docs/comparison.md` streichen.** Beides
      ist nicht für Endnutzer. Übrig bleiben die drei Beispiel-Lectures.
- [ ] **[#37] `#view-defaults`: `lang:` steht separat unter dem
      Frontmatter-Block.** Einfach mit in den YAML-Block aufnehmen.
- [ ] **[#38] `#view-defaults`: „Which setting wins is one sentence.“** Als
      Topic-Sentence ist das Foreshadowing ohne Substanz – auf der Folie steht
      eine Ankündigung statt einer Aussage. Entweder die Regel selbst zum ersten
      Satz machen, oder den ganzen Absatz in ein `::: expand` verschieben.
- [ ] **[#46] `#title` / Cover: `info:` „hält die Konferenz“** ist für eine
      Vorlesung schief. Beispieltext auf eine Lehrveranstaltung münzen
      (Kursname, Kurs-URL, Ort) und die Konferenz nur als eine Möglichkeit
      nennen.
- [x] **[#44] Der Link „in the decoration lecture“ hat keinen QR-Code.**
      *Befund:* Absicht und richtig – QR-Codes gibt es nur für
      `https?://`-Adressen (`marked`-Renderer, `isExternal`). Ein relativer Pfad
      ist auf einem fremden Telefon nichts wert. **Kein Handlungsbedarf.**

---

## D. Tutorial-Text – Umbauten

Hier reicht keine Formulierung; die Folge oder der Aufbau von Chunks ändert
sich. **In Blöcken abarbeiten, jeder Block ein Commit mit neu gebauten
Outputs.**

### Block 1 – Decoration (`#45`, `#47`–`#51`)

- [ ] **[#45] `#deco-idea` und `#deco-cards` tauschen.** Der Chunk „A picture
      behind the text chunk“ kündigt das Konstrukt an, vorgeführt wird es aber
      erst einen Chunk später (`#deco-picture`), weil die Cards dazwischen
      liegen. Reihenfolge: `#deco-idea` → `#deco-picture` → `#deco-cards`.
- [ ] **[#47] Backdrop wird zweimal eingeführt** – `#deco-picture` und
      `#backdrop`. Zusammenlegen; die erste Nennung geht in der zweiten auf.
- [ ] **[#49] Cards werden ebenfalls zweimal eingeführt** – `#deco-cards` und
      `#cards`. Dasselbe.
- [ ] **[#48] Backdrop hat viele Optionen – das sagen und auf
      `lectures/decoration/` verweisen**, statt fünf Slots in einem Absatz
      abzuhaken, für den kein Platz ist.
- [ ] **[#50] Cards und Rows mit ausgewählten Optionen *zeigen*, nicht nur die
      Syntax abdrucken.** Mindestens `ground`, `anchor` und die
      Lead-in-/Heading-Unterscheidung an einem sichtbaren Beispiel.
- [ ] **[#51, Teil 2] `::: side 2:1` vorführen.** Der Chunk `#side-ratio` druckt
      nur den Quelltext ab.

### Block 2 – Diagramme (`#40`, `#42`)

- [ ] **[#40, #42] Die Diagram-Einführung auf mehrere Chunks verteilen.** Aktuell ein
      `.full`-Chunk `#diagram` mit sieben Absätzen plus eine Expansion, die fast
      die gesamte übrige Grammatik enthält. Das ist der längste Chunk der
      Lecture und zugleich die erste Begegnung mit `::: draw`.
      Neuer Aufbau, drei bis vier Chunks:
      1. **Ein statisches Diagramm plus seinen Quelltext.** Sonst nichts.
      2. **Dasselbe Diagramm mit zwei `step`-Blöcken**, plus die Erklärung, wie
         man sie abspielt – dieselbe Taste wie ein Segment.
      3. Die sechs Slots (`kind name label placement options tail`).
      4. Placement und Tail (Klassen, Tags), der Rest in die Expansion.
      Die überlange Expansion „The rest of the vocabulary“ dabei kürzen – sie
      darf auf den `psi-slides-figures`-Skill und `lectures/diagrams/`
      verweisen, statt alles selbst aufzuzählen.

### Block 3 – Die Kernidee (`#32`, `#33`, `#19`)

- [ ] **[#32] `#topic-sentence` neu aufbauen.** Der Chunk erklärt die zentrale
      Idee des Werkzeugs und tut es zu knapp und zu spät.
      Was er sagen muss, in dieser Reihenfolge:
      1. Standardmäßig entsteht die Folie aus dem Fließtext – **der erste Satz
         *jedes* Absatzes**, nicht ein einziger Topic Sentence pro Chunk.
      2. Deshalb schreibt man erst das vollständige Skript und formuliert dabei
         die ersten Sätze so, dass sie allein die Exposition tragen.
      3. Der Rest jedes Absatzes ist die Unterfütterung und erscheint nur im
         Handout.
      Vermutlich besser als zwei Chunks: die Regel, dann ein sichtbares Beispiel
      mit zwei Absätzen und `C`.
      *Berührt* `#two-modes`, `#derived-mode` und `#choose-mechanism` – die
      Aufteilung zwischen den vieren nochmal ansehen, damit nichts dreimal steht.
- [ ] **[#33] `#choose-mechanism`, Expansion „tag-as-predictor“: streichen.** Der
      Nutzer wählt die Tags selbst, viele nutzen sie kaum, und „der Tag sagt
      etwas voraus“ ist zirkulär. Derselbe Text steht außerdem fast wörtlich in
      `#which-mode` („answer-in-practice“) – das ist der zweite Grund.
- [ ] **[#19] `#script-mode` („The other way round“).** Zwei Probleme: man
      erkennt nicht sofort, dass es ein Beispiel ist, und die Abbildung, von der
      der Text redet („A figure and three lines of finding“), fehlt. Entweder
      eine kleine `::: draw`-Abbildung einsetzen oder den Text auf das ändern,
      was zu sehen ist.

### Block 4 – margin/marginalia (`#27`, `#12`, `#26`)

- [ ] **[#27] `::: margin` in `::: footnote` umbenennen.**
      *Problem:* Die beiden Namen sind zu ähnlich, und „margin note“ für etwas,
      das *unter* dem Chunk steht, ist irreführend.
      **Entschieden:** `::: footnote` wird der dokumentierte Name; `::: margin`
      bleibt still gültig, damit kein bestehendes `source.md` bricht, wird aber
      nirgends mehr genannt. Ein Wort, das beschreibt, wo die Sache steht, statt
      eines, das sie mit `::: marginalia` verwechselt.
      *In einem Commit mitzuziehen:* `build.js` (Parser + Renderer, `data-label`
      der `.margin-note`), `lint.js` (die gespiegelte Direktiven-Liste – und die
      Regel aus `CLAUDE.md`: wer eine Verweigerung in der einen Datei ändert,
      greppt die andere nach demselben Schlüssel), `lectures/tutorial`,
      `lectures/decoration`, `lectures/python-intro`, der
      `psi-slides-authoring`-Skill, `PRD.md` §3, `CHANGELOG.md`.
- [ ] **[#12] `#knobs` spricht über Marginalia und Margin Notes, bevor es sie
      gibt.** Beide kommen erst in `#marginalia-demo` / `#margin-demo`. Und
      „marginalia werden nicht gehoben, sondern zentriert“ versteht niemand, der
      das Konstrukt noch nicht gesehen hat. Den Hinweis dorthin verschieben und
      am sichtbaren Beispiel erklären.
- [ ] **[#26] `#side-demo`: der Marginalia-Hinweis in Panes.** Der Chunk zeigt
      keine Marginalia, also erinnert sich niemand an das Konstrukt. Entweder
      eine im Beispiel zeigen oder den Satz streichen – er hängt an `[#12]`.
      Danach `#margin-demo` und `#marginalia-demo` als Paar mit sichtbarem
      Kontrast neu schreiben.
