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

## principle: Every title slide already had two lines {#pair}

**A cover carries a pair, and so does every divider and closing slide** – the
frontmatter says `title:` and `subtitle:`, a chunk heading says `Heading | Sub`.
What none of them had was a way to say that the *first* line is the quiet one.

`style: {headline: eyebrow}` sets it the other way up. The slide you are reading
is drawn that way, and so is the cover of this deck.

## definition: The words never move, only their type {#treatment}

**`title:` stays the content key of whichever line is loud.** That is the whole
reason this is a treatment rather than a second pair of content keys.

`title:` is also the `<title>` element, the entry in the table of contents, and
what the search index reads. Inverting the hierarchy by telling authors to put
the hook in `title:` would rename the browser tab to the hook and leave the
lecture's own name nowhere.

**One key therefore serves the cover, the section dividers and the closing slide
at once**, because all three carry a pair.

# The credits

## principle: Four ranks, not one line and a list {#ranks}

**The credit block used to be one strong line over a run of equals.** `presenter:`
was set apart and everything else went into `info:`, where the institution, the
venue and the date all arrived at the same size in the same grey.

So the line that *qualifies the speaker's name* was set exactly like the one that
gives the date, and the block read as a log file rather than as a masthead.

## example: The four slots, as this deck writes them {.wide #slots}

```yaml
presenter:   Dominik Herrmann
affiliation: Otto-Friedrich-Universität Bamberg
contact:     https://github.com/UBA-PSI/psi-slides
notice:      Built from this one file.
```

**`contact:` and `notice:` are a row along the foot**, not two more stacked lines.
They do a different job from the two ranks above them: a presenter and an
institution introduce the speaker, while an address and “the slides are online”
answer the room.

## principle: Capitals get their tracking without being asked {#caps}

**`style: {caps: on}` sets the small type around a title in capitals** – the
eyebrow, the presenter, the affiliation. Never the headline: a key that
capitalises the loud line is a key that makes a talk shout.

The tracking is not a second setting. Capitals set at the tracking of lowercase
read as one jammed word, so the build tracks out **any slot already in
capitals** – including one an author typed that way years ago.

## closing: Two lines, four ranks | and one decision about which line is loud {#end}

This slide wears `closing-credits: cover`, so it carries the whole block the
cover carried.
