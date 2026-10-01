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

All nine fixed: 1 and 2 in `2897f5b`, 3 in `a68c6c6`, 4 in `cfd3ebb`, 5 in
`648a0d0`, 6 in `eebf58a` (the key gains a hash of the folder above; the old
key is migrated once), 7 and 8 in `32016f2`, 9 in `4dedd4b`.

## S7 – Release blockers

- **Before tagging, push `main` and run `browser.yml` on it** – the browser
  suite last ran on CI on 2026-08-29.
