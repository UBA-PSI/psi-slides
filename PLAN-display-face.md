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

**The one thing `size-adjust` does not carry is the line height, and that had
to be built separately.** It scales the glyph outlines and the font's own
metrics, but a *numeric* `line-height` resolves against the nominal font-size
and does not follow: on a cover in Anton at 120%, `font-size` 82.13px and a
90.35px line box hold type that paints at 98.6px. A one-line headline is
merely tight; a three-line German one collides, ö-dots inside the line below.
So `DISPLAY_LH` holds the six numeric line heights the two selectors carry,
the stylesheets interpolate them back into the very declarations they came
from – `'1.1'` emits `1.1`, so no byte moves – and the conditional block
multiplies each by the face's own percentage. It could not be one blanket
rule: three of the six are deliberate (1.3 under `headline: eyebrow`, where
`.title-main` is a small kicker, and the sub-1 ratios under `cover: display`,
where a headline is meant to stack), and the two stylesheets spell
`cover: display` differently while both spellings match in both views, which
is why `fontStyleTag` now takes the view.

**The face follows the loud line, which is not always `.title-main`.**
`style: {headline: eyebrow}` turns a title pair the other way up – the title
is set small as a kicker and `.title-subtitle` carries the weight – so the two
selectors alone put the poster face on the kicker and the body serif on the
headline. Measured on a cover in that mode before the fix: `.title-main` was
Anton at 32px over `.title-subtitle` in Literata at 82px, the exact inverse of
what an author asking for a display face is asking for. The eyebrow pair is
therefore restated under a `body[data-headline=eyebrow]` guard, one rule each
way, with the kicker handed explicitly back to `--body-font` – leaving it out
would leave the unqualified rule still matching it. The scaled line height
moves with the face, and the eyebrow subtitle's own value is not the title's
(1.12 against 1.15 in print), which is why `DISPLAY_LH` holds it separately.
A divider is untouched either way: it has one line, and `headline:` does not
reach `.section-heading`.

**`style: {display-scale: <n>}` is the author's say over the size.** Bounded
0.6 to 1.8 like its two neighbours in `STYLE_SPEC`, default 1, and it
multiplies the face's measured `size-adjust` at the single site that emits the
descriptor – so everything that correction already reaches follows, the line
heights included, without a second place knowing the key exists. The product
is kept to one decimal (62 × 1.4 = 86.8) and stored back on the face, so the
descriptor and the `calc()` read one number and cannot drift by a rounding
step. It could not be `heading-scale`, which does not reach `--title-lead`: a
cover's type size comes from its composition, not from the heading ladder.
**Setting it on a deck with no display face fails the build**, from the
pre-flight so `--print-only` refuses it too, on the rule that already refuses
a `cover-ratio` on a cover which does not divide the slide; `lint.js` mirrors
it as `display-scale-without-face`, since both keys are in the frontmatter it
already reads.

**What normalising on width costs, recorded rather than fixed.** One
multiplier cannot serve both fit and apparent size – a face that is wide per
glyph has to be set small to keep the line count, and then it looks small.
Measured against Literata after the correction, the ink height of a reference
title runs from 0.38 (Silkscreen) to 1.34 (Patrick Hand). Width wins because
the two failures are not equal: a headline that takes one line too many runs
off the slide, a headline that reads small is merely weak. A clamp on the
vertical does not help – pulling Silkscreen to parity puts its width past
twice Literata's. It is also not an all-caps problem: Bebas Neue and
Staatliches, the purest caps faces in the roster, land at 1.00 and 0.90,
because their tall capitals come with no descenders.

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

---

# Build log

Written while building, in the shape `editor.md` §15 uses: what landed, what it
cost, what bit, and what is left. **Read this section first if you are picking
the work up.**

## Where it stands

**The engine half is done and verified. The visible half is not started.**

| commit | what |
| --- | --- |
| `c5c1e07` | the roster: 32 OFL faces, `kind`, measured `scale` |
| `c66441e` | the playground README |
| `73be6a9` | the fourth role, the two selectors, the `lint.js` mirror, a gate |
| `ec86e96` | line height follows `size-adjust` |
| `46c64bb` | under `headline: eyebrow` the face follows the loud line |
| `bb8428f` | the appearance skill and `CLAUDE.md` |
| `2aeb33d` | `style: {display-scale}` |

Green on every check, re-run independently rather than taken from a report:
gates `751 passed, 0 failed`; `node lint.js lectures/` 0 errors and the two
pre-existing `frame-lab` warnings; the tutorial **byte-identical across all
four views** against `main`'s `build.js`, built from the two worktrees rather
than by copying `build.js` (which resolves its runtime files relative to
itself and fails from a scratch directory).

Behaviour verified in a browser, not argued:

- `F` through all three body roles – prose and chunk headings follow
  (Literata → IBM Plex Sans → iA Writer Duo V), cover and dividers stay Anton.
- `A` through all seven themes – cover and dividers stay Anton.
- `headline: eyebrow` – kicker Literata 32px at an unscaled 1.300, loud line
  Anton 82px at 1.320.
- `display-scale` – Silkscreen 62% × 1.4 → `size-adjust:86.8%` and
  `line-height: calc(1.1 * 86.8 / 100)`, the descriptor and the calc reading
  the same number so a rounding step cannot separate them; Anton 120% × 0.8 →
  96% in both. Bounds 0.6 and 1.8 accepted, 0.5 and 1.9 refused. The key with
  no display face refuses in `build.js`, in `--print-only` and in `lint.js`,
  exit 1, no stack trace.

## What is left

1. **`lectures/decoration/source.md`** – the construct shown rather than
   described, and its two tracked views (`audience.html`, `print.html`)
   rebuilt and committed. This is the piece a reader meets first and it is
   entirely unstarted. **A deck has one cover and one divider variant, so it
   cannot show 32 faces**; the same problem the decoration lecture already
   solved for the ten covers by naming the rest in a card row.
2. **`CHANGELOG.md`** under `## [Unreleased]`.
3. **The project site** – `docs/site/` says nothing about the role. Whether it
   should is a judgement: the gallery of ten cover compositions is the
   precedent for showing a roster on the site rather than in a lecture.
4. Consider whether `README.md`'s feature list should mention it.

## What bit, and what the next person should not redo

- **A numeric `line-height` does not follow `size-adjust`.** It resolves
  against the *nominal* font-size, so Anton at 120% put 98.6px of apparent
  type into a 90.3px line box and the descenders of one line landed inside the
  letters of the next. `DISPLAY_LH` is the fix and **three of its seven values
  are deliberately unequal** – 1.3 for the eyebrow kicker, 1.02/0.97 under
  `cover: display`, and in print the eyebrow subtitle carries 1.12 where the
  title carries 1.15. A single overriding rule flattens them. That seventh
  value was found by parsing the stylesheet rather than by trusting a
  hand-written list, which is the only reason print is right.
- **`headline: eyebrow` inverts which line is loud**, so the face has to move
  to `.title-subtitle` *and* `.title-main` has to be handed back to
  `--body-font` explicitly. Left merely unmentioned the unqualified rule still
  matches the kicker, which is what shipped first.
- **Width is normalised, apparent size is not, and that is deliberate.**
  Against Literata's ink height Silkscreen lands at 0.38 and Patrick Hand at
  1.34. Every automatic correction that was tried brings the overflow back:
  pulling Silkscreen's ink to 0.85 needs a scale of ~1.39, at which it sets
  2.2× Literata's width and a headline takes twice the lines. `display-scale`
  is the answer and a cleverer measurement is not.
- **The immunity to `F` and `A` is structural, not enforced.** Nothing says "F
  does not apply here" – the face is out of the cycle because it reads a
  different variable. It breaks silently the moment `display` joins
  `FONT_CYCLE` or `--display-stack` is assigned under a `body[data-font=…]` or
  `body[data-theme=…]` selector.

## Two things left alone on purpose

- **`cover: display` + `headline: eyebrow`** gives the loud line the
  composition's *size* but never its 0.97/1.02 *ratio*, because those sit on
  `.title-main` and no cover composition gives `.title-subtitle` a line-height
  at all. **Pre-existing**, not caused by this work, and not invented around.
- **`auto-fit` defaults to `off`**, so a `cover: display` composition with a
  120% face and a ten-word German title reports one chunk taller than the
  frame under `--check-fit` (exit 0; the pass condition is untouched). Same
  report before this work. `display-scale` is the lever an author has.

## The playground is the roster's editing tool, not a leftover

`tools/font-playground/` is its own package and stays. `roster.mjs` +
`measure-scale.mjs` are where a face is added or a number re-measured;
`scales.json` feeds the literals in `BUNDLED_FONTS`, which are **copied in, not
imported** – the engine must not depend on a tools package. So adding a face is:
roster, re-measure, paste into `BUNDLED_FONTS`, mirror in `lint.js`, and the
gate in `test/gates/tails.mjs` will tell you if you forgot the mirror.
