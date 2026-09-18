# The overlap census is blind to a line struck through by an outline

Written from a measured case, not a suspicion. `lectures/network-security`
`#ns-a41` shipped for the length of this branch with its verification block
printed across the bottom outline of the box above it, and the build said
nothing. A critic's pass over the rendered frames found it; `--check-fit`,
`lint.js` and `npm run gate` were all green on it.

## What the census does today

`dgOverlapWarnings` in `diagram-core.mjs` (around line 7576) compares every
pair of authored nodes at every beat both are visible, skips containment, and
reports a pair that overlaps at *every* such beat. It carries two tolerances:

```js
const DG_OVERLAP_TOL = 2;        // px, between two drawn shapes
const DG_OVERLAP_TOL_TEXT = 24;  // px, where either side is a text's line box
```

The 24 is not arbitrary and the comment above it says why: a `text`'s box is
the **line box**, which carries the font's leading above and below the glyphs
and draws no outline, so two correctly-spaced captions overlap by most of a
line's leading with clear air between the words. Two real false positives are
named there, 63x16 and 5x19.

## The two halves of the blind spot

Measured on a three-chunk repro deck, painted at 1600x900 and read back out
of the browser (`viewBox` width against the painted width gives the scale):

| case | painted overlap | figure scale | compiler px | reported |
| --- | --- | --- | --- | --- |
| text across a box's bottom edge | 145 x 28 | 1.9 | 76 x 14.7 | no |
| text further into the box | 145 x 45 | 1.9 | 76 x 23.7 | no |
| two boxes | 57 x 46 | 1.9 | 30 x 24 | yes |

1. **The tolerance is applied to both axes, and the defect is one-axis by
   construction.** A text crossing a box's horizontal edge intersects it by a
   fraction of one line's height. That is *the* shape of "a label struck
   through by an outline", and a 24 px floor on the vertical axis is more than
   a line's ink, so the geometry the check exists for is the geometry it
   cannot see. `#ns-a41` was 14.7 compiler px on that axis.

2. **The px are the compiler's, not the room's.** A figure is scaled to fill
   its canvas, and since the fixed canvas landed that scale is usually above
   1. At 1.9x the effective tolerance on the projection is 46 px - three lines
   of figure label. The author reading the word "px" in the message reads it
   as the px they can see.

## The fix to make

**Measure ink on both sides, then one small tolerance serves.** A text's
leading is known at layout time: inset its box by the half-leading top and
bottom (line box height minus the glyph height, split) before intersecting,
and compare at `DG_OVERLAP_TOL`. That deletes `DG_OVERLAP_TOL_TEXT` rather
than tuning it, and it is the same move the canvas reports made when they
stopped rounding away what they measured.

Required of the change, in this order:

- The two false positives the comment names must stay silent. They are the
  reason the 24 exists and they are the acceptance test, not a footnote.
  Find them (`bob`/`goals`, `intro`/`lreq`) and keep them out.
- `#ns-a41` reverted to its struck-through geometry must warn. The geometry
  is in `git show 45a0ee5^:lectures/network-security/source.md`.
- No figure in `lectures/{tutorial,diagrams,decoration,network-security,
  python-intro,spoken-talk}` nor in the keynote may gain a warning. All six
  build clean today; a new warning is either a real find, to be reported and
  redrawn, or a regression.
- A gate under `test/gates/`. Geometry is decidable without a browser, so
  this belongs there and not in the browser suite.

## Secondary, decide separately

The message says "overlap by 76x15 px" about a thing the room sees as
145x28. Either scale the reported figure or say what the number counts. The
canvas reports already solved the same problem by naming both units.

## What else that pass turned up, not in this slice

- **`#ns-b22` sets its labels at 13.2 px against 28.4 px of body type**
  (0.46x, the smallest on the drawing 10.5 px). Pre-existing, reported by
  `--check-fit` as a note, and the one figure in the deck still behind its
  own slide. It needs redrawing, not an engine change.
- **`dim` is an opacity, so anything behind a dimmed box shows through it.**
  `#ns-b05` dimmed two filter boxes and the wire behind them struck the word
  standing in them. The fix in the deck was to take the accent off by name
  (`style fwd, fws {!tone-4 !emph}`) instead. Whether `dim` should keep its
  fill opaque is a design question worth asking once.
- **A text fully inside a box is exempt, a text crossing its edge is not.**
  Correct, and it surprises an author shrinking a figure: captions that were
  inside start being reported. Worth one sentence in the figures skill.
