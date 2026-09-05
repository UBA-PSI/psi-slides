---
name: psi-slides-authoring
description: Write or edit a psi-slides lecture source.md – chunk grammar (## type: Heading | Sub {.width #id}), the ::: directive vocabulary (expand, margin, marginalia, cols, cards, side/flip, slide, script, backdrop, overlay), reveal segments, speaker notes, image shorthand, KaTeX math, and the frontmatter keys (viewer defaults, cover variants, the style block, embedded fonts). Use when drafting a new lecture, restructuring or polishing an existing one, fixing lint findings from lint.js, or when a Markdown file has chunk headings like "## principle:" / "## definition:" or ":::" blocks. Not for changing build.js or lint.js themselves.
---

# Authoring psi-slides lectures

psi-slides turns one Markdown `source.md` into four self-contained HTML files:
`audience.html` (projection), `speaker.html` (presenter cockpit), `print.html`
(reading document), `print-notes.html` (document with the speaker notes folded
in). You never author four variants. You author one text, and mark which parts
of it belong on the screen.

Build and check:

```bash
node build.js path/to/source.md            # all four views, written next to the source
node build.js path/to/source.md --watch     # live reload while writing
node lint.js path/to/source.md              # static checks; --strict makes warnings exit 2
node build.js --new my-slug                 # scaffold lectures/my-slug/source.md
```

From a sibling content repo, call the engine by path: `node ../psi-slides/build.js lectures/<slug>/source.md`.

## Skeleton

```md
---
title: My Lecture Title
presenter: Prof. Dr. X
info: |
  Subtitle line
  Course line
  Term line
course: my-course
lecture: my-lecture
---

## title: {#title}

# Opening {#opening}

## principle: The claim the lecture explains {.standard #opening-claim}

**State it in the first sentence.** Then explain it in continuation prose.

> note: Speaker-only reminder for this chunk.

# Mechanics {#mechanics}

## example: A worked case {.wide #worked-case}

Body text.
```

## Grammar

### Frontmatter

`title`, `presenter` and `info` render the title slide. `course` and `lecture`
are metadata and worth keeping stable. Two further blocks are optional and
documented below: **viewer defaults** and **embedded fonts**.

### Columns

`# Column Heading {#column-id}` starts a column, the top-level horizontal unit
of the live deck. A chunk may appear before the first `#`; that is how the
`title` chunk is normally authored.

### Chunks

```
## type: Heading | quieter sub-heading {.width #id}
```

- `type:` is optional. Without one the whole line is the heading and the chunk
  renders and lints as `free`. A lowercase `word:` prefix that is *not* one of
  the ten types is an `unknown-type` error, not a silent heading.
- `|` splits the heading into a main line and a typographically quieter second
  line. Further `|` segments are joined into that second line.
- The attribute tail recognises a width class, `#id`, and six other classes.
  Two are the chunk's own: `.bare` (keep the heading in the document and off
  the projection) and `.center` (set this chunk's prose on a centre axis, on
  the projection only). Four answer a `style:` key for this one chunk and are
  spelled key-value: `.blocks-left` / `.blocks-center` (where a code block, a
  figure and a display formula sit across the measure) and `.wrap-none` /
  `.wrap-balance` (whether this chunk's headings are balanced and its prose
  gets a protected last line). Any other class is an `unknown class` error in
  both the build and `lint.js` – it is not silently ignored. Do not invent
  classes.
- **One sigil rule for every `{…}` tail in the format**, on a heading, on a
  `:::` directive and inside a `::: draw` block: `.word` is a setting, `#word`
  an id, and inside a draw body also `@word` a group and `!word` a removal.
  Braces hold sigil tokens only, and a line that has no sigil tokens to carry
  has no braces – which is why the `::: draw` opener is written
  `::: draw 150x56 autoplay 1200 cycle`, the one primary argument positional
  and everything optional that carries a value a keyword after it. A token
  without its sigil is a `stray-attribute` error, never silently dropped –
  `{wide #id}` once built without its width – and so is an empty `{}`.
  A chunk class that answers a `style:` key is spelled `key-value`
  (`.wrap-none`, `.blocks-center`), because it names the key it overrides; a
  directive's slot words are bare (`.outline`, `.middle`), because the
  directive has a vocabulary of its own. Settings that answer one question are exclusive: the
  width, each `style:` key, and every slot of `cards`, `rows`, `overlay`,
  `backdrop` and `side`. Two answers to one question are a `same-slot` error
  (`{.wide .full}`, `{.wrap-none .wrap-balance}`, `{.top .middle}`); a flag
  such as `.bare` is a slot too, one whose default is not written.
- Headings carry **inline** Markdown, so backticks render as a real code span
  (`## free: Loops | for, while, and \`enumerate\` {.standard #loops}`). Block
  Markdown does not belong in a heading.
- Every non-title chunk needs an `{#id}`, unique across the whole file.
  **IDs are frozen once authored**: they anchor cross-references, the TOC,
  speaker-sync snapshots, exported annotations, and `localStorage`. Renaming a
  heading is free; renaming an id is not.

Types (ten, exhaustive) and what they mean in practice:

| Type | Use for | Word budget the linter enforces |
|---|---|---|
| `title` | the cover chunk, normally `## title: {#title}` | unlimited |
| `closing` | the last slide, drawn in the cover's composition with its own heading and body | 60 |
| `outline` | the running agenda – the lecture's parts, none live before the first one | 40 |
| `principle` | a claim, thesis, rule, takeaway | 80 |
| `question` | a posed question or framing problem | 80 |
| `definition` | a precise concept or formal statement | 200 |
| `example` | a concrete walkthrough or applied case | 250 |
| `free` | ordinary narrative prose, transitions | 250 |
| `exercise` | a student task | 350 |
| `figure` | an image- or diagram-led chunk | unlimited |

When in doubt, `free`.

`closing:` is the bookend and is the one exception to the rule that a
cover-shaped slide renders from frontmatter: its heading is what it says,
the sub-heading after the `|` is the second line, and the body is whatever
stays on screen while the audience asks questions. It draws the deck's own
`cover:` composition, carries **no** presenter line and **no** `info` block
- those would make it a copy of the title slide rather than an ending - and
never reaches for `cover-image` by itself. Two ways to give it a picture:
`closing-image: cover` in the frontmatter ends the deck on the picture it
opened with (any other value names a different one, in the same three forms
`cover-image` takes), which fills the composition's own picture slot on the
four covers that have one; a `::: backdrop` on the chunk is a full-bleed
ground behind the type and works on all ten. Put it last; the linter warns
if it is not.

```markdown
## closing: Questions? | office hours Thursday, 14-16 {#end}

Next week: certificates, and who you are actually trusting.
```

Widths (four, exhaustive): `.narrow` (28em), `.standard` (36em, the default),
`.wide` (52em), `.full` (72em).

**The type never sets the width.** They are independent axes: the type decides
treatment and budget, the width decides how much stage the chunk takes. In
particular `principle` is not a narrow type – prefer `.standard` for it, because
anything longer than one sentence turns into a tall thin ribbon in `.narrow`.

**A chunk with a top-level code block wants `.wide` or `.full`.** A `<pre>` that
is not inside a `::: side` or `::: cols` breaks out of the text column to 72vw
and centres on the slide. Measured at 1600×900 and the default zoom, that is
1152 px – exactly the prose column of `.wide` and `.full`, and 310 px wider than
`.standard`'s 842 px. So in a `.standard` chunk the listing sticks out past both
edges of the paragraph above it and reads as a rendering fault. The line-length
budget is unaffected (it is 72vw at every width); this is about the block and
its own prose lining up.

**The line-length budget itself is about 78 characters**, and it is the same at
every chunk width for that same reason - a top-level block gets 72vw whether the
chunk is `.narrow` or `.full`. Inside one pane of a `::: side` the block stays in
its local container and the budget is about **36**. The number is measured
against the bundled JetBrains Mono at 0.60 em per character; `mono: Noto Sans
Mono Condensed` measures 0.50 and buys about **94**. It holds for any 16:9
window, because the base font is a fraction of the slide height.

Going over is not an error. `clampZoomToWidth()` shrinks **that one slide** so
the line still fits - never the lecturer's zoom, which is global and comes back
on the next chunk. So a heavily clamped chunk reads smaller than its neighbours,
and the fix is to break the line rather than to make the runtime try harder.

The live views do **not** print the type name on screen. Do not write prose that
depends on the audience seeing the word DEFINITION.

## What lands on the slide

The audience view starts collapsed (`data-collapse=topic-bold`); `C` toggles to
the full text. What “collapsed” means is decided per chunk, by three rules
checked in order:

1. The chunk has a `::: slide` block -> **only that block** is on screen.
2. The chunk has a `::: script` block -> **everything except that block** is on
   screen.
3. Neither -> **derived**: the first sentence of every paragraph, plus any
   `**bold**` fragments.

Rule 3 is the default and the right choice for most short, argument-shaped
chunks. Rules 1 and 2 exist because the derivation is a real writing constraint
that fights continuous prose. Mixing all three within one lecture is normal.

### Derived chunks (rule 3)

Every paragraph must open with a sentence that stands alone as a complete
claim. Continuation prose is print-only when collapsed; only `**bold**`
fragments survive as extra prompts.

```md
## definition: Public-key cryptography {.wide #public-key}

**Each party holds a key pair.** The private key never leaves the device; the
public key is freely distributed.

The signing operation binds a message to the private key. **Verification
succeeds only with the matching public key.**
```

Collapsed, the audience sees the two opening sentences plus the promoted bold
fragment. The squint test: heading + first sentences + bolds – could you
present the chunk cold from that alone?

Bold selects, it does not stress. How a bold phrase looks is a lecture-wide
setting – `style: {bold: …}` live, default `plain`; `style: {print-bold: …}` on
paper, default `bold` – and to stress one word inside a bold phrase you write
it `*em*`: upright, bold and in the accent in every view
(`**the check runs *before* any signature is requested**`). `*em*` outside a
bold phrase is the ordinary italic.

Bold sparingly. Each bold fragment becomes its own prompt, so a scatter of
one-word bolds collapses into cryptic stubs. See `reference/style.md` for the
full topic-sentence and bold audit, the recurring anti-patterns, and the prose
and typography rules.

### Explicit slide content (rules 1 and 2)

```md
## example: What the experiment showed {.wide #findings}

::: slide

- The tutor condition sits **below** both AI conditions
- The effect holds across all three cohorts

:::

The finding was the most unexpected observation of the experiment, and it does
not follow from the order of collection: the cohorts were rotated, and the gap
survives every rotation.
```

`::: script` is the dual – the chunk body is the slide and only the marked
block is narration, which is less typing when the chunk is already slide-shaped:

```md
## definition: Anonymity set {.standard #anon-set}

The anonymity set is the set of all senders who could plausibly have sent an
observed message.

::: script
Formally an equivalence class over the attacker's observation model, and the
model decides the size.
:::
```

Semantics worth knowing:

- **Nothing inside an explicit block is abridged.** Sentence extraction skips
  those subtrees, so paragraphs, lists, figures, and code render whole. You do
  not need to bold anything for it to survive.
- **Both blocks may appear in one chunk.** Rule 1 wins: the `::: slide` block
  is the screen, and the `::: script` block plus any loose prose are narration.
- **Print and the un-collapsed reading mode show both halves** in source order.
  Nothing you write is ever lost.
- **The lint density budget counts the on-screen half only** – the `::: slide`
  block if there is one, otherwise everything outside `::: script`. Narration
  is deliberately unbudgeted, so a density warning on an explicit-mode chunk is
  never a false alarm about your narration.
- **One block of each kind per chunk.** A second one lints as a warning.

Choosing:

| Situation | Use |
|---|---|
| Short claim or posed question, 1 to 3 paragraphs | derived |
| Chunk already reads as a tight bullet list | derived, or `::: script` for the narration |
| Long finding or walkthrough, prose-shaped argument | `::: slide` |
| Figure chunk plus a paragraph of interpretation | `::: script` around the interpretation |
| Collapsed view reads as cryptic one-word bullets | fewer bolds and a stronger opening sentence first; if it still resists, `::: slide` |

Migration rule for existing lectures: do nothing. Chunks without either block
behave exactly as before.

## Reveal segments

A line that is exactly `---` inside a chunk body, outside a code fence, is a
**reveal boundary**, never a horizontal rule. `Space` uncovers one segment at a
time in the audience view; print flattens them. Inside a fence, `---` is
literal. Use `***` if you genuinely need a rule.

```md
Start with the setup.

---

Then show the complication.
```

Use reveals for pacing, not per chunk. Over half the chunks using reveals
raises a `reveal-overuse` warning, and a chunk needing many reveals is usually
several chunks.

## Speaker notes

```md
> note: Pause here.
> Tie the later examples back to this sentence.
```

`> note:` opens the block; later `> ` lines continue it; the block ends at the
first non-blockquote line. A second `> note:` starts a **new** note, so never
prefix continuation lines. Notes appear in the cockpit and in
`print-notes.html`, never in the audience view or `print.html`. A note written
before the first chunk attaches to the next chunk.

Notes are the right home for reminders, caveats, timing, demo fallbacks, and
anything you say aloud but would not project.

## Images

```md
![](diagram-name)            # shorthand: assets/diagram-name.{svg,png,jpg,jpeg,gif,webp}
![Alt text](assets/pic.png)  # explicit path also works
```

The shorthand resolves a bare target with no slash and no extension against the
lecture's `assets/` folder, first match wins; a missing file renders a visible
placeholder.

In a `figure` chunk the heading is already the caption, and alt text becomes a
`<figcaption>` stacked under it – three labels in a pile. Prefer `![](fig-id)`
there unless you really want the separate caption (`figure-caption-redundant`
warns about this).

Assets are inlined into the outputs by default (auto-inline while the total is
under 10 MB). **A single asset over 2 MB fails the build**, because the
alternative is an HTML file that looks right on your machine and shows a broken
figure everywhere it travels. Fix it by format, not resolution:

```bash
node build.js <source.md> --optimize-images --dry-run   # report, write nothing
node build.js <source.md> --optimize-images              # convert rasters >= 512 KB to WebP q92 in place
```

Needs `cwebp` or `magick` on `PATH`. Shorthand refs need no edit afterwards;
explicit paths in `source.md` are rewritten for you. SVG is never touched: it
is spliced inline as a real `<svg>` element so it inherits the theme colours.
`--no-inline-images` is the escape hatch that ships external paths on purpose.

## Math

`$inline$` and `$$display$$` render with KaTeX at build time. No flag, no
runtime loader; the required font faces are inlined only into views that
actually contain a formula.

```md
The collision bound is $O(\sqrt{n})$ for a birthday attack.

$$
\Pr[\text{collision}] \approx 1 - e^{-k^2 / 2N}
$$
```

Rules that matter while authoring:

- A literal dollar is `\$`. That escape is what keeps a price list out of math
  mode.
- The inline rule refuses to cross a backtick or a newline, so a `$` in prose
  cannot pair with one inside a code span. Keep it that way: do not try to
  write an inline formula that spans lines.
- `$$ ... $$` must be closed. An unclosed one raises `unclosed-math`.
- This is KaTeX, not LaTeX: no equation numbering or `\ref`, no `mhchem`, no
  TikZ. Check KaTeX's supported-functions list before committing a
  mathematics-heavy lecture.

## Code fences

Fenced blocks are highlighted at build time by Shiki, and reveal parsing is
fence-aware. Use a language label (`python`, `bash`, `javascript`,
`typescript`, `html`, `css`, `c`, `json`, `yaml`, `markdown`, `sql`, `toml`,
`diff`, `text` are all in use). An unknown label is not an authoring decision
to make on your own: adding a language means editing `SHIKI_LANGS` in
`build.js`.

## Directive vocabulary

Two kinds of `:::` block exist. **Chunk-attached asides** (`expand`, `margin`)
are lifted out of the body; **layout wrappers** (`cols`, `side`/`flip`,
`marginalia`, `slide`, `script`) stay inline in the body. A bare `:::` closes
the innermost open layout wrapper, and if none is open, the enclosing `expand`
or `margin`.

### `::: expand <label>`

```md
::: expand backup-plan
If the demo fails, switch to the recording and keep narrating the same fields.
:::
```

Clickable expansion in the live views (`Enter` or `1`-`9` opens one), inlined
in print. The label is what the UI shows. The first sentence inside an
expansion is subject to the same collapse derivation, so it should stand alone
too.

### `::: footnote`

```md
::: footnote
Short supplementary context that should stay visually secondary.
:::
```

A quieter always-visible note attached to the chunk, set under the body with a
small NOTE label over a dotted rule. Use for short context, not a second
argument. It stays in the middle column, has nothing to click, and takes no
label of its own – that is the whole of the difference from `::: marginalia`,
which goes out into the slide margin and *is* clickable.

`::: margin` is the older spelling and still builds, so no existing
`source.md` breaks. Do not write it in anything new: it was one keystroke from
`::: marginalia`, a different construct in a different place, and it named the
one place the block never sits.

### `::: cols 2` / `::: cols 3`

A multi-column flow inside the chunk body. **The audience view's default
collapse mode folds it back to one column, so on the projection `::: cols` does
nothing.** That is deliberate: collapsed content is one topic sentence per
paragraph, and the browser can only balance in whole paragraphs, so two columns
of stubs look broken. But it makes `cols` a **print-and-reading-mode
construct**, and the consequence is worth stating in the audience's terms rather
than the renderer's: content you write in `cols` because it is too long for one
column arrives on the projection as one column of exactly that length. A
six-definition quiz written as `::: cols 2` was projected as eleven unbroken
lines of 70-character prose.

**For two- or three-up content the audience has to read, use `::: cards` or
`::: rows`.** Both survive the collapse in full. Author `cols` for a handout
whose reader can scroll.

### `::: side` with `::: flip`

```md
::: side
**Device-bound**

Private key stays on one token.
::: flip
**Synced**

Private key travels across the user's devices.
:::
```

Two panes: everything before `::: flip` is pane A, everything after is pane B.
`::: flip` only means anything inside an open `::: side`.

`::: side 2:1` divides the measure unevenly. `::: side {.middle}` centres the
shorter pane against the taller one, which is what two lines of prose beside a
tall figure want - without it the prose sits at the top and the rest of its
half is empty. Both may be written, ratio first: `::: side 2:1 {.middle}`. The
default is `{.top}`, which is what a bare `::: side` has always drawn, and it is
often the right one: a caption above a figure is aligned from the top on
purpose. It is the block's setting rather than each pane's, because the taller
pane is what makes the row tall and centring cannot move it.

### `::: marginalia`

An aside that extends into the right margin, part of the body layout
vocabulary rather than the expansion system, and separately focusable in the
live views.

The slide itself is framed as if the aside were not there, so the aside runs
off the right edge of the frame and is cut off by it – that is what tells a
reader there is more of it. Clicking it slides the frame right until all of
it is on screen; `Esc`, or a click on the slide, gives the frame back. So
write it to be read *after* the slide, not with it, and keep it short: a
marginalia shares the chunk's height and cannot grow taller than it.

### `::: slide` / `::: script`

Covered above. In directive terms they behave like the other layout wrappers:
they nest inside `::: cols` or `::: side`, they work inside an `expand` or
`margin`, and a bare `:::` closes them.

### Nesting

Layout wrappers nest inside an `expand` or `margin`. Do not nest `expand`
inside `expand`, or `margin` inside `expand`.

```md
::: expand compare
::: side
Left
::: flip
Right
:::
:::
```

The first closer ends `side`, the second ends `expand`.

### `::: cards N`

N equal cards in a row, each on a subtle ground. **Not a second spelling of
`::: cols N`**, and the difference is the reason to pick one: `cols` is one
text flow the browser balances across N tracks, so a paragraph can spill from
the foot of one column into the head of the next; `cards` is N *containers*,
and an item is whole or it is nowhere.

```markdown
::: cards 3
- **Measure** what a page does when a crawler asks for it
- **Probe** the detector until it names itself
- **Report** what that costs a measurement study
:::
```

A lone list dissolves into the grid, so its items are the cards; anything else
contributes one card per block. Counts 1 to 6 - one card is a callout, and in
a `::: side` pane it is the narrow stacked column. Use `cols` for an argument
that runs long and `cards` for a comparison the audience should be able to count.

Seven slots in the tail, and two decide themselves:

| slot | words (first is the default) |
|---|---|
| size | `.auto` `.large` `.medium` `.small` |
| align | `.auto` `.left` `.center` |
| anchor | `.top` `.middle` |
| detail | `.fold` `.show` `.page` |
| ground | `.panel` `.outline` `.clear` `.accent` `.paper` `.photo` |
| corner | `.round` `.square` |
| scrim | `.veil` `.invert` `.plain` |

`auto` size counts the words in the longest item - three or fewer is large,
twelve or fewer medium, else small - and applies to the whole row, never per
card. `auto` align follows it, except where the row has a second level, which
ranges left.

`detail: fold` keeps nested levels off the projection and gives them to the
document and to `C`. `detail: page` never unfolds at all, and that is what to
reach for when the second level is a *paragraph*: unfolding one of those in
place wrecks the row, so it stays the hand-out's.

`ground: photo` makes the card's first picture its ground, and `scrim` says
what veils it - `veil` is the theme's own paper, so ordinary ink stays legible
in every theme; `invert` darkens and turns the card's ink light; `plain`
leaves the picture alone. A scrim on a row with no picture is an error. A
picture that is *not* the ground bleeds to the card's edges with the text
beneath it, which is the other useful shape.

**Open a card with bold and the break decides what it means:**

```markdown
- **panel** a tinted fill…      lead-in - own line, ordinary leading
- **Measure**\                  heading - own line, and air under it
  what the page does
```

**A card row is refused inside `cols`, `marginalia`, `expand`, `margin` and
`overlay`** - it needs the whole measure and those have already divided it.
`::: side` is fine, because a pane is a container with a width the row can
fill, and so are `slide` and `script`, which divide nothing.

### `::: rows`

The same container turned ninety degrees: a term in a card on the left, its
body beside it, several stacked. Same slots as `::: cards`, no count - a row
block has one column by definition.

```markdown
::: rows {.accent}
- **Separatism** Engineers do the technical work; managers take the decisions.
- **Technocracy** Engineers should take them, because they understand them.
:::
```

Three defaults differ from a card row, and each is deliberate: `anchor` is
`middle`, because a one-line term against a three-line body's first line reads
as a mistake; `align` names how the term sits *in its card* and the body always
ranges left; and the automatic size is capped at `medium`, because a term is a
label in a column rather than a headline across the slide.

Reach for `rows` when a term needs a sentence, and for `cards` when a
comparison needs counting.

**Bold is not required.** The sentence splitter walks paragraphs, never list
items, so everything written in a card is on the slide; folding the nested
level is the only thing that takes anything away.

### `::: backdrop <ref> {…}` and `::: overlay {…}` – `::: backdrop dusk {.cover .invert}`, `::: overlay {.bottom-left .ink}`

A full-bleed picture behind the whole slide, and a grounded text block laid over
it. The backdrop is one line with no closer; the overlay is a block.

```markdown
## figure: {#skyline .full}

::: backdrop city-at-night {.invert .blur}

::: overlay {.bottom-left .ink .wide}
### Every endpoint is a sensor
A crawler that looks like a browser gets measured back.
:::
```

The backdrop takes the same three forms an image does - a bare asset id, a
relative path, an https URL. Both class tails are **closed vocabularies, one
word per slot**; two words from one slot fails the build, as does a word from
no slot.

| directive | slot | members (first is the default) |
|---|---|---|
| `backdrop` | fill | `.cover` `.contain` |
| | crop | `.middle` `.top` `.bottom` |
| | scrim | `.veil` `.clear` `.invert` |
| | focus | `.sharp` `.blur` |
| `overlay` | place | `.center` `.top-left` `.top` `.top-right` `.left` `.right` `.bottom-left` `.bottom` `.bottom-right` |
| | ground | `.paper` `.ink` `.accent` `.clear` `.glass` |
| | width | `.standard` `.narrow` `.wide` `.full` |

`veil` is the theme's own paper at 80%, so ordinary ink stays readable over a
photograph in every theme; `invert` turns the slide's ink light instead. Give a
photograph-backed slide its text in an **overlay** rather than in the body:
words laid straight onto a picture are unreadable at the back of a room, and the
overlay's ground is what fixes that.

One backdrop per chunk. A second is an error.

### Two more directives this skill does not cover

`::: draw` and `::: embed` are also `:::` blocks, and neither is a layout
wrapper or an aside: each compiles to something of its own.

- **`::: draw`** takes `autoplay N` - N milliseconds per step - which walks
  the figure's own beats once the slide is on screen, and the first key, click
  or scroll *on that slide* retires the clock for it. (Scoped to the slide, not
  to the session: you reach a slide by pressing a key, so a session-wide flag
  meant the arrival keypress killed the figure before it was on screen.) Between 200 and 60000. Add `cycle` to repeat the
  walk (`autoplay 1200 cycle`); `cycle` alone is an error. Use it on a cover
  figure; on a slide you are talking over, press Space.
- **`::: draw`** is a figure written as text - named boxes, arrows,
  containers, charts, tables, swimlanes and sequence diagrams, laid out at build
  time and steppable on the same key that advances a reveal segment. It has its
  own grammar, seventeen statements and forty classes, and two documents:
  `figure-design.md` for how to lay one out so a room can read it, and the
  `#diagram` chunks of `lectures/tutorial/source.md` for the vocabulary. Read one
  of those before writing a block; do not guess at the syntax from a nearby
  example. Two of those statements are the ones authors pick the wrong one of:
  `lanes` puts who down the side and lets the reading direction carry the time,
  `sequence` puts who across the top and makes the vertical axis the time
  itself - steps parcelled out to the people responsible for them is the first,
  messages passing between them is the second.
- **`::: embed <url>`** frames a hosted player, YouTube or Vimeo. It is the one
  construct that makes an output fetch from a third party while the lecture is
  being given, so reach for it only when a local clip - `![](clip-id)` - will
  not do.

Neither is in a tagged release yet. A lecture using them builds from this
repository and not against a released psi-slides.

## Viewer defaults in frontmatter

Seven optional keys pin how the lecture opens. A key that is present wins over
the reader's stored preference; a key that is absent leaves that preference
alone. A value outside the allowed set fails the build (and lints as
`unknown-view-default`), because a typo here is otherwise silent.

```yaml
font: serif            # serif | sans | mono
theme: light-red       # light-red | light-teal | light-blue | light-orange | terminal-amber | terminal-green
collapse: topic-bold   # topic-bold | none
auto-fit: shrink       # true | false | shrink
slide-numbers: horizontal    # vertical | horizontal | off   (default: horizontal)
print-slide-numbers: vertical  # the same three, for print.html and print-notes.html
                               # left out, it follows slide-numbers
editor: speaker        # both | speaker | none  - where the diagram editor ships
```

`auto-fit: shrink` is the mode to reach for first: it leaves the zoom where the
lecturer set it and only ever makes a slide smaller, where `true` also grows a
short one to fill the screen. `#` cycles off → shrink → on.

Pin only what you have actually designed for. A lecture that pins nothing keeps
following whatever the reader last chose with `F`, `A`, `C`, `#` and `L`.

## The cover, and lecture-wide type

`subtitle:` is the key most covers are missing. Without it the one line that
says what the talk is *about* has nowhere to go but `info`, where it renders at
meta size beside the room and the date.

```yaml
title: How Caches Forget
subtitle: Eviction, Staleness and the Cost of Being Wrong
presenter: Jana Wieland
info: |
  Nordic Systems Days · Bergen · 12 to 15 October
cover: masthead         # see the table below
cover-image: skyline    # only the four picture covers take one;
                        # on the six type covers it is an error
closing-image: cover    # the ## closing: slide ends on the same picture;
                        # or name a different one, same three forms
```

The list runs quiet to loud, which is the only question it asks you.

| cover | picture from | what it is |
|---|---|---|
| `classic` | - | the lower-left third, all type. **The default** |
| `masthead` | - | the title along the top edge, the credits along the bottom, the field between empty |
| `stack` | - | the title block centred on both axes |
| `display` | - | the title set to fill the slide; the scale is the design |
| `panel` | - | the type on a full field of the theme's accent |
| `split` | `cover-image` | type left, the picture **bled** off the right edge |
| `hero` | `cover-image` | the picture is the slide, type reversed out of a gradient |
| `beside` | **the chunk body** | the art **inset** to the right of the title |
| `above` | **the chunk body** | the art on top, title centred in the band below |

`split` or `hero` with no `cover-image` fails the build rather than drawing an
empty half.

**The five type covers each take a `::: backdrop` too**, which is how a picture
reaches a cover with no picture slot of its own. On `panel` the field becomes
the scrim, so the photograph reads through a plate of the accent instead of
under the paper veil every other backdrop gets.
**`beside` and `above` take their art from the title chunk's own body**, which
is how a `::: draw` becomes the cover - a diagram is not a file, so
`cover-image` can never name one. On those two the body is the art and `info:`
still supplies the meta; everywhere else a non-empty body replaces `info`.

```markdown
## title: {#title}

::: draw 150x56
box crawler "Crawler" {.tone-1}
box site "Web site" below crawler gap 1.1
edge crawler -> site "request"
:::
```

`split` bleeds and `beside` insets, and that is the whole reason both exist: a
photograph wants the edge, a drawing wants a margin. `cover-ratio: 42%`
(15-75) sets how much of the slide the picture takes on `split`, `beside` and
`above`; written on a cover that does not divide the slide it is an error.

## Section dividers

A column with a `# Heading` opens with a divider slide. `section:` picks how it
is drawn, and every option is quieter than the cover on purpose - a divider
that can be mistaken for the title slide has failed at its one job.

```yaml
section: tinted         # plain | tinted | rule | card | number
section-mark: Teil      # any short word, or none (the default)
```

| | what it is |
|---|---|
| `plain` | the heading alone. **The default** |
| `tinted` | the whole slide takes the accent, lightly. The strongest signal across a room |
| `rule` | the heading between two rules. The quietest, and it survives a monochrome print |
| `card` | the heading on a panel |
| `number` | a large counter above the heading, counting the columns that have one |

There is no paragraph sign over the heading any more - it read as a statute
number to anyone outside a German law faculty. Put a word there with
`section-mark:` if you want one.

## Typefaces, ligatures, and the 1.0 layout

Three families travel in any one output, and which three the lecture chooses.
A **bundled** family needs no file in `fonts/`:

| role | default | alternates |
|---|---|---|
| serif | Literata | Source Serif 4, Bitter, Noto Serif, Roboto Serif |
| sans | IBM Plex Sans | Inter Tight |
| mono | JetBrains Mono | Noto Sans Mono Condensed |

Among the serifs, **Bitter** is the sturdiest on a projection and the smallest
file; **Roboto Serif** has the strongest bold but is 8% wider than Literata, so
it re-wraps a deck that was written against another face.

```yaml
fonts:
  sans: Inter Tight
  mono: Noto Sans Mono Condensed
ligatures: text     # text | none | all
style:
  wrap: balance     # balance | none
```

The condensed mono is a pinned instance of Noto Sans Mono's width axis, not a
different typeface: 0.50 em per character against JetBrains Mono's 0.60, at
54 KB. Slashed zero, three distinct shapes for `I` `l` `1`. Iosevka reaches the
same width and is deliberately not bundled - 961 KB per face - but works from
`fonts/`.

`ligatures: text` is the default: fi and fl in prose, none in code. `all` puts
the code ligatures back, so `->` draws as one arrow glyph - which is why it is
off, since in the figure grammar `->` and `--` are two different edges and a
listing on a slide is source a reader retypes.

**To lay a lecture out the way 1.0.0 did**, set `fonts: {sans: Inter Tight}`,
`ligatures: all` and `style: {wrap: none, bold: accent-bold, print-bold: accent-bold}`.
That is the whole of what has moved. There is deliberately no version key -
each of them is a preference in its own right, and a key naming a release would promise a rebuild of every
past release.

The `style:` block sets the type for the whole lecture:

```yaml
style:
  headings: left        # auto | left | center | off  - auto keeps the per-type treatment
  rules: off            # on | off              - the hairline above principle/definition
  labels: off           # on | off              - the generated type word (PRINCIPLE, EXERCISE...)
  link-codes: off       # on | off              - the mark after an external link
  heading-scale: 1.15   # 0.6 … 1.8
  body-scale: 0.95      # 0.6 … 1.8
  wrap: none            # balance | none        - how a heading breaks across lines
  blocks: left          # center | left         - where a code block, figure or formula sits
  hyphenate: all        # print | all | none    - which views break a word
  bold: accent          # plain | bold | italic | accent | accent-bold | accent-italic
                        #   - how a **bold** phrase looks live; plain is the default
  print-bold: italic    # the same six - on paper; bold is the default
```

`hyphenate: print` is the default and is what the tool has always done: the two
document views hyphenate their prose, the projection and the cockpit do not.
`all` puts it into the live views too – worth it for a German deck at `.narrow`,
where one compound noun opens a hole in the measure – and `none` takes it out
of the documents as well. It is a separate key from `lang:`, which picks the
dictionary and has to be right either way: without `lang: de` a German lecture
does not hyphenate anywhere, whatever this key says.

The two scales are multipliers on the tool's own scale, bounded to 0.6-1.8.
Reach for them on a whole deck, not to fix one chunk - a chunk that needs a
different size usually needs a different width class or less text.

`headings: off` takes every heading off the projection and keeps it in the
document, the contents list and the search - for a talk that is a run of
figures with speaker notes. `{.bare}` in a chunk's attribute tail is the same
switch for one chunk.

`{.center}` sets one chunk's prose on a centre axis, on the projection and in
the cockpit but not in the printed document. It reaches the chunk's own
paragraphs and nothing nested, so a list, a table, a code block and the prose
inside a `::: side` pane or a `::: cards` row all keep their left edge. Write
it for the one or two lines under a figure, where a left-aligned caption
starts at the far edge of a wide slide while the drawing sits in the middle.
Not for a paragraph of any length: centred prose loses the eye at the start of
each line, which is why this is a class you write rather than something a
`figure:` chunk gets by default.

`blocks: left` puts the three things on a slide that are not prose - a code
block, a figure with its caption, a display formula - on the prose's own axis
instead of centring them. Reach for it when a chunk is an argument with a
formula or a listing inside it: centred, the three land on three different
axes and the eye loses the step. Leave it alone when the block *is* the slide.
A `::: draw` is unaffected either way - a diagram fills the measure at every
chunk width, so there is no space beside it to align in.

**Two keys have a per-chunk form, and only two**: `blocks` and `wrap`, because
they are the two whose right answer changes from slide to slide. Write
`{.blocks-left}`, `{.blocks-center}`, `{.wrap-none}` or `{.wrap-balance}` in
the attribute tail; each is the key's name and one of its values, and the
chunk wins over whatever the deck said. Both directions exist so a chunk can
say the non-default thing under either global default. Unlike `.bare` and
`.center`, both reach the printed document, because the keys they answer do.

`link-codes: off` takes away the mark after every external link. The mark
shows the address on both screens, large, with a QR code beside it; up to
1.0.0 that view was reachable only by `Shift`-clicking the link, which still
works.

`labels: off` hides the generated type word in **both** views: the document
renderer labels principle, question, definition and exercise, the projection
generates only EXERCISE. Separate from `rules`, which hides the bar and the
hairline - a word and a line are not one decision.

**A figure's all-caps heading is not a generated label.** It is the chunk's own
heading, so `## figure: {.wide #id}` with no heading text leaves it off the
slide - at the cost of the TOC entry, the search text and the printed heading.

## Embedded fonts

Drop font files into a `fonts/` folder beside `source.md` and name the families
in the frontmatter, and they are embedded into all four outputs:

```yaml
fonts:
  serif: Literata
  sans: Inter Tight
  mono: JetBrains Mono
```

Only the roles `serif`, `sans` and `mono` are read. Files are matched by
name-prefix, with weight and style taken from the suffix
(`Literata-Bold.woff2`, `Literata-600italic.woff2`, `Literata[wght].woff2`).
`.woff2`, `.woff`, `.ttf` and `.otf` all work; woff2 is much the smallest and
the build says so when you use anything else. Naming a family with no matching
file **fails the build** rather than falling back quietly.

Embedding redistributes the font file. OFL and Apache-2.0 families permit it;
most commercial desktop licences do not. The build prints a reminder and
verifies nothing.

## The linter

```bash
node lint.js lectures/                    # everything
node lint.js lectures/<slug>/source.md    # one file
node lint.js lectures/ --strict           # warnings exit 2
```

Rules you will meet while authoring: `unknown-type`, `unknown-class`,
`stray-attribute`, `same-slot` (the three every `{…}` tail can raise, heading
or directive – the message names which), `missing-id`, `duplicate-id`,
`multiple-ids`, `title-count`, `density`,
`duplicate-explicit-block`, `unclosed-directive`, `stray-directive`,
`stray-directive-close`, `nested-directive`, `unclosed-math`, `reveal-overuse`,
`orphan-column` (a column with fewer than two chunks),
`figure-caption-redundant`, `single-word-bold`, `figure-type-without-figure`,
`oversized-asset`,
`unknown-view-default`,
`unknown-style-setting`, `bad-backdrop`, `duplicate-backdrop`, `bad-overlay`,
`bad-cols`, `bad-cards`, `bad-rows`, `cards-nested`, `bad-side`,
`draw-in-cols`, `bad-cover-ratio`, `bad-unit`, `bad-autoplay` (a delay
outside 200–60000 ms, `cycle` with no autoplay, or autoplay on a figure
with no `step` block).

`single-word-bold` is the collapse audit made mechanical: a bold of two words
or fewer that lands *after* a paragraph's first sentence, where the projection
will show it with none of the prose around it. It only ever looks at chunk-body
paragraphs – a list item is shown whole and never triggers it, and neither does
anything in a `::: slide`, a `::: script`, a `::: cards` or a code fence. See
`reference/style.md` for the two fixes.

`figure-type-without-figure` is a chunk typed `figure:` whose body holds no
`::: draw`, image, `::: backdrop`, `::: embed` or code fence. The slide renders
identically either way, so this is not about the projection – the `O` overview
board and the speaker view both read the type, and a deck with eight `figure:`
chunks holding `::: cards` lists reports twice the figures it has.

**Two checks that were tried and deliberately not shipped**, because a
measurement said they could not work. Both are recorded so nobody builds them
again:

- *An enumeration check* – "a first sentence that names a count, in a chunk
  with no list" – to catch a paragraph that promises five kinds of something
  and then names them in prose the collapse drops. Measured across two
  repositories it produced 41 hits in this repo's own lectures alone, nearly
  all of them ordinary topic sentences: "One handshake, two flights.", "flush
  and align do two different jobs." Numerals are too common in good prose.
- *A cards-per-width check* – "four cards do not fit a `.wide` chunk". True of
  the deck it came from, and false in general: `lectures/decoration` and
  `lectures/tutorial` use `cards 4` and `cards 5` at `.wide` correctly because
  their labels are short. The predictor is the longest word against the column,
  which is typography, not source.

Both belong to `build.js --check-fit`, which measures the rendered result
instead of estimating it from the source.

## `build.js --check-fit`

Whether every slide fits the frame, measured in a browser. `lint.js` has no
browser, the density budgets are word counts, and `::: cards` and `::: rows`
are exactly the constructs that break the relation between words and height, so
a deck can reach `0 errors, 0 warnings` under `--strict` with a reading
sentence off the bottom of a slide.

```bash
node build.js <source.md> --check-fit [--viewport 1600x900]
```

Walks the built `audience.html` state by state – pressing the key, so a figure
step and a reveal each get measured – and compares each `.chunk-content` box
against `#stage-viewport`. **1600x900 is the default because a projector is
16:9**: `.wide` resolves through auto-fit, so the em and every wrapped card and
row are functions of the viewport, and two chunks that measured inside the
frame at a laptop's 1440x810 are 835 and 836 px tall in a 900 px 16:9 one.

**It reports two things and only one is a failure.** A chunk *taller* than the
frame is read by scrolling – the stage is a continuous column and walks down it
as reveals advance – and is reported as a note; `lectures/tutorial` has
eighteen. A chunk that *fits* the frame and is still outside it cannot be
excused that way, and is the failure, with exit 2.

**For a clipped chunk it also reports what the height is made of, because the
total sends an author at the wrong lever.** Under `topic-bold` the collapse
renders the first sentence of each paragraph plus every promoted bold and hides
`.sentence-rest .prose` outright, so **shortening a continuation changes the
collapsed height by exactly nothing**, while un-bolding one fragment removes a
whole line box. Measured on a chunk 52 px over: cutting every hidden
continuation to one word moved it 0 px; un-bolding a single fragment cleared it.
A rewrite that shortens the words while folding two bolds into one long first
sentence makes it worse, which is how this was found.

Degrades rather than fails: with no `playwright-core` or no Chrome it says so
and leaves the build's exit code alone. It reports the viewport it used, since a
room with a different aspect ratio wraps differently.

## `build.js --squint`

The squint test, mechanically. `--check-fit` asks whether the slide is inside
the frame; this asks what it *says*.

```bash
node build.js <source.md> --squint          # → squint.txt beside the source
node build.js <source.md> --squint --squint-out -        # → stdout
node build.js <source.md> --squint --viewport 1920x1080
```

It walks the built `audience.html` state by state and writes out the text a
room would actually get: the heading, the first sentence of every paragraph,
every promoted bold as the bullet it becomes, the lists and code and figures
and formulas that stay whole, and – marked as withheld, with a word count – the
continuation prose the collapse drops. What arrives on a later beat is marked
`+N`. Chunk-level constructs are in it too: a chunk that is nothing but a
`::: backdrop` and an `::: overlay` is a picture with a caption on it, not an
empty slide.

**It reads the rendered page and never `source.md`.** The collapse is CSS and
JS. Reasoning about a slide from the source is the mistake this exists to
catch, and an extractor that parsed the source would make the same mistake with
more confidence.

Read it for the four things the collapse is most often wrong about:

- a topic sentence that cannot stand alone – you are reading exactly what the
  room reads, with nothing under it;
- a `-` bullet that is a bare noun or a label, which is `single-word-bold` and
  its cousins seen from the other end;
- a slide whose only `.` line ends in a colon, with the substance on the `~`
  line under it: that is a slide announcing something and withholding it;
- a `~` count far larger than the words above it, which is a chunk written as
  prose and presented as a stub.

Speaker notes are counted, never quoted – they are the one thing certain not to
be on the projection, and `print-notes.html` is the file for reading them.

**What it cannot see** is in the file's own header: colour, contrast, overlap,
and anything below the fold. A slide can be in this file in full and unreadable
on the wall. `--check-fit` answers the frame; your eyes answer the rest.

Like `--check-fit` it degrades rather than fails, and it never fails a build:
it is a description of the projection, not a verdict on it.

A source file can silence checks with an HTML comment anywhere in the body:

```md
<!-- linter: ignore reveal-overuse, density -->
```

Silence a check when you have decided the shape is right, not to make a
warning go away unread.

## Workflow

1. Frontmatter, the `title` chunk, and the column headings.
2. Chunks with explicit types, widths, and IDs. Main argument as plain prose.
3. **Mechanism pass**: per chunk, decide derived / `::: slide` / `::: script`.
   Do this before polishing, because it changes what the prose has to achieve.
4. **Topic-sentence and bold audit** on the derived chunks. Squint test.
5. Reveals only where pacing matters; `expand` for optional detail, citations,
   backups; `margin` or `marginalia` only for genuinely secondary context.
6. **Prose and typography pass** – see `reference/style.md`.
7. `node lint.js <source.md>`.
8. `node build.js <source.md> --squint`, then read `squint.txt`: that is the
   squint test done mechanically, one line per thing the audience gets and every
   withheld paragraph marked with its word count. Anything fragmented goes
   back to step 3 or 4, and `git diff` on the file says what a prose edit did
   to the projection. Then open `audience.html` and press `O` for the overview
   board – repeated sentence openers, type monotony and over-dense chunks show
   up there and nowhere else – and `C` on any chunk the file made you doubt.

## Gotchas

- Only the ten types and four widths exist. Six non-width classes exist and no
  others: `.bare`, `.center`, `.blocks-left`, `.blocks-center`, `.wrap-none`,
  `.wrap-balance`; anything else is an `unknown class` error. `.bare` and
  `.center` are not legal on a `title` or `closing` chunk, where the cover
  composition decides all three questions; the four `style:` classes are, and
  `.wrap-none` on a cover breaks its title greedily.
- IDs unique across the file, and frozen once authored.
- `::: flip` requires an enclosing `::: side`.
- A bare `:::` closes layout first, then the enclosing `expand` or `margin`.
- `---` outside a fence is always a reveal, never a rule.
- One `title` chunk per lecture. Leave its body empty unless you deliberately
  want to override the frontmatter `info` lines, which a non-empty body does.
- Never commit the generated HTML. Rebuild it.

## Deeper reference

- `reference/style.md` in this skill – topic-sentence and bold audit,
  anti-patterns, prose and typography rules (en-dashes, typographic quotes).
- `lectures/tutorial/source.md` in the repo – the canonical authoring
  reference, a lecture that teaches the tool by being the tool.
- `lectures/python-intro/source.md` – the richest worked example of `cols`,
  `side` and `marginalia` together.
- `PRD.md` sections 2, 2.1, 3, 4.5 – the content model, type vocabulary,
  source format, and the explicit-slide rationale.
- `CLAUDE.md` – repo conventions and a map of `build.js`.
