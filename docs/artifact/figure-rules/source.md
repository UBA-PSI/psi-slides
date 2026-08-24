---
title: Figure rules
subtitle: "The wrong/right pairs from figure-design.md, as compilable figures"
author: Dominik Herrmann
collapse: none
diagram-defaults: |
  default text {.small}
---

## title: Figure rules | the wrong/right pairs, as compilable figures {#cover}

This lecture exists to be **compiled, not delivered**. Each chunk is one half of
a wrong/right pair from `figure-design.md`, cut down to the fewest elements that
still make the point, and `docs/artifact/refresh-figures.mjs` lifts the emitted
SVG out of the build and into `docs/artifact/thirty-six-figures.html`.

Keeping it as a lecture rather than a fixture is what makes it honest: the
drawings in the artifact are produced by the same compiler a real lecture runs,
so a change to the compiler that would break them breaks them *here* first.

The chunk ids are the contract with the refresh script. Do not rename them.

# The pairs

## figure: 1 wrong | even gaps say nothing {.full #r1w}

::: diagram {unit=150x52}
box a "Switch"    at 0,0 {.tone-1}
box b "Router"    right of a gap 0.5 {.tone-1}
box c "Resolver"  right of b gap 0.5 {.tone-1}
box d "Webserver" right of c gap 0.5 {.tone-2}
:::

## figure: 1 right | the pair is a pair before you read it {.full #r1r}

::: diagram {unit=150x52}
box a "Switch"    at 0,0 {.tone-1}
box b "Router"    right of a gap 0.25 {.tone-1}
box c "Resolver"  right of b gap 0.9 {.tone-1}
box d "Webserver" right of c gap 0.25 {.tone-2}
:::

## figure: 2 wrong | the home network is "the stuff on the left" {.full #r2w}

::: diagram {unit=150x52}
box a "A" at 0,0 {.tone-2}
box b "B" right of a gap 0.3 {.tone-2}
box r "Router" right of b gap 1.6 {.tone-1}
:::

## figure: 2 right | common region beats proximity {.full #r2r}

::: diagram {unit=150x52}
box a "A" at 0,0 {.tone-2}
box b "B" right of a gap 0.3 {.tone-2}
box r "Router" right of b gap 1.6 {.tone-1}
container home "Home network" over a,b pad 0.4 {.dashed}
:::

## figure: 3 wrong | an arrow used as a pointing finger {.full #r3w}

::: diagram {unit=150x52}
box  sw "Switch" at 0,0 {.tone-1}
text n  "learns MAC addresses" right of sw gap 1.2
edge n -> sw
:::

## figure: 3 right | a leader reads as an annotation {.full #r3r}

::: diagram {unit=150x52}
box  sw "Switch" at 0,0 {.tone-1}
text n  "learns MAC addresses" right of sw gap 1.2 -> sw {.small .muted}
:::

## figure: 6a wrong | type on a line is read as texture {.full #r6aw}

::: diagram {unit=150x52}
box sw "Switch" at 0,0 {.tone-1}
box rt "Router" right of sw gap 2.4 {.tone-1}
edge sw -> rt
text lbl "10.1.1.0/24" between sw,rt
:::

## figure: 6a right | .paper punches the line out behind the word {.full #r6ar}

::: diagram {unit=150x52}
box sw "Switch" at 0,0 {.tone-1}
box rt "Router" right of sw gap 2.4 {.tone-1}
edge sw -> rt
text lbl "10.1.1.0/24" between sw,rt pad 0.12 {.paper .small}
:::

## figure: 6b wrong | the label floats in a tall panel {.full #r6bw}

::: diagram {unit=150x52}
box zone "TRUSTED" at 0,0 w 1.2 h 2.4 {.tone-2}
:::

## figure: 6b right | it sits where the eye enters the shape {.full #r6br}

::: diagram {unit=150x52}
box zone "TRUSTED" at 0,0 w 1.2 h 2.4 {.tone-2 .top}
:::

## figure: 7 wrong | down, across, down again to dodge Dec {.full #r7w}

::: diagram {unit=150x52}
box c0  "C0"  at 0,0 {.tone-3}
box dec "Dec" below c0 gap 0.5 {.tone-1}
box x1  "X1"  below dec gap 0.5 {.tone-3}
box p1  "P1"  right of x1 gap 0.9 {.tone-2}
edge x1 -> p1
edge c0 -> x1 via c0.cx,c0.bottom+0.25 c0.right+0.4,c0.bottom+0.25 c0.right+0.4,x1.top-0.25 x1.cx,x1.top-0.25
:::

## figure: 7 right | out sideways into the channel, then down {.full #r7r}

::: diagram {unit=150x52}
# The left channel, not the right one: X1 -> P1 already occupies the right,
# and an arrow arriving on that same line would break rule 8 inside the
# example that is supposed to demonstrate rule 7.
box c0  "C0"  at 0,0 {.tone-3}
box dec "Dec" below c0 gap 0.5 {.tone-1}
box x1  "X1"  below dec gap 0.5 {.tone-3}
box p1  "P1"  right of x1 gap 0.9 {.tone-2}
edge x1 -> p1
edge c0 -> x1 via c0.left-0.4,c0.cy c0.left-0.4,x1.cy
:::

## figure: 8 wrong | two arrows on one line, two labels on one word {.full #r8w}

::: diagram {unit=150x52}
box  eve "Eve" at 0,0 h 1.15 {.accent}
box  bob "Bob" right of eve gap 2.2 same as eve {.tone-2}
edge eve -> bob "replay"
edge eve -> bob "forgery"
:::

## figure: 8 right | the fraction slides the attachment along the side {.full #r8r}

::: diagram {unit=150x52}
# h 1.15 rather than the 0.75 this started at: at the shorter height the two
# labels sat close enough to crowd each other, which is the failure the
# wrong-hand version is meant to own.
box  eve "Eve" at 0,0 h 1.15 {.accent}
box  bob "Bob" right of eve gap 2.2 same as eve {.tone-2}
edge eve.right:0.3 -> bob.left:0.3 "replay"  {.accent}
edge eve.right:0.7 -> bob.left:0.7 "forgery" {.accent}
:::

## figure: the seven fills, mixed from the page's own inks {.full #tones}

::: diagram {unit=150x52}
box t1 "tone-1" at 0,0 {.tone-1}
box t2 "tone-2" right of t1 gap 0.16 same as t1 {.tone-2}
box t3 "tone-3" right of t2 gap 0.16 same as t1 {.tone-3}
box t4 "tone-4" right of t3 gap 0.16 same as t1 {.tone-4}
box ac "accent" right of t4 gap 0.16 same as t1 {.accent}
box dm "dim"    right of ac gap 0.16 same as t1 {.dim}
box mu "muted"  right of dm gap 0.16 same as t1 {.muted}
:::

# Steps and tags

## figure: four beats, one tag {.full #beats-demo}

::: diagram {unit=160x54}
# The four-beat order from figure-design.md on the smallest scene that still
# carries an argument. Nothing here is revealed element by element: the
# disturbance is one line, `show @attack`, and the wire and the forged answer
# come with it because an edge is only as visible as its ends.
box  a  "A"      at 0,0 {.tone-2}
box  sw "Switch" right of a gap 1.2 {.tone-1}
box  b  "B"      right of sw gap 1.2 {.tone-2}
edge a -- sw {.muted}
edge sw -- b {.muted}

text q "who has 10.1.1.5?" above sw gap 0.7 pad 0.1 {.small .paper @ask}
text r "10.1.1.5 is at bb:bb" below b gap 0.6 pad 0.1 {.small .paper @answer}

box  e  "E" below sw gap 1.15 {.accent @attack}
edge e.top -- sw.bottom {.accent @attack}
text s "10.1.1.5 is at ee:ee" right of e gap 0.6 pad 0.1 -> e {.small .paper .accent @attack}

step ask
  show @ask
  emph a
step answer
  show @answer
  emph b
  calm a
step spoof
  show @attack
  emph e
  calm b
step redirected
  style r {.dim}
  emph e, s
:::

## figure: a box that walks away {.full #move-demo}

::: diagram {unit=160x54}
# Nothing here stores a coordinate. The two arrows were written as "from cl"
# and "to sv", and the outline as "over cl,px" - so when the proxy moves,
# they follow, and the outline re-fits around a row instead of a column.
box cl "Client" at 0,0 {.tone-2}
box sv "Server" right of cl gap 3.0 {.tone-1}
box px "Proxy"  below cl gap 1.0 offset 1.0,0 {.tone-4}
edge cl -> sv "direct" {#direct .dashed .muted}
edge cl -> px {.muted}
edge px -> sv {.muted}
container zone "client side" over cl,px pad 0.36 {.dashed .muted}

step interpose
  hide direct
  move px to between cl,sv
  emph px
:::
