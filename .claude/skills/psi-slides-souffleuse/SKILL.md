---
name: psi-slides-souffleuse
description: The live prompter in the psi-slides cockpit (`--souffleuse`) – the pure half in `souffleuse.mjs` (`deckPayload`, `systemPrefix`, `tickMessage`, `parseAnswer`, `driftSeconds`, `shouldTick`, `createPolicy`, `TOOL_SCHEMA`), the Node sidecar `createSouffleuse` in build.js with its OpenRouter request, backoff and JSONL log, the `souffleuse-*` messages on the watch socket, the cockpit's ear and `#souffleuse-strip` under `Shift`-`S`, and the config surface (`--souffleuse-model`, `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL`, the `souffleuse:` frontmatter block, `SOUFFLEUSE_SPEC`, top-level `duration:`). Use when changing any of those, their `lint.js` mirrors, `test/gates/souffleuse.mjs` or `test/souffleuse.mjs`, or when the prompter says nothing, says too much, or shows a badge.
---

# The live prompter (`--souffleuse`)

Lifted out of `CLAUDE.md` so it loads when the prompter is the work rather than
in every session. `PLAN-souffleuse.md` is the design and, in its *Decisions along
the way*, the record of where the code and the plan parted company; where the two
disagree the code is right.

It is a prompter in the theatre sense: whispers from the box, briefly, only when
needed, and the room notices nothing. A hint has **at most twelve words** and the
normal answer to a call is `nothing`. It may also lay a cue card into a slide
that is still to come. It is not an author that rewrites slides, not a
fact-checker with research, not a recorder – the log is text – and not part of
the desktop app, which promises three times in public that nothing leaves the
machine.

**Restraint is the requirement, not polish.** The judgement – *is that a factual
slip?* – is the model's. The policy – *may one come now at all?* – is in code, in
`souffleuse.mjs`, so it is decided by a gate in milliseconds without a key, a
socket or a microphone. That split is the load-bearing decision: a talk where
nothing came looks exactly like a talk where nothing was due, so restraint is the
half of this feature no rehearsal can show you. If you are tempted to move a rule
into the prompt, that is the thing you are giving up.

## Where the code lives

| where | what |
|---|---|
| `souffleuse.mjs` | everything pure: `KINDS`, `SEVERITIES`, `MAX_WORDS`, `TOOL_SCHEMA`, `wordCount`, `prefixHash`, `deckPayload`, `flattenMarks`, `cueTargets`, `systemPrefix`, `tickMessage`, `parseAnswer`, `driftSeconds`, `timeHintAllowed`, `shouldTick`, `createPolicy`. Zero imports, zero Node APIs, and the gate asserts both plus the exact export list |
| `build.js` § `// ── souffleuse (--souffleuse) ──` | `createSouffleuse({absIn, opts, sendToCockpit, emitEvent, log})` → `{onBuild, onMessage, say, setEnabled, close, logPath}`, plus `souffleuseLogPath` and the constants. Both modules are imported **dynamically here**, so no other build reads either file |
| `build.js` § `// ── the live prompter (--souffleuse) ──` (in `SPEAKER_JS`) | the cockpit: the Web Speech adapter, the switch, the strip, the badge, the history, the interim line, the cue merge |
| `build.js`, `SOUFFLEUSE_SPEC` / `souffleuseSettings` / `talkDuration` | the frontmatter, validated in the `buildOnce` pre-flight so `--print-only` refuses a typo too |
| `build.js`, `renderSpeaker` | emits the chrome and `const SOUFFLEUSE = {lang, cadence, cues, label}` – `null` without the flag, and then the cockpit is the file it was before the feature |
| `build.js`, `runWatch` | tracks the socket of the last `souffleuse-hello` as `cockpit`, routes the `souffleuse-*` family after the nonce check, and abandons anything in flight on `exit` |
| `lint.js` | `SOUFFLEUSE_ENUMS`, `SOUFFLEUSE_NUM_KEYS`, `SOUFFLEUSE_FREE_KEYS` and `nestedBlockKeys`; the codes `unknown-souffleuse-setting` and `bad-duration` |
| `test/gates/souffleuse.mjs`, `test/souffleuse.mjs` | the restraint without a network, and the three processes wired to each other |

`notesToCards` is **injected, not imported**: `deckPayload(lecture,
{notesToCards})`, the way `createDiagramCompiler({…})` takes its Node leaves.
Without it the notes still travel, as prose, and carry no `@mm:ss` marks – a
degradation, not a failure. There is exactly one text in this repository that
knows the cue-card grammar, and this keeps it that way.

## Configuration

| surface | what |
|---|---|
| `--souffleuse` | run the sidecar. **Only together with `--watch`** – a usage error otherwise, because the watch socket is the only channel the cockpit has |
| `--souffleuse-model ID` | an OpenRouter model id; beats the frontmatter and the default |
| `OPENROUTER_API_KEY` | required. Without it the sidecar starts `disabled`: nothing is sent, the console says so once, a `hello` says so, the badge says so – and the transcript is still logged, because a missing key is not a reason to lose the debrief |
| `OPENROUTER_BASE_URL` | another OpenAI-compatible endpoint, default `https://openrouter.ai/api/v1`. This is how the spec's fake OpenRouter is reached |

Frontmatter, nested like `style:`; `SOUFFLEUSE_SPEC` is the table and the bounds
are the build's:

| key | kind | default | bounds |
|---|---|---|---|
| `model` | any OpenRouter model id | `anthropic/claude-sonnet-5` | non-empty |
| `language` | BCP-47 tag | falls back to `lang:` | `en`, `de`, `de-DE`, … |
| `cadence` | seconds of new speech that earn a call | 25 | 10 … 120 |
| `cooldown` | seconds a shown hint buys | 60 | 20 … 600 |
| `cues` | may it lay cards into upcoming slides | `on` | `on` / `off` |

`duration:` sits at the **top level**, not in the block: it is a property of the
talk like `lang:`, and the cockpit's clock can measure against it whether or not
a prompter is listening. `duration: 45` is minutes, `45:00` and `1:30:00` are
clocks, twelve hours is the ceiling, and anything else fails the build.

Precedence: CLI, then frontmatter, then default. In the cockpit the frontmatter
is a **ceiling** for the cue preference rather than a default – a deck with
`cues: off` does not get cards because a browser preference says otherwise.

## The socket protocol

The `souffleuse-*` family rides the existing nonce-guarded watch socket and its
`<type>-result` pairing; `speaker.md` §3.1 is the reference and repeats the
tables. The one new mechanism is that the **server may speak first**, through
`psiWatch.on(type, fn)` – a listener map consulted *after* the `-result` pairing,
never instead of it – with `psiWatch.onConnect(fn)` firing on every open
including the silent reconnects, and `psiWatch.ask(type, body)` as the other
direction.

Client → server: `souffleuse-hello {lang, stt:{engine, local}}`,
`souffleuse-say {text, t0, t1, chunkId, idx, beat}`,
`souffleuse-move {chunkId, idx, beat, elapsed}`,
`souffleuse-dismiss {hintId, how}` (`esc` / `click` / `fade`),
`souffleuse-toggle {on}`. Server → client:
`souffleuse-hint {hintId, kind, text, severity, at}`,
`souffleuse-cue {cueId, chunkId, text}`,
`souffleuse-status {state, why}`.

Four things about it that are not guessable:

- **The `hello` reply is `{enabled, model, cadence, cues, session}` and the
  refusal rides in the protocol's own `why`,** with `ok` still true. `reply`
  spreads the payload *first* so that no payload field can shadow a protocol
  one, which means a payload `why` would be overwritten by the protocol's.
- **A `hello` re-stamps the cockpit's clock** inside the sidecar, and switching
  on re-stamps `onAtElapsed` with it. Stamped at creation instead, the minutes an
  author spent writing slides counted as minutes of the talk and the opening
  quiet was over before it began.
- **A move is resolved by `idx`, never by id.** A divider's element id in the
  cockpit is `<col-id>-section`, while `deckPayload` gives it the column's own id
  (or `col:N`): the two agree on position and not on name. `cueTargets` skips
  dividers altogether – a cue is a card in a cue list and a divider has none.
- **The states are five and two of them are not the same thing.** `listening`
  and `thinking` are the working pair; `off` is the sidecar saying it cannot work
  at all and carries the reason; `idle` is the prompter having been switched off,
  which reverses on the next press; `error` is a backoff or a run of unusable
  answers. Without a sidecar the socket answers `start the build with
  --souffleuse`. A second cockpit tab takes the hints over by saying hello.

## The tick scheduler

`shouldTick` decides, and the sidecar's `maybeTick` calls it from every `say` and
every `move`:

- A **slide** occasion on a changed `idx`, at the earliest 8 s after the last
  tick – paging through three slides to reach one is not three occasions.
- A **speech** occasion when the speech seconds since the last tick reach
  `cadence` **and** at least 8 new words arrived. Silence is never an occasion,
  and the seconds are seconds of speech (`t1 - t0` per segment), not wall
  seconds.
- Never two calls in flight. A second occasion is coalesced into `pendingReason`
  and fired the moment the answer lands (`finish`), and a slide occasion outranks
  a speech one because the slide is the newer fact about where the talk is.
- The clock is the **cockpit's**, carried forward with the wall clock between
  messages (`nowElapsed`), which is what makes a cadence in seconds mean seconds.
- In the first `startQuiet` seconds after the switch, ticks run and the policy
  lets nothing through – the calls are what warms the prompt cache.

## The request

`POST <base>/chat/completions`, `Authorization: Bearer <key>`, `X-Title:
psi-slides`, `HTTP-Referer` the repository (both show on OpenRouter's activity
page, which is where somebody with the bill goes to ask what spent it). Body:

- `model`, `max_tokens: 160`, `temperature: 0.2`
- `reasoning: {effort: 'low', exclude: true}` – think a little, do not send the
  thinking back; latency is the scarce resource
- `messages`: the system prefix as **one content block carrying
  `cache_control: {type: 'ephemeral'}`**, then the tick message as the user turn
- `tools: [TOOL_SCHEMA]`, `tool_choice: {type: 'function', function: {name:
  'advise'}}`, `parallel_tool_calls: false` – the answer's vocabulary *is* the
  tool schema, so the call is forced and there is exactly one of it. There is no
  read tool: the whole deck is already in the cached prefix and a round trip
  would spend the latency the hint has to arrive inside of
- `session_id`: the prefix hash, for sticky routing to the provider holding the
  warm cache. A rebuild changes the hash and starts a new one
- `usage: {include: true}`, so `usage.prompt_tokens_details.cached_tokens` in the
  log answers whether the cache is working at all

`AbortController` at `SOUFFLEUSE_TIMEOUT_MS` (8 s): what arrives later is too
late for the sentence it was about.

The prefix is **byte-stable per build** – that is the whole point of splitting it
from the tick message – and `prefixHash` is FNV-1a over the UTF-16 code units as
eight hex digits, because `crypto` would have been the first Node API in a file
whose contract is that it has none and a collision costs a cache miss.

**What the prefix holds** (`systemPrefix`): the role and the rules, then the deck
– title, language, planned duration, slide count, and per slide its number, id,
type, part, heading, each beat's screen text, the notes as bullets with the beat
they are said on, and the `@mm:ss` marks. `deckPayload` builds it off the parsed
`lecture` (`buildOnce` returns it for this one caller), capped at about 1500
characters of screen text and 2500 of notes per chunk, with a compiled `::: draw`
reduced to `[figure, steps: N]` and code fences keeping their lines – a speaker
can misstate code, and that is a `fact` hint.

**What the tick message holds** (`tickMessage`): a state line (`slide 12/38 · #id
· beat 2/3 · elapsed · drift · time_hint_allowed · cue_targets=[…]`), the last
five hints with `✕` on the ones the speaker dismissed – they are in the list
precisely because they must not come back – and a rolling window of about 90 s or
600 words with `NEW:` marking what arrived since the last call.

## The policy, as coded

`createPolicy(opts)` returns `{judge, shown, dismissed, standing, history}`.
`judge(answer, ctx)` answers `{show: true}` or `{show: false, reason}`, and the
reason is what the log is read for afterwards. `ctx` is `{now, elapsedSinceOn,
chunkId, cueTargets, timeHintAllowed}` – two clocks, because switching the
prompter on mid-talk should still buy the speaker a quiet minute.

| rule | as coded | reason |
|---|---|---|
| more than `MAX_WORDS` = 12 words | discarded, never shortened | `too-long` |
| opening silence | `startQuiet` 60 s, measured from the switch | `start-quiet` |
| one hint at a time | while one stands, a `low` one is dropped; a `high` one replaces it | `standing` |
| cool-down overall | `cooldown` (frontmatter, default 60 s), with one exception: `fact` at `high` | `cooldown` |
| per kind | `time` 240 s · `delivery` 300 s and at most 3 per session · `fact` 120 s · `example` no cool-down but one per slide | `kind-cooldown`, `delivery-max`, `example-per-chunk` |
| duplicates | word Jaccard ≥ 0.6 against every hint shown **or dismissed** | `duplicate` |
| a clock hint | only when `timeHintAllowed` said yes | `time-not-allowed` |
| a cue | only an id from `cue_targets`, at most one per slide | `bad-cue`, `cue-per-chunk` |
| anything malformed | `parseAnswer` already turned it into `nothing` | `garbage` |

**A cue is not a hint.** It goes into a slide that is still to come, nobody reads
it now, so it takes no part in the standing slot, the overall cool-down or the
per-kind cool-downs; its two rules are the two above. The policy is made **once**
and kept across rebuilds, because a save in the middle of a talk must not hand
the speaker the same hint a second time.

Only nonsense counts towards the garbage streak (`garbage`, `too-long`,
`bad-cue`); a policy that swallows a well-formed hint is the policy working.

## The drift rule

`driftSeconds({elapsed, marks, idx, beat, durationS, chunkCount})` returns
`{drift, rough}` or `null`; positive is behind.

- With `@mm:ss` marks, the reference is the **last mark the talk has passed**,
  and before the first mark it is that first one – the same rule `cueDriftRef`
  uses, so the cockpit's own drift and the prompter's agree. A mark carries its
  beat (`{at, beat}` per chunk, flattened with the `idx` by `flattenMarks`),
  because a mark means nothing without the point in the talk it names.
- With no marks but a `duration:`, the plan is a straight line through the
  slides – `durationS × idx / chunkCount` – and says so with `rough: true`.
- With neither, `null`, and a prompter with no plan has nothing to say about the
  clock.

`timeHintAllowed({drift, rough, lastTimeHint, elapsed})`: at least 90 s behind
(180 s on the rough estimate, which is wrong by construction on any deck whose
slides differ), and after a first time hint either 60 s more drift or five
minutes; or at least 240 s ahead, at most once every ten minutes. Behind is
worth more than ahead: a talk running long has to lose something, and that is a
decision only worth offering while there is still something to lose.

## Failure modes – silence plus one badge, never a modal

The badge is `#souffleuse-badge`, a `.cmd-badge` painted as `PROMPTER · <text>`,
and it appears only when something is degraded.

| case | behaviour | what the badge says |
|---|---|---|
| no `OPENROUTER_API_KEY` | sidecar `disabled`, console once, `hello` says so; the transcript is still logged | `off – no OPENROUTER_API_KEY in the environment` |
| 401 / 403 | `disable`, and no retries – a refused key is refused on every one | `off – OpenRouter refused the key (HTTP 401)` |
| 429 / 5xx / network | backoff 30 s, 60 s, 120 s; `status error` meanwhile | `HTTP 500; trying again in 30s` |
| five such failures in a row | `disable` for this build | `off – 5 failed calls in a row – last: …` |
| timeout at 8 s | logged as `error: timeout`, changes nothing else. **A timeout is not a streak** – the network is not broken, the answer merely missed its sentence | – (returns to `listening`) |
| five unusable answers in a row | `status error`, nothing disabled | `5 unusable answers in a row from <model>` |
| socket gone when switching on | the switch stays off | `off – the watch server is gone` |
| no `webkitSpeechRecognition` | the switch stays off | `no speech recognition in this browser` |
| microphone denied | the switch goes off with it | `microphone denied – allow it in the address bar` |
| no microphone | switch off | `no microphone` |
| recognition ends six times in a minute | switch off; restarting it for the rest of the talk holds the microphone light on for nothing | `recognition keeps stopping` |
| recognition loses the network, or errors | the ear restarts itself underneath the badge | `speech recognition lost the network` / `… stopped with an error` |
| server recognition instead of on-device | the quiet one: whatever is left when nothing louder stands | `server speech recognition` |

**The badge needs a memory.** A status arrives on every tick, and a version that
wrote the badge directly wiped a refused key's reason one message later – the
`idle` answering the cockpit's own switch-off took it down at exactly the moment
a lecturer looks for it. So the ear keeps one reason (`souffEarWhy`) and the
sidecar another (`souffSideWhy`), and `souffPaintBadge` paints from the pair.

## The log

`souffleuse-<YYYYMMDD-HHMM>.jsonl` beside `source.md`, one per run of the
watcher, gitignored (`souffleuse-*.jsonl` and `lectures/*/souffleuse-*.jsonl`).
Every line carries `t` and `type`:

| type | body |
|---|---|
| `session` | `via` (`build` / `hello`), `model`, `base`, `prefixHash`, `prefixChars`, `chunkCount`, `lang`, `durationS`, `cadence`, `cooldown`, `cues`, `stt`, `disabled` |
| `say` | `text`, `t0`, `t1`, `chunkId`, `idx`, `beat` |
| `move` | `idx`, `chunkId`, `sentId`, `beat`, `elapsed` |
| `tick` | `reason`, `idx`, `chunkId`, `beat`, `elapsed`, `drift`, `rough`, `timeHintAllowed`, `cueTargets`, and the **user message** – never the prefix, which is the same 20 to 60 KB on every line and is already in the build |
| `answer` | the raw body, `usage`, `durationMs` |
| `hint` / `cue` | what went out, including the model's `why`, which is for the log alone |
| `suppressed` | `reason` plus the answer the policy refused – this is the half of the debrief that says what the model wanted to say |
| `dismiss` | `hintId`, `how` |
| `status`, `error` | every transition, and every failure with its streak |

`--events` carries the same transitions as `{type: 'souffleuse', state, …}`:
`ready` / `off` after a build (with `model`, `session`, `chunks`), `listening`,
`thinking`, `idle`, `error` with a `why`, `hint` with `kind` and `severity`,
`cue` with `chunkId`. The stdin command `{"type":"souffleuse","enabled":false}`
is the same switch the cockpit's button throws. The terminal hears only the
states a person would want to be told about: `listening` and `thinking`
alternate once per tick, which on a 45-minute talk is a hundred lines through
the middle of the log the author is reading.

## The cockpit

Everything is `souffleuse-*`, because the cockpit's element ids share one
namespace with the lecture's chunk ids and no slide will ever want that word –
the visible word is `prompter`. `#souffleuse-btn` (footer switch, `Shift`-`S`
through `viewHooks.onShiftS`, `Shift`-click opens the history),
`#souffleuse-badge`, `#souffleuse-strip` with `.souffleuse-glyph`,
`.souffleuse-text` and `.souffleuse-x`, `#souffleuse-heard`, `#souffleuse-log`
with `#souffleuse-log-list`, `#souffleuse-heard-toggle` and
`#souffleuse-cues-toggle`. The pieces of the panel are looked up **through the
panel**, not through the global id map.

- **The strip is one element in two homes**, like the clock: absolutely
  positioned over the bottom edge of `#stage-cell` in the classic arrangement,
  inside `#cue-panel` immediately above `#cue-rail` under `K`. `cuePlaceStrip`,
  called from `applyCueMode`, moves it and the interim line together, and looks
  both up by id because it runs from the mode restore at the foot of the cue
  section – before the prompter's own section has declared anything.
- Glyphs: `◷` time, `◇` example, `△` fact, `◌` delivery, `▤` cue. `high` is red
  like `#center-toast.warn`. Auto-fade 15 s, 25 s for `high`, and the fade is a
  dismissal (`how: 'fade'`).
- **Esc**: `viewHooks.escapePrompter` runs after the help panel and the address
  overlay and before a text selection – the history panel first if it is open,
  otherwise the standing hint. It returns whether it took something, so the chain
  carries on when it did not.
- **Storage**: `sessionStorage psi-slides:souffleuse` (on, so a `--watch` reload
  does not need the switch pressed again – and *not* `localStorage`, because the
  microphone is an act of consent and the button is where it is given);
  `localStorage psi-slides:souffleuse-heard` and `psi-slides:souffleuse-cues`
  (preferences of a person, not of a tab).
- **Cues**: `souffleuseCues`, a `Map` of chunk id → `[{cueId, text}]`, is
  declared up in the cue-cards section and read by `cueCardsFor`, which appends
  each card on beat 0 as `{bullets: [text], souffleuse: true}`; `cueRender` draws
  it as `.cue-card.souffleuse`. In the classic layout, which has no rail,
  `souffCueOnArrival` shows the same card once as a strip hint of kind `cue` –
  with a null `hintId`, so that dismissal stays local: the sidecar filed a card
  for a slide, not a hint on a strip.
- **Where the talk is** comes from `souffWhere`, and the beat is
  `cuePosition(entry).consumed` – the number of presses the slide has taken,
  which is what a cue card is filed under, what `::: overlay from N` counts and
  what `deckPayload` numbered the beats by. A second walk of the same DOM is how
  the two halves come to disagree about which beat a sentence was said on. The
  clock sent with it is `elapsedSeconds()` unrounded to two decimals: four fifths
  of a second of speech is not zero seconds of speech.

## The STT adapter

```
{ name,
  needsDownload(),
  available(lang) -> Promise<{ok, local, why}>,
  download(lang),                       // only from inside a click
  start(lang, {onFinal, onInterim, onState}, onDevice),
  stop() }
```

`onFinal({text, t0, t1})` in seconds of the cockpit's clock; `onState` reports
`denied`, `no-mic`, `stalled`, `network` or `error` – the first three take the
switch with them, because a listening light over a dead ear is worse than no
light. The Web Speech implementation sets `continuous` and `interimResults`,
tries the on-device path (`SpeechRecognition.available({langs, processLocally:
true})`, `install()` from inside the click because the download wants a gesture,
`rec.processLocally = true`), and treats anything that is not a plain
`available` as a reason to fall back to server recognition with the badge up
rather than to argue. `no-speech` and `aborted` are the ordinary course of a talk
and not failures; `end` restarts, capped at six per minute. The segment's `t0` is
the clock at the end of the previous final result, so the gap is the speaking
this one took – which is the number the cadence counts.

**A Node adapter plugs in without a protocol change.** `sidecar.say(segment)` is
the same door a socket `say` comes through, so a whisper.cpp on `PATH` (the
`cwebp` pattern) or a hosted recogniser becomes a second producer of the same
`{text, t0, t1}` shape inside Node; the cockpit then reports `hello {stt:
{engine: 'node'}}` and stops sending its own segments. Nothing calls it in v1,
and the shape it takes is the reason the protocol does not have to change when
something does.

## What the tests cover, and what neither can

**`test/gates/souffleuse.mjs`** (in the gate suite, no browser, no
`npm install`): `deckPayload` against a hand-built `lecture` object of the shape
`parseLecture` returns – built in the file, so a re-worded lecture cannot fail a
compiler gate – prefix stability and the hash, `tickMessage` (`NEW`, the window,
`cue_targets`, the `✕`), `parseAnswer` (tool call, content fallback, a fenced
object, garbage, thirteen words, a cue on the active slide), **every row of the
policy table**, `driftSeconds` at each of its references, `timeHintAllowed`,
`shouldTick`, the export list, the absence of imports and Node APIs, and that
`TOOL_SCHEMA` is generated from `KINDS` and `SEVERITIES` rather than restated.

**`test/souffleuse.mjs`** (the browser suite, the ninth spec that builds a deck
of its own): a real `node build.js … --watch --serve --souffleuse --events`
child, a fake OpenRouter on loopback reached through `OPENROUTER_BASE_URL`, and a
fake `webkitSpeechRecognition` installed with `addInitScript`. It asserts the
switch and its `sessionStorage`, the request body (`cache_control`, the forced
`advise`, `parallel_tool_calls`, `reasoning.effort`, `session_id`, the state
line, `NEW`), the hint on the strip with its glyph and severity, `Esc` reaching
the JSONL as a `dismiss … esc`, a slide tick becoming a card in a later slide –
shown as a strip hint in the classic layout and as `.cue-card.souffleuse` under
`K` – a `nothing` that reaches no screen, an HTTP 500 becoming a badge and not a
dialog, **that `speaker.html` never contains the string `OPENROUTER`**, and that
the projection has none of the chrome and no field of `snapshot()` is the
prompter's. **It moves the clock rather than waiting it out**: `__stt.final(text,
70)` pushes the cockpit's `tStart` back seventy seconds, so the opening quiet and
the cadence happen at once and the whole spec is about eight seconds.

Neither can say: recognition quality, whether the on-device path is really
available (the fake claims it), whether the prompt cache is warm, or whether the
model is restrained. Two more the spec cannot say: the snapshot is asserted to
carry no field whose *name* mentions the prompter, which is not a proof that no
value ever rides in one; and the auto-fade of a standing hint is left alone,
because 15 and 25 s of real time are worth more than the assertion. For all of
those, the log and a rehearsal.

## Traps recorded the hard way

- **`duration: 45:00` is a sexagesimal integer to YAML 1.1**, which is what
  gray-matter speaks: it arrives as `2700`. `parseLecture` restores the string
  the author wrote from the raw frontmatter rather than requiring quotes, so
  `talkDuration` sees a clock. The linter never saw the number and needed
  nothing.
- **The `hello` reply cannot carry its own `why`** (above). The reason rides in
  the protocol's `why`, with `ok: true`.
- **`souffleuseCues` is a `const` in another section for a reason.** Declared
  beside the prompter's own code, the cue mode's restore – which runs earlier –
  reached it in its temporal dead zone, inside the `try` that guards
  `localStorage`, which swallowed the throw whole. The same trap the cue mode's
  own restore was moved down for, seen from the other side.
- **`#cue-rail` is `position: relative` now.** `cueRender` scrolls to
  `curEl.offsetTop`, measured against whatever positioned ancestor happened to be
  up the tree, so the strip growing above the rail moved every card by its own
  height.
- **A comment naming the environment variable shipped it into the page.** The
  spec's `OPENROUTER` assertion failed on a comment in `SPEAKER_JS` quoting the
  badge text. Reworded rather than the assertion weakened: a privacy check that
  has to allow exceptions is not one. Do not write the variable's name inside
  `SPEAKER_JS`, not even in a comment.
- **The cue race in the classic layout, known and not fixed.** A card that
  arrives while the speaker is already walking onto its slide is shown by
  `cueSync` in the rail, but `souffCueOnArrival` has marked that slide as seen on
  the way through, so in the classic arrangement it is not shown at all. A spec
  that polled the log rather than `souffleuseCues` in the page passed three times
  and then did not, which is how it was found.
