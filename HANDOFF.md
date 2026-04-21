# Handoff – nach Speaker-Slice

Stand nach Commit `95c67b2`. Phase 1 ist weit fortgeschritten; die tragenden drei Outputs (audience, print, speaker) existieren und synchronisieren live über BroadcastChannel. Dieser Handoff beschreibt den aktuellen Zustand, was definitiv funktioniert, und welche Phase-1-Posten noch offen sind.

## Was seit dem letzten Handoff gebaut wurde

Commits, chronologisch (neueste zuerst):

```
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

Kurzbeschreibung der drei großen Slices:

1. **Audience-Renderer** (`71aeb99`, `8d64de2`): `build.js` emittiert `audience.html` aus `source.md` mit 2D-Stage, Per-Tag-Treatments, Title-Slide (lower-left-third), Progressive-Reveal (§4.6), Collapse-Modes (§4.5), Annotations mit localStorage, Expand-Chevrons.
2. **Overview / TOC / Fulltext** (`97e57c8`): `O` für Birds-eye, `T` für rechtes TOC-Panel, `/` für Fulltext-Suche im Overview. Click-to-select, zweites `O` oder Enter landet.
3. **Speaker-View + Sync** (`71771cb`, `0c1219c`, `392899a`, `086c98b`): Dritter Output `speaker.html`. Drei Panels (Scrubber, Current-Chunk-Mirror + Notes-Pane, Next-Previews). Live-Sync beide Richtungen über BroadcastChannel mit Full-State-Snapshots. Push-Toggle (`Shift-P`), Force-Push (`.`), Hello-Handshake.
4. **Simplify-Pass** (`95c67b2`): Reuse (renderTitleBlock, renderTocNav), cleaner broadcast-gate via `viewHooks.shouldBroadcast` statt `window.pushEnabled`-Leak, `applyRemoteState` ohne doppelten `applyState`-Call, Guard auf `populatePreviewStrip` damit Annotation-Keystroke-Sync nicht drei DOM-Clones pro Zeichen rebuildet. -18 Zeilen netto, keine Verhaltensänderung.

## Was jetzt definitiv funktioniert

- `node build.js <source.md>` → `print.html` + `audience.html` + `speaker.html` in denselben Ordner.
- Flags: `--audience-only`, `--print-only`, `--speaker-only` (mutually exclusive).
- Parser-Features: frontmatter, columns (`#`), chunks (`##`) mit attribute tails (`{.width #id}`), `::: expand <label>`, `::: margin`, `> note:` (multi-line, orphan-safe), reveal-separator `---`, fence-aware Code-Blöcke.
- Audience-Runtime: Arrows, Space-Reveal-mit-Passthrough, Enter/1-9 Expand, Esc, N Annotate, C Collapse-Cycle, +/-/0 Zoom, B Blank, P Print, O Overview, T TOC, / Fulltext, S öffnet Speaker, ?-Hints-Toggle.
- Speaker-Runtime: wie Audience plus Scrubber-Click, Notes-Pane-`N`, Timer, Shift-P Push-Toggle, . Force-Push.
- BroadcastChannel-Sync: activeIdx, revealed, collapse, zoom, blanked, annotations, openExp. Hello-Handshake beim Speaker-Boot. Audience antwortet auf Hello mit aktuellem Snapshot. `isApplyingRemote`-Guard verhindert Loops.
- Live-Lecture: zwei Tabs nebeneinander – beide navigieren gemeinsam, Shift-P schaltet Speaker in Vorschau-Modus, `.` resyncht.
- Lectures: `lectures/demo/source.md` (4 cols / 8 chunks mit 2-Segment-Reveal-Test) und `lectures/wlab01/source.md` (7 cols / 21 chunks / 7 Speaker-Notes / 1 Expand / 1 Margin) bauen sauber.
- phase0/ steht als Referenz-Archiv; `lectures/wlab01/lecture.html` (das handgeschriebene Original) ist retired.

## Was noch offen ist (Phase-1-Restliste)

In absteigender Priorität bezogen auf realen Lecture-Einsatz. Die Liste ist die Differenz zwischen PRD §11 Phase 1 und dem aktuellen Build-State.

### Content-Fidelity

1. **KaTeX build-time** – Aktuell rendern `$...$` und `$$...$$` als Literal. Jede Mathe-Vorlesung braucht das. Build-time-Render mit KaTeX (dependency bereits in PRD angedacht §9 Schritt 4) in `build.js` einbauen; sowohl audience als auch print und speaker bekommen fertig-gerenderte HTML + CSS-Import.
2. **Image shorthand** – `![](fig-id)` → `images/fig-id.{svg,png,jpg}` auflösen, Dimensionen einlesen, als `<figure>` einbetten. PRD §9 Schritt 3. Ohne das gibt es keine echten Figuren.
3. **Code-Highlighting** – Build-time mit [shiki](https://shiki.style) (reiner Static-HTML-Output, keine Runtime-Abhängigkeit). Kleiner Commit, wirkt in allen drei Views gleich.

### Authoring-Workflow

4. **Linter** – PRD §9: Build-Errors (missing IDs, duplicate IDs, dead images, nested directives, unknown tags) und Warnings (density budget, reveal overuse, orphan columns, title count). Sehr hochwirksam – macht den Build vertrauenswürdig.
5. **`--new <slug>` Scaffold** – PRD §9: legt `lectures/<slug>/source.md` + `assets/` an mit einem Phase-1-gültigen Gerüst. Kleiner Commit.
6. **`--assign-ids`** – PRD §9: ein-Shot-Pass der fehlende `{#id}`-Attribute in-place hinzufügt und committet. Pair mit dem Linter: Linter fordert IDs, `--assign-ids` erzeugt sie.
7. **`--watch`** – Dateien beobachten, bei Save neu bauen, kleiner WebSocket triggert Browser-Reload (PRD §9). Die 30 Zeilen.

### Verfeinerungen am bestehenden Code

8. **Camera-Framing bei expandierten langen Chunks** – aktuell zentriert die Kamera die Expansion-Body, schneidet dabei oben/unten ab. Hier wäre eine Hybrid-Logik sinnvoll: scroll-in-chunk, wenn höher als Viewport.
9. **In-Chunk-Wheel-Scroll** – phase0 hatte das; Arrows navigieren Chunks, Wheel scrollt *innerhalb*. Wichtig bei Chunks höher als Viewport.
10. **Margin-Notes ins linke Lane** – aktuell rendern `::: margin`-Blöcke inline unter dem Body. PRD §2 skizziert das linke Lane analog zur Annotation-Box. Klein, kosmetisch.
11. **Persistence-Snapshot alle 5s** – Speaker hat nur activeIdx + annotations persistiert. Spec §5 will den vollen Snapshot + elapsedSeconds alle 5s für Crash-Recovery.
12. **Font-Loading** – Audience + Speaker laden Fonts noch nicht explizit; fallback auf System-Fonts. PRD will self-hosted WOFF2. Ohne das sieht es auf anderen Maschinen anders aus.
13. **Build-time Geometry (pretext)** – Deep-links und Speaker-Sync laufen aktuell über CSS-native Messung. PRD §9 Schritt 5 will pretext für deterministische Chunk-Positionen. Macht den Build langsamer; Gewinn ist marginal solange Client-Layout zuverlässig ist. Eher deferred Phase-2.

## Empfehlung für den nächsten Slice

Zwei sinnvolle Pakete, wähle eines:

**A. Content-Fidelity (KaTeX + Images + Highlighting).** Macht die gebauten Lectures visuell echt. Wenn die nächste reale Vorlesung Mathe oder Figures oder Code enthält, ist das der Pfad. Mittelgroß, ~500 Zeilen über 3 Commits.

**B. Authoring-Workflow (Linter + `--new` + `--watch`).** Macht die Feedback-Schleife beim Schreiben neuer Lectures kurz. Wenn die nächste Aufgabe "viele neue Lectures schreiben" ist, ist das der Pfad. Auch mittelgroß, ~400 Zeilen über 3 Commits.

Die Verfeinerungen (8–13) sind jeweils eigene kleine Commits und können dazwischen laufen.

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
4. `build.js` als Ganzes durchlesen – der relevante Teil ist inzwischen eine Datei, die auf ~2100 Zeilen gewachsen ist. Struktur: parser → print renderer + CSS → audience renderer + CSS + JS → speaker renderer + CSS + JS → CLI.
5. Nächsten Slice (A oder B) wählen. Bei A: KaTeX zuerst, dann Images, dann Highlighting. Bei B: Linter zuerst (strukturell am tragendsten), dann `--new`, dann `--watch`.
6. Vor Codezeile 1 den User fragen, welchen Slice, und ob bestimmte Sub-Entscheidungen (z.B. KaTeX-CSS-Bundling, shiki-Theme-Wahl) zuerst geklärt werden sollen.
