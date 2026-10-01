# TODO – before tagging 2.0.0

A whole-repository review run on 2026-10-01 by seven agents, one per area,
each finding reproduced with a fixture deck or in Chrome unless marked
*read*. Line numbers are as of `16e1a24` and are grep targets, not promises.
Work it slice by slice; strike a finding out of this file when its fix lands,
and move the file to `docs/history/` when the list is empty.

Not in this file, because they are decisions rather than defects:

- `PLAN-presenter.md`: the new W path asks main "through the preload's
  `present` channel", which Decision 4 forbids (no preload on presenter
  windows); Decision 5 still forwards raw keys from the projection, the
  interception the W paragraph rejects; the branch belongs in
  `toggleProjectionFullscreen()` (the touch palette calls it directly);
  `psiPresent` has no member saying "inside the app"; the `present` channel
  name is overloaded; the fallback badge state has no path from main; the
  typed-`w` case has no test.
- CONTRIBUTING.md:187–201 promises the app shares the engine's version and
  ships on the `v*` release from 2.0.0; no workflow does that.
- CI and `engines` are on Node 20, end of life since April 2026.

## S1 – Security (a source.md someone sent you)

All eight findings are fixed; the fourth set of bullets under Security in
CHANGELOG.md says what changed.

## S2 – Data loss

1. **`--integrate-annotations` deletes the rest of source.md when the end
   marker is missing** (`build.js:27772`: `blockEnd = src.length`). Refuse.
2. **`--optimize-images`: two sources with one stem become one picture**
   (`build.js:28157, 28239`): `logo.png` and `logo.jpg` → one `logo.webp`,
   both originals deleted; also overwrites an unrelated referenced
   `logo.webp`. Refuse or pick a free name.
3. **The editor's localStorage key does not name the lecture**
   (`editor.mjs:7802, 7811`, `'psi-slides:diagram:' + chunkId + '#' + nth`).
   Chrome shares one `file://` store, so an edit in lecture A is drawn in B's
   `#fig` (confirmed in Chrome). `dgeNewFigure` suggests `#figure-1`
   everywhere; dividers share `unnamed#N`. Key it like the reader does.
4. **`--watch` keeps a replaced picture's old pixels**: `webpInlineCache`
   (`build.js:500, 518`) is never cleared in `buildOnce`; also the editor's
   asset upload with `replace: true`.

## S3 – Parser, build and lint congruence

1. **Fences are only ```` ``` ```` at column 0** (`build.js:5526, 5319, 5154`,
   `segmentIndexer` ~4790). `~~~`, indented and four-backtick fences are
   missed: a `~~~yaml` block with `---` is split into two segments. The image
   collectors and `rewriteAssetRef` do know `~~~`, so a `::: draw` inside one
   is live to the parser and documentation to them. Lint is silent.
2. **An unclosed fence swallows every later slide**, exit 0; lint says only
   `orphan-column`. One end-of-file check in both files.
3. **Unclosed `::: cols` / `slide` / `script` / `marginalia` / `side` /
   `embed` build silently** (`build.js:5293–5304`) while lint errors
   (`lint.js:3415–3419`). Refuse in the build.
4. **A trailing `---` buys a beat or not depending on a blank line**
   (`build.js:5329`, `if (cur.length)`): without a blank line before the next
   heading the empty segment is dropped and a `::: footnote` after it loses
   its `data-seg`; lint counts the beat.
5. **Images that silently ship as external paths**:
   `![](assets/pic.png?v=2)` (`build.js:3094, 3112`, the existence check
   strips the query, inlining does not); reference-style `![a][r]` and
   `![a](<path>)` (`collectDecorationImageRefs` build.js:817, lint.js:4691/4698
   match only the inline form; lint calls the angle form unresolved).
6. **Clips**: explicit-path clips over the cap are never staged
   (`build.js:3124`, only the shorthand branch at 3060 calls `stageVideo`)
   though the summary says "staged into videos/"; a clip-only deck has
   `count === 0` and auto mode turns inlining off (`build.js:29515`, ~857).
7. **Lint silent, build refuses**: a BOM before the frontmatter or a closing
   `--- ` with a trailing space (`lint.js:630–639`); `cover: split|hero`
   without `cover-image` (build.js:8233) and `beside|above` with neither body
   nor image (~8395); `lang: 123`, `cover-ground`, `closing-credits`,
   `cover-align` applicability, scalar `style:` / `labels:` /
   `draw-defaults:`; `prompter:` number bounds (`lint.js:2958–2963` vs
   build.js ~7760); `theme:\n  bogus`, `"theme": bogus`, a multi-line flow map.
   The reverse: `auto-fit: True`, `theme: >-` are refused by lint, accepted by
   the build.
8. **Invalid YAML** (`title: Security: an intro`, a duplicate key) escapes
   `safeMatter` (build.js:206) as a stack trace without `userFacing`; lint
   never notices.
9. **`oversized-asset` message is stale** (`lint.js:4645`): it says the
   image stays external; the build refuses the deck.
10. **A positional id can collide with an author id** (`build.js:13229`,
    `c${col}-${idx}`): `## free: Noid` plus `{#c0-3}` → two articles with one
    `data-chunk-id`, no word. Refuse it in `assertDistinctIds`.
11. **`fonts: off` and `fonts: {heading: Anton}` are silent no-ops** in both
    files (build.js:1775, 2002).
12. *Read*: `--serve` answers `Range: bytes=-500` with bytes 0–500
    (build.js:30334); a `../shared/x.png` under `--no-inline-images` is 403
    under `--serve` because the asset root is one level up.

## S4 – Live runtime (all confirmed in Chrome)

1. **A frozen cockpit is dragged back by any projection snapshot**
   (build.js:19598 applies every `state`; `frozen` gates only outgoing,
   25046). `autoplay` on the projection does it every tick; so does B on the
   projection's keyboard. Also overwrites `revealed` and annotation drafts.
2. **Reloading the projection while frozen shows the cockpit's look-ahead**
   (`saveActive` 19231 writes one shared `activeIdx` from both views,
   `loadPersisted` 19188).
3. **A second S on the projection reloads the cockpit** (22929,
   `window.open` re-navigates the named window): freeze, clock, cue cursor
   reset.
4. **`autoplay` never starts when the cockpit drives**: `restartAutoplay`
   only from `jumpTo` (20875) and boot, not `applyRemoteStateNow` (19462).
5. **`transition: fade` loses or reverses a second press within 130 ms**:
   `state.activeIdx` is set late in `landSlide`/`fadeSwap` (20384–20412,
   20867), `goForward`/`goBack` (21071) read the stale index.
6. **Leaving the overview onto a slide skips `jumpTo`** (20510): no auto-fit,
   no `closeAnyExpansion`, no `restartAutoplay`; O, Enter, click, `gotoCommit`.
7. **Diagram steps inside `::: overlay … from N` play while the card is
   hidden** (`chunkBeats` 20026 pushes `diag` beats without `at`). *Read*:
   the same for a `--- from N` segment.
8. **A figure focused in the cockpit closes on the projection only**, on any
   knob press (`applyRemoteStateNow` begins with `unfocusFigure()`, 19465);
   the cockpit's +/−/0 then send `figure-view` into nothing.
9. *Read*: the audience's `pan` overwrites a frozen cockpit's `manualPan`;
   the laser pointer ignores freeze.

## S5 – Prompter, reader, PDF

1. **The prompter's rate limits can be bypassed by a page with the nonce**
   (`souffleuse.mjs:653` `clampSpan` credits 2 s per message measured from
   the previous say; the 8 s slide floor is on page-supplied `elapsed`,
   1176; build.js:28784). 73 ticks in 20 s, dry run. Clamp on wall time.
2. **The prompter log is unbounded** (build.js:28815, `dismissed()`,
   `hello()`): `chunkId`, `hintId`, `how`, `stt.engine`, `lang` uncapped.
3. **Divider notes and their `@mm:ss` never reach the prompter**
   (`souffleuse.mjs:377–379`, `notes: [], marks: []`), so its drift differs
   from the cockpit's.
4. **`--prompter-replay` ignores `dismiss` lines** (`souffleuse.mjs:1468–1489`).
5. **A hostile highlights import breaks the reader for good**
   (build.js:12499, 11874, 11766, 13029): `type: "constructor"` / block kind
   `__proto__` throw in `place()`; the entry is already stored, `save()`
   persists it, `placeAll()` throws on every load. Whitelist with own-property
   checks or `Object.create(null)`.
6. *Read*: **the reader's key is only the folder's name** (build.js:29675):
   two `week1/` lectures share a store.
7. **`%` in a fragment link kills the slide export** (`pdf-core.mjs:574`,
   `decodeURIComponent` unguarded; `docCollect` guards it).
8. **`#constructor` is rewritten to `function Object()…`**
   (`pdf-core.mjs:575, 597`, plain-object link table).
9. *Read*: **the app can export a stale PDF** (`desktop/main/pdf.js:81`):
   auto off, save, auto on, export – no rebuild, not flagged.
   `desktop/test/pdf.test.mjs:101–103` asserts the wrong assumption.

## S6 – Diagram editor and tails

1. **Renaming can retarget references to another element**
   (`editor.mjs:5928`, `dgeRenameMap` moves every id starting `id-`): rename
   `a` → `c` turns `emph a-b-0` (a sibling `bars a-b`) into `emph c-b-0`. A
   step named like the element is renamed too; an element named `w`, `at`,
   `left` can never be renamed.
2. **Resizing `same w as X` is always refused** (`diagram-core.mjs:3474`,
   `same` missing from the reference-introducing words in `createSpanTable`).
3. **Paste in place fails when the copy includes the figure's first
   element** (`dgePaste` ~7640: no placement for the anchor).
4. **Delete, paste and step edits report success after a refusal**
   (`editor.mjs:4620, 7682, 7125` ignore `dgeSetSource`'s result;
   `dgeAppendLine` has the guard).
5. **Deleting an element with a dependent chain is always refused**
   (4586–4618, only direct dependents removed).
6. **Multi-line statements are handled by their first line**: deleting a
   `table` is refused, duplicating one drops its rows, a `sequence` cannot be
   duplicated or pasted.
7. **Pasting into another figure can create a duplicate name**
   (`dgeFreshName` 4242 ignores the other clipboard names).
8. **A huge grid crashes the build with a stack** (`tails.mjs:507, 518`,
   `validUnit` unbounded, `1e+21x5`); lint is clean.
9. **`claim()` reports the "cannot happen" placement cycle** with
   `box a-0` plus `bars a … right of a-0`. Low.

## S7 – Release blockers

1. **CI sees the diagrams views as stale**: built with cwebp, the runner has
   none (`release.yml:102`). Build tracked views reproducibly regardless of
   encoder (e.g. `--no-optimize-images` for them, in release.yml and the docs)
   – encoder versions differ in bytes too.
2. **The release notes exceed GitHub's 125,000 characters** (~266,000;
   `release.yml:181–199` extracts the whole section). Consolidate the
   repeated `### Added` / `### Changed` / `### Fixed` headings and make the
   release body fit.
3. **Breaking changes not labelled**: chunk tails 1.0.0 ignored now refuse
   (`:2126–2137`), new nesting refusals (`:1664–1690`), every `---` is a beat
   (`:738`), `slide-numbers` default (`:2179`), plus whatever S3 adds.
4. **`package.json` and the lockfile are at 1.0.0** (`release.yml:45–53`).
5. **The browser suite last ran on CI on 2026-08-29** – run `browser.yml` on
   `main` before tagging.

## S8 – Documentation drift

- `docs/site/getting-started.html:421–422` "keeps building the same way, and
  that will not change" is false; it, its `.de` twin and
  `decoration.html:48–56` (+ `.de`) present post-1.0 features as unreleased.
- SECURITY.md:99–100 and README.md:357 "until 2.0.0 is tagged" wording.
- CLAUDE.md: "sixty" sections (70); CI "never builds" network-security and
  diagrams (release.yml does); `lectures/frame-lab/` called untracked (it is
  tracked, and the only reason `lint --strict` exits 2); "Twenty-four specs …
  twenty-one" (25 / 18); python-intro "36 chunks" (39, also README:254).
- CONTRIBUTING.md:67 gates "a fifth of a second" (2.4 s); :179–181 desktop.yml
  filter misses five files.
- README.md:136 documents `::: margin` and "Fourteen directives" (16);
  :245 cwebp "only if you use `--optimize-images`"; :231 "fourteen thousand
  lines" (32,062) and tests "only what a browser can break".
