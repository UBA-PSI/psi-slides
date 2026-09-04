# TODO – inconsistencies in the `{…}` tails, and how to finish the job

Collected while making every setting in a tail dot-mandatory (commit
87bcc86). That commit left the format with one *spelling* rule but still
four implementations of it, one directive that breaks the rule, and lint
codes that name the same refusal five ways. This file is written so a fresh
session can implement each item without re-deriving it. Every entry has:
what it is, what has been checked, what to check before touching it, the
plan, the risks, and the tests that pin it.

The end state all items aim at, in one line each:

```
## principle: Heading {.wide .bare #id}
::: cards 3 {.outline .middle}
::: rows {.accent}
::: side 2:1 {.middle}
::: backdrop dusk {.cover .invert} reveal full, right 45%
::: overlay {.bottom-left .ink} from 2
::: draw 150x56 {#fig} autoplay 1200 cycle
```

**Braces hold sigil tokens only** (`.word` setting, `#word` id, and inside a
draw body also `@word` group and `!word` removal). **The one primary argument
is positional, before the braces.** **Anything optional that carries a value
is a keyword after the braces.**

Suggested order: item 1 (one parser module, with 2 and 3 folded in), then
item 4 (draw), then item 5 (docs). Items 6–7 are already resolved or
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
- `build.js` is ESM (`import … from './diagram-core.mjs'` at line 33), and
  `lint.js` imports the compiler from `diagram-core.mjs` too (lint.js:327).
  A shared `tails.mjs` needs no module-system work.
- The five mirrored constants: `grep -oE "Mirrors? [A-Z_]+ in build.js" lint.js`
  → `CARDS_SLOTS`, `CHUNK_STYLE_CLASSES`, `SIDE_SLOTS`, `STYLE_SPEC`,
  `VIEW_DEFAULT_SPEC`. `OVERLAY_SLOTS` and `BACKDROP_SLOTS` are mirrored
  without the comment. `STYLE_SPEC` and `VIEW_DEFAULT_SPEC` are frontmatter,
  not tails – out of scope here, but they would move into the same module
  or a sibling for the same reason.
- Call sites in build.js: `parseAttributeTail` at the `h1`/`h2` branches
  (~3380–3420); `parseSlotClasses` at `renderBackdrop` (~1950),
  `renderCardsBlock` (~2028), overlay rendering (~2137), and the `side`
  opener (~3795). In lint.js: `parseAttributeTail` at the `h1`/`h2`
  branches (~2600–2640); `slotProblems` at backdrop (~2692), overlay
  (~2739), cards/rows (~2770), side (~2853).
- The load-time assertion that no word sits in two slots of one table
  (build.js ~1850, "clear was a ground and very nearly also a scrim") must
  move with the tables.
- The chunk tail already *is* a slot table in disguise: `CHUNK_STYLE_CLASSES`
  maps `wrap-none → [wrap, none]`, `blocks-center → [blocks, center]`;
  width is a slot of four; `.bare` and `.center` are two-valued slots whose
  default is unwritten.

**To check before implementing.**
- Whether any code reads `parseAttributeTail(...).classes` as an ordered
  list (the column-heading refusal prints `classes[0]`); the new return
  shape must keep that or the caller must change.
- Whether `parseDiagramDefaults` in diagram-core has its own `{…}` reader
  for element tails (lint.js ~2343 reads them for draw defaults). It does –
  element tails inside a draw body stay in diagram-core; this item covers
  only the *block-level* tails (heading, `:::` directive).
- `test/settings.mjs` greps message text: `/is not a word this directive knows/`,
  `/both answer "anchor"/`, `/is not a \.word/`, `/is not a \.class or an #id/`,
  `/both answer "width"/`. Keep the phrases or update the tests in the
  same commit.

**Plan.**
1. Create `tails.mjs` exporting the tables (`WIDTHS`, `CHUNK_SLOTS`,
   `CARDS_SLOTS`, `OVERLAY_SLOTS`, `BACKDROP_SLOTS`, `SIDE_SLOTS`) and one
   function `parseTail(text, slots, opts)` that returns data and never
   throws:
   ```js
   { text, id, ids, slots: { width: {value, written}, … }, problems: [{code, msg}] }
   ```
   `problems` codes: `stray-attribute`, `unknown-slot-word`, `same-slot`,
   `multiple-ids`. `written` is the fix for item 2.
2. `CHUNK_SLOTS` expresses the heading tail as slots:
   `width: ['standard','narrow','wide','full']`, `wrap: ['wrap-balance','wrap-none']`
   (with the value derived from the class name), `blocks: […]`,
   `heading: ['shown','bare']`, `axis: ['left','center']`. The class
   *spelling* does not change (item 6).
3. build.js: replace both parsers with `parseTail`; on `problems.length`,
   throw a `userFacing` error built from `problems[0].msg` plus the slot
   table listing (keep `slotTable()` there or move it).
4. lint.js: replace both parsers; `for (const p of problems) add(ln, 'error', p.code, `::: ${what}: ${p.msg}`)`.
   This is where item 3 lands for free.
5. Delete the five mirrored constants and their comments in lint.js.
6. Run `npm test`; expect `test/settings.mjs` message greps to need the
   new phrasing; expect no lecture change.

**Risks.**
- The heading tail is 1.0.0 interface; the refactor must be byte-identical
  in output for every existing tail. Diff `audience.html`/`print.html` of
  every lecture in both repos before/after (build all, `git diff --stat`
  on the tracked views in the engine repo; for mylectures build to a
  scratch dir and diff).
- `parseAttributeTail` also handles the *title* chunk's tail, where width
  and `.bare` are refused later by the caller ("cover composition decides").
  Keep that refusal at the caller, not in the parser.
- `lint.js` must never be stricter than the build. With one parser that is
  structural; but the build's *callers* add refusals (scrim without photo,
  width on a title chunk) that lint mirrors by hand – list them and check
  each has a lint twin after the refactor.

**Tests.** The twelve assertions added in 87bcc86 (`test/settings.mjs`,
search `One sigil rule`) plus the existing side/cards/overlay/backdrop
refusals. Add one: the same source produces the same problem list from
both files (call `parseTail` directly, no build).

---

## 2. `parseSlotClasses` cannot tell a written default from an absent one

**What it is.** `rows` defaults `anchor` to `middle` while `cards` defaults
it to `top`. The parser returns only the resolved value, so `renderCardsBlock`
(build.js ~2105–2113) re-splits the raw tail and tests for `top`/`middle`
by hand before deciding. The scrim-without-photo check (~2118) does the
same raw-split for a different reason.

**Checked.** Both hacks are in one function and read `b.attrs` directly.
No other directive has a per-construct default yet.

**Plan.** Folded into item 1: `slots[name].written` is `true` when the
author wrote the word. `rows`: `if (b.rows && !slots.anchor.written) anchor = 'middle'`.
Scrim: `if (slots.scrim.written && ground !== 'photo') refuse`.

**Risks.** None beyond item 1. `test/settings.mjs` ~1905–1920 pins that a
written default "changes nothing"; that stays true.

---

## 3. Lint codes: one family for one refusal

**What it is.** The same three refusals carry different codes per directive:
`bad-side-class`, `bad-overlay-class`, `bad-backdrop-class`, and cards/rows
report under whatever code sits at lint.js ~2770 (check – the grep for a
quoted code after `slotProblems(` found only the three above, so cards may
be using a shared code already). The chunk tail says `stray-attribute` /
`same-slot` since 87bcc86. `unknown-width` fires for *any* unknown chunk
class (`.bar` for `.bare`), and its message says "unknown class".
`bad-diagram-attribute` is one code for at least five mistakes (lint.js
~670–700 and ~2343): element name in the tail, empty `@`, unknown sigil,
`!x` written twice, bare word.

**Checked.**
- No lecture in either repo ignores any of these codes:
  `grep -rhoE 'linter:\s*ignore[^>]*' lectures/ …/psi-slides-mylectures/lectures/`
  finds only `reveal-overuse` and `density`. Renaming breaks no source.
- `test/settings.mjs` references `bad-side-class` (3×), and the others
  possibly via message text; `grep -rn "bad-\(side\|overlay\|backdrop\)-class\|unknown-width\|bad-diagram-attribute" test/`.
- The lint README / skill docs list codes? `grep -rn "bad-side-class\|unknown-width" .claude docs *.md` – update wherever listed.

**Plan.** With item 1's `problems[].code`:
- `unknown-slot-word` (was `bad-*-class`, and the "not a word this
  directive knows" branch of the chunk tail, was `unknown-width`)
- `same-slot`, `stray-attribute`, `multiple-ids` as today
- `unknown-class` replaces `unknown-width` for a chunk class outside every
  slot (keep the message naming the valid classes)
- `bad-diagram-attribute` splits into `name-in-tail`, `empty-tag`,
  `stray-attribute` (reuse), `duplicate-removal`; `unknown-diagram-class`
  stays.
The directive is named in the message (`::: side: '.sideways' is not a word
this directive knows`), never in the code.

**Risks.** Anyone's shell history or CI grep on old codes. None known.

---

## 4. `::: draw` is the one tail that holds values: `unit=WxH`, `autoplay=N`, `cycle`

**What it is.** Every other block tail holds sigil tokens; draw's holds
key=value options and one bare flag. In the two repos: ~100 lines
`::: draw {unit=118x74}` and the like (every figure in mylectures carries
one), 9 with `autoplay=…`, 3 of those with `cycle`.

**Checked.**
- `unit=` is parsed in `diagram-core.mjs` `parseDiagramSource` (~3018,
  `/^unit=(\d+)x(\d+)$/`), with the "unknown ::: draw option" gate at ~3029
  listing `#id, unit=WxH, …`. `DG_HOST_OPTS = ['autoplay', 'cycle']`
  (diagram-core.mjs:944) is the list of words the *host* (build.js) owns and
  strips before compiling.
- build.js strips `cycle` and `autoplay=` from the tail at ~1488–1512
  before handing the rest to the compiler; lint.js validates both at
  ~2543–2565 and passes `unit=` and `#id` through, everything else to
  `DG_HOST_OPTS`.
- The opener regex is the same in both files and in the column path:
  `/^:::\s+draw\s*(?:\{([^}]*)\})?\s*$/` at lint.js:2534, build.js:3544
  (column heading's own figure) and build.js:3839.
- The editor does **not** write `unit=`: `editor.mjs:7243` reproduces
  `DGE.fig.attrs` verbatim when it re-serialises the block, and no code
  there assigns `fig.attrs`. Authors write the grid by hand (which is why
  there are 60 distinct values). So a migration is a text rewrite plus the
  parser, not an editor feature.
- The rendered `<figure>` carries `data-autoplay`/cycle attributes read by
  the viewer (build.js `autoplayTimer`, `data-autoplay`); those are
  downstream of the parse and unaffected by *where* the words are written.

**To check before implementing.**
- Whether `parseDiagramSource(body, headAttrs, base)` reads anything from
  `headAttrs` other than `unit=` and `#id` (grep `headAttrs` in
  diagram-core.mjs). If `#id` comes through the attrs string, it stays in
  the braces – it is a sigil token.
- Whether the editor's own tests (`test/editor-*.mjs`) build sources with
  `{unit=…}` – they will need the new spelling.
- `docs/artifact/figures-you-write.html` and `figure-design.md` show the
  `{unit=…}` form; both are hand-maintained and must be rewritten by hand.
- The tutorial's autoplay chunk (`lectures/tutorial/source.md`, id
  `#autoplay`) explains the syntax in prose.

**Plan (option B from the discussion – the recommended one).**
1. New opener grammar, one regex in `tails.mjs` used by all three sites:
   ```
   ::: draw [WxH] [{#id}] [autoplay N [cycle]]
   ```
   `WxH` positional (the grid is the figure's one primary argument, as the
   ratio is for `side`); braces hold `#id` only for now; `autoplay N` and
   `cycle` are keywords after, in that order, `cycle` refused without
   `autoplay` as today.
2. build.js passes `{unit, id}` to the compiler as an object rather than
   re-serialising a string; `parseDiagramSource` takes the object (or keep
   the string path and synthesise `unit=WxH #id` – the smaller change,
   acceptable as a first step).
3. `DG_HOST_OPTS` is no longer needed as a *string* gate; keep it as the
   list of keywords the host recognises after the braces.
4. Migration script over both repos: `{unit=WxH}` → ` WxH`,
   `autoplay=N` → ` autoplay N`, `cycle` → ` cycle`, preserving order,
   for `::: draw` lines only. Dry-run, review, apply. Also
   `TODO-tutorial-lecture.md`, the skills, CHANGELOG (Unreleased →
   Changed).
5. lint.js: the old spelling (`unit=` inside braces, `autoplay=`, bare
   `cycle`) becomes a `stray-attribute` with the new spelling in the
   message, so a stale source says exactly what to type.

**Option A, if B is judged too expensive.** Keep key=value in the draw tail
and *document* draw as the one options-tail: "on `::: draw` the tail holds
`key=value` options, no sigils; everywhere else the tail holds sigils".
Then `cycle` must stop being a bare word: `cycle=1200` replacing
`autoplay=1200 cycle` (two keys, refused together), or `autoplay=1200,cycle`.
Cheaper by an order of magnitude, but the sigil rule then has a stated
exception, which is what the whole exercise set out to remove.

**Risks.**
- Draw is post-1.0.0 and unreleased, so the source change is allowed, but
  it is the widest text migration in the set (~100 lines, every figure in
  mylectures). The script must be dry-run and the built views diffed –
  `unit` changes geometry, so a mis-migrated line is a visibly different
  figure. `--check-fit` on every lecture after.
- The column-heading path (build.js:3544) is easy to forget; it has its
  own copy of the regex.
- The editor round-trips the opener line; after the change it must
  serialise the new form (editor.mjs:7243), or the first save from the
  editor rewrites a migrated line back to the old spelling – which lint
  will then refuse, so the failure is loud, not silent.

**Tests.** `test/settings.mjs` around the autoplay block (`grep -n autoplay test/settings.mjs`);
`test/autoplay.mjs` (browser). Add: old spelling refused with the new one
in the message; `WxH` positional reaches the compiler as the same unit as
`unit=WxH` did (compare one built figure byte-for-byte across the migration).

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
lists every placeholder. `figure-design.md` and
`docs/artifact/figures-you-write.html` are the draw-side docs and are
hand-maintained.

**Plan.** One commit after items 1–4, when the rules are final. Also
update `HOUSE-STYLE.md` in psi-slides-mylectures (section "Attribute
tails") to the four-sigil sentence and, if item 4 lands, the draw opener.

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
  a second `#id` on any heading; lint reports `multiple-ids`. (Was listed
  as "last wins".)
- Dot-less slot words on cards/rows/overlay/backdrop/side; sigil-less
  tokens on a chunk tail; two widths or two `style:` answers on one
  heading. All errors in both files, with tests.

---

## Seen on the way, not a syntax matter

- **`test/text-select.mjs` fails three Alt-drag assertions on this machine**
  ("Alt-dragging the listing selects text", "the highlight survives the key
  release", "a drag that outlives the key still selects") on the tree before
  the tail change as well as after it (`node test/run.mjs select` on a
  stash of 87bcc86's parent: 34 passed, 3 failed). Environment or a real
  regression in the selection gesture – undecided, and outside this change.
