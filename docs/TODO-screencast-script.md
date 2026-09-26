# TODO · docs/screencast-script.md

Findings from a production pass over `docs/screencast-script.md`, made while
building the pipeline in the sibling repository `psi-slides-screencast`.

**Scope of this file.** Only things that belong *here*. Production concerns —
frame stepping, cursor synthesis, compositing, hyperframes wiring — are resolved
in `psi-slides-screencast/screencast-script.md` and are not your problem. That
document is now the authoritative build script; this one asks you to fix the
creative source so the two do not disagree.

**Everything below is a correction to the script's own facts or arithmetic**,
except §7 which is an optional feature idea.

## How the script did

Nearly every checkable claim it makes about this repository is right:
`#async-timeline`, `#exercise-extend`, `#figure-focus`, `#video`,
`![](reveal-demo)`, `#math`, the `--integrate-annotations` and `--new` flags,
all eight key bindings, the "36 chunks" count, the exact `Why Playwright`
heading string — and, checked against `build.js` this time, both of the two
places where the script gives a *number of keypresses*:

- `FONT_CYCLE = ['serif', 'sans', 'mono']` — so "press `F` once so the deck is
  in sans" (S5) is exactly right.
- `THEME_NAMES` has seven entries with `dark` at index 4 — so "press `A` four
  times … end on the dark one" (S6.2) is exactly right.

The ambition of being "buildable without asking the author anything" is very
nearly met. The items below are what is left.

---

## 1 · The slide in S1 has the wrong number of bullets

**The most important item here, because the film contradicts itself out loud.**

`lectures/python-intro/source.md:514–524` — the `#why-playwright` chunk has
**four** bold lead sentences:

| line | text |
| ---: | --- |
| 518 | `**A lot of the web is rendered by JavaScript in the browser.**` |
| 520 | `**Playwright drives a real browser**` — *no full stop; an em dash follows* |
| 522 | `**For a link scanner this matters a lot.**` |
| 524 | `**The cost is weight.**` |

S1's scene graph specifies three bullets, drops line 522 entirely, and shortens
line 518 by "in the browser".

S1 and S5 show the same chunk. And S5's narration says the count aloud — "This
is what the room sees. **Four** sentences" — with S5.5 repeating it, "Back to
**four** bold lines". So the drawn slide in the opening has one fewer line than
the real slide eighty seconds later, in a film that points at exactly that
number.

**Fix:** four bullets, verbatim from the source. Knock-on: at 25 px with 44 px
leading, four lines is 176 px against three lines' 132 px, so the `slide` box
grows from 428 px to about 472 px, and the stagger at t=1.2 becomes four steps.

## 2 · The narration does not fit the shot durations

The total is right — 653 words over 272 s is 144 wpm — but the distribution is
badly off. S1 would need **262 wpm**; S2 195; S4 210. Meanwhile S5, S6, S8 and
S10 all run under 120 and have dead air.

The author has confirmed the narration is good, so the build script re-timed
every shot from the words rather than the reverse. Result:

| | S1 | S2 | S3 | S4 | S5 | S6 | S7 | S8 | S9 | S10 | S11 | S12 | total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| was | 24 | 12 | 20 | 14 | 34 | 20 | 40 | 20 | 30 | 24 | 26 | 8 | 272 |
| now | 46 | 18 | 26 | 22 | 27 | 20 | 39 | 17 | 29.5 | 31 | 26.5 | 8 | 310 |

**The film is 5:10, not 4:32 — the author has accepted this.** It is arithmetic
from the script's own numbers: 653 words at its own stated 150 wpm is 261
seconds of speech before a single pause or hold, and S10 additionally carries 11
seconds of deliberately silent action. The original running time was not
achievable with this narration. A brisker 165 wpm read would have landed near
4:46; that was declined in favour of keeping the pace unhurried.

**Please update §0** — "Running time 4:32. Narration is 620 words" becomes
5:10 and 653 words — **and the shot-list table.** The per-shot derivation and a
re-timed S1 keyframe table are in the build script.

The narration itself is unchanged and stays unchanged: it was the fixed input
the durations were computed from.

## 3 · "line 506" is stale

The `Why Playwright` heading is at **line 514**; the file is **739 lines**, not
730. Eight lines were added above it since the script was written. The heading
*string* is still exact.

Everything else in the document is addressed by `#id`, which is why this is the
only stale number. Suggest referring to the chunk by its heading or `#id` here
too, so it cannot rot again.

*(Both selection targets inside the chunk do exist, in case that was ever in
doubt: `**see only the HTML shell**` at 518, the `> note:` block at 533.)*

## 4 · The 42-character subtitle limit is broken by the script's own cues

§0 says "never more than 42 characters". All six S1 cues exceed it:

| chars | line |
| ---: | --- |
| 44 | Every lecture has three kinds of text in it. |
| 59 | What goes on the slide, sparse enough to read from the back. |
| 52 | The script – the sentences that actually explain it. |
| 56 | And notes to yourself, which must never leave your screen. |
| 58 | Presentation software gives you slides and one notes field. |
| 51 | So the script is the part that never becomes a file. |

Either the limit is wrong or the cues are. **The build script raises the limit
to 55**, which validates five of the six and leaves generous margins — 55
characters at 34 px Inter Tight is roughly 810 px in a 1920-wide frame. Line 2
still needs splitting or trimming either way.

Worth settling here before the remaining ~60 cues get written, since the answer
sets the style for all of them.

## 5 · Competitors are now named — two edits needed here

**Decided by the author: name PowerPoint and LaTeX Beamer explicitly.** That
loosens two things this document currently states, so both need updating.

**S1's caption stays as written** — `PowerPoint gives you two of these.` — and
the mismatch with the narration's general "Presentation software" is now
deliberate: the voice makes the structural argument, the caption grounds it.
Worth a one-line note in the shot so a later reader does not "fix" it back.

**A new caption is added to S9, naming Beamer.** It does *not* go in S1, and the
reason matters for this document.

S1's narration — "Presentation software gives you slides and one notes field. So
the script … is the part that never becomes a file" — is true of PowerPoint and
**false of Beamer**, by this repository's own `docs/comparison.md`:

> | Handout with the spoken text | yes, `print-notes.html` | **Beamer: yes, handout mode plus `\note`** |

Naming Beamer under that narration would be an overstatement contradicted by the
comparison page the film is supposed to link to — and caught first by exactly
the audience most likely to be watching.

S9 works because the distinction that *does* hold is the one `comparison.md`
already makes: "the note and the slide are two pieces of text that happen to
live in one file … you now maintain both." And S9's closing narration lands on
it: "Nothing was written twice, so nothing can be out of date."

The caption, in at 24.0 s and out at 28.4 s, on the same tint plate S5 uses:

```
Beamer can do this too — written twice.
docs/comparison.md
```

The second line does what §"What this film deliberately leaves out" asked for
when it excluded the comparison: *"Link the page instead."*

**So that section needs amending too.** "The comparison with Beamer and
reveal.js" is no longer wholly left out. Suggested: keep the bullet, note that
two names appear as single factual captions rather than as a comparison, and
that reveal.js, Quarto, Marp and Slidev stay out.

## 6 · S8 contradicts itself on layout

S8.1 says "Audience window, full screen"; S8.5 says "keep the cockpit in frame
if the layout allows". The build script
resolves this by holding the two-window layout through S8 and letting the
overview fill the larger panel — the viewer already knows there are two windows,
and removing one to bring it back reads worse than keeping both.

## 7 · Three things the script never specifies

- **S12's two URLs.** The keyframe says "the Pages URL, then the GitHub URL" but
  neither string appears anywhere. GitHub is confirmed as
  `github.com/UBA-PSI/psi-slides` from `package.json` and
  `docs/site/index.html`. The Pages URL is *derived* as
  `uba-psi.github.io/psi-slides` — `.github/workflows/pages.yml` deploys via
  GitHub Actions and there is no `CNAME`, so that is the default host, but it
  has not been confirmed against the live site. **This is the film's only call
  to action; a wrong URL is unfixable after publication.** Please write both out
  verbatim, including whether they carry `https://`.
- **S11.4's target chunk** — "Hold 4 s on a chunk that explains a directive
  while using it." The only shot target in the document left to judgement.
  `#figure-focus` (`lectures/tutorial/source.md:87`) is a good candidate since
  its heading is itself an instruction — but S10.3 already uses that chunk, so
  `#math` (`:419`) may read better. Please pick one.
- **S11.1's "Show the scaffolded folder"** — as `tree`, `ls -R`, or in an
  editor? The build script assumes `tree my-lecture`. Minor, but the shot is
  otherwise fully specified.

## 8 · Optional — a lint rule worth having

The film hard-codes slide text that lives in `source.md`. Item 1 above is
exactly the drift this project exists to prevent, and it went unnoticed in a
document that is otherwise scrupulous.

A check that S1's bullet strings appear verbatim in the `#why-playwright` chunk
would be a small, satisfying piece of dogfooding — and it would fail loudly the
next time someone edits that chunk. `lint.js` is the obvious home.

The same idea applies to `docs/site/img/`: the build script diffs S5's captured
frame against the landing-page screenshot and fails on drift. If that lands,
the film, the landing page and the source can no longer disagree without
something going red.

---

## Measurements taken, for the record

- **`node build.js lectures/python-intro/source.md` takes 0.25 s.** S4 shows
  this running in a shot that budgeted seconds for it; there is nothing to wait
  for, which is itself the argument. The three output lines are exactly the
  evidence the narration claims — keep the `[fonts]` and `[inline-images]`
  lines in frame.
- **`FONT_CYCLE`, `THEME_NAMES`, `COLLAPSE_MODES`** all enumerated and matching
  the script's keypress counts, as above.
- **`+` / `−` are bound with `=` / `_` aliases**, so the driver presses `Equal`
  and `Minus` and is layout-independent. Worth knowing that when a figure is
  focused they scale the figure rather than the type — S6.4 must run with no
  focused figure.
- **The two windows sync over `window.postMessage`** on the opener/openee handle
  pair (`build.js:4415–4431`), not over `localStorage` or `BroadcastChannel`.
  The comment explaining why is one of the nicer things in the codebase. One
  consequence for the film: S7's narration calls it "a browser message channel",
  which is loose but not wrong — "a direct message channel between the two
  windows" would be exact at the same syllable count. Author's call; the build
  script does not change it.
