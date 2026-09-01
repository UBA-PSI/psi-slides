# Feature walkthrough – screencast production script

A 4½-minute film for the landing page and the README. Not recorded yet; this
document is meant to be buildable without asking the author anything.

Two kinds of shot, marked on every block:

- **ANIM** – drawn, no screen capture. Specified below as a scene graph plus
  keyframes, at 1920×1080, 30 fps. Built with hyperframe.
- **CAPTURE** – recorded from a real machine, with the exact keystrokes given.
  Nothing in a CAPTURE shot is mocked up. If a shot cannot be recorded as
  written, the feature has a bug and the film should wait.

The arc, and why: **twenty seconds on a problem that is specific**, then the
claim, then the tool doing all of it, then the tutorial as the way in. The
problem is not “PowerPoint is annoying”. It is that a lecture needs three
registers of text and the tool gives you two.

Running time 4:32. Narration is 620 words, which is 150 a minute with room to
breathe.

---

## 0 · Global settings

**Canvas.** 1920×1080, 30 fps, H.264 for the page, plus a WebM/VP9 copy.

**Palette** – the site's, so film and page match:

| role | hex | use |
| --- | --- | --- |
| paper | `#F8F8F7` | backgrounds |
| ink | `#2A2A2E` | primary text, strokes |
| ink-soft | `#6E6E76` | secondary text, inactive strokes |
| accent | `#8B2E00` | the one thing you are meant to look at |
| rule | `#DCDCD9` | dividers, frames |
| tint | `#EDEDEA` | filled panels |

**Type.** Inter Tight for everything drawn; Iosevka for anything set as code.
Both are in the repository under `docs/site/fonts/`. Never use a system font
in an ANIM shot – it will not match the captures.

**Motion.** One easing everywhere: `cubic-bezier(0.32, 0.72, 0, 1)`. Moves are
340 ms, fades 220 ms, and nothing eases in and out at once. Objects enter by
moving 24 px and fading from 0; they never scale up from zero.

**Capture settings.** Record at 2560×1440 and downscale, so the type stays
crisp. Chrome, no extensions, no bookmarks bar, a fresh profile so the browser
chrome is empty. Cursor visible, and slowed to roughly half of natural speed:
presenter software is judged on whether a viewer believes a human could drive
it. Between keystrokes, hold 400 ms – faster reads as a demo reel.

**Subtitles.** Burned in, not a track: the file gets embedded in pages that
carry no player UI. Inter Tight 34 px, ink on a `#F8F8F7` plate at 92 % alpha,
bottom-centred with a 64 px margin, one line at a time, never more than 42
characters. In and out with a 120 ms fade.

**Audio.** Voice only, no music. A voice over a quiet screen reads as a
colleague showing you something; music reads as an advertisement.

**Source material.** Everything is recorded against
`lectures/python-intro/source.md` and `lectures/tutorial/source.md`, both in
the repository, both published. Build them first:

```bash
node build.js lectures/python-intro/source.md
node build.js lectures/tutorial/source.md
```

---

## 1 · Shot list

| # | in | out | type | what |
| --- | --- | --- | --- | --- |
| S1 | 0:00 | 0:24 | ANIM | The three registers |
| S2 | 0:24 | 0:36 | ANIM | The claim |
| S3 | 0:36 | 0:56 | CAPTURE | One source file |
| S4 | 0:56 | 1:10 | CAPTURE | One command, four files |
| S5 | 1:10 | 1:44 | CAPTURE | The projection, and the collapse |
| S6 | 1:44 | 2:04 | CAPTURE | Reveals, themes, focus |
| S7 | 2:04 | 2:44 | CAPTURE | The cockpit, and freeze |
| S8 | 2:44 | 3:04 | CAPTURE | Overview and search |
| S9 | 3:04 | 3:34 | CAPTURE | Script and stage directions |
| S10 | 3:34 | 3:58 | CAPTURE | The rest of it, fast |
| S11 | 3:58 | 4:24 | CAPTURE | Start the tutorial |
| S12 | 4:24 | 4:32 | ANIM | End card |

---

## S1 · The three registers – ANIM – 0:00–0:24

The opening has one job: a lecturer recognises their own Tuesday in it. So it
draws the actual structural problem rather than complaining about a product.
No PowerPoint logo, no parody of a ribbon UI – filming somebody else's
software to insult it reads badly and dates fast.

### Scene graph

All coordinates from the canvas centre unless stated. Nothing here is a
screenshot; it is all vector.

| id | shape | geometry | fill / stroke |
| --- | --- | --- | --- |
| `stage` | rect | 1920×1080 | paper |
| `slide` | rounded rect, r 10 | 760×428, centred at (0, −190) | paper, 1.5 px rule stroke |
| `slide.head` | text, 34 px, 600 | left-aligned inside `slide`, 44 px in from its left edge, 56 px down | ink |
| `slide.bullets` | 3 text lines, 25 px, 500, 44 px leading | under `slide.head`, 34 px gap | accent |
| `sheetA` | rounded rect, r 10 | 500×640, centred at (−470, 300) | paper, 1.5 px rule stroke |
| `sheetB` | rounded rect, r 10 | 500×640, centred at (+470, 300) | paper, 1.5 px rule stroke |
| `sheet*.lines` | 14 stroked lines, 3 px, 26 px apart, random widths 55–100 % | inset 40 px | ink-soft at 40 % |
| `sheet*.label` | text, 20 px, 600, letterspaced 0.1em, uppercase | 28 px above each sheet | ink-soft |
| `caption` | text, 30 px, 400 | centred at (0, 470) | ink-soft |

Slide text, exactly:

- head: `Why Playwright`
- bullets: `A lot of the web is rendered by JavaScript.` / `Playwright drives a real browser.` / `The cost is weight.`

Sheet labels: `THE SCRIPT` (left), `STAGE DIRECTIONS` (right).

### Keyframes

| t | what happens |
| --- | --- |
| 0.0 | `slide` alone on paper, everything else at opacity 0. Hold. |
| 1.2 | `slide.head` in; 0.2 s later each bullet in, staggered 0.18 s. |
| 3.4 | Hold on the finished slide. This is the register everybody already has. |
| 4.6 | `slide` moves up 60 px and its opacity drops to 55 %, in one 340 ms move, making room. |
| 5.0 | `sheetA` in from below, with its label. Its lines draw left-to-right, 40 ms apart – it should read as *writing*, not as appearing. |
| 7.4 | `sheetB` in the same way. |
| 9.6 | On `sheetB`, three of the fourteen lines turn accent, one at a time, 0.4 s apart. Beside each, a small ink-soft note in 19 px: `ask the room first`, `skip if short on time`, `do not send this out`. |
| 12.4 | Hold, all three registers visible. |
| 14.0 | A dashed 2 px accent bracket draws around `sheetB` alone, and an accent label `only your copy` fades in above it. |
| 16.0 | The bracket and label fade. `sheetA` and `sheetB` each grow a small footer line: `students get this` and `you get this`. |
| 18.0 | Everything except `slide` fades to 25 %. Over the top, `caption` fades in: `PowerPoint gives you two of these.` |
| 21.0 | `caption` changes, in place, with a 220 ms crossfade: `The middle one you keep in your head.` |
| 23.4 | Everything fades to paper over 600 ms. |

### Narration

> Every lecture you give has three kinds of text in it.
>
> There is what goes on the slide, which has to be sparse enough to read from
> the back row. There is the script – the full argument, the sentences that
> actually explain the thing, which belongs in a handout and not on a wall.
>
> And there are the notes to yourself. Ask the room first. Skip this if you
> are short on time. Those must never leave your screen.
>
> Presentation software gives you slides and one notes field. So the script,
> the part students want most, is the part that never becomes a file.

### Subtitles

| in | out | line |
| --- | --- | --- |
| 0.4 | 3.2 | Every lecture has three kinds of text in it. |
| 3.6 | 7.0 | What goes on the slide, sparse enough to read from the back. |
| 7.2 | 11.6 | The script – the sentences that actually explain it. |
| 11.8 | 15.0 | And notes to yourself, which must never leave your screen. |
| 15.4 | 19.4 | Presentation software gives you slides and one notes field. |
| 19.6 | 23.2 | So the script is the part that never becomes a file. |

---

## S2 · The claim – ANIM – 0:24–0:36

Continues on the same paper. This is the only place in the film that makes a
claim rather than showing one, so it is short and it is followed immediately
by evidence.

### Scene graph and keyframes

| t | what happens |
| --- | --- |
| 0.0 | Paper, empty. |
| 0.3 | Wordmark `psi-slides` in Inter Tight 96 px, 650, ink, centred, in from 24 px below. |
| 1.4 | A 2 px accent rule draws under it, left to right, 380 ms, 520 px wide. |
| 2.0 | Subtitle line in below the rule, 34 px, 400, ink-soft: `the presentation software we always wanted for lectures and tutorials` |
| 4.2 | Wordmark and subtitle move up 180 px. Four small rounded rects (r 8, 260×160, 1.5 px rule stroke) fly in along the bottom, 0.14 s apart, labelled in Iosevka 19 px: `audience.html`, `speaker.html`, `print.html`, `print-notes.html`. |
| 6.6 | A single Iosevka 24 px line fades in above them: `source.md`, with four thin ink-soft connectors drawing down from it to each rect, 0.1 s apart. |
| 9.0 | Hold. |
| 11.0 | Everything fades. |

### Narration

> This is the presentation software we always wanted for lectures and
> tutorials.
>
> One Markdown file. Four views of it: the projection, a presenter cockpit,
> the printed script, and the same script with your stage directions folded
> in. Written once.

### Subtitles

| in | out | line |
| --- | --- | --- |
| 0.6 | 4.0 | The presentation software we always wanted for lectures. |
| 4.4 | 6.6 | One Markdown file. Four views of it. |
| 6.8 | 11.4 | Projection, cockpit, printed script, script plus your notes. |

---

## S3 · One source file – CAPTURE – 0:36–0:56

**Set-up.** Editor full-screen, dark chrome off – use a light theme so it does
not fight the rest of the film. Font 18 px, line numbers on. Open
`lectures/python-intro/source.md`.

**Actions.**

1. Start at the top of the file. Scroll at a readable pace to line 506, about
   4 seconds of scrolling. Do not jump.
2. Stop with the `Why Playwright` chunk filling the screen – the same chunk the
   whole film uses.
3. Select, one after another with the mouse, holding each selection ~1 s:
   - the heading line `## free: Why Playwright | the modern web is rendered, not served {.wide #why-playwright}`
   - the first sentence of the first paragraph
   - the `**see only the HTML shell**` fragment
   - the `> note:` block at the end of the chunk

**Post.** As each selection is made, a 22 px Iosevka label slides in from the
right margin, ink-soft, and holds until the next: `type + heading`,
`the slide`, `also the slide`, `only for you`.

### Narration

> Here is the file. One heading per chunk, prose underneath, and a note at the
> end.
>
> The first sentence of each paragraph is the slide. Anything you mark bold is
> also the slide. Everything else is the script. And the note is yours.
>
> That is the whole format. There is no second file to keep in step.

---

## S4 · One command, four files – CAPTURE – 0:56–1:10

**Set-up.** Terminal, light theme, Iosevka 20 px, 100 columns. `cd` into the
repository beforehand so the prompt is short.

**Actions.**

1. Type, at human speed: `node build.js lectures/python-intro/source.md`
2. Let the real output print. Do not cut the font and image lines – they are
   the evidence for the next sentence.
3. `ls -la lectures/python-intro/*.html`, so the four files and their sizes
   show.
4. Hold 1.5 s on the listing.

**Post.** Circle the four filenames with a hand-drawn accent ellipse, 400 ms,
then fade.

### Narration

> One command. Four files, and each one carries its own stylesheet, its
> JavaScript, its images, its rendered maths and its typefaces inside it.
>
> No server, no bundler, no theme to install. You can e-mail one of these to a
> colleague and it still looks like this in five years.

---

## S5 · The projection, and the collapse – CAPTURE – 1:10–1:44

**Set-up.** Chrome, 1920×1080, no other window. Open
`lectures/python-intro/audience.html`. Press `F` once so the deck is in sans.

**Actions.**

1. Arrow forward through three chunks at presenting speed, about 2 s each.
2. Land on `Why Playwright`. Hold 4 s. **This frame must match the screenshot
   on the landing page** – same chunk, same font, same theme.
3. Press `C`. The chunk expands into two columns of full prose.
4. Hold 5 s, long enough that a viewer starts reading and realises they
   cannot finish. That is the point.
5. Press `C` again. Back to four bold lines.
6. Hold 2 s.

**Post.** During step 3, a subtitle-height caption at the top of the frame, in
the site's tint plate: `same file · one keypress`. Out before step 5.

### Narration

> This is what the room sees. Four sentences.
>
> And this is the same file, with one key pressed.
>
> Nothing was rewritten, and nothing was duplicated. The long version was
> there the whole time – the projection just declines to show it. Which means
> the sparse version and the full one cannot drift apart, because they are the
> same paragraph.

---

## S6 · Reveals, themes, focus – CAPTURE – 1:44–2:04

The first of two fast passes. Cuts are hard, no transitions, roughly 4 s per
beat.

**Actions.**

1. Navigate to `#exercise-extend`, the only chunk in this lecture built from
   reveal segments – the closing exercise, one extension at a time. Press
   `Space` four times, 1.2 s apart.
2. Cut. Press `A` four times, ~0.9 s apart, cycling themes; end on the dark
   one, hold 1.5 s, then press `A` until back to the light theme.
3. Cut. Go to `#async-timeline`. Click the figure – it zooms to fill the
   screen. Hold 2 s. Click again to release.
4. Cut. Press `+` twice and `−` twice, so the type steps up and back.

### Narration

> Reveals are three dashes in the source. Themes are one key, including a dark
> one for a room with the lights off. Click a figure and it fills the screen.
> The type steps up if the back row complains.

---

## S7 · The cockpit, and freeze – CAPTURE – 2:04–2:44

**Set-up.** Two displays, or two windows tiled 60/40. The audience window
stays visible throughout – the whole point is that both are on screen.

**Actions.**

1. In the audience window, press `S`. The cockpit opens. Drag it to the second
   display.
2. Hold 3 s on the cockpit.
3. Move the cursor to each region as it is named, resting 1 s on each: the
   chapter scrubber along the top, the stage, the note beneath it, the strip
   of coming slides, the timer at bottom left.
4. Click the `+` beside the note twice. The note grows. This is a real button
   and it is deliberately large.
5. Arrow forward once. Both windows move together. Hold 1.5 s.
6. Click **freeze** in the footer. The indicator changes.
7. Arrow forward twice. **The audience window does not move.** Hold 3 s with
   both windows in frame – this is the shot that sells the feature.
8. Click **live**. The projection catches up in one step.

### Narration

> Press S and a presenter view opens in a second window. The two stay in step
> over a browser message channel, with nothing running between them – no
> server, no account, no network. It works from a memory stick.
>
> Your script is under the stage, at whatever size your eyes want. Your stage
> directions are there too. What is coming is along the bottom.
>
> And this is freeze. The room keeps the slide it is reading while you skip
> ahead to check something. Let go, and the projection catches up.

---

## S8 · Overview and search – CAPTURE – 2:44–3:04

**Actions.**

1. Audience window, full screen. Press `O`. The overview board fills the
   screen with all 36 chunks.
2. Drag to pan, slowly, 3 s. The slides are legible, not thumbnails – do not
   cut away before a viewer notices that.
3. Press `Escape`, then `/`.
4. Type `async`, one character at a time. Results appear as you type.
5. Arrow down to the third result. Press `Enter`. The slide lands – **in both
   windows**, so keep the cockpit in frame if the layout allows.

### Narration

> Someone asks about something from twenty minutes ago.
>
> The whole lecture is one file, so all of it is on screen at once, and all of
> it is searchable. Type, land, carry on. Both screens follow.

---

## S9 · Script and stage directions – CAPTURE – 3:04–3:34

The payoff for S1. Do not rush it; this is the part no other tool does.

**Actions.**

1. Open `lectures/python-intro/print.html`. Scroll to the same
   `Why Playwright` section.
2. Hold 4 s, long enough to read a paragraph. Point at a hyphenated line
   break with the cursor.
3. Cut to `print-notes.html`, same section, same scroll position. The tinted
   speaker-note block appears under the chunk.
4. Circle that block with a hand-drawn accent ellipse.
5. `Cmd-P`. The print preview shows real pages. Hold 2 s. `Escape`.

### Narration

> Here is the script. The same source, set as a document: hyphenated, in a
> reading measure, with the full paragraphs the projection left out. That is
> the file students get.
>
> And here is the same document with your stage directions folded in under
> each section. That one is yours.
>
> Two audiences, three registers, one file. Nothing was written twice, so
> nothing can be out of date.

---

## S10 · The rest of it, fast – CAPTURE – 3:34–3:58

Hard cuts, 3 s a beat, no narration over the first three – let them land. Use
the tutorial for these, since it demonstrates each one deliberately.

**Actions.**

1. `#math` – display maths, rendered at build time. Hold 3 s. Press `F` once
    so the formula follows the font toggle into sans, hold 1.5 s.
2. `#video` – the clip figure (`![](reveal-demo)`). Press play. Both windows
   play in step; keep both in frame. Hold 3 s.
3. `#figure-focus` – `Shift`-click the link *the group behind the tool*. The
   address appears on both screens with a QR code beside it. Hold 3 s, long
   enough that a viewer could actually scan it.
4. Press `N` and type a short annotation – it appears on **both** screens as
   you type, so keep both in frame. Press `Escape`. Then `Shift-E` on the
   cockpit, which copies it as `> annot:` Markdown. Cut to the editor: paste
   at the end of `source.md`. Cut to the terminal:
   `node build.js lectures/tutorial/source.md --integrate-annotations`. Cut
   back to the editor: the block has moved under its chunk.

   (`N` is the annotation the room sees. `Shift-N` is the private one, and it
   is deliberately not in this shot – it would look identical on the cockpit
   and the difference is exactly what the audience window shows.)

### Narration

*(silent over 1–3)*

> Maths, video, links with a code the room can scan.
>
> And anything you write during the talk – a correction, a question worth
> keeping – can be folded back into the source afterwards, in one command. The
> lecture improves every time you give it.

---

## S11 · Start the tutorial – CAPTURE – 3:58–4:24

**Actions.**

1. Terminal: `node build.js --new my-lecture`. Show the scaffolded folder.
2. Cut to Chrome. Open `lectures/tutorial/audience.html` – the tutorial's
   title chunk.
3. Arrow forward twice, into the first real chunk, so a viewer sees it is a
   lecture that is about itself.
4. Hold 4 s on a chunk that explains a directive while using it.
5. Slow fade to paper.

### Narration

> Starting is one command, and it scaffolds a lecture that already builds.
>
> The best way to see the rest is the tutorial. It is a lecture about how to
> write lectures, so every feature it describes is running on the slide you
> are reading it on. Open it, press the keys it mentions, and you are already
> using the tool.

---

## S12 · End card – ANIM – 4:24–4:32

| t | what happens |
| --- | --- |
| 0.0 | Paper. Wordmark `psi-slides` in from 24 px below, 96 px, 650, ink, centred at (0, −80). |
| 0.9 | Two Iosevka 26 px lines fade in at (0, 40) and (0, 84), ink-soft: the Pages URL, then the GitHub URL. |
| 2.0 | A 20 px ink-soft line at (0, 190): `MIT · University of Bamberg · Privacy and Security in Information Systems` |
| 6.5 | Fade to paper. |

No logo animation and no call to action beyond the two URLs.

### Narration

> Free, open source, and it runs from a file.

---

## What this film deliberately leaves out

- **The comparison with Beamer and reveal.js.** A film is the wrong medium
  for an argument the viewer should be able to check line by line. Link the
  page instead.
- **Any number about time saved.** We have not measured it, and an invented
  figure is exactly the kind of thing that gets quoted back.
- **The parser, the sync protocol, the build internals.** Interesting, and
  not why anyone would switch.
- **A feature list read aloud.** S6 and S10 zap through nine features in
  forty-four seconds precisely so the film does not have to narrate them.
