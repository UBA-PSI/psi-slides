# Task: make psi-slides a first-class citizen

Brief for a fresh session. Goal: the project currently reads as a workshop
part. It is public on GitHub, it is the tool one person ran a whole semester
on, and its front door does not say what it is, who it is for, or when you
should not use it. Fix that.

Read `CLAUDE.md` first for repo conventions, then this file.

## What “first-class citizen” means here, concretely

Someone lands on the GitHub page cold. Within two minutes they should be able
to answer:

1. **What is this?** Not “a build script” – what artefact does it produce and
   what problem does that solve.
2. **What does it look like?** It is a *visual* tool with no screenshots.
   This is the single largest gap.
3. **Should I use it?** Honest fit and honest anti-fit. Someone who would
   hate it should be able to work that out without cloning.
4. **How do I start?** Install, build, open, and a link to something live.
5. **May I use it?** There is no LICENSE file. On a public repo that means
   nobody can legally reuse it.

## Verified starting state

Facts below were checked against the code, not assumed. Trust them; re-verify
anything you build a claim on.

**Repo metadata** (via `gh repo view UBA-PSI/psi-slides`): public, issues
enabled, `licenseInfo: null`, `homepageUrl` empty, description “Tooling for
creating a pragmatic mix of lecture slides and lecture scripts”.

**Absent entirely:** `LICENSE`, `.github/` (no CI, no issue templates),
`CONTRIBUTING.md`, `CHANGELOG.md`, any test directory. `package.json` has no
`engines`, `repository`, or `license` field and sits at version `0.1.0`.

**Stale claims to fix, not repeat:**

- `README.md` says “three HTML views” and lists three outputs. There are
  **four** – `print-notes.html` landed later.
- `README.md` describes the tutorial as “Thirteen chunks over six columns”.
  It is now **9 columns / 29 chunks**.
- `README.md`’s directory layout lists `lectures/wlab01/` as “outlining +
  scientific writing”. That directory exists but is **empty and untracked** –
  it has no `source.md`. Either remove the entry or restore the lecture.
- `README.md` never mentions `--optimize-images`, `--integrate-annotations`,
  or `--print-notes-only`, and its lint list predates the
  `figure-caption-redundant`, `oversized-asset`, and duplicate-explicit-block
  checks.
- `CLAUDE.md` calls `build.js` “~3,800 lines”. It is **6,227**.
- `PRD.md` §7 (around line 391) still frames the sync constraint in terms of
  `BroadcastChannel`. The implementation moved to `window.postMessage` over
  the opener relationship precisely because Chrome isolates BroadcastChannel
  between `file://` tabs. `speaker.md` §2–3 is current; PRD is not.
- The tutorial’s `::: slide` / `::: script` mode, the help overlay, and the
  overview fixes are documented in `PRD.md` §4.5/§5 and `speaker.md` but do
  not appear in the README at all.

**Hard constraints that belong in the docs because they decide fit:**

- **Single machine, single browser.** Audience and speaker windows sync via
  `window.postMessage` over `window.opener`. Driving the projector from one
  device and the cockpit from another does not work and is out of scope for
  the current phase (`PRD.md` §7).
- **Modern-browser floor.** The CSS uses `@scope` (7 sites), `:has()` (2),
  `oklch()` (76), and `text-wrap`. `@scope` is the binding constraint:
  Chrome 118+, Safari 17.4+, Firefox 128+. Verify these numbers before
  publishing them, and state the floor rather than implying it works
  anywhere.
- **Node for building**, nothing at read time – outputs are self-contained
  and open from `file://`.
- **`--optimize-images` needs `cwebp` or `magick`** on PATH. macOS `sips`
  cannot write WebP, so there is no zero-install fallback.
- **One 6,227-line `build.js`, no tests.** Deliberate (see `CLAUDE.md`), but
  a stranger deciding whether to depend on this deserves to know.

## Deliverables

### 1. LICENSE (do this first, it is the cheapest and most consequential)

Ask the user which licence – it is their call and affects re-use by other
lecturers. MIT and Apache-2.0 are the usual candidates for tooling; note that
`lectures/` contains actual course content, so the user may want a split
(code under a permissive licence, lecture prose under CC BY-SA or reserved).
Do not pick for them. Once chosen, add `LICENSE`, and the `license`,
`repository`, and `engines` fields to `package.json`.

### 2. README rewrite

This is the main artefact. English. Suggested spine, adapt as the content
demands:

- **One-paragraph what-and-why.** Lead with the artefact, not the mechanism:
  one Markdown file becomes a projector view, a presenter cockpit, a reading
  document, and a handout with the spoken notes folded in. The pitch is that
  slides and lecture script stop being two documents that drift apart.
- **Screenshots.** Four at minimum: audience view collapsed, the same slide
  uncollapsed, the speaker cockpit, and a print page. Build the tutorial and
  capture from it so the images stay reproducible. Put them in `docs/img/`
  and reference them relatively so they render on GitHub. A short animated
  capture of the overview board (`O`) and of collapse (`C`) would carry more
  than any paragraph, if you can produce one at a sane file size.
- **A live demo link.** `lectures/tutorial/{audience,print,speaker,print-notes}.html`
  are already tracked, so GitHub Pages can serve them with no build step.
  Propose this to the user, and if they agree, add the workflow and set
  `homepageUrl`. This converts “clone it to see it” into “click it”.
- **Quickstart** that a stranger can follow to a rendered lecture.
- **When to use it / when not to.** See below – this section is the point of
  the whole task.
- **Feature tour** at README depth, linking out rather than duplicating: the
  chunk grammar, the two collapse mechanisms, layout directives, reveal
  segments, expansions, notes vs annotations, the four views.
- **Docs map**: what `PRD.md`, `speaker.md`, `HANDOFF.md`, the tutorial, and
  `CLAUDE.md` are each for, so a reader knows where to go next.
- **Status and stability**, stated plainly: single-author Phase 1, format
  still moving, `{#id}` attributes frozen once authored, no tests.

### 3. The honest fit section

Do not write marketing. The most useful thing you can do for this project is
make it easy for the wrong user to walk away, because that is what earns
trust from the right one. Ground every line in something checkable.

**Good fit** – draft, verify and sharpen:

- Recurring lectures where the script and the slides should be one source.
- You want a handout that reads as prose, not slides printed six-up.
- You want slides in git: diffable, reviewable, greppable.
- Code-heavy teaching – Shiki highlighting is build-time, no runtime JS.
- You present from one laptop with an extended display.
- You care about typography and want a lecture that looks composed rather
  than templated.

**Bad fit** – be specific, this is the section people will actually thank you
for:

- You need `.pptx` or Keynote interop, or a corporate template.
- Co-authors need a GUI; the source is Markdown and nothing else.
- You need builds, transitions, or animation beyond reveal segments.
- You want the cockpit on a tablet and the slides on the projector –
  architecturally not supported.
- Your room’s browser is old or locked down; `@scope` sets a real floor.
- You need polls or live quizzes (named but deferred, `PRD.md`).
- You need mathematical notation – check whether KaTeX ever landed before
  claiming either way; `PRD.md` lists it as deferred and I did not verify.
- You want a tool with a test suite, releases, and more than one maintainer.

**Comparison.** A short, fair paragraph on how this differs from reveal.js,
Quarto, Beamer, and Marp – the tools a reader is actually choosing between.
The honest differentiator is the presenter cockpit plus the collapse
mechanism plus the print-notes handout from one source, not “it uses
Markdown”, which all of them do. Do not disparage them.

### 4. Tutorial extension

The tour is good on hotkeys and now covers the format broadly, but it teaches
the *tool*. Add a short closing column on the *method*: what makes a chunk
work, why the topic sentence carries the load, when to reach for `::: slide`
instead. The material exists – `../psi-slides-mylectures/recap-syntax-and-semantics.md`
has an authoring-conventions section written for exactly this. Adapt, do not
copy wholesale; the recap is a sibling-repo working document and can stay
longer and blunter than the tutorial should be.

Rebuild and commit `lectures/tutorial/*.html` – those four are tracked on
purpose so the tour is browsable from the repo.

### 5. Docs consistency pass

Fix the stale claims listed above. Reconcile `PRD.md` §7 with the shipped
postMessage design. Update the `build.js` line count in `CLAUDE.md`, or
better, drop the number so it cannot go stale again.

## Rules

- **Typography is not optional.** Zero em-dashes; en-dash (`–`) or `&ndash;`.
  Typographic quotes only: English `“…”`, German `„…“`, apostrophe `’`.
  Straight quotes stay untouched inside code fences, inline code, paths, and
  frontmatter. Verify fence-aware before committing – the recurring failure is
  a correct opening `„` closed with an ASCII `"`.
- **Language:** README, PRD, tutorial, speaker.md in English. `HANDOFF.md` is
  German, matching the existing diary.
- **Invent nothing.** No benchmarks, no adoption claims, no “used by”. If you
  want to state that a semester of lectures was built with it, confirm the
  scope with the user first. Every capability claim gets checked against the
  code or dropped.
- **Screenshots must be reproducible.** Capture from a lecture in this repo,
  and note in `HANDOFF.md` how they were produced so they can be refreshed.
- **Commit per deliverable**, focused messages. Do not bundle the licence
  with the README rewrite.
- Run `node lint.js lectures/ --strict` and rebuild all lectures before
  committing. Watch for `oversized-asset` if you add screenshots to a
  lecture’s `assets/` – the build now fails on assets over the 2 MB inline
  cap, which is intended.
- Screenshots for the README live in `docs/img/`, **not** in a lecture’s
  `assets/`, so they never get inlined into a deck.

## Verification

- Render the README markdown and check it on GitHub, not just locally –
  relative image paths and details/summary blocks behave differently there.
- Have the “when not to use” list read by the user. They are the only person
  who knows which of the limitations actually bit them in practice.
- Confirm every command in the README runs verbatim from a clean clone,
  including `npm install`.
- If a Pages demo lands, click every link from the deployed page.

## Out of scope

Do not refactor `build.js`, do not add tests, do not change the format, do
not touch `../psi-slides-mylectures/` beyond reading the recap for reference.
This is a documentation and positioning pass. If you find a bug, note it in
`HANDOFF.md` and leave it.

## Ask the user about

1. Licence choice, and whether code and lecture content should differ.
2. GitHub Pages demo: yes or no.
3. Whether to state publicly that the tool carried a full semester of
   teaching, and at what level of detail.
4. Whether `lectures/wlab01/` should come back or the README entry should go.
