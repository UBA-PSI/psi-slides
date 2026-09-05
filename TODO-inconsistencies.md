# TODO – inconsistencies in the `{…}` tails, and how to finish the job

Collected while making every setting in a tail dot-mandatory (commit
87bcc86). That commit left the format with one *spelling* rule but still
four implementations of it, one directive that breaks the rule, and lint
codes that name the same refusal six ways. This file is written so a fresh
session can implement each item without re-deriving it. Every entry has:
what it is, what has been checked (with anchors), what to check before
touching it, the plan, the risks, and the tests that pin it.

Six reviews of earlier drafts (Codex, 2026-09-04) are resolved in place and
marked **[review]** through **[review 6]** where the text changed. The
"Review trail" section at the end lists them so nothing was folded in
silently; counts are deliberately omitted now that follow-up verification
itself keeps finding and resolving small additions.

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
for heading prose. **[review 5]** An explicitly present but empty tail is
different: `tail === ''` or whitespace means the author wrote `{}`. It
returns the defaults plus one `stray-attribute` problem telling them to
remove the empty braces. This pins the end-state rule that a line with no
sigil tokens has no braces; a census finds no block-level `{}` to migrate.

**1c. The architecture contract in `CLAUDE.md`. [review]** `CLAUDE.md:176–180`
("lint.js is independent") says lint.js "deliberately does not import
anything from build.js; it re-implements the parsing contract and mirrors
the constants", and that the diagram vocabulary is the one exception,
**"tables only – a function from that module would pull the whole compiler
in behind it"**. A shared `tails.mjs` is a second exception and has to be
written into that section in the same commit, with its reason: the file is
zero-dependency, under 200 lines, exports tables plus small pure parsing and
formatting helpers, and pulls nothing in behind it – the concern the
"tables only" rule guards against does not arise. The sentence listing the mirrored constants
(`VALID_TAGS`, `VALID_WIDTHS`, `DENSITY_BUDGET`, `VIEW_DEFAULTS`) loses
`VALID_WIDTHS`. Also fix the same paragraph's claim if it is read as
"lint imports the compiler" – it imports vocabulary, and after this item
it imports vocabulary plus the tail parser.

**Implementation notes (pre-checks resolved in review 5).**
- `.classes` is order-sensitive: the column-heading refusal prints
  `classes[0]` (build.js:3392–3394), the chunk path uses `.find`, and lint
  iterates it. Keep `classes` in the return shape, in written order.
- `parseDiagramDefaults` in diagram-core has its own `{…}` reader for
  *element* tails inside a draw body (lint.js ~2343 reads them for draw
  defaults). Those stay in diagram-core; this item covers only heading and
  `:::` directive tails. **[review 4]** Item 4 removes braces from the draw
  opener altogether, so it is not a `parseTail` caller.
- `test/settings.mjs` greps message text: `/is not a word this directive knows/`,
  `/both answer "anchor"/`, `/is not a \.word/`, `/is not a \.class or an #id/`,
  `/both answer "width"/`, `/both answer "wrap"/`. Keep the phrases or
  update the tests in the same commit.

**Plan.**
1. Create `tails.mjs` exporting the tables (`CHUNK_SLOTS`, `CARDS_SLOTS`,
   `OVERLAY_SLOTS`, `BACKDROP_SLOTS`, `SIDE_SLOTS`, `CHUNK_STYLE_CLASSES`,
   `VALID_WIDTHS` derived from `CHUNK_SLOTS.width.words`), `splitTail`,
   `parseTail` (signatures in 1b″), `slotTable`, `parseDrawOpener` and
   `formatDrawOpener` (item 4). **[review 5]** The prior export list omitted
   the formatter that Plan 3 and the migration import. Its contract is
   `formatDrawOpener({ unit, autoplay, cycle }) → canonical line`; it accepts
   a valid parser-result shape and throws on an impossible combination such
   as `cycle: true` with no autoplay.
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
   `for (const p of problems) add(ln, 'error', p.code, p.msg)`. The
   block-level half of item 3 lands here for free; its diagram-body half is
   explicit in item 3.
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
`stray-attribute`, which is the directive-side twin of `multiple-ids`; and
an empty `{}` once on each caller kind. **[review 5]** That is ten rows,
not the previous draft's unexplained nine. The existing `raw()` /
`lintOf()` helpers in `test/settings.mjs` are the harness.

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
is one code for at least six mistakes (lint.js ~670–741 and ~2383):
element name in the tail, empty `@`, unknown sigil, `!x` written twice,
bare word, and the same class both added and removed.

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

**Plan.** For the block-level tails, with item 1's `problems[].code`:
- `unknown-class` replaces `bad-side-class`, `bad-overlay-class`,
  `bad-backdrop-class`, `bad-cards-class`, `bad-rows-class` (their
  "not a word this directive knows" branch) and `unknown-width`.
- `same-slot` replaces the "both answer" branch of the five `bad-*-class`
  codes.
- `stray-attribute` as today, now on directives too (and it is what a
  first `#id` on a directive gets). `multiple-ids` stays a heading code;
  it never fires on a directive (1b′).
The directive is named in the message, never in the code.

**[review 5] The diagram-body split does not land "for free" with item
1.** `attrsOf()` remains local to lint.js, and `draw-defaults` has a second
local tail loop; neither calls `parseTail`. Change those branches explicitly:
`#id` → `name-in-tail`; empty `@` → `empty-tag`; an unknown sigil, bare
word, or a non-`.class` in `draw-defaults` → `stray-attribute`; a repeated
`!class` → `duplicate-removal`; and `.class` together with `!class` → the
previously missing `conflicting-class`. `unknown-diagram-class` stays.
This removes `bad-diagram-attribute` completely instead of leaving its
sixth meaning behind.

**Risks.** Anyone's shell history or CI grep on old codes. None known.

**Tests.** One `lintDiagram` case for each of `name-in-tail`, `empty-tag`,
`stray-attribute`, `duplicate-removal` and `conflicting-class`, plus one
frontmatter `draw-defaults` non-class case for `stray-attribute`; finally
assert that `rg bad-diagram-attribute lint.js test docs .claude` has no
active rule/documentation hit.

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
  `model.id` has exactly one consumer, the compiler-error prefix.
  **[review 4]** That diagnostic use and its divider-path replacement are handled in
  Plan 1; after that replacement, the new opener needs no `{#id}`.
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

**Implementation notes (pre-checks resolved in review 5).**
- `headAttrs` has four uses: the parser signature, the token loop, the
  `renderDiagram` hand-off and payload serialization
  (`diagram-core.mjs:2986,3017,6608–6614,7009`). The token loop accepts
  only `unit=`, `#id` and `DG_HOST_OPTS`; item 4 removes the latter two.
- `test/editor-*.mjs`, `test/autoplay.mjs`, `test/gates/semantics.mjs`
  build sources with `{unit=…}` – they need the new spelling.
- A full `rg "::: draw \{" docs test` found no hidden opener in
  `build-site.js` or `shoot.mjs`; beyond the already inventoried sources and
  tests, the only executable template is `docs/site/shoot-gallery.mjs:83`.

**Plan (option B from the discussion – the recommended one).**
1. New opener grammar, one regex in `tails.mjs` used by all **four**
   callers – build.js ×2, lint.js, `test/gates/corpus.mjs`:
   ```
   ::: draw [WxH] [autoplay N [cycle]]
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
     → { unit: 'WxH' | null, autoplay: n | null, cycle: bool, problems: [] }    // valid opener
     → { …, problems: [{ code, msg }] }              // begins `::: draw`, must be refused; codes:
                                                     //   stray-attribute (old braced form, `autoplay=`, unknown token),
                                                     //   bad-autoplay (not numeric/range, or cycle without autoplay), bad-unit
   ```
   `null` is the only "unrelated line" answer; a non-null result with
   problems is a refusal, and build.js throws `problems[0].msg` as
   `userFacing` while lint.js adds every problem under its code. The unit
   is the validated canonical string (for example `150x56`), or `null`
   when unwritten (compiler default), never a synthesised value.
   **[review 4]** Do not return `[150, 56]`: the formatter shown in Plan 3 would
   stringify that array as `150,56`, and the compiler adapter would then
   synthesise the invalid `unit=150,56`. One representation crosses parser,
   formatter, payload and migration; `parseDiagramSource` alone converts it
   to the numeric `[w, h]` model value.

   **[review 5] A refused opener is still an opener.** After reporting its
   problems, lint.js must capture through the matching closing `:::` and
   lint that body once; it must not let
   draw-language lines fall back into the Markdown/directive walker and emit
   cascaded unrelated errors. Build.js stops immediately on the first opener
   problem. `corpus.mjs` records the opener as a gate failure rather than
   silently omitting its block.

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
   becomes no SVG id, no editor identity and no link target, and no source
   in either repo writes one. **[review 4] That is small but real diagnostic
   semantics, not "no consumer".** For a chunk figure, build.js already
   supplies `opts.where` from `currentChunk.id` (`:3337`), so `#id` is
   redundant. For a column-heading/divider figure, however, the same call
   sees `currentChunk === null` and currently says `in a chunk with no id`
   even when `currentColumn.id` or `.heading` exists. Before deleting the
   compiler's `#` branch, make `where` choose the chunk id/heading or,
   without a chunk, the current column id/heading (and call it a divider).
   **Checked (review 4 verification):** at `build.js:3337` the expression is
   `currentChunk && currentChunk.id ? \`chunk #${currentChunk.id}\` : 'a chunk with no id'`,
   while `currentColumn` – `{ heading, id, … }`, set at `:3400` – is in
   scope in the same function. The replacement:
   ```js
   where: currentChunk
     ? (currentChunk.id ? `chunk #${currentChunk.id}`
                        : currentChunk.heading ? `chunk "${currentChunk.heading}"`
                                               : 'an unnamed chunk')
     : currentColumn
       ? (currentColumn.id ? `the divider of column #${currentColumn.id}`
                           : currentColumn.heading ? `the divider of column "${currentColumn.heading}"`
                                                   : 'an unnamed column divider')
       : 'an unattached diagram',
   ```
   **[review 5]** The former concrete expression contradicted its own prose:
   it ignored a chunk heading and rendered an implicit column's null heading
   as `"null"`. The guarded fallbacks above cover both. Do **not** add a
   `column` sibling to the editor payload in this change. Merely emitting it
   has no effect: `dgeCollectFigures`, `DGE_REOPEN`, `dgeStoreKey`, labels and
   per-chunk numbering all read `fig.chunk`. Wiring a second identity through
   all of those is a separate editor change and is unnecessary to replace the
   compiler error prefix.
   Then the opener id can be removed without degrading the one behaviour it
   had. If a figure-level id is ever wanted, it is a new feature with
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
   `unit=WxH` from the fields (nothing when unit is null). At the parsing
   layer diagram-core only loses the `#id` and `DG_HOST_OPTS` branches and
   their error text; Plan 3 also changes its source-payload serialization.
   (Second step, optional: pass an object.)
3. **[review] The editor payload carries the whole opener. [review 4]**
   Make it the already-formatted canonical line, not an object the browser
   must format again. The build calls
   `formatDrawOpener({ unit, autoplay, cycle })` from `tails.mjs` and passes
   the resulting `opener: '::: draw 150x56 autoplay 1200 cycle'` to
   `renderDiagram` as `opts.opener`. **[review 5]** `renderDiagram`,
   not build.js, constructs the `psi-diagram-source` JSON
   (`diagram-core.mjs:7006–7017`), so it must serialize
   `opener: opts.opener` next to the compiler-only
   `attrs: 'unit=150x56'`. The editor reads both onto `DGE.fig`, and
   `dgeBlockText()` uses
   `DGE.fig.opener + '\n' + DGE.source + '\n:::'`. This module boundary is
   deliberate: `editor.mjs` is read as text and inserted into a classic
   inline `<script>` (`build.js:2532–2536, :6461`), so an import from
   `tails.mjs` would not work and merely exporting the formatter does not
   make it available in the browser. The migration script and build share
   the one formatter; the editor copies its result and therefore cannot
   drift while it edits only bodies.
   Tiers 1 and 1b keep patching the body range only. This also fixes the
   pre-existing clipboard bug in the same commit.
4. lint.js: the old braced spelling and `autoplay=` become a
   `stray-attribute` whose message spells the new form
   (`write ::: draw 150x56 autoplay 1200 cycle`), so a stale source says
   exactly what to type. `cycle` in the new position but without
   `autoplay N` remains `bad-autoplay`. **[review 4]** The former draft put
   bare `cycle` under both codes. `DG_HOST_OPTS` does not stay: Plan 1
   removes it. Lint recognises the host keywords only through
   `parseDrawOpener`, then hands the compiler only its synthesised
   `unit=WxH` adapter string.
5. Migration script, dry-run first, over **both repos and the whole tree**,
   not only lines starting with `::: draw`: match `::: draw\s*\{([^}]*)\}`
   anywhere (that catches the template literal in `shoot-gallery.mjs`, the
   test sources, and prose in the skills). **[review 2] The transform
   replaces the whole matched opener, it does not substitute tokens in
   place**: parse the captured old tail into `{unit, id, autoplay, cycle}` –
   the *old* tail's fields, the only place an `id` survives in this plan –
   (refusing anything else, so a tail the script does not understand stops
   the run rather than being half-rewritten). **[review 4]** A `#id` also
   stops the run with an explicit "draw ids were diagnostic-only and are no
   longer supported" message; do not silently discard user-authored text
   merely because the checked repositories currently contain none. After
   the old tail has been accepted, emit
   the canonical new opener with `formatDrawOpener` –
   `::: draw 150x56 autoplay 1200 cycle`. The old braces go with the old
   tail. **Exclusions, in the script, by basename at any depth [review 3]:**
   `**/audience.html`, `**/speaker.html`, `**/print.html`,
   `**/print-notes.html`, `**/squint.txt` (mylectures nests lectures as
   `lectures/<course>/<NN>-<slug>/`, so a one-level `lectures/*/` pattern
   misses every view there), `docs/artifact/figures-you-write.html`,
   `docs/site/figures.html`, `docs/site/example/`, `_site/`,
   `node_modules/`, plus `CHANGELOG.md`, `TODO-inconsistencies.md`,
   `revision-proposal.md` and root `todo-*.md`. **[review 6]** The last
   group is history/planning: the syntax gate inventories it through its
   explicit allowlist, but the automatic migration must not rewrite history
   that explains the old form. The first generated group is rebuilt by the
   build, the next two by `refresh-figures.mjs`, and the site outputs by
   `build-site.js`. Simplest
   implementation: iterate `git ls-files` in the engine repo and
   `git ls-files --others --exclude-standard` plus tracked files in
   mylectures, then apply the basename exclusions – the built views in
   mylectures are gitignored except where they were committed by accident,
   and the basename rule catches those too. Then `refresh-figures.mjs` and
   `refresh-figures.mjs --check`; then `node docs/site/shoot-gallery.mjs`
   (or whatever `build-site.js` runs) to prove the gallery shooter still
   builds; then `npm test`.

   **[review 5] The former "final repo-wide scan must be empty" could not
   pass:** this TODO alone intentionally contains every old numeric and
   symbolic form, and negative tests plus the migration parser must retain
   some of them. **[review 6] Keep the committed gate self-contained.** The
   gate runner promises to work from a bare psi-slides checkout and therefore
   cannot require the adjacent psi-slides-mylectures repo. Do this in three
   layers:
   1. `test/gates/legacy-draw-syntax.mjs` scans this repository's tracked,
      non-generated text. It hard-fails any old opener in a `source.md`, then
      inventories `unit=\d+x\d+`, `unit=WxH`, `autoplay=\d+`, `autoplay=N`
      and `\{[^}]*\bcycle\b[^}]*\}` everywhere else.
   2. Compare that inventory with the checked-in
      `test/gates/legacy-draw-syntax.txt`, one sorted
      `path<TAB>matched-text<TAB>count` row per intentional match. Exclude the
      gate `.mjs` and its `.txt` from their own input or they recursively
      inventory their pattern literals and allowlist rows. Allowed entries are
      limited to negative tests, migration recognition, `CHANGELOG.md`
      history and historical/planning documents (including this file); no
      lecture source, current authoring documentation or executable template
      may be allowlisted.
   3. Give the migration script a non-writing `--check <repo-root>` mode and
      run it explicitly once for this repo and once for
      `../psi-slides-mylectures`. That is the cross-repo acceptance check; it
      uses the exact same generated and historical exclusions as the write
      mode, reports every file that would change plus any forbidden legacy
      token on an active authoring surface, and is not smuggled into the
      single-repo gate contract.

   **Register the gate:** `test/gates/run.mjs` does not discover files; it
   runs the fixed `GATES` array at line 37. Add
   `./legacy-draw-syntax.mjs` there and update the header from six to seven
   gates, including a one-line `legacy-draw-syntax` entry. `test/README.md:5`
   counts "Six gates" as well (checked); change both, or the two documents
   disagree about how many gates exist. Otherwise the new
   file never runs even though `npm test` appears green. Built views containing
   highlighted source remain excluded, so they neither hide a miss nor create
   false failures.
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
**[review 5] Start with a table-driven `parseDrawOpener` unit test:** null
for prose and `::: drawing`; valid results for bare draw, unit only,
autoplay without a unit, and the full unit/autoplay/cycle form; then
`stray-attribute` for the old braces, `autoplay=` and a trailing unknown
word, `bad-unit` for `150X56`, and `bad-autoplay` for a non-number, 199/60001
and cycle without autoplay. Round-trip every valid field combination through
`formatDrawOpener` and the parser. Add adapter tests proving that a malformed
opener produces one causal lint family rather than body-line cascades and
that the corpus extractor counts it instead of dropping it.

Then add: (a) old spelling refused with the new one in the message; (b) `WxH`
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
**[review 4]** Also pin the diagnostic replacement for `#id`: a broken chunk figure
names its chunk, and a broken column-heading figure names its divider id or
heading instead of claiming it is "a chunk with no id".

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

All six reviews are resolved in place; this list is the index.

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
- Review 4: removed the last stale draw-tail/`{#id}` grammar references
  (1, implementation notes; 4, Plan 1 + Plan 4); preserved the real diagnostic value of
  draw ids through chunk/divider-aware `where` before removing them (4,
  Plan 1 + Tests); made `unit` one canonical `WxH` string across parser,
  adapter, formatter and migration (4, Plan 1); crossed the classic-script
  editor boundary with a preformatted opener payload instead of an
  unavailable module export (4, Plan 3); removed the contradictory
  `DG_HOST_OPTS` instruction and the overlapping `cycle` error codes (4,
  Plan 4); made an unexpected old `#id` abort migration instead of losing
  authored text (4, Plan 5). Its code claims were re-checked afterwards at
  `build.js:3337`, `:3400`, `:2532–2536` and `:6461`.
- Review 5 was applied in place; its code claims were re-checked
  afterwards and hold: `classes[0]` at `build.js:3394` and `.find` at
  `:3419`; six `bad-diagram-attribute` sites at `lint.js:708, 715, 726,
  735, 741, 2383`, the last of the body ones being the add/remove conflict;
  `attrsOf` is defined at lint.js:701; `headAttrs` at `diagram-core.mjs:2986, 3017, 6608–6614, 7009`;
  the `psi-diagram-source` payload written by `renderDiagram` at
  `diagram-core.mjs:7006`; `fig.chunk` read by `dgeCollectFigures`, the
  self-test report, the figure list labels and `DGE_REOPEN`; no block-level
  `{}` in any `source.md` of either repo. One addition from that check:
  the gate runner's fixed `GATES` list (4, Plan 5).
- Review 5: defined empty `{}` as a refused no-op and corrected the parser
  matrix to ten rows (1b″ + Tests); described the module as exporting
  several pure helpers rather than one (1c); made the diagram-body lint-code
  migration explicit and added the missing add/remove conflict code (3);
  corrected the concrete chunk/divider `where` fallbacks and removed an
  inert, out-of-scope editor `column` payload (4, Plan 1); named
  `renderDiagram` as the source-payload owner (4, Plans 2–3); replaced the
  impossible self-matching zero-hit scan with authored-source and reviewed-
  allowlist gates (4, Plan 5); specified lint/corpus recovery for a refused
  opener and a complete parser/formatter test matrix (4, Plan 1 + Tests);
  completed the shared module's export list and formatter contract (1,
  Plan 1).
- Review 6: separated the single-checkout syntax gate from the explicit
  two-repository migration check; excluded the gate and its allowlist from
  their own scan; made the inventory truly repo-wide rather than describing
  an active-doc-only scan whose allowlist named tests and history; and
  required `run.mjs`'s gate count and prose to be updated together with its
  fixed `GATES` array. It also made migration write/check modes share one
  exclusion set and kept allowlisted history out of the automatic rewrite
  (4, Plan 5). The review-count scoreboard was removed from the introduction
  because verification additions made it a source of noise rather than an
  implementation contract.

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

---

## Implementation log

Kept while implementing. Decisions and deviations
from the plan above are marked **[decision]** / **[deviation]** with the
reason; everything else landed as written.

### What landed

- [x] Item 1: `tails.mjs` – `CHUNK_SLOTS`, `CARDS_SLOTS`, `OVERLAY_SLOTS`,
  `BACKDROP_SLOTS`, `SIDE_SLOTS`, `CHUNK_STYLE_CLASSES`, `VALID_WIDTHS`,
  `VALID_CHUNK_CLASSES`, `SLOT_TABLES`, `splitTail`, `parseTail`, `slotTable`,
  the collision assertion with the default exemption; plus (item 4)
  `parseDrawOpener`, `formatDrawOpener`, `drawCompilerAttrs`,
  `parseLegacyDrawTail`, `AUTOPLAY_MIN/MAX`, `DRAW_OPENER_EXAMPLE`.
- [x] Item 1: build.js – `parseAttributeTail` is a thin adapter over
  `splitTail` + `parseTail` (same return shape as before, so the h1/h2
  callers did not move); `readTail()` replaces `parseSlotClasses` at the
  backdrop, cards/rows, overlay and side sites and returns the resolved
  values plus `written`. Column-heading refusal and the title/closing
  refusal stay at the callers. Directive `attrs` are stored as `null` when
  no braces were written (was `''`), so the parser can tell `{}` apart.
- [x] Item 2: `renderCardsBlock` reads `o.written.anchor` and
  `o.written.scrim`; the raw-tail re-split is gone.
- [x] Item 1/3: lint.js – both parsers and all five mirrored tables deleted;
  every tail goes through `parseTail`, every problem is reported under the
  parser's code. `unknown-width`, `bad-{side,cards,rows,overlay,backdrop}-class`
  and `unknown-diagram-option` no longer exist.
- [x] Item 3: diagram-body codes – `name-in-tail`, `empty-tag`,
  `stray-attribute`, `duplicate-removal`, `conflicting-class`;
  `draw-defaults` non-class → `stray-attribute`. `bad-diagram-attribute` is
  gone (asserted in `test/settings.mjs`).
- [x] Item 4: opener grammar in all four callers; `DG_HOST_OPTS`, the skip
  branch and the `#id` branch removed from `diagram-core.mjs`, the compiler
  refuses `autoplay=` and `#id` as unknown options (gated); `takeAutoplay`
  removed from build.js; `where` names chunk id / heading / divider column
  id / heading per the review-5 expression (tested).
- [x] Item 4: payload `opener` (serialised by `renderDiagram`), editor reads
  `data.opener`, `dgeBlockText()` writes it verbatim; round trip pinned in
  `test/editor-guides.mjs` (second fixture chunk `#rt`).
- [x] Item 4: `tools/migrate-draw-opener.mjs` (dry run / `--write` /
  `--check <root>`), run with `--write` on both repos: 13 files here, 2 in
  mylectures; `--check` clean on both afterwards.
- [x] Item 4: `test/gates/legacy-draw-syntax.mjs` + `.txt` (regenerated
  with `--write` as the last step of the work; the row count is whatever
  the checked-in file holds, not a number quoted here), registered in
  `run.mjs` `GATES`; header and `test/README.md` say eight gates (six +
  `tails` + `legacy-draw-syntax`).
- [x] Item 4: corpus gate imports `parseDrawOpener`, synthesises
  `unit=WxH`, records a refused opener as a failure, asserts per-file
  counts, covers `decoration`.
- [x] Tests: `test/gates/tails.mjs` (128 assertions: every code, written
  defaults, `.auto` slot, formatter round trip, compiler refusal of host
  words); `test/settings.mjs` gains the ten-row adapter matrix, the flag
  spellings, `{.auto .left}` / `{.auto .large}`, rows/scrim `written`
  cases, the opener refusals, the `where` diagnostics and the five
  diagram-body codes.
- [x] Item 5 / 1c: `CLAUDE.md` (lint-independence section, chunk-grammar
  section, draw section, command comment), both figure skills, the
  decoration skill, `PRD.md`, `CHANGELOG.md` (Unreleased → Changed),
  `editor.md` §15, `test/README.md`, mylectures `HOUSE-STYLE.md`.
- [x] Verification: all 29 lectures of both repos built before and after
  the migration into a scratch dir; `print.html` / `print-notes.html`
  byte-identical everywhere except the tutorial (its prose changed by
  hand); in `audience.html` / `speaker.html` the only differences are the
  inlined `diagram-core.mjs` / `editor.mjs` text, the new `opener` payload
  field and the `range` offsets (every opener shrank by seven bytes). All
  `psi-diagram-frames` payloads identical. `refresh-figures.mjs` re-run and
  `--check` clean. `npm run gate` green (631 assertions after the review
  pass, eight gates); `node test/settings.mjs` 408 passed; `node test/run.mjs` 855 passed and
  the same three `text-select` Alt-drag assertions failing that the section
  below recorded before this change. Migration `--check` clean on both
  repos. The tracked views of `tutorial`, `diagrams` and `decoration` were
  rebuilt; `decoration/print.html` is byte-identical and therefore
  unchanged.

### Decisions and deviations

- **[decision] `CHUNK_SLOTS.width.default` is `null`, not `'standard'`** (1a
  wrote `'standard'`). The chunk width default is per type – `outline` is
  `wide` – and lives at the caller; a table default of `standard` would
  have reported an outline chunk as resolving to a width it does not have.
  The flags `bare` / `center` default to `false` as planned.
- **[decision] Slot tables are `{ default, words }` objects** everywhere,
  including the four directive tables that used to be arrays with the
  default first. `slotTable()` prints `(default: .x)` only for a string
  default.
- **[decision] One message format, double quotes.** build.js and lint.js
  used to quote tokens differently (`"width"` vs `'width'`); the shared
  parser uses double quotes and the lint greps in `test/settings.mjs`
  were updated accordingly. The phrases the tests grep (`is not a word this
  directive knows`, `both answer "anchor"`, `is not a .word`, `is not a
  .class or an #id`) are kept.
- **[decision] `parseDrawOpener` is strict about order** – grid, then
  `autoplay N`, then `cycle`; `::: draw autoplay 900 150x56` is
  `stray-attribute` ("the grid comes first"). One spelling per line was the
  point of the exercise, and the message always quotes the canonical form.
- **[decision] `parseDrawOpener` reuses `parseLegacyDrawTail`** to spell
  the exact new line in the refusal of an old opener
  (`Write  ::: draw 150x56 autoplay 1400 cycle`), and adds "(a draw #id was
  diagnostic only; drop it)" when the old tail carried one.
- **[decision] The migration script lives in `tools/`** (new directory; the
  repo had no home for a one-off tool). It scans all matches first and
  writes nothing if any opener cannot be rewritten, rather than aborting on
  the first – the hand-fix list is then complete after one run. Six
  openers needed a hand fix before the first `--write`: the symbolic forms
  in the figures skill, `CLAUDE.md`, `editor.md`, the tutorial heading,
  `test/autoplay.mjs`'s header comment, and the negative test
  `::: draw {cycle}` in `test/settings.mjs` (now `::: draw cycle`).
- **[deviation] The migration excludes `test/settings.mjs` and
  `test/gates/tails.mjs`** beyond the planned exclusion set: both hold the
  old opener as negative tests on purpose, and `--check` would otherwise
  never be clean. They are reviewed on the gate's allowlist instead.
- **[deviation] The `cycle` inventory pattern is narrower than planned.**
  `\{[^}]*\bcycle\b[^}]*\}` matched every JS object literal and template
  placeholder that mentions `cycle` (`{ autoplay, cycle, rest }`,
  `${cycle}`). The gate uses
  `(?<!\$)\{[^}\n:,$]*\bcycle\b[^}\n:,$]*\}` – one line, no `:` `,` `$`
  inside, which a draw tail never had and code always has.
- **[deviation] `editor.md` is allowlistable.** The plan's "no current
  authoring documentation" is enforced as: no `source.md`, nothing under
  `.claude/`, not `figure-design.md`, `README.md`, `CLAUDE.md`, `PRD.md`,
  `speaker.md`, nothing under `docs/site/`. `editor.md` is a spec and build
  log; its one surviving row is the payload example `"attrs": "unit=130x76"`,
  which is the compiler's adapter string and still true.
- **[deviation] `unit=WxH` in build.js / diagram-core.mjs / editor.mjs
  comments is allowlisted**, not rewritten: it names the compiler's
  head-attribute adapter string, which still exists (`drawCompilerAttrs`).
  Prose that meant the *opener* was rewritten to "on a 150x52 grid" /
  "`::: draw 150x52`" instead, in skills, PRD, figure-design, editor.md,
  the site's index pages and the three lecture sources.
- **[deviation] Corpus count for the tutorial is 10, not 11.** The plan's
  count was `grep -c '^::: draw'`, which includes one opener inside a
  fenced syntax example; the extractor is fence-aware. Total corpus 134.
- **[deviation] The chunk-grammar signature keeps `{.width #id}`.** Item 5
  asked for one placeholder convention; `{…}` plus an example is applied
  to every *directive* signature (backdrop, overlay, cards, rows, side) in
  the skills and PRD. `## type: Heading | Sub {.width #id}` is the 1.0.0
  grammar line quoted in README, CLAUDE.md, the tutorial and the skill
  description, and rewriting it would have rebuilt tracked views for no
  reader's benefit.
- **[deviation] `--check-fit` was not run** on every lecture: the compiled
  SVGs and frame payloads are byte-identical before and after, which is a
  stronger statement than a fit walk. `docs/site/shoot-gallery.mjs` was not
  executed either (needs a browser and an encoder, and rewrites the site's
  images); its `DRAW` template was migrated and the same opener shape is
  built by the settings tests.
- **[decision] `readTail()` in build.js rewrites the parser's `::: side:`
  prefix to `::: side in chunk #a:`** so the build's message keeps naming
  the slide, as before, while the parser stays ignorant of where it is.
- **[note] The 87bcc86 heading path recorded unknown classes silently in
  `parseAttributeTail` and refused them at the h2 caller.** Now the parser
  refuses them (`unknown-class`); the h2-site check was deleted. `classes`
  records every written `.word`, known or not (the contract the plan
  states; the first cut dropped unknown and repeated words and the review
  caught it), so the linter reports `unknown-class` *and* `class-on-column`
  for an unknown class on a column heading. The build's adapter throws on
  the first problem, so there the message is the parser's `unknown-class`
  one; a *known* class on a column heading still gets the dedicated
  "carries .x" refusal.
- **[deviation] `tails.mjs` is about 400 lines, not under 200** as 1c
  wrote. The parsing and formatting code is roughly a third of it; the
  rest is the slot tables with the comments that used to sit beside them
  in build.js (why `plain` and not `clear`, why `over` exists, why a
  written default is legal) and the contract comments on each export. The
  property 1c protects is the zero-dependency boundary and "nothing pulled
  in behind it", and both hold; shortening the module would have meant
  deleting the reasoning that keeps the tables from being edited wrongly.
  `CLAUDE.md` says "under 400 lines".
- **[deviation] The syntax gate scans tracked *and* untracked-not-ignored
  files** (`git ls-files` plus `--others --exclude-standard`), where the
  plan said tracked. With tracked only, the new files (`tails.mjs`, the
  migration tool, the negative tests in `test/gates/tails.mjs`) were
  invisible to the gate until committed and would have failed it on the
  first run after `git add`. Consequence worth knowing: this planning file
  is on the allowlist with a count, so editing its old-form mentions means
  regenerating the list (`node test/gates/legacy-draw-syntax.mjs --write`)
  in the same commit – that is the "does not rot" rule doing its job.
- **[found on the way] A backtick in a comment inside `AUDIENCE_JS`** (from
  rewording `{autoplay=N}` to `` `autoplay N` `` at build.js:11427) broke
  every build until the `inlined` gate named it. The comment now reads
  "written with autoplay N". Exactly the trap CLAUDE.md describes.

---

## Post-implementation code review (Codex)

**Status: all findings below resolved in place (second pass); each item
carries a note.** A third pass, `/code-review high` over both repositories,
followed and is recorded in the next section. The shared-parser shape, the four opener
callers, the editor payload, the corpus ratchet and the registered syntax gate
are in place. The current contents of both repositories also pass the migration
check. The remaining findings are edge cases in the reusable parser/migrator
and two claims in this document that the implementation does not currently
satisfy.

### Blocking findings

- [x] **[P1] The migration can emit an opener that the new parser refuses.**
  *Resolved:* `validUnit()` in `tails.mjs` requires two positive sides;
  `formatDrawOpener` throws on `0x56`; `parseLegacyDrawTail` now returns
  `why` (the one sentence a caller prints) and names a zero-side grid;
  `migrateText` leaves such a line alone and reports it; the old-opener
  diagnostic falls back to the example line with "(the old tail has a zero
  side …)" instead of recommending `::: draw 0x56`. `migrateText` itself is
  tested end to end in `test/gates/tails.mjs` (eight refused rows, three
  rewritten ones).
  `migrateText('::: draw {unit=0x56}')` reports one change and produces
  `::: draw 0x56` with no problem; `parseDrawOpener` then reports `bad-unit`.
  The same hole is in `formatDrawOpener`: despite accepting only a valid field
  set by contract, it checks the `WxH` shape but not that both sides are
  positive. It also lets the old-opener diagnostic recommend that invalid new
  line. Validate the numeric sides in the formatter, make the migration refuse
  an invalid legacy grid before writing, and test `migrateText` itself (not
  only the legacy reader and formatter separately).

- [x] **[P1] A repeated legacy autoplay changes meaning silently.**
  *Resolved:* `parseLegacyDrawTail` records `repeated` for `unit`,
  `autoplay`, `cycle` and `#id`, and `why` says "writes autoplay twice -
  which one was meant is not for a script to guess"; the migration refuses
  the line, the parser's refusal message shows the example form rather than
  a guessed line. Tested for all four fields. The old
  build's `takeAutoplay` consumed the first occurrence and the compiler skipped
  a later host option. `parseLegacyDrawTail` overwrites its field on every
  match, so migrating
  `::: draw {autoplay=900 autoplay=1200}` produces
  `::: draw autoplay 1200`: first-wins became last-wins. Repeated fields are
  ambiguous migration input and should abort (preferably all repeated legacy
  `unit`, `autoplay`, `cycle` and `#id` fields), with a regression test around
  the complete transform.

- [x] **[P1] The promised cross-repository `--check` is only an old-opener
  check.** *Resolved:* the tool now owns `LEGACY_TOKENS` (the five patterns)
  and `isActiveSurface(rel)` – a `source.md` anywhere, anything under
  `.claude/` or `docs/site/`, and every root-level `.md` except the history
  exclusions, `editor.md`, `HANDOFF.md`, `CONTRIBUTING.md` and
  `revision-implementation.md` – and `--check` scans *every* text file
  under the root, reporting each old-form token on an active surface as
  well as each file the write mode would change. The gate imports both
  definitions (`unallowlistable = isActiveSurface`), so the single-checkout
  gate and the cross-repository check cannot disagree about what "stale"
  means. The first run of the new check found what the old one could not:
  two stale mentions in mylectures' `HOUSE-STYLE.md` (a literal old opener
  in the "Attribute tails" section and a `unit=112x40` in the figure
  advice), both reworded; both repos are clean under the new check. Item 4 / review 6 requires it to report both files it would rewrite
  *and any forbidden legacy token on an active authoring surface*. The script
  only applies `OPENER_RE`, and even skips a file unless it contains
  `::: draw`; an active document containing only symbolic `unit=WxH` or
  `autoplay=N` therefore passes. The committed inventory gate covers this
  checkout, but there is no corresponding token check for mylectures. Either
  implement the documented active-surface inventory in `--check` for an
  arbitrary root or explicitly narrow the acceptance contract and provide a
  second cross-repository check.

### Parser and diagnostic findings

- [x] **[P2] Duplicate/out-of-order autoplay produces a false diagnostic and
  a cascade.** *Resolved:* the parser tracks `sawAutoplay` / `sawCycle`; a
  second `autoplay` is "written twice", one after `cycle` is "after cycle",
  and either consumes its delay so nothing is read as a grid; a repeated
  `cycle` says so. Rows added to the parser table plus three assertions on
  the exact problem lists. `::: draw autoplay 900 autoplay 1200` says the second keyword
  is “after cycle” although there is no cycle, then reads `1200` as a grid and
  adds `bad-unit`. `::: draw cycle autoplay 900` has the same spurious grid
  error. Track which keyword was actually seen, report duplicate vs.
  out-of-order accurately, and consume the associated delay while recovering.
  Add these rows to the parser table; the current matrix has no duplicate
  opener keyword.

- [x] **[P2] A formerly accepted no-space legacy opener is no longer an
  opener to build or lint.** *Resolved:* the opener regex is
  `/^:::\s+draw(?=\s|$|\{)/`, so `::: draw{unit=150x56}` is refused with
  the new spelling in build and lint (one finding, body captured), and the
  migration rewrites it; `::: drawing` stays `null`. Pinned in the parser
  table, in `migrateText`'s tests and in the settings adapter tests. The old build's opener regex and the migration
  regex both accept `::: draw{unit=150x56}`, but `parseDrawOpener` returns
  `null` because of the
  look-ahead after `draw`. If such a stale source misses migration, the parser
  does not give the promised old-syntax refusal and the body falls through to
  unrelated parsing. Recognise `{` after `draw` as a malformed legacy opener
  (while keeping genuinely unrelated words such as `::: drawing` as `null`),
  and pin the case in the parser plus adapter tests.

- [x] **[P2] `parseTail().classes` does not match its documented return
  contract.** *Resolved:* the plan's contract stands – every written
  `.word` in written order, known or not – and the parser now honours it;
  three gate assertions pin `.foo`, `.wide .full` and `.wide .wide`. The
  lint adapter therefore reports `unknown-class` and `class-on-column`
  together, which the settings tests now assert; the implementation-log
  note was corrected to say what the build does (throws the first problem). The plan says “every `.word` in written order”, and build.js's
  adapter comment says every class token is recorded. In fact, the `continue`
  branches omit unknown and repeated words: `.bogus` returns `classes: []`,
  and `.wide .full` returns only `['wide']`. Consequently the implementation
  log's claim that lint emits both `unknown-class` and `class-on-column` for an
  unknown class on a column heading is false; it emits only `unknown-class`.
  Decide the intended contract, test it explicitly, and then either preserve
  all written class tokens for contextual checks or correct the plan, adapter
  comment and implementation-log claim together.

### Documentation discrepancy

- [x] **[P3] The architecture size claim changed without being recorded as a
  deviation.** *Resolved:* recorded under "Decisions and deviations" with
  the rationale (the tables' reasoning moved with them; the protected
  property is the dependency boundary). Item 1c specifies a shared module under 200 lines;
  `tails.mjs` is 396 lines and `CLAUDE.md` now says “under 400 lines”, while the
  implementation log says everything not marked as a decision/deviation landed
  as written. The zero-dependency boundary is the important property, so the
  larger commented module may be reasonable; record the deviation and its
  rationale (or split/shorten the module) rather than silently rewriting the
  acceptance claim elsewhere.

- [x] **[P3] The implementation log's allowlist count is stale.**
  *Resolved:* the log no longer quotes a count; the file is regenerated with
  `--write` as the last step and the gate holds it exact. It says
  `legacy-draw-syntax.txt` has 21 rows; the checked-in inventory has 36 rows.
  This is only bookkeeping, but an implementation log presented as the final
  verification record should quote the generated artifact's actual count.

### Verification performed in this review

- `git diff --check`: clean.
- `npm run gate`: green (597 assertions, eight gates).
- `node test/settings.mjs`: 405 passed, 0 failed.
- Migration `--check`: clean for this repository and
  `../psi-slides-mylectures`; this validates current content, not the missing
  symbolic-token behavior described above.
- `node test/run.mjs`: 855 passed, 3 failed in 450.8 s. The failures are the
  same three pre-existing `text-select` Alt-drag assertions already documented
  above; no new browser failure appeared in this review run.

---

## Third pass: `/code-review high` over both repositories

All ten ranked findings and the confirmed-but-cut list were addressed in
place. What changed, one line each:

- **`carries #id` refusal no longer throws.** `parseLegacyDrawTail` checks
  the id last, so `why` says "carries #" only when the rest is sound and
  the formatter is safe to call; `{#fig unit=0x5}`, `{#fig autoplay=50}`
  and `{#fig cycle}` now name the real defect. Gated.
- **`OPENER_RE` is line-bounded and reads `:::` + any blank run + `draw`**
  (`/:::[ \t]+draw[ \t]*\{([^}\n]*)\}/g`), so a bare `::: draw` above a
  `{…}` line is left alone and a tab- or double-spaced opener is migrated.
  Gated both ways.
- **No pre-regex survives.** `collectDiagramImageRefs` (build.js),
  `diagramImageRefs` (lint.js) and the cols refusal all call
  `parseDrawOpener`; `::: draw-x` is prose in both files.
- **The tool's CLI:** the main guard compares paths (`fileURLToPath`), not a
  URL against a path; every positional root is processed; a root that is not
  a repository top level is refused with one line, because every exclusion
  is root-relative.
- **The spliced pages' prose is an active surface.** `proseOf()` blanks
  `<svg>`, `<script>` and `<style>` regions; the gate and `--check` scan
  what is left for the old opener and the old tokens. That found two
  sentences in `figures-you-write.html` teaching the braced form; both
  reworded. `docs/site/example/` is no longer excluded (only its built views
  are, by basename) and its `source.md` is in the corpus with a count of 0.
- **The gate and `--check` share one notion of stale:** the old-opener
  scan runs on every active surface, not only `source.md`; the file list,
  the generated/history/self exclusions and `OPENER_RE` are imported from
  the tool.
- **`splitTail` reports a sigil group that does not end the line**
  (`{.narrow}{#tt}`, `Head {.wide #id} | Sub`, `# Part {#c1} trailing`, an
  unclosed `{.wide`) as `stray-attribute` through `strayTailProblem`; plain
  `{x}` in prose is untouched.
- **A column heading's tail is parsed with `classes: 'none'`**: any `.word`
  is `class-on-column`, said once, by the parser, in both files; the
  dedicated build refusal and the lint loop are gone. On a title/closing
  chunk lint no longer doubles `unknown-class` with `class-on-cover-chunk`.
- **A bare number on the opener** (`::: draw 150x56 1200`) says "a delay
  is written with its keyword: autoplay 1200".
- **Docs:** PRD's reference example names its edge in front (`edge leak
  mix -> log`); the Unreleased autoplay entry in CHANGELOG spells the new
  opener; CLAUDE.md's command comment counts eight gates; HOUSE-STYLE.md
  says where `#word` is legal and lists the whole chunk-tail vocabulary; the
  appearance skill says `CHUNK_STYLE_CLASSES` lives in `tails.mjs`;
  diagram-core's element-tail error no longer offers `#id`; the dates in
  this file's headings are gone (`~/.claude/CLAUDE.md`: no dates in task
  files).
- **Allowlist noise:** the `cycle` line in `parseLegacyDrawTail` is written
  on two lines so the bare-`cycle` pattern does not match a JS block.
  `VALID_WIDTHS` / `VALID_CHUNK_CLASSES` now have an importer (lint's
  cover-chunk filter).

**The three pre-existing holes the review confirmed, fixed in a fourth
pass:**
- `::: backdrop {.blur}`, `::: cols 4`, `::: overlay {.ink} junk` (and a
  malformed backdrop on a divider) are refused by the build with "is not a
  line this directive reads" plus the directive's shape, the guard
  `::: side`, `::: cards` and `::: rows` already had (a first cut added a
  second cards/rows guard in front of the existing one and two existing
  tests caught the changed message; removed). lint.js gains `bad-cols` and
  `bad-overlay` beside its existing `bad-backdrop`, `bad-cards`,
  `bad-rows`; all five pairs are asserted in `test/settings.mjs`.
- `autoplay N` on a figure with no `step` block: the build refuses it in
  `onCompile` (the model knows its steps), lint under `bad-autoplay` from a
  `hasStep` flag in `lintDiagram`.
- CRLF: `parseLecture` and `lintFile` normalise to LF on read; the watch
  server's patch handler normalises the file the same way before splicing,
  so the editor's byte ranges hold, and writes LF back. **[decision]**
  Normalise rather than refuse: a source that renders identically on every
  platform is what the format promises, and an author on Windows should not
  meet a build error for their editor's default.

**Verification of the third pass:** `npm run gate` 655 green;
`node test/settings.mjs` 419 green; `node test/run.mjs` 855 green with the
same three pre-existing `text-select` Alt-drag failures; migration `--check`
clean on both repositories including the spliced pages' prose;
`refresh-figures.mjs --check` up to date; tracked views rebuilt.

**Verification of the fourth pass:** `npm run gate` 655 green;
`node test/settings.mjs` 434 green; `node test/run.mjs` 855 green with the
same three pre-existing `text-select` Alt-drag failures; lint clean on both
repositories; tracked views rebuilt.
