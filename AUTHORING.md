# Authoring a lecture in `lecture.html`

This document explains how to fill `lecture.html` with your own content.

Phase 0 is single-file: `lecture.html` holds the content, the rendering engine, and the keyboard runtime, all in one file. When we move to Phase 1 (the Node build script per PRD §9), content will live in a Markdown file; for now, edit the `LECTURE` object in the `<script>` block.

---

## 1. Quick procedure

1. Duplicate `lecture.html` — e.g. `introsec-07-anonymity.html`. Keep the original as your template.
2. Open the new file, search for `const LECTURE = {`.
3. Replace `title`, `columns`, and the `chunks` inside each column with your content.
4. Save. Open in any modern browser (Chrome, Firefox, Safari). No build step required.
5. Annotations and your current position auto-persist to `localStorage`, keyed by `LECTURE.title`. Change the title when you branch a lecture or you'll overwrite state.

For the live lecture:
1. Open the file in full-screen mode (F11 / ⌃⌘F).
2. Use the keyboard — no mouse needed during teaching. See the §5 shortcuts list.
3. Close the tab when done. Re-opening restores your position and any in-lecture annotations.

---

## 2. The `LECTURE` object

```javascript
const LECTURE = {
  title: 'Short unique name',           // used as localStorage key — unique per lecture
  columns: [
    {
      id: 'motivation',                 // column ID (lowercase, hyphens); stable for deep-linking
      heading: 'Motivation',            // currently unused in view, reserved for future TOC
      chunks: [
        { /* chunk */ },
        { /* chunk */ },
      ],
    },
    { /* column */ },
  ],
};
```

Columns group chunks into a sub-topic. Horizontal navigation (← →) moves between columns; vertical (↑ ↓) moves between chunks within a column.

---

## 3. Chunk schema

```javascript
{
  id: 'motivation/why-not-privacy',     // stable globally-unique ID; 'col-slug/chunk-slug' convention
  tag: 'free',                          // structural tag — see §3.1
  width: 'standard',                    // text-column width class — see §3.2
  align: 'center',                      // alignment inside slide — see §3.3 (optional, default 'center')
  layout: 'two-col',                    // layout archetype — see §3.4 (optional, default none)
  heading: 'Why anonymity ≠ privacy',   // shown as h2 (except in pull-quote layout which hides it)
  body: `<p>Prose with <strong>bold phrases</strong> and <em>italics</em>. Inline $k$-math.</p>`,
  sketch: `  ASCII art preserved\n  with whitespace`,  // optional monospace block
  expansions: [                         // optional — right-lane chevrons
    { label: 'reference', body: `<p>Pfitzmann & Hansen (2010)…</p>` },
    { label: 'example', body: `<p>…</p>` },
  ],
}
```

### 3.1 Structural tags

The `tag` determines the chunk's visual register. List is exhaustive; pick one:

| Tag | Visual treatment | Typical use |
|---|---|---|
| `principle` | Thick rule above heading, larger body text | A core claim, rule, or takeaway |
| `definition` | Hairline rule above, math-friendly tight body | Formal statements |
| `example` | No special treatment; use `side-by-side` layout if desired | Worked examples |
| `question` | Heading huge (2.4×), body small, centered | Posed questions (pair with `answer` expansion) |
| `figure` | Heading tiny smallcaps, sketch dominates | Diagrams and ASCII figures |
| `exercise` | Italic heading, `EXERCISE` label above | Student-facing tasks |
| `free` | No special treatment | Narrative prose, transitions |

Omitting `tag` is equivalent to `free`.

### 3.2 Width classes

The width controls the *internal* text-column max-width inside the slide frame, not the slide itself. Every slide fills the viewport; the width class determines how tight or spread the content is.

| Class | max-width | Looks like |
|---|---|---|
| `narrow` | 22em | Tight column floating in whitespace — pull quotes, short questions |
| `standard` | 36em | Default prose density |
| `wide` | 52em | Two-paragraph explanations, examples |
| `full` | 72em | Content fills edge-to-edge |

### 3.3 Alignment

`align` controls where the text column sits inside the slide:

| Value | Position |
|---|---|
| `center` (default) | Text column centered, whitespace on both sides |
| `left` | Text column anchored left, whitespace on the right |
| `right` | Text column anchored right, whitespace on the left |

Vary `align` across chunks to avoid every slide feeling identical.

### 3.4 Layout archetypes (optional)

Use one per chunk to break up the default "heading + body centered" rhythm:

| `layout` | What it does |
|---|---|
| *(omitted)* | Default: heading above, body below, left-aligned inside the text column |
| `two-col` | Body flows into two columns with a vertical rule between them (short-line reading) |
| `side-by-side` | Heading on the left with a vertical rule, body on the right (definition-like) |
| `sketch-hero` | Sketch is the star, reordered to top; heading becomes a caption |
| `pull-quote` | Heading hidden, body rendered as a centered italic statement with a thick rule above |

Guideline: apply layouts to **~30%** of chunks (PRD §4.6 discipline rule). Most chunks stay at the default.

### 3.5 Expansions (right-lane chevrons)

An expansion is detail content reachable via a chevron button in the bottom-right of the slide. Opening it splits the slide into content-left + expansion-right.

```javascript
expansions: [
  { label: 'example',   body: `<p>Concrete instance…</p>` },
  { label: 'reference', body: `<p>Sweeney, L. (2002). <em>k-anonymity…</em></p>` },
  { label: 'answer',    body: `<p>The answer is…</p>` },
],
```

The chevron's abbreviated label is derived from `label`:

| `label` (first match) | Chevron shows |
|---|---|
| `example` | `Ex ›` |
| `explanation`, `deep-dive`, `detail` | `Exp ›` |
| `reference`, `citation`, `bibliography` | `Ref ›` |
| `answer`, `solution` | `? ›` |
| `proof` | `Pf ›` |
| `figure`, `diagram` | `Fig ›` |
| `setup` | `Set ›` |
| `code` | `{} ›` |
| anything else | first 3 characters capitalized (e.g. `Agg ›`) |

Multiple expansions stack horizontally in the bottom-right. Open the first with `Enter`, the nth with the digit key `1`–`9`.

Use expansions for content you *might* need — the first example, the paper citation, the worked-out answer. Anything you *always* narrate goes in the chunk body.

**Do not put references in the annotation slot.** Annotations are for live speaker marginalia (§4 of this doc). Source-authored references belong in a `Ref` expansion.

---

## 4. Annotations

The annotation slot is for live marginalia added during the lecture — ad-hoc diagrams, references you noticed last-minute, "watch the room here." Not for source-authored content.

- Press `N` on the active slide → annotation box appears to the left of content (camera pans), textarea gets focus.
- Type. `Enter` for a new line. Box grows one line at a time.
- `Esc` blurs. Annotation stays visible on the slide at reduced opacity.
- Annotations auto-save to `localStorage` (keyed by `LECTURE.title + chunk.id`).
- When navigating back to an annotated chunk later in the lecture, the note is still there, dimmed in the slide's left margin.

If you want to pre-author annotations (e.g. before a rehearsal), edit `localStorage` via the browser's DevTools — the key is `psi-lecdoc:<LECTURE.title>:annotations`.

---

## 5. Keyboard reference (live lecture)

### Navigation
- `←` `→` &nbsp; or &nbsp; `h` `l` — previous / next column
- `↑` `↓` &nbsp; or &nbsp; `k` `j` — previous / next chunk in column
- `O` — toggle birds-eye overview (drag to pan, wheel to zoom distance, click a chunk to enter)
- `Shift` + click-drag — pan camera manually in any mode (reset on next navigation)

### Slide interactions
- `Enter` — open first expansion on active chunk
- `1`–`9` — open nth expansion
- `Esc` — close expansion / exit annotation / exit overview
- `N` — annotate the active chunk

### Display controls
- `+` / `-` / `0` — zoom text size (reset is 1.35×)
- `C` — cycle collapse mode: `full` → `topic` → `topic+bold` → `bold`
- `B` — blank screen (press again to restore)
- `?` — toggle keyboard hints overlay

### Collapse modes — what remains visible on the projector

| Mode | What shows |
|---|---|
| `full` | Everything |
| `topic` | First sentence of each paragraph only |
| `topic+bold` | Topic sentences + bold phrases from the rest as indented sub-points |
| `bold` | Headings and `<strong>` phrases only |

Use `topic+bold` for the skim view during fast recap; `full` during actual teaching.

---

## 6. Defaults and where to change them

All defaults live in the `:root` CSS custom properties and the `state` object in the script. Edit at your own risk:

```css
:root {
  --ink-l: 0.20;           /* body text darkness */
  --ink-soft-l: 0.62;      /* marginalia darkness */
  --zoom: 1.35;            /* text size multiplier */
  --dim: 0.86;             /* how much to dim non-active chunks */
  --camera-duration: 250ms;
  --slide-pad-x: 14%;
  --slide-height: 40vh;    /* min-height; chunks auto-grow past this */
  --chunk-gap: 4vh;        /* vertical space between chunks in a column */
}
```

These are the calibrated values from authoring sessions — tune only if the lecture room needs it.

---

## 7. Writing well inside this medium

These aren't mechanical rules; they're the patterns we found work inside the frame:

- **~12 lines max body per chunk at default zoom.** A chunk that can't fit is two chunks.
- **One `<strong>` core claim per chunk.** Any more and the eye loses emphasis.
- **Prose, not bullets.** Use bulleted lists only when content is genuinely enumerable (adversary rungs, exercise sub-steps).
- **Headings are labels, not sentences.** "Why anonymity ≠ privacy" is good; "Anonymity differs from privacy in important ways" is a body sentence pretending to be a heading.
- **Tags and layouts are conservative.** When in doubt, use `free` + no `layout` + `standard` width. Reach for `principle` / `pull-quote` / `sketch-hero` only when the chunk *is* that register — not to add visual variety for its own sake.
- **Expansions are escape hatches.** If you find yourself writing "also, here's the reference," stop — that's an `Ref` expansion. Keep the body on-topic.

---

## 8. When Phase 1 arrives

The Phase 1 build script (PRD §9) replaces hand-edited JavaScript objects with a Markdown source format (PRD §3). The same content — tags, widths, layouts, expansions, annotations — will be expressed in Markdown with fenced directives. Chunks authored in Phase 0 will need a one-time conversion; everything else (annotations, state, visual model) stays.

Until then: edit the `LECTURE` object directly, save, reload. That's the whole build.
