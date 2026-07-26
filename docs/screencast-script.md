# Feature walkthrough – screencast script

A four-minute film for the landing page and the repository README. Not
recorded yet; this is the shooting script.

The arc is deliberate: **thirty seconds on the problem, then straight to the
answer.** A viewer who has never heard of the tool needs to recognise their own
Tuesday afternoon in the first ten seconds, and needs to see the tool working
before minute one. Everything after that is evidence.

Narration is written to be spoken at roughly 150 words per minute and to work
as burned-in subtitles. Keep each subtitle to one line of the screen.

---

## Production notes

- **Capture at 2560×1440, deliver at 1920×1080.** The audience view is a
  projection; it has to look like one. Downscaling keeps the type crisp.
- **Two windows only.** The editor on the left, Chrome on the right, for the
  first minute; then Chrome full-screen for the rest.
- **Show the cursor**, and slow it down. Presenter software is judged on
  whether the viewer believes a human could drive it.
- **No music.** A voice over a quiet screen reads as a colleague showing you
  something; music reads as an advertisement.
- **Subtitles burned in**, not a caption track, because the file will be
  embedded in pages that do not carry a player UI.
- **The opening (0:00–0:25) is the only animated part.** Hyperframe, drawn
  rather than captured, because there is nothing honest to film for it and
  because a filmed PowerPoint is somebody else's product on screen.
- Record the whole thing against `lectures/python-intro/`. It is 36 chunks of
  real teaching material, it is published, and every shot below exists in it.

---

## 0:00–0:25 · The problem

**Visual (animated, hyperframe).** A slide deck as a stack of rectangles. One
rectangle is dragged, and a text box on it shifts a few pixels out of
alignment. A second rectangle gets a paragraph of body text pasted in; the
font size steps down on its own to make it fit. The stack fans out into
forty-one near-identical rectangles labelled `lecture_final_v3_REALLY.pptx`.
Then the handout question: the same stack, printed, with the useful sentences
missing – because they were never on the slides, they were in the lecturer's
head.

> Every lecture you give has two versions. The one on the projector, which has
> to be sparse enough to read from the back row. And the one in your head,
> which is the version that actually explains anything.
>
> So you write both. You keep them in step by hand. And when a student asks
> for the slides afterwards, you send them the sparse one, because it is the
> only one that exists as a file.

**Cut, hard, on the last word.**

---

## 0:25–0:50 · The premise

**Visual.** A plain text editor. One file, `source.md`. Scroll slowly through
four or five chunks so the shape registers: headings with tags, prose,
`**bold**`, a fenced code block, a `> note:` line.

> psi-slides takes one Markdown file and builds four views of it. The room
> gets the sparse version. The handout gets the full one. You write it once.

**Visual.** Stop scrolling on the `Why Playwright` chunk. Highlight, one after
the other with a soft outline: the first sentence of a paragraph, then a bold
phrase inside it, then the `> note:` line beneath.

> First sentence of each paragraph, plus anything you marked bold: that is the
> slide. The rest of the paragraph is the document. The note is for you.

---

## 0:50–1:10 · The build

**Visual.** Terminal, one command:

```bash
node build.js lectures/python-intro/source.md
```

Let the real output print. Then `ls` the folder so the four HTML files are
visible with their sizes.

> One command, four files. No server, no bundler, no theme to install. Each
> file carries its own CSS, its own JavaScript, its images and its typefaces
> inside it, so it opens by double-clicking, on any machine, forever.

---

## 1:10–1:55 · The projection, and the collapse

**Visual.** Open `audience.html`. Arrow through three or four chunks at
presenting speed. Land on `Why Playwright`. Press <kbd>C</kbd>.

> This is what the room sees.

*(beat, let the slide sit)*

> And this is the same file with one key pressed.

**Visual.** The chunk expands from four bold lines into two columns of full
prose. Hold for three seconds. Press <kbd>C</kbd> again to collapse.

> Nothing was rewritten. Nothing was duplicated. The long version was always
> there; the projection just declines to show it.

**Visual.** Press <kbd>Space</kbd> on a chunk with reveal segments and step
through them.

> Reveals are a line with three dashes in the source. Themes are one key.
> Font size is one key.

---

## 1:55–2:40 · The cockpit

**Visual.** Press <kbd>S</kbd>. A second window opens. Drag it to the second
display (or simulate: two windows side by side).

> Press S and you get a presenter view in a second window. The two stay in
> step over a browser message channel, with nothing running between them – no
> server, no account, no network.

**Visual.** Point at each region in turn as it is named: the chapter scrubber,
the stage, the note, the strip, the timer.

> Your note under the stage, at whatever size your eyes want it. What is
> coming next, along the bottom. And a freeze button.

**Visual.** Click **freeze**. The indicator turns. In the audience window,
arrow forward twice – nothing moves. Point at the frozen projection. Click
**live** again; the projection catches up in one step.

> Freeze holds the projection on the current slide while you read ahead. The
> room keeps the slide it was reading. When you thaw, it catches up.

---

## 2:40–3:10 · Finding things, mid-talk

**Visual.** In the audience window, press <kbd>O</kbd>. The overview board
fills the screen. Pan across it slowly.

> Someone asks about something from twenty minutes ago.

**Visual.** Press <kbd>Escape</kbd>, then <kbd>/</kbd>. Type `async`. Results
appear with their tag, heading and matching sentence. Arrow to the third,
press <kbd>Enter</kbd>. The slide lands, on both screens.

> The whole lecture is one file, so it is all searchable. Type, land, carry on.

---

## 3:10–3:40 · The document

**Visual.** Open `print-notes.html`. Scroll through the same section that was
just presented, slowly enough to read a paragraph.

> The same source, set as a document. Hyphenated, in a reading measure, with
> the full paragraphs the projection left out – and your spoken notes folded
> in under each section.

**Visual.** Cmd-P to show the print preview, then close it without printing.

> That is the handout. It was never a separate file, so it was never out of
> date.

---

## 3:40–4:00 · Close

**Visual.** Back to the editor, one file. Then a fan of the four HTML files.
Then the URL, held.

> One Markdown file. Four views. Nothing fetched at run time, nothing that
> stops working when a service does.
>
> It is free, it is open source, and the tutorial is a lecture that explains
> itself.

**End card.** The repository URL and the Pages URL. Two lines, no logo
animation.

---

## What this script deliberately leaves out

- **Maths, video, hosted embeds, live annotations, QR codes for links.** All
  of them work; none of them are why somebody would switch. They belong in the
  tutorial, not in the first four minutes.
- **The comparison with Beamer and reveal.js.** A film is the wrong medium for
  an argument the viewer should be able to check line by line. Link the page.
- **Any claim about time saved.** We have not measured it, and a number
  invented for a film is the kind of thing people quote back.
