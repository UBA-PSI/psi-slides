# psi-slides

One Markdown source, three HTML views: a live **audience** projection, a **speaker** cockpit with notes and a preview strip, and a document-style **print** copy. Built for teaching.

Status: phase 1, single-user dev. Interfaces are still shifting; the lectures under `lectures/` are the canonical examples of what the tool currently supports.

## Setup

Node 20 or newer, a clean clone, then:

```bash
npm install
```

That installs three runtime deps (`gray-matter`, `marked`, `shiki`) and one dev dep (`ws` for the live-reload server). Nothing else is required – the output HTML is self-contained, no build step at read time.

## Build a lecture

```bash
node build.js lectures/python-intro/source.md
```

Writes `audience.html`, `speaker.html`, `print.html` next to the source. Open any of them directly in a browser; they are static files, no server needed.

Watch mode for authoring:

```bash
node build.js lectures/python-intro/source.md --watch
```

Rebuilds on every save and pushes a reload message over WebSocket to all open tabs.

Image assets are inlined automatically when the referenced images sum to under 10 MB, so a small lecture builds straight to a single shareable HTML file. Raster assets become `data:` URIs; SVGs are spliced as inline `<svg>` elements (with per-instance ID prefixing and `@scope`-wrapped styles) so they inherit the page's theme variables and re-color on the `A` theme cycle. Larger decks fall back to external `assets/` paths; force the choice with `--inline-images` or `--no-inline-images`.

## Learn the tool

Build, then open `lectures/tutorial/audience.html`:

```bash
node build.js lectures/tutorial/source.md
```

Thirteen chunks over six columns – a guided tour that explains hotkeys and the source-file vocabulary *by being a live lecture*. Press `Space`, `Enter`, `O`, `T`, `/`, `S` as it asks you to. The source file (`lectures/tutorial/source.md`) is also a reasonable authoring reference.

Where to go next:

- `lectures/python-intro/` – a 36-chunk teaching lecture, the richest example of the layout vocabulary (`::: cols`, `::: side`, `::: marginalia`).
- `PRD.md` – design rationale: why three views, why the specific tag set, why reveals are off in print.
- `HANDOFF.md` – slice-by-slice build diary, including decisions deliberately *not* taken.
- `speaker.md` – speaker-view spec and the postMessage sync protocol.

## Author a new lecture

```bash
node build.js --new my-slug
```

Scaffolds `lectures/my-slug/source.md` with valid frontmatter, a title chunk, and one example chunk. Builds cleanly the moment it lands on disk; TODO markers make it obvious what to fill in.

Static checks before you commit:

```bash
node lint.js lectures/                     # all lectures
node lint.js lectures/my-slug/source.md    # one file
node lint.js lectures/ --strict            # warnings → exit 2
```

Flags unknown tags, duplicate or missing IDs, unclosed directives, word-count budgets, reveal overuse, and orphan columns. No build step required.

## Hotkeys

Press `?` in any live view for the full on-screen cheat sheet. The highlights:

- Arrows navigate; `Space` reveals segments; `Enter` / `1`–`9` open expansions; `Esc` backs out.
- `O` overview, `T` TOC, `/` search (inside overview).
- `C` collapse mode, `F` font, `A` accent theme.
- `N` audience-visible annotation; on the speaker: `Shift-N` private notes pane, `V` rotates the preview strip to the right edge, `Shift-P` toggles push, `.` force-pushes.
- `S` in the audience spawns the speaker window; the two views sync automatically.

## Directory layout

```
build.js          build + live-reload server
lint.js           standalone source linter
lectures/         one source.md per lecture, plus its assets/
  tutorial/       self-teaching tour – start here
  demo/           minimal reference
  wlab01/         outlining + scientific writing
  python-intro/   Python basics → Playwright scanner
PRD.md            product requirements + design rationale
HANDOFF.md        build diary, slice by slice
speaker.md        speaker-view spec and sync protocol
```
