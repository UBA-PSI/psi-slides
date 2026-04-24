# `speaker.html` – Phase 1 Spec

Short spec for the speaker view and its sync protocol with `audience.html`. Commits once this lands; changes after that require moving both HTML outputs together. Read alongside `PRD.md` §7.

## 1. Scope

**In (Phase 1, this slice):**
- New output `speaker.html`, built from the same `source.md` as `audience.html` and `print.html`.
- `window.postMessage` sync between audience and speaker via the opener relationship (audience spawns speaker via `S`, both windows hold cross-references). Works across `file://` origins where `BroadcastChannel` is isolated by Chrome's per-file opaque-origin policy.
- Three-panel layout: current-chunk mirror (centered), next-previews (bottom strip, 2-3 upcoming), notes pane (right).
- Column-level **scrubber** (top or bottom edge): flat list of column headings + chunk-count pips, click jumps. No full chunk thumbnails.
- **Push-to-audience toggle**: when off, speaker navigates privately; when on (default), speaker nav drives audience.
- **Timer**: elapsed since speaker-page load, `mm:ss`, non-pausable. Resets on reload.
- **`.` key**: force-push current speaker state to audience (rescue for desync).
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

The audience is the **state root**. The speaker owns a **local shadow** of the state, plus a `pushEnabled` flag that governs whether speaker-originated changes are broadcast.

**State that syncs** (both directions, gated by push):

| Field | Kind | Notes |
|---|---|---|
| `activeIdx` | integer | current chunk |
| `revealed` | `{id: count}` | reveal segments per chunk |
| `collapse` | enum | `none` / `topic` / `topic-bold` / `bold` |
| `zoom` | float | text scale multiplier |
| `blanked` | bool | audience blackout |
| `annotations` | `{id: string}` | speaker-edited, mirrors to audience |

**State that stays local** (never posted to the peer):

| Field | Who owns it | Why |
|---|---|---|
| `overview`, `selectedIdx`, `overviewScale`, `manualPan` | per-view | overview is a planning surface; each side runs its own |
| `tocVisible`, `searchActive` | per-view | same |
| `annotEditingId` | per-view | edit-state is transient and UI-local |
| timer elapsed | speaker only | speaker-side artifact |

**Sync additions (revised after implementation):**

- `openExp` **is** synced after all. The interactive speaker mirror makes
  chevron clicks propagate to audience, which wouldn't work with audience-
  only state. The clean model is: openExp lives in the snapshot and both
  sides mirror it.

The speaker's "next previews" always render chunks **fully revealed** regardless of the synced `revealed` state (PRD §7 – the planning surface shows author-intent, not live pacing).

## 3. Message protocol

Transport: `window.postMessage(msg, '*')` between the two windows. The audience holds the speaker reference returned by `window.open(...)`; the speaker holds `window.opener`. Both views adopt any inbound `ev.source` as their peer, so an audience reload while the speaker is alive recovers the link the moment the speaker next pushes.

Every message is a **full snapshot**, never a diff. Snapshots are cheap, and this eliminates the class of bugs where a late-joiner sees a partially-reconstructed state.

```javascript
// Sent by either side on any syncable state change (if push enabled).
{
  type: 'state',
  source: 'audience' | 'speaker',
  payload: {
    activeIdx: number,
    revealed: { [chunkId: string]: number },
    collapse: 'none' | 'topic' | 'topic-bold' | 'bold',
    zoom: number,
    blanked: boolean,
    annotations: { [chunkId: string]: string },
  }
}

// Sent by speaker on open; audience replies with current state.
{ type: 'hello', source: 'speaker' }

// Audience reply to a hello.
{ type: 'state', source: 'audience', payload: { ... } }
```

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
  00:42 · push ● · wlab01                     [Esc hints]
```

- **Scrubber**: one `<button>` per column, showing `N. <heading>`. Below it, a row of dots – one per chunk – the active chunk's dot is filled. Click a button to jump to the column's first chunk. Click a dot to jump to that chunk.
- **Current chunk**: identical rendering to the audience (same `renderAudienceChunk`), same collapse mode, same reveal state. Full chunk frame, scaled to fill the pane.
- **Next previews**: 3 upcoming chunks (or fewer if near end), each at ~0.25 scale. No expansions, no annotations, no reveal – always fully revealed per PRD §7.
- **Notes pane**: speaker notes extracted from `> note:` lines in source, per chunk. Scrollable independently. Markdown-rendered.
- **Footer**: mm:ss timer, push-on/off indicator, lecture slug, hints hint.

### 4.2 Keyboard (speaker)

Speaker inherits audience nav bindings, plus:

| Key | Action |
|---|---|
| `←` `→` `↑` `↓` | Same as audience (nav broadcasts via push) |
| `Space` | Advance reveal (broadcasts) |
| `Enter`, `1`-`9`, `Esc` | Local to speaker, never broadcast (expansions are audience-only) |
| `N` | **Local**: focuses notes pane; does not open annotation |
| `C` | Cycle collapse (broadcasts) |
| `+` `-` `0` | Zoom (broadcasts) |
| `B` | Blank (broadcasts) |
| `P` | Open print.html in new tab |
| `.` | **Force-push** current state to audience |
| `Shift`-`P` | Toggle push-to-audience |
| `Shift`-`E` | **Export annotation drafts**: copy every live `annotations[id]` as a marker-wrapped `> annot:` block to the clipboard, then ask before clearing the drafts from localStorage. A declined confirm or blocked clipboard leaves drafts untouched, so the raw notes can always be rescued on a second try. The pasted block is consumed by `node build.js <source.md> --integrate-annotations`, which moves each `> annot:` under its chunk and removes the marker block. |
| `T` | Toggle a small TOC overlay (same as audience) |
| `O`, `/` | **Local overview & search on the speaker**, never broadcast |

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
- Annotations: **live sync** on every keystroke, gated by push.
- Current-chunk panel: **interactive** – chevron-clicks open expansions and sync to audience.
- Notes pane: **multi-line Markdown**. Parser collects consecutive `> note:` blockquote lines into `chunk.speakerNotes: string[]`, rendered with `marked`.
- Push-to-audience default: **ON**. `Shift-P` toggles.
- Scrubber position: **top strip**.
- Reload behavior: **audience-first**. Speaker `hello`-pings on boot; if reply within ~500 ms, apply that state. Otherwise fall back to localStorage.

## 8. Implementation order

1. Parser: add `chunk.speakerNotes: string[]`; audience/print behavior unchanged (they never read it).
2. `renderSpeaker(lecture)` + SPEAKER_CSS + SPEAKER_JS: static layout first, no sync. Just renders correctly with dummy local state.
3. `window.postMessage` wiring on **both** outputs (peer adoption from inbound messages; audience stashes the spawn return value, speaker uses `window.opener`). Audience sends state; speaker receives + applies. Hello/reply handshake.
4. Speaker → audience direction. Push-toggle. `.` force-push.
5. Timer + crash-recovery localStorage.
6. Smoke test: open both tabs, nav in audience, verify speaker mirrors. Nav in speaker, verify audience mirrors. Toggle push, verify desync + resync.
7. Commit.
