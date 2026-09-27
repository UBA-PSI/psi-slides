# The builder's interface: what it looks like and why

This is the design brief the interface was built against, kept so that a
later change can be checked against the reasoning rather than against a
screenshot. The words the interface uses are in `renderer/strings.js`; this
file is about everything around them.

## What the app is for, in one sentence

A lecturer who writes in a text editor opens this window once, leaves it
open beside the editor, and reads one line in it: whether the last save
built. The four views are one click away. That is the whole job, and the
interface must not look as if it does more.

## Who reads it

People who teach and who would rather not open a terminal. They know what a
file and a folder are. They do not know what a watch process is, and the
interface never says so; it says "build again whenever source.md is saved".

## Tokens

The app belongs to the psi-slides family, so it takes the project site's
palette and type rather than inventing its own. The values are those of
`docs/site/site.css`, which were measured for contrast (lowest pair 5.1:1).

| token | light | dark | role |
| --- | --- | --- | --- |
| `--paper` | `oklch(0.98 0 0)` | `oklch(0.18 0.01 260)` | window ground |
| `--ink` | `oklch(0.20 0.01 260)` | `oklch(0.94 0.01 260)` | text |
| `--ink-soft` | `oklch(0.43 0.01 260)` | `oklch(0.74 0.01 260)` | paths, hints, secondary text |
| `--accent` | `oklch(0.42 0.13 25)` | `oklch(0.78 0.12 25)` | the primary button, focus rings, the drop outline |
| `--rule` | `oklch(0.85 0.01 260)` | `oklch(0.36 0.01 260)` | hairlines, the output grid |
| `--code-bg` | `oklch(0.945 0.005 260)` | `oklch(0.23 0.01 260)` | the log, error messages |
| `--ok` | `oklch(0.55 0.15 150)` | `oklch(0.75 0.15 150)` | the status dot when ready |
| `--busy` | `oklch(0.70 0.15 80)` | `oklch(0.80 0.15 80)` | the status dot while building |
| `--bad` | `oklch(0.50 0.19 25)` | `oklch(0.75 0.15 25)` | the status dot after a failure |

Dark mode follows the system (`prefers-color-scheme`), nothing else.

Type: IBM Plex Sans (variable, the two woff2 files from `docs/site/fonts/`,
copied at build time) for everything that is a sentence; JetBrains Mono for
everything that is a file name, a path, a URL or a log line. That split is
the only typographic device: a reader can tell at a glance what is a word of
the interface and what is a name on their disk. No small caps, no tracked
labels, no italic accents.

Sizes, on a 14 px base: the project title 22 px medium; the status sentence
17 px; buttons and body 14 px; hints and paths 13 px; the log 12.5 px mono.
Line height 1.45 for prose, 1.3 for buttons.

## Layout

Two screens in one window, 760 × 780 to start, resizable, minimum
600 × 480. The ready state, the error state and the German text all fit in
that height without scrolling; that is what set it, and the smoke test
measures it in both languages rather than leaving it to an eye. It was 680
until the lecture's figures went on the project screen. Everything is left-aligned on a 32 px margin; the content column
is capped at 640 px so long paths and hints keep a readable measure.

### Start screen

```
┌──────────────────────────────────────────────────────┐
│                                        DE  EN   ⚙    │  thin bar, right-aligned controls
│                                                      │
│  Open a lecture                                      │  22 px
│  Choose the source.md of a lecture, or drop it       │  ink-soft
│  onto this window.                                   │
│                                                      │
│  [ Open source.md… ]   [ New lecture… ]              │  primary + secondary
│                                                      │
│  Recently opened                                     │  14 px medium
│  ───────────────────────────────────────────────     │  hairline
│  netsec-04       ~/Lectures/netsec-04/source.md      │  name (sans) + path (mono, soft)
│                                             yesterday│  time, right, soft
│  tutorial        ~/psi-slides/lectures/tutorial/…    │
│  old-talk        ~/Desktop/old-talk/source.md   ×    │  missing: soft, "not found", remove
│                                                      │
│                                                      │
│  Everything stays on this computer. Nothing is       │  footer, soft, 13 px
│  uploaded.                                           │
└──────────────────────────────────────────────────────┘
```

The whole window is the drop target. On dragover the window gets a 3 px
inset outline in `--accent` and the lead line changes to "Drop to open".
Nothing else moves.

Recent entries are rows, not cards. The name is the folder name; the path is
middle-truncated with CSS (`direction: rtl` on an inline-block is the
usual trick, but it mangles mixed text – truncate in JS instead, keeping the
last two path segments). A missing file keeps its row, in `--ink-soft`,
with "not found" where the time was and a remove button. The button is
always visible on a missing row – it is the row's only action, and a
control that shows on hover cannot be found by someone who does not know
it is there.

### Project screen

```
┌──────────────────────────────────────────────────────┐
│  ‹ Lectures                            DE  EN   ⚙    │
│                                                      │
│  netsec-04                                           │  22 px medium, the folder name
│  ~/Lectures/netsec-04/source.md      Show folder     │  mono soft + text button
│                                                      │
│  ● Ready. Built at 14:32 in 0.4 s.                   │  17 px, dot in --ok
│    print.pdf written at 14:35 – 44 pages.            │  14 px, no dot, only after
│    Open PDF   Show in folder                         │  an export; text buttons
│                                                      │
│  [ Build now ]   ☑ Build again whenever source.md    │
│                    is saved                          │
│                                                      │
│  ┌──────────────────────┬─────────────────────────┐  │
│  │ Presentation         │ Cockpit                 │  │  14 px medium
│  │ for the projector    │ your notes, the timer…  │  │  13 px soft
│  ├──────────────────────┼─────────────────────────┤  │
│  │ Handout              │ Handout with notes      │  │
│  │ the lecture as a…    │ the document plus…      │  │
│  └──────────────────────┴─────────────────────────┘  │
│                                                      │
│  Open source.md in your text editor  Export as PDF…  │  two text buttons, one row
│  Any text editor will do. Save the file, and the     │  13 px soft
│  builder rebuilds.                                   │
│  ───────────────────────────────────────────────     │  hairline
│  Sections            12   Pictures              2    │  label soft, figure ink
│  Slides              92   Drawings             10    │
│  Words in the       …49   Words in the       934     │
│  handout                  speaker notes              │
│  source.md was saved at 14:31. The last build was    │  13 px soft
│  at 14:32.                                           │
│  Only source.md is watched. If you change a picture  │
│  or a font beside it, press "Build now".             │
│                                                      │
│  ▸ Show build details                                │  disclosure
└──────────────────────────────────────────────────────┘
```

The status sentence is the one thing on this screen with any size, and it
is a sentence, not a badge: "Ready. Built at 14:32 in 0.4 s." The dot before
it carries the same state in colour for people who read it across the room,
and never carries it alone.

The output grid is one bordered table of four cells sharing hairlines, not
four cards. Each cell is a button: name on the first line, what it is for on
the second, in `--ink-soft`. Hover and focus fill the cell with `--code-bg`;
a disabled cell (nothing built yet) drops to 45 % opacity and its second
line reads "Not built yet". The file name (`audience.html`) is *not* shown
in the cell – the person clicks "Presentation", and the file name is
something the folder can tell them.

After a failure the status area grows by two blocks, in this order:

1. the sentence, dot in `--bad`: "The build failed." followed on the next
   line, in `--ink-soft`, by either "The views still show the last successful
   build, from 14:32." or "There is no successful build yet, so the views
   cannot be opened.";
2. the message from build.js, verbatim, in a mono block on `--code-bg`,
   wrapped, never truncated – it is written for the author and names the
   line. When the error is not `userFacing`, the block is preceded by the
   sentence from `status.bug` and the stack goes into the build details, not
   here.

Auto-build off and a change seen: the dot stays `--ok` and the sentence
becomes "source.md has changed since the build at 14:32." That state has no
colour of its own on purpose; nothing is wrong.

The build process gone: dot `--bad`, "The build process stopped
unexpectedly.", and a "Restart" button in the place of "Build now".

**The PDF export is secondary, so it has no cell in the grid.** A PDF is a
file the author hands on, not a fifth view. “Export as PDF…” is a text
button beside “Open source.md in your text editor”, second, because the
editor is the daily one. It shares that row rather than taking one of its
own: a row of its own put the German ready state at 767 px in a 748 px
viewport and failed the smoke test's no-scrollbar check. The two wrap onto
two lines when the window is narrow.

**The export has a line of its own, under the status sentence and not in
its place.** A slide export can take a minute, and the author keeps saving
meanwhile – eleven rebuilds were measured during one export – so the
build's sentence has to keep answering for every save. The export's line
sits in the same `aria-live` region, at body size, aligned with the
sentence's words rather than with its dot, and without a dot of its own: the
dot answers for the build, and a second one would make the two look like
rivals. While it runs it says “Exporting the handout as PDF…”; the slides
add one soft line (“Every step of every slide becomes a page, so a long
lecture can take a minute.”), because there is no progress to show. When it
is done it says “print.pdf written at 14:35 – 44 pages.” with *Open PDF* and
*Show in folder* beside it, and it stays until the next export or until
another lecture is opened, which is why it carries the time. A cancelled
save dialog says nothing: the line goes back to what it said before. An
error is one sentence; a failure adds its reason in a mono block. The
export's own diagnostics – a picture that did not load, a link to a slide
that is not there, a slide that does not fit – stand verbatim in a mono
block under “Worth checking before you hand it on:”, the way a build error
is shown; they already name the chunk. When the file shows the last good
build because the latest save failed, a soft line says so.

While an export runs its button is `aria-disabled` rather than `disabled`
(a disabled button drops the focus of whoever just pressed it) and File ▸
Export as PDF is greyed out. The four view buttons, “Build now” and the
switches stay live.

Hints (no Chrome found; the lecture has embeds) are one paragraph each in
`--ink-soft` under the output grid, with a hairline above. No icon, no
coloured box. They appear only while they apply.

### What is in the lecture

Six figures under a hairline, in two columns of three: the document down the
left – sections, slides, words the students get – and the pictures, the
drawings and the lecturer's own words down the right. Label in `--ink-soft`
at 13 px on the left of its row, figure in `--ink` and tabular numerals hard
against the right of the column, so the units line up whether the number is
one digit or five.

Four decisions worth keeping:

- **No heading over it.** Six rows reading "Sections 12" say what they are.
  A "This lecture" head cost 33 px and one more level of hierarchy on a
  screen that already carries as many as it can.
- **No box and no rules between the rows.** The output grid is the one
  bordered thing on this screen; a second table beside it would turn a quiet
  reference into a dashboard.
- **Column-major, not row-major** (`grid-auto-flow: column`). The source
  order is then the reading order a screen reader gets – Sections, Slides,
  Words in the handout, then Pictures, Drawings, Words in the notes – while
  the eye still travels down a column.
- **Below the two daily actions.** The numbers are reference, looked at when
  a lecture is being planned rather than when it is being built, so they sit
  under the output grid and the editor button and above the two switches
  that are touched once a term.

Under them, two soft sentences. The first is the pair of times the numbers
raise a question about – when `source.md` was saved, when it was last built –
written as a sentence rather than as a metadata strip, and giving a date only
when the event was not today. The second says what the app does *not* watch:
`source.md` and nothing else, so a changed picture reaches the views only on
the next build. That sentence is there because the alternative was a person
watching a stale figure on a projector and having no way to know why.

Before the first successful build the six figures are replaced by one soft
line saying they arrive after it. They survive a failed build, for the same
reason the output cells stay enabled: the four views on disk are still the
last good build's, and so are its numbers.

"Show build details" opens a mono block of the raw log, newest at the
bottom, 12 rows high with its own scroll, and a "Copy log" text button.
The disclosure state is remembered for the session, not saved.

### Settings

A sheet that takes the place of the screen: while it is open the screen
behind it is hidden and inert, the top bar stays, and the sheet sits in the
same margin column as a bordered panel on `--paper`, 520 px wide (wide
enough that the folder-name hint does not break at its hyphen). Three rows – Language (two radio buttons), Open the
views in (two radio buttons), and the version line – and one "Done" button.
The `⚙` in the bar and the app menu both open it. Language changes apply
immediately to everything on screen, including the menu.

### Export as PDF

The settings sheet's pattern: it takes the screen's place, Escape and
“Cancel” close it, the focus lands on the chosen kind and goes back to the
control that opened it, and Enter on a choice exports. “Export as PDF…” and
the three items under File ▸ Export as PDF open it, the menu items with
their kind already chosen.

Two fieldsets of radio choices, each with a name at body size and a soft
13 px line on what it is, the way a cell of the output grid has:

- **What to export** – Presentation, Handout, Handout with notes: the grid's
  own three names, because they are the same three things on paper.
- **On the slides** – *Slide text* (the first sentence of each paragraph,
  and what is set in bold) or *Full text* (every sentence, as it stands in
  source.md). Shown only for the presentation; the handouts hide it rather
  than disable it, since they have no such choice. Two choices and not a
  third for “the lecture's own setting”: the window does not know that
  setting, and it is the one an author is least likely to remember. Slide
  text is the default because a PDF deck is the fallback for the room.

Everything else takes the command line's defaults: every step, 16:9, fitted
to the page. The kind and the collapse are remembered for the session.
“Export…” carries an ellipsis because the save dialog follows; the dialog
proposes the command line's file name beside `source.md`.

## Motion

None that is not an answer to an action. The disclosure opens without a
transition; the status dot does not pulse. While building, the dot is
`--busy` and the sentence says "Building…" – that is enough, and it is
usually over in under a second. A PDF export shows no bar and no count
either: one call in the browser walks every state, so there is nothing true
to count, and the slides' one soft line says what the wait is for.

## Keyboard and access

Every control is a real `<button>`, `<input>` or `<a>`; the output grid cells
are buttons. Focus is visible as a 2 px `--accent` outline with 2 px offset,
on everything, always. The status sentence lives in an `aria-live="polite"`
region so a screen reader hears the outcome of a build without the person
looking. Tab order is reading order.

## Things this design refuses

- No cards with shadows; the one bordered grid is the only box.
- No icons except the status dot, the disclosure triangle and the settings
  gear. The four outputs are named, not pictured.
- No eyebrow labels, no tracked capitals, no middle-dot metadata strings.
- No "psi-slides Builder" heading inside the window; the title bar has it.
- No progress bar. A build takes well under a second; a bar would be a lie
  about the wait.
- No toast notifications. The status sentence is the notification.
