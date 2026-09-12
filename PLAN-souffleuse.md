# Souffleuse – a live prompter in the cockpit

While a talk is running, the cockpit (`speaker.html`) listens, a sidecar in
`build.js` sends transcript excerpts plus the deck's content to a model
through OpenRouter, and the cockpit shows short, dismissable hints: behind
time, an example missing or weak, a probable factual slip, delivery. It can
also lay cue cards into upcoming chunks – in the cockpit only. The
projection, the sync snapshot and `source.md` are untouched while the talk
runs.

## Status of this document

An agreed plan, being built on branch `souffleuse`, worktree
`../psi-slides-souffleuse`. The codename is `souffleuse` (branch, flag,
module); the visible word in the cockpit is `prompter`, English like `cards`
and `freeze`. § Progress below says which slice has landed.

## Occasion

The idea came while presenting: the cockpit knows what is on the slide, what
is in the notes and what time it is. What it lacks is an ear and a judgement.
People who heard the idea reacted favourably and warned in the same breath:
a hint that is too long or too fundamental throws the speaker out of the
sentence. That one requirement orders everything else.

## What it is, and what it is not

It is a prompter in the theatre sense: whispers from the box, briefly, only
when needed, and the audience notices nothing. A hint has at most twelve
words; the normal answer to a call is `nothing`. It may put a card into an
upcoming chunk when something said now should be picked up there.

It is not: an author that rewrites slides (that touches the renderer and the
sync, and is exactly what the listeners warned against); a fact-checker with
research (no network beyond the one call); a recorder (the log is text,
never audio); part of the desktop app (which promises three times in public
that nothing leaves the machine, and has no network entitlement).

**Restraint is the requirement, not polish.** The judgement – is that a
factual slip? – is the model's. The policy – may one come now at all? – is
in code, so it is testable without a network. Four rules live in code: more
than twelve words is discarded, not shortened; one hint at a time; cool-downs
overall and per kind; a dismissed hint never comes back.

## The decisions

1. **Process: a Node sidecar in `build.js`** under `--souffleuse`, only
   together with `--watch`. The cockpit talks to Node over the existing
   nonce-guarded watch socket. The key lives in `OPENROUTER_API_KEY` and
   never reaches the HTML. Rejected: a process of its own (a second socket,
   a second parse of the deck) and the desktop app (entitlement,
   notarisation, three published sentences).
2. **STT v1: the Chrome Web Speech API in the cockpit**, on-device preferred
   (`SpeechRecognition.available({langs, processLocally: true})`,
   `install()`, `rec.processLocally = true`), server recognition as a
   visibly marked fallback. Behind an adapter interface so whisper.cpp
   (Node, the cwebp-on-PATH pattern) and ElevenLabs Scribe can follow
   without a protocol change.
3. **LLM through OpenRouter, no read tools.** A deck with notes is 20 to
   60k tokens and fits whole into a stable, cached system prefix; a tool
   round trip to ask for more spends the one scarce resource, latency.
   Tools are instead the action vocabulary of the answer: one forced tool
   call `advise` with `nothing | hint | cue`. Per tick only a transcript
   window plus one state line goes out. Default model
   `anthropic/claude-sonnet-5` with `reasoning: {effort: 'low'}`,
   changeable per frontmatter or flag.
4. **Scope v1: hints plus cards for upcoming chunks.** Both cockpit-local,
   like the cue cards: `revealed[chunkId]` stays the only shared reveal
   state, the projection never learns of it.
5. **`duration:` top-level** in the frontmatter, because it is a property of
   the talk like `lang:`; the clock can use it one day without the
   souffleuse.
6. **Interim transcript line in, off by default** – reassuring in rehearsal,
   one moving line too many in the talk.

External facts confirmed today, to be re-checked against the current docs
in slice 3: OpenRouter forces a tool call with `tool_choice: {type:
'function', function: {name}}` and `parallel_tool_calls: false`;
`cache_control: {type: 'ephemeral'}` on a content block of the system
prompt passes through to Anthropic (minimum size 1024 to 4096 tokens by
model), `session_id` keeps sticky routing on the provider holding the warm
cache, `usage: {include: true}` returns `cached_tokens`. Chrome:
`available()` returns `available | downloadable | downloading |
unavailable`; an open Chromium bug (444393111) concerns
`available({processLocally: true})` on macOS, so the fallback to server
recognition has to be visible.

## Architecture – three parts, one socket

### Where the code lives

- **`souffleuse.mjs`**, new, zero-dep, no Node APIs: everything pure.
  `deckPayload(lecture, opts)`, `systemPrefix(deck, opts)`,
  `tickMessage(session)`, `TOOL_SCHEMA`, `parseAnswer(response, session)`,
  `driftSeconds(…)`, `timeHintAllowed(…)`, `shouldTick(…)`,
  `createPolicy(opts)`. A gate tests them in milliseconds. Unlike
  `cue-cards.mjs` it is not spliced into the page; `build.js` imports it
  dynamically under the flag only, so `desktop/scripts/stage-engine.mjs`
  learns nothing in v1.
- **`build.js`**, a new section `// ── souffleuse (--souffleuse) ──` before
  `// ── CLI ──`: the flag, `createSouffleuse({absIn, opts, sendToCockpit,
  emitEvent})` → `{onBuild(lecture), onMessage(msg, reply, sock),
  say(segment), close()}`, the tick scheduler, `fetch` (Node ≥ 20, no new
  dependency), backoff, the JSONL log, `--events`.
- **Cockpit**, `SPEAKER_JS`, a `souffleuse` section after the cue cards:
  STT adapter, strip, badge, footer button, history panel, cue merge.

### Deck payload built in Node, not sent from the page

The parser has per chunk the type, heading, id, segments with beat
boundaries and the notes with `at`/`from`; the page would only have the
flat search index, in which the beats are gone. `buildOnce` returns
`lecture` in addition, and `rebuild` in `runWatch` hands it to
`souffleuse.onBuild(lecture)`. `deckPayload` walks the parsed object the
way `lectureStats` does: per chunk `n, id, col, tag, title, sub, beats[]`
(segment text, `::: draw` → `[figure, steps: …]`, fences trimmed),
`notes[]` (through `notesToCards` from `cue-cards.mjs`, with beat and
`@mm:ss` mark), `marks[]`. Dividers without an id are `col:N`. Capped at
about 1500 characters of screen text and 2500 of notes per chunk. The
prefix is byte-stable per build; a rebuild renews prefix and cache by
itself. Over the socket go only id, beat, clock and text.

### Socket protocol

Rides the existing scheme: every client message carries `type`, `id`,
`nonce`, the server answers `<type>-result` with `ok`/`why`, and the nonce
is checked before anything else. One thing is new: unsolicited server
messages. `build-failed` is the precedent; `reloadScript` gets
`psiWatch.on(type, fn)` for it, a listener map after the `-result` pairing.

Client → server, answered by `*-result {ok, why}`:

| type | fields | when |
| --- | --- | --- |
| `souffleuse-hello` | `{lang, stt: {engine, local}}` | on switching on, after every reload; answer `{enabled, why?, model, cadence, cues}` |
| `souffleuse-say` | `{text, t0, t1, chunkId, idx, beat}` | per final segment, times in seconds of the cockpit clock |
| `souffleuse-move` | `{chunkId, idx, beat, elapsed}` | from `viewHooks.onActiveChange` and on a beat change in `onStateChange` |
| `souffleuse-dismiss` | `{hintId, how: 'esc' \| 'click' \| 'fade'}` | every way a hint goes away |
| `souffleuse-toggle` | `{on}` | the switch |

Server → client, via `on()`: `souffleuse-hint {hintId, kind, text,
severity, at}`, `souffleuse-cue {cueId, chunkId, text}`,
`souffleuse-status {state: listening | thinking | idle | off | error,
why?}`.

The server switch in `runWatch` additionally lets `souffleuse-*` through
and hands it to `souffleuse.onMessage` after the nonce check; without a
sidecar it answers `start the build with --souffleuse`. Hints go to the
socket of the last `hello`; a second cockpit tab takes over with its own
`hello`.

### Tick scheduler and request

- A slide tick on a new `chunkId`, at the earliest 8 s after the last tick.
  A speech tick when the speech seconds since the last tick reach `cadence`
  (25 s) and at least 8 new words are there. Silence is no occasion. Never
  two requests in parallel; a second occasion coalesces into "right after
  the answer". In the first 60 s ticks run but the policy lets nothing
  through.
- `POST ${OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1'}/chat/completions`,
  `Authorization: Bearer`, `X-Title: psi-slides`. Body: `model`,
  `max_tokens: 160`, `temperature: 0.2`, `reasoning: {effort: 'low'}`, the
  system prompt as a content block with `cache_control`, the tick message
  as the user turn, `tools: [TOOL_SCHEMA]`, `tool_choice` forced,
  `parallel_tool_calls: false`, `session_id` = prefix hash, `usage:
  {include: true}`. `AbortController` at 8 s; what arrives later is too late
  for the sentence. `OPENROUTER_BASE_URL` is the hook for the test fake and
  for any OpenAI-compatible endpoint.
- `parseAnswer` reads `tool_calls[0].function.arguments`, falls back to
  `content` as JSON, otherwise `nothing` with log reason `garbage`. Then the
  policy. What passes: socket, log, `emitEvent({type: 'souffleuse', state:
  'hint', kind})`.
- Log `souffleuse-<YYYYMMDD-HHMM>.jsonl` beside `source.md`, in
  `.gitignore`: `session, say, move, tick, answer` (raw plus `usage` and
  `durationMs`), `hint, cue, suppressed` (with reason), `dismiss, error,
  status`. The log is the debrief: which hints came, which the model wanted
  and the policy swallowed, what the ear understood.
- `--events`: type `souffleuse` with `state`; stdin command
  `{"type": "souffleuse", "enabled": false}` beside `auto`.

## The prompt

**System prefix**, English, output language is the deck's: the role "silent
prompter", the normal answer is `nothing`; at most twelve words, eight is
better; no reasoning, no praise, only what can be acted on from the lectern;
one hint per call; never one from the list already given; kinds `time`,
`example`, `fact` (only when fairly sure – the transcript has recognition
errors), `delivery` (rarely); `cue` only for `cue_targets`, never for the
current slide; `drift` in seconds, `time_hint_allowed` is decided by the
code. Then title, slide count, planned duration and every slide in order.

**Tick message**, stateless and small: a state line (`slide 12/38 · id ·
beat 2/3 · elapsed · drift · time_hint_allowed · cue_targets=[…]`), the last
five hints with `✕` for dismissed ones, a rolling transcript window of about
90 s or 600 words with `NEW` marking what is new since the last call. So the
request stays stateless and the prefix cacheable.

**Tool schema `advise`**: `action ∈ {nothing, hint, cue}`, `kind ∈ {time,
example, fact, delivery}`, `text` (≤ 12 words), `severity ∈ {low, high}`,
`chunk_id` (cue only), `why` (log only).

**Policy in code**, `createPolicy`, gate-tested:

| rule | default |
| --- | --- |
| more than 12 words | discarded (`too-long`), never shortened |
| opening silence | 60 s |
| one hint at a time | while one stands: `low` discarded, `high` replaces |
| cool-down overall | 60 s (exception `fact high`) |
| per kind | `time` 240 s · `delivery` 300 s, at most 3 per session · `example` 1 per chunk · `fact` 120 s |
| duplicates | word Jaccard ≥ 0.6 to a shown or dismissed hint → discarded |
| cue | only ids from `cue_targets` (the next three with an id, `idx > activeIdx`), at most 1 per chunk |
| invalid | → `nothing` plus `garbage` |

**Drift**, `driftSeconds`: the same rule as `cueDriftRef` – the reference is
the last passed `@mm:ss` mark, before the first mark the first; without
marks but with `duration:`, linear `durationS × idx / chunkCount`, marked as
rough; without either `null`, no time hints. `timeHintAllowed`: at least
90 s behind (marks) or 180 s (linear), and since the last time hint 60 s
more drift or five minutes passed; or at least 240 s ahead, at most once
per ten minutes.

## Cockpit UI

- **`#souffleuse-strip`**: one element, two homes, after the pattern of the
  clock in `applyCueMode`. Classic: `position: absolute` at the bottom edge
  of `#stage-cell` like `#add-note-btn`; in card mode the first child of
  `#cue-panel` under `#cue-where`. One line: glyph, text, `×`. Glyphs `◷`
  time, `◇` example, `△` fact, `◌` delivery, `▤` cue. `high` in red like
  `#center-toast.warn`, `low` ink with a `--rule` border. Auto-fade low
  15 s, high 25 s, then `dismiss {how: 'fade'}`. In the Esc chain after help
  and the link overlay, before text selection. Not `#center-toast`: that
  lies over the stage, is built for 1.8 s and cannot be dismissed.
- **Switch**: footer button `◌ prompter` beside `▤ cards`, `aria-pressed`;
  key Shift-S (`S` is a no-op in the cockpit, and a bare letter would fire
  mid-sentence). `flashMode` for transitions. A `.cmd-badge`
  `#souffleuse-badge` only for degraded states: `PROMPTER · server speech
  recognition`, `off – no OPENROUTER_API_KEY`, `off – OpenRouter
  unreachable`.
- **History panel** `#souffleuse-log`, the `#export-modal` pattern without
  a scrim: the last ten hints with time and kind, plus the switches for the
  interim line and cues. No key.
- **Interim line** `#souffleuse-heard`, the last eight or so words, muted,
  off by default.
- **Persistence**: `sessionStorage psi-slides:souffleuse = on`, so a reload
  during rehearsal switches the souffleuse back on; `localStorage
  psi-slides:souffleuse-heard` and `psi-slides:souffleuse-cues`. No
  localStorage for on/off – the microphone is an act of consent, and the
  button is the consent.
- **Chrome only under the flag**: `renderSpeaker` emits strip, badge, panel
  and button only with `opts.souffleuse`; `const SOUFFLEUSE = {lang,
  cadence, cues}` beside `VIEW_DEFAULTS`, otherwise `null`. The runtime
  section does nothing without `SOUFFLEUSE` and without `window.psiWatch`.
  Ids are `souffleuse-*`, words no slide would want.
- **Cues in `cueCardsFor`**: `souffleuseCues: Map<chunkId, [{cueId,
  text}]>`, not persisted, appended on beat 0 as `{bullets: [text],
  souffleuse: true}`; `cueRender` gives `.cue-card.souffleuse` a dashed
  track, `◌` and italics. After arrival `cueSync()`. In the classic layout
  `onActiveChange` shows a cue on arrival as a hint of kind `cue`. The
  textarea override is never touched.

## STT adapter

```
const SttAdapter = {
  name,
  available(lang) -> Promise<{ok, local, why}>,
  start(lang, { onFinal({text, t0, t1}), onInterim(text), onState(state) }),
  stop(),
};
```

Web Speech: `continuous`, `interimResults`, `lang` from `SOUFFLEUSE.lang`
(default `lectureLang`). The on-device path as above; `install()` in the
click handler, because it needs a gesture. `onend` → restart, capped at six
per minute, then a badge. `onerror`: `not-allowed`, `audio-capture`,
`network`, `no-speech`, each with its own badge text. The edge follows
`startDemo`: feature test, try/catch, the macOS toast.

A Node adapter (whisper.cpp) is later a second producer of the same `say`
structure inside Node that calls `sidecar.say()` directly; the cockpit then
reports `hello {stt: {engine: 'node'}}`. ElevenLabs is a third producer of
the same shape.

## Configuration

- CLI `--souffleuse` (a usage error without `--watch`), `--souffleuse-model
  <id>`. Environment `OPENROUTER_API_KEY` (required), `OPENROUTER_BASE_URL`
  (optional).
- Frontmatter, nested like `style:`:

  ```
  duration: 45            # minutes, or mm:ss / h:mm:ss
  souffleuse:
    model: anthropic/claude-sonnet-5
    language: de          # default: lang:
    cadence: 25           # seconds of new speech per tick, 10 to 120
    cooldown: 60          # seconds after a hint, 20 to 600
    cues: on              # on | off
  ```

  `talkDuration()` beside `lectureLang`, `souffleuseSettings()` after the
  pattern of `styleSettings`, both in the `buildOnce` pre-flight so
  `--print-only` sees the typo too. Precedence CLI, frontmatter, default.
- lint.js mirror: `unknown-souffleuse-setting` (error, the same indentation
  walk as the `style:` block, flow form included) and `bad-duration`
  (error, the `cover-ratio` pattern). The refusal pairs are in
  `test/settings.mjs`.

## Failure modes – silence plus one badge, never a modal

| case | behaviour |
| --- | --- |
| no `OPENROUTER_API_KEY` | sidecar `disabled`, console once, `hello` says so, badge; the transcript is still logged |
| socket gone | recognition stops, badge; `hello` after the reconnect heals it |
| no `webkitSpeechRecognition` | the button says so, badge, switch stays off |
| microphone denied | badge, switch off |
| server STT instead of on-device | badge stays up |
| 401 / 403 | `disabled`, no retries |
| 429 / 5xx / network | backoff 30, 60, 120 s; after five errors in a row `disabled` |
| timeout 8 s | discarded, carry on |
| garbage from the model | `nothing`; after five in a row `status error` |

## Privacy

One sentence in three places – the console at start, the help overlay
(group "The prompter"), the README: recognition on-device or via Google
(Chrome); transcript and deck text including notes go as text to
openrouter.ai; the log lies beside `source.md`. Never audio outward, never
anything to the projection, never into the snapshot, never into
`source.md`, never a key into the HTML. The microphone hears the room too:
Shift-S off before a question round, or tell the room.

## Tests

- **Gate `test/gates/souffleuse.mjs`**: `deckPayload` on a fixture object,
  prefix stability and hash, `tickMessage` (`NEW`, window, `cue_targets`,
  `✕`), `parseAnswer` (tool call, content fallback, garbage, 13 words, a
  cue on the active chunk), `createPolicy` (every row of the table),
  `driftSeconds` and `timeHintAllowed`, `shouldTick`, and that the module
  has no `import` line.
- **`inlined` gate**: adjust the count of scanned literals.
- **Playwright `test/souffleuse.mjs`**, building a deck of its own: a fake
  OpenRouter as `http.createServer` on 127.0.0.1 with scripted answers,
  `spawn(node build.js fixture --watch --serve --souffleuse --events)` with
  `OPENROUTER_API_KEY=test` and `OPENROUTER_BASE_URL`, a fake
  `webkitSpeechRecognition` via `addInitScript`. Checks button, badge, a
  hint in under 5 s, the request body (`cache_control`, `tool_choice`,
  `NEW`), no key in the HTML, Esc → `dismiss` in the JSONL, slide tick → cue
  → `.cue-card.souffleuse` under `K`, two windows with an identical
  snapshot without a souffleuse field and an audience without
  `#souffleuse-strip`, 500s → badge without a dialog.
- Not testable: recognition quality, on-device availability, cache hit
  rate, the model's restraint. For those, the log and a rehearsal before
  the first real use.

## Docs that move with it

CLAUDE.md (commands block, a paragraph on the fourth zero-dep module,
conventions), speaker.md (§2 local table, §3 socket messages, §4.1, §4.2,
§5), the help overlay, CHANGELOG `[Unreleased]`, HANDOFF.md, README, a new
skill `.claude/skills/psi-slides-souffleuse/SKILL.md` with an entry in
CLAUDE.md § Reference material, `test/README.md`, `.gitignore`, the tracked
lectures rebuilt and committed.

## Slices, in this order – each a commit, build green

0. Worktree and branch; this document.
1. Configuration, pre-flight, lint mirror: `talkDuration`,
   `souffleuseSettings`, `buildOnce` returns `lecture`, pairs in
   `test/settings.mjs`. Every existing `source.md` builds identically.
2. `souffleuse.mjs` plus gate.
3. The sidecar in `build.js`: flags, dynamic import, socket switch, `fetch`,
   backoff, JSONL, `--events`, usage text. A hand test with a real key and
   a small Node WS client. The diff of `lectures/tutorial/speaker.html`
   before and after: empty.
4. Cockpit client, STT adapter, switch: `psiWatch.on`, `SOUFFLEUSE`, Web
   Speech with the on-device path, button, Shift-S, badges, help overlay;
   hints through `flashCenter` for now.
5. Strip, history, interim line, cue merge, Esc chain, the classic-layout
   display of a cue.
6. Playwright spec with fake STT and fake OpenRouter; `test/README.md`.
7. Docs, CHANGELOG, HANDOFF, skill, tracked lectures. First real rehearsal,
   read the log, record the policy numbers under "Decisions along the way".

Risks, named: the template-literal traps (no backtick, `\\s`),
`#souffleuse-*` against chunk ids, the order in the Esc handler, the strip
in card mode in front of `#cue-rail` without disturbing its scroll
arithmetic, the Chromium bug in `available()` on macOS.

## Progress

- [x] Slice 0 – worktree `../psi-slides-souffleuse`, branch `souffleuse`,
      this document.
- [x] Slice 1 – configuration, pre-flight, lint mirror: `talkDuration`,
      `SOUFFLEUSE_SPEC` / `souffleuseSettings` in build.js, the lint mirror
      with `nestedBlockKeys` shared by the `style:` and `souffleuse:` walks,
      `bad-duration`, the key-set check in the tails gate, the pairs in
      test/settings.mjs.
- [x] Slice 2 – `souffleuse.mjs`, zero-dep and zero Node API: `KINDS`,
      `SEVERITIES`, `MAX_WORDS`, `TOOL_SCHEMA`, `wordCount`, `prefixHash`,
      `deckPayload`, `flattenMarks`, `cueTargets`, `systemPrefix`,
      `tickMessage`, `parseAnswer`, `driftSeconds`, `timeHintAllowed`,
      `shouldTick`, `createPolicy`; the gate `test/gates/souffleuse.mjs`
      (107 assertions, every row of the policy table) registered in
      `test/gates/run.mjs` and in `test/README.md`.
- [x] Slice 3 – the sidecar in build.js: `createSouffleuse` (`onBuild`,
      `onMessage`, `say`, `setEnabled`, `close`) with `souffleuseLogPath`,
      the `--souffleuse` / `--souffleuse-model` flags and the usage block,
      `psiWatch.on` plus a public `ask` in `reloadScript`, the `souffleuse-*`
      arm of the watch socket with the cockpit socket tracked in `runWatch`,
      the `souffleuse` event type and the `souffleuse` stdin command, and
      `souffleuse-*.jsonl` in `.gitignore`. Hand-tested against a fake
      OpenRouter and a Node WebSocket client: hint, cue, `nothing`, HTTP 500,
      the disabled path and the usage error.
- [x] Slice 4 – the cockpit client: `psiWatch.onConnect`, `SOUFFLEUSE` beside
      `VIEW_DEFAULTS`, the `webSpeechAdapter` behind the planned interface,
      the footer switch and `viewHooks.onShiftS`, the `#souffleuse-badge`
      with an ear reason and a sidecar reason of its own, the help group
      "The prompter", and hints through `flashCenter` until the strip
      exists. Hand-tested in a Chromium against a fake OpenRouter and a
      fake recogniser: switch, badge, say, move, hint, fade-dismiss.
- [x] Slice 5 – `#souffleuse-strip` in its two homes (`cuePlaceStrip`, called
      from `applyCueMode`), the `×`, the auto-fade and the Esc step
      (`viewHooks.escapePrompter`, after the help panel and the address
      overlay), `#souffleuse-log` behind a Shift-click on the switch with the
      two preferences in it, the interim line `#souffleuse-heard`, and the
      prompter's cards merged into `cueCardsFor` on beat 0 and drawn by
      `cueRender` as `.cue-card.souffleuse`; in the classic layout the same
      card arrives as a strip hint of kind `cue`.
- [x] Slice 6 – `test/souffleuse.mjs`: a fixture deck of four slides, a fake
      OpenRouter on loopback reached through `OPENROUTER_BASE_URL`, a fake
      `webkitSpeechRecognition` installed with `addInitScript`, and one real
      `node build.js … --watch --serve --souffleuse --events` as a child. 51
      assertions in about eight seconds: the switch and its sessionStorage,
      the request body (`cache_control`, forced `advise`,
      `parallel_tool_calls`, `reasoning.effort`, `session_id`, the state
      line, `NEW`), the hint on the strip with its glyph and severity, Esc to
      a `dismiss … esc` line in the JSONL, a slide tick to a card in a later
      slide shown both as a strip hint in the classic layout and as
      `.cue-card.souffleuse` under `K`, a `nothing` that reaches no screen,
      an HTTP 500 to a badge and no dialog, and two windows in which the
      projection has none of the chrome and no field of `snapshot()` is the
      prompter's. Registered in `test/run.mjs` and in `test/README.md` as the
      ninth spec that builds a deck of its own.
- [x] Slice 7 (docs) – the documentation that moves with the feature: CLAUDE.md
      (the commands entry, the `souffleuse` `--events` type, the fourth zero-dep
      module and the sidecar in *Architecture*, the `souffleuse-*` id namespace
      and the `SOUFFLEUSE_SPEC` mirror rule in *Conventions*, the skill and this
      plan in *Reference material*, and the stale gate and spec counts),
      `speaker.md` (§2's local table, the new §3.1 on the watch-socket messages,
      §4.1's five pieces of chrome, §4.2's `Shift`-`S` and the Esc chain, §5's
      three storage keys), CHANGELOG `[Unreleased]`, HANDOFF's Souffleuse slice,
      README (the flag, the hotkey, and what leaves the machine), the new skill
      `.claude/skills/psi-slides-souffleuse/SKILL.md`, and `test/README.md`.
- [ ] Slice 7 (rehearsal) – **has not happened.** The checklist is below; the
      policy numbers it produces belong under *Decisions along the way*.

## Decisions along the way

- **A bare clock is put back to text at the parse site.** `duration: 45:00`
  is a clock to the author and a sexagesimal integer to YAML 1.1, which is
  what gray-matter speaks: it arrived as 2700, and `talkDuration` would have
  read that as minutes. Rather than require quoting, `parseLecture` restores
  the string the author wrote from the raw frontmatter that gray-matter also
  hands back. The linter never saw the number, so it needed nothing.
- **The `style:` walk in lint.js is now `nestedBlockKeys`**, shared with
  the `souffleuse:` walk. Flow form included, so a typo in
  `souffleuse: {cues: of}` fails the pre-commit gate the way one in
  `style:` does.
- **`notesToCards` is injected, not imported.** `deckPayload(lecture,
  {notesToCards})` takes the cue-card grammar from its host the way
  `createDiagramCompiler({…})` takes its Node leaves. The alternative was a
  second copy of the `@mm:ss` parse, which is the duplication this repository
  already pays for once between build.js and lint.js and did not need a third
  time. Without it the notes still travel, as prose, and carry no marks – so
  the sidecar has to inject it, and the gate proves both halves.
- **A divider is numbered like any other slide, and `n - 1` is `idx`.**
  `flatChunks` in the cockpit collects every `.chunk` of every `.column`, and
  a headed column emits a divider before its first chunk, so the divider is an
  entry there and is one in `deckPayload`. One thing does not line up and slice
  3 has to know it: the divider's *element* id is `<col-id>-section` (or
  `__section-cN`), while the payload gives it the column's own id, or `col:N`
  when the column has none. So a `souffleuse-move` is resolved by `idx`, never
  by id, and `cueTargets` skips dividers altogether – a cue is a card in a cue
  list, and a divider has none.
- **The hash is FNV-1a over the UTF-16 code units, eight hex digits.** It names
  a prefix in the log and rides out as `session_id`, where a collision costs a
  cache miss and nothing else; `crypto` would have been the first Node API in a
  file whose contract is that it has none.
- **A compiled figure is `[figure, steps: N]`, and a code fence keeps its
  lines.** By the time `buildOnce` hands the lecture over, a `::: draw` block
  is already an inline `<svg>` of a few thousand characters – none of them
  words the room hears. The fence markers go the same way; the code between
  them stays, because a speaker can misstate it and that is a `fact` hint.
- **A mark carries its beat, and `flattenMarks` is the fourth export nobody
  planned.** This document asked for `marks[]` as a list of seconds on the
  chunk and for `driftSeconds` to read `{idx, beat, at}`, and the beat is not
  recoverable from the first shape – it is a fact about the note the `@mm:ss`
  stood in. So a chunk's `marks` are `{at, beat}` and `flattenMarks(deck)` adds
  the `idx`. The prompt still prints them as clock times.
- **The reason a `hello` is refused rides in the reply's own `why`.** The plan
  wrote the answer as `{enabled, why?, model, cadence, cues}`, and it cannot be:
  `reply` spreads the payload *first* so that no payload field can shadow a
  protocol one, which means a payload `why` is overwritten by the protocol's.
  So the answer is `{enabled, model, cadence, cues, session}` and the disabled
  reason is the reply's `why`, with `ok` still true – the hello did reach the
  sidecar, and it is answering.
- **The cockpit's clock starts at `hello`, not when the watcher did.** The
  sidecar carries the cockpit's `elapsed` forward with the wall clock between
  messages, so that a cadence in seconds means seconds. Stamped at creation,
  that made the minutes an author spent writing slides before switching the
  prompter on count as minutes of the talk, and the opening quiet was over
  before it began – in the first hand test the first hint died as
  `start-quiet` with `elapsedSinceOn` 57. `hello` re-stamps the wall clock, so
  "switched on at the cockpit's current clock" is what `onAt` means.
- **`off` and `idle` are the two halves of not running.** The plan's five
  status states do not say which is which. `off` is the sidecar saying it
  cannot work at all – no key, a refused key, five failures – and carries the
  reason; `idle` is the speaker (or the `--events` stdin command) having
  switched the prompter off, which reverses on the next press. `listening` and
  `thinking` are the working pair, `error` is a backoff or a run of unusable
  answers.
- **A status is on the socket, in the log and in `--events`; on the terminal
  only when it is news.** `thinking` and `listening` alternate once per tick,
  which on a 45-minute talk is a hundred lines through the middle of the build
  log the author is reading. The console gets the states a person would want
  to be told about, and the log gets all of them.
- **A timeout is not a streak.** The backoff counts 429s, 5xx and network
  failures; an 8-second abort is logged as `error: timeout` and changes
  nothing, because the network is not broken – the answer merely missed the
  sentence it was about. A run of unusable *answers* is counted separately
  (`garbage`, `too-long`, `bad-cue`) and reaches `status error` at five,
  without disabling anything.
- **`psiWatch` also exposes `ask`.** `on(type, fn)` was the planned half; the
  cockpit needs the other direction too, and five `souffleuse-*` methods on
  the object would each be a line saying the same thing. The listener map is
  consulted *after* the `-result` pairing, never instead of it.
- **A cue takes neither the standing slot nor a cool-down.** It is a card laid
  into a slide that is still to come, nobody reads it now, and the plan's table
  gives it two rules of its own – `cue_targets` and one per chunk. Those are
  the two the policy applies.

- **The history opens from the switch, with Shift.** The plan said "no key"
  and left the door unchosen. Every free letter in the cockpit is a
  navigation command that would fire mid-sentence, and the history is read
  after a talk or between two slides - never inside one - so it needs no key
  at all. The switch is the only chrome the prompter owns, and a modifier on
  it is one affordance rather than two. The `⋯` in the strip was the
  alternative and would have been unreachable exactly when the strip is
  empty, which is most of a talk.
- **The beat is `cuePosition(entry).consumed`, and nothing else may compute
  it.** It is the number of presses the slide has taken - what a cue card is
  filed under, what an overlay's `from N` counts, and what `deckPayload`
  numbered the beats by. A second walk of the same DOM written by hand is
  how the two halves of this feature would come to disagree about which beat
  a sentence was said on. The clock sent with it is `elapsedSeconds()`
  unrounded to two decimals: the digits are floored for the display, but
  four fifths of a second of speech is not zero seconds of speech and the
  cadence is counted in those.
- **The badge needs a memory, because a status arrives every tick.** The
  first version wrote the badge directly, and the plan's rule - `idle`,
  `listening` and `thinking` clear it - wiped the reason one message after
  it was given: a refused key put "off - no OPENROUTER_API_KEY" up, and the
  `idle` that answered the cockpit's own switch-off took it down again, at
  exactly the moment a lecturer is looking for it. So the ear keeps one
  reason and the sidecar keeps another, and the badge is painted from the
  pair with server recognition as the quiet thing left underneath.
- **`#cue-rail` is now `position: relative`.** `cueRender` scrolls to
  `curEl.offsetTop`, which was measured against whatever positioned ancestor
  happened to be up the tree - so anything growing above the rail, the strip
  included, moved every card by its own height. The rail is the frame its
  entries are measured against, and saying so is one line and no behaviour
  change for a cockpit without a prompter.
- **A cue shown in the classic layout is dismissed locally.** It has a
  `cueId`, not a `hintId`: the sidecar filed it as a card for a slide and
  has nothing to record about it leaving a strip it never knew it was on. So
  a hint shown by this window alone carries a null id and the dismiss stays
  here.
- **The checkbox is `#souffleuse-heard-toggle`.** The plan gave that id to
  both the interim line and the switch that shows it; one of them had to
  move, and the line is the thing the plan names elsewhere.
- **The spec moves the clock instead of waiting it out.** The opening silence
  is 60 s and the cadence 25 (10 at the floor of `SOUFFLEUSE_SPEC`), and both
  are counted in seconds of the *cockpit's* clock – the adapter stamps a
  segment with `souffClock()` and the sidecar carries that number forward.
  So the fake ear exposes `advance(seconds)`, which pushes `tStart` back, and
  `__stt.final(text, 70)` is seventy seconds of talk in the time it takes to
  dispatch an event. Waiting the same arithmetic out in real time would have
  made one spec longer than the four editor suites together; as written the
  whole thing is about eight seconds, most of it the build.
- **Only one HTTP 500 is asserted, because the second one costs 30 s.** The
  plan asked for three failures in a row. The first one sets `backoffUntil`
  to now + 30 s and `maybeTick` returns early until then, so the second
  failure cannot be provoked at all inside a test – which is the backoff
  working. The badge and the reason on it are decided by the first error, so
  that is what the spec reads; the streak of five and the `disable` behind it
  stay the gate's business and the log's.
- **A card has to be waited for in the page, not in the log.** The sidecar
  writes its `cue` line before it puts the message on the socket, and the
  first version of the spec polled the file. It passed three times and then
  did not: the walk reached the target slide a few milliseconds early,
  `souffCueOnArrival` found an empty map, and – because it marks the slide as
  seen on the way through – the card never appeared even once the message
  landed. The spec now polls `souffleuseCues` in the cockpit. **The
  behaviour is real and worth knowing**: a card that arrives while the
  speaker is already walking onto its slide is shown by `cueSync` in the
  rail, but in the classic layout it is not shown at all.
- **A comment in `SPEAKER_JS` named the environment variable, and the page
  shipped it.** The spec asserts that `speaker.html` never says
  `OPENROUTER` – the cheapest possible check that the key's whole world stays
  in Node. It failed on a comment inside the cockpit's own template literal
  quoting the badge text "off – no OPENROUTER_API_KEY". Reworded rather than
  the assertion weakened: a privacy check that has to allow exceptions is not
  one. (The two tracked `speaker.html` files moved by that one line.)
- **The engine's own server 404s a favicon, and the runner counts that.**
  `test/harness.mjs` answers 204 for exactly this reason, but this spec is
  served by `build.js --serve`, which does not. The browser answers it
  instead, through `page.context().route`, so "no page errors" stays an
  assertion about the lecture. The pages also go to `about:blank` before the
  child is killed – a cockpit whose watch socket dies reconnects, and a
  refused WebSocket is a console error.
- **What the spec cannot say.** Recognition quality, on-device availability
  (the fake claims it; the Chromium bug on macOS is about the real one),
  whether the cache is warm, and the model's restraint – all four as the plan
  said. Two more turned up: the snapshot is asserted to carry no field whose
  *name* mentions the prompter, which is not the same as proving no value
  ever rides in one, and the auto-fade of a standing hint is left alone,
  because 15 and 25 s of real time are worth more than the assertion.

### Code review

A review over the finished feature found ten defects, every one reproduced
before it was fixed. They are recorded here because eight of the ten are the
same kind of mistake – a piece of state that two halves of the feature
disagreed about – and the ninth and tenth are the two this repository is
already known to make.

1. **Two clock regexes, one of them narrower.** The sexagesimal restore in
   `parseLecture` matched two digits before the first colon where
   `talkDuration` and `lint.js` matched three, so `duration: 120:00` linted
   clean, arrived from gray-matter as the integer `7200` and was refused as a
   talk of 7200 minutes. One constant now, `TALK_CLOCK_SRC`, read by the
   restore and by the reader, with the same literal mirrored by hand in
   `lint.js` and a comment naming it. Two accepted pairs in
   `test/settings.mjs`.
2. **A second recogniser.** `souffStart` guarded on `souffOn`, which is only
   true after two awaits, so a second press – or the `sessionStorage` restore
   arriving beside a click – opened a second `SpeechRecognition` whose finals
   all arrived twice. `souffStarting` is set before the first await and
   cleared in a `finally`; the adapter's `start()` aborts an open recogniser
   as the guard a caller cannot forget.
3. **`idle` stopped the light, not the ear.** A sidecar `idle` (the `--events`
   stdin switch) set `souffState` and left `souffOn` true with the microphone
   open: undoing it took two presses, and a reload in between said hello and
   switched the sidecar back on. The cockpit now treats `idle` exactly like
   `off` – ear, switch, strip, timers and the consent in `sessionStorage` –
   and the only difference is the badge, which `off` writes its reason onto
   and `idle` leaves alone. **The consent is dropped deliberately**: a switch
   somebody threw should not be undone by the next save.
4. **A hello was a switch.** `hello()` set `on = true` whatever it answered,
   and the cockpit undid that with a separate, un-awaited toggle when the
   answer said `enabled: false` – so a lost reply or a `start` that threw left
   the sidecar calling a model for a cockpit that was off. A hello now
   registers the socket, stamps the clock and says nothing on the status
   channel unless it is news; `toggle` and `setEnabled` are the only switches.
   The reconnect path sends the toggle again, because the watcher may have
   been restarted under the page.
5. **A hint nobody held blocked every hint after it.** `policy.shown()` ran
   before `sendToCockpit` and its answer was ignored, and the standing slot
   had no age limit – so a hint lost to a closing socket or a rebuild mid-hint
   dropped every `low` hint for the rest of the talk, under the reason
   `standing`, which in the log reads exactly like the policy working. Now:
   nothing is recorded unless the send succeeded (`suppressed … no-cockpit`
   otherwise), `hello` calls the new `policy.forgetStanding()`, and
   `createPolicy` takes `standingMax` (default 40 s, the cockpit's 25 s fade
   plus a margin) with `standing(now)` treating anything older as gone. Six
   rows in the gate.
6. **The cards were write-only.** A cue was recorded on send but kept only in
   the cockpit's memory, so a reload lost the card while the sidecar went on
   holding that slide locked against a second – and the cue checkbox was a
   cockpit-only preference the sidecar never heard, so cues were judged,
   locked and fed to the duplicate rule with the box off. The `hello` reply
   now carries `cueCards` (the `cues[]` array, which existed and was never
   read) beside the existing `cues` boolean, and a new `souffleuse-prefs
   {cues}` – its own message, because the box is changed mid-talk with the
   switch untouched – makes `cuesAllowed` the conjunction of the deck's
   ceiling and the speaker's answer, so `cueTargets` is empty when it is off.
   Its reply carries the cards too, so ticking the box back on restores them.
7. **The log's location was right and its promise was not.** The JSONL holds
   the spoken words verbatim and belongs beside the deck – that is what a
   debrief is – but the `.gitignore` comment read as though the pattern
   covered every repository a lecture can live in. The comment says what it
   covers, the sidecar prints the log's **full path** plus one sentence on
   every start, and the README's privacy paragraph and the skill say it too.
   `--new` scaffolds no `.gitignore`, so there was nowhere else to put it.
8. **`--souffleuse-model` alone built an ordinary deck and said nothing** –
   the silent no-op this CLI refuses everywhere else. A `userFacing` refusal
   now, beside `--souffleuse` without `--watch`.
9. **The strip outlived the switch.** `souffStop` left `souffHintTimer` and
   `souffHintFade` running, so a standing hint faded fifteen seconds after the
   ear had closed and sent a dismissal to a sidecar nobody was listening to.
   `souffClearHint('off')` takes the strip, both timers and the history's `how`
   with the switch, and sends nothing.
10. **36 KB of prompter in every cockpit ever built.** The runtime was the
    foot of `SPEAKER_JS` and its rules were inside `SPEAKER_CSS`, while the
    comment in `renderSpeaker` promised that a build without the flag is the
    file it was before the feature. They are `SOUFFLEUSE_CSS` and
    `SOUFFLEUSE_JS` now, spliced only under the flag and **into the same
    `<style>` and `<script>`** – the runtime is in `SPEAKER_JS`'s lexical
    scope and a script element of its own would give it nothing but
    `undefined`. Three things moved with them: `#cue-rail { position:
    relative }`, which the plan had decided to leave unconditional and which
    costs nothing to make conditional because the strip is the only thing that
    ever grows above the rail; `cuePlaceStrip`, which now **wraps**
    `applyCueMode` the way the two `viewHooks` are chained, and runs once
    itself because the cue section restored the saved arrangement before this
    text existed; and the blank line every prompter-less cockpit carried where
    `${souffleuseChrome}` stood on a line of its own.

    `lectures/tutorial/speaker.html` went from 2,533,265 bytes to 2,499,472,
    against 2,496,976 on `main`. **The 2,496 bytes that remain are not
    byte-identity** and cannot be without giving something else up: 21 lines
    are `viewHooks.onShiftS`, `viewHooks.escapePrompter` and their two key-map
    arms, which live in `AUDIENCE_JS` and so are in `audience.html` too –
    they are the hook contract, and a hook is how a press comes to mean one
    thing in one window; 28 are `souffleuseCues` and the merge in
    `cueCardsFor` plus the two lines in `cueRender` that draw a prompter's
    card as the prompter's, which the rail needs whether or not a literal was
    spliced and which are free over an empty Map; one is `const SOUFFLEUSE =
    null`. The review asked for both these lines and an empty
    `git diff main -- lectures/`, and those two cannot both be had.

### Adversarial review

A second review, adversarial this time, over the whole feature including the
ten fixes above. Eighteen findings; four of them change what the prompter does
and the rest are about being able to see what it is doing. One line each.

1. **The cockpit's clock restarted on every save and the sidecar believed it.**
   `tStart` is the page load and `--watch` reloads the page; the drift went
   wildly negative, a tick stamped in the sidecar's own future stopped every
   slide tick for the rest of the talk, and the opening quiet minute was
   stamped afresh each time. Both ends: the cockpit keeps its origin in
   `sessionStorage` while the prompter is on (and only then – a cockpit opened
   while the room fills is meant to start at 0:00, and the clock button still
   says so), and `rebaseClock` in souffleuse.mjs moves the switch-on stamp, the
   last tick and the transcript onto any clock that drops by more than five
   seconds. A talk past its quiet minute is not made to sit through it again.
2. **A 200 carrying `{error: …}` and no `choices` was read as model garbage** –
   so a model out of credits or a mistyped id was logged five times as
   `garbage`. It routes to `trouble()` with the body's own message and code,
   and `HTTP <status>` carries that message too.
3. **`wordCount` answered 1 for a Chinese sentence**, so the twelve-word gate
   let a paragraph through and the cadence's eight words were never reached.
   Characters in the dense scripts count one each.
4. **The prompt was invisible, there was no dry run and no replay.** The system
   prefix is written beside the log as `souffleuse-<hash>.prompt.txt`;
   `--souffleuse-dry-run` runs everything but the call and needs no key;
   `--souffleuse-replay <file.jsonl>` reads a finished run back through today's
   policy and says what it would do now (`replayAnswers`, gate-tested).
5. **A suppressed answer said nothing on the terminal**, so a prompter that had
   been refused six times looked exactly like one with nothing to say. One line
   per answer the model meant something by.
6. **`bad-cue` dropped the evidence.** A refusal now carries the text, the
   chunk id, the kind and the model's `why` through into the log line.
7. **A second cockpit took the prompter in silence.** The displaced socket is
   sent `souffleuse-status {state: 'idle', why: 'another cockpit took the
   prompter'}` before it is replaced.
8. **The history was hints only.** A card puts a row in it too, naming the
   slide it was filed into.
9. **An `idx` past the end of the deck poisoned the drift silently.** Clamped,
   with a `warn` line; and a rebuild drops cards for slides it no longer has
   (which was finding 18).
10. **A laid card was invisible until the speaker reached it.** The strip
    acknowledges it for six seconds, naming the slide, and never over a hint
    that is standing. The checklist below says *walk to the slide*.
11. **`Shift`-`S` was in no crib, and the privacy sentence was below the fold.**
    The footer's crib carries it under the flag; the sentence is the first row
    of *The prompter*, which is now the first group of the speaker's help.
12. **The switch-on toast named where recognition runs, never where the text
    goes.** The first switch-on of a tab says both.
13. **Cache and latency never reached the terminal.** One line on the first
    answer of a run: how long it took and how much of the prefix was cached.
14. **Four doc strings the code cannot produce** – the two `psiWatch.ask`
    refusals, `souffClock` rather than `elapsedSeconds`, and `beat 2/3`, which
    the state line promised and nothing set: `souffleuse-move` carries `beats`
    now, because `cuePosition(entry).total` exists in the cockpit's DOM and
    nowhere else.
15. **The spec's fixture claimed a time mark and had none** – `@0:00` stood on
    the note's second line, where it applies to the card after it, so every
    drift in that spec was the linear estimate. It opens the first line now,
    and the spec asserts the drift is not `(rough)` and that the prefix carries
    the mark.
16. **The request body was asserted shallowly**: the model id, the tool name,
    and one prefix text identical across every call of the session – the cache
    assumption, which no single request can show.
17. **A toggle after a refused key answered `on: true`.** `setEnabled(true)`
    refuses while the sidecar is disabled, and the 401/403 reason ends with
    what the speaker can do: restart the watcher with a corrected key.
18. Folded into 9.

The gate is 134 assertions now and the spec 89, and the two things the spec
still cannot show are the two it never could: whether the cache is warm on a
real provider, and whether the model is restrained. The dry run and the replay
are what a rehearsal has instead.

### Second correctness review

Three findings, after the adversarial one, on the pushed branch. The first is
the only defect in this feature that would have cost money at the lectern.

- **`maybeTick` read `shouldTick`'s `reason` where it had to read
  `coalesce`, and called the model back to back for the whole talk.** Under
  `inflight`, `reason` is the reason of the call already out and is therefore
  always set; `coalesce` is the field that says a *new* occasion arrived. So
  every `say` and every `move` scheduled a follow-up, which `finish()` fired
  at once, which was itself in flight when the next sentence arrived. Measured
  against a slow endpoint: ten calls in forty seconds where two were due. It
  needs a reply slower than the gap between two sentences, which is why every
  fake in this repository answers too fast to show it – and why the gate now
  asserts that the two fields differ, in the one place a reader meets them.
- **The adapter's own re-entrancy guard built the duplicate ear it guards
  against.** `start()` aborts the open recogniser, clears the slot and opens
  the next one synchronously; the aborted one's `end` then arrives, clears the
  slot that now holds the *live* recogniser, and starts a third. Two ears,
  every sentence sent twice, the cadence counted twice. Each handler now asks
  whether it is still the live instance. The spec stales an instance
  deliberately and fires its `end` a second time.
- **A condition that passes left its sentence on the badge.** `network` and
  `error` are the two states the ear restarts itself underneath, but their
  badge came down only when the switch was thrown twice, so a hiccup wrote
  over a prompter that was working. The next final result it hears is the
  proof, and it is the only one the ear has.

### Third correctness review

Nine findings over the delivery work and the two clocks under it, every one of
them reproduced against the pure module before it was touched and every probe
then left behind as a gate row – which is how this feature is meant to be
worked on. Two of the nine make a measurement or a policy describe something
other than what it claims, and they are the two worth reading.

1. **The "spoken seconds" included the silence, so every delivery figure was
   about the wrong seconds.** The adapter stamped a segment's `t0` with the end
   of the *previous* final result, so the pause between two sentences sat inside
   `t1 - t0`. `longestGap` was therefore structurally 0 with the real ear – the
   rehearsal line above reading `longest silence 0s` was the tell and was read
   as a speaker who never paused; a speaker who thought for a minute and then
   said a sentence had that sentence rated at about ten words a minute, so
   `slow` was reported for the opposite of the truth; `sampled` reached its
   twenty-second floor on silence alone; and the cadence counted the quiet as
   speech, so a tick could fire without anyone having said much. **Neither suite
   could see it**: the gate feeds hand-built `t0`/`t1`, and the spec's
   "measured over the seconds actually spoken" was tautological, because
   `final(text, 25)` *defines* `t1 - t0 = 25`. The ear now takes `t0` from
   `speechstart`, with the first interim after a final as the fallback and the
   end of the last final – re-stamped on every restart – as the floor under
   both, and `Math.min(…, t1)` keeps a span non-negative through a clock the
   lecturer restarted mid-sentence. The fake ear grew `__stt.utterance(text,
   pause, spoken, how)` for the shape `final` cannot model, and the assertion
   the tautological one should have been: **the segment is shorter than the wall
   gap in front of it**, driven through both spellings of the evidence.
2. **A clock rebase left the policy on the dead clock.** `rebaseClock` moved
   `onAtElapsed`, `lastTickAt`, `lastTimeHint` and the transcript; the policy's
   `lastShownAt`, its per-kind stamps, the standing hint and every history row
   stayed where they were, as did `hints[].at` and `cues[].at`. A hint shown at
   1500 with the clock restarting to 5 answered `cooldown` at 5 *and* at 600,
   clearing only at 1525. The scenario is not hypothetical: a second cockpit tab
   taking the prompter twenty-five minutes into a talk – supported since the
   adversarial review – has its own `sessionStorage` and starts near 0:00, so
   every `low` hint was refused for the next twenty-five minutes under a reason
   that reads in the log exactly like the policy working, and the tick message
   printed "hints given" at times in the model's future. `createPolicy` has
   `rebase(delta)` now, called beside `rebaseClock`. The *ages* survive the
   move, which is the same principle the transcript is moved under, so a hint
   shown a second before the jump was shown a second ago rather than never – the
   reviewer's own probe expected the refusal to clear outright, and that would
   have thrown the age away.
3. **Before the first time mark, "ahead" was a number about nothing.** With the
   first `@mm:ss` on slide 3 – the natural way to write them – a speaker on
   slide 1 at 1:05 was `drift -685s ahead` with `time_hint_allowed=yes`, so the
   prompter was invited to whisper about a clock nobody had reached. Decks here
   start at `@0:00`, which is why `spoken-talk` never showed it. `driftSeconds`
   answers `beforeFirst` now, `timeHintAllowed` closes the *ahead* branch on it
   and leaves *behind* alone (past that mark's time and still on slide 1 is
   genuinely late), and the state line says so where the number is, the way the
   cockpit's own `cueDriftRef` shows it grey and labelled.
4. **A reconnect to a restarted watcher failed in silence.** A restarted
   `--watch` has a new nonce, which the open page does not have until a save
   reloads it, so `onConnect`'s hello came back refused – and the handler
   returned. The switch stayed pressed, the ear stayed open, every segment was
   refused by the nonce check, and the heartbeat under the strip went on saying
   `listening`, which is the third time this feature has been caught putting a
   light over a dead ear. It now does what `souffStart` does with the same
   refusal. Asserting it would need a second engine on the same port, which is
   not worth a spec; it is in the skill instead.
5. **A dry run never beat.** The heartbeat counts `thinking`, and the dry-run
   branch emitted only `listening` – so the mode whose whole job is answering
   "is this wired up" showed the word `listening` for a whole talk. Both states
   are quiet on the terminal, so the pair costs nothing.
6. **A rebuild mid-call could lay a card into a slide that is gone.**
   `session.cueTargets` was computed against the deck of the tick, and only
   cards *already* laid are swept by `onBuild` – so an answer arriving after a
   rebuild was filed under a dead id and replayed into every reloaded cockpit
   until the next build dropped it. Checked against the current deck and logged
   as `suppressed … stale-deck`.
7. **A reload re-entered the opening quiet in the cockpit only.** `souffStart`
   stamped `souffOnAt` on the restore path too, so after each save the cockpit
   showed heard-words for another minute and said it could not help yet through
   a minute in which it could, while the sidecar correctly did not re-quiet. The
   stamp is kept beside the clock it is measured on
   (`psi-slides:souffleuse-onat`) and read back only when this is not a gesture;
   a value in the new clock's future is a clock somebody restarted, and then the
   minute is owed again. `souffAskCount` still restarts with the page, which is
   honest: it counts what *this* page has seen go out.
8. **Documentation the code no longer produced**: the hello payload carries
   `onDevice` and `installing` beside `{engine, local}`, and the reply carries
   `startQuiet`, which the skill relies on two sections later. Both fixed in the
   skill and in `speaker.md`, and the delivery, policy, drift and adapter
   sections re-read against the code – finding 1 changes what `t0` means, and
   the skill stated it as a property.
9. **A trap worth writing down.** `rebaseClock`'s reasoning holds only where the
   clock that died is the one the sidecar's state is stamped on. The other
   direction – a *fresh* sidecar and an old page, reachable now that a refused
   reconnect switches the cockpit off and the speaker presses again – has
   `onAtElapsed` near 0 against a cockpit clock at 25:00: nothing drops, so no
   rebase fires, and the fresh policy has no history, so a hint already
   whispered can come back word for word. Not fixable without persisting the
   policy across processes, which a rehearsal tool does not earn. It is in the
   skill's *Traps*.

The gate is 188 assertions now and the spec 113.

### The delivery: tempo was missing input, not missing prompting

The author asked for a prompter that watches his *delivery* – too fast, filler
sounds piling up, an argument gone incoherent, and something his own notes
planned that he has walked past – and for a card to be layable onto the
conclusion for a good sentence said in passing.

**The insight the work turns on: the model has no tempo information at all.**
It receives text. Speaking rate, hesitation, filler density and long silences
are simply absent from a transcript, so "notice that I am speaking too fast"
was never a prompting problem – it was missing input, and no amount of asking
would have fixed it. Anything the code can count, the code counts;
`speechStats({transcript, now, window, lang})` measures it over the *same*
rolling window the transcript already rides in (one walk, `windowOf`, shared
with `tickMessage`, because two would describe two different stretches of the
same talk) and the state line carries one extra line:

```
delivery: 272 wpm (very-fast) · 7 fillers in the last 46s spoken · longest silence 0s
```

The model is then asked only whether the numbers are worth a whisper.

The thresholds, and why each is the number it is:

- **The rate is over spoken seconds, never wall time.** The sum of `t1 - t0`
  per segment, which is what the cadence already counts: a speaker who says
  forty words in twenty seconds of talking and then thinks for a minute spoke
  at 120 wpm, not at 30. The silence is its own figure, `longestGap`, because
  a speaker who has lost the thread goes quiet.
- **`PACE_WPM` is `easy` 110, `brisk` 150, `fast` 170, `veryFast` 190**, and
  `paceVerdict` reads the five words off it – published guidance for presenting
  sits at roughly 100 to 150 wpm. Generous at the top on purpose: 160 is brisk
  and usually known, 190 has stopped leaving room for a thought to land. **The
  verdict is in code**, like every other judgement of this kind here, so the
  model is never asked to invent a boundary.
- **`DELIVERY_MIN_SAMPLE_S` is 20 s of speech**, below which there is no
  delivery line at all – 200 wpm off twelve seconds is noise – and the prompt
  makes the line's *presence* the condition for a `pace` hint, so the model
  cannot reason about numbers it was not given. In the rehearsal below the
  first tick had no line, which is the floor working.
- **The filler set is sounds, never words.** `ähm äh ehm öhm hm hmm uh uhm um
  erm` with the repetitions a recogniser writes; `also`, `halt`, `eigentlich`,
  `like` and `you know` are ordinary speech. A false positive here tells a
  lecturer to stop doing something they were not doing, which is worse than
  silence because it is unanswerable. `er` is out although it is an English
  filler, because in German it is the word "he"; and **`um` counts only where
  the language is not German**, where it is an everyday preposition. That is
  the one place the count needs `lang`, which is why the sidecar puts it in the
  session.
- **A count of zero is not evidence.** Chrome's recogniser frequently strips
  filler sounds before a final result is ever delivered. The rules say so, and
  the line says so where the number is, so that no hint can read a zero as
  fluency.

**`pace` and `skipped` are kinds of their own, and `pace` has a cool-down of
its own for the reason the author's first rehearsal found: one cool-down doing
every job made the prompter speak twice out of nine.** Manner is a moment and
tempo is a condition – it lasts minutes and it comes back – so they cannot
share a timer. `pace` is 150 s, about how long it takes a speaker who has been
told to slow down to have actually changed something; shorter and the prompter
is a metronome. At most four in a talk (`paceMax`), one more than `delivery`,
because the condition genuinely recurs – fast in the opening, fast again after
a question from the room. `skipped` is 90 s, the shortest figure after `fact`,
because two omissions on two slides are two different facts, but not shorter,
because a speaker who has left a slide cannot go back to it. `delivery` keeps
manner, and it is where an argument gone abstract lands – answered with a
handhold rather than a diagnosis: *name the bank example*, not *you are being
abstract*.

**The conclusion is always a cue target.** `cueTargets` now offers the next
three slides *and* the end of the deck – its last addressable slide, and its
`closing:` chunk when it has one – because a sentence worth keeping is usually
said long before the place it belongs, and that place is usually the
conclusion, which a window of three slides reaches only in the last minute of
the talk. Two decisions inside that:

- **The state line names it as a field of its own, `conclusion=closing-words`,
  rather than marking it inside the list** (`end:closing-words` was the
  suggestion). The ids in `cue_targets` are copied verbatim into the answer,
  and an id carrying a decoration is an id the model gets wrong – a refusal
  under `bad-cue` instead of a card.
- **A conclusion the speaker is standing on is not offered**, and that is the
  right answer rather than an oversight: a card for the slide on the screen is
  something to say now, and the thing that says something now is a hint on the
  strip. The model is offered the strip for it either way.

**A replayed card is not a second saying.** Found in the author's live run: the
history panel held one card twice, at 5:55 and at 7:33, for one cue the sidecar
had sent once. The cards live in the cockpit's memory alone, so a reload – or
unticking the cue box and ticking it back – empties the Map and the sidecar
replays what it has; `souffCueAdd` then unshifted a fresh row stamped with the
clock at replay time. Three things: the card ids already in the record are kept
apart from the rows (which are capped at ten, so a row that fell off the end
must not come back as a new saying); `souffleuse-cue` and the `cueCards` of a
`hello` both carry `at`, so the surviving row says when the card was actually
laid rather than when it was replayed – which was the worse half, being quietly
false rather than merely repeated; and the arrival announcement in the classic
layout enters no row at all, because the card is already one. Its own
once-per-card set is per page and is **left** that way: the announcement is
owed to the speaker the first time they walk onto the slide, a fresh page
cannot know whether they already did, and showing a card that is genuinely on
the slide in front of them twice is cheaper than never showing it.

### The rehearsal the numbers were the point of

Against the real model (`anthropic/claude-sonnet-5`) on `lectures/spoken-talk`,
with a scripted talk played down the watch socket at 250 to 290 wpm, filler
sounds throughout, the planned second half of one slide skipped, one sentence
that had lost its thread, and one good sentence said in passing that the deck
does not contain. Four calls, 2.4 to 3.1 s each, 2823 of 3404 prompt tokens
cached from the second call on. What it said, in its own words and its own
`why`:

- **`pace`**: *"Slow down, no need to rush."* – `why: "very-fast wpm plus
  fillers"`. It used the measured line and nothing else; there is nothing in
  the transcript it could have used instead.
- **`skipped`**: *"Point at the ninety milliseconds number too."* – `why:
  "note beat 0 includes pointing at ninety ms, not yet said"`. It read the
  planned thing out of the notes in the prefix, which is what the notes are in
  there for. The policy held it back under `cooldown`, twenty seconds after the
  pace hint, and said so on the terminal.
- **`cue → #ask`**: *"Quarterly reports copy, nobody remembers the date."* –
  `why: "good concrete example for conclusion slide"`. The conclusion was four
  slides away and was in `cue_targets` only because the end of the deck is
  always offered. That is the author's ask, answered by the feature that was
  built for it.
- And the first tick, at sixteen seconds of speech, carried **no** delivery
  line at all.

## The questions to the author, answered

- **Process**: a Node sidecar in `build.js`.
- **STT**: Chrome Web Speech, on-device preferred.
- **Scope**: hints plus cards for later chunks, no rewriting of slides.
- **Name**: codename `souffleuse`; visible `prompter`, because "Souffleuse"
  is known in English only to theatre people.
- **Model**: `anthropic/claude-sonnet-5` as the default.
- **`duration:`**: top-level.
- **Interim line**: in, off by default.
- **Language**: plan and work in English by default.

## The first rehearsal, and what it settled

Run against the real model on 2026-09-12, on `lectures/spoken-talk` with a
scripted talk played down the watch socket: the ear is faked because nobody
at a keyboard can speak, and everything behind it - the prompt, the cache,
the tool call, the policy, the latency - was real. The driver is
`rehearse.mjs` in this session's scratchpad, and it plants two faults for the
prompter to find: a wrong number (four hundred milliseconds where the deck
and the notes say ninety, called a factor of two where the deck says fifteen)
and a slide talked to rather than from.

What it answered, and none of it could have been known from a fake:

- **It catches the planted error, in nine words.** `fact/high`, "Second load
  was ninety milliseconds, not four hundred." The `why` in the log says
  "contradicts stated 90ms figure". It found it from the notes, not from the
  transcript alone.
- **The cache breakpoint is honoured.** 2401 of about 2900 prompt tokens read
  from cache from the second call on, and on the first call of a later run
  inside the five-minute window. That was the one cost assumption the whole
  design rests on, and it holds through OpenRouter to Anthropic.
- **Latency 2.5 to 3.4 s** per answer, inside the five-second budget a
  speaker can still act on.
- **The restraint works.** Of four answers in a short run, two were whispered
  and two held back by `kind-cooldown`: the model went on wanting to correct
  the same number, and the policy refused to say it twice.
- **`--souffleuse-replay` reads the run back** and prints, per answer, what
  the model proposed, what the policy did with it and the model's own reason.
- **Two defects only a live model could show**, both fixed: `max_tokens: 160`
  truncated a correct hint mid-JSON, which was then filed as `garbage` and
  counted against the model; and the model writes em-dashes, which the strip
  then paints, against this project's own typography. The ceiling is 320, a
  truncated call has its own name, and the rules ask for the dash this
  project sets.

Still unmeasured: on-device recognition on macOS, a real microphone in a real
room, and a deck long enough that the prefix is the whole cost.

### The author's own rehearsal, and the numbers it moved

A second run, this time with a real voice and a real room, on the same deck.
Four and a half minutes, the speaker deliberately misstating his own figures.
The machinery did its part: **eleven calls to the model**, roughly one every
twenty to thirty seconds. The model wanted to whisper **nine times**. The code
allowed **two**, and the speaker's verdict was that it spoke too rarely.

The log said why, and it was not the cadence. After the first hint at 1:22 the
cool-down across every kind, then sixty seconds, swallowed both clock warnings
behind it, at 1:55 and 2:10 - although a clock warning and a wrong number are
different jobs and neither repeats the other. Then the per-kind figure for
`fact`, then two minutes, swallowed four further corrections while the speaker
went on misstating the numbers. Sixty seconds was shorter than every per-kind
figure, so it was the only gate most answers ever met; two minutes was long
enough that a confused four minutes earned two sentences.

So: the overall cool-down is 20 s, which is what "two whispers must not land
together" actually costs, and `fact` is 45 s, because repeating *the same
words* is the duplicate rule's job and it does that regardless. Replayed
against the same log with `--souffleuse-replay`, four whispers come through
instead of two, and every refusal that remains is a `duplicate` rather than a
timer - the shape the design wanted in the first place.

Two more things that run turned up. **The ear was not on-device**, on a machine
whose Chrome has the en-US pack installed: the deck writes `lang: en`, Chrome's
packs are regional, and asking only for the bare subtag is how a model that is
present goes unused. The adapter now asks for the deck's tag, then the
browser's own locale when it shares the primary subtag, then one default region
(`sttTags`), installs the tag that was actually downloadable rather than the
one the deck named, and writes every verdict into the `session` line - because
the log could not answer "why not on-device", which is the first question a
rehearsal asks. **And the transcript was badly mangled** by the server
recogniser on accented English (`he attacks unverses`, `190 milliseconds`,
`950 milliseconds`), so some of what the model was correcting was the
recogniser's error and not the speaker's. That is the case the prompt's
"do not flag a probable mishearing" rule exists for, and it is an argument for
the on-device ear rather than against the feature.

## The checklist it was run against

Which talk calibrates the thresholds (90 s behind, 240 s ahead, 60 s
cool-down, cadence 25 s); the model comparison Sonnet 5 against Gemini
Flash from the `usage` and `durationMs` lines in the log.

**The checklist for that first run.** `lectures/spoken-talk` is the deck to use:
it is the one lecture here whose `> note:` blocks are a script rather than
reminders, and `#second-time` has three notes pinned to a figure's three steps,
so a rehearsal exercises the cue cards and the beats at the same time. Serve it,
because a `file://` cockpit is fine for the prompter but nothing else about a
rehearsal should be different from a talk.

```bash
# a dry run first, which needs no key and sends nothing: it says whether the
# ear, the switch, the clock and the ticks are all wired, and writes the same
# log minus the answers.
node build.js lectures/spoken-talk/source.md --watch --serve --souffleuse --souffleuse-dry-run

export OPENROUTER_API_KEY=sk-or-...
node build.js lectures/spoken-talk/source.md --watch --serve --souffleuse
# open the served audience.html in Chrome, press S for the cockpit,
# then Shift-S in the cockpit, and talk for ten minutes.
```

Read `souffleuse-<hash>.prompt.txt` beside the log before the first run: it is
the deck exactly as the model gets it, and a slide that reads badly there reads
badly to the prompter.

Then read the log, `lectures/spoken-talk/souffleuse-<YYYYMMDD-HHMM>.jsonl`:

```bash
jq -c 'select(.type=="answer") | {durationMs, cached: .usage.prompt_tokens_details.cached_tokens}' souffleuse-*.jsonl
jq -c 'select(.type=="suppressed") | {reason, kind, text}' souffleuse-*.jsonl
```

- **`usage.prompt_tokens_details.cached_tokens` > 0 from the second `answer`
  line on.** Zero throughout means the prefix is under the provider's cache
  minimum for this model, or sticky routing did not hold, and the deck is being
  paid for in full every cadence – which is the one cost assumption this design
  rests on. The `session` line says how large the prefix is (`prefixChars`), and
  that is where to look first: a hand test against the fake put
  `lectures/spoken-talk` at 4,458 characters, roughly 1,100 tokens, which is at
  or under the minimum a cache breakpoint needs on some models. So
  **`spoken-talk` answers the cue-card and beat questions but may not answer the
  cache one** – a 36-chunk deck like `lectures/python-intro` is the second run to
  make, with the two `prefixChars` and the two `cached_tokens` side by side.
- **`durationMs` under 5000.** Past that the whisper arrives after the sentence
  it was about, and either `reasoning.effort` or the model has to change; the
  8 s `AbortController` is the wall, not the target.
- **Every `suppressed` line's `reason`.** `start-quiet`, `cooldown`, `standing`
  and `duplicate` are the policy working and are the lines worth counting. A run
  of `garbage` or `too-long` is the prompt failing, not the policy.
  `time-not-allowed` on a deck that *is* behind says the thresholds are wrong
  for this talk. `bad-cue` says the model is ignoring `cue_targets`.
- The `tick` lines' `drift` against what the clock in the room actually said.
- Then replay the whole log against the policy, which is where a threshold gets
  changed with evidence rather than by feel – and again after changing one:

  ```bash
  node build.js lectures/spoken-talk/source.md --souffleuse-replay lectures/spoken-talk/souffleuse-*.jsonl
  ```

Four things to eyeball while it runs:

1. **The badge on switching on.** Nothing at all means on-device recognition;
   `PROMPTER · server speech recognition` means Google is hearing the room. This
   is the one claim in the plan nothing has verified on macOS (Chromium bug
   444393111).
2. **The strip in both homes.** Over the foot of the slide in the classic
   arrangement, at the head of the card column under `K` – and the cards in the
   rail must not jump when it appears.
3. **One cue in the rail.** The strip says `▤ card for …` the moment it is
   laid, wherever the talk is – then **walk to the slide**: a dashed
   `.cue-card.souffleuse` in the rail under `K`, and in the classic layout the
   same card as a `▤` hint on arrival.
4. **`Shift`-`S` off and on again.** The dot goes hollow, the ear stops, the log
   takes a `status idle` saying who switched it off, and the second press starts
   a fresh quiet minute rather than whispering immediately.
