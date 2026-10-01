# Review v3: `PLAN-slide-pdf-export.md`

## Ergebnis

Die dritte Fassung löst alle sechs Findings aus Review v2 inhaltlich. Die
Exportarchitektur selbst ist damit schlüssig: Druck-DOM und Root-Overflow sind
festgelegt, Netzwerkzugriffe werden vor dem Laden abgefangen, Auto-Fit hat
einen eindeutigen Vertrag, alle fünf lokalen Lectures sind in der Abnahme
enthalten und der Betrieb ohne `playwright-core` ist realistisch formuliert.

Ganz implementierungsreif ist der Plan dennoch noch nicht. Es bleiben fünf
P2-Findings im Testvertrag: Die neue Spec passt weder mit ihrem Pfad noch mit
ihrem Lebenszyklus in den vorhandenen Runner, das Fixture würde generierte
Dateien im Worktree hinterlassen, die PDF-Prüfung ist zu fragil, der
öffentliche `16:10`-Zweig bleibt ungeprüft und mehrere zugesagte
Fehlerdiagnosen haben keine Testfälle. Dazu kommt eine widersprüchliche
Formulierung der Offline-Zusage als P3.

Es gibt keinen neuen Architektur- oder Rendering-Blocker. Nach Korrektur der
folgenden Test- und Abnahmefestlegungen ist der Plan implementierungsbereit.

## Findings

### P2 – Die PDF-Spec mit ihrem tatsächlichen Pfad und Runner-Vertrag verdrahten

Der Plan legt die neue Spec unter `test/specs/pdf-export.mjs` ab
(`PLAN-slide-pdf-export.md` 694–699), verlangt aber zugleich den Eintrag
`'./pdf-export.mjs'` in `SPECS` (`PLAN-slide-pdf-export.md` 701–707). Da die
Imports relativ zu `test/run.mjs` aufgelöst werden, bezeichnet dieser Eintrag
`test/pdf-export.mjs`, nicht die geplante Datei unter `test/specs/`.

Auch der Lebenszyklus des Runners passt noch nicht zu einer eigenständig
exportierenden Spec. `test/run.mjs` baut für jede Spec zwingend
`buildLecture(s.lecture)` auf und startet dafür einen HTTP-Server
(`test/run.mjs` 58–67). Danach öffnet es für jede Spec zunächst eine normale
Deck-Seite mit `openDeck()` (`test/run.mjs` 70–75). Ein zusätzliches
`buildSource()` im Harness verbindet das Fixture mit keinem dieser Schritte;
der Runner ruft es nicht auf und kennt weder einen Fixture-Pfad noch einen
Standalone-Modus.

Der Plan muss einen durchgängigen Vertrag festlegen. Die kleinste Änderung
wäre, die Spec als `test/pdf-export.mjs` anzulegen und den Runner um ein
explizites Feld wie `source` oder `standalone` zu erweitern, über das er den
Fixture-Build und den abweichenden Browser-/Server-Lebenszyklus auswählt. Eine
separate, ausdrücklich in `npm test` eingebundene Testdatei wäre ebenfalls
möglich. Nur Dateiname, `SPECS`-Eintrag und `buildSource()` nebeneinander zu
nennen reicht nicht.

### P2 – Das Fixture darf den Worktree nicht mit Build-Artefakten verschmutzen

Das geplante `buildSource(relPath, flags)` baut
`test/fixtures/pdf-beats/source.md` direkt an seinem Repository-Pfad
(`PLAN-slide-pdf-export.md` 708–716). `build.js` schreibt seine Ausgaben in
das Verzeichnis der Quelldatei. Damit entstehen neben dem Fixture mindestens
HTML-Ansichten und beim Export `slides.pdf`.

Diese Pfade werden von `.gitignore` nicht erfasst: Die vorhandenen Regeln
decken generierte Ansichten nur unter `lectures/*` und
`docs/site/example/*` ab. Ein erfolgreicher oder abgebrochener Testlauf würde
daher unversionierte Dateien unter `test/fixtures/pdf-beats/` hinterlassen.
Die zugesagte Prüfung, dass ein Abbruch weder `slides.pdf` noch `.tmp`
hinterlässt, beseitigt die übrigen Build-Ausgaben ebenfalls nicht.

Der Plan sollte das Fixture für jeden Lauf in ein temporäres Verzeichnis
kopieren und dort bauen. Alternativ muss ein `finally`-Block sämtliche
erzeugten Dateien vollständig entfernen. Die Temp-Variante ist robuster und
verhindert zugleich, dass parallele oder abgebrochene Läufe einander
beeinflussen.

### P2 – Seitenzahl und MediaBox nicht über den ersten beliebigen Regex-Treffer lesen

Die obligatorische Dateiprüfung liest den ersten Treffer von `/Count` und
`/MediaBox` aus dem PDF und dereferenziert beide Regex-Ergebnisse unmittelbar
(`PLAN-slide-pdf-export.md` 761–776):

```js
const pages = Number(/\/Count (\d+)/.exec(pdf)[1]);
const box = /\/MediaBox\s*\[([^\]]+)\]/.exec(pdf)[1]
  .trim().split(/\s+/).map(Number);
```

`/Count` ist nur im Kontext eines `/Type /Pages`-Objekts die gesuchte
Gesamtseitenzahl; der erste gleichnamige Eintrag ist kein belastbarer Vertrag.
Außerdem wirft der Code bei einer veränderten Chromium-Serialisierung oder
komprimierten Objekten lediglich einen unverständlichen Nullzugriff. Die im
Plan genannte Einzelmessung mit Chromium und PDF 1.4 garantiert dieses Format
nicht für alle Browser, die `findChrome()` aus Playwright-Cache oder
Systeminstallation auswählt.

Der Plan muss entweder einen kleinen PDF-Parser als Testabhängigkeit vorsehen
oder die minimale Eigenprüfung ausdrücklich am Pages-Katalog verankern und
für fehlende beziehungsweise nicht unterstützte Strukturen eine
aussagekräftige Fehlermeldung ausgeben. Dasselbe gilt für die MediaBox der
tatsächlich geprüften Seiten. Ein ungeprüfter erster Regex-Treffer ist für die
laut Plan wichtigste Datei-Assertion zu fragil.

### P2 – Auch den öffentlichen `16:10`-Zweig testen

Die CLI bietet `--pdf-size=16:9|16:10` als öffentlichen Vertrag an
(`PLAN-slide-pdf-export.md` 162–166). Die geplanten Geometrie-Assertions
prüfen jedoch nur `1600 × 900` im DOM und `1200 × 675` in der PDF-Datei
(`PLAN-slide-pdf-export.md` 753–776). Damit bleibt die zweite Option samt
CSS-Variablen, Viewport und PDF-Seitenformat ungetestet.

Die Spec sollte einen zweiten, kleinen Exportlauf mit `--pdf-size=16:10`
enthalten und mindestens `1600 × 1000` für `.pdf-page` sowie `1200 × 750`
Punkt für die PDF-Seite assertieren. Dafür ist kein zweites vollständiges
Fixture nötig.

### P2 – Die zugesagten Fehlerdiagnosen mit tatsächlichen Fällen abdecken

Der Plan beschreibt das Fixture als absichtlich problematisch und nennt in
Abnahmekriterium 8 vier Diagnoseklassen: fehlender Browser, nicht geladene
Bilder, unauflösbare Fragmente und Overflow (`PLAN-slide-pdf-export.md`
823–825). In der konkreten Fixture-Liste stehen aber nur gültige interne
Links auf einen Chunk und eine Spalten-ID (`PLAN-slide-pdf-export.md`
718–728). Die Assertions decken nur Overflow ab; ein defektes Bild, ein
toter Fragmentlink und ein fehlender Browser werden nicht erzeugt oder
geprüft.

Der Plan sollte die Fixture-Liste um einen bewusst unauflösbaren Fragmentlink
und eine defekte lokale Bildquelle ergänzen und die jeweilige Meldung
assertieren. Der fehlende Browser braucht einen separaten, browserlosen Test
des Such-/Fehlerpfads, etwa mit kontrollierter Umgebung oder injizierter
Browserauflösung.

Zugleich ist Abnahmekriterium 8 zu präzisieren: Vor dem Browserstart existiert
weder geladenes Deck noch Chunk-Kontext. Eine Meldung für einen fehlenden
Browser kann deshalb sinnvollerweise Browser-Suchorte und nächsten Schritt,
aber keine Chunk-ID nennen. Chunk-ID und gegebenenfalls Beat gehören nur zu
den inhaltlichen Fehlern nach dem Laden.

### P3 – Die Offline-Zusage passend zum Routing formulieren

Der Offline-Test erwartet, dass das Vimeo-Fixture genau einen geblockten
Origin meldet (`PLAN-slide-pdf-export.md` 781–784). Dafür muss der Browser
einen HTTP(S)-Request zunächst erzeugen, den das vor `page.goto()`
installierte Routing dann abfängt und abbricht. Abnahmekriterium 7 behauptet
dagegen, der Export setze „keinen HTTP-Request ab“
(`PLAN-slide-pdf-export.md` 820–822).

Beides kann nicht wörtlich zugleich gelten. Der Vertrag sollte lauten, dass
kein HTTP(S)-Request das Netzwerk erreicht und jeder entsprechende Versuch
vor dem Transport abgefangen und abgebrochen wird. Dann belegt der geplante
Origin-Zähler genau die formulierte Eigenschaft.

## Empfohlene Änderungen vor der Implementierung

1. Pfad und Ausführungsmodell der PDF-Spec an `test/run.mjs` anbinden oder
   einen separaten, von `npm test` aufgerufenen Runner festlegen.
2. Das Fixture in einem temporären Verzeichnis bauen oder alle erzeugten
   Artefakte garantiert und vollständig aufräumen.
3. Seitenbaum und Seitengröße robust aus dem PDF lesen und verständliche
   Parserfehler liefern.
4. Einen `16:10`-Export mit DOM- und PDF-Maßen ergänzen.
5. Tote Fragmente, nicht geladene Bilder und den Missing-Browser-Pfad mit
   konkreten Testfällen und passenden Diagnoseverträgen versehen.
6. „Kein Request erreicht das Netzwerk“ statt „kein Request wird abgesetzt“
   als Offline-Kriterium verwenden.

## Verifikationsumfang

Der Review wurde gegen die dritte Fassung von
`PLAN-slide-pdf-export.md` sowie die relevanten Stellen in `build.js`,
`test/run.mjs`, `test/harness.mjs`, `.gitignore` und der vorhandenen
Teststruktur durchgeführt. Dabei wurden ausdrücklich auch alle sechs Punkte
aus `REVIEW-slide-pdf-export-v2.md` erneut geprüft; sie sind in der neuen
Planfassung inhaltlich gelöst.

Es wurden keine Implementierungsdateien, bestehenden Reviews oder der Plan
verändert. Neu hinzugekommen ist ausschließlich dieses Review-v3-Dokument.
