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
     for this one, so it is switched off here, in the open. -->

## title: {#title}

One Markdown file becomes four HTML files: a document to print, the same
document with your speaker notes, a projection for the audience, and a view of
your own at the lectern. This tour is such a file, and it shows each feature
by using it.

# Welcome {#welcome}

> note: This lecture explains the tool by being written in it. Open the speaker view too (press S) and keep the two windows side by side – the Speaker cockpit column later on assumes it is running.

## principle: One source, four views | the deck, the hand-out and the notes stop drifting apart {.standard #one-source}

**The deck, the hand-out and your notes say the same thing, and they disagree the moment you edit one.** A lecture normally needs all three, and keeping them in step is work you do instead of preparing the lecture.

**Instead, you write one Markdown file that consists of *columns* and *chunks*.**

**One command turns that file into four HTML files, and the four differ only in what they show you.** `print.html` is a reading copy with a cover and a table of contents. `print-notes.html` is that same *document* with your speaker notes folded in under each chunk. `audience.html` is the *projection*, the presentation you show to the audience; whenever the tour says what a slide shows, it means this file. `speaker.html` is the speaker view, the screen you keep at the lectern, carrying the notes, a strip of the slides around you and a timer.

> note: Words in italics the first time they appear are this tool's own terms rather than ordinary English: *chunk*, *column*, *projection* and *document* here, then *segment*, *beat*, *expansion* and *cockpit* as the tour reaches them.

## figure: One file in, four files out {.wide #four-views .bare .center}

::: draw 152x52
default box {.mono} pad 0.14

# The four outputs stand in one column and source.md sits opposite their
# middle. The four edges are .elbow, and an elbow's rail is measured between
# the two faces – so the fan-out reads as one bracket only if the four left
# faces are in one place. A run of `above` / `below` boxes shares one width
# by default, so all four come out as wide as print-notes.html, the widest
# label, and nothing here has to say so.
box  notes "print-notes.html\ndocument + notes"  at 1.55,0.75
box  doc   "print.html\nthe document"            above notes gap 0.22
box  aud   "audience.html\nthe projector"        below notes gap 0.22
box  spk   "speaker.html\nthe cockpit"           below aud gap 0.22

box  src   "source.md\none file"                 between doc,spk offset -1.95,0 {.tone-3}
text bjs   "build.js"                            right of src gap 0.14 offset 0,-0.34 {.muted .small .mono}

# source.md is not the whole input. The pictures a lecture references are read
# from assets/ and end up inside every one of the four files, which is what the
# paragraph under this drawing claims – so they belong in the drawing. Three
# empty frames say "some images" without pretending to be any particular one.
# The label sits over the left frame and the wire leaves the middle one, so the
# two never meet.
image ph2 photo                                  below src gap 0.8 w 0.30
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
edge sync aud.right <-> spk.right via aud.right+0.30,aud.cy aud.right+0.30,spk.cy "postMessage\nlive sync" side right {.dashed .muted .small .mono}
:::

Each of the four files carries everything it needs inside itself – the pictures, the typefaces, the styling, the code. Each one opens by double-clicking, with no web server and nothing fetched from the network, so you can send any of them to a colleague as a single attachment.

> note: The drawing above is a `::: draw` block written out in the lecture source, drawn into the page as artwork at build time. It takes its colours from the theme: press A a few times while this slide is up and the figure re-colours with the page.

## definition: Chunks and columns | the two terms the rest of the tour uses {.standard #chunks-columns}

**A *chunk* is one `##` heading and everything written under it.** In the projection it gets a screen of its own; in the printed document it is a section of the page. It is the nearest thing here to what another tool calls a slide.

**A *column* is a run of chunks on one theme, opened by a `# Heading`.** It is the part of a lecture that `Shift` and an arrow moves you through in one press, and it is what the contents list on `T` shows – chunks never appear there.

**Every lecture consists of one or more columns, and each column holds one or more chunks.** Everything after this slide is what you may write inside a chunk.

::: pulse
What is the difference between a chunk and a column?
---
A chunk is one `##` heading and what is written under it – one screen in the
projection. A column is a run of chunks on one theme, opened by a `# Heading`:
`Shift` and an arrow moves through one per press, and the contents list on `T`
shows columns only.
:::

> note: The rest of the tour uses these two terms constantly. An audience that has not been told what a column is cannot be told that `Shift` moves by one.

## free: What you are reading is one chunk | `P`, `S` and `?` reach the rest of the lecture {.wide #audience-now}

**Whichever of the four files you have open, what you are reading is one chunk** – one `##` heading in the source, with everything written under it. `audience.html` and `speaker.html` give a chunk the whole screen and move you from one to the next with the keyboard; `print.html` and `print-notes.html` run the same chunks on down the page, so a reader scrolls instead of pressing anything.

::: cols 2

**In the projection, three keys reach the rest:**

- `P` opens `print.html` in a new tab – the whole lecture as a document.
- `S` opens `speaker.html` as a second window, the speaker view. Once both are open, they mirror each other as you move.
- `?` shows the full keyboard and mouse reference. Everything below is in there too, and `Cmd`-`K` (`Ctrl`-`K` off a Mac) opens the same panel as a command palette.

**The one file that produced all four** is `lectures/tutorial/source.md`. Open it in a text editor beside this window and read the two together.

:::

# Moving around {#moving}

## principle: The audience sets the pace | forward moves by a piece, by a chunk, or by a column {.standard #pace}

**A lecture has one order, but the pace belongs to the audience, so forward is not one fixed step.** It uncovers the next piece of the chunk you are on; when that chunk has nothing left, it moves to the next chunk; and `Shift` with an arrow moves a whole column at a time.

**A dense chunk can therefore arrive in parts, and a chunk the audience has already understood is a single press.** The rest of this part lists those keys, and what a click opens.

## free: Forward and back | `Space` and the arrows, with `Shift` for a whole column {.standard #arrows}

**Two keys move you through the whole lecture, forward and back, and holding `Shift` jumps a whole column.**

- **Forward** is `Space`, `↓`, `→`, `Enter` or `PageDown`. It uncovers the next piece of the chunk, then moves on to the next chunk.
- **Back** is `↑`, `←`, `PageUp` or `Backspace`. It puts the last piece away, and leaves the chunk only once that chunk is back where it started.
- **`Shift`-`→` and `Shift`-`←` move a whole column**, from any slide and not only the first of one. `Shift`-`←` goes to the top of the column you are in first, so returning to the start of a part and leaving it are the same key. Press forward now:

---

**You just uncovered a *segment*: in the source, a line containing nothing but `---` cuts a chunk into segments, as long as it is outside a block of code.** The first segment is on screen when you arrive; forward uncovers the next, back puts it away. Each press that changes the slide is a *beat*: every `---` is one, and so is each step of a figure, which later slides show. So the number of `---` lines in a chunk is the number of presses it takes, and you can count them off the source.

**A faint `⌄` at the foot of the slide says the next forward press will leave the column.** There is nothing to click.

**The speaker view shows you what comes next.** With it open, look at this slide there: the segment the next forward press will reveal is already drawn in place, hatched and inside a dashed frame, so you can read ahead without the audience seeing it. Only the immediately next one; the segments behind it stay hidden.

---

**Segments let you pace a dense slide during a talk instead of putting all of it up at once, and this third one is here so you can see them chain.** In `print.html` and `print-notes.html` they run together as one flowing body, so nothing is lost on paper.

## free: Expansions | `1`–`9`, or a click on the chevron, opens one {.wide #expand}

**Some chunks have extra detail behind a chevron button: click one, or press `1`…`9` for the n-th.** This chunk has two of them – try both.

::: expand Digits and chevrons
**A digit opens the expansion with that number, and the same digit closes it again.** This is expansion number 1, so `1` puts it away. `Esc` closes it too, and `2` switches straight to the second one without closing this first.

In the source, an *expansion* is written `::: expand <label>` … `:::`. The label, as you typed it, is on the chevron button and at the top of the opened pane. Only an expansion written with no label gets a short stand-in, `Exp`.
:::

::: expand What it is for
**An expansion is extra material you open only if somebody asks.** It sits behind its button in both `C` settings, so it is never part of what the audience reads by itself – the main text has to carry the argument without it.

Press `C` while this pane is open and watch the chunk behind it shorten. The pane stays where it is: it is not part of the slide either way.
:::

**`print.html` and `print-notes.html` print every expansion** as an indented aside where it stood in the source, so the reading copy loses nothing.

## free: Zoom into a figure or code block | click it, drag to pan, `Esc` to close {.wide .blocks-left #figure-focus}

**Click any figure, block of code or formula inside the chunk you are on.** It opens in a card in the middle of the screen, with the slide dimmed behind it.

```python
# Click this block to zoom it. Useful when a line
# matters more than the slide.
def anonymity_set(observations, senders):
    return {s for s in senders if plausible(s, observations)}
```

Inside an opened card: drag to pan, wheel or `+` `-` to zoom, `0` to reset, `Esc` or a click to close. With a speaker window open, the projection follows which card you opened, how far you zoomed and where you panned, so what you are inspecting is what the audience sees.

## free: Selecting text | hold `Alt` {.standard #select-text}

**In the projection, dragging pans instead of selecting, and holding `Alt` – `option` on a Mac – turns selection back on.** Hold the key and the slide becomes selectable and the cursor changes; let go and dragging pans again. The selection survives the key release so you can reach `Cmd`-`C`, and `Esc` clears it.

## free: Links | a click follows one; the symbol beside it shows the address to the audience {.standard #links}

**Links behave two ways, and which one you want depends on the window you are in.** A plain click follows the link in a new tab of *that* window. Clicked in the speaker view, that is you checking a source while the projection stays where it was. Clicked in the projection, the page opens in front of the audience.

**The small QR-code symbol after the link is the second way**: it puts the address on both screens, large, with a scannable code beside it, so people can open the link on their own phones. Click the address to open it anyway; `Esc` or the next slide clears it. `Shift`-clicking the link itself does the same.

Try it on this one: [the group behind the tool](https://psi.uni-bamberg.de/). The symbol is what you want while an audience is watching.

The codes are drawn when the lecture is built, one per external address in the source. `style: {link-codes: off}` leaves them out.

# Finding content {#finding}

## principle: A talk rarely runs in the order you planned | so any slide has to be one move away {.standard #jumping}

**A question from the audience can send you forty slides back, and the back arrow is too slow for that.**

**Four keys reach any chunk directly.** Which one you want depends on what you still remember about the slide, and none of them passes through the chunks in between.

- Roughly **where it sat** – the overview board, `O`.
- Its **number** in the corner – go to, `G`.
- Which **part of the lecture** – the contents list, `T`.
- A **word that was on it** – search, `/`.

## free: Open the overview board | `O` zooms out so you can see every slide at once {.standard #overview}

**Press `O` now** – the letter O, not the digit zero, which resets the zoom instead. The view zooms out to show every chunk at once, laid out in its columns, with an outline round the one you were on.

- **Drag** to pan the board, **wheel** to zoom it.
- **Click** a slide to go there – one click both picks it and leaves the board.
- **Arrow keys** move the outline without landing, and the board follows, because the slide you want is often off screen.
- `O` again or `Enter` **lands** on the outlined slide; `Esc` leaves without moving.

The board shows the shape of the lecture, which is usually enough to find the part you want. With a speaker window open, both windows enter, pan, zoom and leave together.

## free: Go to a slide by its number | `G`, the digits, `Enter` {.standard #goto}

**The number in the corner of a slide is an address: press `G`, type it and press `Enter`, and you are there.** It is the number a question from the audience names – “back on slide 14” – so it is the quickest way to answer one.

It works in either window, and the other follows. A number the lecture does not have shakes the prompt and keeps your digits, so you can correct them; `Backspace` takes a digit back and `Esc` closes the prompt without moving.

## free: Open the contents list | `T` lists the lecture's columns {.standard #toc}

**`T` shows a list of every named column.** Click an entry to jump there; `T` again closes the panel.

A column with no `{#id}` does not appear – the unnamed opening column that holds the title slide stays out of the list. The `{#id}` is also what a cross-reference points at: a `[text](#some-id)` link anywhere in the body finds it.

## free: Search | `/` lists every slide that mentions a word {.standard #search}

**Press `/` from anywhere – you do not have to be in overview first.** A panel opens and every slide whose heading or body contains what you type is listed with the sentence it matched, the term highlighted.

`↑` `↓` pick a result, `Enter` or a click goes there, `Esc` closes without moving. If you opened the search from the overview board, the board follows your pick as you move down the list, so a match on the far side of the lecture comes into view while you are still choosing.

Search is what you want when you remember a topic but not which slide it is on. It reads the whole chunk, so a word that appears only in a sentence the projection never shows still finds its slide.

# What goes on the slide {#on-screen}

## principle: The audience and the reader need different amounts of text | written once, cut two ways {.standard #two-modes}

**A slide readable from the back of a hall holds a handful of lines, but a student revising for the exam – or you, teaching the course again next year – wants the explanation there was no room for.** That second thing is what a lecture script is, and writing it separately means writing everything twice, in two copies that disagree by the second edit.

**So there is one text, and every chunk is both versions of it at once.** You write the argument in full; the projection shows a cut of it and the printed document shows all of it.

## definition: One chunk, two versions | `C` switches between them {.wide #c-key}

**This chunk has more text in it than the slide is showing you: press `C` and the rest appears, press it again and it goes.** Nothing was added – it has been in the source all along, and `print.html` has shown it from the start.

**The projection opens in the short version**, because that is the one the audience reads. The long one is for rehearsing, for looking something up mid-talk, and for whoever reads the lecture afterwards.

**The cut shortens prose only: a list, a figure, a code block or a formula goes up whole in both versions.**

**Which of those sentences survive is decided per chunk, and you choose how.** Either psi-slides works it out from your prose, or you mark the slide yourself. The next three chunks show both.

::: pulse
What does `C` switch in the projection, and what does the short version never shorten?
---
It switches a chunk between its short version and its full text. The cut
shortens prose only: a list, a figure, a code block or a formula goes up whole.
:::

> note: This is the chunk to demonstrate `C` on, because the paragraph the audience cannot see is the one saying that a paragraph is being hidden.

## free: Option 1 – the default | the slide is worked out from your prose: first sentences, plus the bold phrases {.wide #derived-mode}

**Unless you say otherwise, the slide is the first sentence of every paragraph plus any `**bold**` phrases from the rest.** This chunk is written that way – press `C` twice and watch what appears and disappears.

It asks two things of you. Every paragraph has to **open with a sentence that stands on its own**, because that sentence is the slide. After it, **a bold phrase becomes a bullet of its own, so it has to read as one**. Everything unbolded is for `print.html` and `print-notes.html`.

The two bullets above are that rule applied: neither is a list in the source – each is a `**bold**` phrase inside a sentence the projection is holding back.

**Bold selects, it does not stress.** A bullet is set like the sentence above it, and **one word inside a bold phrase is stressed with `*em*`, like *this* one**. On paper the phrase is printed bold. The decoration lecture shows how to change either look for a whole lecture.

That suits a chunk that argues, where every paragraph has a point to open with. It is the wrong fit when the chunk wants continuous explanation instead, and the next chunk shows the alternative.

> note: If the shortened version of a chunk reads as a pile of cryptic one-word bullets, the fix is fewer bolds and a stronger first sentence, not a different mechanism.

## free: Option 2 – explicitly set by you | you mark which block is the screen {.wide #explicit-mode}

::: slide

- **`::: slide`** marks the block that is the screen. Everything else in the chunk is what you say.
- **`::: script`** does the reverse: the chunk is the screen, and only the marked block is what you say.
- Neither marked block is ever shortened, however long it runs.

:::

You are reading the projector version of this chunk: the bullets above sit inside a `::: slide` block and this paragraph does not. Press `C` and this paragraph appears; press `C` again and it goes away.

Use `::: slide` when the slide wants tight bullets while the argument wants prose. A chunk with neither block behaves exactly as Option 1 does, and the next chunk shows the other half of Option 2.

> note: The word budget the checker enforces counts only the on-screen half. What you say is unbudgeted, so write as much of it as the argument needs.

## free: Option 2, the other way round | `::: script` marks the narration instead {.wide #script-mode}

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

## free: The long version has tools for its reader | contents, highlights and notes in `print.html` {.wide #reader-tools}

**`print.html` and `print-notes.html` are what a student reads after the lecture, so on a screen they come with a few tools.** Press `P` and try them on this tour.

- **A contents sidebar** lists every slide by part and marks the one you are reading.
- **Select words and press the button at the end of the selection** to highlight them, with a note if you want one. A figure, a code block or a formula has a button in its corner that marks it whole.
- **`n` and `p` step through your highlights**, and a counter in the corner says how many there are.
- **The menu at the foot of the sidebar exports them** as a Markdown file and reads such a file back in.

**Highlights stay in the reader's browser and nobody else sees them.** They are kept per lecture, so the export is the backup and the way to take them to another machine. Printed, they come out yellow, with each note in the margin. `reader: off` in the frontmatter ships the two documents without any of this.

> note: Not to be confused with annotations (`N`), which are the lecturer's, shown to the room, and can be written back into the source. A highlight belongs to one reader and never leaves their browser.

# The chunk vocabulary {#vocabulary}

## principle: Chunk types {.wide #grammar}

**Only the `{#id}` is required, and a chunk written with no type counts as `free`.** The type, the sub-heading and the width are all optional.

- **The line is** `## type: Heading | Sub-heading {.width #id}`.
- **The eleven types:** `title`, `closing`, `outline`, `principle`, `statement`, `definition`, `example`, `question`, `figure`, `exercise`, `free`.
- **`{.width}`** is `narrow`, `standard`, `wide` or `full`, and defaults to `standard`.
- **`{#id}`** anchors links, the contents list and your reading position – rename one and those need fixing too.

::: expand the classes that are not widths
**`{.bare}` and `{.center}` act on the projection alone.** `.bare` keeps the heading off the slide while leaving it in the printed views and in the search index; `.center` sets the chunk on a centre axis – its heading, its own paragraphs and its footnotes, but nothing nested inside a pane, a card or a list – which is what the slide with the four-outputs drawing does under its figure.

**Four more change a lecture-wide setting for one slide only**, such as `{.blocks-left}` on the formula slide in *Authoring layouts*. Unlike the two above, they apply to the printed document as well.
:::

> note: The details sit in a list rather than in follow-up paragraphs because the projection cuts a paragraph down to its first sentence and keeps a list item whole. Anything the audience has to read in full belongs in a bullet.

## definition: What the type is for | a word budget, a label in the document, a line over the heading {.wide #tag-effects}

**The type changes little on the slide and never sets the width – that is the `{.width}` class. For most types it does three things.**

- **It caps how many words the chunk may carry**, from 80 for a principle to 350 for an exercise; `node lint.js` reports one that runs over.
- **It labels the chunk in the printed views**, in small capitals over the heading. The projection prints only `EXERCISE`.
- **It adds a small mark.** This chunk is typed `definition`, hence the hairline above its heading; a `principle` gets a short rule there.

Four types work differently: `title`, `closing` and `outline` each draw a whole slide, and `statement` wears no label and no mark – the next slide is one.

Picking the wrong type is not an error; it shows on the overview board, where a principle typed as an example stops standing out.

::: expand The word budgets
**The budget per type:** `principle`, `question` and `statement` 80 words, `definition` 200, `example` and `free` 250, `exercise` 350, `closing` 60, `outline` 40. `title` and `figure` have no limit.

Counted against the on-screen half only, so narration inside a `::: script` block is unbudgeted. `free`, `figure` and `statement` are the three types that print no label. `node lint.js` is the checker that comes with the tool, and the last part of this tour is about running it.
:::

## statement: A slide can be three lines and nothing else. {.wide #statement-type}

Type it `statement:`, and the heading is the first of those lines.

---

Every paragraph under it is another line, at the same size and in the same ink.

---

A `---` between two of them is one press.

---

*A paragraph all in italic is the quiet line.*

> note: This is the type that says “no”. No eyebrow, no rule above, no first-sentence derivation – whatever is written here is what the room reads, whole. `{.center}` moves the whole run onto a centre axis, heading included; on this type alone the class reaches the heading, because here the heading is one of the lines. The budget is 80 words, a principle's.
>
> The last line is the type's quiet register: a definition standing over the claim it qualifies, or a source under it. The paragraph has to be *entirely* in italic – a line with one emphasised word in it stays loud and carries a stress mark, as `*em*` does everywhere else.

## exercise: Try the vocabulary | three edits, with `--watch` running {.wide #try-tags}

**Open `lectures/tutorial/source.md` with `--watch` running and change three things.** Every save rebuilds the lecture and reloads every open tab, so keep the projection, the lectern view and your text editor visible at once.

::: cols 2

1. Change this chunk's type from `exercise` to `principle`. The label above the heading changes, and `lint.js` starts complaining: the budget has dropped from 350 words to 80.
2. Wrap the list in a `::: slide` block, then press `C` here. Everything else leaves the screen.
3. Add a `> note:` line under the heading, then look at the notes pane in the speaker view and at `print-notes.html`.

:::

> note: Watch mode picks a free port and adds a small reload script to each output. An ordinary build adds none.

# Speaker cockpit {#speaker}

## principle: The audience and the speaker need different screens | one file, two windows {.standard #two-screens}

**What helps you through a talk – the notes, the clock, the slide that comes next – is exactly what the audience must not be shown.** Putting any of it on the projection spoils the slide, and leaving it out means presenting from memory.

**So the lecture opens twice, out of the same file.** One window is the projection and the other is your lectern screen, and the two keep each other in step with no server between them.

## free: Speaker view | the second window, the one `S` opens {.wide #speaker-s}

**The speaker view, or *cockpit*, is your lectern screen, in four bands.** Press `S` here if you have not already – it opens `speaker.html` as a second window, and from then on the two windows talk to each other directly.

::: cols 2

**From the top edge downwards:**

- **A row of dots**, one per chunk in the column, each of them clickable.
- **A copy of the projection**, laid out identically and at the same zoom.
- **A notes pane** under it, which you can type into, and which folds away when the chunk has no notes.
- **A strip of slide thumbnails** you can scroll and click.

**The two windows stay in sync: they show the same slide, at the same point in it.** Which chunk you are on, how much of it is uncovered, your annotations, the theme, the font, the zoom, which expansion is open, the overview board, the opened figure and the laser pointer are all synchronised. `V` freezes the projection so you can read ahead without the audience following; unfreezing brings the audience to wherever you got to.

:::

## free: Before the talk starts | the start menu, and `W` for fullscreen {.wide #start-menu}

**Open `audience.html` and the first slide carries a small menu in its bottom-left corner: *Fullscreen*, *Speaker cockpit* and *Print view*, each with its key – `W`, `S` and `P`.** They are the three things you do before a talk, there for the day you have not learnt the keys yet. The first move through the lecture folds it away, and so does its own `‹`; the `›` beside the `?` brings it back.

**`W` puts the projection into fullscreen, and a second `W` takes it out.** Pressed in the speaker view, `W` is meant for the projection, but a browser lets a window go fullscreen only in answer to a click or a key pressed in that window – so the projection shows a hint, and your next click on it enters fullscreen. `Shift`-`W` puts the speaker view itself into fullscreen, for a talk given from one screen.

## free: Arranging the speaker view | resizing the panes, and where the thumbnails sit {.wide #cockpit-layout}

::: slide

- **`Shift`-`V`** moves the thumbnail strip between the bottom edge and the right edge.
- **Drag the hairline bar above the notes** to resize the notes pane. The slide above rescales to fit.
- **Drag the bar along the edge of the thumbnail strip** to resize that too, in either position.
- **Double-click either bar** to go back to the automatic size.
- **The `−` and `+` in the corner of the notes** scale the notes text, separately from the pane height.
- **`?`** opens the full reference. The footer has buttons for all of these.

:::

The notes pane sizes itself: up to three lines of text, one line once you have emptied it, and folded away entirely on a chunk that has no notes. Once you drag it, the height stays where you put it and is remembered across lectures and reloads. The slide above gives up exactly the space the notes take, so the copy of the projection keeps the projector's proportions instead of stretching.

Put the thumbnails down the right-hand side if the screen has width to spare: they get larger and their text becomes readable, so you can read ahead in the strip instead of only reading your position off it. The strip's height and its width are remembered separately.

## free: Two kinds of note | one the audience sees, one only you see {.wide #notes-vs-annot}

**An *annotation* is public, *speaker notes* are private.**

::: side

**`N` in either window writes an annotation on the chunk you are on.** While you type, the note is the slide: it fills the frame, a single word stands large and centred, several lines stand as a block, and an address in it gets a QR code the room can scan. Whatever you write appears in the other window as you type it, and `Esc` leaves it beside the text as a margin note. Use it for the things a talk produces: the word that turned out to be missing, a question from the audience, a correction, a link.

Annotations are kept in the browser, one set per lecture. `Shift-E` in the speaker view copies all of them to your clipboard as `> annot:` Markdown; paste that under the matching chunk heading in `source.md`, run `node build.js <source.md> --integrate-annotations`, and the text becomes permanent – already in the typing box next time, and printed under the chunk in `print.html` and `print-notes.html`.

> annot: The `> annot:` block you are reading in `print.html` and `print-notes.html` came out of a previous run of exactly that; the typing box above starts filled with this text.

::: flip

**`Shift-N` in the speaker view opens the private notes pane** below the slide. This one is yours alone and never reaches the projection. It arrives filled from the `> note: …` lines in the source; anything you change during the talk overrides that text and is kept in the browser, per chunk.

If the pane is folded away because this chunk has no notes, the `+ note` button in the corner of the slide does the same as `Shift-N`.

`print-notes.html` is the third place the same text appears: the document with every `> note:` folded in under its chunk. That is the file to hand out when you want what was on the slide plus what the lecturer said.

:::

::: pulse
Who sees an annotation, and who sees a speaker note?
---
An annotation (`N`) is public: it appears in both windows and, once integrated
into `source.md`, in both documents. A speaker note (`> note:`) is private: the
speaker view and `print-notes.html` show it, the projection never does.
:::

## free: Your notes as cue cards | `K`, and what to write so it reads from the corner of an eye {.wide #cue-cards}

**A talk with a written-out script and minimal slides needs the script where you can glance at it.** `K` in the speaker view rearranges the window: your notes for this chunk as cards down a rail, the projection small in the corner, the clock in the header. `Space` says the next card; when the cards of this beat are said, it clicks the projector, and the clicks stand in the same column as diamonds, so you read one list from top to bottom. `Backspace` takes one press back, whatever it was. `Enter` skips to the next slide.

> note: The slide has opened. **Three beats on this chunk**, and the cards of the first stand above the first diamond.
>
> #### What to bold
> **The words you want to see**, not the ones you want to stress. This card has a title; the one above has none.

---

**A paragraph in a `> note:` is a card, and its bold phrases are the bullets.** Bold the words you want to see, not the words you want to stress. A paragraph with no bold shows whole, in smaller type. A `#### Title` above a paragraph titles the card, and `@12:30` on it is when you meant to reach it: the drift stands beside the clock.

> note: @0:30 **Second beat.** This note was written under the first `---` in the source, so it arrives with the second segment. The mark at its start puts the drift beside the clock.

---

**Where the note stands is when it is said.** A note before the first `---` belongs to the beat the slide opens on, a note after it to the beat that `---` opens. Open the speaker view on this chunk, press `K`, and walk it with `Space`: the cards under each diamond are the notes written under the matching `---` in the source. A chunk whose notes all stand at its end, below the last of its text, shows them all on the first beat.

> note: **Third beat**: the last card, and the next slide is what is left.

## free: Changing how the lecture reads | `C` `F` `A` and zoom {.wide #knobs}

**Single keys change how the lecture reads, and each one applies to both windows at once.**

- `C` switches between **what the audience sees and the full text**.
- `F` cycles the **font**: serif, then sans, then monospace, for legibility across a room.
- `A` cycles the **theme**: four light ones with different accent colours, a neutral dark one, and two green-and-amber terminal ones.
- `+` `-` `0` set the **text size**; `#` cycles **auto-fit** through its three modes, which is worth trying right here – this chunk is longer than the screen.
- `B` **blanks the projection**.
- `D` **puts a live demo on the projection**: a window or a screen of this machine, chosen in a picker, until `D` again. The very first capture on a Mac fails while macOS asks for screen-recording rights – allow it and press `D` again, so do that once before the talk.
- `L` cycles the **slide numbers**: in a row (the default), stacked, or off.
- `M` shows or hides the **`+ note` button** in the slide's left gutter – the hint for `N`, which opens an annotation whether the hint is drawn or not.

`Shift` with `C`, `F`, `A` or `L` goes backwards. `#` has three modes and no `Shift`, because it is a shifted key on some keyboards and an unshifted one on others. Font, theme, slide numbers and the note button are remembered for every lecture you open, so the preference follows you; zoom and the `C` setting are not remembered beyond the talk you are giving.

## free: The same controls without a keyboard | the toolbar on a phone or tablet {.wide #knobs-touch}

**On a phone or a tablet with no keyboard, both windows show a small toolbar along the bottom edge.** Forward, back, overview and zoom sit on it; `C`, `F`, `A`, `#`, the search and text selection are behind its `⋯` button. Attach a keyboard and the toolbar goes away again, because the keys are back.

## free: A key you have forgotten | `Cmd`-`K` runs any command by name {.wide #palette}

**`Cmd`-`K` – `Ctrl`-`K` off a Mac – opens the `?` panel with the cursor in its search field, and that turns the reference into a command palette.** Type a few letters of what you want – *theme*, *blank*, *fullscreen* – and the list narrows to the commands that match.

`↑` and `↓` pick a row, and `Enter` or a click runs it, exactly as its key would have. That is the answer mid-talk to a key you cannot remember, without reading the whole reference in front of the audience. It works in both windows.

## free: What the keys remember | themes, the two zooms, auto-fit and blanking {.wide #knobs-modes}

**Dark mode follows your machine unless something says otherwise.** If you have never pressed `A` and the lecture pins no theme, a machine set to dark opens the lecture dark. Press `A` once and your choice is remembered from then on, everywhere. An author who writes `theme:` in the frontmatter overrides both, by the same rule as the other opening settings.

**The two `C` modes keep separate zoom levels.** The short version holds whatever size you set with `+` and `-`; the full text picks its own so the whole chunk fits the screen, and switching back restores yours exactly.

**`#` cycles auto-fit through three modes, and the middle one, *shrink*, leaves your zoom where you set it and only makes a slide that is too big fit.** So the audience reads one size all hour, except on the slides that would otherwise run off the bottom. *Full* sizes every slide to the screen, growing a short chunk as readily as shrinking a long one, which suits a lecture whose chunks vary a lot. *Off* is neither.

**While the audience sees black, the speaker window keeps everything.** The slide, the notes and the thumbnails stay where they were, so you can move on or read ahead with nothing showing. A small `BLANK · hit B to toggle` marker sits at the bottom of the speaker window, or at the bottom of the projection when there is no speaker window. `D` has the same shape: pressed in the speaker window, it opens the browser's picker there, and the window or screen you choose fills the projection while a `DEMO · hit D to end it` marker sits where the blank marker would. That is what a live demo on an extended desktop needs – the demo stays on the laptop, where the pointer is, and nothing has to be mirrored.

# Authoring layouts {#layouts}

## principle: Two decisions make a layout | a width class on the heading, and `:::` blocks in the body {.standard #layout-axes}

**A layout is two independent decisions: how wide the chunk is, and how its body is arranged inside that width.** The heading picks one of four widths – `{.narrow}`, `{.standard}`, `{.wide}`, `{.full}` – and `:::` blocks in the body do the rest. A fifth word, `{.bleed}`, is not a width for text: it gives the whole frame to one drawing, and the decoration lecture shows it.

**A `.wide` chunk with a `::: side` body is the usual shape for a figure with commentary beside it.** The width is the decision about the slide, and the blocks work inside it.

## free: Text across two columns | `::: cols 2` and `::: cols 3` {.wide #cols-demo}

**`::: cols 2` (or `cols 3`) flows the body across that many columns, the way a newspaper page does.** Use it when several short paragraphs read better side by side than stacked – a list of features, a brief comparison, two or three parallel definitions.

::: cols 2

**Left column.** The browser balances the columns for you: it fills from the top and breaks wherever the text allows. Do not put one long paragraph here, or one column fills and the other sits empty. Several short blocks work best.

**Right column.** This block is the third paragraph in the source, which is why it landed on the right – the text runs down the first column and then wraps into the second. In `print.html` and `print-notes.html` the columns become one ordinary sequence of paragraphs.

:::

**Columns fold to one while the slide is short** – press `C` here and the two above stack. Shortened, each paragraph is down to its opening sentence, and a browser will not split a paragraph across columns, so two single sentences of different lengths do not balance. The full-text mode brings them back, and so do `print.html` and `print-notes.html`.

**Revealed segments – the `---` lines that uncover a chunk a piece at a time – work inside `::: cols`**, but text uncovered piecemeal while it also flows across columns is hard to follow: pick one or the other.

## free: Two panes you fill yourself | `::: side` and `::: flip` {.wide #side-demo}

**`::: side` makes two panes side by side, and `::: flip` marks where one ends and the other begins.** Unlike `cols`, you decide what goes where: everything before `::: flip` is the left pane, everything after it the right. Use it for a figure with its commentary, or for a before-and-after pair.

::: side

**Left pane.** Write `::: side`, then the left content, then `::: flip`, then the right content, then `:::` to close. The two panes are equal halves unless you say otherwise, so neither side takes over the slide.

::: flip

**Right pane.** A figure usually goes here with the text on the left. On the projection, click either pane to open it large; `print.html` and `print-notes.html` stack the two panes one above the other, so neither is lost.

:::

**Code in a pane needs short lines.** A code block never wraps, and a pane holds about half the line a block across the slide does. A longer line is not cut off: the projection shrinks that one slide until it fits, and the slide then reads smaller than the ones either side of it. Break the line, or put the code across the full width and keep the panes for prose.

## free: Marginalia | `::: marginalia` puts an aside in the slide margin {.standard #marginalia-demo}

**`::: marginalia` sets an aside out to the right of the chunk**, past the edge of the text column and into the slide's margin.

::: marginalia

This whole block sits in the slide margin, small and grey. Use a marginalia for a tangent that belongs with the chunk but would crowd the main text – an aside, a citation, a pointer to another column.

`print.html` and `print-notes.html` set marginalia under the body as indented asides, so the reading copy keeps every word.

:::

**A marginalia is the one aside you can click: the frame slides right until all of it is on screen.** A figure or a block of code opens in a card in the middle of the screen; a marginalia gets no card. **`Esc`, or a click on the slide, moves the frame back.** Try it on the block out to the right, the part of it the edge of the screen has cut off.

The body stays in the middle column and only the marginalia moves outward. Keep them short: a marginalia shares the chunk's height and cannot grow taller than it. One can also go *inside* a `::: side` pane, when a tangent belongs to one half in particular – it still goes to the slide's right margin.

## free: Footnotes | `::: footnote` is a small note under the chunk {.standard #margin-demo}

**`::: footnote` puts a small grey note under the chunk, labelled and always visible** – down in the flow of the text rather than out at the side. No button, no separate panel, nothing to click.

::: footnote
This is a footnote. The label above it reads NOTE in English (`labels:` or another `lang:` changes the word), and the note sits in grey under a dotted rule. Unlike a marginalia it stays in the middle column, under the body it was written beneath.
:::

**A marginalia goes out into the margin and can be brought to the centre with a click; a footnote stays under the chunk and is read where it stands.** Use `::: footnote` when the extra material is short and you want it on the page every time, and for `::: expand <label>`, the chevron button from earlier, when it should stay behind a button until somebody asks.

## free: Images | `![Caption](fig-id)` resolves against `assets/` {.wide #images}

**Write `![Caption](fig-id)` and the build looks in `assets/` for `fig-id.svg`, `.png`, `.jpg`, `.jpeg`, `.gif` or `.webp`, taking the first it finds.** No folder, no extension. Writing the path out in full still works when you need it.

::: side

**Whatever you write in the square brackets becomes the caption under the picture.** The one beside this paragraph is `![An abstract dusk skyline](dusk)`, and the small grey line under it is that text – which is also the image's alt text, so a screen reader reads the same words. Leave the brackets empty and the picture stands on its own. On a `figure:` chunk whose heading already says what the picture is, a caption stacks two labels, so the checker warns and suggests leaving the alt text out.

**A drawing saved as SVG is written into the page as artwork**, not as a picture file, so it takes its colours from the theme and changes with the `A` key. Photographs, and pictures like this skyline that carry their own colours, are embedded exactly as they are.

::: flip

![An abstract dusk skyline](dusk)

:::

**As long as your pictures are small, the build puts them inside the HTML, so the whole lecture stays one file.** The chevron has the limits, and what happens to a picture over them.

::: expand When a picture is too big
**The limits are 2 MB for one picture and 10 MB for all of them together.** Under those, every picture is embedded without your asking. Over them the build stops, rather than quietly leaving the file outside – where it would show as a broken figure the moment the HTML arrived somewhere without its `assets/` folder.

**`node build.js <source.md> --optimize-images` converts the files over the limit to WebP in place**, which on real lecture assets comes out at 12 to 18 percent of the original with no visible loss. `--no-inline-images` is there if you do want the files kept outside.

It keeps the picture's dimensions, unless WebP alone leaves it over 2 MB: then it scales the picture down to 2560 pixels wide. `--max-width` caps the width of every picture it converts, for a file that is still too large after that.
:::

::: pulse
One picture in `assets/` is 3 MB. What does the build do, and what is the usual fix?
---
It stops, rather than ship a file whose figure breaks the moment the HTML travels
without `assets/`. `--optimize-images` converts the picture to WebP in place,
which usually brings it well under the 2 MB limit.
:::

## free: Video | `![](clip-id)`, the same shorthand an image uses {.wide #video}

**Drop `clip.mp4` into `assets/` and write `![](clip)`** – the same shorthand an image uses. The build looks for video files after image files, so an id that has both a still and a clip behind it gives you the still.

![](reveal-demo)

That player is a real clip embedded in this HTML file, a pan across the overview board. Press play, then check the address bar – nothing was fetched.

**Play, pause and seeking are shared between the windows**, so you can operate the clip at the lectern and the projection follows; freeze the projection first and it does not, which is how you check a clip before showing it.

::: expand Size, and clips on a server
**A clip goes inside the HTML up to a limit of its own, 12 MB**, well above the 2 MB a picture may take.

**Over that limit the clip is stored beside the file**, in a `videos/` folder next to the output. The build says so on the terminal and suggests an `ffmpeg` line that would make it small enough to go inside – one named folder to copy along with the HTML. So is a clip that would take the deck's pictures and clips together past 10 MB; `--inline-images` puts each one inside up to its own limit.

**A clip can also live on a web server:** `![](https://host/clip.mp4)` stays an ordinary player, still synchronised between the two windows. The player's own button is the fullscreen control, and a click on a clip does not open it in a card, which would fight the play button.
:::

## free: Hosted players | `::: embed` for YouTube and Vimeo {.wide #embed}

**A hosted player is written as `::: embed`, and a bare link never becomes one.** This is the only thing you can write that makes a lecture fetch from somebody else's server while you are teaching, so you say so in the source:

```markdown
::: embed https://www.youtube.com/watch?v=aqz-KE-bpKQ
Big Buck Bunny, Blender Foundation
:::
```

The line under it becomes the caption. A `youtu.be/…` or a bare `vimeo.com/123` works too; anything else has to be a full `https://` address, and the build refuses what it does not recognise.

**The address is always printed under the player**, with a QR code on `Shift`-click, so people can reach the video even when the player will not run. YouTube is asked for through `youtube-nocookie.com`, and Vimeo is asked not to track.

**A lecture with a hosted player no longer contains everything it needs: the machine showing it – often the lecture hall's own PC – contacts that company while you teach.** A clip in `assets/`, or an `.mp4` address on a server you control, needs no other server. The build tells you which of the two you have chosen.

::: expand What the directive does, and YouTube from disk
- **Nothing loads until you get there**, and nothing starts by itself: arriving at the slide gives you a player waiting on its button.
- **Play and pause are shared between the windows**, as for a local clip. Freeze the projection and it stays put.
- **A player that cannot run is replaced by a card that says why.** A page opened from disk has no web address, and YouTube will not play there; Vimeo does.

To teach with a YouTube video, serve the lecture: `node build.js <source.md> --serve` prints the addresses, and `--watch --serve` adds live reload.
:::

## free: Math | `$inline$` and `$$display$$` {.wide .blocks-left #math}

**Formulas are typeset when the lecture is built, so the finished file needs nothing at the moment you show it.** Maths inside a sentence goes between single dollars – the anonymity set $S$ has size $|S|$ – and a formula on its own line goes between double ones:

$$d = \frac{H(S)}{\log_2 |S|}$$

**A formula on its own line behaves like a figure**: it stays on screen when the prose around it is shortened away, and clicking it opens it large for the audience.

**This chunk carries `{.blocks-left}`, which is why the formula starts where this sentence starts.** A code block, a figure and a display formula are centred by default, and `style: {blocks: left}` says otherwise for a whole lecture. Centred suits a slide where the block is the point; on a slide that argues with a formula inside it, a centred formula stands apart from the sentences around it. Maths inside a sentence follows that sentence: it is on screen when the sentence is, and cut away with it otherwise.

**A lone dollar sign is safe.** The delimiters are read as Markdown, not searched for in your text, so `$PATH` inside code, a price of $5 and $10 in prose, and a `$$` inside a code block are all left alone. Write `\$` if you want to be explicit.

**Only the mathematical typefaces your formulas use are embedded in the file, and a lecture without formulas carries none.** The build prints how much they added.

**The maths follows the `F` key.** Switch the body font to sans or monospace and the formulas change with it instead of staying serif while the text around them changes. Only the letters change: operators, relations and brackets keep their own shapes, and a character the sans face does not have falls back to the mathematical one. The projection carries a few extra faces for this; the printed document has no `F` key and does without them.

> note: A malformed formula does not stop the build – it is drawn in red, so a typo never blanks the projector mid-lecture. The terminal reports it, and `lint.js` warns about a `$$` you forgot to close.

# Writing chunks that work {#craft}

## principle: How to write a chunk that works | one paragraph per point, and the first sentence of each is the slide {.wide #topic-sentence}

**A chunk that works is written one paragraph per point, because the projection shows the first sentence of every paragraph and nothing after it.** It is not one topic sentence per chunk. It is one per paragraph, in the order you wrote them, plus whatever you set in bold.

**There are two ways to write such a chunk, and both end in the same place:**

- **Prose first.** Write the argument as paragraphs, then sharpen the opening sentence of each until it states that paragraph's point on its own.
- **Outline first.** Write the opening sentences as an outline of the argument, then write the paragraph under each one.

**Whichever way, each opening has to be a claim that survives having its paragraph taken away.** Everything after it is the supporting text, which appears in `print.html` and `print-notes.html` and never on the projection.

**Every thought the argument depends on, and every explanation it needs, starts a paragraph of its own.** Two of them sharing a paragraph means the second one never reaches the audience, however well it is written.


> note: The short view doubles as a rehearsal test: if it would not remind you what you meant to say, the chunk is not finished. Present this one from the short view while you say it – the audience can see that the slide is the same text as the hand-out.

## example: What breaks a shortened chunk | bold as a label, bold on one word, a weak opening, substance after a colon {.wide #anti-patterns}

**Most chunks that read badly on the projector fail in one of four ways.**

::: slide

- **Bold used as a label.** `**Consequence:**` shortens to a bullet reading “Consequence” and nothing else. Put the claim inside the sentence.
- **Bold on one word.** A lone `**not**` becomes a cryptic bullet. Bold a phrase that stands alone, or bold nothing.
- **An opening that only connects.** “That was deliberate.” carries no claim. Say the thing itself in the first sentence.
- **The substance after a colon.** If it sits after a colon at the end of the opening sentence, the cue dangles. Rewrite as one sentence.

:::

All four read fine inside a paragraph and fall apart the moment the paragraph is taken away, so they show up when you walk the lecture once in the short view before you teach it.

When several parallel items pile up inside one paragraph, write a real Markdown list instead of scattering bold through the prose. A list stays readable when it is shortened; a paragraph with bold scattered through it falls apart.

> note: The recurring temptation is to fix a weak short view by adding more bold. That is the wrong direction – fewer bolds and a stronger opening sentence is the fix.

## exercise: The squint test | `--squint` writes out what the room reads, slide by slide {.wide #squint-test}

**Run `node build.js <source.md> --squint` on your own lecture, then read `squint.txt` beside the source.** It walks the built projection press by press and writes down what each slide shows: the heading, the first sentences, each bold phrase as the bullet it becomes, and what arrives on which beat. The sentences the short view holds back are marked as withheld, with a word count.

**Read it as the audience would, and stop at every chunk you could not talk from using only those lines.** `--squint-out -` prints it in the terminal instead. It reads the built page rather than your source, so it shows the cut that actually happens.

**For each chunk you stopped at, ask three questions in this order:**

1. Is the opening sentence a claim, or a warm-up?
2. Would each bold phrase read as a sensible bullet on its own?
3. Is there a list hiding inside a paragraph?

**If all three answers are fine and it still reads badly,** mark the slide by hand. Option 1 holds up while a chunk is an argument of one to three paragraphs; once it wants continuous prose, a `::: slide` block is the shorter route.

> note: Worth doing once per lecture, the day before. Reading the short version is close enough to giving the talk that it doubles as a rehearsal. The file cannot see colour, contrast or anything that overlaps – for those, walk the projection itself once with `C` set to short.

# Questions for the reader {#pulse}

## principle: A document can test its reader | the question stands under the chunk it asks about {.standard #pulse-idea}

**Reading a hand-out a second time feels like knowing it, and a question is the quickest way to find out whether it is.** Trying to answer from memory also tends to keep the material longer than rereading it does.

**`::: pulse` writes such a question into the lecture source, under the chunk it belongs to.** `print.html` and `print-notes.html` show it to the reader; the projection and the speaker view leave it out, so the room sees your slides and not a quiz.

**This tour carries a few of them already.** Open `print.html` and you will find one under several chunks, this one and the next included.

::: pulse
Which of the four views show a `::: pulse` question?
---
The two documents, `print.html` and `print-notes.html`. The projection and the
speaker view leave it out.
:::

## free: Writing a question | the question, a line of `---`, the answer {.wide #pulse-write}

**Everything above the one line that is exactly `---` is the question, everything below it the answer.** Both halves are ordinary Markdown – bold, code, a list, a formula – but no `:::` block.

```markdown
## definition: Digital signatures {.wide #signatures}

A key pair: the private key signs, the public key verifies.

::: pulse
What does a signature guarantee that encryption alone does not?
---
**Authenticity and integrity**: only the key holder could have made it,
and any change to the message breaks it.
:::
```

**The question is drawn at the end of its chunk, after the speaker notes in `print-notes.html`**. Where in the chunk you write the block does not move it.

**The build refuses a block it cannot read as a question**: no `---` or two of them, an empty half, a `> note:` inside it, or a question on the `title:` or `closing:` chunk. An answer that needs a rule writes `***`.

::: expand What the reader sees, and where the answers go
**In the document the answer stays folded behind a button**, and once it is open the reader says whether they knew it. Printed on paper, each answer stands under its question. Two or more questions on one chunk become a stack the reader answers one at a time.

**The box is Pulse, a self-test service at `pulse.psi.uni-bamberg.de`, and it sends nothing until the reader signs in.** Until then the answers stay in their browser; after signing in with an email address, the questions come back by mail at growing intervals.

**Each question is filed under the chunk's id and the lecture's `title:`**, so reword a question freely but keep both once students have answered, or their progress starts over. A second question on the same chunk names its own key: `::: pulse {#signatures-verify}`.
:::

::: pulse
A `::: pulse` block contains two lines that are exactly `---`. What happens?
---
The build stops and says so: a question has exactly one `---`, between question
and answer. A rule inside either half is written `***`.
:::

# Beyond the basics {#beyond}

## principle: A figure written as text is a figure you can still change | you say what sits beside what, and the placing is worked out {.standard #drawn-from-text}

**A drawing made in a drawing tool is finished the moment you export it: it does not follow the theme, it cannot arrive a piece at a time, and a fact that changes means opening the tool again.** Written as lines in the lecture source, a figure is versioned with the prose, re-coloured with the page and revealed one beat at a time.

**What you give up is placing anything by eye.** You name the boxes and say which one sits beside which; where they actually land is not your decision.

## example: Diagrams | the figure below is five lines of source {.full #diagram}

**A `::: draw` block is a figure written as text.** The build draws it into the page: you name the boxes and say where each one goes, and the arrows between them are routed for you.

::: draw 126x38 frame 3.7x1.7
# frame, because this is a specimen and not a slide: one row of three boxes
# standing beside its own source, on a slide that also carries two
# paragraphs and a code listing. A figure box the height of a talk's would
# put half a slide of paper under it. The default is what a figure that is
# the slide wants – see the four-view drawing at the top of the tour.
box src "Sender"
box mix "Mix"       right of src gap 2.1
box dst "Receiver"  right of mix gap 2.1

edge src -> mix "encrypted"
edge mix -> dst "recoded"
:::

That drawing is these five lines:

```text
box src "Sender"
box mix "Mix"       right of src gap 2.1
box dst "Receiver"  right of mix gap 2.1
edge src -> mix "encrypted"
edge mix -> dst "recoded"
```

**The first element sits at the origin, so a simple figure needs no coordinates.** Everything after it is placed against a neighbour – `right of`, `left of`, `above`, `below` – and `gap` says how far. There is no automatic layout: an element goes where its neighbour and its `gap` put it.

## free: A figure that arrives in pieces | a `step` block advances on the same key as a reveal {.full #diagram-beats}

**Write `step` blocks and the figure changes with each forward press.** One step is one press of the same key that uncovers a segment, so steps and segments arrive in the order you wrote them and the speaker view reads ahead exactly as it does for text. Press forward twice here.

::: draw 126x72
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

**The last four lines of the block are the two steps:** `step leak` shows the logfile, and `step blame` emphasises the leak and the box it runs to. An arrow is only as visible as the two things it joins, so showing the logfile is enough to bring its arrow with it.

**The rest of the language is in [the diagrams lecture](../diagrams/audience.html)**: charts, tables, swim-lanes and protocols, every class and every word a step knows, each one drawn on a slide of its own. Click a figure there, and the button in the corner of its card opens the graphical editor.

> note: `print.html` and `print-notes.html` draw the **last** step rather than every step laid over each other, so an element a step hid stays hidden on paper.

## free: A slide can be more than a column of text | and what makes it one is not written inside the text {.wide #deco-idea}

**Write a picture into a chunk and you get a picture in the text column** – not one that fills the slide, and not three things standing side by side. What makes a slide more than that is written beside the body rather than in it.

```markdown
## free: A picture behind the words {.full #deco-picture}

::: backdrop dusk {.cover .invert}

::: overlay {.bottom-left .ink .standard}
**The backdrop fills the slide.**

This block is an overlay, set in one of nine places over it.
:::
```

**`::: backdrop` puts a picture behind the whole slide, edge to edge, and `::: overlay` sets a block of text on top of it.** Those are the lines that draw the next slide.

**[The decoration lecture](../decoration/audience.html) shows the rest, one construction per slide**: the ten covers and the closing slide, part dividers, rows of cards, docks and panels, and the type and colour of a whole lecture – the `style:` block and the typefaces.

## free: A picture behind the words | what the two blocks on the last slide produce {.full #deco-picture}

::: backdrop dusk {.cover .invert}

::: overlay {.bottom-left .ink .standard}
**The backdrop fills the slide.**

This block is an overlay, set in one of nine places over it.
:::

> note: The veil laid over a backdrop is the theme's own paper, not white, so ordinary dark text stays legible over a photograph in every theme. `invert`, which this slide uses, darkens the picture and turns the text light instead. The chunk is nothing but the two blocks on the slide before it – there is no body text.

# Next steps {#next}

## principle: Start from a talk you have already given | the text already exists, so the work left is cutting it into chunks {.standard #start-writing}

**The first lecture takes the most effort, because you are still learning the vocabulary, so start with a talk you have already given.** Its text already exists. Most of the remaining work is deciding where one chunk ends and the next begins, and the vocabulary you have just read is all you need for that.

**After that, each lecture goes through the same steps** – write the prose, sharpen the opening sentences, run the checker, read what `--squint` says the room will see, then walk the lecture once in the short view before you teach it.

## free: Read more | three finished lectures to open {.wide #read-more}

**psi-slides comes with three finished lectures. Open them, and take whatever you need out of their sources.**

::: cols 2

**1. A teaching lecture of 39 chunks: `lectures/python-intro/audience.html`.** Open its speaker window with `S` and watch the layout vocabulary you have just learned in real use, running through segments, expansions and opened figures.

**2. Every construction that puts something other than a column of text on a slide, one per slide: `lectures/decoration/audience.html`.** The covers and the credit block, the six kinds of divider, cards and rows, a backdrop whose window opens on a keypress, docks and panels – and, in its last part, the `style:` block and the typefaces.

**3. Every `::: draw` statement drawn rather than described: `lectures/diagrams/audience.html`.** Real lecture figures come first, then the vocabulary, then the grammar of a line in five slides.

:::

## free: Writing your own | `--new`, `--watch`, `lint.js` {.wide #authoring}

**These are the commands you need while writing a lecture:**

- `node build.js --new <slug>` makes a lecture folder with working frontmatter and two chunks. It builds the moment it lands on disk.
- `node build.js <source.md> --watch` rebuilds and reloads every open tab on every save.
- `node lint.js lectures/` checks what can be checked without building: unknown types, unclosed `:::` blocks, repeated ids, word budgets, too many segments, one-chunk columns, captions that repeat the heading, frontmatter keys nothing reads. `--strict` turns the warnings into failures.
- `node build.js <source.md> --squint` writes `squint.txt`: what the projection shows, slide by slide and beat by beat – the squint test from earlier.

One command is for after the writing rather than during it: `node build.js <source.md> --slides-pdf` prints `slides.pdf`, one page per presentation state, for a room where the HTML will not run or for someone who wants a deck to keep. `--print-pdf` and `--print-notes-pdf` print the two documents as `print.pdf` and `print-notes.pdf`, and the desktop app exports the same three.

A source file can switch one check off with `<!-- linter: ignore reveal-overuse, density -->` anywhere in the body. It has to be ordinary text to count: inside a code block or between backticks, as in the sentence you are reading, it is an example and not an instruction. This lecture carries a real one at the top, for `density`, and says there why.

## free: Deciding how a lecture opens | twelve frontmatter keys, and `lang:` beside them {.wide #view-defaults}

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
                        # (horizontal is the default)
print-slide-numbers: vertical
                        # the same three. Left out, it follows
                        # whatever slide-numbers says
editor: speaker         # both | speaker | none – the diagram editor
note-button: off        # on | off – the + note button in the
                        # slide's left gutter. The M key
neighbours: hidden      # dim | hidden – whether the slide
                        # before and after show through
transition: cut         # pan | cut | fade – how a slide change looks
reader: off             # on | off – the documents' contents
                        # sidebar and highlights
pitchblack: on          # on | off – the dark themes on a
                        # true black ground, for a projector
---
```

## free: The language, and which setting wins | `lang:`, and the rule for the twelve keys {.wide #view-lang}

```yaml
lang: de                # the language the lecture is written in:
                        # en, de, de-DE, fr and so on, and en
                        # when you leave it out
```

**`lang:` picks the hyphenation dictionary, and by default only the two printed views use it: a long German compound breaks at the end of a line there instead of leaving a hole, while the projection and the lectern view do not hyphenate.** `style: {hyphenate: all}` puts it into the projection too, which a German lecture at `.narrow` usually wants, and `none` takes it out everywhere. Unlike the twelve keys on the last slide, it is not a setting the reader could change: it describes the lecture.

**A key you write beats whatever the reader last chose, and a key you leave out leaves that choice alone.** So in a lecture that sets none of them, font, theme and slide numbers follow the reader from lecture to lecture.

`slide-numbers` applies to `print.html` and `print-notes.html` too, and `print-slide-numbers:` overrides it there when the printed document wants different numbering from the projection. A value the tool does not know stops the build and lists the ones it does.

**`neighbours`, `note-button` and `transition` are the ones a keynote sets and a lecture does not.** `transition: cut` lands on the next slide without the camera glide, and `fade` dips through the paper; both hide the neighbours unless you also write `neighbours: dim`. `neighbours: hidden` takes off the projection the faint slides above and below, which otherwise show where you are in the column. `note-button: off` hides the `+ note` hint in the slide's left gutter; `N` still opens an annotation, and `M` shows or hides the hint at any time, in either window.

**`pitchblack: on` is for a projector, which cannot show a dark grey as black.** The three dark themes then stand on a true black ground instead of their own dark paper, and a light theme is left as it is. It has no key: `Ctrl/Cmd`-`K`, type `pitch`, `Enter` switches it in either window, and the choice follows you from lecture to lecture like the theme.

`reader: off` ships the two documents without the contents sidebar and highlights.

> note: When you finish this tour with a first-timer, ask them what they found on their own and what they did not. That is the most useful feedback the tool gets.

## closing: That is the tour | now write your own `source.md` {#end}

Everything in this tour comes out of one Markdown file and one command, `node build.js source.md`. The four views are already sitting beside it.

> note: The tour ends in the cover composition it opened with, `masthead`, carrying its own words rather than a second copy of the title block.
