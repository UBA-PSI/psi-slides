# The published artifact

`thirty-six-figures.html` is the page behind
<https://claude.ai/code/artifact/ac8a45da-b35f-4c56-a289-dee703cfab78>.
It is a hand-written page that embeds machine-made parts, and this folder
holds everything needed to rebuild those parts and republish it.

## What is in it

| | |
|---|---|
| `thirty-six-figures.html` | the page itself |
| `figure-rules/source.md` | a psi-slides lecture whose only job is to be compiled: seventeen figures the page argues the layout rules with, plus two stepped demos |
| `refresh-figures.mjs` | rebuilds that lecture and splices every machine-made region back into the page |

## The file is a body, not a document

It starts at `<title>` and ends at the last `</div>`: no `<!doctype>`, no
`<html>`, no `<head>`, no `<body>`. The publishing step wraps it. A browser
opens it from disk perfectly well &ndash; the parser creates the missing
elements &ndash; so it is still previewable with `open`, but do not "fix" the
missing wrapper. Adding one would nest a second `<html>` inside the published
frame.

## What is machine-made, and must not be hand-edited

`refresh-figures.mjs` owns these, keyed by markers in the HTML:

- **Seventeen still figures** &ndash; the wrong/right pairs and the tone row,
  lifted from a `--print-only` build of `figure-rules/`.
- **Two stepped demos** &ndash; figure, per-beat geometry payload, beat rail
  and source, lifted from an `--audience-only` build, which is the only pass
  that emits the payload.
- **The diagram runtime** in `<script id="psi-dg-runtime">`, lifted verbatim
  from the same build. The page steps its demos with the runtime a projected
  lecture ships, rather than a reimplementation that could disagree with it.
- **Fifteen gallery card sources**, read out of
  `lectures/network-security/source.md`, with the line count in each card's
  summary.

```bash
node docs/artifact/refresh-figures.mjs           # rebuild and splice
node docs/artifact/refresh-figures.mjs --check   # report drift, write nothing (exit 1 on drift)
```

Everything else in the file &ndash; prose, layout, CSS, the driver script
under the runtime &ndash; is written by hand and safe to edit.

## Two failure modes worth knowing before you touch it

- **A broken runtime looks like a design decision.** The static attributes in
  an emitted diagram *are* its print state, which is the last beat. So a
  runtime that never ran shows every figure finished, with no error anywhere:
  it reads as a deliberate choice rather than a bug. The first version of the
  lift cut the runtime out of the built page by line number, and adding two
  chunks to the lecture moved it by one line. `refresh-figures.mjs` now finds
  it between markers and runs `node --check` over the slice before writing it.
- **Duplicate ids silently empty a drawing.** The compiler numbers figures per
  document (`dg1`, `dg2`, …), so ids lifted from two builds collide, and every
  `url(#…)` in the second copy then resolves against the first one's element.
  Each figure is re-prefixed from its chunk id, and the script refuses to
  write a page whose figure ids are not unique.

## Republishing

The page is published from a Claude Code session with the Artifact tool,
passing the existing URL so it updates in place rather than creating a second
artifact. Keep the `<title>` and the favicon stable across republishes: readers
find the page in a gallery by both.

## The lecture is a lecture, not a fixture

`figure-rules/source.md` builds and lints like any other. That is the point:
a compiler change that would break the page's figures breaks them there first,
where `node lint.js` and the `[diagram]` warnings can say so. Its built
outputs are gitignored; rebuild with the refresh script rather than committing
them.

**The chunk ids are the contract.** `refresh-figures.mjs` looks figures up by
`#r1w`, `#r8r`, `#tones`, `#beats-demo`, `#move-demo`. Renaming one in the
lecture without renaming it in the script fails the run loudly, which is the
intended behaviour.
