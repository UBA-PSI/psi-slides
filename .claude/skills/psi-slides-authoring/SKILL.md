---
name: psi-slides-authoring
description: Write or edit a psi-slides lecture source.md – chunk grammar (## type: Heading | Sub {.width #id}), the ::: directive vocabulary (expand, margin, marginalia, cols, cards, side/flip, slide, script, backdrop, overlay), reveal segments, speaker notes, image shorthand, KaTeX math, and the frontmatter keys (viewer defaults, cover variants, the style block, embedded fonts). Use when drafting a new lecture, restructuring or polishing an existing one, fixing lint findings from lint.js, or when a Markdown file has chunk headings like "## principle:" / "## definition:" or ":::" blocks. Not for changing build.js or lint.js themselves.
---

# Authoring psi-slides lectures

psi-slides turns one Markdown `source.md` into four self-contained HTML files:
`audience.html` (projection), `speaker.html` (presenter cockpit), `print.html`
(reading document), `print-notes.html` (document with the speaker notes folded
in). You never author four variants. You author one text, and mark which parts
of it belong on the screen.

Build and check:

```bash
node build.js path/to/source.md            # all four views, written next to the source
node build.js path/to/source.md --watch     # live reload while writing
node lint.js path/to/source.md              # static checks; --strict makes warnings exit 2
node build.js --new my-slug                 # scaffold lectures/my-slug/source.md
```

From a sibling content repo, call the engine by path: `node ../psi-slides/build.js lectures/<slug>/source.md`.

## Skeleton

```md
---
title: My Lecture Title
presenter: Prof. Dr. X
info: |
  Subtitle line
  Course line
  Term line
course: my-course
lecture: my-lecture
---

## title: {#title}

# Opening {#opening}

## principle: The claim the lecture explains {.standard #opening-claim}

**State it in the first sentence.** Then explain it in continuation prose.

> note: Speaker-only reminder for this chunk.

# Mechanics {#mechanics}

## example: A worked case {.wide #worked-case}

Body text.
```

## Grammar

### Frontmatter

`title`, `subtitle`, `presenter`, `affiliation`, `contact`, `notice` and `info`
render the title slide; the section on the cover below says what each rank is
for. `course` and `lecture` are metadata and worth keeping stable. Two further
blocks are optional and documented below: **viewer defaults** and **embedded
fonts**. A top-level key that is none of these is a lint warning
(`unknown-frontmatter-key`) rather than a build failure, so a lecture keeps
building, but nothing reads the key either.

The block is YAML, opened by a bare `---` (`---yaml` is accepted too). Any
other word after the opening dashes – `---js`, `---coffee`, `---json` – fails
the build and lints as `frontmatter-language`: the parser underneath would run
a `---js` block as a program on the machine that builds the deck.

### Columns

`# Column Heading {#column-id}` starts a column, the top-level horizontal unit
of the live deck. A chunk may appear before the first `#`; that is how the
`title` chunk is normally authored.

### Chunks

```
## type: Heading | quieter sub-heading {.width #id}
```

- `type:` is optional. Without one the whole line is the heading and the chunk
  renders and lints as `free`. A lowercase `word:` prefix that is *not* one of
  the eleven types is an `unknown-type` error, not a silent heading.
- `|` splits the heading into a main line and a typographically quieter second
  line. Further `|` segments are joined into that second line.
- The attribute tail recognises a width class, `#id`, and eight other classes.
  Four are the chunk's own: `.bare` (keep the heading in the document and off
  the projection), `.center` (set this chunk's heading, prose and footnotes
  on a centre axis, on the projection only) and the pair `.middle` / `.top`
  (keep what the slide paints at this beat on the frame's vertical middle,
  or at the top of the space the whole chunk will fill). The pair has no
  default: a slide that is one drawing and a `statement:` open centred, every
  other chunk opens at the top, and each word overrides that for one slide.
  Four answer a `style:` key for
  this one chunk and are spelled key-value: `.blocks-left` / `.blocks-center` (where a code block, a
  figure and a display formula sit across the measure) and `.wrap-none` /
  `.wrap-balance` (whether this chunk's headings are balanced and its prose
  gets a protected last line). Eleven more answer `style: {figure-type}` for
  this one chunk, `.figure-type-60` … `.figure-type-160` in steps of ten, on
  the projection only. Any other class is an `unknown class` error in both the
  build and `lint.js` – it is not silently ignored. Do not invent classes.
- **One sigil rule for every `{…}` tail in the format**, on a heading, on a
  `:::` directive and inside a `::: draw` block: `.word` is a setting, `#word`
  an id, and inside a draw body also `@word` a group and `!word` a removal.
  Braces hold sigil tokens only, and a line that has no sigil tokens to carry
  has no braces – which is why the `::: draw` opener is written
  `::: draw 150x56 autoplay 1200 cycle`, the one primary argument positional
  and everything optional that carries a value a keyword after it. A token
  without its sigil is a `stray-attribute` error, never silently dropped –
  `{wide #id}` once built without its width – and so is an empty `{}`.
  A chunk class that answers a `style:` key is spelled `key-value`
  (`.wrap-none`, `.blocks-center`), because it names the key it overrides; a
  directive's slot words are bare (`.outline`, `.middle`), because the
  directive has a vocabulary of its own. Settings that answer one question are exclusive: the
  width, each `style:` key, and every slot of `cards`, `rows`, `overlay`,
  `backdrop` and `side`. Two answers to one question are a `same-slot` error
  (`{.wide .full}`, `{.wrap-none .wrap-balance}`, `{.top .middle}`); a flag
  such as `.bare` is a slot too, one whose default is not written.
- Headings carry **inline** Markdown, so backticks render as a real code span
  (`## free: Loops | for, while, and \`enumerate\` {.standard #loops}`). Block
  Markdown does not belong in a heading.
- Every non-title chunk needs an `{#id}`, unique across the whole file.
  **IDs are frozen once authored**: they anchor cross-references, the TOC,
  speaker-sync snapshots, exported annotations, and `localStorage`. Renaming a
  heading is free; renaming an id is not.

Types (eleven, exhaustive) and what they mean in practice:

| Type | Use for | Word budget the linter enforces |
|---|---|---|
| `title` | the cover chunk, normally `## title: {#title}` | unlimited |
| `closing` | the last slide, drawn in the cover's composition with its own heading and body | 60 |
| `outline` | the running agenda – the lecture's parts, none live before the first one | 40 |
| `principle` | a claim, thesis, rule, takeaway | 80 |
| `statement` | a slide that is a few lines of large type and nothing else | 80 |
| `question` | a posed question or framing problem | 80 |
| `definition` | a precise concept or formal statement | 200 |
| `example` | a concrete walkthrough or applied case | 250 |
| `free` | ordinary narrative prose, transitions | 250 |
| `exercise` | a student task | 350 |
| `figure` | an image- or diagram-led chunk | unlimited |

When in doubt, `free`. And **a slide that is three lines of large type is a
`statement:`, not cards** – that is the whole of why the type exists.

`statement:` is the keynote slide the vocabulary had no word for. The heading
is the first line and every top-level paragraph in the body is another line
at the same size, the same weight and in the ink colour; there is no eyebrow
and no rule, in either view. A `---` between two paragraphs makes them arrive
one press apart, like any reveal segment. `{.center}` puts the run on a centre
axis, and on this type alone it moves the heading with the lines, because here
the heading is one of them. The collapse never abridges them: these paragraphs
are the slide, so nothing is derived from a first sentence.

```markdown
## statement: Nicht der Knall. {.wide #schluss}

Das Knirschen.

---

In keinem Diagramm steht, wozu das Ganze einmal da war.
```

**One paragraph in the run can be quiet, and italic is how you say so.** A
paragraph written *entirely* in `*italic*` – the asterisks around the whole of
it, nothing outside them – steps back on all three axes at once: half the size,
the body weight, the softer ink. It is the line that is not the utterance: the
definition a claim answers, the source under it, the qualification that arrives
one press later. Print carries the same two ranks. Everything else about the
chunk is unchanged, `---` between two paragraphs still being one press.

```markdown
## statement: Derselbe Umweg, der uns heute trägt, verbraucht das, was wir morgen bräuchten. {.wide #der-satz}

*Resilient: heute weiterarbeiten können, ohne die Fähigkeit zu verbrauchen, morgen anders zu arbeiten.*
```

**Entirely is the word that matters.** A statement line with one emphasised
word in it is a loud line with a stress mark, which is what `*em*` means
everywhere else in the format, and it stays loud. Before this register existed,
a thesis slide that wanted a quiet definition over a loud claim had to be a
`::: draw` of two `text` elements – a drawing, and it paid a drawing's price.

The two ways this used to be faked both cost something. `::: cards 1 {.large
.clear}` puts the words in the accent colour, because a card's term is a bold
and `style: {bold: …}` decides what a bold looks like, and sets them smaller
than a chunk heading. A `::: draw` of `.large` text buys the size and pays a
drawing's price: no wrapping, no hyphenation dictionary, nothing in the search
index, and a fixed grid to keep in step with the words.

**`figure:` turns the heading into a caption, so it is the wrong type for a
slide whose title should carry.** The live views set a `figure:` heading small,
in capitals, in the quiet ink – a label for the artwork, not a line the room
reads first – and a `::: footnote` on such a chunk sits under the picture,
where a source line belongs. A slide where the *title* stands over a drawing is
a `free:` chunk with the `::: draw` in its body: same picture, a heading at
full weight. `lint.js` also warns (`figure-type-without-figure`) when a
`figure:` chunk holds no artwork at all, because the overview board and the
cockpit read the type and the deck then reports more figures than it has.

`closing:` is the bookend and is the one exception to the rule that a
cover-shaped slide renders from frontmatter: its heading is what it says,
the sub-heading after the `|` is the second line, and the body is whatever
stays on screen while the audience asks questions. It draws the deck's own
`cover:` composition, carries **no** presenter line and **no** `info` block
- those would make it a copy of the title slide rather than an ending - and
never reaches for `cover-image` by itself. Two ways to give it a picture:
`closing-image: cover` in the frontmatter ends the deck on the picture it
opened with (any other value names a different one, in the same three forms
`cover-image` takes), which fills the composition's own picture slot on the
four covers that have one; a `::: backdrop` on the chunk is a full-bleed
ground behind the type and works on all ten. Put it last; the linter warns
if it is not.

```markdown
## closing: Questions? | office hours Thursday, 14-16 {#end}

Next week: certificates, and who you are actually trusting.
```

Widths (four, exhaustive): `.narrow` (28em), `.standard` (36em, the default),
`.wide` (52em), `.full` (72em). The slide's frame pads 14% either side, so on
the projection `.wide` stops at 1152 px at 1600×900; a `.full` chunk pads 6%
and reaches 1408 px, which is the one reason to pick it over `.wide`.

**The type never sets the width.** They are independent axes: the type decides
treatment and budget, the width decides how much stage the chunk takes. In
particular `principle` is not a narrow type – prefer `.standard` for it, because
anything longer than one sentence turns into a tall thin ribbon in `.narrow`.

**A chunk with a top-level code block wants `.wide` or `.full`.** A `<pre>` that
is not inside a `::: side` or `::: cols` breaks out of the text column to 72vw
and centres on the slide. Measured at 1600×900 and the default zoom, that is
1152 px – exactly the prose column of `.wide`, 310 px wider than `.standard`'s
842 px, and 256 px narrower than `.full`'s 1408, where a long listing stands
centred inside the prose. So in a `.standard` chunk the listing sticks out past both
edges of the paragraph above it and reads as a rendering fault. The line-length
budget is unaffected (it is 72vw at every width); this is about the block and
its own prose lining up.

**The line-length budget itself is about 78 characters**, and it is the same at
every chunk width for that same reason - a top-level block gets 72vw whether the
chunk is `.narrow` or `.full`. Inside one pane of a `::: side` the block stays in
its local container and the budget is about **36**. The number is measured
against the bundled JetBrains Mono at 0.60 em per character; `mono: Noto Sans
Mono Condensed` measures 0.50 and buys about **94**. It holds for any 16:9
window, because the base font is a fraction of the slide height.

Going over is not an error. `clampZoomToWidth()` shrinks **that one slide** so
the line still fits - never the lecturer's zoom, which is global and comes back
on the next chunk. So a heavily clamped chunk reads smaller than its neighbours,
and the fix is to break the line rather than to make the runtime try harder.

The live views do **not** print the type name on screen. Do not write prose that
depends on the audience seeing the word DEFINITION.

**The slide before and the slide after show through faintly, and that is
deliberate, not a rendering bug.** The audience view is one long board that a
camera pans across, and the dimmed neighbours are what make a column read as a
column; a screenshot of it looks like a leak until you have seen the pan. A
deck that wants a frame showing nothing but the slide – a keynote rather than a
lecture – writes `neighbours: hidden` in the frontmatter.

## What lands on the slide

The audience view starts collapsed (`data-collapse=topic-bold`); `C` toggles to
the full text. What “collapsed” means is decided per chunk, by three rules
checked in order:

1. The chunk has a `::: slide` block -> **only that block** is on screen.
2. The chunk has a `::: script` block -> **everything except that block** is on
   screen.
3. Neither -> **derived**: the first sentence of every paragraph, plus any
   `**bold**` fragments.

Rule 3 is the default and the right choice for most short, argument-shaped
chunks. Rules 1 and 2 exist because the derivation is a real writing constraint
that fights continuous prose. Mixing all three within one lecture is normal.

### Derived chunks (rule 3)

Every paragraph must open with a sentence that stands alone as a complete
claim. Continuation prose is print-only when collapsed; only `**bold**`
fragments survive as extra prompts.

```md
## definition: Public-key cryptography {.wide #public-key}

**Each party holds a key pair.** The private key never leaves the device; the
public key is freely distributed.

The signing operation binds a message to the private key. **Verification
succeeds only with the matching public key.**
```

Collapsed, the audience sees the two opening sentences plus the promoted bold
fragment. The squint test: heading + first sentences + bolds – could you
present the chunk cold from that alone?

Bold selects, it does not stress. How a bold phrase looks is a lecture-wide
setting – `style: {bold: …}` live, default `plain`; `style: {print-bold: …}` on
paper, default `bold` – and to stress one word inside a bold phrase you write
it `*em*`: upright, bold and in the accent in every view
(`**the check runs *before* any signature is requested**`). `*em*` outside a
bold phrase is the ordinary italic.

Bold sparingly. Each bold fragment becomes its own prompt, so a scatter of
one-word bolds collapses into cryptic stubs. See `reference/style.md` for the
full topic-sentence and bold audit, the recurring anti-patterns, and the prose
and typography rules.

### Explicit slide content (rules 1 and 2)

```md
## example: What the experiment showed {.wide #findings}

::: slide

- The tutor condition sits **below** both AI conditions
- The effect holds across all three cohorts

:::

The finding was the most unexpected observation of the experiment, and it does
not follow from the order of collection: the cohorts were rotated, and the gap
survives every rotation.
```

`::: script` is the dual – the chunk body is the slide and only the marked
block is narration, which is less typing when the chunk is already slide-shaped:

```md
## definition: Anonymity set {.standard #anon-set}

The anonymity set is the set of all senders who could plausibly have sent an
observed message.

::: script
Formally an equivalence class over the attacker's observation model, and the
model decides the size.
:::
```

Semantics worth knowing:

- **Nothing inside an explicit block is abridged.** Sentence extraction skips
  those subtrees, so paragraphs, lists, figures, and code render whole. You do
  not need to bold anything for it to survive.
- **Both blocks may appear in one chunk.** Rule 1 wins: the `::: slide` block
  is the screen, and the `::: script` block plus any loose prose are narration.
- **Print and the un-collapsed reading mode show both halves** in source order.
  Nothing you write is ever lost.
- **The lint density budget counts the on-screen half only** – the `::: slide`
  block if there is one, otherwise everything outside `::: script`. Narration
  is deliberately unbudgeted, so a density warning on an explicit-mode chunk is
  never a false alarm about your narration.
- **One block of each kind per chunk.** A second one lints as a warning.

Choosing:

| Situation | Use |
|---|---|
| Short claim or posed question, 1 to 3 paragraphs | derived |
| Chunk already reads as a tight bullet list | derived, or `::: script` for the narration |
| Long finding or walkthrough, prose-shaped argument | `::: slide` |
| Figure chunk plus a paragraph of interpretation | `::: script` around the interpretation |
| Collapsed view reads as cryptic one-word bullets | fewer bolds and a stronger opening sentence first; if it still resists, `::: slide` |

Migration rule for existing lectures: do nothing. Chunks without either block
behave exactly as before.

## Reveal segments

A line that is exactly `---` inside a chunk body, outside a code fence, is a
**reveal boundary**, never a horizontal rule. `Space` uncovers one segment at a
time in the audience view; print flattens them. Inside a fence, `---` is
literal. Use `***` if you genuinely need a rule.

```md
Start with the setup.

---

Then show the complication.
```

Use reveals for pacing, not per chunk. Over half the chunks using reveals
raises a `reveal-overuse` warning, and a chunk needing many reveals is usually
several chunks.

**A `---` as the first line of the body means the heading stands alone on the
opening beat.** It is how a question slide is written: the room reads the
question, you let it sit, and one press paints the answer.

```md
## question: How many people have to be away before this stops? {.wide #bus}

---

One. Perhaps two.
```

Count the clicks off the source: a chunk has as many presses as it has `---`
lines, and that holds whatever stands between two of them. **A segment with
nothing in it is a beat too**, and writing one is a real move: the slide stands
while you say the next thing, a `::: footnote` written under the `---` comes up
with it (the source line for the claim just made), a `::: backdrop`'s reveal
moves to its next place, an `::: overlay from N` or a `--- from N` arrives. An
aside is lifted off the text column, so a segment holding only one of them is
empty – and ships all the same.

The one shape the linter still names is `empty-beat`: a `---` whose segment
paints nothing *and* has nothing riding it – no aside written in it, no
`> note:` filed on it, no backdrop place for the beat, nothing held to it by
`from`. That is a press on which nothing whatever happens; give the beat its
content or take the `---` out. A `title:` or `closing:` chunk is the exception
to all of it: it wears a cover composition and has no reveal segments, so a
`---` there buys nothing.

### Beats below the top level

A `---` inside a `::: side` pane, a `::: cards` / `::: rows` block, a
`::: overlay` card or under a `# Heading` is the same beat counter, one level
down: it does not split the chunk (a block cannot straddle two segments) but
holds back everything that follows it *inside that block* until its beat. The
counter runs in source order over the whole slide, so this

```md
::: side
Left, first paragraph.

---

Left, second paragraph.
::: flip

---

Right, first paragraph.

---

Right, second paragraph.
:::

---

::: cards 3
- one
- two

---

- three
:::
```

walks left one, left two, right one, right two, cards one and two, card three –
six beats, top-level and nested mixed, each in the place it was written. A
beat **keeps its place from beat 0**, wherever it sits: the chunk, the pane,
the row or the card is laid out at its final height and the words fade in
where they were always going to be, so the slide does not jump on a press.
Up to this change only a nested beat did that and a top-level one closed up,
which is why `style: {reveal: hold}` existed; there is one rule now and the
key is refused. A `---`
as the first line of a pane holds the whole pane back. In an `::: overlay from N`
the inner beats count from `N`: the card on `N`, its second block on `N + 1`.

**`--- from N` pins a beat to an advance by number**, the way `::: overlay … from N`
and `> note: from N` do. Order is otherwise the order you wrote things in, and
that is wrong for exactly one shape: two things that should arrive together,
written in two places. A stepped `::: draw` in one pane of a `::: side` and the
prose about it in the other cannot advance together – the figure's steps come
first and the prose queues behind them – so the prose is pinned to the beats
the figure already has:

```md
::: side
::: draw 120x40
box a "A" at 0,0
step one
  emph a
:::
::: flip
What the picture shows at rest.

--- from 1

What the first step does to it.
:::
```

A pinned beat **rides** a beat the slide already has rather than adding one, so
that chunk takes one press per step rather than one per step plus one per
paragraph. `from 0` is refused – that is the beat the slide opens on, so write
the words above the marker. A `from` inside an `::: overlay from N` or a
`::: dock from N` is refused too: a block held to a beat numbers its own
markers already. The linter warns (`reveal-from-beyond`) when the number is
more than one past the last beat the chunk has to ride.
Print shows every beat at once. An `::: expand` and a `::: script` keep the
horizontal rule – neither is on the projection, so neither has beats to give.
A `---` inside a `::: dock {.every}` is refused: the dock is on every slide of
the part, and a beat is one slide's.
Under a `# Heading` a `---` used to render a rule in the divider and the printed
lede; it is a beat now, and `***` is the spelling of a rule there.

## Speaker notes

```md
> note: Pause here.
> Tie the later examples back to this sentence.
```

`> note:` opens the block; later `> ` lines continue it; the block ends at the
first non-blockquote line. A second `> note:` starts a **new** note, so never
prefix continuation lines. Notes appear in the cockpit and in
`print-notes.html`, never in the audience view or `print.html`. A note written
before the very first heading attaches to the next chunk.

**A note under a `# Heading`, before the first `##`, is the divider's own.**
The divider is a slide you talk on – it is where the room is told what the
part is for – so its notes are its own rather than the first chunk's. A
divider has no reveal segments, so every block there is a card on the beat it
opens with; `> note: from N` names a later one where the divider's body
carries a `---`.

Notes are the right home for reminders, caveats, timing, demo fallbacks, and
anything you say aloud but would not project.

### Notes as cue cards

The cockpit can show the notes as **cue cards** (`K`): a column of cards for
the active slide, the projection small in the corner, and Space walks the
cards before it walks the reveals. Write the notes so that reads well from
the corner of an eye:

- **A paragraph is a card, its bold phrases are the bullets.** The rest of
  the paragraph is dropped on the card (it stays in `print-notes.html`), so
  bold the words you want to see, not the words you want to stress. A
  paragraph with no bold shows whole, in smaller type.
- **A list is a card with its items as bullets**, as written.
- **`#### Title`** above a paragraph titles the card.
- **`@12:30`** – alone on a line above a paragraph, or at its start – is when
  the card should be reached, counted from the start of the talk. The
  cockpit shows the drift beside the clock (`+0:40` behind, `−0:20` ahead).
- **The cards can be scaled** with the two buttons in the cockpit header, so
  write for the wording rather than for a size.
- **Where the note stands is when it is said.** A note before the first
  `---` belongs to the beat the slide opens on, a note after it to the beat
  that `---` opens. Only a top-level `---` counts; a `---` inside a pane or a
  card row is a beat marker, not a segment. A chunk whose notes all sit
  after the last segment that has words in it (the way every deck was
  written before this) shows them all on the first beat, so nothing you have
  written moves – a trailing `---` behind them, holding the slide while you
  say the next thing, does not move them either. A note written *alone*
  under a `---`, with no words in that segment, is the one you said on that
  beat, and it is shown there.

```md
## free: The process as it runs {#process}

**Request → time sheet → ~~approval: supervisor~~**

> note: It is **not the system**.
>
> **First click**: the supervisor cannot log in.

---

↳ **a mail to Ms K. → approval by HR**

> note: #### Second click
> @4:00 The secretary **mails Ms K.**, who approves with **HR's rights**.
```

A note standing alone behind a `---`, with no slide text after it, is a
supported shape rather than a warning: the press happens, the slide does not
change, and the card is what you say over it. The linter used to report it as
`note-in-empty-beat`, back when the build dropped that segment and the card
slid a beat forward; it does not any more, because the segment ships (see
*Reveal segments*).

**`> note: from N` pins a note to an advance by number**, and it is what a
chunk whose beats are a figure's steps needs: a `::: draw` block's `step`
blocks are beats on the same counter, but they all sit inside one segment,
so no `---` can be written between two of them. The number counts presses on
this slide the way `::: overlay from N` counts them – `from 1` is said after
the first press, `from 3` after the third – and a note with no `from` keeps
the position rule. The line carries nothing but the number:

```md
## figure: The process as it runs {.wide #process}

::: draw 132x54
box antrag "Request" at 0,0
box gen "Approval: supervisor" right of antrag gap 0.5
edge antrag -> gen

step locked
  dim gen
step around
  show mail
:::

> note: It is **not the system**.

> note: from 1
> **First click**: the supervisor **cannot log in**.

> note: from 2
> **Second click: Ms K.** She approves with **HR's own rights**.
```

The linter warns `note-from-beyond` when the number is past the chunk's last
beat: the card would be filed on a press the slide never takes.

**A `[Klick: …]` line inside a note is a press**, and it is the other way to
say the same thing – the one for a talk written out word for word, where the
stage directions are in the prose already and counting them out into `from N`
would mean numbering every block by hand. A paragraph (or a line at a
paragraph's head) that is a bracketed direction whose first word is `Klick`,
`Click` or a bare `>` ends the card and files everything behind it one advance
later. The words behind the direction's first colon title the card it brings
up, unless a `####` heading stands nearer to that card.

```md
> note: #### The plan
> The call for papers describes a resilient university in **three verbs**.
>
> [Klick: line 1 lights.]
>
> **Three questions, one per verb, and two cases.**
>
> [Pause. Wait for the laugh.]
>
> [Klick: line 2 lights.]
>
> I reported it. **Why did five years of knowing produce no fix?**
```

Three things follow from that, and each is a decision rather than an accident:

- **Any other bracketed line is a stage direction and costs no press.**
  `[Pause.]`, `[Dry, not pointed.]`, `[Wait for the laugh.]` stay as written,
  in small italics, but on a card rather than as one: a paragraph that is
  only a direction rides the card before it – a pause after words – and
  leads the card after it where there is none on the same advance (a note
  that opens with one, or one written just behind a `[Klick …]`). One at the
  head or foot of a paragraph belongs to that paragraph's card. Only the
  three words above count as a press, and the first word has to *be* one of
  them – `[Klicken Sie auf den Link]` is prose.
- **The word list is fixed, not localised by `lang:`.** The cards are derived
  again in the browser when you rewrite a note in the cockpit's textarea
  during a rehearsal, where the lecture's wording table is not in reach; `>`
  is the spelling for every language the list has no word for.
- **`from N` still wins, and the clicks count from it.** A block written
  `> note: from 2` with one `[Klick]` line in it says its second half on
  advance 3.

The linter warns `note-advance-beyond` when a block asks for more advances
than the slide takes – every card past the last beat is shown on it together,
which is not what the clicks were written for. It counts a divider's blocks
too, because a divider's beats are its figure's steps and a talk of this shape
puts most of its clicks there.

## Images

```md
![](diagram-name)            # shorthand: assets/diagram-name.{svg,png,jpg,jpeg,gif,webp}
![Alt text](assets/pic.png)  # explicit path also works
```

The shorthand resolves a bare target with no slash and no extension against the
lecture's `assets/` folder, first match wins; a missing file renders a visible
placeholder.

**A picture is read from the lecture's folder or the folder one level up, and
from nowhere else.** `![](../shared/assets/logo.png)` works – a set of
lectures side by side can share a folder of pictures – and
`![](../../photos/x.png)` fails the build, naming the folder it may read from.
A symbolic link counts as the file it points to, so a link in `assets/` that
leads out of that folder fails the same way. The rule covers every way a deck
names a file: `![](…)`, a `::: draw` `image`, a `::: backdrop`,
`cover-image:`, `closing-image:`, a clip and a face in `fonts/`. It is what
keeps a deck someone sent you from copying a file from elsewhere on your
machine into its output; the linter reports it as `asset-outside-root`. A path
starting with `/` or a URL is not read at all and is not affected.

In a `figure` chunk the heading is already the caption, and alt text becomes a
`<figcaption>` stacked under it – three labels in a pile. Prefer `![](fig-id)`
there unless you really want the separate caption (`figure-caption-redundant`
warns about this).

Assets are inlined into the outputs by default (auto-inline while the total is
under 10 MB). **A single asset over 2 MB fails the build**, because the
alternative is an HTML file that looks right on your machine and shows a broken
figure everywhere it travels. Fix it by format first, and by resolution only
where format is not enough:

```bash
node build.js <source.md> --optimize-images --dry-run   # report, write nothing
node build.js <source.md> --optimize-images              # convert rasters >= 512 KB to WebP q92 in place
node build.js <source.md> --optimize-images --max-width 1920   # …and cap every width
```

Needs `cwebp` or `magick` on `PATH`. It sees a picture however you named it –
`![](path)`, `![](fig-id)`, a `::: draw` `image` statement, a `::: backdrop`,
`cover-image:` or `closing-image:`. Shorthand refs need no edit afterwards;
explicit paths in `source.md` are rewritten for you, in the frontmatter and on
a directive line too, and a path inside a code fence is left alone. It only
converts files inside the lecture's own folder: a shared picture one level up
is listed as skipped, because another lecture may name it by its path. SVG is
never touched: it is spliced inline as a real `<svg>` element so it inherits
the theme colours. `--no-inline-images` is the escape hatch that ships external
paths on purpose.

A photograph that WebP q92 alone does not bring under the 2 MB cap is
**downscaled to 2560 px wide and re-encoded**, and the report says so per
asset. If it is still over after that, the report names the size and the
`--max-width N` worth trying next; a `.webp` already over the cap is re-encoded
onto itself the same way.

## Math

`$inline$` and `$$display$$` render with KaTeX at build time. No flag, no
runtime loader; the required font faces are inlined only into views that
actually contain a formula.

```md
The collision bound is $O(\sqrt{n})$ for a birthday attack.

$$
\Pr[\text{collision}] \approx 1 - e^{-k^2 / 2N}
$$
```

Rules that matter while authoring:

- A literal dollar is `\$`. That escape is what keeps a price list out of math
  mode.
- The inline rule refuses to cross a backtick or a newline, so a `$` in prose
  cannot pair with one inside a code span. Keep it that way: do not try to
  write an inline formula that spans lines.
- `$$ ... $$` must be closed. An unclosed one raises `unclosed-math`.
- This is KaTeX, not LaTeX: no equation numbering or `\ref`, no `mhchem`, no
  TikZ. Check KaTeX's supported-functions list before committing a
  mathematics-heavy lecture.

## Code fences

Fenced blocks are highlighted at build time by Shiki, and reveal parsing is
fence-aware. Use a language label (`python`, `bash`, `javascript`,
`typescript`, `html`, `css`, `c`, `json`, `yaml`, `markdown`, `sql`, `toml`,
`diff`, `text` are all in use). An unknown label is not an authoring decision
to make on your own: adding a language means editing `SHIKI_LANGS` in
`build.js`.

## Directive vocabulary

Two kinds of `:::` block exist. **Chunk-attached asides** (`expand`, `margin`)
are lifted out of the body; **layout wrappers** (`cols`, `side`/`flip`,
`marginalia`, `slide`, `script`) stay inline in the body. A bare `:::` closes
the innermost open layout wrapper, and if none is open, the enclosing `expand`
or `margin`.

### `::: expand <label>`

```md
::: expand backup-plan
If the demo fails, switch to the recording and keep narrating the same fields.
:::
```

Clickable expansion in the live views (`Enter` or `1`-`9` opens one), inlined
in print. The label is what the UI shows. The first sentence inside an
expansion is subject to the same collapse derivation, so it should stand alone
too.

### `::: footnote`

```md
::: footnote
Short supplementary context that should stay visually secondary.
:::
```

A quieter always-visible note attached to the chunk, set under the body with a
small NOTE label over a dotted rule. Use for short context, not a second
argument. It stays in the middle column, has nothing to click, and takes no
label of its own – that is the whole of the difference from `::: marginalia`,
which goes out into the slide margin and *is* clickable. On a `figure:` chunk
it sits under the artwork.

**A footnote written after a `---` arrives with that segment**, so a citation
can come in with the sentence it supports rather than standing on the slide
from the first beat. It rides the segment and adds no press of its own; before
the first `---`, or in a chunk with no `---`, it is on the slide from the
start, as it always was. Print shows every footnote at once either way. On
a `.center` chunk it is centred with the prose; on the projection it never
hyphenates, and `style: {labels: off}` takes its NOTE eyebrow off there (print
keeps it).

```md
## definition: Loose coupling {.standard #loose}

---

Units that work largely independently of one another.

::: footnote
Weick, Educational Organizations as Loosely Coupled Systems, ASQ 1976
:::
```

`::: margin` is the older spelling and still builds, so no existing
`source.md` breaks. Do not write it in anything new: it was one keystroke from
`::: marginalia`, a different construct in a different place, and it named the
one place the block never sits.

### `::: cols 2` / `::: cols 3`

A multi-column flow inside the chunk body. **The audience view's default
collapse mode folds it back to one column, so on the projection `::: cols` does
nothing.** That is deliberate: collapsed content is one topic sentence per
paragraph, and the browser can only balance in whole paragraphs, so two columns
of stubs look broken. But it makes `cols` a **print-and-reading-mode
construct**, and the consequence is worth stating in the audience's terms rather
than the renderer's: content you write in `cols` because it is too long for one
column arrives on the projection as one column of exactly that length. A
six-definition quiz written as `::: cols 2` was projected as eleven unbroken
lines of 70-character prose.

**For two- or three-up content the audience has to read, use `::: cards` or
`::: rows`.** Both survive the collapse in full. Author `cols` for a handout
whose reader can scroll.

### `::: side` with `::: flip`

```md
::: side
**Device-bound**

Private key stays on one token.
::: flip
**Synced**

Private key travels across the user's devices.
:::
```

Two panes: everything before `::: flip` is pane A, everything after is pane B.
`::: flip` only means anything inside an open `::: side`.

`::: side 2:1` divides the measure unevenly. `::: side {.middle}` centres the
shorter pane against the taller one, which is what two lines of prose beside a
tall figure want - without it the prose sits at the top and the rest of its
half is empty. Both may be written, ratio first: `::: side 2:1 {.middle}`. The
default is `{.top}`, which is what a bare `::: side` has always drawn, and it is
often the right one: a caption above a figure is aligned from the top on
purpose. It is the block's setting rather than each pane's, because the taller
pane is what makes the row tall and centring cannot move it.

### `::: marginalia`

An aside that extends into the right margin, part of the body layout
vocabulary rather than the expansion system, and separately focusable in the
live views.

The slide itself is framed as if the aside were not there, so the aside runs
off the right edge of the frame and is cut off by it – that is what tells a
reader there is more of it. Clicking it slides the frame right until all of
it is on screen; `Esc`, or a click on the slide, gives the frame back. So
write it to be read *after* the slide, not with it, and keep it short: a
marginalia shares the chunk's height and cannot grow taller than it.

### `::: slide` / `::: script`

Covered above. In directive terms they behave like the other layout wrappers:
they nest inside `::: cols` or `::: side`, they work inside an `expand` or
`margin`, and a bare `:::` closes them.

### Nesting

The directives combine, but not freely: each one is either a *wrapper* whose
body stays in the chunk (`cols`, `side`, `marginalia`, `embed`, `slide`,
`script`), a *captured block* whose body is taken out of it (`expand`,
`footnote`, `overlay`, `cards`, `rows`, `draw`), or a one-liner that belongs
to the slide wherever it stands (`backdrop`). What may open inside what
follows from that, and the build refuses the rest – every refusal below
was a slide that rendered wrong with exit 0 before it was one.

| inside …                    | may hold                                   | refused                                                  |
|-----------------------------|--------------------------------------------|----------------------------------------------------------|
| `expand` / `footnote`       | any wrapper, `draw`, prose                 | another aside, `overlay`, `cards` / `rows`               |
| `overlay`                   | prose, lists, an image, `draw`             | every other directive (`directive-in-overlay`, `cards-nested`) |
| `cards` / `rows`            | prose, lists, an image – per item; `draw` as a card of its own | every other directive (`directive-in-cards`) |
| `embed`                     | the caption's prose                        | every directive (`directive-in-embed`, `cards-nested`)   |
| `cols`                      | prose, `marginalia`, `slide` / `script`    | `draw`, `side`, `cards` / `rows` – a grid breaks the flow |
| `side` (either pane)        | prose, `draw`, `cards` / `rows`, `cols`    | a second `flip`                                          |
| `slide` / `script`          | any wrapper, `draw`, `cards` / `rows`      | `slide` or `script` again (`explicit-nested`)            |
| `dock`                      | prose, lists, an image, `draw`, `---`      | every other directive (`directive-in-dock`, `cards-nested`) |
| any wrapper                 | a `---` (a beat below the top level, see *Reveal segments*) | `expand`, `footnote`, `overlay`, `dock` (`aside-in-layout`, `overlay-in-layout`, `dock-in-layout`) |
| a column heading (divider)  | prose, `backdrop`, `draw`, `cards` / `rows`, `overlay`, `dock`, `---`, `> note:` | everything else (`stray-directive`)          |

`draw` is the one construct meant to go nearly everywhere – a pane, a card, an
overlay card over a photograph, an expansion, a divider – because a figure is
what makes a frame a design rather than a text column. The two places it does
not go are a text flow (`cols`) and a caption (`embed`). A figure with steps
inside an `overlay from N` walks them after the body's own beats, in document
order; a `---` inside the overlay counts from `N` instead (the card on `N`, its
second block on `N + 1`).

The last row is the one that bites: an aside or an overlay is folded under
or laid over the *whole* chunk, so a place inside a block means nothing for
it, and its closing `:::` would end the block instead. Write it after the
block's closer.

```md
::: expand compare
::: side
Left
::: flip
Right
:::
:::
```

The first closer ends `side`, the second ends `expand`.

Four combinations build and still earn a warning, because the slide is not
the one the author pictured: a `::: side` with no `flip` (`side-without-flip`,
one pane at half width), `cols` inside `cols` (`cols-in-cols`), a `::: slide`
or `::: script` inside one pane (`explicit-in-side` – the collapse hides the
other pane and keeps its track), and two `::: marginalia` on one chunk
(`duplicate-marginalia` – both anchor at the top of the margin and overlap).
Two more are about numbers: `layout-too-narrow` when the chunk's measure,
divided by every open `cols`, `cards` and `side` pane, leaves a track under
10em (six cards in a wide chunk, three columns in a narrow one), and
`overlay-from-beyond` when `from N` is past the chunk's last beat plus one,
which the projector answers with empty advances before the card arrives.

### `::: cards N`

N equal cards in a row, each on a subtle ground. **Not a second spelling of
`::: cols N`**, and the difference is the reason to pick one: `cols` is one
text flow the browser balances across N tracks, so a paragraph can spill from
the foot of one column into the head of the next; `cards` is N *containers*,
and an item is whole or it is nowhere.

```markdown
::: cards 3
- **Measure** what a page does when a crawler asks for it
- **Probe** the detector until it names itself
- **Report** what that costs a measurement study
:::
```

A lone list dissolves into the grid, so its items are the cards; anything else
contributes one card per block. Counts 1 to 6 - one card is a callout, and in
a `::: side` pane it is the narrow stacked column. Use `cols` for an argument
that runs long and `cards` for a comparison the audience should be able to count.

Seven slots in the tail, and two decide themselves:

| slot | words (first is the default) |
|---|---|
| size | `.auto` `.large` `.medium` `.small` |
| align | `.auto` `.left` `.center` |
| anchor | `.top` `.middle` `.baseline` (a `::: rows` word, refused on a card) |
| detail | `.fold` `.show` `.page` |
| ground | `.panel` `.outline` `.clear` `.accent` `.paper` `.photo` |
| corner | `.round` `.square` |
| scrim | `.veil` `.invert` `.plain` |

`auto` size counts the words in the longest item - three or fewer is large,
twelve or fewer medium, else small - and applies to the whole row, never per
card. `auto` align follows it, except where the row has a second level, which
ranges left.

`detail: fold` keeps nested levels off the projection and gives them to the
document and to `C`. `detail: page` never unfolds at all, and that is what to
reach for when the second level is a *paragraph*: unfolding one of those in
place wrecks the row, so it stays the hand-out's.

`ground: photo` makes the card's first picture its ground, and `scrim` says
what veils it - `veil` is the theme's own paper, so ordinary ink stays legible
in every theme; `invert` darkens and turns the card's ink light; `plain`
leaves the picture alone. A scrim on a row with no picture is an error. A
picture that is *not* the ground bleeds to the card's edges with the text
beneath it, which is the other useful shape.

**Open a card with bold and the break decides what it means:**

```markdown
- **panel** a tinted fill…      lead-in - own line, ordinary leading
- **Measure**\                  heading - own line, and air under it
  what the page does
```

**A card row is refused inside `cols`, `marginalia`, `expand`, `margin` and
`overlay`** - it needs the whole measure and those have already divided it.
`::: side` is fine, because a pane is a container with a width the row can
fill, and so are `slide` and `script`, which divide nothing.

### `::: rows`

The same container turned ninety degrees: a term in a card on the left, its
body beside it, several stacked. Same slots as `::: cards`, no count - a row
block has one column by definition.

```markdown
::: rows {.accent}
- **Separatism** Engineers do the technical work; managers take the decisions.
- **Technocracy** Engineers should take them, because they understand them.
:::
```

Three defaults differ from a card row. `anchor` follows the ground: on a fill,
an outline, the accent or paper the term is a visible slab, and a one-line slab
against a three-line body's first line reads as a mistake, so the default is
`middle`; under `.clear` there is no slab and no padding, so the term is bare
words in a column and the default is `baseline`, the hanging indent a term and
its definition have always been set as. `align` names how the term sits *in its
card* and the body ranges left. And the automatic size is capped at `medium`,
because a term is a label in a column rather than a headline across the slide.

`.baseline` is the anchor word a row adds, and writing it on a `::: cards`
block is an error (`cards-baseline-no-body`): it lines a term up with the body
beside it, and a card has no body beside it.

Reach for `rows` when a term needs a sentence, and for `cards` when a
comparison needs counting.

**Bold is not required.** The sentence splitter walks paragraphs, never list
items, so everything written in a card is on the slide; folding the nested
level is the only thing that takes anything away.

### `::: backdrop <ref> {…}` and `::: overlay {…}` – `::: backdrop dusk {.cover .invert}`, `::: overlay {.bottom-left .ink}`

A full-bleed picture behind the whole slide, and a grounded text block laid over
it. The backdrop is one line with no closer; the overlay is a block.

```markdown
## figure: {#skyline .full}

::: backdrop city-at-night {.invert .blur}

::: overlay {.bottom-left .ink .wide}
### Every endpoint is a sensor
A crawler that looks like a browser gets measured back.
:::
```

The backdrop takes the same three forms an image does - a bare asset id, a
relative path, an https URL. Both class tails are **closed vocabularies, one
word per slot**; two words from one slot fails the build, as does a word from
no slot.

**`reveal` is how a photograph arrives on a press.** After the tail, name one
place per beat – a band against an edge (`left 45%`, `bottom 30%`), the whole
slide (`full`), or nothing (`none`) – and the picture's window opens or closes
between them. `reveal none, full` is the plain case: a slide that opens on its
words and takes the picture on the first press. Turn it round,
`reveal full, none`, and the picture retreats to free the paper the words are
written on. Two places at least; one is refused, being a static crop written
the long way. Place *i* is simply what the slide looks like at beat *i*: the
list **rides** the chunk's beats rather than adding to them, and only a chunk
with fewer beats than places – a title slide, typically – gains presses from it.

```markdown
::: backdrop harbour {.cover .invert} reveal none, full
```

| directive | slot | members (first is the default) |
|---|---|---|
| `backdrop` | fill | `.cover` `.contain` |
| | crop | `.middle` `.top` `.bottom` |
| | scrim | `.veil` `.clear` `.invert` |
| | focus | `.sharp` `.blur` |
| `overlay` | place | `.center` `.top-left` `.top` `.top-right` `.left` `.right` `.bottom-left` `.bottom` `.bottom-right` |
| | ground | `.paper` `.ink` `.accent` `.clear` `.glass` |
| | width | `.standard` `.narrow` `.wide` `.full` |
| | shape | `.card` `.panel` |
| | height | `.snug` `.third` `.half` (top / bottom panels only) |

**`.panel` is the card grown to the frame** – the composition a photograph
with a text area wants: `{.left .glass .panel}` is a column the full height
of the slide, the picture blurred behind the words and vivid beside them;
`{.bottom .ink .panel}` a band across the bottom, edge to edge; `{.center
.glass .panel}` the whole frame veiled with the words in the middle. The width
word is the column's width (`left` / `right`) or the text measure inside the
band; `.third` / `.half` give a band that share of the slide's height, with the
words centred in it (a column centres its words in the slide's height as it
is); a corner place is refused, since a panel runs along one edge. Write the
backdrop `{.cover .clear}` with a panel – the default `veil` washes the whole
picture, and the panel's own ground is what sets the words off. A panel held
to a beat slides in from its edge.

```markdown
## figure: {#lock .full .bare}

::: backdrop lock {.cover .clear}

::: overlay {.left .glass .panel .narrow}
## The weakest link
**A column the full height of the slide.** The picture stays vivid outside it.
:::
```

`veil` is the theme's own paper at 80%, so ordinary ink stays readable over a
photograph in every theme; `invert` turns the slide's ink light instead. Give a
photograph-backed slide its text in an **overlay** rather than in the body:
words laid straight onto a picture are unreadable at the back of a room, and the
overlay's ground is what fixes that.

One backdrop per chunk. A second is an error.

### `::: dock {…} from N` – `::: dock {.left .every}`

An overlay lies over the slide; a dock is part of the frame, and the text
yields to it. A `left` or `right` dock is a column the full height of the
slide and the text column narrows beside it; a `top` or `bottom` dock is a band
across the whole width, the text above or below it. Same grounds and beat as
the overlay, one dock per slide.

```markdown
# Fuzzing {#fuzz}

::: dock {.left .every}
- [Introduction](#intro)
- [Mutations](#mut)
- [Coverage](#cov)
:::

## free: Introduction {#intro}
…
```

Three uses, and they are the reason it exists:

- **A running table of contents.** Written under the `#` heading with `.every`,
  the dock is on every chunk of the part. Each item is a link to a chunk's
  `{#id}` (or a column's), and the item the room is on lights up – `done`,
  `now`, `next`, like `section: outline`. A link to an id nothing carries is a
  build error. **Its scope is one part, not the whole deck** – for a nav that
  runs through every part, repeat the same block under each `#` heading (the
  live marker stays correct on its own, because it reads the `#id` links, not
  where the dock sits). For a genuinely deck-wide running agenda, reach for
  `section: outline` or the `## outline:` chunk instead; `.every` is a
  part-level nav.
- **A line that stays.** `::: dock {.bottom .accent .third}` on one chunk is a
  band a third of the slide high under the words – a definition or a rule the
  slide keeps in view. An own dock replaces an inherited one for that slide.
- **A remark that arrives.** `::: dock {.right .glass} from 2` wipes in on the
  second beat; the text column has been narrow from the start, so nothing
  moves when it comes.

| slot   | members (first is the default)                  |
|--------|-------------------------------------------------|
| edge   | `.left` `.right` `.top` `.bottom`               |
| ground | `.tint` `.paper` `.ink` `.accent` `.clear` `.glass` – `tint` is the card row's panel tint, and the default: on the slide's own paper a `paper` dock has no edge |
| width  | `.narrow` `.standard` `.wide` (a column's width, a band's text measure) |
| height | `.snug` `.third` `.half` (bands only)           |
| scope  | `.once` `.every` (`.every` only under a `#` heading) |

The body holds prose, a list, an image, a `::: draw` and a `---`; no other
directive. `.every` takes no `from` and no `---`: an inherited dock is on every
slide from the moment each opens, and a beat is one slide's. A `::: marginalia`
cannot share a slide with a right dock, which occupies the margin it extends
into. `--squint` writes a dock as `[ dock · left · tint · w-narrow` (plus
`· inherited`). In print an own dock is a box after the chunk's text, an
inherited one prints once, at the divider.

### Two more directives this skill does not cover

`::: draw` and `::: embed` are also `:::` blocks, and neither is a layout
wrapper or an aside: each compiles to something of its own.

- **`::: draw`** takes `autoplay N` - N milliseconds per step - which walks
  the figure's own beats once the slide is on screen, and the first key, click
  or scroll *on that slide* retires the clock for it. (Scoped to the slide, not
  to the session: you reach a slide by pressing a key, so a session-wide flag
  meant the arrival keypress killed the figure before it was on screen.) Between 200 and 60000. Add `cycle` to repeat the
  walk (`autoplay 1200 cycle`); `cycle` alone is an error. Use it on a cover
  figure; on a slide you are talking over, press Space.
- **`::: draw`** is a figure written as text - named boxes, arrows,
  containers, charts, tables, swimlanes and sequence diagrams, laid out at build
  time and steppable on the same key that advances a reveal segment. It has its
  own grammar, twenty statements and forty-two classes, and two documents:
  `figure-design.md` for how to lay one out so a room can read it, and the
  `#diagram` chunks of `lectures/tutorial/source.md` for the vocabulary. Read one
  of those before writing a block; do not guess at the syntax from a nearby
  example. Two of those statements are the ones authors pick the wrong one of:
  `lanes` puts who down the side and lets the reading direction carry the time,
  `sequence` puts who across the top and makes the vertical axis the time
  itself - steps parcelled out to the people responsible for them is the first,
  messages passing between them is the second. An element is placed either
  absolutely, `at 12,4`, or against another one, `right of a gap 1`; the two
  take different options, and `flush` - which edge of the reference the new
  element lines up with - is only legal on the relational form. `at 12,4 flush
  left` is refused as an unexpected token, because there is no reference to be
  flush with: move the element, or place it off the one you meant. The whole
  vocabulary is in the `psi-slides-figures` skill.
- **`::: embed <url>`** frames a hosted player, YouTube or Vimeo. It is the one
  construct that makes an output fetch from a third party while the lecture is
  being given, so reach for it only when a local clip - `![](clip-id)` - will
  not do.

Neither is in a tagged release yet. A lecture using them builds from this
repository and not against a released psi-slides.

## Viewer defaults in frontmatter

Eleven optional keys pin how the lecture opens. A key that is present wins over
the reader's stored preference; a key that is absent leaves that preference
alone. A value outside the allowed set fails the build (and lints as
`unknown-view-default`), because a typo here is otherwise silent.

```yaml
font: serif            # serif | sans | mono
theme: light-red       # light-red | light-teal | light-blue | light-orange | dark | terminal-amber | terminal-green
collapse: topic-bold   # topic-bold | none
auto-fit: shrink       # true | false | shrink
slide-numbers: horizontal    # vertical | horizontal | off   (default: horizontal)
print-slide-numbers: vertical  # the same three, for print.html and print-notes.html
                               # left out, it follows slide-numbers
editor: speaker        # both | speaker | none  - where the diagram editor ships
note-button: off       # on | off  - the + note button in the slide's left gutter
neighbours: hidden     # dim | hidden  - the slide before and after, faintly or not at all
transition: cut        # pan | cut | fade  - what a slide change looks like
reader: off            # on | off  - contents sidebar and highlights in print.html / print-notes.html
```

`note-button`, `neighbours` and `transition` are what a keynote sets and a lecture does not. `note-button: off`
takes the `+ note` hint out of the gutter without taking anything away - `N`
still opens an annotation, and `M` shows or hides the hint at any time, in
either window. `neighbours: hidden` takes the faint slide above and below off
the projection; the default is on purpose (see *What lands on the slide*).
`transition: cut` lands on the next slide with no camera glide and `fade` dips
through the paper; both hide the neighbours unless you also write
`neighbours: dim`. A reveal, a figure step and the walk down a tall chunk keep
their motion under all three – only the change of slide is affected.

`reader:` is about the two documents rather than the projection. Left at `on`,
a reader who opens `print.html` on a screen gets a contents sidebar that marks
the slide they are in, and can highlight words, code, a formula or a figure,
keep a note on each, step through them with `n` / `p`, and export them to a
Markdown file. The highlights stay in the reader's browser, filed under the
lecture's folder name, and print yellow with their notes in the margin. `off`
ships the plain document; the lightbox stays either way. Nothing here asks
anything of the source – but a renamed `{#id}` leaves every highlight on that
slide unplaced (listed at the sidebar's foot, not lost), one more reason ids
are frozen.

`auto-fit: shrink` is the mode to reach for first: it leaves the zoom where the
lecturer set it and only ever makes a slide smaller, where `true` also grows a
short one to fill the screen. `#` cycles off → shrink → on.

Pin only what you have actually designed for. A lecture that pins nothing keeps
following whatever the reader last chose with `F`, `A`, `C`, `#` and `L`.

Two keys the presenter needs have no frontmatter key, because they are about
the room rather than the lecture. `W` puts the projection into fullscreen; from
the cockpit it arms the projection, and the next click on that window enters,
because a browser grants fullscreen only to a gesture in the window that asks.
`G`, a slide number and Enter jumps to the slide with that number in its
corner, which is the number a question from the room names.

## The cover, and lecture-wide type

`subtitle:` is the key most covers are missing. Without it the one line that
says what the talk is *about* has nowhere to go but `info`, where it renders at
meta size beside the room and the date.

```yaml
title: How Caches Forget
subtitle: Eviction, Staleness and the Cost of Being Wrong
presenter: Jana Wieland
affiliation: University of Bergen
contact: caches.example/notes
notice: Slides go up after the session.
info: |
  Nordic Systems Days · Bergen · 12 to 15 October
cover: masthead         # see the table below
cover-image: skyline    # only the four picture covers take one;
                        # on the six type covers it is an error
cover-ground: ink       # paper | ink – a dark opening slide under a light deck
closing-image: cover    # the ## closing: slide ends on the same picture;
                        # or name a different one, same three forms
closing-credits: contact  # none | contact | cover – see below
```

The list runs quiet to loud, which is the only question it asks you.

| cover | picture from | what it is |
|---|---|---|
| `classic` | - | the lower-left third, all type. **The default** |
| `masthead` | - | the title along the top edge, the credits along the bottom, the field between empty |
| `stack` | - | the title block centred on both axes |
| `display` | - | the title set to fill the slide; the scale is the design |
| `panel` | - | the type on a full field of the theme's accent |
| `quote` | **the chunk body** | the body set as the claim, the lecture's name under it |
| `split` | `cover-image` | type left, the picture **bled** off the right edge |
| `hero` | `cover-image` | the picture is the slide, type reversed out of a gradient |
| `beside` | **the chunk body** | the art **inset** to the right of the title |
| `above` | **the chunk body** | the art on top, title centred in the band below |

`split` or `hero` with no `cover-image` fails the build rather than drawing an
empty half.

**The credit block has four ranks, not one line and a list.** `presenter:`
carries the name, `affiliation:` the quieter line directly under it, and
`contact:` and `notice:` share one row along the foot – the address flush left, the notice
flush right and italic. The split is by job: a presenter and an institution
introduce the speaker, while an address and “the slides go up afterwards” answer
the room. `info:` is still there for the venue, the date and the course line,
and it is still the right place for them. Everything above it used to go in
there too, which set the line qualifying the speaker's name exactly like the
line giving the date.

`closing-credits:` says how much of that block the `## closing:` slide
repeats, and the default is `none`: repeating who is talking and where is what
makes a bookend read as a duplicate. `contact` brings back the foot row alone,
which is the line a last slide is most often asked to carry; `cover` brings
back the whole block. `cover` is the same reserved word `closing-image:` uses,
and it names *which* credits rather than only saying that there are some.

`cover-ground: ink` opens a light deck on a dark slide with no photograph in
it. The machinery was already there and reachable only through a picture –
`cover: hero` inverts the ink tokens for its own chunk, and `::: backdrop`
needs an asset – so a deck that wanted the dark opening and nothing behind it
had no path. It is written only where nothing has already darkened the slide,
so a backdrop's own scrim still wins, and the closing slide inherits it with
the rest of the composition.

**The six type covers each take a `::: backdrop` too**, which is how a picture
reaches a cover with no picture slot of its own. On `panel` the field becomes
the scrim, so the photograph reads through a plate of the accent instead of
under the paper veil every other backdrop gets.
**`beside` and `above` take their art from the title chunk's own body**, which
is how a `::: draw` becomes the cover - a diagram is not a file, so
`cover-image` can never name one. On those two the body is the art and `info:`
still supplies the meta; everywhere else a non-empty body replaces `info`.

```markdown
## title: {#title}

::: draw 150x56
box crawler "Crawler" {.tone-1}
box site "Web site" below crawler gap 1.1
edge crawler -> site "request"
:::
```

`split` bleeds and `beside` insets, and that is the whole reason both exist: a
photograph wants the edge, a drawing wants a margin. `cover-ratio: 42%`
(15-75) sets how much of the slide the picture takes on `split`, `beside` and
`above`; written on a cover that does not divide the slide it is an error.

## Section dividers

A column with a `# Heading` opens with a divider slide. `section:` picks how it
is drawn, and every option is quieter than the cover on purpose - a divider
that can be mistaken for the title slide has failed at its one job.

```yaml
section: tinted         # plain | tinted | rule | card | number | outline
section-mark: Teil      # any short word, or none (the default)
```

| | what it is |
|---|---|
| `plain` | the heading alone. **The default** |
| `tinted` | the whole slide takes the accent, lightly. The strongest signal across a room |
| `rule` | the heading between two rules. The quietest, and it survives a monochrome print |
| `card` | the heading on a panel |
| `number` | a large counter above the heading, counting the columns that have one |
| `outline` | the running agenda: every part listed, this one live |

There is no paragraph sign over the heading any more - it read as a statute
number to anyone outside a German law faculty. Put a word there with
`section-mark:` if you want one.

**A `#` line takes two classes, `.stack` and `.bare`.** `{.stack}` answers
where the divider's own content stands. Written, the content goes **under**
the heading at the `.full` measure, with the heading one step smaller than a
plain divider's above it; left out, prose stays under the heading at the
reading measure and a body that is nothing but a figure goes *beside* it.
Reach for it when the drawing is the point of the divider – a plan with six
cells and a label in each is unreadable at the half-frame the beside layout
gives it. A figure under a stacked heading is on a canvas like a chunk's,
`.full` wide and twenty labels tall, so its labels come out at the size of
every other figure in the deck. `{.bare}` takes the heading off the slide and
leaves it in the contents, a `section: outline` agenda, the cockpit and search
– for the divider whose figure already says the part's name. Both are per
divider and work under all six `section:` variants; on a divider with nothing
under its heading each is refused, because there is nothing to place.

```md
# Who keeps it green? {.stack #part-2}

> note: The card for this slide: say what the part is for before slide one.

::: draw 132x40
box plan "Plan" at 0,0
box run  "Operation" right of plan gap 0.6
edge plan -> run
:::
```

## Typefaces, ligatures, and the 1.0 layout

Three families travel in any one output, and which three the lecture chooses.
A **bundled** family needs no file in `fonts/`:

| role | default | alternates |
|---|---|---|
| serif | Literata | Source Serif 4, Bitter, Noto Serif, Roboto Serif |
| sans | IBM Plex Sans | Inter Tight |
| mono | JetBrains Mono | Noto Sans Mono Condensed |

Among the serifs, **Bitter** is the sturdiest on a projection and the smallest
file; **Roboto Serif** has the strongest bold but is 8% wider than Literata, so
it re-wraps a deck that was written against another face.

```yaml
fonts:
  sans: Inter Tight
  mono: Noto Sans Mono Condensed
ligatures: text     # text | none | all
style:
  wrap: balance     # balance | none
```

The condensed mono is a pinned instance of Noto Sans Mono's width axis, not a
different typeface: 0.50 em per character against JetBrains Mono's 0.60, at
54 KB. Slashed zero, three distinct shapes for `I` `l` `1`. Iosevka reaches the
same width and is deliberately not bundled - 961 KB per face - but works from
`fonts/`.

`ligatures: text` is the default: fi and fl in prose, none in code. `all` puts
the code ligatures back, so `->` draws as one arrow glyph - which is why it is
off, since in the figure grammar `->` and `--` are two different edges and a
listing on a slide is source a reader retypes.

**To lay a lecture out the way 1.0.0 did**, set `fonts: {sans: Inter Tight}`,
`ligatures: all` and `style: {wrap: none, bold: accent-bold, print-bold: accent-bold}`.
That is the whole of what has moved. There is deliberately no version key -
each of them is a preference in its own right, and a key naming a release would promise a rebuild of every
past release.

The `style:` block sets the type for the whole lecture:

```yaml
style:
  headings: left        # auto | left | center | off  - auto keeps the per-type treatment
  rules: off            # on | off              - the hairline above principle/definition
  labels: off           # on | off              - the generated type word (PRINCIPLE, EXERCISE...)
  link-codes: off       # on | off              - the mark after an external link
  heading-scale: 1.15   # 0.6 … 1.8
  body-scale: 0.95      # 0.6 … 1.8
  wrap: none            # balance | none        - how a heading breaks across lines
  blocks: left          # center | left         - where a code block, figure or formula sits
  hyphenate: all        # print | all | none    - which views break a word
  print-body: sans      # serif | sans          - the printed document's face
  neutrals: tinted      # neutral | tinted | warm | cool - what hue the greys carry
  print-neutrals: warm  # the same four, for the two documents; unset it follows
  headline: eyebrow     # stacked | eyebrow     - which line of a title pair is loud
  caps: on              # off | on              - small type round a title in capitals
  bold: accent          # plain | bold | italic | accent | accent-bold | accent-italic
                        #   - how a **bold** phrase looks live; plain is the default
  print-bold: italic    # the same six - on paper; bold is the default
```

Sixteen keys, and that YAML block is all of them – `STYLE_SPEC` in `build.js`,
mirrored as `STYLE_ENUMS` in `lint.js` for everything but the two scales.

`hyphenate: print` is the default and is what the tool has always done: the two
document views hyphenate their prose, the projection and the cockpit do not.
`all` puts it into the live views too – worth it for a German deck at `.narrow`,
where one compound noun opens a hole in the measure – and `none` takes it out
of the documents as well. It is a separate key from `lang:`, which picks the
dictionary and has to be right either way: without `lang: de` a German lecture
does not hyphenate anywhere, whatever this key says.

`neutrals` decides what hue the greys carry. In the four light themes the `A`
key moves the accent and nothing else, and every tinted surface – a card, a
dock, an overlay card – is mixed out of the ink, which sits at hue 260. So a
card under a warm accent is a cool grey under a warm word, and `light-blue` is
the only theme where the two agree. `tinted` gives the greys the accent's own
hue, `warm` and `cool` fix one regardless of the accent, and `neutral` is the
default and today's rendering byte for byte. `print-neutrals` asks the same
question for the two documents, and it is a separate key because print's paper
is already warm where the live paper is at chroma 0; unset, it follows
`neutrals`, so writing one key alone answers for both.

`headline` decides which line of a title pair is loud. A cover carries a pair
through `title:` and `subtitle:`, a divider and a closing slide through
`Heading | Sub`, and up to now the first line was always the large one.
`eyebrow` sets it small above a subtitle that takes the weight – the shape a
lecture title wants when the first line names the field and the second asks the
question. The words do not move: `title:` stays the content key of whichever
line is loud, because it is also the `<title>` element, the contents entry and
what the search index reads. `caps` sets the small type round a title in
capitals – the eyebrow, the presenter, the affiliation, never the headline. The
tracking that has to come with them is not a second key: capitals at the
tracking of lowercase read as one jammed word, so the build tracks out any slot
already in capitals, including one an author typed that way.

The two scales are multipliers on the tool's own scale, bounded to 0.6-1.8.
Reach for them on a whole deck, not to fix one chunk - a chunk that needs a
different size usually needs a different width class or less text.

`headings: off` takes every heading off the projection and keeps it in the
document, the contents list and the search - for a talk that is a run of
figures with speaker notes. `{.bare}` in a chunk's attribute tail is the same
switch for one chunk.

`{.center}` sets one chunk on a centre axis, on the projection and in the
cockpit but not in the printed document. It reaches the chunk's heading, its
own paragraphs and its `::: footnote` asides – everything the chunk says in its
own voice – and nothing nested, so a list, a table, a code block and the prose
inside a `::: side` pane or a `::: cards` row all keep their left edge. The
heading follows even under `style: {headings: left}`: a class on one slide is
the more specific decision than a key on the whole deck, and the alternative
was three alignments on one slide. Write it for the one or two lines under a
figure, where a left-aligned caption starts at the far edge of a wide slide
while the drawing sits in the middle.
Not for a paragraph of any length: centred prose loses the eye at the start of
each line, which is why this is a class you write rather than something a
`figure:` chunk gets by default.

`{.middle}` is the same decision one axis over: it keeps what the slide is
**painting right now** on the frame's vertical middle, rather than at the top
of the space the whole chunk will eventually fill. Every chunk is already
centred as a box – a reveal segment past the first keeps its box so the slide
does not change height under the room – and that is exactly why a chunk whose
material arrives downwards opens looking top-heavy: the first line is centred
inside a reserve nobody can see yet. Measured on a keynote, a three-row
timeline opened with one row 155 px from the ceiling and 698 px of paper under
it, and only its last beat looked composed.

**Two shapes get it without asking, and on those two you write nothing.** A
slide that *is* a picture – one `::: draw`, or one image, and no prose on the
slide beside it – and a `statement:`, whose heading and paragraphs are one size
and arrive one per press. Both are slides where the first beat has to stand on
its own, and a keynote wrote `{.middle}` on eleven chunks of which eight were
one of those two shapes. A `::: footnote`, a `::: marginalia` and a `::: expand`
do not count against a picture: they are asides lifted off the slide, so a
drawing with a source line under it is still a drawing standing alone.

A sentence under the drawing *is* prose, and that chunk keeps the old top
anchoring – prose grows downwards and a reader expects the heading to stay
where it was. So do the `figure:` chunks in `lectures/diagrams`, which are two
paragraphs explaining a drawing. **It is the shape of the body that decides and
not the type**, because the picture slide is written as `free:`, `figure:` and
`example:` across the corpus.

Write `{.middle}` yourself on a slide that is prose and still wants it – a
short definition whose second line arrives on a press, a one-line caption over
a photograph. Write `{.top}` on a picture slide that wants the old anchoring:
a drawing that grows downwards and should be read against where its first row
stood. The cost of the centring is that the frame glides a little on each
press, the way it already does on a chunk taller than the screen; the type
never changes size, because auto-fit still measures the whole chunk. Like
`.bare` and `.center` both words stop at the live views, and like them both are
refused on a `title` or `closing` chunk, where the cover composition and
`cover-align` have already answered the question.

`blocks: left` puts the three things on a slide that are not prose - a code
block, a figure with its caption, a display formula - on the prose's own axis
instead of centring them. Reach for it when a chunk is an argument with a
formula or a listing inside it: centred, the three land on three different
axes and the eye loses the step. Leave it alone when the block *is* the slide.
A `::: draw` is unaffected either way - a diagram fills the measure at every
chunk width, so there is no space beside it to align in.

**Two keys have a per-chunk form, and only two**: `blocks` and `wrap`, because
they are the two whose right answer changes from slide to slide. Write
`{.blocks-left}`, `{.blocks-center}`, `{.wrap-none}` or `{.wrap-balance}` in
the attribute tail; each is the key's name and one of its values, and the
chunk wins over whatever the deck said. Both directions exist so a chunk can
say the non-default thing under either global default. Unlike `.bare` and
`.center`, both reach the printed document, because the keys they answer do.

`link-codes: off` takes away the mark after every external link. The mark
shows the address on both screens, large, with a QR code beside it; up to
1.0.0 that view was reachable only by `Shift`-clicking the link, which still
works.

`labels: off` hides the generated type word in **both** views: the document
renderer labels principle, question, definition and exercise, the projection
generates only EXERCISE. Separate from `rules`, which hides the bar and the
hairline - a word and a line are not one decision.

**A figure's all-caps heading is not a generated label.** It is the chunk's own
heading, so `## figure: {.wide #id}` with no heading text leaves it off the
slide - at the cost of the TOC entry, the search text and the printed heading.

## Embedded fonts

Drop font files into a `fonts/` folder beside `source.md` and name the families
in the frontmatter, and they are embedded into all four outputs:

```yaml
fonts:
  serif: Literata
  sans: Inter Tight
  mono: JetBrains Mono
```

Only the roles `serif`, `sans` and `mono` are read. Files are matched by
name-prefix, with weight and style taken from the suffix
(`Literata-Bold.woff2`, `Literata-600italic.woff2`, `Literata[wght].woff2`).
`.woff2`, `.woff`, `.ttf` and `.otf` all work; woff2 is much the smallest and
the build says so when you use anything else. Naming a family with no matching
file **fails the build** rather than falling back quietly.

Embedding redistributes the font file. OFL and Apache-2.0 families permit it;
most commercial desktop licences do not. The build prints a reminder and
verifies nothing.

## The linter

```bash
node lint.js lectures/                    # everything
node lint.js lectures/<slug>/source.md    # one file
node lint.js lectures/ --strict           # warnings exit 2
node lint.js <source.md> --allow-missing-ids   # while prototyping, before ids are frozen
```

`--allow-missing-ids` silences `missing-id`. A chunk's `{#id}` is not required
by the build – a missing one gets a positional key – so this is for a talk
still being sketched; add the ids before the deck is finished, because they are
the anchor the TOC, cross-references and speaker sync all use, and a positional
key shifts when a chunk is inserted above.

Rules you will meet while authoring: `unknown-type`, `unknown-class`,
`stray-attribute`, `same-slot` (the three every `{…}` tail can raise, heading
or directive – the message names which), `missing-id`, `duplicate-id`,
`multiple-ids`, `title-count`, `density`,
`duplicate-explicit-block`, `unclosed-directive`, `stray-directive`,
`stray-directive-close`, `nested-directive`, `unclosed-math`, `reveal-overuse`,
`empty-beat` (a `---` that buys a press on which nothing at all happens – no
words, no aside written in it, no note on it, nothing held to it by `from`),
`orphan-column` (a column with fewer than two chunks),
`figure-caption-redundant`, `single-word-bold`, `figure-type-without-figure`,
`oversized-asset`, `asset-outside-root` (a picture, clip or backdrop that
resolves – links followed – outside the lecture's folder and the one above it;
the build refuses the deck), `frontmatter-language` (frontmatter opened with
anything but `---` or `---yaml`), `unresolved-asset` (an explicit `![](path)` that names no
file, so the build renders a placeholder rather than a broken external `src` –
usually the fix is dropping the extension so the `assets/` shorthand resolves
it), `deprecated-margin` (the old `::: margin` spelling of `::: footnote`),
`unknown-view-default`,
`unknown-style-setting`, `unknown-frontmatter-key` (a top-level key no
renderer reads; warning – see below), `unknown-label-key` (a word `labels:`
does not name), `bad-backdrop`, `duplicate-backdrop`, `bad-overlay`,
`bad-cols`, `bad-cards`, `bad-rows`, `cards-baseline-no-body`,
`cards-photo-no-image`, `cards-scrim-no-image`, `cards-detail-no-nesting`
(a card word with nothing to act on), `cards-nested`, `bad-side`,
`draw-in-cols`, `side-in-cols`, `aside-in-layout`,
`overlay-in-layout`, `directive-in-overlay`, `directive-in-cards`,
`directive-in-embed`, `duplicate-flip`, `explicit-nested` (the nesting
refusals, each mirrored by the build – see *Nesting*), `side-without-flip`,
`cols-in-cols`, `explicit-in-side`, `duplicate-marginalia`,
`layout-too-narrow`, `overlay-from-beyond` (the nesting warnings, which only
the linter raises), `bad-overlay-panel`, `bad-overlay-height`, `bad-dock`,
`bad-dock-from`, `bad-dock-height`, `bad-dock-beat`, `dock-on-cover`,
`dock-scope`, `dock-in-layout`, `directive-in-dock`, `duplicate-dock`,
`dock-link`, `marginalia-in-dock` (the dock's refusals, each mirrored by the
build), `dock-narrows-measure` (a side dock leaves a chunk less than its
measure; warning), `text-on-picture` (a `::: backdrop {.clear}` under words
that stand on the bare picture – a heading unless the chunk is `.bare`, prose
outside an overlay or a dock, a divider's heading always; drop `.clear`, write
`.invert`, or put the words in a `::: overlay {.panel}` or a `::: dock`;
warning), `bad-cover-ratio`, `bad-unit`, `bad-autoplay` (a delay
outside 200–60000 ms, `cycle` with no autoplay, or autoplay on a figure
with no `step` block), `bad-frame` (a `frame` on the `::: draw` opener that is
not a `WxH` in grid units), `bad-section-stack` / `bad-section-bare` (a
`{.stack}` or `{.bare}` divider with nothing under its heading),
`reveal-from-beyond`, `note-from-beyond` and `note-advance-beyond` (a
`--- from N`, a `> note: from N` or a note's `[Klick …]` lines asking for a
beat the slide never takes).

`unknown-frontmatter-key` names a top-level key that no renderer reads, and it
is the layer above `unknown-view-default` and `unknown-style-setting`: those
two catch a bad *value* under a key the build knows, and this one catches the
key itself. `author:` was the case that produced it – it sat in several of this
repo's own lectures, looked like it was doing something, and had never reached
a page. It is a warning, so nothing stops building and a `source.md` that was
valid stays valid, but **`--strict` turns it into exit 2**: a repository with
`node lint.js lectures/ --strict` in CI and a stray key gets a red build on
upgrade. The list of keys the build reads is `KNOWN_FRONTMATTER_KEYS` in
`lint.js`; the fix for a key that was never read is to delete it, and for one
that should be read, to move it under `style:` or `labels:` where it belongs.

`single-word-bold` is the collapse audit made mechanical: a bold of two words
or fewer that lands *after* a paragraph's first sentence, where the projection
will show it with none of the prose around it. It only ever looks at chunk-body
paragraphs – a list item is shown whole and never triggers it, and neither does
anything in a `::: slide`, a `::: script`, a `::: cards` or a code fence. See
`reference/style.md` for the two fixes.

`figure-type-without-figure` is a chunk typed `figure:` whose body holds no
`::: draw`, image, `::: backdrop`, `::: embed` or code fence. The slide renders
identically either way, so this is not about the projection – the `O` overview
board and the speaker view both read the type, and a deck with eight `figure:`
chunks holding `::: cards` lists reports twice the figures it has.

**Two checks that were tried and deliberately not shipped**, because a
measurement said they could not work. Both are recorded so nobody builds them
again:

- *An enumeration check* – "a first sentence that names a count, in a chunk
  with no list" – to catch a paragraph that promises five kinds of something
  and then names them in prose the collapse drops. Measured across two
  repositories it produced 41 hits in this repo's own lectures alone, nearly
  all of them ordinary topic sentences: "One handshake, two flights.", "flush
  and align do two different jobs." Numerals are too common in good prose.
- *A cards-per-width check* – "four cards do not fit a `.wide` chunk". True of
  the deck it came from, and false in general: `lectures/decoration` and
  `lectures/tutorial` use `cards 4` and `cards 5` at `.wide` correctly because
  their labels are short. The predictor is the longest word against the column,
  which is typography, not source.

Both belong to `build.js --check-fit`, which measures the rendered result
instead of estimating it from the source.

## `build.js --check-fit`

Whether every slide fits the frame, measured in a browser. `lint.js` has no
browser, the density budgets are word counts, and `::: cards` and `::: rows`
are exactly the constructs that break the relation between words and height, so
a deck can reach `0 errors, 0 warnings` under `--strict` with a reading
sentence off the bottom of a slide.

```bash
node build.js <source.md> --check-fit [--viewport 1600x900]
```

Walks the built `audience.html` state by state – pressing the key, so a figure
step and a reveal each get measured – and compares each `.chunk-content` box
against `#stage-viewport`. **1600x900 is the default because a projector is
16:9**: `.wide` resolves through auto-fit, so the em and every wrapped card and
row are functions of the viewport, and two chunks that measured inside the
frame at a laptop's 1440x810 are 835 and 836 px tall in a 900 px 16:9 one.

**It reports two things and only one is a failure.** A chunk *taller* than the
frame is read by scrolling – the stage is a continuous column and walks down it
as reveals advance – and is reported as a note; `lectures/tutorial` has
several, each listed by id with its height. A chunk that *fits* the frame and is still outside it cannot be
excused that way, and is the failure, with exit 2.

**For a clipped chunk it also reports what the height is made of, because the
total sends an author at the wrong lever.** Under `topic-bold` the collapse
renders the first sentence of each paragraph plus every promoted bold and hides
`.sentence-rest .prose` outright, so **shortening a continuation changes the
collapsed height by exactly nothing**, while un-bolding one fragment removes a
whole line box. Measured on a chunk 52 px over: cutting every hidden
continuation to one word moved it 0 px; un-bolding a single fragment cleared it.
A rewrite that shortens the words while folding two bolds into one long first
sentence makes it worse, which is how this was found.

**It reads every figure as well, and those readings are notes.** One line per
figure gives its canvas, its drawing and the room left on each axis, in labels
and in px, tightest axis first, with "past its canvas" or "reads empty" on the
same line; one line gives the deck's median settled body type and names every
slide a figure took more than 15% under it. A `.middle` chunk is measured as the
camera frames it, so its centring is not reported as overflow, and every chunk
taller than the frame is listed by id.

Degrades rather than fails: with no `playwright-core` or no Chrome it says so
and leaves the build's exit code alone. It reports the viewport it used, since a
room with a different aspect ratio wraps differently.

## `build.js --squint`

The squint test, mechanically. `--check-fit` asks whether the slide is inside
the frame; this asks what it *says*.

```bash
node build.js <source.md> --squint          # → squint.txt beside the source
node build.js <source.md> --squint --squint-out -        # → stdout
node build.js <source.md> --squint --viewport 1920x1080
```

It walks the built `audience.html` state by state and writes out the text a
room would actually get: the heading, the first sentence of every paragraph,
every promoted bold as the bullet it becomes, the lists and code and figures
and formulas that stay whole, and – marked as withheld, with a word count – the
continuation prose the collapse drops. What arrives on a later beat is marked
`+N`. Chunk-level constructs are in it too: a chunk that is nothing but a
`::: backdrop` and an `::: overlay` is a picture with a caption on it, not an
empty slide.

**It reads the rendered page and never `source.md`.** The collapse is CSS and
JS. Reasoning about a slide from the source is the mistake this exists to
catch, and an extractor that parsed the source would make the same mistake with
more confidence.

Read it for the four things the collapse is most often wrong about:

- a topic sentence that cannot stand alone – you are reading exactly what the
  room reads, with nothing under it;
- a `-` bullet that is a bare noun or a label, which is `single-word-bold` and
  its cousins seen from the other end;
- a slide whose only `.` line ends in a colon, with the substance on the `~`
  line under it: that is a slide announcing something and withholding it;
- a `~` count far larger than the words above it, which is a chunk written as
  prose and presented as a stub.

Speaker notes are counted, never quoted – they are the one thing certain not to
be on the projection, and `print-notes.html` is the file for reading them.

**What it cannot see** is in the file's own header: colour, contrast, overlap,
and anything below the fold. A slide can be in this file in full and unreadable
on the wall. `--check-fit` answers the frame; your eyes answer the rest.

Like `--check-fit` it degrades rather than fails, and it never fails a build:
it is a description of the projection, not a verdict on it.

## `build.js --frames`

The projection as pictures: one PNG per state, and a contact sheet of eight per
page beside them.

```bash
node build.js <source.md> --frames                       # → frames/ beside the source
node build.js <source.md> --frames shots                 # → shots/
node build.js <source.md> --frames --viewport 1920x1080
```

It walks the built `audience.html` the way `--check-fit` and `--squint` do –
pressing the key, so every reveal, every figure step and every backdrop place
gets a frame – and writes each state as `NNN-<chunk-id>-b<beat>.png`. A press
that paints the same pixels writes nothing, so the count is states and not
presses. **The sheet is the thing to read**, because the defects this catches
are visible at a quarter size and forty frames across five pages is a review
while forty files is not.

It exists because the other two answer narrow questions. `--check-fit` is
geometry against the frame and `--squint` is text, and a deck goes wrong in
ways neither asks about: type that is 12 px on a 1600 px slide, a source line
standing over the figure it cites, a table cell that swallowed its own class, a
row of cards where one is a third the height of its neighbours. Both probes
were clean on the keynote that produced this command.

Needs a Chromium and `playwright-core`; without either it says so and leaves
the exit code alone. It never fails a build.

**The sheet finds the slide; it does not judge a figure.** Read the last beat
of every figure at full size, in its own PNG: a line struck through by the
outline of the box above it is invisible at a quarter size and obvious at full
size, and a pass over a whole deck's contact sheets once reported no such line
in a deck that shipped one.

**The four checks in order, and what each one cannot see:**

| | sees | blind to |
|---|---|---|
| `node lint.js <source>` | the grammar, the budgets, the mirrors – no browser, milliseconds | anything that is a rendering |
| `--check-fit` | whether a slide that fits the frame is inside it | colour, contrast, wording, everything that fits |
| `--squint` | what the room reads, beat by beat, and what the collapse withholds | colour, contrast, overlap, size, the fold |
| `--frames` | the slide as the room gets it, every state | nothing it can name for you – you are reading pictures |

Run them in that order. The first three are cheap and specific; `--frames` is
the one that needs your eyes, and it is the one that finds what the others were
not asked about.

A source file can silence checks with an HTML comment anywhere in the body:

```md
<!-- linter: ignore reveal-overuse, density -->
```

Silence a check when you have decided the shape is right, not to make a
warning go away unread.

## Workflow

1. Frontmatter, the `title` chunk, and the column headings.
2. Chunks with explicit types, widths, and IDs. Main argument as plain prose.
3. **Mechanism pass**: per chunk, decide derived / `::: slide` / `::: script`.
   Do this before polishing, because it changes what the prose has to achieve.
4. **Topic-sentence and bold audit** on the derived chunks. Squint test.
5. Reveals only where pacing matters; `expand` for optional detail, citations,
   backups; `margin` or `marginalia` only for genuinely secondary context.
6. **Prose and typography pass** – see `reference/style.md`.
7. `node lint.js <source.md>`.
8. `node build.js <source.md> --squint`, then read `squint.txt`: that is the
   squint test done mechanically, one line per thing the audience gets and every
   withheld paragraph marked with its word count. Anything fragmented goes
   back to step 3 or 4, and `git diff` on the file says what a prose edit did
   to the projection. Then open `audience.html` and press `O` for the overview
   board – repeated sentence openers, type monotony and over-dense chunks show
   up there and nowhere else – and `C` on any chunk the file made you doubt.
9. `node build.js <source.md> --frames`, then read the contact sheets.
   **Look at the sheets before judging the wording.** A review that starts from
   the source, or even from `squint.txt`, argues about sentences on slides that
   are broken in ways no text can carry – a label at 12 px, a footnote standing
   over the figure it cites, three cards at three heights. Fix what the
   pictures show first; the wording is worth arguing about once the slide is.

## Gotchas

- Only the eleven types and four widths exist. Eight non-width classes exist,
  plus the eleven `.figure-type-60` … `.figure-type-160` steps, and no others:
  `.bare`, `.center`, `.middle`, `.top`, `.blocks-left`, `.blocks-center`,
  `.wrap-none`, `.wrap-balance`; anything else is an `unknown class` error.
  `.bare`, `.center`, `.middle` and `.top` are not legal on a `title` or `closing`
  chunk, where the cover composition decides all four questions; the four
  `style:` classes are, and
  `.wrap-none` on a cover breaks its title greedily.
- IDs unique across the file, and frozen once authored.
- `::: flip` requires an enclosing `::: side`.
- A bare `:::` closes layout first, then the enclosing `expand` or `margin`.
- `---` outside a fence is always a reveal, never a rule.
- One `title` chunk per lecture. Leave its body empty unless you deliberately
  want to override the frontmatter `info` lines, which a non-empty body does.
- Never commit the generated HTML. Rebuild it.

## Deeper reference

- `reference/style.md` in this skill – topic-sentence and bold audit,
  anti-patterns, prose and typography rules (en-dashes, typographic quotes).
- `lectures/tutorial/source.md` in the repo – the canonical authoring
  reference, a lecture that teaches the tool by being the tool.
- `lectures/python-intro/source.md` – the richest worked example of `cols`,
  `side` and `marginalia` together.
- `PRD.md` sections 2, 2.1, 3, 4.5 – the content model, type vocabulary,
  source format, and the explicit-slide rationale.
- `CLAUDE.md` – repo conventions and a map of `build.js`.
