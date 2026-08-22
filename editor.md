# The diagram editor

Spec and build plan for the graphical editor for `::: diagram`. Companion to
`PRD.md` §4.6a (the grammar) and `speaker.md` (the sync protocol it borrows).

Status: **plan only.** Nothing here is implemented. The grammar it edits is
frozen enough to build against – three constructs in it exist specifically so
this editor can answer a drag without destroying what the author wrote (§3).

## 1. What it is for

Two audiences, one editor.

- **The author**, mid-lecture-writing, who has a figure that is nearly right
  and does not want to count grid cells. Today that means editing text, saving,
  and looking at the rebuilt tab. The editor closes that loop to one gesture.
- **The reader** of a built `audience.html` – a student – who wants to take a
  figure apart, move a box, and see what happens. This is the reason to ship it
  inside the output rather than as a separate tool.

And one thing it is emphatically **not**: a drawing program. It has no
freehand, no curves, no arbitrary colours, no font control. The class
vocabulary is closed at 24 names and the editor exposes exactly those. Anything
it produces is a `::: diagram` block a human could have typed, in the same
language, and anything a human typed it can open.

**The load-bearing property: the editor edits source text, not a model.** It
parses the block, records where every token sits, answers a drag by rewriting
the smallest span it can, and re-runs the same compiler the build runs. There
is no second representation to drift, no export step that flattens relations
into numbers, and no file the editor owns.

## 2. The four decisions

### 2.1 Where it ships

**In both live views, whenever the lecture contains a diagram; off in print;
`editor: none` in the frontmatter turns it off.** That mirrors two existing
patterns exactly – the KaTeX stylesheet is emitted only into views that contain
a formula, and `fonts: none` is how an author declines a payload they do not
want.

Cost, measured: the compiler section of `build.js` is **2164 lines / 100 KB**,
of which the CSS and the step runtime (265 lines) already ship. So the compiler
the editor needs is ~1900 lines / **~88 KB raw**, plus the editor UI itself –
call it 150 KB total, in a file that already carries 276 KB of fonts and up to
254 KB of KaTeX faces. Proportionate, not free, and `editor: none` is the
answer for an author who disagrees.

**The entry point is inside the figure-focus card, not a bare key.** Clicking a
diagram already zooms it into a centred card; that card grows an edit
affordance, and `E` works while it is open. The reason is the projector: the
audience view is what a room is looking at, and a modal editor must not be one
fat-fingered keystroke away. Two gestures – focus, then edit – is the right
price.

### 2.2 How a new figure starts

**It does not start in the editor.** The seed is one line of Markdown:

```
## figure: Heading {.wide #some-id}

::: diagram
box a "A"
:::
```

Save that, and the editor has something to open. The reason is not laziness: a
graphical editor is *bad* at exactly the part a new figure needs – choosing the
chunk id (frozen once authored, and the anchor for cross-references, TOC
entries and sync snapshots), writing the heading, writing the caption prose.
Those are text, and a text editor is already open.

Two things make the seed cheap: `node build.js --new <slug>` gains an empty
figure chunk in its scaffold, and the editor's **"New figure…"** puts a whole
chunk – heading, id, block – on the clipboard for the case where no text editor
is open. A convenience, not the path.

### 2.3 Where an edit goes

Three tiers, in the order they should be tried.

**Tier 1 – `--watch`: write back through the socket that already exists.**
This is the author's loop and the cheapest of the three, because `runWatch`
already holds a WebSocket to every open tab. Today it is one-way (`'reload'`).
Make it two-way: the editor sends `{type:'patch', nonce, range, text}`, the
server splices that byte range into `source.md`, `fs.watch` fires, the normal
rebuild runs, every tab reloads. **`source.md` stays the single source of truth
and the editor never owns a parallel copy.**

Three things that must be true before this ships:

- Bind the WebSocket server to `127.0.0.1`. It currently omits `host`, so it
  listens on every interface – worth fixing regardless of the editor.
- A per-build **nonce** in the HTML, required on every patch. Without it any
  page in the browser that guessed the port could write to the author's disk.
- The server accepts a patch only if its range matches a `::: diagram` block
  the build actually emitted, and re-reads the file first, so a patch computed
  against a stale buffer is refused rather than applied at the wrong offset.

**Tier 2 – the clipboard.** Always available, every browser, `file://`
included. Same idiom as `Shift`-`E`, which exports live annotations as a
marker-wrapped snippet for `--integrate-annotations`.

**Tier 3 – File System Access, opportunistically.** `showSaveFilePicker` /
`showOpenFilePicker` exist and are *reachable* from `file://` in Chromium –
measured: `isSecureContext` is true, the functions are present, and calling one
under a user gesture rejects with `AbortError` (no dialog in a headless
browser), **not** `SecurityError`, so the call is not blocked by the opaque
`file://` origin. Two honest caveats: I could not complete a real dialog
headlessly, so "the picker opens" is inferred from the absence of a security
rejection rather than observed; and *persisting* the handle across reloads goes
through IndexedDB under that opaque origin, which is the ground on which
`BroadcastChannel` already fails between two `file://` tabs (`speaker.md` §2).
Expect "pick the file every session", not "remember my source.md". Firefox and
Safari have neither function. Feature-detected upgrade, never load-bearing.

**Tier 0, for the reader – `localStorage`.** A student's edit has nowhere to
go: their `audience.html` is a build artefact, gitignored, regenerated. So it
goes on the same shelf as `revealed[]` and the theme preference, keyed by chunk
id, and the figure shows their version with a quiet "edited · revert" marker,
plus "Copy source" to take it away. It never touches disk and never syncs to
the speaker window.

### 2.4 Both windows see the edit

**An edit syncs.** Everything else on the slide does, and a diagram that
differed between the projection and the cockpit would be the first divergence
in the product.

It follows the **video** precedent in `speaker.md`, not the state snapshot,
and for the documented reason: `applyRemoteState` is a *full* apply, so folding
an edit into the snapshot would drag the receiver's slide position along with
it. So it is its own message – `{type: 'diagram-edit', id, source}` – addressed
by the diagram's own id rather than by index, because reordering a chunk must
not be able to mis-target it. That is the same lesson `data-fig-id` already
carries for `video`. The receiver re-renders that one diagram in place. Echo
suppression works like `applyingRemoteVideo`: applying a remote edit must not
bounce straight back.

**Gated by the freeze flag, like any other shared state.** Which also answers
the "can I work unseen?" question without inventing anything: `V` already means
*the room holds this slide while you move on*. Freeze, edit, unfreeze, and the
room gets the finished figure. A **private editor mode is therefore not a
separate feature** – it is the cockpit's existing freeze, and the editor should
say so in a line of chrome ("the room is following" / "the room is frozen on
beat 2") rather than growing a second concept for the same thing.

Two things deliberately do **not** sync: a reader's `localStorage` edits in
their own `audience.html` (there is no second window, and nothing to sync to),
and the editor's *selection* and *frame* (§5). Which figure the author has
selected, and whether they are previewing it in a column, is workspace state,
not content. The room sees the picture change; it does not need to watch a
handle move.

## 3. What the grammar already promises

Three constructs state a *relation* rather than a number, and an editor that
answers a drag by replacing them with absolutes destroys the thing they exist
for. The grammar is shaped so it never has to (also in `CLAUDE.md`; restated
because it is the editor's contract):

- **A coordinate component carries its own signed nudge** – `x0.cy`,
  `mix.cx+0.2`. One optional signed term, no other operators, no nesting, so
  the token to replace is always exactly one and the reference survives.
- **`align` / `spread` name a set with a master.** Dragging the master moves
  the group. Dragging a follower on the constrained axis is a different act.
- **A tag default is shared.** Resizing one element that draws its width from
  `default box @dec w 0.48` writes an explicit `w` on *that element* – "just
  this one" is the safe reading of a drag.

## 4. Tools, and why the toolbar is not Excalidraw's

Excalidraw's model is: pick a tool, draw a shape, the shape has coordinates.
Ours is: pick a tool, and the editor writes a **statement**. That difference
shows up in one place immediately – **not every tool is a placer.**

**Placers** put a new element somewhere. Click (or drag, for an edge):

| key | alias | tool | writes |
|---|---|---|---|
| `1` | `V` | select | – |
| `2` | `R` | box | `box <name> "…" <placement>` |
| `3` | `C` | dot | `dot <name> "…" <placement>` |
| `4` | `T` | text | `text <name> "…" <placement>` |
| `5` | `A` | edge | `edge <a> -> <b>` |
| `8` | `I` | image | `image <name> <asset> <placement>` |

**Wrappers** act on what is already selected, because that is what their
statements mean. There is nothing to draw:

| key | tool | writes |
|---|---|---|
| `6` | container | `container <name> over <selection>` |
| `7` | brace | `brace <name> over <selection> right "…"` |

Select three boxes, press `6`, get an outline around them. That is a better
gesture than drawing a rectangle and hoping it contains the right things, and
it is the only one that can produce the statement the grammar has.

**`align` and `spread` are also selection acts**, on the toolbar rather than
behind a drag. Select, click "align y middle", and the editor writes `align y
middle a, b, c`. **The first element selected is the master** – which is
exactly what the statement means, so the UI teaches the semantics for free.

Excalidraw-compatible where it does not collide:

- `Q` locks the current tool (otherwise one shot, then back to select).
- `Space`-drag or middle-drag pans; wheel zooms. `Space` is free here because a
  modal editor owns the keyboard – see below.
- `Ctrl/Cmd`-`Z` / `Shift`-`Ctrl/Cmd`-`Z` undo / redo, `Ctrl/Cmd`-`D`
  duplicate, `Ctrl/Cmd`-`A` select all, `Delete` deletes.
- Arrow keys nudge the selection, `Shift`-arrow by a coarser step. **A nudge
  writes into the same token a drag would**, so the arrows are precise drags,
  not a second mechanism.

Two deliberate divergences:

- **`O` is not ellipse.** In psi-slides `O` means "show me everything and let
  me pick one" – it is the overview board on the slide and it is the figure
  board here (§6). Consistency with the host product beats consistency with
  Excalidraw when the two collide, so a circle is `C`.
- **`Esc` steps back out, one rung at a time**: deselect → back to the select
  tool → close the editor. Identical to the ladder on the slide (figure →
  overview → expansion), which is already documented in the help sheet.

**The slide is keyboard-first; the editor is GUI-first.** That inversion is
deliberate. On the slide a lecturer's hands are busy and their attention is on
the room, so the keys are the interface and `?` is the manual. In the editor an
author is exploring, and every mechanism below – tools, frames, zoom, moving
between figures – **must have a visible control that does the same thing**,
with its key printed on it. The keys are accelerators for people who already
know; nothing is reachable only by knowing. The `?` sheet gains an editor
section through `renderHelpOverlay()`, which already generates the cheat sheet
for both live views from one data structure.

**The modal owns the keyboard.** While the editor is open, the view's own
handler is off entirely – no `C`ollapse, no `F`ont, no `A` theme, no `Space`
advance. Otherwise every tool key would also do something to the lecture
underneath. This is a hard requirement, not a nicety.

**Sidebar and toolbar are different things.** The toolbar is the acts above,
transient. The sidebar is the *selection*: the closed class vocabulary as
swatches, the geometry options that kind actually accepts (`DG_KIND_OPTS`, so a
`dot` offers `r` and never `w`), the label, the tags, and an element list that
doubles as the "what refers to what" view.

## 5. The canvas is a frame, not a canvas size

You cannot judge a figure without knowing how large it lands, and in this
project that is **not a property of the figure**. `unit=WxH` sets only the grid
cell and therefore the proportions inside the picture; how large it arrives is
the chunk's width class, and the vertical cap is `max-height: 62vh` in the live
views and `none` in print. So an editor that lets you pick an arbitrary canvas
size would be lying to you.

Instead the canvas shows the figure inside a **frame that is a real
destination**, and the frames are computed, not chosen:

| frame | what it is | measured |
|---|---|---|
| **slide** | the chunk's own width class in a 16:9 view | `narrow` 28em · `standard` 36em · `wide` 52em · `full` 72em |
| **column** | one pane of a `::: side` or `::: cols 2` at that width class | 13 / 17 / 25 / 35em – just under half the chunk in every class |
| **print** | the document measure, where the 62vh cap does not apply | `.psi-diagram { max-height: none }` in `@media print` |

The **column frame is the portrait case**. A `::: side` pane at `.full` is 35em
against the slide's 72em, and at `.standard` it is 17em – tall and narrow, and
the one place a landscape figure quietly stops working. Giving it a named frame
is better than an arbitrary portrait toggle because it is the actual geometry
the figure will meet.

`F` cycles the frames. **Switching frames changes nothing in the source** – it
is a preview of where the same block will land, which is the point.

Two things the frame lets the editor say out loud, both of which are today
invisible until you look at the built page:

- **"This lands height-capped."** When the viewBox aspect against the chosen
  frame hits 62vh, a third of the measure stays empty beside the drawing. The
  CSS comment already describes this failure; the editor can name it while you
  can still fix it.
- **"This is a 30-character budget."** Inside a `::: side` pane a `<pre>` gets
  roughly 30 characters before `clampZoomToWidth()` shrinks that one slide. The
  same pressure applies to a long label in a narrow frame.

## 6. Moving between figures

Once the editor is open it stops being attached to one chunk and becomes a
**figure workspace over the whole lecture**. Every diagram in the document is
already in the DOM of a live view, so enumerating them costs nothing.

- `,` and `.` – previous / next figure in source order. **Not `[` and `]`:**
  on a German layout those are `AltGr`-`8` and `AltGr`-`9`, which is not a
  shortcut, it is a chord. `,` and `.` are unmodified keys next to each other
  on QWERTZ and QWERTY alike, and they carry the step-back / step-forward
  convention from video scrubbing. `PageUp` / `PageDown` do the same thing for
  anyone who wants an unmistakable key.
- `O` – the **figure board**: every figure in the lecture as a thumbnail, click
  to switch. Same idiom, same key, same mental model as the slide overview.
- A **figure strip** along one edge, reusing the speaker view's preview strip
  wholesale: `Shift`-`V` flips it between the bottom edge and the right edge,
  drag the bar to resize, drag the strip to scroll, click a thumbnail to jump.
  That component exists and behaves the way a lecturer already expects.

**Every one of those has a control you can see and click**, per §4: the strip
carries ‹ › buttons and the figure's name, the board has its own button beside
them, and the frame selector (§5) is a segmented control reading *Slide ·
Column · Print* with the measured width under the active one. An author should
be able to drive the whole workspace having read nothing – the keys are how it
gets fast afterwards.

The same rule covers the viewport: visible zoom out / in / fit-to-frame
buttons showing the current percentage, next to `Space`-drag and the wheel.

Leaving the editor returns the slide to whatever chunk you started on, not
wherever you wandered. Editing five figures should not move the projection five
times.

## 7. Copying between figures

The stated goal is a consistent look across a series of figures. There are two
mechanisms and they answer different halves of it.

### 7.1 Paste the dependency closure

Select in figure A, `Ctrl/Cmd`-`C`, switch to B, `Ctrl/Cmd`-`V`.

Naively this is impossible in a relational grammar: the selected lines refer to
elements that do not exist in B, and converting those relations to absolute
coordinates is precisely what §3 forbids. So the editor pastes the **closure**
of the selection instead – everything the selected lines depend on:

- placement references (`right of A`, `between A,B`, `at m0.cx,…`)
- `same as` references
- both endpoints of every selected edge
- the members of every selected container or brace
- the master of any `align` / `spread` the selection is part of
- the `default <kind> @tag` blocks the selection's tags actually use

Only the **root's placement** is then undetermined, and that is the one
decision the paste has to make: `Ctrl/Cmd`-`V` drops it where the cursor is,
`Ctrl/Cmd`-`Shift`-`V` **pastes in place** – the same `at X,Y` it had in A,
which is what "an Ort und Stelle" asks for and what makes a series line up.

Name collisions are renamed mechanically (`reg` → `reg2`) with every reference
*inside the pasted set* rewritten. That is safe now precisely because element
names were restricted to letters, digits, `_` and `-` in the last pass.

### 7.2 Share the defaults, not the boxes

For a consistent look the thing worth carrying between figures is usually not
the elements at all – it is the two or three `default` lines. So the editor
gets that as its own act: **"apply these defaults to every figure in the
lecture"**, which physically writes the same `default` block into each one.

This is a refactoring, not a language feature, and the editor is exactly the
tool that makes it safe: twelve blocks, one atomic patch, and the linter's
duplicate-default check catches anything that was already there. It needs no
grammar change, which matters because the grammar wants to freeze.

The honest weakness is that it decays – change the look later and you edit
twelve places again. See §10.

## 8. Architecture

### 8.1 One compiler, two runtimes

The editor has to re-run layout after every drag, in the browser. `build.js`
runs it in Node. The compiler must therefore be **one text, used twice**:

- extract the diagram compiler into `diagram-core.mjs` – pure JS, no imports,
  no Node APIs, exporting the vocabulary tables, `parseDiagramSource`,
  `layoutDiagram`, `dgStateAt`, `dgFrameDrawables` and the emitter;
- `build.js` imports it for the build **and** reads its text to inline it into
  the live views that need it.

This is a deliberate departure from "`build.js` is one file", and it should be
made knowingly: the file stays the whole *rendering* stack, and the diagram
compiler leaves because it is the one part that has to run in two places. The
precedent for reading a file at build time and embedding it is already there
(`bundledFaces()` reads woff2 out of `node_modules`).

It also **removes** a documented duplication rather than adding one: `lint.js`
is zero-dep and standalone by design, and `diagram-core.mjs` has zero
dependencies of its own, so the linter can import the vocabulary tables
(`DG_KEYWORDS`, `DG_STEP_OPS`, `DG_CLASSES`, `DG_CLASS_GROUPS`, `DG_KIND_OPTS`,
`DG_ALIGN_X/Y`, `DG_SCALAR_X/Y`) instead of mirroring them by hand.

Four Node-only leaves have to come out of the core and be injected: image
resolution (`fs`), aspect reading (`fs`), the `[diagram]` warning sink, and
`escapeHtml`. In the browser images are already resolved – the compiled SVG
carries the data URI – so the editor injects a lookup of `id → {href, aspect}`
emitted alongside the frames payload.

### 8.2 Source spans

The parser records `line` today. It needs, for every token it consumes, a
`[start, end]` offset into the block body. `dgTokenize` already walks the line
character by character, so it is a matter of carrying the offset through rather
than a new pass.

The deliverable: given an element id and the name of one attribute (`gap`, `w`,
`frac`, the x-component of `at`, the `align` word), return the exact span to
replace, or the insertion point if the attribute is absent. Every edit in §9 is
one call to that.

### 8.3 Structure

A modal overlay holding: the live SVG (the compiler's own output, re-emitted
after each edit); a **guide layer** and a selection layer, both drawn in
viewBox coordinates so they survive zoom and auto-fit; the frame (§5); the
toolbar and sidebar (§4); the figure strip and its visible controls (§6); a
one-way source pane; the status bar (§9.3); and undo/redo over **source text
snapshots**, not over a model – cheap, exact, and it cannot desynchronise from
what will be written.

The guide layer is worth keeping separate from the drawing for one practical
reason: it is the only part of the editor that renders things the compiler
does not know about (ticks, rulers, distance labels, a hairline through an
`align` set). Keeping it out of the emitted SVG means the SVG stays exactly
what the build would have produced, which is what phase 3 asserts.

## 9. Guides, and the drag policy

This is the design. Everything else is UI.

### 9.1 A diagram is made of relations, so draw them

The whole point of this grammar is that a figure is held together by
relations rather than coordinates – and that structure is completely invisible
in the rendered picture. Two boxes 0.55 apart look exactly like two boxes that
happen to be 0.55 apart. The editor's first job, before it lets anyone drag
anything, is to **make the tidiness visible**.

**At rest, the selection shows what holds it.** Select `prov` and the editor
draws a thin tick to `reg` labelled `gap 0.55`; select a member of an `align y
middle` set and the shared axis runs as a hairline through every member with
the master marked; select anything in a `spread x` and the equal centre
distances appear as matched marks. A `same as` shows as a width bracket
mirrored onto its source. These are quiet – hairlines in `--rule`, labels in
`--ink-soft` – and they answer, without a click, *why is this here?*

This is also how a refusal stops being a surprise. §9.3 says the editor
declines to drag a follower along its constrained axis; if that axis is already
drawn as a line through the set, the refusal is something the author saw coming
rather than something the tool did to them.

**A faint cell grid and rulers in grid units.** `unit=WxH` is the coordinate
system every number in the block is written in, and it is currently something
an author has to hold in their head. Show it: the grid at very low contrast
behind the figure, ruler ticks in **cells, not pixels**, along the frame edges.
`gap 0.55` then has somewhere to be read off.

### 9.2 While dragging, guides propose the statement

Snapping in a drawing tool aligns pixels. Here it does something better,
because every snap target corresponds to a statement the grammar can write.
As an element moves, candidates light up and the status bar (§9.3) shows the
line each one would produce:

| what lights up | what it would write |
|---|---|
| an edge of a neighbour, in a `below` / `right of` chain | `align left` … `align bottom` on the placement |
| a round value on the cell grid | `gap 0.6` rather than `gap 0.5847` |
| **the same gap a sibling already has** | the same number, so a column stays regular |
| another element's centre or edge line | `at m0.cx,…` – a **ref coordinate** |
| the line joining two elements | `between a,b`, and along it, `frac` |
| equal spacing across three or more | an offer to replace the chain with `spread x` |

The fourth row is the one that matters most. **Nobody types `at c1.cx,m0.cy`
from a standing start** – it is the most valuable construct in the coordinate
grammar and the least discoverable, and a guide that appears when you drag near
another element's centre line is how it becomes usable at all. The guides are
not decoration on top of the feature; for that feature they *are* the interface.

Distances are shown live while dragging, in grid units, and a distance that
matches a sibling's is called out the way a design tool calls out equal
spacing – except that here the equality can be **written down** as `spread` or
as a shared `gap`, instead of being a coincidence that survives until the next
edit.

Holding a modifier suspends all snapping, for the case where the author means
0.5847.

### 9.3 Which token a drag rewrites

An element's position comes from exactly one placement expression, and the
editor's job is to decide which token a drag belongs to:

| Placement | drag on the main axis | drag on the cross axis |
|---|---|---|
| `at X,Y`, numeric | rewrite that number | rewrite that number |
| `at X,Y` with `ref.prop` | rewrite the nudge (add one if absent) | same |
| `right of A` / `left of A` | rewrite `gap` | snap to the nearest `align top/middle/bottom`; past a tolerance, write `offset 0,dy` |
| `below A` / `above A` | rewrite `gap` | snap to `align left/center/right`; past a tolerance, `offset dx,0` |
| `between A,B` | rewrite `frac` | rewrite `offset` |
| coordinate owned by `align x\|y` | – | – |
| coordinate owned by `spread x\|y` | – | – |

The last two rows are the interesting ones. That axis is not the element's to
move, and the editor must **say so rather than silently break the set**:
dragging a follower on its constrained axis shows an inline note naming the
line – *"y comes from `align y middle` on line 12. Drag `reg` to move the row,
or drop `ident` from that line."* Dragging the master moves everyone, which is
what the statement means.

Two more rules of the same shape:

- **Resizing an element that says `same as X`** drops the `same as` and writes
  explicit `w`/`h`. Same reading as the tag default: a drag means "just this
  one".
- **Creating an element** does not write `at X,Y` if it can avoid it. Dropped
  roughly axis-aligned beside an existing element, within a tolerance, the
  editor proposes `right of A gap 0.6`; otherwise `at X,Y`.

**The status bar always shows the line the editor is about to write.** That is
worth more than it sounds: it makes every drag legible as a diff, it is how the
author keeps trusting the tool, and in a lecture tool it means a student learns
the DSL by dragging things.

**Deleting** an element lists what else refers to it rather than leaving a
block that will not compile – *"`mix` is named by 3 lines: edge on 7, `align x
center` on 14, `show` on 19. Delete all four?"*

## 10. Phases

Each phase is shippable on its own and verified the way this repo verifies
things: a real figure rebuilt, before and after compared, no console errors in
a browser sweep.

**Phase 1 – the seam.** Extract `diagram-core.mjs`; `build.js` imports it;
`lint.js` imports its tables and drops seven mirrored copies. No behaviour
change: all three lectures build byte-identically, `lint --strict` clean.
*Worth doing whether or not the editor follows.*

**Phase 2 – spans.** Every token carries `[start, end]`; add the span lookup.
Verify by round-tripping: for every element in every example diagram, replace
each attribute span with itself and assert the body is unchanged.

**Phase 3 – read-only canvas.** Ship `diagram-core.mjs` into the live views
behind the `editor:` key, re-render from source at boot, assert the result is
identical to the build's own SVG. This cashes the whole risk of the "one
compiler, two runtimes" bet early and cheaply.

**Phase 4 – the frame.** §5, before any editing. It is what makes phase 5
judgeable, it is pure read-only, and it is independently useful: an author can
already ask "how does this look in a column?" without touching the figure.

**Phase 5 – guides.** §9.1 and §9.2, still read-only: the cell grid, the rulers
in grid units, and the relation overlay on a selection. It is the cheapest
possible test of whether the relation model is legible to anyone but its
author, and if it is not, that is worth knowing before a single drag is
implemented. An author gets something useful out of it immediately: a figure
whose structure they can finally see.

**Phase 6 – select, drag, resize.** The §9.3 policy table, with §9.2's guides
now proposing statements. Toolbar, sidebar, status bar, undo. Still no
persistence – edits live in memory and "Copy source" is the only way out.
Usable already.

**Phase 7 – create, wrap, delete.** The placers and the wrappers of §4, the
relation heuristic, `align`/`spread` as selection acts, the reference list on
delete. "New figure…" producing a whole chunk.

**Phase 8 – persistence and sync.** Tier 1 (watch write-back, with the nonce
and the `127.0.0.1` bind), then §2.4's `diagram-edit` message and the row it
adds to `speaker.md` §2, then Tier 0 (`localStorage` for readers). Tier 2 is
already there from phase 6; Tier 3 is feature-detected. Sync belongs here and
not earlier: it is only worth the protocol once an edit can outlive the tab.

**Phase 9 – the workspace.** §6 figure switching and §7 copying. Late because
it is the only part that needs more than one figure in the editor's head at
once, and because paste-with-closure wants delete-with-references (phase 7) to
already exist.

**Phase 10 – steps.** A beat timeline. Selecting beat *k* shows that state;
dragging then writes a `move` op into step *k* rather than into the element's
placement. This is a mode and it has to look like one – the one place where the
same gesture means two different things, and the one place §9's guides do not
yet know what to draw.

## 11. Settled, and still open

Four questions this plan opened have been answered; they are recorded here
rather than deleted, because the reasoning is what a later reader will want.

- **Does the room ever see this? Yes, and that is fine.** Invoked from
  `audience.html` the editor is on the projection, and a room watching a figure
  get fixed is not a failure. There is no separate hidden mode to build,
  because the cockpit already has one: `V` freezes the projection, and editing
  while frozen *is* private editing (§2.4). The editor states which of the two
  it is in, in one line of chrome.
- **Does an edit sync? Yes.** As its own message, following the `video`
  precedent rather than the state snapshot, addressed by diagram id, gated by
  the freeze flag, echo-suppressed. `speaker.md` §2 gains the row. Full
  reasoning in §2.4.
- **Two-way source pane? One way, for now.** The canvas writes and the pane
  displays with the changed token highlighted. Editing text *and* dragging at
  the same time is where round-tripping editors historically come apart, and
  the pane is worth having long before it is worth having twice. Making it
  two-way later is additive: it needs a debounce, a parse-error state that does
  not destroy the canvas, and a rule for what happens to a selection whose
  element the author just deleted by typing.
- **A shared preamble: sensible, still deferred.** §7.2 carries defaults by
  copying them into each block, and that decays – change the look later and it
  is twelve edits again. The durable fix is a lecture-level default that
  several figures name, `::: diagram {unit=130x76 use=house}` against presets
  in the frontmatter. It is *additive*, so it stays available after the grammar
  freezes, which is exactly why it does not have to be decided now. **Build
  §7.2 first.** The trigger for building the preamble is concrete: if an author
  uses "apply these defaults to every figure" more than once on the same
  lecture, copying has failed and the preset has earned its keyword.

Genuinely open:

- **What is a beat when you are editing?** §9's guides describe one still
  picture. A stepped diagram has several, and dragging in beat 2 means
  something different from dragging in beat 0 (§10, phase 9). The guides
  probably need to show *both* – where the element is now and where it came
  from – and that is a drawing problem this plan has not solved.
- **How much of the closure is too much?** §7.1 pastes everything the selection
  depends on. Select one box at the end of a `below` chain and you get the
  whole chain. Correct, and possibly astonishing. The editor should show what
  it is about to bring along before it pastes, but "show" is doing a lot of
  work in that sentence.
