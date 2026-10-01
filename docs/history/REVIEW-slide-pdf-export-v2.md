# Review v2: `PLAN-slide-pdf-export.md`

## Ergebnis

Die zweite Fassung ist deutlich präziser als die erste, aber noch nicht
implementierungsreif. Drei Punkte blockieren die Umsetzung: Das geplante
Druck-CSS übernimmt eine seitenabschneidende Regel aus der Audience-Ansicht,
der Zustandslauf kann entgegen dem Offline-Vertrag Drittanbieter-Embeds laden,
und ein Abnahmekriterium verlangt einen Testlauf, der ohne `playwright-core`
bereits heute nicht starten kann.

Daneben sind der Zustand von `--pdf-fit=lecture`, die Einbindung der neuen
Tests und der Umfang der geprüften Lectures noch nicht eindeutig genug
festgelegt.

## Findings

### P1 – Höhe und Overflow für das Druck-DOM zurücksetzen

Der Plan druckt bewusst mit `emulateMedia({ media: 'screen' })`
(`PLAN-slide-pdf-export.md` 421), übernimmt damit aber auch diese Regel aus
`AUDIENCE_CSS` (`build.js` 5974–5977):

```css
html, body {
  height: 100%;
  overflow: hidden;
}
```

Das geplante Export-Stylesheet (`PLAN-slide-pdf-export.md` 315–330)
überschreibt weder die feste Höhe noch den Overflow. Ein lineares Druck-DOM
mit mehreren `.pdf-page`-Elementen kann deshalb nach der ersten
Viewport-Höhe abgeschnitten werden. Die richtige Größe der Wrapper im DOM
beweist nicht, dass Chromium sie alle paginiert.

Der Plan muss für den PDF-Modus mindestens `height: auto` und
`overflow: visible` auf `html` und `body` festlegen. Außerdem muss die
tatsächliche Seitenzahl der erzeugten PDF-Datei obligatorisch geprüft werden;
eine nur bei vorhandenem Poppler ausgeführte Kontrolle reicht für diesen
zentralen Fehlerpfad nicht.

### P1 – Embed-Netzwerkzugriffe vor dem Zustandslauf unterbinden

Die Materialisierung beginnt pro Zustand mit `psiExport.jumpTo(idx)`
(`PLAN-slide-pdf-export.md` 241). `jumpTo()` ruft über `applyState()` die
Funktion `updateEmbedLoading()` auf. Für einen aktiven Chunk setzt diese die
`iframe.src` eines Vimeo- oder generischen Embeds (`build.js` 11124–11146).
`wireEmbeds()` blockiert unter `file://` nur YouTube (`build.js` 11097–11111).

Damit kontaktiert der angeblich offline laufende Export Drittanbieter, obwohl
der Plan die Frames später durch Karten ersetzt. Liegt ein nicht blockiertes
Embed bereits auf der ersten aktiven Folie, kann der Request sogar während
des anfänglichen `page.goto()` entstehen und dessen Load-Wait verzögern oder
scheitern lassen.

Vor dem Laden müssen HTTP(S)-Requests etwa über Playwright-Routing blockiert
werden, oder die Runtime muss einen bereits vor ihrem Boot bekannten
Exportmodus erhalten, in dem `updateEmbedLoading()` keine Frames lädt. Erst
die Frames nach dem Klonen auszutauschen ist zu spät.

### P1 – Abnahmekriterium 9 erfüllbar formulieren

Abnahmekriterium 9 verlangt, dass `npm test` auch auf einer Installation ohne
`playwright-core` unverändert durchläuft (`PLAN-slide-pdf-export.md`
666–669). Das ist bereits mit dem aktuellen Testaufbau unmöglich:

- `npm test` startet unter anderem `test/run.mjs`;
- `test/run.mjs` importiert `test/harness.mjs`;
- `test/harness.mjs` importiert `playwright-core` statisch auf Modulebene
  (`test/harness.mjs` 42).

Ohne das Paket bricht der Testprozess daher vor der ersten Spec ab, unabhängig
davon, ob `--slides-pdf` verwendet wird. Der dynamische Import des neuen
Exportmoduls in `build.js` ändert daran nichts.

Der Plan muss entweder nur `npm run build` und `npm run lint` ohne
`playwright-core` garantieren oder ausdrücklich vorsehen, die Browser-Suite
bei fehlender optionaler Abhängigkeit kontrolliert zu überspringen. Ein
vollständiger Browser-Test kann ohne Browserbindung nicht zugleich verlangt
werden.

### P2 – `--pdf-fit=lecture` eindeutig initialisieren

Der CLI-Vertrag sagt, `--pdf-fit=lecture` verwende die
„Zoom-Voreinstellung der Vorlesung“ (`PLAN-slide-pdf-export.md` 128–130).
Eine solche Frontmatter-Einstellung existiert nicht: `VIEW_DEFAULT_SPEC`
kennt Font, Theme, Collapse, Auto-Fit, Foliennummern und Editor, aber keinen
Zoom (`build.js` 3733–3745). Der manuelle Runtime-Default ist fest `1.35`
(`build.js` 9211).

Der geplante Hook setzt bei `setAutoFit(false)` außerdem nur das Boolean
(`PLAN-slide-pdf-export.md` 198–200). Bei einer Lecture mit `auto-fit: true`
kann der Bootvorgang `state.zoom` bereits passend zur ersten Folie verändert
haben. Bei `collapse: none` stellt das geplante `settle()` den manuellen Wert
nicht wieder her, weil `clampZoomToWidth()` in diesem Modus sofort zurückkehrt
(`build.js` 10920–10924). Mehrere der vorhandenen Lectures verwenden genau
die Kombination `collapse: none` und `auto-fit: true`.

Der Plan muss deshalb festlegen, welchen konkreten Wert `lecture` meint, und
ihn beim Umschalten ausdrücklich wiederherstellen. Alternativ braucht der
Hook eine Operation, die den vollständigen Fit-Modus einschließlich des
manuellen Zoomzustands setzt.

### P2 – Die PDF-Spec an den vorhandenen Testrunner anbinden

Der Plan sieht `test/specs/pdf-export.mjs` und das Fixture
`test/fixtures/pdf-beats/source.md` vor (`PLAN-slide-pdf-export.md` 580–584).
Der vorhandene Browser-Testrunner entdeckt Dateien jedoch nicht automatisch:
`test/run.mjs` importiert ausschließlich die Einträge seiner festen
`SPECS`-Liste. Sein Helper `buildLecture()` baut außerdem ausschließlich
`lectures/<slug>/source.md` (`test/harness.mjs` 118–125).

Die vorgeschlagene Spec würde daher ohne weitere Änderungen weder von
`npm test` geladen noch über den vorhandenen Harness gebaut. Der Plan muss
die Registrierung in `SPECS` und Fixture-Unterstützung im Harness benennen
oder ein separates, ausdrücklich in `npm test` eingebundenes Testkommando
vorsehen.

### P2 – Den zugesagten Lecture-Bestand vollständig abdecken

Ziel und Anspruch der zweiten Fassung nennen die Vorlesungen in diesem
Repository und im Inhalts-Repository. Umsetzungsschritt 10 und
Abnahmekriterium 1 sprechen dagegen nur von vier lokalen Vorlesungen
(`PLAN-slide-pdf-export.md` 558–563 und 650–651).

Im Repository liegen fünf `source.md`-Lectures:

- `lectures/decoration`
- `lectures/diagrams`
- `lectures/network-security`
- `lectures/python-intro`
- `lectures/tutorial`

`lectures/python-intro` fehlt in der Mess- und Abnahmematrix; für das
Inhalts-Repository ist gar keine konkrete Matrix definiert. Der Plan sollte
entweder den Anspruch begrenzen oder alle fünf lokalen Lectures sowie eine
benannte Auswahl beziehungsweise einen vollständigen Lauf über das
Inhalts-Repository aufnehmen.

## Empfohlene Änderungen vor der Implementierung

1. Im Export-CSS `html` und `body` auf paginierbare Höhe und sichtbaren
   Overflow zurücksetzen und die PDF-Seitenzahl immer prüfen.
2. Netzwerkzugriffe vor `page.goto()` blockieren oder einen frühen
   Exportmodus in der Runtime einführen, der Embed-Loading unterbindet.
3. Abnahmekriterium 9 an die bestehende statische Browserabhängigkeit
   anpassen oder einen ausdrücklich optionalen Testpfad entwerfen.
4. `--pdf-fit=lecture` auf einen konkreten manuellen Zoomwert abbilden und
   diesen unabhängig vom Bootzustand wiederherstellen.
5. Spec-Registrierung und Fixture-Build im Testplan festschreiben.
6. Die Lecture-Matrix mit dem formulierten Geltungsbereich in Einklang
   bringen.

## Verifikationsumfang

Der Review wurde gegen die zweite Fassung von `PLAN-slide-pdf-export.md` und
die relevanten Stellen in `build.js`, `test/run.mjs`, `test/harness.mjs`,
`package.json` sowie die vorhandenen Lecture-Verzeichnisse durchgeführt.
Zusätzlich wurde das benachbarte Inhalts-Repository auf vorhandene
`source.md`-Lectures geprüft.

Es wurden keine Implementierungsdateien, bestehenden Reviews oder der Plan
verändert.
