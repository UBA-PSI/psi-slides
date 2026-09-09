# The site's design, and why it is that way

This is the brief the project site was rebuilt against, kept so a later
change can be checked against the reasoning rather than against a
screenshot. The rules live in `site.css`, where each one carries its own
comment; this file is the layer above that, the part that no single rule
explains.

Its companion is `desktop/DESIGN.md`, which does the same job for the
builder app.

## What the site is for

A lecturer decides in about a minute whether a tool is worth an evening.
The site has to make the argument in that minute and then get out of the
way, so it is ordered: convince first, act second. The last two sections
are the only ones that ask for anything.

## The one problem this site has that most do not

**Every picture on it is a picture of text.** A slide full of prose, a
handout, a cockpit of small type. Put one directly under a paragraph and
the reader cannot tell where the page stops and the picture starts, nor
which text is caption and which is body. Three layouts were built and
thrown away before that was named, and every symptom they showed – "busy",
"crowded", "exhausting" – came back to it.

Three rules follow, and they are the reason the page looks the way it
does:

1. **A picture stands on a stage.** `.stage` is a field of `--stage`, the
   page's ground stepped down, running the full frame with two to three
   rem of air inside it. Between prose and pixels there are two edges
   (`--paper` → `--stage` → `--shot-bg`) instead of one, and the space
   around a picture is unmistakably larger than the space between two
   paragraphs. A field is not an ornament: no shadow, no stripe, no card
   around every block.
2. **The sentence goes in front of the picture, not behind it.** Every
   figure has a `.cue` that says what to look at and why. A caption after
   the fact is read after the confusion it was meant to prevent.
3. **Two stages in a row need more air than one stage after a paragraph.**
   `.second-picture` carries that, and it is a rule because the first
   version had the class in the markup with no CSS behind it and the two
   fields touched.

The cue stays **outside** the stage on purpose. Inside it, the triad
collapses to two and the device loses the job it was built for.

## The layout: one frame, one left edge, two stops

The page is one frame, centred in the viewport. Inside it there is exactly
one vertical line at which anything begins: the frame's left edge. Nothing
is centred inside it, nothing is offset, nothing breaks out.

To the right there are two stops. Prose ends at `--measure`; anything that
is looked at rather than read – a screenshot, a gallery, a table, a
listing – runs to the frame's edge.

**Why not a common centre.** The version before this one had three track
widths centred on one middle. That gives one centre and three different
left edges, and reading follows the left edge: inside a single section the
eye had to find the column again three times. A shared centre is an
alignment nobody reads.

**Why not one column for everything.** The version before *that* held
prose and pictures at one width and let pictures break out with a
transform. Prose and pictures then stood on two left edges, and a third of
a wide screen was empty.

### Never a half-empty row

The failure mode both earlier attempts shared: an element uses half the
width and nothing stands beside it. One-sided whitespace reads as a
mistake; symmetrical whitespace reads as intent. So every section answers
this in one of three ways, and the answer is named in its comment:

- a second thing goes into the free half (`.beside`, `.aside-code`),
- the element takes the width itself (every listing, every stage),
- or it is deliberately narrow and centred, so the whitespace is even on
  both sides (`.middle`, used where there genuinely is nothing to put
  beside it).

`.beside` is the workhorse: a narrow column of heading plus three to five
lines against a stage that is wider **and taller**. The height matters. If
the two columns are close in height, the shorter one ends in a hole; if
the stage is clearly taller, the space under the words reads as margin.
That is why the text in a `.beside` is written to length rather than
poured in.

## Colour

**The page is not white.** Everything the site shows a picture of is
itself near-white, so on a white ground a screenshot dissolved into the
page and only a hairline said where it ended. The ground is a soft warm
grey; the artefacts sit on it as white objects. That is the one job the
palette has to do, and it is why `--paper` may get better but must not go
back to white.

Four surfaces, each a real step from the ground rather than the one and a
half per cent they used to share: `--shot-bg` white for a card or a
screenshot, `--stage` for the field a picture stands on, `--code-bg` a
recess for a listing, and two rules. Contrast is measured on rendered
pixels, not on the token strings – Chrome returns `oklch()` as `oklch()`,
so a check through `getComputedStyle` sees every pair at 2.2:1 and passes
everything. The weakest real pair is 5.3:1, a caption on the stage, and
that is what has kept the stage from going darker.

**There is no band alternation.** Two tints one and a half per cent apart
separated nothing and still added an event every few screens. What
separates two sections is the gap, and the gap is large enough to read as
one.

**The page has an ending.** The closing band changes ground across the
full width and carries the further reading and the byline together. No
rule above the byline: the change of field already separates, and a line
inside it would be one mark too many.

## Type

The two families are fixed: IBM Plex Sans and JetBrains Mono, served from
this origin. That is an argument, not a preference – the lectures set the
same faces, so a screenshot and the page around it are the same type. A
Google Fonts link would also tell a third party who reads the page of a
tool whose whole point is that its output fetches nothing.

Sizes and weights are free and have moved: `h2` sits at roughly two and a
half times the body, because at 1.3× nine sections read as one on a
contact sheet.

Ligatures are off in the mono family everywhere, and the rule lists every
selector that sets `--mono` rather than four element names. The figure
grammar spells an arrow `->` and a plain line `--`; a face that ligates
those draws one glyph where the author has to type two characters.

## Interaction

Two devices on this site, and both follow the same rule: **a control
answers an action, it never runs on its own.** No scroll-triggered
motion.

- **The chooser** shows one option at a time and puts its options in a row of
  tabs above. Click rather than hover, because a hover switch has no answer
  on a touchscreen and it is the only route to the options that are not
  first. The tabs are real buttons: focusable, Enter and Space. Without
  JavaScript the options stand under each other with their labels above them,
  and the section still says what it came to say.

  It carries two things, and that it is one mechanism rather than two is the
  point – a second way of switching something would be a second thing for a
  reader to learn and a second thing to keep operable from a keyboard.
  **The three ways** on the front page are an argument in three moves, so its
  labels carry the judgement ("not ideal", "our approach") the prose used to
  make. **The cue-card sequence** on "In the room" is four frames of one
  window, one per press of the space bar, because what that mode does is move
  the cards and the projection together and a still cannot show a change. Its
  labels are paragraphs rather than headings: that page's headings are the
  anchors its two languages are linked by, and the twin gate counts them.
- **The handout switch** opens on `print.html`, the file that is handed
  out, and swaps to `print-notes.html`. The filename in the title bar
  changes with it, or the bar would be exactly the confusion the switch
  was built against. The two shots are taken in identical geometry on
  purpose: a switch that also changes the crop reads as two pictures
  rather than as one file becoming another.

## What must not appear

The list is the client's, and it is a list of defaults rather than of
mistakes. Each is legitimate somewhere; none is a choice here.

- Accent borders down the left edge of a box.
- Small-caps eyebrow lines above headings.
- A card with a shadow for everything, gradient washes, a row of icons
  with three benefit claims.
- One word in a heading set in colour or italic.
- Numbered markers 01 / 02 / 03 where the content is not a sequence. The
  install steps are numbered, because those *are* a sequence.
- An arrow appended to link or button text.
- Motion that answers scrolling rather than a person.

## Navigation

One bar, not two. The university strip that says who is responsible for the
site is also the site's navigation, because a second row under it would be a
second sticky element for six words, and the strip is already the only thing
that appears on every page.

Its entries come from `SITE_PAGES` in `build-site.js`, one row per page, and
that table is also what the language switch and the link gate read. Taking a
page into the navigation is a row there and nothing else; a row marked
`pending` is a page that has been decided on but not written, and the bar
leaves it out until it exists.

**The page you are on is marked, and the mark is not a device.** The entry
carries `aria-current="page"`; the stylesheet answers with the other entries
one shade back and a hairline under this one. Not an accent border, not a
pill, and not bold – the bar's type is 0.78rem on a 30px strip, where one
bolded word of six reads as a rendering fault. The burger panel has room for
weight, so there it is weight: an underline in a column of stacked links reads
as a visited link.

**The strip must never grow a second line**, and it has no room to spare, so
every entry added to it is a re-measurement. The number is in `site.css` beside
the rule that uses it, with what was measured and in which language; build with
`PSI_SITE_NAV_ALL=1` to put every row in the bar first, or the measurement is
of a bar smaller than the one being planned.

## Both languages, structurally identical

`index.html` and `index.de.html` are twins: same sections, same pictures,
same order, same code blocks. What changes in one changes in the other, in
the same commit. Code comments may be translated; the commands may not.

`build-site.js` checks that rather than asking for it. Four things have to
match – the sequence of `h2`/`h3` levels and the ids the English page gives
them, the pictures in order, the commands once the `#` comments are cut off,
and the link targets with the two languages' own paths folded together. The
prose between them is free, which is the only definition that survives a real
translation.

## How to check a change

Not by reading the CSS. Build, serve, screenshot, look:

```bash
node docs/site/build-site.js /tmp/site-out
(cd /tmp/site-out && python3 -m http.server 8791)
```

Then, in order of how much each one has caught:

1. **A contact sheet of the whole page.** Full-page screenshot scaled to
   about 28 % and laid out in five columns. Every failure in this
   rebuild's history showed up here first and nowhere else: the busy
   rhythm, the half-empty rows, the sections that read as one.
2. **Clipping, per container.** Page-level overflow
   (`documentElement.scrollWidth > innerWidth`) does not catch a box that
   clips its own content, and that is how a listing shipped with its
   first characters behind the edge. Ask every `pre`, stage, table,
   figure and card whether `scrollWidth > clientWidth`, with the
   disclosures forced open.
3. **390, 768, 1100, 1440, 1920, 2560**, both languages, plus
   `figures.html` and `comparison.html`, which inherit this stylesheet.
4. **Both colour schemes**, and contrast measured on rendered pixels.
5. Keyboard focus visible, `prefers-reduced-motion` respected, the chooser
   and the handout switch operable by keyboard, in each place the chooser
   appears.
