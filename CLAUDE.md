# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

psi-slides is a **lecture medium**: one Markdown `source.md` per lecture produces four static HTML views – `print.html` (document), `print-notes.html` (document + speaker notes), `audience.html` (live projection), `speaker.html` (cockpit). All four are self-contained, `file://`-openable, no runtime server required.

Status: released, 1.0.0, one maintainer, no test suite. **From 1.0.0 the source format is the interface** – a change that stops an existing `source.md` from building the same way is a major version. The internals carry no such promise. The `lectures/` folder holds the canonical examples of what the tool supports; the design rationale is in `PRD.md`. A separate content repo `../psi-slides-mylectures/` consumes this engine via `node ../psi-slides/build.js` and holds the lectures actively being authored.

## Commands

```bash
# install deps (required once, also before running lectures from sibling content repos)
npm install

# build all four views next to source.md
node build.js lectures/tutorial/source.md

# live-reload authoring (WebSocket reload to open tabs on every save)
node build.js lectures/tutorial/source.md --watch

# partial builds (useful for iterating on one renderer)
node build.js <source.md> --audience-only
node build.js <source.md> --print-only
node build.js <source.md> --print-notes-only   # print + speaker notes
node build.js <source.md> --speaker-only

# image inlining – default is auto: build inlines image assets as data: URIs
# iff the referenced images sum to < 10 MB; logs the decision either way.
# Override the default with these flags (per-image cap is always 2 MB):
node build.js <source.md> --inline-images       # force inline regardless of total size
node build.js <source.md> --no-inline-images    # force external asset paths

# shrink assets that blow the per-image cap: converts referenced PNG/JPEG to
# WebP q92 in place, replacing the originals and rewriting explicit-path refs
# in source.md – the markdown `](path)` form and the bare token a ::: draw
# `image` statement carries, fenced code skipped (shorthand `![](fig-id)`
# refs need no edit). Needs cwebp or magick on PATH; measured 12-18% of the
# original on real lecture assets.
node build.js <source.md> --optimize-images --dry-run   # report, write nothing
node build.js <source.md> --optimize-images              # apply (assets >= 512 KB)
node build.js <source.md> --optimize-images --all        # every referenced raster
node build.js <source.md> --optimize-images --max-width 2600   # also downscale

# diagrams need no flag either: a ::: draw block compiles to inline SVG
# at build time, and its `step` blocks become beats on the reveal counter.
# See the `psi-slides-figures` skill and lectures/diagrams/source.md.
# The graphical editor for those blocks ships into the live views whenever
# the lecture has one; `editor: none` in the frontmatter declines it, and
# `editor: speaker` keeps it out of the projection. Click a diagram, then the
# button in the corner of the focus card. Spec and build log: editor.md.

# math needs no flag: $inline$ and $$display$$ render via KaTeX during the
# build. The KaTeX stylesheet plus the font families the formulas use are
# inlined only into views that contain math; the build logs the payload.

# scaffold a new lecture folder with valid frontmatter + example chunks
node build.js --new my-slug

# integrate exported live annotations back into source.md – paste the
# speaker's Shift-E snippet (marker-wrapped) at the end of source.md, then:
node build.js <source.md> --integrate-annotations
# moves each `> annot:` block under the matching chunk, removes the marker;
# unresolved ids are parked in a trimmed marker block at EOF.

# serve the built lecture over http on loopback. Everything works from
# file:// except third-party embeds: a file:// page has the origin `null`
# and YouTube's player refuses it (Error 153). Serve, and it plays.
node build.js <source.md> --serve                 # build once, then serve
node build.js <source.md> --serve --port 8080     # fixed port (default: free one)
node build.js <source.md> --watch --serve         # live reload over http

# static checks – run before committing
node lint.js lectures/                         # all lectures
node lint.js lectures/tutorial/source.md       # single file
node lint.js lectures/ --strict                # warnings → exit 2

# fast gates – everything about the figure language that can be decided
# without a browser: which lines the compiler refuses, which it accepts, what
# the emitted SVG means, and which classes a beat can carry. Needs no browser
# and no `npm install` (both `diagram-core.mjs` and `lint.js` are
# zero-dependency), runs in under a second, and `npm test` runs it ahead of the
# browser suite so a compiler regression fails in a second rather than in four
# minutes. `gates.yml` runs it on push and pull request.
#
# Six gates, six contracts: refusals
# (build and lint agree on what is refused), accepts (every construct still
# parses), semantics (the emitted SVG *means* what the source says, plus what
# the source means to the editor that rewrites it – the span table), corpus
# (every block in the repository still compiles), step-classes (which classes
# a beat can carry, derived from DG_STEP_FIXED rather than restated), inlined
# (the two characters that mean something else inside one of build.js's own
# template literals – a raw backtick, which ends it, and a single-backslash
# regex escape, which the literal eats and which therefore ships; **all
# twelve** literals, which is a number worth checking against the gate's own
# note when you add one – it recognised seven until the five holding inlined
# markup, the likeliest place of all to write a backtick beside a button,
# turned out to open with a tag on the same line and be skipped). A green
# `accepts` once hid a sequence `<->` that parsed and drew one arrowhead;
# that is what `semantics` exists for. And a check that reaches the compiler
# through a browser page reaches only the build: two `lint.js` gaps sat behind
# assertions in `figure-labels.mjs` until they were moved here, where every
# fixture is compiled *and* linted.
npm run gate                                   # all gates
node test/gates/run.mjs semantics              # gates whose name matches

# browser suite – the things that only break in a built page, in four
# families: the navigation model (nav, nav-cockpit), the geometry the live
# chrome leaves the slide (expansion, marginalia, touch-rail, math-focus), the editor's
# gestures and panel (editor-*), and the figure-* specs that measure the SVG –
# figure-framing, which catches a drawing sitting off-centre in an oversized
# frame, figure-labels, which measures where an aligned label lands inside the
# thing that holds it, and figure-sequence, which asserts that nothing in a
# `sequence` overlaps anything else in it and that its generated names are the
# documented ones. The editor-* family also covers the neighbour-alignment
# guides, which is what a gesture snaps to. `expansion` and `touch-rail` say
# why the family exists: the camera framed an open expansion by centring the
# pane and cropping the slide it belongs to, and the cockpit rail sat on 82%
# of the notes pane, and both survived because a screenshot of the thing you
# were looking at is fine. `marginalia` is the third: the aside overflows the
# chunk on purpose, the width probe counted that overhang as a slide being cut
# off, and the type on every marginalia chunk was walked down to the 0.6 floor
# – which reads as a design decision until you put the slide next to its
# neighbour. It compares against another chunk of the same deck rather than a
# number. They assert the property and never a coordinate.
# `touch-rail` opens its own browser context: the rail lives behind
# `@media (pointer: coarse)` and openDeck's has a fine pointer, so in the
# default context the bar is not in the document and a measurement of it
# reports no overlaps among no buttons. `math-focus` builds its own deck for
# the opposite reason: no lecture in the repository has a display formula with
# more than one row, so nothing that ships can reach the case, which is most
# of why it shipped. Twenty-six specs, ~669 assertions.
# Builds and serves the lectures itself, so it never reports on stale HTML,
# and launches one Chromium for the whole run ($PSI_CHROME, the Playwright
# cache, or system Chrome); ~5 min. Run it after touching AUDIENCE_JS, the key
# map, editor.mjs, createSpanTable, or anything that moves a label or an
# extent. `no page errors` is asserted by the runner after every spec rather
# than by each spec: it is an invariant of running one at all, and the one
# spec that forgot the line swallowed console errors for as long as it
# existed. Not a unit-test suite: anything checkable without a browser belongs
# in lint.js, where it runs on every commit, or in `test/gates/`, where it
# runs on every push.
node test/run.mjs                              # all specs
node test/run.mjs nav                          # specs whose name matches

# project site (GitHub Pages)
node docs/site/build-site.js _site              # assemble the site into _site/
node docs/site/shoot.mjs                        # re-shoot its seven screenshots
node docs/site/shoot.mjs cockpit search         # …or just some of them
```

`shoot.mjs` drives `lectures/python-intro` (build it first) with `playwright-core`
and writes `docs/site/img/*.webp`. Every shot is the same chunk in a different
view, so they have to be taken the same way each time – a hand-taken set drifted
in framing and shipped one figure at 860 px while the rest were 1440. It needs a
Chromium (`$PSI_CHROME`, else the Playwright cache, else system Chrome) and
`cwebp` or `magick` to encode. See the header comment for why the CLI
screenshotter cannot do this job.

A source file can silence specific lint warnings with an HTML comment anywhere in the body:

```
<!-- linter: ignore reveal-overuse, density -->
```

## Architecture

### Single-file build pipeline

`build.js` holds the entire rendering stack: parser, three renderers, inlined audience/speaker runtime JS, inlined audience/speaker/print CSS, Shiki highlighter, image-shorthand resolver, WebSocket watch server, and the CLI. It is deliberately one file, and a large one – roughly two thirds of it is the embedded CSS and runtime JS, so the Node-side build logic is much smaller than the file size suggests.

**`diagram-core.mjs` is the one documented exception**, and the reason is narrow: the graphical editor answers a drag by rewriting the source and re-running the compiler *in the browser*, so exactly one text has to compile a diagram in Node and in the page. Two copies of a 6,500-line compiler is not a duplication anyone can maintain. The file is pure JS with **zero imports and zero Node APIs**; the four leaves that were Node-only (asset resolution, aspect reading, the warning sink, `escapeHtml`) plus a fifth (`assetMarkup`, which splices a vector file inline) are injected by `createDiagramCompiler({…})`. build.js keeps those leaves, the diagram CSS and the step runtime. The move also *removes* a duplication: `lint.js` imports the vocabulary tables instead of mirroring them by hand – tables only, never a function, or the whole compiler comes in behind it and the linter stops being runnable without the Markdown/Shiki stack. See `editor.md` §8.1.

Navigate build.js by the `// ── section ──` banners – `grep -n '^// ── ' build.js`
lists all forty in order, which is the map that cannot go stale. Two of them carry
a decision the name does not:

- `// ── math (KaTeX, rendered at build time) ──` – the family→class map is **parsed out of `katex.min.css`**, never hard-coded, so it survives a KaTeX upgrade; and the stylesheet is emitted only for views that actually contain a formula, because the inlined woff2 faces are 254 KB for the full set. The live views additionally carry `KATEX_TOGGLE_FAMS` (sans + typewriter, ~46 KB) so the maths can follow the `F` toggle; print passes no `fontToggle` flag and pays nothing extra.
- `// ── audience rendering ──` – `renderHelpOverlay(view)` generates the `?` cheat sheet for **both** live views from one data structure – edit labels there, not in the per-view HTML.

### Parser

`parseLecture(src)` is **line-based, not AST-based**. It walks the source tracking fence state, a `layoutStack` of open `:::` directives, a `currentExpansion` slot, and `pendingNotes`, emitting a `{frontmatter, columns: [{chunks: [...]}]}` structure. `marked` is only invoked later on each chunk's *body string* – by the time `marked` runs, reveal segments have already been split on standalone `---` lines (fence-aware). Attribute-tail syntax `{.width #id}` and the `type: Heading | Sub {...}` prefix are parsed by hand, not by `marked`.

Design implications:

- A line that is exactly `---` inside a chunk body but **outside a code fence** is a reveal-segment separator, not a thematic break. `***` is available if an author needs a true horizontal rule.
- `::: expand <label>` and `::: footnote` / `::: marginalia` become separate nodes attached to the chunk (`::: margin` is the older spelling of `::: footnote`, still accepted and documented nowhere); `::: cols N`, `::: side` / `::: flip`, `::: slide` / `::: script` are layout wrappers that stay inline in the body as `<div>`/`<aside>` elements and let `marked`'s html-block passthrough render the inner Markdown.
- `::: slide` / `::: script` are the **explicit slide-content** escape hatch from topic-sentence extraction (PRD §4.5). They add no runtime state and no sync field: the parser emits `.slide-explicit` / `.script-only` wrappers and the whole mode is CSS (`:has()` rules under `[data-collapse=topic-bold]`), plus a `closest()` guard in `splitSentencesIn` so explicit blocks are never abridged. The hiding selector must match at any depth (`*:not(.slide-explicit):not(:has(.slide-explicit)):not(.slide-explicit *)`) – matching only `.reveal-segment > *` breaks as soon as a `::: slide` sits inside a `::: side` or `::: cols` wrapper.
- `::: cols N` **folds to a single column while collapsed** (`[data-collapse=topic-bold] .cols-2, .cols-3 { column-count: 1 }`). Collapsed content is one topic sentence per paragraph, and `.cols > *` sets `break-inside: avoid`, so the browser can only balance in whole paragraphs – a one-line and a five-line paragraph land as a stub beside a wall of text, and two short ones as two stubs with the full gutter between them. Print and the un-collapsed reading mode keep the author's columns, where there is enough content to balance.
- Speaker notes are blockquotes whose first line matches `note:` exactly; they attach to the current chunk (or to the next one if they precede the first chunk).

### lint.js is independent

`lint.js` is a **zero-dep** linter – nothing from `node_modules`, so it runs as a pre-commit gate without the Markdown/Shiki stack. It deliberately does not import anything from `build.js`; it re-implements the parsing contract and mirrors the constants (`VALID_TAGS`, `VALID_WIDTHS`, `DENSITY_BUDGET`, `VIEW_DEFAULTS`). When you change the parser vocabulary in `build.js`, update `lint.js` in the same commit – the duplication is the price paid for keeping the linter runnable without the Markdown/Shiki stack.

The **diagram vocabulary is the exception**: it is imported from `diagram-core.mjs`, which has no dependencies of its own, so importing it costs nothing this file was protecting and removes every table that used to have to change in two places in one commit. **Tables only.** A function from that module would pull the whole compiler in behind it – with the one bend recorded in the `psi-slides-figures` skill, for rules that ARE the vocabulary.

Checks enforced:

- Unknown type, unknown width class.
- Duplicate or missing chunk IDs (required on every non-title chunk).
- Unclosed `:::` directives and orphan `:::` closers.
- Per-type word-count budgets (principle/question 80, definition 200, example 250, free 250, exercise 350; title/figure unlimited). Counted against the **on-screen** half only: the `::: slide` block if the chunk has one, otherwise everything outside `::: script`.
- Duplicate `::: slide` / `::: script` blocks in one chunk (warning).
- Unknown value for a viewer-default frontmatter key (`unknown-view-default`, error).
- Assets over the 2 MB inline cap (`oversized-asset`, warning) – the pre-commit gate for the single-file property.
- Unclosed display math (`unclosed-math`, warning). Fence-aware. Inline `$…$` is deliberately not checked: a lone dollar in prose is legitimate and the build leaves it alone.
- A statement with no name (`bad-diagram-name`, error) – the build reads the token after the head as the name and refuses the line when there is none.
- The kind gate on a `style` step's classes, in both signs, answered **after the block is read**: a step may name an element declared below it and a tag whose members are. That is why `define()` records what each name draws, generated names included, and why a tag expands to its members with one bad member failing the statement – the compiler's own rule.
- Everything a `bars … series of` line does not own: `w`, `h`, `space` and a placement all belong to the chart it joined, and `stacked` needs a series to stand on.
- An element after the first in a `::: draw` block with no placement (`diagram-no-placement`, error), off the compiler's own `DG_PLACED_HEADS` / `DG_PLACE_INTRO`. The words are matched **positionally**: `point` takes `left` and `right`, so a line-wide test reads `box b "B" point left` as placed, and ten lines of the corpus carry that shape. It counts **nodes**, which is the build's own test for "is this the first element", and exempts a `bars … series of` line, which joins another chart's frame and refuses a placement by name. It also stays quiet on a line this gate has already reported on – one authored defect, one causal diagnostic, which is the nearest a linter gets to the build's "the statement stopped reading" rule.
- A bold of two words or fewer sitting after a paragraph's first sentence
  (`single-word-bold`, warning). In `topic-bold` the collapse hides the
  continuation's prose and leaves its `<strong>` runs standing, so such a bold
  reaches the room as a bare noun – the tutorial shipped `a **marginalia** – an
  aside …` and the slide read `– marginalia`. Mirrors `splitSentencesIn`'s
  head/rest walk and its three sentence helpers, which live inside the
  `AUDIENCE_JS` template literal and so cannot be imported; keep them congruent
  or the two files disagree about where the first sentence ends. Scoped to what
  the walker actually reaches: chunk-body paragraphs only, never a list item
  (`splitSentencesIn` walks `p` and never `li`, which is also why `::: cards`
  and `::: rows` are exempt), never a `::: slide` or `::: script` block, never a
  fence. Warning and not error on purpose – the build renders it happily, and a
  linter stricter than the build fails a source that builds clean.
  **The mirror is guarded in `test/settings.mjs`**, which lifts the helpers out
  of a built `audience.html` and out of `lint.js` as text and runs them side by
  side: neither copy can be imported – lint.js calls `main()` at module scope,
  and the build's copy is characters inside a string until a page runs it. That
  is the assertion that matters. A contract drifts when someone changes a
  number, visibly; an algorithm drifts when someone fixes an edge case in the
  renderer, invisibly, and the warning then describes a collapse that no longer
  happens. Asserting only that the rule fires would be lint.js agreeing with
  itself.
- Reveal-overuse (>50% of chunks using segments in a lecture flags a warning).
- Orphan columns (columns with <2 chunks).
- Figure caption redundancy (`figure:` chunk opens with an image whose alt text becomes a `<figcaption>` stacked under the heading – discourages three-label pile-ups of heading + sub-heading + caption).

**`build.js` and `lint.js` are a deliberate duplication, and keeping them congruent is the work.** A code review over the decoration family found eight defects, seven of which were places the two disagreed – four in the direction that matters, where the build *accepted* what the linter refuses. That direction merges green, because CI lints `lectures/network-security` and `lectures/diagrams` but never builds them. **When you add a refusal to one file, grep the other for the same key in the same commit.** And when a rule already exists – a pre-flight, a fallback refusal for an unreadable directive – the question is not whether to write it but which other constructs are still missing from it.

### Four outputs, three renderers, one source

The four HTML files are **self-contained outputs**. They ship with their runtime JS/CSS inlined from build.js template literals, so they open from `file://` without a server. They are gitignored (`lectures/*/print.html`, `lectures/*/print-notes.html`, `lectures/*/audience.html`, `lectures/*/speaker.html`) – rebuild instead of committing them. Three lectures are the exception: `lectures/tutorial/`, so readers can browse the self-referential tour straight from the repo; `lectures/diagrams/`, the only place every `::: draw` construct is drawn rather than described; and `lectures/decoration/`, the only place the cover, divider, card, backdrop and overlay constructions are shown rather than described. Rebuild and commit all four views whenever one of the three sources changes – the release workflow fails if they are stale.

`print-notes.html` is a second pass through the print renderer with `withNotes: true`; it embeds each chunk's `> note:` text as a `.speaker-note` aside under the chunk so a printed hand-out can show “what was on the slide + what the lecturer said”. Layout, CSS, and asset inlining are otherwise identical to `print.html`.

The audience↔speaker sync is cross-`file://`-origin safe because it uses `window.postMessage` over the opener relationship. Chrome's per-file opaque-origin policy isolates `BroadcastChannel` between tabs loaded from disk, which is why postMessage is the load-bearing channel. See `speaker.md` §2 for the full state-ownership matrix (audience is state root; speaker holds a local shadow plus a `frozen` flag). Two message types deliberately bypass the freeze gate because they are commands to the projector rather than shared state: `blank` (so `B` still works while frozen) and `slide-ref` (the audience's window dimensions after a resize). Resist the urge to fold either back into the state snapshot – `applyRemoteState` is a *full* apply, so a snapshot sent for one field drags the receiver's slide position with it.

### Asset inlining

Image assets are inlined into the single-file outputs by default (auto-inline budget: 10 MB total, per-file cap 2 MB; `--inline-images` / `--no-inline-images` overrides).

An asset over the per-file cap **fails the build**. It used to be a warning, and the output then shipped with an external path: correct on the machine that built it, broken figure anywhere the HTML travelled alone. `assertInlinable()` runs as a pre-flight in `buildOnce` before any rendering, so a failed build leaves no half-written artefact, and its message branches on what the author can actually do – convert (raster), install an encoder first (no cwebp/magick), or simplify by hand (oversized SVG, which `--optimize-images` cannot help with). The escape hatch is `--no-inline-images`, which is an explicit choice to ship external paths. `lint.js` keeps a matching `oversized-asset` warning (pure `fs.statSync`, still zero-dep) so the problem surfaces before the build too.

Errors of this kind set `err.userFacing = true`; the top-level handler prints the message without a stack trace, because a stack only buries the instructions. Reserve the flag for things the author must act on, never for defects in the build. Note what that verb deliberately does **not** do: it does not downscale by default. The offenders measured in the content repo were not oversized in pixels (the worst was 3.03 MB at exactly 1920×1080) and figure focus zooms to `FIG_MAX_SCALE` (8×), so a 3968px-wide diagram is high-resolution on purpose. WebP q92 alone gets those files to 12–18% of their original size. `--max-width` exists for real outliers and only ever shrinks – `cwebp -resize` would happily enlarge a narrower image, so `imageSize()` (a zero-dep PNG/JPEG header reader) gates it. Raster formats become base64 `data:` URIs in `<img>` tags. **SVG assets are spliced inline as `<svg>` elements** (not `data:` URIs) so they inherit page CSS custom properties – `--ink`, `--paper`, `--ink-soft` – and re-color when the user cycles themes with the `A` hotkey. To keep multiple inlined SVGs from cross-contaminating each other, the inliner gives every instance a unique `psi-fig-N-` prefix and rewrites `id="…"`, `url(#…)`, `href="#…"`, and `xlink:href="#…"` accordingly; inline `<style>` blocks are wrapped in `@scope (svg#psi-fig-N-root) { … }` (with `@import` and `@font-face` hoisted out so they remain at top level). See `inlineSvg()` in `build.js`.

### Authoring contract

By default every chunk must open with a **topic sentence that stands on its own**, because in the live audience view the `topic-bold` collapse mode renders only that sentence plus any `**bold**` fragments. Authors promote bullet-worthy phrases to bold; unbolded continuation prose renders only in print. This shapes both the render logic (the `splitSentencesIn` walker and collapse CSS) and the lint budgets (narrow types have small budgets because the topic sentence is the payload).

A chunk can opt out of that derivation with `::: slide` (this block is the screen) or `::: script` (everything but this block is the screen). Use it when the argument wants continuous prose that no first-sentence rule can carve up sensibly. See PRD §4.5.

### Chunk grammar

Chunk grammar: `## type: Heading | Sub-Heading {.width #id}` where `type` is one of `title`, `closing`, `outline`, `principle`, `definition`, `example`, `question`, `figure`, `exercise`, `free`, and width is one of `narrow` (28em), `standard` (36em), `wide` (52em), `full` (72em). The `|` sub-heading and the `{...}` attribute tail are both optional; width defaults to `standard`.

Four things worth knowing before writing chunks, all learned the hard way:

- **`principle` is not a narrow type.** The type sets treatment and budget, never width, but the docs used to pair it with `.narrow` and every example followed – which meant anything longer than one sentence became a tall thin ribbon. Prefer `.standard` for principles. `narrow` itself went from 22em to 28em for the same reason.
- **Code lines have a width budget, and it is smaller than it looks.** A `<pre>` does not wrap, so a long line would run off the projection. `clampZoomToWidth()` stops that by shrinking *that one slide* – never the lecturer's zoom setting, which is global and comes back on the next chunk. The budget at the default zoom (1.35) in a 16:9 window is roughly **78 characters**, and it is the **same at every chunk width**: a top-level code block breaks out of the text column to 72vw and pins to the slide centre, so `.narrow` and `.full` give a line exactly as much room. Inside one pane of a `::: side` the block stays in its local container and the budget is about **36**. The count holds for any 16:9 window, because the base font is a fraction of the slide height, and it is measured against the bundled JetBrains Mono at 0.60 em per character – `mono: Noto Sans Mono Condensed` measures 0.50 and buys about **94**. (It was ~57 and ~27 until `.chunk-body pre` stopped multiplying by `var(--zoom)` a second time – code is set at 0.78 of the prose it sits in, and until that fix the ratio only held at zoom 1.) Over budget is not an error, it is a slide rendered smaller than its neighbours – so treat a heavily clamped chunk as a signal to break the line, not as something the runtime should fix harder.

  **A chunk carrying a top-level code block wants `.wide` or `.full`, and the reason is that same 72vw.** Measured in a built page at 1600×900 and the default zoom: the prose column is 842 px in `.standard` and 1152 px in `.wide` and `.full`, and 72vw is 1152 px exactly. So in a `.wide` chunk the block and the prose are the same column, and in a `.standard` one the block sticks out on both sides of the text it belongs to and reads as a rendering fault. It is not one – the clamp budget really is the same at every width – but the eye is measuring the block against the paragraph above it, not against the frame. The tutorial's `#figure-focus` shipped `.standard` for exactly this reason and was widened.
- **A chunk's heading can be the document's without being the slide's.** `## figure: How a crawl is scored {.full #loop .bare}` renders the heading in `print.html` and in the search index, and **not on the projection**. `style: {headings: off}` is the same switch for a whole deck. The case is a talk that is a run of `::: draw` figures with speaker notes: the room looks at the drawing, and the deck still needs a name per slide to navigate by and to print. Leaving the heading *text* out gives up all four at once, which is the trade the `psi-slides-appearance` skill's note on figure headings describes; this gives up only the first.

  Three things make it cheap and none should be traded away. It is `display: none` and **not a dropped element**, because the search index and the speaker's own lists read the heading's text out of the DOM. **Neither table of contents is among them, and the docs used to say it was**: `renderToc` and the live `nav#toc` both build from `columns.filter(c => c.heading)`, so a *chunk* heading has never appeared in either. What `.bare` costs is the slide and nothing else; what it saves is the printed document and search. It is emitted **only by the audience renderer**, so `PRINT_CSS` carries no rule and the document is byte-identical. And `off` lives in the **existing `style.headings` key** beside `left` and `center` rather than in one of its own: the two readings are one question – what the projection does with a heading – and a second key's only legal combination with this one would have been "off, and also aligned left", which means nothing.

  `.bare` is one of the two non-width classes an attribute tail may carry
  (`VALID_CHUNK_CLASSES`); `.center` is the other, and it sets the chunk's
  prose on a centre axis. Both are audience-only for the same reason – where
  words sit on a slide is not a question the printed document asks – and
  `.center` reaches `.chunk-body > .reveal-segment > p` and nothing nested, so
  a list, a table, a code block and a `::: side` pane keep their left edge.
  Centring every `figure:` caption by default was tried and reverted: the
  seven-line paragraph under `lectures/diagrams` `#flowchart` came out ragged
  on both edges, and no selector knows how long a caption is.

  An unknown class in that tail used to be dropped without a word by the build while `lint.js` called it an unknown *width*, which named the wrong thing; both now say "unknown class" and list what a tail takes. Neither class is legal on a `title` or `closing` chunk, where the cover composition decides the width, the heading and, through `cover-align`, where the words sit.

- **The live views do not print the type name.** The small-caps eyebrow (PRINCIPLE, DEFINITION, …) was removed from `renderAudienceChunk`: it announced a taxonomy that is only as right as the type choice was, and a mislabelled slide reads to the room as an error. `renderChunk` (the document renderer) still emits `.chunk-label`, and `.tag-label` in the audience is now only the *expansion* label. Search results read the type off `data-tag` for this reason.

### Animated infographics (`::: draw`) and the diagram editor

**Development state, not in any tagged release.** `package.json` still reports
1.0.0 and the latest tag does not include the feature; the changelog entry stays
under `## [Unreleased]`. Publishing `main` and cutting a release are separate
events – `pages.yml` redeploys the project site on every push.

A boxes-and-arrows compiler: a line-oriented DSL inside the lecture markdown
compiles to one inline `<svg>` plus, where the author wrote `step` blocks, a
payload of per-beat geometries the live runtime tweens between. `renderDiagram()`
is the entry point. **`diagram-core.mjs` is the one documented exception to the
single-file build**, because the browser editor has to run the same compiler; it
is pure JS with zero imports and zero Node APIs.

**The whole vocabulary, the slot tables, the generated names, the four design
decisions and the editor's contract are in the `psi-slides-figures` skill.** Read
it before authoring a `::: draw` block or changing `diagram-core.mjs`,
`editor.mjs`, or the diagram half of `lint.js`. `figure-design.md` is the craft
that sits on top of it; `editor.md` §15 is the build log.

**What stays true here:** `lint.js` imports the diagram vocabulary from
`diagram-core.mjs` – tables only, never a function, or the whole compiler comes
in behind it and the linter stops being runnable without the Markdown/Shiki
stack. Steps ride the existing reveal counter, so `revealed[chunkId]` remains the
only state sync, the freeze gate and localStorage recovery share.

### Slide decoration and section dividers

Four constructs are one idea – **a slide is a frame, and the frame can carry more
than a text column**: `cover:` (ten compositions, with `subtitle:`,
`cover-image:`, `cover-ratio:`, `cover-align:`), `::: backdrop`, `::: overlay`,
and `::: cards` / `::: rows`. `## closing:` is the cover's bookend and
`## outline:` the running agenda; `section:` gives a column's divider slide six
compositions, every one of them quieter than the cover. All of it is additive: a
`source.md` using none of it builds byte-identically to before.

**The full vocabulary, the slot tables, the refusals, and the CSS traps each one
cost are in the `psi-slides-decoration` skill.** Read it before changing the
decoration or divider renderers, their `lint.js` mirrors, or `test/settings.mjs`.
`lectures/decoration/source.md` is where the constructs are shown rather than
described.

**What stays true here:** the class tails are closed vocabularies resolved into
slots by `parseSlotClasses`, and **no word may appear in two slots of one table** –
`build.js` asserts it at load. A check that can refuse a deck belongs in the
`buildOnce` pre-flight beside `assertInlinable`, not in a renderer, or
`--print-only` never reaches it.

### Type, themes and viewer defaults

Three font families ship in any one output as variable `wght` latin subsets,
upright and italic; **which three is a per-lecture decision** made in the `fonts:`
block, where a bundled name needs no file and an author-supplied one is matched
out of `fonts/` beside `source.md`. `ligatures:` separates prose ligatures (on)
from code ligatures (off – `->` and `--` are two different edges in the figure
grammar). `lang:` picks the print hyphenation dictionary. Seven themes cycle on
`A`, and `applyFontTheme()` sets `body[data-mode]`, which is what every piece of
chrome keys off rather than a theme name. Six frontmatter keys pin how a lecture
opens; an unknown value **fails the build**, because a typo here is otherwise
invisible.

**The rosters, the slot tables, the measured advance widths, the precedence
rules and the 1.0.0 recipe are in the `psi-slides-appearance` skill.**

**What stays true here:** `FONT_STACK_TAILS`, `THEME_NAMES` / `DARK_THEME_NAMES`
and `VIEW_DEFAULT_SPEC` are each a single source of truth that `lint.js` mirrors –
change them in the same commit. And **`dgCharW` in `diagram-core.mjs` is
calibrated to the bundled sans**: a roster change that does not re-measure it
overflows figure labels silently.

### Video, hosted embeds and link addresses

A clip is a figure that moves, so it shares the `![](clip-id)` shorthand rather
than getting a directive of its own; over `MAX_INLINE_VIDEO_BYTES` (12 MB) it is
**staged** to `videos/` beside the output instead of failing the way an oversized
image does. `::: embed <url>` is its own directive precisely because it is the
single construct that makes an output fetch from a third party at run time. An
external link puts its **address plus a build-time QR code** on both screens
instead of opening a page on the projector.

**The extension tables, the sync protocols, the staging rules and the
`file://` Error 153 case are in the `psi-slides-media` skill.**

**What stays true here:** video, embed and diagram-edit state all sync as their
own message types rather than through the state snapshot – `applyRemoteState` is
a *full* apply, so a snapshot sent for one field drags the receiver's slide
position with it. See `speaker.md` §2.

## Reference material

- `CONTRIBUTING.md` – **the build and release procedure** (§ Building and releasing): what the two workflows do, what has to be true before tagging, and why the release asset names cannot change. Follow it rather than improvising a release.
- `PRD.md` – §1 non-negotiables, §2 content model, §2.1 type vocabulary, §3 source format + parsing contract, §4 visual language, §7 speaker view, §9 build system. Read this before making design-shape changes.
- `speaker.md` – speaker spec and the `window.postMessage` sync protocol (fields, direction, freeze gating, timer, localStorage recovery).
- `editor.md` – the diagram editor: what it is for, the four decisions, the grammar contract it edits against, the drag policy, and **§15, a build log written while building** – what landed, what it cost, and what bit. Read §15 first if you are picking the work up. §13 answers the two questions the plan left open, from the running prototype, and §14 is how a picture gets into a figure.
- `.claude/skills/psi-slides-authoring/SKILL.md` – **how to write a lecture `source.md`**: the chunk grammar in practice, the `:::` directive vocabulary, reveal segments, notes, images and math, with worked examples. Invoked as the `psi-slides-authoring` skill.
- `.claude/skills/psi-slides-figures/SKILL.md` – **the `::: draw` vocabulary and the editor's contract**, lifted out of this file so it loads when figures are the work. Every statement, class, slot table and generated name, plus the four decisions behind the compiler. Invoked as the `psi-slides-figures` skill.
- `.claude/skills/psi-slides-decoration/SKILL.md` – **the cover, backdrop, overlay, card, row and divider vocabulary**, same reasoning: the slot tables, the refusals, and the CSS traps each construct cost. Invoked as the `psi-slides-decoration` skill.
- `.claude/skills/psi-slides-appearance/SKILL.md` – **type, themes and viewer defaults**: the bundled and author-supplied font rosters, `ligatures:`, `lang:`, the seven themes, the six viewer-default keys, `style.labels`, and the three-line recipe for the 1.0.0 look. Invoked as the `psi-slides-appearance` skill.
- `.claude/skills/psi-slides-media/SKILL.md` – **video, hosted embeds and link addresses**: the extension tables, the two sync protocols, clip staging, and the build-time QR codes. Invoked as the `psi-slides-media` skill.
- `figure-design.md` – **how to lay out a `::: draw` so a room reads it**, as instructions rather than principles: fifteen rules, most with a wrong/right pair in real syntax, the tone-to-role table, the four-beat step order, and a checklist to work down before a figure is finished. Written for a person and a language model equally. Read it before authoring figures; the grammar itself is in the `psi-slides-figures` skill.
- `HANDOFF.md` – slice-by-slice build diary in German/English mix. Latest sections describe current state and deliberate non-choices. Update when landing a substantial slice.
- `README.md` – short public-facing intro.
- `lectures/tutorial/source.md` – the canonical authoring reference (self-referential lecture). Build and open its `audience.html` to see every directive live.
- `lectures/diagrams/source.md` – every `::: draw` construct, including two of the stepped figures the feature was built for (CBC decryption, a stack frame being overrun) and, in `#sequence` and `#seqmore`, the whole of the `sequence` sub-grammar with two annotations hung off its generated names. Its `#look` chunk is the reference for the class vocabulary: every fill, every family, and the three answers to how type meets its box. The lecture-wide `draw-defaults` block is in its frontmatter.
- `lectures/decoration/source.md` – **every slide-decoration construct, shown rather than described**: the card and row vocabulary, `::: side` with a ratio, `::: backdrop` with a `reveal` in both directions, `::: overlay` with `from`, `{.bare}`, `::: draw {autoplay cycle}`, a `## outline:` chunk, a `## closing:` slide, and the three kinds of divider content – a quotation, a photograph and a figure, one per column. It is the third tracked lecture, for the same reason `lectures/diagrams/` is the second: a reader should be able to see a construct working before writing it.

  **A deck has exactly one cover and one `section:` variant, so one lecture cannot show ten and six.** This one wears `cover: quote` and `section: outline` and names the rest in a card row; the gallery of all ten compositions lives on the project site, where ten compositions side by side is what the page is for.

- `lectures/network-security/source.md` – **thirty-six real lecture slides rebuilt as figures**, and the reason the outlines, `.turn`, `bars`, `grid`, `plot` and `.smooth` exist. Rebuilt from two PowerPoint decks with the wording kept verbatim (original typos included, each marked in a `#` comment) and the arrangement redrawn. Read it for what the vocabulary looks like at scale; `figure-design.md` is the rules it was built against. Linted **and built** by CI, as a compiler check on the largest body of real figures there is, but not published – unlike `lectures/diagrams/`, which is now both. Its views are not tracked, so a build here is the only thing that compiles it.
- `lectures/python-intro/source.md` – richest example of `::: cols`, `::: side`, and `::: marginalia` in combination, 36 chunks. It is also what the project site's screenshots come from, so a change to `#why-playwright` means re-running `docs/site/shoot.mjs`.
- `docs/artifact/` and `docs/site/figures.html` – **two pages, and the split is the point.** `docs/site/figures.html` is the *case* for the figure language: situation, complication, answer, then three figures that carry it (the seven-line hero, the two-beat one whose second beat moves four things nobody named, and a passkey protocol), then the four decisions and the comparison with drawing tools and auto-layout languages. `docs/artifact/figures-you-write.html` is the *manual*: build a figure a line at a time, give it beats, then every class and statement, fifteen design rules, and a gallery. They were one page, and it did neither job well – its own eyebrow put `start here` on the **second** section, 1,562 words in, and a reader who wanted to learn walked through a manifesto naming all nine step verbs before meeting a `box`. Splitting them put `start here` first and cut those 1,562 words to 306. **Both are produced by `refresh-figures.mjs`**, which is the only text that compiles a figure for publication, and `--check` covers both &ndash; **run by `pages.yml` before it assembles the site and by `release.yml` beside the tracked-output check**, which it was not when those two files first claimed it was. A staleness gate nothing runs is a comment; `demo-controls.js` is inlined into both, because two copies of the same event wiring is how the arrows on one page come to behave differently from the arrows on the other. `build-site.js` copies the manual into the published site, because the case ends by sending the reader to it. Plus the lecture both draw with. `figures-you-write.html` is hand-written prose around machine-made parts: every drawing, every listing, the stepped demos, the compiler's stylesheet, its runtime and the three webfonts are lifted out of a real build (or out of `node_modules`) by `refresh-figures.mjs`, so a change to the compiler reaches the page by running that script rather than by anyone redrawing anything. **The page fetches nothing at run time** – the fonts are embedded as `data:` URIs rather than pulled from Google Fonts, which is the same reasoning the project site follows and the same promise the lecture outputs make. Verified by loading it with every non-`file:`, non-`data:` request blocked: zero requests. It costs 372 KB of base64 for six faces. `figure-rules/source.md` is the lecture those figures are compiled from, and it exists only to be compiled – CI lints it, and a compiler change that would spoil the page breaks it there first, where `node lint.js` can name the line. Its chunk ids are the contract with the script; do not rename one without renaming it there too.
- `docs/comparison.md` – how psi-slides differs from Beamer, reveal.js, Quarto, Marp and friends, in both directions. Published as a page on the site.

## Conventions

- **En-dashes only.** Use `–` or `&ndash;` in all prose (docs, markdown, comments, lecture sources). Never em-dashes (`—`).
- When adding or renaming a chunk type, change it in **both** `build.js` and `lint.js` (and document the visual treatment in `PRD.md` §2.1).
- **The word is "type" everywhere a user reads it and `tag` everywhere the code says it.** Prose, headings and linter messages say *chunk type*; `VALID_TAGS`, `chunk.tag`, `data-tag`, `.tag-label` and `parseTagPrefix` keep the old name, because `data-tag` is in the published outputs and is what the search index and the speaker's lists read. Renaming the identifiers would change an output attribute for no reader's benefit. The `::: draw` `@tag` is a different thing altogether and stays a tag.
- Don't commit generated HTML outputs – they are regenerated per build and gitignored. Exception: **`lectures/tutorial/` and `lectures/diagrams/` track all four views**, and **`lectures/decoration/` tracks two, `audience.html` and `print.html`**. What the decoration reference demonstrates is what a slide looks like, so the projection and the printed document carry the whole of it; the notes view and the cockpit would add about 2 MB of tracked HTML and show nothing the other two do not. Rebuild and commit when any of the three sources changes. The release workflow fails if they are stale.
- `{#id}` attributes on chunks are **frozen once authored**. They are the anchor for cross-references, TOC entries, speaker-sync snapshots, and localStorage persistence. Don't renumber them reflexively when headings change.
- Shiki is loaded once and cached across `--watch` rebuilds; adding a new language means extending `SHIKI_LANGS` (and optionally `LANG_ALIAS`) at the top of `build.js`.
- **Math delimiters are `marked` extensions, and the inline rule must keep refusing to cross a backtick.** marked runs custom inline extensions *before* its own `codespan` tokenizer, so relaxing the content class lets a stray `$` in prose pair with one inside a following code span and swallow the delimiting backtick. This was a real regression, not a hypothetical: `a price of $5 and $10, ` + backtick-`$PATH` rendered as a formula reading `10, ` + backtick.
- **`FOCUSABLE_SEL` in `AUDIENCE_JS` must stay a single constant.** Audience and speaker each resolve `figureIdx` against their own DOM, so the two windows focus different elements the moment their selectors disagree. Adding a focusable element type means editing that one string.
- **Everything inlined lives in a template literal.** Three edit mistakes are easy and expensive there:
  - A raw backtick, **even inside a comment**, ends the literal. Throws at parse time. Never write one in `AUDIENCE_JS` / `SPEAKER_JS` / the CSS constants – name the identifier plainly instead.
  - An unterminated `/*` in a CSS block silently swallows every rule to the next `*/`. This used to ship broken, so `assertStylesheetsWellFormed()` runs on every `buildOnce` and turns it into a hard error.
  - **A regex backslash must be doubled.** `\s` inside a template literal is an escape the build resolves, so source `/\s+/g` emits `/s+/g` – a regex that matches the letter s. This ships silently: it cost a search index that had every `s` stripped out of its text. Write `/\\s+/g` in `build.js`, and grep the built HTML to confirm what was emitted.

  The first and third of these are now a gate: `node test/gates/run.mjs inlined` names the literal and the line in milliseconds, where a stray backtick otherwise costs a build and points the `SyntaxError` at the identifier *after* it. Run it before judging a build failure inside an inlined block. It does not replace reading the emitted HTML – a gate can see that an escape was doubled, not that the rule you wrote does what you meant.
- **Verifying an inlined change: never discard stderr, and check the output first.** `node build.js … 2>&1 >/dev/null` hides a `SyntaxError` and leaves the *previous* HTML on disk, so the browser then shows a stale build that looks like a change with no effect. After touching an inlined stylesheet or script, `grep -F` the new rule or function in the built HTML before judging it in the browser.
