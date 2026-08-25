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
SVG out of the build and into `docs/artifact/figures-you-write.html`.

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

## figure: 6b wrong | the caption lands on what the panel holds {.full #r6bw}

::: diagram {unit=150x52}
# A centred caption is right in an empty box and wrong in a full one: the
# middle of a zone panel is where its contents are, so the word ends up under
# them, with an end showing on either side of the box that covers it.
# The three inner boxes are a stack and are written as one: the first is
# placed against the zone, each later one below the one before it. That way a
# single number says how far down the panel the stack begins, and the gaps
# inside it are half what stands above and below it, so the three read as one
# group before a word of the caption is read.
box zone "TRUSTED ZONE" at 0,0 w 1.05 h 2.9 {.tone-2}
box db  "DB"   at zone.cx,zone.top+1.0 w 0.58 h 0.45 {.paper}
box app "App"  below db gap 0.12 same as db {.paper}
box aut "Auth" below app gap 0.12 same as db {.paper}
:::

## figure: 6b right | it sits where the eye enters the shape {.full #r6br}

::: diagram {unit=150x52}
# One class different. .top moves the caption to the panel's inner top edge,
# which is both where nothing else is and where the eye enters a tall shape.
# The room between the caption and DB is bought by where the stack starts,
# not by pad: pad is the clearance between a border and its own label, so
# raising it walks a .top caption further *down* the panel, towards the very
# box it has to clear. The default clearance is what holds it off the top
# border; the 1.0 below is what holds the stack off the caption.
box zone "TRUSTED ZONE" at 0,0 w 1.05 h 2.9 {.tone-2 .top}
box db  "DB"   at zone.cx,zone.top+1.0 w 0.58 h 0.45 {.paper}
box app "App"  below db gap 0.12 same as db {.paper}
box aut "Auth" below app gap 0.12 same as db {.paper}
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
box  eve "Eve" at 0,0 h 1.05 {.accent}
box  bob "Bob" right of eve gap 2.2 same as eve {.tone-2}
edge eve -> bob "replay"
edge eve -> bob "forgery"
:::

## figure: 8 right | the fraction slides the attachment along the side {.full #r8r}

::: diagram {unit=150x52}
# Each label sits on the outside of its own line: replay above the upper one,
# forgery below the lower one. Without that, both are carried above their
# line, forgery lands in the gap between the two, and the only way to keep
# them apart is to push the boxes far taller than the figure needs.
box  eve "Eve" at 0,0 h 1.05 {.accent}
box  bob "Bob" right of eve gap 2.2 same as eve {.tone-2}
edge eve.right:0.3 -> bob.left:0.3 "replay"  {.accent}
edge eve.right:0.7 -> bob.left:0.7 "forgery" {.accent .bottom}
:::

## figure: 8 skewed | the fraction is measured along each box's own side {.full #r8s}

::: diagram {unit=150x52}
# This block is meant to warn, and the warning is the lesson: the two boxes
# are different heights, so 0.3 of Eve's side and 0.3 of Bob's are not the
# same height above the floor and both lines arrive a degree or so off the
# axis. The fix is the "same as" the right-hand version carries, not a nudge
# on one endpoint.
box  eve "Eve" at 0,0 h 1.05 {.accent}
box  bob "Bob" right of eve gap 2.2 h 1.85 {.tone-2}
edge eve.right:0.3 -> bob.left:0.3 "replay"  {.accent}
edge eve.right:0.7 -> bob.left:0.7 "forgery" {.accent .bottom}
:::

## figure: 11 wrong | the middle box is bigger because its label is longer {.full #r11w}

::: diagram {unit=150x52}
# Three peers of one kind, and nothing said about size at all - which is
# exactly how the accident happens. Each box is as wide as its own label, so
# the one with the longest phrase in it comes out half again as wide as its
# neighbours and reads as the important one.
box a "Sensor" at 0,0 {.tone-1}
box b "Correlation engine" right of a gap 0.4 {.tone-1}
box c "Log" right of b gap 0.4 {.tone-1}
:::

## figure: 11 right | one width for the set, and the long label breaks {.full #r11r}

::: diagram {unit=150x52}
# One explicit w on the first of the set and "same as" on the other two, so
# the three are peers in the drawing as well as in the sentence. The break in
# the long label is written, because nothing here breaks a line for you - and
# it is put where the phrase divides rather than where a measure would fall.
# The height is explicit for the same reason: "same as" copies the size it
# finds, so a one-line first box would hand a one-line height to the box with
# two lines in it.
box a "Sensor" at 0,0 w 1.05 h 0.85 {.tone-1}
box b "Correlation\nengine" right of a gap 0.4 same as a {.tone-1}
box c "Log" right of b gap 0.4 same as a {.tone-1}
:::

## figure: 14 wrong | two long leaders, crossing {.full #r14w}

::: diagram {unit=150x52}
# Both notes are parked on the same side and each points at the far box, so
# the two stubs run diagonally and cross in the middle. A crossing is read as
# a relationship, which is the one claim a leader must never make - and
# neither label is beside what it names, so the reader has to trace a line to
# find out which is which.
box  sw "Switch" at 0,0 h 1.2 w 1.1 {.tone-1}
box  rt "Router" below sw gap 0.75 h 1.2 w 1.1 {.tone-1}
text n1 "learns MAC\naddresses" right of rt gap 0.55 -> sw {.small .muted}
text n2 "forwards by\nprefix" right of sw gap 0.55 -> rt {.small .muted}
:::

## figure: 14 right | each label outside the pair, on a short stub {.full #r14r}

::: diagram {unit=150x52}
# Each note is put beside its own box, on the side where there is room, so
# the two stubs are short, horizontal and parallel and nothing crosses. The
# alignment class is the other half: .right on the label sitting to the left
# of its box and .left on the one sitting to the right run the words towards
# what they name, which is what keeps a two-line note reading as one block
# against the box rather than as a paragraph floating near it.
box  sw "Switch" at 0,0 h 1.2 w 1.1 {.tone-1}
box  rt "Router" below sw gap 0.75 h 1.2 w 1.1 {.tone-1}
text n1 "learns MAC\naddresses" left of sw gap 0.55 -> sw {.small .muted .right}
text n2 "forwards by\nprefix" right of rt gap 0.55 -> rt {.small .muted .left}
:::

## figure: 6c | numbers on the line, words beside it {.full #r6c}

::: diagram {unit=150x52}
# Two conventions, kept apart by what the text is doing. A sequence number is
# an index: it belongs to the wire, so it rides on it with a ground knocked
# out behind it. A message name is a description: it belongs to the reader,
# so it stands clear of the wire where it can be read without cutting the
# line. What ruins both is mixing them from one hop to the next.
# The numbers count *flights*, not arrows, which is why they are
# worth drawing: the middle two records travel together, so they carry one
# number and sit half as far apart as the hops either side. A count that runs
# 1, 2, 3, 4 down the page tells a reader only what the page already told
# them. The phrases are held left of centre because an edge label always sits
# at the middle of its own line, and the two would otherwise be one heap.
box cl "Client" at 0,0 h 3.0 {.tone-2}
box sv "Server" right of cl gap 3.4 h 3.0 {.tone-1}
# Each phrase is placed against its own wire, not against the box. Pinned to
# cl.top it would keep its distance from the Client and lose it from the line
# it names the moment a fraction or a height changed - which is the failure
# writing relations is supposed to prevent, and the one place the grammar
# could not until an edge got a coordinate of its own.
edge cl.right:0.14 -> sv.left:0.14 "1" pad 0.1 {#f1 .paper}
edge sv.left:0.44 -> cl.right:0.44 "2" pad 0.1 {#f2a .paper}
edge sv.left:0.62 -> cl.right:0.62 "2" pad 0.1 {#f2b .paper}
edge cl.right:0.92 -> sv.left:0.92 "3" pad 0.1 {#f3 .paper}
text m1 "ClientHello"       at f1.cx-0.55,f1.cy-0.26 {.small .muted}
text m2 "ServerHello"       at f2a.cx-0.55,f2a.cy-0.26 {.small .muted}
text m3 "Certificate"       at f2b.cx-0.55,f2b.cy-0.26 {.small .muted}
text m4 "ClientKeyExchange" at f3.cx-0.55,f3.cy-0.26 {.small .muted}
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

# Basics

## figure: b1 two boxes {.full #b1}

::: diagram {unit=170x56}
box cl "Client" at 0,0
box sv "Server" right of cl gap 1.4
:::

## figure: b2 an edge {.full #b2}

::: diagram {unit=170x56}
box cl "Client" at 0,0
box sv "Server" right of cl gap 1.4
edge cl -> sv
:::

## figure: b3 placement is an expression {.full #b3}

::: diagram {unit=170x56}
box cl "Client" at 0,0
box sv "Server" right of cl gap 1.4
edge cl -> sv
box log "Log" below sv gap 0.9
edge sv -> log
:::

## figure: b4 the attribute tail {.full #b4}

::: diagram {unit=170x56}
box cl "Client" at 0,0 {.tone-2}
box sv "Server" right of cl gap 1.4 {.tone-1}
edge cl -> sv
box log "Log" below sv gap 0.9 {.tone-3}
edge sv -> log
:::

## figure: b5 words that are not a box {.full #b5}

::: diagram {unit=170x56}
box cl "Client" at 0,0 {.tone-2}
box sv "Server" right of cl gap 1.4 {.tone-1}
edge cl -> sv
box log "Log" below sv gap 0.9 {.tone-3}
edge sv -> log
text n "TLS ends here" right of sv gap 1.2 -> sv {.small .muted}
:::

## figure: b6 an outline around a part of it {.full #b6}

::: diagram {unit=170x56}
box cl "Client" at 0,0 {.tone-2}
box sv "Server" right of cl gap 1.4 {.tone-1}
edge cl -> sv
box log "Log" below sv gap 0.9 {.tone-3}
edge sv -> log
text n "TLS ends here" right of sv gap 1.2 -> sv {.small .muted}
container dmz "DMZ" over sv,log pad 0.4 {.dashed .muted}
:::

# Steps and tags

## figure: four beats, one tag {.full #beats-demo}

::: diagram {unit=160x54}
# The disturbance is one line, `show @attack`. It can be, because an element
# starts hidden exactly when the first thing any step says about it is
# `show` - so every element is written at the top of the block and simply
# appears on the beat that names it.
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
# Nothing here stores a coordinate: the arrows were written as "from cl" and
# "to sv" and the outline as "over @client", so both beats move a drawing
# rather than a number. The verbs differ in what they can address - "to"
# names one position, which a set cannot take without stacking on it; "by"
# is a displacement, the same sentence for one element or four. Both client
# machines are placed absolutely, or the laptop would take the move twice.
box cl  "Client" at 0,0 {.tone-2 @client}
box lap "Laptop" at 0,-1.05 same as cl {.tone-2 @client}
box sv  "Server" right of cl gap 3.0 {.tone-1}
box px  "Proxy"  below cl gap 1.0 offset 1.0,0 {.tone-4}
edge cl -> sv "direct" {#direct .dashed .muted}
edge cl -> px {.muted}
edge px -> sv {.muted}
container zone "client side" over @client pad 0.36 {.dashed .muted}

step interpose
  hide direct
  move px to between cl,sv
  emph px
step withdraw
  move @client by -0.55,0
:::

# Beyond the basics

## figure: sp1 outlines {.full #sp1}

::: diagram {unit=150x52}
box a "SYN seq=c"       at 0,0 {.chevron .tone-3}
box b "SYN+ACK ack=c+1" below a point left {.chevron}
box c "IDS"             right of a {.hex .tone-1}
box d ""                below c {.wedge .tone-4}
box e ""                right of d point up {.wedge}
box f ""                right of e {.cross .accent}
box g "?"               right of f {.diamond .tone-2}
:::

## figure: sp2 a turned label {.full #sp2}

::: diagram {unit=150x52}
box  fw "FIREWALL" at 0,0 h 1.5 {.tone-4 .turn}
box  sw "SWITCH"   right of fw gap 0.7
edge fw -> sw.left
text ax "True Positive Rate" left of fw {.turn}
:::

## figure: sp3 a chart that is still boxes {.full #sp3}

::: diagram {unit=150x52}
# aspect rather than h: w and h are counts of grid cells and a cell here is
# 150 by 52, so the two numbers that look square draw something three times
# wider than it is tall. 4:1 is the proportion the room actually sees.
bars f "20,19,17,12,11,10,9,9,8,7,6,5" ". i e 0 l o 1 / a 3 5 M" at 0,0 w 2.2 aspect 4:1 {.tone-3 .bare}
brace b1 over f-0,f-1,f-2 bottom "the top three"
brace b2 over f-3,f-4,f-5,f-6,f-7 bottom "the next five"
:::

## figure: sp4 a frame and a curve through its points {.full #sp4}

::: diagram {unit=150x52}
# aspect 1:1, because both axes of a ROC plot carry the same quantity and
# the chance diagonal has to arrive at 45 degrees. Written w 1.9 h 1.5 the
# frame came out 285 by 78 - two numbers that look nearly square drawing
# something four times wider than tall, because a grid cell is not square.
plot roc "False positive rate" "True positive rate" at 0,0 w 1.9 aspect 1:1 x 0,1 y 0,1 step 0.2
edge roc@0,roc@0 -> roc@1,roc@1 {.muted .dashed}
edge roc@0,roc@0 -> roc@1,roc@1 via roc@0.03,roc@0.45 roc@0.1,roc@0.72 roc@0.3,roc@0.9 {.smooth .accent}
# A marker has to be sized like one, and the two have to be sized like each
# other. A bare dot is 0.18 grid units across and a bare .cross is a square
# the height of one line of type - both right for a junction in a topology,
# both too heavy for a point inside a frame. These two land at 10 and 13
# pixels, which is a marker rather than an element.
dot  m1 at roc@0.1,roc@0.72 r 0.1 {.accent}
box  m2 "" at roc@0.35,roc@0.95 w 0.09 h 0.26 {.cross .tone-3}
:::

## figure: sp5 one drawing, however often it appears {.full #sp5}

::: diagram {unit=150x52}
grid g image face-ok 8x3 at 0,0 cell 0.26 space 0.09
text n "one file, twenty-four times" right of g
:::

## figure: sp6 evenly spaced by one line {.full #sp6}

::: diagram {unit=150x52}
# Written the way a row gets written: every box against the one before it,
# and one deliberately large gap before the last, which is how an author says
# where the right-hand end belongs. The four widths differ on purpose - the
# statement equalises the distances between *centres*, and against boxes of
# one width there would be nothing to see that equal gaps do not already do.
# The last box of the lower row is placed under its own copy above rather
# than after c2, and that is not tidiness: spread pins the two ends and moves
# everything between them, so an end placed against one of the movers is a
# placement cycle the build refuses by name.
box a1 "a" at 0,0 w 0.7 h 0.5 {.tone-1}
box b1 "b" right of a1 gap 0.2 w 0.3 h 0.5 {.tone-2}
box c1 "c" right of b1 gap 0.2 w 0.55 h 0.5 {.tone-3}
box d1 "d" right of c1 gap 1.5 w 0.4 h 0.5 {.tone-4}
text w1 "as written" right of d1 gap 0.4 {.small .muted}
box a2 "a" below a1 gap 0.55 same as a1 {.tone-1}
box b2 "b" right of a2 gap 0.2 same as b1 {.tone-2}
box c2 "c" right of b2 gap 0.2 same as c1 {.tone-3}
box d2 "d" below d1 gap 0.55 same as d1 {.tone-4}
spread x a2, b2, c2, d2
text w2 "after spread x" right of d2 gap 0.4 {.small .muted}
:::

## figure: sp7 type that fits, and a line over the top {.full #sp7}

::: diagram {unit=150x52}
# Both connectors aim at a corner. An endpoint written .center is a point
# *inside* the box, so nothing is drawn from the border inwards and the line
# stops wherever it happens to cross the edge - which reads as a line that
# missed, in the very specimen the corner anchors are here to demonstrate.
# The middle of this box is named twice all the same, by the dot at
# c.cx,c.cy and by the accent line drawn across c.cy: a coordinate is where
# naming the middle of something works, an arrowhead is not.
box a "FIT" at 0,0 w 1.7 h 0.55 {.fit .tone-2}
box b "this one is far too long to fit" below a gap 0.45 same as a {.shrink .tone-2}
box c "" right of a gap 1.0 w 0.9 h 1.0 {.tone-1}
dot m at c.cx,c.cy r 0.09 {.accent}
edge a.tr -> c.tl {.both-heads .muted}
edge b.br -> c.bl {.muted}
edge c.left-0.55,c.cy -> c.right+0.45,c.cy {.front .accent .no-head}
:::

## figure: sp8 two series {.full #sp8}

::: diagram {unit=150x52}
# Three runs of columns in one frame, and which run stands beside which is
# the argument: the scanner column is beside the hand-reviewed one because
# the two are being compared, and the false positives are stacked on the
# scanner because they are part of what it reported, not a fourth opinion.
# Three separate charts would ask the reader to hold three scales at once.
bars man "12,18,9,4" "info low medium high" at 0,0 w 2.9 h 1.3 {.tone-1}
bars scan "26,31,14,5" series of man {.tone-3}
bars fp "19,22,7,1" series of man stacked {.tone-4}
box  s1 "" at man.left+0.14,man.bottom+0.78 w 0.2 h 0.55 {.tone-1 .sharp}
text n1 "reviewed by hand" right of s1 gap 0.12 {.small .muted}
box  s2 "" right of n1 gap 0.3 same as s1 {.tone-3 .sharp}
text n2 "scanner" right of s2 gap 0.12 {.small .muted}
box  s3 "" right of n2 gap 0.3 same as s1 {.tone-4 .sharp}
text n3 "false positive" right of s3 gap 0.12 {.small .muted}
:::

## figure: sp9 one column singled out {.full #sp9}

::: diagram {unit=150x52}
# emph and calm are written on the statement, so the chart arrives already
# saying which column the sentence beside it is about. Reached by a step
# instead, the opening picture would be five equal columns and the point
# would only exist from beat one onwards.
bars port "12,9,41,7,5" "80 443 22 53 25" at 0,0 w 2.4 h 1.2 emph 2 calm 0,1,3,4 {.tone-3}
text n "one port carries more\nthan the other four together" right of port gap 0.55 -> port-2 {.small .muted .left}
text ax "blocked connection attempts, by destination port, one week" below port gap 0.55 {.small .muted}
:::

## figure: sp10 bars that run sideways {.full #sp10}

::: diagram {unit=150x52}
# horizontal, because the categories are phrases. Upright, "TLS certificate
# mismatch" would have a ninety-pixel column to be written under and a label
# half again as wide as that; flat, it has the whole left margin, and the
# strip is a column of words with their right edges lined up. The lengths
# read better too: the eye compares runs from a shared left edge more
# accurately than it compares heights from a shared floor, which is the
# reason to reach for this and not the shape of the page.
# The tick string is split on "|" here rather than on spaces, which is the
# only way a label with a space in it can be written at all.
# aspect rather than h, because what has to be true of this chart is that its
# five rows have room to be read - a proportion, not a count of grid cells.
bars al "412,268,91,57,24" "SSH brute force | Port scan | DNS tunnelling attempt | SMB exploit attempt | TLS certificate mismatch" at 0,0 horizontal w 3.0 aspect 5:2 emph 0 {.tone-3}
text n "one automated attack accounts\nfor nearly half the week" right of al gap 0.5 -> al-0 {.small .muted .left}
text ax "IDS alerts by signature class, one campus network, one week" below al gap 0.5 {.small .muted}
:::

# Figures a lecture keeps asking for

## figure: a flowchart {.full #fc}

::: diagram {unit=150x52}
# The main road runs straight down and reads as the default: every decision
# that says no leaves it sideways, so a reader who follows the vertical line
# is following the packet that gets through. The fast path is the one branch
# that has to rejoin, so it goes out into a channel of its own rather than
# crossing the road it will come back to.
# Ware would not draw this at all: a procedure of conditions and assignments
# reads faster as four lines of pseudo-code. It is here for the shape.
box in   "Packet in"   at 0,0 w 1.15 {.round .tone-3}
box d1   "Known flow?" below in gap 0.55 {.diamond .tone-1}
box d2   "Rule allows?" below d1 gap 0.55 same as d1 {.diamond .tone-1}
box acc  "Forward"     below d2 gap 0.55 same as in {.round .tone-2}
box drop "Drop"        right of d2 gap 1.0 same as in {.round .accent}
edge in -> d1
edge d1 -> d2 "no" {.right}
edge d2 -> acc "yes" {.right}
edge d2 -> drop "no" {.top}
edge d1.left -> acc.left "yes" via d1.left-0.55,d1.cy d1.left-0.55,acc.cy {.left}
:::

## figure: a swimlane {.full #swim}

::: diagram {unit=110x64}
# The lanes say who and the left-to-right order says when, so neither has to
# be written in a box. Every hand-off changes lane, which is why they are
# elbows: a straight line between two bands reads as a diagonal across a band
# it never enters, and there are four of those here.
lanes swim "User | SOC | IT ops" at 0,0 w 7.05 h 0.95 {.muted .dashed}
box rep "Reports\nsuspect mail"      at swim.left+0.75,swim-0.cy w 1.2 {.tone-2}
box tri "Triage"                     at swim.left+2.05,swim-1.cy w 0.9 {.tone-1}
box con "Confirmed\nmalicious"       at swim.left+3.35,swim-1.cy w 1.15 {.tone-4}
box blk "Block sender,\nrecall copies" at swim.left+4.9,swim-2.cy w 1.3 {.tone-1}
box ntf "Told what\nto look for"      at swim.left+6.3,swim-0.cy w 1.15 {.tone-2}
edge rep -> tri {.elbow}
edge tri -> con
edge con -> blk {.elbow}
edge blk -> ntf {.elbow}
:::

## figure: a tree {.full #tree}

::: diagram {unit=95x95}
# Written from the leaves up, because the leaves are the fixed points - they
# are what a browser is actually asked about - and every parent is then the
# midpoint of what it signs. Move a leaf and the two ranks above it re-centre
# with no other line touched. The connectors carry no arrowheads: a signature
# has a direction, but drawing it turns an org chart into a dataflow.
box l1 "www.example.org"  at 0,0 w 1.5 h 0.72 {.tone-2}
box l2 "mail.example.org" right of l1 gap 0.2 same as l1 {.tone-2}
box l3 "vpn.example.net"  right of l2 gap 0.5 same as l1 {.tone-2}
box i1 "Issuing CA A" between l1,l2 offset 0,-1.5 same as l1 {.tone-1}
box i2 "Issuing CA B" at l3.cx,i1.cy same as l1 {.tone-1}
box rt "Root CA"      between i1,i2 offset 0,-1.5 same as l1 {.tone-4}
edge i1 -- l1 {.elbow .muted}
edge i1 -- l2 {.elbow .muted}
edge i2 -- l3 {.muted}
edge rt -- i1 {.elbow .muted}
edge rt -- i2 {.elbow .muted}
:::

## figure: a table, a row at a time {.full #table-demo}

::: diagram {unit=150x52}
# A cell carries a tag for its row and a tag for its column, so a beat is one
# name rather than three cell names kept in step by hand - and a tag is a tag,
# so `show @t-row-2` brings a row in exactly as `style @t-row-2` tints one.
# The rows arrive one at a time rather than sitting there being highlighted:
# an element starts hidden when the first thing a step says about it is
# `show`, and nothing says that about the heading, so the table opens as its
# own column headings and fills in under them. The closing beat is what a
# printed copy gets, which is why the argument ends on the answers rather
# than on whichever row happened to be lit when the lecture stopped.
table t "Layer | Forgery | Countermeasure" at 0,0 col 1.15,1.55,1.7 h 0.44 {.clear .bare .left}
"Link | ARP spoofing | Dynamic ARP inspection"
"Network | IP source spoofing | Ingress filtering (BCP 38)"
"Transport | Blind TCP reset | Sequence-number checks"
"Application | DNS cache poisoning | DNSSEC"

step the-link-layer-can-be-forged
  show @t-row-1
step so-can-the-network-layer
  show @t-row-2
step and-the-transport-layer
  show @t-row-3
step and-the-application-layer
  show @t-row-4
step every-one-of-them-has-an-answer
  style @t-col-2 {.tone-2}
:::
