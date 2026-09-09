---
title: Slide Decoration
subtitle: What a slide can carry besides a column of text
author: Dominik Herrmann
cover: quote
cover-align: middle
section: outline
section-mark: Part
theme: light-blue
collapse: none
auto-fit: true
---

## title: {#cover}

A slide is a frame, and the frame can carry more than a column of text.

## outline: What this lecture shows {.wide #agenda}

Every way psi-slides has of decorating a slide, each one used on the slide that
describes it.

## principle: None of this is in the 1.0.0 release {.standard #preview}

**Everything this lecture shows was added after the 1.0.0 release**, so the
archive on the releases page does not have it and a lecture that uses it will
not build against that download.

What you need instead is the repository: a clone, or **Download ZIP** from the
project page, and the `build.js` inside it. The source format is frozen from
1.0.0 onwards, so these constructions may still change before they are tagged.

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

## free: Three keys the cover reads {.wide #cover-keys}

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

Set either of the last two keys on a composition that has already settled the
question and the build stops with an error rather than ignoring the line.

## free: `quote` draws no quotation mark {.standard #cover-quote}

A sentence set alone on a slide with a name under it **already reads as a
quotation**, so there is no mark: no hanging curly quote, no glyph behind the
words, no rule beside them.

The claim is what you write under the `## title:` heading. A `quote` cover
without one fails the build.

## free: The last slide closes the arc {.wide #closing-tag}

**`## closing:` draws the last slide in whatever composition `cover:` names**,
so the room sees the shape the lecture opened with.

What it carries is different: your own heading, sub-heading and text, and
neither the presenter line nor the `info` block – the room learned who is
talking and where an hour ago. The last slide of this lecture is one.

# Dividers carry their own slide {#dividers}

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
  opens it on a drawing set beside the heading. Part 3 does
:::

Those three are what a divider takes; the other directives belong inside a
`##` slide. The words do print, as a short paragraph under the part title. The
divider slide itself never prints.

## free: A figure divider lays out beside the heading {.standard #divider-beside}

When a divider's body is nothing but a figure, **the figure goes beside the
heading** – stacked, a part title, an agenda and a drawing are three blocks
down one axis with nothing across it.

Prose under a heading is an opening paragraph and stays stacked, which is how
the quotation divider in Part 1 comes out.

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

An overlay fades in where a reveal segment simply appears. A segment is part of
the flowing text, so what follows it closes up as it arrives; an overlay sits in
its own cell over the picture and nothing else moves.

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
A `panel` is the card grown to the frame - the next part shows the three
compositions - and `third` / `half` are a band's height.

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
and every chunk of the part carries it - the item the room is on lights up,
because each entry is a link to a chunk's `{#id}`.

**Four edges, the overlay's grounds, three widths.** A left or right dock is a
column the full height of the slide and the text column narrows beside it; a
top or bottom dock is a band across the whole width and the text sits above or
below it. A chunk that writes its own `::: dock` replaces the inherited one for
that slide.

## free: The text column narrows, and two columns still fit beside a dock {.wide #dock-cols}

**A `.wide` chunk keeps `::: cols 2` beside the inherited dock.** The chunk
reserves the dock's track as padding, so the content column is what the
slide leaves - and the linter says when that falls under the measure
(`dock-narrows-measure`) or under what a column needs (`layout-too-narrow`).

::: cols 2
The dock's ground is `tint` by default: the card row's panel tint, five per
cent of the ink on the paper, which is what gives a column on the slide's own
paper an edge. `paper` has none there and stays a choice for a dock over a
picture; `ink` is the loud version.

The dock's type is the overlay's, 0.92 of the slide's and zoomed with it, so
the reserved track grows with the lecturer's zoom and auto-fit converges on
the size at which the list and the text both fit.
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
has been narrow from the start, so nothing moves when the dock slides in - the
rule an overlay card follows, kept here because a slide that reflows under the
room's eyes reads as a fault.

---

The first beat shows this line.

---

The second brings the dock.

::: dock {.right .glass} from 2
**Merke:** the frame, not the words, made room for this.
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

# Beats below the top level {#beats}

## free: Six beats in source order, and nothing moves {.wide #beats-panes}

**A `---` inside a pane, a card row or a dock is a beat on the slide's own
counter.** Left one, left two, right one, right two, then the card row, then
its third card - the order they were written in, top-level and nested mixed.

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
- **Still the fifth.** It closes up before its beat and the chunk grows - the
  1.0.0 behaviour, `style: {reveal: grow}`.

---

- **Sixth.** The third card had its cell from the fifth beat on.
:::

## free: Rows that arrive one at a time {.wide #beats-rows}

**A `---` between two rows shows the second on the next press,** and the
first does not move: the block is laid out with both rows from beat 0.

::: rows {.accent}
- **Nested** beats keep their place, so the slide is quiet under them.
---
- **Top-level** segments grow the chunk, unless the frontmatter says
  `style: {reveal: hold}` - then every segment in the deck stands still too.
  This deck keeps the default, so the difference can be seen in the part
  before this one.
:::

# A heading that stays off the slide {#bare}

## free: `{.bare}` gives up the projection and nothing else {.wide #bare-why}

**`{.bare}` keeps a heading out of the projection** and leaves it everywhere
else. Writing no heading at all would cost the slide, the printed document and
the search index together; a talk that is a run of figures with speaker notes
usually wants to lose only the first.

So `## figure: How a crawl is scored {.full #id .bare}` prints the heading,
indexes it, and draws nothing on screen. `style: {headings: off}` says the same
for a whole deck. Press `/` and search for *measurement loop*: it matches this
slide and the next one, and the next one carries no heading on screen at all.

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

## closing: A slide is a frame | and the frame can carry more than a column of text {#end}

None of these constructions changes a lecture that does not use them. A
`source.md` written before any of them builds exactly as it did before.
