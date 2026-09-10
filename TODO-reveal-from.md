# A reveal segment should take `from N`

`::: overlay … from N`, `::: dock … from N` and `> note: from N` all pin a thing
to a numbered advance. A `---` cannot. It should be able to, spelled the same
way:

```md
--- from 2
```

## What is wrong today

**Beats are document order, and there is no way out of it.** `chunkBeats` walks
`.reveal-segment`, `svg.psi-diagram` and `.beat-mark` in one
`querySelectorAll` pass, so the order a beat arrives in is the order it was
written. That is right nearly always, and it is exactly wrong when two things
that should arrive *together* are written in two different places on the slide –
which is what any two-pane layout is.

**The case that produced this** is `lectures/python-intro` `#scanner-pipeline`:
a `::: draw` with three `step` blocks in pane A of a `::: side`, and three
paragraphs in pane B, one per phase of the run. What the slide wants is
paragraph 1 with figure beat 1, paragraph 2 with beat 2, paragraph 3 with beat
3 – three presses, each moving both halves. What it does is three figure steps
*then* two prose beats: five presses, and the prose arrives after the figure has
already finished.

There is no way to write the wanted version. A block cannot straddle two
segments, so the figure and the prose cannot be one block; and the panes are
what puts them side by side in the first place.

**The workaround that shipped in that lecture** is to give the prose no beats at
all: the figure carries the pacing and all three paragraphs stand on the slide
from beat 0. It reads acceptably, and it gives away all three phases before the
first one is spoken.

`::: overlay {…} from N` is the near miss worth naming, because it looks like
the answer and is not: it does put a block on an arbitrary beat, but an overlay
lies *over* the slide in its own 3×3 grid, so it cannot put a paragraph into the
right-hand pane of a `::: side`.

## Why this is small

**The runtime already has the concept.** A beat record in `chunkBeats` already
carries `at`, and everything downstream already reads it:

| | |
|---|---|
| `push()` in `chunkBeats` | gives a positional index only to a beat with no `at`, so the two families already coexist in one list |
| `countSegments` | `n = Math.max(n, b.at + 1)` |
| `applyReveal`, `type: 'mark'` | `const shown = b.at != null ? consumed >= b.at : on` |

Today `at` is set in exactly one place: a `.beat-mark` inside `FROM_SEL` – an
overlay or a dock that is itself held to a beat – where it is *computed* from the
container's `from` plus the marker's index among its siblings. Nothing sets it
from a number the author wrote. So most of this feature is plumbing a written
number into a field that is already read.

**It is additive.** All seven sites that recognise a reveal test
`line.trim() === '---'` exactly (`build.js:3103, 3492, 3613, 3802, 3862, 3907`
and `lint.js:3190`), so `--- from 2` is not a separator today, and nothing in
`lectures/`, `docs/artifact/` or the sibling content repo writes a `---` with a
word after it. No existing `source.md` can change meaning.

## What would have to move

- **The parser, nested.** `build.js:3907` writes the constant `BEAT_MARK`
  (`'<div class="beat-mark"></div>'`). With a number it becomes a function of
  it: `data-from="2"` on the marker.
- **The parser, top level.** `flushChunk` splits the body at each `---`
  (`build.js:3103`) and emits `.reveal-segment` divs that carry no attribute at
  all. A pinned one needs `data-from` on the segment.
- **Those seven `=== '---'` sites.** Seven hand-written copies of one test is
  the shape `tails.mjs` exists to fix. Read the line through **one** reader that
  answers *is this a reveal, and what beat is it pinned to*, or the next person
  adds an eighth.
- **`chunkBeats`.** Set `at` from `data-from` for both node kinds. The existing
  overlay computation is the collision: inside an `::: overlay from 3`, a
  marker's `at` is already derived. Decide whether a written number wins there
  or is refused – see the open questions.
- **`applyReveal`, the `seg` branch.** The `mark` branch already handles `at`;
  the `seg` branch does not – it tests `i < consumed` only, and would need the
  same two lines for `shown` and `next`.
- **`FROM_SEL`.** `CLAUDE.md` is explicit that it is the one selector for
  everything held to a beat by `from N`, and that "a fourth reader spelled by
  hand is how two windows disagree about what arrives when". If a segment or a
  marker can carry `data-from`, that selector has to be part of the change
  rather than an afterthought.
- **`lint.js`.** A `reveal-from-beyond` warning beside the existing
  `overlay-from-beyond` and `note-from-beyond`, and a re-read of
  `note-in-empty-beat`, whose rule about where a note stands assumes the
  segments are in source order.
- **`--squint`.** It marks what arrives on a later beat with `+N` and reads the
  rendered page rather than the source, so it ought to follow for nothing –
  worth confirming rather than assuming.

Unaffected: diagram `step` blocks stay positional, `revealed[chunkId]` stays the
only synced state, and the editor never sees any of this.

## Open questions, which are the actual work

1. **Does a pinned top-level segment reserve its space?** This is the one that
   decides whether the feature is worth having. A top-level `---` closes up –
   the chunk grows on each press – while a nested one keeps its box so the slide
   does not jump. A segment pinned *out of document order* has to reserve, or
   the words below it move every time an earlier beat fires. Reserving is almost
   certainly right, and it is what an overlay and a dock already do; but it
   means a top-level `---` means one thing with a number and another without,
   which is a second rule to learn.
2. **Inside an `::: overlay from N`, who wins?** The container already derives
   `at` for its markers. Refusing a written `from` there, naming the container's
   own, is cheaper than defining an interaction and is probably right.
3. **Nothing else needs deciding.** A `--- from 1` written after a `--- from 3`
   is fine and is the point of the feature; unnumbered beats interleaved with
   numbered ones are already handled, because `push()` counts positions over the
   unnumbered ones alone.

## Cheaper thing to do first, if this is not built

Say in the `psi-slides-authoring` skill, under *Beats below the top level*, that
beats are **document order and only document order**, so two panes cannot be
made to advance together. The skill currently shows the six-beat walk through
two panes and a card row, which reads as though the order were arrangeable. It
is not, and finding that out costs a rewrite of the slide.
