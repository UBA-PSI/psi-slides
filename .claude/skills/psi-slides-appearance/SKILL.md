---
name: psi-slides-appearance
description: How a psi-slides lecture's look is configured and where those settings live in `build.js` – the bundled webfont roster and the `fonts:` block (including author-supplied files in `fonts/`), the `display` role that gives a cover and a section divider a face of their own and its measured `size-adjust`, `ligatures:`, `lang:` and print hyphenation, the seven themes and `body[data-mode]`, the eleven viewer-default frontmatter keys, the `style:` block including `labels`, `blocks`, `neutrals` / `print-neutrals`, `display-scale`, the look of a bold phrase (`bold`, `print-bold`) and of an inline code span (`code`), the chunk classes that answer `wrap`, `blocks` and `figure-type` for one slide, and the recipe that reproduces the 1.0.0 look. Use when changing the font roster, `BUNDLED_FONTS`, `FONT_ROLES`, `DISPLAY_LH`, `FONT_STACK_TAILS`, `THEME_NAMES`, `VIEW_DEFAULT_SPEC`, `STYLE_SPEC`, `CHUNK_STYLE_CLASSES`, the `style:` block, or their `lint.js` mirrors, or when a lecture renders in the wrong face, theme, default or block alignment.
---

# Type, themes and viewer defaults in psi-slides

Lifted out of `CLAUDE.md` so it loads when the look is the work rather than in
every session. One trap here has teeth well beyond typography: **`dgCharW` in
`diagram-core.mjs` is calibrated to the bundled sans**, so changing the roster
without re-measuring it makes figure labels overflow their boxes in silence.

## Bundled and embedded webfonts

**Three families ship in any one output**, as variable `wght` latin subsets, upright and italic. Which three is now a per-lecture decision rather than a fixed list, and that change is what makes an alternate affordable: the roster used to be a list and every output carried all of it, so adding two more faces would have put ~470 KB in every file including every lecture that wanted neither.

| role | default | alternates |
|---|---|---|
| serif | Literata | Source Serif 4, Bitter, Noto Serif, Roboto Serif |
| sans | IBM Plex Sans | Inter Tight |
| mono | JetBrains Mono | Noto Sans Mono Condensed |

An author names one in the `fonts:` block exactly as they would name a family in `fonts/` – the difference is that **a bundled name needs no file**, which is the point of bundling it. A name that is neither a bundled family nor a file in `fonts/` still fails the build, and the message now lists the bundled names for that role, because typing one of them almost right is the likeliest way to reach it.

**Every text-role entry carries a measured `xHeight`**, the height of a lowercase x as a fraction of the em: 0.507 Literata, 0.492 Source Serif 4, 0.532 Bitter, 0.536 Noto Serif, 0.537 Roboto Serif, 0.516 IBM Plex Sans, 0.546 Inter Tight, 0.550 JetBrains Mono, 0.536 Noto Sans Mono Condensed. It is there so inline code can be sized to bring the mono role's x-height level with the prose face's – at one font-size the two differ by a tenth of an em and the code reads as a shout inside the sentence.
**Re-measure when a face joins the roster or a package ships different bytes**: `node tools/font-playground/measure-xheight.mjs` (needs a Chromium – `$PSI_CHROME`, the Playwright cache, or system Chrome) prints the table, writes `tools/font-playground/xheights.json`, and the numbers are copied into `BUNDLED_FONTS` to three decimals.
`node test/gates/run.mjs xheight` holds the roster and that JSON together and refuses an entry with no number; the display role has no `xHeight` and needs none, since nothing but a headline wears it.

All of them are SIL OFL 1.1, which permits redistribution and embedding; `OFL_NOTICE` puts the required notice in the emitted stylesheet. `bundledFaces(roster)` reads them out of `node_modules` rather than from checked-in binaries: the packages carry their own licence files, and `npm install` is required anyway.

**What has changed here since 1.0.0, and why it is written down.** The sans role was **Inter Tight** in 1.0.0 and became **IBM Plex Sans** in `94ee7bf` (2026-08-25). Tight is the condensed cut of Inter, and the width it saves is paid for in letter spacing that reads cramped on a screen – worst exactly where the type is already small, in figure labels. Measured, Plex's narrow forms (`i l j t`) are 13.5% wider and its digits 9.7%, which is what separates 1 from I from l at the back of a room. Payload went from 276 KB to 279 KB for all six faces. **The mono role has been JetBrains Mono since the first commit and has never been anything else** – in particular it was never Iosevka, which had never appeared in this repository before Iosevka was added as an alternate.

**`dgCharW` in `diagram-core.mjs` is calibrated to the bundled sans**, and that is the thing to remember when the roster changes. It is an advance table tuned deliberately generous – a box wider than its text reads as designed, a narrower one reads as broken – and the Plex change had to re-measure every group (narrow 0.34 → 0.39, wide 0.92 → 0.95, digits 0.56 → 0.61, other 0.53 → 0.54) or labels whose estimate no longer covered them would have gone from 1 in 25 to 5 in 25 on real lecture strings. **Both alternates are narrower than the default they replace**, measured in a browser at 100px:

| | narrow | wide | digits | upper | other |
|---|---|---|---|---|---|
| IBM Plex Sans | 0.281 | 0.847 | 0.600 | 0.634 | 0.518 |
| Inter Tight | 0.240 | 0.847 | 0.545 | 0.626 | 0.508 |
| JetBrains Mono | 0.600 | 0.600 | 0.600 | 0.600 | 0.600 |
| Iosevka | 0.500 | 0.500 | 0.500 | 0.500 | 0.500 |

So picking either leaves the estimate *more* generous, never less – the safe direction, and the reason neither needs its own table. **A future alternate that is wider than the default does need one**, and adding it without re-measuring is how labels start overflowing their boxes in silence.

**The four serif alternates reach that same table, and one of them tests it.** `dgMeasure` estimates every non-mono label with `dgCharW` – `.serif` included, because the class changes what is painted and never what was measured. Measured against 210 real label strings lifted out of the corpus, comparing the estimate to the rendered width:

| family | over budget | worst | mean |
|---|---|---|---|
| IBM Plex Sans *(what the table is calibrated to)* | 7/210 | 1.040 | 0.898 |
| Bitter | 22/210 | 1.130 | 0.909 |
| Noto Serif | 29/210 | 1.107 | 0.938 |
| Source Serif 4 | 36/210 | 1.089 | 0.936 |
| Literata *(the default, and the prior art)* | 49/210 | 1.164 | 0.943 |
| Roboto Serif | 122/210 | 1.204 | 1.010 |

Read the Literata row first: the serif has always been looser than the sans here, so three of the four alternates *improve* on what already ships. Roboto Serif does not – a mean of 1.010 means the estimate under-reads it on average, which is the same 8% extra width that makes it the one alternate to re-wrap a finished deck. **Give a `.serif` label an explicit `w` in a Roboto Serif deck.** Threading the roster down into `dgMeasure` so the table could vary per family would have to reach the browser editor too; that is a great deal of machinery for a class the whole corpus uses five times.

The choice among the four is a projection question, and these are the numbers behind it – stroke contrast is a capital O's stem over its hairline (low survives a lit room and a tired lamp), and the bold column is how much wider the 600 stem is than the 400:

| | contrast | bold | advance | payload |
|---|---|---|---|---|
| Literata | 1.68 | +40% | 0.560 | 106 KB |
| Bitter | **1.35** | +51% | 0.547 | **66 KB** |
| Roboto Serif | 1.60 | **+63%** | 0.606 | 136 KB |
| Source Serif 4 | 1.91 | +30% | 0.559 | 100 KB |
| Noto Serif | 2.00 | +34% | 0.560 | 83 KB |

**The bold column is the one that is easy to skip and expensive to get wrong**, because `topic-bold` puts the first sentence and the bold fragments on the slide and nothing else: a serif whose 600 barely separates from its 400 quietly dismantles the mechanism the projection runs on. That is what kept **Merriweather** out despite the largest x-height of any candidate – it separates by +15%. **IBM Plex Serif** would pair with the default sans and has no variable build on `@fontsource-variable`, so it fails the rule that a bundled face is a variable latin subset; `fonts/` is still open to it.

**`Source Serif 4` is the first roster family that also appears in its own fallback tail**, so `fontStyleTag` drops the duplicate rather than emitting `'Source Serif 4', 'Literata', 'Source Serif 4', Georgia, serif`. And the OFL notice is **generated from the embedded set**, not a literal – it named the three defaults whatever the roster was, which was already wrong for a deck on `sans: Inter Tight`.

**The condensed mono is a pinned instance of a variable font, not a different typeface.** Noto Sans Mono carries a `wdth` axis, and `font-variation-settings` is a legal `@font-face` **descriptor** – verified rather than assumed: with the descriptor the same file measures 0.50 em per character and without it 0.60. So pinning `wdth 62.5` in the face declaration produces one ordinary family that nothing downstream has to know about: no `font-stretch` on any element, no second selector list, no rule that has to reach every place the mono role is used. It has a slashed zero and its `I`, `l` and `1` are three visibly different shapes, which is the other half of what a code face has to do. It ships upright only – the family has no italic, so an italic listing gets a synthesised oblique.

**Iosevka was bundled first and was taken out on payload.** It is the same 0.50 em, and it is 961 KB against Noto's 54 – three static files came to 3.87 MB of base64 *per view*, on a tool whose promise is a file you can mail. An author who wants Iosevka specifically can still drop it in `fonts/`, which is what that mechanism is for. **The general rule: a bundled face has to be a variable latin subset**, because a static family is an order of magnitude heavier and the roster is embedded, not linked.

`fonts: none` turns the bundle off entirely for an author who would rather ship a smaller file. That matters more than it looks: **Safari does not expose locally installed fonts to a page**, as an anti-fingerprinting measure, so the old name-only stacks resolved to Georgia and system-ui there no matter what the lecturer had installed.

**`FONT_STACK_TAILS` is the single source of truth for the default stacks**, and a roster family other than the built-in default is emitted as an override that prepends it – otherwise the `@font-face` lands and nothing asks for it, because `--sans-font` still says `IBM Plex Sans` first and falls through to whatever the machine has. Emitted only where it differs, so a default lecture's CSS is byte-identical to before. `font-display: block`, not `swap`: a lecture must not flash a fallback face on the projector and then reflow the slide while the audience is watching. The bytes are read and base64-encoded **once** in `buildOnce` and passed to all four renderers via `opts.fontEmbed`.

## Author-supplied webfonts

Everything else in an output file is self-contained; type was not. The stylesheets shipped bare family stacks (`'Literata', 'Source Serif 4', Georgia, serif`) which resolve only where those faces are **installed** and fall through silently everywhere else – a lecture mailed to a colleague kept its layout and its figures and lost its face.

An author opts in by dropping files into `fonts/` beside `source.md` and naming families in the frontmatter:

```yaml
fonts:
  serif: Literata
  sans: IBM Plex Sans
  mono: JetBrains Mono
```

Files are matched by name prefix, with weight and style read off the suffix: `Literata-Regular`, `-Bold`, `-Italic`, `-BoldItalic`, `-600`, `-600italic`, and Google's variable naming `Literata[wght]` (→ `font-weight: 100 900`). `.woff2`, `.woff`, `.ttf`, `.otf` all work; anything but woff2 gets a size note. A named family with no matching file **fails the build** – falling back silently is the exact failure the feature exists to remove.

Three things to keep in mind when touching this:

- `FONT_STACK_TAILS` is the single source of truth for the default stacks. `AUDIENCE_CSS` interpolates from it and the `:root` override prepends to it, so an embedded family lands in front of the very list the build would otherwise have emitted. Don't re-inline those stacks.
- `font-display: block`, not `swap`. A lecture must not flash a fallback face on the projector and then reflow the slide while the audience is watching.
- The bytes are read and base64-encoded **once** in `buildOnce` and passed to all four renderers via `opts.fontEmbed`. Don't move the call into a renderer; that quadruples the work.

`lint.js` deliberately does **not** mirror this check. It would need `fs` plus the whole filename-parsing table, and the build already hard-fails with the list of files it found – so unlike `VALID_TAGS`, the duplication would buy nothing.

**Licensing is the author's problem and the docs say so.** Embedding redistributes the font file. SIL OFL and Apache-2.0 (between them nearly all of Google Fonts) permit it; most commercial *desktop* licences do not, and want a separate webfont licence. The build prints a reminder and makes no attempt to check.

## A face for the transition slides (`fonts.display`)

A **fourth role**, and the one place in a deck where a loud typeface is not a mistake: nobody reads a divider, they recognise it. `fonts: {display: Anton}` puts a face on the cover, the closing slide and the section dividers that nothing else in the lecture wears.

```yaml
fonts:
  display: Anton
  serif: Literata      # the body roles are unaffected
```

**Exactly two selectors use it** – `.chunk-title .title-main` and `.chunk-section .section-heading`, which is those three slide kinds and nothing else. A `## principle:` heading is not one of them, and neither is a card's lead or an overlay's title.

Four things separate it from the three text roles, and each one is a decision rather than an oversight.

**It has no default.** There is no `display` entry in `BUNDLED_DEFAULTS`, so a lecture that names none resolves the role to nothing, embeds nothing, and emits no rule. That absence *is* the feature: it is what makes the whole role cost an existing deck zero bytes, verified rather than hoped – the tutorial builds byte for byte what it built before, all four views.

**It is not held to the variable-latin-subset rule.** That rule exists because `topic-bold` puts bold fragments on every slide and a text face therefore needs a weight axis. A headline carries three words and no bold, and 21 of the 32 faces have no variable build at all – Anton *is* one weight, that is what Anton is. The rule stays for serif, sans and mono.

**It carries a `kind`, and that is not the same question as what it looks like.** Kind drives one rule: a display serif over a serif body reads as one typeface set badly rather than as two, so `lint.js` warns `display-pairing` when the display face's kind matches the deck's resolved `font:` role. `hand` and `mono` pair with either and never warn. **Chakra Petch is the case that proves kind and flavour have to be two fields** – a machine to look at, a sans to pair with.

**It carries a measured width correction.** See below; it is the part most likely to be broken by someone tidying up.

### The roster

Thirty-two faces, **SIL OFL 1.1 only**, one latin `woff2` each, median 21 KB. Three Apache-2.0 candidates were cut (Permanent Marker, Rock Salt, Just Another Hand) – not because the licence forbids embedding, it does not and `fonts/` is still open to them, but because `bundledFaces()` emits OFL text with the faces and a second licence regime in that path buys one typeface at the price of a special case. Caveat Brush is the loud marker instead.

| hand – pairs with anything | adj | | machine – pairs with anything | kind | adj |
|---|---|---|---|---|---|
| Amatic SC | 145% | | Press Start 2P | mono | 55% |
| Caveat *(variable)* | 139% | | Rubik Mono One | mono | 56% |
| Caveat Brush | 134% | | Silkscreen | mono | 62% |
| Patrick Hand | 133% | | Space Mono | mono | 78% |
| Kalam | 106% | | VT323 | mono | 119% |
| Shantell Sans *(variable)* | 88% | | Chakra Petch | sans | 101% |
| | | | Orbitron *(variable)* | sans | 87% |
| | | | Pixelify Sans *(variable)* | sans | 96% |

| graphic, serif – wants a **sans** body | adj | | graphic, sans – wants a **serif** body | adj |
|---|---|---|---|---|
| Instrument Serif | 142% | | Bebas Neue | 142% |
| DM Serif Display | 108% | | Staatliches | 128% |
| Abril Fatface | 103% | | Big Shoulders Display *(variable)* | 122% |
| Prata | 100% | | Anton | 120% |
| Young Serif | 95% | | Oswald *(variable)* | 116% |
| Yeseva One | 93% | | Space Grotesk *(variable)* | 99% |
| Bodoni Moda *(variable)* | 92% | | Bricolage Grotesque *(variable)* | 97% |
| Alfa Slab One | 89% | | Archivo Black | 87% |
| | | | Unbounded *(variable)* | 73% |
| | | | Syne *(variable)* | 61% |

**Rubik Mono One has no eszett** and draws it from the fallback mid-word; it also draws lowercase as capitals. `lint.js` warns `display-no-eszett` on a German deck. That was found by a glyph probe and then confirmed against a rendered specimen, because the probe was wrong twice before it was right – the story is in `tools/font-playground/README.md` and it is worth reading before writing another one.

### `size-adjust`, and why the number is measured

These faces disagree about **advance width by a factor of three** while the cover's type size is tuned for Literata. Anton set at it looks timid; Press Start 2P set at it runs off the slide, which is what it did before the correction existed. So each face carries a multiplier measured in a browser – the advance width of a real German title against Literata's, clamped to [0.55, 1.45] – by `tools/font-playground/measure-scale.mjs`, which writes `scales.json`. **Re-measure when a face is added.** Same discipline as `dgCharW`, and for the same reason: a number nobody measured is a number that silently overflows a slide.

**It rides as a `size-adjust` descriptor on the `@font-face`, not as a multiplier on a font-size**, the way Noto Sans Mono Condensed pins its width with `font-variation-settings` in the same place. On the face it reaches the six cover compositions that set their own title size, print, the zoom, `auto-fit` and `--check-fit` for free; in a layout rule it would have to be repeated in each of them and would be forgotten in one.

**A numeric `line-height` does not follow `size-adjust`** – it resolves against the *nominal* font-size, so Anton at 120% put 98.6px of apparent type in a 90.3px line box and the descenders of one line landed inside the letters of the next. That is why `DISPLAY_LH` exists: the seven line-heights the display face can wear are JS constants interpolated into the stylesheets (`1.1` emits the characters `1.1`, which is what keeps byte identity) and restated in the conditional block multiplied by the same percentage. **Three of the seven are deliberate and unequal** – 1.3 for the eyebrow kicker, 1.02/0.97 under `cover: display`, and in print the eyebrow subtitle carries 1.12 where the title carries 1.15. A single overriding rule would have flattened them.

**The tracking is the same trap, one property over.** Every cover composition sets a negative `letter-spacing` on its title &ndash; `cover: display` the tightest at `-0.042em` &ndash; because that is what a serif set large needs. On Anton, condensed and tightly fitted already, the letters touched. `DISPLAY_TRACK` lists every rule that tracks a slot the face wears, per view, and the conditional block resets them to `normal`: a display face is fitted by its designer, and the deck's correction is a correction for Literata. **The eyebrow kicker is deliberately absent from the list** &ndash; under `headline: eyebrow` the face is on the subtitle, so the kicker keeps its own `0.015em`, or `0.055em` when `caps: on` tracks the capitals. `node test/gates/run.mjs tails` re-reads both stylesheets and fails if a rule tracks such a slot and is not listed; it was written because an eleventh composition with a tracking of its own is exactly the change that would put the collision back on one variant and say nothing. The scan has to blank `${…}` interpolations first &ndash; braces inside them break a brace-counting parse, and on the first pass that hid four rules including the `-0.042em` the whole reset exists for.

**Width is normalised because line count is the failure that breaks a slide**, and apparent size varies as a consequence: against Literata's ink height, Silkscreen lands at 0.38 and Patrick Hand at 1.34. Rendered, a Silkscreen divider is a thin band on an empty frame while Anton fills it. No automatic correction fixes that without bringing the overflow back – pulling Silkscreen's ink to 0.85 needs a scale of ~1.39, at which it sets 2.2× Literata's width. So the build answers the question it can measure and `style: {display-scale: …}` answers the one that is taste.

### `style: {display-scale: <n>}`

A bounded multiplier (0.6–1.8, default 1) on the measured `size-adjust`, for the face that is right and the size that is not:

```yaml
style:
  display-scale: 1.4
fonts:
  display: Silkscreen
```

It had to be its own key because **`heading-scale` does not reach `--title-lead`** – the cover title is the one heading that key never governed. Set on a deck that resolves no display face it **fails the build**, on the rule `cover-ratio` already follows: this format does not accept a silent no-op.

### What no reader keystroke can do to it, and why that needed no code

`F` cycles the body font role and `A` cycles the seven colour themes. The display face is immune to both, and neither immunity is a rule someone has to remember to write:

- **`F` cycles a *variable*, not a family.** `body[data-font=sans]` re-points `--body-font`, and both target selectors used to inherit it. Pointing them at `--display-stack` takes them out of the cycle **by construction** – so there is no "F does not apply here" rule that could be forgotten when a fourth body font is added.
- **`A` re-points colour tokens only.** No theme touches a family, so the face was already immune, while its *colour* still follows `--ink` and `--emph` and stays readable on the three dark themes.

**Both properties hold only while `display` stays out of `FONT_CYCLE` and `--display-stack` is never assigned under a `body[data-font=…]` or `body[data-theme=…]` selector.** That is the one rule to guard here, and it is written down beside `FONT_ROLES` and `FONT_ROLE_VARS`.

### Under `style: {headline: eyebrow}` the face follows the loud line

`eyebrow` inverts which line of the title pair carries the weight, so the display face moves with it: `.title-subtitle` wears it and `.title-main` is handed explicitly back to `--body-font`. Left merely unmentioned, the unqualified rule would still have matched the kicker – which is what shipped first, and it put Anton at 32px over a headline in Literata at 82px, the exact inverse of what the role is for.

One thing that does **not** follow, and predates the role: under `eyebrow` a `cover: display` composition gives its loud line the composition's *size* but never its 0.97/1.02 *ratio*, because those sit on `.title-main` and no composition gives `.title-subtitle` a line-height at all.

### The mirrors

`lint.js` carries the display half of the roster – **names and kinds, tables only**, the established bend – and gets three findings out of it: `unknown-display-font` (error, mirroring the build's refusal), `display-pairing` and `display-no-eszett`. A gate in `test/gates/tails.mjs` holds the two tables congruent by name, count, kind and the eszett list, because a face added to one file alone would be reported as a typo on a deck that builds.

## Ligatures

`ligatures:` in the frontmatter, and the reason it needs a key at all is that **two different questions get called "ligatures"**:

- **text** – `fi`, `fl` and friends in prose. On by default and always has been; that is ordinary typesetting, not an effect.
- **code** – `->` drawn as a single arrow glyph in a listing. **Off since `7eec831`**, and off for a reason worth keeping: JetBrains Mono ligates `->`, `<-`, `<->`, `--` and `!=`, and in the figure grammar `->` and `--` are two *different edges*. Every listing on a slide, in a handout, on the project site and on the artifact page is source a reader is meant to retype, and what the audience saw was a character that does not exist in the language.

So the values are `text` (the default: fi and fl in prose, none in code – exactly what the tool does today), `none` (none anywhere, prose included) and `all` (code ligatures back). **The default is `text` and not `none`** even though `none` is what "default: no ligatures" would suggest: code ligatures are already off, and defaulting to `none` would take fi and fl out of every existing lecture's prose, which is a change to finished decks made in the name of not changing finished decks. The rule is `font-variant-ligatures`, and `none` rather than `no-contextual` because the arrows live in the contextual set (`calt`) and the rest in `liga`.

## Document language and hyphenation

`lang:` in the frontmatter (default `en`) lands in the `lang` attribute of `<html>` for all four views. It is not decoration: the browser picks its **hyphenation dictionary** from it, so `hyphens: auto` in the print stylesheet does nothing useful for a German lecture until the author writes `lang: de`. A value that is not a plausible BCP-47 tag fails the build.

**`lang:` also selects the words the build *invents*.** Everything in the four outputs that is not in `source.md` – the table-of-contents heading, the `Speaker Note` / `Presentation Note` labels, the print type eyebrow (`principle`, `exercise`, …), the projection's `EXERCISE`, the default `note` on a `::: footnote`, the `<title>` suffixes (`– lecture` / `– print` / …), the annotation box label and the `+ note` button – was English with no way to say otherwise. `lectureStrings(frontmatter)` resolves them out of the `STRINGS` table in `build.js`, looked up by the primary subtag (`de-AT` → `de`); a language the table has no wording for (`lang: fr`) builds and stays English with a one-line `[lang]` warning, because refusing it would stop an existing lecture from building. **`STRINGS.en` is the current literals transcribed character for character, so a deck with no `lang:` or with `lang: en` builds byte-identical HTML to before – the 1.0.0 contract.** The type word is stored once in canonical case and cased per site: the projection uppercases it (`AUFGABE`, which for a non-default word rides in as a same-specificity `content:` override after the main stylesheet, so English decks keep their exact bytes), the printed document lowercases it under `.chunk-label`'s small-caps.

A top-level **`labels:`** block overrides any single word – free-text values under the role names of `STRINGS.en`, with a nested `type:` map for the tag words:

```yaml
lang: de
labels:
  contents: Verzeichnis
  presentation-note: Präsentationsnotiz
  type:
    principle: Merksatz
```

It is a top-level block rather than `style: {labels: {…}}` because `style.labels` is already the on/off switch and every `style:` key is a closed vocabulary the linter whitelists, whereas these values are free text. An unknown key fails the build in the `buildOnce` pre-flight (`unknown-label-key`, the message shape `styleSettings` uses) and `lint.js` mirrors the refusal from its `LABEL_KEYS` / `LABEL_TYPE_KEYS` sets. `labels:` needs no `lang:` – an English deck may want `Contents` to read `In this lecture` – and it is legal beside `style: {labels: off}`: the switch hides the eyebrows, the block still names the TOC and the notes. Cockpit strings and the interaction-tier `?`/search/overview furniture are not localised yet (a later pass); key names on `<kbd>` never are.

Hyphenation is **prose-only, and by default document-only**. A hyphenated word on a projection reads badly and the live views reflow constantly; and because the `hyphens` property inherits, headings, code, and URLs are explicitly set back to `manual`, or the build would hyphenate an identifier. **A `statement:` chunk's paragraphs are in that reset too**, in both stylesheets: they are heading lines that happen to be marked up as paragraphs – the same face, size and weight as the heading above them – so a break across two lines reads as a fault there exactly as it does in a heading.

`style: {hyphenate: …}` is the author's say over which views do it, and its default is exactly the behaviour above:

| value | print / print-notes | audience / speaker |
|---|---|---|
| `print` (default) | hyphenates | does not |
| `all` | hyphenates | hyphenates |
| `none` | does not | does not |

**It is a `style:` key and `lang:` is not, and that split is the point.** The language is a property of the lecture – it decides the dictionary, and it is wrong rather than unfashionable if it disagrees with the words – while whether the projection breaks a word is a preference a German deck may answer either way. `all` exists for the case that forced it: a German compound at `.narrow`, where one word opens a hole in the measure that no rewriting closes.

**`all` on the projection is narrower than `all` on paper, and three exclusions are why it is usable at all.** A keynote with 26 left-set slides – the deck the key is for – turned it back off to `print` because of what it did to the other six.

- **Centred prose is left alone**: a `{.center}` chunk and every divider, whose heading and lede sit on the slide's own axis whatever `section:` variant it wears. Ragged-centre text is read as a silhouette, and a hyphen is a line end that says nothing – the block comes out as a diamond with a spike on one side. Measured: `Stu-dium` and `Hoch-schullehre` in six lines of one centred chunk.
- **An address is left alone**, and this is the half no selector could reach. A hyphenation dictionary reads a dot and a slash as word boundaries, so `projekt-bakule.de` came out as `pro-jekt-bakule.de` and `Handreichung / Z/PQM` split across the slash. There is no CSS for "this run of characters", so the build marks them: under `all` and only under `all`, `markAddresses` wraps any token carrying **a dot between two word characters, a slash, or a no-break space** in `<span class="nohy">`, and the stylesheet takes that span out of the dictionary. The no-break space is in the list because it is the author joining two halves into one token – `n = 4 910` – and a dictionary that can reach inside the group can break what was joined. It runs as a **`marked` `text`-renderer override**, which is handed one text token, already escaped, with no tag and no attribute in it; a regex over finished markup would have had to know where the tags were. Nothing changes for a deck that does not write `all`: no span is emitted, and the CSS that would read one is scoped to `#stage`, which print does not have.
- **The limit is `8 4 4` and not print's `6 3 3`**: a projection is read at ten metres from a line that is already short, and a two-letter tail on the next line is a fleck the room has to reassemble.

Two things about the live rule are load-bearing. It is **scoped to `#stage`**, so it is the slide's prose and never the chrome – a TOC entry, a search hit and the help sheet are lists a reader scans, and a broken word in one of those is only harder to scan. And it repeats PRINT_CSS's **`manual` reset** for headings, code and URLs, for the same inheritance reason. The print rule is wrapped `body:not([data-hyphenate=none])`, and that wrapper is the guard `test/settings.mjs` holds: drop it and `none` silently does nothing while every outcome-shaped check still passes.

What the key deliberately does **not** reach: the `hyphens: auto` inside a `::: cards` card. That is not a typographic preference but the rescue for a 320px measure a long word overflows outright, with `overflow-wrap: break-word` as the floor under it, so it answers a different question and keeps answering it in all three settings. **A card's term and a row's term are out of reach for the opposite reason**: they carry `hyphens: manual` unconditionally, because a term is a name rather than a measure and `Umge-hen.` on a slide reads as a fault. See the `psi-slides-decoration` skill.

The cover treatment for `title` chunks also lives in `@media print` now. The base rule used to be a full-height block with the title pinned to the bottom edge, which is right on paper and wrong for `print.html` in a browser, where you opened a document and saw a screen of nothing.

## Themes, dark mode, and `data-mode`

Seven themes cycle on `A`: four light accents, a neutral `dark` (grey paper, white ink, accent lifted so it carries), and the two `terminal-*` phosphor modes. `dark` is an ordinary reading theme that happens to be dark, so Shiki's syntax colours and the accent stay; the terminal modes deliberately suppress both to read as one phosphor tone.

`THEME_NAMES` and `DARK_THEME_NAMES` in build.js are the single source of truth. The runtime's `THEME_CYCLE`, the frontmatter validator (`VIEW_DEFAULT_SPEC`) and the pre-paint boot script are all interpolated from them, so adding a theme is a one-line change. `lint.js` mirrors the list, same contract as `VALID_TAGS`.

`applyFontTheme()` also sets **`body[data-mode]`** to `dark` or `light`. Chrome around the slide – help sheet, TOC, search panel, the cockpit footer and its key crib, the export modal – was written against paper and carries fixed near-white backgrounds; those overrides key off `data-mode`, not off individual theme names, so a new dark theme needs no new selectors and the terminal modes inherited the fix (they had the same problem; only the help-sheet `kbd` had ever been patched).

**Theme precedence extends the viewer-default rule with the OS**: frontmatter wins over the reader's stored preference, which wins over `prefers-color-scheme`, which wins over the built-in default. The resolution happens in `themeBootScript()`, emitted as the **first child of `<body>`** so a synchronous script settles it before the first paint – otherwise a reader on a dark system gets a white flash while the module boots. When the frontmatter pins the theme no script is emitted at all. `loadPersisted()` reads the answer back off the body attribute instead of re-deriving the precedence, so the two cannot disagree.

## Viewer defaults in the frontmatter

Eleven optional frontmatter keys pin how a lecture opens:

| key | values | default |
|---|---|---|
| `font` | serif / sans / mono | serif |
| `theme` | the seven accent / dark / phosphor names | light-red |
| `collapse` | topic-bold / none | topic-bold |
| `auto-fit` | true / false / **shrink** | false |
| `slide-numbers` | vertical / **horizontal** / off | **horizontal** |
| `print-slide-numbers` | vertical / horizontal / off | *follows `slide-numbers`* |
| `editor` | both / speaker / none | both |
| `note-button` | on / off | on |
| `neighbours` | dim / hidden | dim *(hidden under `cut` / `fade`)* |
| `transition` | pan / cut / fade | pan |
| `reader` | on / off | on |

`editor` is not a look but a payload – whether the live views carry the diagram editor – and it goes through this machinery rather than growing its own because the failure mode is identical: a typo would otherwise cost the lecture its editor silently. The precedence rule is one sentence: **a key that is present wins over the reader's stored preference; a key that is absent leaves that preference alone.** So lectures that say nothing behave exactly as before – font, theme and slide numbers keep following the reader across lectures – and an author who has designed a particular look gets it without asking anyone to press keys.

**Six of those entries carry a decision the table cannot show.**

**`slide-numbers` defaults to `horizontal`, and it used to default to `vertical`.** This is the one viewer default whose change moves what an existing deck renders: the stacked form sets each digit on its own line, so slide 10 reaches the audience as a 1 above a 0. The content repo's house-style file had carried "set `slide-numbers: horizontal`" as standing advice, which is what a wrong default looks like from the outside. The old rendering is `slide-numbers: vertical`, and deliberately no compatibility flag was added beside it – one more key would make the old behaviour reachable two ways. The number in the corner is also an address: `G`, the digits and Enter jump to that slide in either window, the way a click in the contents does, so the cockpit and the projection stay in step; a number the deck does not have shakes the prompt and keeps the digits, and Backspace and Escape do what they say.

**`print-slide-numbers` has no default of its own; it *defers*.** An absent key resolves at read time to the live value, and only if that is absent too does `SLIDE_NUM_DEFAULT` apply. `viewDefaults()` writes a key only when the frontmatter carried it, so "unset" is a fourth state distinguishable from all three values, and **`printSlideNums(frontmatter)` is the documented step** that turns it into one – `d.printSlideNums || d.slideNums || SLIDE_NUM_DEFAULT`, in that order, in one place. Reading the key anywhere else with a fallback of `SLIDE_NUM_DEFAULT` would silently drop the deferral and make an unset key mean `horizontal` rather than "follow". `test/settings.mjs` asserts all sixteen combinations of the two keys.

**`auto-fit` has three modes and its frontmatter words are not its runtime words.** The file says `true` / `false` / `shrink`; the runtime carries `full` / `off` / `shrink`, because a boolean cannot hold three states and because `state.autoFitMode` must never be read for truthiness – all three words are truthy strings. `AUTO_FIT_FROM_KEY` is the one place the two vocabularies meet, `autoFitOn()` is the test, and `autoFitCeiling()` is the whole of the difference between the two on-modes: `2.2` for `full`, `collapsedZoom` (the lecturer's own zoom) for `shrink`, so shrink can only ever take size away. `#` cycles `off → shrink → full`, and `Shift` does **not** reverse it as it does on `C`, `F`, `A` and `L` – `#` is Shift-3 on a US layout and unshifted on a German one, so `e.shiftKey` carries no portable information there.

The mode also travels as **two fields in the state snapshot**, `autoFitMode` (the word) and `autoFit` (a boolean), because `audience.html` and `speaker.html` are separate files and `--audience-only` rebuilds one of them: a peer built before the third mode coerces `payload.autoFit` with `!!`, so sending it `'off'` would switch it on. `normAutoFit()` reads either back, and `applyRemoteState` prefers the word when there is one. What travels in `zoom` is the *setting* (`zoomBase()`), never the shrunk value, so each window re-solves the shrink against its own size – `applyRemoteState` calls `fitZoomToChunk(collapsedZoom)` in that mode where it calls `clampZoomToWidth()` otherwise. Full auto-fit deliberately keeps adopting the sender's fitted zoom, which is what it has always done.

**`reader` is the one key here that no live view reads.** It is about the two documents, `print.html` and `print-notes.html`, as a reader has them on a screen after the lecture: under `on` (the default) they carry a contents sidebar – one entry per slide, grouped by part, numbered with the number the document prints, the title chunk and an `outline:` chunk left out – that marks the slide the reader is in (`aria-current="location"`, the entry whose top last crossed 30% of the window), and the layout keeps a 17rem column free on the right for the reader's own notes, which the highlights will put there. `off` ships none of it: no sidebar, no reader script (`PRINT_READER_JS`, `READER_EARLY_JS`), no `data-reader` on the body. The lightbox stays either way, because it is how a figure is read rather than a tool of the reader's. The rules in `PRINT_CSS` are keyed off `body[data-reader=on].rd-ready`, and the class is set by a one-line script right after the sidebar, so a page read without scripts is laid out as before and a paper print never sees any of it.

The layout has three widths, solved rather than guessed, because the screen root size follows the window (`clamp(15px, calc(12px + 0.3vw), 18px)`) and a media query cannot read it. From `READER_WIDE_PX` (1216) the sidebar stands fixed on the left – 15rem of contents, the 42rem text, 17rem of notes and the air between them come to 77rem, 1201 px at that width. From `READER_NOTES_PX` (920) up to there it folds to a button top left that opens it over the page, and the notes column still fits. Below 920 there is no notes column and the text is centred as it always was. Both numbers are constants interpolated into the stylesheet and the script, so the two cannot disagree. The sidebar's words come from `STRINGS` (`contents`, `reader-close`), so `labels:` reaches them.

**`note-button` and `neighbours` are the two a keynote sets and a lecture does not, and they share one mechanism the seven above them do not have: the on-value is the *absence* of the attribute.** `viewBodyAttrs` writes `data-note-button="off"` and `data-neighbours="hidden"` only when the author asked for them, so a deck that says nothing about either emits exactly the bytes it did before the keys existed.

`note-button: off` hides the `+ note` affordance in the slide's left gutter (`+ Notiz` under `lang: de`). At 45% opacity on every active slide it is the one piece of chrome a photographed projection always carries, and a rehearsed talk with nothing to annotate wants the frame clean. It costs no ability: `N` still opens an annotation, and the button is still in the markup for the search index and the cockpit's lists. **`M` toggles it at runtime in either window**, and, like `B`, it travels to the projection as its **own message type** (`{type: 'note-button', mode}`) past the freeze gate rather than as a field of the state snapshot – `applyRemoteState` is a full apply, so a snapshot sent to say "the button is hidden" would drag the receiver's slide position with it. The choice is remembered in `localStorage` under `psi-slides:note-button`, globally rather than per lecture, the way `font`, `theme` and `slide-numbers` are, and only where the frontmatter left the question open.

`neighbours: hidden` takes the slide before and the slide after to opacity 0. The default `dim` (`--dim: 0.86`, so a neighbour sits at about 17%) is deliberate for a lecture: the camera pans through a column and the faint neighbours are what make the view one long board rather than a stack of cards. A keynote wants the opposite: 17% of a heading set in display type is perfectly legible from the room, and the frame then carries two slides and says so. The fade in `hidden` is the backdrop's 260ms and not the chunk's own 500ms, for the backdrop's reason: the camera lands in `--camera-duration` (250ms) and a neighbour still visible then reads as a smear beside the slide. Going the other way is not this rule's business – a chunk that becomes `.active` stops matching it and falls back to `.chunk`'s own opacity transition over `--camera-duration`, so the arriving slide comes up exactly as the camera lands; that third fade is the one `transition: cut` has to zero separately. The overview board is unaffected, because `body.overview-mode .chunk` sets `opacity: 1 !important`.

`transition: pan | cut | fade` says what a slide *change* looks like, and the three words are the three answers a slide tool can give. `pan` is the default and is what this tool has always done: the stage is one continuous column and the camera glides along it over `--camera-duration` (250 ms), which is what tells a room that the slides are a board and not a pile. `cut` lands the camera with no motion at all. `fade` dips the whole stage to the paper over 130 ms, takes the camera's jump in the one frame where the stage is at zero, and comes back over 130 ms – `FADE_MS` is 260, deliberately the backdrop's number, so a deck that has both does not have two speeds in it.

**Only the slide change.** A reveal segment, a figure step, a `.middle` chunk's per-press glide, the walk down a chunk taller than the frame, auto-fit re-solving the zoom and a `::: backdrop`'s `reveal` opening across the frame all keep their motion in every mode: those are moves *on* a slide that is already there, and a keynote asking for a cut between slides is not asking for its pictures to snap open. The line is drawn in one place – **`landSlide()` in `AUDIENCE_JS`, which has exactly two callers**, `jumpTo` for a press in this window and `applyRemoteState` for a press in the other. A third path is how two windows come to draw a slide change differently, and the cockpit's stage is a mirror of the projection, so both run the same mode off the same frontmatter.

**Why a dip and not a cross-dissolve, measured rather than argued.** A dissolve needs the two slides in the same place at the same moment, which a continuous column does not give – they are a slide-height and a gap apart. The cheap way to get them there is one line (jump the camera, hand the outgoing chunk the inverse of that jump), and it was built and its half-way frame shot at 1600×900 beside the dip's. What it paints is two paragraphs standing on each other letter through letter for a sixth of a second: on a tool whose slides are dark words on pale paper, a dissolve of two of them is a double exposure, unreadable in exactly the moment the room is reading. The dip's half-way frame is the slide being left, at half strength, still legible, on its way out. Traced per animation frame in Chromium, it is 130 ms of falling opacity with the transform held exactly where it was, one frame at zero in which the transform changes, and 130 ms back – no dropped frame and no positional motion at any opacity a room can see.

**Three arrival fades have to go with it, and the third is the one that is easy to miss.** `--arrive-fade` (260 ms) is the one number behind a backdrop's crossfade and a hidden neighbour's, and `cut` and `fade` take it to `0s`. But `.chunk` itself transitions opacity over `--camera-duration`, which is how the arriving slide comes up *as* the pan lands, and it is written nowhere near the other two – left in place it gave a cut whose words faded in over a quarter of a second, and a fade whose two halves were 130 ms out and 230 ms back, because the stage's rise and the chunk's rise multiplied. It cannot share `--arrive-fade` (260 is the backdrop's number, 250 is the camera's, and moving either would move what a pan renders today), so `body[data-transition=cut] .chunk, body[data-transition=fade] .chunk { transition: none }` is its own line.

**And it resolves `neighbours`.** Under `cut` and `fade` the camera does not travel, so a neighbour is never passed on the way; the only thing a dimmed one can still do is sit at the edge of a zoomed-out frame or smear through a fade. So `neighbourMode()` answers `hidden` for both unless the author wrote `dim` next to one – the same deferral shape as `printSlideNums()`, and for the same reason: `viewDefaults()` writes a key only when the frontmatter carried it, so "unset" is a fourth state and one documented function turns it into a value. `viewBodyAttrs` writes the *resolved* answer, so `transition: cut` alone puts `data-neighbours="hidden"` on the body.

**No runtime key, and that is a decision.** Every free letter left is worth more to something a lecturer needs mid-talk, the mode is the author's design rather than the reader's preference (unlike `font`, `theme` and `slide-numbers`, which follow the reader across lectures), and a mode in the state snapshot would be one more thing two windows could disagree about for no gain. `SLIDE_TRANSITION` is therefore a `const` read once from `VIEW_DEFAULTS`, not a field of `state`. One consequence is worth knowing: under `fade` each window runs its own dip when it *learns* of the change, so the cockpit dips on the press and the projection on the message that follows the cockpit's swap – half a fade, 130 ms, on a pair of screens nobody sees at once. Teaching the snapshot to carry a phase was judged the more expensive answer.

Two things `transition` deliberately does not touch. Leaving the **overview board** (`O`) still glides, because that is the board zooming back to a slide rather than the deck changing slides. And **`prefers-reduced-motion`** does not suppress `fade`: what that preference asks to be spared is motion, and a cross-fade is the standard thing to give it instead.

An unknown value **fails the build** (`err.userFacing`, no stack trace) rather than being ignored, because a typo here is otherwise invisible: the lecture still builds and still looks fine, it just looks like the author never set anything. `lint.js` mirrors the table as `VIEW_DEFAULTS` and reports `unknown-view-default` as an error – keep the two in sync, same rule as `VALID_TAGS`.

See the `psi-slides-decoration` skill for `cover`, `subtitle`, `cover-image` and the `style:` block, which are the author's composition rather than the reader's preference and so are validated separately.

## Fullscreen on the projection (`W`)

The reading knobs above all have a frontmatter key. This one has none, deliberately: a window's frame is a property of the machine the talk runs on, not of the lecture, and a deck that opened itself fullscreen would be asking for a permission no page is given at load.

**`W` means the projection, `Shift`-`W` means this window.** In `audience.html` the two are the same window, so plain `W` there fills it and a second `W` leaves. In the cockpit plain `W` is a command sent to the projector – ungated by freeze, its own message type, for the reason `M` and `B` are – and the cockpit stays in its window, because a lecturer reading notes off a laptop wants the notes. `Shift`-`W` fills the cockpit, for the one-screen case.

**The cockpit's `W` can only ask.** `requestFullscreen` is granted only to a user gesture in the window that makes the call, and Chromium refuses one issued from a `message` handler with `TypeError: Permissions check failed` – measured, headless and headed alike. So the projection *arms*: `#fullscreen-hint` appears in the bottom-right corner and the next click anywhere on that window enters, in the capture phase and once, so the click is not also a click on whatever it landed on. The arming lapses after 20 s. **Leaving needs no gesture**, so a second `W` in the cockpit takes the projection back out immediately; `Escape` is the browser's own way out and never reaches the page.

**Nothing of it is in the state snapshot** – the projector is full and the laptop is not, so there is no shared value to carry. The projection reports its own state on every `fullscreenchange` and every `hello`, which is what lets the cockpit's `W` toggle the right way. The coarse-pointer palette behind `⋯` carries the same command as a button, because a tablet at the lectern has no `W`.

**One thing every reading knob shares with it**: the frame changes size, so the zoom has to be solved again. The `resize` listener now calls `autoFitNow()` before `clampZoomToWidth()` – the latter stands aside while a fit is on, which left a deck under `auto-fit` wearing the zoom that fitted the windowed frame. speaker.md §2 and `test/nav-fullscreen.mjs` carry the whole of it.

## Hiding the generated labels (`style.labels`)

The tag word above a chunk is **two different things wearing one name**, and a switch has to reach both: the document renderer emits `<span class="chunk-label">` for principle, question, definition and exercise, while the projection generates only `EXERCISE`, in CSS – the one eyebrow that survived the removal of the others (PRD §2.1). So most of what an author sees as "the eyebrows" is in `print.html`, and a check in the audience view alone will report that there is nothing to hide.

`style: {labels: off}` hides both. **It is its own key rather than part of `rules`**, which hides the bar over a principle and the hairline over a definition: a word and a line are not one decision, and an author may well want the line and not the word.

**It reaches a third generated word, and that one is easy to miss: the small-caps eyebrow over a `::: footnote`.** `.margin-note::before` draws `content: attr(data-label)`, and where the author wrote no label the build supplies one (`NOTE`, `ANMERKUNG` under `lang: de`) – invented the same way the tag eyebrow is, so the same switch has to reach it. It used to survive `labels: off` and was then the *louder* of the two words left on the slide. **The projection alone.** `PRINT_CSS` keeps its footnote label, because on paper the aside is one more block in a column of blocks and the word is what marks it as a footnote, where on the slide the hairline and the position already do.

## Where the blocks sit (`style.blocks`), and the two keys a chunk can answer

`STYLE_SPEC` in build.js is the whole `style:` block, mirrored in `lint.js` as `STYLE_ENUMS` for the words and `STYLE_NUM_SPEC` for the bounded numbers (a value lint.js cannot read as a finite number is not reported at all – the leniency runs in the safe direction, since what it passes and the build refuses fails at the build with the same message). The keys: `headings` (auto/left/center/off), `rules` (on/off), `labels` (on/off), `link-codes` (on/off), `wrap` (balance/none), `blocks` (center/left), `hyphenate` (print/all/none), `print-body` (serif/sans), `neutrals` and `print-neutrals` (neutral/tinted/warm/cool), `headline` (stacked/eyebrow), `caps` (off/on), `bold` and `print-bold` (plain/bold/italic/accent/accent-bold/accent-italic), `code` (plain/tint/spaced), `heading-scale` and `body-scale` (0.6–1.8), `figure-type` (0.6–1.6).

**`blocks` reaches a `::: draw` now, and that is new.** It used to be listed as the one block it could not touch, because the `<svg>` was emitted 2000px wide under `max-width: 100%` and filled the measure at every chunk width – there was no space beside it to align in. Both media size a drawing from its type now, so the box hugs the picture and `left` puts it on the prose's own axis like a code block or a formula.

**And `left` means the drawing's own edge, not its box's.** A figure's box is its viewBox, which is the drawing plus `DG_MARGIN` on every side, so flush left used to stop a fixed reserve short of the heading above it – measured on a real keynote, heading at x 223 and the first box at 243, the same near-miss on every figure in the deck. `diagram-core.mjs` emits that reserve as `--dg-ink-x`, a fraction of the box's width (and the live runtime rewrites it when it swaps in the viewBox that holds every beat, which is a different width), and the two `blocks: left` rules pull the box back out into the gutter by it. The drawing's own edge is its leftmost *painted* element: a frame that draws neither outline nor fill – a `.bare .clear` table – is skipped, so a table's column of words lines up with the heading rather than its invisible frame. Centre is untouched: the reserve is symmetric, so a centred box was a centred drawing already.

**Centre stays the default, and the measurement is why.** The case for ranging a figure left whenever its chunk has a heading is that the two should share an edge – but where the heading sits is `style.headings`, and the corpus answers it both ways. `lectures/diagrams` sets no `headings` key, so a `figure:` chunk's heading is centred (measured at 1600×900: heads at 465–739 px in a 96–1504 column) and the drawing under it is centred with it. `lectures/tutorial` sets `headings: left`, every heading stands at the column edge, and the centred figures sit 56–860 px inside it – which is the complaint, and `blocks: left` is now the exact answer to it. A deck that ranges its headings left says so once, in the same block.

**`reveal` was a key here and is gone.** It chose what a top-level `---` did before its beat – `grow`, the 1.0.0 behaviour, closed the segment up so the chunk grew per press, and `hold` laid it out at its final height from beat 0. Every reveal reserves its space now, at every depth, so there is nothing left for the key to pick and a deck that still writes it is refused by the build and by `lint.js` alike. `STYLE_KEYS_REMOVED` in build.js and its mirror in lint.js carry the sentence an author gets, which names what replaced the key rather than reporting a typo they did not make.

## How large a figure's labels are (`style.figure-type`)

**The key says one thing: how large a base label is against the body type it
stands in.** One em of the surrounding text is the default, which on a slide is
the honest answer – a figure's label is a word the back row has to read, and
there is no running text beside it to excuse a smaller one. Print's own number
is the opposite case and is not this key: `--dg-fig-size: 0.9rem` in
`PRINT_CSS`, a figure being apparatus inside a column of prose.

**Which is now also how many labels a slide's canvas holds.** A `::: draw` in a
chunk body is laid out on a fixed canvas – the chunk's column wide, sixteen
label-heights tall (the `psi-slides-figures` skill has the whole of it) – and
the canvas is measured in base labels, so a bigger label is fewer of them in
the same column and fewer rows in the same reserve. `{.figure-type-160}` on a
`.wide` chunk gives a canvas of 22.8 × 10 labels instead of 36.5 × 16: the same
1152 × 505 px box on the slide, with bigger type in it and less room for
drawing. That is the whole trade the key offers, and it is the same trade it
always offered, said in a unit an author can count.

Bounded 0.6–1.6 because outside that the figure either is the defect or caps
every drawing at the column. A deck that sets nothing emits no `--figure-type`
at all and builds byte-identical HTML.

**And one chunk can answer it for itself: `{.figure-type-70}`.** The key is
deck-wide and a drawing is not – one keynote has a figure 55 labels wide and
another 21, and pulling the first down with the key takes the second with it.
Eleven steps, the key's own 0.6–1.6 in tenths, spelled as **per cent** so the
class reads as a proportion and carries no dot: `.figure-type-60` …
`.figure-type-160`, generated into `CHUNK_STYLE_CLASSES` from
`FIGURE_TYPE_STEPS` in `tails.mjs`. The chunk carries `data-figure-type="70"`
and a rule per step sets `--figure-type`; the steps are generated into
`AUDIENCE_CSS` from the same table, so a step cannot exist in one place and not
the other. Ten per cent is the smallest step worth a slide.

Unlike the four classes above it, **this one does not reach print**, and
neither does the key: a document sizes a figure with `--dg-fig-size`, which is
a decision about apparatus inside a column of prose rather than about a room.
It is also legal on a `title` or `closing` chunk, like the other `style:`
classes, where it has nothing to act on – the same latitude `.blocks-left` has
there.

**One thing the multiplier does not do**, and confusing them wastes an
afternoon. A base label's size is the figure's box divided by its width in
labels *once the drawing is capped*, and that has no `figure-type` in it: the
multiplier moves the width the figure asks for, so on an overflowing figure it
moves the slide's body type and leaves the labels exactly where they were.
Turning it down therefore widens a canvas and shrinks an overshoot, and does
nothing at all for a drawing whose own labels are under 18 px. The build says
both, separately.

## The three figure reports

`figure-overflows-canvas` and `figure-underfills-canvas` are the pair the
canvas made sayable: a drawing wider or taller than the box its slide reserves,
and one using less than half of it. Both give the numbers in labels and in px,
and the `frame WxH` that would reserve what the drawing actually draws. Read the
`psi-slides-figures` skill for the canvas itself.

`figure-type-small` is the older one and survives beside them for a figure that
has **no** canvas – one under `frame none`, or in a card, a pane or a divider –
where nothing else can say that a deck's figures are uniformly unreadable: a
base label under `FIG_TYPE_FLOOR_PX` (18 px at 1600×900), computed from the
chunk's measured column width and the drawing's own width in labels. A figure
that is both over its canvas and under the floor is reported as the former,
with the absolute number in the same line.

`figure-type-uneven` is gone. Its whole content was "this slide's type is out
of step with the deck's", which a figure inside its canvas cannot be – the
canvas is the column at body type, so a figure that fits it settles at the same
body type every other figure slide settles at – and which a figure past it is
now told in plainer words, with the axis it overflowed on.

All three are emitted once, at the end of `parseLecture`, and none is a build
failure. `figureSettle()` is the shared arithmetic and it is the whole reason a
static check can say anything about a dynamic camera: the drawing asks for
`typeW × body × figure-type` pixels, the box caps that, a capped figure counts
as "does not fit", and the zoom walks down until the two meet – so the resting
point is `box / (typeW × figure-type)` and there is no browser in it. **Two
numbers in that arithmetic were wrong until the canvas landed**: the em is
`1rem × --zoom` and `--zoom` defaults to 1.35, so it is 31.6 px at 1600×900 and
not the 23.4 px of the rem; and `--body-fs` is 1.2rem on a `principle`, 1.15 on
a `question` and 0.9 on a `figure`, which `FIG_BODY_REM` mirrors and
`node test/gates/run.mjs canvas` holds against the stylesheet. With both, the
estimate lands within 0.8 px of the browser on all twenty figures of a keynote.

**`--check-fit` carries the same readings from the other end**, where the zoom
is real: the canvas fill per figure, every figure that had to be scaled past
its canvas, and the deck's median settled body type with every slide whose
figure took it more than 15 % under that. Those are notes and change no exit
code.

## What hue the greys carry (`style.neutrals`)

**In the four light themes the `A` key moves `--emph` and nothing else.** `--ink` sits at chroma 0.01 on hue 260, `--paper` and `--rule` at chroma 0, and every quiet fill is mixed out of `--ink` – a `::: cards {.panel}` item is 5% of it, a dock and an overlay card 4%. So a card under the `light-orange` accent is a cool grey under a warm word; the two agree only in `light-blue`, where the accent happens to sit at hue 250. The `dark` theme has a milder version of the same (neutral ink, accent at hue 35), and the two terminal themes have none of it at all, because there `--ink` *is* the theme's colour.

`style: {neutrals: …}` is the author's say over it:

| value | what it does |
|---|---|
| `neutral` | the default, and today's rendering – a deck that says nothing emits no `data-neutrals` and reaches none of the rules |
| `tinted` | the greys take the accent's own hue, and the quiet fills are mixed from `--emph` rather than from the ink |
| `warm` | a fixed warm grey, hue 70, whatever the accent is |
| `cool` | a fixed cool grey, hue 250 – where the neutrals already sit, so writing it makes today's cast a choice and carries it into `--paper` and `--rule`, which are at chroma 0 |

**Two halves, and they are separate.** The token half moves `--ink`, `--ink-soft`, `--paper`, `--paper-warm` and `--rule` onto `--accent-h` – each theme names its own hue, `warm` and `cool` override it at the same specificity from later in the stylesheet. The chroma is the argument, not the hue: 0.014 on the ink is under the threshold at which a grey reads as a colour, and the paper gets half of that, because a tinted paper costs brightness in a lit room and it is the one token a projector punishes. The fill half exists because 5% of a 0.014 ink is a fill with no hue left in it, so under `tinted` the card, the dock and the overlay grounds are mixed from `--emph` at 8% / 6% instead. **Through `--card-bg`, not through `background`** – the card's fill is declared on the `.cards` container as a custom property and read by the item, so a `background` there paints the grid and not the card.

**Print answers the same question with its own key.** `print-neutrals` takes the same four words, and its default is a deferral rather than a value: `''` is the seeded default and no written value can produce it, so an unset key stays distinguishable from all four and `printNeutrals()` is the one step that turns it into "follow `neutrals`" – the shape `printSlideNums()` documents, with the same warning that a second reader with a fallback would silently make unset mean `neutral`. The two keys exist because the two grounds differ in temperature and nothing said so: print's paper is `#fafaf7` and its accent `#8b2e00`, both warm, where the live paper is chroma 0. Two sessions tripped over that in one day before it was written down. Each stylesheet keys on its own attribute – `AUDIENCE_CSS` on `data-neutrals`, `PRINT_CSS` on `data-print-neutrals` – so neither view can answer the other's key.

**`warm` and `cool` are held off the two terminal themes on purpose.** A single phosphor tone is what those are, and a warm-grey paper under green ink is neither. `tinted` needs no such guard: there the accent's hue is already the theme's.

What it does **not** reach yet: the slide's shadows and scrims, which are hard-coded at hue 260 (`oklch(0.2 0.01 260 / 0.10)` and friends) in four different recipes. Fixing those well means one elevation ladder rather than a token swap, which is its own change.

## Which line of a title pair is loud (`style.headline`, `style.caps`)

Every cover carries a pair (`title:` + `subtitle:`), and so does every section divider and closing slide (`Heading | Sub`). Until these keys the pair had one setting: first line large, second quieter underneath.

| | |
|---|---|
| `stacked` | the title large, the subtitle quieter under it. **The default**, and the rendering the tool has always had |
| `eyebrow` | the title set small above a subtitle that carries the weight – the newspaper kicker |

**It is a treatment and not a second pair of content keys, and that is the load-bearing decision.** `title:` is also the `<title>` element, the TOC entry and what the search index reads. Inverting the hierarchy by telling authors to put the hook in `title:` would rename the browser tab to the hook and leave the lecture's own name nowhere. So the words never move and only their type does – which is also what lets one key serve the cover, the dividers and the closing slide at once.

**The mechanism is `--title-lead` and `--title-measure`, declared on the chunk.** Each composition says how big its loud line is and how wide it may run as two custom properties rather than as a `font-size` and a `max-width` on `.title-main`; the eyebrow mode then hands both to whichever line is carrying the weight. Declared on the chunk and not on `.title-main`, because a custom property inherits down and not sideways and the subtitle has to be able to read it. **A composition that goes back to writing a `font-size` on `.title-main` will work under `stacked` and silently stop swapping** – `test/settings.mjs` checks four of them for exactly that.

Neither `.chunk` nor `.chunk-content` sets a `font-size`, so moving those em values up to the chunk was lossless. That was checked rather than assumed, and it is the thing to re-check if either rule ever gains one.

`style: {caps: …}` sets the small type around a title in capitals – the eyebrow, the presenter, the affiliation. **Never the headline:** a key that capitalises the loud line is a key that makes a talk shout.

**The tracking that has to come with capitals is deliberately not a setting.** Capitals at the tracking of lowercase read as one jammed word, which is a typographic rule rather than a preference, so `isAllCaps` marks any title slot whose text is *already* in capitals with `data-caps` and the stylesheet tracks it out. That reaches the line an author typed in capitals years ago as much as the line this key transforms. It is spelled as "has an uppercase letter and no lowercase one" rather than `s === s.toUpperCase()`, because uppercasing an ß yields SS – so a capitalised German line would never equal its own uppercase, and the deck most likely to want this would be the one that silently missed it.

Two things measured rather than chosen, both worth not re-breaking:

- **A composition's measure is written in the headline's em, and the eyebrow's em is much smaller.** masthead's 15em cap computed to 483px at the eyebrow's size and broke `DATENSICHERHEIT IM DIGITALEN ALLTAG:` onto two lines. That is why the cap moved to `--title-measure` and why the kicker is uncapped: it is one short line by construction and the column is the only cap it needs.
- **A single capital letter is, correctly, all capitals.** `presenter: P` in a fixture is marked. Harmless – tracking one letter shows nothing – but it will surprise anyone writing a test against a one-letter field.

## The printed document's face (`style.print-body`)

The live views have answered "serif, sans or mono" since the first commit – `F` cycles it, `font:` pins where a lecture opens – and print answered nothing, because `PRINT_CSS` names `var(--serif)` on `html`. `style: {print-body: sans}` is that switch, `serif` is the default, and `print-notes.html` gets it free because it is the same renderer with `withNotes`.

**Two things about it are worth keeping.** It is **one declaration on `body`**, not a list of elements. Everything in `PRINT_CSS` that ought to be a sans already names one – the tag word, a figure's caption, a `.has-sub` sub-heading, the contents list – so what inherits the serif off `html` is exactly the set that should move: running text, chunk and column headings, blockquotes. Measured rather than assumed, and the first attempt at this enumerated `p, li, dd, blockquote, figcaption, td, th` from a wrong reading of which elements were already sans. An element list here is only a way of getting the set slightly wrong later.

And it **does not defer to `font:`** the way `print-slide-numbers` defers to `slide-numbers`. That key was born deferring, so nothing moved under any existing deck; here, a lecture that already says `font: sans` for the projection would start printing in a sans it never chose. `font: mono` also has no sensible reading as a whole printed document, and a deferral would have to invent one.

It lives in `style:` rather than beside the viewer defaults because it is the author's composition, not the reader's preference – and `hyphenate` is already here on the same reasoning, which is what makes a print-only key ordinary in this block rather than novel.

`blocks` is the newest and the only one that moves something other than type. Three things on a slide are not prose and have always been centred – a code block, a figure with its caption, a display formula – and `left` puts all three on the prose's own axis. **Which thing moves is different for each, and that is the part to know before editing the rules.** A top-level `pre` already breaks out of the text column to 72vw; what centres it is `left: 50%` plus a translate, so `left` moves the *box* and the listing inside it was left-aligned all along. A figure and a formula are already the full measure, so it is the artwork, the caption and the equation *inside* the box that move (`align-items` and KaTeX's own `text-align`, two rules deep).

The one number worth checking after any edit: the left-aligned breakout's cap is `calc(var(--slide-w) * 0.36 + 50%)`, which is exact rather than cautious. A column centred on the slide has `(slide − column) / 2` to its left, so the room between its left edge and the content area's right edge is `0.36 × slide + half the column`. That keeps the 78-character code budget identical to the centred case at every chunk width and never crosses the slide's 14% padding. `test/block-align.mjs` measures it at two chunk widths and two window sizes, because arithmetic that happens to agree at one size is not arithmetic.

**A `::: draw` is in the key, and it is the one member whose box moves *past* the measure.** The svg's box hugs the drawing rather than spanning the column, so `left` moves the box the way it moves a code block's – and then a negative start margin of `--dg-ink-x` times that box pulls the viewBox's own reserve out into the gutter, so what lands on the prose's axis is the ink. See *Where the blocks sit* above for the measurements.

**`wrap`, `blocks` and `figure-type` are the keys with a per-chunk form**, and the rule is one line: a chunk class spelled `<key>-<value>` overrides that key for that chunk. `.wrap-none`, `.wrap-balance`, `.blocks-left`, `.blocks-center`, and `.figure-type-60` … `.figure-type-160` – `CHUNK_STYLE_CLASSES` in `tails.mjs`, imported by build.js and `lint.js` alike rather than mirrored. Both directions of the first two keys, because under a deck-wide `wrap: none` the only way left to ask for balancing is to ask for it on the chunk; the third is a number, so it is a bounded set of steps instead. Only these three, because they are the ones whose right answer changes from slide to slide; `headings`, `rules` and `labels` are decisions a deck makes once, and a class for each would be four more guards in two stylesheets for nothing.

The attribute names are the body's, so one stylesheet serves both levels and the chunk wins on specificity alone – `.chunk[data-wrap=none]` is two classes where `body:not([data-wrap=none])` is one class and one element. **In `AUDIENCE_CSS` the chunk rules are prefixed `#stage` and that is load-bearing**: the deck-wide heading rule carries an id (`#toc-panel li` rides in its `:is()` list), so a chunk-scoped rule made of classes alone loses to it however many classes it stacks. `#stage` is the element every chunk in both live views is inside, so it is the honest way to buy the id the cascade is asking for, and it also keeps every `blocks` rule off the focus overlay, whose clone of a figure is centred because a modal card is centred rather than because the slide is.

**Unlike `.bare` and `.center`, the `wrap` and `blocks` classes reach the printed document** (`.figure-type-N` does not, because its key does not). Those two answer where words sit on a *slide*, which a page does not ask; where a formula sits relative to the paragraph that introduced it is the same question on paper, and `style.wrap` has been in `PRINT_CSS` since it landed. In print, `blocks` reaches the figure and the formula and has no code block to move – a listing there sits inside the 42rem measure with nothing to break out of. And both are legal on a `title` or `closing` chunk, where a width, `.bare` and `.center` are refused: a cover's title is a heading and balances like one, so `.wrap-none` has something to act on. `lint.js` exempts them from its cover-chunk refusal for that reason – it refused every class there, and the build refuses only `width || bare || center`, which is the direction this project does not allow.

**`.bare` and `headings: off` hide a heading; they never drop it.** The rule is `display: none`, and the element stays in the DOM because the search index and the speaker's own lists read the heading text out of it - dropping the element would cost search and the cockpit to save nothing. Both are emitted by the **audience renderer only**, so `PRINT_CSS` carries no rule for either and the printed document is byte-identical with and without them. And `off` lives in the existing `style.headings` key beside `left` and `center` rather than in a key of its own: the two readings are one question - what the projection does with a heading - and a second key's only legal combination with this one would have been "off, and also aligned left", which means nothing.

**A figure's all-caps heading is not a generated label and needs no key.** It is the chunk's own heading, set in small caps by `.chunk[data-tag=figure] .chunk-heading`, so writing `## figure: {.wide #id}` with no heading text simply leaves it out – verified. The cost is that the chunk then has no search text and no heading in the printed document, which is a real trade and the reason not to reach for it by reflex. (Not a contents entry: both tables of contents list *column* headings only.)



## The look of a bold phrase (`style.bold`, `style.print-bold`)

Bold is a selection mark here before it is a weight: the collapse lifts a `**bold**` phrase onto the slide as a bullet of its own, and markdown makes it heavy as a side effect. The two keys separate the two. Same closed enum – `plain | bold | italic | accent | accent-bold | accent-italic` – `bold` for the live views (default `plain`), `print-bold` for the documents (default `bold`, in the ink). `BOLD_LOOKS` in build.js is the table, `DERIVED_STRONG` the scope, `boldLookCss()` writes the rules into `AUDIENCE_CSS` and `PRINT_CSS`; the speaker view embeds the audience stylesheet and carries the same body attribute, so it shows exactly what the room sees.

**The scope is the thing to get right when editing it.** The keys reach the strongs the derivation reads – a `strong` inside a `p` that `splitSentencesIn` splits: ordinary prose, and prose inside `::: cols`, `::: side`, a blockquote, a loose list item, a caption and `::: marginalia`. They deliberately do not reach a `::: slide` or `::: script` block, a card's lead or a row's term, an overlay, an expansion, a margin or speaker note, the cover and the section divider – bolds typed for the look, with rules of their own. A tight list's `- **term**` is outside too, so on the slide it keeps `.chunk-body strong`'s accent beside plain bullets; that is the visible edge of the scope, not a bug. The selector's specificity is (0,4,3), above `.chunk-body strong`, PRINT_CSS's bare `strong` and the promoted-bullet rule, which is why that rule no longer names a colour or a weight.

**`*em*` inside a phrase in scope is the stress mark**: upright, the view's bold weight, accent – in every look except `accent-bold`, where the phrase already has all three and the em stays italic, so the old look is exactly the old look. `***x***` is not a construct: marked emits `<em><strong>`, the strong is in scope and the em outside it, so under `plain` it reads as an italic phrase. `test/settings.mjs` holds the guards: the default rule unguarded, the others behind their attribute, the em rule guarded against `accent-bold`, the promoted-bullet rule silent on colour and weight, and `STYLE_SPEC` congruent with lint's `STYLE_ENUMS`.

## Inline code in running text (`style.code`)

`async def` in the middle of a sentence is set in the mono role, and two things about a monospaced face inside a proportional one are measurable rather than matters of taste.

A mono space is about 0.55 em where the prose word space is about 0.25, so a span of more than one token opens a hole: the gap inside `async def` is wider than the gaps around it, and the room reads three words where the author wrote two. And the mono's x-height is the larger of the two – JetBrains Mono is 0.550 against Literata's 0.507 – so at one font-size the code shouts inside its own sentence.

| value | what an inline span gets |
|---|---|
| `plain` | the mono face at `0.92em` and nothing else – the rendering up to 1.0.0 |
| `spaced` | **the default**, and the unattributed rule. `margin: 0 0.15em` and `word-spacing: -0.2em`, on a span that *contains whitespace* only, plus the x-height sizing below |
| `tint` | `padding: 0 0.28em`, a `0.2em` radius and a ground mixed 7% out of `--ink`, on every span, plus the x-height sizing |

**`spaced` reaches only a multi-token span, and that is what `code.nb` is for.** The codespan renderer puts `class="nb"` on a span with no whitespace in it (it already existed, to keep `-->` off a line break), so the selector is `code:not(.nb)`. A single token has no inner hole to close, and a margin on one would be a visible indent wherever such a span opens a line. The margin lifts the gaps *around* the span to about 0.4 em of the prose; the negative word-spacing pulls the gaps *inside* it from about 0.49 down to about 0.31. Outer wider than inner is the whole point.

**`tint` pads left and right and nowhere else.** Vertical padding on an inline box does not grow the line box, so it would not open the leading – it would sit over the line above instead. It also cancels the `spaced` pair it sits on top of (`margin: 0; word-spacing: normal`): a ground already separates the span from its neighbours, and the two together read as a gap.

**The size is computed per lecture, from the roster.** `CODE_XHEIGHT_RATIO * xHeight(prose) / xHeight(mono)`, rounded to three decimals. The ratio is `0.96`: a deliberate 4% under the matched height, because a monospaced face still reads as the heavier of the two at level x-heights, and code inside a sentence should be the quieter one. Every text-role entry of `BUNDLED_FONTS` carries a measured `xHeight` (`tools/font-playground/measure-xheight.mjs`, held against the roster by `node test/gates/run.mjs xheight`).

The prose face is a per-deck choice *and* the reader's `F` key, so the live views get one rule per reading face – `body[data-font=serif|sans|mono]` – and print gets one, for whichever face `print-body` put on the page. Under the default roster that is `0.885em` serif, `0.901em` sans and `0.96em` mono. `codeTag()` emits them after the view's stylesheet, because `AUDIENCE_CSS` and `PRINT_CSS` are constants with no way to ask what this deck resolved to.

**A face from `fonts/` carries no measurement, and neither does anything under `fonts: none`.** That pairing keeps `CODE_SIZE_PLAIN` (0.92em) and the build says so in one `[fonts]` line – a silent fallback is the thing this format refuses everywhere else. The looks themselves still apply; only the size defers.

**`code: plain` restores the pre-2.0 rendering of an inline span**, and it is the only value that needs saying so. The key is shaped like every other one in `styleBodyAttrs`: the default is the unattributed rule, so a deck that says nothing writes no `data-code` at all, and `tint` and `plain` are each reached through the attribute. `plain` rides in the same `<style>` tag as the sizes rather than in the stylesheet, because that is the only place it can outrank them – both land after `AUDIENCE_CSS` at the same specificity, and a reset written up there would lose on source order.

`inlineCodeSel()` in build.js is the one place that says what running text is: not `.chunk-heading code`, not `pre code`, not the blocked-embed card, not `.link-code` (a `<button>`, not a `<code>`).

## Reaching the 1.0.0 look (and why there is no `layout:` key)

From 1.0.0 the source format is the interface, and that promise is about more than parsing: **a lecture that laid out a certain way should be able to lay out that way again.** Six things have moved since 1.0.0 that a finished deck would notice; five are reachable as an ordinary preference and the sixth is listed because it is not:

| what moved | how to get the old behaviour back |
|---|---|
| bundled sans, Inter Tight → IBM Plex Sans | `fonts: {sans: Inter Tight}` |
| `text-wrap: balance` on headings, `pretty` on prose | `style: {wrap: none}` |
| `font-variant-ligatures: none` on code | `ligatures: all` |
| accent-coloured bold phrases, live and on paper | `style: {bold: accent-bold, print-bold: accent-bold}` |
| inline code sized and spaced against the prose face | `style: {code: plain}` |
| corner radii in pixels (2 / 3 / 6 / 10) rather than the `--radius-card` / `--radius-tight` em ladder | not reachable as a setting, and deliberately: the pixel values rounded the *same* card row differently on every slide, because auto-fit sets a card's font-size per slide. There is no old behaviour here worth being able to ask for. |

**There was a `layout: 1.0` umbrella over those three and it was removed. The reasoning generalises and is the part to keep.** One key naming a version reads as a promise that the engine can rebuild any past release, and that promise is unbounded: every later change to a shared stylesheet would have to be gated on a generation, the gates would compose, and the set of combinations nobody tests would grow with every release. It also puts the burden in the wrong place – an author would have to know which version their deck was authored against and write it down, and the project would have to publish and explain a layout-version history beside the software version.

None of that buys anything the settings do not already give, and each of them is a preference an author might want on its own merits: someone who prefers Inter Tight is expressing a view about type, not pinning a release. So the settings stay, the umbrella is gone, and **the 1.0.0 look is a short recipe in the docs rather than a mechanism in the code.**

The list was arrived at by diffing `AUDIENCE_CSS` and `PRINT_CSS` between `v1.0.0` and `HEAD` rather than by reading commit titles – 185 commits, of which these are the ones that touch an existing slide. **Repeat that diff before claiming the list is still complete**, and prefer adding a setting to adding a generation.

**The recipe was verified against the real thing, when it had three lines.** The same source built through `git show v1.0.0:build.js` and through HEAD with all three set came out **pixel-identical** – 0 differing pixels by `magick compare -metric AE`, at 1440×810 and `deviceScaleFactor: 2`, on a deck carrying a principle chunk, prose with `fi`/`fl` pairs, and a listing containing `->` and `!=`. The bold pair came later and was not re-measured; its one known departure is a promoted bullet under `accent-bold`, which now weighs the deck's bold weight – 600 in a sans deck where 1.0.0 had a fixed 500. `code: plain` came later still, and it reaches the old rendering through a reset rather than through the original declarations: what the recipe promises is the same rendering, not the same bytes of CSS. That comparison cannot be a standing test, because it needs a checkout of the old build; `test/settings.mjs` is what stands in for it and guards the mechanism the comparison proved.

**Its load-bearing assertions are the guards, not the outcomes.** An edit that drops the `body:not([data-wrap=none])` wrapper from the text-wrap rules leaves `style.wrap` silently doing nothing, and every outcome-shaped check still passes. It runs from `npm test` between the fast gates and the browser suite, and in `pages.yml` and `release.yml` – **not** in `gates.yml`, which has no `npm ci` by design and could not build a lecture.

Deliberately outside the promise: the title chunk now fills the slide and drops its slide number. Both are cover fixes, a cover is one slide, and pinning them would mean carrying the old centring rules for a composition nobody wants back.

