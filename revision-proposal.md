# Revising the `::: diagram` language – the proposal

**Status: proposal v2 – current decisions.** This is the implementation input.
The main body contains only the current recommendation for each item. Rejected
or superseded variants are collected in the appendix and are explicitly not
implementation instructions.

## What this is

`todo-revision-of-system.md` is the finding document: fifteen numbered defects,
each with measured evidence. This file is the answer to it. It covers every one
of those fifteen and adds seventeen more that surfaced while measuring them, and
it is written under the maintainer's ground rules – **free rein to break, and no
legacy spellings**. Where a word is replaced, the old word goes.

Three things it assumes, from those ground rules:

- **The window is open and closes at the first tagged release.** `::: diagram`
  is unreleased; the source format freezes at the tag.
- **One way to say each thing.** No aliases, no deprecation period. A rename is
  a rename, and the corpus migrates.
- **Capability loss has a high bar, but is not an absolute veto.** A revision may
  remove an expressible but unused behaviour when keeping it would require a
  second rule or new vocabulary, the loss is named explicitly, the corpus has
  been checked, and every real figure still has a clear spelling. Editor reach
  remains part of the decision: a feature described as available in the editor
  must have a concrete control and round-trip contract.

## How to read it

Items 1–15 keep the finding document's numbering. Items 16–32 are new and are
numbered in the order the ground rules require (never renumber 1–15). Each item
carries the seven parts the ground rules specify: problem statement, editor
perspective, proposed revision, why it is strictly better, migration, effect on
`lectures/diagrams/source.md`, effect on `docs/artifact/`.

Everything marked *measured* was produced by driving `diagram-core.mjs` through
the probe harness or by compiling the corpus under a patched compiler. **Where a
measurement contradicts the finding document, the measurement wins and the
override is called out in place.** Corrections to the finding document are listed
together under *Overrides* at the end; superseded proposal variants are separate
from them in the final appendix.

The corpus is `lectures/diagrams/source.md` (895 lines, 24 diagram blocks),
`lectures/network-security/source.md` (1698 lines, 36 blocks) and
`docs/artifact/figure-rules/source.md` (821 lines, 50 blocks) – 110 blocks in
all.

---

## Summary

"Breaks source" means an existing figure changes meaning, changes what it draws,
or stops compiling.

| # | Defect | Change | Breaks source | Migration |
|---|---|---|---|---|
| 1 | `emph` has three roles; `calm` sets `.dim` | one word per prominence setting, in all three positions; `calm` deleted | yes | 44 lines, mechanical |
| 2 | one typo produces five errors | one generated sentence per statement; stop at the first unreadable token | no | 0 |
| 3 | `gap` vs `space` caught but not explained | **no change of its own** – item 2 closes it | no | 0 |
| 4 | build silent on same-slot pairs and clashes | same-slot pair is an error; a clash is a build warning | no | 0 |
| 5 | `align` is three things; `.left`/`.right` are two | placement option becomes `flush`; edge label side becomes `side`; one centre word within each grammar | yes | 81 sites, 71 mechanical |
| 6 | `gap` has two units | `gap` is square, measured in `uh` | **yes – spacing changes** | 239 lines, scripted |
| 7 | "a small language" undersells the surface | state the bar for adding a word; do not publish brittle vocabulary counts | no | 1 paragraph |
| 8 | `above`/`below` refuse the `of` the others require | keep all four spellings; fix the diagnosis on both near-misses | no | 0 |
| 9 | `{#id}` honoured on two statements of seventeen | **delete `{#id}`; an optional name goes before the from-token** | yes | 87 edges, mechanical |
| 10 | `edge` missing from `rejectShapeOn` | close the hole; fix the `"a edge"` article at four sites | no | 0 |
| 11 | `emph a` and `style a {.emph}` differ in print | delete the divergence; print takes prominence from the opening beat | yes (4 figures) | 3 human decisions |
| 12 | inert (kind, class) combinations accepted silently | all become errors, from one table | yes | 11 lines, mechanical |
| 13 | `table` ignores `w`; arrow family half-sugar | `w`+`col` an error; add `<->`; refuse head classes on an edge tail | yes | 28 sites, semi-mechanical |
| 14 | `aspect` is a panel field that cannot be read or written | put it in `DG_KEYED_ATTRS`; delete `dgeListSpan` | no | 0 |
| 15 | a class the panel does not offer cannot be removed there | derive `kinds` from the refusal table | no | 0 |
| 16 | a step can only add a class; no slot default is reachable | `{!class}` removes a class, in a tail and in a `style` step | no | 0 |
| 17 | a step op destroys the author's own prominence class in print | fixed by item 11 | yes (1 figure) | 0 |
| 18 | `problems[0]` is source order, so the editor shows the wrong sentence | phase every problem; sort by phase, never by line | no | 0 |
| 19 | a statement that loses its structure reports a missing element | a member run ends where the commas stop | no | 0 |
| 20 | `w`/`h`/`r`/`point` parse on kinds that ignore them | gate them on `DG_KIND_OPTS` | no | 0 |
| 21 | `step my name` compiles and drops the rest | a step takes one name | no | 0 |
| 22 | a brace's side is a bare positional word | `side <word>`, the same keyword an edge gets | yes | 20 sites |
| 23 | `h` is the whole element on four statements, one row on three | `row` / `band` / `header` on those three | yes | 4 sites |
| 24 | `bars … space` flips its unit with `horizontal` | square, in `uh` | yes | 1 line |
| 25 | `table … space` is one number drawing two distances | convert x as `grid` already does | no | 0 |
| 26 | `.smooth .elbow` draws a route outside its own extents | refused by item 4 | no | 0 |
| 27 | the panel treats a generated sequence-message name as authored | folded into item 9's explicit-name model and editor contract | no | 0 |
| 28 | `#look` demonstrates no prominence class | add a four-swatch row | no | 2 lines |
| 29 | claims on the artifact page contradict the compiler or this revision | rewrite the affected passages | no | prose-only |
| 30 | `step` is a statement and a `plot` option | rename the `plot` option to `tick` | yes | 9 sites, mechanical |
| 31 | a `text` leader is written `->` and draws no arrowhead | leader takes the edge's tokens; `--` plain, `->` points | yes | 29 sites, mechanical |
| 32 | print draws an arrowhead the last beat removed | hide the head in the print state, keep the node for the runtime | no | 0 sites, compiler fix |

**Do not sum the item counts into a line total.** Several revisions touch the
same source line, while some item counts include examples outside the three-file
corpus. In particular item 9 changes named edges and item 31 changes leaders,
which are easy to omit from a manual total. The migration tool must report the
deduplicated changed-line set after all mechanical rewrites have been composed.
Per-item counts below are workload estimates, not additive totals. Item 11 adds
three one-line judgement calls.

---

# The items

## 1. `emph` has three grammatical roles, and `calm` sets `.dim`

**Problem statement.** Prominence – how much of a room's attention an element is
asking for – is one channel with four visual states: an unnamed normal plus the
three classes `.emph`, `.dim` and `.ghost`. The language spells the named states
four ways depending on where they are written. On an element's own line each is
a class. Inside a `step` it is a verb,
and only two of the three settings have one: `emph` sets `.emph`, but the verb
for `.dim` is `calm`, a word that exists nowhere else in the grammar and has no
class behind it. On a `bars` line it is an option taking column indices. The two
surfaces are perfectly disjoint, so every wrong guess is a hard error rather than
a hint: `{.calm}` is an unknown class, `dim a` is an unknown statement. Nothing
says the names are one dial, and `calm` is not derivable from anything a reader
has already learned.

**Correction to the finding document.** It states that `emph` is an option on
`bars` *and `table`*. Measured, `table` refuses it – `unexpected "emph" in table
t – this statement takes a placement and w / h / space / col`. `plot` and `lanes`
refuse it too. The option is **`bars`-only**, including a `series of` line, so no
`table` line migrates.

**Editor perspective.** One sidebar shows, for one channel, a button captioned
`calm`, a swatch captioned `dim`, a text field captioned `emph` and a step chip
reading "calmed" – four names, three kinds of control, three panes, nothing
connecting them. The mapping is guessable in one direction only: a user who
clicks `calm` and reads the source pane sees `calm a` and finds no `.calm` swatch
to match it. After the revision the softness row becomes the **prominence row**
and is the only control for the channel: at beat 0 a click writes `{.dim}` on the
element's line, standing on a beat it writes `dim a` into that step through the
same `dgeAddStepOp` the act buttons use. The `emph` and `calm` act buttons come
off the step pane – `show` and `hide` stay, because visibility has no class row
to fold into – and the row gains `ghost`, which the step pane never offered.

**Proposed revision.** One table, `DG_PROMINENCE = ['emph', 'dim', 'ghost']`,
which *is* the prominence slot in `DG_CLASS_GROUPS`. Its three words are used
identically in three positions, differing only in how the target is named:

| where | target | example |
|---|---|---|
| attribute tail | the element itself | `box a "A" at 0,0 {.dim}` |
| `step` verb | names or tags | `dim a, b` · `ghost @scaffold` |
| `bars` option | column indices | `bars f "…" … emph 2 dim 0,1,3` |

`calm` is deleted as a step verb and as a `bars` option; the verb for `.dim` is
`dim`. `ghost` becomes a step verb and a `bars` option, closing the one setting a
beat could reach only through `style`. `style` keeps its ability to carry
prominence classes: after item 11, `emph a` and `style a {.emph}` are exactly the
same act, so this is a shorthand and its longhand rather than two names for one
thing, and it is what lets `style a {.tone-4 .emph}` stay one line.

**Returning to normal is item 16's `{!class}`, not a fourth word.** The emphasis
analysis proposed a named neutral, `.full`, for this. It is displaced here – see
item 16 – because the same gap exists across grouped and ungrouped classes. One
negation mark closes it generally; a named neutral for each look would multiply
special cases.

**Why it is strictly better.** *Removes a word that means two things*: `calm`
goes and the survivors mean one thing each in every position. *Reduces the chance
of a human or a language model writing a figure wrong*: `{.calm}` and `dim a` are
both hard errors today, and a model that has learned the class list writes the
second. *More self-describing*: the class list is the verb list, so learning one
teaches the other. Existing behaviour is retained, and `ghost` at a beat is
gained.

**Migration.** Mechanical, 44 lines:

| edit | lines | pattern |
|---|---|---|
| step verb `calm` → `dim` | 39 (diagrams 6, network-security 27, figure-rules 6) | `s/^\([ \t]*\)calm\b/\1dim/` |
| `bars` option `calm` → `dim` | 5 (diagrams 4, figure-rules 1) | `s/\bcalm \([0-9]\)/dim \1/g` |

The two do not collide: the verb is always first on its line inside a `step`, the
option is always mid-line on a `bars` line. By hand, prose only:
`lectures/diagrams/source.md:579`, `lectures/network-security/source.md:27`,
`figure-design.md` at 58, 524–527, 721–724, 931–932, 949, `CLAUDE.md` 267 and
297, `editor.md` 1096, 2603, 2719, `PRD.md` (2 hits). Code: `DG_CLASSES`,
`DG_CLASS_GROUPS`'s prominence row, `DG_STEP_OPS` (−`calm`, +`dim`, +`ghost`),
`DG_KIND_OPTS.bars`, `DG_LIST_OPTS`, the `dgStateAt` op branch, the `bars`
out-of-range check, `lint.js:675`, one stale comment in `build.js` at 1607–1611,
and in `editor.mjs` the `DGE_SLOTS` row, the act-button list, `DGE_VERBS`,
`DGE_LIST_HINT` and `dgeSetSlot`'s beat routing.
`refresh-figures.mjs:103`'s hardcoded `STEP_OPS` regex needs `dim|ghost` added
and `calm` dropped, or it silently stops colouring a step verb in every listing.

**Effect on `lectures/diagrams/source.md`.** Four chunks: `#cbc` (1 line),
`#series` (4 lines plus a prose paragraph), `#plot` (1), `#sequence` (4). The
drawings are byte-identical – none of the four is among the four blocks whose
output changes under item 11. All four tracked views rebuild. The construct
reference still demonstrates every construct, and item 28 adds the one it never
demonstrated.

**Effect on `docs/artifact/`.** *The figures*: `refresh-figures.mjs` regenerates
every drawing and listing from the migrated source, so they follow automatically;
the one hand edit is the `STEP_OPS` regex above. *The prose*, which does not
move: seven sentences, quoted in full under item 29(g).

## 2. One typo produces five errors

**Problem statement.** A statement that meets a token it cannot read complains
about that token and keeps going, so every remaining token earns a complaint of
its own and the missing placement earns one more. `box b "B" rightof a gap 1`
produces five problems for one typo. The seven statements this happens on –
`box`, `text`, `dot`, `image`, `edge`, `container`, `brace` – are the ones a
newcomer meets first, and the complaint says only that the word is wrong, never
what would have been right. The six expanding statements already answer a bad
option with one sentence listing what the statement accepts. The good message
exists in the codebase and is wired to the statements that need it least.

**Editor perspective.** The panel cannot produce this – every token it writes is
generated. What a user hits is the refusal path, and there the editor shows **one
sentence**: `dgeSetSource` rolls the edit back and reports `DGE.problems[0]`, and
because the rollback recompiles the clean source the rest are discarded. That
makes the editor the strictest consumer of this item: the one sentence it shows
has to be self-contained and has to be the cause. After the revision it is the
statement sentence – the token, the kind, and the statement's own vocabulary
written out, which is the panel's own option row rendered as prose for whoever is
not using the panel.

**Proposed revision.** Three parts, all in `diagram-core.mjs`.

1. **`dgTakes(head)` / `dgUnexpected(head, id, tok)`**, beside `DG_KIND_OPTS`,
   generating one sentence per statement from `DG_KIND_OPTS` plus a small table
   of the non-keyword forms (`same as`, the leader, `point`, `over`, `via`).
   Called from `readGridOpts` (replacing its inline string), from the node loop,
   the edge loop and the container/brace loop.
2. **`break` instead of `continue`** in those three loops after the report. A
   statement stops at its first unreadable token and reports once. This is not a
   new policy: `readGridOpts` already returns on the first bad option, which is
   exactly why the six expanding statements report once. "Unreadable" means not a
   keyword this statement accepts, not the start of a placement, and not a value
   consumed by a preceding keyword – a *readable* keyword with a *bad* value
   (`point sideways`, `gap x`) reports and carries on, because the line's
   structure is still known.
3. **The `has no placement` consequence is suppressed for a statement that
   stopped early, and only then.** The suppression keys on "the parser stopped
   reading", not on "an error happened".

The consequence rule is safe, and the obvious worry is the case it is built
around: a `box` with the placement simply omitted never breaks, so it reads its
whole line and the placement error is its *first* problem. Measured, `box b "B"`
yields exactly one problem today and exactly the same one problem after.
`box b "B" point sideways` still earns two real independent errors.

Measured, before and after:

| line | today | proposed |
|---|---|---|
| `box b "B" rightof a gap 1` | 5 | 1 |
| `box b "B" right a gap 1` | 5 | 1 |
| `box b "B" above of a gap 1` | 4 (three nonsense) | 1 |
| `text t "note" right of a space 1` | 2 | 1 |
| `container z "Z" over a,c padd 0.3` | 2, both nonsense | 1 |
| `edge a -> c gap 0.3` | 2 | 1 |
| `box b "B" point sideways` | 2 | 2 (unchanged, both real) |
| `box b "B"` | 1 | 1 (unchanged, same sentence) |

The placement clause is spelled out and gains **`between`**, which every one of
these statements accepts and which no message in the compiler has ever named:

```
box b has no placement (at X,Y / above X / below X / right of X / left of X / between X,Y)
```

**Why it is strictly better.** *Turns a spurious failure into an explicit one* –
four of the five sentences on the file's own example describe tokens the parser
only mis-read because it had already lost the line. *More self-describing* – the
refusal carries the statement's vocabulary, and nothing else in the language
does. *Reduces the chance of a model writing a figure wrong* – shown one sentence
naming the accepted words it repairs the line in one turn; shown five complaints
about four tokens it commonly rewrites the line.

**Migration.** **Zero source lines.** About 60 lines in `diagram-core.mjs`, 20 in
`lint.js`, minus three hand-written `dgeStatus` guards in `editor.mjs`.

`lint.js` gains a **primitive option check it does not have today**. Measured,
`box c "C" rightof a gap 1` and `text t "note" right of a space 1` produce **no
lint finding at all**, so both pass the pre-commit gate and fail every later
build – the exact failure CLAUDE.md records for `rejectShapeOn`, since CI lints
`lectures/network-security` and `lectures/diagrams` without ever building them.
The check is a token scan against `DG_KIND_OPTS[kind]`, a table lookup rather
than a second `readGridOpts`. `lint.js` should also import `dgTakes` so the two
files cannot print different lists; that bends "tables only, never a function"
the way `dgCellName` already does, and item 12 *un*-bends a larger instance of
the same thing in the same commit.

**Effect on `lectures/diagrams/source.md`.** None. All 24 blocks compile
byte-identically and the construct reference is untouched.

**Effect on `docs/artifact/`.** *The figures*: unchanged. *The prose*: one
sentence, at line 1063, because the message it describes gains a word – see item
29(f), which rewrites the same sentence for a second reason.

## 3. `gap` vs `space` is caught but not explained

**Problem statement.** `gap` (the distance to the element you are placing
against) and `space` (the distance between the bars of a chart, the cells of a
grid, the bands of a protocol) are the grammar's most confusable pair, and a
statement that meets the wrong one says only that the word is unexpected.
`text t "note" right of b space 1` produces two problems, neither of which
mentions that `text` takes `gap`, or what `text` takes at all.

**Editor perspective.** The panel separates the pair by *position* rather than by
a message: `gap` is a field in the placement pane, `space` appears only in the
size row and only on statements that take it, because `dgeKindOpts` reads its
controls off the statement. A panel user never meets the choice. That mechanism
is the proof that the two words are separable by context rather than by name, and
nothing here touches it.

**Proposed revision. No revision of its own – item 2 closes it.** With the
generator and the break rule in place:

```
text t "note" right of b space 1
  -> unexpected "space" in text t – this statement takes a placement
     (at / above / below / right of / left of / between), "same as X",
     a leader "-> X" and w / h / pad
```

One problem instead of two, and `space` is visibly absent from a list short
enough to read. This is the finding document's own prediction and it holds
without a "did you mean": the accepted vocabulary is a fact the compiler already
has, where a suggestion would be a guess. The `brace`/`container` half – where
`gap` is swallowed into the member list and reported as a missing element – is
closed by item 19.

**Why it is strictly better.** It is item 2's case. Listed separately because the
finding document numbers it separately, and marked here as **no change of its
own** rather than given a redundant mechanism.

**Migration.** Zero, beyond item 2's.

**Effect on `lectures/diagrams/source.md`.** None.

**Effect on `docs/artifact/`.** *Figures*: none. *Prose*: the caveat card stays
and stays correct – *"`gap` is the distance to the element you are placing
against. `space` is the distance between the bars of a chart, the cells of a
grid, or two bands of a protocol."* One optional clause is worth adding, because
after item 19 the compiler can answer it by name: a `container` and a `brace`
take neither and spell the same idea `pad`.

## 4. The build is silent about contradictions inside the vocabulary

**Problem statement.** Two classes from one `DG_CLASS_GROUPS` slot written in one
attribute tail both survive parsing, both land on the element and both are
emitted; which one the reader sees is then decided by stylesheet order. Nothing
in the build says a word. The same holds for every `DG_CLASS_CLASHES` row. Only
`lint.js` reports either, so an author running `node build.js` – which is what
authoring a lecture looks like – never hears it. Worse, the lint message on a
same-slot pair asserts something untrue: it says *"which one the drawing takes is
not decided by this line"*, which on `edge p -> q {.hex .diamond}` is wrong twice
over, because neither is ever taken and nothing refuses the pair either.

**Two corrections to the finding document.** First, it asks how many corpus lines
would newly warn, suggesting the answer is a migration. The count is **zero**:
`node lint.js` is clean on all three sources and an independent scan of every
attribute tail finds no same-slot pair and no clash row. Second, it groups the
two tables as one defect. They are not. A clash row is authorable on purpose:
measured on the frames payload, `box x "Hello" {.tone-4 .accent}` with
`style x {.clear}` at beat 1 gives `tone-4 accent` at frame 0 and `accent clear`
at frame 1 – the accent ink is inert while the fill is there and becomes the ink
the moment the fill is taken away. No such reading exists for two members of one
slot, because within a slot only one can ever be live and a `style` step
displaces rather than removes. The two tables want two different channels.

**Editor perspective.** A same-slot pair is impossible through the panel:
`dgeSetSlot` filters every name in the slot before pushing the click. A clash row
is two clicks in two different rows, after which both rows show their own pick
pressed while the drawing does not change and nothing says why. After the
revision the clash warning reaches the panel's problem box with **no editor code
change at all** – `dgeCompilerFor` already wires `warn` into `DGE_WARNINGS` and
`dgeSourcePane` prints every entry. The same-slot error is invisible in the
panel, which is correct: the panel cannot produce one, so it is a gate on
hand-written source and on the source pane.

**Proposed revision.** Two channels, one commit.

- **(a) A same-slot pair in one attribute tail is an error**, raised by a new
  `rejectSlotPair()` in `diagram-core.mjs` and mirrored in `lint.js`, since it is
  decidable from the tail alone. It reads the **written tail**, never the
  resolved class set – load-bearing, because `--` injects `no-head` into
  `edge.classes` after the tail is parsed, so `edge a -- b {.both-heads}` must
  not be caught. A `DG_SLOT_NAMES` map gives each slot the question it answers,
  so the message can name it: *".dashed and .dotted are both stroke pattern, and
  an element has one – the line gives two answers to one question. Keep one."*
  Call sites: after `dgParseAttrs` in the block-body loop, after the
  sequence-entry `dgParseAttrs`, and in `parseDiagramDefaults`.
- **(b) A `DG_CLASS_CLASHES` row is a warning through `dgWarn`, and the compiler
  becomes the only place it is decided.** `lint.js` drops its clash loop and its
  import. The compiler gains the check **beat-aware** – warn only where the pair
  is live in every beat, so the `style x {.clear}` figure above stays silent.
  That is CLAUDE.md's own rule for the `.fit`-needs-a-width check read the other
  way: deciding it correctly needs the resolved state at each beat, which is the
  compiler's job, and *a linter stricter than the build is worse than none*. The
  three rows keep their reason strings; they are accurate.

The finding document's third element – extending `rejectShapeOn` to edges – is
**item 10's**, and under item 12 it becomes one call site in a single
`rejectClassOn`. The kind gate must run **before** the slot check, or
`edge p -> q {.hex .diamond}` is answered *"an element has one outline"*, which
is false of an edge.

**Ownership afterwards.** Same-slot pair: **both files**, an error, decidable
from the tail. Kind-inert class: **both files**, item 12's table. Clash row:
**the compiler only**, a warning, because it is the only text that knows what the
steps do to the pair.

**One thing this does not fix.** `dgWarn` has no line-number channel – every call
names an element id instead – and `build.js`'s `dgWarn` dedupes globally by
message text. A clash warning on a `style` step line has no obvious subject.
Handed to item 18: if `warn()` gains a line number, this warning should take it.

**Why it is strictly better.** *Turns a silent failure into an explicit one* –
five kinds of contradiction that build without a word become an error or a
warning. *Turns a spurious failure into an accurate one* – the misleading
same-slot sentence is replaced, and the case where it was most wrong is refused
by the kind gate before it can be reached. *Reduces the chance of a model writing
a figure wrong* – asked for "a dashed, dotted boundary" a model writes
`{.dashed .dotted}` today and gets no complaint.

**Migration.** **Zero corpus lines** – measured, not estimated. About 25 new
lines in `diagram-core.mjs` plus three call lines and 15 for the beat-aware
warning; `lint.js` −5 +2; `editor.mjs` and `editor.css` unchanged.

**Effect on `lectures/diagrams/source.md`.** None. No chunk carries a same-slot
pair or a clash row; the four tracked views need no rebuild on this item.

**Effect on `docs/artifact/`.** *Figures*: none. *Prose*: three sentences name
`lint.js` for a check that becomes the build's – lines 1107, 1277 and 1524 – and
the three "only one class from a group applies" sentences become true rather than
needing retraction. Both sets are written out under item 29(a).

## 5. `align` names two constructs, and four words name two geometries

**Problem statement.** The token `align` introduces two unrelated constructs. On
a line of its own it is a statement giving a set of elements one shared
coordinate; inside a placement it is an option naming which cross-axis edge of
the reference the new element lines up with. Both can appear on one line with two
`top`s meaning different things – measured, `box b "B" right of a gap 1 align top
{.top}` compiles clean. Separately, the centre of an axis is spelled `center` on
x and `middle` on y, and writing the other is an error even where the axis is
already stated. `DG_ANCHORS` spells the same idea a third way (`a.center`) and
`DG_SCALAR_X/Y` a fourth (`a.cx`). Finally the four words `left` / `right` /
`top` / `bottom` are classes with two meanings by kind: on a `box`, `dot` or free
`text` they place the label inside the element's padding and are **two
independent channels** (nine combinations, which `#justify` exists to show); on
an `edge` they name **one** thing, which side of the routed line the label sits
on. Two slots on one kind, one slot on another, same four words.

**Three corrections to the finding document.** (i) `middle`/`center` is not
confined to the placement option: the `align` **statement** has the same split
(`DG_ALIGN_X = left/center/right`, `DG_ALIGN_Y = top/middle/bottom`) and a design
comment defending it. The defect is sharper than stated and is the opposite of
what the comment claims – the axis is named **and** encoded in the word,
redundantly, and the redundancy is enforced as an error: `align x middle` is
refused although nothing about it is ambiguous. (ii) **The parser's own default
value for the placement option is `'center'`**, set for all four directions
including `right of` / `left of`, where an author writing it by hand is told
`align center is not one of top/middle/bottom`. The language's internal default
is a spelling the language refuses. (iii) A `style` step already refuses all four
alignment classes, so nothing is lost by taking them off an edge – a step could
never have changed them.

**Editor perspective.** All three `align`s are in the sidebar under three names,
and the one with the most corpus traffic has no control at all: the placement
option has no field, no swatch and no chip, written only by a cross-axis drag and
drawn as an unlabelled hairline – on the same canvas that captions the
*statement's* hairline `align x left`. The two centre spellings are hardcoded at
`editor.mjs:2542`, and `dgeRelText` drops the option when it equals `'center'`,
the neutral word for one axis only, so `below a align center` is correctly
dropped and `right of a align middle` is written back out in full. Three helpers
(`dgeAcrossOK`, `dgeDownOK`, `dgeCarries`) exist purely to paper over the
two-meanings-per-word problem.

After the revision the placement option is `flush` and gets a swatch row of its
own beside `gap`, built like the existing `point` row, since its value is a
closed word list and `DG_KEYED_ATTRS` already carries the option so `spanOf`
finds it. The axis table at 2542 collapses to two lists sharing their middle
entry and the default check becomes `!== 'middle'`, correct on both axes. The
edge's side becomes a `side` option, so the two alignment rows lose `'edge'` from
their `kinds` and **`dgeAcrossOK`, `dgeDownOK` and `dgeCarries` are deleted
outright**; `dgeEdgeVertical` survives as the `when` predicate of the new `side`
row, which offers only the pair that can act.

**Proposed revision.** Four changes, one surface.

**(a) The placement option is renamed `flush`**, so `align` means exactly one
thing – the statement.

```
box b "B" right of a gap 1 flush top {.top}
```

`flush` is chosen rather than a synonym of "align" because it is the word the
artifact page already reaches for when it explains the option in prose – *"or
`align left` to keep the new element's left edge flush with the one it was placed
against"* – and because it is a poor name for the statement ("flush these five
boxes" is not English), so the two cannot swap names by accident. The mirror
alternative, keeping `align` on the option and renaming the statement, is cheaper
(30 sites against 67) and is declined: "align" is the *set* operation in every
drawing tool anyone has used, and no short verb reads well for "line these five
up" the way `flush` reads for one edge.

**(b) One centre word on both axes, and it is `middle`.** `align x middle`,
`right of a flush middle`. `middle` rather than `center` because it is already 6×
more common in the corpus (24 against 4); because it sidesteps the
`center`/`centre` question in a repo whose prose, comments and editor labels are
en-GB, and a keyword whose spelling contradicts the surrounding text is a thing
both a person and a model get wrong.
This does not weaken the design comment defending the split, it completes it –
once the axis is named, encoding it a second time in the edge word buys nothing.

**(c) `center` stays in `DG_ANCHORS`.** `q.center` is the direct and learnable
name for the centre of one element. `q.cx,q.cy` is more powerful – its two axes
may come from different elements and carry independent nudges – but it is not a
better spelling of the common case. The grammar position already distinguishes
an endpoint anchor from an `align` or `flush` value, and both readings describe
the same geometry rather than unrelated acts. Removing the familiar spelling for
internal vocabulary purity would make ordinary source harder to read. The corner
anchors `tl`/`tr`/`bl`/`br` stay for the same reason: they keep a dense endpoint
token visibly distinct from `a.top` and friends.

**(d) An edge's label side becomes the `side` option; the four classes stay
classes on `box` / `dot` / `text` only.**

```
edge eve.right:0.7 -> bob.left:0.7 "forgery" side bottom {.accent}
```

This follows the precedent `point` already set – a chevron aimed up is the same
shape aimed differently, and a class per shape per direction would quadruple a
closed list. Three things fall out: the two readings stop sharing a spelling; one
value, one slot, so `{.top .left}` on an edge cannot be written; and
`rejectAlignOn`'s early return for edges goes away. The along-the-line case stays
a **warning**, because which pair runs along the line is only known after
routing, but the message now names a word that means only this. `side` must be
reachable from `default edge` (measured: `default edge {.top}` works today and
moves the label), so it goes into `DG_KIND_OPTS.edge` beside `pad` and must
resolve through `dgDefaultLayers` explicitly, for the reason `pad` does – an edge
never goes near `sizeOf`. That is the one implementation trap here. A `sequence`
message keeps working and gets more honest: the expansion currently *injects*
`.top` or `.right` as a class an author can displace, and will now set `side` on
the edge record with an author's own `side` winning, the same shape `space n`
already has.

**Why it is strictly better.** *Removes a word that means two things*, twice –
`align`, and the four alignment words on nodes versus edges. It also removes the
axis-conditioned `center`/`middle` choice inside `align` and `flush`. *Reduces
the chance of a human or a model writing a figure wrong*: the two-`top`s line
stops being writable, `align x middle` stops being an error, and a model that has
seen `.top` on a box no longer guesses it onto an edge and gets a different
geometry. *More self-describing*: `flush top` says what it does; `side bottom`
says which reading is meant. *Removes a silent failure* – the parser's own
`'center'` default on a horizontal placement. Worse on nothing: no expressible
figure stops being expressible, and the editor gains a control it does not have.

**Migration.**

| change | sites | shape |
|---|---|---|
| `align <word>` → `flush <word>` | 67 (diagrams 6, network-security 60, figure-rules 1) | pure `sed` – the statement form always has `x` or `y` after `align` |
| `align x center` → `align x middle` | 4 (all in diagrams) + 1 in `figure-design.md:674` | pure `sed` |
| `.center` anchor | unchanged | the direct centre anchor stays supported |
| edge label classes → `side` | 10 (diagrams 2, figure-rules 8) | **human per site** – the word moves out of a tail carrying other classes |

81 sites, 71 mechanical. Code: `diagram-core.mjs` (`DG_ALIGN_X/Y`,
`dgParsePlacement` and its two `STOP` sets, `PLACEMENT_OPTS`, `DG_KEYED_ATTRS`,
`DG_KIND_OPTS.edge`, `dgDefaultLayers`, `rejectAlignOn`, `DG_CLASSES`, the two
alignment slots, the `.turn`+`.left`/`.right` clash rows which now apply to node
labels only); `lint.js` (two `STOP` sets); `editor.mjs` as above. `build.js` has
**no** reference to any of these names. Docs: `CLAUDE.md`, `editor.md` (47 lines
mention `align`), `figure-design.md` (8).

`test/figure-labels.mjs`: the box half – the nine `#justify` combinations –
passes unchanged. The edge half changes: two lines compile `{.top}` and `{.left}`
on an edge and assert both are accepted; those become `side top` / `side left`
accepted and the two classes refused. About six lines plus the header comment.

**Effect on `lectures/diagrams/source.md`.** `flush` rename in `#unsafety`;
`align x center` → `middle` in `#unsafety`, `#overflow`, `#tree`; edge label class
→ `side` in `#plot`, `#swimlane`. `#justify` itself is **unchanged** – measured,
it uses only box and free-text classes and never demonstrated the edge reading –
so the nine-combination reference survives intact, and the edge reading should
get a line of its own beside it, which is the one place the construct reference
gets better coverage than it has now. `#alignment` is untouched: it already uses
`align y middle`. The German paragraph under `#justify` stays true and needs a
sentence saying these are the node words and an edge uses `side`.

**Effect on `docs/artifact/`.** *The figures*: `refresh-figures.mjs` writes every
listing as well as every drawing, so once `figure-rules/source.md` is migrated
the page's code samples show the new spelling with no hand editing. Affected
chunks, all already in the pulled set: `sp4b`, `r8r`, `r8s`, `sp11`, `fc`,
`swim`, `table-demo`, `seq`, `seq-demo`. *The prose*: four passages, quoted under
item 29(h), including one that is **wrong today** independently of this proposal
– it says the along-the-edge case is reported "as an error" when it is a warning.

## 6. `gap` is a clearance written in a coordinate's units

**Problem statement.** `gap` is the most-written option in the language and it
does not mean one distance. On a `right of` or `left of` placement it is
multiplied by the grid cell's *width*; on `above` or `below` by its *height*.
Because a grid cell is deliberately not square, the same number on two adjacent
lines draws two distances, with nothing in the source to say so. Nothing warns,
nothing lints, and the figure is not wrong in any way a check can see – it is
spaced in a way the author did not choose. The neighbouring clearance word,
`pad`, is already square on both axes, so two clearance words on adjacent lines
follow two conventions. The result is that "every length in the layout is in grid
units" has two meanings, and which one applies is decided by a word elsewhere on
the line.

**Three measurements that changed the shape of this item.**

1. **`DG_UNIT` is very nearly dead code.** 109 of the 110 corpus blocks set
   `unit=` on the fence; the one exception is `figure-rules` `#hero`, and it is
   deliberate. So squaring the *default cell* would change exactly one figure in
   the repo and would not touch the defect at all, because the defect lives in
   every block that sets its own non-square unit. **Question answered no, on
   evidence.**
2. **The default unit understates the problem by nearly half.** The finding
   document measures at `DG_UNIT = [120, 72]`, a ratio of 1.67:1. The unit
   authors actually work at has a median of **150x52 – 2.88:1**, used by 38 of
   the 109 blocks that name one; the spread runs from 118x150 to 150x30 and only
   7 blocks are square. In the corpus as it stands, `gap 1` across is on median
   **2.9 times** the distance of `gap 1` down.
3. **Correction: the three author warnings are not where the finding document
   says, and they are not about `gap`.** The sentence *"two numbers that look
   square draw something three times wider than it is tall"* and its two siblings
   are in **`docs/artifact/figure-rules/source.md`** (491, 504, 521);
   `lectures/network-security/source.md` contains no such comment. All three are
   about `w`/`h` on a chart, each sitting above a line that then writes `aspect`.
   The anecdote is real and is evidence for the general defect, but it does not
   evidence the `gap` half, and the corpus census carries that on its own.

Everything else in the finding document's evidence block is confirmed exactly.
Two numbers it does not give and which matter: the *unwritten* gap is `0.25`, so
`right of a` with nothing else is 30 px at the default unit and 37.5 px at
150x52, against 18 px and 13 px downwards – the default is uneven too. And the
numbers authors write are drawn from the same small set on both axes (`0.3`,
`0.5`, `0.55` lead both lists) while the median drawn distance is **57.8 px
across and 26.0 px down**: the written numbers agree, the drawing does not.

**Editor perspective.** The editor is the one consumer that never trips over
this, because roughly seven expressions divide by whichever axis the placement
runs on. Two things a user sees are still wrong. `dgeDrawRelations` labels the
gap with the number written on the line, so a 2x2 arrangement written `gap 1`
throughout carries two labels reading `gap 1` over spans of 120 px and 72 px in
one picture. And the `side` swatch row is `write(dgePlaceText(d, p.ref, p.gap))`
– it keeps the number and changes the direction word, so at 150x52 one click from
`right of` to `below` shrinks the visible distance by 65% and the status bar says
nothing, because the edit compiled. It is the panel's own re-docking control and
the only act in the editor that silently changes a distance. After the revision
both become correct with no code change: the label means one thing, and
`dgeRedock` and the `side` swatch become the same operation.

**The site list, corrected.** The finding document says "roughly twenty sites …
every editor site is already written as `axis === 'x' ? uw : uh`". `editor.mjs`
has 85 uses of `uw`/`uh`, but almost all are `at`, `w`/`h`, `offset`, waypoints
and the ruler, all of which stay axis-keyed. The expressions that convert between
pixels and a `gap` number are **seven, in five functions**: `1381` (`dgeRedock`),
`1866`–`1867` (`gapAt`), `2027` (guide application), `2534` (the relation drag),
`3818`–`3819` (`dgeProposePlacement`).

**`editor.mjs:2534` is the one the finding document's list misses, and it is the
one that would be missed in practice.** `place.gap + sign * mainDelta` has **no
`uw` on the line at all**: `mainDelta` is `dx` or `dy`, and those arrive already
normalised from `dgeGestureDrag` at 3306 and 3427. So the axis dependence is
inside `dx` and `grep uw` does not find it. Left unconverted, a sideways drag
writes a gap off by `uw/uh` – 2.9× at the corpus median – and it compiles, which
is the exact failure this item is about. The fix is one line at the call site:
`const gapDelta = main === 'x' ? dx * uw / uh : dy;`.

**Proposed revision.** One sentence, replacing the current two-meanings rule:

> A number that *addresses* the grid is axis-keyed – a cell has a width and a
> height. A number that states a *clearance* is square, and its ruler is one row
> (`uh`).

Concretely, `place.gap` is multiplied by `uh` on both axes: two lines in
`diagram-core.mjs`. Items 24 and 25 extend the same rule to `bars … space` and
`table … space`, four more lines. Nothing else in the compiler moves.

`uh` rather than `uw`, the mean, or a new unit, for three reasons already true in
the file. **`uh` is already the clearance unit** – `pad` on a box, text,
container, brace and edge; `cell` and `space` on a `grid`; `DG_DOT_R`;
`DG_LEAD_GAP`; the four `sequence` rhythm constants are every one of them
measured against `uh` today, and `dgPadPx`'s comment gives the reason. `gap` is
the outlier, not the rule. **`uw` would contradict `pad`**, the word an author
reaches for on the next line. And **a dedicated unit adds a fence word nobody
would set**: the author already writes `unit=150x52`, and the clearance ruler is
the second number, visible in the source.

`DG_UNIT` stays `[120, 72]`. The default `gap` of `0.25` stays 0.25 – a gap
nobody wrote is a hair's clearance, not a designed gutter, and raising it is a
separate argument. **Chart `w`/`h` stay axis-keyed and unchanged**: they are
sizes, so they are addresses, and `aspect` is the shape word. This revision is
what makes the page's existing sentence about them true – see below.

**Why it is strictly better.** *Removes a word that means two things.* *Reduces
the chance of writing a figure wrong, for a model especially*: a model writing a
2x2 arrangement writes one number for all four gutters, which is the natural
reading and is currently wrong by 2.9×. *More consistent*: twelve clearance
measurements in the compiler are square in `uh`; this makes it fifteen and leaves
no exceptions. *Easier to learn*: two families, one sentence each, instead of a
per-option table. It does **not** turn a silent failure into an explicit one and
that is not claimed – overlapping boxes stay unwarned; it removes the failure
rather than reporting it. Nothing is lost: an author who wants an uneven gutter
writes an uneven number, which is the point.

**What an author writes when they genuinely want a non-square cell.** They write
`unit=150x52`, as 109 blocks already do, and it keeps meaning the column pitch
and row pitch that `at`, `w`, `h` and every nudge count in. What changes is that
it stops silently rescaling their clearances. A figure whose horizontal gutters
should be wider – a left-to-right chain with arrows between the boxes, which is
most of the corpus – says so in the numbers: `right of a gap 1.4` beside
`below a gap 0.5`. Today it says `gap 0.5` on both lines and draws the same
thing, and no reader of the source can tell.

**Migration. This is the largest in the document and the one to read twice.**

Every `uw`/`uh` use in `diagram-core.mjs` was classified; **only three rows
change**. `at` and every coordinate nudge, `via`, waypoints, endpoints, `offset`,
`move … by`, and `w`/`h` on every kind stay axis-keyed as addresses. `pad`,
`cell` and `space` on a `grid`, `r`, `DG_LEAD_GAP` and the `sequence` rhythm
constants are already square. The four `uw` constants inside `sequence` and
`lanes` deliberately stay: they are not in the surface – an author cannot write
`DG_SEQ_GAP` – and a statement laying out a row of actor columns is laying out a
grid, not stating a clearance. The rule as stated, *a number **the author
writes** as a clearance is square*, is complete and checkable.

**The corpus rewrite: 239 lines across three files, scripted.** A script that
reads each block's own `unit=` and multiplies every gap on a horizontal placement
by `uw/uh`:

| file | blocks | horizontal `gap n` rewritten | gaps to insert | `bars … space` |
|---|---|---|---|---|
| `lectures/diagrams/source.md` | 24 | 78 | 0 | 0 |
| `lectures/network-security/source.md` | 36 | 81 | 0 | 1 |
| `docs/artifact/figure-rules/source.md` | 50 | 73 | 6 | 0 |
| | 110 | **232** | **6** | **1** |

Two things the script must get right. **It must skip quoted strings** –
`figure-rules:587` has the phrase `right of` inside an edge *label*, and
rewriting inside it produces a line that fails to parse; splitting each line on
`/("(?:[^"\\]|\\.)*")/` and rewriting only the even runs fixes it. And **it must
read `unit=` off each block's own fence**, since 109 of 110 differ.

**Rounding policy: source readability wins over pixel identity.** The migration
first converts a horizontal authored gap by `uw/uh`, then snaps it to **0.05**,
the editor's own `DGE_SNAP_CELL`. It never emits four-decimal preservation
numbers. Examples remain legible: `gap 0.5` becomes `gap 1.45`, `gap 0.25`
becomes `gap 0.7`, and `gap 0.9` becomes `gap 2.6` at the common unit.

Snapping can accumulate in a long chain, so "within three pixels of the old SVG"
is not the acceptance criterion. The acceptance criterion is that the revised
figure still communicates the same relationships: no unintended overlap, no
lost arrow clearance, no clipped label, and no broken framing. If a snapped
conversion fails one of those checks, the author tunes it by another 0.05 step or
redesigns the local spacing. Exact decimals are not a fallback.

The migration script also emits a review manifest containing every changed
block, its old and new viewBox, and every relation gutter that crossed zero or
fell below one arrowhead plus padding. All changed blocks receive visual review;
the named framing and label tests remain gates. This is deliberately a source
migration plus design review, not a claim that the old raster is sacred.

Other files: `lint.js` needs **no change** (it computes no geometry). `build.js`
needs **no change**. `editor.mjs`: the seven expressions plus the `gapDelta` line
at 2534, **all in one commit** – a half-converted editor writes numbers the
compiler reads on the other convention, and that failure is silent in exactly the
way this item is about. Two further editor sites need no change but want a look:
`1874`'s comment (*"in cells, which is what a gap is"*) stops being true, and
`4186` hardcodes `' gap 0.3'` for a renamed element, which at 150x52 goes from
45 px to 15.6 px and wants raising to `0.9`. `figure-design.md` carries many
illustrative `gap` numbers in uncompiled snippets; every within-axis comparison it
makes stays valid, so no snippet is wrong, but rule 1 is a claim about drawn
distance and the doc should name the two families out loud.

**Tests.** The three figure specs assert properties rather than exact
coordinates. `figure-sequence` is unaffected. `figure-labels` measures each
label's inset against its own element's padding, which does not move, and
`figure-framing` measures slack as a proportion. They must pass together with the
browser suite and the visual-review manifest; none is treated as a substitute
for the others.

**Effect on `lectures/diagrams/source.md`.** 24 blocks, 78 gap tokens, none to
insert. `#grouping`, `#plot`, `#swimlane`, `#table` and `#seqmore` do not move at
all – worth noting, because three of those are the reference for `lanes`, `table`
and `sequence` and none of the three learns anything about this change. No statement, class,
option or generated name changes, so nothing is added to or removed from the
construct reference. **The four tracked HTML views must be rebuilt and committed
in the same commit** – the release workflow fails if they are stale, and every
one of them changes.

**Effect on `docs/artifact/`.** *The figures*: chunk ids do not change, so the
contract with `refresh-figures.mjs` holds. The four wrong/right pairs that
are *about* spacing – `#r1w`/`#r1r` ("even gaps say nothing") and `#r2w`/`#r2r` –
are pure horizontal chains, so their comparison survives exactly: `0.5 0.5 0.5`
becomes `1.45 1.45 1.45`, and `0.25 / 0.9 / 0.25` becomes `0.7 / 2.6 / 0.7`. The
rule the page teaches still reads off the source. **Exclude `#hero` from the
script and keep `gap 1.1`.** It is the first teaching example and deliberately
has no `unit=`; its cleaner source is worth the accepted redraw.

*The prose*: four passages, quoted under item 29(i). One of them – the wall
stating the units rule – is the item itself, and one is a sentence this revision
makes **true** without any edit at all.

## 7. "A small language" undersells the surface

**Problem statement.** The page describes the language but never says how large
it is or whether it is going to get larger. Publishing a count is not a useful
answer: it becomes stale whenever a class or option moves and says nothing about
how much of the surface a newcomer needs. The useful answer is the maintenance
rule that governs growth. It exists in CLAUDE.md but not on the page.

**Editor perspective.** Nothing a user hits directly. The editor is evidence for
the rule: its panes are renderings of compiler tables, so a new language word
normally creates a new control or choice that somebody has to face. Item 15 makes
that relationship explicit by deriving the rows from the compiler's class-kind
table. No numeric claim about rows, classes or options is published in user-facing
prose.

**Proposed revision.** Append one paragraph to the *what it cannot do* section:

> Those are the boundaries. The fair question about what is inside them is
> whether the list keeps growing under you. There is a written bar for a new
> statement or option: *build it out of what exists first, and only add a word
> when the hand-built version is the thing that cannot be maintained.* `table`,
> `lanes` and `sequence` cleared that bar because their hand-built equivalents
> became uneditable. A word that only saves typing does not get in, which is why
> the flowchart and the tree need no statement of their own.

No vocabulary count is added. Counts are brittle, invite false precision and
measure the whole reference surface rather than the path a learner actually
takes.

**Why it is strictly better.** *Makes the language easier to learn and more
self-describing.* A reader who has just been shown forty classes and seventeen
statements is told, on the page, what governs whether there will be fifty next
year, and the sentence is the one the maintainer actually applies. Worse on
nothing: it adds no vocabulary, no behaviour, no constraint.

**Migration.** One paragraph of HTML. No code and no diagram source.

**Effect on `lectures/diagrams/source.md`.** None.

**Effect on `docs/artifact/`.** *Figures*: none; `refresh-figures.mjs` need not
run for this item. *Prose*: this item **is** the prose change. One neighbouring
sentence is worth checking at the same time – *"None of that is visible in the
five statements at the top of this page"* – and it holds: the hero is five
statements, three `box` and two `edge`.

## 8. `above` / `below` refuse the `of` that `right of` / `left of` require

**Problem statement.** Two of the four cardinal placements take a preposition and
two refuse it. That asymmetry follows English and is not in itself a defect. What
is a defect is what happens when someone generalises from one line to the next:
`above of a` **misparses rather than erroring cleanly**. The parser reads
`above`, takes the next token as the element name, and binds `of` – so the author
who over-generalised is told, fourth in a list of four problems, that their
*reference* does not exist. Nothing in any of the four sentences mentions the
word `of` being in the wrong place. The mirror slip, `right a`, is diagnosed no
better: five problems, the first of which reads as though `right` were not a word
in the language.

**Editor perspective.** The asymmetry is one line, `dgePlaceText`, and every
placement the editor writes goes through it – the ordinary drag, `dgeRedock`, the
`side` swatch row, the four docking chips, `dgeRelText`, and the `move … to` a
drag at a beat produces – so the panel cannot produce `above of` and a user
driving the editor never meets it. A user meets it only through the source, and
there the editor makes it worse: `problems[0]` for `above of a` is
`unexpected "a" in box b`, shown alone, so the one message that explains what
happened is fourth and is never seen at all. Under this revision the line yields
exactly one problem, it names `of`, and it is therefore also the one the editor
shows. `dgePlaceText` is untouched – the editor's single writer keeps writing the
same four strings.

**Proposed revision. Keep the four spellings exactly as they are, and fix the
diagnosis on both near-misses.** This is a diagnostics defect, not a spelling
one. Two targeted checks in `dgParsePlacement`, each on an exact token match, so
neither is a guess:

```
box b "B" above of a gap 1
  -> "above" takes the element name directly – write "above a", not "above of a"

box b "B" right a gap 1
  -> "right" is written "right of" – write "right of a"
```

Both return a third state from `dgParsePlacement` – *a placement was attempted
and failed*, distinct from *there is no placement here, try the next branch*. The
caller breaks on it, so the line yields one problem instead of five and item 2's
consequence rule suppresses `has no placement`. The same third state is read by
`move … to`, which would otherwise add its own error on top.

**Why not the three alternatives.** *Accept `of` optionally on all four* is ruled
out by the ground rules rather than by taste: `above a` and `above of a` would be
two source texts with one meaning, which is what "one way to say each thing"
forbids. The finding document's note that this is "purely additive" is true and
is exactly the problem. *Require `of` on all four* gives one uniform spelling and
makes `dgePlaceText` unconditional, but `above of` is not English, so it is worse
on *easier to learn*, and it adds 256 tokens to the corpus, so it is worse on
*more concise* – the bar is strictly better on at least one and **worse on none**,
and this fails it twice. *Forbid `of` on all four* fails the same bar the same way
on the horizontal half, and **does not fix the misparse**: `right of a` would then
read `right` + reference `of` + leftover `a`, the identical defect moved to the
other pair.

That last point is the one to keep in view: **the misparse fix is orthogonal to
the `of` decision.** Whichever answer is taken, a targeted check on the near-miss
is needed, because the near-miss is a token in the reference slot in every
version of the grammar. So the diagnostics work is unavoidable and the spelling
change is optional – and once the diagnostics work is done, the spelling change
buys a symmetry no single line ever displays, at the cost of a quarter of the
corpus and a page of prose.

**Runner-up, costed.** If internal symmetry is weighed above English, the answer
is *require* `of` on all four, not forbid it: `of` is the token that makes the
reference slot unambiguous, and requiring it removes the misparse structurally
rather than by a check. Migration: 256 sites (`above` 55, `below` 201) across
four files, one `sed` per file restricted to diagram blocks – but the restriction
is the work, because both words also occur in prose and in quoted labels. Plus
the page's hand-embedded listings, which need a human read.

**Why it is strictly better.** *Turns a spurious failure into an explicit one*:
four problems, three about tokens the parser mis-read and one blaming the
author's reference, become one problem naming the actual word in the actual wrong
place. *Reduces the chance of a human or a model writing a figure wrong*: both
near-misses are exactly what a generalising writer produces. *Easier to learn*:
keeping `right of a` and `above a` keeps the two spellings a reader's own
language already produces, and this is the only one of the four answers that does
not make half the vocabulary read wrong.

**Migration.** **Zero source lines.** Measured across all four corpus files,
inside diagram blocks only, with quoted strings and comments stripped: **0**
occurrences of `above of` or `below of`, **0** bare `right`/`left` in an option
position that is not a `flush` or `point` value, **0** elements named `of`.

**Effect on `lectures/diagrams/source.md`.** None; the construct reference is
unchanged.

**Effect on `docs/artifact/`.** *Figures*: unchanged, byte-identical. *Prose*:
the same one sentence item 2 already touches, for item 2's reason (`between`
joining the list) – see item 29(f). Two other sites keep their wording and stay
correct.

## 9. `{#id}` is honoured on two statements out of seventeen

**Problem statement.** An element's name is the second token of its statement on
every kind but `edge`, whose second token is an endpoint; there, and on a
`sequence` message line, `{#id}` in the attribute tail is the name. On `box`,
`dot`, `text`, `image`, `container`, `brace` and all six expanding statements the
same `{#id}` parses, validates as a legal tail, and is thrown away without a
word. `box a "A" {#zz}` followed by `text t "n" right of zz` reports that `zz` is
not defined – a message about the *reference* for a defect in the *definition*.
The silence is in the naming layer, which is the layer every other construct
addresses.

**Current revision: an optional name before the from-token.**

`{#id}` is **deleted from the language**. Nothing then needs refusing where it
used to be discarded – there is no construct left to discard – so this item stops
being a refusal and becomes a removal.

An `edge` and a `sequence` message take an **optional name in the slot before the
from-token**:

```
edge p -> q                     anonymous          (177 corpus lines, unchanged)
edge wire p -> q "plaintext"    named
u -> r "register"               anonymous          (28 corpus lines, unchanged)
reg u -> r "register"           named
```

**The rule is one sentence:** the token immediately before the arrow is the
from-endpoint; an optional token before *that* is the element's name.

**It is unambiguous, and measured to be so.** Every endpoint form is exactly one
token – `p`, `p.top`, `p.right:0.3`, `0,0` all verified – so counting tokens
before the arrow decides it with no lookahead and no new punctuation. And the slot
is **free today**: two tokens before the arrow is currently a hard error
(*"unexpected \"wire\" before the arrow in an edge"*), so nothing occupies it and
no existing line changes meaning. Only the arity of that error moves: two tokens
becomes legal, three or more keeps the message it already has.

**Why not a placeholder for the anonymous case.** The obvious alternative is a
marker in a mandatory name slot – `edge - p -> q` – and `-` is genuinely free: a
name may not begin with one, so the token cannot collide with an identifier, and
it is typed without a shift. It is declined because it **taxes the common case**:
177 of 264 edges and all 28 messages are anonymous, and every one of them would
have to carry a token that says nothing. The positional rule gets the same result
with nothing to type. `-` also has to be read next to `->` and `--` on the same
line, which is a legibility cost paid on every anonymous edge for the benefit of
the minority that are named.

**One guard worth having.** A two-token slip – `edge a b -> c` where both `a` and
`b` exist – would now parse silently as *name `a`, from `b`*. **Require the name
slot to be an unclaimed name**: if the first of two tokens already names an
element, that is two element names before an arrow and almost certainly a slip, so
refuse it and say that. Cheap, and it turns the one silent misreading this design
introduces back into an error. Note the slot has been typed into by accident
before – CLAUDE.md records twelve such lines in `lectures/network-security` – which
is a reason to make the guard precise, not a reason to leave the slot empty.

**Editor contract.** This revision includes naming in the panel; it is not only a
parser migration.

- Every selectable source-owned element gets a `name` field in an **identity**
  pane. For statements whose second token is the mandatory name, the field shows
  that token. For an anonymous edge or message it is empty and shows the generated
  id as a read-only placeholder; typing a value inserts the optional name before
  the from-token.
- Every model element carries `named: boolean`. Ordinary named statements and an
  explicit edge/message name set it to true; `edge-N` and sequence-generated
  message names set it to false. The compiler already records this fact for an
  ordinary edge; the sequence expansion must carry it too. No editor code infers
  authorship from an id pattern.
- `createSpanTable()` exposes `spanOf(id, 'name')`. On an anonymous edge or
  message it returns an absent span whose insertion point is immediately before
  the from-token. On every other statement it covers the mandatory name token.
- A rename is one atomic source edit: rewrite the declaration and every reference
  to it, including endpoints, placements, coordinates, member lists, step targets,
  tags only where the token is an id, and generated-owner annotations. Reuse the
  token-aware `dgeRenameIn` machinery; never replace inside quoted labels or
  comments. Validate the identifier and collision before applying the splice set.
- Clearing an optional edge/message name removes its token. If anything still
  refers to that explicit name, the compiler refusal rolls the whole edit back.
  Mandatory statement names cannot be cleared.
- `dgePlanTail()` stops reading or writing ids altogether. The tail contains only
  classes, removals and tags. `#...` is refused by `dgParseAttrs` on every kind,
  with an error pointing to the name field or leading name slot.

This also closes item 27: a generated sequence-message id has `named: false`, so
a class or tag edit cannot pin it into the source. Add an editor regression test
that changes a message tail, asserts that no name token appears, then explicitly
names and renames the message through the identity field.

**Why the tail is the wrong place, stated once.** `{#id}` puts the name **last**,
far from where every other statement puts it. `box a "A"`, `container k … `,
`bars f …` all name in front; only an edge named its element after its options.
A reader scanning a block for `wire` has to look in a different column depending
on the kind. That is the defect, and moving the name to the front is what fixes
it – refusing `{#id}` where it is discarded would have left the two statements
that honour it still naming backwards.

**Why it is strictly better.** *Resolves an ambiguity*: an element's name is in
the same place on every statement, so a reader scanning a block for `wire` looks
in one column rather than a different one per kind. *Reduces the chance of writing
a figure wrong, for a person and for a language model alike*: the tail form put
the name last, after the options, which is where neither would look for it, and
the positional form is the shape every other statement already teaches. *Removes
a silent failure*: `{#id}` is deleted, so the fifteen statements that parsed it
and threw it away have nothing left to throw away – the defect stops being
refused and stops existing. *More concise*: the anonymous case, 177 of 264 edges
and all 28 messages, loses two characters and gains nothing to type. *No
capability lost*: every edge and message nameable today is nameable after, and
the editor gains a rename control it has never had on any kind.

The one thing it costs is the guard above – a two-token slip that used to be a
syntax error now needs the unclaimed-name check to stay an error. That is one
condition on one line, against a naming rule that becomes sayable in a single
sentence for the whole grammar.

**Migration.** **87 edge lines**, mechanical: `edge X -> Y … {#n …}` becomes
`edge n X -> Y …` with `#n` struck from the tail and the rest of the tail kept.
**Zero message lines** – none of the 28 in the corpus is named, so the message
half of this is capability added, not source moved. Do it in the same migration
program as items 13b and 31, then report unique changed lines rather than adding
the three site counts.

**Effect on `lectures/diagrams/source.md`.** Every chunk with a named edge changes
one token's position per line; no chunk loses a construct. `#sequence` and
`#seqmore` gain a demonstrable one – a named message, which the construct
reference cannot show today without `{#id}`.

**Effect on `docs/artifact/`.** *Figures*: identical drawings; the listings on the
page show the moved token. `#hero`'s `{#direct}` in `#follow` is one of the 87.
*Prose*: the page's sentence introducing edge names changes, and the naming rule
becomes sayable in one line for every statement instead of two – which is a
paragraph that gets shorter.

---

## 10. `edge` is missing from `rejectShapeOn`

**Problem statement.** `default edge {.hex}` is refused and `edge p -> q {.hex}`
is silent – the same class on the same kind treated oppositely depending on which
line carries it, so the `default` block is stricter than the statement it
defaults. `diagram-core.mjs:3745` calls `rejectAlignOn('edge', …)` and never
`rejectShapeOn`; `lint.js:459-460` mirrors the hole faithfully, so the linter
cannot catch it either, and CI lints `lectures/network-security` without ever
building it. The message that *does* fire reads *"a edge would keep its own"*.

**Editor perspective.** The panel already behaves as though the hole were closed:
the `corner` row is `kinds: ['box','container']` and every non-rectangular
outline is gated by `dgeShapeOK`, with a comment stating the compiler's rule
verbatim including the part the compiler does not enforce. So the failure a user
hits is the mirror image: a figure that already carries `edge p -> q {.hex}` –
legal today – opens with **no outline row at all**, because `dgeSlotRows` skips a
slot whose `kinds` miss the selection's kind. The class is invisible in the
panel, survives every tail rebuild, and cannot be taken off. Closing the hole
makes the panel and the build agree rather than changing either.

**Proposed revision.** Two lines, verified: add the kind check at
`diagram-core.mjs:3745` and mirror it at `lint.js:459-460`. Under item 12 the two
existing calls become one `rejectClassOn`, so this is a call site rather than a
new function.

**And fix the article, which is not one site but four.** The same bug is in three
functions across two files, all confirmed by running the compiler:

| site | message produced today |
|---|---|
| `diagram-core.mjs:1151` `rejectShapeOn` | *…a **image** would keep its own…* – and *a edge* the moment this lands |
| `diagram-core.mjs:535` `dgResolvePlotCoords` | *…but e9 is **a edge**, not a plot* |
| `diagram-core.mjs:1064` coordinate-axis check | *".left" is **a x** coordinate, and this slot is the y* |
| `lint.js:368` the same check, mirrored | *'.left' is not **a x** coordinate* |
| `diagram-core.mjs:2464` / `lint.js:499` `align x/y` | *"top" is **a x** edge* (reachable) |

One exported helper, `dgArticle(word)`, answers it and every site calls it.
`diagram-core.mjs:1313` and `lint.js:231` are *currently* safe only by accident –
`owner` is the first kind in `DG_DEFAULT_KINDS` that owns the option, and `box`
and `dot` always win, so `edge` and `image` never surface. Route them through the
helper anyway; the accident is one table reordering away from breaking.

**Why it is strictly better.** Resolves the ambiguity – one class, one kind, two
answers. Turns a silent failure into an explicit one. Makes the panel's stated
rule true of the compiler as well. Worse on nothing: `dgeShapeOK` and the row's
`kinds` already state the rule, so no capability existed to lose.

**Migration.** **Zero source lines.** Verified: no `edge` line in any corpus file
carries a shape class, and the patched compiler renders all 110 blocks clean.
Code: one line in each of two files, plus the article helper – about ten lines
and six call sites.

**Effect on `lectures/diagrams/source.md`.** None. `#look` still demonstrates all
five outlines, on boxes, which is now the only place they are legal.

**Effect on `docs/artifact/`.** *Figures*: none. *Prose*: the outline row of the
vocabulary wall says *"The shape drawn: a rectangle with rounded or square
corners, a hexagon, a diamond, a chevron, a triangle or a cross"* and does not say
where they may be written. It should gain the same "on a box" that the `line
shape` and `arrowheads` rows already carry – a four-word edit in an established
pattern, and part of the "where it acts" column item 12 asks for.

## 11. `emph a` and `style a {.emph}` are identical live and different in print

**Problem statement.** Two spellings of one act on screen behave differently in
the printed handout, and nothing in the source says so. A `step` that says
`emph a` is stripped from print; a `step` that says `style a {.emph}` is not. The
intention is sound and stated in CLAUDE.md – emphasis is a lecture-time act, and
a handout that arrives with three arrows greyed out reports a moment in the talk
rather than the drawing – but it is implemented as a *provenance* flag
(`stepEmph`, set by the verb and cleared by the class) rather than as anything a
reader can see. The two spellings read as sugar for each other, the divergence
surfaces only in the artefact an author checks last, and the same flag destroys
an author's own class (item 17). It is also exactly the distinction item 1's
unification would otherwise erase without erasing the divergence.

**Editor perspective.** The editor cannot show the divergence and has a control
that looks as though it could: the top-bar frame segment offers `slide` /
`column` / `print`, but `print` there is a frame *width* only, so a user can press
a button labelled "Print" and watch, full width, exactly the emphasis the printed
handout will not have. `dgeBeatNote` and the step-pane hint are the only place in
the panel where the two surfaces are distinguished at all, and both talk about
*which line the edit lands on*, never about print, because nothing in the editor
knows about print. After the revision those two sentences become the *complete*
account, because which line the word is on is the only thing that decides.
`dgeBeatNote` gains one clause – *"…and this is the prominence the printed handout
will show"* – and the step pane's hint gains its mirror. The `print` frame can
then honestly recompile at the print state as well as the print width, which is
one more argument to a call the editor already makes per beat, and the divergence
becomes visible where it is created rather than in a PDF three days later.

**Proposed revision. Delete `stepEmph`. Print's prominence for an element is the
prominence it carries at the opening beat.**

Everything else about the print pass is unchanged: still the last beat, still not
the union, still keeping tones, labels and visibility from the last beat. Only
the prominence slot is taken from frame 0. In `dgFrameDrawables`'s print loop the
filter that strips `emph`/`dim` when a per-element flag is set becomes: drop every
member of the prominence slot from the last beat's classes, then append whatever
member frame 0 carried.

What the source signals, one rule with no exceptions:

> **A prominence class on an element's own line is part of the drawing and
> appears in the handout. A prominence set inside a `step` is a lecture-time act
> and does not.**

That is the same sentence `dgeBeatNote` already says about *where an edit lands*,
which is why the two halves of this cluster settle together. It is also what
`figure-design.md:949` already tells authors to do for the opening state of a
chart – *"Emphasis a figure opens with belongs on the statement, not in step 1"* –
so the print rule stops being a second thing to learn and becomes the consequence
of a rule the craft doc already gives.

Measured on a patched compiler, print `<g class>` of the element:

| written | today | proposed |
|---|---|---|
| `step` / `emph a` | `dg-box` | `dg-box` |
| `step` / `style a {.emph}` | `dg-box emph` | `dg-box` |
| `step` / `calm a` | `dg-box` | `dg-box` |
| `step` / `style a {.dim}` | `dg-box dim` @0.3 | `dg-box` |
| `{.emph}` on the line | `dg-box emph` | `dg-box emph` |
| `{.dim}` on the line | `dg-box dim` @0.3 | `dg-box dim` @0.3 |
| `{.emph}` + `step` / `calm a` | `dg-box` | `dg-box emph` |
| `{.dim}` + `step` / `emph a` | `dg-box` | `dg-box dim` @0.3 |
| `{.ghost}` + `step` / `calm a` | `dg-box ghost` @0.45 | `dg-box ghost` @0.45 |
| `step` / `style a {.tone-4}` + `emph a` | `dg-box tone-4` | `dg-box tone-4` |

Rows 7 and 8 are item 17's bug, fixed. Rows 2 and 4 are the deliberate change.
Everything else, including every tone, is untouched.

**Accepted capability loss.** The revision can no longer express an element that
is normal at beat 0, becomes quiet only later on screen, yet is quiet in the
handout. No corpus figure asks for that state, while preserving it would require
a handout marker or a second operation family. The loss is explicit and judged
smaller than keeping two visually identical step spellings with hidden print
semantics. The rejected marker variant is recorded in the non-current appendix.

**Why it is strictly better.** *Removes a word that means two things* in the
strongest available sense: after the change `emph a` and `style a {.emph}` are
byte-identical in the emitted figure – verified, not asserted. *Turns a silent
failure into no failure*: the divergence that only ever appeared in a handout is
deleted rather than documented. *Reduces the chance of writing a figure wrong*: an
author's own `{.dim}` no longer disappears from print because an unrelated step
touched the element, and one real figure in the corpus is drawn wrong on paper
today. *More self-describing*: the print rule becomes readable off the source,
with no flag and no provenance. The corpus loses no used behaviour, and one
capability is gained – a `dim` at a beat can be undone with item 16's `{!dim}` at a later
beat, so a build-up can hand attention back.

**Migration.** Measured over the whole corpus: 110 blocks compiled under both the
current compiler and the prototype. **106 print drawings are byte-identical. Four
change:**

| chunk | element | today | proposed |
|---|---|---|---|
| `network-security #ns-a14` | `e` | `accent paper` | `accent paper dim` |
| `network-security #ns-b05` | `fw1`, `fw2` | `turn tone-1 dim` | `turn tone-1` |
| `network-security #ns-b22` | `us` | `tone-3 dim` | `tone-3` |
| `figure-rules #beats-demo` | `r` | `small paper dim` | `small paper` |

`#ns-a14` is the bugfix: the element is written `{.dim}` and later `calm`ed, and
today print loses the author's own class. The other three are the three
`style … {.dim}` sites inside steps, and **each needs a human to decide whether
the handout wants the element quiet** – two are one line each. The third is worth
reading, because it is the corpus's own evidence for this item.
`lectures/network-security/source.md:928-929` reads:

```
  calm fw1, fw2
  style fw1, fw2 {.dim}
```

Two consecutive lines that do the same thing on screen, the second existing only
because the first does not survive print. Under today's rules the `calm` line is
**dead code** – `style … {.dim}` alone produces an identical drawing in every beat
and in print. That is the trap this item describes, found in the wild, and after
the revision the pair collapses to one `dim fw1, fw2` plus, if the author wants
the handout quiet, `{.dim}` on the two element lines.

Code: one loop in `dgFrameDrawables`'s print pass, the `stepEmph` set beside it,
the three `st.stepEmph` writes in `dgStateAt`, and the `stepEmph` field in the
frames payload, which shrinks. `lint.js` unaffected.

**Effect on `lectures/diagrams/source.md`.** None beyond item 1's rename – no
chunk there is among the four whose print output changes. The construct reference
does not demonstrate the print rule and cannot, since print is a different view
of the same block, which is itself an argument for the rule being derivable from
the source rather than from a flag.

**Effect on `docs/artifact/`.** *The figures*: one regenerates differently –
`#beats-demo`, whose element `r` loses its `dim` in the **static** SVG. It is a
stepped demo and the page ships the diagram runtime, so what a reader with
JavaScript sees is unchanged; what changes is the fallback rendering – scripting
off, and the page's own `@media print` block. That is the correct picture under
the new rule, and if the page wants `r` quiet in its still, the fix is `{.dim}` on
`r`'s own line in `figure-rules/source.md`. **A judgement call for whoever owns
the page, to make before the refresh runs rather than to discover in a diff
after.** *The prose*: `figures-you-write.html` states no claim about print
stripping emphasis, so nothing there is contradicted – but `figure-design.md:721-724`
is directly about this item and half of it becomes false: *"a tone a `style` step
puts on a row describes the drawing, so print keeps it, while `emph` and `calm`
are lecture-time acts that print strips."* A tone written by a `style` step still
prints; a **prominence class** written by one no longer does. It has to be re-cut
along the new seam: not *which verb*, but *which line*.

## 12. Combinations that are accepted, can never act, and say nothing

**Problem statement.** The grammar refuses about a third of what it cannot
honour and accepts the rest in silence. A class written on a kind whose drawing
has nothing for it to reach parses, validates, is emitted into the SVG's `class`
attribute, reaches no rule that can paint, and is reported nowhere. The corpus
proves it is a real trap rather than a theoretical one: **the author of the
compiler wrote such a class eleven times** in
`lectures/network-security/source.md`. Two same-shaped cases land on opposite
sides for no stated reason – `box a "A" {.fit}` with no width is an error,
`edge p -> q {.smooth}` with no `via` is silent – and they occupy sibling slots.

**The rule this cluster settles, and it answers items 9, 10, 12 and 15 at once:**

> **A word is legal on a statement exactly when that statement draws something
> the word can reach. Where it can reach nothing, it is an error naming the
> statements it belongs on. Where it can reach something that this particular
> figure has not given it, it is legal, and the drawing is the author's
> business.**

Three tiers, sorted by one question a contributor can ask about a new class
without reading the compiler:

| tier | test | who decides | example |
|---|---|---|---|
| **error, at parse** | Is there **any** figure in which this class on this kind changes the picture? No → error. | `diagram-core.mjs`, from the kind word alone | `.hex` on an edge; `.bare` on a free `text` |
| **warning, after layout** | Some figure exists, but whether *this* element is one is not known until the drawing is routed. | the layout, as today | `side left` on an edge that turns out horizontal |
| **legal, silent** | Some figure exists, and whether this one is it is a thing the author can see. | nobody | `.shrink` on a box whose label happens to fit; `.round` on a text with no ground yet |

The middle tier gains no new members.

**How the rule was checked.** A naïve sweep goes wrong in both directions: raw
computed style over-reports (`.emph` on a free `text` sets a stroke width on a
rect the sheet then forces to `stroke: none`), while screenshot hashing
under-reports and is flaky. The check therefore uses a paint signature: computed
style filtered to properties that can put ink on each emitted node, plus
transforms and geometry, over fixtures for every kind. This is test methodology,
not a vocabulary count; the table below is the contract.

**Proposed revision. Every inert kind/class pair becomes an error from one
exported table. None becomes a warning.** This is the final table after items 5,
13 and 16; later sections must not recut it:

| kinds | classes |
|---|---|
| `box` | `hex diamond chevron wedge cross` |
| `box dot container brace edge` | `dashed dotted thick` |
| `box dot container` | `bare` |
| `box dot text container edge` | `tone-1 tone-2 tone-3 tone-4 clear paper` |
| `box dot text container brace edge` | `accent muted turn mono serif hand small large bold` |
| `box dot text` | `left right top bottom` (edge reading moved to `side`, item 5d) |
| `box dot container brace edge` | `emph` |
| `box dot text image container brace edge` | `dim ghost` |
| `box text` | `fit shrink` |
| `box text container edge` | `round sharp` |
| `edge` | `no-head one-head both-heads smooth elbow front` |

A class appears once in this table. A positive `.class` and a negative
`!class` are legal on exactly the same kinds; negation does not become an escape
hatch for a class that the kind can never carry. The parser uses the table for
element tails, `default` tails and every member reached by a `style` target.

`DG_CLASS_KINDS` plus `rejectClassOn()` replace `rejectShapeOn` and
`rejectAlignOn`, at **8 call sites** – exactly the sites those two occupy now,
six of which lose a line because two calls become one.

**Where the check belongs, and the answer to "grammar or stylesheet".** Almost
all entries are facts about the **grammar**, decidable from the kind word with no
reference to `DIAGRAM_CSS` at all, because the kind decides which drawables the
group holds: an `image` group holds one `<image>` and nothing else, a `brace`
holds one stroke path, a free `text` holds a label and a rect only when filled.
The cases that are genuinely stylesheet facts include `.bare` on a free `text`,
brace or edge: `.bare` targets shape children, while brace and edge strokes are
`.dg-stroke` paths and label grounds are un-stroked unconditionally. Those rules
are a *stated rule of the language*, not a look. Freezing them into the grammar
writes down a decision already made rather than promising an effect the CSS
cannot deliver.

**Cost in `lint.js`: the dispatch collapses to one call per branch, and the
import stops importing two *functions* and imports a table instead.** CLAUDE.md
documents that import as a deliberate bend in "tables only, never a function", so
this **un-bends an acknowledged exception** rather than adding one.

**Two same-shaped cases stop landing on opposite sides.** `.fit`/`.shrink` on a
box with no width stays the error it is; `.smooth` with no `via` stays legal,
because a later `via` makes it act; and `.smooth` on a *box* – which no `via` can
ever rescue – becomes the error its sibling already is.

**What stays legal, and why each is not a defect.** `.paper` and `.clear` on a
box or dot, and `.round`/`.sharp` on a box or container – the way back from a
tinted or squared `default`. `.shrink` on a box whose label fits (confirmed live:
at `w 1 h 0.5` with an overlong label it takes the font from 15.00 to 9.00).
`.smooth` on an edge with no `via`, and `.round`/`.sharp` on a text or edge with
no ground – live the moment the figure gives them something.

**There is no cancel-only exception.** `text .emph`, `image .emph` and fill
classes on a `brace` do not paint those kinds and are refused. Item 16 supplies
the honest spelling for suppressing a weaker default: negate the class that is
actually present. This is why the final table above is defined after item 16
rather than carrying a second, intention-dependent legality rule.

**And the editor derives its rows from the same table.** This is the part the
finding document says the panel cannot do from its own side. Every `kinds:` field
in `DGE_SLOTS` turns out to be exactly the union of `DG_CLASS_KINDS[c]` over that
slot's real classes – all sixteen rows checked – so the field is deleted and
derived, `dgeShapeOK` becomes a table lookup, and the row's own comment (*"the
answer is read off the compiler's own rules rather than restated as a list of
names"*) becomes literally true. Dead swatches disappear automatically: an
option is shown for the current selection only when every selected kind is in
that option's derived kind-set.

**`test/editor-sidebar.mjs` still passes**, because every swatch it drives
remains one the compiler accepts. **It should be strengthened rather than left**:
its loop already clicks every swatch in every slot, so add a third assertion
beside `broke` and `unbraced` – that the selected element's rendered `class`
attribute or geometry changed, with the conditional set named as the exemption.
That is the assertion whose absence let the dead swatches ship.

**Why it is strictly better.** Turns silent failures into explicit ones – the
criterion this item exists for. Reduces the chance of a human or a model writing
a figure wrong, which is not hypothetical: the eleven `.bare` lines are the
compiler's own author writing the same inert class eleven times over 36 slides.
More self-describing, because the error names the statements the class *does*
belong on. Removes a hand-kept list from sixteen editor rows and a documented
bend from `lint.js`. The only accepted loss is the ability to carry an inert
class string in emitted SVG; it changes no rendered figure and no corpus figure
relies on it.

**Migration. 11 lines, one file, mechanical.** All in
`lectures/network-security/source.md` (73, 80, 144, 186, 203, 237, 251, 294, 308,
310, 417), all the same pair (`text` + `.bare`), all a single token deletion:

```
sed -E 's/^(\s*text .*\{[^}]*)\.bare (\.)/\1\2/'
```

Verified end to end: after the `sed`, all 36 blocks compile clean under the
patched compiler and **every print SVG is byte-identical** to before; the frames
payload differs only in the class string. Four other `.bare` in that file are on
`box`/`container` lines and are untouched. No `default <kind>` block in any corpus
file carries a class its kind cannot use.

**Effect on `lectures/diagrams/source.md`.** **None.** Verified: every block in
the construct reference compiles clean under the full rule. The reference still
demonstrates every construct, because nothing it demonstrates was ever inert.

**Effect on `docs/artifact/`.** *Figures*: none – `figure-rules/source.md`
compiles clean under the full rule. *Prose*: the sentence the finding document
puts under review is *"Anything outside the vocabulary is refused when the figure
is built rather than ignored."* It is true as written and false as read – a
reader takes it to mean *the build tells me when a word does nothing*, which is
false for many combinations today. **Under this proposal the honest sentence is
stronger, not narrower**, and that is the point:

> Anything outside the vocabulary is refused when the figure is built rather than
> ignored – and so is anything **inside** it that the kind you wrote it on has
> nothing to draw it with.

The neighbour that has to change with it is the class table itself. Four of its
sixteen rows state where a class acts; the other twelve do not, and under this
proposal every row has a definite answer, so the table wants a **"where it acts"
column** or the same opening clause in each description. **That is the largest
single piece of prose work in this document, and it is a table rather than an
argument.**

### A tag that holds mixed kinds

A tag expands to its members, so a kind-gated class named in a step can reach a
member that cannot take it:

```
box p "P" {@mix}
edge e p -> q {@mix}

step s
  style @mix {.both-heads}
```

The line is written in this proposal's syntax; the equivalent today – with the
edge named `{#e}` – is **silent**: the edge gets two heads, the box ignores the
class. Under this item the class is illegal on a `box`, and the question is
whether the refusal fires when the box arrives through a tag.

**Decided: refuse, on the statement, naming the member that cannot take it.** The
error says which element and which kind, and the author writes `style e
{.both-heads}` instead. The alternative – apply where it can act, ignore where it
cannot – keeps mixed tags convenient but routes the exact silence this item
removes straight back in through a tag, where it is *harder* to see than on a
plain line. A set that cannot all take the same act is the wrong set, and saying
so is the whole point of the item.

This is not a per-member filter: one bad member fails the statement. That keeps
the rule one sentence long and keeps `dgStateAt`'s tag expansion free of a
kind-aware branch.

---

## 13. `table` ignores `w`, and the arrow family is half-sugar

Three independent defects, kept under one number because the finding document
numbers them together and each is small. 13a and 13b belong together – both are
"two ways of saying one thing, and the corpus writes the worse one".

**Correction to the finding document.** It says *"`bars` and `plot` make `w` +
`aspect` a hard error"*. They do not: measured, `bars f "1,2,3" at 0,0 w 2
aspect 4:3` compiles, and so does the same line with `h`. What `applyAspect`
refuses is **all three at once**. The principle invoked is real and the table does
break it, but the rule the neighbours enforce is "not two numbers for one number",
not "not `w` with `aspect`".

### 13a. `table` accepts `w` and `col` together and silently drops `w`

**Problem statement.** `col` states one width per column and `w` states the total
to be divided equally – the same quantity said two ways. When both are present
the compiler reads `col` and drops `w` without a word; measured,
`table t "A|B" at 0,0 col 1,1 h 0.4 w 5` and the same line without `w` produce
byte-identical output. A second, smaller wrongness in the same option: `w` on a
table is not the frame width but the **sum of the column widths** – `w 4` yields a
viewBox 504 px wide, `w 4 space 0.5` yields 564 – so the one number an author
reads as "how wide is this table" is not that number as soon as `space` is set.

**Editor perspective.** `dgeKindOpts` reads `DG_KIND_OPTS.table`, so the panel
renders a `w` field on every table. With a `col` present, typing a width
compiles, `dgeSetSource` accepts it, the source grows a `w 5`, and the canvas
does not move. The panel's own rule is that a control which can only be refused
is not a control; this is worse – a control that succeeds and does nothing, so
not even the status bar says anything. After the revision the field can only be
refused, which the panel also forbids, so `dgeKindOpts` narrows on the
statement's own tokens the way it already narrows on `frame` and `entry`: a
`table` line carrying `col` shows the `col` list and no `w`. **That is the same
shape of fix item 14 needs for `aspect`, and the two should land together.**

**Proposed revision.** `w` together with `col` is an **error**, worded like
`applyAspect`'s: *"col gives each column its own width, so w – which divides one
total equally – says the same thing a second way. Drop one."* And `w` on a table
means the **frame**, with the columns worked out as `(w - space * (n - 1)) / n`,
so `w` means on a `table` exactly what it means on a `box`. The alternative – make
`w` act by reading `col` as proportions – is declined: `col`'s numbers are grid
units everywhere else, and making them ratios only when `w` is present is a second
meaning for `col` conditional on another option, which is the failure being
removed.

**Why it is strictly better.** Turns a silent failure into an explicit one; makes
the language consistent with its two nearest neighbours; removes a panel control
that lies. Worse on nothing – every table expressible today stays expressible.

**Migration. Zero corpus sites.** Measured: the corpus contains exactly two
`table` lines (`lectures/diagrams:794`, `figure-rules:739`), both use `col`,
neither uses `w`. `lanes` has no `col` and is unaffected.

**Effect on the lecture and the page.** `#table` unchanged and still demonstrates
every part of the statement; `table-demo` regenerates identically. No prose is
required, though one clause saying `col` and `w` are alternatives would usefully
join the table walkthrough, which does not document `w` on a table at all.

### 13b. The arrow family is half-sugar with the guessable member missing

**Problem statement.** Measured, byte-identical output: `edge q <- p` ==
`edge p -> q`, and `edge p -- q` == `edge p -> q {.no-head}`. But `edge p <-> q`
is an error – the spelling for a two-headed line is the class `{.both-heads}`. So
the one token a reader would guess does not exist, while the meaning it should
carry lives in a different part of the grammar. The corpus shows exactly the
predicted damage: of eighteen uses of the two head classes, **sixteen are
`edge … -> … {.no-head}`** – an arrow written and then cancelled with a class
instead of writing `--` – and two of those sixteen
(`network-security:774,775`) are `edge … -- … {.no-head}`, both spellings at once
on one line.

**Correction that changes the answer.** The finding document's editor note hopes
that deleting `.both-heads` would let `dgeSetSlot`'s head branch become three
arrow tokens and no class, `autoClasses` lose its only caller, and the arrowheads
slot disappear. **Measured, a `style` step *does* change arrowheads**: `edge p ->
q {#e}` with `style e {.both-heads}` emits a first frame carrying the head marker
and a second without it, stroke lengthened to the border. So deleting the classes
**would shrink capability**, which the ground rules forbid.

**Editor perspective.** The editor never writes `<-`: `dgeSwapEnds` exchanges the
two endpoint tokens and leaves the arrow alone, deliberately, because *"`--` has
no direction to flip and the edit would silently do nothing there"*. It reads
`<-` correctly. `dgeSetSlot`'s head branch is the one row in `DGE_SLOTS` that has
to write two places at once and it carries the scar tissue in a comment. After
the revision that branch writes one token and no class: `--` for none, `<->` for
both, `->` (or the line's existing `<-`) for one.

**Proposed revision. Complete the family rather than truncate it.** Four tokens,
one channel:

```
edge p -> q      one head, at the second name
edge q <- p      one head, at the first name
edge p -- q      no head
edge p <-> q     a head at each end
```

`<->` already tokenizes as one token – one line in the `findIndex` predicate plus
the `both` derivation beside the existing `flip`.

**The token family, per site.** Three sites take an arrow token, and the family
has to be the same on the two that are edges. CLAUDE.md already says so – *"a
message is an edge, so nothing about arrow styles is new vocabulary"* – and that
sentence is false today: `<->` has to go into `DG_SEQ_ARROWS` alongside the
`findIndex` change, or a message takes three tokens where an edge takes four.
Measured, the failure is not even a clean refusal – `u <-> r` falls out of the
entry run and reports `unknown statement "u"`, which is the misparse the sequence
lookahead is documented to risk.

| site | tokens | drawings |
|---|---|---|
| `edge` statement | `--` `->` `<-` `<->` | none / one / both |
| `sequence` message | `--` `->` `<-` `<->` | none / one / both |
| `text` / `image` leader | `--` `->` | none / one |

The leader takes a **subset, and for a stated reason** rather than as an
exception: it names one operand, not two, so `<-` has nothing to reverse and
`<->` would put a head on the words themselves. See item 31.

**Every token seeds a class.** Today
`--` seeds `no-head` through `autoClasses` and **`->` seeds nothing at all** – it
is the *absence* of a head class, with the head arriving as the drawn default. The
consequence is precedence that depends on which token was written:

```
default edge {.no-head}    + edge a -> b   ->  0 heads   (the default wins)
default edge {.both-heads} + edge a -- b   ->  0 heads   (the token wins)
```

The slot gains a third member, **`.one-head`**, and all four tokens seed one:

| token | seeds | state |
|---|---|---|
| `--` | `.no-head` | none |
| `->` / `<-` | `.one-head` | one |
| `<->` | `.both-heads` | both |

`DG_CLASS_GROUPS`'s arrowheads row becomes `['no-head', 'one-head', 'both-heads']`
– three members for three states, where two members for three states is what made
the channel incoherent.

Three things fall out, and all three are simplifications:

- **The precedence question disappears.** Every edge now carries an explicit class
  on this slot, so a `default edge` could never win even if it were allowed. The
  refusal decided above stops being a judgement call and becomes provable.
- **This slot no longer needs `{!class}`.** Every state has a name, so a step
  returns to a single head by saying `{.one-head}` rather than by clearing the
  slot. Item 16 is still needed for the slots where "no class" is a real state;
  it just is not load-bearing *here*, which narrows its blast radius.
- **The model's head slot becomes three-state** with no implicit absence-based
  state. The editor still preserves the source direction distinction described
  below.

`.one-head` earns its place because it makes all three runtime states explicit,
removes absence-based precedence, and gives the editor a closed three-state
model.

**Editor contract for direction.** At beat 0 the arrowheads row has four plainly
labeled choices: **none** (`--`), **to second** (`->`), **to first** (`<-`) and
**both** (`<->`). It rewrites only `spanOf(id, 'arrow')`; it never adds a head
class to the element tail. This preserves `<-` as a source-legibility choice and
makes the two possible one-headed directions explicit instead of collapsing them
under a swatch named "one". At a later beat the edge direction is fixed by its
opening token, so the row offers **none**, **original destination**, and **both**,
writing `.no-head`, `.one-head`, or `.both-heads` through item 16's beat-local
class path. Multi-selection enables **original destination** only when all
selected edges have a defined opening direction; changing direction itself is an
opening-beat edit. Tests cover all four token round-trips, `<-` preservation, and
each of the three beat-local states.

**Two settled details.**

*A self-message may carry `<->`.* `u -> u` loops out of a lifeline and back;
`u <-> u` is that loop with a head at each end, which reads as a round trip
abbreviated to one band. It costs nothing – a message is an edge, and the loop
geometry is unchanged – so it is allowed rather than special-cased, and needs no
mention of its own in the docs.

*Routing does not touch the family.* `edge a -> b via 1,1 {.smooth}` and
`edge a -> b {.elbow}` each draw exactly one head, at the arriving end, aimed
along the final segment. Verified. Worth **one sentence on the artifact page**
precisely because a reader might expect a curve or a rail to change how an arrow
terminates, and nothing currently says it does not.

**The scope rule.** The arrow token is the one class-channel that every
edge statement is *forced* to speak on – it is the operand separator, so no edge
can be written without one. That single fact settles all three scopes:

| scope | head classes | why |
|---|---|---|
| the edge's / message's own tail | **refused** | the token on that line already said it |
| a `style` step | **legal – the only spelling** | a token cannot be re-run in a beat |
| a `default edge` block | **refused** | every edge states this channel itself, so there is nothing to default |

Allowing a head class in `default edge` and letting the mandatory arrow token
win would reintroduce exactly the defect item 12 removes. Measured today:

```
default edge {.no-head}
edge p -> q      ->  draws byte-identically to  edge p -- q
```

The default *does* act. Under token-wins precedence it never could, because every
edge carries a token that outranks it – so `default edge {.no-head}` would become
a permanent silent no-op, a control that parses and can never take effect. No
corpus site writes one. Refuse the ineffective scope with a sentence.

With `default edge` refused, no precedence rule is needed on this channel at all:
exactly one scope can speak per beat. No special precedence rule is needed.

The refusals need a small second table beside `DG_CLASS_KINDS`, keyed by
**position** rather than by kind. That is the same shape as item 12's rule – a
class refused in the scope where it duplicates something already said, or where
nothing it says can arrive.

**`<-` stays.** This overrides the direction the finding document's editor note
points in, on measured evidence: all four corpus uses of `<-` are **sequence
messages**, none are `edge` statements, and `lectures/diagrams/source.md:887`
carries a paragraph defending it – *"`->` und `<-` sind dieselbe Nachricht, einmal
vom Absender und einmal vom Empfänger her geschrieben: Wer die Antwort als `c <-
p` schreibt, nennt in beiden Zeilen zuerst den Client und liest die Quelle als
Spalte statt hin und her."* That is a source-legibility affordance in a construct
whose whole point is that its source is read as a column, and it is documented as
such. It also is not the defect: `<-` means one thing unambiguously. It is the
*absence* of `<->` beside it that makes the family look incomplete and sends
authors to the class. Removing `<-` would leave `->` and `--` with no mirror and
make `<->` look stranger, not less strange.

**Why it is strictly better.** *More consistent*: one channel, one place to say
it, and the guessable token exists. *Reduces the chance of writing a figure
wrong*: 16 of 18 corpus sites are the wrong spelling of something with a right
spelling, and afterwards the wrong spelling does not parse. *Turns a silent
failure into an explicit one*: `edge p -- q {.no-head}` is today a line that says
the same thing twice with no complaint. The runtime capability stays:
`DG_CLASS_GROUPS`'s arrowheads slot lets `style` change the channel, and every
token seeds the corresponding per-beat state.

**Migration.** 18 corpus sites (diagrams 9 – `#motion`, `#plot`, `#sameframe`,
`#table`; network-security 7; figure-rules 2 – `sp7`), plus 10 example lines in
`figure-design.md`. Sixteen are `-> … {.no-head}` → `-- …` with the class struck
from a tail carrying others; two are `-> … {.both-heads}` → `<-> …`. The pattern
is uniform but the tail edit wants a human eye per line, so call it **28 sites,
semi-mechanical**.

**Effect on `lectures/diagrams/source.md`.** `#motion`, `#plot`, `#sameframe`,
`#table` change spelling. `#seqmore` documents the arrow family (*"Vier Formen,
und keine davon ist eine eigene Pfeilart"*) and its paragraph has to gain `<->` –
it currently names three forms and calls them four. **The construct reference
gains a construct it did not demonstrate**: `<->` should appear once, most
naturally in `#sameframe` where `{.both-heads}` sits today.

**Effect on `docs/artifact/`.** *Figures*: `sp7` regenerates, its listing showing
`--` where it showed `-> {.no-head}`. *Prose*: the class table's **arrowheads**
row moves out of the class table entirely and into whatever names the arrow
tokens, and one further sentence changes – both quoted under item 29(h). The page
never mentions `<-` today and should, given it survives.

### 13c. The arrow's spacing message says the author omitted what they wrote

**Problem statement.** Measured, all of `edge p->q`, `edge p ->q`, `edge p-> q`
and `edge p <-> q` report `edge needs "->" between two element names`. In the
first three the author wrote the arrow; what is missing is a space on each side,
and the message does not say so. In the fourth the token exists and is simply not
recognised, which 13b fixes.

**Editor perspective.** The panel shows the compiler's sentence alone in the
problem box with no line context, so a message naming the wrong cause is the whole
of what the user gets.

**Proposed revision.** Two messages instead of one. When no standalone arrow
token is found but some token *contains* one – measured, `edge p->q` tokenizes to
`["edge","p->q"]`, so this is a one-line test:

```
edge p->q: the arrow needs a space on each side – write "edge p -> q"
```

and when there is genuinely no arrow:

```
an edge is "edge <from> -> <to>" – the arrow may be ->, <-, -- or <->
```

Requiring the spaces is right and stays: every other option in this grammar is
space-separated, and splitting a token on `--` would break any element id
containing one. **Item 19 adds the third case** – an `edge` with nothing before
its arrow, which today reads the keyword `edge` as the from-endpoint.

**Why it is strictly better.** Turns a spurious failure into an accurate one. No
syntax changes, no migration.

**Migration.** None. One branch in `diagram-core.mjs`'s edge parser and its mirror
in `lint.js`. The sentences take item 2's shape.

**Effect on the lecture and the page.** None on either.

## 14. `aspect` is a panel field that can never be read or written

**Problem statement.** `aspect` is in `DG_KIND_OPTS.bars` and `.plot`, so
`dgeKindOpts` puts it in the panel's size row as a text field. It is not in
`DG_KEYED_ATTRS`, so `spanOf` returns `null`; it is not in `DG_LIST_OPTS`, so the
editor's own shim `dgeListSpan` does not cover it either; and `applyAspect`
consumes it at parse time and leaves nothing on the model, so `dgeResolve` has no
value to offer as a placeholder. The field is therefore blank with the
placeholder `auto` on a chart whose line literally reads `aspect 4:3`, and typing
`1:1` answers *"aspect cannot be written on f here – give it a placement first"* –
a sentence about placements, on a chart that has one.

**Editor perspective.** Entirely an editor defect; a hand-written figure is
unaffected. It is the only field in the sidebar that both misreports the current
value and refuses every keystroke, and `aspect` is the option a chart most wants a
control for, because the whole point of it is that `w` and `h` are a poor way to
say what shape a chart is. After the revision the field shows `4:3` and accepts
`1:1`, and the same becomes true of `col` on a `table` and the prominence options
on a `bars` or `series of` line.

**Proposed revision. The finding document's own proposal is correct on both
counts it asked to have checked. Adopt it, with one correction.**

Add `aspect`, `col` and the prominence option words to `DG_KEYED_ATTRS`, and
delete `dgeListSpan` together with its dispatch line, as its own header comment
instructs. After item 1 the list to add is `aspect, col, emph, dim, ghost` – not
`emph, calm` – and after item 5 the list already carries `flush` rather than
`align` and gains `side`; after items 22, 23 and 30 it gains `row`, `band`, `header`
and `tick`. **These land in one commit or the list disagrees with the grammar.**

*Checked: can `spanOf` find `aspect 4:3` when the value is not a number?* Yes.
`find(word)` scans the statement's tokens for the keyword and hands back the next
one whatever it holds, and `dgTokenize` splits on whitespace, quotes and braces,
so `4:3` is one token. Measured on a patched copy: `f aspect => {"present":true,
"text":"4:3","value":"4:3"}`, round-trip identity holds in every present case, and
writes land correctly including the insert-before-the-tail rule.

*Checked: is `dgeListSpan` safe to delete?* Yes, and the one way it could not have
been was checked. It resolves through `dgeLineOwner`, which falls back to
`model.statements`, whereas `spanOf` resolves through `byId`; those are the same
set, because `createSpanTable` walks the statements array too, so `elementIds()`
on a block with a `series of` line includes the series statement. The series pane
calls with the statement id, never with a column id, and a selected column is a
`box`, whose options never offer a prominence list. No call path loses an answer.
Keep the `DG_LIST_OPTS` export: the panel still reads it to decide the wide field
and the comma hint.

**Correction: do not keep `aspect` on the model.** The finding document offers
that as an option *"if the panel should also show what a chart was written
with"*. It is unnecessary. The size row renders its value off the span, so once
the span exists the field shows `4:3` – exactly what the author wrote, which is
what the panel should echo. The model value could feed only `placeholder` and
`dgeProvenance`, and neither can ever show it, because no `default` block carries
`aspect` (`bars` and `plot` are not default kinds). Adding a field to the model to
be read by nothing is a second reading of one line, which is the thing this item
removes.

**One consequence worth stating.** Afterwards `spanOf` hands back an *insertion
point* for these names on any element, since a non-placement option falls through
to the tail insert. That is already true of `w`, `h` and `pad` and is gated the
same way – the panel only asks for an option `dgeKindOpts` lists – and an edit
producing a line the compiler refuses is reverted by `dgeSetSource` with the
compiler's sentence.

**Why it is strictly better.** *Turns a spurious failure into a working control*,
and *removes a second reading of one line* – `dgeListSpan` is a duplicate of
`spanOf`'s keyed branch, guards included. Two of the five criteria, worse on none.

**Migration.** `diagram-core.mjs`: one line. `editor.mjs`: **−44 lines**. **No
source changes anywhere.** No test changes.

**Effect on `lectures/diagrams/source.md`.** None; the four tracked views are
byte-identical.

**Effect on `docs/artifact/`.** *Figures*: none. *Prose*: none – the two `aspect`
passages describe the language, not the panel, and both are accurate.

## 15. A class the panel does not offer for a kind cannot be taken off there

**Problem statement.** `dgeSlotRows` skips a whole slot when none of the
selection's kinds appears in `slot.kinds`. So any class the compiler accepts on a
kind the panel does not offer it for is invisible in the sidebar and unremovable
there: it survives every tail rebuild, because `dgePlanTail` writes `el.classes`
back unchanged for slots it is not touching, and no gesture removes it. Two rows
guard against this via `dgeCarries`, with the reason written out: *"a word written
on an edge it cannot move is still written on it, and a row that hid itself would
leave the author no way to take it off."* Every other row is unguarded. Taking a
class off is currently possible for some classes and not for others, with nothing
to say which.

**Editor perspective.** The user sees a class in the read-only source pane, has
no row for it in the sidebar, and cannot edit the pane. The only way out is a
text editor over `--watch`, which is the situation the editor exists to remove.

**Proposed revision. Take the refusal half wherever it is available, and take the
rest by deriving `kinds` rather than by adding guards.**

Where item 12 makes the compiler **refuse** a combination, the figures carrying it
stop existing and the row needs no guard. That covers `.hex` and its four
siblings on an edge (item 10); `.fit`/`.shrink` on a container, brace or edge;
`.no-head`, `.one-head`, `.both-heads`, `.smooth`, `.elbow`, `.front` on anything
but an edge; and every image swatch whose class cannot paint an image.

The rest are rows whose `kinds` is **narrower than the compiler's rule** – the
same defect as item 10 with the sign flipped – and deriving `kinds` from
`DG_CLASS_KINDS` fixes all of them at once:

| row | `kinds` today | derived | what becomes reachable |
|---|---|---|---|
| `fill` | `box dot text container` | `+ edge` | an edge's label ground – written by hand in `docs/artifact/figure-rules/source.md` and unsettable in the panel today; brace fills remain refused |
| `corner` | `box container` | `+ text edge` | `.round`/`.sharp` on a label ground, which act; the five shapes stay box-only |
| `reading` (`.turn`) | `box text` | `+ dot container brace edge` | `.turn` acts on all six – measured |
| `ink`, `line`, `weight`, `size`, `family`, `text weight` | `null` (= every kind) | narrowed off the table | dead swatches disappear |

**How many rows still need a `dgeCarries`-shaped clause: none.** The naming
analysis concluded "none beyond the two that already have it", on the grounds
that the along-the-line alignment case stays a warning so a figure can still
carry one. **Item 5(d) removes even those two**: once an edge's label side is the
`side` option rather than the four classes, the warning attaches to `side`, whose
row offers only the pair that can act, and `dgeAcrossOK`, `dgeDownOK` and
`dgeCarries` are all deleted. That is a cross-cluster improvement on both
analyses and it is the answer this document takes.

**Why it is strictly better.** Taking a class off becomes uniformly possible,
and four rows start
offering clicks the compiler has always accepted and the panel never showed. It
removes sixteen hand-kept lists that could drift from the compiler – the drift
that produced item 10 in the first place.

**Migration.** `DGE_SLOTS` only. **No source changes** beyond item 12's eleven
lines. Sixteen `kinds:` fields deleted and derived; `dgeShapeOK` replaced by a
table lookup; `dgeElbowOK` unchanged. The sweep this item asks for was done: the
only class in the corpus sitting on a kind whose row would have to appear is the
eleven `text … {.paper .bare}` lines, and item 12 refuses them rather than
showing them.

**Effect on `lectures/diagrams/source.md`.** None of its own.

**Effect on `docs/artifact/`.** *Figures*: none. *Prose*: the same sentence item
12 rewrites, read from the editor's side, where "ignored" additionally means "and
there is no way to take it back off". No separate edit.

---

# Further implementation items

The numbering remains stable for cross-references to the finding document.

## 16. A step can only add a class, so no slot's default can be returned to

**Problem statement.** `dgStateAt` implements `style` as add-and-displace: the
class is added and same-slot classes are deleted. **There is no way for a step to
remove a class.** Many slots express their base state as the absence of every
member – normal prominence, a solid stroke, regular size and family, and centred
label alignment among them – so a beat can leave that state and never return.
For example, after `dim a` there is no operation for restoring full prominence.
Ungrouped classes such as `.bold`, `.turn` and `.front` have the same problem.
The obvious attempts are worse than useless: measured, **`style a {}` and
`style a` with no class list are both accepted and do nothing, silently**. The
same gap is why an element cannot opt out of a `default box {.dim}` on its own
line.

**Proposed revision. One mark: `{!class}` removes that exact class.** It is legal
in every attribute tail: an element, a `default`, and a `style` operation.

```
step solid-again
  style link {!dashed}
```

```
box a "A" at 0,0 {!dim}        # under `default box {.dim}`, this one is not dim
```

Measured, `{!dim}` is unparseable today, so the mark is additive and cannot
collide with authored source. `style x` with an empty or absent tail becomes an
error rather than a silent no-op.

### 16a. Grammar and resolution contract

The attribute parser returns four separate fields: `id`, `classes`,
`removedClasses`, and `tags`. A `.name` token enters `classes`; `!name` enters
`removedClasses`. Both names must be in `DG_CLASSES` and legal for the target
kind according to item 12's final `DG_CLASS_KINDS`. For a tag target, every
expanded member must accept every addition and removal; one incompatible member
refuses the whole `style` statement and names that member.

Within one tail:

- the same class may not be both added and removed;
- the same removal may not appear twice;
- the existing one-positive-class-per-slot rule remains;
- several removals from one slot are legal, which is useful for an explicit
  base state on a box such as `{!emph !dim !ghost}`; and
- token order has no meaning. Resolution always removes first, then adds.

Layers resolve from weak to strong: built-in state, matching `default` layers,
the element's own tail, then step operations in source order. At each layer,
`removedClasses` deletes those exact names from the accumulated set; each
positive class then displaces the current member of its slot and is added.
Removing `.dim` does not mean "clear the prominence slot" and does not remove
`.ghost`. A later layer may add `.dim` again. This exact-name rule makes
`{!class}` predictable without creating a second, hidden slot grammar.

`dgStateAt` carries the resolved set from one beat to the next. Thus
`style e {!dashed}` removes `.dashed` from that beat onward, and a later
`style e {.dashed}` restores it. A tail-level removal can suppress a class from a
weaker default even when that default is later reordered; it is a declarative
override, not a parser-time deletion.

### 16b. Editor contract

Class controls edit the state the user is looking at:

- at beat 0 they rewrite the selected element's own tail, except item 13's
  arrowhead row, which rewrites the mandatory arrow token;
- at beat 1 or later ordinary class rows write a `style` operation inside the
  selected step; the prominence row uses item 1's `emph` / `dim` / `ghost` verb
  for a positive state and `style {!class}` for the base state;
- their pressed state comes from `dgStateAt` for that beat, not from
  `el.classes`; and
- geometry and keyed-option controls keep their existing behaviour. This rule is
  only for class swatches, whose values the frame model can represent.

Every grouped row has a visible base swatch (`full`, `solid`, `normal`, and so
on), never an unlabeled blank. Clicking a positive swatch writes `.class` and
lets normal slot displacement do the rest. At beat 0, clicking the base swatch
first removes every own addition and removal in the slot, resolves the weaker
defaults, and writes `!current` only if one of those defaults would otherwise
surface. At a later beat it writes `!current` for the currently resolved member.
For a mixed selection, the editor groups elements by the required operation and
emits one operation per group; elements already at the base state need no edit.
An ungrouped toggle such as `bold`, `turn`, or `front` uses `.class` to turn on
and the same beat-0/default algorithm or `!class` to turn off.

Beat 0 additionally shows **inherit** whenever a matching default supplies the
slot. "Inherit" removes all own additions and removals in that slot; the base
swatch instead keeps the element at the base appearance by inserting the needed
negation. This distinction prevents "default" from ambiguously meaning both
"use the default block" and "use the stylesheet's base look". At later beats the
row is purely appearance-based; it does not expose provenance.

Source surgery is deterministic. `dgeSlotValue` reads the resolved beat state;
`dgeSetSlot` produces `{ add, remove }`; and `dgePlanTail` preserves and
serialises both `classes` and `removedClasses`. At a later beat the editor may
reuse a class operation only when it is the **last operation in that step that
affects this slot for every selected element** and its explicit target list is
exactly the selected ids; for prominence this may be a dedicated verb, for other
rows it is `style`. Otherwise it appends the canonical form at the end of the
step, using the step's indentation, so a later tag or overlapping target cannot
silently override the click. It does not rewrite a tag expression into ids or
merge into a statement with a different target set.
When it reuses a `style` line, `dgePlanTail` changes only the selected slot and
preserves every unrelated addition, removal and tag.
Repeated clicks therefore update one editor-owned operation instead of
accumulating contradictory lines.

The model and span table retain authorship: each removal has its own tail token
span, and a missing tail has an insertion span after the last keyed option. The
editor must never infer removals by searching raw source. Compilation failure
rolls the edit back through the existing transaction path.

### 16c. Implementation and tests

`dgParseAttrs`, default resolution, `dgStateAt`, the frame payload, `lint.js`,
`DGE_SLOTS`, `dgeSlotValue`, `dgeSetSlot`, and `dgePlanTail` all gain the explicit
removal field. Tests cover unknown and kind-incompatible removals, add/remove
conflicts, several removals in one slot, default → own-tail override, removal and
re-addition across beats, tag failure on a mixed kind, round-trip preservation,
beat-0 inherit versus base, beat-local swatches, mixed selection, and rollback.

**Why it is strictly better.** It adds a missing capability and turns an accepted empty
`style` into an explicit failure. One mark works for grouped and ungrouped
classes without adding a "default class" for every slot. The source remains
readable because hand-written cases normally need one negation; only the editor's
mixed/base operations may emit more.

**Migration.** None; the syntax is purely additive. The first real use is the
`#beats-demo` correction in the sequencing section.

**Effect on `lectures/diagrams/source.md`.** None required. One beat somewhere
should demonstrate it, most naturally in `#motion`; and item 28's new prominence
row in `#look` is the natural place to show the tail form.

**Effect on `docs/artifact/`.** *Figures*: none. *Prose*: the *Steps are indented
under the beat they belong to* wall lists the step ops and gains a clause, and the
class-table introduction gains a sentence saying how a class comes off.

## 17. A step op destroys the author's own prominence class in print

**New**, and separate from item 11: it is a defect in the current implementation
rather than a naming or design question, and it would need fixing even if items 1
and 11 were both closed with no change.

**Problem statement.** `stepEmph` is recorded per *element*, not per class. Once
any `emph` or `calm` op names an element, the print pass strips **every**
prominence class from it, including one the author wrote on the element's own line
and never touched in a step. So `box a "A" {.dim}` followed by a later `emph a`
prints with neither `.dim` nor `.emph`, at full strength – an element the author
declared to be background comes out of the printer as foreground. The comment in
the code says the opposite of what the code does: *"an author who wrote `{.dim}`
on an element … is describing the drawing and print has to keep it."*

**Editor perspective.** Invisible in the panel, like the whole of item 11. The
prominence row shows the element's own class, correctly; the canvas shows the
beat, correctly; and the handout shows neither. No control in the editor can
produce or reveal it.

**Proposed revision.** **Item 11's rule fixes it as a side effect and no separate
change is needed**: print's prominence comes from the opening beat, so the
author's own class is exactly what survives. If item 11 were rejected, the minimal
fix is to record `stepEmph` per class rather than per element.

**Why it is strictly better.** *Turns a silent failure into no failure.* It is
measured, not hypothetical, and one real slide is affected.

**Migration.** None in source; the compiler change is item 11's.

**Effect on `lectures/diagrams/source.md`.** None – no chunk there writes a
prominence class on a line and a prominence verb in a step for the same element.

**Effect on `docs/artifact/`.** *Figures*: none; no `figure-rules` chunk has the
pattern. *Prose*: none. The affected figure is `lectures/network-security
#ns-a14`, whose listing the page carries as a card – the listing is unchanged, the
drawing on the page is the live one, and only the handout was wrong.

## 18. `problems[0]` is source order, so the one sentence the editor shows is not the cause

**New**, from measuring item 2's editor perspective. Given its own number rather
than folded into item 2 because it is not about any statement's wording: it is
about how the compiler orders problems and how the editor keeps them. Item 2
reduces the count on one line; this decides which line speaks when several are
wrong, and it has an editor half with no compiler counterpart.

**Problem statement.** `renderDiagram` throws one error carrying every problem in
the order the parser pushed them: the whole parse pass in line order, then the
reference pass, then the layout pass. Nothing weighs them. So a syntax failure
that *manufactured* a dangling reference is followed by the dangling reference it
manufactured, and if the syntax failure is on a later line the manufactured
symptom is first. In the editor this is not cosmetic but the whole message:
`dgeSetSource` rolls the edit back and reports `DGE.problems[0]` and nothing else,
and because the rollback recompiles the clean source, `DGE.problems` is empty by
the time the problem box redraws. **The rest are not deprioritised, they are
discarded.**

Measured today: `box b "B" rightof a gap 1` gives `problems[0] = unexpected
"rightof" in box b`, which is useful; `box b "B" above of a gap 1` gives
`unexpected "a" in box b`, which is useless. Both are decided by nothing but push
order, and the second is the finding document's worst first-hour case with the
editor showing the worst of its four sentences. A second measurement makes the
cascade concrete: `#ns-b63` compiled with an unresolvable asset yields 16
problems – six asset failures on lines 4–20, then ten `refers to @tp / @fn / …`
on lines 29–36, all ten caused by the six. Push order gets this right by accident,
because the causes are on earlier lines. Nothing guarantees it.

**Editor perspective.** After the revision the editor also stops discarding the
rest: `dgeSetSource` keeps the refused compile's problems in `DGE.refusal` and
clears it on the next successful compile, `dgeSourcePane` renders them in a box
headed as not applied, and the status bar shows `problems[0]` plus `(+N more)`.
They are rendered **without line marking**, because the line numbers belong to the
rejected text while the pane is showing the restored text, and marking line 7 of
the current source for an error on line 7 of a rejected one is a new way to
mislead. This touches nothing `DGE.spans` depends on: `DGE.refusal` is read-only
and the spans are still rebuilt only on a successful compile.

**Proposed revision.** Give every problem a **phase** and stable-sort by phase
alone, never by line. `dgErr` gains a fourth argument defaulting to `'syntax'`.

- **syntax** – the statement could not be read. Every `unexpected …`, every
  `… expects a number`, `at expects X,Y`, `point expects …`, `<kind> needs a
  name`, `needs "over a,b,c"`, the three `sequence` entry errors, the edge arrow
  messages, item 8's two new messages, and `has no placement`.
- **reference** – a name that is not there. `refers to "X", which is not defined`,
  `refers to @X, which no element carries`, `cannot find "<asset>"`.
- **semantic** – legal syntax, illegal combination. `.elbow` with `via`, `.fit`
  with no width, `point` on an outline with no point, `align`/`spread` on a
  non-node, `move @tag to`, `w`+`h`+`aspect` together, a reserved id, and every
  new refusal from items 4, 10, 12, 13 and 16.
- **layout** – `placement cycle`, and anything raised inside `layoutDiagram`.

**Syntax before reference is the causal order, not a preference.** A syntax
failure can manufacture a dangling reference – `above of a` binds `of` as a name,
a container's member scan swallows a mistyped option (item 19), an `edge` with
nothing before its arrow reads the keyword as an endpoint. The reverse never
happens: a dangling reference cannot manufacture a syntax error. Within a phase
the sort is stable, so push order survives, and push order already means "the
parser met this first". **Nothing sorts by line**: a line number is not evidence
about cause, and sorting by it would put the manufactured symptom first whenever
the broken statement is further down.

**Why it is strictly better.** *Turns a spurious failure into an explicit one* in
the strongest sense available: today four sentences out of four are thrown away by
the one consumer that most needs them, and which survivor appears is an accident.
*Reduces the chance of a model writing a figure wrong* – an agent reading the
status bar repairs whatever `problems[0]` names, which on `above of a` is the
wrong token. Worse on none: no language surface changes, no message text changes,
and the new parameter defaults, so an un-updated call site keeps working.

**Migration.** **Zero source lines.** 120 `dgErr` call sites gain a fourth
argument; the default means the pass can be done one phase per commit. About 30
lines in `editor.mjs`. `lint.js` needs nothing – it prints every finding and a
terminal shows them all.

**Cross-cutting requirement.** Every item in this document that adds a refusal
must pass a phase, and a combination check is `'semantic'`, not the default. This
is also where item 4's request lands: **if `warn()` gains a line-number channel,
the clash warning should take it.** `dgWarn` today names an element id instead and
`build.js` dedupes globally by message text.

**Effect on `lectures/diagrams/source.md`.** None.

**Effect on `docs/artifact/`.** *Figures*: unchanged. *Prose*: nothing. The page
never claims anything about how many problems a build reports or in what order.

## 19. A statement that loses its own structure reports a missing element

**New**, measured. Not folded into item 2 because item 2's fix does not reach it:
these lines never produce an `unexpected` at all, so a better `unexpected`
sentence changes nothing about them.

**Problem statement.** Three statements answer a structural mistake by reporting
that an element does not exist. A `container` or a `brace` finds the end of its
member list by scanning to the first token in a fixed trailing set, so any token
not in that set is swallowed as a member name – and a mistyped or wrong-statement
option becomes a member. An `edge` written with nothing before its arrow reads the
keyword `edge` itself as the from-endpoint. In all three cases the author is told
their reference is undefined, which is the same class of failure as item 8's
`above of a`, and it is worse here because there is no `unexpected` sentence
anywhere in the output to contradict it. Measured:

```
container z "Z" over a,c padd 0.3
  -> z refers to "padd", which is not defined
  -> z refers to "0.3", which is not defined

brace y "Y" over a,c gap 0.3
  -> y refers to "gap", which is not defined
  -> y refers to "0.3", which is not defined

edge -> b
  -> edge edge-1 refers to "edge", which is not defined
```

**The `brace` case is the sharpest, because `pad` on a brace was renamed *from*
`gap`** – so the word an author is most likely to write on that line is the one
word the statement answers worst. `lint.js` reproduces all of it exactly,
including the two bogus references per line.

**This goes beyond the finding document rather than contradicting it.** It
measured the primitives as saying "unexpected X, once per leftover token"; for
`container` and `brace` that is not what they say. They say nothing about the
token at all.

**Editor perspective.** The panel cannot write these lines – `dgeKindOpts` offers
a `container` only `pad` and a `brace` `pad` plus the four sides. The
empty-endpoint case is guarded by one of the five hand-written panel refusals,
which exists precisely because the compiler's answer here is a misparse. Through
the source the editor shows one of the two bogus sentences and discards the other;
after the revision it shows the statement sentence, and that hand-written refusal
can be deleted because the compiler's own answer is now correct and specific.

**Proposed revision.** **The member run of a `container` or a `brace` ends where
the commas stop.** A member list is comma-separated, so it continues only while
the previous token ended with a comma or the next begins with one; everything
after that is the trailing option region, read by the loop that already exists and
now answering with item 2's sentence. Verified against all 39 `container` /
`brace` lines in the corpus: every one writes its members comma-joined with no
spaces, and every single-member line ends correctly at the first member. **Zero
false positives, zero source changes.**

**An `edge` with nothing before its arrow says so.** When the token before the
arrow is the statement keyword itself, the message is `edge needs an element on
both sides of "->"` – the sentence the *right*-hand case already produces today.
One line in the edge branch, and it belongs with item 13c's arrow-message work.

**Why it is strictly better.** *Turns a spurious failure into an explicit one*:
two bogus errors become one true one naming the token and the statement's
vocabulary. *Reduces the chance of writing a figure wrong*: being told a
nonexistent element is missing sends an author looking for a typo in a name they
did not write. Worse on none – a member list is still whatever the author writes
between `over` and the options, only now the boundary is stated by the commas they
already type rather than by a table of four words.

**Migration.** **Zero source lines.** About 15 lines in `diagram-core.mjs`, 15
mirrored in `lint.js`.

**Effect on `lectures/diagrams/source.md`.** None. `#grouping`, the construct
reference for `container` and `brace`, is unchanged and still demonstrates both.

**Effect on `docs/artifact/`.** *Figures*: unchanged; all `container` and `brace`
lines in `figure-rules/source.md` are comma-joined. *Prose*: nothing must change.
This is the item that makes item 3's optional sentence worth adding, because the
`brace … gap` line is now answered by name.

## 20. Four options parse on the primitives, draw nothing, and are never mentioned

**New**, measured. Closed by item 2's edit, but a distinct defect – the accepted
vocabulary of these statements is not the vocabulary `DG_KIND_OPTS` records.

**Problem statement.** The node branch of the parser accepts `w`, `h` and `r` on
every node kind unconditionally, while `DG_KIND_OPTS` says `box` and `text` take
`w / h / pad`, `image` takes `w / h`, and `dot` takes `r`. So `w` and `h` on a
`dot`, and `r` on a `box`, a `text` or an `image`, parse, consume their value and
change nothing – measured by rendering with and without: the emitted SVG is
byte-identical. `pad` is correctly gated by the same table three lines below,
which makes the omission an oversight rather than a design. It is also the exact
defect CLAUDE.md records as *fixed* for the `default` block – *"`default box r 5`
used to parse and then do nothing, which is a silent no-op"* – fixed there and
left standing on the statement the block defaults.

**Editor perspective.** Invisible from the panel: `dgeKindOpts` reads
`DG_KIND_OPTS` off the statement, so a `dot` is offered `r` and never `w`. That is
the panel being right about a vocabulary the compiler is wrong about – the same
relationship CLAUDE.md records for the class slots: *"the grammar has caught up
with the panel, not the other way round"*. The revision changes nothing a panel
user can do.

**Proposed revision.** Gate `w`, `h` and `r` on `DG_KIND_OPTS[head]` the way `pad`
already is, and let the leftover fall through to item 2's sentence. Same for
`point`, which belongs only on `box`, the only kind that can carry an outline for
it to aim; `point` on a `dot` today parses and is refused later by the outline
check, and refusing it on the statement is the same discipline the editor already
applies.

**Why it is strictly better.** *Turns a silent failure into an explicit one.*
*More consistent*: afterwards `DG_KIND_OPTS` is the vocabulary of the statement as
well as of its `default` block, so a statement is no longer laxer than the block
that defaults it. Worse on none – nothing that draws anything is refused.

**Migration.** **Zero source lines.** Scanned all four corpus files: zero
occurrences of `w`, `h` or `r` in an option position on a kind that does not take
it. Four lines look like matches to a naive scan – `box r "Router" …`,
`text r "10.1.1.5 is at bb:bb" …` – but `r` is the element *name* there, in the
positional second slot. About 5 lines in `diagram-core.mjs`; `lint.js` gets it for
free from item 2's primitive option check.

**Effect on `lectures/diagrams/source.md`.** None.

**Effect on `docs/artifact/`.** *Figures*: unchanged. *Prose*: the Size vocabulary
wall lists `w`, `h`, `r` and `same as` with one example each, and its examples are
already kind-correct. No change.

## 21. `step my name` compiles, names the step `my`, and drops the rest

**New**, from the fifth hand-written panel refusal. The smallest item here; it is
included because it is the one thing blocking that refusal's deletion.

**Problem statement.** A `step` takes its name from the token after the keyword
and ignores everything else on the line. `step my name` compiles clean, produces a
step called `my`, and the word `name` is discarded with no error and no warning.
The editor knows this is wrong and applies its own identifier rule, which the
compiler does not have.

**Editor perspective.** The panel's step-rename field is the only place the rule
is stated, so a name typed there is checked and the same name written in the
source is not. After the revision the compiler states it, the field drops its
guard, and the fifth of the five hand-written refusals goes with the other four.

**Proposed revision.** A `step` line takes exactly one token after the keyword.
Anything after it is *unexpected "<tok>" in step <name> – a step takes one name
and its operations on the lines beneath it*, phase `syntax`. The name itself must
match `/^[A-Za-z_][\w-]*$/`: it starts with an ASCII letter or underscore, then
uses letters, digits, underscore or hyphen. The editor imports this rule rather
than paraphrasing it, so the two cannot disagree.

**Why it is strictly better.** *Turns a silent failure into an explicit one*: the
discarded token is silently gone today, and a step name is an identifier that later
lines and the editor's beat navigation both address. Worse on none.

**Migration.** **Zero source lines** – every `step` line in the corpus is
`step <one-token>`, checked. About 6 lines in `diagram-core.mjs`, 6 in `lint.js`,
minus 4 in `editor.mjs`.

**Effect on `lectures/diagrams/source.md`.** None; the stepped figures are
unchanged.

**Effect on `docs/artifact/`.** *Figures*: unchanged. *Prose*: nothing – the wall
already describes the line as naming the beat.

## 22. A brace's side is a bare positional word among keyed options

**New**, found while separating the four direction words in item 5.

**Problem statement.** `brace whole over r1,r2,r3 left "the whole thing" pad 0.5`
– `left` is a bare word with no keyword in front of it, in a statement whose every
other modifier is keyed (`over`, `pad`), and its position on the line is free: the
corpus writes it both before and after the label. It is one of the same four words
item 5 is disambiguating, and it is the last place where one of them appears with
no keyword to say which reading is meant.

**Editor perspective.** The current branch already has the control: a five-way
`side` row (`default`, `right`, `left`, `top`, `bottom`) backed by the temporary
`dgeSideSpan` scanner, and `test/editor-sidebar.mjs` exercises both writing and
removal. The defect is therefore not missing capability. It is that this one
control needs a bespoke positional-token parser because the language gives the
value no keyword. After the revision the row stays visually unchanged and uses
ordinary `spanOf(id, 'side')`; `dgeSideSpan` and its dispatch branch are deleted.

**Proposed revision.** `side <word>`, the same keyword item 5(d) gives an edge:

```
brace whole over r1,r2,r3 side left "the whole thing" pad 0.5
```

The two are one concept – which side of the thing the label or the spine sits on –
so they should be one word. Taken with item 5(d), `side` is the single answer to
that question wherever it is asked.

**Why it is strictly better.** Removes the last bare positional option in the
statement grammar, deletes a one-off editor parser and unifies two spellings of
one concept. The user keeps the control they already have. Worse on nothing.

**Migration.** 20 sites (diagrams 9, network-security 8, figure-rules 3). **Not a
clean `sed`**, because the word's position is free – a small script or a human
pass. Code: two sites in `diagram-core.mjs` where `DG_BRACE_SIDES` is read as a
bare key, `DG_KIND_OPTS.brace`, `DG_KEYED_ATTRS`, and `lint.js`'s mirror;
`editor.mjs` deletes `dgeSideSpan` and keeps the existing row.

**Effect on `lectures/diagrams/source.md`.** `#overflow`, `#lifecycle`,
`#grouping`, `#expand`, `#sequence` – spelling only, all constructs still
demonstrated.

**Effect on `docs/artifact/`.** *Figures*: `sp3` and `seq-demo` regenerate with
the new listing. *Prose*: the brace is described in the vocabulary walls and the
sentence naming its side needs the keyword.

**Separable.** Worth doing with item 5 because they share the word; harmless on
its own.

## 23. `h` means the whole element on four statements and one row on three others

**New**, flagged by the question about `table`'s `h`; measured and confirmed to be
a family rather than a one-off.

**Problem statement.** On a `box`, `text`, `image`, `bars` and `plot`, `h` is the
element's height. On a `table` it is the height of **one row** – measured, `h 0.4`
on a three-row table gives a 110.4 px frame and `h 0.8` gives 196.8; on a `lanes`
it is the height of one band; on a `sequence` it is the height of one actor head.
Nothing on the line says which, and an author reading `h` as "how tall" is wrong
by a factor of the row count, silently and in the direction that still draws a
plausible picture.

**Editor perspective.** The size row shows an `h` field on all seven, with the
same label and the same behaviour, and the number it writes means two different
things depending on which statement the selection sits on. Nothing in the panel
distinguishes them.

**Proposed revision.** Give the per-unit number a word that says its unit, and
refuse `h` on the three statements where it meant something else:

```
table t "A|B|C" at 0,0 col 1,1,1 row 0.42
lanes swim "User | SOC | IT ops" at 0,0 w 7.05 band 0.95
sequence wa at 0,0 header 0.9
```

`header` is used rather than `head`: a sequence is full of arrowheads, so `head`
would introduce a new collision in the domain where it is easiest to misread.
`h` on any of the three becomes an error naming the right word. The alternative –
make `h` the frame on all seven and let the per-unit number fall out of the count
– loses the property these three statements exist for: insert a row and nothing
else moves.

**Why it is strictly better.** Removes a word that means two things; makes the
language self-describing at exactly the point where the wrong reading still draws
something. Worse on nothing – no size stops being expressible.

**Migration.** 4 sites (2 in `lectures/diagrams`, 2 in `figure-rules`, **zero in
network-security**). Mechanical. Code: `DG_KIND_OPTS` for the three statements,
`readGridOpts`, `lint.js`'s mirror, the `dgeKindOpts` labels, `DG_KEYED_ATTRS`.

**Effect on `lectures/diagrams/source.md`.** `#swimlane` and `#table`, spelling
only.

**Effect on `docs/artifact/`.** *Figures*: `swim` and `table-demo` regenerate.
*Prose*: none currently states what `h` means on these statements, which is part
of the problem; one clause should be added where the table and the swimlane are
walked through.

**Lower priority than 5 and 13**, and independently landable.

## 24. `bars … space` means two different distances depending on `horizontal`

**New**, measured, and the same defect as item 6 inside one statement.

**Problem statement.** `space` on a `bars` line is the gap between two columns. It
is multiplied by the cell's *width* on an upright chart and by its *height* on a
flat one, so **adding the word `horizontal` to an existing `bars` line silently
rescales its column spacing** – and the two words are on the same line with
nothing between them to suggest a connection. Measured at `unit=150x52`,
`bars f "3,5,4" w 2 h 1 space 0.2`: 30.0 px between columns upright, 10.4 px
horizontal. `horizontal` is documented as a reading of the same chart and every
other number on the line survives the flip, because the expansion is written in px
along two named axes for exactly that reason. `space` is the one that does not.

**Editor perspective.** `space` is a keyed numeric option, so the panel offers it
as a field on a `bars` frame, and `horizontal` is a bare word rendered as a
checkbox. **Ticking the checkbox changes what the number in the field beside it
means, with no feedback.** That is the same act as item 6's `side` swatch row, in
the same panel.

**Proposed revision.** `opts.space * uh`, unconditionally. One line, and it is
item 6's rule applied to the same word.

**Why it is strictly better.** Removes a second meaning of one word; makes a
checkbox stop changing a number beside it; brings `bars … space` into line with
`grid … space`, which is already square, and with `sequence … space`, which has
only one axis.

**Migration.** **One line in the whole corpus.** `lectures/network-security:1397`
carries `space 0.085` on an upright chart in a block whose unit is 150x58; it
becomes `space 0.2198`. Neither of the two `horizontal` charts in the corpus
writes `space` at all, so the flat case is not exercised anywhere. No `lint.js`
change.

**Effect on `lectures/diagrams/source.md`.** None – `#expand`, `#series`, `#flat`
and `#plot` write no `space` on a chart.

**Effect on `docs/artifact/`.** *Figures*: none. *Prose*: none – the `gap`/`space`
wall stays correct and becomes more so.

## 25. `table … space` is one number that draws two distances

**New**, measured. **The only free correction in this document.**

**Problem statement.** `space` on a `table` is the air between cells. It is added
to the row pitch in grid-y and to the column offsets in grid-x, so one number
produces two distances in the same drawing – measured at `unit=150x52`, 30.0 px
between two columns and 10.4 px between two rows. A table is the one construct
whose whole promise is regularity – it exists because hand-placing twenty-one
cells cannot be maintained – and its single spacing control is irregular by
construction. `grid`, its nearest neighbour, already converts the horizontal
component and says why in a comment: *"a grid cell has to be square, and one
number that meant `uw` across and `uh` down would give squares only where the unit
happened to be square."* The same sentence applies verbatim to a table and was not
applied.

**Editor perspective.** `space` is a field on the table frame's panel. Typing
`0.2` and watching the drawing gives no way to learn that the number is doing two
things; the horizontal effect is nearly three times the vertical one at the corpus
median unit, which reads as the field being broken rather than as a convention.

**Proposed revision.** Convert the horizontal component exactly as `grid` does –
`space * (unit[1] / unit[0])` in `totalW` and in `xOf`. Three lines, copied
deliberately from the statement that already got this right.

**Why it is strictly better.** One number, one distance. Brings the two
grid-of-cells statements into agreement, which is what an author assumes anyway,
and removes a maintenance trap: `grid` and `table` are read side by side and only
one carries the conversion.

**Migration.** **Zero lines.** No `table` in the corpus writes `space`; all take
the default of `0`, where the two readings coincide. **This should land before
anyone writes the first `space` on a table.**

**Effect on `lectures/diagrams/source.md`.** None – `#table` compiles
byte-identically.

**Effect on `docs/artifact/`.** *Figures*: none. *Prose*: none.

## 26. `.smooth .elbow` draws a third route outside its own extents

**New**, measured, and the strongest single argument for item 4(a).

**Problem statement.** The two classes share a slot and the page says of them
*"One or the other – they are two answers to the same question."* Written together
they are neither: the router computes the elbow's two rail waypoints and the
emitter then draws the resulting four-point polyline as a spline. The result is a
smoothed elbow – a shape with no name in the language – and **it leaves the
extents reserved for it**. Measured on two boxes at `0,0` and `2,2`:

```
{.elbow}          M27 0 L120 0 L120 144 L205.35 144
{.smooth}         M27 0 L206.95 139.32
{.smooth .elbow}  M27 0 C42.5 0 104.5 -24 120 0 C135.5 24 105.78 120 120 144 …
```

The curve reaches y = −24 and y = 168, outside the box the layout reserved from
the polyline's own vertices, so a figure whose outermost element is such an edge
is **clipped by its own viewBox**. Class order does not matter.

**Editor perspective.** The panel cannot produce it – *line shape* is one row and
`dgeSetSlot` displaces. `dgeCurveOf` reads whichever of the two comes first and
shows that swatch pressed, so on a hand-written pair the panel already reports one
and draws the other.

**Proposed revision. No change of its own: item 4(a) refuses the pair and the
page's sentence becomes true as written.** No prose edit is needed there.

**Capability is not lost**, which the ground rules require checking. A curved
elbow remains expressible by hand and in the panel: write the rail as two
waypoints and smooth them – `edge a -> b {.smooth} via a.right+0.6,a.cy
a.right+0.6,b.cy` – which is what `.elbow` is documented to be a one-word spelling
of, and which the editor's waypoint pane already edits. The difference is that the
waypoints are then real vertices, so `extentsOf` reserves the paper the curve
actually needs, and the clipping goes away with the contradiction.

**Why it is strictly better.** *Turns a silent failure into an explicit one* –
today the pair silently produces a route nobody asked for and clips it – and
*removes a word that means two things*: `.smooth` currently means "curve the
waypoints I wrote" everywhere except beside `.elbow`, where it means "curve the two
the build wrote".

**Migration.** None beyond item 4. **Zero corpus lines** carry the pair.

**Effect on `lectures/diagrams/source.md`.** None; `#edges` still demonstrates
each separately.

**Effect on `docs/artifact/`.** *Figures*: none. *Prose*: none – the sentence is
currently false and becomes true untouched. **Worth noting in the commit
message**, because a future reader will otherwise wonder why a sentence describing
a refusal has no refusal behind it.

## 27. A generated sequence-message name must not become authored

**Problem statement.** A sequence message has a stable generated id such as
`wa-3`. The current editor guesses whether an edge name was authored from the
shape of that id, so a tail rebuild can pin a generated message name into source.

**Current revision. Fold this item into item 9.** Item 9 deletes tail ids,
defines the model's `named` flag for ordinary edges and sequence messages, adds
the optional leading-name span, and specifies the regression test. There is no
separate parser or editor change here, and no `{#id}` remains for this item to
write.

**Migration and effects.** No source lines beyond item 9. `#sequence` and
`#seqmore` keep their generated-name interface; an explicitly named message uses
the new leading slot. No separate artifact prose change.

## 28. `#look`, the class reference, demonstrates no prominence class

**New**, and small.

**Problem statement.** `lectures/diagrams/source.md` `#look` is described in
CLAUDE.md as *"the reference for the class vocabulary: every fill, every family,
and the three answers to how type meets its box."* It shows no prominence swatch.
The only class-form use of the channel in that whole lecture is one `{.ghost}` on
an image in `#cbc`; **`.emph` appears as a class zero times in the entire
corpus** (measured across all three source files). So the class half of the
channel is demonstrated nowhere, which is part of why the step half and the class
half read as unrelated.

**Editor perspective.** None directly – but a user learning the panel from the
construct reference finds a prominence row in the sidebar and no figure in the
lecture that uses it.

**Proposed revision.** Add a prominence row to `#look` beside the fill and family
rows: `{.emph}`, `{.dim}`, `{.ghost}` on identical boxes, plus one carrying
`{!dim}` under a `default box {.dim}` to demonstrate item 16's tail form. Two
lines of source plus a caption.

**Why it is strictly better.** *Makes the language easier to learn*, and it is the
cheapest way to make item 1's central claim – the classes and the verbs are one
dial – visible rather than merely stated.

**Migration.** Two lines added to one chunk. The four tracked views of
`lectures/diagrams` rebuild.

**Effect on `lectures/diagrams/source.md`.** One chunk. The construct reference
gets strictly more complete.

**Effect on `docs/artifact/`.** None. `#look` is not one of the chunks
`refresh-figures.mjs` lifts, and no sentence in `figures-you-write.html` refers to
it.

## 29. Claims on the artifact page that the compiler contradicts

**New.** Six defects of one kind, in one file, with one migration shape: a
sentence on `figures-you-write.html` that the running compiler does not support.
They are grouped under one number because each is a single sentence and the
treatment is identical; each is stated with its evidence and its replacement. The
page's prose **does not regenerate** – only its drawings, listings, stepped demos,
stylesheet, runtime and fonts do.

The two hard constraints on this review include *"the principles stated in
`docs/artifact/figures-you-write.html` must still hold – they are allowed to be
opinionated; they are not allowed to be contradicted by the language they
describe."* These six are the places where that is presently violated. **None of
them is a principle; all six are factual claims**, so the constraint is satisfied
by correcting the page, and in four of the six the language change proposed
elsewhere in this document makes the sentence true rather than needing retraction.

**Editor perspective** (shared): none of the six is visible in the panel. In three
of them the panel is already right and the page is wrong, which is the strongest
evidence that the sentence rather than the behaviour is the defect.

**Migration** (shared): six sentences in one file, none mechanical, each in
different surrounding prose. **Zero source lines, zero code.** No figure
regenerates differently on this item's account.

**Effect on `lectures/diagrams/source.md`** (shared): none.

### (a) "Only one class from a group can apply"

Stated three times as the reason the class table has a *group* column:

> *"There are forty classes, thirty-seven of them in thirteen groups, and only one
> class from a group can apply, so two settings that contradict each other never
> both take effect."*

> *"Thirty-seven of them fall into thirteen groups, one group per thing they set,
> and only one class from a group applies to an element, so two fills can never
> both take effect."*

> *"They share one class group with `.round` and `.sharp`, so only one of the seven
> applies to a box."*

Measured: `{.round .sharp}` emits `class="dg-el dg-box round sharp"`;
`{.tone-1 .tone-3}` emits `tone-1 tone-3`; `{.mono .serif}` emits `mono serif`.
Both classes apply, both rules match at equal specificity, and stylesheet order
decides – which is what the slot table's own comment says the slots exist to
prevent, and it prevents it only *between layers*. **Item 4(a) makes all three
true**, and they should then be sharpened to say *why*, because "cannot both take
effect" is a weaker promise than "is refused" and the page makes the stronger
promise two sentences later: *"…so only one class from a group may be written on
an element, and a second from the same group is refused when the figure is
built."* If item 4(a) is not taken, the sentences have to be **retracted**
instead, which is worse prose about a worse language.

### (b) The build "reports it as an error" when it warns

> *"Naming the pair that runs along the edge cannot move the label, and the build
> reports it as an error."*

Measured: it is a `dgWarn`; the build completes and draws the figure. CLAUDE.md is
explicit about why it has to be a warning – which pair runs along the line is only
known once the edge is routed. **The page contradicts itself twenty paragraphs
later**, where the flowchart section gets it right without claiming a severity.
The distinction matters here more than most, because the page's own checklist
tells the reader to treat warnings and errors differently. Replacement: *"…so the
build warns about it rather than letting the word land somewhere you did not mean
– the pair is only decidable once the edge has been routed, which is why this one
is a warning where the two below it are errors."* The trailing clause is worth the
words, because the same sentence goes on to say that `.left` on a container *is*
an error. Under item 5(d) the warning attaches to `side` rather than to a class,
so the sentence must be rewritten for that reason too.

### (c) A dot's radius given as its diameter

> *"A marker has to be given a marker's size. **A bare dot is 0.18 grid units
> across** and an empty `.cross` box is square at one line of type plus its
> padding – both right for a junction in a topology, both far too heavy for a
> point inside a plot frame."*

`DG_DOT_R = 0.18` is a **radius**. Measured on `dot d at 0,0` at the default unit:
`<circle … r="12.96"/>` – 0.36 grid units across. The sentence understates the
mark it is warning about by a factor of two, in the one paragraph whose entire
purpose is to tell an author what number to write, and `r` on a `dot` is a radius
with no `w` beside it. Replacement: *"A bare dot has a radius of 0.18 grid units,
so it is 0.36 across…"*.

### (d) The wrong two outlines named as the aimable ones

> *"If you need a fifth distinction, use shape (`.hex`, `.diamond`, `.chevron`,
> `.wedge`, `.cross`, **the last two aimed with `point`**) or family."*

The last two listed are `.wedge` and `.cross`. `DG_POINTED` is `{chevron, wedge}`
– the third and fourth. Measured, `point up` on `.cross` is a build error naming
the two that do take it. **The page contradicts itself four cards later**, in the
last wall of the same section, which has it right. The panel is right too: the aim
row is offered only where the resolved outline has a point, so a reader who
follows the first sentence looks for a control that is not there. Smallest fix:
**reorder the list** so "the last two" becomes true – `.hex`, `.diamond`, `.cross`,
`.chevron`, `.wedge` – which also puts the two pointed shapes next to each other,
as the class table below already groups them.

### (e) A brittle count of the page's own listings

> *"The three below the rule are in no group and combine freely. **The six stages
> above used one class in all.** Anything outside the vocabulary is refused when
> the figure is built rather than ignored."*

The sentence is already false and would become stale again whenever a generated
listing changes. Delete the count rather than replace it with another. Its useful
teaching point survives as: *"The stages above use only the classes that make a
specific visual distinction; you do not need to learn the class table before
writing a figure."* That statement explains progressive disclosure without
coupling prose to generated content.

### (f) "Every statement has the same shape" and "placement is compulsory"

> *"Every statement in those six stages has the same shape, **and so does every
> other statement in the language.**"*

> *"**Placement is the slot that is compulsory, and the only element allowed to
> leave it out is the first one**, which stands at the origin. Any later statement
> without one is an error that names the five words that would fix it: `at`,
> `above`, `below`, `right of`, `left of`."*

Of the seventeen statements, the six-slot shape fits `box`, `dot`, `text`, `image`
and the six expanding statements. It does not fit `edge` (two endpoints and an
arrow where the placement goes), `container` / `brace` (an `over` member list),
`align` / `spread` (an axis and a member list, no name, no label), `default` (a
kind, no name) or `step` (a beat name only); nor the three `sequence` entry shapes
or a `table` row. And the compulsory-placement claim is false for `edge`,
`container` and `brace` – measured, all three build with no placement and are not
the first element. The claim's two useful halves are true and worth keeping: the
*order* of the slots that exist is fixed, and a *node* that is not the first one
needs a placement. Replacement for the first: *"The four statements in those six
stages that place a single element – `box`, `dot`, `text` and `image` – have the
same shape, and so does every statement that draws a chart, a table, a swimlane or
a protocol. … The rest replace the placement slot with what they are about
instead: an `edge` puts its two ends there, a `container` and a `brace` the members
they hold, `align` and `spread` an axis and a list, `default` a kind, `step` the
name of a beat."* Replacement for the second: *"For a statement that has a
placement slot, that slot is compulsory…"* – **and the list becomes six words, with
`between` joining it**, which is item 2's change to the compiler's own message. The
ASCII slot diagram between the two sentences needs no change; it is drawn for a
`box` line and the new wording says so.

### (g), (h), (i) – claims other items falsify

These are not defects today. They are the sentences that **become** wrong when
other items land, collected here so nothing is missed. None regenerates.

**(g) Item 1 renames `calm`.** The affected passages use `emph` / `calm` by name,
including two that enumerate and count the step operations, the prominence row
of the class table (*"A step reaches for the first two
through `emph` and `calm`"*), the `.dim` row (*"A step sets it with `calm`"*), the
beat-4 card (*"Often `calm` on what came before"*), and the `bars` sentence
*"`emph` and `calm` on a `bars` line take a list of column numbers and mean on the
line exactly what they already mean inside a step."* That last one is the sentence
that gets **better**: after item 1 it is not a coincidence being explained, it is
the rule. Replace the counting sentences with a grouped explanation: visibility,
movement, labelling, prominence and styling are the operation families, and prominence uses
the same names as the class row. Do not publish a new total.

**(h) Items 5 and 13 rename `align` and complete the arrow family.** Four `align`
passages, including one that exists **because** of the overload – *"Two of these
share a word. `align` at the end of a placement keeps one edge flush …; `align` on
a line of its own hands one coordinate from the first element named to all the
others."* – which is deleted rather than edited, since the overload it explains is
gone. The class table's **arrowheads** row moves out of the class table into
whatever names the arrow tokens, and *"`.both-heads` puts an arrowhead at each
end"* becomes `<->`. The long alignment paragraph loses its edge half to `side`
and is also the site of (b). The `.turn` row's sentence stays true for node labels
and needs a scope word.

**(i) Item 6 squares `gap`.** The wall stating the units rule is the item itself:
*"The block opens with `::: diagram {unit=170x56}` … After that every number – a
gap, a width, a nudge – is in units, so a figure keeps its proportions whatever
size it is drawn at."* *"Every number … is in units"* is exactly the claim the
revision breaks, and it names `gap` first; it becomes the two-family sentence.
Note it is **already misleading today** – it says "in units" as though that
settled the question, when a gap and a width in one figure are counted against
different rulers. Rule 1 – *"Make the gaps inside a group visibly smaller than the
gaps between groups. A factor of two is enough; a factor of three is
unmistakable."* – needs no edit but becomes *executable*: at the corpus median
unit, two elements at the same nominal `gap` one row apart and one column apart
are drawn 2.88 times apart, which by the page's own scale is "unmistakable"
grouping emitted by the language against the author's intent. And **one sentence
becomes true with no edit at all**, which is the strongest single argument for
item 6: *"What shape a chart is comes from `aspect`, not from `w` and `h`. … **It
is the one place where the coordinate grid shows through into a decision you are
making about the picture**, and it catches everybody once."* The bolded clause is
false today, because `gap` is the other place and it is written 232 times against
8 uses of `aspect`. After item 6 the sentence is accurate as written. The hero
paragraph quotes `gap 1.1` and moves if `#hero` is rewritten.

## 30. `step` is a statement and a `plot` option

**New**, found while merging `DG_KEYED_ATTRS` across the other items. Nobody
looking at the numbered list would have found it, because it is visible only when
the two tables are read side by side.

**Problem statement.** `step` is in `DG_KEYWORDS` – it opens a beat and takes
continuation lines – and it is also in `DG_KIND_OPTS.plot`, where it is the tick
interval on both axes. Measured, both compile in one block with no complaint:

```
plot p "x" "y" at 0,0 w 2 h 1 step 0.5
step s1
  show p
```

This is the same defect as item 1's `emph` and item 5's `align` – one word, two
grammatical roles – and it is arguably the worst of the three, because the two
roles are not merely different parts of speech but a *statement* and an *option*,
so a reader scanning a block for its beats has to know that a `step` mid-line on a
`plot` is not one. It is also the only one of the three where the option's meaning
is not derivable from the statement's: a beat and a tick interval have nothing to
do with each other.

**Editor perspective.** `dgeKindOpts` offers a numeric field labelled `step` on a
`plot` frame, three panes away from a step pane whose chips are captioned with
step names. `DG_KEYED_ATTRS` already carries `step`, so `spanOf` finds the option
correctly and there is no functional defect – the collision is entirely in what
the two controls are called. After the rename the field is labelled `tick` and the
word `step` appears in the sidebar only where a beat does.

**Proposed revision.** Rename the `plot` option to **`tick`**: `tick 0.2` reads as
"a tick every 0.2", which is what it does. `step` on a `plot` becomes an error
naming `tick`, which is worth doing rather than leaving silent because the old
spelling is exactly what an author who learned it will type.

`tick` rather than `ticks` because the value is an interval rather than a count –
`ticks 0.2` reads as "0.2 ticks". The alternative is to rename the *statement*,
which is far more disruptive and loses a word that is right: a beat is a step.

**Why it is strictly better.** *Removes a word that means two things.* *Reduces
the chance of a human or a model writing a figure wrong*: a model asked to add a
beat to a block containing a `plot` has two plausible readings of the same token.
*More self-describing* – `tick` says what the number controls, where `step` says
nothing about ticks. Worse on nothing.

**Migration.** **9 sites, mechanical**: `lectures/diagrams` 3 (`#plot`, and two
lines of `#sameframe`), `lectures/network-security` 3, `docs/artifact/figure-rules`
3 (`#sp4`, `#sp4b`). All are
`plot … step <n>` with the keyword mid-line, so a `sed` restricted to lines
beginning `plot ` covers every one, and there is no collision with the statement,
which is always first on its line. Code: `DG_KIND_OPTS.plot`, `DG_KEYED_ATTRS`,
the `readGridOpts` consumer, `lint.js`'s mirror, and the `dgeKindOpts` label.

**Effect on `lectures/diagrams/source.md`.** `#plot` and `#sameframe`, spelling
only. Both still demonstrate `plot` and its tick interval.

**Effect on `docs/artifact/`.** *Figures*: `sp4` and `sp4b` regenerate with the
new listing – drawings byte-identical. *Prose*: the `plot`
walkthrough names `step` where it describes the tick interval and must be
rewritten; it is one sentence, and it should be checked against the Size
vocabulary wall, which does not list the option.

---

## 31. A `text` leader is written `->` and draws no arrowhead

**Problem statement.** A free `text` can grow a leader to what it annotates, and
the syntax for it is the arrow token: `text n "…" right of c gap 0.7 -> leak`.
**It draws no arrowhead.** Measured – a leader emits zero `dg-head` paths, where
the identical token on an `edge` emits one:

```
text n "x" right of t gap 1 -> t     ->  ok, arrowheads drawn: 0
edge a -> t                          ->  ok, arrowheads drawn: 1
text n "x" right of t gap 1 -- t     ->  ERROR: unexpected "--" in text n
```

So `->` means *a head* on an `edge` and *no head* on a `text`, and `--`, which is
the token that actually describes what a leader draws, is refused there. This is
item 5's defect – one word, two meanings chosen by which statement it sits on –
inside the very family item 13b is making consistent. It was found while checking
whether `--` becomes the canonical headless line, and neither the finding document
nor any cluster had it.

All **29 leader sites** in the corpus are written `->` and all 29 draw no head.

### Editor perspective

`diagram-core.mjs:1734` records that the leader stub is deliberately absent from
the span table – *"it carries the span of the `text` … an aspect of the statement
rather than an element"* – so the token is reachable only as raw text. The panel
therefore cannot offer a head control on a leader today. It does **not** gain one
for free: the leader is an aspect of a `text` or `image`, not an independently
named edge, so the editor needs an explicit aspect span and control.

**Proposed revision.** The leader takes the same tokens as an edge, meaning the
same thing:

```
text n "…" right of c gap 0.7 -- leak     a leader; no head        (the common case)
text n "…" right of c gap 0.7 -> leak     a leader that points     (new capability)
```

`<-` and `<->` are refused on a leader: it has a fixed subject and a fixed
direction – the words point at the thing, never the reverse – so neither has
anything to say. That refusal is the same positional table item 13b introduces.

**Editor change.** `dgParseLine` records `spanOf(id, 'leaderArrow')` for the
`--`/`->` token and the model records `leader: { arrow, target }`; the leader does
not become a selectable element and gets no generated id. When every selected
`text`/`image` has a leader, the relation pane shows a two-way row, **plain**
(`--`) and **points** (`->`). A mixed value shows neither pressed. Clicking uses
the recorded token span and applies one transaction across all selected source
lines; it never searches for arrow-shaped text, so arrows inside labels and edge
statements are untouched. The row is hidden if any selected element has no
leader, and it is disabled away from beat 0 with the existing "changes the
opening drawing" explanation: a leader has no step target of its own. Tests cover
text, image, mixed selection, quoted `->`, round-trip in both directions, and
rollback after a failed multi-edit.

The alternative – keep `->` on a leader and give it a head – is declined. It
changes all 29 existing drawings, and a note that points with an arrowhead is the
exception rather than the rule; `figure-design.md` treats the leader as a stub
that touches its subject, not as an arrow.

**Why it is strictly better.** *Resolves an ambiguity*: `->` means one thing in
every statement that takes it. *Reduces the chance of writing a figure wrong*:
today an author who wants a pointing note writes `->`, gets no head, and has no
second thing to try – `--` is refused and no class reaches a leader. *Adds
capability* rather than removing any: the pointing leader did not exist.
*Consistent with item 13b*: one token family, one meaning per token, one scope
that may speak.

**Migration.** **29 sites**, all mechanical: `-> ` becomes `-- ` on any `text` or
`image` line that carries a leader. `lectures/network-security` holds most of them
(`lmac`, `lip`, `lprt`, `ask` and the rest), `lectures/diagrams` and
`figure-rules` the remainder. A `sed` scoped to lines beginning `text ` or
`image ` covers it; the only judgement call is whether any of the 29 would rather
be the new pointing form, which is a reading of four or five candidates, not all
29.

**Effect on `lectures/diagrams/source.md`.** The chunks carrying annotated
figures change their leader token. `#seqmore`'s two annotations hung off the
sequence's generated names are leaders and move with the rest. No chunk loses a
construct, and the lecture gains one worth demonstrating – a pointing leader
beside a plain one, which the construct reference does not currently show
because it could not.

**Effect on `docs/artifact/`.** *Figures*: regenerate from `figure-rules`
unchanged in appearance – the drawings are identical, only the source text moves,
and the listings on the page show that source. *Prose*: the page introduces the
leader in its annotation section; the sentence naming the token has to change,
and it is worth one clause saying the leader takes the edge's tokens and means
the same by them. That is the cheapest prose change in this document, and it
retires a caveat rather than adding one.

---

## 32. Print draws an arrowhead the last beat removed

**Problem statement.** CLAUDE.md states the rule: *"Print is the last beat,
without the emphasis – not the union."* For arrowheads it is still the union.

```
edge p -> q {#e}
step s
  style e {.no-head}
```

| | line | head |
|---|---|---|
| beat 0 | 259.35 long, shortened to clear the head | yes |
| beat 1 (last) | 267 long | no |
| **print** | **267 long** | **yes** |

The emitted group is a hybrid of the two, and worse than either:

```html
<g class="dg-el dg-edge no-head">
  <path class="dg-stroke" d="M27.00 0.00L267.00 0.00"/>      <!-- beat 1's line -->
  <path class="dg-head"   d="M267.00 0.00L258.00 3.96…"/>    <!-- beat 0's head -->
</g>
```

So a handout shows an arrowhead sitting on an endpoint that was not shortened to
receive it. Adding a head in a step reaches print; removing one does not. This is
the exact inverse of item 11 – there print strips something it should keep, here
it keeps something it should strip.

**Cause,** `diagram-core.mjs:5037-5040`:

```js
for (const suffix of ['--h', '--h2']) {
  if (!printGeom.has(e.id + suffix) && !frames.some(f => f.geom.has(e.id + suffix))) continue;
  ...
  const hv = g(suffix) || frames[0].geom.get(e.id + suffix) || [0, 0];
```

The guard emits the head if it is in the print state **or in any frame**, then
falls back to **frame 0's** geometry when the print state has none. The union half
is deliberate and must stay: the live runtime needs the DOM node to exist so a
later beat can bring it back – the same reason the edge's ground rect four lines
below is emitted whenever *any* frame carries it. The ground rect is rescued by a
`fill: none` CSS guard for an edge with no tone. **The head has no equivalent, so
in print – where there is no runtime to correct it – it is simply drawn.**

**Proposed revision.** Keep the node, hide it in the print state. When
`printGeom` lacks the suffix, emit the head with a resolved opacity of 0 as an
inline style, exactly the way `dgOpacity()` already writes visibility, and let the
runtime overwrite it on the first beat that has one. Two lines at the emit site,
no new concept, and it uses the mechanism the file already uses for "present in
the DOM, absent from this beat".

Rejected alternative: a CSS rule on `.dg-edge.no-head > .dg-head`. It would cover
the `no-head` class and nothing else – a head absent for any other reason stays
drawn – and it puts a second arbiter on a channel this document is reducing to
one.

**Why it is strictly better.** *Turns a silent failure into a correct drawing*:
the defect is invisible until someone prints, which is the artefact an author
checks last. *Makes the language consistent with its own stated rule*, which
CLAUDE.md already writes down and which every other drawable obeys. *No capability
lost* – the live view is already correct and does not change.

**Migration. Zero source sites.** This is a compiler fix, not a language change.
It does change the emitted print SVG of any figure whose step removes a head; no
corpus figure does, because until item 13b lands the head classes are barely
usable. Worth landing **before** 13b rather than after: 13b makes head-changing
steps the normal way to do this, and shipping that on top of a broken print pass
turns a latent bug into a common one.

**Effect on `lectures/diagrams/source.md`.** None today. Once 13b lands, `#motion`
and any figure demonstrating a head change in a beat depend on this being right.

**Effect on `docs/artifact/`.** None to the figures or the prose. It is worth one
line in the page's step section – that the printed figure is the last beat, heads
included – because the page currently states the rule and the compiler currently
breaks it.

---

# Sequencing

## What must land before the first tagged release

The tag freezes the source format, so **anything that changes what existing
source means, or what it draws, has to be in before it**. That is items **1, 5,
6, 9, 10, 11, 12, 13, 16, 22, 23, 24, 25, 30 and 31** – every row of the summary
table marked "breaks source", plus item 16, which does not break source but adds
the one mark several other items are written against, and item 25, which is free
now and breaking the moment somebody writes `space` on a table.

Items **2, 3, 4, 8, 14, 15, 17, 18, 19, 20, 21, 26, 27, 32** are diagnostics, refusal
coverage or editor fixes. None changes what a valid figure draws, so all of them
can land after a tag without a version bump. They should still land before it
where they are cheap, because several of them are what make the breaking items
survivable – item 18 in particular decides which sentence an author sees while
migrating.

Item **7** and item **29** are prose and must land **last**, after every word this
document moves has moved.

## The dependency order

Eight groups. Within a group the order does not matter; across groups it does.

**1. Foundations that everything else writes into.** Item **18** (phases on every
problem) and item **2** (one generated sentence per statement). Every later item
adds a refusal, and a refusal added before these two has to be revisited to carry
a phase and to use the generator. Item **3** closes itself here. Items **19**,
**20** and **21** are the same edit's neighbours and belong in this group;
together they let all five hand-written panel refusals be deleted.

**2. The removal mark.** Item **16**. It has to precede item 12 because the final
kind table assumes an inert class is not retained merely to cancel a default. It
also has to precede item 1, because
item 1's prominence dial is three settings plus `{!class}` rather than four
settings, and the panel's neutral swatch is built once.

**3. The vocabulary decisions.** Items **1**, **5**, **13**, **22**, **23**,
**30**. These are the renames, and they should land together or nearly so,
because they share `DG_KEYED_ATTRS`, `DG_KIND_OPTS` and `DGE_SLOTS` and a
half-migrated table is a silent mismatch between panel and compiler. Item **11**
rides with item 1 – it is the same decision – and item **17** is fixed by it.

**4. The refusal rule.** Items **10**, **12**, **4**, **26**. Item 12 subsumes
item 10 as a call site and must be written **after** group 3, because item 5(d)
removes the edge reading of four classes and item 13b refuses two more on a tail,
and the table has to be cut after those decisions rather than before. Within this
group the kind gate (12) runs **before** the slot-pair check (4a), or a shape
class on an edge is answered *"an element has one outline"*, which is false of an
edge. Item 4(c)'s clash warning is last, because it is the only beat-aware check.

**5. The editor catches up.** Items **15**, **14**, **27**, and the `dgeKindOpts`
narrowing that items 13a and 14 share. Item 15 derives `DGE_SLOTS.kinds` from
group 4's table, so it cannot precede it. Item 14's `DG_KEYED_ATTRS` line has to
carry group 3's final spellings.

**6. The units migration.** Item **6**, with items **24** and **25**. It is
deliberately last among the breaking changes, for one reason: **it rewrites 239
lines that several earlier items also touch**, and running the gap script over
source that is still being renamed means running it twice and diffing the result
by eye. Run it once, over settled source. The compiler change and all eight
editor expressions land in **one commit** – a half-converted editor writes
numbers the compiler reads on the other convention, and that failure is silent in
exactly the way the item is about.

**7. Rebuild and verify.** The four tracked views of `lectures/diagrams` and
`lectures/diagrams` itself must be rebuilt and committed – the release workflow
fails if they are stale, and item 6 alone changes every one of them. Re-run
`node lint.js lectures/`, `node test/run.mjs`, and `refresh-figures.mjs`. The
three figure specs are expected to pass throughout; `test/figure-labels.mjs` needs
about six lines changed by item 5(d), and `test/editor-sidebar.mjs` should gain
item 12's third assertion.

**7b. The items no group named.** Items **8**, **9**, **28**, **31** and **32**,
placed here because each has a fixed neighbour rather than a group of its own:

- **32 before 13b**, which is item 13's own stated constraint – the print pass
  draws an arrowhead the last beat removed, and 13b makes head-changing steps the
  ordinary way to do it.
- **9, 13b and 31 in one pass over the edge lines.** All three rewrite the same
  statements: 9 moves the name to the front, 13b changes the token, 31 changes
  the leader's. Three passes over 264 edges and 29 leaders is how the three end
  up disagreeing.
- **8** is diagnostics only and rides with group 1.
- **28** is a lecture edit and rides with group 7, where the tracked views are
  rebuilt anyway.

**8. The prose.** Item **29**, then item **7**. Item 7 lands last so its growth
rule describes the final system; it deliberately contains no vocabulary count.

## Resolved migration cases

**`#beats-demo` in `figure-rules`** (item 11). Measured, the element `r` – the
*true* ARP reply – prints today as `dg-el dg-text small paper dim`, because
`style r {.dim}` at the last beat survives into print. Under item 11, prominence
comes from the **opening** beat, where `r` carries none, so the handout would show
the true answer and the spoof at equal weight. The figure's whole argument is that
the lie wins; on paper it would stop making it.

Writing `{.dim}` on `r`'s own line fixes print and breaks the live reading – `r`
would appear already quiet at beat 2, when it *is* the correct answer.

**Decided: carry the class and lift it for the beats where it does not apply.**

```
text r "10.1.1.5 is at bb:bb" below b gap 0.6 pad 0.1 {.small .paper .dim}

step answer
  show @answer
  style r {!dim}        ← full prominence while it is the right answer
  emph b
  dim a
step redirected
  style r {.dim}        ← quiet again, once it is superseded
```

Print takes beat 0 and finds `.dim`; the live view is unchanged. **This is the
first figure in the corpus that cannot be written correctly without item 16's
`{!class}`** – everywhere else the mark is a convenience. Worth knowing when
weighing item 16, and worth saying on the page when `{!class}` is introduced,
because it is a better motivating example than any invented one.

**`#hero` in `figure-rules`** (item 6) keeps `gap 1.1` and is excluded
from the migration script. The row pulls 105.6 px tighter and
the figure goes from **7.29:1 to 5.62:1**, which is a better proportion for a
full-width figure than the very wide, flat one there now. The opening listing
stays clean, which is what matters at the start of a page that is teaching. The
option to give `#hero` a `unit=` like the other blocks is closed by its
own source comment, which says the bare fence is deliberate: *"here they would be
two pieces of syntax a reader cannot yet read, in a listing whose claim is that it
is complete."*

## One ordering constraint that is not obvious

**Item 32 lands before item 13b.** The print pass draws an arrowhead the last beat
removed. Today that is latent, because head classes are barely usable; 13b makes
head-changing steps the ordinary way to do this, so shipping 13b first converts a
dormant bug into a common one, in the artefact – the handout – that an author
checks last.

## CI must build the two lectures it only lints – decided

`pages.yml:40` and `release.yml:58` lint `lectures/` and `figure-rules`, but the
build steps under them name only `tutorial`, `diagrams`, `python-intro` and the
site example. **`lectures/network-security` is linted and never built.** CLAUDE.md
already names this as the dangerous direction – a line the build refuses and the
linter passes merges green and fails every later build – and this revision widens
the gap sharply: item 12 adds broad refusal coverage, item 13b adds a positional table,
and item 12's tag rule adds a check `lint.js` cannot make without expanding tags.

**Decided: CI builds every lecture it lints, for the duration of this work and
after it.** One line in each workflow (`node build.js
lectures/network-security/source.md`). The 36-slide lecture is the largest corpus
of real figures in the repo and the one most likely to catch a refusal that is
too strict; leaving it lint-only during a revision that adds a hundred refusals
is the one process risk in this document that is free to remove.

---

# Overrides of the finding document

Every one is a measurement, and each is stated again in place.

| # | The finding document says | Measured |
|---|---|---|
| 1 | `emph` is an option on `bars` **and `table`** | `table`, `plot` and `lanes` all refuse it. It is `bars`-only, so no `table` line migrates. |
| 6 | three warning comments about the unit are in `lectures/network-security` | They are in `docs/artifact/figure-rules/source.md` (491, 504, 521), and all three are about `w`/`h` on a chart, not about `gap`. |
| 6 | the ratio is 1.67:1 (`DG_UNIT = [120, 72]`) | 109 of 110 blocks set their own `unit=`; the median is **150x52, 2.88:1**. `DG_UNIT` is very nearly dead code, which kills "square the default cell" outright. |
| 6 | "roughly twenty" editor sites, all written `axis === 'x' ? uw : uh` | **Seven expressions in five functions**, and one of them (`editor.mjs:2534`) has **no `uw` on the line at all**, so `grep uw` misses it. That is the half-converted-editor failure the item warns about. |
| 9 | `{#id}` "is not even checked against `DG_RESERVED_IDS`" | True where it is discarded; but where it *is* honoured the check fires, on an edge and on a sequence message alike. Refusing the discarded case needs no new reserved-id logic. |
| 12 | the reported inert/refused/dead-swatch counts are incomplete | The final `DG_CLASS_KINDS` table in item 12 is authoritative. It was derived with paint-signature fixtures; no user-facing count is retained because it would become stale with the vocabulary. |
| 13 | `bars` and `plot` make `w` + `aspect` a hard error | They do not. What is refused is **all three at once**. The principle is real and the table does break it, but the rule is "not two numbers for one number". |
| 13 | dropping `.both-heads` would cost nothing – `autoClasses` loses its only caller and the arrowheads slot disappears | **A `style` step does change arrowheads** (measured on the frames payload), so deleting the classes would shrink capability. They are refused on a tail and kept in a `style` step. |
| 13 | `<-` should probably go, since the editor never writes it | All four corpus uses are **sequence messages**, and `lectures/diagrams:887` documents it as a source-legibility affordance for reading a protocol as a column. It stays. |
| 5 | `middle`/`center` is an unforced inconsistency in the placement option | It is in the `align` **statement** too, with a design comment defending it, and the parser's own **default value** for the placement option is `'center'` – a spelling the language then refuses on two of the four directions. |
| 4 | a build warning on same-slot pairs would fire on existing lines | **Zero.** `lint.js` is clean on all three sources and an independent tail scan finds no pair and no clash row. The migration is empty. |
| 4 | the two tables are one defect | They are not. A clash row is authorable on purpose – `{.tone-4 .accent}` with `style x {.clear}` at beat 1 is a working figure. A same-slot pair never becomes useful at any beat. |
| 2 | all six primitives say "unexpected X, once per leftover token" | `container` and `brace` say nothing about the token at all – they swallow it into the member list and report two bogus references. See item 19. |
| 14 | keep `aspect` on the model so the panel can show it | Unnecessary; the field renders off the span. The model value could feed only `placeholder` and `dgeProvenance`, and neither can ever show it. |
| 12 | (the file's own correction: a `dot` does carry a label) | **Confirmed.** `dot d "hello"` compiles to a circle plus a label wrapper, so the label classes in item 12's table can act. |

Two further measurements go **beyond** the finding document rather than
contradicting it: `lint.js` is **laxer than the build** on a mistyped primitive
option (`box c "C" rightof a gap 1` produces no lint finding at all, so it passes
the pre-commit gate and fails every later build – the exact trap CLAUDE.md records
for `rejectShapeOn`); and `step my name` compiles, names the step `my`, and drops
the rest.

---

# Appendix: superseded answers, and decisions not to change

Two kinds of thing, and they differ in standing. **Superseded intermediate
proposals** are discarded answers, kept for their reasoning and binding on
nothing. **Deliberate exclusions** are decisions, and they hold: each one is a
change that was considered and refused, and refusing it again is not an open
question. The heading separates them; read the subheading before treating
anything here as inert.

## Superseded intermediate proposals

**Vocabulary counts on the artifact page.** An earlier version proposed
publishing totals for statements, options, classes and step operations. Rejected:
the totals are brittle, do not measure learnability, and become incorrect as soon
as this revision moves a word. Item 7 now publishes only the growth rule.

**Keep anonymous edges and retain `{#id}` for their editor identity.** Rejected in
favour of item 9's one naming position before the from-token. A generated id is
still available internally, but the editor now records whether a name was
authored and exposes one explicit `name` field. `{#id}` is deleted rather than
remaining a second naming grammar.

**Remove `center` as an anchor and require `cx,cy`.** Rejected because
`a.center` is the readable direct form while `a.cx,a.cy` is the composable form.
Both stay; item 5 removes only the unrelated overloads.

**Preserve every pre-migration `gap` coordinate with four-decimal values or a
hybrid rounding fallback.** Rejected because it turns layout intent into magic
numbers and makes the teaching source harder to read. Item 6 uses 0.05 snapping,
explicit visual review and local redesign when necessary.

**Preserve item 11's rare print/screen combination with `step {.handout}` or a
second operation family.** Rejected after the corpus check found no use. V2
accepts that named capability loss and uses one source-visible print rule.

**Delete the arrowhead classes after adding `<->`.** Rejected because a `style`
step genuinely changes arrowheads. Item 13 keeps the slot and adds `.one-head`;
for where the head classes are and are not legal, item 13's scope table is the
statement – a tail and a `default edge` block both refuse them, and a `style`
step is the only place they may be written.

## Deliberate exclusions

**These are current.** Each is a change that was weighed and refused, and the
refusal stands with the same force as any item in the main body. They live here
rather than as numbered items because a decision not to change something has no
migration and no implementation step – not because it is provisional.

## Lengthening `->` to `-->`

Raised as a symmetric four-token family – `--`, `-->`, `<--`, `<->` – on the
argument that it states as one rule (*two dashes are the line, a bracket at
either end carries a head*) where today's family needs an exception (*one dash if
headed, two if not, except `<->`*). The compositional argument is real and is the
strongest case against item 13b's answer.

**Declined, and the maintainer has confirmed it.** The cost is 165 mechanical
rewrites across the three lectures, and `->` is the convention in DOT, Mermaid
and PlantUML – the one token every author and every language model already knows.
No error in 264 corpus sites has ever come from the tokenisation. Trading the most
familiar token in the language for internal symmetry is a bad trade in both
directions at once: it enlarges the surface an author must learn in order to make
it more regular.

Noted here so it is not re-litigated. If it is ever reopened, it has to be taken
wholesale – `->` and `<-` deleted, not added to.


**Item 3 gets no revision of its own.** `gap` vs `space` is closed entirely by
items 2 and 19 – one problem instead of two, with `space` visibly absent from a
list short enough to read. A "did you mean" was considered and rejected: the
accepted vocabulary is a fact the compiler already has, where a suggestion would
be a guess.

**The `of` asymmetry stays** (item 8). All three symmetric answers fail the bar –
*strictly better on at least one criterion and worse on none*. Requiring `of`
everywhere is not English and adds 256 tokens, so it is worse on two criteria;
forbidding it fails the same way on the other half **and does not fix the
misparse**, because `right of a` would then read `right` + reference `of` +
leftover `a`. Accepting it optionally is two spellings for one meaning, which the
ground rules forbid outright. The near-miss diagnosis is fixed instead, and it
would have been needed under every one of the four answers.

**`<-` stays** (item 13b), against the direction the finding document's editor note
points in, because all four corpus uses are sequence messages and the lecture
documents it as the affordance that lets a protocol be read as a column.

**`center`, `tl`, `tr`, `bl` and `br` stay as anchors** (item 5c). `a.center` is
the readable common case; `a.cx,a.cy` is the composable form when the two axes
must be addressed separately. The corner abbreviations keep `a.tl` visibly
distinct from `a.top` inside a dense endpoint token. This is intentional overlap
inside one geometry, not two unrelated meanings of one word.

**The four `uw` constants inside `sequence` and `lanes` keep their axis** (item
6). They are not in the surface – an author cannot write `DG_SEQ_GAP` – and a
statement laying out a row of actor columns is laying out a grid, not stating a
clearance. Restating them in `uh` would move every sequence and swimlane in the
corpus for no gain a reader could name.

**`DG_UNIT` is not squared** (item 6), on evidence: 109 of 110 blocks set their
own `unit=`, so squaring the default would change one figure and leave the defect
standing everywhere it actually lives.

**The default `gap` of `0.25` is not raised** (item 6). A gap nobody wrote is a
hair's clearance rather than a designed gutter, and every real figure writes its
own. Raising it is a separate argument and folding it in would hide a second
change inside a migration that is already the largest here.

**No overlap or minimum-clearance warning is proposed**, although item 6's
rejected variant produces three silently overlapping boxes in two named figures
that nothing in the repo detects. It is a real gap – the compiler deliberately
does not warn on coincident elements, `lint.js` computes no geometry, and
`test/figure-framing` measures the frame rather than the contents – but it is a
new capability rather than a defect in the language, and CLAUDE.md's bar applies:
build it out of what exists first. It is recorded here so the next person does not
have to rediscover it.

**Nothing in this document touches the four decisions.** No constraint solver,
layout once per step, numbers-only interpolation, and relations-not-coordinates
all survive intact. The main body's changes stay within naming, refusal coverage,
error text, class-state editing and the meaning of authored clearances; no item
introduces step-wise layout or a second coordinate system.
