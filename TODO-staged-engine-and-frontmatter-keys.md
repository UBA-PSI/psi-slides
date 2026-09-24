# RESOLVED – a file the packaged app does not ship, and a list nothing holds

Both items are done on `main`. The record is in `CHANGELOG.md` under
`[Unreleased] → Fixed`; this file is kept only so the investigation behind it
is not lost, and can be deleted.

## 1. `cue-cards.mjs` staged into the app

`'cue-cards.mjs'` is in `FILES` in `desktop/scripts/stage-engine.mjs`, and a
staged copy built from that list now builds all four views of
`lectures/tutorial` cleanly, `window.PSI_CARDS` included.

**The answer to the open question: both shipped pre-releases are affected.**
`cue-cards.mjs` landed in f6a793e (2026-09-08); `builder-0.1.0` (514f14c,
2026-09-09) and `builder-0.1.1` (4d0f0d4, 2026-09-10) both contain it and
neither stages it. And the breakage is total rather than partial – the read is
unconditional in `renderSpeaker` and throws before any view reaches disk, so
**every build in either shipped app fails** with an `ENOENT` stack. That is a
release note, and the CHANGELOG entry says it in those words. A `builder-0.1.2`
is the remaining action, and is not taken here.

The class is closed by `desktop/test/stage-engine.test.mjs`, in the desktop
suite as planned: it reads `build.js` and `stage-engine.mjs` as text and holds
every `new URL('./x', import.meta.url)` and every relative `import` against
`FILES`, plus the reverse. It fails with the fix reverted (verified), and
`desktop.yml` already runs that suite on push and PR.

## 2. `KNOWN_FRONTMATTER_KEYS` held against `build.js`

`test/gates/frontmatter.mjs`, in the runner's list and in the two docs that
enumerate the gates. Green at 619b6f5 with **31 keys on both sides**, fails in
both directions when either side is edited (verified).

Two things the plan did not predict:

- **The scan over-reached on its first run**, exactly as the risk section
  warned, and the gate caught it rather than a person: `bodyHtml` came through
  as a frontmatter key because `renderTitleBlock({ ...frontmatter, bodyHtml,
  … })` writes that argument in *shorthand*, and the first skip-list regex only
  matched the `name: value` form. The fix and the reason are in the function's
  comment.
- **The "judgement call" second direction is asserted, not noted.** A key the
  linter knows and no renderer reads is an empty `TOOL_ONLY` allowlist in the
  gate. Widening the list's definition to "anything build.js reads" is then a
  decision made in one place with a reason attached, rather than a silence.

`lint.js`'s doc comment no longer recommends the grep that finds 23 of 31; it
points at the gate and says why the grep cannot work.

## 3. Seen on the way

`test/reproducible.mjs` is now named in both `CLAUDE.md`'s test section and
`test/README.md`, with what it guards and why it is neither a gate nor a spec.
