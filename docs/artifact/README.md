# figures-you-write.html

A standalone page that teaches `::: diagram`, the figure language described in
CLAUDE.md under *Animated infographics*. Open it in a browser; it needs no
server and fetches nothing but its two Google Fonts stylesheets.

It is written by hand, but several regions of it are produced by a script and
must not be edited in the HTML.

## What is in this folder

| | |
|---|---|
| `figures-you-write.html` | the page |
| `figure-rules/source.md` | a psi-slides lecture whose only job is to be compiled: every figure the page teaches with, including four that step |
| `refresh-figures.mjs` | rebuilds that lecture and puts every generated region back into the page |

## What the script owns

Run it after any change to the lecture, to `build.js`, or to
`lectures/network-security/source.md`:

```bash
node docs/artifact/refresh-figures.mjs           # rebuild and splice
node docs/artifact/refresh-figures.mjs --check   # report drift, write nothing (exit 1 on drift)
```

It replaces, keyed by markers in the HTML:

- **Forty-four still figures** &ndash; the six tutorial steps, the twenty
  wrong/right drawings, the tone row, the thirteen advanced specimens and the
  four still arrangements, taken from a `--print-only` build.
- **Forty-three listings** &ndash; six tutorial steps (with the lines each step
  adds marked by diffing it against the one before), twenty wrong/right
  halves, thirteen specimens and four arrangements. Each is the block its drawing
  was compiled from, so the two cannot disagree. The specimens are stripped of
  their comments and their fence; the four arrangements keep both, because the
  page says they are real source in the number of lines shown, and half a block
  is not that.
- **Four figures that step** &ndash; drawing, per-beat geometry, the list of
  beat names under it and its listing, from an `--audience-only` build, which
  is the only pass that emits the geometry.
- **Fifteen gallery figures**, their fifteen listings and their fifteen beat
  rails, read out of `lectures/network-security/source.md`. The line count
  shown in each card comes from the same read.
- **Six webfaces** &ndash; Literata, IBM Plex Sans and JetBrains Mono, upright
  and italic, read out of `node_modules/@fontsource-variable/` and embedded as
  `data:` URIs, 372 KB of base64. The page fetched them from Google Fonts
  before, which is one request telling a third party who reads the
  documentation of a tool whose whole promise is that its outputs fetch nothing
  at run time. All three are SIL OFL 1.1, which permits the embedding and wants
  the notice to travel along; the notice is emitted above the `@font-face`
  rules. **The `-wght-` file, never the `-opsz-` one**: Literata ships both,
  and the optical size axis is what made a 74px heading arrive as a Didone
  while the lectures showed a text face.
- **The diagram runtime**, inside `<script id="psi-dg-runtime">`, and **the
  compiler's stylesheet**, both copied unchanged from the same build. The page
  draws and steps with the code a projected lecture ships rather than a second
  copy that could disagree with it &ndash; and the stylesheet was a hand-made
  copy once, which is how `.mono` labels went on rendering in the wrong face
  here for a commit after the rule causing it had been fixed.
- **The anatomy diagram** at the top, drawn from the code line it annotates.
  Hand-counted, its brackets were one to four columns too wide and the error
  accumulated along the line.

Everything else &ndash; prose, layout, CSS, and the short script under the
runtime that wires up the buttons &ndash; is hand-written and safe to edit.

The chunk ids in the lecture are what the script looks figures up by: `#b1`,
`#r1w`, `#tones`, `#beats-demo`, `#table-demo`, `#seq-demo`, and so on. Rename one in the lecture without
renaming it in `refresh-figures.mjs` and the run stops with an error, which is
what it is meant to do.

## Two ways this breaks quietly, and the checks that catch them

**A runtime that never ran looks like a design decision.** The attributes
written into a finished diagram describe its last beat, because that is what a
printed copy shows. So a page whose runtime failed to load displays every figure
complete, with nothing in the console and nothing out of place. The first
version of the lift cut the runtime out of the built page by line number; adding
two chunks to the lecture moved it down one line and the slice ended in the
middle of a function. `refresh-figures.mjs` now finds the runtime between
markers and runs `node --check` over it before writing it into the page.

**Two figures with the same id leave one of them blank.** The compiler numbers
figures per document, so figures taken from two separate builds collide, and
every internal reference in the second copy then resolves against the first
one's element. Each figure is given a new prefix from its chunk id, and the
script refuses to write a page whose figure ids are not unique.

## The lecture is a real lecture

`figure-rules/source.md` builds and lints like any other, and CI lints it. A
change to the compiler that would spoil the page's figures therefore fails
there first, where `node lint.js` and the build's own `[diagram]` warnings can
name the line. Its built views are gitignored; run the refresh script rather
than committing them.
