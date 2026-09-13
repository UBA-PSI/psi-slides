# A display face for covers and dividers

A lecture can already choose its serif, its sans and its mono. What it cannot
do is give the **transition slides** – the cover, the closing slide and the
section dividers – a typeface the rest of the deck never uses. That is the one
place in a deck where a loud face is not a mistake: nobody reads a divider,
they recognise it.

This plan adds a **fourth font role**, `display`, and two selectors that use it.
Everything else follows from the roles machinery that is already there.

## The two properties the brief fixes

1. **Ordinary chunk headings are untouched.** The display face reaches exactly
   two selectors. A `## principle:` heading is not one of them.
2. **No reader keystroke can reach it.** `F` cycles the body font role and `A`
   cycles the colour theme. The display face is immune to both, and each for
   its own reason – see *Why nothing has to be written to make that true*.

Scope decided with the author: **`cover:`, `closing:` and `section:`.** Not
`outline:`.

> `closing:` shares its renderer *and its class* with the cover – a closing
> slide is `.chunk-title[data-closing]`. Excluding it would have been one
> `:not([data-closing])`, and the draft of this plan did exclude it; the
> author decided against, because a deck that opens and divides in Anton and
> closes in Literata reads as an oversight unless a reader is told it is
> deliberate. So the three transition slides wear one face and there is no
> key to turn it off on one of them.

## Why nothing has to be written to make it immune to F and A

This is the part worth getting right before any code, because both immunities
are free if the variable is named correctly and both are bugs if it is not.

- **`F` cycles a variable, not a family.** `body[data-font=sans]` re-points
  `--body-font` (build.js:8016–8019), and both target selectors currently
  inherit it: `.chunk-section .section-heading` sets `font-family:
  var(--body-font)` outright (build.js:10746), and `.title-main` sets no family
  at all, so it inherits the same one. Pointing them at `--display-stack`
  instead takes them out of the cycle **by construction** – there is no rule to
  write that says "F does not apply here", and therefore no rule that can be
  forgotten when a fourth body font is added later.
- **`A` only re-points colour tokens.** `applyFontTheme` sets `data-theme` and
  `data-mode`; no theme touches a family. So the face is already immune and
  its *colour* still follows `--ink` / `--emph`, which is what keeps a divider
  readable when the reader switches to a dark theme.

The corollary is the rule to keep: **`display` must never join `FONT_CYCLE`,
and `--display-stack` must never be assigned under a `body[data-font=…]` or
`body[data-theme=…]` selector.** One line in the roster comment.

## The role, and how it differs from the other three

| | serif / sans / mono | display |
| --- | --- | --- |
| resolves when the deck says nothing | yes, from `BUNDLED_DEFAULTS` | **no – nothing is embedded** |
| appears in `FONT_CYCLE` (`F`) | yes | never |
| must be a variable latin subset | yes | **no** |
| stack tail if the face is missing | a real fallback chain | the sans stack |

Two of those rows are the whole design.

**A deck that names no display face is byte-identical to today.** The role
resolves to nothing, no `@font-face` is emitted, `--display-stack` is never
defined, and the two selectors fall back to `var(--body-font)` through the
custom property's own fallback – `font-family: var(--display-stack,
var(--body-font))`. No attribute, no second code path, and no rebuild of the
tracked lecture outputs.

**The variable-subset rule is bent deliberately.** `BUNDLED_FONTS` requires a
variable latin subset, and the comment gives the reason: a text face needs a
weight axis because `topic-bold` puts bold fragments on every slide. A display
face carries three words and no bold, so the axis buys nothing – and 21 of the
32 candidates have no variable build at all. Anton *is* one weight; that is
what Anton is. The rule stays for the three text roles and the display roster
records why it does not apply.

## Slices

**1 – the role.** `BUNDLED_FONTS` entries with `role: 'display'`; the three
loops over `['serif','sans','mono']` (`bundledFaces`, `bundledRoster`,
`FONT_ROLE_VARS`) learn a fourth role that may be absent. `FONT_ROLE_VARS.display
= ['--display-stack']`. No `BUNDLED_DEFAULTS` entry – that absence is the
feature.

**2 – the two selectors.** In `AUDIENCE_CSS` and again in `PRINT_CSS`:

```css
.chunk-title .title-main,
.chunk-section .section-heading { font-family: var(--display-stack, var(--body-font)); }
```

Print takes it too: a divider in the handout should be the divider from the
room. `.title-subtitle` deliberately stays in the serif – the subtitle is a
sentence, and a poster face set at sentence length is where these faces fail.

**Where the block is emitted moved during the build.** Not into `AUDIENCE_CSS`
and `PRINT_CSS`, which are constants with no way to ask whether this lecture
resolved a display face: a rule naming `--display-stack` in either of them
would move every existing output's bytes for a variable nothing sets. It goes
into `fontStyleTag`, beside the `@font-face` and the `:root` line it depends
on, which makes the three emissions one condition and serves all four views
at once.

**And the size correction is a `size-adjust` descriptor, not a font-size
multiplier.** These faces disagree about advance width by a factor of three
(Press Start 2P against Amatic SC) while the cover's type size is tuned for
Literata, so a headline runs off the slide without one – observed in the
playground, not hypothesised. `tools/font-playground/scales.json` holds the
measured multiplier per package and each `BUNDLED_FONTS` entry carries it as
`sizeAdjust`, a percentage on the face itself. On the face, six cover
compositions, print, the zoom, `auto-fit` and `--check-fit` all get it for
free; as a multiplier in a layout rule it would have to be repeated in every
one of those and would be forgotten in one.

**3 – the refusals.** `fonts: {display: …}` naming an unknown family fails the
build the way an unknown serif does, and `lint.js` mirrors it. The linter
mirrors the display half of `BUNDLED_FONTS` as a table – name and `kind` –
which is the established tables-only bend, and `kind` buys a second finding
with it: `display-pairing`, a warning that a display serif over a serif body
reads as one typeface set badly rather than as two. A third, `display-no-eszett`,
falls out of the same table: one face in the roster has no ß.

**4 – `lectures/decoration/`.** The construct shown rather than described, and
its two tracked views rebuilt.

## Deferred, and named so it is not forgotten

- **A colour of its own for the transition slides.** The brief asks for a look
  "via font/farbe" and this plan only does the font half. The colour half is a
  `style:` key (`section-ink`, or a divider that inverts), and it is separable:
  a display face is visible without it. Worth building second, against a real
  deck, rather than guessed at now.
- **Subsetting to the glyphs actually used.** A cover and four dividers are
  perhaps sixty distinct characters, and the faces here are 7–77 KB for a full
  latin subset. Cutting that needs a woff2 subsetter in the build, which is a
  dependency this tool does not have. Not worth it at a median of 18 KB.

## The dependency cost, stated plainly

The engine can only offer a face it has. Thirty-two `@fontsource` packages as
`dependencies` means **every `npm install` of psi-slides pulls them** – measured
at **11.9 MB on disk for all 32**, since each package ships every subset and
weight while the build reads exactly one file. Nothing reaches an *output*
that does not name a face, so the promise of a mailable HTML file is untouched.
If 12 MB of install is judged too much, the alternative is the mechanism that
already exists: a display face is a file in `fonts/` beside `source.md`, and
the bundle carries only a handful.

## Verification

- `node lint.js lectures/` clean; a typo in `fonts: {display: …}` refused by
  both `build.js` and `lint.js`.
- **Byte-identical**: build `lectures/tutorial` before and after and `diff` all
  four views. A deck that names no display face must not move one byte.
- `F` pressed through all three body roles on a deck *with* a display face: the
  cover and the dividers do not change; the prose does.
- `A` pressed through all seven themes: the face does not change and the
  divider stays readable on the three dark ones.
- `--check-fit` at 1600×900 on a deck set in Anton and again in Press Start 2P –
  a display face is exactly the thing that puts a headline outside the frame.
