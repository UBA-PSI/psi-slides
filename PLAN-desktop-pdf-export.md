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
| page, fresh storage | hidden `BrowserWindow` on a non-persistent partition (`partition: 'pdf-<n>'`, no `persist:` prefix), `sandbox: true`, `contextIsolation: true`, no preload, `backgroundThrottling: false`, `paintWhenInitiallyHidden` left at its default (true) – without it a hidden window gets no animation frames **[measured, stage 0]** |
| w x h at scale 1 | `Emulation.setDeviceMetricsOverride({width, height, deviceScaleFactor: 1, mobile: false})` – not the window size, which a laptop screen smaller than 1600 x 900 may clamp **[assumed]** and a Retina display doubles |
| network refused | `session.webRequest.onBeforeRequest` for `http://*/*`, `https://*/*`, `ws://*/*`, `wss://*/*`; count by origin, cancel |
| page errors | `about:blank` loaded first, then the debugger attached and `Runtime.enable` sent, then `Runtime.exceptionThrown` – sent before the first navigation, `Runtime.enable` hangs **[measured, stage 0]** |
| `load` | `loadURL(fileUrl)` |
| `evaluate` | `executeJavaScript('(' + fn + ')(' + JSON.stringify(arg) + ')')`, which runs in the page's main world, where `window.psiExport` is |
| `waitFor` | the same, polled |
| `pdf`, slides | `Emulation.setEmulatedMedia({media: 'screen'})` over CDP, then `webContents.printToPDF` with `pageSize` in inches (w/96 x h/96), zero margins and `printBackground` – `Page.printToPDF` does not exist over `webContents.debugger` in a window that is not headless **[measured, stage 0]** |
| `pdf`, document | `Emulation.setEmulatedMedia({media: 'print'})` over CDP, then `webContents.printToPDF` with `preferCSSPageSize`, zero margins and `printBackground` |
| `version` | `process.versions.chrome`; `where` is `Electron <version>` |
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
- **A self-test sheet without answers** (Pulse's `data-print=questions`).
  Deferred to a frontmatter key rather than an export option; see
  *Decisions along the way › Pulse*.
- **Windows and Linux.** The app's packages there are built by CI and have
  not been tried on a real machine **[read, desktop/README.md]**. The spike
  runs on macOS; the smoke test runs on Linux in CI under a virtual display.

## Decisions along the way

### Stage 0 (spike)

Electron 44.0.0, Chromium 152, macOS. The five questions answered yes, two of
them only after a correction the table above now carries.

- **`paintWhenInitiallyHidden` stays at its default (true).** With it set to
  false a hidden window gets no `requestAnimationFrame` frames at all and
  `pageCollect`, which waits two per state, hangs. With the default and
  `backgroundThrottling: false`, a hidden window runs at full frame rate.
  Offscreen rendering was not needed.
- **`Page.printToPDF` does not exist over `webContents.debugger`** in a window
  that is not headless. `webContents.printToPDF` does the job: the page size
  in inches, zero margins, `printBackground`, and for the document
  `preferCSSPageSize`. The media is still set over CDP first
  (`Emulation.setEmulatedMedia`), and the printout honours it.
- **`Runtime.enable` sent before the first navigation hangs.** The window loads
  `about:blank`, then the debugger attaches and `Runtime.enable` and
  `Emulation.setDeviceMetricsOverride({width, height, deviceScaleFactor: 1,
  mobile: false})` go out; the override survives the navigation to the view.
- **The network is refused at the session** (`webRequest.onBeforeRequest` for
  `http`, `https`, `ws`, `wss`), which sees the reload socket as a
  `webSocket` request; counted by origin, cancelled. `will-navigate` refused,
  `setWindowOpenHandler` denies.
- Evaluation is `executeJavaScript` in the main world. On the fixture and the
  tutorial, page count and `pdftotext` equal the CLI's; the document is A4
  with the view's margins and page number; saving `source.md` during an
  export reloaded nothing.

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

### Stage 2

- **`exportDocument(driver, {url})`** calls open, load, `waitFor(docReady)`
  (load complete, fonts loaded), `docSettle` (every picture in a chunk
  decoded, a lazy one made eager, two frames), `docCollect` (missing pictures,
  dead fragments), then `pdf({media: 'print', css: true})`. The result is
  `{kind: 'document', pdf, view, pages, pageSize, pictures, missingImages,
  dead, blocked, reloadSockets, pageErrors, version, where}`; the slide result
  gains `kind: 'slides'` and `reloadSockets`. The page opens at 794 x 1123 CSS
  px (A4 at 96 dpi), which only the screen layout before printing sees.
- **The Playwright driver's print path** is `emulateMedia('print')`, then
  `page.pdf` with `preferCSSPageSize`, `printBackground` and no header or
  footer, and no size or margins of its own. Chromium then takes size *and*
  margins from the view's `@page` rule: measured on the fixture, every page is
  594.96 x 841.92 pt (Chromium's A4, a point short of ISO's either way), the
  margins are the view's, and the `@bottom-center` page number is there
  (Chromium 153; checked by eye at 50 dpi).
- **The page count is read out of the bytes** (`pdfFacts`, the page-tree
  reading `test/pdf-export.mjs` already did), because a document's pagination
  is the browser's and no DOM knows it. `null` when the file cannot be read,
  and the report then says "an unread number of page(s)" rather than guess.
- **A dead fragment is demoted to text in the document too**, as in the slide
  export, so the one diagnostic reads the same in both. That is a DOM change
  the plan's "no swapped DOM" did not foresee; nothing else is touched.
- **`formatReport` takes `withBrowser`** (default true), so a run of several
  exports prints the Chromium line once, with the first. The document's
  blocked line drops "a hosted embed prints as a card", which is the slide
  export's alone. A document report is the diagnostics, the Chromium line and
  `Wrote … (N page(s) from print.html, 210×297 mm)`.
- **The reload socket, which Stage 1 left for Stage 3, is settled here in
  pdf-core:** a refused `ws(s)://` to loopback (127.0.0.1, localhost, [::1],
  any port) is counted as `reloadSockets` and `formatReport` says nothing about
  it. Still refused, so the page cannot reload on a save. Measured on a watch
  build of the fixture: one socket counted per export, no line printed. The
  one-shot CLI has no socket, and its output is byte-identical (stdout, stderr
  and `pdftotext` of `slides.pdf`).
- **`exportSlidesPdf` became `exportPdfs({slides, documents})`**: one driver,
  slides first, then the documents in flag order. The missing-playwright-core
  message names every flag asked for, and reads as before for `--slides-pdf`
  alone. Three PDFs of the fixture in one run: 3.3 s.
- **Refusals beyond the plan's list:** `--pdf-out` with no PDF flag at all, and
  `--pdf-dump-dom` counted as a slide option. Slide options with no PDF flag
  at all are refused too – before, a plain build silently ignored them; that
  is the one behaviour change for a command that used to succeed. The order is
  `--watch`, then an option with nothing to read it, then `--pdf-out` with two
  files, then the slide values, so a `--slides-pdf` command names the same
  error first it always did.
- **Open, observed:** in `print.html` a hosted embed's `<iframe>` carries only
  `data-src`, so on paper the frame prints as nothing and the address line
  under it is all that is left – no provider, no card, no hint that a video
  stood there. The fixture has no clip, so a clip on paper is still unseen.
- **Left for Stage 6:** CLAUDE.md's command block (the two flags, one browser,
  the refusals, `exportDocument` in the pdf-export paragraph, and the test's
  "Eighty assertions", now 127), README, CHANGELOG (including the refusal of
  stray `--pdf-*` options on a plain build).

### Stage 3

- **`desktop/main/pdf.js`** holds a pure half (the kind table, the request
  check, `exportPlan`, `waitOutcome`, `exportResult`, `writeAtomic`), the
  Electron driver and `createPdfExporter({builder, getWindow, engineDir,
  onReport})`. Like `builder.js` it requires `electron` only inside the
  functions that run, so `desktop/test/pdf.test.mjs` loads it under a bare
  `node --test` (fourteen tests, in desktop's `npm test`). `pdf-core.mjs` is
  imported from `engineDir()` on the first export and cached; staging needed
  no change, since it was already on `FILES` for the static import.
- **The IPC shape.** `exportPdf(kind, opts)` with `kind` one of `slides`,
  `print`, `print-notes` and, for the slides only, `opts.collapse` one of
  `topic-bold`, `none` or `null` (the lecture's own, the CLI's default);
  anything else is `pdf.badRequest`. Everything else is `resolvePdfOptions`'s
  default. The result is `{ok: true, kind, file, name, pages, pageSize: {w, h,
  unit: 'px' | 'pt'} | null, stale, rebuilt, durationMs, diagnostics: [{text,
  chunk}], report: [{level, text}]}`, or `{ok: false, canceled: true}` for a
  cancelled dialog, or `{ok: false, error, reason?}` with `error` one of
  `pdf.badRequest`, `pdf.busy`, `pdf.noProject`, `pdf.notBuilt`,
  `pdf.buildFailed`, `pdf.aborted`, `pdf.failed`. `stale` is true when the
  export printed the last good build after a failed save. No bytes and no
  path from the window cross IPC. Two more channels beyond the plan,
  `openPdf()` and `showPdf()`, act on the last file written, so the window's
  two result actions need no path either; the last file is forgotten with
  the lecture. The full report is also appended to the build details log.
- **`formatReport`'s `warn` lines carry `chunk`** when the diagnostic names
  one (overflow, a missing picture, a dead fragment), so the window can name
  the chunk without parsing the sentence. The text is unchanged, and the
  gate, which compares text, is untouched.
- **The rebuild-first rule is `exportPlan`, decided after the save dialog**,
  so a save made while it was open counts: `rebuild` when auto-build is off
  and `changedSinceBuild`, `wait` when a build is already running (auto on,
  a save seen) – the plan did not name that case – and `now` otherwise,
  including after a failed save. The wait ends on `build-success`, or fails
  on `build-error`, `watch-error` or a new `process-exit` the Builder emits
  when its child ends unasked. For that the Builder gained `onEvent(fn)`,
  which sees every event after the state has taken it.
- **One export at a time, refused not queued.** `abort()` is called from
  closing the lecture, opening another, the window's `closed` and
  `before-quit`: it ends the wait, destroys the export's windows and wins a
  race against the export's promises, which may never settle once their
  window is gone. `writeAtomic` asks whether the job is still live before
  the rename and removes its temporary file either way.
- **Checked against the real module under Electron** (a throwaway script with
  the dialog stubbed and the real Builder running `--watch --events`):
  fixture slides 22 pages, tutorial slides 128, `print.pdf` 44 and
  `print-notes.pdf` 47 pages, all A4 (594.96 x 841.92 pt) – page count and
  `pdftotext -layout` equal to the CLI's for all four; the fixture's five
  diagnostics word for word the CLI's, each with its chunk, and the reload
  socket not reported. The tutorial slides with auto-build off and a save
  pending rebuilt first (`rebuilt: true`). Eleven rebuilds during a 48 s
  slide export left the PDF text-equal to the CLI's. A second request while
  one ran got `pdf.busy`; an abort 0.7 s into an export returned
  `pdf.aborted` and left neither a PDF nor a temporary file.
- **The Chromium differs from the CLI's**: Electron 44 is Chromium 152, the
  Playwright cache here 153, and the text and pagination still agree. The
  report says `Chromium 152.… – Electron 44.0.0`.

### Pulse

main's `::: pulse` (6883816) put a self-test question into the two documents:
`renderPulseQuestion` writes `<pulse-question id key>` with the question, then
a `<details>` whose `<summary>` is the word Answer and whose body is the
answer; `renderDocument` inlines `pulse-embed.js` (Pulse Embed v2, `data-host`
the Pulse server, `data-page` the title), `PULSE_PRINT_CSS` and the two
`<pulse-summary>` boxes only when a question exists. The live views carry none
of it. Merged into this branch as dcc8243.

- **The un-upgraded markup does not print the answer [measured].** The fixture's
  `print.html` with the widget's `<script>` cut out, printed on print media by
  Chromium 153: both questions, the word Answer twice, neither answer. So the
  export cannot print the markup as the build wrote it and hope.
- **The widget's own print behaviour is what the export wants [read, measured].**
  On DOMContentLoaded it rebuilds each question – the answer moves out of the
  `<details>` into `.pulse-a`, which its unlayered `@media print` rule shows
  with `!important` (`data-print` default `answers`) – and on paper it hides
  the buttons, the grading row, the status line and both `<pulse-summary>`
  boxes. `PULSE_PRINT_CSS`'s `main > pulse-summary { display: block }` loses to
  that `!important`, as it should. The PDF shows the label Self-test, the
  question and the answer, and nothing else of the widget.
- **The wait is `docReady`, and the check is `docPulse` in pdf-core.** The
  widget's set-up is synchronous inside its DOMContentLoaded handler, so
  `readyState === 'complete'` already means every question it will ever touch
  has been touched; polling for `.pulse-ready` would only turn a broken widget
  into a 30 s timeout. `docPulse` runs after `docReady` and before `docSettle`
  (an answer may hold a picture): it counts the questions and opens the
  `<details>` of any that still has one, so a question the widget missed
  prints its answer under the Answer label rather than printing nothing. Both
  drivers get it because it is in `exportDocument`; the gate holds its place
  in the order.
- **The report.** A document with questions says `[pdf] N self-test
  question(s) printed with their answers.` (info); a question the widget did
  not set up is a `warn` with its chunk – which the window's diagnostics list
  picks up with no change, since `exportResult` already reads `chunk` off the
  warn lines. The result gains `pulse: {questions, unread: [{chunkId, key}]}`
  on a document result; `formatReport` treats its absence as none, so a slide
  result and the desktop tests' fixed results are unaffected. **No IPC
  change**: nothing in the `exportPdf` result shape moves.
- **Nothing reaches the Pulse server, and the zero is measured, not special
  cased.** The widget asks its server only with a sign-in token in
  `localStorage` (`refresh`, `syncPending`, `logout`); both drivers open every
  export on fresh storage (a new Playwright context, a non-`persist:`
  partition in Electron), so there is no token and no request. The fixture's
  run shows no `blocked` line on the command line and `blocked: []` under
  Electron. There is therefore no Pulse-specific wording in `formatReport`:
  a refused request to the Pulse host would mean a driver kept storage, which
  is a defect to see, not a message to soften. The summary's links (About,
  Privacy) are anchors inside boxes print hides, not requests.
- **`data-print` is deferred [decided].** The widget reads it once, from its
  `<script>` tag, at start-up, so an export flag would have to rewrite the page
  before the script runs or override the widget's `!important` rules with
  later ones – either way a second definition of what `questions` and `hide`
  mean, and one that Cmd-P on the same `print.html` would not share. A
  self-test sheet without answers is a plausible want, but it is a property of
  the document, not of the export: if it comes, it comes as a frontmatter key
  that build.js writes onto the script tag, and then both printing paths get it
  for free and the export needs no option and the window no control. Until
  then the export prints what a reader's Cmd-P prints: questions with answers.
- **The slides never see it**: the live renderers skip `kind: 'pulse'`, and
  the test asserts no `pulse-question`, `pulse-summary` or widget in the slide
  export's print DOM and neither question nor answer in `slides.pdf`.
- **Checked:** `test/pdf-export.mjs` builds a deck of its own (two questions,
  one keyed by chunk id, one by `{#key}`, a note so print-notes differs) and
  asserts both questions and both answers in `print.pdf` and
  `print-notes.pdf` by `pdftotext`, no Answer / Show answer / I knew it /
  summary text, no blocked request, no page error, and the report line
  (139 assertions). The Electron driver on the same deck, through a throwaway
  script: two questions, `unread: []`, `blocked: []`, both answers in the
  text; on the script-less copy, `unread` names both chunks and the answers
  print under Answer. The Playwright driver on that copy agrees.
- **A throwaway Electron script has to keep a window or listen for
  `window-all-closed`**: without either, Electron starts quitting when the
  first export's hidden window is destroyed, and the second export's
  `loadURL('about:blank')` fails with `ERR_FAILED`. The app has its main
  window, so this is a trap for scripts, not a defect in the driver.
- **For Stage 6:** the handout PDFs carry the self-test questions with their
  answers, and never the buttons or the standing; no option chooses questions
  only (see above); the export sends nothing to the Pulse server. SECURITY.md's
  Pulse paragraph can say the PDF export is one more path that sends nothing.

### Stage 4

- **The button shares the editor's row, second, not a row of its own.**
  “Open source.md in your text editor” and “Export as PDF…” are two text
  buttons on the line under the grid; the editor note follows them. A row of
  its own under the grid put the German ready state at 767 px in the 748 px
  viewport and failed the smoke's no-scrollbar check; English was at the
  edge too. The editor button keeps first place, because it is the daily one.
- **The export's line sits under the build's sentence, not in its place.**
  The plan says “the status sentence says so”; taken literally, a slide export
  would have hidden the build's answer for up to a minute while the author
  keeps saving – eleven rebuilds in one export were measured in Stage 3. So
  the build keeps its sentence and its dot, and the export has a second line
  in the same `aria-live` region, at body size, aligned with the sentence's
  words and without a dot of its own: “Exporting the handout as PDF…”, then
  “print.pdf written at 08:30 – 44 pages.” with *Open PDF* and *Show in
  folder* beside it. The slides add one soft line while they run (“Every step
  of every slide becomes a page, so a long lecture can take a minute.”), since
  there is no progress to show. The line stays until the next export or until
  another lecture is open, which is why it carries the time.
- **The collapse is two choices, not three, and slide text is the default.**
  “On the slides: Slide text – the first sentence of each paragraph, and what
  is set in bold / Full text – every sentence, as it stands in source.md”
  (DE „Auf den Folien: Folientext / Volltext“). A third choice, the lecture's
  own setting, does not read cleanly: the window does not know that setting,
  so it could only say “whatever the lecture says”, and that is exactly the
  setting the plan calls the one an author is least likely to remember. The
  IPC's `collapse: null` stays for a later caller; the window never sends it.
  Slide text is the default because a PDF deck is the fallback for the room.
  The choice is remembered for the session, like the kind.
- **The sheet is the app's sheet pattern**: it takes the screen's place,
  Escape and Cancel close it, the focus lands on the chosen kind and goes back
  to the control that opened it, Enter on a choice exports. The three kinds
  are radios named with the grid's own strings (`outputs.audience`, …) plus a
  soft line each; the handouts hide the collapse fieldset rather than disable
  it. “Export…” carries an ellipsis because the save dialog follows.
- **Busy, in the window and the menu.** While an export runs the button is
  `aria-disabled` rather than `disabled` (a disabled button drops the focus of
  whoever just pressed it), clicks on it do nothing, and File ▸ Export as PDF
  is greyed out: `ipc.js` rebuilds the menu when an export starts and ends,
  and `menu.js` asks `ctx.pdfBusy()`. The four view buttons, Build now and
  the switches stay live. The main process still refuses a second export
  (`pdf.busy`), which the smoke checks through the IPC.
- **Results.** Canceled says nothing: the line returns to what it said before.
  Each error code is one localized sentence; `pdf.failed` adds its reason in a
  mono block. Diagnostics are the export's own words, verbatim, one per line in
  a mono block under “Worth checking before you hand it on:”, as a build error
  is shown; they already name the chunk (“print.pdf: dead-link links to
  #no-such-chunk …”), so the window does not reprint the `chunk` field. A
  stale export (last good build after a failed save) says so in the soft line.
  An answer arriving for a lecture that is no longer open is dropped.
- **The save dialog's title** is now the window's language
  (`createPdfExporter({dialogTitle})`); it was the English literal.
- **The smoke test** answers the save dialog in the main process
  (`dialog.showSaveDialog` replaced through `electronApp.evaluate`) with the
  path the dialog proposed, so the three PDFs land beside the working copy's
  `source.md` – a copy of the tutorial in `$TMPDIR/psi-builder-smoke-*/
  smoke-lecture/`, never `lectures/tutorial/`. `PSI_SMOKE_KEEP=1` leaves that
  copy on disk and prints its path, for Stage 5. It drives the button, the
  sheet, the menu item (Handout with notes, opening the sheet preselected), a
  cancelled dialog, then print, slides and print-notes in turn, checking each
  sentence, each file's `%PDF-` header, the busy state, the greyed menu, the
  busy refusal, that the dialog proposed the CLI's names, that no export page
  reported an error (from the report in the build details) and that the main
  window had no page error. A second lecture of its own exports a handout with
  a dead fragment, so the diagnostics block is exercised. Measured on macOS:
  tutorial print.pdf 44 pages, slides.pdf 128, print-notes.pdf 47, the slide
  export in under a minute. New shots: `pdf-sheet`, `pdf-sheet-dark`,
  `pdf-sheet-de`, `pdf-running`, `pdf-result`, `pdf-result-dark`,
  `pdf-result-de`, `pdf-diagnostics`. `shoot()` now moves the pointer away
  first, so no cell shows a leftover hover.
- **For Stage 6:** DESIGN.md's project-screen mock-up (the editor row with
  the second button, the export line under the status sentence), a
  subsection for the export sheet beside *Settings*, and the export's line in
  *Motion* (no progress bar, one soft line for the slides); desktop/README.md
  § Using it; the smoke's header in CLAUDE.md-level docs if any mention the
  shot list; the builder's release notes.

### Stage 5

- **Parity is the last step of the smoke test, in `desktop/test/parity.mjs`.**
  The smoke already exports the three PDFs of a tutorial copy through the
  window; a second Electron launch to export them again would double the
  slowest part of the run for nothing. So after the app has closed – nothing
  rebuilds the copy under the comparison – `parity()` runs the command line
  once on the same lecture and compares. The same file also runs alone
  (`npm run parity -- <folder>` from `desktop/`) on the working folder that
  `PSI_SMOKE_KEEP=1 npm run smoke` keeps, which is how the drift check below
  was made without a second smoke run.
- **The app's dump is `PSI_PDF_DUMP_DOM=<absolute path>`, read in
  `desktop/main/pdf.js` by `dumpDomPath(env, app.isPackaged)`** and passed to
  `exportSlides` as `dumpDom`, the hidden CLI flag's counterpart. Not a
  channel: the window never names a path, and a test-only IPC argument would
  be one the renderer could send. A packaged app never reads the variable,
  so a shell that happens to set it cannot make the shipped app write a file
  nobody chose; a relative path is ignored too. Unit-tested in
  `pdf.test.mjs` (55 tests now).
- **The command line exports a second copy, not the same folder.**
  `parity-cli/smoke-lecture/` under the smoke's folder, with the same folder
  name (in case anything derives from it), `source.md` compared by SHA-256
  before the run, one `build.js --slides-pdf --print-pdf --print-notes-pdf
  --pdf-collapse=topic-bold --pdf-dump-dom=…` for all three. A second copy
  rather than `--pdf-out`, which names one file and is refused for three, and
  rather than moving the app's PDFs aside, which would leave a kept folder
  that no longer looks like what the app wrote. Removed afterwards.
- **Same options.** The window's slide default is Slide text, which the IPC
  sends as `collapse: 'topic-bold'`; everything else is `resolvePdfOptions`'s
  default on both sides (all beats, 16:9, fit, ceiling 1.35). The command
  line is given `--pdf-collapse=topic-bold` and nothing else. The documents
  take no option on either side.
- **What is compared.** Per PDF: the page count out of the bytes
  (`pdfFacts`), then `pdftotext -layout` split on form feeds, every page
  equal as a string – no tolerance. For the slides, the chunk-and-beat table
  of both dumps: one row per `.pdf-page` wrapper with its chunk id, its beat,
  its `--zoom` and the number of elements the reveal holds back on it. **The
  dump carries no beat number** – pdf-core records the beat in `got.pages`
  but not on the wrapper – so the beat is the page's place in its chunk's
  run, which is what the walk produces (beat 1 up, consecutive pages); the
  held-back count is what tells two beats of one reveal apart. Adding a
  `data-beat` to the wrapper was the alternative and was left alone: it
  changes the print DOM that `test/pdf-export.mjs` reads with a fixed
  pattern, for a number the order already gives. The zoom is compared as
  the string the page carries, exactly, and matched exactly. No pixels: the
  spike saw glyph antialiasing only.
- **Measured (macOS, Electron 44 / Chromium 152 against Playwright's
  Chromium 153):** slides 128 pages, print 44, print-notes 47 on both sides;
  every page's text equal in all three; the beat table equal on all 128 rows
  (109 chunks, 19 pages past beat 1, ten distinct zooms). The command-line
  half takes 47 s.
- **Deliberate drift:** the command line given `--pdf-collapse=none` instead
  – the two failures it should produce and no others: slides.pdf's text
  differs on 109 of 128 pages (first page 3, the same line at a different
  indent), and the beat table differs at page 3 (`one-source`, zoom 1.35 vs
  0.95). The page count still matched, which is why the text and the table
  are there. The two documents stayed equal, as they take no collapse.
  Reverted.
- **Degrades like the repository's browser checks, except under CI.** No
  playwright-core in the engine, no Chromium (`findChrome`, which honours
  `$PSI_CHROME`), or no `pdftotext`: the step says which and passes. With
  `CI` set it fails instead, because a comparison that quietly did not run
  in CI is not a comparison. Checked both ways with `PSI_CHROME=/nope`.
- **CI.** `desktop.yml`'s test job now installs `poppler-utils` beside
  `xvfb`; the engine's `npm ci` already installs playwright-core (an
  optional dependency, installed by default) and `findChrome` answers with
  the runner's `/usr/bin/google-chrome`, as it does for the browser suite.
  The path filter gains `pdf-export.mjs` and `chrome-path.mjs`: the app
  stages neither, but the parity step runs both, so a change to the command
  line's driver can fail this job and has to run it. `stage-engine.test.mjs`
  checks the filter covers what is staged, one direction only, so the extra
  names pass it. **Not yet run on a runner**: there the command line's
  Chromium is Google Chrome stable, further from Electron's 152 than the 153
  measured here. If pagination ever differs there, that is a Chromium
  version showing through, and the answer is `$PSI_CHROME` pointing at a
  Playwright Chromium of Electron's version, not a tolerance.
- **Where the plan was wrong or silent.** It spoke of "the same dump from the
  app's driver" as if one existed; the driver had no dump, and the app had
  no way to ask for one without a channel or a variable. It assumed the dump
  gives a beat per page; it gives the chunk and the zoom, and the beat has
  to be read off the order. It did not say that the two sides default
  differently – the window to Slide text, the command line to the lecture's
  own setting – so "same options" needs `--pdf-collapse=topic-bold` spelled
  out. And it did not notice that desktop CI would now run the command
  line's PDF driver, which its path filter did not name.
- **For Stage 6:** CLAUDE.md – the smoke's parity step and `npm run parity`
  in the desktop paragraph, `PSI_PDF_DUMP_DOM` beside `--pdf-dump-dom` as the
  app's hidden counterpart (development runs only), and the path filter's
  two unstaged names; `desktop/README.md`'s testing notes (poppler for the
  smoke, `PSI_SMOKE_KEEP` and `npm run parity`); `test/README.md` if it lists
  what the desktop smoke covers; the builder's release notes need nothing
  user-facing.
