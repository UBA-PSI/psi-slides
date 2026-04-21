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
6. **Zoomable with reflow, not pixel-scaling.** Browser Ctrl+/- reflows layout. This is the single biggest reveal.js pain point to avoid.
7. **Typographic variance is the point.** Chunks look different from one another by design. Monotony is a failure mode equal to overload.
8. **No gratuitous ornament.** No accent left-borders, no gradients, no ubiquitous rounded corners, no glass, no drop shadows beyond hairlines. OKLCH palette, restrained, uchu-adjacent.

---

## 2. Content model

**Plane.** A bounded 2D stage. Content is positioned on it in a column-major grid.

**Column.** A vertical strip of related chunks. A column is a sub-topic. Horizontal motion (right) signals a new sub-topic; vertical motion (down) signals the next chunk within the current sub-topic.

**Chunk.** The atomic unit of lecture content. Has a stable ID, an optional heading, a body, an optional structural tag (`principle`, `example`, `definition`, `question`, `figure`, `exercise`, `free` — the last one is a deliberate "uncategorized narration" type), a width class, and optional margin notes, expansions, or sketch slots.

**Expansion.** Detail content (deeper explanation, worked example, answer to a question) that lives near its parent chunk, collapsed behind a chevron affordance. Clicking the chevron pans the camera to the expansion and reveals it. Always positioned to the **right margin** of the parent.

**Margin note.** Short marginalia (citation, observation, qualification) positioned to the **left margin** of the parent chunk. Visible by default, smaller type.

**Sketch slot.** A named live-editable region inside a chunk. Renders monospace text in the audience view; editable via textarea on the speaker view only (or embedded iframe for etherpad/collaborative cases).

**Stable chunk IDs.** Generated on first build as `column-slug/chunk-slug`, written back to source as explicit attributes, frozen thereafter. Every downstream feature — speaker sync, URL deep-links, print anchors, student references, linter — depends on this. Renaming a heading must not break IDs.

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

This anchors the entire scale to the projector's vertical resolution, keeping the ~15 line-heights budget regardless of 1080p vs 1024×768. Ctrl+/- in the browser adjusts a multiplier on this, so reflow works correctly.

### 4.3 Color

OKLCH palette, uchu-inspired, deliberately restrained. Six tones, no brand color.

```css
--ink:        oklch(0.25 0.01 260);   /* body text */
--ink-soft:   oklch(0.45 0.01 260);   /* marginalia, captions */
--paper:      oklch(0.98 0.00 0);     /* background */
--paper-warm: oklch(0.95 0.02 90);    /* dimmed background for unfocused chunks */
--rule:       oklch(0.80 0.00 0);     /* hairlines */
--emph:       oklch(0.40 0.15 30);    /* highlighted core claim text, used sparingly */
```

No second accent color. No gradients. Dimming unfocused chunks uses a single shift of text color toward `--ink-soft` plus reduced opacity on marginalia and expansions. Not a background wash, not a blur.

### 4.4 Compositional moves

These are the moves available for visual variance. Each chunk uses a subset:

- **Hanging marginalia** in the left margin.
- **Expandable detail** in the right margin, behind a chevron.
- **Pull quote** breaking out of the column with larger type.
- **Hairline rule above** (continuation) vs **thick rule above** (new movement).
- **Vertical whitespace** as composition, not padding.
- **Monospace block** for ASCII sketches.
- **Inline figure** aligned to text.
- **Full-bleed figure** for `.full` chunks.
- **Dropped initial** for the first chunk of a column (rare).
- **Bold core statement** inline within body, at most one per chunk.

### 4.5 Discipline

The 70/30 rule: roughly 70% of chunks use a quiet repeating vocabulary (body prose, occasional marginalia). Roughly 30% take compositional risks (pull quote, large figure, unusual width, dropped initial). Invert this and risk becomes the baseline; monotony returns through the opposite door.

Density budget per chunk: body text should occupy no more than ~15 line-heights at default zoom. The linter enforces this.

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

**Camera implementation:** CSS transforms on a stage `div`. Each navigation sets `translate()` and `scale()` targets computed from the target chunk's geometry. Transition: 400ms, `cubic-bezier(0.4, 0.0, 0.2, 1)`. Interruptible — pressing a new nav key mid-transition retargets without rebounding.

**TOC overlay:** A fixed side panel triggered by `T`. Lists columns and chunks with their headings. Filters as you type. Enter jumps the camera there. This is load-bearing for live Q&A where you need to pan back to something.

**URL deep-links:** `?c=chunk-id` opens at that chunk. Useful for student references ("in the lecture, section 3.2...") and for resuming mid-lecture after a crash.

---

## 6. Zoom and reflow

The reveal.js failure mode is CSS `transform: scale()` applied to the whole deck — text rescales as bitmap, lines don't rewrap, narrow screens become unreadable.

This spec avoids that by:
- All sizes in `rem` or viewport units, not pixels.
- Layout via CSS Grid and Flexbox with relative tracks, not absolute widths.
- Root font-size is `clamp(14px, 100vh/40, 24px)`, so it adapts to projector height.
- Browser Ctrl+/- multiplies root size; all chunk widths (in rem) shrink proportionally; text reflows inside; camera targets recompute.
- `transform: scale()` is used **only** by the camera for pan/zoom motion, never for text sizing.
- Chunk widths are set in rem, so zooming in shows fewer chunks per viewport but keeps text at readable density.

---

## 7. Speaker view

Separate browser window on laptop display. Opens via hotkey `S` from audience view. Synced via `BroadcastChannel` (no server).

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

---

## 8. Live elements

Three kinds of live interaction, one architecture.

**Pre-authored sketches.** Inline fenced monospace blocks in the source. Nothing live; they just render. Covers 80% of your ASCII drawings — the ones you knew you'd draw when preparing.

**Live co-constructed sketches.** `::: sketch <id>` in source creates a named slot. Audience view renders it as read-only monospace. Speaker view renders it as editable textarea (monospace, fixed-width, no autocomplete). Typing on the speaker side propagates to audience in real time via BroadcastChannel. Slot contents persist keyed by sketch-id + lecture-id, so last semester's sketch reappears next semester (or you clear it deliberately from a menu).

**Etherpad / shared editing.** Same `::: sketch <id>` mechanism, but with `::: etherpad <url>` as an alternative fence. Renders an iframe of the shared pad in both views. Audience sees the pad; you contribute from whichever device you use.

**Polls and live quizzes.** Reserved for later. The architecture is the same — a typed slot with an ID. Concrete choice deferred; candidates are embedded Mentimeter/Poll Everywhere (works but proprietary), a minimal self-hosted WebSocket poll server (~200 lines), or piggybacking on the university LMS if it has an API.

---

## 9. Build system

Single Node script, target <300 lines, dependencies: `marked`, `katex`, `gray-matter`, `cheerio`, nothing else.

**Steps, in order:**

1. **Parse frontmatter and Markdown.**
2. **Chunk ID pass.** For each `##` heading, compute `column-slug/chunk-slug`. If the heading already has an explicit `{#id}`, keep it. If not, generate, resolve collisions, **write the attribute back to the source file.** The source now carries stable IDs forever.
3. **Image shorthand resolution.** `![](fig-id)` → resolve to `images/fig-id.{ext}`, read dimensions, inject `width`/`height` attributes to prevent layout shift. Optional width hint: `![](fig-id){.wide}`. A sibling convention `![](sketch-id.txt)` inlines a monospace text file as a sketch.
4. **Math pre-rendering.** KaTeX renders `$...$` and `$$...$$` at build time. No runtime LaTeX flash when panning.
5. **TOC generation.** Walk H1/H2, strip tags, emit JSON embedded in the page for the TOC overlay.
6. **Render views.** Produce `lecture.html` (audience), `speaker.html` (speaker view, loads same data), `print.html` (linear, expansions inlined, no speaker notes, no camera — designed for PDF export via browser).
7. **Linter.** Warnings only, non-blocking:
   - Chunk without an ID after generation (bug).
   - Chunk exceeding density budget (~15 line-heights at standard width).
   - Column wider than `full` allows.
   - Expansion nested more than 2 deep.
   - Orphaned sketch ID (speaker textarea with no source declaration, or vice versa).
   - Dead image reference.
   - Structural tag not in known set.

**No bundling, no minification, no transpilation, no framework.** Browser loads the output HTML directly. Edit source, save, refresh.

**Dev mode:** `node build.js --watch` rebuilds on save. A tiny WebSocket triggers browser reload. ~30 extra lines.

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

- Single HTML + single JS file, no build.
- Hand-author the Markdown → hand-write IDs just this once.
- Four chunk types available via CSS: narrow/standard/wide/full.
- Camera navigation (arrows, chevron click).
- Speaker window with notes pane (BroadcastChannel).
- KaTeX runtime (accept the flash for now).
- Pre-authored ASCII sketches only. No live sketch yet.
- No print view yet.
- No TOC yet. Use URL deep-links as a fallback.

Target: ~400 lines HTML+CSS+JS, sitting in a folder with your Markdown.

### Phase 1 — Weeks 2–4

- Node build script with ID writeback and image shorthand.
- Print view renderer.
- TOC overlay.
- Linter with density budget.
- Live sketch slots (textarea → audience mirror).
- Persistence to `localStorage`.
- Proper font loading (self-hosted WOFF2).

### Phase 2 — Mid-semester

- Extract the pattern language that actually emerged from 4–5 hand-authored lectures.
- Document it as **concrete examples**, not abstract rules.
- Begin LLM-assisted conversion of old slide decks. Not before.
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