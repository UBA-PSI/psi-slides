# Review of the figure language and its documentation

**Status: the follow-up findings are addressed; three items stay open by
decision, and they are listed at the foot of this file under *Second
implementation round*.** Initially reviewed 2026-08-26 against
the then-current working tree, with a follow-up review of the implementation
added on 2026-08-27 below. The initial findings are kept as the evidence and
decision record rather than rewritten after the fact. Particular attention was
given to `docs/artifact/figures-you-write.html`,
`lectures/diagrams/source.md`, `figure-design.md`, and the contract implemented
by `diagram-core.mjs`.

This is a learnability and author-facing language review. It does not propose a
new implementation plan, and it does not replace the compiler-gate review in
`todo-revision-review.md`. The gate work was changing in parallel while this
review was written; no file involved in that work was edited here.

The central finding is not that the language has too many words. Its core is
small and coherent:

- elements have stable names;
- positions are relations rather than exported coordinates;
- edges keep their endpoints when elements move;
- one cast of elements is evaluated for every beat; and
- expanding statements produce ordinary elements that the rest of the
  language can address.

The difficulty begins where that model is supplemented by implicit state,
multiple measurement spaces, generated interfaces, and emitter limitations.
The documentation explains most individual decisions at length, but it does
not first give the reader a compact model from which those decisions can be
predicted. In several places it also describes a simpler grammar than the
compiler actually implements.

---

## Summary and priority

| priority | finding | kind |
|---|---|---|
| P0 | The documentation makes several false claims about source order and the boundary before steps | documentation correctness |
| P0 | The live/print/step state model is too implicit to predict | language + documentation |
| P0 | The public class reference omits which classes a step cannot change | documentation correctness |
| P0 | `sequence` annotations have an undocumented, order-dependent parse trap | language |
| P1 | One `unit` exposes two coordinate rulers and a third clearance convention | language + documentation |
| P1 | Spatial words have too many context-dependent readings | language + documentation |
| P1 | Generated names and tags leak expansion internals into ordinary authoring | language + reference |
| P1 | Defaults, tags, and removals form a second style system without one explanatory model | documentation |
| P1 | `align` and `spread` expose dependency-graph mechanics through surprising asymmetry | language + documentation |
| P2 | The standalone page combines five different documents into one learning path | information architecture |
| P2 | The figures lecture is a strong showcase but a poor first tutorial | information architecture |
| P2 | The hand-maintained vocabulary prose has already drifted from the exported grammar | maintenance |
| P1 | `emph` as a verb accepts a free text on which the equivalent class is correctly refused | possible compiler contract hole |

---

## What already works well

The review should preserve the parts that already teach effectively.

1. **The opening figure is the right argument.** Alice, Eve, Bob and two edges
   demonstrate relational placement without requiring a grammar wall first.
   Renaming Eve then shows why a relation is worth keeping.

2. **Wrong/right pairs are unusually effective.** They connect a visual rule
   to compilable source and make clear that the compiler can draw a bad figure
   just as faithfully as a good one.

3. **The reasons for expanding statements are concrete.** The explanations of
   `table`, `lanes`, and especially `sequence` identify maintenance operations
   that hand-built elements cannot survive. This is a better admission bar
   than “the construct saves typing”.

4. **Several distinctions have good author-facing meanings.** In particular:

   - `gap` is external placement clearance and `space` belongs inside an
     expanding statement;
   - a `container` fits its members while `lanes` promises equal bands; and
   - `sequence` owns vertical rhythm, not arbitrary protocol notation.

5. **Refusing inert or contradictory syntax is the right principle.** The
   compiler increasingly names a word that cannot act instead of accepting a
   silent no-op. The public documentation should promote this as one of the
   language's central principles, and every remaining exception should be
   treated as a contract defect rather than as a quirk to memorise.

---

## P0 - Source-order claims disagree with the compiler

### What the page says

The standalone page repeatedly describes a diagram as a source-ordered chain:

> Every element but the first is placed against something already on the
> drawing, so a figure is a chain, and one pass down the chain settles it.

Later it says:

> Because each position points at an earlier one, the build can work the whole
> figure out in a single pass, following the chain.

The tree explanation in `lectures/diagrams/source.md` then says root-first
would not work.

### What the compiler does

The compiler's own stated model is a DAG resolved by a topological walk, not a
source-ordered chain. Generic placements and `same as` can refer forward. The
following compiled successfully during this review:

```diagram
box a "A" right of b
box b "B" at 0,0
```

A root-first tree also compiled when each parent referred to children declared
later. The real failure is a cycle, not a forward reference:

```diagram
box a "A" right of b
box b "B" right of a
```

This correctly fails with `placement cycle: a -> b -> a`.

### Why this matters to a learner

“A chain read from top to bottom” and “a dependency graph resolved in
topological order” produce different predictions. The current prose teaches
authors to reorder source unnecessarily, then later shows constructs such as
plot coordinates that explicitly allow a later declaration.

The same prose also suggests that only the first element may use `at`. What is
special about the first placed node is that it may omit placement and inherit
the origin. Later nodes may still use `at`, and real lecture figures do so
whenever they need more than one independent anchor.

### Required resolution

- Replace “chain” with “dependency graph” or a plain-language equivalent:
  “each placement names what it depends on; the build follows those
  dependencies in whichever order resolves them.”
- State that forward references are legal for ordinary elements.
- State separately that a few expanding constructs, notably chart `same as`,
  are source-ordered because expansion happens while their line is read.
- Keep leaf-first as a design/source-readability recommendation, but do not
  claim root-first is grammatically impossible.
- Say “the first placed element may omit placement”, not “the first element”,
  because `default`, edges, and other non-node statements do not consume that
  privilege.

---

## P0 - A blank line is presented as grammar when it is only convention

The stepped hero says:

> The block has two halves, and the blank line between them is the whole of the
> boundary.

The parser does not use that blank line as a boundary. A `step` immediately
after an element compiles, and another element after a step also compiles. The
actual boundary is the `step` keyword and its indented operations.

The “cast first, steps second” convention is good source style and should
remain the recommended shape. It must be labelled as a convention rather than
as the grammar. Otherwise a reader cannot tell which apparently meaningful
whitespace the parser actually observes - especially because blank lines have
different behaviour in `table` and `sequence` continuation runs.

### Required resolution

- Replace the claim with: “Write the cast first and the steps below it; the
  blank line is a reading aid. `step` is the grammatical boundary.”
- Add a small whitespace table to the reference:

  | context | blank line means |
  |---|---|
  | ordinary diagram body | nothing |
  | before `step` | recommended visual separation only |
  | `table` rows | ends the row run |
  | `sequence` entries | does not end the entry run |

---

## P0 - The state model needs one table, not repeated prose

The language has a defensible distinction between a durable drawing and an act
performed during a lecture. It is not currently simple enough to reconstruct
from the prose.

An author has to combine all of these rules:

1. An element starts hidden exactly when the first visibility operation that
   ever mentions it is `show`.
2. If its first visibility operation is `hide`, it starts visible.
3. If no visibility operation mentions it, it remains visible.
4. An edge is visible only with its endpoints unless explicitly overridden.
5. A container follows the visibility of its visible members unless explicitly
   overridden.
6. A leader follows its target unless explicitly overridden.
7. Steps are cumulative for the live view.
8. Print takes geometry, visibility, labels, and ordinary style from the last
   beat.
9. Print takes prominence from the opening beat instead.
10. Some classes may be changed by `style`; others are fixed for the whole
    figure.

Each rule has a reason. Together they form a state machine, and prose in four
different sections is the wrong representation for it.

### Required resolution

Add a table near the first stepped example and repeat it, compactly, in the
reference:

| operation or property | opening | live beats | print |
|---|---|---|---|
| `show` / `hide` | first visibility mention decides implicit opening state | cumulative | last beat |
| inherited edge/container/leader visibility | derived from related elements unless named explicitly | re-evaluated | last beat |
| `move` / `label` | authored value | cumulative | last beat |
| `style {.tone-2}` and other beat-local look | authored class | cumulative | last beat |
| `emph` / `dim` / `ghost` in a step | authored prominence | cumulative on screen | opening prominence |
| shape, font size, label anchor, `.smooth`, `.front` | fixed | cannot be changed by a step | fixed |

The table should explicitly answer two common questions:

- “Why did adding a `show` further down make this element disappear at the
  beginning?”
- “Why does this tone reach print while this `emph` does not?”

The answer to the first is that `show` doubles as the declaration of initial
hiddenness, avoiding a second initial-state list. The answer to the second is
that a tone describes the finished drawing while prominence borrowed by a beat
describes the lecturer's current attention.

---

## P0 - The class reference omits step legality

`figures-you-write.html` has a useful table that says which element kinds each
class may act on. It does not say which classes may occur inside a `style`
operation.

The compiler exports 41 classes. Seventeen are fixed for the whole figure and
are refused in either sign inside `style`:

```text
round sharp hex diamond chevron wedge cross
left right top bottom
small large fit shrink
smooth front
```

Their effects are baked into the emitted SVG: drawable kind, label anchor,
font size, path kind, or document order. This is a real authoring boundary, not
an implementation note, because the same class is legal on the element line
and illegal in a beat.

### Why the current explanation is insufficient

The page introduces `style` as one of five general step families and later
says the prominence verbs are the prominence classes, so learning one teaches
the other. A reader reasonably infers that any legal class can be applied by
`style`. The compiler then rejects nearly half the class vocabulary in that
position.

### Required resolution

- Add a “step?” column to the generated class reference.
- Give the positive rule before the exclusion list:
  “A beat may change paint, stroke, prominence, rotation, elbow routing and
  arrowheads. It may not change the kind of drawable, its font metrics, its
  label anchor, spline/path kind, or drawing order.”
- Include the compiler's reason in one sentence: there is one SVG drawable and
  one set of baked text/path attributes shared by every beat.
- Generate this column from `DG_STEP_FIXED` rather than transcribing it.

---

## P0 - `sequence` has an order-dependent annotation trap

The documentation's strongest extensibility claim for `sequence` is that every
generated part keeps a name, so annotations that the statement does not know
about can be ordinary `text`, `brace`, `container`, or edge lines.

That claim currently depends on which annotation comes first. This fails:

```diagram
sequence x at 0,0
  actor a "A"
  actor b "B"
  a -> b "hello"
text n "why" right of x-0 gap 1 -- x-0
```

The `text` line contains an arrow token, so the sequence lookahead consumes it
as another message and reports errors about actors named `1` and `x-0`. Put a
`brace` before the `text` and both compile, because the brace ends the entry
run.

### Why this is more than a documentation omission

The line is valid ordinary diagram syntax everywhere else, and its meaning
changes solely because of the preceding statement and the order of two
annotations. There is no author-facing reason for that dependency. Documenting
the trap would make the manual accurate but would not make the language
predictable.

### Required resolution

Prefer a language fix before release. Plausible directions include:

- make indentation part of the sequence-entry grammar and stop at the first
  unindented line;
- require an explicit end marker for the subgrammar; or
- recognise ordinary top-level statement keywords before treating an
  arrow-bearing line as a message.

After the grammar is settled, add one compact rule describing exactly where a
sequence entry run ends. Do not make “put a brace first” the public workaround.

---

## P1 - `unit` is three measurement conventions under one name

The page explains the behaviour accurately, but only after the reader has
already formed the usual expectation that a unit is one ruler.

For `unit=170x56`:

- x coordinates, `w`, and x offsets count 170-pixel units;
- y coordinates, `h`, and y offsets count 56-pixel units; and
- clearances such as `gap`, `pad`, `space`, a bare dot radius, and grid `cell`
  use the 56-pixel ruler in both directions so that whitespace and cells are
  physically square.

This is why `w 1.9 h 1.5` produces 323 by 84 pixels, not a nearly square
object. `aspect` was added so charts can state the proportion a reader sees
rather than the number of grid cells they occupy.

### Why users ask “why?” here

The word `unit` suggests one coordinate space, while the language exposes:

1. a box-shaped layout grid;
2. a square physical-clearance unit; and
3. for plots, a data-coordinate space such as `roc@0.35`.

The current text calls the first two “two rulers” but continues to say “every
number is in units”. That is locally true and globally misleading.

### Required documentation resolution

- Name the spaces before giving syntax. For example:
  - **layout cells**: x and y may have different physical size;
  - **clearance**: always physical and square; and
  - **plot values**: mapped through a plot's own axes.
- Show one labelled picture of a `1 x 1` box and a `gap 1` square at
  `unit=170x56`.
- Say explicitly that `unit` is optional and give the default.
- Introduce `aspect` with the unit model, not much later under advanced charts.

### Possible language resolution before format freeze

Consider whether the two layout rulers should be named separately or whether
`unit` should become a square author-facing measure with box proportions
handled elsewhere. If the current model remains, a name such as `grid=170x56`
would at least stop promising a single scalar unit.

---

## P1 - Spatial vocabulary is consistent to the parser, not to a learner

The consolidation rightly removed several duplicate spellings, but the same
direction word still participates in many different mini-grammars:

| form | question it answers |
|---|---|
| `a.left` | which anchor or coordinate of `a`? |
| `left of a` | where is the new element placed? |
| `flush left` | which free edge of a relative placement is aligned? |
| `{.left}` | where does a label sit inside its own box? |
| `side left` | on which side of an edge or brace does its label/bracket sit? |
| `point left` | which way does a chevron or wedge face? |

There is also a naming split around the centre:

- a point/anchor can be `center` and scalar coordinates are `cx` / `cy`;
- `align` and `flush` use `middle`; and
- the lecture prose currently guesses `align x center`, which is invalid.

### Required resolution

- Add one “the spatial words” reference organised by question, not by
  statement kind.
- Correct both prose occurrences of `align x center` to `align x middle`.
- Consider accepting one canonical centre word everywhere before release, or
  at least one documented alias if changing existing syntax is undesirable.
- In diagnostics, continue naming the question the word answers. That is more
  useful than merely listing the accepted tokens.

---

## P1 - Generated identifiers are a public interface without a gentle layer

Expanding statements are valuable because their generated pieces remain
ordinary elements. The cost is that their generated identifier scheme becomes
part of the authoring language.

Examples a reader must currently learn:

- a bar is `f-0`;
- a grid cell is `g-<column>-<row>`;
- a table cell is `t-<column>-<row>`, with heading row 0;
- table row and column tags are `@t-row-N` and `@t-col-N`;
- sequence message 4 is generated as `wa-3`;
- its visible number is `wa-n-3` and second line `wa-sub-3`;
- one message plus its generated pieces is `@wa-msg-3`;
- all messages touching actor `au` are `@au-msgs`.

Three separate surprises accumulate:

1. indices are zero-based;
2. table coordinates are column-first, unlike the usual spoken “row, column”;
   and
3. sequence's visible number is one greater than the identifier used in the
   source.

The documentation does explain these conventions, but only after complex
examples. A reader encounters what looks like private compiler naming before
being told it is a promised interface.

### Required resolution

- Put the generated-name table immediately beside each expanding statement's
  first example.
- Strongly recommend explicit names for generated elements that will be
  annotated, especially sequence messages. Generated positional names should
  be described as convenient selectors for transient work, not as stable
  semantic names.
- Add a one-page generated-selector reference.
- Consider making visible and source numbering agree before release. If that
  is rejected, say “visible 4 = source index 3” in the first sequence example,
  not only in the advanced reference.

---

## P1 - `@`, defaults, and removals need one model

`@tag` currently has three related but distinct roles:

- membership in an element tail: `{.tone-2 @client}`;
- selection in an operation or membership list: `show @client` or
  `container z "" over @client`; and
- scope on a default: `default box @client {.tone-2}`.

The first two form a clear set model. The third is a selector/default model
layered on top. The effective style may then come from lecture kind defaults,
lecture tag defaults, block kind defaults, block tag defaults, and the
element's own tail.

`!class` adds another rule: it removes that exact inherited class, not the
whole conceptual slot. Returning from `.dim` to normal is `{!dim}` because
normal is absence, while replacing `.tone-1` with `.tone-2` is a positive
class because the fill slot displaces its sibling automatically.

### Documentation gap

The standalone page says a default at the top of a block applies to every
element of its kind and that an element tail overrides it. It does not present
tag-scoped defaults or the full precedence model, even though the figures
lecture uses `default box @dec`, `@enc`, `@stream`, `@msg`, `@cipher`, and
`@prom` before giving a consolidated explanation.

### Required resolution

Add one worked cascade, weakest to strongest:

```diagram
diagram-defaults: default box {.tone-1}

default box @server {.tone-2}
box a "A" {@server}
box b "B" right of a {@server .tone-3}
box c "C" right of b {@server !dim}
```

The example should answer:

- what is membership;
- what is selection;
- which default wins;
- when a positive class displaces a sibling in the same slot; and
- when an exact `!class` is necessary.

The reference should be generated from the same default-layer and class-slot
tables the compiler uses.

---

## P1 - `align` and `spread` expose dependency mechanics

### `align`

`align y middle a, b, c` sounds like a symmetric operation over a set. It is
not: `a` is the master and its coordinate is copied to `b` and `c`. That is a
useful operation, but its asymmetry is carried only by source order.

This is why the root-first tree example with
`align x middle root, left, right` stacks the children under the root instead
of centring the root over the children. The failure is not that a root-first
tree cannot be expressed; it is that `align` means “make the rest follow the
first”.

### `spread`

`spread x a, b, c, d` fixes `a` and `d` and repositions the interior members.
The natural chain:

```diagram
box a "A"
box b "B" right of a
box c "C" right of b
box d "D" right of c
spread x a,b,c,d
```

creates a dependency cycle because `c` depends on `d` through `spread` and `d`
depends on `c` through placement. The author must independently anchor the far
end. That is mechanically correct, but the required source shape is not
suggested by the word `spread`.

### Required resolution

- Lead both sections with the asymmetry: “first is the master” for `align`;
  “first and last are fixed” for `spread`.
- Draw the dependency arrows in the cycle example rather than explaining them
  only in prose.
- Consider syntax that names the roles rather than encoding them by list
  position, especially before format freeze. Even a diagnostic that says
  “`d` is the fixed far endpoint of this spread; it cannot also depend on
  interior member `c`” would substantially improve the model.

---

## P2 - The standalone page is five documents in one

`figures-you-write.html` currently serves as:

1. a manifesto and comparison with drawing/auto-layout tools;
2. a beginner tutorial;
3. a grammar and class reference;
4. a figure-design textbook with fifteen rules;
5. a cookbook and gallery of finished figures.

Each part is worthwhile. Their current order interrupts grammar acquisition:
the reader gets the six-stage basic example, then a dense attribute/class wall,
then fifteen design rules, then the full step model, then limitations, advanced
constructs, common arrangements, and finally a large gallery.

The sentence “That is the everyday vocabulary” arrives before the reader has a
usable account of defaults, generated selectors, step-fixed classes, print
state, or the expanding subgrammars.

### Required resolution

Split the learning path conceptually even if it remains one physical page:

1. **First figure in ten minutes** - box, relational placement, edge, text,
   one tag, one step.
2. **The mental model** - identity, space, appearance, time, print.
3. **Generated reference** - statements, options, classes by kind, classes by
   step legality, generated names.
4. **Design guide** - the fifteen wrong/right rules.
5. **Cookbook and gallery** - charts, flowchart, tree, lanes, table, sequence,
   and the real lecture figures.

At minimum add a persistent table of contents with “learn”, “look up”, and
“copy a pattern” routes. A reader looking up the syntax for `flush` should not
have to navigate an essay about Gestalt principles, and a beginner should not
have to absorb the complete class matrix before learning one step.

---

## P2 - The figures lecture is a showcase, not a tutorial

`lectures/diagrams/source.md` opens with several sophisticated real figures:
tag-scoped defaults, `same as`, `align`, plot coordinates, manual routing,
braces, generated groups, and multi-step state. Only after those does it reach
`# The vocabulary`.

That order is effective as proof that the language can carry real material. It
is not an effective learning sequence, despite README describing the lecture
as the place where every construct is shown.

### Required resolution

- Label it explicitly as a **construct reference and showcase**, not a
  tutorial.
- Add an early chunk that points first-time readers to the standalone beginner
  path or directly to `# The vocabulary`.
- Do not require the lecture to carry the whole normative grammar. Use it to
  demonstrate constructs; generate the exhaustive tables elsewhere.
- Keep the complex opening figures. They are good motivation once their role is
  named honestly.

---

## P2 - The vocabulary prose has already drifted

The figures lecture says:

> `box`, `dot`, `text`, `image`, `edge`, `brace`, `container`, `bars`, `grid`,
> `plot`, `table`, `lanes`, `align`, `spread`, `default`, `step` - sixteen
> statements, no more.

The exported top-level keyword set contains seventeen: the list omits
`sequence`.

The same lecture twice writes `align x center` in prose while its executable
source correctly uses `align x middle`.

These are small defects, but they demonstrate a maintenance problem: the
artifact page and lecture contain hand-maintained inventories beside exported
compiler tables. After the recent vocabulary consolidation, those inventories
are already stale.

### Required resolution

- Fix the two concrete defects.
- Generate the keyword inventory, class matrix, option matrix, and step-fixed
  column from `diagram-core.mjs`.
- Keep prose explanations hand-written, but do not hand-count or hand-copy a
  closed vocabulary that the compiler already exports.
- Add a documentation gate that fails if a referenced generated table is
  stale, analogous to `refresh-figures.mjs --check` for drawings.

---

## P1 - Possible semantic hole: `emph` on free text

This finding may belong to the parallel gate review, but it affects the public
claim that prominence verbs and prominence classes are one channel.

These two forms are correctly refused because free text has no shape or stroke
for `.emph` to strengthen:

```diagram
text a "A" {.emph}
```

```diagram
text a "A"
step x
  style a {.emph}
```

This form compiles:

```diagram
text a "A"
step x
  emph a
```

The emitted frame gains the class `emph`, but the diagram stylesheet has no
effect for `.dg-text.emph`, so the operation is visually inert. The same issue
can be hidden inside a mixed tag: `emph @attack` may visibly strengthen boxes
and edges while doing nothing to free texts in the same group.

### Required resolution

Choose and document one contract:

1. refuse prominence verbs on members whose kind cannot carry that prominence;
   for a mixed tag, name the incompatible member; or
2. define an actual text emphasis effect and make `.emph`, `style {.emph}`, and
   the `emph` verb legal in the same places.

The current third state - accepted and inert only through the verb - conflicts
with the language's strongest diagnostic principle.

---

## Smaller clarity findings

These do not each need a language change, but they compound the larger issues.

### `same as` needs its override rule beside its first use

For an ordinary node, `same as x` copies width and height, after which an
explicit `w` or `h` on the same line may override one dimension. For a chart it
copies the whole frame and is refused beside `w`, `h`, or `aspect`. The phrase
therefore has related but not identical contracts. Put both in the reference
instead of relying on examples to reveal the difference.

### `pad` has one abstract meaning but several visible effects

It is inner label clearance on a box, outer member clearance on a container or
brace, and the size of a ground behind a text or edge label. “Clearance around
what this statement owns” is a good unifying explanation; the current prose
mostly explains each use separately.

### `side` has two readings

On an edge it places the label relative to the route. On a brace it chooses the
side of the members on which the bracket stands. Both are defensible, but the
reference should organise them under their statement kinds rather than present
`side` as one universally shaped option.

### The first example and the unit section disagree in tone

The hero correctly omits `{unit=...}`, proving the option is not required.
Later prose begins “The block opens with `::: diagram {unit=170x56}`”, which
reads as a requirement. State the default and explain when an author should
override it.

### “Every statement has this shape” is too broad

The six-slot anatomy is useful for placed nodes. It does not describe `edge`,
`container`, `brace`, `align`, `spread`, `default`, `step`, table rows, or
sequence entries without exceptions. Present syntax by family:

- placed element;
- relation/member statement;
- group layout statement;
- expanding statement with continuation lines; and
- step with operations.

That is more text than one universal skeleton, but it lets a reader predict a
new line instead of learning the exceptions afterward.

---

## Recommended documentation architecture

The smallest useful restructuring would create these author-facing artefacts.

### 1. Ten-minute tutorial

One figure, no exhaustive tables:

```diagram
box a "Alice"
box b "Bob" right of a gap 1
edge a -> b "message"

box e "Eve" below a gap 1 {@attack .accent}
edge e -> b {@attack .accent}

step attack
  show @attack
```

It should explain only:

- statement, name, label, placement, tail;
- relative placement;
- edge token;
- tag membership and selection; and
- the first-`show` opening rule.

### 2. Mental model

Five short sections:

1. **Identity** - names, tags, generated names.
2. **Space** - dependencies, anchors, layout cells, clearance, plot values.
3. **Appearance** - class slots, defaults, exact removals.
4. **Time** - opening state, cumulative beats, inherited visibility.
5. **Outputs** - live frame versus print frame.

### 3. Generated reference

Derived from compiler exports:

- every statement and its syntax family;
- every option and which statements accept it;
- every class and which kinds accept it;
- whether each class may change in a step;
- class slots and clashes;
- generated names/tags for each expanding statement; and
- default precedence.

### 4. Figure design guide

Keep the fifteen rules and wrong/right pairs. They answer “what should I draw?”
rather than “what does this line parse as?”, which is why they should not sit
inside the grammar-learning path.

### 5. Cookbook/showcase

Keep the real figures and arrangements. Each should link back to the exact
reference entries it uses rather than restating the grammar in prose.

---

## Proposed resolution order

1. Correct the factual drift: forward references, blank-line boundary,
   root-first claim, `sequence` in the inventory, and `center` / `middle`.
2. Add the state/print table and the step-legality column to the class table.
3. Decide the `sequence` termination rule before the source format freezes.
4. Resolve or explicitly hand to the gate work the inert `emph text` case.
5. Add the unit/measurement model and spatial-word matrix.
6. Add generated identifier and default-cascade references.
7. Separate the tutorial, reference, design rules, and gallery in navigation
   and naming, even if they initially remain in the same physical files.
8. Generate closed-vocabulary tables from the compiler so the next
   consolidation cannot leave prose inventories behind.

---

## Verification performed for this review

No existing repository files were changed while investigating these findings. Small
compiler probes were run through `test/gates/harness.mjs` to distinguish
documentation impressions from language behaviour. They verified:

- a generic placement may refer to an element declared later;
- a root-first dependency graph compiles when it is acyclic;
- a real cycle is refused by name;
- a blank line is not required before a step;
- an element after a step still parses;
- an ordinary leader immediately after a sequence entry run is consumed as a
  message, while placing a brace before it ends the run; and
- `emph` as a verb accepts a free text where the equivalent authored or
  `style` class is refused.

The review did not run or modify the full gate suite because a separate agent
was actively changing those gates in the same working tree.

---

## Follow-up review after the implementation

**Reviewed 2026-08-27.** This pass examined the implementation recorded in:

- `e062a2a` - documentation corrections, the `sequence` termination change,
  the prominence contract, the state table, and the generated step-fixed list;
- `08766ab` - the consistency and readability sweep; and
- `baa8ccb` - the information-architecture pass over the standalone page.

The implementation is technically strong and materially improves the page. It
does not yet close the review. The factual corrections are sound, moving the
step model before the design textbook is the right structural change, and the
decision not to split the standalone page remains appropriate. The remaining
work falls into three groups:

1. one new edge case in the `sequence` contract;
2. incomplete regression coverage and small newly introduced documentation
   drift; and
3. a learning path that is better ordered but still reads as a reference before
   it reads as a tutorial.

### Resolution ledger

| initial finding | implementation result | follow-up status |
|---|---|---|
| false source-order and root-first claims | replaced with the dependency-graph model and the actual topological walk | resolved |
| blank line described as the step boundary | `step` is now named as the boundary; whitespace is presented as a reading convention | resolved |
| live/opening/print state model implicit | one state table now presents the three readings together | resolved |
| step-fixed classes absent from the public page | generated explanation and list added from `DG_STEP_FIXED` | partially resolved: no lookup column |
| order-dependent `sequence` annotation trap | a statement keyword now ends the entry run | partially resolved: keyword/name collision introduced |
| `emph` verb and class disagree on text | one prominence kind set plus a visible text effect added | resolved in implementation, incompletely tested |
| hand-maintained counts and renamed vocabulary drift | current occurrences corrected; one drifting implementation count removed instead of updated | resolved for the reviewed surfaces |
| standalone page interrupts grammar acquisition | steps moved before the class/design reference and route-based contents added | improved, not yet a linear tutorial |
| `unit` and the spatial-word model | explanatory prose improved, no format rename attempted | deliberately deferred |
| generated-name and default-cascade reference | no full generated reference added | open |
| figures lecture framed as showcase rather than tutorial | no explicit reframing added | open |

The two deliberately rejected format changes remain correctly rejected:

- renaming `unit` to `grid` would break the format without adding capability;
- introducing another centre word would undo the completed `middle` / `center`
  distinction. The compiler diagnosis is already the right answer there; the
  stale prose was the defect.

---

## Follow-up P1 - The sequence fix makes statement words implicit reserved names

The new rule is implemented in the compiler and linter as an unconditional
first-token check:

```js
if (DG_KEYWORDS.has(eb[0])) break;
```

This removes the original annotation trap. A line such as

```diagram
text n "why here" right of s-0 gap 1 -- s-0
```

now ends the sequence run and parses as the ordinary statement it visibly is.
That is a substantial improvement, and using the existing statement vocabulary
is preferable to making indentation grammatical in this one construct.

It also makes every statement keyword an implicit reserved name at the first
position of a sequence message. The language does not reserve or diagnose those
names when the actor is declared:

```diagram
sequence s at 0,0
  actor text "Text"
  actor b "B"
  text -> b "hello"
```

The actor declaration is read, but the message begins with `text`, so the entry
run ends. The last line is then parsed as a top-level `text` statement and fails
with two secondary diagnostics:

```text
"->" is not a usable name
unexpected "b" in text ->
```

Neither tells the author that `text` was taken as a statement keyword. The same
ambiguity exists for a named message whose message name itself is a statement
keyword.

### Required resolution before the format freezes

Choose and test one explicit rule:

1. **Prefer the message shape where it is unambiguous.** An arrow in the sender
   slot can identify `text -> b` as a message even though `text` is also a
   statement word. A keyword followed by an ordinary statement name can still
   end the run. The named-message form needs its own ambiguity decision.
2. **Reserve statement keywords as sequence actor and message names.** Refuse
   the declaration itself with a direct diagnostic such as “`text` is a
   statement word and cannot be an actor name”. Document the restriction as an
   identifier rule rather than leaving it as a lookahead side effect.

Whichever rule is chosen belongs in both the compiler/linter agreement gate and
the acceptance/refusal census. The current implementation acknowledges the
cost in a maintainer comment, but the author-facing documentation and tests do
not hold the cost as a deliberate contract.

---

## Follow-up P1 - The new prominence meaning has only an acceptance gate

The revised prominence contract is coherent:

- `.emph`, `.dim`, and `.ghost` occupy one slot;
- the three direct verbs use the same kind list;
- `.emph` gives free text a visible glyph colour;
- on an image it can still act by displacing `.dim`; and
- compiler-generated mixed sets such as `@wa-msg-N` and grid tags remain
  addressable as one set.

The decision to broaden the shared prominence contract is better than refusing
the verb on text. The corpus counterexample is decisive: `sequence` generates a
message tag containing an edge and text, while a grid tag may contain a frame
and images. Refusing a whole tag because the compiler itself made the set mixed
would make documented, real figures unwritable.

The tests added for this change live in `test/gates/accepts.mjs`. They prove that
the three spellings compile on the broadened kind set. They do not prove the
new visible meaning, despite the acceptance gate's own header explaining that
a construct whose meaning can be wrong belongs in a semantic gate too.

The following behaviours are currently unguarded by a targeted assertion:

- `.emph` or `emph` makes a free text's computed fill `--emph`;
- `.tone-4.emph` keeps its inverted label readable and gives the outline a
  contrasting stroke;
- a generated message tag applies prominence to the edge, number, and optional
  second line together; and
- applying `emph` after `dim` to an image actually restores full opacity.

### Required resolution

Add two levels of coverage:

1. a fast semantic fixture that reads the step frames and verifies that a mixed
   generated tag receives the same prominence state on all of its members; and
2. a browser assertion using computed styles for the CSS-only effects on free
   text and `.tone-4`.

This is the one place where the full browser suite being green is not enough:
the existing suite contains no targeted assertion for the new text effect, so
the selector can disappear while every current test remains green.

---

## Follow-up P1 - The standalone page is not yet a linear tutorial

Moving the step section was the correct first pass. A reader now reaches the
grammar of movement before the class matrix and the 5,000-word design section,
and the state table gives a compact account that the old page lacked.

The contents block is also useful, especially because it organises entry points
by intent rather than reproducing eleven headings. But its `Learn` route and the
physical document disagree:

```text
contents route:   first figure -> steps -> written, not drawn
document order:   written, not drawn -> first figure -> steps
```

Following the route therefore ends with a jump back towards the beginning. A
reader who simply scrolls gets the opposite problem: before reaching the block
labelled `start here`, they read the manifesto, four architectural decisions, a
moving figure using advanced constructs, and a comparison with two other tool
families.

The six-stage basic path also retains reference density inside tutorial-shaped
cards. For example, the stage whose new idea is one edge immediately explains:

- all four arrow tokens;
- `via`, `.smooth`, and `.elbow`;
- the internal `.no-head`, `.one-head`, and `.both-heads` classes; and
- changing those classes inside a `style` step.

Later in the same basic path, class removals, enclosing defaults, fractional
anchors, coordinate nudges, the measurement model, and continuation
subgrammars arrive before the dedicated step tutorial. All of those facts are
useful. Their position is what makes the path a reference that happens to be
incremental rather than a ten-minute tutorial.

### Recommended second pass, without splitting the page

Use the existing figures and make the physical order match the Learn route:

1. **Hero and copy-ready first result.** Let the opening figure establish the
   payoff and give the reader a block they can paste.
2. **Minimal static figure.** Teach the wrapper, a stable name, relative
   placement, one `->` edge, and one visible class. Move the other three arrow
   tokens, routing alternatives, head classes, removals, and default precedence
   to the reference sections that already explain them.
3. **One minimal beat on the same cast.** Add one tag and one `step`, then show
   one `show` or `emph`. This closes a usable learning loop before introducing
   the full state table.
4. **Mental model.** Put “Written, not drawn” here: identity, dependencies, one
   cast, re-layout per beat, and print. Those claims are easier to understand
   after the reader has made one of each.
5. **Full steps, reference, design, and cookbook.** Keep the current state
   table, advanced demonstrations, class matrix, wrong/right rules, and gallery
   after the beginner has reached a clear stopping point.

No seventh bespoke figure is required. The hero, the existing six-stage cast,
and `#beats-demo` contain all the material. The work is progressive disclosure:
shorten the explanation at first contact and move the alternatives to where a
reader looks for alternatives.

The page should also decide whether its contents is a one-time route chooser or
a lookup aid. The initial proposal called for a persistent contents mechanism;
the implementation is a static block. On a page of this length, a compact
sticky route/back-to-contents affordance would materially improve the `Look
up` use case, but it is secondary to fixing the linear Learn path.

---

## Follow-up P2 - Step legality is explained but not directly look-up-able

The generated `DG_STEP_FIXED` sentence is a good implementation choice. It
provides both the reason and the seventeen classes, grouped by what they settle,
and `refresh-figures.mjs --check` keeps it from drifting.

It is not the “step?” column proposed by the initial review. The class table
still has four columns:

```text
group | classes | where it acts | what it sets
```

The generated fixed list sits in prose below the entire table. An author
looking at `.smooth`, `.front`, or `.small` therefore has to cross-reference a
second inventory to learn whether `style` may change it.

### Required resolution

Keep the generated explanation, and make the lookup answer local as well. Any
of these would satisfy the requirement without duplicating vocabulary:

- add a generated `in a step?` column;
- add a generated fixed/beat-local marker beside each class group; or
- provide two generated, adjacent lists with direct anchors from the class
  rows.

The source must remain `DG_STEP_FIXED`; the open question is presentation, not
where the truth lives.

---

## Follow-up P2 - Small new documentation drift

### `editor` is not a stored reader preference

The README now says that six frontmatter keys pin how a lecture opens and that
an absent key leaves the reader's stored preference alone. That description is
correct for:

```text
font, theme, collapse, auto-fit, slide-numbers
```

It is not correct for `editor`. That key controls which live output receives a
compiler/editor payload. When it is absent, the build uses `both`; there is no
stored reader preference to preserve. Keep the five viewer defaults in their
existing sentence and describe `editor: both | speaker | none` separately as a
payload/build choice.

### Maintainer comments still describe the rejected prominence solution

The deferred kind-gate comments in `diagram-core.mjs` and `lint.js` still say
that `.emph` on free text is refused or that the gate in practice rejects text
and images. The implemented table now deliberately permits both. These comments
should describe the current reason for keeping the shared gate: it validates
classes on known drawable kinds, while the unified prominence table makes the
three prominence words legal on the same set.

### The review needs closure annotations

Before this follow-up, the review remained simply `Status: open` and described
fixed defects in the present tense. Keeping the original evidence is useful;
silently rewriting it would erase why the changes were made. This follow-up and
the resolution ledger are the intended closure mechanism. Future work should
mark entries resolved, superseded, declined, or deferred here when it lands so
the review does not become the next stale reference.

---

## Assessment of the documented implementation process

The process was unusually good in the areas that matter for language work:

- every checkable initial claim was reproduced before implementation;
- documentation advice was separated from actual grammar behaviour;
- indentation was rejected as a one-off grammatical signal for a principled,
  repository-wide reason;
- the first prominence repair was abandoned when a real corpus figure showed
  that compiler-generated mixed sets made it unusable;
- closed vocabulary was generated from `DG_STEP_FIXED` rather than copied;
- tracked lecture views were rebuilt when their sources changed;
- the learning-path move was isolated in its own commit; and
- the neighbouring process was informed before overlapping files were touched.

Two process improvements remain:

1. A new semantic effect should not be declared closed with only a parse/
   acceptance fixture. The test should be selected by the failure mode: frames
   for emitted state, browser/computed style for stylesheet meaning.
2. When an implementation deliberately delivers a weaker form than the plan -
   generated prose instead of a lookup column, static contents instead of a
   persistent aid - record that decision explicitly in the review ledger.

The large `e062a2a` commit contains two independent language decisions
(`sequence` termination and prominence) beside documentation corrections. Its
commit message makes the reasoning recoverable, but separate commits would
have made later bisecting or reverting safer. This is not a correctness defect;
it is a history/maintenance observation.

---

## Independent verification for the follow-up

This follow-up changed no implementation or generated view. The following
read-only checks were run against the resulting tree:

- `npm run gate`: **389 passed, 0 failed, 0 pending**;
- `node docs/artifact/refresh-figures.mjs --check`: **up to date**;
- `node lint.js lectures/`: **4 files, 0 errors, 0 warnings**;
- local fragment check on `figures-you-write.html`: **131 links, 0 missing
  targets**; and
- a direct compiler probe reproduced the statement-keyword actor collision and
  its two misleading diagnostics.

The full browser suite reported in the implementation commits was not rerun for
this follow-up. Inspection of the browser tests found no targeted computed-style
assertion for the new free-text prominence effect, which is why that gap remains
even if the reported full suite is green.


---

## Second implementation round

Answering the follow-up of 2026-08-27. Every claim in it was reproduced before
anything was changed, and each fix was calibrated in both directions - shown to
fire on the fault and to stay silent without it - because the follow-up's
sharpest observation was that a green suite had been treated as evidence when
no assertion in it could see the effect under test.

### Closed

| follow-up finding | what was done |
|---|---|
| statement words are implicit reserved names at the head of a message | both halves refused where the author can act. `actor text "T"` is refused on the *declaration*, naming the collision; a named message whose name is a statement word (`edge a -> b`, ambiguous with the `edge` statement in both readings) is refused on the line, and only when its two ends really are actors of that sequence - so an annotation that merely contains an arrow is untouched. Mirrored in `lint.js`, five fixtures in `accepts.mjs`, and the causal problem sorts first, which is what the editor panel shows |
| `emph` had only an acceptance gate | calibrated first: deleting `.psi-diagram .emph text { fill: var(--emph) }` left all 389 fast gates green. Seven assertions added to `test/gates/semantics.mjs` (a generated message tag reaches its edge, number and second line; `emph` displaces `dim` on an image; a text takes `emph` in all three spellings), and `test/figure-prominence.mjs` added for the part no gate can see - computed style in the browser. Both were then re-run against the old narrow kind list and against the deleted rule: 6 and 1 failures respectively |
| step legality explained but not look-up-able | the class table has a generated fifth column, `in a step?`, filled per row from the classes that row lists rather than per group - `line shape` answers *only `.elbow`*, because `.smooth` is settled at build time and `.elbow` is not. Source stays `DG_STEP_FIXED`; `refresh-figures.mjs --check` holds it |
| `editor` folded into the viewer-default sentence | it is a build-time payload choice with no stored reader preference to yield to (`state.editor` does not exist and nothing writes it to `localStorage`). The README keeps five viewer defaults and describes `editor` separately |
| maintainer comments still describing the rejected repair | both rewritten. The honest reason for keeping the gate is that it refuses nothing in this family *today* and is what keeps the verb following the class if the kind list ever moves |
| contents route disagreed with document order | the `Learn` route now runs with the page. Checked mechanically: all four routes are monotone in section order |
| the review needs closure annotations | this section |

### Open by decision

- **The learning path's second pass** (progressive disclosure inside the six
  stages) is not done. It is the one remaining item that rewrites teaching
  prose rather than moving or generating it, and the ordering it proposes -
  mental model *after* the first beat - moves "Written, not drawn" out of the
  opening, which is a decision about what the page argues, not only about what
  it teaches. Worth doing; worth deciding deliberately.
- **A persistent/sticky contents affordance.** The static block was built
  first because it is the part that survives a reader printing the page.
- **A full generated reference** for generated names and the default cascade,
  and **reframing `lectures/diagrams`** as a construct reference rather than a
  tutorial. Both were deferred in the first round and stay deferred.

### One observation the follow-up did not raise

At viewport widths below roughly 800px the *page* scrolls horizontally, not
only the wide tables inside their own containers. The offenders predate this
work - code listings (`span.cl`), the tool-comparison table, the state table -
and the class table's width is unchanged by the new column, because
`table.roles:has(th:nth-child(4))` pins it at 58rem whether it carries four
columns or five. Recorded rather than fixed: it is a layout question about the
whole page.


---

## Third implementation round: the page was two documents, so it is two pages

The follow-up's learning-path finding was accepted and then overtaken. Rather
than order one page to serve both jobs, the maintainer split the jobs.

The page was described in two places - `README.md` and `CLAUDE.md` - with one
verb, *teaches*, and it opened as a manifesto. Its own markup admitted the
conflict: the eyebrow reading `start here` was on the **second** section, 1,562
words in, and all nine step verbs appeared before the reader's first `box`.
Every ordering proposed here, including the one implemented in the previous
round, was an attempt to make one document do both.

**`docs/site/figures.html`** is the case, on the project site where an
evaluator arrives. It is Minto, checked against the wording: the page had an
Answer at the top (line 867) and its Complication 1,170 words below it (line
913), and no Situation at all - the Answer opened by *negating* a belief it
never granted. It now runs S-C-A over three figures that already existed: the
seven-line hero, `#follow` (whose second beat moves four things no line names),
and `#seq-demo`. Then the four decisions and the comparison table, which are the
support level Minto says they always were.

**`docs/artifact/figures-you-write.html`** is the manual, and nothing else. The
manifesto section left; `#follow` moved *into* the step section, where it is now
the first stepped figure a reader meets - it is three boxes and two beats, and
`#beats-demo`, which held that place, is ten elements and four beats. `beyond`
moved above `rules`.

Measured before and after: words before `start here` **1,562 -> 306**; sections
9 -> 8; **svg 65 -> 65** and pre 68 -> 68, so no drawing and no listing was lost
in the move. All four contents routes are now **contiguous blocks**, which is
the property the previous round's monotonicity check was reaching for.

Two things the split forced that are worth recording. `demo-controls.js` became
a file of its own, inlined into both pages, because two pages now carry stepped
figures and two copies of that wiring is how their controls come to disagree.
And `build-site.js` publishes the manual, because the case ends by sending the
reader to it - the link would otherwise 404 on the deployed site, where
`docs/artifact/` had never been copied at all.

**Not done, and now unnecessary:** a seventh tutorial stage. `#follow` is that
stage. **Still open:** progressive disclosure inside the six stages (stage 2
introduces fourteen terms for one `edge`; stage 4 uses `default` 211 lines
before it is defined), the page-level horizontal scroll below ~800px, and the
generated reference for generated names and the default cascade.


---

## Fourth round: the four findings against the split

All four reproduced before anything changed; three were defects introduced by
the round they reviewed.

**The sequence ambiguity check was asymmetric.** It built its actor set from
the entries already read, while the grammar lets a message name an actor
declared *under* it - so `edge a -> b` above its own cast fell out of the run
unchallenged and produced five downstream complaints, none containing the word
`edge`. A pre-scan gathers the run's actors before the loop reads it, stopping
exactly where the run can stop, so no actor from beyond the sequence is
collected. And the ambiguous line no longer *breaks* the run: it is reported
once and then read on as the message it sits among, because breaking took every
entry under it out of the run with it. Both orders now give the same single
diagnostic, and four mirrored fixtures hold it - the missing mirror was half
the finding.

**The staleness gate was a claim, not a gate.** `build-site.js` and `CLAUDE.md`
both named `refresh-figures.mjs --check` as what keeps the two published pages
from going stale, and no workflow ran it. It runs in `pages.yml` before the
site is assembled and in `release.yml` beside the tracked-output check. Not in
`gates.yml`: that job is deliberately dependency-free and this check needs the
full build. Calibrated both ways - and the first calibration was wrong, which
is worth recording: sabotaging the page `<title>` did not trip it, because
`--check` compares the *generated regions* against a fresh build rather than
the whole file. Sabotaging a spliced listing trips it, exit 1, naming the file.

**`docs/artifact/README.md` had gone stale in four places** - Google Fonts that
are embedded, four stepped figures that are five, `#follow` in a section it has
left, and the button wiring described as hand-written and safe to edit when
editing it in the HTML is now exactly what gets thrown away on the next
refresh.

**The manual's link back to the case only resolved after deployment.** The
manual is described as a page you open straight off disk, so a link that needs
`_site` is broken for its own reader. The source now carries
`../site/figures.html` and `build-site.js` drops the one step while copying,
failing loudly if the link is not there to rewrite. The reverse asymmetry is
deliberate: the site page is a build input that has no styling or top bar until
the site build runs, so its links are written for where it is served.

Still open, unchanged: progressive disclosure inside the six stages, and the
page-level horizontal scroll below ~800px.
