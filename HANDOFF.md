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
- Use-Case: „Open a page | the smallest useful Playwright script“ – Main ist die Action, Sub qualifiziert. Funktioniert auch in Collapse-Mode (beide Lines bleiben sichtbar weil sie im Heading sitzen, nicht im Body).

### 6. python-intro: komplett re-written als Lecture-Script

36 Chunks über 9 Kolonnen (vorher 34/8). Jeder Chunk jetzt mit:

- **Starker Topic-Sentence** als erster Satz jedes Absatzes. `topic-bold` Collapse-Mode zeigt ihn; Print-Mode zeigt ihn als natürliche Prose-Öffnung.
- **Bold-Keywords** (`**…**`) inline, max 1-2 pro Absatz. `bold`-Collapse-Mode highlightet sie; Print-Mode hebt sie via `--emph` Rot hervor.
- **Action-Title mit Sub-Line** auf allen nicht-trivialen Chunks (z.B. „Setup with uv | the fast modern path“).
- **Layout-Diversity**: 6× `::: cols 2`, 6× `::: side / flip`, 2× `::: marginalia`, 3× echtes `::: expand`, 3× image-shorthand `<figure>` (venv-Layout, async-Timeline, scanner-Flow – als SVG in `assets/`).
- **Expandables** wo sinnvoll: z.B. `deep-dive` auf Setup für „Warum nicht conda/poetry?“, `match` auf Control-Flow für das strukturelle Pattern-Matching.

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

1. **Font-Cycle (F)** – drei Reading-Faces über `body[data-font]`: `serif` (Literata, Default), `sans` (Inter Tight, projektorfreundlich), `mono` (iA Writer Duo/Quattro falls installiert, sonst JetBrains Mono als Fallback). Persistiert global in `localStorage` (key `psi-slides:font`, nicht per-lecture – Reading-Preferenz folgt dem User), wird über `cycleFont` in das State-Snapshot geschrieben und per postMessage gespiegelt. Shift-F geht rückwärts.

2. **Theme-Cycle (A)** – sechs Akzent/Terminal-Varianten über `body[data-theme]`: `light-{red,teal,blue,orange}` (tauschen nur `--emph`), plus `terminal-{amber,green}` (dark-paper + phosphor-ink). In Terminal-Modes werden Shiki-Token-Farben via `color: var(--ink) !important` plattgeschlagen, damit Code in einer Phosphor-Tonität liest; Inline-Code bekommt `--emph`. Persistiert in `psi-slides:theme`, Default `light-red`.

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
   - `replaceContents(obj, src)` – „Clear dann Object.assign“ stand zweimal in `applyRemoteState` direkt untereinander für `revealed` und `annotations`. Jetzt eine Utility, die beim nächsten live-synced Objekt automatisch wiederverwendet wird.
   - `nextChunk` hatte ein ungenutztes `const cur = flatChunks[state.activeIdx]` – Copy-Paste aus `nextCol`, wo es gebraucht wird. Entfernt.

Alles per Chrome-DevTools-MCP smoke-getestet: speaker-Layout füllt Viewport exakt, notes+preview+footer stapeln ohne Überlapp, Audience-Nav (O/T/Arrows) funktioniert unverändert, Overview-Enter/Exit läuft über den neuen `exitOverview`-Pfad sauber.

## Speaker-UX-Slice (Notes-Entrypoint + vertikale Preview + Zoom)

Drei konkrete Speaker-View-Wünsche, zusammen als ein Slice – die hingen inhaltlich zusammen.

1. **Notes-Pane lässt sich auch ohne Source-Notes öffnen.** Der Bug: `Shift-N` rief `focusNotesPane()` → `classList.add('has-notes')` → rAF → `focus()` + `autoSizeNotes()`. Aber `autoSizeNotes` hat `has-notes` *auf Basis des Textareas-Inhalts* gesetzt – war leer → Klasse wieder weg, ein-Frame-Flicker. Fix: `autoSizeNotes` behält die Klasse drauf solange das Textarea fokussiert ist (`hasText || activeElement === notesContent`). Beim Blur mit immer-noch-leerem Textarea kollabiert die Pane wieder – das ist die gewünschte Semantik.

2. **„+ note“ Corner-Button auf der Stage-Ecke.** Unten-rechts auf dem stage-cell, halbtransparent, absolute positioniert, `z-index: 10`, `opacity: 0.5` → `1` on hover. Klick triggert `focusNotesPane()`. Mit `title="Open speaker notes (Shift-N)"` als Tooltip. Sichtbar *nur* wenn `body:not(.has-notes)` – sobald die Pane offen ist, verschwindet der Button. Discoverability-Kanal für den Hotkey, den Newcomer im `?`-Hint-Panel sonst eventuell nicht finden.

3. **Preview-Strip kann vertikal an den rechten Rand wandern – Hotkey `V`.** Neue Body-Class `preview-right` schaltet das Grid um:
   - `grid-template-rows: 3vh 1fr auto 2.2rem` (4 Rows statt 5)
   - `grid-template-columns: 1fr clamp(180px, 18vw, 300px)`
   - scrubber+notes+footer spannen beide Spalten, stage sitzt in col 1, preview-strip in col 2 zwischen scrubber und notes.
   - Strip selbst: `flex-direction: column`, `overflow: hidden auto`, `border-left` statt `border-top`.

   Pref ist global via `localStorage psi-slides:preview-orientation` persistiert (folgt dem User über Lectures hinweg, wie Font/Theme). Die drei Helper im Preview-Code (`scrollPreviewToActive`, pointer-drag, wheel-handler) bekamen einen `isPreviewVertical()`-Guard und achsenunabhängige Logik. Slot-Aspect-Ratio (`--audience-aspect`) funktioniert out-of-the-box für beide Orientierungen, weil flex-parent-stretch cross-axis füllt und aspect-ratio dann die main-axis ableitet.

4. **Preview-Thumbs 1.22× reingezoomt** für bessere Textlesbarkeit. `PREVIEW_ZOOM`-Konstante (= 1.22) wird als Multiplikator auf das transform-scale gepackt; Slot-`overflow: hidden` clippt die 22% Überhang. Transform-Origin bleibt `top left`, d.h. geclippt wird unten + rechts (dort wo Slide-Padding sitzt, nicht Content). Spart sich die Ambiguität von center-origin, die Content an allen Seiten angeknabbert hätte.

Per Chrome-DevTools verifiziert: V togglet Orientation sauber + persistiert über Reload; scale rechnet auf 0.184 bei 1800-px-Viewport (= 271/1800 × 1.22); „+“-Button öffnet Pane, bleibt offen während Fokus, kollabiert beim Blur wenn leer.

Hint-Panel (`?`-Hotkey) um `<kbd>V</kbd> preview view` ergänzt; `Shift-N notes` stand da schon.

## Rename + Tutorial + Footer-Hints

Drei kleinere, zusammenhängende Stücke in einem Slice.

1. **Tool heißt jetzt `psi-slides`** statt `psi-lecdoc`. Betrifft `package.json`-Name, `STORAGE_PREFIX` (`psi-slides:`), den speaker-window-open-name (`psi-slides-speaker`), `PREVIEW_ORIENTATION_KEY`, und alle Doku-Referenzen (`speaker.md`, `phase0/AUTHORING.md`, dieses HANDOFF). Repo-Verzeichnis heißt weiterhin `psi-lecdoc/` – das ist ein git-remote-Thema, bei Gelegenheit manuell umbenennen.

   Migration: vor `loadPersisted` läuft ein einmaliges `migrateLegacyStorage`-IIFE, das alle `psi-lecdoc:*`-Keys in `localStorage` zu `psi-slides:*` umbenennt und die alten löscht. Font-/Theme-Prefs, Preview-Orientation, per-Lecture-Annotations und `activeIdx` überleben den Rename transparent. Getestet mit gesetztem `psi-lecdoc:font=mono` + `psi-lecdoc:my-lecture:annotations`-Blob – beide tauchen nach Reload unter `psi-slides:*` wieder auf, die alten Keys sind weg.

2. **Self-teaching tutorial-Lecture** unter `lectures/tutorial/source.md`. 13 Chunks (1 title + 12 Steps) über 6 Kolonnen, die das Tool *durch Benutzung* erklären:
   - „Space reveals segments“-Step hat echte `---`-Segmente, an denen der Leser Space drückt.
   - „Enter opens expansions“-Step hat zwei authored `::: expand`-Blöcke, damit Leser `Enter` + `1` + `2` live ausprobieren.
   - „cols 2“-Step ist ein `::: cols 2`-Layout.
   - „N vs Shift-N“-Step benutzt `::: side / flip` um die zwei Notes-Konzepte nebeneinander zu stellen.
   - Abschluss-Step verweist konkret auf `python-intro/audience.html`, `PRD.md`, `HANDOFF.md`, plus die drei CLI-Entries (`--new`, `--watch`, `lint.js`).

   Zielgruppe: First-Time-User, die in einem Durchgang Hotkeys + strukturelles Vokabular (Chunks, Kolonnen, Reveals, Expansions, Layouts) mitnehmen sollen.

3. **Footer-Hint erweitert.** Die `.kbd-hint`-Zeile im `#speaker-footer` listet jetzt `N annot / Shift-N notes / V preview / Shift-P push / . force / ? all` statt vorher nur `Shift-P push / . force push / ? hints`. Die drei hinzugefügten Einträge waren die bisher schlechtest-discoverablen Interaktionen.

## Inline-SVG-Slice (Theme-Inheritance für Mermaid-Figuren)

Auslöser: Die Schwester-Repo `psi-slides-mylectures` hat angefangen, mermaid-gerenderte SVGs (sequence diagrams für die Passkeys-Lecture) als Figure-Assets zu verwenden. Die Mermaid-Renderer-Pipeline (`mermaid-render-beautiful`) emittiert SVGs mit `style="--bg:transparent;--fg:var(--ink, #0a0a0a);--line:var(--ink, #0a0a0a);…"` – die Idee war, dass die Figuren auf den `A`-Theme-Cycle (light-{red,teal,blue,orange}, terminal-amber, terminal-green) reagieren. Tat sie nicht: das Build inlinte SVGs als `<img src="data:image/svg+xml;utf8,…">`, und `<img>`-eingebettete SVGs leben in einem isolierten Document-Context und erben **keine** CSS-Custom-Properties vom Parent.

- **Fix:** Im image-Renderer (`marked.use({ renderer: { image } })`, build.js ~Zeile 200) für SVG-Assets einen neuen Branch eingeführt, der via `inlineSvg(absPath, {alt, title})` den SVG-XML-Inhalt direkt als inline `<svg>`-Element ins HTML splice. Raster-Formate (PNG/JPG/…) und der `--no-inline-images`-Pfad bleiben auf der bestehenden `toDataUri`-Logik. Cap-Verhalten (`MAX_INLINE_BYTES = 2 MB`) bleibt identisch; oversized SVG fällt auf den external-path-Fallback.
- **ID-Kollisionen vermeiden:** Per-Build-Counter `inlineSvgCounter` produziert für jede Inline-Instanz einen eindeutigen Prefix `psi-fig-${n}-`. Alle internen `id="X"` werden zu `id="${prefix}X"` umgeschrieben; nur Refs auf bekannte Own-IDs (`url(#X)`, `href="#X"`, `xlink:href="#X"`) werden mitgezogen, damit `data-*`-Attribute oder Text-Content nicht zerschossen werden. Counter resetted in `buildOnce` zusammen mit den anderen Per-Build-Caches.
- **CSS-Leakage vermeiden:** Inline `<style>`-Blöcke werden mit `@scope (svg#${prefix}root) { … }` umwickelt – generic Selectors wie `text { font-family: Inter; }` oder `polygon { … }` greifen jetzt nur innerhalb dieser SVG-Instanz. `@scope` ist Chrome 118+, Safari 17.4+, Firefox 128+ – passt für die Build-Targets. `@import` (insbesondere die Google-Fonts-URLs mit `;`-Zeichen in der Query!) und `@font-face` werden aus dem `@scope`-Block heraus an den Top-Level gehoben, weil sie sonst nicht greifen. Wichtig: das `@import`-Match ist string-aware (`"…"|'…'|[^;'"]+`), weil Google-Fonts-URLs `;` im `family=Inter:wght@400;500;600;700`-Selector enthalten – ein naives `[^;]+;` schneidet die URL mittendrin ab.
- **Root-`<svg>`-Tag:** Bekommt `id="${prefix}root"` (für `@scope`), `role="img"`, `aria-label="${alt}"` falls Alt-Text gesetzt. Vorher gesetzte Root-IDs werden als Klasse erhalten. Original `width`/`height`/`viewBox`/`style` bleiben durch.
- **Ergebnis:** `npm run build -- lectures/passkeys/source.md` in der Schwester-Repo emittiert 13 inline `<svg>`-Elements pro View (audience/print/speaker), 0 `data:image/svg+xml`-URIs, 47 prefixed IDs, 4 prefixed `note-cutout`-Masks (eine pro mermaid-Sequence-Diagram, vorher kollidiert sie). Theme-Inheritance-Chain verifiziert: `body[data-theme=…]` setzt `--ink` → SVG-`style="…--fg:var(--ink, #0a0a0a)…"` resolvt → SVG-internes `--_line: var(--line, …)` → `<line stroke="var(--_line)">` re-colors live.
- **Follow-up – `@scope`-Wrap-Pitfall (root vs. descendant):** First deploy zeigte mermaid-SVGs mit schwarzen Actor-Boxes und unsichtbaren Lifelines. Ursache: per `@scope`-Spec matcht ein bare `svg { … }`-Selector innerhalb von `@scope (svg#root) { … }` nur **descendants** der Scope-Root, nicht die Root selbst – mermaid setzt aber genau auf der Root-`<svg>` einen ganzen Block derived custom properties (`--_text`, `--_line`, `--_node-fill`, …), die so nie greifen. Fix in `inlineSvg()`: vor dem Wrap die bare-`svg`-Selectors am Rule-Start (Datei-Anfang oder nach `}`) per Regex `/(^|\})(\s*)svg(\s*)\{/g → '$1$2:scope$3{'` zu `:scope`-Selectors umschreiben. Chained Selectors (`svg text { … }`) bleiben unangetastet (waren schon descendant-correct). Hand-authored SVGs (class-only Selectors wie `.head`, `.station-1`) sind nicht betroffen.

Follow-up: Eine eingebaute Mermaid-Build-Pipeline (fenced ` ```mermaid ` block → headless render → inline SVG) ist weiterhin offen (siehe `Empfehlungen` weiter unten). Sie würde den gleichen `inlineSvg`-Pfad als Sink verwenden – das Splice-Shape ist also bereits in place. Bis dahin bleibt die Konvention: SVGs (Mermaid oder hand-authored) liegen in `lectures/<slug>/assets/`, werden via `![](fig-id)` referenziert, und das Build splict sie inline-mit-Theme-Inheritance.

## Review-Slice (Overview-Sync, expliziter Slide-Modus, Selbstdokumentation)

Auslöser: nach einem ganzen Semester im Realbetrieb waren drei Dinge chronisch. Der Overview-Mode „sprang irgendwo hin“, die Lecturer-Ansicht erklärte sich nicht selbst (konkret: wie man Slide/Notes-Arrangement ändert), und der `topic-bold`-Collapse zwang Fließtext in eine Form, die Fließtext nicht mag. Alles vier E2E gegen ein echtes audience+speaker-Fensterpaar verifiziert, vorher und nachher.

**1. Overview – vier Defekte, eine Ursache.** Kamera und Auswahl hingen an derselben Variable (`selectedIdx`), also *musste* jeder Klick die Bühne bewegen, und `applyOverviewCamera` addierte dabei den noch stehenden Drag-Pan: die angeklickte Folie wurde zentriert und dann um den alten Pan-Betrag weggeschoben. PRD §5 hatte „select it (thick border, no camera move)“ die ganze Zeit korrekt spezifiziert – der Code war von seiner eigenen Spec abgedriftet.

Dazu kam die Sync-Asymmetrie: der `overview`-Handler stand innerhalb von `if (VIEW === 'audience')`, also lief die Synchronisation nur speaker → audience. Umgekehrt blieben die Fenster dauerhaft in verschiedenen Modi – und schlimmer, der Speaker übernahm den Overview-Drag-Pan der Audience und wendete ihn auf die *Normalkamera* an: gemessen `translate(-1596px, -1607px)`, also ein leeres Cockpit, während die Audience nur scrollte. Vierter Punkt: Pfeiltasten im Overview verschoben `activeIdx` hinter einem unveränderten Auswahlrahmen, ein `Esc` danach landete auf einer nie gewählten Folie.

- Neue Invariante: `overviewAnchorIdx` bestimmt allein die Kamera, `selectedIdx` allein den Rahmen. Framing ist damit eine reine Funktion von `(anchor, scale, pan)`, alle drei reisen im State-Snapshot mit – die beiden Fenster kommen konstruktionsbedingt auf identische Pixel (im Test byte-gleiche `transform`-Strings).
- Die separate `{type:'overview'}`-Message ist weg. Zwei Kanäle für eine Tatsache waren genau die Ursache von Defekt 3.
- Pfeile bewegen im Overview die Auswahl und re-ankern (Kamera folgt, weil das Ziel meist außerhalb des Bildes liegt); ein Klick tut beides nicht.
- `speaker.md` §2 behauptete noch, der ganze Overview-Cluster sei per-View-lokal. Das stimmte seit `8a835d3` (Camera-Sync) nicht mehr und ist jetzt nachgezogen, inklusive vollständiger Feldliste und Message-Katalog.

**2. Expliziter Slide-Modus (`::: slide` / `::: script`).** Das eigentliche Format-Thema. Die Ableitung „erster Satz plus Bold-Fragmente“ ist billig zu autoren und hält Print und Screen in einem Text, kostet aber eine harte Schreibbedingung: jeder Absatz muss mit einem bullet-fähigen Satz öffnen. Für argumentförmige Chunks ist das der richtige Tausch, für lange Befund- oder Walkthrough-Chunks kämpft es gegen den Text.

Jetzt entscheidet der Chunk, in drei Regeln: `::: slide`-Block vorhanden → nur der ist Leinwand; sonst `::: script` vorhanden → alles außer dem ist Leinwand; sonst wie bisher. Bewusst billig gebaut – kein neuer Runtime-State, kein neues Sync-Feld, kein dritter Halt im `C`-Zyklus. Der Parser emittiert zwei Wrapper-Divs wie die anderen Layout-Directives, der Modus ist CSS (`:has()` unter `[data-collapse=topic-bold]`) plus ein `closest()`-Guard in `splitSentencesIn`. Print und `none` zeigen beide Hälften in Source-Order.

Zwei Fallen, die der Verschachtelungs-Test aufgedeckt hat und die als Warnung taugen:

- Der Hide-Selector darf **nicht** `.reveal-segment > *` sein. Ein `::: slide` in einem `::: side`-Pane hängt unter einem Wrapper-Div, der Wrapper ist selbst nicht `.slide-explicit`, wird versteckt und nimmt den Slide-Block mit – der Chunk kollabierte auf gar nichts. Korrekt ist tiefenunabhängig: `*:not(.slide-explicit):not(:has(.slide-explicit)):not(.slide-explicit *)`.
- Der Guard gehört an das **Reveal-Segment**, nicht an den Chunk. Per-Chunk blankte ein Segment ohne expliziten Block komplett aus, statt auf die Ableitung zurückzufallen.
- Lint zählt das Density-Budget nur noch auf der Bildschirm-Hälfte. Erzählung ist absichtlich unbudgetiert, sonst wäre der ganze Modus sinnlos.

**3. Selbstdokumentation.** `#hints` (fünf Zeilen Buchstaben-Liste, `?`-versteckt) ist ersetzt durch ein nach *Aufgabe* gruppiertes Vollbild-Panel in beiden Live-Views, generiert aus einer Datenstruktur (`renderHelpOverlay(view)`), damit Speaker- und Audience-Fassung nicht auseinanderlaufen. Entscheidend: **Maus-Gesten stehen neben den Tasten.** Notes-Pane resizen, Figur anklicken, Overview-Board draggen – nichts davon hat eine Taste, und genau danach hatte ich gesucht und nicht gefunden. Dazu die Einstiege, weil `?` selbst nicht auffindbar ist: dezenter `?`-Button unten links (im Overview und bei `B` ausgeblendet), Footer-Buttons für die drei tastenkritischen Cockpit-Aktionen (`⇄ preview`, `export notes`, `? help`), und der Notes-Divider benennt seine eigene Geste beim Hover statt sich auf ein `title`-Attribut zu verlassen.

**4. Zwei Nebenfunde.** Überschriften wurden komplett escaped, also rendern Backticks in Headings literal – betrifft 19 Überschriften in der Content-Repo, in allen vier Views falsch. Jetzt `marked.parseInline` plus die fehlenden Code-Span-Styles (die Regeln waren auf `.chunk-body`/`.exp-body` gescoped, ein Heading-Code-Span erbte Default-Monospace auf 1em). Und: das Tutorial dokumentierte zwei Dinge, die es nie gab (vier Collapse-Modi, Pfeiltasten-Auswahl im Overview) und drei der acht Tags nie – ist jetzt neu geschrieben, 9 Spalten / 29 Chunks, jeder Chunk passt auf 1920×1080.

**5. `assertStylesheetsWellFormed()`.** Während des Nesting-Fixes habe ich Kommentartext hinter ein `*/` gesetzt und damit stumm jede Regel bis zum nächsten `*/` gelöscht – inklusive `.script-only`, also war auch `::: script` kaputt, ohne dass irgendwas warnte. Weil jedes Stylesheet hier in einem Template-Literal lebt, wo dieser Fehler unsichtbar ist, läuft die Prüfung jetzt bei jedem `buildOnce` und bricht hart ab. Mit einer absichtlich kaputten Kopie verifiziert. Der Schwesterfehler (Backtick in einem Kommentar innerhalb von `AUDIENCE_JS`) wirft immerhin schon beim Parsen – mir zweimal in dieser Session passiert, jetzt in CLAUDE.md notiert.

**6. `--optimize-images`.** Nachgezogener Fix für den Nebenfund oben: Assets über dem 2-MB-Cap bleiben externe Pfade, das Output ist dann nicht mehr self-contained, und man merkt es nicht – zwei Decks in der Content-Repo waren in diesem Zustand.

Wichtig ist, was der Verb **nicht** macht, weil die naheliegende Antwort die falsche ist. Die Annahme „zu viele Pixel“ hält der Messung nicht stand: der schlimmste Fall war 3,03 MB bei exakt 1920×1080, also schon Folienauflösung – die Bytes sind PNG als schlechter Fit für fotografischen Inhalt. Gleichzeitig zoomt Figure-Focus auf `FIG_MAX_SCALE` (8×), das 3968 px breite Diagramm im selben Ordner hat nur 875 KB und ist absichtlich hochauflösend. Downscaling hätte also ein Feature beschädigt, um ein Problem zu lösen, das dort nicht existiert.

- WebP q92: 12–18 % des Originals über die echten Assets (3,03 → 0,44 MB; eine ganze Lecture 6,6 → 1,15 MB). Bei 3× Pixel-Zoom auf Text über fotografischem Hintergrund nicht vom Original unterscheidbar. Lossless erreicht nur 32–69 % und reicht nicht zuverlässig unters Cap. `--max-width` ist opt-in für echte Ausreißer.
- Encoder werden geshellt (`cwebp`, sonst `magick`), nicht als npm-Dependency aufgenommen: gelegentlicher Authoring-Schritt, nicht der Build-Pfad. `sips` liegt auf jedem Mac, kann aber **kein** WebP schreiben – es gibt also keinen Zero-Install-Fallback, was ein weiteres Argument gegen Konversion in `buildOnce` ist.
- `imageSize()` liest Dimensionen aus PNG-IHDR / JPEG-SOF, zero-dep, weil `cwebp -resize W 0` ein schmaleres Bild klaglos **hochskaliert**. Beim Testen aufgefallen: `--max-width 2000` hatte das 1920px-Asset vergrößert. Der Kommentar behauptete eine Prüfung, die nicht existierte.
- WebP ist nicht immer kleiner (flächige PNGs gewinnen manchmal). Eine verlierende Konversion wird verworfen und als „kept original“ berichtet, nicht als Ersparnis gezählt.
- Originale werden ersetzt, weil `IMG_EXTS` `png` **vor** `webp` auflöst – ein liegengebliebenes PNG würde die neue Datei verdecken und die Konversion wirkungslos machen. Explizite Pfade in `source.md` werden umgeschrieben; die 84 Shorthand-Refs `![](fig-id)` brauchen keine Änderung.
- Sichtbarkeit, weil die alte Log-Zeile durchrutschte: `warnOversizedAsset()` nennt Konsequenz und Fix, und `lint.js` hat eine `oversized-asset`-Warnung (weiterhin zero-dep) als Pre-Commit-Gate. Findet exakt die zwei echten Fälle über alle 19 Lectures und schweigt nach der Konversion.

Regression: alle 19 realen Lectures bauen weiter (0 Fehler), Lint unverändert bei 15 Warnungen plus die 2 neuen `oversized-asset`-Treffer, 38 inline-Runtimes parsen, und die 10-Punkte-E2E-Suite (Overview bidirektional, Drag-Mirror, Pfeil-Auswahl, Klick-ohne-Bewegung, Landing, Collapse/Theme/Font-Sync, Help-Overlay, Chunk-Nav) ist grün.

Kleine Test-Lektion für spätere Slices: Bilder tragen `loading="lazy"`, und auf der großen Stage ist fast alles off-screen. `naturalWidth` ist dort *immer* 0, ein `await img.decode()` über 16 Bilder sprengt das Tool-Timeout. Der belastbare Check ist, die base64-Payloads aus dem HTML zu extrahieren und mit `magick identify` zu validieren – schneller und deterministisch.

## Docs- und Positioning-Slice (Lizenz, README, Pages, Tutorial-Craft)

Auslöser: das Repo ist öffentlich, hat ein Semester Lehre getragen – und die Vordertür sagte weder was das Ding produziert, noch für wen es ist, noch wann man es *nicht* nehmen sollte. Kein Code-Slice; `build.js` und `lint.js` sind unangetastet.

**Lizenz.** Vorher `licenseInfo: null`, also durfte formal niemand irgendetwas nachnutzen. Jetzt ein Split entlang der Linie, die hier wirklich zählt: Tooling und Doku MIT (`LICENSE`), Lehrinhalte unter `lectures/` CC BY-SA 4.0 (`lectures/LICENSE`). Die Root-`LICENSE` ist wortwörtlicher MIT-Text ohne Zusatzprosa, sonst kippt GitHubs `licensee`-Erkennung auf „Other“. `lectures/LICENSE` hält außerdem fest, dass die generierten HTMLs gemischt sind – Inhalt CC BY-SA, das von `build.js` inlinete Runtime-JS/CSS bleibt MIT. `package.json` hat jetzt `license`, `repository`, `homepage`, `bugs` und `engines: node >=20` (der Boden kommt von shiki, nicht geraten).

**README.** Komplett neu. Führt mit dem Artefakt und dem Problem (Skript und Folien driften auseinander), zeigt den Collapse-Mechanismus als Vorher/Nachher-Paar, dann Quickstart, Format, und zwei Abschnitte die es vorher gar nicht gab: „When to use“ und – ausführlicher – „When *not* to use“. Der Anti-Fit-Teil ist der eigentliche Punkt: wer pptx-Export, GUI-Koautoren, Mathe oder ein Cockpit auf dem Tablet braucht, soll das erfahren ohne zu klonen. Dazu ein fairer Vergleich zu reveal.js, Quarto, Beamer, Marp.

Beim Faktencheck herausgefallen und korrigiert: „drei Views“ (sind vier), „dreizehn Chunks über sechs Columns“ (waren 29/9, jetzt 33/10), der `lectures/wlab01/`-Eintrag (Source liegt längst in `psi-slides-mylectures`, hier lagen nur verwaiste HTMLs – gelöscht), und fehlende Flags (`--optimize-images`, `--integrate-annotations`, `--print-notes-only`). **KaTeX ist nie gelandet** – der Header-Kommentar in `build.js` Zeile 13 listet es, `grep -c katex build.js` sagt 0. Im README steht deshalb ausdrücklich „keine Mathe“.

**Browser-Floor, nachgemessen statt behauptet.** Aus MDNs `browser-compat-data` 8.0.8: `oklch()` Chrome 111 / FF 113 / Safari 15.4, `:has()` 105 / 121 / 15.4, `text-wrap: balance` 114 / 121 / 17.5, `@scope` 118 / **146** / 17.4. Wichtig für die Formulierung: `@scope` steht an sieben Stellen und **alle** liegen in `inlineSvg()` – es wrappt nur `<style>`-Blöcke eingebetteter SVGs. Es ist also nicht der bindende Constraint für das Tool, sondern nur für Lectures mit selbstgestylten SVG-Assets. Der reale Boden ist Chrome 114 / FF 121 / Safari 17.5, und das steht so drin, getrennt vom SVG-Sonderfall.

**Screenshots** liegen in `docs/img/`, bewusst **nicht** in einem `assets/`-Ordner einer Lecture, damit sie nie in ein Deck inlined werden und nie am 2-MB-Cap hängen. So sind sie entstanden, damit man sie refreshen kann:

1. `node build.js lectures/tutorial/source.md`
2. Chrome auf `file://…/lectures/tutorial/audience.html`, Viewport 1600×900 (Speaker 1600×1000, print-notes 1200×1400).
3. Auf den Ziel-Chunk springen – es gibt kein Hash-Deeplinking, aber `jumpTo()` ist eine Top-Level-`function` in einem plain `<script>` und damit auf `window`:
   `const all=[...document.querySelectorAll('.chunk')]; jumpTo(all.findIndex(e=>e.id==='derived-mode'), 1)`
   Achtung: der Index zählt die `.chunk-section`-Elemente mit, `flatChunks` ist per `const` deklariert und liegt *nicht* auf `window`.
4. Collapse-Paar: Screenshot, dann `C`, dann nochmal.
5. Nachbearbeitung: `magick "$f" -resize 1920x -strip -colors 192 -define png:compression-level=9`. Bringt das Set von 2,5 MB auf 650 KB, auf flacher UI ohne sichtbaren Verlust. `sips -Z` taugt hier nicht – das Resampling machte eine Datei sogar größer.

**Pages-Demo.** `.github/workflows/pages.yml` baut das Tutorial in CI aus der Source (nicht aus den getrackten HTMLs) und deployt es zusammen mit `docs/site/index.html`. Damit kann die Demo nicht veralten, und der Job ist nebenbei der erste Build-Check den das Repo hat. Muss einmalig unter Settings → Pages → Source: „GitHub Actions“ scharfgeschaltet werden. Project Pages sind pro Repository, es kollidiert also nichts mit anderen Seiten.

**Tutorial.** Neue Schluss-Column `#craft` mit vier Chunks über die *Methode* statt das Werkzeug: Topic-Sentence-Disziplin, die vier Anti-Patterns (Label-Bolds, Ein-Wort-Bolds, Konnektor-Opener, Doppelpunkt-Schnitte), die Wahl zwischen ableiten und ausschreiben, und der Squint-Test. Adaptiert aus dem Authoring-Conventions-Teil von `../psi-slides-mylectures/recap-syntax-and-semantics.md`. `#anti-patterns` ist selbst in einem `::: slide`-Block geschrieben – der Chunk demonstriert den expliziten Modus während er den abgeleiteten erklärt.

**PRD §7** sprach weiterhin von `BroadcastChannel`. Jetzt steht dort nicht nur das Mechanismus-Update, sondern der Grund: Chrome gibt jedem `file://`-Dokument einen eigenen opaken Origin, zwei von der Platte geladene Tabs sind also zueinander cross-origin und ein `BroadcastChannel` im einen erreicht den anderen nie. Weil `file://`-ohne-Server ein §1-Non-Negotiable ist, musste der Kanal `window.postMessage` über das Opener-Handle werden. Fünf weitere Vorkommen im Dokument mitgezogen. `CLAUDE.md`: die Zeilenzahl für `build.js` ist raus (war „~3.800“, real 6.227 – die Zahl veraltet zuverlässig).

**Typografie-Sweep.** `PRD.md` war die letzte Datei mit Em-Dashes und geraden Anführungszeichen: 72 Em-Dashes und 42 gerade Quotes ersetzt, fence- und inline-code-aware, die zwei Em-Dashes *innerhalb* von Code-Blöcken blieben stehen. In `HANDOFF.md` außerdem drei Stellen der klassischen Fehlerform „öffnendes `„` mit ASCII-`"` geschlossen“ repariert plus 28 gerade Quotes auf `„…“` gezogen.

Nicht angefasst (bewusst): die drei `figure-caption-redundant`-Warnungen in `python-intro`, weshalb `node lint.js lectures/ --strict` weiterhin mit 2 endet. Das ist Lecture-Content, kein Doku-Thema. Ebenso offen: `README` verlinkt noch keine Live-Demo, weil Pages erst nach dem Push aktiviert werden kann – eine Zeile, sobald die URL steht.

## Math-Slice (KaTeX, build-time, konditionaler Font-Payload)

Auslöser: beim Doku-Pass fiel auf, dass `build.js` KaTeX im Header-Kommentar führt, aber `grep -c katex build.js` 0 sagt – die Doku hat ein Feature versprochen, das nie gelandet war. PRD §2 und §9 Schritt 4 spezifizieren `$inline$` / `$$block$$` mit Build-Zeit-Rendering seit jeher; dieser Slice implementiert einfach die Spec.

**Warum Build-Zeit und nicht Runtime.** Steht so schon in §9: kein LaTeX-Flash beim Kameraschwenk. Der eigentliche Zwang ist aber §1 – die Outputs müssen aus `file://` ohne Server öffnen. Ein Runtime-KaTeX bräuchte ein Script-Tag; ein Build-Zeit-KaTeX braucht nur die Fonts.

**Und die Fonts sind das ganze Design-Problem.** Rendern sind drei Zeilen. Die 20 woff2-Faces sind 254 KB, base64 rund 350 KB, mal vier Views – das kann man nicht jeder formelfreien Lecture aufdrücken. Also zwei Stufen:

1. Das Stylesheet wird **nur** emittiert, wenn das gerenderte HTML tatsächlich `class="katex` enthält. Eine Lecture ohne Mathe zahlt exakt null Bytes (verifiziert: `grep -c KaTeX_ lectures/demo/audience.html` → 0).
2. Innerhalb dessen nur die tatsächlich benutzten Font-Familien. Welche Klasse zu welcher Familie gehört, wird **aus `katex.min.css` geparst**, nicht im Code tabelliert – die CSS weiß das selbst (`.amsrm{font-family:KaTeX_AMS}`), und ein KaTeX-Upgrade kann die Zuordnung dann nicht stillschweigend brechen. Gleiche Haltung wie `imageSize()`. Praxis: Tutorial 3 Familien / 119 KB, ein Entropie-lastiges Test-Chunk 5 Familien / 129 KB, statt 254 KB.

Nicht gemacht, bewusst: Subsetting auf **Face**-Ebene (Main-Bold und Main-BoldItalic sind zusammen 42 KB und oft ungenutzt). Ableitbar wäre es – dieselben CSS-Regeln setzen auch `font-weight`/`font-style` – aber ein übersehenes Face heißt synthetisch fetter Text, und für ein Tool mit diesem Typografie-Anspruch ist das der falsche Trade. Kandidat für später.

**Der Bug, der das Ganze interessant machte.** Die Delimiter laufen als `marked`-Extensions, nicht als Regex-Vorlauf über den Source-String – dadurch sind Fences schon konsumiert, bevor Mathe drankommt. Für **inline** stimmte diese Begründung aber nicht: marked ruft Custom-Inline-Extensions **vor** dem eigenen `codespan`-Tokenizer. Gemessen, nicht theoretisiert:

```
a price of $5 and $10, `$PATH` in code, and Lapsus$ end.
```

wurde zu einer Formel mit dem Inhalt ``10, ` `` – das `$10` paarte sich mit dem `$` *innerhalb* des Code-Spans und fraß den öffnenden Backtick. Fix: Backtick aus der Content-Klasse ausschließen (`[^\\$\n\`]`). Damit kann Mathe eine Inline-Code-Grenze in keiner Richtung mehr überqueren, und ein Dollar-Paar komplett *innerhalb* von Backticks wird nie exponiert, weil `codespan` den Span vorher konsumiert.

Die Kantenfälle, an denen das hängt (kein Test-Verzeichnis, per Konvention – aber der Slice hat gezeigt, dass sie sich lohnen). Als Wegwerf-Script gegen `marked` nach dem Import von `build.js` laufen lassen, erwartetes Ergebnis in Klammern:

- `Size $|S|$ matters.` (Mathe) · `$$d = \frac{H}{\log_2 n}$$` (Mathe)
- `Costs $5 and $10 in total.` (kein Mathe) · `A literal \$ sign` (kein Mathe)
- ``Shell `export $PATH` here.`` (kein Mathe) · ``a price of $5 and $10, `$PATH` in code, and Lapsus$ end.`` (kein Mathe, **und** der Code-Span muss als `<code>$PATH</code>` überleben – das ist die Regression)
- ``  `cost: $a$ dollars` `` (kein Mathe) · Fence mit `$HOME` (kein Mathe) · Fence mit `$$not display$$` (kein Mathe)
- `Lapsus$ is the group.` (kein Mathe) · `$ x $ has spaces.` (kein Mathe) · `Multi\nline $a\nb$ no.` (kein Mathe)
- `Set $A$ and set $B$ differ.` (Mathe) · `Bold **$x^2$** works.` (Mathe) · Liste mit `$\alpha$` (Mathe) · `$$` auf eigenen Zeilen (Mathe)

**Collapse.** Zwei Guards in `splitSentencesIn`, beide notwendig und der zweite erst durch einen Screenshot aufgefallen. `wrapProse` darf nicht *in* das KaTeX-Markup absteigen – die verschachtelten Spans tragen die Layout-CSS, dazwischengeschobene `span.prose` zerlegen die Formel sichtbar. Aber „nicht absteigen“ allein war falsch: Inline-Mathe in Fortsetzungsprosa blieb dann stehen, während die Wörter drumherum verschwanden, und die kollabierte Folie zeigte „an observed message.|S|“. Richtig ist **wrappen statt absteigen**: die Formel bekommt selbst ein `span.prose`, verschwindet mit ihrem Satz und bleibt innen unangetastet. Dritter Guard: der Satzende-Test darf `textContent` einer Formel nicht prüfen, weil KaTeX eine versteckte MathML-Kopie mitliefert und das nicht der Text ist, den der Leser sieht.

Display-Mathe ist block-level und wird von den `topic-bold`-Regeln gar nicht erfasst – es bleibt stehen wie eine Figur oder ein Code-Block. Das ist die gewollte Semantik und kostete keine Zeile CSS.

**Figure-Focus.** `.chunk-body .math-display` ist in die fokussierbaren Elemente aufgenommen – eine Formel ist genau das, was ein Raum größer sehen will. Dabei fiel auf, dass der Selektor an **fünf** Stellen wörtlich dupliziert war, und die Speaker-Sync adressiert Fokus-Ziele über `figureIdx`, also über die Position in genau dieser Liste. Zwei auseinandergelaufene Kopien hätten die beiden Fenster auf verschiedene Elemente fokussieren lassen. Jetzt eine Konstante `FOCUSABLE_SEL` oben in `AUDIENCE_JS`.

**Fehlerverhalten.** `throwOnError: false` – eine kaputte Formel rendert rot statt den Build zu killen, weil ein Tippfehler mitten in der Vorlesung nicht den Projektor leeren darf. Damit sie nicht stumm ausgeliefert wird, prüft `renderMath` das Ergebnis auf `katex-error` und `buildOnce` meldet sie dedupliziert auf dem Terminal. `lint.js` hat zusätzlich `unclosed-math` (fence-aware, zero-dep); Inline-`$` wird bewusst nicht geprüft, weil ein einzelner Dollar in Prosa legitim ist.

**Regression.** Alle drei Lectures bauen, `lint.js lectures/` unverändert bei 3 Warnungen (die bekannten `figure-caption-redundant` in python-intro), Tutorial jetzt 10 Columns / 34 Chunks mit einem `#math`-Chunk als lebendem Beispiel. Der Header-Kommentar in `build.js`, der KaTeX als deferred führte, ist korrigiert.

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
5. **`::: side` nur mit `::: flip` als Separator, keine Mehrfach-Panes.** Drei-Pane-Layouts sind Overkill für Slide-Content; `cols 3` deckt die „drei gleichberechtigte Spalten“-Use-Case ab.
6. **Marginalia ist *rechts*, nicht *links*.** PRD §2 schreibt linke-Annotation für Speaker-Marginalia (N-Hotkey). Marginalia als authored-content gehört pedagogisch auf die *rechte* Seite (westlicher Lesefluss: Haupttext lesen, dann Marginalia am rechten Rand als „Seitenbemerkung“). Die Annotation-Box kollidiert damit nicht – die ist weiterhin links. **Nach dem Polish-Pass gilt außerdem**: Marginalia ist weiterhin verfügbar, sollte aber sparsam eingesetzt werden – Expandables sind der bevorzugte Tuckaway-Mechanismus, weil sie on-demand geöffnet werden, nicht dauerhaft Platz kosten und im Collapse-Mode unsichtbar sind.
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

- **`--assign-ids` + Linter-Build-Integration.** Klein (~150 Zeilen), schließt den Authoring-Loop zu „edit → save → build+lint → reload“. Gut für Phase 1 Abschluss.
- **Mermaid-Pipeline** (fenced `mermaid` block → `@mermaid-js/mermaid-cli` → inline SVG). Symmetrisch zu dem Image-Shorthand-Resolver (build-time render, static inline SVG). ~250 Zeilen.

**KaTeX** bleibt deferred bis zur ersten Math-Lecture.

Nicht-geerntet aus dem Simplify-Pass (bewusst geskippt, kurz dokumentiert damit sie nicht verloren gehen):

- **`applyState` broadcasted unconditionally** – einzelne Aktionen wie `setZoom` rufen `applyState` und direkt danach nochmal `broadcastState`, d.h. zwei postMessage-Snapshots pro User-Action. Fix wäre ein Mikrotask-Debounce oder einfach `applyState` nicht broadcasten lassen und jede Aktion explicit `broadcastState` anschieben. Wurde ausgespart, weil das Sync-Protokoll empfindlich ist und ich keinen passenden End-to-End-Test hatte.
- **Head-Boilerplate zwischen `renderAudience` und `renderSpeaker`.** `<!DOCTYPE>`/`<meta>`/`<title>` plus `#mode-badge` und `${renderTocNav}` stehen ziemlich identisch in beiden Renderern. Eine gemeinsame `renderSharedHead(title, opts, extraCss)`-Helper-Funktion wäre möglich; die Divergenzen (`data-view`, `<title>`-Suffix, `#laser-pointer` nur audience) machen das aber zu einem non-trivialen Refactor mit vielen Branches – mehr Churn als Wert. Offen als Kandidat für später, falls ein dritter Live-View dazukommt.
- **Stringly-typed `'forward'`/`'back'`-Directions** in `jumpTo`. Ein Tippfehler landet stumm im „preserve“-Branch. Könnte zu `const DIR = { FORWARD, BACK }` werden; low impact, nicht gemacht.

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
