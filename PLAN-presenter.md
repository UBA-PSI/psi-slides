# Presenting from the app, and a cockpit that explains itself

A plan, not a build log. Two parts that share one data structure:

- **A. Presenting.** One action puts the projection fullscreen on the external
  display and the cockpit on the laptop, and one action ends it.
- **B. A self-explaining cockpit.** The speaker view can be operated without
  knowing its keys, and the key map stays the one place a command is defined.

Where a sentence rests on reading the code it says **[read]**; where it rests
on the Electron documentation or on reasoning it says **[inferred]**; where
only a measurement can settle it, it says **[spike]** and the question is
listed under Slice 0.

Two pieces of work in progress are taken as given: the chrome element ids
move to a `psiINT-` prefix (the ids below are written that way), and the `?`
overlay gets a search field that lists every shortcut. Neither is planned
again here; slices that touch `renderHelpOverlay` start after both land.

## The problem, as the code has it

### Getting a talk onto two screens today

The path from a built lecture to a room is five acts, and three of them are
the browser's rules rather than the tool's:

1. Open `audience.html` (the builder does this through `openInBrowser` in
   `desktop/main/browsers.js`, which runs `open -a <Chrome>` on macOS)
   **[read]**.
2. Press `S` in it. The `cockpit` command (`s` in `commands.mjs`,
   `COMMAND_RUN.cockpit` in `AUDIENCE_JS`) runs `window.open('speaker.html',
   'psi-slides-speaker', 'width=1400,height=900')` and `setPeer(w)` **[read]**. The cockpit boots,
   `setPeer(window.opener)`, sends `hello`, and the projection answers with a
   `state` snapshot (the `message` listener after `isPeerWindow`) **[read]**.
   The direction is load-bearing: the cockpit finds the projection only
   through `window.opener`, so the projection has to be the window that opens
   the cockpit. A cockpit opened by hand has no peer (speaker.md §4.3).
3. Drag the audience window to the projector. Nothing in the tool can do this:
   a page cannot place its own window on another display **[inferred]**.
4. Press `W` in the cockpit. `toggleProjectionFullscreen` sends `{type:
   'fullscreen', action: 'enter'}`; the projection cannot obey, because
   `requestFullscreen` needs a gesture in its own window (“Permissions check
   failed”, measured in Chromium 141 and held by `test/nav-fullscreen.mjs`),
   so `armFullscreen` puts `#psiINT-fullscreen-hint` on the wall for
   `FULLSCREEN_ARM_MS` (20 s) and spends the next click there **[read]**.
5. Walk to the projector's screen, or move the pointer onto it, and click.

Nothing keeps the laptop awake, nothing keeps notifications off the
projection, and a projector unplugged mid-talk leaves the audience window
wherever macOS puts it.

### Discovering what the cockpit could do before B1

This section describes the code as it stood when the plan was written. B1
has since replaced the `switch` with `commands.mjs` and `COMMAND_RUN`, and
the `?` panel is rendered from that registry; the footer is unchanged.

- `renderHelpOverlay(view, withEditor, withSouffleuse)` builds the `?` panel
  from nested arrays of `[keysHtml, descriptionHtml]` pairs **[read]**. The
  rows are prose written beside the key map, not derived from it: nothing
  checks that a key in the panel is a key in the `switch`, and several rows
  describe mouse gestures that have no key at all.
- The key map is one `switch (e.key)` in the `document` keydown listener of
  `AUDIENCE_JS`, preceded by context guards (annotation textarea, search
  input, other inputs, `button[data-link-code]`, any Cmd/Ctrl/Alt, the
  go-to prompt, overview arrows) **[read]**. `SPEAKER_JS` adds behaviour
  through `viewHooks` (`onK`, `onEnter`, `onShiftS`, `consumeForward`,
  `escapePrompter`, …) rather than cases of its own **[read]**.
- The cockpit footer (`renderSpeaker`, `#psiINT-speaker-footer`) carries five
  buttons – freeze, layout, cards, export notes, help – and a static crib:
  `V freeze · B blank · W full · D demo · N annot · Shift-N notes ·
  Shift-E export` **[read]**. Blank, fullscreen, demo, overview, go-to,
  search, the column list, collapse, zoom and the note button are
  keyboard-only in the cockpit.
- Tooltips exist on some buttons and carry the key by hand, e.g.
  `title="… (Shift-V)"` **[read]**; nothing generates them.
- There is already one precedent for a second input path that cannot drift:
  `wireTouchControls` “calls the function the key calls, and nothing else”,
  with the comment that a second code path is how a palette comes to disagree
  with a key map **[read]**. The plan generalises that rule.

### What the existing app is and promises

- `desktop/` is one window, one project, one watch child
  (`build.js --watch --events`, spawned with `ELECTRON_RUN_AS_NODE`), and it
  opens the four views in an external browser (`openOutput` in
  `desktop/main/ipc.js`) **[read]**.
- It already drives Electron's Chromium as a page host once: the PDF export
  (`desktop/main/pdf.js`) opens a hidden, sandboxed `BrowserWindow` on a
  non-persistent partition, refuses http(s) and ws(s) at the session, refuses
  navigation and `window.open`, and calls into the page only through the
  documented `window.psiExport` hook **[read, docs/history/PLAN-desktop-pdf-export.md]**.
  That is the template for the presenter windows.
- Published promises: `desktop/README.md` (“Nothing leaves the computer …
  no network access of any kind”), `start.local` in
  `renderer/strings.js`, `docs/site/getting-started{,.de}.html` and
  `docs/site/index{,.de}.html` **[read]**. The entitlements file says there
  is no network entitlement **[read]**. Worth stating plainly: the app is
  **not** in the macOS App Sandbox, only under the hardened runtime, so no
  entitlement actually blocks the network – the promise rests on the app's
  behaviour, which is exactly why the presenter windows must enforce it
  themselves **[inferred from the plist and `package.json`]**.
- Today the only thing that fetches from a third party – a `::: embed`
  player – runs in the user's browser, not in the app. Presenting inside the
  app moves that into the app, and that is the one place the promise is at
  stake (Decision 6).

## Decisions

### 1. A mode of the existing builder, not a second app

**Chosen:** “Present” is a mode of `desktop/`. The builder window gets a
primary *Present* action and a *Presentation* menu; the two presenter windows
are further windows of the same process.

Why:

- The builder already owns everything presenting needs – the lecture, the
  watch child, the last good build, the settings file, the signing and
  notarisation path, the engine staging and the `desktop.yml` matrix. A
  second app duplicates all of it and ships a second 130 MB Electron **[read:
  DMG 134 MB in docs/history/PLAN-electron-builder.md § Verifikation]**.
- The two jobs are one day for the person: they build while preparing and
  present from the same folder an hour later. One app in the dock is the
  PowerPoint-like cue the request is about.
- The presenter windows need the watch build's socket for the diagram
  editor and live reload, which only the builder's child provides.

Rejected:

- **A separate “psi-slides Presenter”** that opens any built `audience.html`
  without an engine. Its one real advantage – presenting a deck somebody
  sent as HTML, with no `source.md` – is kept as an open question (Q4) and
  can be a second entry point of the same mode.
- **Presenting in the user's Chrome, driven from the app** (e.g. Chrome
  command-line switches for window position and `--kiosk`). It cannot place
  a window on a display reliably, cannot keep the laptop awake, and cannot
  intercept the gesture rule; it also reopens the “which browser” question
  (E5 in docs/history/PLAN-electron-builder.md).

What it costs: DESIGN.md's first sentence (“one line: whether the last save
built … must not look as if it does more”) is no longer the whole job and has
to be rewritten, and the ready screen's height budget (760 × 780, measured by
the smoke test in both languages **[read]**) has to absorb a button (Slice A7).

### 2. The views load from `file://`, exactly as they are on disk

**Chosen:** the presenter windows `loadFile` the same `audience.html` the
browser would open; when the builder's existing *serve* switch is on, they
load the `http://127.0.0.1:<port>/audience.html` address the `serving` event
already reports **[read: `openOutput`]**. The cockpit is opened by the
projection itself, through the unchanged `window.open` path, so the opener
relationship – the only thing the sync rests on – is the browser's own.

Why:

- The bytes presented are the bytes a browser would present. The file://
  browser workflow stays first-class because it is literally the same path.
- `watchOriginAllowed` accepts `null` / `file://` and the served origin, and
  nothing else **[read]**. Any other scheme would need a change to a
  security check in the engine for the benefit of one caller.
- `isPeerWindow` accepts a window whose `opener` is this window **[read]**.
  A child created by `window.open` in Electron has a real `opener`
  (`nativeWindowOpen` is the only mode since Electron 15) **[inferred,
  spike 0.1]**, so no line of the sync protocol changes.

Rejected:

- **A custom protocol** (`psi://lecture/…`, registered standard and secure).
  It would give the two windows one real origin, which would turn on the
  demo's direct path (`DEMO_DIRECT` is `SELF_ORIGIN !== 'null'` **[read]**)
  and might satisfy YouTube. But it needs `watchOriginAllowed` to learn a
  third origin, a second static server in main that re-implements
  `servePathAllowed` and `SERVE_MIME`, and it gives `localStorage` a new
  origin, so a talk rehearsed in Chrome would not recover into the app. The
  one real gain is the embed, which Decision 6 answers differently.
- **Always `--serve`.** It restarts the child when toggled (E6) and opens a
  loopback server for every talk to gain what only a deck with a YouTube
  embed needs. The existing switch stays the answer for that deck.

### 3. The app enters fullscreen itself; the arming protocol stays for the browser

In Electron, `webContents.executeJavaScript(code, true)` runs the code with a
user gesture, and the documentation names `requestFullscreen` as the call this
unlocks **[inferred, spike 0.2]**. So the app can do what the cockpit's `W`
cannot: fill the projection without anybody clicking on it.

**Chosen:** the app calls a new hook, `psiPresent.fullscreen(true)` (Decision
4), with a gesture. That enters **HTML** fullscreen through the page's own
`requestFullscreenHere`, so `fullscreenchange` fires, `announceFullscreen`
tells the cockpit `on: true`, the resize listener re-runs `setSlideRef` /
`autoFitNow` and re-sends `slide-ref` – every state machine that exists for
the browser path stays truthful in the app **[read]**.

A cockpit `W` inside the app is answered with the same hook call on the
projection, but main does not take the raw key. `before-input-event` runs
ahead of the page, and so ahead of every guard at the head of the key map –
text fields, the go-to prompt, the `?` panel's search, the notes textarea – so
a `w` typed into a note would never arrive and would put the projection into
fullscreen in front of the room instead. The page decides: the cockpit's
`fullscreen` command, when `psiPresent` reports it runs inside the app, asks
main through the preload's `present` channel rather than sending `fullscreen
enter` to its peer, and main makes the hook call. That keeps the rule Decision
11.6 keeps for `B`: the page handles a bare key, the app never steals it.
Without the request, the cockpit would send `fullscreen enter`, and the projection would arm and
put the hint on the wall for a gesture nobody will make **[read:
`armFullscreen`]**. `Shift`-`W` is left to the page: it is a gesture in the
cockpit's own window and already works.

**The macOS caveat decides whether HTML fullscreen is enough.** HTML
fullscreen in Electron becomes the window's native fullscreen, which on macOS
is a Space of its own. With “Displays have separate Spaces” switched off in
System Settings, a native fullscreen window on one display is known to leave
the other display unusable **[inferred, spike 0.2 – this is the measurement
the whole of Part A depends on]**. If the spike confirms it, the projection
uses `setSimpleFullScreen(true)` (pre-Lion fullscreen, no Space) or a
frameless window at the display's bounds, and the hook is still called so the
page's own idea of fullscreen matches – or, if the page cannot be told without
the Fullscreen API, main answers the cockpit's `W` request as above and the
cockpit's `W` badge state comes from main. The spike picks one; the plan does
not.

What becomes unnecessary **in the app** and must keep working **in the
browser**:

| protocol | in the app | in a browser |
| --- | --- | --- |
| `fullscreen` `enter` / `exit` from the cockpit, `armFullscreen`, the 20 s hint | never sent – the cockpit's `W` asks main instead | unchanged, `test/nav-fullscreen.mjs` stays |
| `fullscreen` `state` from the projection | still sent and still read – it is what keeps the cockpit's `W` direction right after an `Escape` | unchanged |
| `S` / `window.open` / `hello` | used as is – the app triggers it through the hook | unchanged |
| `slide-ref` after resize | used as is | unchanged |
| `blank`, `note-button`, `link-*`, `demo*` | unchanged | unchanged |

### 4. One documented hook in the live views: `window.psiPresent`

The PDF export's comment on `window.psiExport` already argues the case:
reaching into the runtime's global consts from an injected script “would work
… at the price of a contract no reader of build.js can see and a rename breaks
in silence” **[read]**. So the app gets a hook of the same kind, beside
`psiExport` in `AUDIENCE_JS`, mechanism only:

```js
window.psiPresent = {
  openCockpit,            // the body of `COMMAND_RUN.cockpit`, which then calls it
  fullscreen: (on) => …,  // requestFullscreenHere / exitFullscreenHere, returns a promise
  toast: (text) => flashMode(String(text)),
  run: (id) => …,         // one command of the registry (Decision 7), by id
  state: () => ({ view, frozen, blanked, overview, demo, cueCards, fullscreen }),
};
```

- It ships in both live views, like `psiExport`, and changes no behaviour
  until something calls it. The tracked views move by those lines; the
  source format does not move at all.
- **Main never trusts what comes back.** `state()` feeds only the checkmarks
  of the Presentation menu. A deck's own script can call the hook too – it
  can only do to its own page what a key press does.
- **No preload and no bridge into the presenter windows.** The page cannot
  call the app. Every app command (swap, end, rehearse) comes from the app's
  menu or its accelerators, which work in any focused window of the app.
  This keeps the presenter windows exactly as unprivileged as the PDF
  export's.

Rejected: a preload with a `contextBridge` API (`psiHost.swapDisplays()` …).
It would be the first privileged surface ever exposed to a page built from a
`source.md` somebody else may have written. Also rejected: synthesising the
`S` and `W` key presses with `sendInputEvent` – zero lines in the view, but a
contract that is a key binding, and the day `S` means something else the app
breaks in silence.

### 5. Keys go to the cockpit, whichever window has focus

A presenter remote is a keyboard, and its keys go to the focused window. The
cockpit has to receive them, because only the cockpit knows about cue cards:
`viewHooks.consumeForward` spends a press on the next card before it reaches
the reveal counter **[read]**. A `Space` that lands in the projection advances
the room past the card the lecturer is reading.

**Chosen:** main focuses the cockpit after every layout change, and forwards
key events that arrive in the projection window to the cockpit
(`before-input-event` → `preventDefault` → `cockpit.webContents.sendInputEvent`)
**[inferred, spike 0.4]**. The projection window is also created with
`focusable: false` where the platform allows it without breaking fullscreen
**[spike 0.4]**. In the one-screen rehearsal the same rule holds.

Remote keys: `PageUp` / `PageDown` are already back / forward, `B` already
blanks **[read]**. Many remotes send `.` for “black screen” and `F5` /
`Shift-F5` / `Escape` for their slideshow button **[inferred – vendor
documentation varies; measure the two or three remotes the maintainer owns]**.

- `.` becomes an alias of `B` in the key map. It is unbound in the live
  views today **[read]**; the editor modal's `,` / `.` are handled inside
  the editor before the key map **[to verify in `editor.mjs` in Slice B1]**.
  The alias reaches the browser path too, which is intended.
- `F5` starts presenting (from the current slide) when the builder window
  has focus; inside the presenter windows it is swallowed by main, so a
  remote cannot reload a page mid-talk.
- `Escape` keeps its meaning – the unwind chain – and **never** ends the
  presentation. Ending is `Cmd-.` / `Ctrl-.` and the menu item. A remote's
  slideshow button that sends `Escape` then unwinds a figure, which is
  harmless; one that ended the talk would not be.

### 6. The presenter windows fetch nothing from outside the machine

The presenter windows run on their own **persistent** partition
(`persist:present`) – persistent, unlike the PDF export's, because
`loadPersisted` is the crash recovery a talk needs **[read, speaker.md §5]**.
Its session refuses every request that is not `file:`, `data:`, `blob:`, or
loopback to the watch socket (and to the serve port when that switch is on),
counts refusals by origin, and cancels them – the rule `pdf.js` applies,
widened by exactly the one socket a live view needs **[read]**.
`will-navigate` is refused; `setWindowOpenHandler` allows exactly one thing
(Decision 8) and routes every other `window.open` – `P`, an external link's
`target="_blank"` – to the user's browser through the existing
`openInBrowser` / `shell.openExternal`, which is the person's own act and not
the app's.

Consequence for `::: embed`: under `file://` a YouTube frame is already
replaced by the instruction card (`wireEmbeds`, `EMBED_NEEDS_ORIGIN`)
**[read]**; a Vimeo or generic frame would be refused at the session and
show a broken player. The first version therefore keeps the promise and says
so: the pre-flight before *Present* names the lecture's embeds (`embeds` on
`build-success` **[read]**) and says they play only in the browser. Whether
the app should instead let a lecture's embed hosts through, with a rewrite of
the five published sentences, is Q2.

The watch socket's port is in the page, not in any event: `watching` carries
`source`, `dir` and `auto` **[read]**. The filter can allow loopback `ws://`
on any port, or `watching` gains a `port` field – additive, and under the
`--events` rule it moves `desktop/main/builder.js` and `events.test.mjs` in the
same commit. The plan takes the field; it is narrower.

### 7. One command registry, from which the overlay, the palette, the tooltips, the crib and the menu are generated

**Chosen:** a zero-import, zero-Node-API module **`commands.mjs`**, a table
and nothing else, in the family of `tails.mjs` and `cue-cards.mjs`:

```js
export const COMMANDS = [
  { id: 'blank', group: 'projector', views: ['audience', 'speaker'],
    keys: [{ key: 'b' }, { key: '.' }],
    label: 'Blank the projection', hint: 'the cockpit keeps working, frozen or not',
    reach: 'ungated', state: 'blanked', when: null },
  { id: 'freeze', group: 'projector', views: ['speaker'], keys: [{ key: 'v' }], … state: 'frozen' },
  { id: 'cue-cards', group: 'cards', views: ['speaker'], keys: [{ key: 'k' }], … when: 'has-notes' },
  { id: 'notes-zoom-in', group: 'window', views: ['speaker'], keys: [], mouse: '+ in the notes corner', … },
  …
];
```

- **Fields that matter:** `id` (stable, the name the app and the page use),
  `keys` (normalised `e.key`, lower case, plus `shift`), `label` (a verb
  phrase, sentence case, for a menu or a palette row), `hint` (the help
  panel's second column), `group` (the overlay's sections, which stay
  grouped by task), `views`, `reach` (`local` / `broadcast` / `ungated`,
  the three kinds speaker.md already distinguishes), `state` (for a
  checkmark or `aria-pressed`), `when` (a named predicate for contextual
  hints), `mouse` (for gestures with no key – they stay in the overlay as
  today). Conditional sections (`withEditor`, `withSouffleuse`) become a
  `requires: 'editor' | 'prompter'` field.
- **Where each consumer gets it.** `renderHelpOverlay` imports the table and
  renders the rows (after the search field has landed, the search indexes
  the same rows). The live views carry the table as `window.PSI_COMMANDS`,
  spliced in as text like `window.PSI_CARDS`, for the palette, the
  tooltips and the crib. The app imports `commands.mjs` from the engine
  directory, as it already loads `pdf-core.mjs` from there **[read,
  docs/history/PLAN-desktop-pdf-export.md]**, to build the Presentation menu.
- **The key map dispatches from it for the plain case.** The context guards
  before the `switch` stay code – they are rules about *where* a key is
  pressed, not about what a command is. The `switch` itself becomes a
  lookup `byKey[view][shift+key] → id` and a `COMMAND_RUN` object of
  functions in `AUDIENCE_JS` (and entries added from `SPEAKER_JS` through a
  `viewHooks`-style registration), each calling what the case calls today.
  Cases whose behaviour depends on context (`Enter` in overview, `+` on a
  focused figure, the `Escape` chain) keep their code inside the run
  function; the table only names them.
- **Held by a gate**, `test/gates/commands.mjs`, no browser: no two commands
  share a key within one view; every `id` has a run function (read out of
  the built view as text, the way the `inlined` gate reads template
  literals); every key the old `switch` answered is still answered (a
  fixture list taken once from today's `switch`); every `requires` value is
  known. `tails.mjs` asserts its slot rule at load, and `commands.mjs` does
  the same for duplicate keys.

Rejected:

- **Parsing the `switch` to produce the overlay.** It keeps two sources –
  the case labels and the prose – and turns the build into a JS parser.
- **A table inside `AUDIENCE_JS` only.** The app and `renderHelpOverlay`
  run in Node and cannot read a template literal without evaluating it.
- **Localising in this slice.** The overlay is English whatever `lang:`
  says today **[read]**. The registry makes a `de` column cheap later, but
  the words the build invents are the 1.0.0 contract (`STRINGS.en`
  byte-identical); Q7.

### 8. The shape of a presentation, in the main process

`desktop/main/present.js` owns the two windows; `desktop/main/displays.js` is
pure (no `require('electron')`, like `builder.js`) and decides which display
is which.

**Present** (`Cmd-Return` from the current slide, `Cmd-Shift-Return` from the
first – PowerPoint for Mac's pair **[inferred]**; Q6):

1. Pre-flight: a successful build exists (`lastSuccess` **[read]**); with
   auto-build off and `changedSinceBuild`, rebuild first and present on the
   next `build-success`, as the PDF export does **[read]**. Name embeds
   (Decision 6). If only one display is reported, go to *Rehearse*, and if
   the one display is a mirror set, say so (below).
2. Choose displays: `chooseDisplays(displays, {remembered, cockpitNear})` –
   the cockpit on the internal display (`display.internal` **[spike 0.3]**)
   or the one holding the builder window; the projection on the remembered
   external display by id, else the largest external one.
3. Create the projection window hidden, on that display's bounds: sandboxed,
   `contextIsolation`, no preload, `persist:present`, `backgroundThrottling:
   false` (autoplay figures and clips keep running when it is not focused),
   `autoplayPolicy: 'no-user-gesture-required'` (a clip started by a
   `video` message has no gesture in that window **[inferred – verify
   whether the browser path meets the same wall]**), black background.
   `loadFile(audience.html, {hash})`, the hash being the first chunk's id for
   *from the start* – `chunkIdxFromHash` already wins over the remembered
   position at boot **[read]**.
4. On `did-finish-load`: `executeJavaScript('psiPresent.openCockpit()', true)`.
   `setWindowOpenHandler` allows exactly `speaker.html` beside it with the
   frame name `psi-slides-speaker`, and gives it `overrideBrowserWindowOptions`
   with the cockpit display's work area and the same web preferences;
   `did-create-window` hands main the cockpit window.
5. Fullscreen the projection (Decision 3), maximise or fullscreen the
   cockpit, focus the cockpit, start `powerSaveBlocker('prevent-display-sleep')`,
   hide the pointer on the projection with `insertCSS` (Q8), pause
   auto-build by sending `{"type":"auto","enabled":false}` and remembering
   the previous wish, as the serve switch already remembers it **[read, E10]**.

**Rehearse** (one screen): the cockpit fills the screen, the projection
window exists hidden (it is the state root and must live; the cockpit's mirror
already shows it). A menu item shows it as an ordinary window for a check.
The clock starts with the cockpit, as it does today.

**Swap displays** (`Cmd-Shift-S` or similar, Q6): exchange the two windows'
displays, re-enter fullscreen, refocus the cockpit, remember the choice.

**A display plugged in or pulled mid-talk** (`screen` `display-removed` /
`display-added` / `display-metrics-changed` **[spike 0.3]**):

- The projection's display goes: hide the projection window (never close it
  – it is the state root), toast in the cockpit through `psiPresent.toast`
  (“projector disconnected – the talk goes on; plug it back in and it
  returns”). The cockpit keeps working; the room sees nothing.
- A display arrives while presenting and the projection is hidden: move it
  there, fullscreen again, toast. While rehearsing: offer to present.
- The cockpit's display goes (a laptop with its lid closed on an external
  display): the cockpit moves to the remaining display as an ordinary window
  and the projection stays; said once.

**Mirrored displays.** macOS reports a mirror set as one display
**[spike 0.3]**. Presenting the cockpit onto a mirrored projector shows the
room the notes, so the pre-flight says so and offers two ways: open System
Settings ▸ Displays (`x-apple.systempreferences:` URL **[inferred]**), or
present the projection alone, fullscreen, with the keys still going to it.
The app does not switch mirroring itself: there is no Electron API, and the
CoreGraphics call would need a native module, which the signing path would
then have to carry (rejected).

**Notifications.** There is no public macOS API to switch Focus / Do Not
Disturb, and Electron has none **[inferred]**. The honest version: the
pre-flight says one line (“Notifications can appear on the projector –
switch on Do Not Disturb”), and a fullscreen window on its own Space already
keeps banners off it on most setups **[spike 0.2]**. Driving the Shortcuts
app to toggle Focus is rejected: it needs a shortcut the user built.

**Leaving.** *End presentation* (`Cmd-.`, the menu, closing either presenter
window): leave fullscreen, close the cockpit, then the projection, release the
power blocker, restore the auto-build wish, show the builder window. Quitting
while presenting asks first. A presenter renderer that dies
(`render-process-gone`) is reloaded; the projection recovers through
`loadPersisted` and the cockpit's next push, the cockpit through its opener
**[read, speaker.md §3]**. Closing the lecture or opening another ends the
presentation first.

### 9. The live demo inside the app

`getDisplayMedia` in Electron rejects unless the session has
`setDisplayMediaRequestHandler` **[inferred, spike 0.5]**. The handler goes
on `persist:present`:

- On macOS 15 and later, `useSystemPicker: true` shows the system's own
  picker **[inferred, spike 0.5]**, which opens where the cockpit is.
- Otherwise main shows a small picker window of its own – the app's own
  trusted renderer, not a view – on the cockpit's display, listing
  `desktopCapturer.getSources` with thumbnails, and answers the handler with
  the chosen source. The projection window itself is left out of the list.
- The capture is called from the cockpit on its own `D` key press, so the
  gesture rule is met as in the browser **[read]**. Under `file://` the
  windows are two opaque origins and the stream takes the WebRTC loopback
  path; under *serve* it takes the direct path – both exist and both stay
  **[read]**. Whether the session's request filter touches WebRTC on
  loopback (it should not: no ICE servers are configured, and
  `webRequest` does not see RTP) is spike 0.5.
- Screen-recording permission is granted to the app (signed bundle), not to
  Chrome; the first capture fails on a Mac while macOS asks, exactly as the
  help overlay already says for Chrome **[read]**. The pre-flight can check
  `systemPreferences.getMediaAccessStatus('screen')` and say so before the
  talk rather than during it **[inferred]**.

### 10. The prompter stays out of the app, and presenting does not change that

The app never passes `--prompter`, `souffleuse.mjs` is not on the staged list,
and there is no network entitlement **[read, CLAUDE.md]**. Presenting changes
none of it. It adds one fact worth recording beside the three-things-move-together
rule: Chrome's Web Speech recognition is not available in Electron's Chromium
without Google's API keys **[inferred]**, so a prompter in the app would also
need a different ear. The cockpit built without the flag carries no prompter
chrome, so nothing appears.

### 11. The cockpit becomes self-explaining without adding weight to the projection

All of it is cockpit-local: no field of `snapshot()` moves, no element reaches
`audience.html`, and `test/reproducible.mjs` plus a new assertion hold that the
audience view carries none of it. Restraint means text buttons in the existing
footer idiom, no icons beyond the glyphs already there, no coach marks, no
animation.

1. **Visible projector controls.** The footer gains the three commands a
   lecturer reaches for under pressure and that have no button today:
   *blank*, *fullscreen* (on the projection) and *demo*, each a stateful
   `aria-pressed` button like `● live`. A fourth, *go to…*, opens the `G`
   prompt. The knobs (collapse, font, theme, slide numbers, auto-fit, text
   size) go behind one `view ⋯` button that opens a small panel listing
   them as rows – the touch palette's pattern **[read:
   `wireTouchControls`]**, in the cockpit only. Every button calls
   `psiPresent.run(id)`'s function; none re-implements a key.
2. **Tooltips from the registry.** Every footer button's `title` is
   `label (key)`, generated, replacing the hand-written “(Shift-V)” strings.
3. **The `?` panel runs what it lists.** With the search field landing
   anyway, a row whose command has a run function gets `Enter` / click to
   run it, and `Cmd-K` / `Ctrl-K` in the cockpit opens the panel with the
   search focused. That is the command palette, without a second surface.
   `Cmd-K` is caught before the key map's meta guard, cockpit only.
4. **A contextual crib instead of a static one.** The footer's crib today
   lists seven keys that are always the same **[read]**. It becomes the
   three or four commands that apply to *this* slide, from `when`
   predicates: a focusable figure (`FOCUSABLE_SEL` **[read]**) – “click the
   figure to zoom it”; expansions – “1 opens *label*”; a link – “the mark
   after a link shows its address”; cue cards available and off – “K shows
   your notes as cards”; a diagram under the editor – “E edits it”. With
   nothing specific, the crib falls back to `Space · B · ?`. Quiet, the
   crib's existing type, no change of height.
5. **One first-run line.** The first time a cockpit opens on a machine
   (`localStorage`, `psi-slides:cockpit-intro`, wrapped in try/catch as the
   other keys are), one line over the footer: “Space forward · B blank ·
   ? everything, searchable”. It goes on the first `?`, on a click on its
   `×`, or after the fifth forward press, and never comes back.
6. **The app's Presentation menu mirrors every cockpit command.** Grouped
   as the overlay is, labels from the registry, the key shown as the
   accelerator. Bare keys are shown with `registerAccelerator: false`
   **[inferred, spike 0.6]**, so the menu does not steal `B` from the notes
   textarea; the page keeps handling the key. A click runs
   `psiPresent.run(id)` in the cockpit with a gesture (so *demo* from the
   menu can capture). Checkmarks come from `psiPresent.state()` read on
   `menu-will-show`. This is the strongest PowerPoint cue and it costs the
   page nothing.

Rejected: a persistent toolbar over the stage (decorative chrome on the one
surface that mirrors the room); per-button onboarding tours; hints on the
projection of any kind.

## Slices, in build order

Each slice is one agent. Engine slices share `build.js` and run sequentially;
`desktop/` slices can overlap with engine slices that do not touch the same
files, but A2 onward need A1.

### Slice 0 – spike (thrown away)

A throwaway Electron script in `$TMPDIR` against the tutorial's built views,
on the maintainer's Mac with a second display. Seven questions, each answered
with a measurement written into this plan's *Decisions along the way*:

- **0.1** Two sandboxed `file://` windows, the second from `window.open` in
  the first through `setWindowOpenHandler` → `allow`: does the cockpit see
  `window.opener`, does `hello` / `state` flow, does the projection survive a
  reload with the link intact?
- **0.2** Fullscreen on the external display: HTML fullscreen through
  `executeJavaScript(…, true)`, `setFullScreen`, `setSimpleFullScreen`, a
  frameless window at bounds – each with “Displays have separate Spaces” on
  and off. Is the laptop still usable, is there a Space animation, do
  notification banners reach the projector, does `fullscreenchange` fire?
- **0.3** `screen`: what a mirror set reports; `display.internal`, `label`,
  `id` stability across unplug / replug and reboot; which events fire, in
  what order, and where macOS moves a window whose display vanished.
- **0.4** Focus: can the projection be `focusable: false` and fullscreen;
  does `sendInputEvent` into the cockpit reach its key map with the right
  `e.key` for `Space`, `PageDown`, `.`; what two or three real remotes send.
- **0.5** `setDisplayMediaRequestHandler` with and without `useSystemPicker`;
  `desktopCapturer` sources; the WebRTC loopback path under the session
  filter; the TCC prompt for an unsigned and a signed build.
- **0.6** `registerAccelerator: false` on bare-letter menu items on macOS,
  and what Windows and Linux do with the same template.
- **0.7** A synced clip starting in the projection without a gesture, in
  Chrome and in Electron with and without `autoplayPolicy`.

### Slice B1 – `commands.mjs` and the key map dispatching from it (engine)

After the `psiINT-` rename and the `?` search have landed. New
`commands.mjs`; `renderHelpOverlay` renders from it; the `switch` becomes the
lookup plus `COMMAND_RUN` (behaviour unchanged, `.` added as a blank alias,
`e.key` normalisation for `Shift`); `window.PSI_COMMANDS` spliced into both
live views. Files: `commands.mjs`, `build.js` (`renderHelpOverlay`, the
keydown listener, the `SPEAKER_JS` registrations), `test/gates/commands.mjs`
and its entry in `test/gates/run.mjs`, `test/README.md`,
`desktop/scripts/stage-engine.mjs` `FILES` (build.js now imports it – a
missing entry fails every packaged build **[read, CLAUDE.md]**), tracked views
rebuilt. Tests: the new gate; the whole browser suite (the key map is touched,
which CLAUDE.md names as the trigger); `desktop/test/stage-engine.test.mjs`.

### Slice A1 – `window.psiPresent` (engine)

The hook beside `psiExport`; `COMMAND_RUN.cockpit` calls `openCockpit`.
`run(id)` and `state()` read the registry from B1. `watching` gains `port`. Files:
`build.js`, `desktop/main/builder.js` and `desktop/test/events.test.mjs` (the
`--events` rule), `CLAUDE.md`'s `--events` paragraph, tracked views. Tests: a
browser spec `test/present-hook.mjs` on a fixture deck of its own –
`openCockpit()` from the projection links a cockpit that receives state;
`fullscreen(true)` without a gesture is refused in plain Chromium (so the hook
grants nothing a page did not have); `run('blank')` blanks both windows;
`state()` reports it.

### Slice A2 – the display model (desktop, pure)

`desktop/main/displays.js`: `chooseDisplays`, `swap`, `onRemoved`,
`onAdded`, mirror detection – pure functions over plain display objects, no
Electron. `desktop/test/displays.test.mjs` with fixtures shaped like what
spike 0.3 recorded (one display, a mirror set, laptop plus projector, laptop
plus two, lid closed). Added to the `npm test` list, which names its files
**[read, E10]**.

### Slice A3 – present, rehearse, end (desktop)

`desktop/main/present.js`: the two windows (Decision 8 steps 3–5), the
partition and its request filter, `setWindowOpenHandler`, `will-navigate`,
the cockpit's `W` request (asked by the page, never a raw-key intercept), key
forwarding, `F5` / `Cmd-.`, the power blocker, the auto-build pause and
restore, the quit guard, `render-process-gone`.
`main.js` wires it; `ipc.js` gets `present` / `rehearse` / `endPresentation`
channels (kind words only, no paths); `preload.js` names them. Tests: the
smoke test gains a rehearsal run (CI has one virtual display under xvfb):
*Rehearse* opens exactly two presenter windows, the cockpit's peer is live
(read through `psiPresent.state()`), a `PageDown` sent to the projection
window moves the cockpit's cue cursor, a request to an outside host is
counted and refused, *End* leaves no window, no blocker (a test-only
`PSI_PRESENT_PROBE` read only when `!app.isPackaged`, the shape of
`PSI_PDF_DUMP_DOM`), and no process.

### Slice A4 – two displays, swap, hotplug (desktop)

`screen` events into `displays.js`; *Swap displays*; *Projection on ▸* listing
displays by label; the remembered projector id in settings
(`desktop/main/settings.js`, `settings.test.mjs`). Tests: unit tests for the
event sequences; a manual checklist in `desktop/README.md` for what CI cannot
see (plug, unplug, mirror, lid), run on the Mac before release.

### Slice A5 – the live demo in the app (desktop)

`setDisplayMediaRequestHandler` on the presenter partition; the system picker
where available, the app's own picker window otherwise
(`desktop/renderer/picker.html` with the builder's CSP); the pre-flight's
screen-recording line. Tests: unit test for the source filter (the projection
left out); the smoke test asserts the handler is installed; the capture itself
is on the manual checklist.

### Slice A6 – the Presentation menu from the registry (desktop)

`desktop/main/menu.js` builds the menu from `commands.mjs` loaded out of the
engine directory (dev: repo root; packaged: `resources/engine/`), in the app's
language for the app's own items and the registry's English for the rest until
Q7 is answered; checkmarks from `psiPresent.state()` on `menu-will-show`.
Tests: a unit test that every registry command with `views` including
`speaker` appears exactly once; `strings.test.mjs` for the new app strings.

### Slice A7 – the builder window (desktop)

A *Present* primary button and a *Rehearse* text button on the project screen,
the pre-flight lines (embeds, one display, mirror, notifications, screen
permission) as the soft hint paragraphs DESIGN.md already allows. Files:
`renderer/index.html`, `app.js`, `app.css`, `strings.js` (both languages),
`desktop/DESIGN.md` (the new first sentence, the layout drawing, why *Present*
is the one primary button now), `desktop/README.md`. Tests: the smoke test's
no-scrollbar check in both languages at the window's size, and new
screenshots read against DESIGN.md.

### Slice B2 – cockpit controls and generated tooltips (engine)

Footer buttons for blank, fullscreen, demo, go to; the `view ⋯` panel; every
footer `title` generated from the registry. Files: `build.js`
(`renderSpeaker`, `SPEAKER_CSS`, `SPEAKER_JS`), speaker.md §4.1, tracked
speaker views. Tests: a browser spec on a fixture deck – each button does what
its key does (compared by the resulting `psiPresent.state()`), `aria-pressed`
follows the key as well as the click, and `audience.html` contains none of
the new ids.

### Slice B3 – the `?` panel as palette (engine)

Runnable rows, `Cmd-K` / `Ctrl-K` in the cockpit. Files: `build.js`, speaker.md
§4.1a. Tests: a browser spec – `Cmd-K`, type “blank”, `Enter` blanks the
projection; a row with no run function is not runnable; `Esc` order unchanged
(help first, speaker.md §4.2).

### Slice B4 – contextual crib and the first-run line (engine)

The `when` predicates, the crib redrawn from `viewHooks.onActiveChange`, the
one intro line. Files: `build.js`, speaker.md §4.1. Tests: a browser spec on a
fixture deck with a figure slide, an expansion slide, a link slide and a
plain slide – the crib names the right command on each; the intro goes and
stays gone across a reload.

### Slice C – documents and release

`CLAUDE.md` (the hook, the registry, the desktop mode, `commands.mjs` among
the zero-dep modules and on the staged list), `CHANGELOG.md`, `SECURITY.md`
(the presenter partition and what it refuses), the five published
no-network sentences checked against the final behaviour, the site's
getting-started pages in both languages (their parity gate holds them
together **[read, CLAUDE.md]**), a builder minor version and the signed build
through `npm run dist:signed` as `CONTRIBUTING.md` describes.

## Open questions for the maintainer

1. **A mode of the builder, as proposed?** And does the app keep the name
   “psi-slides Builder” once it presents?
2. **Embeds while presenting from the app.** Keep “nothing leaves the
   computer” and show embeds only in the browser (proposed for the first
   version), or let a lecture's embed hosts through the presenter partition,
   on a visible per-lecture choice, and rewrite the five sentences?
3. **Saving mid-talk.** Pause auto-build while presenting (proposed – a save
   otherwise reloads the projection in front of the room), or keep it, since
   a typo fixed during a talk is a real wish?
4. **Presenting HTML without `source.md`** – a deck somebody sent as built
   views, opened with *Present…* directly?
5. **Ending.** `Cmd-.` and the menu end the presentation, `Escape` never does.
   Right, given that PowerPoint and Keynote end on `Escape`?
6. **Accelerators.** `Cmd-Return` from here, `Cmd-Shift-Return` from the
   start, `Cmd-.` to end, `F5` to start, and which for *Swap displays*?
7. **German.** Should the cockpit's help, tooltips, crib and the menu's
   registry items follow `lang:` (a `de` column in the registry), or stay
   English as the overlay is today?
8. **The pointer on the projection.** Hidden while presenting (proposed), or
   left visible for somebody who points with the mouse on the wall?
9. **Platforms.** macOS first and Windows / Linux after a check on real
   machines, or all three in the first release as the builder is?
10. **Which cockpit commands earn a footer button.** Proposed: blank,
    fullscreen, demo, go to, plus the `view ⋯` panel. Anything more is a
    toolbar.

## Risks

- **The macOS fullscreen model.** If spike 0.2 shows that no fullscreen
  variant leaves the laptop fully usable with “separate Spaces” off, the
  fallback is a frameless window at display bounds, which leaves the menu
  bar on the projector on some setups. This is the risk Part A stands on,
  and it is only plausible until measured.
- **Two fullscreen paths.** The app's and the browser's differ by design;
  a change to `toggleProjectionFullscreen` can now break one of them
  silently. `test/nav-fullscreen.mjs` holds the browser path; the smoke
  test's rehearsal run has to hold the app's.
- **Focus and remotes.** A key that reaches the projection unforwarded
  advances the room past a cue card. Spike 0.4, and a checklist entry with
  the maintainer's remotes.
- **Display identity.** If `display.id` is not stable across replug, the
  remembered projector is wrong on the next talk; the fallback (largest
  external display) must be the right answer in the common case.
- **The key-map refactor (B1).** The `switch` carries years of context
  rules; turning it into a lookup is where regressions hide. The gate's
  fixture list of today's keys and the full browser suite are the guard,
  and B1 changes no behaviour except the `.` alias.
- **Template literals.** Every engine slice edits `AUDIENCE_JS` /
  `SPEAKER_JS`: no backticks, doubled regex backslashes, and
  `node test/gates/run.mjs inlined` before judging a failure **[read,
  CLAUDE.md]**. The registry's JSON goes in through `JSON.stringify`, not by
  hand.
- **Element ids.** New cockpit chrome must use the `psiINT-` prefix; a
  generic id collides with a chunk id in the mirror **[read, CLAUDE.md]**.
- **The staged engine list.** `commands.mjs` on `FILES`, or every packaged
  build fails before a view is written **[read]**.
- **The published promise.** The presenter windows are the first place the
  app itself could open a third-party connection. The request filter is the
  guard; `SECURITY.md` and the five sentences have to say exactly what it
  does, and a smoke assertion has to prove a refusal.
- **Scope creep in the builder window.** DESIGN.md's restraint is the
  reason people can read it; *Present* has to fit the existing height and
  hierarchy, measured, or it pushes the status sentence down.

## Decisions along the way

### B1

- **One entry is one row of the `?` panel, not one command.** The panel had
  to come out byte-identical, and its rows are not commands: mouse gestures,
  keys that a guard answers (the overview board's arrows, the search field,
  a focused figure's `+ - 0`, the editor's whole section), and one line for
  four commands (`Shift-C F A L`). So `COMMANDS` holds three kinds: a
  *command* (`keys`, dispatched), a *doc row* (no `keys`; `mouse` or `show`
  for the key column, `context` for where the key is answered), and a
  *merged* command (`row: '<id>'`, listed in another command's line). Four
  fields the plan did not name: `show`, `context`, `row`, and `group`/`hint`
  as `{ audience, speaker }` where the two panels file a row differently
  (`N`, `Shift-E`, `W`). `GROUPS` is a second table, in the cockpit's order;
  the audience's order is the same list minus the cockpit's sections. Result:
  the overlay is byte-identical in all eight view × editor × prompter
  combinations except the `B` row, which now reads `B · .`.
- **`keys` are strings, `'b'`, `'shift+w'`, `' '`, `'arrowright'`** – the
  combo spelling the gate already used – rather than `{ key, shift }` objects.
  `keyText(combo)` spells one for a panel or a tooltip (`Shift-W`); a row
  whose 1.0.0 spelling differs from it (`Shift→`, `+ - 0`, `1–9`) keeps its
  text in `show`, and the gate checks that a command's row spells only keys
  that command answers.
- **A shifted press with no binding of its own falls back to the plain key.**
  That is what `case 'b': case 'B':` meant, and without it Shift-B, Shift-K,
  Shift-O, Shift-Esc and Shift-Space would stop working, and `?` `#` `+` `_`
  (which arrive with Shift held) would need shifted spellings. In the
  audience Shift-W, Shift-N and Shift-S reach W, N and S that way, as before.
- **`Enter` is a key of `forward`**, with its two exceptions (overview lands
  the selection, the cockpit's `onEnter` skips cards) inside the run
  function, rather than a command of its own: the panel lists it with the
  other forward keys and the plan said context stays in the run function.
  ArrowRight and ArrowLeft are keys of `forward` / `back` too, listed in the
  `→ ←` doc row.
- **`K` is answered in the audience as well**, where its run function only
  spends the press (preventDefault unless in overview), because that is what
  the switch did; the audience's `K` is on the gate's `NOT_A_ROW` list.
- **`viewHooks.onK` and `viewHooks.onShiftS` are gone.** `SPEAKER_JS`
  assigns `COMMAND_RUN['cue-cards']`, `freeze`, `preview-orientation`,
  `notes-pane`, `export-annotations` and `fullscreen-window`; `SOUFFLEUSE_JS`
  assigns `prompter`. The `typeof X === 'function'` branches in the shared
  switch went with them. A cockpit without `--prompter` has `shift+s` bound
  to a command with no run function, which spends the press on nothing, as
  the hook's default did. `onEnter`, `onN`, `consumeForward` / `consumeBack`
  and `escapePrompter` stay hooks: they are steps inside a command.
- **The editor stays outside the table's dispatch.** Its `E` (open the editor
  on a focused figure) and all of `dgeKeydown` run in a window capture
  listener in `editor.mjs`, ahead of the key map, and `dgeKeydown`
  stops propagation of every key while the editor is open. Moving `E` into
  `COMMAND_RUN` would have changed which of the two answers first (the go-to
  prompt, for one, sits between). Its rows are doc rows with
  `requires: 'editor'`. This is also what made `.` free: the editor's `.`
  (next figure) never reaches the slide's map. Verified free in both views
  and under the prompter – no `e.key` comparison for `.` anywhere else.
- **`window.PSI_COMMANDS` is the module, not just the table** – `COMMANDS`,
  `GROUPS`, `keyMap`, `commandFor`, `keyText`, `helpGroups`, spliced as text
  like `PSI_CARDS`, so the lookup the gate tests is the lookup the page runs.
  build.js both imports it (for `renderHelpOverlay`) and reads it as text, so
  `stage-engine.test.mjs`'s run-time-read count went from 5 to 6, and
  `desktop.yml`'s two path filters name it.
- **`help-keys` is subsumed by a gate called `commands`** (the file was
  renamed, so the count stays twenty). It keeps `NOT_A_ROW` and the panel
  check, and adds `PRESSES`: every press the old switch answered, per view,
  with the command it meant, put through the page's own `commandFor`.
- **`reach` is descriptive.** Set from speaker.md §2/§4.2 (`O` broadcasts,
  `1`–`9` and Esc are local); nothing reads it yet.
- **Not B1's, found while proving it:** `test/cue-cards.mjs`'s fixture deck
  names a chunk `{#psiINT-cue-panel}`, which the `reserved-id` refusal that
  landed just before B1 rejects, so the whole cue-cards spec threw at build
  time on the previous commit too. Fixed separately by naming the chunk
  `cue-panel` – the cockpit's id before the prefix, which a slide may now
  take freely.
