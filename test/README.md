# The two test suites, and which one a thing belongs in

Two suites, split by one question: **can this be decided without a browser?**

- **`test/gates/`** – everything about the figure language and the `{…}` tail
  grammar that can. Ten gates, under a second, no browser and no
  `npm install`. Run by `gates.yml` on push and pull request.
- **`test/`** – the things that only break in a built page. 40 specs, ~1,100
  assertions, about nine minutes, one Chromium for the whole run. One of
  them, `souffleuse`, starts an engine of its own beside that browser – see
  below.

`npm test` runs the gates first, so a compiler regression fails in a second
rather than in four minutes.

Anything checkable without a browser belongs in `lint.js`, where it runs on
every commit, or in `test/gates/`, where it runs on every push. The browser
suite is not a unit-test suite.

A third place exists and is deliberately not one of these two: `desktop/test/`
holds the desktop app's own tests, run by `npm test` inside `desktop/` and by
`desktop.yml`, never by `npm test` here. What it guards is the app's reading
of `--events`, its settings file and its window, none of which a lecture
depends on.

```bash
npm run gate                        # all gates
node test/gates/run.mjs semantics   # gates whose name matches
node test/run.mjs                   # all specs
node test/run.mjs nav               # specs whose name matches
```

## The gates: ten contracts

`diagram-core.mjs`, `tails.mjs`, `cue-cards.mjs`, `souffleuse.mjs` and `lint.js`
are all zero-dependency, which is what makes this suite runnable with nothing
installed. Ten gates, 884 assertions, under a second.

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
| `souffleuse` | the live prompter's pure half in `souffleuse.mjs`: the deck payload built off a hand-made `lecture`, the byte-stable system prefix, the tick message, the answer parser, the drift arithmetic and every row of the restraint policy |

**`inlined` is about two characters and twelve literals.** A raw backtick ends
the literal; a single-backslash regex escape is eaten by the literal and
therefore ships. It checks **all twelve** literals – a number worth checking
against the gate's own note when you add one. It recognised seven until the five
holding inlined markup, the likeliest place of all to write a backtick beside a
button, turned out to open with a tag on the same line and be skipped.

**Why `semantics` exists**: a green `accepts` once hid a sequence `<->` that
parsed and drew one arrowhead. Parsing is not meaning.

**Why `souffleuse` is a gate and not a browser spec.** The prompter's one
requirement is restraint, and restraint is the half of the feature that no
rehearsal can show you: a talk where nothing came is indistinguishable from a
talk where nothing was due. So the policy lives in code rather than in the
prompt, and every row of its table – twelve words, one hint at a time, the
cool-downs, the duplicate rule, the opening silence – is decided here, with no
key, no socket and no microphone. What the model judges is the model's; what
the code permits is checkable, and this is where it is checked.

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

### The nine specs that build a deck of their own

Four different reasons, and the last two are the ones to remember.

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

**Because the property spans three processes** – `souffleuse` is the only spec
that starts an engine of its own: `node build.js … --watch --serve
--souffleuse --events`, with a fake OpenRouter on loopback that the sidecar
reaches through `OPENROUTER_BASE_URL` and a fake `webkitSpeechRecognition`
installed into the page. The gate decides the prompter's restraint without a
network; what only a running system can say is whether the three halves are
wired to each other – an ear in the browser, a key in Node, one socket
between them – and whether the projection stays ignorant of all of it. Its
deck is its own because a cue is laid into a slide *still to come*, so the
slide order has to be known, and because the request body is asserted against
the deck's own chunk ids. **It moves the clock rather than waiting it out**:
the opening silence is 60 s and the cadence 25 (10 here, the floor of
`SOUFFLEUSE_SPEC`), so `window.__stt.final(text, 70)` pushes the cockpit's
`tStart` back seventy seconds and the same arithmetic runs at once. Without
that the spec would be two minutes of sleeping; with it the whole thing is
about eight seconds, most of which is the build.

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
