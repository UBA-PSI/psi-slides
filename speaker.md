# `speaker.html` – Phase 1 Spec

Short spec for the speaker view and its sync protocol with `audience.html`. Commits once this lands; changes after that require moving both HTML outputs together. Read alongside `PRD.md` §7.

## 1. Scope

**In (Phase 1, this slice):**
- New output `speaker.html`, built from the same `source.md` as `audience.html` and `print.html`.
- `window.postMessage` sync between audience and speaker via the opener relationship (audience spawns speaker via `S`, both windows hold cross-references). Works across `file://` origins where `BroadcastChannel` is isolated by Chrome's per-file opaque-origin policy.
- Three-panel layout: current-chunk mirror (centered), next-previews (bottom strip, 2-3 upcoming), notes pane (right).
- Column-level **scrubber** (top or bottom edge): flat list of column headings + chunk-count pips, click jumps. No full chunk thumbnails.
- **Freeze toggle** (`V`, or the footer button): when frozen, the room holds the slide it is on while the speaker moves ahead privately; thawing catches the room up. Live by default.
- **Timer**: elapsed since speaker-page load, `mm:ss`, non-pausable. Resets on reload.
- **`S` from audience** opens `speaker.html` in a new tab.
- localStorage crash recovery: every 5 s, persist `activeIdx`, `revealed`, `collapse`, `zoom`, `annotations`, elapsed-seconds.

**Out (deferred to later Phase 1 / Phase 2):**
- Live sketch-slot editing (no sketch slots in the current lectures anyway – `::: sketch` is parsed but not rendered).
- Full-thumbnail scrubber.
- Second-machine / WebSocket sync (explicit PRD §7 non-goal for now).
- Pause/reset/target on timer.

**Explicit non-features (Phase 2+):**
- Student-facing `study.html` (PRD §12.3 open question).
- Poll / quiz slots.

## 2. State ownership and sync

The audience is the **state root**. The speaker owns a **local shadow** of the state, plus a `frozen` flag that governs whether speaker-originated changes are broadcast.

`frozen` is the projector's metaphor, not the protocol's. It started life as a `pushEnabled` toggle with a companion `.` key that force-pushed one snapshot – two controls describing what the code does (send a snapshot) rather than what the lecturer wants (hold the image while I read ahead). Inverting and renaming it collapses the pair into one: thawing *is* the resync, because the first thing an ungated broadcast does is hand the room the current state. `toggleFreeze()` therefore sends a snapshot directly on the way out of frozen, or unfreezing on the slide you meant to land on would appear to do nothing.

Four message types deliberately bypass the freeze gate, because all four are commands to the projector rather than shared state:

- `blank` – `B` must reach the projection whether or not the cockpit is frozen. It is the key you hit when something has to come off the screen *now*, and a gated `B` would toast “projection blanked” at a projection that stayed lit.
- `slide-ref` – the audience window's dimensions after a resize (§3).
- `link-show` / `link-hide` – the address overlay, below.

**Links.** A plain click opens the link in a new tab of the window that was clicked; the renderer puts `target="_blank"` on external links, so the deck itself never navigates away. `Shift`-click instead shows the **address** on both screens, set large and with a **QR code**, and `Esc`, a click, or the next slide clears it on both. The address is itself a link, so clicking it opens the page in that window while leaving the overlay up for the room.

The QR is generated at build time, one per external address found in the rendered HTML, and shipped as an SVG map keyed by URL – so there is no encoder in the browser and a lecture without links pays nothing. It keeps a white ground on every theme, because scanners cope badly with inverted codes and the white card doubles as the quiet zone the spec requires. The encoder is a dependency (`qrcode-generator`, MIT, no dependencies of its own) rather than hand-rolled Reed-Solomon: an error in that maths produces codes that scan to the wrong string and look perfectly correct to the eye.

That is the considered answer to “can I open a page on the projector”. It is technically possible and a bad idea twice over: the lecturer would be driving a browser they cannot see from the lectern, and the room would be watching an unrelated interface instead of the lecture. It would also rest on `window.open` succeeding in the peer without a user gesture there, which is exactly what popup blockers exist to stop. What a room actually wants from a link mid-talk is to write it down, so the projection gets a URL to read rather than a page to watch – and the cockpit shows the identical overlay, so the lecturer knows precisely what went up.

**State that syncs** (both directions, gated by freeze):

| Field | Kind | Notes |
|---|---|---|
| `activeIdx` | integer | current chunk |
| `revealed` | `{id: count}` | reveal segments per chunk |
| `collapse` | enum | `none` / `topic-bold` |
| `zoom` | float | text scale multiplier, whichever collapse mode is live |
| `blanked` | bool | audience blackout |
| `annotations` | `{id: string}` | speaker-edited, mirrors to audience |
| `annotEditingId` | id / null | so the non-editing peer raises the box and pans along |
| `openExp` | `{chunkIdx, expIdx}` | expansions are mirrored, see below |
| `audienceW`, `audienceH` | integers | audience window dims; speaker matches its preview aspect |
| `panDx`, `panDy` | floats | manual drag-pan, layout-space |
| `overview` | bool | overview mode |
| `overviewScale` | float | overview zoom, clamped to 0.08 … 1 |
| `overviewAnchorIdx` | integer | chunk the overview camera is centred on |
| `selectedIdx` | integer | overview selection outline |

**State that stays local** (never posted to the peer):

| Field | Who owns it | Why |
|---|---|---|
| `tocVisible`, `searchActive`, search hits and cursor | per-view | navigational scratch space, not a shared surface. Committing a hit navigates, and *that* rides the normal snapshot |
| `collapsedZoom` | per-view | see below |
| notes-pane height, preview orientation | speaker only | physical-screen preferences, persisted globally |
| timer elapsed | speaker only | speaker-side artifact |

**Per-mode zoom, without a new field.** The two collapse modes carry very different amounts of text, so they keep separate zoom levels: the collapsed slide holds whatever the lecturer set, and switching to the full text computes a zoom that makes the current chunk fit. Only the *live* zoom travels, as it always did. Each window additionally remembers, locally, the zoom that was live the last time `collapse` was `topic-bold` – including zooms that arrived in a remote snapshot. Because both windows see the same sequence of zoom values, the two memories agree without the protocol having to carry a second one. Widening the snapshot for a value that is derivable from what it already contains would have been the wrong trade.

**Camera and overview sync** (revised after implementation): the original design kept the whole overview cluster local, on the theory that overview is a private planning surface. That did not survive contact with a real two-screen setup – the lecturer looks at the speaker window while the projector shows the audience one, and an overview that only exists on one of them is worse than none.

The overview framing is therefore a pure function of `(overviewAnchorIdx, overviewScale, panDx, panDy)`, all four of which ride every snapshot. Consequences worth knowing:

- `selectedIdx` is *only* the outline. It deliberately does not drive the camera, so clicking a thumbnail in overview leaves the stage where it is. Keyboard selection and search-commit re-anchor (`overviewAnchorIdx = selectedIdx`) and zero the pan; a click does neither.
- `overview` used to travel in its own `{type: 'overview', active}` message that was only handled on the audience side. That single-directional handler is gone. Two channels for one fact is what let the speaker sit in normal-camera mode while adopting the audience's overview drag-pan, which drove its stage several thousand pixels off screen.

**Sync additions (revised after implementation):**

- `openExp` **is** synced after all. The interactive speaker mirror makes
  chevron clicks propagate to audience, which wouldn't work with audience-
  only state. The clean model is: openExp lives in the snapshot and both
  sides mirror it.

The speaker's “next previews” always render chunks **fully revealed** regardless of the synced `revealed` state (PRD §7 – the planning surface shows author-intent, not live pacing).

## 3. Message protocol

Transport: `window.postMessage(msg, '*')` between the two windows. The audience holds the speaker reference returned by `window.open(...)`; the speaker holds `window.opener`. Both views adopt any inbound `ev.source` as their peer, so an audience reload while the speaker is alive recovers the link the moment the speaker next pushes.

Every message is a **full snapshot**, never a diff. Snapshots are cheap, and this eliminates the class of bugs where a late-joiner sees a partially-reconstructed state.

```javascript
// Sent by either side on any syncable state change (if push enabled).
// Payload is the full field list from §2 – see snapshot() in build.js.
{
  type: 'state',
  source: 'audience' | 'speaker',
  payload: {
    activeIdx: number,
    revealed: { [chunkId: string]: number },
    collapse: 'none' | 'topic-bold',
    zoom: number,
    blanked: boolean,
    annotations: { [chunkId: string]: string },
    annotEditingId: string | null,
    openExp: { chunkIdx: number, expIdx: number } | null,
    audienceW: number, audienceH: number,
    panDx: number, panDy: number,
    overview: boolean,
    overviewScale: number,
    overviewAnchorIdx: number,
    selectedIdx: number,
  }
}

// Lightweight camera update, rAF-throttled during a drag or wheel-zoom so
// the peer follows smoothly without re-running the full snapshot apply
// 60x/second. The same fields also ride every 'state' snapshot, so a
// navigation or a freshly reconnected peer still converges on the framing.
{ type: 'pan', source, dx, dy, overviewScale, overviewAnchorIdx, selectedIdx }

// Speaker-to-audience only: laser pointer and figure inspection.
{ type: 'cursor', source: 'speaker', chunkIdx, x, y, target: 'chunk' | 'figure' }
{ type: 'figure-focus' | 'figure-pan', chunkIdx, figureIdx }
{ type: 'figure-unfocus' }
{ type: 'figure-view', scale, panX, panY }

// Sent by speaker on open; audience replies with current state.
{ type: 'hello', source: 'speaker' }

// Audience reply to a hello.
{ type: 'state', source: 'audience', payload: { ... } }
```

The `figure-*` and `cursor` messages are the one remaining deliberately one-directional family: the audience acts on them, the speaker ignores them. Figure inspection is a lecturer gesture, and the audience window is normally on a projector nobody clicks.

Receive rule: any incoming `state` replaces the local state wholesale (except for the always-local fields in §2). No merging, no conflict resolution. If both sides edit the same field within one tick, last write wins.

Rebroadcast rule: **never** rebroadcast a received state. The sender is the single source of truth for that state-tick.

## 4. UX

### 4.1 Layout (speaker.html)

```
┌──────────────────────────────────────────────────────────────┐
│  scrubber: [1 Welcome ···] [2 What to include ··] [3 ···]   │   ← 2.5vh top strip
├────────────────────────────────────────┬─────────────────────┤
│                                        │                     │
│           current chunk                │   notes pane        │
│           (mirror of audience)         │   (speaker-only     │
│           ~70% viewport width          │   > note: content   │
│                                        │   from source)      │
│                                        │                     │
├────────────────────────────────────────┤                     │
│   next: [chunk N+1] [N+2] [N+3]        │                     │
│   (fully revealed, 22% viewport height)│                     │
└────────────────────────────────────────┴─────────────────────┘
  00:42 · [● live] · wlab01                   [Esc hints]
```

- **Scrubber**: one `<button>` per column, showing `N. <heading>`. Below it, a row of dots – one per chunk – the active chunk's dot is filled. Click a button to jump to the column's first chunk. Click a dot to jump to that chunk.
- **Current chunk**: identical rendering to the audience (same `renderAudienceChunk`), same collapse mode, same reveal state. Full chunk frame, scaled to fill the pane.

  **Reveal preview.** The cockpit additionally draws the *one* segment that the next `Space` or `↓` will bring up, in place inside the slide, hatched and inside a dashed frame with a small `next` label. Only the immediate next one: the segments behind it stay hidden, or the preview would just be the un-collapsed chunk with decoration on top. `applyReveal` marks it with `data-next` in both views; only the speaker's stylesheet reacts.

  It is `position: absolute` with no offsets, which renders it at its static position – exactly where it will land – while contributing nothing to the chunk's height. That is load-bearing, not tidiness: the laser pointer travels as a fraction of the active chunk's bounding box, so a cockpit chunk taller than the projected one would put the dot in the wrong place. Measured on a three-segment chunk, an in-flow preview made the speaker's box 840px against the audience's 718.
- **Next previews**: 3 upcoming chunks (or fewer if near end), each at ~0.25 scale. No expansions, no annotations, no reveal – always fully revealed per PRD §7. Drag the handle on the strip's leading edge to resize it, in either orientation; double-click resets. Height and width are persisted under **separate** keys, because someone who flips the strip from the bottom to the right edge wants each shape to come back the way they left it. The stage keeps its letterbox throughout – it gives up the room and `#stage-cell`'s ResizeObserver re-fits `--stage-scale`, so the mirror stays at the audience aspect instead of stretching.

  Implementation note worth keeping: the handle is a **grid item of its own** sharing the strip's cell, not an absolutely positioned child of the strip – the strip is a scroll container and a handle inside it would scroll away with the thumbnails. Sharing a cell also means the strip has to be *explicitly* placed (`grid-column: 1 / -1`), because grid auto-placement avoids an occupied cell rather than overlapping it; left on `auto` the strip was pushed into an implicit second column that `grid-template-columns` never declared.
- **Notes pane**: speaker notes extracted from `> note:` lines in source, per chunk. Drag the hairline bar on its top edge to resize (the stage preview rescales to fit via the `#stage-cell` ResizeObserver); double-click the bar to return to automatic height. The height is persisted per user. The bar names the gesture on hover, because a 2px line is not self-explanatory and “how do I make the notes bigger” turned out to be the question the pane most reliably failed to answer. Two buttons in the pane's top-right corner scale the **text** independently of the pane's height, persisted per user. Deliberately no hotkey for those: this is the one surface the lecturer types into, and every free letter key is already a navigation command that would fire mid-sentence.
- **Footer**: mm:ss timer, then four buttons – `● live` / `❄ frozen` (the freeze state *is* the control, = `V`), `⇄ layout` (strip orientation, = `Shift-V`), `export notes` (= `Shift-E`), `? help` (= `?`) – then the lecture slug and a one-line key crib. The freeze state used to be a bare indicator span: a status light with no way to press it is a question with no answer beside it, and it was the one cockpit control with no mouse route at all.

  The floating round `?` button that both live views carry bottom-left is **hidden in the speaker**: the footer already has a labelled `? help`, and the circle sat on top of the timer.

### 4.1a Help overlay

Both live views ship a full-screen keyboard-and-mouse reference on `?` (or the small `?` button in the corner / footer). It is grouped **by task, not by key**, and lists mouse gestures next to keys: several of the most useful affordances (resize the notes pane, click a figure to zoom it, drag to pan the overview board) have no key at all and were previously undiscoverable. `Esc` closes it ahead of every other Esc target; clicking the scrim closes, clicking inside does not, so the panel can stay open while you try a key.

The speaker's copy leads with “Arranging this window”, “Notes”, and “The projector”; the audience's copy omits those and adds `S`. Generated once by `renderHelpOverlay(view)` in build.js so a label change lands in both.

### 4.2 Keyboard (speaker)

Speaker inherits audience nav bindings, plus:

| Key | Action |
|---|---|
| `←` `→` `↑` `↓` | Same as audience (nav broadcasts unless frozen) |
| `Space` | Advance reveal (broadcasts) |
| `Enter`, `1`-`9`, `Esc` | Local to speaker, never broadcast (expansions are audience-only) |
| `N` | **Local**: focuses notes pane; does not open annotation |
| `C` | Cycle collapse (broadcasts) |
| `+` `-` `0` | Zoom (broadcasts) |
| `B` | Blank – broadcasts **ungated**, so it lands while frozen too |
| `P` | Open print.html in new tab |
| `V` | **Freeze / thaw the projection.** Thawing resyncs the room to the speaker |
| `Shift`-`E` | **Export annotation drafts**: copy every live `annotations[id]` as a marker-wrapped `> annot:` block to the clipboard, then ask before clearing the drafts from localStorage. A declined confirm or blocked clipboard leaves drafts untouched, so the raw notes can always be rescued on a second try. The pasted block is consumed by `node build.js <source.md> --integrate-annotations`, which moves each `> annot:` under its chunk and removes the marker block. |
| `?` | Toggle the help overlay (§4.1a) – **local** |
| `Shift`-`V` | Preview strip along the bottom ↔ down the right edge (**local**, persisted). Moved off plain `V`, which now freezes: rearranging this window is the rarer and far less urgent act, and the footer used to label it “preview”, which read as *the preview*, not *where the preview sits* |
| `T` | Toggle a small TOC overlay (**local**, never broadcast) |
| `O` | Toggle overview – **broadcasts**, both windows enter and leave together |
| `/` | Fulltext search inside overview (**local**: the filter highlight is not synced, only the selection it commits to) |

### 4.3 Audience → speaker startup

On `S` in audience:
1. Audience runs `window.open('speaker.html', 'psi-slides-speaker', 'width=1400,height=900')` and stashes the returned `Window` reference as its `peer`.
2. Speaker boots, picks up `window.opener` as its `peer`, posts a `hello` to it.
3. Audience receives `hello`, replies with current state via `peer.postMessage(...)`.
4. Speaker applies state, shows itself ready.

If speaker opens standalone (URL typed directly, bookmark) there is no `window.opener` and the speaker has no peer; it boots from localStorage and runs disconnected until an audience appears. Live cross-window discovery for the standalone case is not in this slice.

## 5. Persistence

Key: `psi-slides:<title>:speaker`. Written every 5 s on change. Same schema as the snapshot payload, plus `elapsedSeconds`. On speaker reload, this is applied locally and then broadcast so the audience catches up if it also restarted.

Annotations use the existing `psi-slides:<title>:annotations` key – already wired in audience. Speaker writes to the same key.

### 5.1 Source ↔ draft precedence for annotations

Chunks can carry a source-authored annotation via `> annot:` blockquotes (see PRD §3). That text is baked into the audience textarea as its `defaultValue` at build time. At runtime:

- If `annotations[id]` exists in the map (i.e. someone typed live and the keystroke landed in localStorage), that draft wins – even if it is an empty string (the lecturer deliberately cleared).
- Otherwise the textarea shows the source default, nothing is written to localStorage.
- `Shift`-`E` on the speaker is the one-way export: clipboard copy first, then confirm-to-clear. After clearing, the textarea falls back to `defaultValue`, so once the exported snippet is pasted back into `source.md` and the lecture is rebuilt, the source value is again authoritative.

## 6. Build pipeline changes

- Default CLI emits `audience.html`, `print.html`, **and** `speaker.html` into the lecture directory.
- New flag `--speaker-only`. Existing `--audience-only` / `--print-only` stay; only one `--*-only` flag at a time.
- `renderSpeaker(lecture)` reuses `renderAudienceChunk` for the current-chunk panel and for the mini previews (at `--speaker-mini-scale`). Notes pane pulls `> note:` lines; the parser currently strips them – change the parser to collect them into `chunk.speakerNotes: string[]` and then strip from the body. Audience/print behavior unchanged (they ignore `speakerNotes`).

## 7. Locked-in decisions

All confirmed before implementation starts:

- Protocol: **full-state snapshot** per change (§3).
- Annotations: **live sync** on every keystroke, gated by freeze.
- Current-chunk panel: **interactive** – chevron-clicks open expansions and sync to audience.
- Notes pane: **multi-line Markdown**. Parser collects consecutive `> note:` blockquote lines into `chunk.speakerNotes: string[]`, rendered with `marked`.
- Projection default: **live** (not frozen). `V` toggles.
- Scrubber position: **top strip**.
- Reload behavior: **audience-first**. Speaker `hello`-pings on boot; if reply within ~500 ms, apply that state. Otherwise fall back to localStorage.

## 8. Implementation order

1. Parser: add `chunk.speakerNotes: string[]`; audience/print behavior unchanged (they never read it).
2. `renderSpeaker(lecture)` + SPEAKER_CSS + SPEAKER_JS: static layout first, no sync. Just renders correctly with dummy local state.
3. `window.postMessage` wiring on **both** outputs (peer adoption from inbound messages; audience stashes the spawn return value, speaker uses `window.opener`). Audience sends state; speaker receives + applies. Hello/reply handshake.
4. Speaker → audience direction. Freeze toggle (originally a push toggle plus a `.` force-push; see §2).
5. Timer + crash-recovery localStorage.
6. Smoke test: open both tabs, nav in audience, verify speaker mirrors. Nav in speaker, verify audience mirrors. Freeze, verify the room holds while the speaker moves; thaw, verify the room catches up; `B` while frozen, verify the projection still blanks.
7. Commit.
