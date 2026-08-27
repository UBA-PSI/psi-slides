---
name: psi-slides-authoring
description: Write or edit a psi-slides lecture source.md - chunk grammar (## tag: Heading | Sub {.width #id}), the ::: directive vocabulary (expand, margin, marginalia, cols, side/flip, slide, script), reveal segments, speaker notes, image shorthand, KaTeX math, and the frontmatter keys (viewer defaults, embedded fonts). Use when drafting a new lecture, restructuring or polishing an existing one, fixing lint findings from lint.js, or when a Markdown file has chunk headings like "## principle:" / "## definition:" or ":::" blocks. Not for changing build.js or lint.js themselves.
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
## tag: Heading | quieter sub-heading {.width #id}
```

- `tag:` is optional. Without one the whole line is the heading and the chunk
  renders and lints as `free`. A lowercase `word:` prefix that is *not* one of
  the eight tags is an `unknown-tag` error, not a silent heading.
- `|` splits the heading into a main line and a typographically quieter second
  line. Further `|` segments are joined into that second line.
- The attribute tail recognises exactly two things: a width class and `#id`.
  Any other class in `{...}` is silently ignored. Do not invent classes.
- Headings carry **inline** Markdown, so backticks render as a real code span
  (`## free: Loops | for, while, and \`enumerate\` {.standard #loops}`). Block
  Markdown does not belong in a heading.
- Every non-title chunk needs an `{#id}`, unique across the whole file.
  **IDs are frozen once authored**: they anchor cross-references, the TOC,
  speaker-sync snapshots, exported annotations, and `localStorage`. Renaming a
  heading is free; renaming an id is not.

Tags (eight, exhaustive) and what they mean in practice:

| Tag | Use for | Word budget the linter enforces |
|---|---|---|
| `title` | the cover chunk, normally `## title: {#title}` | unlimited |
| `principle` | a claim, thesis, rule, takeaway | 80 |
| `question` | a posed question or framing problem | 80 |
| `definition` | a precise concept or formal statement | 200 |
| `example` | a concrete walkthrough or applied case | 250 |
| `free` | ordinary narrative prose, transitions | 250 |
| `exercise` | a student task | 350 |
| `figure` | an image- or diagram-led chunk | unlimited |

When in doubt, `free`.

Widths (four, exhaustive): `.narrow` (28em), `.standard` (36em, the default),
`.wide` (52em), `.full` (72em).

**The tag never sets the width.** They are independent axes: the tag decides
treatment and budget, the width decides how much stage the chunk takes. In
particular `principle` is not a narrow tag – prefer `.standard` for it, because
anything longer than one sentence turns into a tall thin ribbon in `.narrow`.

The live views do **not** print the tag name on screen. Do not write prose that
depends on the room seeing the word DEFINITION.

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

Collapsed, the room sees the two opening sentences plus the promoted bold
fragment. The squint test: heading + first sentences + bolds – could you
present the chunk cold from that alone?

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

### `::: margin`

```md
::: margin
Short supplementary context that should stay visually secondary.
:::
```

A quieter always-visible side note attached to the chunk. Use for short
context, not a second argument.

### `::: cols 2` / `::: cols 3`

A multi-column flow inside the chunk body. Note that **collapsed view folds it
back to one column** on purpose: collapsed content is one topic sentence per
paragraph, and the browser can only balance in whole paragraphs, so two columns
of stubs look broken. Print and the un-collapsed reading mode keep your
columns. Author `cols` for content that has enough text to balance.

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

### `::: marginalia`

An aside that extends into the right margin, part of the body layout
vocabulary rather than the expansion system, and separately focusable in the
live views.

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

### Two more directives this skill does not cover

`::: draw` and `::: embed` are also `:::` blocks, and neither is a layout
wrapper or an aside: each compiles to something of its own.

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

Five optional keys pin how the lecture opens. A key that is present wins over
the reader's stored preference; a key that is absent leaves that preference
alone. A value outside the allowed set fails the build (and lints as
`unknown-view-default`), because a typo here is otherwise silent.

```yaml
font: serif            # serif | sans | mono
theme: light-red       # light-red | light-teal | light-blue | light-orange | terminal-amber | terminal-green
collapse: topic-bold   # topic-bold | none
auto-fit: 'false'      # true | false
slide-numbers: vertical # vertical | horizontal | off
```

Pin only what you have actually designed for. A lecture that pins nothing keeps
following whatever the reader last chose with `F`, `A`, `C`, `#` and `L`.

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

Rules you will meet while authoring: `unknown-tag`, `unknown-width`,
`missing-id`, `duplicate-id`, `multiple-ids`, `title-count`, `density`,
`duplicate-explicit-block`, `unclosed-directive`, `stray-directive`,
`stray-directive-close`, `nested-directive`, `unclosed-math`, `reveal-overuse`,
`orphan-column` (a column with fewer than two chunks),
`figure-caption-redundant`, `oversized-asset`, `unknown-view-default`.

A source file can silence checks with an HTML comment anywhere in the body:

```md
<!-- linter: ignore reveal-overuse, density -->
```

Silence a check when you have decided the shape is right, not to make a
warning go away unread.

## Workflow

1. Frontmatter, the `title` chunk, and the column headings.
2. Chunks with explicit tags, widths, and IDs. Main argument as plain prose.
3. **Mechanism pass**: per chunk, decide derived / `::: slide` / `::: script`.
   Do this before polishing, because it changes what the prose has to achieve.
4. **Topic-sentence and bold audit** on the derived chunks. Squint test.
5. Reveals only where pacing matters; `expand` for optional detail, citations,
   backups; `margin` or `marginalia` only for genuinely secondary context.
6. **Prose and typography pass** – see `reference/style.md`.
7. `node lint.js <source.md>`.
8. Build, open `audience.html`, press `C` on every chunk. Anything fragmented
   goes back to step 3 or 4. Press `O` for the overview board: repeated
   sentence openers, tag monotony, and over-dense chunks show up there and
   nowhere else.

## Gotchas

- Only the eight tags and four widths exist. No custom classes in `{...}`.
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
- `PRD.md` sections 2, 2.1, 3, 4.5 – the content model, tag vocabulary,
  source format, and the explicit-slide rationale.
- `CLAUDE.md` – repo conventions and a map of `build.js`.
