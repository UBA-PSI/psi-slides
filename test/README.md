# The two test suites, and which one a thing belongs in

Two suites, split by one question: **can this be decided without a browser?**

- **`test/gates/`** – everything that can, which is no longer only the figure
  language and the `{…}` tail grammar: a gate is the right home for any
  hand-mirrored list one file keeps of another's. Twenty-five gates, about three seconds,
  no browser and no `npm install`. Run by `gates.yml` on push and pull
  request.
- **`test/`** – the things that only break in a built page. 58 specs, about 2,110
  assertions, about four minutes on a twelve-core machine with six specs at a
  time (about eleven minutes one at a time). Three of them, `souffleuse`,
  `live-trust` and `watch-resume`, start an engine of their own beside their
  browser – see below.

`npm test` runs the gates first, so a compiler regression fails in seconds
rather than in minutes.

Anything checkable without a browser belongs in `lint.js`, where it runs on
every commit, or in `test/gates/`, where it runs on every push. The browser
suite is not a unit-test suite.

A third file is in `npm test` and belongs to neither suite: `test/reproducible.mjs`
builds a lecture under a partial flag and under a full one and asserts the view
they share is the same bytes. It needs no browser and no `npm install` beyond
what `build.js` already has, but it is not a gate either, because it runs a
build. It exists because `release.yml` fails when a tracked view on disk does
not match a rebuild, and that check is only meaningful if a rebuild is a
function of the source alone - which, for a while, it was not. (Of the source
and of the encoder, strictly: an inlined PNG becomes WebP through the local
`cwebp` or `magick`, so the tracked views are built with `--no-optimize-images`,
through `npm run build:tracked`. The browser suite builds its lectures in place
with the same flag – `buildLecture` in `harness.mjs` – so a test run leaves the
tracked views as committed.)

`test/containers.mjs` is in `npm test` for the same reason it is in neither
suite: it runs build.js and lint.js as subprocesses and drives no browser. It
crosses every container a slide body has – `::: cards`, `::: rows`, both panes
of `::: side`, `::: overlay`, `::: dock`, `::: expand`, `::: footnote`,
`::: pulse`, `::: cols`, `::: slide`, `::: script`, and a divider's body with and without a
card row or an overlay – with every line the parser reads as structure: a
`> note:` (with and without a continuation line), a `> annot:`, a `---`, a
`##` and a `#` heading, a multi-line HTML comment holding all of those, one
with blank lines, one with text after its `-->`, a comment on one line, and an
unknown `::: foo`. Each pair is one deck, built and linted; the two must agree
on accept or refuse, and an accepted deck must keep the chunk after the
container visible in all four views, keep a note out of `audience.html` and
`print.html` and in the cockpit and the notes document, leave no comment open
and no `--&gt;` behind, and keep what a comment held inside it. Two defects
the 2.0.0 review found were one capture mode forgetting one line type – a note
in a card row shown to the room, a heading in a commented-out draft that took
every later slide with it – and a fixture per pair would only have caught the
pair someone thought of. About 175 decks, five seconds, eight at a time;
`--verbose` lists which pairs are accepted and which refused.

`test/cli.mjs` sits beside it in `npm test` for the same reason: it runs
build.js and drives no browser. It is the command line as an author meets it
– a typo'd flag (`--wacth` must name `--watch`), a value in the wrong form
(`--port=8080`, `--check-fit=true`, `--pdf-zoom 1.2`), a flag read as a value,
an option without the flag that reads it, a flag beside one of the five
commands that build nothing, `--watch` with `--check-fit`, two sources, `-h`
and `--help` (stdout, exit 0; a bare `node build.js` on stderr, exit 1), a
folder for a file, `--port abc` and `--port 99999`, and a port that is taken.
Each refusal must exit 1, say its sentence, carry no stack trace and write no
view; the help must have a row for every flag in `CLI_FLAGS` that is not
hidden, which is the half the `cli` gate cannot run. It also reads a
synthetic prompter log back – `--prompter-debrief` picking the newest log that
is not a dry run (by name and by content), the time table, `--transcript`, an
escape sequence printed as a space, a bare log name beside `source.md` for
`--prompter-replay` too, and the debrief's refusals. About 220 assertions,
five seconds.

`test/present.mjs` follows it, for the same reason, and is the start of a
talk from the command line: the addresses after the first build, the
lecture's own port for `--serve` and the watch socket and the same ports on a
restart, a `run` message that tells a page of the first run it is stale (a
socket of its own, not a browser), the line when a port is taken, `--open`,
the key (none, the key file, the environment over the file, a file others can
read, a `.env` beside the lecture that must not be read), the line Ctrl-C
prints, the log's name (seconds, `-dry` on a dry run), `dryRun` on its
`session` line and the `end` line Ctrl-C and SIGTERM close it with, and
`--present` with what it refuses. Every run gets `PSI_OPEN=print`,
so `--open` prints what it would open, and an `XDG_CONFIG_HOME` of its own,
so the key file is never the machine's. About 55 assertions, half a minute.
The page half of a restart – a tab of the old run reloads itself, once – is
the last section of `watch-resume.mjs`.

A fourth place exists and is deliberately not one of these: `desktop/test/`
holds the desktop app's own tests, run by `npm test` inside `desktop/` and by
`desktop.yml`, never by `npm test` here. What it guards is the app's reading
of `--events`, its settings file and its window, none of which a lecture
depends on. Since the engine it stages is a hand-written list of the files
`build.js` reads about itself, `stage-engine.test.mjs` is there too - the same
shape as the `frontmatter` gate, in the suite that can see the packaging
script. The desktop smoke test (`npm run smoke` there) ends with a parity
step, `desktop/test/parity.mjs`: the command line exports the same copy of the
tutorial the app just exported through its window, and the three PDFs must
agree in page count, in `pdftotext` on every page and, for the slides, in the
chunk and beat on every page. It is the one check that holds the Playwright
driver and the Electron driver of `pdf-core.mjs` together, since each
driver's own test sees only itself. `npm run confine` there (`desktop/test/confine.mjs`) exports a document whose script reads files above the asset root through the app's own driver in a real Electron, once with no rule as the control and once with the app's, and reads both PDFs back with `pdftotext`.

```bash
npm run gate                        # all gates
node test/gates/run.mjs semantics   # gates whose name matches
node test/run.mjs                   # all specs
node test/run.mjs nav               # specs whose name matches
node test/run.mjs --jobs 1          # one spec at a time, as before
npm run reproducible                # same bytes under any flag set
npm run containers                  # every container × every line type, build against lint
npm run cli                         # the command line: refusals, help, folders, ports
```

## The gates: twenty-five contracts

`diagram-core.mjs`, `tails.mjs`, `cue-cards.mjs`, `souffleuse.mjs`, `pdf-core.mjs`,
`commands.mjs`, `strip-comments.mjs` and `lint.js` are all zero-dependency, which is what makes this suite runnable
with nothing installed. Twenty-five gates, about 1,800 assertions, about three
seconds.

| gate | the contract |
| --- | --- |
| `refusals` | build and lint agree on what is refused |
| `accepts` | every construct still parses |
| `semantics` | the emitted SVG *means* what the source says, plus what the source means to the editor that rewrites it – the span table. Also `DARK_TOKENS`, the documents' dark scheme, held token for token to `body[data-theme=dark]` |
| `corpus` | every `::: draw` block in the repository still compiles, and each file holds exactly the number it is said to |
| `cue-cards` | the note-to-cards grammar in `cue-cards.mjs`, rule by rule; that the module reaches `speaker.html` as `window.PSI_CARDS`; and which `---` buys a beat – `segmentsKept` spelled in build.js and lint.js alike, with fixture decks run through `lint.js` for `empty-beat` in both directions: the five things that ride a beat without painting on it, and the two shapes that buy nothing; and which beat a note is filed on – `noteSegments` lifted out of build.js as text, because the chunk-note fallback reads the last segment with WORDS in it and a trailing `---` used to take that answer away |
| `step-classes` | which classes a beat can carry, derived from `DG_STEP_FIXED` rather than restated |
| `inlined` | the two characters that mean something else inside build.js's own template literals |
| `tails` | the one `{…}` tail parser, the `::: draw` opener parser and the code-fence rule in `tails.mjs`: every code, the written-default rule, the formatter round trip, CommonMark's fence case by case, and no hand-written fence regex left in build.js or lint.js |
| `legacy-draw-syntax` | the old braced `::: draw` opener stays out of every `source.md`; every other survivor is on the reviewed allowlist `legacy-draw-syntax.txt` |
| `souffleuse` | the live prompter's pure half in `souffleuse.mjs`: the deck payload built off a hand-made `lecture`, the byte-stable system prefix, the tick message, the answer parser (a control character in a hint is refused), the drift arithmetic, every row of the restraint policy, and what a page cannot make it do: a megabyte segment cut to the window, a claimed minute of speech held to the wall clock (`clampSpan`); and the debrief's figures over an inline log (`debriefReport`, `debriefTranscript`, the log names and the default log) |
| `frontmatter` | `lint.js`'s `KNOWN_FRONTMATTER_KEYS` against every top-level key `build.js` actually reads |
| `xheight` | every text face in `BUNDLED_FONTS` carries the measured x-height that sizes inline code against the prose around it, and the roster agrees with `tools/font-playground/xheights.json` |
| `image-refs` | every way a `source.md` names a picture – the Markdown spellings (inline, angle brackets, the three reference forms, a path with a query) as well as the directive and frontmatter ones – and the collectors both readers of that set go through, with lint.js's mirror of the Markdown one held to the same list: what the inline cap refuses and what `--optimize-images` can fix have to be the same list |
| `canvas` | the measured numbers behind a figure's canvas: the per-chunk-type body em (`FIG_BODY_REM` against the `--body-fs` rules it mirrors), the default `--zoom`, the three height tiers (`FIG_CAP` and each tier's label count against the `--fig-cap` rules in the stylesheet, and the picture tier against what auto-fit leaves a bare figure), and the one spelling of a `frame` in two files that cannot import one another – plus the sentence shape the two canvas reports say an axis in, because the static complaint is emitted at the end of the parse and `--check-fit`'s room line is measured in a browser, so they cannot share a helper |
| `chains` | peers share one size: which placements make two boxes peers, which axis a row shares and which a column does not, the two ways out (`{.own}`, `same as`), `row` / `col`, `same w as` / `same h as`, and the two warnings for a written size that cannot hold its own words. Every assertion is paired with a control that differs in one token, because a default that arrives for the wrong reason looks exactly like one that arrives for the right one |
| `overlap` | the overlap census measures ink: a `text` is compared as the rectangles it inks, one per line, and not as its block of line boxes, which is `DG_LINE_H` tall where only `DG_INK_H` of it is glyphs and as wide as its *widest* line. The fixtures are transcriptions – the geometry `#ns-a41` shipped struck through, the redraw beside it, and the ragged pair in `#ns-a49` that must stay silent. That no *real* figure gains a warning is `corpus`'s ceiling, not this |
| `untrusted` | building a `source.md` somebody sent you, the half decidable without a build: the frontmatter language (`---js` is `eval` inside gray-matter) read the same way in `build.js` and `lint.js`, and gray-matter reached only through `safeMatter`; the asset root (the lecture's folder and the one above it, the lecture's folder alone when the one above is an injected home folder, never a dot-folder, a link only to a file of the kind its name says) on a real tree with real links, in both files; an output written over a link replaces it and an append refuses it; ImageMagick told its decoder. Since the review fixes the asset rule is imported from `local-files.mjs` and held against `lint.js`'s mirror as text, and three more halves are here: a lecture whose folder *is* the home folder or a disk's top reads only `assets/` and `fonts/`; `fileUrlAllowed`, the rule for what a page the engine opens from disk may load, on the same tree (a folder listing, a text file one level up and `/etc/hosts` refused, the view and a shared picture allowed); and `lint.js` printing a class token full of escape sequences as spaces. The build-level half – a real build refusing a real deck, and what is on disk afterwards – is the last block of `test/settings.mjs` |
| `pdf-core` | the PDF export's policy without a browser. A driver that only records its calls holds the order `exportSlides` asks for things in – the network refused before the page loads, auto-fit and the collapse before the walk, the print DOM before the pdf, on `screen` media – because that order is what the Playwright driver and the desktop app's Electron driver must share and neither driver's own test can see. And `exportDocument`'s shorter one – open before load, pictures decoded before they are inspected, a `::: pulse` answer opened before the pictures are settled, the pdf on `print` media at the view's own `@page` size – plus the watch build's reload socket, refused but counted apart from the deck's requests, and the caller's `allowFile` – required, handed to `open()`, a refused local file counted per file and reported. Plus the option checks, refusing in the words `pdfOptionsFrom` used before they moved, and `formatReport`'s lines for fixed results of both exports. That the pages come out right is `test/pdf-export.mjs` |
| `id-namespace` | every id the build invents starts with `psiINT-`: each `id="…"`, `.id =`, `dgeEl({id})`, literal `getElementById` and `#word` in a literal `querySelector` in build.js, editor.mjs, diagram-core.mjs, pdf-core.mjs, cue-cards.mjs and the runtime/ scripts that left build.js (`runtime/print.js`, `runtime/speaker.js`, `runtime/souffleuse.js`, `runtime/watch-banner.js`, `runtime/print-view.js`, `runtime/print-reader.js`, `runtime/print-highlights.js`, `runtime/diagram.js`) is a `psiINT-` literal or on a counted allow-list of the sites that emit the author's own ids or build one from a `psiINT-` prefix (the prefixes themselves are asserted). The stylesheets are read too: every `#id` in a selector of build.js's two CSS literals, `runtime/diagram.css`, `runtime/speaker.css`, `runtime/souffleuse.css`, `runtime/pulse-print.css`, `runtime/watch-banner.css`, `PDF_CSS` and editor.css must start with `psiINT-` and name an id one of those sites emits – a dead selector is how `#toc-panel li` sat in the heading rule matching nothing. Hex colours, `url(#…)`, strings, attribute tests and comments are blanked before the preludes are read. The author's half of the fence, `reserved-id`, is in `tails` and `test/settings.mjs` |
| `commands` | the command table in `commands.mjs`, the key map that dispatches from it and the `?` panel rendered from it. `PRESSES` is a fixture of every press the old `switch` in `AUDIENCE_JS` answered, per view and with the command it meant, taken once when the table replaced the switch – each is put through the page's own `commandFor(keyMap(view), e)`, so a key that drops out, changes command or starts answering where it did not fails. Every command a view answers has a run function in the literals that view is built from (the `COMMAND_RUN` object in `AUDIENCE_JS`, the assignments into it in `runtime/speaker.js` and `runtime/souffleuse.js`), and every run function names a command; the table's own load-time assertion is shown to fire on a copy that binds `B` twice. Then the panel half: `renderHelpOverlay` lifted out of build.js and run per view, each `<dt>` read as the key combinations its kbd elements spell, against the table's keys plus every key the listener's guards still answer in code, and the editor's keys out of `editor.mjs` held against the editor's own section; a command's row may spell only keys that command answers. `NOT_A_ROW` is the reviewed list of keys answered without a row, each with its reason, and an entry that stops being answered or gains a row fails too. It fails on its own on a panel with the `B` row cut out, so it cannot pass by reading nothing. Last, the palette and the start menu: only rows `runsFromPanel` allows carry `data-cmd` (every command but `?`, never a doc row), every runnable section stands before every reference section and holds only runnable rows, with the reference's line between the two runs, both panels list `Ctrl/Cmd-K`, the listener answers that chord before the field's keys and before the chord guard, and `renderStartMenu`, lifted out as text, renders `START_MENU` from the table into the audience view alone, leaving out an entry whose `opens` view the build reports absent. **A command may have no key** (`keys: []`, `pitchblack` the first): `NO_KEY_COMMANDS` is the reviewed list with a reason each, and a keyless command off it or a listed one that gains a key fails. Such a command is in neither key map, has a run function in every view that lists it, has a label and no `show` / `mouse` / `short`, and its row carries `data-cmd` in a runnable section with `NO_KEY` and no `kbd` in the key column; `runCommand` hands it an event that names no key. What “every command has a key” used to give for free is asked outright instead: every command that has keys spells at least one in its row, and the load-time assertion is shown to refuse a keyless command whose row shows a key, a start menu that names one, and `keys` that are not a list |
| `editor` | the editor's acts that rewrite a figure's source, without a browser: `editor.mjs` is loaded as text into a `vm` context with `diagram-core.mjs` as `window.PSI_DG` and a DOM that answers every lookup with nothing, a figure is opened by hand, and rename, delete, duplicate, copy and paste, a step's ops and a resize are driven against it. Each case is a defect the pre-2.0.0 review reproduced this way: a rename that moved a sibling chart's generated names or a step's name, an element called `w` that could not be renamed, a resize of `same w as` that was always refused, a paste in place that left the first element unplaced, a refused act reported as done, a delete that missed a chain, a `table` or `sequence` handled by its first line, a paste that wrote one name twice, and a reader's kept edit filed under no lecture. What is drawn – a guide, a chip – stays in the `editor-*` specs |
| `skills` | the Claude skills the site offers for download, built by `docs/site/skills.mjs` (zero-dep): every `SKILL.md` within the published limits – `name` matching its folder, `description` up to 1,024 characters with nothing read as an XML tag – and written so a strict YAML parser reads it, which a plain value with `: ` in it is not; a packaged skill carries the note on what a repository path means, the address of each tracked path it names and the bundled `figure-design.md`; and the ZIP has the skill's folder at its top level, reads back CRC-checked and comes out as the same bytes twice. The site build repeats the frontmatter check through gray-matter on the bytes it writes |
| `cli` | the command line's one flag table, `CLI_FLAGS` in build.js, read out of the file as text between its `cli-flags:` markers: well formed (no name twice, a known value kind, a `need` for every value read from the next word, a `why` for every flag refused without its partner, a mode that lists its company), every flag `main()` reads – `flags.has`, `values.get`, `argv.indexOf`, `pdfFlagValue`, the PDF export table, the `--*-only` and slide-option lists – has a row, because a flag without one is refused as unknown, every row is read, and CLAUDE.md's commands block names every flag that is not hidden, plus `-h`. The `--help` text is generated from the rows; that it lists them is `test/cli.mjs` |
| `zoom-scope` | every CSS rule that reads `var(--zoom)` – in build.js's CSS literals and `runtime/diagram.css` – sits on a slide: its selector names `.chunk` / `.chunk-…`, or its subject is on `IN_CHUNK`, the reviewed list of classes the renderers only emit inside a chunk article. The auto-fit walk writes its trial zooms on the chunk it measures rather than on `<html>` (a change there restyles every slide, 90 ms a step on `lectures/diagrams`), which is exact only while nothing outside the chunk reads the property. The same holds for `showZoom`, which puts a new zoom inline on the slides that can be on screen and on `<html>` only at the catch-up: a reader outside a chunk would lag behind the slide. That the live slide shows the zoom at once, and that after the catch-up no chunk keeps a zoom of its own, is `test/auto-fit.mjs` |
| `strip` | the comments `strip-comments.mjs` takes out of what a view is handed, and nothing else. Hand-written cases for each place a regex strip goes wrong – `//` and `/*` in a string, a template literal with `${…}` nested in `${…}`, a regex holding `/*`, division against regex after `)`, `if (…)`, `]`, `a++` and a keyword, a comment that is the only thing between two tokens, a comment spanning lines (automatic semicolon insertion), the load-bearing `/*!`, `@license` and `//# sourceURL=` – plus snippets evaluated before and after. Then the modules spliced in as text: each stripped one compiles, a second strip changes nothing, and every exported value that is not a function (the vocabulary tables, the command table, regexes by source) is equal before and after – a check on strings and regexes that does not go through the tokenizer. Last, build.js read as text: every runtime and stylesheet literal reaches a view only through `shipJs` / `shipCss`, and so does every file in `runtime/` that a literal moved into (`PLAN-runtime-extraction.md`; the prompter's through the local `renderSpeaker` sets to its text under `--prompter` and to an empty string otherwise), whose strip is held like editor.css's – idempotent, and for a stylesheet no comment left, for a script compiling as a script before and after. The failed-build banner's two files are the exception they always were: they reach a page raw, only through `reloadScript` and never through `ship*`. For a file whose literal had substitutions, the step before the strip: `fillRuntime`, lifted out of build.js as text, fills both placeholder forms with `String()` of each value and refuses a placeholder without a value, a value without a placeholder, a value that is not a string or a finite number, and any `__PSI_` that is not a placeholder; and per file, without a build, a file holding a placeholder is read through `fillRuntime` with a table whose keys are exactly its placeholder names, and a file without one is read as it is. During development the strip was held against acorn's tokenizer and Chromium's CSSOM over eight decks; neither is a dependency |

**`frontmatter` is the one gate that is not about figures**, and it is here
because the shape is the one this suite exists for: a closed list in one file
that has to agree with another file, where the disagreement is silent. The
failure it guards is a *false warning on a valid deck* – a key the build reads
and validates, reported as unknown, exit 2 under `--strict`. It happened: one
branch added two top-level keys while another added the warning, the two edits
never touched as text, git merged both cleanly, and only building a deck that
used both found it.

Its scan is the interesting part. `build.js` reads a frontmatter key three
structurally different ways, and one of them – `viewDefaults()`'s loop over
`VIEW_DEFAULT_SPEC` – is a *computed* read, so no grep at the read site can
ever see those seven names. A fourth path is not a read at all: the cover
spreads the whole block into `renderTitleBlock`'s destructured parameter list,
which is the only place `subtitle` is named. The obvious grep finds 23 of the
31. The gate asserts the size of what it found before comparing anything,
because a scan that silently finds nothing passes every comparison and guards
nothing – and it earned that on its first run, reporting `bodyHtml` as a
frontmatter key because the call site writes that argument in shorthand.

**`image-refs` is the second gate that is not about figures**, and the same
shape again: two readers in `build.js` over one set. `scanReferencedImages`
decides what the per-image inline cap refuses; `collectImageRefs` decides what
`--optimize-images` can convert. They were two regex sets in one file and only
one of them knew `::: backdrop`, `cover-image:` and `closing-image:`, so a
keynote whose only oversized assets were a backdrop and a cover photograph was
refused by the build with a message recommending `--optimize-images`, and that
verb answered "Nothing to do" about the very files the build had just refused.
The gate asserts the collector's output, the rewrite that follows a conversion
in all four spellings of a path, and – the one that drifts – that both readers
go through the collector rather than matching a form themselves.

**`inlined` is about two characters and twelve literals.** A raw backtick ends
the literal; a single-backslash regex escape is eaten by the literal and
therefore ships. It checks **all twelve** literals – a number worth checking
against the gate's own note when you add one. It recognised seven until the five
holding inlined markup, the likeliest place of all to write a backtick beside a
button, turned out to open with a tag on the same line and be skipped.

**Why `semantics` exists**: a green `accepts` once hid a sequence `<->` that
parsed and drew one arrowhead. Parsing is not meaning.

**Why `souffleuse` is a gate and not a browser spec.** The prompter's one
requirement is restraint, and restraint is the half of the feature that no
rehearsal can show you: a talk where nothing came is indistinguishable from a
talk where nothing was due. So the policy lives in code rather than in the
prompt, and every row of its table – twelve words, one hint at a time, the
cool-downs, the duplicate rule, the opening silence – is decided here, with no
key, no socket and no microphone. What the model judges is the model's; what
the code permits is checkable, and this is where it is checked.

**Why the gates lint as well as build**: a check that reaches the compiler
through a browser page reaches only the build. Two `lint.js` gaps sat behind
assertions in `figure-labels.mjs` until they were moved here, where every
fixture is compiled *and* linted.

## The browser suite: four families

**Navigation** – `nav`, `nav-cockpit`, `nav-goto`, `nav-fullscreen`, `help-search`, `palette`, `transition`, `pitchblack`,
`cue-cards`, `cockpit-notes`, `cockpit-alone`, `watch-resume`, `clock`, `autoplay`, `live-sync`. The navigation
model, and what a slide change looks like under `transition: pan | cut | fade` –
the one spec here that samples per animation frame rather than after a settle,
because its whole subject is what happens between two states.
`nav-goto` is the `G` prompt: that the number it accepts is the one the corner
badge paints, that it holds the keyboard while it is open (`Space` would
advance, `N` would annotate), and that `Enter` goes through `jumpTo` rather
than assigning an index. `help-search` is the field at the head of the `?`
panel, in both views: it has the keyboard when the panel opens, so `b` typed
there types a b rather than blanking the projection, and `Esc` empties it
before it closes the panel. `palette` is the same panel run as a command
palette and the projection's start menu: `Cmd-K` and `Ctrl-K` open it focused,
a word and `Enter` run the row (`blank` blanks), a doc row is never selected,
`Esc` still unwinds the panel before the overview, the panel's box is
measured unchanged across the typing, `overview` ranks `O` first and
`Shift-C F A L` comes apart into four runnable lines; the start menu stands on slide 1 of a
fresh load and goes on the first beat, on `W`, on its chevron (and stays gone
across a reload), on a press in the cockpit it opened, answers a tap, and is
in no other view and not in frame 1 of `--frames`; a filter lays the panel's
hits out as one column across the box and the empty field does too (one left
edge for the keys, one for the words); `↓` walks every runnable row in order,
each the nearest one below the last and scrolled into view, with no reference
row between two of them, unfiltered and filtered, and stops at the last;
`PageUp` / `PageDown` move by a panel; the title, the section headings and the
start menu are tracked at most 0.1em; and the folded menu leaves a `›`
beside the `?` circle – mid-talk too, hidden on a blanked projection, a
fingertip wide on a touchscreen – that opens it again and clears the stored
choice, so a reload on slide 1 shows the menu; built with `--audience-only`
into an empty folder it offers *Fullscreen* alone, and `S`, `P` and the
palette row show a notice and open no window – and so does a full build
whose `print.html` is deleted afterwards, opened from `file://`, where the
page's own probe finds the file missing and `S` still opens the cockpit. `nav-cockpit` carries its own two lines of it, because
the cockpit is where the prompt's id could collide with a slide's. `demo` sits
beside them: the two windows handing a live demo across, over both transports.
`nav-fullscreen` is `W`, and it is here for a reason no other navigation spec
has: the feature's shape is dictated by a **browser policy**, and only a
browser can say what the policy is. It asserts that a `requestFullscreen`
arriving by `postMessage` is refused – which is why the cockpit's `W` can only
arm the projection – that one click on the projection spends the arming and is
not also a click on the figure it landed on, and that leaving needs no gesture
at all. Two things it deliberately does not assert, both said out loud in its
header: `Escape` (the browser's own way out, above the page, and headless has
no chrome to implement it) and the re-measure (Playwright pins the viewport, so
entering fullscreen changes no size here). And **`page.evaluate` cannot be used
to probe the policy** – Playwright evaluates with the user-activation flag set,
so a bare `requestFullscreen` there is granted and measures nothing.

**The geometry the live chrome leaves the slide** – `expansion`, `marginalia`,
`annotation` (the note typed with `N` fills the frame, sized from its text, with
a QR code for an address, and in the cockpit fills the stage rather than the
window), `touch-rail`, `math-focus`, `block-align`, `auto-fit`, `camera-fit`,
`side-anchor`, `cards`, `dock`, `bleed`, `beats-nested`, `beats-footnote`,
`squint`, `text-select` (what a pointer gesture means while Alt is held).

**The editor** – the `editor-*` specs: its gestures, its panel, and the
neighbour-alignment guides, which are what a gesture snaps to.

**The documents** are the one view outside those four, and two specs read
them. `document` builds a `kind: document` and measures what only its laid-out
page can show: at 1440 and at 1024 px every `::: marginalia` – several in one
chunk, one with a picture, a long one with another right after it – is floated
right of the text column and inside the window, level with the paragraph
written after it or right under the note that pushed it, with no two
overlapping and the picture the note's width at its head; at 390 px every one
falls back to the aside inside the column, its picture capped; a
`::: footnote` stands in the margin level with the block it was written after
and ends before the next part, and at 390 px is the labelled block under its
chunk again; a reader's note
card whose highlight stands level with a margin note steps out of its way;
and the section numbers the build writes (1, 1.1) are the ones in the
headings and the sidebar, where a lecture under `slide-numbers: off` shows
none. Then the dark screen: a dark system gets a dark page with a legible
margin note and a picture on a light panel; the sidebar's *Light* and *Sans*
change the page and the face and are stored, a reload keeps them, printing
gives the light page in the authored face whatever was chosen, *Auto* forgets
the scheme, and a browser whose `localStorage` throws still switches. What the build writes for a document – the one view, the numbers in the
markup, the refusals, the linter's silence – is `test/settings.mjs`. The
other is `reader`, the contents sidebar `print.html` and `print-notes.html` carry
under `reader: on` – that its entries are the slides with the numbers the page
prints, that the scroll-spy marks the slide whose top crossed 30% of the
window, that its parts fold to their headings with the part being read open
and a chevron for the rest, that it folds to a button below the wide layout and
opens over the page, that the notes column it keeps free fits at each width, and that none of
it reaches paper, a page without scripts, or a deck that says `reader: off`.
Its second half is the reader's highlights, on a second fixture deck: that a
selection is marked with the button and its note stored, that an overlapping
one merges and one in a figure, formula or speaker note is refused, that a reload and the other document paint the same highlights at
the same offsets, that remove undoes and an emptied field deletes the note, that a rebuild moves a
highlight with its words and lists one whose words are gone, where the card
stands at 1440, 1100 and 390, and that a browser refusing storage still
highlights for the session. Then the way through them: that the pill and the
per-slide counts come with the first highlight and go with the last, that
`n` and `p` walk them in page order and stop at the ends, that the *with
note* filter narrows both the count and the walk, and that the keys are
ignored in a note field, with a modifier held, and under the lightbox.
Then paper, under print emulation: that the highlights stay yellow with
`print-color-adjust: exact`, that each one with a note carries a number, 1 to
n in page order, after its words and on its note, that the notes stand right
of the column and inside the 16cm page area, level with a highlight whose
line they share and never on each other, that no card, pill, button, toast or
sidebar prints, and that the page goes through `page.pdf()`. Where a note
lands in a list item, a table, a blockquote, a heading and a lede, and what a
page break does to a long one, was checked on rendered PDF pages rather than
asserted. Last, export and import, on a store of their own: the download's name and
its Markdown (title, counts, slide headings with the printed number, quote
and note, one data comment per entry that is the stored entry exactly), that
export, delete all and import give back the same store, the merge rules (an
older copy ignored, a newer one winning, an unknown `type` kept and listed),
an import into a rebuilt document where one quote moved and one vanished,
input that is not an export, the undo of delete all, the German file name,
the ? that opens the lines on the tools and on storage and the three ways it
closes, and the menu inside the opened sidebar at 390. Then a finger, on the
figure deck at 390 px with a touch viewport: every control – contents button,
sidebar entries and chevrons, menu, pill, highlight button, corner buttons,
lightbox bar, a card's field and action – is hit at all four corners of a
44 px square round its centre, and the key hints are absent there and present
with a mouse. And the figures, on a third
deck with a diagram, a picture, a code block and a formula: that the corner
button shows on hover,
frames the figure and opens its card without opening the lightbox, and does
not make a second frame; that marking in the lightbox sets a dot at
fractions of the picture while a drag still pans, with the card over the
overlay being the one card the entry has; that on the diagram the part under
the pointer is outlined and the pin keeps the part's name without its
`dg<N>` prefix; that a dot opens its card in the document and in the
lightbox; that `n` walks figure highlights in page order and nothing is
numbered on screen; that a selection in a code block is highlighted in the
block's own text, token by token in monospace, without moving a prose
highlight's offsets, and opens its card rather than the lightbox, whose clone
shows the marks; that the corner buttons of a code block and a formula frame
them whole; the export's figure and code lines, delete all and import; the
frames, the dots' and the whole figure's note numbers and the notes on paper;
and a rebuild with a figure added above and a line added to the code, where a
pin follows its part, one whose part was renamed stays at its spot and is
called approximate, and the code highlight follows its words.

**The figures** – the `figure-*` specs, which measure the SVG.
`figure-framing` catches a drawing sitting off-centre in an oversized frame;
`figure-labels` measures where an aligned label lands inside the thing that
holds it; `figure-sequence` asserts that nothing in a `sequence` overlaps
anything else in it and that its generated names are the documented ones;
`figure-type` walks the whole lecture and asserts, per slide, that every
drawing's base label is the size of the body type beside it. That is what
breaks when a container measured in ems caps a figure: shrinking the type
shrinks the cap with it, `fitZoomToChunk` chases a gap that cannot close, and
the slide lands at the auto-fit floor with its figure still behind the words.
The zoom each slide settled at rides along as a note, because sitting at the
floor is not itself the defect. `figure-dotted` reads the *computed* stroke of
a `.dotted .muted` line and its controls, because the floor that makes its dots
reach their colour is a stylesheet rule and the SVG bytes do not move.

### Why the geometry family exists

Three specs say it, each recording a bug that shipped:

- **`expansion`** – the camera framed an open expansion by centring the pane and
  cropping the slide it belongs to.
- **`touch-rail`** – the cockpit rail sat on 82% of the notes pane.
- **`marginalia`** – the aside overflows the chunk on purpose, the width probe
  counted that overhang as a slide being cut off, and the type on every
  marginalia chunk was walked down to the 0.6 floor. That reads as a design
  decision until you put the slide next to its neighbour, so the spec compares
  against another chunk of the same deck rather than against a number.

All three survived review because a screenshot of the thing you were looking at
is fine. **They assert the property and never a coordinate.**

`touch-rail` opens its own browser context: the rail lives behind
`@media (pointer: coarse)` and `openDeck`'s has a fine pointer, so in the default
context the bar is not in the document and a measurement of it reports no
overlaps among no buttons.

### The twenty-six specs that build a deck of their own

Four different reasons, and the last is the one to remember.

**Because the property is about the time of day** – `clock` builds one deck
with `start: 14:20` and one without and opens the cockpit under Playwright's
clock at a moment each case names (14:25, 14:10, a quarter past midnight):
nothing sets the clock by itself, `Z` is the time since the planned start
and holds at 0:00 before it, `<` and `>` are a minute and never go below
zero, and the drift beside the clock follows at once. The reload case runs
in a context of its own on the real clock, because the fake one is the
context's and carries no navigation entry to say what a reload is.

**Because the property is about two windows** – `cue-cards` opens the cockpit
from the projection with `S` on a fixture and, after every Space and
Backspace, reads `revealed` and `activeIdx` in both: the cursor in front of
the counter exists so that the room never learns the cards do. The same
fixture carries the parser's note-position rule, read off the built page,
and lint.js's mirror of it, because both need `parseLecture` and the gates
cannot load it – and one chunk written the way a question slide is, heading,
`---`, the answer, because whether the empty opening segment is a beat is a
question only `countSegments` in a page can answer. `live-sync` is the rest of
the pair's contract, on two decks of its own (one fades): a frozen cockpit
neither moved by the projection's snapshots and pans nor sending it a laser
pointer, a projection reloaded under a freeze booting onto the room's slide,
a second `S` focusing the open cockpit rather than reloading it, autoplay
starting when the cockpit drives onto the figure, a figure step inside an
overlay held to `from 2` waiting for the card, a figure focused from the
cockpit surviving a knob there, leaving the overview through the landing
path, and two presses inside one fade acting on the slide being arrived at.
`cockpit-notes` is the presenter remote against the cockpit's notes field, on
a fixture with a long note and a short one: a click into the field does not
focus it, and with the field focused anyway `B`, `.`, `PageDown` and `PageUp`
reach the projection and nothing is stored; a double-click and `Shift`-`N`
still open an edit, `PageDown` mid-edit leaves it and turns the page, `Esc`
leaves it and does nothing else; and the long note fades at its foot, scrolls
with the wheel unfocused, and stands in full once scrolled to the end.
`cockpit-alone` is the pair the other way round, from `file://` on a fixture of
four slides: `speaker.html` opened on its own says `○ no projection` and not
“live”, and its `B` and `W` say there is no projection rather than claiming
one; its `S` opens `audience.html` attached to it, on its slide; a reload of
that projection is answered within a second; a closed one turns the light back,
and `S` opens it again into the same cockpit with its clock unreset; and a
projection opened by hand beside it names the running cockpit instead of
opening a second one, until `S` is pressed again. `watch-resume` is the pair
under `--watch`, with an engine of its own on a fixture whose source it
rewrites: a chunk added above the one on screen reloads the projection onto
the same chunk and beat; a source the build refuses puts the banner up with
the message's first line as text (its quoted `<img onerror>` stays text), a
document opened meanwhile says only that it failed, and the fix's reload takes
it away; with the cockpit opened by `S`, a save lands both windows on one
chunk and beat, a failure shows in the cockpit and not on the projection, a
frozen cockpit comes back frozen on its look-ahead while the room stays put,
and a deleted chunk lands both on one slide. Last, the engine is stopped and
started again under the two open windows: both reload themselves onto the
new run, once each, on the slide they were on.

**Because nothing that ships can reach the case** – `palette` (the start menu
lives on the first slide and its first beat of a page load, so the spec needs
a first slide with a second beat, and it runs `--frames` on the deck, which no
spec may do to a tracked lecture), `math-focus` (no lecture has
a two-row display formula), `side-anchor` (nothing writes `::: side {.middle}`
yet) and `beats-nested` (no lecture puts a `---` inside a pane, a card row or an
overlay yet, and the assertion is a six-beat *sequence* mixing nested and
top-level markers, which only a deck written for it has) and `dock` (no lecture
writes a `::: dock`, and the claims are geometry: the column and the text share
no pixel, the dock reaches the frame, `from N` moves nothing, auto-fit holds
beside a slide-high column) and `beats-footnote` (no lecture writes a
`::: footnote` after a `---`, and the case that decides the rule is a chunk
whose first segment holds a stepped figure: the footnote rides the *segment*,
which a rule written against beat numbers gets wrong only there) and
`auto-fit` (a slide deliberately taller than any frame beside one deliberately
shorter, which is not a lecture) and `bleed` (a `.bleed` chunk's figure is the
slide frame, and the claims are sizes at the reference viewport: the svg is
1600 × 900 with no margin or gap added to it, auto-fit leaves the zoom at 1.35
although the chunk is one frame tall, a base label is the body em, the same
drawing at `.full` has labels of the same size, an overlay held to a beat
stands in the gutter, the cockpit lays the next step's name over the figure,
and the document still hugs the drawing – which needs one figure drawn exactly
to its canvas, one well inside it and one with a caption riding it, and a
lecture that had all three would stop having them at the next edited label)
and `document` (no lecture is a `kind: document`, and a syllabus's shape - five
margin notes in one part, one a picture, two written back to back - is the
fixture's whole point).

`pitchblack` is here too (a card row, a figure with a `.tone-2` box and a
frontmatter that pins nothing, then one that pins `theme` and `pitchblack`:
the colours are read off elements the spec has to be able to name). It walks
all seven themes with `A`, switch off and on, and reads what the page paints
through a canvas: the slide's ground is `rgb(0, 0, 0)` under each dark theme
and unchanged under each light one, a `.tone-2` box is the colour it was and
so stands further off the ground, a panel card is 20% of the ink. The command
is run the way a lecturer runs it – `Cmd-K`, `pitch`, `Enter` – in both
windows, each following the other; a reload keeps it, and a pinned deck
returns to the author's word.

**Because the thing is only legible as a pair** – `block-align` shows the same
content centred and left, `cards` two cards differing in one character,
`transition` builds the same five slides three times, differing in one
frontmatter line, because the claim about each mode is a claim about what the
other two do not do, `reader` builds one deck twice, with and without
`reader: off`, because what the key takes away is only visible beside what it
leaves, `help-search` builds a two-slide deck twice, with and without `lang: de`,
because no lecture here is German and the placeholder is the one word of the
panel that follows the language, and a second and a third one twice with different words, because
re-anchoring is only visible across a rebuild, and `figure-dotted` draws a muted dotted line beside the
five strokes it must leave alone.

**Because the property spans three processes** – `souffleuse` is the only spec
that starts an engine of its own: `node build.js … --watch --serve
--prompter --events`, with a fake OpenRouter on loopback that the sidecar
reaches through `OPENROUTER_BASE_URL` and a fake `webkitSpeechRecognition`
installed into the page. The gate decides the prompter's restraint without a
network; what only a running system can say is whether the three halves are
wired to each other – an ear in the browser, a key in Node, one socket
between them – and whether the projection stays ignorant of all of it. Its
deck is its own because a cue is laid into a slide *still to come*, so the
slide order has to be known, and because the request body is asserted against
the deck's own chunk ids. **It moves the clock rather than waiting it out**:
the opening silence is 60 s and the cadence 25 (10 here, the floor of
`SOUFFLEUSE_SPEC`), so `window.__stt.final(text, 70)` pushes the cockpit's
`tStart` back seventy seconds and the same arithmetic runs at once. Without
that the spec would be two minutes of sleeping; with it the whole thing is
about eight seconds, most of which is the build. Moving the clock is also
what a hostile page would do, and the sidecar holds a segment's claimed
length to the wall clock (`clampSpan`); the spec's engine runs with
`PSI_PROMPTER_FREE_CLOCK=1`, the one switch that turns that off, read from
the environment only. It also asks the running engine what a page off another
site gets – a refused handshake, a 403 for a foreign `Host`, a 404 for
`source.md` and the transcript – that a cockpit from `file://` still
connects and both documents still reload with no nonce, and starts a second
engine under `--prompter-dry-run` with no key to read its toast.
`live-trust` is the other half of that security work, the part that runs in
the two live views: a sandboxed frame posting to a projection opened from
disk (whose origin is `null` like the frame's) is neither adopted as the
peer nor obeyed, a hostile figure handed to `dgSwapFigure` runs nothing, the
real cockpit still reconnects through both windows' reloads, and a `--watch`
build carries the nonce only in a view that ships a writer. Its decks are its
own because no lecture is `editor: speaker`, and the nonce half needs three
`--watch` builds of one deck differing in that line.

**Because a spec that hunted its shapes in a real deck would break the next time
that deck was edited** – `squint`, whose four shapes (a promoted bold, a reveal
segment, a `::: slide` block, a chunk that is only a backdrop and an overlay)
exist in the corpus but never six chunks apart; `camera-fit`, whose chunks are
graded in length so some fit the frame and some do not, which no lecture keeps
at a stable size; `autoplay`, which needs an autoplaying figure standing
*after* another slide, reached by a key press; and `editor-guides`, below.
`squint` also drives no page itself: the command drives its own browser and the
spec asserts on the file that comes out.

**That last reason is the pattern to reach for when a spec needs a shape the
lectures do not have**, and `editor-guides` is the worked example.

`#look` in `lectures/diagrams` was one catalogue figure six rows tall, and four
specs measured it: `figure-prominence`, `editor-aim`, `editor-guides` and
`editor-drag-guides`. When each row moved to the slide that explains it - a room
cannot hold "the bottom row of the catalogue" - three of the four only needed
repointing at the new chunk. `editor-guides` did not, because two of its
sections need *a shape* rather than a chunk: three elements collinear on a bare
`at`, so a drag along that axis has a `between a,b` to propose and a nudge
across it has a `.cx` to snap back to. `#look` had that shape by accident, being
tall; nothing was ever going to keep it. So the spec builds it.

**The trap inside that fixture is worth knowing before you write another one.**
`dgeGuidePairs` in `editor.mjs` only pairs elements that are *already related* -
the two ends of an edge, the outer members of an `align` or `spread`, or a node
and the element its relative placement names. Boxes on bare `at` coordinates
produce no pairs at all, and therefore no `between` candidate, however neatly
they line up. The fixture's `b` is written `below a` for that reason alone. Two
browser runs were spent guessing at this before anyone read the function.

## The corpus decks

`test/corpus/` holds three decks that no spec drives: `demo-tracking` (German),
`demo-responsibility` and `demo-deco`. They are the decks the pre-2.0.0 stress
test was written against – real content that combines the whole vocabulary,
and in `demo-deco`'s case a coverage probe for the decoration constructs no
other lecture uses. `pages.yml` builds all three on every push, as it builds
`lectures/network-security`, so a line the build refuses and the linter passes
fails there rather than merging green. They are not published and their views
are not tracked. They live here rather than in `lectures/` because that folder
holds the canonical examples of what the tool supports, and these are tests.

## The large deck

`test/large-deck.mjs` builds a deck no lecture comes near: 2,400 chunks in
twelve parts, eight chunk shapes in turn, so every part carries reveal
segments, notes, a code block, formulas, a stepped figure, a figure in a
`::: side` pane, a card row, columns, an expansion and a footnote. It asserts
the build writes four views, every chunk id stands in `audience.html` and
`print.html`, every figure is drawn, and `lint.js` finds no error. It also
times three sizes (8, 600 and 2,400 chunks, the faster of two builds each)
and requires the cost above the eight-chunk deck to grow less than tenfold
for four times the chunks: linear is about x4, a quadratic pass x16. The
fixed start-up is subtracted because it is most of a build at these sizes
(0.27 s of 0.48 s for 600 chunks when it was written), and a ratio of totals
would hide a quadratic pass behind it. `PSI_LARGE_CHUNKS=<n>` runs it at
another size. It covers the build and the linter only; what a large deck
costs in the browser – the camera, auto-fit, the cockpit's strip – is not
measured here.

## Running it

The runner builds and serves the lectures itself, so it never reports on stale
HTML (`$PSI_CHROME`, else the Playwright cache, else system Chrome, is the
browser).

**Specs run side by side, `--jobs N` at a time**, by default half the cores and
at most six. Each one runs in a child process of its own with its own Chromium,
because half of them build a fixture deck with `spawnSync`, which would stall
every other spec sharing an event loop, and because `tmp.mjs` cleans up when
the process exits. A spec's output is held until it finishes and then printed
whole, with its time, so two specs never interleave; the tally at the end
lists failures in `SPECS` order whichever order they finished in. The batch
starts the longest specs first (`SLOW_FIRST` in `run.mjs`, measured; a stale
list costs wall time, never a result). `--jobs 1` is the old runner exactly:
one process, one Chromium, specs in order, output as it happens – and what a
filter that leaves one spec gets anyway.

**Nine specs export `serial = true`** and run afterwards, alone, in the
runner's own process: `souffleuse`, `live-trust` and `watch-resume` (engines
of their own with sockets), `demo` (a capture handed over WebRTC on loopback, waited for with
sleeps), `nav-fullscreen` (a browser policy about user activation), `clock`
(its reload case is on the real clock), `transition` (it samples per animation
frame), `autoplay` (it waits out a real timer) and `live-sync` (two presses
inside one 260 ms fade). The rule for a new spec: if what it asserts depends
on how quickly the machine answers, or it starts a process that listens, mark
it serial. A spec that passes alone and fails beside others is the other
signal – fix the wait if it is a sleep racing a state change, else mark it.

Measured on the twelve-core machine the suite is maintained on: 843 s one at a
time with the old fixed sleeps, 682 s one at a time with `settle` (below), and
238 s with six at a time (three runs, 1,987 passed and 0 failed each). About
140 s of those 238 is the eight serial specs, so that is where the next minute
is. Of the rest of `npm test`, `settings.mjs` is the long stage at about two
minutes with no browser.

**Waiting.** `settle(page, cap)` in `harness.mjs` replaced the fixed sleeps of
`press`, `walkTo`, `openDeck`, `restart` and the editor helpers: it returns
when every page of the spec's context holds still – no finite animation
running, the live chunk, `revealed`, the stage's transform, a pending fade and
each stepped figure's geometry the same on two frames, and at least 50 ms
gone – and never later than the sleep it replaced. Use it in a new spec
instead of `waitForTimeout` wherever the wait is for the page to finish
reacting; keep a sleep only where the time itself is the subject (an autoplay
tick, a timer running out). `walkTo` asks for less between presses (the press
taken, no fade still holding the change) and gives the camera its old 90 ms
once the target is up.

What would make `settle` exact rather than inferred is a signal from the
runtime: a `window.psiIdle()` promise that `AUDIENCE_JS` resolves once the
camera transition, a fade, a figure tween and the deferred `focusCamera`
calls (the 20–30 ms timeouts after an expansion and an annotation) have all
finished. `settle` reads all of those from outside, through globals and
`document.getAnimations()`, and needs its 50 ms floor only because the
deferred calls are invisible from there.

Run it after touching `AUDIENCE_JS`, the key map (`commands.mjs`, `COMMAND_RUN`), `editor.mjs`,
`createSpanTable`, or anything that moves a label or an extent.

**`no page errors` is asserted by the runner after every spec**, not by each
spec: it is an invariant of running one at all, and the one spec that forgot the
line swallowed console errors for as long as it existed.

## Measuring coverage

`npm run test:coverage` runs the half of `npm test` that needs no browser –
the gates, `settings`, `containers`, `cli`, `large-deck`, `present` and
`reproducible` –
under [c8](https://github.com/bcoe/c8) and prints a table per file, with
`coverage/lcov.info` and an HTML report in `coverage/lcov-report/`
(gitignored, about 10 MB). c8's raw V8 data – one file per process, over a
gigabyte for one run, because the suites spawn `build.js` some fifteen
hundred times – is deleted when the report is written, pass or fail. It is a
measurement, not a gate: no threshold fails a run. c8 reads V8's own coverage through `NODE_V8_COVERAGE`,
which a child process inherits, so the `build.js` runs that `cli.mjs` and
`reproducible.mjs` spawn are counted too. The browser suite and
`pdf-export.mjs` are left out, which is why `chrome-path.mjs` and
`pdf-export.mjs` read 0 %; `editor.mjs` runs only in a page and is not listed.

**Read `build.js`'s line figure with care.** V8 counts a template literal as
one expression, so the moment `const AUDIENCE_CSS = …` is evaluated every line
of that stylesheet counts as covered. About 20,900 of the file's 37,000 lines
are inside its two dozen multi-line literal constants – the inlined runtime
and stylesheets – and read 100 %; the Node-side logic outside them read
81.4 % when this was written, against 91.9 % for the file as a whole.
`tools/coverage-logic.mjs` computes that split from `coverage/lcov.info`, and
`test:coverage` prints its line last; that is the figure to watch, and the
one that should not fall when the literals move into files of their own. The
function and branch columns are not inflated this way.
