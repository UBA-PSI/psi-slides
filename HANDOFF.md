# Handoff – nächste Session: Overview + TOC + Fulltext-Suche

Stand nach Commit `8d64de2` plus der wlab01-Retire- und HANDOFF-Commits. Der Phase-1-Build emittiert jetzt `audience.html` + `print.html` aus einer einzigen `source.md`. Die handgeschriebene `lectures/wlab01/lecture.html` ist retired; `phase0/lecture.html` bleibt als Referenz-Artefakt stehen, wird aber nicht mehr gepflegt.

## Auftrag

Erweitere `build.js` um drei Live-Navigation-Primitive aus PRD §5, die in der letzten Session explizit auf diesen Slice verschoben wurden:

1. **Overview (`O`)** – Birds-eye-Ansicht der gesamten Lecture. Click-to-select (dicker Rand, keine Kamera-Bewegung), zweites `O` oder `Enter` landet auf dem ausgewählten Chunk. `Esc` dismissed ohne Move. Drag-to-pan, wheel-to-zoom-distance.
2. **TOC overlay (`T`)** – fixes Seitenpanel, flache Liste der Column-Headings. `Enter` springt zum ersten Chunk dieser Column. Keine Chunk-Ebene – das ist bewusst flach.
3. **Fulltext-Suche (`/` im Overview)** – live filtert die Chunks auf Treffer in Body, Heading oder Expansion-Text. Non-matches dimmen, Matches highlighten. `Enter` committet den ersten Treffer als Selection.

Die drei sind eng verwandt: Overview ist die Stage-Transformation, TOC und Fulltext sind Overlays/Modes *auf* Overview. Saubere Reihenfolge: Overview zuerst, dann TOC, dann Fulltext.

## Wo der Vorgänger stand

- `PRD.md §5` ist die Spec, besonders der Abschnitt "**Overview (`O`)**" und "**TOC overlay (`T`)**".
- `build.js` hat einen funktionierenden Audience-Renderer und Runtime. Das Keyboard-Dispatch in `document.addEventListener('keydown', ...)` ist der Punkt, an dem `O`, `T`, `/` ankommen. Stage-Transformation läuft über CSS-`transform` auf `#stage` – Overview ist *auch* eine Stage-Transform, nur mit `scale()` dazu.
- `phase0/lecture.html` hat eine voll funktionsfähige Overview-Implementierung (Zeilen ~667–1000). **Referenz, nicht portieren** – das Design-Vocabulary lebt in PRD §5, der Code soll das dort lesen, nicht phase0 kopieren.
- `lectures/wlab01/audience.html` und `lectures/demo/audience.html` sind die Smoke-Test-Grundlagen. Beide werden automatisch bei jedem `node build.js <source>` regeneriert; sie sind via `.gitignore` aus der History raus.

## Konkrete Sub-Aufgaben in sinnvoller Reihenfolge

1. **Overview-Mode aktivieren.** `O` toggelt `body.overview-mode`. CSS-Regel: in dem Mode setzt der JS-Runtime die Stage auf `transform: translate(…) scale(--overview-scale)` statt centered-chunk. Alle Chunks gleich sichtbar (`.chunk { opacity: 1 }`), keine Chevrons, keine `+ note`. Drag-to-pan via Pointer-Events auf `#stage-viewport`. Wheel ändert `--overview-scale`.
2. **Click-to-select.** Im Overview-Mode setzt ein Click auf eine `.chunk` `selectedIdx`, visualisiert als `outline: 2px solid --accent`. Zweites `O` oder `Enter` dismissed Overview und lässt Kamera auf `selectedIdx` landen. `Esc` dismissed ohne Move.
3. **TOC-Overlay.** Separate Slash-Aufgabe, aber parallel denkbar. Fixed-position-Panel rechts (`#toc`), DOM-Source ist der gleiche `flatChunks`-List aber gefiltert auf `firstInCol`. `T` toggelt das Panel. Keine Overview-Abhängigkeit.
4. **Fulltext-Suche.** Nur im Overview-Mode. `/` fokussiert ein Such-Input im `#overview-badge` (oder einem eigenen Overlay). Jedes Keystroke filtert Chunks: hat der Text (lowercase) die Query als Substring? Treffer: `outline: 2px solid --accent-warm`. Non-Treffer: `opacity: 0.1`. `Enter` committet ersten Treffer.
5. **Shortcuts-Overlay aktualisieren.** `O`, `T`, `/` im `#hints`-Block mit aufnehmen.

## Entscheidungen, die vor Codezeile 1 zu klären sind

Dem User vor dem Start stellen:

1. **Overview-Scale-Default**: PRD §5 sagt nichts Konkretes; phase0 hatte `0.28`. Behalten oder dynamisch (fit-all-columns)?
2. **TOC-Position**: PRD §5 sagt "fixed side panel" ohne Seite festzulegen. Rechts ist konventionell, links wäre näher am Annotation-Slot. Recommend: rechts.
3. **Fulltext-Input-UI**: inline im Overview-Badge (minimal), oder eigenes Overlay mit dedizierter Eingabe-Box? Recommend: inline, keeps the mode-indicator kompakt.

## Nicht-Ziele dieser Session

- `speaker.html` und BroadcastChannel
- `::: sketch` live-editing
- KaTeX-Build-Time-Rendering (runtime via CDN bleibt erstmal)
- Image shorthand (`![](fig-id)`)
- Linter
- `--watch`
- `--new` Scaffold
- Camera-Refinement für expanded Chunks (separates kleines Thema, eigener Commit später)
- In-Chunk-Scroll via Wheel (phase0 hatte das; deferred bis es weh tut)
- Margin-Notes ins linke Lane positionieren (aktuell inline-unten; PRD §7.1 beschreibt das ausführlicher, wenn wir es dann aufnehmen)

## Zum Arbeitsstil

- Wir sind per du.
- Keine em-dashes im Output – en-dashes (`–`) oder `&ndash;`. Harte User-Präferenz, siehe auto-memory.
- Keine Zeit- oder Datumsschätzungen in Task-Files (global CLAUDE.md).
- Commits einzeln, fokussiert, mit erklärendem Body.
- Explanatory output style: Vor und nach Code-Edits einen `★ Insight ─────` Block mit 2-3 Punkten.
- User ist Fast. Drei Entscheidungen oben kurz klären, dann los.

## Start-Ritual

1. `git log --oneline -10` lesen – die letzten Commits sind der Kontext.
2. `PRD.md §5` (Camera and navigation) komplett überfliegen, besonders Overview und TOC.
3. `build.js` aktuellen Runtime durchlesen: `focusCamera`, `jumpTo`, das Keyboard-Switch.
4. `phase0/lecture.html` Zeilen ~907–980 (Overview-Camera) als Muster, aber aus der PRD begründen.
5. Drei offene Entscheidungen klären, dann mit Sub-Aufgabe 1 (Overview-Mode aktivieren) beginnen.
