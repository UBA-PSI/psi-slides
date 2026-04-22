# Handoff – Content-Fidelity Slice (shiki + images + layouts)

Stand nach dem Content-Fidelity-Slice + Polish-Pass. Was der letzte HANDOFF als *Empfehlung A / C* skizziert hatte (Code-Highlighting, Image-Shorthand, Mermaid) ist zu großen Teilen umgesetzt: **shiki** läuft build-time und färbt alle Code-Fences ein, **Image-Shorthand `![](fig-id)`** löst gegen `assets/fig-id.{svg,png,jpg,…}` auf, und das **Layout-Vokabular** ist um drei Primitive erweitert – `::: cols N`, `::: side / ::: flip`, `::: marginalia` – plus **zweizeilige Action-Titles** (`|` im Heading) und **Klick-zum-Fokussieren** für Figures/Code/Marginalia. `python-intro` ist mit all dem als Lecture-Script neu geschrieben.

Nach dem Bau-Slice sind drei kleinere UX-Korrekturen gelandet (siehe §Polish-Pass unten): Focus-Overlay hat jetzt solid-paper Background, Text-Selection ist in den Live-Views unterdrückt, und das Marginalia-Vokabular ist in `python-intro` zugunsten von Expandables reduziert (2 Marginalia → 2 Expandables, plus 6 neue Expandables).

## Was in diesem Slice gebaut wurde

### 1. Shiki-Highlighting (build-time)

- Neue Dep: `shiki@latest` (devDep-ähnlich, aber als regular Dep, da zur Laufzeit des Builds gebraucht). Singleton-Highlighter (`createHighlighter({ themes: ['github-light'], langs: [...] })`), in `main()` einmalig initialisiert und über `--watch`-Rebuilds hinweg gecached.
- Unterstützte Sprachen: `python`, `bash`, `shell`, `javascript`, `typescript`, `html`, `css`, `json`, `yaml`, `markdown`, `sql`, `toml`, `diff`, `text`. Alias-Map für `py → python`, `sh/zsh → bash`, `js → javascript`, `ts → typescript`, `md → markdown`. Unbekannte Sprache fällt auf `text` zurück; keine Sprache → Plain-Block.
- `marked.use({ renderer: { code, image } })` mit *positional*-args (nicht Token-Object) – marked v12 callt `renderer.code(code, infostring, escaped)` und `renderer.image(href, title, text)` trotz Token-basiertem internem Parsing. **Vorsicht-Fallstrick**: schrieb zuerst `code({ text, lang })` und bekam 0 Shiki-Blocks, weil die Destructure gegen undefined lief.
- Shiki's output ist `<pre class="shiki github-light" style="background-color:#fff;…">` mit inline-colored Spans. CSS overridet Background auf transparent (damit das Slide-Paper durchkommt) und scoped Line-Display explicit auf `inline` (shiki inkludiert `\n`-Textnodes zwischen `<span class="line">` – mit `white-space:pre` reichen diese bereits als Linebreak; `.line { display: block }` hätte den Abstand verdoppelt).

### 2. Image-Shorthand mit Auto-Resolver

- `![alt](fig-id)` – ohne Slash, ohne Extension – löst gegen `<source-dir>/assets/<fig-id>.<ext>` auf. Probiert Reihenfolge: `svg, png, jpg, jpeg, gif, webp`. Erste-Datei-gewinnt. Resolver ist per-lecture-gescoped über die Module-Variable `currentSourceDir`, die `buildOnce()` vor dem Parse setzt. Ein kleiner Cache (`imgResolveCache`) vermeidet redundante fs-stats über die drei Renderer hinweg.
- Output: `<figure class="figure-img" data-fig-id="..."><img src="assets/...svg" alt="..." loading="lazy"><figcaption>alt</figcaption></figure>`.
- Alt-Text wird sowohl als `alt`-Attribut als auch als `<figcaption>` emittiert (nur wenn non-empty). Schlägt das Lookup fehl, landet eine sichtbare Platzhalter-Box im Slide: `missing: assets/<id>.(svg|png|jpg|…)` mit dashed-red Border – Autor sieht den Bug beim nächsten Save.
- URLs mit `/` oder `.ext` werden unverändert durchgereicht (backward-kompatibel).

### 3. Layout-Primitives – `cols`, `side`, `marginalia`

Drei neue Inline-Layout-Directives, *orthogonal* zu den bestehenden `::: expand` / `::: margin` (die ja als separate Nodes aus dem Body extrahiert werden). Layout-Directives werden **im Body** als `<div>`/`<aside>`-Wrapper gerendert und tragen ihre Semantik via CSS-Klasse, damit `marked`'s html_block-Passthrough das umgebende Markdown korrekt parst.

- **`::: cols 2` / `::: cols 3`** → `<div class="cols cols-2">` bzw. `cols-3` mit CSS `column-count`. Typischer Use: zwei oder drei kurze Absätze automatisch in N Spalten flowen lassen (Balanced). Für Content-Heavy-Slides wo der Prose-Fluss natürlicher in Parallel-Streams läuft als vertikal.
- **`::: side` … `::: flip` … `:::`** → `<div class="split"><div class="split-a">…</div><div class="split-b">…</div></div>` – zwei Grid-Panes, 1fr 1fr. `::: flip` ist der Panel-Separator *innerhalb* eines `::: side`. Typischer Use: Figur links / Text rechts, oder intro-Prosa + Code-Block.
- **`::: marginalia` … `:::`** → `<aside class="marginalia">` absolutely positioniert auf `left: calc(100% + 2vw)` relativ zu `.chunk-content`. Extends in die rechte Slide-Margin hinein. Typischer Use: kurze Seiten-Bemerkung, die räumlich getrennt von der Hauptprosa ist (Pfitzmann-Style Marginalia).
- **Bare `:::`** schließt die *innerste* offene Struktur – das ist pro-chunk ein stack aus `layoutStack` plus dem älteren `currentExpansion`-Single-Slot. Layout-Stack wird beim `flushChunk` defensiv leergeräumt; der Linter meldet `unclosed-directive` separat.
- Layout-Directives können *in* einer `::: expand` stehen (greifen auf `currentExpansion.lines` via einer target-Funktion zu), aber nicht umgekehrt (eine `::: expand` im `::: cols` wäre parserseitig möglich, ist aber pedagogisch nicht gemeint und vom Linter nicht validiert).

### 4. Figure-Focus / Marginalia-Pan

- **Klick auf `<figure.figure-img>`, `<pre>` (Code-Block) oder `.marginalia`** *im aktiven Chunk* triggert Fokus-Mode. Figures und Pre-Blocks landen in `#figure-overlay` – fixed fullviewport, gedimmter Backdrop, Stage dahinter bekommt `filter: blur(2px) brightness(0.9)`. Marginalia dagegen pannt die Kamera (`manualPan.dx` additive Verschiebung) so, dass der aside im Viewport-Center landet – *ohne* Overlay, weil die Marginalia *in-frame* gedacht ist.
- `Esc` schließt Figure-Focus (vor TOC, Overview, Annotate, Pan-Reset, Expansion – erster Handler in der Kaskade).
- `jumpTo()` räumt jeden offenen Figure-Focus auf, analog zu `closeAnyExpansion`.
- Event-Handler wird einmalig pro Target installiert (`dataset.figureWired`-Guard), damit repopulated-Preview-Strips im Speaker-View keine Duplikate akkumulieren.
- Overlay-CSS: `img` mit `width: min(86vw, 1400px)`, `max-height: 78vh`, `height: auto`. Ohne explizites width wären SVGs im `<img>`-Tag auf die default 300×150 Intrinsic-Size gepinnt – wäre im Overlay unlesbar. Die drei SVGs in `python-intro/assets/` haben zusätzlich explizite `width/height`-Attribute mitbekommen, damit auch das non-focused Rendering deterministisch skaliert.

### 5. Zweizeilige Action-Titles

- Syntax: `## tag: Main-Line | Sub-Line {#id}` – ein `|` im Heading teilt in *Main* + *Sub*.
- Parser: `splitHeading(text)` in `parseTagPrefix` splitted auf `|`, liefert `{ heading, headingSub }` zurück.
- Renderer: wenn `headingSub` gesetzt ist → `<h2 class="chunk-heading has-sub"><span class="hd-main">…</span> <span class="hd-sub">…</span></h2>`. Zwei Spans mit Space dazwischen (damit die Print-Version, die Sub-Line optional inline rendert, lesbar bleibt wenn CSS mal nicht greift).
- Audience-CSS: Sub-Line in `var(--sans-font)`, italic, 0.68em, `--ink-soft`. Flex-column Layout, tight gap.
- Print-CSS: analog aber 0.82em und unter der Main-Line als Subtitle.
- Use-Case: "Open a page | the smallest useful Playwright script" – Main ist die Action, Sub qualifiziert. Funktioniert auch in Collapse-Mode (beide Lines bleiben sichtbar weil sie im Heading sitzen, nicht im Body).

### 6. python-intro: komplett re-written als Lecture-Script

36 Chunks über 9 Kolonnen (vorher 34/8). Jeder Chunk jetzt mit:

- **Starker Topic-Sentence** als erster Satz jedes Absatzes. `topic-bold` Collapse-Mode zeigt ihn; Print-Mode zeigt ihn als natürliche Prose-Öffnung.
- **Bold-Keywords** (`**…**`) inline, max 1-2 pro Absatz. `bold`-Collapse-Mode highlightet sie; Print-Mode hebt sie via `--emph` Rot hervor.
- **Action-Title mit Sub-Line** auf allen nicht-trivialen Chunks (z.B. "Setup with uv | the fast modern path").
- **Layout-Diversity**: 6× `::: cols 2`, 6× `::: side / flip`, 2× `::: marginalia`, 3× echtes `::: expand`, 3× image-shorthand `<figure>` (venv-Layout, async-Timeline, scanner-Flow – als SVG in `assets/`).
- **Expandables** wo sinnvoll: z.B. `deep-dive` auf Setup für "Warum nicht conda/poetry?", `match` auf Control-Flow für das strukturelle Pattern-Matching.

Collapse-Mode reads:
- `none` → Full Prose (Rehearsal/Lecture-Script)
- `topic-bold` → Topic-Sentences + Bold (Standard-Live-Mode, default)
- `topic` → nur Topic-Sentences
- `bold` → nur Absätze mit Bold-Phrase

Beide Output-Formate funktionieren: **Audience in Topic-Bold** liest wie Talking-Points, **Print in Full** liest wie ein Lecture-Script (ausformulierte Prose, Marginalia werden zu gerahmten Asides, Figures stehen inline, Shiki färbt Code).

### 7. Linter-Update

- Erkennt die neuen Layout-Directives (`::: cols N`, `::: side`, `::: flip`, `::: marginalia`) und verwaltet einen separaten `layoutStack` neben dem `activeDirective` für Expansions.
- `::: flip` außerhalb eines `::: side` → Error `stray-directive`.
- Non-geschlossene Layout-Directive am Chunk-Ende → Error `unclosed-directive`.
- Layout-Directives im body tragen nicht mehr zu `stray-directive-close`, wenn im Stack etwas ist.
- Alle drei Lectures (`demo`, `wlab01`, `python-intro`) linten clean durch, `density`-Budget-Warning auf `principle` (80 Wörter) hat bei einer Stelle in python-intro getriggert – Prose dort gekürzt statt Budget zu erhöhen (Discipline erhalten).

## Polish-Pass

Drei Korrekturen aus dem Review nach dem ersten Bau:

1. **Focus-Overlay hat jetzt solid-paper Background.** Vorher setzte `.chunk-body pre.shiki { background: transparent !important }` den Code-Block transparent, damit er in der Slide nicht als Card wirkt – aber die `!important`-Regel griff auch in der Overlay-Klon-Copy und liess den dimmed Backdrop durchscheinen. Fix: Regel ist jetzt auf `.chunk-body pre.shiki` gescoped (nicht global), und `#figure-overlay > .figure-focus-target` setzt `background: var(--paper) !important` als Card-Fill. Code in der Overlay liest sich jetzt voll-opak gegen den ~0.78α schwarzen Backdrop.

2. **Text-Selection unterdrückt in Audience und Speaker, weiterhin möglich im Print.** Global `html, body { user-select: none }` in `AUDIENCE_CSS`, die Print-CSS (`PRINT_CSS`) hat die Regel nicht. Textareas/Inputs/Contenteditable bekommen `user-select: text` zurück, damit Annotations, Speaker-Notes und die Search-Box weiterhin normal bedienbar bleiben. Shift-Drag-Pan und generelle Maus-Interaction lösen nicht mehr aus Versehen Textauswahl aus.

3. **Marginalia → Expandables in `python-intro`.** Die zwei `::: marginalia` Blöcke (auf `variables-and-types` für `None vs False` und auf `event-loop` für Coroutine vs Function) sind in `::: expand`-Blöcke migriert, mit etwas mehr Content (inkl. Code-Beispielen) und dem Chevron-Affordance. Das Design-Statement ist jetzt klarer: **Expandables sind der primäre Tuckaway-Mechanismus; Marginalia bleibt als Vokabel erhalten, aber für Authoring-Style-Asides die wirklich am Rand gehören (nicht für erweiternde Erklärungen).** Zusätzlich 6 neue Expandables eingebaut: `format-spec` auf fstrings, `generators` auf comprehensions, `bare-except` auf exceptions, `gather-vs-taskgroup` auf async-await, `headless-vs-headed` auf playwright-first-page, `whats-missing` auf scanner-source. Von 3 auf 10 Expansions gewachsen.

## Typography-&-Theme-Slice (F/A, Terminal-Modes, Speaker-Fix)

Nach dem Polish kamen drei Wünsche: konfigurierbare Schrift/Akzent, leichterer Bold, und zwei Speaker-View-Bugs.

1. **Font-Cycle (F)** – drei Reading-Faces über `body[data-font]`: `serif` (Literata, Default), `sans` (Inter Tight, projektorfreundlich), `mono` (iA Writer Duo/Quattro falls installiert, sonst JetBrains Mono als Fallback). Persistiert global in `localStorage` (key `psi-lecdoc:font`, nicht per-lecture – Reading-Preferenz folgt dem User), wird über `cycleFont` in das State-Snapshot geschrieben und per postMessage gespiegelt. Shift-F geht rückwärts.

2. **Theme-Cycle (A)** – sechs Akzent/Terminal-Varianten über `body[data-theme]`: `light-{red,teal,blue,orange}` (tauschen nur `--emph`), plus `terminal-{amber,green}` (dark-paper + phosphor-ink). In Terminal-Modes werden Shiki-Token-Farben via `color: var(--ink) !important` plattgeschlagen, damit Code in einer Phosphor-Tonität liest; Inline-Code bekommt `--emph`. Persistiert in `psi-lecdoc:theme`, Default `light-red`.

3. **Bold-Weight ist jetzt 500 (semibold).** `--bold-weight` default 500, im Sans/Mono-Mode automatisch 600 (weil Literata bei 500 precisely liest, Sans auf 500 aber zu leicht). Gilt für `.chunk-body strong` und `.exp-body strong`. Bold-Farb-Akzent bleibt `--emph`.

4. **Speaker slide-padding Bug.** Chunks waren `width: 100vw` (Fenster-Breite), aber der Speaker-Viewport ist durch die Notes-Pane grid-column `26em` schmaler. Effekt: Content floss rechts aus der Viewport-Box – unabhängig vom Zoom. Fix: `--slide-w` / `--slide-h` als CSS-Custom-Properties eingeführt, per `ResizeObserver` vom tatsächlichen `#stage-viewport` synchronisiert. `.chunk`, `.column`, `#stage` (gap 0.08×slide-w) und `.reveal-segment > pre { max-width: 72% slide-w }` nutzen jetzt `var(--slide-w)`. Camera refokussiert automatisch beim Resize. Print bleibt unberührt (separate CSS).

5. **Preview-Strip Dimming.** Die geklonten `+1/+2/+3`-Chunks unten im Speaker hatten `.active` entfernt und landeten unter der globalen `.chunk:not(.active) { opacity: 14% }`-Dim-Regel → unleserlich. Fix: `.preview-slot .chunk-clone { opacity: 1 !important }`. Zusätzlich: Preview-Scale rechnet jetzt gegen `viewport.clientWidth` statt `window.innerWidth`, damit die Skalierung stimmt wenn `--slide-w` vom Fenster abweicht.

6. **Reference-sized Slide + Stage-Scale.** Aspect-Match allein reicht nicht: font-size, padding und chunk-gap hingen an `vh`/`vw` vom BROWSER-Fenster, nicht vom Slide – ein schmalerer Speaker-Viewport hätte identischen CSS-Font-Size aber weniger absolute Pixel-Breite, sodass Text anders wrappte und Laser-Pointer-Koordinaten (fraction-of-chunk) auf der falschen Stelle landeten. Fix: `--slide-w` / `--slide-h` halten die AUDIENCE-Referenzdimensionen (in px); Audience setzt sie auf `window.innerW/H`, Speaker empfängt sie via State-Snapshot (`audienceW/H`). Alle vh-Abhängigkeiten (`font-size`, `--slide-pad-y`, `--slide-height`, `--chunk-gap`) sind auf `calc(var(--slide-h) * k)` umgestellt. Speaker rendert den Viewport in voller Audience-Größe und wendet dann `transform: scale(var(--stage-scale))` an, um in die `#stage-cell` zu passen (Letterbox-Bars in leicht dunklerem Paper). Kamera-Math in Layout-Space: `vpLayout()` helper liest `viewport.offsetWidth/Height` (nicht `getBoundingClientRect`, das nach Transform visual-scaled ist); `panToElement` nutzt `getOffset` statt visueller Rects. Resultat: pixel-identisches Rendering in beiden Views, Laser-Pointer-Fraktionen mappen 1:1.

7. **Notes-Pane schmaler (26em → 18em).** Author-Notes brauchen weniger Platz als Slide-Preview; der Stage-Cell gewinnt dadurch ~30% Breite.

8. **Preview-Strip scrollbar + klickbar.** Statt fester `+1/+2/+3`-Slots zeigt die Leiste jetzt ALLE Chunks als horizontal gescrollte Thumbnails. Drag-to-pan (pointer events, 4px-Threshold für Drag vs. Click), Click landet direkt (`jumpTo`), vertikales Mausrad mapped auf horizontales Scroll, aktueller Slot `--emph`-framed + automatisch ins Sichtfeld gescrollt (`scrollIntoView`-Pattern, via `scrollTo` mit center-Math). Slots haben `aspect-ratio: var(--audience-aspect)` damit der Clone 1:1 passt.

## Simplify-Slice (Helpers, Shiki-Cache, Speaker-Grid-Fix)

Drei-Agent-Review-Pass über `build.js` mit Fokus auf Duplikation, Hot-Path-Effizienz und echte Bugs. Keine neuen Features, nur Strukturhygiene – dafür einen echten Layout-Bug nebenbei gefangen.

1. **python-intro: drei Width-Ausreißer korrigiert.** `#prerequisites`, `#what-you-will-build` und `#urllib-parse` standen auf `.standard`, obwohl sie ein `::: side / ::: flip` bzw. `::: cols 2` im Body tragen – alle Peers mit denselben Directives waren bereits `.wide`. Jetzt konsistent. Die Lecture ist damit als Beispiel-Quelle fürs Layout-Vokabular sauber referenzierbar: jeder `.standard`-Chunk ist ein Single-Column-Chunk, jeder `.wide` trägt eine Multi-Pane-Struktur.

2. **Shiki-Memoization.** `highlightCode(code, lang)` cached Ergebnisse in einem `Map` keyed auf `${lang}::${code}`. Vorher lief Shiki dreimal pro Fence und Build (einmal für print, audience, speaker). Jetzt einmal pro unique Block. Zusätzlich ist `highlighter.getLoadedLanguages()` einmalig in ein `Set` materialisiert – die Per-Fence-Prüfung war vorher ein O(n)-`Array.includes` gegen ein frisch zurückgegebenes Array.

3. **`imgResolveCache.clear()` am Anfang von `buildOnce`.** Vorher blieb eine `null`-Auflösung persistent über `--watch`-Rebuilds hinweg: hat der Autor ein fehlendes Bild nachgelegt, kam die Placeholder-Box trotzdem wieder. Jetzt wird der Cache pro Build geleert, die `fs.existsSync`-Passage läuft einmal frisch durch, der Cache spart die redundanten drei Renderer-Durchgänge.

4. **`jsonForScript()`-Helper für Title-Injection.** `JSON.stringify(title)` embedded in `<script>…</script>` hätte bei einem Title mit `</script>` die Tag-Grenze gesprengt – XSS-Vektor über Frontmatter. Neuer Helper escapet `<` als `<`. Genutzt an beiden Call-Sites (audience, speaker).

5. **Duplikate zwischen `renderAudience` und `renderSpeaker` rausgezogen.**
   - `renderColumnsHtml(columns, frontmatter)` – das `columns.map(…renderAudienceChunk…)` war byte-für-byte identisch in beiden Renderern.
   - `OVERVIEW_BADGE_HTML` als Modul-Konstante – die `<div id="overview-badge">`-HTML mit dem `<input id="search-input">` stand verbatim in beiden Templates. Hinweise/Hotkeys ändern jetzt an *einer* Stelle.
   - `lectureTitle(frontmatter)` – einfacher Helper statt dreimal `frontmatter.title || 'Untitled lecture'`.
   - `buildOnce` ist jetzt eine kleine Target-Tabelle + Loop statt dreier `if (wants(...))`-Stanzas.

6. **Speaker-Grid: preview-strip und footer waren die falschen Rows zugewiesen.** `grid-template-rows` deklariert fünf Rows (scrubber · stage · notes · preview · footer), aber die CSS-Assignments hatten `#preview-strip` auf `grid-row: 3` (kollidiert mit notes) und `#speaker-footer` auf `grid-row: 4` (stretchte über die 22vh die für preview gedacht waren). Der Bug war durch `body:not(.has-notes) #notes-pane { display: none }` nur ohne Notes maskiert – mit sichtbaren Notes wären preview und notes übereinander gelandet. Fix: preview → row 4, footer → row 5. Per Chrome-DevTools verifiziert, Rows summieren jetzt exakt auf die Viewport-Höhe (29.7 + 686.6 + 0 + 218 + 56.7 = 991 px bei 991-px-Viewport).

7. **Speaker-Runtime-Cleanup.**
   - `colEntryEls` + `dotEls` als Modul-Level-Arrays einmalig aus `querySelectorAll` materialisiert. Vorher scannte `updateScrubber` bei jedem Keystroke und jedem eingehenden State-Snapshot das Dokument neu.
   - `populatePreviewStrip`-Resize-Handler ist jetzt 120ms-debounced. Vorher klonte er bei jedem Resize-Tick (60 Hz während Window-Drag) jeden Chunk frisch und scheduled N rAF-Callbacks – sichtbarer Jank beim Resize.

8. **Shared-Runtime-Cleanup (audience + speaker).**
   - `setAudienceAspect` war ein No-op-Forwarding-Wrapper um `setSlideRef`. Gelöscht, Call-Sites ruft jetzt direkt.
   - `exitOverview(landOnSelected)` vereinigt den Exit-Branch von `toggleOverview` und `dismissOverviewNoMove` – beide Funktionen hatten fünf von sieben Zeilen identisch.
   - `replaceContents(obj, src)` – "Clear dann Object.assign" stand zweimal in `applyRemoteState` direkt untereinander für `revealed` und `annotations`. Jetzt eine Utility, die beim nächsten live-synced Objekt automatisch wiederverwendet wird.
   - `nextChunk` hatte ein ungenutztes `const cur = flatChunks[state.activeIdx]` – Copy-Paste aus `nextCol`, wo es gebraucht wird. Entfernt.

Alles per Chrome-DevTools-MCP smoke-getestet: speaker-Layout füllt Viewport exakt, notes+preview+footer stapeln ohne Überlapp, Audience-Nav (O/T/Arrows) funktioniert unverändert, Overview-Enter/Exit läuft über den neuen `exitOverview`-Pfad sauber.

## Was funktioniert

- `node build.js <source.md>` – wie bisher, jetzt mit Shiki + Image-Resolution + Layouts.
- `node build.js <source.md> --watch` – Shiki-Init ist idempotent, läuft nur beim ersten Build. Rebuilds sind weiterhin ~80ms-Debounce.
- `node build.js --new <slug>` – unverändert. Scaffold nutzt noch keine der neuen Primitives (bewusst: minimum-viable-scaffold).
- `node lint.js lectures/ [--strict]` – versteht die neuen Directives; alle Lectures clean.
- Figure-Focus: Klick auf Figur/Code/Marginalia im aktiven Chunk fokussiert/pant. `Esc` schließt.
- Marginalia-Pan ist additive-Shift auf `manualPan.dx` – nächste `Esc` oder Chunk-Nav resettet.
- Image-Resolution: `venv-layout.svg`, `async-timeline.svg`, `scanner-flow.svg` im `assets/`-Ordner werden aufgelöst. Unresolved → sichtbare Placeholder-Box, nicht stille 404.
- Collapse-Mode Kombination mit Layouts: `::: cols` / `::: side` überleben Collapse – nur die Topic-Bold-Filter-Regeln laufen innerhalb der Reveal-Segmente, die Layouts sind Container und bleiben.
- Print-View: neue Primitives collapse'n zu linearen Prose-Blöcken (keine `column-count` im Print, `side` → Block-Stack, `marginalia` → gerahmter Aside-Block).

## Annahmen & Design-Entscheidungen

Diese Punkte habe ich ohne Rückfrage entschieden:

1. **Shiki-Theme: `github-light`.** Clean, OKLCH-kompatibel mit unserer Palette, und die Default-Theme-Zeichnungen sind nicht schrill. Wenn wir später eine Dark-Mode-Variante wollen, einfach ein zweites Theme laden und per `prefers-color-scheme` oder class-based switchen – shiki supports beides out-of-the-box.
2. **Sprach-Whitelist, nicht On-Demand-Load.** Die 14 eingebauten Sprachen decken 95% der zu erwartenden Teaching-Content ab. Weniger Moving-Parts als langs-on-demand; Build bleibt einfach. Wenn jemand Rust oder Haskell braucht, ist's eine Zeile in `SHIKI_LANGS`.
3. **`|` statt Zeilenumbruch im Heading für Action-Titles.** Alternativen wären Multiline-Heading (schwerer zu parsen), `<br>` im Markdown (hässlich), oder ein separates Attribute `{.sub "..."}` (Pandoc-ish, aber schwer zu tippen). `|` ist auf allen Keyboards einfach, unwahrscheinlich in Heading-Text, und visuell selbsterklärend.
4. **`::: cols N`** limited auf 2 oder 3 (nicht 4+). Mehr Spalten ergeben bei `column-count`-Flow auf 72em content-width keine lesbaren Zeilen mehr. Linter würde `cols 4` durchlassen aber CSS-technisch ignorieren; wenn nötig, explizit aufnehmen.
5. **`::: side` nur mit `::: flip` als Separator, keine Mehrfach-Panes.** Drei-Pane-Layouts sind Overkill für Slide-Content; `cols 3` deckt die "drei gleichberechtigte Spalten"-Use-Case ab.
6. **Marginalia ist *rechts*, nicht *links*.** PRD §2 schreibt linke-Annotation für Speaker-Marginalia (N-Hotkey). Marginalia als authored-content gehört pedagogisch auf die *rechte* Seite (westlicher Lesefluss: Haupttext lesen, dann Marginalia am rechten Rand als "Seitenbemerkung"). Die Annotation-Box kollidiert damit nicht – die ist weiterhin links. **Nach dem Polish-Pass gilt außerdem**: Marginalia ist weiterhin verfügbar, sollte aber sparsam eingesetzt werden – Expandables sind der bevorzugte Tuckaway-Mechanismus, weil sie on-demand geöffnet werden, nicht dauerhaft Platz kosten und im Collapse-Mode unsichtbar sind.
7. **Figure-Focus-Overlay clont die Figur** anstatt sie im DOM zu verschieben. Weil die Source-Figur ihre Click-Handler behält und die Overlay-Kopie unabhängig entfernt werden kann. Trade-off: Klick-Reaktivität innerhalb der Clone-Figur geht nicht (man kann nicht auf der Overlay-Figur wieder klicken um sie zu schließen – außer auf den Overlay-Background. Ich habe stopPropagation raufgetan so dass Clicks auf die Clone zur Overlay-Schließen-Action propagieren). Alternative wäre, die Original-Figur absolut zu positionieren; komplexer und potentiell Layout-disruptive.
8. **Code-Blöcke sind click-to-focus.** Nützlich für lange `scanner.py`-Source-Code-Figur (48 Zeilen). Kann im Prinzip *jeder* Pre clicken, aber nur *im active chunk* (damit man nicht aus Versehen beim Scrollen die Neighbors triggert).
9. **Marginalia + Expandable zusammen:** möglich, aber wlab01/python-intro nutzen nur jeweils eines pro Chunk. Wenn wir beide hätten, würde der Expansion-Grid das Marginalia-Layout stören (expand öffnet `grid-template-columns: 1fr 30em`, was das absolute-positioning der Marginalia beeinflussen könnte). Nicht getestet; potentielles Follow-up.
10. **SVG-Figuren mit expliziten `width/height`-Attributen.** Ohne die ist die Intrinsic-Size eines SVG im `<img>` 300×150 (Browser-Default), was im Focus-Overlay nicht genug skaliert. `width="420" height="260"` plus `viewBox="0 0 420 260"` macht das Scaling deterministisch.

## Gaps / Bekannte Limits

- **Code-Blöcke in `::: side` können überlaufen.** Mit `white-space: pre` und langer URL (z.B. `curl -LsSf https://astral.sh/uv/install.sh | sh`) clippt der Pre am Pane-Rand rechts. Horizontal-Scroll-Bar greift, aber unschön auf dem Projektor. Workaround: kurze Commands in `::: side`, lange Commands in `::: cols` oder single-column. Möglicher Fix: `white-space: pre-wrap` innerhalb von `.side pre` – aber das bricht Code-Einrückung. Akzeptiert.
- **KaTeX / Mathe ist weiterhin deferred.** python-intro hat keine Mathe. Wenn die nächste Lecture Mathe bringt: PRD §9 Schritt 4.
- **Mermaid ist weiterhin deferred.** Die beiden Figuren in python-intro waren bereits als ASCII (async-Timeline, scanner-pipeline) geschrieben – ich habe sie durch `![](…)` SVG-Figuren ersetzt, was das Image-Shorthand-Feature sauber demonstriert. Die ASCII-Version in einer `::: figure`-Chunk mit Pre wäre auch valide. Mermaid als *authored-in-source*-Pipeline (fenced ```mermaid ``` → headless render → inline SVG) bleibt offen.
- **`--assign-ids` ist weiterhin nicht implementiert.** Der Linter meldet `missing-id`, aber der Autor muss die IDs noch selbst eintippen. Kleiner Commit falls die nächste Lecture viele neue Chunks erzeugt.
- **Kein Linter-Hook im Build.** Wer gerade `build.js --watch` fährt, muss separat `lint.js` callen. Siehe offene Empfehlungen im vorigen Handoff.

## Next Slice – Empfehlungen

Die beiden hochrangigen Kandidaten aus dem letzten Handoff bleiben offen und unverändert prioritär:

- **`--assign-ids` + Linter-Build-Integration.** Klein (~150 Zeilen), schließt den Authoring-Loop zu "edit → save → build+lint → reload". Gut für Phase 1 Abschluss.
- **Mermaid-Pipeline** (fenced `mermaid` block → `@mermaid-js/mermaid-cli` → inline SVG). Symmetrisch zu dem Image-Shorthand-Resolver (build-time render, static inline SVG). ~250 Zeilen.

**KaTeX** bleibt deferred bis zur ersten Math-Lecture.

Nicht-geerntet aus dem Simplify-Pass (bewusst geskippt, kurz dokumentiert damit sie nicht verloren gehen):

- **`applyState` broadcasted unconditionally** – einzelne Aktionen wie `setZoom` rufen `applyState` und direkt danach nochmal `broadcastState`, d.h. zwei postMessage-Snapshots pro User-Action. Fix wäre ein Mikrotask-Debounce oder einfach `applyState` nicht broadcasten lassen und jede Aktion explicit `broadcastState` anschieben. Wurde ausgespart, weil das Sync-Protokoll empfindlich ist und ich keinen passenden End-to-End-Test hatte.
- **Head-Boilerplate zwischen `renderAudience` und `renderSpeaker`.** `<!DOCTYPE>`/`<meta>`/`<title>` plus `#mode-badge` und `${renderTocNav}` stehen ziemlich identisch in beiden Renderern. Eine gemeinsame `renderSharedHead(title, opts, extraCss)`-Helper-Funktion wäre möglich; die Divergenzen (`data-view`, `<title>`-Suffix, `#laser-pointer` nur audience) machen das aber zu einem non-trivialen Refactor mit vielen Branches – mehr Churn als Wert. Offen als Kandidat für später, falls ein dritter Live-View dazukommt.
- **Stringly-typed `'forward'`/`'back'`-Directions** in `jumpTo`. Ein Tippfehler landet stumm im "preserve"-Branch. Könnte zu `const DIR = { FORWARD, BACK }` werden; low impact, nicht gemacht.

## Arbeitsstil

- Wir sind per du.
- Keine em-dashes – en-dashes (`–`) oder `&ndash;`.
- Keine Zeit- oder Datumsschätzungen in Task-Files.
- Commits einzeln und fokussiert.
- Explanatory output style: `★ Insight ─────` Blöcke vor und nach Code-Edits mit 2-3 Punkten.

## Start-Ritual

1. `git log --oneline -15` – die letzten Commits sind der Kontext.
2. `PRD.md §4 (Visual language)` und `§9 (Build system)` überfliegen.
3. `lectures/python-intro/source.md` als **Referenz-Beispiel** für das neue Layout-Vokabular und den Lecture-Script-Schreibstil lesen. Topic-Sentences, Bold-Keywords, Sub-Lines im Heading, `::: cols 2`, `::: side`/`::: flip`, `::: marginalia`, Image-Shorthand.
4. `lectures/python-intro/print.html` im Browser – das ist die beste Demo wie Collapse-Off-Prose liest.
5. `lectures/python-intro/audience.html` in Collapse-`topic-bold` (default) – das ist die beste Demo wie Collapse-On während einer Vorlesung aussieht.
6. `build.js` hat die neuen Hooks: Shiki-Init (memoized), Image-Renderer, Layout-Directive-Preprocessor, Figure-Focus-JS. Gewachsen auf ~3650 Zeilen (davon ~2100 embedded CSS/JS für audience+speaker – die Node-Build-Logik selbst ist immer noch kompakt).
7. `lint.js` kennt die neuen Directives.
8. Nächsten Slice wählen: `--assign-ids` + Build-Lint-Integration, oder Mermaid, oder was die nächste reale Lecture motiviert.
