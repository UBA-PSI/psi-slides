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

All four fixed: items 1, 2 and 4 in `351e6b9`, item 3 (the editor key) in `9afbe2d`.

## S3 – Parser, build and lint congruence

All twelve fixed; the seven **Breaking** bullets at the head of the first
`### Changed` and the first five bullets of the first `### Fixed` under
`[Unreleased]` in CHANGELOG.md say what changed. Item 10 has no linter half beyond `missing-id`, which
already refuses a chunk without an id.

## S4 – Live runtime

All nine fixed: 1, 2 and 9 in `f5b4b31`, 3 in `7511b53`, 4–6 in `0ecdf7f`,
7 in `722513e`, 8 in `9a48cc3`; `test/live-sync.mjs` reproduces each.

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
