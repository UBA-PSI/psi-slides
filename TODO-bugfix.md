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

