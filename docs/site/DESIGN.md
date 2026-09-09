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
4. **The air goes under a stage as well as over it.** The first version of
   this system gave a picture room above and nothing below, so the row of
   text explaining it started against the picture's edge and read as part
   of it. The same seam is set on `.beside + .pair-up` and its siblings.
5. **A picture is as large as what it has to show, and no larger.** A
   screenshot at 16:10 across the whole frame is over 800px tall: it
   pushes everything else off the screen, and a reader who scrolls past it
   has lost where they were. So each stage answers what its picture is
   for. One whose details the text discusses keeps its size, or is shot as
   a crop; one that stands there as evidence goes small, and the text that
   would have sat above it moves into the free half beside it.

The cue stays **outside** the stage on purpose. Inside it, the triad
collapses to two and the device loses the job it was built for.

**A drawing gets the same stage as a screenshot**, which was decided rather
than inherited. A compiled `::: draw` figure is mostly air and a dozen labels,
so it has the picture-of-text problem more weakly than a slide does &ndash; but
it has a second one the screenshots do not: the compiler paints in the page's
own tokens, so a box is filled `--paper` and outlined `--ink` on a page whose
ground is `--paper`. Dropped straight onto the page a figure has no edge at
all. What it does not get is a window bar, because there is no window; that is
what `.shot.drawn` says on the front page and what `.fig-card` says on
`figures.html`.

## The layout: one frame, one left edge, two stops

The page is one frame, centred in the viewport. Inside it there is exactly
one vertical line at which anything begins: the frame's left edge. Nothing
is centred inside it, nothing is offset, nothing breaks out.

To the right there are two stops. Prose ends at `--measure`; anything that
is looked at rather than read – a screenshot, a gallery, a table, a
listing – runs to the frame's edge.

A third stop is narrower rather than wider: `--measure-col`, for text
belonging to a column, a card or a picture instead of to the page. Prose
at the page's measure runs to about 75 characters, which is right for a
paragraph a reader settles into; the same width inside one half of a
two-column row reads as a wall, because the eye is switching between the
halves rather than running down one. This is the distinction `--fs-note`
draws in the type scale, and the two are set together.

**Why not a common centre.** The version before this one had three track
widths centred on one middle. That gives one centre and three different
left edges, and reading follows the left edge: inside a single section the
eye had to find the column again three times. A shared centre is an
alignment nobody reads.

**Why not one column for everything.** The version before *that* held
prose and pictures at one width and let pictures break out with a
transform. Prose and pictures then stood on two left edges, and a third of
a wide screen was empty.

### Never a half-empty row, and the band that answers it

The failure mode two earlier attempts shared: an element uses half the
width and nothing stands beside it. One-sided whitespace reads as a
mistake; symmetrical whitespace reads as intent.

The version before this one answered that inside the row, with a rule
about what may be *written*: the words column had to be a heading and
three to five lines, never a paragraph that happened to be there, so that
the hole under it would be small enough to read as margin. That rule was
right about the diagnosis and wrong about the remedy. It is a constraint
on the author, it was broken by every section that needed a sixth line,
and each break was patched where it showed rather than where it came
from &ndash; so the same fault came back on a different page each time. The
client's word for it, three rebuilds running, was that the page looked
broken.

**A band takes the answer out of the writing and puts it in the geometry.**
A band is one row at the frame's full width, words on one side and a stage
on the other, and the words are **centred against the stage**
(`align-items: center`, which is the whole of it). The space left over is
then split above and below the words instead of piling up underneath.
The column may be four lines or nine; the row is right either way, and no
section has to be written to a length.

Two things follow, and they are the rest of the rule:

- **What may follow a band is a block at the frame's width.** A band ends
  at full width and the next thing begins at full width, so nothing after
  a band lines itself up against anything inside it. This is where the
  fault used to hide once it had been chased out of the rows: a stage 500px
  tall beside three lines of words, and then the button, the table or the
  next paragraph starting *under the hole*, at the left edge, with nothing
  above it for half a screen. A sentence that belongs to the words goes in
  the words column; a heading, a button, a row of three, a listing is its
  own block. `.beside + *` carries the seam, and it is `*` on purpose: the
  list form of that selector was itself the symptom, one line added per
  section that opened a hole.
- **Not everything is a band.** A band is a thought with a piece of
  evidence beside it. Where there is no picture there is nothing to stand
  beside, and the block takes the frame or the measure: the three lecture
  cards and the fold under them on the front page, the two warnings about
  unsigned packages, the four design principles, the closing links.
  A paragraph at `--measure` with ground to its right is not a half-empty
  row; it is the page's own margin, the same margin every lede has.

#### Which side the stage takes

Not alternation. A page that flips every section has stopped meaning
anything by it, and that is the first step towards looking like a product
page.

- A band that carries the argument **one step further** keeps the reading
  direction: words left, evidence right. Most bands are this.
- A band that shows a **comparison** &ndash; the same thing twice, two
  executions of one job, two ways to the same place &ndash; turns it round:
  the stage leads and the words are the verdict on it. There are two on
  the front page (the slide as the room sees it and as the reader gets it;
  the two handouts under one switch), one on "In the room" (the two ways
  back to slide forty), one on "A slide is a frame" (two ways of putting
  words on a picture).

The same question decides `.aside-code`, whose evidence is a listing rather
than a picture: the listing is the wide half either way, and which side it
takes follows the same rule.

#### The one place centring is wrong

`.beside.level` exists for a row whose second column is a **disclosure**.
A band is centred because the difference in height is fixed; a fold is
64px shut and eight screens open, so a centred first column would sit
still and then walk four screens down the moment a reader opened it. The
reader sets that height, so that row stays top-aligned. One caller,
`getting-started.html`, "From a machine with nothing on it".

#### The gutter of a two-column prose row

`.pair-up` used to take half the frame per column and hold its prose at
`--measure-col` inside that. Above about 1600px the column outran the cap
and the difference came out as gutter &ndash; 137px between two paragraphs on
`figures.html`, which reads as two unrelated pages side by side. The cap
belongs on the row: two measures and a 3rem gutter is what the pattern
*is*, and what is left over stands at the frame's right edge, where the
page already leaves ground under every paragraph.

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

**Text is sized off `--fs-body`, never in `rem`.** `body` sets 19px and the
root element stays at the browser's 16px, so a size written in `rem` is
measured against a size no text on this page has, and every one of them came
out smaller than its number reads – a caption at 0.92rem is 14.7px, 77 % of
the prose beside it, and a gallery label at 0.82rem is 13.1px, 69 %. Nobody
chose those ratios. `index.html` carried five sizes of `p` and three of
`.lede` for that reason alone, and the client's word for the result was
*mickrig*.

Four steps, in `site.css` at the top: `--fs-body` for prose, `--fs-lead` one
step up for the sentence under a heading, `--fs-note` at 90 % for text that
belongs to a picture or a box rather than to the page (a cue, a caption, a
card, a table, the footer, every button label), `--fs-fine` at 80 % for a
label that is never a sentence. `--fs-code` is the sans scale read in mono.
Lengths stay in `rem`: raising the root would have fixed the ratios and
multiplied `--page`, `--measure`, every padding and every breakpoint by 1.19
with them.

Two things follow, and both are the reason a size change is not a one-line
change. **Bigger text in a fixed column is fewer characters a line**, so
`.beside` went from 21rem to 24rem and `.aside-code` from 20 to 23 – the
column is the adjustment, not the size; nothing on the site now sets prose at
under 45 characters. And **the window bar is not in the scale**: it is chrome
inside a picture, sized by what fits one line, the same category as the
topbar. The pair of shots on one stage now shares its grid rows, so a bar
that does wrap makes both bars that height and the two pictures still start
on one line – which German never did.

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

  It carries three things, and that it is one mechanism rather than three is
  the point – a second way of switching something would be a second thing for a
  reader to learn and a second thing to keep operable from a keyboard.
  **The three ways** on the front page are an argument in three moves, so its
  labels carry the judgement ("not ideal", "our approach") the prose used to
  make. **The cue-card sequence** on "In the room" is four frames of one
  window, one per press of the space bar, because what that mode does is move
  the cards and the projection together and a still cannot show a change. Its
  labels are paragraphs rather than headings: that page's headings are the
  anchors its two languages are linked by, and the twin gate counts them.
  **The two ways in**, under "Getting started" on the front page, is the one
  where the two halves are not the same kind of thing: the app is a window and
  photographs, the command line is a terminal and does not – there is no
  terminal for a screenshot script to point at, and a page built to impersonate
  one would buy a picture of text, which is exactly the file this site has just
  had to replace six of. So that half is the build's own output, set as a
  listing. Both panels are laid into one grid cell and hidden with
  `visibility`, so the row is as tall as the window and the listing is
  stretched to it; the measured heights and the breakpoint that keeps the
  window the taller half are in `site.css` beside the rule. The handout switch
  is the nearer relative in what it answers – one thing, two executions – and
  it could not be used: it swaps an `img` src.
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
