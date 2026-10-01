---
title: Display faces
subtitle: A typeface for the cover, the dividers and the closing slide
presenter: Dominik Herrmann
affiliation: Otto-Friedrich-Universität Bamberg
contact: https://github.com/UBA-PSI/psi-slides
notice: Built from this one file.
info: |
  A reference lecture
  psi-slides
cover: display
closing-credits: contact
section: number
theme: light-blue
lang: en
collapse: none
auto-fit: true
fonts:
  display: Anton
---

## title: {#cover}

# What the role is {#role}

## principle: A divider is recognised, not read {#why}

**A cover and a section divider can wear a loud typeface** without harm. A
divider is recognised more than read: the audience sees that one has arrived
and knows roughly where it is in the lecture.

The three text roles cannot do that job. They are chosen to survive a lit room
at paragraph length, which is the opposite requirement.

## definition: `fonts: {display: …}` names a fourth role {.wide #key}

**One key, and it reaches exactly three slide kinds** – the cover, the section
dividers and the closing slide:

```yaml
fonts:
  display: Anton      # the cover, the dividers, the closing slide
  serif: Literata     # the body roles are untouched
```

This lecture wears `Anton`. The heading above this paragraph does not, and
neither does a card lead, an overlay title or a figure label. **A lecture that
names no display face embeds nothing** for the role.

## free: Thirty-two faces, in three flavours {.wide #roster}

All SIL OFL 1.1, one latin `woff2` each, a median of 21 KB on top of the lecture.

::: cards 2 {.small}
- **hand** – pairs with either body face\
  Amatic SC, Caveat, Caveat Brush, Kalam, Patrick Hand, Shantell Sans
- **machine** – the monospaced ones pair with either body face\
  Chakra Petch, Orbitron, Pixelify Sans, Press Start 2P, Rubik Mono One,
  Silkscreen, Space Mono, VT323
:::

::: cards 2 {.small}
- **graphic, serif** – wants a sans body\
  Abril Fatface, Alfa Slab One, Bodoni Moda, DM Serif Display, Instrument
  Serif, Prata, Yeseva One, Young Serif
- **graphic, sans** – wants a serif body\
  Anton, Archivo Black, Bebas Neue, Big Shoulders Display, Bricolage Grotesque,
  Oswald, Space Grotesk, Staatliches, Syne, Unbounded
:::

A name and a sentence do not carry what a face looks like at the back of a room.
The [display faces page](https://uba-psi.github.io/psi-slides/display-faces.html)
draws each one into a real cover and a real divider.

# Choosing one {#choosing}

## free: A display serif wants a sans body {.wide #pairing}

**Two serifs on one slide read as one typeface set badly rather than as two.**
So the roster records what each face *is*, and `lint.js` warns `display-pairing`
when it matches the body role the deck reads in:

```yaml
font: sans                # the deck reads in IBM Plex Sans
fonts: {display: Prata}   # …so the cover can be a serif
```

A hand face or a monospaced machine face pairs with either body and never
draws the warning. **Chakra Petch, Orbitron and Pixelify Sans are machines to
look at and sans faces to pair with**, so over a sans body they warn.

## free: The size is measured, the taste is yours {.wide #scale}

These faces disagree about width by a factor of three, and the cover's type size
was tuned for Literata. **So each face carries a measured correction** – its
advance width against Literata's, applied as a `size-adjust` descriptor. Without
it Anton looks timid and Press Start 2P runs off the slide.

What the correction deliberately does not equalise is *apparent* size: a face
that is wide per glyph has to be set small to keep the line count, and then it
looks small. Width is normalised because a line too many is the failure that
breaks a slide.

```yaml
style: {display-scale: 1.4}   # 0.6 to 1.8, on top of the measured value
```

## principle: No keypress can reach it {.standard #keys}

`F` cycles the body face and `A` cycles the seven themes; **the cover and the
dividers ignore both.** The face reads its own variable rather than the one `F`
re-points, and no theme names a family.

Its *colour* still follows the theme. The numeral on these dividers is the
accent: it moves with `A` while the words beside it do not.

## closing: That is the whole role | One key, three slides {#end}

The rest is the roster: the
[display faces page](https://uba-psi.github.io/psi-slides/display-faces.html)
shows each face on a real cover and a real divider.
