# Review follow-ups for the revision implementation

**Status: open.** Reviewed 2026-08-26 against `revision-proposal.md` and
`revision-implementation.md`. This document records implementation gaps found
after Claude reported all 32 proposal items complete. It is a follow-up list,
not a replacement specification: where this file and `revision-proposal.md`
disagree, the proposal remains authoritative unless a decision below is
explicitly accepted and moved into it.

The regular project checks are green:

- `npm run lint`: 4 files, 0 errors, 0 warnings;
- `npm test`: 537 passed, 0 failed (269.1 s);
- `node docs/artifact/refresh-figures.mjs --check`: up to date; and
- `git diff --check`: clean.

Those results do not close the findings below. One browser spec currently
asserts the opposite of the proposal, and the compiler-level gates named in
`revision-implementation.md` are not present in the repository.

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

## Completion criteria

This review file can be closed when:

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
