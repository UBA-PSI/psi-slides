# The two test suites, and which one a thing belongs in

Two suites, split by one question: **can this be decided without a browser?**

- **`test/gates/`** – everything that can, which is no longer only the figure
  language and the `{…}` tail grammar: a gate is the right home for any
  hand-mirrored list one file keeps of another's. Twelve gates, under a second,
  no browser and no `npm install`. Run by `gates.yml` on push and pull
  request.
- **`test/`** – the things that only break in a built page. 34 specs, ~872
  assertions, about five minutes, one Chromium for the whole run.

`npm test` runs the gates first, so a compiler regression fails in a second
rather than in four minutes.

Anything checkable without a browser belongs in `lint.js`, where it runs on
every commit, or in `test/gates/`, where it runs on every push. The browser
suite is not a unit-test suite.

A third file is in `npm test` and belongs to neither suite: `test/reproducible.mjs`
builds a lecture under a partial flag and under a full one and asserts the view
they share is the same bytes. It needs no browser and no `npm install` beyond
what `build.js` already has, but it is not a gate either, because it runs a
build. It exists because `release.yml` fails when a tracked view on disk does
not match a rebuild, and that check is only meaningful if a rebuild is a
function of the source alone - which, for a while, it was not.

A fourth place exists and is deliberately not one of these: `desktop/test/`
holds the desktop app's own tests, run by `npm test` inside `desktop/` and by
`desktop.yml`, never by `npm test` here. What it guards is the app's reading
of `--events`, its settings file and its window, none of which a lecture
depends on. Since the engine it stages is a hand-written list of the files
`build.js` reads about itself, `stage-engine.test.mjs` is there too - the same
shape as the `frontmatter` gate, in the suite that can see the packaging
script.

```bash
npm run gate                        # all gates
node test/gates/run.mjs semantics   # gates whose name matches
node test/run.mjs                   # all specs
node test/run.mjs nav               # specs whose name matches
npm run reproducible                # same bytes under any flag set
```

## The gates: eleven contracts

Both `diagram-core.mjs` and `lint.js` are zero-dependency, which is what makes
this suite runnable with nothing installed.

| gate | the contract |
| --- | --- |
| `refusals` | build and lint agree on what is refused |
| `accepts` | every construct still parses |
| `semantics` | the emitted SVG *means* what the source says, plus what the source means to the editor that rewrites it – the span table |
| `corpus` | every `::: draw` block in the repository still compiles, and each file holds exactly the number it is said to |
| `cue-cards` | the note-to-cards grammar in `cue-cards.mjs`, rule by rule, and that the module reaches `speaker.html` as `window.PSI_CARDS` |
| `step-classes` | which classes a beat can carry, derived from `DG_STEP_FIXED` rather than restated |
| `inlined` | the two characters that mean something else inside build.js's own template literals |
| `tails` | the one `{…}` tail parser and the `::: draw` opener parser in `tails.mjs`: every code, the written-default rule, the formatter round trip |
| `legacy-draw-syntax` | the old braced `::: draw` opener stays out of every `source.md`; every other survivor is on the reviewed allowlist `legacy-draw-syntax.txt` |
| `frontmatter` | `lint.js`'s `KNOWN_FRONTMATTER_KEYS` against every top-level key `build.js` actually reads |
| `xheight` | every text face in `BUNDLED_FONTS` carries the measured x-height that sizes inline code against the prose around it, and the roster agrees with `tools/font-playground/xheights.json` |
| `image-refs` | every way a `source.md` names a picture, and the one collector both readers of that set go through – what the inline cap refuses and what `--optimize-images` can fix have to be the same list |

**`frontmatter` is the one gate that is not about figures**, and it is here
because the shape is the one this suite exists for: a closed list in one file
that has to agree with another file, where the disagreement is silent. The
failure it guards is a *false warning on a valid deck* – a key the build reads
and validates, reported as unknown, exit 2 under `--strict`. It happened: one
branch added two top-level keys while another added the warning, the two edits
never touched as text, git merged both cleanly, and only building a deck that
used both found it.

Its scan is the interesting part. `build.js` reads a frontmatter key three
structurally different ways, and one of them – `viewDefaults()`'s loop over
`VIEW_DEFAULT_SPEC` – is a *computed* read, so no grep at the read site can
ever see those seven names. A fourth path is not a read at all: the cover
spreads the whole block into `renderTitleBlock`'s destructured parameter list,
which is the only place `subtitle` is named. The obvious grep finds 23 of the
31. The gate asserts the size of what it found before comparing anything,
because a scan that silently finds nothing passes every comparison and guards
nothing – and it earned that on its first run, reporting `bodyHtml` as a
frontmatter key because the call site writes that argument in shorthand.

**`image-refs` is the second gate that is not about figures**, and the same
shape again: two readers in `build.js` over one set. `scanReferencedImages`
decides what the per-image inline cap refuses; `collectImageRefs` decides what
`--optimize-images` can convert. They were two regex sets in one file and only
one of them knew `::: backdrop`, `cover-image:` and `closing-image:`, so a
keynote whose only oversized assets were a backdrop and a cover photograph was
refused by the build with a message recommending `--optimize-images`, and that
verb answered "Nothing to do" about the very files the build had just refused.
The gate asserts the collector's output, the rewrite that follows a conversion
in all four spellings of a path, and – the one that drifts – that both readers
go through the collector rather than matching a form themselves.

**`inlined` is about two characters and twelve literals.** A raw backtick ends
the literal; a single-backslash regex escape is eaten by the literal and
therefore ships. It checks **all twelve** literals – a number worth checking
against the gate's own note when you add one. It recognised seven until the five
holding inlined markup, the likeliest place of all to write a backtick beside a
button, turned out to open with a tag on the same line and be skipped.

**Why `semantics` exists**: a green `accepts` once hid a sequence `<->` that
parsed and drew one arrowhead. Parsing is not meaning.

**Why the gates lint as well as build**: a check that reaches the compiler
through a browser page reaches only the build. Two `lint.js` gaps sat behind
assertions in `figure-labels.mjs` until they were moved here, where every
fixture is compiled *and* linted.

## The browser suite: four families

**Navigation** – `nav`, `nav-cockpit`. The navigation model. `demo` sits
beside them: the two windows handing a live demo across, over both transports.

**The geometry the live chrome leaves the slide** – `expansion`, `marginalia`,
`annotation` (the note typed with `N` fills the frame, sized from its text, with
a QR code for an address, and in the cockpit fills the stage rather than the
window), `touch-rail`, `math-focus`, `block-align`, `auto-fit`, `text-select`
(what a pointer gesture means while Alt is held).

**The editor** – the `editor-*` specs: its gestures, its panel, and the
neighbour-alignment guides, which are what a gesture snaps to.

**The figures** – the `figure-*` specs, which measure the SVG.
`figure-framing` catches a drawing sitting off-centre in an oversized frame;
`figure-labels` measures where an aligned label lands inside the thing that
holds it; `figure-sequence` asserts that nothing in a `sequence` overlaps
anything else in it and that its generated names are the documented ones.

### Why the geometry family exists

Three specs say it, each recording a bug that shipped:

- **`expansion`** – the camera framed an open expansion by centring the pane and
  cropping the slide it belongs to.
- **`touch-rail`** – the cockpit rail sat on 82% of the notes pane.
- **`marginalia`** – the aside overflows the chunk on purpose, the width probe
  counted that overhang as a slide being cut off, and the type on every
  marginalia chunk was walked down to the 0.6 floor. That reads as a design
  decision until you put the slide next to its neighbour, so the spec compares
  against another chunk of the same deck rather than against a number.

All three survived review because a screenshot of the thing you were looking at
is fine. **They assert the property and never a coordinate.**

`touch-rail` opens its own browser context: the rail lives behind
`@media (pointer: coarse)` and `openDeck`'s has a fine pointer, so in the default
context the bar is not in the document and a measurement of it reports no
overlaps among no buttons.

### The eight specs that build a deck of their own

Three different reasons, and the third is the one to remember.

**Because the property is about two windows** – `cue-cards` opens the cockpit
from the projection with `S` on a fixture and, after every Space and
Backspace, reads `revealed` and `activeIdx` in both: the cursor in front of
the counter exists so that the room never learns the cards do. The same
fixture carries the parser's note-position rule, read off the built page,
and lint.js's mirror of it, because both need `parseLecture` and the gates
cannot load it.

**Because nothing that ships can reach the case** – `math-focus` (no lecture has
a two-row display formula), `side-anchor` (nothing writes `::: side {.middle}`
yet) and `beats-nested` (no lecture puts a `---` inside a pane, a card row or an
overlay yet, and the assertion is a six-beat *sequence* mixing nested and
top-level markers, which only a deck written for it has) and `dock` (no lecture
writes a `::: dock`, and the claims are geometry: the column and the text share
no pixel, the dock reaches the frame, `from N` moves nothing, auto-fit holds
beside a slide-high column).

**Because the thing is only legible as a pair** – `block-align` shows the same
content centred and left, and `cards` two cards differing in one character.

**Because a spec that hunted its shapes in a real deck would break the next time
that deck was edited** – `squint`, whose four shapes (a promoted bold, a reveal
segment, a `::: slide` block, a chunk that is only a backdrop and an overlay)
exist in the corpus but never six chunks apart. `squint` also drives no page
itself: the command drives its own browser and the spec asserts on the file that
comes out.

**That third reason is the pattern to reach for when a spec needs a shape the
lectures do not have**, and `editor-guides` is the worked example.

`#look` in `lectures/diagrams` was one catalogue figure six rows tall, and four
specs measured it: `figure-prominence`, `editor-aim`, `editor-guides` and
`editor-drag-guides`. When each row moved to the slide that explains it - a room
cannot hold "the bottom row of the catalogue" - three of the four only needed
repointing at the new chunk. `editor-guides` did not, because two of its
sections need *a shape* rather than a chunk: three elements collinear on a bare
`at`, so a drag along that axis has a `between a,b` to propose and a nudge
across it has a `.cx` to snap back to. `#look` had that shape by accident, being
tall; nothing was ever going to keep it. So the spec builds it.

**The trap inside that fixture is worth knowing before you write another one.**
`dgeGuidePairs` in `editor.mjs` only pairs elements that are *already related* -
the two ends of an edge, the outer members of an `align` or `spread`, or a node
and the element its relative placement names. Boxes on bare `at` coordinates
produce no pairs at all, and therefore no `between` candidate, however neatly
they line up. The fixture's `b` is written `below a` for that reason alone. Two
browser runs were spent guessing at this before anyone read the function.

## Running it

The runner builds and serves the lectures itself, so it never reports on stale
HTML, and launches one Chromium for the whole run (`$PSI_CHROME`, else the
Playwright cache, else system Chrome).

Run it after touching `AUDIENCE_JS`, the key map, `editor.mjs`,
`createSpanTable`, or anything that moves a label or an extent.

**`no page errors` is asserted by the runner after every spec**, not by each
spec: it is an invariant of running one at all, and the one spec that forgot the
line swallowed console errors for as long as it existed.
