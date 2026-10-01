# `::: dock` – eine Leiste am Folienrand, die dem Text Platz abzieht

## Status

Gebaut: `e019c8a` (Direktive, Renderer, Runtime, Linter, Tests, Doku), danach
`ed68ce8` und `6f20362` mit dem, was das Frame-Lab-Deck fand, und `25dba2b`
(verschachtelte Beats behalten ihre Box). Was die Umsetzung an dieser
Spezifikation geändert hat, steht im letzten Abschnitt; der Rest ist die
Bauanleitung, wie sie vor dem Bau stand. Zweite Fassung: der erste Entwurf hieß
`::: rail` und ist gegen den Code geprüft worden, der nach den beiden
Commits `c5600d8` (Nesting-Regeln, verschachtelte Beats, Divider-Overlays,
`.panel`) und `4cfd149` (der Entwurf selbst) auf `main` liegt. Was die Prüfung
fand, steht in einem eigenen Abschnitt am Ende, damit die Begründungen nicht
mit dem Entwurf verschwinden. Alles davor ist die Bauanleitung.

## Was es ist, und was es nicht ist

**Ein Overlay liegt über der Folie.** Es nimmt dem Text nichts weg, deshalb
funktioniert es über einem Bild oder wenn es absichtlich über den Inhalt
fährt. Das ist gebaut und bleibt so.

**Ein Dock ist Teil des Rahmens.** Es steht an einer der vier Kanten, reicht
bis zum Folienrand, und die Textspalte wird um es schmaler (Seite) oder
kürzer (Band). Nichts überlagert nichts. Drei Verwendungen, die heute nicht
schreibbar sind:

1. **Mini-Inhaltsverzeichnis** links auf jeder Folie eines Kapitels, der
   aktuelle Punkt hervorgehoben – das Dock gehört dem Kapitel, nicht dem
   Chunk.
2. **Merksatz oder Definition** als Band unten, das auf jeder Folie eines
   Abschnitts stehen bleibt, während der Text darüber wechselt.
3. **Hinweis, der einfährt:** ein Dock mit `from 2`, das von rechts kommt,
   in eine Spur, die der Text von Anfang an freigehalten hat.

Das Vokabular ist das des Overlays, damit ein Autor nichts Zweites lernt.
Der Layout-Vertrag ist ein anderer, deshalb ist es eine eigene Direktive und
kein weiteres Wort auf `::: overlay`: ein Wort, das entscheidet, ob der Text
ausweicht oder überdeckt wird, ist zu viel Gewicht für eine Klasse. Das Paar
heißt so, wie jede Oberfläche es nennt: ein Fenster ist *floating* oder
*docked*.

## Entscheidungen

Jede in einem Satz, mit dem Grund. Die Reihenfolge der Kriterien war:
schreibbar für einen Autor, eindeutig, lernbar weil wie das Vorhandene,
wartbar ohne Duplikat, kein Muster, das von build.js / lint.js / tails.mjs
abweicht.

1. **Der Name ist `dock`, nicht `rail`.** „rail“ ist im Repo schon zweimal
   Chrome – `#touch-rail` ist die Fingerleiste beider Live-Views und „accent
   rail“ ist die entfernte Akzentleiste, deren Abwesenheit `test/settings.mjs`
   behauptet und die in fünf Kommentaren von build.js als das Negativbeispiel
   steht; `edge` scheidet aus, weil `edge` das Pfeil-Statement der
   `::: draw`-Sprache ist und derselbe Autor beides schreibt. `dock` ist in
   allen Dateien frei (einmal als Verb in einem Editor-Hilfetext) und sagt den
   Vertrag: angedockt, der Inhalt weicht.
2. **Ein Dock pro Folie.** Zwei Docks plus Inhalt sind ein Rahmen, die
   Eckenregel zweier Kanten wäre willkürlich, und `left` + `right` lässt auf
   16:9 einer Standard-Spalte keine 30em; der Vertrag, das CSS, der Druck und
   der Linter werden mit einem Dock jeweils um eine Fallunterscheidung
   kleiner. Ein eigenes Dock des Chunks **ersetzt** ein geerbtes vollständig,
   an welcher Kante auch immer.
3. **Seitendocks sind absolut positioniert und der Chunk reserviert die
   Spur als Padding; Bänder sind eine Grid-Zeile.** Ein vierter Grid-Track
   hätte jede `grid-column: 2`-Regel berührt (`.chunk-content` dreimal, die
   `.expanded`-Spalten, die Cover-Grids) und die Folienhöhe als In-Flow-Box in
   `flowHeightProbe` getragen; ein Padding berührt nichts, weil die Textspalte
   in ihrer `minmax(0, --content-w)`-Spur bleibt und die `1fr`-Rinnen den
   Rest absorbieren. Ein Band kann kein Padding sein, weil seine Höhe bei
   `snug` von seinen Wörtern abhängt, und genau das rechnet eine `auto`-Zeile
   aus.
4. **Die Breitenwörter sind Chunk-em, ohne Zoom, border-box.** Die Variable
   steht auf `.chunk`, damit die Textspalte nicht springt, wenn der Dozent
   `+` drückt; das Dock-Typo zoomt innen mit und bricht in einer festen Spur
   um. Die Zahlen sind Startwerte und werden am Foto gemessen (Bauplan,
   Schritt 3).
5. **Der Tail wird im Parser gelesen und dort verweigert, nicht im
   Renderer.** CLAUDE.md: was ein Deck verweigern kann, gehört in den
   Pre-Flight, nicht in einen Renderer, sonst erreicht `--print-only` es
   nicht; und die Vererbung braucht `scope` vor dem Rendern. Das weicht vom
   Overlay ab, dessen `bad-overlay-height` im Renderer sitzt – das Overlay
   wird von jeder View gerendert, deshalb fällt es dort nicht auf; ein
   geerbtes Dock wird von Print nicht gerendert, deshalb fiele es hier auf.
6. **Vererbung passiert im Parser, beim `flushChunk`.** Danach sagt das
   Datenmodell für jede Folie, was auf ihr steht (`chunk.dock`, mit
   `inherited: true`), und beide Renderer bleiben dumm; der Linter hat das
   Kapitel-Dock ohnehin, bevor der erste Chunk kommt.
7. **Der Live-Marker im Mini-TOC ist ausschließlich der `#id`-Link.** Ids
   sind laut CLAUDE.md der eingefrorene Anker für Querverweise, ein Link
   navigiert im Live-View schon heute (`hashchange` → `jumpTo`), und
   Überschriftentext ist mehrdeutig (`|`-Unterzeile, Markup, zwei Chunks mit
   gleichem Titel). Der Zustand wird zur Bauzeit gesetzt, weil jede Kopie des
   geerbten Docks ohnehin pro Chunk gerendert wird. Ein Link auf eine
   Spalten-Id markiert den Teil, mit denselben drei Zuständen wie
   `section: outline`. Ein Link auf eine unbekannte Id ist ein Build-Fehler –
   ein Marker, der nie greift, ist der stille No-op, den das Format überall
   verweigert.
8. **Ein Beat gehört einer Folie; ein geerbtes Dock hat keinen.** `from N`
   und `---` in einem `.every`-Dock werden verweigert, statt auf dreißig
   Folien je einen toten Beat zu erzeugen.
9. **Print druckt ein eigenes Dock als Kasten nach dem Body, vor den
   Overlay-Karten, und ein geerbtes Dock einmal unter der Spaltenüberschrift
   beim Lede.** Overlays drucken heute nach dem Body und Divider-Overlays
   einmal beim Lede – dasselbe Muster, eine Zeile daneben. Ein `top`-Band
   druckt auch dort: Print ist ein Dokument, der Kasten ist eine Notiz zum
   Chunk, und eine Ausnahme pro Kante wäre eine zweite Regel.
10. **Der Collapse braucht keine Änderung.** `splitSentencesIn` läuft nur
    über `.reveal-segment`, und jede `[data-collapse=topic-bold]`-Regel ist
    auf `.reveal-segment` gescoped; ein Dock ist ein Geschwister von
    `.chunk-content` wie die Overlay-Schicht und wird deshalb nie gekürzt.
11. **Die Wörter eines Chunk-eigenen Docks zählen ins Dichte-Budget,
    geerbte nicht.** Der Linter zählt Overlay-Zeilen heute in `chunkBody`,
    weil das Budget misst, was der Projektor zeigt; ein Kapitel-Dock steht
    unter der `#`-Überschrift, wo kein Chunk zählt.
12. **Refusal-Codes bleiben pro Direktive** (`dock-in-layout` neben
    `overlay-in-layout` und `aside-in-layout`); die Zusammenlegung zu einem
    `block-in-layout` ist ein eigener Umbau, weil `<!-- linter: ignore … -->`
    Codes beim Namen nennt und eine Umbenennung Lint-Ausgabe für bestehende
    Quellen ändert.
13. **Chrome, das auf dem Dock landet, wird nur dort verschoben, wo die
    Verschiebung eine Zahl ist:** Foliennummer und Chevrons weichen einem
    rechten Dock um `--dock-w` aus; über einem Band bleiben sie stehen
    (Nummer oben ghosted bei 0.32, Chevrons über einem unteren Band), weil
    die Bandhöhe keine Zahl ist, die CSS kennt. `.annot-add` ist ein
    Hover-Geist links oben und bleibt.
14. **`::: marginalia` und ein rechtes Dock schließen sich aus.** Die
    Marginalie ist absolut an der rechten Kante von `.chunk-content`
    verankert und läuft in den rechten Rand, den das Dock einnimmt; die
    Verweigerung nennt die Alternative (Dock links). Ein linkes Dock stört
    sie nicht.

## Syntax

```md
::: dock {.left .glass .narrow} from 2
- [Einführung](#fz-intro)
- [Fuzzing](#fz-core)
- [Grammatiken](#fz-grammar)
:::
```

Block mit Closer, wie `::: overlay`. Erlaubt auf Chunk-Ebene (kein offener
Wrapper, kein offenes Aside) und unter einer `#`-Überschrift (der Divider).
Der Body ist Prosa, Listen, ein Bild, ein `::: draw`; ein `---` ist ein Beat
wie im Overlay. `from N` wie beim Overlay, positive ganze Zahl. Keine
weiteren Direktiven im Body.

Kapitelweit, unter der Überschrift:

```md
# Fuzzing {#fz}

::: dock {.left .paper .every}
- [Einführung](#fz-intro)
- [Fuzzing](#fz-core)
- [Grammatiken](#fz-grammar)
:::
```

`.every` heißt: auf dem Divider *und* auf jedem Chunk der Spalte bis zur
nächsten `#`-Überschrift. Ohne das Wort ist es ein Dock des Dividers allein.

### Slot-Tabelle (`tails.mjs`)

```js
// A dock is the overlay's vocabulary with the other layout contract: it is
// part of the frame and the text column yields to it. Four edges and no
// corner, because a corner reserves nothing; `every` is the one word the
// overlay does not have, and it is legal only under a # heading.
export const DOCK_SLOTS = {
  edge:   { default: 'left',     words: ['left', 'right', 'top', 'bottom'] },
  ground: { default: 'paper',    words: ['paper', 'ink', 'accent', 'clear', 'glass'] },
  // The column's width for left / right, the text measure inside a band.
  // No `full`: a dock that takes half the slide is a ::: side.
  width:  { default: 'narrow',   words: ['narrow', 'standard', 'wide'] },
  // A band's height; refused on a column, whose height is the slide's.
  height: { default: 'snug',     words: ['snug', 'third', 'half'] },
  // `once` is the divider's own slide; `every` puts the same dock on every
  // chunk of the part. On a chunk only `once` is legal, and writing it
  // changes nothing.
  scope:  { default: 'once',     words: ['once', 'every'] },
};
```

`SLOT_TABLES` bekommt `DOCK_SLOTS` dazu; die Kollisions-Assertion beim Laden
geht durch, weil kein Wort in zwei Slots steht (`left`/`right` nur in
`edge`, `narrow`/`wide` nur in `width`). Der Slot heißt `edge` und nicht
`place`, weil die `same-slot`-Meldung „both answer edge“ sagt, was der Slot
ist, und `place` die neun Wörter des Overlays nahelegt. Der Kommentar oben
in `tails.mjs`, der die fünf Slot-Direktiven aufzählt, nennt sechs.

### Was jedes Wort kostet (Zielwerte, zu messen)

| Wort | Seitendock (`--dock-w`, Chunk-em, border-box) | Band |
|---|---|---|
| `narrow` | 13em | Textmaß 19em (Dock-em) |
| `standard` | 18em | 29em |
| `wide` | 25em | 42em |

Textmaß, das der Spalte auf 16:9 bleibt (Folie = 68.4 Chunk-em bei
`font-size: 0.026 × slide-h`, ein Padding 9.6em, `--dock-gap` 2em):
`narrow` → 43.8em, `standard` → 38.8em, `wide` → 31.8em. Ein Standard-Chunk
(36em) bleibt also bis `standard` unangetastet; `wide` drückt ihn auf 31.8em,
was der Linter unten anzeigt. Das Band nimmt seine Textmaße vom Panel
(`.ov-panel.ov-top.ov-w-*`), weil es dieselbe Frage ist.

## Datenmodell

```js
// on a chunk and on a column, null when none was written
dock: {
  edge: 'left'|'right'|'top'|'bottom',
  ground: 'paper'|'ink'|'accent'|'clear'|'glass',
  width: 'narrow'|'standard'|'wide',
  height: 'snug'|'third'|'half',
  scope: 'once'|'every',
  from: null | number,      // positive integer, never on scope 'every'
  lines: string[],          // the body, ::: draw already compiled into it
  inherited: boolean,       // true on a chunk that got the column's dock
}
```

`currentChunk` und `currentColumn` bekommen `dock: null` in ihren
Objektliteralen (drei Stellen: die `#`-Spalte, die anonyme Spalte vor der
ersten `#`, der `##`-Chunk). Eine geerbte Kopie ist `{ ...col.dock,
inherited: true }` und teilt `lines`; kopiert wird nichts.

## Parser (`parseLecture`)

### Zustand

`let currentDock = null;   // { edge, …, lines } while inside a ::: dock block`
neben `currentOverlay`. `openAside()` liefert `'::: dock'`, wenn es offen
ist. Das Diagramm-Ziel beim Schließen eines `::: draw` bekommt
`currentDock ? currentDock.lines` **vor** `currentOverlay` (beide können
nicht gleichzeitig offen sein, die Reihenfolge ist Konvention). Die
Zeilen-Erfassung am Ende der Schleife: `if (currentDock)
currentDock.lines.push(line)` in beiden Zweigen (Chunk und Spalte), vor
dem Overlay-Fall. Die EOF-Prüfung „never closed“ nennt `dock` neben
`overlay`.

### Der gemeinsame `from`-Leser

Die beiden Prüfungen in `readOverlayLine` (keine positive Ganzzahl, `0`)
wandern in eine Funktion `checkFromBeat(tok, directive)` neben `refuse`, die
beide Direktiven rufen; die Overlay-Wortlaute bleiben zeichengleich, nur
das Wort `overlay` wird zum Parameter. Eine dritte Kopie der zwei Meldungen
wäre der Grund, aus dem `tails.mjs` entstanden ist.

### `readDockLine(line)` – Chunk- und Divider-Pfad, direkt vor `readOverlayLine`

Regex wie das Overlay: `^:::\s+dock\s*(?:\{([^}]*)\})?\s*(?:from\s+(\S+))?\s*$`.
Eine `::: dock`-Zeile, die nicht matcht, wird verweigert (Muster
`::: overlay: "…" is not a line this directive reads`):

> `::: dock: "<line>" is not a line this directive reads.`
> `  It takes an optional {.class} tail and an optional  from <beat>, and`
> `  nothing else:  ::: dock {.left .paper .every}`

Reihenfolge der Prüfungen, jede eine `refuse(...)`:

1. **Offenes Dock** (`currentDock`):
   > `::: dock opened while one is still open (<chunkRef>).`
   > `  A slide has one dock: close the first with a ::: line. If a second`
   > `  dock was meant, it cannot be - put its words in the first.`
2. **Tail** über `parseTail(attrs, DOCK_SLOTS, '::: dock', { id: 'none' })`;
   das erste Problem wird wie in `readTail` zum `userFacing`-Fehler mit
   `slotTable(DOCK_SLOTS)` darunter. Damit sind `unknown-class`,
   `same-slot`, `stray-attribute` (auch `#id`, auch `{}`) erledigt.
3. **`from`** über `checkFromBeat`.
4. **Cover** (`currentChunk && (tag === 'title' || tag === 'closing')`):
   > `::: dock on a <tag> chunk (<chunkRef>).`
   > `  A title or closing slide is framed by its cover composition, which`
   > `  decides where the type and the picture sit. A dock belongs on the`
   > `  chunks after it.`
5. **Höhe auf einer Spalte** (`height !== 'snug' && edge` ist `left`/`right`):
   > `::: dock {.<height>} in <chunkRef>: a height belongs to a top or bottom dock.`
   > `  A column is as tall as the slide, so the word has nothing to set.`
   > `  Write  {.bottom .<height>}.`
6. **`.every` auf einem Chunk** (`currentChunk && scope === 'every'`):
   > `::: dock {.every} in <chunkRef>.`
   > `  A dock is inherited from the part's # heading, not from a chunk: write`
   > `  it under the heading, and every chunk of the part carries it.`
7. **`.every` mit `from`**:
   > `::: dock {.every} from <n> (<chunkRef>).`
   > `  An inherited dock is on every slide of the part from the moment each`
   > `  opens, and a beat is one slide's. Drop from, or drop .every.`
8. **Im Aside** (`currentExpansion || currentOverlay`), Wortlaut wie
   `::: overlay inside ::: expand`:
   > `::: dock inside <openAside()> (<chunkRef>).`
   > `  A dock is part of the slide's frame and an aside is folded under it or`
   > `  laid over it, so one cannot hold the other. Close the block first; a`
   > `  chunk can carry both side by side.`
9. **Im Wrapper** (`layoutStack.length`):
   > `::: dock inside <openLayout()> (<chunkRef>).`
   > `  A dock is part of the slide's frame, so its place in the body means`
   > `  nothing - and the block's closing ::: was read as the dock's. Write the`
   > `  dock outside the block, at chunk level.`
10. **Zweites Dock auf derselben Folie** (`host.dock` schon gesetzt, `host =
    currentChunk || currentColumn`) – Muster `duplicate-backdrop`:
    > `A <chunk|column heading> has two ::: dock blocks (<chunkRef>).`
    > `  One slide has one dock; the second would silently win. Put the words`
    > `  in the first, or move it to another slide.`

Dann `currentDock = { edge, ground, width, height, scope, from, lines: [] }`
und `return true`.

### Im offenen Dock

- `:::` allein → `flushDock()`: `host.dock = { ...currentDock, inherited:
  false }`, `currentDock = null`. Im Chunk-Pfad steht der Fall im
  bestehenden Closer-Block **vor** `currentOverlay`; im Divider-Pfad im
  Block, der heute `if (currentOverlay) { … }` heißt und zu `const cap =
  currentDock || currentOverlay` wird, weil beide dieselben drei Zeilen
  brauchen (Closer, `---`, Direktiven-Verbot).
- `---` → `BEAT_MARK`, es sei denn `scope === 'every'`:
  > `--- inside ::: dock {.every} (<chunkRef>).`
  > `  An inherited dock is on every slide of the part, and a beat is one`
  > `  slide's. Write *** for a rule, or drop .every.`
  Im Chunk-Pfad erweitert sich die Bedingung `(layoutStack.length ||
  currentOverlay)` um `|| currentDock`, und das Ziel-Array um den Dock-Fall.
- Jede Direktive außer `::: draw` (Test `^:::\s+\S` und
  `!parseDrawOpener(line)`), Muster `inside ::: overlay`:
  > `::: <word> inside ::: dock (<chunkRef>).`
  > `  A dock holds prose, a list, an image or a ::: draw, and no other`
  > `  directive. Close the dock first.`
  Im Chunk-Pfad kommt das an die Stelle, an der `layoutWord && currentOverlay`
  geprüft wird (dieselbe Liste plus `cards`/`rows`, die dort heute im
  `cardsOpen`-Zweig als `cards-nested` gegen `openAside()` laufen – das
  fängt das Dock über `openAside()` automatisch). Das Backdrop im Dock
  läuft über den bestehenden `openAside()`-Guard mit.
- Eine `##`- oder `#`-Überschrift im Dock ist Dock-Inhalt, wie im Overlay
  (die Guard-Logik „headings stopped breaking out of a captured block“ ist
  dieselbe; nichts zu tun außer `currentDock` in ihrer Bedingung).

### `flushChunk()`

Nach `flushOverlay()`: `flushDock()`; dann die Vererbung:

```js
if (!currentChunk.dock && currentColumn.dock && currentColumn.dock.scope === 'every') {
  currentChunk.dock = { ...currentColumn.dock, inherited: true };
}
```

Dann die Marginalien-Prüfung. `::: marginalia` setzt beim Öffnen
`currentChunk.hasMarginalia = true` (eine Zeile im bestehenden Zweig); hier:

> `::: marginalia on a slide with a right dock (<chunkRef>).`
> `  The aside extends into the right margin, which the dock occupies. Put the`
> `  dock on the left, or drop the aside.`

Der Check steht im Flush und nicht beim Öffnen, weil das eigene Dock des
Chunks nach der Marginalie im Body stehen kann.

`::: dock` vor jeder Überschrift fällt wie das Overlay durch: `readDockLine`
wird nur im Chunk- und im Divider-Pfad gerufen, und die Zeile landet als
Prosa nirgends, weil vor der ersten Überschrift nichts sammelt – lint.js
meldet dort `stray-directive`, wie beim Overlay.

## Renderer

### Nummern und Ziele, einmal

Neben `lectureParts(columns)` kommt `chunkNumbers(columns)`:

```js
// The one walk that numbers the slides. renderColumnsHtml and the print
// renderer both read it, because a dock's link states compare a target's
// number with the slide's, and a second counter would be a second
// definition of "slide 12". A column maps to the span of its chunks, which
// is what lets a dock link a part and light it while the reader is inside.
function chunkNumbers(columns) {
  const of = new Map(); const byId = new Map(); let n = 0;
  for (const col of columns) {
    const first = n + 1;
    for (const c of col.chunks) { n += 1; of.set(c, n); if (c.id) byId.set(c.id, [n, n]); }
    if (col.id && col.chunks.length) byId.set(col.id, [first, n]);
  }
  return { of, byId };
}
```

`renderColumnsHtml` ersetzt sein `num += 1` durch `nums.of.get(c)`, und
`renderPrintDoc`s `nextNum`-Closure durch dieselbe Map (`renderColumn`
bekommt `nums` statt `nextNum`). Ein Test behauptet, dass `data-chunk-num`
in `audience.html` und `print.html` nach wie vor übereinstimmen.

### `renderDock(dock, where, pos, nums)`

Gemeinsam für Audience und Print, im Abschnitt *slide decoration* neben
`renderOverlayLayer`. `pos` ist die Position der Folie: die Chunk-Nummer,
`firstNum − 0.5` für den Divider (er steht vor dem ersten Chunk seiner
Spalte; ohne Chunks `Infinity`), `null` für Print (kein Zustand).

```js
function renderDock(dock, where, pos, nums) {
  if (!dock) return '';
  let body = marked.parse(dock.lines.join('\n'));
  if (pos != null) {
    const states = [];
    body = body.replace(/<a href="#([^"]+)"/g, (m, id) => {
      const span = nums.byId.get(decodeURIComponent(id));
      if (!span) refuseDockLink(where, id);            // userFacing, see below
      const s = pos < span[0] ? 'next' : pos > span[1] ? 'done' : 'now';
      states.push(s);
      return `<a href="#${id}" data-state="${s}"`;
    });
    // A list nobody has started is a plan, read at full strength - the same
    // rule renderOutlineList applies when now is 0.
    if (states.length && !states.some(s => s !== 'next')) body = body.replace(/ data-state="next"/g, ' data-state="all"');
  }
  const cls = ['dock', `dock-${dock.edge}`, `ov-${dock.ground}`, `dock-w-${dock.width}`,
    dock.height !== 'snug' ? `dock-h-${dock.height}` : ''].filter(Boolean).join(' ');
  const from = dock.from == null ? '' : ` data-from="${dock.from}"`;
  const inh = dock.inherited ? ' data-inherited=""' : '';
  return `<aside class="${cls}"${from}${inh}>${body}</aside>`;
}
```

Der Link-Fehler (`refuseDockLink`), `userFacing`:

> `::: dock in <where> links #<id>, and no chunk or column carries that id.`
> `  A #link in a dock is the live marker - it lights the item the room is on -`
> `  so a link that names no slide can never light. Fix the id, or write the`
> `  item without a link.`

Er läuft für jede Kopie, also auch für Print (`pos == null` überspringt nur
den Zustand, nicht die Prüfung – die Prüfung steht vor dem `if`). Der
Zustand sitzt auf dem `<a>` und nicht auf dem `<li>`, weil ein Item auch
Text neben dem Link tragen darf und der Ersatz dann eine einzige Regex ist,
ohne Listen-Parsing.

### Audience (`renderAudienceChunk`, `renderColumnSectionChunk`)

Der Artikel bekommt `data-dock="<edge>" data-dock-w="<width>"`, wenn
`chunk.dock` gesetzt ist;
das `<aside class="dock …">` steht **nach** `.chunk-content` und **vor**
`.overlay-layer`, als Geschwister. Für den Divider dasselbe mit `col.dock`
und `pos = firstNum − 0.5`. `renderAudienceChunk` bekommt `nums` als
Parameter (statt `num` allein: `num = nums.of.get(chunk)`).

### Audience-CSS (`AUDIENCE_CSS`, hinter dem Panel-Block)

```css
/* ── docks (::: dock) ───────────────────────────────────────────────
   A dock is a panel that the text yields to. A column is absolute against
   the chunk, and the chunk reserves the column as padding on that side -
   the content track stays minmax(0, --content-w) and the 1fr gutters absorb
   the rest, so no grid-column rule changes. A band is a grid row, because
   its height at `snug` is its words', which only an auto row can measure.
   The width variable lives on .chunk in the chunk's own em, unzoomed: the
   text column must not jump when the lecturer presses +. */
.chunk[data-dock] { min-height: var(--slide-h); --dock-gap: 2em; }
/* --dock-w is set on .chunk, because that is where the padding resolves it;
   so the width word rides on the article as data-dock-w, beside data-dock,
   rather than as a class on the aside alone. Measured values: PLAN-rail.md. */
.chunk[data-dock-w=narrow]   { --dock-w: 13em; }
.chunk[data-dock-w=standard] { --dock-w: 18em; }
.chunk[data-dock-w=wide]     { --dock-w: 25em; }
.chunk[data-dock=left]  { padding-left:  calc(var(--dock-w) + var(--dock-gap)); }
.chunk[data-dock=right] { padding-right: calc(var(--dock-w) + var(--dock-gap)); }

.dock {
  z-index: 1;                       /* the content's rung: beside it, not over it */
  font-size: calc(0.92em * var(--zoom));
  line-height: 1.45;
  display: flex; flex-direction: column; justify-content: center;
  transition: opacity 0.5s ease 0.14s, transform 0.5s ease 0.14s, visibility 0.5s;
}
.dock > :first-child { margin-top: 0; }
.dock > :last-child  { margin-bottom: 0; }
.dock ul, .dock ol { margin: 0; padding-left: 1.1em; }
.dock li + li { margin-top: 0.35em; }
.dock strong { font-weight: var(--bold-weight); color: var(--emph); }

/* column: absolute against the chunk, whose padding is the reserved track.
   Vertical padding is the slide's; horizontal is fixed, because 14% of a
   13em column is not a padding. */
.dock.dock-left, .dock.dock-right {
  position: absolute; top: 0; bottom: 0;
  width: var(--dock-w);
  padding: var(--slide-pad-y) 1.2em;
}
.dock.dock-left  { left: 0; }
.dock.dock-right { right: 0; }

/* band: a grid row across every track. Wider than its area and centred, so
   it overflows both sides equally - which is exactly the slide, because the
   chunk's horizontal padding is symmetric (one dock per slide guarantees
   it). Not a negative margin: --slide-pad-x is a percentage and a margin
   would resolve it against the grid area, a third short of the edge - the
   panel's trap, recorded in the decoration skill. */
.chunk[data-dock=top]    { grid-template-rows: auto minmax(0, 1fr); padding-top: 0; }
.chunk[data-dock=bottom] { grid-template-rows: minmax(0, 1fr) auto; padding-bottom: 0; }
.dock.dock-top, .dock.dock-bottom {
  grid-column: 1 / -1;
  width: var(--slide-w); justify-self: center; max-width: none;
  /* the same inset the overlay layer and the panel use, as a length */
  padding: 0.85em calc(var(--slide-w) * 0.14 * 0.62);
}
.dock.dock-top    { grid-row: 1; }
.dock.dock-bottom { grid-row: 2; }
.dock.dock-h-third { min-height: calc(var(--slide-h) / 3); }   /* a length: a % min-height against an auto row is ignored */
.dock.dock-h-half  { min-height: calc(var(--slide-h) / 2); }
.dock.dock-top.dock-w-narrow > *,   .dock.dock-bottom.dock-w-narrow > *   { max-width: 19em; }
.dock.dock-top.dock-w-standard > *, .dock.dock-bottom.dock-w-standard > * { max-width: 29em; }
.dock.dock-top.dock-w-wide > *,     .dock.dock-bottom.dock-w-wide > *     { max-width: 42em; }

/* from N: the track is reserved from beat 0 and the dock slides into it,
   so the text never moves - the rule overlay cards already follow ("keeps
   its cell in both states"). Same nudge and fade as a panel. */
.dock[data-hidden] { opacity: 0; visibility: hidden; }
.dock.dock-left[data-hidden]   { transform: translateX(-1.2em); }
.dock.dock-right[data-hidden]  { transform: translateX(1.2em); }
.dock.dock-top[data-hidden]    { transform: translateY(-1.2em); }
.dock.dock-bottom[data-hidden] { transform: translateY(1.2em); }

/* the live marker: two greys a projector can tell apart, three it cannot */
.dock a { color: inherit; text-decoration: none; }
.dock a[data-state=done], .dock a[data-state=next] { color: var(--ink-soft); }
.dock a[data-state=now] { color: var(--ink); font-weight: var(--bold-weight); }

/* chrome that would land on a column moves off it by the column's width;
   over a band it stays (a band's height is not a number CSS has) */
.chunk[data-dock=right] > .chunk-num { right: calc(var(--dock-w) + var(--slide-pad-x) * 0.35); }
.chunk[data-dock=right] > .exps      { right: calc(var(--dock-w) + var(--dock-gap)); }
.chunk[data-dock=left]  > .overlay-layer { padding-left:  calc(var(--dock-w) + var(--dock-gap) + var(--slide-pad-x) * 0.62); }
.chunk[data-dock=right] > .overlay-layer { padding-right: calc(var(--dock-w) + var(--dock-gap) + var(--slide-pad-x) * 0.62); }
```

Dazu drei Änderungen an vorhandenen Regeln:

- Die fünf Grund-Regeln `.overlay-card.ov-paper / .ov-ink / .ov-accent /
  .ov-glass / .ov-clear` werden zu `:is(.overlay-card, .dock).ov-…`, in
  Audience- **und** Print-CSS. Ein Dock trägt dieselben `ov-`-Klassen; die
  `--emph`-Regel aus dem Decoration-Skill (Accent-Ground definiert `--emph`
  nicht um) gilt damit automatisch, und `test/settings.mjs` prüft sie
  bereits am `.overlay-card`-Block. `.ov-glass.ov-panel`s 68 % gelten auch
  für das Dock: `:is(.overlay-card.ov-panel, .dock).ov-glass`.
- Die `prefers-reduced-motion`-Regel der Overlay-Karte nimmt `.dock` auf.
- `.chunk[data-has-backdrop] > .chunk-content, .chunk[data-has-panel] >
  .chunk-content { z-index: 1 }` bekommt `.chunk[data-dock] > .chunk-content`
  dazu, damit die Z-Leiter (Backdrop 0, Inhalt und Dock 1, Over-Bild 2,
  Overlays und Nummer 3) auf einer Folie mit Dock und Backdrop stimmt; die
  Nummern-Regel daneben ebenso.

`.expanded` braucht nichts: das zweispaltige Grid mit `justify-content:
center` zentriert Inhalt und Pane in der Breite, die das Padding lässt.
Die Cover-Grids brauchen nichts, weil ein Cover kein Dock trägt.

### Print (`renderChunk`, `renderColumn`)

- `renderChunk`: `const dockHtml = chunk.dock && !chunk.dock.inherited ?
  renderDock(chunk.dock, where, null, nums) : ''`, eingesetzt zwischen
  `${bodyHtml}` und `${overlayHtml}`.
- `renderColumn`: `renderDock(col.dock, …)` zwischen `${lede}` und der
  Overlay-Schicht der Spalte; `.every` druckt damit genau einmal.
- Print-CSS: die Karten-Regeln `.overlay-card { padding … max-width: 34em }`
  und `> :first-child / :last-child` werden zu `:is(.overlay-card, .dock)`,
  plus `.dock { display: block; margin: 0.9rem 0; }`. `print-notes` erbt es.
- `.beat-mark` ist im Print schon `display: none`.

## Runtime (`AUDIENCE_JS`)

Eine Konstante neben `FOCUSABLE_SEL`, mit demselben Grund:

```js
// Everything that is held to a beat by `from N`. One string, or the three
// walks below disagree about what arrives when.
const FROM_SEL = '.overlay-card[data-from], .dock[data-from]';
```

und die drei Stellen, die heute `.overlay-card[data-from]` schreiben, lesen
sie: `chunkBeats` (der `closest()` für `at`), `countSegments`, `applyReveal`.
Sonst nichts: ein Dock mit `from` ist für den Zähler eine Overlay-Karte, und
ein `---` darin zählt ab `from` wie dort. Kein neues Sync-Feld,
`revealed[chunkId]` bleibt der einzige Zustand.

### Auto-Fit (`flowHeightProbe`)

Zwei Zeilen, und sie sind der Grund, aus dem das Seitendock absolut ist und
trotzdem gemessen wird: in `flowKids` bleibt ein Kind mit Klasse `dock`
**vor** dem `position: absolute`-Filter in der Liste, und in `inner` wird
`.dock` wie `.chunk-content` durchgeschaut (`levelOf`). Ergebnis: ein
Seitendock trägt die Ausdehnung seiner Wörter plus seine Paddings bei, nicht
seine Folienhöhe; ein zu langes Inhaltsverzeichnis lässt Auto-Fit also
kleiner werden, und ein kurzes lässt es in Ruhe. Ohne die Ausnahme wäre das
Dock als absolutes Kind unsichtbar für den Fit (Panel-Verhalten) – für ein
Band, das ohnehin im Flow ist, gilt das Durchschauen genauso, sonst zählt
ein `half`-Band mit einer Zeile als halbe Folie.

`nowrapProbe` braucht nichts: die Spur ist fest, der Text bricht.
`fitZoomToChunk` und `clampZoomToWidth` bleiben unverändert.

### `--squint`

Ein Zweig in `squintScan` neben `overlay-card`:
`put('[', 'dock · ' + slots(el, 'dock-') + (el.hasAttribute('data-inherited') ? ' · inherited' : ''))`.
Die Notation im Authoring-Skill bekommt die Zeile.

`--check-fit` misst den Chunk als Ganzes und braucht nichts.

## Collapse (`topic-bold`)

Nichts zu tun, aus dem Grund in Entscheidung 10. Der Test dafür ist
negativ formuliert: kein `.sentence-head` innerhalb von `.dock` im
gebauten `audience.html`, und `::: slide` im Body blendet das Dock nicht
aus, weil die `:has(.slide-explicit)`-Regel im Segment greift.

## Linter-Spiegel (`lint.js`)

Import `DOCK_SLOTS` aus `tails.mjs`. Zustand: `activeDirective.kind ===
'dock'` wie `overlay`; `chunk.dock` / `col.dock` als `{ edge, width, scope,
line }`; `chunk.hasMarginalia` gibt es als `marginaliaSeen` schon.

| Code | Bedingung | Art |
|---|---|---|
| `bad-dock` | `::: dock`-Zeile, die der Regex nicht liest | error |
| `unknown-class` / `same-slot` / `stray-attribute` | aus `parseTail(…, DOCK_SLOTS, '::: dock')` | error |
| `bad-dock-from` | `from` keine positive Ganzzahl, oder `from` mit `.every` | error |
| `dock-on-cover` | auf einem `title`- oder `closing`-Chunk | error |
| `bad-dock-height` | `.third` / `.half` mit `left` / `right` | error |
| `dock-scope` | `.every` auf einem Chunk | error |
| `dock-in-layout` | `layoutStack.length` beim Öffnen | error |
| `nested-directive` | `activeDirective` beim Öffnen (Overlay, Expand, Footnote) – bestehender Code | error |
| `directive-in-dock` | jede Direktive außer `::: draw` im Dock; `cards`/`rows` laufen wie beim Overlay als `cards-nested` | error |
| `bad-dock-beat` | `---` in einem `.every`-Dock | error |
| `duplicate-dock` | zweites `::: dock` auf einem Chunk oder einer Spaltenüberschrift (`first at line N`) | error |
| `stray-directive` | vor jeder Überschrift – bestehender Code | error |
| `unclosed-directive` | am EOF offen – bestehender Code | error |
| `dock-link` | `](#id)` im Dock-Body außerhalb von Code-Spans, dessen Id kein Chunk und keine Spalte ist; geprüft nach dem Durchlauf, weil das Ziel weiter unten stehen darf | error |
| `marginalia-in-dock` | `::: marginalia` auf einem Chunk, dessen wirksames Dock (eigenes oder geerbtes) `right` ist; beim `flushChunk` | error |
| `dock-narrows-measure` | wirksames Seitendock und `avail < min(WIDTH_EM[w], WIDTH_EM.standard)` mit `avail = SLIDE_EM − SLIDE_PAD_EM − DOCK_EM[width] − DOCK_GAP_EM` | warn |
| `layout-too-narrow` | **bestehend**; `measureHere()` startet bei `min(WIDTH_EM[w], avail)`, wenn ein Seitendock wirksam ist, sonst wie heute | warn |
| `density` | **bestehend**; die Zeilen eines Chunk-eigenen Docks gehen in `chunkBody` wie Overlay-Zeilen, die eines Divider-Docks nirgendwohin | warn |

Neue Konstanten neben `WIDTH_EM`, mit Kommentar, dass sie das Audience-CSS
spiegeln: `DOCK_EM = { narrow: 13, standard: 18, wide: 25 }`, `DOCK_GAP_EM =
2`, `SLIDE_EM = 68.4` (16:9 bei `font-size: 0.026 × slide-h`, der Viewport
von `--check-fit`), `SLIDE_PAD_EM = 9.6` (14 % davon). Die Formel gilt nur,
wenn ein Dock im Spiel ist – `wide` und `full` werden ohne Dock weiter mit
52 und 72 gerechnet, obwohl der Projektor 49.2em gibt, weil eine Korrektur
dort bestehende Warnungen in bestehenden Decks ändert und ein eigener
Schritt ist.

Meldungstexte im Stil der Datei, ein Beispiel:

> `::: dock {.wide} beside a standard chunk leaves the text about 32em – under the standard measure; use a narrower dock or a narrower chunk`

Die Vererbung im Linter: beim Anlegen eines Chunks `chunk.dock = col.dock &&
col.dock.scope === 'every' ? { ...col.dock, inherited: true } : null`, ein
eigenes `::: dock` überschreibt. Damit sehen `layout-too-narrow`,
`dock-narrows-measure` und `marginalia-in-dock` dasselbe Dock wie der Build.

## Tests

### `test/settings.mjs` (mit `raw()` und `lintOf()`, keine neuen Helfer)

Jeder Refusal als Paar Build-Wortlaut / Lint-Code, in der Tabelle des Blocks
*what may open inside what* oder daneben:

1. `::: dock inside ::: cols` → `/::: dock inside ::: cols/`, `dock-in-layout`.
2. `::: dock inside ::: expand` → `nested-directive`; `::: dock inside ::: overlay` → `nested-directive`; `::: overlay inside ::: dock` → `nested-directive`.
3. `::: cols inside ::: dock` → `/::: cols inside ::: dock/`, `directive-in-dock`; `::: backdrop inside ::: dock` → `directive-in-dock`; `::: cards inside ::: dock` → `cards-nested`.
4. `::: dock {.left .third}` → `/a height belongs to a top or bottom dock/`, `bad-dock-height`.
5. `::: dock from 0`, `from later`, `{.every} from 2` unter `#` → `bad-dock-from` (drei Fälle).
6. `::: dock {.every}` auf einem Chunk → `dock-scope`; auf `## title:` → `dock-on-cover`.
7. zwei Docks auf einem Chunk; zwei unter einer `#` → `duplicate-dock`.
8. `- [x](#nope)` → `/links #nope, and no chunk or column carries that id/`, `dock-link`; derselbe Fehler mit `--print-only`, weil er im Renderer für Print ebenfalls läuft.
9. `::: marginalia` + eigenes `{.right}`; `::: marginalia` unter einem geerbten `{.right .every}` → `marginalia-in-dock`.
10. `---` in `{.every}` → `bad-dock-beat`; `::: dock` vor der ersten Überschrift → `stray-directive`; `::: dock` ohne Closer am EOF → `/::: dock was never closed/`, `unclosed-directive`.
11. `{.left .right}` → `same-slot`; `{.center}` → `unknown-class`; `{#x}` → `stray-attribute`; `::: dock {.left} extra` → `/is not a line this directive reads/`, `bad-dock`.
12. **accept:** ein `::: draw` im Dock; ein `---` in einem `once`-Dock auf Chunk und auf Divider; `{.every}` unter `#`; `{.once}` ausgeschrieben auf einem Chunk; ein linkes Dock mit Marginalie; `::: dock` gefolgt von `::: overlay` auf einem Chunk.
13. **Markup:** `::: dock {.left .ink .standard}` ergibt `<article … data-dock="left" data-dock-w="standard"` und `<aside class="dock dock-left ov-ink dock-w-standard"` nach `chunk-content` und vor `overlay-layer`; ohne Tail `dock-left ov-paper dock-w-narrow` und keine `dock-h-`-Klasse; `{.bottom .half}` → `dock-h-half`.
14. **Vererbung:** `#` mit `{.every}` und drei Chunks, der zweite mit eigenem `{.right}`: drei Artikel tragen `data-dock`; Kopie 1 und 3 `data-inherited`, Kopie 2 nicht und `dock-right`; `print.html` enthält `class="dock` genau zweimal (Divider einmal, Chunk 2 einmal), `print-notes.html` ebenso.
15. **Zustände:** Links `#a #b #c` im `.every`-Dock; im Artikel `#b` steht `href="#a" data-state="done"`, `#b` `now`, `#c` `next`; im Divider-Artikel alle `all`; ein Link auf die Spalten-Id ist auf jedem Chunk der Spalte `now` und auf dem Chunk der nächsten Spalte `done`; in `print.html` kommt `data-state` nicht vor.
16. **Nummern:** die Folge der `data-chunk-num` in `audience.html` gleicht der in `print.html` (die eine Zählung).
17. **Guards im Quelltext des Builds:** `audience.html` enthält `const FROM_SEL = '.overlay-card[data-from], .dock[data-from]'` und keine weitere Fundstelle von `.overlay-card[data-from]` außer in dieser Konstante; `flowHeightProbe`s Text enthält `'dock'`; Audience- und Print-CSS enthalten `:is(.overlay-card, .dock).ov-paper`; `--dock-w: 13em` steht unter `[data-dock-w=narrow]`; keine `.sentence-head` in einem `.dock` des gebauten Fixtures; `--emph:` fehlt weiterhin im Accent-Block.
18. **Lint-Arithmetik:** `{.wide}`-Chunk + `{.wide}`-Dock + `::: cols 3` → `layout-too-narrow`; Standard-Chunk + `{.wide}`-Dock → `dock-narrows-measure`; Standard + `{.narrow}` → keins von beiden; ein Band `{.bottom .wide}` + `cols 3` auf `wide` → **kein** `layout-too-narrow` (ein Band nimmt kein Maß).
19. **Dichte:** `free`-Chunk mit 240 Body-Wörtern und 20 Dock-Wörtern → `density`; dieselben 20 Wörter im `.every`-Dock des Dividers → kein `density`.

### `test/dock.mjs` – Browser-Spec mit eigenem Fixture-Deck

Sechstes Fixture-Deck, aus dem Grund, den `test/README.md` für die fünf
nennt: kein Korpus-Deck hat ein Dock, und die Behauptungen sind Geometrie.
Aufbau nach `test/beats-nested.mjs` (`SOURCE`, `mkdtemp`, `--audience-only`,
`serve`, `jump`). Deck: `auto-fit: true`; ein Teil `#p` mit `{.left .every}`
und drei Links; Chunk `#a` (standard), Chunk `#b` (`wide`, mit `::: cols 2`),
Chunk `#c` mit eigenem `{.right .glass} from 2` und zwei `---` im Body,
Chunk `#d` mit `{.bottom .ink .third}` und einem `---`. Behauptungen, alle
bei 1600×900:

- **kein Überlapp:** auf `#a`, `#b`, `#c` (Beat 2) und `#d` schneiden sich
  die Rechtecke von `.dock` und `.chunk-content` nicht (`getBoundingClientRect`
  im Stage-Koordinatensystem, wie `check-fit` misst).
- **bis zur Kante:** auf `#a` ist `dock.left === chunk.left` und
  `dock.height === chunk.height`; auf `#c` `dock.right === chunk.right`; auf
  `#d` `dock.width === chunk.width` und `dock.bottom === chunk.bottom`.
- **Textmaß:** `.chunk-content.width ≤` der aufgelöste Wert von
  `--content-w` (px) auf `#a` und `#b`; auf `#b` gilt das für beide
  Spalten, sonst ist `cols 2` nicht mehr zwei Spalten.
- **`from 2` bewegt den Text nicht:** `.chunk-content.width` und `.left` auf
  `#c` sind bei Beat 0, 1 und 2 identisch; das Dock hat `data-hidden` bei
  0 und 1 und nicht bei 2.
- **Band:** `dock.top ≥ chunk-content.bottom` auf `#d`, `dock.height ≥
  slide-h / 3 − 1`.
- **Marker:** im Artikel `#b` trägt `a[href="#b"]` `data-state="now"`, im
  Artikel `#a` `data-state="next"`; im Divider-Artikel steht kein `now`.
- **Auto-Fit läuft nicht in den Keller:** nach `jump` auf `#a` ist
  `state.zoom ≥ 1` (ohne die `flowHeightProbe`-Änderung fiele er auf 0.6,
  weil eine folienhohe Box nie in 94 % passt); nach `jump` auf `#d` ebenso.
- **Chrome:** auf `#c` liegt `.chunk-num.right ≤ dock.left`.
- **`--check-fit`** auf dem Fixture-Deck endet mit Exit 0 (Spawn im Spec).

`npm test` läuft die Gates zuerst; `node test/gates/run.mjs inlined` vor
jedem Urteil über einen Build-Fehler in `AUDIENCE_CSS` / `AUDIENCE_JS`.

## Dokumentation

- **`.claude/skills/psi-slides-decoration/SKILL.md`:** ein Aufzählungspunkt
  `::: dock {…} … :::` direkt nach dem Overlay-Punkt, mit dem Vertrag
  (floating vs. docked), der Slot-Tabelle als sechste Direktive in der
  Tabelle, den drei CSS-Fallen (Padding statt Track; Band breiter als seine
  Zelle und zentriert statt negativer Margin; `flowHeightProbe` schaut durch
  ein absolutes Kind, was es sonst nirgends tut) und der Z-Leiter mit dem
  Dock auf Stufe 1. Im Divider-Abschnitt: die Liste dessen, was ein Divider
  trägt, bekommt `::: dock` und `.every`. Der Absatz zu `lint.js` am Ende
  des Decoration-Teils nennt die neuen Codes. Description-Zeile: `::: dock`
  mit `.every` ergänzen.
- **`.claude/skills/psi-slides-authoring/SKILL.md`:** neuer Abschnitt
  `### ::: dock {…}` nach dem Backdrop/Overlay-Abschnitt mit den drei
  Verwendungen als Beispiele; Nesting-Tabelle: Zeile `dock` (hält Prosa,
  Listen, Bild, `draw`, `---`; verweigert alles andere,
  `directive-in-dock`), `dock` in der Spalte „refused“ der Zeile *any
  wrapper* (`dock-in-layout`), `dock` in der Divider-Zeile; in *Beats below
  the top level* der Satz, dass ein `---` in einem `.every`-Dock verweigert
  wird; *The linter* um die Codes; `--squint`-Notation um `[ dock ·`.
- **`CLAUDE.md`:** im Abschnitt *Slide decoration and section dividers* wird
  aus „Four constructs“ fünf mit einem Satz zum Vertrag; im Konventionen-Block
  neben `FOCUSABLE_SEL` der Satz zu `FROM_SEL`; `lectures/diagrams`-Absatz:
  „the five specs that build a deck of their own“ wird sechs, ebenso in
  `test/README.md`, das `dock.mjs` in die Fixture-Liste aufnimmt.
- **`CHANGELOG.md`** unter `## [Unreleased]`, `### Added`: ein Absatz im
  Stil der Datei – was es ist, warum eigene Direktive, dass `.every`
  erbt, dass es additiv ist (ein `source.md` ohne Dock baut byte-identisch,
  bis auf die `:is()`-Umschreibung der Grund-Regeln, die dieselben
  Deklarationen ausgibt), und die Linter-Codes.
- **`lectures/decoration/source.md`:** eine neue Spalte `# A dock at the
  frame's edge {#docks}` mit `::: dock {.left .every}` und drei Links auf
  ihre eigenen Chunks: `#dock-why` (der Vertrag, Standard-Breite),
  `#dock-band` mit eigenem `{.bottom .accent .third}` (ersetzt das geerbte
  und zeigt es damit) und `#dock-from` mit `{.right .glass} from 2`. Die
  Spalte steht vor `# A heading that stays off the slide`. Danach
  `audience.html` und `print.html` neu bauen und committen; die Release-
  Prüfung verlangt es. Außerdem `README`/Site-Galerie: nichts, die Site
  zeigt Cover, nicht Direktiven.
- **`PRD.md` §4:** ein Absatz unter dem Overlay, weil es eine Form-
  Entscheidung ist (Rahmen vs. Schicht).

## Bauplan

Jeder Schritt endet mit einer Messung, und die Reihenfolge ist so, dass
build.js und lint.js pro Commit kongruent bleiben (CLAUDE.md: „when you add
a refusal to one file, grep the other for the same key in the same commit“).

1. **`tails.mjs`:** `DOCK_SLOTS`, in `SLOT_TABLES`, Kopfkommentar. Messen:
   `npm run gate` grün, insbesondere die Kollisions-Assertion läuft durch
   den Import beider Dateien.
2. **Parser + Datenmodell + alle Verweigerungen, und der Lint-Spiegel im
   selben Commit** (Codes 1–12 der Tabelle, die Vererbung, `chunkNumbers`
   mit dem Nummern-Test 16). Messen: die Paare 1–12 und 14–16 aus
   `test/settings.mjs`, `node lint.js lectures/ --strict` unverändert grün
   (kein Korpus-Deck hat ein Dock; Nummern-Test bestätigt, dass die eine
   Zählung nichts verschoben hat).
3. **Audience-Renderer und CSS**, `renderDock`, die `:is()`-Umschreibung,
   die drei Chrome-Regeln. Messen am Foto, wie beim Panel: das Fixture-Deck
   bei 1600×900 und 1920×1080 mit `--check-fit` und einem Screenshot
   (`docs/site/shoot.mjs` zeigt, wie man mit playwright-core eine Folie
   schießt); ein echtes Inhaltsverzeichnis mit sieben Einträgen in `narrow`,
   ein zweizeiliger Merksatz in `bottom .snug`, ein Hinweis von drei Zeilen
   in `right .standard`. Die drei Zahlen `13 / 18 / 25` und `--dock-gap`
   danach in **beiden** Dateien (`AUDIENCE_CSS`, `DOCK_EM`) setzen und die
   Tabelle oben nachziehen. `node test/gates/run.mjs inlined` und
   `assertStylesheetsWellFormed` sind die Wächter für Backtick und `/*`.
4. **Runtime:** `FROM_SEL`, `flowHeightProbe`, `squintScan`. Messen: Test 17
   und die Auto-Fit-Behauptung des Browser-Specs (Zoom ≥ 1 auf dem TOC-
   Chunk); `--squint` auf dem Fixture zeigt `[ dock · left · inherited` auf
   jeder Folie des Teils und einmal ohne `inherited` auf dem Divider.
5. **Print:** `renderChunk`, `renderColumn`, Print-CSS. Messen: Test 14
   (zweimal `class="dock`), `print-notes.html` identisch bis auf die Notizen,
   `--print-only` erreicht `dock-link` (Test 8).
6. **Browser-Spec `test/dock.mjs`**, dann `npm test` komplett – und die
   Specs, die `lectures/diagrams` nach Chunk-Id adressieren, bleiben
   unberührt, weil kein Chunk dort ein Dock bekommt.
7. **Dokumentation, Decoration-Lecture, Tracked Outputs, CHANGELOG.** Messen:
   `node lint.js lectures/decoration/source.md` grün, die vier Views von
   `tutorial` und `diagrams` unverändert (`git status` zeigt nur
   `lectures/decoration/audience.html` und `print.html`), und ein letzter
   Grep in beiden Dateien nach jedem Code der Tabelle.

## Was die Prüfung am ersten Entwurf fand

Die Nummern verweisen auf die Entscheidungen oben.

1. **Der Vier-Spur-Grid-Vertrag hätte jede `grid-column: 2`-Regel und
   Auto-Fit gekostet.** `grep -n 'grid-column' build.js` im Audience-CSS:
   `.chunk-content` steht dreimal auf Spalte 2 (Chunk, Cover, Divider), die
   `.expanded`-Ansicht baut ein eigenes zweispaltiges Grid mit Inhalt auf 1
   und Pane auf 2, die Cover `split`/`beside`/`above` definieren eigene
   Templates. Schwerer: `flowHeightProbe` misst die In-Flow-Kinder des
   Chunks und überspringt nur absolute; eine Grid-Spur in Folienhöhe hätte
   `heightOf()` auf die Folienhöhe gesetzt, die nie in 94 % passt, und
   Auto-Fit auf jedem Dock-Chunk auf 0.6 getrieben – genau der Fehler, der
   im Kommentar über `nowrapProbe` für Cover und Divider beschrieben ist.
   Der Entwurf sagte das Gegenteil („was Auto-Fit sieht und mit einem
   kleineren Zoom beantwortet“). → Entscheidung 3, und das Durchschauen in
   `flowHeightProbe`.
2. **Das Band konnte nicht über negative Margins bluten.** `--slide-pad-x`
   ist `14%`, und ein Margin löst es gegen die Grid-Zelle auf, ein Drittel zu
   kurz – der dokumentierte Panel-Fallstrick. Der Entwurf hatte „ohne den
   Prozent-Fallstrick“ versprochen, weil er nur an die Seitenspur dachte.
   → `width: var(--slide-w); justify-self: center`, was Symmetrie des
   Paddings voraussetzt, was wiederum Entscheidung 2 liefert.
3. **`.marginalia` ist nicht am Grid verankert, sondern an `.chunk-content`**
   (`left: calc(100% + 2vw)`, `position: absolute`, `z-index: 2`). Mit einem
   rechten Dock läge sie im Dock und darüber. Der Entwurf zählte die
   Marginalie unter „muss mit einer vierten Spur gelesen werden“, als wäre
   es eine Spaltenfrage. → Entscheidung 14.
4. **Der Collapse hat keine `closest()`-Liste, in die `.rail` käme.**
   `splitSentencesIn` wird pro `.reveal-segment` gerufen
   (`document.querySelectorAll('.reveal-segment').forEach(…)`), und der
   `closest('.slide-explicit, .script-only')`-Guard sitzt innerhalb dieser
   Segmente. Overlay-Karten sind heute nicht deshalb ungekürzt, weil sie in
   einer Liste stehen, sondern weil sie außerhalb der Segmente liegen. Ein
   Dock als Geschwister von `.chunk-content` ist es ebenso. → Entscheidung
   10; der vorgeschlagene Code wäre eine Zeile gewesen, die nichts tut.
5. **`layout-too-narrow` konnte das Dock nicht sehen, und die Behauptung des
   Entwurfs war falsch herum.** `measureHere()` startet bei `WIDTH_EM[w]`
   und teilt durch offene `cols`/`cards`/`side`; ein Dock, das die
   `1fr`-Rinnen aufbraucht, ändert `--content-w` nicht, sondern nur das,
   was die Folie davon hergibt. „Leistenbreite vom Maß abziehen“ ist erst
   dann eine Rechnung, wenn der Linter die Folienbreite in em kennt – 68.4
   auf 16:9 – und dann stellt sich heraus, dass `wide` (52) und `full` (72)
   heute schon über dem liegen, was der Projektor gibt (49.2em). → die
   Formel mit `SLIDE_EM`, bewusst nur mit Dock aktiv.
6. **Der Divider kennt Teile, keine Chunks.** `lectureParts` liefert
   `{no, heading}` pro Spalte mit Überschrift; `renderAudienceChunk`
   bekommt `parts` und `now` (die Teilnummer) und weiß nichts von den
   Nachbar-Chunks. Die vorgeschlagene Markierung „per Überschriftentext
   oder `#id`-Link, Link gewinnt“ hätte einen zweiten Mechanismus (Text-
   Matching gegen `heading`, das die `|`-Unterzeile schon abgetrennt hat)
   neben einen ersten gestellt. Ids sind laut CLAUDE.md der Anker für
   Querverweise, und `hashchange → jumpTo` navigiert heute schon. →
   Entscheidung 7, plus `chunkNumbers` als die eine Zählung, weil
   `renderColumnsHtml` und `renderPrintDoc` heute je einen Zähler führen.
7. **Print der Overlays steht nach dem Body, nicht davor.** Der Entwurf
   wollte Seitendocks *vor* dem Text drucken „so wie Overlay-Karten heute
   nach ihm stehen“, also anders als das Vorbild, ohne Grund. Divider-
   Overlays drucken einmal unter dem Lede – das war im Entwurf richtig und
   ist die Regel für `.every`. → Entscheidung 9.
8. **`from N` mit vorreservierter Spur war die richtige Idee, aber die
   Begründung stand halb.** Der Entwurf begann mit „`0fr` animiert nicht
   sauber“ und kam dann zum Richtigen; der eigentliche Grund ist der
   Overlay-Satz „keeps its cell in both states, so the layout never shifts“
   und dass `visibility: hidden` die Box behält – bei einem Band heißt das,
   dass die `auto`-Zeile ihre Höhe von Beat 0 an hat. Übernommen, mit dem
   Panel-Nudge von 1.2em statt `translateX(-100%)`, damit die Bewegung die
   des Panels ist.
9. **`rail-count` und `rail-same-edge` beschrieben einen Vertrag, den nichts
   brauchte.** Zwei Docks an zwei Kanten hätten eine Eckenregel (wer läuft
   durch?), eine asymmetrische Padding-Lage (die das Band-Bluten bricht) und
   auf 16:9 mit `left` + `right` in `narrow` 36.4em für den Text. Der
   Entwurf fragte selbst „reicht das?“. → Entscheidung 2, ein Code
   `duplicate-dock` nach dem Muster `duplicate-backdrop`.
10. **Die Slot-Tabelle war tragfähig; eine Prüfung war zu ergänzen.** Die
    Kollisions-Assertion in `tails.mjs` prüft pro Tabelle, und `left`/`right`
    (edge) gegen `narrow`/`wide` (width) kollidieren nicht; `once`/`every`
    sind neu. Was fehlte: `.every` mit `from`, `---` in `.every`, `.every`
    auf einem Chunk, das Cover, die Marginalie und der tote Link – sechs
    Verweigerungen, die alle die Frage „was tut das Wort hier?“ mit „nichts“
    beantwortet hätten.
11. **Die Wortbudget-Aussage widersprach dem Linter.** „Die Wortbudgets
    zählen den Leisten-Body nicht mit“ – der Linter zählt Overlay-Zeilen in
    `chunkBody`, weil das Budget den Projektor misst. Ein eigenes Dock zählt
    wie ein Overlay; ein geerbtes steht unter der `#`-Überschrift und zählt
    von selbst nicht. → Entscheidung 11.
12. **Tail-Prüfungen im Renderer wären für ein geerbtes Dock unerreichbar
    gewesen.** `bad-overlay-height` sitzt in `renderOverlayLayer`, und das
    geht, weil jede View jedes Overlay rendert. Print rendert ein geerbtes
    Dock nicht. → Entscheidung 5; nebenbei fällt `readTail` für das Dock
    weg, weil der Parser den Tail liest.
13. **Der Name.** `#touch-rail` ist die Fingerleiste beider Live-Views und
    heißt in der Doku „touch rail“; „accent rail“ ist in der Decoration-
    Skill die Begründung, warum `editorial` gelöscht wurde, und
    `test/settings.mjs` behauptet ihre Abwesenheit; `edge` ist das Pfeil-
    Statement in `::: draw`. → Entscheidung 1. Die Datei heißt weiter
    `PLAN-rail.md`, weil der Pfad in der Sitzungsgeschichte steht.
14. **Drei Stellen im Runtime, nicht null.** „Kein neues Sync-Feld“ stimmte;
    aber `chunkBeats`, `countSegments` und `applyReveal` schreiben je einmal
    `.overlay-card[data-from]` aus, und ein Dock mit `from` braucht alle
    drei. → `FROM_SEL`, aus demselben Grund, aus dem `FOCUSABLE_SEL` eine
    Konstante ist.
15. **Der Aufwandsabschnitt** ist gestrichen; Zeitangaben stehen nicht in
    Plan-Dateien.

## Was die Umsetzung an der Spezifikation geändert hat

Gemessen am gebauten Fixture und an `lectures/decoration`, jeweils mit dem
Grund:

1. **`--dock-w: 13em` ist `--dock-em: 13` plus `@property --dock-px`.** Als
   em-Wert wurde die Breite dreimal aufgelöst – im Chunk-Padding gegen die
   Chunk-Schrift, in der Spalte gegen die gezoomte Dock-Schrift (616 px statt
   300 bei Zoom 2,2), im Versatz der Foliennummer gegen deren kleine Ziffern.
   Die Zahl steht am Chunk, `--dock-px` ist als `<length>` registriert und wird
   dort einmal zu Pixeln; Padding, Dockbreite, Foliennummer und Overlay-Layer
   lesen dieselben Pixel. Die Spur wächst also mit dem Zoom, wie die
   Dock-Schrift auch; Auto-Fit misst nach jedem Schritt neu und konvergiert.
2. **Das Band blutet per Längen-Margin, nicht per Breite.** `width:
   var(--slide-w)` über drei Spuren ließ die `fr`-Rinnen alles nehmen und die
   `minmax(0, …)`-Textspur auf null fallen – ein Wort pro Zeile.
   `margin-inline: calc(-0.14 * var(--slide-w))` ist eine Länge, kein
   Prozentwert, und lässt die Spuren in Ruhe.
3. **Die Kamera rahmt einen Dock-Chunk als Ganzes.** Sie zentriert sonst
   `.chunk-content`; mit einem Band steht der Inhalt absichtlich außermittig,
   und das Band lag unter der Unterkante.
4. **Einfahren ist ein `clip-path`-Wipe, kein `translate`.** Ein verstecktes
   rechtes Dock stand um seinen Versatz über dem Rahmen, `nowrapProbe`
   meldete bei jedem Zoom Überlauf, Auto-Fit fiel auf 0,6.
5. **`--dock-gap` ist 1,6em**, nicht 2; `DOCK_GAP_EM` in `lint.js` ebenso.
6. **Eine Direktive vor der ersten Überschrift wird verweigert.** Sie fiel
   bisher stumm weg; der Linter sagte `stray-directive`.
7. **`overlay-steps-early` gibt es nicht mehr** (Review-Befund des vorigen
   Commits); die Spec nennt es nicht, der Vollständigkeit halber hier.
8. **Test 17 prüft `--dock-em: 13`** unter `[data-dock-w=narrow]` statt
   `--dock-w: 13em`; Test 18 nimmt `cards 4` statt `cols 3` neben dem
   `wide`-Dock, weil drei Spalten bei 32,2em noch 10,7em bekommen und die
   Rechnung sie zu Recht durchlässt.
9. **Die Breiten 13/18/25 sind geblieben:** 13em fasst die siebenzeilige
   Liste des Fixtures bei Zoom 2,2 ohne Umbruch, 18em die zweizeilige
   Bemerkung, 25em einen kurzen Absatz.
