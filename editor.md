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

Concretely the key takes `both` (the default), `speaker`, `none`. It is a
viewer-facing frontmatter key, so it goes through the machinery that already
exists for those: add it to `VIEW_DEFAULT_SPEC` in `build.js` and to
`VIEW_DEFAULTS` in `lint.js`, in one commit, and an unknown value then **fails
the build** rather than being ignored – which is the rule that already applies
to `theme` and `collapse`, and for the same reason. A typo here is otherwise
invisible: the lecture still builds and still looks right, it has just quietly
lost its editor.

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
  That refusal is also what makes two open tabs safe: whichever writes second
  is working against a range that no longer exists, and gets told so instead of
  corrupting the file.

`--serve` needs no separate work – it is the same WebSocket, so `--watch
--serve` gets write-back over http exactly as `--watch` does over `file://`.

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

## 3. The grammar

### 3.1 What it already promises

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

### 3.2 The one thing it gains: lecture-wide defaults

A lecture's figures should look like each other, and today the only way to say
so is to repeat the same `default` lines in every block. That decays: change
the look and it is twelve edits. **Build this before the editor**, because the
editor's answer to "make these figures match" should be one patch, not twelve
(§7.2), and because it is a small self-contained feature that the editor then
gets to expose rather than work around.

**A frontmatter key holding `default` statements, in the same language:**

```yaml
diagram-defaults: |
  default box       {.tone-2} w 1.0
  default text      {.small .muted}
  default container pad 0.4
  default box @dec  {.round} w 0.48
```

Deliberately **not** a named-preset system (`use=house`). A single lecture-wide
set adds one frontmatter key and one layer; named presets would add a keyword
to the diagram grammar, a lookup, a "no preset named …" error and another table
for `lint.js` to mirror – and the grammar is meant to freeze. If one lecture
ever genuinely needs two visual families, presets stay *additive* and can be
added then. The escape hatch until then is the one that already exists: a
`default` line inside the block overrides for that block.

**Precedence, in one sentence: the nearer the declaration, the stronger it is,
and in one place a tag beats the bare kind.** So four layers, most specific
last:

1. `diagram-defaults` – `default <kind>`
2. `diagram-defaults` – `default <kind> @tag`
3. the block's own `default <kind>`
4. the block's own `default <kind> @tag`
5. the element's own `{…}` and `w` / `h` / `r` / `pad`

Scope before selector, because "closer to the element wins" is the model
everywhere else here. A block that says `default box {.tone-4}` means it, even
for an element the lecture tags `@dec`.

Resolution mechanics do not change: `withDefaults()` still drops a class whose
`DG_CLASS_GROUPS` slot a more specific layer already fills, and `pick()` still
takes the most specific non-null geometry. Both simply gain a base layer.

**One carve-out, and it is the interesting decision.** Today a `default box
@tag` naming a tag no element carries is an error. A lecture-wide one cannot
work that way – it is written once for twelve diagrams and most of them will
not use `@dec`. So the rule becomes: **a block-level tag default must be used
in its block; a lecture-level one must be used somewhere in the lecture.** The
build sees every diagram, so it can check exactly that, and a typo in the
frontmatter still fails rather than sitting there doing nothing. `lint.js` sees
the whole file too, so it can mirror it.

The block is also **validated even when no diagram uses it**: anything but a
`default` statement in there is an error naming the line.

**Plumbing is short.** `parseLecture(src)` already calls `matter(src)` itself,
so the frontmatter is in hand at the one place `renderDiagram()` is invoked –
nothing has to be threaded through `buildOnce`. Parse the block once per build
with the same statement parser the DSL uses, hand the resulting layer to
`parseDiagramSource`, and let it sit under `model.defaults` /
`model.tagDefaults` as the base.

**`lint.js` needs no YAML.** After `diagram-defaults: |` it collects the
indented lines and runs the same `default`-statement checks it already has,
which is roughly fifteen lines and keeps it zero-dep.

Docs to update in the same commit, as always: `PRD.md` §4.6a, `CLAUDE.md`'s
diagram section, `CHANGELOG.md` under `[Unreleased]`, and a line in the
tutorial.

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

### 4.1 Every binding, in one place

Scattered bindings are how two of them end up meaning the same thing. This
table is the single source of truth, and it is what feeds the `?` sheet through
`renderHelpOverlay()` – the same rule the rest of the product follows, where
the help sheet is generated from one data structure rather than written twice.

| key | does |
|---|---|
| `1` `V` | select |
| `2` `R` · `3` `C` · `4` `T` · `5` `A` · `8` `I` | box · dot · text · edge · image |
| `6` · `7` | container · brace, over the selection |
| `Q` | keep the current tool active instead of falling back to select |
| `Esc` | deselect → back to select → close the editor |
| arrows · `Shift`-arrows | nudge the selection, fine · coarse |
| `Delete` | delete, after listing what refers to it |
| `Ctrl/Cmd`-`Z` · `Shift`-`Ctrl/Cmd`-`Z` | undo · redo |
| `Ctrl/Cmd`-`A` · `Ctrl/Cmd`-`D` | select all · duplicate |
| `Ctrl/Cmd`-`C` · `Ctrl/Cmd`-`V` · `Ctrl/Cmd`-`Shift`-`V` | copy · paste · paste in place (§7.1) |
| `Ctrl/Cmd`-`S` | commit: write back on Tier 1, copy to the clipboard otherwise (§2.3) |
| `Space`-drag · middle-drag · wheel | pan · pan · zoom |
| `Ctrl/Cmd` **while dragging** | suspend snapping, for when 0.5847 is meant |
| `F` | cycle the frame: slide → column → print (§5) |
| `,` `.` · `PageUp` `PageDown` | previous / next figure (§6) |
| `O` | the figure board |
| `Shift`-`V` | flip the figure strip between the bottom and right edge |
| `?` | the editor's section of the help sheet |

`E` opens the editor from a focused figure; it is a slide binding, not an
editor one, which is why it is not in this table.

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

### 7.2 Promote the defaults, do not copy them

For a consistent look the thing worth carrying between figures is usually not
the elements at all – it is the two or three `default` lines. With §3.2 in
place the editor's act for that is **"promote to the lecture defaults"**: one
patch to the frontmatter, and every figure in the lecture follows.

That is why §3.2 comes first. Without it this act would have to write the same
block into twelve places, which works once and rots on the second change.

Two things the editor owes the author here, both of which fall out of having
real layers rather than copies:

- **Show provenance.** For any resolved value the sidebar says which layer it
  came from – *"w 1.0 · from the lecture defaults"*, *"`.tone-1` · on this
  element"*. Without that, four layers is a guessing game.
- **Ask "just this one, or all of them?"** when the author changes a value that
  currently comes from a shared layer. The safe default is still the one in
  §3.1 – write it on the element – but promoting is now one click away instead
  of an edit in a file the author is not looking at.

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
dependencies of its own, so the linter can import the vocabulary tables instead
of mirroring them by hand. **Counted, there are thirteen** – `DG_KEYWORDS`,
`DG_STEP_OPS`, `DG_DEFINES`, `DG_CLASSES`, `DG_CLASS_GROUPS`, `DG_KIND_OPTS`,
`DG_BRACE_SIDES`, `DG_ALIGN_X`, `DG_ALIGN_Y`, `DG_SCALAR_X`, `DG_SCALAR_Y`,
`DG_DEFAULT_KINDS` and the anchor set – every one of which today has to be
changed in two files in one commit or the linter and the build disagree.

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
replace, or the insertion point if the attribute is absent. Every edit in §9.3
is one call to that. The signature and the full attribute list are in §11.5.

### 8.3 Three things it must not get wrong

These are not design questions; they are places where the editor touches
machinery the whole product depends on, and getting any of them wrong ships
something that looks broken rather than something that looks unfinished.

- **The chrome follows `data-mode`, never a theme name.** `applyFontTheme()`
  sets `body[data-mode]` to `dark` or `light`, and every piece of chrome in
  this product – help sheet, TOC, search panel, cockpit footer, export modal –
  keys its overrides off that rather than off individual themes. Do the same
  and the editor works in all seven themes including the two phosphor modes,
  for free. Do not do it and it ships a near-white panel on a dark projection.
  The canvas itself needs nothing: it is the compiler's own SVG, already
  painted in `--ink` / `--paper` / `--rule`, and the guide layer uses the same
  tokens.
- **Opening the editor must not disturb `revealed[chunkId]`.** That counter is
  the single piece of state the reveal, the sync, the freeze gate and the
  localStorage recovery all share. So: the editor **opens at the beat that is
  on screen**, its own beat navigation (phase 10) is editor state and writes
  nothing back, and closing leaves the slide exactly where it was. A lecturer
  who fixes a figure mid-talk must find the room's slide unchanged underneath.
- **The focus card opens the editor; it does not become it.** Clicking a
  diagram zooms it into the existing centred card, and the pencil there opens
  the editor as its own overlay above it. Reusing the card as the canvas would
  entangle the editor with `FOCUSABLE_SEL`, the pan/zoom of the card, and the
  card's own sync – three things that already work and none of which the editor
  wants to inherit.

### 8.4 Structure

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

**Phase 0 – lecture-wide defaults.** §3.2, on its own, before any of the
editor. It is a self-contained grammar-and-build feature, it is what makes
§7.2 one patch instead of twelve, and it wants to land while the diagram code
is still the freshest thing in the file. *Worth doing whether or not the editor
follows.*

**Phase 1 – the seam.** Extract `diagram-core.mjs`; `build.js` imports it;
`lint.js` imports its tables and drops all thirteen mirrored copies. No behaviour
change: all three lectures build byte-identically, `lint --strict` clean.
*Also worth doing whether or not the editor follows* – it removes a duplication
that exists today.

**Phase 2 – spans.** Every token carries `[start, end]`; add the span lookup.
Verify by round-tripping: for every element in every example diagram, replace
each attribute span with itself and assert the body is unchanged.

**Phase 3 – read-only canvas.** Ship `diagram-core.mjs` and the source payload
(§11.4) into the live views behind the `editor:` key, re-render from source at
boot, assert the result is identical to the build's own SVG (§11.8). This
cashes the whole risk of the "one compiler, two runtimes" bet early and
cheaply, and it is the phase to stop at if that bet turns out to be wrong.

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

## 11. For the implementer

Everything above is the *what*. This is what a fresh pair of hands needs before
touching a file.

### 11.1 Read first, in this order

`PRD.md` §4.6a (the grammar, and the semantics that follow from it) ·
`CLAUDE.md` § *Animated infographics* (every consequence worth not breaking,
written as a list of traps) · this file · `speaker.md` §2 (state ownership, for
§2.4) · `lectures/diagrams/source.md` (every construct, exercised).

### 11.2 Files

| file | what happens |
|---|---|
| `diagram-core.mjs` | **new.** The compiler, moved out of `build.js` verbatim. Pure JS, zero imports, zero Node APIs. |
| `editor.mjs` | **new.** The editor UI. Inlined as text into the live views, like `AUDIENCE_JS` is today. |
| `editor.css` or a `EDITOR_CSS` constant | **new.** Same treatment. |
| `build.js` | imports `diagram-core.mjs`; reads both new files as text and inlines them; emits the per-diagram source payload; the `diagram-defaults` frontmatter key; the two-way watch socket. |
| `lint.js` | imports the vocabulary tables from `diagram-core.mjs`, drops its mirrors; gains the `diagram-defaults` checks. |
| `speaker.md` | §2 gains the `diagram-edit` row. |
| `PRD.md`, `CLAUDE.md`, `CHANGELOG.md`, tutorial | §3.2, then the editor itself. |

Name things `dge*` in the editor (`dg*` is the compiler and is taken). Keep the
`// ── section ──` banner convention; `editor.mjs` will want its own.

### 11.3 The export surface of `diagram-core.mjs`

It must run unchanged in Node and in the browser, so the four Node-only leaves
come out and are injected by the caller:

```js
export function createDiagramCompiler({ resolveImage, imageAspect, warn, escapeHtml })
```

- `resolveImage(src)` – Node: the existing `fs`-based lookup. Browser: a table
  emitted alongside the diagram, `id → {href, aspect}`, because the compiled
  SVG has already resolved every asset.
- `imageAspect(abs)` – same split.
- `warn(msg)` – Node: `console.warn('[diagram] …')`. Browser: into the editor's
  message area, so a `[diagram]` warning is something the author *sees*.
- `escapeHtml(s)` – the one from `build.js`.

Everything else is pure and exported directly: `DG_KEYWORDS`, `DG_STEP_OPS`,
`DG_CLASSES`, `DG_CLASS_GROUPS`, `DG_KIND_OPTS`, `DG_BRACE_SIDES`,
`DG_ALIGN_X`, `DG_ALIGN_Y`, `DG_SCALAR_X`, `DG_SCALAR_Y`, `DG_DEFAULT_KINDS`,
`DG_ANCHORS`, `parseDiagramSource`, `dgStateAt`, `layoutDiagram`,
`dgFrameDrawables`, `renderDiagram`.

`lint.js` imports only the tables. That is what keeps it zero-dep: it must
never reach for a function that pulls the rest of the compiler in behind it.

### 11.4 Getting the source into the page

The editor needs the original block text, and the workspace (§6) needs every
block in the lecture. `renderDiagram()` is called **once**, at parse time, and
its HTML goes into all four views, so the payload rides along with it:

```html
<script type="application/json" class="psi-diagram-source" data-for="dg3-root">
  {"body": "...", "attrs": "unit=130x76", "chunk": "cbc", "width": "full",
   "range": [4211, 4530], "images": {"alice": {"href": "data:…", "aspect": 1.4}}}
</script>
```

`range` is the byte range in `source.md`, which is what Tier 1 patches (§2.3);
it is also what makes the whole round-trip verifiable. It is emitted into print
too, and that is fine – a diagram body is a few hundred bytes to a couple of
kilobytes, and stripping it per view would mean rendering diagrams twice.

The chunk's width class is already on the chunk as `data-width`; the editor
reads it for the frame (§5) rather than being told.

### 11.5 Span table

Phase 2's deliverable, and the API every edit in §9.3 goes through:

```js
spanOf(elementId, attr)   // → {start, end}  – the token to replace
                          // → {insertAt, prefix}  – if the attribute is absent
```

`attr` names one of: `gap`, `frac`, `w`, `h`, `r`, `pad`, `align`, `offset.x`,
`offset.y`, `at.x`, `at.y`, `at.x.nudge`, `at.y.nudge`, `label`, `classes`,
`tags`, `same-as`, or `line` for the whole statement. Offsets are into the
block body, not the file; the file offset is `range[0] + bodyOffset`.

`dgTokenize` already walks each line character by character, so this is
carrying an offset through rather than a second pass.

### 11.6 Things that will bite

These are all documented in `CLAUDE.md`; they are repeated here because this
phase writes ~150 KB of inlined JS and CSS and every one of them has already
cost this project a debugging session:

- **A raw backtick anywhere in an inlined template literal ends it** – even
  inside a comment. Throws at parse time. If `editor.mjs` is read from disk as
  text rather than embedded in a literal, this trap disappears, which is one
  more argument for keeping it a real file.
- **A regex backslash must be doubled inside a template literal.** Source
  `/\s+/g` emits `/s+/g`, silently. It cost a search index once. `grep -F` the
  built HTML for what was actually emitted.
- **An unterminated `/*` in an inlined stylesheet swallows every rule to the
  next `*/`.** `assertStylesheetsWellFormed()` runs on every `buildOnce`; add
  the editor's CSS to it.
- **Never discard stderr when verifying.** `node build.js … 2>&1 >/dev/null`
  hides a `SyntaxError` and leaves the *previous* HTML on disk, so the browser
  shows a stale build that looks like a change with no effect.
- **`FOCUSABLE_SEL` stays a single constant.** The editor's entry point lives
  in the focus card; audience and speaker resolve `figureIdx` against their own
  DOM and will focus different elements the moment their selectors disagree.

### 11.7 Behaviour under load and under error

- **Re-layout during a drag is per-beat, not per-diagram.** `renderDiagram`
  lays out once *per step*; a diagram with eight steps would otherwise do eight
  layouts per `pointermove`. Lay out only the beat on screen while dragging;
  re-run the whole thing on commit, which is also when the warnings refresh.
- **A parse error must never blank the canvas.** While the source is
  intermediate, keep the last good render on screen, mark the offending line in
  the source pane, and disable the write-back button. The build's own error
  shape (`errors: [{line, msg}]`) is already exactly what that needs.
- **Undo is one snapshot per gesture**, not per frame: pointerdown captures,
  pointerup commits. Snapshots are the whole block body, which for a couple of
  kilobytes is not worth being cleverer about.

### 11.8 How each phase is verified

Not "carefully" – these are the commands.

| phase | check |
|---|---|
| 1 | `node build.js lectures/*/source.md` for all three, then `git diff --stat` on the built HTML: **zero changes**. `node lint.js lectures/ --strict`. |
| 2 | A script that, for every diagram in `lectures/`, replaces every span with itself and asserts the body is byte-identical. |
| 3 | In a Playwright page, compare the editor's re-render against the SVG the build emitted, node by node. Any difference is the "two runtimes" bet failing, and it is cheaper to find here than anywhere later. |
| 4–7 | Rebuild all three lectures, `lint --strict`, and a Playwright sweep asserting no console errors, as in the diagram work already committed. |
| 8 | Two windows, one edit, assert the other re-renders; freeze, edit, assert it does not; unfreeze, assert it catches up. Patch with a stale range, assert refusal. |
| 9 | Paste the `#lifecycle` selection into an empty figure and assert the result **builds** – the closure is right exactly when the pasted block compiles with no dangling reference. Then paste it twice and assert the renames are distinct. |
| 10 | Step through the CBC figure in the editor and assert each beat's geometry matches the frames payload the build emitted for that beat. |
| §3.2 | A lecture whose `diagram-defaults` sets `w`, plus one block overriding it, plus one element overriding that: assert three different widths in the emitted SVG. A tag no diagram carries: assert the build fails. A tag *some* diagram carries: assert it does not. |

There is no test suite in this repo and this plan does not add one. The checks
above are scripts under the scratchpad, run and reported, not committed.

### 11.9 Not in scope

Touch and pen input. Mobile layout. Collaborative editing. Editing the prose of
a chunk. Any figure type other than `::: diagram` – images, video and embeds
are not editable and their focus cards get no pencil. Undo across a reload.

## 12. Settled, and still open

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

Two are left, and they are **deliberately not being decided on paper.** Both
are drawing problems whose answers depend on what the thing feels like, and a
prose proposal for either would be a guess dressed as a decision. Build up to
the phase, then show a running prototype and choose from it.

- **What is a beat when you are editing?** (phase 10) §9's guides describe one
  still picture. A stepped diagram has several, and dragging in beat 2 means
  something different from dragging in beat 0. The guides probably need to show
  both – where the element is now and where it came from – but "probably" is
  doing the work there. **What the prototype must show:** the CBC figure at
  beat 2, with one box mid-drag, in at least two candidate treatments (ghost of
  the previous position vs. a motion path vs. neither), so the choice is made
  by looking.
- **How much of the closure is too much?** (phase 9) §7.1 pastes everything the
  selection depends on. Select one box at the end of a `below` chain and you
  get the whole chain – correct, and possibly astonishing. **What the prototype
  must show:** the paste from `#lifecycle` into an empty figure, with whatever
  preview of the closure the implementer thinks best, against the same paste
  with no preview at all. If the honest answer is that no preview is needed
  because the undo is one keystroke, that is a fine answer and cheaper than
  every alternative.
