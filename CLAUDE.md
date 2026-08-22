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
# in source.md (shorthand `![](fig-id)` refs need no edit). Needs cwebp or
# magick on PATH; measured 12-18% of the original on real lecture assets.
node build.js <source.md> --optimize-images --dry-run   # report, write nothing
node build.js <source.md> --optimize-images              # apply (assets >= 512 KB)
node build.js <source.md> --optimize-images --all        # every referenced raster
node build.js <source.md> --optimize-images --max-width 2600   # also downscale

# diagrams need no flag either: a ::: diagram block compiles to inline SVG
# at build time, and its `step` blocks become beats on the reveal counter.
# See "Animated infographics" below and lectures/diagrams/source.md.

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

`build.js` holds the entire rendering stack: parser, three renderers, inlined audience/speaker runtime JS, inlined audience/speaker/print CSS, Shiki highlighter, image-shorthand resolver, WebSocket watch server, and the CLI. It is deliberately one file, and a large one – roughly two thirds of it is the embedded CSS and runtime JS, so the Node-side build logic is much smaller than the file size suggests. Navigate it by the `// ── section ──` banners:

- `// ── syntax highlighting ──` – Shiki singleton + per-build highlight cache.
- `// ── image shorthand resolution ──` – `![](fig-id)` → `assets/fig-id.{svg,png,jpg,jpeg,gif,webp}` (first match wins).
- `// ── math (KaTeX, rendered at build time) ──` – `$inline$` / `$$display$$`, the per-build render cache, and the conditional stylesheet. Two things here are load-bearing: the family→class map is **parsed out of `katex.min.css`**, never hard-coded, so it survives a KaTeX upgrade; and the stylesheet is emitted only for views that actually contain a formula, because the inlined woff2 faces are 254 KB for the full set. The live views additionally carry `KATEX_TOGGLE_FAMS` (sans + typewriter, ~46 KB) so the maths can follow the `F` toggle; print passes no `fontToggle` flag and pays nothing extra.
- `// ── marked renderer overrides ──` – custom `code` and `image` handlers on `marked`.
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

`lint.js` is a **zero-dep, standalone** linter. It deliberately does not import anything from `build.js`; it re-implements the parsing contract in ~350 lines and mirrors the constants (`VALID_TAGS`, `VALID_WIDTHS`, `DENSITY_BUDGET`). When you change the parser vocabulary in `build.js`, update `lint.js` in the same commit – the duplication is the price paid for keeping the linter runnable without the Markdown/Shiki stack.

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
- **`MAX_INLINE_VIDEO_BYTES` is 12 MB**, separate from the 2 MB image cap, because a clip is inherently an order of magnitude heavier and the image cap would reject every real one. It is still a cap: base64 adds a third, and the bytes land in all four outputs, so 12 MB of source is already ~64 MB written to disk. `inlineCapFor()` picks the right one everywhere; `lint.js` mirrors both.

Play, pause and seek are **synced between the windows** (`type: 'video'`, addressed by `data-fig-id`, not by index, so reordering a chunk cannot mis-target it). Gated by the freeze flag like any other broadcast, so a lecturer can preview a clip on a frozen projection. `applyingRemoteVideo` suppresses the echo: applying a remote play fires a local `play` event that would otherwise bounce straight back.

### Animated infographics (`::: diagram`)

**Experimental for one minor cycle.** The vocabulary below is small on purpose and may still change before it is frozen under the 1.0 source-format contract; say so in the release notes until it is.

A boxes-and-arrows compiler. The source is a line-oriented DSL inside the lecture markdown, the output is one inline `<svg>` plus, when the author wrote steps, a payload of precomputed per-step geometries the live runtime tweens between. `renderDiagram()` is the entry point; the section is navigable by its own sub-banners between `// ── diagrams (::: diagram) ──` and `// ── parsing ──`.

Three decisions carry the design, and none of them should be traded away casually:

- **No constraint solver.** Positions are expressions over a tiny algebra – a grid cell, an anchor on another element, an offset – so the dependency structure is a DAG resolved by one topological walk. Andrew Myers' [Constrain](https://github.com/andrewcmyers/constrain) is the reference for the other approach (Numeric.js least-squares over `align`/`equal`/`collinear`, rendered to canvas) and it is the right tool for *computed* layouts – tree rotations, sorting animations. It is the wrong tool here on three counts: canvas forfeits theme inheritance, text selection, search and print; a runtime solver is a dependency inside a file that is supposed to be self-contained; and solver failure is non-local – an over-constrained system renders plausibly wrong and reports a residual instead of a line number. `lint.js` can name the line.
- **Layout runs once per step, at build time.** A step is not a transform applied to a finished picture, it is another evaluation of the same layout with different inputs. That is the whole reason an arrow stays attached to a box that walks away: the arrow never stored a coordinate, it stored "the right edge of `mix`". `dgStateAt(model, k)` builds the effective state after steps `0..k`; `layoutDiagram` resolves it; `dgFrameDrawables` reduces it to numbers.
- **The runtime interpolates numbers and nothing else.** Every element reduces to one or two drawables, and a drawable is only ever a `rect`, a `circle`, a `path` or a block of `text` carrying a numeric vector. A transition is a lerp between two vectors, applied by setting attributes from `requestAnimationFrame`. This is also why **arrowheads are computed filled paths, not SVG `<marker>`s** – a marker will not rotate with a moving endpoint, and its fill would have to resolve through `context-stroke` to follow the theme.

Consequences worth not breaking:

- **Steps ride the existing reveal counter.** `chunkBeats(el)` walks the chunk in document order and returns the reveal segments after the first, plus one beat per diagram step. `revealed[chunkId]` stays the only state involved, so sync, the freeze gate, the backward-navigation rule ("a revisited chunk shows fully revealed"), and localStorage recovery all came for free. `countSegments` now returns *positions* (beats + 1), which is the convention `jumpTo` and `advanceReveal` were already written against. Document order also gets the interleaving right: a diagram inside segment 1 only advances once segment 1 is up.
- **An edge is only as visible as its endpoints.** An arrow pointing at a box that has not appeared yet is never what the author meant, so most edges need no `show` of their own – revealing the boxes reveals the arrows between them.
- **Print is the union, at the last position, without the emphasis.** Every element the diagram ever shows appears in the handout, drawn where it last stood – the same rule reveal segments follow (PRD §4.6). `emph` and `dim` are stripped: they are lecture-time acts, and a handout that arrives with three arrows greyed out is reporting a moment in the talk rather than the diagram. The static attributes in the emitted SVG *are* the print state, so a view with no JavaScript shows the finished picture rather than its opening beat.
- **Label changes are pre-rendered variants, not text surgery.** A `label` step toggles between `<g>`s that were typeset at build time, which keeps every trace of typesetting out of the runtime.
- **Text width is estimated, not measured.** There is no browser at build time, so `dgMeasure` uses a per-character advance table, tuned slightly generous (a box wider than its text reads as designed; narrower reads as broken). An explicit `w` that cannot hold its own label emits a `[diagram]` warning rather than overflowing in silence.
- **`.hand` is the serif in italic**, because no handwriting face is bundled and adding one would cost payload in every output.
- The four tones are `color-mix` over `--emph` and `--ink`, never fixed hues, so they stay inside whichever of the seven themes is active.

`lint.js` mirrors `DG_KEYWORDS`, `DG_STEP_OPS` and `DG_CLASSES`, same contract as `VALID_TAGS` – change them in one commit. It also **captures the diagram body verbatim, ahead of the fence and heading matchers**: a diagram comment starts with `#`, and read as markdown that is a column heading. The build does the same, and the two must agree about where the chunks are.

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

Five optional frontmatter keys pin how a lecture opens: `font` (serif/sans/mono), `theme` (the six accent/phosphor names), `collapse` (topic-bold/none), `auto-fit` (true/false), `slide-numbers` (vertical/horizontal/off). The precedence rule is one sentence: **a key that is present wins over the reader's stored preference; a key that is absent leaves that preference alone.** So lectures that say nothing behave exactly as before – font, theme and slide numbers keep following the reader across lectures – and an author who has designed a particular look gets it without asking anyone to press keys.

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
- `HANDOFF.md` – slice-by-slice build diary in German/English mix. Latest sections describe current state and deliberate non-choices. Update when landing a substantial slice.
- `README.md` – short public-facing intro.
- `lectures/tutorial/source.md` – the canonical authoring reference (self-referential lecture). Build and open its `audience.html` to see every directive live.
- `lectures/diagrams/source.md` – every `::: diagram` construct, including two of the stepped figures the feature was built for (CBC decryption, a stack frame being overrun).
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
