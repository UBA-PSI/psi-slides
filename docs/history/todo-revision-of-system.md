# Revising the `::: draw` language – findings, and the job

**Status: working document.** Input to a two-stage review. Nothing here is a
decision; every item is a defect statement with the evidence that produced it.

## Why now

`::: draw` is development state on `claude/network-security-figures`. It is
not in any release, and CLAUDE.md is explicit about what changes at the first
tagged one: *"`::: draw` becomes frozen source-format the moment it is in a
tagged release."* So the window for anything that changes what existing source
means, or what it draws, is open now and closes at that tag.

## What a revision has to be

A proposal earns its place only if it is **strictly better** on at least one of
these and worse on none:

- resolves an ambiguity, or removes a word that means two things
- reduces the chance of a human *or a language model* writing a figure wrong
- makes the language more consistent, or more concise
- turns a silent or spurious failure into an explicit one
- makes the language easier to learn or more self-describing

And two hard constraints:

- **No functionality may be lost** – not in writing figures by hand, and not in
  the graphical editor.
- **The principles stated in `docs/artifact/figures-you-write.html` must still
  hold.** They are allowed to be opinionated; they are not allowed to be
  contradicted by the language they describe.

## How the findings were produced

Not read off the docs – measured. A probe harness drives the compiler directly:

```js
import { createDiagramCompiler } from './diagram-core.mjs';
const warns = [];
const core = createDiagramCompiler({
  resolveImage: () => null, imageAspect: () => null,
  warn: (m) => warns.push(m),
  escapeHtml: (s = '') => String(s), assetMarkup: () => '', resetAssets: () => {},
});
core.renderDiagram(body, headAttrs, {});   // throws with every error, or returns the figure
```

`renderDiagram` returns the full `<figure>`: the static SVG (which **is** the
print state) followed by the frames payload. Splitting on `<script` gives the
print drawing; `dg\d+-` is the per-figure id prefix and has to be normalised
away before two renders can be compared. Geometry was read out of the emitted
`<rect>` attributes in px. 280 (kind, class) combinations were swept.

---

# The thirteen

Numbering is stable. Items 1–7 came from a first pass over the language as
designed; 8–13 from the measured sweep.

---

## 1. `emph` has three grammatical roles, and `calm` sets `.dim`

`emph` is a **step op** (`emph a`), an **option** on `bars` and `table`
(`emph 1,3`, taking column indices), and a **class** (`{.emph}`). Separately the
step verb is `calm` but the class it sets is `.dim` – one concept, two words,
neither guessable from the other. The two surfaces are perfectly disjoint:

```
step s / calm a       ->  builds
box a "A" {.calm}     ->  unknown class .calm
step s / dim a        ->  unknown statement "dim"
box a "A" {.dim}      ->  builds
```

**Time-boxed.** Renaming either half is a source-format change.

Note the two `emph` spellings are not redundant with each other: `bars f … emph 1`
is the *opening* state of a column, `step s / emph f-1` is a beat. Both are
wanted. It is the *word* that is overloaded, not the capability.

### Editor perspective

**What the editor does with this today.** All three roles are in the sidebar,
under three different names, in three different kinds of control:

- the **step op** is two of the four act buttons in the step pane
  (`editor.mjs:5183-5195`), captioned with the op word itself and titled
  "emphasise" / "push back"; they write `emph <ids>` / `calm <ids>` through
  `dgeAddStepOp` (`editor.mjs:5891`);
- the **class** is the `softness` swatch row (`DGE_SLOTS`, `editor.mjs:437-438`),
  whose four swatches read `full · ghost · dim · emph`;
- the **option** is a text field in the size row, and a second one in the series
  pane (`editor.mjs:4368-4386`, `4640-4676`), hinted from `DGE_LIST_HINT`
  (`editor.mjs:5296`) as "column numbers from 0".

And a fourth spelling: `DGE_VERBS` (`editor.mjs:5993-6001`) reports an element
that gained `.dim` in a beat as the verb **"calmed"**.

**What a user hits.** One sidebar shows a button called `calm`, a swatch called
`dim`, a field called `emph` and a chip reading "calmed", and nothing in it says
that the first two are one concept or that the third is a different one. The
mapping is guessable in exactly one direction: a user who clicks `calm` and then
looks at the source pane sees `calm a` and can find no `.calm` in the swatch row
to match it.

**What a revision must not break.** The separation of the three surfaces is a
capability, not an accident. `dgeBeatNote` (`editor.mjs:5233`) and the step
pane's closing hint (`editor.mjs:5220-5227`) exist to tell an author that a
swatch click landed on the element's own line and not in the beat they are
standing on – that sentence needs the class and the step op to stay
distinguishable *in the source*, whatever they are called. The option needs to
keep a keyword the span table can find (item 14).

**What a revision could newly enable.** One word for the class and the step op
would let the softness row and the two step buttons be the same row: write
`emph a` into the step when standing on a beat, `{.emph}` on the line at beat 0.
That is what a user reading the panel already assumes it does, and it is the
reading `dgeBeatNote` currently has to talk them out of.

## 2. One typo produces five errors

```
box b "B" rightof a gap 1
  -> unexpected "rightof" in box b
  -> unexpected "a" in box b
  -> unexpected "gap" in box b
  -> unexpected "1" in box b
  -> box b has no placement (at X,Y / below … / above … / right of … / left of … )
```

Four token complaints plus a consequence. A newcomer's first failure reads as
five failures.

**The mechanism is narrower and more fixable than it looks.** Error quality
splits by statement family, and backwards:

```
bars f "3,5" … gap 1   ->  unexpected "gap" in bars f – this statement takes a
                           placement, "same as <chart>" and w / h / space /
                           emph / calm / aspect
text t "n" … space 1   ->  unexpected "space" in text t
                           unexpected "1" in text t
```

The six **expanding** statements (`bars`, `grid`, `plot`, `table`, `lanes`,
`sequence`) answer a bad option by listing what they accept. The six
**primitives** a newcomer meets first (`box`, `text`, `dot`, `edge`,
`container`, `brace`) say only "unexpected X", once per leftover token. The good
message already exists in the codebase; it is not wired to the statements that
need it most.

### Editor perspective

**What the editor does with this today.** The source pane is **read-only** –
`dgeSourcePane` (`editor.mjs:5674-5706`) renders the block as `<span>`s with the
error lines marked, and its own header comment says so: *"One way, for now: the
canvas writes and the pane displays."* Every token the panel emits is generated:
directions from `DGE_DIRS` / `dgePlaceText` (`editor.mjs:1351-1356`), classes
from `DGE_SLOTS`, option keywords from `DG_KIND_OPTS`. So a panel user cannot
type `rightof`, and cannot reach item 3's `space`-for-`gap` at all: `gap` lives
in the placement pane and `space` in the size row, two panes apart, and
`dgeKindOpts` never offers `space` on a `box` or a `text`.

**What a user hits.** The refusal path, and there the editor shows **one
sentence**. `dgeSetSource` (`editor.mjs:2770-2812`) rolls a non-compiling edit
back, then reports `DGE.problems[0]` and nothing else – and because the rollback
recompiles the clean source, `DGE.problems` is empty by the time
`dgeSourcePane`'s problem box is redrawn, so the other four are gone. Which one
survives is source order. Measured through the probe harness:

```
box b "B" rightof a gap 1    ->  problems[0] = unexpected "rightof" in box b
box b "B" above of a gap 1   ->  problems[0] = unexpected "a" in box b
```

The first is the useful one; the second is the useless one (see item 8).

Five panel fields already carry hand-written refusals rather than let the
compiler speak: an empty endpoint (`editor.mjs:4478-4484`), a non-numeric `gap`
(`5578-5585`), a non-numeric `frac` (`5613-5620`), an empty `at` (`5535-5542`),
a malformed step name (`5919-5922`). That is the measure of the gap – five
sentences written by hand because the compiler's would not fit in a status bar.

**What a revision must not break.** Nothing here rests on the wording. But
`dgeSetSource` shows exactly one line, so anything that makes `problems[0]`
reliably the *cause* rather than the first leftover token is worth more to the
editor than to a terminal.

**What a revision could newly enable.** One sentence per statement – the shape
the six expanding statements already have – is exactly the shape the editor
needs, because it can only display one. Closing item 2 for the primitives would
let three or four of those five hand-written refusals be deleted rather than
maintained in parallel with the compiler's.

## 3. `gap` vs `space` is caught but not explained

```
text t "note" right of b space 1
  -> unexpected "space" in text t
  -> unexpected "1" in text t
```

The build knows the kind and knows `text` takes `gap`. This is the grammar's
most confusable pair – the artifact page spends a caveat card on it. Closing
item 2 for the primitives closes this one too, without a "did you mean".

### Editor perspective

**What the editor does with this today.** It separates the pair by *position*
rather than by a message. `gap` is a number field in the placement pane
(`dgePlacementPane`, `editor.mjs:5568-5586`), beside the `side` swatches and the
`of` reference – the three things a placement says. `space` only appears in the
size row, and only on the statements that take it: `dgeKindOpts`
(`editor.mjs:467-478`) reads the options off the *statement*, so a `box` is
offered `w h pad` and a `bars` frame is offered `w h space emph calm aspect`.
A panel user therefore never meets the choice.

**What a user hits.** Nothing, through the panel. Through the source, the
editor's single-sentence refusal (see item 2) at least shows the right one here:
`problems[0]` for `text t "note" right of b space 1` is `unexpected "space" in
text t`, which names the word and the kind.

**What a revision must not break.** The panel's split is the proof that the two
words are separable by context rather than by name: `dgeKindOpts` keying on the
statement is what puts `space` where it belongs and keeps it off a `box`. That
mechanism has to survive whatever the words end up being called.

**What a revision could newly enable.** If the primitives learned to answer a
bad option by listing what they accept, the editor's status bar would print
that list – which is the panel's own size row, written out as a sentence for
whoever is not using the panel.

## 4. The build is silent about contradictions inside the vocabulary

Every same-slot pair and every `DG_CLASS_CLASHES` row builds without a word.
Only `lint.js` warns. Anyone running `build.js` alone never hears it:

```
edge a -> b {.emph .dim}      ->  silent
box a "A" {.tone-4 .accent}   ->  silent
box a "A" {.turn .left}       ->  silent
box a "A" {.mono .serif}      ->  silent
box a "A" {.round .sharp}     ->  silent
```

The page tells readers that anything outside the vocabulary is refused at build
time – true – but the adjacent failure is not.

**Related, and worse:** the lint warning misleads on inert pairs.
`edge p -> q {.hex .diamond}` warns *"which one the drawing takes is not decided
by this line"* when in fact neither is ever taken (see item 10).

### Editor perspective

**What the editor does with this today.** Same-slot pairs are impossible in the
panel by construction: `dgeSetSlot` (`editor.mjs:4833-4870`) filters *every*
name in the slot out of the class list before pushing the one that was clicked.
That is the strongest argument `DG_CLASS_GROUPS` has, and it is the editor's.

`DG_CLASS_CLASHES` is a different table, and it is referenced in exactly one
place in the repo – `lint.js:311`. Nothing in `editor.mjs`, nothing in the
compiler. Both members of every clash row sit in two *different* rows of
`DGE_SLOTS`, and both are clickable.

**What a user hits.** Two clicks, twice over:

```
fill -> tone-4        then   ink -> accent          (DG_CLASS_CLASHES row 1)
reading -> up         then   label across -> left   (rows 2 and 3)
```

Afterwards both rows show their own pick pressed – `dgeSlotValue`
(`editor.mjs:4820-4831`) reads each slot independently – the drawing does not
change, and nothing anywhere says which one won. The editor *does* have a
channel for this: `dgeSourcePane` prints every entry of `DGE.warnings`
(`editor.mjs:5700-5702`), which is the compiler's `warn()` sink. A class clash
never reaches it.

**What a revision must not break.** `dgeSetSlot`'s displacement. Any regrouping
of `DG_CLASS_GROUPS` lands in `DGE_SLOTS`, and one-choice-per-row has to stay
true or the panel starts producing the pairs it currently cannot.

**What a revision could newly enable.** This one is free on the editor side. If
the build emitted a warning for a `DG_CLASS_CLASHES` row, the editor would print
it in the problem box with **no code change at all**. A warning carrying the
element's id could go further and grey the losing swatch – the row already knows
which classes are in play.

## 5. `.left` / `.right` mean two different things by kind – and `align` is three things

Documented in CLAUDE.md; nothing in the name signals which reading applies.
Label alignment inside its own padding on a `box`; which side of the line on an
`edge`.

**It is a three-way collision, not two.** `align` is a statement
(`align a,b,c`), a placement option (`align top`), and the concept the four
classes express. This builds clean, with two unrelated `top`s on one line:

```
box b "B" right of a gap 1 align top {.top}
```

`align top` lines b's top edge up with a's. `{.top}` puts b's *label* at the top
of b's own padding.

And the placement option's centre value is named by axis:

```
right of a align middle   ->  ok        right of a align center   ->  error
below a    align center   ->  ok        below a    align middle   ->  error
```

`middle` and `center` are one concept with two words. `DG_ANCHORS` uses a third
spelling of the same idea (`center`, plus `tl`/`tr`/`bl`/`br`).

### Editor perspective

**What the editor does with this today.** All three `align`s are in the panel,
under three different names, and the middle one has no control at all:

- the **statement** is the "line them up" block (`editor.mjs:4688-4712`), whose
  buttons read `left edges` / `centres` / `right edges` and carry
  `align x left …` as their title;
- the four **classes** are the `label across` and `label down` rows
  (`DGE_SLOTS`, `editor.mjs:430-433`);
- the **placement option** has no field, no swatch and no chip. It is written
  only by a cross-axis drag that lands within tolerance of an edge
  (`editor.mjs:2537-2557`), and drawn in the guide layer as an unlabelled
  hairline (`editor.mjs:1112-1120`) – while the `align` *statement* gets a
  caption on the same canvas reading `align x left` (`editor.mjs:1162`).

The two spellings of the centre are hardcoded in the editor. `editor.mjs:2542`:

```js
const words = main === 'x' ? ['top', 'middle', 'bottom'] : ['left', 'center', 'right'];
```

and `dgeRelText` (`editor.mjs:1975`) omits the option when it equals `'center'` –
which is the neutral word for only one of the two axes. So a `right of a align
middle` is written back out in full where a `below a align center` is dropped:
the default check knows one spelling of a concept that has two.

**What a user hits.** A canvas that can carry, at the same time, an `align x
left` caption over one hairline, an `align top` snap over another that the panel
cannot name, and a `.top` swatch pressed in a row called "label down". Three
different things, one word, and nothing in the sidebar to tell them apart.

**What a revision must not break.** The drag-snap at `editor.mjs:2537-2557` is
the only writer of the placement option, and it is the gesture the whole
placement pane is built around. `dgeRelText` has to keep carrying the option
through a `move … to`, or a step silently resets an alignment.

**What a revision could newly enable.** Giving the placement option a name of
its own is the precondition for it getting a row: today it cannot have one,
because "align" is taken twice in the same sidebar and a third label would be
indistinguishable. Settling `middle` / `center` on one word deletes the
axis-keyed table at `editor.mjs:2542` and makes the default check at 1975
correct on both axes instead of one.

## 6. `unit` makes a non-square cell – and `gap` is the real victim

Three separate figures in `lectures/network-security` carry a comment warning
about it: *"two numbers that look square draw something three times wider than
it is tall."* When the tool's author needs the same warning in three figures,
that is where newcomers will fail.

**It is not confined to `bars` / `plot` `w`/`h`. It is in `gap`, the most-written
option in the language.** Measured, default `unit` (`DG_UNIT = [120, 72]`):

```
gap 1 rightwards ....... 120 px
gap 1 downwards ........  72 px
pad 1 either way .......  72 px
w 1 / h 1 .............. 120 x 72 px   (1.67:1)
at 1,1 step ............ 120 x 72 px
```

**And the default is not what the corpus uses.** Measured across all 110
`::: draw` blocks in `lectures/diagrams`, `lectures/network-security` and
`docs/artifact/figure-rules`: **109 of 110 set their own `unit=`**, and the
median cell is **2.88:1**, not the default's 1.67:1 (`unit=150x52` alone accounts
for 38 blocks). So in the figures people actually write, `gap 1` rightwards buys
close to **three times** the distance it buys downwards. Two consequences: the
numbers above understate the defect, and *changing `DG_UNIT` would fix almost
nothing*, because one block in the entire corpus takes it.

So a 2x2 arrangement written with one number throughout:

```
box a "A"
box b "B" right of a gap 1     ->  120 px gutter
box c "C" below a  gap 1       ->   72 px gutter
box d "D" right of c gap 1
```

comes out with visibly uneven gutters, which **silently breaks the first rule
the artifact page teaches**: even gaps say nothing, uneven gaps mean something.
And `pad` is square (uh on both axes) while `gap` is not, so two clearance words
on adjacent lines use two unit conventions with nothing to say so.

**Time-boxed.** Squaring `gap`, or squaring the default cell, redraws every
existing figure without changing a character of its source.

### Editor perspective

**What the editor does with this today.** It computes in pixels and divides by
the right axis unit, at roughly twenty sites – `dgeUnits` (`editor.mjs:971-974`)
and every gesture that reads it (`1366`, `1758-1762`, `1953-1995`, `2195-2228`,
`2479-2494`, `2588-2626`, `3306`). A drag therefore always writes a number that
means what the drawing shows, and `dgeRedock` (`editor.mjs:1362-1385`) picks the
divisor off the new side:

```js
const gap = Math.max(0, snap(gapPx / ((dir === 'right' || dir === 'left') ? uw : uh)));
```

So the editor is the one consumer of the language that never trips over this.
Two places are the exception, and both are on screen.

**What a user hits.** First, `dgeDrawRelations` (`editor.mjs:1101-1110`) labels
the gap on the canvas with the number written on the line. Select each of the
two boxes in this item's 2x2 example and the canvas carries two labels reading
`gap 1` over spans of 120 px and 72 px, in the same picture.

Second, and worse: **the `side` swatch row carries the number across the axis
change.** `editor.mjs:5564`:

```js
onclick: () => { if (d !== p.dir) write(dgePlaceText(d, p.ref, p.gap)); },
```

One click on `below` in a `right of a gap 1` placement writes `below a gap 1`,
the visible distance drops by 40%, and the status bar says nothing because the
edit compiled. It is the panel's own re-docking control and the only act in the
editor that silently changes a distance.

**What a revision must not break.** Nothing rests on the asymmetry. Every editor
site is already written as `axis === 'x' ? uw : uh`, so squaring `gap` is
mechanical – but it has to be *all* of them in one commit, because a
half-converted editor writes numbers the compiler reads on the other convention,
and that failure is silent in exactly the way this item is about.

**What a revision could newly enable.** `dgeRedock` and the `side` swatch row
become the same operation: keep the number, change the word. That is what both
were written to be, and today only one of them is.

## 7. "A small language" undersells the surface

17 statements, 7 step ops, 40 classes in 13 slots, ~25 option words, three
sub-grammars that read continuation lines. The old number strip on the artifact
page advertised this and read as bragging; removing it does not answer the
question a newcomer actually has, which is *will this list keep growing under
me.*

CLAUDE.md's bar for adding a statement is a good answer and is currently only
stated internally:

> build it out of what exists first, and only add a word when the hand-built
> version is the thing that cannot be maintained.

Worth saying on the page, verbatim.

### Editor perspective

**What the editor does with this today.** It is the only place the surface is
counted out loud, and its count is higher than the grammar's. `DGE_SLOTS`
(`editor.mjs:360-441`) is **16 rows** to `DG_CLASS_GROUPS`'s 13 slots: it models
`.turn`, `.front` and `.bold` – the three classes CLAUDE.md lists as contending
with nothing and stacking freely – as one-member slots named `reading`, `depth`
and `text weight`, because a swatch row needs an "off" to be a row at all.

Alongside those 16 rows the sidebar carries a label field, an ends pane, a
waypoint pane, a placement pane (kind + side + reference + gap), a data pane
(`DGE_DATA_FIELDS`, `editor.mjs:5253-5293`), an aim row, a brace-side row, a
numbering row, a series row, a grouping row, a size row of up to six fields, a
tag pane, up to nine selection acts, and a step pane with four act buttons.

**What a user hits.** Nothing that is a defect. This is a measurement, not a
complaint: the panel is what the surface looks like to someone who never reads
the grammar, and it is 16 rows plus a dozen panes.

**What a revision must not break.** Nothing.

**What a revision could newly enable.** If the page wants a number, the sidebar
is a more honest one than "17 statements": it is what a person has to look at.
And it makes the bar for adding a word concrete in the other direction too –
a new word arrives as a new row, and a removed word takes one away.

## 8. `above` / `below` refuse the `of` that `right of` / `left of` require

Two of the four cardinal placements take a preposition and two refuse it:

```
box b "B" right of a gap 1    ->  ok
box b "B" left of a gap 1     ->  ok
box b "B" above a gap 1       ->  ok
box b "B" below a gap 1       ->  ok
box b "B" above of a gap 1    ->  error
box b "B" right a gap 1       ->  error
```

**And the typo misparses rather than erroring cleanly.** `above of a` binds `of`
as the element name:

```
box b "B" above of a gap 1
  -> unexpected "a" in box b
  -> unexpected "gap" in box b
  -> unexpected "1" in box b
  -> box b refers to "of", which is not defined
```

Someone generalising from the line above is told their *reference* does not
exist. This is the worst first-hour experience in the language.

Accepting `of` on all four is purely additive – it is an error today, so no
existing source can be using it. Dropping `of` from `right of` / `left of`
would be breaking.

### Editor perspective

**What the editor does with this today.** The asymmetry is one line.
`dgePlaceText` (`editor.mjs:1351-1354`):

```js
const word = (dir === 'right' || dir === 'left') ? dir + ' of' : dir;
```

Every placement the editor ever writes goes through it – the ordinary drag,
`dgeRedock`, the `side` swatch row, the four docking chips, `dgeRelText`, and
the `move … to` a drag at a beat produces. So the panel and the gestures cannot
produce `above of`, and a user driving the editor never meets the asymmetry.

**What a user hits.** Only through the source, and there it is the worst case in
the file, made worse by the editor. `above of a` yields `problems[0] =
unexpected "a" in box b`; `dgeSetSource` shows that sentence alone and discards
the other three, so the one message that explains what happened – *"refers to
'of', which is not defined"* – is fourth and is never seen at all.

**What a revision must not break.** `dgePlaceText`. It is the single writer, and
`DGE_DIRS` (`editor.mjs:1356`) is the single list of the four words.

**What a revision could newly enable.** Accepting `of` on all four makes
`dgePlaceText` unconditional – `dir + ' of ' + ref` – which is four words instead
of a conditional, and makes the string the editor writes and the string a
newcomer guesses the same string. That is the cheapest item in the file from the
editor's side: it deletes a special case rather than adding one.

## 9. `{#id}` is honoured on two statements out of seventeen, and silently discarded on the rest

`attrs.id` is read at exactly one site in `diagram-core.mjs` – the `edge` branch,
**line 3743** – plus a `sequence` message line. On `box`, `dot`, `text`, `image`,
`container`, `brace` and all six expanding statements the id parses, validates as
a legal attribute tail, and is thrown away:

```
box a "A" {#zz}
text t "n" right of zz gap 0.3   ->  text t refers to "zz", which is not defined
```

It is not even checked where it is discarded:

```
box a "A" {#constructor}   ->  silent
box constructor "A"        ->  "constructor" is reserved – it already names a
                               property every JavaScript object has …
```

A silent no-op in the **naming** layer, which is the layer everything else
references. Verified: **no lecture in the repo writes one**, so either direction
(make it name the element, or refuse it) is safe.

### Editor perspective

This is the item with the largest editor consequence, and it is data loss.

**What the editor does with this today.** There is **no rename control anywhere
in the panel.** An element's name is the second token of its statement, and the
only code that ever rewrites one is `dgeDuplicate` (`editor.mjs:4180-4186`) and
the paste-time collision renamer `dgeRenameIn` (`editor.mjs:6333-6355`). The
source pane is read-only. So a name, once written, cannot be changed through the
editor at all – on any kind.

`#id` is honoured on an edge, and `dgePlanTail` knows it (`editor.mjs:4919-4924`):

```js
const wantId = changes.id !== undefined ? changes.id
  : (isEdge && !/^edge-\d+$/.test(el.id) ? el.id : null);
```

On every other kind `wantId` is null. And `dgePlanTail` rewrites the **whole
attribute tail**: measured, `spanOf(id, 'id')`, `spanOf(id, 'classes')` and
`spanOf(id, 'tags')` all return the same `{…}` span, by design
(`diagram-core.mjs:1878-1885`), because the tail is one token and the editor
rebuilds it from the model rather than splicing inside it.

**What a user hits.** One swatch click deletes a hand-written `#id` from
anything that is not an edge. Measured by replaying `dgePlanTail` against the
real span table:

```
box a "A" {#zz .tone-1 @dec}       one click on tone-2 ->  box a "A" {.tone-2 @dec}
box b "B" right of a gap 1 {#yy}   one click on tone-2 ->  box b "B" right of a gap 1 {.tone-2}
edge a -> b {#e1 .dashed}          one click on tone-2 ->  edge a -> b {#e1 .tone-2}
```

A tag change does the same, through the same function. The two defects cover for
each other precisely: the id does nothing, so its disappearance does nothing –
until the day it starts doing something.

**What a revision must not break.** The edge branch. `{#name}` on an edge is the
only way an edge gets a name a step, an `at` or a `brace over` can address, and
`dgePlanTail` rebuilding it out of `el.id` is what keeps it through a swatch
click. `dgeRenameIn` (`editor.mjs:6351`) already rewrites `#name` inside a tail
as though it were an element name, so the paste path is written for an id that
means something.

**What a revision could newly enable.** This is the whole rename story. If
`{#id}` named the element on every statement, `dgePlanTail` loses its edge
special case (one line), the panel gains a **name field on every kind** –
something it has never had – and a rename becomes a splice inside one tail
rather than a rewrite of every reference in the block, which is the thing
`dgeRenameIn` exists to do and which nothing in the panel currently calls.

The other direction is also fine for the editor and cheaper: if `{#id}` were
*refused* where it is discarded, no figure could carry one for `dgePlanTail` to
eat, and the edge branch stays exactly as it is.

## 10. `edge` is missing from `rejectShapeOn` – the `default` block is stricter than the statement it defaults

```
default edge {.hex}   ->  .hex is an outline, and only a box has one to shape …
edge p -> q {.hex}    ->  silent
text t "x" {.hex}     ->  .hex is an outline, and only a box has one to shape …
```

Same class, same kind, opposite treatment depending on which line it is written
on. `diagram-core.mjs:3745` calls `rejectAlignOn('edge', …)` and not
`rejectShapeOn`; `lint.js:459-460` mirrors the hole faithfully, so the linter
cannot catch it either. One line in each file.

The message also reads *"a edge"*.

### Editor perspective

**What the editor does with this today.** It already behaves as though the hole
were closed. The `corner` row is `kinds: ['box', 'container']` and every
non-rectangular outline in it is gated by `dgeShapeOK = (el) => el.kind ===
'box'` (`editor.mjs:314`, `DGE_SLOTS:392-400`), so `.hex` on an edge is a click
the panel does not offer. The comment above the row states the compiler's rule
verbatim, including the part the compiler does not enforce.

**What a user hits.** The mirror image, and it is the failure the alignment rows
were explicitly built to avoid. A figure that already carries `edge p -> q
{.hex}` – legal today – opens in the editor with **no outline row at all**:
`dgeSlotRows` skips a slot whose `kinds` do not include the selection's kind
(`editor.mjs:4762`). The class is invisible in the panel, survives every tail
rebuild, and cannot be removed there. `dgeCarries` (`editor.mjs:337-342`) is the
escape hatch the two alignment rows were given for exactly this, with the reason
written out: *"a row that hid itself would leave the author no way to take it
off, which is a worse answer than the pressed swatch with the compiler's warning
beside it."* The outline row has no such clause. See item 15.

**What a revision must not break.** Nothing. `dgeShapeOK` and the row's `kinds`
already state the rule the compiler is missing, so closing the hole makes the
panel and the build agree rather than changing either.

**What a revision could newly enable.** Once the compiler refuses it, no figure
can carry it, and the missing escape hatch on that row stops mattering – which
is the cheaper of the two fixes to item 15.

## 11. `emph a` and `style a {.emph}` are identical live and different in print

Measured on the static SVG, which **is** the print state:

| written | class in the print SVG |
|---|---|
| `step s` / `emph a` | `dg-el dg-box` |
| `step s` / `style a {.emph}` | `dg-el dg-box emph` |

Deliberate per CLAUDE.md – emphasis is a lecture-time act, and a handout that
arrives with three arrows greyed out is reporting a moment in the talk rather
than the diagram. But nothing in the grammar signals it, the two read as sugar
for each other, and the divergence appears only in a printed handout, which is
the artefact an author checks last.

**Rides with item 1.** Whoever settles `emph` / `calm` / `dim` has to settle this
in the same breath, or the renaming makes the trap harder to see rather than
easier.

### Editor perspective

**What the editor does with this today.** It cannot show the divergence, and it
has a control that looks as though it could. `DGE.frame` takes `slide` /
`column` / `print` (`editor.mjs:622`), and the frame segment sits in the top bar
next to the zoom. But `print` there is a **frame width** only:
`dgeFrameMetrics` (`editor.mjs:588-597`) uses it to lift the 62vh cap and pick
an em measure. The canvas is always the compiler's live SVG at `DGE.beat`. So a
user can press a button labelled "Print" and watch, full width, exactly the
emphasis the printed handout will not have.

**What a user hits.** Nothing, until the handout. The two ways to emphasise are
three panes apart – the `emph` act button in the step pane and the `emph` swatch
in the softness row – and the panel's own account of the difference
(`dgeBeatNote`, `editor.mjs:5233`; the step-pane hint at `5220-5227`) is entirely
about *which line the edit lands on*. Neither sentence mentions print, because
nothing in the editor knows about it.

**What a revision must not break.** `dgeBeatNote` and the step-pane hint are the
only place in the editor where the two surfaces are distinguished at all. A
rename that made them one word would delete the distinction without deleting the
divergence, which is this item's warning restated in the panel.

**What a revision could newly enable.** If the two are settled on one vocabulary
and the print rule is stated in the grammar rather than only in CLAUDE.md, the
`print` frame can be made to mean the print *state* as well as the print width –
the editor already recompiles the block per beat, so it is one more argument to
a call it makes anyway. The divergence would then be visible where it is
created.

## 12. ~43 (kind, class) combinations are accepted, can never act, and the build says nothing

Swept 280 combinations. 30 are explicitly refused; 49 build clean while changing
no geometry and reaching no CSS rule. Discounting six defensible cases
(`.shrink` where the label happens to fit, a side class that is already the
default side, `.smooth` with no `via`), **~43 can never act on that kind**:

```
box / text / container / brace   .no-head .both-heads .smooth .elbow .front
edge                             .hex .diamond .chevron .wedge .cross .fit .shrink
container / brace                .fit .shrink
```

**Corrected after the editor pass.** An earlier count here said ~48 and listed a
row of type and alignment classes as inert on a `dot`, on the grounds that a dot
has no label. **A dot does carry a label**, and seven of those classes move it –
the sweep fixture wrote `dot a at 0,0` with no label at all, which is what made
them look dead. Verified: `dot a "hello" at 0,0 {.left}` moves the words;
`{.turn}`, `{.small}`, `{.large}`, `{.mono}` likewise. Only the five that belong
to an edge (`.no-head`, `.both-heads`, `.smooth`, `.elbow`, `.front`) are inert
on a dot, and those are already covered by the first row above.

So the grammar refuses about a third of what it cannot honour and silently
accepts the rest.

Two same-shaped cases land on opposite sides:

```
box a "A" {.fit}                 ->  error: .fit sizes the type to the box, so the
                                     box has to be given – add "w n" or "same as …"
edge p -> q {.smooth}  (no via)  ->  silent
```

They share a slot (`['smooth', 'elbow']`, and `['fit', 'shrink']`).

**This is where the page has a problem.** `figures-you-write.html` says:

> Anything outside the vocabulary is refused when the figure is built rather
> than ignored.

True as written. A reader will take it to mean *the build tells me when a word
does nothing*, which is false for ~43 combinations. Either narrow the sentence
or close the gap.

### Editor perspective

**Checked, because CLAUDE.md makes a claim here.** The sentence is *"the
editor's two swatch rows carry exactly the kinds the compiler allows, so the
panel never offers a click that can only be refused."* As written – about
**refusals** – it holds. Every swatch `DGE_SLOTS` offers for a box, a dot, a
text, an edge, a container or a brace was put through the compiler; none of them
is a class that kind refuses. `test/editor-sidebar.mjs:52-65` drives exactly
that, every swatch in every slot, twice over.

**But that spec asserts only that the block still parses and the tail stays
braced.** It never asserts the click *did* anything, so the inert case is
invisible to the suite by construction – and the panel offers plenty of it.
Measured on the emitted SVG against the selectors in `DIAGRAM_CSS`
(`build.js:1494-1690`):

| offered by | on | swatches that reach nothing |
|---|---|---|
| `line` – `.dashed` `.dotted` | `text` | 2 – a free text emits a rect only when it carries a fill, and `.dg-text > :is(rect,…) { stroke: none }` unstrokes it anyway |
| `weight` – `.thick` `.bare` | `text` | 2 – same reason |
| `weight` – `.bare` | `edge`, `brace` | 2 – `.bare` names `> :is(rect, circle, .dg-shape)`, and both groups hold only a `.dg-stroke` path |
| `ink`, `line`, `weight`, `type size`, `family`, `text weight`, `softness → .emph` | `image` | 13 – an image group's only child is the `<image>`: no rect, no label |

Nineteen swatches that can only do nothing. And the corpus proves the trap is
real rather than theoretical: **`lectures/network-security/source.md` writes
`text … {.paper .bare …}` on eleven lines** (73, 80, 144, 186, 203, 237, 251,
294, 308, 310, 417). Measured – `text t "DNS" pad 0.14 {.paper .bare .bold}` and
the same line without `.bare` emit byte-identical SVG apart from the class token.
The author of the compiler wrote an inert class eleven times.

**One claim in this item does not survive the probe.** *"(a dot has no label at
all)"* is wrong. `dot d "hello"` compiles to a `<circle>` plus a `.dg-lbl`
wrapper, and `.left`, `.right`, `.top`, `.bottom`, `.small`, `.large` and
`.turn` all move it – verified by diffing the emitted geometry. `DGE_SLOTS:425`
says so already (*"A `dot` has a label and takes both"*) and offers both
alignment rows for a dot. The parenthesis should come out of the list.

**What a revision must not break.** The two `when` predicates (`dgeShapeOK`,
`dgeElbowOK`, `dgeAcrossOK`, `dgeDownOK`, `editor.mjs:314-342`) and the
drop-a-row-with-one-answer rule (`editor.mjs:4770`). That is the mechanism by
which a row narrows below its own kind list, and any new refusal wants a
predicate of the same shape rather than a fresh list of names.

**What a revision could newly enable.** The panel's stated rule is that a
control whose only outcome is a compiler refusal is not a control. Its sibling –
a control whose only outcome is *nothing at all* – is not enforced and **cannot
be from the editor side**, because inertness is a fact about the stylesheet, not
about the grammar. If the grammar refused a class on a kind whose drawable it
cannot reach, `DGE_SLOTS` could narrow those rows off the same predicate and the
nineteen dead swatches would go with them.

## 13. Two smaller ones: `table` breaks its neighbours' rule, and the arrow family is half-sugar

**`table` silently ignores `w` when `col` is present:**

```
table t "A|B" at 0,0 col 1,1 h 0.4 w 5   ->  identical to the same line without w
```

`bars` and `plot` do enforce the stated principle that *two ways of saying one
number is two ways of saying different ones* – but the refusal is on `w` **+ `h`
+ `aspect`** together, not on `w` + `aspect`:

```
bars f … w 2 aspect 4:1        ->  silent (this is the normal pairing – aspect
                                   works the height out from the width)
bars f … w 2 h 1 aspect 4:1    ->  error: "aspect" works out the height from the
                                   width, so giving w and h as well says the same
                                   thing twice – drop one of the three
```

**Corrected.** An earlier draft of this item said `w` + `aspect` was the hard
error. It is not. The comparison still holds – `bars` refuses over-specification
and `table` silently drops one of the two numbers – but the illustrative pair
was wrong.

**The arrow family is half-sugar with the guessable member missing:**

```
edge q <- p   ==  edge p -> q                 (byte-identical output)
edge p -- q   ==  edge p -> q {.no-head}      (byte-identical output)
edge p <-> q  ->  error; the spelling is {.both-heads}
```

So the one token a reader would guess is the one that does not exist, and the
two that do exist are exact synonyms of something else.

**And the arrow's spacing message is false:**

```
edge p->q     ->  edge needs "->" between two element names
edge p ->q    ->  edge needs "->" between two element names
```

They wrote it. It needs spaces around it, and the message does not say so.

### Editor perspective

**`table` and `w`.** `dgeKindOpts` reads `DG_KIND_OPTS.table = ['w','h','space','col']`
(`diagram-core.mjs:592`), so the panel renders a **`w` field on every table**.
Measured: with a `col` present, typing a width compiles, `dgeSetSource` accepts
it, the source grows a `w 5`, and the canvas does not move. The panel's own rule
is that a control which can only be refused is not a control; this is the worse
case – a control that succeeds and does nothing, so not even the status bar says
anything.

**The arrow family.** The editor never writes `<-` and would be simplified by
`<->`. `dgeSetSlot`'s `head` branch (`editor.mjs:4841-4856`) rewrites the
**arrow token**, not the class – `--` for none, `->` restored for one or both,
and `.both-heads` added only for both – and carries the reason: editing the
class alone left `--` in the line, the parser re-derived `no-head` on top of
`.both-heads`, and "both" came out as one reversed head. `dgeSwapEnds`
(`editor.mjs:4990-5001`) swaps the two endpoint tokens and leaves the arrow
alone, so `<-` is a spelling the editor reads and never emits.

**What a user hits.** For the table, a width they typed that stays in the source
and never in the picture. For the arrows, nothing – the head row is the one
place the grammar's half-sugar is already hidden behind a control.

**What a revision must not break.** The arrowheads row has to keep producing all
three states from one row. That is all it needs.

**What a revision could newly enable.** This is the item where the editor argues
for a particular answer. If `<->` existed and `.both-heads` did not,
`dgeSetSlot`'s head branch becomes three arrow tokens and no class at all: the
`autoClasses` guard in `dgePlanTail` (`editor.mjs:4928-4931`) loses its only
caller, `DG_CLASS_GROUPS`'s arrowheads slot disappears, and `head` stops being
the one row in `DGE_SLOTS` that has to write two places at once. Dropping `<-`
costs the editor nothing, because it does not write it. And fixing the "needs
spaces around it" message matters here for item 2's reason – the panel would show
that sentence alone.

---

## 14. `aspect` is a panel field that can never be read or written

**Problem statement.** `aspect` is in `DG_KIND_OPTS.bars` and
`DG_KIND_OPTS.plot`, so `dgeKindOpts` puts it in the size row as a text field.
It is not in `DG_KEYED_ATTRS` (`diagram-core.mjs:1686-1688`), so `spanOf` returns
null for it. It is not in `DG_LIST_OPTS`, so the editor's own fallback
`dgeListSpan` does not cover it either. And `applyAspect` consumes it at parse
time and leaves nothing on the model, so `dgeResolve` has no value to show as a
placeholder. Measured on `bars f "3,5" at 0,0 aspect 4:3 w 2`: the frame's model
keys are `w=2 h=2.5 frame=bars` – no `aspect` – and `spanOf('f','aspect')` is
`null`.

The consequence in the panel: on a chart whose line literally reads
`aspect 4:3`, the `aspect` field is **blank with the placeholder "auto"**, so the
panel misreports the figure; and typing `1:1` into it answers *"aspect cannot be
written on f here – give it a placement first."* (`dgeWriteAttr`,
`editor.mjs:5091-5094`) – a sentence about placements, on a chart that has one.

This is a known shape with three of its four names already patched.
`dgeListSpan`'s header comment (`editor.mjs:5007-5016`) documents the identical
gap for `col`, `emph` and `calm`, works around it in the editor, and says where
the fix belongs: *"**This belongs in `DG_KEYED_ATTRS`**: the day those three
names join it, `spanOf` answers first and this function goes dark – delete it
then rather than leaving two readings of one line."* `aspect` is the fourth name
and nobody patched it.

**Editor perspective.** It is entirely an editor defect – a hand-written figure
is unaffected. But it is the only field in the sidebar that both lies about the
current value and refuses every keystroke, and `aspect` is the option a chart
most wants a control for, because the whole point of it (item 6's cousin) is that
`w` and `h` are a poor way to say what shape a chart is.

**Proposed revision.** Put `aspect` in `DG_KEYED_ATTRS`. It is a `keyword value`
option like every other name on that list, and its value being `4:3` rather than
a number is exactly what the list's own comment says the shape "does not care
about" – it says so of `point`, which is a word. Then add `col`, `emph` and
`calm` in the same commit and delete `dgeListSpan`, as its comment instructs. If
the panel should also *show* what a chart was written with, keep `aspect` on the
model beside the `w` and `h` it resolves to.

**Why it is strictly better.** Turns a spurious failure into a working control,
and removes a second reading of one line – two of the five criteria, and worse
on none.

**Migration.** One line in `diagram-core.mjs`, one function deleted in
`editor.mjs`. **No source changes anywhere**: nothing about what a figure means
changes.

**Effect on `lectures/diagrams/source.md`.** None. No chunk changes; the four
tracked views are unaffected.

**Effect on `docs/artifact/`.** None on either half. No figure is recompiled
differently and no claim in `figures-you-write.html` is touched.

## 15. A class the panel does not offer for a kind cannot be taken off there

**Problem statement.** `dgeSlotRows` skips a whole slot when none of the
selection's kinds appears in `slot.kinds` (`editor.mjs:4762`). Two rows guard
against the consequence: `label across` and `label down` are offered on an edge
that already *carries* one of their words even where the word cannot act, and the
reason is written out at `dgeCarries` (`editor.mjs:337-342`) – *"a word written
on an edge it cannot move is still written on it, and a row that hid itself would
leave the author no way to take it off."* Every other row is unguarded.

So any class the compiler accepts on a kind the panel does not offer it for is
invisible in the panel and unremovable there. Today that set is exactly the set
item 12 measures: `.hex` and its four siblings on an edge (item 10), `.fit` /
`.shrink` on a container, a brace or an edge, `.no-head` / `.both-heads` /
`.smooth` / `.elbow` / `.front` on a box, text, container or brace, and any fill
class on a brace. The class survives every tail rebuild – `dgePlanTail` writes
`el.classes` back unchanged for the slots it is not touching – and there is no
gesture that removes it.

**Editor perspective.** The user sees a class in the source pane, has no row for
it in the sidebar, and cannot edit the source pane. The only way out is a text
editor over `--watch`, which is the situation the editor exists to remove.

**Proposed revision.** Two halves, and the first is item 12's. Where the
compiler is made to **refuse** a combination, the figures carrying it stop
existing and the row needs no guard. Where a combination is deliberately kept
legal but inert, the row wants a `dgeCarries`-shaped clause – a one-line
predicate per slot, on the model the two alignment rows already establish. Take
the first where it is available; it is strictly less machinery.

**Why it is strictly better.** No capability is lost by either half and one is
restored: taking a class off is currently possible for some classes and not for
others, with nothing to say which.

**Migration.** `DGE_SLOTS` only, if the second half is taken; nothing at all if
the first half covers every case. No source changes. Worth sweeping
`lectures/network-security/source.md` first for a class on a kind whose row would
have to appear – the eleven `text … {.paper .bare}` lines are the known
population.

**Effect on `lectures/diagrams/source.md`.** None unless item 10 or item 12
changes what compiles, in which case it is those items' migration and not this
one's.

**Effect on `docs/artifact/`.** None on the figures. On the prose: this is the
same sentence item 12 puts under review – *"Anything outside the vocabulary is
refused when the figure is built rather than ignored"* – read from the editor's
side, where "ignored" additionally means "and there is no way to take it back
off".

---

# Ranking, by cost after a tag

**Settle before the release** – the fix changes what existing source means or
what it draws:

1. **Item 1** – `emph` / `calm` / `dim`, together with **item 11**, which is the
   same decision.
2. **Item 6** – `gap`'s two units. Squaring it redraws every figure.

**Cheap, and open any time** – additive, or message-only: items **2**, **3**,
**4**, **8**, **9**, **10**, **12**, **13**.

**Sentences, not code:** item **7**, and the page half of item **12**.

**Nothing here touches the four decisions.** No constraint solver, layout once
per step, numbers-only interpolation, and relations-not-coordinates all survive
the pass intact. Items 8–13 are naming, refusal coverage and error text; 6 is a
default; 7 is a sentence.

---

# What has to be assessed alongside any proposal

Three artefacts consume this language and would move with it:

- **`lectures/diagrams/source.md`** – the construct reference. Every `:::
  diagram` construct is drawn rather than described. Its four views are tracked
  in git and the release workflow fails if they are stale.
- **`docs/artifact/figure-rules/source.md`** – the lecture the artifact page's
  figures are compiled from. Its chunk ids are a contract with
  `docs/artifact/refresh-figures.mjs`; renaming one breaks the page quietly.
- **`docs/artifact/figures-you-write.html`** – hand-written prose around
  machine-made parts. Drawings, listings, stepped demos, the stylesheet and the
  runtime are all lifted from a real build by `refresh-figures.mjs`, so a
  compiler change reaches the page by running that script. **The prose does not
  move by itself**, and several of its claims are the thing under review.

Also `lectures/network-security/source.md` – 36 real slides, linted by CI but
never built or published. It is the corpus that shows what the vocabulary looks
like at scale, and the honest measure of a migration's cost.

And the **graphical editor** (`editor.mjs`, `editor.css`, spec in `editor.md`):
it edits source *text* through `createSpanTable()`, reads its controls off the
statement, and offers a swatch row per class slot. Every naming change lands in
its panel; every slot change lands in `DGE_SLOTS`.

---

# Ground rules for the revision

Decided by the maintainer before the review started. Both review stages work
under these.

## Breaking-change budget: free rein, and drop the old spellings

`::: draw` is unreleased, so the window is open. Proposals **may** rename
words, change what a number means, and remove statements or tokens. They should
**not** keep legacy spellings alive as aliases: where a revision replaces a word,
the old word goes, so the final surface has exactly one way to say each thing.

The cost of that is a migration of the in-repo corpus – `lectures/diagrams`,
`lectures/network-security`, `docs/artifact/figure-rules` – and it is accepted.
Every proposal must therefore say **how large its migration is** (how many lines,
in which files, and whether a `sed`-shaped rewrite covers it or a human has to
read each site).

**Capability loss has a high bar, but is not an absolute veto.** Revised by the
maintainer after this file was written, and `revision-proposal.md` is written
against the revised form: a revision *may* remove an expressible but unused
behaviour when keeping it would cost a second rule or new vocabulary – provided
the loss is named explicitly, the corpus has been checked, and every real figure
still has a clear spelling. Editor reach stays part of the decision: a capability
described as available in the editor needs a concrete control and a round-trip
contract, not a claim.

The earlier form of this rule was absolute – *"if a word goes, everything it
could express must still be expressible"*. It is recorded because the revision
matters to the answer: item 11 explicitly drops one unused print/screen
combination rather than adding a second operation family. Item 12 reaches the
same recommendation under either rule because it refuses inert class strings
that cannot change a drawing or expose an editor capability. The proposal names
both cases instead of pretending that nothing rests on the revised rule.

## Findings outside the thirteen

The editor pass and the proposal pass will both surface defects that are not on
the numbered list. **Add them as items 14, 15, … and give them the same
treatment** – problem statement, proposed revision, migration size, and the
effect on the two lectures and the artifact page. Do not silently drop one, and
do not renumber 1–13.

## What the final list must contain, per item

1. **Problem statement** – what is wrong, in one paragraph, standing on its own
   without this file's evidence section.
2. **Editor perspective** – what a user editing this figure through the panel
   or a drag experiences today, and what the revision does to that.
3. **Proposed revision** – the concrete new spelling or behaviour. One
   recommendation, not a survey. If the item genuinely has two defensible
   answers, name both and say which you would take and why.
4. **Why it is strictly better** – against the list at the top of this file.
   An item that cannot make that case should say so and be dropped.
5. **Migration** – files, rough line counts, and whether it is mechanical.
6. **Effect on `lectures/diagrams/source.md`** – which chunks change, and
   whether the construct reference still demonstrates every construct.
7. **Effect on `docs/artifact/`** – both halves, separately: the figures, which
   `refresh-figures.mjs` regenerates from `figure-rules/source.md`, and the
   **prose in `figures-you-write.html`, which does not move by itself** and
   several of whose claims are under review here.
