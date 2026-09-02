---
title: Animated Infographics
subtitle: "Six real lecture slides, rebuilt in ::: draw"
author: Dominik Herrmann
theme: dark
collapse: none
auto-fit: true
draw-defaults: |
  default text {.small}
  default container pad 0.34
---

## title: Animated Infographics {#cover}

This is a psi-slides lecture: one Markdown source becomes the projected slides,
a speaker cockpit, a reading document, and a handout with the spoken notes. The
[psi-slides tutorial lecture](../tutorial/audience.html) introduces the system
itself.

Every figure in this lecture is written in the lecture source, laid out at
build time, and stepped with the same key that advances a reveal.

## outline: Finished pictures first, then the language {.wide #agenda}

**Parts 1 to 3 are six real lecture slides, rebuilt as figures.** The note under
each says what holds the drawing together, in words Part 4 defines – so watch
the pictures now and read the notes again after.

## principle: None of this is in the 1.0.0 release {.standard #preview}

**`::: draw` was added after the 1.0.0 release**, so the archive on the
releases page does not have it and a lecture that uses it will not build
against that download.

What you need instead is the repository: a clone, or **Download ZIP** from the
project page. The figure language may still change before it is tagged, so a
figure you write today may need an edit. The editor is experimental too.

# Memory safety

## figure: Types of memory unsafety | keeping two columns level {.full #unsafety}

::: draw {unit=150x52}
default box {.tone-2} w 1.05

text tlab "Temporal" at 0,0 {.left .large}
box  tobj "object" right of tlab gap 2 w 0.62 {.tone-3}
edge tobj.left-0.36,tobj.top-0.7 -> tobj.tl {.thick .muted}

box  uaf  "Use After Free" below tlab gap 0.75 flush left {@temporal}
box  df   "Double free"    right of uaf gap 0.65 same as uaf {@temporal}
text tcode "free(ptr);\n*ptr;" below uaf gap 0.28 flush left {.mono .left @temporal}

text slab "Spatial" below tcode gap 0.9 flush left {.left .large}
box  sobj "object" right of slab gap 2 w 0.62 {.tone-4}
edge sobj.left-0.36,sobj.top-0.7 -> sobj.tl {.thick .accent}

box  bo   "Buffer Overflow" below slab gap 0.75 flush left {.accent @spatial}
box  bor  "Buffer Overread" right of bo gap 0.65 same as bo {.accent @spatial}
text scode "char buf[16];\nbuf[42];" below bo gap 0.28 flush left {.mono .left @spatial}

# The flush left in the placements already lines the two columns up. It does
# not line up the two small boxes on the right: each sits 0.7 beside a word,
# and "Temporal" is one character longer than "Spatial".
align x middle tobj, sobj

step temporal
  show @temporal
step spatial
  show @spatial
:::

**Two families, one shape.** `flush left` at the end of a placement keeps each `below` chain level at its left edge, though the upper listing runs to two lines and the lower one is a different width; `same as` gives each pair boxes of one size. The *statement* `align x middle tobj, sobj` is a different thing: it hands one coordinate from the first element named to the rest, and it is needed here because the two small boxes hang beside words of different lengths. The two steps name `@temporal` and `@spatial` instead of listing eight names.

## figure: Your first buffer overflow | a code block beside a drawing {.full #overflow}

::: side
```c
int main(void) {
  int  myvalue = 0x42;
  char mystring[16];

  scanf("%s", mystring);

  if (myvalue == 0xdeadbeef)
    printf("Success!\n");
  else
    printf("%x\n", myvalue);
}
```
::: flip
::: draw {unit=150x52}
default box {.tone-2 .sharp} w 1.5 pad 0.16

box buf "Local variable: mystring\n(char[], 16 bytes)" at 0,0 h 1.5
box val "Local variable: myvalue\n(integer, 4 bytes)" below buf gap 0 same as buf h 0.75
box bp  "Stored base pointer" below val gap 0 same as val
box ret "Return address"      below bp gap 0 same as val

box sp  "SP" left of buf gap 1.6 w 0.3 {.tone-4}
box bpl "BP" left of val gap 1.6 same as sp {.tone-4}
edge sp -> buf.left
edge bpl -> val.left
align x middle sp, bpl

brace dir over buf,ret side right "writing direction:\ntowards higher\naddresses" pad 0.28 {.muted}

step overrun
  emph buf
  style val,bp,ret {.dashed}
step reached
  emph ret
  label ret "Return address (attacker's)"
:::
:::

**An ordinary Markdown code block on the left, a diagram on the right.** `::: side` puts the two beside each other, and the diagram needs to know nothing about it. The C is invented for the slide; the frame layout beside it is not. Inside, `same as` and `gap 0` hold the four frames together as one stack, and the `brace` spans all four and writes the direction of writing beside them.

# Block ciphers

## figure: Cipher Block Chaining, decryption | four beats and a routed arrow {.full #cbc}

::: draw {unit=112x74}
default box {.tone-3} w 0.82
default box @dec {.round .tone-2} w 0.48
default text {.mono}

box iv "Rand. IV" at 0,0 {.tone-1}
# The columns stand further apart than the boxes need. The space between them
# is not white space but the channel the chaining runs down - at gap 0.3 there
# was nothing left for it, which forced the line either through the Dec box or
# over the key label.
box c0 "c_0" right of iv gap 1.15
box c1 "c_1" right of c0 gap 1.15
box c2 "c_2" right of c1 gap 1.15

box d0 "Dec" below c0 gap 0.95 {@dec}
box d1 "Dec" below c1 gap 0.95 {@dec}
box d2 "Dec" below c2 gap 0.95 {@dec}
text k0 "k" left of d0 gap 0.45 {@dec}
text k1 "k" left of d1 gap 0.45 {@dec}
text k2 "k" left of d2 gap 0.45 {@dec}

dot x0 "+" below d0 gap 0.55 {@xor}
dot x1 "+" below d1 gap 0.55 {@xor}
dot x2 "+" below d2 gap 0.55 {@xor}
box m0 "m_0" below x0 gap 0.55 same as iv {.tone-4 @out}
box m1 "m_1" below x1 gap 0.55 same as iv {.tone-4 @out}
box m2 "m_2" below x2 gap 0.55 same as iv {.tone-4 @out}

edge k0 -> d0
edge k1 -> d1
edge k2 -> d2
edge c0 -> d0
edge c1 -> d1
edge c2 -> d2
edge d0 -> x0
edge d1 -> x1
edge d2 -> x2
edge x0 -> m0
edge x1 -> m1
edge x2 -> m2
# The chaining leaves the ciphertext box sideways and runs down the gap between
# the columns. Straight down would be shorter and wrong: the Dec box sits
# directly under it, so the line would run through the middle of it and lie
# over the arrow that really does go in.
edge feed0 iv -> x0 via iv.right+0.2,iv.cy iv.right+0.2,d0.bottom+0.28
edge feed1 c0 -> x1 via c0.right+0.2,c0.cy c0.right+0.2,d0.bottom+0.28
edge feed2 c1 -> x2 via c1.right+0.2,c1.cy c1.right+0.2,d0.bottom+0.28

align y middle iv, c0, c1, c2
align y middle d0, d1, d2
align y middle x0, x1, x2
align y middle m0, m1, m2

step decrypt
  show @dec
step chain
  show @xor
  emph feed0, feed1, feed2
step recover
  show @out
  dim feed0, feed1, feed2
:::

Each `step` is one press of the forward key. The chaining arrows carry one waypoint each (`via`), which is as much routing as these figures ever need.

## figure: Counter mode, encryption | twelve arrows nobody has to name {.full #ctr}

::: draw {unit=104x66}
default text {.mono}
default box @enc {.round .tone-3}
default box @stream {.tone-2}
default box @msg {.tone-3}
default box @cipher {.tone-4}

box iv0 "IV" at 0,0    w 0.5 {.tone-1}
box n0  "0"  right of iv0 gap 0 w 0.42 {.tone-2}
box iv1 "IV" right of n0 gap 1.6 same as iv0 {.tone-1}
box n1  "1"  right of iv1 gap 0 same as n0 {.tone-2}
box iv2 "IV" right of n1 gap 1.6 same as iv0 {.tone-1}
box n2  "2"  right of iv2 gap 0 same as n0 {.tone-2}

box e0 "Enc" between iv0,n0 offset 0,1.35 {@enc}
box e1 "Enc" between iv1,n1 offset 0,1.35 same as e0 {@enc}
box e2 "Enc" between iv2,n2 offset 0,1.35 same as e0 {@enc}
text ke0 "k" left of e0 gap 0.65 {@enc}
text ke1 "k" left of e1 gap 0.65 {@enc}
text ke2 "k" left of e2 gap 0.65 {@enc}

box s0 "s_0" below e0 gap 0.6 w 0.8 {@stream}
box s1 "s_1" below e1 gap 0.6 same as s0 {@stream}
box s2 "s_2" below e2 gap 0.6 same as s0 {@stream}
dot x0 "+" below s0 gap 0.5 r 0.2 {@stream}
dot x1 "+" below s1 gap 0.5 same as x0 {@stream}
dot x2 "+" below s2 gap 0.5 same as x0 {@stream}
box mm0 "m_0" left of x0 gap 0.7 w 0.55 {@msg}
box mm1 "m_1" left of x1 gap 0.7 same as mm0 {@msg}
box mm2 "m_2" left of x2 gap 0.7 same as mm0 {@msg}
box cc0 "c_0" below x0 gap 0.5 same as s0 {@cipher}
box cc1 "c_1" below x1 gap 0.5 same as s0 {@cipher}
box cc2 "c_2" below x2 gap 0.5 same as s0 {@cipher}

edge n0 -> e0 {@enc}
edge n1 -> e1 {@enc}
edge n2 -> e2 {@enc}
edge ke0 -> e0 {@enc}
edge ke1 -> e1 {@enc}
edge ke2 -> e2 {@enc}

# These twelve need no @tag of their own and no show: an edge is only as
# visible as its two ends, so s->+ arrives with the keystream, m->+ with the
# message and +->c with the ciphertext.
edge e0 -> s0
edge e1 -> s1
edge e2 -> s2
edge s0 -> x0
edge s1 -> x1
edge s2 -> x2
edge mm0 -> x0
edge mm1 -> x1
edge mm2 -> x2
edge x0 -> cc0
edge x1 -> cc1
edge x2 -> cc2

align y middle iv0, iv1, iv2
align y middle e0, e1, e2
align y middle s0, s1, s2
align y middle cc0, cc1, cc2

step keystream
  show @enc, @stream
step message
  show @msg
step cipher
  show @cipher
  emph cc0, cc1, cc2
:::

**The split boxes are two boxes with `gap 0`.** IV and counter carry different tones and sit flush against each other; `between iv0,n0 offset 0,1.35` puts the `Enc` box under the middle of the pair instead of guessing it against one of the two. The twelve arrows in the lower half carry neither `@tag` nor `show`: **an edge is only as visible as its two ends**, so each arrives by itself in the step where its second endpoint does.

# Identity and authentication

## figure: Identity lifecycle | three lines that hold the rows level {.full #lifecycle}

::: draw {unit=176x56}
default box {.tone-3} w 1.15
default text {.small .muted}

# The phase row already carries a tone of its own, so it needs no bold on top:
# bold marks *one* element, it does not label a category. And the base tone is
# the middle one rather than the fullest - nine strongly filled boxes side by
# side leave the emph in the last beat nothing to stand out from.
box  create "Creation" {.tone-1}
text sep1   "▶"             between create,usage {.large}
box  usage  "Usage"         right of create gap 1.95 same as create {.tone-1}
text sep2   "▶"             between usage,term {.large}
box  term   "Termination"   right of usage gap 1.95 same as create {.tone-1}

box  reg    "Registration"  below create gap 0.5 {@creation}
text regc   "identity"      below reg gap 0.2 {@creation}
box  prov   "Provisioning"  below regc gap 0.62 {@creation}
text provc  "issue credentials and\nprovide them to user"  below prov gap 0.2 {@creation}
box  authz  "Authorization" below provc gap 0.62 {@creation}
text authzc "granting of rights\nby the authority"  below authz gap 0.2 {@creation}

box  ident  "Identification" below usage gap 0.5 {@usage}
text identc "claim identity with\nunique name"  below ident gap 0.2 {@usage}
box  authn  "Authentication" below identc gap 0.62 {@usage}
text authnc "prove identity claim\nwith credentials"  below authn gap 0.2 {@usage}
box  acl    "Access Control" below authnc gap 0.62 {@usage}
text aclc   "granting of access\nby the system"  below acl gap 0.2 {@usage}

align y middle reg, ident
align y middle prov, authn
align y middle authz, acl

# The arrow sits between a caption and the next box but is not part of the
# below chain: inside it, a two-line caption would push it into the box that
# align y middle has just pinned.
text down1  "▼"  between regc,prov {@creation}
text down2  "▼"  between provc,authz {@creation}
text down3  "▼"  between identc,authn {@usage}
text down4  "▼"  between authnc,acl {@usage}

brace signup over reg,prov    side right "Signup" {.muted}
brace login  over ident,authn side right "Login" {.muted}

text sep3   "▶"              below authzc gap 0.5 {.large}
box  selfsv "Self-services"  right of sep3 gap 0.65 {.tone-4}

step creation
  show @creation, signup
step usage
  show @usage, login
step self
  show sep3, selfsv
  emph selfsv
:::

**Without `align y middle` the two columns drift apart.** They are separate `below` chains, and the captions run to one line or to two; three `align` lines hold the rows level.

## figure: Message authentication | a drawing that follows the theme {.full #mac}

::: draw {unit=150x60}
image alice avatar-alice "Alice" w 0.42
image eve   avatar-bob   "Eve"   right of alice gap 3.5 same as alice {.ghost @attack}
image bob   avatar-bob   "Bob"   right of eve gap 3.5 same as alice
align y middle alice, eve, bob

text nA "Alice" below alice gap 0.06 {.small}
text nE "Eve"   below eve gap 0.06 {.small .muted @attack}
text nB "Bob"   below bob gap 0.06 {.small}
text kA "k" left of alice gap 0.5 {.mono .small}
text kB "k" right of bob gap 0.5 {.mono .small}

edge wire alice -> bob "M, T" via 1.28,1.5 2.42,1.5
edge replay eve.right:0.28 -> bob.left:0.28 "M, T   replay" {.accent .small @attack}
edge forge eve.right:0.72 -> bob.left:0.72 "forgery   M_F, T_F" {.accent .small @attack}
text def "defense?" above eve gap 0.3 {.hand .small @attack}

text macA "T = MAC_k(M)"            below nA gap 0.3 {.mono .small @proto}
text tagA "\"authentication tag\""  below macA gap 0.14 {.hand .small @proto}
text ver1 "Verify_k(M, T)"                below nB gap 0.3 {.mono .small @proto}
text ver2 "T' = MAC_k(M)\nT' equals T ?"  below ver1 gap 0.55 {.mono .small @proto}
edge howto ver1 -- ver2 {.muted .dotted @proto}
text eg   "e.g." between ver1,ver2 pad 0.12 {.paper .muted @proto}
align y middle macA, ver1

text goals "Security goals: *integrity*\nand *authenticity* but\n~not non-repudiation~" at 3.55,-1.05 {.left .serif}

step protocol
  show @proto
step attack
  show @attack
  emph replay, forge
:::

**The avatars are vector drawings and follow the theme.** `image alice avatar-alice` finds the file in `assets/` exactly as `![](fig-id)` does; an SVG file is spliced in as a nested `<svg>` and inherits `--ink` and `--paper`. The two attack arrows start at `eve.right:0.28` and `:0.72`: the fraction after the colon slides the attachment point along that side, so the two run parallel instead of on top of each other.

What the slide is about is still integrity and authenticity, not
confidentiality – the figure says so in the note under Bob, in the one place a
drawing can say it without a caption repeating it.

# The vocabulary

## figure: The pieces {.wide #primitives}

::: draw {unit=130x76}
box  a "Sender"
box  b "Mix"        right of a gap 1.05
box  c "Receiver"   right of b gap 1.05
dot  x "+"          below b gap 0.8
text n "a free label, placed\nwherever it reads best"  right of x gap 1.45 -- x {.muted .small .left}
edge a -> b "encrypted"
edge b -> c "recoded"
edge b -> x {.dashed}
:::

`box`, `dot`, `text`, `image`, `edge`, `brace`, `container`, `bars`, `grid`, `plot`, `table`, `lanes`, `sequence`, `align`, `spread`, `default`, `step` – seventeen statements, and no more. `-- x` on a `text` draws a short line to what it is about: a leader, not an arrow. An arrow claims a connection, a leader only says what the note refers to.

**Everything in it is measured in grid units, including what carries no label.** The `dot` in the middle has no `r` and so has a *radius* of 0.18 units – 0.36 across – rather than a fixed number of pixels. The difference shows the moment a block changes its `unit=`: a pixel figure would stay where it was while every box around it grew.

## figure: Alignment {.wide #alignment}

::: draw {unit=140x70}
default box {.tone-2}

box a "one"                     at 0,0
box b "a much longer label"     right of a gap 1.2
box c "two"                     right of b gap 1.2
box d "middling"                right of c gap 1.2

box p "first"   below a gap 1.1
box s "fourth"  right of p gap 7.2
box q "a considerably wider one"  below p gap 0 h 0.8
box r "third"   below p gap 0 h 0.5
align y middle p, q, r, s
spread x p, q, r, s

edge a.left-0.8,a.cy -> a "from outside" {.muted}
:::

**The two rows show two different kinds of even.** In the top row the *gaps between edges* are equal, which a chain of `right of … gap n` already gives you. In the bottom row the *distances between centres* are equal: `spread x` distributes the inner elements between the first and the last, and because the second box is much wider than its neighbours the gaps either side of it are visibly smaller. The arrow at the top left has an endpoint with no object behind it – a coordinate instead of an invisible anchor.

## figure: Containers and braces {.wide #grouping}

::: draw {unit=130x76}
default box {.tone-1} w 1.0

box r1 "Registration"  at 0,0
box r2 "Provisioning"  below r1 gap 0.55 same as r1
box r3 "Authorization" below r2 gap 0.55 same as r1
edge r1 -> r2
edge r2 -> r3
brace sign over r1,r2 side right "Signup" pad 0.62
container life "Creation" over r1,r2,r3 pad 0.42 {.dashed}
# The same class as on a box label. A brace spanning three rows has more room
# for its word along its length than across it.
brace whole over r1,r2,r3 side left "the whole thing" pad 0.5 {.turn .muted}
:::

A `container` lays itself around its members and re-fits when they move. A `brace` spans a subset and hangs its label outside. Both measure their distance to their contents with the same word, `pad` – the brace is given `0.62` here so that it comes to lie outside the container's `0.42`.

**Swimlanes are not a `container`, and the reason is what a container does.** A container measures itself against what it holds, so three lanes holding different numbers of things come out different lengths at both ends. A swimlane diagram says the opposite: the bands are equal, and only what happens inside them differs. `lanes` is for that – bands of equal width that want to know nothing about their contents. Part 5 draws one, under *Three roles, one incident*.

**`.turn` applies to every label, not only to a box's.** The left brace reads bottom to top, and the same class does the same thing on a container caption and on an edge label – at all four places, that is, where a label is set at all.

## figure: The look of a thing | fill and family {.full #look}

::: draw {unit=118x74}
default box {.sharp} w 0.62 h 0.42

# Every fill the vocabulary has, drawn over a line so that .clear and .paper
# can be told apart: one lets the rule through, the other knocks it out.
edge -0.45,0 -- 6.1,0 {.muted}
box f1 "paper"  at 0,0 {.paper}
box f2 "tone-1" right of f1 gap 0.45 same as f1 {.tone-1}
box f3 "tone-2" right of f2 gap 0.45 same as f1 {.tone-2}
box f4 "tone-3" right of f3 gap 0.45 same as f1 {.tone-3}
box f5 "tone-4" right of f4 gap 0.45 same as f1 {.tone-4}
box f6 "clear"  right of f5 gap 0.45 same as f1 {.clear}
text fl "fill" left of f1 gap 0.8 {.muted}

text t1 "sans"  at 0.31,1.25
text t2 "mono"  right of t1 gap 1 {.mono}
text t3 "serif" right of t2 gap 1 {.serif}
text t4 "hand"  right of t3 gap 1 {.hand}
text tl "family" left of t1 gap 1.15 {.muted}
:::

**Two channels that say what a thing is made of: what fills it, and what its
words are set in.** The classes are a closed list rather than free colours –
every fill is mixed from `--emph` and `--ink` over `--paper`, so it survives all
seven themes. The editor's sidebar offers exactly these rows, one slide at a
time, as the next four slides do.

**`.paper` here looks inert and is not.** It is a box's default, but under a
`default box {.tone-3}` a box without the class cannot find its way back, and a
free `text` gets no background at all without it – that background is what knocks
a line out behind a label. The rule drawn through the row is what tells `.paper`
and `.clear` apart: one knocks the line out, the other lets it through.

## figure: One slot, seven members | and the one reading direction beside it {.full #outlines}

::: draw {unit=118x74}
default box {.sharp} w 0.62 h 0.42

box  s1 "hex"      at 0,0 w 0.66 h 0.42 {.hex .tone-2}
box  s2 "chevron"  right of s1 gap 0.5 same as s1 {.chevron .tone-2}
box  s3 "left"     right of s2 gap 0.5 same as s1 point left {.chevron .tone-2}
box  s4 ""         right of s3 gap 0.4 w 0.4 h 0.42 {.diamond .tone-2}
box  s5 ""         right of s4 gap 0.35 w 0.42 h 0.42 {.wedge .tone-4}
box  s6 ""         right of s5 gap 0.35 same as s5 point up {.wedge .tone-4}
# A cross with no w of its own comes out square - here the block default gives
# it one, so both numbers are written. That they look so unequal and mean the
# same thing is the point: 0.264 times 118 is 0.42 times 74.
box  s7 ""         right of s6 gap 0.35 {.cross .accent}
box  s8 "turn"     right of s7 gap 0.65 h 0.62 {.tone-2 .turn}
text sl "outline, and\nreading direction" left of s1 gap 0.8 {.muted .right}

# The two rectangles the five share their slot with. A second line rather than
# more of the first: the row's width sets the editor's fit-to-frame zoom, and
# two specs drag against grips whose size depends on it.
box  k1 "round"    below s1 gap 0.85 w 0.7 h 0.42 {.round .tone-3}
box  k2 "sharp"    right of k1 gap 0.5 same as k1 {.sharp .tone-3}
text kl "corner"   left of k1 gap 0.8 {.muted .right}
:::

**All seven above are one slot, and only one member of it can hold at a time.**
The first two are the corner treatments a rectangle can take, `.round` (the
default) and `.sharp`; the five after them are the outlines that are not
rectangles at all. They share the slot because a hexagon has no corner radius to
argue about, so asking for both would be asking a question with no answer. Each
of the five is drawn from the same four numbers a rectangle would use, joined
into a different path.

**`.turn` reads the label bottom to top**, and it is the box standing apart
at the end – a reading direction, not a shape, so it is in no slot with the
seven. A tall
narrow box has room for a word only along its length, and the alternative is one
letter per line. It applies to every label, not only to a box's – the same class
does the same thing on a container caption, a brace and an edge label.

**Which way an outline aims is the `point` option, not the class name.**
`{.chevron} point left` rather than a class `.chevron-left`: a chevron aimed up
is the same shape aimed differently, and a word for every shape times every
direction would quadruple the closed list. `point` applies to `.chevron` and
`.wedge`; on a shape with no point the build refuses it instead of reading past
it.

## figure: Two outlines argue with their own size {.full #outline-size}

::: draw {unit=118x74}
# Nothing here is given a width on purpose: the rectangle takes one, and the
# other two are left to size themselves, which is the whole slide. Laid across
# rather than down, because the diamond's cost is a comparison - it only reads
# as twice as much when the rectangle is beside it at the same eye level.
box  r1 "two words" at 0,0 w 1.2 h 0.5 {.sharp .tone-2}
box  d1 "two words" right of r1 gap 1.0 {.diamond .tone-2}
box  c1 ""          right of d1 gap 1.0 h 0.5 {.cross .accent}
text rl "sized to the string"         below r1 gap 0.3 {.muted .small}
text dl "twice as much, both ways"    below d1 gap 0.3 {.muted .small}
text cl "ignores w, comes out square" below c1 gap 0.3 {.muted .small}
# dl is named first because it hangs lowest: align hands the first element's
# coordinate to the rest, so the other two come down to it rather than up into
# their own boxes.
align y middle dl, rl, cl
:::

**`.diamond` is the one outline that eats both axes.** The widest room a diamond
offers is a strip half its width by half its height through the middle, so the
build sizes it at twice what a rectangle would need for the same string, in both
directions – which is why the two above hold the same words at very different
sizes. A sentence in a diamond takes four times the area of the boxes beside it
and swallows the figure; two or three words is the measure, and the explanation
belongs in a note next to it. `.hex` also says *a question is asked here*; the
diamond says on top of that that it goes on in two ways, which a room has been
trained on since school.

**A `.cross` with no `w` of its own comes out square, block default or not.** A
plus with arms of two different lengths is not a plus, so a block `default` that
carries a `w` reaches every rectangle in the block and the cross passes it by –
the same exception `bars` makes for outlines. A `w` written on the element's own
line still wins, that being a statement about this one element.

## figure: One channel, spelled the same in three places {.full #prominence}

::: draw {unit=118x74}
default box {.sharp} w 0.62 h 0.42

# The three prominence words, on free text rather than on boxes: they occupy
# one slot and displace each other, and .emph colours the words themselves
# here. An image has no ink to thicken and is still served by the same list,
# because there emph takes a dim off again.
text pr0 "normal" at 0.31,0
text pr1 "emph"  right of pr0 gap 1 {.emph}
text pr2 "dim"   right of pr1 gap 1 {.dim}
text pr3 "ghost" right of pr2 gap 1 {.ghost}
text prl "on a text" left of pr0 gap 1.15 {.muted}

# The fourth state has no name and needs none: {!dim} takes the class off
# again, here against the block default one line above.
default box @prom {.dim}
box  p1 "emph"   at 0,1.1 w 0.62 h 0.42 {.emph}
box  p2 "normal" right of p1 gap 0.7 same as p1
box  p3 "dim"    right of p2 gap 0.7 same as p1 {.dim}
box  p4 "ghost"  right of p3 gap 0.7 same as p1 {.ghost}
box  p5 "!dim"   right of p4 gap 0.7 same as p1 {@prom !dim}
text pl "on a box" left of p1 gap 0.8 {.muted .right}
:::

**`.emph`, `.dim` and `.ghost` are one channel written three ways.** They are
classes on an element's own line; they are the verbs a `step` has for them
(`dim a, b`); and on a `bars` line the same three words name column numbers.
Learn one form and you have all three.

**The fourth state – ordinary prominence – deliberately has no name.** `{!dim}`
takes the class off instead of adding a fourth word, and that holds for every
class and in every tail. Without the mark there is no way back: a `style` step
could only ever *add* a class, and many slots spell their base state as the
absence of every member, so a beat could leave such a state and never reach it
again. `p5` is that case drawn – it carries `@prom`, the block gives `@prom` a
`.dim`, and `{!dim}` beside it takes the class away again.

**What is written on the line is in the handout; what is written in a `step` is
not.** That is the whole rule, and it reads off the source: prominence on an
element's own line describes the drawing, prominence in a beat is an act
performed in the talk. Print therefore takes it from the opening beat rather
than the last.

## figure: When the type does not fit the box {.full #typefit}

::: draw {unit=118x74}
# One width, three answers: leave the type as it is and let it run over the
# border, shrink it until it fits, or let it fill the box in both directions.
box g1 "a label that is too long" at 0,0 w 1.2 h 0.46 {.sharp}
box g2 "a label that is too long" right of g1 gap 0.55 same as g1 {.sharp .shrink}
box g3 "short"                    right of g2 gap 0.55 same as g1 {.sharp .fit}
text n1 "no"     below g1 gap 0.16 {.muted}
text n2 "shrink" below g2 gap 0.16 {.muted}
text n3 "fit"    below g3 gap 0.16 {.muted}
text gl "type meets\nits box" left of g1 gap 0.8 {.muted .right}
:::

**When type and box do not match, there are three answers**, and the three boxes
above are all three. With no `w` the box grows to the type. With a fixed `w`,
`.shrink` shrinks the type until it fits and `.fit` fills the box in both
directions, bounded to 0.6–1.5× the base size. Text width is *estimated* at
build time – there is no browser – so the size chosen comes out a shade too
small, which is the safe direction.

**The first box overflows on purpose, and the build says so:** `box g1 is 1.2
units wide but its label needs about 1.64`. That is the answer nobody wants: a
fixed `w` too small for the label, and neither `.shrink` nor `.fit`. It is the
one warning this lecture builds with.

## figure: Steps that move {.wide #motion}

::: draw {unit=140x72}
default box w 0.92

box  cl "Client"  at 0,0
box  sv "Server"  right of cl gap 5.65 same as cl
box  px "Proxy"   below cl gap 1.05

container zone "on the path" over cl,sv,px {.bare .tone-2}

edge direct cl <-> sv "HTTP"
edge up cl -> px {.dashed}
edge down px -> sv {.dashed}

text note "the box walks,\nthe arrows follow" below px gap 0.5 -- px {.hand .small}

step appears
  show px
  # The direct arrow is still there and should recede, not vanish.
  dim direct
step interposed
  hide direct
  move px to between cl,sv
  emph px
step all-again
  show direct
  # And back to ordinary prominence. There is no fourth word for it - the
  # state *is* the absence of the three, so you take the class off instead
  # of adding another one.
  style direct {!dim}
  style px {!emph}
:::

**`move` shifts an element, and everything hanging off it goes too.** The proxy gets `move px to between cl,sv`, and because the layout is worked out again at every step, the two dashed arrows still hang off it, the short line on the label still points at it, and the `container` suddenly holds a row instead of two. `hide direct` takes the direct arrow away. `to` names a position and `by` shifts by an amount – and **the build refuses `move @tag to …`**, which would stack the whole set on one point; for a set, `by` is what is meant.

**A beat can also take a class off, and `{!class}` is the only word for it.** A `style` step could once only *add*, and because many slots spell their base state as the absence of every member – ordinary prominence, a solid stroke, the normal type size – a beat could leave such a state and never reach it again. The last beat here takes `.dim` and `.emph` off and gives the figure its opening weighting back. **The mark removes the exact name written, not the slot**: `{!dim}` clears no `.ghost`, and a later beat may set `.dim` again.

## free: What a step does not have to say {.wide #motion-implicit}

**Anything hanging off something invisible stays invisible.** So neither the `container` nor the dashed arrows nor the handwritten label needs a `show` of its own: an arrow is only as visible as its ends, a `container` only as visible as its members, and a `text` with a leader only as visible as what it points at. The first step says `show px` and nothing else – the two dashed arrows arrive with the proxy.

**Naming an element overrides that rule, in both directions.** `hide direct` takes the direct arrow away though both its ends are still there; a written `show` does the reverse and brings something on screen whose source is still missing – an outline, say, that should stand around its whole set before the set is assembled (the tree in Part 5, under *Leaves first, and the brackets follow*). Both hold from the beat they are written in onwards. Write one only where the rule says the wrong thing. Write a `show` on every element and you have a figure that stays incomplete the next time one is added: the element is in the block, no step names it, and it never appears.


## figure: Where the words sit {.full #justify}

::: side 1:1
::: draw {unit=126x86}
default box {.sharp} w 0.66 h 0.72

# A tall box with a short label is the case these words exist for. Without
# them every line sits in the middle, which says the wrong thing about a
# stack frame or a matrix row.
box  tl "top\nleft"                      at 0,0    {.top .left}
box  tc "top"           right of tl gap 0.35       {.top}
box  tr "top\nright"    right of tc gap 0.35       {.top .right}
box  ml "left"          below tl gap 0.25          {.left}
box  mc "centred"       right of ml gap 0.35
box  mr "right"         right of mc gap 0.35       {.right}
box  bl "bottom\nleft"  below ml gap 0.25          {.bottom .left}
box  bc "bottom"        right of bl gap 0.35       {.bottom}
box  br "bottom\nright" right of bc gap 0.35       {.bottom .right}

# A free text has no border to keep its distance from, and so no padding
# either: its box *is* the block of lines. The words align it against its own
# edge, not an inner one. The ground makes that visible - it is drawn
# outwards.
text fl "free, left"   below bl gap 0.3 {.left .small .paper}
text fr "free, right"  below br gap 0.3 {.right .small .paper}

# And the reading that does *not* belong here: on an edge the same four words
# say nothing about the block of lines, but which side of the line the label
# lies on. That is one question with one answer rather than two channels with
# three each - which is why an edge takes the option `side` and no class, and
# why the build refuses {.top} on an edge.
edge sa tl.left,tl.top-0.5 -> tr.right,tr.top-0.5 "side top" side top {.small .muted}
edge sb bl.left,bl.bottom+0.95 -> br.right,br.bottom+0.95 "side bottom" side bottom {.small .muted}
:::

::: flip
**`left` and `right` say where a line of words sits, `top` and `bottom` where the block of lines sits.** Both are **measured against the padding rather than the border**: `left` means as far left as this box allows. Without one of the four the label sits centred, which is right for almost every box; the words are there for the rest, above all for a tall box with a short label.

With more than one line **the whole block of lines moves, not the single line**, so on two lines `bottom` puts the *last* one on the inner edge rather than the first. `turn` beats both: a turned label reads bottom to top and is centred on its point whichever way round it goes.
:::

## free: One question across, one question along {.wide #justify-edges}

**A box label and an edge label are two different questions, and only one of them has nine answers.** A box label sits somewhere in a rectangle of space, so there are three answers across and three down. An edge label lies on one side of its line or the other, and that is all. The same four words for both meant `{.top .left}` was writable on an edge, which has only one side to pick. On an edge it is therefore `side <word>`, the pattern `point` follows on the outlines: a closed word list as an option instead of a class per word. Which pair can choose at all is settled only once the line is routed, so naming the other one draws a warning.


## figure: Six statements that expand {.full #expand}

::: draw {unit=150x62}
bars f "20,19,17,12,11,10,9,9,8,7,6,5" at 0,0 w 2.4 h 1.0 {.tone-3 .bare}
brace b1 over f-0,f-1,f-2 side bottom "Bin 1" pad 0.4 {.muted}
brace b2 over f-3,f-4,f-5,f-6,f-7 side bottom "Bin 2" pad 0.4 {.muted}
brace b3 over f-8,f-9,f-10,f-11 side bottom "Bin 3" pad 0.4 {.muted}

grid g dot 8x6 right of f gap 2.2 cell 0.13 space 0.06 {.tone-2}
text gl "8 × 6" below g gap 0.3 {.small .muted}

step bins
  show b1, b2, b3
step exception
  style g-7-0, g-7-1, g-7-2 {.tone-4}
  emph f-0, f-1, f-2
:::

**Six statements expand at parse time into ordinary elements.** `bars` becomes a box per column (`f-0` … `f-11`), a baseline and – where a second string is written – a text per label; `grid` a cell per field (`g-<column>-<row>`); `plot` a frame with gridlines and axes; `table` a box per cell; `lanes` a band per lane; `sequence` a head, a lifeline, a message and a note per entry. Everything downstream treats the result like any other element: the `brace` spans three columns because three columns are three ordinary boxes, and a `style` step tints three cells because they are boxes. What makes that work is that a coordinate may be another element's – every cell is placed against an edge of the frame the same statement lays. The other four come later: `plot` on *A frame to draw in*, and `table`, `lanes` and `sequence` in Part 5.

**An edge is one of the things a coordinate can be read off.** `w1.cx`, `w1.cy`, `above w1 gap 0.2` – what is read is the wire's bounding box. That counts as soon as a sentence describes the wire rather than one of its ends. Pinned to a box, such a sentence keeps its distance from the box and loses it from the line the moment a fraction or a height changes, with no warning. An edge has no name until you give it one, and the name goes in front, as it does on every other statement: in the slot before the first endpoint, `edge w1 mix -> log`. Staying anonymous costs nothing, the slot being optional. Place in a circle – an element against an edge that itself hangs off it – and you get `placement cycle` with the line number.

**`cell` counts in the height of a grid unit on both axes, exactly as `pad` does.** A `grid` cell is meant to be square, and a number meaning the unit's width across and its height down would give squares only where the unit is itself square.

**The spacing *inside* these statements is `space`, not `gap`.** A placement stands on the same line, and there `gap` means the distance to another element. The distance between two columns is a different thing and takes a different word.

## figure: A second run of columns {.full #series}

::: draw {unit=150x64}
# The same eight numbers, drawn twice. The second line lays no frame of its
# own, it joins the first - and the first one's columns narrow for it, so the
# pair takes the room a single run did.
bars a  "12,15,19,24" "Q1 Q2 Q3 Q4" at 0,0 w 1.9 h 1.05 emph 3 dim 0 {.tone-2}
bars a2 "9,11,10,21"  series of a emph 3 dim 0 {.tone-3}
text an "side by side" below a gap 0.55 {.muted}

bars b  "12,15,19,24" "Q1 Q2 Q3 Q4" right of a gap 3.5 w 1.9 h 1.05 emph 3 dim 0 {.tone-2}
bars b2 "9,11,10,21"  series of b stacked emph 3 dim 0 {.tone-3}
text bn "stacked" below b gap 0.55 {.muted}

text y1 "2023" at a.left+0.32,a.top-0.34 pad 0.12 {.tone-2}
text y2 "2024" right of y1 gap 0.55 pad 0.12 {.tone-3}
:::

**`series of a` means: the same columns, a second run.** The second `bars` line gets no frame, no baseline and no strip of category names – all three belong to the frame it joins, and writing one anyway is an error. It refuses a placement for the same reason. What it brings is its values, its classes and, like any other `bars` line, the two words that single columns out from the opening picture onwards.

**One word separates the two figures, and it changes the scale.** Without `stacked` the second run stands *beside* the first and a column's cell is shared between them; with `stacked` it stands *on* it, and the scale is no longer the tallest single value but the tallest stack. The same numbers are therefore flatter on the right than on the left, though no value changed. Which reading you want is a question about the content: side by side compares the years, stacked adds them up.

**`emph 3 dim 0` stands on the statement, not in a step.** Q4 is what this is about and Q1 was only counted from February onwards; both hold the moment the figure is on screen. Written as a step, the first thing the room would see is four equal quarters, and the point would arrive on a keypress. All three prominence words – `emph`, `dim`, `ghost` – take column numbers here, counted from 0, and a number with no column behind it is refused. They are the same three that are classes on an element's line and verbs in a beat.

## figure: Columns laid flat | the same six numbers, twice {.full #flat}

::: draw {unit=150x54}
# The same values left and right. On the left a category is as wide as a
# column, so it carries a number and the names would have to go elsewhere; on
# the right the names are the axis. The same emph column in both figures, so
# that you can see the numbers are the same.
bars up "41,33,22,14,9,6" "1 2 3 4 5 6" at 0,0 w 1.25 h 2.0 emph 3 {.tone-3}
text upn "the names go elsewhere" below up gap 0.55 {.small .muted}

bars inc "41,33,22,14,9,6" "Phishing | Ransomware | Credential stuffing | DNS cache poisoning | Supply-chain compromise | Insider misuse" right of up gap 4.7 horizontal w 1.8 h 2.0 emph 3 {.tone-3}
text incn "the names are the axis" below inc gap 0.55 {.small .muted}
:::

**`horizontal` turns the columns on their side: the bars run right, the categories stack downwards.** It stands as a single word on the `bars` line, exactly as `stacked` does. The strip of category names becomes a right-aligned column in the left margin, each word set by its own measured width so the right edges form a line, and the baseline stands vertically on the left instead of lying under the bars. The numbers are made up.

**Flat, the proportions are easier to read.** Every bar starts at the same vertical edge, and the eye compares lengths from one shared start line more reliably than heights over a shared floor: on the left you have to visit the tops of the columns in turn, on the right you read the ranking at a glance. A run of bars sorted downwards also looks like a ranking by itself.

**And only flat is there room for the names at all.** A category called “DNS cache poisoning” cannot be written under an upright column, so the left-hand figure carries numbers and the room looks them up in a legend that does not exist here. The second string is what makes it possible: **a `|` in it splits on that instead of on spaces**, so a label may be as many words as it needs. `|` already separates the cells of a `table` row and the names in a `lanes` list.

## figure: A frame to draw in {.full #plot}

::: draw {unit=150x58}
# A ROC curve belongs in a square: both axes carry the same unit, and the
# diagonal has to run at 45 degrees or the picture claims a slope it does not
# have. w and h cannot say that - here 2.2 and 5.69 would stand side by side
# and look like anything but a square.
plot roc "False positive rate" "True positive rate" at 0,0 w 2.2 aspect 1:1 x 0,1 y 0,1 tick 0.2

edge chance roc@0,roc@0 -- roc@1,roc@1 {.muted .dashed}
edge good roc@0,roc@0 -- roc@1,roc@1 via roc@0.03,roc@0.45 roc@0.1,roc@0.72 roc@0.3,roc@0.9 roc@0.6,roc@0.97 {.smooth .accent .thick}
# An edge label beside the line, and the ground travels with it: it knocks out
# the diagonal and the gridlines running under the curve. The small pad is not
# thrift - the ground is label plus pad, and at the usual pad it would cover
# the line again that side just moved it clear of. In a square the curve
# climbs more steeply at its middle than it runs, so the vertical pair of
# words applies here; drawn flat it was side bottom.
edge weak roc@0,roc@0 -- roc@1,roc@1 via roc@0.15,roc@0.3 roc@0.4,roc@0.6 roc@0.7,roc@0.85 "weaker" pad 0.08 {.smooth .paper .small} side right

# On the line rather than beside it: a .paper ground is only worth anything
# where it really knocks something out.
text nchance "chance" at roc@0.74,roc@0.74 pad 0.12 {.small .paper}
# And the leader meets the curve at its right-hand end instead of running
# across the field and crossing both curves. In a square, "just to the right"
# is no longer enough: the middle of the right edge now sits low enough that a
# leader from there would cut the diagonal. The height therefore comes from
# the plot's own units.
text ngood   "the one you want" at roc.right+0.6,roc@0.93 -- roc@0.86,roc@0.99 {.small .hand}

step curves
  show good, weak
step judge
  emph good
  dim weak
  # The leader points at a coordinate rather than at an element, so the usual
  # rule - a text with a leader is only as visible as what it points at - has
  # nothing to inherit from, and the note stood on the opening picture naming a
  # curve that was not drawn yet. A written `show` is the documented override
  # for exactly this, and it belongs in this beat rather than the one before:
  # "the one you want" is the judgement, not the curve.
  show ngood
:::

**A `plot` is a frame to draw in, not a chart library.** It lays down gridlines, axis labels and the two axis titles, plus a conversion, so that `roc@0.35` names a value in the plot's own units. That is resolved into an ordinary `roc.left+n` only once the block has been read, so a point may name a plot written further down.

**`w` and `h` are counted in grid units, and a grid cell is not square. That is the trap.** At `unit=150x58` a `plot … w 1.9 h 1.5` comes out 285 by 87 pixels: the two numbers are a quarter apart, the picture more than three times. **`aspect W:H` states the proportion the reader actually sees** and lets the build work the missing number out. This ROC curve is therefore written `aspect 1:1` and comes out square, as two axes carrying the same unit should – the chance diagonal runs at 45 degrees, the only slope at which it says what it is called. `4:3`, `1:1` or a single number (that many wide to one tall) are all allowed; `w`, `h` and `aspect` together is an error, because two of the three can contradict each other. The same word and the same rule apply on `bars`.

## free: A curve, and the label beside it {.wide #plot-curves}

**The curves are ordinary edges.** `.smooth` draws the same waypoints as a curve running *through* them instead of as straight segments – an interpolating spline, so a waypoint stays exactly where it was written. The skew warning stays quiet on a curve, its premise not holding: two nearly level points are the shape there rather than two ends that missed each other.

**“weaker” is an edge label *beside* the line, and the ground travels with it.** A fill class on an edge draws a ground behind the label; without a `side top`, `side bottom`, `side left` or `side right` it stays on the line and knocks it out, which is what *The road straight down* does with “yes” and “no”. With one of them it moves clear and takes the ground along. For the name of a curve that is the only choice: on the line it would knock out exactly what it names. The ground still has work to do, because the diagonal and two gridlines run under the curve.

**The word is short, and on a curve that is not a matter of taste.** The label is moved clear along the normal *at the middle* of the curve, but the curve goes on climbing, so a long label runs back into its own line at both ends instead of staying beside it. Beside a horizontal or vertical edge the question does not arise, and there a label may be as long as it needs to be.


## figure: One size, two frames | two plots that can be compared {.full #sameframe}

::: draw {unit=150x54}
# Two frames meant to be compared. The left one writes its size out, the right
# one points at it. The grey curve is the same in both: it is the reference
# both sites are read against.
plot pa "week" "alerts, site A" at 0,0 w 1.4 aspect 4:3 x 0,8 y 0,8 tick 2
plot pb "week" "alerts, site B" right of pa gap 3.2 same as pa x 0,8 y 0,8 tick 2

edge ra pa@0,pa@2 -- pa@8,pa@6.4 via pa@2,pa@3 pa@4,pa@4.4 pa@6,pa@5.6 {.smooth .muted .thick}
edge rb pb@0,pb@2 -- pb@8,pb@6.4 via pb@2,pb@3 pb@4,pb@4.4 pb@6,pb@5.6 {.smooth .muted .thick}
edge sa pa@0,pa@3.2 -- pa@8,pa@2.4 via pa@2,pa@2.6 pa@4,pa@1.8 pa@6,pa@2.2 {.smooth .accent}
edge sb pb@0,pb@3.2 -- pb@8,pb@7.6 via pb@2,pb@4.4 pb@4,pb@5.2 pb@6,pb@6.8 {.smooth .accent}
:::

**`same as` on a `plot` or `bars` line copies the whole frame.** The right-hand plot writes no size of its own but points at the left one, so the two figures match to the pixel. Two figures meant to be compared have to be ones the eye can lay over each other; two frames a hair apart cannot do that.

**The copy happens as the line is read, not at layout time – unlike a box's.** Gridlines, axis labels and columns are placed from `w` and `h` the moment the line is read, so a size arriving later would move the frame and leave everything in it standing. **The statement being copied from has to stand above the one copying it**, and the build names what went wrong: a name that appears further down, one pointing at something other than a `plot` or `bars`, or one that is not in the block at all. `same as` beside `w`, `h` or `aspect` is an error, and so is `same as` on a `series of` line, a series drawing in a frame it does not lay.

**Frames of one size are not yet one scale.** `x` and `y` stand on each `plot` line for themselves, and nothing checks that two frames carry the same ranges – above they are written out twice, and that is the place to re-read before handing the slide over. `bars` has no range to write at all: every `bars` statement scales to its own highest value, so two frames of one size can hold columns that cannot be compared.

## figure: A raster does not follow the theme {.standard #raster}

::: draw {unit=150x60}
image swatch swatch w 0.6
text  note "a raster keeps its own colours\nin every theme" right of swatch gap 0.9 -- swatch {.small .muted .left}
:::

Cycle the themes with `A` and the raster image stays as it is, while boxes, arrows and vector drawings re-colour. Pixels cost that; a vector drawing does not.

# Four arrangements

## figure: The road straight down | a flowchart {.wide #flowchart}

::: draw {unit=132x70}
default box {.tone-2}

# The main road runs straight down and every branch leaves sideways: follow
# the vertical line and you follow the case that goes through. The two
# diamonds get no w. A fixed w would help nobody here either: the too-narrow
# warning measures against the rectangle, not against the half-as-wide strip a
# diamond really offers.
# You would not draw this figure at all: a procedure of conditions and
# assignments reads faster as pseudo-code than as a flowchart. It stands here
# for the *shape*, not as a recommendation for this content.
box  pkt  "Packet arrives"          at 0,0 w 1.4 {.tone-3}
box  d1   "Known flow?"             below pkt gap 0.45 {.diamond .tone-1}
box  d2   "Rule permits?"           below d1 gap 0.45 {.diamond .tone-1}
box  fwd  "Forward"                 below d2 gap 0.45 w 1.4
box  fast "Forward,\nno rule check" right of d1 gap 1.3 w 1.4
box  drop "Drop"                    right of d2 gap 1.3 w 1.4 {.tone-4}
text note "state table,\nper five-tuple" left of d1 gap 1.15 -- d1 {.muted .right}

# The two diamonds are different widths, so their branches end at different
# places. The align brings the second column back into line.
align x left fast, drop

edge pkt -> d1
edge d1 -> d2   "no"  {.paper}
edge d1 -> fast "yes" {.paper}
edge d2 -> fwd  "yes" {.paper}
edge d2 -> drop "no"  {.paper}
:::

**The diamond is the outline a room needs no explanation for.** It learned it at school: a question is asked here, and it goes on in two ways. What that costs is room. The widest strip a diamond offers is half its width by half its height, so the build sizes it at twice what a rectangle would need – two or three words, with the explanation in a note beside it, as on the left here. A whole sentence in a diamond would take four times the area of the boxes around it and become the figure.

**The four labels sit *on* the line, and each one says so on its own tail.** A fill class on an edge draws a ground behind the label; with no `side top`, `side bottom`, `side left` or `side right` beside it, the label stays on the line and knocks it out behind itself. That is the right form for a word that *names* the line – “yes”, “no”, a port number, a message type – the way a street sign belongs to the street and the street runs past it either side. A sentence describing what *travels* along the line belongs beside it: *Three roles, one incident* does that, and the ROC curves on *A frame to draw in* take the ground along when they do. Mixing the two in one figure means the room has to sort each label before it can read any of them, so everything here is on the line.

## figure: Three roles, one incident | a swimlane {.full #swimlane}

::: draw {unit=118x72}
# lanes draws the frame, the bands and the turned names in front of them. What
# lies in the bands is placed one by one as everywhere else - against the
# middle of a band (swim-1.cy) and against the frame (swim.left+n).
lanes swim "User | SOC | IT ops" at 0,0 w 7.25 band 1.0 {.muted}

box rep  "Phishing mail\nreported" at swim.left+0.8,swim-0.cy w 1.4 {.tone-2}
box tri  "Triage"                  at swim.left+2.9,swim-1.cy w 1.0 {.tone-1}
box hunt "Who else\ngot it?"       at swim.left+4.85,swim-1.cy w 1.2 {.tone-1}
box blk  "Sender blocked"          at swim.left+6.35,swim-2.cy w 1.4 {.tone-4}

# Every hand-off changes band, which is what .elbow is for: a straight line
# from here to there would run diagonally through a band it never enters.
edge rep -> tri {.elbow}
edge tri -> hunt "same sender" {.small} side top
edge hunt -> blk {.elbow}

step reported
  show rep
step investigated
  show tri, hunt
step answered
  show blk
:::

**The bands are equal, their contents are not, and that is why they are no `container`.** A container measures itself against what it holds, so three bands with different numbers of boxes would come out different lengths at both ends – the one thing a swimlane diagram must not say. `lanes` lays the frame, divides it into bands of equal height and writes the names turned on end in front of the left edge; the bands are `.clear` so that everything in them reads over them. It needs no time axis: the reading direction is the axis.

**Every hand-off changes band, and `.elbow` is the routing for it.** The class draws two waypoints itself – a rail halfway across the gap, on the axis the two ends are further apart on – instead of the same double bend written out by hand on every edge. A straight line would do something else: it would run diagonally through a band it never enters, and the room reads that as involvement.

**The one edge label sits *beside* the line, not on it.** “same sender” describes what travels along the line, and a sentence with a rule through the middle of it is read as two fragments before it is read as a sentence. `side top` lifts it over the line; on a vertical edge it would be `side left` and `side right`, and which pair applies is known only once the edge has been routed – so the wrong pair is a warning at build time rather than an error at parse time. The label is moved clear by what it measures *across* the line: beside a horizontal edge its height, beside a vertical one its width, there with a margin, because a gap across a line of type needs more air than one above it. This label needs no ground: there is nothing but band under it. What a ground does, and how large it may be, is on *A frame to draw in*.

## figure: Leaves first, and the brackets follow | a tree {.full #tree}

::: draw {unit=112x96}
default box {.tone-2} w 1.35

# The leaves are the fixed points, because they are what this is about. Every
# level above sits between its own children: move a leaf and everything above
# re-centres, with no second line knowing about it.
box l1 "www.example.org"  at 0,0 {.tone-3 @leaves}
box l2 "mail.example.org" right of l1 gap 0.2 same as l1 {.tone-3 @leaves}
# The gap between the two subtrees is four times the gap inside one. That
# makes them two groups before anybody reads a word.
box l3 "shop.example.com" right of l2 gap 0.8 same as l1 {.tone-3 @leaves}
box l4 "vpn.example.com"  right of l3 gap 0.2 same as l1 {.tone-3 @leaves}

box i1 "Issuing CA A" between l1,l2 offset 0,-2.2 w 1.2 {@issuers}
box i2 "Issuing CA B" between l3,l4 offset 0,-2.2 w 1.2 {@issuers}
box rt "Root CA"      between i1,i2 offset 0,-2.2 w 1.2 {.tone-1}

edge rt -- i1 {.elbow .muted}
edge rt -- i2 {.elbow .muted}
edge i1 -- l1 {.elbow .muted}
edge i1 -- l2 {.elbow .muted}
edge i2 -- l3 {.elbow .muted}
edge i2 -- l4 {.elbow .muted}

container scope "what A is answerable for" over i1,l1,l2 pad 0.24 {.dashed .muted}

step delegation
  show @issuers, scope
step certificates
  show @leaves
:::

**A tree is built from the leaves.** They are the fixed points, and every level above stands `between` its own children with an `offset` upwards. Written the other way round the compiler copes – it reads the whole block and resolves the dependencies in whatever order works out, not in line order – but the tool you then reach for does not: `align x middle rt, i1, i2` hands the *first* named element's coordinate to the rest, so it would not put the root over its children but stack both children on the root's centre line.

## free: One word draws all six brackets {.wide #tree-elbow}

**Every bracket in that tree is the same word, written six times.** `.elbow` leaves one end on the axis the two are further apart on, runs a rail halfway across the gap and arrives on the same axis; both attachment points are forced onto that axis, whatever the automatic choice would otherwise have taken. The rail is measured between the two elements' *facing edges*, not between their centres, so it lies on one line for both children of an issuer and the pair reads as one bracket rather than as two connectors. By hand that would be twelve waypoints, recomputed every time a level changes its spacing. Put the rail somewhere else with `via`; both on one line is an error. `.elbow` shares a slot with `.smooth`: how a line is drawn is a question with exactly one answer.

**Its dashed box stands around the whole set before the set is assembled.** It is written into the same beat as the issuers (`show @issuers, scope`), though its other two members arrive a beat later. Without the written `show` the usual rule applies: an outline is only as visible as its members and fits itself to the ones you can see, so it would first have grown around the issuer alone and then opened downwards. Naming it gets you both the visibility *and* the full extent. That is what the exception is for, and it is expressly not for the ordinary case.


## figure: One line per row | a table {.full #table}

::: draw {unit=150x54}
# The heading is one string split on |; the data rows are the bare strings
# under it. Every cell is an ordinary box and carries two generated tags,
# @t-row-N and @t-col-N.
table t "Attack | Layer | Countermeasure" at 0,0 col 1.0,0.45,1.35 row 0.42 {.clear .bare .left}
  "ARP spoofing | 2 | Dynamic ARP Inspection"
  "SYN flooding | 4 | SYN cookies"
  "DNS spoofing | 7 | DNSSEC"
  "TLS stripping | 7 | HSTS"

edge rule t.left,t-0-0.bottom -- t.right,t-0-0.bottom {.muted .front}

step link-layer
  style @t-row-1 {.tone-4}
step transport
  style @t-row-1 {.clear}
  style @t-row-2 {.tone-4}
step application
  style @t-row-2 {.clear}
  style @t-row-3, @t-row-4 {.tone-4}
step every-one-has-an-answer
  style @t-row-3, @t-row-4 {.clear}
  style @t-col-2 {.tone-2}
:::

**Five rows by three columns is fifteen boxes, each with its own name, width and placement, and a `below` chain to re-aim whenever a row is inserted.** `table` writes them: the heading is one string split on `|`, the data rows are the bare strings under it, `col` gives a width per column and `row` the height of one row. The attribute tail `{.clear .bare .left}` **lands on the cells and not on the frame**, which is what makes a table here a text block rather than a grid of little boxes. The rule under the heading is an ordinary edge between two coordinates, each half from the frame and half from the first cell.

**Every cell carries two generated tags, `@t-row-N` and `@t-col-N`.** So a row is one beat and a column is one beat, one line of source each – where otherwise every beat would carry three cell names to keep in step with the table by hand. Row 0 is the heading, so count from 1 when you mean data.

**The last beat is the one that reaches the handout.** A figure that lights one row after another and then stops comes out of the printer with its last row glowing, reporting a moment in the talk rather than the table. A fourth beat here takes the emphasis off again and tints the countermeasures column instead – the picture that says something without a talk around it. That it costs a beat is why the prominence verbs need no such thing: prominence a `step` sets is an act in the talk, and print takes its prominence from the opening beat. Prominence on an element's own line describes the drawing, and reaches the handout.

## figure: A protocol down the page | a sequence {.full #sequence}

::: draw {unit=150x40}
# The participants are lines of their own, because each needs a name to hold
# on to and an attribute tail of its own. Everything below is either a message
# (an arrow between two names) or a note.
sequence wa at 0,0
  actor u  "User"
  actor br "Browser"
  actor au "Authenticator" {.tone-3}
  actor rp "Relying Party"

  u  -> br "click \"Create passkey\""
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

# Two annotations the statement knows nothing about: ordinary lines hung off
# generated names. A beat can show them like any other element.
brace ctap over wa-3,wa-4,wa-5 pad 0.3 "on the device, over CTAP" side left {.small .turn}
text fresh "the challenge is the freshness" right of wa-2 gap 1.9 {.small .hand} -- wa-2

step in-the-browser
  emph @br-msgs
step on-the-device
  dim @br-msgs
  emph @au-msgs
  emph au
step back-to-the-party
  dim @au-msgs
  dim au
  emph @wa-msg-7, @wa-msg-8
step everything
  dim @wa-msgs
:::

**A protocol is the drawing a lecture asks for again and again, and the one that is hardest to change written out by hand.** Written out, every message carries its own y coordinate: inserting one in the middle means moving everything under it, renumbering all of them and re-guessing how far each lifeline runs – counted on this very figure, thirteen written lines for one inserted message. And a note box taller than the guessed spacing cuts silently into the label beneath it.

**`sequence` therefore owns exactly one thing: the vertical rhythm.** Every entry states how tall it is – a message as tall as its label, a note as tall as its text – and the statement stacks them. A box pushes down what stands under it, and an inserted line is an inserted line. Across, the statement measures itself the same way: all heads are as wide as the widest label, so a row of equal participants does not stand there ragged. `w`, `header` and `space` are overrides nobody normally writes.

## free: Every part of a sequence keeps a name {.wide #seq-names}

**A message may also name itself, and the name goes in front.** `tunnel c -- s "…"` – in exactly the slot an `edge` carries its name in, before the first endpoint. It is worth doing on the lines something else points at: a generated name like `x-4` counts messages and moves the moment one is added above it, where a written name stays put. Staying anonymous costs nothing, and most messages do.

**Everything else it answers by keeping a name on every part, not by adding words.** Each head keeps the name its `actor` line gives it; each lifeline is `<actor>-life`, each message `wa-N` (counted from 0, so the number drawn is `N+1`), its number `wa-n-N`, its smaller second line `wa-sub-N`, each note `wa-note-N`. Plus tags for the sets: `@wa-msg-N` for one message with its number and second line, `@wa-msgs` for all of them, `@au-msgs` for all that touch the authenticator, `@wa-notes`, `@wa-actors`, `@wa-lives`. The brace and the handwritten annotation on *A protocol down the page* are therefore ordinary lines hung off `wa-3` and `wa-2`, and the statement knows nothing about either.

**There is no `alt` / `else`.** Enclosing a group of messages and naming it is what `container … pad n` already draws, and two of the nine figures in the measured corpus wanted it. A word that freezes with the first release deserves more cases than that.


## figure: What else a message can be {.wide #seqmore}

::: draw {unit=140x44}
sequence x at 0,0 unnumbered space 0.34
  actor c "Client"
  actor p "Proxy"
  actor s "Server"
  c -> p "CONNECT server:443"
  p -> s "TCP handshake"
  p -> p "note the destination" "host, time, byte counts"
  c <- p "200 Connection established" {.dashed}
  tunnel c -- s "encrypted tunnel, end to end" space 0.9
  note c,s "the proxy forwards bytes\nand reads none of them" {.tone-2}

# The brace hangs off the name the message gave itself rather than off x-4: a
# generated name counts messages, so it moves as soon as one is inserted. A
# written name does not.
brace tun over tunnel side right "this is the payload" pad 0.35 {.muted .small}
:::

**Four tokens, and none of them is an arrow style of its own.** `->` and `<-` are the same message written from the sender's end and from the receiver's: write the reply as `c <- p` and both lines name the client first, so the source reads as a column instead of zig-zagging. `--` is a line with no head, a relation with no direction, and `<->` carries one at each end – a there-and-back caught in one line. There is no word for “dashed”; `{.dashed}` does that, a message line's attribute tail being an edge's, because a message *is* an edge.

**The token states the head, not a class.** Each of the four sets exactly one of the three states – no head, one, one at each end – so the same thing is never said twice on one line: `{.no-head}` beside a `->` is an error rather than a silent contradiction. Inside a beat the reverse holds, and there the class is the only spelling, because a token cannot be run again.

## free: A self-message, a note, and the air between bands {.wide #seq-entries}

**A self-message is the usual way to put a local action into the sequence**, and it loops out of the lifeline and back in. Its label stands beside the loop, its second line under it. A note between two names sits midway between their lifelines and is as wide as its own text – not as wide as the span, or three words become a banner. It breaks at `\n`, so a three-line note stays a note.

**`space` on an entry line is the air above that one band.** The tunnel at the foot of *What else a message can be* carries `space 0.9` and stands visibly apart from the setup over it; two or three such gaps break a long exchange into phases a room can hold. A blank line in the source does not do this: the statement reads through blank lines, so the source may be grouped however it reads best. On an `actor` line `space` is an error, there being no band above the heads.

## free: What a label sits on, and the column of numbers {.wide #seq-labels}

**Every message label brings its own ground.** A lifeline crosses every label a sequence draws, so the ground is drawn from the start and the dashed line is knocked out behind the words. `{.clear}` takes it away, `{.tone-2}` colours it. The smaller second line gets the same ground; the numbers on the left get none, standing outside the frame and crossing nothing.

**`unnumbered` takes the column of numbers away.** It is there otherwise because renumbering by hand is exactly the work the statement removes, and because the number drawn and the index in the tag are the same number: `@x-msg-3` is the arrow the room reads as 4. Where an exchange is short enough that nobody points at a number, the column is just paper.


## figure: A figure that plays itself | `autoplay` and `cycle` {.wide #autoplay}

::: draw {unit=150x56 autoplay=1400 cycle}
box  cr  "Crawler"                       {.tone-1}
box  wb  "Web site"  right of cr  gap 1.5
box  dt  "Detector"  right of wb  gap 1.5 {.tone-4}
edge cr -> wb "request"
edge wb -> dt "fingerprint"

step probe
  emph wb
step catch
  emph dt
  dim cr
step verdict
  style dt {.tone-2}
  label dt "Detected"
:::

**`autoplay=1400` walks this figure's beats by itself, and `cycle` starts again at the end.** One delay in milliseconds, the same for every beat. A cover figure moving while the room settles is the case it was built for; it stands on an ordinary slide here, because nothing about it is tied to a cover.

**It calls the same advance the space bar does.** A counter of its own would have let the drawing and the beat counter drift apart, and the next keypress would have jumped. Because it *is* the counter, the speaker window follows through the ordinary sync and the freeze gate applies. `cycle` rewinds through the same counter, so the speaker window follows the rewind too.

**The first keypress, click or scroll stops it for good.** Whoever has touched the deck has taken over, and a timer running on underneath them is worse than none. For the same reason it does not start at all on a slide that is already half revealed: half revealed means somebody left it that way.

**Between 200 ms and 60 s, and outside that refused rather than clamped.** Under 200 ms the room reads no beat; over a minute a “moving” figure is a still one that changes while nobody is watching. A clamped number is a number nobody wrote.

## closing: The drawing lives in the source | so it is reviewed, diffed and fixed where the words are {#end}

Seventeen statements, one inline `<svg>` per figure, and beats that ride the
same counter a reveal does. Nothing in this lecture is a file exported from a
drawing tool and pasted back in – which is why a figure survives the edit that
renames the thing it is about.
