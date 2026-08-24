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
| `figure-rules/source.md` | a psi-slides lecture whose only job is to be compiled: the twenty-three figures the page teaches with, including two that step |
| `refresh-figures.mjs` | rebuilds that lecture and puts every generated region back into the page |

## What the script owns

Run it after any change to the lecture, to `build.js`, or to
`lectures/network-security/source.md`:

```bash
node docs/artifact/refresh-figures.mjs           # rebuild and splice
node docs/artifact/refresh-figures.mjs --check   # report drift, write nothing (exit 1 on drift)
```

It replaces, keyed by markers in the HTML:

- **Twenty-one still figures** &ndash; the six tutorial steps, the wrong/right
  pairs and the tone row, taken from a `--print-only` build.
- **Two figures that step** &ndash; drawing, per-beat geometry, the list of beat
  names under it and its source, taken from an `--audience-only` build, which is
  the only pass that emits the geometry.
- **The diagram runtime**, inside `<script id="psi-dg-runtime">`, copied
  unchanged from the same build. The page steps its figures with the code a
  projected lecture ships rather than a second implementation that could
  disagree with it.
- **Fifteen gallery sources**, read out of `lectures/network-security/source.md`,
  with the line count shown in each card.

Everything else &ndash; prose, layout, CSS, and the short script under the
runtime that wires up the buttons &ndash; is hand-written and safe to edit.

The chunk ids in the lecture are what the script looks figures up by: `#b1`,
`#r1w`, `#tones`, `#beats-demo`, and so on. Rename one in the lecture without
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
