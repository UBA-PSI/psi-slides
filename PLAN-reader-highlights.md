# Reader tools for the documents: highlights, notes, contents

`print.html` and `print-notes.html` are read on screen as much as on paper –
by students, after the lecture. This plan gives the reader three things there:
**highlights** they make themselves, an optional **note** on each, and a
**contents sidebar** that knows where they are. The live views get none of it.

The feature exists already, outside the engine: the ZfW course
(`~/Documents/LSt BA/Weiterbildung/ZfW/2026-2/zoom/interaktiv/`) splices
`markierungen.js` / `lesen.js` into psi-slides' `print.html` with a Python
post-processor. This plan moves the idea into the build and fixes the one
thing that version gets wrong: a highlight whose text changed is silently
dropped.

## 1. Decisions

- **Documents only.** `print.html` and `print-notes.html`, on screen and on
  paper. Not `audience.html`, not `speaker.html`: a projection is driven by
  keys and clicks already, and a reader tool there is in the way.
- **Separate from annotations.** `> annot:` is the lecturer's: typed live,
  exported with Shift-E, integrated into `source.md`, shown to everyone.
  A highlight is the reader's: made while reading, kept in their browser,
  seen by nobody else. Different owner, different store, different
  lifecycle – no shared code path, no shared word. The UI says
  *Markierung* / *highlight*; *note* on its own is taken by `> note:`.
- **Private, with a Markdown export.** Nothing leaves the browser unless the
  reader exports it. The export is a backup (and restores – see §5) and is
  what a student sends the lecturer when they want to say what they did not
  understand.
- **Highlights print.** Yellow on paper, notes in the outer margin (§6).
- **One colour.** Yellow. A second kind ("unklar") can come later; the data
  model carries a `kind` field from the start so it costs no migration.
- **Contents sidebar in the same slice**, because it fixes the screen layout
  with two margins in one go: contents left, notes right.
- **`reader: on | off`** in the frontmatter, default `on`. `off` ships none
  of the reader script or CSS (the lightbox stays – it is not a reader
  tool). Two-state switches are `on`/`off` here (`note-button`); `none` is
  for a payload with several targets (`editor`), `hidden` for a look
  (`neighbours`).

## 2. Interaction

**Making one.** Select text inside a chunk. A small button appears at the end
of the selection (below it, flipped above when there is no room, clamped to
the window). Click → the text turns yellow and its note card opens in the
right margin with the cursor in an empty textarea. Leaving the textarea
empty is fine: a highlight without a note is the common case.

**What can be highlighted.** Running text, lists, tables, headings of a chunk,
blockquotes. Not: a `::: draw` figure, a KaTeX formula, a code block (those
open the lightbox on click), the speaker-note asides in `print-notes.html`,
anything the build invents (slide numbers, labels). A selection that crosses
a chunk boundary is clipped to the chunk it started in. A selection that
overlaps an existing highlight extends/merges into it rather than being
refused.

**Opening one.** Click a highlight → its card is focused (scrolled into view
in the margin, outlined). The card has the note, *Notiz löschen*
(clears the text) and *Markierung entfernen* (unwraps it, drops the note).
Delete is immediate; one *Rückgängig* toast for five seconds replaces a
confirm dialog.

**Navigation.** A small pill, fixed bottom right, appears once there is at
least one highlight: `‹  3 / 12  ›` plus a toggle *alle / mit Notiz*.
Keys `n` / `p` (only when focus is not in a text field) go to next /
previous in document order, respecting the toggle. The contents sidebar
shows a count per section. Nothing is shown to a reader who has not
highlighted anything.

Decided in slice 3:

- **Stops at the ends, no wrap-around.** On the last highlight the next
  arrow is greyed out and `n` does nothing. Wrapping round from the last
  highlight to the first loses a reader's place in a long document.
- **With none open, the way starts where the reader is.** `n` takes the
  first highlight whose top is below the top of the window, and `p` the last
  one above it. If the open highlight is one the filter leaves out, the way
  starts from that highlight. The counter then reads `– / 12`.
- **The route is ordered by element, not by chunk and offset.** Every
  painted entry is sorted by where its first painted element stands in the
  page (`compareDocumentPosition`), so a figure highlight (§11) joins it as
  soon as its painter hands back elements.
- **The counts are per slide, and a lede's go on its part heading.** They
  count every placed highlight whatever the filter says. Orphans are not
  counted, because they are listed in the foot.
- **Keys:** never in an input, textarea, select or contenteditable, never
  with Ctrl, Alt, Meta or Shift, and not while the lightbox or the contents
  overlay is open. The lightbox covers the pill.
- The pill takes the bottom right corner at every width. The contents
  button is top left from 920 px and bottom left below that. Below 920 px
  the undo toast already sits 3.5rem up, so it stays clear of both. If the
  selection button would land on the pill, it flips above the selection.
  The filter lasts as long as the page and is not stored.

**Menu.** In the sidebar foot: *Markierungen exportieren (.md)*,
*importieren*, *alle löschen* (with the undo toast), and the list of
highlights that could not be re-anchored (§4), if any.

## 3. Data model

```js
{
  v: 1,
  id: 'h-…',          // random, stable
  chunk: 'cbc-dec',   // the chunk's frozen {#id}; divider lede: the column id
  start: 214, end: 262,   // offsets into the chunk's reader text (see below)
  quote: 'the IV is XORed into the first block',
  prefix: '…32 chars before', suffix: '32 chars after…',
  note: '',           // plain text
  kind: 'mark',       // reserved for a second colour
  created: 1695456000000, edited: …
}
```

**Reader text** of a chunk = its text nodes in document order, skipping
`.speaker-note`, `.chunk-num`, `.chunk-label`, `.psi-diagram`, `.katex`,
`pre`, `button`, and every element the reader script itself adds. Skipping
`.speaker-note` is what makes the offsets identical in `print.html` and
`print-notes.html`, so one store serves both files.

**Storage.** `localStorage`, one key per lecture:
`psi-reader:v1:<lecture-key>`, where `<lecture-key>` is written into the page
by the build (the source folder's name, the same slug `--new` makes). Not
`location.pathname`: the two documents must share, and a copied folder
should carry its highlights by export, not by accident.

**What a `file://` origin is for localStorage, measured (slice 2):**

- **Chrome** shares one store between all `file://` pages, so `print.html`
  and `print-notes.html` share their highlights with no further ado – and
  so, keyed by folder name, do two lectures whose folders have the same
  name. That collision is accepted: the export is how a highlight moves
  between copies on purpose.
- **Firefox** isolates `file://` storage **per file**: `print.html` and
  `print-notes.html` each have their own store, and a highlight made in one
  is not in the other.
- **Safari**, tried by hand: shares one store between the two files, as
  Chrome does. Highlights made from `file://` survive a reload, and one made
  in `print.html` is there in `print-notes.html`. The narrow-window card
  under its paragraph works as well.
- **Under `--serve`** both files share one `http://127.0.0.1` origin in
  every browser, so they share one store.

No workaround: the key stays per lecture, which is right wherever the
browser lets the two files share and costs nothing where it does not. The
reader-facing help text (a later slice) says that in Firefox the two
documents keep separate highlights, and that the export carries them from
one to the other. Where storage throws altogether (a private window in some
browsers, storage switched off), the highlights last as long as the tab and
the sidebar's foot says so in one line.

## 4. Anchoring across rebuilds

The lecturer rebuilds between sessions. A highlight must survive a typo fix
in its own chunk and must never vanish silently.

1. **Chunk gone** (id not in the page) → orphan.
2. **Exact:** reader text at `start…end` equals `quote` → paint.
3. **Search:** find `quote` in the chunk's reader text; several hits → the
   one whose surrounding text matches `prefix`/`suffix` best; one hit → take
   it. Paint and rewrite `start`/`end`.
4. **Fuzzy, bounded:** whitespace-normalised search (the build may re-wrap
   or re-hyphenate; soft hyphens are ignored); still nothing → orphan.
5. **Orphans** are listed in the sidebar foot with their quote and note,
   each with *entfernen*. They stay in the store and in the export. They are
   never deleted on load.

`id`s are frozen by the source-format contract, so an edit in another chunk
cannot move a highlight – which is the reason to anchor on the chunk and not
on the document.

## 5. Markdown export and import

```markdown
# Markierungen – <lecture title>

Exportiert am <Datum>, 12 Markierungen, 5 mit Notiz.

## 3 · CBC decryption {#cbc-dec}

> the IV is XORed into the first block

Warum das IV und nicht der Schlüssel?

<!-- psi-reader {"v":1,"id":"h-…","chunk":"cbc-dec","start":214,…} -->
```

Readable as it stands – a lecturer can read what a student sent without any
tool – and restorable: *importieren* reads the HTML comments only, merges by
`id` (the newer `edited` wins), and re-anchors as in §4. Headings carry the
slide number the document prints, so "slide 3" means the same thing to both
people. Download via a `Blob` link, `<lecture-key>-markierungen.md`.

Headings in the export use the lecture's `lang:`: the few words the reader
UI invents go into `STRINGS` (`de` and `en`), like every other built word.

Decided in slice 4:

- **The counts stand after a colon** – *Markierungen: 12, mit Notiz: 5*
  rather than *12 Markierungen, 5 mit Notiz* – so one string serves 1 and 12
  and no word has to agree with a number. The same for the import report.
- **The comments are escaped, not trusted:** two hyphens in a row inside the
  entry's JSON are written `-\u002d`, which reads back the same and cannot
  end the comment early (a note saying `-->` is the case).
- **Headings name the slide as the contents sidebar does**, number first
  (none under `slide-numbers: off`), then `{#id}`. A divider lede's entries
  stand under the part heading. Entries a rebuild could not place stand under
  `## <reader-orphans>`, each with a `###` slide heading; an entry of a type
  the build does not paint (a figure's, §11, before slice 6) is written there
  with `fig.key` as its quote line, and import keeps it rather than refusing
  it.
- **Import counts** new, updated (a newer `edited`) and, among those two,
  the ones it could not place. An older or equal copy is skipped silently.
  A comment that does not parse to an entry is counted and named in the same
  line; a file with none is *Diese Datei enthält keine Markierungen.*
- **The menu:** *export* and *alle löschen* stand only while there is
  something in the store; *importieren* and one line on what the export is
  for stand always, because a reader in a new browser has nothing yet. The
  line says what holds everywhere – highlights stay in this browser, an
  export carries them to another one or to the other document – rather than
  guessing whether this browser keeps the two documents apart, which a page
  cannot ask.
- The import button clears the file field before it opens the chooser, so
  the same file chosen twice is read twice.

## 6. Layout

**Screen, wide** (≥ ~1280 px; to be measured, not guessed):

```
| contents 15rem | · | text column 42rem | · | notes 17rem |
```

A card is shown in the margin for a highlight that has a note, and for the
one that is open; a highlight without a note has no card until it is
clicked, so a page with thirty plain highlights does not carry thirty empty
boxes. A highlight with a note is underlined in the stronger yellow, which is
how a narrow window, which shows no cards, still says there is a note.

The contents sidebar is sticky on the left; the note cards sit on the right,
each at the height of its highlight, pushed down past the previous card when
two collide (the ZfW packing, measured with `getBoundingClientRect`, re-run on
resize, font load and card edit).

**Screen, medium** (text + notes fit, contents does not): the sidebar
collapses to a button top left, which opens it as an overlay; a link click
closes it.

**Screen, narrow** (the notes column does not fit): a card opens inline,
directly under the block that holds its highlight, and only while that
highlight is focused. Highlights stay yellow.

**Paper.** Highlights print yellow (`print-color-adjust: exact`). A highlight
with a note gets a small superscript number; the note is set in the outer
margin at the height of its paragraph – the 5.8 cm the print layout already
keeps free "because a handout is written on" – as a right float with a
negative margin inside the page area. If that does not hold in Chrome's and
Safari's print engines (to be tried on a real print, not assumed), the
fallback is the notes per chunk as a numbered list under the chunk. The
sidebar, the pill and the buttons do not print.

Decided in slice 5, measured on PDFs printed from Chromium (`page.pdf()`)
and rendered page by page:

- **The float holds; the fallback list was not needed.** A right float with
  a negative right margin of its own width plus a gap (3.3 cm wide, pulled
  3.75 cm out) has a margin box wholly outside the 38rem column, so no line
  is shortened, and `clear: right` stacks two notes instead of setting them
  side by side. A note taller than what is left of a page continues at the
  top of the next one.
- **The number and the note are written into the text, hidden on screen,**
  and rebuilt on every layout, rather than inserted on `beforeprint`: a PDF
  made by a script fires no print event, and a page that is always ready to
  print cannot miss one. They carry `data-rd-ui`, so the reader text, a
  selection and the export pass over them.
- **A note is set at the line its highlight starts on**, as a float in that
  line, when every block between the line and the slide runs to the
  column's right edge in plain block flow. Otherwise – a table, a card in a
  grid, a blockquote with the browser's side margins, a part's lede, which
  is narrower than the column – it is hung before the outermost block that
  does not, and stands at that block's top, a line or so off where a
  negative or large top margin moves it. A float inside such a block would
  land inside it. The decision is measured on the screen's layout, which
  has the same block structure as the printed one.
- **The cover is the one place a note cannot stand beside its words**: the
  title chunk is a flex box, so its note is hung before the chunk and
  prints at the top of the cover page.
- **Sizes are in cm and pt, not rem**, because the free margin is a
  fraction of the sheet, not a number of lines, and a note set inside a
  heading must not take the heading's size. 7pt sans.
- **Safari prints it as Chrome does**, tried by hand with a PDF from the
  print dialog: yellow highlights, the numbers, the margin notes beside
  their highlights, nothing clipped or overlapping, no reader chrome.

## 7. Contents sidebar

- Chunk-level, grouped by column heading, numbered with the slide numbers the
  document prints. The title chunk and any `outline:` chunk are not entries.
- Scroll-spy: the entry of the chunk whose top last crossed ~30 % of the
  window gets `aria-current="location"`; rAF-batched scroll listener plus a
  `ResizeObserver` on `main` and `document.fonts.ready`.
- Per entry, the number of highlights in that chunk, when non-zero.
- The in-flow `nav.toc` stays: it is the printed contents page, and a reader
  without JavaScript still has it.
- No progress bar, no decoration (see the no-decorative-chrome rule).

## 8. Where the code lives

- `PRINT_JS` grows the reader half behind the lightbox; it is emitted only
  when `reader` is `on`. Same template-literal rules as every inlined block:
  no backticks, every regex backslash doubled – the whitespace-normalised
  search in §4 is where that bites; `node test/gates/run.mjs inlined` before
  any browser check.
- The CSS goes into `PRINT_CSS` under `@media screen` / `@media print` blocks
  of its own, keyed off `body[data-reader=on]`, so `reader: off` is also a
  no-op in CSS.
- `reader` joins `VIEW_DEFAULT_SPEC`; `lint.js` mirrors it
  (`unknown-view-default`), and the `frontmatter` gate holds the pair.
- Nothing new is read via `import.meta.url`, so
  `desktop/scripts/stage-engine.mjs` is unaffected.
- The strings go into `STRINGS` (`de`, `en`); `labels:` can override them.

## 9. Tests

- A browser spec `test/reader.mjs` building a fixture deck of its own (two
  columns, a chunk with a figure, a formula, code and a speaker note):
  make, note, delete + undo, `n`/`p` with the toggle, orphan after a source
  edit, re-anchor after an edit in the same chunk, the same highlight visible
  in `print.html` and `print-notes.html`, export → clear → import round trip,
  `reader: off` ships no reader script.
- A gate for the anchoring function if it can be lifted out of the page as
  text the way `test/settings.mjs` lifts the sentence helpers; otherwise it
  is covered by the spec.
- A contact-sheet check at 1440, 1100 and 390 px, and one real print to PDF
  from Chrome and from Safari for §6.

## 10. Slices

1. **Contents sidebar** and the two-margin screen layout, `reader` key,
   lint mirror. Nothing stored yet – this is the layout the rest sits in.
2. **Highlights and notes**: make, open, note, delete, undo, margin cards,
   store, re-anchoring, orphan list.
3. **Navigation**: pill, toggle, `n`/`p`, per-section counts.
4. **Export / import** (Markdown with embedded data).
5. **Paper**: yellow highlights and margin notes; the fallback if needed.
6. **Figures** (§11).
7. Docs: the authoring skill (`reader:`), `CHANGELOG.md`, a paragraph on the
   project site's page about the documents, rebuilt tracked views.

## 11. Highlights on figures

A question is as often about a picture as about a sentence – "what is this
arrow?", "why does s₀ go there?". Text selection cannot reach a figure, and a
click on one opens the lightbox, which stays so. Figures therefore get their
own two ways in, and neither changes what a click does.

**Two granularities, no more.**

- **The whole figure.** "I did not get this picture." One press.
- **A spot in it**, as a numbered pin. "This part." On a `::: draw` figure
  the pin snaps to the element under the pointer (a box, a label, an edge),
  which is what the reader means and what survives a rebuild (see anchoring).

Rectangles are left out on purpose: a drag inside a figure competes with the
lightbox's pan, and a pin with a note says what a rectangle would.

**Where each is made.**

- **In the document:** a small button in the figure's top-right corner,
  shown on hover and on keyboard focus (`:hover`, `:focus-within`). It marks
  the whole figure and opens its note card. Its own click is stopped, so it
  never opens the lightbox. On a device without hover (`@media (hover:
  none)`) the button is always shown, faint – a touch reader has no other
  way to find it.
- **In the lightbox:** the lightbox gets a minimal toolbar (close, and
  *Stelle markieren*, also on `m`). In marking mode the cursor becomes a
  crosshair, a diagram element under the pointer is outlined, and a click
  sets the pin. Marking lives in the lightbox because that is where the
  figure is large enough to point at precisely, and because it keeps a click
  in the document unambiguous.

A figure here is `figure.figure-img` (raster or inlined SVG) and
`figure.figure-diagram`. Not video, not embeds, not code or formulas (those
are text and could take a text highlight later, but not in this plan).

**What it looks like.**

- Whole figure marked: a yellow frame round the drawing's box and the
  highlight's number beside it. Functional, not ornament – it is the same
  signal as yellow text.
- Pin: a small yellow numbered disc on the spot; on a diagram element the
  element's shapes are tinted yellow as well (a class on its `<g>`, so it
  follows the theme machinery like every other diagram rule).
- Pins are drawn inside the figure's own coordinate system – a `<g>` in the
  SVG's viewBox for diagrams and inlined SVGs, an absolutely positioned
  layer over the `<img>` in per-cent for rasters – so they scale with it in
  the document, in the lightbox clone and on paper, with no second layout.
- The note card sits in the right margin like any other, at the figure's
  height; several pins on one figure stack as several cards. A pin made in
  the lightbox is a pin in the document the moment it is set – one store,
  one painter – and is there, with its card, when the lightbox closes.

**Writing the note while the lightbox is open.** The overlay covers the
margin, so the lightbox shows the note field itself: a small card beside the
pin just set, with the same textarea the margin card has, bound to the same
entry. Typing there is typing in the margin card. Clicking an existing pin
in the lightbox opens the same small card, so a pin can be read, edited and
removed without leaving the zoom.

**Clicks, so the lightbox stays what it was.** A click on the figure opens
the lightbox, as now. A click on a pin or on the whole-figure number focuses
its margin card and does not open the lightbox (the pin stops the event). A
click on a figure's margin card scrolls the figure into view and briefly
pulses the pin; `n` / `p` treat figure highlights as entries in document
order like any other.

**Anchoring.**

```js
{ …, type: 'figure',
  chunk: 'ctr-enc',
  fig: { index: 0, kind: 'diagram', key: 'Counter mode, encryption' },
  at: null                                   // whole figure
    | { el: 's1', x: 0.52, y: 0.61 }         // diagram element + fallback
    | { x: 0.31, y: 0.74 } }                 // raster / inlined SVG
```

- `fig.key` is the figure's fingerprint: a diagram's `aria-label`, an
  image's alt text or asset file name. Re-anchoring looks for the figure by
  key within the chunk first, by index second; neither → orphan (§4 rule 5).
- `el` is the element's **author-given name** – the build emits ids as
  `dg<N>-<name>`, and `<N>` is a per-document counter that moves whenever a
  figure is added above, so the prefix is stripped on save and resolved
  against the figure found above on load. An element that no longer exists
  falls back to `x`/`y` and the card says the spot is approximate.
- `x`/`y` are fractions of the drawing's box (viewBox for SVG, natural size
  for rasters), so they survive a re-scale, not a re-layout. That is why a
  diagram pin prefers the element.
- A stepped figure prints and shows in the document at its last beat; a pin
  is placed against that state.

**Export.** The entry names the figure and, for a diagram pin, the element's
label text, so a lecturer reading the file sees *Abbildung „Counter mode,
encryption“, bei »s₁«* rather than coordinates. The data comment carries the
anchor as above.

**Paper.** The frame or the pin disc prints in yellow; the number and the
note go to the margin like a text highlight's.

**Slice.** A seventh slice after paper (§10): the corner button and the
whole-figure mark first, then the lightbox toolbar and pins, then element
snapping. The spec in §9 gains a figure chunk with a diagram and a raster
image, and a rebuild in which the diagram gains a figure above it (the `dg<N>`
shift) and one element is renamed (the fallback).

Decided in slice 6:

- **The corner button says *Markieren* / *Highlight*** and is hidden until
  the pointer is on the figure or the button has the keyboard's focus; with
  no hover it stands at 55 % opacity. Pressed on a figure that is marked
  whole already, it opens that highlight's card rather than drawing a second
  frame.
- **The whole figure's disc sits on the frame's top left corner**, clear of
  the corner button and of a pin on a part in the top right, where a
  diagram's first part usually is. A pin on a part stands on the part's top
  right corner, a pin on an arrow at its middle, and a spot where it was
  put.
- **On screen a disc carries the highlight's place on the way through them
  all** – the number the pill counts – and on paper the number of its note.
  The script writes both and each medium hides the other. A figure gets no
  superscript; its note in the margin stands at the top of the figure. A
  whole figure without a note prints its frame and no disc.
- **A disc is sized after the document's figure**, about a label's size
  there, and scales with the zoom in the lightbox.
- **The card in the lightbox is the margin card itself**, lent to the
  overlay while it is open and given back when it closes, so there is one
  textarea and one entry. It stands right of its pin, or left where the
  window has no room. A figure's card has one line more than a text
  highlight's: which figure, and the words on the part a pin is on.
- **In the lightbox, Esc puts away the card first, then the crosshair, and
  only then the overlay.** Setting a pin ends marking, so the next click is
  not a second pin. A click beside an open card puts the card away and
  leaves the overlay open.
- **PRINT_JS knows nothing of highlights.** It sends `lb:open`, `lb:close`
  and a cancelable `lb:click` for a press that did not drag, and closes on
  `lb:dismiss`; the reader half answers those. It ignores a key already
  spent or typed into a field.
- **A picture is wrapped in a box as large as itself while it carries a
  pin**, which is what the per-cent discs are placed in, and the lightbox
  sizes a picture to its own proportions rather than letterboxing it inside
  a 92vw box, so the box a spot is measured against is the picture.
- **A bug found on the way: a drag on a picture in the lightbox never
  panned.** The browser started its own drag of the image, which cancels the
  pointer after the first move. The clone's images are not draggable now.
- **The key** is a diagram's `aria-label` (its chunk's heading), an image's
  alt text, an inlined vector's label, else its file name. Among several
  figures with one key the stored index decides; falling back to the index
  alone needs the same kind of figure. A figure found under a new index or
  key has its anchor rewritten, as a text highlight's offsets are.
- **The export names a figure in an italic line** – *Figure “Counter mode,
  encryption”, at “s₁”* – where a text highlight has its quote. An arrow
  with no words is named by the part's name.
- The undo notice stands above the lightbox, because a pin can be removed
  there.

## 12. Not in this plan

- Spaced-repetition questions (later, separately).
- The ZfW "Langfassung" collapsible sections.
- Anything shared or synced between readers or with the lecturer beyond the
  exported file.
