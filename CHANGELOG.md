# Changelog

Notable changes per release. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow [semantic versioning](https://semver.org/). From 1.0.0 the
**source format is the interface**: a change that stops an existing `source.md`
from building the same way is a major version.

## [Unreleased]

### Added

- **An edge label can sit on either side of its line.** All four alignment
  words now name a side: `.top` / `.bottom` beside a horizontal edge,
  `.left` / `.right` beside a vertical one, and `.turn` stands the words on
  end beside it. Two parallel edges can therefore carry a label each without
  the reader having to guess which line the lower one belongs to. Which pair
  applies depends on the direction the edge ended up running, so naming the
  pair that runs along it is a build warning rather than a parse error.

- **`::: diagram` draws five more outlines.** `.hex`, `.diamond`, `.chevron`,
  `.wedge` and `.cross` join `.round` and `.sharp` in one slot – a protocol
  message that is an arrow, an IDS sensor that is a hexagon, a size comparison
  that is a triangle, a scatter marker, and the diamond a room has been trained
  since school to read as the question a flowchart asks. `point up|down|left|right` aims the two
  that have a point, so eight orientations cost one option rather than eight
  class names. They cost nothing downstream: a shape is the same four numbers
  a rectangle carries, joined into a different path, so the extents, the
  viewBox and the tween are untouched. An outline class on any other kind, or
  inside a `style` step, is an error rather than a silent no-op.

  The diamond is the one that eats **both** axes, and in proportion to its
  label rather than to the other axis: the widest room a diamond offers is a
  strip half its width by half its height through its centre, so a label that
  fits a rectangle needs a diamond twice as wide and twice as tall. Keep a
  diamond's label to two or three words, or the decision arrives at four times
  the area of the boxes it sits between and takes the figure over.
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
- **A bar chart can run sideways, and a chart can say what shape it is.**
  `horizontal` on a `bars` line turns the columns into bars: lengths from a
  shared left edge, categories stacked downwards, the tick strip a right-aligned
  column down the left margin and the baseline standing on the left. It is not a
  variant of the same picture - a reader ranks lengths more reliably than
  heights, and a category called "DNS cache poisoning" cannot be written under
  an upright column at all. Which is why a tick string containing `|` is now
  split on that rather than on spaces, so a row label may be a phrase; the same
  mark already separates a `table` row and a `lanes` name.

  `aspect W:H` on a `bars` or a `plot` states the proportion the reader sees.
  It exists because `w` and `h` are counts of *grid cells* and a grid cell is
  not square: at `unit=150x52` a plot written `w 1.9 h 1.5` arrives 285 pixels
  by 78, and nothing on the line hints at it. Write `aspect 4:3`, `aspect 1:1`,
  or one bare number meaning that many wide to one tall, and the build works
  the other dimension out. Giving `w`, `h` and `aspect` together is an error.
- **`same as <chart>` sizes a `plot` or a `bars` from another one**, for the
  row of comparable frames a shared baseline needs. It is answered while the
  line is read rather than during layout, because a chart's gridlines, ticks
  and columns are placed from its own dimensions at parse time - so the chart
  being copied has to be written above the one copying it, and the build says
  which of declared-below, not-a-chart or not-there went wrong.
- **An edge can be placed against, like anything else.** `text n "…" above w1
  gap 0.2`, `at w1.cx,w1.cy` - the box a coordinate reads is the bounding box
  of the route. A coordinate could name a box, a dot, a text or an image and
  never an edge, not by design but because edges were routed after the walk
  that places everything else; the omission bit in the wrong direction, because
  a phrase describing a wire then had to be pinned to one of the boxes at
  either end and drifted off its line on the next edit. Raising two boxes from
  `h 3.0` to `h 4.2` moves a box-anchored label from 13.5px off its wire to
  22.3px; a wire-anchored one stays where it was put. `dgEdgeRoute()` is now the
  one text that works out a route, called by the layout and by the emitter, so
  the two cannot disagree.
- **`table` and `lanes`.** A grid of labelled cells, and a set of equal bands
  with their names turned down the side. Both expand at parse time into
  ordinary boxes and texts, exactly as `bars`, `grid` and `plot` do, so a
  `brace` spans two rows of a table and a `style` step tints one cell with no
  new vocabulary anywhere downstream. They exist because the hand-built
  versions are the ones that cannot be maintained: six rows of three cost
  twenty-one declarations and a chain of `below` references to re-aim whenever
  a row is inserted. A table's heading is one string split on `|` and its body
  is the run of bare quoted strings beneath it; every cell carries two
  generated tags, `@t-row-2` and `@t-col-0`, so lighting a row per beat is one
  line of source. `lanes` is deliberately **not** a container: a container fits
  its members, so bands holding different numbers of things come out ragged at
  both ends, which is the opposite of what a swimlane means.
- **A `bars` chart can carry more than one run of columns.**
  `bars g "…" series of f` joins the first chart's frame rather than drawing
  its own – plain, it stands beside the runs before it and the cell is shared
  out, so a grouped chart takes exactly the paper a single one did; `stacked`,
  it sits on the run before it and the scale becomes the tallest stack. It is
  its own statement rather than a second values string so that each series has
  its own attribute tail: a series is a thing with a colour and a name, and one
  tail per series is how it gets one. A series refuses `w`, `h`, `space`, a
  placement and a tick strip by name, because all five belong to the chart it
  joined. `emph 1,3` and `calm 4` on any `bars` line take column indices and
  mean on the line what they already mean in a step, so a chart can *arrive*
  with one column singled out instead of only from beat 1 onwards.
- **`.elbow` routes an edge with one turn out and one turn in.** A rail halfway
  across the gap, on whichever axis the two ends are further apart, with both
  anchors forced onto that axis – the two waypoints every tree edge used to be
  written with by hand, said in one word. The rail is measured between the two
  *faces* rather than the two centres, which is what makes several connectors
  out of one parent share a rail and read as a single bracket. Bounded on
  purpose: it looks at nothing else in the figure, nothing steps around an
  obstacle, and there is no option to move the rail; `.elbow` together with
  `via` is an error rather than a preference the build guesses at.
- **`sequence` draws a protocol down the page.** A row of actor heads, a
  lifeline under each, numbered messages between them and notes on a lifeline,
  written as three shapes of line: `actor u "User"`, `note b "…"`, and
  `u -> br "label" ["second line"]`. It expands at parse time into the boxes,
  texts and edges the language already had, so a `brace` spans three messages
  and a `step` reaches one by name with no new vocabulary anywhere.

  The statement owns exactly one thing – the vertical rhythm. Written out by
  hand every message carries a y coordinate of its own, so inserting one in the
  middle means moving everything under it, renumbering, and re-guessing how far
  the lifelines run: measured at thirteen edits against one line. Every entry
  states the height it needs and the statement stacks the bands, so a note
  pushes what follows it down. `space n` on a `note` or a message line sets that
  one band's own gap, which is how a dense protocol is broken into phases.

  Everything it draws has a name – `wa-3` for a message, `au-life` for a
  lifeline, `wa-note-0`, plus the tags `@wa-msgs`, `@au-msgs`, `@wa-msg-3` – so
  an annotation the construct knows nothing about is an ordinary line. There is
  deliberately no `alt` / `else`: a `container` with a caption already encloses
  and names a group of messages, and a word freezes at the next release.

  Message labels carry a paper ground by default, because a lifeline crosses
  every one of them. `.clear` takes it off, a written `.tone-n` replaces it.
- **An edge's label can carry a ground.** A fill class on an `edge` draws a
  rect behind the label on the same terms a free `text`'s ground is drawn, and
  `pad` is now a legal `edge` option. With no side named the label sits **on**
  the line and knocks it out behind the words, which is what a sequence number
  or a port wants; with `.top`, `.bottom`, `.left` or `.right` it clears the
  line and carries the ground with it. Before this, `.paper` on an edge
  resolved, emitted its class and drew nothing.
- **`figure-design.md`** – how to lay a figure out so a room reads it: ten
  rules with a wrong/right pair each, the tone-to-role table, the four
  arrangements a lecture keeps asking for (flowchart, swimlane, tree, table)
  with the construction fact each one turns on, the four-beat step order, and a
  checklist to work down before a figure is finished.

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

  **A relation can be re-pointed, not only stretched.** Four chips appear
  around whatever the pointer is over while dragging, and releasing on one
  docks the element to that side of that element – the placement is rewritten,
  so it follows its new reference from then on. Dragging an element through
  the thing it is measured from changes the side without leaving it. The
  placement pane reads the relation back as the three things it says – kind,
  reference, distance – and lets each be changed, including `between a,b`,
  which no drag can express. The align and distribute acts are named the way
  they would be looked for rather than the way the statement spells them.

  **A label can sit somewhere other than the middle of its box.** `.left` /
  `.right` place a horizontal run of text and `.top` / `.bottom` the block of
  lines, measured against the element's own padding – as far that way as the
  box allows, not on its border. A tall element with a short label is the case
  they exist for. With more than one line the block moves rather than the
  line, so `bottom` puts the *last* line on the inner edge. `.left` / `.right`
  previously worked on a free `text` only.

  Written where it cannot act, one of those words is now an error rather than
  a class that resolves and moves nothing. A container's caption is placed on
  its own top border and a brace's label beside the spine, so none of the four
  applies to either. An edge carries its label at the middle of the line, so
  `.top` and `.bottom` have nothing to move there, while `.left` and `.right`
  still decide which side of that midpoint the words start from.

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

### Fixed

- **Two messages named a name that exists but is not usable yet as one that
  does not exist.** A `plot` line that failed on a later option is still
  *registered* under its name, so reading a value out of it reported that
  "q is a plot, not a plot"; it now points at the line carrying the real
  error, and says it once per name instead of once per coordinate. A
  `same as` naming a chart declared three lines lower said it named nothing
  in the block.
- **A bare `.cross` box is square.** It was 66 by 37 - the minimum box width
  against one line of type - so a plus sign came out with arms of two different
  lengths, which reads as a stretched shape rather than as a marker. Squared
  where the size is decided rather than where the path is drawn, because the
  footprint the layout reserves has to be the footprint that is drawn.
- **A label beside a vertical edge had half the clearance of one beside a
  horizontal edge.** The measured box carries the line's leading along its
  height and nothing along its width, so the same constant bought 3.9px of air
  in one direction and 2px in the other - and optically a gap across a line of
  text needs more, not less. The missing leading is added back where the
  measurement does not carry it.
- **A grounded label beside a line laid its ground back across the line.** The
  offset cleared the glyphs and not the ground, so the rect painted out the one
  thing the offset existed to keep visible.
- **`emph` on a `.tone-4` element was invisible** - an accent stroke on an
  accent fill. It is an ink ring now, checked in all seven themes.
- **A `bars … series of` line was not editable at all.** It is the one statement
  that produces no element carrying its own name, so it had no span-table entry;
  that looked like a decision and was an accident.

- **Every edge label cleared its own width, whichever way its line ran.** The
  gap between a label and its line has to clear what the words measure *across*
  the line – their height beside a horizontal one, their width beside a
  vertical one – and the test that decided which compared an angle in degrees
  against a boolean. `false !== 0` is true whatever the line does, so a
  horizontal edge pushed its label off by half the label's length. It is why
  two arrows between one pair of boxes carried their labels at two different
  heights, each proportional to how long its own word was. The number and the
  boolean are separate values now.

- **A bare `dot` was the one thing in a diagram that ignored `unit=`.** Its
  default radius was 13 raw pixels while the `r` an author writes is in grid
  units, so the smaller the unit, the fatter an unsized dot came out relative
  to everything around it – a marker inside a plot arrived taller than the cell
  it marked a point in. It is 0.18 grid units now, measured against the same
  height every other clearance is; at the default unit that is 12.96 px, so
  existing figures are unchanged to the pixel.

- **`show` or `hide` naming an edge, a container, a brace or an annotated text
  did nothing.** Those four take their visibility from what they are attached
  to – an edge from its two ends, an outline from its members, a note from what
  its leader points at – and that rule was applied *after* the step had had its
  say, so a `show` on one of them parsed, passed the reference check, wrote the
  state and was then thrown away. The downhill rule is now the default and an
  explicit `show` or `hide` overrides it, which is what makes an arrow that has
  to arrive a beat after both its ends expressible at all. A container shown by
  name also fits its whole set rather than the visible part of it: an outline
  drawn around some of what it says it holds is the same mistake read the other
  way.

- **A coordinate pair written as a single anchor crashed the build.**
  `dot m at c.center` was reported correctly by the parser and then laid out
  anyway, and the compiler died on the null pair with a TypeError. The author
  saw a stack trace where every other mistake in this language names its line.
  A pair that failed to parse is placed at the origin now, so the layout
  finishes and the message gets out.

- **`.muted` and `.dim` were hard to tell apart.** They answer different
  questions - scaffolding versus temporarily out of the way - but a lighter
  grey alone read as "slightly faint" either way. `.muted` is now drawn
  thinner as well as lighter, which is what supporting apparatus should look
  like; `.dim` is unchanged at a third of full strength.

- **`.mono` never applied to a diagram label.** The class resolved, emitted
  its marker on the `<text>` element, and changed nothing: the rule that
  styles it is one class less specific than the rule that sets the label
  family, so the label rule won. Measured before the fix, eight `i`s and
  eight `W`s in a `.mono` label came out 22.8px and 109.1px wide, which is
  the sans face. The three family classes are now all written the same way.
- **A `container` outline was drawn in the faintest line colour on the page**
  (`--rule`, which elsewhere separates two cells of a table). Dashed at that
  weight it was close to invisible on a shaded background, which is where a
  trust boundary or a network segment is usually drawn. It now strokes at a
  mix of the text and background colours, so it still follows the theme.

- **A review of the whole branch, and thirty findings closed.** The ones a
  user could meet, grouped:

  `--optimize-images` rewrote only markdown-style `](path)` references, so
  an explicit path in a `::: diagram` image statement kept pointing at the
  original the command had just converted and deleted – the next build
  failed on a file the tool itself removed. Both spellings are rewritten
  now, fence-aware, and a conversion whose reference cannot be found is
  said out loud instead of reported as done. The reference collectors are
  fence-aware too, and they read a `grid … image` asset – a fenced syntax
  example can no longer get a real file converted, and an oversized grid
  asset no longer slips past the gate.

  Three promises of the live-edit sync are kept now instead of documented:
  an edit committed while the projection is frozen is held back and
  delivered on thaw ("unfreeze, and the room gets the finished picture");
  a received edit is persisted the way a local one is, so reopening the
  editor no longer loads pre-edit source whose next gesture silently
  reverted the peer's work everywhere; and under `editor: speaker` the
  cockpit sends the compiled figure along with the source, so a projection
  that ships no compiler applies the edit instead of dropping it in
  silence. The zoomed focus card – the thing the room is actually looking
  at – now follows a structural edit too; it used to keep the pre-edit
  drawing until refocused. The DOM half of all of this is one shared
  function (`dgSwapFigure`), so the editor's path and the no-editor path
  cannot drift.

  The linter agreed with the compiler in neither direction. Stricter: a
  quoted label containing braces (`"H = {0,1}^n"`) was read as an attribute
  tail and refused – set notation in exactly the lectures this vocabulary
  was built for. Laxer: the kind-gated class refusals, the `point` checks
  and the reserved-id rule were not mirrored, and a `@tag` on a `default`
  or `step` line counted as carried – so a lecture that is linted by CI but
  never built could merge green and fail every later build. The refusal
  functions are imported from `diagram-core.mjs` now, the same bend the
  naming scheme already made: they are the rule, and a second spelling of
  it here is how the gate came to disagree.

  Parser holes of the kind this grammar keeps closing: `at 3,` placed an
  element at 0 instead of erroring (`Number('')` is 0, and `0x10` was 16);
  `between a,b point right` consumed the newer options as member names and
  refused valid syntax order-sensitively – the stop list is derived from
  `DG_KIND_OPTS` now, so it cannot drift again; an element named
  `constructor` or `toString` broke the step runtime's frame tables at
  show time with nothing at build time to say why (refused at parse, in
  both compiler and linter); and a diagram `image` that resolved to a video
  file built without complaint and rendered an empty box – a clip is
  refused with the construct that works, `![](clip-id)` in the chunk body.

  In the editor: the span table took an element named `w`, `h`, `x` or
  `gap` – all natural diagram names – for the option keyword and spliced
  panel edits over the wrong token, up to and including a label; dragging a
  container or brace planned an `at` their statements refuse and reverted
  the whole multi-selection with it; a drag at a beat moved only the
  element under the pointer, not the selection; a resize handle on a `grid`
  spliced `w`/`h` into a statement that takes `cell`; waypoint handles on a
  `.smooth` edge sat on Bézier control points instead of the author's
  waypoints; the arrowheads row edited a class the parser had derived from
  `--`, so "both" produced one reversed head and every tail rebuild wrote
  `.no-head` into the line – the row rewrites the arrow token itself now;
  a non-numeric gap or frac was written as 0 instead of refused; a
  cancelled pointer (alt-tab, a system gesture) left the drag listeners
  armed so the next click committed an abandoned preview; and two of the
  asset picker's three insert paths appended a line the in-page compiler
  then refused, while the status said "written" – all three register the
  asset first, and "written" is only said when it stuck. A failed watch
  rebuild now reaches the page and the editor's status line; it used to be
  visible only in the terminal while the next write-back was refused with
  advice that could not help.

  And the payloads: print carried every figure's step frames and editor
  source as JSON no consumer ever parses – 346 KB of the network-security
  print file – and ships none of it now. A stepped diagram inside an
  `::: expand` was stuck on its opening beat in the live views (its steps
  consume no beats, and nothing ever advanced it); where no beat can
  reach, the finished picture is shown, which is what print always did.
  `DIAGRAM_CSS` is covered by `assertStylesheetsWellFormed` like every
  other inlined sheet, the runtime's outline table is interpolated from
  `DG_SHAPE_CLASSES` instead of hand-copied, and the browser suite starts
  one Chromium for the whole run instead of one per spec.

  In `lectures/network-security`: #ns-b57's "anomalous payload
  distribution" carried the values of #ns-b56's *training* distribution,
  so the histogram was congruent with the one it is supposed to deviate
  from; it and #ns-b55 now share one set of values for the one packet they
  both show, and the bins sum exactly to the slide's printed counts
  43 / 36 / 21. Two miscounts in the German commentary (ten packets, not
  twelve; one intermediate in the drawn `github.com` chain) and the
  diagrams lecture's statement count (fourteen, not eleven) match their
  figures again.

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
