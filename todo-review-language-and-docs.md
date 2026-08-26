# Review of the figure language and its documentation

**Status: open.** Reviewed 2026-08-26 against the current working tree, with
particular attention to `docs/artifact/figures-you-write.html`,
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
