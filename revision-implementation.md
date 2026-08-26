# Implementing `revision-proposal.md` – progress and decisions

**Status: complete, and reviewed – see `todo-revision-review.md`, which is closed.** This file is the running record of the implementation of
`revision-proposal.md`. It is not a second plan: the proposal is the
specification and stays authoritative. What goes here is (a) what has landed, (b)
every implementation decision the proposal left to the implementer, and (c) every
measurement that contradicted or sharpened the proposal, so a later reader can
tell a deliberate deviation from an oversight.

**`todo-revision-review.md` is the follow-up.** It reviews this file and the code
against the proposal and found nine gaps, several of them real. Where it and this
file disagreed, it was right twice – once about a passage here that described a
guard which had been deliberately removed, and once about a technical
justification that measurement did not support. Both are corrected in place and
recorded there. Read the two together: this file says what was decided, that one
says what the decisions missed.

## How the work is verified

Two harnesses, both under the session scratchpad and both driving
`diagram-core.mjs` directly rather than through `build.js`:

- **`probe.mjs`** – one block in, problems or the emitted `<figure>` out. This is
  the finding document's own harness and it is what every "measured" claim below
  was produced with.
- **`corpus.mjs`** – compiles every `::: diagram` block in the corpus,
  normalises the per-figure `dgN-` id prefix away and snapshots each print SVG.
  The baseline is taken by running the **same script against `HEAD`'s
  `diagram-core.mjs`**, checked out to a second path, so a snapshot can be
  retaken at any time without stashing work in progress. Baseline: **116 blocks,
  0 failures, 12 warnings.** Every item that claims "byte-identical drawings" is
  checked against it rather than asserted.

  **116, not the proposal's 110** – see the override below. The corpus is four
  files, not three.

Around those grew five more checks, and they are all in one script –
`scratchpad/probe/gates.sh` – because a revision this size needs its
verification to be one command rather than five things to remember. They are
listed under *The gates* below. `node test/run.mjs` sits outside the script: it
launches a browser and takes minutes rather than seconds.

## Order of work

The proposal's nine dependency groups are followed exactly. The reason for the
order is in the proposal's *Sequencing* section and is not restated here.

| group | items | state |
|---|---|---|
| 1 – diagnostics foundations | 18, 2, 3, 19, 20, 21, 8 | ✅ compiler, lint.js, editor.mjs |
| 2 – the removal mark | 16 | ✅ |
| 3 – print prerequisite | 32 | ✅ |
| 4 – vocabulary + arrow migration | 1, 11, 17, 5, 9, 13, 22, 23, 30, 31 | ✅ |
| 5 – the refusal rule | 10, 12, 4, 26 | ✅ |
| 6 – the editor catches up | 15, 14, 27 | ✅ |
| 7 – the units migration | 6, 24, 25 | ✅ compiler, corpus, panel |
| 8 – rebuild and verify | 28 | ✅ |
| 9 – the prose | 29, 7 | ✅ |

## The gates, and one they caught

`scratchpad/probe/gates.sh` runs all six in one command, and every claim in this
file was produced by one of them:

| gate | what it refuses to let through |
|---|---|
| `corpus.mjs` | a block that stops compiling, or a drawing that moved without a reason |
| `qcheck.mjs` | a quoted label changed by a migration |
| `diffgate.mjs` | a linter laxer *or* stricter than the build, over 31 fixtures |
| `accept6.mjs` | a new overlap, a lost arrow clearance or a reshaped frame after item 6 |
| `node lint.js` | the pre-commit gate itself |
| `node build.js` × 5 | every lecture, including the two CI used to lint and never build |
| `review.mjs` | **21 constructs the grammar is supposed to still accept**, compiled – the counterpart to `diffgate.mjs`, which only asks whether the refusals fire |

`review.mjs` is the gate the others do not cover, and adding it was not
optional: every other check asks whether a *refusal* fires, and a revision that
adds a hundred refusals can only fail in the other direction. It found one real
bug – item 9's guard against `edge a b -> c` on a **sequence message** was
written against `known`, which in that file is a whole-model reference test
declared several hundred lines later, so every named message threw
`Cannot access 'known' before initialization` rather than compiling. It is
`actors.some(...)` against the actors the entry run has read so far, which is the
set the check actually meant. No corpus line named a message, so nothing outside
a fixture could have caught it.

**That guard has since been removed entirely** – see *The two readings of `edge
X Y -> Z`* below. The bug was real and the fix was right for as long as the guard
existed; the guard itself turned out not to be needed.

The build loop earned its place immediately. Renaming `calm` to `dim` in a
comment inside `DIAGRAM_CSS` put a **backtick inside a template literal**, which
ends the literal and throws at parse time – the first of the three edit mistakes
CLAUDE.md warns about, made while editing a comment about the very word being
renamed. Nothing else in this list could have caught it: the compiler is a
separate module, the corpus snapshot does not go through `build.js`, and
`lint.js` is zero-dependency by design.

### The construct reference gained the three constructs it could not show

The proposal asks for these and they are in `lectures/diagrams`:

- **`#justify`** gains two edges carrying `side top` / `side bottom`. The chunk
  is the reference for the nine label positions on a box, and it could not show
  the *edge* reading before, because it used the same four words – which is item
  5(d)'s whole point. The contrast is now in the picture: two independent
  channels with three answers each, against one with two.
- **`#seqmore`** gains a **named message**, `tunnel c -- s "…"`, with a brace
  hung off that name. Item 9 adds the capability and there was no way to
  demonstrate it before, because `{#id}` did not reach a message either.
- **`#motion`** gains a beat that writes `{!dim}` and `{!emph}` – the step form
  of item 16's mark, where `#look` shows the tail form.

**The named message immediately caught a `lint.js` gap**: item 9's optional name
was mirrored for an `edge` and not for a message, so the linter was *stricter
than the build* – the one direction CLAUDE.md names as dangerous, and the one
that merges green and fails every later build. Nothing in the corpus named a
message, so without writing one into the reference it would have waited for the
first author who tried. Fixed, with four fixtures added to `diffgate.mjs`, which
now covers 35.

## Item-by-item state

`compiler` means `diagram-core.mjs`; `gate` means `lint.js`; `source` means the
four corpus lectures; `panel` means `editor.mjs` and its specs.

| # | compiler | gate | source | panel | docs |
|---|---|---|---|---|---|
| 1 `calm` → the prominence dial | ✅ | ✅ | ✅ 46 | ▶ | ▶ |
| 2 one sentence per statement | ✅ | ✅ | – | ✅ | ▶ |
| 3 `gap` vs `space` | ✅ by item 2 | ✅ | – | – | ▶ |
| 4 same-slot pair / clash row | ✅ | ✅ | ✅ 2 | – | ▶ |
| 5 `align` → `flush`, `side` | ✅ | ✅ | ✅ 83 | ▶ | ▶ |
| 6 `gap` is square | ✅ | – | ✅ 250 | ▶ | ▶ |
| 7 the bar for a new word | – | – | – | – | ▶ |
| 8 the two near-misses | ✅ | ✅ | – | ✅ | ▶ |
| 9 `{#id}` → a leading name | ✅ | ✅ | ✅ 95 | ▶ | ▶ |
| 10 `edge` in the kind gate | ✅ | ✅ | – | – | ▶ |
| 11 print takes the opening beat | ✅ | – | ✅ 4 | ▶ | ▶ |
| 12 inert (kind, class) pairs | ✅ | ✅ | ✅ 11 | ▶ | ▶ |
| 13 `table` `w`; the arrow family | ✅ | ✅ | ✅ 21 | ▶ | ▶ |
| 14 `aspect` in `DG_KEYED_ATTRS` | ✅ | – | – | ▶ | – |
| 15 a class the panel cannot remove | – | – | – | ▶ | – |
| 16 `{!class}` | ✅ | ✅ | ✅ 4 | ▶ | ▶ |
| 17 a step op destroys `{.dim}` | ✅ by item 11 | – | – | – | – |
| 18 phases on every problem | ✅ | n/a | – | ✅ | – |
| 19 the member run ends at the commas | ✅ | ✅ | – | ✅ | – |
| 20 `w`/`h`/`r`/`point` gated | ✅ | ✅ | – | – | ▶ |
| 21 `step` takes one name | ✅ | ✅ | ✅ 2 | ✅ | – |
| 22 a brace's `side` | ✅ | ✅ | ✅ 21 | ▶ | ▶ |
| 23 `row` / `band` / `header` | ✅ | ✅ | ✅ 4 | ▶ | ▶ |
| 24 `bars … space` | ✅ | – | ✅ 1 | – | ▶ |
| 25 `table … space` | ✅ | – | – | – | – |
| 26 `.smooth .elbow` | ✅ by item 4 | ✅ | – | – | – |
| 27 a generated message name | ✅ by item 9 | ✅ | – | ▶ | – |
| 28 `#look` shows prominence | – | – | ✅ | – | – |
| 29 claims the compiler contradicts | – | – | – | – | ▶ |
| 30 `plot … step` → `tick` | ✅ | ✅ | ✅ 10 | ▶ | ▶ |
| 31 the leader's tokens | ✅ | ✅ | ✅ 32 | ▶ | ▶ |
| 32 print draws a removed head | ✅ | – | – | – | ▶ |

**All thirty-two are complete**, in the compiler, the linter, the four corpus
lectures, the panel and the prose. Final state:

- `gates.sh` – seven checks, all green. 116 blocks compile, every quoted label
  survived, build and lint agree on 38 fixtures, 98 redrawn blocks with no new
  overlap or tight gutter, 21 constructs still accepted, lint clean, five
  lectures build.
- **`node test/run.mjs` – 537 passed, 0 failed.** The suite grew from 500 as the
  panel's new controls gained specs.
- `node docs/artifact/refresh-figures.mjs --check` – up to date.
- The tracked views of `lectures/tutorial` and `lectures/diagrams` are rebuilt,
  which is the release workflow's own gate.

Verified end to end in a built page rather than only in the compiler –
`lectures/diagrams/print.html`, after item 11:

| written | in the handout |
|---|---|
| `{.emph}` on `p1`'s line | `emph` |
| nothing on `p2` | nothing |
| `{.dim}` on `p3` | `dim`, at 0.3 |
| `{.ghost}` on `p4` | `ghost`, at 0.45 |
| `{@prom !dim}` on `p5`, under `default box @prom {.dim}` | nothing – the removal beat the default |
| `dim direct` in a step | nothing |
| `emph px` in a step | nothing |
| `<->` on `direct` | `both-heads` |
| `->` on `up` | `one-head` |

### Item 18, demonstrated on the case push order gets wrong

The one consumer that matters here shows a single sentence, so "which problem is
first" *is* the message. Measured on a block with a semantic failure on **line
3** and a syntax failure on **line 4**:

```
>> line 4: unexpected "rightof" in box c – this statement takes …
   line 3: edge edge-1: .elbow draws its own two waypoints, so it cannot …
```

The later line is reported first, and that is the point. A broken statement can
manufacture a downstream complaint – `above of a` binds `of` as a name, a member
scan swallows a mistyped option, an `edge` with nothing before its arrow reads
the keyword as an endpoint – and the reverse never happens, so the earlier
*phase* is the better first sentence even when it is the later *line*. Sorting by
line inverts exactly this case.

Worth recording that the finding document's own example no longer produces two
problems at all: `text n "…" right of zz` above `box zz "Z" rightof a` now yields
**one**, because `claim()` registers `zz` before the option loop meets the typo,
so the reference resolves and only the real defect is reported. Items 2 and 18
compose better than either predicted alone.

## Decisions made during implementation

### The two lectures' own prose moved with their source

Both `lectures/tutorial` and `lectures/diagrams` explain the language in prose
between their figures, and neither is in the proposal's list of prose sites – the
proposal tracks `figure-design.md`, `CLAUDE.md`, `editor.md` and the artifact
page. Measured, both carried claims this revision falsifies, and the tutorial's
matter most because **it is the one lecture the project site publishes**:

- the step-op list naming `calm`, and the `#diagram-steps` heading naming it;
- *"Print shows every element the diagram ever displays"* – already false before
  this revision, since print has been the last beat rather than the union for
  some time, and now additionally wrong about prominence;
- the class-slot paragraph, which said a same-slot pair is *"a lint warning"*
  (it is an error, and the compiler's) and listed the arrowhead classes as the
  way to say which end carries a head (the token says it);
- *"Give the edge an `{#id}` first"*, in both lectures;
- **the `align`-means-two-things paragraph**, which exists *because* of the
  overload item 5 removes. Deleted rather than edited, as the proposal directs
  for its sibling on the artifact page – the thing it explains is gone.

`lectures/diagrams` also carried the German counterparts, plus the `#seqmore`
paragraph that named three arrow forms and called them four; it now names four
and says that the token, not a class, states the head.

### Process · CI now builds every lecture it lints

The proposal decides this and it is done, in both workflows: `pages.yml` and
`release.yml` each gained `lectures/network-security`, and `release.yml` gained
`docs/artifact/figure-rules` (`pages.yml` gained both plus `lectures/diagrams`).

The reason is sharper after the work than before it. **`lint.js` is deliberately
the laxer of the pair** – it computes no geometry, it cannot expand a tag, and it
does not re-implement `readGridOpts` – so linting alone was never a gate on
anything the compiler decides, and this revision widened that gap a long way:
`DG_CLASS_KINDS` adds broad refusal coverage, item 13b adds a table keyed by
position, and item 12's tag rule adds a check the linter cannot make at all
without expanding tags. The two lectures that were linted and never built are the
two largest bodies of real figures in the repository.

### G2 · Class *order* in the emitted attribute is presentation, and stays put

Item 16 needs the layers to resolve **weak to strong**, because at the moment a
`!dim` is read the `.dim` it cancels has not been added yet. `withDefaults`
walked most-specific-*first* and skipped a class whose slot was already claimed –
the same answer for positives alone, and no place at all to put a removal.

Rewriting the walk reordered the `class` attribute of 16 blocks: `accent tone-2`
became `tone-2 accent`. Nothing reads it – CSS arbitrates by selector, not by
position – so this was cosmetic, and it was also 16 spurious diffs in every later
regression run. The walk therefore records which layer each surviving class came
from and emits strongest-first, which is the order it always had. Resolution
order and emission order are two different questions and the code now says so.

Corpus after: **0 diffs across all 116 blocks.**

### G2 · One case genuinely changes, and item 4(a) is about to refuse it

`{.round .sharp}` – two classes from one slot in one tail – emitted *both* under
the old walk, because it took an early return whenever the element had no
`default` layer at all. That early return is exactly the hole item 29(a) is about:
the page promises "only one class from a group applies" and the compiler
delivered it only *between* layers. Under the new walk the later one displaces
the earlier, so `{.round .sharp}` resolves to `sharp`.

No corpus line carries a same-slot pair (measured, zero), and item 4(a) makes one
an **error** in group 5, so the window in which this is observable is the gap
between the two groups. Recorded rather than worked around, because the
intermediate behaviour is strictly closer to what the page already claims.

### G1 · The `attempted` third state is what suppresses the consequence

Item 2 asks that `has no placement` be suppressed for a statement that stopped
early, *and only then*, keying on "the parser stopped reading" rather than on "an
error happened". Item 8 separately asks `dgParsePlacement` for a third state –
*a placement was attempted and failed*, distinct from *there is no placement
here, try the next branch*. These are the same signal, so there is one: the
function returns `[place, next, attempted]` and the node loop sets its own
`stopped` flag from either that or an unreadable token. Writing them as two
mechanisms would have meant two answers to "did this line still make sense".

Measured on the finding document's own examples: `rightof` 5 → 1, `right a`
5 → 1, `above of a` 4 → 1, `right of b space 1` 2 → 1, `container … padd` 2 → 1,
`edge … gap` 2 → 1, and the two cases that must *not* change – `box b "B"` stays
at its one placement sentence and `box b "B" point sideways` stays at two real
independent errors.

### G1 · `point` went into `DG_KIND_OPTS.box` rather than staying a special case

Item 20 asks that `point` be refused on any kind but `box`. The cheap way is a
kind test at the call site; the right way is the table, because `DG_KIND_OPTS` is
what the panel and the linter both read to decide what a statement accepts. Put
in the table, `point` narrows the statement, the `default` block, the linter and
the panel's option row from one edit, and `dgTakes` names it in the refusal
without being told about it.

### G4 · A migration needs an invariant that is not "the source looks right"

The item-9 and item-13b rewrites both collapsed runs of whitespace while
stripping a token out of an attribute tail – and the collapse reached **inside
quoted labels**, turning `"M, T   replay"` into `"M, T replay"` in
`lectures/diagrams`. Nothing caught it: the source diff looks correct, the build
succeeds, `lint.js` is clean, and the drawing is still a drawing. It surfaced
only because the corpus snapshot's print SVG differed by one `<tspan>`.

The fix is a second gate rather than a more careful `sed`. `qcheck.mjs` counts
every quoted string in each corpus file at `HEAD` and now, per line, and fails if
any is lost. It runs after every migration step, beside the snapshot diff. The
general rule the migration tool encodes: **`runs()` splits a line into the parts
that may be rewritten and the parts that may not, and nothing outside that split
may touch the line.** The two scripts that broke it did their tail edit correctly
and then normalised whitespace on the joined result, which is outside it.

### G4 · Three human decisions item 11 leaves open, and what decided them

The proposal names four figures whose print drawing changes and says three need a
person. Measured, exactly those four change and no others.

- **`#ns-a14`** – the bugfix. The element is written `{.dim}` and later calmed,
  and print lost the author's own class. No decision.
- **`#ns-b05`** (`fw1`, `fw2`) – **not quiet in the handout.** The two perimeter
  firewalls are what the drawing is *about*; beat 1 emphasises them and beat 2
  hands attention to the inner pair. That hand-off is a lecture-time act, which
  is precisely the rule. The figure's dead `calm` + `style {.dim}` pair collapses
  to one line, and deleting the second produced **zero** change in any drawing –
  the corpus's own proof that the first line had been dead code.
- **`#ns-b22`** (`us`) – **not quiet in the handout**, decided on the author's own
  comment in the block: *"dass es oben nicht durchgeht, sagt die Lücke hinter der
  Firewall."* The gap carries the meaning; the dimming was redundant emphasis.
- **`#beats-demo`** – the proposal's resolved case, applied as written: `{.dim}`
  on `r`'s own line and `style r {!dim}` for the beats where it does not apply.
  Verified: print is `small paper dim` again and the live per-beat reading is
  unchanged. **This is the first figure in the corpus that cannot be written
  correctly without item 16's `{!class}`**, which is worth saying on the page
  when the mark is introduced.

### G5 · The kind gate and the slot check are one function, in one order

Item 4 says the kind gate must run **before** the slot-pair check, or
`edge p -> q {.hex .diamond}` is answered *"an element has one outline"*, which is
false of an edge. Written as two calls at each site that is a convention someone
has to remember; written as one function it is structural. `rejectClassOn`
refuses the out-of-kind classes, collects what survived, and hands only those to
`rejectSlotPair`. Verified: the edge case now answers *".hex is an outline, and an
edge has nothing to draw it with"* twice and says nothing about slots, while
`box … {.round .sharp}` answers the slot question alone.

`rejectShapeOn` and `rejectAlignOn` are kept as one-line delegates rather than
deleted, so the eight call sites and `lint.js`'s import keep reading as the rule
they state.

### G7 · An unwritten horizontal gap is written out rather than left to shrink

The proposal's migration table counts 232 horizontal gaps to rewrite and **6 to
insert**, and separately decides that the default `gap` of `0.25` stays `0.25`.
The two together mean that a horizontal placement which wrote no gap draws
`0.25 * uh` after the change where it drew `0.25 * uw` before – **tighter**, at
the corpus median by a factor of 2.9, and tighter is the direction that causes
overlap.

So the migration writes the converted number out at every such site rather than
only in `figure-rules`: `right of a` becomes `right of a gap 0.7` at the common
unit. Measured, that is **exactly 6 sites** across all four files, which is why
the proposal's count of 6 is right for the wrong file – they are the only
horizontal placements in the entire corpus that never wrote a gap.

It is also the more honest source. Item 6's own argument is that a figure whose
horizontal gutters should be wider now *says so in the numbers*; a placement that
silently relies on a default it never chose is the same defect one layer down.

Totals, over four files: **244 gaps rewritten, 6 inserted, `#hero` excluded** as
the proposal directs. 98 of 116 blocks are redrawn.

### Item 32 was half an answer, and the gate said so

Print stopped drawing an arrowhead the last beat removed – but by writing
`opacity: 0` into the print state, which fixed the artefact an author checks last
and left the **runtime** unable to do the same thing. `dgRenderInto` iterates
`for (const key in frame.geom)`, so a key a frame does not mention is never
touched, and the static SVG is the last beat: `style e {.both-heads}` at beat 1
drew the second head at beat 0 as well, and `style e {.no-head}` left the first
drawn after it had gone.

Found by `test/gates/step-classes.mjs`, which the review asked for and which
derives its expectation from `DG_STEP_FIXED` instead of restating it. My own
sweep had measured the same figure and cleared it, because it asked a blunter
question; the gate asked *is a geometry key present in one beat and absent in
another* and got the right answer.

The whole answer is the rule the edge label's ground already followed: **emit the
drawable in every frame that could want it, and let the numbers say whether it is
there.** A head a beat does not want is a head of zero length at its own tip. It
collapses in print, it tweens out on screen, and item 32's inline opacity is
deleted – two mechanisms for one thing is what this revision exists to remove.
`vis` could not have carried it, because `vis` is keyed by element and a head is
one drawable inside an edge's group.

### The ASCII step-name decision was reversed

Recorded below as a measured override of the proposal, and **it was wrong on its
second reason**. `dgeRenameStep` splices inside the step's own span and never
goes near `dgeRenameIn`, so the boundary risk cited as the technical necessity
does not exist for a step name. `todo-revision-review.md` found this.

`DG_STEP_NAME` is Unicode-aware now and the two German step names are restored.
The section below is kept rather than rewritten, because the *first* reason – one
naming rule is better than two – was a real argument that lost to a better one,
and a record that quietly deletes a reversed decision teaches nothing.

### G7 · The acceptance criterion, run as a check rather than asserted

The proposal is explicit that "within three pixels of the old SVG" is *not* the
criterion, because snapping to 0.05 accumulates along a chain – the criterion is
that the figure still communicates the same relationships. `accept6.mjs` turns
that into three measurements over every redrawn block:

| check | result |
|---|---|
| two boxes that now overlap and did not before | **0** |
| a horizontal gutter that fell below one arrowhead plus its padding and had not been tight before | **0** |
| a frame whose proportion changed by more than ±60% | **0** |

`#hero` goes from **7.29:1 to 5.62:1**, which is the proposal's own predicted
number to two decimal places, and `node test/run.mjs figure` passes 41/41 –
framing, labels and sequence together.

### G5 · Negation was an escape hatch past the kind gate, and the comment said it was not

Item 12 states the rule outright – *"a positive `.class` and a negative `!class`
are legal on exactly the same kinds; negation does not become an escape hatch for
a class that the kind can never carry"* – and the comment written above
`DG_CLASS_KINDS` repeated it. **The code did not do it.** Measured:
`edge a -> b {.hex}` was refused and `edge a -> b {!hex}` compiled clean, so
every refusal in the table could be walked past by typing one character
differently.

It survived every gate here, because all of them ask whether a refusal fires on
the *positive* form. It was found by the agent writing the page's prose, checking
a claim in a compiler comment against the compiler – which is the argument for
having the prose written against the code rather than against the proposal.

`rejectClassOn` takes the tail's removal list now and checks it against the same
table, at all five scopes: an element's own line, a `default` block, a `style`
step, the charts, and a container or brace. Two fixtures added to `diffgate.mjs`.

The general lesson is in the shape of the miss rather than in the fix: **a rule
stated in a comment is not a tested rule.** Where this revision writes a rule
down, the gate should exercise both directions of it.

### Four span-table defects the panel found, and one it re-found

Building the editor half against the migrated compiler surfaced four things no
gate here could reach, because all four are about `createSpanTable` – the
interface between a gesture and the source, which nothing in the corpus exercises.

- **`<->` was missing from the endpoint scan** and from `REF_INTRO`. Measured on
  `lectures/diagrams:481`: `spanOf('direct', 'arrow' | 'from' | 'to')` all
  returned `null`, so on any two-headed edge the endpoint fields, *Swap ends* and
  the arrowheads row were inert. The panel could write `<->` and then not read it
  back. Both lists derive from `DG_EDGE_ARROWS` now, so a fifth token would join
  them for free.
- **`PLACEMENT_OPTS` still said `align`.** An *absent* `flush` therefore took its
  insertion point from the tail rather than from the end of the placement, and
  `right of a gap 1 w 2` + `flush top` produced `unexpected "flush" in box b` –
  a placement option written after a size is not part of the placement any more.
  This is why the panel could not be given a `flush` row until now.
- **No `spanOf(id, 'name')`** – item 9's editor contract asks for it explicitly
  and forbids the editor inferring a name from an id pattern. Added, covering
  both forms: the mandatory second token, and for an anonymous edge or message an
  absent span whose insertion point is immediately before the from-token.
- **No `spanOf(id, 'leaderArrow')`** – item 31's. Added, with `leaderTarget`
  beside it. The leader stays out of the table as an *element*, which is the
  older decision and the right one: it carries the `text` statement's span
  because it is an aspect of that statement rather than something named.

The fifth thing reported was the named-message crash, which `review.mjs` had
already caught and fixed a few hours earlier – the panel measured it before that
landed. Worth recording only because two independent checks found the same
defect from opposite directions, which is the argument for having both.

### The two readings of `edge X Y -> Z`, and why neither needed a rule

`edge X Y -> Z` is the named form – name X, from Y, to Z. It is the one line the
leading-name rule makes ambiguous, and the proposal asks for a guard: *"if the
first of two tokens already names an element, that is two element names before an
arrow and almost certainly a slip."*

Two rules were written for it and then **both were removed**, which is the more
useful record. The first was the guard as specified. It answered a *duplicate
edge name* – the same `edge f1 …` written twice, which is what a wrong/right pair
in one fence produces – with *"two element names before the arrow"*, sending the
author after a slip they had not made. So a second rule was added to discriminate
by what kind the first token already named.

Measured, the whole thing was unnecessary. The only way the line can be wrong is
that the name is not available, and `duplicate element id "X"` is exactly that
sentence – the same one every other statement gets. The guard's one real
contribution was suppressing a **cascade**: the edge took the box's name, two
elements answered to one id, and the layout then reported `placement cycle: a → c
→ a`, which nobody had written.

So the cascade is what was fixed. `claim()` returns whether the name was granted,
and **an edge that did not get its name is not built** – anything further would be
a second element answering to somebody else's id, and the layout's report on that
is a fiction. One message per defect, no invented second one, and the sequence
half needed no rule of its own either.

| written | reported |
|---|---|
| `edge a c -> c`, `a` is a box | `duplicate element id "a"` |
| `edge f1 …` twice | `duplicate element id "f1"` |
| `u r -> r` in a sequence, `u` is an actor | `duplicate element id "u"` |

Recorded at this length because the proposal asks for a guard that is not there,
and a reader comparing the two documents deserves the reason rather than a
silence. **Two rules removed rather than two added** is the shape this revision
was for.

## Measurements that override the proposal

### G5 · Item 4's "zero corpus lines" measured the written tail, not the drawing

The proposal reports the clash-row migration as **zero**, on the evidence that
`node lint.js` is clean and an independent scan of every attribute tail finds no
clash row. Both halves are true and the conclusion does not follow: `lint.js`'s
clash loop read `out.classes` – the tail **as written** – and never resolved a
`default` layer down onto an element.

Moved into the compiler, where the resolved state exists, the check fires on
**two** real elements: `vic` in `lectures/network-security` `#ns-a28` and
`#ns-a29`. Both are written `{.tone-4}` under a block-level `default box
{.accent}`, and `.accent` and `.tone-4` are in *different* slots, so the default
is not displaced – it lands, and it is invisible, because `.tone-4` inverts its
own label. The warning is true and the class was doing nothing.

Fixed rather than left standing, because a warning that fires on every build of a
corpus lecture teaches people to ignore warnings. The repair is item 16's mark:
`{.tone-4 !accent}`. Verified byte-identical drawings and the corpus back to its
baseline 12 warnings – **and it is the second place `{!class}` turned out to be
the only honest spelling**, after `#beats-demo`. Neither was invented for the
mark; both were found by other checks and had no other repair.

### The corpus is four files and 116 blocks, not three and 110

**This is the largest correction to the proposal and it changes every migration
count in it.** The proposal states the corpus as `lectures/diagrams` (24 blocks),
`lectures/network-security` (36) and `docs/artifact/figure-rules` (50) – 110 in
all – and every per-item table is drawn from those three.

`lectures/tutorial/source.md` has **six compiled `::: diagram` blocks**, in four
chunks (`#diagram`, `#diagram-classes`, `#diagram-charts` – which holds three –
and `#diagram-steps`), each setting its own `unit=`. It is excluded from every
table in the proposal except the one figure in item 19, where its two
`container`/`brace` lines are silently included in a count of "39".

It cannot be left out, for a reason stronger than completeness: **the tutorial is
the one lecture the project site publishes.** `pages.yml` fires on every push to
`main` and rebuilds it, its four HTML views are tracked in git, and the release
workflow fails if they are stale. A migration that skips it ships a tutorial that
contradicts the language it is teaching.

Measured, nine of the items touch it:

| item | tutorial sites |
|---|---|
| 6 – horizontal `gap` | **37** (and 11 vertical) |
| 9 – named `edge` | 8 |
| 5 – placement `align` / `align` statement / edge-label class | 3 / 1 / 2 |
| 13b – `.no-head` / `.both-heads` | 3 |
| 31 – `text` leader | 3 |
| 1 – step-op `calm` | 2 |
| 19 – `container` / `brace` | 2 |
| 22, 24, 30 | 1 each |

Item 6's migration table in particular should read **four files, 116 blocks and
269 horizontal gap rewrites**, not three, 110 and 232.

### The prose inventory found three claims the proposal states wrongly

Measured against the files themselves, not against the proposal's account of
them:

1. **Item 11 says `figures-you-write.html` "states no claim about print stripping
   emphasis, so nothing there is contradicted". It states four** – at lines 929,
   1525, 1646 and 1869. All four move with item 11 rather than only
   `figure-design.md:721-724`.
2. **Item 29(a) mis-quotes the page.** It says the page makes "the stronger
   promise two sentences later" – *"…a second from the same group is refused when
   the figure is built"*. That sentence is not there; line 1085 is about
   *unknown* classes, not same-group ones. So item 4(a) does not merely let an
   existing promise become true, it has to *write* the promise.
3. **`refresh-figures.mjs` is a prose site twice, and the second one is
   invisible to a grep of the HTML.** Beside the `STEP_OPS` regex at line 103
   that item 1 names, lines 275–283 (`ANAT_CODE` / `ANAT_GROUPS`) *generate* the
   anatomy diagram at `figures-you-write.html:1054`. Its code line reads
   `box sw "Switch" right of a gap 0.4 w 1.2 {.tone-1 #main @net}` and its
   caption reads *"tail: classes, an id, tags"* – both false after item 9, and
   neither visible in the HTML source because that region is machine-written.
   Line 102's `KW` regex additionally stops painting `flush`, `side`, `row`,
   `band`, `header` and `tick`.

Two documents are **already stale before this revision touches them**, and both
should be corrected while the surrounding text is being re-cut anyway:
`PRD.md:445` lists the prominence and arrowhead classes among those that "stack
freely", which `CLAUDE.md:354` contradicts and `DG_CLASS_GROUPS` settled; and
`lectures/tutorial/source.md:515` describes print as the union of every beat,
which it has not been for some time.

### Four smaller corrections to the proposal's counts

All measured by re-using the compiler's own `dgTokenize`, so `#` comments,
quoted labels and `{…}` tails cannot be mistaken for bare tokens – which is what
produced two of the four.

| item | proposal | measured |
|---|---|---|
| 5 – placement `align` | 67 | **66** in the three files (+3 in the tutorial). The 67th is a `#` comment inside `lectures/diagrams/source.md:40`. |
| 5 – `align x center` | 4, in `#unsafety`, `#overflow`, `#tree` | **2** compiled lines, `#unsafety` and `#overflow`. The other two hits are German prose; `#tree` has no such line. There is no `align y center` anywhere. |
| 13b – lines carrying both `--` and `{.no-head}` | 2 (`network-security:774,775`) | **3** – also `lectures/diagrams/source.md:800`. The total of 18 is unaffected. |
| 19 – `container`/`brace` lines | 39 | **37** in the three files; the count of 39 already included the tutorial's two. |

Everything else the census checked is confirmed to the number, including item 6's
232/78/81/73 split, the 109-of-110 `unit=` census, the 150x52 median, item 9's 87
named edges, item 12's eleven `.bare` lines with all eleven line numbers, item
13b's 16+2, item 22's 20, item 23's 4, item 24's single site at
`network-security:1397`, item 30's 9 and item 31's 29.

### G1 · Item 21's step-name rule is ASCII, and the corpus is not

The proposal states item 21's migration as **zero source lines** – *"every `step`
line in the corpus is `step <one-token>`, checked"*. The one-token half is
correct. The **identifier** half is not: applying `/^[A-Za-z_][\w-]*$/` refuses
two step names in `lectures/diagrams/source.md`, `step auf-dem-gerät` (852) and
`step zurück-zur-partei` (856). Nothing about them is one-token; they are German
words with umlauts, in a lecture written in German, and no rule had ever stopped
them.

**Decided: keep the ASCII rule and migrate the two names** (`auf-dem-geraet`,
`zurueck-zur-partei`). Three reasons, in order of weight:

1. `claim()` – the rule for **element** names – is already exactly
   `/^[A-Za-z_][\w-]*$/`. A step name that admitted umlauts where an element
   name does not would be a second naming rule, which is the class of defect this
   revision exists to remove.
2. Widening the naming layer instead would **silently break the editor's
   rename**. `dgeRenameIn` builds `(^|[^\w-])(name)(?![\w-])` with no `u` flag,
   so `ä` is not in `\w` and the boundary test would split a Unicode name
   mid-token. That is a silent wrong-edit, which is worse than a refusal.
3. A step name is not a reference target – nothing in the grammar addresses one –
   so renaming the two is cosmetic in the source and changes no drawing.
   Verified: the corpus snapshot is byte-identical after the rename.

The cost is named rather than hidden: a lecture cannot label a beat in a language
that needs a diacritic. That is a real loss, it is the same loss element names
already carry, and the alternative was a rule that disagrees with itself.
