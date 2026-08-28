---
title: psi-slides – a ten-step tour
subtitle: A lecture medium that builds four views from one Markdown file
presenter: Dominik Herrmann
cover: editorial
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

# Welcome {#welcome}

> note: This is a self-referential lecture – it explains the tool by being the tool. First-time readers should have both this audience view and a spawned speaker view (S) open side by side. The cockpit column assumes the speaker is running.

## principle: One source, four views | print, print-notes, audience, speaker all come from the same `source.md` {.standard #one-source}

**psi-slides builds four HTML files from each Markdown source.** Print is a document-style reading copy with a cover and a TOC; print-notes is the same document with your speaker notes folded in; audience is this live projection view; speaker is the cockpit with notes, preview strip, and timer.

The authoring format is the same Markdown for all four – views only differ in *what they emit*, never in *what you wrote*.

## figure: The build, in one picture {.wide #four-views}

![](four-views)

The four outputs are self-contained: images are inlined, CSS and JavaScript are embedded, and every file opens from `file://` with no server. That is why you can mail a lecture to a colleague as a single attachment.

> note: The SVG above is spliced into the page as a real `<svg>` element rather than a `data:` URI, and its colours are theme variables. Press A a few times while this slide is up: the figure re-colours with the page. That only works because the asset uses `var(--ink)` instead of hard-coded hex.

## free: What you're reading right now | is the audience view {.wide #audience-now}

**You are in `audience.html`.** It is the projector-facing view: one chunk occupies the slide, the keyboard moves between chunks, and a speaker window, once you open one, mirrors everything here in real time.

::: cols 2

**To see the other views:**

- Press `P` now to open `print.html` in a new tab – scroll through the whole lecture as a document.
- Press `S` to spawn `speaker.html` as a popup window – that is the cockpit.
- Press `?` for the full keyboard and mouse reference. Everything below is in there too.

**The source that produced all four** lives at `lectures/tutorial/source.md`. Every chunk in every view came out of that one file. Open it in a text editor beside this window to see the mapping.

:::

# Moving around {#moving}

## example: Forward and back | plus a sideways pair for columns {.standard #arrows}

**Live navigation is two key families, forward and back, and a sideways pair that changes column.**

- **Forward** is `Space`, `↓`, `Enter` or `PageDown`. It uncovers the next **segment** of the chunk you are on; once there is nothing left to uncover it moves to the next chunk, and at the end of a column it carries on into the next column.
- **Back** is `↑`, `PageUp` or `Backspace`. It puts the last segment away again, and it leaves the chunk only once the chunk is back at its opening state.
- `→` and `←` are that same pair, except on the **first chunk of a column**, where they mean next column and previous column. A `# Name` heading starts a column; each `## tag: …` is one chunk. Press forward now:

---

**Good – you just revealed a segment.** In the source, a line with only `---` (outside a code fence) breaks the chunk body into reveal segments. The first is visible when you arrive; forward uncovers the next, back puts it away.

**Faint marks at the edge of the slide flag the two exceptions.** `‹ ›` appear only on a chunk where sideways changes column, and `⌄` appears only when the next forward press will leave the column. They are a compass rather than a control – there is nothing to click.

**The cockpit shows you what comes next.** With a speaker window open, look at this slide there: the segment the next forward press will reveal is already drawn in place, hatched and inside a dashed frame, so you can read ahead without the room seeing it. Only the immediately next one – the segments behind it stay hidden, or the preview would just be the whole chunk with decoration on top.

---

**One more, to show chaining.** Reveal lets you pace dense content during a live talk without dumping everything at once, and in print all segments render together as one flowing body.

## example: Expansions | `1`-`9` or the chevron open side asides {.wide #expand}

**Some chunks have extra detail tucked behind a chevron button.** Click one, or press `1`…`9` for the n-th. This chunk has two expansions – try both.

::: expand digits-and-chevrons
**A digit opens the expansion with that number.** This is expansion number 1. Press `Esc` to close, or `2` to switch to the second expansion directly – no need to close first. `Enter` does not open expansions; it is one of the forward keys.

In source, an expansion is authored with `::: expand <label>` … `:::`. The label shows in the expanded pane header; the chevron button gets an abbreviation (`Exp` for unknown labels, `Ex` / `Ref` / `Fig` / `?` / `N.B.` / `!` for known families).
:::

::: expand collapse-behaviour
**Expansions disappear in collapse mode.** Press `C` after closing this to try it – the chunk shrinks to topic sentence plus bold keywords, and expansions hide entirely. The idea is that an expansion is “the branch you take *if* someone asks”; the main text carries the argument on its own.
:::

**Print collapses all expansions** into block-quoted asides in source order, so the reading copy loses nothing.

## example: Zoom into a figure or code block | click it {.standard #figure-focus}

**Click any figure, code block, or marginalia inside the active chunk.** Figures and code lift into a centred card with the slide dimmed behind; a marginalia instead pans the camera so the aside sits in the middle of the screen.

**Links have two behaviours.** A plain click opens the link in a new tab of the window you clicked in – in the cockpit that is you checking a source, and the deck itself never navigates away. `Shift`-click instead puts the **address** on both screens, large, with a **QR code** beside it. Click the address to open it anyway; `Esc` or the next slide clears it.

Try it on this one: [the group behind the tool](https://psi.uni-bamberg.de/). Plain click opens a tab; `Shift`-click puts the address on the wall with a code the room can scan.

That is the considered answer to “can I open a page on the projector”. You could, and it is a bad idea twice over: you would be driving a browser you cannot see from the lectern, and the room would be watching an unrelated interface instead of the lecture. What a room wants from a link mid-talk is to capture it – so the QR moves that job onto the listener's own phone, which is where the network request belongs too. The projection machine still contacts nobody.

The codes are generated during the build, one per external address in the source, so they cost nothing in a lecture without links and need no encoder in the browser.

**Hold `Alt` to select text.** Normally dragging pans the slide, so selection is off – a stray highlight on the projection is a distraction that never stops being one. Hold `Alt` and the stage becomes selectable and the cursor changes; let go and dragging pans again. The selection survives the key release so you can reach `Cmd`-`C`, and `Esc` clears it.

Inside a focused card: drag to pan, wheel or `+` `-` to zoom, `0` to reset, `Esc` or a click to close. With a speaker connected, the audience mirrors the focus, the zoom, and the pan, so what you inspect is what the room sees.

```python
# Click this block to zoom it. Useful when a line matters more than the slide.
def anonymity_set(observations, senders):
    return {s for s in senders if plausible(s, observations)}
```

# Finding content {#finding}

## example: Overview | `O` as in Overview zooms out so you can see everything {.standard #overview}

**Press `O` now** – the letter O, not the digit zero, which resets the zoom instead. The stage zooms out to show every chunk at once in its column grid, and the slide you were on carries a selection outline.

- **Drag** to pan the board, **wheel** to zoom it.
- **Click** a slide to go there – one click both selects it and leaves the board.
- **Arrow keys** move the selection without landing, and the board follows, because the next pick is often off screen.
- `O` again or `Enter` **lands** on the selection; `Esc` leaves without moving.

In an unfamiliar lecture the board shows the typographic rhythm of principles, examples, and figures at a glance, which is usually enough to find the part you want. With a speaker connected, both windows enter, pan, zoom, and leave together.

## example: TOC | `T` toggles a flat column index {.standard #toc}

**`T` shows a list of every named column with its ID.** Click an entry to jump there directly; `T` again closes the panel.

Columns without a `{#id}` do not appear – anonymous columns like the title page stay invisible in the nav but still render normally. IDs on named columns are how the TOC links, and also how cross-references (a `[text](#some-id)` link in body text) resolve.

## example: Search | `/` lists every slide that mentions a word {.wide #search}

**Press `/` from anywhere – you do not have to be in overview first.** A panel opens and every slide whose heading or body contains what you type is listed with the sentence it matched, the term highlighted.

`↑` `↓` pick a hit, `Enter` or a click goes there, `Esc` closes without moving. If you opened the search from the overview board, the board follows your pick as you move down the list, so a match on the far side of the lecture comes into view while you are still choosing.

It is the tool for the case where you remember a topic but not where it sits. It searches the rendered text, so a word that only appears in continuation prose still finds its slide even though the room never sees that sentence.

# What goes on the slide {#on-screen}

## principle: Two ways to decide what the room sees | derived, or stated outright {.standard #two-modes}

**`C` toggles between the full text and the collapsed slide.** Collapsed is the default, and it is what the projector shows during a talk; the full text is the rehearsal and recap mode.

**What “collapsed” means is per chunk, and you choose the mechanism.** Either psi-slides derives the slide from your prose, or you state the slide explicitly. The next two chunks show both.

## example: Derived | first sentence of each paragraph, plus bold fragments {.wide #derived-mode}

**By default the collapsed slide is the first sentence of every paragraph plus any `**bold**` phrases from the rest.** This chunk is written that way – press `C` twice and watch what appears and disappears.

The mechanism costs nothing to author and it keeps print and screen in one text. It also imposes a real constraint: every paragraph has to open with a sentence that works as a standalone claim, and the **bold fragments have to read as bullets on their own**. Continuation prose is print-only.

Argument-shaped chunks live with that constraint easily. It fights you when the chunk wants continuous explanation, which is what the next chunk is for.

> note: If the collapsed version of a chunk reads as a pile of cryptic one-word bullets, the fix is almost always fewer bolds and a stronger first sentence, not a different mode.

## example: Stated | `::: slide` and `::: script` {.wide #explicit-mode}

::: slide

- **`::: slide`** marks the block that is the screen. Everything else in the chunk is narration.
- **`::: script`** does the reverse: the chunk is the screen, and only the marked block is narration.
- Neither block is abridged. Lists, figures, and code render whole.

:::

You are reading the projector version of this chunk right now: the bullets above sit inside a `::: slide` block, and this paragraph does not. Press `C` and this sentence appears; press `C` again and it goes away. Nothing here was derived from a first-sentence rule, because the block says outright what belongs on screen.

Reach for `::: slide` when the slide wants to be tight bullets while the argument wants to be prose. Reach for `::: script` when the chunk is already slide-shaped and you only want to park a paragraph of narration next to it. A chunk may carry both, in which case the slide block wins and everything outside it is narration. Chunks with neither block keep behaving exactly as `#derived-mode` does, which is why no existing lecture changed when this landed.

> note: The lint density budget only counts the on-screen half. Narration is unbudgeted, so you can write as much of it as the argument needs.

## question: Which mode does a chunk use? {.narrow #which-mode}

**A `::: slide` block if there is one, otherwise everything outside `::: script`, otherwise the derived first-sentence-plus-bold.** Three rules, checked in that order, per chunk.

::: expand answer-in-practice
**In practice you will mix them inside one lecture.** Principles and questions tend to be argument-shaped and do fine derived; a long finding or a walkthrough is usually easier to write with an explicit `::: slide`.

The tag vocabulary is a good predictor: `principle` and `question` chunks are short enough that derivation rarely bites, while `example` and `free` chunks at the top of their density budget are where the explicit mode is usually the shorter route.
:::

# The chunk vocabulary {#vocabulary}

## principle: Eight tags, one grammar | `## tag: Heading | Sub {.width #id}` {.standard #grammar}

**Every chunk opens with a tag that names what kind of move it makes.** `title`, `principle`, `definition`, `example`, `question`, `figure`, `exercise`, `free`.

The `| Sub-Heading` and the `{.width #id}` tail are both optional. Width is one of `narrow`, `standard`, `wide`, `full`, and **the `{#id}` is frozen once authored** – it anchors cross-references, TOC entries, speaker-sync snapshots, and localStorage.

## definition: What a tag actually does {.standard #tag-effects}

**A tag sets the visual treatment and the density budget, not the layout.** `principle`, `definition`, `question` and `example` print their tag name as a small label above the heading; `free`, `exercise` and `figure` render unlabelled.

The lint budgets differ per tag, and they encode intent rather than taste: `principle` and `question` get 80 words because a claim that needs 200 is not a claim yet. `definition` gets 200, `example` and `free` get 250, `exercise` gets 350, and `title` and `figure` are unbudgeted.

Picking the wrong tag is not an error, and the linter will not tell you. It only shows up later, when a `principle` you wrote as an `example` no longer stands out in the overview board.

## exercise: Try the vocabulary {.wide #try-tags}

**Open `lectures/tutorial/source.md` with `--watch` running and change three things.** Every save rebuilds and reloads every open tab, so keep the audience, the speaker and your text editor visible at once.

::: cols 2

1. Change this chunk's tag from `exercise` to `principle`. The label appears, and `lint.js` starts complaining: the budget dropped from 350 words to 80.
2. Wrap the list in a `::: slide` block, then press `C` here. Everything else leaves the screen.
3. Add a `> note:` line under the heading, then look at the speaker's notes pane and at `print-notes.html`.

:::

> note: Watch mode picks a free port and injects a reload snippet into each output; production builds get none, which is why the committed HTML has no WebSocket code in it.

# Speaker cockpit {#speaker}

## free: Speaker view | the other window `S` spawned {.wide #speaker-s}

**The speaker view is the four-lane cockpit.** Press `S` in this audience view if you have not already – it opens `speaker.html` as a popup, and from then on the two windows talk to each other directly, with no server in between.

::: cols 2

**Four lanes, top to bottom:**

- **Column scrubber** with clickable dots for every chunk.
- **Stage mirror** – identical layout to the audience at the same zoom.
- **Editable notes pane** below the stage, collapsed when the chunk has no notes.
- **Preview strip** of all chunks, scrollable and clickable.

**Everything stays in sync.** Chunk changes, reveal state, annotations, theme, font, zoom, expansion state, overview framing, figure focus and the laser pointer all travel between the two windows. `V` freezes the projection when you want to read ahead without the room following, and unfreezing catches the room up to wherever you got to.

:::

## example: Arranging the cockpit | the part everyone forgets {.wide #cockpit-layout}

::: slide

- **`Shift`-`V`** moves the preview strip between the bottom edge and the right edge.
- **Drag the hairline bar above the notes** to resize the notes pane. The slide preview rescales to fit.
- **Drag the bar on the edge of the preview strip** to resize that too, in either orientation.
- **Double-click either bar** to go back to automatic size.
- **The `−` and `+` in the notes corner** scale the notes text, separately from the pane height.
- **`?`** opens the full reference. The footer has buttons for all of these.

:::

The notes pane starts at automatic height: one line when empty, up to three when it has content, collapsed entirely when the chunk has no notes at all. Once you drag it, the height becomes fixed and is remembered across lectures and reloads, which is usually what you want on a fixed lectern screen. The stage above gives up exactly the space the notes take, so the audience mirror stays letterboxed at the projector's aspect ratio rather than stretching to fill.

Vertical preview mode is worth trying on any screen with horizontal room to spare: the thumbnails get larger and their text becomes legible, which turns the strip from a position indicator into something you can actually read ahead in. Both the strip's height and its width are remembered separately, so flipping the orientation and flipping back returns each one to the size you gave it.

## example: N vs Shift-N | audience-visible vs private {.wide #notes-vs-annot}

**Two different note surfaces, one letter apart:**

::: side

**`N` (both views) is an annotation on the current chunk.** A textarea appears under the chunk; whatever you type is mirrored keystroke-by-keystroke to the other view. Use it for live marginalia – a rule you want on screen, a question you captured from the room, a correction during a talk.

Annotations are kept in the browser, per lecture, and travel to the other window as you type. `Shift-E` on the speaker copies every live annotation as `> annot:` Markdown to your clipboard; paste it under the matching chunk heading in `source.md`, run `node build.js <source.md> --integrate-annotations`, and the text becomes a permanent Presentation Note – prefilled into the audience textarea and rendered inline in print.

> annot: The `> annot:` block you read here in print is the same mechanism exported from a previous run; the audience textarea above starts prefilled with this text.

::: flip

**`Shift-N` (speaker only) opens the private notes pane** below the slide. This is *your* memory aid, never mirrored. The pane is pre-filled from `> note: …` lines in source; your in-talk edits override the source text and are kept in the browser, per chunk.

If the pane is collapsed because this chunk has no notes, the corner `+ note` button on the stage does the same thing as `Shift-N`.

`print-notes.html` is the third home for the same text: the print document with every `> note:` folded in under its chunk. That is the file to hand out when you want “what was on the slide, plus what the lecturer said”.

:::

## example: The reading knobs | `C` `F` `A` and zoom {.wide #knobs}

**Four single keys change how the text reads, and all four sync to both views.**

- `C` toggles **collapse**: what the room sees, or the full text.
- `F` cycles **font**: serif → sans → mono, for projector legibility.
- `A` cycles **theme**: four light accents, a neutral dark mode, and two terminal phosphor modes.
- `+` `-` `0` set the **text size**; `#` hands that job to the tool.
- `B` **blanks the projection** – and only the projection.
- `L` cycles the **slide numbers**: stacked, in a row, or off.

`Shift` plus any of the cycling keys goes backwards. Font, theme and slide numbers are stored globally rather than per lecture, so the preference follows you; zoom and collapse belong to the talk.

**The dark mode follows your system by default.** If you have never pressed `A` and the lecture does not pin a theme, a machine set to dark mode opens the deck dark. Press `A` once and your choice is remembered from then on, on every lecture. An author who pins `theme:` in the frontmatter overrides both – the same one-sentence rule as the other viewer defaults.

**The two collapse modes keep separate zoom levels.** The collapsed slide holds whatever size you set with `+` and `-` – that is the projector setting, and nothing changes it behind your back. Switching to the full text picks its own zoom so the whole chunk fits the screen, and switching back restores yours exactly. Without that, every `C` was followed by a row of `-` presses and every `C` back by a row of `+` presses.

**`#` turns on auto-fit** and every slide is then sized to the screen as you arrive on it, in either collapse mode – growing a short chunk as readily as shrinking a long one. `#` again hands the zoom back to you. It is the right mode for a lecture whose chunks vary a lot in length, and the wrong one if you want a constant type size in the room.

**`L` decides how the slide number is set.** The stacked digits in the corner are a deliberate look and not to everyone's taste, so they are a setting rather than a decision the tool makes for you: stacked, laid out in a row, or gone entirely.

**`B` blanks the projection, not your cockpit.** The audience view goes black; the speaker window keeps the slide, the notes and the preview strip, so you can change slide or read ahead while the room sees nothing. A small `BLANK · hit B to toggle` marker sits at the bottom of the speaker window – or at the bottom of the audience view if no speaker is open, so a one-screen setup still knows how to get out.

# Authoring layouts {#layouts}

## principle: Two layout axes | chunk widths and body directives {.standard #layout-axes}

**Layout works on two axes.** Each chunk picks one of four widths in its heading – `{.narrow}`, `{.standard}`, `{.wide}`, `{.full}` – which sets how much horizontal stage it occupies. Inside the body, `:::` directives shape internal flow.

Width is the slide-level decision; directives compose within. A `.wide` chunk with a `::: side` body is the most common figure-plus-commentary pattern.

## example: Multi-column flow | `::: cols 2` and `::: cols 3` {.wide #cols-demo}

**`::: cols 2` (or `cols 3`) wraps the body in a CSS multi-column flow.** Use it when several short paragraphs read better in parallel than stacked – feature lists, brief comparisons, parallel definitions.

::: cols 2

**Left flow.** Multi-column flow auto-balances: the engine fills top-to-bottom and lets content break wherever it fits. Avoid putting one long paragraph here; one column dominates and the other sits empty. Several short blocks work best.

**Right flow.** This block is the third paragraph in source, which is why it landed in column two – column flow goes top-down and then wraps. In print, columns collapse back to a single linear stream.

:::

**Columns fold to one while the slide is collapsed** – press `C` here and the two flows above stack. Collapsed, each paragraph is down to its topic sentence, and a browser will not split a paragraph across columns, so two paragraphs of one and five visible lines land as a stub beside a wall of text. The columns come back in print and in the full-text mode, where there is enough content for the flow to balance.

Reveal segments still work inside `::: cols`, but mixing reveal-on-`↓` with multi-column flow is rarely worth the cognitive load – pick one rhythm or the other.

## example: Two-pane grid | `::: side` and `::: flip` {.wide #side-demo}

**`::: side` opens a two-pane grid; `::: flip` is the mid-marker between panes.** Unlike `cols`, the split is deterministic – the left pane gets everything before `::: flip`, the right pane everything after. Best for figure-plus-commentary, or before-and-after pairs where you need to control which side gets which content.

::: side

**Left pane.** Authoring shape: write `::: side`, then left content, then `::: flip`, then right content, then `:::` to close. The grid is balanced 1fr/1fr by default, so neither side dominates the slide.

::: flip

**Right pane.** A figure usually goes here, with the textual context on the left. In the audience view, click either pane to focus-zoom it; print stacks the two panes vertically so neither side is ever hidden.

:::

You can nest a `::: marginalia` *inside* a side pane if a tangent belongs to one half specifically – it still escapes to the slide's right margin.

**Code in a pane needs short lines.** A pane is half a column, and a `<pre>` does not wrap, so the projection has room for roughly **30 monospace characters** per pane at the default zoom – against about 50 in a `.standard` chunk and 60 in a `.wide` one. Longer lines still do not get cut off, because the build shrinks that one slide until they fit; but a 50-character line in a pane means a slide noticeably smaller than its neighbours. Break the signature across lines, or put the code full-width and keep the panes for prose.

## example: Marginalia | `::: marginalia` escapes to the slide margin {.standard #marginalia-demo}

**`::: marginalia` floats an aside to the right of the chunk body**, anchored to the content column's right edge and spilling into the slide padding. The camera does not pan there automatically – click the marginalia in this chunk to bring it centred into view.

::: marginalia

This whole block is rendered in the slide margin, in dimmed sans-serif. Use marginalia for tangents that *belong with* a chunk but would crowd the main flow – an aside, a citation, a “see also” pointer to another column.

In print, marginalia stack inline below the body as block-quoted asides, so the reading copy keeps every word.

:::

The body itself stays in the central column; only the marginalia escapes outward. Keep marginalia short – they share vertical space with the chunk body and cannot grow taller than it.

## example: Margin notes | `::: margin` is a quiet inline footnote {.standard #margin-demo}

**`::: margin` adds a dim, small-caps-labelled note below the chunk body** – a Tufte-style sidenote, but in-flow rather than off to the side. Always visible, no chevron, no separate panel.

::: margin
This is a margin note. The label header reads NOTE by default; the block renders in muted sans-serif under a dotted top rule. Margin notes are quieter than expansions: no button to click, just a soft footnote attached to this chunk.
:::

Reach for `::: margin` when the supplementary content is short and trustworthy enough that you want it always rendered. Reach for `::: expand <label>` (back at `#expand`) when it should hide behind a chevron until someone opens it.

## example: Images | `![](fig-id)` resolves against `assets/` {.wide #images}

**The shorthand `![](fig-id)` looks for `assets/fig-id.{svg,png,jpg,jpeg,gif,webp}` and takes the first match.** No path, no extension. An explicit path still works if you need one.

::: cols 2

**Alt text becomes a caption.** `![a caption](fig-id)` renders a `<figcaption>` under the image. On a `figure:` chunk whose heading already says what the picture is, that stacks two labels, so the linter warns and suggests the empty-alt form.

**SVG assets are spliced inline** as real `<svg>` elements rather than `data:` URIs, so they inherit the page's `--ink`, `--paper`, and `--ink-soft` and re-colour with the `A` theme key. Raster images become base64 `data:` URIs. Everything under a 10 MB total and 2 MB per file is inlined automatically; `--no-inline-images` keeps external paths instead.

:::

**A file over the 2 MB per-image cap fails the build.** Inlining it is impossible, and shipping it as an external path would quietly break the single-file promise: correct on your machine, broken figure wherever the HTML travels without its assets folder. `node build.js <source.md> --optimize-images` converts the offenders to WebP in place, which on real lecture assets lands at 12 to 18 percent of the original with no visible loss. `--no-inline-images` is the escape hatch if you actually want external paths.

> note: The verb does not downscale. The heavy files are usually already at slide resolution – the bytes are PNG being a poor fit for photographic content. And figure focus zooms to 8×, so the extra pixels in a diagram are ones the room gets to see; `--max-width` is opt-in for genuine outliers.

## example: Video | a clip is a figure that moves {.wide #video}

**Drop `clip.mp4` into `assets/` and write `![](clip)`** – the same shorthand as an image. The build searches the video extensions after the image ones, so an id with both a poster and a clip still resolves to the still.

![](reveal-demo)

That player is a real clip, inlined into this file: 34 KB, and it shows the three reveal stages of the navigation slide you walked through earlier. Press play; then look at the address bar and note that nothing was fetched.

Clips are inlined like any other asset, up to a separate 12 MB per-file cap: a clip is an order of magnitude heavier than a diagram, and the 2 MB image cap would reject every real one. Over the cap the build tells you the `ffmpeg` line that fixes it.

**There is no separate fullscreen setting.** The native player already has a fullscreen button, and how large the clip sits on the slide is the chunk's width class – exactly like a still figure. Clicking a clip does *not* zoom it into the figure card either, because that would fight the play button.

**A clip can also live on a web server:** `![](https://host/clip.mp4)` works and stays an ordinary `<video>` element, so play, pause and seeking still synchronise between the two windows.

**Too large to inline?** The build copies the file into a `videos/` folder beside the output and plays it from there, and says so on the terminal. One companion folder to carry, instead of a path that only resolves on the machine that built it.

**Play, pause and seeking are synced.** Operate the clip in the cockpit and the projection follows. Freeze the projection first and it does not, so you can check a clip before showing it.

## example: Hosted players | `::: embed` for YouTube and Vimeo {.wide #embed}

**A hosted player is its own directive, never the meaning of a bare link.** It is the one construct in the format that makes an output fetch from a third party while the lecture is running, so the author says it out loud:

```markdown
::: embed https://www.youtube.com/watch?v=aqz-KE-bpKQ
Big Buck Bunny, Blender Foundation
:::
```

The body line becomes the caption. A `youtu.be/…` or bare `vimeo.com/123` works too; anything else has to be a full `https://` address, and the build refuses what it does not recognise.

**Four things happen that a raw iframe would not do for you.**

- **Nothing loads until you get there.** The frame carries no `src` until its chunk is the one on screen, and loses it again when you leave. So a lecture contacts YouTube only for slides you actually showed, and a player cannot keep running behind your back on a slide you left.
- **Play and pause are synchronised.** Both providers speak a control protocol over `postMessage`, so starting the clip in the cockpit starts it on the projection – the same behaviour as a local video, with no library loaded. Freeze the projection and it stays put.
- **Nothing autoplays.** Arriving at the slide gives you a loaded player waiting on its button. Starting it is your move.
- **YouTube gets an honest card instead of an error.** A page opened from a file has no origin, and YouTube refuses to play without one – you would otherwise get its own “Error 153” in front of the room. Opened from disk, the frame is replaced by a card telling you to serve the deck. Vimeo has no such restriction and plays either way.

**To present with a YouTube embed, serve the lecture:**

```bash
node build.js <source.md> --serve          # http://localhost, prints the URLs
node build.js <source.md> --watch --serve  # and live reload while authoring
```

**The address is always printed under the frame**, with a QR code on `Shift`-click, so the room can reach the video even when the player will not run. YouTube embeds use `youtube-nocookie.com`, and Vimeo gets `dnt=1`.

**Weigh it before you use it.** These outputs are no longer self-contained: the machine showing them – often the lecture hall's PC – contacts that host mid-lecture, with everything that implies. A clip in `assets/`, or an `.mp4` URL on your own web server, keeps the sync and asks nothing of anyone else. The build says which of the two you have chosen, every time.

## example: Math | `$inline$` and `$$display$$` {.wide #math}

**Formulas are rendered by KaTeX during the build, so the output stays a single file with no runtime.** Inline math sits in a sentence – the anonymity set $S$ has size $|S|$ – and display math takes its own block:

$$d = \frac{H(S)}{\log_2 |S|}$$

**Display math behaves like a figure**, staying on screen when the prose around it collapses, and clicking it zooms it into a focus card – which is what you want when a room asks to see a formula bigger. Inline math instead follows the sentence it lives in: visible in a topic sentence, hidden with continuation prose.

**A lone dollar is safe**, because the delimiters are parsed as Markdown tokens rather than by a search-and-replace over your source. `$PATH` inside code, a price of $5 and $10 in prose, and a `$$` inside a fence are all left alone; write `\$` if you want to be explicit.

**Fonts are the price of the single-file promise.** A lecture with math inlines only the KaTeX font families its formulas actually use – around 120 KB of the full 254 KB in the print views; a lecture without math inlines nothing at all. The build prints which it did.

**The maths follows the `F` toggle.** Switch the body font to sans or mono and the formulas change with it, instead of sitting there as a serif island in a sans slide. Only the letterforms move: operators, relations and delimiters keep their own faces, and a glyph the sans face does not have falls back per character to the one KaTeX would have used. The live views pay about 46 KB more for the two extra families, because which font you will choose is not knowable at build time. Print has no toggle and does not pay it.

> note: A malformed formula does not fail the build – KaTeX renders it in red so a typo never blanks the projector mid-lecture. The terminal reports it instead, and `lint.js` warns about a `$$` you forgot to close.

## example: Diagrams | `::: draw` draws boxes and arrows from text {.full #diagram}

**A `::: draw` block is a figure written in the lecture source and drawn into the page as vector artwork at build time.** You name the pieces and say where they go; the arrows between them are computed.

::: draw {unit=126x72}
box  src  "Sender"
box  mix  "Mix"        right of src gap 1.05
box  dst  "Empfänger"  right of mix gap 1.05
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

**Every line has the same six slots, and they always come in this order** – most lines fill three or four of them:

```text
box   mix   "Mix"   right of src gap 0.6   w 1.2    {.tone-2 @crypto}
kind  name  label   placement              options  tail
```

**Inside the tail, three prefixes answer three questions** – `.tone-2` is a class (how it looks), `@crypto` a tag (which set it belongs to), and `#leak`, as on the `edge` line above, a name for the statements that have no name slot of their own. The name is how later lines refer to the element and is never drawn; the label is what the room reads, and `""` is a legal empty one.

**Placement is a grid cell or a relation to a neighbour** – `at 2,1`, or `right of mix gap 0.6`, or `below src gap 0 flush left` for boxes that touch. The first element sits at the origin so a simple diagram needs no coordinates at all. There is no automatic layout: every element sits where you put it.

**A coordinate can be another element's, plus or minus a little** – `at mix.cx,src.cy+0.4`, `via iv.cx,x0.cy`. Every slot that takes an `X,Y` pair takes that form, so moving one element does not mean re-typing the coordinates of everything placed against it. `.elbow` on an edge writes the commonest of those routes for you – one turn out, one turn in, halfway across the gap – and takes no waypoints and no options.

**An edge is one of the things a coordinate can name.** `text n "only after the handshake" above w1 gap 0.2` places a phrase against the wire it describes rather than against a box at one end of it, which is the difference between a label that follows its line and one that drifts off it the next time a height changes. Give the edge a name first, and it goes where every other statement puts one – in front, in the slot before the arrow's first endpoint: `edge w1 mix -> log`. An edge is anonymous until you write one, and an anonymous edge costs nothing to leave anonymous. Element names are letters, digits, `_` and `-`, because `mix.cx` has to be readable as one thing; a comment line starts with `#`.

**`step` blocks make a figure move.** One step is one press of the same key that uncovers a reveal segment, so steps and segments interleave in the order you wrote them and the cockpit follows. The vocabulary is `show`, `hide`, `move … to`, `move … by`, the three prominence verbs `emph`, `dim` and `ghost`, `style` and `label`.

**A moved box takes its arrows with it.** The layout is evaluated again for every step rather than nudged, so an edge that connects two elements re-routes whenever either end moves.

**Anything hanging off something invisible stays invisible too.** An arrow is only as visible as the two things it connects; a `container` or `brace` only as visible as its members, and it fits the ones on screen; a `text` with a line drawn to something only as visible as the thing it points at. So revealing the boxes reveals the arrows between them, the outline around them and the note beside them, and most of a diagram needs no `show` of its own. A free `text` gets that line with `-> some-element`, which is how a label goes wherever it reads best without losing what it is about. Naming an arrow or an outline in a `show` or a `hide` of its own overrides the rule, in both directions and for every beat after.

**A picture can be an element too.** `image alice avatar-alice w 0.4` finds the file exactly like `![](fig-id)` does. An SVG is drawn into the page itself, so it inherits `--ink` and `--paper` and re-colours with the `A` theme cycle; a raster image is embedded as it is and keeps its own colours in every theme.

::: expand The rest of the vocabulary
`dot` is a circle for junctions and glyphs. `container … over a,b,c` draws a box that fits itself around its members and re-fits when they move; `brace … over a,b right "Label"` is a bracket spanning a subset.

`table` and `lanes` expand into ordinary boxes the way `bars` and `grid` do. `table t "Attack | Layer | Countermeasure"` reads its rows off the quoted lines under it, names every cell `t-<column>-<row>` with the heading as row 0, and tags each one `@t-row-2` and `@t-col-0` – so lighting one row per beat is one line of source rather than a list of names to keep in step with the table above it. `lanes swim "User | SOC | IT ops"` draws bands of equal width with turned captions, which is the one thing a `container` cannot do: a container fits its members, so lanes holding different numbers of things come out ragged at both ends.

`sequence` draws a protocol down the page: `actor u "User"` lines for the columns, then `u -> br "click …"` for the messages and `note au "…"` for the boxes that sit on a lifeline. It owns the vertical rhythm and nothing else – every entry states the height it needs and the statement stacks them, so a note pushes the messages under it down instead of cutting into their labels, and inserting a message is one line instead of thirteen. A message *is* an edge, so `{.dashed}` is a reply and `--` is a line without a head; `x -> x` loops out of a lifeline and back for a local action. Everything a heavily annotated protocol slide needs after that comes from the names it generates – `wa-3` is the fourth message, `au-life` the authenticator's lifeline, `@wa-msg-3` and `@au-msgs` and `@wa-notes` the sets – so a `brace over wa-3,wa-4,wa-5` or a `text … -> wa-2` is an ordinary line. Message labels bring their own paper ground, because a lifeline crosses every one of them, and `space 0.9` on a message or a note is the air above that one band – which is how a long protocol is broken into phases.

A **tag** can be written wherever a name can, so `show @crypto` in a step covers every element carrying it. Membership sits on the element's own line, so adding an element to a set is a one-line edit.

Placement also takes `between a,b` – the point on the line joining two elements, which is where a separator glyph or a note beside a connector goes – and any placement accepts a trailing `offset dx,dy`. An anchor can carry a fraction: `mix.right:0.3` slides the attachment point along that edge, so two arrows between the same pair of boxes run side by side instead of on top of each other.

Against repetition there are two more: `default box {.tone-4} w 1.15` sets the base for every box in the diagram (add a tag – `default box @dec w 0.48` – to refine it for one set), and `same as create` copies another element's width and height. The same `default` lines go in a `draw-defaults:` frontmatter key when a whole lecture's figures should look like each other – then a block's own `default` overrides the lecture's for that one figure, and changing the house style is one edit.

And against measuring: a coordinate may be another element's coordinate. `edge iv -> x0 via iv.cx,x0.cy` means *straight down from the IV, then across at the height of the XOR*, and it stays true when anything above it moves. Adding `+0.2` or `-0.2` (`mix.cx+0.2`) shifts it a little without giving up the relation.

Inside a label, `_sub` and `^sup` shift a character or a `{group}`, `*accent*` colours a run and `~muted~` greys it.

**Click the figure, and the button in the corner of the card opens the experimental graphical editor.** It is made for a desktop-sized authoring screen and has substantial automated coverage, but has not yet been tested broadly by people. Drag a box and the editor rewrites one number – the `gap`, the fraction along a line, the nudge on a borrowed coordinate – and never the relation that number sits in. It also draws the relations while you work, which is the part a finished diagram cannot show you: a box written as `gap 0.55` from its neighbour looks exactly like a box that merely happens to sit 0.55 away. `editor: none` in the frontmatter ships the lecture without it.

Two more options work from the box inwards rather than from the label outwards. `pad 0.3` sets how far a box's border sits from its own label – the same word `container` and `brace` already use – and `.fit` on a box with a given `w` sizes the *type* to fill the box instead of growing the box to the type, with `.shrink` for a label that may only ever get smaller. A free `text` that carries a tone draws its own background patch, so a caption can sit on a panel without becoming a box.

**An edge's label reads the same rule.** A fill class on the `edge` itself gives its label a ground, and with no side named the words then sit *on* the line and knock it out behind them; `.top`, `.bottom`, `.left` or `.right` lifts them clear and carries the ground with them. The label is held at the middle of the route, so it stays there when the route bends or either end moves – which a separate `text` placed `between` two boxes does not. Use the on-the-line form for a token that names the line, a sequence number or a port, and the beside-it form for a phrase describing what travels along it, and keep to one of the two per figure.
:::

> note: Print is the **last** beat, not the union of every beat – so an element a step hid stays hidden, which is what "the finished picture" means. The one thing it does not take from the last beat is prominence: that comes from the opening one, so emphasis a lecturer hands around during the talk does not arrive on paper, while a `{.dim}` written on an element's own line does. The rule is readable off the source – on the line it is the drawing, inside a `step` it is the talk.

## example: Looks, and lining things up | the class slots, `align` and `spread` {.full #diagram-classes}

**How an element looks comes from a fixed list of classes, and thirteen groups of them are slots that hold one class at a time.** So `{.tone-1}` on a box *displaces* a `default box {.tone-4}` rather than stacking with it.

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

**Every row of that sheet holds at least one slot.** Three of them hold more than one, where the slots belong together – stroke pattern beside stroke weight beside the two retreats, `.ghost` and `.dim`; family beside size; and the words that place a label across beside the ones that place it down – and the two ink classes have no row at all, because they are at work over the whole sheet: `.accent` on the cross, `.muted` on every caption. **Forty-one names in all, and `lint.js` refuses anything else** – a typo is a build error, not a box that comes out unstyled.

**Two words, one for each of two different jobs.** At the end of a placement, `flush` takes one word: `below src gap 0 flush left` keeps the new box's left edge level with `src`. On a line of its own, `align` is a statement – `align y middle a, b, c` gives `b` and `c` the vertical centre of `a`, the first name being the one the others follow. Both were called `align` once, which meant a single line could carry two of them meaning different things; the centre of an axis is `middle` on both axes, for the same reason.

**`spread x a, b, c, d` distributes a set evenly** – first and last stay put, everything between gets equal spacing between centres. **Both are at work in the sheet above**: one `align x right` gives the five row labels the right edge of the first, and `spread x` puts the five middle words of the family row between `sans` and `bold`, which are the only two that were placed at all.

::: expand The rest of the class list, and where the two statements refuse

Only three class names belong to no slot and stack freely: `.bold` for a heavier label, `.turn` for a label read bottom-to-top up the side of something tall and narrow, and `.front` for a line drawn over the boxes rather than under them. Two slots the sheet has no row for at all belong to edges: how a line is drawn – `.smooth` bends the waypoints you wrote into a curve through them, `.elbow` works out a right-angled route with its turn halfway across the gap and needs no waypoints at all – and which of its ends carries an arrowhead, which you normally say with the arrow token itself and only ever write as a class inside a `step`. The third is prominence, how much of the room's attention an element asks for: `.emph`, `.dim` and `.ghost`. **Those three names are also the three verbs a step has for the same channel**, so learning one form teaches the other. Two members of one slot on one element is an error, and `{!dim}` is how a class comes back off – there is no fourth name for ordinary prominence, because the absence of all three is what that is. `.paper` fills a label with the page colour, which knocks a hole in a line running behind it.

Two pairs are not one slot – they act on different things – and are still a warning, because one of the two ends up doing nothing: `.tone-4` with `.accent`, where the fill already *is* the accent, and `.turn` with `.left` or `.right`, where a label standing on end is centred across the direction it reads and has nothing left to align. `.top` and `.bottom` do still move a turned label.

Which way a pointed outline aims is the `point` option – `up`, `down`, `left`, `right` – rather than four more class names per shape, and writing it on an outline that has no point is an error. So is `.fit` on a box with no width to fit into, and so is an outline class on anything but a `box`. A `.cross` given no `w` of its own comes out square, because a plus with arms of two different lengths is not one – and it does so past a `default box … w` as well, the same exception `bars` makes for an inherited outline. A `w` written on the element's own line still wins, because that one is a statement about that element.

`align` and `spread` both work on boxes, dots, texts and images only, because they override a coordinate that only those four compute for themselves; naming an edge, a container or a brace is an error. `align` names its axis first – `x` takes `left`/`center`/`right`, `y` takes `top`/`middle`/`bottom` – because `center` and `middle` are near-synonyms, and picking the wrong one would otherwise move a whole block sideways with no error. `spread` needs at least three elements; `align` needs two.

:::

> note: Two columns built as separate `below` chains drift apart the moment their captions differ in height, and a line between two drifted boxes runs a degree off the axis and reads to the room as a mistake – the build warns about exactly that.
>
> The sheet is the reference table, and it stays on screen when the prose around it collapses – so this is a chunk to present from the collapsed view. Press `A` a few times while it is up: the four tones are mixed from the page's own ink and accent rather than being fixed hues, so the whole sheet re-colours with the theme instead of bringing its own palette.

## example: Charts, without a chart library | `bars`, `grid` and `plot` {.full #diagram-charts}

**Three statements draw data, and each one expands into ordinary boxes, texts and edges before anything is drawn.** `bars` becomes one box per column plus a baseline, `grid` one per cell, `plot` a frame of gridlines, ticks and two axis titles.

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

**A `brace` spans three of the columns and a `style` step tints four of the cells, because both are ordinary boxes** – named after the statement they came out of: `wc-0`, `wc-1`, … for the columns and `ch-1-0`, `ch-4-2`, … for the cells. The budget line is an ordinary edge between two coordinates read off the chart's own frame, `.front` because otherwise the columns cover it and it shows only in the gaps. The spacing *inside* these statements is `space`, never `gap`: the placement on the same line already uses that word for the distance to another element.

**A chart can carry more than one series, and it is one more `bars` line.** `bars after "…" series of wc {.tone-1}` joins the first chart's frame and borrows its ticks, its baseline and its scale, bringing only its own numbers and its own look; the cell is shared out between them, so a grouped chart takes exactly the paper a single one did. `stacked` on that line piles it onto the run before it instead, and the scale becomes the tallest stack. A series takes no `w`, no `h`, no `space`, no placement and no tick strip – all five belong to the chart it joined. And `emph 0,1,2` or `dim 5` on any `bars` line marks those columns from the opening beat, which is where a chart usually wants one column to stand out rather than a keypress later – the same three words again, in a third position.

**`horizontal` lays the columns flat, and it is the same kind of bare word `stacked` is.** The bars run left to right, the categories stack downwards, the tick strip becomes a right-aligned column of labels down the left margin and the baseline stands on the left. Two things get better at once: lengths measured from one shared left edge are easier to rank than heights over a shared floor, and a category called "DNS cache poisoning" cannot be written under an upright column at all. **Which is why the tick string splits on `|` when it contains one**, and on spaces otherwise – the same mark that already separates a `table` row and a `lanes` name list, so a label may be as many words as it needs.

::: draw {unit=150x50}
bars hour "31,24,18,9" "writing the prose | drawing the figures | fixing one wording | fighting the tooling" at 0,0 horizontal w 1.7 h 1.25 emph 1 {.tone-2}
text hourn "minutes, in the hour before a lecture" below hour gap 0.5 {.small .muted}
:::

**`w` and `h` are grid units, and a grid cell is not square – so the two numbers do not describe the shape on the page.** At the `unit=150x54` of the figure below, a plot written `w 1.9 h 1.5` lands 285px by 81px, which is nothing like 1.9 by 1.5. `aspect 4:3`, `aspect 1:1`, or one bare number meaning that many wide to one tall, states the proportion the reader actually sees and lets the build work the other number out. Both `bars` and `plot` take it, and giving `w`, `h` and `aspect` together is an error: two of the three would have to lose, and nothing on the line says which.

::: draw {unit=150x54}
plot pace "minutes into the talk" "chunks covered" at 0,0 w 2.7 aspect 2:1 x 0,60 y 0,40 tick 10
edge even pace@0,pace@0 -- pace@60,pace@40 {.muted .dashed}
edge real pace@0,pace@0 -- pace@60,pace@40 via pace@12,pace@4 pace@26,pace@12 pace@44,pace@26 pace@54,pace@34 {.smooth .accent .thick}
dot  mark "" at pace@26,pace@12 r 0.08 {.accent}
text evenn "even pace" at pace@50,pace@33 pad 0.12 {.small .paper}
# Die Leitlinie greift die Kurve an einem Punkt ab, statt quer durchs Feld zu
# laufen und dabei beide Kurven zu kreuzen.
text realn "the first third\nalways runs long" at pace@22,pace@31 pad 0.12 -- mark {.small .hand .paper}

step real
  show real, mark
step lesson
  emph real
  dim even
:::

**A `plot` draws the frame and the scale, and nothing else.** It takes the two ranges and one `tick` interval, after which `pace@26` names a value in the plot's own units anywhere a coordinate goes – in a waypoint, in an `at`, at the end of a leader. **The curves are ordinary edges.** `.smooth` draws the same waypoints as a spline *through* them rather than as a chain of straight segments, `--` writes a line with no arrowhead at all, and the two steps bring the second curve in and then `emph` it while the reference line is `dim`med.

**Two charts meant to be compared take one size, written once.** `same as pace` on a second `bars` or `plot` line copies the whole frame, so a reader can lay one over the other instead of measuring both. It can only name a chart written *above* it, because a chart's gridlines and columns are placed as its own line is read; and `w`, `h` or `aspect` beside it is an error, since the size has already come from elsewhere. Matching frames are not a matching scale, though: the ranges are written per chart, and nothing checks that two of them agree.

> note: The numbers in both figures are made up. `plot` has no log scale, no automatic tick choice, no legend and no series of its own: everything it draws is an element you could have written by hand.

## example: A figure that moves | `hide`, `dim`, and a box that walks into the wire {.full #diagram-steps}

**A stepped figure is an argument in beats – the stage, the disturbance, the cut, and what it costs.** Press forward three times.

::: draw {unit=138x70}
default box {.tone-2} w 1.25 h 0.5

box alice "Alice" at 0,0
box bob   "Bob"   right of alice gap 6.3 same as alice
edge wire alice <-> bob "M"
container net "one wire, two honest ends" over alice,bob pad 0.5 {.dashed .muted}

box eve "Eve" between alice,bob offset 0,-1.7 same as alice {.tone-4 @attack}
text note "no cipher is broken here –\nshe just stands in the middle" below alice gap 1.05 flush left -- eve.cx,eve.bottom {.hand .small @attack}

# Eine Ecke ist so adressierbar wie eine Kante: .tl .tr .bl .br, dazu .center.
# Für eine diagonale Verbindung trifft die Ecke, was die Seite verfehlt.
edge in alice.br -> eve.tl {.accent @cut}
edge fwd eve.right:0.2 -> bob.left:0.2 "M" {.accent @cut} side top
edge edit eve.right:0.8 -> bob.left:0.8 "M′" {.accent @cut} side bottom

step spot
  show @attack
step cut
  hide wire
# `to` setzt eine Position, `by` verschiebt um einen Betrag – und weil das
# Layout pro Schritt neu ausgewertet wird, passt sich der Container an.
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

**Every element after the first is placed against another one, which is why nothing comes apart when the middle box walks in.** `move eve to between alice,bob` states a position, `move alice by -0.5,0` shifts one by an amount, and the layout is evaluated again for every beat – so Alice and Bob step aside, the `container` re-fits around them, and the arrows are drawn where their endpoints have ended up. `hide` takes the direct wire away, `dim` is the opposite of `emph`, and `label` swaps in a wording that was typeset at build time.

**Two tags do all the revealing: `@attack` and `@cut`.** `show @attack` brings Eve in and the handwritten caption with her, because both lines carry that tag; `show @cut` brings the three arrows through her a beat later. The pair running to Bob leaves Eve's right edge at `:0.2` and `:0.8` – a fraction along a side is how two arrows between the same two boxes run parallel instead of on top of each other – and `.top` / `.bottom` put one label above its line and the other below.

# Writing chunks that work {#craft}

## principle: The topic sentence is the slide | so write the opening line for the projector {.standard #topic-sentence}

**In derived mode the room reads your first sentences, so each one has to be a claim that survives without its paragraph.** Everything after it is print.

The same rule works as a rehearsal test: if the collapsed chunk would not remind you what you meant to say, it is not finished.

> note: Present this chunk from the collapsed view while you say it. Nothing lands the argument faster than a slide that is visibly the same text the handout carries.

## example: Four ways a chunk goes soft {.wide #anti-patterns}

**Most chunks that read badly on the projector fail in one of four ways**, and each one is a single edit away from working.

::: slide

- **Label bolds.** `**Consequence:**` collapses to a bullet reading “Consequence” and nothing else. Put the claim inside the sentence.
- **One-word bolds.** A lone `**not**` becomes a cryptic bullet. Bold a phrase that stands alone, or bold nothing.
- **Connector openers.** “That was deliberate.” carries no claim. Say the thing itself in the first sentence.
- **Colon cuts.** If the substance sits after a colon at the end of the opening sentence, the cue dangles. Rewrite it as one sentence.

:::

All four share a shape: they read fine inside a paragraph and fall apart the moment the paragraph is taken away. Walking a lecture once in collapsed mode before teaching it is where they show up.

When several parallel items pile up inside one paragraph, use a real Markdown list instead of scattering bold across the prose. A list stays legible when abridged; micro-bolding almost never does.

> note: The recurring temptation is to fix a weak collapsed view by adding more bold. It is nearly always the wrong direction – fewer bolds and a stronger opening sentence is the fix.

## question: Derive it, or state it? {.standard #choose-mechanism}

**Derive while the chunk is an argument of one to three paragraphs; state the slide once the argument wants continuous prose.** Try the derivation first and switch when it keeps fighting you.

::: expand tag-as-predictor
**The tag is a decent predictor.** `principle` and `question` chunks are short enough that the first-sentence rule rarely bites. `example` and `free` chunks near their density budget are where `::: slide` is worth reaching for, because those are the ones carrying a walkthrough or a finding rather than a claim.

A figure chunk plus a paragraph of interpretation is the other reliable case, and there `::: script` around the interpretation is less typing than wrapping the slide half.
:::

## exercise: The squint test {.wide #squint-test}

**Open your own lecture in the audience view, press `C` until it is collapsed, and walk it end to end without opening the source.** Stop at every chunk you could not narrate from what is on the screen.

::: cols 2

**For each chunk that fails**, ask in this order: is the opening sentence a claim, or a warm-up? Would each bold fragment read as a sensible bullet on its own? Is there a list hiding inside a paragraph?

**If all three answers are fine and it still reads badly,** the chunk wants `::: slide`. The two mechanisms exist because neither one covers every chunk.

:::

> note: This is worth doing once per lecture, ideally the day before. It doubles as a rehearsal, because reading the collapsed deck is very close to actually presenting it.

# Next steps {#next}

## exercise: Read more | the artefacts that close the loop {.wide #read-more}

**The tour covered the keys. What it could not cover is the craft, which shows in authored content.**

::: cols 2

**1. `lectures/python-intro/audience.html`.** A 36-chunk teaching lecture. Spawn its speaker with `S` and watch the layout vocabulary you just learned in real use, woven through reveals, expansions, and figure focus.

**2. `PRD.md`.** Why four views, why this tag set, why collapse has two modes and not four. Part specification and part plan, so read it as a record of thinking rather than of behaviour.

**3. `speaker.md`.** The sync protocol: which fields travel between the two windows and which stay local. Written for whoever changes the code, not for an author.

**4. `docs/comparison.md`.** psi-slides against Beamer, reveal.js, Quarto, Marp, Slidev and PowerPoint, including the places it loses.

:::

## free: Authoring your own | `--new`, `--watch`, `lint.js` {.standard #authoring}

**Three CLI entries cover the full authoring loop:**

- `node build.js --new <slug>` scaffolds a lecture folder with valid frontmatter and two chunks. It builds cleanly the moment it lands on disk.
- `node build.js <source.md> --watch` gives live-reload in every open tab.
- `node lint.js lectures/` runs the static checks: unknown tags, unclosed directives, duplicate IDs, density budgets, reveal overuse, orphan columns, redundant figure captions. `--strict` makes warnings fail.

A source file can silence one check with `<!-- linter: ignore reveal-overuse, density -->` anywhere in the body. It has to be real prose to count: inside a code fence or a backtick span, as in the sentence you are reading, it is an example rather than an instruction. This lecture carries a real one at the top, for `density`, and says there why.

## example: Embedding your own type | `fonts/` plus a frontmatter block {.wide #fonts}

**Three typefaces ship with the tool and are embedded in every output:** Literata, IBM Plex Sans and JetBrains Mono, all under the SIL Open Font License, which permits it. Safari does not expose installed fonts to a page at all, so a deck that only *names* its typefaces gets whatever that browser decides. The bundle costs about 280 KB per file, and `fonts: none` turns it off.

To use your own instead, put the files in a `fonts/` folder beside `source.md` and name the families:

```yaml
fonts:
  serif: Literata
  sans: IBM Plex Sans
  mono: JetBrains Mono
```

Files are matched by name and the suffix gives weight and style: `Literata-Regular.woff2`, `-Bold`, `-Italic`, `-BoldItalic`, `-600`, `-600italic`, or a variable file named `Literata[wght].woff2`. A role you name uses your font; a role you leave out keeps the bundled one. Naming a family with no matching file fails the build.

**Check the licence first.** Embedding redistributes the font file. The SIL Open Font License and Apache-2.0 – which between them cover nearly all of Google Fonts – allow it; most commercial desktop licences do not, and want a separate webfont licence. The build prints a reminder and verifies nothing.

## example: The cover has four compositions | `cover:` plus a `subtitle:` line {.wide #covers}

**A cover set only in ink, at one weight, with the subtitle at meta size beside the venue reads as a text file rather than as the opening of a talk.** Two frontmatter keys fix most of it.

```yaml
title: Detecting Bot Detection
subtitle: Prevalence, Techniques and Implications
presenter: Ralf Gundelach
info: |
  ARES 2026 · Linköping · 24 to 27 August
cover: editorial        # classic | editorial | split | hero
cover-image: skyline    # split and hero need one; the others ignore it
```

`subtitle:` is the step the ladder was missing. Without it the one line that says what the talk is *about* has nowhere to go but `info`, where it is set exactly like the line that says which conference it is.

::: cards 4
- **classic** the lower-left third, all type. The default, so a lecture that names no `cover:` is unchanged.
- **editorial** an accent rail, the title over a rule, the meta collected into a footer row.
- **stack** the title block centred on both axes, for a quiet opening.
- **rule** the title held between two hairlines across the measure.
:::

::: cards 4
- **split** type left, `cover-image` bled off the right edge.
- **hero** the picture is the slide, type reversed out of a gradient scrim.
- **beside** the title chunk's own body — a `::: draw` — inset to the right.
- **above** that body on top, the title centred in the band below it.
:::

**`beside` and `above` take their art from the chunk body**, which is what lets a `::: draw` be the cover: a diagram is not a file, so `cover-image` can never name one. On those two the body is the art and `info:` still supplies the meta lines; everywhere else a non-empty body replaces `info` as it always did. `cover-ratio: 42%` sets how much of the slide the picture takes on `split`, `beside` and `above`.

`split` bleeds and `beside` insets, and that is why both exist: a photograph wants the edge, a drawing wants a margin, because a diagram cropped by the frame reads as a diagram that did not fit.

An unknown value fails the build, and `split` or `hero` without a `cover-image` fails too rather than drawing an empty half.

## example: A picture that fills the frame | `::: backdrop` and `::: overlay` {.wide #backdrop}

**`::: backdrop` puts an image behind the whole slide, edge to edge, and `::: overlay` puts a text block on top of it.** One line each, on any chunk – the cover is not a special case.

```markdown
## figure: {#skyline .full}

::: backdrop city-at-night {.invert .blur}

::: overlay {.bottom-left .ink .wide}
### Every endpoint is a sensor
A crawler that looks like a browser gets measured back.
:::
```

The backdrop takes the same three forms an image does – a bare asset id, a relative path, an https URL – and its class tail answers four questions, each a closed list: **fill** `cover` or `contain`, **crop** `middle` `top` `bottom`, **scrim** `veil` `clear` `invert`, **focus** `sharp` `blur`.

`veil` is the default and it is the theme's own paper at 80%, so ordinary ink stays legible over a photograph in all seven themes. `invert` turns the slide's ink light instead. Writing two words from one slot is an error, not a preference the build guesses at.

An overlay answers three: **place** – the nine cells of a 3×3 grid, `bottom-left` through `top-right`; **ground** – `paper` `ink` `accent` `clear` `glass`; **width** – `narrow` `standard` `wide` `full`. All of them are cards with padding and a radius, which is the point: text laid straight onto a photograph is unreadable at the back of a room.

## example: Three things stay three things | `::: cards N` {.wide #cards}

**`::: cards 3` is not a second spelling of `::: cols 3`.** A `cols` block is one text flow the browser balances across N tracks, so a paragraph can spill from the foot of one column into the head of the next. A `cards` block is N *containers*, and an item is whole or it is nowhere.

```markdown
::: cards 3
- **Measure** what a page does when a crawler asks for it
- **Probe** the detector until it names itself
- **Report** what that costs a measurement study
:::
```

Which children become the cards is one rule and no parsing: a lone list dissolves into the grid, so its items are the cards; anything else contributes one card per block. Counts from 2 to 6 – past six, what you have is a table.

Use `cols` for an argument that runs long and `cards` for a comparison the room should be able to count.

## example: Setting the type for a whole lecture | the `style:` block {.wide #style-block}

**Four knobs an author reaches for on a whole deck rather than on one chunk.**

```yaml
style:
  headings: left        # auto | left | center   – auto keeps the per-tag treatment
  rules: off            # on | off               – the hairline above principle/definition
  heading-scale: 1.15   # 0.6 … 1.8
  body-scale: 0.95      # 0.6 … 1.8
```

`headings: auto` is the default and means the tag decides: a question is centred, a figure's caption sits over its artwork. `left` overrides all of it, which is what an author who wants one axis of alignment through the whole deck is asking for.

The two scales are multipliers on the tool's own scale rather than absolute sizes, and they are **bounded**. Outside 0.6–1.8 the collapse mode, the code-width clamp and the auto-fit camera stop agreeing with each other, and the result is not a look but a bug report.

## example: Which typefaces travel in the file | five bundled families, named not filed {.wide #bundled-fonts}

**Three families ship in any one output, and which three is the lecture's choice.** A bundled family needs no file — that is the point of bundling it.

```yaml
fonts:
  sans: Inter Tight                # or IBM Plex Sans (the default)
  mono: Noto Sans Mono Condensed   # or JetBrains Mono (the default)
  serif: Literata                  # the only serif bundled
```

Only the three families a lecture resolves to are read at all, so an alternate costs the lecture that asks for it and nothing else. A name that is neither a bundled family nor a file in `fonts/` fails the build, and the message lists the bundled names for that role.

**The condensed mono is 17% narrower** — 0.50 em against 0.60 em per character, measured in a browser — which is usually why an author reaches for it: a listing that overran the slide fits. It is a *pinned instance* of Noto Sans Mono's width axis rather than a different typeface, so it costs 54 KB and nothing downstream has to know about it. Slashed zero, and `I`, `l` and `1` are three visibly different shapes.

Iosevka reaches the same width and is deliberately **not** bundled: it is 961 KB per face against 54, which is 3.87 MB of base64 in every view on a tool whose whole promise is a file you can mail. Drop it in `fonts/` if you want it anyway — that is what that mechanism is for.

`ligatures:` answers a question that is really two. `text` is the default: `fi` and `fl` in prose, none in code. `none` takes them out of prose too. `all` puts the code ligatures back, so JetBrains Mono draws `->` as a single arrow glyph again — pleasant in an editor, and the reason it is off here is that in the figure grammar `->` and `--` are two *different* edges, and every listing on a slide is source a reader is meant to retype.

## example: Laying a lecture out the way 1.0.0 did | three settings, not a version key {.wide #layout-generation}

**From 1.0.0 the source format is the interface, and that is about more than parsing.** A finished deck should be able to lay out the way it laid out.

Exactly three things have moved since 1.0.0 that an existing lecture would notice, and each is an ordinary preference:

::: cards 3
- **The sans** was Inter Tight, now IBM Plex Sans — it relays out every sans run. `fonts: {sans: Inter Tight}`
- **Line breaking** gained `text-wrap: balance` on headings and `pretty` on prose. `style: {wrap: none}`
- **Code ligatures** were turned off, so `->` stopped drawing as an arrow. `ligatures: all`
:::

```yaml
ligatures: all
fonts:
  sans: Inter Tight
style:
  wrap: none
```

Set together, those three reproduce the 1.0.0 rendering **exactly** — verified by building the same source through the real 1.0.0 build and through this one and comparing: zero differing pixels.

**There is deliberately no `layout: 1.0` key.** One key naming a version reads as a promise that the tool can rebuild any past release, and that promise has no end: every later change to a shared stylesheet would have to be gated on a generation, and the combinations nobody tests would multiply. It would also make you keep track of which version your deck was authored against. Each of these three is a setting you might want on its own — someone who prefers Inter Tight is expressing a view about type, not pinning a release.

## example: A figure that walks itself | `::: draw {autoplay=N}` {.wide #autoplay}

**A figure written with `autoplay` advances its own steps on a timer once the slide is on screen** — one delay, in milliseconds, for every step. A cover figure that moves while the room files in is what it is for, but it works on any chunk.

```markdown
::: draw {unit=150x56 autoplay=1200}
box crawler "Crawler" {.tone-1}
box det "Detector" right of crawler gap 1.6
edge crawler -> det "request"

step probe
  emph det
:::
```

It calls the same advance the Space key calls, so there is **one counter**: the speaker view follows through the ordinary sync, the freeze gate applies, and nothing new is stored. It runs on the projection only, and **the first key, click or scroll stops it for good** — a lecturer who has touched the deck has taken over, and a timer resuming underneath them is worse than no timer. It also refuses to start on a slide that is already half revealed, because arriving at one means you left it that way.

Between 200 ms and 60 s. Outside that the build refuses rather than clamps: below 200 ms the room cannot read a beat, and above a minute a "moving" figure is a still one that changes when nobody is looking.

**`cycle` repeats the walk** — `{autoplay=1200 cycle}` — which is usually what a cover figure wants while a room fills. It rewinds through the same counter, so the speaker view follows the rewind exactly as it followed the walk. The last beat is held for one delay like any other; there is deliberately no second number for how long to hold the finished picture.

## example: Turning the generated labels off | `style: {labels: off}` {.wide #labels}

**The tag word above a chunk is two different things wearing one name**, so it takes one switch to reach both.

::: cards 2
- **The document view** labels every tagged chunk — `PRINCIPLE`, `QUESTION`, `DEFINITION`, `EXERCISE`. That is where most of them live.
- **The projection** generates only `EXERCISE`, in CSS. The others were removed outright: a taxonomy announces itself only as correctly as the tag choice was.
:::

```yaml
style:
  labels: off
```

It is its own key rather than part of `rules`, which hides the bar above a principle and the hairline above a definition — a word and a line are not one decision, and you may want the line without the word.

**A figure's all-caps heading is not a generated label and needs no key.** It is the chunk's own heading, set in small caps by the `figure` treatment, so `## figure: {.wide #id}` with no heading text simply leaves it off the slide. The cost is real and worth knowing: that chunk then has no TOC entry, no search text, and no heading in the printed hand-out.



## example: Pinning how a lecture opens | six optional frontmatter keys {.wide #view-defaults}

**A lecture can decide its own starting look instead of inheriting the reader's.**

```yaml
---
title: Anonymous Communication
font: mono              # serif | sans | mono
theme: terminal-green   # light-{red,teal,blue,orange} | dark | terminal-{amber,green}
collapse: none          # topic-bold | none      – the C toggle
auto-fit: true          # true | false           – the # toggle
slide-numbers: off      # vertical | horizontal | off
editor: speaker         # both | speaker | none  – who gets the diagram editor
---
```

`lang:` sits beside them and is a different kind of key: it names the document language (`en` by default, `de`, `de-DE`, `fr` …) and lands in the `lang` attribute of every view. The print views use it to pick a **hyphenation dictionary**, which is what lets a long German compound break instead of pushing a hole into the line. The live views do not hyphenate: a broken word on a projection reads badly.

**The precedence rule is one sentence.** A key that is present wins over the reader's stored preference; a key that is absent leaves that preference alone. So a lecture that pins nothing behaves exactly as it always did – font, theme and slide numbers follow the reader from lecture to lecture – while a lecture with a designed look gets it without asking anyone to press keys.

`slide-numbers` reaches the print views as well, since a document has no keyboard to cycle it with. An unknown value fails the build with the list of valid ones rather than being ignored, because a silently dropped setting looks exactly like a setting you forgot to write.

> note: When finishing this tour with a first-timer, end by asking them what felt discoverable and what did not. Their first-impression friction is the most valuable feedback the tool will get.
