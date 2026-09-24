# Plan: PDF-Foliensatz mit allen Beats

## Ziel

`psi-slides` soll neben den vier bestehenden HTML-Ansichten einen portablen
PDF-Foliensatz erzeugen können. Das PDF bildet die Audience-Ansicht ab: Jeder
Chunk ist mindestens eine PDF-Seite, und jeder weitere Präsentationszustand
des Chunks wird als zusätzliche Seite ausgegeben.

Der Export ist als Fallback für Räume gedacht, in denen die HTML-Präsentation
nicht verwendet werden kann, und als weitergebbarer klassischer Foliensatz.
Er ist ausdrücklich kein Ersatz für die dokumentartigen Ausgaben
`print.html` und `print-notes.html`.

## Festgelegtes Verhalten

- Der Ausgangszustand jedes Chunks wird exportiert.
- Danach wird jeder Beat als eigene, kumulative PDF-Seite exportiert.
- Text-Reveals, `::: draw`-Schritte, Backdrop-Frames und zeitversetzte
  Overlays verwenden dieselbe Reihenfolge und Zustandslogik wie die
  Audience-Ansicht.
- Automatisch erzeugte Abschnittsfolien sowie Titel- und Schlussfolie gehören
  zum PDF.
- Alle Beat-Seiten eines Chunks behalten dieselbe sichtbare Foliennummer.
- Animationen und Übergänge werden nicht aufgenommen; jeder Zustand wird
  fertig und ohne Tween gerendert.
- `autoplay cycle` wird genau einmal vom Ausgangszustand bis zum letzten Beat
  durchlaufen. Es entstehen keine wiederholten Seiten.
- Marginalia bleiben erhalten, weil sie regulärer Folieninhalt sind.

## Bewusst ausgeschlossene Inhalte

Folgende Inhalte und Bedienelemente erscheinen nicht im PDF:

- Expansion-Buttons und Expansion-Inhalte
- `+ note`, Annotationsboxen und lokal gespeicherte Annotationen
- Hilfe, Navigation, Suchoberfläche, Inhaltsverzeichnis-Overlay und sonstige
  Präsentations- oder Editor-Chrome
- Figure-Focus-Overlay und dessen Zoomzustand
- Link-QR-Buttons und das Link-/QR-Overlay
- Sprecheransicht und Speaker Notes

## Link-Policy

Normale Links bleiben als echte `<a href>`-Elemente erhalten. Chromium soll
daraus klickbare PDF-Linkannotationen erzeugen.

- Externe Links behalten ihren sichtbaren Linktext und ihr Ziel.
- Die URL wird nicht zusätzlich ausgeschrieben.
- Der QR-Button hinter einem externen Link wird entfernt, weil seine Aktion
  im statischen PDF nicht verfügbar ist.
- Das große Link-Overlay und der QR-Code werden nicht als zusätzliche
  PDF-Seiten exportiert.
- Interne Fragmentlinks werden auf den ersten exportierten Zustand des
  jeweiligen Ziel-Chunks umgeschrieben.
- Bereits als Text dargestellte URLs, etwa der bestehende Fallback unter
  einem Embed, bleiben unverändert sichtbar.
- Ein URL-Anhang oder eine Option zum Ausschreiben aller Ziele gehört nicht
  zur ersten Version.

Damit sind Links in einem digital gelesenen PDF nutzbar. In einem Ausdruck
sind hinter Text versteckte Ziele nicht erreichbar; diese Einschränkung ist
für die erste Version akzeptiert.

## Vorgesehene CLI

Minimaler Aufruf:

```console
node build.js lectures/foo/source.md --slides-pdf
```

Ausgabe:

```text
lectures/foo/slides.pdf
```

Vorgesehene Optionen:

```console
--pdf-beats=all|final
--pdf-size=16:9|16:10
--pdf-theme=<theme>
```

Standards:

- `--pdf-beats=all`
- `--pdf-size=16:9`
- Theme, Schrift und übrige Darstellungsoptionen stammen aus den
  Lecture-Einstellungen beziehungsweise ihren festen eingebauten Defaults.
  Der Export übernimmt keine Werte aus `localStorage` und ist dadurch
  reproduzierbar.

`--pdf-beats=final` ist eine optionale Kurzform, die nur den vollständig
aufgebauten Zustand jedes Chunks ausgibt. Der primäre Fallback-Foliensatz
verwendet `all`.

## Technische Architektur

### 1. Audience-Ansicht als Rendering-Quelle

Das PDF wird aus `audience.html` erzeugt, nicht aus `print.html`. Nur die
Audience-Ansicht besitzt die feste Foliengeometrie sowie die tatsächliche
Reihenfolge aller Präsentations-Beats.

Die bestehende Runtime bleibt die einzige Definition dieser Reihenfolge:

- `chunkBeats(el)` ordnet Text-Reveals und Diagrammschritte in
  Dokumentreihenfolge.
- `countSegments(el)` ergänzt Backdrop-Frames und Overlays.
- `applyReveal(el, id, instant)` materialisiert einen beliebigen Zustand.
- `dgStep` beziehungsweise `dgRenderInto` schreiben den gewählten
  Diagrammzustand in das SVG.

Der Export darf diese Regeln nicht in einem zweiten Node-Renderer
nachimplementieren.

### 2. Kleine interne Export-Schnittstelle

Die Audience-Runtime erhält eine nicht sichtbare, gezielt begrenzte
Schnittstelle für den Headless-Export. Sie soll mindestens können:

1. alle Chunks in Präsentationsreihenfolge auflisten,
2. die Anzahl ihrer Zustände liefern,
3. einen bestimmten Chunk und Zustand unmittelbar und ohne Animation
   anwenden,
4. signalisieren, wann Layout, Fonts und Bilder stabil sind.

Der Export soll Zustände direkt setzen und nicht Tastendrücke simulieren.
Dadurch hängen Ergebnis und Laufzeit weder von Navigationstiming noch von
Autoplay oder gespeicherten Zuständen ab.

### 3. Einen bereinigten Klon je Zustand erzeugen

Für jeden Chunk gilt:

1. Ausgangszustand beziehungsweise gewünschten Beat mit `instant` anwenden.
2. Zwei `requestAnimationFrame`-Runden und gegebenenfalls ausstehende
   Bilddekodierung abwarten.
3. Den vollständig gerenderten Chunk klonen. Die aktuellen Attribute und
   Geometrien eines `::: draw`-SVG sind dadurch bereits im Klon enthalten.
4. Alle ausgeschlossenen Inhalte und Steuerelemente aus dem Klon entfernen.
5. Zustands-Payloads und nicht mehr benötigte Runtime-Skripte entfernen.

Der Klon zeigt damit ohne weitere Interaktion exakt diesen einen
Präsentationszustand.

### 4. IDs und Referenzen isolieren

Da derselbe Chunk mehrfach im Druck-DOM vorkommt, erhält jede Seite einen
eigenen Präfix. Umzuschreiben sind mindestens:

- HTML- und SVG-`id`-Attribute
- `href="#…"` und `xlink:href="#…"`
- `url(#…)` in Attributen und eingebetteten Styles
- `aria-labelledby` und `aria-describedby`
- weitere bekannte ID-Referenzen in inlinierten SVG-Assets

Interne Lecture-Links sind davon getrennt zu behandeln: Sie sollen auf den
Seitenanker des ersten Zustands des Ziel-Chunks zeigen und nicht auf eine
zufällig umbenannte interne Element-ID.

### 5. Ein gemeinsames Druck-DOM

Alle Zustandsklone werden in ein einziges lineares Druck-DOM eingesetzt.
Jeder Klon liegt in einem Wrapper, der genau eine PDF-Seite einnimmt.

Das PDF-spezifische Stylesheet legt fest:

- feste Seitengröße und Seitenverhältnis,
- keine Ränder,
- genau einen Seitenumbruch nach jedem Zustandswrapper,
- vollständigen Hintergrunddruck,
- deaktivierte Transitionen und Animationen,
- keine Audience-Chrome,
- dieselben CSS-Variablen und dieselbe Typografie wie im gewählten Theme.

Das gesamte Dokument wird in einem Durchgang gedruckt. Einzelne Einseiten-
PDFs mit anschließendem Zusammenführen werden vermieden, weil dabei Fonts
und andere Ressourcen pro Seite dupliziert werden könnten.

### 6. Chromium-Export

Ein Exportmodul verwendet das bereits vorhandene `playwright-core` und die
bestehende Chrome-Suche aus `docs/site/shoot-lib.mjs`.

Ablauf:

1. Falls nötig `audience.html` bauen.
2. Einen temporären Loopback-Server starten.
3. Einen frischen Browser-Kontext ohne persistente Daten und mit der
   gewählten Viewport-Geometrie öffnen.
4. `audience.html` laden und `document.fonts.ready`, Bilder und Diagramm-
   Initialisierung abwarten.
5. Über die Export-Schnittstelle das gemeinsame Druck-DOM erzeugen.
6. Mit `page.pdf()` und aktiviertem Hintergrunddruck `slides.pdf` schreiben.
7. Browser, Server und temporäre Dateien auch bei Fehlern zuverlässig
   schließen.

Es wird kein Chromium-Binary gebündelt. Wie bei den bestehenden Screenshot-
Werkzeugen wird ein Playwright-Browsercache, ein System-Chrome oder ein über
`PSI_CHROME` gesetzter Pfad verwendet.

## Medien und weitere Sonderfälle

### Videos

Ein PDF kann ein Video nicht abspielen. Exportiert wird, in dieser
Prioritätsreihenfolge:

1. vorhandenes Posterbild,
2. vorhandener statischer Fallback,
3. eine ruhige Platzhalterfläche mit Titel beziehungsweise Dateiname.

Das Abgreifen eines zufälligen aktuellen Videoframes ist nicht
reproduzierbar und deshalb nicht Teil des Exports.

### Externe Embeds

Iframes werden nicht als Live-Inhalt in das PDF übernommen. Stattdessen wird
der bereits vorhandene statische Embed-Fallback einschließlich Link
verwendet. Der Export darf nicht davon abhängen, dass ein externer Anbieter
im Build-Moment erreichbar ist.

### Externe Bilder

Für einen portablen Foliensatz soll der Export nach Möglichkeit mit
inlinierten Bildern bauen. Bleibt eine externe Ressource absichtlich extern,
muss ihr Fehlschlag sichtbar gemeldet werden; ein stilles leeres Feld ist
kein erfolgreicher Export.

### Überlange Folien

Der PDF-Export verwendet die feste Audience-Geometrie. Er erfindet keinen
zweiten Layoutmodus und teilt einen Chunk nicht auf mehrere Seiten. Läuft ein
Chunk bei den festgelegten Viewer-Einstellungen über, soll der Export mit
Chunk-ID und Beat melden, welcher Zustand nicht in die Seite passt. Eine
spätere Option für explizites Auto-Fit kann darauf aufbauen, gehört aber
nicht stillschweigend zum Standard.

## Umsetzungsschritte

1. CLI-Vertrag, Standardwerte, gegenseitige Ausschlüsse und Fehlertexte in
   `build.js` ergänzen.
2. Gemeinsame Chrome-Suche aus dem Site-Screenshot-Code an einen neutralen
   Ort verschieben oder ohne Duplikation wiederverwenden.
3. Interne Audience-Export-Schnittstelle implementieren.
4. Zustandsenumeration auf Basis von `countSegments` implementieren.
5. Bereinigung für Expansions, Annotationen, Link-UI und sonstige Chrome
   implementieren.
6. Robustes Präfixen aller IDs und Referenzen implementieren.
7. Interne Lecture-Links auf die erste Zielseite umschreiben.
8. PDF-Seitencontainer und Export-CSS implementieren.
9. Headless-Chromium-Aufruf und atomisches Schreiben von `slides.pdf`
   implementieren.
10. Medien-Fallbacks und verständliche Warnungen ergänzen.
11. Tests und Fixture-Deck ergänzen.
12. CLI-Hilfe, README, Tutorial, Vergleichsdokument und Changelog
    aktualisieren.

## Tests

### Zustands- und Seitentests

Ein kleines Fixture kombiniert in mehreren Chunks:

- mehrere Text-Reveal-Segmente,
- ein `::: draw` mit mehreren Schritten,
- ein Diagramm innerhalb eines Reveal-Segments,
- einen Backdrop, der Beats mitbenutzt,
- ein Overlay mit `from`,
- einen beatlosen Chunk,
- Titel, Abschnittsdivider und Schlussfolie.

Geprüft werden:

- erwartete Gesamtseitenzahl,
- genau eine Ausgangsseite pro Chunk,
- richtige kumulative Reihenfolge,
- keine leeren oder doppelt gezählten Zustände,
- `final` erzeugt genau eine Seite pro Chunk.

### Bereinigungstests

Das Export-DOM darf keine der folgenden Elemente enthalten:

- `.exps`
- `.exp-chev`
- `.exp-body`
- `.annot-box`
- `.annot-add`
- `.link-code`
- `#link-overlay`
- Hilfe-, Such-, TOC-, Navigations- oder Editor-Chrome

### Linktests

- Ein externer Link bleibt ein `<a>` mit unverändertem Ziel.
- Sein QR-Button fehlt.
- Ein interner Link zeigt auf den ersten Zustand des Ziel-Chunks.
- Kein Link zeigt nach dem Präfixen auf eine nicht vorhandene ID.
- Mindestens ein Integrationstest prüft, dass Chromium im PDF eine externe
  Linkannotation erzeugt.

### SVG- und ID-Tests

- Alle IDs im gemeinsamen Druck-DOM sind eindeutig.
- Alle lokalen `url(#…)`- und `href="#…"`-Referenzen lösen auf.
- Mehrere Beat-Klone desselben `::: draw` beeinflussen einander nicht.
- Inlinierte SVG-Assets mit eigenen Definitionen bleiben vollständig.

### Visuelle Tests

Für ausgewählte Zustände wird der PDF-Seitenrender mit einem Screenshot der
Audience-Ansicht bei identischer Viewportgröße verglichen. Der Vergleich
muss mindestens helle und dunkle Themes, Code, ein Diagramm, ein Backdrop
und ein Bild abdecken.

## Abnahmekriterien

Die erste Version ist fertig, wenn:

1. ein dokumentiertes Kommando aus einer Lecture reproduzierbar
   `slides.pdf` erzeugt,
2. jeder Chunk und jeder seiner Präsentationszustände in richtiger
   Reihenfolge genau einmal enthalten ist,
3. die Seiten visuell der Audience-Ansicht entsprechen,
4. Text, Code und `::: draw` im PDF vektorbasiert bleiben,
5. Expansions, Annotationen und interaktive Chrome vollständig fehlen,
6. externe Links klickbar bleiben und interne Links auf das richtige
   PDF-Ziel führen,
7. der Export offline mit lokalen/inlinierten Ressourcen funktioniert,
8. fehlende Browser, Ressourcen oder überlaufende Zustände mit konkreten
   Handlungsanweisungen statt mit stillen Defekten gemeldet werden und
9. die bestehenden vier HTML-Ausgaben ohne angeforderten PDF-Export
   unverändert bleiben.

