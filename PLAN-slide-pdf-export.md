# Plan: PDF-Foliensatz mit allen Beats

Dritte Fassung. Fassung 1 ist an Codex' erstem Review geprüft worden,
Fassung 2 an seinem zweiten (`REVIEW-slide-pdf-export.md`,
`REVIEW-slide-pdf-export-v2.md`) und beide am Code. Was bestätigt wurde,
was verworfen, und was billiger zu haben ist als vorgeschlagen, steht in
den beiden Änderungsabschnitten.

## Ziel

`psi-slides` erzeugt neben den vier HTML-Ansichten einen portablen
PDF-Foliensatz. Das PDF bildet die Audience-Ansicht ab: Jeder Chunk ist
mindestens eine Seite, und jeder weitere Präsentationszustand des Chunks
ist eine weitere Seite.

Der Export ist der Notnagel für Räume, in denen die HTML-Präsentation
nicht läuft, und ein weitergebbarer klassischer Foliensatz. Er ersetzt
`print.html` und `print-notes.html` nicht: Das sind Dokumente, das hier
sind Folien.

**Anspruch dieser Fassung:** Der Export muss für die **fünf Vorlesungen
dieses Repositories** laufen; das ist die Zusage, und Umsetzungsschritt
10 und Abnahmekriterium 1 nennen sie namentlich. Die vier Vorlesungen im
Inhalts-Repository sind eine Stichprobe von Hand, keine Abnahmebedingung
– sie liegen nicht hier und laufen nicht in CI. Er muss nicht jeden
denkbaren Sonderfall abdecken. Wo eine Vollständigkeit teuer wäre, steht
unten, was v1 stattdessen tut und warum das reicht.

## Was sich gegenüber Fassung 1 geändert hat

Bestätigt und übernommen:

- `applyReveal()` ist kein State-Setter, sondern liest `revealed[id]`
  (`build.js` 9902). Ein Zustand entsteht erst aus vier Schritten, und
  der Zoom gehört dazu. → Abschnitt „Zustandsdomäne“.
- `countSegments()` liefert für einen beatlosen Chunk `0`
  (`build.js` 9892). Ohne Sonderfall entstünde für ihn keine Seite.
- Ein Seitenverhältnis genügt nicht. Die Basisschrift ist
  `clamp(20px, calc(var(--slide-h) * 0.026), 38px)` (`build.js` 5980),
  und `--slide-w`/`--slide-h` werden als **Inline-Pixel** auf `<html>`
  geschrieben (`build.js` 9170–9176). 1280 × 720 und 1600 × 900 brechen
  verschieden um. → Abschnitt „Geometrie“.
- `page.pdf()` druckt im Medium `print` und ohne
  `printBackground`. Beides muss ausdrücklich gesetzt werden.
- `@scope (svg#psi-fig-N-root)` bindet die eingebetteten SVG-Styles an
  die Root-ID (`build.js` 318–340). Ein naives Umpräfixen der IDs
  zerstört sie.
- `playwright-core` steht unter `devDependencies`. Ein statischer Import
  in `build.js` bräche jeden HTML-Build ohne Dev-Dependencies.
- Ein Link auf eine Spalten-ID zeigt nicht auf einen Chunk. Die
  generierte Divider-Folie heißt `${col.id}-section`
  (`build.js` 5416).

Verworfen oder billiger gelöst:

- **„Die Chrome-Suche darf für diesen Pfad nicht headful starten.“** Das
  Finding geht ins Leere: `findChrome()` liefert einen Pfad, keinen
  Modus, und `chromium.launch()` ist ohnehin headless – `test/harness.mjs`
  setzt es zusätzlich explizit. Der Export setzt `headless: true`
  ebenfalls explizit, und damit ist das Thema erledigt.
- **Den ID-Rewriter auf CSS-Selektoren, `@scope`, `for`, `headers`,
  `aria-controls` und SMIL ausweiten.** Das ist die teure Antwort auf
  eine Frage, die sich billiger auflöst: Der Export präfixt gar nichts.
  → Abschnitt „IDs: nicht präfixen“.
- **Silbentrennung zur Build-Zeit als U+00AD.** Der Befund stimmt, aber
  er gehört nicht hierher: `hyphens: auto` steht in `AUDIENCE_CSS` und
  betrifft alle vier Ausgaben. Eine Änderung daran ist eine Änderung am
  Aussehen jeder Vorlesung und ein eigenes Vorhaben. → „Nicht in v1“.
- **Fonts zur Build-Zeit instanzieren, damit alles `CID TrueType` wird.**
  Braucht einen Subsetter (harfbuzz-wasm oder fontTools) als neue
  Abhängigkeit und wirkt auf alle vier Ausgaben. v1 nimmt Type 3 in Kauf
  und formuliert das Abnahmekriterium ehrlich. → „Schrift“.
- **Ein Loopback-Server für den Export.** `audience.html` ist
  self-contained; der Export lädt sie über `file://`. Der einzige Grund
  für einen Server wären Drittanbieter-Embeds, und die werden im PDF
  ohnehin durch eine Karte ersetzt.

Neu, weil beim Prüfen aufgefallen:

- Eine PDF-Seite kann nicht schwenken. `focusCamera` hat für Chunks, die
  höher sind als der Rahmen, einen „laufenden“ Zweig (`build.js` 9998ff),
  den ein Blatt Papier nicht nachbilden kann. Deshalb ist **Auto-Fit der
  Standard des Exports**, nicht die Zoom-Einstellung der Vorlesung.
- Das Druck-DOM muss `--slide-w`/`--slide-h` gegen einen späten
  Inline-Write der Runtime verteidigen. Ein Autoren-Stylesheet mit
  `!important` schlägt einen Inline-Style ohne `!important`; das ist der
  ganze Trick.
- `findChrome()` existiert bereits zweimal (`docs/site/shoot-lib.mjs` 25,
  `test/harness.mjs` 53). Eine dritte Kopie wäre die eine zu viel.

## Was sich gegenüber Fassung 2 geändert hat

Der zweite Review hat drei blockierende Punkte gefunden. Alle drei sind
am Code nachgeprüft, einer davon gemessen, und alle drei stimmen.

- **`html, body { height: 100%; overflow: hidden }` aus `AUDIENCE_CSS`
  (`build.js` 5983–5986) hätte das PDF auf eine Seite reduziert.** Das
  ist kein Verdacht: Vier seitengroße `div`s, Chromium 1228, einmal mit
  und einmal ohne die Regel, ergeben `/Count 1` gegen `/Count 4`. Das
  Export-Stylesheet setzt beides zurück. → „Das Druck-DOM“.
- **Der Zustandslauf hätte Drittanbieter kontaktiert.** `jumpTo()` ruft
  `applyState()` ruft `updateEmbedLoading()`, und das setzt `iframe.src`
  für den aktiven Chunk; `wireEmbeds()` fängt unter `file://` nur
  YouTube ab. Ein Vimeo-Embed lädt also, und eines auf der ersten Folie
  schon während `page.goto()`. Der Export blockt HTTP(S) per
  `page.route()` **vor** dem `goto`. → „Chromium-Aufruf“.
- **Abnahmekriterium 9 war unerfüllbar.** `npm test` kann ohne
  `playwright-core` schon heute nicht starten, weil `test/harness.mjs`
  es statisch importiert (Zeile 42). Das Kriterium sagt jetzt, was es
  meinen kann: `build.js` und `lint.js`.

Dazu drei kleinere, ebenfalls bestätigt:

- **`--pdf-fit=lecture` ist ersatzlos gestrichen.** Der Review sagt, der
  Schalter sei mehrdeutig; er ist schlimmer, nämlich undefiniert – siehe
  CLI-Vertrag. Ein Schalter mit undefiniertem Wert wird nicht
  definiert, er wird entfernt.
- **Die neue Spec braucht zwei Anschlüsse**, die Fassung 2 nicht genannt
  hat: einen Eintrag in `SPECS` und ein `buildSource()` im Harness.
  → „Tests“.
- **`lectures/python-intro` fehlte in der Matrix.** Fünf Vorlesungen,
  nicht vier; und der Anspruch auf das Inhalts-Repository ist zu einer
  Stichprobe zurückgenommen.

Ein Nebenbefund aus derselben Messung, der den Testplan verbessert:
Chromium schreibt PDF 1.4 ohne Objektströme, `/Count` und `/MediaBox`
stehen im Klartext. Die Seitenzahlprüfung der erzeugten Datei – die der
Review zu Recht als obligatorisch verlangt – braucht deshalb kein
Poppler und ist eine Zeile.

## Festgelegtes Verhalten

- Der Ausgangszustand jedes Chunks wird exportiert.
- Danach wird jeder Beat als eigene, kumulative Seite exportiert.
- Text-Reveals, `::: draw`-Schritte, Backdrop-Frames und `from`-Overlays
  verwenden dieselbe Reihenfolge und Zustandslogik wie die
  Audience-Ansicht, weil sie dieselben Funktionen ausführen.
- Generierte Abschnittsfolien sowie Titel- und Schlussfolie gehören dazu.
- Keine Animationen, keine Tweens: jeder Zustand wird fertig gerendert.
- `autoplay cycle` läuft genau einmal vom Ausgangszustand bis zum letzten
  Beat. Keine Wiederholungen.
- Marginalia bleiben, weil sie Folieninhalt sind.
- Alle Beat-Seiten eines Chunks tragen dieselbe sichtbare Foliennummer.

Nicht im PDF:

- Expansion-Chevrons und Expansion-Inhalte
- `+ note`, Annotationsboxen, gespeicherte Annotationen
- Hilfe, Navigation, Suche, TOC-Overlay, Editor-Chrome, Mode-Badge
- Figure-Focus-Overlay und sein Zoomzustand
- QR-Buttons und das Link-Overlay
- Sprecheransicht und Speaker Notes

## CLI-Vertrag

```console
node build.js lectures/foo/source.md --slides-pdf
```

schreibt `lectures/foo/slides.pdf`.

```console
--slides-pdf                 # baut audience.html und exportiert
--pdf-beats=all|final        # Standard: all
--pdf-size=16:9|16:10        # Standard: 16:9
--pdf-out=<pfad>             # Standard: slides.pdf neben source.md
```

- `--pdf-beats=final` gibt nur den vollständig aufgebauten Zustand jedes
  Chunks aus – eine Seite pro Chunk. Der Fallback-Foliensatz ist `all`.
- **Kein `--pdf-fit`.** Auto-Fit ist der einzige Modus. Fassung 2 hatte
  hier ein `lecture` stehen, das auf eine Einstellung zeigte, die es
  nicht gibt: `VIEW_DEFAULT_SPEC` kennt keinen Zoom, der Runtime-Default
  ist fest `1.35` (`build.js` 9221), und `collapsedZoom` wird bei
  Modulstart einmal daraus abgeleitet (`build.js` 10741). Schlimmer
  noch: Bei einer Vorlesung mit `auto-fit: true` hat der Boot `state.zoom`
  schon auf irgendeine Folie eingestellt, und ein `settle()` holt ihn
  nicht zurück, weil `clampZoomToWidth()` bei `collapse: none` sofort
  zurückkehrt (`build.js` 10931–10933) – eine Kombination, die mehrere
  der vorhandenen Vorlesungen verwenden. Der Schalter hätte also einen
  vom Bootzustand abhängigen Zufallswert bedeutet. Ein fester Zoom ist
  als `--pdf-zoom=<n>` später ehrlich zu haben: eine Zahl, keine Fiktion
  über eine Vorlesungseinstellung.
- Theme, Schrift und die übrigen Darstellungsoptionen kommen aus der
  Frontmatter beziehungsweise `VIEW_DEFAULTS`. Der Export liest kein
  `localStorage` – ein frischer Browser-Kontext hat ohnehin keins, und
  der Export setzt den Zustand zusätzlich explizit.
- `--slides-pdf` baut `audience.html` immer neu, damit nie ein altes
  HTML exportiert wird.
- Kombinationen: `--slides-pdf` schließt `--watch` aus (Fehler mit
  Erklärung). Mit `--serve` ist es zulässig, aber der Export läuft vor
  dem Server. Die `--*-only`-Flags werden ignoriert; `--slides-pdf`
  impliziert den Audience-Build.
- `slides.pdf` wird atomar geschrieben: erst `slides.pdf.tmp`, dann
  `rename`. Ein Abbruch lässt kein halbes PDF stehen.

## Geometrie

Das Zahlenpaar ist der eigentliche Vertrag, nicht das Seitenverhältnis.

| `--pdf-size` | Viewport und Seite (CSS-px) | Seite physisch |
|---|---|---|
| `16:9`  | 1600 × 900  | 1200 × 675 pt |
| `16:10` | 1600 × 1000 | 1200 × 750 pt |

Warum 1600 × 900 und nicht 1280 × 720:

- Die Basisschrift ist `clamp(20px, --slide-h * 0.026, 38px)`. Bei
  720 px Höhe greift die untere Klammer (18,7 px → 20 px), die Schrift
  ist relativ zur Folie also **größer** als auf jeder Projektion ab
  769 px Höhe. Bei 900 px liegt sie mit 23,4 px im linearen Bereich, und
  die Folie hat dieselben Proportionen wie bei 1080 px oder 1200 px.
  Das PDF sieht damit aus wie der Hörsaal, nicht wie ein kleines Fenster.
- Eine Zahl bedient Viewport und Papier zugleich. `page.pdf()` layoutet
  in Papierbreite × 96 dpi; wenn Papier und Viewport identisch sind,
  entfällt jede `scale`-Arithmetik und mit ihr die Rundungsfehler, aus
  denen leere Zusatzseiten entstehen.
- Die physische Seitengröße ist für den Zweck gleichgültig – ein PDF-
  Betrachter skaliert auf Fenster, ein Drucker auf Blatt. 1200 × 675 pt
  ist ungewöhnlich, aber legal und nicht schlechter als Beamers
  128 × 96 mm.

Die Runtime schreibt `--slide-w`/`--slide-h` inline auf `<html>`. Das
Export-Stylesheet pinnt sie:

```css
:root[data-psi-pdf] { --slide-w: 1600px !important; --slide-h: 900px !important; }
```

`!important` in einem Autoren-Stylesheet schlägt einen Inline-Style ohne
`!important`. Damit kann ein später ausgelöster `resize`-Handler die
Geometrie nicht mehr verstellen, und niemand muss Listener abmelden.

## Architektur

### 1. Ein Hook in der Runtime, die Politik im Exporter

Die Reihenfolge der Beats hat genau eine Definition, und die steht in
`AUDIENCE_JS`. Der Export implementiert sie nicht nach, er ruft sie auf.

`AUDIENCE_JS` bekommt dafür einen kleinen, benannten Hook – Mechanismus,
keine Politik:

```js
window.psiExport = {
  chunks: () => flatChunks,
  countSegments,
  jumpTo,
  setRevealed: (id, n) => { revealed[id] = n; },
  applyReveal,
  settle: () => { if (state.autoFit) fitZoomToChunk(2.2); else clampZoomToWidth(); },
  setAutoFit: (on) => { state.autoFit = on; },   // der Export setzt true
  quiesce: () => { autoplayStopped = true; stopAutoplay(); },
  zoom: () => state.zoom,
};
```

Das sind zehn Zeilen in einer Datei, die ohnehin ausgeliefert wird, und
sie ändern kein Verhalten. Der Alternativweg – die Runtime-Internals aus
`page.evaluate()` heraus anzusprechen, was technisch ginge, weil
`AUDIENCE_JS` ein klassisches `<script>` ist und seine `const`s im
globalen lexikalischen Scope liegen – spart die zehn Zeilen und kauft
dafür einen Vertrag, den kein Leser von `build.js` sieht und den ein
Rename lautlos bricht. Der Hook ist die ehrlichere Variante.

Alles Weitere – welche Zustände, was aus dem Klon fliegt, wie das
Druck-DOM aussieht – lebt in `pdf-export.mjs` und wird in die Seite
injiziert. Kein Byte davon steht in `audience.html`.

**`pdf-export.mjs` ist die zweite dokumentierte Ausnahme vom
Ein-Datei-Build**, und der Grund ist ein anderer als bei
`diagram-core.mjs`: Das Modul importiert `playwright-core`, und
`build.js` darf das nicht statisch tun (siehe Abnahmekriterium 9).
`build.js` lädt es per `await import()` erst, wenn `--slides-pdf`
tatsächlich fällt. Das gehört in den Architektur-Abschnitt von
`CLAUDE.md`.

### 2. Zustandsdomäne

Für jeden Chunk:

```js
const n = psiExport.countSegments(el);   // 0 für einen beatlosen Chunk
const positions = n === 0 ? [0] : [1, 2, /* … */, n];
// --pdf-beats=final: n === 0 ? [0] : [n]
```

Seiten pro Chunk also `Math.max(1, n)` beziehungsweise `1`.

Ein Zustand wird so materialisiert – vier Schritte, weil `applyReveal`
allein keiner ist:

```js
psiExport.jumpTo(idx);                    // Chunk aktiv, Chrome zu, Autoplay neu
psiExport.setRevealed(id, pos);
psiExport.applyReveal(el, id, true);      // instant: kein Tween
psiExport.settle();                       // Zoom neu lösen
psiExport.quiesce();                      // Autoplay wieder aus
await twoFrames();                        // zwei rAF-Runden
await imagesDecoded(el);
```

`jumpTo` ist dabei nicht Bequemlichkeit, sondern der Grund, warum der
Klon richtig aussieht: Es setzt `.active` (ohne das wäre der Chunk in der
Audience-CSS abgedunkelt), schließt Expansions, verwirft ein
Figure-Focus-Overlay und setzt den Pan zurück.

`settle()` ist der Punkt, den Fassung 1 übersprungen hat: Ein Reveal
ändert die Höhe des Chunks und damit in Auto-Fit den nötigen Zoom
(`resettleAfterReveal`, `build.js` 10412). Ohne den Schritt käme Beat 3
in einer anderen Schriftgröße heraus als im Hörsaal.

### 3. Auto-Fit ist der Export-Modus

Der Export setzt `state.autoFit = true`, unbedingt und unabhängig von der
Frontmatter.

Begründung: In der Audience-Ansicht wird ein Chunk, der höher ist als
der Rahmen, *gelaufen* – die Kamera pinnt den Kopf und folgt beim
Aufdecken dem Fuß nach unten. Eine PDF-Seite kann das nicht. Auto-Fit ist
genau der Mechanismus, der einen Chunk in den Rahmen zwingt, und er ist
bereits gebaut, geprüft und über die Frontmatter erreichbar. Ihn im
Export einzuschalten ist die ehrliche Übersetzung von „schwenken“ nach
„Papier“, nicht ein zweiter Layoutmodus.

Auto-Fit hört bei Zoom 0,6 auf. Reicht das nicht, meldet der Export

```text
slides.pdf: #loop beat 3 passt bei Zoom 0.60 nicht auf die Seite
            (1840px Inhalt, 846px verfügbar). Kürzen oder aufteilen.
```

und exportiert die Seite trotzdem – abgeschnitten, aber sichtbar
abgeschnitten. Ein Abbruch wäre hier schlechter: Der Autor will das PDF
sehen, um zu entscheiden, was er kürzt.

### 4. Das Druck-DOM

Nach jedem gesetzten Zustand wird der Chunk geklont
(`el.cloneNode(true)`). Das genügt, weil `dgApplyGeom`/`dgApplyVec` die
Diagrammgeometrie als Attribute und Inline-Styles schreiben, nicht über
die Web Animations API – der Klon trägt den Beat schon in sich.

Aus dem Klon fliegen:

- `.exps`, `.exp-chev`, `.exp-body`, `.chunk-expansion`
- `.annot-box`, `.annot-add`
- `.link-code` (der QR-Knopf)
- `script`, insbesondere die `application/json`-Payload im SVG
- `[data-fig-edit]` und alles Editor-Chrome

Danach werden alle Klone in ein lineares Druck-DOM gesetzt, jeder in
einen Seiten-Wrapper:

```html
<div class="pdf-page" style="--zoom: 1.15" id="p12">
  <div class="pdf-slide"> <!-- Klon --> </div>
</div>
```

`--zoom` steht auf dem Wrapper, nicht auf `<html>`: Die Runtime hält den
Zoom global, die Seiten brauchen ihn einzeln. Alle 57 Verwendungen von
`var(--zoom)` in `AUDIENCE_CSS` lesen ihn geerbt, also greift das.

Das Export-Stylesheet legt fest:

```css
/* Ohne diese zwei Zeilen bleibt es bei einer Seite – gemessen, siehe
   unten. AUDIENCE_CSS setzt html,body auf height:100% und
   overflow:hidden (build.js 5983–5986), was für ein Fenster richtig ist
   und für ein paginiertes Dokument tödlich. */
html[data-psi-pdf], html[data-psi-pdf] body {
  height: auto !important; overflow: visible !important;
}
:root[data-psi-pdf] {
  --slide-w: 1600px !important; --slide-h: 900px !important;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
[data-psi-pdf] .pdf-page {
  width: var(--slide-w); height: var(--slide-h);
  overflow: hidden;
  display: flex; align-items: center; justify-content: center;
  background: var(--paper);
  break-after: page; break-inside: avoid;
}
[data-psi-pdf] .pdf-page:last-child { break-after: auto; }
[data-psi-pdf] .chunk { opacity: 1 !important; }
[data-psi-pdf] *, [data-psi-pdf] *::before, [data-psi-pdf] *::after {
  transition: none !important; animation: none !important;
}
```

`align-items: center` bildet die Kamera nach: Sie zentriert den Chunk im
Viewport, solange er hineinpasst – und in Auto-Fit passt er.
`:last-child { break-after: auto }` ist der Unterschied zwischen der
richtigen Seitenzahl und einer leeren Seite am Ende.

**Gemessen**, vier seitengroße `div`s, Chromium 1228, `--print-to-pdf`,
eine CSS-Zeile Unterschied:

```text
html,body{height:100%;  overflow:hidden}   →  /Count 1    8357 Bytes
html,body{height:auto;  overflow:visible}  →  /Count 4   12281 Bytes
```

Das ist der Fehler, der die ganze Ausgabe still auf eine Seite reduziert
hätte, und er erklärt nebenbei die Messung aus Fassung 1: Dass
`audience.html` genau eine Seite ergab, lag nicht nur an den verborgenen
Chunks. Zwei Ursachen, eine diagnostiziert.

Aus derselben Messung folgt ein zweiter, nützlicher Befund: Chromium
schreibt PDF 1.4 **ohne Objektströme**. `/Count` und `/MediaBox` stehen
im Klartext in der Datei, sind also mit `grep` prüfbar. Die
Seitenzahlprüfung braucht kein Poppler (siehe Tests).

Der ganze Satz wird in **einem** `page.pdf()`-Aufruf gedruckt. Einzelne
Seiten-PDFs zusammenzuführen bräuchte einen PDF-Merger, den das Projekt
nicht hat und für den es keine Abhängigkeit aufnehmen will.

Der Tausch geschieht erst am Ende: erst alle Zustände einsammeln, dann
`document.body` durch das Druck-DOM ersetzen und `data-psi-pdf` auf
`<html>` setzen. Die Attribute von `<body>` bleiben stehen, denn dort
hängen `data-collapse`, `data-mode` und `data-view`, und daran hängt das
halbe Aussehen.

### 5. IDs: nicht präfixen, und warum

Fassung 1 wollte pro Seite präfixen. Der Review hat zu Recht gezeigt,
dass das unvollständig war – `@scope (svg#psi-fig-N-root)` hätte
weitergezeigt. Die richtige Folgerung ist aber nicht ein größerer
Rewriter, sondern gar keiner.

Ein Fragment im Druck-DOM wird von genau drei Dingen aufgelöst:
`url(#…)`, `href="#…"` und CSS-Selektoren. Alle drei nehmen bei
Mehrdeutigkeit den ersten Treffer im Dokument. Und alle Duplikate im
Druck-DOM sind **byteidentische Kopien derselben Definition**, weil sie
aus Klonen desselben Chunks stammen: derselbe Gradient, derselbe Marker,
dasselbe `clipPath`. Der erste Treffer ist also der richtige.

`@scope` ist sogar besser als „harmlos“: Der Selektor matcht **jede**
Instanz, also gelten die eingebetteten Styles in allen Klonen.

Es bleibt eine echte Gefahr, und nur eine: Zwei Klone desselben
`::: draw` stehen auf verschiedenen Beats. Wenn irgendetwas darin
*Geometrie* per ID referenzierte – ein `<use href="#node">` –, zöge Klon 2
die Geometrie von Klon 1. Der Compiler emittiert keine `<use>`-Elemente;
per Beat ändern sich Attribute auf gezeichneten Elementen, während die
`defs` statisch sind. Das ist die Annahme, und ein Test hält sie fest
(siehe Tests, „Diagramme“). Bricht sie, ist immer noch Zeit für einen
Rewriter – dann aber für einen, der weiß, wonach er sucht.

Der Präzedenzfall steht im Code: `dgRenderInto` (`build.js` 2609)
existiert genau deshalb, weil Klone doppelte IDs tragen, und löst das
durch wurzelgebundene Suche statt durch Umbenennen. Ein statisches PDF
sucht überhaupt nicht.

### 6. Links

Externe Links bleiben `<a href>`; Chromium macht daraus klickbare
PDF-Annotationen. Der QR-Knopf daneben fällt weg, das Link-Overlay wird
nicht als Seite exportiert, die Adresse wird nicht zusätzlich
ausgeschrieben. Ein bereits als Text sichtbarer Fallback – etwa unter
einem Embed – bleibt sichtbar.

Interne Fragmentlinks werden umgeschrieben. Der Exporter baut dafür eine
Tabelle mit zwei Quellen:

1. **Chunk-ID → Wrapper-ID der ersten exportierten Seite dieses Chunks.**
2. **Spalten-ID → dieselbe Abbildung für `${colId}-section`**, die
   generierte Divider-Folie; hat die Spalte keine, dann auf ihren ersten
   Chunk.

Die zweite Abbildung ist nötig, weil eine Spalten-ID im Audience-DOM auf
`<section class="column">` sitzt und die Divider-Folie
`${col.id}-section` heißt (`build.js` 5416). Der Runtime-Resolver
`chunkIdxFromHash` kennt nur `flatChunks`, kann das also heute selbst
nicht – der Export übernimmt ihn deshalb nicht, er baut seine eigene
Tabelle aus denselben Daten.

Ein Fragment, das in keiner der beiden Tabellen steht, wird gemeldet
(eine Zeile pro Ziel, mit Chunk-ID des Links) und der Link zu einem
`<span>` degradiert. Ein Link, der im PDF nirgendwohin führt, ist
schlechter als kein Link.

### 7. Chromium-Aufruf

`findChrome()` wandert nach `chrome-path.mjs` im Wurzelverzeichnis;
`docs/site/shoot-lib.mjs` und `test/harness.mjs` importieren es von dort.
Es steht dort heute zweimal – eine dritte Kopie wäre die, an der die
Suche das erste Mal auseinanderläuft.

```js
const browser = await chromium.launch({ executablePath: findChrome(), headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
const page = await ctx.newPage();
// Offline ist eine Zusage, also wird sie durchgesetzt und nicht erbeten.
// Vor dem goto, weil ein Embed auf der ersten Folie schon dort lädt.
const blocked = new Set();
await page.route(/^https?:/, (route) => {
  blocked.add(new URL(route.request().url()).origin);
  return route.abort();
});
await page.goto(pathToFileURL(audienceHtml).href, { waitUntil: 'load' });
await page.waitForFunction(() => window.psiExport && document.fonts.status === 'loaded');
// … Zustände einsammeln, Druck-DOM bauen …
await page.emulateMedia({ media: 'screen' });
const buf = await page.pdf({
  width: '1600px', height: '900px',
  margin: { top: 0, right: 0, bottom: 0, left: 0 },
  printBackground: true,
  preferCSSPageSize: false,
  pageRanges: '',
});
```

- `emulateMedia({ media: 'screen' })`, weil `AUDIENCE_CSS` unter
  `@media print` Regeln hat, die für ein Dokument gedacht sind, nicht für
  Folien.
- `width`/`height` in `px` statt `preferCSSPageSize`: Playwright rechnet
  bei 96 dpi um, das Layout ist damit exakt der Viewport, und es gibt
  keine `@page`-Regel, die man pflegen müsste.
- `file://` statt Loopback-Server. `audience.html` ist self-contained;
  auch bei `--no-inline-images` lädt Chromium relative Bildpfade von
  `file://`. Was ein Server zusätzlich könnte – Drittanbieter-Embeds
  laden –, will der Export ausdrücklich nicht.
- **`page.route()` vor dem `goto`, und das ist nicht Gürtel-und-Hosenträger.**
  Der Zustandslauf beginnt mit `jumpTo()`, das über `applyState()` →
  `updateEmbedLoading()` (`build.js` 11134–11157) für den aktiven Chunk
  `iframe.src` aus `data-src` setzt. `wireEmbeds()` fängt unter `file://`
  nur YouTube ab (`build.js` 11107–11111) – ein Vimeo- oder generisches
  Embed lädt also wirklich, und eines auf der ersten Folie sogar schon
  während `page.goto()`. Die Frames erst nach dem Klonen zu ersetzen ist
  zu spät. Routing ist die richtige Ebene dafür: Es ist eine Zeile, es
  wirkt vor jedem Runtime-Zustand, und es macht die Offline-Zusage
  prüfbar, statt sie der Kooperation der Runtime zu überlassen. Ein
  Runtime-Exportmodus würde dasselbe versprechen und nur für die Fälle
  gelten, an die jemand gedacht hat.
- Was geblockt wurde, wird am Ende gemeldet – ein Origin pro Zeile. Für
  ein Embed ist das erwartet und die Karte steht ohnehin bereit; für ein
  entferntes Bild ist es die Erklärung des leeren Feldes, und die
  Abhilfe heißt inlinierte Bilder, also der Standard des Werkzeugs.
- Browser, Kontext und temporäre Dateien werden in `finally` geschlossen.
- Der Export loggt eine Zeile mit `browser.version()` und dem
  Executable-Pfad. Das ist die halbe Reproduzierbarkeitszusage (siehe
  unten) und kostet nichts.

## Medien

### Videos

Ein PDF spielt nichts ab. Der Export ersetzt jedes `<video>` durch ein
Standbild, in dieser Reihenfolge:

1. Das Bild bei `currentTime = 0`, per `<canvas>` abgegriffen. Frame 0
   ist deterministisch – der Einwand aus Fassung 1 galt dem *laufenden*
   Frame, nicht diesem.
2. Scheitert das binnen 3 s (Codec, entferntes Video, keine
   Cross-Origin-Freigabe): eine ruhige Platzhalterfläche mit dem Titel
   des `<figure>` beziehungsweise dem Dateinamen und einem
   Wiedergabe-Zeichen.

Ein `poster:`-Attribut in der Markdown-Grammatik wird **nicht**
eingeführt. Der Review hat richtig gesehen, dass es keins gibt; die
Antwort darauf ist Frame 0, nicht neue Syntax. Wenn sich später zeigt,
dass Autoren ein anderes Bild wollen, ist das eine eigene Entscheidung
über die Grammatik und keine Nebenwirkung des PDF-Exports.

### Externe Embeds

Kein Iframe im PDF. Der Export ersetzt `.embed-frame` durch eine eigene
Karte: Provider und Titel, darunter die sichtbare Adresse, die die
Vorlesung ohnehin schon ausgibt. Nicht die `wireEmbeds`-Karte
wiederverwenden – deren Text („serviere die Vorlesung über http“) ist
für ein PDF falsch.

### Externe Bilder

Der Export empfiehlt inlinierte Bilder und läuft auch ohne. Ein Bild, das
nicht lädt, wird gemeldet (`img` mit `naturalWidth === 0`, gezählt nach
dem Laden), mit Chunk-ID und `src`. Ein still leeres Feld ist kein
gelungener Export.

## Schrift und Reproduzierbarkeit

Was v1 zusagt und was nicht – das ist die Stelle, an der Fassung 1 mehr
versprochen hat, als sie halten konnte.

**Type 3 wird akzeptiert.** Alle gebündelten Familien sind
`@fontsource-variable/*`, und Chromiums PDF-Backend kann eine variable
Instanz nicht als TrueType einbetten; es schreibt jeden Glyphen als
eigenen Content-Stream, pro benutztem Gewicht eine eigene Type-3-Familie.
Die Gegenmaßnahme wäre eine Instanzierung zur Build-Zeit und damit ein
Subsetter als neue Abhängigkeit, der auf alle vier Ausgaben wirkt.

Was Type 3 tatsächlich kostet, ist Hinting und ein gemeinsames Subset –
nicht die Textnatur: Der gemessene Probeexport von `print.html` gibt
unter `pdftotext` sauberen Fließtext, bei 46 dichten A4-Seiten zu 1,4 MB.
Für einen Foliensatz mit wenig Text pro Seite ist das unkritisch. Das
Abnahmekriterium wird deshalb auf das formuliert, worum es geht: **Text,
Code und `::: draw` bleiben Vektoren, sind auswählbar, durchsuchbar und
von `pdftotext` extrahierbar; keine Seite ist ein Rasterbild.** Die
Instanzierung steht als benannte Folgearbeit unter „Nicht in v1“.

**Reproduzierbarkeit gilt für dieselbe Umgebung.** Der Review hat recht:
`findChrome()` nimmt den neuesten Cache-Build oder ein System-Chrome,
Blink und Skia sind damit nicht festgenagelt, und
Chromiums Trennwörterbücher kommen über den Component-Updater. Der Plan
wählt darum ausdrücklich die zweite der beiden angebotenen Optionen:

> Derselbe Rechner mit derselben Browser-Version erzeugt dasselbe PDF.
> Zwei verschiedene Rechner können sich in Silbentrennung und in
> Fallback-Glyphen unterscheiden.

Der Export gibt Browser-Version und Pfad ins Build-Log, damit ein
Unterschied nachvollziehbar bleibt. Das ist eine kleinere Zusage als
„reproduzierbar“, und es ist die, die das Werkzeug halten kann.

## Nicht in v1

Benannt, damit später niemand rätselt, ob es vergessen wurde:

- **Font-Instanzierung zur Build-Zeit** (Type 3 → CID TrueType). Braucht
  harfbuzz-wasm oder fontTools; wirkt auf alle vier Ausgaben.
- **Silbentrennung als U+00AD zur Build-Zeit.** Richtig gesehen, falscher
  Ort: `hyphens: auto` steht in `AUDIENCE_CSS` und betrifft jede Ansicht.
  Eigenes Vorhaben.
- **Speaker Notes im PDF.** Dafür gibt es `print-notes.html`.
- **Ein zweiter Layoutmodus für überlange Folien.** Auto-Fit oder eine
  Meldung, nichts dazwischen.
- **`poster:`-Syntax für Videos.** Frame 0 reicht.
- **Ausschreiben der Link-Ziele als Text.** Später als `--pdf-urls`.
- **Ein fester Zoom statt Auto-Fit.** Später als `--pdf-zoom=<n>`, eine
  Zahl auf der Kommandozeile. Nicht als Verweis auf eine
  Vorlesungseinstellung – die gibt es nicht (siehe CLI-Vertrag).
- **PDF-Lesezeichen / Outline pro Spalte.** Nett, aber `page.pdf()`
  erzeugt sie nicht von selbst, und ein PDF-Writer ist keine
  Abhängigkeit, die dieses Feature rechtfertigt.

## Umsetzungsschritte

1. `findChrome()` nach `chrome-path.mjs` heben;
   `docs/site/shoot-lib.mjs` und `test/harness.mjs` von dort importieren.
   Nichts sonst ändern – ein reiner Umzug, eigener Commit.
2. `playwright-core` von `devDependencies` nach `optionalDependencies`.
   `pdf-export.mjs` importiert es; `build.js` lädt `pdf-export.mjs` per
   `await import()` nur bei `--slides-pdf` und meldet bei Fehlen
   `npm install playwright-core` mit dem Grund. `err.userFacing = true`.
3. Den `psiExport`-Hook in `AUDIENCE_JS` ergänzen. Kein Verhalten ändern.
   Gate `inlined` beachten: kein rohes Backtick, doppelte Backslashes.
4. CLI-Vertrag in `build.js`: Flags, Standardwerte, Ausschluss von
   `--watch`, Fehlertexte, atomares Schreiben.
5. `pdf-export.mjs`, Teil eins: Browser starten, Seite laden, Zustände
   nach der Domäne aus Abschnitt 2 durchgehen, Klone einsammeln.
6. `pdf-export.mjs`, Teil zwei: Bereinigung, Seiten-Wrapper,
   Export-Stylesheet, DOM-Tausch.
7. Linktabelle (Chunk-IDs und Spalten-IDs), Umschreiben, Meldung für
   unauflösbare Ziele.
8. Medien-Fallbacks: Video-Frame-0, Embed-Karte, Bericht über nicht
   geladene Bilder.
9. `page.pdf()`-Aufruf, Overflow-Meldungen, Log-Zeile mit
   Browser-Version.
10. **Messen, bevor weitergebaut wird:** alle fünf Vorlesungen des
    Repositories exportieren – `tutorial`, `diagrams`, `decoration`,
    `network-security` und `python-intro`, das in Fassung 2 fehlte und
    unter ihnen das reichste an `::: cols`, `::: side` und
    `::: marginalia` ist. Seitenzahl, Dateigröße, Laufzeit und
    `pdffonts`-Ausgabe notieren. Wenn die Größe hier aus dem Ruder
    läuft, ist das der Moment, an dem die Font-Instanzierung doch in v1
    muss – und nicht früher.

    Das Inhalts-Repository `../psi-slides-mylectures` (`advasp`,
    `evalchat`, `seminar`, `vawi`) wird einmal von Hand durchgesehen,
    steht aber **nicht** in der Abnahmematrix: Es liegt nicht in diesem
    Repository, läuft nicht in CI, und ein Abnahmekriterium, das auf
    einem Nachbarverzeichnis fußt, ist auf keiner anderen Maschine
    prüfbar. Der Anspruch oben ist entsprechend gelesen: Die fünf
    lokalen Vorlesungen sind die Zusage, die vier fremden sind die
    Stichprobe.
11. Tests: Fixture unter `test/fixtures/pdf-beats/`, `buildSource()` im
    Harness, `'./pdf-export.mjs'` ans Ende von `SPECS` in
    `test/run.mjs`, Spec schreiben (siehe unten).
12. Dokumentation: `CLAUDE.md` (Commands, Architektur mit der zweiten
    Ausnahme), `README.md`, `CHANGELOG.md` unter `## [Unreleased]`,
    `docs/comparison.md`, CLI-Hilfe. Die Tutorial-Vorlesung erwähnt den
    Export in einem Satz, sie demonstriert ihn nicht – ein PDF ist keine
    HTML-Ansicht.

## Tests

Der Testaufwand folgt der Repository-Praxis: Was ohne Browser
entschieden werden kann, gehört nach `test/gates/`; was einen Browser
braucht, nach `test/run.mjs`. Der PDF-Export braucht einen.

**Die eigentliche Prüffläche ist das Druck-DOM, nicht die PDF-Datei.**
Fast jede Zusage dieses Plans – Seitenzahl, Reihenfolge, Sauberkeit,
Links, IDs – ist im DOM prüfbar, bevor Chromium druckt, und dort mit
gewöhnlichen Selektoren statt mit einem PDF-Parser. Eine neue Spec
`test/specs/pdf-export.mjs` exportiert ein Fixture und assertet gegen das
Druck-DOM.

**Zwei Anschlüsse muss die Umsetzung dafür herstellen, und sie stehen
hier, weil sie sonst niemand sieht:**

1. `test/run.mjs` entdeckt keine Dateien, es importiert die feste
   `SPECS`-Liste. `'./pdf-export.mjs'` gehört dort eingetragen, ans Ende
   der Liste – die Spec startet einen zweiten Chromium-Lauf und ist die
   langsamste, also läuft sie zuletzt.
2. `buildLecture(slug)` baut ausschließlich `lectures/<slug>/source.md`
   (`test/harness.mjs` 118–125). Ein Fixture außerhalb von `lectures/`
   erreicht es nicht. Der Harness bekommt dafür ein
   `buildSource(relPath, flags)`, das gegen `ROOT` auflöst;
   `buildLecture` wird zum Einzeiler darüber. Ein Fixture in `lectures/`
   abzulegen wäre die Alternative und ist die schlechtere: `lint.js` und
   `gates.yml` laufen über `lectures/`, und ein absichtlich überlanger
   Chunk mit einem toten Fragmentlink ist genau das, was ein Linter dort
   zu Recht anschreit.

Fixture `test/fixtures/pdf-beats/source.md`, ein Chunk je Fall:

- mehrere Text-Reveal-Segmente
- ein `::: draw` mit mehreren Schritten
- ein Diagramm innerhalb eines Reveal-Segments
- ein `::: backdrop` mit `reveal`
- ein `::: overlay` mit `from`
- ein beatloser Chunk
- ein Chunk mit `::: expand`, `> note:` und einem externen Link
- Titel, Abschnittsdivider (Spalte mit `# Heading {#id}`), Schlussfolie
- ein interner Link auf einen Chunk **und** einer auf eine Spalten-ID

Assertions:

*Zustände und Seiten.* Erwartete Gesamtseitenzahl; genau eine
Ausgangsseite pro Chunk; kumulative Reihenfolge; `--pdf-beats=final`
ergibt genau eine Seite pro Chunk; der beatlose Chunk ergibt genau eine.

*Bereinigung.* Das Druck-DOM enthält keines von `.exps`, `.exp-chev`,
`.exp-body`, `.annot-box`, `.annot-add`, `.link-code`, `#link-overlay`,
`#toc`, `#search-panel`, `#mode-badge`, `script`.

*Links.* Der externe Link ist noch ein `<a>` mit unverändertem `href`,
und der QR-Knopf daneben fehlt. Der interne Chunk-Link zeigt auf die
Wrapper-ID der ersten Seite seines Ziels. Der Spalten-Link zeigt auf die
Divider-Seite. Kein `<a href="#…">` im Druck-DOM zeigt auf eine ID, die
es nicht gibt.

*Diagramme.* Das ist der Test, an dem die Entscheidung „nicht präfixen“
hängt: Zwei Klone desselben `::: draw` auf verschiedenen Beats haben für
mindestens ein Element unterschiedliche Geometrie-Attribute. Fällt der
Test, ist die Annahme aus Abschnitt 5 gebrochen und der Rewriter fällig.
Zusätzlich: Die eingebetteten `<style>`-Blöcke der Klone sind unverändert
(`@scope`-Selektor identisch zum Original).

*Geometrie.* `getComputedStyle(document.documentElement)` liefert
`--slide-h: 900px`; jede `.pdf-page` ist 1600 × 900; keine ist höher als
ihr Inhalt breit.

*Overflow.* Ein Chunk, der bei Zoom 0,6 immer noch überläuft, erzeugt
genau eine Warnung, die Chunk-ID und Beat nennt. Das Fixture enthält
dafür einen absichtlich überlangen Chunk.

*Datei, und das ist die wichtigste Assertion der Spec.* Die Seitenzahl
der **erzeugten Datei** muss geprüft werden, nicht nur die der Wrapper im
DOM – die Messung oben zeigt, warum: Ein DOM mit vier richtig
dimensionierten Wrappern hat ein einseitiges PDF ergeben, und keine
DOM-Assertion hätte das gesehen.

Das braucht kein Poppler. Chromium schreibt PDF 1.4 ohne Objektströme,
also steht die Zahl im Klartext in der Datei:

```js
const pdf = fs.readFileSync(out, 'latin1');
const pages = Number(/\/Count (\d+)/.exec(pdf)[1]);          // === erwartet
const box = /\/MediaBox\s*\[([^\]]+)\]/.exec(pdf)[1].trim().split(/\s+/).map(Number);
// [0, 0, 1200, 675] auf 1 pt genau – gemessen kommt 675.12 heraus,
// also wird verglichen und nicht auf Textgleichheit geprüft.
```

Dazu: Die Datei beginnt mit `%PDF-`, ist größer als 10 KB, und ein
abgebrochener Lauf hinterlässt weder `slides.pdf` noch `.tmp`.

*Offline.* Der Lauf über ein Fixture mit einem Vimeo-`::: embed` meldet
genau einen geblockten Origin und bricht nicht ab. Ohne das Routing
würde er ihn laden – das ist der Test, der die Offline-Zusage von einer
Behauptung zu einer Eigenschaft macht.

*Optional, wenn Poppler da ist.* Sind `pdftotext` beziehungsweise
`pdffonts` auf dem `PATH`, kommt dazu: `pdftotext` findet einen bekannten
Satz aus dem Fixture (die Textnatur aus Abnahmekriterium 4), und die
`pdffonts`-Ausgabe wird als Notiz gedruckt, nicht asserted. Fehlen die
Werkzeuge, sagt der Test das und läuft weiter – dieselbe Bauart wie
`encoder()` in `shoot-lib.mjs`: ein fehlendes Werkzeug ist ein nicht
eingerichteter Rechner, kein Defekt. **Nur diese beiden sind optional**;
Seitenzahl und Seitenmaß nicht.

Ausdrücklich **kein** visueller Pixelvergleich PDF gegen Screenshot. Er
wäre der teuerste Test hier, der am häufigsten aus Gründen ausschlägt,
die niemanden interessieren, und die Fragen, die er beantworten soll –
stimmen die Farben, ist der Hintergrund da – beantworten `printBackground`
und `print-color-adjust: exact` an der Quelle. Ein Auge auf den fünf
Vorlesungen aus Umsetzungsschritt 10 leistet mehr.

## Abnahmekriterien

Die erste Version ist fertig, wenn:

1. `node build.js <source.md> --slides-pdf` aus **allen fünf**
   Vorlesungen im Repository ein `slides.pdf` erzeugt –
   `tutorial`, `diagrams`, `decoration`, `network-security`,
   `python-intro`;
2. jeder Chunk und jeder seiner Zustände genau einmal und in der
   richtigen Reihenfolge enthalten ist, ein beatloser Chunk eingeschlossen;
3. die Seiten der Audience-Ansicht entsprechen – gleiches Theme, gleiche
   Typografie, gleicher Hintergrund, Chunk vertikal zentriert;
4. Text, Code und `::: draw` Vektoren bleiben, auswählbar und von
   `pdftotext` extrahierbar; keine Seite ein Rasterbild ist. Type 3 ist
   für v1 zulässig und dokumentiert;
5. Expansions, Annotationen und interaktives Chrome vollständig fehlen;
6. externe Links klickbar bleiben und interne Links auf die erste Seite
   ihres Ziel-Chunks beziehungsweise ihrer Divider-Folie führen;
7. der Export offline über `file://` läuft und dabei **nachweislich**
   keinen HTTP-Request absetzt – geprüft über das Routing, nicht
   angenommen;
8. fehlender Browser, nicht geladene Bilder, unauflösbare Fragmente und
   überlaufende Zustände je eine Meldung mit Chunk-ID und nächstem
   Schritt erzeugen, statt still zu bleiben;
9. `node build.js <source.md>` und `npm run lint` auf einer Installation
   **ohne** `playwright-core` unverändert durchlaufen – der einzige neue
   Import in `build.js` ist ein `await import()` hinter dem Flag.

    Fassung 2 hat hier auch `npm test` versprochen, und das war schon
    vorher unmöglich: `test/run.mjs` lädt `test/harness.mjs`, und das
    importiert `playwright-core` statisch auf Modulebene
    (`test/harness.mjs` 42). Die Browser-Suite braucht eine
    Browserbindung, mit oder ohne dieses Vorhaben. Sie hier kontrolliert
    überspringbar zu machen wäre eine Änderung an der Testarchitektur,
    die der PDF-Export nicht verursacht hat und nicht mitbringen soll –
    `npm run gate` ist der Teil, der ohne Browser läuft, und der läuft
    weiter;

10. die vier bestehenden HTML-Ausgaben byteweise unverändert sind, bis
    auf die zehn Zeilen `psiExport` in den beiden Live-Ansichten.
