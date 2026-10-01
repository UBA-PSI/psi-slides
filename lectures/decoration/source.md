---
title: Slide Decoration
subtitle: What a slide can carry besides a column of text
presenter: Dominik Herrmann
affiliation: Otto-Friedrich-Universität Bamberg
contact: https://github.com/UBA-PSI/psi-slides
notice: The four views are built from this one file.
closing-credits: contact
cover: quote
cover-align: middle
section: outline
section-mark: Part
theme: light-blue
collapse: none
auto-fit: true
draw-defaults: |
  # Shown rather than described: a divider of six small boxes and two
  # specimen drawings on prose slides. The talk's figure canvas would reserve
  # a figure box for each and call them empty; this deck declines it like
  # lectures/diagrams does. A keynote wants the default.
  frame none
---

## title: {#cover}

A slide is a frame, and the frame can carry more than a column of text.

## outline: What this lecture shows {.wide #agenda}

Every way psi-slides has of decorating a slide, each one used on the slide that
describes it – and, in the last part, the settings that set the type and the
colours of a whole lecture.

## free: Read each slide beside its source | the slide that describes a construct uses it {.standard #preview}

**Each slide in this lecture uses the construct it describes, so its chunk in
`source.md` is a working example of that construct.** Find the heading you see
on the slide in the source, and the lines under it are what drew the slide.

**Build the lecture with `--watch` and change one of those lines**: the open
views reload on every save, which is the quickest way to learn what a word in
a card row's braces or a backdrop's `reveal` does.

# The cover, and the slide that closes it {#covers}

> All ten covers are in the
> [gallery](https://uba-psi.github.io/psi-slides/decoration.html#covers), each
> shot from a real build. This deck wears `quote`.

## free: Ten ways to open a lecture {.wide #cover-list}

**`cover:` in the frontmatter picks one of the ten below**, ordered by how
loudly the opening slide announces itself rather than alphabetically.

::: cards 3 {.small}
- **classic**\
  the lower-left third, all text. The default
- **masthead**\
  a nameplate on top, credits under a rule at the foot, a paragraph between
- **stack**\
  the title block centred on both axes
:::

::: cards 3 {.small}
- **display**\
  the title set to fill the slide
- **panel**\
  the words in the page colour on a full field of the theme's accent
- **quote**\
  the talk opens on a claim, and the title is the attribution under it
:::

::: cards 4 {.small}
- **split**\
  text on the left, the picture running off the right edge
- **hero**\
  the picture is the slide, the words at its foot over a dark gradient
- **beside**\
  the picture inset to the right of the title
- **above**\
  the picture on top, the title centred in the band below
:::

A name and a sentence carry the idea; they do not carry the shape it makes. Each
of the ten is shot from a real build in the
[gallery](https://uba-psi.github.io/psi-slides/decoration.html#covers).

## free: Four keys the cover reads {.wide #cover-keys}

**`cover-image:`** names the picture, and four of the ten draw one: `split`,
`hero`, `beside` and `above`. On the last two it is only the fallback – they
take whatever you write under the `## title:` heading, so a `::: draw` can be
the cover.

**`cover-ratio:`** is how much of the slide the picture takes, as a percentage
between 15 and 75. Only the three that divide the slide read it – `split`,
`beside` and `above`. A percentage and not a `W:H` ratio: the shape of the
frame comes from the projector, and this splits it.

**`cover-align:`** puts the block of text at the `top`, the `middle` or the
`bottom`. The seven compositions that leave the block any freedom read it.

**`cover-ground:`** is `paper` or `ink`: `ink` opens a light deck on a dark
slide with no photograph behind it. A backdrop's own scrim wins over it.

Set `cover-ratio:` or `cover-align:` on a composition that has already settled
the question and the build stops with an error rather than ignoring the line.
`closing-image:` is the closing slide's counterpart of `cover-image:` – see the
closing slide below.

## free: `quote` draws no quotation mark {.standard #cover-quote}

A sentence set alone on a slide with a name under it **already reads as a
quotation**, so there is no mark: no hanging curly quote, no glyph behind the
words, no rule beside them.

The claim is what you write under the `## title:` heading. A `quote` cover
without one fails the build.

## free: The credit block has four ranks | who is talking, where, and how to reach them {.wide #credits}

**`subtitle:` is the line that says what the talk is about, and four more keys under `title:` are set at four different weights, because they do four different jobs.**

```yaml
title: How Caches Forget
subtitle: Eviction, Staleness and the Cost of Being Wrong
presenter: Jana Wieland
affiliation: Otto-Friedrich-Universität Bamberg
contact: uni.example/ds
notice: Slides go up on Friday.
info: |
  Distributed Systems · Lecture 7 · Room WE5/00.019
```

::: rows {.clear}
- **`presenter:`** your name, set apart from everything under it
- **`affiliation:`** the institution, quieter, directly beneath the name
- **`contact:` / `notice:`** one row along the foot – the address flush left, the notice flush right and in italics
:::

A presenter and an institution *introduce the speaker*; an address and “the slides go up on Friday” *answer the room*. That is why the last two share a row instead of stacking. `info:` keeps the date, the room and the course line, as many lines as you give it.

## free: The last slide closes the arc {.wide #closing-tag}

**`## closing:` draws the last slide in whatever composition `cover:` names**,
so the room sees the shape the lecture opened with.

What it carries is different: your own heading, sub-heading and text. The
presenter line and the `info` block stay off it by default, because the room
learned who is talking and where an hour ago. `closing-credits: contact` brings
back the row along the foot – this lecture sets it, so its last slide carries the
address – and `cover` brings back the whole credit block. `closing-image: cover`
ends the deck on the picture it opened with; any other value names a different
one.

# Dividers carry their own slide {#dividers}

> note: A `> note:` written under a `#` heading belongs to **the divider**, not
> to the first slide of the part. This one is the prompt for the photograph you
> are standing in front of right now: say what the part is for before the first
> slide of it arrives.

::: backdrop dusk {.cover .invert}

## free: Six treatments, every one quieter than the cover {.wide #section-list}

A divider has **one job: to say that a new part starts here, and that it is part
of the thing you are already in.** One that can be mistaken for the title slide
has failed at it.

::: cards 3
- **plain**\
  the heading alone. The default
- **tinted**\
  the whole slide takes the theme's accent at 12%. The ten-metre signal
- **rule**\
  the heading between two rules. The one that survives a monochrome print
:::

::: cards 3
- **card**\
  the heading on a panel, in the vocabulary the card rows use
- **number**\
  a large counter above the heading, which steps the heading back
- **outline**\
  the running agenda: every part listed, this one live. Used here
:::

The six are in the same
[gallery](https://uba-psi.github.io/psi-slides/decoration.html#dividers) as the
covers, under the same rule: a deck settles on one and wears it at every
part.

## principle: What a running agenda says that a coloured field cannot {.standard #outline-why}

**Which part starts, out of how many, and how far into the hour you are.** The
room meets the same list four or six times and learns the shape of the lecture
from it.

That only works while the list stays the same from divider to divider, so the
heading is the live item in the list rather than a second copy set beside it.

## free: Three states, two greys {.standard #outline-states}

The live part is set **larger and in full ink**; the parts before and after it
recede. What carries progress is where the live item sits as it walks down the
list, so the recession only has to say *not this one*. The live part is a size
and not a third shade: two greys read from the back of a room, three do not.

`section-mark:` puts a short word over the heading. This lecture writes `Part`.
Write nothing and nothing is drawn there.

## free: The lines under a `#` heading are the divider's slide {.wide #divider-body}

Whatever you write between a `# Heading` and the first `##` heading under it
**becomes the divider's slide.** Ordinary markdown is the words, a
`::: backdrop` is the picture, a `::: draw` is the figure.

::: cards 3
- **A blockquote**\
  opens the part on a quotation. Part 1 of this lecture does
- **A backdrop**\
  opens it on a photograph. This part does
- **A figure**\
  opens it on a drawing, beside the heading or, with `{.stack}`, under it.
  Parts 3 and 7 do
:::

Those three are what a divider takes; the other directives belong inside a
`##` slide. The words do print, as a short paragraph under the part title. The
divider slide itself never prints.

**A `> note:` written there is the divider's own.** It reaches the cockpit as
the card for that camera stop and `print-notes.html` under the part title, so
the sentence that says what the part is for arrives while the part title is on
the wall rather than one slide late.

## free: A figure divider lays out beside the heading {.standard #divider-beside}

When a divider's body is nothing but a figure, **the figure goes beside the
heading** – stacked, a part title, an agenda and a drawing are three blocks
down one axis with nothing across it.

Prose under a heading is an opening paragraph and stays stacked, which is how
the quotation divider in Part 1 comes out.

## free: …unless the figure is the point of the part {.standard #divider-stack}

**`# Heading {.stack}` puts the content under the heading at the full measure**
and sets the heading small above it, as its caption. Beside the heading a
figure gets about half the frame, which is right for a drawing that balances a
part title and unreadable for one with six cells and a label in each. Part 7's
divider wears it; Part 3's is the other layout.

The class is on the one heading rather than a seventh `section:` value, because
`section:` is how the deck treats every divider and this is a fact about one
divider's content. A `{.stack}` over a divider with nothing under its heading
is refused.

# Cards, rows and panes {#grounds}

::: draw 140x54
box  cards "cards 3"  at 0,0 w 1.1 h 0.5 {.tone-2}
box  rows  "rows"     below cards gap 0.5 same as cards {.tone-3}
box  side  "side 2:1" below rows  gap 0.5 same as cards {.tone-1}
text note  "three containers,\nthree jobs" right of rows gap 1.1 -- rows {.small .muted .left}
:::

## free: `::: cards` makes boxes, not columns {.wide #cards-why}

**`::: cards 3` puts three boxes side by side**, and an item is whole or it is
nowhere. `::: cols 3` is the other thing: one flow of text the browser
balances across three columns, so a paragraph can spill from the foot of one
into the head of the next. Use cards for three things, columns for one long
argument.

::: cards 3 {.outline}
- **outline** a hairline and no fill. Quieter on a slide that already carries a
  figure
- **panel** a tinted fill and no hairline. The default
- **Never both.** A grey box inside a grey border reads as a form field rather
  than as a card
:::

## free: The two ways to open a card | a lead-in, or a heading {.wide #cards-open}

**How you open a card decides what the bold does**, and the two below are written the two ways:

::: cards 2
- **A lead-in** is written on the same line as its text, so the bold runs into the sentence and the card reads as one paragraph
- **A heading**\
  is written before a line break, so the bold sits on its own line with the text under it
:::

## free: What a card sits on {.wide #cards-grounds}

The `ground` word says what is behind the text, and a row wears one at a time:
these two are set to `accent` and to the default `panel`, whatever their cards
say. `outline` is on the slide before this one, and `corner` is a separate
question.

::: cards 3 {.accent}
- **accent**\
  the theme's own colour, with the text in the page colour on top
- **paper**\
  the page colour, so the card lifts off whatever is behind it
- **clear**\
  no box at all. The gap between cards is what separates them
:::

::: cards 3 {.square}
- **square**\
  corners off, for a deck that wants no rounding anywhere
- **round**\
  the default
- **photo**\
  the card's first picture becomes its background instead of a band across
  its top
:::

## free: Where the text sits in a card | `::: cards 3 {.outline .middle}` {.wide #cards-anchor}

::: cards 3 {.outline .middle}
- **top**\
  the default: the text starts at the head of its card, however tall the row is, so a short card leaves its paper underneath
- **middle**\
  this text is centred against the tallest card in the row
- **baseline**\
  a word for `::: rows`, which has a body to line a term up with
:::

**That row is `::: cards 3 {.outline .middle}`**, so its tail answers two questions at once: `ground`, and `anchor` – where the text sits when a card is taller than its content, which all but the tallest card are, a grid row being as tall as its longest card.

## free: The row size reads the longest item {.wide #cards-size}

**`size: auto` counts the words in the longest card**: three or fewer sets the
row large, twelve or fewer medium, more than twelve small. One size for the
whole row, never one per card.

::: cards 4 {.large}
- Measure
- Compare
- Report
- Repeat
:::

Alignment then follows the size, a single word centring and a sentence ranging
left. A row that carries a second level ranges left whatever its heads measure,
so the heads do not jump when the reader presses `C`.

## free: One row serves two views {.wide #cards-fold}

**`detail: fold` is the default**, so the levels under the first are in the
printed hand-out and off the projection, and `C` switches between the two. This
deck opens with everything showing, because its frontmatter says
`collapse: none`; press `C` once here and the second level folds away.

::: cards 3
- **fold**
  - off the projection
  - in the document
  - `C` switches
- **show**
  - on the slide too
- **page**
  - never folds, for a level that is a paragraph
:::

## free: `::: rows` turns a card row on its side {.wide #rows}

**A term in a small card on the left, its explanation beside it, several
stacked.** It takes the same words in braces as `::: cards`, the same automatic
size, the same fold and the same print rules. Only the arrangement of an item
differs.

::: rows
- **Anonymity** comes from the others doing the same thing at the same time
- **Unlinkability** means two actions of one person cannot be tied together
- **Deniability** means the record does not prove who acted
:::

Every term gets the same column width, so the explanations line up down the
slide however long the terms are.

## free: What a row block does differently | no count, and three defaults of its own {.wide #rows-rules}

**The explanation is optional** – a term written on its own is a labelled row with nothing beside it, which is what an agenda or a list of names wants.

It takes no count, a row block having one column by definition, and it takes every word a card row takes. Three defaults differ: `anchor` follows the ground, `align` says how the term sits *in its card* while the explanation ranges left, and the automatic size stops at `medium`, a term being a label in a column rather than a headline across the slide.

**A row block adds one anchor word, `baseline`, and picks between two by ground.** On a fill the term is a visible slab, and a one-line slab against a three-line explanation's first line reads as a mistake, so a grounded row centres it. Under `{.clear}` there is no slab and no padding, so the term is bare words in a column, and those read best on the baseline – a hanging indent, which is the form a term and its definition have taken since long before the slide. `{.baseline}` on a `::: cards` block is an error: a card has nothing beside it to line up with.

Use `rows` when a term needs a sentence, and `cards` when a comparison needs counting.

## free: `::: side` takes a ratio {.wide #side}

::: side 2:1
**`::: side 2:1` splits the slide into two panes**, two parts to one. Write
`::: side` on its own for equal panes, and `::: flip` between them to start the
second one. Any two numbers work.

On paper the panes stack one after the other and the ratio is ignored.

::: flip
::: draw 150x60
box a "2fr" at 0,0 w 1.9 h 1.9 {.tone-2}
box b "1fr" right of a gap 0.22 w 0.95 h 1.9 {.tone-3}
:::
:::

## free: A short pane beside a tall one | `::: side 2:1 {.middle}` {.wide #side-ratio}

::: side 2:1 {.middle}

**This slide is `::: side 2:1 {.middle}`: two parts of prose to one part figure**, which is the shape a diagram with its commentary usually wants. The drawing is a `::: draw` block inside the second pane.

**A short pane sits at the top of its half unless you say otherwise, and `{.middle}` centres it against the taller one.** Here the *figure* is the short pane, so `{.middle}` is what puts it level with the middle of this column instead of at the top. `{.top}` is the default and often right – a caption over a figure should be aligned from the top. The word belongs to the block and not to either pane, because the taller pane is what makes the row tall, so centring can only move the shorter one.

**A figure *above* or *below* the text needs nothing** – put the block first or last in the chunk body. `::: cols` is the one place a figure does not belong: a figure breaks the run of text the columns share, so the columns stop working, without an error. A `::: draw` written there is refused, and the message points you at `::: side`.

::: flip

::: draw 140x60
box a "Crawler" {.tone-1}
box b "Detector" below a gap 1.1 {.tone-4}
edge a -> b "request"
:::

:::

# Revealing a picture {#reveal}

## free: The window walks the beats, and the picture stands still {.wide #reveal-why}

**`::: backdrop dusk {.cover} reveal full, right 52%`** gives the picture one
place per beat – one press of Space – and the last place stays. Two moves come
out of it: a picture that retreats to free the space the words need, and one
that grows over the words and covers them.

What moves is the window, not the picture. The photograph is painted across the
whole slide either way and the frame opens and closes over it, so nothing zooms
or slides about while it is being revealed.

## figure: A picture that retreats {.full #reveal-open .bare}

::: backdrop dusk {.cover .clear} reveal full, right 52%

::: overlay {.left .clear .standard} from 1
### The picture retreats

and the words arrive in the space it freed, on the same press of Space.
:::

> note: Press Space once. The photograph gives up the left half and this block
> arrives with it. `from 1` is what holds the block back until then.

## free: `from` holds an overlay back until a beat {.wide #reveal-from}

**`::: overlay {…} from 1` keeps the block off the slide** until the first press
of Space. One number, not a list: an overlay is either on the slide or it is
not, where the backdrop's list says where the picture is at each beat.

An overlay and a reveal segment both fade in, and neither moves anything: the
segment has its box in the text from the first beat, and the overlay has its
cell over the picture. What `from` adds is the *number* – a segment takes the
next beat in order unless it is written `--- from N`, where an overlay says
which beat it waits for and nothing else can reach it first.

## figure: A picture that covers the words {.full #reveal-close .bare}

::: backdrop dusk {.cover .clear .over} reveal right 45%, full

::: overlay {.bottom-left .ink .standard} from 1
**A title can be covered**\
as well as added to.
:::

> note: The other direction. `over` in the braces puts the picture on top of the
> words instead of behind them, which is the one move you cannot get by adding
> more text.

## free: Where the picture sits, and what it is veiled with {.wide #backdrop-slots}

Five groups of words go in the braces after `::: backdrop`, at most one from
each, and the first of every group is the default.

::: cards 5
- **fill**\
  `cover`\
  `contain`
- **crop**\
  `middle`\
  `top`\
  `bottom`
- **scrim**\
  `veil`\
  `clear`\
  `invert`
- **focus**\
  `sharp`\
  `blur`
- **layer**\
  `under`\
  `over`
:::

**`veil` puts the theme's own page colour over the picture**, not white, so
ordinary text stays readable on a photograph in all seven themes. `invert`
darkens the picture and turns the text light instead, which is what the divider
at the start of Part 2 does.

## free: An overlay is a block of text over the slide {.wide #overlay-slots}

**Nine places, five backgrounds, four widths, two shapes.** Aim two overlays
at the same corner and they stack rather than landing on top of each other.
A `panel` is the card grown to the frame – the next part shows the three
compositions – and `third` / `half` are a band's height.

::: cards 3
- **place**\
  `center` and the eight compass points
- **ground**\
  `paper`\
  `ink`\
  `accent`\
  `clear`\
  `glass`
- **width**\
  `narrow`\
  `standard`\
  `wide`\
  `full`
:::

::: cards 2
- **shape**\
  `card`\
  `panel` (an edge or `center`, never a corner)
- **height**\
  `snug`\
  `third`\
  `half` (bands only)
:::

# Panels: the card grown to the frame {#panels}

## figure: A column the full height of the slide {.full .bare #panel-column}

::: backdrop dusk {.cover .clear}

::: overlay {.left .glass .panel .standard}
## The picture stays sharp beside the words

**`{.left .glass .panel .standard}` is a column, not a card.** It reaches the
top and the foot of the frame, its width is a share of the slide, and the glass
blurs only what is behind the words.

The backdrop is `{.cover .clear}`: no veil, because the panel sets the words
off. A `.clear` picture under words outside a panel, an overlay or a dock earns
the linter's `text-on-picture`.
:::

## figure: A band across the foot, a third high, with a beat inside {.full .bare #panel-band}

::: backdrop dusk {.cover .clear}

::: overlay {.bottom .ink .panel .wide .third}
**`{.bottom .ink .panel .wide .third}` is a band the whole width and a third
of the height,** the words centred in it and capped at the wide measure.

---

A `---` inside the panel is a beat: this line arrives on the first press, and
the band was this tall from the start.
:::

## figure: The whole frame veiled, and a card on top of it {.full .bare #panel-frame}

::: backdrop dusk {.cover .clear}

::: overlay {.center .glass .panel .standard}
## Words in the middle of a veiled picture

**`{.center .glass .panel}` covers the frame.** A corner with `.panel` is
refused: a panel runs along one edge, or takes them all.
:::

::: overlay {.bottom-right .ink .narrow}
**A card lies on top of a panel.**
:::

# A dock at the frame's edge {#docks}

::: dock {.left .every}
- [Why a dock](#dock-why)
- [Beside two columns](#dock-cols)
- [A band](#dock-band)
- [A band at the head](#dock-top)
- [On a beat](#dock-from)
- [The words](#dock-slots)
:::

## free: A dock is part of the frame, and the text yields to it {.wide #dock-why}

**An overlay lies over the slide; a dock takes its room from it.** The list on
the left is one `::: dock {.left .every}` written under this part's `#` heading,
and every chunk of the part carries it – the item the room is on lights up,
because each entry is a link to a chunk's `{#id}`.

**Four edges, six grounds, three widths.** A left or right dock is a
column the full height of the slide and the text column narrows beside it; a
top or bottom dock is a band across the whole width and the text sits above or
below it. A chunk that writes its own `::: dock` replaces the inherited one for
that slide.

## free: The text column narrows, and two columns still fit beside a dock {.wide #dock-cols}

**A `.wide` chunk keeps `::: cols 2` beside the inherited dock.** The chunk
reserves the dock's track as padding, so the content column is what the
slide leaves – and the linter says when that falls under the measure
(`dock-narrows-measure`) or under what a column needs (`layout-too-narrow`).

::: cols 2
The dock's ground is `tint` by default: the card row's panel tint, five per
cent of the ink on the paper, which is what gives a column on the slide's own
paper an edge. `paper` has none there and stays a choice for a dock over a
picture; `ink` is the loud version.

The dock's type is the overlay's, 0.92 of the slide's and zoomed with it, but
its track is a share of the frame and does not move: a dock is part of the
frame, and a running list that shifts sideways per slide is not a frame.
:::

## free: A band replaces the inherited column {.wide #dock-band}

**This chunk writes `::: dock {.bottom .accent .third}` of its own,** so the
part's list steps aside for one slide and a band a third of the slide high
carries the line under the words.

::: dock {.bottom .accent .third}
**One dock per slide.** An own one replaces the inherited one; the next chunk
inherits again.
:::

## free: A band at the head, and the chrome moves to the foot {.wide #dock-top}

**`::: dock {.top .accent}` is a line above the words,** as wide as the slide
and as tall as its own text. The slide number and the note button, which live
at the head, move to the foot under it.

::: dock {.top .accent}
**A running line.** The same on the projector and in the printed document,
where it is a box before the text.
:::

## free: A dock held to a beat arrives into a track kept free {.wide #dock-from}

**`from 2` holds this remark back until the second beat.** The text column
has been narrow from the start, so nothing moves when the dock slides in – the
rule an overlay card follows, kept here because a slide that reflows under the
room's eyes reads as a fault.

---

The first beat shows this line.

---

The second brings the dock.

::: dock {.right .glass} from 2
**Note:** the frame, not the words, made room for this.
:::

## free: The dock's words {.wide #dock-slots}

**Four edges, six grounds, three widths, three heights, two scopes.** One
dock per slide; a `#id` link in the body is the live marker.

::: cards 3
- **edge**\
  `left`\
  `right`\
  `top`\
  `bottom`
- **ground**\
  `tint`\
  `paper`\
  `ink`\
  `accent`\
  `clear`\
  `glass`
- **width**\
  `narrow`\
  `standard`\
  `wide`
:::

::: cards 2
- **height**\
  `snug`\
  `third`\
  `half` (bands only)
- **scope**\
  `once`\
  `every` (under a `#` heading only)
:::

# Beats below the top level {.stack #beats}

::: draw 118x34
default box {.tone-2} w 0.8 h 0.6 pad 0.12

box b1 "beat 1" at 0,0
box b2 "beat 2" right of b1 gap 0.26
box b3 "beat 3" right of b2 gap 0.26 {.tone-3}
box b4 "beat 4" right of b3 gap 0.26 {.tone-3}
box b5 "beat 5" right of b4 gap 0.26 {.tone-1}
box b6 "beat 6" right of b5 gap 0.26 {.tone-1}
brace p1 over b1,b2 "left pane" side bottom pad 0.3 {.muted}
brace p2 over b3,b4 "right pane" side bottom pad 0.3 {.muted}
brace p3 over b5,b6 "the card row" side bottom pad 0.3 {.muted}
:::

## free: Six beats in source order, and nothing moves {.wide #beats-panes}

**A `---` inside a pane, a card row or a dock is a beat on the slide's own
counter.** Left one, left two, right one, right two, then the card row, then
its third card – the order they were written in, top-level and nested mixed.

::: side
**Left one.** A nested beat keeps its box: the pane stands at its final height
from the first press.

---

**Left two.** So nothing above or beside it moves when it arrives.

::: flip

---

**Right one.** The right pane waited for the third beat, because its first line
is a `---`.

---

**Right two.** The fourth.
:::

---

::: cards 3
- **Fifth beat.** The row is a top-level segment.
- **Still the fifth.** A top-level segment reserves its space too, so the chunk
  is as tall on its first beat as on its last.

---

- **Sixth.** The third card had its cell from the fifth beat on.
:::

## free: Rows that arrive one at a time {.wide #beats-rows}

**A `---` between two rows shows the second on the next press,** and the
first does not move: the block is laid out with both rows from beat 0.

::: rows {.accent}
- **Nested** beats keep their place, so the slide is quiet under them.
---
- **Top-level** segments do the same, so a chunk is as tall on its first beat
  as on its last. One rule, whatever depth the mark sits at.
:::

# A heading that stays off the slide {#bare}

## free: `{.bare}` gives up the projection and nothing else {.wide #bare-why}

**`{.bare}` keeps a heading out of the projection** and leaves it everywhere
else. Writing no heading would cost the slide, the printed document and
the search index together; a talk that is a run of figures with speaker notes
usually wants to lose only the first.

So `## figure: How a crawl is scored {.full #id .bare}` prints the heading,
indexes it, and draws nothing on screen. `style: {headings: off}` says the same
for a whole deck. Press `/` and search for *measurement loop*: it matches this
slide and the next one, and the next one carries no heading on screen.

The two revealed photographs in Part 4 are the case the class was written for:
each is a picture and a speaker note, each would have read wrong with a line of
type above it, and each is still a row in the search index.

## figure: The measurement loop {.full #bare-loop .bare}

> note: This slide has a heading, *The measurement loop*. It is in `print.html`
> and in the search index, and it is not on the projection.

::: draw 150x56
box crawl "Crawler"         at 0,0
box site  "Site"            right of crawl gap 2.0
box score "Scoring service" below site gap 1.3
edge crawl.right:0.3 -> site.left:0.3 "request" side top
edge site.left:0.72 -> crawl.right:0.72 "page, or not" side bottom
edge site -> score {.dashed}
:::

## figure: A figure that walks itself {.full #autoplay .bare}

> note: `autoplay 1400 cycle` walks the figure's steps on a timer once the
> slide is on screen, and starts again at the end. The first key, click or
> scroll *on this slide* stops it: once you have touched the figure it is
> yours. It also declines to start on a slide you arrive at half-revealed.

::: draw 150x56 autoplay 1400 cycle
box  raw  "raw crawl"    at 0,0 w 1.0 {.tone-2}
box  inst "instrumented" right of raw gap 1.4 w 1.0 {.tone-3}
box  diff "difference"   below inst gap 1.0 w 1.0 {.tone-1}
edge raw -> inst
edge inst -> diff
text  n "a difference is a detection" right of diff gap 1.0 -- diff {.small .muted .left}

step compare
  show inst

step verdict
  show diff
  emph diff

step note
  show n
:::

# Type and colour {#type}

The settings in this part are written once, in the frontmatter, and change
every slide of a lecture together: the `style:` block, and the typefaces the
four files carry. This lecture sets none of them, so its slides show the
settings in YAML rather than wearing them.

## free: Setting the typography for a whole lecture | the `style:` block {.wide #style-block}

**The `style:` block holds the settings you make once for a whole lecture rather than chunk by chunk.**

```yaml
style:
  headings: left        # auto | left | center | off
  rules: off            # on | off  – the hairline over a principle
  labels: off           # on | off  – the type word over a chunk
  link-codes: off       # on | off  – the mark after an external link
  blocks: left          # center | left – a code block, a figure, a formula
  wrap: none            # balance | none – even line lengths
  print-body: sans      # serif | sans – the printed document's face
  neutrals: tinted      # neutral | tinted | warm | cool – the greys
  print-neutrals: warm  # the same four, for the printed pages
  headline: eyebrow     # stacked | eyebrow – the title pair
  caps: on              # off | on – small type round a title
  bold: accent-bold     # plain | bold | italic | accent |
  print-bold: italic    #   accent-bold | accent-italic – live, then paper
  code: tint            # plain | tint | spaced – code inside a sentence
  heading-scale: 1.15   # with body-scale, bounded to 0.6 … 1.8
```

`headings: auto` is the default: the type decides, so a figure's caption sits over its artwork. `left` overrides that for one line of alignment down the lecture; `off` takes headings off the projection and keeps them in print, the contents list and search.

## free: Five keys the block's names do not explain | `wrap`, `blocks`, `print-body`, the bold pair and the scales {.wide #style-keys}

**`wrap` applies to headings and prose both**, which its name does not say: `balance` evens the line lengths of a heading and protects the last line of a paragraph, and `none` turns both off. `blocks` and `wrap` are the two keys a single chunk can answer for itself, with `{.blocks-left}` and `{.wrap-none}` in its attribute tail.

**`print-body` is the one setting here that only the printed pages see.** The projection and the lectern let a reader pick the face with `F`; a document has no reader to press it, so `sans` is how you ask for one set in the sans. Code stays in the monospace, and so does everything the document already draws in the sans – the type word, a caption, the contents list.

**`bold` and `print-bold` set how a `**bold**` phrase looks, and `plain` is a legal answer because bold selects before it decorates.** Live the default is `plain`, so a promoted bullet is set like the sentence above it; on paper it is `bold`, in the ink. `accent-bold` in both is how the tool drew every bold before the keys existed. A word stressed with `*em*` inside the phrase is bold and in the accent whatever the key says – except under `accent-bold`, where it stays italic.

The two scales multiply the tool's own sizes rather than replacing them, and they are **bounded** to 0.6–1.8: outside that, the shortened view, the width limit on a line of code and the automatic zoom disagree.

## free: Code inside a sentence | `style: {code: …}` {.wide #inline-code}

**A monospaced word brings a space of its own, and it is twice the width of the one around it.** So **`async def` used to read as two words where `await` read as one** – only a span of several tokens has a gap inside it to go wrong.

::: rows {.clear}
- **`spaced`** the default: the gaps around a multi-word span are widened a hair and the ones inside it pulled in. A single token is left alone
- **`tint`** a quiet ground behind every span, padded left and right only
- **`plain`** the flat `0.92em` the tool drew before the setting existed
:::

Both of the first two also **size the code to the x-height of the face around it**, so a lecture that changes its serif changes this with it. A face you supplied yourself carries no measurement; the build says so and leaves the size alone.

## free: What hue the greys carry | `neutrals`, and its counterpart for the page {.wide #neutrals}

**`A` cycles the theme, and in the four light themes it moves one colour: the accent.** The ink stays on a cool hue, and every tinted surface – a card, a dock, an overlay card – is mixed out of that ink, so a card under a warm accent is a cool grey under a warm word.

::: rows {.clear}
- **`neutral`** the default, and what the tool has always drawn
- **`tinted`** the greys take the accent's own hue, so the slide reads as one palette whichever accent the room gets
- **`warm` / `cool`** a fixed hue, the accent notwithstanding
:::

**`print-neutrals` asks the same question for the two printed views**, and it is a second key because the printed page is warm already where the projection is not. Leave it out and it follows `neutrals`.

## free: Which line of a title is the loud one | `headline`, and `caps` beside it {.wide #headline}

**A cover carries a pair of lines, and so does a divider and a closing slide** – `title:` and `subtitle:` in the frontmatter, `Heading | Sub` in a chunk heading. `headline` says which of the two is set large.

```yaml
style:
  headline: eyebrow     # stacked | eyebrow
  caps: on              # off | on
```

`stacked` is the default: the title large, the subtitle quieter under it. `eyebrow` turns it over, so the title sits small above a subtitle that carries the weight – the shape a lecture title takes when the first line names the field and the second asks the question.

**The words stay where they are and only their type changes**, which is what lets one key serve the cover, the dividers and the closing slide at once. `title:` is also the browser tab, the contents entry and what search reads, so putting the hook there would leave the lecture's own name nowhere.

`caps` sets the small type round a title in capitals: the eyebrow, the presenter, the affiliation, never the headline. The tracking is not a second setting – the build spaces out any line already in capitals, including one you typed that way.

## free: Turning the generated labels off | `style: {labels: off}` {.wide #labels}

**The type word above a chunk is drawn in two places, and one setting takes it out of both.**

::: cards 2
- **`print.html` and `print-notes.html`** set a small line of capitals over every typed chunk. Every type has one except free and figure, so that is where most of them live.
- **The projection** prints only the word over an exercise. The rest were taken out: a label naming the kind of slide is only as right as the type was.
:::

```yaml
style:
  labels: off
```

`rules` is the neighbouring key and switches the lines – the bar above a principle, the hairline above a definition. `labels` switches the words.

**A figure's heading, set in capitals, is your own text and needs no key.** It is the chunk's heading, drawn that way because the type is `figure`, so `## figure: {.wide #id}` with no heading text leaves it off the slide. The cost is that the chunk then has no text for search to find and no heading in `print.html`. (The contents list is unaffected – `T` lists the lecture's columns, never its chunks.)

## free: Which typefaces are embedded in the file | nine come with the tool {.wide #bundled-fonts}

**Three families are embedded in any one file, and you pick which three.** Nine come with the tool, so naming one of those needs no font file at all. A fourth role, `display`, is optional: `fonts: {display: Anton}` names one of 32 more faces for the cover, the closing slide and the section dividers, and nothing else in the lecture wears it.

```yaml
fonts:
  serif: Bitter                    # or Literata, the default; also Source
                                   # Serif 4, Noto Serif, Roboto Serif
  sans: Inter Tight                # or IBM Plex Sans, the default
  mono: Noto Sans Mono Condensed   # or JetBrains Mono, the default
```

Only the three a lecture actually asks for are read, so choosing an alternative costs that lecture and no other. A name that is neither one of the nine nor a file in `fonts/` stops the build, and the message lists the names available for that role.

**Among the serifs, the question is what a projector does to a typeface.** Bitter has the lowest stroke contrast and the smallest file, which is why it stays legible in a lit room; Roboto Serif has the strongest bold but sets 8% wider, so it re-wraps a deck written against another face.

## free: Type for code | the condensed monospace, and `ligatures:` {.wide #code-type}

**The condensed monospace is 17% narrower** – 0.50 em against 0.60 em per character, measured in a browser – so a listing that ran off the slide now fits. It is Noto Sans Mono with its width axis pinned rather than a different typeface, so it costs 54 KB. Slashed zero, and `I`, `l` and `1` are three visibly different shapes.

**`ligatures:` decides whether letter pairs are drawn joined, and answers separately for prose and for code.** `text` is the default: `fi` and `fl` joined up in prose, nothing joined in code. `none` takes them out of prose as well. `all` puts the code ones back, so JetBrains Mono draws `->` as a single arrow again. The code ones are off by default because in the figure language `->` and `--` are two *different* arrows, and every listing on a slide is source somebody may retype.

## free: Embedding your own typefaces | `fonts/` beside `source.md`, plus a frontmatter block {.wide #fonts}

**A family that is not inside the file is a family the lecture-hall machine may not have.** Safari does not tell a page which fonts a machine has, so a lecture that merely names one takes whatever that browser decides instead. The three a lecture carries are embedded in every output it writes, cost about 280 KB per file, and `fonts: none` leaves them out; the bundled three are under the SIL Open Font License, which permits exactly this.

**Each of the three text roles is answered on its own**, so you can replace one and leave the others alone. Put your files in a `fonts/` folder beside `source.md`:

```yaml
fonts:
  serif: Vollkorn        # yours – the files are in fonts/
  mono: JetBrains Mono   # one of the nine that ship, so no file
                         # sans: not written, so it stays the default
```

**A file's name says which weight and style it is**: `Vollkorn-Regular.woff2`, then `-Bold`, `-Italic`, `-BoldItalic`, `-600`, `-600italic` – or one file, `Vollkorn[wght].woff2`, carrying every weight. A family that is neither one of the nine nor a file in `fonts/` stops the build.

**Putting a font inside the file redistributes it, so check the licence first.** The SIL Open Font License and Apache-2.0 – between them nearly all of Google Fonts – allow that; most commercial desktop licences do not, and want a separate web licence. The build prints a reminder and checks nothing.

## closing: A slide is a frame | and the frame can carry more than a column of text {#end}

All ten covers and all six dividers are shot from real builds in the
[gallery](https://uba-psi.github.io/psi-slides/decoration.html); the
`psi-slides-decoration` skill has the vocabulary of each.
