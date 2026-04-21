# Handoff – nach Linter + python-intro-Lecture

Stand nach Commit `b4b83ac`. Phase 1 ist weit fortgeschritten; die tragenden drei Outputs (audience, print, speaker) existieren und synchronisieren live über `window.postMessage` zwischen Audience und ihrer per `S` gespawnten Speaker-Window (cross-`file://`-fähig, ein Transport, kein HTTP-Server nötig). Der Authoring-Loop ist mit `--watch` (Live-Reload), `--new` (Scaffold) und `lint.js` (Static-Checks) jetzt rund; wlab01 ist als Demo der vollen Tag-/Width-/Reveal-Vokabel aufgewertet. Der vorherige Pass war ein UX-Cleanup (Speaker-`N` öffnet wieder die Annotation-Box, Overview-Click-to-Select, Shift-Drag-Pan, editierbare Speaker-Notes, Laser-Pointer). Der letzte Pass hat zwei parallele, voneinander unabhängige Slices geliefert: einen Linter (`lint.js`, zero-dep, neben `build.js`) und eine komplett neue Demo-Lecture `python-intro`, die sich pädagogisch von Setup bis zu einem Playwright-basierten Link-Scanner zieht.

## Was seit dem letzten Handoff gebaut wurde

Commits, chronologisch (neueste zuerst):

```
b4b83ac  lint: static checks for source.md files
c461967  HANDOFF: UX bugfix pass + laser pointer feature
c6758a5  python-intro: new lecture – Python basics to Playwright scanner
a4b52e0  feat: laser pointer – mirror speaker mouse to audience
7017ee5  feat: editable speaker notes with localStorage override
4151062  feat: shift-drag pan in normal view
7ded1f6  fix: speaker N opens annotation, overview click selects
b404dc5  HANDOFF: reflect postMessage transport swap
31735fa  sync: replace BroadcastChannel with window.postMessage
a51fb5a  HANDOFF: split out code-highlighting + python-intro lecture as next slice
3d20376  HANDOFF: --watch + --new + wlab01 rework
08ea25a  wlab01: rework with reveals, principles, narrow widths
5d5dbd4  build: --new <slug> scaffolds a new lecture
27677c2  build: --watch with live-reload via WebSocket
6158952  HANDOFF: reflect simplify + HANDOFF commits in the chronology
95c67b2  simplify: reuse helpers, cleaner broadcast gate, guarded speaker refresh
cfd04c7  HANDOFF: after the speaker slice – content fidelity vs. authoring workflow
086c98b  speaker.md: openExp is synced, not audience-only
392899a  speaker: BroadcastChannel sync – audience ↔ speaker
0c1219c  build: speaker.html view (static – scrubber, mirror, notes, previews, timer)
71771cb  speaker: spec for the speaker view and sync protocol
97e57c8  audience: overview (O), TOC (T), fulltext search (/)
a7bcd0e  retire wlab01/lecture.html; HANDOFF to next slice (overview, TOC, /)
8d64de2  audience: pre blocks stay left-aligned in figure chunks
71aeb99  build: audience.html renderer (nav, reveal, collapse, annotations)
```

Kurzbeschreibung der Slices:

1. **Audience-Renderer** (`71aeb99`, `8d64de2`): `build.js` emittiert `audience.html` aus `source.md` mit 2D-Stage, Per-Tag-Treatments, Title-Slide (lower-left-third), Progressive-Reveal (§4.6), Collapse-Modes (§4.5), Annotations mit localStorage, Expand-Chevrons.
2. **Overview / TOC / Fulltext** (`97e57c8`): `O` für Birds-eye, `T` für rechtes TOC-Panel, `/` für Fulltext-Suche im Overview. Click-to-select, zweites `O` oder Enter landet.
3. **Speaker-View + Sync** (`71771cb`, `0c1219c`, `392899a`, `086c98b`, `31735fa`): Dritter Output `speaker.html`. Drei Panels (Scrubber, Current-Chunk-Mirror + Notes-Pane, Next-Previews). Live-Sync beide Richtungen mit Full-State-Snapshots. Push-Toggle (`Shift-P`), Force-Push (`.`), Hello-Handshake. Transport seit `31735fa` ist `window.postMessage` über die opener/popup-Referenzen statt BroadcastChannel – funktioniert auch zwischen zwei `file://`-Pages.
4. **Simplify-Pass** (`95c67b2`): Reuse (renderTitleBlock, renderTocNav), cleaner broadcast-gate via `viewHooks.shouldBroadcast` statt `window.pushEnabled`-Leak, `applyRemoteState` ohne doppelten `applyState`-Call, Guard auf `populatePreviewStrip` damit Annotation-Keystroke-Sync nicht drei DOM-Clones pro Zeichen rebuildet. -18 Zeilen netto, keine Verhaltensänderung.
5. **`--watch` Live-Reload** (`27677c2`): `node build.js <src> --watch` startet einen WS-Server auf einem freien Port, baut bei jedem Save neu (fs.watch + 80 ms Debounce) und triggert `location.reload()` in offenen Tabs. Reconnect-Loop im Snippet überlebt Watch-Restarts. `ws` ist devDep – Production-HTMLs bleiben statisch ohne WS-Snippet.
6. **`--new <slug>` Scaffold** (`5d5dbd4`): `node build.js --new wlab02` legt `lectures/wlab02/source.md` + `assets/` an. Slug-Regex `^[a-z][a-z0-9-]*$`. Non-destruktiv (refused wenn Dir existiert). Scaffold-Source hat TODO-Sentinel-Strings in Frontmatter + ersten Chunk, baut aber sofort sauber durch.
7. **wlab01-Content-Rework** (`08ea25a`): `lectures/wlab01/source.md` zieht jetzt durch die volle Phase-1-Vokabel. 21 → 23 Chunks, 3 principle (von 1), 5 narrow (von 0), 10 Chunks mit Reveal-Segments, 4 Directives (von 2). Kein Content entfernt oder umsortiert – nur Re-Tagging, Width-Promotions und `---`-Splits.
8. **UX-Bugfix-Pass** (`7ded1f6`, `4151062`, `7017ee5`, `a4b52e0`): vier zusammenhängende Korrekturen + eine Mirror-Feature. (a) Speaker-`N` öffnet jetzt die Annotation-Box statt die Notes-Pane zu fokussieren (PRD §2-konform). Notes-Pane ist über Click fokussierbar. (b) Overview-Click setzt selectedIdx korrekt – der eager `setPointerCapture` hatte den synthetischen Click-Event auf den darunterliegenden Chunk verschluckt. (c) Shift-Drag in normaler View pant die Kamera (manualPan jetzt auch für non-overview, reset bei Chunk-Navigation, Esc resettet manuell). (d) Speaker-Notes sind als textarea editierbar, mit Per-Chunk-localStorage-Override, Source-`> note:`-Inhalt als Default. (e) Laser-Pointer: Speaker-Mausbewegung mirroring zur Audience als kleiner Dot, Position als Bruchteil des aktiven Chunks (zoom-tolerant), rAF-throttled.
9. **python-intro-Lecture** (`c6758a5`): englischsprachige Demo-Lecture, 34 Chunks über 8 Columns, von Setup (`uv` + pip-Fallback) über Python-Grundlagen, Stdlib-Auswahl (`pathlib`, `urllib.parse`, `re`, `dataclasses`, `argparse`), Async-Basics bis zu einem einfachen Playwright-Link-Scanner, der Broken-Links, fehlende Titles und fehlende Meta-Descriptions meldet. Nutzt die volle Vokabel: 4× principle, 2× definition, 17× example, 3× figure, 1× question, 1× exercise, 5× free. Zwei ASCII-Figures tragen die schwersten Konzepte: `#async-timeline` (sync vs. async side-by-side) und `#scanner-pipeline` (Shape vor dem Code). Code-Fences haben Sprach-Annotationen (` ```python`, ` ```bash`) und highlighten automatisch, sobald shiki landet. Scanner-Code wurde gegen `docs.python.org/3/` und `httpbin.org/links/10/0` getestet.
10. **Linter** (`b4b83ac`): `lint.js`, standalone-CLI, zero-dep, neben `build.js` (nicht darin). Mirrored bewusst die Parser-Ground-Truth (VALID_TAGS, VALID_WIDTHS, Attribute-Tail, fence-aware Reveals, `:::`-Directives) statt zu importieren, damit der Build parallel weitergebaut werden kann. Errors: `missing-id`, `duplicate-id`, `unknown-tag`, `unknown-width`, `multiple-ids`, `nested-directive`, `stray-directive`, `stray-directive-close`, `unclosed-directive`. Warnings: `title-count`, `orphan-column`, `density` (per-Tag-Budget: principle 80 / question 80 / definition 200 / example 250 / free 250 / exercise 350 / figure+title unlimited), `reveal-overuse` (>50%). Per-File-Override via `<!-- linter: ignore rule1,rule2 -->` – löst das wlab01-Problem (43% Reveals intentional), ohne die globale Schwelle zu verschieben. CLI: `node lint.js <file|dir> [--strict]`. Output im `file:line severity rule message`-Format. Alle drei bestehenden Lectures (`demo`, `wlab01`, `python-intro`) laufen clean durch.

## Was jetzt definitiv funktioniert

- `node build.js <source.md>` → `print.html` + `audience.html` + `speaker.html` in denselben Ordner.
- `node build.js <source.md> --watch` → einmal bauen, WS-Server starten, fs.watch auf Source, jeder Save → Tab-Reload binnen ~80 ms.
- `node build.js --new <slug>` → `lectures/<slug>/source.md` + `assets/` mit baubarem Phase-1-Scaffold.
- `node lint.js <file|dir> [--strict]` → Static-Checks (IDs, Tags, Widths, Directives, Density, Reveal-Overuse). Exit 0 clean, 1 bei Errors, 2 bei `--strict` + Warnings.
- Flags: `--audience-only`, `--print-only`, `--speaker-only` (mutually exclusive). Kombinierbar mit `--watch`.
- Parser-Features: frontmatter, columns (`#`), chunks (`##`) mit attribute tails (`{.width #id}`), `::: expand <label>`, `::: margin`, `> note:` (multi-line, orphan-safe), reveal-separator `---`, fence-aware Code-Blöcke.
- Audience-Runtime: Arrows, Space-Reveal-mit-Passthrough, Enter/1-9 Expand, Esc (Pan-Reset → Annotation-Blur → Expansion-Close), N Annotate, C Collapse-Cycle, +/-/0 Zoom, B Blank, P Print, O Overview, T TOC, / Fulltext, S öffnet Speaker, ?-Hints-Toggle, Shift-Drag pant.
- Speaker-Runtime: wie Audience plus Scrubber-Click, editierbare Notes-Pane (Click-fokussiert), Timer, Shift-P Push-Toggle, `.` Force-Push, Mausbewegung über Stage mirroring als Laser-Pointer zur Audience.
- Sync via `window.postMessage`: activeIdx, revealed, collapse, zoom, blanked, annotations, openExp (state-snapshot), plus cursor-mirror (chunkIdx + Bruchteil-Koordinaten). Audience hält die Speaker-Window-Referenz aus `S`-Spawn, Speaker hält `window.opener`. Receiver adoptiert `ev.source` als peer (Audience-Reload-Recovery automatisch). Hello-Handshake beim Speaker-Boot, Audience antwortet mit Snapshot. `isApplyingRemote`-Guard verhindert Loops.
- Speaker-Notes: pro Chunk localStorage-Override (key `psi-lecdoc:<title>:speakernote:<chunk-id>`); leerer String ist valide (clear), Default ist die source-`> note:`-Inhalte. Markdown wird *nicht* gerendert (Plain-Text-Textarea); Markdown-Render und Export-zurück-zu-Source sind deferred features.
- Live-Lecture: zwei Tabs nebeneinander – beide navigieren gemeinsam, Shift-P schaltet Speaker in Vorschau-Modus, `.` resyncht.
- Lectures: `lectures/demo/source.md` (4 cols / 8 chunks mit 2-Segment-Reveal-Test), `lectures/wlab01/source.md` (7 cols / 23 chunks / 8 Speaker-Notes / 3 Expand / 1 Margin / 10 Chunks mit Reveal-Segments / 5 narrow / 3 principle), und `lectures/python-intro/source.md` (8 cols / 34 chunks / 4 principle / 17 example / 3 figure inkl. 2 ASCII-Diagramme) bauen sauber und linten clean.
- phase0/ steht als Referenz-Archiv; `lectures/wlab01/lecture.html` (das handgeschriebene Original) ist retired.

## Was noch offen ist (Phase-1-Restliste)

In absteigender Priorität bezogen auf realen Lecture-Einsatz. Die Liste ist die Differenz zwischen PRD §11 Phase 1 und dem aktuellen Build-State.

### Content-Fidelity

1. **Code-Highlighting** – Build-time mit [shiki](https://shiki.style) (reiner Static-HTML-Output, keine Runtime-Abhängigkeit). Kleiner Commit, wirkt in allen drei Views gleich. **Jetzt besonders motiviert**, weil `python-intro` steht und mit plain-text Code-Blocks aktuell blass wirkt; Source-Fences tragen bereits die Sprach-Annotationen, es fehlt nur die Render-Stufe.
2. **KaTeX build-time** – Aktuell rendern `$...$` und `$$...$$` als Literal. Jede Mathe-Vorlesung braucht das. Build-time-Render mit KaTeX (dependency bereits in PRD angedacht §9 Schritt 4) in `build.js` einbauen; sowohl audience als auch print und speaker bekommen fertig-gerenderte HTML + CSS-Import.
3. **Image shorthand** – `![](fig-id)` → `images/fig-id.{svg,png,jpg}` auflösen, Dimensionen einlesen, als `<figure>` einbetten. PRD §9 Schritt 3. Ohne das gibt es keine echten Figuren. Pair: **Mermaid build-time** – `::: mermaid`-Directive oder ```` ```mermaid ````-Fence → `@mermaid-js/mermaid-cli` headless → SVG-Inline. Motiviert durch die zwei ASCII-Figures in `python-intro`, die ein mechanischer Mermaid-Port wären (Timeline → `gantt`, Pipeline → `flowchart TD`).

### Authoring-Workflow

4. **`--assign-ids`** – PRD §9: ein-Shot-Pass der fehlende `{#id}`-Attribute in-place hinzufügt und committet. Pair mit dem Linter: Linter meldet `missing-id`, `--assign-ids` erzeugt sie. Slug-Logik: heading-to-kebab-case, Kollisions-Suffix `-2`, `-3`.
5. **Linter-Integration** – aktuell läuft `lint.js` manuell. Naheliegende Erweiterungen: (a) `--watch`-Mode, der gegen jeden Save lintet und in der Konsole rot/grün meldet; (b) Build-Hook, der `build.js` vor dem Emit einen Lint-Pass laufen lässt und bei Errors abbricht (opt-in per `--lint`-Flag oder per default mit `--no-lint` als Escape). Beides baut *auf* den aktuellen Linter auf und braucht keine Änderung an den Regeln.

### Verfeinerungen am bestehenden Code

6. **Camera-Framing bei expandierten langen Chunks** – aktuell zentriert die Kamera die Expansion-Body, schneidet dabei oben/unten ab. Hier wäre eine Hybrid-Logik sinnvoll: scroll-in-chunk, wenn höher als Viewport.
7. **In-Chunk-Wheel-Scroll** – phase0 hatte das; Arrows navigieren Chunks, Wheel scrollt *innerhalb*. Wichtig bei Chunks höher als Viewport.
8. **Margin-Notes ins linke Lane** – aktuell rendern `::: margin`-Blöcke inline unter dem Body. PRD §2 skizziert das linke Lane analog zur Annotation-Box. Klein, kosmetisch.
9. **Persistence-Snapshot alle 5s** – Speaker hat nur activeIdx + annotations persistiert. Spec §5 will den vollen Snapshot + elapsedSeconds alle 5s für Crash-Recovery.
10. **Font-Loading** – Audience + Speaker laden Fonts noch nicht explizit; fallback auf System-Fonts. PRD will self-hosted WOFF2. Ohne das sieht es auf anderen Maschinen anders aus.
11. **Build-time Geometry (pretext)** – Deep-links und Speaker-Sync laufen aktuell über CSS-native Messung. PRD §9 Schritt 5 will pretext für deterministische Chunk-Positionen. Beobachtung aus dem Rework: Deep-Link auf `audience.html#schemes` aktiviert nicht den Schemes-Chunk (lands auf `lenses`) – das ist genau die Klasse von Bugs, die Build-time-Geometry behebt.

## Empfehlung für den nächsten Slice

Drei sinnvolle Pakete plus ein aufgeschobenes, wähle eines:

**A. Code-Highlighting** (Posten 1 oben). Jetzt der hochwirksamste Einzelposten: `python-intro` steht und wartet auf Highlighting – jedes der 17 `example:`-Chunks ist ein plain-text Code-Block, der mit shiki sofort deutlich besser aussieht, ohne dass eine Zeile Source geändert werden muss (Sprach-Annotationen sind drin). Build-time mit [shiki](https://shiki.style), reiner Static-HTML-Output. Sub-Entscheidungen: Theme (Light/Dark, OKLCH-kompatibel) und Sprach-Whitelist. Kleiner Commit, ~80–120 Zeilen, ein bis zwei Commits.

**B. `--assign-ids` + Linter-Integration** (Posten 4–5 oben). Jetzt schnell lohnend, weil der Linter steht: `--assign-ids` macht aus dem harten `missing-id`-Error einen Ein-Befehl-Fix, und eine Build-Integration (`build.js` ruft `lint.js` vor dem Emit) macht Tippfehler *unsichtbar bis zum nächsten Save* statt *sichtbar erst im Browser*. Zusammen schließen beide den Authoring-Loop: editieren → save → `--watch` baut + lintet → Browser reloaded mit sauberer HTML. Mittelgroß, ~150 Zeilen, zwei Commits.

**C. Mermaid + Image-Shorthand** (Posten 3 oben). Die zwei ASCII-Figures in `python-intro` sind ein konkreter Motivator: beide wären mechanische Mermaid-Ports. Image-Shorthand `![](fig-id)` aus PRD §9 Schritt 3 ist der größere Teil; Mermaid lässt sich als spezieller Fall derselben Pipeline denken (fenced code → build-time render → inline SVG). ~250 Zeilen über 2–3 Commits.

**D. KaTeX.** Sobald die nächste reale Vorlesung Mathe enthält. Aktuell keine Math-Lecture in der Pipeline, daher nicht dringend.

Die Verfeinerungen (6–11) sind jeweils eigene kleine Commits und können dazwischen laufen.

## Arbeitsstil

- Wir sind per du.
- Keine em-dashes im Output – en-dashes (`–`) oder `&ndash;`. Harte User-Präferenz, siehe auto-memory.
- Keine Zeit- oder Datumsschätzungen in Task-Files (global CLAUDE.md).
- Commits einzeln, fokussiert, mit erklärendem Body.
- Explanatory output style: Vor und nach Code-Edits einen `★ Insight ─────` Block mit 2-3 Punkten.
- User ist Fast. Wenige offene Entscheidungen kurz klären, dann los.
- Spec-First-Prinzip wenn die Entscheidungs-Komplexität hoch ist (siehe `speaker.md`); sonst direkt codieren.
- Paritätsprüfungen per Playwright im Browser nach jedem größeren UI-Slice.

## Start-Ritual

1. `git log --oneline -15` – die letzten Commits sind der Kontext.
2. `PRD.md §11 (Phase 1)` und `§9 (Build system)` überfliegen – das ist der Masterplan.
3. `speaker.md` als Beispiel, wie Specs in diesem Repo aussehen.
4. `build.js` als Ganzes durchlesen – der relevante Teil ist inzwischen eine Datei, die auf ~2540 Zeilen gewachsen ist. Struktur: parser → reloadScript-Helper → print renderer + CSS → audience renderer + CSS + JS → speaker renderer + CSS + JS → buildOnce/runWatch/runNew → CLI.
5. `lint.js` einmal angucken, wenn Linter-nahe Arbeit ansteht – er ist bewusst zero-dep und parser-paralleles zu `build.js` (siehe Slice 10 oben).
6. Nächsten Slice aus der Empfehlung wählen (A: Code-Highlighting, B: `--assign-ids` + Lint-Integration, C: Mermaid+Images, D: KaTeX).
7. Vor Codezeile 1 den User fragen, welchen Slice, und ob bestimmte Sub-Entscheidungen (z.B. shiki-Theme, Mermaid-Renderer, KaTeX-CSS-Bundling) zuerst geklärt werden sollen.
