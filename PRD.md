# Lecture Medium — Specification v0.1

A medium for live university lecturing that is neither slides nor document. The content lives on a bounded 2D plane as typographically composed chunks arranged in columns; the lecturer navigates by camera motion between chunks; the same source produces a printable study version. Authored in plain Markdown, rendered by a small amount of static HTML and JS, built by a small Node script. Designed to be written this week, iterated all semester.

---

## 1. Non-negotiables

These are the commitments. Everything downstream is subordinate.

1. **Plaintext Markdown source.** Diffable, durable, LLM-amenable, survives every tool we will use.
2. **No slides, no continuous essay.** Content is chunked and arranged spatially. Camera pans between chunks.
3. **Two views from one source:** live audience projection and printable study document. Same IDs, same chunks, different renderers.
4. **Live speaker view separate from audience view.** Speaker sees notes, next-chunk previews, lecture scrubber. Audience sees only what you push.
5. **Readable on any projector down to ~1024×768.** Text sizing is viewport-relative. The camera never shows more than roughly 15 line-heights of content at a time at the default zoom. This sets a hard density discipline.
6. **Zoomable with reflow, not pixel-scaling.** The app owns zoom via explicit hotkeys (`+` / `-` / `0`) that adjust a root-level type-scale multiplier; text reflows, never bitmap-scales. Native browser Ctrl+/- continues to work as a user preference because all sizes are in `rem`, but behavior across browsers is out of our control and the app's own hotkeys are the documented, tested interface. This is the single biggest reveal.js pain point to avoid.
7. **Typographic variance is the point.** Chunks look different from one another by design. Monotony is a failure mode equal to overload.
8. **No gratuitous ornament.** No accent left-borders, no gradients, no ubiquitous rounded corners, no glass, no drop shadows beyond hairlines. OKLCH palette, restrained, uchu-adjacent.

---

## 2. Content model

**Frame.** Each chunk is a *slide* — it occupies its own viewport-sized frame. There is no global 2D plane the camera pans across; the camera frames one slide at a time. This is the "slideshow with structure" model: each slide owns the screen, and visual variability lives *inside* the slide, not at the frame level.

**Column.** A vertical stack of related slides. Horizontal motion between columns signals a new sub-topic; vertical motion signals the next slide within the current sub-topic. Columns are visually isolated — the inter-column spacing is large enough that the neighboring column is fully off-viewport whenever the camera is framing any slide.

**Chunk.** The atomic unit of lecture content, rendered as one slide. Has a stable ID, an optional heading, a body, an optional structural tag (`principle`, `example`, `definition`, `question`, `figure`, `exercise`, `free`), a width class, optional expansions, and an optional author-editable annotation slot. The width class determines the slide's *internal* text-column max-width, **not** the frame size.

**Expansion.** Detail content (deeper explanation, worked example, answer to a question) that lives with its parent chunk, reached via a chevron affordance in the bottom-right of the slide. When opened, the slide's internal layout splits into two columns — content on the left, expansion on the right — without leaving the slide frame. Chevrons carry a 2–3 letter abbreviation (`Ex`, `Exp`, `Ref`, `?`, `Pf`, `Fig`, `Set`) derived from the expansion label.

**Annotation slot.** One author-editable text area per chunk, used for live speaker marginalia during a lecture (not for source-authored references — those belong in a `Ref` expansion). Hidden by default; revealed only when the speaker activates it (`N` key or click on the `+ note` affordance). When active, the camera pans the slide to the right and the annotation opens as a ~65-column box on the left (monospace by default, sans toggleable), allowing ASCII-friendly editing. `Esc` returns focus to the slide.

**Sketch slot.** A named live-editable region inside a chunk. Renders monospace text in the audience view; editable via textarea on the speaker view only (or embedded iframe for etherpad/collaborative cases).

**Placement algorithm (deterministic).** Given the ordered list of columns and, per column, the ordered list of chunks, positions are computed purely from source:

1. **Slide size.** Each chunk is rendered as a slide of `width = 100vw` and `min-height = var(--slide-min, 40vh)` — large enough to own the viewport but small enough that short chunks (e.g. a `question` or a `free`-narration transition) auto-size to their content and leave room for neighbor peek. Internal text column width is determined by the chunk's width class: `narrow = 22em`, `standard = 36em`, `wide = 52em`, `full = 72em`. Width classes control *content layout inside the slide*, not the frame.
2. **Column X.** Columns are placed left-to-right, separated by `column-gap = 8vw`. Because each slide is viewport-wide, this gap is always enough to fully isolate the neighboring column from the active one.
3. **Chunk Y within a column.** Slides stack top-to-bottom with `chunk-gap` — a tunable CSS custom property (default `4vh`, range `0vh`–`25vh`). Small values create a "flow" feel with neighboring slides peeking during transitions; large values enforce full slide isolation. The gap is a deliberate design knob, not a fixed rule.
4. **Camera.** The camera **translates only**; there is no `transform: scale()` at the camera level. On chunk change, the stage translates to place the active slide centered in the viewport. On annotation activation, the camera offsets right so the slide's left edge lands around viewport-X = 55%, revealing the annotation box on the left.
5. **Expansions.** When a chevron is clicked, the parent slide's internal CSS grid switches to a two-column layout (content left, expansion right). The slide frame itself doesn't move. Expansions do **not** nest — a `::: expand` cannot contain another (enforced by the parser and linter).
6. **Neighbor behavior.** Three modes, spec-configurable: `dim` (neighbors always at reduced opacity — currently ~`calc(1 - dim * 0.96)` ≈ 4%), `fade-after-settle` (neighbors briefly visible during the camera transition, then fade to `0` after the camera lands — gives continuity during motion, isolation at rest), `hidden` (always fully transparent). Default: **`dim`** — calibrated authoring runs found constant peek preferable to motion-only peek.
7. **Reading order and scrubber.** Source order: all chunks of column 0 top-to-bottom, then column 1, etc. Expansions are attached to their parent and do not occupy a separate scrubber slot.

This algorithm is pure: same source → same slide positions → same camera targets → same deep-link behavior across rebuilds and machines.

**Stable chunk IDs.** Every chunk carries an explicit `{#column-slug/chunk-slug}` attribute in source. IDs are frozen once authored; renaming a heading does not change the ID. Normal builds — including `--watch` — never mutate source. A separate, opt-in `build.js --assign-ids` one-shot mode generates IDs from current slugs for any chunk missing one and writes them back, resolving collisions. This keeps the rebuild loop pure and makes source the single source of truth. Every downstream feature — speaker sync, URL deep-links, print anchors, student references, linter — depends on these IDs being present and stable.

### 2.1 Structural tag vocabulary

The `## tag: Heading` prefix marks the chunk's structural role. This list is **exhaustive** — an unknown tag is a build error (§9), not a custom extension point. Adding a tag is a deliberate spec change, because each tag has visual treatment in the CSS and reading-order implications in the print view.

| Tag | Use |
|---|---|
| `principle` | A core claim or rule. Rendered with a thick rule above and small-caps label. |
| `definition` | A formal statement. Small-caps label, typically `.standard` width. |
| `example` | A concrete instance. Often `.wide`, often followed by a principle chunk. |
| `question` | A posed question, often paired with an `::: expand` answer. |
| `figure` | A visual-dominant chunk (image, diagram, ASCII sketch). Usually `.wide` or `.full`. |
| `exercise` | Student-facing task. Rendered with the exercise marginalia treatment in print. |
| `free` | Uncategorized narration. The only tag with no small-caps label and no rule above — intentionally typographically quiet. |

Tag is optional on a chunk; omitting `tag:` is equivalent to `free:` but renders identically without the label space reserved.

---

## 3. Source format

Single Markdown file per lecture. Conventions:

```markdown
---
title: Foundations of Anonymity
course: introsec-ss26
lecture: 07
---

# Motivation {#motivation}

## free: Why anonymity is not privacy {.narrow #why-anon-not-privacy}

Opening observation, narrated. **Core claim** inline as bold.

::: margin
Compare Pfitzmann & Hansen terminology paper.
:::

::: expand deep-dive
Long-form elaboration, revealed on chevron.
:::

## definition: k-anonymity {.standard #k-anonymity}

Formal statement. $k \geq 2$ inline math.

::: sketch k-anon-sketch
  ┌─────┬─────┬─────┐
  │ age │ zip │ dx  │
  └─────┴─────┴─────┘
:::

> note: Watch the room here — common confusion with l-diversity.
```

**Rules:**
- `# Heading` = column title.
- `## tag: Chunk heading` = chunk, with structural tag prefix. Tag is optional; width class and ID are attributes.
- Width classes: `.narrow`, `.standard`, `.wide`, `.full`. Default: `.standard`.
- `::: margin` and `::: expand <label>` are fenced divs.
- `::: sketch <sketch-id>` defines a live sketch slot with a stable id.
- `> note:` at the start of a blockquote marks a speaker note.
- Standard Markdown for everything else (lists, bold, italics, code, links).
- Images: `![](fig-id)` resolves to `images/fig-id.{svg,png,jpg}`; the build determines extension and dimensions.
- Math: `$inline$` and `$$block$$`, rendered by KaTeX at build time.

### 3.1 Parsing contract

Source is parsed to a single AST; no regex post-processing on rendered HTML. Pipeline:

1. **Frontmatter split** via `gray-matter`.
2. **Directive pre-tokenization.** A line-based pre-processor scans for fenced directives (`::: name args` opening, `:::` closing). It replaces each directive block with a placeholder token (e.g. `<!--DIR:0-->`) keyed into a side map, leaving the Markdown body with well-formed placeholders that `marked` will pass through as HTML comments. This runs *before* `marked` and cannot collide with standard fenced code blocks.
3. **`marked` with custom extensions.**
    - `heading`: parses `tag:` prefix on `##` and attribute tail `{.width-class #id}`. Unknown tags become parse errors (see linter errors).
    - `image`: recognizes bare `![](fig-id)` and `![](fig-id){.width-class}`; resolves to `<figure>` AST nodes with a `resolve-later` flag.
    - `blockquote`: a post-parse walker inspects each blockquote's first text child. If it matches the literal pattern `^note:\s`, the node is retyped as a `speaker-note` AST node; otherwise it remains an ordinary blockquote. There is no other overloading of blockquote syntax.
    - **Attribute tokenizer.** The trailing `{.class #id}` syntax on headings and images is Pandoc-style; `marked`'s core does not ship it. The build includes a ~30-line inline tokenizer that parses `{ ... }` at end-of-line into `{classes: string[], id?: string}` and attaches the result to the host AST node. This tokenizer is the one intentional divergence from plain Markdown.
4. **Directive reification.** The placeholders from step 2 are resolved in a single AST walk into typed nodes: `margin`, `expand` (with label), `sketch` (with slot id), `etherpad` (with url). Nested directives are rejected at this stage.
5. **Downstream passes** (ID validation, image dimension resolution, KaTeX, TOC, placement, renderers, linter) operate on the AST only — no string mangling of rendered HTML.

The `::: directive` syntax is the preferred form for anything non-trivial; `> note:` is a convenience shorthand for single-line speaker notes and is the *only* blockquote-based extension. If you need a blockquote whose text begins with the literal word "note:", escape it (`> \note:`) or use a fenced `::: note` directive (reserved synonym).

---

## 4. Visual language

Not templates. A small vocabulary of compositional moves.

### 4.1 Grid

Four column widths, expressed in `rem` so they reflow with zoom:

| Class | Width | Typical use |
|---|---|---|
| `narrow` | 18rem | Observations, pull quotes, short claims, marginalia-heavy chunks |
| `standard` | 28rem | Default prose, definitions, examples |
| `wide` | 42rem | Two-part chunks, inline figures, comparisons |
| `full` | 60rem | Large figures, process diagrams, full-width sketches |

Column width is the strongest compositional lever. Content of the same structural type looks entirely different in a `narrow` vs `wide` box without any per-chunk design work.

### 4.2 Typography

Type scale, used with discipline:

- `xs` (0.75rem) — marginalia, captions
- `sm` (0.875rem) — expansions, secondary detail
- `base` (1rem) — body
- `lg` (1.25rem) — chunk headings
- `xl` (1.75rem) — column headings
- `display` (2.75rem) — lecture title, reserved for title slides or pull statements

Weight palette: regular, medium, bold. Nothing else. Small caps for labels (`DEFINITION`, `EXAMPLE`, `NOTE`) via `font-variant-caps: all-small-caps`, not faked with CSS `text-transform`.

Fonts: one serif for body, one sans for labels and UI, one monospace for sketches and code. Self-hosted as variable fonts (WOFF2) so lectures remain durable across years. Reasonable starting set: Source Serif 4 or Spectral for body; Inter Tight or IBM Plex Sans for labels; IBM Plex Mono or JetBrains Mono for monospace. Avoid generic sans defaults.

**Root font size is viewport-relative:**

```css
:root {
  font-size: clamp(14px, calc(100vh / 40), 24px);
}
```

This anchors the entire scale to the projector's vertical resolution, keeping the ~15 line-heights budget regardless of 1080p vs 1024×768. On top of the clamp, the app applies a CSS custom property `--zoom` (default `1`) that the `+` / `-` / `0` hotkeys increment in fixed steps (e.g. 0.9, 1.0, 1.1, 1.25, 1.5). The effective root size is `calc(clamp(14px, 100vh/40, 24px) * var(--zoom))`. Because all widths are expressed in `rem`, text reflows at every step. Native browser Ctrl+/- also reflows (since no pixel dimensions are hard-coded) but is treated as a user-agent courtesy, not part of the contract.

**Density budget and zoom interaction.** The ~15 line-heights-per-chunk budget is defined and linted at `--zoom: 1.0`. At higher zoom steps, a `full` chunk's `60rem` width plus `14rem + 18rem` lanes may exceed the projector viewport width; the camera compensates by scaling out to fit, which cancels part of the zoom-in. This is by design — zoom is a readability tool for individual chunks, not a universal magnifier — but authors should know that zooming past `1.25` on `full`-width chunks gives diminishing returns. The linter emits a warning if a `full` chunk's content would not fit the camera frame at `--zoom: 1.5`.

### 4.3 Color

OKLCH palette, uchu-inspired, deliberately restrained. Calibrated for projector-distance readability (values observed from authoring sessions):

```css
--ink:        oklch(0.20 0.01 260);   /* body text — calibrated for back-of-room legibility */
--ink-soft:   oklch(0.62 0.01 260);   /* marginalia, captions, dimmed non-active chunks */
--paper:      oklch(0.98 0.00 0);     /* background */
--paper-warm: oklch(0.96 0.01 90);    /* dimmed background for unfocused surfaces */
--rule:       oklch(0.78 0.00 0);     /* hairlines */
--emph:       oklch(0.42 0.16 30);    /* bolded core claim text, sparingly */
```

`--ink-l` and `--ink-soft-l` are exposed as CSS custom properties so the lightness can be tuned in authoring without editing the color definitions. Both values (0.20 / 0.62) are the defaults that survived authoring and rehearsal — do not lighten `--ink` beyond ~0.25 without testing from the back of the actual lecture room.

Dimming of non-active slides goes to **opacity** (toward `0`), not to a color wash. Three modes: `dim` (always visible at `1 - 0.86 * 0.96 ≈ 4%` opacity), `fade-after-settle` (flash to full dim during camera pan, fade to 0 after), `hidden` (always 0). No background tinting, no blur — the slide frame is the isolation primitive.

### 4.4 Compositional moves

Because each slide fills the viewport and shares one frame, visual variability lives inside the slide. Three independent axes:

1. **Width class** → internal text-column max-width (`narrow 22em / standard 36em / wide 52em / full 72em`). A narrow chunk floats a tight column in whitespace; a full chunk fills the slide.
2. **Alignment** (`data-align="left" | "center" | "right"`) → where the text column sits within the slide horizontally. Left-anchored chunks feel like running prose; right-anchored feel like a closing remark.
3. **Per-tag treatment** — the canonical compositional vocabulary:
   - `principle`: thick rule above, larger body (1.2× zoom), larger heading. Pull-quote feel.
   - `definition`: hairline rule above, math blocks centered, tight body. Academic feel.
   - `question`: centered, heading huge (2.4× zoom), body small + soft. Pause feel.
   - `figure`: heading small + smallcaps, ASCII sketch dominates. Diagram feel.
   - `exercise`: `EXERCISE` smallcap label above, italic heading. Task feel.
   - `free`: no special treatment. Narrative prose.

Additional moves available inside the slide:

- **Bold core statement** inline in body, at most one per chunk.
- **Monospace sketch block** for ASCII figures.
- **Inline math** via KaTeX, display math via centered `$$` blocks.
- **Expandable detail** via a chevron in the bottom-right of the slide (label-abbreviated `Ex`, `Exp`, `Ref`, `?`, `Pf`, `Fig`, `Set`); opening splits the slide into content-left / expansion-right.
- **Annotation box** on the left, activated on demand, camera pans to reveal (see §2 annotation slot).

### 4.5 Collapse modes (projector-only)

The projector view can selectively hide parts of each slide's body to reduce information density while the slide is read aloud. Four composable modes:

| Mode | What remains visible |
|---|---|
| `full` | All body prose |
| `topic` | First sentence of each paragraph only |
| `bold` | Only `<strong>` phrases (in any paragraph) + headings |
| `topic+bold` | First sentence of every paragraph, plus any bold phrases in the rest |

Collapse applies to the *projector* stage only; the presenter view always shows the full text. The collapse setting is a lecture-time affordance, not a source-level decision — authors write the full prose once; the speaker chooses the collapse level per lecture.

### 4.6 Discipline

The 70/30 rule: roughly 70% of chunks use a quiet repeating vocabulary (body prose, standard width, `free` or `definition` tags). Roughly 30% take compositional risks (principle with thick rule, question centered large, figure with sketch, full-width chunk). Invert this and risk becomes the baseline; monotony returns through the opposite door. The playground's "anti-pattern" preset — every chunk widened, every tag promoted to `principle` — is the concrete visualization of this failure mode.

Density budget per chunk: body text should occupy no more than ~12 line-heights at default zoom, with slide padding ~14%. The linter enforces this.

---

## 5. Camera and navigation

**Motion vocabulary:**
- → (Right arrow or `L`): next column.
- ← : previous column.
- ↓ (Down arrow or `J`): next chunk in current column.
- ↑ : previous chunk.
- `Enter` or click chevron: expand and pan to the active chunk's expansion.
- `Esc`: collapse expansion, return to parent chunk.
- `T`: toggle TOC overlay (with keyboard navigation + fuzzy search).
- `B`: blank screen (press again to restore). A dead-simple attention reset.
- `Z`: toggle "zoom out" — see whole current column at a glance.
- `.` : push current speaker-view position to audience (in case views desynced).

**Camera implementation:** CSS `transform: translate()` on a stage `div`. **No `scale()` at the camera level** — each slide is rendered at its native viewport-matching size, and zoom is a text-size multiplier (§4.2), not a camera operation. This removes the reveal.js-style bitmap-scaling failure mode entirely.

Transition: **250ms**, `cubic-bezier(0.45, 0.0, 0.2, 1)`. Snappy by lecture standards — a slower transition (e.g. 500ms+) reads as sluggish in a room; calibrated values came out at 250ms. Interruptible — pressing a new nav key mid-transition retargets without rebounding.

Three translation behaviors:
- **Next/prev column:** translate by one viewport width plus `column-gap` (8vw). Feels like a page turn.
- **Next/prev chunk within column:** translate by the slide's min-height plus `chunk-gap`. Feels like a scroll.
- **Annotation active (§2 annotation slot):** camera offsets right so the slide's left edge lands at viewport-X ≈ 55%, revealing the annotation box on the left. `Esc` returns the camera to slide-centered.

Zoom-induced overflow (when a chunk's rendered height exceeds viewport at high zoom) is handled by in-chunk scrolling via the mouse wheel — the camera pans Y within the chunk's bounds. Arrow keys always navigate between chunks; they never scroll within a chunk, so scroll and navigation are unambiguous.

**TOC overlay:** A fixed side panel triggered by `T`. Lists columns and chunks with their headings. Filters as you type. Enter jumps the camera there. This is load-bearing for live Q&A where you need to pan back to something.

**URL deep-links:** `?c=chunk-id` opens at that chunk. Useful for student references ("in the lecture, section 3.2...") and for resuming mid-lecture after a crash.

---

## 6. Zoom and reflow

The reveal.js failure mode is CSS `transform: scale()` applied to the whole deck — text rescales as bitmap, lines don't rewrap, narrow screens become unreadable.

This spec avoids that by:
- All sizes in `rem` or viewport units, not pixels.
- Layout via CSS Grid and Flexbox with relative tracks, not absolute widths.
- Root font-size is `clamp(14px, 100vh/40, 24px) * var(--zoom)`, where `--zoom` is controlled by the app's `+` / `-` / `0` hotkeys in fixed steps.
- On any zoom step, a `resize`-triggered pass recomputes chunk geometry and the current camera target so the focused chunk stays centered.
- `transform: scale()` is used **only** by the camera for pan/zoom motion, never for text sizing.
- Chunk widths are set in rem, so zooming in shows fewer chunks per viewport but keeps text at readable density.
- Native browser Ctrl+/- is not broken — since nothing is pixel-hard-coded, text still reflows — but it does not re-target the camera, so `+` / `-` / `0` are the documented, room-safe controls.

---

## 7. Speaker view

Separate browser window on laptop display. Opens via hotkey `S` from audience view. Synced via `BroadcastChannel` (no server).

**Architectural constraint.** `BroadcastChannel` is same-origin and same-browser-profile only. Audience and speaker windows must run on the same machine in the same browser — the typical setup is a lecturer's laptop with an HDMI-mirrored-or-extended display, audience on the external screen, speaker view on the built-in. Driving the audience view from one device and the speaker view from another (e.g. tablet speaker view, projector audience view) is **out of scope** for Phase 0–2. A WebSocket-based sync mode is deferred to Phase 3 if the single-machine setup turns out to be a real limitation in teaching practice.

**Layout (three panels):**
1. **Current chunk large** — same rendering as audience, middle pane.
2. **Next previews** — thumbnails of the following 2–3 chunks in reading order.
3. **Notes pane** — speaker notes for the current chunk, independently scrollable. Can scroll ahead or back in notes without affecting audience.

**Controls:**
- Lecture scrubber at bottom: timeline of all chunks, click to jump.
- "Push to audience" toggle: by default, navigation from speaker view moves the audience. Toggle off to browse notes privately without moving the projector.
- Timer: elapsed lecture time, discretely shown.
- Sketch slots: editable textarea for any sketch slot the current chunk contains. Typing here updates the audience view live.

**Persistence:** current chunk ID, timer state, and sketch slot contents persist to `localStorage` per lecture file every 5 seconds. On crash or accidental close, reopening restores position. A small but genuine safety feature for live teaching.

### 7.1 Annotation slot UX (in-viewport)

Every chunk carries an author-editable annotation slot intended for live speaker marginalia — notes, ASCII diagrams, references added mid-lecture. Independent of the speaker view (§7) which runs in its own window. This section specifies the interaction.

**DOM anchoring.** The annotation box is a child of `.chunk-content`, not `.chunk`. This means the slot is positioned relative to the *visible text column* (which varies by width class and layout archetype), not the slide frame. Across a `narrow` pull-quote, a `wide` side-by-side definition, and a `full` sketch-hero figure, the annotation always sits just to the left of the content, with uniform gap.

**Geometry.** Positioned with `right: calc(100% + 2.5vw)` inside `.chunk-content`. Width `21vw`. Top aligned with content's top. Font: monospace (`JetBrains Mono`) by default for ~65-column ASCII, sans toggleable.

**State model.**

| State | Trigger | Visual |
|---|---|---|
| No content, active chunk | — | Dimmed `+ note` affordance in the annotation position |
| No content, not active | — | Nothing |
| Has content, not editing | `N` pressed previously, then `Esc` / blur | Annotation visible, `opacity: 0.4`, in slide's left margin. Camera does **not** pan — slide stays centered. |
| Editing | `N` or click on annotation | Annotation at `opacity: 1`; camera pans so content's left edge is at viewport 33%, revealing full annotation on the left |

The rule separating "has content" from "editing" is critical: a chunk that has a note continues to feel like a normal slide, with the note peeking from the left margin at reduced opacity. Only active editing shifts the camera.

**Focus management.**
- `N` on the active slide → starts annotation (creates if empty, re-focuses if exists). Textarea receives focus.
- `Esc` while editing → blurs textarea; camera returns to slide-centered.
- Click on the annotation's textarea region → focuses it (editing).
- Click on slide content while editing → blurs annotation (returns to slide).

**Growth.** Textarea is a single line initially (`rows=1`, `min-height: 1.5em`, `overflow: hidden`). On input, a listener sets `height: auto; height: scrollHeight px` — grows one line at a time as text wraps or Enter is pressed. No scrollbar inside the textarea. In print view the same textarea grows to fit entire content without an inner scroll.

**Not for references.** Source-authored citations belong in a `Ref` expansion (right lane chevron labeled `Ref`), not in the annotation slot. The slot is reserved for speaker marginalia.

**Persistence.** Annotations are keyed by `chunk.id + lecture.id` and persist to `localStorage`. Once written, they survive reloads until deliberately cleared.

---

## 8. Live elements

Three kinds of live interaction, one architecture.

**Pre-authored sketches.** Inline fenced monospace blocks in the source. Nothing live; they just render. Covers 80% of your ASCII drawings — the ones you knew you'd draw when preparing.

**Live co-constructed sketches.** `::: sketch <id>` in source creates a named slot. Audience view renders it as read-only monospace. Speaker view renders it as editable textarea (monospace, fixed-width, no autocomplete). Typing on the speaker side propagates to audience in real time via BroadcastChannel. Slot contents persist keyed by sketch-id + lecture-id, so last semester's sketch reappears next semester (or you clear it deliberately from a menu).

**Etherpad / shared editing.** Same `::: sketch <id>` mechanism, but with `::: etherpad <url>` as an alternative fence. Renders an iframe of the shared pad in both views. Audience sees the pad; you contribute from whichever device you use.

**Polls and live quizzes.** Reserved for later. The architecture is the same — a typed slot with an ID. Concrete choice deferred; candidates are embedded Mentimeter/Poll Everywhere (works but proprietary), a minimal self-hosted WebSocket poll server (~200 lines), or piggybacking on the university LMS if it has an API.

---

## 9. Build system

Single Node script, target <400 lines. Dependencies: `marked`, `katex`, `gray-matter`, `cheerio`, [`@chenglou/pretext`](https://github.com/chenglou/pretext) (build-time text measurement), and whatever font-loading primitive pretext needs in Node (typically `node-canvas` or equivalent). Nothing else — no bundler, no framework, no headless browser.

**Steps, in order:**

1. **Parse frontmatter and Markdown.**
2. **Chunk ID validation.** For each `##` heading, require an explicit `{#id}` attribute. Missing IDs are a build error with a listed suggested assignment per chunk. Normal builds and `--watch` never rewrite source. A separate `build.js --assign-ids` mode computes `column-slug/chunk-slug` for any chunk missing an ID, resolves collisions by appending `-2`, `-3`, …, and writes the attributes back. `--assign-ids` is idempotent on already-annotated sources and exits non-zero if anything was changed so CI can detect drift.
3. **Image shorthand resolution.** `![](fig-id)` → resolve to `images/fig-id.{ext}`, read dimensions, inject `width`/`height` attributes to prevent layout shift. Optional width hint: `![](fig-id){.wide}`. A sibling convention `![](sketch-id.txt)` inlines a monospace text file as a sketch.
4. **Math pre-rendering.** KaTeX renders `$...$` and `$$...$$` at build time. No runtime LaTeX flash when panning. KaTeX's emitted output carries explicit metrics on display-math containers; these are captured for the geometry pass.
5. **Geometry pass.** For every chunk, every text block (heading, body paragraph, margin note, expansion body, monospace sketch) is measured via [pretext](https://github.com/chenglou/pretext) against the self-hosted WOFF2 font metrics at zoom 1.0 and the chunk's declared width class. Math heights come from KaTeX metrics; image heights come from file-dimension reads (step 3). Heights are summed per chunk; the §2 placement algorithm then runs deterministically over the height map. The build emits each chunk's resolved geometry as CSS custom properties on the element: `--chunk-x`, `--chunk-y`, `--chunk-height`, plus per-column `--column-x` and `--column-track-width`. The audience, speaker, and print renderers consume these properties directly — there is no client-side measurement pass, no "ready" promise to gate camera moves on, and no BroadcastChannel buffering. Deep-links resolve on first paint.
6. **TOC generation.** Walk H1/H2, strip tags, emit JSON embedded in the page for the TOC overlay.
7. **Render views.** Produce `lecture.html` (audience), `speaker.html` (speaker view, loads same data), `print.html` (linear, expansions inlined, no speaker notes, no camera — designed for PDF export via browser).
8. **Linter.** Split into integrity errors (build fails, non-zero exit) and compositional warnings (build succeeds, reported on stderr).

   **Errors — break the build:**
   - Missing required frontmatter field (`title`, `course`, `lecture`).
   - Chunk missing an ID (every deep-link, speaker-sync message, and print anchor depends on it).
   - Duplicate chunk ID within a lecture.
   - Dead image reference (`images/fig-id.*` not found).
   - Orphaned sketch ID: speaker textarea referencing an undeclared slot, or a `::: sketch` slot never mentioned by id in the source structure.
   - Unknown structural tag on a `## tag:` heading (typo-catcher; the tag vocabulary in §2.1 is exhaustive).
   - Nested directive of any kind (`::: expand` inside `::: expand`, `::: margin` inside `::: expand`, etc.). Directives do not nest — the parser and placement algorithm both rely on this.

   **Warnings — succeed but surface:**
   - Chunk exceeding the ~15 line-heights density budget at standard width.
   - Column wider than `full` allows.
   - Column with only one chunk (probably belongs to a neighbor).
   - `full`-width chunk mixed with `narrow` chunks in the same column (compositional smell; track width becomes dominated by the full chunk).
   - Ratio of risk chunks (pull quote, drop initial, full figure) to total exceeds the 70/30 discipline threshold.

**No bundling, no minification, no transpilation, no framework.** Browser loads the output HTML directly. Edit source, save, refresh.

**Dev mode:** `node build.js --watch` rebuilds on save. A tiny WebSocket triggers browser reload. ~30 extra lines. This is the *only* WebSocket in the entire stack — used exclusively for dev reload. Runtime audience↔speaker sync uses `BroadcastChannel`, not a server (see §7). Production-rendered output has no WebSocket dependency.

**`--assign-ids` workflow.** When an author adds a chunk without an ID, the normal `build.js --watch` fails with a diff showing the suggested IDs. The author runs `build.js --assign-ids` once (which writes the IDs into source), commits the result, and resumes editing. CI runs `--assign-ids` as a dry check: if it would have changed source, CI fails — this catches PRs that add chunks without running the init step. Because `--assign-ids` is the only path that mutates source, the dev loop stays pure and the ID-generation story is one explicit, recoverable step, not a hidden side effect.

---

## 10. Aesthetic constraints — what NOT to do

These are as important as the positive rules. They are the failure modes.

- **No accent-color left borders** on admonitions, callouts, or notes. Use typography (small caps label, hanging position, rule above) instead.
- **No gradients** anywhere. Flat tones only.
- **No ubiquitous rounded corners.** Sharp corners by default. At most `border-radius: 2px` on specific elements if ever.
- **No glassmorphism, no blur, no translucency** for UI surfaces.
- **No drop shadows** except a single hairline under overlays (TOC, expansion). No fuzzy soft shadows.
- **No generic sans-serif body** (no Inter-as-default, no system-ui as the main reading face). Body is serif or a distinctive sans with real personality.
- **No centered body text.** Left-aligned, ragged right.
- **No bullet lists as the default body form.** Prose first; lists only when content is genuinely enumerable.
- **No emoji as icons.**
- **No unicode box-drawing for UI chrome** (sketches yes, interface no).
- **No dark mode ornament** — a dark mode exists for evening lectures, but it uses the same restraint as the light mode, inverted through OKLCH, not a separate "cool" theme.

---

## 11. Roadmap

### Phase 0 — This week (Week 1 MVP)

Deliverable: one real lecture taught in the new medium.

**Scope reduction vs. full spec.** Phase 0 deliberately ships a *subset* of the source format and skips the build pipeline. Authors stick to this subset so that the eventual §9 build can ingest Phase 0 sources unchanged:

- Single HTML + single JS file, no Node build script.
- Hand-author Markdown with hand-written IDs and explicit `{.width-class}` attributes just this once.
- Parsing is client-side `marked` with a minimal inline tokenizer for the `{.class #id}` attribute tail and the `::: expand` / `::: margin` / `::: sketch` fences. The full §3.1 parsing contract and AST pipeline is Phase 1 work.
- Layout is **runtime-measured** via `getBoundingClientRect` in Phase 0 — no pretext, no build-time geometry. Deep-links are gated on a `ready` promise; BroadcastChannel messages are buffered until first measurement. This is explicitly the temporary path; §9 step 5 replaces it in Phase 1.
- Four chunk types available via CSS: narrow/standard/wide/full.
- Camera navigation (arrows, chevron click).
- Speaker window with notes pane via BroadcastChannel (single machine only, per §7 constraint).
- KaTeX runtime (accept the flash for now).
- Pre-authored ASCII sketches only. No live sketch yet.
- No print view yet.
- No TOC yet. Use URL deep-links as a fallback.
- No linter. Bad content breaks at runtime; fix and reload.

Target: ~400 lines HTML+CSS+JS, sitting in a folder with your Markdown.

### Phase 1 — Weeks 2–4

The goal of Phase 1 is to retire every "temporarily" in Phase 0.

- Node build script with §3.1 parsing pipeline and `--assign-ids` one-shot init.
- Build-time geometry pass via pretext (§9 step 5). Client-side measurement fully removed.
- Image shorthand resolution with file-dimension reads.
- Print view renderer.
- TOC overlay.
- Linter with both integrity errors and compositional warnings.
- Speaker view gains: live sketch-slot editing with mirror-to-audience, "push to audience" toggle, lecture scrubber, timer, crash-recovery `localStorage` persistence.
- Proper font loading (self-hosted WOFF2, loaded both in-browser and into the Node geometry pass).

### Phase 2 — Mid-semester

- Extract the pattern language that actually emerged from 4–5 hand-authored lectures.
- Document it as **concrete examples**, not abstract rules.
- LLM-assisted conversion of old slide decks. **Gate condition:** do not start until the pattern language has been authored by hand across ≥5 lectures AND open question §12.12 (LLM vs. variance) has an explicit acceptance criterion. Starting earlier risks locking in an impoverished vocabulary or, worse, teaching the LLMs to produce plausible-looking violations that are hard to unlearn.
- Dark mode variant.
- Etherpad iframe integration.

### Phase 3 — End of semester

- Polls/quizzes (architecture decision deferred until then).
- Multi-lecture project structure: how 14 lectures of a course share assets, cross-reference, and render as a coherent student resource.
- Poll/quiz slots (concrete implementation choice).
- Cross-lecture deep-links.

---

## 12. Open questions — things this spec deliberately does not decide

These are the things I'd flag as genuinely underspecified rather than just deferred. Worth thinking about before they bite.

1. **Crash recovery during a live lecture.** Persistence to `localStorage` is in the spec, but what's the actual recovery ritual when the laptop freezes mid-lecture? Reboot, reopen browser, restore from URL + localStorage — do you trust that enough for a live room? Might need a backup printed handout as the true fallback. Worth deciding policy explicitly.

2. **Dark mode lighting policy.** Evening lectures with dim lecture halls vs bright daytime. The spec says both exist but doesn't define when to switch. A tiny hotkey toggle (`D`) is easy; the harder question is whether the print view and student web view follow suit, and whether figures need dark-mode variants.

3. **Student-facing web study view.** The spec has `audience.html`, `speaker.html`, `print.html`. Is there also a `study.html` — a web version for students that's different from both audience (no camera, all chunks visible) and print (scrollable, interactive expansions)? I think yes, but we haven't designed it. Probably the easiest win: print view + clickable chevrons for expansions.

4. **Poll/quiz architecture.** Named as a slot, implementation deferred. But polls are exactly the live element that makes the "why come to lecture" problem go away, so deferring too long weakens the whole pitch.

5. **Multi-lecture project structure.** A full course has 14 lectures. How do they share a styles file, a fonts folder, cross-reference each other, and render as a coherent course-wide student resource? Not just 14 separate HTML files in a folder — there should be a course index, navigation between lectures, and probably a single semester-wide PDF.

6. **Cross-references between lectures.** "Recall from lecture 3" — does that resolve to a link students can click? Implies chunk IDs are globally unique across a course, which is a small but real design decision.

7. **Font licensing and durability.** Self-hosting is in the spec. Actual font choices are suggestions. Pick two or three and commit — "we'll decide later" is how projects end up with six half-chosen fonts.

8. **Figure authoring pipeline.** Images work via shorthand, but where do the SVG figures come from? If you're converting from existing slide decks, there's an ecosystem question (Excalidraw, tldraw, Figma, hand-drawn scanned) worth deciding early so figures are editable long-term, not flattened PNGs.

9. **Accessibility baseline.** Not discussed at all. Keyboard navigation is in; contrast from OKLCH should be fine; but screen reader semantics for camera-moved content, and whether the print view is the canonical accessible version, deserve a paragraph.

10. **Performance ceiling.** Nothing in the spec says how many chunks a single lecture can hold before CSS transforms start stuttering on a 5-year-old laptop. Probably 200 chunks is fine, 1000 is not, but worth benchmarking with a dummy lecture before discovering it mid-lecture.

11. **Versioning across semesters.** You teach the same course again next year with 30% revised content. Is that a new lecture file, a Git branch, a tagged release? Small decision, but shapes the folder structure.

12. **The tension between visual variance and LLM-batch conversion.** If the pattern language is genuinely expressive, LLMs will produce plausible-looking violations. If it's tight enough to constrain LLMs cleanly, it's probably too rigid to avoid monotony. This is the single biggest open question and probably only resolves through authoring real content.

---

## 13. Anti-spec — what this is not

To prevent scope creep and keep the project shippable:

- Not a presentation tool. No remote control apps, laser pointer, live-feed integrations.
- Not a publication platform. No CMS, no server, no accounts.
- Not a note-taking tool for students. They receive the print PDF or study page.
- Not a concept-map tool. Relations between chunks are implicit in spatial layout and narration, not stored as typed edges (for now — could revisit).
- Not a LaTeX replacement. Math is supported; it's not a mathematical typesetting project.
- Not collaborative authoring. One author per lecture file; Git handles any collaboration needed.