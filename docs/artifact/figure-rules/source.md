---
title: Figure rules
subtitle: "The wrong/right pairs from figure-design.md, as compilable figures"
author: Dominik Herrmann
collapse: none
draw-defaults: |
  default text {.small}
---

## title: Figure rules | the wrong/right pairs, as compilable figures {#cover}

This lecture exists to be **compiled, not delivered**. Each chunk is one half of
a wrong/right pair from `figure-design.md`, cut down to the fewest elements that
still make the point, and `docs/artifact/refresh-figures.mjs` lifts the emitted
SVG out of the build and into `docs/artifact/figures-you-write.html`.

The drawings in the artifact are produced by the same compiler a real lecture
runs, so a change to the compiler that would break them breaks them *here*
first.

The chunk ids are the contract with the refresh script. Do not rename them.

# The opening

## figure: hero, the whole of a figure {.full #hero}

::: draw
# Five statements, and nothing in them is a coordinate but the two gaps. Eve
# is placed against Alice and Bob against Eve, so the row is a chain of
# relations; the two wires name their ends and work out their own route.
# The first figure anyone meets on the artifact page, and the one block in
# this lecture with no option tail on the fence and no `at` on the first box.
# The page explains both further down; here they would be two pieces of
# syntax a reader cannot yet read, in a listing whose claim is that it is
# complete.
box alice "Alice"
box eve "Eve"  right of alice gap 1.7 {.accent}
box bob "Bob"  right of eve gap 1.7
edge alice -> eve "plaintext"
edge eve -> bob "plaintext"
:::

## figure: the picture the site opens with {.full #sitehero}

::: draw {unit=150x38}
# The figure at the top of docs/site/figures.html. Encapsulation drawn as what
# it is - each layer wrapping the one before it - rather than as a stack of
# four bars, which is the same fact drawn as a list.
# It opens finished and the beats walk outwards through it, one header at a
# time, and the last one hands the finished frame to the link.
# Nothing here is a coordinate, and nothing here is a measurement either: every
# outline fits whatever it holds, the hop sizes itself from its own turned
# label, and the arrow is handed two ends. So widening the payload label
# re-fits all three wrappers and re-aims the wire with no number changing
# anywhere - which is the claim the page under it makes, drawn rather than
# asserted.
# The `payload` is 1.5 units where it used to be 1.9: the hero column is 462px
# wide, so what the hop costs across has to be paid for somewhere, and the
# figure fills the gap the shorter column leaves without making the hero
# taller. The gap of 2.2 is the arrow's own label - the one distance in the
# block that has something to hold.
box       pay "payload" w 1.5 {.accent}
container tcp "TCP"      over pay pad 0.36
container ip  "IP"       over tcp pad 0.36
container eth "Ethernet" over ip  pad 0.36
box       hop "the next hop" right of eth gap 2.2 {.turn}
edge link eth -> hop "one frame"

step payload
  emph pay
step tcp
  emph tcp
step ip
  emph ip
step ethernet
  emph eth
step wire
  emph hop, link
:::

## figure: hero, one line changes and everything follows {.full #follow}

::: draw {unit=170x56}
# The cast is written once, at the top, whether or not it is on screen at the
# opening beat. Eve is hidden there because the first thing any step says
# about her is `show` - and her two wires and her outline arrive with her
# without a word, because an edge is only as visible as its ends and an
# outline only as visible as its members.
# Every beat has to fit one frame, so the room Eve will need is reserved
# from the opening beat. At 3.3:1 that reservation rendered as a third of a
# panel of empty paper under two boxes; at 4.4:1 it reads as a margin. The
# gaps here are set for that proportion rather than for the spacing rules.
# Eve is `between` the two rather than `below alice` with an offset, and that is
# the figure practising what its own caption claims. The offset was a guessed
# 1.7 grid units, which put her 28.9px left of the midpoint - close enough to
# centred to read as a mistake rather than as a decision, and wrong again the
# moment either gap changes. `between` states the relation and cannot drift.
box  alice  "Alice"
box  bob  "Bob"   right of alice gap 10.3
box  eve  "Eve"   between alice,bob offset 0,1.5 {.accent}
edge direct alice -> bob "message"
edge alice -> eve {.accent}
edge eve -> bob {.accent}
container zone "Eve's reach" over eve pad 0.45 {.dashed .muted}

# The second beat is one line. Nothing in the figure stores a coordinate, so
# a longer label widens Eve's box, both her arrows re-aim at the sides that
# moved, and the outline re-fits around her. Measured on the emitted
# geometry: the box goes 54 to 116.3 wide, the outline 104.4 to 166.7, and
# each arrow moves 31 pixels, one left and one right. Re-measure these
# numbers if the geometry above changes - the artifact page quotes them.
step intercept
  show eve
  hide direct
step relabel
  label eve "Eve, on path"
  emph eve
:::

# The pairs

## figure: 1 wrong | even gaps say nothing {.full #r1w}

::: draw {unit=150x52}
box a "Switch"    at 0,0 {.tone-1}
box b "Router"    right of a gap 1.45 {.tone-1}
box c "Resolver"  right of b gap 1.45 {.tone-1}
box d "Webserver" right of c gap 1.45 {.tone-2}
:::

## figure: 1 right | the pair is a pair before you read it {.full #r1r}

::: draw {unit=150x52}
box a "Switch"    at 0,0 {.tone-1}
box b "Router"    right of a gap 0.7 {.tone-1}
box c "Resolver"  right of b gap 2.6 {.tone-1}
box d "Webserver" right of c gap 0.7 {.tone-2}
:::

## figure: 2 wrong | the home network is "the stuff on the left" {.full #r2w}

::: draw {unit=150x52}
box a "A" at 0,0 {.tone-2}
box b "B" right of a gap 0.85 {.tone-2}
box r "Router" right of b gap 4.6 {.tone-1}
:::

## figure: 2 right | common region beats proximity {.full #r2r}

::: draw {unit=150x52}
box a "A" at 0,0 {.tone-2}
box b "B" right of a gap 0.85 {.tone-2}
box r "Router" right of b gap 4.6 {.tone-1}
container home "Home network" over a,b pad 0.4 {.dashed}
:::

## figure: 3 wrong | an arrow used as a pointing finger {.full #r3w}

::: draw {unit=150x52}
box  sw "Switch" at 0,0 {.tone-1}
text n  "learns MAC addresses" right of sw gap 3.45
edge n -> sw
:::

## figure: 3 right | a leader reads as an annotation {.full #r3r}

::: draw {unit=150x52}
box  sw "Switch" at 0,0 {.tone-1}
text n  "learns MAC addresses" right of sw gap 3.45 -- sw {.small .muted}
:::

## figure: 6a wrong | type on a line is read as texture {.full #r6aw}

::: draw {unit=150x52}
box sw "Switch" at 0,0 {.tone-1}
box rt "Router" right of sw gap 6.9 {.tone-1}
edge sw -> rt
text lbl "10.1.1.0/24" between sw,rt
:::

## figure: 6a right | .paper punches the line out behind the word {.full #r6ar}

::: draw {unit=150x52}
box sw "Switch" at 0,0 {.tone-1}
box rt "Router" right of sw gap 6.9 {.tone-1}
edge sw -> rt
text lbl "10.1.1.0/24" between sw,rt pad 0.12 {.paper .small}
:::

## figure: 6b wrong | the caption lands on what the panel holds {.full #r6bw}

::: draw {unit=150x52}
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

::: draw {unit=150x52}
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

::: draw {unit=150x52}
box c0  "C0"  at 0,0 {.tone-3}
box dec "Dec" below c0 gap 0.5 {.tone-1}
box x1  "X1"  below dec gap 0.5 {.tone-3}
box p1  "P1"  right of x1 gap 2.6 {.tone-2}
edge x1 -> p1
edge c0 -> x1 via c0.cx,c0.bottom+0.25 c0.right+0.4,c0.bottom+0.25 c0.right+0.4,x1.top-0.25 x1.cx,x1.top-0.25
:::

## figure: 7 right | out sideways into the channel, then down {.full #r7r}

::: draw {unit=150x52}
# The left channel, not the right one: X1 -> P1 already occupies the right,
# and an arrow arriving on that same line would break rule 8 inside the
# example that is supposed to demonstrate rule 7.
box c0  "C0"  at 0,0 {.tone-3}
box dec "Dec" below c0 gap 0.5 {.tone-1}
box x1  "X1"  below dec gap 0.5 {.tone-3}
box p1  "P1"  right of x1 gap 2.6 {.tone-2}
edge x1 -> p1
edge c0 -> x1 via c0.left-0.4,c0.cy c0.left-0.4,x1.cy
:::

## figure: 8 wrong | two arrows on one line, two labels on one word {.full #r8w}

::: draw {unit=150x52}
box  eve "Eve" at 0,0 h 1.05 {.accent}
box  bob "Bob" right of eve gap 6.35 same as eve {.tone-2}
edge eve -> bob "replay"
edge eve -> bob "forgery"
:::

## figure: 8 right | the fraction slides the attachment along the side {.full #r8r}

::: draw {unit=150x52}
# Each label sits on the outside of its own line: replay above the upper one,
# forgery below the lower one. Without that, both are carried above their
# line, forgery lands in the gap between the two, and the only way to keep
# them apart is to push the boxes far taller than the figure needs.
box  eve "Eve" at 0,0 h 1.05 {.accent}
box  bob "Bob" right of eve gap 6.35 same as eve {.tone-2}
edge eve.right:0.3 -> bob.left:0.3 "replay"  {.accent}
edge eve.right:0.7 -> bob.left:0.7 "forgery" {.accent} side bottom
:::

## figure: 8 skewed | the fraction is measured along each box's own side {.full #r8s}

::: draw {unit=150x52}
# This block is meant to warn, and the warning is the lesson: the two boxes
# are different heights, so 0.3 of Eve's side and 0.3 of Bob's are not the
# same height above the floor and both lines arrive a degree or so off the
# axis. The fix is the "same as" the right-hand version carries, not a nudge
# on one endpoint.
box  eve "Eve" at 0,0 h 1.05 {.accent}
box  bob "Bob" right of eve gap 6.35 h 1.85 {.tone-2}
edge eve.right:0.3 -> bob.left:0.3 "replay"  {.accent}
edge eve.right:0.7 -> bob.left:0.7 "forgery" {.accent} side bottom
:::

## figure: 11 wrong | the middle box is bigger because its label is longer {.full #r11w}

::: draw {unit=150x52}
# Three peers of one kind, and nothing said about size at all - which is
# exactly how the accident happens. Each box is as wide as its own label, so
# the one with the longest phrase in it comes out half again as wide as its
# neighbours and reads as the important one.
box a "Sensor" at 0,0 {.tone-1}
box b "Correlation engine" right of a gap 1.15 {.tone-1}
box c "Log" right of b gap 1.15 {.tone-1}
:::

## figure: 11 right | one width for the set, and the long label breaks {.full #r11r}

::: draw {unit=150x52}
# One explicit w on the first of the set and "same as" on the other two, so
# the three are peers in the drawing as well as in the sentence. The break in
# the long label is written, because nothing here breaks a line for you - and
# it is put where the phrase divides rather than where a measure would fall.
# The height is explicit for the same reason: "same as" copies the size it
# finds, so a one-line first box would hand a one-line height to the box with
# two lines in it.
box a "Sensor" at 0,0 w 1.05 h 0.85 {.tone-1}
box b "Correlation\nengine" right of a gap 1.15 same as a {.tone-1}
box c "Log" right of b gap 1.15 same as a {.tone-1}
:::

## figure: 12 wrong | every arrow travels against the way the room reads {.full #r12w}

::: draw {unit=150x60}
# The same chain laid out right to left, so every arrow travels against the
# direction the room is already reading in. The note hangs off the middle box
# and is placed by nothing but where it reads best - no edge joins it.
box c "Service"  at 0,0 {.tone-2}
box b "Filter"   right of c gap 0.75 {.tone-1}
box a "Request"  right of b gap 0.75 {.tone-2}
edge a -> b
edge b -> c
text n "and the drop is logged" below b gap 0.5 {.small .muted}
:::

## figure: 12 right | the flow runs with the eye, and a note needs no edge {.full #r12r}

::: draw {unit=150x60}
# The same three, laid out the way the room reads: the arrows now travel with
# the eye instead of against it. The note is still joined to nothing - where it
# sits is the whole of what says which box it is about.
box a "Request"  at 0,0 {.tone-2}
box b "Filter"   right of a gap 0.75 {.tone-1}
box c "Service"  right of b gap 0.75 {.tone-2}
edge a -> b
edge b -> c
text n "and the drop is logged" below b gap 0.5 {.small .muted}
:::

## figure: 15 wrong | the outline is gone and the fill is too pale to replace it {.full #r15w}

::: draw {unit=150x60}
# One box has had its outline taken away and kept the palest fill there is.
# Beside three that still have theirs it stops reading as a box at all - which
# is only visible next to the neighbours it is meant to belong with.
box a "Sensor"  at 0,0 {.bare .tone-1}
box b "Engine"  right of a gap 0.5 {.tone-1}
box c "Store"   right of b gap 0.5 {.tone-1}
box d "Console" right of c gap 0.5 {.tone-1}
:::

## figure: 15 right | the same box, in a fill dark enough to be the shape {.full #r15r}

::: draw {unit=150x60}
# The same box, with a fill dark enough to be the shape on its own. Nothing
# else changed: the outline is still gone, and it still reads as a box, which
# is the whole of what the darker fill bought.
box a "Sensor"  at 0,0 {.bare .tone-3}
box b "Engine"  right of a gap 0.5 {.tone-1}
box c "Store"   right of b gap 0.5 {.tone-1}
box d "Console" right of c gap 0.5 {.tone-1}
:::

## figure: 14 wrong | two long leaders, crossing {.full #r14w}

::: draw {unit=150x52}
# Both notes are parked on the same side and each points at the far box, so
# the two stubs run diagonally and cross in the middle. A crossing is read as
# a relationship, which is the one claim a leader must never make - and
# neither label is beside what it names, so the reader has to trace a line to
# find out which is which.
box  sw "Switch" at 0,0 h 1.2 w 1.1 {.tone-1}
box  rt "Router" below sw gap 0.75 h 1.2 w 1.1 {.tone-1}
text n1 "learns MAC\naddresses" right of rt gap 1.6 -- sw {.small .muted}
text n2 "forwards by\nprefix" right of sw gap 1.6 -- rt {.small .muted}
:::

## figure: 14 right | each label outside the pair, on a short stub {.full #r14r}

::: draw {unit=150x52}
# Each note is put beside its own box, on the side where there is room, so
# the two stubs are short, horizontal and parallel and nothing crosses. The
# alignment class is the other half: .right on the label sitting to the left
# of its box and .left on the one sitting to the right run the words towards
# what they name, which is what keeps a two-line note reading as one block
# against the box rather than as a paragraph floating near it.
box  sw "Switch" at 0,0 h 1.2 w 1.1 {.tone-1}
box  rt "Router" below sw gap 0.75 h 1.2 w 1.1 {.tone-1}
text n1 "learns MAC\naddresses" left of sw gap 1.6 -- sw {.small .muted .right}
text n2 "forwards by\nprefix" right of rt gap 1.6 -- rt {.small .muted .left}
:::

## figure: 6c | numbers on the line, words beside it {.full #r6c}

::: draw {unit=150x52}
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
box sv "Server" right of cl gap 9.8 h 3.0 {.tone-1}
# Each phrase is placed against its own wire, not against the box. Pinned to
# cl.top it would keep its distance from the Client and lose it from the line
# it names the moment a fraction or a height changed - which is the failure
# writing relations is supposed to prevent, and the one place the grammar
# could not until an edge got a coordinate of its own.
edge f1 cl.right:0.14 -> sv.left:0.14 "1" pad 0.1 {.paper}
edge f2a sv.left:0.44 -> cl.right:0.44 "2" pad 0.1 {.paper}
edge f2b sv.left:0.62 -> cl.right:0.62 "2" pad 0.1 {.paper}
edge f3 cl.right:0.92 -> sv.left:0.92 "3" pad 0.1 {.paper}
text m1 "ClientHello"       at f1.cx-0.55,f1.cy-0.26 {.small .muted}
text m2 "ServerHello"       at f2a.cx-0.55,f2a.cy-0.26 {.small .muted}
text m3 "Certificate"       at f2b.cx-0.55,f2b.cy-0.26 {.small .muted}
text m4 "ClientKeyExchange" at f3.cx-0.55,f3.cy-0.26 {.small .muted}
:::

## figure: the seven fills, mixed from the page's own inks {.full #tones}

::: draw {unit=150x52}
box t1 "tone-1" at 0,0 {.tone-1}
box t2 "tone-2" right of t1 gap 0.45 same as t1 {.tone-2}
box t3 "tone-3" right of t2 gap 0.45 same as t1 {.tone-3}
box t4 "tone-4" right of t3 gap 0.45 same as t1 {.tone-4}
box ac "accent" right of t4 gap 0.45 same as t1 {.accent}
box dm "dim"    right of ac gap 0.45 same as t1 {.dim}
box mu "muted"  right of dm gap 0.45 same as t1 {.muted}
:::

# Basics

## figure: b1 two boxes {.full #b1}

::: draw {unit=170x56}
box cl "Client" at 0,0
box sv "Server" right of cl gap 4.25
:::

## figure: b2 an edge {.full #b2}

::: draw {unit=170x56}
box cl "Client" at 0,0
box sv "Server" right of cl gap 4.25
edge cl -> sv
:::

## figure: b3 placement is an expression {.full #b3}

::: draw {unit=170x56}
box cl "Client" at 0,0
box sv "Server" right of cl gap 4.25
edge cl -> sv
box log "Log" below sv gap 0.9
edge sv -> log
:::

## figure: b4 the attribute tail {.full #b4}

::: draw {unit=170x56}
box cl "Client" at 0,0 {.tone-2}
box sv "Server" right of cl gap 4.25 {.tone-1}
edge cl -> sv
box log "Log" below sv gap 0.9 {.tone-3}
edge sv -> log
:::

## figure: b5 words that are not a box {.full #b5}

::: draw {unit=170x56}
box cl "Client" at 0,0 {.tone-2}
box sv "Server" right of cl gap 4.25 {.tone-1}
edge cl -> sv
box log "Log" below sv gap 0.9 {.tone-3}
edge sv -> log
text n "TLS ends here" right of sv gap 3.65 -- sv {.small .muted}
:::

## figure: b6 an outline around a part of it {.full #b6}

::: draw {unit=170x56}
box cl "Client" at 0,0 {.tone-2}
box sv "Server" right of cl gap 4.25 {.tone-1}
edge cl -> sv
box log "Log" below sv gap 0.9 {.tone-3}
edge sv -> log
text n "TLS ends here" right of sv gap 3.65 -- sv {.small .muted}
container dmz "DMZ" over sv,log pad 0.4 {.dashed .muted}
:::

# Steps and tags

## figure: four beats, one tag {.full #beats-demo}

::: draw {unit=160x54}
# The disturbance is one line, `show @attack`. It can be, because an element
# starts hidden exactly when the first thing any step says about it is
# `show` - so every element is written at the top of the block and simply
# appears on the beat that names it.
box  a  "A"      at 0,0 {.tone-2}
box  sw "Switch" right of a gap 3.55 {.tone-1}
box  b  "B"      right of sw gap 3.55 {.tone-2}
edge a -- sw {.muted}
edge sw -- b {.muted}

text q "who has 10.1.1.5?" above sw gap 0.7 pad 0.1 {.small .paper @ask}
text r "10.1.1.5 is at bb:bb" below b gap 0.6 pad 0.1 {.small .paper .dim @answer}

box  e  "E" below sw gap 1.15 {.accent @attack}
edge e.top -- sw.bottom {.accent @attack}
text s "10.1.1.5 is at ee:ee" right of e gap 1.8 pad 0.1 -- e {.small .paper .accent @attack}

step ask
  show @ask
  emph a
step answer
  show @answer
  emph b
  dim a
  # Full prominence for exactly the beats where this is the right answer.
  # Print takes prominence from the opening beat, where `r` carries .dim, so
  # the handout shows the true reply already superseded - which is the whole
  # argument of this figure. The live reading is unchanged: `r` is loud while
  # it is correct and quiet again once the spoof has replaced it.
  style r {!dim}
step spoof
  show @attack
  emph e
  dim b
step redirected
  style r {.dim}
  emph e, s
:::

## figure: a box that walks away {.full #move-demo}

::: draw {unit=160x54}
# Nothing here stores a coordinate: the arrows were written as "from cl" and
# "to sv" and the outline as "over @client", so both beats move a drawing
# rather than a number. The verbs differ in what they can address - "to"
# names one position, which a set cannot take without stacking on it; "by"
# is a displacement, the same sentence for one element or four. Both client
# machines are placed absolutely, or the laptop would take the move twice.
box cl  "Client" at 0,0 {.tone-2 @client}
box lap "Laptop" at 0,-1.05 same as cl {.tone-2 @client}
box sv  "Server" right of cl gap 8.9 {.tone-1}
box px  "Proxy"  below cl gap 1.0 offset 1.0,0 {.tone-4}
edge direct cl -> sv "direct" {.dashed .muted}
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

::: draw {unit=150x52}
box a "SYN seq=c"       at 0,0 {.chevron .tone-3}
box b "SYN+ACK ack=c+1" below a point left {.chevron}
box c "IDS"             right of a gap 0.7 {.hex .tone-1}
box d ""                below c {.wedge .tone-4}
box e ""                right of d gap 0.7 point up {.wedge}
box f ""                right of e gap 0.7 {.cross .accent}
box g "?"               right of f gap 0.7 {.diamond .tone-2}
:::

## figure: sp2 a turned label {.full #sp2}

::: draw {unit=150x52}
box  fw "FIREWALL" at 0,0 h 1.5 {.tone-4 .turn}
box  sw "SWITCH"   right of fw gap 2
edge fw -> sw.left
text ax "True Positive Rate" left of fw gap 0.7 {.turn}
:::

## figure: sp3 a chart that is still boxes {.full #sp3}

::: draw {unit=150x52}
# aspect rather than h: w and h are counts of grid cells and a cell here is
# 150 by 52, so the two numbers that look square draw something three times
# wider than it is tall. 4:1 is the proportion the room actually sees.
bars f "20,19,17,12,11,10,9,9,8,7,6,5" ". i e 0 l o 1 / a 3 5 M" at 0,0 w 2.2 aspect 4:1 {.tone-3 .bare}
brace b1 over f-0,f-1,f-2 side bottom "the top three"
brace b2 over f-3,f-4,f-5,f-6,f-7 side bottom "the next five"
:::

## figure: sp4 a frame and a curve through its points {.full #sp4}

::: draw {unit=150x52}
# aspect 1:1, because both axes of a ROC plot carry the same quantity and
# the chance diagonal has to arrive at 45 degrees. Written w 1.9 h 1.5 the
# frame came out 285 by 78 - two numbers that look nearly square drawing
# something four times wider than tall, because a grid cell is not square.
plot roc "False positive rate" "True positive rate" at 0,0 w 1.9 aspect 1:1 x 0,1 y 0,1 tick 0.2
edge roc@0,roc@0 -> roc@1,roc@1 {.muted .dashed}
edge roc@0,roc@0 -> roc@1,roc@1 via roc@0.03,roc@0.45 roc@0.1,roc@0.72 roc@0.3,roc@0.9 {.smooth .accent}
# A marker has to be sized like one, and the two have to be sized like each
# other. A bare dot has a radius of 0.18 grid units, so it is 0.36 across,
# and a bare .cross is a square the height of one line of type - both right
# for a junction in a topology, both too heavy for a point inside a frame.
# These two land at 10 and 13 pixels, which is a marker rather than an
# element.
dot  m1 at roc@0.1,roc@0.72 r 0.1 {.accent}
box  m2 "" at roc@0.35,roc@0.95 w 0.09 h 0.26 {.cross .tone-3}
:::

## figure: sp4b the same two numbers, said the two ways {.full #sp4b}

::: draw {unit=150x52}
# The same width, the other dimension said the two ways. w and h count grid
# cells and a cell here is 150 by 52, so w 1.9 h 1.5 is 285 by 78 - two
# numbers that look nearly square drawing something almost four times wider
# than tall. aspect states the proportion the room sees instead.
# Bottoms aligned rather than centres, so the two frames are compared from
# the one edge they have in common.
plot bad "" "" at 0,0 w 1.9 h 1.5 x 0,1 y 0,1 tick 0.5
text nb "w 1.9  h 1.5" below bad gap 0.4 {.small .muted}
plot good "" "" right of bad gap 2.9 flush bottom w 1.9 aspect 1:1 x 0,1 y 0,1 tick 0.5
text ng "w 1.9  aspect 1:1" below good gap 0.4 {.small .muted}
:::

## figure: sp4c three frames that match to the pixel {.full #sp4c}

::: draw {unit=150x52}
# The second and third charts take their frame from the first, so the three
# can be read against one another and, on paper, laid over one another.
# `same as` is answered as the line is read - which is why the chart being
# copied has to stand above the ones copying it.
bars w1 "18,24,31,9" "M T W T" at 0,0 w 1.5 aspect 3:2 {.tone-3}
text c1 "week 1" below w1 gap 0.35 {.small .muted}
bars w2 "22,19,31,14" "M T W T" right of w1 gap 1.75 same as w1 {.tone-3}
text c2 "week 2" below w2 gap 0.35 {.small .muted}
bars w3 "9,12,7,31" "M T W T" right of w2 gap 1.75 same as w1 {.tone-3}
text c3 "week 3" below w3 gap 0.35 {.small .muted}
:::

## figure: sp5 one drawing, however often it appears {.full #sp5}

::: draw {unit=150x52}
grid g image face-ok 8x3 at 0,0 cell 0.26 space 0.09
text n "one file, twenty-four times" right of g gap 0.7
:::

## figure: sp6 evenly spaced by one line {.full #sp6}

::: draw {unit=150x52}
# Written the way a row gets written: every box against the one before it,
# and one deliberately large gap before the last, which is how an author says
# where the right-hand end belongs. The four widths differ on purpose - the
# statement equalises the distances between *centres*, and against boxes of
# one width there would be nothing to see that equal gaps do not already do.
# The last box of the lower row is placed under its own copy above rather
# than after c2: spread pins the two ends and moves
# everything between them, so an end placed against one of the movers is a
# placement cycle the build refuses by name.
box a1 "a" at 0,0 w 0.7 h 0.5 {.tone-1}
box b1 "b" right of a1 gap 0.6 w 0.3 h 0.5 {.tone-2}
box c1 "c" right of b1 gap 0.6 w 0.55 h 0.5 {.tone-3}
box d1 "d" right of c1 gap 4.35 w 0.4 h 0.5 {.tone-4}
text w1 "as written" right of d1 gap 1.15 {.small .muted}
box a2 "a" below a1 gap 0.55 same as a1 {.tone-1}
box b2 "b" right of a2 gap 0.6 same as b1 {.tone-2}
box c2 "c" right of b2 gap 0.6 same as c1 {.tone-3}
box d2 "d" below d1 gap 0.55 same as d1 {.tone-4}
spread x a2, b2, c2, d2
text w2 "after spread x" right of d2 gap 1.15 {.small .muted}
:::

## figure: sp11 the cycle a spread can create {.full #sp11}

::: draw {unit=150x52}
# The error message, drawn. `d right of c` makes d wait for c; a spread over
# all four pins the two ends and moves everything between, so c waits for d.
# The build names the loop rather than drawing something plausible.
box c "c" at 0,0 w 0.75 h 0.6 {.tone-1}
box d "d" right of c gap 5.75 same as c {.tone-4}
edge c.top -> d.top via c.cx,c.top-0.7 d.cx,d.top-0.7 "d right of c" {.small .muted} side top
edge d.bottom -> c.bottom via d.cx,d.bottom+0.7 c.cx,c.bottom+0.7 "spread pins d, so c waits for it" {.small .accent} side bottom
:::

## figure: sp7 type that fits, and a line over the top {.full #sp7}

::: draw {unit=150x52}
# Both connectors aim at a corner. An endpoint written .center is a point
# *inside* the box, so nothing is drawn from the border inwards and the line
# stops wherever it happens to cross the edge - which reads as a line that
# missed, in the very specimen the corner anchors are here to demonstrate.
# The middle of this box is named twice all the same, by the dot at
# c.cx,c.cy and by the accent line drawn across c.cy: a coordinate is where
# naming the middle of something works, an arrowhead is not.
box a "FIT" at 0,0 w 1.7 h 0.55 {.fit .tone-2}
box b "this one is far too long to fit" below a gap 0.45 same as a {.shrink .tone-2}
box c "" right of a gap 2.9 w 0.9 h 1.0 {.tone-1}
dot m at c.cx,c.cy r 0.09 {.accent}
edge a.tr <-> c.tl {.muted}
edge b.br -> c.bl {.muted}
edge c.left-0.55,c.cy -- c.right+0.45,c.cy {.front .accent}
:::

## figure: sp8 two series {.full #sp8}

::: draw {unit=150x52}
# Three runs of columns in one frame, and which run stands beside which is
# the argument: the scanner column is beside the hand-reviewed one because
# the two are being compared, and the false positives are stacked on the
# scanner because they are part of what it reported, not a fourth opinion.
# Three separate charts would ask the reader to hold three scales at once.
bars man "12,18,9,4" "info low medium high" at 0,0 w 2.9 h 1.3 {.tone-1}
bars scan "26,31,14,5" series of man {.tone-3}
bars fp "19,22,7,1" series of man stacked {.tone-4}
box  s1 "" at man.left+0.14,man.bottom+0.78 w 0.2 h 0.55 {.tone-1 .sharp}
text n1 "reviewed by hand" right of s1 gap 0.35 {.small .muted}
box  s2 "" right of n1 gap 0.85 same as s1 {.tone-3 .sharp}
text n2 "scanner" right of s2 gap 0.35 {.small .muted}
box  s3 "" right of n2 gap 0.85 same as s1 {.tone-4 .sharp}
text n3 "false positive" right of s3 gap 0.35 {.small .muted}
:::

## figure: sp9 one column singled out {.full #sp9}

::: draw {unit=150x52}
# emph and calm are written on the statement, so the chart arrives already
# saying which column the sentence beside it is about. Reached by a step
# instead, the opening picture would be five equal columns and the point
# would only exist from beat one onwards.
bars port "12,9,41,7,5" "80 443 22 53 25" at 0,0 w 2.4 h 1.2 emph 2 dim 0,1,3,4 {.tone-3}
text n "one port carries more\nthan the other four together" right of port gap 1.6 -- port-2 {.small .muted .left}
text ax "blocked connection attempts, by destination port, one week" below port gap 0.55 {.small .muted}
:::

## figure: sp10 bars that run sideways {.full #sp10}

::: draw {unit=150x52}
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
text n "one automated attack accounts\nfor nearly half the week" right of al gap 1.45 -- al-0 {.small .muted .left}
text ax "IDS alerts by signature class, one campus network, one week" below al gap 0.5 {.small .muted}
:::

# Figures a lecture keeps asking for

## figure: a flowchart {.full #fc}

::: draw {unit=150x52}
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
box drop "Drop"        right of d2 gap 2.9 same as in {.round .accent}
edge in -> d1
edge d1 -> d2 "no" side right
edge d2 -> acc "yes" side right
edge d2 -> drop "no" side top
edge d1.left -> acc.left "yes" via d1.left-0.55,d1.cy d1.left-0.55,acc.cy side left
:::

## figure: a swimlane {.full #swim}

::: draw {unit=110x64}
# The lanes say who and the left-to-right order says when, so neither has to
# be written in a box. Every hand-off changes lane, which is why they are
# elbows: a straight line between two bands reads as a diagonal across a band
# it never enters, and there are four of those here.
lanes swim "User | SOC | IT ops" at 0,0 w 7.05 band 0.95 {.muted .dashed}
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

::: draw {unit=95x95}
# Written from the leaves up, because the leaves are the fixed points - they
# are what a browser is actually asked about - and every parent is then the
# midpoint of what it signs. Move a leaf and the two ranks above it re-centre
# with no other line touched. The connectors carry no arrowheads: a signature
# has a direction, but drawing it turns an org chart into a dataflow.
box l1 "www.example.org"  at 0,0 w 1.7 h 0.72 {.tone-2}
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

::: draw {unit=150x52}
# A cell carries a tag for its row and a tag for its column, so a beat is one
# name rather than three cell names kept in step by hand - and a tag is a tag,
# so `show @t-row-2` brings a row in exactly as `style @t-row-2` tints one.
# The rows arrive one at a time rather than sitting there being highlighted:
# an element starts hidden when the first thing a step says about it is
# `show`, and nothing says that about the heading, so the table opens as its
# own column headings and fills in under them. The closing beat is what a
# printed copy gets, which is why the argument ends on the answers rather
# than on whichever row happened to be lit when the lecture stopped.
# The last row is written cell by cell: a beat reaches one cell as
# readily as a whole row, so t-2-4 arrives on its own beat and is emphasised
# there. Column first, row second, and row 0 is the heading.
table t "Layer | Forgery | Countermeasure" at 0,0 col 1.15,1.55,1.7 row 0.44 {.clear .bare .left}
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
  show t-0-4, t-1-4
step the-answer-to-that-one-is-a-standard
  show t-2-4
  emph t-2-4
step every-one-of-them-has-an-answer
  style @t-col-2 {.tone-2}
:::

## figure: a protocol {.full #seq}

::: draw {unit=140x44}
# Three shapes of line and nothing else: an actor, a message between two
# names, and a note standing on a lifeline. What the statement decides is the
# vertical rhythm - every band is as tall as what stands in it - so inserting
# a message is inserting a line.
sequence x at 0,0 space 0.34
  actor c "Client"
  actor p "Proxy"
  actor s "Server"
  c -> p "CONNECT server:443"
  p -> s "TCP handshake"
  p -> p "note the destination" "host, time, byte counts"
  c <- p "200 Connection established" {.dashed}
  c -- s "encrypted tunnel, end to end" space 0.9
  note c,s "the proxy forwards bytes\nand reads none of them" {.tone-2}
:::

## figure: a protocol, one phase at a time {.full #seq-demo}

::: draw {unit=150x40}
# The actors are lines of their own because each needs a name later lines can
# hold on to and an attribute tail of its own. Everything under them is a
# message - an arrow between two names - or a note.
sequence wa at 0,0
  actor u  "User"
  actor br "Browser"
  actor au "Authenticator" {.tone-3}
  actor rp "Relying Party"

  u  -> br "clicks Create passkey"
  br -> rp "request registration options"
  br <- rp "registration options" "challenge · rp.id · user.id · algs" {.dashed}
  br -> au "CTAP authenticatorMakeCredential" "clientDataHash · rp.id · user · algs"
  note br,au "CTAP runs over USB, NFC or BLE"
  au -> u  "prompt: PIN or biometric"
  u  -> au "user verified locally"
  note au "generate key pair\nbind to SHA-256(rp.id)\nstore privately · emit publicly"
  au -> br "attestation object" "authData (public key, cred ID) · signature" {.dashed}
  br -> rp "attestationObject + clientDataJSON" "clientDataJSON carries challenge · origin"
  rp -> rp "verify signature · check origin"

# Two annotations the statement knows nothing about, hung off generated
# names: a brace over three messages and a note beside one of them. A beat
# can show or emphasise either one exactly as it would a box.
brace ctap over wa-3,wa-4,wa-5 pad 0.3 "on the device, over CTAP" side left {.small .turn}
text fresh "the challenge is what makes it fresh" right of wa-2 gap 1.9 {.small .hand} -- wa-2

step in-the-browser
  emph @br-msgs
step on-the-device
  dim @br-msgs
  emph @au-msgs
  emph au
step back-to-the-relying-party
  dim @au-msgs
  dim au
  emph @wa-msg-7, @wa-msg-8
step the-whole-registration
  dim @wa-msgs
:::
