# Display-face playground

A page that draws a cover and a section divider in each candidate face for the
**display role** – the typeface a `cover:`, a `closing:` and a `section:` slide
use for their headline, and that nothing else in the deck touches.

```bash
cd tools/font-playground
npm install
node measure-scale.mjs           # re-measure the size correction (needs Chrome)
node build-playground.mjs        # writes font-playground.html beside this file
open font-playground.html
```

32 faces, **OFL-1.1 only**, in three flavours: 6 hand, 8 machine, 18 graphic
(8 serif, 10 sans).

## Why it is its own package

Thirty-odd candidate faces are an exploration, not a dependency of the engine.
Keeping them here meant `npm install` at the root stayed untouched while the
roster was being decided. `desktop/` is the same arrangement for the same
reason. *(The faces that survived are now engine dependencies as well; this
package is what the next revision of the roster is done in.)*

## Why every face is embedded

The page inlines each candidate as one latin `woff2`, base64, in an
`@font-face` – exactly what the build does. A page that linked Google's CDN
would be showing a face the built HTML would not have, and would hide the
number that decides half of these candidates: **the KB on each card is what a
deck naming that face carries in every view.** The body type behind the
headlines is the deck's own Literata and IBM Plex Sans, read out of the
engine's `node_modules`, so what is compared is the pairing rather than the
face alone.

## The three fields `roster.mjs` decides

Family, licence, attribution and subsets are read from each package's
`metadata.json`. What the roster decides is what a package cannot answer:

**`file`** – which file of the package is the one face to embed. A variable
family ships one per axis set (Fraunces had six) and only one is the axis a
title line varies on.

**`flavour` and `kind` are two fields, and Chakra Petch is why.** Flavour is
what a face looks like and it sorts the page; kind is what a face *is* and it
drives one rule – a display serif over a serif body reads as one typeface set
badly rather than as two. Chakra Petch is a machine to look at and a sans to
pair with. The playground draws each candidate over its paired body face, so
the rule is visible rather than asserted, and `lint.js` warns on
`display-pairing` when a deck does the opposite.

**`scale`** – a measured multiplier, from `measure-scale.mjs`: the advance
width of a real German title against Literata's, clamped to [0.55, 1.45].
These faces disagree about width by a factor of three – Press Start 2P is
2.10× Literata, Amatic SC 0.62× – and the cover's type size is tuned for the
body serif, so without the correction a headline simply ran off the slide.
In the engine the number rides as a `size-adjust` descriptor on the
`@font-face` rather than as a multiplier on a font-size, so it reaches all ten
cover compositions, print, the zoom and `auto-fit` without any of them knowing
about it. Re-measure when a face is added: a number nobody measured is a
number that silently overflows a slide, which is the same discipline
`dgCharW` in `diagram-core.mjs` is held to.

## What the page checks that an eye cannot

Each card carries a **`no <chars>` badge** for the German characters the face
lacks. The probe was wrong twice before it was right, and both mistakes are
worth knowing because both look like success:

1. **Measuring before the faces load.** A face the page has not finished
   loading measures as its fallback, so the first cut reported all 26 then-
   candidates as having no umlauts while the page plainly drew *Wer hört*.
   `document.fonts.ready` alone does not cover a family used only in canvas;
   each family has to be asked for by name with `document.fonts.load()`.
2. **Comparing against one fallback.** Equal widths were read as a miss, which
   flagged Pixelify Sans – whose advance happens to equal the fallback
   monospace's. The fix is two fallbacks of different widths: a glyph the
   candidate has is drawn by the candidate either way and the widths agree; a
   glyph it lacks is drawn by whichever fallback is behind it, and they do not.

The one real finding, confirmed against a rendered specimen rather than trusted
from the probe: **Rubik Mono One has no eszett**, and draws it from the
fallback mid-word. It also draws lowercase as capitals.

*The method's limit, since it is not obvious: it cannot see a missing CJK
glyph, because both generic fallbacks resolve CJK through the same system
font. For the latin characters this page asks about, they differ.*

## The controls

| control | what it answers |
| --- | --- |
| the four text fields | does it hold *my* title, not a specimen's |
| `both` / `cover` / `divider` | one slide across the whole card, for a close look |
| `hand` / `machine` / `graphic` | the three flavours the brief named |
| `dark ground` | the divider is where a deck most often goes dark |
| `caps` | several of these faces only work set in capitals |
| headline size, tracking | a face that needs tracking is not a face that has it |
| weight | variable candidates only; the statics ignore it |

Click any slide to enlarge it, Escape to close. The slides are sized in `cqw`
inside a container query, so a card and the blown-up stage are one slide at two
sizes – a display face judged at one size is not judged.

## What was cut, and why

- **Apache-2.0** – Permanent Marker, Rock Salt, Just Another Hand. Not because
  the licence forbids embedding; it does not. Because `bundledFaces()` emits
  OFL text with the faces, and a second licence regime in that path buys one
  typeface at the price of a special case. Caveat Brush is the loud marker
  instead.
- **Playfair Display, Fraunces, Major Mono Display** – the author's call.
  DM Serif Display, Prata, Young Serif and Yeseva One took the serif slots.
