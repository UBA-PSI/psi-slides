# The two test suites, and which one a thing belongs in

Two suites, split by one question: **can this be decided without a browser?**

- **`test/gates/`** – everything about the figure language that can. Six gates,
  440 assertions, under a second, no browser and no `npm install`. Run by
  `gates.yml` on push and pull request.
- **`test/`** – the things that only break in a built page. 33 specs, ~834
  assertions, about five minutes, one Chromium for the whole run.

`npm test` runs the gates first, so a compiler regression fails in a second
rather than in four minutes.

Anything checkable without a browser belongs in `lint.js`, where it runs on
every commit, or in `test/gates/`, where it runs on every push. The browser
suite is not a unit-test suite.

```bash
npm run gate                        # all gates
node test/gates/run.mjs semantics   # gates whose name matches
node test/run.mjs                   # all specs
node test/run.mjs nav               # specs whose name matches
```

## The gates: six contracts

Both `diagram-core.mjs` and `lint.js` are zero-dependency, which is what makes
this suite runnable with nothing installed.

| gate | the contract |
| --- | --- |
| `refusals` | build and lint agree on what is refused |
| `accepts` | every construct still parses |
| `semantics` | the emitted SVG *means* what the source says, plus what the source means to the editor that rewrites it – the span table |
| `corpus` | every `::: draw` block in the repository still compiles |
| `step-classes` | which classes a beat can carry, derived from `DG_STEP_FIXED` rather than restated |
| `inlined` | the two characters that mean something else inside build.js's own template literals |

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

**Navigation** – `nav`, `nav-cockpit`. The navigation model.

**The geometry the live chrome leaves the slide** – `expansion`, `marginalia`,
`touch-rail`, `math-focus`, `block-align`, `auto-fit`, `text-select` (what a
pointer gesture means while Alt is held).

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

### The five specs that build a deck of their own

Three different reasons, and the third is the one to remember.

**Because nothing that ships can reach the case** – `math-focus` (no lecture has
a two-row display formula) and `side-anchor` (nothing writes `::: side {middle}`
yet).

**Because the thing is only legible as a pair** – `block-align` shows the same
content centred and left, and `cards` two cards differing in one character.

**Because a spec that hunted its shapes in a real deck would break the next time
that deck was edited** – `squint`, whose four shapes (a promoted bold, a reveal
segment, a `::: slide` block, a chunk that is only a backdrop and an overlay)
exist in the corpus but never six chunks apart. `squint` also drives no page
itself: the command drives its own browser and the spec asserts on the file that
comes out.

**That third reason is the pattern to reach for when a spec needs a shape the
lectures do not have.** It is not hypothetical: splitting the `#look` drawing in
`lectures/diagrams` across slides took four specs down at once
(`figure-prominence`, `editor-aim`, `editor-guides`, `editor-drag-guides`), all
of which measure that one figure. The drawing was restored and only its prose
moved. A fixture deck is cheaper than re-deriving four specs' geometric
premises – see the note on `#look` in `CLAUDE.md`.

## Running it

The runner builds and serves the lectures itself, so it never reports on stale
HTML, and launches one Chromium for the whole run (`$PSI_CHROME`, else the
Playwright cache, else system Chrome).

Run it after touching `AUDIENCE_JS`, the key map, `editor.mjs`,
`createSpanTable`, or anything that moves a label or an extent.

**`no page errors` is asserted by the runner after every spec**, not by each
spec: it is an invariant of running one at all, and the one spec that forgot the
line swallowed console errors for as long as it existed.
