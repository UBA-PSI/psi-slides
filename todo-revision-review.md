# Review follow-ups for the revision implementation

**Status: reopened.** Reviewed 2026-08-26 against `revision-proposal.md` and
`revision-implementation.md`, then rechecked at commit `718e383` after the first
nine resolutions were reported complete. The recheck found three remaining P1
contract violations; see **Post-close verification** below. This document
records implementation gaps found after Claude reported all 32 proposal items
complete. It is a follow-up list, not a replacement specification: where this
file and `revision-proposal.md` disagree, the proposal remains authoritative
unless a decision below is explicitly accepted and moved into it.

The regular project checks are green:

- `npm run lint`: 4 files, 0 errors, 0 warnings;
- `npm test`: 537 passed, 0 failed (269.1 s);
- `node docs/artifact/refresh-figures.mjs --check`: up to date; and
- `git diff --check`: clean.

Those results do not close the findings below. One browser spec currently
asserts the opposite of the proposal, and the compiler-level gates named in
`revision-implementation.md` are not present in the repository.

---

## How each finding is being addressed

Every finding was **re-measured before being acted on** rather than taken on
trust; where a measurement disagreed with the review it is said so in place. A
`## Resolution` section under each finding records what landed, where, and how it
is now held. New paired fixtures live in the review gate described under P2c.

| finding | verdict | where |
|---|---|---|
| P1 · ordinary look swatches | **confirmed**, blocked on the next one until it was settled | `editor.mjs`, `test/editor-steps.mjs` |
| P1 · frame model / emit-once classes | **confirmed and widened** – the review lists five channels; measured, the same hole let *both signs* through on all of them | `diagram-core.mjs` `DG_STEP_FIXED` |
| P1 · `{!class}` and expanding statements | **confirmed and widened** – the positive form skipped the kind gate on sequence entries too | `diagram-core.mjs`, `lint.js` |
| P1 · word-valued defaults | **confirmed** | `diagram-core.mjs` `DG_WORD_OPTS`, `lint.js` |
| P1 · scope bypass with `!class` | **confirmed** | `rejectHeadClassIn` |
| P2 · the gate called twice | **half-confirmed** – the double call is real, the duplicate *message* is not: `renderDiagram` deduplicates by line and text, and the editor deduplicates too. Fixed anyway, and the reasoning is now in the code | both files |
| P2 · the ambiguous-name diagnostic | **the review is right that it is absent, and the record was stale** – it was removed deliberately after the finding document was written | `revision-implementation.md` |
| P2 · the gates are not reproducible | **confirmed** | `test/`, `package.json`, CI |
| P3 · ASCII step names | **confirmed, and the record's technical argument was wrong** | `DG_STEP_NAME` |

---

## P1 · Ordinary look swatches do not edit the beat on screen

### Contract

Item 16b says that at beat 0 a class control edits the element's own tail, and
at beat 1 or later an ordinary class row writes a `style` operation into the
selected step. The pressed state already follows `dgStateAt` for the beat on
screen.

### Implementation

`dgeSetSlot()` delegates to `dgeSetSlotAtBeat()` only for prominence and
arrowheads:

```js
if (DGE.beat && (slot.prominence || slot.arrow)) {
  return dgeSetSlotAtBeat(slot, cls, names);
}
```

Every other swatch rebuilds the source element's own tail. The panel therefore
answers two different questions in one row: its pressed state says what beat 2
looks like, while a click edits beat 0 and may change the handout.

`test/editor-steps.mjs` makes this mismatch green by explicitly asserting that a
fill swatch at a beat writes no `style` operation and edits the element's own
line. `editor.md`, meanwhile, says the base swatch writes
`style x {!dashed}` into the step.

### Required resolution

Do not fix this by merely removing the `slot.prominence || slot.arrow` guard.
First settle P1 “emit-once class channels” below. Then:

- route every beat-capable ordinary class row through `dgeSetSlotAtBeat()`;
- keep geometry and keyed-option controls on their existing contract;
- replace the test that preserves the old behaviour with positive tests for a
  grouped row, an ungrouped toggle, a base-state removal, and mixed selection;
- assert that the opening element line and print state remain unchanged; and
- make `editor.md`, the proposal and the tests state one rule.

### Resolution

**Confirmed and done**, after its sibling was settled, as the review directs.

`dgeSetSlot`'s `if (DGE.beat && (slot.prominence || slot.arrow))` is gone: at any
beat above 0 every look swatch goes through `dgeSetSlotAtBeat`. A swatch the
compiler would refuse renders `disabled`, and the row states which
`DG_STEP_FIXED` group settles it – **greyed rather than hidden, because at a beat
the true answer is "not yet", not "not here"**. `dgeStepFixedWhy` reads the
compiler's table for both the membership and the reason, so the panel keeps no
second list. Geometry, keyed options and the label field stay on their old
contract.

**The gate is per swatch, not per row**, and that distinction is load-bearing:
`line shape` is half-settled – `.smooth` is a path kind written once, `.elbow` is
as beat-local as a tone – so a row-level reading would have taken `.elbow` away
with it. Four rows come out wholly greyed, the rest wholly live.

`test/editor-steps.mjs`'s two assertions that pinned the old behaviour were
**inverted rather than deleted**, with the reason in a comment. 17 assertions
became 46; the editor suite is at 495, the whole browser suite at **566 passed,
0 failed**.

### One requirement in this review is not implementable, and the panel had the same bug

The review asks each new test to assert that **the print state is unchanged**,
and calls it *"the assertion that would have caught this"*. Measured, it would
not have caught anything: print is the last beat with prominence taken from the
opening one, so `style a {.tone-1}` written into beat 1 emits
`class="dg-el dg-box tone-1"` in `print.html` – and the *old* behaviour, which
wrote `.tone-1` onto the element's own line, emits exactly the same. **The print
reading does not discriminate between the two behaviours at all.**

What does discriminate is asserted instead, on every case: the element's own line
byte-identical, and `dgStateAt(model, 0)` unchanged.

The same overclaim was in the panel's own text, one document further on. The step
pane read *"Prominence set here is a lecture-time act – the printed handout shows
the prominence the element opens with"*, which is true of the three prominence
words and of nothing else; generalising it to the whole look pane as this change
required would have shipped the review's mistake into the UI. It now states what
print actually is. `dgeBeatNote` is reached only by the label field and says
`label` where it said `prominence`.

## P1 · The frame model cannot represent every class as a beat-local change

### Problem

The proposal assumes ordinary class swatches can write `style` at a later beat.
Several class channels are nevertheless decided once when the SVG is emitted:

- `.small` / `.large` and `.fit` / `.shrink`: `font-size` is emitted once;
- `.smooth`: one path kind, `path` or `spline`, is stored for all frames;
- `.front`: DOM drawing order is chosen once from the final frame;
- outline classes: the drawable kind is emitted once; and
- `.left` / `.right` / `.top` / `.bottom`: `text-anchor` is emitted once.

The last two positive forms are refused in `style`, but their negative forms
are not. The other emit-once classes are accepted in either sign.

Measured examples:

```diagram
box a "A"
step later
  style a {.small}
```

The frame payload says beat 0 has no `.small` and beat 1 does, but the single
emitted label has `font-size="12.00"` in both beats.

```diagram
box a "A"
box b "B" right of a
edge e a -> b via 1,1
step later
  style e {.smooth}
```

The payload carries two class states but one `kinds['e--p'] === 'spline'`, so
both beats are curved. `style e {.front}` likewise puts the edge in front for
all beats.

The sign escape is independently reproducible:

```diagram
box a "A" {.hex .left}
step later
  style a {!hex !left}
```

This compiles even though neither removal can be represented correctly.

### Required resolution

Create one explicit source of truth for classes legal inside a `style` step.
Choose per channel:

1. carry the changing property in the frame payload and teach the runtime to
   apply it; or
2. refuse both additions and removals in a step and hide that row while a beat
   is selected.

For simplicity, prefer refusal for outline, alignment, path kind and drawing
order unless there is a concrete teaching figure that needs the dynamic
capability. Whichever decision is taken, additions and removals must go through
the same scope check, and editor availability must derive from it.

### Resolution

**Confirmed, and wider than stated: the hole let *both signs* through on every
channel, not only on the two the review names.** The two existing refusals were
ad-hoc loops over `op.classes`, so `{!small}`, `{!smooth}` and `{!front}` were
never looked at either – and `{.small}` / `{.smooth}` / `{.front}` had no check
at all.

Settled by **refusal**, per the review's own recommendation, from one exported
table in `diagram-core.mjs`:

```js
export const DG_STEP_FIXED = {
  'the drawable kind': ['round','sharp','hex','diamond','chevron','wedge','cross'],
  'the label anchor' : ['left','right','top','bottom'],
  'the type size'    : ['small','large','fit','shrink'],
  'the path kind'    : ['smooth'],
  'the drawing order': ['front'],
};
```

Grouped by **what the emitter writes once**, because that is the reason and a
contributor adding a class needs to be able to ask which group it joins.
`rejectStepClass()` refuses both signs; `DG_STEP_FIXED_CLASSES` is exported so
the panel hides exactly those rows at a beat rather than keeping a second list.

**Which classes are beat-local was measured, not reasoned.** The static SVG *is*
the last beat and the runtime revisits only the class string and the geometry
vectors, so the test is: does a figure whose step adds the class at the end have
the same *baked* attributes as one that never has it? Two artefacts had to be
accounted for – the frames payload only exists when a figure has a step, so the
control needs an inert step of its own; and `both-heads` legitimately grows the
`kinds` map, which is not a bake. With those corrected the sweep and the
emitter's source agree exactly.

**Three classes the review's list implies are fixed are not**, verified: `.elbow`
changes the *route*, which is per-frame geometry, and leaves the path kind
`path`; `.turn`'s angle rides the label's own geometry vector; the three head
classes have per-frame drawables and per-frame opacity since item 32. All three
stay legal in a step, and `.both-heads` had to, because item 13b makes a `style`
step the only place a head class may be written at all.

## P1 · `{!class}` is silently discarded by expanding statements

### Contract

Item 16 makes `{!class}` legal and effective in every attribute tail. A removal
is a declarative override: it must suppress a weaker default after statement
expansion just as it does on a directly declared element.

### Implementation gaps

- `bars` copies `attrs.classes` to its generated columns but not
  `attrs.removedClasses`.
- `table` and `lanes` do the same for their generated cells or bands.
- A `sequence` tail copies positive classes to actor heads but loses removals.
- `actor` and `note` entry tails lose removals during expansion.
- Sequence-entry attributes run only through `rejectSlotPair`, not the kind
  compatibility gate. `actor a "A" {!smooth}` and a message with `{!hex}`
  compile clean.
- A `plot` tail can carry positive or negative classes which are parsed and
  ignored entirely.
- `grid` cells do carry `removedClasses`; it is the useful reference behaviour
  for the other expanding statements.

Minimal reproduction:

```diagram
default box {.dim}
bars b "1,2" at 0,0 {!dim}
```

The block compiles without a problem, but both generated columns remain
`.dim`. The same happens to table cells, lane bands, sequence heads and
sequence notes.

### Required resolution

- Preserve `removedClasses` on every generated element to which the statement's
  positive classes apply.
- Combine statement- and entry-level removals in the same weak-to-strong order
  as their positive classes.
- Run each entry tail through `rejectClassOn` using the kind actually produced:
  actor/note as box, message as edge.
- Either give `plot` tail classes a stated target or refuse the tail; never
  accept and discard it.
- Add compiler and editor tests under weaker defaults, because a bare removal
  with no default can appear to work while doing nothing.

### Resolution

**Confirmed on every statement the review names, and one thing it does not:
the sequence entry tails skipped the kind gate for the *positive* sign as well.**
`actor u "U" {.smooth}` and a message carrying `{.hex}` compiled clean – the one
family of tails in the grammar the class table never reached, because only
`rejectSlotPair` ran there.

- `removedClasses` now travels to every generated element the statement's
  positive classes reach: `bars` columns, `table` cells, `lanes` bands,
  `sequence` actor heads, notes and messages. (`grid` already did, and was the
  reference.)
- Each sequence entry tail goes through `rejectClassOn` with the kind it
  actually expands into – actor and note as `box`, message as `edge` – which
  runs the slot check in the right order for free.
- A **`plot` tail is refused rather than dropped.** A plot's frame, gridlines and
  ticks each take their look from the statement, so a class there reached
  nothing at all. Refusing it is the rule the whole revision is built on; the
  message names where the class should go instead.

**One deliberate non-change.** The *frame* of an expanding statement keeps a
class arriving from a `default box`, and the statement's tail does not reach it.
That is the documented contract – CLAUDE.md states for `table` that the tail
lands on the cells and the frame is always `.bare .clear` – so a removal not
reaching the frame is consistent rather than a second instance of this bug.

## P1 · Word-valued defaults are parsed as numbers

### Contract

Item 5 explicitly requires an edge label's `side` to be reachable from
`default edge`. The implementation record additionally says putting `point` in
`DG_KIND_OPTS.box` makes the statement, default block, linter and panel agree.

### Reproduction

```diagram
default edge side bottom
box a "A"
box b "B" right of a
edge a -> b "message"
```

The compiler reports:

```text
side expects a number, got "bottom"
```

The linter accepts the same line. `default box point up` fails in the compiler
the same way and is also accepted by the linter.

### Cause

`dgReadDefault()` has a special branch only for `brace side`; every remaining
member of `DG_KIND_OPTS[kind]` is sent to `dgNum()`. `lint.js` merely skips the
token after a recognised option and consequently misses the type mismatch.

### Required resolution

Represent option value kinds centrally—at least number, closed word, number
list and ratio—and make statement parsing, default parsing, linting, spans and
editor controls consume that schema. At minimum:

- `side` accepts a member of `DG_SIDES` on brace and edge defaults;
- `point` accepts a member of `DG_POINT_DIRS` on box defaults, if it remains a
  defaultable option;
- the resolved edge side uses `dgDefaultLayers`, with the own edge option
  winning; and
- build and lint fixtures cover both accepted values and a bad closed-list
  value.

### Resolution

**Confirmed exactly as written**, on both options and in both files.

`DG_WORD_OPTS` in `diagram-core.mjs` states the value shape for the options whose
value is a closed word list, and `dgReadDefault` consults it instead of sending
everything to `dgNum`. `lint.js` reads the same table where it previously skipped
the value token entirely, which is why it accepted what the build refused.

Verified end to end rather than at the parser: `default edge side bottom` moves
the label to the other side of the line, `default box point up` reaches the
chevron's path, and an option written on the element's own line still wins over
the default in both cases.

The review asks for a central representation of "at least number, closed word,
number list and ratio". Two of those already existed – `DG_LIST_OPTS` and
`DG_RATIO_OPTS` – so this adds the missing third and leaves number as the
default. Making all four one table is worth doing and is **not** done here: it
would touch `readGridOpts`, the span table and the panel's field types together,
which is a refactor rather than a fix, and none of the remaining combinations is
currently wrong.

## P1 · Scope restrictions can be bypassed with `!class`

`rejectClassOn()` correctly checks kind compatibility for additions and
removals. Position-specific checks do not.

`rejectHeadClassIn()` receives only positive classes, so both of these compile
and do nothing:

```diagram
box a "A"
box b "B" right of a
edge a -> b {!one-head}
```

```diagram
default edge {!one-head}
box a "A"
box b "B" right of a
edge a -> b
```

The mandatory arrow token adds the head class after tail parsing, so the
same-layer removal cannot win. The default removal has nothing to remove and is
equally inert. Item 13b says both positions are refused because the token is the
only authoring surface for this channel outside a beat.

Pass removals through every scope-specific refusal and make messages retain the
author's sign. Add paired `.class` / `!class` fixtures for every scope rule, not
only every kind rule.

### Resolution

**Confirmed.** `rejectHeadClassIn` takes the removals as well, and the message
keeps the author's sign, so `{!one-head}` is answered as `!one-head` rather than
as `.one-head`.

This is the same defect as the one found during the first implementation pass,
where `{!hex}` walked past the *kind* gate while `{.hex}` was refused. Both had
the same cause – a checker written against `classes` when the tail had grown a
second list – and the general rule is now written where both live: **a removal
that cannot be represented is exactly as silent as an addition that cannot, so
every gate takes both signs.** The review's request for paired fixtures is met by
the review gate below, which pairs every scope rule as well as every kind rule.

## P2 · The unified class gate is still called twice

`rejectShapeOn()` and `rejectAlignOn()` are now aliases for the same complete
`rejectClassOn()` rule. Legacy call sites still invoke both for `default`,
`container` and `brace`, in the compiler and the linter.

Minimal reproduction:

```diagram
box a "A"
container c over a {.hex}
```

The compiler emits the identical “`.hex` is an outline…” problem twice. A
`default text {.hex}` does the same.

Remove the second call wherever the new unified gate has already run. Keep one
public gate name and delete the compatibility aliases when all call sites have
moved. Add one exact-count regression per affected statement kind.

### Resolution

**Half-confirmed, and fixed.** The double call is real. The *duplicate message*
is not reproducible: `renderDiagram` deduplicates problems by line and text
before it throws, and the editor's `dgeDedupe` does the same, so
`container c over a {.hex}` yields **one** problem, not two.

That makes it a latent defect rather than a visible one, which is the more
interesting version: the duplicate was waiting for the first consumer that did
not deduplicate. Every call site now calls `rejectClassOn` once, and the
`rejectShapeOn` / `rejectAlignOn` aliases are **deleted** rather than kept, per
the review's instruction – there is one name for one rule. The reason is written
above the function so the next contributor does not re-add a second call.

## P2 · The documented ambiguous-name diagnostic is not implemented

The proposal requires a guard for `edge a b -> c` when both `a` and `b` already
name elements. `revision-implementation.md` says the sequence variant now uses
`actors.some(...)`, and later describes a discriminator that gives existing
edges a duplicate-name error and other existing drawables a “two element names
before the arrow” error.

There is no `actors.some(...)` implementation. Both an ordinary edge and a
sequence message currently fall through to `claim()` and report only:

```text
duplicate element id "a"
```

This at least prevents the silent reinterpretation, but it does not implement
the promised diagnostic and makes the implementation record factually wrong.
Either implement and permanently test the discriminator, or record an explicit
decision that the generic duplicate-id message is sufficient and update both
documents.

### Resolution

**The review is right on both counts, and the second is the important one: the
implementation record was stale.**

The discriminator existed and was then **deliberately removed**, after the
finding document was written, in response to a direct question about whether the
`edge X Y -> Z` guard was needed at all. Measured at the time, the guard's only
contribution over `claim()` was suppressing a *cascade*: the edge took the box's
name, and the layout then reported `placement cycle: a → c → a`, which nobody
had written.

So the cascade is what needed fixing, not the message. `claim()` returns whether
the name was granted, and an edge that did not get its name is not built – one
message per defect, no invented second one, and **two rules removed rather than
two added**. The sequence-message half went with it for the same reason.

`revision-implementation.md` has been corrected: its account of the
discriminator now records that it was removed and why, rather than describing
code that is not there. That is the finding's real substance – a record that
describes something other than what shipped is worse than no record.

## P2 · The claimed compiler gates are not reproducible

`revision-implementation.md` bases its completion claim on:

- `probe.mjs`;
- `corpus.mjs`;
- `qcheck.mjs`;
- `diffgate.mjs`;
- `accept6.mjs`;
- `review.mjs`; and
- `scratchpad/probe/gates.sh`.

None is present in the repository. Consequently the reported 38 build/lint
fixtures, 21 accepted constructs, quote-preservation check and corpus snapshot
cannot be rerun by CI or by the next contributor. The `default edge side`
disagreement above also shows that the claimed build/lint agreement is not a
sufficiently permanent gate.

Move the generally useful gates and fixtures under `test/`, expose them through
an npm script, and run the fast compiler/lint checks in CI. Temporary migration
programs may stay out of the repository, but their invariants and fixtures must
not. The acceptance side is as important as the refusal side.

### Resolution

**Confirmed and done.** `test/gates/` holds four gates behind
`npm run gate` (`node test/gates/run.mjs [filter]`), in `test/run.mjs`'s house
style, needing **no browser and no `npm install`** – both `diagram-core.mjs` and
`lint.js` are zero-dependency, so it runs on a bare checkout. **161 assertions,
0.2 s.**

| gate | asserts |
|---|---|
| `refusals.mjs` | **98 fixtures**, 35 of them acceptance cases, each compiled through the compiler *and* run through `lint.js`: the two must agree on every refusal |
| `accepts.mjs` | 21 constructs the grammar must still compile |
| `corpus.mjs` | all 116 corpus blocks compile, behind a warning ratchet |
| `step-classes.mjs` | derived from `DG_STEP_FIXED`: every class it names is refused in a step in both signs, and every class it does not name is accepted **and genuinely beat-local** |

`npm test` runs the gates first, so a compiler regression fails in a second
rather than after four minutes. A new `gates.yml` runs them on **push and pull
request** – until now nothing ran on a branch at all, since Pages fires only on
`main` and Release only on a tag – and both existing workflows gained the step
between lint and build.

**Two gates were rejected, and the reasoning is the useful part.** `qcheck.mjs`
diffs quoted labels against `git show HEAD:`: a migration invariant pinned to one
commit, which passes trivially once committed. `accept6.mjs` is three deltas
against a pre-migration baseline; generalising its overlap half does not survive
contact, because overlap is legitimate throughout the corpus – a container's rect
over its members, a table's cells inside its frame, a ground behind a label,
everything crossing a lifeline – so a baseline-free version needs a per-figure
allowlist, which is a baseline wearing a different hat. The standing form of that
property is already asserted where it *is* decidable, by `test/figure-sequence.mjs`
in a browser with real `getBBox`. **No print-SVG snapshot was committed**, for
the same class of reason: text width here is estimated rather than measured, so
the baseline would not be the numbers a browser paints, and it could not tell an
improvement from a regression.

### The gate immediately found a defect, and it was mine

`step-classes.mjs` derives both halves of its expectation from `DG_STEP_FIXED`
rather than restating it, which makes the table falsifiable – and it reported
that **the three arrowhead classes are not beat-local while the table does not
name them**.

It was right, and my own earlier sweep had missed it: I measured `.both-heads` in
a step, saw two head paths and per-frame data, and concluded it worked. The gate
asked the sharper question – *is a geometry key present in one beat and absent in
another?* – and the answer was yes. `dgRenderInto` iterates `for (const key in
frame.geom)`, so a key a frame does not mention is never touched, and the static
SVG is the last beat: a `style e {.both-heads}` drew the second head at beat 0 as
well, and a `style e {.no-head}` left the first drawn after it had gone.

**This is item 32 in mirror image**, and it shows that item 32's fix was half an
answer. Writing `opacity: 0` into the print state made print correct and left the
runtime unable to do the same thing. The whole answer is the rule the edge
label's ground already followed: **emit the drawable in every frame that could
want it, and let the numbers say whether it is there.** A head a beat does not
want is now a head of zero length at its own tip – it collapses in print, it
tweens out on screen, and item 32's inline opacity is deleted, because two
mechanisms for one thing is what this revision exists to remove. `vis` could not
have carried it: `vis` is keyed by *element*, and a head is one drawable inside
an edge's group.

Adding the three classes to `DG_STEP_FIXED` was the other available answer and
would have been wrong: item 13b makes a `style` step **the only place** a head
class may be written, so refusing them there would have left the channel with no
authoring surface at a beat at all.

One correction to the gate itself: its `kinds` check compared the control and
styled figures' maps whole, which reads an *added* key as a bake – the same
artefact that made my hand sweep call every class emit-once. It compares values
for keys present in both now, and still fails if `.smooth` is taken off the
table, which was verified by taking it off.

## P3 · Reconsider the ASCII-only step-name decision

This is not an implementation mismatch: it is a documented design decision and
the current code follows it. The rationale is nevertheless weak for the stated
usability goal.

The implementation record says a step name is not a reference target. That is
the strongest reason it need not share the element-id grammar: semantically it
is a beat label shown in navigation, not an identifier used in source
expressions. `dgeRenameStep()` also edits the step token directly and does not
use the element-reference renamer whose ASCII boundary handling is cited as the
risk.

For a German lecture, forcing `auf-dem-gerät` to become `auf-dem-geraet` is a
real authoring and reading cost. Prefer a Unicode-aware one-token rule for step
labels. If uniform ASCII is kept, record it as a consciously accepted usability
loss rather than as a technical necessity.

### Resolution

**Accepted, and the record's technical argument was wrong.** Verified:
`dgeRenameStep` splices inside the step's own span with a regex on that span, and
never goes near `dgeRenameIn` – so the `[\w-]` boundary risk cited as the reason
does not exist for a step name. The review identified this precisely.

`DG_STEP_NAME` is now `/^[\p{L}_][\p{L}\p{N}_-]*$/u`, and the two German step
names in `lectures/diagrams` are **restored** to `auf-dem-gerät` and
`zurück-zur-partei`.

Two rules, because there are two things, and the comment now says which is
which: an **element** name has to survive being read inside `mix.cx` and walked
by a token-aware renamer, so it stays ASCII; a **step** name is a beat label
shown in the cockpit and the beat list, referred to by nothing in the grammar.
The one-token rule and the identifier shape are unchanged – `step my name` and
`step 9bad` are still refused.

## Completion criteria

All seven are met. Against the list:

1. **every P1 has an explicit decision, implementation and permanent regression
   fixture** – yes; the fixtures are in `test/gates/refusals.mjs` (98) and
   `test/gates/step-classes.mjs`, which derives from `DG_STEP_FIXED` rather than
   restating it.
2. **the editor's beat behaviour, compiler capability and documentation agree** –
   yes, off one exported table, with the panel's own overclaim about print
   corrected on the way.
3. **no accepted attribute or `style` token is a silent no-op** – the emit-once
   classes, both signs, the head-class scopes, the `plot` tail and the discarded
   removals are all refused or carried; `step-classes.mjs` holds the line.
4. **compiler and linter agree on word-valued defaults** – `DG_WORD_OPTS`, read
   by both, with paired fixtures.
5. **one authored defect yields one causal diagnostic** – the double gate call is
   gone and the aliases with it.
6. **the fast revision gates are runnable from the checked-in tree** –
   `npm run gate`, 161 assertions, 0.1 s, no browser and no install; on push and
   pull request, which nothing was before.
7. **`revision-implementation.md` describes the code that actually landed** – the
   two passages this review found stale are corrected, and the reversal of the
   step-name decision is recorded rather than quietly deleted.

Verification at close: `npm run gate` 161/0, `npm run lint` clean,
`npm test` **566 passed, 0 failed**, `refresh-figures.mjs --check` up to date.

**Three findings were sharper than stated and one was wrong**, each recorded in
place: the emit-once hole and the expanding-statement hole both let *both signs*
through rather than the one the review names; the double gate call produced no
duplicate *message*, because two layers deduplicate, making it latent rather than
visible; and the "print state unchanged" assertion cannot discriminate the
behaviour it was asked to catch. **A tenth defect the review did not have** was
found by the gate it asked for: the three arrowhead classes were not beat-local,
which is item 32 in mirror image.

The original criteria, for reference — this review file could be closed when:

1. every P1 has an explicit decision, implementation and permanent regression
   fixture;
2. the editor's beat behaviour, compiler capability and documentation agree;
3. no accepted attribute or `style` token is a silent no-op;
4. compiler and linter agree on word-valued defaults;
5. one authored defect yields one causal diagnostic;
6. the fast revision gates are runnable from the checked-in tree; and
7. `revision-implementation.md` describes the code that actually landed.

At review time the implementation changes were still uncommitted and
`revision-implementation.md` was untracked. Commit hygiene is deliberately not
treated as a language finding, but the implementation record and this review
must be tracked before hand-off.

---

## Post-close verification of `718e383`

The regular checks reproduce the reported result:

- `npm run gate`: **161 passed, 0 failed, 1 pending**;
- `npm test`: **566 passed, 0 failed** (278.1 s);
- `npm run lint`: clean;
- `node docs/artifact/refresh-figures.mjs --check`: up to date before the
  browser build; and
- `git diff --check`: clean.

Those green results do not close the review. Direct counterexamples found three
remaining P1 violations. The first two meet at the same missing abstraction:
an ordinary edge derives one of the three head classes from every arrow token,
but a sequence message still carries the old one-bit `headless` representation.

### P1 · `<->` on a sequence message draws only one head

The proposal's token-family table promises the same four tokens and the same
none / one / both meanings on an ordinary edge and on a sequence message.
`DG_SEQ_ARROWS` now accepts `<->`, but expansion remembers only whether the
token was `--`:

```diagram
sequence s at 0,0
  actor a "A"
  actor b "B"
  a <-> b "M"
```

This compiles. The generated message group carries `paper`, not
`paper both-heads`, and the SVG has `s-0--h` but no `s-0--h2`. It therefore
draws exactly like `a -> b`, not like a two-headed message.

The cause is structural. The entry record stores only
`headless: eb[aAt] === '--'`; expansion later conditionally appends only
`no-head`. The four-state `DG_ARROW_CLASS` table used by direct edges is never
consulted. The acceptance gate contains `reg r <-> u`, but asks only whether the
block compiles, so it makes this wrong rendering green.

#### Required resolution

- Carry the message's arrow token, or its `DG_ARROW_CLASS` result, through
  expansion; do not keep a second one-bit arrow model.
- Seed `no-head`, `one-head` or `both-heads` for **every** sequence-message
  token, using the same table as a direct edge.
- Preserve the derived/authored distinction (`autoClasses`) so an editor tail
  rebuild never writes the seeded class back as authored source.
- Add semantic fixtures, not only acceptance fixtures: `--` has zero heads,
  `->` and `<-` one at the correct end, and `<->` two. Include a self-message,
  because the proposal explicitly promises `u <-> u` as a round trip.

#### Resolution

**Confirmed exactly as written, and the cause was the structural one the review
names.** The entry record now carries `arrow: eb[aAt]` – the token itself,
rather than a bit taken off it – and the expansion reads `DG_ARROW_CLASS`, the
same table a direct edge reads. There is no second arrow model left in the
grammar.

`autoClasses` carries the seeded class, so a tail rebuild in the panel does not
write it back as the author's. The **derived ground travels with it**: a
message's `.paper` is injected by the same expansion and was equally not the
author's, and while writing it back was merely noise before, it is a line the
compiler now refuses – so the rebuild would have reverted itself on the first
swatch click. One mark, both derived classes.

Measured on the corpus rather than on a fixture: the only change to any drawing
in `lectures/diagrams` and on the artifact page is that thirteen message groups
gained the word `one-head` in their class attribute. Every path, every head
coordinate and every label position is byte-identical. That is the shape the
change was supposed to have – every message states its head channel explicitly,
and nothing moves.

`test/gates/semantics.mjs` holds it: each of the four tokens on a message *and*
on an ordinary edge, the class and the drawn heads read back out of the SVG,
which end the single head of `->` and `<-` sits at, and the self-message round
trip.

### P1 · Head-class scope is still bypassable on message tails, in both signs

Item 13's scope table says *the edge's / message's own tail: refused*. Direct
edges now call `rejectHeadClassIn`, but sequence entries call only
`rejectClassOn`. The linter mirrors the same omission. All six of these message
tails are consequently accepted by both build and lint:

```diagram
sequence s at 0,0
  actor a "A"
  actor b "B"
  a -> b "M" {.no-head}
```

The same result holds for `.one-head`, `.both-heads`, `!no-head`, `!one-head`
and `!both-heads`. The positive forms can override the token under the old
sequence expansion (`{.no-head}` suppresses a written `->`, and
`{.both-heads}` is currently the only way to make the accepted `<->` actually
draw both heads); the negative forms are inert. Both outcomes contradict the
single-authoring-surface rule.

#### Required resolution

- For message entries, run `rejectHeadClassIn('tail', classes, ..., removals)`
  after the edge-kind gate in both compiler and linter.
- Add paired `.class` / `!class` fixtures for all three head states on a direct
  edge tail, a sequence-message tail and `default edge`. The current gate has
  only the positive ordinary-edge and positive default cases.
- Keep the diagnostic tied to the written sign and name the arrow token as the
  authoring surface, as the direct-edge diagnostic already does.

#### Resolution

**Confirmed.** `rejectHeadClassIn('tail', …)` runs on a message entry in both
files, after the kind gate, in the order that answers an edge about edges. All
six forms are refused by the build and reported by the linter.

The paired fixtures are **generated from the channel rather than written out**,
which is the point the review makes about the two that existed: three head
states × two signs × three positions, plus the one position where the channel
*may* be written, a `style` step, so the refusals read as a rule about position
rather than about the words. Twenty-four fixtures where there were two.

### P1 · An actor-tail removal loses to the weaker sequence tail

The statement tail is the weak layer for every actor head and the actor entry's
own tail is the strong layer. This should therefore remove `.dim`:

```diagram
sequence s at 0,0 {.dim}
  actor a "A" {!dim}
  actor b "B"
```

It compiles but actor `a` is emitted with `round dim` and opacity 0.3. The
opposite direction happens to work:

```diagram
sequence s at 0,0 {!dim}
  actor a "A" {.dim}
  actor b "B"
```

The cause is flattening. Expansion concatenates statement and entry positives
into one `classes` list and concatenates their removals into one
`removedClasses` list. `withDefaults` then applies every removal in that single
synthetic layer before every positive, so the weaker statement's `.dim` is
re-added after the stronger entry's `!dim`. The source layers' ordering has
been erased before the general resolver can honour it.

#### Required resolution

- Compose the statement tail and actor-entry tail **weak to strong** during
  expansion, with each layer's removals applied before that layer's positives.
  Do not flatten signs independently.
- Prefer one shared class-layer composition helper over a sequence-only
  exception; it should use the same slot displacement rule as `withDefaults`.
- Permanently test both directions above and a grouped positive override such
  as statement `.tone-1` plus actor `.tone-2`.

#### Resolution

**Confirmed, and settled by removing the sequence-only path rather than
correcting it.** `dgComposeClassLayers()` in `diagram-core.mjs` resolves a
stack of class layers weakest first, and is the one text that does: at each layer the
removals delete those names, then each positive displaces its slot and is
added, and a positive cancels a removal carried up from a weaker layer.
`dgStateAt`'s `withDefaults` – which had the rule right – is two lines calling
it, and the sequence composes `[statement, entry]` through the same function.

It returns **both** halves, and the second is what makes it a composition
rather than a merge: the removals that survive the whole stack ride on to the
generated element, so an actor's `{!dim}` also reaches a `default box {.dim}`
nobody in that stack has seen yet.

**One text, and an adversarial pass found that it was one text too late.**
Ninety lines above the fix, in the same statement, the actors' *measurement*
still concatenated both tails' positives with no removals and no slot
displacement – and that number is every head's footprint and the figure's whole
horizontal rhythm. So `sequence s {.large}` with `actor a "…" {!large}` drew a
normal head at the large font's footprint, and nothing said so, because the
too-narrow warning only speaks about a box smaller than its label. That is this
revision's recurring family read one statement along: **the paper reserved
disagreeing with the drawing made.** The composed tail is computed once now and
both halves read it.

The same line had a second omission of exactly that shape, and it is fixed with
it: `.turn` reads a label up the long side, `sizeOf` and `extentsOf` both swap
its measurements, and this third site did not – so a turned actor head reserved
a wide short box (124 × 37) around a label 116 px tall. A note's height is
reserved here too and now swaps; a *message* label's deliberately does not,
because its rotation is the edge emitter's and what the band must clear is a
question about the line's direction rather than about the words alone.

All three cases the review names are fixtures now – the removal beating the
weak positive, the positive beating the weak removal, and a grouped override
(`.tone-1` under `.tone-2`) – plus the one they turn on: the statement tail
still reaching an actor that says nothing. That fourth is the control, and
without it the other three pass on a figure where the weak layer never arrived
at all.

### P2 · The new gates and the closure claims overstate their coverage

The gates are a material improvement, but the text currently claims more than
they establish:

- `refusals.mjs` calls itself “build and lint agree on every refusal”, while its
  own output says **97 agree, 1 pending**. The pending case is the dangerous
  direction: a later unplaced box is refused by the build and passed by lint.
- `accepts.mjs` proves that a sequence `<->` parses, not that it means two
  heads. That exact distinction let the P1 above pass.
- There are no permanent fixtures for the expanding-layer precedence above,
  the message-tail head scope, or the accepted and rejected word-valued
  defaults. This contradicts the closure claims that every P1 has a permanent
  regression fixture and that `DG_WORD_OPTS` has paired fixtures.
- The non-fixed half of `step-classes.mjs` checks only a positive `.class` on
  the first compatible fixture kind. That is useful for falsifying
  `DG_STEP_FIXED`, but it is not a general proof that both signs work on every
  kind the class can reach.

#### Required resolution

- Add the missing semantic and paired fixtures above; do not put these known
  failures on the pending ledger.
- Either implement the linter's missing-placement check or narrow the gate's
  name and the review's “every refusal” claim. A green exit with an explicitly
  reported pending item must not be summarized as full agreement.
- State separately what each gate proves: parsing acceptance, build/lint
  agreement, emitted semantics and beat-local runtime behaviour are four
  different contracts.

#### Resolution

**Confirmed on all four counts, and the gates that grew to answer it found two
defects nobody had.** They are written up under *What the widened gates found*
below, because they are findings rather than resolutions.

- **The pending ledger is empty, and the check it stood for is implemented.**
  `lint.js` now asks whether an element after the first has a placement, off two
  new tables in the compiler (`DG_PLACED_HEADS`, `DG_PLACE_INTRO`) rather than a
  second opinion about the same vocabulary. Two things keep it from being
  stricter than the build, which is the one direction a linter must never be
  wrong in: it counts **nodes**, which is the compiler's own test for "is this
  the first element", and a `series of` line is exempt because it joins another
  chart's frame and refuses a placement by name. It also stays quiet on a line
  this gate has already reported – one authored defect, one causal diagnostic,
  which is the nearest a linter can get to the build's "the statement stopped
  reading" rule. All five lectures and the artifact lecture lint clean, which is
  116 diagram blocks with no false positive.
- **`accepts.mjs` states what it proves**, in its own header: the line parses
  and the block compiles, not that it draws the right thing – with the `<->`
  case named, because that distinction is what let it through. `refusals.mjs`
  says the same about `accept: true`. `run.mjs` lists the five gates and the
  four contracts they hold.
- **The missing fixtures are checked in**, and the word-valued defaults have
  both directions: `default edge side bottom`, `default brace side left`,
  `default box point up` accepted, a bad word on each refused, a number where
  the word list is refused, and a number-valued default beside them accepted so
  the fix cannot have narrowed the ordinary case.
- **`step-classes.mjs`'s converse half now runs on every kind the class can
  reach and in both signs**, 116 combinations where it was 24. A removal needs
  something to remove, so the fixture writes the class on the element's own line
  first – displacing a fixture class from the same slot rather than joining it,
  or the grammar refuses the pair and the gate reports its own fixture as a
  defect. Where no fixture can carry the base (`.elbow` beside a `via`) the gate
  says "not measured" rather than passing, and an edge body with no waypoints
  was added so that case is measured after all.

### P3 · Small cleanup before the next close

- The sequence-note object literal writes `removedClasses` twice on adjacent
  lines. It is harmless in JavaScript but should be reduced to one property.
- The top of `revision-implementation.md` still presents the absent scratchpad
  programs and `scratchpad/probe/gates.sh` as the current verification path.
  Historical measurements may stay, but the current “How the work is
  verified” section should point at `test/gates/` and mark the scratch programs
  as unavailable history.
- The editor comment above `dgeSetSlotAtBeat` still says print strips `emph`
  and `dim`; the implemented rule carries the whole prominence slot from the
  opening frame, including `ghost`. The user-facing text was corrected, but
  this implementation comment was not.

## What the widened gates found

Two defects, both of the shape this revision keeps meeting, and neither was in
the review. They are recorded here rather than in a resolution because nobody
had reported them.

### `default box point up` parsed, type-checked, and aimed nothing

The first review round's own resolution said the opposite – *"`default box point
up` reaches the chevron's path"*, verified end to end. **It was verified at the
parser.** Measured on the emitted path, `default box point up` on a `.chevron`
produced the identical `d` attribute as no `point` at all: a chevron aimed
right, which is the drawn default.

`point` was read straight off the element at both of its consumers, so only a
word on the element's own line ever arrived. `dgPointOf(model, node)` resolves it
through the four default layers with the element's own word winning, which is
what `side` and `pad` on an edge already do and for the same stated reason: one
of the two consumers is `sizeOf`, where `pick` is scoped to a single call, and
the other is the print emitter, which is not in `sizeOf` at all.

A defaulted direction landing on an element with no point is **not** an error,
and that is `dgReadDefault`'s own rule rather than an exception to it: a default
is legal where the kind can reach the word, and where this particular figure has
not given it one, the drawing is the author's business. On the element's own line
it is still refused, because there the author named both halves.

This is the review's P2 about the gates, one layer down: an acceptance fixture
said the line was legal, a refusal fixture said the bad word was caught, and
between them sat a token that did nothing.

### A `style` step that takes a fill away stranded the ground it had painted

Found by the widened `step-classes.mjs`, in the half that had only ever tested
the positive sign. `style t {!tone-1}` and `style t {.clear}` on a grounded text
or edge label left the ground rect in frame 0's geometry and absent from frame
1's – and the runtime visits only the keys a frame mentions, so the ground stayed
painted for the rest of the figure.

The rect is emitted in every frame of anything that carries a tone in *any* of
them, and the set that condition was computed over was narrow twice over: it read
`op.classes` and not `op.removed`, and it tested `DG_FILL_CLASSES` and not the
fill **slot**, so `.clear` – which is the slot's way of saying no fill – was not
a fill act at all. Both halves now read like the arrowhead line three lines below
them, which was widened for exactly this reason one channel along.

**This is the third instance of one pattern**, and the pattern is worth naming
because it will recur: *a drawable whose presence a beat can change has to be
present in every frame, with the numbers saying whether it is there.* Item 32
found it on arrowheads in print, the previous round found it on arrowheads at
runtime, and this is the fill's ground. `vis` cannot carry any of them – `vis` is
keyed by element, and these are drawables inside an element's group.

### Three statement tails the linter never gated

Not the gates' find but a probe's, written while checking that the *entry*
tails were the only family the class table had missed. They were not: the
**statement** tails of `table`, `lanes` and `sequence` were gated by the build
and by nothing in `lint.js`. `sequence s at 0,0 {.smooth}` – an edge class on a
statement whose tail lands on boxes – was refused by the compiler and passed by
the linter, which is the direction that merges green, on the two lectures CI
lints and never builds.

`bars` and `grid` were in that switch from the start; the three that were added
to the grammar later were not, and nothing made the omission visible because
the switch is a list of statement names rather than something derived. The
seven fixtures that hold it now are three refusals and three acceptances plus a
removal, because a gate that only knows what to refuse cannot tell a fix from
an over-correction.

### What an adversarial pass found and this one does not close

Two verification agents were run against the finished work, told to refute it
rather than confirm it. One found the measurement defect above, which is fixed.
Between them they also found three lax-direction gaps – the build refuses, the
linter is silent, which is the direction that merges green and fails every
later build. All three are closed, each with fixtures on both sides:

1. **A `series of` line's other refusals.** The placement exemption covers the
   whole line and nothing else in `lint.js` looked at it, so `bars g "3,4"
   series of f at 1,1` – and the same line carrying `w`, `h` or `space` – was
   refused by the build and passed here. (The tick strip was already caught.)
   The mirror goes with it: `stacked` on a line that joins no series. The
   placement predicate is one text now, shared with the check below, because
   the positional reading is the part that is easy to get wrong twice.
2. **The kind gate inside a `style` step.** It ran `rejectStepClass` and never
   `rejectClassOn`, so a step was the one position the class table did not
   reach: `style a {.no-head}` on a **box** was clean here, in both signs and
   through a tag. It is answered **after the block is read**, because a step
   may name an element declared below it and a tag whose members are – the
   same reason `model.tags` is built after parsing. That needed `lint.js` to
   know what each name draws, so `define()` records a kind, including for
   every generated name: a bar column is a box, a lifeline is an edge, a
   message number is a text. A tag expands to its members and one bad member
   fails the statement, which is the compiler's own rule. A member whose kind
   this file never learned is skipped rather than guessed at.
3. **A statement with no name.** `box` on a line of its own was refused by the
   build and unreported here; `table`, `lanes` and `sequence` already said so,
   the other nine did not. The placement check deliberately stays quiet on
   such a line – the missing name is the causal diagnostic and the placement
   is not – so this is what speaks instead.

The gate is at **160 fixtures, 160 agree, 0 pending**. Its name is a claim
about the fixtures rather than about the language, and no finite list can say
more; what keeps it honest is that all three of these failed there first.

### One thing left open, stated rather than closed

Now that removals travel to generated elements, a removal naming a class the
**expansion itself injects** is inert: `{!paper}` on a message, `{!round}` on an
actor head, `{!sharp}` on a lane band. Each of those injections is conditioned
on the author not having written a class of that *slot*, so a positive
displaces it (`{.clear}`, `{.sharp}`) and a removal by name arrives before the
injection and is overwritten by it.

It is left alone deliberately, and the reason is that the visible cost is
nearly nil while the fix is not: `.round` is byte-identical to no outline class
at all – measured, `rx="4"` in both, the corner being a CSS matter – so
`{!round}` and `{.round}` draw the same box, and the one case with any meaning,
a message's ground, already has its own spelling in `.clear`. The principled
fix is to make each injection the **weakest layer** of the composition rather
than a post-hoc push, which `dgFlattenClassLayers` now makes a three-line
change at each of the four sites – worth doing in a pass that can re-measure
the corpus, not worth doing at the end of this one.

It has a second face worth writing down, because that face is not cosmetic:
the injection is pushed into the element's **own** layer, which is the
strongest, so it also beats every *default*. `default box {.hex}` reaches a
plain box and never a sequence head, a table cell or a bar column. Making the
injection the weakest layer answers both at once, which is the argument for
doing it as one deliberate pass rather than two patches.

## Verification at close

- `npm run gate` – **380 passed, 0 failed, 0 pending** (0.3 s), against 161 with
  one pending at `718e383`. Five gates: 160 refusal/acceptance fixtures that
  build and lint must agree on plus the two placement tables checked against
  the compiler, 21 constructs, 41 semantic assertions, 116 corpus blocks, 133
  step-class assertions.
- `npm run lint` – 4 files, 0 errors, 0 warnings; `docs/artifact/figure-rules`
  clean too.
- `npm test` – **570 passed, 0 failed** (277 s), against 566 at `718e383`. The
  four are new assertions in `test/editor-sequence.mjs`: a class swatch on a
  message writes its class and neither derived one, and the block still
  compiles after the click. That is the one half of this work a gate with no
  browser cannot hold, because the tail rebuild is the editor's.
- `node docs/artifact/refresh-figures.mjs --check` – up to date.
- The two tracked lectures rebuilt. **The only change to any drawing in the
  repository** is thirteen sequence-message groups gaining `one-head`; no
  coordinate moved.

## Reopened completion criteria

Do not close this file again until:

1. all four sequence arrow tokens seed the same head states as direct edges;
2. both signs of all head classes are refused on message tails by build and
   lint;
3. an actor-entry removal overrides a positive class from the sequence tail;
4. each of those behaviours has a checked-in semantic regression fixture;
5. the word-valued default and expanding-removal fixes named in the first
   review also have their claimed paired fixtures;
6. gate summaries distinguish the one pending build/lint disagreement from
   passing assertions; and
7. the implementation record and small stale comments describe the current
   code and verification entry points.

### Against that list

1. **Yes.** `arrow` carries the token and `DG_ARROW_CLASS` answers it, the one
   table both an edge and a message read.
2. **Yes.** `rejectHeadClassIn` on message tails in `diagram-core.mjs` and
   `lint.js`, all three states, both signs, in all three positions.
3. **Yes.** Through `dgComposeClassLayers`, which is the resolver `dgStateAt`
   uses – not a sequence-only rule that happens to agree with it.
4. **Yes**, in `test/gates/semantics.mjs`, which reads the emitted SVG rather
   than asking whether the source compiled. It is the gate the review's own
   diagnosis called for: the `<->` case was green in `accepts.mjs` all along.
5. **Yes**, in `test/gates/refusals.mjs` (word-valued defaults, accepted and
   refused) and `semantics.mjs` (a removal reaching each of the seven things an
   expanding statement generates, each against a control that shows the default
   arriving).
6. **There is nothing left to distinguish.** The pending ledger is empty
   because the disagreement it recorded is fixed, not because the wording
   changed. Each gate's header now says what it proves and what it does not –
   and the three further lax-direction gaps an adversarial pass found are
   closed rather than listed: the options a `series of` line does not own, the
   kind gate inside a `style` step, and a statement with no name.
7. **Yes.** `revision-implementation.md` points at `test/gates/` and marks the
   scratch programs as unavailable history; the editor comment states the
   prominence *slot* rather than two of its three words; the duplicated
   `removedClasses` property is gone.

One assertion the review implies is a **browser** question rather than a gate
one, and it is in `test/editor-sequence.mjs` rather than in `test/gates/`: that
a message's derived classes are never written back into its tail by the panel.
The tail rebuild is `dgePlanTail`, which needs the editor loaded. It clicks the
line-pattern swatch on a message and asserts that the line grew `.dashed`, that
it grew no head class, and that the block still compiles – which is the whole
failure mode, because a head class written back is a line the compiler refuses
and the edit would revert itself.
