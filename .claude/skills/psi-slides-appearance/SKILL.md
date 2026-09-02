---
name: psi-slides-appearance
description: How a psi-slides lecture's look is configured and where those settings live in `build.js` – the three-family bundled webfont roster and the `fonts:` block (including author-supplied files in `fonts/`), `ligatures:`, `lang:` and print hyphenation, the seven themes and `body[data-mode]`, the six viewer-default frontmatter keys, the `style:` block including `labels` and `blocks`, the four chunk classes that answer `wrap` and `blocks` for one slide, and the three-line recipe that reproduces the 1.0.0 look. Use when changing the font roster, `FONT_STACK_TAILS`, `THEME_NAMES`, `VIEW_DEFAULT_SPEC`, `STYLE_SPEC`, `CHUNK_STYLE_CLASSES`, the `style:` block, or their `lint.js` mirrors, or when a lecture renders in the wrong face, theme, default or block alignment.
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

**`FONT_STACK_TAILS` is the single source of truth for the default stacks**, and a roster family other than the built-in default is emitted as an override that prepends it – otherwise the `@font-face` lands and nothing asks for it, because `--sans-font` still says `IBM Plex Sans` first and falls through to whatever the machine has. Emitted only where it differs, so a default lecture's CSS is byte-identical to before. `font-display: block`, not `swap`: a lecture must not flash a fallback face on the projector and then reflow the slide under the room's eyes. The bytes are read and base64-encoded **once** in `buildOnce` and passed to all four renderers via `opts.fontEmbed`.

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
- `font-display: block`, not `swap`. A lecture must not flash a fallback face on the projector and then reflow the slide under the room's eyes.
- The bytes are read and base64-encoded **once** in `buildOnce` and passed to all four renderers via `opts.fontEmbed`. Don't move the call into a renderer; that quadruples the work.

`lint.js` deliberately does **not** mirror this check. It would need `fs` plus the whole filename-parsing table, and the build already hard-fails with the list of files it found – so unlike `VALID_TAGS`, the duplication would buy nothing.

**Licensing is the author's problem and the docs say so.** Embedding redistributes the font file. SIL OFL and Apache-2.0 (between them nearly all of Google Fonts) permit it; most commercial *desktop* licences do not, and want a separate webfont licence. The build prints a reminder and makes no attempt to check.

## Ligatures

`ligatures:` in the frontmatter, and the reason it needs a key at all is that **two different questions get called "ligatures"**:

- **text** – `fi`, `fl` and friends in prose. On by default and always has been; that is ordinary typesetting, not an effect.
- **code** – `->` drawn as a single arrow glyph in a listing. **Off since `7eec831`**, and off for a reason worth keeping: JetBrains Mono ligates `->`, `<-`, `<->`, `--` and `!=`, and in the figure grammar `->` and `--` are two *different edges*. Every listing on a slide, in a handout, on the project site and on the artifact page is source a reader is meant to retype, and what the room saw was a character that does not exist in the language.

So the values are `text` (the default: fi and fl in prose, none in code – exactly what the tool does today), `none` (none anywhere, prose included) and `all` (code ligatures back). **The default is `text` and not `none`** even though `none` is what "default: no ligatures" would suggest: code ligatures are already off, and defaulting to `none` would take fi and fl out of every existing lecture's prose, which is a change to finished decks made in the name of not changing finished decks. The rule is `font-variant-ligatures`, and `none` rather than `no-contextual` because the arrows live in the contextual set (`calt`) and the rest in `liga`.

## Document language and hyphenation

`lang:` in the frontmatter (default `en`) lands in the `lang` attribute of `<html>` for all four views. It is not decoration: the browser picks its **hyphenation dictionary** from it, so `hyphens: auto` in the print stylesheet does nothing useful for a German lecture until the author writes `lang: de`. A value that is not a plausible BCP-47 tag fails the build.

Hyphenation is **prose-only, and by default document-only**. A hyphenated word on a projection reads badly and the live views reflow constantly; and because the `hyphens` property inherits, headings, code, and URLs are explicitly set back to `manual`, or the build would hyphenate an identifier.

`style: {hyphenate: …}` is the author's say over which views do it, and its default is exactly the behaviour above:

| value | print / print-notes | audience / speaker |
|---|---|---|
| `print` (default) | hyphenates | does not |
| `all` | hyphenates | hyphenates |
| `none` | does not | does not |

**It is a `style:` key and `lang:` is not, and that split is the point.** The language is a property of the lecture – it decides the dictionary, and it is wrong rather than unfashionable if it disagrees with the words – while whether the projection breaks a word is a preference a German deck may answer either way. `all` exists for the case that forced it: a German compound at `.narrow`, where one word opens a hole in the measure that no rewriting closes.

Two things about the live rule are load-bearing. It is **scoped to `#stage`**, so it is the slide's prose and never the chrome – a TOC entry, a search hit and the help sheet are lists a reader scans, and a broken word in one of those is only harder to scan. And it repeats PRINT_CSS's **`manual` reset** for headings, code and URLs, for the same inheritance reason. The print rule is wrapped `body:not([data-hyphenate=none])`, and that wrapper is the guard `test/settings.mjs` holds: drop it and `none` silently does nothing while every outcome-shaped check still passes.

What the key deliberately does **not** reach: the `hyphens: auto` inside a `::: cards` card and a `::: rows` term. Those are not a typographic preference but the rescue for a 320px measure a long word overflows outright, with `overflow-wrap: break-word` as the floor under them, so they answer a different question and keep answering it in all three settings.

The cover treatment for `title` chunks also lives in `@media print` now. The base rule used to be a full-height block with the title pinned to the bottom edge, which is right on paper and wrong for `print.html` in a browser, where you opened a document and saw a screen of nothing.

## Themes, dark mode, and `data-mode`

Seven themes cycle on `A`: four light accents, a neutral `dark` (grey paper, white ink, accent lifted so it carries), and the two `terminal-*` phosphor modes. `dark` is an ordinary reading theme that happens to be dark, so Shiki's syntax colours and the accent stay; the terminal modes deliberately suppress both to read as one phosphor tone.

`THEME_NAMES` and `DARK_THEME_NAMES` in build.js are the single source of truth. The runtime's `THEME_CYCLE`, the frontmatter validator (`VIEW_DEFAULT_SPEC`) and the pre-paint boot script are all interpolated from them, so adding a theme is a one-line change. `lint.js` mirrors the list, same contract as `VALID_TAGS`.

`applyFontTheme()` also sets **`body[data-mode]`** to `dark` or `light`. Chrome around the slide – help sheet, TOC, search panel, the cockpit footer and its key crib, the export modal – was written against paper and carries fixed near-white backgrounds; those overrides key off `data-mode`, not off individual theme names, so a new dark theme needs no new selectors and the terminal modes inherited the fix (they had the same problem; only the help-sheet `kbd` had ever been patched).

**Theme precedence extends the viewer-default rule with the OS**: frontmatter wins over the reader's stored preference, which wins over `prefers-color-scheme`, which wins over the built-in default. The resolution happens in `themeBootScript()`, emitted as the **first child of `<body>`** so a synchronous script settles it before the first paint – otherwise a reader on a dark system gets a white flash while the module boots. When the frontmatter pins the theme no script is emitted at all. `loadPersisted()` reads the answer back off the body attribute instead of re-deriving the precedence, so the two cannot disagree.

## Viewer defaults in the frontmatter

Seven optional frontmatter keys pin how a lecture opens:

| key | values | default |
|---|---|---|
| `font` | serif / sans / mono | serif |
| `theme` | the seven accent / dark / phosphor names | light-red |
| `collapse` | topic-bold / none | topic-bold |
| `auto-fit` | true / false / **shrink** | false |
| `slide-numbers` | vertical / **horizontal** / off | **horizontal** |
| `print-slide-numbers` | vertical / horizontal / off | *follows `slide-numbers`* |
| `editor` | both / speaker / none | both |

`editor` is not a look but a payload – whether the live views carry the diagram editor – and it goes through this machinery rather than growing its own because the failure mode is identical: a typo would otherwise cost the lecture its editor silently. The precedence rule is one sentence: **a key that is present wins over the reader's stored preference; a key that is absent leaves that preference alone.** So lectures that say nothing behave exactly as before – font, theme and slide numbers keep following the reader across lectures – and an author who has designed a particular look gets it without asking anyone to press keys.

**Three of those entries are newer than 1.0.0, and each carries a decision the table cannot show.**

**`slide-numbers` defaults to `horizontal`, and it used to default to `vertical`.** This is the one viewer default whose change moves what an existing deck renders: the stacked form sets each digit on its own line, so slide 10 reaches the room as a 1 above a 0. The content repo's house-style file had carried "set `slide-numbers: horizontal`" as standing advice, which is what a wrong default looks like from the outside. The old rendering is `slide-numbers: vertical`, and deliberately no compatibility flag was added beside it – one more key would make the old behaviour reachable two ways.

**`print-slide-numbers` has no default of its own; it *defers*.** An absent key resolves at read time to the live value, and only if that is absent too does `SLIDE_NUM_DEFAULT` apply. `viewDefaults()` writes a key only when the frontmatter carried it, so "unset" is a fourth state distinguishable from all three values, and **`printSlideNums(frontmatter)` is the documented step** that turns it into one – `d.printSlideNums || d.slideNums || SLIDE_NUM_DEFAULT`, in that order, in one place. Reading the key anywhere else with a fallback of `SLIDE_NUM_DEFAULT` would silently drop the deferral and make an unset key mean `horizontal` rather than "follow". `test/settings.mjs` asserts all sixteen combinations of the two keys.

**`auto-fit` has three modes and its frontmatter words are not its runtime words.** The file says `true` / `false` / `shrink`; the runtime carries `full` / `off` / `shrink`, because a boolean cannot hold three states and because `state.autoFitMode` must never be read for truthiness – all three words are truthy strings. `AUTO_FIT_FROM_KEY` is the one place the two vocabularies meet, `autoFitOn()` is the test, and `autoFitCeiling()` is the whole of the difference between the two on-modes: `2.2` for `full`, `collapsedZoom` (the lecturer's own zoom) for `shrink`, so shrink can only ever take size away. `#` cycles `off → shrink → full`, and `Shift` does **not** reverse it as it does on `C`, `F`, `A` and `L` – `#` is Shift-3 on a US layout and unshifted on a German one, so `e.shiftKey` carries no portable information there.

The mode also travels as **two fields in the state snapshot**, `autoFitMode` (the word) and `autoFit` (a boolean), because `audience.html` and `speaker.html` are separate files and `--audience-only` rebuilds one of them: a peer built before the third mode coerces `payload.autoFit` with `!!`, so sending it `'off'` would switch it on. `normAutoFit()` reads either back, and `applyRemoteState` prefers the word when there is one. What travels in `zoom` is the *setting* (`zoomBase()`), never the shrunk value, so each window re-solves the shrink against its own size – `applyRemoteState` calls `fitZoomToChunk(collapsedZoom)` in that mode where it calls `clampZoomToWidth()` otherwise. Full auto-fit deliberately keeps adopting the sender's fitted zoom, which is what it has always done.

An unknown value **fails the build** (`err.userFacing`, no stack trace) rather than being ignored, because a typo here is otherwise invisible: the lecture still builds and still looks fine, it just looks like the author never set anything. `lint.js` mirrors the table as `VIEW_DEFAULTS` and reports `unknown-view-default` as an error – keep the two in sync, same rule as `VALID_TAGS`.

See the `psi-slides-decoration` skill for `cover`, `subtitle`, `cover-image` and the `style:` block, which are the author's composition rather than the reader's preference and so are validated separately.

## Hiding the generated labels (`style.labels`)

The tag word above a chunk is **two different things wearing one name**, and a switch has to reach both: the document renderer emits `<span class="chunk-label">` for principle, question, definition and exercise, while the projection generates only `EXERCISE`, in CSS – the one eyebrow that survived the removal of the others (PRD §2.1). So most of what an author sees as "the eyebrows" is in `print.html`, and a check in the audience view alone will report that there is nothing to hide.

`style: {labels: off}` hides both. **It is its own key rather than part of `rules`**, which hides the bar over a principle and the hairline over a definition: a word and a line are not one decision, and an author may well want the line and not the word.

## Where the blocks sit (`style.blocks`), and the two keys a chunk can answer

`STYLE_SPEC` in build.js is the whole `style:` block, mirrored in `lint.js` as `STYLE_ENUMS` (the enums only – the two scales are bounded numbers, and reading a number out of YAML with no parser is where a linter starts disagreeing with the build). The keys: `headings` (auto/left/center/off), `rules` (on/off), `labels` (on/off), `link-codes` (on/off), `wrap` (balance/none), `blocks` (center/left), `hyphenate` (print/all/none), `print-body` (serif/sans), `heading-scale` and `body-scale` (0.6–1.8).

## The printed document's face (`style.print-body`)

The live views have answered "serif, sans or mono" since the first commit – `F` cycles it, `font:` pins where a lecture opens – and print answered nothing, because `PRINT_CSS` names `var(--serif)` on `html`. `style: {print-body: sans}` is that switch, `serif` is the default, and `print-notes.html` gets it free because it is the same renderer with `withNotes`.

**Two things about it are worth keeping.** It is **one declaration on `body`**, not a list of elements. Everything in `PRINT_CSS` that ought to be a sans already names one – the tag word, a figure's caption, a `.has-sub` sub-heading, the contents list – so what inherits the serif off `html` is exactly the set that should move: running text, chunk and column headings, blockquotes. Measured rather than assumed, and the first attempt at this enumerated `p, li, dd, blockquote, figcaption, td, th` from a wrong reading of which elements were already sans. An element list here is only a way of getting the set slightly wrong later.

And it **does not defer to `font:`** the way `print-slide-numbers` defers to `slide-numbers`. That key was born deferring, so nothing moved under any existing deck; here, a lecture that already says `font: sans` for the room would start printing in a sans it never chose. `font: mono` also has no sensible reading as a whole printed document, and a deferral would have to invent one.

It lives in `style:` rather than beside the viewer defaults because it is the author's composition, not the reader's preference – and `hyphenate` is already here on the same reasoning, which is what makes a print-only key ordinary in this block rather than novel.

`blocks` is the newest and the only one that moves something other than type. Three things on a slide are not prose and have always been centred – a code block, a figure with its caption, a display formula – and `left` puts all three on the prose's own axis. **Which thing moves is different for each, and that is the part to know before editing the rules.** A top-level `pre` already breaks out of the text column to 72vw; what centres it is `left: 50%` plus a translate, so `left` moves the *box* and the listing inside it was left-aligned all along. A figure and a formula are already the full measure, so it is the artwork, the caption and the equation *inside* the box that move (`align-items` and KaTeX's own `text-align`, two rules deep).

The one number worth checking after any edit: the left-aligned breakout's cap is `calc(var(--slide-w) * 0.36 + 50%)`, which is exact rather than cautious. A column centred on the slide has `(slide − column) / 2` to its left, so the room between its left edge and the content area's right edge is `0.36 × slide + half the column`. That keeps the 78-character code budget identical to the centred case at every chunk width and never crosses the slide's 14% padding. `test/block-align.mjs` measures it at two chunk widths and two window sizes, because arithmetic that happens to agree at one size is not arithmetic.

**A `::: draw` is deliberately not in the key.** Its `<svg>` is emitted 2000px wide under `max-width: 100%`, so it fills the measure at every chunk width and has no space beside it to align in. (A tall diagram capped by `max-height: 62vh` does sit left today with space to its right; making that follow `blocks` would mean changing what an existing deck draws, which is a separate decision.)

**`wrap` and `blocks` are the only two keys with a per-chunk form**, and the rule is one line: a chunk class spelled `<key>-<value>` overrides that key for that chunk. `.wrap-none`, `.wrap-balance`, `.blocks-left`, `.blocks-center` – `CHUNK_STYLE_CLASSES` in build.js, mirrored in `lint.js`. Both directions of both keys, because under a deck-wide `wrap: none` the only way left to ask for balancing is to ask for it on the chunk. Only these two, because they are the two whose right answer changes from slide to slide; `headings`, `rules` and `labels` are decisions a deck makes once, and a class for each would be four more guards in two stylesheets for nothing.

The attribute names are the body's, so one stylesheet serves both levels and the chunk wins on specificity alone – `.chunk[data-wrap=none]` is two classes where `body:not([data-wrap=none])` is one class and one element. **In `AUDIENCE_CSS` the chunk rules are prefixed `#stage` and that is load-bearing**: the deck-wide heading rule carries an id (`#toc-panel li` rides in its `:is()` list), so a chunk-scoped rule made of classes alone loses to it however many classes it stacks. `#stage` is the element every chunk in both live views is inside, so it is the honest way to buy the id the cascade is asking for, and it also keeps every `blocks` rule off the focus overlay, whose clone of a figure is centred because a modal card is centred rather than because the slide is.

**Unlike `.bare` and `.center`, both classes reach the printed document.** Those two answer where words sit on a *slide*, which a page does not ask; where a formula sits relative to the paragraph that introduced it is the same question on paper, and `style.wrap` has been in `PRINT_CSS` since it landed. In print, `blocks` reaches the figure and the formula and has no code block to move – a listing there sits inside the 42rem measure with nothing to break out of. And both are legal on a `title` or `closing` chunk, where a width, `.bare` and `.center` are refused: a cover's title is a heading and balances like one, so `.wrap-none` has something to act on. `lint.js` exempts them from its cover-chunk refusal for that reason – it refused every class there, and the build refuses only `width || bare || center`, which is the direction this project does not allow.

**`.bare` and `headings: off` hide a heading; they never drop it.** The rule is `display: none`, and the element stays in the DOM because the search index and the speaker's own lists read the heading text out of it - dropping the element would cost search and the cockpit to save nothing. Both are emitted by the **audience renderer only**, so `PRINT_CSS` carries no rule for either and the printed document is byte-identical with and without them. And `off` lives in the existing `style.headings` key beside `left` and `center` rather than in a key of its own: the two readings are one question - what the projection does with a heading - and a second key's only legal combination with this one would have been "off, and also aligned left", which means nothing.

**A figure's all-caps heading is not a generated label and needs no key.** It is the chunk's own heading, set in small caps by `.chunk[data-tag=figure] .chunk-heading`, so writing `## figure: {.wide #id}` with no heading text simply leaves it out – verified. The cost is that the chunk then has no search text and no heading in the printed document, which is a real trade and the reason not to reach for it by reflex. (Not a contents entry: both tables of contents list *column* headings only.)



## Reaching the 1.0.0 look (and why there is no `layout:` key)

From 1.0.0 the source format is the interface, and that promise is about more than parsing: **a lecture that laid out a certain way should be able to lay out that way again.** Exactly three things have moved since 1.0.0 that a finished deck would notice, and each is reachable as an ordinary preference:

| what moved | how to get the old behaviour back |
|---|---|
| bundled sans, Inter Tight → IBM Plex Sans | `fonts: {sans: Inter Tight}` |
| `text-wrap: balance` on headings, `pretty` on prose | `style: {wrap: none}` |
| `font-variant-ligatures: none` on code | `ligatures: all` |

**There was a `layout: 1.0` umbrella over those three and it was removed. The reasoning generalises and is the part to keep.** One key naming a version reads as a promise that the engine can rebuild any past release, and that promise is unbounded: every later change to a shared stylesheet would have to be gated on a generation, the gates would compose, and the set of combinations nobody tests would grow with every release. It also puts the burden in the wrong place – an author would have to know which version their deck was authored against and write it down, and the project would have to publish and explain a layout-version history beside the software version.

None of that buys anything the three settings do not already give, and each of them is a preference an author might want on its own merits: someone who prefers Inter Tight is expressing a view about type, not pinning a release. So the settings stay, the umbrella is gone, and **the 1.0.0 look is a three-line recipe in the docs rather than a mechanism in the code.**

The list was arrived at by diffing `AUDIENCE_CSS` and `PRINT_CSS` between `v1.0.0` and `HEAD` rather than by reading commit titles – 185 commits, of which these are the ones that touch an existing slide. **Repeat that diff before claiming the list is still complete**, and prefer adding a setting to adding a generation.

**The recipe was verified against the real thing.** The same source built through `git show v1.0.0:build.js` and through HEAD with all three set came out **pixel-identical** – 0 differing pixels by `magick compare -metric AE`, at 1440×810 and `deviceScaleFactor: 2`, on a deck carrying a principle chunk, prose with `fi`/`fl` pairs, and a listing containing `->` and `!=`. That comparison cannot be a standing test, because it needs a checkout of the old build; `test/settings.mjs` is what stands in for it and guards the mechanism the comparison proved.

**Its load-bearing assertions are the guards, not the outcomes.** An edit that drops the `body:not([data-wrap=none])` wrapper from the text-wrap rules leaves `style.wrap` silently doing nothing, and every outcome-shaped check still passes. It runs from `npm test` between the fast gates and the browser suite, and in `pages.yml` and `release.yml` – **not** in `gates.yml`, which has no `npm ci` by design and could not build a lecture.

Deliberately outside the promise: the title chunk now fills the slide and drops its slide number. Both are cover fixes, a cover is one slide, and pinning them would mean carrying the old centring rules for a composition nobody wants back.

