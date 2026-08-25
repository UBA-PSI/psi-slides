# The diagram editor

Spec and build plan for the graphical editor for `::: diagram`. Companion to
`PRD.md` §4.6a (the grammar) and `speaker.md` (the sync protocol it borrows).

Status: **under construction.** The grammar it edits is frozen enough to build
against – three constructs in it exist specifically so this editor can answer a
drag without destroying what the author wrote (§3). What is built and what is
not is in **§15, the build log**, which is kept at the end of this file and is
the thing to read before picking the work up again.

## 0. Where this lives, and what exists

**Read this first or the rest will not make sense.** Measured, not remembered:

- **`main` does not know `::: diagram` exists.** `git show origin/main:build.js
  | grep -c renderDiagram` → **0**. The entire diagram feature – compiler,
  runtime, CSS, the `lectures/diagrams` lecture, the linter's half – has never
  been on `main`. Branch from `main` and there is nothing here to build an
  editor for.
- **The work now lives on `claude/network-security-figures`**, which carries
  the compiler, this editor and the figure lectures together. The two branches
  this plan was originally written against –
  `claude/psi-slides-animated-infographics-eoe2yj` and
  `claude/psi-slides-diagram-editor` – have both been folded into it and are
  history. **Work there**, or on a branch off it.
- **`package.json` is still 1.0.0** and the changelog entry is under
  `## [Unreleased]`. `CONTRIBUTING.md` § *Building and releasing* bumps the
  version at release time, not during development, so there is nothing to bump.
- **Do not merge to `main`.** That is itself a publication: `pages.yml` fires
  on every push to `main` and redeploys the project site, and the tutorial –
  which now carries a `#diagram` chunk – is one of the lectures it rebuilds and
  publishes. The maintainer decides when that happens.
- `npm install` once before anything, including before building a lecture from
  a sibling content repo.
- Sanity check that you are in the right place:
  `node build.js lectures/diagrams/source.md && node lint.js lectures/ --strict`
  should write four HTML files and report zero findings.

Everything below assumes that state.

## 1. What it is for

Two audiences, one editor.

- **The author**, mid-lecture-writing, who has a figure that is nearly right
  and does not want to count grid cells. Today that means editing text, saving,
  and looking at the rebuilt tab. The editor closes that loop to one gesture.
- **The reader** of a built `audience.html` – a student – who wants to take a
  figure apart, move a box, and see what happens. This is the reason to ship it
  inside the output rather than as a separate tool.

And one thing it is emphatically **not**: a drawing program. It has no
freehand, no curves, no arbitrary colours, no free font choice. The class
vocabulary is a closed enumeration – 40 names, 32 of them in eleven slots – and the
editor exposes exactly those and nothing else. Anything
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

### 3.2 What it gains, one: lecture-wide defaults

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

### 3.3 The visual vocabulary, audited

Several things the editor needs turn out to be in the grammar already, and it
is worth saying which, because the answer to "can I do X?" is mostly *yes, the
editor just has to offer a control for it.* Verified against the code, not from
memory:

| want | today | needed |
|---|---|---|
| a plain straight line | **already works**: `edge 0.4,1 -- 3,1` – both endpoints may be bare coordinates, and `--` drops the head | a tool |
| solid / dashed / dotted | none / `.dashed` / `.dotted`, one class slot | a three-way control where "solid" means *remove both* |
| accent or dimmed ink | `.accent` / `.muted` | a control |
| square or rounded box | `.sharp` / `.round` | a control |
| three font sizes | `.small` · none · `.large` – 0.8 / 1.0 / 1.22 of `DG_FONT` | a control |
| monospace | `.mono` | a control |
| box fill: canvas, light, medium, accent | the default is `fill: var(--paper)`, then `.tone-1` … `.tone-4`; `.tone-4` already inverts its own text to `--paper` | a swatch row |

Four things are genuinely missing, and they are the grammar half of phase 0:

- **A transparent fill.** The default is opaque paper and `.bare` removes the
  *stroke*, not the fill, so there is no frame with a see-through interior.
  **`.clear`**, into the existing fill slot: `['tone-1'…'tone-4', 'clear']`.
- **An upright serif.** `--dg-serif` exists but is reachable only through
  `.hand`, which also forces italic *and* the accent colour. **`.serif`**, plus
  a new family slot `['mono', 'serif', 'hand']` – which also fixes a latent
  conflict, since `.mono .hand` on one element fights today with nothing to
  arbitrate.
- **A background behind free text.** Confirmed by inspecting the output: a
  `text` element emits no `<rect>` at all, so `{.tone-2}` on one does nothing.
  The emitter should draw the measured label box, padded, whenever a `text`
  carries a fill class. One mechanism, two defaults: a **box** defaults to
  paper, a **text** defaults to `.clear`. That is exactly how they already
  look, so nothing existing changes.
- **Padding from the text to the border.** `DG_PAD_X = 13` / `DG_PAD_Y = 9` are
  constants. This needs no new keyword: **`pad`** already means "how far the
  outline sits from what it encloses" on `container` and `brace`, and box
  padding is the same sentence. Extend `DG_KIND_OPTS`: `box: [w, h, pad]`,
  `text: [w, h, pad]`. One number in grid units, uniform on both axes; the
  *default* stays the asymmetric px pair, because 13/9 is typographic taste
  rather than a scale.

And one that is new behaviour rather than a new option:

- **Type that fits the box.** Today the box sizes itself to the label. The
  other two readings both need an explicit `w` (or `same as`) to be meaningful:
  **`.fit`** picks the font size so the label fills the available box in both
  directions, **`.shrink`** only ever scales down. Group `['fit', 'shrink']`;
  neither, and the box grows to the text as now. `dgMeasure` already estimates
  a width for a given size, so this is a solve for the size rather than new
  machinery, clamped to 0.6–1.5× of the element's resolved base size so a long
  label cannot become unreadable and a short one cannot become a poster.

  **Be honest about the error term.** `CLAUDE.md` records that text width is
  *estimated* from a per-character table, tuned deliberately generous. Auto-fit
  compounds that: the chosen size will run slightly small. That is the safe
  direction – small still fits – and it is the price of having no browser at
  build time. Say it in the docs rather than discovering it in a lecture.

Two traps in that list, both of which look like one-line changes and are not:

- **A text background is not just a `<rect>`.** Emitting one changes the
  element's extents, and the viewBox is computed from `ext` in
  `dgFrameDrawables` – a label that was a bare glyph run is now a padded box,
  so a text at the edge of a figure will change the frame. Emit the rect
  *through* the same `ext` bookkeeping `labelBox()` already does rather than
  beside it. And the CSS rule `.psi-diagram .dg-text rect { display: none }`
  has to go or become conditional; today it is moot only because the emitter
  never produced one.
- **`.fit` and `same as` are ordered.** `sizeOf()` is documented as depending
  "only on the element's own label and class, never on placement", which is
  what lets sizes settle before the DAG walk. `.fit` needs the element's `w`,
  which is fine – unless that `w` came from `same as X`, and then it needs X's
  box, which `sizeOf` reads out of `boxes`. That already works because
  `same as` is a dependency edge, but it means **`.fit` must be solved after
  the `same as` copy, not before it**, and a `.fit` on an element with neither
  `w` nor `same as` has nothing to fit and should say so rather than doing
  nothing.

Two tidy-ups while in there, both the same class of thing this grammar keeps
closing:

- `.bare` and `.thick` belong in a stroke-weight slot of their own. They are
  not in any `DG_CLASS_GROUPS` row today, so a `default box {.thick}` and an
  element's `{.bare}` stack instead of displacing.
- `.tone-4` with `.accent` is accent ink on an accent fill: invisible, legal,
  and decided by stylesheet order. The inversion rule has to win over
  `.accent text`, and `lint.js` should warn on the pair – the same warning it
  already gives for two classes from one slot.

That is **five new classes** (24 → 29, `.paper` joined them once the swatch
row showed the hole – see §15), two new group rows, one keyword
extended to two more kinds, and one emitter change. No new statement, no free
colour, nothing that opens the vocabulary. §1's promise survives.

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
| `9` | `L` | line | `edge <x,y> -- <x,y>` |
| `8` | `I` | image | `image <name> <asset> <placement>` |

`5` and `9` are one statement and one tool; what differs is the gesture. Drag
between two elements and it writes `edge a -> b`; drag between two empty points
and it writes `edge 0.4,1 -- 3,1`, which the grammar already accepts and which
is how a plain straight line gets drawn. `9` exists so a line can *start on top
of a box* without snapping to it – a real need, and otherwise unreachable.

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

### 4.1 Tags are a first-class thing in the UI, or they are nothing

Tags replaced `group` in the grammar, and the plan up to this point mentioned
them twice in passing. That is a gap, because membership is the one piece of
structure that is **completely invisible in the drawing** – an `align` set at
least shares a coordinate you can see, but `@creation` looks like nothing at
all until a step addresses it.

Six places tags have to show up:

- **In the sidebar**, as chips on the selection, add and remove inline. Adding
  one to a multi-selection writes `@name` into every selected element's
  attribute tail – which *is* the replacement for the old `group` statement,
  now as a gesture instead of a line somewhere else in the file.
- **As a legend**: every tag in the figure with its member count. Hover
  highlights the members, click selects them. This is §9.1's principle applied
  to membership rather than to geometry.
- **Highlighted differently from an `align` set.** A tag is not geometric, so
  it must not be drawn as a line: a tinted halo behind the members, or a
  bracket in the margin. Borrowing the alignment treatment would say something
  false about what the tag does.
- **As the selection unit for steps** (phase 10). `show @creation` is how real
  diagrams are stepped – the lifecycle figure addresses two tags instead of
  fourteen names – so the step editor targets tags first and elements second.
- **In the provenance line** (§7.2), because a tag default is one of the four
  layers a resolved value can come from.
- **Renamed everywhere at once.** Renaming a tag rewrites every `@name` in the
  block plus every `default <kind> @name` that targets it. Mechanical, and safe
  because element and tag names are now restricted to letters, digits, `_` and
  `-`.

One refusal worth building in: **the editor must not offer to delete a tag that
a `default` still targets** without saying so, since the build's own rule is
that a tag no element carries is an error. Offer to drop the default with it.

### 4.2 Every binding, in one place

Scattered bindings are how two of them end up meaning the same thing. This
table is the single source of truth, and it is what feeds the `?` sheet through
`renderHelpOverlay()` – the same rule the rest of the product follows, where
the help sheet is generated from one data structure rather than written twice.

| key | does |
|---|---|
| `1` `V` | select |
| `2` `R` · `3` `C` · `4` `T` · `5` `A` · `8` `I` | box · dot · text · edge · image |
| `9` `L` | line: the edge tool with both endpoints forced to coordinates |
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
| `Alt` **while dragging** | leave the `align` / `spread` set at once, without pulling clear of it |
| double-click a waypoint | take it out of the edge's `via` clause |
| drag over another element | four chips appear; release on one to dock this element to that side of it |
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

#### 9.2a What of that is built, measured rather than assumed

§9.2 is the design and it is ahead of the code, so here is the difference,
checked by driving the built editor over ninety-nine figures in four lectures
rather than by reading it.

**Built, and working on every construct:** the selection's own relation ticks,
redrawn live during a drag so a `gap 0.55` label counts up to `0.85` under the
pointer; the strained `align` / `spread` axis, drawn through the set with the
master marked and labelled with what it would take to break out (*"pull 0.29
more or hold Alt"*); the four docking chips; the endpoint preview on an edge;
the marquee. Snapping is the 0.05-cell grid plus the three alignment words on a
placement's cross axis, and `Ctrl` / `Cmd` suspends it – measured on one drag as
0.79 free against 0.85 snapped.

**Also built, and this is the part §9.2 was written for:** the four
neighbour guides. Each proposes a *statement*, and is drawn only when it is what
the editor is about to write.

| what lights up | what it writes |
|---|---|
| another element's centre or edge line | `at ver2.left,def.top` – a ref coordinate, on one axis or both |
| the same gap a sibling already has | that gap's number exactly, marked on the sibling that has it |
| the line joining two elements | `between n1,g1`, and along it `frac` |
| equal spacing across three or more | appends `spread y a, b, c` |

Two rules hold that together and are worth not losing. **The candidate lines are
exactly `DG_SCALAR_X` / `DG_SCALAR_Y` on other elements, matched against the
dragged element's centre**, because that is where `at X,Y` puts it – "left edges
flush" is deliberately not offered, since writing it means `at m0.left+<half my
width>`, a number that dies on the next resize. And **a snap that lands the
element back where it started still writes**, because the author asked for the
relation, not for the displacement; without that the status bar named `sw.cy`
and the source kept a bare `0`.

Priority is *how much of the drag the guide explains, then how little source it
rewrites*: both axes as a ref coordinate, then `between`, then one axis as a ref
coordinate, then a sibling's gap, then `spread`, then the pre-existing align
word and the 0.05 grid. The winner claims its axes and anything that would move
a claimed axis is dropped – which is also how two candidates on *different* axes
combine into `at c1.cx,m0.cy`, the construct §9.2 calls the least discoverable
in the grammar.

Measured on the densest figure in the tree (`ns-b63`, 110 boxes), the whole
`pointermove` handler runs 6.15 ms against 6.24 ms before; `dgeGuideSnap` alone
is 3–9 µs. The per-gesture caches on `ctx` are what keep it there.

**Built since, and the reason is one sentence:** the guide layer is a property
of *dragging*, not of one gesture. It was help that arrived at beat 0 while
moving and nowhere else, and inconsistent help is worse than none - an author
learns "dragging writes my relations for me", it silently stops holding, and
they go back to typing. Every drag that can produce a relation now offers one,
and each gesture has exactly one relation-shaped answer in the grammar:

| gesture | what it writes |
|---|---|
| move at a beat | the same four guides, as `move x to <relation>` |
| resize, edge handle | the number a sibling already carries, bracketed on that sibling |
| resize, corner handle | `same as X`, when both dimensions land on one element together |
| waypoint | `via A.p,<n>` - a bare component becomes a reference, per axis |
| endpoint | already docks to a name; a drop inside a plot keeps the plot's units |

The split between the two resize handles is the one decision worth keeping.
`same as` copies *both* dimensions, so offering it from a width-only drag would
change the height as well - a semantic jump the author did not ask for. The
grammar has no "w equals A's w" relation, so an edge handle can only offer a
number, and `same as` belongs to the corner, which is already about both axes.

**One row a beat cannot offer: `spread`.** It has no step form, so writing one
would change the *opening* picture from inside a gesture that promises not to.
Every other guide has one, because `move … to` takes any placement.

### 9.3 Which token a drag rewrites

An element's position comes from exactly one placement expression, and the
editor's job is to decide which token a drag belongs to:

| Placement | drag on the main axis | drag on the cross axis |
|---|---|---|
| `at X,Y`, numeric | rewrite that number | rewrite that number |
| `at X,Y` with `ref.prop` | rewrite the nudge (add one if absent) | same |
| `right of A` / `left of A` | rewrite `gap`, or **the direction word** once the drag has carried it past A | snap to the nearest `align top/middle/bottom`; past a tolerance, write `offset 0,dy` |
| `below A` / `above A` | rewrite `gap`, or **the direction word** once the drag has carried it past A | snap to `align left/center/right`; past a tolerance, `offset dx,0` |
| `between A,B` | rewrite `frac` | rewrite `offset` |
| coordinate owned by `align x\|y` | – | hold, then leave the set |
| coordinate owned by `spread x\|y` | – | hold, then leave the set |

The last two rows are the interesting ones. That axis is not the element's to
move – **until the author insists.** Dragging a follower against its shared
axis holds it on the axis, draws the axis it is held by, and names the way
out: *"y is held by `align y middle` on line 12. Pull 0.31 further, or hold
Alt, to drop `ident` from it – or drag `reg` to move the whole row."* Past
`DGE_BREAK_CELL` (half a cell), or with Alt held, the element is **dropped
from the statement** and the drag goes through; if what is left is too short
to be a statement, the line goes with it.

This started life as a flat refusal that named the line and told the author to
go and make that edit by hand. The information was right and the answer was
wrong on two counts. A set you cannot leave by dragging is a set the canvas
cannot express, so the only way out was the text – which is the thing this
editor exists to spare people. And "drop `ident` from that line" is *precisely*
the edit it should be making. The threshold is what keeps the trade honest:
without it a row of boxes dissolves under an ordinary nudge, so leaving has to
be something you meant. Dragging the master still moves everyone, which is
what the statement means.

Two consequences worth keeping. The hold is **not painted as an error** – a
set doing its job is not a failure, and only a genuine refusal gets the error
colour. And a diagonal drag against a held axis now reports both halves: it
used to move x and say nothing at all about why y stayed where it was.

**A drag can change which side, but not which element.** Push a box that sits
`below b` up through b and the statement becomes `above b gap 0.4`: the
dominant axis of the centre-to-centre vector picks the word, the same question
`dgAutoAnchor` asks about an edge's endpoint. The threshold is the reference's
own edge, which is the hysteresis for free – to change sides you have to drag
the element right through the thing it is measured from, so no ordinary nudge
can flip it. Before this the gap was clamped at zero and the drag simply stopped
dead, which meant re-docking was only reachable by editing the text.

Which *element* it is measured from, and which *kind* of relation it is, are
controls rather than gestures, in the placement pane. Two reasons. Guessing a
new reference from a drop position is a large semantic change made on a
guess – the element the author meant is often not the nearest one. And
`between a,b` has no gesture at all: nothing about dragging one box says
"halfway between those two". The pane reads the placement back as the three
things it says – kind, reference, distance – so it is also the answer to
"what is holding this here", without having to read the source pane.

Two more rules of the same shape:

- **Resizing an element that says `same as X`** drops the `same as` and writes
  explicit `w`/`h`. Same reading as the tag default: a drag means "just this
  one". The corner handle is the way back: dragged until both dimensions land
  on another element together, it writes `same as X` and says so. So the two
  directions are symmetric and neither is a trap - a drag out of a size
  relation is one gesture, and a drag back into one is the same gesture with a
  guide under it.
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

**Phase 0 – the grammar, finished.** §3.2 (lecture-wide defaults) and §3.3
(`.clear`, `.serif`, a background behind free text, `pad` on boxes, `.fit` /
`.shrink`, and the two class-slot tidy-ups), on their own, before any of the
editor. Both are self-contained build features, both want to land while the
diagram code is still the freshest thing in the file, and §3.3 in particular
has to land **before** the editor rather than alongside it: an editor whose
swatch row has a hole in it teaches the hole. *Worth doing whether or not the
editor follows.*

Do the two halves as two commits. §3.2 touches resolution order; §3.3 touches
the emitter and the class tables. Bisecting a regression across both at once is
the kind of afternoon this repo has already spent once.

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

**Phase 11 – bringing a picture in.** §14. Last, because it is the first
feature that writes a file rather than a range of one.

**Phase 10 – steps.** A beat timeline. Selecting beat *k* shows that state;
dragging then writes a `move` op into step *k* rather than into the element's
placement. This is a mode and it has to look like one – the one place where the
same gesture means two different things, and the one place §9's guides do not
yet know what to draw.

## 11. For the implementer

Everything above is the *what*. This is what a fresh pair of hands needs before
touching a file.

### 11.1 Read first, in this order

§0 of this file (where the code actually is) · `PRD.md` §4.6a (the grammar,
and the semantics that follow from it) ·
`CLAUDE.md` § *Animated infographics* (every consequence worth not breaking,
written as a list of traps) · this file · `speaker.md` §2 (state ownership, for
§2.4) · `lectures/diagrams/source.md` (every construct, exercised).

### 11.2 Files

| file | what happens |
|---|---|
| `diagram-core.mjs` | **new.** The compiler, moved out of `build.js` verbatim – *after* phase 0, so the move is a pure move and §3.3's emitter change is not tangled into it. Pure JS, zero imports, zero Node APIs. |
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

Three more tables joined that list once the expanding statements arrived, and
the panel reads all three rather than hard-coding what a statement takes:
`DG_SHAPE_CLASSES` and `DG_POINTED` (which outlines exist and which of them
have a point to aim), `DG_LIST_OPTS` (options whose value is a comma list –
`col`, `emph`, `calm` – so a single-number parser must not read one) and
`DG_BARE_OPTS` (bare closed words a statement accepts, `{bars: ['stacked',
'horizontal'], sequence: ['unnumbered']}`).
So do the generated-name helpers, which are the one place the compiler and
anything reading its output have to agree exactly: `dgBarName`, `dgTickName`,
`dgBaseName`, `dgCellName`, `dgPlotName`, `dgRowTag`, `dgColTag`,
`dgLaneName`, `dgLaneCapName`, and a `sequence`'s ten: `dgLifeName`,
`dgMsgName`, `dgMsgNumName`, `dgMsgSubName`, `dgNoteName`, `dgMsgTag`,
`dgMsgsTag`, `dgNotesTag`, `dgActorsTag`, `dgLivesTag`.

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

**`range[0]` needs care, and it is an easy off-by-N.** `parseLecture` walks
lines and tracks no offsets at all today, and it reads its input from
`matter(src)`, which has already **stripped the frontmatter** – so an offset
into `content` is not an offset into `source.md`. Capture the frontmatter's
byte length once (`src.length - content.length`, taken before parsing) and add
it. Getting this wrong does not throw; it writes the patch into the wrong part
of the file, which is exactly why the watch server re-reads and checks the
range before splicing (§2.3).

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
| §3.3 | One figure using every new class, screenshotted in all seven themes – `.clear` must show what is behind it, `.tone-4` text must stay legible, `.serif` must not be italic. `.fit` on a box with an explicit `w`: assert the emitted `font-size` differs from `DG_FONT` and that the measured label still fits. `pad 0.3` on a box: assert the rect grew by `0.6 × unit` in both axes. `lint --strict` on `{.tone-4 .accent}`: assert the warning. |

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

Two were left, and they were **deliberately not decided on paper.** Both are
drawing problems whose answers depend on what the thing feels like, and a prose
proposal for either would have been a guess dressed as a decision. Both phases
are now built, so both can be answered from a running prototype – see §13.

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

## 13. The two open questions, answered from the prototype

Both are built, so both can be looked at rather than argued about. Two
concrete proposals each, the recommendation first, and what would change my
mind.

### 13.1 What is a beat when you are editing?

**Built and shipped as-is: the mode is loud, and the guides show both.** At
beat *k* the frame carries an accent outline, the status bar's rule turns
accent, the beat strip is always visible on a stepped figure, and a drag
writes `move <id> by dx,dy` into step *k* while saying so in the status bar –
*"into step "chain" – the opening picture is untouched"*. The element that
moved gets a **dashed ghost** at its beat-*k*−1 position and a **dotted motion
path** from that ghost's centre to its own. Both treatments are drawn together
because the prototype had to show both; which of the three survives is the
decision below, and `DGE.beatGuide` (`'ghost'` / `'path'` / `'both'`) switches
between them in one line.

Looking at it on the CBC figure at beat 2, with `m1` dragged 0.35 × 0.5:

**Proposal A – ghost only. Recommended.** The dashed outline says *this is
where it was* in the vocabulary the diagram already uses for a soft edge, it
sits exactly where the eye will next look when Space runs the step backwards,
and it costs one rect per moved element. What the motion path adds over it is
the *direction*, and the direction is already unambiguous from two rectangles
and a step that only ever plays forwards. On the CBC figure the paths also
cross three arrows and one container border, which is a lot of ink for a fact
you can read off the ghost. Concretely: default `DGE.beatGuide = 'ghost'`, drop
`.dge-motion`, keep the class for a figure that ever needs it.

**Proposal B – ghost plus path, but only for the element under the pointer.**
Keeps the direction cue where it is actually being used – during a drag – and
takes it away from every *other* element the step happens to move, which is
where the clutter comes from. One extra condition in `dgeDrawBeatGuides`:
draw the path only when `id` is in `DGE.selection`. This is the right answer if
the maintainer, looking at a figure where a step moves five elements at once
(`#lifecycle` beat 2 is the case), finds the ghosts alone ambiguous about which
ghost belongs to which box.

**Rejected: neither.** A `move` is genuinely invisible without one of the two –
the picture at beat 2 is just a picture, and nothing on screen says which parts
of it are the step's doing. That is the failure the whole mode exists to avoid.

**What would change my mind about A:** a figure whose step moves elements
*through* each other, where two ghosts and two boxes read as four boxes. I did
not find one in `lectures/diagrams`; if one turns up, B is already written.

### 13.2 How much of the closure is too much?

**Measured, not guessed.** Selecting `acl` – one box at the end of a `below`
chain in `#lifecycle` – and copying gives a closure of **9 elements over 15
lines**: the whole chain, its `container`, and the `default … @tag` block its
tags use. Pasted into a figure with one box, it compiles. Pasted twice, it
compiles again and the 25 names are distinct.

So the closure *is* astonishing – nine elements from selecting one – and the
question is only whether that needs a preview.

**Proposal A – no preview, name the number. Recommended.** The status bar
already says what happened: *"15 line(s) copied – the selection and everything
it depends on"*, and on paste *"pasted 15 line(s), 9 renamed to avoid a
collision"*. Undo is one keystroke and one snapshot. A preview would be a modal
in the middle of a two-keystroke gesture, and the thing it would show – nine
outlines – is exactly what the canvas shows a tenth of a second later anyway.
This is the answer §12 hoped for, and it is cheaper than every alternative.
**It is what is built.**

**Proposal B – highlight the closure on copy, for as long as it stays on the
clipboard.** Not a modal and not a step in the gesture: the moment
`Ctrl`-`C` lands, the elements that came along but were not selected get the
tag-halo treatment (a tinted ground, already implemented, already meaning
"these belong together"), and it fades when the selection changes. The author
sees the extra eight without being asked a question, and nothing blocks. Ten
lines: keep `DGE.clipboard.names` in the guide layer's draw and give the
non-selected members `.dge-taghalo` at half opacity.

I would build B if the *paste* were the surprising half, but it is not – the
paste lands where the pointer is and is immediately visible. The surprise is on
the **copy**, which is where B puts its answer, and A puts a sentence. Both are
honest; A is already there and costs nothing.

**Rejected: asking.** "Also copy the 8 elements this depends on? [Yes] [No]"
has no useful No: without them the pasted block does not compile, so the
question is a dialog with one answer.

**What would change my mind about A:** an author reporting that they pasted
into the wrong figure and did not notice, because the closure was large enough
to look like the figure had always been that way. B is the cheap fix and the
halo already exists.

## 14. Bringing a picture in · **built**

Phase 11, and the first feature that writes a **file** rather than a range of
one. That is a different permission with a different failure mode, which is why
it came after everything else.

Built as specified below, with three things the plan did not foresee. They are
in §15 under *Phase 11*; the shortest of them: **`.paper` had to be invented on
the way**, because the swatch row's first entry was the empty class, so
"paper" meant "whatever a default says" and a free `text` could not have a
ground at all – which is the entire reason to give a label one.

### 14.1 What is there today, and why it is a dead end

The image placer takes `Object.keys(DGE.fig.images)[0]` – the first asset any
diagram in the lecture happens to reference – with no chooser, and refuses
outright when there is none:

> *This lecture has no diagram image to place. Add one with an `image` line
> first.*

So a figure cannot get its first picture from inside the editor at all, and a
lecture with two assets can only ever place one of them.

### 14.2 The constraint that shapes the whole feature

`image <name> <asset>` resolves **at build time**, against `assets/` beside
`source.md`. A browser can read the bytes of a picked file; it cannot put them
where the next build will look. **A picker that only reads is a promise the
medium cannot keep** – the canvas would show the picture and the next rebuild
would show a missing figure.

So the design is not "add a file dialog". It is: *what happens to the bytes.*

**The primitive is `<input type="file">`, not File System Access.** For
*reading* a picked file, a plain file input has always been enough – every
browser, `file://` included. §2.3's Tier 3 caveats are about *writing* and
about *persisting a handle*, and neither applies here. Worth saying, because
the Tier 3 discussion makes the FSA API sound necessary and for this it is not.

### 14.3 Under `--watch`, the loop closes

The editor reads the file and sends it on the socket that already carries
patches: `{type: 'asset', nonce, name, bytes}`. The server writes
`assets/<name>.<ext>` beside `source.md`, and *then* the editor sends the
`patch` that adds `image <id> <name> <placement> w 1`.

**That order is load-bearing and easy to get backwards.** `fs.watch` is on
`source.md`, so writing the asset alone rebuilds nothing; the patch is what
kicks the build, and by then the file has to be on disk or the rebuild fails on
an asset it cannot find.

Five refusals on the server, all refusals rather than sanitisation, because a
sanitised path is a path someone reasoned about wrongly:

- The destination is always `assets/` beside the source. A `name` containing a
  path separator or `..` is **refused**, not cleaned.
- The extension must be one the resolver already searches – `svg`, `png`,
  `jpg`, `jpeg`, `gif`, `webp`.
- Over the 2 MB inline cap, refuse **in the dialog**. `assertInlinable()` would
  hard-fail the very next build, and failing the build an author is watching is
  a worse experience than declining the file. Name `--optimize-images` in the
  message; it converts to WebP q92 and measured 12–18% of the original on real
  lecture assets.
- An existing `assets/<name>` that differs is never silently overwritten: ask,
  offering rename or replace.
- The same nonce as `patch`, and the same 127.0.0.1 bind.

### 14.4 Without a watch server, say so plainly

The editor can show the picture at once from a blob URL, but the line it writes
will not resolve at the next build. Do both of these rather than pretending:

- Write `image <id> assets/<filename> <placement>` – an **explicit path**,
  which the grammar already accepts – and say: *"copy `<filename>` into
  `assets/` beside source.md; the line is already correct."*
- Where `showSaveFilePicker` exists, offer to save it into `assets/` in one
  step. Feature-detected, never required.

Meanwhile the canvas shows the blob, carrying the same "not yet on disk" marker
that Tier 0's reader edits use.

### 14.5 What it must not do

**Never inline a `data:` URI into `source.md`.** The `image` statement takes a
path or a URL and would probably swallow one, which is exactly what makes it
tempting. A 40 KB base64 blob in a lecture source is unreadable, undiffable,
and breaks the property the whole editor is built on – that a `::: diagram`
block is something a human could have typed. The build already inlines assets
into the *output*; the source stays a reference. That separation is the reason
`--no-inline-images` can exist at all.

### 14.6 The picker, which is most of the value

Even with no new file, the chooser is the missing part:

- every asset the payload already carries, with a preview, since those bytes
  are inlined already;
- under `--watch`, **every file in `assets/`**, listed by asking the server –
  the socket is two-way now, so this costs no payload and no build change;
- the file picker as the last row.

Which also retires the dead end in §14.1: "this lecture has no diagram image"
stops being a refusal and becomes the first row of a dialog.

One line of honesty in that dialog, because it is the trade the docs already
make: **a vector asset follows the theme, a raster does not.** Picking an SVG
gets a picture that re-inks with `A`; picking a PNG gets one that keeps its own
colours in every theme. Say which one the author just picked.

## 15. Build log

Written while building, not afterwards. Each entry says what landed, what it
cost, and what the next pair of hands needs to know that the plan above does
not already say. The plan is the *what*; this is what actually happened.

### Phase 0a – lecture-wide defaults · **done**

`diagram-defaults:` in the frontmatter, exactly as §3.2 specifies. Four
layers, scope before selector, and the lecture-level tag rule one scope wider
than the block's.

What it touched: `dgReadDefault()` (the `default` statement, factored out of
`parseDiagramSource` so the frontmatter and the block cannot drift),
`parseDiagramDefaults()`, `dgDefaultLayers()` – the one place the four-layer
order is written down – and the three resolution sites that used to walk
`model.tagDefaults` / `model.defaults` by hand (`withDefaults`, `sizeOf`'s
`pick`, the container/brace `pad` settling). `lint.js` gained
`lintDefaultStatement()` and `collectDiagramDefaults()`.

Three things worth knowing:

- **The three resolution sites had each written the layer order out
  separately.** Adding a fourth layer to three hand-rolled loops is how they
  would have disagreed; `dgDefaultLayers` exists for that reason and is what
  the editor's provenance line (§7.2) will read.
- **The lecture-wide tag rule needs evidence the compiler does not have.**
  `renderDiagram` sees one block, so it cannot know whether `@dec` is used
  somewhere else. `dgLectureTags` accumulates while the blocks compile and
  `parseLecture` rules on it after the last chunk – which is also the only
  reason that check is in `parseLecture` rather than beside the others.
- **`lint.js` reads the key without YAML**, per §3.2: `collectDiagramDefaults`
  scans for `diagram-defaults:` followed by `|` or `>` and takes what is
  indented under it, dedenting by the first line's indentation. Fifteen lines,
  still zero-dep.

Verified (§11.8's row for §3.2, run, not asserted in prose):

- a lecture whose `diagram-defaults` sets `w 1.0`, a block overriding with
  `w 0.5`, an element overriding with `w 2.0`, plus a `@dec` tag default at
  `w 0.4` → emitted widths 100 / 50 / 200 / 40 px at `unit=100x60`, and the
  block's bare `default box` beating the lecture's `@dec` one (scope before
  selector, both directions).
- `default box @nobody` with no diagram carrying `@nobody` → build fails,
  naming the line and listing the tags the lecture does use.
- the same tag carried by a *different* diagram in the same lecture → builds.
- `box a "hello"` inside the key → build fails naming the line.
- all four in `lint.js` too, with the frontmatter line numbers right.
- all three lectures rebuild; `lectures/tutorial/*.html` unchanged by the
  refactor, which is what says the four-layer rewrite was behaviour-preserving
  for lectures that use none of it.

### Phase 0b – the visual vocabulary, finished · **done**

§3.3 in full: `.clear`, `.serif`, a ground behind free text, `pad` on boxes
and texts, `.fit` / `.shrink`, and the two class-slot tidy-ups. 24 classes →
28, and every one of them is now in a slot.

The two traps §3.3 predicted were both real, and one more was not predicted:

- **A text ground is not just a rect.** It changes the element's extents, so
  it goes through `put()` like every other drawable and `extentsOf` counts it
  in the viewBox. Emitting it beside the bookkeeping would clip a padded label
  at the edge of a figure.
  There is a third case the plan did not name: **a `style` step can add a
  tone**, and a geometry key present in only some frames leaves the rect
  stranded in the others – the runtime only writes the keys the target frame
  carries. So the rect is emitted in every frame of any text that carries a
  tone in *any* of them, and the class decides whether it paints. The two CSS
  rules that make that work are `.dg-text > rect { stroke: none }` and a
  `:not()` chain on the four tones for the fill; the old
  `.dg-text rect { display: none }` is gone.
- **`.fit` and `same as` are ordered.** Solved after the copy, which is safe
  because `same as` is already a dependency edge. `dgFitFont` is a ratio, not
  a search – `dgMeasure` is linear in the size – clamped to 0.6–1.5×.
- **Not predicted: a `.fit` element's *label variants* each need their own
  solve.** A `label` step swaps pre-rendered `<g>`s, so every variant has to
  have been typeset at the size that makes *its* string fill the box. The
  frame carries `fits: id → [w, h, padX, padY]` and the emitter re-solves per
  variant.

Two smaller decisions:

- **`pad` is measured in `uh` on both axes**, matching what `container`
  already did, rather than `uw` horizontally. The alternative would make one
  word mean two distances depending on which statement it sat on.
- **A `w` on a free `text` used to parse and do nothing.** `DG_KIND_OPTS`
  listed it, `sizeOf` ignored it. `.fit` on a text needs it, so it now means
  what it says – which is also the silent no-op this DSL keeps closing.

Verified (§11.8's row for §3.3):

- one figure carrying every new class, screenshotted in all seven themes at
  1440×810: `.clear` shows the ground through it, `.tone-4` text stays legible
  (black on the accent fill in every theme), `.serif` is upright and `.hand`
  is still italic and accented.
- `.fit` on a box with `w 1.5 h 0.55` emits `font-size="16.00"` against
  `DG_FONT` 15; `.shrink` on the same box with a label that does not fit emits
  `13.31`. Both labels measure inside their boxes.
- `pad 0.3` at `unit=130x76`: rect 96.45 × 64.35 for a label measuring
  50.85 × 18.75 – exactly `2 × 0.3 × 76` added on both axes.
- `lint --strict` on `{.tone-4 .accent}` warns, and on `{.thick .bare}` too,
  which is the new stroke-weight slot doing its job.
- a box with `.fit` and no width fails the build naming the line.
- all eleven diagrams in `lectures/diagrams` emit **byte-identical SVG**
  before and after, and the tutorial's built HTML changes only in the
  stylesheet. Nothing existing moved.
- Playwright sweep over `lectures/diagrams/audience.html` in all seven
  themes: no console errors.

**Not done, deliberately:** `lint.js` does not mirror the
"`.fit` needs a width" check. Deciding it means resolving `w` through four
default layers and `same as`, which is the compiler's job; the build
hard-fails with the line. Same reasoning as the `fonts:` check, and it is
recorded in `CLAUDE.md` so the next person does not add it.

### Phase 1 – the seam · **done**

`diagram-core.mjs`, 2,100 lines, pure JS, zero imports, zero Node APIs.
`build.js` imports it for the build; `lint.js` imports its tables and has
dropped every mirrored copy. build.js went 11,386 → 9,664 lines.

**The plan said four injected leaves; there are five**, and the fifth is the
one the plan itself implies. `resolveImage`, `imageAspect`, `warn` and
`escapeHtml` came out as written. But `dgImageEl` also *splices a vector
asset inline as a nested `<svg>`* so it re-colours with the theme, and that
needs `inlineSvg()`, which needs the file. So the markup for a resolved asset
is the leaf – `assetMarkup(node, id, geo)` – and what stays in the core is the
part that is the same in both runtimes: where the picture goes, and the
`dg-missing` rect when there is no asset. In the browser that leaf substitutes
an id and a geometry into markup the build already emitted, which is also what
will make phase 3's re-render byte-identical for figures with images.

Two smaller seams the plan did not name:

- **`dgCounter` moved inside the compiler**, with `resetCounter()` on the
  returned object. It is the compiler's own id counter, and two compilers in
  one process must not share it.
- **`dgLectureTags` was a module global that `renderDiagram` wrote to.** It is
  a *lecture* fact and the compiler sees one block, so it became
  `opts.onCompile(model)` – a hook the caller passes. The editor will want
  the model out of a compile too, so this is the general form rather than a
  workaround.

`DG_DEFINES` and `DG_CLASS_CLASHES` moved into the core as well: both were
lint-only tables, and a lint-only copy of the vocabulary is the thing this
phase exists to delete.

Verified (§11.8's row for phase 1):

- all three lectures built before and after, twelve HTML files compared:
  **byte-identical**. That includes `lectures/diagrams`, which exercises every
  construct in the grammar.
- `docs/site/example/source.md` builds (the release job builds it too).
- `node lint.js lectures/ --strict` clean, and a 20-error corpus produces the
  same seventeen errors and one warning it did before, with the same line
  numbers.
- `release.yml` needs no change – it stages `git archive HEAD`, so a new
  tracked file is in the tarball automatically. Its comment listing what is
  in the archive was updated anyway.

### Phase 2 – spans · **done**

Every token now carries `[s, e)` into the block body, every statement carries
the span of its own line, and `createSpanTable(model, body)` answers the one
question the editor asks: **which characters do I replace to change this?**

The answer has one shape whether or not the attribute is there yet:

```js
{ start, end, prefix, suffix, present, text, value }
// applying it is always
body.slice(0, start) + prefix + value + suffix + body.slice(end)
```

For a present attribute `[start, end)` is the token and prefix/suffix are
empty; for an absent one `start === end` is where it goes and `prefix` carries
the keyword. One shape, no branch at the call site – and the call site is a
drag handler, where every branch is a place for the two cases to drift apart.

`text` is always the **raw source** of the span, so `applySpan(sp, sp.text)`
is the identity; `value` is what the token *means* (a decoded label, the
contents of an attribute tail). Conflating the two is how a label round-trips
without its quotes, which is exactly what the first run of the check found.

The table also carries two things §9.3 needs and nothing else provides:
`constrainedBy(id, axis)` – the `align`/`spread` statement that owns a
coordinate, so the refusal can name the line – and `referencesTo(id)`, the
list a delete owes the author.

**The round-trip check found three real defects, and only one was a span bug.**

1. **An inserted placement option at end-of-line does not parse.** `gap`,
   `align`, `frac` and `offset` are options of the *placement expression*,
   and the parser stops reading them the moment the expression ends. Append
   ` offset 0.19,0` to `box tobj "object" right of tlab gap 0.7 w 0.62` and
   the build says `unexpected "offset"`. So `dgParsePlacement` now records
   `place.span`, and the table inserts a placement option **there** rather
   than at the end of the line. This is the kind of thing that would have
   shipped as "the editor sometimes writes a block that will not compile".
2. **`between a,b pad 0.3` mis-parsed.** The member scan stopped at
   `frac`/`offset`/`w`/`h`/`r`/`->` but not at `pad` or `same`, so `pad` and
   `0.3` were read as two more member names and the error was
   `unknown anchor .3 on "0"`. A pre-existing hole that phase 0b widened by
   giving `text` a `pad`. Fixed in the STOP set.
3. **The first element's placement is implicit.** It gets `at 0,0` for free
   and there is nothing in the source to hang an option off, so a placement
   option there had no insertion point. The placement is marked `implicit`
   and `spanOf` returns **null** rather than an offset that would not parse;
   the editor asks for `place` instead, which is the whole expression and is
   what a drag rewrites when it changes the *kind* of placement anyway.

Also landed here because it is the same deliverable: **the block's byte range
in `source.md`**, and the payload that carries it into the page.
`parseLecture` tracks line offsets and adds `fmOffset`, which is **measured,
not assumed** – `matter()` strips the frontmatter, so an offset into `content`
is not an offset into the file, and the plan's warning about that was worth
heeding: getting it wrong does not throw, it writes into the wrong part of a
source file. Each figure now carries
`<script class="psi-diagram-source">{body, attrs, range, chunk, width,
images}</script>`, and `images` is the browser half of the `assetMarkup` leaf:
the markup the build already emitted, with the id and geometry lifted out as
placeholders, keyed by asset reference so the editor can also place a *new*
image using an asset the lecture already carries.

Verified:

- **2,564 spans across 12 blocks and 184 elements round-trip byte-identically.**
- **707 edits applied through the table**: every numeric attribute replaced
  with a new value where present and inserted where absent, then re-parsed –
  all compile, and the model reads back exactly what was written.
- all 12 emitted `range`s slice their block body out of `source.md` exactly.
- all three lectures build, `lint --strict` clean. The payload costs 508 bytes
  in the tutorial and 14.5 KB across the eleven figures of `lectures/diagrams`.

The two scripts are in the scratchpad (`spans-roundtrip.mjs`, `spans-edit.mjs`)
and are the ones to re-run after touching the parser or the table.

### Phase 3 – the read-only canvas · **done**

The "one compiler, two runtimes" bet is cashed: **every figure in every
lecture re-renders in the browser to a tree identical to the one the build
emitted.** 11/11 in `lectures/diagrams`, 1/1 in the tutorial, in the audience
and the speaker view.

What landed:

- **`editor:` in the frontmatter**, through `VIEW_DEFAULT_SPEC` and mirrored
  in `lint.js`. `both` (default) · `speaker` · `none`. Verified in all three
  modes: the payload appears in the audience view only under `both`, in the
  speaker view under `both` and `speaker`, and never in print.
- **`diagram-core.mjs` and `editor.mjs` are read from disk and inlined**, the
  same way `bundledFaces()` reads woff2 out of `node_modules`. Two things the
  wrapping gets right: the exports become one object by *scanning* for the
  `export` keyword rather than a hand-written list that would go stale; and
  `</script` is escaped, because the compiler emits a
  `<script type="application/json">` payload and that sequence closes the
  element regardless of what JavaScript thinks it is inside of.
  **Reading them as text is also what makes them ordinary files**: a backtick
  or a `\s` in `editor.mjs` means what it says, where the same character in
  `AUDIENCE_JS` is a parse error or a silently broken regex (§11.6).
- **Cost, measured: 132.7 KB** of core + editor, in an 840 KB audience view.
  The plan estimated ~150 KB. A lecture with no diagram pays nothing – the
  payload is gated on the rendered HTML containing one, the same rule the
  KaTeX stylesheet follows.
- `window.psiEditor` exposes `figures()`, `compile()`, `spanTable()` and
  `selfTest()`.

**The identity check earned its keep three times over.** None of these would
have been visible by looking at the picture:

1. **`aria-label` was missing** from the re-render. The build takes the
   figure's accessible name from the chunk heading, which the browser has no
   route to. Now in the payload.
2. **The comparison itself was wrong.** The SVG in the page is not the SVG the
   build wrote: the step runtime has already applied beat 0 to it and swapped
   the print viewBox for the one that holds every beat, while the emitter's
   static attributes are deliberately the *last* beat. So the check puts its
   own re-render through the same runtime first. Without that it reported the
   animation as a compiler difference. It also compares numbers as numbers –
   the emitter writes `toFixed(2)` and the runtime writes
   `Math.round(v * 100) / 100`, so `12.30` and `12.3` are one coordinate
   written by two code paths.
3. **A real defect in the image table**, and the interesting one. It was keyed
   by asset reference with the markup baked in – and in `#mac`, `eve` and
   `bob` share `avatar-bob` with different alt text, so `bob` came back
   labelled "Eve". The accessible name is not a substring you can splice: it
   is carried by a whole construct that is *absent* when there is none
   (`role="img" aria-label="…"` on a spliced vector, `<title>…</title>` on a
   raster). So the build now emits both shapes and the browser picks. That
   keeps the knowledge of which construct carries the name next to
   `inlineSvg()`, where it belongs, and keeps the table keyed by asset so the
   editor can place a *new* image using an asset the lecture already carries.

One thing the plan did not mention: **the speaker view clones whole chunks
into its preview strip**, so a lecture with eleven figures carries twenty-two
payload scripts, and because `getElementById` always answers with the
original, every clone resolves to a figure already in the list. The workspace
would have offered each figure twice. Deduplicated by the SVG element.

### Phases 4–7 – the frame, the guides, the drag, the acts · **done**

`editor.mjs` (≈2,300 lines) and `editor.css`, both read from disk and inlined
like the compiler. The editor opens from the focus card's own button or `E`,
and everything in §4.2 is bound.

**Phase 4, the frame.** Computed, not chosen. `#dge-frame` is a real
destination – the chunk's own width class at the *measured* em of a live
`.chunk`, so it moves with the zoom key and with auto-fit – and the drawing
inside carries the same `max-width: 100%` and `max-height: 62vh` the live
views apply, with the cap lifted in the print frame. Two things it says out
loud that are otherwise invisible until you look at the built page: the
measure under the frame (*full · 72em*) and, when the height cap binds first,
*height-capped at 62vh, so 39% of the measure stays empty beside it*.

**Phase 5, the guides.** A faint cell grid and rulers in *cells*, the origin
axes, and – on a selection – the relations that hold it: the `gap` drawn
between the two facing edges and labelled, the alignment edge as a hairline
through both elements, `between` as the line joining its two references with
`frac`, a ref coordinate as the line it refers to, an `align` set's shared
axis running through every member, a `spread` set's equal centre distances as
matched marks, and `same as` as a width bracket mirrored onto its source.
Tags get a tinted halo instead of a line, because a tag is not geometric and
drawing it like an alignment would say something false about it.

**Phase 6, the drag.** The §9.3 table, implemented as `dgePlanDrag(ctx, id,
dx, dy)` returning *edits* rather than applying them – which is what lets the
status bar show the line before the pointer is up. Refusals name the line:
*"y comes from `align y middle` on line 40. Drag iv to move the row, or drop
c1 from that line."*

**Phase 7, the acts.** Placers write a statement, and the placement heuristic
proposes a relation over a coordinate: dropped beside an existing element it
writes `left of b gap 0.05`, not `at 3.2,1`. Wrappers act on the selection and
are disabled until there is one. `align`/`spread` are selection acts with the
first-selected as master, said in the sidebar. Delete lists what refers to the
element and removes those lines too, so the block still compiles.

**Four defects the browser found, all of them in the interaction rather than
in the compiler.** None would have shown up in a unit test:

1. **The gesture planned against its own preview.** `dgeStartMove` rebuilt the
   span table from the *previewed* model while measuring offsets into the
   *base* text. The two disagreed by however much the preview had already
   rewritten, so a 60px drag came out as `gap 8.45`. Fixed by capturing
   `{source, model, boxes, spans}` once at pointerdown and planning against
   that – `dgeGestureBase()`.
2. **The picture reflowed under the pointer.** Even with the base pinned, each
   preview recompiled and the figure's viewBox grew with the gap, so the next
   `pointermove` measured its delta against a different mapping. Compounding
   again, and the wrong *feel* besides: a picture that rescales under your
   hand is not one you can aim at. The viewBox is now pinned for the duration
   of a gesture.
3. **Zoom as a transform put the figure off-centre.** A transform does not
   change the layout box, so at 100% a 72em frame is wider than the canvas,
   the grid clamps the overflowing item to the start edge instead of centring
   it, and the scaled figure sat well off to the right. Zoom is now the
   frame's *size*; pan stays a transform, which is exactly the thing that
   should not affect layout.
4. **The entry point hung the tab.** The pencil button was appended into the
   `#figure-overlay` subtree its own `MutationObserver` was watching, so
   inserting it was a mutation, which re-ran the sync, which inserted it
   again. It lives on `document.body` now – it is `position: fixed` either
   way.

Two smaller ones: the guide layer was pinned to the frame rather than to the
drawing, so it was offset by the frame's padding; and `frozen` / `state` are
top-level `let`/`const` in a classic script and therefore **not** properties
of `window` – the room indicator reads the cockpit's own `#freeze-btn`
instead, which is the state made visible anyway.

Verified in a real browser, all on `lectures/diagrams`:

- **the drag**: `box c1 "c_1" right of c0 gap 0.3` → `gap 0.8` for a 60px
  drag, which is the measured 0.49 cells at that zoom; the `align y middle`
  refusal fires on the cross axis and names line 40 while the main axis still
  moves.
- **the acts**: place a box (writes `box b2 "box" left of b gap 0.05` – a
  relation, not a coordinate), wrap three in a container, delete it, undo it
  back, cycle the frame, step to the next figure, open the board (11 cards).
  Zero problems reported at every step.
- **the modal owns the keyboard**: with the editor open, `Space` `C` `F` `A`
  `↓` `B` leave the active chunk, the revealed count, the theme, the font, the
  collapse mode and the blank state *identical*, while `F` cycles the editor's
  frame.
- **the entry point**: focus a figure → the button appears → `E` and the
  button both open the editor on that figure; `Esc` closes it.
- **all seven themes**, screenshotted with the editor open: the chrome follows
  `data-mode`, so the two phosphor modes came free.
- the phase-3 identity check still passes (11/11), all spans still round-trip,
  all 707 span edits still re-parse, all three lectures build, `lint --strict`
  clean.

### Phases 8–10 – persistence, sync, the workspace, the beats · **done**

**Phase 8, where an edit goes.** Four tiers, tried in order.

*Tier 1, the watch socket*, now two-way. The three preconditions §2.3 asks
for are all in place – the server binds to `127.0.0.1`, a per-build nonce is
required on every patch, and a patch is refused unless the range is one a
`::: diagram` block actually occupied *and* the bytes there still match what
that block compiled from. **A fourth check turned out to be needed.** The
plan's reasoning – "whichever writes second is working against a range that
no longer exists" – holds only when an edit changes the block's *length*. Two
tabs each nudging a `gap` leave the length identical, the range still exists,
and the second write silently takes the first one's change with it. So the
patch also carries the bytes the *page* believes are there, and the server
compares them. Measured: tab 1's edit survives, tab 2 is told *"another window
has already edited this figure"*, and the file is untouched by the refusal.

One thing the plan did not anticipate: **the write-back reloads the page,
which takes the editor with it.** The author presses ⌘S and the modal
vanishes. The editor now leaves a note in `sessionStorage` and comes back on
the same figure – consumed on read, so a later manual reload lands on the
slide as it should.

*Tier 3, File System Access*, is built and feature-detected: an "Open
source.md…" button appears where the picker exists and there is no watch
socket already doing the job, and writing goes through the same three checks.
Not load-bearing, exactly as §2.3 says.

*Tier 0, the reader's shelf.* `localStorage` keyed by chunk id, restored at
boot and applied to the page itself so the edit survives a reload without the
editor being open, with a quiet *edited · revert* under the figure. Never
synced – there is no second window to sync to.

**Sync.** `{type:'diagram-edit', id, source}`, its own message following the
`video` precedent, addressed by the diagram's id, gated by the freeze flag,
echo-suppressed. `speaker.md` §2 gains the row and the smoke test. Measured
in two real windows: the room follows a nudge in the cockpit, freeze holds it
still while the cockpit moves on, and thawing catches it up.

**Phase 9, the workspace**, is mostly the chrome built in 4–7 – the strip, the
board, `,` / `.`, `Shift`-`V`. The interesting half is the paste, and §11.8's
check found **two real bugs, both in the re-rooting**:

- the root's placement was rewritten with a regex over the pasted text, and a
  lazy pattern happily matched *another* line's placement, leaving its `gap`
  behind as a syntax error;
- an element whose placement is the **implicit** origin has nothing to
  replace, so the regex did nothing and the pasted block had a box with no
  placement.

Both are gone because the re-rooting now goes through `createSpanTable` over
the *pasted text* – parse it, ask for the anchor's `place` span, splice. It
also re-roots **every** anchor rather than only the selection's root, shifted
by one delta, so a multi-anchor closure keeps its shape.

**Phase 10, the beats.** A beat strip on any stepped figure, `<` and `>` to
step it (Shift of the figure keys, which is the right relation: a beat is a
step *within* the figure the other pair moves between). At beat *k* a drag
writes `move <id> by dx,dy` into step *k* and leaves the element's placement
alone; a second drag adds to the op that is already there rather than stacking
two. The mode is loud – accent outline on the frame, accent rule on the status
bar – because it is the one place the same gesture means two things.

Verified:

- **every beat's geometry matches the build's own frames payload**, worst
  disagreement 0.005 px across all four beats of `#cbc` (that is the payload's
  own rounding).
- a drag at beat 2 writes `move m1 by 0.35,0.5` into the step; the `box m1`
  line is byte-identical afterwards and the block compiles.
- the watch loop end to end: patch accepted, `source.md` rewritten with the
  frontmatter and the prose after the figure untouched, rebuild, reload,
  editor back on the same figure.
- all three refusals, each leaving the file untouched.
- Tier 0 round trip: edit, reload, marker, revert, shelf cleared.
- the paste from `#lifecycle` into a one-box figure compiles; twice, and the
  25 names are distinct.
- the full sweep still green: three lectures build, `lint --strict` clean,
  2,564 spans round-trip, 707 span edits re-parse, the phase-3 identity check
  11/11, no console errors.

### What is not built

- **Two-way source pane.** §12 settled it as one-way for now and it is
  one-way: the canvas writes and the pane displays. Making it two-way is
  additive and the reasons to wait are in §12.
- ~~`node build.js --new <slug>` does not yet scaffold an empty figure chunk
  (§2.2), and the editor's "New figure…" clipboard convenience is not built.~~
  **Both landed later in the branch** – `build.js` scaffolds a
  `## figure: TODO` chunk and `editor.mjs` carries the "New figure…" button.
  This entry was stale; corrected in review.
- **`Q` locks the tool but nothing draws the lock state** beyond the status
  line it prints.
- ~~Placing a picture (§14).~~ **Built** – see *Phase 11* below.
- ~~The demo lecture never learned the new vocabulary.~~ **Fixed**:
  `lectures/diagrams` now carries the lecture-wide `diagram-defaults`, `pad` on
  the stack frames in `#overflow`, `.paper` and `.serif` in `#mac`, and a
  `#look` chunk that shows every fill, every family and the three answers to
  "how does type meet its box".

### Phase 11 – bringing a picture in · **done**

§14 as written, and three things it did not foresee.

**`.paper` had to be invented.** The editor's fill row opened with
`{ cls: '', label: 'paper' }` – the *empty* class. So "paper" meant "whatever a
default says": a box under `default box {.tone-3}` could not get back to the
canvas colour, and a free `text` could not have a ground at all, which is the
whole reason to give a label one (it is what knocks out a line running behind
it). Fixed by naming it: `.paper` joins the fill slot, the row shows *default*
and *paper* as two separate swatches because they are two different statements,
and `DG_FILL_CLASSES` had to learn it too – without that the class resolved,
the CSS was emitted, and no rect was drawn for it to colour. 24 classes became
29, not 28. The `#mac` figure's "e.g." now sits centred on its dotted leader
instead of dodging sideways.

**The reply spread its payload over its own protocol.** `reply(ok, why, extra)`
built `{ type, id: msg.id, ok, why, ...extra }`, and an asset reply carries the
asset's own `id` – which overwrote the message id the client pairs on. The
write succeeded, the promise never resolved, the picker sat open. Payload
first, protocol last.

**A file on disk is not a file this page knows about.** The asset write
deliberately does not rebuild (fs.watch is on source.md), so between the write
and the commit the page's payload has no entry for the new reference and the
in-browser compiler refused the very line the editor had just written: *"the
block does not compile"*. `dgeRegisterPending()` closes the gap – enough of an
entry for `resolveImage` to answer yes, with the aspect read from the SVG's
viewBox or the raster's natural size, and `markup: ''` so the canvas shows an
empty slot for the second before the rebuild fills it. Verified end to end: a
file that was never in `assets/` reaches `assets/newlogo.svg`, the line reaches
`source.md`, and the rebuild draws it.

**Also found while there:** `lint.js` was stricter than the build. Its `between`
scan terminated on `frac offset w h r ->` and not on `pad`, `gap`, `align` or
`same`, so `text eg "e.g." between ver1,ver2 pad 0.12` was three lint errors on
a file the build accepts. A linter stricter than the build is worse than none –
it is the pre-commit gate.

### After the review · **done**

A code review of the branch found fifteen things. Two did not survive
checking, thirteen were real, and one of the thirteen predates the editor
entirely. What follows is what changed and, where it matters, why the
verification that was already in place did not catch it.

**Rejected, with evidence:**

- *"The buttons are invisible in the dark themes."* `editor.css` carries a
  `body[data-mode=dark]` block covering `.dge-btn` and `.dge-seg button`, and
  the seven-theme screenshots show them rendering correctly. The reviewer
  counted one `data-mode` rule; there are six.
- *"The guide layer is offset from the drawing when the height cap binds."*
  Measured on `#cbc` in the slide frame, where the cap does bind: the guide
  layer says the centre of `c1` is at (708, 259) and the browser painted it at
  (708, 259). The reasoning assumed the SVG's width shrinks when `max-height`
  clamps it, which it would with an auto width – but the width is explicitly
  `100%`, so both layers letterbox identically inside the same box.

**The four that could corrupt a source file**, all invisible because the
result still compiled: a tail rewrite over a multi-selection used span offsets
from the pre-edit text and wrote the second element's tail into the middle of
its own placement and the third's inside its quoted label; giving a label to
an element that had none emitted `""Hi""`; the paste rename rewrote words
*inside* labels; and delete reported the other selected element as a reason
not to delete this one. See the commit for each.

**The one that made the editor draw a different picture than the build.** The
lecture-wide `diagram-defaults` layer never reached the browser, so the
in-browser compiler resolved four layers where the build resolved five. Worth
recording why phase 3's identity check missed it: **the check was right and
the corpus was too small** – none of the three lectures in the repo uses
`diagram-defaults`. The fixture that reproduces it, for anyone re-running the
check:

```markdown
---
title: Lecture defaults
diagram-defaults: |
  default box {.tone-3} w 1.1
  default box @dec {.round} w 0.5
  default text {.small}
---
## title: Lecture defaults {#cover}
## figure: Styled by the lecture {.full #styled}
::: diagram {unit=130x76}
box a "Alpha"
box b "Beta" right of a gap 0.4 {@dec}
text n "a note" below a gap 0.5
:::
## figure: A fit that needs the lecture width {.full #fitted}
::: diagram {unit=130x76}
box f "fits the box" {.fit}
:::
```

Before the fix: `#styled` differed in every coordinate and `#fitted` did not
compile at all, because `.fit` needs a width and the lecture's was gone.
After: 2/2. **Run the identity check against this as well as the three
lectures.**

**The one that predates the editor.** A focused diagram never animated. The
focus card is a clone of the figure, ids and all, so every `getElementById` in
the step runtime reached the hidden original while the card – the only thing
the room can see – stood still. `dgStep` now mirrors into the card with
`dgRenderInto`, which is the same call the speaker's preview thumbnails use
and exists precisely because a clone cannot be addressed by id.

**Three lessons worth carrying forward**, because each explains a whole class
of the above:

1. **A span is an offset into the text as it was.** Every place that writes
   more than one of them has to plan first and splice right to left. That was
   already true of `dgeApplyEdits`; it is now true of the tail writes and of
   moving a multi-selection, which is where the bugs were.
2. **A clone cannot be addressed by id.** The focus card and the strip
   thumbnails are both clones, and both were broken by it in opposite
   directions – one reached the wrong element, the other had its ids stripped
   and lost the `@scope` anchor a spliced asset's stylesheet hangs on.
3. **An id in a diagram is a prefix of other ids.** `dg6-alice` sits inside
   `dg6-alice--i`, so any rename has to be one pass with a longest-first
   alternation, never a loop of replacements.

**Payload, re-measured** now that the UI exists: 295 KB of compiler, UI and
chrome in the built page – the plan's ~150 KB was taken at phase 3, before
there was a UI. *(Superseded: after the docking, alignment, step-pane and
layout-control slices the same measurement – `lectures/diagrams` built as it
stands, minus the same lecture built with `editor: none` – is ~440 KB.)* Per
figure, the source payload is 12.2 KB across the eleven figures of
`lectures/diagrams`; the asset table is now its own element, so
print and `editor: none` drop it entirely and a live view pays 2.7 KB rather
than 4.9 KB (one copy of each asset's markup plus the range to cut for an
element with no accessible name, instead of two full copies).


### After using it – an arrow you could not point at · **done**

Four gaps found by using the thing, all in the same corner of it: an edge was
the one element the editor could name but not touch.

**A label field that could not type a label.** The tokenizer decodes `\n`
inside a quoted string to a real line break and the emitter typesets one line
per break, so a two-line label has always been in the grammar. The sidebar
offered a single-line `<input>`, which can show one and never write one. It is
a `<textarea>` now, holding the *decoded* string – which is what `spanOf`
hands back for a quoted token – with `dgeQuote` re-encoding on the way out.
A textarea keeps `Enter` for itself, so `⌘S` had to start working from inside
a field: it blurs first, because the field's `change` fires inside that call
and a commit that ran before it would write the text as it was before the
author started typing.

**Edges had no label field at all.** They were excluded from that branch, and
nothing but the exclusion was missing – the grammar reads `edge a -> b "why"`,
the compiler places the text along the line. One trap on the way in: an
absent label is inserted after the element's *name*, which is the second token
of every statement that has one. An edge's second token is already an
endpoint, so `edge a "x" -> b` is what that rule produced. It parses – the
endpoints are read off the tokens that are neither quoted nor an attribute
tail – but nobody writes it, and the author has to live in the file. An edge
label goes where its other trailing options go.

**An edge could not be clicked.** `dgeHitTest` walked `DGE.boxes`, and
`layoutDiagram` never puts an edge in there, because an edge is not placed –
it is drawn between two things that were. Giving it a bounding box would have
been the wrong shape anyway: for a diagonal arrow that box is mostly empty
paper. The polyline is read straight off the painted SVG instead, which is not
a second layout – the compiler wrote that `d` and the step runtime moved it,
so it is by construction the geometry on screen at this beat, and on a
`pointermove` a second `dgFrameDrawables` would re-measure every label in the
block to learn what the DOM already knows. Two things this depends on: the
prefix has to be captured in `dgePaintArt` **before** the root id is
overwritten (searching by suffix would match `my-edge-1--p` for `edge-1--p`),
and the query has to be scoped to the editor's own SVG, because the slide
behind the modal holds the same figure with the same prefixed ids.

Reading order settles the ties, because it is what the author sees: a box wins
over an arrow that crosses it, an arrow wins over the container or brace it
runs through. Without the second half every edge inside a container would be
unreachable, which is most of them.

**An edge could not be retargeted.** The span table had no `from` / `to`, so
there was nothing for a drag to rewrite. Two traps in adding them, and either
one silently retargets the wrong end: `<-` swaps what the model calls `from`
and `to`, so `from` is the token to the *right* of a reversed arrow; and the
index has to run over the body tokens the parser itself reads, never over all
of them, or the label in `edge a "x" -> b` is offered as the source endpoint.

Dragging an end answers with a **name** wherever it can, which is the §2.4
rule applied to the one construct that names *other elements*: an arrow stores
"the right edge of `mix`", and an editor that answered a drag with coordinates
would destroy the thing the construct exists for. A snapped coordinate is the
fallback for empty paper, and it is a form the grammar already has. Dropped
back on the element it already names, the anchor the author wrote survives;
moved to a different element it does not, because `.right` was chosen against
the old box and `dgAutoAnchor` picks better than a stale hint.

**The one that would have shipped broken.** An edge is not a legal endpoint –
`layoutDiagram` has no box for it, so `edge feed0 -> x0` parses, passes
referential integrity, and then draws nothing at all. The moment hit testing
learned about edges, the *edge tool* inherited it: starting a new arrow on top
of an old one would have named it. `dgeHitTest(pt, { edges: false })` is for
every caller that is choosing an endpoint, and there are four of them.

**Swap ends exchanges the two names rather than flipping the arrow.** Flipping
reads smaller in the diff and was the first version, but `--` has no direction
to flip and the edit would have done nothing there – the silent no-op this DSL
keeps closing.

**Undo and redo grew buttons**, next to Revert, with the depth of each stack
in the tooltip. §4.2's rule is that nothing is reachable only by knowing the
key, and undo was the mechanism that had only the key.

Verified by driving the built `audience.html` in Chromium rather than by
reading: 22 assertions over the `#cbc` figure – the arrow selects on a click,
grows two handles, takes a two-line label, is retargeted by a drag with its
waypoint and label intact, undoes, redoes, swaps – plus the two regressions
above, that a click on a box still selects the box and that the edge tool
never names an arrow.


### Waypoints · **done**

An arrow you could select but whose route you still could not touch. The `via`
clause is now three gestures on the canvas: a hollow dot at the middle of every
segment inserts a waypoint and hands the gesture straight to the move, so one
press-drag-release both creates and places it; a square moves an existing one;
a double-click on the square, or the chip in the panel, takes it out.

**The axes are decided separately, and that is the whole point.** A routed
waypoint in a real figure is usually half reference and half number –
`via iv.cx,d0.bottom+0.28` is "the horizontal centre of the IV box, and 0.28
below the bottom of the decrypt box". Where a component holds a reference the
drag rewrites its **signed nudge** and never the reference. §2.4 lists this as
one of the three constructs a graphical editor has to round-trip, and the
reason the nudge is one optional signed term with no other operators and no
nesting is exactly that the token to replace is always unambiguous. An editor
that answered this drag with two numbers would turn a diagram that re-routes
itself into one that does not, which is the whole value of the format.

The span table gained `via`, `via.<k>`, `via.<k>.<x|y>` and the two nudge slots
– the same shape as `at`, because it is the same coordinate grammar behind
both. Insert and remove rewrite the whole clause rather than a token, because
the waypoints are one space-separated run; the coordinates already there are
re-emitted verbatim from their own spans, so a reference survives an insert
next to it.

Two things that had to be got right:

- **The absent `via` writes the keyword itself.** The first version put `via `
  in the gap's prefix, which made the same value string correct for an edge
  that already had waypoints and doubled the keyword for one that did not.
  Both cases now take the whole clause.
- **Removing the last waypoint leaves a space behind.** The span starts *at*
  the keyword, so the drop path in `dgeApplyEdits` has no keyword in front of
  it to eat. This file is the author's, so the removal tidies the line.

The panel lists the waypoints rather than only letting them be dragged,
because how many there are and which of them holds a reference is not readable
off the picture: `iv.cx,d0.bottom+0.28` and `1.4,2.06` can land in exactly the
same place and behave completely differently the moment anything moves.

Verified in Chromium against the CBC figure's `feed0`, whose single waypoint
holds a reference on *both* axes: dragging it rewrote both nudges and kept both
references, an insert landed before it and left it intact, removal restored the
line byte for byte, and taking the last one out left no double space.


### What the review found · **done**

Six defects, and the three that mattered all came from the same place: a
construct that was safe while it was unreachable stopped being safe the moment
something new could reach it.

**A leader stub is not a statement, and now something could click one.** A
`text n "…" -> x` grows a `<id>--lead` edge in `model.edges` so the visibility
rule has something to hang on, and that edge carries the **text statement's**
span, because it has no line of its own. Harmless while an edge could only be
reached from the element list and had no label field. Once edges became
clickable the panel bound to the wrong statement: the label field rewrote the
*node's* label, and – worse – the literal `->` on the node's line made the new
`from` span resolve to whatever token preceded it, which on
`text n "…" right of x gap 0.85 -> x` is the gap. Typing an endpoint there
produced `right of x gap b -> x`. Closed at the source: the stub is flagged
`lead`, and `createSpanTable` leaves it out of its table entirely, so no span
of it can be handed out under any name. The editor additionally skips it in
hit testing and in the element list.

**A whitespace tidy-up over the whole block.** Removing the last waypoint has
to eat the space that separated the clause from what precedes it, because the
`via` span starts *at* the keyword and the drop path in `dgeApplyEdits` has no
keyword in front of it to find. The first version did that with a regex over
every line of the block, which re-indented every step body, collapsed
column-aligned declarations, and ate the double spaces inside quoted labels –
all of it written straight back into the author's `source.md` over the watch
socket. It now walks back from the span start over spaces and tabs and splices
once. The spec asserts the strict version: exactly one line of the block may
differ.

**A mark that promised a move the key would not make.** `colFirst()` asked
only whether a chunk heads a column, while `updateNavHints` correctly also
asked whether a column exists in that direction. On the head of the last
column the mark was therefore off and the key still called `nextCol`, whose
fallback clamps to the end of the deck. Both now read one precomputed
`sideways` field, which is the actual fix: two predicates for one fact is the
bug, and the asymmetry only showed up on the one chunk nobody tests by hand.

Three smaller ones: an arrow hidden at the current beat was still hit-testable,
so a click on empty paper could select something invisible (boxes are
deliberately left alone – a hidden box still occupies the area you clicked,
where a hidden hairline occupies nothing); the nav marks vanished from the
**cockpit** while the projection was blanked, because `.blanked` goes on the
body in both views and the rule was not scoped the way every other blanking
rule is; and clearing an endpoint field wrote `edge  -> b`, which does not
parse, so the panel refuses instead.

Each of the four with a real failure mode now has a spec in `test/`, including
one on the speaker view for the blanking rule.


### Three things found by using it · **done**

**A waypoint could not be taken off the canvas at all.** Double-click did
nothing, and neither did any modifier. The listener was there and had never
fired once: the first click ends a zero-length drag, whose `dgeGestureEnd`
repaints the guide layer, so the second click lands on a *different DOM node*
carrying the same id. A `dblclick` listener therefore fires on the two nodes'
common ancestor, and `closest('[data-handle]')` finds nothing. Switching to
`pointerdown`'s own click counter did not help either – the browser resets
`ev.detail` for the same reason. It is recognised from **position and time**
now, which are the only two things about the gesture that survive the repaint.

Worth generalising: any control living in a layer that is rebuilt on every
recompile cannot rely on event identity across two events. The guide layer is
exactly that.

**An `align` set could not be left by dragging.** See §9.3, rewritten. The
short version: the refusal was replaced by a hold you can pull out of, and the
edit it used to ask the author to go and make by hand is now the edit it
makes. One trap in the wiring – `dgePlanDrag` has an early exit for "held on
the only axis this drag was about", and a plan that leaves by that door has to
carry the strain with it or the status bar paints the hold as an error. The
spec asserts the absence of the error class, because that is the difference
between a mechanism explaining itself and a mechanism complaining.

Leaving a set writes somebody else's line, which the edit machinery had no
shape for: every edit was an attribute of the element being dragged. Edits may
now carry a `raw` span. Both apply paths needed it – `dgeApplyEdits` and the
one inside `dgeMoveSelection`, which is a second copy of the same splice loop
and should probably not be.

**The CBC figure's chaining arrows were drawn wrong**, and this one is a
lecture bug rather than an editor bug. Each ran straight down from the
ciphertext box, through the `Dec` box below it, laying itself over the white
arrow that really does feed that box – so the picture said the ciphertext goes
into the decryption on that path, which is the opposite of what CBC does.

The fix is a routing channel, and the interesting part is that it could not be
had by moving the line alone. Leaving the box sideways and running down the
gutter put the line on top of the `k` labels; the channel between a `k` and
its `Dec` is exactly the width of that gap; and no vertical fits between the
wide ciphertext boxes and the narrow `Dec` boxes while a `k` sits in the same
gutter. The columns had to move apart. `gap 0.3` became `0.75`, which is
whitespace only if you think the gutter is empty – it is the channel, and the
comment in the source says so.


### Placement, as something you can change · **done**

A relation is what this grammar is for – `below b gap 0.8` means the dot
follows the Mix box wherever it goes – and until now a drag could only say
*how far*. The gap was clamped at zero, so dragging the dot up through b's
bottom edge stopped dead. Putting it above, or beside, or halfway between two
other elements meant editing the text, which is the one thing the editor
exists to spare people.

Split by gesture, because the two halves want different ones.

**Which side is a drag.** Past the reference's own edge the direction word
follows the pointer, decided by the dominant axis of the centre-to-centre
vector. The edge is the hysteresis: to change sides you have to drag the
element right through the thing it is measured from. `dgeRedock` returns null
while the element is still on the side it already claims, so an ordinary drag
keeps writing `gap` and nothing else, and the whole placement expression is
rewritten only when the relation itself changed – which also drops the `align`
and `offset` that described the old axis.

**Which element, and which kind, are controls.** The placement pane reads the
relation back as the three things it says – kind, reference, distance – and
lets each be changed. Guessing a new reference from where a drag was dropped
is a large semantic change made on a guess, and the element the author meant
is often not the nearest one; `between a,b` has no gesture at all, because
nothing about dragging one box says "halfway between those two". The pane is
also the answer to "what is holding this here" without reading the source.

Two things it has to get right, both inherited rather than re-solved. A
reference that names nothing is refused and the source put back, because
dgeWriteAttr now goes through `dgeSetSource` like every other structured write.
And the first element of a block has no placement in the source at all – it
sits at the origin for free – so `spanOf` answers null; the pane says so and
offers to write one out rather than showing fields that cannot be saved.


### Four layout controls, and the one grammar change they needed · **done**

Asked for together, so worth saying which of the four cost the language
anything: one did.

**Docking by drag.** Four chips around whatever the pointer is over; release
on one and the placement is rewritten to `<side> of <that element>`. No
modifier, and that is the design rather than an omission – `Ctrl/Cmd`
suspends snapping, `Alt` leaves an align set, and `Shift` means
axis-constrain in every drawing tool. Releasing *on a chip* is itself the
commitment, so the gesture guards itself and stays one-handed. The preview
shows the element already docked while the chip is armed, so the picture
answers "what will this do" before the button comes up.

Two things it has to read from the right place. The host is found from the
**pointer**, not from the dragged element, and its geometry comes from
`ctx.boxes` – the layout as it was at pointerdown. The element is moving under
the preview and the layout is re-solved on every move, so anything read live
slides about while it is being aimed at. And the chip decides the *side* only:
measuring a distance from where the pointer happens to be gives nearly zero
every time, because the chip sits just outside the edge and half the dragged
element covers the rest. The element keeps the gap it already had.

**Align, distribute and "between these two"** cost nothing at all. `align x|y
<edge>` and `spread x|y` have been in the grammar from the start and the
editor has had `dgeAlign` and `dgeSpread` for as long – they were six buttons
reading `x left` and `y top`, which is the statement's own spelling rather
than the question anyone arrives with, and they only appear with two elements
selected. Renamed, grouped by axis, and `between a,b` added as a third
selection act: it has no gesture, because nothing about dragging one box says
"halfway between those two", and selection acts are the idiom `container`,
`brace`, `align` and `spread` already use.

**Label alignment is the grammar change**, and it is two classes: `.top` and
`.bottom`. `.left` and `.right` already existed but only bit on a free `text`
– on a box they were a latent bug, anchoring the label at the box centre and
running it out of the box. Both pairs are measured against the element's own
padding now, because that is what the word "aligned" means: as far that way as
this box allows.

The implementation is smaller than it sounds because the origin stays the
centre of the block of lines and only that centre moves. So the emitter goes
on laying the lines out around it, the recorded extent stays symmetric, and
nothing downstream learns a new idea – and a bottom-aligned label of three
lines puts its *last* line on the inner edge rather than its first, which is
what anyone means by bottom.

It did force one tidy-up. The question "which side of its origin does this
label sit on" was being answered in two places – the emitter for `text-anchor`
and `extentsOf` for the paper it reserves – and the new classes would have
made it three. `dgLabelAnchor()` is the one answer now. Two copies of that
question is exactly how figures came to sit off-centre in oversized frames a
few commits ago, so a third was not on.

One thing the change left open, and the merge with the outlines line closed:
the four words were only honoured where a label is placed by `labelBox`. Three
kinds place theirs by their own statement instead – a container's caption on
its own top border, a brace's beside the spine, an edge's at the middle of the
line. On a container or a brace that leaves nothing for any of the four to
move; on an edge, `.left` and `.right` still reach the label through the
anchor, and only `.top` and `.bottom` are inert. Measured on the emitted SVG:
`.left` moved a node label and an edge label and no other, `.top` a node label
alone. `rejectAlignOn()` refuses the five
that cannot act, the editor's two swatch rows carry only the kinds that can, and
`test/figure-labels.mjs` asserts both halves. It is the same rule the outline
classes already follow, and the same reason: a class that resolves and does
nothing is the failure this grammar keeps closing.


### Thirteen review findings on the layout controls · **done**

All real, and worth grouping by what they say about the change rather than
listing them.

**Four were one mistake: the dock did not use the hit test that already
exists.** `dgeDockAt` re-implemented "innermost box under the pointer" and, in
doing so, dropped everything `dgeHitTest` had learned. It offered chips while
dragging an **edge, container or brace** – none of whose statements has a slot
for a placement, so the release spliced `left of c gap 0.4` into a line that
cannot hold it. It targeted a `grid`'s synthesised cells, so a hover wrote
`left of g-2-1` while a click on the same pixel selected `g`. It offered hosts
that close a **placement cycle** – a container over its own member, a box
already placed against the dragged one. And it called `dgeFind` per candidate
per pointermove, which rebuilds a spread of the whole model each time.

The first three are gone by mapping through `dgeOwnerOf` and gating on the
dragged element being a node, plus one reachability walk that refuses a host
which can already reach the element. In each case the compiler *did* catch it
and `dgeSetSource` reverted – but the preview lied for the whole of the drag,
which is worse than a refusal: the author aimed at something that was never
going to work.

**One was the opposite of what the code said it was doing.** Insetting an
aligned label by the padding is right for a shape and wrong for a free `text`:
`sizeOf` gives a text the bare glyph run with no padding at all, so the inset
pushed it 13px off its own box. On a `.paper` text, whose ground is drawn
*outwards* from that box, `.left` came out flush against the right edge of its
own ground – the alignment inverted rather than shifted. The `freeText`
parameter that carries exactly this distinction had been dropped from the body
while staying in the signature, and the comment above it still described the
behaviour the change had removed. `test/figure-labels.mjs` measures both
kinds, and was calibrated against the broken version first.

**Two were the emit-once rule, which this change walked into twice.** A
`.turn`ed label reads bottom-to-top, so the room it takes downwards is its
measured *width* – `.bottom` used the upright height and put a firewall bar's
label past its own border. And `text-anchor` is written once, from the last
beat, while the origin is recomputed per beat: a `style` step that switched
`.left` on would draw the label half its width off in every other beat. The
grammar rejects that step now, for the same reason it rejects an outline class
there.

The rest were smaller: docking wrote an explicit `gap 0.25` where the author
had written no gap at all; docking ignored `align`/`spread` membership, so a
follower landed on its master while the status bar promised it now followed
the host; the "halfway" act had no node gate and contradicted the subtitle
printed above it; the `?` sheet never learned the one genuinely new gesture in
the commit; and the prose in the new code used ASCII hyphens where the
convention is en-dashes.

Two notes for next time. The review found nothing by reading the diff alone –
every finding is backed by a compile or an A/B against the base revision,
which is what caught the ones where the picture was still plausible. And four
of thirteen came from one duplicated function: `dgeHitTest` had accumulated
three separate lessons, and re-writing its walk threw all three away at once.

### The whole-branch review, editor's share · **done**

A second review ran over the merged branch, and eleven of its thirty
findings landed here. The pattern behind most of them is worth writing down:
the editor is honest about the edits it *refuses* and was careless about the
edits it *reported* – three separate places claimed success for work that had
been rolled back. The asset picker said "written" for a line the in-page
compiler had just refused (two of its three insert paths never registered the
asset, so the reference could not resolve until the next build); dgeAppendLine
said "written" unconditionally; and a failed watch rebuild was visible only
in the terminal while the page sat on the old build and the next write-back
was refused with advice – reload – that could not help. All three say what
actually happened now, and the watch server broadcasts a build-failed message
the status line shows.

The sync kept two promises it had only documented. An edit committed while
the projection is frozen is queued per figure and flushed when `toggleFreeze`
goes back to live – the cockpit's own status line already said "it will not
see this until you unfreeze", and now that sentence is a description rather
than an apology. And a received edit is persisted the way a local one is
(dgeSaveLocal's rule, applied in dgeApplyRemoteEdit): without that, reopening
the editor on the peer's window loaded the pre-edit source, and the next
committed gesture broadcast original-plus-delta – silently reverting the
other window's work everywhere, which is the one divergence the sync exists
to prevent. `editor: speaker` needed a third piece: the projection ships no
compiler, so the edit message now carries the compiled figure and a shared
`dgSwapFigure` in the diagram runtime applies it – the same function the
editor itself uses, so the two paths cannot drift, and it refreshes the
focus-card clone, which used to keep the pre-edit drawing on the very screen
the room was watching.

The gestures got four corrections of the same shape as the grammar's own
no-op rule. Dragging a container or brace planned an `at` their statements
refuse – and because a selection commits as one splice, Ctrl-A-and-move was
reverted whole in any figure containing a container; they contribute nothing
now and say why only when grabbed alone. A drag at a beat moved only
`selection[0]`. A resize handle on a `grid` spliced `w`/`h` into a statement
that takes `cell` – it scales the cell now, which says the same thing in the
word the statement accepts. And the arrowheads row edited the `no-head`
*class* on an edge whose headlessness came from the `--` token: picking
"both" produced one reversed head, and every tail rebuild wrote `.no-head`
into the line. The parser marks the derived class (`autoClasses`), tail
rebuilds skip it, and the row rewrites the arrow token itself.

Two were plain input handling: `Number(value) || 0` turned a typo in the gap
or frac field into 0, and no gesture listened for `pointercancel`, so an
alt-tab mid-drag left the listeners armed and the next click anywhere
committed a preview the author had abandoned. One wiring (`dgeWireGesture`)
carries all seven gestures now: up commits, cancel aborts.

And one crossed the seam into the span table: `spanOf` found a keyed option
by scanning every bare token for the word, so an element *named* `w` – or a
placement that references one – was taken for the width keyword, and a panel
edit spliced over the wrong token. In `lectures/diagrams` that was not
hypothetical: the CBC figure's `dot x` answered `x.x` with its own name. Two
guards close it: positions 0 and 1 are never keywords, and neither is a token
in a reference slot.

### The visibility rule, and five statements the panel had not met · **done**

Two separate jobs that landed together, because both are the same complaint:
the editor knew things about a figure that it never said out loud.

**The rule that decides what is on screen was legible nowhere.** An edge is
only as visible as its two ends, a container as its members, a note as what
it points at – and a beat that reveals a tag reveals all three without naming
any of them. The step pane got that wrong in a way that was hard to notice,
because it was wrong in the direction of *saying less than the truth*:
`dgeStepChanges` diffs `dgStateAt`, and `dgStateAt` has never known the rule.
Measured on `lectures/diagrams` `#cbc`, whose second beat is exactly
`show @xor`, the pane listed six elements for a beat that puts nine on the
slide. The three it dropped were the three arrows into the XOR nodes, which
are the point of that beat.

The resolved answer was already in the room and being thrown away:
`dgePaintArt` parses the frames payload to hand it to the runtime and then
drops it. It is kept now, and a second pass over `frames[k].vis` supplies a
verb – *comes with its ends*, *goes with its ends* – for anything whose
resolved visibility crosses at the beat and which the state diff had nothing
to say about. Precedence runs the other way from the obvious one: a verb the
diff produced came from a line the author wrote and keeps its chip, or an
explicit `emph feed0, feed1, feed2` reads as a line doing nothing. The rule
fills the silence, it does not talk over the source.

The drawing had a matching hole with a plainer cause: `layoutDiagram` has no
box for an edge, so `dgeDrawBeatGuides` skipped every edge it was asked to
mark – including one a step named outright. It traces the painted line with a
polyline instead, at a finer dash than the accented mark a named element
gets, because "arrived behind something else" is a consequence rather than an
instruction. And the edge panel now says the rule in the same sentence the
drag refusal has always used, which is the first place in the editor it is
written down at all.

**The compiler changed underneath one of the editor's own no-ops while this
was being built.** `show edge-1` used to parse, pass the reference check,
write the state and then be discarded by the downhill clamp – so the pane's
show chip, which never consulted the kind, could produce a line that did
nothing *and* a chip asserting the opposite. Naming the element now overrides
the rule in both directions, so the chip means what it says and no gate was
needed.

**Then five statements the panel had not met.** `.diamond` and `.elbow`
joined the swatch rows, and both needed the rows to learn a distinction they
had not had: an option can be narrower than its slot. The five non-rect
outlines are refused on a container, so the panel had been offering four
clicks that could only come back as a refusal; `.elbow` is refused beside
`via`, so it is hidden on an edge that carries one. Filtering is display
only – the slot still knows every member, so a hand-written `.diamond` is
still displaced when another outline is picked.

`col`, `emph` and `calm` are the first options whose value is a list, and
they arrived in the size row as **dead fields**: `DG_KEYED_ATTRS` does not
carry them, so `spanOf` answered null and every keystroke came back as "give
it a placement first". A shim answers for `DG_LIST_OPTS` keys and defers to
`spanOf` for everything else, so the day those three names join the keyed
table it goes dark and can be deleted.

Three gestures were broken rather than missing, and all three silently. A
`table`'s `h` is one *row* and a `lanes`'s is one *lane*, but the resize
handle is on the frame – dragging the south edge of a four-row table wrote
the whole stack's height into the word that means one row. An elbow paints
three segments, so it grew three "add a waypoint" dots, every one of which
could only produce the compiler's refusal. And a `bars … series of` is the
one expanding statement that draws no frame, so its name resolved to no
element: clicking a column selected it and the next recompile dropped the
selection again, which reads as a dead click. It has a panel branch of its
own now, and a sentence saying the geometry belongs to the chart it joined.

`test/editor-steps.mjs` pinned the six-element count that was wrong; it pins
nine now, and asserts one of them carries the downhill verb.

### Every construct, driven rather than read · **done**

The question was narrow and the answer was not: can the editor display, select,
edit and drag *every* construct the language has, and do the guides and the
snapping behave for all of them? Answering it meant driving the built editor
over ninety-nine figures in four lectures, plus a planner sweep that flags the
silent-no-op signature directly – a gesture that plans edits, splices nothing
and refuses nothing. Ten defects came out, and eight of them are one shape: a
control that was there, looked live, and could not act.

**Two of them made the panel go dead after a click that had just worked.** A
marquee reads `DGE.boxes`, which holds every generated element, so dragging a
box over a twelve-column chart selected fifty ids – forty-six of them synthetic,
none of them with a span. Clicking a table's `@t-row-1` chip did the same with
three cells. Every field then answered "cannot be written" and every swatch did
nothing. Selection resolves through the owner now, and dedupes: fifty become
four, three become one.

**The edge label rows were wrong in both directions at once.** `.left` /
`.right` were offered on every edge, and on a horizontal one that is exactly the
compiler's *"names a direction this edge runs along, so it cannot move the
label"* warning; `.top` / `.bottom`, which do act there, were offered on no edge
at all. Which pair can act is only knowable once the line is routed, so each row
now asks the routed midpoint – the same `dgPolyPoint(pts, 0.5)` the compiler
asks – and offers the pair that crosses the line, plus whatever the line already
carries so it stays removable.

**A plot coordinate could not be dragged, and the status bar said it had been.**
`dgResolvePlotCoords` spends `roc@0.35` into `roc.left+n` before the model
exists, so a drag planned a nudge, `spanOf` found nothing to rewrite, the edit
was dropped, and the status line reported success. The delta is converted back
through the plot's own scale now and the value rewritten in the units the author
wrote (`roc@0.35` → `roc@0.41`), on placements and on waypoints. The backstop
matters as much as the fix: a gesture that plans edits and writes none now says
so instead of claiming it worked.

The rest are smaller and the same family. A `grid` showed two fields both
labelled `cell`, so typing a width into the first wrote it over the word that
says what a cell draws. A brace's `side` – the one word that moves a brace
bodily – had no control at all. Clearing a plot's x-axis title promoted the y
title into its slot, silently, on a figure that went on compiling. `at` had no
field, which left a borrowed coordinate and a plot value typeable nowhere. The
resize grips were constants in diagram units, so on a plot point at high zoom
they covered the element and every pointerdown resized it, which is why such a
point could never be moved. And the step pane's *"restyle and relabel with the
controls below"* read as "these write into this step" when they write on the
element's own line.

Six spec files grew to hold them, all against figures already in
`lectures/diagrams` rather than invented ones: 225 assertions became 281.

Two things were known-missing rather than broken. Both are built now, and the
entry below is what they cost.


### The guides that propose a statement, and a series that can be edited · **done**

§9.2 has always said what snapping should be here: *in a drawing tool it aligns
pixels; here every snap target corresponds to a statement the grammar can
write.* The middle four rows of its table were the part that did not exist, and
the fourth of them is the one the section calls the row that matters most –
**nobody types `at c1.cx,m0.cy` from a standing start.** It is the most valuable
construct in the coordinate grammar and the least discoverable, and a guide that
appears when a drag reaches another element's centre line is how it becomes
usable at all. §9.2a lists what the four write and how they are ranked.

Two decisions inside them are worth keeping. **The candidate lines are the
scalar coordinates of other elements matched against the dragged element's
centre**, because that is where `at X,Y` puts it – "left edges flush" looks like
the obvious fifth guide and is a trap, because writing it means
`at m0.left+<half my width>`, a number that stops being true the moment either
box is resized. And **a snap that puts the element back exactly where it started
still writes the relation.** That came out of driving it: the delta was zero, the
edit was skipped, the status bar named `sw.cy` and the source kept a bare `0`.
The author asked for the relation, not for the displacement.

The cost is nothing anyone will feel. On the densest figure in the tree the
whole `pointermove` handler moved from 6.24 ms to 6.15 ms, inside run-to-run
noise; the guide code alone is 3 to 9 microseconds. The recompile dominates, as
it always did, and the per-gesture caches keep the candidate walk O(n).

**The `series of` half was a smaller thing wearing a bigger disguise.** A
`bars … series of f` line draws columns into a frame it does not own, so it is
the one statement that produces no element carrying its own name – and the span
table keys off exactly that. It therefore had no entry, and nothing on the line
could be edited: values, classes, tags, `stacked`, all text-only. That reads as a
deliberate restriction and was an accident of how the table is built.
`model.statements` in `diagram-core.mjs` now holds one record per such statement
and `spanOf` walks it, plus generic support for a **bare word** off
`DG_BARE_OPTS`, which makes `stacked` a token when present and an insertion point
when absent – one shape, so it is a control rather than two branches at the call
site.

The panel offers the values, the grouping as a two-way swatch row (`side by
side` / `stacked`, named on both sides because "not stacked" is the other
reading rather than nothing), `emph` / `calm`, the class vocabulary rendered
*for a box* since a column is one, and the tags. It goes on refusing `w`, `h`,
`space`, a placement and a tick strip, which belong to the chart it joined.
`series of <chart>` itself stays a text edit: it is the middle of the statement
rather than a trailing option, and the question an author actually arrives with –
*which chart is this in* – is answered by the panel's sentence and its "Select"
chip.

Two specs were added, `editor-guides` and `editor-series`, and the suite went
from 281 assertions to 356.
### One gesture, one guide, one sentence · **done**

The last entry built the neighbour guides for the move gesture at beat 0. This
one is the consistency pass, and the reason it was worth a pass of its own is
that the failure was not a missing feature. A guide layer that helps while you
move and goes quiet while you resize teaches an author that dragging writes
their relations for them, and then withdraws the lesson without saying so -
**inconsistent help is worse than none**, because they stop trusting the model
they built and go back to typing. §9.2a lists what each gesture now offers.

Two decisions carry it. **The token a drag rewrites is the editor's problem,
not the author's**: at beat 0 a snap lands in the placement, at beat *k* in a
`move x to …`, and the guide says the same sentence either way. And **`same as`
belongs to the corner handle alone** - it copies both dimensions, so offering
it from a width-only drag would silently change the height, and the grammar has
no "w equals A's w" to offer instead. The edge handle copies a number a sibling
already carries, which is the gap guide's rule one axis over.

**The edge-box feature landed underneath this work and broke two assumptions in
it**, both worth recording because both were reasonable until the day they were
not. `dgeDrawGuides` read "no layout box means this is a line", so once every
edge had a box a selected arrow was marked with a rectangle. And `dgeHitTest`
sorts candidates by area to let a small element win inside a large one - a
straight edge's box has *zero* area, so it sorted in front of everything and
won every click inside its bounding rectangle, which also silently defeated the
`{ edges: false }` guarantee `dgeStartEdge` leans on. Both now ask
`el.kind === 'edge'` rather than inferring it from the absence of geometry.

Two consequences of that feature needed a ruling rather than a fix. **A marquee
still does not sweep edges up**: a marquee means "move these together", an edge
is the one thing that cannot be moved, and including them would put an element
that refuses into most selections. **A guide proposes an edge as a host only
when the author named it.** An anonymous `edge-3` is a *positional* name -
insert an edge above it and the name moves to another line, taking anything
placed against it somewhere else without a word. `named` on the model edge is
what tells the two apart, and the guide waits for an `{#id}`.

The suite went from 356 assertions to 449.

### A sequence's entries, and the ground the labels needed · **done**

`sequence` landed with no editor support at all – `grep -c sequence editor.mjs`
answered 0 – and the reason it looked like a decision is that it half worked:
clicking a message selected the *statement*, because `dgeOwnerOf` hands every
synthesized element back to the thing that drew it. For a chart column that is
right, and it is right for exactly one reason: the column names no line of the
source, so an edit against its name would rewrite the whole chart. **A sequence
is the one expanding statement whose entries are lines.** `actor u "User"`,
`note b "…"`, `u -> br "…"` each carry a label and an attribute tail the author
typed, so there is a span to rewrite and it is that line.

So the work was to tell the two apart rather than to add a mode. Each entry is
now tokenized at its own offset in the block body and carries `entry:
'actor' | 'note' | 'message'`, and three places read that word:
`createSpanTable` lets those three into the table, `dgeOwnerOf` stops
redirecting them, and `dgeKindOpts` reads its controls off the entry statement
instead of off the `box` and the `edge` they expand into – which take `w`, `h`
and `pad`, three words those lines refuse.

**What is deliberately not selectable is the more interesting half.** A
lifeline, a message number and a second line own no text on the line that
produced them. Handing one of them that line's span is precisely how a panel
comes to write the actor's label under the lifeline's name – the trap
`spanOf(id, 'label')` on a `bars` line already taught, one statement along. They
stay with the statement. The second line is still editable, as a *positional*
field on the message (`sub`, the second quoted token), because that is what it
is: `label` already resolves to the first string, and two textareas both reading
"label" would have been a coin toss over which string an edit landed in.

Three smaller things fell out of doing it:

- **The frame swallowed every click.** A sequence's frame is a `.bare .clear`
  box the size of the whole figure, and `dgeHitTest` lets a box beat an arrow
  crossing it. That rule already had an exception for a container and a brace –
  "an arrow wins over the holder it runs through" – and a statement's frame is a
  holder by the same reading. The clause is written as *an arrow that is not
  this frame's own*, so a chart's baseline still selects its chart.
- **`unnumbered` had no control anywhere**, because the bare-option lookup was
  keyed on `el.kind` – a frame is a `box` – rather than on the statement. Same
  fix as `dgeKindOpts`, one line, and the frame gets the checkbox `stacked`
  already is on a series.
- **An entry cannot be dragged**, and `dgePlanDrag` now says so in its own
  words instead of letting a message fall through to "an edge follows its
  endpoints", which is true of every edge and useless about this one.

The other half of the entry was not an editor problem at all but showed up the
moment the panel could reach it: **a message label had no ground, so every
lifeline in the figure ran through the words**, and `{.paper}` – the construct
that exists for exactly this – made it worse rather than better, swallowing the
whole arrow. The edge emitter reads a fill with no side as "put the words *on*
the line", so the fix is that the expansion writes the side as well as the
ground, and writes both by default because a lifeline crossing a label is not an
exception. `CLAUDE.md` carries the detail.

The suite went from 449 assertions to 493.
