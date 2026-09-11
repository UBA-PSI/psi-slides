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

## Open for the first rehearsal

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
export OPENROUTER_API_KEY=sk-or-...
node build.js lectures/spoken-talk/source.md --watch --serve --souffleuse
# open the served audience.html in Chrome, press S for the cockpit,
# then Shift-S in the cockpit, and talk for ten minutes.
```

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

Four things to eyeball while it runs:

1. **The badge on switching on.** Nothing at all means on-device recognition;
   `PROMPTER · server speech recognition` means Google is hearing the room. This
   is the one claim in the plan nothing has verified on macOS (Chromium bug
   444393111).
2. **The strip in both homes.** Over the foot of the slide in the classic
   arrangement, at the head of the card column under `K` – and the cards in the
   rail must not jump when it appears.
3. **One cue in the rail.** A dashed `.cue-card.souffleuse` in a slide still to
   come, under `K`; in the classic layout the same card as a `▤` hint on arrival.
4. **`Shift`-`S` off and on again.** The dot goes hollow, the ear stops, the log
   takes a `status idle` saying who switched it off, and the second press starts
   a fresh quiet minute rather than whispering immediately.
