# How psi-slides compares

This page compares psi-slides with the tools university lecturers actually use. It is written by the project, so treat the framing as interested, and read [where psi-slides loses](#where-psi-slides-loses) first if you are deciding.

Numbers about psi-slides were measured here; claims about the other tools follow their documentation as of July 2026, and anything that could not be confirmed is marked *(not verified)*. All of these projects move, so check before you commit a semester to one.

---

## The short version

| | psi-slides | Beamer | reveal.js | Quarto | Marp | Slidev | PowerPoint / Keynote / Google Slides |
|---|---|---|---|---|---|---|---|
| Source | Markdown, one file | LaTeX | Markdown or HTML | Markdown (`.qmd`) | Markdown | Markdown + Vue | binary or cloud document |
| Diffable in git | yes | yes | yes | yes | yes | yes | not usefully |
| Slides *and* a prose script from one text | yes, by construction | no | no | two renders, not two densities | no | no | no |
| Distributable artefact | 4 self-contained HTML files | one PDF | a directory of assets | HTML (`embed-resources`), PDF, docx | HTML (images stay external), PDF, PPTX | a static web app | the native file, or PDF |
| Adapts to the projector | reflows to the window | fixed canvas | fixed canvas, scaled | fixed canvas, scaled | fixed canvas, scaled | fixed canvas, scaled | fixed canvas |
| Speaker view | yes, built in | via `pdfpc` or a two-up PDF | yes, but needs a web server | yes (reveal.js) | yes, bespoke template | yes, rich | yes, mature |
| Handout with the spoken text | yes, `print-notes.html` | yes, handout mode plus `\note` | no | yes, a real document render | notes to a text file | no | notes pages |
| Maths | KaTeX at build time | LaTeX, unmatched | MathJax or KaTeX at run time | MathJax by default, at run time | MathJax by default, at build time | KaTeX at build time | weak to none |
| Live annotation | typed, and it can be merged back into the source | drawing via `pdfpc` | third-party plugin | chalkboard, built in | no | drawing, built in | ink (PowerPoint), none (Slides) |
| In-deck text search | yes | whatever the PDF viewer offers | yes | not found | not found | not found | in the editor, not while presenting |
| Needed at the lectern | a browser | a PDF viewer | a browser, plus a server for the speaker view | a browser | a browser | a browser | the application, or a browser |
| Ecosystem | none | very large | very large | large, company-backed | large | large | enormous |
| Maturity | Phase 1, `0.1.0` | about two decades | since 2011 | 1.0 in 2022, Posit PBC | since 2018 | since 2021 | decades |
| Licence | MIT | LPPL / GPL | MIT | MIT | MIT | MIT | proprietary |

The table flattens things that matter. The rest of this page is the nuance.

---

## What psi-slides is actually optimising for

Three commitments explain nearly every difference below.

**One text, two densities.** A lecture is written once, as prose. The live view renders a collapsed form of that same prose: the first sentence of every paragraph, plus the fragments the author marked `**bold**`. Press `C` and the full text is there, in the same window, in the same place. Nothing was authored twice, so nothing can drift apart. Every other tool here treats slide and script as two texts, however conveniently they sit in one file.

**The artefact survives leaving the machine.** The four outputs inline everything: CSS, runtime JavaScript, images as `data:` URIs or spliced-in `<svg>`, KaTeX-rendered maths with the woff2 faces those formulas need, and, if the author supplies the files, the text typefaces. `build.js` contains no HTTP URLs at all, and the only URL-shaped strings in a built output are the SVG and MathML XML namespaces. Open one with the network unplugged and it is complete.

**The source is text under version control.** One Markdown file per lecture, a closed grammar of eight tags and eight `:::` directives, and a zero-dependency linter enforcing per-tag word budgets. A semester of lectures is greppable and mergeable.

What that combination costs is set out at the end, and it is not cheap.

---

## Dimension by dimension

### Slides and script: one document or two

This is the claim the project exists for, so it deserves the harshest test.

Beamer has `\note{}`; Quarto, Marp, reveal.js and Slidev all have speaker-note syntax; PowerPoint has a notes pane; Deckset marks notes with a leading `^`. In every one of them, the note and the slide are two pieces of text that happen to live in one file. Write the slide as three bullets and the argument as a paragraph underneath, and you now maintain both. Two semesters later they disagree, which is exactly the failure this project is named after.

psi-slides inverts it: the paragraph *is* the slide. The collapsed view is derived when the page loads, by a DOM walker in the browser (`splitSentencesIn`), not by a second authoring pass. Honestly, the consequences:

- It imposes a real discipline. Every paragraph must open with a sentence that stands alone, because that sentence is what the room sees. Some authors find this clarifying, some find it a straitjacket. It is not optional; it is the format.
- It does not suit every argument, which is why `::: slide` and `::: script` exist as escape hatches (PRD §4.5). If you reach for them constantly, the format is fighting you.
- It is *not* a substitute for speaker notes, and psi-slides has those too (`> note:`), for the things that genuinely are not the text: “ask the room here”, “this is where they always object”.

Quarto is the closest in spirit, because it renders slides and a document from one `.qmd`. The difference is that Quarto gives you the same content in two *layouts*. psi-slides gives you the same content at two *densities*, which is the part that stops a slide from decaying into bullets nobody can reconstruct a year later.

### What a single distributable file actually contains

“Self-contained” is used loosely in this space. Concretely:

**psi-slides.** `audience.html` and `speaker.html` carry exactly one inlined `<script>` each; `print.html` and `print-notes.html` carry none at all and are pure HTML and CSS. Images inline by default when the referenced assets total under 10 MB, with a 2 MB per-file cap; an asset over that cap fails the build rather than quietly shipping an external path, and `--optimize-images` converts offending rasters to WebP. SVG assets are spliced in as real `<svg>` elements, so they inherit the page's colour variables and re-theme with the `A` key. Three OFL-licensed typefaces are bundled with the tool and embedded in every output, so a deck keeps its type on a machine that has nothing installed – and in Safari, which does not expose installed fonts to a page at all; an author can substitute their own from a `fonts/` directory or switch the bundle off. The 36-chunk `python-intro` lecture yields a 242 KB `audience.html` and a 103 KB `print.html`; the tutorial, which has maths, inlines 119 KB of KaTeX woff2 per view out of 254 KB for the full set, because only the families its formulas use are emitted.

**Beamer** produces one PDF with subset-embedded fonts and embedded figures. As an artefact this is the strongest thing on the page, and it is why Beamer has outlasted everything else. The limitation runs the other way: a PDF has no live layer, so the presenter console must be a separate program.

**reveal.js** has no asset-bundling option. The stock deck references local `dist/` and `plugin/` paths, so the output is a directory, not a file. Some bundled themes fetch web fonts from Google Fonts at run time (`league` and `simple` do; `black`, `white` and `serif` do not), and the maths plugin loads KaTeX or MathJax from a CDN unless you point it at local copies. All of this is fixable by hand or with an external bundler; none of it is the default.

**Marp** inlines CSS and JavaScript into its HTML output but **does not embed local images**, and there is no flag to do so: the maintainer declined the request in 2025 and pointed users at external tools such as `monolith`. Its `gaia` theme imports web fonts at run time, and KaTeX fonts come from a CDN unless `katexFontPath` is set.

**Slidev** builds a static Vite web app with hashed assets, not a file, and by default imports fonts from Google Fonts at run time unless reconfigured. Recent versions added optional PWA precaching for offline use, which is a partial answer.

**Quarto** is the only real contender here: `embed-resources: true` bundles images, CSS and JavaScript into one HTML file. The documented caveat matters, though: MathJax and KaTeX are **not** embedded unless you also set `self-contained-math: true`, because they are large. Behaviour for reveal.js plugins and theme web fonts under `embed-resources` was *(not verified)*.

**Deckset** exports PDF, PNG and JPEG. There is no HTML export at all.

**PowerPoint** embeds inserted media by default, but font embedding depends on both format and the font's own permission bit: TrueType and OpenType can embed, Type 1 and Apple AAT cannot, and a font marked restricted will not embed at all. Video inserted from YouTube or Vimeo is a link, so it needs live internet in the room.

**Google Slides** has no local artefact unless you export. Offline presenting requires the Docs Offline extension in Chrome or Edge with the file individually marked available offline, and several features stop working offline.

**Obsidian and Logseq** render the note in the app against your vault. The core features produce no distributable artefact at all.

The cross-cutting finding is worth stating plainly, because it is the clearest thing psi-slides has: among the HTML tools, **only Quarto ships a genuine single-file option, and even that excludes the maths runtime by default**.

### The projector: aspect ratio, resolution, reflow

Every other tool here is a fixed canvas that gets scaled. Beamer's frame is 4:3 by default, 16:9 with `aspectratio=169`. reveal.js scales a 960×700 canvas (“without changing the aspect ratio or layout”, in its own words), Quarto's reveal.js default is 1050×700, Marp's is 1280×720, Slidev's is a 16:9 canvas with a “Fit” versus “1:1” toggle in the UI. PowerPoint, Keynote and Google Slides each have one slide size chosen per deck. Scaling a canvas means a projector with the wrong aspect letterboxes, and a low-resolution projector shows the same layout, smaller. Nothing rewraps.

psi-slides has no canvas. The audience slide *is* the browser window: the runtime writes `window.innerWidth` and `window.innerHeight` into `--slide-w` and `--slide-h`, refreshes them on resize, and computes every internal size, including type, from those. Text reflows at any window shape. There is no `transform: scale()` on text anywhere; the camera translates only. Zoom (`+`, `-`, `0`) is a type-scale multiplier, and `#` turns on auto-fit, which measures each slide's rendered height and walks the zoom in steps until it fits.

Two honest qualifications. First, reflow means the slide you rehearsed is not pixel-identical to the one in the room; a fixed canvas is predictable in a way this is not, and for a design where an element must land in an exact spot, the fixed canvas is the better model. Second, the mismatch between the two windows is solved by rendering the speaker's mirror at the *audience* window's dimensions and transforming it down into its pane, which preserves wrap and laser-pointer coordinates exactly. That only works because the two windows talk to each other.

### The speaker view

psi-slides ships a cockpit: a column scrubber, a live mirror of the projection, the `> note:` text for the current chunk, and a strip of upcoming chunks rendered fully revealed. On top of that: a freeze toggle (`V`) that holds the room on the current slide while you read ahead and resyncs on thaw, a `B` blank that reaches the projector even while frozen, a laser pointer driven by the mouse over the mirror, a timer, and `localStorage` crash recovery. Full protocol in [`speaker.md`](../speaker.md).

The architectural cost is severe and worth stating plainly: the two windows sync via `window.postMessage` over the opener relationship, which means **same machine, same browser, same profile**. No tablet remote, no second-device mode, no network sync. This follows from the `file://` requirement, because Chrome gives every file-loaded document its own opaque origin, so `BroadcastChannel` cannot cross tabs.

For comparison:

- **reveal.js** has a speaker view on `S` with next-slide preview, notes, a timer and pacing. Its documentation states that when used locally, the feature requires reveal.js to run from a local web server. That constraint propagates to **Quarto**, which uses the same mechanism. This is the sharpest single contrast with psi-slides, whose cockpit is designed for exactly the case reveal.js excludes.
- **Slidev** has the richest presenter mode of the Markdown tools: a `/presenter` route with switchable layouts, a screen-mirror capture mode, camera and recording. Remote sync is a dev-server feature; whether the built static output syncs two windows with no server was *(not verified)*.
- **Marp** has a bespoke presenter window on `p` with notes and an overview; its own documentation warns that it may be unavailable when requirements are not met. The transport mechanism and `file://` behaviour were *(not verified)*.
- **Beamer** has no console of its own. You either build a two-up notes PDF with `\setbeameroption{show notes on second screen}`, or you use `pdfpc`, which is excellent (notes, a timer that warns on overrun, next-slide, pointer and spotlight, freehand drawing, blanking) but is one more program to install at the lectern.
- **PowerPoint** and **Keynote** presenter displays are mature and include drawing. **Google Slides** adds an audience Q&A feature that gives the room a link to submit and upvote questions, which nothing else here matches.
- **Deckset** has a presenter display and, usefully, a rehearsal mode that works without a second screen, plus a time-budget timer that shifts colour as you overrun.

### What you hand to students afterwards

Three of the four psi-slides outputs exist for this. `print.html` is a reading document with a cover, a table of contents and stable `id` anchors per chunk, so a student can be pointed at `print.html#mixnet-latency`. `print-notes.html` is the same document with every `> note:` folded in as an aside. Both are pure HTML and CSS with no scripts, both are single files you can mail, and print-to-PDF is one browser dialogue away; the print stylesheet sets A4 geometry, orphan and widow control, and break-avoidance on headings and figures.

The point is not the file format, it is the shape: students get prose, not slides printed six to a page.

Who else does this: **Beamer** comes closest and in one respect wins, since `handout` plus `pgfpages` gives real n-up notes layouts that psi-slides has no equivalent for. **Quarto** renders a genuine document (HTML, PDF, docx) from the same source, and since version 1.4 it bundles the Typst CLI, so a PDF document no longer requires a TeX installation at all. **PowerPoint** and **Keynote** print notes pages. **Deckset** added A4 PDF export with up to four slides per page in early 2026, which is a handout but not a document. **reveal.js**, **Marp** and **Slidev** do not produce a reading document from the same source: Marp's `--notes` writes notes to a plain text file, and Slidev's Markdown export wraps a rendered image per slide.

Two things to know about the psi-slides outputs. Speaker notes appear only in `speaker.html` and `print-notes.html` (grepped across all four to be sure). But `audience.html` contains the *full* prose, because collapse is a runtime mode rather than a build-time deletion, so handing out the audience view hands out the whole manuscript minus your private notes. That may be exactly what you want; it should not be a surprise.

And there is no PDF export path other than the browser's print dialogue. There is no headless browser in the dependency tree and none is planned. Marp (`--pdf`, `--pdf-notes`, `--pptx`), Slidev (via `playwright-chromium`), Quarto and Beamer all have better-defined PDF stories.

### Maths

KaTeX, rendered at build time. `$inline$` and `$$display$$` are parsed as `marked` extensions, so a dollar sign inside a code span is not a delimiter. The output includes KaTeX's MathML, and the woff2 faces are inlined only into views that actually contain a formula.

Honestly placed: this is well above PowerPoint's equation editor, and far above Google Slides, which has no native equation support at all. It is below Beamer, and that is not a close call. KaTeX is a subset of LaTeX maths: no equation numbering with `\ref`, no `mhchem`, no TikZ, no macro packages of your own. If you teach a mathematics course, read [KaTeX's supported functions](https://katex.org/docs/supported.html) before committing. Beamer also has BibTeX and biblatex; psi-slides has no citation system, no bibliography, no `\cite`, and nothing planned.

Among the Markdown tools the differences are smaller than they look. Marp defaults to MathJax and renders at build time; Slidev uses KaTeX at build time; reveal.js and Quarto render in the browser at run time, from a CDN by default. Build-time rendering is why psi-slides has no formula flash and no runtime dependency, which is a small, real advantage over the run-time renderers, and irrelevant next to Beamer's expressive power.

### Images, figures and diagrams

Images use a shorthand, `![](fig-id)`, resolved against `assets/` across `svg`, `png`, `jpg`, `jpeg`, `gif` and `webp`. Inlined SVGs get their internal ids namespaced so several on a page cannot collide, get `role="img"` and an `aria-label` from the alt text, and inherit the page's colour custom properties, so a diagram drawn with `var(--ink)` re-colours when the reader cycles themes. Clicking a figure, a diagram, a code block, display maths or a marginalia block zooms it, and the speaker can drive that zoom on the projector from the cockpit.

There is also a diagram DSL, `::: diagram`, compiled to inline SVG at build time: named boxes, dots, free text with leader lines, arrows with waypoints, auto-fitting containers and braces, seven outlines, and six statements that expand into those – a column chart, a repeated cell grid, a cartesian frame, a table of labelled cells, a set of swimlanes and a protocol run down the page. It differs from the Mermaid family in one deliberate way – **it does no automatic layout.** You place elements on a grid or relative to each other, and the tool routes the arrows between them. That trade is the point: Mermaid decides where things go, which is a service for an org chart and an obstacle for a diagram whose arrangement is the argument. Because layout is re-evaluated per step rather than transformed, arrows stay attached to boxes that move.

The sequence diagram is where that difference is easiest to see, because it is the drawing people reach for Mermaid to get. `sequence` writes one: actor heads, a lifeline under each, numbered messages between them, notes, self-messages. What it lays out is the vertical rhythm and nothing else – each band is as tall as what stands in it – and every part it draws keeps a name, so a brace over three messages or an aside pinned to one of them is an ordinary line of the same language. Mermaid's `sequenceDiagram` is more compact for the plain case and has `alt`/`loop`/`par` blocks this does not; against that, a Mermaid figure cannot be annotated from outside or stepped through beat by beat in the lecture it sits in.

One class bends that rule and is drawn narrow so it cannot grow: `.elbow` gives an edge a right-angled route with its turn halfway across the gap, which is the two waypoints every tree connector was otherwise written with by hand. It looks at nothing else in the figure, so nothing steps around an obstacle for you, and the rail has no option to move it.

What is still missing is a diagram pipeline that *computes* anything. The chart statements draw numbers you have written into the source, one comma-separated string per series; nothing reads a file, runs a query or evaluates an expression. No PlantUML, no TikZ, no executable plotting, no Mermaid input. Quarto, Slidev and Marp all render Mermaid from fenced blocks, Deckset added Mermaid theming and Pikchr in 2026, and Quarto goes much further with executable R, Python and Julia cells that produce figures at render time. **If your figures are computed from data, Quarto is the better tool and it is not close.**

### Fonts and typographic control

An opinionated tool can be genuinely better than a general one here, and psi-slides is unusually deliberate: a chunk-tag vocabulary that sets treatment, four width classes on the internal measure, an OKLCH palette, and a documented list of ornaments the design refuses (PRD §10). Fonts embed from a `fonts/` directory in woff2, woff, ttf or otf, with weight and style read off the filename; naming a family with no matching file fails the build rather than falling back silently.

The flip side is that there is exactly one design and no template gallery. You get the project's taste. Beamer has many themes and most universities ship an official one; PowerPoint, Keynote and Google Slides have vast template markets; reveal.js, Marp and Slidev all have theme ecosystems and Marp themes are plain CSS. Deckset is an interesting middle case: it has 25 or so built-in themes but custom theming is style commands layered on those built-ins rather than authoring a theme from scratch. If your faculty requires a corporate slide master, psi-slides cannot give you one, and there is no export path to a tool that can.

On embedding: it redistributes the font file. SIL OFL and Apache-2.0 permit it, most commercial desktop licences do not. The build prints a reminder and verifies nothing.

### Code

Shiki at build time, with TextMate grammars, so highlighting is exact and no highlighter loads at run time. The compiled-in language list is deliberately small (`python`, `bash`, `shell`, `javascript`, `typescript`, `html`, `css`, `c`, `json`, `yaml`, `markdown`, `sql`, `toml`, `diff`, `text`). Adding one is a single line in `SHIKI_LANGS`, but it *is* an edit to the build script rather than a configuration option, which is a real limitation if you teach Rust or Haskell today.

Slidev also uses Shiki, and adds line-highlight syntax, Monaco editors in slides and animated code transitions, which is more than psi-slides offers for teaching code. reveal.js uses highlight.js at run time with stepped line highlighting; Marp uses highlight.js at build time; Quarto uses Pandoc's Skylighting with 140-plus languages, adaptive themes and progressive line highlighting. Beamer uses `listings` (pure TeX, weaker lexers) or `minted`; the familiar complaint that `minted` requires `--shell-escape` and a separate Pygments install is out of date on current TeX Live, which treats minted's own helper as a trusted executable. PowerPoint, Keynote and Google Slides have no code highlighting at all.

### Reveal, animation, video, interactivity

psi-slides has two mechanisms, and they share one key. A line of `---` inside a chunk splits it into reveal segments that uncover in place. A `::: diagram` block can carry `step` blocks that show, hide, move, emphasise and relabel its elements; layout is re-evaluated per step at build time and the browser interpolates between the results, so a box that moves takes its arrows with it. Both advance on `Space`, in document order, off the same counter. There are still no *slide* transitions and no motion that is not a step the author wrote.

Beamer's overlays are still richer for text. reveal.js has fragments with effects and ordering, plus auto-animate between slides. Slidev has `v-click` with relative and absolute ordinals and animation presets. Quarto has `incremental`, `. . .` pauses and progressive code-line highlighting. Marp is the weakest of the group: its only mechanism is a fragmented list, and only when you use particular bullet markers. PowerPoint's Morph and Keynote's Magic Move are in a different league and always will be.

Video: psi-slides has none. Raw HTML passes through the Markdown renderer, so you can write a `<video>` tag, but nothing except images is inlined, so the file stops being self-contained the moment you do. Video is genuinely in tension with a single-file design at realistic sizes; this is a gap, not a considered feature. reveal.js has video backgrounds, Quarto has a video shortcode, and both handle this properly.

Interactivity is likewise absent: no polls, no quizzes, no widgets. Slidev is the opposite pole, since a slide can be a Vue component and therefore anything at all, and Quarto has Observable JS natively.

### Live annotation during a talk

Two separate surfaces, which is unusual enough to name. `Shift-N` opens private notes only the speaker sees. `N` opens an annotation box on the slide itself, which the room watches you type, mirrored to the projector as you go. Afterwards `Shift-E` copies every annotation out as a marker-wrapped Markdown block, and `node build.js <source.md> --integrate-annotations` moves each block under its chunk in the source. What you improvised in the room becomes permanent lecture text.

The competitive picture is closer than this project used to assume. **Quarto ships a chalkboard** (`B` and `C`) with pre-recorded drawings. **Slidev has a built-in drawing layer** with a persistence option, so drawings can survive the session rather than evaporating. **PowerPoint** ink can be kept after the show and becomes editable objects. **pdfpc** lets you draw over a Beamer PDF. **reveal.js** needs a third-party plugin; **Marp** declined to add one.

So the differentiator is narrower than “live annotation”: it is that psi-slides annotations are *prose that merges back into the source text*. The corresponding weakness is blunt: psi-slides annotations are typed text only. No pen, no highlighter, no freehand, nothing you can do with a stylus. For marking up a diagram live, Slidev, Quarto's chalkboard, PowerPoint and pdfpc all beat it outright.

### Finding your way around

`O` opens an overview board of the whole lecture, pannable and zoomable, with `/` for full-text search across chunk bodies, headings and expansions, and `Enter` to land. `T` is a table of contents. Both windows enter and leave overview together and the framing is synced, so cockpit and projector show the same board.

This matters for two cases: teaching a lecture you wrote a year ago, and answering a question that belongs to a slide forty chunks away. Overview modes are common (reveal.js on `O` or `Esc`, Marp and Slidev both have thumbnail grids, PowerPoint has slide sorter). **In-deck text search is rare**: reveal.js has it on `Ctrl`/`Cmd`-`Shift`-`F` via its bundled search plugin, and it was not found in Marp, Slidev, Quarto or Deckset. A Beamer deck inherits whatever search its PDF viewer has, which is often enough in practice and is not integrated with navigation.

One thing psi-slides does not have: URL deep links. `PRD.md` describes `?c=chunk-id`, but the shipped build never reads `location.search`, so the live views cannot be opened at a given chunk. The `print.html` anchors do work, being ordinary HTML.

### The lectern machine

The presenting machine needs a current browser and nothing else. No Node, no server, no installation, no account, no network. Files come off a USB stick and open.

This is the strongest practical argument for the tool, and only a Beamer PDF matches it. Applications (PowerPoint, Keynote, Deckset) need the application. Google Slides needs connectivity or a pre-arranged offline setup. reveal.js, Marp, Slidev and Quarto outputs are browser-openable, but whether a given build opens from `file://` with no network depends on how it was exported, and reveal.js's speaker view explicitly does not work that way.

The browser floor is a real counterweight, though. The stylesheets use `oklch()`, `:has()` and `text-wrap: balance` with no fallbacks, putting the floor around Chrome 114, Firefox 121 and Safari 17.5, plus `@scope` for lectures with internally styled SVGs. A locked-down lectern machine with an old browser will render this badly, and a PDF would not have cared. Development and real use are in Chrome; other browsers are untested rather than unsupported.

### Build time and the authoring loop

`node build.js lectures/python-intro/source.md` – nine columns, 36 chunks, three images – writes all four outputs in 0.21 s. `--watch` rebuilds on save and pushes a reload over a WebSocket to every open tab, so editor, audience view and cockpit can all be visible at once.

A LaTeX run on a comparable Beamer deck is seconds rather than milliseconds, and TikZ-heavy or `minted` decks are worse; this is the main reason people look at Typst. Quarto with executable cells is slower again by design, because it is running your code. reveal.js, Marp and Slidev have fast dev servers with hot reload and are comparable.

Install weight differs by orders of magnitude and belongs in the same breath. psi-slides is Node 20 plus four small dependencies. Marp offers standalone binaries that bundle Node. Quarto is one installer that bundles Deno, Pandoc, Typst and Dart Sass. Slidev needs a full Node and Vite toolchain. A full TeX Live installation is measured in gigabytes, with TUG's own guide putting the complete scheme at roughly 8 GB, though smaller schemes and TinyTeX exist and a Beamer deck does not need everything.

### Version control, diffs, review, collaboration

Markdown in git: line diffs, blame, merges, `grep` across semesters, a branch for a guest lecture. The unit of change is a paragraph of prose, which makes a diff readable. Beamer, Pandoc, Quarto, Marp, Slidev and Deckset all share this property. PowerPoint and Keynote do not in any useful sense, since the file is a binary bundle git can store but not diff.

Where psi-slides loses badly is *collaboration*. No co-editing, no comments, no review interface, no track changes. Review means a pull request, which means a co-author comfortable with git. Google Slides is the reference point for the opposite trade: real-time co-editing, assignable comments, named revisions; PowerPoint has co-authoring on OneDrive or SharePoint with version history. Quarto is heading this way too, with a collaborative editor announced as part of the Quarto 2 rewrite. If you co-teach with someone who will not open a text editor, psi-slides is not usable for the two of you, and no argument about formats changes that.

### Writing with an LLM assistant

Worth its own dimension because it has changed how lectures get drafted. A closed Markdown grammar plus a linter is close to ideal for a model: nothing to guess, no binary format, and `node lint.js` catches most of what a model gets wrong (invented directives, unknown tags, missing IDs, over-budget chunks). This repository ships an authoring skill for exactly that. The same is broadly true of Beamer, Quarto, Marp and Slidev, all of which are text, and Slidev now ships an MCP server for agents to inspect and edit slides. It is not true of PowerPoint, where a model must drive an API or generate OOXML.

The failure mode to watch, which no checker catches: models renumber `{#id}` attributes when they rewrite a heading, silently breaking cross-references and stored speaker state.

### Accessibility

Honest summary: a structural advantage and no audit.

The advantage is that the outputs are HTML. `print.html` and `print-notes.html` are semantic documents with headings, a `nav` table of contents, `figure` elements, alt text carried onto inlined SVGs, and KaTeX's MathML in the output. That is a far better starting point for a screen reader than a slide deck. It is also worth knowing, and is under-known, that an accessible **Beamer** PDF is not currently achievable: the LaTeX tagging project can produce tagged PDF, but the `beamer` class is not compatible with it, and the experimental `ltx-talk` class is the intended replacement.

The honest side: no accessibility audit has been done on psi-slides. There is no `prefers-reduced-motion` handling for the camera animation, the live views are keyboard surfaces built for a lecturer rather than tested with assistive technology, and nobody has run a screen reader over the audience view. PowerPoint ships an accessibility checker and a reading-order pane, which is an entire workflow this project does not have, and Quarto made PDF accessibility a headline feature of a recent release.

### Longevity and archivability

Added because a lecture is a multi-year asset, and none of the feature comparisons capture it.

A PDF from 2005 opens today, which is a strong argument for Beamer. A `.pptx` from 2005 opens today too, in the same application family. Self-contained HTML should age well, since browsers are conservative about breaking the web, but psi-slides deliberately uses modern CSS with no fallbacks, so today's output leans on features that were new recently. The mitigation is that the *source* is Markdown and will outlive all of this: outputs are disposable and regenerated by design, which is also why they are gitignored. A tool whose source is a proprietary format offers no such fallback.

### Privacy and institutional constraints

Added because at some universities it decides the question outright.

Nothing in a psi-slides output phones home. No account, no telemetry, no cloud storage, and lecture content never leaves the machine. For a lecture containing unpublished research, student data or exam material, that is a meaningful property, and it is the strongest argument against Google Slides in institutions unwilling to put teaching material in a foreign-hosted cloud. Beamer and the local Markdown tools share this property. The HTML tools that fetch fonts or a maths runtime from a CDN at display time do not, quite: a deck that loads a font from a third party on every showing tells that third party where and when you taught.

### Maturity, ecosystem, bus factor, licence

From this repository: 132 commits, one author, 37 tracked files, version `0.1.0`, not published to npm. **No test suite.** CI exists but is a smoke check: install, run the linter over `lectures/`, build the tutorial, deploy it to GitHub Pages. No releases, no changelog, no plugin API, no community, no Stack Overflow answers, and nobody else who knows how `build.js` works. The bus factor is one.

Set that against the alternatives, in rough order of institutional durability: **Quarto** is backed by Posit PBC with paid developers, near-daily pre-releases, and a publicly announced Rust rewrite for version 2. **Slidev** is org-owned with a dominant maintainer and at least one substantial second, and around 48,000 GitHub stars. **reveal.js** has about 72,000 stars, a huge plugin ecosystem, and a single creator with a commercial sponsor behind it. **Marp** is MIT, actively released through 2026, and effectively one maintainer, who has publicly described being overloaded. **Deckset** is a proprietary one-person commercial operation shipping roughly monthly. **Beamer** has decades and books written about it.

Even the projects with weak bus factors have something psi-slides has not: users other than the author, and archived answers to the question you are about to have.

Licensing is one place where the young project is on equal footing: tooling here is MIT, the example lectures are CC BY-SA 4.0, and Beamer (LPPL and GPL), reveal.js, Quarto, Marp and Slidev are all free software. PowerPoint, Keynote, Google Slides and Deckset are proprietary, though Keynote is free with Apple hardware, Slides has a free tier, and Deckset is a one-time purchase.

---

## Tool by tool

### LaTeX Beamer

The serious alternative for the same audience, and better than psi-slides at more things than this project would like.

Beamer wins on maths without qualification; on citations, since BibTeX and biblatex are simply there; on the artefact, since a PDF is the most portable and longest-lived thing on this page; on handouts, since `handout` plus `pgfpages` gives real n-up notes layouts; on maturity; on institutional themes; and on the availability of somebody who can help you. If your lecture is derivations, Beamer is the answer and this comparison is a distraction.

Beamer loses on iteration speed (a heavy toolchain, and compiles measured in seconds rather than milliseconds), on layout adaptivity (fixed canvas, absolute font sizes, no reflow), on the presenter console (pdfpc or a two-up PDF, either way a second thing), on output accessibility (the class is not compatible with current PDF tagging work), and on the slides-versus-script question, which it does not address at all: `\note` is still a second text.

**Pandoc to Beamer** deserves its own line, because it changes the trade. You write Markdown, you get a Beamer PDF, `::: notes` divs become `\note{}`, highlighting comes from Skylighting, citations work through `--citeproc`. That is a diffable Markdown source *and* LaTeX-grade maths in a PDF, which is the closest thing on this page to “psi-slides, but with real maths”. What it does not give you is the collapse mechanism, a browser-native cockpit, live annotation, in-deck search or reflow, and it stacks two toolchains.

### reveal.js

The reference implementation of HTML slides and the ancestor of half this list. MIT, since 2011, an enormous plugin ecosystem, twelve built-in themes, fragments with ordering, auto-animate, video and iframe backgrounds, an overview mode, and, unusually, in-deck text search.

It is better than psi-slides at being a slide deck and it is not close. Where it differs in kind is the layout model: reveal scales a fixed 960×700 canvas, which is the exact failure mode `PRD.md` §6 was written against. Text rescales as a unit rather than rewrapping, so a narrow or low-resolution screen gets the same layout, smaller.

Two further contrasts are worth knowing before you choose it for a lecture rather than a talk. The default output is a directory, with no bundling option and some themes fetching fonts from a CDN. And the speaker view requires a local web server, in the documentation's own words, which is precisely the situation psi-slides was built to avoid. Nor does it give you a reading document: notes are a presenter sidecar, not a second artefact for students.

### Quarto

The closest tool in spirit, considerably broader, and the honest recommendation for a large class of users.

Quarto renders reveal.js slides, HTML documents, PDF (via LaTeX or a bundled Typst), docx, books and websites from one `.qmd`, with executable R, Python and Julia cells, LaTeX-grade maths, citations, cross-references, Mermaid, a built-in chalkboard for annotating live, Skylighting for code, an `embed-resources` single-file mode, and a company behind it. If your figures come from data, or you want a course website or a book alongside the slides, use Quarto. It is a better-engineered and better-supported product than this one.

The distinction is narrow and specific: Quarto gives you the same content in two layouts, one of them slides. It does not derive an abridged slide from your prose, so the density problem stays with the author, and its slides inherit reveal.js's canvas scaling and server-dependent speaker view. It is also a much larger installation than `node build.js`, and a Quarto 2 rewrite is on the horizon, which is worth factoring into a decision either way.

### Marp

Markdown to slides with a small, clean model: a CLI plus a VS Code extension with hundreds of thousands of installs, themes that are plain CSS, MathJax by default, build-time highlighting, and export to HTML, PDF (including notes as PDF annotations) and PPTX. **The PPTX export is a genuine advantage** for anyone who has to hand a file to a colleague or a conference organiser, and psi-slides has nothing equivalent.

Three things to know. Local images are not embedded in the HTML output, by explicit maintainer decision, so “single file” is not on offer. Incremental reveal is limited to fragmented lists. And the project is essentially one person's, with the maintainer having publicly described being overloaded, though releases have continued steadily through 2026.

### Slidev

The most capable of the Markdown deck tools, aimed at developer talks. Vue components in slides, so a slide can be a live demo; Shiki with animated code transitions and embedded Monaco editors; a built-in drawing layer with persistence; a rich presenter mode with screen mirroring and recording; a theme and addon ecosystem; hot reload; MIT.

Its ceiling on interactivity is far above psi-slides and always will be, because a Slidev slide can be an arbitrary application. The costs are a heavy Node toolchain, a component model to learn, an output that is a web app rather than a document (with fonts from a CDN by default), and no prose handout from the same source. For a conference talk with live demos, Slidev is the better tool. For a 90-minute lecture that must also exist as a readable text, it is the wrong shape.

### PowerPoint, Keynote, Google Slides

These deserve more respect than tools like this one usually give them.

They win on things that decide real situations. Your colleagues can open and edit your file, which nothing else here can claim. Template libraries are enormous and your institution probably mandates one. Animation and transitions are years ahead. Presenter views are mature and include drawing. PowerPoint has a genuine accessibility workflow. Google Slides has real-time co-editing, comments, revision history and an audience Q&A feature nothing else matches. Everyone in the room already knows how to use them.

They lose on version control, on maths (PowerPoint's equation editor is adequate inline and awkward for derivations; Google Slides has no native equation support), on code highlighting (none), on the slides-versus-script split, on the fixed canvas, and, for Google Slides, on offline behaviour and on hosting teaching material in someone else's cloud. PowerPoint font embedding is also conditional on the font's own permissions, which is a quiet source of “it looked different on the lectern machine”.

If your working life is inside these tools, the switching cost is high and the gain is narrow. Be honest about whether the drift problem actually bothers you.

### Deckset and similar Markdown-to-slides apps

Deckset (macOS, proprietary, one-time purchase) presents a Markdown file directly: no build step, no toolchain. It has themes, MathJax formulas that autoscale, highlight.js code blocks with line highlighting, list builds, a presenter display, a rehearsal mode that works without a second screen, a time-budget timer, and PDF export including four-up A4 handouts. It is still actively released, roughly monthly, through 2026.

The limits: macOS only, PDF, PNG and JPEG output with **no HTML export at all**, themes you customise rather than author, no drawing or laser pointer found in the documentation, no in-deck search, and a proprietary licence held by a one-person operation. If what you want is “my Markdown, on a projector, now”, it is the shortest path on this page and psi-slides is over-engineered for you.

### Obsidian and Logseq presentation modes

Worth a mention because many lecturers already write in these tools and reasonably ask whether the notes can be the deck.

The honest answer is that the built-in modes are viewers, not deck producers. Obsidian's core Slides plugin splits a note on `---` and presents it fullscreen with arrow-key navigation; the documentation describes no export, no PDF and no speaker notes. Logseq's presentation mode drives reveal.js from a block tree, and community reports say most reveal features work except speaker view and print *(community source, not official documentation)*. Community plugins go further: the maintained `slides-extended` plugin for Obsidian adds themes, annotations and export to standalone HTML and PDF; a third-party Logseq plugin adds export too, but it is paid and caps free users at ten slides.

If you want a distributable artefact, a presenter console or a handout, you will end up outside these tools.

### Also worth knowing

**Typst with Touying or Polylux.** The fastest-moving alternative to Beamer: a modern typesetting language with compile times in milliseconds, slide packages with themes and overlays, PDF output, and speaker notes that drive `pdfpc`. If the compile loop is what you dislike about Beamer, look here. Not evaluated in depth *(claims taken from package documentation, not verified in use)*. Note also that Quarto bundles the Typst CLI, so you can reach Typst output without adopting it directly.

**remark, impress.js and their descendants.** Older HTML slide libraries. They still work; the ecosystem has largely consolidated around reveal.js and the tools built on it.

**Prezi.** Mentioned because the psi-slides overview board is deliberately in its debt, and because the failure mode is instructive: unconstrained zoom and pan on an infinite canvas produced a generation of unnavigable talks. The overview here is a fixed grid of columns, zoomable but not composable, on purpose.

---

## Where psi-slides loses

Collected in one place, without hedging.

1. **It is a young project with a bus factor of one.** Version `0.1.0`, one author, 132 commits, no test suite, no releases, no changelog, no plugin API, no community, and a format still in motion. CI runs a linter and builds the tutorial; that is the whole safety net. Every other tool here is a safer bet on this axis and several are far safer.
2. **Maths and citations.** KaTeX is a subset of LaTeX and there is no bibliography support at all. Beamer wins outright; Quarto and Pandoc-to-Beamer win outright.
3. **Anything involving other people.** No co-editing, no comments, no review interface, no `.pptx` export, no way for a colleague who does not use git to touch your lecture. Google Slides wins outright, and PowerPoint's ubiquity is a genuine advantage that no argument about file formats answers.
4. **Design, animation and diagrams.** One design, no template gallery, no institutional master, no slide transitions, no interactivity, and a diagram DSL that draws but never computes. PowerPoint and Keynote win on motion, reveal.js and Marp and Slidev on themes, Quarto on figures generated from data.
5. **No PDF export** other than the browser's print dialogue, and no n-up handout layouts.
6. **Live annotation is typed text only.** No pen, no highlighter, no freehand. Slidev, Quarto's chalkboard, PowerPoint and pdfpc all beat it for marking up a figure in the room.
7. **The speaker view is locked to one machine and one browser.** No tablet remote, no second-device mode. Architectural, not a missing feature.
8. **The format is opinionated and will not suit every argument.** Topic-sentence discipline is mandatory unless you escape into `::: slide` or `::: script`.
9. **Accessibility is unaudited.** Good structural starting point, zero verification.
10. **The browser floor is high and only Chrome is really exercised.** Modern CSS with no fallbacks, on a lectern machine you do not control.

---

## Choosing

- **Use Beamer** if your lecture is mathematics, if you need citations, or if a PDF that still opens in twenty years is the requirement.
- **Use Pandoc to Beamer** if you want that PDF but would rather write Markdown than LaTeX.
- **Use Quarto** if your figures are computed, if you want a course website or a book from the same source, or if you want the broadest well-supported tool that renders both slides and documents.
- **Use reveal.js, Marp or Slidev** if you want a slide deck: themes, transitions, an ecosystem, PPTX out of Marp, live demos out of Slidev.
- **Use PowerPoint, Keynote or Google Slides** if colleagues must edit the file, if a corporate template is mandatory, or if you need real-time collaboration.
- **Use Deckset** if you want your Markdown on a projector with no build step at all and you are on a Mac.
- **Use psi-slides** if the drift between your slides and your script is a problem you actually have, if you want a prose handout and a projection from one text, if you present from one laptop with an extended display, and if you can live with a young tool whose only maintainer is the person who wrote it.

If you are unsure, the cheapest test is the tutorial: `node build.js lectures/tutorial/source.md`, then open `audience.html` and press `C`. Either that collapse mechanism is the thing you have been missing, or it is not, and the rest of this page follows from the answer.
