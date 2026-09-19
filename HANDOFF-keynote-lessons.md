# Handoff: branch `keynote-lessons`

Written at the end of one long session so the next one can start cold. The
long-form diary is `HANDOFF.md`; this file is the state, the map and the next
steps for this branch only. `CHANGELOG.md` under `[Unreleased]` has one entry
per change and is the authoritative list.

## State

| where | what |
| --- | --- |
| engine `~/Repositories/psi-slides` (also reachable as `~/r/psi-slides`) | branch `keynote-lessons`, 169 commits ahead of `main`, **not pushed, not merged** |
| content repo `~/r/psi-slides-mylectures` | `main`, keynote committed at `cb7462f`, tree clean |
| gates / settings / browser suite | 1249 / 903 / 1164, all green on the branch tip |
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

**Step 1 is done.** The five reference decks stood on 44 canvas warnings
between them and now stand on one, the box in `diagrams` `#typefit` that is
there to show the warning. `network-security` was the real test and it held:
36 foreign figures, about ninety written sizes gone, its smallest base labels
up from 10 px to the deck's 28 px body type. Four figures in the five decks
carry a `frame` of their own, each a specimen beside its own source or a
listing no arrangement folds. What the redraws cost, and what that cost
taught, is under *What a redraw of a whole corpus turned up* below.

1. **Docs consolidation.** The skills, `figure-design.md`, `CLAUDE.md`,
   PRD §2.1 and `HOUSE-STYLE.md` in the content repo were updated per slice;
   one pass now that the vocabulary stands, with the `[Unreleased]` entries
   as the checklist. Also the site: `docs/site/shoot.mjs` screenshots are
   stale in a way `--check-ids` cannot see – `python-intro`'s `#urllib-parse`
   lost ~380 px of height, which moves the camera for the ten shots framed on
   `#why-playwright`, and `overview` shows all five changed figures;
   `spoken-talk` `#second-time` was redrawn under the four cue-beat frames.
   `refresh-figures --check` drifts whenever `img/editor.webp` moves, so the
   re-shoot and that gate go in one slice.
2. **Keynote, author's calls:** the three other build plans onto the
   two-register label (`"1  Wer macht es grün?\n~abfedern~"`, changes what
   `emph` reaches); `[am Vortragstag eintragen]` on `#stand-heute`; the URL
   on `#schluss` as an accent link or plain grey; `#der-satz` stays a drawing
   because the note wants the definition *above* the claim (a `.lead` for
   `statement:` would change that – plan §2.11).
3. **Engine leftovers.** Done since this file was written: the cover canvas,
   `lint.js`'s beat count on a `title:` chunk, the brace label, an edge's
   `side` per beat, px in the canvas reports, the `lh` spelling an editor
   drag lost (§6 item 5). Still open, from
   `PLAN-figure-defaults.md` unless named otherwise: §2.8 dock alignment
   (measure first), §6 item 7 (canvas height traded against the caption lines
   under a figure – measured and decided: the flat sixteen stays), §6 item 4
   (`.dotted .muted` is faint), `noteSegments`' last-kept-segment fallback on an empty
   trailing segment (every `---` is a beat now, so an empty trailing segment
   is kept and `last` counts it – the rule that notes only in the last
   segment are chunk notes on beat 1 then stops firing), and
   `PLAN-overlap-census.md`, which is its own file because it was written
   from a measured case.
4. **Three figures are still behind their own slides**, all in
   `network-security`, all reported by `--check-fit` as notes rather than
   errors: `#ns-b18` at 16.8 px against 28.4 px of body type (0.59x),
   `#ns-a30` and `#ns-b20` at 18.7 px (0.66x). `#ns-b22` was the fourth and
   the worst at 0.46x and is done – its five-boxes-on-one-line chain became
   three columns with the two ssh ends lifted a band above them, and the
   `::: side` ratio went to `5:6`, which is as much as the figure can take
   before the listing beside it loses a character. That is the worked
   example for the other three. **Read the whole list, not the smallest
   entry**: this item said "one figure" for a while because the minimum was
   grepped for instead of the list.
5. **Merge to `main` and push** once the keynote frames are accepted. Each
   slice is one described commit; the merge commits name the slice.

## What a redraw of a whole corpus turned up

Worth reading before the next one, because none of it was visible from the
source and most of it was not visible from a contact sheet either.

- **A contact sheet is too small to review a figure.** The agent that redrew
  `network-security` read twenty contact sheets and reported no overlapping
  labels. `#ns-a41` was shipping with a line struck through by the outline of
  the box above it, invisible at thumbnail size and obvious at full size.
  **Read the last beat of every figure at full size**; the sheet is for
  finding the slide, not for judging it.
- **The build was silent about it, and that is a defect of its own.** The
  mechanism is measured and written up in `PLAN-overlap-census.md`: the text
  tolerance is 24 px on both axes, the offending axis of a strike-through is
  small by construction, and the px are the compiler's, which a figure scaled
  1.9x to its canvas turns into 46 px in the room.
- **A scanner for the same question, asked of the rendered page**, was
  written during that pass and is worth keeping:
  `exposure2.mjs` in the session scratchpad walks every beat in a browser and
  prints every text/box pair whose painted boxes partially overlap, with no
  tolerance. On `network-security` it prints four hits, all four legitimate
  (labels inside a plot frame, a chevron abutting the value it points at).
  Whether it belongs in `test/` is an open question.
- **`dim` is an opacity.** `#ns-b05` dimmed two filter boxes and the wire
  running behind them showed through and struck the word standing in them.
  Taking the accent off by name (`style fwd, fws {!tone-4 !emph}`) is the
  fix in a deck; whether `dim` should keep its fill opaque is a design
  question nobody has asked yet.
- **A spec that hunts a shape in a real lecture breaks when the lecture is
  redrawn, and the honest repair is to ask the drawing rather than to
  re-magick a number.** Eight assertions failed across two editor specs after
  the redraws. Both now compute what they need – the two box widths read off
  the source, the point where a lifeline stands alone – instead of holding
  coordinates that were true of one arrangement.
- **Two handles can coincide.** A waypoint sitting half a pixel from the
  edge's own endpoint hands the press to the endpoint, which reads as an
  editor defect and is not one.

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
