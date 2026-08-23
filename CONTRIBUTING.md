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
node test/run.mjs                           # the browser suite, see below
```

**`node lint.js lectures/` is the gate**, and `node test/run.mjs` is the
safety net. The linter is zero-dependency and runs anywhere, so run it on every
commit. The suite drives a built lecture in a headless Chromium and covers the
three things that can only break in a built page: the navigation model, the
diagram editor's treatment of an edge, and the waypoint round-trip. It builds
and serves the lecture itself, so it never reports on stale HTML. It needs a
browser (`$PSI_CHROME`, else the Playwright cache, else the system Google
Chrome) and takes about half a minute. `node test/run.mjs nav` runs the specs
whose name matches.

Run it after touching `AUDIENCE_JS`, the key map, `editor.mjs`, or
`createSpanTable`. It is not a unit-test suite and should not grow into one:
anything checkable without a browser belongs in `lint.js`, where it runs on
every commit instead of on the ones somebody remembered.

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
lints, builds the three published lectures from source, assembles `_site` with
`docs/site/build-site.js` and deploys it to GitHub Pages. Because the lectures
are rebuilt rather than copied, that job is also a build check: a change that
breaks the tutorial fails there. The `_site` directory is gitignored; to see
the site locally:

```bash
node build.js lectures/tutorial/source.md
node build.js lectures/python-intro/source.md
node build.js docs/site/example/source.md
node docs/site/build-site.js _site
mkdir -p _site/tutorial _site/python-intro _site/example
for l in tutorial python-intro; do
  cp lectures/$l/{audience,speaker,print,print-notes}.html _site/$l/
done
cp docs/site/example/{audience,speaker,print,print-notes}.html _site/example/
python3 -m http.server -d _site 8000
```

**A version tag publishes a release.** `.github/workflows/release.yml` fires on
`v*`, and it refuses to publish if the tag disagrees with `package.json`, if
the lint fails, or if the tracked tutorial HTML is not what the current source
builds. Then it attaches two archives, `psi-slides.tar.gz` and
`psi-slides.zip`. **Do not rename those assets**: the README and the site link
`releases/latest/download/psi-slides.tar.gz`, which only resolves while the
file is called exactly that.

Each archive is the repository tree at the tag – sources, every lecture, the
docs, the checked-in site fonts, `package.json` and the lockfile – plus the
four built HTML views for all three published lectures, so a reader can open
the tutorial straight out of the archive. Building their own still needs
`npm install`; the renderer depends on marked, Shiki and KaTeX, and the
archive does not pretend otherwise.

Cutting a release:

1. `node lint.js lectures/ docs/site/example/source.md` – clean.
2. Rebuild the tutorial and commit `lectures/tutorial/*.html` if they moved.
   The release job checks this and fails on a stale tour.
3. Move the changelog's `## [Unreleased]` items into a new version section and
   update the two link definitions at the bottom. The release notes are cut
   from that section by heading, so the heading has to read `## [1.2.3]`.
4. Bump `version` in `package.json` to match.
5. Commit, then tag and push:

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
