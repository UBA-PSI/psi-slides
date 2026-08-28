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

A slide is a frame, and the frame can carry more than a text column.

## outline: What this lecture shows {.wide #agenda}

Every construction psi-slides has for decorating a slide, once each, in the
view it was built for.

# The cover, and the slide that closes back to it {#covers}

> A deck has exactly one cover, so this lecture can only wear one of the ten.
> The [tutorial](../tutorial/audience.html) wears another, and the
> [gallery on the project site](https://uba-psi.github.io/psi-slides/#covers) has all
> ten side by side, shot from real builds.

## free: Ten compositions, ordered quiet to loud {.wide #cover-list}

**`cover:` picks one of ten**, and the list is ordered by how much the opening
slide asserts itself rather than alphabetically, because that is the only
question it asks the author.

::: cards 3
- **classic**\
  the lower-left third, all type. The default, and what the tool always drew
- **masthead**\
  a nameplate at the top, credits under a folio rule at the bottom, a lede in
  the field between
- **stack**\
  the block centred on both axes, for an opening that wants to be still
:::

::: cards 3
- **display**\
  the title set to fill the slide. The scale is the whole design
- **panel**\
  the type reversed out of a full field of the theme's accent
- **quote**\
  the talk opens on a claim; the title reads as the attribution under it.
  This lecture wears it
:::

::: cards 4
- **split**\
  type left, `cover-image` bled off the right edge
- **hero**\
  the picture is the slide, type reversed out of a gradient
- **beside**\
  the chunk's own body inset to the right of the title
- **above**\
  the chunk's own body on top, title centred in the band below
:::

**A list of ten compositions is not a picture of them**, and a composition is
the kind of thing you have to see. Every one of these is on the
[project site](https://uba-psi.github.io/psi-slides/#covers) as a tile shot from a real
build – along with the six dividers below, and the two keys that modify a
composition rather than replacing it.

## free: Three keys the cover reads {.wide #cover-keys}

**`cover-image:`** names the picture for the four compositions that take one.
**`cover-ratio:`** (15–75%) is how much of the slide the picture gets on the
three that divide it, and it is a percentage rather than a `W:H` ratio because
what an author sets here is the split of one fixed frame – the slide's own
aspect belongs to the projector.

**`cover-align:`** is `top`, `middle` or `bottom`: where the type sits on the
vertical. **It is one key rather than ten more variant names**, because
`split-bottom` and `stack-top` is a list that multiplies every time either half
of it grows. Both keys are refused on a composition that has already answered
the question, so a number the drawing ignores never passes silently.

## free: `quote` draws no quotation mark {.standard #cover-quote}

**A sentence set alone on a slide with a name under it already reads as a
quotation.** The mark is what gets added when the composition is not trusted to
say so, and this one is trusted: no hanging curly quote, no glyph behind the
words, no rule beside them.

The claim is the title chunk's own body, and it comes before the title in the
source rather than being moved there by CSS – the two are different documents,
not one document laid out twice.

## free: The last slide closes the arc {.wide #closing-tag}

**`## closing:` is a tag, not a second `title:` chunk.** It draws whatever
composition `cover:` names, so the room sees the shape the lecture opened with –
but it carries the author's own words and **neither the presenter line nor the
`info` block**. Those two say who is talking and where, which the room learned
an hour ago.

The composition is inherited and the content is written. That is what makes it
the same shape without being the same slide. The last chunk of this lecture is
one.

# Dividers carry their own slide {#dividers}

::: backdrop dusk {cover invert}

## free: Six treatments, every one quieter than the cover {.wide #section-list}

**A divider that can be mistaken for the title slide has failed** at the one job
it has, which is to say *a new part starts here, and it is part of the thing you
are already in*.

::: cards 3
- **plain**\
  the heading alone. The default
- **tinted**\
  the whole slide takes the accent at 12%. The ten-metre signal: the colour
  arrives before any word does
- **rule**\
  the heading between two rules across the measure. The quietest, and the one
  that survives a monochrome print
:::

::: cards 3
- **card**\
  the heading on a panel, which is the card vocabulary borrowed rather than a
  sixth thing to learn
- **number**\
  a large counter above the heading, which steps the heading back
- **outline**\
  the running agenda: every part listed, this one live. What this lecture uses
:::

## principle: The running agenda answers what a coloured field cannot {.standard #outline-why}

**Not *a new part starts* but which part, out of how many, and how far in.**
It is the recurring element a long lecture needs: the room meets the same list
four or six times and learns the shape of the hour from it.

That works only because the list is stable, so the heading **is** the live item
rather than a second copy beside it.

## free: Three states, and deliberately not three greys {.standard #outline-states}

**Two greys a projector can tell apart; three it cannot.** What carries progress
is the *position* of the live item as it walks down the list. The fade only has
to say *not this one*, and size and weight do the rest – which is why the live
item needs no ground, no rail and no marker of its own.

`section-mark:` puts a short word over the heading. This lecture writes `Part`;
saying nothing puts nothing there, which is what the removed paragraph sign
should have done.

## free: The lines under a `#` heading are the divider's slide {.wide #divider-body}

They used to be dropped without a word. **Ordinary markdown is the words, a
`::: backdrop` is the picture, a `::: draw` is the figure** – three things
authors keep asking for and no vocabulary added for any of them.

::: cards 3
- **A blockquote**\
  opens the part on a quotation. Part 1 of this lecture does
- **A backdrop**\
  opens it on a photograph. This part does
- **A figure**\
  opens it on a drawing, laid out *beside* the heading. Part 3 does
:::

The list is short on purpose: a card row or an expansion on a divider is a slide
that has stopped being a divider. **Those words print**, as a lede under the part
title; the divider slide itself never has.

## free: A figure divider lays out beside the heading {.standard #divider-beside}

Stacked, a part title, an agenda and a drawing are **three blocks down one axis
with nothing balancing them across it**. The test is whether the divider's body
is nothing *but* a figure: prose under a heading is a lede and reads correctly
stacked, which is exactly what a quotation divider is.

# Grounds, rows and panes {#grounds}

::: draw {unit=140x54}
box  cards "cards 3"  at 0,0 w 1.1 h 0.5 {.tone-2}
box  rows  "rows"     below cards gap 0.5 same as cards {.tone-3}
box  side  "side 2:1" below rows  gap 0.5 same as cards {.tone-1}
text note  "three containers,\nthree jobs" right of rows gap 1.1 -- rows {.small .muted .left}
:::

## free: A card row is N containers, not N columns {.wide #cards-why}

**`::: cols` is one text flow the browser balances across N tracks**, so a
paragraph can spill from the foot of one column into the head of the next.
`::: cards N` is N *containers*, and an item is whole or it is nowhere. That is
what makes a three-item comparison read as three things rather than as one
paragraph cut in three.

::: cards 3 {.outline}
- **outline** a hairline and no fill. Quieter on a slide that already carries a
  figure
- **A tinted fill and a hairline is the combination to avoid** – a grey box
  inside a grey border reads as a form field
- So `panel` fills, `outline` strokes, and neither does both
:::

## free: Six grounds and two corners {.wide #cards-grounds}

::: cards 3 {.accent}
- **accent**\
  the theme's own colour, reversed
- **paper**\
  the page, lifted off the slide's ground
- **clear**\
  neither. The gutter is what separates them
:::

::: cards 3 {.square}
- **square**\
  corners off, for a deck that wants no radius anywhere
- **round**\
  the default
- **photo**\
  the card's first picture becomes its ground rather than a band across its top
:::

## free: The row size reads the longest item {.wide #cards-size}

**`auto` counts the words in the longest card**: three or fewer makes it large,
twelve or fewer medium, more than that small. It is the *block's* decision and
never each card's, because three sizes in one row read as a mistake rather than
as a hierarchy.

::: cards 4 {.large}
- Measure
- Compare
- Report
- Repeat
:::

The alignment follows the size unless the row carries a second level, where it
ranges left whatever the heads measure: a centred head over a left-aligned
detail list reads as a mistake, and the head must not change alignment when the
collapse mode does.

## free: One row serves two views {.wide #cards-fold}

**`detail: fold` is the default.** The nested levels are off the projection
under `topic-bold` and present everywhere else, so the slide carries the
headline and the document carries the hierarchy – and `C` brings them back,
needing no second markup because the nested list is already there.

::: cards 3
- **fold**
  - hidden on the projection
  - present in the document
  - `C` unfolds them
- **show**
  - the levels are on the slide too
- **page**
  - never unfolds, for a second level that is a paragraph rather than a bullet
:::

## free: `::: rows` is the same container turned ninety degrees {.wide #rows}

A term in a card on the left, its body beside it, several stacked. **It is
deliberately not a new container**: same slot vocabulary, same auto size, same
fold, same print rules. Only the arrangement of the item differs.

::: rows
- **Anonymity** comes from the others doing the same thing at the same time
- **Unlinkability** means two actions of one person cannot be tied together
- **Deniability** means the record does not prove who acted
:::

The list *is* the grid and each item dissolves into it, which is what gives
every row one term-column width.

## free: `::: side` takes a ratio {.wide #side}

::: side 2:1
Two panes, and the number says how they divide the measure. **A ratio rather
than a set of classes**, because it is the same question `aspect W:H` answers on
a chart and the same two-number answer; a closed list would have had to guess
which handful of splits an author wants and would still refuse the one they
meant.

It costs nothing downstream, which is the criterion worth remembering: **print
stacks the panes**, so a ratio it never reads changes nothing.

::: flip
::: draw {unit=150x60}
box a "2fr" at 0,0 w 1.9 h 1.9 {.tone-2}
box b "1fr" right of a gap 0.22 w 0.95 h 1.9 {.tone-3}
:::
:::

# Revealing a picture {#reveal}

## free: The window walks the beats, and the picture stands still {.wide #reveal-why}

**`::: backdrop dusk {cover} reveal full, right 52%`** – a comma list of places,
one per beat, and the last one persists. Two moves, which are one move in two
directions: a picture that retreats to free the paper the type is written on,
and one that grows over the type and covers it.

It is a **window** and not a size. The picture is painted against the whole
slide either way, so revealing it moves the frame and never the image; scaling
instead would zoom the photograph while it opened, which is a different effect
and not the one anyone asked for.

## figure: {.full #reveal-open}

::: backdrop dusk {cover clear} reveal full, right 52%

::: overlay {left clear standard} from 1
### The picture retreats

and the words arrive in the paper it freed – in the same beat.
:::

> note: Press Space once. The photograph gives up the left half and the overlay
> arrives with it. `from 1` is what holds the block until that beat.

## free: `from` is the other half of the mechanism {.wide #reveal-from}

A chunk's own reveal segments already arrive on a beat; **an overlay had no way
to**. `::: overlay {…} from 1` is one integer rather than a list, because an
overlay is either on the slide or it is not – the backdrop's list says *where
the picture is* at each beat, which is a different question and is why the two
do not share a word.

An overlay **fades** where a reveal segment vanishes: a segment is part of a
text flow, so what follows it closes up, while an overlay sits in its own cell
over a picture and nothing moves when it arrives.

## figure: {.full #reveal-close}

::: backdrop dusk {cover clear over} reveal right 45%, full

::: overlay {bottom-left ink standard} from 1
**A title can be revealed away**\
rather than added to.
:::

> note: The other direction. `over` in the class tail is what puts the picture
> on the type instead of behind it – the one thing the reveal counter cannot do
> by adding segments.

## free: Where the picture sits, and what it is veiled with {.wide #backdrop-slots}

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

**The veil is the theme's own paper**, not white, so ordinary ink stays legible
over a photograph in all seven themes with no second palette. `invert` darkens
instead and re-points the ink tokens, which is what the divider two parts back
uses.

## free: An overlay is a grounded block laid over the slide {.wide #overlay-slots}

Nine places on a 3×3 grid, five grounds, four widths. **All overlays of one
chunk go into one absolutely-positioned grid**, so two aimed at the same corner
stack instead of overlapping.

::: cards 3
- **place**\
  `center` and the eight compass points
- **ground**\
  `paper` `ink` `accent` `clear` `glass`
- **width**\
  `narrow` `standard` `wide` `full`
:::

# A heading the document keeps {#bare}

## free: `{.bare}` gives up the slide and nothing else {.wide #bare-why}

**Leaving the heading text out gives up four things at once** – the slide, the
table of contents, the search index and the printed document. Some talks are a
run of figures with speaker notes and want none of the first; they still need a
name per slide to navigate by and to print.

So `## figure: How a crawl is scored {.full #id .bare}` renders the heading
everywhere except on the projection, and `style: {headings: off}` says the same
for a whole deck. Press `T` on the next slide: it is in the contents. Press `/`
and search for its words: it is in the index.

## figure: The measurement loop {.full #bare-loop .bare}

> note: This slide has a heading. It is in `print.html`, in the contents panel
> and in the search index, and it is not on the projection. That is the whole
> of what the class does.

::: draw {unit=150x56}
box crawl "Crawler"         at 0,0
box site  "Site"            right of crawl gap 2.0
box score "Scoring service" below site gap 1.3
edge crawl.right:0.3 -> site.left:0.3 "request" side top
edge site.left:0.72 -> crawl.right:0.72 "page, or not" side bottom
edge site -> score {.dashed}
:::

## figure: A figure that walks itself {.full #autoplay .bare}

> note: `{autoplay=1400 cycle}` walks the figure's own steps on a timer once the
> slide is on screen, and repeats. It stops for good on the first key, pointer
> or wheel event, because a lecturer who has touched the deck has taken over.

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

Every construction on the preceding slides is additive: a `source.md` that uses
none of them builds exactly as it did before.
