# TODO – inconsistencies in the `{…}` tails, and how to finish the job

Collected while making every setting in a tail dot-mandatory (commit
87bcc86). That commit left the format with one *spelling* rule but still
four implementations of it, one directive that breaks the rule, and lint
codes that name the same refusal six ways. This file is written so a fresh
session can implement each item without re-deriving it. Every entry has:
what it is, what has been checked (with anchors), what to check before
touching it, the plan, the risks, and the tests that pin it.

Three reviews of earlier drafts (Codex, 2026-09-04) found six, seven and
seven gaps. Each is resolved in place below and marked **[review]**,
**[review 2]** or **[review 3]** where the text changed; the "Review trail" section at the
end lists them so nothing was folded in silently.

The end state all items aim at, in one line each:

```
## principle: Heading {.wide .bare #id}
::: cards 3 {.outline .middle}
::: rows {.accent}
::: side 2:1 {.middle}
::: backdrop dusk {.cover .invert} reveal full, right 45%
::: overlay {.bottom-left .ink} from 2
::: draw 150x56 autoplay 1200 cycle
```

**Braces hold sigil tokens only** (`.word` setting, `#word` id, and inside a
draw body also `@word` group and `!word` removal), **and a line that has no
sigil tokens to carry has no braces** – the draw opener, after item 4, is
one. **The one primary argument is positional, before the braces.**
**Anything optional that carries a value is a keyword after the braces.**

Suggested order: item 1 (one parser module, with 2 and 3 folded in), then
item 4 (draw opener), then item 5 (docs). Items 6–7 are already resolved or
explicitly deferred.

---

## 1. One tail parser, one module, imported by build.js and lint.js

**What it is.** The `{…}` grammar is implemented four times: `parseAttributeTail`
(heading tails) and `parseSlotClasses` (directive tails) in `build.js`,
and `parseAttributeTail` + `tailSlotProblems` and `slotProblems` in
`lint.js`. Each pair refuses the same three things – a token without its
sigil, a word from no slot, two words from one slot – with separately
maintained code and message text. Every slot table is declared twice with a
"Mirrors X in build.js" comment on the lint side.

**Checked.**
- `build.js` is ESM (`import … from './diagram-core.mjs'`, line 33).
  `lint.js` is ESM and imports **tables and small helpers** from
  `diagram-core.mjs` (lint.js:311–327: `DG_KEYWORDS`, `DG_CLASSES`, …,
  `rejectSlotPair`, `DG_HOST_OPTS`) – not `createDiagramCompiler` or
  `parseDiagramSource`. **[review]** The first draft said "imports the
  compiler"; it does not, and the distinction is the contract in item 1c.
- The five mirrored constants with the comment
  (`grep -oE "Mirrors? [A-Z_]+ in build.js" lint.js`): `CARDS_SLOTS`,
  `CHUNK_STYLE_CLASSES`, `SIDE_SLOTS`, `STYLE_SPEC`, `VIEW_DEFAULT_SPEC`.
  `OVERLAY_SLOTS` and `BACKDROP_SLOTS` are mirrored without the comment.
  `STYLE_SPEC` and `VIEW_DEFAULT_SPEC` are frontmatter, not tails – out of
  scope here, but they would move into the same module or a sibling for the
  same reason.
- Call sites in build.js: `parseAttributeTail` at the `h1`/`h2` branches
  (~3380–3420); `parseSlotClasses` at `renderBackdrop` (~1950),
  `renderCardsBlock` (~2028), overlay rendering (~2137), and the `side`
  opener (~3795). In lint.js: `parseAttributeTail` at the `h1`/`h2`
  branches (~2600–2640); `slotProblems` at backdrop (~2692), overlay
  (~2739), cards/rows (2819, code `bad-${kind}-class`), side (~2853).
- The load-time assertion that no word sits in two slots of one table
  (build.js ~1850, "clear was a ground and very nearly also a scrim") must
  move with the tables.
- The chunk tail already *is* a slot table in disguise: `CHUNK_STYLE_CLASSES`
  maps `wrap-none → [wrap, none]`, `blocks-center → [blocks, center]`;
  width is a slot of four; `.bare` and `.center` are flags.
- **[review]** The public chunk grammar accepts exactly `.narrow .standard
  .wide .full .bare .center .wrap-balance .wrap-none .blocks-left
  .blocks-center` (`VALID_WIDTHS`, `VALID_CHUNK_CLASSES`, build.js:56–86).
  There is no `.shown` and no `.left`; a slot model must not invent them.

**1a. The slot model. [review]** A slot has a *default* and a list of
*writable words*, and the two are separate fields, because on a directive
the default may be written (`::: side {.top}` is legal and "changes
nothing") while on a chunk heading the default of a flag has no spelling:

```js
// tails.mjs
export const SIDE_SLOTS = {
  anchor: { default: 'top', words: ['top', 'middle'] },          // default writable
};
export const CHUNK_SLOTS = {
  width:  { default: 'standard', words: ['narrow', 'standard', 'wide', 'full'] },
  wrap:   { default: null, words: ['wrap-balance', 'wrap-none'] },      // null: no override
  blocks: { default: null, words: ['blocks-left', 'blocks-center'] },
  bare:   { default: false, words: ['bare'] },                         // flag: default unwritable
  center: { default: false, words: ['center'] },
};
```

The parser accepts only `words`; `default` is what the slot resolves to
when nothing is written. `.shown` and `.left` are therefore refused as
`unknown-class`, exactly as today. The `wrap`/`blocks` value the build
needs (`none`, `balance`, `left`, `center`) is derived from the written
class by the existing `CHUNK_STYLE_CLASSES` map, which moves into the
module unchanged.

**[review 2] The collision assertion keeps its exception.** `CARDS_SLOTS`
deliberately has `auto` in both `size` and `align` (build.js:1765, 1768),
and the load-time assertion (build.js ~1850) permits a word shared by
several slots **when it is the default of every slot that lists it** –
writing it changes nothing whichever slot takes it. The assertion moves
into `tails.mjs` over `words` of every table, `CHUNK_SLOTS` included, and
keeps that exemption verbatim: `hits.every(h => h.slot.default === word)`.
**Which slot gets `written: true` for `.auto`:** the first table entry
that lists it, as today (`Object.keys(slots).find`), so `.auto` marks
`size` written and leaves `align` unwritten. That is what makes
`{.auto .left}` legal (two slots) and `{.auto .large}` a `same-slot`
error (both size), exactly the current behaviour – pin both in the test.

**1b. One code for "a word from no slot". [review]** The first draft left
open when a heading word is `unknown-class` and a directive word
`unknown-slot-word`. Resolution: there is no distinction to keep. Both are
written `.word` now and both mean "this tail does not take that word", so
the parser emits **`unknown-class`** for every table, and the *message*
names the tail (`::: side: '.sideways' is not a word this directive
knows – anchor: .top | .middle` vs `chunk heading: '.bar' is not a class
this tail takes – valid: .narrow, …`). The message text is what the tests
grep; the code is what a `linter: ignore` would name, and nobody ignores
either today (see item 3). So `parseTail` takes no `opts.unknownCode`; it
takes a `what` string for the message only.

**1b′. ID policy is per caller. [review 2]** Today only column and chunk
headings take an `#id` through the tail; `cards`, `rows`, `side`,
`overlay` and `backdrop` refuse even a first `#id` as "not a .word"
(parseSlotClasses: any token not starting with `.`). A generic parser that
accepted `#id` everywhere would let a directive carry an id nothing reads –
the silent no-op this format refuses. So `parseTail` takes
`{ id: 'none' | 'one' }`: under `none` the first `#word` is a
`stray-attribute` ("this directive takes no id"); under `one` the first is
the id and a second is `multiple-ids`. Headings pass `one`; the five slot
directives pass `none`. **[review 3]** The draw opener is no longer a
caller: it has no braces after item 4 (see 4, "`{#id}` is dropped").
`multiple-ids` therefore fires on headings only.

**1b″. The input contract. [review 3]** The heading path receives a whole
line (`Heading {.wide #id}`) and has to split prose from tail; every
directive path receives the brace contents its opener regex already
captured (`.outline .middle`). One invariant: **`parseTail` always receives
brace contents, never a line**, and a separate two-line helper does the
split for headings:

```js
export function splitTail(line)  // 'Heading {.wide #id}' → { text: 'Heading', tail: '.wide #id' }
                                 // 'Heading'             → { text: 'Heading', tail: null }
export function parseTail(tail, slots, what, { id })
  → { classes, id, ids, slots: { name: { value, written } }, problems: [{ code, msg }] }

// heading (build.js h2 branch)
const { text, tail } = splitTail(h2[1]);
const t = parseTail(tail, CHUNK_SLOTS, 'chunk heading', { id: 'one' });
// directive (cards opener; cardsOpen[2] is the captured brace contents, or undefined)
const t = parseTail(cardsOpen[2], CARDS_SLOTS, 'cards', { id: 'none' });
```

`tail === null` or `undefined` means "no braces" and yields every slot at
its default with no problems. `text` is not part of `parseTail`'s result;
it is `splitTail`'s. An implementation can therefore never mistake `.wide`
for heading prose.

**1c. The architecture contract in `CLAUDE.md`. [review]** `CLAUDE.md:176–180`
("lint.js is independent") says lint.js "deliberately does not import
anything from build.js; it re-implements the parsing contract and mirrors
the constants", and that the diagram vocabulary is the one exception,
**"tables only – a function from that module would pull the whole compiler
in behind it"**. A shared `tails.mjs` is a second exception and has to be
written into that section in the same commit, with its reason: the file is
zero-dependency, under 200 lines, exports tables plus one pure function,
and pulls nothing in behind it – the concern the "tables only" rule
guards against does not arise. The sentence listing the mirrored constants
(`VALID_TAGS`, `VALID_WIDTHS`, `DENSITY_BUDGET`, `VIEW_DEFAULTS`) loses
`VALID_WIDTHS`. Also fix the same paragraph's claim if it is read as
"lint imports the compiler" – it imports vocabulary, and after this item
it imports vocabulary plus the tail parser.

**To check before implementing.**
- Whether any code reads `parseAttributeTail(...).classes` as an ordered
  list (the column-heading refusal prints `classes[0]`); keep `classes` in
  the return shape, in written order.
- `parseDiagramDefaults` in diagram-core has its own `{…}` reader for
  *element* tails inside a draw body (lint.js ~2343 reads them for draw
  defaults). Those stay in diagram-core; this item covers only the
  *block-level* tails (heading, `:::` directive, and after item 4 the draw
  opener's `{#id}`).
- `test/settings.mjs` greps message text: `/is not a word this directive knows/`,
  `/both answer "anchor"/`, `/is not a \.word/`, `/is not a \.class or an #id/`,
  `/both answer "width"/`, `/both answer "wrap"/`. Keep the phrases or
  update the tests in the same commit.

**Plan.**
1. Create `tails.mjs` exporting the tables (`CHUNK_SLOTS`, `CARDS_SLOTS`,
   `OVERLAY_SLOTS`, `BACKDROP_SLOTS`, `SIDE_SLOTS`, `CHUNK_STYLE_CLASSES`,
   `VALID_WIDTHS` derived from `CHUNK_SLOTS.width.words`), `splitTail`,
   `parseTail` (signatures in 1b″) and `parseDrawOpener` (item 4).
   `parseTail` returns data and never throws:
   ```js
   {
     classes,                   // every .word in written order, dots stripped
     id, ids,                   // first #id, all #ids (id policy per 1b′)
     slots: { anchor: { value, written }, … },
     problems: [{ code, msg }], // codes: stray-attribute | unknown-class | same-slot | multiple-ids
   }
   ```
   `written` is the fix for item 2.
2. build.js: replace both parsers with `parseTail`; on `problems.length`,
   throw a `userFacing` error from `problems[0].msg` plus the slot-table
   listing (`slotTable()` moves into the module so lint can print the same
   listing).
3. lint.js: replace both parsers;
   `for (const p of problems) add(ln, 'error', p.code, p.msg)`. Item 3
   lands here for free.
4. Delete the mirrored tail constants and their comments in lint.js;
   update `CLAUDE.md` (1c).
5. Run `npm test`; expect `test/settings.mjs` message greps to need the
   new phrasing; expect no lecture change.

**Risks.**
- The heading tail is 1.0.0 interface; the refactor must be byte-identical
  in output for every existing tail. Build every lecture in both repos
  before and after and diff the views (engine: `git diff --stat` on the
  tracked views; mylectures: build into a scratch dir and diff).
- `parseAttributeTail` also handles the *title* and *closing* chunks, where
  width and `.bare` are refused later by the caller ("cover composition
  decides"). Keep that refusal at the caller, not in the parser.
- lint.js must never be stricter than the build. With one parser that is
  structural for the three tail refusals; but the build's *callers* add
  refusals (scrim without photo, width on a title chunk, class on a column
  heading, cards inside a narrowing directive) that lint mirrors by hand –
  list them and check each has a lint twin after the refactor.

**Tests.** The twelve assertions added in 87bcc86 (`test/settings.mjs`,
search `One sigil rule`) plus the existing side/cards/overlay/backdrop
refusals. Add: (a) a table-driven unit test over `parseTail` – tail text
in, `problems[].code` and `slots[].written` out, no build; (b) `.shown`,
`.left`, `.top` on a chunk heading are `unknown-class`; (c) `::: side {.top}`
still builds and "changes nothing"; (d) `{.auto .left}` builds and
`{.auto .large}` is `same-slot`; (e) `::: cards 3 {#x}` is
`stray-attribute` in both files. **[review 2] (a) proves the parser, not
the adapters**, so keep two integration rows per code: one source that
build.js must refuse with a `userFacing` error whose text contains the
parser's message, and the same source that lint.js must report under the
parser's code. **[review 3] The matrix follows the id policy:**
`stray-attribute`, `unknown-class`, `same-slot` once each on a heading and
once on a directive; `multiple-ids` on a heading only (`## free: A {#a #b}`);
and the first `#id` on a directive (`::: cards 3 {#x}`) as
`stray-attribute`, which is the directive-side twin of `multiple-ids`.
Nine rows. The existing `raw()` / `lintOf()` helpers in `test/settings.mjs`
are the harness.

---

## 2. `parseSlotClasses` cannot tell a written default from an absent one

**What it is.** `rows` defaults `anchor` to `middle` while `cards` defaults
it to `top`. The parser returns only the resolved value, so `renderCardsBlock`
(build.js ~2105–2113) re-splits the raw tail and tests for `top`/`middle`
by hand before deciding. The scrim-without-photo check (~2118) does the
same raw split for a different reason.

**Checked.** Both hacks are in one function and read `b.attrs` directly.
No other directive has a per-construct default yet.

**Plan.** Folded into item 1: `slots[name].written` is `true` when the
author wrote the word. `rows`: `if (b.rows && !slots.anchor.written) anchor = 'middle'`.
Scrim: `if (slots.scrim.written && ground !== 'photo') refuse`.

**Risks.** None beyond item 1. `test/settings.mjs` ~1905–1920 pins that a
written default "changes nothing"; that stays true.

---

## 3. Lint codes: one family for one refusal

**What it is.** The same three refusals carry different codes per directive.
**[review]** The concrete names, all from lint.js: `bad-side-class` (~2854),
`bad-overlay-class` (~2740), `bad-backdrop-class` (~2693), and
`bad-cards-class` / `bad-rows-class` from the template ``bad-${kind}-class``
at lint.js:2820. The chunk tail says `stray-attribute` / `same-slot` since
87bcc86, and `unknown-width` for *any* unknown chunk class (`.bar` for
`.bare`) although its message says "unknown class". `bad-diagram-attribute`
is one code for at least five mistakes (lint.js ~670–700 and ~2343):
element name in the tail, empty `@`, unknown sigil, `!x` written twice,
bare word.

**Checked.**
- No lecture in either repo ignores any of these codes:
  `grep -rhoE 'linter:\s*ignore[^>]*' lectures/ …/psi-slides-mylectures/lectures/`
  finds only `reveal-overuse` and `density`. Renaming breaks no source.
- `test/settings.mjs` references `bad-side-class` three times (~1923–1930)
  and `same-slot` / `stray-attribute` in the 87bcc86 block; `bad-cards-class`,
  `bad-rows-class`, `bad-overlay-class`, `bad-backdrop-class` are not
  referenced by any test (`grep -rn "bad-.*-class" test/` → settings.mjs only,
  side).
- Where codes are documented: `grep -rn "bad-side-class\|unknown-width\|bad-diagram-attribute" .claude docs *.md`
  – update every hit.

**Plan.** With item 1's `problems[].code`:
- `unknown-class` replaces `bad-side-class`, `bad-overlay-class`,
  `bad-backdrop-class`, `bad-cards-class`, `bad-rows-class` (their
  "not a word this directive knows" branch) and `unknown-width`.
- `same-slot` replaces the "both answer" branch of the five `bad-*-class`
  codes.
- `stray-attribute` as today, now on directives too (and it is what a
  first `#id` on a directive gets). `multiple-ids` stays a heading code;
  it never fires on a directive (1b′).
- `bad-diagram-attribute` splits into `name-in-tail`, `empty-tag`,
  `stray-attribute` (reuse), `duplicate-removal`; `unknown-diagram-class`
  stays.
The directive is named in the message, never in the code.

**Risks.** Anyone's shell history or CI grep on old codes. None known.

---

## 4. `::: draw` is the one tail that holds values: `unit=WxH`, `autoplay=N`, `cycle`

**What it is.** Every other block tail holds sigil tokens; draw's holds
key=value options and one bare flag.

**Checked.**
- `unit=` is parsed in `diagram-core.mjs` `parseDiagramSource` (~3018,
  `/^unit=(\d+)x(\d+)$/`), with the "unknown ::: draw option" gate at ~3029
  listing `#id, unit=WxH, …`. `DG_HOST_OPTS = ['autoplay', 'cycle']`
  (diagram-core.mjs:944) is the list of words the *host* (build.js) owns and
  strips before compiling.
- `takeAutoplay(attrs)` (build.js:1487–1512) strips `cycle` and `autoplay=`
  and returns `{ autoplay, cycle, rest }`; both openers store
  `diagramBlock = { attrs: rest, autoplay, cycle, lines, bodyAt }`
  (build.js:3547 for a column heading's own figure, :3847 for a chunk).
  lint.js validates both words at ~2543–2565 and passes `unit=` and `#id`
  through, everything else to `DG_HOST_OPTS`.
- The opener regex is the same in both files and in the column path:
  `/^:::\s+draw\s*(?:\{([^}]*)\})?\s*$/` at lint.js:2534, build.js:3544 and
  build.js:3839. **[review 2] There is a fourth reader:**
  `test/gates/corpus.mjs` `blocks()` (line 61) extracts every `::: draw`
  block from the repository "the way lint.js does" and the gate asserts
  ``all ${n} corpus figures compile`` (line 106) **with no expected count**.
  After a migration to positional `WxH` it would match zero blocks and
  pass vacuously as "all 0 corpus figures compile". **[review 3]** Its
  `FILES` list (lines 34–40) names `diagrams`, `network-security`,
  `figure-rules`, `tutorial` and **omits `lectures/decoration/source.md`**,
  which has four real draw blocks – the gate covers 131 of 135 today.
  `blocks()` hands `b.head` (the old brace contents) straight to
  `core.renderDiagram(body, b.head, {})` (line 97), which is how the
  compiler learns the unit.
- No source in either repo writes `#id` inside the draw braces today
  (`grep -rhE "^::: draw \{[^}]*#" … --include=source.md` → 0). **[review 3]**
  Together with the fact that `model.id` has no consumer but an error
  prefix, that is why the new opener has no `{#id}` at all (Plan 1).
- **[review] The editor's payload carries the stripped tail, not the
  opener.** The build emits the figure's source payload from `diagramBlock`
  (`range: [bodyAt, bodyAt + body.length]`, build.js ~3327–3334) and the
  editor reads it as `attrs: data.attrs` (editor.mjs:137) – i.e. `rest`,
  which is `unit=… #id` with `autoplay`/`cycle` already removed.
  `dgeBlockText()` (editor.mjs:7242) rebuilds the block as
  `'::: draw' + ' {' + DGE.fig.attrs + '}'` and therefore **already drops
  `autoplay` and `cycle` today** on the paths that use it. Which paths:
  - Tier 1, watch server: `window.psiWatch.patch(DGE.fig.range, DGE.source, DGE.fig.body)`
    (editor.mjs:7255) – patches the **body range only**, the opener line
    is untouched. Safe.
  - Tier 1b, File System Access: `dgeWriteToFile()` (editor.mjs:7317–7331)
    splices `src.slice(0,a) + DGE.source + src.slice(b)` over the body
    range – opener untouched. Safe.
  - Tier 2, clipboard: `dgeCopyBlock()` (editor.mjs:7288) copies
    `dgeBlockText()` – **loses `autoplay`/`cycle`**, today, before any
    change. This is a live bug independent of the syntax question.
- Inventory of the old spelling outside built views, by file
  (`grep -rnE "unit=[0-9]+x[0-9]+|autoplay=[0-9]" --include='*.mjs' --include='*.js' --include='*.md' --include='*.html' --include='*.yml' .`
  minus `lectures/*/{audience,speaker,print,print-notes}.html`):
  `docs/artifact/figure-rules/source.md` 54 · `lectures/network-security/source.md` 36
  · `docs/artifact/figures-you-write.html` 32 (generated, see below)
  · `lectures/diagrams/source.md` 31 · `lectures/tutorial/source.md` 13
  · `.claude/skills/psi-slides-figures/SKILL.md` 7 · `editor.md` 6
  · `diagram-core.mjs` 6 (regex + comments) · `revision-proposal.md` 5
  · `lectures/decoration/source.md` 5 · `todo-review-language-and-docs.md` 4
  · `test/settings.mjs` 4 · `PRD.md` 3 · `build.js` 3 · `test/gates/semantics.mjs` 2
  · `figure-design.md` 2 · `docs/site/figures.html` 2 (generated)
  · `.claude/skills/psi-slides-authoring/SKILL.md` 2 · `todo-revision-of-system.md` 1
  · `test/editor-guides.mjs` 1 · `test/autoplay.mjs` 1 · `lint.js` 1
  · **`docs/site/shoot-gallery.mjs` 1** (line 83, ``const DRAW = `::: draw {unit=150x56}``,
    an executable template the gallery shooter builds) · `docs/site/index.html` 1
  · `docs/site/index.de.html` 1 · `CHANGELOG.md` 1. Plus psi-slides-mylectures:
  every `::: draw` in `lectures/introsp/*/source.md`. **[review 2] Census,
  counted (`grep -rhE "^::: draw" … --include=source.md`):** mylectures
  **11** draw blocks; engine lectures plus `docs/artifact/figure-rules`
  **135**; **65** distinct `unit=` values across both repos. The first
  draft's "~100 lines, every figure in mylectures" was wrong – most of the
  migration is in the engine's own lectures and the figure-rules source.
- **[review] `docs/artifact/figures-you-write.html` is not hand-migrated.**
  Its page shell is hand-written, but every compiled figure, stepped demo
  and the diagram runtime are spliced in from a real build of
  `docs/artifact/figure-rules/source.md` by `docs/artifact/refresh-figures.mjs`
  (header comment: "those parts are not authored here and must never be
  edited here"). The same script writes `docs/site/figures.html`
  (refresh-figures.mjs:709) and has `--check` (report drift, write
  nothing). So: migrate `figure-rules/source.md`, run the script, then run
  it with `--check`.
- The rendered `<figure>` carries the autoplay/cycle state as data
  attributes read by the viewer; those are downstream of the parse and do
  not care where the words were written.

**To check before implementing.**
- Whether `parseDiagramSource(body, headAttrs, base)` reads anything from
  `headAttrs` other than `unit=` and `#id` (grep `headAttrs` in
  diagram-core.mjs, ~2986–3035).
- `test/editor-*.mjs`, `test/autoplay.mjs`, `test/gates/semantics.mjs`
  build sources with `{unit=…}` – they need the new spelling.
- Whether `docs/site/build-site.js` or `shoot.mjs` embed any further opener
  text that the grep above did not match (they did not match on
  `unit=`/`autoplay=`, but a bare `::: draw {` with other options should be
  looked for: `grep -rn "::: draw {" docs/ test/`).

**Plan (option B from the discussion – the recommended one).**
1. New opener grammar, one regex in `tails.mjs` used by all **four**
   callers – build.js ×2, lint.js, `test/gates/corpus.mjs`:
   ```
   ::: draw [WxH] [{#id}] [autoplay N [cycle]]
   ```
   `WxH` positional (the grid is the figure's one primary argument, as the
   ratio is for `side`); no braces (see "`{#id}` is dropped" below);
   `autoplay N` and `cycle` are keywords after, in that order, `cycle`
   refused without `autoplay` as today.

   **[review 3] Caller-facing contract**, so no caller keeps a
   `^:::\s+draw` pre-regex of its own:
   ```js
   parseDrawOpener(line)
     → null                                          // not a draw opener: line does not match /^:::\s+draw(?=\s|$)/
     → { unit: [w, h] | null, autoplay: n | null, cycle: bool, problems: [] }   // valid opener
     → { …, problems: [{ code, msg }] }              // begins `::: draw`, must be refused; codes:
                                                     //   stray-attribute (old `{unit=…}`, `autoplay=`, bare `cycle`, any braces),
                                                     //   bad-autoplay (range, or cycle without autoplay), bad-unit
   ```
   `null` is the only "unrelated line" answer; a non-null result with
   problems is a refusal, and build.js throws `problems[0].msg` as
   `userFacing` while lint.js adds every problem under its code. The unit
   is `null` when unwritten (compiler default), never a synthesised value.

   **[review 3] `DG_HOST_OPTS` is removed, not kept beside the new parser.**
   Today `diagram-core.mjs:944` exports `['autoplay', 'cycle']`, the
   compiler's option loop skips them (`:3027`, with a comment saying the
   corpus gate and the editor "compile blocks straight out of a file"), and
   lint.js imports the list for its own gate (`:2570`). After this item no
   caller hands the compiler a host option: build.js, `corpus.mjs` and the
   editor's payload all pass only the synthesised `unit=WxH`. So: delete
   `DG_HOST_OPTS`, delete the skip branch, let the compiler refuse
   `autoplay=…` as an unknown option (test that), and have lint's draw gate
   call `parseDrawOpener` instead of consulting the list. `tails.mjs` then
   owns the two words alone, and must not import diagram-core (zero-dep
   both ways).

   **[review 3] `{#id}` is dropped from the opener.** Checked: the
   compiler stores it as `model.id` (`diagram-core.mjs:3020`) and the only
   consumer is the prefix of the "has N problem(s)" error (`:6677`); it
   becomes no SVG id, no editor identity, no link target, and no source in
   either repo writes one. A setting that changes nothing in successful
   output is what this format refuses, so the opener takes none, the
   compiler's `#` branch goes with the `DG_HOST_OPTS` branch, and the error
   prefix keeps the `where` (chunk id) it already has. Migration cost:
   zero. If a figure-level id is ever wanted, it is a new feature with
   observable semantics and its own tests, not a leftover.

   `parseDrawOpener(line) → { unit, autoplay, cycle, problems }`
   **[review 2]** `corpus.mjs` `blocks()` uses it too, and the gate gets a
   ratchet. **[review 3] Exact counts, counted with `grep -cE '^::: draw'`
   per file:** `diagrams` 29, `network-security` 36, `figure-rules` 55,
   `tutorial` 11, `decoration` 4 – 135. (The draft's "31" for diagrams was
   a count of old-spelling grep hits, not blocks, and would have failed on
   day one.) Add `decoration` to `FILES`, assert the per-file counts
   exactly, and when a lecture gains or loses a figure the number in the
   gate changes in the same commit. And because step 2 keeps the
   compiler's string signature, `blocks()` must synthesise `unit=WxH` from
   the parsed opener before calling `renderDiagram` – handing it the raw
   opener would compile every figure at the default unit and still pass.
2. build.js: both opener sites call `parseDrawOpener`; `diagramBlock`
   keeps `{ unit, autoplay, cycle }` as fields. `parseDiagramSource`
   keeps its string signature for a first step – the host synthesises
   `unit=WxH` from the fields (nothing when unit is null) – so diagram-core
   changes only by losing the `#id` and `DG_HOST_OPTS` branches and their
   error text. (Second step, optional: pass an object.)
3. **[review] The editor payload carries the whole opener.** The build
   puts `opener: { unit, autoplay, cycle }` into the figure's source
   payload next to `attrs`; the editor stores it on `DGE.fig`;
   `dgeBlockText()` serialises the new spelling from it:
   `'::: draw' + (unit ? ' ' + unit : '') + (autoplay ? ' autoplay ' + autoplay + (cycle ? ' cycle' : '') : '')`
   – the same function as the migration script's serialiser, exported from
   `tails.mjs` as `formatDrawOpener({ unit, autoplay, cycle })` so the two
   cannot drift.
   Tiers 1 and 1b keep patching the body range only. This also fixes the
   pre-existing clipboard bug in the same commit.
4. lint.js: the old spelling (`unit=` inside braces, `autoplay=`, bare
   `cycle`) becomes a `stray-attribute` whose message spells the new form
   (`write ::: draw 150x56 {#fig} autoplay 1200 cycle`), so a stale source
   says exactly what to type. `DG_HOST_OPTS` stays as the list of keywords
   the host recognises after the braces.
5. Migration script, dry-run first, over **both repos and the whole tree**,
   not only lines starting with `::: draw`: match `::: draw\s*\{([^}]*)\}`
   anywhere (that catches the template literal in `shoot-gallery.mjs`, the
   test sources, and prose in the skills). **[review 2] The transform
   replaces the whole matched opener, it does not substitute tokens in
   place**: parse the captured old tail into `{unit, id, autoplay, cycle}`
   (refusing anything else, so a tail the script does not understand stops
   the run rather than being half-rewritten; a `#id` in an old tail is
   reported and dropped, and the census says there are none), then emit
   the canonical new opener with `formatDrawOpener` –
   `::: draw 150x56 autoplay 1200 cycle`. The old braces go with the old
   tail. **Exclusions, in the script, by basename at any depth [review 3]:**
   `**/audience.html`, `**/speaker.html`, `**/print.html`,
   `**/print-notes.html`, `**/squint.txt` (mylectures nests lectures as
   `lectures/<course>/<NN>-<slug>/`, so a one-level `lectures/*/` pattern
   misses every view there), `docs/artifact/figures-you-write.html`,
   `docs/site/figures.html`, `docs/site/example/`, `_site/`,
   `node_modules/` – the first group is rebuilt by the build, the next two
   by `refresh-figures.mjs`, the rest by `build-site.js`. Simplest
   implementation: iterate `git ls-files` in the engine repo and
   `git ls-files --others --exclude-standard` plus tracked files in
   mylectures, then apply the basename exclusions – the built views in
   mylectures are gitignored except where they were committed by accident,
   and the basename rule catches those too. Then `refresh-figures.mjs` and
   `refresh-figures.mjs --check`; then `node docs/site/shoot-gallery.mjs`
   (or whatever `build-site.js` runs) to prove the gallery shooter still
   builds; then `npm test`; then a final repo-wide scan that must come
   back empty outside CHANGELOG history and diagram-core's own comments –
   **numeric and symbolic forms both**: `unit=\d+x\d+`, `unit=WxH`,
   `autoplay=\d+`, `autoplay=N`, `\{[^}]*\bcycle\b[^}]*\}` – run over the
   same file list as the migration, with the same exclusions, because the
   built views carry the old spelling inside highlighted code and source
   payloads and would never come back empty.
6. CHANGELOG (Unreleased → Changed), both figure skills, `figure-design.md`,
   `editor.md`, `PRD.md`, the mylectures `HOUSE-STYLE.md` "Attribute tails"
   section.

**Option A, if B is judged too expensive.** Keep key=value in the draw tail
and *document* draw as the one options-tail: "on `::: draw` the tail holds
`key=value` options, no sigils; everywhere else the tail holds sigils".
Then `cycle` must stop being a bare word: `cycle=1200` replacing
`autoplay=1200 cycle` (two keys, refused together). Cheaper by an order of
magnitude, but the sigil rule then has a stated exception, which is what
the whole exercise set out to remove. Step 3 (the editor payload) is
needed under A as well, because the clipboard bug exists today.

**Risks.**
- Draw is post-1.0.0 and unreleased, so the source change is allowed, but
  it is the widest text migration in the set. `unit` sets geometry, so a
  mis-migrated line is a visibly different figure: build every lecture in
  both repos before and after, diff the views, and run `--check-fit` on
  each. **[review 2] Scope of that diff:** only `decoration`, `diagrams`
  and `tutorial` have tracked views in the engine repo
  (`git ls-files lectures | grep html`); `network-security`,
  `python-intro`, `docs/artifact/figure-rules` and every mylectures
  lecture build into untracked or ignored files. So `git diff` covers
  three of nine; the rest need a scratch snapshot of the views before the
  migration and a diff against it after.
- Four opener readers today (build.js ×2, lint.js, `corpus.mjs`); the
  column-heading path (build.js:3544) is the one to forget. One function in
  the module, four callers, and `parseDrawOpener` returning `null` for an
  unrelated line so no caller keeps a pre-regex.
- Generated pages: `figures-you-write.html` and `docs/site/figures.html`
  must come from the refresh script, never from the migration sed – the
  sed would rewrite the spliced code regions and `--check` would then
  report drift forever.
- The editor: without step 3 the clipboard tier drops `autoplay`/`cycle`
  (today) or writes the old spelling (after the change), which lint then
  refuses – loud, not silent, but a regression an author meets on the
  first "New figure…" click.

**Tests.** `test/settings.mjs` around the autoplay block
(`grep -n autoplay test/settings.mjs`); `test/autoplay.mjs` (browser).
Add: (a) old spelling refused with the new one in the message; (b) `WxH`
positional reaches the compiler as the same unit as `unit=WxH` did.
**[review 2] Not byte-for-byte on the whole figure**: the source payload
(`<script type="application/json">`, emitted by `renderDiagram` inside the
figure holder, build.js ~3330) intentionally gains the `opener` field in
step 3, so the figure element changes by design. Compare the compiled
`model.unit` from `parseDiagramSource` and the rendered `<svg>` element
(outerHTML, or at least `viewBox` and the first `<g>`'s transform) before
and after – those must be identical; (c) **[review]
editor round-trip**: open a figure whose opener is
`::: draw 150x56 autoplay 1200 cycle`, press "New figure…" / copy
block, and assert the clipboard text (or `dgeBlockText()` via the page)
reproduces the opener verbatim – `test/editor-*.mjs` has the harness.

---

## 5. Documentation: the rule in one sentence, everywhere it is taught

**What it is.** Three doc-only inconsistencies:
- The sigil sentence added in 87bcc86 names three sigils (`.`, `#`, `@`);
  draw also has `!word` (remove a class from a `default` layer or the
  previous beat). Four sigils, one sentence, in both skills.
- Chunk classes are spelled key-value (`.wrap-none`, `.blocks-center`);
  directive words are bare (`.outline`, `.middle`). Not a mistake – a chunk
  class *names the `style:` key it overrides*, a directive word has its own
  vocabulary – but nowhere stated. State it in the authoring skill next to
  the sigil rule: "a chunk class that answers a `style:` key is spelled
  `key-value`; a directive's slot words are bare".
- Placeholders differ: `<ref>` for a required word, `{.classes}` for a
  tail (was `{classes}` before 87bcc86), `{.width #id}`, `{.anchor}`. Pick
  one: `<ref>` for positionals, `{…}` for the tail in a signature, and a
  concrete example on the same line. Files: both skills, `PRD.md`,
  `CHANGELOG.md`, `docs/comparison.md`, `test/README.md`.

**Checked.** `grep -rn "{\.classes}\|{\.anchor}\|{\.width #id}" .claude PRD.md CHANGELOG.md docs test/README.md`
lists every placeholder. `figure-design.md` is hand-maintained;
`docs/artifact/figures-you-write.html` is **not** (item 4) – its prose
shell may be edited, its figure regions may not.

**Plan.** One commit after items 1–4, when the rules are final. Also
`CLAUDE.md` (item 1c) and `HOUSE-STYLE.md` in psi-slides-mylectures
(section "Attribute tails") to the four-sigil sentence and, if item 4
lands, the draw opener.

---

## 6. Deliberately left as is

- **Chunk-class spelling (`.wrap-none`) stays.** It is 1.0.0 interface and
  reads better than a bare `.none` would. Documented in item 5 rather than
  changed.
- **`!class` stays draw-only.** Only draw has layered defaults; removal has
  no meaning elsewhere.
- **`side 2:1` stays positional.** It is the model item 4 copies.

---

## 7. Resolved in 87bcc86

- Column heading with two ids: `parseAttributeTail` in build.js now refuses
  a second `#id` on any heading; lint reports `multiple-ids`.
- Dot-less slot words on cards/rows/overlay/backdrop/side; sigil-less
  tokens on a chunk tail; two widths or two `style:` answers on one
  heading. All errors in both files, with tests.

---

## Review trail

Both reviews are resolved in place; this list is the index.

- Review 1: chunk slots must not invent `.shown`/`.left` (1a); one code
  for a word from no slot (1b); `CLAUDE.md` lint-independence contract
  (1c); editor payload carries the stripped tail, clipboard tier drops
  host options (4, Checked + Plan 3); generated pages come from
  `refresh-figures.mjs` (4, Checked + Plan 5); full inventory incl.
  `shoot-gallery.mjs` (4, Checked); cards/rows codes named (3).
- Review 2: collision-assertion exemption for `auto` and the written-slot
  rule (1a); per-caller id policy (1b′); `test/gates/corpus.mjs` as a
  fourth opener reader with a count ratchet (4, Checked + Plan 1); the
  migration rebuilds the whole opener and names its exclusions and the
  symbolic scan (4, Plan 5); adapter integration tests beside the parser
  unit test (1, Tests); comparison target for the figure after the payload
  change (4, Tests); verification scope for untracked views and the
  corrected census (4, Risks + Checked).
- Review 3: `splitTail` + `parseTail(tail, …)` as the one input contract
  (1b″); test matrix follows the id policy, `multiple-ids` on headings only
  (1 Tests, 3); corpus gate adds `decoration`, exact per-file counts,
  synthesises `unit=WxH` (4, Checked + Plan 1); `parseDrawOpener` returns
  `null` / valid / refused (4, Plan 1); `DG_HOST_OPTS` removed from
  diagram-core and lint (4, Plan 1); exclusions by basename at any depth
  and a scan over the same file list (4, Plan 5); `{#id}` dropped from the
  opener, with the reason (4, Plan 1 + end state).

---

## Seen on the way, not a syntax matter

- **The editor's clipboard tier drops `autoplay`/`cycle` today** – see
  item 4, "Checked". Independent of the syntax decision; fixed by item 4
  step 3 under either option.
- **`test/text-select.mjs` fails three Alt-drag assertions on this machine**
  ("Alt-dragging the listing selects text", "the highlight survives the key
  release", "a drag that outlives the key still selects") on the tree before
  the tail change as well as after it (`node test/run.mjs select` on a
  stash of 87bcc86's parent: 34 passed, 3 failed). Environment or a real
  regression in the selection gesture – undecided, and outside this change.
