# `::: rail` – eine Leiste am Folienrand, die dem Text Platz abzieht

## Status

Vorschlag, noch nicht gebaut. Geschrieben nach dem Panel-Overlay
(`::: overlay {.panel}`), weil sich dort gezeigt hat, dass zwei Dinge
verwechselt werden, die im Quelltext ähnlich aussehen und im Layout das
Gegenteil sind.

## Was es ist, und was es nicht ist

**Ein Overlay liegt über der Folie.** Es nimmt dem Text nichts weg. Deshalb
funktioniert es nur über einem Bild, oder wenn es absichtlich über den Inhalt
fährt – eine Karte, die auf Beat 3 von rechts hereinschiebt und die Folie
kommentiert. Das ist gebaut und bleibt so.

**Eine Leiste ist Teil des Rahmens.** Sie steht an einer der vier Kanten,
bleedet bis zum Folienrand, und die Textspalte wird um sie schmaler oder
kürzer. Nichts überlagert nichts. Drei Verwendungen, die heute nicht
schreibbar sind:

1. **Mini-Inhaltsverzeichnis** links auf jeder Folie eines Kapitels, mit dem
   aktuellen Punkt hervorgehoben – die Leiste gehört dem Kapitel, nicht dem
   Chunk.
2. **Merksatz oder Definition** als Band unten, das auf jeder Folie eines
   Abschnitts stehen bleibt, während der Text darüber wechselt.
3. **Hinweis, der einfährt:** eine Leiste mit `from 2`, die von rechts kommt
   und den Text dabei sanft zusammenschiebt – die Kommentarspur, ohne den
   Text zu verdecken.

Das Vokabular ist das des Overlays, damit ein Autor nichts Zweites lernt. Der
Layout-Vertrag ist ein anderer, und deshalb ist es eine eigene Direktive und
kein weiteres Wort auf `::: overlay`: ein Wort, das entscheidet, ob der Text
umfließt oder überdeckt wird, wäre zu viel Gewicht für eine Klasse.

## Syntax

```md
::: rail {.left .glass .narrow} from 2
- Einführung
- **Fuzzing**
- Grammatiken
:::
```

Block mit Closer, wie `::: overlay`. Chunk-Ebene: kein Wrapper darf offen
sein, kein Aside; dieselben Refusals wie beim Overlay
(`overlay-in-layout` bekommt ein Geschwister `rail-in-layout`, oder beide
laufen unter einem Code `aside-at-chunk-level` – zu entscheiden, wenn der
Code steht). Der Body ist Prosa, Listen, ein Bild, ein `::: draw`; keine
weiteren Direktiven (`directive-in-rail`, gespiegelt in `lint.js`). Ein
`---` im Body ist ein Beat wie im Overlay.

### Slots

| slot   | Wörter (erstes ist Default)                   | Bedeutung                                              |
|--------|-----------------------------------------------|--------------------------------------------------------|
| place  | `left` `right` `top` `bottom`                 | die Kante; keine Ecken, kein `center`                  |
| ground | `paper` `ink` `accent` `clear` `glass`        | wie Overlay; `glass` nur sinnvoll über einem Backdrop  |
| width  | `narrow` `standard` `wide`                    | Breite einer Seitenleiste, Textmaß eines Bandes        |
| height | `snug` `third` `half`                         | Höhe eines Bandes; auf einer Seitenleiste verweigert   |

Keine `full`-Breite: eine Leiste, die die halbe Folie nimmt, ist `::: side`.
Die Zahlen sind kleiner als beim Overlay, weil die Leiste dem Text gehört
und nicht dem Bild: `narrow` 14em, `standard` 19em, `wide` 26em, gemessen im
eigenen em (0.92 der Folie, wie die Overlay-Karte). Die drei Werte sind zu
messen, nicht zu setzen – der Panel-Durchgang hat gezeigt, dass jede Zahl
hier eine Runde am echten Foto braucht.

`from N` wie beim Overlay: die Leiste kommt auf Beat N, schiebt sich von
ihrer Kante herein, und die Textspalte geht in derselben Transition auf die
schmalere Breite (`transition: grid-template-columns` ist nicht animierbar
– siehe Layout).

## Layout-Vertrag

Der Chunk ist heute ein Grid `1fr minmax(0, var(--content-w)) 1fr` mit dem
Inhalt in der Mitte und dem Folien-Padding außen. Eine Seitenleiste wird
eine vierte Spur **außerhalb des Paddings**:

```
.chunk[data-rail=left]  { grid-template-columns: var(--rail-w) 1fr minmax(0, var(--content-w)) 1fr; padding-left: 0; }
.chunk[data-rail=right] { grid-template-columns: 1fr minmax(0, var(--content-w)) 1fr var(--rail-w); padding-right: 0; }
.rail { grid-row: 1 / -1; grid-column: 1 (bzw. 4); padding: var(--slide-pad-y) var(--rail-pad); }
```

Die Leiste bleedet, weil das Padding auf ihrer Seite wegfällt und sie es
innen wieder anlegt – dieselbe Idee wie beim Panel, aber ohne den
Prozent-Fallstrick, weil hier keine absolute Positionierung nötig ist: die
Spur ist Teil des Grids und `--slide-pad-x` löst sich gegen den Chunk auf.
Der Inhalt bleibt in seiner `minmax`-Spur; ist die Folie schmaler als
Leiste plus `--content-w`, verliert der Inhalt zuerst (das `minmax(0, …)`),
was Auto-Fit sieht und mit einem kleineren Zoom beantwortet.

Ein Band (`top` / `bottom`) ist eine Zeile: `grid-template-rows: auto 1fr`
bzw. `1fr auto`, die Leiste über alle drei Spalten, `padding-top` bzw.
`padding-bottom` des Chunks entfällt, `height` als `min-height` in Prozent
der Folienhöhe wie beim Panel. Der Text ist im Band vertikal zentriert –
das war die erste Rückmeldung zum Panel und gilt hier genauso.

**Was der Vertrag verspricht:** Leiste und Text überlappen nie; das Textmaß
ist `--content-w` oder weniger, nie mehr; die Leiste ist so hoch wie die
Folie (Seite) bzw. so breit (Band). Backdrop liegt unter beidem, Overlays
über beidem – die Z-Leiter (Backdrop 0, Inhalt 1, Over-Bild 2, Overlays und
Foliennummer 3) bekommt die Leiste auf 1, neben dem Inhalt.

**`from N` und die Spur.** Grid-Spuren animieren nicht. Die Leiste ist von
Beat 0 an im Grid, aber `translateX(-100%)` und `visibility: hidden`, und
die Spur ist `0fr`… – auch das animiert nicht sauber. Ehrlicher: die Spur
steht von Anfang an, der Text ist von Anfang an schmal, und auf Beat N fährt
die Leiste in die leere Spur. Der Text springt nicht, die Leiste kommt. Das
ist die Regel, mit der auch Overlay-Karten ihre Zelle behalten („keeps its
cell in both states, so the layout never shifts"). Ein Autor, der den Text
springen sehen will, will etwas anderes als eine Leiste.

## Kapitelweit: die Leiste unter der `#`-Überschrift

Fall 1 und 2 oben brauchen eine Leiste auf jeder Folie eines Kapitels. Der
Trenner kann heute Backdrop, Figur, Karten, Overlay und Prosa tragen, alles
für seine eigene Folie. Eine Leiste dort bekommt ein Wort:

```md
# Fuzzing {#fuzz}

::: rail {.left .paper .every}
- Einführung
- **Fuzzing**
- Grammatiken
:::
```

`.every` (Slot `scope`: `once` | `every`) heißt: auf dem Trenner *und* auf
jedem Chunk der Spalte, bis zur nächsten `#`-Überschrift. Ohne das Wort ist
sie eine Leiste des Trenners allein. Ein Chunk mit eigener `::: rail` an
derselben Kante ersetzt die geerbte auf dieser Folie; an einer anderen Kante
kommt sie dazu (zwei Leisten pro Folie sind erlaubt, an zwei verschiedenen
Kanten; drei oder vier sind ein Rahmen und werden verweigert –
`rail-count`).

**Das Mini-TOC braucht einen Hinweis, welcher Punkt live ist.** Zwei Wege,
und der zweite ist der richtige:

- Der Autor schreibt es selbst (`**Fuzzing**` fett) und die Leiste ist
  statische Prosa. Funktioniert heute schon mit dem obigen Vertrag, sagt
  aber auf jeder Folie dasselbe.
- Die Leiste kennt die Chunks der Spalte: ein Listenpunkt, dessen Text mit
  der Überschrift eines Chunks beginnt oder dessen Link auf dessen `#id`
  zeigt, bekommt `data-state="done|now|next"` wie die `section-outline`
  – dieselbe Klassenlogik, derselbe Stylesheet-Block, nur pro Chunk statt
  pro Kapitel. Das ist der Teil der Umsetzung, der die Renderer wirklich
  berührt (`renderAudienceChunk` muss die Position im Kapitel kennen; sie
  hat sie schon, als `num` und `parts`).

Vererbung ist Parser-Sache: `col.rails` mit `scope: 'every'` werden beim
Rendern jedes Chunks der Spalte angehängt, nach den chunk-eigenen, mit der
Ersetzungsregel oben. Kein neues Sync-Feld: eine Leiste hat keinen Zustand
außer ihrem Beat, und der reitet auf `revealed[chunkId]`.

## Print

Print ist ein Dokument, und eine Leiste im Dokument ist ein Kasten. Regel:
eine Seitenleiste wird ein Kasten **vor** dem Chunk-Text (so wie Overlay-
Karten heute nach ihm stehen), ein Band `top` davor, ein Band `bottom`
danach; Grund-Klassen bleiben, wie bei Overlay-Karten. Eine geerbte Leiste
(`.every`) druckt **einmal**, beim Trenner, nicht auf jeder Seite – ein
Inhaltsverzeichnis dreißigmal gedruckt ist der Fehler, den `section:
outline` für Trenner bewusst vermeidet („printed once per part"). Der
Collapse-Modus des Drucks kennt keine Leisten; `print-notes` verhält sich
wie `print`.

## Collapse (`topic-bold`)

Der Body einer Leiste wird **nicht** gekürzt. Eine Leiste ist Struktur
(Liste, Merksatz), kein Fließtext, den eine erste-Satz-Regel zerteilen
sollte – dieselbe Ausnahme wie `.slide-explicit` und die Karten
(`splitSentencesIn` hat den `closest()`-Guard, `.rail` kommt in die Liste).
`::: slide` im Chunk-Body blendet die Leiste nicht aus: die Regel
`.reveal-segment:has(.slide-explicit)` greift im Segment, und die Leiste ist
außerhalb, wie die Overlay-Schicht. Die Wortbudgets des Linters zählen den
Leisten-Body nicht mit (er steht auf mehreren Folien; das Budget ist pro
Folie), aber `layout-too-narrow` rechnet die Leistenbreite vom Maß ab: `wide`
Chunk mit `.wide` Leiste und `::: cols 3` fällt dann unter 10em und wird
gewarnt.

## Refusals und Linter-Spiegel

Neu, jeweils in `parseLecture` bzw. `renderRail` und `lint.js`:

| Code                  | Bedingung                                                  |
|-----------------------|------------------------------------------------------------|
| `rail-in-layout`      | `::: rail` bei offenem Wrapper oder Aside                  |
| `directive-in-rail`   | jede Direktive außer `::: draw` im Leisten-Body            |
| `bad-rail-height`     | `third` / `half` auf einer Seitenleiste                    |
| `rail-count`          | mehr als zwei Leisten auf einer Folie, geerbte mitgezählt  |
| `rail-same-edge`      | zwei Leisten an einer Kante auf einer Folie (nicht Ersetzung) |
| `rail-scope`          | `.every` auf einem Chunk – Vererbung gibt es nur vom Trenner |

Plus die vorhandenen Tail-Codes (`unknown-class`, `same-slot`) über
`RAIL_SLOTS` in `tails.mjs`, damit `lint.js` die Tabelle importiert statt
sie zu spiegeln. `tails.mjs` prüft beim Laden, dass kein Wort in zwei Slots
einer Tabelle steht – `left`/`right` und `narrow`/`wide` sind in zwei
verschiedenen Slots, das geht.

## Tests

- `test/settings.mjs`: Klassen im Markup, jede Refusal als Paar Build/Lint,
  Print-Reihenfolge (Kasten vor bzw. nach dem Text), Vererbung (drei Chunks,
  Leiste auf allen, Ersetzung auf dem zweiten).
- Browser-Spec `test/rail.mjs`, eigenes Fixture-Deck, weil kein Korpus-Deck
  eine Leiste hat: Textspalte misst `--content-w` oder weniger und
  überlappt die Leiste nie (Rechtecke schneiden sich nicht); die Leiste
  reicht bis zur Folienkante (`left === 0`); ein `from 2` ändert die
  Textbreite zwischen Beat 0 und 2 nicht; Auto-Fit findet einen Zoom, bei
  dem nichts überläuft; `data-state="now"` wandert mit dem Chunk.
- `--check-fit` braucht keine Änderung, wenn die Leiste im Grid liegt: er
  misst den Chunk als Ganzes.

## Offene Entscheidungen

1. **Ein Code oder zwei** für „Aside auf Chunk-Ebene in einem Wrapper
   geöffnet" – heute `overlay-in-layout` und `aside-in-layout`, morgen ein
   drittes. Vorschlag: beim Bau von `rail` alle drei zu einem
   `block-in-layout` zusammenziehen, mit dem Wort im Text.
2. **Live-Markierung im Mini-TOC:** per Überschriftentext, per `#id`-Link,
   oder beides. Vorschlag: beides, Link gewinnt.
3. **Zwei Leisten an gegenüberliegenden Kanten** – erlaubt nach dem Vertrag,
   aber `left` + `right` lässt 72em minus zweimal Leiste; für `narrow`
   Chunks fast nichts. `layout-too-narrow` fängt es als Warnung; reicht das?
4. **Der Name.** `rail` ist kurz und im Code frei (`touch-rail` ist die
   Fingerleiste des Cockpits und heißt in der Doku so – prüfen, ob das
   verwirrt; Alternative `edge`).

## Aufwand, grob

Parser und Vererbung ein halber Tag, Renderer und CSS mit Messen am Foto ein
Tag, Print und Collapse ein halber Tag, Tests und Doku ein Tag. Die größte
Einzelstelle ist das Chunk-Grid: jede Regel, die heute `grid-column: 2`
annimmt (`.chunk-content`, Marginalia-Anker, Chevrons, Foliennummer), muss
mit einer vierten Spur gelesen werden. `grep -n 'grid-column' build.js` im
Audience-CSS ist die Liste.
