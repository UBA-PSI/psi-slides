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
---

## title: {#cover}

A slide is a frame, and the frame can carry more than a column of text.

## outline: What this lecture shows {.wide #agenda}

Every way psi-slides has of decorating a slide, each one used on the slide that
describes it, so you can see it work before you write it.

## principle: None of this is in the 1.0.0 release {.standard #preview}

**Everything this lecture shows was added after the 1.0.0 release**, so the
archive on the releases page does not have it and a lecture that uses it will
not build against that download.

What you need instead is the repository: a clone, or **Download ZIP** from the
project page, and the `build.js` inside it. The source format is frozen from
1.0.0 onwards, so these constructions may still change before they are tagged.

# The cover, and the slide that closes it {#covers}

> A deck has one cover, so this lecture can show you only one of the ten. The
> [gallery](https://uba-psi.github.io/psi-slides/#covers) has all ten, each shot
> from a real build.

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

## free: Three keys the cover reads {.wide #cover-keys}

**`cover-image:`** names the picture, and four of the ten draw one: `split`,
`hero`, `beside` and `above`. On the last two it is only the fallback – they
take whatever you write under the `## title:` heading, so a `::: draw` can be
the cover.

**`cover-ratio:`** is how much of the slide the picture takes, as a percentage
between 15 and 75. Only the three that divide the slide read it – `split`,
`beside` and `above`. It is a percentage rather than a `W:H` ratio because it
splits one fixed frame; the shape of the frame comes from the projector.

**`cover-align:`** puts the block of text at the `top`, the `middle` or the
`bottom`. The seven compositions that leave the block any freedom read it.

Set either of the last two keys on a composition that has already settled the
question and the build stops with an error rather than ignoring the line.

## free: `quote` draws no quotation mark {.standard #cover-quote}

A sentence set alone on a slide with a name under it **already reads as a
quotation**, so there is no mark: no hanging curly quote, no glyph behind the
words, no rule beside them.

The claim is what you write under the `## title:` heading. A `quote` cover
without one fails the build: a quote cover with no quotation is a title slide
with the title in the wrong place.

## free: The last slide closes the arc {.wide #closing-tag}

**`## closing:` draws the last slide in whatever composition `cover:` names**,
so the room sees the shape the lecture opened with.

What it carries is different: your own heading, sub-heading and text, and
neither the presenter line nor the `info` block. Those two say who is talking
and where, which the room learned an hour ago. The last slide of this lecture
is one.

# Dividers carry their own slide {#dividers}

::: backdrop dusk {cover invert}

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

## principle: What a running agenda says that a coloured field cannot {.standard #outline-why}

**Which part starts, out of how many, and how far into the hour you are.** The
room meets the same list four or six times and learns the shape of the lecture
from it.

That only works while the list stays the same from divider to divider, so the
heading is the live item in the list rather than a second copy set beside it.

## free: Three states, two greys {.standard #outline-states}

The live part is set **larger and in full ink**; the parts before and after it
recede. What carries progress is where the live item sits as it walks down the
list, so the recession only has to say *not this one*. Two greys read from the
back of a room and three do not, which is why the live item is a size rather
than a third shade.

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

Those three are what a divider takes, and the other directives belong inside a
`##` slide: a card row or a two-column layout on a divider is a slide that has
stopped being a divider. The words themselves do print, as a short paragraph
under the part title. The divider slide itself never prints.

## free: A figure divider lays out beside the heading {.standard #divider-beside}

When a divider's body is nothing but a figure, **the figure goes beside the
heading** rather than under it. Stacked, a part title, an agenda and a drawing
are three blocks down one axis with nothing balancing them across it.

Prose under a heading is an opening paragraph and reads correctly stacked, which
is how the quotation divider in Part 1 comes out.

# Cards, rows and panes {#grounds}

::: draw {unit=140x54}
box  cards "cards 3"  at 0,0 w 1.1 h 0.5 {.tone-2}
box  rows  "rows"     below cards gap 0.5 same as cards {.tone-3}
box  side  "side 2:1" below rows  gap 0.5 same as cards {.tone-1}
text note  "three containers,\nthree jobs" right of rows gap 1.1 -- rows {.small .muted .left}
:::

## free: `::: cards` makes boxes, not columns {.wide #cards-why}

**`::: cards 3` puts three boxes side by side**, and an item is whole or it is
nowhere. `::: cols 3` is the other thing: one flow of text the browser
balances across three columns, so a paragraph can spill from the foot of one
into the head of the next. Reach for cards when three items are three things
rather than one paragraph cut in three.

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
whole row and never one per card, because three sizes in a row read as a mistake
rather than as a hierarchy.

::: cards 4 {.large}
- Measure
- Compare
- Report
- Repeat
:::

Alignment then follows the size, a single word centring and a sentence ranging
left. A row that carries a second level ranges left whatever its heads measure:
a centred head over a left-aligned list reads as a mistake, and the heads must
not jump when the reader presses `C`.

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
::: draw {unit=150x60}
box a "2fr" at 0,0 w 1.9 h 1.9 {.tone-2}
box b "1fr" right of a gap 0.22 w 0.95 h 1.9 {.tone-3}
:::
:::

# Revealing a picture {#reveal}

## free: The window walks the beats, and the picture stands still {.wide #reveal-why}

**`::: backdrop dusk {cover} reveal full, right 52%`** gives the picture one
place per beat – one press of Space – and the last place stays. Two moves come
out of it: a picture that retreats to free the space the words need, and one
that grows over the words and covers them.

What moves is the window, not the picture. The photograph is painted across the
whole slide either way and the frame opens and closes over it, so nothing zooms
or slides about while it is being revealed.

## figure: {.full #reveal-open}

::: backdrop dusk {cover clear} reveal full, right 52%

::: overlay {left clear standard} from 1
### The picture retreats

and the words arrive in the space it freed, on the same press of Space.
:::

> note: Press Space once. The photograph gives up the left half and this block
> arrives with it. `from 1` is what holds the block back until then.

## free: `from` holds an overlay back until a beat {.wide #reveal-from}

**`::: overlay {…} from 1` keeps the block off the slide** until the first press
of Space. It takes one number and not a list, because an overlay is either on
the slide or it is not. The backdrop's list answers a different question, which
is where the picture is at each beat.

An overlay fades in where a reveal segment simply appears. A segment is part of
the flowing text, so what follows it closes up as it arrives; an overlay sits in
its own cell over the picture and nothing else moves.

## figure: {.full #reveal-close}

::: backdrop dusk {cover clear over} reveal right 45%, full

::: overlay {bottom-left ink standard} from 1
**A title can be covered**\
as well as added to.
:::

> note: The other direction. `over` in the braces puts the picture on top of the
> words instead of behind them, which is the one move you cannot get by adding
> more text.

## free: Where the picture sits, and what it is veiled with {.wide #backdrop-slots}

Four groups of words go in the braces after `::: backdrop`, at most one from
each, and the first of every group is what you get by saying nothing.

::: cards 4
- **fill**\
  `cover` `contain`
- **crop**\
  `middle` `top` `bottom`
- **scrim**\
  `veil` `clear` `invert`
- **layer**\
  `under` `over`
:::

**`veil` puts the theme's own page colour over the picture**, not white, so
ordinary text stays readable on a photograph in all seven themes. `invert`
darkens the picture and turns the text light instead, which is what the divider
at the start of Part 2 does.

## free: An overlay is a block of text over the slide {.wide #overlay-slots}

**Nine places, five backgrounds, four widths.** Aim two overlays at the same
corner and they stack rather than landing on top of each other.

::: cards 3
- **place**\
  `center` and the eight compass points
- **ground**\
  `paper` `ink` `accent` `clear` `glass`
- **width**\
  `narrow` `standard` `wide` `full`
:::

# A heading that stays off the slide {#bare}

## free: `{.bare}` gives up the projection and nothing else {.wide #bare-why}

**`{.bare}` keeps a heading out of the projection** and leaves it everywhere
else. Writing no heading at all would cost three things together: the slide,
the printed document and the search index. A talk that is a run of figures with
speaker notes usually wants to lose only the first.

So `## figure: How a crawl is scored {.full #id .bare}` prints the heading,
indexes it, and draws nothing on screen. `style: {headings: off}` says the same
for a whole deck. Press `/` and search for *measurement loop*: it matches this
slide and the next one, and the next one carries no heading on screen at all.

## figure: The measurement loop {.full #bare-loop .bare}

> note: This slide has a heading, *The measurement loop*. It is in `print.html`
> and in the search index, and it is not on the projection.

::: draw {unit=150x56}
box crawl "Crawler"         at 0,0
box site  "Site"            right of crawl gap 2.0
box score "Scoring service" below site gap 1.3
edge crawl.right:0.3 -> site.left:0.3 "request" side top
edge site.left:0.72 -> crawl.right:0.72 "page, or not" side bottom
edge site -> score {.dashed}
:::

## figure: A figure that walks itself {.full #autoplay .bare}

> note: `{autoplay=1400 cycle}` walks the figure's steps on a timer once the
> slide is on screen, and starts again at the end. The first key, click or
> scroll stops it for good: once you have touched the deck it is yours. It also
> declines to start on a slide you arrive at half-revealed.

::: draw {unit=150x56 autoplay=1400 cycle}
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
