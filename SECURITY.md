# Security

**A psi-slides lecture someone sends you is a web page written by that
person.** It can run code in your browser and tell its author that you opened
it. No version of psi-slides can prevent that, because the author decides
what goes into the files. They are made by the command `node build.js`, which
turns a lecture's Markdown source, `source.md`, into four HTML files:

- `audience.html`, the projection the room sees;
- `speaker.html`, the speaker view on your own screen (the cockpit);
- `print.html` and `print-notes.html`, the two documents for reading
  afterwards.

This document says what such files can and cannot do on your computer, what
`node build.js` refuses when you run it on a `source.md` somebody else wrote,
and what the tools that keep running on your computer during a talk
(`--watch`, `--serve` and `--prompter`) expose.

## Opening a lecture someone sent you

**The four files are web pages from the person who made them.** psi-slides
lets an author write HTML tags straight into the Markdown and does not remove
or neutralise them, so a lecture can carry JavaScript and run it when you
open the file. An SVG picture can carry script too: `node build.js` copies its code into
the page, where the browser runs it. A lecture can also
load a script, a picture, a stylesheet or a whole embedded page from a
server. Each such request tells the server that you opened the file, when,
and from which internet address.

**A lecture made from Markdown and local files alone makes no network
requests.** The fonts, pictures, formulas and QR codes are inside the file.
We checked this for the tutorial lecture in Chrome, stepping through all
hundred of its slides in the projection and the cockpit and opening both
documents: no request left the file. Apart from HTML written into the
Markdown, three things in a lecture reach a server, and you can see each of
them in `source.md` if you have it:

- A picture or clip with an `https://` address loads from that address.
- A hosted video (`::: embed`) loads its player only while its slide is on
  screen in the projection or the cockpit, and never in the two documents. A
  YouTube address plays through `youtube-nocookie.com`, a Vimeo address
  through Vimeo's player with “do not track” set, and any other `https`
  address is embedded as written. In a file opened from disk, a YouTube
  player is not loaded at all, because YouTube refuses to play there, and the
  slide shows a card instead.
- A link opens its page only when you click it. The QR code beside it was
  drawn when the HTML files were made.

**The browser keeps a lecture inside the limits it puts on any web page.** A
lecture cannot start programs on your computer, short of a flaw in the
browser itself. Nor could it read other files on your disk in the browsers
we tested: in Chrome 153 and Firefox 156 on macOS, a page opened from disk
that tried to fetch another file on disk, or to look into one through an
embedded frame, was refused. Safari has not been tested.

**In Chrome and Safari, pages opened from disk share one browser storage**,
and psi-slides keeps things there that you may not want another lecture to
see: the highlights and notes you made in a document, the annotations you
typed during a talk, and the speaker notes you rewrote in the cockpit, for
each psi-slides lecture you have opened from disk. A hostile lecture can
read, change or delete them. Chrome was tested with two lectures in
different folders; for Safari we measured only that the two documents of one
lecture share their storage. Firefox keeps a separate storage per file. If
this matters to you, open lectures from other people in a separate browser
profile, or first export your highlights with the Markdown export among the
document's reader tools.

## Sending a lecture you made

**Run `node build.js <source.md>` without `--watch` before you send the
files.** Files made under `--watch` contain a script that tries to reach a
port on the reader's own computer to hear about rebuilds. Their projection
and cockpit may also carry a random secret that lets a page change your
`source.md` while that `--watch` run lasts. The secret is useless once the
run has ended, but it does not belong in a file you hand on. The desktop
builder always runs with `--watch`, so run `node build.js <source.md>` once
before sending what it made.

**Check what the lecture took from the folder above its own.** `node
build.js` may read pictures, clips and fonts from the lecture's folder and
from the folder one level up (see the next section), and whatever it reads
ends up inside the HTML you send.

## Running node build.js on a source.md someone else wrote

**Use psi-slides 2.0.0 or later.** Until 2.0.0 is tagged, that means `main`
at commit `a2fb43b` or later. In earlier versions a `source.md` could run
code while `node build.js` read it, and copy any file you can read into the
four HTML files.

`node lint.js <source.md>` gives a safe first look: it reads the source, runs
nothing from it, and reports the first three refusals below as errors
(`frontmatter-language`, `asset-outside-root`).

**What `node build.js` refuses.** It stops before it writes any of the four
files, and its message says why:

- **A settings block in any language but YAML.** The block of settings
  between the two `---` lines at the top of `source.md` is read by a parser
  that picks its language from the word after the opening `---`, and `---js`
  used to run the block as JavaScript.
- **A file outside the lecture's folder and the folder one level up.** This
  covers each kind of file `node build.js` reads: pictures, the images in a
  diagram, backgrounds, the cover and closing images, clips, and fonts in
  `fonts/`. When the folder above is your home folder or the top of a disk,
  it reads from the lecture's folder alone, so a lecture unpacked at
  `~/talk` cannot reach `~/anything`. Nothing is read through a folder whose
  name starts with a dot (`.ssh`, `.git`, `.config`, `.env` …), inside the
  lecture's folder included.
- **A symbolic link whose target is a different kind of file than its name
  says.** A link counts as the file it points to, so it is held to the same
  folders, and `assets/pic.png` pointing at a PDF or a key is refused.
- **Writing through a link.** The four files, and the other files `node
  build.js` writes, are written under a new name and renamed into place. A
  `print.html` that arrived as a link to your shell profile is therefore
  replaced, and your profile is left alone. The prompter's log, the one file
  that is appended to, refuses a link at its path.
- **`--optimize-images` outside the lecture's own folder.** That command
  replaces and deletes pictures. It converts only files inside the lecture's
  folder and lists the others as shared or refused.

**What remains your job:**

- **A lecture may read pictures, clips and fonts from the folder above its
  own.** If you unpack a stranger's lecture next to your own lectures, it can
  put your pictures into its output. Check what a folder references before
  you share the files made from it.
- **`--check-fit`, `--squint` and `--frames` open the finished projection in
  a browser without a window**, and the lecture's scripts run there, network
  requests included.
- **Annotations are Markdown and may carry HTML.** `--integrate-annotations`
  moves the live annotations exported from a talk into `source.md`, and from
  there into each file you make. That holds for a snippet someone sends you,
  and also for one you exported yourself from Chrome or Safari, whose storage
  another lecture can write to (see above). Read the snippet before you
  integrate it.
- **The four files are still web pages from the author of `source.md`.**
  Running `node build.js` yourself leaves the HTML written into the source in
  place, so *Opening a lecture someone sent you* applies to the files you
  made too.

## The tools that keep running on your computer during a talk

**`--watch` and `--serve` listen on your own computer only** (127.0.0.1).
`--serve` delivers the lecture to your browser over http. It answers only a
request addressed to `localhost`, `127.0.0.1` or `[::1]` on its own port, and
only with the four files and the kinds of file they use: pictures, clips,
fonts, stylesheets, scripts and PDFs. It never serves `source.md`, a file
below a name starting with a dot, or the prompter's files. The live views
talk to `--watch` over a connection that accepts only a page opened from disk
or delivered by `--serve`, and changing `source.md` through it needs the
secret `node build.js` writes into the live views. A web page open in the
same browser can therefore neither read what `--serve` delivers nor change a
file. One gap is left. A page embedded in a restricted frame (an iframe with
the `sandbox` attribute) presents itself to that connection the same way a
file opened from disk does, so it can open the connection and hear that a
rebuild happened. It learns nothing more: why a rebuild failed is sent only
to views that know the secret.

**The live prompter (`--prompter`) listens to you while you talk and shows
hints in the cockpit.** It is off unless you switch it on. When it is on:

- **The transcript and the lecture's text, speaker notes included**, go to
  openrouter.ai and from there to the company that runs the model.
- **The prompter sends no audio. Chrome's speech recognition does**: it sends
  the audio to Google unless it can run the recognition on your device, in a
  dry run (`--prompter-dry-run`) too. The cockpit says which of the two you
  are getting.
- **The key** (`OPENROUTER_API_KEY`) is read by `node build.js` and never
  written into the HTML or the logs.

Two files stay on your computer, beside `source.md`: the log
`prompter-<date>.jsonl` and the prompt file `prompter-<hash>.prompt.txt`,
both readable by your user account alone. The log holds your spoken words
verbatim, so keep it out of repositories you publish. A run makes at most
`calls-per-hour` calls to the model in an hour, 360 unless the lecture's
`prompter:` settings say otherwise. Those settings can also name the model,
and you pay for that model, so check both in a `source.md` you did not write
before you run the prompter on it.

## Reporting a vulnerability

Report a vulnerability privately to the maintainer, Dominik Herrmann, by
e-mail or phone (both are listed at [herdom.net](https://herdom.net)). Please
do not use the public issue tracker. Say which version or commit you tested,
what a hostile lecture or `source.md` can do, and how to reproduce it.
