# Review: `PLAN-slide-pdf-export.md`

## Ergebnis

Der Plan ist konzeptionell stimmig, aber noch nicht implementierungsreif.
Insbesondere Zustandsmaterialisierung, PDF-Medium und Seitengröße,
Reproduzierbarkeit sowie das Präfixen von SVG-IDs müssen vor der Umsetzung
präzisiert werden. Andernfalls kann eine Implementierung die formulierten
Abnahmekriterien erfüllen wollen und dennoch falsche oder zwischen Rechnern
abweichende PDFs erzeugen.

## Findings

### P1 – `applyReveal()` materialisiert keinen beliebigen Zustand

Der Plan behandelt `applyReveal(el, id, instant)` in Zeile 113 wie einen
State-Setter. Tatsächlich nimmt die Funktion keine Zustandsnummer entgegen,
sondern liest `revealed[id]` aus globalem Zustand (`build.js` 9783–9787).

Zu einer vollständigen Audience-Zustandsänderung gehören außerdem:

- den Chunk aktiv setzen,
- `revealed[id]` setzen,
- `applyReveal(..., true)` aufrufen,
- `fitZoomToChunk()` beziehungsweise `clampZoomToWidth()` ausführen.

Die echte Navigation führt diese Schritte in `build.js` 10200–10220 und
10245–10255 aus. Das ist insbesondere bei `auto-fit` relevant: Ein Reveal
kann den notwendigen Zoom verändern. Wenn der Export nur `applyReveal()`
aufruft, können Beats mit falscher Schriftgröße oder falschem Overflow
gerendert werden. Ein nicht aktiver Chunk verliert außerdem über die
Audience-CSS unter anderem die Sichtbarkeit seines Backdrops.

Die Export-Schnittstelle sollte deshalb atomar etwas wie
`renderState(chunkIndex, runtimePosition)` anbieten. Dabei muss die
Indexdomäne ausdrücklich definiert werden:

```js
const n = countSegments(chunk);
const exportedStateCount = Math.max(1, n);
const runtimePositions = n === 0 ? [0] : [1, /* … */, n];
```

Ohne diese Sonderbehandlung erzeugt ein beatloser Chunk keine Seite, weil
`countSegments()` für ihn `0` liefert (`build.js` 9773–9781). Für
`--pdf-beats=final` ist entsprechend die Runtime-Position `n` zu verwenden,
bei `n === 0` die Position `0`.

### P1 – Der geplante `page.pdf()`-Aufruf reicht nicht für Audience-Treue

Der Plan nennt in Zeile 198 lediglich `page.pdf()` mit aktiviertem
Hintergrunddruck. Nach der offiziellen Playwright-Dokumentation gilt jedoch:

- `page.pdf()` verwendet standardmäßig das CSS-Medium `print`;
- Chromium verändert standardmäßig Farben für den Druck;
- CSS-`@page` hat ohne `preferCSSPageSize: true` keine Priorität vor den
  PDF-Optionen.

Quelle: [Playwright, `page.pdf()`](https://playwright.dev/docs/api/class-page#page-pdf)

Der Aufruf muss daher mindestens folgende Entscheidungen ausdrücklich
enthalten:

```js
await page.emulateMedia({ media: 'screen' });
await page.pdf({
  printBackground: true,
  preferCSSPageSize: true,
  // …
});
```

Alternativ müssen `width` und `height` direkt an `page.pdf()` übergeben
werden. Für farbliche Übereinstimmung gehört außerdem in das Export-CSS:

```css
html {
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
```

`--pdf-size=16:9|16:10` definiert bislang nur ein Verhältnis, aber keine
Viewport-Auflösung. Das reicht für diese Runtime nicht: `--slide-w` und
`--slide-h` stammen aus Pixelmaßen (`build.js` 5788–5793), und die
Basisschrift verwendet einen Pixel-Clamp (`build.js` 5954). 1280 × 720 und
1600 × 900 können daher trotz identischen Verhältnisses anders umbrechen.
Der CLI-Vertrag muss sowohl feste Browser-Viewports als auch die zugehörigen
physischen PDF-Maße festlegen.

### P1 – Die zugesagte Reproduzierbarkeit ist noch nicht erfüllt

Die bestehende Chrome-Suche verwendet absichtlich den neuesten gefundenen
Cache-Browser oder ein System-Chrome (`docs/site/shoot-lib.mjs` 22–66).
Browser-, Blink- und Skia-Version sind damit nicht festgelegt. Playwright
weist zudem darauf hin, dass die Verwendung eines beliebigen
`executablePath` anstelle des zu Playwright gehörenden Browsers nicht
garantiert ist.

Quelle: [Playwright, `executablePath`](https://playwright.dev/docs/api/class-browsertype#browser-type-launch-option-executable-path)

Der Plan erkennt außerdem selbst, dass automatische Silbentrennung von der
Umgebung abhängt. Chromium registriert die Trennwörterbücher als separat
installierbare beziehungsweise aktualisierbare Komponente:

[Chromium: `hyphenation_component_installer.cc`](https://chromium.googlesource.com/chromium/src/+/main/chrome/browser/component_updater/hyphenation_component_installer.cc)

Die in Zeile 291 vorgeschlagene Build-Zeit-Hyphenation taucht jedoch nicht
in den Umsetzungsschritten auf. Der Plan muss sich deshalb vor der Umsetzung
für einen Vertrag entscheiden:

- Renderer-Version und Hyphenation-Daten werden gepinnt beziehungsweise
  gebündelt; oder
- „reproduzierbar“ wird ausdrücklich auf denselben Browser und dieselbe
  Umgebung begrenzt, und Browser-Version sowie relevante Umgebungsdaten
  werden im Build-Log ausgegeben.

### P1 – Das geplante ID-Präfixen zerstört eingebettete SVG-Styles

Inline-SVGs erhalten bereits beim HTML-Build pro Instanz eine Root-ID. Ihre
eingebetteten Styles werden an genau diese ID gebunden:

```css
@scope (svg#psi-fig-…-root) { … }
```

Diese Konstruktion wird in `build.js` 315–340 erzeugt. Wenn der PDF-Export
beim Klonen die Root-ID erneut präfixt, aber im Stylesheet nur `url(#…)`
umschreibt, zeigt der `@scope`-Selektor weiterhin auf die alte ID. Das SVG
verliert dann seine eingebetteten Styles.

Die Liste in Plan-Zeilen 150–159 muss daher mindestens zusätzlich umfassen:

- CSS-ID-Selektoren einschließlich `@scope`,
- `for`, `headers`, `list` und `aria-controls`,
- SMIL-Referenzen wie `begin="element.click"`, sofern solche SVGs zugelassen
  bleiben.

Das Rewrite sollte als eine gemeinsame DOM-/CSS-basierte Operation
implementiert werden. Mehrere unabhängige Regex-Pässe würden leicht
unterschiedliche Referenzformen abdecken.

### P1 – Das CID-TrueType-Abnahmekriterium gilt nicht für alle erlaubten Fonts

Der Plan behandelt als Gegenmaßnahme nur die Instanzierung der gebündelten
variablen Fonts. Das Projekt erlaubt aber weiterhin:

- `fonts: none`,
- eigene WOFF-, WOFF2-, TTF- und OTF-Dateien,
- Zeichen außerhalb der gebündelten Latin-Subsets, die auf eine Systemschrift
  zurückfallen.

Gleichzeitig verlangt Abnahmekriterium 4 ausschließlich eingebettete
`CID TrueType`-Subsets. Chromium/Skia kann variable oder nicht direkt
einbettbare Fontdaten als Type 3 ausgeben. Das wird auch in einer Diskussion
mit einem Chromium-Entwickler beschrieben:

[Chromium Developers: PDF font names](https://groups.google.com/a/chromium.org/g/chromium-dev/c/O-a4sW3nLNo)

Der Plan muss definieren, ob der PDF-Export solche Konfigurationen
normalisiert, mit einer konkreten Fehlermeldung ablehnt oder das
Abnahmekriterium abschwächt. Zusätzlich sind eine Glyph-Coverage-Prüfung und
ein automatischer `pdffonts`-Test nötig. Nur die gebündelten Gewichte zu
instanzieren hält Systemfont-Fallbacks bei nicht-latinischen Zeichen nicht
aus dem PDF heraus.

### P2 – Interne Links auf Spalten-IDs benötigen eine eigene Abbildung

Die Dokumentation beschreibt die ID einer Spalte als Ziel interner
Cross-References. Im Audience-DOM liegt diese ID jedoch auf `.column`, während
die automatisch erzeugte Abschnittsfolie eine andere `data-chunk-id` wie
`foo-section` erhält (`build.js` 5413–5451 und 5468–5482).

Der PDF-Linkresolver braucht daher mindestens zwei getrennte Abbildungen:

- Chunk-ID → erste exportierte Zustandsseite des Chunks,
- Column-ID → erste exportierte Zustandsseite des generierten Dividers.

Nicht auflösbare Fragmentlinks müssen als Fehler oder mindestens konkrete
Warnung gemeldet werden. Der derzeitige Runtime-Resolver findet selbst nur
`data-chunk-id` (`build.js` 10232–10242); er kann daher nicht unverändert als
vollständige Linkauflösung übernommen werden.

### P2 – Die Video-Fallback-Policy besitzt noch keine Quelle

Der Plan priorisiert in Zeile 302 ein „vorhandenes Posterbild“. Der aktuelle
Renderer erzeugt jedoch `<video>` ohne `poster`, und die Markdown-Grammatik
bietet keinen Posterwert (`build.js` 1916–1932 und 1964–1968).

Vor der Umsetzung muss festgelegt werden:

- wie ein Autor ein Poster angibt,
- was genau ein „vorhandener statischer Fallback“ ist,
- wie lokale und externe Videos ohne Poster behandelt werden,
- ob das Fehlen eines erwarteten Posters warnt oder fehlschlägt.

Ohne diese Festlegung bleiben praktisch nur ein generischer Platzhalter und
der Dateiname.

### P2 – Abnahmekriterien und Testplan sind noch nicht deckungsgleich

In der Testsektion fehlen automatisierte Prüfungen für mehrere ausdrücklich
formulierte Abnahmekriterien:

- beide exakten Seitengrößen und Viewport-Geometrien,
- Screen-Medium und exakte Farben,
- `pdffonts` beziehungsweise das Verbot von Type 3,
- Overflow einschließlich Chunk-ID und Beat,
- fehlende Bilder, Browser und Fonts,
- Video- und Embed-Fallbacks,
- atomisches Schreiben bei einem Abbruch,
- CLI-Fehler und Kombinationen mit `--watch`, `--serve` und den
  `--*-only`-Optionen.

Mindestens die Fehlerpfade aus Abnahmekriterium 8 müssen als Integrationstests
auftauchen. Visuelle Tests allein erkennen weder falsche Fonttypen noch
defekte PDF-Linkannotationen oder falsche physische Seitenmaße zuverlässig.

### P2 – `playwright-core` ist derzeit nur Entwicklungsabhängigkeit

`playwright-core` steht in `package.json` 42–44 unter `devDependencies`. Der
geplante PDF-Export ist dagegen ein reguläres `build.js`-Feature.

Der Plan muss festlegen, ob `playwright-core`:

- eine normale oder optionale Laufzeitabhängigkeit wird; oder
- erst bei `--slides-pdf` dynamisch importiert wird und bei Fehlen eine
  konkrete Installationsanweisung ausgibt.

Ein statischer Import in `build.js` wäre falsch: Er könnte alle bisherigen
HTML-Builds auf Installationen ohne Development-Dependencies brechen und
damit Abnahmekriterium 9 verletzen.

## Empfohlene Änderungen am Plan vor der Implementierung

1. Die Export-API mit exakten Runtime-Positionen und vollständigem
   State-/Zoom-Settlement definieren.
2. Feste Viewport-Pixelmaße und physische PDF-Seitenmaße für 16:9 und 16:10
   festlegen.
3. `emulateMedia('screen')`, `preferCSSPageSize` beziehungsweise explizite
   PDF-Maße und `print-color-adjust: exact` verbindlich aufnehmen.
4. Den Reproduzierbarkeitsvertrag einschließlich Browser-Version,
   Hyphenation und Font-Fallbacks festlegen.
5. Den ID-Rewriter um CSS-Selektoren und alle unterstützten IDREF-Attribute
   erweitern.
6. Column- und Chunk-Linkziele getrennt modellieren.
7. Poster-/Medien-Syntax und Fallback-Verhalten definieren.
8. Font-, Seitenmaß-, Fehlerpfad- und Atomizitätstests ergänzen.
9. Die Laufzeitabhängigkeit von `playwright-core` und die erlaubten
   CLI-Kombinationen festlegen.

## Verifikationsumfang

Der Review wurde gegen den aktuellen Code in `build.js`,
`docs/site/shoot-lib.mjs`, `package.json` sowie gegen offizielle
Playwright- und Chromium-Quellen durchgeführt. Es wurden keine Projektdateien
außer dieser Review-Datei verändert.

Die im Plan genannten konkreten Messwerte von 46 Seiten und 1,4 MB wurden
nicht erneut gemessen, weil in diesem Checkout `playwright-core` nicht
installiert ist. Sie wurden daher nicht als Beleg für die Findings verwendet.
