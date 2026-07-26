# Contributing

Thank you for looking. Be aware of what this project is before you invest
time in it: Phase 1, one author, no test suite, and a source format that is
still moving. It is used for real teaching, which is why it is public, but it
is not yet a stable base for other people's work.

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
```

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

## Conventions

- En-dashes (`–`) in prose, never em-dashes.
- Typographic quotation marks in prose; straight quotes only in code, paths
  and frontmatter.
- Commits focused and one concern at a time, with a message that says *why*.

## Licence

Code contributions are accepted under the [MIT licence](LICENSE); lecture
content under [CC BY-SA 4.0](lectures/LICENSE), matching the rest of the
repository.
