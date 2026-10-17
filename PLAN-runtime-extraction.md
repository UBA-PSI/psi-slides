# Plan – the inlined runtime out of build.js, one literal at a time

Action item 4 of `docs/history/REVIEW-code-2026-10-17.md` (§3 and the ranked
plan): the stylesheets and browser scripts that `build.js` holds as
template-literal constants move into real files that the build reads, so they
get an editor's highlighting, a linter and a formatter. **The maintainer's
condition is the whole method: one literal per commit, gate-protected, and
every view the build writes is byte-identical before and after.** Nothing in a
built page changes; only where its text comes from.

Status: **16 of 24 moved, and every literal on the list** – the pilot, `SPEAKER_CSS`, then `PRINT_JS`,
`PULSE_PRINT_CSS`, `SPEAKER_JS`, `SOUFFLEUSE_CSS`, `SOUFFLEUSE_JS`,
`WATCH_BANNER_CSS` and `WATCH_BANNER_JS` (see *Log*): every static CSS and
JS literal on the list; then `PRINT_VIEW_JS`, the first with substitutions,
under the scheme decided for it (see *Substitution scheme*), then
`PRINT_READER_JS` and `PRINT_HIGHLIGHTS_JS`, which close step 8 of *Order*,
`DIAGRAM_CSS`, the first with a generated block (step 9), `DIAGRAM_JS`,
whose four function sources go in by placeholder (step 10), `PRINT_CSS`,
the documents' sheet with 21 substitutions (step 11), `AUDIENCE_CSS`,
the live views' sheet with 15, six of them in selector position (step 12),
and `AUDIENCE_JS`, the live views' runtime with 5 (step 13, the last). What
is left in build.js are the eight small literals the list never named (open
questions 6 and 7).
The inventory's line numbers are those of `a49b625`, before the pilot;
`node tools/runtime-literals.mjs` has the current ones.

## Inventory

**`node tools/runtime-literals.mjs` prints the current inventory** (the literals still in build.js, with lines, substitutions, escaped `\${`, backslashes and whether the value equals the source), and `--extract NAME FILE` writes a literal's *value* to a file and reads it back – the method below, kept as a tool so every later step uses the same one. For a literal with substitutions it writes placeholders where they stood and checks that filling them gives the value back (*Substitution scheme*). The table here is the snapshot the plan was written against.

The 24 multi-line template-literal constants in `build.js` at `a49b625`,
20,912 lines between them. Found by V8's parser, as `tools/coverage-logic.mjs`
does: from a `const NAME = …` line holding a backtick, the first line up to
which the text compiles with `new Function` ends the declaration. A pattern
(“a line starting with a backtick”) has been wrong here before and was not
used. The counts were then taken from the evaluated literal itself, with a
tag function: the number of substitutions is what the engine hands the tag,
and each static segment's `raw` against its cooked value says whether the
source carries an escape the literal resolves.

Columns:

- **span** – lines from the `const` line to the closing backtick, both
  included.
- **`${}`** – Node-side substitutions, all at the top level (no literal nests
  a template inside a substitution).
- **`\${`** – escaped ones: a template literal *in the shipped browser
  code*, not a substitution. They become a plain `${` in the file.
- **esc.** – backslash characters in the literal's static text. Each one
  is part of an escape the literal resolves (`\\s` in build.js is `\s` in
  the view, `\${` is `${`), so the column counts characters, not escapes.
  Where it is non-zero the file differs from the source text and must be
  written from the value.
- **views** – `A` audience, `S` speaker, `P` print and print-notes.
- **tracked** – which tracked views carry it, checked against the committed
  HTML (a static literal: its shipped, stripped value appears verbatim; an
  interpolated one: over 90 % of the long lines of its stripped static
  segments appear). `tut` = `lectures/tutorial` (all four views), `dia` =
  `lectures/diagrams` (all four), `dec` = `lectures/decoration`
  (`audience.html`, `print.html`).

| literal | lines | span | `${}` | `\${` | esc. | views | shipped | tracked |
|---|---|---:|---:|---:|---:|---|---|---|
| `DIAGRAM_CSS` | 4320–4680 | 361 | 3 | 0 | 0 | A S P | always, `shipCss` | tut dia dec |
| `DIAGRAM_JS` | 4685–5111 | 427 | 5 | 0 | 44 | A S | always, `shipJs` | tut dia dec |
| `WATCH_BANNER_CSS` | 7514–7529 | 16 | 0 | 0 | 0 | A S P | `--watch` only, **raw** (no `shipCss`) | none |
| `WATCH_BANNER_JS` | 7530–7574 | 45 | 0 | 0 | 3 | A S P | `--watch` only, **raw** (no `shipJs`) | none |
| `PRINT_CSS` | 10227–12500 | 2274 | 21 | 0 | 3 | P | always, `shipCss` | tut dia dec |
| `DOCUMENT_PAGE_CSS` | 12508–12510 | 3 | 0 | 0 | 0 | P | `kind: document` only | none |
| `PULSE_PRINT_CSS` | 12518–12540 | 23 | 0 | 0 | 0 | P | with a `::: pulse` only | tut |
| `PRINT_JS` | 12560–12707 | 148 | 0 | 0 | 0 | P | always, `shipJs` | tut dia dec |
| `READER_EARLY_JS` | 12716–12717 | 2 | 0 | 0 | 0 | P | `reader: on`, **raw** | tut dia dec |
| `PRINT_READER_JS` | 12744–12866 | 123 | 1 | 0 | 0 | P | `reader: on`, `shipJs` | tut dia dec |
| `PRINT_VIEW_JS` | 12878–12918 | 41 | 2 | 0 | 0 | P | `reader: on`, `shipJs` | tut dia dec |
| `PRINT_HIGHLIGHTS_JS` | 12975–14717 | 1743 | 1 | 0 | 34 | P | `reader: on`, `shipJs` | tut dia dec |
| `TOUCH_CONTROLS_HTML` | 15255–15273 | 19 | 0 | 0 | 0 | A S | markup | tut dia dec |
| `OVERVIEW_BADGE_HTML` | 15277–15279 | 3 | 0 | 0 | 0 | A S | markup | tut dia dec |
| `LINK_OVERLAY_HTML` | 15308–15315 | 8 | 0 | 0 | 0 | A S | markup | tut dia dec |
| `DEMO_OVERLAY_HTML` | 15320–15322 | 3 | 0 | 0 | 0 | A | markup | tut dia dec |
| `SEARCH_PANEL_HTML` | 15327–15331 | 5 | 0 | 0 | 0 | A S | markup | tut dia dec |
| `GOTO_PROMPT_HTML` | 15341–15346 | 6 | 0 | 0 | 0 | A S | markup | tut dia dec |
| `AUDIENCE_CSS` | 15590–21066 | 5477 | 15 | 0 | 1 | A S | always, `shipCss` | tut dia dec |
| `AUDIENCE_JS` | 21070–27111 | 6042 | 5 | 9 | 66 | A S | always, `shipJs` | tut dia dec |
| `SPEAKER_CSS` | 27348–28483 | 1136 | 0 | 0 | 0 | S | always, `shipCss` | tut dia |
| `SPEAKER_JS` | 28487–30092 | 1606 | 0 | 2 | 16 | S | always, `shipJs` | tut dia |
| `SOUFFLEUSE_CSS` | 30119–30372 | 254 | 0 | 0 | 2 | S | `--prompter` only, `shipCss` | none |
| `SOUFFLEUSE_JS` | 30374–31520 | 1147 | 0 | 0 | 39 | S | `--prompter` only, `shipJs` | none |

Sums: **10 static CSS/JS literals, 4,380 lines** (`SPEAKER_JS`, `SOUFFLEUSE_JS`, `SPEAKER_CSS`, `SOUFFLEUSE_CSS`,
`PRINT_JS`, `WATCH_BANNER_JS`, `PULSE_PRINT_CSS`, `WATCH_BANNER_CSS`,
`DOCUMENT_PAGE_CSS`, `READER_EARLY_JS`); **8 interpolated, 16,488 lines**;
**6 markup literals, 44 lines**.

Corrections to the figures the task started from:

- `SPEAKER_JS` is **static on the Node side**. Its two `${` are escaped
  (`\${`), browser templates that ship as written; it has 16 resolved
  escapes, so its file is not its source text.
- `AUDIENCE_JS`’s “14” is 5 substitutions plus 9 escaped `\${`.
- `AUDIENCE_CSS` has 15 substitutions, `PRINT_CSS` 21 (line 11827 carries
  two).

What the substitutions are, for the schemes still to be designed:

- `PRINT_READER_JS`, `PRINT_HIGHLIGHTS_JS`: one number each,
  `READER_WIDE_PX - 0.02` / `READER_NOTES_PX - 0.02`, inside a
  `matchMedia` string.
- `PRINT_VIEW_JS`: the two `PRINT_PREF_KEYS` strings.
- `DIAGRAM_CSS`: two `DG_SOFT_GROUND` opacities and one generated block,
  `dgBarFillCss()`.
- `DIAGRAM_JS`: one `JSON.stringify` of a table and **four function sources**
  from `diagram-core.mjs` (`dgShapeD`, `dgPathD`, `dgSplineD`,
  `dgFullFrames` – `.toString()`).
- `AUDIENCE_JS`: five `JSON.stringify` of build-side tables
  (`AUTO_FIT_CYCLE`, `SLIDE_NUM_DEFAULT`, `SLIDE_NUM_MODES`, `THEME_NAMES`,
  `DARK_THEME_NAMES`).
- `AUDIENCE_CSS`: three `FONT_STACK_TAILS` values, six
  `inlineCodeSel(…)` selector lists (in selector position), four
  `displayLh(…)` values, `boldLookCss(…)` and the `FIGURE_TYPE_STEPS` rule
  block.
- `PRINT_CSS`: `tokenDecls(PRINT_LIGHT_TOKENS)`, `boldLookCss(…)`, four
  `inlineCodeSel(…)` selectors, three `displayLh(…)`, ten
  `READER_NOTES_PX` / `READER_WIDE_PX` media-query widths and two
  `printDarkCss(…)` blocks.

## Where the files live: `runtime/`

One folder, `runtime/`, beside `build.js`, named after the literal it
replaces: `SPEAKER_CSS` → `runtime/speaker.css`, `SOUFFLEUSE_JS` →
`runtime/souffleuse.js`, `PRINT_HIGHLIGHTS_JS` →
`runtime/print-highlights.js`.

- **Not the repository root.** Twenty files beside `build.js`, `lint.js` and
  the seven zero-dep modules would bury them, and some names collide in
  meaning: `souffleuse.js` (browser runtime, spliced into a script element)
  next to `souffleuse.mjs` (Node module, imported) is a mistake waiting to
  happen. A folder says “text the build splices into a page, not a module
  anything imports”.
- **Not under `desktop/` or `docs/`**: it is engine, it ships in the release
  tarball (`git archive`; nothing in `.gitattributes` excludes it) and in the
  desktop app's staged engine.
- `editor.css` stays where it is: it is the precedent, and moving it touches
  the desktop list, two gates and a skill for no gain to this plan (open
  question 9).

## Extraction rules

1. **One literal per commit**, and nothing else in that commit: no
   reformatting, no renaming of anything in `build.js`, no unrelated edits.
   Documentation that the move makes wrong (a gate's header, `test/README.md`,
   `CONTRIBUTING.md`) is part of the commit.
2. **Follow `editor.css`.** A path constant
   `const NAME_PATH = new URL('./runtime/<file>', import.meta.url);`, spelled
   literally – `desktop/test/stage-engine.test.mjs` finds run-time reads by
   that exact shape – and a memoised getter,
   `let nameCache = null; const nameCss = () => (nameCache ??= fs.readFileSync(NAME_PATH, 'utf8'));`.
   The getter returns the source text; the render site hands it through
   `shipCss` / `shipJs` exactly where the literal was (`shipCss(speakerCss())`),
   so the strip, its memo and `PSI_KEEP_COMMENTS=1` behave as before. A literal
   that shipped raw (`WATCH_BANNER_*`, `READER_EARLY_JS`) stays raw. The path
   and getter stand where the literal stood, under its section banner, so
   `grep -n '^// ── ' build.js` still maps the file. A literal with
   substitutions adds a `NAME_FILL` table there and its getter reads through
   `fillRuntime` (*Substitution scheme*).
3. **The file is written from the literal's evaluated value, never copied
   from the source text.** A template literal resolves escapes (`\\s` →
   `\s`, `\`` → a backtick, `\${` → `${`). A script evaluates the old
   declaration, writes the value, reads the file back and asserts equality
   with the old value before the literal is deleted. The file keeps the
   value's leading and trailing newline.
4. **A stylesheet stays under `assertStylesheetsWellFormed()`**: its entry in
   the `sheets` map becomes `'runtime/<file>': getter()`, so the error names
   the file.
5. **The desktop app stages the file.** Add it to `FILES` in
   `desktop/scripts/stage-engine.mjs` (which now creates sub-folders) and
   raise the run-time read count in `desktop/test/stage-engine.test.mjs`.
   `.github/workflows/desktop.yml` filters on `runtime/**` (added with the
   pilot), and the test accepts a `folder/**` entry, so a new runtime file
   needs no third list entry.
6. **Gates that named the literal keep their assertion, moved to the file.**
   `strip`: the literal leaves `LITERALS` and joins the runtime list, which
   asserts the getter reaches a view only through `ship*` and holds the
   file's strip (idempotent, no comment left) as `editor.css`'s is.
   `id-namespace`: its `CSS_SOURCES` entry becomes `['runtime/<file>', null]`
   (read whole); a script joins its `FILES`, the emitter scan, because the
   ids a script writes are what the stylesheets' selectors are checked
   against (found with `PRINT_JS`). `inlined` scans the literals that remain and needs nothing.
   Before each move, `grep -rn NAME` over `test/`, `tools/`, `docs/`,
   `desktop/`, `.github/` and the skills for anything else that reads it.
7. **Comments inside other literals that name the moved one stay as they
   are**: they ship under `PSI_KEEP_COMMENTS=1`, so editing them breaks that
   half of byte identity (open question 4). Node-side comments in `build.js`
   may be updated.

## Substitution scheme

Designed on `PRINT_VIEW_JS`, and tried before it was decided on all eight
literals that have substitutions: `--extract` wrote each one with
placeholders and filled it back to the literal's value character for
character – `PRINT_CSS`'s 21 and `AUDIENCE_CSS`'s 15 included, the selector
lists and the generated blocks among them (the trial files were not kept).

**The placeholder is `__PSI_NAME__`.** `NAME` is a capital followed by
capitals, digits and single underscores (`[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*`),
and straight after the closing `__` there may be no capital, digit or
underscore. Why this shape:

- **It is an identifier in both languages, so the file stays valid where the
  substitution stood.** In JavaScript it sits in a string
  (`'__PSI_PRINT_PREF_KEYS_SCHEME__'`) and in expression position
  (`const THEME_CYCLE = __PSI_THEME_NAMES__;`, where a JSON value will go),
  and the file still compiles as a script – the `strip` gate's check on the
  raw file keeps working. In CSS it is an ident: a value
  (`line-height: __PSI_X__;`), a custom property, a media feature
  (`(min-width: __PSI_READER_NOTES_PX__px)` is one ident token, a
  syntactically valid query), and **a selector** – `__PSI_X__ { … }` is a
  type selector, which answers the case the plan expected to need a second
  scheme.
- **Not `${…}`**: a real browser template in a JS file (`SPEAKER_JS` had two,
  `AUDIENCE_JS` has nine), and it would make each file a template again.
- **Not a comment as the default form.** Filling happens before the strip
  (below), so a comment-shaped placeholder would work while every one is
  found; but one the filler's pattern misses – a typo in its delimiters – is
  then an ordinary comment, which the strip removes without a trace: the
  value missing from every plain build, and junk in a `PSI_KEEP_COMMENTS=1`
  one. An identifier that is not a well-formed placeholder still contains
  `__PSI_`, which the strict check refuses. And a comment is valid neither
  in a JS expression nor as a CSS selector.
- **Not `{{NAME}}`, `%NAME%` or `@@NAME@@`**: none is valid in a JS
  expression or a CSS selector, and `{{` is legal JavaScript.
- `__PSI_` occurred nowhere in the repository before this scheme.
- **The end is never a guess.** `${READER_NOTES_PX}px` becomes
  `__PSI_READER_NOTES_PX__px`, unambiguous because `px` is lower case;
  `__PSI_A__B` could be `A` followed by `B` or a malformed name, and is
  refused.

**The comment form, `/*__PSI_NAME__*/`**, is for a substitution that
generates a whole block of rules or declarations – `boldLookCss(…)`,
`printDarkCss(…)`, `tokenDecls(…)`, the `FIGURE_TYPE_STEPS` rules,
`dgBarFillCss()`. A bare identifier among rules is read as the start of the
next rule's selector, so there only a comment keeps the file valid CSS; the
whole comment is replaced. It is the same token inside comment delimiters,
so the filler finds it by the same pattern, and a malformed one is still a
`__PSI_` the strict check refuses – the vanishing comment above cannot
happen. Use it only where the bare form is invalid – or, in a script, where
the substitution is a declaration rather than a value (`DIAGRAM_JS`'s four
function sources; the reasons are in its *Log* entry).

**Filled in the getter, before `ship*`, once per process.** The getter reads
the file, fills it and memoises the filled text, and the render site is the
one a static file has:

```js
const PRINT_VIEW_JS_PATH = new URL('./runtime/print-view.js', import.meta.url);
const PRINT_VIEW_JS_FILL = {
  PRINT_PREF_KEYS_SCHEME: PRINT_PREF_KEYS.scheme,
  PRINT_PREF_KEYS_FACE: PRINT_PREF_KEYS.face,
};
let printViewJsCache = null;
const printViewJs = () => (printViewJsCache ??=
  fillRuntime(PRINT_VIEW_JS_PATH, fs.readFileSync(PRINT_VIEW_JS_PATH, 'utf8'), PRINT_VIEW_JS_FILL));
// … and at the render site, as for a static file:
shipJs(printViewJs())
```

So `shipJs` / `shipCss`, their memo and `PSI_KEEP_COMMENTS=1` see the string
the literal evaluated to, and a placeholder may stand anywhere, inside a
comment too.

**The values are a table beside the path constant**, `NAME_FILL`, one key per
line, standing where the literal stood. Rejected: a getter that takes the
values at the render site. The literals were constants – evaluated once,
where they were declared, the same for every view and every build of a
`--watch` run. A table in the same place evaluates the same expressions at
the same point of module load (a name declared further down was as
unreachable to the literal), the getter keeps the static getters' shape (no
argument, a memo keyed by nothing), the `strip` gate's ship check reads
`shipJs(getter())` as before, and the gate can hold the table's keys against
the file's placeholders as text. Values passed per call would need a memo
keyed by them and would be a new behaviour, not a move; none of the eight
needs it.

**A value is a string or a finite number, rendered with `String()`** – the
ToString a template literal applied, so `READER_WIDE_PX - 0.02` comes out
`1215.98` as it did. A string goes in as it is, with no quoting: the file
keeps the quotes the literal had around the substitution
(`'__PSI_PRINT_PREF_KEYS_SCHEME__'`), and a value that holds `$&` goes in as
written (the replacement is a function, not a pattern). Anything else – an
array, an object, a boolean, `undefined`, `NaN` – is refused rather than
coerced: every substitution in the eight already yields a string or a number
(the tables go through `JSON.stringify`, the functions through
`.toString()`), and a table that hands over an array where it meant JSON
would otherwise ship `a,b`. The conversion is written in the table, where the
literal wrote it.

**Strict.** `fillRuntime(where, text, values)` in build.js (beside `shipJs`)
throws a plain `Error` – a defect in the build, so it keeps its stack, never
`userFacing` – naming `runtime/<file>` and the placeholder, when a
placeholder has no value (own properties only), a value has no placeholder, a
value is of another type, or any `__PSI_` in the file is not a well-formed
placeholder. A name may stand more than once and every occurrence gets the
same value (`PRINT_CSS` uses `READER_NOTES_PX` four times). It throws
on the first build that renders the view, in the renderer, as a missing file
does (open question 11); and before any build, the `strip` gate holds each
file's placeholders against its table, so a file read only under a flag is
held too.

**Gates.** `strip` lifts `fillRuntime` out of build.js as text and runs it on
fixtures – both forms, `String()` of a number, a name used twice, `$&` as
written, a text with no placeholder left alone, and each refusal; and, per
runtime file, that a file holding a placeholder is read through
`fillRuntime` with a table whose keys are exactly its placeholder names, and
that a file read without it holds no `__PSI_`. Every other gate that reads a
runtime file reads it raw, placeholders and all. That is harmless for a
placeholder in a string or a value; for one in selector position,
`id-namespace`'s selector scan does not see what the generated list names –
`inlineCodeSel` names classes and attributes today, no `#id`, but the gate
needs a look when `PRINT_CSS` and `AUDIENCE_CSS` move.

**The tool.** `node tools/runtime-literals.mjs --extract NAME FILE [--names
A,B,…]` writes the cooked text with a placeholder where each substitution
stood; the names are given in the order the substitutions stand, or derived
from each expression's text (`PRINT_PREF_KEYS.scheme` →
`PRINT_PREF_KEYS_SCHEME`), and a name written inside comment delimiters
(`'/*BAR_FILL_RULES*/'`) gets the comment form. A name used twice must name
the same expression text. The check is the round trip the build makes: the
literal is evaluated for real, with every name its expressions reach resolved
to its top-level declaration in build.js (a `const`, a `function`, or an
import from `node:` or one of the zero-dep modules beside it), each
substitution is evaluated the same way, the file is filled with build.js's
own `fillRuntime`, lifted as text, and the result must equal the literal's
value. It prints the `NAME_FILL` table to paste where the literal stood. A
substitution that needs a package (marked, Shiki) cannot be evaluated by the
tool, and then the build's byte identity is the only check; none of the
eight needs one.

**What the later literals need from it** – nothing the scheme does not have:

- `PRINT_READER_JS`, `PRINT_HIGHLIGHTS_JS`: one number each, in a string.
  Names that say what the value is rather than how it is computed, e.g.
  `READER_WIDE_BELOW` / `READER_NOTES_BELOW` (the width just under the
  breakpoint) rather than the derived `READER_WIDE_PX_0_02`; `PRINT_CSS`
  should use the same names for the same expressions. `PRINT_HIGHLIGHTS_JS`'s
  file is its value, not its source text (34 backslashes), which the tool
  already writes.
- `DIAGRAM_CSS`: two `toFixed(4)` strings, bare, and
  `/*__PSI_BAR_FILL_RULES__*/` (tried: exact).
- `DIAGRAM_JS`: one JSON table in expression position, bare, and four
  function sources in statement position – the comment form, unless open
  question 5's alternative (the runtime reads them from `window.PSI_DG`)
  is chosen, which changes the output and is a decision of its own.
- `PRINT_CSS`: four selector lists bare; `tokenDecls`, `boldLookCss` and the
  two `printDarkCss` blocks in the comment form (the latter stand straight
  after an `@media … {` on the same line, and `{/*__PSI_…__*/` gives the same
  bytes); ten widths and three line heights bare.
- `AUDIENCE_CSS`: three font stacks and four line heights bare, six selector
  lists bare, `boldLookCss` and the `FIGURE_TYPE_STEPS` rules in the comment
  form.
- `AUDIENCE_JS`: five JSON values in expression position, bare. Its nine
  `\${` become plain `${` in the file, which the filler never touches.

## Order

Static first, so the method is proved on literals whose value is fixed, then
the ones with one or two substitutions, the three big ones last. Each with
the tracked views or a fixture that covers it.

| # | literal | why here | byte identity checked by |
|---|---|---|---|
| 1 | `SPEAKER_CSS` | static, no escapes, every cockpit – **the pilot** | `tut`, `dia` speaker views |
| 2 | `PRINT_JS` | static, no escapes, every document | tracked print views |
| 3 | `PULSE_PRINT_CSS` | static, small | `tut` print views |
| 4 | `SPEAKER_JS` | static, but the first with escapes (16) and browser `${` – proves rule 3 on a big script | `tut`, `dia` speaker views |
| 5 | `SOUFFLEUSE_CSS` | static, 2 escapes, `--prompter` only | a `--watch --prompter --prompter-dry-run` build before/after, per-run values normalised (nonce, listen key, run id, port) |
| 6 | `SOUFFLEUSE_JS` | static, 39 escapes, `--prompter` only | same fixture as 5 |
| 7 | `WATCH_BANNER_CSS`, `WATCH_BANNER_JS` | static, shipped raw, `--watch` only | a `--watch` build before/after, normalised |
| 8 | `PRINT_READER_JS`, `PRINT_VIEW_JS`, `PRINT_HIGHLIGHTS_JS` | one or two constants each – the first substitution scheme, designed on these | tracked print views |
| 9 | `DIAGRAM_CSS` | two numbers and one generated block | all tracked views |
| 10 | `DIAGRAM_JS` | four function sources from `diagram-core.mjs` – its own scheme | tracked live views |
| 11 | `PRINT_CSS` | 21 substitutions, scheme designed when reached | tracked print views |
| 12 | `AUDIENCE_CSS` | 15, six in selector position | tracked live views |
| 13 | `AUDIENCE_JS` | 5 tables, 9 browser templates, 66 escapes, 6,042 lines | tracked live views |

Not on the list unless decided otherwise: `DOCUMENT_PAGE_CSS` (3 lines),
`READER_EARLY_JS` (2) and the six `*_HTML` markup literals (44 lines) –
open questions 6 and 7.

**The substitution scheme is one for all eight, decided on `PRINT_VIEW_JS`**
(see *Substitution scheme* above). The requirements it was written against:
the substitution happens on the file's text *before* `ship*` (so a
placeholder may live in a comment, and the strip memo still sees one stable
string per process); every slot is filled and an unknown slot is a build
error; the file stays valid for its own tooling, a CSS selector-position slot
included; and the output is byte-identical.

## Checklist per literal

1. Re-run the inventory with the parser; record span, `${}`, escapes and
   coverage for this literal. Do not trust this table's line numbers once a
   literal above has moved.
2. Copy the old `build.js` aside. Generate `runtime/<file>` from the evaluated
   value; read back; assert equal. With substitutions, `--extract … --names`
   writes the placeholders, checks the round trip and prints the
   `NAME_FILL` table.
3. Baselines **before** editing: `npm run build:tracked` leaves
   `git diff -- lectures/` empty; build one untracked lecture
   (`lectures/python-intro/source.md --no-optimize-images`) and keep its four
   views; the same with `PSI_KEEP_COMMENTS=1`; for an uncovered literal, the
   fixture build from *Order*.
4. Replace the literal (rule 2), update the render site and, for CSS, the
   `sheets` map.
5. Gates (rule 6), `FILES` and the read count (rule 5); docs the move makes
   wrong.
6. Verify:
   - `node test/gates/run.mjs` green, and the assertion count moved by what
     the gate edits explain;
   - `node lint.js lectures/` clean;
   - `npm run build:tracked` then `git diff --quiet -- lectures/`;
   - the untracked lecture's four views `cmp`-equal to the baseline, plain
     and with `PSI_KEEP_COMMENTS=1` (grep a comment from the moved file in
     the kept build, to see that the file is what ships);
   - the fixture build for an uncovered literal, normalised, equal;
   - `node test/settings.mjs`, `node test/reproducible.mjs`,
     `node test/containers.mjs`, `node test/cli.mjs`;
   - `node --test desktop/test/stage-engine.test.mjs` (no install needed),
     and once with the file taken off `FILES`, to see it fail;
   - a staged-engine build: copy `FILES` into a scratch folder, link
     `node_modules`, build the untracked lecture with that `build.js`,
     `cmp` against the baseline;
   - `node docs/artifact/refresh-figures.mjs --check`;
   - for a print literal, `node test/pdf-export.mjs`; for any literal, the
     browser suite – both only when no other session is driving Chromium on
     the machine. Byte-identical views make them a formality, not the proof.
7. Commit: `<NAME> moves to runtime/<file>`; the body says how identity was
   checked.

## Open questions

1. **Scripts are fragments, not modules.** `AUDIENCE_JS`, `SPEAKER_JS` and
   `SOUFFLEUSE_JS` run in one `<script>` and share its lexical scope; the
   root `package.json` says `"type": "module"`, so an editor and Node read a
   `runtime/*.js` as ESM. A linter will need `sourceType: script` and a
   globals list for that folder. `.js` plus a linter override, decided with
   `SPEAKER_JS`. **Decided: `.js`**; the override waits for a JS linter in
   the repository, which there is none of yet (see *Log*).
2. **The leading newline.** Each file keeps its literal's first `\n`, so the
   CSS and JS files open with an empty line. Removing it means either
   `'\n' + getter()` at the render site or an output change; neither is worth
   it now.
3. **No file headers yet.** A header comment (what the file is, `/* global
   … */`) ships under `PSI_KEEP_COMMENTS=1` and breaks that half of byte
   identity. Either a deliberate, separate commit that changes only the
   kept-comments output, or the documentation stays beside the path constant
   in `build.js`.
4. **Old names in shipped comments.** `AUDIENCE_CSS` (line 16371 at
   `a49b625`) and `SOUFFLEUSE_CSS` (30121, 30370) mention `SPEAKER_CSS`. Left
   as they are, for the reason in 3; one sweep at the end, as a kept-comments
   output change.
5. **The substitution schemes.** **Decided: one scheme for all eight** –
   `__PSI_NAME__`, or `/*__PSI_NAME__*/` for a generated block, filled by
   `fillRuntime` from a `NAME_FILL` table before `ship*`, strictly (see
   *Substitution scheme*). Selector position needed nothing of its own: the
   placeholder is a type selector. **`DIAGRAM_JS`'s four function sources:
   decided, by placeholder** (the maintainer's variant (a), output
   byte-identical; see *Log*). Reading them from `window.PSI_DG` instead of
   splicing them twice would change the output and the load order, and a
   view under `editor: none` ships no `window.PSI_DG` at all; if it is ever
   wanted, it is a step of its own, not part of a move.
6. **The six markup literals** – out of scope? They are HTML, not CSS or JS,
   44 lines in all, and gain little from a file.
7. **The two tiny literals** (`DOCUMENT_PAGE_CSS`, `READER_EARLY_JS`) –
   leave them in `build.js`?
8. **`--watch` does not re-read `runtime/`.** Files are memoised per
   process, as `editor.css` is; editing one during a watch needs a restart,
   which is what editing the literal in `build.js` needed. Proposed: leave
   it.
9. **`editor.css` into `runtime/`?** A separate decision, not this plan's.
10. **CLAUDE.md** needs a paragraph on `runtime/` under *Single-file build
    pipeline* and “six files” → “seven” in *Desktop app*. Left to the
    maintainer: an agent does not edit it.
11. **A missing runtime file** fails the first build that renders that view
    with an `ENOENT` stack from a renderer, as a missing `editor.css` does.
    Once there are several, one pre-flight that checks them all and names
    the file may be worth it.
12. **Coverage.** `build.js`'s overall line figure falls as literals leave
    (they read 100 %); the figure outside the literals
    (`tools/coverage-logic.mjs`, 81.4 % at the review) is the one to watch,
    and it counts the remaining literals by parser, so it needs no edit.
13. **A shared reader.** After a few moves, a `runtimeText(url)` memo may
    replace the per-file getters – but each path must stay a literal
    `new URL('./runtime/…', import.meta.url)`, or the stage-engine test
    stops seeing it.

## Log

- **`SPEAKER_CSS` → `runtime/speaker.css`** – done. 44,853 bytes, the
  literal's value exactly (no escapes, so it is also the source text).
  `build.js` lost 1,136 lines and gained 9: `SPEAKER_CSS_PATH`,
  `speakerCss()`, a comment; the render site is `shipCss(speakerCss())`, the
  `sheets` entry `'runtime/speaker.css'`. Gates: `strip` (the literal's
  ship check moved to the file, plus the file's two strip checks – 2,140 →
  2,142 assertions), `id-namespace` (reads the file whole; still 564 `#id`
  selectors in 8 stylesheets). Desktop: `FILES` gained the file and
  sub-folder creation, the read count went 6 → 7, `desktop.yml` filters on
  `runtime/**`, and the test accepts a `folder/**` entry; with the file off
  `FILES` the test fails by name. Identity: tracked views unchanged;
  python-intro's four views `cmp`-equal plain and under
  `PSI_KEEP_COMMENTS=1` (whose `speaker.html` carries the file's comments);
  the same lecture built by a staged copy of the engine, equal. Not run: the
  browser suite and `test/pdf-export.mjs`.
- **Tooling** – `tools/runtime-literals.mjs` restores the inventory and extraction scripts the pilot used and deleted; its output matches the table above (with `SPEAKER_CSS` gone). CLAUDE.md describes `runtime/` and the seven run-time reads.
- **`PRINT_JS` → `runtime/print.js`** – done. 5,857 bytes, 147 lines,
  written by `--extract` (value equals source). Named after the literal like
  `speaker.css`, not after what it does (the lightbox): the rule is the
  literal's name, and the comment above the path constant says what it is.
  `build.js` lost 153 lines and gained 13: `PRINT_JS_PATH`, `printJs()`, a
  comment replacing the one that said the literal held no backticks or
  regexes; the render site is `shipJs(printJs())`; two Node-side comments
  that named `PRINT_JS` now name the file. Gates: `strip` – a `RUNTIME`
  table of `[file, getter]` now drives both runtime checks; the ship check
  moved from `LITERALS` to it, and a script in it is held by three new
  checks (a second strip changes nothing, the strip took something, file
  and stripped text compile as a script): 2,142 → 2,146 assertions.
  **`id-namespace` needed more than the plan said**: the lightbox *emits* an
  id (`box.id = 'psiINT-lightbox'`), and the gate's emitter scan read it as
  part of build.js, so with the literal gone `PRINT_CSS`'s
  `#psiINT-lightbox` selectors named an id nothing emitted. The file joins
  the gate's `FILES` (the emitter scan), not only `CSS_SOURCES`; 123
  emitted ids and 564 selectors, as before. Any later script literal that
  writes or looks up an id goes the same way. Desktop: `FILES` gained the
  file, the read count went 7 → 8; with the file off `FILES` the test fails
  by name. Identity: tracked views unchanged; python-intro's four views
  `cmp`-equal plain and under `PSI_KEEP_COMMENTS=1` (whose two documents
  carry the file's comments), and when built by a staged copy of the engine.
  Not run: the browser suite and `test/pdf-export.mjs`.
- **`PULSE_PRINT_CSS` → `runtime/pulse-print.css`** – done. 724 bytes, 22
  lines, written by `--extract` (value equals source; the sheet has no
  comment, so the kept-comments build cannot show it, only that it ships).
  `build.js` lost 25 lines and gained 11: `PULSE_PRINT_CSS_PATH`,
  `pulsePrintCss()`, a comment; the render site is
  `shipCss(pulsePrintCss())` behind the same `hasPulse` test, the `sheets`
  entry `'runtime/pulse-print.css'` – so the file is read by every build's
  stylesheet check, with or without a question in the deck, as
  `speaker.css` is. Gates: `strip` (the file joins `RUNTIME`; its ship check
  and its two stylesheet strip checks – 2,146 → 2,148 assertions),
  `id-namespace` (reads the file whole; still 564 selectors in 8
  stylesheets, 123 emitted ids). Desktop: `FILES` gained the file, the read
  count went 8 → 9; with the file off `FILES` the test fails by name.
  Identity: tracked views unchanged, and `lectures/tutorial` is the tracked
  deck with a `::: pulse`, so its two documents carry the sheet; the same
  deck built by the old and the new `build.js` into scratch folders, all
  four views `cmp`-equal plain and under `PSI_KEEP_COMMENTS=1`;
  python-intro's four views equal plain, kept and by a staged engine. Not
  run: the browser suite and `test/pdf-export.mjs`.
- **`SPEAKER_JS` → `runtime/speaker.js`** – done. 76,245 bytes, 1,605
  lines, written by `--extract` from the value, which differs from the
  source: the sixteen backslashes are two `\${` browser templates and the
  four escaped backticks of their two template literals, `\\/` and `\\s` in
  two regexes, and six
  `\u…` escapes in strings, which the literal resolved to the characters
  themselves (`·`, `–`, `−`, `±`) – so the file carries them as UTF-8 where
  build.js spelled them as escapes, inside JS strings, with the same meaning
  and the same bytes in the view. **`.js`, as open question 1 proposed**: no
  JS linter is configured in the repository, so there is no override to
  write yet; when one is, `runtime/*.js` needs `sourceType: script` and the
  `AUDIENCE_JS` globals, because the file is a fragment of one script element
  (the strip gate compiles it with `vm.Script`, never as a module).
  `build.js` lost 1,620 lines and gained 25: `SPEAKER_JS_PATH`,
  `speakerJs()`, a comment that says why the file is the value and that
  `SOUFFLEUSE_JS` follows it in the same element; the render site is
  `${shipJs(speakerJs())}${shipJs(souffleuseRuntime)}`, the concatenation
  unchanged; three Node-side comments (in `renderSpeaker` and above
  `SOUFFLEUSE_CSS`) now name the file. The comments inside `AUDIENCE_JS` and
  `SOUFFLEUSE_JS` that name `SPEAKER_JS` stay (rule 7). Gates: `strip` (the
  file joins `RUNTIME`; its ship check and the three script checks – 2,148
  → 2,152), `id-namespace` (the file joins `FILES`, the emitter scan; 123
  emitted ids, 16 allow-list entries and 25 allowed sites, as before),
  **`commands`** (its `S` was `literal(buildJs, 'SPEAKER_JS')`, the source
  text; it now reads the file, the value – the run-function ids and the
  `e.key` comparisons it extracts carry no escape, and the gate's output is
  line for line what it was). Every other reader of build.js as text was
  checked for a pattern the cockpit's runtime could satisfy; none.
  Desktop: `FILES` gained the file, the read count went 9 → 10; with the
  file off `FILES` the test fails by name. Docs: the prompter skill's
  locations, `test/README.md` (`commands`, `id-namespace`), and a comment
  each in `docs/site/shoot-prompter.mjs` and `souffleuse.mjs`. Identity:
  tracked views unchanged; python-intro's four views `cmp`-equal plain,
  under `PSI_KEEP_COMMENTS=1` (whose `speaker.html` carries the file's
  comments) and by a staged engine; and a `--watch --prompter
  --prompter-dry-run` build of python-intro, run by the old and the new
  `build.js` for 20 seconds each under `perl -e 'alarm 20'`, gives four
  views equal once the run id, the socket port and the nonce are put back
  to placeholders – the cockpit there is `runtime/speaker.js` followed by
  `SOUFFLEUSE_JS` in one script element. Not run: the browser suite and
  `test/pdf-export.mjs`.
- **`SOUFFLEUSE_CSS` → `runtime/souffleuse.css`** – done. 10,330 bytes,
  253 lines, written by `--extract` from the value, which differs from the
  source in one place: `content: '\\25cc'` in build.js is the CSS escape
  `'\25cc'` in the file. **The getter is `souffleuseSheet()`, not
  `souffleuseCss()`**: `renderSpeaker` already has a local `souffleuseCss`
  (the text it splices, or `''`), and that local stays – the render site is
  `const souffleuseCss = souffSettings ? souffleuseSheet() : ''` followed by
  the unchanged `shipCss(souffleuseCss)`, so a cockpit without the flag reads
  nothing for its page. **The stylesheet check reads the file on every
  build** (`'runtime/souffleuse.css': souffleuseSheet()` in `sheets`): it is a
  build-time check, not a page, it checked the literal on every build, and
  narrowing it to `--prompter` builds would leave a broken sheet to the one
  browser spec that builds with the flag. `build.js` lost 269 lines and
  gained 29: `SOUFFLEUSE_CSS_PATH`, `souffleuseSheet()`, a comment, and three
  Node-side comments (`renderSpeaker`'s and the section's) that said “two
  literals”. Gates: `strip` – the file joins `RUNTIME` with a third name,
  the local it is held in; for such an entry the ship check asks that the
  getter is read into that local once, under `souffSettings`, and that the
  local reaches the view only through `ship*` (the literal had no ship check
  at all, because of that indirection) – plus the file's two stylesheet strip
  checks: 2,152 → 2,155 assertions. `id-namespace`: its `CSS_SOURCES` entry
  is `['runtime/souffleuse.css', null]`; still 564 selectors in 8
  stylesheets. **Desktop: the file is staged** (decision below), the read
  count went 10 → 11; with the file off `FILES` the test fails by name.
  Docs: `test/README.md` (`id-namespace`, `strip`), the prompter skill's
  locations and four sentences naming the literal, one in `speaker.md`.
  Identity: tracked views unchanged; a `--watch --prompter
  --prompter-dry-run --no-optimize-images` build of a copy of python-intro
  in `$TMPDIR/<run>/L/python-intro` (the same parent folder name for both),
  by `build.js` at `de63bde` and by the new one, 20 seconds each under
  `perl -e 'alarm 20'`: four views equal once run id, socket port, nonce
  and listen key are placeholders, plain and under `PSI_KEEP_COMMENTS=1`
  (whose cockpit carries the file's first comment). Not run: the browser
  suite and `test/pdf-export.mjs`.

  **The desktop decision.** Stage the prompter's files – the sheet now, the
  script when `SOUFFLEUSE_JS` moves – rather than teach
  `desktop/test/stage-engine.test.mjs` an exception. The test's rule stays
  one sentence (every `new URL('./…', import.meta.url)` read is staged), the
  stylesheet check reads the sheet on every build, so an unstaged sheet would
  fail every build in the app, and an app that ever passed `--prompter`
  would not meet `ENOENT` in a renderer. What CLAUDE.md promises stays true
  in substance – the app never passes the flag, has no network entitlement,
  and `souffleuse.mjs`, without which no prompter runs, is still not staged
  – but its sentence “`desktop/scripts/stage-engine.mjs`'s file list is
  unchanged” is no longer literally so: the list carries the inert text
  files of the cockpit's half.
- **`SOUFFLEUSE_JS` → `runtime/souffleuse.js`** – done. 57,550 bytes,
  1,146 lines, written by `--extract` from the value: the 39 backslashes are
  `\\uXXXX` escapes in strings (glyphs, dashes, middle dots) that the literal
  turned into `\uXXXX`, one `\\s` in a regex, and three single `\u` escapes
  that it resolved to the characters themselves (`–`, `…`, `·`) – the file
  carries those as UTF-8, with the same meaning and the same bytes in the
  view. The getter is `souffleuseScript()`: `souffleuseJs` is
  `renderSpeaker`'s local for the `SOUFFLEUSE` settings and
  `souffleuseRuntime` its local for the spliced text, which stays as
  `souffSettings ? souffleuseScript() : ''`. **A build without
  `--prompter` never reads the file** – checked by building python-intro's
  cockpit with the file moved away. `build.js` lost 1,164 lines and gained
  31: `SOUFFLEUSE_JS_PATH`, `souffleuseScript()`, a comment;
  four Node-side comments name the file now, and the section comment's
  paragraph on template-literal rules (with its stale “the other twelve”)
  became a sentence saying the two files no longer carry them. The comment
  inside `AUDIENCE_JS` that names `SOUFFLEUSE_JS` stays (rule 7). Gates:
  `strip` (the file joins `RUNTIME` with its local, `souffleuseRuntime`;
  the flagged ship check and the four script checks – 2,155 → 2,160),
  `id-namespace` (the file joins `FILES`, the emitter scan; its
  `psiINT-souffleuse-*` ids are found there, and the counts are as before),
  `commands` (`P` reads the file, the value, as `S` does; the gate's
  output is line for line what it was). Desktop: `FILES` gained the file,
  the read count went 11 → 12; with the file off `FILES` the test fails by
  name. Docs: the prompter skill (locations, four sentences, and the
  `OPENROUTER` rule now names this file too), `test/README.md`
  (`commands`, `id-namespace`), three sentences in `speaker.md` and a
  comment in `test/souffleuse.mjs`. Identity: tracked views unchanged; the
  same `--watch --prompter --prompter-dry-run` fixture as for
  `SOUFFLEUSE_CSS`, against `de63bde`: four views equal after
  normalisation, plain and under `PSI_KEEP_COMMENTS=1` (whose cockpit
  carries the file's head comment). Neither cockpit nor the file contains
  `OPENROUTER`. Not run: the browser suite and `test/pdf-export.mjs`.
- **`WATCH_BANNER_CSS` → `runtime/watch-banner.css`** – done. 737 bytes,
  15 lines. **The one literal whose value is not a stylesheet**: it was
  `<style>` + the rules + `</style>`, and a `.css` file that opens with a
  tag is not CSS to any tool, which would defeat the move. So the file is
  the value between the two tags – written by `--extract` to a scratch file
  and cut there by a script that asserted the value's shape and that
  `'<style>' + file + '</style>'` equals the value – and `reloadScript`
  writes the tags: its two sites are now
  `<style>${watchBannerCss()}</style><script>` where they were
  `${WATCH_BANNER_CSS}<script>`. **It ships raw**, as the literal did: no
  `shipCss`, only in a watch build, in all four views (the documents'
  receive-only reload script carries it too). Not added to the stylesheet
  check's `sheets`, where the literal never was; it would be a new check,
  and the sheet has no comment to unbalance. `build.js` lost 18 lines and
  gained 14: `WATCH_BANNER_CSS_PATH`, `watchBannerCss()`, a paragraph
  appended to the banner's comment, the two sites. Gates: `strip` – a
  `RUNTIME_RAW` table, `[file, getter]`, for the files that ship raw; its
  check holds every call of the getter to `reloadScript`'s body and none to
  `ship*` (shown to fail on a site wrapped in `shipCss`): 2,160 → 2,161.
  `id-namespace` – **a widening, not a repointing**: the literal was never
  in `CSS_SOURCES`, the file is, so its selectors are now held to the
  emitted ids: 564 → 570 `#id` selectors, 8 → 9 stylesheets, the six new
  ones all `#psiINT-build-failed`, which the banner's script emits (still
  in build.js here, in `runtime/watch-banner.js` next) – 2,161 → 2,162.
  Desktop: `FILES` gained the file, the read count went 12 → 13; with the
  file off `FILES` the test fails by name. Docs: `test/README.md`
  (`id-namespace`, `strip`). Identity: tracked views unchanged; the
  `--watch --prompter --prompter-dry-run` fixture against `de63bde`, which
  is a watch build of all four views: equal after normalisation, plain and
  under `PSI_KEEP_COMMENTS=1`; the banner's rules are in all four views of
  the plain build. Not run: the browser suite and `test/pdf-export.mjs`.
- **`WATCH_BANNER_JS` → `runtime/watch-banner.js`** – done. 2,010 bytes,
  45 lines with no newline at the end (the literal's value ends in `  };`,
  and the file keeps it so), written by `--extract` from the value: `'\\n'`
  in build.js is `'\n'` in the file, and the ellipsis escape the literal
  resolved is the character itself. A fragment of a function body, not a
  module: `reloadScript` splices it at the head of the arrow function its
  reload script runs (`(() => {${watchBannerJs()}${watchRunJs(opts.run)}` at
  both sites, where it was `${WATCH_BANNER_JS}`), and the rest of that
  function calls its `bfReload` and `bfShow`. **Raw**, comments and all, as
  the literal was: the plain watch build carries its comment “A watch
  reload: the live views stash where they are first” in all four views.
  `build.js` lost 47 lines and gained 14: `WATCH_BANNER_JS_PATH`,
  `watchBannerJs()`, a comment, the two sites. Gates: `strip` (the file
  joins `RUNTIME_RAW`: 2,162 → 2,163), `id-namespace` (the file joins
  `FILES`: it emits `psiINT-build-failed`, and without it the gate fails on
  the banner sheet's six selectors, which then name an id nothing writes –
  checked; 123 emitted ids, as before). Desktop: `FILES` gained the file,
  the read count went 13 → 14; with the file off `FILES` the test fails by
  name. Docs: `test/README.md` (`id-namespace`, `strip`) and the row in
  `TODO-localisation.md` that pointed at the literal. Identity: tracked
  views unchanged; the `--watch --prompter --prompter-dry-run` fixture
  against `de63bde`, equal after normalisation, plain and under
  `PSI_KEEP_COMMENTS=1`; and, for the four moves together, a plain `--watch`
  build of the same fixture by an archive of `de63bde` unpacked in
  `$TMPDIR`, by this `build.js`, and by a staged engine (`FILES` copied into
  a scratch folder – which has no `souffleuse.mjs`, so no `--prompter`
  there, as in the app): four views equal after normalisation in all three.
  Not run: the browser suite and `test/pdf-export.mjs`.

  **For step 8.** The three print reader scripts are the first literals
  with substitutions, so `--extract` refuses them and the scheme has to be
  designed first (open question 5): `PRINT_READER_JS` and
  `PRINT_HIGHLIGHTS_JS` carry one number each, `READER_WIDE_PX - 0.02` /
  `READER_NOTES_PX - 0.02`, inside a `matchMedia` string, and
  `PRINT_VIEW_JS` the two `PRINT_PREF_KEYS` strings. Whatever the
  placeholder, it is filled on the file's text before `shipJs`, so the
  strip memo still sees one string per process, and
  `tools/runtime-literals.mjs` will need an `--extract` that writes the
  placeholders where the substitutions stood and checks that filling them
  gives the value back. `PRINT_HIGHLIGHTS_JS` has 34 backslashes, so its
  file is not its source text either. All three ship only under
  `reader: on`, in every tracked print view, so the tracked views are the
  identity check – plus a deck with `reader: off`, which must stay without
  them. `PRINT_HIGHLIGHTS_JS` emits `psiINT-rd-help` and looks up
  `psiINT-lightbox` and `psiINT-reader-data`, and `PRINT_READER_JS` looks up
  `psiINT-reader-contents`, so both join `id-namespace`'s `FILES`
  (`PRINT_VIEW_JS` names no id). `strip`'s `LITERALS` lists
  `PRINT_READER_JS` and `PRINT_HIGHLIGHTS_JS` but not `PRINT_VIEW_JS`,
  which is shipped through `shipJs` all the same; the move puts all three in
  `RUNTIME`. The appearance skill names `PRINT_HIGHLIGHTS_JS` and several
  Node-side comments in build.js name all three.
- **The substitution scheme, and the tooling for it** – done, before any
  literal with substitutions moved. `__PSI_NAME__` (or `/*__PSI_NAME__*/`
  for a generated block), filled by `fillRuntime(where, text, values)` from a
  `NAME_FILL` table before `ship*`, strictly; the reasons and the rejected
  alternatives are in *Substitution scheme*. `build.js` gained
  `fillRuntime` beside `shipJs` / `shipCss`, called by nothing yet, so every
  view is as it was (tracked views unchanged). `tools/runtime-literals.mjs
  --extract` now writes a literal with substitutions – placeholders where
  they stood, names from `--names` or derived from the expressions – and
  checks the round trip with the real values and build.js's own
  `fillRuntime`, lifted as text; tried on all eight such literals, each
  filled back to its value exactly, with derived names and, for
  `DIAGRAM_CSS`, with the comment form for `dgBarFillCss()`. Gates: `strip`
  runs `fillRuntime` on fixtures (both forms, a number as `String()` makes
  it, a name used twice, `$&` as written, a text with no placeholder; and
  refused: a placeholder without a value, a value without a placeholder, an
  array, `NaN`, a malformed placeholder, `__PSI_A__B__`, an inherited name),
  and holds every runtime file against its getter – a file with a
  placeholder read through `fillRuntime` with a table whose keys are its
  placeholder names, one without read as it is (eight files, none with a
  placeholder yet): 2,163 → 2,181 assertions. Docs: `test/README.md`
  (`strip`).
- **`PRINT_VIEW_JS` → `runtime/print-view.js`** – done, the first literal
  with substitutions. 1,799 bytes, 40 lines, written by `--extract …
  --names PRINT_PREF_KEYS_SCHEME,PRINT_PREF_KEYS_FACE`, which filled the file
  back to the literal's value before writing it; the value equals the source
  text (no escapes), so the file is the literal's text with the two
  `${PRINT_PREF_KEYS.…}` replaced by `__PSI_PRINT_PREF_KEYS_SCHEME__` and
  `__PSI_PRINT_PREF_KEYS_FACE__`, inside the quotes they stood in. The
  derived names were kept: they say where the value comes from, and
  `PRINT_VIEW_EARLY_JS`, which reads the same keys, still takes them from
  `PRINT_PREF_KEYS` in build.js. `build.js` lost 49 lines and gained 24 –
  the literal's 41 went, and in came `PRINT_VIEW_JS_PATH`, the
  `PRINT_VIEW_JS_FILL` table where the literal
  stood, `printViewJs()` reading through `fillRuntime`, a comment replacing
  the literal's last sentence (“Same template-literal rules as every inlined
  block”); the render site is `${shipJs(printViewJs())}` between the two
  reader literals still in build.js; four Node-side comments that named
  `PRINT_VIEW_JS` (`STRINGS`' reader keys, `codeTag`, `renderReaderView`,
  the dark-documents section) now name the file. Gates: `strip` – the file
  joins `RUNTIME` (it was missing from `LITERALS`, though it always shipped
  through `shipJs`), so it gains the ship check, the four script checks and
  the per-file fill check: 2,181 → 2,187. The per-file check was shown to
  fail on a table key renamed (`…_FACES`) and on a getter that reads the
  file without `fillRuntime`; the build with that renamed key refuses with
  `runtime/print-view.js: placeholder __PSI_PRINT_PREF_KEYS_FACE__ has no
  value`, a stack, exit 1 and no view written. `id-namespace` – the file
  joins `FILES`; it names no id (no `getElementById`, no `.id =`, no `#` in
  a selector string – only `.rd-view` and data attributes), and the counts
  are as before: 123 emitted ids, 570 selectors in 9 stylesheets, 16
  allow-list entries and 25 allowed sites. Desktop: `FILES` gained the file,
  the read count went 14 → 15; with the file off `FILES` the test fails by
  name. Docs: `test/README.md` (`id-namespace`), the appearance skill's
  sentence on the two switches. Identity: `npm run build:tracked` leaves
  `lectures/` unchanged – every tracked `print.html` and `print-notes.html`
  carries the filled file; python-intro's four views and a `reader: off`
  fixture deck's four, built by the build.js before and after into
  `$TMPDIR/<before|after>/<plain|kept>/L/<deck>` (one parent folder name),
  `cmp`-equal plain and under `PSI_KEEP_COMMENTS=1` (whose documents carry
  the file's comment `/* this tab only */` and both filled keys, and the
  `reader: off` documents neither); and a staged engine (`FILES` copied
  into a scratch folder) builds python-intro equal. Not run: the browser
  suite and `test/pdf-export.mjs`.
- **`PRINT_READER_JS` → `runtime/print-reader.js`** – done. 5,227 bytes,
  122 lines, written by `--extract … --names READER_WIDE_BELOW`, which filled
  the file back to the literal's value before writing it; the value equals
  the source text (no escapes). The one substitution, `READER_WIDE_PX - 0.02`
  inside the `matchMedia` string that decides whether the contents lie over
  the page, is `__PSI_READER_WIDE_BELOW__px` in the file: named for what the
  value is – the width just under the breakpoint – not for how it is
  computed. `build.js` lost 133 lines and gained 24: `PRINT_READER_JS_PATH`,
  the `PRINT_READER_JS_FILL` table where the literal stood,
  `printReaderJs()` through `fillRuntime`, a comment replacing the literal's
  “same template-literal rules” sentence; the render site is
  `${shipJs(printReaderJs())}` ahead of `printViewJs()`; two Node-side
  comments that named the literal (the contents sidebar's, and the one over
  `READER_WIDE_PX` / `READER_NOTES_PX`) now name the file. Gates: `strip` –
  the literal leaves `LITERALS` and the file joins `RUNTIME`: its ship check,
  the four script checks and the per-file fill check, minus the literal's
  ship check: 2,187 → 2,192. `id-namespace` – the file joins `FILES`, the
  emitter scan (it looks up `psiINT-reader-contents`); the counts are as
  before: 123 emitted ids, 570 selectors in 9 stylesheets, 16 allow-list
  entries and 25 allowed sites. Desktop: `FILES` gained the file, the read
  count went 15 → 16; with the file off `FILES` the test fails by name.
  Docs: `test/README.md` (`id-namespace`), the appearance skill's sentence
  on what `reader: off` ships. Identity: `npm run build:tracked` leaves
  `lectures/` unchanged; python-intro's four views, a `reader: off` fixture's
  four and a fixture with a `bars` figure, built by `build.js` at `1f4a323`
  (an archive unpacked in the scratch folder) and by the new one into
  `<old|new>/<plain|kept>/L/<deck>`, are `cmp`-equal plain and under
  `PSI_KEEP_COMMENTS=1` (whose documents carry the file's comment “Keep the
  marked entry inside the list's own scroll box”, the plain ones not); the
  `reader: off` documents carry no reader script; a staged engine builds
  python-intro equal. Not run: the browser suite and `test/pdf-export.mjs`.

  **For `PRINT_CSS`.** It carries the same expression twice –
  `(max-width: ${READER_WIDE_PX - 0.02}px)`, alone and after a
  `min-width` – and should name it `READER_WIDE_BELOW` when it moves.
- **`PRINT_HIGHLIGHTS_JS` → `runtime/print-highlights.js`** – done. 79,075
  bytes, 1,742 lines, written by `--extract … --names READER_NOTES_BELOW`
  from the value, which differs from the source: the 34 backslashes are
  seventeen doubled pairs – `\\s`, `\\S`, `\\w`, `\\{` and `\\}` in regexes,
  `\\n` and `\\u00ad` in strings, and the `\\\\u002d` the export writes into
  its HTML comments – each pair a single backslash in the file, as the
  page always got it. No escape resolved to a character; the non-ASCII characters
  in the file (`…`, `–`, `·`, `×`, …) were characters in build.js too. The
  one substitution, `READER_NOTES_PX - 0.02` inside the `matchMedia` string
  under which a note card shows only while opened rather than in the notes
  column, is `__PSI_READER_NOTES_BELOW__px`. `build.js` lost 1,755 lines and
  gained 27: `PRINT_HIGHLIGHTS_JS_PATH`, the `PRINT_HIGHLIGHTS_JS_FILL` table
  where the literal stood, `printHighlightsJs()` through `fillRuntime`, a
  comment replacing the literal's “same template-literal rules” sentence;
  the render site is `${shipJs(printHighlightsJs())}` after
  `printViewJs()`; two Node-side comments that named the literal
  (`readerStoreKey`'s, on `LEGACY`, and `runtime/print.js`'s, on the
  lightbox events) now name the file. The three comments inside `PRINT_CSS`
  that name `PRINT_HIGHLIGHTS_JS` stay (rule 7). Gates: `strip` – the
  literal leaves `LITERALS` and the file joins `RUNTIME`: 2,192 → 2,197.
  `id-namespace` – the file joins `FILES`: it emits `psiINT-rd-help` and
  looks up `psiINT-lightbox` and `psiINT-reader-data`; the counts are as
  before (123 emitted ids, 570 selectors in 9 stylesheets, 16 allow-list
  entries, 25 allowed sites), since build.js's scan had found the same ids in
  the literal. Desktop: `FILES` gained the file, the read count went 16 →
  17; with the file off `FILES` the test fails by name. Docs:
  `test/README.md` (`id-namespace`), three places in the appearance skill
  (what `reader: off` ships, the highlights paragraph, `pack()`). Identity:
  the same checks as for `PRINT_READER_JS`, against `1f4a323`: tracked views
  unchanged; python-intro, the `reader: off` fixture and the `bars` fixture
  `cmp`-equal, plain and under `PSI_KEEP_COMMENTS=1` (whose documents carry
  the file's comment “highlights listed as not found in the other”); the
  `reader: off` documents carry no reader script; a staged engine builds
  python-intro equal. Not run: the browser suite and `test/pdf-export.mjs`.

  **For `PRINT_CSS`.** It carries `(max-width: ${READER_NOTES_PX - 0.02}px)`
  three times and should name it `READER_NOTES_BELOW`, beside
  `READER_WIDE_BELOW` (above); its plain `${READER_NOTES_PX}px` /
  `${READER_WIDE_PX}px` widths keep the derived names.
- **`DIAGRAM_CSS` → `runtime/diagram.css`** – done, and the first use of
  the comment form. 22,957 bytes, 360 lines, written by `--extract …
  --names 'DG_SOFT_GROUND_DIM,DG_SOFT_GROUND_GHOST,/*BAR_FILL_RULES*/'`,
  which filled the file back to the literal's value before writing it; the
  value equals the source text (no escapes). The two `toFixed(4)` opacities
  a dimmed and a ghosted element's ground is taken down by are bare values
  (`opacity: __PSI_DG_SOFT_GROUND_DIM__;`, named for the `DG_SOFT_GROUND` key
  rather than the derived `…_DIM_TOFIXED_4`), and the six column-fill rules
  `dgBarFillCss()` generates stand on a line of their own as
  `/*__PSI_BAR_FILL_RULES__*/`, where a bare name would have been read as the
  next rule's selector. `build.js` lost 371 lines and gained 30:
  `DIAGRAM_CSS_PATH`, the `DIAGRAM_CSS_FILL` table where the literal stood
  (`DG_SOFT_GROUND` and `dgBarFillCss` are imports at the top of the file,
  so the table evaluates them where the literal did), `diagramCss()`
  through `fillRuntime`, a comment under the section banner; the three
  render sites (print, audience, speaker) are `${shipCss(diagramCss())}`;
  the stylesheet check's `sheets` entry is `'runtime/diagram.css':
  diagramCss()` – the sheet is checked filled, as it ships; two Node-side
  comments (on `FIG_CAP`'s `--fig-cap` fallback and in
  `assertStylesheetsWellFormed`) name the file. The four comments inside
  `PRINT_CSS` and `AUDIENCE_CSS` that name `DIAGRAM_CSS` stay (rule 7).

  **Five gates read the literal, and four of them as part of build.js's
  text, so the move would have left them reading less**; each is repointed
  at the file rather than loosened. `strip`: out of `LITERALS`, into
  `RUNTIME` (ship check, the two stylesheet strip checks on the raw file,
  the per-file fill check): 2,197 → 2,200. `id-namespace`: its
  `CSS_SOURCES` entry is `['runtime/diagram.css', null]`; the generated
  block names no `#id`, so reading the raw file loses nothing; still 570
  selectors in 9 stylesheets. `semantics`: the check that every
  `color-mix` against the paper goes over `--dg-ground` sliced build.js
  between `const DIAGRAM_CSS` and `const DIAGRAM_JS` and asserts exactly
  five – it reads the file now (the generated bar fills were never in that
  slice and have their own check on `dgBarFillCss()`); and the
  source-order check for `.bare.emph` against `.emph` and
  `.tone-4.emph` searched all of build.js, and searches the file. Both
  would have failed, not passed vacuously. `canvas`: “the max-height rule
  and `--dg-box-w` both fall back to the chunk cap” counted
  `var(--fig-cap, 0.62)` in build.js; the max-height rule is in the file,
  so it scans build.js plus the file (it would have failed: one of two).
  `zoom-scope`: it reads every template literal in build.js whose name
  holds `CSS`, which included this one; the sheet has no `var(--zoom)`
  rule, so nothing was lost today, but the gate would have stopped seeing
  the file. Its per-sheet walk is now a function of its own
  (`sheetZoomSelectors`) and a `RUNTIME_SHEETS` list holds
  `runtime/diagram.css`; still 51 selectors. **A gap found on the way, not
  closed here**: `speaker.css`, `souffleuse.css` and `pulse-print.css`
  left `zoom-scope`'s scope silently when their literals moved, since the
  gate found them by the `const …CSS = ` shape (none reads `var(--zoom)`
  today, so the count did not move). Adding them to `RUNTIME_SHEETS` is a
  commit of its own. All 51 of today's selectors are `AUDIENCE_CSS`'s, so
  its move fails the gate's `found.length > 20` unless the file joins the
  list; `PRINT_CSS` has none, and would drop out without a sound, so it
  joins the list in its own move too. Desktop: `FILES` gained the file, the read
  count went 17 → 18; with the file off `FILES` the test fails by name.
  Docs: `test/README.md` (`id-namespace`, `zoom-scope`), the figures
  skill's sentence on `DG_SOFT_GROUND`. Readers checked and left: the
  figure page's stylesheet, which `docs/artifact/refresh-figures.mjs` lifts
  out of a *built* view between two marker strings, and `--check` says it
  is up to date. Identity: `npm run build:tracked` leaves `lectures/`
  unchanged (all three tracked decks carry the sheet in every view, the
  generated block included); python-intro, the `reader: off` fixture and a
  fixture with a stacked `bars` pair, built by `build.js` at `1f4a323` and
  by the new one, `cmp`-equal plain and under `PSI_KEEP_COMMENTS=1` (whose
  views carry the file's comment “emph / dim are what a step reaches for”);
  every view of the bars fixture carries the filled `.dg-bar.tone-1` rule
  and no `BAR_FILL_RULES`, and no view anywhere holds `__PSI_`; a staged
  engine builds python-intro equal. Not run: the browser suite and
  `test/pdf-export.mjs`.
- **`DIAGRAM_JS` → `runtime/diagram.js`** – done, under the maintainer's
  variant (a) for open question 5: the four function sources go in by
  placeholder and the output is byte-identical. 20,369 bytes, 426 lines (the
  first one empty), written by `--extract … --names
  'DG_SHAPES,/*DG_SHAPE_D*/,/*DG_PATH_D*/,/*DG_SPLINE_D*/,/*DG_FULL_FRAMES*/'`
  from the value, which differs from the source: the 44 backslashes are
  doubled escapes in `dgSafeHref`'s and `dgScopedCss`'s regexes and strings
  (`\\u0000-\\u0020`, `\\/`, `\\s\\S`, `'\\\\'`, `'\\n'`) and the two escaped
  backticks of a comment, each a single character in the file, as the page
  always got it. The tool filled the file back to the value before writing
  it. The outline table stands as `const DG_SHAPES = __PSI_DG_SHAPES__;`, a
  JSON value in expression position, bare; the four functions lifted out of
  `diagram-core.mjs` – `dgShapeD`, `dgPathD`, `dgSplineD`, `dgFullFrames` –
  stand each on a line of its own as `/*__PSI_DG_SHAPE_D__*/` and so on,
  named after the function they are, as `DG_SHAPES` is after the constant it
  fills. The values are the literal's own expressions, unchanged, in
  `DIAGRAM_JS_FILL` where the literal stood (all five names are imports at the
  top of build.js); `fn.toString()` is a string, and none of the four sources
  nor the JSON holds `__PSI_` (checked). Note that `fillRuntime` checks the
  *file* for stray `__PSI_`, not the values it puts in: a value that held one
  would ship, and the strip gate's check on the shipped text is what would
  see it.

  **The comment form for the four, not a bare line.** Both compile, so the
  scheme's rule (“only where the bare form is invalid”) did not decide it;
  this did:
  - *What the slot is.* A function declaration is a statement that declares
    a name, not a value – the JS counterpart of the generated CSS block the
    comment form exists for. With it the scheme reads the same in both
    languages: bare where a value goes, comment where a declaration or a
    block goes.
  - *What an editor and a future linter see.* Either way the file declares
    none of the four, so a linter needs them in a globals list (as it needs
    the `AUDIENCE_JS` globals; open question 1). A bare
    `__PSI_DG_SHAPE_D__` line adds an expression statement of an undeclared
    name on top – `no-undef` and `no-unused-expressions` four times, which a
    globals entry cannot express as a pattern and would need four names or an
    inline disable to silence. The comment is nothing to a linter, and to a
    reader it says “text goes here” rather than “this identifier is
    evaluated”.
  - *ASI.* A bare line is a statement only by automatic semicolon insertion
    against the next line; an edit that starts the following line with `(`,
    `[` or a backtick makes the raw file parse as a call on the placeholder
    – still compiling, now meaning something else. A comment has no such
    neighbour.
  - *The vanishing comment the scheme warns of cannot happen here.* It is the
    same token, so a malformed one is still a `__PSI_` that `fillRuntime`
    refuses; and a skipped fill is refused before any build, by the strip
    gate's per-file check that a file holding a placeholder is read through
    `fillRuntime` with a table of exactly its names. The bare form's one
    advantage – an unfilled line throws a `ReferenceError` at load, where the
    comment would be stripped and `dgShapeD` missing only when a stepped
    outline moves – is a guard at the far end, behind two that already hold.

  `build.js` lost 431 lines and gained 29: `DIAGRAM_JS_PATH`,
  `DIAGRAM_JS_FILL`, `diagramJs()` through `fillRuntime`, a comment under
  the section banner; the two render sites (audience, cockpit) are
  `${shipJs(diagramJs())}`, still ahead of `AUDIENCE_JS` in the same script
  element; the Node-side comment under `// ── diagrams (::: draw) ──`, which
  still said the diagram CSS and the step runtime “stay here”, names the two
  files. The comment in `diagram-core.mjs` above `dgFullFrames` that names
  `DIAGRAM_JS` stays: the module ships as text (`window.PSI_DG`) and its
  comments ship under `PSI_KEEP_COMMENTS=1` (rule 7; one for the final
  sweep). **No dependency on `window.PSI_DG`**: the file reads nothing from
  it, and a deck with `editor: none`, whose views carry no `window.PSI_DG`,
  builds equal.

  Gates: `strip` – the literal leaves `LITERALS` and the file joins
  `RUNTIME`: its ship check, the four script checks and the per-file fill
  check (5 placeholders, keys exactly their names), minus the literal's ship
  check: 2,200 → 2,205; the fill check was shown to fail on a renamed table
  key, and a build with that key refuses with `runtime/diagram.js:
  placeholder __PSI_DG_PATH_D__ has no value` and writes no view.
  `id-namespace` – the file joins `FILES`, the emitter scan: it emits no id
  but looks up `#psiINT-figure-overlay` in two `querySelector`s (its other
  lookups are computed – `d.data.p + key`, `sc.dataset.for`); counts as
  before (123 emitted ids, 570 selectors in 9 stylesheets, 16 allow-list
  entries, 25 allowed sites). **No other gate read the literal**: with its
  body emptied in build.js, every gate's output was the same text, line for
  line, and the gates that hold figures to the runtime (`semantics`,
  `canvas`, `editor`, `step-classes`; there is no `figures` gate) read
  `diagram-core.mjs`, `editor.mjs` or built views; `docs/artifact/refresh-figures.mjs` lifts the
  runtime out of a built view between markers (`const DG_LIST = [];` …),
  and `--check` says up to date. Desktop: `FILES` gained the file, the read
  count went 18 → 19; with the file off `FILES` the test fails by name.
  Docs: `test/README.md` (`id-namespace`), the figures skill's sentence on
  `dgSwapFigure`.

  Identity: `npm run build:tracked` leaves `lectures/` unchanged
  (`lectures/diagrams` carries stepped figures in all four views); built by
  `build.js` at `dddda78` (an archive unpacked in the scratch folder) and by
  the new one into `<old|new>/<plain|kept>/L/<deck>` – python-intro,
  network-security, a fixture with an `autoplay 1400 cycle` figure and a
  hand-stepped one using `.hex` and `.diamond` outlines, and the same fixture
  with `editor: none` – all 32 views `cmp`-equal, plain and under
  `PSI_KEEP_COMMENTS=1` (whose live views carry the file's comment
  “Discrete state – visibility, classes”, the plain ones and the documents
  not); no view holds `__PSI_`; a staged engine (`FILES` copied into a
  scratch folder) builds python-intro and the stepped fixture equal. Not
  run: the browser suite and `test/pdf-export.mjs`.

  **For the three big literals.** Each is read as text by more gates than any
  move so far; a probe that emptied each literal in build.js and ran the
  gates found the readers that fail loudly, and the report of this move lists
  them with what each needs. The ones that would *not* fail: `zoom-scope`
  drops `PRINT_CSS` silently (no `var(--zoom)` rule in it today; it joins
  `RUNTIME_SHEETS` in its move), `canvas`'s absence check that nothing but
  `fitAvail` reads `FULL_FIT_FILL` off the viewport turns vacuous when
  `AUDIENCE_JS` leaves, and `inlined` keeps scanning only the small literals
  once the last big one has gone.
- **`PRINT_CSS` → `runtime/print.css`** – done, the documents' stylesheet
  and the first of the three big literals. 103,848 bytes, 2,274 lines (the
  first one empty), written by `--extract … --names` with fifteen names for
  its 21 substitutions, which filled the file back to the literal's value
  before writing it. The value differs from the source in three places:
  `content: '\\200b'` is the CSS escape `'\200b'` in the file, and a comment
  over the `.line` rule that spelled `\n` meant the two characters but got a
  line break from the literal – the file keeps the line break (and the three
  spaces before it), because that is what a `PSI_KEEP_COMMENTS=1` document
  always carried. **Every substitution is a build-wide constant**: each is a
  pure function of tables declared above the literal (`PRINT_LIGHT_TOKENS`,
  `BOLD_LOOKS` and `DERIVED_STRONG`, `INLINE_CODE_SEL`, `DISPLAY_LH`,
  `DARK_TOKENS`, `READER_NOTES_PX`, `READER_WIDE_PX`); none reads a
  lecture, its frontmatter or a call's arguments – what `style:` changes on
  paper is a body attribute these rules key off, and `codeTag` and
  `styleBlockCss`, which do depend on the deck, emit their own `<style>`
  after the sheet. The placeholders:

  | name | form | filled with |
  |---|---|---|
  | `PRINT_LIGHT_TOKENS` | comment | `tokenDecls(PRINT_LIGHT_TOKENS)`, the paper palette in `:root` |
  | `PRINT_BOLD_LOOKS` | comment | `boldLookCss('print-bold', 'bold', '600')` |
  | `INLINE_CODE_SPACED` | bare, selector | `inlineCodeSel('print', '', ':not(.nb)')` |
  | `INLINE_CODE_SPACED_LEAD` | bare, selector | `inlineCodeSel('print', '', ':not(.nb).lead')` |
  | `INLINE_CODE_SPACED_TRAIL` | bare, selector | `inlineCodeSel('print', '', ':not(.nb).trail')` |
  | `INLINE_CODE_TINT` | bare, selector | `inlineCodeSel('print', 'body[data-code=tint]')` |
  | `DISPLAY_LH_TITLE` | bare | `displayLh('print', '.chunk-title .title-main')` |
  | `DISPLAY_LH_EYEBROW_SUBTITLE` | bare | `displayLh('print', 'body[data-headline=eyebrow] .chunk-title .title-subtitle')` |
  | `DISPLAY_LH_DISPLAY_COVER_TITLE` | bare | `displayLh('print', '.chunk-title[data-cover=display] .title-main')` |
  | `READER_NOTES_PX` (×4) | bare | `READER_NOTES_PX` |
  | `READER_NOTES_BELOW` (×3) | bare | `READER_NOTES_PX - 0.02` |
  | `READER_WIDE_PX` | bare | `READER_WIDE_PX` |
  | `READER_WIDE_BELOW` (×2) | bare | `READER_WIDE_PX - 0.02` |
  | `PRINT_DARK_BY_SYSTEM` | comment | `printDarkCss(':root:not([data-scheme=light])')` |
  | `PRINT_DARK_BY_CHOICE` | comment | `printDarkCss(':root[data-scheme=dark]')` |

  Names chosen by hand: the selector lists after the look whose rule they
  carry (the unguarded rule is `spaced`, the default, and `:not(.nb)` is a
  span with a space in it), the line heights after `DISPLAY_LH` and the slot,
  the two widths just under a breakpoint `READER_NOTES_BELOW` /
  `READER_WIDE_BELOW` as in the two reader scripts, the plain widths after
  their constants, the dark blocks after which preference they answer. The
  two `printDarkCss` blocks stand straight after an `@media … {` on the same
  line, as `{/*__PSI_…__*/`, which gives the same bytes.

  `build.js` lost 2,302 lines and gained 67: `PRINT_CSS_PATH`, the
  `PRINT_CSS_FILL` table where the literal stood (every name in it is
  declared above, so it evaluates where the literal did), `printCss()`
  through `fillRuntime`, a comment; the render site in `renderDocument` is
  `${shipCss(printCss())}`, and the stylesheet check's `sheets` entry is
  `'runtime/print.css': printCss()`, the sheet filled, as it ships. Sixteen
  Node-side comments that named the literal as where a rule lives now name
  the file (the list of literals `shipJs` / `shipCss` handle dropped it).
  The comments inside the file and inside `AUDIENCE_CSS` that name
  `PRINT_CSS`, `PRINT_HIGHLIGHTS_JS` or `DIAGRAM_CSS` stay (rule 7), as does
  the one in `diagram-core.mjs`, which ships as text.

  **Readers, found by emptying the literal in build.js and running the
  gates**: two checks failed loudly and two scopes shrank without a sound.
  `tails` – `DISPLAY_TRACK is complete` cut the print sheet out of build.js
  between ``const PRINT_CSS = ` `` and `const AUDIENCE`; it reads the file now,
  raw (the placeholders are values and selector lists with no brace, the
  generated blocks comments, which the scan drops as it dropped the `${…}`),
  and still finds the two tracked title rules. `id-namespace` – its
  `CSS_SOURCES` entry is `['runtime/print.css', null]`; emptied, the count
  fell 570 → 547, and read from the file it is 570 again (the four selector
  placeholders are type selectors and the generated blocks name no `#id`).
  `strip` – the literal leaves `LITERALS` and the file joins `RUNTIME`: its
  ship check, the two stylesheet strip checks on the raw file and the
  per-file fill check (15 names), minus the literal's ship check: 2,205 →
  2,208; the fill check fails on a renamed table key, and a build with that
  key refuses with `runtime/print.css: placeholder
  __PSI_READER_WIDE_BELOW__ has no value`. `zoom-scope` – the file joins
  `RUNTIME_SHEETS`; it reads no `var(--zoom)` today, and a rule appended to
  it that does fails the gate. `inlined` scans only the literals left, as
  planned. No other gate's output moved, and the other readers of
  `PRINT_CSS`'s name – `test/settings.mjs`, the skills, `docs/` – read built
  views or are prose; `refresh-figures.mjs --check` says up to date.
  Desktop: `FILES` gained the file, the read count went 19 → 20; with the
  file off `FILES` the test fails by name. Docs: `test/README.md`
  (`id-namespace`, `zoom-scope`), every sentence in the appearance,
  decoration and media skills that named the literal as a location, and
  seven comments and assertion messages in `test/settings.mjs`.

  Identity: `npm run build:tracked` leaves `lectures/` unchanged (every
  tracked deck has a `print.html`, the first two a `print-notes.html`); built
  by an archive of `43ae70c` and by the new engine into
  `<old|new>/<plain|kept>/L/<deck>` – python-intro, the tutorial, a `kind:
  document` fixture (`lang: de`, a `::: marginalia` and a `::: footnote` in
  the margin, a `###` heading), a fixture with `print-bold: accent-italic`,
  `print-neutrals: cool`, `code: tint` and `print-body: sans`, one with
  `print-marginalia: inline`, `code: plain` and `print-bold: plain`, and one
  with `reader: off` – all 42 views `cmp`-equal, plain and under
  `PSI_KEEP_COMMENTS=1` (whose documents carry the file's comment “The hue
  style: {neutrals} moves the greys onto”, the plain ones and the live views
  not); no view holds `__PSI_`; a staged engine (`FILES` copied into a
  scratch folder) builds python-intro and the document fixture equal. Not
  run: the browser suite and `test/pdf-export.mjs`.
- **`AUDIENCE_CSS` → `runtime/audience.css`** – done, the stylesheet of the
  two live views (the cockpit layers `runtime/speaker.css` on top of it) and
  the second of the three big literals. 271,922 bytes, 5,476 lines (the
  first one empty), written by `--extract … --names` with fifteen names,
  which filled the file back to the literal's value before writing it. The
  value differs from the source in one place: a comment in the code-span
  rules spelled `- **Measure**\` followed by spaces, and the template literal
  read `\ ` as a plain space – the file keeps the space, because that is
  what a `PSI_KEEP_COMMENTS=1` view always carried. **Every substitution is
  a build-wide constant**: each is a pure function of tables declared above
  the literal (`FONT_STACK_TAILS`, `INLINE_CODE_SEL`, `DISPLAY_LH`,
  `BOLD_LOOKS` and `DERIVED_STRONG`, and `FIGURE_TYPE_STEPS`, imported from
  `tails.mjs`), none of them written to anywhere in build.js, and none reads
  a lecture, its frontmatter or a mutable module variable – what `style:`
  changes on screen is a body attribute these rules key off, and the
  deck-dependent CSS (`fontStyleTag`, `codeTag`, `styleBlockCss`) is emitted
  in a `<style>` of its own after the sheet. The placeholders:

  | name | form | filled with |
  |---|---|---|
  | `FONT_STACK_TAILS_SERIF` | bare | `FONT_STACK_TAILS.serif` |
  | `FONT_STACK_TAILS_SANS` | bare | `FONT_STACK_TAILS.sans` |
  | `FONT_STACK_TAILS_MONO` | bare | `FONT_STACK_TAILS.mono` |
  | `LIVE_INLINE_CODE_TINT_PITCHBLACK` | bare, selector | `inlineCodeSel('live', 'body[data-code=tint][data-mode=dark][data-pitchblack=on]')` |
  | `LIVE_INLINE_CODE_TERMINAL` | bare, selector | `inlineCodeSel('live', 'body[data-theme^=terminal]')` |
  | `LIVE_INLINE_CODE_SPACED` | bare, selector | `inlineCodeSel('live', '', ':not(.nb)')` |
  | `LIVE_INLINE_CODE_SPACED_LEAD` | bare, selector | `inlineCodeSel('live', '', ':not(.nb).lead')` |
  | `LIVE_INLINE_CODE_SPACED_TRAIL` | bare, selector | `inlineCodeSel('live', '', ':not(.nb).trail')` |
  | `LIVE_INLINE_CODE_TINT` | bare, selector | `inlineCodeSel('live', 'body[data-code=tint]')` |
  | `FIGURE_TYPE_RULES` | comment | one `.chunk[data-figure-type="N"]` rule per `FIGURE_TYPE_STEPS` entry |
  | `LIVE_DISPLAY_LH_TITLE` | bare | `displayLh('live', '.chunk-title .title-main')` |
  | `LIVE_DISPLAY_LH_EYEBROW_SUBTITLE` | bare | `displayLh('live', 'body[data-headline=eyebrow] .chunk-title .title-subtitle')` |
  | `LIVE_DISPLAY_LH_DISPLAY_COVER_TITLE` | bare | `displayLh('live', '.chunk[data-cover=display] .title-main')` |
  | `LIVE_DISPLAY_LH_SECTION_HEADING` | bare | `displayLh('live', '.chunk-section .section-heading')` |
  | `LIVE_BOLD_LOOKS` | comment | `boldLookCss('bold', 'plain', 'var(--bold-weight)')` |

  Names chosen by hand. The font stacks keep the derived names: the same
  expression wherever it stands. What `runtime/print.css` fills from the
  same function with the `'print'` view, this sheet fills under the print
  sheet's name with `LIVE_` in front (`INLINE_CODE_SPACED` →
  `LIVE_INLINE_CODE_SPACED`, `DISPLAY_LH_TITLE` → `LIVE_DISPLAY_LH_TITLE`,
  `PRINT_BOLD_LOOKS` → `LIVE_BOLD_LOOKS`), so a name means one expression
  across `runtime/`; the two lists the print sheet has no counterpart for are
  named after the guard they carry (`…_TINT_PITCHBLACK`, `…_TERMINAL`), the
  section heading's line height after its slot, and the figure-type steps
  after what they are.

  `build.js` lost 5,499 lines and gained 60: `AUDIENCE_CSS_PATH`, the
  `AUDIENCE_CSS_FILL` table where the literal stood (every name in it is
  declared above, so it evaluates where the literal did), `audienceCss()`
  through `fillRuntime`, a comment; the two render sites (`renderAudience`,
  `renderSpeaker`) are `${shipCss(audienceCss())}`, and the stylesheet
  check's `sheets` entry is `'runtime/audience.css': audienceCss()`, the
  sheet filled, as it ships – the check's comment, which said every CSS
  block of the file lives in a template literal, now says the sheets are
  files. Ten Node-side comments that named the literal as where a rule
  lives name the file, the speaker CSS banner among them (“layered on top of
  runtime/audience.css”), and the list of literals `shipJs` / `shipCss`
  handle dropped it. The two comments inside `AUDIENCE_JS` that name
  `AUDIENCE_CSS` stay (rule 7), as do the ones in `editor.mjs` and
  `diagram-core.mjs`, which ship as text, and the one inside `pdf-core.mjs`'s
  `PDF_CSS`, which goes into the export's page.

  **Readers, found by emptying the literal in build.js and running the
  gates** (2,208 → 2,183 passed, 22 failed): five gates failed loudly and
  one shrank without a sound, and each is repointed at the file rather than
  loosened; with the move made, each gate's full output was compared with
  the one before it, and nothing differs but what is listed here.
  `semantics` – the dark theme held against `DARK_TOKENS`, the seven
  `DG_THEMES` blocks, the three `--paper-own` checks and the pitchblack rule
  read the file; the root slice, which cut build.js from
  ``const AUDIENCE_CSS = ` `` to the first `--zoom:`, is the file's head up
  to `--zoom:` (the same eleven lines); `DARK_TOKENS` and `DARK_THEME_NAMES`
  are still read out of build.js. No check there would have turned vacuous:
  each one failed when the literal was emptied, or (the `--paper-own`
  checks, inside a loop over the theme blocks) disappeared from the output.
  `tails` – `DISPLAY_TRACK is complete` reads the file raw for the live
  half; the scan finds the same nine tracked title rules, compared as lists.
  `canvas` – the `--body-fs` scan, the `var(--fig-cap, …)` fallbacks, the
  picture, bleed and stack `--fig-cap` rules and the bleed chunk rule search
  build.js followed by the file, so they cover what they covered while the
  sheet was a literal; what they find is the same, compared as lists.
  `zoom-scope` – the file joins `RUNTIME_SHEETS`; **54 selectors, not 51**:
  as a literal the sheet was scanned in build.js's source text, where the
  `${displayLh(…)}` in three declarations carried braces the gate's block
  walk took for a block of its own, which hid three rules reading
  `var(--zoom)` – `.chunk-title .title-main`, the eyebrow subtitle and
  `.chunk-section .section-heading`, all three on a slide. Read from the
  file, whose placeholders have no braces, the walk sees them; the 51 it saw
  before are among the 54, in the same order. The file is read raw, not
  filled: no rule headed by one of the six selector placeholders reads
  `var(--zoom)`, and neither generated block sets it. Its first check's
  message said “the CSS literals still hold the rules”, which none does now:
  “the stylesheets”. `id-namespace` – the silent one: emptied, the count
  fell 570 → 354 and nothing failed; its `CSS_SOURCES` entry is
  `['runtime/audience.css', null]`, and read from the file it is 570 again.
  Reading it raw loses nothing: the six selector placeholders are type
  selectors, and what fills them names classes and body attributes only
  (`INLINE_CODE_SEL`'s live entry and five guards, no `#`), as do the two
  generated blocks. `strip` – the literal leaves `LITERALS` (which now holds
  `AUDIENCE_JS` alone) and the file joins `RUNTIME`: its ship check, the two
  stylesheet strip checks on the raw file and the per-file fill check (15
  names), minus the literal's ship check: 2,208 → 2,211; the fill check
  fails on a renamed table key, and a build with that key refuses with
  `runtime/audience.css: placeholder __PSI_LIVE_DISPLAY_LH_SECTION_HEADING__
  has no value`. `inlined` scans only the literals left (14 named). No other
  reader of build.js as text reads the sheet: `test/settings.mjs`, `cli`,
  `commands`, `frontmatter`, `xheight` and the rest read other tables or
  built views, and `refresh-figures.mjs --check` says up to date. Desktop:
  `FILES` gained the file, the read count went 20 → 21; with the file off
  `FILES` the test fails by name. Docs: `test/README.md` (`id-namespace`,
  `zoom-scope`, and the coverage paragraph's example, which named
  `const AUDIENCE_CSS = …` and names `AUDIENCE_JS` now, as
  `tools/coverage-logic.mjs`'s header does), every sentence in the
  appearance, decoration and figures skills that named the literal as a
  location, the module header of `pdf-core.mjs`, three assertion messages in
  `test/settings.mjs` and two comments in `test/pdf-export.mjs`.

  Identity: `npm run build:tracked` leaves `lectures/` unchanged (all three
  tracked decks carry `audience.html`, the first two `speaker.html`); built
  by an archive of `2500531` and by the new engine into
  `<old|new>/<plain|kept>/L/<deck>` – python-intro, network-security,
  display-face (`fonts: {display: Anton}`, `cover: display`), title-block
  (`headline: eyebrow`, `caps: on`), a fixture with `theme: terminal-green`,
  `pitchblack: on`, `code: tint`, `bold: accent-italic`, `neutrals: cool`,
  `figure-type: 1.3`, `headline: eyebrow`, `hyphenate: all`,
  `section: number` and a `.figure-type-70` figure, and one with `theme:
  dark`, `cover: display`, `code: plain`, `bold: plain`, `neutrals: warm`
  and a `.figure-type-150` chunk – all 48 views `cmp`-equal, plain and under
  `PSI_KEEP_COMMENTS=1` (whose live views carry the file's comment “Fifteen
  steps, the key's own 0.6-2.0 in tenths”, the plain ones and the documents
  not); no view holds `__PSI_`; a staged engine (`FILES` copied into a
  scratch folder) builds python-intro and the first fixture equal.
  `test/settings.mjs`, `reproducible`, `containers`, `cli`, `present` and
  `large-deck` pass. Not run: the browser suite and `test/pdf-export.mjs`.

  **For `AUDIENCE_JS`, the last.** Emptied the same way, it fails fourteen
  checks in three gates and empties one more without a sound. `commands`
  reads it as `literal(buildJs, 'AUDIENCE_JS')` – `COMMAND_RUN`, the key
  map's listener, the overview switch, the `Cmd`-`K` head – and reads the
  file instead, the value (66 resolved backslashes; the `e.key` comparisons
  it extracts are to be checked against that, as `SPEAKER_JS`'s were).
  `id-namespace` – the file joins `FILES`, the emitter scan: it emits
  `psiINT-nav-hints`, and without it six selectors in
  `runtime/audience.css` name an id nothing writes (123 → 122 emitted ids).
  `canvas` – `FIG_REF_ZOOM` against `state.zoom`, `FULL_FIT_FILL` and the
  bleed branch of `fitAvail` read build.js plus the file, and **its absence
  check, that nothing beside `fitAvail` reads `FULL_FIT_FILL` off the
  viewport, turns vacuous** unless the file is in the text it searches.
  `strip` – the file joins `RUNTIME` with the four script checks (its five
  JSON placeholders stand in expression position, so the raw file
  compiles), and `LITERALS` would be empty: the loop goes, rather than
  staying as a check over nothing. `inlined` then scans only the small
  literals – the markup ones, `PRINT_VIEW_EARLY_JS`, `READER_EARLY_JS`,
  `DOCUMENT_PAGE_CSS`, `SANS_STACK_TAIL` – so its header (“roughly two
  thirds of build.js is stylesheets and runtime scripts held in template
  literals”) and CLAUDE.md's convention on template literals need
  rewriting; the gate keeps its use while those literals stay (open
  questions 6 and 7), and its regex-escape half then applies only to the
  two `<script>` one-liners. Desktop: `FILES` and a read count of 22.

- **`AUDIENCE_JS` → `runtime/audience.js`** – done, the runtime of the two
  live views (the cockpit's `runtime/speaker.js`, and under `--prompter`
  `runtime/souffleuse.js`, run after it in the same script element and in
  its lexical scope) and the last of the three big literals. 293,818 bytes,
  6,041 lines (the first one empty), written by `--extract … --names
  AUTO_FIT_CYCLE,SLIDE_NUM_DEFAULT,SLIDE_NUM_MODES,THEME_NAMES,DARK_THEME_NAMES`,
  which filled the file back to the literal's value before writing it. The
  value differs from the source: the 66 backslashes are the nine escaped
  `\${` browser templates and the escaped backticks of their template
  literals, doubled escapes in regexes (`\\s`, `\\p{L}`, `\\d`, `\\/`,
  `\\]`, `\\u0300-\\u036f`) and in two `'\\n'` strings, each a single
  character in the file, and three `\u` escapes in strings (`·` twice,
  `⌄`), which the literal resolved to the characters themselves – the
  file carries them as UTF-8, with the same meaning and the same bytes in
  the view. The placeholders, all bare JSON values in expression position,
  so the raw file compiles as a script:

  | name | form | filled with |
  |---|---|---|
  | `AUTO_FIT_CYCLE` | bare | `JSON.stringify(AUTO_FIT_CYCLE)` |
  | `SLIDE_NUM_DEFAULT` | bare | `JSON.stringify(SLIDE_NUM_DEFAULT)` |
  | `SLIDE_NUM_MODES` | bare | `JSON.stringify(SLIDE_NUM_MODES)` |
  | `THEME_NAMES` | bare | `JSON.stringify(THEME_NAMES)` (the runtime's `THEME_CYCLE`) |
  | `DARK_THEME_NAMES` | bare | `JSON.stringify(DARK_THEME_NAMES)` (the runtime's `DARK_THEMES`) |

  Named after the build-side table each is filled from, as `DG_SHAPES` is,
  not after the runtime constant it initialises (two of the five are renamed
  on the way in) and not with the derived `JSON_STRINGIFY_…` prefix. Every
  value is a build-wide constant: the five tables are declared above the
  literal, written to nowhere in build.js, and read no lecture.

  `build.js` lost 6,058 lines and gained 42: `AUDIENCE_JS_PATH`, the
  `AUDIENCE_JS_FILL` table where the literal stood, `audienceJs()` through
  `fillRuntime`, a comment; the two render sites (`renderAudience`,
  `renderSpeaker`) are `${shipJs(audienceJs())}`, still after
  `diagramJs()` in the same script element; ten Node-side comments that
  named the literal as where a function lives (`liveQrSvg`, the key map,
  `psiBuildBannerHere`, the start menu, `toggleHelp`, the lightbox's note on
  the figure focus, `AUTO_FIT_CYCLE`'s, the speaker runtime's banner and
  comment) name the file, and the paragraph on what `shipJs` / `shipCss`
  handle no longer lists a literal. The comments inside shipped text that
  name `AUDIENCE_JS` stay (rule 7): `runtime/speaker.js`,
  `runtime/watch-banner.js`, `runtime/audience.css`, `commands.mjs` and
  `editor.mjs`, which ship as text.

  **Readers, found by emptying the literal in build.js and running the
  gates** (2,211 → 2,195 passed, 14 failed, one check gone from the output
  and one count fallen): three gates failed loudly, and one check would have
  turned vacuous; each is repointed at the file rather than loosened, and
  with the move made each gate's full output was compared with the one
  before it. `commands` – the twelve failures (`COMMAND_RUN` not found, no
  run function for any command in either view, the listener and its
  overview switch not found, the `Cmd`-`K` head, and the audience's key
  count 52 → 51) all came from `literal(buildJs, 'AUDIENCE_JS')`, the
  literal's source text; the gate reads the file, the value, raw (its five
  placeholders stand for tables, none a key or a command), and its now
  unused `literal()` helper is gone. None of the lines whose backslashes the
  literal resolved holds an `e.key` comparison, a `case` label or a
  `COMMAND_RUN` entry, and **the gate's output is line for line what it
  was**, the two assertion messages that still say “in AUDIENCE_JS”
  included. `canvas` – `both zooms are findable`, `FULL_FIT_FILL is
  findable` (and with it the picture-cap check, which the output then
  dropped) and the bleed branch of `fitAvail` failed; the four runtime
  checks now search build.js followed by the file, as the stylesheet checks
  do. **The absence check – nothing beside `fitAvail` reads `FULL_FIT_FILL`
  off the viewport – would have passed vacuously** with build.js alone; it
  searches build.js plus the file too, and a line `return
  viewport.clientHeight * FULL_FIT_FILL;` appended to the file temporarily
  fails it. `id-namespace` – emptied, the six `#psiINT-nav-hints` selectors
  in `runtime/audience.css` named an id nothing writes and the emitted ids
  fell 123 → 122; the file joins `FILES`, the emitter scan, and the counts
  are as before (123 emitted ids, 570 selectors in 9 stylesheets); the one
  line that moved is the assertion naming the files it read. `strip` – the
  literal leaves `LITERALS`, which is now empty (the loop goes in the next
  commit), and the file joins `RUNTIME`: its ship check, the four script
  checks and the per-file fill check (5 names), minus the literal's ship
  check: 2,211 → 2,216. `inlined` scans the literals left (13 named,
  from 14). The one other line that moved is the tracked-file count of a
  scan over the working tree (278 → 279, the new file). Other readers
  checked and left: `test/settings.mjs` lifts the sentence helpers out of a
  *built* `audience.html`, and `refresh-figures.mjs` lifts the runtime out
  of built views between markers; both pass, `--check` up to date.

  Desktop: `FILES` gained the file, the read count went 21 → 22; with the
  file off `FILES` the test fails by name. Docs: `test/README.md` (`commands`,
  `id-namespace`, the browser-suite paragraph, `window.psiIdle`, and the
  coverage paragraph, which now says the large literals have gone),
  `tools/coverage-logic.mjs`'s header, every sentence in the appearance,
  figures, media and prompter skills and in `speaker.md` that named the
  literal as a location, `CONTRIBUTING.md`'s and `browser.yml`'s “run it
  after touching”, `pdf-core.mjs`'s header, `lint.js`'s comment over its
  mirrored sentence helpers, two comments in `test/settings.mjs`, and the
  `flashMode` row of `TODO-localisation.md`. Left: `PLAN-presenter.md`,
  `editor.md` and `HANDOFF.md`, which name the literal as it was when they
  were written.

  Identity: `npm run build:tracked` leaves `lectures/` unchanged; built by
  an archive of `3f790c1` and by the new engine into
  `<old|new>/<plain|kept>/L/<deck>` – python-intro, network-security,
  spoken-talk (cue cards and `> note: from N`), a fixture with `auto-fit:
  shrink`, `transition: fade`, `neighbours: dim`, `note-button: off`, `theme:
  dark`, `slide-numbers: vertical` and a stepped figure, and one with `editor:
  none`, `transition: cut`, `note-button: on`, `auto-fit: false`, `lang: de`,
  an `autoplay 1400 cycle` figure and maths – all 40 views `cmp`-equal,
  plain and under `PSI_KEEP_COMMENTS=1` (whose live views carry the file's
  comment “The audience runtime is shared with the speaker view”, the plain
  ones not); a `--watch --prompter --prompter-dry-run` build of python-intro
  by both engines, 20 seconds each under `perl -e 'alarm 20'`, gives eight
  views equal once run id, socket port, nonce and listen key are
  placeholders; no view holds `__PSI_`; no `build.js` was left running; a
  staged engine (`FILES` copied into a scratch folder) builds python-intro
  and the first fixture equal. `test/settings.mjs`, `reproducible`,
  `containers`, `cli`, `present` and `large-deck` pass. Not run: the browser
  suite and `test/pdf-export.mjs`.
