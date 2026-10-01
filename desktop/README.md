# psi-slides Builder

A desktop window around the psi-slides build. Open a lecture's `source.md`,
leave the window open beside your text editor, and every time you save the
file the four views are built again. One click opens each of them in the
browser.

It exists to remove one specific obstacle: without it, using psi-slides means
installing Node.js, running `npm install`, and knowing the command line. With
it, none of that is visible.

## What it is not

It is **not a Markdown editor**. You write the lecture in whatever text editor
you already use; the builder watches the file and turns it into slides. There
is no split view, no preview pane inside the window, no Git client, and no
place to type build commands. The window shows one sentence – whether the last
save built – and four buttons.

It is also not a second way of doing anything. It runs the same `build.js` the
command line runs, on the same `source.md`, and produces the same four files.
Anything you build in the app you can build in a terminal and the other way
round.

## Installing it

Download the package for your system from the project's
[releases page](https://github.com/UBA-PSI/psi-slides/releases) and install it
the way you install anything else. Until 2.0.0 the app is published as a
**pre-release** under its own tag, `builder-<version>`; the macOS package has
been tried on a real Mac, the Windows and Linux packages are built by CI and
are **experimental** – not yet tried on a real machine.

The packages are **not signed yet**, so each system will warn you the first
time. On macOS, a double click says the app cannot be opened because the
developer cannot be verified; open it once with a right click and "Open"
instead, and the warning does not come back. On Windows, SmartScreen shows a
blue "Windows protected your PC" panel; "More info" then "Run anyway" installs
it. On Linux, an AppImage needs the executable bit (`chmod +x`), and the `.deb`
installs with your usual package tool.

A release will be signed and, on macOS, notarised, so that nobody who is
handed the app has to read the paragraph above. Windows has no certificate
yet and keeps its one SmartScreen warning until it does.

## Using it

Open a `source.md`, or drop one on the window. The lecture builds, and the
four buttons become live:

| Button | File | What it is |
| --- | --- | --- |
| Presentation | `audience.html` | the projection |
| Cockpit | `speaker.html` | your notes, the timer, the next slide |
| Handout | `print.html` | the lecture as a document |
| Handout with notes | `print-notes.html` | the document plus your speaker notes |

"Build again whenever source.md is saved" is on by default. When a build
fails, the message from `build.js` is shown as it was written – it names the
line – and the four views keep the last build that worked, so a broken save
never takes your slides away in the middle of a lecture.

Under the four buttons the window says what is in the lecture: how many
sections and slides, how many words the students get and how many are in your
speaker notes, how many pictures and how many drawings. Beside them are the
two times that answer the question the numbers raise – when `source.md` was
last saved, and when it was last built.

**Only `source.md` is watched.** Change a picture, a clip or a font in the
folder beside it and nothing happens on its own: press "Build now", and the
new file goes into the four views.

Two switches are worth knowing about. **Open the views through a local web
address** starts a small server on this computer; embedded YouTube and Vimeo
players refuse to run from a file, and this is what makes them work. **Open
the views in** decides between Chrome or Edge, which is what psi-slides is
tested in, and whatever your system's default browser is.

**Export as PDF…**, beside “Open source.md in your text editor” (and in the
File menu), writes one of three PDFs: the presentation as `slides.pdf`, one
page for every slide and every step, 16:9; the handout as `print.pdf`; or the
handout with notes as `print-notes.pdf`, both on A4. You choose where the file
goes, and it is the same file `node build.js --slides-pdf`, `--print-pdf` or
`--print-notes-pdf` writes – the app prints with its own browser, so nothing
has to be installed and nothing is fetched from the network. For the
presentation you choose what stands on the slides: **Slide text** (the
default, the first sentence of each paragraph and what is set in bold) or
**Full text**. The command line instead follows the lecture's own setting
unless `--pdf-collapse` says otherwise. The export uses the last build that
worked; when automatic building is off and `source.md` has changed, it builds
first. A presentation can take a minute, since every step is a page. When it
is done, the line under the status sentence says which file was written, how
many pages it has, and anything worth checking before you hand it on, such as
a picture that did not load.

New lectures: "New lecture…" asks for a folder name and a place to put it, and
creates the same starter lecture `node build.js --new` creates, including a
small `::: draw` figure so the graphical diagram editor has something to open.

## Developing it

The app is a sub-package with its own `package.json` and its own dependency
tree. Neither Electron nor electron-builder is in the engine's `package.json`,
so somebody who only builds slides never downloads them.

```bash
npm install              # in the repository root – the engine's dependencies
cd desktop && npm install   # Electron and electron-builder

npm start                # run the app against the engine in the repository root
npm test                 # unit tests: the event parser, the PDF export, settings, paths, strings
npm run smoke            # start the app, build and export a real lecture, take screenshots
npm run parity -- <dir>  # the app's three PDFs against the command line's (a folder the smoke kept)
npm run stage-engine     # copy the engine into desktop/engine/ and install it
npm run dist             # stage the engine, then build the installers (unsigned)
npm run dist:signed      # the macOS release: signed and notarised, see below
```

`npm start` runs against the repository root, so the engine you are testing is
the one in your working tree. A packaged app instead carries a staged copy
under `resources/engine`, which `npm run stage-engine` produces: `build.js`,
the four files it splices in at run time, and a production-only
`node_modules` – about 42 MB, over half of it the bundled fonts.

The smoke test writes its screenshots to `test/shots/` (not tracked). They are
how the interface is reviewed against `DESIGN.md`. It exports the three PDFs of
a copy of the tutorial through the window and ends with the parity check: the
command line exports the same copy, and the page count, the text of every page
and, for the slides, the chunk and step on every page have to be equal. That
step needs the engine's `playwright-core`, a Chromium and poppler's `pdftotext`;
without one it says which and passes, except under CI. `PSI_SMOKE_KEEP=1 npm
run smoke` leaves the copy on disk and prints its path for `npm run parity`.

### Signing the macOS release

The signed build is made on the maintainer's Mac, not in CI, the same way
the Booklet Tool is released. Two things have to be in place:

- the "Developer ID Application" certificate in the login keychain –
  electron-builder finds it by itself;
- a file `desktop/.env` (gitignored) with the three notarisation variables
  `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` (made at appleid.apple.com) and
  `APPLE_TEAM_ID`. It is the same file the Booklet Tool uses; copy it.

`npm run dist:signed` then stages the engine, signs every binary in the app
under the hardened runtime, submits the app to Apple's notary service, waits,
staples the ticket, and writes the DMG and the zip to `dist/` – about five
minutes, most of it Apple's side. Note the order in its log: it notarises the
**app** and builds the DMG afterwards, so the disk image itself carries no
signature. Sign, notarise and staple it separately before uploading –
`CONTRIBUTING.md` has the four commands and the two `spctl` checks that say
whether it worked. CI stays
unsigned on purpose (`CSC_IDENTITY_AUTO_DISCOVERY=false`): the certificate
does not leave this machine, and an empty `CSC_LINK` from an unset repository
secret is read by electron-builder as a file path, not as absent.

## The security model, in five lines

- The window runs sandboxed with `contextIsolation`, no Node integration, and
  a `default-src 'none'` content security policy; it cannot navigate anywhere.
- The preload exposes twenty named commands and nothing else – no
  `readFile`, no `writeFile`, no `spawn`, no general IPC passthrough.
- Every command re-validates its arguments in the main process; a path from
  the window is checked and canonicalised before anything happens to it.
- The build runs as a separate process started with an argument array and no
  shell, so a folder name is a file name and never a command.
- Nothing leaves the computer. There is no account, no telemetry, no update
  check and no network access of any kind. A PDF export prints in a hidden,
  sandboxed window with empty storage that refuses every network request and
  cannot navigate or open another window.

## The state the window shows

| Phase | What it means | What the window says |
| --- | --- | --- |
| `closed` | no lecture open | the start screen |
| `starting` | the build process is coming up | "Starting…" |
| `building` | a build is running | "Building…" |
| `ready` | the last build succeeded | "Ready. Built at … in … s." |
| `build-error` | the last build failed | "The build failed.", the message, and which build the views still show |
| `process-error` | the build process ended unexpectedly | "Building has stopped unexpectedly." and a Restart button |

The state comes from `build.js --events`, which emits one JSON object per line
on stdout. The app reads only those; the human-readable log beside them is
what "Show build details" shows and what a bug report should carry.

## Further reading

- [`DESIGN.md`](DESIGN.md) – the design brief the interface was built
  against: the tokens, the two screens, and the things the design refuses.
- [`../docs/history/PLAN-electron-builder.md`](../docs/history/PLAN-electron-builder.md) – why the app
  exists, what it deliberately does not do, the packaging decisions, and the
  build log with the decisions taken while building it.
