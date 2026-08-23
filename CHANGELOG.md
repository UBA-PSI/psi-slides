# Changelog

Notable changes per release. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow [semantic versioning](https://semver.org/). From 1.0.0 the
**source format is the interface**: a change that stops an existing `source.md`
from building the same way is a major version.

## [Unreleased]

### Added

- **`::: diagram` draws four more outlines.** `.hex`, `.chevron`, `.wedge`
  and `.cross` join `.round` and `.sharp` in one slot – a protocol message
  that is an arrow, an IDS sensor that is a hexagon, a size comparison that is
  a triangle, a scatter marker. `point up|down|left|right` aims the ones that
  have a point, so eight orientations cost one option rather than eight class
  names. They cost nothing: a shape is the same four
  numbers a rectangle carries, joined into a different path, so the frame, the
  viewBox and the tween are untouched. An outline class on any other kind, or
  inside a `style` step, is an error rather than a silent no-op.
- **`.turn` reads a label bottom-to-top.** For a tall narrow element that has
  room for a word only along its long side: a firewall bar, a confusion-matrix
  row, an axis title.
- **`bars`, `grid` and `plot`.** A column chart, a rectangular field of
  markers, and a cartesian frame with gridlines, ticks and axis titles. All
  three expand into ordinary elements, so a `brace` spans three columns of a
  chart and a `style` step tints one cell of a grid with no new vocabulary,
  and a step naming the statement reaches everything it produced. Inside a
  `plot`, `roc@0.35` names a value in the plot's own units. The spacing
  inside one of these statements is `space`; `gap` keeps the one meaning it
  has everywhere else, the distance between two elements.
- **`.smooth` draws an edge as a curve through its waypoints**, for the
  figures where a line is a measurement rather than a connection.
- **`figure-design.md`** – how to lay a figure out so a room reads it: ten
  rules with a wrong/right pair each, the tone-to-role table, the four-beat
  step order, and a checklist to work down before a figure is finished.

### Changed

- **Navigation follows one forward key and one backward key.** `Space`, `↓`,
  `Enter` and `PageDown` advance the reveal or diagram step on the slide and,
  when there is none left, move to the next chunk – across column boundaries,
  so a whole lecture is one key. `↑`, `PageUp` and `Backspace` are the exact
  mirror: **they take a reveal back**, and only leave the chunk once it is at
  its opening state. `→` / `←` are that same pair *except on the first chunk
  of a column*, where they change column – the only chunk where a second
  dimension exists to move in.

  Reveal used to be forward-only, on the reasoning that a revisited slide
  should simply show everything. That is still what happens when you arrive
  at a chunk from somewhere else, but it is the wrong answer while you are
  standing on the slide: a figure that assembles itself is often worth
  assembling twice, and there was no way to run it again without leaving and
  coming back. The mechanism was always symmetric; only the keys were not.

  Presenter remotes work now – `PageUp`/`PageDown` were unbound, so a
  clicker's back button did nothing at all.

  Two marks at the edge of the viewport say which situation the current slide
  is in: `‹ ›` where sideways changes column, `⌄` where forward will leave the
  column next. Quiet enough for a projection, absent on the overview board and
  behind a blanked screen.

  `Enter` used to open the first expansion; it is a forward key now, and
  `1`–`9` (or clicking the chevron) still opens expansions.

- **Figures sit square in their own frame.** A diagram's `viewBox` is built
  from what the compiler reserves for each drawable, and two things made it
  much larger than the drawing: a label reserved a full label-width on *each*
  side of its origin, and container captions, brace labels and edge labels
  never recorded a width at all, falling back to a hardcoded 120 whatever
  their text said. A figure whose outermost element was a caption therefore
  sat off to one side of an oversized box with an unexplained empty margin
  beside it – up to 122px on a figure 480px wide. Eight of the twelve figures
  in `lectures/diagrams` now land exactly on the margin on both sides; what is
  left is the deliberate generosity of the text-width estimate, which is about
  11% on the bundled faces and never clips.

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
  placement free without losing the connection. Print shows the last beat,
  minus the live-only emphasis. There is
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

  The same statements can be written **once for the whole lecture** in a
  `diagram-defaults` frontmatter key, so a series of figures looks like
  itself without repeating four lines in every block – and changing the
  look is one edit instead of twelve. Four layers now, most specific last:
  the lecture's kind default, the lecture's tag default, the block's kind
  default, the block's tag default, then the element's own attributes.
  Scope before selector, because "closer to the element wins" is the model
  everywhere else here. Anything but a `default` statement in the key is
  an error naming the line even when no diagram uses it, and a
  lecture-level `default <kind> @tag` has to be used somewhere in the
  lecture – one scope wider than a block's, since it is written once for
  twelve figures most of which will not carry the tag.

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

  Four more classes close the gaps the vocabulary could not spell.
  `.clear` is a see-through interior – `.bare` removes the *stroke*, so a
  frame you can read through had no spelling at all. `.serif` is the
  upright serif; `.hand` is the same family forced italic and accented,
  and until now the family was reachable only through that annotation
  voice. `.fit` and `.shrink` size the type to the box instead of the box
  to the type, clamped to 0.6–1.5× so a long label cannot become
  unreadable and a short one cannot become a poster; both need the box to
  be given (`w n` or `same as X`), and an element with neither is an error
  rather than a line that does nothing. A free `text` now draws a ground
  when it carries a tone, which is the same drawable a box uses read the
  other way round, and `pad` works on a box and a text as well as on a
  container and a brace – one word, one sentence, four statements. Every
  class now belongs to a slot: `.thick`/`.bare` and `.mono`/`.serif`/`.hand`
  used to stack with a `default` instead of displacing it. `.tone-4` with
  `.accent` is accent ink on an accent fill; the inversion wins and
  `lint.js` warns on the pair.

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

  A second review pass, with every doc snippet compiled and every example
  slide re-shot, tightened the grammar where it had grown two ways of
  saying one thing. `brace` measures its distance to its members with
  `pad`, the word `container` already used – `gap` everywhere else in the
  grammar is the distance between two *elements*. One coordinate grammar
  now sits behind `at X,Y`, `move … to X,Y`, waypoints and endpoints
  alike, so `box m at c1.cx,m0.cy` places a box in a column without
  measuring it, and a reference there is a real dependency the cycle
  detector sees. `via` is no longer optional in front of a waypoint, and
  one `via` carries every one of them. `default <kind>` accepts exactly
  the options that kind's own statement accepts, so `default box r 5` is
  an error naming the kind it belongs to instead of a line that parses and
  does nothing, and `default container pad` / `default brace pad …
  <side>` now reach the elements they are about. An element name is
  restricted to letters, digits, `_` and `-`, because a name with a dot in
  it is indistinguishable from a coordinate.

  Visibility became one rule with three faces: an edge is only as visible
  as its endpoints, a `container` or `brace` only as visible as its
  members (and it fits the ones on screen), and a `text` with a leader
  only as visible as what it points at. Print became **the last beat**
  rather than the union of every beat – reprinting a `hide`n element laid
  a withdrawn arrow across whatever replaced it – and the emitted SVG now
  carries the tight print viewBox statically, with the runtime widening it
  to hold every beat on boot, so a stepped handout no longer prints a band
  of empty paper the height of wherever something started out. A class
  added by `style` displaces the one in its slot, the same rule `default`
  follows. `move @tag to …` is refused, naming `move @tag by dx,dy`: `to`
  would stack the whole set on one point.

  **Placing a picture from inside the editor.** The image tool took the
  first asset the lecture happened to reference, with no chooser, and
  refused outright when there was none, so a figure could not get its
  first picture from the editor at all. It now opens a picker over three
  sources: the assets this lecture already inlines, everything in
  `assets/` (asked from the watch server, so it costs no payload), and a
  file from the machine. Under `--watch` the whole loop closes: the bytes
  go over the socket that already carries patches, the server writes
  `assets/<name>` with five refusals rather than five sanitisations, and
  *then* the `image` line is placed – that order matters, because
  `fs.watch` is on `source.md` and the patch is what kicks the build.
  Without a watch server it writes an explicit `assets/<file>` path, which
  the grammar already accepts, and says where to copy the file. Never a
  `data:` URI in `source.md`. The primitive is a plain file input, not the
  File System Access API: for *reading* a picked file that has always been
  enough, in every browser and from `file://`.

  `.paper` is a 29th class, invented while building that picker. The fill
  swatch row opened with the *empty* class labelled "paper", so it meant
  "whatever a default says" – a box under `default box {.tone-3}` had no
  way back to the canvas colour, and a free `text` could not have a ground
  at all, which is the whole reason to give a label one: it is what knocks
  out a line running behind it.

  `lint.js` was stricter than the build, which for the pre-commit gate is
  worse than not linting: its `between` scan did not terminate on `pad`,
  `gap`, `align` or `same`, so a placement with any of them read their
  values as members.

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

- **A graphical editor for `::: diagram`.** Click a diagram to focus it, then
  the button in the corner or `E`. It parses the block, records where every
  token sits, answers a drag by rewriting the smallest span it can, and
  re-runs the same compiler the build runs – so there is no second
  representation to drift, no export step that flattens relations into
  numbers, and no file the editor owns. Everything it produces is a block a
  human could have typed.

  The canvas is a **frame**, not a canvas size: the chunk's own width class
  on a slide, one pane of a `::: side` at that class, or the print measure
  where the height cap does not apply. Switching between them changes nothing
  in the source. It says out loud two things that are otherwise invisible
  until you look at the built page – the measure the figure lands in, and how
  much of it stays empty when the 62vh cap binds first.

  Because a figure here is held together by *relations* rather than
  coordinates, and that structure is completely invisible in the picture, the
  editor draws it: the `gap` between two facing edges with its number, the
  alignment edge as a hairline through both elements, `between` as the line
  joining its references, a ref coordinate as the line it refers to, an
  `align` set's shared axis through every member, a `spread` set's equal
  distances as matched marks, `same as` as a width bracket. A drag then
  rewrites exactly one token – the `gap`, the `frac`, the signed nudge – and
  a coordinate that belongs to an `align` or `spread` set is refused **by
  name**: *"y comes from align y middle on line 40. Drag iv to move the row,
  or drop c1 from that line."* The status bar always shows the line it is
  about to write.

  Where an edit goes, in four tiers: the `--watch` socket, now two-way, which
  patches the block straight back into `source.md`; the clipboard; File
  System Access where the browser has it; and `localStorage` for a reader
  whose `audience.html` is a build artefact, with a visible way back. An edit
  syncs to the other window as its own message, gated by the freeze flag – so
  freeze, fix the figure, unfreeze, and the room gets the finished picture.

  **An `align` or `spread` set can be left by dragging.** Pulling a follower
  against its shared axis holds it there, draws the axis, and says how much
  further to pull; half a cell past it, or with Alt held, the element is
  dropped from the statement and the drag goes through. It used to be a flat
  refusal telling the author to go and edit that line by hand – which is the
  edit the editor exists to make, and the only way out of a set was the text.

  **Waypoints are draggable.** A hollow dot at the middle of every segment
  adds one, a square moves one, and a double-click or the chip in the panel
  takes one out. Where a waypoint holds a reference – `via iv.cx,d0.bottom+0.28`,
  which is how a routed arrow stays attached to the boxes it runs past – the
  drag rewrites the **signed nudge** on each component and never the
  reference. Each axis is decided separately, because half reference and half
  number is the normal case in a routed figure.

  An **arrow is a first-class object** in it, which took some doing: an edge
  has no box, because it is not placed – it is drawn between two things that
  were. Clicking one hits the line itself, a box wins over an arrow crossing
  it and an arrow wins over the container it runs through, and the selection
  traces the line rather than boxing it. Dragging either end retargets it,
  and answers with a **name** wherever it can – the arrow keeps following the
  box it now points at, instead of being frozen to the coordinates the drag
  happened to end on. Labels are multi-line, on edges as well as boxes.

  Off with `editor: none` in the frontmatter; `editor: speaker` keeps it out
  of the projection. A lecture with no diagram pays nothing.
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
