# TODO – was ein Belastungstest vor 2.0.0 gefunden hat

Entstanden beim Nachbau echter Vorlesungsinhalte mit dem vollen Vokabular:
zwei alte PowerPoint-Foliensätze als Vorlage, dazu Decks, die gezielt durch
die Vokabeln laufen, die in `lectures/` bisher in keiner Zeile vorkommen.
Jeder Eintrag nennt: was passiert, die kleinste Quelle, die es zeigt, warum
es zählt, und was daraus folgen könnte. Nichts davon ist bereits geändert.

**Wie die Einträge sortiert sind.** Nach dem, was ein Autor davon merkt:
zuerst was still danebengeht, dann was die beiden Werkzeuge verschieden
sehen, dann Reibung in Grammatik und Doku.

**Die Testdecks** liegen in `lectures/demo-*`. Sie sind nicht committet.

## Kurzfassung, nach Dringlichkeit für 2.0.0

**Die vier Release-Blocker sind behoben** (mit Build/Lint-Kongruenz und
Regressionswächtern – siehe „Erledigt“ am Ende):

- **B2a `unknown-type`** ✅ – `## bogus:` rendert still als Überschrift ohne
  `data-tag`, obwohl das Skill es als Fehler bezeichnet. Dieselbe Klasse wie
  ein schon behobener Bug, klarste verbotene Richtung.
- **B2b `duplicate-id`** ✅ – zwei `<article id="…">` im selben Dokument;
  ungültiges HTML, geteilter Sync-/localStorage-Slot. Der Build schweigt.
- **A4 `::: cards {.photo}` + Bold-Heading** ✅ – zwei dokumentierte Features
  kombinieren still zu einer kaputt aussehenden Folie; Foto-Grund aus SVG
  zeichnet nie.
- **A3 unauflösbarer Bildverweis** ✅ – wird als externer Pfad verschickt, ohne
  Warnung; bricht die Single-File-Garantie.

**Kleine Kongruenz- und No-op-Fixes:**

- **A1** `.photo` ohne Bild schaltet die Scrim-Prüfung ab. **A2** `detail:
  show/page` ohne zweite Ebene ist ein stiller No-op. **B1** Spaltenindizes im
  `step` (`emph 2,3`): Build lehnt ab, Linter schweigt. **C5**
  `layout-too-narrow` misst `closing:` falsch als `standard`.

**Doku, nicht Code:**

- **C1** `space` in `sequence` (Satz liest sich als Zeilenangabe). **C2**
  `lanes`-Namen als `swim-0` dokumentiert, heißen `<id>-0`. **C3** Panel-Rat
  auf einem Foto-Teiler nicht befolgbar. **C4** `dock .every` ist teilweit,
  der dokumentierte Zweck deckweit. **C6** `::: margin` 17× in echten Decks,
  in der Doku als „nowhere“ und mit Abrat – eine Release-Entscheidung.

**Was hält:** die 2.0.0-Kernänderung (`style: {reveal: …}` und `--- from 0`
in beiden Werkzeugen sauber abgelehnt, mit Migrationsmeldung); `sequence`,
`table` (30 Zeilen), `lanes`, `bars … series of`, `.wedge`/`.chevron`,
Klammer-Gruppierung, `backdrop {.contain/.blur/.over}`, Overlay-Höhen,
Foto-Grund mit Bild-zuerst – alles gebaut, geprüft, im Browser gesehen. Der
Differenztest bestätigt: alle 118 Lint-Codes feuern, 91 lehnen in beiden
Dateien ab, kein Check versteckt sich im Audience-Renderer.

---

## A. Still danebengehende Wörter

Das Format hat eine ausdrückliche Regel dafür, und sie steht in mehreren
Skills wörtlich: *ein Wort, das die Zeichnung ignoriert, ist ein Fehler und
wird nicht stillschweigend fallengelassen.* Drei Stellen halten sie nicht.

### A1 · `::: cards {.photo}` ohne Bild wird angenommen, und schaltet dabei die Scrim-Prüfung ab

Kleinste Quelle:

```markdown
::: cards 2 {.photo .veil}
- **One** first card
- **Two** second card
:::
```

`lint.js`: sauber. `build.js`: Exit 0. Gerendert wird
`<div class="cards cards-2 … cg-photo … cx-veil">` – beide Klassen auf einer
Reihe, in der kein `<img>` steht.

Ohne `.photo` wird dieselbe Reihe abgelehnt:

```
::: cards in chunk #a: a scrim needs a picture to veil.
```

Die Prüfung in `build.js` lautet `if (o.ground !== 'photo' && o.written.scrim)`.
Sie fragt also nach dem **Wort** `photo`, nie danach, ob es ein Bild gibt –
während ihre eigene Meldung das Gegenteil behauptet. Daraus folgen zwei
Dinge, und das zweite ist das ärgerliche: `.photo` allein ist ein stiller
No-op, und `.photo` neben einem Scrim macht aus einer Ablehnung ein
stillschweigendes Durchwinken. Genau die Kombination, die ein Autor schreibt,
wenn er die Fehlermeldung ernst nimmt und „dann gebe ich der Reihe eben den
Fotogrund“ denkt, ist die, die nicht mehr geprüft wird.

Möglicher Schluss: die Bedingung gegen den *Inhalt* prüfen (trägt eine Karte
ein Bild?) statt gegen das Grundwort, und `.photo` ohne Bild in dieselbe
Ablehnung nehmen.

### A2 · `detail: .show` / `.page` auf einer Reihe ohne zweite Ebene

Dieselbe Form, dieselbe Reihe, andere Antwort:

```markdown
::: cards 2 {.show}
- **One** first card
- **Two** second card
:::
```

Lint sauber, Build Exit 0, und das Wort kann nichts tun – `detail` entscheidet
ausschließlich, was mit verschachtelten Ebenen geschieht, und es gibt keine.
`.page` ebenso. Der Scrim im selben Tail wird für genau diese Form
abgelehnt; `detail` nicht.

Das ist kleiner als A1, weil nichts dadurch unlesbar wird. Es steht hier,
weil die beiden Einträge zusammen zeigen, dass die Regel bisher pro Slot
umgesetzt ist und nicht als Regel.

---

## B. Wo `build.js` und `lint.js` verschieden sehen

### B1 · Spaltenindizes in einem `step` – der Build lehnt ab, der Linter schweigt

```markdown
::: draw 120x50
bars f "1,2,3,4" "a b c d" at 0,0 w 2 h 1 emph 1,3

step s
  emph 2,3
:::
```

`node lint.js` → `ok – 1 file(s), 0 error(s), 0 warning(s)`
`node build.js` → Exit 1, keine Datei geschrieben:

```
line 4 of the block: step s refers to "2", which is not defined
line 4 of the block: step s refers to "3", which is not defined
```

Die Richtung ist die erlaubte – der Linter ist nicht strenger als der Build.
Trotzdem steht es hier, weil der Fehler kein exotischer ist: die
Figuren-Doku schreibt über die `bars`-Zeile, `emph 1,3` nehme dort
Spaltenindizes „and mean on the line what they already mean in a step“. Auf
der Zeile sind es Indizes, im Schritt sind es Elementnamen (`f-2`). Der Satz
sagt, die beiden bedeuteten dasselbe; sie tun es nicht, und der Linter,
der den Unterschied auffangen könnte, sieht ihn nicht.

Möglicher Schluss: entweder der Satz stimmt nicht und wird umgeschrieben,
oder Schritte nehmen auf einem Chart ebenfalls Indizes. Der Linter hat die
Elementnamen ohnehin (er prüft `unknown-diagram-ref` an anderer Stelle im
selben Block) und könnte den Fall mitnehmen.

---

## C. Reibung in Grammatik und Doku

### C1 · `space n` in einer `sequence` – die Doku beschreibt, wo die Lücke landet, und liest sich wie eine Zeilenangabe

Der Satz im Figuren-Skill:

> `space n` on a `note` or a message line is that one band's own gap … **It
> is written *above* the entry rather than below it.**

Gemeint ist: die Lücke *entsteht oberhalb* des Eintrags. Gelesen wird: die
Zeile *steht oberhalb* des Eintrags. Nach der zweiten Lesart geschrieben –

```
  site -> br "HTML"
  space 0.4
  br -> trk "GET /t.js"
```

– bricht der Eintragslauf ab, und der Fehler kommt nicht an der Stelle an,
an der er entstand, sondern als Kaskade auf allen Folgezeilen:

```
unknown diagram statement 'space'
'br' only means something inside a sequence – …
'note' only means something inside a sequence – …
```

Richtig ist `br -> trk "GET /t.js" space 0.5`, also eine Option auf der
Eintragszeile. Im Korpus steht genau eine solche Zeile
(`lectures/diagrams`, `tunnel c -- s "…" space 0.9`), und sie steht nicht
in der Nähe der Erklärung.

Möglicher Schluss: den Satz auf „the gap it opens sits above the entry“
umstellen und ein Zweizeilen-Beispiel danebenstellen.

### C2 · Die erzeugten Namen einer `lanes` sind im Skill als `swim-0` dokumentiert, heißen aber `<id>-0`

Das Figuren-Skill schreibt:

> `lanes` makes a frame, flush `.clear` bands `swim-0`… (`dgLaneName`)

`swim` ist kein Schlüsselwort, sondern der Name, den `lectures/diagrams`
seiner Swimlane gegeben hat:

```js
export const dgLaneName = (id, i) => `${id}-${i}`;
```

Eine `lanes l …` hat also Bänder `l-0`, `l-1`. Wer die Doku liest oder das
Beispiel abschreibt, schreibt `swim-1` und bekommt
`box … at refers to 'swim-1', which is not defined in this diagram` – eine
Meldung, die richtig ist und trotzdem nicht auf die Ursache zeigt.

Die `sequence`-Tabelle direkt darunter macht es anders und besser: sie nennt
die Funktion *und* ein Beispiel (`dgLifeName(actor)` → `au-life`).

Möglicher Schluss: `<id>-0` / `<id>-cap-0` schreiben, wie es die
Nachbartabelle tut.

### C3 · Ein Teiler mit Foto kann die dokumentierte Panel-Empfehlung nicht befolgen

Das Dekorations-Skill empfiehlt für ein Panel über einem Foto ausdrücklich
den klaren Hintergrund:

> Write the backdrop `{.cover .clear}` with a panel – the default `veil`
> washes the whole picture, and the panel's own ground is what sets the
> words off.

Auf einem Teiler kostet das eine Warnung, und die vorgeschlagenen Auswege
greifen dort nicht:

```markdown
# Gegenwehr {#gegenwehr}

::: backdrop photo {.cover .clear} reveal full, left 45%

::: overlay {.right .glass .panel .narrow}
### Zwei Richtungen
:::
```

```
warn  text-on-picture  ::: backdrop {.clear} under a column heading – the
divider's heading and agenda stand on the unveiled picture; drop .clear
(veil), write .invert, or give the words a ::: overlay {.panel} or a ::: dock
```

Die dritte Möglichkeit gibt es auf einem Teiler nicht: dessen Überschrift
und Agenda erzeugt der Teiler-Renderer, sie lassen sich nicht in ein Overlay
verschieben. Bleiben `.veil` und `.invert` – und beide sind genau das, wovon
der Panel-Absatz abrät. Die Warnung hat recht (die Überschrift steht
tatsächlich frei auf dem Bild); die Empfehlung auch. Nur nicht gleichzeitig.

Möglicher Schluss: die Warnung auf Teilern nachsehen lassen, ob ein
`.panel`-Overlay da ist, und dann nur die *Überschrift* bemängeln – oder im
Dekorations-Skill sagen, dass die Panel-Empfehlung für Kapitel-Chunks gilt
und ein Teiler mit Foto seine Überschrift verschleiert bekommt.

### C4 · `::: dock {.every}` gilt je Teil, der dokumentierte Hauptzweck ist aber deckweit

Der erste der drei genannten Zwecke:

> **A running table of contents.** Written under the `#` heading with
> `.every`, the dock is on every chunk of the part.

Ein laufendes Inhaltsverzeichnis ist deckweit, nicht teilweit. Geschrieben
unter `# Das Problem` steht der Dock über den drei Chunks dieses Teils und
verschwindet danach – obwohl er alle vier Teile auflistet und die lebende
Markierung (`done` / `now` / `next`) erst über mehrere Teile hinweg etwas
sagt. Wer ihn durchgehend will, schreibt denselben Block unter jede `#`
Überschrift; die Markierung stimmt dann von selbst, weil sie aus den Links
kommt.

Das ist kein Fehler, sondern eine fehlende Reichweite. Es steht hier, weil
die Doku den Zweck nennt, für den die Reichweite nicht ausreicht, und weil
die Wiederholung eine Kopie ist, die auseinanderlaufen kann.

Möglicher Schluss: entweder ein drittes Scope-Wort für „alle Teile“ oder
in der Doku sagen, dass der Block je Teil zu wiederholen ist.

### C5 · `layout-too-narrow` misst einen `closing:`-Chunk als `standard`, obwohl er `full` ist – und der Autor kann es nicht richtigstellen

```markdown
## closing: Ende {#end}

::: cards 4
- eins
- zwei
- drei
- vier
:::
```

`node lint.js`:

```
warn  layout-too-narrow  ::: cards 4 in a standard chunk gives each card
about 9em – under 10em a paragraph is a ribbon; use a wider chunk or fewer cards
```

Aber der Build rendert den Chunk als `data-width="full"` – eine Titel- und
Abschlussfolie ist immer volle Breite, das entscheidet die Cover-Komposition.
Bei 72em geben vier Karten je 18em, nicht 9. `--check-fit` bestätigt: die
Folie passt. Die Warnung ist falsch.

Und sie ist nicht abstellbar: `## closing: Ende {.full #end}` wird abgelehnt
(`class-on-cover-chunk`), weil die Komposition die Breite bestimmt. Der Autor
sieht also eine Warnung, deren einzigen genannten Ausweg – „use a wider chunk“
– das Format ihm verbietet.

Ursache: `measureHere()` in `lint.js:2595` nimmt
`chunk.tag === 'outline' ? 'wide' : 'standard'` und kennt `title` / `closing`
nicht. Beide werden immer `full` gebaut.

Möglicher Schluss: `measureHere` und `widthWord` für `title` und `closing`
auf `full` setzen. Dann ist die Warnung entweder weg (vier Karten passen) oder
sie sagt die Wahrheit (sechs Karten passen auch bei `full` nicht).

### C6 · `::: margin` ist in der Doku „nowhere documented“ und mit Abrat versehen, aber 17-fach in echten Vorlesungen benutzt

`CLAUDE.md` und das Authoring-Skill:

> `::: margin` is the older spelling … Do not write it in anything new: it was
> one keystroke from `::: marginalia` … the one place the block never sits.

Im Inhalts-Repo (`../psi-slides-mylectures`) steht `::: margin` 17-mal in fünf
Dateien, `::: marginalia` null-mal. Das ist keine Engine-Frage – der Alias
baut ja – sondern eine Release-Frage: **wenn 2.0.0 den Alias entfernt, brechen
fünf echte Vorlesungen.** Und der Name, von dem die Doku abrät, ist der, den
der einzige echte Nutzer durchgängig verwendet.

Möglicher Schluss: den Alias in 2.0.0 behalten (die additive Wahl) und im
Inhalts-Repo einmal auf `::: marginalia` umschreiben, bevor eine spätere
Hauptversion ihn zieht. Auf keinen Fall in 2.0.0 ziehen, ohne das Inhalts-Repo
im selben Zug umzustellen.

### A3 · Ein Bildverweis, der auf keine Datei zeigt, wird als externer Pfad verschickt – ohne Warnung

Kleinste Quelle (Datei liegt in `assets/chain.jpg`):

```markdown
![](nope.jpg)      <!-- gibt es nicht -->
![](chain.jpg)     <!-- Datei liegt in assets/, aber der Verweis hat eine Endung -->
```

Beides baut sauber, lintet sauber, und landet als
`<img src="nope.jpg">` bzw. `<img src="chain.jpg">` im Output – ein externer
Pfad in einer Datei, deren ganzes Versprechen ist, für sich allein zu
reisen. Am Zielort ist es ein kaputtes Bild. Der Build sagt nur
`auto-inlining 1 image` (das eine, das er fand) und schweigt über die zwei,
die er nicht fand.

Der zweite Fall ist der gemeine: die Kurzform löst nur einen *nackten*
Namen ohne Schrägstrich und ohne Endung gegen `assets/` auf. `![](chain.jpg)`
hat eine Endung, gilt also als expliziter relativer Pfad gegen das
Quellverzeichnis – wo die Datei nicht liegt. Ein Autor, der die Endung
mitschreibt (der naheliegende Tippfehler), bekommt still ein kaputtes Bild,
obwohl die Datei da ist.

Das ist genau die Klasse, gegen die `assertInlinable` für *zu große* Bilder
gebaut wurde: ein Verweis, der nicht einbettbar ist, geht sonst als externer
Pfad durch. Ein *unauflösbarer* Verweis fällt ganz durch das Netz.

Möglicher Schluss: `lint.js` schaut ohnehin auf Asset-Dateien
(`oversized-asset` per `statSync`). Ein Verweis, der auf keine Datei zeigt,
könnte dieselbe Prüfung als Warnung (`unresolved-asset`) auslösen – oder der
Build könnte einen expliziten Pfad, der nicht existiert und nicht `http(s)`
ist, wie ein zu großes Bild als `userFacing`-Fehler behandeln.

### A4 · `::: cards {.photo}` verliert seinen Grund, wenn die Karte mit einem Bold-Heading öffnet

Das Dekorations-Skill dokumentiert beides einzeln: eine Karte darf mit einem
Bold-Heading auf eigener Zeile öffnen –

```markdown
- **Measure**\
  what the page does
```

– und `ground: photo` macht „the card's first image its ground“. Zusammen
brechen sie still. Kleinste Quelle (Bild löst korrekt auf):

```markdown
::: cards 2 {.photo .veil}
- **Alpha**\
  ![](chain)
  words
:::
```

Gerendert: das Bild wird **nicht** hinter die Wörter gezogen. Es steht als
normales Inline-Bild in voller Sättigung mittendrin, Überschrift darüber,
Text darunter – eine ganz andere, kaputt aussehende Komposition. Der Scrim
greift auch nicht (das Bild ist unverschleiert).

Öffnet dieselbe Karte mit dem Bild zuerst, ist alles richtig:

```markdown
::: cards 2 {.photo .invert}
- ![](chain)
  **Gamma** words over darkened ground
:::
```

– verdunkeltes Bild als Grund, heller Text, Akzent auf „Gamma“.

Ursache (in `AUDIENCE_CSS`): der Hintergrund-Selektor verlangt das Bild als
**erstes Kind** des `<li>`:

```css
.cards.cg-photo li > figure.figure-img:first-child img { position: absolute; inset: 0; … }
```

Bei einem Bold-Lead ist das erste Kind `<strong class="card-lead">`, das
`<figure>` das dritte. Der Selektor trifft nichts, das Bild bleibt im Fluss.

Zwei Verstärker im selben Nest:
- Ein **SVG** wird inline gespliced (`<figure><svg>…</svg></figure>`, kein
  `<img>`), also trifft der Selektor `figure … img` es nie – ein Foto-Grund
  aus einer SVG-Datei zeichnet sich nie. (Backdrops splicen SVG dagegen
  korrekt als Grund; nur der Karten-Grund kennt den Fall nicht.)
- `--check-fit` und `--squint` sind für genau das blind, was hier
  danebengeht (Überlappung, Grund-vs-Fluss), sagt das Authoring-Skill selbst.

Möglicher Schluss: den Selektor das erste `figure.figure-img` / `img`
*irgendwo* im `<li>` treffen lassen statt nur als `:first-child`, und den
SVG-Fall (`figure.figure-img:… svg`) mitnehmen. Oder – falls der Grund
bewusst nur eine bild-zuerst-Karte betrifft – im Skill sagen, dass eine
`.photo`-Karte nicht mit einem Bold-Heading öffnen darf, und es linten.

### B2 · Fünf Refusals nur im Linter, nicht im Build – die laut CLAUDE.md verbotene Richtung

CLAUDE.md sagt es wörtlich: *„a linter stricter than the build, which is the
one direction this project does not allow.“* Ein Differenztest über alle 118
Lint-Codes (206 Fixtures) fand fünf Codes, bei denen genau das passiert:
`lint.js` meldet einen **Fehler**, `build.js` beendet mit 0 und schreibt die
Dateien. Nach Schwere:

**B2a · `unknown-type` – der klarste Fall, dieselbe Klasse wie ein bereits behobener Bug.**

```markdown
## bogus: A heading {#a}
```

`lint.js` → `error unknown-type`. `build.js` → Exit 0, rendert
`<h2 class="chunk-heading">bogus: A heading</h2>` in einem `chunk-free`, **ohne
`data-tag`**. Das Authoring-Skill sagt ausdrücklich: *„A lowercase `word:`
prefix that is not one of the ten types is an `unknown-type` error, not a
silent heading.“* Der Build macht genau die stille Überschrift, die das Skill
verbietet.

Ursache in `parseTagPrefix` (`build.js:3047`): trifft `^([a-z]+):` und ist das
Wort kein `VALID_TAG`, fällt die *ganze* Zeile als Überschrift durch. Das ist
Wort für Wort die Situation, die CLAUDE.md für unknown-*class* schon einmal
beschreibt und behoben hat (`parseAttributeTail` ließ unbekannte Klassen
fallen, „the build silent on a typo while lint.js called it an unknown width“).
Der Build sollte ein `[a-z]+:`-Präfix, das kein Typ ist, als `userFacing`
ablehnen – und dabei aufpassen, dass eine legitime Doppelpunkt-Überschrift
(`## Note: das zählt`, Großbuchstabe) nicht getroffen wird; der Regex verlangt
ohnehin Kleinschreibung.

**B2b · `duplicate-id` – ungültiges HTML und geteilter Sync-Slot, still verschickt.**

```markdown
## free: A {#dup}
## free: B {#dup}
```

`build.js` → Exit 0, zwei `<article id="dup">` in einem Dokument.
`getElementById('dup')` antwortet nur mit dem ersten, also teilen sich die
beiden Chunks einen `revealed[]`-Slot, einen Sync-Schlüssel und einen
localStorage-Eintrag. Die IDs sind laut CLAUDE.md „the anchor for
cross-references, TOC entries, speaker-sync snapshots, and localStorage
persistence“ – ein Duplikat bricht alle vier still. Das ist mehr als Hygiene:
es ist ungültiges HTML mit funktionalem Schaden.

**B2c · `missing-id` – positioneller Ersatzschlüssel, der beim Einfügen die Bedeutung wechselt.**

```markdown
## free: A heading      <!-- kein {#id} -->
```

`build.js` → Exit 0, kein `id=`-Attribut, ein positionelles
`data-chunk-id="c1-0"`. Das ist der Sync- und localStorage-Schlüssel, und er
verschiebt sich still, sobald ein Chunk darüber eingefügt wird. Vertretbar als
Build-Nachsicht, aber es untergräbt die „IDs sind eingefroren“-Garantie.

**B2d · `stray-directive-close` – ein verwaister `:::` landet als Text auf der Folie.**

```markdown
## free: A {#a}

Body.
:::
```

`build.js` → Exit 0, `<p>:::</p>` auf der Projektion. Der Linter meldet es als
Fehler.

**B2e · `unclosed-directive` – nur für die Hälfte der Wrapper.**

Ein nicht geschlossenes `cols` / `side` / `slide` / `script` / `marginalia` /
`embed` beendet `build.js` mit 0 (am Chunk-Rand automatisch geschlossen,
Ausgabe korrekt); der Linter meldet Fehler. Für `expand` / `footnote` /
`overlay` / `dock` / `cards` / `rows` **lehnt der Build ab**. Das ist eine
undokumentierte Naht mitten durch eine Regel: dieselbe Wortsorte, zwei
Verhalten. CLAUDE.md/Decoration-Skill nennt genau diese Asymmetrie als eine
frühere Fehlerquelle („a directive that captures lines is a hard error if it
is still open at EOF … `::: expand`, `::: footnote` and `::: overlay` did
not“) – die *captured* Blöcke wurden geschlossen, die *wrapper* nicht.

Möglicher Schluss: B2a und B2b sind echte Defekte und sollten den Build
ablehnen lassen (mit Lint-Kongruenz). B2c–B2e sind Entscheidungen: entweder
den Build strenger machen oder in CLAUDE.md festhalten, dass diese
Hygiene-Codes bewusst linter-only sind – dann ist die „verbotene Richtung“
keine ausnahmslose Regel mehr und das gehört gesagt.

**Was der Differenztest sonst noch fand, in der erlaubten Richtung** (Build
lehnt ab, Linter schweigt), knapp: ein unerwartetes Token auf `bars` / `plot` /
`grid` / `table` / `lanes` / `sequence` (`diagram-unexpected-token` deckt nur
box/dot/text/image/edge/brace/container – sechs Statements ohne
Linter-Spiegel, siehe B1); `at <token>` ohne Komma (`at a.top`, `at 5`) wird
in der Arität nie gemeldet; `cover: hero` ohne `cover-image` lehnt der Build
ab, der Linter spiegelt nur die Gegenrichtung. Und eine Schwere-Abweichung:
`oversized-asset` warnt im Linter (Exit 0 ohne `--strict`), wo der Build hart
fehlschlägt – und der Warntext beschreibt noch das Verhalten *vor*
`assertInlinable` („so it stays an external path“).

Erfreulich: alle 118 Lint-Codes feuerten, 91 Regeln lehnen in beiden Dateien
ab, und `--print-only` verhielt sich auf allen 206 Fixtures wie ein voller
Build – kein Check versteckt sich mehr im Audience-Renderer.

### C7 · Eine `.turn`-Spurbeschriftung, die höher ist als ihr Band, überläuft ins Nachbarband – ohne Warnung

Auf der `lanes`-Folie von `demo-tracking` (`#lanes`, `band 1.0`) stoßen die
beiden langen deutschen Spurnamen „Erstanbieter“ und „Drittanbieter“ unten
links aneinander: `.turn` liest sie von unten nach oben, und bei ~12 Zeichen
sind sie länger als die 72 px Bandhöhe, also ragen sie in den Nachbarn.

Der Compiler warnt bei Box-Beschriftungen, die ihre Kästchen sprengen
(`dgLabelClipWarnings`), und bei Überlappungen (`dgOverlapWarnings`) – eine
generierte, gedrehte `lanes`-Beschriftung, die höher ist als ihr Band, fällt
durch beide. Der Ausweg ist ein höheres Band (`band 1.4`), aber nichts sagt
es dem Autor.

Klein, weil der Fix ein Zahlenwert ist und das Ergebnis sichtbar ist, sobald
man die Folie ansieht. Es steht hier, weil es dasselbe Muster ist wie die
anderen stillen Layout-Fehler: eine Zahl, die eine gedrehte Beschriftung
nicht fasst, und keine Prüfung, die es auffängt.

Möglicher Schluss: die Bandhöhe an der höchsten gedrehten Beschriftung
messen (wie `sequence` seine Kopfhöhe an der breitesten Beschriftung misst),
oder eine Warnung, wenn eine `.turn`-Spurbeschriftung ihr Band übersteigt.

---

## Erledigt in dieser Sitzung: die vier Release-Blocker

Alle mit Build/Lint-Kongruenz und je einem Regressionswächter. Jeder
Wächter würde vor dem Fix rot.

**B2a · `unknown-type` lehnt der Build jetzt ab** (`parseTagPrefix` in
`build.js`). Ein `wort:`-Präfix, das kein Typ ist, wirft einen `userFacing`-
Fehler mit derselben Prädikat-Logik, die lint benutzt (Kleinschreibung, also
bleibt `## Note: …` und ein als `[link](url)` geschriebener URL unberührt).
Wächter: `test/settings.mjs`, cases-Tabelle.

**B2b · `duplicate-id` lehnt der Build jetzt ab** (`assertDistinctIds` als
Pre-Flight neben `assertInlinable`/`assertCoverBody`). Läuft über die geparste
Struktur, ein Namensraum für Spalten- und Chunk-IDs – wie lint. Vor jedem
Schreiben, also greift `--print-only` auch. Wächter: `test/settings.mjs`.

**A4 · Foto-Grund überlebt den Bold-Heading** (CSS in `AUDIENCE_CSS`).
`:first-child` → `:first-of-type` in den `cg-photo`-Selektoren, plus der
Inline-`<svg>`-Grund. Das Bild wird jetzt als absoluter Grund gezogen, egal
ob die Karte mit dem Bild oder mit `**Heading**\` öffnet. Wächter:
`test/cards.mjs`, Abschnitt 4 (misst `position` des Bildes in beiden Karten).
Nebenbei bestätigt: der CLAUDE.md-Backtick-Gotcha ist real – mein erster
Kommentar enthielt Backticks und ließ den Build still stale bauen; der
`inlined`-Gate fängt genau das.

**A3 · Unauflösbarer Bildpfad wird Platzhalter, nicht externer Pfad**
(Renderer in `build.js` + `UNRESOLVED_ASSETS` + Warnung, gespiegelt als
`unresolved-asset` in `lint.js`). Ein *relativer* Pfad, der auf keine Datei
zeigt (nicht http(s)/data:/wurzel-absolut), wird zum sichtbaren Platzhalter
und meldet `[assets] not found` mit Endungs-Tipp. Kein harter Fehler – ein
fehlendes Asset beim Entwerfen ist normal, der Platzhalter ist sichtbar.
Wächter: `test/settings.mjs`, eigener Block.

**Verifikation nach den Fixes:** Gates 747, `npm run settings` 649, Karten-Spec
grün; alle sieben Lectures bauen; `node lint.js lectures/` 0 Fehler. Die drei
getrackten Lectures (tutorial/diagrams/decoration) wurden neu gebaut – nur ihr
audience/speaker-CSS änderte sich (die A4-Zeilen), das Aussehen bleibt gleich,
weil keine davon `cg-photo` nutzt.

**Offen bleiben** die kleineren Einträge (A1, A2, B1, C1–C7) und die
Doku-Entscheidungen – bewusst nicht angefasst, weil der Auftrag die vier
Blocker waren.

---

## Zweite Runde: die kleineren Funde, nach deinen Entscheidungen

**Q1 – A1/A2 „beide fixen":** `renderCardsBlock` prüft jetzt inhaltsbewusst –
`.photo`/Scrim werden abgelehnt, wenn keine Karte ein Bild trägt; `detail`
(fold/show/page) wird abgelehnt, wenn es keine verschachtelte Ebene gibt.
Gegen die *geschriebene* Tail, wie die Scrim-Regel. Build-seitig (lint bleibt
für diese inhaltsabhängigen Karten-Prüfungen nachsichtig – die erlaubte
Richtung, genau wie die Scrim-Regel schon immer). Wächter: `test/settings.mjs`.

**Q2 – stray-directive-close gefixt, missing-id per Flag, escape geprüft:**
Ein `:::`, das nichts schließt, lehnt der Build jetzt ab (kongruent zu lint).
Der Escape für ein *beabsichtigtes* `:::` ist der Code-Fence / Inline-Backtick –
existiert, fence-aware, so dokumentiert die Tutorial-Lecture die Direktiven
selbst; geprüft. `missing-id`: der Build scheitert weiterhin **nicht** an
fehlenden IDs; lint meckert per Default, `--allow-missing-ids` schaltet es fürs
Prototyping ab. `unclosed-directive` (Wrapper-Hälfte) unangetastet gelassen –
korrekte Ausgabe, nachsichtig wie missing-id.

**Q3 – `::: margin` behalten + Warnung:** der Build akzeptiert den Alias weiter,
lint warnt `deprecated-margin` (Entfernung in einer künftigen Hauptversion).
Bricht keine der fünf echten Inhalts-Lectures.

**Q4:**
- **C5** gefixt: `measureHere`/`widthWord` in lint.js messen `title`/`closing`
  als `full` – das falsche, unabstellbare `layout-too-narrow` auf einem
  Abschluss-Chunk ist weg; eine echte Enge (standard, cards 4) warnt weiter.
- **B1** gefixt: die Step-Target-Schleife in lint.js brach bei einer Zahl ab –
  jetzt prüft sie eine Zahl bei einem Prominenz-Verb und meldet
  `unknown-diagram-ref` (kongruent zum Build). Doku im Figuren-Skill
  klargestellt (Zeile: Indizes, Step: Namen `f-2`).
- **C1/C2/C7** Doku im Figuren-Skill: `space` als Eintrags-Option (nicht
  Zeile), `lanes`-Namen `<id>-0` mit Beispiel, `.turn`-Spurbeschriftung kann
  ein zu kurzes Band überlaufen.
- **C3** „Überschrift ins Panel" gebaut: über einem `.clear`-Foto wird das
  `section: card`-Plättchen zum deckenden Papier-Grund (themen-aware, in Hell
  und Dunkel im Browser geprüft), die `text-on-picture`-Warnung weicht ihm.
  Wächter: `test/settings.mjs`. Doku im Dekorations-Skill.
- **C4** nur Doku: `.every` ist teilweit; für deckweit `section: outline` /
  `## outline:` oder den Block je `#` wiederholen. Im Authoring-Skill notiert.

**Wächter-Lehre wiederholt:** zweimal in dieser Sitzung hat ein Backtick in
einem CSS-Kommentar das Template-Literal beendet und den Build still stale
gebaut. `node test/gates/run.mjs inlined` fängt es; ich verifiziere jeden
CSS-Build seither mit `grep` auf die neue Regel und `import()` auf Syntax.
