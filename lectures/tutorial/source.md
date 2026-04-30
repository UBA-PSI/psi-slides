---
title: psi-slides – a ten-step tour
presenter: Your own copy
info: |
  Tutorial lecture built with psi-slides itself
  Use the tool to learn the tool
course: psi-slides-tour
lecture: tutorial
---

## title: {#title}

# Welcome {#welcome}

> note: This is a self-referential lecture – it explains the tool by being the tool. First-time readers should have both this audience view and a spawned speaker view (S) open side by side. Steps 7-9 assume the speaker is running.

## principle: One source, three views | print, audience, speaker all come from the same `source.md` {.narrow #one-source}

**psi-slides builds three HTML files from each Markdown source.** Print is a document-style reading copy with a cover and a TOC; audience is this live projection view; speaker is the cockpit with notes, preview strip, and timer.

The authoring format is the same Markdown for all three – views only differ in *what they emit*, never in *what you wrote*.

## free: What you're reading right now | is the audience view {.wide #audience-now}

**You are in `audience.html`.** It's the projector-facing view: one chunk occupies the slide, keyboard nav moves between chunks, and any speaker connected via postMessage can mirror state here in real time.

::: cols 2

**To see the other two views:**

- Press `P` now to open `print.html` in a new tab – scroll through the whole lecture as a document.
- Press `S` to spawn `speaker.html` as a popup window – that's the cockpit.

**The source that produced all three** lives at `lectures/tutorial/source.md`. Every chunk in every view came out of that one file. Open it in a text editor beside this window to see the mapping.

:::

# Moving around {#moving}

## example: Arrows and Space | navigate chunks, reveal segments {.standard #arrows}

**Three key-families carry the whole live-talk navigation:**

- `←` `→` move between **columns** – the top-level sections headed `# Name`.
- `↑` `↓` move between **chunks** within a column – each `## tag: …` is one chunk.
- `Space` reveals the next **segment** – a chunk can split into pieces at standalone `---` lines. Try it now:

---

**Good – you just revealed a segment.** In the source, a line with only `---` (outside a code fence) breaks the chunk body into reveal segments. The first is visible on entry; each `Space` uncovers the next, and past the last, `Space` advances to the next chunk.

---

**One more, to show chaining.** Reveal lets you pace dense content during a live talk without dumping everything at once – and in print, all segments render together as one flowing body.

## example: Expansions | `Enter` and `1`-`9` open side asides {.wide #expand}

**Some chunks have extra detail tucked behind a chevron button.** Click one, or press `Enter` for the first, or `1`…`9` for the N-th. This chunk has two expansions – try both.

::: expand enter-and-digits
**`Enter` opens the first expansion, digits open specific ones.** This is expansion number 1. Press `Esc` to close, or `2` to switch to the second expansion directly – no need to close first.

In source, an expansion is authored with `::: expand <label>` … `:::`. The label shows in the expanded pane header; the chevron button gets an abbreviation (`Exp` for unknown labels, `Ex` / `Ref` / `Fig` / `?` / `N.B.` / `!` for known families).
:::

::: expand collapse-behaviour
**Expansions disappear in collapse modes.** Press `C` after closing this to try collapse – the chunk shrinks to topic sentence + bold keywords, and expansions hide entirely. The idea is that expansions are "the branch you take *if* someone asks"; the main text carries the argument on its own.
:::

**Print collapses all expansions** into block-quoted asides in source order, so the reading copy loses nothing.

## example: Overview | `O` zooms out so you can see everything {.standard #overview}

**Press `O` now.** The stage zooms out to show all chunks at once, laid out in their column grid. Drag with the mouse or arrows to move a selection outline; `O` or `Enter` lands on the selected chunk; `Esc` exits without moving.

Overview is the single best way to get oriented in an unfamiliar lecture – the typographic rhythm of principles, examples, and figures is immediately visible.

# Finding content {#finding}

## example: TOC | `T` toggles a flat column index {.standard #toc}

**`T` shows a list of every named column with its ID.** Click an entry to jump there directly; `T` again closes the panel.

Columns without a `{#id}` don't appear – anonymous columns like the title page stay invisible in the nav but still render normally. IDs on named columns are how the TOC links, and also how cross-references (when a `[text](#some-id)` link shows up in body text) resolve.

## example: Search | `/` inside overview filters by keyword {.standard #search}

**Only active while `O` overview is on.** Press `O`, then `/`, then start typing – matching chunks keep their outline, non-matches fade to a low-opacity miss state. `Enter` lands on the first match; `Esc` exits search without moving.

Combined: `O` `/` *word* `Enter` jumps to the first chunk that mentions *word*, even in a long lecture. This is the fastest jump tool when you half-remember a topic but not its position.

# Speaker cockpit {#speaker}

## free: Speaker view | the other window `S` spawned {.wide #speaker-s}

**The speaker view is the four-lane cockpit.** Press `S` in this audience view if you haven't already – it opens `speaker.html` as a popup, and both windows adopt each other as peers over `window.postMessage`.

::: cols 2

**Four lanes, top to bottom:**

- **Column scrubber** with clickable dots for every chunk.
- **Stage mirror** – identical layout to the audience at the same zoom.
- **Editable notes pane** below the stage (collapses when empty).
- **Preview strip** of all chunks, scrollable and clickable.

**Everything stays in sync.** Chunk changes, reveal state, annotations, theme, font, zoom, expansion state, and the laser pointer all flow through postMessage snapshots. `Shift-P` on the speaker toggles push on/off; `.` force-pushes a snapshot even when push is off (useful after a reload).

:::

## example: N vs Shift-N | audience-visible vs private {.wide #notes-vs-annot}

**Two different note surfaces, one letter apart:**

::: side

**`N` (both views) is an annotation on the current chunk.** A textarea appears under the chunk; whatever you type is mirrored keystroke-by-keystroke to the other view. Use it for "live marginalia" – a rule you want on screen, a question you captured from the room, a correction during a talk.

Annotations persist in localStorage per lecture and travel with state snapshots. `Shift-E` on the speaker copies every live annotation as `> annot:` Markdown to your clipboard; paste it under the matching chunk heading in `source.md` and the text becomes a permanent "Presentation Note" – prefilled into the audience textarea and rendered inline in the print view.

> annot: The `> annot:` block you read here in print is the same mechanism exported from a previous run; the audience textarea above starts prefilled with this text.

::: flip

**`Shift-N` (speaker only) opens the private notes pane** below the slide. This is *your* memory aid, never mirrored. The pane is pre-filled from `> note: …` lines in source; your in-talk edits override the source text and persist per chunk in localStorage.

If the pane is collapsed (no notes for this chunk), the corner `+ note` button on the stage does the same thing as `Shift-N`.

:::

## example: V and the reading knobs | speaker-side personalisation {.wide #knobs}

**`V` toggles the preview-strip orientation.** Default is a horizontal bar along the bottom; `V` moves it to the right edge as a vertical column. Text in the thumbs is larger in vertical mode – worth it on any setup with horizontal room to spare. Pref is persisted globally, so it follows you across lectures.

**Three reading knobs also cycle with single keys:**

- `C` cycles **collapse** (none → topic+bold → topic-only → bold-only). Topic+bold is the default live mode; `none` reads as the full script.
- `F` cycles **font** (serif → sans → mono) for projector legibility.
- `A` cycles **accent theme** – four light shades plus two terminal/phosphor modes.

All three snap onto both views via postMessage; a change on the speaker is immediately visible on the audience. `Shift`-any-of-these cycles backwards.

# Authoring layouts {#layouts}

## principle: Two layout axes | chunk widths and body directives {.standard #layout-axes}

**Layout works on two axes.** Each chunk picks one of four widths in its heading – `{.narrow}`, `{.standard}`, `{.wide}`, `{.full}` – which sets how much horizontal stage it occupies. Inside the body, four `:::` directives shape internal flow: `::: cols`, `::: side`, `::: marginalia`, `::: margin`.

Width is the slide-level decision; directives compose within. A `.wide` chunk with a `::: side` body is the most common figure-plus-commentary pattern.

## example: Multi-column flow | `::: cols 2` and `::: cols 3` {.wide #cols-demo}

**`::: cols 2` (or `cols 3`) wraps the body in a CSS multi-column flow.** Use it when several short paragraphs read better in parallel than stacked – feature lists, brief comparisons, parallel definitions.

::: cols 2

**Left flow.** Multi-column flow auto-balances – the engine fills top-to-bottom and lets content break wherever fits. Avoid putting one long paragraph here; one column dominates and the other sits empty. Several short blocks are the sweet spot.

**Right flow.** This block is the third paragraph in source, which is why it landed in column two – column flow goes top-down and then wraps. In print, columns collapse back to a single linear stream.

:::

Reveal segments still work inside `::: cols`, but mixing reveal-on-`Space` with multi-column flow is rarely worth the cognitive load – pick one rhythm or the other.

## example: Two-pane grid | `::: side` and `::: flip` {.wide #side-demo}

**`::: side` opens a two-pane grid; `::: flip` is the mid-marker between panes.** Unlike `cols`, the split is deterministic – the left pane gets everything before `::: flip`, the right pane gets everything after. Best for figure-plus-commentary, or before/after pairs where you need to control which side gets which content.

::: side

**Left pane.** Authoring shape: write `::: side`, then left content, then `::: flip`, then right content, then `:::` to close. The grid is balanced 1fr/1fr by default, so neither side dominates the slide.

::: flip

**Right pane.** A figure usually goes here, with the textual context on the left. In the audience view, click either pane to focus-zoom it; print stacks the two panes vertically so neither side is ever hidden.

:::

You can nest a `::: marginalia` *inside* a side pane if a tangent belongs to one half specifically – it still escapes to the slide's right margin.

## example: Marginalia | `::: marginalia` escapes to the slide margin {.standard #marginalia-demo}

**`::: marginalia` floats an aside to the right of the chunk body**, anchored to the content column's right edge and spilling into the slide padding. The audience camera does not pan automatically – click the marginalia in this chunk to bring it centred into view.

::: marginalia

This whole block is rendered in the slide margin, in dimmed sans-serif. Use marginalia for tangents that *belong with* a chunk but would crowd the main flow – an aside, a citation, a "see also" pointer to another column.

In print, marginalia stack inline below the body as block-quoted asides, so the reading copy keeps every word.

:::

The body itself stays in the central column; only the marginalia escapes outward. Keep marginalia short – they share vertical space with the chunk body and can't grow taller than it.

## example: Margin notes | `::: margin` is a quiet inline footnote {.standard #margin-demo}

**`::: margin` adds a dim, small-caps-labelled note below the chunk body** – a Tufte-style sidenote, but in-flow rather than off to the side. Always visible, no chevron, no separate panel.

::: margin
This is a margin note. The label header reads "NOTE" by default; the block renders in muted sans-serif under a dotted top rule. Margin notes are quieter than expansions: no button to click, just a soft footnote attached to this chunk.
:::

Reach for `::: margin` when the supplementary content is short and trustworthy enough that you want it always rendered. Reach for `::: expand <label>` (back at `#expand`) when it should hide behind a chevron until someone opens it.

# Next steps {#next}

## exercise: Read more | the three artefacts that close the loop {.wide #read-more}

**Close this tab and poke around the real lectures and docs.** The tour covered the hotkeys; the craft shows in authored content.

::: cols 2

**1. `lectures/python-intro/audience.html`.** A 36-chunk teaching lecture. Spawn its speaker with `S` and watch the layout vocabulary you just learned in real use, woven through reveals, expansions, and figure focus.

**2. `PRD.md`.** The design philosophy: why three views, why the specific tag set, why reveals are off by default in print. Short, pragmatic, concretely linked to the code.

**3. `HANDOFF.md`.** Narrates what has been built, slice by slice, including the decisions deliberately *not* taken. Skim the latest sections for the current state.

:::

## free: Authoring your own | `--new`, `--watch`, `lint.js` {.standard #authoring}

**Three CLI entries cover the full authoring loop:**

- `node build.js --new <slug>` scaffolds `lectures/<slug>/source.md` with a minimal valid frontmatter + two chunks. Builds cleanly the moment it lands on disk; TODO markers make it obvious what to fill in.
- `node build.js <source.md> --watch` gives live-reload: WebSocket on a free port, editor save triggers rebuild + reload in any open tab.
- `node lint.js lectures/` runs static checks (unknown tags, unclosed directives, duplicate IDs, density budgets, reveal overuse, orphan columns).

> note: When finishing this tour with a first-timer, end by asking them what felt discoverable and what did not – their first-impression friction points are the most valuable feedback the tool will get before release.
