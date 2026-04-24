# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

psi-slides is a **lecture medium**: one Markdown `source.md` per lecture produces three static HTML views – `print.html` (document), `audience.html` (live projection), `speaker.html` (cockpit). All three are self-contained, `file://`-openable, no runtime server required.

Status: Phase 1, single-user dev. The `lectures/` folder holds the canonical examples of what the tool currently supports; the design rationale is in `PRD.md`. A separate content repo `../psi-slides-mylectures/` consumes this engine via `node ../psi-slides/build.js` and holds the lectures actively being authored.

## Commands

```bash
# install deps (required once, also before running lectures from sibling content repos)
npm install

# build all three views next to source.md
node build.js lectures/tutorial/source.md

# live-reload authoring (WebSocket reload to open tabs on every save)
node build.js lectures/tutorial/source.md --watch

# partial builds (useful for iterating on one renderer)
node build.js <source.md> --audience-only
node build.js <source.md> --print-only
node build.js <source.md> --speaker-only

# image inlining – default is auto: build inlines image assets as data: URIs
# iff the referenced images sum to < 10 MB; logs the decision either way.
# Override the default with these flags (per-image cap is always 2 MB):
node build.js <source.md> --inline-images       # force inline regardless of total size
node build.js <source.md> --no-inline-images    # force external asset paths

# scaffold a new lecture folder with valid frontmatter + example chunks
node build.js --new my-slug

# integrate exported live annotations back into source.md – paste the
# speaker's Shift-E snippet (marker-wrapped) at the end of source.md, then:
node build.js <source.md> --integrate-annotations
# moves each `> annot:` block under the matching chunk, removes the marker;
# unresolved ids are parked in a trimmed marker block at EOF.

# static checks – run before committing
node lint.js lectures/                         # all lectures
node lint.js lectures/tutorial/source.md       # single file
node lint.js lectures/ --strict                # warnings → exit 2
```

A source file can silence specific lint warnings with an HTML comment anywhere in the body:

```
<!-- linter: ignore reveal-overuse, density -->
```

## Architecture

### Single-file build pipeline

`build.js` (~3,800 lines) holds the entire rendering stack: parser, three renderers, inlined audience/speaker runtime JS, inlined audience/speaker/print CSS, Shiki highlighter, image-shorthand resolver, WebSocket watch server, and the CLI. It is deliberately one file; navigate it by the `// ── section ──` banners:

- `// ── syntax highlighting ──` – Shiki singleton + per-build highlight cache.
- `// ── image shorthand resolution ──` – `![](fig-id)` → `assets/fig-id.{svg,png,jpg,jpeg,gif,webp}` (first match wins).
- `// ── marked renderer overrides ──` – custom `code` and `image` handlers on `marked`.
- `// ── parsing ──` – `parseLecture()` and helpers (`parseTagPrefix`, `splitHeading`, `parseAttributeTail`).
- `// ── rendering ──` + `// ── print CSS ──` – print (document) renderer.
- `// ── audience rendering ──`, `// ── audience CSS ──`, `// ── audience runtime JS ──` – audience view, inlined as template strings.
- `// ── window.postMessage sync ──` – the shared audience↔speaker protocol (see `speaker.md`).
- `// ── figure focus / marginalia pan ──` – click-to-focus for figures, code blocks, and marginalia.
- `// ── speaker rendering ──`, `// ── speaker CSS ──`, `// ── speaker-specific runtime ──` – speaker cockpit, layered on top of audience.
- `// ── CLI ──` – `buildOnce`, `runWatch`, `runNew`, `main`.

### Parser

`parseLecture(src)` is **line-based, not AST-based**. It walks the source tracking fence state, a `layoutStack` of open `:::` directives, a `currentExpansion` slot, and `pendingNotes`, emitting a `{frontmatter, columns: [{chunks: [...]}]}` structure. `marked` is only invoked later on each chunk's *body string* – by the time `marked` runs, reveal segments have already been split on standalone `---` lines (fence-aware). Attribute-tail syntax `{.width #id}` and the `tag: Heading | Sub {...}` prefix are parsed by hand, not by `marked`.

Design implications:

- A line that is exactly `---` inside a chunk body but **outside a code fence** is a reveal-segment separator, not a thematic break. `***` is available if an author needs a true horizontal rule.
- `::: expand <label>` and `::: margin` / `::: marginalia` become separate nodes attached to the chunk; `::: cols N`, `::: side` / `::: flip` are layout wrappers that stay inline in the body as `<div>`/`<aside>` elements and let `marked`'s html-block passthrough render the inner Markdown.
- Speaker notes are blockquotes whose first line matches `note:` exactly; they attach to the current chunk (or to the next one if they precede the first chunk).

### lint.js is independent

`lint.js` is a **zero-dep, standalone** linter. It deliberately does not import anything from `build.js`; it re-implements the parsing contract in ~350 lines and mirrors the constants (`VALID_TAGS`, `VALID_WIDTHS`, `DENSITY_BUDGET`). When you change the parser vocabulary in `build.js`, update `lint.js` in the same commit – the duplication is the price paid for keeping the linter runnable without the Markdown/Shiki stack.

Checks enforced:

- Unknown tag, unknown width class.
- Duplicate or missing chunk IDs (required on every non-title chunk).
- Unclosed `:::` directives and orphan `:::` closers.
- Per-tag word-count budgets (principle/question 80, definition 200, example 250, free 250, exercise 350; title/figure unlimited).
- Reveal-overuse (>50% of chunks using segments in a lecture flags a warning).
- Orphan columns (columns with <2 chunks).
- Figure caption redundancy (`figure:` chunk opens with an image whose alt text becomes a `<figcaption>` stacked under the heading – discourages three-label pile-ups of heading + sub-heading + caption).

### Three views, one source

The three HTML files are **self-contained outputs**. They ship with their runtime JS/CSS inlined from build.js template literals, so they open from `file://` without a server. They are gitignored (`lectures/*/print.html`, `lectures/*/audience.html`, `lectures/*/speaker.html`) – rebuild instead of committing them.

The audience↔speaker sync is cross-`file://`-origin safe because it uses `window.postMessage` over the opener relationship. Chrome's per-file opaque-origin policy isolates `BroadcastChannel` between tabs loaded from disk, which is why postMessage is the load-bearing channel. See `speaker.md` §2 for the full state-ownership matrix (audience is state root; speaker holds a local shadow plus a `pushEnabled` flag).

### Asset inlining

Image assets are inlined into the single-file outputs by default (auto-inline budget: 10 MB total, per-file cap 2 MB; `--inline-images` / `--no-inline-images` overrides). Raster formats become base64 `data:` URIs in `<img>` tags. **SVG assets are spliced inline as `<svg>` elements** (not `data:` URIs) so they inherit page CSS custom properties – `--ink`, `--paper`, `--ink-soft` – and re-color when the user cycles themes with the `A` hotkey. To keep multiple inlined SVGs from cross-contaminating each other, the inliner gives every instance a unique `psi-fig-N-` prefix and rewrites `id="…"`, `url(#…)`, `href="#…"`, and `xlink:href="#…"` accordingly; inline `<style>` blocks are wrapped in `@scope (svg#psi-fig-N-root) { … }` (with `@import` and `@font-face` hoisted out so they remain at top level). See `inlineSvg()` in `build.js`.

### Authoring contract

Every chunk must open with a **topic sentence that stands on its own**, because in the live audience view the `topic-bold` collapse mode renders only that sentence plus any `**bold**` fragments. Authors promote bullet-worthy phrases to bold; unbolded continuation prose renders only in print. This shapes both the render logic (the `splitSentencesIn` walker and collapse CSS) and the lint budgets (narrow tags have small budgets because the topic sentence is the payload).

Chunk grammar: `## tag: Heading | Sub-Heading {.width #id}` where `tag` is one of `title`, `principle`, `definition`, `example`, `question`, `figure`, `exercise`, `free`, and width is one of `narrow`, `standard`, `wide`, `full`. The `|` sub-heading and the `{...}` attribute tail are both optional.

## Reference material

- `PRD.md` – §1 non-negotiables, §2 content model, §2.1 tag vocabulary, §3 source format + parsing contract, §4 visual language, §7 view architecture. Read this before making design-shape changes.
- `speaker.md` – speaker spec and the `window.postMessage` sync protocol (fields, direction, push gating, timer, localStorage recovery).
- `HANDOFF.md` – slice-by-slice build diary in German/English mix. Latest sections describe current state and deliberate non-choices. Update when landing a substantial slice.
- `README.md` – short public-facing intro.
- `lectures/tutorial/source.md` – the canonical authoring reference (self-referential lecture). Build and open its `audience.html` to see every directive live.
- `lectures/python-intro/source.md` – richest example of `::: cols`, `::: side`, and `::: marginalia` in combination, 36 chunks.
- `lectures/demo/` – minimal reference lecture.
- `phase0/` – the pre-Phase-1 single-file HTML prototype (`lecture.html` with embedded `LECTURE` object). Historical; don't use as a template, but instructive for seeing what Phase 1 replaced.

## Conventions

- **En-dashes only.** Use `–` or `&ndash;` in all prose (docs, markdown, comments, lecture sources). Never em-dashes (`—`).
- When adding or renaming a chunk tag, change it in **both** `build.js` and `lint.js` (and document the visual treatment in `PRD.md` §2.1).
- Don't commit generated HTML outputs – they are regenerated per build and gitignored.
- `{#id}` attributes on chunks are **frozen once authored**. They are the anchor for cross-references, TOC entries, speaker-sync snapshots, and localStorage persistence. Don't renumber them reflexively when headings change.
- Shiki is loaded once and cached across `--watch` rebuilds; adding a new language means extending `SHIKI_LANGS` (and optionally `LANG_ALIAS`) at the top of `build.js`.
