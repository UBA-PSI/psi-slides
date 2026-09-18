# PLAN: the good figure by default

Scope: the `::: draw` language (`diagram-core.mjs`), the chunk layout round a
figure (`build.js`), and the two mirrors (`lint.js`, `tails.mjs`). Nothing here
is released: 2.0.0 and the drawings sit under `[Unreleased]`, so syntax,
defaults and behaviour may still move. The maintainer's stance, which this plan
is built against: the practice a figure ends up needing should come out of the
engine by default, not out of remembering it after the slide looks wrong.

Evidence: three generations of one talk, `lectures/keynote-2036/source.md` in
the content repo (`source.md.bak-before-rework`, `source.md.bak-before-canvas`,
`source.md` – 20 `::: draw` blocks, 27 chunks, 86 frames), the two review
files beside it, the 11 contact sheets, and a scratch build of the current
deck. That build matters as a number on its own: **0 `[diagram]` warnings, lint
`ok – 0 error(s), 0 warning(s)`**, on a deck whose author still sees short
arrows, gaps that are too small, peers of unequal size and a grid row whose
cells had to be given one height by hand. The compiler's eight layout warnings
measure collisions. None of them measures composition, and composition is what
the three passes were spent on.

## 1. What the three generations teach

### The defects that recurred across all three

Every count below is `grep` over the three files.

| what the author had to write by hand | gen 1 | gen 2 | gen 3 (now) |
| --- | --- | --- | --- |
| `gap N` on a relational placement | 87 | 76 | 76 |
| `h N` on a box, zone or table | 33 | 24 | 36 |
| `w N` on a box or zone | 44 | 28 | 26 |
| `same as X` | 0 | 12 | 15 |
| `anchor tl` / `anchor bl` / `anchor left` | 2 | 36 | 37 |
| `flush left` | 25 | 14 | 14 |
| `.figure-type-NN` on a chunk | 0 | 7 | 8 |
| `.middle` on a chunk | 1 | 12 | 12 |

Read as a story: gen 1 is what an author writes from the skills alone; gen 2
is the careful pass after the review (`same as`, `anchor`, `zone`, `.middle`,
`figure-type` per chunk); gen 3 is what the canvas forced (every grid
rewritten, sizes rewritten, `hyphenate` switched). In no generation did the
count of hand-written sizes fall below 60, and the *kinds* of hand work did not
change – only the numbers in them. That is the signature of a default that is
wrong: the author keeps writing the same override.

**Short arrows.** The default `gap` on a relational placement is `0.25`
(`diagram-core.mjs` line 1651), measured in rows, and an arrowhead is 9 px
(`DG_HEAD`). On the keynote's `100x40` grid that default is 10 px – one pixel
of shaft past the head – which is why the corpus contains **zero** relational
placements without a written `gap` (166 in `lectures/diagrams`, 222 in
`network-security`, 70 in the tutorial, 14 in decoration: all written). The
author wrote `gap 0.3` on the four-box chain in `#video` (12 px on a 40-row
grid, 3 px of shaft), `gap 0.35` in `#klausur`, `gap 0.4` in `#umweg` and
`#kolloquium`, and the frames show it: in `049-video-b1.png` the arrows between
`Frage`, `30 Sekunden`, `Kamera` and `Transkript` are heads with no line. The
canvas scales the drawing to about 2.1× on the slide, so a 12 px gap is a 25 px
arrow on a 1600 px wall, beside boxes 200 px wide. In gen 1 the same row was
`gap 0.12` (7 px) – the review called them "Tickmarken". The number moved three
times; it never became a rule.

**Peers of unequal size.** `#umweg`, all three generations: `sek` at the
default width, `vor` at a written width (`w 1.1` in gen 1, `w 0.95` in gen 2,
`w 1.3` now); `Dekan` was `w 0.7` beside five peers of 132 px until the review
called it out. `#kolloquium` gen 1: `box arbeit … w 1.5 h 0.55` over
`box vortrag … w 1.6 h 0.55` – two stacked peers, two widths, both written.
`#seminar` now: `ueber w 1.0 h 0.75`, `delta w 0.7 h 0.75`. Every box in this
grammar sizes itself from its own label (`Math.max(m.w + 2 * padX + inset,
DG_MIN_W)`, line 6016), so a row of peers is unequal *by construction* and
`same as` is the only way back. Gen 2 added twelve of them. `figure-design.md`
rule 11 says "give elements of the same kind the same size, with `same as`" –
the rule is right and it is the rule that should not need a sentence.

**Box height from the label, one box at a time.** `#handbuch` gen 1:
`default box {.tone-2} w 1.5 pad 0.16` and "Antrag" (one line) beside
"Genehmigung: Vorgesetzter" (one line, `w 2.1`); gen 2 broke the label
(`"Genehmigung:\nVorgesetzter"`) and had to add `h 1.15` to the default so the
one-line box would match; gen 3 raised it to `h 1.4`. The height was written
into `default box` on 8 of the 20 blocks. A one-line box beside a two-line box
is the ordinary case, and the engine has no floor for it.

**A grid row whose cells do not share a height.** The Bauplan
(`#teil-2` … `#teil-5`, four copies of one drawing) is six `box` cells in a
`right of` / `below` chain. Row 2 holds a three-line answer, so
`z21`, `z22`, `a21`, `a22` all carry `h 4.5` while rows 1 and 3 take the
default `h 2.5` – four hand-written heights for one row, in four copies. And
in the last step `label a22 "Repariert die Form.\nSchließt damit den Fall.\n
*Kosten: Glaubwürdigkeit*\n*der Zeugnisse*"` puts four lines into a cell sized
for three; the review measured 1 px of air. The compiler knows every label a
box will ever carry at compile time (steps are static) and sizes it for the
first one only.

**Children of a zone placed by arithmetic.** `zone` landed in gen 2 and the
five zone figures still place every child against the zone's outer edge:
`at raum.left+0.82,raum.cy` (`#kolloquium`), `at haus.left+0.54,haus.top+2.0`
(`#video`), `at raum.left+0.61,raum.top+1.4` (`#klausur`),
`at raum.left+0.685,raum.top+2.0` (`#projektmesse`), `at raum.left+1.22,…`
(`#seminar`). Three-decimal offsets are the tell: the author is centring a
row inside a band by hand. `DG_ZONE_PAD` (0.33) insets the caption, not the
children.

**The figure's first beat is empty.** `027-drei-orte-b0.png` paints nothing –
`step schmerz / show schmerz` hides the only box at beat 0 – in all three
generations, and `061-seminar-b0.png` and `048-video-b0.png` are two empty
frames. Nothing warns; `--check-fit` reports fit, not ink.

### What the canvas removed

The per-slide zoom drift: heading ink height ran 25–44 px across figure
slides in gen 2 because `fitZoomToChunk` followed each figure's own box. Gen 3
rewrote every opener (`132x56` → `100x40`, `120x40`, `80x30`, `20x20`) and
every size with it, dropped `.figure-type-160` on `#der-satz` and `-130` on
`#zwei-zeiten` to `-110`, and the four Bauplan copies now share one viewBox.
That is the one change of the week that made the deck *calmer* rather than
*more correct*, and it is the model for the rest of this plan: a fixed box
that the drawing is placed in, not a box derived from the drawing.

It also cost `hyphenate: all` → `hyphenate: print` for the whole deck, because
`#die-zahl` under `.center` broke `projekt-/bakule.de` and four other words in
six lines; the fix for one centred slide was to turn hyphenation off for
twenty-six left-set ones. See 2.9.

### What only hand work removed, and which of it an engine should not need

Removed by hand and rightly so: the argument of each figure (gen 2 turned the
"Zeltdach" ring in `#umweg` into a container and one edge; `dim` on `.accent`
became `ghost`; the region idiom was unified with `zone`). That is authoring.

Removed by hand and should not have been:

- 15× `same as` – peers of one kind in one chain (2.2).
- 36× `h N` and 26× `w N` – of which the Bauplan's four `h 4.5` and every
  `default box … h` are row-height work (2.2, 2.3).
- 37× `anchor tl|bl|left` – 20 of them the same idiom, a `.left` caption under
  a figure: `text z1 "…" at haus.left,haus.bottom+0.5 anchor tl {.left}` (2.12c).
- 76× `gap` – every one, because the default is unusable (2.1).
- 12× `.middle` – on every bare figure chunk and every statement (2.12b).
- 8× `.figure-type-90|110` – five of them on the zone figures, which are one
  row too wide for the canvas and were shrunk instead of narrowed; the warning
  offered the multiplier and the author took it (2.12a).
- 4× `{.stack .bare}` – the divider heading hidden and its text redrawn inside
  the figure as `text f1 "1  Wer macht es grün?"` (2.7).
- 9× `[Klick: …]` in the four Bauplan notes – beats written as prose because
  `> note: from N` on a divider note was one thing too many (2.10).

Two things did *not* recur, and both were engine fixes from the review round:
the ragged `.left` label (`anchor` plus `dgLabelAnchorWarnings`) and `emph` on
a `.bare` cell drawing a red rectangle. That is the precedent: a defect the
review named twice became a rule and then stopped appearing.

## 2. Defaults to change

Each entry: current rule, proposed rule, why it is right by default, what it
costs the tracked lectures (`lectures/diagrams`, `network-security`,
`tutorial`, `decoration` all build today), and the override. Corpus counts are
from `grep` over those four plus `python-intro`, `spoken-talk` and
`docs/artifact/figure-rules`.

### 2.1 A gap is measured in labels, and its default clears an arrow

**Current.** `right of X` with no `gap` places at `0.25` rows
(`place.gap * uh`, lines 6217–6225). A row is whatever the opener says: 20 px
on `20x20`, 30 on `80x30`, 40 on `120x40`, 72 on the default grid. The same
`gap 0.4` is 8 px, 12 px, 16 px or 29 px depending on a number in the opener.
An arrowhead is 9 px.

**Proposed.** Two rules. (a) The default gap is **one base label**
(`DG_FONT × DG_LINE_H` ≈ 19 px) for an unjoined pair and **1.6 labels** (30
px: a 9 px head plus 21 px of shaft) for a pair an `edge` joins, decided after
the edges of the block are read – the compiler already builds a dependency
graph before placing. (b) A written `gap` stays the author's number, and an
edge whose *exposed* run – the part not under either endpoint – is shorter
than 1.5 labels warns `edge-short`, naming both ends, the run in px, and the
`gap` that would clear it. Not pushed apart: a `gap` the author wrote is a
number other elements are chained off, and moving it silently moves them.

**Why right by default.** A gap is a clearance, the skill already says its
ruler is "square", and a clearance that depends on the opener is not one an
author can learn. The only figures in the corpus that want a gap below an
arrowhead are `gap 0` rows drawn as one bar, and those have no edge between
the members.

**Cost.** Nothing moves: there are 0 relational placements without a written
`gap` in the four tracked lectures (2 in `figure-rules`, both texts). The
`edge-short` warning would fire on the keynote's `#video` (12 px), `#klausur`
(14 px) and `#umweg` (12 px) rows – every one a defect the maintainer named –
and needs a corpus run to see whether a tutorial specimen trips it.

**Override.** `gap N`, as today. `gap 0` stays legal and stays quiet when no
edge joins the pair.

### 2.2 Peers share one size

**Current.** Every `box` sizes itself from its own label; `same as X` copies
another's size; `default box w/h` sets a floor for the block. A chain
`b right of a`, `c right of b` is three widths and, with one two-line label,
two heights.

**Proposed.** A **chain** – the boxes of one kind reached from each other by
`right of` / `left of` / `below` / `above` in one axis, or by a shared
reference (`below s3` off a chain member) – shares one size: the maximum
width and the maximum height any member measures, *over every label a step
will give it*. A written `w` or `h` on a member is the member's own; a
written `w`/`h` on any member of the chain with no `same as` elsewhere is
taken as the chain's, so `box a "…" w 1.5` at the head of a row does today's
`same as a` for the rest without the words. A `default box w/h` remains the
floor. Sizes are resolved after measurement and before placement; the
topological walk already exists and only the measure step moves before it.

A `row a, b, c` / `col a, b, c` statement is the explicit form for peers that
are *not* chained (three boxes placed against three different zones) and is
also the answer to "which of these is the set" when a chain is ambiguous. It
is `align` with a size in it, and it belongs beside `align` and `spread` in
`DG_KEYWORDS`.

**Why right by default.** Rule 11: "relative size reads as importance … the
usual reason it is wider is that its label happened to have more letters".
The exception (a box that really is bigger) is the one that should cost a
word. And the `label` in a step that overflows its cell (`a22`, four lines
into three) stops being possible, because the cell was sized for it at beat 0.

**Cost.** This is the one change in the plan that moves the corpus visibly.
`lectures/diagrams` writes `same as` 54 times, `network-security` 71 times,
the tutorial 26, decoration 2 – those are unchanged (an explicit `same as`
still wins). Chains *without* `same as` grow to their widest member:
`network-security` has 63 boxes with a written `h` and 17 step labels with
`\n`, so a figure there will show a box that is taller at beat 0 than it used
to be. Rebuild the three tracked lectures and read the sheets; the figures
that change are the ones rule 11 says were wrong. The catalogue figures in
`lectures/diagrams#look` that show a single box are one-member chains and do
not move.

**Override.** `w`/`h` on the member; `{.own}` on a box (a new word in the
size slot) to leave the chain; `frame none` decks are not exempt, because this
is about the drawing, not the canvas.

### 2.3 A box is at least as tall as its neighbours' lines

Covered by 2.2 for chained peers. The one case left: an unchained one-line
box beside a two-line one (a `note` beside a `koll` placed against a zone).
**Proposed.** `DG_MIN_H` = two lines at the box's font, applied to a `box`
whose label is one line **and** which stands in a block where another box of
the same kind has two – the block's line count, not a global floor, so a
figure of one-liners stays as flat as it is. **Cost.** One-line boxes in
mixed figures grow by one line height; the corpus has them in `diagrams` and
`network-security`, and the ink edge and canvas absorb the growth. **Override.**
`h N`, or `.snug` (one word, size slot).

### 2.4 Padding relative to type

**Current.** `DG_PAD_X = 13`, `DG_PAD_Y = 9` px, whatever the box's font.
`.large` text sits in the same 13 px a base label gets; `.small` gets more air
than its letters are tall.

**Proposed.** Padding is `0.85em × 0.6em` of the box's own font, which is
exactly 13 × 9 at `DG_FONT = 15`, so the base case is byte-identical – the
same construction `DG_ROW_H` already uses ("the factor is exactly 1 and every
existing table draws the same bytes"). `pad N` in rows stays the override.

**Cost.** Only boxes carrying `.large`/`.small` move (2 in `network-security`,
0 elsewhere in the tracked lectures; the keynote's `.large` tables carry
`pad 0.04` written by hand for this reason). **Override.** `pad N`.

### 2.5 An edge label on a straight run gets its ground

**Current.** `.paper` on an edge is opt-in; `dgLabelGroundWarnings` reports a
ground that covers an elbow's exposed run.

**Proposed.** A label on a **straight** edge between two facing elements gets
the paper knock-out by default – the skill already calls it "the right form"
there. On an `.elbow` the label defaults to `side top` of the rail, where
the ground is not needed and the route stays visible. The ground slot on an
edge gains `none`.

**Cost.** Straight labelled edges without `.paper`: 17 minus 5 in `diagrams`,
15 in the tutorial, 21 minus 4 in `figure-rules`, 0 in `network-security`. Each
gains a knock-out behind its word – the line stops under the label instead of
running through it. Visible, in the direction rule 6 asks for; rebuild and
read. **Override.** `{.none}` in the ground slot, or `side top`.

### 2.6 A zone has an inner band, and children are placed in it

**Current.** `zone name at X,Y w W h H "Label"` with `w`/`h` required; the
caption is inset by `DG_ZONE_PAD`; children are placed against the zone's
outer coordinates and an author subtracts the caption and the padding by
hand (`raum.left+0.685`).

**Proposed.** Three things. (a) A zone exposes its **inner** box – below the
caption, inside the pad – and a child placed `in raum` lands at the inner
top-left plus the default gap; the next `right of` chains from there. The
zone's scalar anchors (`raum.left`, `raum.top`) stay the outer edge, because a
frame line is what an author aims a caption at. (b) `w`/`h` become optional:
a zone written without them **wraps its children** plus the pad and the
caption, like a `container`, but keeps its own ground and caption and is
drawn under its members – which is the unification finding 6 of the first
review asked for. A zone with `w`/`h` is fixed, as today. (c) A `row`/`col`
of children inside a zone is centred in the inner band unless `flush` says
otherwise, so the three-decimal centring goes away.

**Cost.** Additive. Every zone in the corpus carries `w`/`h` (the keyword is
newer than the tracked lectures' figures; 10 in the keynote, 0 tracked).
**Override.** `w`/`h` as today; `at` on a child as today.

### 2.7 A stacked divider keeps its heading as a heading

**Current.** `# Heading {.stack}` sets the heading as a 1.35em `--ink-soft`
caption over the figure; `{.stack .bare}` takes it off. The keynote wrote
`.bare` on all four and redrew the heading inside the figure
(`text f1 "1  Wer macht es grün?"`).

**Proposed.** Under `.stack` the heading is a chunk heading – the same size
and edge a `## free:` heading gets on a `.full` chunk – and the figure stands
under it on the `.full` canvas it already has. A part then opens on a titled
figure with no second copy of the title. `.bare` stays for the author who
draws the title into the figure.

**Cost.** `lectures/decoration` has 4 stacked dividers (commits `3a6bda0`,
`ab79364`); their captions become headings and the sheet moves. Nothing else
in the tracked set uses `.stack`. **Override.** `.bare`, or a new `.quiet`
word in `COLUMN_SLOTS` for the caption treatment.

### 2.8 `::: dock` alignment

No keynote evidence – the deck has no dock. The changelog's dock work made
the column a share of the slide (28/37/46 %) and its air 3.5 % of the width;
what it does not say is whether a `left` dock's text edge and the chunk's
heading edge under `headings: left` are one line. **Proposed** as a
measurement first: build `lectures/decoration` (which has the inherited
`.every` dock) with `--frames` and read the left edges; if they differ, the
dock's inner padding is set to the slide's text gutter rather than
`--dock-gap`. One hour to answer, and not a default change until answered.

### 2.9 `hyphenate: all` leaves centred prose and addresses alone

**Current.** `all` hyphenates every `p, li, blockquote, figcaption` in the
live views except headings, statement lines, footnotes and `a[href^=http]`
(build.js line ≈13660). A `.center` chunk under `all` breaks
`projekt-/bakule.de` and four words in six lines (`#die-zahl`, gen 2), and
the deck's answer was `print` for everything.

**Proposed.** Under `all`: `[data-center]` chunks, `.wrap-balance` text and
`::: cards` terms take `hyphens: manual`; and a token that looks like an
address (`\S+\.(de|org|com|net|edu|…)\b`, a DOI, a path) is wrapped by the
build in a `.nobreak` span so the dictionary never sees it. The limit for
the projection goes from `6 3 3` to `8 4 4`; print keeps `6 3 3`.

**Why.** Centred ragged text is shaped by its line ends; a hyphen there makes
a diamond. `hyphenate: all` is otherwise the right setting for a German deck
with 26 left-set slides, and the author should not have to choose.

**Cost.** Decks under `all` with centred prose lose hyphens there (none of
the tracked lectures set `all`). **Override.** none needed; `none` and `print`
as today.

### 2.10 `[Klick …]` in a note is a beat

**Current.** A `> note:` block is one card set per chunk; `> note: from N`
pins a block to an advance. The keynote's four divider notes carry nine lines
of the form `[Klick: Zeile 1 wird hell.]` and no `from N` at all – the beats
are in the prose, and the cockpit shows every card at beat 0.

**Proposed.** In `cue-cards.mjs`, a paragraph that is only a bracketed line
whose first word is in a per-language list (`Klick`, `Click`, and the bare
`>`) ends the card **and counts an advance**: the cards after it are
`from N+1`, N counted from the block's own `from` or from the last marker.
`noteSegments()` in the parser gets the same rule so `note-in-empty-beat` and
the cockpit agree, and the marker line itself becomes the card's title if the
card has none ("Zeile 1 wird hell").

**Cost.** Zero for a deck without such lines; the word list is a `STRINGS`
entry so `lang:` picks it. **Override.** write `from N`; a bracket that is a
stage direction (`[Pause.]`) is not in the list and stays prose.

### 2.11 `statement:` with a quiet line

**Current.** A `statement:` chunk is the heading plus paragraphs, all at
`--statement-size`, 600 weight, ink colour. The `| sub-heading` slot still
renders as `.hd-sub` (HANDOFF, open). `#der-satz` – the thesis of the talk –
is therefore a `::: draw` of two `text` elements: a `.muted .ghost`
definition above and a `.large .bold` sentence below, the definition arriving
at beat 1 *above* the sentence, so the loud line is set in the figure sans at
46 px against 80 px serif on `#schluss`.

**Proposed.** Two registers in a statement. (a) A paragraph set entirely in
`*italic*` is the **quiet** line: `--ink-soft`, half the statement size, the
prose face, no weight. (b) The chunk class `.lead` stacks quiet lines
**above** the loud ones regardless of source order and reserves their space
from beat 0, so a quiet line that arrives on a later `---` fades in above
without moving the loud line – exactly `#der-satz`'s two beats, in four lines
of Markdown and no figure. The `| sub` slot on a statement is refused
(`statement-sub`) rather than left to `.hd-sub`, since (a) is the spelling.

**Cost.** Additive; `lectures/spoken-talk` and the keynote's three statements
have no italic-only paragraph. **Override.** none needed.

### 2.12 Found on the way

**a. Per-chunk `figure-type` is being used as an overflow fix.** Five of the
eight `.figure-type-90` chunks are the zone figures, each one row wider than
the canvas; the `figure-overflows-canvas` message offers a `frame WxH` and the
author reached for the multiplier instead. Change the message order: first
"one row too wide – 4 boxes at this width fit, you have 5", then the frame,
and never the multiplier. `--check-fit` should print the deck's spread of
per-chunk multipliers as its unevenness number. One hour.

**b. `.middle` is the default for a chunk that is a picture.** 12 of the
keynote's 27 chunks carry it: every bare figure chunk and every statement.
Proposed: a chunk whose body is one `::: draw` and no prose, or a
`statement:`, frames what its beat paints (`.middle`) by default; a chunk
with prose keeps top anchoring, because prose grows downward and a reader
expects the heading to stay. The cost the changelog names – a camera glide
per press – is the cost of a figure that reveals, and it is the right one for
a figure slide. Cost to the corpus: every bare figure chunk in the tutorial
(5 `.middle`/`figure-type` mentions already) and `diagrams` re-frames; the
`figure:` type chunks in `diagrams` are prose-plus-figure and stay. Override:
`.top`, a new word in `CHUNK_SLOTS.middle`.

**c. `.left` on a free text is an anchor.** 20 of the keynote's 37 `anchor`
words are the caption idiom `at X.left,X.bottom+0.5 anchor tl {.left}`. The
skill records that `.left` "aligns the lines inside the element's own box and
the box stays centred on its `at`", and that this "is what makes it
invisible". Proposed: a `text` carrying `.left` with no written `anchor` is
anchored on its left edge (`.right` on its right); `anchor center` is the way
to say the old thing. This retires `dgLabelAnchorWarnings` and lint's
`diagram-ragged-labels`, which were the band-aid for this. Cost: `.left`/
`.right` free texts placed with `at` and no anchor shift by half their width –
2 in `diagrams`, 18 in `network-security`, 2 in `python-intro`, 0 in the
tutorial and decoration (relational placements with `flush` are unaffected,
because `flush left` already puts the ink on the edge). Read the 18 in
`network-security` before flipping it; if most were meant as anchors, the
change is a repair there too. Override: `anchor center`.

**d. An empty beat warns.** A beat at which a figure paints nothing – every
element hidden – is `empty-beat`, a compiler warning with the step name; the
first beat of `#drei-orte`, `#video` and `#seminar` are three frames of paper
in a keynote and nothing said so. One hour; no lint mirror possible.

**e. A table can share columns with another.** `#vorgang` writes
`col 1.7,2.0,0.12` twice so two stacked tables line up. `same as vg` on a
table copies the columns (rows are its own). One hour.

**f. A step `label` that lengthens a box is sized for at beat 0.** Folded
into 2.2 – said again here because it is the single rule that makes
`a22`'s fourth line impossible to overflow.

## 3. Warnings that should become defaults, and defaults that should stay warnings

The compiler's layout warnings today: `dgOverlapWarnings`,
`dgLabelGroundWarnings`, `dgLabelClipWarnings`, `dgLabelAnchorWarnings`,
`dgElbowRailWarnings`, the off-axis edge (line 7107), and build.js's
`figure-overflows-canvas`, `figure-underfills-canvas` and `figure-type-small`.

**Band-aids – a warning standing where a default should be:**

- `dgLabelAnchorWarnings` and lint's `diagram-ragged-labels` → 2.12c. Once
  `.left` anchors, the geometry they detect cannot arise; both retire.
- `dgLabelClipWarnings` (a label between two boxes wider than the paper
  between them) → 2.1. With a joined pair's default gap computed after the
  edges are read, the default gap for a *labelled* edge is the label's width
  plus two pads. The warning stays only for a written `gap` that is too small.
- `dgElbowRailWarnings` (a rail on a seam of a `gap 0` row) → 2.1 makes it a
  written-`gap 0` case only; keep, it is cheap and names the fix.
- The off-axis edge ("runs 0.5° off the axis – its endpoints are probably
  boxes of different heights") → 2.2. Peers share a height; the warning
  stays for the case a written `h` produces.

**Stay warnings, because intent is not decidable:**

- `dgOverlapWarnings` – a zone drawn under its children *is* an overlap by
  design (2.6 exempts a zone's members, as the container already is).
- `figure-overflows-canvas` / `figure-underfills-canvas` – the drawing's
  content is the author's; reword per 2.12a.
- `figure-type-small` – a figure with no canvas has no other guard.
- `dgLabelGroundWarnings` – after 2.5 it fires only for a written `.paper`
  on an elbow, which is the case it was built for.

**New warnings this plan adds:** `edge-short` (2.1), `empty-beat` (2.12d),
`statement-sub` (2.11, a refusal). Three in, two out.

## 4. Lint mirrors and tests each change needs

`lint.js` imports tables from `diagram-core.mjs` and `tails.mjs`, never a
function, so anything that needs a laid-out figure cannot be mirrored and must
say so in the skill (the canvas warnings set the pattern).

| change | diagram-core | tails.mjs | lint.js | gates | browser specs | docs |
| --- | --- | --- | --- | --- | --- | --- |
| 2.1 gap in labels, `edge-short` | default at 1651, joined-pair pass, new warning | – | – (geometry) | `semantics` fixture: chain with and without an edge, px asserted; `refusals` untouched | `figure-labels` rerun | figures skill "Six traps" → seven; `figure-design.md` rule 1 loses its `gap 0.25` example |
| 2.2 chains share size, `row`/`col` | measure-before-place, chain detection, `.own`, `DG_KEYWORDS` | – | `diagram-statement` accepts `row`/`col`; `diagram-class` for `.own` | `semantics`: chain of 1/2/3-line labels; `step-classes`: step `label` sizes at beat 0; `corpus` | `figure-prominence`, `editor-placement` (the editor writes `same as`; it now writes nothing for a chain member) | skill slot table; rule 11 rewritten |
| 2.3 two-line floor | `DG_MIN_H`, `.snug` | – | `diagram-class` | `semantics` | – | skill |
| 2.4 em padding | `DG_PAD_*` derived | – | – | `semantics`: base bytes unchanged, `.large` box grows | – | skill |
| 2.5 label ground | edge default, `none` in ground slot | – | `diagram-class` | `semantics`, `refusals` for `.paper .none` clash | `figure-labels` | rule 6, skill |
| 2.6 zone inner band | `in` placement, optional `w/h`, wrap | – | `diagram-zone` (w/h optional), `diagram-placement` (`in`) | `refusals` (zone without w/h and without children), `semantics` | `editor-guides` (zone box in the guide layer) | skill zone section |
| 2.7 stack heading | – | `COLUMN_SLOTS` `.quiet` | column tail via `parseTail` – automatic | `tails`, `frontmatter` unaffected | `camera-fit` (divider), rebuild `decoration` + commit two views | decoration skill |
| 2.8 dock edge | – | – | – | – | `dock.mjs` measures left edges | decoration skill |
| 2.9 hyphenate | – | – | – | `inlined` (new regex, backslashes doubled) | `squint` or new `hyphenate.mjs`: centred chunk has no soft hyphen | appearance skill |
| 2.10 `[Klick]` beats | – | – | `noteSegments` mirror, `note-in-empty-beat` | `cue-cards` gate: marker counts an advance | `cue-cards.mjs` spec: cockpit card N appears at beat N | authoring skill, `PLAN-cue-cards.md` §2, `STRINGS` |
| 2.11 statement registers | – | `CHUNK_SLOTS` `.lead` | `statement-sub` refusal mirrored | `frontmatter`/`tails` for the slot | `settings.mjs` fixture pair (refusal in both files); `block-align` for `.lead` stacking | authoring skill |
| 2.12b `.middle` default | – | `CHUNK_SLOTS.middle` gains `top` | – | `tails` | `camera-fit`: bare figure chunk opens centred; rebuild three tracked lectures | authoring skill, changelog |
| 2.12c `.left` anchors | text anchor default; retire `dgLabelAnchorWarnings` | – | retire `diagram-ragged-labels` | `semantics`; `corpus` over `network-security` | `figure-labels` | skill "Six traps" → five |
| 2.12d `empty-beat` | new warning | – | – | `step-classes` | – | skill |
| 2.12e table `same as` | cols copy | – | `diagram-table` | `semantics` | – | skill |

Every row that changes a byte of a tracked lecture's output ends with
rebuilding `lectures/tutorial`, `lectures/diagrams` (`frame none`, so 2.1–2.5
still reach it) and `lectures/decoration`, and committing the views, or
`release.yml` fails on the stale-output check. `docs/artifact/refresh-figures.mjs --check`
will drift on 2.1, 2.2 and 2.5; rerun it. `dgCharW` is not touched by any row.

## 5. Order

By slides of a real talk fixed per line of engine change. "Hour" and "day"
are size classes for one agent, not a schedule; the two `day` items share
`diagram-core.mjs`'s placement walk and run one after the other, the rest can
run beside them.

1. **2.1 – gap in labels, arrow-safe default, `edge-short`.** Hour. Touches
   one constant and one pass; 0 corpus placements move; every short arrow in
   the keynote is named. The single largest lever on the maintainer's list.
2. **2.2 (+2.3, 2.12f) – chains share size; `row`/`col`.** Day. The measure
   step moves before placement and chains are detected; this is the one
   change that needs the three sheets read afterwards. Removes 15 `same as`,
   most of the 36 `h` and the four-copies-times-four `h 4.5` from the keynote,
   and makes the overflowing step label impossible.
3. **2.12c – `.left` anchors; retire two warnings.** Hour of engine, plus the
   18 `network-security` texts to read. Removes 20 of 37 `anchor` words.
4. **2.12b – `.middle` default for picture and statement chunks; 2.7 – the
   stacked heading is a heading.** Hour each; both are CSS and a slot word.
   Removes 12 `.middle` and 4 `.bare`, and the redrawn title in four figures.
5. **2.6 – zone inner band, optional `w/h`.** Day. Five keynote figures lose
   their three-decimal arithmetic; the zone/container split closes.
6. **2.10 – `[Klick]` beats.** Hour in `cue-cards.mjs` and `noteSegments`;
   nine beats in the keynote start working in the cockpit.
7. **2.11 – statement registers and `.lead`.** Hour of CSS plus a refusal;
   `#der-satz` stops being a drawing.
8. **2.9 – hyphenate leaves centred prose and addresses.** Hour. Lets the
   deck go back to `all`.
9. **2.5 – label ground by default; 2.4 – em padding.** Hour each; visible on
   the tutorial and `diagrams`, both in rule 6's direction.
10. **2.12a, 2.12d, 2.12e – message order, `empty-beat`, table `same as`.**
    Hour together.
11. **2.8 – dock edge.** Hour to measure; a change only if the measurement
    says so.

After 1–5 the keynote's source should lose roughly a third of its figure
lines (the `same as`, `anchor`, `h`, `.middle`, `.bare` rows counted in §1)
and build with the same 0 warnings – which is the test of the plan: a deck
written the short way should look like the deck written the long way.

## 6. What the spacing pass reported

The pass that set every gap, shaft and peer size in the keynote by hand
(twenty figures, all inside their canvas, zero warnings) listed where the
engine made it harder than it should be, ordered by time cost. It confirms
§2 from the other side and adds five items.

1. No way to say "a row of peers: one size, one gap" (§2.2 – the largest
   lever).
2. `same as X` copies width and height together; a one-line box beside a
   two-line one wants the neighbour's height and its own width – `same h as`
   / `same w as`, and `same h as` on a `zone`, which requires both numbers
   today and so cannot take it at all.
3. A written `h` too small for its label is silent, where a written `w` warns
   – `#drei-orte` shipped with the text inside the padding.
4. A visible shaft is not expressible: the head eats ~7.65 units of every
   `gap`, a number from no document (§2.1 fixes the default; document the
   head length either way).
5. The label-height is the deck's real unit of spacing and is not addressable
   – a `lh` suffix on `gap` and `pad`.
6. No per-figure slack report: `--check-fit` speaks only past the canvas; a
   line per figure with canvas, drawing and slack per axis is information the
   build already has.
7. The canvas height cannot be traded against the chunk's own caption lines
   (§2 has no item for this: a figure chunk with four lines of prose under
   the drawing has the same 16 labels as one with none).
8. Two zones cannot be declared as one row (see 2).
9. A container's `pad` is invisible to anything placed against its members –
   a text hung off a member lands inside the container's edge with no
   warning, because a container is outside the overlap census.
10. A written table `row` below the type's own line height is silent.
11. Placing a row inside a zone is y-arithmetic by hand (§2.6, `in zone`).
12. A label made of two texts (a question over a verb) cannot be centred on
    a cell as one block: each text is anchored to the cell's centre line, so
    a two-line question over a one-line verb stands a half-line too high and
    the author moves the split by hand (`cy+0.5` / `cy+0.7`). A `stack` of
    texts, or a text with two registers (`"question\n~verb~"` with the
    second line in the small muted register), would centre as one.
