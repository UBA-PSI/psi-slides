---
title: "The title block:"
subtitle: which line is loud?
presenter: Dominik Herrmann
affiliation: Otto-Friedrich-Universität Bamberg
contact: https://github.com/UBA-PSI/psi-slides
notice: Built from this one file.
info: |
  A reference lecture
  psi-slides
cover: masthead
closing-credits: cover
section: rule
theme: light-blue
lang: en
collapse: none
style:
  headline: eyebrow
  caps: on
---

## title: {#cover}

# The pair

## principle: A title slide carries two lines {#pair}

A cover carries **a pair of lines**, and so do a divider and a closing slide –
the frontmatter says `title:` and `subtitle:`, a chunk heading says
`Heading | Sub`. By default the first line is the loud one.

`style: {headline: eyebrow}` sets the pair the other way up: the first line
becomes a small kicker and the second carries the weight. The cover and the
closing slide of this lecture are drawn that way.

## definition: The words never move, only their type {#treatment}

**`title:` holds the lecture's name, whichever line is loud.** `headline`
changes how the two lines are set, not which key holds which words.

`title:` is also the `<title>` element, the entry in the table of contents, and
what the search index reads. A hook written into `title:` to make it loud would
also rename the browser tab.

**One key serves the cover, the section dividers and the closing slide
at once**, because all three carry a pair.

# The credits

## principle: Four ranks, not one line and a list {#ranks}

**The credit block sets four ranks of type.** `presenter:` is the strongest,
`affiliation:` sits quieter directly under it, `info:` carries the venue and the
date at the size of the small print, and `contact:` / `notice:` share a row
along the foot.

So the line that *qualifies the speaker's name* is set apart from the one that
gives the date, and the block reads as a masthead rather than a list.

## example: The four slots, as this lecture writes them {.wide #slots}

```yaml
presenter:   Dominik Herrmann
affiliation: Otto-Friedrich-Universität Bamberg
contact:     https://github.com/UBA-PSI/psi-slides
notice:      Built from this one file.
```

**`contact:` and `notice:` are a row along the foot**, not two more stacked lines.
They do a different job from the two ranks above them: a presenter and an
institution introduce the speaker, while an address and “the slides are online”
answer what the audience will ask afterwards.

## principle: Capitals get their tracking without being asked {#caps}

**`style: {caps: on}` sets the small type around a title in capitals** – the
eyebrow, the presenter, the affiliation. Never the headline: a key that
capitalises the loud line is a key that makes a talk shout.

The tracking is not a second setting. Capitals set at the tracking of lowercase
read as one jammed word, so the build tracks out **any slot already in
capitals** – including one you typed in capitals yourself.

## closing: Two lines, four ranks | and one decision about which line is loud {#end}

This slide wears `closing-credits: cover`, so it carries the whole block the
cover carried.
