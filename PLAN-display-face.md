# A display face for covers and dividers

A lecture can already choose its serif, its sans and its mono. What it cannot
do is give the **transition slides** – the cover and the section dividers – a
typeface the rest of the deck never uses. That is the one place in a deck where
a loud face is not a mistake: nobody reads a divider, they recognise it.

This plan adds a **fourth font role**, `display`, and two selectors that use it.
Everything else follows from the roles machinery that is already there.

## The two properties the brief fixes

1. **Ordinary chunk headings are untouched.** The display face reaches exactly
   two selectors. A `## principle:` heading is not one of them.
2. **No reader keystroke can reach it.** `F` cycles the body font role and `A`
   cycles the colour theme. The display face is immune to both, and each for
   its own reason – see *Why nothing has to be written to make that true*.

Scope decided with the author: **`cover:` and `section:` only.** Not `closing:`
and not `outline:`.

> `closing:` shares its renderer *and its class* with the cover – a closing
> slide is `.chunk-title[data-closing]` (build.js:6883). So excluding it is one
> `:not([data-closing])` rather than a new element, but it is a decision a
> reader will see: a deck that opens and divides in Anton and closes in
> Literata reads as an oversight unless it is deliberate. Worth a second look
> once the first deck is built; `closing-display: cover | none` is the key it
> would take, in the shape `closing-image:` already established.

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
face carries three words and no bold, so the axis buys nothing – and 14 of the
26 candidates have no variable build at all. Anton *is* one weight; that is
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
.chunk-title:not([data-closing]) .title-main,
.chunk-section .section-heading { font-family: var(--display-stack, var(--body-font)); }
```

Print takes it too: a divider in the handout should be the divider from the
room. `.title-subtitle` deliberately stays in the serif – the subtitle is a
sentence, and a poster face set at sentence length is where these faces fail.

**3 – the refusals.** `fonts: {display: …}` naming an unknown family fails the
build the way an unknown serif does, and `lint.js` mirrors it. The linter
mirrors `bundledNamesFor('display')` as a table, which is the established
tables-only bend.

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
- **`closing-display:`**, per the note above.

## The dependency cost, stated plainly

The engine can only offer a face it has. Twenty-odd `@fontsource` packages as
`dependencies` means **every `npm install` of psi-slides pulls them** – measured
at **12 MB on disk for all 26**, since each package ships every subset and
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
