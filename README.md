# psi-slides

psi-slides turns one Markdown file into four HTML files: the projection for the room, a presenter cockpit for your own screen, a reading document, and a handout with the spoken notes folded in.

The problem it solves is drift. Most lecturers keep slides and a script as two documents, and after two semesters they disagree with each other. psi-slides makes them one text: the prose you write is the handout, and the *same* prose – abridged by a rule you control – is what the projector shows. Nothing is written twice, so nothing can fall out of sync.

psi-slides is a build script. `node build.js source.md` writes four HTML files next to your source, and each of them carries everything it needs: the styling, the scripts, the images, the typeset maths, and the typefaces – three families ship with the tool and are embedded in each output, so a lecture looks the same on a machine that has none of them installed. Nothing is fetched at run time, from anywhere; open one in a browser with the network unplugged and it is complete. There is no server and no cloud account, and nothing has to be installed on the lectern machine. To give the audience the slides, or the full manuscript, you send them one file.

psi-slides has already carried a full semester of university teaching. Read [When *not* to use this](#when-not-to-use-this) before you invest in it.

## → [Try it in your browser: uba-psi.github.io/psi-slides](https://uba-psi.github.io/psi-slides/)

Five lectures are published there, each in all four views. Walk one with the space bar, press `S` for the cockpit and `O` for the overview board, and read the handout the same source produced &ndash; before installing anything.

---

## What it looks like

The core idea in two pictures. A *chunk* is the unit psi-slides works in – roughly one slide's worth of text – and the two pictures below are one chunk rendered twice from the same source. `C` toggles between the collapsed view, which is what the projector shows, and the full manuscript text.

| Collapsed – what the projector shows | Full – the same chunk, unabridged |
| --- | --- |
| ![Audience view with collapse on: heading, topic sentence, and one promoted bold fragment](docs/img/audience-collapsed.png) | ![The same chunk with collapse off: every paragraph in full](docs/img/audience-full.png) |

You did not author two versions. You wrote the right-hand text and marked which fragments matter; the left-hand slide is derived from it.

**The presenter cockpit** (`S` opens it from the audience view). Column scrubber on top, a mirror of the projector, your private notes below, upcoming chunks down the right edge. Both windows stay in step: which slide is up, how much of it is uncovered, zoom, theme, figure focus, laser pointer.

![Speaker cockpit showing the scrubber, stage mirror, notes pane and preview strip](docs/img/speaker.png)

**The overview board** (`O`), borrowed from *Prezi*: zoom out to the whole lecture at once, drag to pan, `/` to search, `Enter` to land. In a lecture you did not write yourself, the board is where you get oriented – the typographic rhythm of principles, examples and figures is visible at a glance.

![Overview board showing three columns of chunks with one selected](docs/img/audience-overview.png)

**The handout** (`print-notes.html`). The document version of the same lecture with every `> note:` rendered as an aside – “what was on the slide, plus what the lecturer said”, in one PDF-able page flow. There is also a plain `print.html` without the notes, for students.

![Print-notes handout: the same chunk as flowing prose with a speaker-note aside](docs/img/print-notes.png)

## Quickstart

Requires Node 20 or newer. Nothing else: no LaTeX, no Pandoc, no server, nothing installed globally.

```bash
# the latest release, unpacked into psi-slides/
curl -L https://github.com/UBA-PSI/psi-slides/releases/latest/download/psi-slides.tar.gz \
  | tar xz
cd psi-slides

npm install

node build.js lectures/tutorial/source.md
open lectures/tutorial/audience.html      # macOS; use xdg-open or your browser otherwise
```

On Windows take the `.zip` from the [releases page](https://github.com/UBA-PSI/psi-slides/releases). Both the release archive and a `git clone` include example lectures already built, so you can open one before running anything. A clone follows current development; the tagged archive does not.

That builds the self-referential tour: a lecture that teaches the tool *by being the tool*. Press `?` for the cheat sheet, `S` to open the cockpit, `O` for the overview, `C` for collapse. Its source, [`lectures/tutorial/source.md`](lectures/tutorial/source.md), is the authoring reference.

Start your own:

```bash
node build.js --new my-lecture          # scaffold lectures/my-lecture/source.md
node build.js lectures/my-lecture/source.md --watch   # live reload on every save
node lint.js lectures/my-lecture/source.md            # static checks
```

`--watch` reloads every open tab on every save, so you can keep your text editor, the audience view and the cockpit visible at once.

## The four views

All four come from one `source.md` and are written next to it.

| File | What it is |
| --- | --- |
| `audience.html` | The projection. One chunk on the stage, camera pans between them, collapse on by default. |
| `speaker.html` | The cockpit. Opens from the audience view with `S`; the two windows then keep each other in step directly, with no server in between. |
| `print.html` | A reading document with a cover and a table of contents. All reveals shown, all expansions inlined. |
| `print-notes.html` | The same document with `> note:` blocks folded in under their chunk. |

Each is a single file. Mail one to a colleague as an attachment and it works.

## How you write

A lecture is columns of chunks. A column is a `#` heading; a chunk is a `##` heading with a tag, and its body is ordinary Markdown.

```markdown
---
title: Anonymous Communication
presenter: Dominik Herrmann
course: advasp
---

# Why mixes need a crowd {#crowd}

## principle: Anonymity is a property of the set | not of the channel {.wide #anon-set}

**Anonymity comes from the others doing the same thing.** A mix node that
forwards exactly one message leaks it by timing alone.

The size of the anonymity set is therefore a property of the **traffic**, not
of the protocol.

> note: Ask the room for the smallest set they would trust. Answers cluster
> around 100 and the reasoning is always worth two minutes.
```

The grammar is `## tag: Heading | Sub-heading {.width #id}`. Ten tags (`title`, `closing`, `outline`, `principle`, `definition`, `example`, `question`, `figure`, `exercise`, `free`) set the visual treatment and a word budget the linter enforces; four widths (`narrow`, `standard`, `wide`, `full`) set how much stage the chunk takes. Adding `{.bare}` to the same braces keeps a heading in the document, the contents page and the search index and takes it off the projection – for the talk that is a run of figures and still needs a name per slide.

**What lands on the slide** is decided per chunk, by one of two mechanisms:

- **Derived** (the default): the first sentence of every paragraph, plus any `**bold**` fragments. It imposes a discipline: every paragraph has to open with a claim that stands on its own.
- **Stated**: a `::: slide` block *is* the screen, everything else is narration. Or `::: script`, the other way round: the chunk is the screen and only the marked block is narration. Reach for these when the argument wants continuous prose that no first-sentence rule can carve up.

Everything else is body-level directives: `---` on its own line splits a chunk into **reveal segments**; `::: expand <label>` hides detail behind a chevron; `::: cols 2`, `::: side 2:1` and `::: flip` shape internal layout; `::: cards 3` and `::: rows` lay items out as containers rather than as a text flow, so an item is whole or it is nowhere; `::: margin` and `::: marginalia` place asides; `![](fig-id)` resolves against `assets/`; `$inline$` and `$$display$$` are **math**, rendered by KaTeX during the build. Fourteen directives in all, and all of them are documented live in the tutorial.

**A slide can carry more than a text column.** `::: backdrop <ref>` puts a picture behind the whole slide, edge to edge, and `::: overlay` lays a block of type over it. Both are written at chunk level rather than inside the body, because the text column cannot reach the edges of the slide. A backdrop's *window* can walk the reveal beats – `reveal full, right 45%` retreats the picture to free the paper the title is written on, and adding `over` to the same `{...}` makes the same list, run the other way, grow the picture over the title until it covers it. `::: overlay {…} from 1` is the counterpart for the words.

**`cover:` picks one of ten opening compositions**, ordered quiet to loud: the type in the lower-left third; a nameplate over a lede; a block centred on both axes; a title set to fill the slide; a full field of the accent colour; a claim the talk opens on; a photograph run off one edge or filling the frame; and the title chunk's own `::: draw` figure set beside the title or above it. `## closing:` draws the same composition at the end with the author's own words, so the lecture closes on the shape it opened with. `section:` gives a column's divider six treatments, every one quieter than the cover – including a **running agenda** that lists every part and marks the live one. A divider can also carry its own slide: the lines between a `#` heading and the first chunk are a quotation, a photograph or a figure, whichever the author writes there. [`lectures/decoration/`](lectures/decoration/) shows all of it in one lecture.

**Figures are written, not drawn.** `::: draw` is a small boxes-and-arrows language compiled to inline SVG at build time: elements are named and placed against one another rather than on a canvas, arrows stay attached to boxes that move, and a figure's steps advance on the same key the reveal segments do. Some statements write those boxes, texts and edges for you: a column chart, a repeated cell grid, a cartesian frame, a table of labelled cells, a set of swimlanes, and `sequence`, which draws a protocol down the page &ndash; one lifeline per actor, numbered messages between them, notes and self-messages. Every part `sequence` draws keeps a name, so hanging an annotation off one message is an ordinary line of source rather than something `sequence` has to support. [`figure-design.md`](figure-design.md) is how to lay one out and [`docs/artifact/`](docs/artifact/) teaches the language from nothing. None of `::: draw` is in a tagged release yet.

**Typefaces travel with the file.** Three families ship in any one output, and which three is a per-lecture decision: Literata for the serif, IBM Plex Sans or Inter Tight for the sans, JetBrains Mono or Noto Sans Mono Condensed for the monospace – all under the SIL Open Font License, which permits exactly this. Naming one of them in the `fonts:` block needs no file of your own. `ligatures:` decides separately what a listing does with `->` and `!=`: `text` keeps the ordinary fi and fl in prose and leaves code alone (the default), `all` puts the code ligatures back, `none` removes both. Safari does not expose locally installed fonts to a page at all, as an anti-fingerprinting measure, so a lecture that merely *names* its typefaces falls back to Georgia and the system sans there whatever the reader has installed. The bundle costs about 280 KB per file; `fonts: none` in the frontmatter turns it off.

To use your own instead, drop the files into `fonts/` beside your source and name the families:

```yaml
fonts:
  serif: Literata
  sans: IBM Plex Sans
  mono: JetBrains Mono
```

Files are matched by name, with weight and style read off the suffix (`Literata-Bold.woff2`, `Literata-600italic.woff2`, `Literata[wght].woff2`). `.woff2`, `.woff`, `.ttf` and `.otf` all work; woff2 is much the smallest. A role you name uses your font, a role you leave out keeps the bundled one, and naming a family with no matching file fails the build rather than falling back quietly.

> **Check the licence before you embed.** Embedding redistributes the font file. The SIL Open Font License and Apache-2.0 – between them nearly every family on Google Fonts – permit this; most commercial *desktop* licences do not, and require a separate webfont licence. psi-slides prints a reminder and makes no attempt to verify anything. It is your call and your responsibility.

Five optional frontmatter keys pin how a lecture opens – `font`, `theme`, `collapse`, `auto-fit`, `slide-numbers`. A key that is present wins over the reader's stored preference; a key that is absent leaves it alone, so a lecture that pins nothing still follows whatever the reader last chose. The composition keys are separate and are not preferences at all: `cover`, `cover-image`, `cover-ratio`, `cover-align`, `section`, `section-mark`, `ligatures`, and a `style:` block carrying heading alignment, the hairlines, and the two type scales. A key with an unknown value fails the build rather than being ignored, because a typo there is otherwise invisible – the lecture still builds and looks fine, it just looks like the author never set anything.

`editor: both | speaker | none` is checked the same way but is neither of those things: it decides which of the two live views carries the experimental figure editor, so what it changes is what ships in the file rather than how the lecture looks, and there is no reader preference for it to yield to. It defaults to `both`. The editor is built for a desktop and has substantial automated test coverage, but it has not yet been tried by many people.

**Video** uses the same shorthand as an image. `![](clip)` finds `assets/clip.mp4` and inlines it, up to a 12 MB per-file cap; over that, the build copies it to a `videos/` folder beside the output, plays it from there, and tells you the output now needs that folder. A written-out URL works too – `![](https://host/clip.mp4)` – and is still an ordinary `<video>`, so play, pause and seeking stay synchronised between the projection and the cockpit.

**Hosted players** are a directive of their own, `::: embed <url>`, for YouTube and Vimeo. They are the one thing that makes an output fetch from a third party while you present, so the build says so every time. The frame loads only once its chunk is on screen and unloads when you leave it, nothing autoplays, and play/pause synchronise between projection and cockpit. YouTube additionally needs a real origin, so from a `file://` page it shows a card telling you to run `--serve`; the tutorial explains the whole thing.

Two kinds of note are easy to confuse. A **note** (`> note:`) is yours, written in advance, shown in the cockpit and in the handout. An **annotation** (`N` during a talk) is typed live and the room sees it; `Shift-E` plus `--integrate-annotations` writes annotations back into `source.md` as permanent text.

## Writing lectures with an LLM assistant

A lecture source is a good thing to hand a language model. It is plain
Markdown with a small, closed grammar: ten tags, four widths, fourteen `:::`
directives, one reveal separator. There is nothing to guess at and no binary
format in the way, so a model that has been shown the rules produces sources
that build and lint on the first pass. Diffs stay reviewable, because the unit
of change is a paragraph of prose rather than a slide object.

What still needs you: the argument, the examples, and the judgement about what
belongs on the screen. A model is useful for turning a draft into chunks,
proposing IDs and widths, tightening topic sentences so the collapsed view
reads well, and fixing what the linter flags.

Hand it one artefact rather than five. This repo ships a skill at
[`.claude/skills/psi-slides-authoring/`](.claude/skills/psi-slides-authoring/SKILL.md)
that bundles the whole authoring contract – grammar, directives, collapse
mechanisms, math, frontmatter – plus a companion file on topic sentences,
bold discipline, and typography. Claude Code picks it up automatically inside
this repository or a content repo that has a copy; for any other assistant,
paste the two files into the context.

If you would rather not use the skill, the minimum useful set is:

- [`lectures/tutorial/source.md`](lectures/tutorial/source.md) – the canonical
  reference, and the one file that shows every directive in real use.
- [`CLAUDE.md`](CLAUDE.md) – the conventions, the parsing contract, and the
  things that are easy to get wrong.
- `node lint.js <source.md>` after every edit. It catches unknown tags and
  widths, missing or duplicate IDs, unclosed directives, and over-budget
  chunks, which is most of what a model gets wrong.

Two things go wrong often enough to be worth naming. Models invent plausible
directives that do not exist (`::: columns`, `::: note`, extra classes in
`{...}`) – the linter catches those. And they renumber `{#id}` attributes when
they rewrite a heading, which silently breaks cross-references, contents
entries, and stored speaker state; say so up front, because no check will catch
it.

## When to use this

- Your lecture and its script should be one document, and you are tired of them drifting apart.
- You want a handout that reads as prose, not slides printed six-up.
- You want slides in git – diffable in review, greppable across semesters, mergeable.
- You teach code. Highlighting is [Shiki](https://shiki.style/) at build time, so it is exact and there is no runtime highlighter to load.
- You present from one laptop with an extended display.
- You care how the text sits on the page and would rather compose a lecture than fill a template.

## When *not* to use this

- **You need `.pptx` or Keynote interop, or a corporate template.** There is no export path. The output is HTML; the only bridge to a slide deck is printing to PDF.
- **A co-author needs a stable, fully graphical workflow.** The source of record is Markdown. The experimental diagram editor can adjust figures and write their source back, but it does not edit the rest of a lecture and is not yet a production-tested substitute for text authoring.
- **You want slide transitions, or motion for its own sake.** There are none, and there will be none. What exists is three mechanisms, all of them on the same key and all of them inside one slide: reveal segments uncover blocks of text in place; a `::: draw` block can be stepped, so elements appear, disappear, move, and the arrows between them re-route as they go; and a `::: backdrop` can open or close its window over the slide, which is how a title is revealed in the paper a photograph gives up. None of them will animate a slide change. (`::: draw` is in this repository but not in any tagged release yet; see [Documentation](#documentation).)
- **You want the cockpit on a tablet and the slides on the projector.** The design rules it out: the cockpit is a window the audience view opened, and the two talk to each other as parent and popup, which means same machine, same browser, same profile. Syncing over a network is deferred, not planned.
- **You need more than KaTeX covers.** `$inline$` and `$$display$$` work and render at build time, but that is KaTeX, not LaTeX: no equation numbering or `\ref`, no `mhchem`, no TikZ. If your lecture is a mathematics lecture, check [KaTeX's supported functions](https://katex.org/docs/supported.html) before committing.
- **You need polls, quizzes, or any audience interaction.** Named and deferred in `PRD.md`.
- **Your room's browser is old or locked down.** See [Requirements](#requirements) – the stylesheets use modern CSS with no fallbacks.
- **You want a dependable dependency.** One `build.js` of over fourteen thousand lines, one maintainer, and a test suite that covers only what a browser can break. The source format is stable from 1.0.0; nothing behind it is promised. It is used in earnest, but it is used by the person who wrote it.
- **Nobody is going to speak.** If the artefact is a document that has to carry itself – a retrospective, a project report, something you send to the people who could not attend – then the cockpit and the collapse mechanism are machinery you will not use. That is the sibling project, [**psi-briefing**](https://github.com/UBA-PSI/psi-briefing): text-dense 16:9 slides in one HTML file that carries everything it needs, written as Markdown and laid out by inference from the shape of the content. The line between the two is whether anyone is talking.

## How it compares

What is different here is the combination: one text rendered at two densities, a presenter cockpit that needs no server, and a prose handout – all from a single source and all in files that fetch nothing at run time. Every tool in this space is good, and nearly all of them take Markdown, so “it uses Markdown” is not a reason to pick this one. [Beamer](https://ctan.org/pkg/beamer) beats it on math, citations and sheer durability; [Quarto](https://quarto.org/) is broader and better supported; [reveal.js](https://revealjs.com/), [Marp](https://marp.app/) and [Slidev](https://sli.dev/) are better at being slide decks; PowerPoint wins the moment a colleague has to edit your file.

**[docs/comparison.md](docs/comparison.md)** is the long version: nine alternatives across twenty dimensions, including the ones psi-slides loses on.

## Requirements

- **Node 20+** to build. Nothing at read time: each output carries everything it needs and opens from `file://`.
- **A current browser** to read. The stylesheets use `oklch()` colours, `:has()`, and `text-wrap: balance` with no fallbacks, which puts the floor at roughly **Chrome/Edge 114, Firefox 121, Safari 17.5**. Lectures with inline-styled SVG assets additionally need `@scope`: Chrome/Edge 118, Safari 17.4, Firefox 146. Development and real use are in Chrome; other browsers are untested rather than unsupported.
- **`cwebp` or `magick`** on `PATH`, but only if you use `--optimize-images`. macOS `sips` cannot write WebP, so there is no zero-install fallback for that one command.
- Image assets are inlined automatically when they total under 10 MB. A single asset over 2 MB fails the build rather than silently shipping an external path – `--optimize-images` converts the offenders to WebP, and `--no-inline-images` is the escape hatch.
- Math is rendered at build time, so the KaTeX fonts have to travel inside the HTML or the output stops opening from `file://`. Only the font families a lecture's formulas actually use are inlined – the tutorial's five come to 166 KB of the 254 KB the full set costs – and a lecture without math inlines none of it. The build prints what it did.

## Documentation

| Where | What for |
| --- | --- |
| [`lectures/tutorial/source.md`](lectures/tutorial/source.md) | The authoring reference. Build it and read it as a lecture. |
| [`lectures/python-intro/`](lectures/python-intro/) | The richest worked example – 36 chunks, the full layout vocabulary. |
| [`lectures/diagrams/`](lectures/diagrams/) | Every `::: draw` statement drawn rather than described, with real lecture figures among them. |
| [`lectures/decoration/`](lectures/decoration/) | Everything that decorates a slide, drawn rather than described: the cover family, the six dividers and the three kinds of divider content, cards and rows, backdrops with a reveal, overlays, `{.bare}` headings. |
| [`figure-design.md`](figure-design.md) | How to lay out a `::: draw` block so a room can read it. Rules with a wrong and a right version each, in real syntax, and a checklist. |
| [`docs/artifact/`](docs/artifact/) | The manual for the figure language, from nothing: a figure built a line at a time, then beats, then every class and statement, fifteen design rules and a gallery. Every drawing on it is compiled by the build rather than redrawn. |
| [`docs/site/figures.html`](docs/site/figures.html) | The case for the figure language, published on the project site: why a lecture figure is not a picture, and three figures that show it. Sends the reader to the manual. |
| [`editor.md`](editor.md) | Design and build log for the experimental graphical editor: what it edits, what it refuses to edit, and why. |
| [`docs/comparison.md`](docs/comparison.md) | Beamer, reveal.js, Quarto, Marp, Slidev, PowerPoint and friends, compared in both directions. |
| [`PRD.md`](PRD.md) | Design rationale. Why four views, why this tag set, why collapse has two mechanisms and not four. |
| [`speaker.md`](speaker.md) | The cockpit spec and the `postMessage` sync protocol – which fields travel, which stay local. |
| [`CHANGELOG.md`](CHANGELOG.md) | What is in each release, and what the known limits are. |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | What is useful to send, and what to read before touching the code. |
| [`HANDOFF.md`](HANDOFF.md) | Build diary, slice by slice, including the decisions deliberately not taken. German. |
| [`CLAUDE.md`](CLAUDE.md) | Repo conventions and a map of `build.js`. Useful to any contributor, not just to Claude. |
| [`.claude/skills/psi-slides-authoring/`](.claude/skills/psi-slides-authoring/SKILL.md) | The authoring contract in one artefact, for handing to an LLM assistant. |

**`::: draw` and its editor are not in a tagged release yet.** They are in this repository and in the four rows above, and a lecture that uses them builds here; against a released psi-slides it will not. The editor is experimental: automated tests cover it extensively, but broad human testing has not happened yet. The same goes for the `editor:` frontmatter key, which decides whether the live views carry the editor at all.

## Command reference

```bash
node build.js <source.md>                    # build all four views
node build.js <source.md> --watch            # live reload
node build.js <source.md> --serve            # serve over http on loopback
node build.js <source.md> --watch --serve    # both
node build.js <source.md> --audience-only    # also --print-only, --print-notes-only, --speaker-only
node build.js --new <slug>                   # scaffold a lecture

node build.js <source.md> --inline-images    # force inlining
node build.js <source.md> --no-inline-images # force external asset paths
node build.js <source.md> --optimize-images --dry-run   # report oversized rasters
node build.js <source.md> --optimize-images             # convert them to WebP in place
node build.js <source.md> --integrate-annotations       # fold exported live annotations back in

node lint.js lectures/                       # all lectures
node lint.js lectures/ --strict              # warnings exit 2
```

The linter checks unknown tags and widths, duplicate or missing chunk IDs, unclosed `:::` directives and unclosed `$$` math, per-tag word budgets, duplicate explicit-slide blocks, assets over the inline cap, reveal overuse, orphan columns, and redundant figure captions. A source file can silence a check with `<!-- linter: ignore reveal-overuse, density -->`.

## Hotkeys

Press `?` in either live view for the full on-screen reference. The ones you need on day one:

- Forward is one key family: `Space`, `↓`, `Enter`, `PageDown`. It uncovers the next reveal segment or diagram step on the chunk you are on; once there is nothing left to uncover it moves to the next chunk, and at the end of a column it carries on into the next column.
- Backward is the mirror: `↑`, `PageUp`, `Backspace`. It takes the last reveal back, and leaves the chunk only once the chunk is back at its opening state.
- `→` and `←` are that same forward/backward pair, except on the first chunk of a column, where they mean next column and previous column. If there is no column that way, they stay forward and backward.
- Faint marks at the edge of the slide flag the exceptions: `‹ ›` on a chunk where sideways changes column, `⌄` when the next forward press will leave the column.
- `1`–`9` open expansions – so does clicking the chevron. `Esc` backs out.
- `O` overview (the letter, not zero – zero resets the zoom), `T` table of contents, `/` search from anywhere – a hit list of every slide that mentions the word.
- `C` collapse, `F` font, `A` accent theme, `+` `-` `0` zoom.
- `#` auto-fit: size every slide to the screen. `B` blanks the projection – the speaker window keeps working so you can change slide while the room sees black.
- `S` open the speaker window, `P` open the print view.
- `L` slide numbers: stacked, in a row, or off.

## What is stable and what is not

From `1.0.0` the **source format is the interface**: a change that stops an existing `source.md` from building the same way is a major version. That is a promise about the format, not about the internals – `build.js` is one file and its insides are rearranged whenever it helps. Two consequences worth knowing:

- **`{#id}` attributes are frozen once authored.** They anchor cross-references, TOC entries, sync snapshots, and `localStorage`. Renaming a heading is free; renumbering an ID is not.
- **Generated HTML is disposable.** Rebuild it, do not commit it. The only tracked outputs are the three reference lectures – `lectures/tutorial/`, `lectures/diagrams/` and `lectures/decoration/` – so the tour and the two construct references can be browsed straight from the repository.

## Licence

The tooling – `build.js`, `lint.js`, the documentation – is [MIT](LICENSE). The lecture content under [`lectures/`](lectures/LICENSE) is CC BY-SA 4.0, so you may reuse and adapt it with attribution under the same terms.
