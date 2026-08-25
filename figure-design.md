# Designing a `::: diagram`

How to lay out a figure so a room reads it in one look, written as instructions
rather than principles. Every rule has three parts: what to do, what the eye is
doing that makes it work, and a wrong/right pair in real DSL syntax you can copy.

It is addressed to two readers at once, a person and a language model, and both
should be able to work straight down it. The grammar itself is in `CLAUDE.md`
under *Animated infographics*; this file is about what to build with it.

The name for all of this is the Gestalt principles: a short list of things human
vision does before you have decided to look at anything. You do not get to opt
out of them. A figure either uses them or fights them.

---

## Before the first line: is a figure the right answer?

**Not everything is better drawn.** Colin Ware sets four lines of pseudo-code –
read a line, put it in capitals, write it out again – beside a flow chart of the
same loop, and the pseudo-code wins by a distance: it takes less work to read and
less ink to print. His conclusion is the sentence to carry away – *"Diagrams
should be used to express structural relationships among program elements,
whereas words should be used to express detailed procedural logic."*

What that leaves for a figure is everything a sentence has to be re-read to
hold. Ware's counter-example is six statements about a management hierarchy –
Jane is Jim's boss, Anne works for Jane, Anne is Mary's boss – which nobody can
keep in their head and everybody reads off a tree at a glance. A trust chain, a
network segment, a protocol exchange, a table of who answers what: that is
structure, and structure is what this grammar is for. A procedure whose steps
are conditions and assignments is prose, or it is code. A code listing will
serve it better than any number of diamonds, and so will a `::: script` block –
the directive that says "this part of the chunk is what I say, not what the
slide shows".

**This cuts against two figures in this repository, and it should.** The
flowchart in `lectures/diagrams` (`#flowchart`) and its cut-down twin in
`docs/artifact/figure-rules` (`#fc`) are packet-forwarding decisions, which is
exactly the case Ware's rule is aimed at. They are there to demonstrate a
*shape* the grammar can draw. Read them as specimens of the construction, not
as an argument that the construction was the right choice for that content.
When a real lecture wants a flow chart, write the pseudo-code first and see
whether the picture is still worth drawing beside it.

**If it is, answer Matt Carter's eight questions before drawing anything.**
They take a minute and they settle most of the figure:

1. What is absolutely necessary to show?
2. What is not necessary to show?
3. What is most important, and should be emphasised?
4. What is not important, and should be secondary to the main message?
5. What are the relationships between the individual elements?
6. Does the figure need a precise depiction of time?
7. Does it need a precise depiction of distance?
8. Which symbols have to stay consistent throughout?

Questions three and four are the `emph` / `calm` pair and the beat order below.
Question five decides between an `edge`, a `container` and mere proximity, which
is rules 1 to 3. Six and seven are the two that get skipped, and they are the
two that bite: if time is precise, the left-to-right order is carrying it and
nothing may be moved for tidiness; if distance is *not* precise, no gap may be
sized as though it were. Question eight is rule 4, written down once for the
whole lecture rather than per figure.

---

## 1. Group by distance, not by label

**Do:** make the gaps *inside* a group visibly smaller than the gaps *between*
groups. A factor of two is enough; a factor of three is unmistakable.

**Why:** proximity is the fastest grouping cue there is, and it fires before
anyone reads a word. If your spacing says one thing and your labels say another,
the spacing wins and the labels look like a mistake.

```
# wrong: four boxes, one rhythm, and only the words say which two belong together
box a "Switch"  at 0,0
box b "Router"  right of a gap 0.5
box c "Resolver" right of b gap 0.5
box d "Webserver" right of c gap 0.5

# right: the pair is a pair before you read it
box a "Switch"  at 0,0
box b "Router"  right of a gap 0.25
box c "Resolver" right of b gap 0.9
box d "Webserver" right of c gap 0.25
```

## 2. Enclose what a distance cannot say

**Do:** use `container` for a trust boundary, a network segment, a DMZ, a
machine that holds several parts. Do not try to say it with a bigger gap.

**Why:** common region beats proximity. A line drawn around things binds them
even when they are far apart, and even when something else sits between them.

```
# wrong: the home network is "the stuff on the left", and nothing says so
box a "A" at 0,0
box b "B" right of a gap 0.3
box r "Router" right of b gap 1.6

# right
box a "A" at 0,0
box b "B" right of a gap 0.3
box r "Router" right of b gap 1.6
container home "Home network" over a,b pad 0.4 {.dashed}
```

A `container` is only as visible as its members and re-fits when they move, so
it needs no `show` of its own and no maintenance when the figure changes.

## 3. Keep edges for relations

**Do:** draw an `edge` when two things are actually connected. When you only
want to point at something, use a leader: `-> target` on a `text`.

**Why:** uniform connectedness is the strongest grouping cue of all – stronger
than proximity, stronger than colour. An arrow used as a pointing finger claims
a relationship that is not there, and the room will look for it.

```
# wrong: an arrow that means "this label is about that box"
box  sw "Switch" at 0,0
text n  "learns MAC addresses" right of sw gap 1.2
edge n -> sw

# right: a leader is a thin muted stub and reads as an annotation
box  sw "Switch" at 0,0
text n  "learns MAC addresses" right of sw gap 1.2 -> sw {.small .muted}
```

## 4. One tone, one role, all the way through

**Do:** decide at the start of a lecture what each fill means, write it down,
and do not reuse a tone for a second meaning in the same figure.

**Why:** similarity groups things that are nowhere near each other. Two boxes in
the same tone are claimed to be the same *kind* of thing, and the claim is made
across the whole figure whether you meant it or not.

The assignment used by `lectures/network-security` – a good default for any
security lecture:

| Class | Means |
|---|---|
| `.tone-1` | infrastructure: switch, router, resolver, firewall |
| `.tone-2` | a legitimate host or participant |
| `.tone-3` | payload: packets, protocol fields, records |
| `.tone-4` | the one thing this beat is about (a solid fill, so use it sparingly) |
| `.accent` | the attacker and the attack traffic |
| `.dim` | present in the picture, not part of this scene |
| `.muted` | scaffolding: grid lines, zone outlines, annotations |

Two tones from the same slot on one element is a conflict the linter reports. A **slot** is a group of classes that answer one question - which fill, which outline, which typeface - and an element takes one class from each.
`.tone-4` with `.accent` is not a slot conflict but is still a mistake: the fill
is the accent, so accent ink on it is invisible.

**Which of them may cover a large area is a separate question.** Strong colour
belongs on small marks, thin lines and small areas, weak colour on large ones
(Ware). So `.tone-4` is right for a marker, a cell, one column of a chart or
one box in a row, and wrong for a full-height panel, where `.tone-2` with a
`.top` caption says the same thing without taking the figure over.

## 5. Let a step say what belongs together

**Do:** tag the elements of a beat and reveal the tag, rather than listing names.

**Why:** things that appear together are read as one thing (common fate). The
tag makes the source say the same thing the picture does, and it survives you
adding a ninth element to the group.

```
# wrong: correct, and it tells no one anything
step attack
  show e, e-web, reply1, reply2, note-spoof

# right
step attack
  show @attack
```

Most edges need no `show` at all. **An edge is only as visible as its two ends**,
a `container` only as visible as its members, a `text` with a leader only as
visible as what it points at. Reveal the boxes and the wiring follows.

That is the default, and naming the element overrides it. An arrow that should
arrive a beat *after* both the boxes it joins – the reply, the escalation, the
answer – gets a `show` of its own, and an outline that should stand around its
whole set before the set has filled up gets one too.

```
# the arrow arrives on its own beat, after both ends are already there.
# An edge has no name until you give it one: {#reply} in the tail.
edge srv -> cli "200 OK" {#reply}
step the-request
  show srv, cli
step the-answer
  show reply
```

Write the override only where the downhill reading is wrong. A `show` on every
element is the wrong-hand column of this rule again.

## 6. Give a label a ground when it sits on a line

**Do:** any text that overlaps a line, a grid, or a filled area gets a fill class
and some `pad`. `.paper` is the one that knocks a hole in what is behind it.

**Why:** figure and ground. Type on top of a line is read as texture, not as
words, and on a projector at the back of a room it is simply lost.

```
# wrong: the subnet label lies across the link and neither survives
text lbl "10.1.1.0/24" between sw,rt

# right: .paper punches the line out behind the word
text lbl "10.1.1.0/24" between sw,rt pad 0.12 {.paper .small}
```

This is also why `.paper` exists as a class at all: a box already defaults to it,
but a free `text` has no ground until you ask for one.

**And where the label sits inside its own room is four more words.** `.left`,
`.right`, `.top` and `.bottom` mean "as far that way as this element allows" –
its inner edge, not its border. A tall element with a short label is what they
are for: without them the word floats in the middle of a bar with empty space
above and below it.

```
# wrong: the label floats in the middle of a tall panel
box zone "TRUSTED" at 0,0 w 1.2 h 2.4 {.tone-2}

# right: it sits at the top, where the eye enters the shape
box zone "TRUSTED" at 0,0 w 1.2 h 2.4 {.tone-2 .top}
```

They combine with `.turn`, which is how a firewall bar gets a label at all: the
word reads up the bar, and `.top` decides which end it starts from.

With more than one line they move the *block*, so `.bottom` puts the last line
on the inner edge. They apply to a box, a dot and a free text. On an **edge**
all four name which side of the line the label sits on: `.top` / `.bottom`
beside a horizontal edge, `.left` / `.right` beside a vertical one, and
`.turn` stands the words on end beside it. Which pair applies depends on the
direction the edge ended up running, so naming the pair that runs *along* it
is a build warning rather than a parse error.
A container's caption and a brace's label are placed by their own statement, so
writing one of the four words there is an error rather than a class that
quietly does nothing.

**On an edge, a label is either *on* the line or *beside* it, and the choice
says what kind of label it is.** A fill class with no side named puts the words
on the line and knocks the line out behind them; naming a side lifts them clear
and carries the ground with them.

- **On the line** for a token that *identifies* the line: a sequence number, a
  port, a message type, a protocol name. It belongs to the line the way a street
  sign belongs to the street, and the line running out of both sides of it says
  so.
- **Beside the line** for a phrase that *describes what travels along it*:
  "only after the handshake", "dropped silently", "plaintext". A phrase with a
  line through it is read as two fragments before it is read as a sentence.

```
# wrong: one convention for the tokens and another for the phrases, in one
# figure – the reader has to decide what kind each label is before reading it
edge a -> b "1"                     {.top}
edge b -> c "carries the session key" {.paper .small}

# right: numbers ride on the line, phrases sit beside it, all the way through
edge a -> b "1"                     {.paper .small}
edge b -> c "carries the session key" {.top .small .muted}
```

**A phrase that describes a wire belongs to the wire, so place it against the
wire.** An edge has a coordinate of its own - `w1.cx`, `w1.cy` - and takes
`above`, `below`, `left of` and `right of` like anything else. Pinning the
phrase to one of the boxes at either end looks equivalent and is not: it keeps
its distance from the box and loses it from the line the moment a fraction or a
height changes, and nothing warns you.

```
# wrong: the phrase is measured from the Client, and the wire is not
edge cl.right:0.14 -> sv.left:0.14 "1" pad 0.1 {#f1 .paper}
text m1 "ClientHello" at cl.right+1.0,cl.top+0.16 {.small .muted}

# right: the phrase is measured from the wire it names
edge cl.right:0.14 -> sv.left:0.14 "1" pad 0.1 {#f1 .paper}
text m1 "ClientHello" at f1.cx-0.55,f1.cy-0.26 {.small .muted}
```

Raising those two boxes from `h 3.0` to `h 4.2` leaves the second label 13.5px
from its line, where it was authored, and drags the first one out to 22.3px.
Note that this is also the reason to give such an edge an `{#id}`: an edge has
no name until you write one, and a wire nobody can name is a wire nothing can
be placed against.

Pick the convention once per figure and keep it. Both readings are legible on
their own; a figure that mixes them makes the reader classify every label before
they can read one, which is more work than either convention saves.

## 7. Run edges on axes, and bend them once

**Do:** keep edges horizontal or vertical. When one has to get around something,
give it one waypoint, not three. Let crossings happen at right angles.

**Why:** good continuation – the eye follows a line through a junction and gives
up at a corner. Each bend is a place a reader has to re-acquire the line.

The build helps: an edge more than a fraction off an axis but less than 4° off
is warned about, because that is almost never intent. Anything genuinely
diagonal is far outside the threshold.

```
# wrong: down, across, down again to dodge the Dec box
edge c0 -> x1 via c0.cx,0.7 1.4,0.7 1.4,1.9 x1.cx,1.9

# right: out sideways into the channel between the columns, then down
edge c0 -> x1 via c0.right+0.2,c0.cy c0.right+0.2,x1.cy
```

Note what the right-hand version does *not* do: it does not write coordinates.
Both waypoints are expressions over other elements, so the route survives the
figure being redrawn – and because the second one takes its height from the
target, the final approach is exactly horizontal by construction rather than by
arithmetic you would have to redo.

**The commonest bend of all is one word.** `.elbow` leaves on the axis the two
ends are furthest apart on, runs a rail halfway across the gap, and turns in:
one turn out, one turn in, no waypoints written. It is what a tree's brackets
are made of, because the rail is measured between the two elements' facing
sides and not between their centres – so several children of one parent, sitting
on one level, all turn on the same line, and the set reads as one bracket rather
than as three separate connectors.

```
# wrong: the same two turns, written out once per child, against numbers that
# have to be redone the moment a rank moves
edge rt -- i1 via rt.cx,rt.bottom+0.75 i1.cx,rt.bottom+0.75 {.muted}
edge rt -- i2 via rt.cx,rt.bottom+0.75 i2.cx,rt.bottom+0.75 {.muted}

# right
edge rt -- i1 {.elbow .muted}
edge rt -- i2 {.elbow .muted}
```

It draws its own two waypoints, so `.elbow` together with `via` is an error
rather than a guess: use the class for the halfway rail and `via` to say where
the rail goes instead. And it is not routing – it looks at nothing else in the
figure, so an elbow can still run straight through a box that happens to be in
the way. That is rule 7's own problem, and `via` is the answer to it.

## 8. End an edge on an anchor, never inside a box

**Do:** name the side the arrow should arrive at – `b.left`, `b.top` – whenever
the automatic choice is wrong. Separate two edges between the same pair with a
fraction along the side.

**Why:** an arrowhead that crosses a border reads as a mistake in the drawing,
and it obscures both the border and itself. This is the "leave the edge clear"
rule: the arrow stops at the boundary and the boundary stays unbroken.

```
# wrong: two arrows on one line, and a head inside the box
edge eve -> bob "replay"
edge eve -> bob "forgery"

# right: the fraction slides the attachment along the side, so they run parallel
box  eve "Eve" at 0,0
box  bob "Bob" right of eve gap 2.0 same as eve
edge eve.right:0.3 -> bob.left:0.3 "replay"  {.accent}
edge eve.right:0.7 -> bob.left:0.7 "forgery" {.accent}
```

Leaving out the `same as` is how this rule is usually got wrong: a fraction is
measured along each box's own side, so the same fraction of two *different*
heights lands at two different heights and the pair comes out very slightly
skewed. The build says so by name – it is one of the two things the 4°-off-axis
warning is written for.

**Being on the grid is not the same as being aligned**, which is worth saying
because it looks as though it ought to be. Two boxes both placed at whole grid
coordinates still have different centre lines the moment their heights differ,
and a line leaving the middle of a shape an odd number of units high cannot
land on a gridline at all. Alignment here comes from `same as`, from `align`,
and from naming an anchor – never from the coordinates being round numbers.

If an edge must pass *over* something on its way, put a `.paper` label at the
crossing, or reroute. Do not leave two lines fused at a junction.

## 9. Draw the fewest things that carry the argument

**Do:** cut anything that is not doing work. A server does not need drive bays,
a compromised host does not need a biohazard symbol, a person does not need a
face unless the figure is about people.

**Why:** Prägnanz – vision settles on the simplest reading available. Every mark
you add is a mark someone has to rule out. Tufte's name for the same rule is the
data-ink ratio: take out the non-data ink and the redundant data ink, within
reason, and what is left is the drawing.

Before you add an element, ask which beat it belongs to. If the answer is "none",
it is decoration.

## 10. No shadows, no free colours, no rotation for effect

**Do:** stay inside the closed vocabulary.

**Why:** the four tones are mixed from `--emph` and `--ink` over `--paper`, so
they survive all seven themes including the two phosphor modes. Because they
are one hue at four strengths rather than four hues, they also survive a
monochrome printer, which four picked colours do not – red and green at the
same brightness come out as one grey. A fixed hue imported from a slide deck
works on exactly one background. And a shadow is a depth cue in a drawing that
has no depth: it adds a second edge to every shape and buys nothing. There is
none in the vocabulary.

`.turn` is for a label that has no room to be horizontal – a firewall bar, a
matrix row, an axis title. It is not a way to make a figure look busy.

## 11. Size is a claim, so make every size deliberate

**Do:** give elements of the same kind the same size, with `same as`. Reach for
a bigger box only where the thing in it really does contain or control the
smaller ones.

**Why:** relative size reads as importance (Carter). A box half again as wide as
its neighbours is taken to be the important one before anyone has worked out
why, and the usual reason it is wider is that its label happened to have more
letters in it. That is the drawing making an argument the author never made.

```
# wrong: three peers, and the middle one is twice the size of the others
# because "Correlation engine" is twice as long a phrase
box a "Sensor" at 0,0 {.tone-1}
box b "Correlation engine" right of a gap 0.4 {.tone-1}
box c "Log" right of b gap 0.4 {.tone-1}

# right: one width for the set, and the long label breaks instead
box a "Sensor" at 0,0 w 1.5 h 0.85 {.tone-1}
box b "Correlation\nengine" right of a gap 0.4 same as a {.tone-1}
box c "Log" right of b gap 0.4 same as a {.tone-1}
```

The `\n` is the whole fix for the long one. There is no automatic line
breaking, so the break is a decision, and putting it where the phrase divides
reads better than any measure the build could take. The height on the first box
is written out for a related reason: `same as` copies whatever size it finds, so
a one-line box would hand a one-line height to the box that now has two lines in
it. `.shrink` is the other answer where the box may not grow – but type size is
a size claim too, and a room reads small type as less important.

## 12. Lay the figure out the way the room reads it

**Do:** start at the top left and run left to right, top to bottom. The first
thing in time or in cause goes at the top left, the last at the bottom right.

**Why:** with nothing shouting for attention, a reader works through a figure
the way they work through a page of text (Carter): top left, then a zig-zag
rightwards and down. A figure whose flow runs against that gets read twice, once
the wrong way and again after the arrowheads have been noticed.

```
# wrong: the packet starts on the right and travels left
box out "Internet" at 0,0 {.tone-1}
box fw  "Firewall" left of out gap 0.8 {.tone-1}
box cl  "Client"   left of fw gap 0.8 {.tone-2}
edge out -> fw
edge fw -> cl

# right
box cl  "Client"   at 0,0 {.tone-2}
box fw  "Firewall" right of cl gap 0.8 {.tone-1}
box out "Internet" right of fw gap 0.8 {.tone-1}
edge cl -> fw
edge fw -> out
```

The exception is a figure whose subject is the *return*: a request out and a
response back is two directions on purpose, and the pair reads correctly
because the outward leg is the upper one. What does not survive is a single
chain laid out backwards. This is also what lets a swimlane carry time with no
axis drawn and a flowchart say which branch is the default with no word spent
on it: in both, the reading order is the argument.

## 13. `.bold` marks one element, never a category

**Do:** say what *kind* of thing an element is with a tone, an outline or a
shape, and keep `.bold` for the one element the figure is about.

**Why:** bold has no degrees (Carter). Bold on every system box says "these are
the systems" and at the same time says "look here" about all of them, which is
the same as saying it about none. `.bold`
also belongs to no class slot, so nothing displaces it: a `default box {.bold}`
boldens every box in the block and no element can opt out of it, and unlike two
tones from one slot the linter has nothing to say about the result.

```
# wrong: bold as a category marker – every box shouts, so none does
box cl "Client" at 0,0 {.tone-2 .bold}
box sv "Server" right of cl gap 1.6 same as cl {.tone-2 .bold}
box ca "CA"     above sv gap 0.7 same as cl {.tone-2 .bold}
edge cl -> sv "ClientHello" {.paper .small}

# right: the tone carries the category, the bold carries the emphasis
box cl "Client" at 0,0 {.tone-2}
box sv "Server" right of cl gap 1.6 same as cl {.tone-1 .bold}
box ca "CA"     above sv gap 0.7 same as cl {.tone-1}
edge cl -> sv "ClientHello" {.paper .small}
```

`.bold` and `emph` are not interchangeable, and which one you write decides
what the handout shows: `.bold` is a property of the drawing and prints, `emph`
is a lecture-time act and print strips it. Bold the element the whole figure is
about; `emph` the element this beat is about.

## 14. A leader is short, straight, and parallel to its neighbours

**Do:** put an outside label beside the thing it names, on the side where there
is room, and run the words towards the object: `.right` on a label sitting to
the left of its subject, `.left` on one sitting to the right.

**Why:** Carter's rules for outside labels are all one idea – a leader is
plumbing, and it must not be read as content. Keep the line as short as the
layout allows, keep several of them parallel, and never let two cross: a
crossing is read as a relationship, which is the claim rule 3 says an arrow
makes.

```
# wrong: two long leaders that cross, and neither label is anywhere near
# what it names
box  sw "Switch" at 0,0 h 1.2 w 1.2 {.tone-1}
box  rt "Router" right of sw gap 1.6 h 1.2 w 1.2 {.tone-1}
text n1 "learns MAC\naddresses" above rt gap 0.9 -> sw {.small .muted}
text n2 "forwards by\nprefix" above sw gap 0.9 -> rt {.small .muted}

# right: each label outside the pair, a short stub, and the words run
# towards the box they belong to
box  sw "Switch" at 0,0 h 1.2 w 1.2 {.tone-1}
box  rt "Router" right of sw gap 1.6 h 1.2 w 1.2 {.tone-1}
text n1 "learns MAC\naddresses" left of sw gap 0.5 -> sw {.small .muted .right}
text n2 "forwards by\nprefix" right of rt gap 0.5 -> rt {.small .muted .left}
```

**Two of Carter's rules for outside labels are already the default here, and it
is worth knowing which.** The stub a `text … -> ref` grows is drawn thin and
grey with no arrowhead, and it cannot be given one: a leader with an arrowhead
is indistinguishable from an `edge` in a busy figure, so the grammar does not
offer it. It also carries no waypoints, so it is a single straight segment by
construction. What is left to the author is the pair the grammar cannot decide
for them – which side, and how short – plus the alignment, which is what
`.left` and `.right` are for. On a label of more than one line they put the
words flush against the edge nearest the object, which is what Carter's
flush-right rule asks for.

**This is also how a figure that shows a procedure carries its explanation.** A
figure about structure works with few labels; one that shows a procedure needs
sentences, and they belong at the place they describe rather than in the prose
under the figure. It is rule 1 again: a reader who has to look away and come
back rebuilds the picture each time.

## 15. Take the outline off and the fill has to do its work

**Do:** if you write `.bare`, give the shape a fill dark enough to be a shape
on its own – `.tone-3` rather than `.tone-1`. And keep the count down. Several
`.bare` shapes in the strongest fill read as a figure in which everything is
emphasised at once.

**Why:** the outline is what closes the contour, and a closed contour is what
the eye takes for an object. Dropping it is a legitimate way to cut clutter and
it moves the whole job onto the fill, which then has to be darker than it would
otherwise have been (Carter). Past three or four such shapes the saving has
been spent and the figure has no quiet ground left to emphasise anything
against.

```
# wrong: one fill too pale to be a shape at all, three too loud to be
# anything but the point, and a reversed label at .small
box a "Collector"   at 0,0 w 1.3 {.bare .tone-1}
box b "Store"       right of a gap 0.4 same as a {.bare .tone-4}
box c "Correlator"  right of b gap 0.4 same as a {.bare .tone-4}
box d "alerts only" right of c gap 0.4 same as a {.bare .tone-4 .small}

# right: one tone for the set, the solid fill spent on the one element
# worth spending it on, and its label at full size
box a "Collector"   at 0,0 w 1.3 {.bare .tone-3}
box b "Store"       right of a gap 0.4 same as a {.bare .tone-3}
box c "Correlator"  right of b gap 0.4 same as a {.bare .tone-3}
box d "alerts only" right of c gap 0.4 same as a {.tone-4}
```

**The exception is a region rather than an object.** A `container` written
`.bare` with a pale fill is a ground, and a ground is supposed to recede – it
is the other half of rule 4's note about strong colour on large areas, and
`#motion` in `lectures/diagrams` is what it looks like done right. The rule
above is about shapes that have to read as *things*.

**`.tone-4` with `.small` is the specific pair to watch.** `.tone-4` turns its
own label the colour of the paper, so that it can be read on a solid fill, and
`.small` is 12px: reversed type at 12px is legible on the machine that drew the
figure and gone from the back of a lecture theatre. A solid-filled box that needs a small label needs a shorter label
instead.

---

## Four arrangements a lecture keeps asking for

Most lecture figures are one of four shapes. Three of them have a statement or a
class that writes them outright, and each of the four turns on one construction
fact that is not obvious from the grammar.

**A flowchart** runs its main road straight down and lets every branch leave
sideways, so a reader who follows the vertical line is following the case that
goes through. The decision is a `.diamond`: the one outline a room has been
trained to read since school. Keep its label to two or three words. A diamond
offers its text only a strip through the middle, so the build sizes it at
**twice** what a rectangle would need for the same string – a sentence in a
diamond arrives at four times the area of the boxes around it and takes the
figure over.

```
# wrong: a sentence in a diamond, dwarfing every box in the column
box d1 "Is this flow already known to the state table?" below in gap 0.55 {.diamond .tone-1}

# right: the question in the diamond, the detail in a note beside it
box  d1 "Known flow?" below in gap 0.55 {.diamond .tone-1}
text n1 "state table, per five-tuple" right of d1 gap 0.5 -> d1 {.small .muted}
```

**A swimlane** is `lanes`: equal bands, `.turn`ed captions outside the left
edge, contents placed against a band's own centre (`swim-1.cy`) with the
left-to-right order carrying the time. Do not build one out of `container`s –
a container fits its members, so bands holding different numbers of things come
out ragged at both ends, which is the opposite of what a swimlane means. Every
hand-off crosses a band, which is what `.elbow` is for: a straight line from one
band to the next reads as a diagonal through a band it never enters.

```
# right: three bands, and nothing has to say what the time axis is
lanes swim "User | SOC | IT ops" at 0,0 w 7.4 h 0.95 {.muted .dashed}
box  rep "Reports\nsuspect mail" at swim.left+0.85,swim-0.cy w 1.5 {.tone-2}
box  tri "Triage"                at swim.left+2.5,swim-1.cy  w 1.1 {.tone-1}
edge rep -> tri {.elbow}
```

**A tree is built leaf-first.** The leaves are the fixed points – they are what
the figure is actually about – and each parent is then placed `between` its own
two children with an upward `offset`. Move a leaf and every rank above it
re-centres with no other line touched.

```
# wrong: root first, then "centre it over the children" with align. align hands
# the FIRST element's coordinate to the rest, so this does not centre the root
# over its children – it stacks both children on the root's own centre line
box   rt "Root CA"      at 0,0
box   i1 "Issuing CA A" below rt gap 1.5
box   i2 "Issuing CA B" right of i1 gap 0.8 same as i1
align x center rt, i1, i2

# right: leaves first, and every parent is the midpoint of what it signs
box  l1 "www.example.org"  at 0,0 w 1.5
box  l2 "mail.example.org" right of l1 gap 0.2 same as l1
box  i1 "Issuing CA A" between l1,l2 offset 0,-1.5 w 1.5
edge i1 -- l1 {.elbow .muted}
edge i1 -- l2 {.elbow .muted}
```

**A table** is `table`: the heading row as one quoted string split on `|`, the
body rows as bare quoted strings on the lines directly under it, `col` giving
one width per column and `h` the height of one row. Every cell arrives carrying a tag
for its row and a tag for its column – `@t-row-2`, `@t-col-1` – so lighting a
row per beat is one line of source rather than one cell name per column, kept in
step with the table by hand.

**Rows are entities and columns are properties, and the order of the rows is an
argument.** Readers expect that shape and scan a column downwards looking for
the exception, so the transposed version – properties down the side, entities
across the top – is harder to read and buys nothing (Carter). Ordering the rows
on one column's *value* rather than on their names makes that column the one the
table is about, which is either the point or a claim you did not mean to make;
alphabetical is the fallback for when no order says anything. The same holds
for a chart: a run of bars sorted by length reads as a ranking with no word
spent on saying so, and `horizontal` below is what makes the sorted form
legible.

**And a table's last beat is what print gets.** A figure that lights each row in
turn and stops prints with its final row still lit, which reports a moment in
the talk rather than the table. If the finished picture wants no highlight – or
wants a different one, a tinted answer column, say – that is one more beat, and
a figure without it is one beat short.

```
# wrong: the last row is lit when the lecture ends, so it is lit on the handout
step at-the-application
  style @t-row-4 {.tone-4}

# right: one more beat, ending on the picture worth printing
step at-the-application
  style @t-row-4 {.tone-4}
step every-one-of-them-has-an-answer
  style @t-row-4 {.clear}
  style @t-col-2 {.tone-2}
```

`style` and `emph` differ here, and which one you wrote decides what the
handout shows: a tone a `style` step puts on a row describes the drawing, so
print keeps it, while `emph` and `calm` are lecture-time acts that print strips. So a highlight that
is only for the room can be an `emph` and needs no closing beat; one written as
a tone needs the beat that takes it off again.

---

## Charts: six decisions the grammar will not make for you

**Say what shape the chart is with `aspect`, not with `w` and `h`.** Those two
are counts of *grid cells*, and a grid cell is not square: at `unit=150x52` a
plot written `w 1.9 h 1.5` arrives 285 pixels by 78, which is very wide and
very flat and looks nothing like the two numbers that produced it. It is the one
place where the coordinate grid shows through into a decision about the picture,
and it catches everybody once.

```
# wrong: two numbers that look like a shape and are not
plot roc "False positive rate" "True positive rate" at 0,0 w 1.9 h 1.5 x 0,1 y 0,1 step 0.2

# right: the proportion the room sees, and the build works the rest out
plot roc "False positive rate" "True positive rate" at 0,0 w 1.6 aspect 1:1 x 0,1 y 0,1 step 0.2
```

A ROC curve is square because both axes are the same quantity and the diagonal
has to read as 45°. A trend over time is usually wider than tall. A comparison
of a handful of magnitudes is often neither, because it should not be a plot at
all. Write `aspect 4:3`, `aspect 1:1`, or one bare number meaning that many wide
to one tall. Writing `w`, `h` and `aspect` together is an error: two ways of
stating one number is two ways of stating different ones.

**A row of charts meant to be compared takes its size from the first of them.**
`same as <chart>` on a `plot` or a `bars` copies the whole frame, so the frames
match to the pixel. Three that differ by a hair cannot be read against one
another, which is what a row of charts is for.

```
# right: one frame stated once, and the rest said in two words each
plot roc  "False positive rate" "True positive rate" at 0,0 w 1.6 aspect 1:1 x 0,1 y 0,1 step 0.25
plot roc2 "False positive rate" "True positive rate" right of roc gap 0.7 same as roc x 0,1 y 0,1 step 0.25
```

The chart being copied has to be written **above** the one copying it. A chart is
sized as its own line is read, because that is when its gridlines, its ticks and
its columns are placed, so it can only copy one it has already seen. Rather than
draw a frame of the wrong size, the build names which of three things went wrong:
the chart named is declared below, the name belongs to something that is not a
chart, or there is no such name in the block. `same as` beside `w`, `h` or
`aspect` is refused as well, because the size would then be stated twice, and so
is `same as` on a `series of` line: a series draws in the frame of the chart it
joined and has no frame of its own to size.

**Turn a bar chart sideways when the labels are phrases, or when the point is a
ranking.** A reader ranks lengths from a shared left edge more reliably than
heights from a shared floor, so `horizontal` on a `bars` line is not one more
way of drawing the same picture: it is usually the better one. And a category
called "DNS cache poisoning" cannot be written under an upright column at all –
it either overlaps its neighbour, turns on its side, or gets abbreviated into
something the room has to decode.

```
# wrong: four phrases under four columns, none of them legible
bars t "20,19,17,12" "ARP spoofing SYN flood DNS poisoning TLS strip" at 0,0 w 2.2 h 0.9

# right: sideways, and the category names split on a pipe so a label may be a phrase
bars t "20,19,17,12" "ARP spoofing | SYN flood | DNS cache poisoning | TLS stripping" at 0,0 w 2.2 h 1.4 horizontal
```

The quoted list of category names is split on `|` whenever it contains one, and
on spaces otherwise – the same mark that separates a `table` row and a `lanes`
name. Everything else about the chart is unchanged: a second `series of` still
groups or stacks, a `brace` still spans three bars, `emph 2` still marks the
third one from the opening beat, and the names are still `t-0`, `t-1`, `t-2`.
Only two things move: the strip of category labels, to a right-aligned column
down the left margin, and the baseline, which stands up on the left.

Keep the upright form for a distribution, a time series, or anything where the
categories are short and ordered – a run of columns left to right reads as a
sequence, which is exactly what a sideways chart cannot say.

**Three overlapping lines is the limit, and the way past it is more frames, not
more tones.** Four curves in one plot is a knot: every crossing is a place the
eye has to pick its line up again, and the fifth tone does not exist anyway.
Draw one frame per comparison and put the *same* series in every one, `.muted`,
as the baseline (Carter). Each curve is then compared against something that
does not move, and the frames can be read in either order.

```
# wrong: four curves, a dozen crossings, and the reader ranking tones
plot p "week" "alerts" at 0,0 w 2.0 aspect 4:3 x 0,8 y 0,8 step 2
edge p@0,p@2   -> p@8,p@7   via p@2,p@3   p@4,p@4.4 p@6,p@6   {.smooth .no-head .muted .thick}
edge p@0,p@3.5 -> p@8,p@3   via p@2,p@6.2 p@4,p@2   p@6,p@5.5 {.smooth .no-head .accent}
edge p@0,p@6   -> p@8,p@5.2 via p@2,p@4   p@4,p@7.5 p@6,p@3.6 {.smooth .no-head .tone-3}
edge p@0,p@1   -> p@8,p@7.6 via p@2,p@7   p@4,p@2.5 p@6,p@6.8 {.smooth .no-head .tone-1}

# right: one frame per site, and the same grey baseline in both
plot p "week" "alerts, site A" at 0,0 w 1.5 aspect 4:3 x 0,8 y 0,8 step 2
edge p@0,p@2   -> p@8,p@7 via p@2,p@3   p@4,p@4.4 p@6,p@6   {.smooth .no-head .muted .thick}
edge p@0,p@3.5 -> p@8,p@3 via p@2,p@6.2 p@4,p@2   p@6,p@5.5 {.smooth .no-head .accent}
plot q "week" "alerts, site B" right of p gap 1.1 w 1.5 aspect 4:3 x 0,8 y 0,8 step 2
edge q@0,q@2 -> q@8,q@7   via q@2,q@3 q@4,q@4.4 q@6,q@6   {.smooth .no-head .muted .thick}
edge q@0,q@6 -> q@8,q@5.2 via q@2,q@4 q@4,q@7.5 q@6,q@3.6 {.smooth .no-head .accent}
```

Two frames side by side have to carry the same `x` and `y` domains, or the
comparison the arrangement promises is a lie. Nothing in the build checks that,
and it is the one thing to re-read before the figure ships.

**Name a curve at the curve.** A `text … -> ref` beside the end of a line costs
one statement and puts the name where the eye already is; a key in the corner
asks a reader to hold a tone in memory, look away, and come back (Carter). A
legend is the right answer only where the names cannot go beside the marks at
all – a `bars` chart with two or three `series of`, where the marks are
interleaved columns – and there it is built by hand out of small `.sharp` boxes
and texts, as `#sp8` in `docs/artifact/figure-rules` shows.

**A histogram is a `bars` with `space 0`, and the space is the whole
difference.** A bar chart compares categories, which are separate things, so
its columns stand apart. A histogram shows a distribution over one continuous
axis, and its bins are adjacent stretches of that axis, so its columns touch.
Each drawn the other way round says something false about its own data: a
histogram with gaps claims its bins are unrelated categories, and a bar chart
without them claims its categories are a continuum.

```
# right: a distribution, and the bins are adjacent, so the columns are too
bars h "2,5,11,19,24,18,9,4,2" "0 1 2 3 4 5 6 7 8" at 0,0 w 2.4 aspect 3:1 space 0 {.tone-3}

# right: four categories, which are separate things, and the gaps say so
bars b "24,19,11,5" "A B C D" at 0,0 w 2.4 aspect 3:1 {.tone-3}
```

Give a histogram at least five bins; fewer is a shape with no distribution in
it. And three of Carter's bar-chart rules are already the default here, which
is worth knowing so you do not spend a line restating them. A `bars` column is
measured up from zero, and a value below zero is refused by name – so the
truncated axis that turns a small difference into an enormous one is not
writable. The default `space` is a quarter of the cell, which puts the gap at
about a third of the bar width. And a `series of` shares its cell with the
columns beside it, so grouped bars touch inside a group and the gap falls
between groups, which is Carter's rule for grouped data without your having to
space anything by hand.

---

## Steps: four beats, in this order

A figure with steps is an argument, not a slideshow. The order that works
almost every time:

1. **The stage.** Everything that is just true: the topology, the axes, the
   participants. One beat, no emphasis.
2. **The normal case.** What happens when nothing is wrong. This is what the
   attack will be measured against.
3. **The disturbance.** The attacker, the failure, the exception. This is the
   beat that earns `.accent` and `emph`.
4. **The consequence.** The defence, the result, the number. Often `calm` on
   what came before, so the last beat is not four things shouting at once.

Rules that go with it:

- **Print is the last beat without the emphasis.** Not the union of all beats.
  So the last beat has to be a picture that makes sense on paper, standing
  alone. If it is not, you have one beat too few.
- **Backwards costs nothing.** Every beat is recomputed from the counter, so
  you can step back and forth freely and `hide` is as usable as `show`.
- **Do not put a `show` on every element.** See rule 5. Over-specified steps are
  where figures rot: someone adds an element, forgets the step, and it never
  appears.
- **An element starts hidden only if the first thing any step says about it is
  `show`.** So a thing that is on screen at the start and taken away later needs
  no special handling.
- **Emphasis a figure opens with belongs on the statement, not in step 1.**
  On a chart that means the `bars` line itself: `bars port "12,9,41,7,5" … emph 2 calm 0,1,3,4`
  says which column the sentence beside the figure is about from the moment the
  slide appears. Written as a step instead, the picture the room first sees is
  five equal columns and the point only exists once you have pressed Space.

---

## Before a figure is finished

Work down this list. It is written so it can be checked mechanically.

1. `node lint.js <source.md>` is clean. No warnings talked past.
2. `node build.js <source.md>` prints no `[diagram]` warning, or the source
   carries a comment saying why the remaining one is deliberate.
3. No edge runs at a slight angle. (The build says so; do not silence it by
   nudging – align the elements.)
4. Every label that overlaps a line or a fill has a fill class of its own.
5. Every arrowhead lands on a border, none inside a box, none two-on-a-line.
6. No tone carries two meanings in one figure, and none contradicts the table
   in rule 4.
7. Each beat is one idea. Read the step names out loud in order: they should
   sound like an argument.
8. The last beat is a sensible handout picture on its own. A figure that lights
   one row, one column or one box at a time ends on a beat that puts the
   highlight where the handout should have it, or takes it off.
9. Every edge label in the figure follows one convention: on the line for a
   token that names the line, beside it for a phrase that describes what runs
   along it. Never both in one figure.
10. Every `.diamond` holds two or three words. It is sized at twice what a
    rectangle would need, so a sentence in one is a shape four times the area of
    its neighbours.
11. Nothing is hand-built that a statement writes: a grid of labelled cells is
    `table`, equal bands with names down the side are `lanes`, columns whose
    heights are numbers are `bars`, and one turn out and one turn in is
    `.elbow`. Twelve hand-named boxes are twelve things to keep in step.
12. Every chart says its shape with `aspect`, not with `w` and `h`. A grid cell
    is not square, so those two do not describe the proportion anyone sees. A
    row of charts meant to be read against one another takes its frame from the
    first of them, with `same as`.
13. Every bar chart whose categories are phrases, or whose point is a ranking,
    runs `horizontal`. Four words under four upright columns are four words
    nobody in the room reads.
14. Opened in the browser, cycled through all seven themes with `A`: nothing
    disappears, nothing goes unreadable. The two phosphor modes are the strict
    ones.
15. `node test/run.mjs framing` passes. It measures the slack on all four sides
    of every figure and is the only check that catches a picture which is
    correct but not centred in its own frame.
16. The figure is a figure at all: structure – what holds what, what connects
    to what, what is the same as what – rather than a procedure that would read
    better as prose, as a listing, or as a `::: script` block.
17. Nothing is a different size by accident. Elements of one kind carry
    `same as`, and every size difference left standing is a claim about
    importance the figure means to make.
18. The flow runs left to right and top to bottom, unless the figure's subject
    is a return leg.
19. `.bold` is on at most one element. No leader crosses another, and no `.bare`
    *box* carries a fill paler than `.tone-3` (a `.bare` container is a ground
    and is exempt).
20. No plot holds more than three overlapping lines; a fourth is a second frame
    carrying the same `.muted` baseline. Every histogram is `space 0`, and no
    bar chart is.

---

## What this grammar deliberately cannot do

Knowing the walls saves the time spent walking into them.

- **No free colours.** Four tones, plus `.accent` and `.muted`. If you need a
  fifth distinction, use shape (`.hex`, `.diamond`, `.chevron`, `.wedge`,
  `.cross`, the pointed ones aimed with `point`) or family (`.mono`,
  `.serif`) instead – and ask first whether the figure is doing too much.
- **No automatic routing.** Edges are straight segments through the waypoints
  you write. Nothing steps around a box for you, and nothing fans out parallel
  edges – that is what the `:0.3` / `:0.7` fractions are for. The single
  coordinate the engine will invent for you is `.elbow`'s rail, and it is fixed
  at halfway across the gap with no option to move it.
- **No automatic line breaking.** A label breaks where you write `\n`, and
  nowhere else.
- **No shadows and no gradients.** Drawing order is fixed too – containers,
  images, braces, edges, then boxes, dots and texts – with one way out:
  `.front` on an edge moves it in front of the boxes. That is right for an
  axis and wrong for an arrow, which should be covered by the box it arrives
  at, so it is opt-in.
- **No arbitrary rotation.** `.turn` turns a label 90°, and `point` aims a
  chevron or a wedge at one of the four compass directions. Nothing rotates to
  an arbitrary angle.
- **No cylinder, no cloud, no polygon of your own.** The outlines are the
  rectangle, the circle, the hexagon, the diamond, the chevron, the wedge and
  the cross – the chevron and the wedge aimed with `point`. A database is a
  `.round` box in the tone you gave storage; a cloud is a box labelled
  `Internet`. If a shape genuinely carries meaning of its own, draw it as an
  SVG file and place it with `image`.
- **Text width is estimated, not measured.** There is no browser at build time,
  so the estimate is tuned slightly generous – a box a little wider than its
  text reads as designed, a box narrower reads as broken. Where it matters,
  give an explicit `w`.
- **No pie chart.** A pie asks a reader to compare angles, which people do
  badly and inconsistently, and Carter's advice is to avoid one unless you know
  exactly why you want it. The form to reach for instead, for parts of a whole,
  is a stacked bar – `series of … stacked` – which reads off a shared baseline
  and, unlike two pies, can be set beside another one and compared.
- **No constraint solver.** Positions are expressions over other positions,
  resolved by one topological walk. A circular arrangement is an error naming
  the line, where a solver would instead render it plausibly wrong.
