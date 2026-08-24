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
# in source.md – the markdown `](path)` form and the bare token a ::: diagram
# `image` statement carries, fenced code skipped (shorthand `![](fig-id)`
# refs need no edit). Needs cwebp or magick on PATH; measured 12-18% of the
# original on real lecture assets.
node build.js <source.md> --optimize-images --dry-run   # report, write nothing
node build.js <source.md> --optimize-images              # apply (assets >= 512 KB)
node build.js <source.md> --optimize-images --all        # every referenced raster
node build.js <source.md> --optimize-images --max-width 2600   # also downscale

# diagrams need no flag either: a ::: diagram block compiles to inline SVG
# at build time, and its `step` blocks become beats on the reveal counter.
# See "Animated infographics" below and lectures/diagrams/source.md.
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

# browser suite – the things that only break in a built page, in four
# families: the navigation model (nav, nav-cockpit), the editor's gestures and
# panel (editor-*), and the two that measure the emitted SVG – figure-framing,
# which catches a drawing sitting off-centre in an oversized frame, and
# figure-labels, which asserts both halves of the alignment rule. Fifteen
# specs, ~220 assertions. Builds and serves the lectures itself, so it never
# reports on stale HTML, and launches one Chromium for the whole run
# ($PSI_CHROME, the Playwright cache, or system Chrome); ~2 min. Run it after
# touching AUDIENCE_JS, the key map, editor.mjs, createSpanTable, or anything
# that moves a label or an extent. Not a unit-test suite: anything checkable
# without a browser belongs in lint.js, where it runs on every commit.
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

**`diagram-core.mjs` is the one documented exception**, and the reason is narrow: the graphical editor answers a drag by rewriting the source and re-running the compiler *in the browser*, so exactly one text has to compile a diagram in Node and in the page. Two copies of a 3,700-line compiler is not a duplication anyone can maintain. The file is pure JS with **zero imports and zero Node APIs**; the four leaves that were Node-only (asset resolution, aspect reading, the warning sink, `escapeHtml`) plus a fifth (`assetMarkup`, which splices a vector file inline) are injected by `createDiagramCompiler({…})`. build.js keeps those leaves, the diagram CSS and the step runtime. The move also *removes* a duplication: `lint.js` imports the vocabulary tables instead of mirroring twenty-one of them by hand – tables only, never a function, or the whole compiler comes in behind it and the linter stops being runnable without the Markdown/Shiki stack. See `editor.md` §8.1.

Navigate build.js by the `// ── section ──` banners:

- `// ── syntax highlighting ──` – Shiki singleton + per-build highlight cache.
- `// ── image shorthand resolution ──` – `![](fig-id)` → `assets/fig-id.{svg,png,jpg,jpeg,gif,webp}` (first match wins).
- `// ── math (KaTeX, rendered at build time) ──` – `$inline$` / `$$display$$`, the per-build render cache, and the conditional stylesheet. Two things here are load-bearing: the family→class map is **parsed out of `katex.min.css`**, never hard-coded, so it survives a KaTeX upgrade; and the stylesheet is emitted only for views that actually contain a formula, because the inlined woff2 faces are 254 KB for the full set. The live views additionally carry `KATEX_TOGGLE_FAMS` (sans + typewriter, ~46 KB) so the maths can follow the `F` toggle; print passes no `fontToggle` flag and pays nothing extra.
- `// ── marked renderer overrides ──` – custom `code` and `image` handlers on `marked`.
- `// ── diagrams (::: diagram) ──` – what is left of the compiler here: `dgResolveImage`, `dgAspect`, `dgAssetMarkup`, `dgWarn`, and the `createDiagramCompiler` call that injects them. Followed by `// ── diagram CSS ──` and `// ── diagram runtime ──`, which are inlined like every other stylesheet and runtime in this file.
- `// ── parsing ──` – `parseLecture()` and helpers (`parseTagPrefix`, `splitHeading`, `parseAttributeTail`).
- `// ── rendering ──` + `// ── print CSS ──` – print (document) renderer.
- `// ── audience rendering ──`, `// ── audience CSS ──`, `// ── audience runtime JS ──` – audience view, inlined as template strings. `renderHelpOverlay(view)` here generates the `?` cheat sheet for **both** live views from one data structure – edit labels there, not in the per-view HTML.
- `// ── window.postMessage sync ──` – the shared audience↔speaker protocol (see `speaker.md`).
- `// ── figure focus / marginalia pan ──` – click-to-focus for figures, code blocks, and marginalia.
- `// ── speaker rendering ──`, `// ── speaker CSS ──`, `// ── speaker-specific runtime ──` – speaker cockpit, layered on top of audience.
- `// ── CLI ──` – `buildOnce`, `runWatch`, `runNew`, `main`.

### Parser

`parseLecture(src)` is **line-based, not AST-based**. It walks the source tracking fence state, a `layoutStack` of open `:::` directives, a `currentExpansion` slot, and `pendingNotes`, emitting a `{frontmatter, columns: [{chunks: [...]}]}` structure. `marked` is only invoked later on each chunk's *body string* – by the time `marked` runs, reveal segments have already been split on standalone `---` lines (fence-aware). Attribute-tail syntax `{.width #id}` and the `tag: Heading | Sub {...}` prefix are parsed by hand, not by `marked`.

Design implications:

- A line that is exactly `---` inside a chunk body but **outside a code fence** is a reveal-segment separator, not a thematic break. `***` is available if an author needs a true horizontal rule.
- `::: expand <label>` and `::: margin` / `::: marginalia` become separate nodes attached to the chunk; `::: cols N`, `::: side` / `::: flip`, `::: slide` / `::: script` are layout wrappers that stay inline in the body as `<div>`/`<aside>` elements and let `marked`'s html-block passthrough render the inner Markdown.
- `::: slide` / `::: script` are the **explicit slide-content** escape hatch from topic-sentence extraction (PRD §4.5). They add no runtime state and no sync field: the parser emits `.slide-explicit` / `.script-only` wrappers and the whole mode is CSS (`:has()` rules under `[data-collapse=topic-bold]`), plus a `closest()` guard in `splitSentencesIn` so explicit blocks are never abridged. The hiding selector must match at any depth (`*:not(.slide-explicit):not(:has(.slide-explicit)):not(.slide-explicit *)`) – matching only `.reveal-segment > *` breaks as soon as a `::: slide` sits inside a `::: side` or `::: cols` wrapper.
- `::: cols N` **folds to a single column while collapsed** (`[data-collapse=topic-bold] .cols-2, .cols-3 { column-count: 1 }`). Collapsed content is one topic sentence per paragraph, and `.cols > *` sets `break-inside: avoid`, so the browser can only balance in whole paragraphs – a one-line and a five-line paragraph land as a stub beside a wall of text, and two short ones as two stubs with the full gutter between them. Print and the un-collapsed reading mode keep the author's columns, where there is enough content to balance.
- Speaker notes are blockquotes whose first line matches `note:` exactly; they attach to the current chunk (or to the next one if they precede the first chunk).

### lint.js is independent

`lint.js` is a **zero-dep** linter – nothing from `node_modules`, so it runs as a pre-commit gate without the Markdown/Shiki stack. It deliberately does not import anything from `build.js`; it re-implements the parsing contract and mirrors the constants (`VALID_TAGS`, `VALID_WIDTHS`, `DENSITY_BUDGET`, `VIEW_DEFAULTS`). When you change the parser vocabulary in `build.js`, update `lint.js` in the same commit – the duplication is the price paid for keeping the linter runnable without the Markdown/Shiki stack.

The **diagram vocabulary is the exception**: it is imported from `diagram-core.mjs`, which has no dependencies of its own, so importing it costs nothing this file was protecting and removes twenty-one tables that had to change in two places. **Tables only.** A function from that module would pull the whole compiler in behind it.

Checks enforced:

- Unknown tag, unknown width class.
- Duplicate or missing chunk IDs (required on every non-title chunk).
- Unclosed `:::` directives and orphan `:::` closers.
- Per-tag word-count budgets (principle/question 80, definition 200, example 250, free 250, exercise 350; title/figure unlimited). Counted against the **on-screen** half only: the `::: slide` block if the chunk has one, otherwise everything outside `::: script`.
- Duplicate `::: slide` / `::: script` blocks in one chunk (warning).
- Unknown value for a viewer-default frontmatter key (`unknown-view-default`, error).
- Assets over the 2 MB inline cap (`oversized-asset`, warning) – the pre-commit gate for the single-file property.
- Unclosed display math (`unclosed-math`, warning). Fence-aware. Inline `$…$` is deliberately not checked: a lone dollar in prose is legitimate and the build leaves it alone.
- Reveal-overuse (>50% of chunks using segments in a lecture flags a warning).
- Orphan columns (columns with <2 chunks).
- Figure caption redundancy (`figure:` chunk opens with an image whose alt text becomes a `<figcaption>` stacked under the heading – discourages three-label pile-ups of heading + sub-heading + caption).

### Four outputs, three renderers, one source

The four HTML files are **self-contained outputs**. They ship with their runtime JS/CSS inlined from build.js template literals, so they open from `file://` without a server. They are gitignored (`lectures/*/print.html`, `lectures/*/print-notes.html`, `lectures/*/audience.html`, `lectures/*/speaker.html`) – rebuild instead of committing them. The one exception is `lectures/tutorial/`, whose built HTMLs are tracked so readers can browse the self-referential tour straight from the repo; rebuild and commit them whenever the tutorial source changes.

`print-notes.html` is a second pass through the print renderer with `withNotes: true`; it embeds each chunk's `> note:` text as a `.speaker-note` aside under the chunk so a printed hand-out can show “what was on the slide + what the lecturer said”. Layout, CSS, and asset inlining are otherwise identical to `print.html`.

The audience↔speaker sync is cross-`file://`-origin safe because it uses `window.postMessage` over the opener relationship. Chrome's per-file opaque-origin policy isolates `BroadcastChannel` between tabs loaded from disk, which is why postMessage is the load-bearing channel. See `speaker.md` §2 for the full state-ownership matrix (audience is state root; speaker holds a local shadow plus a `frozen` flag). Two message types deliberately bypass the freeze gate because they are commands to the projector rather than shared state: `blank` (so `B` still works while frozen) and `slide-ref` (the audience's window dimensions after a resize). Resist the urge to fold either back into the state snapshot – `applyRemoteState` is a *full* apply, so a snapshot sent for one field drags the receiver's slide position with it.

### Asset inlining

Image assets are inlined into the single-file outputs by default (auto-inline budget: 10 MB total, per-file cap 2 MB; `--inline-images` / `--no-inline-images` overrides).

An asset over the per-file cap **fails the build**. It used to be a warning, and the output then shipped with an external path: correct on the machine that built it, broken figure anywhere the HTML travelled alone. `assertInlinable()` runs as a pre-flight in `buildOnce` before any rendering, so a failed build leaves no half-written artefact, and its message branches on what the author can actually do – convert (raster), install an encoder first (no cwebp/magick), or simplify by hand (oversized SVG, which `--optimize-images` cannot help with). The escape hatch is `--no-inline-images`, which is an explicit choice to ship external paths. `lint.js` keeps a matching `oversized-asset` warning (pure `fs.statSync`, still zero-dep) so the problem surfaces before the build too.

Errors of this kind set `err.userFacing = true`; the top-level handler prints the message without a stack trace, because a stack only buries the instructions. Reserve the flag for things the author must act on, never for defects in the build. Note what that verb deliberately does **not** do: it does not downscale by default. The offenders measured in the content repo were not oversized in pixels (the worst was 3.03 MB at exactly 1920×1080) and figure focus zooms to `FIG_MAX_SCALE` (8×), so a 3968px-wide diagram is high-resolution on purpose. WebP q92 alone gets those files to 12–18% of their original size. `--max-width` exists for real outliers and only ever shrinks – `cwebp -resize` would happily enlarge a narrower image, so `imageSize()` (a zero-dep PNG/JPEG header reader) gates it. Raster formats become base64 `data:` URIs in `<img>` tags. **SVG assets are spliced inline as `<svg>` elements** (not `data:` URIs) so they inherit page CSS custom properties – `--ink`, `--paper`, `--ink-soft` – and re-color when the user cycles themes with the `A` hotkey. To keep multiple inlined SVGs from cross-contaminating each other, the inliner gives every instance a unique `psi-fig-N-` prefix and rewrites `id="…"`, `url(#…)`, `href="#…"`, and `xlink:href="#…"` accordingly; inline `<style>` blocks are wrapped in `@scope (svg#psi-fig-N-root) { … }` (with `@import` and `@font-face` hoisted out so they remain at top level). See `inlineSvg()` in `build.js`.

### Authoring contract

By default every chunk must open with a **topic sentence that stands on its own**, because in the live audience view the `topic-bold` collapse mode renders only that sentence plus any `**bold**` fragments. Authors promote bullet-worthy phrases to bold; unbolded continuation prose renders only in print. This shapes both the render logic (the `splitSentencesIn` walker and collapse CSS) and the lint budgets (narrow tags have small budgets because the topic sentence is the payload).

A chunk can opt out of that derivation with `::: slide` (this block is the screen) or `::: script` (everything but this block is the screen). Use it when the argument wants continuous prose that no first-sentence rule can carve up sensibly. See PRD §4.5.

### Bundled and embedded webfonts

**Three families ship with the tool and are embedded in every output**: Literata, Inter Tight, JetBrains Mono, as variable `wght` latin subsets, upright and italic – 276 KB for all six faces. All three are SIL OFL 1.1, which permits redistribution and embedding; `OFL_NOTICE` puts the required notice in the emitted stylesheet.

This is a correctness fix, not polish. **Safari does not expose locally installed fonts to a page**, as an anti-fingerprinting measure, so the old name-only stacks resolved to Georgia and system-ui there no matter what the lecturer had installed. `fonts: none` in the frontmatter turns the bundle off for an author who would rather ship a smaller file.

`bundledFaces()` reads them out of `node_modules` rather than from checked-in binaries: the packages carry their own licence files, and `npm install` is required anyway.

An author's own fonts still win. A role named in the `fonts:` block uses their family; every role they leave out keeps the bundled one.

### Author-supplied webfonts

Everything else in an output file is self-contained; type was not. The stylesheets shipped bare family stacks (`'Literata', 'Source Serif 4', Georgia, serif`) which resolve only where those faces are **installed** and fall through silently everywhere else – a lecture mailed to a colleague kept its layout and its figures and lost its face.

An author opts in by dropping files into `fonts/` beside `source.md` and naming families in the frontmatter:

```yaml
fonts:
  serif: Literata
  sans: Inter Tight
  mono: JetBrains Mono
```

Files are matched by name prefix, with weight and style read off the suffix: `Literata-Regular`, `-Bold`, `-Italic`, `-BoldItalic`, `-600`, `-600italic`, and Google's variable naming `Literata[wght]` (→ `font-weight: 100 900`). `.woff2`, `.woff`, `.ttf`, `.otf` all work; anything but woff2 gets a size note. A named family with no matching file **fails the build** – falling back silently is the exact failure the feature exists to remove.

Three things to keep in mind when touching this:

- `FONT_STACK_TAILS` is the single source of truth for the default stacks. `AUDIENCE_CSS` interpolates from it and the `:root` override prepends to it, so an embedded family lands in front of the very list the build would otherwise have emitted. Don't re-inline those stacks.
- `font-display: block`, not `swap`. A lecture must not flash a fallback face on the projector and then reflow the slide under the room's eyes.
- The bytes are read and base64-encoded **once** in `buildOnce` and passed to all four renderers via `opts.fontEmbed`. Don't move the call into a renderer; that quadruples the work.

`lint.js` deliberately does **not** mirror this check. It would need `fs` plus the whole filename-parsing table, and the build already hard-fails with the list of files it found – so unlike `VALID_TAGS`, the duplication would buy nothing.

**Licensing is the author's problem and the docs say so.** Embedding redistributes the font file. SIL OFL and Apache-2.0 (between them nearly all of Google Fonts) permit it; most commercial *desktop* licences do not, and want a separate webfont licence. The build prints a reminder and makes no attempt to check.

### Video

A clip is a figure that moves, so it shares the `![](clip-id)` shorthand rather than getting a directive of its own: `VIDEO_EXTS` (`mp4`, `webm`, `m4v`, `mov`) are searched *after* the image extensions, so an id with both a poster and a clip still resolves to the still. The renderer emits `<figure class="figure-video"><video controls preload="metadata" playsinline>`.

Three ways to reference one:

- `![](clip-id)` – a file in `assets/`, inlined if under the cap.
- `![](path/to/clip.mp4)` or `![](https://host/clip.mp4)` – a written-out path or URL. A **remote** clip is worth more than it looks: it is still a local `<video>`, so the play/pause/seek sync works unchanged, with no iframe and no provider SDK. That is exactly what a YouTube or Vimeo embed cannot give back.
- Over the cap: **staged**. `stageVideo()` copies the file to `videos/` next to the output and emits `videos/<name>`; the build says so and says the output now needs that folder beside it. Copied, never moved, and skipped when the destination already matches by size and mtime so `--watch` does not re-copy 200 MB on every keystroke. Oversized *images* still hard-fail in `assertInlinable`, because for them there is no such fallback, only a broken figure later.

Three decisions worth keeping:

- **No new "fullscreen" syntax.** Native controls already carry a fullscreen button, and how large the clip sits on the slide is the chunk's width class, exactly like a still figure.
- **Video is deliberately *not* in `FOCUSABLE_SEL`.** Click-to-zoom would fight the native controls, which live in shadow DOM and cannot be distinguished from the element in a click handler.
- **A diagram `image` refuses a clip.** `dgResolveImage` searches the same extension order as the shorthand, so an id with only an `.mp4` behind it used to resolve – into an SVG `<image>` element, which cannot play video, so the figure built without complaint and rendered an empty box. The error names the working construct: `![](clip-id)` in the chunk body.
- **`MAX_INLINE_VIDEO_BYTES` is 12 MB**, separate from the 2 MB image cap, because a clip is inherently an order of magnitude heavier and the image cap would reject every real one. It is still a cap: base64 adds a third, and the bytes land in all four outputs, so 12 MB of source is already ~64 MB written to disk. `inlineCapFor()` picks the right one everywhere; `lint.js` mirrors both.

Play, pause and seek are **synced between the windows** (`type: 'video'`, addressed by `data-fig-id`, not by index, so reordering a chunk cannot mis-target it). Gated by the freeze flag like any other broadcast, so a lecturer can preview a clip on a frozen projection. `applyingRemoteVideo` suppresses the echo: applying a remote play fires a local `play` event that would otherwise bounce straight back.

### Animated infographics (`::: diagram`)

**Development state, not in any release.** It lives on `claude/network-security-figures`, which carries the diagram compiler, the editor and the figure work together; `main`, `package.json` (still 1.0.0) and the published site know nothing about it. The changelog entry stays under `## [Unreleased]` – `CONTRIBUTING.md` § Building and releasing bumps the version at release time, not during development, so there is nothing to bump here.

Note that **merging to `main` is itself a publication**: `pages.yml` fires on every push to `main` and redeploys the project site, and the tutorial – which now carries a `#diagram` chunk – is one of the lectures it rebuilds and publishes. So the tutorial chunk, not just a tag, is the thing to decide about before merging. `lectures/diagrams/` is only linted by that job, never built or published.

Before it can ship, in rough order of how much each would hurt to discover late: the vocabulary needs a pass against three or four more real lecture diagrams (it has been exercised against two); text width is estimated rather than measured, so a dense layout can be a few percent off; and `::: diagram` becomes frozen source-format the moment it is in a tagged release, so **keep it marked experimental in the release notes for one minor cycle** if it ships before the editor exists.

A boxes-and-arrows compiler. The source is a line-oriented DSL inside the lecture markdown, the output is one inline `<svg>` plus, when the author wrote steps, a payload of precomputed per-step geometries the live runtime tweens between. `renderDiagram()` is the entry point; the section is navigable by its own sub-banners between `// ── diagrams (::: diagram) ──` and `// ── parsing ──`.

**How to lay a figure out is a separate document: `figure-design.md`.** What follows is the machinery; that file is the craft, and it is what to read before authoring rather than changing the compiler.

**Five additions, and one idea holds all of them: draw the same numeric vector a different way.** That is what keeps the invariant below intact – extents, the viewBox, the dependency walk and the tween never learned that any of it exists.

- **Outline classes on `box`** – `.hex`, `.chevron`, `.wedge`, `.cross`, sharing the slot `.round` and `.sharp` already occupied, because a hexagon has no corner radius to argue about. **Which way a pointed outline aims is the `point` option** (`up` / `down` / `left` / `right`), not a class: a chevron aimed up is the same shape aimed differently, and a class per shape per direction would quadruple a list that is meant to stay closed. The direction rides on the drawable kind as `chevron:up`, so the geometry vector is still the rect's four numbers – rotating the finished points would have turned a w-by-h box into an h-by-w one and moved the footprint the layout computed. `point` on an outline with no point, or on none, is an error. Emitted as a `<path>` whose `d` comes from the same `[x,y,w,h]` a `<rect>` carries; `dgShapeD` is stringified into the runtime by build.js so one text draws the opening beat and every later one. Three things are rejected rather than ignored: an outline class on any kind but `box`, the same on a `default` for one of those kinds, and an outline inside a `style` step – the drawable kind is decided once, at emit, so a step would have nothing to switch.
- **`.turn`** – a label read bottom-to-top, for a tall narrow element that has room for a word only along its long side. The angle rides as a third number on the label's geometry vector, so it is carried and interpolated by the machinery that already moves an upright one. **Four sites position a label** – the node label, the container caption, the brace label, the edge label – and all four have to write the angle; for a while only the first did, and on the other three the class resolved, emitted its CSS and rotated nothing. `dgTurnOf()` is the one place that answers the question now. A turned label is also anchored `middle` whatever its kind would otherwise use, because `extentsOf` reserves it that way and a drawn anchor disagreeing with the reserved one puts the words half outside the frame. **`extentsOf` and `sizeOf` both swap the label's measurements**; reserving the upright box would frame the figure around something nowhere near what the browser paints, which is exactly what `test/figure-framing.mjs` exists to catch.
- **`bars`, `grid`, `plot`** – three statements that **expand at parse time** into ordinary boxes, texts and edges. Nothing downstream learns a new element kind, which is why `brace over f-0,f-1,f-2` spans three columns of a chart with no special handling anywhere. What makes it possible is that an `at` may name another element's coordinate: every column, cell and gridline is placed against a frame the same statement creates, through the ordinary topological walk. `plot` additionally registers a mapping so `roc@0.35` names a value in its own units; `dgResolvePlotCoords` turns that into a plain `roc.left+n` once the block has been read, so a point may name a plot written further down. **`cell` and `space` on a `grid` are measured in `uh` on both axes**, the same call `pad` made, because a cell has to be square. The spacing inside one of these statements is `space`, never `gap`: a placement on the same line already uses `gap` for the distance to another element, and one word for both meant a `gap` written before the placement and one written after it produced drawings five times apart, with no error either way.
- **`.smooth`** – the same waypoint vector drawn as a Catmull-Rom spline instead of straight segments. Interpolating, so the curve passes *through* every waypoint and the class never moves a line off what it was attached to. The skew warning exempts it: on a curve a nearly-flat stretch is the shape, not two ends that missed each other.
- **A vector asset is embedded once and referenced with `<use>`.** The first instance carries the `<symbol>`, so a file used once costs the wrapper and nothing more. **Only assets with neither a `<style>` block nor internal id references are shared** – a `<use>` instance is a shadow clone and `inlineSvg`'s `@scope` anchor does not reach into one, so sharing such a file would leave a drawing with no lines. Two traps cost a debugging session each: the symbol has to shed the root's `id`/`role`/`aria-label`, and `body` still carries the file's own `</svg>`, which inside a `<symbol>` closes the *diagram's* svg and drops everything after it into the `<figure>`.

`lint.js` mirrors the parsing contract for all of this, and the generated names live in `dgBarName` / `dgTickName` / `dgBaseName` / `dgCellName` / `dgPlotName`, imported by both files. That bends "tables only, never a function" – a naming scheme is a table, one indexed rather than listed, and the compiler and the linter have to agree on it exactly or every chart reports a dozen undefined references. `rejectShapeOn` and `rejectAlignOn` ride the same bend for the same reason: they *are* the rule for which class may sit on which kind, and a second spelling of it in lint.js is how the gate came to pass lines the build refuses – which matters because CI lints `lectures/network-security` and `lectures/diagrams` but never builds them, so such a line merged green and failed every later build.

Three decisions carry the design, and none of them should be traded away casually:

- **No constraint solver.** Positions are expressions over a tiny algebra – a grid cell, an anchor on another element, an offset – so the dependency structure is a DAG resolved by one topological walk. Andrew Myers' [Constrain](https://github.com/andrewcmyers/constrain) is the reference for the other approach (Numeric.js least-squares over `align`/`equal`/`collinear`, rendered to canvas) and it is the right tool for *computed* layouts – tree rotations, sorting animations. It is the wrong tool here on three counts: canvas forfeits theme inheritance, text selection, search and print; a runtime solver is a dependency inside a file that is supposed to be self-contained; and solver failure is non-local – an over-constrained system renders plausibly wrong and reports a residual instead of a line number. `lint.js` can name the line.
- **Layout runs once per step, at build time.** A step is not a transform applied to a finished picture, it is another evaluation of the same layout with different inputs. That is the whole reason an arrow stays attached to a box that walks away: the arrow never stored a coordinate, it stored "the right edge of `mix`". `dgStateAt(model, k)` builds the effective state after steps `0..k`; `layoutDiagram` resolves it; `dgFrameDrawables` reduces it to numbers.
- **The runtime interpolates numbers and nothing else.** Every element reduces to one or two drawables, and a drawable is only ever a `rect`, a `circle`, a `path` or a block of `text` carrying a numeric vector. A transition is a lerp between two vectors, applied by setting attributes from `requestAnimationFrame`. This is also why **arrowheads are computed filled paths, not SVG `<marker>`s** – a marker will not rotate with a moving endpoint, and its fill would have to resolve through `context-stroke` to follow the theme.

Consequences worth not breaking:

- **Steps ride the existing reveal counter.** `chunkBeats(el)` walks the chunk in document order and returns the reveal segments after the first, plus one beat per diagram step. `revealed[chunkId]` stays the only state involved, so sync, the freeze gate, the backward-navigation rule ("a chunk *arrived at* from elsewhere shows fully revealed"), and localStorage recovery all came for free. `countSegments` now returns *positions* (beats + 1), which is the convention `jumpTo` and `advanceReveal` were already written against. **Stepping backwards costs nothing beyond the counter**: `applyReveal` recomputes every beat's state from `revealed[id]` on each call and `dgStep` renders any step in either direction, so `retreatReveal` is `advanceReveal` with the sign flipped. Reveal was forward-only in the *key map*, never in the mechanism – see PRD §4.6 and §5 for the two key families and the one column exception. Document order also gets the interleaving right: a diagram inside segment 1 only advances once segment 1 is up.
- **Visibility runs downhill: one rule, three faces.** An edge is only as visible as its endpoints; a `container` / `brace` only as visible as its members, *and it fits the visible ones*; a `text` that grew a leader only as visible as what it points at. An arrow pointing at a box that has not appeared, an outline around nothing, or a note whose stub leads nowhere is never what the author meant, so most of a diagram needs no `show` of its own. All three resolve in `dgFrameDrawables` by writing 0 into `vis` after `record()`; the container's fit is in `layoutDiagram` and falls back to all members when none is visible, because a zero-extent box would poison the viewBox.
- **Print is the last beat, without the emphasis – not the union.** It used to be the union of every beat, and that printed a `hide`n element on top of whatever replaced it. Everything shown and never hidden is in the last beat anyway, so the two readings differ only where the author said `hide`, and there the last beat is the one that means "the finished picture". `emph` and `dim` are stripped: they are lecture-time acts, and a handout that arrives with three arrows greyed out is reporting a moment in the talk rather than the diagram. The static attributes in the emitted SVG *are* the print state, so a view with no JavaScript shows the finished picture rather than its opening beat. The same answer covers a stepped diagram inside an `::: expand`: its steps consume no beats (`chunkBeats` skips expansion bodies), so the live views show it at its last step too – where no beat can reach, the finished picture is the one to show. Print also strips every per-figure script payload (`stripDiagramPayloads`): frames, source and asset table are JSON for runtimes print does not ship, and they were 346 KB of the network-security print file.
- **Two viewBoxes, and the static one is print's.** Print wants the finished picture tight; a live view has to reserve room for every beat or an element walking in from outside is clipped for its whole journey. So the `viewBox` attribute is the print box and `data-live-viewbox` carries the union, which `initDiagrams` swaps in at boot (with `data-live-ratio` for the intrinsic height). Emitting the union statically printed a band of empty paper the height of wherever something started out.
- **Visibility and the two softening classes share one channel, so `dgOpacity()` resolves them together.** `.ghost` and `.dim` deliberately set no opacity in CSS: author CSS beats a presentation attribute, so an element pinned at 0.45 by the stylesheet could never be hidden and its `show` step did nothing. The emitter writes the resolved number as an inline style and the runtime sets `style.opacity`; both call the same function.
- **An element starts hidden only when the *first* thing a step says about it is `show`.** Treating every `show` target as initially hidden broke hide-then-show: an element meant to be on screen from the opening beat and taken away later started invisible.
- **The same word means the same thing in two statements.** `container … pad n` and `brace … pad n` are one concept – how far the outline sits from what it encloses – and the brace used to spell it `gap`, which everywhere else in the grammar is the distance between two *elements*. Likewise one coordinate grammar (`dgParsePair`) behind `at`, `move … to`, waypoints and endpoints, and one `via` keyword that is no longer optional. These are cheap to trade away one at a time and expensive in aggregate: every exception is a thing an author, an LLM and the editor each have to learn separately.
- **`default <kind>` accepts exactly the options that kind's own statement accepts** (`DG_KIND_OPTS`). `default box r 5` used to parse and then do nothing, which is the silent no-op this DSL keeps closing. The error names which kind the option belongs to.
- **`style` displaces same-slot classes, like the `default` block.** Adding `.tone-1` alongside an existing `.tone-4` left both matching at equal specificity, so stylesheet order decided the colour and the step could silently do nothing.
- **`move @tag to …` is an error, `move @tag by …` is not.** Every other step op expands a tag to its members and does the same thing to each; `to` would give them all one placement and stack the set on a point. The build says so and names `by`.
- **`align` / `spread` only work on nodes**, because they override a coordinate the node branch of the walk computes. Naming a container, brace or edge is an error rather than a line that quietly does nothing.
- **Label changes are pre-rendered variants, not text surgery.** A `label` step toggles between `<g>`s that were typeset at build time, which keeps every trace of typesetting out of the runtime.
- **A label's extent has to describe what the emitter will draw, and every place that positions one has to measure it.** These are two halves of the same rule and both were broken, which is why figures sat off-centre inside oversized frames. `extentsOf` reserved a box of `lw * 2` centred on the label's origin – a full label width on *each* side – so a figure whose outermost element was a caption reserved half that caption's width of paper beyond it; and only `labelBox` recorded a measured width at all, so container captions, brace labels and edge labels fell through to a hardcoded `[120, 28]` regardless of their text. Measured on `lectures/diagrams` before the fix: up to 122px of empty margin on one side of a 480px figure. `anchorFor` now answers the anchor question exactly the way `dgTextEl` does, and **the print pass has to be handed `printCls`** – a pass with no classes silently treats every label as centred, which under-reserves a `.right` one by half its width and clips it off the paper. `test/figure-framing.mjs` measures the slack on all four sides of every figure and is the guard: this is invisible in every other check, because the picture is still correct, it just is not centred.
- **`dgLabelAnchor()` is the one answer to which side of its origin a label sits on.** The emitter asks it to write `text-anchor`, and `extentsOf` asks it to reserve the paper – and a label reserved on the side it is not drawn on is how figures came to sit off-centre in oversized frames. It was two copies of the same question until the alignment classes made it three. A `.turn`ed label is centred whichever way it reads, so the across-words have nothing to say about it, and that exception lives in the one function too.
- **Label alignment is measured against the element's own padding, and it moves the *block*, not the line.** `.left` / `.right` place a horizontal run of text, `.top` / `.bottom` the block of lines, and both mean "as far that way as this box allows" – its inner edge, not its border. Because the origin stays the centre of the block and only that centre moves, a bottom-aligned label of three lines puts its **last** line on the inner edge rather than its first, and the recorded extent stays symmetric about the origin so nothing downstream has to know. `.left` / `.right` used to be free-`text`-only, and on a box they were a latent bug: the label was anchored at the box centre and ran out of it. `lectures/diagrams` `#justify` is the reference for all nine combinations.

  **Where one of those four words cannot act it is an error, not a no-op** (`rejectAlignOn`). Three kinds place their label by their own statement rather than through `labelBox`: a container's caption sits on its own top border, a brace's beside the spine on the side the brace was given, an edge's at the middle of the line. So none of the four applies to a container or a brace, and on an edge only `.left` / `.right` do – they reach the label through the anchor. Measured on the emitted SVG before the check existed, `.left` moved a node label and an edge label and nothing else, and `.top` moved a node label alone; the other five combinations resolved, emitted their CSS and moved nothing. `test/figure-labels.mjs` asserts both halves – the five refused and the three that still work – and the editor's two swatch rows carry exactly the kinds the compiler allows, so the panel never offers a click that can only be refused.
- **Text width is estimated, not measured.** There is no browser at build time, so `dgMeasure` uses a per-character advance table, tuned slightly generous (a box wider than its text reads as designed; narrower reads as broken). An explicit `w` that cannot hold its own label emits a `[diagram]` warning rather than overflowing in silence.
- **An element id may not shadow `Object.prototype`** (`DG_RESERVED_IDS`, a computed table, mirrored by lint.js): the live runtime keys plain objects by element id – a frame's `vis`/`cls`/`geom` straight from JSON, the target cache – so `constructor` or `__proto__` would read a prototype member where the runtime expects its own entry, and the failure surfaced at step time in the browser with nothing at build time to say why. Refused at parse instead.
- **`.hand` is the serif in italic**, because no handwriting face is bundled and adding one would cost payload in every output.
- **A vector image is spliced as a nested `<svg>`, not referenced through `<image href="data:…">`**, for the same reason `inlineSvg()` exists at all: an `<image>` lives in an isolated document context and inherits none of the page's custom properties. One trap there: the root id `inlineSvg` assigns is also the anchor of the `@scope (svg#…)` wrapper it puts around every `<style>` block, so overwriting the attribute alone silently kills the whole stylesheet – a line drawing arrives with no lines. Rename the token everywhere instead. Rasters are `data:` URIs and deliberately do not follow the theme.
- **A placement's `offset` lands before `align` / `spread` override the result, and a step's `move … by` after.** The offset is part of the placement expression, so an element written as `between a,b offset 0,1.35` and then aligned would otherwise get the offset twice – once through its own placement and once on top of the master's coordinate.
- **A label placed beside something has to be drawn away from it.** Container captions sit at the left border and brace labels beside the spine; both were anchored `middle` at first and lay half across what they belong to. `labelAnchor` carries the exception from the layout to the emitter.
- **A coordinate may be another element's coordinate.** `via iv.cx,x0.cy` costs no dependency edge, because edges are drawn after every box is placed – `dgCoordPx` just reads the finished `boxes` map. That is why the feature was cheap and why it should stay confined to edges: a *node* placed this way would need a real dependency and is already served by `right of` / `between`.
- **`align` / `spread` are dependency edges plus a coordinate override, not constraints.** The first element listed is the master; the rest take one coordinate from it inside the same topological walk. That keeps the DAG a DAG – and a genuinely circular authoring (an element distributed by `spread` that an endpoint is also placed against) comes out as `placement cycle: …` naming the line, which is the whole reason there is no solver here.
- **Tags replaced `group`.** `@tag` in the attribute tail, addressable wherever a name is. The reason is locality rather than expressiveness: adding an element to a `group` meant editing a line elsewhere in the file, which is the edit both a language model and a diff handle worst. `model.tags` is built after parsing, so a tag may be referenced before the element carrying it is declared.
- **The skew warning is the counterpart to the too-narrow-box warning.** A line 2° off an axis is almost never intent; it is two endpoints that were meant to line up. `DG_SKEW_DEG` is the threshold, and anything genuinely diagonal is far outside it. There is deliberately no warning for edges that cross or that terminate at the same point: fan-in to one anchor is common and legitimate, so that check would fire on correct diagrams.
- **Defaults resolve in four layers, most specific last:** the lecture's `default <kind>`, the lecture's `default <kind> @tag`, the block's `default <kind>`, the block's `default <kind> @tag`, then the element's own attributes. `dgDefaultLayers()` is the one place that order is written down; `withDefaults` walks it most-specific-first and drops a class whose group slot is already claimed, which is what makes `{.tone-1}` beat `default box {.tone-4}` and a tag default beat the bare kind. **Scope before selector**: a block that says `default box {.tone-4}` means it, even for an element the lecture tags `@dec`.
- **The lecture-wide layer is the `diagram-defaults` frontmatter key**, holding `default` statements in the same language (`parseDiagramDefaults`). `parseLecture` already has the frontmatter in hand where `renderDiagram` is invoked, so nothing is threaded through `buildOnce`. Two rules there differ from a block's: anything but a `default` statement in the key is an error naming the line **even when no diagram uses it**, and a `default <kind> @tag` has to be used *somewhere in the lecture* rather than in one block – which is why `dgLectureTags` accumulates while the blocks compile and `parseLecture` rules on it at the end. `lint.js` mirrors both with `collectDiagramDefaults()`, fifteen lines of indentation-scanning rather than a YAML parser.
- **`DG_CLASS_GROUPS` is what makes the `default` block behave as expected.** Classes in one group occupy one slot, and an element's own class displaces a default from that slot instead of stacking with it – stacking left both rules matching at equal specificity, so the later one in the stylesheet won and the author's explicit choice silently lost. `lint.js` mirrors the table and warns when one element carries two members of a group. **Every class belongs to a slot** – `thick`/`bare` (stroke weight) and `mono`/`serif`/`hand` (family) were the two that did not, so a `default box {.thick}` and an element's `{.bare}` used to stack, and `.mono .hand` on one element had nothing to arbitrate it.
- **`.tone-4` with `.accent` is not one slot, but it is still a mistake.** `.tone-4` fills with the accent and inverts its own label; accent ink on it is invisible. The inversion rule is written *after* the accent one so it wins, and `lint.js` warns on the pair (`DG_CLASS_CLASHES`) – the point is that the author hears about it rather than wondering where the words went.
- **A free `text` draws a ground only when it carries a fill, and it is the same drawable a box uses.** One mechanism, two defaults: a box's ground is the paper and opts out with `.clear`; a text's is nothing and opts in with a fill. `.paper` is in `DG_FILL_CLASSES` for exactly this reason – leaving it out was a hole where the class resolved, the CSS was emitted, and no rect was drawn for it to colour. Two traps, both of which cost a debugging session: the rect changes the element's **extents**, so it has to go through `put()` like any other drawable or the viewBox is computed from the bare glyph run and clips a padded label at the edge of a figure; and a `style` step can *add* a tone, so the rect is emitted in every frame of any text that ever carries one – a geometry key present in only some frames leaves the rect stranded in the others.
- **`.fit` / `.shrink` are solved after the `same as` copy, not before it.** `sizeOf` is otherwise a function of the element's own label and class, which is what lets sizes settle before the DAG walk; a fitted size needs the box, and a copied box is whatever X turned out to be. That works because `same as` is already a dependency edge. `dgFitFont` is a ratio rather than a search, because `dgMeasure` is linear in the size, and the result is clamped to 0.6–1.5×. An element with `.fit` and neither `w` nor `same as` is an **error** – there is nothing to fit into, and a silent no-op is the failure this DSL keeps closing. The emitter solves each *label variant* separately, because a `label` step swaps pre-rendered `<g>`s and each has to have been typeset at the size that makes its own string fill the box.
- **`lint.js` deliberately does not mirror the `.fit`-needs-a-width check.** Deciding it means resolving `w` through four default layers and `same as`, which is the compiler's job; the build hard-fails with the line, and a linter that guessed would be the one thing worse than no linter – stricter than the build.
- **`default` is position-independent, one per kind.** DOT's position-dependent model is more expressive and was rejected: it makes the source order-sensitive invisibly, and this codebase keeps closing exactly that class of silent failure.
- **Parallel edges are separated by the author, not by the engine.** `mix.right:0.3` slides the attachment point along an edge; two arrows between the same pair at `0.3` and `0.7` are parallel instead of a lens. Automatic fan-out was rejected because it would silently redraw diagrams that already exist.
- The four tones are `color-mix` over `--emph` and `--ink`, never fixed hues, so they stay inside whichever of the seven themes is active.

**What a graphical editor has to be able to round-trip.** Three constructs deliberately state a *relation* rather than a number, and an editor that answers a drag by replacing them with absolutes destroys the very thing they exist for. The grammar is shaped so it never has to:

- **A coordinate component carries its own signed nudge** (`x0.cy`, `mix.cx+0.2`). Dragging a waypoint rewrites exactly one token – the nudge – and the reference survives. This is why the nudge is one optional signed term with no other operators and no nesting: the token to replace is always unambiguous, and a concrete syntax tree with source spans can rewrite it in place.
- **`align` / `spread` name a set with a master.** Dragging the master should move the group; dragging a follower means either leaving the set (drop the name from the statement) or moving everyone. That is a UI decision, not a format one, but the statement form is what makes either answer a one-line edit.
- **A tag default is shared.** Resizing one element that draws its width from `default box @dec w 0.48` should write an explicit `w` on that element rather than change the default – "just this one" is the safe reading of a drag. Changing the default has to be a deliberate act on the default's own line.

`lint.js` **imports** the diagram vocabulary from `diagram-core.mjs` rather than mirroring it – twenty-one tables that used to have to change in two files in one commit. Tables only, never a function: a function would pull the whole compiler in behind it and the linter would stop being runnable without the Markdown/Shiki stack. It also **captures the diagram body verbatim, ahead of the heading matchers but behind the fence tracker**: a diagram comment starts with `#`, and read as markdown that is a column heading – while a `::: diagram` inside a code fence is a syntax example and must not be compiled. Getting that order wrong made the linter fail any lecture that documented the directive, which is the tutorial the release job publishes. Its `oversized-asset` gate and `collectImageRefs` (for `--optimize-images`) both scan diagram `image` lines too, or the pre-commit gate would let through exactly what `assertInlinable` refuses.

### The diagram editor (`editor.mjs`, `editor.css`)

**Development state, like `::: diagram` itself.** The spec, the build plan and a running build log are in `editor.md`; §15 there is the thing to read before picking the work up. What follows is only the part a change to this repo has to not break.

Ships into the live views whenever the lecture contains a diagram, gated by the `editor:` frontmatter key (`both` / `speaker` / `none`). **Measured in the built page: ~440 KB** of compiler, UI and chrome, on top of the 276 KB of fonts – the difference between building `lectures/diagrams` as it stands and building it with `editor: none`. (The plan's estimate of ~150 KB was taken at phase 3, before the UI existed, and the 295 KB re-measurement before the docking, alignment, step-pane and layout-control slices.) A lecture with no diagram pays nothing, and each figure additionally carries its own source – a couple of hundred bytes to a couple of kilobytes – plus, only in a view that ships the editor, the markup for any image it holds.

- **It edits source text, not a model.** It parses the block, records where every token sits, answers a drag by rewriting the smallest span it can, and re-runs the same compiler the build runs. There is no second representation to drift and no file the editor owns. `createSpanTable()` in `diagram-core.mjs` is the whole interface between a gesture and the source.
- **The panel reads its controls off the *statement*, not off the kind.** A `bars`, `grid` or `plot` frame is a `box` as far as the layout is concerned, so `dgeKindOpts` keyed on `el.kind` offered it `pad` – a word its statement refuses – and never offered `space`, which it takes. The frame carries `frame: <statement>` for exactly this. The same distinction closed a live trap: `spanOf(id, 'label')` returns the first quoted token, which on a `bars` line is *the values*, so the panel's label field was one keystroke from overwriting a chart's data under a name that gave no warning. A frame now has no label span and no label field.
- **A step is shown by what it *does*, not by what it says.** `dgeStepChanges` diffs the resolved state either side of the beat, because the ops are not the answer: `show @xor` is one line and three elements, an edge appears because both its ends did, a container because its members did. The result is a chip per affected element in the panel and a dashed mark on the drawing, and without it the only way to learn what a beat is for was to press Space and watch. The step pane sits **above** the empty-selection branch – it describes the beat, and "nothing selected" is exactly when that matters most.
- **Panel chips need a class per pane.** Waypoints, tags and a step's ops all render as `.dge-chip`, so a selector naming only that picks whichever pane is first in the DOM. A spec removing waypoints started deleting step ops the day a pane was added above it; `.dge-chip-via` is the fix, and the rule is the general one.
- **An option gets a control when the vocabulary is a closed word list**, not only when it is a number. `point` (which way a chevron or a wedge aims) is a swatch row like a class slot, offered only where the resolved outline actually has a point – a control that can only produce a compiler refusal is not a control. `DG_KEYED_ATTRS` is what makes a `keyword value` option addressable at all; anything positional (a `bars` values string, a `grid`'s `8x12`, a `plot`'s axis titles) is still a text edit.
- **`editor.mjs` and `editor.css` are read from disk and inlined**, like `diagram-core.mjs`. That is what makes them ordinary files: a backtick or a `\s` in them means what it says, where the same character in `AUDIENCE_JS` is a parse error or a silently broken regex. The wrapper escapes `</script`; `editor.css` goes through `assertStylesheetsWellFormed()`.
- **A gesture plans against the state it started from.** `dgeGestureBase()` captures `{source, model, boxes, spans}` at pointerdown, and the viewBox is pinned for the duration. Without either, each `pointermove` measures its delta against a mapping the previous move already changed, and the drag compounds – a 60px drag came out as `gap 8.45`.
- **Zoom is the frame's size, not a transform.** A transform does not change the layout box, so a frame wider than the canvas is clamped to the start edge by the grid instead of being centred, and the scaled figure sits off to the side. Pan stays a transform, which is exactly the thing that should not affect layout.
- **The chrome keys off `body[data-mode]`, never a theme name** – the same rule the help sheet, the TOC, the search panel and the cockpit footer follow, and it is why the editor works in all seven themes including the two phosphor modes. The canvas needs nothing: it is the compiler's own SVG, already painted in `--ink` / `--paper` / `--rule`.
- **The modal owns the keyboard.** While it is open the view's own handler is off entirely, or every tool key would also do something to the lecture underneath. Verified, not assumed: `Space` `C` `F` `A` `↓` `B` leave the active chunk, the reveal count, the theme, the font, the collapse mode and the blank state untouched.
- **Opening the editor must not disturb `revealed[chunkId]`.** It opens at the beat on screen, its own beat navigation is editor state and writes nothing back, and closing leaves the slide where it was. That counter is the single piece of state the reveal, the sync, the freeze gate and the localStorage recovery all share.
- **A structured edit that stops the block compiling is reverted, not kept.** `dgeSetSource` is the one door every panel act and every gesture commit goes through, and if the result does not parse it puts the source back and shows the compiler's sentence. Two reasons, and the second is the serious one: the panel is not a text editor, so an illegal act is an objection to read rather than damage to repair – and **`DGE.spans` is only rebuilt on a successful compile**, so a block left broken leaves the span table describing text that no longer exists. Every later edit then splices at offsets that have moved. That is how two more clicks turned an attribute tail into `{.a}.b}.c}` while the canvas never changed, because it never compiled again: the panel looked like it was doing nothing at all. `DGE.spansFor` records what the table describes, and a gesture that finds it stale says so instead of dragging against it.
- **Docking is a drag with no modifier, and that is deliberate.** Four chips appear around whatever the pointer is over during a move, and releasing on one rewrites the whole placement to `<side> of <that element>`. `Ctrl/Cmd` already suspends snapping and `Alt` leaves an align set; a third would be a lot to hold, and `Shift` means axis-constrain in every drawing tool. Releasing *on a chip* is itself the commitment, so the gesture guards itself. Two things it must keep: the host is found from the **pointer** and its geometry read from **`ctx.boxes`**, the layout as it was at pointerdown – the element is moving under the preview and the layout is re-solved on every move, so anything read live slides about while it is being aimed at. And the chip decides the *side* only: measuring a distance from where the pointer happens to be gives nearly zero every time, so the element keeps the gap it already had.
- **A control in the guide layer cannot rely on event identity across two events.** `dgeDrawGuides` replaces every child on each recompile, and a gesture ends with one – so the second click of a double-click lands on a *different node* carrying the same id. A `dblclick` listener therefore fires on the two nodes' common ancestor and finds no handle, and the browser resets `pointerdown`'s own `detail` counter for the same reason. Both look like working controls and neither fires: waypoint deletion shipped with no way at all to take one off the canvas. Position and time are what survive the repaint – see `dgeIsSecondTap`.
- **The entry point lives in the focus card and must stay outside it.** The pencil is appended to `document.body`, not to `#figure-overlay` – it is `position: fixed` either way, and putting it inside the subtree its own `MutationObserver` watches makes its insertion a mutation, which re-runs the sync, which inserts it again. That loop hangs the tab.
- **Four tiers for where an edit goes**, tried in order: the `--watch` socket (now two-way), the clipboard, File System Access where it exists, and `localStorage` for a reader whose `audience.html` is a build artefact. The watch server refuses a patch unless the nonce matches this build, the range is one a `::: diagram` block actually occupied, the bytes there still match what that block compiled from, **and** the bytes the page believes are there still match – the last check is what stops a second tab silently taking the first one's change when an edit happens to keep the block's length.
- **The watch socket binds to `127.0.0.1`.** It omitted `host` before, which for a one-way reload socket was untidy and for one that can write to the author's disk is not.
- **An edit syncs as its own message**, `diagram-edit`, following the `video` precedent rather than the state snapshot – see `speaker.md` §2 for why, and for the rest of that table. Three things keep that sync honest: an edit committed while frozen is queued and flushed on thaw (`psiEditorThaw`, called by `toggleFreeze`); a received edit is persisted the way a local one is, or reopening the editor loaded pre-edit source and the next gesture reverted the peer's work; and under `editor: speaker` the message carries the compiled figure too, because the projection ships no compiler. The DOM half of applying an edit – swapping the drawing, its frames payload, the runtime and the focus-card clone – is `dgSwapFigure` in the shared diagram runtime, one text for the editor's path and the no-editor path.
- **`frozen` and `state` are top-level `let`/`const` in a classic script**, so they are *not* properties of `window`. The editor reads the freeze state off `#freeze-btn`, which is the same fact made visible. Function declarations (`sendToPeer`, `dgRenderInto`) are global and can be called directly.

### Hosted embeds (`::: embed <url>`)

Its own directive, never the meaning of a bare link or asset, because it is the single construct that makes an output fetch from a third party at run time. `parseEmbedUrl()` recognises YouTube and Vimeo (leniently: a bare `youtu.be/ID` or `vimeo.com/ID` is fine, which is what people paste) and normalises them to `youtube-nocookie.com/embed/…?enablejsapi=1` and `player.vimeo.com/video/…?dnt=1`; any other `https://` URL is framed as-is with no sync. `lint.js` mirrors that leniency exactly – a linter stricter than the build is worse than none.

Four behaviours worth not breaking:

- **The iframe is emitted with `data-src`, not `src`.** `updateEmbedLoading()` (called from `applyState`) sets it when the chunk becomes active and removes it on the way out. That is the privacy property – a lecture contacts a provider only for slides actually shown – and it is also the only reliable way to stop a cross-origin player when you navigate away.
- **Play/pause syncs without any SDK.** Both providers speak a `postMessage` control protocol; YouTube's is the one its own IFrame API uses, unlocked by `enablejsapi=1` plus a `listening` handshake on the `widget` channel after load. Measured: `playerState` transitions and `currentTime` stream back. Gated by the freeze flag, echo-suppressed by `applyingRemoteEmbed`.
- **Nothing autoplays**, on purpose.
- **YouTube cannot work from `file://`** (origin `null`, no Referer → Error 153). `wireEmbeds()` replaces its frame with an instruction card pointing at `--serve` rather than letting the player render its own error in front of a room. Vimeo is unaffected; `EMBED_NEEDS_ORIGIN` is the table.

The original address is always emitted as a real link under the frame: it is the fallback when the player will not run, it is what survives into a printed handout (the frame is `display: none` in `@media print`), and it earns a QR code from the existing link machinery for free.

### Link addresses and their QR codes

`Shift`-click on an external link puts its address on both screens with a QR code beside it, instead of opening a page on the projector. The reasoning, and the measurements behind it, are in `speaker.md`; the short version is that ~64% of realistic link targets refuse to be framed, the refusal is undetectable from script, and a page pushed to the projector is a UI the lecturer is driving blind.

QR codes are generated **at build time** by `qrSvg()` and shipped as a `LINK_QR` map keyed by URL, so there is no encoder in the browser and a lecture without links pays nothing. Three things worth keeping:

- The encoder is a dependency (`qrcode-generator`, MIT, zero deps of its own), not hand-rolled Reed-Solomon. An error in that maths yields codes that scan to the *wrong string* and look perfectly correct. Verify changes by decoding, not by looking – `BarcodeDetector` in Chrome does it in a few lines.
- The map is keyed by the **decoded** URL (`&amp;` → `&`), because that is what `a.href` hands the runtime.
- The code keeps a white ground on every theme. Scanners cope badly with inverted codes, and the white card doubles as the quiet zone.

### Themes, dark mode, and `data-mode`

Seven themes cycle on `A`: four light accents, a neutral `dark` (grey paper, white ink, accent lifted so it carries), and the two `terminal-*` phosphor modes. `dark` is an ordinary reading theme that happens to be dark, so Shiki's syntax colours and the accent stay; the terminal modes deliberately suppress both to read as one phosphor tone.

`THEME_NAMES` and `DARK_THEME_NAMES` in build.js are the single source of truth. The runtime's `THEME_CYCLE`, the frontmatter validator (`VIEW_DEFAULT_SPEC`) and the pre-paint boot script are all interpolated from them, so adding a theme is a one-line change. `lint.js` mirrors the list, same contract as `VALID_TAGS`.

`applyFontTheme()` also sets **`body[data-mode]`** to `dark` or `light`. Chrome around the slide – help sheet, TOC, search panel, the cockpit footer and its key crib, the export modal – was written against paper and carries fixed near-white backgrounds; those overrides key off `data-mode`, not off individual theme names, so a new dark theme needs no new selectors and the terminal modes inherited the fix (they had the same problem; only the help-sheet `kbd` had ever been patched).

**Theme precedence extends the viewer-default rule with the OS**: frontmatter wins over the reader's stored preference, which wins over `prefers-color-scheme`, which wins over the built-in default. The resolution happens in `themeBootScript()`, emitted as the **first child of `<body>`** so a synchronous script settles it before the first paint – otherwise a reader on a dark system gets a white flash while the module boots. When the frontmatter pins the theme no script is emitted at all. `loadPersisted()` reads the answer back off the body attribute instead of re-deriving the precedence, so the two cannot disagree.

### Document language and hyphenation

`lang:` in the frontmatter (default `en`) lands in the `lang` attribute of `<html>` for all four views. It is not decoration: the browser picks its **hyphenation dictionary** from it, so `hyphens: auto` in the print stylesheet does nothing useful for a German lecture until the author writes `lang: de`. A value that is not a plausible BCP-47 tag fails the build.

Hyphenation is **print-only and prose-only**. A hyphenated word on a projection reads badly and the live views reflow constantly; and because the `hyphens` property inherits, headings, code, and URLs are explicitly set back to `manual`, or the build would hyphenate an identifier.

The cover treatment for `title` chunks also lives in `@media print` now. The base rule used to be a full-height block with the title pinned to the bottom edge, which is right on paper and wrong for `print.html` in a browser, where you opened a document and saw a screen of nothing.

### Viewer defaults in the frontmatter

Six optional frontmatter keys pin how a lecture opens: `font` (serif/sans/mono), `theme` (the six accent/phosphor names), `collapse` (topic-bold/none), `auto-fit` (true/false), `slide-numbers` (vertical/horizontal/off), `editor` (both/speaker/none). The last is not a look but a payload – whether the live views carry the diagram editor – and it goes through this machinery rather than growing its own because the failure mode is identical: a typo would otherwise cost the lecture its editor silently. The precedence rule is one sentence: **a key that is present wins over the reader's stored preference; a key that is absent leaves that preference alone.** So lectures that say nothing behave exactly as before – font, theme and slide numbers keep following the reader across lectures – and an author who has designed a particular look gets it without asking anyone to press keys.

An unknown value **fails the build** (`err.userFacing`, no stack trace) rather than being ignored, because a typo here is otherwise invisible: the lecture still builds and still looks fine, it just looks like the author never set anything. `lint.js` mirrors the table as `VIEW_DEFAULTS` and reports `unknown-view-default` as an error – keep the two in sync, same rule as `VALID_TAGS`.

Chunk grammar: `## tag: Heading | Sub-Heading {.width #id}` where `tag` is one of `title`, `principle`, `definition`, `example`, `question`, `figure`, `exercise`, `free`, and width is one of `narrow` (28em), `standard` (36em), `wide` (52em), `full` (72em). The `|` sub-heading and the `{...}` attribute tail are both optional; width defaults to `standard`.

Two things worth knowing before writing chunks, both learned the hard way:

- **`principle` is not a narrow tag.** The tag sets treatment and budget, never width, but the docs used to pair it with `.narrow` and every example followed – which meant anything longer than one sentence became a tall thin ribbon. Prefer `.standard` for principles. `narrow` itself went from 22em to 28em for the same reason.
- **Code lines have a width budget, and it is smaller than it looks.** A `<pre>` does not wrap, so a long line would run off the projection. `clampZoomToWidth()` stops that by shrinking *that one slide* – never the lecturer's zoom setting, which is global and comes back on the next chunk. The budget at the default zoom in a 16:9 window is roughly **50 characters** in `.standard`, **60** in `.wide` or `.full` (both are viewport-limited there, so widening past `.wide` buys nothing), and about **30** inside one pane of a `::: side`. Over budget is not an error, it is a slide rendered smaller than its neighbours – so treat a heavily clamped chunk as a signal to break the line, not as something the runtime should fix harder.
- **The live views do not print the tag name.** The small-caps eyebrow (PRINCIPLE, DEFINITION, …) was removed from `renderAudienceChunk`: it announced a taxonomy that is only as right as the tag choice was, and a mislabelled slide reads to the room as an error. `renderChunk` (the document renderer) still emits `.chunk-label`, and `.tag-label` in the audience is now only the *expansion* label. Search results read the tag off `data-tag` for this reason.

## Reference material

- `CONTRIBUTING.md` – **the build and release procedure** (§ Building and releasing): what the two workflows do, what has to be true before tagging, and why the release asset names cannot change. Follow it rather than improvising a release.
- `PRD.md` – §1 non-negotiables, §2 content model, §2.1 tag vocabulary, §3 source format + parsing contract, §4 visual language, §7 view architecture. Read this before making design-shape changes.
- `speaker.md` – speaker spec and the `window.postMessage` sync protocol (fields, direction, freeze gating, timer, localStorage recovery).
- `editor.md` – the diagram editor: what it is for, the four decisions, the grammar contract it edits against, the drag policy, and **§15, a build log written while building** – what landed, what it cost, and what bit. Read §15 first if you are picking the work up. §13 answers the two questions the plan deliberately left open, from the running prototype, and §14 is how a picture gets into a figure.
- `figure-design.md` – **how to lay out a `::: diagram` so a room reads it**, as instructions rather than principles: ten rules with a wrong/right pair each in real syntax, the tone-to-role table, the four-beat step order, and a checklist to work down before a figure is finished. Written for a person and a language model equally. Read it before authoring figures; the grammar itself is below under *Animated infographics*.
- `HANDOFF.md` – slice-by-slice build diary in German/English mix. Latest sections describe current state and deliberate non-choices. Update when landing a substantial slice.
- `README.md` – short public-facing intro.
- `lectures/tutorial/source.md` – the canonical authoring reference (self-referential lecture). Build and open its `audience.html` to see every directive live.
- `lectures/diagrams/source.md` – every `::: diagram` construct, including two of the stepped figures the feature was built for (CBC decryption, a stack frame being overrun). Its `#look` chunk is the reference for the class vocabulary: every fill, every family, and the three answers to how type meets its box. The lecture-wide `diagram-defaults` block is in its frontmatter.
- `lectures/network-security/source.md` – **thirty-six real lecture slides rebuilt as figures**, and the reason the outlines, `.turn`, `bars`, `grid`, `plot` and `.smooth` exist. Rebuilt from two PowerPoint decks with the wording kept verbatim (original typos included, each marked in a `#` comment) and the arrangement redrawn. Read it for what the vocabulary looks like at scale; `figure-design.md` is the rules it was built against. Linted by CI, never built or published, like `lectures/diagrams/`.
- `lectures/python-intro/source.md` – richest example of `::: cols`, `::: side`, and `::: marginalia` in combination, 36 chunks. It is also what the project site's screenshots come from, so a change to `#why-playwright` means re-running `docs/site/shoot.mjs`.
- `docs/comparison.md` – how psi-slides differs from Beamer, reveal.js, Quarto, Marp and friends, in both directions. Published as a page on the site.

## Conventions

- **En-dashes only.** Use `–` or `&ndash;` in all prose (docs, markdown, comments, lecture sources). Never em-dashes (`—`).
- When adding or renaming a chunk tag, change it in **both** `build.js` and `lint.js` (and document the visual treatment in `PRD.md` §2.1).
- Don't commit generated HTML outputs – they are regenerated per build and gitignored. Exception: all four of `lectures/tutorial/{audience,speaker,print,print-notes}.html` are tracked so the tour is browsable from the repo; rebuild and commit when the tutorial source changes. The release workflow fails if they are stale.
- `{#id}` attributes on chunks are **frozen once authored**. They are the anchor for cross-references, TOC entries, speaker-sync snapshots, and localStorage persistence. Don't renumber them reflexively when headings change.
- Shiki is loaded once and cached across `--watch` rebuilds; adding a new language means extending `SHIKI_LANGS` (and optionally `LANG_ALIAS`) at the top of `build.js`.
- **Math delimiters are `marked` extensions, and the inline rule must keep refusing to cross a backtick.** marked runs custom inline extensions *before* its own `codespan` tokenizer, so relaxing the content class lets a stray `$` in prose pair with one inside a following code span and swallow the delimiting backtick. This was a real regression, not a hypothetical: `a price of $5 and $10, ` + backtick-`$PATH` rendered as a formula reading `10, ` + backtick.
- **`FOCUSABLE_SEL` in `AUDIENCE_JS` must stay a single constant.** Audience and speaker each resolve `figureIdx` against their own DOM, so the two windows focus different elements the moment their selectors disagree. Adding a focusable element type means editing that one string.
- **Everything inlined lives in a template literal.** Three edit mistakes are easy and expensive there:
  - A raw backtick, **even inside a comment**, ends the literal. Throws at parse time. Never write one in `AUDIENCE_JS` / `SPEAKER_JS` / the CSS constants – name the identifier plainly instead.
  - An unterminated `/*` in a CSS block silently swallows every rule to the next `*/`. This used to ship broken, so `assertStylesheetsWellFormed()` runs on every `buildOnce` and turns it into a hard error.
  - **A regex backslash must be doubled.** `\s` inside a template literal is an escape the build resolves, so source `/\s+/g` emits `/s+/g` – a regex that matches the letter s. This ships silently and nothing catches it: it cost a search index that had every `s` stripped out of its text. Write `/\\s+/g` in `build.js`, and grep the built HTML to confirm what was emitted.
- **Verifying an inlined change: never discard stderr, and check the output first.** `node build.js … 2>&1 >/dev/null` hides a `SyntaxError` and leaves the *previous* HTML on disk, so the browser then shows a stale build that looks like a change with no effect. After touching an inlined stylesheet or script, `grep -F` the new rule or function in the built HTML before judging it in the browser.
