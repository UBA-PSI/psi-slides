---
title: psi-slides – a ten-step tour
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
document with your speaker notes, a projection for the room, and a lectern
view for you. A `masthead` cover leaves a field between the title along the
top and the credits along the bottom, and this paragraph is what goes in it.

# Welcome {#welcome}

> note: This lecture explains the tool by being written in it. Open the speaker view too (press S) and keep the two windows side by side – the Speaker cockpit column later on assumes it is running.

## principle: One source, four views | print, print-notes, audience, speaker all come from the same `source.md` {.standard #one-source}

**One command turns your `source.md` into four HTML files, and you write the Markdown only once.** `print.html` is a reading copy with a cover and a table of contents. `print-notes.html` is that same document with your speaker notes folded in under each slide. `audience.html` is the projection you are reading. `speaker.html` is the lectern view, carrying the notes, a strip of the slides around you and a timer.

The four differ only in what they **show you**. Nothing in the source is written for one of them and not the others.

## figure: One file in, four files out {.wide #four-views}

![](four-views)

Each of the four files carries everything it needs inside itself – the pictures, the typefaces, the styling, the code. Each one opens by double-clicking, with no web server and nothing fetched from the network, so you can send any of them to a colleague as a single attachment.

> note: The drawing above is written into the page as vector artwork rather than as a picture file, and it takes its colours from the theme. Press A a few times while this slide is up and the figure re-colours with the page.

## free: What you're reading right now | the projection, or the lectern view beside it {.wide #audience-now}

**This is `audience.html`, the projection for the room – or the same slide in `speaker.html`, if you have the lectern window open already.** One **chunk – one `##` heading in the source, with everything written under it** – fills the slide. The keyboard moves you from chunk to chunk, and the two windows, once both are open, mirror each other as it happens.

::: cols 2

**To see the other views:**

- Press `P` now to open `print.html` in a new tab – scroll through the whole lecture as a document.
- Press `S` to open `speaker.html` as a second window – that is the lectern view.
- Press `?` for the full keyboard and mouse reference. Everything below is in there too.

**The one file that produced all four** is `lectures/tutorial/source.md`. Every slide in every view came out of it. Open it in a text editor beside this window and read the two together.

:::

# Moving around {#moving}

## example: Forward and back | and `Shift` for whole columns {.standard #arrows}

**Two keys carry the whole lecture, forward and back, and holding `Shift` jumps a whole column.** A `# Heading` in the source starts a **column – a run of slides on one theme** – and each `## tag: …` under it is one chunk.

- **Forward** is `Space`, `↓`, `→`, `Enter` or `PageDown`. It uncovers the next piece of the chunk you are on; once there is nothing left to uncover it moves to the next chunk, and at the end of a column it carries on into the first chunk of the next one.
- **Back** is `↑`, `←`, `PageUp` or `Backspace`. It puts the last piece away again, and it leaves the chunk only once the chunk is back at its opening state.
- **`Shift`-`→` and `Shift`-`←` are the next and previous column**, and they work from any slide, not only from the first one of a column. `Shift`-`←` goes to the top of the column you are in first, so getting back to the start of a part and leaving it are the same key. Press forward now:

---

**Good – you just uncovered a segment.** In the source, **a line containing nothing but `---` cuts a chunk into segments**, as long as it is outside a block of code. The first one is on screen when you arrive; forward uncovers the next, back puts it away.

**A faint `⌄` at the foot of the slide says the next forward press will leave the column.** It is the one thing about where you are that the slide cannot show you by itself. There is nothing to click.

**The cockpit shows you what comes next.** With a speaker window open, look at this slide there: the segment the next forward press will reveal is already drawn in place, hatched and inside a dashed frame, so you can read ahead without the room seeing it. Only the immediately next one; the segments behind it stay hidden.

---

**One more, so you can see them chain.** Segments let you pace a dense slide during a talk instead of putting all of it up at once. In `print.html` and `print-notes.html` they run together as one flowing body, so nothing is lost on paper.

## example: Expansions | `1`-`9` or the chevron open side asides {.wide #expand}

**Some chunks have extra detail tucked behind a chevron button.** Click one, or press `1`…`9` for the n-th. This chunk has two expansions – try both.

::: expand digits-and-chevrons
**A digit opens the expansion with that number, and the same digit closes it again.** This is expansion number 1, so `1` puts it away. `Esc` closes it too, and `2` switches straight to the second one without closing this first.

In the source, an expansion is written `::: expand <label>` … `:::`. The label appears at the top of the opened pane; the chevron button itself carries a short form of it (`Ex` for an example, `Ref` for a reference, `Fig` for a figure, `?` for an answer, `!` for a warning, and `Exp` for a label it does not recognise).
:::

::: expand what-it-is-for
**An expansion is the branch you take if somebody asks.** It sits behind its button in both `C` settings, so it is never part of what the room reads by itself – the main text has to carry the argument without it.

Press `C` while this pane is open and watch the chunk behind it shorten. The pane stays where it is: it is not part of the slide either way.
:::

**`print.html` and `print-notes.html` print every expansion** as an indented aside where it stood in the source, so the reading copy loses nothing.

## example: Zoom into a figure or code block | click it {.standard #figure-focus}

**Click any figure, block of code or formula inside the chunk you are on.** It lifts into a card in the middle of the screen, with the slide dimmed behind it.

**Links behave two ways, and which one you want depends on the window you are in.** A plain click follows the link in a new tab of *that* window. Clicked in the lectern view, that is you checking a source while the projection stays where it was. Clicked in the projection, it is the page itself arriving in front of the room.

**The small QR-code symbol after the link does the other thing**: it puts the **address** on both screens, large, with a **scannable code** beside it, so the room can take the link away on their own phones. Click the address to open it anyway; `Esc` or the next slide clears it. `Shift`-clicking the link itself does the same.

Try it on this one: [the group behind the tool](https://psi.uni-bamberg.de/). The symbol is what you want while a room is watching.

The codes are drawn when the lecture is built, one per external address in the source. `style: {link-codes: off}` leaves them out.

**Hold `Alt` – `option` on a Mac – to select text.** Dragging normally pans the slide, so selection is off. Hold the key and the slide becomes selectable and the cursor changes; let go and dragging pans again. The selection survives the key release so you can reach `Cmd`-`C`, and `Esc` clears it.

Inside an opened card: drag to pan, wheel or `+` `-` to zoom, `0` to reset, `Esc` or a click to close. With a speaker window open, the projection follows which card you opened, how far you zoomed and where you panned, so what you are inspecting is what the room sees.

```python
# Click this block to zoom it. Useful when a line matters more than the slide.
def anonymity_set(observations, senders):
    return {s for s in senders if plausible(s, observations)}
```

# Finding content {#finding}

## example: Overview | `O` as in Overview zooms out so you can see everything {.standard #overview}

**Press `O` now** – the letter O, not the digit zero, which resets the zoom instead. The view pulls back to show every chunk at once, laid out in its columns, with an outline round the one you were on.

- **Drag** to pan the board, **wheel** to zoom it.
- **Click** a slide to go there – one click both picks it and leaves the board.
- **Arrow keys** move the outline without landing, and the board follows, because the slide you want is often off screen.
- `O` again or `Enter` **lands** on the outlined slide; `Esc` leaves without moving.

The board shows the shape of the lecture – where the principles are, where the figures are – which is usually enough to find the part you want. With a speaker window open, both windows enter, pan, zoom and leave together.

## example: Contents | `T` lists the lecture's columns {.standard #toc}

**`T` shows a list of every named column.** Click an entry to jump there; `T` again closes the panel.

A column with no `{#id}` does not appear – the unnamed opening column that holds the title slide stays out of the list. The `{#id}` is also what a cross-reference points at: a `[text](#some-id)` link anywhere in the body finds it.

## example: Search | `/` lists every slide that mentions a word {.wide #search}

**Press `/` from anywhere – you do not have to be in overview first.** A panel opens and every slide whose heading or body contains what you type is listed with the sentence it matched, the term highlighted.

`↑` `↓` pick a result, `Enter` or a click goes there, `Esc` closes without moving. If you opened the search from the overview board, the board follows your pick as you move down the list, so a match on the far side of the lecture comes into view while you are still choosing.

Search is what you want when you remember a topic but not which slide it is on. It reads the whole chunk, so a word that appears only in a sentence the projection never shows still finds its slide.

# What goes on the slide {#on-screen}

## principle: Two ways to decide what the room sees | derived, or stated outright {.standard #two-modes}

**`C` switches between the full text of a chunk and the shorter version the room sees.** The short version is what you start in, and it is what the projector shows during a talk; the full text is for rehearsing and for looking things up afterwards.

**Which sentences survive that shortening is decided per chunk, and you pick how.** Either psi-slides works the slide out from your prose, or you mark the slide yourself. The next two chunks show both.

## example: Worked out from the prose | first sentence of each paragraph, plus the bold phrases {.wide #derived-mode}

**Unless you say otherwise, the slide is the first sentence of every paragraph plus any `**bold**` phrases from the rest.** This chunk is written that way – press `C` twice and watch what appears and disappears.

It asks two things of you: every paragraph has to open with a sentence that stands up on its own, and the **bold phrases have to read as bullets on their own**. Everything else is for `print.html` and `print-notes.html`.

That suits a chunk that argues, where every paragraph has a point to open with. It is the wrong fit when the chunk wants continuous explanation instead, and the next chunk is the way out.

> note: If the shortened version of a chunk reads as a pile of cryptic one-word bullets, the fix is almost always fewer bolds and a stronger first sentence, not a different mechanism.

## example: Marked by hand | `::: slide` and `::: script` {.wide #explicit-mode}

::: slide

- **`::: slide`** marks the block that is the screen. Everything else in the chunk is what you say.
- **`::: script`** does the reverse: the chunk is the screen, and only the marked block is what you say.
- Neither block is ever shortened. Lists, figures and code go up whole.

:::

You are reading the projector version of this chunk: the bullets above sit inside a `::: slide` block and this paragraph does not. Press `C` and this sentence appears; press `C` again and it goes away.

Reach for `::: slide` when the slide wants tight bullets while the argument wants prose, and for `::: script` when the chunk is already slide-shaped and you only want to park a paragraph of narration beside it. A chunk with neither behaves exactly as `#derived-mode` does.

> note: The word budget the checker enforces counts only the on-screen half. What you say is unbudgeted, so write as much of it as the argument needs.

## example: A finding is already slide-shaped | so mark the narration, not the slide {.wide #script-mode}

**Three lines of a finding are already the slide.** Wrapping them in `::: slide` would mean marking almost the whole chunk, so the shorter route is to mark the part that is *not* on screen. The three below are a made-up finding, standing in for whatever yours is:

- One request in seven is answered differently once the crawler is instrumented.
- The gap is widest on the sites that serve the most third-party script.
- It closes again if the crawler waits between requests.

::: script
This paragraph is what you say, and it never reaches the projection. Press `C` and it stays away – in `#derived-mode` it would appear. Use this shape when the chunk is a finding, a figure with a caption, or a short list already the right length for a slide.
:::

> note: A chunk carrying both blocks is not an error – the slide block wins and everything outside it, the script block included, is narration. Writing both usually means the chunk wants splitting.

## question: Which of the three does a chunk use? {.narrow #which-mode}

**A `::: slide` block if there is one, otherwise everything outside `::: script`, otherwise first sentence plus bold.** Three rules, checked in that order, on each chunk separately.

::: expand answer-in-practice
**You will mix them inside one lecture.** Principles and questions are usually arguments and come out fine on their own; a long finding or a walkthrough is easier to write with a `::: slide` block round the screen half.

The tag is a fair predictor: `principle` and `question` chunks are short enough that the first-sentence rule rarely bites, while `example` and `free` chunks near their word budget are where marking the slide by hand is the shorter route.
:::

# The chunk vocabulary {#vocabulary}

## principle: Ten tags, one grammar | `## tag: Heading | Sub {.width #id}` {.standard #grammar}

**Every chunk opens with a tag that names what kind of move it makes.** `title`, `closing`, `outline`, `principle`, `definition`, `example`, `question`, `figure`, `exercise`, `free`.

The `| Sub-Heading` and the `{.width #id}` tail are both optional. Width is one of `narrow`, `standard`, `wide`, `full`, and **once you have written an `{#id}` it should never change** – it is what cross-references, the contents list and your saved reading position all point at.

The tail takes one class that is not a width: `{.bare}` hides the heading on the projection while keeping it in `print.html`, `print-notes.html` and the search index.

## definition: What a tag actually does {.standard #tag-effects}

**A tag sets how a chunk looks and how many words it may hold, never how wide it is.** In `print.html` and `print-notes.html` every tag prints its own name as a small line of capitals above the heading; `free` and `figure` are the two that do not. On the projection only `EXERCISE` is printed.

Three of the ten are whole slides rather than treatments: `title` draws the cover from the frontmatter, `closing` draws that same composition at the end with your own words, and `outline` draws the lecture's agenda wherever you put it.

The word budgets differ per tag: `principle` and `question` get 80 words, `definition` 200, `example` and `free` 250, `exercise` 350. `closing` gets 60 and `outline` 40. `title` and `figure` have no limit.

Picking the wrong tag is not an error. It surfaces later, when a principle you tagged as an example no longer stands out on the overview board.

## exercise: Try the vocabulary {.wide #try-tags}

**Open `lectures/tutorial/source.md` with `--watch` running and change three things.** Every save rebuilds the lecture and reloads every open tab, so keep the projection, the lectern view and your text editor visible at once.

::: cols 2

1. Change this chunk's tag from `exercise` to `principle`. The label above the heading changes, and `lint.js` starts complaining: the budget has dropped from 350 words to 80.
2. Wrap the list in a `::: slide` block, then press `C` here. Everything else leaves the screen.
3. Add a `> note:` line under the heading, then look at the notes pane in the lectern view and at `print-notes.html`.

:::

> note: Watch mode picks a free port and adds a small reload script to each output. An ordinary build adds none, which is why the committed HTML carries no such code.

# Speaker cockpit {#speaker}

## free: Speaker view | the other window `S` spawned {.wide #speaker-s}

**The speaker view is your lectern screen, in four bands.** Press `S` here if you have not already – it opens `speaker.html` as a second window, and from then on the two windows talk to each other directly, with no server in between.

::: cols 2

**Four bands, top to bottom:**

- **A row of dots**, one per chunk in the column, each of them clickable.
- **A copy of the projection**, laid out identically and at the same zoom.
- **A notes pane** under it, which you can type into, and which folds away when the chunk has no notes.
- **A strip of slide thumbnails** you can scroll and click.

**The two windows stay together.** Which chunk you are on, how much of it is uncovered, your annotations, the theme, the font, the zoom, which expansion is open, the overview board, the opened figure and the laser pointer all travel between them. `V` freezes the projection so you can read ahead without the room following; unfreezing brings the room to wherever you got to.

:::

## example: Arranging the lectern screen | the part everyone forgets {.wide #cockpit-layout}

::: slide

- **`Shift`-`V`** moves the thumbnail strip between the bottom edge and the right edge.
- **Drag the hairline bar above the notes** to resize the notes pane. The slide above rescales to fit.
- **Drag the bar along the edge of the thumbnail strip** to resize that too, in either position.
- **Double-click either bar** to go back to the automatic size.
- **The `−` and `+` in the corner of the notes** scale the notes text, separately from the pane height.
- **`?`** opens the full reference. The footer has buttons for all of these.

:::

The notes pane sizes itself: one line when empty, up to three when it has content, folded away entirely when the chunk has no notes. Once you drag it, the height stays where you put it and is remembered across lectures and reloads. The slide above gives up exactly the space the notes take, so the copy of the projection keeps the projector's proportions instead of stretching.

Put the thumbnails down the right-hand side if the screen has width to spare: they get larger and their text becomes readable, so you can read ahead in the strip instead of only reading your position off it. Its height and its width are remembered separately.

## example: N vs Shift-N | audience-visible vs private {.wide #notes-vs-annot}

**Two different note surfaces, one letter apart:**

::: side

**`N` in either window writes an annotation on the chunk you are on.** A typing box appears under the chunk, and whatever you write appears in the other window as you type it. Use it for the things a talk produces: a rule you want on screen, a question from the room, a correction.

Annotations are kept in the browser, one set per lecture. `Shift-E` in the speaker view copies all of them to your clipboard as `> annot:` Markdown; paste that under the matching chunk heading in `source.md`, run `node build.js <source.md> --integrate-annotations`, and the text becomes permanent – already in the typing box next time, and printed under the chunk in `print.html` and `print-notes.html`.

> annot: The `> annot:` block you are reading in `print.html` and `print-notes.html` came out of a previous run of exactly that; the typing box above starts filled with this text.

::: flip

**`Shift-N` in the speaker view opens the private notes pane** below the slide. This one is yours alone and never reaches the projection. It arrives filled from the `> note: …` lines in the source; anything you change during the talk overrides that text and is kept in the browser, per chunk.

If the pane is folded away because this chunk has no notes, the `+ note` button in the corner of the slide does the same as `Shift-N`.

`print-notes.html` is the third home for the same text: the document with every `> note:` folded in under its chunk. That is the file to hand out when you want what was on the slide plus what the lecturer said.

:::

## example: The reading knobs | `C` `F` `A` and zoom {.wide #knobs}

**Single keys change how the lecture reads, and each one reaches both windows at once.**

- `C` switches between **what the room sees and the full text**.
- `F` cycles the **font**: serif, then sans, then monospace, for legibility across a room.
- `A` cycles the **theme**: four light ones with different accent colours, a neutral dark one, and two green-and-amber terminal ones.
- `+` `-` `0` set the **text size**; `#` turns on **auto-fit**.
- `B` **blanks the projection**.
- `L` cycles the **slide numbers**: stacked, in a row, or off.

`Shift` with any of the cycling keys goes backwards. Font, theme and slide numbers are remembered for every lecture you open, so the preference follows you; zoom and the `C` setting belong to the talk you are giving.

**On a phone or a tablet with no keyboard, both windows grow a small rail along the bottom.** Forward, back, overview and zoom sit on it; `C`, `F`, `A`, `#`, the search and text selection are behind its `⋯` button. Attach a keyboard and the rail goes away again, because the keys are back.

**Dark mode follows your machine unless something says otherwise.** If you have never pressed `A` and the lecture pins no theme, a machine set to dark opens the lecture dark. Press `A` once and your choice is remembered from then on, everywhere. An author who writes `theme:` in the frontmatter overrides both, by the same rule as the other opening settings.

**The two `C` modes keep separate zoom levels.** The short version holds whatever size you set with `+` and `-`; the full text picks its own so the whole chunk fits the screen, and switching back restores yours exactly.

**`#` turns on auto-fit, which sizes every slide to the screen as you arrive on it**, in either mode, growing a short chunk as readily as shrinking a long one. `#` again takes it back. It suits a lecture whose chunks vary a lot in length, and it is wrong if you want one type size in the room all hour.

**While the room sees black, the speaker window keeps everything.** The slide, the notes and the thumbnails stay where they were, so you can move on or read ahead with nothing showing. A small `BLANK · hit B to toggle` marker sits at the bottom of the speaker window, or at the bottom of the audience view when there is no speaker window.

# Authoring layouts {#layouts}

## principle: Two layout axes | chunk widths and body directives {.standard #layout-axes}

**A layout is two independent decisions: how wide the chunk is, and how its body is arranged inside that width.** The heading picks one of four widths – `{.narrow}`, `{.standard}`, `{.wide}`, `{.full}` – and `:::` directives in the body do the rest.

Width is the decision about the slide; the directives work inside it. A `.wide` chunk with a `::: side` body is the usual shape for a figure with commentary beside it.

## example: Text across two columns | `::: cols 2` and `::: cols 3` {.wide #cols-demo}

**`::: cols 2` (or `cols 3`) flows the body across that many columns, the way a newspaper page does.** Use it when several short paragraphs read better side by side than stacked – a list of features, a brief comparison, two or three parallel definitions.

::: cols 2

**Left column.** The browser balances the columns for you: it fills from the top and breaks wherever the text allows. Do not put one long paragraph here, or one column fills and the other sits empty. Several short blocks work best.

**Right column.** This block is the third paragraph in the source, which is why it landed on the right – the text runs down the first column and then wraps into the second. In `print.html` and `print-notes.html` the columns become one ordinary sequence of paragraphs.

:::

**Columns fold to one while the slide is short** – press `C` here and the two above stack. Shortened, each paragraph is down to its opening sentence, and a browser will not split a paragraph across columns, so two single sentences of different lengths do not balance. The full-text mode brings them back, and so do `print.html` and `print-notes.html`.

**Revealed segments – the `---` lines from `#arrows` – work inside `::: cols`**, but uncovering text a piece at a time while it also flows across columns is hard to follow: pick one or the other.

## example: Two-pane grid | `::: side` and `::: flip` {.wide #side-demo}

**`::: side` makes two panes side by side, and `::: flip` marks where one ends and the other begins.** Unlike `cols`, you decide what goes where: everything before `::: flip` is the left pane, everything after it the right. Use it for a figure with its commentary, or for a before-and-after pair.

::: side

**Left pane.** Write `::: side`, then the left content, then `::: flip`, then the right content, then `:::` to close. The two panes are equal halves unless you say otherwise, so neither side takes over the slide.

::: flip

**Right pane.** A figure usually goes here with the text on the left. On the projection, click either pane to open it large; `print.html` and `print-notes.html` stack the two panes one above the other, so neither is ever lost.

:::

**Code in a pane needs short lines.** A code block never wraps, so at the default zoom **a pane has room for roughly 30 characters of code** – against about 50 in a `.standard` chunk and 60 in a `.wide` one. A longer line is not cut off; the build shrinks that one slide until it fits, and the slide then reads noticeably smaller than the ones either side of it. Break the line, or put the code across the full width and keep the panes for prose.

## example: Marginalia | `::: marginalia` escapes into the slide margin {.standard #marginalia-demo}

**`::: marginalia` sets an aside out to the right of the chunk**, past the edge of the text column and into the slide's margin.

::: marginalia

This whole block sits in the slide margin, small and grey. Use a marginalia for a tangent that belongs with the chunk but would crowd the main text – an aside, a citation, a pointer to another column.

`print.html` and `print-notes.html` set marginalia under the body as indented asides, so the reading copy keeps every word.

:::

**A marginalia is the one aside you can click.** A figure or a block of code lifts into a card in the middle of the screen; a marginalia is panned into the centre instead, because it is part of the slide's layout rather than something laid over it. Try it on the block out to the right.

The body stays in the middle column and only the marginalia moves outward. Keep them short: a marginalia shares the chunk's height and cannot grow taller than it. One can also go *inside* a `::: side` pane, when a tangent belongs to one half in particular – it still escapes to the slide's right margin.

## example: Footnotes | `::: footnote` is a quiet note under the chunk {.standard #margin-demo}

**`::: footnote` puts a small grey note under the chunk, labelled and always visible** – down in the flow of the text rather than out at the side. No button, no separate panel, nothing to click.

::: footnote
This is a footnote. The label above it always reads NOTE, and the note sits in grey under a dotted rule. Unlike a marginalia it stays in the middle column, under the body it was written beneath.
:::

**The two slides are the whole distinction**: a marginalia goes out into the margin and can be brought to the centre with a click, and a footnote stays under the chunk and is simply read. Reach for `::: footnote` when the extra material is short and you want it on the page every time, and for `::: expand <label>` (back at `#expand`) when it should stay behind a button until somebody asks.

## example: Images | `![](fig-id)` resolves against `assets/` {.wide #images}

**Write `![](fig-id)` and the build looks in `assets/` for `fig-id.svg`, `.png`, `.jpg`, `.jpeg`, `.gif` or `.webp`, taking the first it finds.** No folder, no extension. Writing the path out in full still works when you need it.

::: side

**The alt text becomes a caption.** The picture beside this paragraph is written `![An abstract dusk skyline](dusk)`, and the small grey line under it is that alt text. Leave the brackets empty and the picture stands on its own. On a `figure:` chunk whose heading already says what the picture is, a caption stacks two labels, so the checker warns and suggests leaving the alt text out.

**A drawing saved as SVG is written into the page as artwork**, not as a picture file, so it takes its colours from the theme and changes with the `A` key – the figure back at `#four-views` is one of those. Photographs, and pictures like this skyline that carry their own colours, are embedded exactly as they are.

::: flip

![An abstract dusk skyline](dusk)

:::

**Your pictures go inside the HTML by default, so that a built view travels as one file with nothing to leave behind.** That is where the limit comes from: up to 2 MB a picture and 10 MB in total they are embedded without your asking, and a picture over that stops the build rather than being quietly left outside, where it would show as a broken figure the moment the file arrived somewhere without its assets folder. `node build.js <source.md> --optimize-images` converts the offenders to WebP in place, which on real lecture assets comes out at 12 to 18 percent of the original with no visible loss. `--no-inline-images` is there if you do want the files kept outside.

> note: That command does not shrink the picture's dimensions. The heavy files are usually already at slide resolution and heavy because PNG is a poor fit for photographs. An opened figure zooms to eight times, so the extra pixels in a diagram are ones the room gets to see; `--max-width` exists for the genuine outliers.

## example: Video | a clip is a figure that moves {.wide #video}

**Drop `clip.mp4` into `assets/` and write `![](clip)`** – the same shorthand an image uses. The build looks for video files after image files, so an id that has both a still and a clip behind it gives you the still.

![](reveal-demo)

That player is a real clip carried inside this HTML file: 34 KB, showing the three stages of the navigation slide you walked through earlier. Press play, then check the address bar – nothing was fetched.

Clips go inside the file like any other asset, up to a separate limit of 12 MB. A clip is an order of magnitude heavier than a diagram, and the 2 MB picture limit would reject every real one.

**There is no fullscreen setting**: the player has its own button, and how large the clip sits on the slide is the chunk's width, as with a still picture. Clicking a clip does not open it in a card either, because that would fight the play button.

**A clip can also live on a web server:** `![](https://host/clip.mp4)` works and stays an ordinary player, so play, pause and seeking still travel between the two windows.

**Over the limit, the clip travels beside the file instead.** The build copies it into a `videos/` folder next to the output, plays it from there, tells you on the terminal, and suggests an `ffmpeg` line that would make it small enough to go inside. One named folder to carry with the HTML, instead of a path that only works on the machine that built it.

**Play, pause and seeking are shared between the windows.** Operate the clip at the lectern and the projection follows. Freeze the projection first and it does not, so you can check a clip before showing it.

## example: Hosted players | `::: embed` for YouTube and Vimeo {.wide #embed}

**A hosted player has a directive of its own, and a bare link never becomes one.** This is the only thing you can write that makes a lecture fetch from somebody else's server while you are teaching, so you say so in the source:

```markdown
::: embed https://www.youtube.com/watch?v=aqz-KE-bpKQ
Big Buck Bunny, Blender Foundation
:::
```

The line under it becomes the caption. A `youtu.be/…` or a bare `vimeo.com/123` works too; anything else has to be a full `https://` address, and the build refuses what it does not recognise.

**Four things happen that a plain embed code would not do for you.**

- **Nothing loads until you get there.** The player is pointed at the video only while its chunk is on screen, so a lecture contacts YouTube only for the slides you actually showed, and no player keeps running on a slide you have left.
- **Play and pause are shared between the windows**, as they are for a local clip. Freeze the projection and it stays put.
- **Nothing starts by itself.** Arriving at the slide gives you a loaded player waiting on its button.
- **YouTube gets a card explaining itself instead of an error.** A page opened straight from disk has no web address and YouTube refuses to play without one, so the room would otherwise be looking at “Error 153”. The player is replaced by a card telling you to serve the lecture. Vimeo plays either way.

**To teach with a YouTube video, serve the lecture:**

```bash
node build.js <source.md> --serve          # http://localhost, prints the URLs
node build.js <source.md> --watch --serve  # and live reload while authoring
```

**The address is always printed under the player**, with a QR code on `Shift`-click, so the room can reach the video even when the player will not run. YouTube is asked for through `youtube-nocookie.com`, and Vimeo is asked not to track.

**Weigh this one before you use it.** A lecture with a hosted player no longer carries everything it needs: the machine showing it – often the lecture hall's own PC – contacts that company while you teach. A clip in `assets/`, or an `.mp4` address on a server you control, keeps the two windows in step and asks nothing of anyone else. The build tells you which of the two you have chosen, every time.

## example: Math | `$inline$` and `$$display$$` {.wide #math}

**Formulas are typeset when the lecture is built, so the finished file needs nothing at the moment you show it.** Maths inside a sentence goes between single dollars – the anonymity set $S$ has size $|S|$ – and a formula on its own line goes between double ones:

$$d = \frac{H(S)}{\log_2 |S|}$$

**A formula on its own line behaves like a figure**: it stays on screen when the prose around it is shortened away, and clicking it opens it large for the room. Maths inside a sentence follows that sentence – on screen in an opening line, gone with everything else.

**A lone dollar sign is safe.** The delimiters are read as Markdown, not searched for in your text, so `$PATH` inside code, a price of $5 and $10 in prose, and a `$$` inside a code block are all left alone. Write `\$` if you want to be explicit.

**Only the mathematical typefaces a lecture's formulas actually use travel in it** – around 120 KB out of a possible 254 KB in `print.html` and `print-notes.html`. A lecture without maths carries none, and the build tells you which.

**The maths follows the `F` key.** Switch the body font to sans or monospace and the formulas move with it instead of sitting in the slide as a serif island. Only the letters change: operators, relations and brackets keep their own shapes, and a character the sans face does not have falls back to the mathematical one. The two live views pay about 46 KB more for the extra faces; `print.html` and `print-notes.html` have no such key and pay nothing.

> note: A malformed formula does not stop the build – it is drawn in red, so a typo never blanks the projector mid-lecture. The terminal reports it, and `lint.js` warns about a `$$` you forgot to close.

# Writing chunks that work {#craft}

## principle: Write the prose first, then sharpen the openings | the slide is every paragraph's first sentence {.standard #topic-sentence}

**The projection is the first sentence of every paragraph, so a chunk of four paragraphs puts four sentences in front of the room.** It is not one topic sentence per chunk. It is one per paragraph, in the order you wrote them, plus whatever you set in bold.

**So write what you mean to say first and in full, then go back and sharpen the openings.** Each opening has to be a claim that survives having its own paragraph taken away; everything after it stays where it is and becomes the backing, which reaches `print.html` and `print-notes.html` and never the projection.

**Doing it the other way round – bullets first, prose afterwards – leaves you a slide with nothing underneath it**, and an hour you have to improvise the substance of while standing in front of people.

**This chunk is four paragraphs, so its slide is the four sentences you have just read.** Press `C` and the backing under each of them appears. `#derived-mode`, back in *What goes on the slide*, is where that shortening is shown happening.

> note: The short view doubles as a rehearsal test: if it would not remind you what you meant to say, the chunk is not finished. Present this one from the short view while you say it – the room can see that the slide is the same text as the hand-out.

## example: Four ways a chunk goes soft {.wide #anti-patterns}

**Most chunks that read badly on the projector fail in one of four ways**, and each is one edit away from working.

::: slide

- **Bold used as a label.** `**Consequence:**` shortens to a bullet reading “Consequence” and nothing else. Put the claim inside the sentence.
- **Bold on one word.** A lone `**not**` becomes a cryptic bullet. Bold a phrase that stands alone, or bold nothing.
- **An opening that only connects.** “That was deliberate.” carries no claim. Say the thing itself in the first sentence.
- **The substance after a colon.** If it sits after a colon at the end of the opening sentence, the cue dangles. Rewrite as one sentence.

:::

All four read fine inside a paragraph and fall apart the moment the paragraph is taken away, so they show up when you walk the lecture once in the short view before you teach it.

When several parallel items pile up inside one paragraph, write a real Markdown list instead of scattering bold through the prose. A list stays readable when it is shortened; a paragraph peppered with bold almost never does.

> note: The recurring temptation is to fix a weak short view by adding more bold. That is nearly always the wrong direction – fewer bolds and a stronger opening sentence is the fix.

## question: Let the tool work it out, or mark it yourself? {.standard #choose-mechanism}

**Let the tool work it out while the chunk is an argument of one to three paragraphs; mark the slide yourself once the argument wants continuous prose.** Try the first and switch when it keeps fighting you.

## exercise: The squint test {.wide #squint-test}

**Open your own lecture in the audience view, press `C` until it is short, and walk it end to end without opening the source.** Stop at every chunk you could not talk from using only what is on the screen.

::: cols 2

**For each chunk that fails**, ask in this order: is the opening sentence a claim, or a warm-up? Would each bold phrase read as a sensible bullet on its own? Is there a list hiding inside a paragraph?

**If all three answers are fine and it still reads badly,** the chunk wants `::: slide`.

:::

> note: Worth doing once per lecture, the day before. Reading the short version is close enough to giving the talk that it doubles as a rehearsal.

# Next steps {#next}

## exercise: Read more | the artefacts that close the loop {.wide #read-more}

**psi-slides comes with three finished lectures. Open them, and take whatever you need out of their sources.**

::: cols 2

**1. `lectures/python-intro/audience.html`.** A 36-chunk teaching lecture. Open its speaker window with `S` and watch the layout vocabulary you have just learned in real use, running through segments, expansions and opened figures.

**2. `lectures/decoration/audience.html`.** Every construction that puts something other than a column of text on a slide, one per slide: the covers, the six kinds of divider and the three kinds of divider content, cards and rows, a backdrop whose window opens on a keypress.

**3. `lectures/diagrams/audience.html`.** The same for `::: draw`: every statement drawn rather than described, with real lecture figures among them.

:::

## free: Writing your own | `--new`, `--watch`, `lint.js` {.standard #authoring}

**These are the commands you need while writing a lecture:**

- `node build.js --new <slug>` makes a lecture folder with working frontmatter and two chunks. It builds the moment it lands on disk.
- `node build.js <source.md> --watch` rebuilds and reloads every open tab on every save.
- `node lint.js lectures/` checks what can be checked without building: unknown tags, unclosed directives, repeated ids, word budgets, too many segments, columns with only one chunk, captions that repeat the heading. `--strict` turns the warnings into failures.

A source file can switch one check off with `<!-- linter: ignore reveal-overuse, density -->` anywhere in the body. It has to be ordinary text to count: inside a code block or between backticks, as in the sentence you are reading, it is an example and not an instruction. This lecture carries a real one at the top, for `density`, and says there why.

## example: Deciding how a lecture opens | six view defaults, and `lang:` beside them {.wide #view-defaults}

**A lecture can set its own starting look instead of inheriting whatever the reader last chose.**

```yaml
---
title: Anonymous Communication
font: mono              # serif | sans | mono
theme: terminal-green   # light-{red,teal,blue,orange}
                        # dark | terminal-{amber,green}
collapse: none          # topic-bold | none     – the C key
auto-fit: true          # true | false          – the # key
slide-numbers: off      # vertical | horizontal | off
editor: speaker         # both | speaker | none – the diagram editor

lang: de                # not a view default: the language the lecture
                        # is written in. en, de, de-DE, fr and so on,
                        # and en when you leave it out
---
```

`lang:` reaches all four views. `print.html` and `print-notes.html` use it to pick the hyphenation rules, so **a long German compound breaks at the end of a line instead of leaving a hole**. The two live views never hyphenate.

**A key you write beats whatever the reader last chose, and a key you leave out leaves that choice alone.** So a lecture that sets nothing behaves as it always did – font, theme and slide numbers follow the reader from lecture to lecture.

`slide-numbers` reaches `print.html` and `print-notes.html` too. A value the tool does not know stops the build and lists the ones it does.

> note: When you finish this tour with a first-timer, ask them what they found on their own and what they did not. That is the most useful feedback the tool gets.

# Beyond 1.0.0 {#beyond}

> Everything from here on was added after the 1.0.0 release. The archive on the
> releases page was built before it, so a lecture that uses any of it will not
> build against that download.
>
> What you need is the repository itself: a clone, or **Download ZIP** from the
> project page, and the `build.js` inside it. Try all of it – it is what the
> rest of this tour is written in. The source format is frozen from 1.0.0
> onwards, so these constructions may still change before they are tagged into
> a release of their own.

## example: Diagrams | `::: draw` draws boxes and arrows from text {.full #diagram}

**A `::: draw` block is a figure you write out in the lecture source, and the build draws it into the page as artwork.** You name the boxes and say where each one goes; the arrows between them are routed for you.

::: draw {unit=126x38}
box src "Sender"
box mix "Mix"       right of src gap 1.05
box dst "Receiver"  right of mix gap 1.05

edge src -> mix "encrypted"
edge mix -> dst "recoded"
:::

That drawing is these five lines and nothing else:

```text
box src "Sender"
box mix "Mix"       right of src gap 1.05
box dst "Receiver"  right of mix gap 1.05
edge src -> mix "encrypted"
edge mix -> dst "recoded"
```

**The first element sits at the origin, so a simple figure needs no coordinates at all.** Everything after it is placed against a neighbour – `right of`, `left of`, `above`, `below` – and `gap` says how far. Nothing is arranged for you: every element sits where you put it, and that is the whole of the layout model.

## example: A figure that arrives in pieces | `step` blocks ride the reveal key {.full #diagram-beats}

**Write `step` blocks and the figure moves.** One step is one press of the same key that uncovers a segment, so steps and segments arrive in the order you wrote them and the lectern view reads ahead exactly as it does for text. Press forward twice here.

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

That is the figure from the slide before with a logfile added and four lines at the end: `step leak` shows the logfile, and `step blame` picks out the leak and the box it runs to. **The words a step knows are `show`, `hide`, `move … to`, `move … by`, the three attention verbs `emph`, `dim` and `ghost`, plus `style` and `label`.**

**Anything hanging off something invisible is invisible too**, which is why `step leak` names only the logfile. An arrow is only as visible as the two things it joins, a `container` or a `brace` only as visible as its members, and a `text` with a line drawn to something only as visible as what it points at. So showing the boxes shows the arrows between them, and most of a figure needs no `show` of its own.

> note: `print.html` and `print-notes.html` draw the **last** step rather than every step laid over each other, so an element a step hid stays hidden. Emphasis is the exception and comes from the first step, so attention you move around during the talk never reaches the paper while a `{.dim}` written on an element's own line does: written on the line it is part of the drawing, written inside a `step` it is part of the talk.

## example: Every line has the same six slots | `kind name label placement options tail` {.full #diagram-slots}

**Every line in a `::: draw` block has the same six slots, always in this order**, and most lines fill three or four of them:

```text
box   mix   "Mix"   right of src gap 0.6   w 1.2    {.tone-2 @crypto}
kind  name  label   placement              options  tail
```

**The name is how later lines refer to an element and is never drawn; the label is what the room reads**, and `""` is a legal empty one. A name is letters, digits, `_` and `-`, and a line starting with `#` is a comment.

**Inside the tail, two prefixes answer two questions.** `.tone-2` is a class, which says how the element looks, and `@crypto` is a tag, which says what set it belongs to. `{!tone-2}` with an exclamation mark takes a class off again. A tag goes wherever a name goes, so `show @crypto` in a step reaches every element carrying it, and an element joins a set on its own line – adding one to a set is a one-line edit.

## example: Where an element goes | a grid square, or a neighbour {.full #diagram-placement}

**Placement is a grid square or a relation to a neighbour** – `at 2,1`, or `right of mix gap 0.6`, or `below src gap 0 flush left` for boxes that touch. Placement also takes `between a,b`, the point on the line joining two elements, and any placement accepts a trailing `offset dx,dy`.

**A coordinate can be another element's, plus or minus a little** – `at mix.cx,src.cy+0.4`, `via iv.cx,x0.cy`. Anywhere an `X,Y` pair goes, that form goes, so moving one element does not mean retyping everything placed against it. An anchor can carry a fraction: `mix.right:0.3` slides the attachment point along that edge, so two arrows between the same pair of boxes run side by side instead of on top of each other.

**An edge is one of the things a coordinate can name.** `text n "only after the handshake" above w1 gap 0.2` sets a phrase against the wire it describes rather than against a box at one end of it, so the label follows its line instead of drifting off it the next time a box changes height. Name the edge first, in the slot before the arrow's first end: `edge w1 mix -> log`. An edge has no name until you write one, and most edges never need one.

**A picture can be an element too.** `image alice avatar-alice w 0.4` finds the file exactly as `![](fig-id)` does. An SVG drawing is written into the page itself, so it takes the theme's colours and changes with the `A` key; a photograph is embedded as it is and keeps its own colours in every theme.

::: expand The rest of the vocabulary
**There are more kinds than `box`, `edge` and `text`.** `dot` is a circle for junctions and glyphs. `container … over a,b,c` fits a box around its members and re-fits when they move, and `brace … over a,b right "Label"` is a bracket spanning a subset. `bars`, `grid` and `plot` are charts without a chart library. `table` reads its rows off the quoted lines under it and names every cell, `lanes` draws swim-lanes of equal width, and `sequence` draws a protocol down the page, deciding the vertical spacing and generating a name for everything it draws.

**Two statements save repetition.** `default box {.tone-4} w 1.15` sets the starting point for every box in the figure, and adding a tag narrows that to one set; the same lines go in a `draw-defaults:` frontmatter key when every figure in a lecture should look alike. `same as create` copies another element's width and height.

**Inside a label**, `_sub` and `^sup` shift a character or a `{group}` down or up, `*accent*` colours a run and `~muted~` greys it.

**Click the figure, and the button in the corner of the card opens the graphical editor, which is experimental.** It is built for a desktop-sized screen and has been tested a great deal by machine and very little by people. Drag a box and it rewrites one number – the `gap`, the fraction along a line, the nudge on a borrowed coordinate – and never the relation that number sits inside. It also draws those relations while you work, which the finished drawing cannot: a box written `gap 0.55` from its neighbour looks exactly like one that happens to sit 0.55 away. `editor: none` in the frontmatter leaves it out.

**Everything above is drawn rather than described in [the diagrams lecture](../diagrams/audience.html)**, one construct per slide, with its `#look` chunk as the reference for the class vocabulary and `#justify` for where an edge's label sits. `figure-design.md` in the repository is how to lay a figure out so a room can read it.
:::

## example: Looks, and lining things up | the class slots, `align` and `spread` {.full #diagram-classes}

**How an element looks comes from a fixed list of classes, and thirteen groups of them answer one question each, so only one member of a group can be in force at a time.** `{.tone-1}` on a box therefore *replaces* a `default box {.tone-4}` rather than piling on top of it.

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

**Every row of the specimen sheet above shows one group**, except three that show two or three where the questions belong together: stroke pattern, weight and the two ways of receding; family and size; the words that place a label across and the ones that place it down. The two ink classes have no row, being at work over the whole sheet – `.accent` on the cross, `.muted` on every caption. **Forty-one names in all, and `lint.js` refuses anything else**, so a typo stops the build rather than leaving a box unstyled.

**`flush` and `align` do two different jobs.** At the end of a placement, `flush` takes one word: `below src gap 0 flush left` keeps the new box's left edge level with `src`. On a line of its own, `align` is a statement: `align y middle a, b, c` gives `b` and `c` the vertical centre of `a`, the first name being the one the others follow. The centre of an axis is `middle` whichever axis it is.

**`spread x a, b, c, d` shares a set out evenly** – first and last stay put, everything between gets the same distance from its neighbours. **Both statements are at work in the sheet above**: one `align x right` gives the five row labels the right edge of the first, and `spread x` puts the five middle words of the family row between `sans` and `bold`, which are the only two on that row that were placed at all.

::: expand The rest of the class list, and where the two statements refuse

Only three class names belong to no group and can be combined with anything: `.bold` for a heavier label, `.turn` for a label read bottom-to-top up the side of something tall and narrow, and `.front` for a line drawn over the boxes rather than under them. Three groups have no row on the sheet. Two of them belong to edges – how a line is drawn (`.smooth` bends your waypoints into a curve running through them, `.elbow` works out a right-angled route with its turn halfway across the gap and needs no waypoints at all) and which end carries an arrowhead, which you normally say with the arrow itself (`->`, `<-`, `<->`, `--`) and only ever write as a class inside a `step`. The third is how much of the room's attention an element asks for: `.emph`, `.dim` and `.ghost`. **Those three names are also the three verbs a step uses for the same thing.** Two members of one group on one element is an error, and `{!dim}` is how a class comes back off; there is no fourth name for ordinary prominence, the absence of all three being what that is. `.paper` fills a label with the page colour, knocking a hole in a line running behind it.

Two pairs are not one group but still draw a warning, because one of the two ends up doing nothing: `.tone-4` with `.accent`, where the fill already *is* the accent, and `.turn` with `.left` or `.right`, where a label standing on end is centred across the direction it reads. `.top` and `.bottom` do still move a turned label.

Which way a pointed outline aims is the `point` option – `up`, `down`, `left` or `right` – and writing it on an outline that has no point is an error. So is `.fit` on a box with no width to fit into, and so is an outline class on anything but a `box`. A `.cross` given no `w` of its own comes out square, and stays square even under a `default box … w`; a `w` on the element's own line still wins.

`align` and `spread` work on boxes, dots, texts and images only – naming an edge, a container or a brace is an error. `align` names its axis first: `x` takes `left`, `middle` or `right`, `y` takes `top`, `middle` or `bottom`. `spread` needs at least three elements; `align` needs two.

:::

> note: Two columns built as separate `below` chains drift apart the moment their captions differ in height, and a line between two drifted boxes then runs a degree off the axis. The build warns about that.
>
> The sheet stays on screen when the prose around it is shortened away, so present this chunk from the short view. Press `A` a few times while it is up: the four tones are mixed from the page's own ink and accent, so the whole sheet changes with the theme.

## example: Charts, without a chart library | `bars`, `grid` and `plot` {.full #diagram-charts}

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

**A `brace` spans three of the columns and a `style` step tints four of the cells, because all of those are ordinary boxes** – named after the statement they came out of: `wc-0`, `wc-1`, … for the columns and `ch-1-0`, `ch-4-2`, … for the cells. The budget line is an ordinary edge drawn between two coordinates read off the chart's own frame, with `.front` on it so the columns do not cover it. The spacing *inside* these statements is `space` and never `gap`, `gap` being the distance to another element on the same line.

**A second set of numbers is one more `bars` line.** `bars after "…" series of wc {.tone-1}` joins the first chart's frame and borrows its ticks, its baseline and its scale, bringing only its own numbers and its own colour. The width is shared out between them, so a grouped chart takes exactly the paper a single one did. `stacked` piles it on the run before it instead, and the scale becomes the tallest stack. Such a line takes no `w`, no `h`, no `space`, no placement and no tick labels: all five belong to the chart it joined. `emph 0,1,2` or `dim 5` on any `bars` line marks those columns from the opening picture onwards, which is usually where a chart wants one – the same three words again, in a third position.

**`horizontal` lays the columns flat.** The bars run left to right, the categories stack downwards, the tick labels become a right-aligned column down the left margin and the baseline stands on the left. Lengths from one shared left edge are easier to rank than heights over a shared floor, and a category called “DNS cache poisoning” cannot be written under an upright column at all. A tick string containing `|` splits on that instead of on spaces, so a label can be as many words as it needs – the same mark that separates a `table` row and a `lanes` name list.

::: draw {unit=150x50}
bars hour "31,24,18,9" "writing the prose | drawing the figures | fixing one wording | fighting the tooling" at 0,0 horizontal w 1.7 h 1.25 emph 1 {.tone-2}
text hourn "minutes, in the hour before a lecture" below hour gap 0.5 {.small .muted}
:::

**`w` and `h` are counted in grid squares, and a grid square is not square – so those two numbers do not describe the shape on the page.** At the `unit=150x54` of the figure below, a plot written `w 1.9 h 1.5` comes out 285 by 81 pixels, which is nothing like 1.9 by 1.5. `aspect 4:3`, `aspect 1:1`, or a single number meaning that many wide to one tall, states the proportion the reader actually sees and lets the build work the other number out. Both `bars` and `plot` take it. Giving `w`, `h` and `aspect` together is an error, because two of the three would have to lose and nothing on the line says which.

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

**A `plot` draws the frame and the scale and nothing else.** It takes the two ranges and one `tick` interval, after which `pace@26` names a value in the plot's own units anywhere a coordinate can go – in a waypoint, in an `at`, at the end of a pointer line. **The curves are ordinary edges.** `.smooth` runs a curve *through* the waypoints you wrote instead of joining them with straight segments, `--` draws a line with no arrowhead, and the two steps bring the second curve in and then emphasise it while the reference line recedes.

**Two charts meant to be compared take one size, written once.** `same as pace` on a second `bars` or `plot` line copies the whole frame. It can only name a chart written *above* it, and `w`, `h` or `aspect` beside it is an error. Matching frames are not a matching scale: the ranges are written per chart and nothing checks that two of them agree.

> note: The numbers in both figures are made up. `plot` has no logarithmic scale, no automatic choice of ticks, no legend and no series of its own – everything it draws is an element you could have written by hand.

## example: A figure that moves | `hide`, `dim`, and a box that walks into the wire {.full #diagram-steps}

**A figure with steps is an argument in stages – the setting, the intruder, the cut wire, and what it costs.** Press forward three times.

::: draw {unit=138x70}
default box {.tone-2} w 1.25 h 0.5

box alice "Alice" at 0,0
box bob   "Bob"   right of alice gap 6.3 same as alice
edge wire alice <-> bob "M"
container net "one wire, two honest ends" over alice,bob pad 0.5 {.dashed .muted}

box eve "Eve" between alice,bob offset 0,-1.7 same as alice {.tone-4 @attack}
text note "no cipher is broken here –\nshe just stands in the middle" below alice gap 1.05 flush left -- eve.cx,eve.bottom {.hand .small @attack}

# A corner is as addressable as a side: .tl .tr .bl .br, plus .center. On a
# diagonal connection the corner hits what the side would miss.
edge in alice.br -> eve.tl {.accent @cut}
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

## example: Embedding your own type | `fonts/` plus a frontmatter block {.wide #fonts}

**Three typefaces travel inside every file the tool writes:** Literata, IBM Plex Sans and JetBrains Mono, all under the SIL Open Font License, which permits it. Naming a typeface is not enough on its own: Safari does not tell a page which fonts a machine has, so a lecture that only names its own gets whatever that browser decides. The three cost about 280 KB per file, and `fonts: none` leaves them out.

To use your own instead, put the files in a `fonts/` folder beside `source.md` and name the families:

```yaml
fonts:
  serif: Literata
  sans: IBM Plex Sans
  mono: JetBrains Mono
```

Files are matched by name, and the ending gives the weight and the style: `Literata-Regular.woff2`, `-Bold`, `-Italic`, `-BoldItalic`, `-600`, `-600italic`, or a single file named `Literata[wght].woff2` that carries every weight. A role you name uses your font; a role you leave out keeps the one that ships. Naming a family with no matching file stops the build.

**Check the licence first.** Putting a font inside the file redistributes it. The SIL Open Font License and Apache-2.0 – between them nearly all of Google Fonts – allow that; most commercial desktop licences do not, and want a separate web licence. The build prints a reminder and checks nothing.

## principle: A picture behind the text is not part of the text {.standard #deco-idea}

**A backdrop, an overlay and a card row belong to the chunk, not to its body.**
The body sits in the middle of the slide, so anything written inside it is
held inside the text column and can never reach the edges.

The rest of this part is those constructs one at a time. All of them – ten
covers, six kinds of divider, cards, rows, backdrops that open on a keypress,
overlays – are shown one per slide in
[the decoration lecture](../decoration/audience.html).

## example: Ten ways to draw the first slide | `cover:` plus a `subtitle:` line {.wide #covers}

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
                        # on the six type covers it is an error
```

`info:` takes as many lines as you give it – the course and the room, the address students should write down, or, at a conference, its name and dates. Without `subtitle:` the one line saying what the talk is *about* has nowhere to go but `info` either, where it is set exactly like the rest.

**The ten are ordered by how much the opening slide asserts itself.** Six of them are type alone:

::: cards 3
- **classic** the lower-left third. The default, so a lecture that names no cover at all is unchanged
- **masthead** the title along the top edge, the credits along the bottom, your own text in the field between
- **stack** the title block centred on both axes, for an opening that wants to be still
- **display** the title set to fill the slide. The scale is the whole design
- **panel** the type on a full field of the theme's accent colour
- **quote** the title chunk's body set as the claim, the lecture's name under it
:::

Four take a picture:

::: cards 4
- **split** type on the left, the picture running off the right edge
- **hero** the picture is the slide, type reversed out of a dark gradient
- **beside** the title chunk's own body, a drawing say, set to the right
- **above** that same body on top, the title centred in the band below it
:::

**`beside`, `above` and `quote` take their content from the chunk body**, so a `::: draw` can be the cover – a diagram is not a file, and `cover-image` can never name one. On those three, and on `masthead`, `info:` still supplies the credit lines; everywhere else writing a body replaces `info`. `cover-ratio: 42%` sets how much of the slide the picture takes on `split`, `beside` and `above`, and `cover-align: top | middle | bottom` moves the type up or down on the compositions that leave it any freedom.

**The six type compositions each take a `::: backdrop` too**, which is how a photograph reaches a cover that has no `cover-image` of its own. Try `panel` that way: its coloured field becomes the veil, so the picture reads through a plate of the accent rather than under the paper wash every other backdrop gets.

## example: A picture that fills the frame | `::: backdrop` and `::: overlay` {.wide #backdrop}

**`::: backdrop` puts a picture behind the whole slide, edge to edge, and `::: overlay` puts a block of text on top of it.** One line each, on any chunk – a cover is not a special case.

```markdown
## figure: {#skyline .full}

::: backdrop city-at-night {invert blur}

::: overlay {bottom-left ink wide}
### Every endpoint is a sensor
A crawler that looks like a browser gets measured back.
:::
```

A backdrop names its picture the same three ways an image does – a bare asset id, a path, an https address. **The words in the braces answer five questions, at most one word each**: how the picture fills the frame, which part of it survives the crop, what is laid over it, whether it is sharp or blurred, and whether it sits under the type or in front of it. Two words answering the same question is an error, and the message names both.

**`veil` is the one worth knowing by name**, because it is what you get without asking: the theme's own paper over the picture at 80%, so ordinary dark text stays legible on a photograph in all seven themes. `invert` darkens the picture and turns the text light instead – the next slide is one.

An overlay answers three: **where** on a 3×3 grid, **what it sits on** (`paper`, `ink`, `accent`, `clear` or `glass`) and **how wide**. Every one is a card with padding and rounded corners, because text laid straight onto a photograph is unreadable at the back of a room.

[The decoration lecture](../decoration/audience.html) has a slide for each of the two lists, and a backdrop whose window opens on a keypress.

## example: A picture behind the words | the same two blocks, drawn {.full #deco-picture}

::: backdrop dusk {cover invert}

::: overlay {bottom-left ink standard}
**The backdrop is the slide's ground**\
and this block is an overlay, placed on a 3×3 grid.
:::

> note: The veil laid over a backdrop is the theme's own paper, not white, so ordinary dark text stays legible over a photograph in every theme. `invert`, which this slide uses, darkens the picture and turns the text light instead. The chunk is nothing but the two blocks on the slide before it – there is no body text at all.

## example: Three things stay three things | `::: cards N` {.wide #cards}

**`::: cards 3` is not a second spelling of `::: cols 3`.** A `cols` block is one run of text the browser shares across that many columns, so a paragraph can spill from the foot of one into the head of the next. A `cards` block is that many separate boxes, and an item is in one of them whole or it is nowhere.

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

**How you open a card decides what the bold does**, and the two below are written the two ways:

::: cards 2
- **A lead-in** is written on the same line as its text, so the bold runs into the sentence and the card reads as one paragraph
- **A heading**\
  is written before a line break, so the bold sits on its own line with the text under it
:::

Use `cols` for an argument that runs long, and `cards` for a comparison the room should be able to count.

## example: What the words in the braces do | `ground` and `anchor`, shown {.wide #cards-look}

**Seven words in the tail set the look, and two of them decide themselves**: `size`, where the longest item picks it, and `align`, which follows the size. The other five are `anchor`, `detail`, `ground`, `corner` and `scrim`. They are bare words between braces, at most one per question, and a second word answering a question already answered stops the build.

::: cards 3 {accent}
- **accent**\
  the theme's own colour, with the text in the page colour on top
- **paper**\
  the page colour, so the card lifts off whatever is behind it
- **clear**\
  no box at all. The gap between the cards is what separates them
:::

**That row is `::: cards 3 {accent}`** – one word, and `ground` is answered for every card in it. `panel` is the default, a tinted fill; `outline` is a hairline and no fill; `photo` makes the card's first picture its background, and `scrim` says what is laid over it.

::: cards 3 {outline middle}
- **outline**\
  a hairline and no fill, which is quieter on a slide that already carries a figure
- **middle**\
  this text is centred against the tallest card. In the row above it sits at the top
- **never both**\
  a fill inside a hairline reads as a form field rather than as a card
:::

**That one is `::: cards 3 {outline middle}`**, so it answers two questions: `ground`, and `anchor` – where the text sits when the card is taller than its content, which it always is, a grid row being as tall as its longest card.

## example: A term and what it means | `::: rows` {.wide #rows}

**`::: rows` is the same box turned ninety degrees**: a term in a card on the left, its explanation beside it, several of them stacked.

::: rows {accent}
- **Separatism** Engineers do the technical work; managers take the decisions
- **Technocracy** Engineers should take them, because they understand them
- **Deference** Engineers name the options and say what each one costs
:::

That is `::: rows {accent}` around one list, and every term gets the same column width, so the explanations line up down the slide however long the terms are.

It takes no count, a row block having one column by definition, and it takes every word a card row takes. Three defaults differ: the text is centred against its term rather than against its first line; `align` says how the term sits *in its card*, and the explanation always ranges left; and the automatic size stops at `medium`, a term being a label in a column rather than a headline across the slide.

Reach for `rows` when a term needs a sentence, and for `cards` when a comparison needs counting.

## example: A figure beside the prose | `::: side 2:1` {.wide #side-ratio}

::: side 2:1

**`::: side` takes an optional ratio, so the two panes need not be equal halves.** This slide is `::: side 2:1`: two parts of prose to one part figure, which is the shape a diagram with its commentary usually wants. Any two numbers work, `::: side` on its own is equal halves, and `::: flip` starts the second pane.

The figure beside this text is a `::: draw` block inside the second pane. In `print.html` and `print-notes.html` the two panes stack one after the other and the ratio is ignored, because a page has only one column to give them.

::: flip

::: draw {unit=140x60}
box a "Crawler" {.tone-1}
box b "Detector" below a gap 1.1 {.tone-4}
edge a -> b "request"
:::

:::

**A figure *above* or *below* the text needs nothing at all** – put the block first or last in the chunk body. `::: cols` is the one place a figure does not belong: a figure breaks the run of text the columns share, so the columns quietly stop working. A `::: draw` written there is refused, and the message points you at `::: side`.

A card row works inside one half of a `::: side` block, which is a box with a width the row can fill. `::: cards 1` in a narrow half gives you a stacked column, and one card on its own is a callout.

## example: Setting the type for a whole lecture | the `style:` block {.wide #style-block}

**The `style:` block holds six settings you make once for a whole lecture rather than chunk by chunk.**

```yaml
style:
  headings: left        # auto | left | center | off
  rules: off            # on | off  – the hairline over a principle
  labels: off           # on | off  – the tag word over a chunk
  link-codes: off       # on | off  – the mark after an external link
  heading-scale: 1.15   # 0.6 … 1.8
  body-scale: 0.95      # 0.6 … 1.8
  wrap: none            # balance | none – how a heading breaks
```

`headings: auto` is the default, and it means the tag decides: a question is centred, a figure's caption sits over its artwork. `left` overrides all of that, for one line of alignment down the whole lecture. `off` takes every heading off the projection while keeping it in `print.html`, `print-notes.html`, the contents list and the search.

The two scales multiply the tool's own sizes rather than replacing them, and they are **bounded**. Outside 0.6 to 1.8 the shortened view, the limit on how wide a line of code may be and the automatic zoom stop agreeing with each other.

## example: Which typefaces travel in the file | five bundled families, named not filed {.wide #bundled-fonts}

**Three families travel in any one file, and which three is yours to pick.** Five come with the tool, so naming one of those needs no font file at all.

```yaml
fonts:
  sans: Inter Tight                # or IBM Plex Sans, the default
  mono: Noto Sans Mono Condensed   # or JetBrains Mono, the default
  serif: Literata                  # the only serif that ships
```

Only the three a lecture actually asks for are read, so choosing an alternative costs that lecture and no other. A name that is neither one of the five nor a file in `fonts/` stops the build, and the message lists the names available for that role.

**The condensed monospace is 17% narrower** – 0.50 em against 0.60 em per character, measured in a browser – so a listing that ran off the slide now fits. It is Noto Sans Mono with its width axis pinned rather than a different typeface, so it costs 54 KB. Slashed zero, and `I`, `l` and `1` are three visibly different shapes.

**`ligatures:` decides whether letter pairs are drawn joined, and answers separately for prose and for code.** `text` is the default: `fi` and `fl` joined up in prose, nothing joined in code. `none` takes them out of prose as well. `all` puts the code ones back, so JetBrains Mono draws `->` as a single arrow again. The code ones are off by default because in the figure language `->` and `--` are two *different* arrows, and every listing on a slide is source somebody may retype.

## example: A figure that walks itself | `::: draw {autoplay=N}` {.wide #autoplay}

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

The timer presses the same key you would press, so the speaker view follows and freezing the projection stops it. It runs on the projection only, and **the first key, click or scroll stops it for good** – once you have touched the lecture you have taken over. It also refuses to start on a slide that is already half uncovered.

The delay has to be between 200 ms and 60 s; outside that the build refuses the number rather than quietly moving it.

**`cycle` repeats the walk** – `{autoplay=1200 cycle}` – which is usually what a cover figure wants while a room fills. It rewinds the same way it advanced, so the speaker view follows the rewind too. The last step is held for one delay like every other, and there is no second number for how long to hold the finished picture.

## example: Where a new part starts | `section:` {.wide #section-dividers}

**A column with a `# Heading` opens with a divider slide**, and `section:` picks how that slide is drawn.

```yaml
section: tinted         # plain | tinted | rule
                        # card | number | outline
section-mark: Teil      # any short word, or nothing
```

::: cards 3
- **tinted** the whole slide takes the accent colour, lightly. The most visible of the six from the back of a room
- **rule** the heading between two rules. The quietest, and the one that survives a black-and-white print
- **outline** every part of the lecture listed, with the one you are entering marked. A running agenda for a long lecture
:::

`plain` is the default, the heading on its own; `card` sets it on a panel; `number` puts a large counter above it, counting the columns that have a heading. **Every one of them is quieter than the cover**, so that a divider is never mistaken for the title slide: it says *a new part starts here, and it is part of the thing you are already in*.

`section-mark:` puts a word of your own – `Teil`, `Kapitel` – over the heading. By default there is none.

## example: Turning the generated labels off | `style: {labels: off}` {.wide #labels}

**The tag word above a chunk is drawn in two places, and one setting takes it out of both.**

::: cards 2
- **`print.html` and `print-notes.html`** set a small line of capitals over every tagged chunk. Every tag has one except free and figure, so that is where most of them live.
- **The projection** prints only the word over an exercise. The rest were taken out: a label naming the kind of slide is only ever as right as the tag was.
:::

```yaml
style:
  labels: off
```

`rules` is the neighbouring key and switches the lines – the bar above a principle, the hairline above a definition. `labels` switches the words.

**A figure's heading, set in capitals, is your own text and needs no key.** It is the chunk's heading, drawn that way because the tag is `figure`, so `## figure: {.wide #id}` with no heading text leaves it off the slide. The cost is that the chunk then has no text for search to find and no heading in `print.html`. (The contents list is unaffected – `T` lists the lecture's columns, never its chunks.)

## example: Closing the arc back to the cover | `## closing:` {.wide #closing}

**`## closing:` draws a last slide in the same composition as the cover, so the lecture ends on the shape it opened with.** A lecture that starts on a designed slide and ends on the last bullet of the last argument stops rather than finishes.

```markdown
## closing: Questions? | office hours Thursday, 14–16 {#end}

Next week: certificates, and who you are actually trusting.
```

**The heading is what it says, the sub-heading after the `|` is the second line, and the body is whatever should stay on screen while the room asks questions.** Your name and the `info` block are not drawn.

A closing slide never reads `cover-image`, so the four picture compositions draw their type alone. Give it a `::: backdrop` if you want a picture of its own.

> note: The checker warns if a `closing:` chunk is not the last chunk in the lecture, and if there is more than one – both of which are lectures that end twice.

## closing: That is the tour | now write your own `source.md` {#end}

Everything in this tour comes out of one Markdown file and one command, `node build.js source.md`. The four views are already sitting beside it.

> note: This slide is the construct it describes – the tour ends in the composition it opened with, `masthead`, carrying its own words rather than a second copy of the title block.
