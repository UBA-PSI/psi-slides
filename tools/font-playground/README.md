# Display-face playground

A page that draws a cover and a section divider in each candidate face for the
**display role** – the typeface a `cover:` and a `section:` slide use for their
headline, and nothing else in the deck uses at all.

```bash
cd tools/font-playground
npm install
node build-playground.mjs        # writes font-playground.html beside this file
open font-playground.html
```

## Why it is its own package

26 candidate faces are an exploration, not a dependency of the engine. Keeping
them here means `npm install` at the root is untouched while the roster is
being decided, and only the faces that survive move into the engine's
`package.json`. `desktop/` is the same arrangement for the same reason.

## Why every face is embedded

The page inlines each candidate as one latin `woff2`, base64, in an
`@font-face` – exactly what the build does for a bundled family. A page that
linked Google's CDN instead would be showing a face the built HTML would not
have, and would hide the one number that decides half of these candidates:
**the KB on each card is what a deck naming that face would carry in every
view.** The body type behind the headlines is the deck's own Literata and IBM
Plex Sans, read out of the engine's `node_modules`, so what is being compared
is the pairing rather than the face alone.

## What the page checks that an eye cannot

Each card carries a **`no umlauts` badge** when the face has no `ÄÖÜäöüß`. The
probe measures the string in the candidate against a distant fallback and again
in the fallback alone; equal widths mean every glyph came from the fallback.
It has to wait for `document.fonts.load()` per family first – a face the page
has not finished loading measures as its fallback, and the first cut of this
reported all 26 candidates as missing umlauts while the page plainly drew
*Wer hört*.

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

## The roster

`roster.mjs`, and it carries only what a package cannot answer for itself:
which **file** of the package is the one face a display role would embed, which
flavour it belongs to, and what it is for. Family, licence, attribution and
subsets are read from each package's `metadata.json` at generation time.

Two candidates are Apache-2.0 (Permanent Marker, Rock Salt) where the rest are
OFL-1.1; the generator prints that on every run. Both licences permit
embedding and redistribution, but the engine's licence-text handling currently
assumes OFL, so a roster that keeps either needs that looked at.
