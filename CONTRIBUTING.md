# Contributing

Thank you for looking. Be aware of what this project is before you invest
time in it: one author, a suite of fast checks that need no browser, and a
browser suite for what only a built page can break. It is used for real teaching, which is why it is public. Since 1.0.0
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
compiler regression fails in seconds rather than after twelve minutes.

**`node lint.js lectures/` is the gate**, and `node test/run.mjs` is the
safety net. The linter is zero-dependency and runs anywhere, so run it on every
commit. The suite drives built lectures in a headless Chromium and covers what
can only break in a built page, in four families: the navigation model, the
geometry the live chrome leaves the slide, the diagram editor's gestures and
panel, and the geometry of an emitted figure (`test/README.md` lists them). It
said "three things" for as long as it had three specs; it has fifty-one, and
about 1,800 assertions. It builds and serves the lectures itself, so it never
reports on stale HTML. It needs a browser (`$PSI_CHROME`, else the Playwright
cache, else the browser the host installed) and takes about twelve minutes.
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
npm run gate                   # all twenty-one, about three seconds
node test/gates/run.mjs corpus # only the gates whose name matches
```

`test/gates/` is everything that can be decided without a browser: the
**figure language** first, and any hand-mirrored list one file keeps of
another's. It needs no `npm install` and no Chromium, because the modules it
loads and `lint.js` are zero-dependency, and it runs on every push in CI,
which the browser suite cannot be: it needs `npm ci`, a Chromium and twelve
minutes. Where the suite *does* run is a version tag, in
`release.yml`, and on demand from `browser.yml` – start that one from the
Actions tab to put a branch through it before tagging. [`test/README.md`](test/README.md)
says what each gate guards; five of them hold the figure language:

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
- **Do not commit generated HTML.** The exceptions are the views of
  `lectures/tutorial/` and `lectures/diagrams/` (all four) and of
  `lectures/decoration/` (`audience.html` and `print.html`), tracked so the
  tour and the two construct references are browsable from the repository.
  Rebuild them with `npm run build:tracked` and commit them whenever one of
  the three sources, or anything they render through, changes. That script
  passes `--no-optimize-images`: by default an inlined PNG or JPEG becomes
  WebP through whatever `cwebp` or `magick` the machine has, so a view built
  with an encoder is not the same bytes as one built on the release runner,
  which has none – and two encoder versions differ too.

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
`v*`, and it refuses to publish if the tag disagrees with `package.json` or
with `desktop/package.json`, if the lint fails, if a tracked view is not what `npm run build:tracked` makes
of the current source, if the release notes would not fit, or if the browser suite finds a regression – it runs there, last of
the checks because it is the only one that costs minutes. If that is a
surprise at tag time, it should not be: run `browser.yml` from the Actions tab
on the branch first. Then it attaches two archives, `psi-slides.tar.gz` and
`psi-slides.zip`, and the desktop app's packages. **Do not rename those
archives**: the README and the site link
`releases/latest/download/psi-slides.tar.gz`, which only resolves while the
file is called exactly that.

Each archive is the repository tree at the tag – sources, every lecture, the
docs, the checked-in site fonts, `package.json` and the lockfile – plus the
four built HTML views for all four published lectures, so a reader can open
the tutorial straight out of the archive. Building their own still needs
`npm install`; the renderer depends on marked, Shiki and KaTeX, and the
archive does not pretend otherwise.

**The desktop app is packaged by a third workflow.** `.github/workflows/desktop.yml`
runs on a push that touches `desktop/` or one of the engine files the app
stages (`build.js`, `diagram-core.mjs`, `tails.mjs`, `cue-cards.mjs`,
`commands.mjs`, `pdf-core.mjs`, `pulse-embed.js`, `editor.mjs`, `editor.css`,
`LICENSE`, the root `package.json` and lockfile – `desktop/test/stage-engine.test.mjs`
holds that filter against the staging script's own list, because it is the
third hand-written copy of it), or one of the two the app does not stage but
its smoke test runs (`pdf-export.mjs`, `chrome-path.mjs`, behind the parity
check): it runs the app's tests
and its smoke test, then builds unsigned packages for macOS, Windows and Linux
and attaches them to the run as artefacts, for testing. Run by hand from the
Actions tab (`workflow_dispatch`), it is also how a package between two
releases is made.

**From 2.0.0 the app ships on the engine's tag, at the engine's version.**
`desktop/package.json` carries the same version as `package.json`, and
`release.yml` calls `desktop.yml` as a reusable workflow and attaches the three
platforms' packages to the same release as the two archives. The jobs are
ordered so the release is created once and whole: `check` compares the tag
with both `package.json` files and cuts the release notes; `engine` (every
engine check, then the archives) and `desktop` (the app's tests, its smoke
test, then the packages) both need it and run side by side; `publish` needs
all three and is the only job that writes to the release. If any of them
fails, `publish` does not run and there is no release at all – not an engine
release without its app. The tag stays: "Re-run failed jobs" on the run
retries a flaky runner and then publishes, or delete the tag, fix and tag
again. `gh release create` with assets makes a draft, uploads and only then
publishes, so an upload that fails leaves a draft to delete, never a
half-published release. The asset names carry no version (`artifactName` in
`desktop/package.json`), so the site links
`releases/latest/download/psi-slides-builder-mac-arm64.dmg` and the link
is the package that was tested; `publish` checks that all five are there
before it creates anything.

**There is no separate desktop pre-release any more.** Up to 2.0.0 the app
had its own 0.x version and its own `builder-<version>` tag, which ran
`desktop-release.yml` and attached the packages to a pre-release. That
workflow is gone: with one version for both, a pre-release of the app between
two engine releases would need a version neither of them has, and a tag
`release.yml` refuses. A package to try between releases is the artefact of a
`desktop.yml` run, started by hand if no push has run it. The `builder-0.1.x`
pre-releases stay on GitHub as they are. Do not push a `v*` tag with a
suffix (`v2.1.0-beta.1`) to get a beta either: `release.yml` creates releases
without `--prerelease`, and `releases/latest/download/` would hand every
reader of the site a beta engine.

**The site's download links never change.** They point at
`releases/latest/download/<asset>`, and the asset names carry no version, so
a release needs no edit on the site. What they do depend on is timing:
`pages.yml` redeploys the site on every push to `main`, and until
`release.yml` has published the new release, `latest` is the previous one.
So the tag goes first and `main` follows once the release is out (step 6
below): the site deploys in about four minutes while `publish` waits for the
engine job's browser suite, about twenty, so pushing the two together still
left the site describing a version the links did not deliver for that long,
and an asset the previous release did not carry was a 404 – longer if the
release failed. The link gate in `docs/site/build-site.js` resolves internal
targets and fragments; it does not fetch an external URL, so it cannot see
this. Once `release.yml` has published all seven assets, check them
(`gh release view v<version> --json assets`, or a
`curl -sIL -o /dev/null -w '%{http_code}'` per link on
`getting-started.html`).

**The runners are pinned** – `ubuntu-24.04` everywhere, plus `macos-26` and
`windows-2025-vs2026` in the desktop matrix – rather than `-latest`, so the
move of `ubuntu-latest` to Ubuntu 26 on 2026-10-19 changes nothing here. To
move one, change the label on a branch and run the browser suite
(`gh workflow run browser.yml --ref <branch>`) and, for the matrix,
`desktop.yml` before the next tag: release.yml relies on measured properties
of the image (Chrome at `/usr/bin/google-chrome`, no cwebp or magick, xvfb and
poppler-utils from apt), and a runner image that moves the browser fails the
release, not a push. A mac label must stay arm64, or the `mac-arm64` asset
names stop matching.

**The macOS release is signed and notarised on the maintainer's machine**, not
in CI – `npm run dist:signed` in `desktop/`, with the Developer ID
certificate in the keychain and the three notarisation variables in a
gitignored `desktop/.env`, exactly as the Booklet Tool is released;
`desktop/README.md` has the steps. Nothing of that is a repository secret.
The signed package is uploaded over CI's unsigned one, under the same name:
`gh release upload v<version> "desktop/dist/psi-slides-builder-mac-arm64.dmg" --clobber`,
and the `.zip` the same way.

**`npm run dist:signed` notarises the app, not the disk image.** Read its log:
it signs `psi-slides Builder.app`, notarises and staples *that*, and only then
builds the `.zip` and the `.dmg` around it. So the app inside both is stapled
and launches without a prompt, but the `.dmg` – the file that actually carries
the quarantine bit off a download – has no signature of its own, and
`spctl -a -t open --context context:primary-signature` on it says
`rejected: no usable signature`. Close that before uploading:

```bash
cd desktop
codesign --force --sign "Developer ID Application: <name> (<team>)" --timestamp   dist/psi-slides-builder-mac-arm64.dmg
set -a; . ./.env; set +a
xcrun notarytool submit dist/psi-slides-builder-mac-arm64.dmg   --apple-id "$APPLE_ID" --team-id "$APPLE_TEAM_ID"   --password "$APPLE_APP_SPECIFIC_PASSWORD" --wait
xcrun stapler staple dist/psi-slides-builder-mac-arm64.dmg
spctl -a -vvv -t open --context context:primary-signature   dist/psi-slides-builder-mac-arm64.dmg    # expect: accepted, Notarized Developer ID
```

The `.zip` needs none of this and cannot take a ticket of its own; the app it
holds is stapled, which is what `xcrun stapler validate` on the extracted
bundle confirms. Both checks are worth running before the upload rather than
after, because the upload is what people download.
Windows has no code-signing certificate and stays unsigned; Linux packages
are not signed by convention.

Cutting a release:

1. `node lint.js lectures/ docs/site/example/source.md` – clean.
2. `npm run build:tracked`, and commit the tracked views if they moved. The
   release job runs the same command and fails on a stale view.
3. Run the browser suite – `node test/run.mjs`, or `browser.yml` from the
   Actions tab on the branch. The release job runs it too, and a tag is a bad
   place to learn that a spec is red.
4. Rename the changelog's `## [Unreleased]` heading to the new version, open
   an empty `## [Unreleased]` above it, and update the two link definitions
   at the bottom. The release notes are cut from that section by heading, so
   the heading has to read `## [1.2.3]`. GitHub takes 125,000 characters for
   a release body at most, and the job checks the size before it builds
   anything. A section that would not fit opens with a `### Breaking` list
   and a `### Highlights` list: the body is then those two plus a link to
   `CHANGELOG.md` at the tag. Give each of `### Added`, `### Changed`,
   `### Removed`, `### Fixed` and `### Security` one heading per section, so
   the full section stays readable too.
5. Bump `version` to match, in `package.json` and in both places in
   `package-lock.json`: `npm version --no-git-tag-version 1.2.3` does all
   three and neither commits nor tags. Run the same command in `desktop/`,
   for `desktop/package.json` and its lockfile; the release job refuses a
   tag that either `package.json` disagrees with.
6. Commit, then tag and push the tag alone. The tag is on the commit that
   will be `main`, so `release.yml` builds exactly what the site will
   describe. Wait for its `publish` job to go green, then push `main`, which
   deploys the site:

```bash
git tag -a v1.2.3 -m "psi-slides 1.2.3"
git push origin v1.2.3
gh run watch "$(gh run list --workflow release.yml --limit 1 --json databaseId -q '.[0].databaseId')" --exit-status
git push origin main
```

Pushing `main` first, or with the tag, puts a site that describes the new
version in front of download links that still hand out the previous one. If
a job of the release run fails, nothing is published and `main` waits. A
runner that failed for no reason of the tree's is retried with "Re-run failed
jobs"; otherwise
delete the tag on both sides (`git tag -d v1.2.3`, `git push --delete origin
v1.2.3`), fix, and tag again – a partially published release is worse than a
late one.

7. Upload the signed macOS packages over CI's unsigned ones (see above), and
   check the site's download links resolve. They need no edit.

## Conventions

- En-dashes (`–`) in prose, never em-dashes.
- Typographic quotation marks in prose; straight quotes only in code, paths
  and frontmatter.
- Commits focused and one concern at a time, with a message that says *why*.

## Licence

Code contributions are accepted under the [MIT licence](LICENSE); lecture
content under [CC BY-SA 4.0](lectures/LICENSE), matching the rest of the
repository.
