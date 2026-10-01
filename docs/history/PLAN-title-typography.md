# Title typography: the headline pair, the credit slots, and the dark cover

The opening slide, the section dividers and the closing slide are being
reworked together. Two real slides from talks given with another tool are the
brief; this plan says what the tool is missing to draw them, and what of it is
one mechanism rather than five.

## The two reference slides

**A – a lecture opening, light ground.** A thin tracked line of capitals
(`DATENSICHERHEIT IM DIGITALEN ALLTAG:`) over a heavy mixed-case line
(`Warum klappt das nicht so gut?`); a gap; then four credit lines in four
distinct ranks – the speaker in bold capitals, the institution quieter under
it, and along the bottom edge a contact on the left against an italic aside on
the right (`Link zu den Folien am Ende.`).

**B – a project talk, dark ground, light rest of the deck.** A full-bleed
photograph, type reversed out of it, the title block at the top rather than at
the foot, and the same four credit ranks stacked down the left.

## What the tool has today

- Every one of the three slide kinds already carries a **pair of lines**. The
  cover takes its pair from the frontmatter (`title:` / `subtitle:`,
  `renderTitleBlock`, build.js:5435); a divider and a closing slide take theirs
  from the chunk heading (`## closing: Heading | Sub`, `renderClosingBlock`,
  build.js:5480). In all three the first line is the loud one and the second is
  quieter underneath it. Reference slide A wants that inverted.
- The credits are **one strong line plus a run of equals**: `presenter:`, then
  `info:` split into lines by `splitInfo` (build.js:5424) and set identically.
  Four ranks cannot be said.
- **A closing slide deliberately carries no credits at all** (the reasoning is
  written out at build.js:5462) – the argument being that repeating who is
  talking and where reads as a mistake in the deck. That argument holds for the
  venue and the date. It does not hold for the one line a closing slide is most
  often asked to carry, which is where the slides can be found.
- **The dark cover is already a mechanism.** `cover: hero` emits an inverted
  backdrop from `cover-image` (build.js:5697) and `.chunk[data-backdrop=invert]`
  (build.js:9283) re-points `--ink` / `--ink-soft` / `--rule` / `--emph` on that
  chunk alone, so the rest of the deck stays light. What is missing for
  reference slide B is the credit slots and one gradient.
- `style:` is the established home for a deck-wide typographic decision
  (`STYLE_SPEC`, build.js:5105), mirrored in `lint.js` (`STYLE_ENUMS`,
  lint.js:107). `closing-image:` (build.js:1628) is the established shape for a
  `closing-*` key that repeats something from the cover, with `cover` as a
  reserved word meaning *the one the deck opened with*.

## The load-bearing decision

`title:` stays the loud line's *content* key even when it is set quiet.

`title:` is also the `<title>` element, the TOC entry and what the search index
reads. Inverting the hierarchy by telling authors to put the hook in `title:`
would rename the browser tab to `Warum klappt das nicht so gut?`. So the
content keys do not move: what changes is the **treatment** of a pair that is
already there, and it changes for all three slide kinds at once, which is why
it belongs in `style:` rather than in a cover variant.

---

## Slice 1 – the headline pair

A new `style:` key, two values:

```yaml
style:
  headline: stacked    # title loud, subtitle quieter underneath (default: today)
  headline: eyebrow    # title quiet above, subtitle carries the weight
```

Reference slide A becomes:

```yaml
title: "Datensicherheit im digitalen Alltag:"
subtitle: Warum klappt das nicht so gut?
style:
  headline: eyebrow
```

**Implementation.** The key resolves to `body[data-headline=eyebrow]`, and the
stylesheet swaps size, weight and colour between `.title-main` and
`.title-subtitle`. Source order is already eyebrow-then-headline, so nothing
reorders and no renderer changes. The same attribute governs
`renderClosingBlock`'s pair and the divider's, so a deck that opens on an
eyebrow closes and divides on one.

**What it must not do:** change the collapse, the search index or the TOC. The
eyebrow is `.title-main` throughout; only its type changes.

**Cost.** One `STYLE_SPEC` entry, one `STYLE_ENUMS` mirror, roughly a dozen CSS
rules (the base pair plus the variants that set their own sizes – `masthead`,
`display`, `panel`, `quote`, `split`, `hero`, `stack`, `above`), and the same
pair for `PRINT_CSS`.

## Slice 2 – capitals, and the tracking that has to come with them

Capitals set at the tracking of lowercase read as a jammed word. That is a
typographic rule and not a preference, so it is not a key: **the build applies
it itself.**

- **No key, automatic.** `renderTitleBlock` marks any slot whose text is
  already all capitals (`s === s.toUpperCase()` with at least one uppercase
  letter, tested on the source string) with `data-caps`, and the stylesheet
  gives `[data-caps]` a `letter-spacing` of about `0.055em`. This repairs decks
  where somebody has typed `presenter: PROF. DR. …` today, without their
  asking.
- **One key, for the transformation.**

  ```yaml
  style:
    caps: off    # default: nothing moves
    caps: on     # eyebrow, presenter, affiliation and the divider mark go to capitals
  ```

  `text-transform: uppercase` on those four, and the tracking follows by the
  rule above (the CSS matches `[data-caps], body[data-caps=on] .title-eyebrow, …`).

**What `caps: on` must never reach:** the headline, prose, a card, the foot
row. A key that capitalises the slide's loud line is a key that makes a talk
shout, and the two reference slides both keep their headline mixed-case.

**Open question, worth answering before building:** whether `off` / `on` is
enough, or whether the values should name which family goes to capitals
(`off` / `eyebrow` / `credits` / `on`). Both reference slides want the whole
family, so `off` / `on` is proposed, and a third value can be added later
without breaking a deck.

## Slice 3 – the credit slots

Three new frontmatter keys beside `presenter:` and `info:`:

```yaml
presenter:   Prof. Dr. Dominik Herrmann
affiliation: Otto-Friedrich-Universität Bamberg
contact:     "@herdom · https://herdom.net/"
notice:      Link zu den Folien am Ende.
info: |
  Antrittsvorlesung
  12. September 2026
```

Four ranks, four classes:

| key | class | treatment |
| --- | --- | --- |
| `presenter:` | `.title-presenter` | strong, full ink – unchanged |
| `affiliation:` | `.title-affiliation` | quieter, directly under the presenter |
| `info:` | `.title-info` | the meta rows – unchanged |
| `contact:` / `notice:` | `.title-foot` | one row, `space-between`, contact flush left, notice flush right and italic |

The foot row is the construction `masthead` already uses for `.title-info`
(build.js:8679), so it is a known shape rather than a new one, and it inherits
each variant's colour handling – on `panel` and `hero` the reversed ink reaches
it the same way it reaches the presenter.

Naming: `notice:` rather than `note:` (the speaker notes), `hint:` (reads as
interface help) or `aside:` (`::: footnote` and `::: marginalia` are already
that idea). It is the line a speaker puts on a slide to stop a question –
*the slides are online*, *photographs are fine*.

**Additive.** A deck writing none of the three keys renders byte-identically.

**Refusal to consider, and the argument against it.** `cover-ratio` set on a
cover that does not divide the slide is refused, on the ground that this format
does not accept a silent no-op. The analogous refusal here would be
`affiliation:` on a variant that draws no credits. It is not proposed: all ten
compositions carry a credit block, so there is nothing to refuse. If a variant
is later added that drops the credits, the refusal comes with it.

## Slice 4 – the credits on the closing slide

The closing slide currently carries no credit fields by design. The fix is
opt-in and takes the shape `closing-image:` already established – a `closing-*`
key with `cover` as the reserved word for *the one the deck opened with*:

```yaml
closing-credits: none     # default: today's behaviour
closing-credits: contact  # the foot row only – contact and notice
closing-credits: cover    # the whole credit block the cover carried
```

`contact` is the value expected to earn its keep: a closing slide that repeats
the speaker's name reads as a duplicate, and a closing slide that repeats where
the slides live is answering the question the room is about to ask. `cover` is
there for the deck that ends on a full restatement, which some conference talks
want.

**Deferred, not refused:** per-closing overrides (`closing-contact:` for a
slides URL that differs from the cover's contact). It is one more key for a
case nobody has hit yet; the escape hatch until then is the closing chunk's own
body, which already renders.

## Slice 5 – the dark cover with a light deck

Reference slide B is `cover: hero` plus `cover-image:` plus the Slice 3 slots,
and most of it works today. Two things do not:

1. **The scrim points the wrong way when the type moves up.** `hero`'s gradient
   runs dark at the bottom to light at the top (build.js:8945), because `hero`
   places its type at the foot. `cover-align: top` is accepted on `hero`
   (`COVER_ALIGN_VARIANTS`, build.js:1627) and puts the type where the scrim is
   thinnest – white type on the bright half of a photograph. **Fix:** the
   gradient reads the align, `to bottom` under `cover-align: top` and
   `to top` otherwise. This is a bug in the existing composition, found while
   planning this work, and it is worth landing whether or not the rest does.
2. **There is no dark cover without a photograph.** `::: backdrop` requires an
   asset (build.js:3947), so the invert machinery can only be reached through a
   picture. A deck that wants a dark opening slide and no image has no path.
   **Proposed:** `cover-ground: paper | ink`, where `ink` puts
   `data-backdrop=invert` on the title chunk with no backdrop element under it.
   One key, reusing the token re-pointing that already exists, and it composes
   with every variant rather than adding an eleventh.

Item 2 is separable and can be dropped if it looks like scope. Item 1 should
not be.

## Refusals and mirrors

- `style: {headline, caps}` – `STYLE_SPEC` in build.js and `STYLE_ENUMS` in
  lint.js, **in the same commit**. An unknown value is `unknown-style-setting`,
  an error, through the `buildOnce` pre-flight, so `--print-only` refuses a
  typo too.
- `closing-credits:` and `cover-ground:` – validated in `coverSettings`
  (build.js:5526) beside `cover-align` and `closing-image`, with the same
  shape of message: what was written, what the legal values are, what each one
  does. `lint.js` does not validate cover content keys today and need not start.
- The three content keys (`affiliation`, `contact`, `notice`) need no
  validation: they are free text, like `presenter:` and `info:`.

## Files touched

| file | what |
| --- | --- |
| `build.js:5105` `STYLE_SPEC` | `headline`, `caps` |
| `build.js:5435` `renderTitleBlock` | three slots, the foot row, `data-caps` detection |
| `build.js:5480` `renderClosingBlock` | the pair attribute, and the opted-in credit block |
| `build.js:5526` `coverSettings` | `closing-credits`, `cover-ground` |
| `build.js` AUDIENCE_CSS ~8515–9060 | the pair swap, `.title-affiliation`, `.title-foot`, the `hero` gradient |
| `build.js` PRINT_CSS ~6418 | the same, reduced – print keeps the credits and drops nothing |
| `lint.js:107` `STYLE_ENUMS` | the two new keys |
| `.claude/skills/psi-slides-decoration/SKILL.md` | the credit slots, `closing-credits`, `cover-ground` |
| `.claude/skills/psi-slides-appearance/SKILL.md` | `headline`, `caps` |
| `lectures/decoration/source.md` | the constructs shown rather than described; rebuild `audience.html` + `print.html` |
| `CHANGELOG.md` | under `## [Unreleased]` |

## Order and the shared tree

Another session is working on overlay and backdrop in this same working tree
and this same file. The overlap is narrow but real: `STYLE_SPEC` /
`STYLE_ENUMS`, and the `hero` gradient sits in the decoration half of
AUDIENCE_CSS. **Land that work first, then build this as one slice**, and
commit with an explicit pathspec.

Within this plan the order is: Slice 5 item 1 (the gradient bug, standalone) →
Slice 3 (the slots; the other slices style what it emits) → Slice 1 → Slice 2 →
Slice 4 → Slice 5 item 2.

## Verification

- `node lint.js lectures/` clean, and a deliberate typo in each new key refused
  by both `node build.js` and `node lint.js`.
- A deck writing none of the new keys builds byte-identically: build
  `lectures/tutorial` before and after and `diff` the four views.
- `node build.js lectures/decoration/source.md --check-fit` at 1600×900, since
  a foot row is a new element at the bottom of the frame.
- Both reference slides rebuilt in `lectures/decoration/` and read at
  projection distance – the tracking on capitals and the eyebrow's contrast are
  decisions no gate can make.

## Open questions

1. `masthead` draws a 2px folio rule over its credits (build.js:8667), because
   a short title left the field looking empty. With an affiliation and a foot
   row the credit band asserts the width itself. Drop the rule under
   `:has(.title-affiliation)` – the same *read what you were given* rule the
   variant's auto-size already follows – or keep it unconditionally?
2. `caps:` as `off` / `on`, or as the family-naming set
   (`off` / `eyebrow` / `credits` / `on`)?
3. `contact:` often holds a URL, and the tool can already put a build-time QR
   code beside an address (`style: {link-codes}`). Offer one on the cover's
   contact line, or keep the opening slide free of it?
