# The diagram editor

Spec and build plan for the graphical editor for `::: diagram`. Companion to
`PRD.md` §4.6a (the grammar) and `speaker.md` (the sync protocol it borrows).

Status: **plan only.** Nothing here is implemented. The grammar it edits is
frozen enough to build against – three constructs in it exist specifically so
this editor can answer a drag without destroying what the author wrote (see
§3).

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

## 2. The three decisions

### 2.1 Where it ships

**In both live views, whenever the lecture contains a diagram; off in print;
`editor: none` in the frontmatter turns it off.** That mirrors two existing
patterns exactly – the KaTeX stylesheet is emitted only into views that contain
a formula, and `fonts: none` is how an author declines a payload they do not
want.

Cost, measured: the compiler section of `build.js` is **2164 lines / 100 KB**,
of which the CSS and the step runtime (265 lines) already ship. So the
compiler the editor needs is ~1900 lines / **~88 KB raw**, plus the editor UI
itself – call it 150 KB total, in a file that already carries 276 KB of fonts
and up to 254 KB of KaTeX faces. Proportionate, not free, and `editor: none`
is the answer for an author who disagrees.

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
chunk id (which is frozen once authored and is the anchor for cross-references,
TOC entries and sync snapshots), writing the heading, writing the caption
prose. Those are text, and a text editor is already open.

Two things make that seed cheap:

- `node build.js --new <slug>` gains an empty figure chunk in its scaffold, so
  a fresh lecture ships with one to copy.
- The editor's **"New figure…"** produces the whole chunk – heading, id, block
  – on the clipboard, for the case where no text editor is open (a student in
  `audience.html`, an author on someone else's machine). It is a convenience,
  not the path.

### 2.3 Where an edit goes

Three tiers, in the order they should be tried.

**Tier 1 – `--watch`: write back through the socket that already exists.**
This is the author's loop and it is the cheapest of the three, because
`runWatch` already holds a WebSocket to every open tab. Today it is one-way
(`'reload'`). Make it two-way: the editor sends `{type:'patch', nonce, range,
text}`, the server splices that byte range into `source.md`, `fs.watch` fires,
the normal rebuild runs, every tab reloads. **`source.md` stays the single
source of truth and the editor never owns a parallel copy.**

Three things that must be true before this ships:

- Bind the WebSocket server to `127.0.0.1`. It currently omits `host`, so it
  listens on every interface – worth fixing regardless of the editor.
- A per-build **nonce** in the HTML, required on every patch. Without it any
  page in the browser that guessed the port could write to the author's disk.
- The server accepts a patch only if its range matches a `::: diagram` block
  that build actually emitted, and re-reads the file first, so a patch computed
  against a stale buffer is refused rather than applied at the wrong offset.

**Tier 2 – the clipboard.** Always available, every browser, `file://`
included. The editor copies the rewritten block (or the whole chunk, for a new
figure) and says so. This is the same idiom as `Shift`-`E`, which exports live
annotations as a marker-wrapped snippet for `--integrate-annotations`, so it is
a move the product already makes.

**Tier 3 – File System Access, opportunistically.** `showSaveFilePicker` /
`showOpenFilePicker` exist and are *reachable* from `file://` in Chromium –
measured: `isSecureContext` is true, the functions are present, and calling one
under a user gesture rejects with `AbortError` (no dialog in a headless
browser), **not** `SecurityError`, so the call is not blocked by the opaque
`file://` origin. Two honest caveats: I could not complete a real dialog
headlessly, so "the picker opens" is inferred from the absence of a security
rejection rather than observed; and *persisting* the handle across reloads goes
through IndexedDB under that opaque origin, which is the same ground on which
`BroadcastChannel` already fails between two `file://` tabs (see `speaker.md`
§2). So expect "pick the file every session", not "remember my source.md".
Firefox and Safari have neither function at all. Feature-detected upgrade,
never the plan's load-bearing path.

**Tier 0, for the reader – `localStorage`.** A student's edit has nowhere to
go: their `audience.html` is a build artefact, gitignored, regenerated. So it
goes on the same shelf as `revealed[]` and the theme preference, keyed by chunk
id, and the figure shows their version with a quiet "edited · revert" marker.
Plus "Copy source" to take it away. It never touches disk and it never syncs to
the speaker window.

## 3. What the grammar already promises

Three constructs state a *relation* rather than a number, and an editor that
answers a drag by replacing them with absolutes destroys the thing they exist
for. The grammar is shaped so it never has to (this is already in `CLAUDE.md`;
restated here because it is the editor's contract):

- **A coordinate component carries its own signed nudge** – `x0.cy`,
  `mix.cx+0.2`. One optional signed term, no other operators, no nesting, so
  the token to replace is always exactly one and the reference survives.
- **`align` / `spread` name a set with a master.** Dragging the master moves
  the group. Dragging a follower on the constrained axis is a different act.
- **A tag default is shared.** Resizing one element that draws its width from
  `default box @dec w 0.48` writes an explicit `w` on *that element* – "just
  this one" is the safe reading of a drag. Changing the default is a deliberate
  act on the default's own line.

## 4. The drag policy

This is the design. Everything else is UI.

An element's position comes from exactly one placement expression, and the
editor's job is to decide which token that expression's drag belongs to:

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
  explicit `w`/`h` on that element. Same reading as the tag default: a drag
  means "just this one".
- **Creating an element** does not write `at X,Y` if it can avoid it. Dropped
  roughly axis-aligned beside an existing element, within a tolerance, the
  editor proposes `right of A gap 0.6`; otherwise `at X,Y`. The proposal is
  text, and it is visible before it is committed –

**The status bar always shows the line the editor is about to write.** That is
worth more than it sounds. It makes every drag legible as a diff, it is how the
author keeps trusting the tool, and in a lecture tool it means a student
learns the DSL by dragging things.

**Deleting** an element lists what else refers to it rather than leaving a
block that will not compile – *"`mix` is named by 3 lines: edge on 7, `align x
center` on 14, `show` on 19. Delete all four?"*

## 5. Architecture

### 5.1 One compiler, two runtimes

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
`DG_ALIGN_X/Y`, `DG_SCALAR_X/Y`) instead of mirroring them. That is seven
tables that currently have to be changed in two commits' worth of places.

Four Node-only leaves have to come out of the core and be injected: image
resolution (`fs`), aspect reading (`fs`), the `[diagram]` warning sink, and
`escapeHtml`. In the browser, images are already resolved – the compiled SVG
carries the data URI – so the editor injects a lookup table of
`id → {href, aspect}` emitted alongside the frames payload.

### 5.2 Source spans

The parser records `line` today. It needs, for every token it consumes, a
`[start, end]` offset into the block body. `dgTokenize` already walks the line
character by character, so it is a matter of carrying the offset through rather
than a new pass.

The concrete deliverable is: given an element id and the name of one attribute
(`gap`, `w`, `frac`, the x-component of `at`, the `align` word), return the
exact span to replace, or the insertion point if the attribute is absent. Every
edit in §4 is one call to that.

### 5.3 What the editor is, structurally

A modal overlay over the focus card, holding:

- the live SVG (the compiler's own output, re-emitted after each edit);
- a selection layer of handles, drawn in viewBox coordinates so it survives
  zoom and the auto-fit scaling;
- a properties panel exposing the closed class vocabulary, the geometry
  options for that kind (`DG_KIND_OPTS`), the label, tags;
- a source pane, editable, two-way: type in it and the canvas re-renders; drag
  on the canvas and the changed token highlights;
- the status bar from §4;
- undo/redo over **source text snapshots**, not over a model. Cheap, exact,
  and it cannot desynchronise from what will be written.

## 6. Phases

Each phase is shippable on its own and verified the way this repo verifies
things: a real figure rebuilt, before-and-after compared, no console errors in
a browser sweep.

**Phase 1 – the seam.** Extract `diagram-core.mjs`; `build.js` imports it;
`lint.js` imports its tables and drops seven mirrored copies. No behaviour
change: all three lectures build byte-identically, `lint --strict` clean.
*This phase is worth doing whether or not the editor follows.*

**Phase 2 – spans.** Every token carries `[start, end]`. Add the span lookup.
Verify by round-tripping: for every element in every example diagram, replace
each attribute span with itself and assert the body is unchanged.

**Phase 3 – read-only canvas in the browser.** Ship `diagram-core.mjs` into
the live views behind the `editor:` frontmatter key, re-render the diagram from
source at boot, and assert the result is identical to the build's own SVG.
This is the whole risk of the "one compiler, two runtimes" bet, cashed early
and cheaply: if the browser and Node disagree, better to find out here.

**Phase 4 – select, drag, resize.** The §4 policy table for placements and
sizes. Status bar. Undo. Still no persistence – edits live in memory and the
"Copy source" button is the only way out. Usable already.

**Phase 5 – persistence.** Tier 1 (watch write-back, with the nonce and the
`127.0.0.1` bind), then Tier 0 (`localStorage` for readers), then Tier 2
(clipboard is already there from phase 4) and Tier 3 as a feature-detected
upgrade.

**Phase 6 – create and delete.** New element with the relation heuristic;
delete with the reference list. "New figure…" producing a whole chunk.

**Phase 7 – steps.** A beat timeline. Selecting beat *k* shows that state;
dragging then writes a `move` op into step *k* rather than into the element's
placement. This is a mode and it has to look like one – it is the one place
where the same gesture means two different things.

## 7. Open questions

- **Does the room ever see this?** The editor is in `audience.html`, which is
  the projected view. The focus-card entry point keeps it two gestures away,
  but a lecturer editing on the projector is a thing that will now happen. Is
  that fine, or should the audience view's editor be read-only-plus-copy, with
  writing reserved for the cockpit?
- **Does an edit sync to the speaker window?** Everything else on the slide
  does. A diagram edited in one window and not the other would be the first
  divergence in the product. The freeze gate suggests the answer – a lecturer
  should be able to edit a frozen projection – but the state-ownership matrix
  in `speaker.md` §2 has no row for this yet.
- **Two-way source pane, or one-way?** Editing text and dragging simultaneously
  is where round-tripping editors historically fall apart. Starting one-way
  (canvas writes, pane displays) is the safe opening move.
