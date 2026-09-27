# PDF exports in the desktop app: the slides and the document

The builder app should export two PDFs, each on a button press: the **slide
deck** (`slides.pdf`, from the audience view, one page per presentation state
– what `--slides-pdf` does today) and the **document** (`print.pdf` and
`print-notes.pdf`, from the two print views). It should do it without
installing anything and without shipping a second browser.

The plan: the export's policy moves into a zero-import module, and two small
drivers carry it – Playwright for the command line, Electron's own Chromium
for the app. Everything that decides what a page shows stays in one text.
Because the app promises to be “not a second way of doing anything” –
“anything you build in the app you can build in a terminal and the other way
round” **[read, desktop/README.md]** – the document export reaches the
command line first, and the app then offers what the command line already
does.

Each claim is tagged with where it comes from: **[measured]** was run,
**[read]** was read out of the code or a dependency, **[assumed]** is plausible
and the spike in stage 0 has to confirm it.

## Two exports, and neither is automatic

| | Slides | Document |
| --- | --- | --- |
| from | `audience.html` | `print.html`, `print-notes.html` |
| file | `slides.pdf` | `print.pdf`, `print-notes.pdf` |
| pages | one per state, walked through `window.psiExport` | the view's own pagination |
| page size | 1600 x 900 or 1600 x 1000 CSS px, set by the export | A4 with margins and a page number, set by the view's own `@page` rule **[read, PRINT_CSS]** |
| media | `screen` – the live view's `@media print` rules are for a document | `print` – they are what the document is |
| CLI today | `--slides-pdf` | nothing; stage 2 adds it |

The document export is the simpler of the two: load the page, wait for fonts
and pictures, print with `preferCSSPageSize`. No state walk, no clone, no
swapped DOM. What it adds over `Cmd-P` in a browser is what the slide export
already promises: the same file on every machine with the same build, no
network, no browser headers and footers, no print dialog – and in the app,
whose views open in an outside browser, a print dialog is not even at hand.

**Neither export runs on a save.** A slide export takes 3.7 to 37 seconds per
deck **[measured, CHANGELOG]**; the watch loop rebuilds in well under that and
must stay that way. Both are a button in the app and a flag on the command
line, and `--watch` combined with any PDF flag stays a usage error, as
`--slides-pdf` with `--watch` is today **[read, build.js `pdfOptionsFrom`]**.

## Why not Playwright in the app

Three candidates were weighed; none is used.

1. **playwright-core plus a bundled Chromium.** About 150–250 MB per platform
   and architecture **[assumed]**, a second Chromium beside the one Electron
   already is, and a nested `.app` that has to be signed and notarised inside
   the app's own bundle. `stage-engine.mjs` already lost a signed build to a
   symlink inside the bundle **[read]**; a nested Chrome is that problem in a
   larger form. And playwright-core pins the browser builds it speaks to, so
   the app would carry a third version to keep in step.
2. **playwright-core plus the user's own Chrome.** 12 MB **[measured]**, and
   the search already exists twice (`chrome-path.mjs`,
   `desktop/main/browsers.js`) **[read]**. But the PDF then depends on
   whichever Chrome the machine has, and a machine without one has no export.
   The app exists for people who never open a terminal; “install Chrome first”
   is the kind of step it was built to remove.
3. **playwright-core connected to Electron over CDP**
   (`connectOverCDP`). Needs `--remote-debugging-port`, which opens a
   debugging endpoint for the whole app on loopback – the class of hole the
   security round on `main` just closed for `--watch` and `--serve`
   **[read, CHANGELOG § Security]**. Still 12 MB.

**The choice:** Electron's own Chromium, driven through `webContents` and
`webContents.debugger`. Nothing is added to the package, nothing leaves the
machine, and the Chromium version is Electron's, so two machines with the same
app version print the same PDF.

`--omit=optional` in `stage-engine.mjs` stays: under this plan the app never
loads playwright-core.

## The split

`pdf-export.mjs` today holds two things **[read]**:

- **Policy.** `PDF_CSS`, the three in-page functions `pagePrepare`,
  `pageCollect` and `pageInstall`, the link table, the result shape and
  `report()`. None of it depends on Playwright: the in-page functions are
  already self-contained, because `page.evaluate` serialises them with
  `toString()`.
- **Mechanism.** About a dozen Playwright calls: `chromium.launch`,
  `newContext({viewport})`, `page.on('pageerror')`, `page.route`, `goto`,
  `waitForFunction`, four `evaluate`s, `emulateMedia`, `pdf`,
  `browser.version()`, `close`.

After the split:

| File | Holds | Imports |
| --- | --- | --- |
| `pdf-core.mjs` (new) | `PDF_SIZES`, `PDF_FIT_CEILING`, option validation, `PDF_CSS`, the in-page functions, `exportSlides(driver, opts)`, `exportDocument(driver, opts)`, `formatReport(result)` | none |
| `pdf-export.mjs` | the Playwright driver, `findChrome`, writing the files, printing the report | `pdf-core.mjs`, `chrome-path.mjs`, playwright-core (dynamic) |
| `desktop/main/pdf.js` (new) | the Electron driver, the save dialog, writing the files, the result for the window | `pdf-core.mjs` from the engine directory (dynamic `import()`), `electron` |

`pdf-core.mjs` has zero imports and no Node APIs, which is the rule
`souffleuse.mjs` keeps and for the same reason: it can be loaded anywhere, and
the parts that need no browser can be checked in a gate in milliseconds.
Writing the file stays with the callers (five lines each: temp name, then
rename, which replaces a link instead of writing through it – the rule the
security round set for every file the build writes **[read]**).

`build.js` imports `PDF_SIZES`, `PDF_FIT_CEILING` and the validation from
`pdf-core.mjs` statically, so the CLI and the app refuse the same values with
the same words. A static import is what `desktop/test/stage-engine.test.mjs`
holds against `FILES` **[read]**, so the test then forces `pdf-core.mjs` onto
the staging list. The dynamic `import('./pdf-export.mjs')` stays where it is.

### The driver contract

```js
// Everything an export needs from a browser, and nothing it decides.
const driver = {
  // A page of w x h CSS px at device scale 1, fresh storage, every
  // http(s) and ws(s) request refused and counted before anything loads.
  async open({ w, h, onBlocked, onPageError }) {},
  async load(fileUrl) {},                // resolves on the load event
  async waitFor(fn, timeoutMs) {},       // polls fn in the page until truthy
  async evaluate(fn, arg) {},            // fn is self-contained; may return a promise
  // Backgrounds always, no browser header or footer, -> bytes.
  //   { media: 'screen', w, h }  – slides: the export's page, no margins
  //   { media: 'print', css: true } – document: the view's own @page
  async pdf(how) {},
  version: '',                           // the Chromium version, for the report
  where: '',                             // what to print beside it
  async close() {},
};
```

The two export functions call these in a fixed order. **The order is the
contract**, and it is where the load-bearing properties of the slide export
live **[read, pdf-export.mjs header]**:

1. Network blocked **before** `load`, because the opening slide's embed loads
   during it. (Both exports.)
2. Auto-fit forced on, and the collapse set, **before** the walk. (Slides.)
3. The print DOM swapped in by inclusion **before** `pdf`. (Slides.)

Because the order lives in `pdf-core.mjs` and not in either driver, a driver
cannot get it wrong. A fake driver that records its calls turns that into a
gate.

One browser serves any number of exports in a run: `--slides-pdf
--print-pdf` opens one page per export and starts Chromium once.

### The Electron driver

Mostly the CDP commands Playwright itself sends, delivered through
`webContents.debugger`. playwright-core's bundle uses `Page.printToPDF`,
`Emulation.setDeviceMetricsOverride`, `Emulation.setEmulatedMedia`,
`Fetch.enable` and `Runtime.exceptionThrown` **[read, coreBundle.js]**.
Sending the same commands is the shortest route to the same PDF.

| Contract | Electron |
| --- | --- |
| page, fresh storage | hidden `BrowserWindow` on a non-persistent partition (`partition: 'pdf-<n>'`, no `persist:` prefix), `sandbox: true`, `contextIsolation: true`, no preload, `backgroundThrottling: false` |
| w x h at scale 1 | `Emulation.setDeviceMetricsOverride({width, height, deviceScaleFactor: 1, mobile: false})` – not the window size, which a laptop screen smaller than 1600 x 900 may clamp **[assumed]** and a Retina display doubles |
| network refused | `session.webRequest.onBeforeRequest` for `http://*/*`, `https://*/*`, `ws://*/*`, `wss://*/*`; count by origin, cancel |
| page errors | `Runtime.enable`, then `Runtime.exceptionThrown` |
| `load` | `loadFile(view)` |
| `evaluate` | `executeJavaScript('(' + fn + ')(' + JSON.stringify(arg) + ')')`, which runs in the page's main world, where `window.psiExport` is |
| `waitFor` | the same, polled |
| `pdf`, slides | `Emulation.setEmulatedMedia({media: 'screen'})`, then `Page.printToPDF` with the paper size in inches, zero margins and `printBackground` |
| `pdf`, document | `Emulation.setEmulatedMedia({media: 'print'})`, then `Page.printToPDF` with `preferCSSPageSize` and `printBackground` |
| fallback | `webContents.printToPDF` with the same numbers, if CDP printing is refused in a window that is not headless |
| `version` | `process.versions.chrome` |
| `close` | `win.destroy()` |

Plus what a window needs that a Playwright page does not: `will-navigate`
refused and `setWindowOpenHandler` answering `deny`, because the page comes
from a `source.md` somebody else may have written. The app's own window is
held to the same rule **[read, main.js]**.

**The fresh partition matters.** The audience runtime restores position,
zoom and theme from `localStorage` on boot (`loadPersisted`) **[read]**. A
Playwright context starts empty; an Electron window on the default session
would start wherever the last export, or the last lecture opened in that
session, left off.

## What is different in the app: the build on disk is a watch build

The app runs `build.js <source> --watch --events` and nothing else **[read,
builder.js]**. So every view beside the source is a watch build, and each one
carries a WebSocket to `ws://127.0.0.1:<port>` that reloads the page on the
message `reload` – the live views through `window.psiWatch`, the two print
views through a receive-only script with no nonce **[read, build.js]**. An
export page that kept that socket would **reload the moment the author
saves**: in the middle of the slide walk, or between the document's load and
its print. The live views' socket would also introduce itself with the build's
nonce and be treated as a view the server built.

The export therefore refuses `ws://` and `wss://` as well as `http(s)`. That
is also why the Electron driver blocks at the session and not with
`Fetch.enable`: the Fetch domain does not see WebSockets **[assumed]**.

Three alternatives, rejected:

- **A one-shot build for the export.** It would write the views beside the
  source as well, over the watch build, and every open tab would lose its
  reload client until the next save.
- **A build into a temporary folder.** `build.js` has no output-directory
  flag, and adding one to the source-format-stable CLI to serve one caller is
  the wrong trade.
- **Asking the watch child to export.** The child is plain Node
  (`ELECTRON_RUN_AS_NODE`) and has no windows.

A save while the export runs is harmless: the views are written under a new
name and renamed into place **[read, CHANGELOG § Security]**, so `loadFile`
never reads half a file, and the page already loaded does not change.

**Which build is exported.** The one on disk, which after a failed save is the
last one that worked – the app's promise **[read, desktop/README.md]**. When
automatic rebuilding is off and `source.md` has changed since
(`changedSinceBuild` in the builder's state **[read]**), the app rebuilds first
and exports on the next `build-success`. Otherwise the author would export a
deck that is not the one in the editor, and the window would say nothing.

## On the command line

- `--print-pdf` writes `print.pdf`, `--print-notes-pdf` writes
  `print-notes.pdf`, beside the source – named after the views, the way
  `--print-only` and `--print-notes-only` are **[read]**. Any combination with
  `--slides-pdf` is allowed and starts Chromium once.
- They rebuild the view they export, and ignore the `--*-only` flags for the
  reason `--slides-pdf` does: an export of a stale view is the one outcome
  worse than no export **[read, build.js]**.
- The slide options (`--pdf-beats`, `--pdf-size`, `--pdf-zoom`,
  `--pdf-zoom-max`, `--pdf-collapse`) without `--slides-pdf` are refused by
  name rather than ignored, which is how this CLI answers every flag that
  would otherwise do nothing **[read, the `--prompter-*` refusals]**.
- `--pdf-out` names one file, so it is refused when more than one PDF is
  asked for.

## In the window

The window's promise is “one sentence and four buttons” **[read,
desktop/README.md, DESIGN.md]**. A PDF is not a fifth view, it is a file the
author hands on, so the exports are **secondary**: no button in the grid.

- **One secondary action, “Export as PDF…”,** under the four buttons in the
  style of “Show folder”, opening a small sheet with three choices – slides,
  handout, handout with notes – worded like the buttons above it
  (“Presentation”, “Handout”, “Handout with notes” **[read, README]**).
- The same three as items in the **File ▸ Export as PDF** submenu, each
  opening the sheet with its choice made.
- **The slide choice carries one option:** slide text or full prose, because
  the two are different documents and the lecture's own setting is the one an
  author is least likely to remember **[read, PLAN-slide-pdf-export.md, the
  collapse addendum]**. Everything else takes the CLI's defaults (fit, all
  beats, 16:9). The document choices carry none.
- The main process opens the save dialog itself, defaulting to the CLI's file
  name beside the source. The renderer never sends a path – `ipc.js` has no
  `writeFile` and no path passthrough, on purpose **[read]** – so the new
  channel `exportPdf` takes a kind and options and nothing else.
- While it runs the status sentence says so, and the four buttons stay live.
- Afterwards: one sentence (“slides.pdf written – 84 pages”), the diagnostics
  as lines in the same place a build error is shown, and two actions, open the
  PDF and show it in the folder.
- DE and EN strings in `renderer/strings.js`; `strings.test.mjs` holds the two
  against each other **[read]**.

## Stages

Each stage leaves `main` green on its own.

### Stage 0 – spike (thrown away)

A throwaway script in `desktop/`, run with the development app, that opens the
fixture from `test/pdf-export.mjs` in a hidden window and prints it with the
table above – the audience view as slides, the print view as a document. It
answers five questions, and the plan changes if one answer is no:

1. Does `requestAnimationFrame` fire in a hidden window with
   `backgroundThrottling: false`? `pageCollect` waits for two frames per
   state. If it does not, try `paintWhenInitiallyHidden`, then offscreen
   rendering.
2. Does `Page.printToPDF` over `webContents.debugger` work in a window that
   is not headless? If not, does `webContents.printToPDF` with the same
   numbers give the same page breaks?
3. Is the slide page count equal to the CLI's, and does `pdftotext` give the
   same text page by page?
4. Do the pages look alike? `pdftoppm` both files at 50 dpi and compare page
   by page; expected differences are hinting and antialiasing, not layout.
5. Does the document come out as the print view promises: A4, the margins,
   the page number from the `@bottom-center` margin box, and no browser
   header or footer? Margin boxes are recent in Chromium **[assumed]**, so
   this is also the check on Electron's version.

Plus the watch case: export a lecture open in the app, save `source.md`
halfway through, and check that the page did not reload.

### Stage 1 – `pdf-core.mjs`, CLI unchanged

- Move the policy out of `pdf-export.mjs`; move `PDF_SIZES`,
  `PDF_FIT_CEILING` and the value checks out of `build.js`'s
  `pdfOptionsFrom`, which keeps parsing argv and calls them.
- `report()` becomes `formatReport(result, {outLabel})` returning lines;
  `pdf-export.mjs` prints them where they are printed today.
- The Playwright driver adds `ws://` and `wss://` to what it refuses
  (`page.routeWebSocket`), so the two drivers keep one network rule even
  though a one-shot build carries no socket.
- **Check:** `test/pdf-export.mjs` green and unchanged; the fixture's PDF has
  the same page count and the same `pdftotext` output before and after; the
  stderr of a run over `network-security` is identical.
- **New gate** (`test/gates/pdf-core.mjs`): a fake driver records calls and
  asserts the order (block before load, collapse before walk, media before
  pdf); the option checks refuse what `pdfOptionsFrom` refuses today, with the
  same words; `formatReport` on fixed results gives fixed lines.
- `pdf-core.mjs` goes onto `FILES` in `stage-engine.mjs` and onto both path
  lists in `desktop.yml`; `stage-engine.test.mjs` would refuse the commit
  otherwise.

### Stage 2 – the document export on the command line

- `exportDocument(driver, opts)` in `pdf-core.mjs`: open, block, load, wait
  for fonts and decoded pictures, collect the diagnostics that apply (missing
  pictures, dead fragments, blocked requests, page errors – not overflow,
  which a paginated document does not have), print.
- `--print-pdf`, `--print-notes-pdf` and the refusals above, in `build.js`.
- **Check:** a section in `test/pdf-export.mjs` against the same fixture:
  the file exists, its pages are A4 (`pdfinfo`), the speaker note is in
  `print-notes.pdf` and not in `print.pdf` (`pdftotext`), a fragment link
  inside the document still resolves (the link half the slide test already
  reads out of the file **[read, test/pdf-export.mjs]**), the refusals refuse,
  and `--slides-pdf --print-pdf` starts one browser (the `[pdf] Chromium`
  line appears once).

### Stage 3 – the Electron driver

- `desktop/main/pdf.js`: the driver, `exportPdf(kind, opts)` with the save
  dialog, writing the file, the result as data for the window.
- The IPC channel `exportPdf` in `ipc.js` and `preload.js`; one export at a
  time; closing the lecture or the window aborts it and removes the temporary
  file.
- The rebuild-first rule above, in the main process, against the builder's
  state.
- **Check:** a unit test in the style of `events.test.mjs` for everything
  that decides without Electron (when to rebuild first, what the result
  sentence says, which file name a kind defaults to); the spike's five
  questions again, now against the real module.

### Stage 4 – the window

- The secondary action, the sheet, the submenu, the collapse choice, the busy
  state, the result and the diagnostics, in both languages.
- **Check:** `smoke.mjs` exports the tutorial through the window in all three
  kinds, as it already drives the rest of the interface through Playwright's
  `_electron` **[read]**, and asserts: each file exists, no page error, the
  status sentence came back. The screenshots it takes get the sheet and the
  result state in both languages.

### Stage 5 – parity as a test

The smoke test's exports and CLI exports of the same copy of the tutorial are
compared: page count and `pdftotext` per page for all three, plus the
page-by-page chunk and beat table for the slides (from `--pdf-dump-dom` on the
CLI side and the same dump from the app's driver). That is the assertion that
keeps the two drivers from drifting, which neither driver's own test can see.

### Stage 6 – documents

- `CLAUDE.md`: `pdf-core.mjs` beside the other zero-import modules, the
  exception paragraph for `pdf-export.mjs` rewritten to say what is left in
  it, and the two new flags in the command list.
- `README.md` for the flags; `desktop/README.md` § Using it: one paragraph;
  `DESIGN.md`: the secondary action, the sheet and the result state.
- `CHANGELOG.md` for the engine split and the document export, and the
  builder's own release notes for the feature (it ships under its own
  `builder-*` tag).
- `PLAN-slide-pdf-export.md`: a pointer to this file from the list of open
  items.

## Acceptance

1. The app exports the slides, the handout and the handout with notes from an
   open lecture, each on a button press, with no Node, no npm, no Chrome and
   no network.
2. Neither the app nor `--watch` ever exports on a save.
3. The command line can produce each of the three PDFs the app can.
4. For the same source and the same options, the app's PDF and the CLI's have
   the same page count and the same text on every page; for the slides, also
   the same chunk and beat on every page.
5. The document PDFs are A4 with the print view's margins and page numbers,
   and carry no browser header or footer.
6. The package is not larger than today's by more than the size of
   `pdf-core.mjs` and `desktop/main/pdf.js`.
7. A save during an export neither reloads the export page nor breaks the
   export.
8. With automatic rebuilding off and `source.md` changed since the last
   build, the export rebuilds first.
9. The diagnostics reach the window with the chunk they name.
10. `npm test` at the root and `npm test` plus `npm run smoke` in `desktop/`
    are green; the existing `--slides-pdf` behaves as before.

## Open

- **The Chromium version Electron 44 ships**, and whether its PDF output
  embeds the variable fonts as Type 3 the way the CLI's does. Type 3 was
  accepted for v1 of the CLI **[read, CHANGELOG]**; the app should not quietly
  be better or worse.
- **What the print view does with a clip and a hosted embed.** The slide
  export replaces both with a still or a card **[read, pdf-export.mjs]**; the
  document export prints whatever the print view already shows, and nobody
  has looked at that on paper yet.
- **Progress.** One `evaluate` walks every state, so the window can only say
  “busy” for the slides. A progress count would need the walk to report per
  chunk (a `console.debug` line both drivers listen to). Not in v1.
- **Options beyond the collapse** (beats, 16:10, the zoom ceiling). The CLI
  has them; the app gets them when somebody asks, and then in the sheet, not
  on the main screen.
- **Windows and Linux.** The app's packages there are built by CI and have
  not been tried on a real machine **[read, desktop/README.md]**. The spike
  runs on macOS; the smoke test runs on Linux in CI under a virtual display.

## Decisions along the way

### Stage 1

- **The driver is two levels, not one object.** `driver.open({w, h,
  onBlocked, onPageError})` returns a page (`load`, `waitFor`, `evaluate`,
  `pdf`, `close`); the driver keeps `version`, `where` and `close`.
  `exportSlides` opens its own page and closes it, never the driver, which is
  what one browser for several exports needs without a driver keeping a
  "current page". The network is refused inside `open()`, so "block before
  load" is "open before load".
- **`pageSetup` is split out of `pageCollect`.** Auto-fit, the collapse and
  the first `quiesce` are now their own `evaluate`, ahead of the walk, so
  "collapse before walk" is an order of driver calls the fake driver can see.
  The fixture's three runs and network-security came out with the same page
  counts, the same `pdftotext` and the same stderr as before.
- **`exportSlides` takes a `url`, returns the bytes and writes nothing**; the
  DOM dump comes back as text too. `blocked` in the result is an array of
  `{origin, count}` rather than a Map, so a result crosses IPC as it is.
- **`formatReport` returns `{level: 'warn' | 'info', text}`**, not bare
  strings: today's report writes diagnostics to stderr and its account to
  stdout, and the app wants the same split.
- **The value checks are `resolvePdfOptions({beats, size, zoom, zoomMax,
  collapse})` plus one exported check per value.** Their words still name the
  CLI flags (`--pdf-zoom=…`). The app offers the collapse as a fixed choice
  and cannot hit them; if it ever offers more, the words need a second form.
  `--pdf-size=constructor` is now refused (it was accepted, with no size).
- **For Stage 3: a watch build's reload socket will be reported.** The
  Playwright driver now refuses `ws(s)://` and counts it as blocked, which on
  a watch build prints "blocked 1 request(s) to ws://127.0.0.1:<port> – … a
  remote image prints empty, so inline it" – the wrong advice, on every export
  the app makes. Stage 3 should keep the refusal and drop or reword that line
  for the loopback reload socket.
- The Playwright driver's `pdf()` knows `screen` only; `print` arrives with
  Stage 2, where it is checked. The temporary file is now a fresh name opened
  with `wx` rather than `<out>.tmp`.
- **Left for Stage 6:** CLAUDE.md still says seventeen gates in three places
  (test/README.md, which enumerates them, is updated); and the comment above
  `window.psiExport` in `AUDIENCE_JS` still says the policy lives in
  `pdf-export.mjs` – it ships inside the tracked views, so fixing it means
  rebuilding and committing them.
