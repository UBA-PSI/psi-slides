# Plan: PDF-Foliensatz mit allen Beats

Vierte Fassung, implementierungsbereit. Jede Fassung ist an einem Review
von Codex und am Code geprüft worden (`REVIEW-slide-pdf-export.md` und
die beiden Nachfolger `-v2`, `-v3`). Was bestätigt wurde, was verworfen,
und was billiger zu haben ist als vorgeschlagen, steht in den drei
Änderungsabschnitten. Der dritte Review findet keinen Architektur- oder
Rendering-Blocker mehr.

> **Wer das baut, liest drei Abschnitte zuerst:** „Übergabe“ ganz am
> Ende – welche Aussage gemessen ist, welche im Code nachgelesen und
> welche nur plausibel, was man nicht tun soll, und wo ich erwarte, dass
> der Plan sich irrt. Dann „Umsetzungsschritte“, fünf Etappen mit
> Prüfpunkten. Dann „Architektur“. Die Änderungsabschnitte sind
> Vorgeschichte und können warten.

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
- **Die neue Spec hängt an nichts.** Fassung 3 hat daraufhin einen
  `SPECS`-Eintrag und ein `buildSource()` im Harness vorgesehen – beides
  falsch, siehe den nächsten Abschnitt. Der Befund stimmte, die Antwort
  war die zweitbeste. → „Tests“.
- **`lectures/python-intro` fehlte in der Matrix.** Fünf Vorlesungen,
  nicht vier; und der Anspruch auf das Inhalts-Repository ist zu einer
  Stichprobe zurückgenommen.

Ein Nebenbefund aus derselben Messung, der den Testplan verbessert:
Chromium schreibt PDF 1.4 ohne Objektströme, `/Count` und `/MediaBox`
stehen im Klartext. Die Seitenzahlprüfung der erzeugten Datei – die der
Review zu Recht als obligatorisch verlangt – braucht deshalb kein
Poppler und ist eine Zeile.

## Was sich gegenüber Fassung 3 geändert hat

Sechs Punkte, alle im Testvertrag, alle bestätigt. Fünf davon lösen sich
in **einer** Entscheidung auf, und die stand die ganze Zeit im
Repository: `test/settings.mjs` ist bereits ein eigenständiger Test in
der `npm test`-Kette, der seine Quellen in ein Temp-Verzeichnis schreibt,
`build.js` als Unterprozess ruft und die Ausgabe prüft. Der PDF-Test ist
dieselbe Form, und damit fallen weg:

- der Widerspruch zwischen `test/specs/pdf-export.mjs` und dem
  `SPECS`-Eintrag `'./pdf-export.mjs'` – **es gibt kein `test/specs/`**,
  alle Specs liegen flach in `test/`, und der Plan hat sich hier in einem
  Absatz selbst widersprochen;
- der `SPECS`-Eintrag samt der Frage, wie ein Spec-Vertrag aussieht, der
  für seinen einzigen Ausreißer einen `standalone`-Zweig bekommt;
- `buildSource()` im Harness;
- die Build-Artefakte im Worktree und damit die `.gitignore`-Frage;
- der zweite Browser im Test: Der Exporter bekommt ein verstecktes
  `--pdf-dump-dom=<pfad>`, und der ganze DOM-Teil der Prüfung wird
  Textsuche in Node.

Der Rest, einzeln:

- **Die PDF-Prüfung war zu fragil.** `/Count` steht auch in einem
  `/Outlines`-Baum, und ein `.exec(…)[1]` auf einen Fehltreffer ist ein
  Nullzugriff statt einer Diagnose. Sie wird jetzt am Seitenbaum
  verankert und sagt beim Misserfolg, was sie nicht lesen konnte.
- **`--pdf-size=16:10` war ungeprüft**, obwohl öffentlicher Vertrag. Ein
  zweiter, kurzer Exportlauf prüft DOM- und PDF-Maß.
- **Drei der vier zugesagten Diagnosen hatten keinen Testfall.** Das
  Fixture bekommt einen toten Fragmentlink und ein fehlendes Bild mit
  explizitem Pfad; der fehlende Browser bekommt einen eigenen Lauf mit
  `PSI_CHROME=/gibt/es/nicht`.
- **Abnahmekriterium 8 verlangte eine Chunk-ID, die es nicht geben
  kann.** Vor dem Browserstart existiert kein Deck. Das Kriterium
  unterscheidet jetzt zwischen Fehlern vor und nach dem Laden.
- **Abnahmekriterium 7 widersprach seinem eigenen Test** („setzt keinen
  HTTP-Request ab“ gegen einen Zähler, der nur zählen kann, was versucht
  wurde). Es heißt jetzt: Kein Request erreicht das Netz.

Dazu drei Befunde aus dem Code, um die niemand gebeten hat, die aber
Arbeit einsparen: Das Druck-DOM entsteht durch Aufnahme statt durch
Ausschluss, und das ist sicher, weil **kein** `position: fixed` in
`AUDIENCE_CSS` auf Folieninhalt sitzt (nachgezählt, elf Stück, alle
Chrome). Die Foliennummer kostet nichts. Und die Marginalia sind der
zweite Grund, warum Papier und Viewport dieselbe Größe haben müssen.
Alle drei stehen in Architektur 4. Die Umsetzungsschritte sind
außerdem zu fünf Etappen mit Prüfpunkten geworden, deren dritte ein
lauffähiges PDF ist.

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
--pdf-dump-dom=<pfad>        # versteckt, nur für den Test
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
- `--pdf-dump-dom=<pfad>` schreibt vor dem Drucken
  `document.documentElement.outerHTML` weg. Es steht nicht in der
  CLI-Hilfe, weil es kein Feature für Autoren ist, sondern die
  Prüffläche des Tests: Damit kommt der ganze DOM-Teil der Prüfung ohne
  zweiten Browser aus (siehe Tests).

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

**Das Druck-DOM entsteht durch Aufnahme, nicht durch Ausschluss.** Nur
geklonte Chunks kommen hinein; alles andere ist danach weg, weil
`document.body` ersetzt wird und nicht durchsucht. Die Streichliste oben
betrifft deshalb ausschließlich, was *innerhalb* eines Chunks sitzt –
Expansion, Annotation, QR-Knopf, Payload. Hilfe, Suche, TOC,
Mode-Badge, Laserpunkt, Touch-Leiste und das Figure-Overlay stehen als
Geschwister von `#stage` und verschwinden, ohne dass jemand sie
aufzählen muss.

Das ist nicht nur bequemer, es ist auch das einzig sichere: Ein
`position: fixed`-Element wiederholt sich in einem paginierten Dokument
auf **jeder** Seite. Nachgezählt sind alle elf `position: fixed` in
`AUDIENCE_CSS` auf ID-selektierte Chrome-Elemente gesetzt
(`#figure-overlay`, `#blank-badge`, `#help-overlay`, `#help-button`,
`#link-overlay`, `#mode-badge`, `#laser-pointer`, `#overview-badge`,
`#search-panel`, `#touch-controls`) – **keines auf Folieninhalt**. Eine
Streichliste hätte eines davon übersehen können; die Aufnahmeregel kann
es nicht.

Zwei Dinge kosten daher nichts, die man sonst bauen müsste:

- **Die Foliennummer.** `.chunk-num` ist direktes Kind von `.chunk` und
  `position: absolute` gegen dessen eigenes `position: relative`. Der
  Klon trägt sie mit, und weil `jumpTo` ihm `.active` gegeben hat, greift
  auch `.chunk.active > .chunk-num { opacity: 0.5 }`. Dass alle
  Beat-Seiten eines Chunks dieselbe Nummer tragen, ist damit keine Regel,
  die jemand durchsetzt, sondern eine Folge davon, wo das Element steht.
- **Marginalia.** Sie liegen in `.chunk-content` und reisen mit. Sie sind
  aber der Grund, warum die Entscheidung „Papier gleich Viewport“ ein
  zweites Mal trägt: `.marginalia` ist
  `left: calc(100% + 2vw); width: 26vw`, und `vw` bezieht sich im Druck
  auf die **Seitenbox**, nicht auf das Fenster. `--slide-w` ist mit
  `!important` festgenagelt, die rund zwei Dutzend rohen `vw`/`vh`-Werte
  in `AUDIENCE_CSS` sind es nicht – sie stimmen nur, weil die Seite
  genauso breit ist wie der Viewport, in dem gemessen wurde. Ein Papier
  in anderer Größe als der Viewport hätte hier still verschoben.

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

Fünf Etappen. Jede endet an einem Punkt, an dem etwas Nachprüfbares
läuft, und jede ist ein eigener Commit oder wenige. Die Reihenfolge ist
so gewählt, dass **nach Etappe 3 ein PDF existiert** – alles danach macht
es richtig, nicht erst möglich.

### Etappe 0 – Vorarbeiten, die nichts mit PDF zu tun haben

1. `findChrome()` nach `chrome-path.mjs` im Wurzelverzeichnis heben;
   `docs/site/shoot-lib.mjs` und `test/harness.mjs` importieren von dort.
   Reiner Umzug, kein Verhalten. Die Notiz in `harness.mjs` 45–52
   („Keep the two in step“) beschreibt danach ein Problem, das es nicht
   mehr gibt, und geht mit.
2. `playwright-core` von `devDependencies` nach `optionalDependencies`.

*Fertig, wenn:* `npm test` läuft wie vorher, und `npm run gate`
und `node build.js lectures/tutorial/source.md` laufen in einem
Checkout, aus dem `node_modules/playwright-core` gelöscht wurde.

### Etappe 1 – Der Hook und die Kommandozeile

3. `psiExport` in `AUDIENCE_JS`. Kein Verhalten ändern. Auf das Gate
   `inlined` achten: kein rohes Backtick, doppelte Backslashes.
4. Flags in `build.js`, mit Standardwerten, dem Ausschluss von
   `--watch`, den Fehlertexten und dem atomaren Schreiben.
   `pdf-export.mjs` wird per `await import()` hinter dem Flag geladen und
   meldet bei fehlendem Paket `npm install playwright-core` mit Grund
   (`err.userFacing = true`).

*Fertig, wenn:* `--slides-pdf` einen verständlichen Fehler wirft, weil
`pdf-export.mjs` noch leer ist, und die vier HTML-Ausgaben von
`lectures/tutorial` sich gegenüber `main` nur um die zehn Zeilen
`psiExport` unterscheiden (`git diff --stat`).

### Etappe 2 – Der Zustandslauf

5. Browser starten, Routing setzen, Seite laden, `psiExport.quiesce()`,
   `autoFit` erzwingen.
6. Zustände nach der Domäne aus Architektur 2 durchgehen und klonen.

*Fertig, wenn:* Ein Lauf über `lectures/tutorial` die erwartete Zahl von
Klonen meldet und `blocked` leer ist. Noch kein PDF.

### Etappe 3 – Das Druck-DOM und der Druck

7. Bereinigung, Seiten-Wrapper, Export-Stylesheet, DOM-Tausch,
   `--pdf-dump-dom`.
8. `page.pdf()`, atomares Schreiben, Log-Zeile mit Browser-Version.

*Fertig, wenn:* `lectures/tutorial/slides.pdf` existiert, sich öffnen
lässt, und `/Count` der Zahl der Klone aus Etappe 2 entspricht. **Das ist
der Punkt, an dem sich das Vorhaben als machbar erwiesen hat oder
nicht.** Erst hier lohnt der Rest.

### Etappe 4 – Richtig statt nur vorhanden

9. Linktabelle (Chunk-IDs und Spalten-IDs), Umschreiben, Meldung für
   unauflösbare Ziele.
10. Medien: Video-Frame-0 mit Platzhalter-Rückfall, Embed-Karte, Bericht
    über nicht geladene Bilder.
11. Overflow-Meldungen mit Chunk-ID und Beat.

*Fertig, wenn:* Alle vier Diagnosen aus Abnahmekriterium 8 an einer
Vorlesung ausgelöst werden können, von Hand.

### Etappe 5 – Messen, prüfen, aufschreiben

12. **Messen, bevor der Rest geschrieben wird:** alle fünf Vorlesungen
    des Repositories exportieren – `tutorial`, `diagrams`, `decoration`,
    `network-security` und `python-intro`, unter ihnen das reichste an
    `::: cols`, `::: side` und `::: marginalia`. Seitenzahl, Dateigröße,
    Laufzeit und `pdffonts`-Ausgabe notieren, und **die PDFs ansehen**.
    Läuft die Dateigröße aus dem Ruder, ist das der Moment für die
    Font-Instanzierung – und nicht früher. Sieht eine Folie falsch aus,
    ist das der Moment, an dem der Plan eine Zeile bekommt statt der
    Code eine Ausnahme.

    Das Inhalts-Repository `../psi-slides-mylectures` (`advasp`,
    `evalchat`, `seminar`, `vawi`) wird einmal von Hand durchgesehen,
    steht aber **nicht** in der Abnahmematrix: Es liegt nicht in diesem
    Repository, läuft nicht in CI, und ein Abnahmekriterium, das auf
    einem Nachbarverzeichnis fußt, ist auf keiner anderen Maschine
    prüfbar. Die fünf lokalen Vorlesungen sind die Zusage, die vier
    fremden sind die Stichprobe.
13. `test/pdf-export.mjs` nach dem Vorbild von `test/settings.mjs`, in
    die `npm test`-Kette gehängt. Weder `SPECS` noch `test/harness.mjs`
    noch `.gitignore` werden angefasst (siehe Tests).
14. Dokumentation: `CLAUDE.md` (Commands, Architektur mit der zweiten
    Ausnahme), `README.md`, `CHANGELOG.md` unter `## [Unreleased]`,
    `docs/comparison.md`, CLI-Hilfe. Die Tutorial-Vorlesung erwähnt den
    Export in einem Satz, sie demonstriert ihn nicht – ein PDF ist keine
    HTML-Ansicht.

### Wo es am ehesten hakt

Drei Stellen, an denen die Umsetzung von diesem Plan abweichen könnte,
mit dem, was dann zu tun ist:

| Stelle | Symptom | Antwort |
|---|---|---|
| Zwei Klone eines `::: draw` beeinflussen sich | eine Beat-Seite zeigt die Geometrie einer anderen | Die Annahme aus Architektur 5 ist gebrochen. Dann und nur dann den ID-Rewriter bauen – und zwar den vollständigen, mit `@scope`. |
| Auto-Fit braucht pro Zustand zu lange | Export dauert Minuten statt Sekunden | `fitZoomToChunk` misst in einer Schleife. Zoom je Chunk einmal lösen und für dessen Beats behalten, statt je Beat – kostet Genauigkeit bei wachsenden Chunks, und das ist der Tausch, den man dann bespricht. |
| Der Klon sieht anders aus als die Projektion | Ränder, Zentrierung, Schriftgröße | Zuerst `--slide-w`/`--slide-h` im Abzug prüfen, dann `--zoom` auf dem Wrapper, dann `body`-Attribute. In dieser Reihenfolge, weil jede die folgende erklärt. |

## Tests

Der Testaufwand folgt der Repository-Praxis, und die Praxis hat für genau
diese Form schon eine Datei: **`test/settings.mjs`**. Sie ist ein
eigenständiger Test in der `npm test`-Kette, schreibt ihre Quellen mit
`fs.mkdtempSync(path.join(os.tmpdir(), 'psi-…'))` in ein Temp-Verzeichnis,
ruft `build.js` als Unterprozess auf und prüft, was herausgekommen ist –
zwölfmal, an zwölf Stellen (`test/settings.mjs` 109, 226, 243, 288, 316,
371, 442, 466, 512, 545, 933, 951). Der PDF-Test ist dieselbe Form.

**`test/pdf-export.mjs`, eigenständig, in `npm test` eingehängt:**

```json
"test": "node test/gates/run.mjs && node test/settings.mjs && node test/pdf-export.mjs && node test/run.mjs"
```

Nach `settings.mjs` und vor `run.mjs`: Ohne einen auffindbaren Browser
kann er nicht bestehen, also gehört er hinter die Prüfungen, die ganz
ohne auskommen; er dauert Sekunden statt Minuten, also vor die
Browser-Suite.

Das ersetzt drei Festlegungen aus Fassung 3, die alle drei falsch waren:

- Es gibt **kein `test/specs/`**. Alle Specs liegen flach in `test/`, und
  der Plan hat sich in einem Absatz selbst widersprochen (`test/specs/…`
  gegen den `SPECS`-Eintrag `'./pdf-export.mjs'`).
- Der `SPECS`-Eintrag entfällt ganz. `test/run.mjs` baut für jede Spec
  `buildLecture(s.lecture)`, serviert das Verzeichnis und übergibt ein
  bereits geöffnetes Deck (`test/run.mjs` 59–75). Der PDF-Test will
  nichts davon: Er baut selbst, exportiert selbst und liest eine Datei.
  Ihm einen `standalone`-Zweig im Runner zu bauen hieße, den
  Spec-Vertrag für seinen einzigen Ausreißer zu verbiegen.
- `buildSource()` im Harness entfällt damit ebenfalls, und mit ihm die
  Frage nach `.gitignore`: Im Temp-Verzeichnis entstehen keine Dateien,
  die der Worktree je sieht. Ein `finally` löscht das Verzeichnis; ein
  abgebrochener Lauf lässt höchstens etwas in `$TMPDIR` stehen, wo es
  hingehört.

**Der Test steuert selbst keinen Browser.** Er startet keinen und
importiert `playwright-core` nicht: Chromium läuft im Unterprozess von
`build.js`, und der Test liest anschließend zwei Dateien – das PDF und
einen Abzug des Druck-DOM. Dafür bekommt der Exporter ein verstecktes
`--pdf-dump-dom=<pfad>`, das vor dem Drucken `document.documentElement.outerHTML`
wegschreibt. Zwei Zeilen im Exporter, und der ganze DOM-Teil der Prüfung
wird zu Textsuche in Node – dasselbe, was `settings.mjs` mit gebautem
HTML tut.

### Fixture

Eine Quelle, in `$TMPDIR` geschrieben, ein Chunk je Fall:

- mehrere Text-Reveal-Segmente
- ein `::: draw` mit mehreren Schritten
- ein Diagramm innerhalb eines Reveal-Segments
- ein `::: backdrop` mit `reveal`
- ein `::: overlay` mit `from`
- ein beatloser Chunk
- ein Chunk mit `::: expand`, `> note:` und einem externen Link
- Titel, Abschnittsdivider (Spalte mit `# Heading {#id}`), Schlussfolie
- ein gültiger interner Link auf einen Chunk **und** einer auf eine
  Spalten-ID
- **ein toter Fragmentlink** `[x](#gibtsnicht)`
- **ein Bild mit explizitem Pfad, das es nicht gibt** –
  `![](./fehlt.png)`. Nicht die Kurzform `![](fehlt)`: Die rendert der
  Build schon als sichtbaren `figure-missing`-Platzhalter
  (`build.js` 1937), das ist eine vorhandene Diagnose und nicht die, die
  hier geprüft wird. Der explizite Pfad kommt als `<img src>` durch und
  scheitert erst im Browser, und genau das soll der Export melden.
- **ein `::: embed` auf Vimeo**, also ein Anbieter, den `wireEmbeds()`
  unter `file://` nicht abfängt
- ein absichtlich überlanger Chunk

Ein Fixture in `lectures/` abzulegen wäre die Alternative und die
schlechtere: `lint.js` und `gates.yml` laufen über `lectures/`, und ein
überlanger Chunk mit einem toten Fragmentlink ist genau das, was ein
Linter dort zu Recht anschreit.

### Assertions gegen den DOM-Abzug

*Zustände und Seiten.* Erwartete Gesamtzahl der `.pdf-page`-Wrapper;
genau eine Ausgangsseite pro Chunk; kumulative Reihenfolge; der beatlose
Chunk ergibt genau eine; `--pdf-beats=final` ergibt genau eine pro Chunk.

*Bereinigung.* Der Abzug enthält keines von `.exps`, `.exp-chev`,
`.exp-body`, `.annot-box`, `.annot-add`, `.link-code`, `#link-overlay`,
`#toc`, `#search-panel`, `#mode-badge`, `<script`.

*Links.* Der externe Link ist noch ein `<a>` mit unverändertem `href`,
und der QR-Knopf daneben fehlt. Der interne Chunk-Link zeigt auf die
Wrapper-ID der ersten Seite seines Ziels, der Spalten-Link auf die
Divider-Seite. Kein `<a href="#…">` im Abzug zeigt auf eine ID, die es
nicht gibt – der tote Link aus dem Fixture ist zum `<span>` geworden.

*Diagramme.* Der Test, an dem die Entscheidung „nicht präfixen“ hängt:
Zwei Klone desselben `::: draw` auf verschiedenen Beats unterscheiden
sich in mindestens einem Geometrie-Attribut. Fällt er, ist die Annahme
aus Abschnitt 5 gebrochen und der Rewriter fällig. Dazu: Der
`@scope`-Selektor der eingebetteten `<style>`-Blöcke ist in jedem Klon
identisch zum Original.

### Assertions gegen die Diagnosen auf stderr

Vier Meldungen, vier Fälle. Alle vier sind Zusagen aus
Abnahmekriterium 8, und keine davon war in Fassung 3 geprüft außer der
letzten:

| Fall | Erwartete Meldung nennt |
|---|---|
| toter Fragmentlink | Zielfragment und Chunk-ID des Links |
| fehlendes Bild | `src` und Chunk-ID |
| geblocktes Embed | den Origin, genau einmal |
| Overflow bei Zoom 0,6 | Chunk-ID und Beat |

**Fehlender Browser, eigener Fall, ohne Fixture:** Ein Lauf mit
`PSI_CHROME=/gibt/es/nicht` endet mit Exit-Code ungleich null, die
Meldung nennt die abgesuchten Orte und den nächsten Schritt, und es
erscheint **kein** Stacktrace (`err.userFacing`). Diese Meldung nennt
richtigerweise keine Chunk-ID – vor dem Browserstart gibt es kein Deck
und keinen Chunk, und Abnahmekriterium 8 sagt das jetzt auch.

### Assertions gegen die PDF-Datei

Die wichtigste Prüfung der Datei ist die Seitenzahl, und zwar die **der
Datei**, nicht die der Wrapper im DOM: Die Messung oben zeigt ein DOM mit
vier richtig dimensionierten Wrappern, aus dem ein einseitiges PDF wurde.
Keine DOM-Assertion hätte das gesehen.

Chromium schreibt PDF 1.4 ohne Objektströme, die Zahl steht also im
Klartext. Aber nicht der erste beliebige Treffer: `/Count` steht auch in
einem `/Outlines`-Baum, also wird am Seitenbaum verankert und beim
Misserfolg gesagt, was los ist.

```js
function pageTree(pdf) {
  for (const m of pdf.matchAll(/\d+ 0 obj([\s\S]*?)endobj/g)) {
    const body = m[1];
    if (!/\/Type\s*\/Pages\b/.test(body)) continue;
    if (/\/Parent\b/.test(body)) continue;              // nicht die Wurzel
    const c = /\/Count\s+(\d+)/.exec(body);
    if (c) return Number(c[1]);
  }
  throw new Error(
    'konnte den Seitenbaum in slides.pdf nicht lesen. Der Browser hat '
    + 'vermutlich eine PDF-Struktur geschrieben, die dieser Test nicht '
    + 'kennt (komprimierte Objekte?). Von Hand prüfen: pdfinfo slides.pdf');
}
```

Dasselbe für die MediaBox: aus einem `/Type /Page`-Objekt gelesen, als
vier Zahlen verglichen und nicht als Text. Gemessen kommt
`[0 0 1200 675.12]` heraus, also gilt eine Toleranz von 1 pt.

Ein fehlender Treffer ist ein **Fehlschlag mit dieser Meldung**, kein
stilles Bestehen und kein Nullzugriff. Das ist der ehrliche Umgang mit
dem, was der Test annimmt: `findChrome()` kann einen Browser wählen,
dessen Serialisierung anders aussieht, und dann soll der Test das sagen,
statt zu raten. Einen PDF-Parser als Abhängigkeit aufzunehmen wäre die
Alternative und steht in keinem Verhältnis: Es sind zwölf Zeilen gegen
ein Paket, das der Rest des Projekts nie wieder anfasst.

Dazu: Die Datei beginnt mit `%PDF-`, ist größer als 10 KB, und ein
abgebrochener Lauf hinterlässt weder `slides.pdf` noch `.tmp`.

**Beide Seitenformate.** `--pdf-size=16:10` ist öffentlicher Vertrag und
wird geprüft wie `16:9`: ein zweiter Export desselben Fixtures mit
`--pdf-beats=final` (kurz, weil nur die Geometrie interessiert), MediaBox
`[0 0 1200 750]` auf 1 pt, und `--slide-h: 1000px` im DOM-Abzug.

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
7. der Export offline über `file://` läuft und **kein HTTP(S)-Request
   das Netz erreicht**: Jeder Versuch wird vom Routing vor dem Transport
   abgefangen und abgebrochen, und der Export zählt die betroffenen
   Origins. Die Formulierung ist mit Absicht diese und nicht „setzt
   keinen Request ab“ – die Runtime *versucht* einen, sonst gäbe es
   nichts zu zählen, und der Zähler ist genau der Beleg;
8. vier Fehlerklassen je eine Meldung mit dem nächsten Schritt erzeugen,
   statt still zu bleiben – und zwar mit dem Kontext, den sie haben
   können: nicht geladene Bilder, unauflösbare Fragmente und
   überlaufende Zustände nennen die Chunk-ID (Overflow zusätzlich den
   Beat), ein **fehlender Browser** nennt die abgesuchten Orte und den
   nächsten Schritt und **keine Chunk-ID** – vor dem Browserstart gibt
   es kein Deck. Jede der vier hat einen Testfall;
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

## Übergabe

Geschrieben für den, der das baut, und nicht in diesem Gespräch dabei
war. Drei Dinge: was belegt ist und was nicht, was man nicht tun soll,
und wo ich erwarte, dass es klemmt.

### Belegstand

Ein Plan, der nicht sagt, woher er seine Sätze hat, lädt dazu ein, sie
alle gleich ernst zu nehmen. Diese hier sind es nicht.

**Gemessen** – ausgeführt, Chromium 1228, macOS arm64, `--print-to-pdf`:

| Aussage | Messung |
|---|---|
| `html,body{height:100%;overflow:hidden}` verhindert Pagination | vier Seiten-`div`s → `/Count 1`; mit `height:auto;overflow:visible` → `/Count 4` |
| Viewport 1600 × 900 px ergibt 1200 × 675 pt | `/MediaBox [0 0 1200 675.12]` – die 0,12 sind der Grund für die 1-pt-Toleranz im Test |
| `/Count` und `/MediaBox` sind aus der Datei lesbar | PDF 1.4, kein `ObjStm` im Ergebnis |

**Im Code nachgelesen** – Zeilennummern stimmten am Tag der Prüfung;
wenn eine nicht mehr passt, ist die Datei umgezogen, nicht die Aussage
falsch. Navigiere mit `grep -n '^// ── ' build.js`.

| Aussage | Fundstelle |
|---|---|
| `applyReveal` liest `revealed[id]`, ist kein Setter | `build.js` 9902 |
| `countSegments` gibt `0` für einen beatlosen Chunk | 9892 |
| Basisschrift ist `clamp(20px, --slide-h*0.026, 38px)` | 5980 |
| `--slide-w/h` werden als Inline-px auf `<html>` geschrieben | 9170–9176 |
| `@scope (svg#…-root)` bindet SVG-Styles an die Root-ID | 318–340 |
| `jumpTo` → `applyState` → `updateEmbedLoading` setzt `iframe.src` | 10357 / 9846–9856 / 11134 |
| `wireEmbeds` blockt unter `file://` nur YouTube | 11107–11111 |
| Divider-Chunk heißt `${col.id}-section` | 5416 |
| `<video>` hat kein `poster`, die Grammatik kennt keins | 1932, 1968 |
| Fehlende Kurzform-Bilder rendern `figure-missing` | 1937 |
| Kein Zoom in `VIEW_DEFAULT_SPEC`; `zoom: 1.35` fest | 3748ff / 9221 |
| `clampZoomToWidth` kehrt bei `collapse: none` sofort zurück | 10931–10933 |
| **Der Diagramm-Compiler emittiert kein `<use>`** | `diagram-core.mjs`, gezählt: rect, image, path, g, text, tspan, foreignObject, circle – sonst nichts |
| **`dgApplyVec` schreibt nur `setAttribute`**, kein WAAPI | `diagram-core.mjs`, `dgApplyVec` |
| Elf `position: fixed` in `AUDIENCE_CSS`, alle auf ID-Chrome | 6485, 8554, 8581, 8663, 8729, 8799, 8824, 8890, 9033, 9055 |
| `.chunk-num` ist Kind von `.chunk`, absolut gegen dessen `relative` | 6125 |
| `.marginalia` ist `left: calc(100%+2vw); width: 26vw` | 6315 |
| Es gibt kein `test/specs/`; `SPECS` ist eine feste Liste | `test/run.mjs` 22–46 |
| `test/settings.mjs` mkdtempt zwölfmal in `$TMPDIR` | 109, 226, 243, 288, 316, 371, 442, 466, 512, 545, 933, 951 |
| `test/harness.mjs` importiert `playwright-core` statisch | 42 |
| `findChrome` existiert zweimal | `shoot-lib.mjs` 25, `harness.mjs` 53 |

Die letzten beiden Zeilen der ersten Hälfte sind die wichtigsten: **Sie
tragen die Entscheidung, keine IDs zu präfixen.** Kein `<use>` heißt,
dass nichts im Diagramm Geometrie über eine ID holt; nur `setAttribute`
heißt, dass `cloneNode(true)` den Beat wirklich einfängt. Wären beide
anders, wäre Architektur 5 falsch.

**Nicht gemessen, nur plausibel** – hier irrt der Plan am ehesten:

- **`page.pdf({width:'1600px'})` layoutet bei genau 1600 CSS-px.** Gut
  dokumentiert, aber ich hatte kein `playwright-core` im Checkout und
  habe es nicht ausgeführt. Prüfpunkt Etappe 3 fängt es: Wenn die
  Seitenzahl stimmt und der Text nicht umbricht wie erwartet, ist das
  hier die erste Verdächtige.
- **`emulateMedia('screen')` + `printBackground` gibt das Theme
  originalgetreu wieder.** Nicht gemessen. Farben und Backdrop sind das,
  was man in Etappe 3 als Erstes ansieht.
- **`!important` auf `--slide-w` schlägt den Inline-Write der Runtime.**
  Kaskadenregel, also sicher – aber mit einer Custom Property nicht von
  mir ausprobiert. Im DOM-Abzug nachsehen, es ist eine Zeile.
- **Auto-Fit ist schnell genug.** `fitZoomToChunk` misst in einer
  Schleife, und der Export ruft es je Beat. Bei 40 Chunks mit je 4 Beats
  sind das 160 Läufe. Falls das quält: Tabelle „Wo es am ehesten hakt“.
- **Video-Frame-0 per Canvas.** Und hier erwarte ich, dass es **nicht**
  klappt: Ein `file://`-Video hat eine opake Herkunft, `drawImage` färbt
  die Leinwand ein und `toDataURL()` wirft `SecurityError`. Für ein
  inliniertes `data:`-Video sollte es gehen, für ein nach `videos/`
  ausgelagertes (über 12 MB) nicht. Wer das baut: `try/catch` um den
  Abgriff, Platzhalter im `catch`, und **keine Stunde** in den
  `SecurityError` investieren – der Rückfall ist der geplante Normalfall,
  nicht die Panne.

### Was man nicht tun soll

Fünf Wege, die naheliegen und die in drei Review-Runden verworfen wurden.
Wer einen davon einschlägt, baut nicht diesen Plan:

1. **Keinen ID-Rewriter bauen.** Nicht, weil er schwer wäre, sondern weil
   er nichts repariert: Alle Duplikate sind byteidentische Kopien
   derselben Definition. Erst wenn zwei Beat-Klone eines `::: draw`
   einander sichtbar beeinflussen, ist er fällig – dann aber vollständig,
   mit `@scope`.
2. **`test/run.mjs` nicht anfassen.** Kein `SPECS`-Eintrag, kein
   `standalone`-Feld, kein `buildSource()` im Harness. Der Test ist ein
   zweites `test/settings.mjs`.
3. **Keine `poster:`-Syntax erfinden.** Der Export ist kein Anlass, die
   Markdown-Grammatik zu erweitern.
4. **`hyphens: auto` nicht anfassen.** Es steht in `AUDIENCE_CSS` und
   betrifft alle vier Ausgaben. Eigenes Vorhaben.
5. **Keine Schrift instanzieren, bevor Etappe 5 gemessen hat.** Type 3
   ist zugelassen. Ob es teuer ist, sagt die Dateigröße, nicht das
   Gefühl.

### Arbeitsweise, die dieses Vorhaben besonders braucht

Aus `CLAUDE.md`, weil hier alle drei Fallen zugleich offen stehen:

- Der `psiExport`-Hook lebt in einem Template-Literal. **Ein rohes
  Backtick beendet es, ein einfacher Backslash wird gefressen.**
  `node test/gates/run.mjs inlined` sagt das in Millisekunden.
- **Nie `2>&1 >/dev/null`.** Ein `SyntaxError` verschwindet damit, und
  das alte HTML bleibt liegen – man debuggt dann einen Build, der nie
  gelaufen ist.
- Nach jeder Änderung an etwas Inliniertem: **`grep -F` im gebauten
  HTML**, bevor im Browser geurteilt wird.

### Einschätzung

Ich halte den Plan für baubar, und den riskanten Teil für kleiner, als
die 1000 Zeilen vermuten lassen. Der Grund ist Architektur 1: Der Export
implementiert die Beat-Reihenfolge nicht nach, er ruft sie auf. Damit
kann er in der Reihenfolge nicht falsch liegen – nur im Rendern, und das
ist eine Klasse von Fehlern, die man ansieht statt sie zu suchen.

Was ich für sicher halte: Zustandsdomäne, Klonen, Aufnahmeregel,
Seitengeometrie, Links, das Testgerüst. Das steht auf gemessenen oder
gezählten Aussagen.

Was ich für offen halte, in dieser Reihenfolge: die Treue des Renderings
(Etappe 3, mit Augen), die Laufzeit bei einer großen Vorlesung, und die
Dateigröße unter Type 3. Alle drei zeigen sich in Etappe 3 und 5, und für
alle drei steht die Antwort schon im Plan – deshalb ist die Reihenfolge
der Etappen so und nicht anders.

Was ich anders machen würde, wenn es schiefgeht: Die erste Ausbaustufe
kleiner schneiden. `--pdf-beats=final` ist eine Seite pro Chunk, braucht
keinen Beat-Lauf und keine kumulative Reihenfolge, und wäre schon für
sich nützlich. Wenn Etappe 2 sich als zäh erweist, ist das der Schnitt,
an dem man v1 ausliefert und den Beat-Lauf zu v1.1 macht.
