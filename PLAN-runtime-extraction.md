# Plan – the inlined runtime out of build.js, one literal at a time

Action item 4 of `docs/history/REVIEW-code-2026-10-17.md` (§3 and the ranked
plan): the stylesheets and browser scripts that `build.js` holds as
template-literal constants move into real files that the build reads, so they
get an editor's highlighting, a linter and a formatter. **The maintainer's
condition is the whole method: one literal per commit, gate-protected, and
every view the build writes is byte-identical before and after.** Nothing in a
built page changes; only where its text comes from.

Status: **8 of 24 moved** – the pilot, `SPEAKER_CSS`, then `PRINT_JS`,
`PULSE_PRINT_CSS`, `SPEAKER_JS`, `SOUFFLEUSE_CSS`, `SOUFFLEUSE_JS`,
`WATCH_BANNER_CSS` and `WATCH_BANNER_JS` (see *Log*): every static CSS and
JS literal on the list. Next: step 8 of *Order*, `PRINT_READER_JS`,
`PRINT_VIEW_JS` and `PRINT_HIGHLIGHTS_JS`, the first with substitutions.
The inventory's line numbers are those of `a49b625`, before the pilot;
`node tools/runtime-literals.mjs` has the current ones.

## Inventory

**`node tools/runtime-literals.mjs` prints the current inventory** (the literals still in build.js, with lines, substitutions, escaped `\${`, backslashes and whether the value equals the source), and `--extract NAME FILE` writes a static literal's *value* to a file and reads it back – the method below, kept as a tool so every later step uses the same one. The table here is the snapshot the plan was written against.

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
   `grep -n '^// ── ' build.js` still maps the file.
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

**The substitution schemes are designed when each group is reached**, not
here. What any of them has to satisfy: the substitution happens on the file's
text *before* `ship*` (so a placeholder may live in a comment, and the strip
memo still sees one stable string per process); every slot is filled exactly
once and an unknown slot is a build error; the file stays valid for its own
tooling (a CSS selector-position slot does not, which is why `AUDIENCE_CSS`
and `PRINT_CSS` need more thought than a media-query width); and the output
is byte-identical.

## Checklist per literal

1. Re-run the inventory with the parser; record span, `${}`, escapes and
   coverage for this literal. Do not trust this table's line numbers once a
   literal above has moved.
2. Copy the old `build.js` aside. Generate `runtime/<file>` from the evaluated
   value; read back; assert equal.
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
5. **The substitution schemes** (see *Order*): named constants for the
   numbers and strings; something else for selector-position and generated
   blocks; function sources for `DIAGRAM_JS` – possibly by having the
   runtime read them from `window.PSI_DG` rather than splicing them twice.
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
