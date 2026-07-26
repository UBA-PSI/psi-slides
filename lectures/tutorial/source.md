---
title: psi-slides – a ten-step tour
presenter: Your own copy
info: |
  Tutorial lecture built with psi-slides itself
  Use the tool to learn the tool
course: psi-slides-tour
lecture: tutorial
---

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

**You are in `audience.html`.** It is the projector-facing view: one chunk occupies the slide, keyboard nav moves between chunks, and any speaker connected via postMessage mirrors state here in real time.

::: cols 2

**To see the other views:**

- Press `P` now to open `print.html` in a new tab – scroll through the whole lecture as a document.
- Press `S` to spawn `speaker.html` as a popup window – that is the cockpit.
- Press `?` for the full keyboard and mouse reference. Everything below is in there too.

**The source that produced all four** lives at `lectures/tutorial/source.md`. Every chunk in every view came out of that one file. Open it in a text editor beside this window to see the mapping.

:::

# Moving around {#moving}

## example: Arrows and Space | navigate chunks, reveal segments {.standard #arrows}

**Three key-families carry the whole live-talk navigation:**

- `←` `→` move between **columns** – the top-level sections headed `# Name`.
- `↑` moves back a **chunk**; each `## tag: …` is one chunk.
- `↓` and `Space` are the same key: they reveal the next **segment**, and once a chunk is fully out, move on to the next one. A chunk splits into segments at standalone `---` lines. Try it now:

---

**Good – you just revealed a segment.** In the source, a line with only `---` (outside a code fence) breaks the chunk body into reveal segments. The first is visible on entry; each `↓` or `Space` uncovers the next, and past the last, either key advances to the next chunk.

The two keys behave identically on purpose. `↓` used to skip straight to the next chunk, which meant walking a lecture with the arrows silently swallowed every reveal on the way – and remembering to switch keys for exactly the segmented slides is the sort of thing that goes wrong in front of a room.

**The cockpit shows you what comes next.** With a speaker window open, look at this slide there: the segment the next keypress will reveal is already drawn in place, hatched and inside a dashed frame, so you can read ahead without the room seeing it. Only the immediately next one – the segments behind it stay hidden, or the preview would just be the whole chunk with decoration on top.

---

**One more, to show chaining.** Reveal lets you pace dense content during a live talk without dumping everything at once, and in print all segments render together as one flowing body.

## example: Expansions | `Enter` and `1`-`9` open side asides {.wide #expand}

**Some chunks have extra detail tucked behind a chevron button.** Click one, or press `Enter` for the first, or `1`…`9` for the N-th. This chunk has two expansions – try both.

::: expand enter-and-digits
**`Enter` opens the first expansion, digits open specific ones.** This is expansion number 1. Press `Esc` to close, or `2` to switch to the second expansion directly – no need to close first.

In source, an expansion is authored with `::: expand <label>` … `:::`. The label shows in the expanded pane header; the chevron button gets an abbreviation (`Exp` for unknown labels, `Ex` / `Ref` / `Fig` / `?` / `N.B.` / `!` for known families).
:::

::: expand collapse-behaviour
**Expansions disappear in collapse mode.** Press `C` after closing this to try it – the chunk shrinks to topic sentence plus bold keywords, and expansions hide entirely. The idea is that an expansion is “the branch you take *if* someone asks”; the main text carries the argument on its own.
:::

**Print collapses all expansions** into block-quoted asides in source order, so the reading copy loses nothing.

## example: Zoom into a figure or code block | click it {.standard #figure-focus}

**Click any figure, code block, or marginalia inside the active chunk.** Figures and code lift into a centred card with the slide dimmed behind; a marginalia instead pans the camera so the aside sits in the middle of the screen.

**Links have two behaviours.** A plain click opens the link in a new tab of the window you clicked in – in the cockpit that is you checking a source, and the deck itself never navigates away. `Shift`-click instead puts the **address** on both screens, large, with a **QR code** beside it. Click the address to open it anyway; `Esc` or the next slide clears it.

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

Overview is the fastest way to get oriented in an unfamiliar lecture: the typographic rhythm of principles, examples, and figures is visible at a glance. With a speaker connected, both windows enter, pan, zoom, and leave together.

## example: TOC | `T` toggles a flat column index {.standard #toc}

**`T` shows a list of every named column with its ID.** Click an entry to jump there directly; `T` again closes the panel.

Columns without a `{#id}` do not appear – anonymous columns like the title page stay invisible in the nav but still render normally. IDs on named columns are how the TOC links, and also how cross-references (a `[text](#some-id)` link in body text) resolve.

## example: Search | `/` lists every slide that mentions a word {.wide #search}

**Press `/` from anywhere – you do not have to be in overview first.** A panel opens and every slide whose heading or body contains what you type is listed with the sentence it matched, the term highlighted.

`↑` `↓` pick a hit, `Enter` or a click goes there, `Esc` closes without moving. If you opened the search from the overview board, the board follows your pick as you move down the list, so a match on the far side of the lecture comes into view while you are still choosing.

This is the fastest jump tool when you half-remember a topic but not its position, which mid-lecture is most of the time. It searches the rendered text, so a word that only appears in continuation prose still finds its slide even though the room never sees that sentence.

# What goes on the slide {#on-screen}

## principle: Two ways to decide what the room sees | derived, or stated outright {.standard #two-modes}

**`C` toggles between the full text and the collapsed slide.** Collapsed is the default, and it is what the projector shows during a talk; the full text is the rehearsal and recap mode.

**What “collapsed” means is per chunk, and you choose the mechanism.** Either psi-slides derives the slide from your prose, or you state the slide explicitly. The next two chunks show both.

## example: Derived | first sentence of each paragraph, plus bold fragments {.wide #derived-mode}

**By default the collapsed slide is the first sentence of every paragraph plus any `**bold**` phrases from the rest.** This chunk is written that way – press `C` twice and watch what appears and disappears.

The mechanism costs nothing to author and it keeps print and screen in one text. It also imposes a real constraint: every paragraph has to open with a sentence that works as a standalone claim, and the **bold fragments have to read as bullets on their own**. Continuation prose is print-only.

That constraint is the right trade for argument-shaped chunks. It fights you when the chunk wants continuous explanation, which is what the next chunk is for.

> note: If the collapsed version of a chunk reads as a pile of cryptic one-word bullets, the fix is almost always fewer bolds and a stronger first sentence, not a different mode.

## example: Stated | `::: slide` and `::: script` {.wide #explicit-mode}

::: slide

- **`::: slide`** marks the block that is the screen. Everything else in the chunk is narration.
- **`::: script`** does the reverse: the chunk is the screen, and only the marked block is narration.
- Neither block is abridged. Lists, figures, and code render whole.

:::

You are reading the projector version of this chunk right now: the bullets above sit inside a `::: slide` block, and this paragraph does not. Press `C` and this sentence appears; press `C` again and it goes away. Nothing here was derived from a first-sentence rule, because the block says outright what belongs on screen.

Reach for `::: slide` when the slide wants to be tight bullets while the argument wants to be prose. Reach for `::: script` when the chunk is already slide-shaped and you only want to park a paragraph of narration next to it. A chunk may carry both, in which case the slide block wins and everything outside it is narration. Chunks with neither block keep behaving exactly as `#derived-mode` does, which is why no existing lecture changed when this landed.

> note: The lint density budget only counts the on-screen half. Narration is deliberately unbudgeted – writing it freely is the entire point of the explicit mode.

## question: Which mode does a chunk use? {.narrow #which-mode}

**A `::: slide` block if there is one, otherwise everything outside `::: script`, otherwise the derived first-sentence-plus-bold.** Three rules, checked in that order, per chunk.

::: expand answer-in-practice
**In practice you will mix them inside one lecture.** Principles and questions tend to be argument-shaped and do fine derived; long Befund or walkthrough chunks are usually easier to write with an explicit `::: slide`.

The tag vocabulary is a good predictor: `principle` and `question` chunks are short enough that derivation rarely bites, while `example` and `free` chunks at the top of their density budget are where the explicit mode earns its keep.
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

**Open `lectures/tutorial/source.md` with `--watch` running and change three things.** Every save rebuilds and reloads all open tabs over a WebSocket, so keep the audience, the speaker, and your editor visible at once.

::: cols 2

1. Change this chunk's tag from `exercise` to `principle`. The label appears, and `lint.js` starts complaining: the budget dropped from 350 words to 80.
2. Wrap the list in a `::: slide` block, then press `C` here. Everything else leaves the screen.
3. Add a `> note:` line under the heading, then look at the speaker's notes pane and at `print-notes.html`.

:::

> note: Watch mode picks a free port and injects a reload snippet into each output; production builds get none, which is why the committed HTML has no WebSocket code in it.

# Speaker cockpit {#speaker}

## free: Speaker view | the other window `S` spawned {.wide #speaker-s}

**The speaker view is the four-lane cockpit.** Press `S` in this audience view if you have not already – it opens `speaker.html` as a popup, and both windows adopt each other as peers over `window.postMessage`.

::: cols 2

**Four lanes, top to bottom:**

- **Column scrubber** with clickable dots for every chunk.
- **Stage mirror** – identical layout to the audience at the same zoom.
- **Editable notes pane** below the stage, collapsed when the chunk has no notes.
- **Preview strip** of all chunks, scrollable and clickable.

**Everything stays in sync.** Chunk changes, reveal state, annotations, theme, font, zoom, expansion state, overview framing, figure focus, and the laser pointer all flow through postMessage snapshots. `V` freezes the projection when you want to read ahead without the room following, and thawing catches the room up to wherever you got to.

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

The notes pane starts at automatic height: one line when empty, up to three when it has content, collapsed entirely when the chunk has no notes at all. Once you drag it, the height becomes fixed and is remembered across lectures and reloads, which is usually what you want on a fixed lectern screen. The stage above it is a `1fr` grid row, so it gives up exactly the space the notes take and the audience mirror stays letterboxed at the projector's aspect ratio rather than distorting.

Vertical preview mode is worth trying on any screen with horizontal room to spare: the thumbnails get larger and their text becomes legible, which turns the strip from a position indicator into something you can actually read ahead in. Widen it with the drag handle and the effect compounds. Both the strip's height and its width are remembered separately, so flipping the orientation and flipping back returns each one to the size you gave it.

## example: N vs Shift-N | audience-visible vs private {.wide #notes-vs-annot}

**Two different note surfaces, one letter apart:**

::: side

**`N` (both views) is an annotation on the current chunk.** A textarea appears under the chunk; whatever you type is mirrored keystroke-by-keystroke to the other view. Use it for live marginalia – a rule you want on screen, a question you captured from the room, a correction during a talk.

Annotations persist in localStorage per lecture and travel with state snapshots. `Shift-E` on the speaker copies every live annotation as `> annot:` Markdown to your clipboard; paste it under the matching chunk heading in `source.md`, run `node build.js <source.md> --integrate-annotations`, and the text becomes a permanent Presentation Note – prefilled into the audience textarea and rendered inline in print.

> annot: The `> annot:` block you read here in print is the same mechanism exported from a previous run; the audience textarea above starts prefilled with this text.

::: flip

**`Shift-N` (speaker only) opens the private notes pane** below the slide. This is *your* memory aid, never mirrored. The pane is pre-filled from `> note: …` lines in source; your in-talk edits override the source text and persist per chunk in localStorage.

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

**Left flow.** Multi-column flow auto-balances: the engine fills top-to-bottom and lets content break wherever it fits. Avoid putting one long paragraph here; one column dominates and the other sits empty. Several short blocks are the sweet spot.

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

> note: The verb deliberately does not downscale. The heavy files are usually already at slide resolution – the bytes are PNG being a poor fit for photographic content. And figure focus zooms to 8×, so a high-resolution diagram is high-resolution on purpose; `--max-width` is opt-in for genuine outliers.

## example: Video | a clip is a figure that moves {.wide #video}

**Drop `clip.mp4` into `assets/` and write `![](clip)`** – the same shorthand as an image. The build searches the video extensions after the image ones, so an id with both a poster and a clip still resolves to the still.

Clips are inlined like any other asset, up to a separate 12 MB per-file cap: a clip is an order of magnitude heavier than a diagram, and the 2 MB image cap would reject every real one. Over the cap the build tells you the `ffmpeg` line that fixes it.

**There is no separate fullscreen setting, on purpose.** The native player already has a fullscreen button, and how large the clip sits on the slide is the chunk's width class – exactly like a still figure. Clicking a clip does *not* zoom it into the figure card either, because that would fight the play button.

**A clip can also live on a web server:** `![](https://host/clip.mp4)` works and stays an ordinary player, which matters more than it sounds – play, pause and seeking still synchronise between the two windows, which no YouTube or Vimeo embed can do.

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

**Fonts are the price of the single-file promise.** A lecture with math inlines only the KaTeX font families its formulas actually use, typically around 130 KB of the full 254 KB; a lecture without math inlines nothing at all. The build prints which it did.

> note: A malformed formula does not fail the build – KaTeX renders it in red so a typo never blanks the projector mid-lecture. The terminal reports it instead, and `lint.js` warns about a `$$` you forgot to close.

# Writing chunks that work {#craft}

## principle: The topic sentence is the slide | so write the opening line for the projector {.standard #topic-sentence}

**In derived mode the room reads your first sentences, so each one has to be a claim that survives without its paragraph.** Everything after it is print.

**That rule doubles as a rehearsal test.** If the collapsed chunk would not remind *you* what you meant to say, the chunk is not finished yet.

> note: Present this chunk from the collapsed view while you say it. Nothing lands the argument faster than a slide that is visibly the same text the handout carries.

## example: Four ways a chunk goes soft {.wide #anti-patterns}

**Most chunks that read badly on the projector fail in one of four ways**, and each one is a single edit away from working.

::: slide

- **Label bolds.** `**Consequence:**` collapses to a bullet reading “Consequence” and nothing else. Put the claim inside the sentence.
- **One-word bolds.** A lone `**not**` becomes a cryptic bullet. Bold a phrase that stands alone, or bold nothing.
- **Connector openers.** “That was deliberate.” carries no claim. Say the thing itself in the first sentence.
- **Colon cuts.** If the substance sits after a colon at the end of the opening sentence, the cue dangles. Rewrite it as one sentence.

:::

All four share a shape: they read fine inside a paragraph and fall apart the moment the paragraph is taken away. Walking your own lecture once in collapsed mode, before you teach it, catches every one of them.

When several parallel items pile up inside one paragraph, use a real Markdown list instead of scattering bold across the prose. A list stays legible when abridged; micro-bolding almost never does.

> note: The recurring temptation is to fix a weak collapsed view by adding more bold. It is nearly always the wrong direction – fewer bolds and a stronger opening sentence is the fix.

## question: Derive it, or state it? {.standard #choose-mechanism}

**Derive while the chunk is an argument of one to three paragraphs; state the slide once the argument wants continuous prose.** Try the derivation first – if it keeps fighting you, that is the signal, not a failure.

::: expand tag-as-predictor
**The tag predicts the answer surprisingly well.** `principle` and `question` chunks are short enough that the first-sentence rule rarely bites. `example` and `free` chunks near their density budget are where `::: slide` earns its keep, because those are the ones carrying a walkthrough or a finding rather than a claim.

A figure chunk plus a paragraph of interpretation is the other reliable case, and there `::: script` around the interpretation is less typing than wrapping the slide half.
:::

## exercise: The squint test {.wide #squint-test}

**Open your own lecture in the audience view, press `C` until it is collapsed, and walk it end to end without opening the source.** Stop at every chunk you could not narrate from what is on the screen.

::: cols 2

**For each chunk that fails**, ask in this order: is the opening sentence a claim, or a warm-up? Would each bold fragment read as a sensible bullet on its own? Is there a list hiding inside a paragraph?

**If all three answers are fine and it still reads badly,** the chunk wants `::: slide`. That is the honest outcome, not a defeat – the two mechanisms exist because neither one covers every chunk.

:::

> note: This is worth doing once per lecture, ideally the day before. It doubles as a rehearsal, because reading the collapsed deck is very close to actually presenting it.

# Next steps {#next}

## exercise: Read more | the artefacts that close the loop {.wide #read-more}

**Close this tab and poke around the real lectures and docs.** The tour covered the keys; the craft shows in authored content.

::: cols 2

**1. `lectures/python-intro/audience.html`.** A 36-chunk teaching lecture. Spawn its speaker with `S` and watch the layout vocabulary you just learned in real use, woven through reveals, expansions, and figure focus.

**2. `PRD.md`.** The design philosophy: why four views, why this tag set, why collapse has two modes and not four, why reveals are off by default in print. Short, pragmatic, linked to the code.

**3. `speaker.md`.** The sync protocol: which fields travel between the two windows, which stay local, and why the overview framing is a pure function of anchor, scale, and pan.

**4. `HANDOFF.md`.** Narrates what has been built, slice by slice, including the decisions deliberately *not* taken.

:::

## free: Authoring your own | `--new`, `--watch`, `lint.js` {.standard #authoring}

**Three CLI entries cover the full authoring loop:**

- `node build.js --new <slug>` scaffolds a lecture folder with valid frontmatter and two chunks. It builds cleanly the moment it lands on disk.
- `node build.js <source.md> --watch` gives live-reload in every open tab.
- `node lint.js lectures/` runs the static checks: unknown tags, unclosed directives, duplicate IDs, density budgets, reveal overuse, orphan columns, redundant figure captions. `--strict` makes warnings fail.

A source file can silence one check with `<!-- linter: ignore reveal-overuse, density -->` anywhere in the body.

## example: Embedding your own type | `fonts/` plus a frontmatter block {.wide #fonts}

**By default the type is named, not carried.** The stylesheets ask for Literata, Inter Tight and JetBrains Mono and fall back to system faces where those are not installed – so a lecture opened on a strange machine keeps its layout and loses its face.

To carry the type, put the files in a `fonts/` folder beside `source.md` and name the families:

```yaml
fonts:
  serif: Literata
  sans: Inter Tight
  mono: JetBrains Mono
```

Files are matched by name and the suffix gives weight and style: `Literata-Regular.woff2`, `-Bold`, `-Italic`, `-BoldItalic`, `-600`, `-600italic`, or a variable file named `Literata[wght].woff2`. Naming a family with no matching file fails the build – a silent fallback is exactly what this feature exists to prevent.

**Check the licence first.** Embedding redistributes the font file. The SIL Open Font License and Apache-2.0 – which between them cover nearly all of Google Fonts – allow it; most commercial desktop licences do not, and want a separate webfont licence. The build prints a reminder and verifies nothing.

## example: Pinning how a lecture opens | five optional frontmatter keys {.wide #view-defaults}

**A lecture can decide its own starting look instead of inheriting the reader's.**

```yaml
---
title: Anonymous Communication
font: mono              # serif | sans | mono
theme: terminal-green   # light-{red,teal,blue,orange} | terminal-{amber,green}
collapse: none          # topic-bold | none      – the C toggle
auto-fit: true          # true | false           – the # toggle
slide-numbers: off      # vertical | horizontal | off
---
```

`lang:` sits beside them and is a different kind of key: it names the document language (`en` by default, `de`, `de-DE`, `fr` …) and lands in the `lang` attribute of every view. The print views use it to pick a **hyphenation dictionary**, which is what lets a long German compound break instead of pushing a hole into the line. The live views deliberately do not hyphenate: a broken word on a projection reads badly.

**The precedence rule is one sentence.** A key that is present wins over the reader's stored preference; a key that is absent leaves that preference alone. So a lecture that pins nothing behaves exactly as it always did – font, theme and slide numbers follow the reader from lecture to lecture – while a lecture with a designed look gets it without asking anyone to press keys.

`slide-numbers` reaches the print views as well, since a document has no keyboard to cycle it with. An unknown value fails the build with the list of valid ones rather than being ignored, because a silently dropped setting looks exactly like a setting you forgot to write.

> note: When finishing this tour with a first-timer, end by asking them what felt discoverable and what did not. Their first-impression friction is the most valuable feedback the tool will get.
