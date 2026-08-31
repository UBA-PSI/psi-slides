# TODO – Tutorial-Lecture

Rückmeldungen aus einem Durchgang durch `lectures/tutorial/` (Audience- und
Lectern-View, Desktop und iPad). Die Original-Nummern sind in `[#n]` erhalten,
damit die Liste rückwärts lesbar bleibt.

Sortiert nach **wo die Arbeit hingeht** und nach **wie weitreichend sie ist** –
nicht nach der Reihenfolge, in der die Punkte aufgeschrieben wurden. Ein
Textfehler im Tutorial und eine Änderung am Navigationsmodell sehen in einer
flachen Liste gleich aus und sind es nicht.

**Konventionen für die Umsetzung:** `writing-skills:human-writing` und
`writing-skills:prose-passes` für jede Zeile Prosa; die `psi-slides-*`-Skills für
alles, was Grammatik oder Renderer berührt. `node lint.js lectures/tutorial/` und
`npm run gate` vor jedem Commit, `node test/run.mjs nav` bzw. `editor` wenn die
Live-Views angefasst wurden. Tutorial-Outputs (alle vier Views) werden
mitcommittet.

---

## Fortschritt

| # | Was |
|---|---|
| 1 | Plan angelegt, alle Punkte gegen den Code verifiziert (siehe „Befund“-Zeilen) |
| 2 | **Engine-Slice 1:** `#16` Suchindex, `#31` Formel-Zoom, `#43` Fokus als Navigationsstufe, `#55` `rule`-Divider, `#6` `option` im `?`-Overlay. Verifiziert im gebauten HTML und im Browser: `/welcome` findet die Divider-Folie; Formel wächst beim Klick um Faktor 3 (77 px → 230 px hoch), gleich bei 1440 und 1920 breit; Vorwärts auf einer fokussierten Abbildung ohne Steps schließt die Karte und bleibt auf dem Chunk, der zweite Druck geht weiter. `node test/run.mjs nav` 30/30, `npm run gate` 419/419, `node lint.js lectures/` sauber. |
| 3 | **Text-Slice 1** (unstrittige Streichungen und Faktenfehler): `#2`, `#3`, `#11`, `#13`, `#14`, `#15`, `#52`, `#6`. Alle vier Tutorial-Views neu gebaut. |

---

## A. Engine – Mini-Fixes (direkt umsetzbar)

Alles hier ist eine überschaubare Änderung an `build.js`, mit klarem Befund.

- [x] **[#16] Column-Heads fehlen im Suchindex.** „welcome“ ist nicht findbar.
      *Befund:* Der Divider ist ein eigener `.chunk` (steht in `flatChunks`), trägt
      aber `.section-heading` statt `.chunk-heading` und hat keinen `.chunk-body`.
      `buildSearchIndex()` liest nur die beiden letzteren, also landet jeder
      Divider als `(untitled)` mit leerem Body im Index.
      *Fix:* In `buildSearchIndex()` auf `.section-heading` / `.section-outline` /
      `.section-body` zurückfallen. Danach findet `/welcome` die Divider-Folie.

- [x] **[#31] Formeln öffnen nicht vergrößert.** Ein `$$display$$` wird beim Klick
      nur auf eine Papierkarte gelegt, in unveränderter Größe.
      *Befund:* `#figure-overlay figure.figure-img img, svg` bekommt `width: 95vw`,
      `#figure-overlay pre` eine `clamp()`-Schriftgröße – für `.math-display` gibt
      es keine Regel, also bleibt die Formel bei ihrer Fließtextgröße.
      *Fix:* Analoge `font-size: clamp(...)`-Regel für
      `#figure-overlay > .math-display`, an `--slide-h` gehängt wie beim `pre`.

- [x] **[#55] `section: rule` sieht gequetscht aus.** Zwei dünne Linien über und
      unter der Überschrift.
      *Fix:* Eine etwas dickere Linie nur unter der Überschrift
      (`border-bottom`, `border-top` weg, Padding nachziehen). Betrifft auch
      `lectures/decoration/` (zeigt die sechs Divider) – dort neu bauen.

- [x] **[#43] Fokussierte Abbildung: Vorwärts am Ende der Steps wechselt den
      Chunk.** Erwartet: erst schließt der Fokus, der Chunk bleibt stehen.
      *Befund:* `goForward()` ruft `advanceReveal()`; sagt das „nein“ (keine Beats
      mehr), geht es direkt in `nextChunk()` → `jumpTo()`, und `jumpTo` macht das
      `unfocusFigure()` beiläufig mit. Der Fokus ist nirgends eine eigene Stufe
      im Vorwärts-Pfad.
      *Fix:* In `goForward()` vor `nextChunk()` prüfen: `if (focusedFigure) {
      unfocusFigure(); sende figure-unfocus; return; }`. Damit wird der Fokus die
      Stufe, die er beim Rückwärtsgehen (`Esc`) schon ist.

- [ ] **[#9] Bei großer Schrift überlagern die EXP-Buttons den Text.**
      *Befund:* `.exps` ist `position: absolute; bottom: …` im Chunk und skaliert
      mit `--zoom`; der Fließtext wächst darunter durch.
      *Fix:* Am Chunk mit Expansions unten Platz reservieren, statt die Buttons
      aus dem Chunk herauszuziehen – die Geste „Knopf in der Ecke der Folie“ soll
      bleiben. Höhe der Leiste ist zoomabhängig, also über dieselbe `em`-Rechnung
      wie `.exp-chev` als `padding-block-end` an `.chunk-content` hängen.

- [ ] **[#10, Teil Desktop] Geöffnete Expansions nutzen zu wenig Breite.**
      *Befund:* `.chunk.expanded` ist ein Zweispalten-Grid mit
      `minmax(0, 36em)` rechts – fix, unabhängig von der Chunkbreite.
      *Fix:* Rechte Spalte an die Chunkbreite koppeln (mindestens so breit wie
      der Content, nach oben offener). Der Mobile-Teil von [#10] steht in B.

- [ ] **[#1] Zeilenumbruch in Absätzen: zweite Zeile oft länger als die erste.**
      *Fix:* `text-wrap: pretty` für Fließtext, `text-wrap: balance` für
      Überschriften und kurze Blöcke (Cards, Overlays, Divider). Vorher an einem
      echten Build gegenprüfen, ob `balance` in den kollabierten Chunks (ein Satz
      pro Absatz) besser aussieht als `pretty` – das ist genau der Fall, für den
      der Punkt aufgeschrieben wurde. Betrifft `AUDIENCE_CSS` und `PRINT_CSS`.

---

## B. Engine – größer, Rückfrage oder Reproduktion nötig

- [ ] **[#8] Navigationsmodell ändern.** `Shift`+`←`/`→` wechselt die Spalte;
      `←`/`→` gehen **immer** einen Chunk weiter, auch auf Column-Heads.
      *Umfang:* `keydown`-Map, `markColumnEdges()`/`sideways()`, die Randmarken
      `‹ ›` in `buildNavHints()`, das `?`-Overlay (`renderHelpOverlay`), das
      Overview-Badge, `speaker.md`, `PRD.md`, das Tutorial (`#arrows`), und
      `test/run.mjs nav` + `nav-cockpit`.
      **Entschieden:** `Shift`+`←`/`→` wechselt die Spalte von **jedem** Chunk
      aus. Damit ist es eine Regel statt einer Ausnahme. Die `‹ ›`-Marken
      entfallen ersatzlos – es gibt keinen Sonderfall mehr, den sie ankündigen
      müssten. `⌄` bleibt: „der nächste Vorwärtsdruck verlässt die Spalte“ ist
      weiterhin etwas, das die Folie nicht selbst zeigen kann.
      *Reihenfolge:* vor dem zweiten Textdurchgang, weil `#arrows`, das
      `?`-Overlay und `speaker.md` denselben Text tragen.

- [ ] **[#17, #4, #10-Teil-Mobile] Touch-Bedienung: die halbe Funktionalität ist
      auf dem Smartphone unerreichbar.** Auto-Fit, `C`, Themes, Font, Suche,
      Overview – alles hängt an Tasten. Dazu [#4]: Text markieren („Alt halten“)
      geht ohne Alt-Taste gar nicht. Dazu [#10]: geöffnete Expansions sind auf
      Mobile viel zu schmal.
      *Umfang:* eine Symbol-Palette in den Live-Views, die auf Zeigegeräten ohne
      Tastatur eingeblendet wird, plus ein Touch-Ersatz für Alt-Drag (Long-Press
      schaltet in den Auswahlmodus), plus ein Breakpoint, unter dem eine geöffnete
      Expansion die Folie überlagert statt neben ihr zu stehen.
      **Entschieden: minimal.** Eine Palette mit sechs Knöpfen – `C`, `F`, `A`,
      `#`, `O`, `/` – hinter einem Auf/Zu-Knopf in der Ecke. Dazu Long-Press als
      Touch-Ersatz für Alt-Drag und ein Breakpoint, unter dem eine geöffnete
      Expansion die Folie überlagert statt neben ihr zu stehen.
      Jeder Knopf ruft dieselbe Funktion wie seine Taste (`cycleCollapse`,
      `cycleFont`, …) – kein zweiter Pfad, sonst laufen Palette und Key-Map
      auseinander, so wie `build.js` und `lint.js` es tun, wenn man sie lässt.

- [ ] **[#5] iPad, Lectern-View: `f` öffnet manchmal die Suche statt den Font zu
      wechseln.** Auch nach Antippen der Folie.
      *Status:* nicht reproduziert. Wahrscheinlich ein Fokusproblem – der
      `keydown`-Handler hängt am `window`, aber ein Feld (Notizen, Annotation,
      Suchfeld) hat noch den Fokus und schluckt/verschiebt die Taste. Erster
      Schritt: prüfen, ob `endSearch()` / `blurAnnotation()` auf iPadOS den Fokus
      wirklich abgeben, und ob `startSearch()` von einem `beforeinput` statt von
      `keydown` erreicht wird.

- [ ] **[#41] iPad: Diagram-Steps laufen nur, wenn die Abbildung fokussiert ist.**
      Bei normal geöffnetem Chunk springt Vorwärts direkt zum nächsten Chunk.
      *Status:* nicht reproduziert und widerspricht dem Code – `countSegments()`
      zählt `chunkBeats()` unabhängig vom Fokus. Verdacht: der beobachtete Chunk
      war schon durchgelaufen, dann ist es [#43] von der anderen Seite. Vor einer
      Änderung reproduzieren, mit `revealed[chunkId]` im Blick.

- [ ] **[#30] Das eingebettete Video zeigt kein bewegtes Bild.**
      *Befund:* `assets/reveal-demo.mp4` ist intakt – 960×540, h264, 72 Frames auf
      6 s. Es *bewegt* sich, aber es zeigt drei fast statische Stufen einer Folie,
      also sieht ein Standbild fast genauso aus.
      *Fix (vermutlich):* keinen Bug suchen, sondern einen Clip nehmen, dem man
      die Bewegung ansieht. Kandidat: ein Kameraschwenk über das Overview-Board
      oder ein `autoplay`-Diagramm beim Durchlaufen.

---

## C. Tutorial-Text – Mini-Fixes

Formulierung, Präzision, Faktenfehler. Alles in `lectures/tutorial/source.md`.
Der rote Faden über fast alle Punkte: **weniger blumig, weniger belehrend,
weniger Andeutung – das Ding beim Namen nennen.**

### Faktenfehler

- [x] **[#2] `#expand`, zweite Expansion behauptet, `C` schließe Expansions.**
      *Befund:* Stimmt nicht. `cycleCollapse()` fasst weder `.exps` noch
      `.exp-body` an; es gibt keine CSS-Regel unter `[data-collapse=topic-bold]`,
      die sie ausblendet. Die Expansion beschreibt ein Verhalten, das es nicht
      gibt. Text ersetzen (nicht: Verhalten nachbauen).
- [x] **[#3] `#expand`: „`Enter` does not open expansions“ streichen.** Der Satz
      erklärt eine Nicht-Funktion, nach der niemand gefragt hat.
- [ ] **[#7] `#audience-now`: „What you are seeing is the audience view“ stimmt
      nicht unbedingt** – man kann die Folie auch in der Lectern-View lesen.
      Umformulieren, sodass beide Fälle stimmen.
- [x] **[#6] Markieren: unter macOS heißt die Taste „option“.** Beide Namen
      nennen (`Alt` / `option`). Betrifft `#figure-focus` und das `?`-Overlay in
      `renderHelpOverlay()` – dort in derselben Änderung mitziehen.
- [x] **[#11] `#expand`: sagen, dass `1` die erste Expansion öffnet *und wieder
      schließt*.** Momentan wird nur `Esc` genannt.
- [ ] **[#23] `#knobs` erklärt `B` zweimal** – einmal in der Liste, einmal im
      Absatz darunter. Eine Erklärung reicht.
- [ ] **[#28] `#images` zeigt keinen Alt-Text auf der Folie.** Der Chunk erklärt
      „the alt text becomes a caption“ und enthält gar kein Bild. Ein Beispielbild
      mit Alt-Text einsetzen, damit die Regel sichtbar wird statt behauptet.

### Ungenaue oder kryptische Sprache

- [ ] **[#39] „document“ als Wort für die Print-View aufgeben – überall.** Der
      Leser weiß nicht, dass die zwei Handouts gemeint sind. Stattdessen die
      Dateinamen: `print.html` und `print-notes.html`. Betrifft den ganzen Text,
      nicht nur `#view-defaults`. Dort außerdem streichen: „a document having no
      keyboard to cycle it with“.
- [ ] **[#54] „when you say nothing“ / „saying nothing“ → „default“.** Gemeint ist
      schlicht: die Einstellung ist weggelassen. Kommt an vielen Stellen vor.
- [ ] **[#20] `#labels` (`.bare`): „takes it off“ → „hides“**, und „the two
      documents“ durch die Dateinamen ersetzen.
- [ ] **[#22] „# hands zoom to the tool“ → „`#` enables auto-fit, which …“.**
- [ ] **[#24] `#layout-axes`: „You decide a layout twice“** klingt nach Nachteil.
      Umformulieren: zwei unabhängige Entscheidungen, Breite und Anordnung.
- [ ] **[#25] `#cols-demo`: „Segments work inside `::: cols`“** – „segments“ ist
      hier nicht eingeführt. „revealed segments (`---`)“ schreiben.
- [ ] **[#51] `#side-ratio`: „A card row *is* welcome in a pane“.** „is welcome“
      ist blumig, „pane“ ist ein normales englisches Wort und wurde nie als
      Fachbegriff eingeführt. Klar sagen: eine Hälfte eines `::: side`-Blocks.
      (Prüfen, ob „pane“ an weiteren Stellen so benutzt wird.)
- [x] **[#52] `#figure-focus`: „the mark“ → „the QR code symbol“.**
- [ ] **[#53, Teil 2] `#bundled-fonts`: der erste Satz des `ligatures:`-Absatzes
      ist kryptisch** – und er ist der einzige, der auf der Folie steht.
- [ ] **[#57] `#labels`, erster Absatz: „A tag word above a chunk is two different
      things wearing one name“** – umformulieren, ohne Pointe.
- [ ] **[#58] `#labels`: „It is a key of its own and not part of `rules` …“** – der
      Satz erklärt eine Design-Entscheidung, nach der niemand gefragt hat, und
      erklärt sie unverständlich. Ersatzlos streichen oder auf „`rules` schaltet
      die Linien, `labels` die Wörter“ eindampfen.
- [ ] **[#59] `#closing`: die drei Absätze über „tag und nicht zweites `title:`“,
      „trägt weder Namen noch `info`“, „die vier Bildkompositionen“** – alles
      Begründungen für nicht gestellte Fragen. Auf das eindampfen, was man tun
      muss.

### Belehrender Ton / AI-Slop

- [x] **[#14] `#overview`: „in a lecture you did not write“** – streichen.
- [ ] **[#18] `#derived-mode`: „A chunk that makes an argument lives with that
      easily“** – umformulieren.
- [ ] **[#34] `#read-more`: „The craft only shows in lectures somebody wrote“** –
      streichen. Stattdessen schlicht: psi-slides bringt Beispiel-Foliensätze mit,
      zum Anschauen und Abgucken.
- [ ] **[#36] `#authoring`: „Three commands cover the whole of writing a
      lecture“** – die Anzahl ist egal. Ohne Zählung formulieren.
- [ ] **[#56] `#section-dividers`: der Card-Text** ist belehrend
      („The signal that arrives across a room before any word does“). Sachlich
      neu schreiben.
- [ ] **[#53, Teil 1] `#bundled-fonts`: die Iosevka-Entscheidungsgeschichte
      streichen.** Interessiert außer dem Autor niemanden.

### Inhaltlich unnötig oder falsch platziert

- [x] **[#13] `#figure-focus`: der Satz über QR-Codes für Folien ohne Links** –
      ergibt keinen Sinn und interessiert nicht. Streichen.
- [x] **[#15] `#toc`: „and renders normally“** – bedeutungslos. Streichen.
- [ ] **[#21] `#tag-effects`: „And the checker will not mention it“** – der Linter
      ist an dieser Stelle noch nicht eingeführt (kommt erst in `#authoring`).
      Entweder streichen oder nach hinten verschieben.
- [ ] **[#35] `#read-more`: `PRD.md` und `docs/comparison.md` streichen.** Beides
      ist nicht für Endnutzer. Übrig bleiben die drei Beispiel-Lectures.
- [ ] **[#37] `#view-defaults`: `lang:` steht separat unter dem Frontmatter-Block.**
      Einfach mit in den YAML-Block aufnehmen.
- [ ] **[#38] `#view-defaults`: „Which setting wins is one sentence.“** Als
      Topic-Sentence ist das Foreshadowing ohne Substanz – auf der Folie steht
      eine Ankündigung statt einer Aussage. Entweder die Regel selbst zum ersten
      Satz machen, oder den ganzen Absatz in ein `::: expand` verschieben.
- [ ] **[#46] `#title` / Cover: `info:` „hält die Konferenz“** ist für eine
      Vorlesung schief. Beispieltext auf Lehrveranstaltung münzen (Kursname,
      Kurs-URL, Ort) und die Konferenz nur als eine Möglichkeit nennen.
- [ ] **[#44] Der Link „in the decoration lecture“ hat keinen QR-Code.**
      *Befund:* Absicht und richtig – QR-Codes gibt es nur für `https?://`-Adressen
      (`marked`-Renderer, `isExternal`). Ein relativer Pfad ist auf einem fremden
      Telefon nichts wert. **Kein Handlungsbedarf.**

---

## D. Tutorial-Text – Umbauten

Hier reicht keine Formulierung; die Folge oder der Aufbau von Chunks ändert sich.

- [ ] **[#32] `#topic-sentence` neu aufbauen.** Der Chunk erklärt die zentrale
      Idee des Werkzeugs und tut es zu knapp und zu spät.
      Was er sagen muss, in dieser Reihenfolge:
      1. Standardmäßig entsteht die Folie aus dem Fließtext – **der erste Satz
         *jedes* Absatzes**, nicht ein einziger Topic Sentence pro Chunk.
      2. Deshalb schreibt man erst das vollständige Skript und formuliert dabei
         die ersten Sätze so, dass sie allein die Exposition tragen.
      3. Der Rest des Absatzes ist die Unterfütterung und erscheint nur im
         Handout.
      Vermutlich als zwei Chunks besser als als einer: die Regel, dann ein
      sichtbares Beispiel mit zwei Absätzen und `C`.
      *Berührt* `#two-modes`, `#derived-mode` und `#choose-mechanism` – die
      Aufteilung zwischen den vieren nochmal ansehen, damit nichts dreimal steht.

- [ ] **[#33] `#choose-mechanism`, Expansion „tag-as-predictor“: streichen oder
      neu denken.** Der Nutzer wählt die Tags selbst, viele nutzen sie kaum, und
      „der Tag sagt etwas voraus“ ist zirkulär. Derselbe Text steht außerdem
      fast wörtlich in `#which-mode` („answer-in-practice“) – das ist der zweite
      Grund, ihn zu streichen.

- [ ] **[#19] `#script-mode` („The other way round“).** Zwei Probleme: man erkennt
      nicht sofort, dass es ein Beispiel ist, und die Abbildung, von der der Text
      redet („A figure and three lines of finding“), fehlt. Entweder eine kleine
      `::: draw`-Abbildung einsetzen oder den Text auf das ändern, was zu sehen
      ist.

- [ ] **[#40, #42] Die Diagram-Einführung auf mehrere Chunks verteilen.** Aktuell:
      ein `.full`-Chunk `#diagram` mit sieben Absätzen plus eine Expansion, die
      fast die gesamte übrige Grammatik enthält. Das ist der längste Chunk der
      Lecture und die erste Begegnung mit `::: draw`.
      Neuer Aufbau, drei bis vier Chunks:
      1. **Ein statisches Diagramm plus seinen Quelltext.** Sonst nichts.
      2. **Dasselbe Diagramm mit zwei `step`-Blöcken**, plus die Erklärung, wie
         man sie abspielt (dieselbe Taste wie ein Segment).
      3. Die sechs Slots (`kind name label placement options tail`).
      4. Placement und Tail (Klassen, Tags), Rest in die Expansion.
      Die überlange Expansion „The rest of the vocabulary“ dabei kürzen – sie darf
      auf die `psi-slides-figures`-Doku und `lectures/diagrams/` verweisen statt
      alles selbst aufzuzählen.

- [ ] **[#45] `#deco-idea` und `#deco-cards` tauschen.** Der Chunk „A picture
      behind the text chunk“ kündigt das Konstrukt an, aber vorgeführt wird es
      erst einen Chunk später (`#deco-picture`), weil die Cards dazwischen liegen.
      Reihenfolge: `#deco-idea` → `#deco-picture` → `#deco-cards`.

- [ ] **[#47] Backdrop wird zweimal eingeführt** – `#deco-picture` (Zeile ~880)
      und `#backdrop` (Zeile ~949). Zusammenlegen; die erste Nennung geht in der
      zweiten auf.
- [ ] **[#49] Cards werden ebenfalls zweimal eingeführt** – `#deco-cards` und
      `#cards`. Dasselbe.
- [ ] **[#48] Backdrop hat viele Optionen – das sagen und auf
      `lectures/decoration/` verweisen**, statt fünf Slots in einem Absatz
      abzuhaken, für den kein Platz ist.
- [ ] **[#50] Cards und Rows mit ausgewählten Optionen *zeigen*, nicht nur die
      Syntax abdrucken.** Mindestens `ground`, `anchor` und die Lead-in/Heading-
      Unterscheidung an einem sichtbaren Beispiel.
- [ ] **[#51, Teil 2] `::: side 2:1` vorführen, nicht nur zeigen wie es
      geschrieben wird.** Der Chunk `#side-ratio` druckt nur den Quelltext ab.

- [ ] **[#12] `#knobs` / Zoom spricht über Marginalia und Margin Notes, bevor es
      sie gibt.** Beide kommen erst in `#marginalia-demo` / `#margin-demo`. Und
      „marginalia werden nicht gehoben, sondern zentriert“ versteht niemand ohne
      das Konstrukt gesehen zu haben. Den Hinweis von dort nach `#marginalia-demo`
      verschieben und dort am sichtbaren Beispiel erklären.
- [ ] **[#26] `#side-demo`: der Marginalia-Hinweis in Panes** – der Chunk zeigt
      keine Marginalia, also erinnert sich niemand an das Konstrukt. Entweder eine
      im Beispiel zeigen oder den Satz streichen (er hängt an [#12]).
- [ ] **[#27] `::: margin` und `::: marginalia` sind zu ähnlich benannt**, und
      „margin note“ für etwas, das *unter* dem Chunk steht, ist irreführend.
      **Entschieden: umbenennen.** `::: footnote` wird der dokumentierte Name;
      `::: margin` bleibt still gültig, damit kein bestehendes `source.md`
      bricht, wird aber nirgends mehr genannt. Ein Wort, das beschreibt, wo die
      Sache steht, statt eines, das sie mit `::: marginalia` verwechselt.
      *Mitzuziehen in einem Commit:* `build.js` (Parser + Renderer, `data-label`
      der `.margin-note`), `lint.js` (die gespiegelte Direktiven-Liste – und die
      Regel aus `CLAUDE.md`: eine Verweigerung in einer Datei heißt, in der
      anderen nach demselben Schlüssel zu greppen), `lectures/tutorial`,
      `lectures/decoration`, `lectures/python-intro`, der
      `psi-slides-authoring`-Skill, `PRD.md` §3.
      Danach hängt hier auch [#12] und [#26] dran: `#margin-demo` und
      `#marginalia-demo` werden als Paar mit sichtbarem Kontrast neu geschrieben.

---

## Offene Fragen (zusammengefasst)

1. ~~**[#8]**~~ **entschieden:** `Shift`+`←`/`→` überall, `‹ ›` entfallen.
2. ~~**[#17]**~~ **entschieden:** minimale Palette, sechs Knöpfe.
3. ~~**[#27]**~~ **entschieden:** `::: footnote` wird der Name, `::: margin` bleibt still gültig.

Alle drei beantwortet – nichts blockiert mehr.

---

## Reihenfolge der Umsetzung

1. **A** komplett – kleine, unabhängige Engine-Fixes, jeder für sich committbar.
2. **C** komplett – ein Durchgang durch `source.md`, Faktenfehler zuerst, dann
   Sprache. `#39` und `#54` sind Suchen-und-Ersetzen über den ganzen Text und
   gehören an den Anfang dieses Durchgangs, nicht ans Ende.
**Notiz für die Engine-Arbeit:** Ein Backtick in einem Kommentar *innerhalb*
`AUDIENCE_JS` beendet das Template-Literal und `build.js` parst nicht mehr –
in Slice 2 einmal passiert, in `CLAUDE.md` steht es. Fehler fällt beim Laden von
`build.js` auf, also gutartig; der bösartige Nachbar ist der nicht verdoppelte
Regex-Backslash, der still falsches JS ins HTML schreibt.

3. **D** in Blöcken: erst der Decoration-Block (`#45`, `#47`–`#51`), dann der
   Diagram-Block (`#40`, `#42`), dann `#32`/`#33`/`#19`, dann `#12`/`#26`/`#27`.
   Jeder Block ein Commit, jeder mit neu gebauten Tutorial-Outputs.
4. **B** nach Rückfrage – `#8` zuerst (berührt den Text, den C und D anfassen,
   also besser vor dem zweiten Textdurchgang als danach), dann Mobile, dann die
   drei Reproduktionen.
