# Handoff: branch `keynote-lessons`

Written at the end of one long session so the next one can start cold. The
long-form diary is `HANDOFF.md`; this file is the state, the map and the next
steps for this branch only. `CHANGELOG.md` under `[Unreleased]` has one entry
per change and is the authoritative list.

## State

| where | what |
| --- | --- |
| engine `~/Repositories/psi-slides` (also reachable as `~/r/psi-slides`) | branch `keynote-lessons`, 132 commits ahead of `main`, **not pushed, not merged** |
| content repo `~/r/psi-slides-mylectures` | `main`, keynote committed at `cb7462f`, tree clean |
| gates / settings / browser suite | 1230 / 895 / 1164, all green on the branch tip |
| `node lint.js lectures/` | 0 errors, 2 pre-existing warnings in the untracked `frame-lab` |
| tracked lecture views (tutorial, diagrams, decoration) | rebuilt and committed on the tip |
| `docs/artifact/refresh-figures.mjs --check` | up to date |

Uncommitted in the engine tree and **not ours**: 17 test files plus
`test/tmp.mjs`, another session's temp-dir rewiring. Leave them alone. They
made one `git merge` abort silently; see *Gotchas*.

## What the branch is

`~/r/psi-slides-mylectures/TODO-lessons-keynote-2036.md` (14 findings from
building a keynote) and `TODO-keynote-frames-review.md` (a critic's pass over
the rendered frames) were worked down, then `PLAN-figure-defaults.md` (a plan
written from three generations of the same keynote) was worked down to make the
good figure the default. The keynote `lectures/keynote-2036/` in the content
repo was rewritten onto each default as it landed and proved byte-identical
each time; its figure source lost about a third of its hand-written sizes.

Everything below is under `[Unreleased]` in the changelog. Drawings and 2.0.0
are unreleased, so syntax and defaults were free to move.

**Engine, by theme**

- *Reviewing a deck:* `--frames [DIR]` (every state as PNG plus contact
  sheets; read them before judging a deck), `--check-fit` with per-figure
  canvas/room lines and a body-type median, `--squint`.
- *Figures:* a fixed canvas per figure (column × 16 labels, `.stack` divider
  44.6 × 20; `frame WxH` / `frame none`), labels at body type, gap measured
  in labels with an arrow-safe default and `edge-short`, chains of peers
  share one size (`row`/`col`, `{.own}`, `same w as`/`same h as`, a default
  layer is a floor), `anchor`, `zone` with an inner band and `in <zone>`,
  `.left` anchors a free text, relabelled texts keep their pinned edge,
  `.bare` + `.dashed` refused, `emph` on `.bare` lights ink only, literal
  `_` in words, `table … unheaded` / `same as`, column alignment by
  `default box @t-col-N {.left}`, `lh` unit, typed padding, calmer dashes
  and real `.dotted`, elbow arrival runs, a quiet second register (`~line~`),
  contrast of `.muted`/`.dim` on tones, edge from a free coordinate documented.
- *Chunks and slides:* `statement:` type with a quiet italic line, `.full`
  wider than `.wide`, ink-edge alignment under `blocks: left`, one block gap,
  `.middle`/`.top` with a shape default (picture and statement slides open
  centred), `.center` reaches heading and footnote, footnotes ride their
  segment and never hyphenate, `hyphenate: all` spares centred prose and
  addresses, every `---` is a beat (`empty-beat` lint), `[Klick …]` in a note
  is a cue-card beat, dividers carry notes, `# Heading {.stack .bare}`.
- *Viewer:* `note-button: on|off` + `M`, `neighbours: dim|hidden`,
  `transition: pan|cut|fade`, `G` + number + Enter, `W` fullscreen
  (arms on the projection because a browser refuses a fullscreen request
  no gesture started there), `+ Notiz`.
- *Images:* `--optimize-images` sees backdrops and cover images and
  downscales to 2560 px as a last resort.

**Keynote** (`~/r/psi-slides-mylectures/lectures/keynote-2036/source.md`):
27 chunks, 95 states, the four parts open on the build plan
(`# … {.stack .bare #teil-N}`), five room figures on one `zone`/`in`
template, `transition: cut`, `note-button: off`, `neighbours: hidden`,
`hyphenate: all`. Backups of earlier generations sit beside it as
`source.md.bak-*` (ignored). Frames are ignored too; rebuild with
`node ../psi-slides/build.js lectures/keynote-2036/source.md --audience-only --frames --check-fit`.

## Next steps, in order

1. **Corpus onto the new defaults.** The reference decks still carry true
   canvas warnings: `network-security` 27, `tutorial` 7, `python-intro` 5,
   `spoken-talk` 2, `diagrams` 3 (`node build.js <deck> --audience-only 2>&1 | grep '^\[diagram\]'`).
   Redraw the figures the short way (the keynote is the worked example) or
   write `frame none` in `draw-defaults` where a deck is a catalogue
   (`diagrams`, `decoration` and `figure-rules` already do). `network-security`
   is the big one and the real test of the defaults on 36 foreign figures.
   Rebuild and commit the tracked views after (`release.yml` checks them).
2. **Docs consolidation.** The skills, `figure-design.md`, `CLAUDE.md`,
   PRD §2.1 and `HOUSE-STYLE.md` in the content repo were updated per slice;
   one pass now that the vocabulary stands, with the `[Unreleased]` entries
   as the checklist. Also the site: `docs/site/shoot.mjs` screenshots of the
   cockpit frames and the editor are stale.
3. **Keynote, author's calls:** the three other build plans onto the
   two-register label (`"1  Wer macht es grün?\n~abfedern~"`, changes what
   `emph` reaches); `[am Vortragstag eintragen]` on `#stand-heute`; the URL
   on `#schluss` as an accent link or plain grey; `#der-satz` stays a drawing
   because the note wants the definition *above* the claim (a `.lead` for
   `statement:` would change that – plan §2.11).
4. **Engine leftovers** from `PLAN-figure-defaults.md`: §2.8 dock alignment
   (measure first), §6 item 7 (canvas height traded against the caption
   lines under a figure), §6 item 4 (`.dotted .muted` is faint), `lh` spelling
   lost on an editor drag, `lint.js` counts positional beats on `title:`
   chunks that render none, `noteSegments` last-kept-segment fallback on an
   empty trailing segment.
5. **Merge to `main` and push** once the keynote frames are accepted. Each
   slice is one described commit; the merge commits name the slice.

## How to verify anything here

```bash
npm run gate                      # 1230, under a second
node test/settings.mjs            # 895, a few minutes, no browser
node test/run.mjs                 # 1164, ~10 min, one Chromium
node lint.js lectures/ --strict
node docs/artifact/refresh-figures.mjs --check
```

Any `AUDIENCE_CSS`/`AUDIENCE_JS`/`diagram-core.mjs` change makes the tracked
views stale: rebuild `lectures/{tutorial,diagrams,decoration}` and commit.

## Gotchas met this session

- **A `git merge` can abort silently** on another session's uncommitted
  files and still print `Updating a..b`. Check `git log -1 -- <file>` after
  a merge. To merge around foreign changes: `git stash push -u -m <tag> -- test/`,
  capture the SHA from `git stash list --format='%H %gs'`, merge, `git stash apply <sha>`,
  drop by tag. Never bare `stash`/`pop`.
- **Agent worktrees branch from `main`**, not from the checked-out branch;
  tell an agent to `git reset --hard keynote-lessons` first. Delete their
  branches after merging (`git branch --merged keynote-lessons`).
- **The disk filled up** with frames, scratch builds and Playwright
  profiles. Empty the session scratchpad between rounds; `--frames` writes
  ~9 MB per run.
- The `rtk` hook rewrites some git verbs inside agents; `/usr/bin/git` passes.
- Agents stall on long browser runs; run specs one at a time
  (`node test/run.mjs "<exported name>"` – the filter matches the exported
  `name`, not the file name).
- `~/r` is the same tree as `~/Repositories`.

## Start ritual for the next session

1. `git log --oneline main..keynote-lessons | head -40` and `CHANGELOG.md`
   `[Unreleased]`.
2. Read this file, then `PLAN-figure-defaults.md` §5 and §7.
3. Build the keynote with `--frames --check-fit` and look at two contact sheets.
4. Pick step 1 or 2 above; delegate slices to Opus agents in worktrees, one
   per slice, sequential when they share `diagram-core.mjs`.
