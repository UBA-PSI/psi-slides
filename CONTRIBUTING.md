# Contributing

Thank you for looking. Be aware of what this project is before you invest
time in it: one author, and a test suite that covers only what a browser can
break. It is used for real teaching, which is why it is public. Since 1.0.0
the **source format** is stable – a change
that stops an existing `source.md` from building the same way is a major
version – but the code behind it is rearranged whenever that helps.

## The most useful thing you can send

**A report from actually using it.** Build a lecture, present it once, and
tell us what broke or what you reached for and could not find. That is worth
more than a patch, because the format's blind spots only show up in a room.

Open an issue with: what you were doing, what you expected, what happened,
and – if the browser is involved – which browser and version. A `source.md`
that reproduces it is ideal.

## Before opening a pull request

Please open an issue first for anything beyond a typo. The format is
opinionated on purpose, and a change to the grammar has consequences in the
parser, the linter, the renderers, and every lecture already written. It is
kinder to agree on the shape before you write the code.

## Working on the code

```bash
npm install
node build.js lectures/tutorial/source.md   # build the self-referential tour
node lint.js lectures/                      # must be clean before you commit
npm run gate                                # the fast gates, seconds, see below
node test/run.mjs                           # the browser suite, see below
```

`npm test` runs the fast gates and then the browser suite, in that order, so a
compiler regression fails in a second rather than after four minutes.

**`node lint.js lectures/` is the gate**, and `node test/run.mjs` is the
safety net. The linter is zero-dependency and runs anywhere, so run it on every
commit. The suite drives built lectures in a headless Chromium and covers what
can only break in a built page, in three families: the navigation model, the
diagram editor's gestures and panel, and the geometry of an emitted figure. It
said "three things" for as long as it had three specs; it has twenty-two, and
577 assertions. It builds and serves the lectures itself, so it never reports
on stale HTML. It needs a browser (`$PSI_CHROME`, else the Playwright cache,
else the browser the host installed) and takes about five minutes.
`node test/run.mjs nav` runs the specs whose name matches.

`no page errors` is asserted by the runner after every spec rather than by
each spec, because it is an invariant of running one at all – it was a line
twenty-one specs remembered and one forgot, and that one swallowed console
errors for as long as it existed.

Run it after touching `AUDIENCE_JS`, the key map, `editor.mjs`,
`createSpanTable`, or anything that decides a diagram's `viewBox`. The header
of `test/harness.mjs` says how to write a spec that will not need rewriting
the next time a lecture is redrawn. It is not a unit-test suite and should not
grow into one: anything checkable without a browser belongs in `lint.js` or in
the fast gates below, where it runs on every commit instead of on the ones
somebody remembered.

### The fast gates

```bash
npm run gate                   # all of them, about a fifth of a second
node test/gates/run.mjs corpus # only the gates whose name matches
```

`test/gates/` is everything about the **figure language** that can be decided
without a browser. It needs no `npm install` and no Chromium, because
`diagram-core.mjs` and `lint.js` are both zero-dependency, and it runs on every
push in CI, which the browser suite cannot be: it needs `npm ci`, a Chromium
and five minutes. Where the suite *does* run is a version tag, in
`release.yml`, and on demand from `browser.yml` – start that one from the
Actions tab to put a branch through it before tagging. Five gates:

- **`refusals.mjs`** – 170 fixtures, each compiled through `diagram-core.mjs`
  *and* run through `lint.js`, asserting the two agree on every refusal. This
  is the gate that matters most, because `lint.js` re-implements the parsing
  contract by hand: a line the linter passes and the build refuses merges green
  and fails every later build, and CI lints two lectures whose figures the
  compiler is the only real judge of. A third of the fixtures are acceptance
  cases, because a linter *stricter* than the build is nearly as bad.
- **`accepts.mjs`** – one construct per shape the grammar offers, compiled.
  Every other check in the repository asks whether a refusal fires; this asks
  whether the grammar still accepts what it promises, which is the only
  direction a pass that adds refusals can fail in.
- **`semantics.mjs`** – what the emitted drawing *means*, as distinct from
  whether the source parsed. It exists because a green acceptance test made a
  wrong drawing look right: `accepts.mjs` carried a sequence `<->` and asked
  only whether the block compiled, which it did, drawing one arrowhead. Every
  assertion here reads the SVG back and asks what a reader would see. One
  block at the end reads no SVG – the span table, which is what a source means
  to the editor that rewrites it, and is decided by the compiler alone.
- **`corpus.mjs`** – every `::: draw` block in the four sources that carry
  figures still compiles, with no new compiler warning. Deliberately not a
  snapshot of the emitted SVG: text width here is estimated rather than
  measured, so a committed baseline churns on every layout constant and cannot
  tell an improvement from a regression. The geometric properties are asserted
  from a real browser by `test/figure-framing.mjs`, `figure-labels.mjs` and
  `figure-sequence.mjs`.
- **`step-classes.mjs`** – a `style` step can only change what a beat can
  carry. Derives both halves of its expectation from `DG_STEP_FIXED`, so the
  table and the check cannot drift.

A gate may carry a **pending** entry: a known defect, written as the assertion
that should hold once it is fixed, with the reason beside it. Pending entries
do not fail the run – but the day one starts passing it does, so the ledger
cannot fill up with things that were fixed years ago and nobody dared delete.
`npm run gate` prints them as `~`.

Read [`CLAUDE.md`](CLAUDE.md) first. It is written for an assistant but it is
the honest architecture guide: what lives where in `build.js`, which
invariants are load-bearing, and which mistakes are easy and expensive. In
particular:

- **`build.js` is deliberately one file.** Roughly two thirds of it is the
  CSS and runtime JavaScript that gets inlined into the outputs.
- **Everything inlined lives in a template literal.** A stray backtick, even
  inside a comment, ends the literal; an unterminated `/*` swallows the rest
  of a stylesheet; and a regex backslash must be doubled, because `\s` is an
  escape the build resolves before the browser ever sees it.
- **`lint.js` is zero-dependency and standalone.** It re-implements the
  parsing contract rather than importing it. When you change the vocabulary
  in `build.js`, change it in `lint.js` in the same commit. A linter that
  disagrees with the build is worse than no linter, because it is the gate.
- **Do not commit generated HTML.** The one exception is
  `lectures/tutorial/*.html`, tracked so the tour is browsable from the
  repository; rebuild and commit those whenever the tutorial source changes.

## Building and releasing

Two GitHub Actions do the work, and both are driven by a push. Nothing is
built or uploaded from a laptop, so the artefacts always come from the tagged
tree rather than from whatever happened to be in someone's working directory.

**Every push to `main` redeploys the project site.** `.github/workflows/pages.yml`
lints, builds the four published lectures from source, assembles `_site` with
`docs/site/build-site.js` and deploys it to GitHub Pages. Because the lectures
are rebuilt rather than copied, that job is also a build check: a change that
breaks the tutorial fails there. The `_site` directory is gitignored; to see
the site locally:

```bash
node build.js lectures/tutorial/source.md
node build.js lectures/python-intro/source.md
node build.js lectures/diagrams/source.md
node build.js docs/site/example/source.md
node docs/site/build-site.js _site
mkdir -p _site/tutorial _site/python-intro _site/diagrams _site/example
for l in tutorial python-intro diagrams; do
  cp lectures/$l/{audience,speaker,print,print-notes}.html _site/$l/
done
cp docs/site/example/{audience,speaker,print,print-notes}.html _site/example/
python3 -m http.server -d _site 8000
```

**A version tag publishes a release.** `.github/workflows/release.yml` fires on
`v*`, and it refuses to publish if the tag disagrees with `package.json`, if
the lint fails, if the tracked tutorial HTML is not what the current source
builds, or if the browser suite finds a regression – it runs there, last of
the checks because it is the only one that costs minutes. If that is a
surprise at tag time, it should not be: run `browser.yml` from the Actions tab
on the branch first. Then it attaches two archives, `psi-slides.tar.gz` and
`psi-slides.zip`. **Do not rename those assets**: the README and the site link
`releases/latest/download/psi-slides.tar.gz`, which only resolves while the
file is called exactly that.

Each archive is the repository tree at the tag – sources, every lecture, the
docs, the checked-in site fonts, `package.json` and the lockfile – plus the
four built HTML views for all four published lectures, so a reader can open
the tutorial straight out of the archive. Building their own still needs
`npm install`; the renderer depends on marked, Shiki and KaTeX, and the
archive does not pretend otherwise.

Cutting a release:

1. `node lint.js lectures/ docs/site/example/source.md` – clean.
2. Rebuild the tutorial and commit `lectures/tutorial/*.html` if they moved.
   The release job checks this and fails on a stale tour.
3. Run the browser suite – `node test/run.mjs`, or `browser.yml` from the
   Actions tab on the branch. The release job runs it too, and a tag is a bad
   place to learn that a spec is red.
4. Move the changelog's `## [Unreleased]` items into a new version section and
   update the two link definitions at the bottom. The release notes are cut
   from that section by heading, so the heading has to read `## [1.2.3]`.
5. Bump `version` in `package.json` to match.
6. Commit, then tag and push:

```bash
git tag -a v1.2.3 -m "psi-slides 1.2.3"
git push origin main v1.2.3
```

Pushing `main` redeploys the site; pushing the tag publishes the release. If
the release job fails, delete the tag on both sides (`git push --delete origin
v1.2.3`), fix, and tag again – a partially published release is worse than a
late one.

## Conventions

- En-dashes (`–`) in prose, never em-dashes.
- Typographic quotation marks in prose; straight quotes only in code, paths
  and frontmatter.
- Commits focused and one concern at a time, with a message that says *why*.

## Licence

Code contributions are accepted under the [MIT licence](LICENSE); lecture
content under [CC BY-SA 4.0](lectures/LICENSE), matching the rest of the
repository.
