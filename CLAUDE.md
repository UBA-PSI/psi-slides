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

# two questions only a rendered page can answer, so both drive the built
# audience.html in a real browser with playwright-core and both degrade
# rather than fail (no browser, or no playwright-core, says so and leaves the
# exit code alone). They share one bootstrap, `openAudienceProbe`, which reads
# $PSI_CHROME first and then the chrome/msedge channels.
#
# --check-fit asks whether the slide is inside the frame: it walks state by
# state at 1600x900 and reports any slide that fits the frame and is
# positioned outside it. Exit 2 if one is; the density budgets are word
# counts, so cards and rows overflow with a clean lint.
node build.js <source.md> --check-fit
node build.js <source.md> --check-fit --viewport 1920x1080
#
# --squint writes the projection back out as text - what each slide paints,
# what the collapse withholds, what arrives on which beat - to squint.txt
# beside the source. Read it before arguing about a lecture's wording: the
# collapse is CSS and JS, so source.md is not the slide. It never fails a
# build, and it is blind to colour, contrast and overlap - that half is
# --check-fit and your eyes. Notation and the six decisions behind the format:
# the `psi-slides-authoring` skill.
node build.js <source.md> --squint
node build.js <source.md> --squint --squint-out -    # to stdout instead

# static checks – run before committing
node lint.js lectures/                         # all lectures
node lint.js lectures/tutorial/source.md       # single file
node lint.js lectures/ --strict                # warnings → exit 2

# two test suites, split by one question: can this be decided without a
# browser? test/gates/ is everything about the figure language that can - six
# gates, 440 assertions, under a second, no browser and no `npm install`
# (diagram-core.mjs and lint.js are both zero-dep). test/ is the things that
# only break in a built page - 33 specs, ~834 assertions, ~5 min, one Chromium.
# `npm test` runs the gates first so a compiler regression fails in a second
# rather than in four minutes; gates.yml runs them on push and PR.
#
# Run the browser suite after touching AUDIENCE_JS, the key map, editor.mjs,
# createSpanTable, or anything that moves a label or an extent. Anything
# checkable without a browser belongs in lint.js or in test/gates/, never here.
#
# WHAT EACH GATE AND EACH SPEC FAMILY GUARDS, and the five specs that build a
# deck of their own rather than hunting shapes in a real one: test/README.md.
npm run gate                                   # all gates
node test/gates/run.mjs semantics              # gates whose name matches
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

- `// ── math (KaTeX, rendered at build time) ──` – the family→class map is **parsed out of `katex.min.css`** (`node_modules/katex/dist/`, reached with `nodeRequire.resolve`), never hard-coded, so it survives a KaTeX upgrade; and the stylesheet is emitted only for views that actually contain a formula, because the inlined woff2 faces are 254 KB for the full set. The live views additionally carry `KATEX_TOGGLE_FAMS` (sans + typewriter, ~46 KB) so the maths can follow the `F` toggle; print passes no `fontToggle` flag and pays nothing extra.
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

**The four `::: draw` refusals live in the `psi-slides-figures` skill**, with the reasoning each one encodes. The **diagram vocabulary is the exception** to this file's no-imports rule: it is imported from `diagram-core.mjs`, which has no dependencies of its own, so importing it costs nothing this file was protecting and removes every table that used to have to change in two places in one commit. **Tables only.** A function from that module would pull the whole compiler in behind it – with the one bend recorded in the `psi-slides-figures` skill, for rules that ARE the vocabulary.

Checks enforced:

- Unknown type, unknown width class.
- Duplicate or missing chunk IDs (required on every non-title chunk).
- Unclosed `:::` directives and orphan `:::` closers.
- Per-type word-count budgets (principle/question 80, definition 200, example 250, free 250, exercise 350; title/figure unlimited). Counted against the **on-screen** half only: the `::: slide` block if the chunk has one, otherwise everything outside `::: script`.
- Duplicate `::: slide` / `::: script` blocks in one chunk (warning).
- Unknown value for a viewer-default frontmatter key (`unknown-view-default`, error) or for a `style:` key (`unknown-style-setting`, error). Both mirror a build refusal that now runs in the `buildOnce` pre-flight, so `--print-only` refuses a typo in `auto-fit` and `--audience-only` refuses one in `print-slide-numbers`.
- Assets over the 2 MB inline cap (`oversized-asset`, warning) – the pre-commit gate for the single-file property.
- Unclosed display math (`unclosed-math`, warning). Fence-aware. Inline `$…$` is deliberately not checked: a lone dollar in prose is legitimate and the build leaves it alone.
- A bold of two words or fewer sitting after a paragraph's first sentence
  (`single-word-bold`, warning; the author-facing rule is in the
  `psi-slides-authoring` skill). **It mirrors `splitSentencesIn`'s head/rest walk
  and its three sentence helpers, which live inside the `AUDIENCE_JS` template
  literal and so cannot be imported** – keep them congruent or the two files
  disagree about where a first sentence ends. **The mirror is guarded in
  `test/settings.mjs`**, which lifts the helpers out of a built `audience.html`
  and out of `lint.js` *as text* and runs them side by side, because neither copy
  can be imported: lint.js calls `main()` at module scope, and the build's copy
  is characters inside a string until a page runs it. That is the assertion that
  matters – a contract drifts when someone changes a number, visibly; an
  algorithm drifts when someone fixes an edge case in the renderer, invisibly,
  and the warning then describes a collapse that no longer happens.
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

An attribute tail may also carry six non-width classes: `.bare` and `.center`
(`VALID_CHUNK_CLASSES`, audience-only) and `.wrap-none` / `.wrap-balance` /
`.blocks-left` / `.blocks-center` (`CHUNK_STYLE_CLASSES`, a `style:` key answered
for one chunk, and these four reach print). All six are refused on a `title` or
`closing` chunk except the `style:` four. **The vocabulary, what each one costs,
the character budget a code line has and why `.bare` hides rather than drops are
in the `psi-slides-authoring` and `psi-slides-appearance` skills** – authoring
for what to write, appearance for what the build does with it.

Two things worth knowing before writing chunks, because neither is guessable and
both were learned the hard way:

- **`principle` is not a narrow type.** The type sets treatment and budget, never width. The docs used to pair it with `.narrow` and every example followed, which made anything longer than one sentence a tall thin ribbon. Prefer `.standard`; `narrow` itself went from 22em to 28em for the same reason.
- **The live views do not print the type name.** The small-caps eyebrow (PRINCIPLE, DEFINITION, …) was removed from `renderAudienceChunk`: it announced a taxonomy only as right as the type choice was, and a mislabelled slide reads to the room as an error. `renderChunk` (the document renderer) still emits `.chunk-label`, and `.tag-label` in the audience is now only the *expansion* label. Search results read the type off `data-tag` for this reason.

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
grammar). `lang:` picks the hyphenation dictionary and `style: {hyphenate: …}`
says which views use it (`print` – the default and today's behaviour – / `all` /
`none`); the two are separate keys because the language is a property of the
lecture and the hyphenation is a preference. Seven themes cycle on
`A`, and `applyFontTheme()` sets `body[data-mode]`, which is what every piece of
chrome keys off rather than a theme name. Seven frontmatter keys pin how a
lecture opens; an unknown value **fails the build**, because a typo here is
otherwise invisible.

**The rosters, the slot tables, the measured advance widths, the precedence
rules and the 1.0.0 recipe are in the `psi-slides-appearance` skill.**

**What stays true here:** `FONT_STACK_TAILS`, `THEME_NAMES` / `DARK_THEME_NAMES`,
`VIEW_DEFAULT_SPEC`, `STYLE_SPEC` and `CHUNK_STYLE_CLASSES` are each a single
source of truth that `lint.js` mirrors –
change them in the same commit. And **`dgCharW` in `diagram-core.mjs` is
calibrated to the bundled sans**: a roster change that does not re-measure it
overflows figure labels silently.

Three of the viewer defaults carry a decision the table does not:

- **`slide-numbers` defaults to `horizontal`.** It defaulted to `vertical` up to
  1.0.0, and this is the one viewer default whose own change moves what an
  existing deck renders – stacked digits put slide 10 on two lines. The old
  rendering is `slide-numbers: vertical`, and there is deliberately no
  compatibility flag beside it.
- **`print-slide-numbers` has no default, it defers.** Absent, it resolves to
  whatever the live key resolved to. `printSlideNums()` is the one documented
  step that does that (`printSlideNums || slideNums || SLIDE_NUM_DEFAULT`);
  reading the key anywhere else with a fallback would silently make an unset
  key mean `horizontal` rather than "follow".
- **`auto-fit` is three modes and `state.autoFitMode` is a string.** Frontmatter
  says `true` / `false` / `shrink`, the runtime says `full` / `off` / `shrink`,
  and `AUTO_FIT_FROM_KEY` is where the two meet. **Never write
  `if (state.autoFitMode)`** – all three words are truthy; `autoFitOn()` is the
  test and `autoFitCeiling()` is the whole difference between the two on-modes
  (2.2 vs the lecturer's own zoom). The snapshot carries the mode *and* a legacy
  boolean, because `--audience-only` rebuilds one of the two windows and an
  older peer coerces the field with `!!`.

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
- `test/README.md` – **the two test suites and which one a thing belongs in**: what each of the six gates guards, the four browser-spec families, and the five specs that build a deck of their own rather than hunting shapes in a real one.
- `PRD.md` – §1 non-negotiables, §2 content model, §2.1 type vocabulary, §3 source format + parsing contract, §4 visual language, §7 speaker view, §9 build system. Read this before making design-shape changes.
- `speaker.md` – speaker spec and the `window.postMessage` sync protocol (fields, direction, freeze gating, timer, localStorage recovery).
- `editor.md` – the diagram editor: what it is for, the four decisions, the grammar contract it edits against, the drag policy, and **§15, a build log written while building** – what landed, what it cost, and what bit. Read §15 first if you are picking the work up. §13 answers the two questions the plan left open, from the running prototype, and §14 is how a picture gets into a figure.
- `.claude/skills/psi-slides-authoring/SKILL.md` – **how to write a lecture `source.md`**: the chunk grammar in practice, the `:::` directive vocabulary, reveal segments, notes, images and math, with worked examples. Invoked as the `psi-slides-authoring` skill.
- `.claude/skills/psi-slides-figures/SKILL.md` – **the `::: draw` vocabulary and the editor's contract**, lifted out of this file so it loads when figures are the work. Every statement, class, slot table and generated name, plus the four decisions behind the compiler. Invoked as the `psi-slides-figures` skill.
- `.claude/skills/psi-slides-decoration/SKILL.md` – **the cover, backdrop, overlay, card, row and divider vocabulary**, same reasoning: the slot tables, the refusals, and the CSS traps each construct cost. Invoked as the `psi-slides-decoration` skill.
- `.claude/skills/psi-slides-appearance/SKILL.md` – **type, themes and viewer defaults**: the bundled and author-supplied font rosters, `ligatures:`, `lang:`, the seven themes, the six viewer-default keys, the whole `style:` block including `labels` and `blocks`, the four chunk classes that answer `wrap` and `blocks` for one slide, and the three-line recipe for the 1.0.0 look. Invoked as the `psi-slides-appearance` skill.
- `.claude/skills/psi-slides-media/SKILL.md` – **video, hosted embeds and link addresses**: the extension tables, the two sync protocols, clip staging, and the build-time QR codes. Invoked as the `psi-slides-media` skill.
- `figure-design.md` – **how to lay out a `::: draw` so a room reads it**, as instructions rather than principles: fifteen rules, most with a wrong/right pair in real syntax, the tone-to-role table, the four-beat step order, and a checklist to work down before a figure is finished. Written for a person and a language model equally. Read it before authoring figures; the grammar itself is in the `psi-slides-figures` skill.
- `HANDOFF.md` – slice-by-slice build diary in German/English mix. Latest sections describe current state and deliberate non-choices. Update when landing a substantial slice.
- `README.md` – short public-facing intro.
- `lectures/tutorial/source.md` – the canonical authoring reference (self-referential lecture). Build and open its `audience.html` to see every directive live.
- `lectures/diagrams/source.md` – every `::: draw` construct, including two of the stepped figures the feature was built for (CBC decryption, a stack frame being overrun) and, in `#sequence` and `#seqmore`, the whole of the `sequence` sub-grammar with two annotations hung off its generated names. Its `#look` chunk is the reference for the class vocabulary: every fill, every family, and the three answers to how type meets its box.

  **`#look`'s `::: draw` block is load-bearing for four browser specs and must
  not be split** – `figure-prominence`, `editor-aim`, `editor-guides` and
  `editor-drag-guides` all measure that one figure, and the guide specs need one
  several rows tall with bare `at` anchors. Splitting the drawing was tried and
  reverted; its **prose** was split instead, onto `#outlines`, `#outline-size`,
  `#prominence` and `#typefit`, which is why the commentary on a row sits one
  slide after the row. The same cure was then applied to seven more chunks that
  `--check-fit` reported as taller than the frame. A spec that needs a shape the
  lectures do not have gets a fixture deck – see `test/README.md`.

  The lecture-wide `draw-defaults` block is in its frontmatter.
- `lectures/decoration/source.md` – **every slide-decoration construct, shown rather than described**: the card and row vocabulary, `::: side` with a ratio, `::: backdrop` with a `reveal` in both directions, `::: overlay` with `from`, `{.bare}`, `::: draw {autoplay cycle}`, a `## outline:` chunk, a `## closing:` slide, and the three kinds of divider content – a quotation, a photograph and a figure, one per column. It is the third tracked lecture, for the same reason `lectures/diagrams/` is the second: a reader should be able to see a construct working before writing it.

  **A deck has exactly one cover and one `section:` variant, so one lecture cannot show ten and six.** This one wears `cover: quote` and `section: outline` and names the rest in a card row; the gallery of all ten compositions lives on the project site, where ten compositions side by side is what the page is for.

- `lectures/network-security/source.md` – **thirty-six real lecture slides rebuilt as figures**, and the reason the outlines, `.turn`, `bars`, `grid`, `plot` and `.smooth` exist. Rebuilt from two PowerPoint decks with the wording kept verbatim (original typos included, each marked in a `#` comment) and the arrangement redrawn. Read it for what the vocabulary looks like at scale; `figure-design.md` is the rules it was built against. Linted **and built** by CI, as a compiler check on the largest body of real figures there is, but not published – unlike `lectures/diagrams/`, which is now both. Its views are not tracked, so a build here is the only thing that compiles it.
- `lectures/python-intro/source.md` – richest example of `::: cols`, `::: side`, and `::: marginalia` in combination, 36 chunks. It is also what the project site's screenshots come from, so a change to `#why-playwright` means re-running `docs/site/shoot.mjs`.
- `docs/artifact/` and `docs/site/figures.html` – **two pages, and the split is the point.** `docs/site/figures.html` is the *case* for the figure language; `docs/artifact/figures-you-write.html` is the *manual*. Both are produced by `docs/artifact/refresh-figures.mjs`, the only text that compiles a figure for publication, and its `--check` covers both – **run by `pages.yml` before it assembles the site and by `release.yml` beside the tracked-output check.** A staleness gate nothing runs is a comment. `docs/artifact/figure-rules/source.md` is the lecture both pages draw with, and it exists only to be compiled: CI lints it, so a compiler change that would spoil either page breaks it there first, where `node lint.js` can name the line. **Its chunk ids are the contract with the script – do not rename one without renaming it there too.** Everything else about the two pages, what the script owns and why the page fetches nothing at run time: `docs/artifact/README.md`.
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
