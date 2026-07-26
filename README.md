# psi-slides

**Write a lecture once, in one Markdown file. Get four artefacts out of it: the projection for the room, a presenter cockpit, a reading document, and a handout with the spoken notes folded in.**

The problem it solves is drift. Most lecturers keep slides and a script as two documents, and after two semesters they disagree with each other. psi-slides makes them one text: the prose you write is the handout, and the *same* prose – abridged by a rule you control – is what the projector shows. Nothing is written twice, so nothing can fall out of sync.

It is a build script, not an app. `node build.js source.md` writes four self-contained HTML files next to your source. Everything is inside the file: CSS, JavaScript, images, the maths, and – if you supply the files – the typefaces. Nothing is fetched at run time, from anywhere; open one in a browser with the network unplugged and it is complete. No server, no runtime, no cloud account, nothing to install on the lectern machine. Sharing your slides and/or the full manuscript with the audience is easy: send the file.

psi-slides has already carried a full semester of university teaching. Read [When *not* to use this](#when-not-to-use-this) before you invest in it.

---

## What it looks like

The core idea in two pictures. Same source, same chunk, one keypress apart – `C` toggles between a collapsed view with cues for presenting freely and the full manuscript text.

| Collapsed – what the projector shows | Full – the same chunk, unabridged |
| --- | --- |
| ![Audience view with collapse on: heading, topic sentence, and one promoted bold fragment](docs/img/audience-collapsed.png) | ![The same chunk with collapse off: every paragraph in full](docs/img/audience-full.png) |

You did not author two versions. You wrote the right-hand text and marked which fragments matter; the left-hand slide is derived from it.

**The presenter cockpit** (`S` spawns it from the audience view). Column scrubber on top, a mirror of the projector, your private notes below, upcoming chunks down the right edge. Both windows stay in sync – navigation, reveals, zoom, theme, figure focus, laser pointer.

![Speaker cockpit showing the scrubber, stage mirror, notes pane and preview strip](docs/img/speaker.png)

**The overview board** (`O`). Remember *Prezi*? Same idea, yet more constrained. Zoom out to the whole lecture at once, drag to pan, `/` to search, `Enter` to land. In an unfamiliar lecture this is the fastest way to get oriented, because the typographic rhythm of principles, examples, and figures is visible at a glance.

![Overview board showing three columns of chunks with one selected](docs/img/audience-overview.png)

**The handout** (`print-notes.html`). The document version of the same lecture with every `> note:` rendered as an aside – “what was on the slide, plus what the lecturer said”, in one PDF-able page flow. There is also a plain `print.html` without the notes, for students.

![Print-notes handout: the same chunk as flowing prose with a speaker-note aside](docs/img/print-notes.png)

## Quickstart

Requires Node 20 or newer. Nothing else.

```bash
git clone https://github.com/UBA-PSI/psi-slides.git
cd psi-slides
npm install

node build.js lectures/tutorial/source.md
open lectures/tutorial/audience.html      # macOS; use xdg-open or your browser otherwise
```

That builds the self-referential tour: a lecture that teaches the tool *by being the tool*. Press `?` for the cheat sheet, `S` to spawn the cockpit, `O` for the overview, `C` for collapse. Its source, [`lectures/tutorial/source.md`](lectures/tutorial/source.md), is the authoring reference.

Start your own:

```bash
node build.js --new my-lecture          # scaffold lectures/my-lecture/source.md
node build.js lectures/my-lecture/source.md --watch   # live reload on every save
node lint.js lectures/my-lecture/source.md            # static checks
```

`--watch` pushes a reload over a WebSocket to every open tab, so you can keep the editor, the audience view, and the cockpit visible at once.

## The four views

All four come from one `source.md` and are written next to it.

| File | What it is |
| --- | --- |
| `audience.html` | The projection. One chunk on the stage, camera pans between them, collapse on by default. |
| `speaker.html` | The cockpit. Opens from the audience view with `S`; the two sync over `window.postMessage`. |
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

The grammar is `## tag: Heading | Sub-heading {.width #id}`. Eight tags (`title`, `principle`, `definition`, `example`, `question`, `figure`, `exercise`, `free`) set the visual treatment and a word budget the linter enforces; four widths (`narrow`, `standard`, `wide`, `full`) set how much stage the chunk takes.

**What lands on the slide** is decided per chunk, by one of two mechanisms:

- **Derived** (the default): the first sentence of every paragraph, plus any `**bold**` fragments. Costs nothing to author, and imposes a real discipline – every paragraph has to open with a claim that stands alone.
- **Stated**: a `::: slide` block *is* the screen, everything else is narration. Or `::: script`, the dual: the chunk is the screen and only the marked block is narration. Reach for these when the argument wants continuous prose that no first-sentence rule can carve up.

Everything else is body-level directives: `---` on its own line splits a chunk into **reveal segments**; `::: expand <label>` hides detail behind a chevron; `::: cols 2` / `::: side` / `::: flip` shape internal layout; `::: margin` and `::: marginalia` place asides; `![](fig-id)` resolves against `assets/`; `$inline$` and `$$display$$` are **math**, rendered by KaTeX during the build. All of it is documented live in the tutorial.

**Typefaces travel with the file.** Three families ship with the tool and are embedded in every output: Literata, Inter Tight and JetBrains Mono, all under the SIL Open Font License, which permits exactly this. That is not decoration – Safari does not expose locally installed fonts to a page at all, as an anti-fingerprinting measure, so a deck that merely *names* its typefaces gets whatever the browser feels like there. The bundle costs about 280 KB per file; `fonts: none` in the frontmatter turns it off.

To use your own instead, drop the files into `fonts/` beside your source and name the families:

```yaml
fonts:
  serif: Literata
  sans: Inter Tight
  mono: JetBrains Mono
```

Files are matched by name, with weight and style read off the suffix (`Literata-Bold.woff2`, `Literata-600italic.woff2`, `Literata[wght].woff2`). `.woff2`, `.woff`, `.ttf` and `.otf` all work; woff2 is much the smallest. A role you name uses your font, a role you leave out keeps the bundled one, and naming a family with no matching file fails the build rather than falling back quietly.

> **Check the licence before you embed.** Embedding redistributes the font file. The SIL Open Font License and Apache-2.0 – between them nearly every family on Google Fonts – permit this; most commercial *desktop* licences do not, and require a separate webfont licence. psi-slides prints a reminder and makes no attempt to verify anything. It is your call and your responsibility.

Five optional frontmatter keys pin how a lecture opens – `font`, `theme`, `collapse`, `auto-fit`, `slide-numbers`. A key that is present wins over the reader's stored preference; a key that is absent leaves it alone, so a lecture that pins nothing still follows whatever the reader last chose.

**Video** uses the same shorthand as an image. `![](clip)` finds `assets/clip.mp4` and inlines it, up to a 12 MB per-file cap; over that, the build copies it to a `videos/` folder beside the output, plays it from there, and tells you the output now needs that folder. A written-out URL works too – `![](https://host/clip.mp4)` – and is still an ordinary `<video>`, so play, pause and seeking stay synchronised between the projection and the cockpit.

**Hosted players** are a directive of their own, `::: embed <url>`, for YouTube and Vimeo. They are the one thing that makes an output fetch from a third party while you present, so the build says so every time. The frame loads only once its chunk is on screen and unloads when you leave it, nothing autoplays, and play/pause synchronise between projection and cockpit. YouTube additionally needs a real origin, so from a `file://` page it shows a card telling you to run `--serve`; the tutorial explains the whole thing.

Two more surfaces worth knowing apart: **notes** (`> note:`) are yours, written in advance, shown in the cockpit and in the handout. **Annotations** (`N` during a talk) are typed live, visible to the room, and `Shift-E` plus `--integrate-annotations` writes them back into `source.md` as permanent text.

## Writing lectures with an LLM assistant

The format is a good fit for one. A lecture is plain Markdown with a small,
closed grammar: eight tags, four widths, eight `:::` directives, one reveal
separator. There is nothing to guess at and no binary format in the way, so a
model that has been shown the rules produces sources that build and lint on the
first pass. Diffs stay reviewable, because the unit of change is a paragraph of
prose rather than a slide object.

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

Two failure modes are worth naming. Models invent plausible directives that do
not exist (`::: columns`, `::: note`, extra classes in `{...}`) – the linter
catches those. And they renumber `{#id}` attributes when they rewrite a
heading, which silently breaks cross-references, TOC entries, and stored
speaker state; say so up front, because no check will catch it.

## When to use this

- Your lecture and its script should be one document, and you are tired of them drifting apart.
- You want a handout that reads as prose, not slides printed six-up.
- You want slides in git – diffable in review, greppable across semesters, mergeable.
- You teach code. Highlighting is [Shiki](https://shiki.style/) at build time, so it is exact and there is no runtime highlighter to load.
- You present from one laptop with an extended display.
- You care how the text sits on the page and would rather compose a lecture than fill a template.

## When *not* to use this

This is the section that will save you the most time. Each line is a real constraint, not a disclaimer.

- **You need `.pptx` or Keynote interop, or a corporate template.** There is no export path. The output is HTML; the only bridge to a slide deck is printing to PDF.
- **A co-author needs a GUI.** The source is Markdown in a text editor and nothing else. If your collaborator will not edit a text file, this will not work for the two of you.
- **You want builds, transitions, or animation.** Reveal segments uncover blocks of text in place. That is the whole animation model, on purpose.
- **You want the cockpit on a tablet and the slides on the projector.** Architecturally unsupported: the two windows sync through `window.postMessage` over the opener relationship, which means same machine, same browser, same profile. A network sync mode is deferred, not planned.
- **You need more than KaTeX covers.** `$inline$` and `$$display$$` work and render at build time, but that is KaTeX, not LaTeX: no equation numbering or `\ref`, no `mhchem`, no TikZ. If your lecture is a mathematics lecture, check [KaTeX's supported functions](https://katex.org/docs/supported.html) before committing.
- **You need polls, quizzes, or any audience interaction.** Named and deferred in `PRD.md`.
- **Your room's browser is old or locked down.** See [Requirements](#requirements) – the stylesheets use modern CSS with no fallbacks.
- **You want a dependable dependency.** One `build.js` well past six thousand lines, no test suite, no releases, one maintainer, a format that still moves. It is used in earnest, but it is used by the person who wrote it.
- **Nobody is going to speak.** If the artefact is a document that has to carry itself – a retrospective, a project report, something you send to the people who could not attend – then the cockpit and the collapse mechanism are machinery you will not use. That is the sibling project, [**psi-briefing**](https://github.com/UBA-PSI/psi-briefing): text-dense 16:9 slides in one self-contained HTML file, written as Markdown and laid out by inference from the shape of the content. The line between the two is simply whether anyone is talking.

## How it compares

Every tool in this space is good, and nearly all of them take Markdown, so “it uses Markdown” is not a reason to pick this one. The honest differentiator is a combination: one text rendered at two densities, a presenter cockpit that needs no server, and a prose handout – all from a single source and all in files that fetch nothing at run time. [Beamer](https://ctan.org/pkg/beamer) beats it on math, citations and sheer durability; [Quarto](https://quarto.org/) is broader and better supported; [reveal.js](https://revealjs.com/), [Marp](https://marp.app/) and [Slidev](https://sli.dev/) are better at being slide decks; PowerPoint wins the moment a colleague has to edit your file.

**[docs/comparison.md](docs/comparison.md)** is the long version: nine alternatives across twenty dimensions, including the ones psi-slides loses on.

## Requirements

- **Node 20+** to build. Nothing at read time: the outputs are self-contained and open from `file://`.
- **A current browser** to read. The stylesheets use `oklch()` colours, `:has()`, and `text-wrap: balance` with no fallbacks, which puts the floor at roughly **Chrome/Edge 114, Firefox 121, Safari 17.5**. Lectures with inline-styled SVG assets additionally need `@scope`: Chrome/Edge 118, Safari 17.4, Firefox 146. Development and real use are in Chrome; other browsers are untested rather than unsupported.
- **`cwebp` or `magick`** on `PATH`, but only if you use `--optimize-images`. macOS `sips` cannot write WebP, so there is no zero-install fallback for that one command.
- Image assets are inlined automatically when they total under 10 MB. A single asset over 2 MB fails the build rather than silently shipping an external path – `--optimize-images` converts the offenders to WebP, and `--no-inline-images` is the escape hatch.
- Math is rendered at build time, which means the KaTeX fonts have to travel inside the HTML for it to stay `file://`-openable. Only the font families a lecture's formulas actually use are inlined – typically about 130 KB of the full 254 KB – and a lecture without math inlines none of it. The build prints what it did.

## Documentation

| Where | What for |
| --- | --- |
| [`lectures/tutorial/source.md`](lectures/tutorial/source.md) | The authoring reference. Build it and read it as a lecture. |
| [`lectures/python-intro/`](lectures/python-intro/) | The richest worked example – 36 chunks, the full layout vocabulary. |
| [`docs/comparison.md`](docs/comparison.md) | Beamer, reveal.js, Quarto, Marp, Slidev, PowerPoint and friends, compared in both directions. |
| [`PRD.md`](PRD.md) | Design rationale. Why four views, why this tag set, why collapse has two mechanisms and not four. |
| [`speaker.md`](speaker.md) | The cockpit spec and the `postMessage` sync protocol – which fields travel, which stay local. |
| [`CHANGELOG.md`](CHANGELOG.md) | What is in each release, and what the known limits are. |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | What is useful to send, and what to read before touching the code. |
| [`HANDOFF.md`](HANDOFF.md) | Build diary, slice by slice, including the decisions deliberately not taken. German. |
| [`CLAUDE.md`](CLAUDE.md) | Repo conventions and a map of `build.js`. Useful to any contributor, not just to Claude. |
| [`.claude/skills/psi-slides-authoring/`](.claude/skills/psi-slides-authoring/SKILL.md) | The authoring contract in one artefact, for handing to an LLM assistant. |

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

- `←` `→` columns, `↑` `↓` chunks, `Space` reveal next segment.
- `Enter` / `1`–`9` open expansions, `Esc` backs out.
- `O` overview (the letter, not zero – zero resets the zoom), `T` table of contents, `/` search from anywhere – a hit list of every slide that mentions the word.
- `C` collapse, `F` font, `A` accent theme, `+` `-` `0` zoom.
- `#` auto-fit: size every slide to the screen. `B` blanks the projection – the speaker window keeps working so you can change slide while the room sees black.
- `S` spawn the speaker window, `P` open the print view.
- `L` slide numbers: stacked, in a row, or off.

Phase 1. The format is still moving and the version number is `0.1.0` for a reason. Two things are nevertheless safe to build on:

- **`{#id}` attributes are frozen once authored.** They anchor cross-references, TOC entries, sync snapshots, and `localStorage`. Renaming a heading is free; renumbering an ID is not.
- **Generated HTML is disposable.** Rebuild it, do not commit it. The only tracked outputs are `lectures/tutorial/*.html`, so the tour can be browsed from the repository.

## Licence

The tooling – `build.js`, `lint.js`, the documentation – is [MIT](LICENSE). The lecture content under [`lectures/`](lectures/LICENSE) is CC BY-SA 4.0, so you may reuse and adapt it with attribution under the same terms.
