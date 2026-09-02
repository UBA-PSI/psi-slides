---
title: psi-slides – a guided tour
subtitle: A lecture medium that builds four views from one Markdown file
presenter: Dominik Herrmann
cover: masthead
section: rule
info: |
  Tutorial lecture built with psi-slides itself
  Use the tool to learn the tool
course: psi-slides-tour
lecture: tutorial
---

<!-- linter: ignore density -->
<!-- This lecture is a reference that happens to be a lecture: several chunks
     document a whole construct and run well past the on-screen word budget an
     ordinary slide should keep to. The budget is right for a lecture and wrong
     for this one, so it is switched off here, in the open. Until today it was
     switched off by accident - the sentence further down that *documents* this
     directive was being read as a use of it, and it silenced reveal-overuse
     into the bargain, which this file never needed. -->

## title: {#title}

One Markdown file becomes four HTML files: a document to print, the same
document with your speaker notes, a projection for the room, and a view of
your own at the lectern. A `masthead` cover leaves a field between the title
along the top and the credits along the bottom, and this paragraph is what
goes in it.

# Welcome {#welcome}

> note: This lecture explains the tool by being written in it. Open the speaker view too (press S) and keep the two windows side by side – the Speaker cockpit column later on assumes it is running.

## principle: One source, four views | the deck, the hand-out and the notes stop drifting apart {.standard #one-source}

**The deck, the hand-out and your notes say the same thing, and they disagree the moment you edit one.** A lecture normally needs all three, and keeping them in step is work you do instead of preparing the lecture.

**You write one Markdown file instead, and its whole structure is two words: *chunks* and *columns*.**

**One command turns that file into four HTML files, and the four differ only in what they show you.** `print.html` is a reading copy with a cover and a table of contents. `print-notes.html` is that same *document* with your speaker notes folded in under each chunk. `audience.html` is the *projection* for the room. `speaker.html` is the speaker view, the screen you keep at the lectern, carrying the notes, a strip of the slides around you and a timer. Nothing in the source is written for one of them and not the others.

> note: Words in italics the first time they appear are this tool's own terms rather than ordinary English: *chunk*, *column*, *projection* and *document* here, then *segment*, *expansion* and *cockpit* as the tour reaches them. That is the whole vocabulary.

## figure: One file in, four files out {.wide #four-views .bare .center}

::: draw {unit=152x52}
default box {.mono}

# The four outputs stand in one column and source.md sits opposite their
# middle. The four edges are .elbow, and an elbow's rail is measured between
# the two faces – so the fan-out reads as one bracket only if the four left
# faces are in one place. Left to size themselves the boxes are four widths
# and the rails come out four abreast, so all of them are `same as` the
# widest label, print-notes.html, which is the one that has to fit anyway.
box  notes "print-notes.html\ndocument + notes"  at 1.55,0.75
box  doc   "print.html\nthe document"            above notes gap 0.3 same as notes
box  aud   "audience.html\nthe projector"        below notes gap 0.3 same as notes
box  spk   "speaker.html\nthe cockpit"           below aud gap 0.3 same as notes

box  src   "source.md\none file"                 between doc,spk offset -2.0,0 {.tone-3}
text bjs   "build.js"                            right of src gap 0.14 offset 0,-0.34 {.muted .small .mono}

# source.md is not the whole input. The pictures a lecture references are read
# from assets/ and end up inside every one of the four files, which is what the
# paragraph under this drawing claims – so they belong in the drawing. Three
# empty frames say "some images" without pretending to be any particular one.
# The label sits over the left frame and the wire leaves the middle one, so the
# two never meet.
image ph2 photo                                  below src gap 0.8 w 0.34
image ph1 photo                                  left of ph2 gap 0.12 same as ph2
image ph3 photo                                  right of ph2 gap 0.12 same as ph2
text  phl  "images"                              above ph1 gap 0.16 {.muted .small .mono}
edge ph2.top -- src.bottom {.dashed .muted}

edge src -> doc   {.elbow}
edge src -> notes {.elbow}
edge src -> aud   {.elbow}
edge src -> spk   {.elbow}

# The live sync runs out to the right rather than straight down the gap, so
# it does not read as one more output of the build.
edge sync aud.right <-> spk.right via aud.right+0.42,aud.cy aud.right+0.42,spk.cy "postMessage\nlive sync" side right {.dashed .muted .small .mono}
:::

Each of the four files carries everything it needs inside itself – the pictures, the typefaces, the styling, the code. Each one opens by double-clicking, with no web server and nothing fetched from the network, so you can send any of them to a colleague as a single attachment.

> note: The drawing above is a `::: draw` block written out in the lecture source, drawn into the page as artwork at build time. It takes its colours from the theme: press A a few times while this slide is up and the figure re-colours with the page.

## definition: Chunks and columns | the two words the rest of the tour is written in {.standard #chunks-columns}

**A *chunk* is one `##` heading and everything written under it.** In the two live views it gets a screen of its own; in the printed ones it is a section of the page. It is the nearest thing here to what another tool calls a slide.

**A *column* is a run of chunks on one theme, opened by a `# Heading`.** It is the part of a lecture that `Shift` and an arrow moves you through in one press, and it is what the contents list on `T` shows – chunks never appear there.

**A lecture is therefore columns of chunks, and nothing else.** Everything after this slide is what you may write inside one.

> note: These two words carry the whole tour, so they are worth a slide of their own rather than a clause in the one before. A room that has not been told what a column is cannot be told that `Shift` moves by one.

## free: What you are reading is one chunk | `P`, `S` and `?` reach the rest of the lecture {.wide #audience-now}

**Whichever of the four files you have open, what you are reading is one chunk** – one `##` heading in the source, with everything written under it. `audience.html` and `speaker.html` give a chunk the whole screen and move you from one to the next with the keyboard; `print.html` and `print-notes.html` run the same chunks on down the page, so a reader scrolls instead of pressing anything.

::: cols 2

**In either live view, three keys reach the rest:**

- `P` opens `print.html` in a new tab – the whole lecture as a document.
- `S` opens `speaker.html` as a second window, the speaker view. Once both are open, they mirror each other as you move.
- `?` shows the full keyboard and mouse reference. Everything below is in there too.

**The one file that produced all four** is `lectures/tutorial/source.md`. Every slide in every view came out of it. Open it in a text editor beside this window and read the two together.

:::

# Moving around {#moving}

## principle: The room sets the pace | forward moves by a piece, by a chunk, or by a column {.standard #pace}

**A lecture has one order, but the pace belongs to the room, so forward is not one fixed step.** It uncovers the next piece of the chunk you are on; when that chunk has nothing left, it moves to the next chunk; and `Shift` with an arrow moves a whole column at a time.

**A dense chunk can therefore arrive in parts, and a chunk the room has already understood is a single press.** The rest of this part is those keys, and what a click opens.

## example: Forward and back | `Space` and the arrows, with `Shift` for a whole column {.standard #arrows}

**Two keys carry the whole lecture, forward and back, and holding `Shift` jumps a whole column.**

- **Forward** is `Space`, `↓`, `→`, `Enter` or `PageDown`. It uncovers the next piece of the chunk, then moves on to the next chunk.
- **Back** is `↑`, `←`, `PageUp` or `Backspace`. It puts the last piece away, and leaves the chunk only once that chunk is back where it started.
- **`Shift`-`→` and `Shift`-`←` move a whole column**, from any slide and not only the first of one. `Shift`-`←` goes to the top of the column you are in first, so returning to the start of a part and leaving it are the same key. Press forward now:

---

**You just uncovered a *segment*: in the source, a line containing nothing but `---` cuts a chunk into segments, as long as it is outside a block of code.** The first segment is on screen when you arrive; forward uncovers the next, back puts it away.

**A faint `⌄` at the foot of the slide says the next forward press will leave the column.** It is the one thing about where you are that the slide cannot show you by itself. There is nothing to click.

**The *cockpit* – the speaker view, which has a part of its own later on – shows you what comes next.** With it open, look at this slide there: the segment the next forward press will reveal is already drawn in place, hatched and inside a dashed frame, so you can read ahead without the room seeing it. Only the immediately next one; the segments behind it stay hidden.

---

**Segments let you pace a dense slide during a talk instead of putting all of it up at once, and this third one is here so you can see them chain.** In `print.html` and `print-notes.html` they run together as one flowing body, so nothing is lost on paper.

## example: Expansions | `1`–`9`, or a click on the chevron, opens one {.wide #expand}

**Some chunks have extra detail tucked behind a chevron button: click one, or press `1`…`9` for the n-th.** This chunk has two of them – try both.

::: expand digits-and-chevrons
**A digit opens the expansion with that number, and the same digit closes it again.** This is expansion number 1, so `1` puts it away. `Esc` closes it too, and `2` switches straight to the second one without closing this first.

In the source, an *expansion* is written `::: expand <label>` … `:::`. The label appears at the top of the opened pane; the chevron button itself carries a short form of it (`Ex` for an example, `Ref` for a reference, `Fig` for a figure, `?` for an answer, `!` for a warning, and `Exp` for a label it does not recognise).
:::

::: expand what-it-is-for
**An expansion is the branch you take if somebody asks.** It sits behind its button in both `C` settings, so it is never part of what the room reads by itself – the main text has to carry the argument without it.

Press `C` while this pane is open and watch the chunk behind it shorten. The pane stays where it is: it is not part of the slide either way.
:::

**`print.html` and `print-notes.html` print every expansion** as an indented aside where it stood in the source, so the reading copy loses nothing.

## example: Zoom into a figure or code block | click it, drag to pan, `Esc` to close {.wide #figure-focus}

**Click any figure, block of code or formula inside the chunk you are on.** It lifts into a card in the middle of the screen, with the slide dimmed behind it.

```python
# Click this block to zoom it. Useful when a line
# matters more than the slide.
def anonymity_set(observations, senders):
    return {s for s in senders if plausible(s, observations)}
```

Inside an opened card: drag to pan, wheel or `+` `-` to zoom, `0` to reset, `Esc` or a click to close. With a speaker window open, the projection follows which card you opened, how far you zoomed and where you panned, so what you are inspecting is what the room sees.

**Hold `Alt` – `option` on a Mac – to select text.** Dragging normally pans the slide, so selection is off. Hold the key and the slide becomes selectable and the cursor changes; let go and dragging pans again. The selection survives the key release so you can reach `Cmd`-`C`, and `Esc` clears it.

## example: Links | a click follows one; the symbol beside it shows the address to the room {.standard #links}

**Links behave two ways, and which one you want depends on the window you are in.** A plain click follows the link in a new tab of *that* window. Clicked in the speaker view, that is you checking a source while the projection stays where it was. Clicked in the projection, it is the page itself arriving in front of the room.

**The small QR-code symbol after the link is the second way**: it puts the address on both screens, large, with a scannable code beside it, so the room can take the link away on their own phones. Click the address to open it anyway; `Esc` or the next slide clears it. `Shift`-clicking the link itself does the same.

Try it on this one: [the group behind the tool](https://psi.uni-bamberg.de/). The symbol is what you want while a room is watching.

The codes are drawn when the lecture is built, one per external address in the source. `style: {link-codes: off}` leaves them out.

# Finding content {#finding}

## principle: A talk rarely runs in the order you planned | so every slide has to be one move away {.standard #jumping}

**A question sends you forty slides back, and the back arrow is not a plan.**

**Three panels reach any chunk directly.** Which one you want depends on what you still remember about the slide, and none of them walks you through the chunks in between.

- Roughly **where it sat** – the overview board, `O`.
- Which **part of the lecture** – the contents list, `T`.
- A **word that was on it** – search, `/`.

## example: Open the overview board | `O` zooms out so you can see every slide at once {.standard #overview}

**Press `O` now** – the letter O, not the digit zero, which resets the zoom instead. The view pulls back to show every chunk at once, laid out in its columns, with an outline round the one you were on.

- **Drag** to pan the board, **wheel** to zoom it.
- **Click** a slide to go there – one click both picks it and leaves the board.
- **Arrow keys** move the outline without landing, and the board follows, because the slide you want is often off screen.
- `O` again or `Enter` **lands** on the outlined slide; `Esc` leaves without moving.

The board shows the shape of the lecture, which is usually enough to find the part you want. With a speaker window open, both windows enter, pan, zoom and leave together.

## example: Open the contents list | `T` lists the lecture's columns {.standard #toc}

**`T` shows a list of every named column.** Click an entry to jump there; `T` again closes the panel.

A column with no `{#id}` does not appear – the unnamed opening column that holds the title slide stays out of the list. The `{#id}` is also what a cross-reference points at: a `[text](#some-id)` link anywhere in the body finds it.

## example: Search | `/` lists every slide that mentions a word {.standard #search}

**Press `/` from anywhere – you do not have to be in overview first.** A panel opens and every slide whose heading or body contains what you type is listed with the sentence it matched, the term highlighted.

`↑` `↓` pick a result, `Enter` or a click goes there, `Esc` closes without moving. If you opened the search from the overview board, the board follows your pick as you move down the list, so a match on the far side of the lecture comes into view while you are still choosing.

Search is what you want when you remember a topic but not which slide it is on. It reads the whole chunk, so a word that appears only in a sentence the projection never shows still finds its slide.

# What goes on the slide {#on-screen}

## principle: The room and the reader need different amounts of text | written once, cut two ways {.standard #two-modes}

**A slide readable from the back of a hall holds a handful of lines, but a student revising for the exam – or you, teaching the course again next year – wants the explanation there was no room for.** That second thing is what a lecture script is, and writing it separately means writing everything twice, in two copies that disagree by the second edit.

**So there is one text, and every chunk is both versions of it at once.** You write the argument in full; the projection shows a cut of it and the printed document shows all of it.

## definition: One chunk, two versions | `C` switches between them {.wide #c-key}

**This chunk has more text in it than the slide is showing you: press `C` and the rest appears, press it again and it goes.** Nothing was added – it has been in the source all along, and `print.html` has been carrying it since the first slide.

**The live views open in the short version**, because that is the one a room reads. The long one is for rehearsing, for looking something up mid-talk, and for whoever reads the lecture afterwards.

**The cut only ever takes prose away.** A list, a figure, a code block or a formula goes up whole in both versions; it is the sentences of a paragraph that get shortened.

**Which of those sentences survive is decided per chunk, and you choose how.** Either psi-slides works it out from your prose, or you mark the slide yourself. The next three chunks show both.

> note: This is the chunk to demonstrate `C` on, because the paragraph the room cannot see is the one saying that a paragraph is being hidden.

## example: Option 1 – the default | the slide is worked out from your prose: first sentences, plus the bold phrases {.wide #derived-mode}

**Unless you say otherwise, the slide is the first sentence of every paragraph plus any `**bold**` phrases from the rest.** This chunk is written that way – press `C` twice and watch what appears and disappears.

It asks two things of you. Every paragraph has to **open with a sentence that stands on its own**, because that sentence is the slide. After it, **a bold phrase becomes a bullet of its own, so it has to read as one**. Everything unbolded is for `print.html` and `print-notes.html`.

The two bullets above are that rule running: neither is a list in the source – each is a `**bold**` phrase inside a sentence the projection is holding back.

That suits a chunk that argues, where every paragraph has a point to open with. It is the wrong fit when the chunk wants continuous explanation instead, and the next chunk is the way out.

> note: If the shortened version of a chunk reads as a pile of cryptic one-word bullets, the fix is almost always fewer bolds and a stronger first sentence, not a different mechanism.

## example: Option 2 – explicitly set by you | you mark which block is the screen {.wide #explicit-mode}

::: slide

- **`::: slide`** marks the block that is the screen. Everything else in the chunk is what you say.
- **`::: script`** does the reverse: the chunk is the screen, and only the marked block is what you say.
- Neither marked block is ever shortened, however long it runs.

:::

You are reading the projector version of this chunk: the bullets above sit inside a `::: slide` block and this paragraph does not. Press `C` and this paragraph appears; press `C` again and it goes away.

Reach for `::: slide` when the slide wants tight bullets while the argument wants prose. A chunk with neither block behaves exactly as Option 1 does, and the next chunk is the other half of Option 2.

> note: The word budget the checker enforces counts only the on-screen half. What you say is unbudgeted, so write as much of it as the argument needs.

## example: Option 2, the other way round | `::: script` marks the narration instead {.wide #script-mode}

**Press `C` twice on this chunk and watch one paragraph come and go while nothing else on the slide moves.** That paragraph sits inside a `::: script` block, which is the reverse of the last chunk: everything *outside* the block is the screen, and the block alone is what you say.

**Use it when the screen half is the big half: the three made-up findings below are already the whole slide, and pressing `C` does not touch them.** Wrapping them in a `::: slide` block would mean marking nearly the whole chunk in order to exclude one paragraph, so marking that paragraph is the shorter way to say the same thing.

- One request in seven is answered differently once the crawler is instrumented.
- The gap is widest on the sites that serve the most third-party script.
- It closes again if the crawler waits between requests.

::: script
This is the paragraph that comes and goes. It is what you would say out loud about those three lines, and the projection never gets it – under Option 1 its first sentence would be up there with them.
:::

**A `::: slide` block wins wherever a chunk has one; failing that, a `::: script` block puts everything outside itself on the screen; failing both, Option 1 applies.** Three rules, checked in that order, on each chunk separately, so one lecture normally uses all three.

> note: A chunk carrying both blocks is not an error – the slide block wins and everything outside it, the script block included, is narration. Writing both usually means the chunk wants splitting. In practice Option 1 carries the short argumentative chunks, and the chunks near their word budget are where marking the slide by hand is the shorter route.

# The chunk vocabulary {#vocabulary}

## principle: Chunk types {.wide #grammar}

**Only the `{#id}` is required, and a chunk written with no type counts as `free`.** The type, the sub-heading and the width are all optional.

- **The line is** `## type: Heading | Sub-heading {.width #id}`.
- **The ten types:** `title`, `closing`, `outline`, `principle`, `definition`, `example`, `question`, `figure`, `exercise`, `free`.
- **`{.width}`** is `narrow`, `standard`, `wide` or `full`, and defaults to `standard`.
- **`{#id}`** anchors links, the contents list and your reading position – rename one and those need fixing too.

::: expand the classes that are not widths
**`{.bare}` and `{.center}` act on the projection alone.** `.bare` keeps the heading off the slide while leaving it in the printed views and in the search index; `.center` centres the chunk's own paragraphs, which is what the slide with the four-outputs drawing does under its figure.

**Four more answer a `style:` key for one slide**: `{.blocks-left}` and `{.blocks-center}`, `{.wrap-none}` and `{.wrap-balance}`. Each is the key's own name and one of its values, so knowing the frontmatter is enough to guess the class. These four do reach the printed document, unlike the two above – where a formula sits relative to the sentence that introduces it is the same question on paper.
:::

> note: The details sit in a list rather than in follow-up paragraphs because the projection cuts a paragraph down to its first sentence and keeps a list item whole. Anything the room has to read in full belongs in a bullet.

## definition: What the type is for | a word budget, a label in the document, a line over the heading {.wide #tag-effects}

**The type changes almost nothing on the slide, and it never sets the width – that is the `{.width}` class – but it does three things.**

- **It caps how many words the chunk may carry**, from 80 for a principle to 350 for an exercise; `node lint.js` reports one that runs over.
- **It labels the chunk in the printed views**, in small capitals over the heading. The projection prints only `EXERCISE`.
- **It sets a small treatment.** This chunk is typed `definition`, hence the hairline above its heading; a `principle` gets a short rule there.

`title`, `closing` and `outline` each draw a whole slide instead.

Picking the wrong type is not an error; it shows on the overview board, where a principle typed as an example stops standing out.

::: expand the-word-budgets
**The budget per type:** `principle` and `question` 80 words, `definition` 200, `example` and `free` 250, `exercise` 350, `closing` 60, `outline` 40. `title` and `figure` have no limit.

Counted against the on-screen half only, so narration inside a `::: script` block is unbudgeted. `free` and `figure` are also the two types that print no label. `node lint.js` is the checker that comes with the tool, and the last part of this tour is about running it.
:::

## exercise: Try the vocabulary | three edits, with `--watch` running {.wide #try-tags}

**Open `lectures/tutorial/source.md` with `--watch` running and change three things.** Every save rebuilds the lecture and reloads every open tab, so keep the projection, the lectern view and your text editor visible at once.

::: cols 2

1. Change this chunk's type from `exercise` to `principle`. The label above the heading changes, and `lint.js` starts complaining: the budget has dropped from 350 words to 80.
2. Wrap the list in a `::: slide` block, then press `C` here. Everything else leaves the screen.
3. Add a `> note:` line under the heading, then look at the notes pane in the speaker view and at `print-notes.html`.

:::

> note: Watch mode picks a free port and adds a small reload script to each output. An ordinary build adds none, which is why the committed HTML carries no such code.

# Speaker cockpit {#speaker}

## principle: The room and the lectern want different screens | one file, two windows {.standard #two-screens}

**Everything that helps you through a talk – the notes, the clock, the slide that comes next – is exactly what the room must not be shown.** Putting any of it on the projection spoils the slide, and leaving it out means presenting from memory.

**So the lecture opens twice, out of the same file.** One window is the projection and the other is your lectern screen, and the two keep each other in step with no server between them.

## free: Speaker view | the second window, the one `S` opens {.wide #speaker-s}

**The speaker view is your lectern screen, in four bands.** Press `S` here if you have not already – it opens `speaker.html` as a second window, and from then on the two windows talk to each other directly.

::: cols 2

**From the top edge downwards:**

- **A row of dots**, one per chunk in the column, each of them clickable.
- **A copy of the projection**, laid out identically and at the same zoom.
- **A notes pane** under it, which you can type into, and which folds away when the chunk has no notes.
- **A strip of slide thumbnails** you can scroll and click.

**The two windows stay in sync: they always show the same slide, at the same point in it.** Which chunk you are on, how much of it is uncovered, your annotations, the theme, the font, the zoom, which expansion is open, the overview board, the opened figure and the laser pointer all travel between them. `V` freezes the projection so you can read ahead without the room following; unfreezing brings the room to wherever you got to.

:::

## example: Arranging the speaker view | resizing the panes, and where the thumbnails sit {.wide #cockpit-layout}

::: slide

- **`Shift`-`V`** moves the thumbnail strip between the bottom edge and the right edge.
- **Drag the hairline bar above the notes** to resize the notes pane. The slide above rescales to fit.
- **Drag the bar along the edge of the thumbnail strip** to resize that too, in either position.
- **Double-click either bar** to go back to the automatic size.
- **The `−` and `+` in the corner of the notes** scale the notes text, separately from the pane height.
- **`?`** opens the full reference. The footer has buttons for all of these.

:::

The notes pane sizes itself: up to three lines of text, one line once you have emptied it, and folded away entirely on a chunk that has no notes at all. Once you drag it, the height stays where you put it and is remembered across lectures and reloads. The slide above gives up exactly the space the notes take, so the copy of the projection keeps the projector's proportions instead of stretching.

Put the thumbnails down the right-hand side if the screen has width to spare: they get larger and their text becomes readable, so you can read ahead in the strip instead of only reading your position off it. The strip's height and its width are remembered separately.

## example: Two kinds of note | one the room sees, one only you see {.wide #notes-vs-annot}

**An *annotation* is public, *speaker notes* are private.**

::: side

**`N` in either window writes an annotation on the chunk you are on.** A typing box appears under the chunk, and whatever you write appears in the other window as you type it. Use it for the things a talk produces: a rule you want on screen, a question from the room, a correction.

Annotations are kept in the browser, one set per lecture. `Shift-E` in the speaker view copies all of them to your clipboard as `> annot:` Markdown; paste that under the matching chunk heading in `source.md`, run `node build.js <source.md> --integrate-annotations`, and the text becomes permanent – already in the typing box next time, and printed under the chunk in `print.html` and `print-notes.html`.

> annot: The `> annot:` block you are reading in `print.html` and `print-notes.html` came out of a previous run of exactly that; the typing box above starts filled with this text.

::: flip

**`Shift-N` in the speaker view opens the private notes pane** below the slide. This one is yours alone and never reaches the projection. It arrives filled from the `> note: …` lines in the source; anything you change during the talk overrides that text and is kept in the browser, per chunk.

If the pane is folded away because this chunk has no notes, the `+ note` button in the corner of the slide does the same as `Shift-N`.

`print-notes.html` is the third home for the same text: the document with every `> note:` folded in under its chunk. That is the file to hand out when you want what was on the slide plus what the lecturer said.

:::

## example: Changing how the lecture reads | `C` `F` `A` and zoom {.wide #knobs}

**Single keys change how the lecture reads, and each one reaches both windows at once.**

- `C` switches between **what the room sees and the full text**.
- `F` cycles the **font**: serif, then sans, then monospace, for legibility across a room.
- `A` cycles the **theme**: four light ones with different accent colours, a neutral dark one, and two green-and-amber terminal ones.
- `+` `-` `0` set the **text size**; `#` cycles **auto-fit** through its three modes, which is worth trying right here – this chunk is longer than the screen.
- `B` **blanks the projection**.
- `L` cycles the **slide numbers**: stacked, in a row, or off.

`Shift` with `C`, `F`, `A` or `L` goes backwards. `#` has three modes and no `Shift`, because it is a shifted key on some keyboards and an unshifted one on others. Font, theme and slide numbers are remembered for every lecture you open, so the preference follows you; zoom and the `C` setting belong to the talk you are giving.

## example: The same controls without a keyboard | the toolbar on a phone or tablet {.wide #knobs-touch}

**On a phone or a tablet with no keyboard, both windows show a small toolbar along the bottom edge.** Forward, back, overview and zoom sit on it; `C`, `F`, `A`, `#`, the search and text selection are behind its `⋯` button. Attach a keyboard and the toolbar goes away again, because the keys are back.

## example: What the keys remember | themes, the two zooms, auto-fit and blanking {.wide #knobs-modes}

**Dark mode follows your machine unless something says otherwise.** If you have never pressed `A` and the lecture pins no theme, a machine set to dark opens the lecture dark. Press `A` once and your choice is remembered from then on, everywhere. An author who writes `theme:` in the frontmatter overrides both, by the same rule as the other opening settings.

**The two `C` modes keep separate zoom levels.** The short version holds whatever size you set with `+` and `-`; the full text picks its own so the whole chunk fits the screen, and switching back restores yours exactly.

**`#` cycles auto-fit through three modes, and the middle one, *shrink*, leaves your zoom where you set it and only ever makes a slide that is too big fit.** So the room reads one size all hour, except on the slides that would otherwise run off the bottom. *Full* sizes every slide to the screen, growing a short chunk as readily as shrinking a long one, which suits a lecture whose chunks vary a lot. *Off* is neither.

**While the room sees black, the speaker window keeps everything.** The slide, the notes and the thumbnails stay where they were, so you can move on or read ahead with nothing showing. A small `BLANK · hit B to toggle` marker sits at the bottom of the speaker window, or at the bottom of the audience view when there is no speaker window.

# Authoring layouts {#layouts}

## principle: Two decisions make a layout | a width class on the heading, and `:::` blocks in the body {.standard #layout-axes}

**A layout is two independent decisions: how wide the chunk is, and how its body is arranged inside that width.** The heading picks one of four widths – `{.narrow}`, `{.standard}`, `{.wide}`, `{.full}` – and `:::` blocks in the body do the rest.

**A `.wide` chunk with a `::: side` body is the usual shape for a figure with commentary beside it.** The width is the decision about the slide, and the blocks work inside it.

## example: Text across two columns | `::: cols 2` and `::: cols 3` {.wide #cols-demo}

**`::: cols 2` (or `cols 3`) flows the body across that many columns, the way a newspaper page does.** Use it when several short paragraphs read better side by side than stacked – a list of features, a brief comparison, two or three parallel definitions.

::: cols 2

**Left column.** The browser balances the columns for you: it fills from the top and breaks wherever the text allows. Do not put one long paragraph here, or one column fills and the other sits empty. Several short blocks work best.

**Right column.** This block is the third paragraph in the source, which is why it landed on the right – the text runs down the first column and then wraps into the second. In `print.html` and `print-notes.html` the columns become one ordinary sequence of paragraphs.

:::

**Columns fold to one while the slide is short** – press `C` here and the two above stack. Shortened, each paragraph is down to its opening sentence, and a browser will not split a paragraph across columns, so two single sentences of different lengths do not balance. The full-text mode brings them back, and so do `print.html` and `print-notes.html`.

**Revealed segments – the `---` lines that uncover a chunk a piece at a time – work inside `::: cols`**, but text uncovered piecemeal while it also flows across columns is hard to follow: pick one or the other.

## example: Two panes you fill yourself | `::: side` and `::: flip` {.wide #side-demo}

**`::: side` makes two panes side by side, and `::: flip` marks where one ends and the other begins.** Unlike `cols`, you decide what goes where: everything before `::: flip` is the left pane, everything after it the right. Use it for a figure with its commentary, or for a before-and-after pair.

::: side

**Left pane.** Write `::: side`, then the left content, then `::: flip`, then the right content, then `:::` to close. The two panes are equal halves unless you say otherwise, so neither side takes over the slide.

::: flip

**Right pane.** A figure usually goes here with the text on the left. On the projection, click either pane to open it large; `print.html` and `print-notes.html` stack the two panes one above the other, so neither is ever lost.

:::

**Code in a pane needs short lines.** A code block never wraps, so at the default zoom **a pane holds about 36 characters against the 78 a block across the slide holds** – and that 78 is the same whatever width the chunk is, because a code block of its own breaks out of the text column and spans the slide. A longer line is not cut off; the build shrinks that one slide until it fits, and the slide then reads noticeably smaller than the ones either side of it. Break the line, or put the code across the full width and keep the panes for prose.

## example: Marginalia | `::: marginalia` escapes into the slide margin {.standard #marginalia-demo}

**`::: marginalia` sets an aside out to the right of the chunk**, past the edge of the text column and into the slide's margin.

::: marginalia

This whole block sits in the slide margin, small and grey. Use a marginalia for a tangent that belongs with the chunk but would crowd the main text – an aside, a citation, a pointer to another column.

`print.html` and `print-notes.html` set marginalia under the body as indented asides, so the reading copy keeps every word.

:::

**A marginalia is the one aside you can click: the frame slides right until all of it is on screen.** A figure or a block of code lifts into a card in the middle of the screen; a marginalia gets no card, because it is part of the slide's layout rather than something laid over it. **`Esc`, or a click on the slide, gives the frame back.** Try it on the block out to the right, the part of it the edge of the screen has cut off.

The body stays in the middle column and only the marginalia moves outward. Keep them short: a marginalia shares the chunk's height and cannot grow taller than it. One can also go *inside* a `::: side` pane, when a tangent belongs to one half in particular – it still escapes to the slide's right margin.

## example: Footnotes | `::: footnote` is a quiet note under the chunk {.standard #margin-demo}

**`::: footnote` puts a small grey note under the chunk, labelled and always visible** – down in the flow of the text rather than out at the side. No button, no separate panel, nothing to click.

::: footnote
This is a footnote. The label above it always reads NOTE, and the note sits in grey under a dotted rule. Unlike a marginalia it stays in the middle column, under the body it was written beneath.
:::

**A marginalia goes out into the margin and can be brought to the centre with a click; a footnote stays under the chunk and is read where it stands.** Reach for `::: footnote` when the extra material is short and you want it on the page every time, and for `::: expand <label>`, the chevron button from earlier, when it should stay behind a button until somebody asks.

## example: Images | `![Caption](fig-id)` resolves against `assets/` {.wide #images}

**Write `![Caption](fig-id)` and the build looks in `assets/` for `fig-id.svg`, `.png`, `.jpg`, `.jpeg`, `.gif` or `.webp`, taking the first it finds.** No folder, no extension. Writing the path out in full still works when you need it.

::: side

**Whatever you write in the square brackets becomes the caption under the picture.** The one beside this paragraph is `![An abstract dusk skyline](dusk)`, and the small grey line under it is that text – which is also the image's alt text, so a screen reader reads the same words. Leave the brackets empty and the picture stands on its own. On a `figure:` chunk whose heading already says what the picture is, a caption stacks two labels, so the checker warns and suggests leaving the alt text out.

**A drawing saved as SVG is written into the page as artwork**, not as a picture file, so it takes its colours from the theme and changes with the `A` key. Photographs, and pictures like this skyline that carry their own colours, are embedded exactly as they are.

::: flip

![An abstract dusk skyline](dusk)

:::

**As long as your pictures are small, the build puts them inside the HTML, so the whole lecture travels as one file.** The chevron has the limits, and what happens to a picture over them.

::: expand when-a-picture-is-too-big
**The limits are 2 MB for one picture and 10 MB for all of them together.** Under those, every picture is embedded without your asking. Over them the build stops, rather than quietly leaving the file outside – where it would show as a broken figure the moment the HTML arrived somewhere without its `assets/` folder.

**`node build.js <source.md> --optimize-images` converts the offenders to WebP in place**, which on real lecture assets comes out at 12 to 18 percent of the original with no visible loss. `--no-inline-images` is there if you do want the files kept outside.

It does not shrink the picture's dimensions. The heavy files are usually already at slide resolution and heavy because PNG is a poor fit for photographs. An opened figure zooms to eight times, so the extra pixels in a diagram are ones the room gets to see. `--max-width` exists for the genuine outliers.
:::

## example: Video | `![](clip-id)`, the same shorthand an image uses {.wide #video}

**Drop `clip.mp4` into `assets/` and write `![](clip)`** – the same shorthand an image uses. The build looks for video files after image files, so an id that has both a still and a clip behind it gives you the still.

![](reveal-demo)

That player is a real clip carried inside this HTML file: 78 KB, a pan across the overview board. Press play, then check the address bar – nothing was fetched.

## example: More on videos | the size limit, clips on a server, and what a click does {.wide #video-more}

**Play, pause and seeking are shared between the windows.** Operate the clip at the lectern and the projection follows. Freeze the projection first and it does not, so you can check a clip before showing it.

**A clip goes inside the HTML like any other asset, up to its own limit of 12 MB.** A clip is an order of magnitude heavier than a diagram, and the 2 MB picture limit would reject every real one.

**Over that limit the clip travels beside the file instead.** The build copies it into a `videos/` folder next to the output, plays it from there, tells you on the terminal, and suggests an `ffmpeg` line that would make it small enough to go inside. One named folder to carry with the HTML, instead of a path that only works on the machine that built it.

**A clip can also live on a web server:** `![](https://host/clip.mp4)` works and stays an ordinary player, so play, pause and seeking still travel between the two windows.

**There is no fullscreen setting**: the player has its own button, and how large the clip sits on the slide is the chunk's width, as with a still picture. Clicking a clip does not open it in a card either, because that would fight the play button.

## example: Hosted players | `::: embed` for YouTube and Vimeo {.wide #embed}

**A hosted player is written as `::: embed`, and a bare link never becomes one.** This is the only thing you can write that makes a lecture fetch from somebody else's server while you are teaching, so you say so in the source:

```markdown
::: embed https://www.youtube.com/watch?v=aqz-KE-bpKQ
Big Buck Bunny, Blender Foundation
:::
```

The line under it becomes the caption. A `youtu.be/…` or a bare `vimeo.com/123` works too; anything else has to be a full `https://` address, and the build refuses what it does not recognise.

**The address is always printed under the player**, with a QR code on `Shift`-click, so the room can reach the video even when the player will not run. YouTube is asked for through `youtube-nocookie.com`, and Vimeo is asked not to track.

**A lecture with a hosted player no longer carries everything it needs: the machine showing it – often the lecture hall's own PC – contacts that company while you teach.** A clip in `assets/`, or an `.mp4` address on a server you control, keeps the two windows in step and asks nothing of anyone else. The build tells you which of the two you have chosen, every time.

## example: More on hosted players | what the directive does that an embed code would not {.wide #embed-more}

- **Nothing loads until you get there.** The player points at the video only while its chunk is on screen.
- **Play and pause are shared between the windows**, as for a local clip. Freeze the projection and it stays put.
- **Nothing starts by itself.** Arriving at the slide gives you a loaded player waiting on its button.
- **A player that cannot run is replaced by a card that says why.** A page opened from disk has no web address and YouTube will not play; Vimeo does.

**To teach with a YouTube video, serve the lecture:**

```bash
node build.js <source.md> --serve         # prints the URLs
node build.js <source.md> --watch --serve # and live reload
```

## example: Math | `$inline$` and `$$display$$` {.wide .blocks-left #math}

**Formulas are typeset when the lecture is built, so the finished file needs nothing at the moment you show it.** Maths inside a sentence goes between single dollars – the anonymity set $S$ has size $|S|$ – and a formula on its own line goes between double ones:

$$d = \frac{H(S)}{\log_2 |S|}$$

**A formula on its own line behaves like a figure**: it stays on screen when the prose around it is shortened away, and clicking it opens it large for the room.

**This chunk carries `{.blocks-left}`, which is why the formula starts where this sentence starts.** A code block, a figure and a display formula are centred by default, and `style: {blocks: left}` says otherwise for a whole deck. Centred is right when the block *is* the slide; on a slide that is an argument with a formula inside it, three blocks on three axes is what you get instead. Maths inside a sentence follows that sentence – on screen in an opening line, gone with everything else.

**A lone dollar sign is safe.** The delimiters are read as Markdown, not searched for in your text, so `$PATH` inside code, a price of $5 and $10 in prose, and a `$$` inside a code block are all left alone. Write `\$` if you want to be explicit.

**Only the mathematical typefaces your formulas use travel in the file.** The build prints what that came to: for this lecture, about 120 KB in each printed view and 166 KB in each live one, against the 254 KB a complete set of KaTeX faces would weigh.

**The maths follows the `F` key.** Switch the body font to sans or monospace and the formulas move with it instead of sitting in the slide as a serif island. Only the letters change: operators, relations and brackets keep their own shapes, and a character the sans face does not have falls back to the mathematical one. That is where the live views' extra 46 KB goes – the printed ones have no `F` key and carry no faces for it.

> note: A malformed formula does not stop the build – it is drawn in red, so a typo never blanks the projector mid-lecture. The terminal reports it, and `lint.js` warns about a `$$` you forgot to close.

# Writing chunks that work {#craft}

## principle: One paragraph per point | the slide is every paragraph's first sentence {.wide #topic-sentence}

**The projection is the first sentence of every paragraph: four paragraphs, four sentences in front of the room.** It is not one topic sentence per chunk. It is one per paragraph, in the order you wrote them, plus whatever you set in bold.

**Either order works: the prose first and the openings sharpened afterwards, or the openings first as an outline and the paragraphs written under them.** Each opening has to end up a claim that survives having its own paragraph taken away; everything after it becomes the backing, which reaches `print.html` and `print-notes.html` and never the projection.

**Either way, every load-bearing thought and every explanation the argument needs starts a paragraph of its own.** Two of them sharing a paragraph means the second one never reaches the room, however well it is written.

**The failure is stopping at the outline.** Openings with nothing written under them leave you a projection that works and a hand-out that does not, and an hour whose substance you improvise standing in front of people.

**This chunk is five paragraphs, so its slide is the five sentences you have just read.** Press `C` and the backing under each of them appears. *Option 1 – the default*, back in *What goes on the slide*, is where that shortening is shown happening.

> note: The short view doubles as a rehearsal test: if it would not remind you what you meant to say, the chunk is not finished. Present this one from the short view while you say it – the room can see that the slide is the same text as the hand-out.

## example: What breaks a shortened chunk | bold as a label, bold on one word, a weak opening, substance after a colon {.wide #anti-patterns}

**Most chunks that read badly on the projector fail in one of four ways.**

::: slide

- **Bold used as a label.** `**Consequence:**` shortens to a bullet reading “Consequence” and nothing else. Put the claim inside the sentence.
- **Bold on one word.** A lone `**not**` becomes a cryptic bullet. Bold a phrase that stands alone, or bold nothing.
- **An opening that only connects.** “That was deliberate.” carries no claim. Say the thing itself in the first sentence.
- **The substance after a colon.** If it sits after a colon at the end of the opening sentence, the cue dangles. Rewrite as one sentence.

:::

All four read fine inside a paragraph and fall apart the moment the paragraph is taken away, so they show up when you walk the lecture once in the short view before you teach it.

When several parallel items pile up inside one paragraph, write a real Markdown list instead of scattering bold through the prose. A list stays readable when it is shortened; a paragraph peppered with bold almost never does.

> note: The recurring temptation is to fix a weak short view by adding more bold. That is nearly always the wrong direction – fewer bolds and a stronger opening sentence is the fix.

## exercise: The squint test | walk your own lecture end to end in the short view {.wide #squint-test}

**Open your own lecture in the audience view, press `C` until it is short, and walk it end to end without opening the source.** Stop at every chunk you could not talk from using only what is on the screen.

**For each chunk that fails, ask three questions in this order:**

1. Is the opening sentence a claim, or a warm-up?
2. Would each bold phrase read as a sensible bullet on its own?
3. Is there a list hiding inside a paragraph?

**If all three answers are fine and it still reads badly,** mark the slide by hand. Option 1 holds up while a chunk is an argument of one to three paragraphs; once it wants continuous prose, a `::: slide` block is the shorter route.

> note: Worth doing once per lecture, the day before. Reading the short version is close enough to giving the talk that it doubles as a rehearsal.

# Next steps {#next}

## principle: Start from a talk you have already given | the prose exists; the work is where the chunks end {.standard #start-writing}

**The first lecture is the one that costs, because it is where the vocabulary gets learned, and the cheapest way through it is a talk you have already given.** The prose exists. Most of the work is deciding where one chunk ends and the next begins, and the vocabulary you have just read is the whole of it.

**The loop is the same every time** – write the prose, sharpen the opening sentences, run the checker, then walk the lecture once in the short view before you teach it.

## free: Read more | three finished lectures to open {.wide #read-more}

**psi-slides comes with three finished lectures. Open them, and take whatever you need out of their sources.**

::: cols 2

**1. A 36-chunk teaching lecture: `lectures/python-intro/audience.html`.** Open its speaker window with `S` and watch the layout vocabulary you have just learned in real use, running through segments, expansions and opened figures.

**2. Every construction that puts something other than a column of text on a slide, one per slide: `lectures/decoration/audience.html`.** The covers, the six kinds of divider and the three kinds of divider content, cards and rows, a backdrop whose window opens on a keypress.

**3. Every `::: draw` statement drawn rather than described: `lectures/diagrams/audience.html`.** Real lecture figures are among them.

:::

## free: Writing your own | `--new`, `--watch`, `lint.js` {.wide #authoring}

**These are the commands you need while writing a lecture:**

- `node build.js --new <slug>` makes a lecture folder with working frontmatter and two chunks. It builds the moment it lands on disk.
- `node build.js <source.md> --watch` rebuilds and reloads every open tab on every save.
- `node lint.js lectures/` checks what can be checked without building: unknown types, unclosed `:::` blocks, repeated ids, word budgets, too many segments, columns with only one chunk, captions that repeat the heading. `--strict` turns the warnings into failures.

A source file can switch one check off with `<!-- linter: ignore reveal-overuse, density -->` anywhere in the body. It has to be ordinary text to count: inside a code block or between backticks, as in the sentence you are reading, it is an example and not an instruction. This lecture carries a real one at the top, for `density`, and says there why.

## example: Deciding how a lecture opens | seven frontmatter keys, and `lang:` beside them {.wide #view-defaults}

**A lecture can set its own starting look instead of inheriting whatever the reader last chose.**

```yaml
---
title: Anonymous Communication
font: mono              # serif | sans | mono
theme: terminal-green   # light-{red,teal,blue,orange}
                        # dark | terminal-{amber,green}
collapse: none          # topic-bold | none     – the C key
auto-fit: shrink        # true | false | shrink – the # key
slide-numbers: off      # vertical | horizontal | off
print-slide-numbers: vertical
                        # the same three. Left out, it follows
                        # whatever slide-numbers says
editor: speaker         # both | speaker | none – the diagram editor
---
```

## example: The language, and who wins a disagreement | `lang:` and the rule for every key above {.wide #view-lang}

```yaml
lang: de                # the language the lecture is written in:
                        # en, de, de-DE, fr and so on, and en
                        # when you leave it out
```

**`lang:` picks the hyphenation dictionary, and by default only the two printed views use it: a long German compound breaks at the end of a line there instead of leaving a hole, while the projection and the lectern view do not hyphenate.** `style: {hyphenate: all}` puts it into the live views too, which a German lecture at `.narrow` usually wants, and `none` takes it out everywhere. It is not one of the six above in the other sense either – the six are opening settings that override whatever the reader last chose, and the language is a property of the lecture.

**A key you write beats whatever the reader last chose, and a key you leave out leaves that choice alone.** So a lecture that sets nothing behaves as it always did – font, theme and slide numbers follow the reader from lecture to lecture.

`slide-numbers` reaches `print.html` and `print-notes.html` too, and `print-slide-numbers:` overrides it there when the printed document wants different numbering from the room. A value the tool does not know stops the build and lists the ones it does.

> note: When you finish this tour with a first-timer, ask them what they found on their own and what they did not. That is the most useful feedback the tool gets.

# Beyond 1.0.0: figures {#beyond}

> Everything from here on is newer than the 1.0.0 download, so build these two
> parts from a clone of the repository, and expect them to change before they
> are tagged into a release.

## principle: A figure written as text is a figure you can still change | you say what sits beside what, and the placing is worked out {.standard #drawn-from-text}

**A drawing made in a drawing tool is finished the moment you export it: it does not follow the theme, it cannot arrive a piece at a time, and a fact that changes means opening the tool again.** Written as lines in the lecture source, a figure is versioned with the prose, re-coloured with the page and revealed one beat at a time.

**What you give up is placing anything by eye.** You name the boxes and say which one sits beside which; where they actually land is not your decision.

## example: Diagrams | the figure below is five lines of source {.full #diagram}

**A `::: draw` block is a figure written as text.** The build draws it into the page: you name the boxes and say where each one goes, and the arrows between them are routed for you.

::: draw {unit=126x38}
box src "Sender"
box mix "Mix"       right of src gap 2.1
box dst "Receiver"  right of mix gap 2.1

edge src -> mix "encrypted"
edge mix -> dst "recoded"
:::

That drawing is these five lines and nothing else:

```text
box src "Sender"
box mix "Mix"       right of src gap 2.1
box dst "Receiver"  right of mix gap 2.1
edge src -> mix "encrypted"
edge mix -> dst "recoded"
```

**The first element sits at the origin, so a simple figure needs no coordinates at all.** Everything after it is placed against a neighbour – `right of`, `left of`, `above`, `below` – and `gap` says how far. There is no automatic layout: an element goes where its neighbour and its `gap` put it.

## example: A figure that arrives in pieces | a `step` block advances on the same key as a reveal {.full #diagram-beats}

**Write `step` blocks and the figure moves.** One step is one press of the same key that uncovers a segment, so steps and segments arrive in the order you wrote them and the speaker view reads ahead exactly as it does for text. Press forward twice here.

::: draw {unit=126x72}
box  src  "Sender"
box  mix  "Mix"        right of src gap 1.05
box  dst  "Receiver"   right of mix gap 1.05
box  log  "Logfile"    below mix gap 0.9  {.dashed}

edge src -> mix "encrypted"
edge mix -> dst "recoded"
edge leak mix -> log {.dashed}

text why "this is where\nthe anonymity ends"  right of log gap 1.4 -- leak {.hand}

step leak
  show log
step blame
  emph leak, log
:::

## example: What a step block says | and what it does not have to {.wide #diagram-beats-rule}

That is the figure from the slide before with a logfile added and four lines at the end: `step leak` shows the logfile, and `step blame` picks out the leak and the box it runs to. **The words a step knows are `show`, `hide`, `move … to`, `move … by`, the three attention verbs `emph`, `dim` and `ghost`, plus `style` and `label`.**

**Anything hanging off something invisible is invisible too**, which is why `step leak` names only the logfile. An arrow is only as visible as the two things it joins, a `container` or a `brace` only as visible as its members, and a `text` with a line drawn to something only as visible as what it points at. So showing the boxes shows the arrows between them, and most of a figure needs no `show` of its own.

> note: `print.html` and `print-notes.html` draw the **last** step rather than every step laid over each other, so an element a step hid stays hidden. Emphasis is the exception and comes from the first step, so attention you move around during the talk never reaches the paper while a `{.dim}` written on an element's own line does: written on the line it is part of the drawing, written inside a `step` it is part of the talk.

## example: Every line has the same six slots | `kind name label placement options tail` {.full .blocks-left #diagram-slots}

**Every line in a `::: draw` block has the same six slots, always in this order**, and most lines fill three or four of them:

```text
box   mix   "Mix"   right of src gap 0.6   w 1.2    {.tone-2 @crypto}
kind  name  label   placement              options  tail
```

**The name is how later lines refer to an element and is never drawn; the label is what the room reads**, and `""` is a legal empty one. A name is letters, digits, `_` and `-`, and a line starting with `#` is a comment.

**Inside the tail, two prefixes answer two questions.**

- **`.tone-2` is a class**, which says how the element looks. `{!tone-2}`, with an exclamation mark, takes one off again.
- **`@crypto` is a tag**, which says what set the element belongs to.

A tag goes wherever a name goes, so `show @crypto` in a step reaches every element carrying it. An element joins a set on its own line, which makes adding one a one-line edit.

## example: Where an element goes | a grid square, a neighbour, or another element's coordinate {.full #diagram-placement}

**Placement is a grid square, or a relation to a neighbour.**

- **`at 2,1`** puts an element in a grid square.
- **`right of mix gap 0.6`** places it against a neighbour, as do `left of`, `above` and `below`.
- **`between a,b`** is the point on the line joining two elements.
- **`offset dx,dy`** is a nudge any of the three accepts on the end.

## example: A coordinate can be another element's | fractions, edges and pictures {.full #diagram-coords}

**A coordinate can be another element's, plus or minus a little** – `at mix.cx,src.cy+0.4`. Anywhere an `X,Y` pair goes, that form goes.

**An anchor can carry a fraction**: `mix.right:0.3` slides the attachment point along that edge, so two arrows between the same pair of boxes run side by side rather than on top of each other. `gap 0 flush left` at the end of a placement makes two boxes touch.

**An edge is one of the things a coordinate can name.** `text n "only after the handshake" above w1 gap 0.2` sets a phrase against the wire it describes rather than against a box at one end of it, so the label follows its line instead of drifting off it the next time a box changes height. Name the edge first, in the slot before the arrow's first end: `edge w1 mix -> log`. An edge has no name until you write one, and most edges never need one.

**A picture can be an element too.** `image alice avatar-alice w 0.4` finds the file exactly as `![](fig-id)` does, and an SVG drawing takes the theme's colours there in the same way.

::: expand The rest of the vocabulary
**There are more kinds than `box`, `edge` and `text`.** `dot` is a circle for junctions and glyphs. `container … over a,b,c` fits a box around its members and re-fits when they move, and `brace … over a,b right "Label"` is a bracket spanning a subset. `bars`, `grid` and `plot` are charts without a chart library. `table` reads its rows off the quoted lines under it and names every cell, `lanes` draws swim-lanes of equal width, and `sequence` draws a protocol down the page, deciding the vertical spacing and generating a name for everything it draws.

**Two statements save repetition.** `default box {.tone-4} w 1.15` sets the starting point for every box in the figure, and adding a tag narrows that to one set; the same lines go in a `draw-defaults:` frontmatter key when every figure in a lecture should look alike. `same as create` copies another element's width and height.

**Inside a label**, `_sub` and `^sup` shift a character or a `{group}` down or up, `*accent*` colours a run and `~muted~` greys it.

**Click the figure, and the button in the corner of the card opens the graphical editor, which is experimental.** It is built for a desktop-sized screen and has been tested a great deal by machine and very little by people. Drag a box and it rewrites one number – the `gap`, the fraction along a line, the nudge on a borrowed coordinate – and never the relation that number sits inside. It also draws those relations while you work, which the finished drawing cannot: a box written `gap 0.55` from its neighbour looks exactly like one that happens to sit 0.55 away. `editor: none` in the frontmatter leaves it out.

**Everything above is drawn rather than described in [the diagrams lecture](../diagrams/audience.html)**, one construct per slide, with one chunk there as the reference for the whole class vocabulary and another for where an edge's label sits. `figure-design.md` in the repository is how to lay a figure out so a room can read it.
:::

## example: Classes | thirteen groups, and one question each {.full #diagram-classes}

**Only one member of a group is ever in force.** The names come from a fixed list, and `{.tone-1}` on a box therefore *replaces* a `default box {.tone-4}` rather than piling on top of it, which is what makes the groups worth knowing.

::: draw {unit=112x82}
default box {.sharp} w 0.62 h 0.42 pad 0.12

# The fills sit across a rule, so that .clear and .paper can be told apart:
# one lets the line through, the other knocks a hole in it.
edge -0.55,0 -- 4.85,0 {.muted}
box f1 "paper"  at 0,0 {.paper}
box f2 "tone-1" right of f1 gap 0.35 same as f1 {.tone-1}
box f3 "tone-2" right of f2 gap 0.35 same as f1 {.tone-2}
box f4 "tone-3" right of f3 gap 0.35 same as f1 {.tone-3}
box f5 "tone-4" right of f4 gap 0.35 same as f1 {.tone-4}
box f6 "clear"  right of f5 gap 0.35 same as f1 {.clear}
text fl "fill" left of f1 gap 0.7 {.muted .right}

box o1 "round"   at 0,1.1 {.round .tone-2}
box o2 "sharp"   right of o1 gap 0.35 same as o1 {.tone-2}
box o3 "hex"     right of o2 gap 0.35 same as o1 {.hex .tone-2}
box o4 "chevron" right of o3 gap 0.35 w 0.78 h 0.42 point right {.chevron .tone-2}
box o5 ""        right of o4 gap 0.4 w 0.42 h 0.42 point up {.wedge .tone-4}
# A cross squares itself past this row's `default box … w`, the same way a
# bars column ignores an inherited outline: the default is about the
# rectangles in the block, and a plus sign is not one of them.
box o6 ""        right of o5 gap 0.4 {.cross .accent}
# A diamond is sized at twice what its label would need in a rectangle, so it
# is shown empty here like the wedge and the cross rather than made to hold
# the word "diamond" and doubling the width of the whole row.
box o7 ""        right of o6 gap 0.4 w 0.5 h 0.42 {.diamond .tone-2}
text o5n "wedge" below o5 gap 0.16 {.small .muted}
text o6n "cross" below o6 gap 0.16 {.small .muted}
text o7n "diamond" below o7 gap 0.16 {.small .muted}
text ol "outline" left of o1 gap 0.7 {.muted .right}

box s1 "dashed" at 0,2.25 {.dashed .clear}
box s2 "dotted" right of s1 gap 0.35 same as s1 {.dotted .clear}
box s3 "thick"  right of s2 gap 0.35 same as s1 {.thick .clear}
box s4 "bare"   right of s3 gap 0.35 same as s1 {.bare .clear}
box s5 "ghost"  right of s4 gap 0.35 same as s1 {.ghost .tone-2}
box s6 "dim"    right of s5 gap 0.35 same as s1 {.dim .tone-2}
text sl "stroke,\nand presence" left of s1 gap 0.7 {.muted .right}

# Only the two ends of this row are placed. The five between them are named
# in the order they should stand in and get equal centre distances, which is
# what a row of seven specimens of seven different widths wants.
text t1 "sans"  at 0.3,3.2
text t7 "bold"  right of t1 gap 5.45 {.bold}
text t2 "mono"  right of t1 gap 0.55 {.mono}
text t3 "serif" right of t1 gap 0.55 {.serif}
text t4 "hand"  right of t1 gap 0.55 {.hand}
text t5 "small" right of t1 gap 0.55 {.small}
text t6 "large" right of t1 gap 0.55 {.large}
text tw "family,\nand size" left of t1 gap 0.85 {.muted .right}
spread x t1, t2, t3, t4, t5, t6, t7

box g1 "a label that is too long" at 0,4.2 w 1.2 h 0.5 {.shrink .clear}
box g2 "short" right of g1 gap 0.4 same as g1 {.fit .clear}
text n1 "shrink" below g1 gap 0.14 {.small .muted}
text n2 "fit"    below g2 gap 0.14 {.small .muted}
text gl "type meets\nits box" left of g1 gap 0.7 {.muted .right}

box w1 "top\nleft"     right of g2 gap 0.75 w 0.56 h 0.74 {.clear .top .left}
box w2 "centred"       right of w1 gap 0.25 same as w1 {.clear}
box w3 "bottom\nright" right of w2 gap 0.25 same as w1 {.clear .bottom .right}
box w4 "turn"          right of w3 gap 0.25 w 0.34 h 0.74 {.tone-2 .turn}
text wl "where the words sit" below w2 gap 0.28 {.small .muted}

# Five labels hanging off rows of five different lengths: the statement gives
# them all the right edge of the first one.
align x right fl, ol, sl, tw, gl
:::

::: expand How to read the sheet, and the rest of the list
**Every row above is one group**, except three that carry two or three because the questions belong together: stroke pattern, weight and the two ways of receding; family and size; the words that place a label across and the ones that place it down. The two ink classes have no row of their own, being at work over the whole sheet – `.accent` on the cross, `.muted` on every caption.

**Forty-one names in all, and `lint.js` refuses anything else**, so a typo stops the build rather than leaving a box unstyled.


Only three class names belong to no group and can be combined with anything: `.bold` for a heavier label, `.turn` for a label read bottom-to-top up the side of something tall and narrow, and `.front` for a line drawn over the boxes rather than under them. Three groups have no row on the sheet. Two of them belong to edges – how a line is drawn (`.smooth` bends your waypoints into a curve running through them, `.elbow` works out a right-angled route with its turn halfway across the gap and needs no waypoints at all) and which end carries an arrowhead, which you normally say with the arrow itself (`->`, `<-`, `<->`, `--`) and only ever write as a class inside a `step`. The third is how much of the room's attention an element asks for: `.emph`, `.dim` and `.ghost`. **Those three names are also the three verbs a step uses for the same thing.** Two members of one group on one element is an error, and `{!dim}` is how a class comes back off; there is no fourth name for ordinary prominence, the absence of all three being what that is. `.paper` fills a label with the page colour, knocking a hole in a line running behind it.

Two pairs are not one group but still draw a warning, because one of the two ends up doing nothing: `.tone-4` with `.accent`, where the fill already *is* the accent, and `.turn` with `.left` or `.right`, where a label standing on end is centred across the direction it reads. `.top` and `.bottom` do still move a turned label.

Which way a pointed outline aims is the `point` option – `up`, `down`, `left` or `right` – and writing it on an outline that has no point is an error. So is `.fit` on a box with no width to fit into, and so is an outline class on anything but a `box`. A `.cross` given no `w` of its own comes out square, and stays square even under a `default box … w`; a `w` on the element's own line still wins.

:::

## example: Lining things up | `flush`, `align` and `spread` {.full #diagram-align}

**Three words put elements level with each other, and they are not interchangeable.**

- **`flush` finishes a placement** and takes one word: `below src gap 0 flush left` keeps the new box's left edge level with `src`.
- **`align` is a statement on a line of its own.** `align y middle a, b, c` gives `b` and `c` the vertical centre of `a`; the first name is the one the others follow.
- **`spread x a, b, c, d` shares a set out evenly.** First and last stay put; everything between gets the same distance from its neighbours.

**The two statements are both at work in the sheet on the last slide**: an `align x right` gives the five row labels the right edge of the first, and a `spread x` puts the five middle words of the family row between `sans` and `bold`.

::: expand Where the two statements refuse
`align` and `spread` work on boxes, dots, texts and images only – naming an edge, a container or a brace is an error. `align` names its axis first: `x` takes `left`, `middle` or `right`, `y` takes `top`, `middle` or `bottom`. `spread` needs at least three elements; `align` needs two.
:::

> note: Two columns built as separate `below` chains drift apart the moment their captions differ in height, and a line between two drifted boxes then runs a degree off the axis. The build warns about that.
>
> The sheet stays on screen when the prose around it is shortened away, so present this chunk from the short view. Press `A` a few times while it is up: the four tones are mixed from the page's own ink and accent, so the whole sheet changes with the theme.

## example: Charts | `bars`, `grid` and `plot` {.full #diagram-charts}

**Three statements draw data, and each turns into ordinary boxes, texts and edges first.** `bars` becomes one box per column plus a baseline, `grid` one box per cell, and `plot` a frame of gridlines, ticks and two axis titles.

::: draw {unit=148x64}
bars wc "18,16,15,12,11,9,8,7,6,5,4,3" at 0,0 w 2.3 h 1.05 space 0.06 {.tone-3}
brace long over wc-0,wc-1,wc-2 side bottom "the three to rewrite" pad 0.45 {.small .muted}
# In front, or the columns cover the line and it shows only in the gaps.
edge lim wc.left,wc.top+0.3 -- wc.right,wc.top+0.3 {.accent .dashed .front}
text limn "budget" at wc.right-0.28,wc.top+0.1 {.small .accent}
text wcn "words per chunk" above wc gap 0.3 flush left {.small .muted .left}

grid ch dot 8x5 right of wc gap 1.75 cell 0.15 space 0.07 {.tone-2}
text chn "one dot per chunk,\ntinted where a figure lives" below ch gap 0.3 flush left {.small .muted .left}

step over
  emph wc-0, wc-1, wc-2
step figures
  style ch-1-0, ch-4-2, ch-6-3, ch-0-4 {.tone-4}
:::

**Everything a chart draws is an ordinary element with a generated name** – `wc-0`, `wc-1`, … for the columns and `ch-1-0`, `ch-4-2`, … for the cells – which is why the brace and the tinted cells above needed no vocabulary of their own.

::: expand What else is going on in that figure
- **The budget line is an `edge`** between two coordinates read off the chart's own frame, with `.front` on it so the columns do not cover it.
- **Spacing inside a chart is `space`, never `gap`** – `gap` is the distance to another element on the same line.
- **`emph 0,1,2` or `dim 5`** on a `bars` line marks those columns from the opening picture onwards, which is usually where a chart wants one.
:::

## example: More on bars | a second series, and columns laid flat {.full #diagram-bars}

**A second set of numbers is one more `bars` line:** `bars after "…" series of wc {.tone-1}` joins the first chart's frame and borrows its ticks, its baseline and its scale.

## example: Columns laid flat | `horizontal`, and what it buys {.full #diagram-flat}

**`horizontal` lays the columns flat**, which is what a chart wants as soon as its categories have names rather than numbers – lengths from one shared left edge are easier to rank, and “DNS cache poisoning” cannot be written under an upright column at all.

::: expand What a joined series may and may not carry
**A joined series brings only its own numbers and its own colour.** The width is shared out between them, so a grouped chart takes exactly the paper a single one did. `stacked` piles it on the run before it instead, and the scale becomes the tallest stack. Such a line takes no `w`, no `h`, no `space`, no placement and no tick labels: all five belong to the chart it joined.

**Laid flat**, the bars run left to right, the categories stack downwards, the tick labels become a right-aligned column down the left margin, and the baseline stands on the left. A tick string containing `|` splits on that instead of on spaces, so a label can be as many words as it needs – the same mark that separates a `table` row and a `lanes` name list.
:::

::: draw {unit=150x50}
bars hour "31,24,18,9" "writing the prose | drawing the figures | fixing one wording | fighting the tooling" at 0,0 horizontal w 1.7 h 1.25 emph 1 {.tone-2}
text hourn "minutes, in the hour before a lecture" below hour gap 0.5 {.small .muted}
:::

## example: Plots | `plot` draws a frame and a scale, and nothing else {.full #diagram-plot}

**A `plot` draws a frame and a scale, and nothing else.**

::: draw {unit=150x54}
plot pace "minutes into the talk" "chunks covered" at 0,0 w 2.7 aspect 2:1 x 0,60 y 0,40 tick 10
edge even pace@0,pace@0 -- pace@60,pace@40 {.muted .dashed}
edge real pace@0,pace@0 -- pace@60,pace@40 via pace@12,pace@4 pace@26,pace@12 pace@44,pace@26 pace@54,pace@34 {.smooth .accent .thick}
dot  mark "" at pace@26,pace@12 r 0.08 {.accent}
text evenn "even pace" at pace@50,pace@33 pad 0.12 {.small .paper}
# The leader meets the curve at one point instead of running across the field
# and crossing both curves on the way.
text realn "the first third\nalways runs long" at pace@22,pace@31 pad 0.12 -- mark {.small .hand .paper}

step real
  show real, mark
step lesson
  emph real
  dim even
:::

## example: What a plot gives you | a frame, a scale, and ordinary edges over it {.wide #diagram-plot-scale}

**A chart is sized with `aspect`, not with `w` and `h`** – those two are counted in grid squares, and a grid square is not square, so they do not describe the shape a reader sees.

**A `plot` takes two ranges and one `tick` interval, and draws nothing but the frame and the scale** – after which `pace@26` names a value in the plot's own units anywhere a coordinate can go, and the curves over it are ordinary edges.

::: expand Sizing, curves, and two charts that match
**`aspect 4:3`, `aspect 1:1`, or a single number meaning that many wide to one tall**, states the proportion the reader sees and lets the build work the other number out. Both `bars` and `plot` take it. At the `unit=150x54` of the figure above, a plot written `w 1.9 h 1.5` comes out 285 by 81 pixels, which is nothing like 1.9 by 1.5. Giving `w`, `h` and `aspect` together is an error, because two of the three would have to lose and nothing on the line says which.

**`pace@26` goes anywhere a coordinate can** – in a waypoint, in an `at`, at the end of a pointer line. `.smooth` runs a curve *through* the waypoints you wrote rather than joining them with straight segments, `--` draws a line with no arrowhead, and the two steps bring the second curve in and then emphasise it while the reference line recedes.

**Two charts meant to be compared take one size, written once.** `same as pace` on a second `bars` or `plot` line copies the whole frame. It can only name a chart written *above* it, and `w`, `h` or `aspect` beside it is an error. Matching frames are not a matching scale: the ranges are written per chart and nothing checks that two of them agree.
:::

> note: The numbers in both figures are made up. `plot` has no logarithmic scale, no automatic choice of ticks, no legend and no series of its own – everything it draws is an element you could have written by hand.

## example: A figure that moves | `hide`, `dim`, `move` and `label`, inside a `step` {.full #diagram-steps}

**A figure with steps is an argument in stages – the setting, the intruder, the cut wire, and what it costs.** Press forward three times.

::: draw {unit=138x70}
default box {.tone-2} w 1.25 h 0.5

box alice "Alice" at 0,0
box bob   "Bob"   right of alice gap 6.3 same as alice
edge wire alice <-> bob "M"
container net "the intended channel" over alice,bob pad 0.5 {.dashed .muted}

box eve "Eve" between alice,bob offset 0,-1.7 same as alice {.tone-4 @attack}
text note "no cipher is broken here –\nshe just stands in the middle" below alice gap 1.05 flush left -- eve.cx,eve.bottom {.hand .small @attack}

# Eve is level with the other two by the time this arrow is shown - the same
# step moves her onto the line - so it is a plain side-to-side connection and
# the compiler picks the two facing edges.
edge in alice -> eve {.accent @cut}
edge fwd eve.right:0.2 -> bob.left:0.2 "M" {.accent @cut} side top
edge edit eve.right:0.8 -> bob.left:0.8 "M′" {.accent @cut} side bottom

step spot
  show @attack
step cut
  hide wire
# `to` names a position, `by` shifts by an amount, and the layout is worked
# out again at every step, so the container re-fits.
  move eve to between alice,bob
  move alice by -0.5,0
  move bob by 0.5,0
  show @cut
  emph eve
step damage
  label eve "Eve rewrites M"
  style edit {.dashed}
  dim net
:::

**Every element after the first is placed against another one, so nothing comes apart when the middle box walks in.** `move eve to between alice,bob` states a position, `move alice by -0.5,0` shifts an element by an amount, and the whole figure is laid out again at every step – so Alice and Bob step aside, the `container` re-fits around them, and the arrows are drawn wherever their ends have gone. `hide` takes the direct wire away, `dim` is the opposite of `emph`, and `label` swaps in wording that was typeset when the lecture was built.

**Two tags do all the revealing: `@attack` and `@cut`.** `show @attack` brings Eve in and the handwritten caption with her, because both lines carry that tag; `show @cut` brings the three arrows through her a step later. The pair running to Bob leaves Eve's right edge at `:0.2` and `:0.8`, a fraction along a side being how two arrows between the same two boxes run parallel instead of on top of each other, and `side top` and `side bottom` put one label above its line and the other below.

## example: A figure that advances on a timer | `::: draw {autoplay=N}` {.wide #autoplay}

**A figure written with `autoplay` walks its own steps on a timer once the slide is on screen** – one delay, in milliseconds, for every step. A cover figure that moves while the room files in is the case it was asked for, but it works on any chunk.

```markdown
::: draw {unit=150x56 autoplay=1200}
box crawler "Crawler" {.tone-1}
box det "Detector" right of crawler gap 1.6
edge crawler -> det "request"

step probe
  emph det
:::
```

The timer presses the same key you would press, so the speaker view follows and freezing the projection stops it. It runs on the projection only, and **the first key, click or scroll on that slide stops it** – once you have touched the figure you have taken over. It also refuses to start on a slide that is already half uncovered.

## example: What the timer promises | the bounds, and who takes over {.wide #autoplay-bounds}

The delay has to be between 200 ms and 60 s; outside that the build refuses the number rather than quietly moving it.

**`cycle` repeats the walk** – `{autoplay=1200 cycle}` – which is usually what a cover figure wants while a room fills. It rewinds the same way it advanced, so the speaker view follows the rewind too. The last step is held for one delay like every other, and there is no second number for how long to hold the finished picture.

# Beyond 1.0.0: slide decoration {#decoration}

> Newer than the 1.0.0 download as well, and out of the same clone.

## principle: A slide can be more than a column of text | and what makes it one is not written inside the text {.standard #deco-idea}

**Write a picture into a chunk and you get a picture in the text column** – never one that fills the slide, and never three things standing side by side.

**Three kinds of construction sit beside the body rather than in it: a picture behind the slide, blocks in place of the paragraphs, and the slides a lecture opens and closes with.** The rest of this part takes them one at a time, in that order, and all
of them are shown one per slide in
[the decoration lecture](../decoration/audience.html).

## example: A picture that fills the frame | `::: backdrop` and `::: overlay` {.wide #backdrop}

**`::: backdrop` puts a picture behind the whole slide, edge to edge, and `::: overlay` puts a block of text on top of it.** One line each, on any chunk – a cover is not a special case. A backdrop names its picture the same three ways an image does: a bare asset id, a path, an https address.

```markdown
## figure: {#skyline .full}

::: backdrop city-at-night {invert blur}

::: overlay {bottom-left ink wide}
### Every endpoint is a sensor
A crawler that looks like a browser gets measured back.
:::
```

## example: The words in the braces | five questions for a backdrop, three for an overlay {.wide #backdrop-words}

**A backdrop's braces answer five questions, at most one word each.** How the picture fills the frame – it covers the slide, or it fits inside it whole. Which part of it survives the crop. What is laid over it. Whether it is sharp or blurred. And whether it sits under the type or in front of it. Two words answering the same question is an error, and the message names both.

**Without asking you get `veil`**: the theme's own paper at 80%, so ordinary dark text stays legible on a photograph in all seven themes. `invert` darkens the picture and turns the text light instead – the next slide is one.

**An overlay answers three**: *where* on a 3×3 grid, *what it sits on* (`paper`, `ink`, `accent`, `clear` or `glass`) and *how wide*. Every one is a card with padding and rounded corners, because text laid straight onto a photograph is unreadable at the back of a room.

[The decoration lecture](../decoration/audience.html) has a slide for each of the two lists, and a backdrop whose window opens on a keypress.

## example: A picture behind the words | what the two blocks on the last slide produce {.full #deco-picture}

::: backdrop dusk {cover invert}

::: overlay {bottom-left ink standard}
**The backdrop is the slide's ground**\
and this block is an overlay, placed on a 3×3 grid.
:::

> note: The veil laid over a backdrop is the theme's own paper, not white, so ordinary dark text stays legible over a photograph in every theme. `invert`, which this slide uses, darkens the picture and turns the text light instead. The chunk is nothing but the two blocks on the slide before it – there is no body text at all.

## example: A row of cards | `::: cards N` {.wide #cards}

**`::: cards 3` puts three separate boxes across the slide, and an item is in one of them whole or it is nowhere.** A `::: cols 3` block does the other thing: one run of text the browser shares across three columns, so a paragraph can spill from the foot of one into the head of the next.

::: cards 3
- **cards**
  - N containers side by side
  - a three-item comparison reads as three things
- **rows**
  - the same container turned ninety degrees
  - a term, with its body beside it
- **cols**
  - one text flow balanced across N tracks
  - a paragraph can spill from one into the next
:::

That row is one Markdown list between `::: cards 3` and `:::`, and **each card has a second level folded away under it – press `C` and it appears.** The folded level is in `print.html` and `print-notes.html` either way, so one row serves the room and the hand-out.

One rule decides what becomes a card: write a single list and each of its items is a card; write anything else and each block is a card. The count runs from 1 to 6 – one card is a callout you want to stand apart, and past six what you have is a table.

## example: The two ways to open a card | a lead-in, or a heading {.wide #cards-open}

**How you open a card decides what the bold does**, and the two below are written the two ways:

::: cards 2
- **A lead-in** is written on the same line as its text, so the bold runs into the sentence and the card reads as one paragraph
- **A heading**\
  is written before a line break, so the bold sits on its own line with the text under it
:::

Use `cols` for an argument that runs long, and `cards` for a comparison the room should be able to count.

## example: What the words in the braces do | the seven that set a card row's look {.wide #cards-look}

**Seven words in the tail set the look of a card row**, written bare between braces, at most one per question – a second word answering a question already answered stops the build.

- **`ground`** – what the card is made of: a tint, a hairline, the page, or nothing.
- **`anchor`** – where the text sits when the card is taller than its content.
- **`corner`**, **`detail`** and **`scrim`** – the radius, the small print, and what is laid over a picture.
- **`size`** and **`align`** decide themselves: the longest item picks the size, and the alignment follows it.

## example: One ground for a whole row | `accent`, `paper`, `clear` {.wide #cards-ground}

**`ground` is answered once for a whole row**, so three grounds means three rows, each written `::: cards 1 {…}` with its own word. `panel` is the default, a tinted fill; `outline` is a hairline and no fill; `photo` makes the card's first picture its background, and `scrim` says what is laid over it.

::: cards 1 {accent}
- **accent** – the theme's own colour, with the text in the page colour on top
:::

::: cards 1 {paper}
- **paper** – the page colour, so the card lifts off whatever is behind it
:::

::: cards 1 {clear}
- **clear** – no box at all, so the gap is what separates one card from the next
:::

## example: A tail that answers twice | `::: cards 3 {outline middle}` {.wide #cards-anchor}

::: cards 3 {outline middle}
- **outline**\
  a hairline and no fill, which is quieter on a slide that already carries a figure
- **middle**\
  this text is centred against the tallest card. In the row above it sits at the top
- **never both**\
  a fill inside a hairline reads as a form field rather than as a card
:::

**That row is `::: cards 3 {outline middle}`**, so its tail answers two questions at once: `ground`, and `anchor` – where the text sits when the card is taller than its content, which it always is, a grid row being as tall as its longest card.

## example: A term and what it means | `::: rows` {.wide #rows}

**`::: rows` is a card turned ninety degrees**: a term in a card on the left, its explanation beside it, several of them stacked.

::: rows {accent}
- **Separatism** Engineers do the technical work; managers take the decisions
- **Technocracy** Engineers should take them, because they understand them
- **Deference** Engineers name the options and say what each one costs
:::

## example: What a row block does differently | no count, and three defaults of its own {.wide #rows-rules}

That row is `::: rows {accent}` around one list, and every term gets the same column width, so the explanations line up down the slide however long the terms are. **The explanation is optional** – a term written on its own is a labelled row with nothing beside it, which is what an agenda or a list of names wants.

It takes no count, a row block having one column by definition, and it takes every word a card row takes. Three defaults differ: the text is centred against its term rather than against its first line; `align` says how the term sits *in its card*, and the explanation always ranges left; and the automatic size stops at `medium`, a term being a label in a column rather than a headline across the slide.

Reach for `rows` when a term needs a sentence, and for `cards` when a comparison needs counting.

## example: A figure beside the prose | `::: side 2:1` {.wide #side-ratio}

::: side 2:1 {middle}

**`::: side` takes an optional ratio, so the two panes need not be equal halves.** This slide is `::: side 2:1`: two parts of prose to one part figure, which is the shape a diagram with its commentary usually wants. Any two numbers work, `::: side` on its own is equal halves, and `::: flip` starts the second pane.

That drawing is a `::: draw` block inside the second pane. In `print.html` and `print-notes.html` the two panes stack one after the other and the ratio is ignored, because a page has only one column to give them.

**A short pane sits at the top of its half unless you say otherwise, and `{middle}` centres it against the taller one.** Here the *figure* is the short pane, so `{middle}` is what puts it level with the middle of this column instead of at the top. `{top}` is the default and often right – a caption over a figure is aligned from the top on purpose. The word belongs to the block and not to either pane, because the taller pane is what makes the row tall, so centring can only ever move the shorter one.

**A figure *above* or *below* the text needs nothing at all** – put the block first or last in the chunk body. `::: cols` is the one place a figure does not belong: a figure breaks the run of text the columns share, so the columns quietly stop working. A `::: draw` written there is refused, and the message points you at `::: side`.

::: flip

::: draw {unit=140x60}
box a "Crawler" {.tone-1}
box b "Detector" below a gap 1.1 {.tone-4}
edge a -> b "request"
:::

:::

## example: Setting the typography for a whole lecture | the `style:` block {.wide #style-block}

**The `style:` block holds the settings you make once for a whole lecture rather than chunk by chunk.**

```yaml
style:
  headings: left        # auto | left | center | off
  rules: off            # on | off  – the hairline over a principle
  labels: off           # on | off  – the type word over a chunk
  link-codes: off       # on | off  – the mark after an external link
  blocks: left          # center | left – where a code block,
                        # a figure and a formula sit
  wrap: none            # balance | none – even line lengths,
                        # in headings and in prose alike
  print-body: sans      # serif | sans – the printed document's face
  heading-scale: 1.15   # 0.6 … 1.8
  body-scale: 0.95      # 0.6 … 1.8
```

`headings: auto` is the default, and it means the type decides: a question is centred, a figure's caption sits over its artwork. `left` overrides all of that, for one line of alignment down the whole lecture. `off` takes every heading off the projection while keeping it in `print.html`, `print-notes.html`, the contents list and the search.

## example: Four keys the block's names do not explain | `wrap`, `blocks`, `print-body` and the scales {.wide #style-keys}

**`wrap` reaches headings and prose both**, which its name does not say: `balance` evens the line lengths of a heading and protects the last line of a paragraph, and `none` turns both off. `blocks` and `wrap` are the two keys a single chunk can answer for itself, with `{.blocks-left}` and `{.wrap-none}` in its attribute tail.

**`print-body` is the one setting here that only the printed pages see.** The projection and the lectern let a reader pick the face with `F`; a document has no reader to press it, so `sans` is how you ask for one set in the sans. Code stays in the monospace, and so does everything the document already draws in the sans – the type word, a caption, the contents list.

The two scales multiply the tool's own sizes rather than replacing them, and they are **bounded**. Outside 0.6 to 1.8 the shortened view, the limit on how wide a line of code may be and the automatic zoom stop agreeing with each other.

## example: Turning the generated labels off | `style: {labels: off}` {.wide #labels}

**The type word above a chunk is drawn in two places, and one setting takes it out of both.**

::: cards 2
- **`print.html` and `print-notes.html`** set a small line of capitals over every typed chunk. Every type has one except free and figure, so that is where most of them live.
- **The projection** prints only the word over an exercise. The rest were taken out: a label naming the kind of slide is only ever as right as the type was.
:::

```yaml
style:
  labels: off
```

`rules` is the neighbouring key and switches the lines – the bar above a principle, the hairline above a definition. `labels` switches the words.

**A figure's heading, set in capitals, is your own text and needs no key.** It is the chunk's heading, drawn that way because the type is `figure`, so `## figure: {.wide #id}` with no heading text leaves it off the slide. The cost is that the chunk then has no text for search to find and no heading in `print.html`. (The contents list is unaffected – `T` lists the lecture's columns, never its chunks.)

## example: Which typefaces travel in the file | nine come with the tool {.wide #bundled-fonts}

**Three families travel in any one file, and which three is yours to pick.** Nine come with the tool, so naming one of those needs no font file at all.

```yaml
fonts:
  serif: Bitter                    # or Literata, the default; also Source
                                   # Serif 4, Noto Serif, Roboto Serif
  sans: Inter Tight                # or IBM Plex Sans, the default
  mono: Noto Sans Mono Condensed   # or JetBrains Mono, the default
```

Only the three a lecture actually asks for are read, so choosing an alternative costs that lecture and no other. A name that is neither one of the nine nor a file in `fonts/` stops the build, and the message lists the names available for that role.

**Among the serifs, the question is what a projector does to a typeface.** Bitter has the lowest stroke contrast and the smallest file, which is why it survives a lit room; Roboto Serif has the strongest bold but sets 8% wider, so it re-wraps a deck written against another face.

**The condensed monospace is 17% narrower** – 0.50 em against 0.60 em per character, measured in a browser – so a listing that ran off the slide now fits. It is Noto Sans Mono with its width axis pinned rather than a different typeface, so it costs 54 KB. Slashed zero, and `I`, `l` and `1` are three visibly different shapes.

**`ligatures:` decides whether letter pairs are drawn joined, and answers separately for prose and for code.** `text` is the default: `fi` and `fl` joined up in prose, nothing joined in code. `none` takes them out of prose as well. `all` puts the code ones back, so JetBrains Mono draws `->` as a single arrow again. The code ones are off by default because in the figure language `->` and `--` are two *different* arrows, and every listing on a slide is source somebody may retype.

## example: Embedding your own typefaces | `fonts/` beside `source.md`, plus a frontmatter block {.wide #fonts}

**A family that is not inside the file is a family the room may not get.** Safari does not tell a page which fonts a machine has, so a lecture that merely names one takes whatever that browser decides instead. The three a lecture carries are embedded in every output it writes, cost about 280 KB per file, and `fonts: none` leaves them out; the bundled three are under the SIL Open Font License, which permits exactly this.

**Each of the three roles is answered on its own**, so you can replace one and leave the others alone. Put your files in a `fonts/` folder beside `source.md`:

```yaml
fonts:
  serif: Vollkorn        # yours – the files are in fonts/
  mono: JetBrains Mono   # one of the five that ship, so no file
                         # sans: not written, so it stays the default
```

**A file's name says which weight and style it is**: `Vollkorn-Regular.woff2`, then `-Bold`, `-Italic`, `-BoldItalic`, `-600`, `-600italic` – or one file, `Vollkorn[wght].woff2`, carrying every weight. A family that is neither one of the five nor a file in `fonts/` stops the build.

**Putting a font inside the file redistributes it, so check the licence first.** The SIL Open Font License and Apache-2.0 – between them nearly all of Google Fonts – allow that; most commercial desktop licences do not, and want a separate web licence. The build prints a reminder and checks nothing.

## example: How the title slide is composed | `cover:` plus a `subtitle:` line {.wide .blocks-left #covers}

**`cover:` in the frontmatter picks how the title slide is composed, and `subtitle:` gives it the line that says what the talk is about.** Without those two, a cover is one weight of one colour with the subject set beside the venue, and it reads as a text file rather than as the opening of a talk.

```yaml
title: How Caches Forget
subtitle: Eviction, Staleness and the Cost of Being Wrong
presenter: Jana Wieland
info: |
  Distributed Systems · Lecture 7 · Room WE5/00.019
  uni.example/ds
cover: split            # see the two rows below
cover-image: skyline    # only the four picture covers take one;
                        # on the six text-only ones it is an error
```

`info:` takes as many lines as you give it – the course and the room, the address students should write down, or, at a conference, its name and dates. Without `subtitle:` the one line saying what the talk is *about* has nowhere to go but `info` either, where it is set exactly like the rest.

## example: The ten cover compositions | six of text alone, four that take a picture {.wide #cover-list}

**They are ordered by how much the opening slide asserts itself.** Six are text and nothing else:

::: cards 3
- **classic** the lower-left third. The default, so a lecture that names no cover at all is unchanged
- **masthead** the title along the top edge, the credits along the bottom, your own text in the field between
- **stack** the title block centred on both axes, for an opening that wants to be still
- **display** the title set to fill the slide. The scale is the whole design
- **panel** the type on a full field of the theme's accent colour
- **quote** the title chunk's body set as the claim, the lecture's name under it
:::

## example: The four covers that take a picture | and what each does with it {.wide #cover-pictures}

Four take a picture:

::: cards 4
- **split** type on the left, the picture running off the right edge
- **hero** the picture is the slide, type reversed out of a dark gradient
- **beside** the title chunk's own body, a drawing say, set to the right
- **above** that same body on top, the title centred in the band below it
:::

## example: What a cover reads besides its name | the body, a backdrop, and three more keys {.wide #cover-keys}

**`beside`, `above` and `quote` take their content from the chunk body**, so a `::: draw` can be the cover – a diagram is not a file, and `cover-image` can never name one.

**The six text-only compositions each take a `::: backdrop`**, which is how a photograph reaches a cover with no `cover-image` of its own.

::: expand The rest of the cover keys
On `beside`, `above`, `quote` and `masthead`, `info:` still supplies the credit lines; everywhere else writing a body replaces `info`.

`cover-ratio: 42%` sets how much of the slide the picture takes on `split`, `beside` and `above`, and `cover-align: top | middle | bottom` moves the words up or down on the compositions that leave them any freedom.

Try `panel` with a backdrop: its coloured field becomes the veil, so the picture reads through a plate of the accent rather than under the paper wash every other backdrop gets.
:::

## example: Where a new part starts | `section:` {.wide #section-dividers}

**A column with a `# Heading` opens with a divider slide**, and `section:` picks how that slide is drawn.

::: cards 3
- **plain** the heading on its own. The default
- **tinted** the accent colour over the whole slide. The most visible of the six
- **rule** the heading between two rules. The one that survives a mono print
- **card** the heading set on a panel
- **number** a large counter above the heading
- **outline** every part listed, the one you are entering marked. A running agenda
:::

## example: A divider is never the title slide | and `section-mark:` puts a word over it {.wide #section-quiet}

**Every one of them is quieter than the cover**, so that a divider is never mistaken for the title slide: it says *a new part starts here, and it is part of the thing you are already in*.

```yaml
section: tinted         # plain | tinted | rule
                        # card | number | outline
section-mark: Teil      # any short word, or nothing
```

`section-mark:` puts a word of your own – `Teil`, `Kapitel` – over the heading. By default there is none.

## example: The last slide | `## closing:` {.wide #closing}

**`## closing:` draws a last slide in the same composition as the cover, so the lecture ends on the shape it opened with.** A lecture that starts on a designed slide and ends on the last bullet of the last argument stops rather than finishes.

```markdown
## closing: Questions? | office hours Thursday, 14–16 {#end}

Next week: certificates, and who you are actually trusting.
```

**The heading is the first line, the sub-heading after the `|` is the second, and the body is whatever should stay on screen while the room asks questions.** Your name and the `info` block are not drawn.

**A closing slide never reaches for `cover-image` by itself** – ending on the opening picture unasked is the repetition this slide exists not to be. `closing-image: cover` in the frontmatter asks for it, and the deck closes on the picture it opened with; any other value names a different one, in the same three forms `cover-image` takes. A `::: backdrop` on the chunk is the other way and a different thing – a full-bleed ground behind the words, which works on all ten compositions and wins over both.

> note: The checker warns if a `closing:` chunk is not the last chunk in the lecture, and if there is more than one – both of which are lectures that end twice.

## closing: That is the tour | now write your own `source.md` {#end}

Everything in this tour comes out of one Markdown file and one command, `node build.js source.md`. The four views are already sitting beside it.

> note: This slide is the construct it describes – the tour ends in the composition it opened with, `masthead`, carrying its own words rather than a second copy of the title block.
