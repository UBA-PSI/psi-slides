# Changelog

Notable changes per release. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow [semantic versioning](https://semver.org/). From 1.0.0 the
**source format is the interface**: a change that stops an existing `source.md`
from building the same way is a major version.

## [Unreleased]

### Changed

- **The `::: draw` opener has no braces: `::: draw 150x56 autoplay 1200 cycle`.**
  It was the one block line whose tail held `key=value` options
  (`{unit=150x56 autoplay=1200 cycle}`) where every other `{…}` in the format
  holds sigil tokens – `.word`, `#word`, and inside a draw body `@word` and
  `!word`. Now the grid is positional, as the ratio is on `::: side 2:1`,
  and playback is two keywords after it. The old form is refused with the new
  spelling of that very line in the message; `tools/migrate-draw-opener.mjs`
  rewrites a whole repository (`--check` reports without writing). The
  opener's `{#id}` is gone with the braces – it was stored and used for
  nothing but the compiler's error prefix, which now names the chunk, or for a
  divider figure the column, instead of "a chunk with no id". The compiler is
  handed `unit=WxH` alone and refuses anything else; `DG_HOST_OPTS` no
  longer exists. The figure's source payload carries the whole opener as one
  formatted line, which is what the editor's clipboard tier writes – it used
  to rebuild the opener from the compiler's attributes and so dropped
  `autoplay` and `cycle` on every copy.
- **One `{…}` tail parser for build.js and lint.js**, in the new zero-dependency
  `tails.mjs`, together with the slot tables that were declared in both
  files. A word from no slot is `unknown-class` on every tail (it was
  `unknown-width` on a heading and `bad-side-class`, `bad-cards-class`,
  `bad-rows-class`, `bad-overlay-class`, `bad-backdrop-class` on the
  directives); two words from one slot are `same-slot`; a token without its
  sigil, an `#id` on a directive, or an empty `{}` is `stray-attribute`. The
  directive is named in the message, never in the code. Inside a draw body
  `bad-diagram-attribute` is split into what it meant: `name-in-tail`,
  `empty-tag`, `stray-attribute`, `duplicate-removal` and the previously
  missing `conflicting-class`. No lecture ignored any of the old codes.
- **A written default is now known to be written.** `::: rows` anchors
  `middle` unless the author wrote an anchor, and a scrim with no photo is
  refused even when the scrim word is the default – both used to re-split the
  raw tail by hand; the parser's `written` flag answers them.
- **A directive line the build cannot read is refused, never left as
  prose.** `::: backdrop {.blur}` (no picture), `::: cols 4` and
  `::: overlay {.ink} junk` printed themselves on the slide with exit 0
  while `lint.js` refused them; the build now says which line it could not
  read and what the directive takes, the guard `::: side`, `::: cards` and
  `::: rows` already had. `lint.js` gains `bad-cols` and `bad-overlay`. `autoplay N` on a figure
  with no `step` block is refused in both files – it was a number the
  drawing ignored. A source with Windows line endings used to build to a
  deck with no chunks and exit 0, because every matcher anchors on `$`;
  build and lint normalise to LF on read, and the watch server splices an
  editor patch in the same coordinates.
- **Two new gates.** `tails` holds the shared parser to its contract without a
  build; `legacy-draw-syntax` keeps the old opener out of every `source.md`
  and inventories every other survivor against a reviewed allowlist. The
  corpus gate now asserts how many blocks each file holds, and covers
  `lectures/decoration/` too.
- **`--watch` watches the folder and filters on the file name.** An editor
  that saves atomically – vim, gedit, VS Code by default – writes a temporary
  file and renames it over the original, which gives the name a new inode. On
  Linux inotify follows the inode, so a watch on `source.md` itself went quiet
  after the first such save and every later one built nothing. A directory
  watch survives the rename. The 80 ms debounce and the one rebuild per save
  are unchanged, and an event for any other name in the folder is ignored.
- **A build renders all four views before it writes any of them.** The
  pre-flights refuse what can be seen before a renderer runs, but a defect
  that only one renderer trips over used to leave two new files and two old
  ones side by side – a projection that had moved on from its handout, with
  nothing on disk saying so. Now either all four files are the new build or
  none of them is, and a failed rebuild leaves the last good one whole.
- **`ws` is a dependency, not a devDependency.** `--watch` is a documented
  command and loads `ws` through `import('ws')`, so an installation made with
  `npm ci --omit=dev` – which is what a packaged copy of the engine gets – had
  everything it needed except the one module the watch server starts with.

### Added

- **`--events` writes the build's state as JSON lines on stdout and reads
  commands on stdin.** For a program that drives the build rather than reads
  it – a desktop builder is the first – the alternative was to parse the human
  log, which would have made a rewording of `[rebuild] …` a breaking change.
  One object per line: `build-start`, `build-success` (with the views, the
  shape, the duration and the number of hosted embeds), `build-error` (with
  `userFacing` from the error object, and the stack when it is a defect here
  rather than in the deck), `watching`, `serving`, `changed`, `patch`, `asset`
  and `watch-error`. `{"type":"rebuild"}` builds now and
  `{"type":"auto","enabled":false}` turns the watcher into a reporter without
  ending the watch, because live reload and the diagram editor's write-back
  hang off its socket. The human log is untouched beside it, and without the
  flag nothing is written and stdin is not read at all.

- **`--new <slug> --into <dir>` scaffolds the lecture folder somewhere else.**
  Without `--into` nothing changes: the folder is still made under `lectures/`
  in the working directory, which is right inside a checkout of this
  repository and wrong for a content repository beside it or for a tool that
  asks the author where the project should live. The template's `presenter:`
  is now `TODO – presenter` like every other placeholder, rather than this
  repository's maintainer.

- **`style: {bold: …}` and `style: {print-bold: …}` set how a `**bold**` phrase
  looks, per view.** In this tool bold is a selection mark first – the collapse
  lifts it onto the slide as a bullet of its own – and a weight only by the
  accident of markdown, so a slide came out as a run of accent-coloured bold
  bullets and a printed page dense with them. Each key takes `plain`, `bold`,
  `italic`, `accent`, `accent-bold` or `accent-italic`; `bold` answers for the
  audience and the speaker view alike, `print-bold` for the two documents. The
  switch reaches exactly the bolds the derivation reads – prose paragraphs,
  including inside `::: cols`, `::: side`, a blockquote, a caption and
  `::: marginalia` – and leaves alone a `::: slide` block, a card's lead, a
  row's term, an overlay and a tight list, whose bolds were typed for the look.

  **`*em*` inside such a phrase is now the stress mark.** It renders upright,
  bold and in the accent in every look but `accent-bold`, where the phrase
  already has all three and the em stays italic. Outside a bold phrase `*em*`
  is the italic it always was. That is why no new syntax was needed: the
  thirty-odd `**… *word* …**` already in the lecture corpus are contrast
  stress to a one, and from now on they render as such.

- **A PNG or JPEG that is inlined now goes into the output as WebP q92, by
  default.** A `data:` URI is base64 and so a third larger than the bytes it
  carries; WebP q92 measured 12-18% of the original on real lecture assets, so
  the transcode wins far more than the encoding gives away, and the reader
  cannot see the difference. **It touches nothing on disk** - the asset stays a
  PNG and `source.md` is not rewritten - which is what separates it from
  `--optimize-images`, the explicit verb that does rewrite both and is
  unchanged. Two things deliberately are not failures: no `cwebp` or `magick`
  on PATH puts the original bytes in and says so once, and a small flat PNG
  that comes out *larger* as WebP keeps its original, because shipping a bigger
  file to honour a default is not an optimisation. `--no-optimize-images` turns
  it off, for a build that has to be byte-comparable against one made with a
  different encoder. Measured on a 90 KB screenshot: 56 KB in the page instead
  of 90, and `audience.html` 775 KB instead of 835.

- **`style: {print-body: sans}` sets the printed document in the sans.** The
  live views have answered "serif, sans or mono" since the first commit – `F`
  cycles it, `font:` pins where a lecture opens – and print answered nothing,
  because `PRINT_CSS` names the serif on `html`. `serif` is the default and
  writing it changes nothing; `print-notes.html` follows, being the same
  renderer.

  It is one declaration on `<body>`, not a list of elements, and that is the
  part worth knowing: everything in the print stylesheet that ought to be a
  sans already names one – the tag word, a figure's caption, a sub-heading,
  the contents list – so what inherits the serif off `html` is exactly the set
  that should move, namely the running text, the chunk and column headings and
  a blockquote. Code stays mono either way.

  It deliberately does **not** defer to `font:` the way `print-slide-numbers`
  defers to `slide-numbers`. That key was born deferring, so nothing moved
  under any existing deck; here, a lecture that already says `font: sans` for
  the room would start printing in a sans it never chose – and `font: mono`
  has no sensible reading as a whole printed document.

- **Four serif alternates in the bundle: Source Serif 4, Bitter, Noto Serif and
  Roboto Serif.** Literata stays the default and an existing lecture is
  unchanged; the serif role simply stops being the one role with no choice.
  `fonts: {serif: Bitter}` needs no file, the same way the sans and mono
  alternates do, and only the three families a lecture resolves to are
  embedded, so a deck that names none of them carries none of them.

  They were picked against one question – what a projector does to a typeface –
  and the numbers are measured in a browser rather than argued about. Stroke
  contrast is a capital O's stem over its hairline, and low is what survives a
  lit room; the bold column is how much wider the 600 stem is than the 400,
  which matters more here than in most tools, because `topic-bold` puts the
  first sentence and the bold fragments on the slide and nothing else.

  | | contrast | bold | advance | payload |
  |---|---|---|---|---|
  | Literata *(default)* | 1.68 | +40% | 0.560 | 106 KB |
  | Bitter | **1.35** | +51% | 0.547 | **66 KB** |
  | Roboto Serif | 1.60 | **+63%** | 0.606 | 136 KB |
  | Source Serif 4 | 1.91 | +30% | 0.559 | 100 KB |
  | Noto Serif | 2.00 | +34% | 0.560 | 83 KB |

  Bitter is the sturdiest and the cheapest of the five. Roboto Serif is the one
  that **re-wraps a finished deck** – 8% wider than Literata, which is a line
  the paragraph did not have before – and it is also the one whose width
  reaches a figure: `dgMeasure` estimates every non-mono label with `dgCharW`,
  the *sans* table, so a `.serif` label in a Roboto Serif deck may want an
  explicit `w`. Against 210 real label strings from the corpus the other three
  are **tighter** than Literata already is.

  Two obvious candidates are deliberately absent. Merriweather reads robust and
  has the worst bold separation in the field at +15%. IBM Plex Serif would pair
  with the default sans and has no variable build on `@fontsource-variable`, so
  it fails the rule that a bundled face is a variable latin subset; it is still
  available by dropping the files in `fonts/`.

- **`style: {blocks: left}` puts a code block, a figure and a display formula
  on the prose's own axis**, and four new chunk classes answer that key and
  `style.wrap` for one slide at a time: `{.blocks-left}`, `{.blocks-center}`,
  `{.wrap-none}`, `{.wrap-balance}`.

  All three of those blocks have been centred since the tool shipped, and
  centred is right when the block *is* the slide. It is wrong when the block
  is one step of an argument: a paragraph, then a formula, then a paragraph
  reads as three blocks on three axes, and the formula is the one the eye
  loses. `blocks: left` starts all three where the sentence above them starts.
  `center` is the default and writing it changes nothing.

  Which thing moves is not the same for all three. A top-level code block
  already breaks out of the text column to 72vw and is *centred as a box* –
  the listing inside it was left-aligned all along – so `left` moves the box
  and leaves its contents where they were, keeping the same 78-character
  budget by capping the breakout from the column's left edge instead of from
  the slide's middle. A figure and a display formula are already the full
  measure, so what moves is the artwork, the caption and the equation inside
  the box. A `::: draw` is deliberately untouched: its `<svg>` is emitted
  2000px wide under `max-width: 100%`, so it fills the measure at every chunk
  width and has no space beside it to sit in.

  The four classes are spelled `<key>-<value>` off the `style:` key they
  answer, so either form is guessable from the other, and both directions of
  both keys exist because under a deck-wide `wrap: none` the only way left to
  ask for balancing is to ask for it on the chunk. Only these two keys have
  chunk classes, and deliberately: they are the two whose right answer changes
  from slide to slide, where `headings`, `rules` and `labels` are decisions a
  deck makes once.

  **Unlike `.bare` and `.center`, both reach the printed document**, because
  the keys they mirror do. Those two answer where words sit on a *slide*,
  which a page does not ask; where a formula sits relative to the paragraph
  that introduced it is the same question on paper, and `style.wrap` has been
  in `PRINT_CSS` since it landed. In print, `blocks` reaches the figure and
  the formula and has no code block to move – a listing there is already
  inside the measure.

  Both are legal on a `title` or `closing` chunk, where a width, `.bare` and
  `.center` are refused: a cover's title is a heading and balances like one,
  so `.wrap-none` has something to act on. An unknown value for `blocks` fails
  the build in the pre-flight, like every other viewer default, and `lint.js`
  mirrors the enum and the class list. Purely additive: a lecture that names
  none of it emits no new attribute and its markup is byte-identical.

- **The build now warns when a `::: draw` edge label is wider than the room
  between the two elements it joins.** A node is painted after every edge that
  is not `.front`, so a label with nowhere to go is not merely tight – it is
  clipped, and the room reads `crypte` where the source says `encrypted`. The
  compiler knew the label's width and knew the gap and compared them nowhere;
  the message now states both numbers, because the fix is a number. It is a
  warning, not an error: the figure still builds, and it is the compiler's
  alone – deciding it needs the measured glyph advances and the resolved
  layout, neither of which `lint.js` may reach without pulling the whole
  compiler in behind it. Three cases that look like the defect and are not are
  excluded by construction: a label is compared on **both** axes, so a
  `side top` phrase clearing two short elements is silent; it is compared as
  ink rather than as a line box, so the font's leading is not read as overlap;
  and only the edge's **own** two ends are looked at, which is what keeps every
  `sequence` message out of it and leaves a third shape to
  `dgOverlapWarnings`. It found two in `lectures/tutorial` `#diagram` on the
  first run.

- **`print-slide-numbers` gives the printed views their own numbering.** Same
  three values as `slide-numbers`, and its default is not a value but a
  deferral: an absent key means "whatever the live views are set to", so a
  deck that writes `slide-numbers: off` prints without numbers and a deck
  that writes nothing gets the built-in default in both places. Nothing about
  an existing lecture moves. The case is a document read at arm's length and
  a projection read across a room, which are not obliged to want the same
  marker – stacked digits are legible on paper at a size that would not carry
  to the back of a hall.

- **`style: {hyphenate: …}` decides which views break a word at the end of a
  line.** `print` is the default and is exactly what the tool has always done
  – the two document views hyphenate their prose and the two live views never
  do. `all` puts it into the projection and the cockpit as well; `none` takes
  it out of the documents too.

  `lang:` still picks the dictionary and stays a key of its own: the language
  is a property of the lecture, not an opening preference, and a German deck
  may perfectly well want its projection unhyphenated. The case for `all` is
  that same German deck at `.narrow`, where one compound noun opens a hole in
  the measure that no rewriting closes. The live rule is scoped to the stage,
  so a table of contents, a search hit and the help sheet are never
  hyphenated, and it carries the same `manual` reset the print rule does,
  because `hyphens` inherits into code and URLs where a break is simply
  wrong. What it deliberately does not reach: the `hyphens: auto` inside a
  `::: cards` card and a `::: rows` term, which is not a preference but the
  rescue for a 320px measure a long word overflows outright.

- **`::: side {.middle}` centres the shorter pane against the taller one.** A
  short pane sat at the top of its half and left the rest of it blank, which
  on a two-line commentary beside a tall figure is most of a slide. The word
  rides in a brace tail against a closed slot table (`anchor: top | middle`),
  the same two words a `::: cards` row already uses for the same question, and
  the ratio stays positional: `::: side`, `::: side 2:1`, `::: side {.middle}`,
  `::: side 2:1 {.middle}`. `top` is the default and is what a bare `::: side`
  has always drawn, so no existing lecture moves – a figure captioned from the
  top is often captioned from the top on purpose.

  **It is the block's switch and not each pane's, and that is a fact about
  grids rather than a simplification.** A grid row is as tall as its tallest
  item, so the tall pane already fills the row and centring cannot move it:
  `align-items: center` therefore moves exactly the short pane, which is the
  whole of what "prose beside a tall figure" asked for. A second, per-pane
  word would only have bought the ability to leave the tall pane where it
  already is. `test/side-anchor.mjs` measures both halves of that in a browser
  – the short pane's offset changes, the tall pane's does not, and the row is
  the same height either way.

  It costs nothing downstream, by the same measure the ratio did: print sets
  `.side` to `display: block` and stacks the panes, so `PRINT_CSS` carries no
  rule and `print.html` is unchanged; the collapse mode does not touch
  `.side`. An unknown word in the tail, or two words answering the anchor,
  are both hard errors in the build and errors in `lint.js`.

- **`closing-image:` gives the closing slide a picture.** A `## closing:`
  chunk draws the deck's cover composition, and the four compositions that
  take a picture (`split`, `hero`, `beside`, `above`) drew their words with
  the picture track collapsed – a lecture could not end on the image it opened
  with. Two cases, two spellings, and only one of them is a filename:

  ```yaml
  closing-image: cover        # the picture the deck opened with
  closing-image: end-photo    # a different one - asset id, path, or https URL
  ```

  `cover` is a reserved word and names *which* picture, so a deck ending on
  its own opening image writes the filename once. (A deck with an asset
  literally called `cover` writes the path, `assets/cover.jpg`, which is one
  of the three forms anyway.) It draws through the cover's own
  `renderCoverArt` into the same slot, so the last slide divides the frame the
  way the first one did – which is why the closing slide now takes
  `cover-ratio` when, and only when, it has a picture to divide it for.

  **It does not replace `::: backdrop` on a closing chunk and is not the same
  thing.** A backdrop is a full-bleed ground *behind* the type and works on
  all ten compositions; this fills the picture slot of the four that have one.
  A backdrop written on the chunk still wins over both, exactly as it does on
  the cover, and does not lift the empty-track collapse – the track it would
  have filled is still empty.

  Three refusals, all in the `buildOnce` pre-flight so `--print-only` reaches
  them, all mirrored in `lint.js` as `bad-closing-image`: the key on one of
  the six compositions that draw no picture, `closing-image: cover` with no
  `cover-image` to reuse, and a `closing-image` in a deck with no `closing:`
  chunk. Purely additive – no existing `source.md` could have used the key,
  and every lecture in the repository builds byte-identical markup.

- **`node build.js <source.md> --squint` writes what a room would see into a
  file.** The projection shows far less than the source: collapsed, a chunk
  renders its heading, the first sentence of every paragraph and the promoted
  `**bold**` fragments, while lists, code, figures and formulas stay whole,
  `::: slide` and `::: script` change the rule for one chunk, and a
  `::: backdrop` or `::: overlay` is not inside `.chunk-body` at all. Anyone
  reading `source.md` – a person or a language model – reasons about text the
  room never gets, and the defects that follow are one shape: a slide that
  announces a list and withholds it, a sentence that points at something
  nobody can see, an instruction whose "how" sits in a continuation clause.
  The tutorial's own `#anti-patterns` chunk names the failure; nothing
  measured it. This is the squint test made mechanical, and step 8 of the
  authoring workflow – *build, open `audience.html`, press `C` on every chunk*
  – is now a command that produces a diff.

  It **reads a rendered page and never the source**, which is the whole
  design. The collapse is CSS and JS; a source-parsing extractor would be a
  second implementation of the exact rule this exists to stop people getting
  wrong, and would be wrong in the same places they are. Every line comes out
  of the built `audience.html`, walked state by state in a real browser, and
  "is this painted?" is answered by `Element.checkVisibility` rather than by a
  table of selectors. It walks **beats, not slides**: a chunk with `---` shows
  only its first segment when you arrive and an overlay with `from 2` is not
  there at all, so what arrives later is marked `+N`. And it carries the
  **withheld prose too, abridged** – the question a review actually asks is
  what the room did *not* get, and answering it in full would make the file a
  copy of `source.md`, so a hidden paragraph is one line: its word count and
  its opening. The count is the part that diffs, which says exactly the right
  thing – shortening a continuation moves nothing on the slide, and the file
  then changes one number and no text.

  The output is line-oriented and made for reading in a review and for
  `git diff`: one block per slide with its id, type, width, beats and note
  length, then one line per thing on it, each with a mark saying what it
  becomes – `.` a sentence the room reads, `-` a promoted bold, which the
  collapse renders as its own bullet, `•` a list item and `▸` the one a
  running agenda marks live, `|` code or a table row
  or a formula, `[` a block or construct that is on the slide whole, `~` prose
  the collapse withholds. Written to `squint.txt` beside the source, or where
  `--squint-out` says; `--squint-out -` writes to stdout. `--viewport WxH`
  reads at another size. Speaker notes are counted and never quoted: they are
  the one thing certain not to be on the projection, and `print-notes.html` is
  the file for reading them.

  **A construct is named with the one thing it is about**, which took three
  corrections found by reading the file rather than the lectures – each of
  them a line that named a construct and left out its subject. A `::: side`
  carries the ratio it splits on and its anchor (`side 2:1 · middle · first
  pane`), read off the wrapper's custom properties rather than off a class,
  with an equal pair reported as the `1:1` the room sees rather than as the
  nothing that was typed. A running agenda says which of its items is live and
  out of how many: a deck wearing `section: outline` draws the same list at
  every part, so without it five dividers are five identical blocks and the
  one fact that separates them is in none of them. And a two-cell list item is
  joined as the grid joins it – that last one a defect the file *induced*
  rather than reported, because `build.js` writes the agenda's numeral against
  its heading, and a `::: rows` term against its body, with no whitespace
  between them on purpose, the layout supplying the gap. Read flat that
  returns one word that is on no slide, `Anonymitycomes from the others`, and
  the review it was written for went looking for a typo the deck did not have.

  What it deliberately cannot see is in its own header: colour, contrast,
  overlap and anything below the fold. A slide can be in this file in full and
  unreadable on the wall – a `::: rows` body painted in the page colour
  measured 810×87 px, `visibility: visible`, `opacity: 1`, and was invisible.
  `--check-fit` answers the frame; this answers the words.

  It never fails a build: no `playwright-core` or no browser reports that it
  could not look and leaves the exit code alone, and with the flag absent the
  build is byte-identical and needs no browser. `--check-fit` and `--squint`
  now share one bootstrap, which also taught `--check-fit` to read
  `$PSI_CHROME` – the variable the test suite and `docs/site/shoot.mjs`
  already read, and the only way to point either at a browser that lives in
  the Playwright cache rather than in `/Applications`.

- **`{.center}` in a chunk's attribute tail sets that chunk's prose on a
  centre axis**, on the projection and in the cockpit and not in the printed
  document – the second non-width class the tail takes, beside `.bare`, and
  the same kind of switch: where words sit on a slide is not a question a
  document asks, so `PRINT_CSS` carries no rule and `print.html` is unchanged
  for every existing lecture.

  The case is the line or two under a figure. Left-aligned, a caption starts
  at the far edge of a `.wide` slide while the drawing sits in the middle, and
  the two read as two unrelated blocks. It reaches
  `.chunk-body > .reveal-segment > p` and nothing nested, so a list, a table,
  a code listing and the prose inside a `::: side` pane or a `::: cards` row
  all keep the left edge they need.

  **It is a class an author writes and deliberately not a default for the
  `figure:` tag.** That was built first and reverted on the evidence: the
  seven-line paragraph under `lectures/diagrams` `#flowchart` came out ragged
  on both edges and hard to read, and no selector knows how long a caption is.
  It moves the prose and not the heading, because where a heading sits is
  already `style.headings`'s question and a chunk class answering it too would
  be a second, stronger way to say the same thing that
  `style: {headings: left}` could no longer override. Refused on a `title` or
  `closing` chunk by the guard that already refuses `.bare` there – a cover
  composition decides the width, the heading and, through `cover-align`, where
  its words sit.

- **A gate for the two characters that mean something else inside build.js's
  template literals** (`test/gates/inlined.mjs`). Roughly two thirds of
  `build.js` is CSS and runtime JS held in template literals, where a raw
  backtick ends the literal – including one inside a comment, which is where
  it always happens – and a single-backslash regex escape is eaten by the
  literal, so `/\s+/g` ships as `/s+/g`, a regex matching the letter s. The
  first is loud but names the wrong thing: `SyntaxError: Unexpected
  identifier 'hidden'`, eight thousand lines in, in a CSS comment about an
  attribute, and it costs a build to find out. The second is silent, and cost
  a search index with every `s` stripped out of its text. The gate names the
  line and the literal in milliseconds, and both halves were verified by
  introducing each defect and watching them fail. The third documented trap –
  an unterminated `/*` swallowing every rule after it – already refuses the
  build in `assertStylesheetsWellFormed()` and is not repeated.

- **A heading can be the document's without being the slide's.**
  `## figure: How a crawl is scored {.full #loop .bare}` keeps the heading in
  `print.html` and in the search index, and takes it off the projection. `style: {headings: off}` is the same switch for a whole
  deck. The case is a talk that is a run of `::: draw` figures with speaker
  notes: the room looks at the drawing, and the deck still needs a name per
  slide to navigate by and to print. Leaving the heading text out gives up all
  four at once; this gives up only the slide.

  `off` sits in the existing `style.headings` key beside `left` and `center`
  rather than in one of its own, because the two readings are one question -
  what the projection does with a heading - and a second key's only legal
  combination with this one would have been "off, and also aligned left".

- **A backdrop can be revealed, and text can wait for the beat.**
  `::: backdrop pic {.cover} reveal full, right 45%` walks the picture's
  *window* across the slide's beats: a photograph that retreats to free the
  paper the title is written on, or – with `over` in the class tail –
  one that grows over the title and covers it. `::: overlay {.left} from 1`
  is the other half: a block of type that arrives on a beat, which is what
  makes the picture half work on a slide with no body to split.

  It is a window and not a size. `clip-path`, animated, with
  `background-size: cover` still resolved against the whole slide, so the
  photograph stays exactly where it is and the frame opens over it;
  animating a width instead zooms and slides the picture while it is being
  revealed. The places are indexed by the beat rather than pushed into the
  ordered beat list, because the backdrop is a sibling of the content and
  document order would put every one of its places before every reveal
  segment – and the move this exists for is the one where the picture
  retreats and the words arrive in the same beat.

- **`## outline:` – the agenda where the author puts it.** The same list
  `section: outline` draws, as a chunk, for the place a lecture most often
  wants its plan: right after the cover, where there is no column boundary
  for a divider to be generated at. Before the first part nothing is live
  and every item is read at full strength – a list nobody has started is a
  plan, and recession is what says *not the one we are on*. Unlike a
  divider it prints.

- **A section divider can carry its own content.** The lines between a
  `# Heading` and the first `##` chunk used to be dropped without a word;
  they are the divider's slide now. A blockquote opens the part on a
  quotation, a `::: backdrop` on a photograph, a `::: draw` on a figure –
  three things authors ask for, no vocabulary added for any of them. Those
  words print as a lede under the part title; the divider slide itself
  never has.

- **`cover: quote`** – the talk opens on a claim rather than on its own
  name. The title chunk's body is the sentence; the lecture's title reads
  as the attribution under it. **No quotation mark**: a sentence alone on a
  slide with a name under it already reads as a quotation, and the mark is
  what gets added when the composition is not trusted to say so.

### Changed

- **Every setting in a `{…}` tail is written with its dot, and the parsers
  refuse anything else.** `::: cards`, `::: rows`, `::: overlay`, `::: backdrop`
  and `::: side` accepted `{outline middle}` and `{.outline .middle}` alike –
  the dot was stripped – while a chunk heading and a `::: draw` box took the
  dot and nothing else, so one thing had two spellings and an author could not
  tell which was the real one. Now one sigil rule holds everywhere: `.word` is
  a setting, `#word` an id, `@word` a group. A dotless word on a slot directive
  is an error in the build and in `lint.js`, with the dotted spelling in the
  message. The chunk tail is held to the same standard from the other side: a
  token with no sigil (`{wide #id}`) was dropped in silence and the chunk built
  without its width – now a `stray-attribute` error – and two widths, or two
  answers to one `style:` key, let the last one win – now a `same-slot` error,
  the refusal the slot directives already made. The affected directives are
  post-1.0.0 and unreleased, so no released source changes meaning.
- **A chart's columns draw no outline, are filled at a column's strength,
  and `emph` on a column is a fill.** A `bars` column was an ordinary box: a
  1.4 outline standing on a 1.05 baseline, and under `emph` a 2.6 accent
  outline crossing that baseline at the foot of every marked column. The
  outline encoded nothing (Tufte's data-ink), so a column now arrives
  `.bare` – the author's own `.thick` displaces it through the stroke-weight
  slot – and `emph 2` turns column 2 solid accent, which is what `.tone-4`
  already means. Without an outline a box tone is a watermark on a
  projector, worst in the dark themes, so a column reads its tone at
  roughly twice a box's strength, in the same hue and order: no tone is a mid
  grey, `.tone-2` lighter, `.tone-3` darker, `.tone-1` a strong accent tint,
  `.tone-4` the accent. One table, `DG_BAR_FILLS`, generates the stylesheet
  rules and feeds the linter. A tone on a `bars` line is a category from here
  on, one per `series of`; `.tone-3` written only to get a fill can come off.
  `figure-design.md` says it under Charts.

- **`key "2023"` on a `bars` line, and the chart draws its legend.** A swatch
  that is a column of the run – same classes, same role, so the same colour by
  construction – and the name beside it, in a row above the frame's top-left
  corner; a `series of` line appends to the row of the chart it joined. The
  hand-built legend out of boxes showed a tone at a box's strength, which
  was never the colour of the columns. Generated names `<id>-key` and
  `<id>-key-label`; the editor offers the field with the run's data.

- **The linter measures every run of columns against the paper of all seven
  themes** (`diagram-bar-contrast`) and warns where a fill falls under 3:1,
  naming the themes, with the note that the warning can be ignored for a
  theme the lecture will not be shown in. It also warns (`diagram-bars-emph`)
  where `emph` says nothing or the wrong thing on a grouped chart: on a
  `.tone-4` run, whose columns are the accent already, and at an index a
  run above already lit, where both columns come out alike at exactly the
  place the figure is about – `dim` on the other columns is the idiom.

- **The default look of a bold phrase moved: `plain` on the slide, `bold` in
  the ink on paper.** A promoted bullet is now set like the sentence above it,
  and a printed bold no longer carries the accent colour. Both are the fourth
  line of the 1.0.0 recipe: `style: {bold: accent-bold, print-bold: accent-bold}`
  gives the old rendering back, the one difference being that a sans deck's
  promoted bullets then weigh 600 like its other bolds rather than the old
  fixed 500.

- **Slide numbers are now drawn in a row by default, where they used to be
  stacked.** This one moves what an existing deck renders: `slide-numbers` is
  a viewer default, so every lecture that does not set the key changes from
  the stacked markers to the horizontal ones. Nothing stops building and no
  source needs editing – the old rendering is `slide-numbers: vertical`, one
  line in the frontmatter, and `L` still cycles all three.

  The reason is what the stacked form does past nine: it sets each digit on
  its own line, so slide 10 reaches the room as a 1 above a 0 and the reader
  assembles the number. The content repository's house-style file had carried
  "set `slide-numbers: horizontal` in the frontmatter" as standing advice for
  long enough to be the tell – a default every deck is told to override is a
  default that is the wrong way round. Taken deliberately, and not softened
  with a compatibility switch: one more key would mean the old rendering was
  reachable two ways and neither was the answer.

- **`auto-fit` takes a third mode, `shrink`.** `true` and `false` are
  unchanged and mean what they always meant, so this is additive. The new
  mode fits a slide the same way `true` does but ceilings the fit at the
  lecturer's own zoom instead of at the global maximum, so it can only ever
  take size away: a slide that fits is left at exactly the zoom that was set,
  and a slide that does not is shrunk until it does. That is the difference
  between the two on-modes, and it is the one most lectures actually want –
  `true` grows a short slide as readily as it shrinks a long one, which is
  why a deck of one-line principles under auto-fit reads as a deck of
  posters.

  `#` is now a three-way cycle, off → shrink → on, and so is the `#` button
  in the touch palette. Unlike `C`, `F`, `A` and `L`, `Shift` does not reverse
  it: `#` is Shift-3 on a US layout and an unshifted key of its own on a
  German one, so the modifier carries no information that means the same
  thing on two keyboards. Three states are two presses from anywhere.

- **The word for what a chunk is has changed from *tag* to *type* everywhere a
  user reads it.** `## principle:` is unchanged and no `source.md` needs
  editing – the source format never contained the word. What changed is the
  prose (`README.md`, `PRD.md`, the authoring skill, the tutorial lecture) and
  two linter rule ids: `unknown-tag` is now `unknown-type` and
  `figure-tag-without-figure` is now `figure-type-without-figure`. A source
  silencing either by its old name with `<!-- linter: ignore … -->` starts
  reporting it again; rename it in the comment.

  The code keeps the old name: `VALID_TAGS`, `chunk.tag`, `parseTagPrefix` and
  the `data-tag` attribute in the published HTML are unchanged, because
  `data-tag` is what the search index and the speaker's own lists read and
  renaming it would break anyone's CSS for no reader's benefit. The `::: draw`
  `@tag` is a different thing and stays a tag.

- **A code span with no space in it is no longer broken across a line.** The
  default line-breaking rules break after any hyphen, so `---` – the segment
  separator – came out as a hyphen ending one line and two opening the next,
  which reads as two different separators. The renderer marks such a span and
  the stylesheets set `white-space: nowrap` on it. A span *with* a space in it
  is left breakable: the widest one in the tutorial is a 46-character linter
  directive already filling most of its line, and unbreakable it would leave
  the text column.

- **`::: margin` is now written `::: footnote`.** The old name was one
  keystroke from `::: marginalia`, which is a different construct in a
  different place – a marginalia goes out into the slide margin and can be
  clicked into the centre, a footnote sits under the chunk and is read where
  it is – and "margin note" named the one place the block never sits. The new
  name says where the thing goes.

  **`::: margin` still builds and always will**, so no existing `source.md`
  breaks; it is simply documented nowhere any more. Both spellings render the
  same aside, and `test/settings.mjs` asserts that they do, that both lint,
  and that an unclosed block quotes back the word the author wrote.

- **A touchscreen can now reach the knobs, and the cockpit has a rail at
  all.** There was a five-button rail – forward, back, overview, two zooms –
  and it was rendered into `audience.html` alone. That is the window a
  lecturer is least often holding: on a tablet at the lectern the cockpit is
  the one in your hands, and it had no touch controls whatsoever and a footer
  carrying freeze, layout, export and help. `C`, `F`, `A`, `#`, the search
  and text selection were unreachable there without a keyboard, and the rail
  in the other window carried only things a tap or a pinch already did.

  The rail is now shared by both live views and gains a `⋯` button that opens
  a second pill above it with `C`, `F`, `A`, `#`, search and text selection.
  Two pills rather than one row: eleven round targets do not fit a phone held
  upright, and the five that matter mid-talk should not shrink to make room
  for the six that do not. Every button calls the function its key calls and
  never a second code path, so the rail cannot drift away from the key map.

  Text selection is the one place the two models differ, on purpose. On a
  keyboard it is `Alt` held down, because a mode is state you can forget you
  are in and the state you forget here is the one where dragging no longer
  pans. A finger has no modifier to hold, so on touch it is a mode – shown as
  a pressed button, cleared by `Esc` or by pressing it again. It carries its
  own flag rather than borrowing the `Alt` one, which the `selectionchange`
  listener switches off whenever nothing is selected: without that the mode
  would have survived exactly until the next tap.

  Also on a narrow screen, an opened `::: expand` now covers the slide
  instead of being squeezed into half of a two-column grid that has no room
  for two columns.

  All of it is behind `@media (pointer: coarse)`, so a laptop never sees it
  and an iPad with a keyboard attached re-classifies and loses it again.

- **The sideways arrows now mean one thing, and `Shift` with them changes
  column – from any slide.** Up to now `→` and `←` were forward and backward
  on most slides and *next / previous column* on the first chunk of a column,
  so the same key meant two things depending on where the lecturer stood, and
  two faint marks at the viewport edge existed to say which. `→` and `←` are
  now plain forward and backward everywhere; `Shift`-`→` and `Shift`-`←` are
  the next and previous column, reachable from any chunk. `Shift`-`←` rewinds
  to the head of the column it is in before leaving it, so returning to the
  top of a part and leaving the part are one key.

  The exception cost more than it looked. It needed a guard in the key map,
  because `nextCol` fell through to the last chunk of the whole lecture and
  the head of the *last* column therefore had to be excluded by hand – one
  press otherwise skipped six slides, and on a single-column lecture all of
  them. It needed a per-chunk `sideways` field for that guard and the marks to
  read in common, so the two could not disagree about which meaning was in
  force. And it could not do the thing a lecturer actually asks for, which is
  to leave a part from the middle of it. All three are gone: the guard, the
  field, and the `‹ ›` marks, which had nothing left to announce once the key
  meant one thing. `nextCol` and `prevCol` now stand still when there is no
  column that way, the rule the chunk keys already followed at the ends of the
  deck. The `⌄` mark at the foot stays – it says where forward will *go*, not
  what a key means, which is why it survived the two that went.

  No source format changes. `test/nav.mjs` and `test/nav-cockpit.mjs` assert
  the new model, including the two cases the old one could not express.

- **An external link now carries a mark that shows its address and a QR code.**
  Up to 1.0.0 that view existed and was reachable only by `Shift`-clicking the
  link – a modifier nothing on the slide mentioned, so for most readers the
  feature did not exist and a plain click simply opened the page. A small
  button after every `https?://` link now opens the same overlay on both
  screens; `Shift`-click is unchanged, and a plain click on the link itself
  still opens the page in a new tab as before.

  It is a `<button>` rather than a second link, so it announces what it does
  and answers `Enter` or `Space`: the key map stands back for that one
  button, or the deck's own `Space` binding would advance the slide instead
  of showing the address. `style: {link-codes: off}` takes the marks away
  for a deck that would rather keep its links bare. Existing sources are
  unaffected in every other respect: the attribute is emitted only when the
  key says `off`, so a deck that says nothing produces byte-identical markup
  apart from the marks themselves. Print hides them.

- **`masthead` was rebuilt.** It read as empty, and the fault was not the
  empty middle band: measured on a real deck, *nothing on the slide spanned
  the measure* - the longest line reached 55% of the frame with a short title,
  and the credits, already described as "a row", were a left-hugging run with
  a wide space in the middle. It now carries a 2px folio rule above the
  credits, lays them out to both edges of the measure, and takes a **lede**
  from the title chunk's own body in the field between the bands, with `info:`
  still supplying the meta. With no lede the nameplate is set larger.

- **`split`'s gutter is 4.4em, up from 2.4em.** That padding is the guaranteed
  minimum distance between the type and a photograph bled off the edge, and at
  the old value a title that nearly filled its column came within about 50px
  of the picture. A long title now wraps where it did not.

- **The 1.0.0 look is reachable, as three ordinary settings.** From 1.0.0 the
  source format is the interface, and a finished deck should be able to lay
  out the way it laid out. Exactly three things have moved since that an
  existing lecture would notice, found by diffing the two stylesheets between
  the tag and HEAD rather than by reading commit titles:
  `fonts: {sans: Inter Tight}`, `style: {wrap: none}` and `ligatures: all`.
  Verified: the same source built through `git show v1.0.0:build.js` and
  through HEAD with all three set is **pixel-identical**, 0 differing pixels
  by `magick compare -metric AE`.

  A `layout: 1.0` umbrella over those three was written and then removed, and
  the reasoning is the part worth keeping: one key naming a version reads as a
  promise that the engine can rebuild any past release, which is unbounded -
  every later change to a shared stylesheet would have to be gated on a
  generation, the gates would compose, and the untested combinations would
  grow with every release. It also put the burden on the author to know which
  version their deck was authored against, and on the project to publish a
  layout-version history beside the software version. Each of the three
  settings is a preference someone might want on its own merits, so the old
  look is a recipe in the docs rather than a mechanism in the code.

- **The bundled font roster is per-lecture, and it has two alternates.**
  `fonts: {sans: Inter Tight}` or `{mono: Noto Sans Mono Condensed}` needs no
  file in `fonts/` - a bundled family is named the same way and supplies
  itself. The roster used to be a fixed list that every output carried in
  full, so adding two faces would have cost ~470 KB in every file including
  the lectures that wanted neither; only the three families a lecture resolves
  to are read at all.

  The condensed mono is a **pinned instance of a variable font**, not a
  different typeface: Noto Sans Mono carries a `wdth` axis and
  `font-variation-settings` is a legal `@font-face` descriptor, so pinning
  `wdth 62.5` yields one ordinary family nothing downstream has to know about.
  Measured, 0.50 em per character against JetBrains Mono's 0.60, with a
  slashed zero and three visibly different shapes for `I`, `l` and `1`.
  Iosevka reaches the same width and was dropped on payload - 961 KB against
  54, or 3.87 MB of base64 per view - so the rule is now that a bundled face
  has to be a variable latin subset. Iosevka is still reachable through
  `fonts/`.

- **`ligatures:` decides a question that was two questions.** `text` (the
  default) is fi and fl in prose and none in code, which is what the tool
  already did; `none` takes them out of prose as well; `all` puts the code
  ligatures back, so JetBrains Mono draws `->` as one arrow glyph again. The
  default is not `none`, because code ligatures were already off and
  defaulting to `none` would take fi and fl out of every existing lecture's
  prose - a change to finished decks made in the name of not changing
  finished decks.

- **`::: draw autoplay N` walks a figure's steps on a timer.** One delay for
  every step, so a cover figure animates while the room files in; it works on
  any chunk. `autoplay` never reaches the compiler - build.js reads it off
  the opener and puts it on the emitted figure - because playback is not part
  of the drawing and `diagram-core.mjs` also runs inside the browser editor,
  where there is no deck to play. The runtime calls the same advance the Space
  key calls, so there is one counter, one broadcast and one freeze gate, and
  the speaker view follows without knowing it exists. It runs in the audience
  only, and the first key, pointer or wheel event **on that slide** retires its
  clock: a lecturer who has touched the figure has taken over. Scoped to the
  slide rather than to the session, which is not a nicety - you reach a slide
  by pressing a key, so a session-wide flag was set by the very keypress that
  navigated to the figure, and autoplay could only ever run on a slide the deck
  happened to open on. The listener is in the capture phase, so the arrival key
  is charged to the slide being left rather than the one arriving. Bounded 200 ms to 60 s, refused
  rather than clamped. `cycle` beside it repeats the walk, rewinding through
  the same counter so the speaker view follows the rewind as it followed the
  walk; the last beat is held for one delay like any other, because a second
  number for how long to admire the finished picture is a knob nobody asked
  for. `cycle` without `autoplay` is an error in both the build and the
  linter.

- **`style: {labels: off}` hides the generated tag words.** They are two
  things wearing one name and the switch reaches both: the document renderer
  labels principle, question, definition and exercise, while the projection
  generates only EXERCISE. Its own key rather than part of `rules`, which
  hides the bar over a principle and the hairline over a definition - a word
  and a line are not one decision. A figure's all-caps heading needs no key:
  it is the chunk's own heading, so leaving it out of the source leaves it off
  the slide, at the cost of the TOC entry and the search text.

- **Four more covers, and two of them draw.** `stack` centres the title block
  on both axes, `rule` holds it between two hairlines - both for the talk that
  wants a quiet opening rather than an asymmetric one. `beside` and `above`
  take their art from the **title chunk's own body**, which is what lets a
  `::: draw` be the cover: a diagram is not a file, so `cover-image` could
  never name one. `beside` insets the art beside the title and `above` puts it
  on top with the type centred in the band below. `split` bleeds where
  `beside` insets, and that is why both exist - a photograph wants the edge, a
  drawing wants a margin, because a diagram cropped by the frame reads as a
  diagram that did not fit. `cover-ratio` (15-75%) sets how much of the slide
  the picture takes on the three covers that divide it; written on one that
  does not, it is an error rather than a number the drawing ignores.

- **The cover has nine compositions, and a `subtitle:` line.** `cover:` picks
  between them and the list runs quiet to loud, which is the only question it
  asks. Five are type alone: `classic` (the lower-left third the tool always
  drew, and still the default), `masthead` (the title along the top edge, the
  credits along the bottom, the field between them left empty), `stack` (the
  block centred on both axes), `display` (the title set to fill the slide, so
  the scale is the whole design) and `panel` (the type on a full field of the
  theme's accent). Four take a picture: `split` (type left, `cover-image:`
  bled off the right edge), `hero` (the picture is the slide, the type
  reversed out of a gradient) and `beside` / `above`, which take their art
  from the title chunk's own body. `subtitle:` is the hierarchy step the cover
  was missing: without it the one line that says what the talk is *about* has
  nowhere to go but the `info` block, where it renders at meta size in soft
  ink beside the room and the date – so the subtitle is set exactly like the
  venue line. Four sizes now where there were two. An unknown `cover:` fails
  the build, and so does `split` or `hero` with no `cover-image` rather than
  drawing an empty half.

  The five type compositions each combine with `::: backdrop`, which is how a
  picture reaches a cover that has no picture slot of its own. On `panel` the
  two make something neither has alone: the field becomes the scrim, so the
  photograph reads through a plate of the accent rather than under the paper
  veil that would lighten the ground beneath type which is already reversed.

- **`## closing:` closes the arc back to the cover.** The last slide of a
  deck, drawn in whatever composition `cover:` names, so the room sees the
  shape it started with. It carries the author's own words – the heading, the
  sub-heading after the `|`, and a body – and deliberately **neither the
  presenter line nor the `info` block**: those say who is talking and where,
  which the room learned an hour ago, and repeating them in the same
  composition is a slide that reads as a mistake in the deck rather than as an
  ending. The composition is inherited and the content is written.

  It is a tag rather than a second `title:` chunk or a frontmatter key. A
  title chunk's heading is *ignored* – the cover renders from frontmatter – so
  a closing slide could only get its own words by making the heading mean
  something on the second occurrence, a positional exception to a rule frozen
  at 1.0.0; `lint.js` already warns that a second `title:` chunk does not
  render, so the two spellings would contradict each other. Adding a tag is
  additive: no existing source could have used the word, because it would have
  failed the build. `lint.js` gains `closing-count`, `closing-position` and
  `closing-heading`.

- **`::: backdrop <ref> {.classes}` fills the slide with a picture.** On any
  chunk, not only the cover. One line, no closer, and chunk-level rather than
  a body wrapper – forced rather than chosen, because `.chunk-content` sits in
  the middle track of the slide's grid and anything emitted inside the body is
  boxed by the text column and can never reach the edges. Four closed slots:
  fill (`cover`/`contain`), crop (`middle`/`top`/`bottom`), scrim
  (`veil`/`clear`/`invert`) and focus (`sharp`/`blur`). The default scrim is
  the theme's own paper at 80%, so ordinary ink stays legible over a
  photograph in all seven themes with no second palette; `invert` turns the
  slide's ink light instead.

- **`::: overlay {.classes}` lays a grounded text block over the slide.** Nine
  places, five grounds (`paper` `ink` `accent` `clear` `glass`), four widths.
  The ground is the point rather than decoration: text laid straight onto a
  photograph is unreadable at the back of a room. All overlays of one chunk go
  into one 3×3 grid layer, so two aimed at the same corner stack instead of
  overlapping.

- **`::: rows` is the card row turned ninety degrees.** A term in a card on
  the left, its body beside it, several stacked - the shape a definition
  list wants and the one a lecture reaches for when a term needs a sentence
  rather than a column. Deliberately **not** a new container: same slot
  vocabulary, same auto size, same fold, same print rules, because the only
  thing that differs is the arrangement of the item and that is one
  `display` plus a grid on the list. The list is the grid and each item
  dissolves into it, which is what gives every row one term-column width; a
  per-item grid could not.

  Four things behave differently from a card row, each for a stated reason.
  The body is wrapped in a span at render time, because CSS can place a grid
  item and an anonymous text run is not one - done on the source rather than
  on the rendered HTML, since `marked` passes inline HTML through untouched.
  `anchor` defaults to `middle` where a card defaults to `top`, because a
  one-line term set against a three-line body's first line reads as a
  mistake. `align` names how the term sits in its card and nothing else; it
  centred the body too at first, and a centred definition body is not
  something anyone wants. And the automatic size is capped at `medium`,
  because a row term is a label in a column rather than a headline across
  the slide: measured, `Separatism` overflowed a 229px term track and ran
  across the body beside it.

- **`ground: photo` makes a card's first picture its ground**, with a
  `scrim` slot - `veil`, `invert`, `plain` - answering what it is veiled
  with. Same question `::: backdrop` answers and the same reasoning: the
  veil is the theme's own paper, so ordinary ink stays legible on a
  photograph in all seven themes and in dark mode without a second palette.
  A scrim written on a row with no picture is an error, checked against the
  written tail so `{.veil}` is caught even though `veil` is the default -
  a word the drawing ignores is a silent no-op. A picture that is *not* the
  ground bleeds to the card's edges instead, which needed the `max-width:
  100%` every figure carries to be lifted: the negative margins were applied
  and the picture still did not reach the edges, 327.6px asked for and
  262.2px granted.

- **`section:` gives a column's divider slide five compositions** - `plain`,
  `tinted`, `rule`, `card`, `number` - and every one is quieter than the
  cover, because a divider that can be mistaken for the title slide has
  failed at the one job it has. The hard-coded PARAGRAPH SIGN over the
  heading is gone: it is a legal-citation mark that reads as a statute
  number to anyone outside a German law faculty, and on a projection it was
  a small grey glyph nobody could place. `section-mark:` puts a word there
  instead, and saying nothing puts nothing. `number` counts the columns that
  have a heading rather than the array index, because the anonymous opening
  column that holds the title chunk is not a part anybody is counting.

- **No word may appear in two slots of one table, and it is asserted at
  load.** `parseSlotClasses` assigns a word to whichever slot lists it first,
  so a collision makes the other slot silently unreachable; `clear` is
  already a card ground and was very nearly also the card scrim, which is
  why that value is spelled `plain` even though `::: backdrop` calls the
  same thing `clear`. Two tables may share a word; one table may not. The
  exemption is exact: a word that is the default of *every* slot holding it
  is allowed, because writing a default changes nothing whichever slot
  receives it - which is what lets `auto` be both the size and the align
  default, a collision the assertion found the moment it was written.

- **`::: cards N {.classes}` sets N equal cards in a row.** Not a second
  spelling of `::: cols N`: `cols` is one text flow the browser balances
  across N tracks, so a paragraph can spill from the foot of one column into
  the head of the next, while `cards` is N *containers* and an item is whole
  or it is nowhere.

  Seven slots - `size`, `align`, `anchor`, `detail`, `ground`, `corner`,
  `scrim` - and two of them decide themselves. `auto` size counts the words
  in the longest source item (three or fewer means large, twelve or fewer
  medium, else small) and is the block's decision rather than each card's,
  because three sizes in one row read as a mistake. `auto` align follows the
  size, except where the row carries a second level, which ranges left
  whatever its heads measure. Counts run 1 to 6: one card is a callout, and
  in a `::: side` pane it is the narrow stacked column a lecture keeps
  wanting.

  `detail: fold` is what makes one row serve two views: the nested levels are
  off the projection and present in the document, and `C` brings them back
  with no second markup. `detail: page` is the third answer, for a second
  level that is a paragraph rather than a bullet - unfolding one of those in
  place wrecks the row, so `page` never unfolds and the detail stays the
  hand-out's. What a card shows is otherwise **not** decided by bold - the
  sentence splitter walks `p` and never `li`, so a card item is never
  abridged. A leading bold run is a lead-in; a leading bold run followed by
  a hard break is a heading with air under it, which is a distinction the
  author already writes rather than one that had to be invented.

  A card row is **refused inside any directive that has already divided the
  measure** - cols, marginalia, embed, expand, margin, overlay - and the
  `cols` case is why: the row spanned the full width and defeated the column
  flow, so the author wrote `cols 2` and got one column with nothing to say
  why. `::: side` is *not* on that list, and the distinction is the one worth
  keeping: a pane is a container with a width the row can fill, while `cols`
  is a text flow the row breaks. Measured both ways rather than assumed.
  `slide` and `script` stay legal: they divide nothing, they say which half
  of the chunk is on screen.

  A card hyphenates, with a floor of eight characters: `Countermeasures`
  overflowed a 320px card by 26px once its second level widened it, and left
  to itself the browser then broke `until` into `un-` and `til`, which costs
  a reader more than the ragged edge it saved.

  The default look was reworked in the same pass: a tinted fill *and* a
  hairline is the one combination to avoid, so `panel` fills and `outline`
  strokes and neither does both; the gutter scales with the card size, the
  padding grows faster than the type, and the row keeps real air above it,
  because a card row is a block of surfaces rather than a continuation of the
  text. A centred row centres the heading over it.

- **A `style:` frontmatter block sets the type for a whole lecture.**
  `headings` (`auto` keeps the per-tag treatment, `left` overrides all of it),
  `rules` (the hairlines above principle and definition chunks), and
  `heading-scale` / `body-scale` as multipliers on the tool's own scale. The
  two scales are bounded to 0.6–1.8 rather than free: outside that range the
  collapse mode, the code-width clamp and the auto-fit camera stop agreeing
  with each other, and the result is not a look but a bug report.

- **`{!class}` takes a class off.** In an element's tail, in a `default` tail
  and in a `style` step. A step could only ever add one, and many slots express
  their base state as the absence of every member – normal prominence, a solid
  stroke, a regular size and family – so a beat could leave that state and
  never return, and an element could not opt out of a `default box {.dim}` on
  its own line either. One mark closes both, where a named neutral per slot
  would have been a word per look. It removes the exact name and not the slot:
  `!dim` does not clear `.ghost`, and a later layer may add `.dim` back. Layers
  resolve weakest first, removals before additions, so `{.c !c}` in one tail is
  refused – there is no order under which the removal is not dead – while
  `style e {!dashed}` at beat 2 and `style e {.dashed}` at beat 4 compose the
  way an author reads them. A `style` with nothing to add and nothing to remove
  is an error, because both spellings of it used to be accepted and both did
  nothing.

- **An element's name goes in front of the statement, and `{#id}` is gone.**
  On a box, dot, text, image, container, brace or a chart the name was always
  the word after the statement. The tail form existed for the two constructs
  with no name slot, and it put the name *last*, after the options, where
  neither a reader nor a language model looks for it – and on every statement
  that did not honour it the id parsed, validated and was thrown away without a
  word, so `box a "A" {#zz}` followed by a reference to `zz` reported that `zz`
  was not defined. An `edge` and a `sequence` message take an optional name in
  the slot **before** the from-endpoint: `edge wire p -> q`. It reads by
  counting rather than by lookahead, because every endpoint form is exactly one
  token, and anonymous stays exactly as short as it was.

- **Four arrow tokens, and every one of them says which ends carry a head.**
  `--` none, `->` and `<-` one, `<->` one at each end. `<->` closes a gap that
  made "a message is an edge" untrue in a `sequence`, where an unknown token
  drops a line out of the entry run and every line beneath it then reports a
  keyword nobody wrote. More importantly, `->` used to seed *nothing*: the head
  arrived as the drawn default, so `default edge {.no-head}` beat a written
  `->` while a written `--` beat `default edge {.both-heads}`, and precedence
  depended on which token you happened to type. Every token now seeds a class –
  `.no-head`, `.one-head`, `.both-heads`, one slot, three states – so no
  default can win the channel, and a head class is refused in an element's tail
  and in a `default edge` block. A `style` step is the one place to write one,
  being the one place a token cannot be re-run.

- **A leader takes the same tokens an edge does.** `text n "…" right of c gap
  0.9 -- leak` is the plain stub, which is what every leader in the corpus was;
  `-> leak` is a leader that points, which did not exist before. It used to be
  written `->` and drew no head, so one token meant *a head* on an edge and *no
  head* on a text, and the token that describes what a leader draws was refused
  there. `<-` and `<->` are refused for a stated reason: a leader names one
  operand and the words are always the other end.

- **Prominence is one channel with three names in three positions.** A class
  (`{.dim}`), a step verb (`dim a, b`), and a `bars` option taking column
  indices (`dim 0,2`) – all three off one table, so learning one teaches the
  others. It replaces `calm`, a verb that existed nowhere else in the grammar
  and had no class behind it, and it gives `.ghost` a verb it never had.
  `dim a` and `style a {.dim}` are now the same act everywhere, print included.
  Going back to the unnamed normal is `{!emph}` / `{!dim}` / `{!ghost}`, not a
  fourth word.

- **Print's prominence for an element is the prominence it carries at the
  opening beat.** *A prominence class on an element's own line is part of the
  drawing and appears in the handout; a prominence set inside a `step` is a
  lecture-time act and does not.* Everything else about print is unchanged –
  still the last beat, still not the union, still keeping tones, labels and
  visibility from the last beat. What it replaces was a provenance flag set by
  the verb and cleared by the class, so `emph a` and `style a {.emph}` were
  identical on screen and different on paper with nothing in the source to say
  so; and it was recorded per element rather than per class, so any prominence
  verb naming an element stripped a `{.dim}` the author had written on the
  element's own line, and something declared to be background came out of the
  printer as foreground. An arrowhead a step removed is no longer printed
  either: print was the last beat's line with the opening beat's head, an
  arrowhead sitting on an endpoint that was never shortened to receive it.

- **One word, one meaning, across four pairs that had two.** The placement
  option `align` is now **`flush`** – the statement keeps `align`, because that
  is what the set operation is called in every drawing tool, and `flush` is the
  word the prose already reached for when it explained the option. The centre
  word is **`middle`** on both axes, so `align x center` becomes `align x
  middle`; `center` stays as an anchor, where it names the centre of one
  element. A `plot`'s tick interval is **`tick`**, not `step`, which is the
  statement that opens a beat. And the per-unit height of a repeating thing is
  **`row`** on a `table`, **`band`** on `lanes` and **`header`** on a
  `sequence`, rather than `h`: on a box or a chart `h` is how tall the thing
  is, and reading it that way on those three was wrong by a factor of the row
  count, silently, in the direction that still draws a plausible picture. A
  `table`'s `w` is the frame now, and writing it beside `col` is refused as one
  number said twice.

- **A `gap` is comparable with any other `gap`, whichever way it points.**
  Every number in a figure is in that figure's own grid units, and there are
  two families: a number that *addresses* the grid is axis-keyed, because a
  cell has a width and a height, and a number that states a *clearance* is
  square, with one row as its ruler. `gap` was the one clearance that was not –
  multiplied by the cell's width across and its height down, so the same number
  on two adjacent lines drew two distances with nothing in the source to say
  so. Measured over the corpus, `gap 1` sideways was on median **2.9 times**
  `gap 1` downwards, which silently breaks the first rule of figure layout:
  even gaps say nothing, uneven gaps mean something. `space` on a `bars` and on
  a `table` are square for the same reason – adding `horizontal` to a `bars`
  line used to rescale its column spacing, and a table, whose whole promise is
  regularity, put 30.0px between two columns and 10.4px between two rows at one
  unit. Existing figures were migrated with the converted number written out.

- **A class is legal on a kind exactly when that kind draws something it can
  reach.** One table and one gate, replacing the two ad-hoc ones for outlines
  and for label alignment, so `.hex` on an edge, `.elbow` on a box and `.left`
  on a brace are all refused by the same rule and the refusal names the
  question the class answers: *".hex is an outline, and an edge has nothing to
  draw it with – it belongs on a box."* It reaches a `style` step too, where a
  tag expands to members that may not all be able to take the class. And **two
  classes from one slot in one attribute tail is an error**: both used to
  survive parsing and both were emitted, so which one the reader saw was
  decided by stylesheet order. The kind gate runs first and the slot check only
  on what survives it, or an edge carrying two outline classes is told "an
  element has one outline", which is false of an edge.

- **Problems are reported in causal order, never in line order.** Four phases –
  syntax, reference, semantic, layout – and the sort is by phase, stable within
  one. A syntax failure can *manufacture* a dangling reference, and the reverse
  never happens, so the cause is always in the earlier phase; a line number is
  not evidence about cause, and sorting by it puts the manufactured symptom
  first whenever the statement that caused it sits further down the block. This
  matters most in the editor, which shows one problem and nothing else. In the
  same pass, a statement that stopped reading early no longer earns a complaint
  per remaining token plus one for the placement it never reached: `rightof a`
  went from five problems to one.

- **A `step` takes one name, spelled the way an element name is.** A second
  token after it is an error naming what a step is.

- **An edge label can sit on either side of its line, and `side <word>` says
  which.** `side top` / `side bottom` beside a horizontal edge, `side left` /
  `side right` beside a vertical one, and `.turn` stands the words on end
  beside it. Two parallel edges can therefore carry a label each without the
  reader having to guess which line the lower one belongs to. Which pair
  applies depends on the direction the edge ended up running, so naming the
  pair that runs along it is a build warning rather than a parse error. It is
  a keyed option and not the four alignment classes, which on a box, a dot or
  a free text are two independent channels – the same four words would have
  meant two geometries chosen by kind, and `{.top .left}` on an edge would
  have been writable although an edge has one side to pick. A brace's side is
  `side <word>` too, for the one concept the two share.

- **`::: draw` draws five more outlines.** `.hex`, `.diamond`, `.chevron`,
  `.wedge` and `.cross` join `.round` and `.sharp` in one slot – a protocol
  message that is an arrow, an IDS sensor that is a hexagon, a size comparison
  that is a triangle, a scatter marker, and the diamond a room has been trained
  since school to read as the question a flowchart asks. `point up|down|left|right` aims the two
  that have a point, so eight orientations cost one option rather than eight
  class names. They cost nothing downstream: a shape is the same four numbers
  a rectangle carries, joined into a different path, so the extents, the
  viewBox and the tween are untouched. An outline class on any other kind, or
  inside a `style` step, is an error rather than a silent no-op.

  The diamond is the one that eats **both** axes, and in proportion to its
  label rather than to the other axis: the widest room a diamond offers is a
  strip half its width by half its height through its centre, so a label that
  fits a rectangle needs a diamond twice as wide and twice as tall. Keep a
  diamond's label to two or three words, or the decision arrives at four times
  the area of the boxes it sits between and takes the figure over.

- **`.turn` reads a label bottom-to-top.** For a tall narrow element that has
  room for a word only along its long side: a firewall bar, a confusion-matrix
  row, an axis title.

- **`bars`, `grid` and `plot`.** A column chart, a rectangular field of
  markers, and a cartesian frame with gridlines, ticks and axis titles. All
  three expand into ordinary elements, so a `brace` spans three columns of a
  chart and a `style` step tints one cell of a grid with no new vocabulary,
  and a step naming the statement reaches everything it produced. Inside a
  `plot`, `roc@0.35` names a value in the plot's own units. The spacing
  inside one of these statements is `space`; `gap` keeps the one meaning it
  has everywhere else, the distance between two elements.

- **`.smooth` draws an edge as a curve through its waypoints**, for the
  figures where a line is a measurement rather than a connection.

- **A bar chart can run sideways, and a chart can say what shape it is.**
  `horizontal` on a `bars` line turns the columns into bars: lengths from a
  shared left edge, categories stacked downwards, the tick strip a right-aligned
  column down the left margin and the baseline standing on the left. It is not a
  variant of the same picture - a reader ranks lengths more reliably than
  heights, and a category called "DNS cache poisoning" cannot be written under
  an upright column at all. Which is why a tick string containing `|` is now
  split on that rather than on spaces, so a row label may be a phrase; the same
  mark already separates a `table` row and a `lanes` name.

  `aspect W:H` on a `bars` or a `plot` states the proportion the reader sees.
  It exists because `w` and `h` are counts of *grid cells* and a grid cell is
  not square: at `unit=150x52` a plot written `w 1.9 h 1.5` arrives 285 pixels
  by 78, and nothing on the line hints at it. Write `aspect 4:3`, `aspect 1:1`,
  or one bare number meaning that many wide to one tall, and the build works
  the other dimension out. Giving `w`, `h` and `aspect` together is an error.

- **`same as <chart>` sizes a `plot` or a `bars` from another one**, for the
  row of comparable frames a shared baseline needs. It is answered while the
  line is read rather than during layout, because a chart's gridlines, ticks
  and columns are placed from its own dimensions at parse time - so the chart
  being copied has to be written above the one copying it, and the build says
  which of declared-below, not-a-chart or not-there went wrong.

- **An edge can be placed against, like anything else.** `text n "…" above w1
  gap 0.2`, `at w1.cx,w1.cy` - the box a coordinate reads is the bounding box
  of the route. A coordinate could name a box, a dot, a text or an image and
  never an edge, not by design but because edges were routed after the walk
  that places everything else; the omission bit in the wrong direction, because
  a phrase describing a wire then had to be pinned to one of the boxes at
  either end and drifted off its line on the next edit. Raising two boxes from
  `h 3.0` to `h 4.2` moves a box-anchored label from 13.5px off its wire to
  22.3px; a wire-anchored one stays where it was put. `dgEdgeRoute()` is now the
  one text that works out a route, called by the layout and by the emitter, so
  the two cannot disagree.

- **`table` and `lanes`.** A grid of labelled cells, and a set of equal bands
  with their names turned down the side. Both expand at parse time into
  ordinary boxes and texts, exactly as `bars`, `grid` and `plot` do, so a
  `brace` spans two rows of a table and a `style` step tints one cell with no
  new vocabulary anywhere downstream. They exist because the hand-built
  versions are the ones that cannot be maintained: six rows of three cost
  twenty-one declarations and a chain of `below` references to re-aim whenever
  a row is inserted. A table's heading is one string split on `|` and its body
  is the run of bare quoted strings beneath it; every cell carries two
  generated tags, `@t-row-2` and `@t-col-0`, so lighting a row per beat is one
  line of source. `lanes` is deliberately **not** a container: a container fits
  its members, so bands holding different numbers of things come out ragged at
  both ends, which is the opposite of what a swimlane means.

- **A `bars` chart can carry more than one run of columns.**
  `bars g "…" series of f` joins the first chart's frame rather than drawing
  its own – plain, it stands beside the runs before it and the cell is shared
  out, so a grouped chart takes exactly the paper a single one did; `stacked`,
  it sits on the run before it and the scale becomes the tallest stack. It is
  its own statement rather than a second values string so that each series has
  its own attribute tail: a series is a thing with a colour and a name, and one
  tail per series is how it gets one. A series refuses `w`, `h`, `space`, a
  placement and a tick strip by name, because all five belong to the chart it
  joined. `emph 1,3`, `dim 4` and `ghost 0` on any `bars` line take column
  indices and mean on the line what they already mean in a step and as a
  class, so a chart can *arrive* with one column singled out instead of only
  from beat 1 onwards.

- **`.elbow` routes an edge with one turn out and one turn in.** A rail halfway
  across the gap, on whichever axis the two ends are further apart, with both
  anchors forced onto that axis – the two waypoints every tree edge used to be
  written with by hand, said in one word. The rail is measured between the two
  *faces* rather than the two centres, which is what makes several connectors
  out of one parent share a rail and read as a single bracket. Bounded: it
  looks at nothing else in the figure, nothing steps around an obstacle, and
  there is no option to move the rail; `.elbow` together with
  `via` is an error rather than a preference the build guesses at.

- **`sequence` draws a protocol down the page.** A row of actor heads, a
  lifeline under each, numbered messages between them and notes on a lifeline,
  written as three shapes of line: `actor u "User"`, `note b "…"`, and
  `u -> br "label" ["second line"]`. It expands at parse time into the boxes,
  texts and edges the language already had, so a `brace` spans three messages
  and a `step` reaches one by name with no new vocabulary anywhere.

  The statement owns exactly one thing – the vertical rhythm. Written out by
  hand every message carries a y coordinate of its own, so inserting one in the
  middle means moving everything under it, renumbering, and re-guessing how far
  the lifelines run: measured at thirteen edits against one line. Every entry
  states the height it needs and the statement stacks the bands, so a note
  pushes what follows it down. `space n` on a `note` or a message line sets that
  one band's own gap, which is how a dense protocol is broken into phases.

  Everything it draws has a name – `wa-3` for a message, `au-life` for a
  lifeline, `wa-note-0`, plus the tags `@wa-msgs`, `@au-msgs`, `@wa-msg-3` – so
  an annotation the construct knows nothing about is an ordinary line of source.
  There is no `alt` / `else`: a `container` with a caption already encloses and
  names a group of messages, and a word freezes at the next release.

  Message labels carry a paper ground by default, and sit beside the line
  rather than on it, because a lifeline crosses every one of them and an edge
  reads a fill with no side named as "knock the line out behind the words".
  `.clear` takes the ground off, a written `.tone-n` replaces it. The numbers
  are drawn unless the line says `unnumbered`, because the visible number and
  the generated tag carry the same index: `@wa-msg-3` is the arrow the room
  reads as 4.

  `lanes` and `sequence` are the two statements authors pick the wrong one of,
  and they are one pair with the axes swapped: `lanes` puts who down the side
  and lets the reading direction carry the time, `sequence` puts who across the
  top and makes the vertical axis the time itself.

  The editor reaches all of it. A `sequence` is the one expanding statement
  whose entries are lines the author typed, so `actor`, `note` and message
  lines are selectable and their labels, classes and tails editable in the
  panel, which reads its controls off the entry statement rather than off the
  box and the edge the entry expands into. A lifeline, a message number and a
  message's second line own no text of their own and stay with the statement;
  the frame no longer swallows a click aimed at a message crossing it; and
  `unnumbered` is a checkbox.

- **An edge's label can carry a ground.** A fill class on an `edge` draws a
  rect behind the label on the same terms a free `text`'s ground is drawn, and
  `pad` and `side` are now legal `edge` options. With no side named the label
  sits **on** the line and knocks it out behind the words, which is what a
  sequence number or a port wants; with a `side` it clears the line and
  carries the ground with it. Before this, `.paper` on an edge resolved,
  emitted its class and drew nothing.

- **`figure-design.md`** – how to lay a figure out so a room reads it: ten
  rules with a wrong/right pair each, the tone-to-role table, the five
  arrangements a lecture keeps asking for (flowchart, swimlane, tree, table,
  protocol) with the construction fact each one turns on, the four-beat step
  order, and a checklist to work down before a figure is finished.

- **`::: draw` – animated infographics written in the lecture source.**
  A line-oriented DSL for boxes, dots, free text, arrows, auto-fitting
  containers, groups and braces, compiled to inline SVG at build time and
  themed through the page's own custom properties, so a diagram re-inks
  with the `A` cycle. `step` blocks show, hide, move, emphasise, restyle
  and relabel elements; **layout is re-evaluated per step rather than
  transformed**, so an arrow between two boxes re-routes when either one
  moves. Steps become beats on the existing reveal counter, so `Space`
  advances them, the speaker window follows, the freeze gate applies, and a
  revisited chunk comes back fully stepped, all without new state. Free
  `text` can grow a leader line to whatever it comments on (`-- ref` plain,
  `-> ref` pointing), which is what makes placement free without losing the
  connection. Print shows the last beat, carrying each element's prominence
  from the opening beat. There is **no automatic layout and
  no constraint solver**: placement
  is a grid cell or a relation to a neighbour, resolved as a DAG, so a
  mistake names its line instead of shifting the picture. `lint.js`
  mirrors the vocabulary and reports unknown statements, unknown classes,
  duplicate names and dangling references.

  `align x|y <edge> a,b,c` lines up one coordinate (Figma's edge words,
  with the axis stated: left/middle/right on x, top/middle/bottom on y) and `spread x|y a,…,z`
  gives equal spacing between centres. Both are an extra dependency plus a
  coordinate override in the same topological walk – no solver, no second
  pass – and both name the line on a circular authoring instead of drawing
  a plausible wrong answer. They close the commonest alignment failure:
  two columns built as separate `below` chains drift apart as soon as
  their captions differ in height. The build now also warns when an edge
  runs within a few degrees of an axis without being on it, which is what
  that drift looks like once a line is drawn across it.

  Tags (`@tag` in the attribute tail) replace the `group` statement.
  Membership sits on the element's own line, so adding an element to a set
  is a local edit and one element can belong to several sets. An edge
  endpoint may be a bare coordinate (`edge -0.8,0 -> a`) for an arrow
  arriving from outside the picture.

  `default <kind> {classes} [w n] [h n]` sets the base styling and size
  for every element of that kind – two lines replaced twelve repetitions
  in the identity-lifecycle example. It is position-independent with one
  per kind (DOT's position-dependent model makes the source
  order-sensitive invisibly), and an element's own class **displaces** a
  default in the same slot rather than stacking with it. `same as
  <element>` copies another element's width and height.

  The same statements can be written **once for the whole lecture** in a
  `draw-defaults` frontmatter key, so a series of figures looks like
  itself without repeating four lines in every block – and changing the
  look is one edit instead of twelve. Four layers now, most specific last:
  the lecture's kind default, the lecture's tag default, the block's kind
  default, the block's tag default, then the element's own attributes.
  Scope before selector, because "closer to the element wins" is the model
  everywhere else here. Anything but a `default` statement in the key is
  an error naming the line even when no diagram uses it, and a
  lecture-level `default <kind> @tag` has to be used somewhere in the
  lecture – one scope wider than a block's, since it is written once for
  twelve figures most of which will not carry the tag.

  `image <name> <asset>` puts a picture in a diagram, resolved like the
  `![](fig-id)` shorthand. A vector asset is spliced as a nested `<svg>`
  and follows the `A` theme cycle; a raster is a `data:` URI and keeps
  its own colours. `between A,B [frac n]` positions an element on the line
  joining two others, and any placement takes a trailing `offset dx,dy`. An
  anchor takes a fraction (`mix.right:0.3`) that slides the attachment point
  along that edge, which is what stops two arrows between the same pair
  of boxes from collapsing into a lens; there is no automatic fan-out,
  because it would silently redraw existing diagrams.

  Four more classes close the gaps the vocabulary could not spell.
  `.clear` is a see-through interior – `.bare` removes the *stroke*, so a
  frame you can read through had no spelling at all. `.serif` is the
  upright serif; `.hand` is the same family forced italic and accented,
  and until now the family was reachable only through that annotation
  voice. `.fit` and `.shrink` size the type to the box instead of the box
  to the type, clamped to 0.6–1.5× so a long label cannot become
  unreadable and a short one cannot become a poster; both need the box to
  be given (`w n` or `same as X`), and an element with neither is an error
  rather than a line that does nothing. A free `text` now draws a ground
  when it carries a tone, which is the same drawable a box uses read the
  other way round, and `pad` works on a box and a text as well as on a
  container and a brace – one word, one sentence, four statements. Every
  class now belongs to a slot: `.thick`/`.bare` and `.mono`/`.serif`/`.hand`
  used to stack with a `default` instead of displacing it. `.tone-4` with
  `.accent` is accent ink on an accent fill; the inversion wins and the build
  warns where the pair is live in every beat.

  Inside a label, `_sub` / `^sup` shift a run and `*accent*` / `~muted~`
  colour one. Free `text` honours `.left` / `.right`, and its anchor
  moves with them. A diagram is click-to-zoom like any other figure, and
  keeps stepping while focused. How large it lands is the chunk's width
  class; `unit` sets only the proportions inside the picture.

  Fixed before it ever shipped, from a review of the branch: a `label`
  step never switched variants live (the runtime looked labels up by the
  element id rather than the geometry key), a `.ghost` element could
  never be hidden (author CSS beat the presentation attribute the runtime
  set), hide-then-show started an element invisible, an unclosed
  `::: draw` silently swallowed the rest of the file, `align` and
  `spread` accepted containers and edges and did nothing with them, a
  `move` on a brace was a no-op, `--optimize-images` and the linter's
  oversized-asset gate could not see diagram assets that the build now
  hard-fails on, WebP and GIF images were laid out square, a diagram
  inside a collapsed expansion contributed reveal beats that changed
  nothing on the projection, a container's caption hung outside its own
  border, a long label could draw outside the viewBox, `label @tag` was a
  silent no-op, and one mistake was reported once per step.

  A coordinate may be another element's coordinate with an optional signed
  nudge – `via iv.cx,x0.cy`, `edge a.left-0.8,a.cy -> a`. Rebuilding the
  example slides had needed a browser open and three numbers read off the
  screen; all three are now relations that survive a change above them
  (verified: moving a row down by 48px moves the waypoint corner by
  exactly 48px and the leg stays vertical). The nudge's shape is a promise
  to the future editor: one signed term, no other operators, so a drag
  rewrites one token instead of replacing the reference with an absolute.

  `default <kind> @tag` refines a kind default for the elements carrying a
  tag, resolving in three layers – kind, then tag, then the element's own
  attributes.

  Rebuilding all six example slides from scratch found three more: a
  placement's `offset` was applied after `align` overrode the result, so
  an element that used both got the offset twice; a brace label was
  anchored middle and lay half across the elements it spans; and the
  `::: side` composition of a code fence beside a diagram works, which is
  what carries the buffer-overflow slide.

  A second review pass, with every doc snippet compiled and every example
  slide re-shot, tightened the grammar where it had grown two ways of
  saying one thing. `brace` measures its distance to its members with
  `pad`, the word `container` already used – `gap` everywhere else in the
  grammar is the distance between two *elements*. One coordinate grammar
  now sits behind `at X,Y`, `move … to X,Y`, waypoints and endpoints
  alike, so `box m at c1.cx,m0.cy` places a box in a column without
  measuring it, and a reference there is a real dependency the cycle
  detector sees. `via` is no longer optional in front of a waypoint, and
  one `via` carries every one of them. `default <kind>` accepts exactly
  the options that kind's own statement accepts, so `default box r 5` is
  an error naming the kind it belongs to instead of a line that parses and
  does nothing, and `default container pad` / `default brace pad …
  side <word>` now reach the elements they are about. An element name is
  restricted to letters, digits, `_` and `-`, because a name with a dot in
  it is indistinguishable from a coordinate.

  Visibility became one rule with three faces: an edge is only as visible
  as its endpoints, a `container` or `brace` only as visible as its
  members (and it fits the ones on screen), and a `text` with a leader
  only as visible as what it points at. Print became **the last beat**
  rather than the union of every beat – reprinting a `hide`n element laid
  a withdrawn arrow across whatever replaced it – and the emitted SVG now
  carries the tight print viewBox statically, with the runtime widening it
  to hold every beat on boot, so a stepped handout no longer prints a band
  of empty paper the height of wherever something started out. A class
  added by `style` displaces the one in its slot, the same rule `default`
  follows. `move @tag to …` is refused, naming `move @tag by dx,dy`: `to`
  would stack the whole set on one point.

  **Placing a picture from inside the editor.** The image tool took the
  first asset the lecture happened to reference, with no chooser, and
  refused outright when there was none, so a figure could not get its
  first picture from the editor at all. It now opens a picker over three
  sources: the assets this lecture already inlines, everything in
  `assets/` (asked from the watch server, so it costs no payload), and a
  file from the machine. Under `--watch` the whole loop closes: the bytes
  go over the socket that already carries patches, the server writes
  `assets/<name>` with five refusals rather than five sanitisations, and
  *then* the `image` line is placed – that order matters, because
  `fs.watch` is on `source.md` and the patch is what kicks the build.
  Without a watch server it writes an explicit `assets/<file>` path, which
  the grammar already accepts, and says where to copy the file. Never a
  `data:` URI in `source.md`. The primitive is a plain file input, not the
  File System Access API: for *reading* a picked file that has always been
  enough, in every browser and from `file://`.

  `.paper` joined the class vocabulary while that picker was being built. The fill
  swatch row opened with the *empty* class labelled "paper", so it meant
  "whatever a default says" – a box under `default box {.tone-3}` had no
  way back to the canvas colour, and a free `text` could not have a ground
  at all – a ground is what knocks out a line running behind it.

  `lint.js` was stricter than the build, which for the pre-commit gate is
  worse than not linting: its `between` scan did not terminate on `pad`,
  `gap`, `flush` or `same`, so a placement with any of them read their
  values as members.

  Development state: this is unreleased work on a branch, and the
  vocabulary is **experimental** – it may still change before it is
  frozen under the source-format contract, so it should carry that label
  in the notes of whichever release first includes it.

  See `PRD.md` §4.6a for the grammar and `lectures/diagrams/source.md` for
  a worked example of every construct.

- **A graphical editor for `::: draw`.** Click a diagram to focus it, then
  the button in the corner or `E`. It parses the block, records where every
  token sits, answers a drag by rewriting the smallest span it can, and
  re-runs the same compiler the build runs – so there is no second
  representation to drift, no export step that flattens relations into
  numbers, and no file the editor owns. Everything it produces is a block a
  human could have typed.

  The canvas is a **frame**, not a canvas size: the chunk's own width class
  on a slide, one pane of a `::: side` at that class, or the print measure
  where the height cap does not apply. Switching between them changes nothing
  in the source. It says out loud two things that are otherwise invisible
  until you look at the built page – the measure the figure lands in, and how
  much of it stays empty when the 62vh cap binds first.

  Because a figure here is held together by *relations* rather than
  coordinates, and that structure is completely invisible in the picture, the
  editor draws it: the `gap` between two facing edges with its number, the
  alignment edge as a hairline through both elements, `between` as the line
  joining its references, a ref coordinate as the line it refers to, an
  `align` set's shared axis through every member, a `spread` set's equal
  distances as matched marks, `same as` as a width bracket. A drag then
  rewrites exactly one token – the `gap`, the `frac`, the signed nudge – and
  a coordinate that belongs to an `align` or `spread` set is refused **by
  name**: *"y comes from align y middle on line 40. Drag iv to move the row,
  or drop c1 from that line."* The status bar always shows the line it is
  about to write.

  Where an edit goes, in four tiers: the `--watch` socket, now two-way, which
  patches the block straight back into `source.md`; the clipboard; File
  System Access where the browser has it; and `localStorage` for a reader
  whose `audience.html` is a build artefact, with a visible way back. An edit
  syncs to the other window as its own message, gated by the freeze flag – so
  freeze, fix the figure, unfreeze, and the room gets the finished picture.

  **A relation can be re-pointed, not only stretched.** Four chips appear
  around whatever the pointer is over while dragging, and releasing on one
  docks the element to that side of that element – the placement is rewritten,
  so it follows its new reference from then on. Dragging an element through
  the thing it is measured from changes the side without leaving it. The
  placement pane reads the relation back as the three things it says – kind,
  reference, distance – and lets each be changed, including `between a,b`,
  which no drag can express. The align and distribute acts are named the way
  they would be looked for rather than the way the statement spells them.

  **A label can sit somewhere other than the middle of its box.** `.left` /
  `.right` place a horizontal run of text and `.top` / `.bottom` the block of
  lines, measured against the element's own padding – as far that way as the
  box allows, not on its border. A tall element with a short label is the case
  they exist for. With more than one line the block moves rather than the
  line, so `bottom` puts the *last* line on the inner edge. `.left` / `.right`
  previously worked on a free `text` only.

  Written where it cannot act, one of those words is now an error rather than
  a class that resolves and moves nothing. A container's caption is placed on
  its own top border, a brace's label beside the spine and an edge's at the
  middle of the route, so none of the four applies to any of the three – an
  edge says which side of its line the label sits on with `side <word>`
  instead.

  **An `align` or `spread` set can be left by dragging.** Pulling a follower
  against its shared axis holds it there, draws the axis, and says how much
  further to pull; half a cell past it, or with Alt held, the element is
  dropped from the statement and the drag goes through. It used to be a flat
  refusal telling the author to go and edit that line by hand, and the only
  way out of a set was the text.

  **Waypoints are draggable.** A hollow dot at the middle of every segment
  adds one, a square moves one, and a double-click or the chip in the panel
  takes one out. Where a waypoint holds a reference – `via iv.cx,d0.bottom+0.28`,
  which is how a routed arrow stays attached to the boxes it runs past – the
  drag rewrites the **signed nudge** on each component and never the
  reference. Each axis is decided separately, because half reference and half
  number is the normal case in a routed figure.

  An **arrow is a first-class object** in it: an edge
  has no box, because it is not placed – it is drawn between two things that
  were. Clicking one hits the line itself, a box wins over an arrow crossing
  it and an arrow wins over the container it runs through, and the selection
  traces the line rather than boxing it. Dragging either end retargets it,
  and answers with a **name** wherever it can – the arrow keeps following the
  box it now points at, instead of being frozen to the coordinates the drag
  happened to end on. Labels are multi-line, on edges as well as boxes.

  Off with `editor: none` in the frontmatter; `editor: speaker` keeps it out
  of the projection. A lecture with no diagram pays nothing.

- **Navigation follows one forward key and one backward key.** `Space`, `↓`,
  `Enter` and `PageDown` advance the reveal or diagram step on the slide and,
  when there is none left, move to the next chunk – across column boundaries,
  so a whole lecture is one key. `↑`, `PageUp` and `Backspace` are the exact
  mirror: **they take a reveal back**, and only leave the chunk once it is at
  its opening state. `→` / `←` are that same pair *except on the first chunk
  of a column*, where they change column – the only chunk where a second
  dimension exists to move in.

  Reveal used to be forward-only, on the reasoning that a revisited slide
  should simply show everything. That is still what happens when you arrive
  at a chunk from somewhere else, but it is the wrong answer while you are
  standing on the slide: a figure that assembles itself is often worth
  assembling twice, and there was no way to run it again without leaving and
  coming back. The mechanism was always symmetric; only the keys were not.

  Presenter remotes work now – `PageUp`/`PageDown` were unbound, so a
  clicker's back button did nothing at all.

  Two marks at the edge of the viewport say which situation the current slide
  is in: `‹ ›` where sideways changes column, `⌄` where forward will leave the
  column next. Quiet enough for a projection, absent on the overview board and
  behind a blanked screen.

  `Enter` used to open the first expansion; it is a forward key now, and
  `1`–`9` (or clicking the chevron) still opens expansions.

- **Figures sit square in their own frame.** A diagram's `viewBox` is built
  from what the compiler reserves for each drawable, and two things made it
  much larger than the drawing: a label reserved a full label-width on *each*
  side of its origin, and container captions, brace labels and edge labels
  never recorded a width at all, falling back to a hardcoded 120 whatever
  their text said. A figure whose outermost element was a caption therefore
  sat off to one side of an oversized box with an unexplained empty margin
  beside it – up to 122px on a figure 480px wide. Eight of the twelve figures
  in `lectures/diagrams` now land exactly on the margin on both sides; what is
  left is the generosity of the text-width estimate, which is about
  11% on the bundled faces and never clips.

### Removed

- **The `editorial` cover is gone, and so is `rule`.** `editorial` drew a 4px
  accent rail down the left edge of the type. A coloured bar welded to the
  side of a text block carries no information and is present only so that the
  theme colour appears somewhere on the slide; that is one of the most
  reliable tells of a machine-made layout, it is named as one in Anthropic's
  own design guidance, and it was the specific thing the lecturer objected to.
  Nothing replaced it one for one – its single good idea, the meta set as a
  row of credits instead of four stacked lines of equal weight, is what
  `masthead` runs along the bottom of the slide. `rule` went for a smaller
  reason: it was `stack` plus two hairlines, and a lecturer is not choosing
  between "centred" and "centred with lines". Both names now fail the build
  with the list of what to write instead. `::: draw` and the covers are
  unreleased, so this is not a source-format break.

### Fixed

- **A slide whose content fitted the frame could still be positioned outside
  it.** `focusCamera` measured the chunk *box* to decide whether to centre a
  chunk or walk it, and the box carries the breathing space above the heading -
  about 78 px, and a deliberate part of the design. So a chunk whose content
  was 793 px in an 800 px frame had a box of 871 px, failed the fit test, had
  its head pinned near the top and hung off the bottom of a frame it fitted
  inside comfortably. The room read a slide with a sentence missing. The fit
  test and the centring now use the same `.chunk-content` box that
  `--check-fit` has been measuring all along - the two were judging different
  boxes, and only one of them was the box a reader sees. A chunk whose
  *content* overflows is still walked, unchanged. `test/camera-fit.mjs` is new
  and holds the invariant: a chunk that fits the frame is inside it. With the
  fix, `lectures/tutorial` exits 0 at 1280x800 for the first time.

- **The OFL notice in an output now names the faces that output actually
  carries.** It was a literal reading "Literata, IBM Plex Sans and JetBrains
  Mono" whatever the lecture's roster was, so a deck on `sans: Inter Tight`
  already shipped a licence notice naming a font it did not embed and omitting
  one it did. Derived from the embedded set now.

- **A roster family that also sits in its own fallback stack is no longer named
  twice.** `fonts: {serif: Source Serif 4}` emitted
  `'Source Serif 4', 'Literata', 'Source Serif 4', Georgia, serif` – harmless
  to a browser, untrue about the file. It is the first roster family to collide
  with its own tail, which is why nothing had caught it.

- **A `::: marginalia` shrank the slide it belonged to.** The aside is
  absolutely positioned out past the text column, so its overhang lands in the
  chunk's `scrollWidth` like anything else that overflows – and the probe that
  decides whether a slide is being cut off sideways read that as a slide being
  cut off. It is the one thing on a chunk that overflows on purpose, and the
  fit answered by walking the type down until it stopped, which on the
  tutorial's own `#marginalia-demo` meant the 0.6 floor: the words the room was
  there to read came out at less than half the size of the slide before it,
  because of an aside the camera was not framing anyway. Then the click made it
  worse – it centred the aside in the viewport by writing into the drag-pan
  offset, which pushed the sentence the aside belongs to off the left edge, so
  the room was left reading a tangent with nothing to hang it on.

  A marginalia chunk is now framed exactly as a chunk without one: same camera,
  same centre line, same type size. The aside runs off the right edge of the
  frame and is simply cut off there, which is the whole affordance – nothing
  was added to point at it. Clicking it slides the frame right by the minimum
  that puts all of it on screen, with the same 2vw of air on its right that the
  stylesheet already gives it on its left, so the slide keeps as much of itself
  as the overhang allows. `Esc`, a click on the slide, or a second click on the
  aside gives the frame back; leaving the slide clears it.

  What it cost. The pan stopped being a number and became a state: `asidePan`
  holds which aside is in, and `focusCamera` derives the offset from where that
  aside is *now*, the way it already does for the annotation input. Written
  into the drag-pan it was a stale pixel count that survived a resize, could
  not be told apart from a hand drag by anything that reads it, and had to be
  recomputed by hand every time the layout moved. It travels between the two
  windows as its own message type rather than in the state snapshot – the
  snapshot is a full apply and would drag the receiver's slide position with it
  – and because each window solves for its own frame, the cockpit's smaller
  stage lands the aside correctly instead of adopting the projection's pixels.
  The width probe now allows for the aside's reach on the chunk's own box; the
  elements that can overflow without reflowing are still checked one by one
  beside it, which is what that list was always for. `test/marginalia.mjs`
  holds the properties, against another chunk of the same deck rather than
  against a number. Print is untouched: a marginalia still prints as an
  indented aside, and `print.html` is byte-identical.

- **An annotation whose leader pointed at an arrow was drawn before the arrow
  was.** "Anything hanging off something invisible is invisible too" held for
  an edge's endpoints and a holder's members, and for a `text` whose leader
  named a *node* – but not for one whose leader named an **edge**. The three
  faces of that rule each read the visibility the `step` blocks had written and
  never the visibility the rule itself had just derived, so a leader aimed at
  an edge saw that edge's untouched "visible" while the edge was already dark
  for want of one of its endpoints, and the words plus their stub arrived a
  beat early, pointing into empty paper. The tutorial's own `#diagram-beats`
  slide, which states the rule, is where it showed. The three faces now resolve
  together as one fixed point before anything is drawn, so the rule chains as
  far as it needs to (and a holder whose members are all *derived*-hidden goes
  with them, which it also used not to do); a written `show` or `hide` still
  overrides it, placement still implies nothing, and a leader cycle terminates
  rather than spinning.

- **Holding `Alt` could not select a line of code.** The live views turn the
  stage selectable while the key is down, but a drag across a `<pre>` still
  ends in a `click` on it, and only the camera's pointerdown stood aside – so
  the drag opened the focus card over the listing, and inside the card the
  same drag closed it. The whole click path now asks one predicate, decided at
  pointerdown so that letting go of the key before the mouse still finishes
  the selection you started; the focus card is selectable at all, which as a
  sibling of the stage it never was; and a plain click still zooms, navigates
  and closes exactly as before.

- **The run-in lead-in a card row documents did not exist, the dash in front of
  a nested item sat above its line, and an accent row's explanation was painted
  in the page colour on the page.** Three defects inside a card, one
  stylesheet neighbourhood.

  The tutorial has said since it was written that `- **A lead-in** its text`
  runs the bold into the sentence and `- **A heading**\` puts it on its own
  line, and both drew the second way. One rule forced every leading bold to
  `display: block`, and under it the card was a flex column – a flex container
  blockifies every child, so the bold was a flex item and the sentence after it
  an anonymous one, and no stylesheet rule could have brought the run-in back.
  The card is a block box now, anchored with `align-content` rather than
  `justify-content`, and *which* of the two forms an item is written in is
  answered in the renderer, by `markCardLeads`, which can see the hard break in
  the source and marks the run `.card-lead`. Keying it on `:has(+ br)` instead
  was only a second guess: a `<br>` is what the author typed, not what the
  author meant, so a bold followed by a bare text node lost its air while the
  same bold followed by a break kept it. A class also reaches the card that
  bleeds a picture, where the bold is the *second* element and a `:first-child`
  rule reached none of it – that case used to cost the block two extra
  selectors and now costs it none.

  Two things follow from the card no longer being a flex container, and both
  are the same defect as the first. An inline element that is a direct child of
  a card – a code span in a slot vocabulary, say – was blockified onto a line
  of its own, so `` `center` and the eight compass points `` broke after the
  code; it flows now. And the second level inside a card was a flex item, hence
  a formatting context, so its first and last item's margins stayed inside it;
  it is declared `display: flow-root` so that containment survives, which it
  did not for the ten minutes it was free.

  The dash in front of a nested item was placed at `top: 0.62em`, a guess at
  half a line, and the nested level is set at `0.88em` with its own leading, so
  the mark rode above the words beside it. It is `0.5lh` now, half of whatever
  line-height actually applies, so it stays put when the size, the leading or
  the face changes.

  And the accent ground reverses the ink by declaring it on the item, which in
  a `::: rows` block is `display: contents` and spans both columns while only
  the term carries the fill. The explanation beside the term came out
  `oklch(0.98 0 0)` on an `oklch(0.98 0 0)` page – laid out correctly, 810×87,
  and impossible to see, in all seven themes. The reversal now lands on
  whatever the fill is painted on; the fill itself still rides on the item,
  where the term inherits it.

  `test/cards.mjs` measures all three in a browser, `test/settings.mjs` the
  markup contract the renderer now carries. Two decoration slides state their
  option columns with hard breaks instead of relying on the blockification that
  used to produce them.

- **Clicking a display formula could hide a third of it.** The overlay
  enlarges a focused formula by setting type – 0.12 of the slide height, 108px
  at 1440×900, about three times what it had on the slide – and the card it
  sits on then caps at 98vh with `overflow-y: hidden`. Type does not know how
  tall the screen is, so for a formula with rows the two rules pull against
  each other and the card wins: eight rows of an `aligned` block measured
  435px on the slide, fully visible, and 1285px inside an 882px card once
  focused. The gesture whose whole purpose is to show the thing better made a
  third of it invisible, and neither the drag-pan nor `+`/`-` could recover it,
  because both are transforms on a box that carries its own clip.

  Scrolling is not the way out, however natural it looks beside the code
  block's `overflow: auto`: the overlay's wheel handler preventDefaults and
  zooms, and a drag pans, so a scrollbar inside the card is reachable only by
  dragging the bar and on a touchscreen not at all. The enlargement now stops
  where the screen does. KaTeX scales linearly with its font size, so the
  correction is one ratio rather than a search – 72.8px instead of 108px at
  1440×900, still twice what the slide had. A formula that already fits keeps
  the full enlargement untouched. Each window fits for itself and nothing is
  broadcast, because the projection and the cockpit's scaled stage are
  different sizes; the shared `figure-view` message still carries the
  lecturer's own zoom and pan on top.

- **The overview board could still jump the selection to the end of the
  deck.** `nextCol`/`prevCol` were changed to stand still at the ends, and
  `selectOverviewCol` – which its own comment says mirrors them – went on
  falling through to the last or first chunk of the whole lecture. So the
  behaviour that change removed was still reachable through the board, where
  the next `Enter` commits it: open the overview in the last column, press `→`,
  press `Enter`, and you are on the final slide. It stands still now, and
  `test/nav.mjs` asserts both edges beside the assertions for the keys.

- **The cockpit's touch rail sat on top of the lecturer's notes.** The rail
  clears the furniture below the stage by summing the numbers the grid rows
  are written in, and it summed two of the three. The one it missed is the
  notes pane, whose row is `auto` and therefore has no number to read:
  measured at three iPad sizes with `Shift-N` open, the opaque pill covered
  81–82% of the pane, dead centre. On a tablet at the lectern – the case the
  rail was added for – the notes were behind the buttons. It now stops
  counting and joins the grid, in the stage's own row and pinned to the bottom
  of it, so nothing below the stage can be covered by something that lives
  above it whatever is added there later. Both cockpit layouts put the stage
  in row 2 / column 1, so one rule serves them and the `Shift-V` special case
  goes with the arithmetic that needed it – and the rail now stays inside the
  stage column there instead of running under the thumbnail strip. The stage
  keeps every pixel it had. `test/touch-rail.mjs` asserts the property rather
  than the sum, in both orientations, both strip positions and with the
  palette open and closed; the old rule fails all eight.

- **The gate for build.js's template literals did not look at five of
  them.** `literalRegions` opened a region only on a line where the backtick
  was the last character, which is the shape of the seven big CSS and JS
  literals and not of the five holding inlined markup – `TOUCH_CONTROLS_HTML`,
  `OVERVIEW_BADGE_HTML`, `BLANK_BADGE_HTML`, `LINK_OVERLAY_HTML` and
  `SEARCH_PANEL_HTML` all open with a tag on the same line. A raw backtick in
  any of them ends the literal exactly as it does in the others, and markup is
  if anything the likelier place to write one, because a comment beside a
  button is where a person names an attribute. The gate reported seven
  literals and passed. It now reports twelve, keeps the content of the opening
  and closing lines rather than skipping it, and handles a literal that opens
  and closes on one line. Counter-checked with a backtick planted in each of
  the newly covered shapes, including on an opening line, plus a
  single-backslash regex escape inside inlined markup.

- **An open expansion threw away the slide it belonged to, and on a narrow
  window threw away the deck.** The stylesheet builds an expanded chunk as one
  composition – the slide's own column on the left, the pane on the right –
  and `focusCamera` then centred the *pane*, which is half of it. The words
  the pane expands slid off the left edge; measured on the tutorial at 1440,
  the chunk sat at x −272 with its heading cropped. Horizontally the frame is
  now the chunk. Vertically the pane keeps the centring it had, because it is
  what the room is reading and it can stand taller than the text beside it.

  Under 900px the same branch was worse. The pane is `position: fixed` there,
  a fixed element inside a transformed ancestor is positioned against that
  ancestor rather than the viewport, and `getOffset` walks `offsetParent` – of
  which a fixed box has none – up to the stage. So the camera was reading the
  pane's runaway coordinates and answering with `translate(-4320px,
  -40850px)`. The two errors cancelled inside the card and nowhere else: the
  card looked right, and the slide it is supposed to cover was thirty-seven
  thousand pixels away, so it floated on an empty page. The pane now takes the
  whole column and stacks under the slide's words, in flow, where the camera
  can find it. The one construct here that really does escape to the window is
  the figure overlay, and it escapes by leaving the stage.

- **An expanded chunk gave both its columns less room than the `narrow` width
  class.** The rule caps the pane at `36em` and that cap has never been what
  decides the width. A closed chunk is one text column between two `1fr`
  gutters and can afford a 14% margin each side; an expanded one has two
  panels and the same margin leaves them 72% of the slide to share. Measured
  at three window sizes, both tracks came out equal – 21.0em at 1440, 23.4em
  at 1920 – identical on a narrow, a wide and a full chunk, with the pane
  scrolling in every case. The margin now halves while a chunk is expanded, as
  the variable rather than as a padding property, because `.exps` and
  `.chunk-num` are positioned against it too and trimming the box alone would
  have left the chevrons standing 14% in, on top of the pane. Both columns go
  to 26.0em at 1440 and 28.9em at 1920, and three of the tutorial's four
  expansions stop scrolling.

- **The expansion chevrons sat on top of the words at any zoom above the
  default.** `.exps` is absolutely positioned at the foot of the slide and
  sized in `0.62em * var(--zoom)`, while the text below it simply grew. On the
  tutorial's own `#expand` a line of prose was inside the button rectangle at
  zoom 1.65, 1.95 and 2.2. A chunk that has chevrons now reserves the band, in
  the same terms the chevrons are sized in, so the reserve tracks the zoom
  key: under the words when the chunk is closed, and as the chunk's own bottom
  padding when it is expanded, because then it is the pane standing on the
  floor and the pane paints over the buttons.

- **Prose in the live views had no line-breaking treatment at all.** The
  collapsed slide line is balanced and a card is set `pretty`, so the omission
  only showed with `C` pressed once, where every paragraph fell back to greedy
  wrapping: over the tutorial's 59 multi-line paragraphs in reading mode, 31%
  ended on a line under a quarter of the measure – one word alone under a full
  line. `p` and `li` now take the `text-wrap: pretty` the document views have
  had since 1.0.0, carrying the `style: {wrap: none}` guard with them, and
  both existing rules stay more specific and keep winning. Honest about the
  size of it: measured against itself on Chromium 149, the rule re-breaks two
  of those 59 paragraphs. It is the right rule and the gap was real, but
  Chrome's `pretty` is conservative, and hyphenation – the thing that would
  actually close those lines up – is deliberately off in the live views.

- **Auto-fit sized every cover and every section divider to its smallest
  type.** `fitZoomToChunk` asked whether the chunk's own box fitted inside 94%
  of the viewport. Three families are pinned to the full slide height so their
  ground fills the frame rather than painting a band across the middle third –
  the cover (`.chunk-title`), the divider (`.chunk-section`) and any chunk
  carrying a `::: backdrop` – and a box that is as tall as the screen by
  construction can never fit inside 94% of it. The shrink loop therefore read
  “still too tall” at every step and walked the zoom down to its 0.6 floor,
  whatever was on the slide. A deck with `auto-fit: true` in its frontmatter
  met it on its first slide; every other deck met it the moment the lecturer
  pressed `#`.

  The fit now measures the flow – the extent of the chunk's in-flow children,
  which is the content column plus any expansion body open beneath it, and
  never more than the box itself, so an ordinary chunk measures exactly what
  it measured before. Two details are load-bearing. It looks one level
  through `.chunk-content`, because on a cover that element is stretched to
  the frame as well so the block can be placed at its top, middle or end; it
  is safe to look through precisely because it carries no ground of its own,
  and its padding is added back. And it reads `offsetTop`/`offsetHeight`
  rather than client rects, because the cockpit scales its whole stage with a
  transform to fit the preview cell – a client rect there is in that scaled
  space while the budget it is compared against is in layout pixels.

- **Revealing a segment now re-solves the zoom and the camera.** Every other
  change that alters what is on a slide re-solves both – `jumpTo`, the zoom
  keys, the auto-fit toggle, a window resize – and reveal re-solved neither.
  One omission, two faces:

  In auto-fit, the chunk was sized to its opening segment and everything
  revealed after that grew off the bottom of the screen: 129px of a tutorial
  chunk, with nothing on either screen saying so.

  In **both** modes the camera held still while the chunk grew downwards. A
  hidden segment takes no space, so a chunk already taller than the frame put
  each new segment further below the bottom edge – on the tutorial's own
  reveal chunk the third beat landed 430px below a 900px viewport. The
  lecturer pressed forward and the room saw nothing change. A chunk taller
  than the frame is now *walked*: its head is pinned on arrival exactly as
  before, and from the second beat onward the camera follows the revealed
  foot down, never further up than that head pin – so `back` retraces the walk
  and returns to the arrival framing exactly.

  The walk is a pure function of `revealed[]` and layout, which is what keeps
  the projection and the cockpit pointing at the same part of the slide: each
  window solves its own camera from the shared state, and neither is told
  which key caused the change. The zoom half stays auto-fit only – outside it
  the zoom is the lecturer's and is still never touched automatically – while
  the camera half applies in both, because a camera framing the wrong part of
  a slide is wrong either way.

  Deliberately **not** extended to an opened `::: expand` or a `+ NOTE` box.
  Those shift the camera to bring a panel into view and change nothing about
  the slide's own content; both already have their own branch in
  `focusCamera`, and neither should resize anything.

- **Code blocks, tables, marginalia, figure captions, overlay headings and the
  outline list grew with the square of the zoom.** Each of those rules
  multiplied by `var(--zoom)` on an `em` that its container had already
  multiplied by it, so the coefficient the stylesheet states only held at zoom
  1.0. At the default zoom of 1.35 a code block set at `0.78em` of the prose
  came out **5% larger** than the prose it sat in, and a marginalia meant to
  read as an aside outweighed the body text it hung beside. The zoom is now
  applied once, where the container applies it, and the coefficients are plain
  ratios again.

  Two consequences worth knowing. Code is visibly smaller at any zoom above
  1.0 – that is the 0.78 relationship the rule always named. And the
  code-line budget widens with it: roughly **78 characters** at the default
  zoom in a 16:9 window where it used to be 57, and about **36** inside one
  pane of a `::: side`. The same list appears both as a `## outline:` chunk
  and as a `section: outline` divider, and only the chunk was doubling – the
  zoom moved onto the divider's own list so both now scale alike.

- **A quotation on a divider grew with the square of the zoom.**
  `.chunk-section .section-body blockquote` multiplied by `var(--zoom)` on an
  `em` that `.section-body` had already multiplied by it. Invisible at 1.0,
  and at the zoom auto-fit picks for a divider the quotation was the largest
  thing on a slide whose whole job is to be quiet. Part of the same family as
  the entry above it, found first.

- **`lint.js` let through a coordinate the build refuses, on the most basic
  literal in the figure grammar.** `box a "x" at 3,` and `box a "x" at 0x10,1`
  are errors in `diagram-core.mjs`, and for a stated reason: `Number('')` is 0,
  so the empty half of a pair silently placed the element on an axis origin,
  and `Number('0x10')` is 16. The linter still tested the token with a bare
  `Number.isFinite`, which both of those pass. That is the lax direction – the
  one that merges green and fails every later build – and it was reachable
  from any lecture CI lints but does not build. The linter now spells the
  literal out, the way the compiler already did.

  Both cases had been written down for a revision. They sat in a browser spec
  that CI never runs and that asked the build alone; moving them into
  `test/gates/refusals.mjs`, where every fixture is compiled *and* linted, is
  what turned two passing assertions into a named gap.

- **A second review, by a different model, found eight more - and seven of
  them were places `build.js` and `lint.js` disagreed.** Four in the direction
  that matters, where the build accepted what the linter refuses: `section:`
  with an unknown value was read only while rendering a live divider, so it
  wrote two print files and then threw; a second `::: overlay` replaced the
  first and its words were gone from every output at exit 0; an unreadable
  `::: cards` or `::: rows` line fell through every branch and printed as
  literal text on the projection; and a `## closing:` with no heading rendered
  an empty slide. Plus two silent no-ops - `cover-image` on the six covers
  that draw no picture of their own, and a width class or `.bare` on a title
  or closing chunk, both byte-identical with and without - and two gaps where
  the linter read the frontmatter more narrowly than the build.

  Two of its findings were declined as documented decisions: the linter
  deliberately leaves the numeric `style:` scales to the build, and naming a
  slot's default explicitly is meant to produce identical output - that is
  self-documentation for a reader, not a promise of an effect.

- **A code review over the whole slide-decoration family found eighteen
  defects, and four of them were in the fixes for the first ten.** The ones
  an author would have met: an unclosed `::: cols` made every later
  `::: draw` in the lecture a hard failure naming a chunk that had no
  columns; an unclosed `::: expand` silently swallowed every slide below it
  and exited 0; a `quote` cover with no quotation built clean under
  `--print-only` and left half-written files under a full build; a divider's
  `::: backdrop` painted nothing on paper; an `outline:` chunk dropped its
  speaker notes, annotation box, expansions, backdrop and overlays; the
  backdrop reveal's crop rode into print and cropped the banner; a lone
  picture written as Markdown laid out differently from the same picture
  written as a figure; an unrecognised class was dropped by the build and
  reported by the linter; and `::: overlay … from later` printed the
  directive as literal text on the projection.

  Each has a regression test phrased as the failure that was there rather
  than the outcome that is wanted. The rules they produced are in CLAUDE.md,
  under the slide-decoration section.

- **Three things painted over each other, and they are one mistake in three
  places: chrome and grounds positioned against something other than the
  slide.** A backdrop is no longer painted on any slide but its own -
  neighbours sit at 4%, which is invisible for a paragraph and a visible grey
  band for a photograph, and a `reveal`ed one showed as a grey block in the
  corner of the next slide. The `+ note` affordance moved out of the content
  box into the slide's own gutter, where it cannot reach the text whatever
  the width class says. And the outline list caps each row in its own type
  size rather than the list in the list's, which had the live row wrapping
  after four words while a quotation beside it ran half again as wide.

- **A divider whose body is nothing but a figure now lays it beside the
  heading.** Stacked, a part title, an agenda and a drawing are three blocks
  down one axis with nothing balancing them across it.

- **An overlay card's `standard` measure was about 48 characters.** Measured
  in the card's own em, which is 0.92 of the slide's. Widened one step each
  (19 / 29 / 42em).

- **A heading inside a `::: overlay` or `::: expand` opened a column.** The
  overlay came out empty, the deck grew a divider slide carrying the
  author's title, and nothing said so – the later `:::` still closed
  something, so the unclosed-directive error never fired either. A heading
  inside a captured block is that block's content now, in the build and in
  the linter.

- **The masthead lede ran to 84 characters.** Measured on a real deck; it is
  capped at about 65 now. The folio rule is what asserts the composition's
  width, so the running text does not have to.

- **The outline divider's numerals were unreadable and oddly set.** They sat
  at one small size on every row, so on the live row a footnote-sized digit
  hung under a headline; and the recession stacked opacity on top of soft
  ink, which in `terminal-green` put the coming parts at a luminance of
  0.25 against a 0.11 ground. Each numeral takes its own row's size now,
  right-aligned in one column, and recession is a single mix toward the
  paper.

- **`section: outline` – the running agenda.** The one divider that is a
  different slide rather than a treatment of the heading: every part of the
  lecture listed, this one live, the ones behind and ahead receding. It
  answers what a coloured field cannot - not *a new part starts* but *which
  part, out of how many, and how far in are we* - and it is the recurring
  element a long lecture needs, because the room meets the same list four or
  six times and learns the shape of the hour from it.

  Three states and deliberately not three greys: two a projector can tell
  apart, three it cannot, so progress is carried by the *position* of the live
  item walking down the list and the fade only says "not this one". The
  heading is the live item rather than a second copy of it set beside the
  list. Print ignores it like every other divider variant, which is what keeps
  the family cheap.

- **`cover-align: top | middle | bottom`.** Where the type sits on the
  vertical, for the six covers that leave it any freedom (`classic`, `stack`,
  `panel`, `split`, `beside`, `hero`) - so a `split` cover can put its title
  in the lower third instead of centring it. One key rather than six more
  variant names, because `split-bottom` and `stack-top` is a list that
  multiplies every time either half of it grows. Refused on the three that
  place their own type, the same rule `cover-ratio` follows. The closing slide
  inherits it, unlike the ratio: a deck whose cover puts its title in the
  lower third and whose last slide centres it has not closed the arc.

- **The bundled mono face ligated the grammar's own tokens away.** JetBrains
  Mono draws `->` as a single arrow glyph, and `<-`, `<->`, `--` and `!=` the
  same way, so a listing on a slide, in a handout, in a `.mono` diagram label
  or in the editor's source pane showed a character the author cannot type
  back – and in this grammar `->` and `--` are two different edges. Every
  stylesheet that carries a listing now sets `font-variant-ligatures: none`;
  the value is `none` and not `no-contextual`, because the arrows live in the
  contextual set and the rest in `liga`. Only the mono channel: sans and serif
  labels keep their `fi` and `fl`, and the editor's canvas is left alone so
  the figure looks there exactly as it looks on the slide.

- **Two messages named a name that exists but is not usable yet as one that
  does not exist.** A `plot` line that failed on a later option is still
  *registered* under its name, so reading a value out of it reported that
  "q is a plot, not a plot"; it now points at the line carrying the real
  error, and says it once per name instead of once per coordinate. A
  `same as` naming a chart declared three lines lower said it named nothing
  in the block.

- **A bare `.cross` box is square.** It was 66 by 37 - the minimum box width
  against one line of type - so a plus sign came out with arms of two different
  lengths, which reads as a stretched shape rather than as a marker. Squared
  where the size is decided rather than where the path is drawn, because the
  footprint the layout reserves has to be the footprint that is drawn.

- **A label beside a vertical edge had half the clearance of one beside a
  horizontal edge.** The measured box carries the line's leading along its
  height and nothing along its width, so the same constant bought 3.9px of air
  in one direction and 2px in the other - and optically a gap across a line of
  text needs more, not less. The missing leading is added back where the
  measurement does not carry it.

- **A grounded label beside a line laid its ground back across the line.** The
  offset cleared the glyphs and not the ground, so the rect painted out the one
  thing the offset existed to keep visible.

- **`emph` on a `.tone-4` element was invisible** - an accent stroke on an
  accent fill. It is an ink ring now, checked in all seven themes.

- **A `bars … series of` line was not editable at all.** It is the one statement
  that produces no element carrying its own name, so it had no span-table entry;
  that looked like a decision and was an accident.

- **Every edge label cleared its own width, whichever way its line ran.** The
  gap between a label and its line has to clear what the words measure *across*
  the line – their height beside a horizontal one, their width beside a
  vertical one – and the test that decided which compared an angle in degrees
  against a boolean. `false !== 0` is true whatever the line does, so a
  horizontal edge pushed its label off by half the label's length. It is why
  two arrows between one pair of boxes carried their labels at two different
  heights, each proportional to how long its own word was. The number and the
  boolean are separate values now.

- **A bare `dot` was the one thing in a diagram that ignored `unit=`.** Its
  default radius was 13 raw pixels while the `r` an author writes is in grid
  units, so the smaller the unit, the fatter an unsized dot came out relative
  to everything around it – a marker inside a plot arrived taller than the cell
  it marked a point in. It is 0.18 grid units now, measured against the same
  height every other clearance is; at the default unit that is 12.96 px, so
  existing figures are unchanged to the pixel.

- **`show` or `hide` naming an edge, a container, a brace or an annotated text
  did nothing.** Those four take their visibility from what they are attached
  to – an edge from its two ends, an outline from its members, a note from what
  its leader points at – and that rule was applied *after* the step had had its
  say, so a `show` on one of them parsed, passed the reference check, wrote the
  state and was then thrown away. The downhill rule is now the default and an
  explicit `show` or `hide` overrides it, which is what makes an arrow that has
  to arrive a beat after both its ends expressible at all. A container shown by
  name also fits its whole set rather than the visible part of it: an outline
  drawn around some of what it says it holds is the same mistake read the other
  way.

- **A coordinate pair written as a single anchor crashed the build.**
  `dot m at c.center` was reported correctly by the parser and then laid out
  anyway, and the compiler died on the null pair with a TypeError. The author
  saw a stack trace where every other mistake in this language names its line.
  A pair that failed to parse is placed at the origin now, so the layout
  finishes and the message gets out.

- **`.muted` and `.dim` were hard to tell apart.** They answer different
  questions - scaffolding versus temporarily out of the way - but a lighter
  grey alone read as "slightly faint" either way. `.muted` is now drawn
  thinner as well as lighter, which is what supporting apparatus should look
  like; `.dim` is unchanged at a third of full strength.

- **`.mono` never applied to a diagram label.** The class resolved, emitted
  its marker on the `<text>` element, and changed nothing: the rule that
  styles it is one class less specific than the rule that sets the label
  family, so the label rule won. Measured before the fix, eight `i`s and
  eight `W`s in a `.mono` label came out 22.8px and 109.1px wide, which is
  the sans face. The three family classes are now all written the same way.

- **A `container` outline was drawn in the faintest line colour on the page**
  (`--rule`, which elsewhere separates two cells of a table). Dashed at that
  weight it was close to invisible on a shaded background, which is where a
  trust boundary or a network segment is usually drawn. It now strokes at a
  mix of the text and background colours, so it still follows the theme.

- **A review of the whole branch, and thirty findings closed.** The ones a
  user could meet, grouped:

  `--optimize-images` rewrote only markdown-style `](path)` references, so
  an explicit path in a `::: draw` image statement kept pointing at the
  original the command had just converted and deleted – the next build
  failed on a file the tool itself removed. Both spellings are rewritten
  now, fence-aware, and a conversion whose reference cannot be found is
  said out loud instead of reported as done. The reference collectors are
  fence-aware too, and they read a `grid … image` asset – a fenced syntax
  example can no longer get a real file converted, and an oversized grid
  asset no longer slips past the gate.

  Three promises of the live-edit sync are kept now instead of documented:
  an edit committed while the projection is frozen is held back and
  delivered on thaw ("unfreeze, and the room gets the finished picture");
  a received edit is persisted the way a local one is, so reopening the
  editor no longer loads pre-edit source whose next gesture silently
  reverted the peer's work everywhere; and under `editor: speaker` the
  cockpit sends the compiled figure along with the source, so a projection
  that ships no compiler applies the edit instead of dropping it in
  silence. The zoomed focus card – the thing the room is actually looking
  at – now follows a structural edit too; it used to keep the pre-edit
  drawing until refocused. The DOM half of all of this is one shared
  function (`dgSwapFigure`), so the editor's path and the no-editor path
  cannot drift.

  The linter agreed with the compiler in neither direction. Stricter: a
  quoted label containing braces (`"H = {0,1}^n"`) was read as an attribute
  tail and refused – set notation in exactly the lectures this vocabulary
  was built for. Laxer: the kind-gated class refusals, the `point` checks
  and the reserved-id rule were not mirrored, and a `@tag` on a `default`
  or `step` line counted as carried – so a lecture that is linted by CI but
  never built could merge green and fail every later build. The refusal
  functions are imported from `diagram-core.mjs` now, the same bend the
  naming scheme already made: they are the rule, and a second spelling of
  it here is how the gate came to disagree.

  Parser holes of the kind this grammar refuses: `at 3,` placed an
  element at 0 instead of erroring (`Number('')` is 0, and `0x10` was 16);
  `between a,b point right` consumed the newer options as member names and
  refused valid syntax order-sensitively – the stop list is derived from
  `DG_KIND_OPTS` now, so it cannot drift again; an element named
  `constructor` or `toString` broke the step runtime's frame tables at
  show time with nothing at build time to say why (refused at parse, in
  both compiler and linter); and a diagram `image` that resolved to a video
  file built without complaint and rendered an empty box – a clip is
  refused with the construct that works, `![](clip-id)` in the chunk body.

  In the editor: the span table took an element named `w`, `h`, `x` or
  `gap` – all natural diagram names – for the option keyword and spliced
  panel edits over the wrong token, up to and including a label; dragging a
  container or brace planned an `at` their statements refuse and reverted
  the whole multi-selection with it; a drag at a beat moved only the
  element under the pointer, not the selection; a resize handle on a `grid`
  spliced `w`/`h` into a statement that takes `cell`; waypoint handles on a
  `.smooth` edge sat on Bézier control points instead of the author's
  waypoints; the arrowheads row edited a class the parser had derived from
  `--`, so "both" produced one reversed head and every tail rebuild wrote
  `.no-head` into the line – the row rewrites the arrow token itself now;
  a non-numeric gap or frac was written as 0 instead of refused; a
  cancelled pointer (alt-tab, a system gesture) left the drag listeners
  armed so the next click committed an abandoned preview; and two of the
  asset picker's three insert paths appended a line the in-page compiler
  then refused, while the status said "written" – all three register the
  asset first, and "written" is only said when it stuck. A failed watch
  rebuild now reaches the page and the editor's status line; it used to be
  visible only in the terminal while the next write-back was refused with
  advice that could not help.

  And the payloads: print carried every figure's step frames and editor
  source as JSON no consumer ever parses – 346 KB of the network-security
  print file – and ships none of it now. A stepped diagram inside an
  `::: expand` was stuck on its opening beat in the live views (its steps
  consume no beats, and nothing ever advanced it); where no beat can
  reach, the finished picture is shown, which is what print always did.
  `DIAGRAM_CSS` is covered by `assertStylesheetsWellFormed` like every
  other inlined sheet, the runtime's outline table is interpolated from
  `DG_SHAPE_CLASSES` instead of hand-copied, and the browser suite starts
  one Chromium for the whole run instead of one per spec.

  In `lectures/network-security`: #ns-b57's "anomalous payload
  distribution" carried the values of #ns-b56's *training* distribution,
  so the histogram was congruent with the one it is supposed to deviate
  from; it and #ns-b55 now share one set of values for the one packet they
  both show, and the bins sum exactly to the slide's printed counts
  43 / 36 / 21. Two miscounts in the German commentary (ten packets, not
  twelve; one intermediate in the drawn `github.com` chain) and the
  diagrams lecture's statement count (fourteen, not eleven) match their
  figures again.

- Sentence extraction no longer ends the topic sentence at an abbreviation
  dot. „(Kleinberg u. a. 2017)“ used to cut the collapsed head short after
  „u.“; a single letter or digit before the dot, a small German/English
  abbreviation list (bzw., vgl., Dr., al., …), and a lowercase continuation
  after the dot now all keep the sentence open. `!` and `?` are unaffected.
  Trade-off: a sentence genuinely ending in a single character ("… um
  Faktor 3.") now keeps its continuation in the head – a too-long topic
  sentence rather than a truncated one.

- **The `above` cover ran its title off the bottom of the slide.** A
  percentage grid row resolves against the container's height, and `.chunk`
  carries only a `min-height` – so `grid-template-rows: 58% …` fell back to
  auto, the art row took the drawing's intrinsic height, the text row took the
  type's, and together they came to more than a slide. Rendered with a figure
  and four meta lines, the subtitle was cut through the middle by the frame's
  bottom edge. The height is definite now. A second defect was hiding behind
  it: `max-height: 100%` on the svg resolved to `none`, because a percentage
  max-height needs a *specified* height on the containing block and the
  `<figure>` between the two had `height: auto` – so the drawing came out
  622px tall in a 409px row. Both were found by measuring the rendered page,
  not by reading the stylesheet.

- **A closing slide on the `panel` cover printed grey type on a brown plate.**
  `.chunk-title[data-closing] .closing-body` and
  `.chunk-title[data-cover=panel] .closing-body` weigh the same, so source
  order decided it; `AUDIENCE_CSS` happened to order them the way that worked
  and `PRINT_CSS` the way that did not. Both name both attributes now and win
  by specificity rather than by luck.

## [1.0.0]

First public release. psi-slides has carried a full semester of university
teaching; everything below is in use rather than aspirational.

### The medium

- One Markdown `source.md` per lecture builds **four self-contained HTML views**:
  `audience.html` (the projection), `speaker.html` (the presenter cockpit),
  `print.html` (a reading document with cover and table of contents), and
  `print-notes.html` (the same document with `> note:` blocks folded in).
- Everything is inlined: CSS, JavaScript, images, Shiki-highlighted code,
  KaTeX-rendered maths, and the typefaces. Three families ship with the tool
  and are embedded in every output (Literata, Inter Tight, JetBrains Mono, all
  SIL OFL 1.1); an author's own fonts win per role, and `fonts: none` turns
  the bundle off. Nothing is fetched at run time; the files open from
  `file://`.
- **Collapse**: the same prose is rendered at two densities. The projection
  shows the topic sentence plus promoted `**bold**` fragments; the document
  shows all of it. `::: slide` and `::: script` are the escape hatch when no
  first-sentence rule can carve the argument up sensibly.

### Authoring

- Chunk grammar `## tag: Heading | Sub-heading {.width #id}` with eight tags
  and four widths.
- Body directives: reveal segments (`---`), `::: expand`, `::: margin`,
  `::: marginalia`, `::: cols`, `::: side` / `::: flip`, `::: slide`,
  `::: script`, `::: embed`.
- `![](fig-id)` resolves against `assets/`; SVG is spliced inline so it
  re-colours with the theme.
- Maths as `$inline$` and `$$display$$`, rendered at build time. Only the
  font families a lecture's formulas actually use are embedded.
- Video: a clip is a figure that moves. Inlined under a per-file cap, staged
  into `videos/` above it, or played from a URL.
- Hosted players via `::: embed <url>` for YouTube and Vimeo, loaded only
  while their chunk is on screen.
- Frontmatter can pin how a lecture opens: `font`, `theme`, `collapse`,
  `auto-fit`, `slide-numbers`, `lang`, and a `fonts:` block.

### Presenting

- Audience and speaker windows sync over `window.postMessage`, which works
  across `file://` origins where `BroadcastChannel` does not.
- Cockpit: column scrubber, stage mirror, editable notes, preview strip,
  timer, laser pointer, and a preview of the segment you are about to reveal.
- `V` freezes the projection so the room holds its slide while you read
  ahead; thawing catches it up. `B` blanks the projection only.
- Overview board, full-text search from anywhere, table of contents,
  per-collapse-mode zoom and auto-fit.
- Live annotations typed during a talk, exportable back into `source.md`.

### Tooling

- `lint.js`, zero-dependency, enforcing the parsing contract and per-tag word
  budgets.
- `--watch` for live reload, `--serve` for a loopback HTTP server,
  `--optimize-images`, `--integrate-annotations`, `--new`.
- A skill at `.claude/skills/psi-slides-authoring/` for writing lectures with
  an LLM assistant.
- A project site built from the same repository
  ([uba-psi.github.io/psi-slides](https://uba-psi.github.io/psi-slides/)),
  publishing three lectures in all four views so the tool can be tried before
  anything is installed.

### Known limits

Read [When *not* to use this](README.md#when-not-to-use-this) and
[the comparison](docs/comparison.md) before committing a semester to it.
There is no test suite, one author, and the format is still moving.

[Unreleased]: https://github.com/UBA-PSI/psi-slides/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/UBA-PSI/psi-slides/releases/tag/v1.0.0
