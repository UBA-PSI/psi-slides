# Handoff – nach Authoring-Workflow + wlab01-Rework

Stand nach Commit `31735fa`. Phase 1 ist weit fortgeschritten; die tragenden drei Outputs (audience, print, speaker) existieren und synchronisieren live über `window.postMessage` zwischen Audience und ihrer per `S` gespawnten Speaker-Window (cross-`file://`-fähig, ein Transport, kein HTTP-Server nötig). Der Authoring-Loop ist mit `--watch` (Live-Reload) und `--new` (Scaffold) jetzt kurz; wlab01 ist als Demo der vollen Tag-/Width-/Reveal-Vokabel aufgewertet worden. Dieser Handoff beschreibt den aktuellen Zustand, was definitiv funktioniert, und welche Phase-1-Posten noch offen sind.

## Was seit dem letzten Handoff gebaut wurde

Commits, chronologisch (neueste zuerst):

```
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

## Was jetzt definitiv funktioniert

- `node build.js <source.md>` → `print.html` + `audience.html` + `speaker.html` in denselben Ordner.
- `node build.js <source.md> --watch` → einmal bauen, WS-Server starten, fs.watch auf Source, jeder Save → Tab-Reload binnen ~80 ms.
- `node build.js --new <slug>` → `lectures/<slug>/source.md` + `assets/` mit baubarem Phase-1-Scaffold.
- Flags: `--audience-only`, `--print-only`, `--speaker-only` (mutually exclusive). Kombinierbar mit `--watch`.
- Parser-Features: frontmatter, columns (`#`), chunks (`##`) mit attribute tails (`{.width #id}`), `::: expand <label>`, `::: margin`, `> note:` (multi-line, orphan-safe), reveal-separator `---`, fence-aware Code-Blöcke.
- Audience-Runtime: Arrows, Space-Reveal-mit-Passthrough, Enter/1-9 Expand, Esc, N Annotate, C Collapse-Cycle, +/-/0 Zoom, B Blank, P Print, O Overview, T TOC, / Fulltext, S öffnet Speaker, ?-Hints-Toggle.
- Speaker-Runtime: wie Audience plus Scrubber-Click, Notes-Pane-`N`, Timer, Shift-P Push-Toggle, . Force-Push.
- Sync via `window.postMessage`: activeIdx, revealed, collapse, zoom, blanked, annotations, openExp. Audience hält die Speaker-Window-Referenz aus `S`-Spawn, Speaker hält `window.opener`. Receiver adoptiert `ev.source` als peer (Audience-Reload-Recovery automatisch). Hello-Handshake beim Speaker-Boot, Audience antwortet mit Snapshot. `isApplyingRemote`-Guard verhindert Loops.
- Live-Lecture: zwei Tabs nebeneinander – beide navigieren gemeinsam, Shift-P schaltet Speaker in Vorschau-Modus, `.` resyncht.
- Lectures: `lectures/demo/source.md` (4 cols / 8 chunks mit 2-Segment-Reveal-Test) und `lectures/wlab01/source.md` (7 cols / 23 chunks / 8 Speaker-Notes / 3 Expand / 1 Margin / 10 Chunks mit Reveal-Segments / 5 narrow / 3 principle) bauen sauber.
- phase0/ steht als Referenz-Archiv; `lectures/wlab01/lecture.html` (das handgeschriebene Original) ist retired.

## Was noch offen ist (Phase-1-Restliste)

In absteigender Priorität bezogen auf realen Lecture-Einsatz. Die Liste ist die Differenz zwischen PRD §11 Phase 1 und dem aktuellen Build-State.

### Content-Fidelity

1. **KaTeX build-time** – Aktuell rendern `$...$` und `$$...$$` als Literal. Jede Mathe-Vorlesung braucht das. Build-time-Render mit KaTeX (dependency bereits in PRD angedacht §9 Schritt 4) in `build.js` einbauen; sowohl audience als auch print und speaker bekommen fertig-gerenderte HTML + CSS-Import.
2. **Image shorthand** – `![](fig-id)` → `images/fig-id.{svg,png,jpg}` auflösen, Dimensionen einlesen, als `<figure>` einbetten. PRD §9 Schritt 3. Ohne das gibt es keine echten Figuren.
3. **Code-Highlighting** – Build-time mit [shiki](https://shiki.style) (reiner Static-HTML-Output, keine Runtime-Abhängigkeit). Kleiner Commit, wirkt in allen drei Views gleich.

### Authoring-Workflow

4. **Linter** – PRD §9: Build-Errors (missing IDs, duplicate IDs, dead images, nested directives, unknown tags) und Warnings (density budget, reveal overuse, orphan columns, title count). Sehr hochwirksam – macht den Build vertrauenswürdig. Nach dem wlab01-Rework gibt es konkrete Erfahrungswerte: die Reveal-Overuse-Warning hat bei 43% Reveal-Anteil eine *intentional deviation* zu erlauben (Outline-Lecture mit listen-zentriertem Inhalt). Linter sollte einen `# linter: ignore reveal-overuse` o.ä. Override-Mechanismus haben oder die Schwelle pro Tag-Klasse differenzieren.
5. **`--assign-ids`** – PRD §9: ein-Shot-Pass der fehlende `{#id}`-Attribute in-place hinzufügt und committet. Pair mit dem Linter: Linter fordert IDs, `--assign-ids` erzeugt sie.

### Verfeinerungen am bestehenden Code

6. **Camera-Framing bei expandierten langen Chunks** – aktuell zentriert die Kamera die Expansion-Body, schneidet dabei oben/unten ab. Hier wäre eine Hybrid-Logik sinnvoll: scroll-in-chunk, wenn höher als Viewport.
7. **In-Chunk-Wheel-Scroll** – phase0 hatte das; Arrows navigieren Chunks, Wheel scrollt *innerhalb*. Wichtig bei Chunks höher als Viewport.
8. **Margin-Notes ins linke Lane** – aktuell rendern `::: margin`-Blöcke inline unter dem Body. PRD §2 skizziert das linke Lane analog zur Annotation-Box. Klein, kosmetisch.
9. **Persistence-Snapshot alle 5s** – Speaker hat nur activeIdx + annotations persistiert. Spec §5 will den vollen Snapshot + elapsedSeconds alle 5s für Crash-Recovery.
10. **Font-Loading** – Audience + Speaker laden Fonts noch nicht explizit; fallback auf System-Fonts. PRD will self-hosted WOFF2. Ohne das sieht es auf anderen Maschinen anders aus.
11. **Build-time Geometry (pretext)** – Deep-links und Speaker-Sync laufen aktuell über CSS-native Messung. PRD §9 Schritt 5 will pretext für deterministische Chunk-Positionen. Beobachtung aus dem Rework: Deep-Link auf `audience.html#schemes` aktiviert nicht den Schemes-Chunk (lands auf `lenses`) – das ist genau die Klasse von Bugs, die Build-time-Geometry behebt.

## Empfehlung für den nächsten Slice

Drei sinnvolle Pakete, wähle eines:

**A. Linter** (Posten 4 oben). Jetzt der hochwirksamste Einzelposten: `--watch` macht die Feedback-Schleife schon kurz, aber ohne Linter sind Tippfehler in IDs/Tags/Width-Klassen erst nach dem Browser-Refresh sichtbar (oder unsichtbar). Errors first (missing/duplicate IDs, unknown tags, nested directives), dann Warnings (density, reveal overuse mit Tag-Differenzierung, orphan columns, title count). Mittelgroß, ~200 Zeilen, ein bis zwei Commits.

**B. Code-Highlighting + Python-Tutorial-Lecture.** Gekoppelter Slice: das eine ist Build-Feature, das andere ist die Lecture, die das Feature *braucht* und gleichzeitig real motiviert.

  - **Code-Highlighting:** Build-time mit [shiki](https://shiki.style) – reiner Static-HTML-Output, keine Runtime-Abhängigkeit, wirkt in audience/print/speaker gleich. Theme-Wahl (Light + Dark, OKLCH-kompatibel) und Sprach-Whitelist sind die einzigen Sub-Entscheidungen. Triple-Backtick-Fences mit Sprach-Annotation (` ```python `, ` ```bash `, ` ```html `) → highlighted `<pre>` Output. Langes-Code-Block-Verhalten (scroll vs. wrap) im audience-Renderer separat festlegen. Kleiner Commit, ~80–120 Zeilen.

  - **`lectures/python-intro/source.md`:** Englischsprachige Demo-Lecture, vermittelt Python-Basics und endet mit einem simplen Playwright-basierten Website-Scanner. Curriculum:

    1. *Setup.* `uv` (modern, schnell) als primärer Pfad, `pip3` + `venv` als Fallback. Zeigt beides – `uv venv` / `source .venv/bin/activate` / `uv pip install`. Einer der Punkte, an denen die `narrow`-Width für die Befehlsblöcke gut wirkt.
    2. *Python-Grundlagen.* Variables und Types (int, float, str, bool, None), F-Strings, Listen + Dicts + Tuples, Control Flow (`if`/`for`/`while`/`match`), Funktionen mit Type Hints, Comprehensions, kurzer Exception-Handling-Block. Jeder Sub-Topic ist eine eigene Column oder zwei.
    3. *Standard-Library-Highlights.* `pathlib`, `urllib.parse`, `re`, `dataclasses`, `argparse` – nur soviel wie für den Scanner gebraucht wird.
    4. *Async-Grundlagen.* `async`/`await`, `asyncio.run`, Konzept von Event-Loop in zwei Sätzen. Playwright-Async-API ist Pflicht-Setup.
    5. *Playwright.* `playwright install chromium`, `async_playwright`, `browser.new_page`, `page.goto`, `page.locator`, `page.evaluate`. Drei oder vier Code-Blöcke, jeder ein in sich geschlossenes Beispiel.
    6. *Der Scanner.* Endprodukt: eine kleine CLI, die eine URL nimmt, alle Links extrahiert, jede besucht, prüft auf etwas Konkretes (z.B. `<title>`-Länge, `meta[name=description]`-Existenz, gebrochene Links per Status-Code, oder externe-vs-interne-Link-Verhältnis – die Lecture wählt eines klar aus). Vollständiger Source als ein `figure:`-Chunk im `.full`-Format.

    Die Lecture nutzt die volle Vokabel: `principle:` für die ein-Satz-Kernaussagen ("Use a venv. Always.", "Async is for I/O, not CPU."), `definition:` für Vokabel-Einführungen, `example:` für die Code-Snippets, `figure:` für den finalen Scanner-Source, `exercise:` für 3–4 Aufgaben am Ende. Reveal-Segmente sparsam – Code-Blöcke selbst dürfen nicht reveal-segmentiert werden (würde zerreißen).

  Reihenfolge: erst Code-Highlighting bauen, dann die Lecture schreiben (im `--watch`-Loop). Dann fühlt sich die Lecture sofort *richtig* an statt mit plain-text Code-Blöcken zu beginnen.

  Aufwand: Code-Highlighting ~120 Zeilen, Lecture ~25–35 chunks – mittelgroß bis groß über 4–6 Commits.

**C. Content-Fidelity-Rest (KaTeX + Images).** Sobald die nächste reale Vorlesung Mathe oder Figures enthält. Aktuell noch keine Math-Lecture in der Pipeline, daher nicht dringend. ~350 Zeilen über 2 Commits.

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
5. Nächsten Slice (A: Linter, B: Content-Fidelity) wählen.
6. Vor Codezeile 1 den User fragen, welchen Slice, und ob bestimmte Sub-Entscheidungen (z.B. Linter-Override-Syntax, KaTeX-CSS-Bundling, shiki-Theme-Wahl) zuerst geklärt werden sollen.
