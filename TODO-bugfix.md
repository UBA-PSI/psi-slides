# Bugs found and not yet fixed

One section per defect. Each says what was observed, what it costs an author,
where the code is, and what would have to change in the same commit. Delete a
section when it is fixed and the fix has a test.

---

## 1. A `_` in a `::: draw` label cannot be written literally

**Found while** rebuilding `lectures/python-intro` as figures. A pipeline box
labelled `collect_links()` drew as `collect` + a subscript `l` + `inks()`, and
`scan_page(link)` as `scan` + a subscript `p` + `age(link)`. The build exited 0,
`lint.js` reported nothing, and the slide looked like a font defect rather than
like something the source had asked for.

### What the code does

`dgSpans()` in `diagram-core.mjs` reads `_` and `^` as sub- and superscript
markers – deliberately, and for a good reason: these diagrams are full of `c_0`,
`m_1`, `MAC_k`, and full KaTeX inside an `<svg>` would need a `<foreignObject>`,
which takes the label out of the coordinate system the tween operates on.

The defect is that the marker has **no escape and no fallback**, and that it is
the only marker in that function without one. Measured against the current
`dgSpans`:

| written | what is drawn |
|---|---|
| `scan_page` | `scan`, subscript `p`, `age` |
| `scan\_page` | a literal backslash, then the same subscript |
| `a_{}b` | `ab` – the underscore is gone entirely |
| `MAX_RETRIES` | `MAX`, subscript `R`, `ETRIES` |
| `__init__` | subscript `_`, `init`, subscript `_` |
| `a*b`, `a~b` | `a*b`, `a~b` – **unmatched, so literal** |

The last row is the inconsistency. `*` and `~` are guarded by
`closes(marker, from)`, so a marker with no partner stays a character. `_` and
`^` take the very next character unconditionally.

**PRD.md §512 already claims the behaviour the code does not have** – *“An
unmatched marker stays a literal character”* – so this is a defect against a
written contract rather than a missing feature. Neither the
`psi-slides-figures` skill nor `figure-design.md` mentions the markers at all,
so an author working from those two has no warning either.

### What it costs

Any snake_case identifier is unwritable in a figure label: Python and C
function names, `robots.txt`-style constants, `MAX_RETRIES`, `__init__`,
`my_file.py`. This is not a corner of the vocabulary – a figure whose subject is
code is one of the things `::: draw` is for, and `lectures/python-intro` hit it
on the first such figure.

It also fails **silently in the direction that still draws a plausible
picture**, which is the class of failure this grammar refuses everywhere else:
`dgMeasure` measures the subscripted reading too (`scan_page` measures 62.5 px
against 75 px for nine ordinary characters at 15 px), so the box is sized to fit
exactly what is wrongly drawn and nothing looks out of place.

### What a fix would have to do

The narrow repair is one `\` escape in `dgSpans`, and the tempting wider one –
requiring `_{…}` braces – is a breaking change to a source format that already
carries `c_0` in `lectures/network-security` and `lectures/diagrams`. Prefer the
escape.

Whatever the shape, these have to move in the same commit:

- **`dgSpans()`** – recognise `\_`, `\^`, `\*`, `\~` and `\\`, emitting the bare
  character. All four, not only the two that are broken, or the escape itself
  becomes the next thing with an exception in it.
- **`dgMeasure()`** – it calls `dgSpans` and needs no change *provided* the
  escape is handled there and not at the emitter. Check that it is: measuring
  the escape character would widen every box that carries one.
- **`test/gates/semantics.mjs`** – a gate, not a browser spec: this is what the
  compiler decided, and it is readable out of the emitted spans in
  milliseconds. Assert both signs – `scan\_page` is one span, `c_0` is still
  two.
- **PRD.md §512** – restate the rule so it covers all four markers, and say how
  a literal one is written.
- **`.claude/skills/psi-slides-figures/SKILL.md`** and **`figure-design.md`** –
  the marker set is not mentioned in either, and it should be, because the trap
  is met while authoring rather than while changing the compiler.
- **`lint.js`** – nothing to do, and worth saying so: it imports tables from
  `diagram-core.mjs` and never a function, so it does not read label text at
  all. A linter warning here would need `dgSpans` itself, which is the bend the
  tables-only rule exists to prevent.

### Workaround until then

Keep underscores out of figure labels. `lectures/python-intro`'s
`#scanner-pipeline` does this deliberately and says so in a comment in the
block: the boxes carry the *shape* of the run (`every link on that page`, `one
visit per link`) and the prose in the pane beside the figure names the
functions. That is a better figure under `figure-design.md` rule 9 in any case,
so the workaround is not purely a loss – but it is a workaround, and a label
that genuinely has to say `asyncio.gather` beside a `TaskGroup` has nowhere to
go.

---

## 2. Nothing compares `docs/site/img/*.webp` against the lectures they came from

**Raised by** psi-slides-c7 while it held `docs/site/`, and verified here rather
than taken on trust: `pages.yml` runs `node docs/artifact/refresh-figures.mjs
--check` (line 83), which guards the two figure pages, and
`node docs/site/build-site.js _site` (line 97), whose two gates are that every
link on every page it writes resolves and that `index.de.html` still matches
`index.html`. Neither of those looks at `img/`, and `release.yml` names
`shoot-lib.mjs` only in a comment. So no job anywhere asks whether a screenshot
still shows the lecture it was taken from.

### What it costs

The screenshots are the site's whole argument – *every picture on it is a
picture of text*, in `docs/site/DESIGN.md`'s own words – so a stale one is not a
cosmetic problem, it is the page making a claim about the tool that the tool no
longer does. It has already shipped twice: `cockpit.webp` predated the clock
move, and six python-intro shots predated the `bold: plain` default.

It is also the exact shape of the rule `CLAUDE.md` already states about the
figure pages – *“a staleness gate nothing runs is a comment”* – applied to the
one output family that does not have one.

### Why it is awkward, and what a fix would have to weigh

A shot is not a pure function of `source.md`. It depends on the lecture source,
on `build.js`'s renderers and stylesheets, on `shoot.mjs`'s own rig and
viewport, and on the Chromium that drew it. **That is why the obvious gate –
recording each shot's source blob hash and comparing it in CI – is ruled out,
and the two real failures are what rule it out.** `cockpit.webp` predated the
clock moving to a large top-right button, a change in `build.js`'s cockpit
chrome; the six python-intro shots predated the `bold:` default changing from
`accent-bold` to `plain`, a change in a view default. Neither touched a lecture
source, so a source hash would have stayed green through both and fired only on
changes that never caused the problem. A gate that has never been right is worse
than no gate, because it is read as an assurance.

**Two later findings say the same thing from the other end, both from
psi-slides-c7's re-shoot (`e6d067f`).** A byte or pixel comparison over `img/`
would fire on neither of the real failures and on plenty of non-failures:
`cue-beat-0` changed while beats 1 to 3 did not, because the cockpit clock is
running when the shutter opens, so those frames differ in the seconds they show.
And `printed`, `handout` and `handout-plain` changed even though the two chunks
they frame were byte-identical, because the margin numbers are a deck-wide count
– the same reason the live shots moved.

**A re-shoot is also never `img/`-only, and that is a coupling worth knowing
before it costs an afternoon.** `docs/artifact/refresh-figures.mjs` inlines
`docs/site/img/editor.webp` into `figures-you-write.html` (its `SHOT` constant),
because that page fetches nothing at run time – so the moment `shoot.mjs`
rewrites `editor.webp`, that page is stale, and `pages.yml` runs
`refresh-figures --check` before it assembles the site. Shot and manual have to
travel in one commit or the deploy fails. It was found by bisecting three clean
worktrees looking for a break on `main` that was never there.

What is left is two things, and the second is the load-bearing one:

- **The chunk-id contract.** `shoot.mjs` addresses `#why-playwright`,
  `#playwright-install`, `#ns-a03`, `#cbc`, `#second-time` and the five
  decoration targets by id. A ten-line check that each still exists in its
  lecture would have caught a rename with no browser and no image work at all.
  `docs/artifact/README.md` records the same kind of contract for
  `figure-rules/`.
- **The rule, written down.** Beside the shot table in `shoot.mjs`, naming the
  *trigger* rather than the file: a change to the live views' chrome, to a view
  default, or to anything that moves a label or an extent means the shots are
  stale, whatever the lecture sources say. Both real failures are that sentence,
  and the paragraph explaining why a shot is not a pure function of `source.md`
  belongs there as the reason the manual rule stands – not as an obstacle for
  someone to route around later. It sits next to the
  paragraph explaining why the shots have to be reproducible, rather than being
  a thing everyone assumes somebody else's job.

  **The rule needs its threshold in the same breath, or it reads as “re-shoot
  on every commit”.** The test is whether the difference is visible *at reading
  size*: both drifts that embarrassed this site were – a clock that had moved,
  a bold style that had changed. A prose edit two tiles deep in the `overview`
  thumbnail is not, and re-shooting for it rewrites twenty shots, churns
  roughly eleven binaries, and drags the 1.4 MB manual along with it whenever
  `editor.webp` moves. So the working practice is to record a known-stale shot
  and let the next *visible* reason carry it, which is what psi-slides-c7 did
  with `ff26d6d`. A gate cannot make that judgement, which is one more reason
  this stays a written rule rather than a check.

Not this session's, and not `lectures/`' owner's to decide: it is a `docs/site/`
and CI question.
