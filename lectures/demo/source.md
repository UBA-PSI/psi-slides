---
title: A Minimal Lecture
presenter: Dominik Herrmann
info: |
  2026-04-21, Bamberg
  Phase-1 build pipeline demo
course: demo-ss26
lecture: 00
---

## title: {#title}

# Motivation {#motivation}

## free: Why this exists {#why-this-exists}

This is a **demo lecture** built from a single Markdown file by the Phase 1 build pipeline.

The medium owes students a printable study version, not just a live projection. This file is one source; what you are reading is one renderer.

---

What you do not see: the reveal segments. In the live view each `---` marks a pacing break; here in print they vanish silently.

## principle: One source, many views {.wide #one-source-many-views}

Audience, speaker, print – all derive from the same Markdown. The only per-view divergence is **what the renderer chooses to emit**, never what the author chose to write.

# Mechanics {#mechanics}

## definition: Reveal segment {#reveal-segment}

A *reveal segment* is a consecutive block of chunk-body content bounded by `---` lines or chunk edges.

## question: What happens if a segment is empty? {.narrow #question-empty-segment}

The renderer drops it silently.

## example: A tagged chunk {.standard #example-tagged-chunk}

Every chunk has an optional tag prefix – `principle:`, `definition:`, `example:`, `question:`, `figure:`, `exercise:`, `title:`, or `free:`. The tag prefix drives typography and print ordering cues, not content structure.

A chunk without a tag is equivalent to `free:` and renders with no decoration.

# Mechanics in practice {#practice}

## figure: A fenced sketch {.wide #figure-fenced-sketch}

```
  ┌─────┬─────┬─────┐
  │ age │ zip │ dx  │
  └─────┴─────┴─────┘
    34    96*   flu
    42    96*   flu
    51    96*   ---
```

The caption reads as the chunk heading because `figure:` promotes the sketch to the top.

## exercise: Add a chunk {#exercise-add-chunk}

Open this file. Add a new `## free: Something new {#something-new}` chunk at the end of any column. Re-run `node build.js lectures/demo/source.md`. The new chunk appears in print under its column, in source order.
