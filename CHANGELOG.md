# Changelog

Notable changes per release. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow [semantic versioning](https://semver.org/). From 1.0.0 the
**source format is the interface**: a change that stops an existing `source.md`
from building the same way is a major version.

## [Unreleased]

### Added

- **`::: diagram` – animated infographics written in the lecture source.**
  A line-oriented DSL for boxes, dots, free text, arrows, auto-fitting
  containers, groups and braces, compiled to inline SVG at build time and
  themed through the page's own custom properties, so a diagram re-inks
  with the `A` cycle. `step` blocks show, hide, move, emphasise, restyle
  and relabel elements; **layout is re-evaluated per step rather than
  transformed**, so an arrow between two boxes re-routes when either one
  moves – the thing no export from a drawing tool can do. Steps become
  beats on the existing reveal counter, so `Space` advances them, the
  speaker window follows, the freeze gate applies, and a revisited chunk
  comes back fully stepped, all without new state. Free `text` can grow a
  leader line to whatever it comments on (`-> ref`), which is what makes
  placement free without losing the connection. Print shows the union of
  every step at its last position, minus the live-only emphasis. There is
  deliberately **no automatic layout and no constraint solver**: placement
  is a grid cell or a relation to a neighbour, resolved as a DAG, so a
  mistake names its line instead of shifting the picture. `lint.js`
  mirrors the vocabulary and reports unknown statements, unknown classes,
  duplicate names and dangling references.

  `align x|y <edge> a,b,c` lines up one coordinate (Figma's edge words,
  with the axis stated: left/center/right on x, top/middle/bottom on y) and `spread x|y a,…,z`
  gives equal spacing between centres. Both are an extra dependency plus a
  coordinate override in the same topological walk – no solver, no second
  pass – and both name the line on a circular authoring instead of drawing
  a plausible wrong answer. They close the commonest alignment failure:
  two columns built as separate `below` chains drift apart as soon as
  their captions differ in height. The build now also warns when an edge
  runs within a few degrees of an axis without being on it, which is what
  that drift looks like once a line is drawn across it.

  Tags (`@tag` in the attribute tail) replace the `group` statement.
  Membership sits on the element's own line, so adding an element to a set
  is a local edit and one element can belong to several sets. An edge
  endpoint may be a bare coordinate (`edge -0.8,0 -> a`) for an arrow
  arriving from outside the picture.

  `default <kind> {classes} [w n] [h n]` sets the base styling and size
  for every element of that kind – two lines replaced twelve repetitions
  in the identity-lifecycle example. It is position-independent with one
  per kind (DOT's position-dependent model makes the source
  order-sensitive invisibly), and an element's own class **displaces** a
  default in the same slot rather than stacking with it. `same as
  <element>` copies another element's width and height.

  `image <name> <asset>` puts a picture in a diagram, resolved like the
  `![](fig-id)` shorthand. A vector asset is spliced as a nested `<svg>`
  and follows the `A` theme cycle; a raster is a `data:` URI and keeps
  its own colours – the honest trade rather than a broken promise.
  `between A,B [frac n]` positions an element on the line joining two
  others, and any placement takes a trailing `offset dx,dy`. An anchor
  takes a fraction (`mix.right:0.3`) that slides the attachment point
  along that edge, which is what stops two arrows between the same pair
  of boxes from collapsing into a lens; there is deliberately no
  automatic fan-out, because it would silently redraw existing diagrams.

  Inside a label, `_sub` / `^sup` shift a run and `*accent*` / `~muted~`
  colour one. Free `text` honours `.left` / `.right`, and its anchor
  moves with them. A diagram is click-to-zoom like any other figure, and
  keeps stepping while focused. How large it lands is the chunk's width
  class; `unit` sets only the proportions inside the picture.

  Fixed before it ever shipped, from a review of the branch: a `label`
  step never switched variants live (the runtime looked labels up by the
  element id rather than the geometry key), a `.ghost` element could
  never be hidden (author CSS beat the presentation attribute the runtime
  set), hide-then-show started an element invisible, an unclosed
  `::: diagram` silently swallowed the rest of the file, `align` and
  `spread` accepted containers and edges and did nothing with them, a
  `move` on a brace was a no-op, `--optimize-images` and the linter's
  oversized-asset gate could not see diagram assets that the build now
  hard-fails on, WebP and GIF images were laid out square, a diagram
  inside a collapsed expansion contributed reveal beats that changed
  nothing on the projection, a container's caption hung outside its own
  border, a long label could draw outside the viewBox, `label @tag` was a
  silent no-op, and one mistake was reported once per step.

  A coordinate may be another element's coordinate with an optional signed
  nudge – `via iv.cx,x0.cy`, `edge a.left-0.8,a.cy -> a`. Rebuilding the
  example slides had needed a browser open and three numbers read off the
  screen; all three are now relations that survive a change above them
  (verified: moving a row down by 48px moves the waypoint corner by
  exactly 48px and the leg stays vertical). The nudge's shape is a promise
  to the future editor: one signed term, no other operators, so a drag
  rewrites one token instead of replacing the reference with an absolute.

  `default <kind> @tag` refines a kind default for the elements carrying a
  tag, resolving in three layers – kind, then tag, then the element's own
  attributes.

  Rebuilding all six example slides from scratch found three more: a
  placement's `offset` was applied after `align` overrode the result, so
  an element that used both got the offset twice; a brace label was
  anchored middle and lay half across the elements it spans; and the
  `::: side` composition of a code fence beside a diagram works, which is
  what carries the buffer-overflow slide.

  Development state: this is unreleased work on a branch, and the
  vocabulary is **experimental** – it may still change before it is
  frozen under the source-format contract, so it should carry that label
  in the notes of whichever release first includes it.

  See `PRD.md` §4.6a for the grammar and `lectures/diagrams/source.md` for
  a worked example of every construct.

### Fixed

- Sentence extraction no longer ends the topic sentence at an abbreviation
  dot. „(Kleinberg u. a. 2017)“ used to cut the collapsed head short after
  „u.“; a single letter or digit before the dot, a small German/English
  abbreviation list (bzw., vgl., Dr., al., …), and a lowercase continuation
  after the dot now all keep the sentence open. `!` and `?` are unaffected.
  Trade-off: a sentence genuinely ending in a single character ("… um
  Faktor 3.") now keeps its continuation in the head – a too-long topic
  sentence rather than a truncated one.

## [1.0.0]

First public release. psi-slides has carried a full semester of university
teaching; everything below is in use rather than aspirational.

### The medium

- One Markdown `source.md` per lecture builds **four self-contained HTML views**:
  `audience.html` (the projection), `speaker.html` (the presenter cockpit),
  `print.html` (a reading document with cover and table of contents), and
  `print-notes.html` (the same document with `> note:` blocks folded in).
- Everything is inlined: CSS, JavaScript, images, Shiki-highlighted code,
  KaTeX-rendered maths, and the typefaces. Three families ship with the tool
  and are embedded in every output (Literata, Inter Tight, JetBrains Mono, all
  SIL OFL 1.1); an author's own fonts win per role, and `fonts: none` turns
  the bundle off. Nothing is fetched at run time; the files open from
  `file://`.
- **Collapse**: the same prose is rendered at two densities. The projection
  shows the topic sentence plus promoted `**bold**` fragments; the document
  shows all of it. `::: slide` and `::: script` are the escape hatch when no
  first-sentence rule can carve the argument up sensibly.

### Authoring

- Chunk grammar `## tag: Heading | Sub-heading {.width #id}` with eight tags
  and four widths.
- Body directives: reveal segments (`---`), `::: expand`, `::: margin`,
  `::: marginalia`, `::: cols`, `::: side` / `::: flip`, `::: slide`,
  `::: script`, `::: embed`.
- `![](fig-id)` resolves against `assets/`; SVG is spliced inline so it
  re-colours with the theme.
- Maths as `$inline$` and `$$display$$`, rendered at build time. Only the
  font families a lecture's formulas actually use are embedded.
- Video: a clip is a figure that moves. Inlined under a per-file cap, staged
  into `videos/` above it, or played from a URL.
- Hosted players via `::: embed <url>` for YouTube and Vimeo, loaded only
  while their chunk is on screen.
- Frontmatter can pin how a lecture opens: `font`, `theme`, `collapse`,
  `auto-fit`, `slide-numbers`, `lang`, and a `fonts:` block.

### Presenting

- Audience and speaker windows sync over `window.postMessage`, which works
  across `file://` origins where `BroadcastChannel` does not.
- Cockpit: column scrubber, stage mirror, editable notes, preview strip,
  timer, laser pointer, and a preview of the segment you are about to reveal.
- `V` freezes the projection so the room holds its slide while you read
  ahead; thawing catches it up. `B` blanks the projection only.
- Overview board, full-text search from anywhere, table of contents,
  per-collapse-mode zoom and auto-fit.
- Live annotations typed during a talk, exportable back into `source.md`.

### Tooling

- `lint.js`, zero-dependency, enforcing the parsing contract and per-tag word
  budgets.
- `--watch` for live reload, `--serve` for a loopback HTTP server,
  `--optimize-images`, `--integrate-annotations`, `--new`.
- A skill at `.claude/skills/psi-slides-authoring/` for writing lectures with
  an LLM assistant.
- A project site built from the same repository
  ([uba-psi.github.io/psi-slides](https://uba-psi.github.io/psi-slides/)),
  publishing three lectures in all four views so the tool can be tried before
  anything is installed.

### Known limits

Read [When *not* to use this](README.md#when-not-to-use-this) and
[the comparison](docs/comparison.md) before committing a semester to it.
There is no test suite, one author, and the format is still moving.

[Unreleased]: https://github.com/UBA-PSI/psi-slides/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/UBA-PSI/psi-slides/releases/tag/v1.0.0
