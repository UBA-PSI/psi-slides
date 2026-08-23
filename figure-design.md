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

**Why:** uniform connectedness is the strongest grouping cue of all - stronger
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

The assignment used by `lectures/network-security` - a good default for any
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

Two tones from the same slot on one element is a conflict the linter reports.
`.tone-4` with `.accent` is not a slot conflict but is still a mistake: the fill
is the accent, so accent ink on it is invisible.

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

## 7. Run edges on axes, and bend them once

**Do:** keep edges horizontal or vertical. When one has to get around something,
give it one waypoint, not three. Let crossings happen at right angles.

**Why:** good continuation - the eye follows a line through a junction and gives
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
figure being redrawn - and because the second one takes its height from the
target, the final approach is exactly horizontal by construction rather than by
arithmetic you would have to redo.

## 8. End an edge on an anchor, never inside a box

**Do:** name the side the arrow should arrive at - `b.left`, `b.top` - whenever
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

The `same as` is load-bearing, and leaving it out is how this rule is usually
got wrong: a fraction of two *different* heights lands at two different places,
so the pair comes out very slightly skewed. The build says so by name - it is
one of the two things the 4°-off-axis warning is written for.

If an edge must pass *over* something on its way, put a `.paper` label at the
crossing, or reroute. Do not leave two lines fused at a junction.

## 9. Draw the fewest things that carry the argument

**Do:** cut anything that is not doing work. A server does not need drive bays,
a compromised host does not need a biohazard symbol, a person does not need a
face unless the figure is about people.

**Why:** Prägnanz - vision settles on the simplest reading available. Every mark
you add is a mark someone has to rule out.

Before you add an element, ask which beat it belongs to. If the answer is "none",
it is decoration.

## 10. No shadows, no free colours, no rotation for effect

**Do:** stay inside the closed vocabulary.

**Why:** the four tones are mixed from `--emph` and `--ink` over `--paper`, so
they survive all seven themes including the two phosphor modes. A fixed hue
imported from a slide deck works on exactly one background. And a shadow is a
depth cue in a drawing that has no depth: it adds a second edge to every shape
and buys nothing. The vocabulary has none, and that is not an oversight.

`.turn` is for a label that has no room to be horizontal - a firewall bar, a
matrix row, an axis title. It is not a way to make a figure look busy.

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

---

## Before a figure is finished

Work down this list. It is written so it can be checked mechanically.

1. `node lint.js <source.md>` is clean. No warnings talked past.
2. `node build.js <source.md>` prints no `[diagram]` warning, or the source
   carries a comment saying why the remaining one is deliberate.
3. No edge runs at a slight angle. (The build says so; do not silence it by
   nudging - align the elements.)
4. Every label that overlaps a line or a fill has a fill class of its own.
5. Every arrowhead lands on a border, none inside a box, none two-on-a-line.
6. No tone carries two meanings in one figure, and none contradicts the table
   in rule 4.
7. Each beat is one idea. Read the step names out loud in order: they should
   sound like an argument.
8. The last beat is a sensible handout picture on its own.
9. Opened in the browser, cycled through all seven themes with `A`: nothing
   disappears, nothing goes unreadable. The two phosphor modes are the strict
   ones.
10. `node test/run.mjs framing` passes. It measures the slack on all four sides
    of every figure and is the only check that catches a picture which is
    correct but not centred in its own frame.

---

## What this grammar deliberately cannot do

Knowing the walls saves the time spent walking into them.

- **No free colours.** Four tones, plus `.accent` and `.muted`. If you need a
  fifth distinction, use shape (`.hex`, `.chevron`) or family (`.mono`,
  `.serif`) instead - and ask first whether the figure is doing too much.
- **No automatic routing.** Edges are straight segments through the waypoints
  you write. Nothing steps around a box for you, and nothing fans out parallel
  edges - that is what the `:0.3` / `:0.7` fractions are for.
- **No automatic line breaking.** A label breaks where you write `\n`, and
  nowhere else.
- **No shadows, no gradients, no z-order control.** Drawing order is fixed:
  containers, images, braces, edges, then boxes, dots and texts.
- **No arbitrary rotation.** `.turn` is 90°, and that is the whole feature.
- **No cylinder, no cloud, no polygon of your own.** The outlines are the
  rectangle, the circle, the hexagon, the two chevrons and the wedge. A database
  is a `.round` box in the tone you gave storage; a cloud is a box labelled
  `Internet`. If a shape is genuinely load-bearing, it is an SVG asset and
  `image` places it.
- **Text width is estimated, not measured.** There is no browser at build time,
  so the estimate is tuned slightly generous - a box a little wider than its
  text reads as designed, a box narrower reads as broken. Where it matters,
  give an explicit `w`.
- **No constraint solver.** Positions are expressions over other positions,
  resolved by one topological walk. A circular arrangement is an error naming
  the line, which is the whole point: a solver would render it plausibly wrong.
