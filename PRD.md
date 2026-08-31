# Lecture Medium – Specification v0.1

A medium for live university lecturing that is neither slides nor document. The content lives on a bounded 2D plane as typographically composed chunks arranged in columns; the lecturer navigates by camera motion between chunks; the same source produces a printable study version. Authored in plain Markdown, rendered by a small amount of static HTML and JS, built by a small Node script. Designed to be written this week, iterated all semester.

---

## 1. Non-negotiables

These are the commitments. Everything downstream is subordinate.

1. **Plaintext Markdown source.** Diffable, durable, LLM-amenable, survives every tool we will use.
2. **No slides, no continuous essay.** Content is chunked and arranged spatially. Camera pans between chunks.
3. **Two views from one source:** live audience projection and printable study document. Same IDs, same chunks, different renderers.
4. **Live speaker view separate from audience view.** Speaker sees notes, next-chunk previews, lecture scrubber. The room follows the speaker unless the projection is frozen.
5. **Readable on any projector down to ~1024×768.** Text sizing is viewport-relative. The camera never shows more than roughly 15 line-heights of content at a time at the default zoom. This sets a hard density discipline.
6. **Zoomable with reflow, not pixel-scaling.** The app owns zoom via explicit hotkeys (`+` / `-` / `0`) that adjust a root-level type-scale multiplier; text reflows, never bitmap-scales. Native browser Ctrl+/- continues to work as a user preference because all sizes are in `rem`, but behavior across browsers is out of our control and the app's own hotkeys are the documented, tested interface. This is the single biggest reveal.js pain point to avoid.
7. **Typographic variance is the point.** Chunks look different from one another by design. Monotony is a failure mode equal to overload.
8. **No gratuitous ornament.** No accent left-borders, no gradients, no ubiquitous rounded corners, no glass, no drop shadows beyond hairlines. OKLCH palette, restrained, uchu-adjacent.

---

## 2. Content model

**Frame.** Each chunk is a *slide* – it occupies its own viewport-sized frame. There is no global 2D plane the camera pans across; the camera frames one slide at a time. This is the “slideshow with structure” model: each slide owns the screen, and visual variability lives *inside* the slide, not at the frame level.

**Column.** A vertical stack of related slides. Horizontal motion between columns signals a new sub-topic; vertical motion signals the next slide within the current sub-topic. Columns are visually isolated – the inter-column spacing is large enough that the neighboring column is fully off-viewport whenever the camera is framing any slide.

**Chunk.** The atomic unit of lecture content, rendered as one slide. Has a stable ID, an optional heading, a body, an optional structural tag (`title`, `principle`, `example`, `definition`, `question`, `figure`, `exercise`, `free`), a width class, optional reveal separators (`---`) inside the body (§4.6), optional expansions, and an optional author-editable annotation slot. The width class determines the slide's *internal* text-column max-width, **not** the frame size.

**Expansion.** Detail content (deeper explanation, worked example, answer to a question) that lives with its parent chunk, reached via a chevron affordance in the bottom-right of the slide. When opened, the slide's internal layout splits into two columns – content on the left, expansion on the right – without leaving the slide frame. Chevrons carry a 2–3 letter abbreviation (`Ex`, `Exp`, `Ref`, `?`, `Pf`, `Fig`, `Set`) derived from the expansion label.

**Annotation slot.** One author-editable text area per chunk, used for live speaker marginalia during a lecture (not for source-authored references – those belong in a `Ref` expansion). Hidden by default; revealed only when the speaker activates it (`N` key or click on the `+ note` affordance). When active, the camera pans the slide to the right and the annotation opens as a ~65-column box on the left (monospace by default, sans toggleable), allowing ASCII-friendly editing. `Esc` returns focus to the slide.

**Sketch slot.** A named live-editable region inside a chunk. Renders monospace text in the audience view; editable via textarea on the speaker view only (or embedded iframe for etherpad/collaborative cases).

**Placement algorithm (deterministic).** Given the ordered list of columns and, per column, the ordered list of chunks, positions are computed purely from source:

1. **Slide size.** Each chunk is rendered as a slide of `width = 100vw` and `min-height = var(--slide-min, 40vh)` – large enough to own the viewport but small enough that short chunks (e.g. a `question` or a `free`-narration transition) auto-size to their content and leave room for neighbor peek. Internal text column width is determined by the chunk's width class: `narrow = 28em`, `standard = 36em`, `wide = 52em`, `full = 72em`. Width classes control *content layout inside the slide*, not the frame.
2. **Column X.** Columns are placed left-to-right, separated by `column-gap = 8vw`. Because each slide is viewport-wide, this gap is always enough to fully isolate the neighboring column from the active one.
3. **Chunk Y within a column.** Slides stack top-to-bottom with `chunk-gap` – a tunable CSS custom property (default `4vh`, range `0vh`–`25vh`). Small values create a “flow” feel with neighboring slides peeking during transitions; large values enforce full slide isolation.
4. **Camera.** The camera **translates only**; there is no `transform: scale()` at the camera level. On chunk change, the stage translates to place the active slide centered in the viewport. On annotation activation, the camera offsets right so the slide's left edge lands around viewport-X = 55%, revealing the annotation box on the left.
5. **Expansions.** When a chevron is clicked, the parent slide's internal CSS grid switches to a two-column layout (content left, expansion right). The slide frame itself doesn't move. Expansions do **not** nest – a `::: expand` cannot contain another (enforced by the parser and linter).
6. **Neighbor behavior.** Three modes, spec-configurable: `dim` (neighbors always at reduced opacity – currently ~`calc(1 - dim * 0.96)` ≈ 4%), `fade-after-settle` (neighbors briefly visible during the camera transition, then fade to `0` after the camera lands – gives continuity during motion, isolation at rest), `hidden` (always fully transparent). Default: **`dim`** – calibrated authoring runs found constant peek preferable to motion-only peek.
7. **Reading order and scrubber.** Source order: all chunks of column 0 top-to-bottom, then column 1, etc. Expansions are attached to their parent and do not occupy a separate scrubber slot.

This algorithm is pure: same source → same slide positions → same camera targets → same deep-link behavior across rebuilds and machines.

**Stable chunk IDs.** Every chunk carries an explicit `{#column-slug/chunk-slug}` attribute in source. IDs are frozen once authored; renaming a heading does not change the ID. Normal builds – including `--watch` – never mutate source. A separate, opt-in `build.js --assign-ids` one-shot mode generates IDs from current slugs for any chunk missing one and writes them back, resolving collisions. This keeps the rebuild loop pure and makes source the single source of truth. Every downstream feature – speaker sync, URL deep-links, print anchors, student references, linter – depends on these IDs being present and stable.

### 2.1 Structural tag vocabulary

The `## tag: Heading` prefix marks the chunk's structural role. This list is **exhaustive** – an unknown tag is a build error (§9), not a custom extension point. Adding a tag is a spec change, because each tag has visual treatment in the CSS and reading-order implications in the print view.

| Tag | Use |
|---|---|
| `title` | Lecture cover slide. Pulls `title`, `presenter`, `info` from frontmatter; see §4.4 for layout. |
| `closing` | The last slide, drawn in the composition `cover:` names. Its heading, sub-heading and body are its own – it is the one cover-shaped slide whose words are not the frontmatter's; see §4.4. |
| `principle` | A core claim or rule. Thick rule above, larger heading. `.standard` reads better than `.narrow`: a claim of two sentences in a 28em column becomes a tall thin ribbon. |
| `definition` | A formal statement. Small-caps label, typically `.standard` width. |
| `example` | A concrete instance. Often `.wide`, often followed by a principle chunk. |
| `question` | A posed question, often paired with an `::: expand` answer. |
| `figure` | A visual-dominant chunk (image, diagram, ASCII sketch). Usually `.wide` or `.full`. |
| `exercise` | Student-facing task. Rendered with the exercise marginalia treatment in print. |
| `free` | Uncategorized narration. No rule above – typographically quiet. |

Tag is optional on a chunk; omitting `tag:` is equivalent to `free:`.

**The live views do not print the tag name.** They did, as a small-caps eyebrow above the heading, and it was removed: the word announced a taxonomy that is correct only as often as the author's tag choice was, and a slide labelled PRINCIPLE that is not one reads to the room as a mistake. The tag still decides the rule above, the type scale, the spacing and the lint budget – it just stops naming itself. The document renderer keeps the label, because a reader scanning a long text does benefit from the taxonomy, and because a document is read at one's own pace rather than projected at a room.

---

## 3. Source format

Single Markdown file per lecture. Conventions:

```markdown
---
title: Foundations of Anonymity
presenter: Dominik Herrmann
info: |
  2026-04-21, Bamberg
  introsec-ss26 – lecture 07
course: introsec-ss26
lecture: 07
# optional viewer defaults – see below
font: mono
theme: terminal-green
collapse: none
auto-fit: true
slide-numbers: off
editor: both
---

## title: {#title}

# Motivation {#motivation}

## free: Why anonymity is not privacy {.narrow #why-anon-not-privacy}

Opening observation, narrated. **Core claim** inline as bold.

Second paragraph, also narrated.

---

After a `---` the next paragraph is a new reveal segment (§4.6). Unsegmented chunks have no `---`; that is the common case.

::: footnote
Compare Pfitzmann & Hansen terminology paper.
:::

::: expand deep-dive
Long-form elaboration, revealed on chevron.
:::

## definition: k-anonymity {.standard #k-anonymity}

Formal statement. $k \geq 2$ inline math.

::: sketch k-anon-sketch
  ┌─────┬─────┬─────┐
  │ age │ zip │ dx  │
  └─────┴─────┴─────┘
:::

> note: Watch the room here – common confusion with l-diversity.
```

**Viewer defaults.** Six optional frontmatter keys pin how a lecture *opens*: `font` (serif/sans/mono), `theme` (the six accent and phosphor names), `collapse` (topic-bold/none, the `C` toggle), `auto-fit` (true/false, the `#` toggle), `slide-numbers` (vertical/horizontal/off, the `L` toggle), and `editor` (both/speaker/none). The last is not a look but a payload – whether the live views carry the diagram editor – and it goes through the same machinery because the failure mode is the same: a typo would otherwise cost the lecture its editor without anything on the page saying so. Precedence is one sentence: **a key that is present wins over the reader's stored preference; a key that is absent leaves that preference alone.** Lectures that pin nothing therefore behave exactly as before – font, theme and slide numbers keep following the reader across lectures, which is the point of storing them globally – while an author who has designed a look gets it without asking anyone to press keys. `slide-numbers` reaches the print views too, since a document has no keyboard. An unknown value fails the build with the list of valid ones: a silently dropped setting is indistinguishable from a setting nobody wrote.

**Rules:**
- `# Heading` = column title.
- `## tag: Chunk heading` = chunk, with structural tag prefix. Tag is optional; width class and ID are attributes.
- `## title: {#title}` = cover slide. The heading text after `title:` is intentionally ignored – the cover always renders from frontmatter (`title`, `presenter`, `info`), so the heading is left empty by convention and only the `{#title}` id is needed. The body may also be empty; a non-empty body overrides `info`.
- `## closing: Heading | Sub {#end}` = closing slide, and the exception to the line above: its heading is exactly what it says. It draws the deck's own `cover:` composition, with the body in place of the info block and no presenter or info lines at all.
- Width classes: `.narrow`, `.standard`, `.wide`, `.full`. Default: `.standard`.
- `::: footnote` and `::: expand <label>` are fenced divs. `::: margin` is the
  older spelling of `::: footnote` and still builds, so no existing `source.md`
  breaks; it is documented nowhere and should not be written in anything new.
- `::: sketch <sketch-id>` defines a live sketch slot with a stable id.
- `> note:` at the start of a blockquote marks a speaker note (private, speaker-only).
- `> annot:` at the start of a blockquote is a **presentation note** – text the lecturer typed live into the audience annotation box and exported back via `Shift`-`E` on the speaker. It prefills the audience textarea and renders as a “Presentation Note” block in print. Public by design.
- `---` on its own line inside a chunk body is a reveal separator (§4.6). At the top of the file, `---` delimits frontmatter (handled by `gray-matter`, never reaches chunk parsing).
- Standard Markdown for everything else (lists, bold, italics, code, links).
- Images: `![](fig-id)` resolves to `images/fig-id.{svg,png,jpg}`; the build determines extension and dimensions.
- Math: `$inline$` and `$$block$$`, rendered by KaTeX at build time.

### 3.1 Parsing contract

Source is parsed to a single AST; no regex post-processing on rendered HTML. Pipeline:

1. **Frontmatter split** via `gray-matter`.
2. **Directive pre-tokenization.** A line-based pre-processor scans for fenced directives (`::: name args` opening, `:::` closing). It replaces each directive block with a placeholder token (e.g. `<!--DIR:0-->`) keyed into a side map, leaving the Markdown body with well-formed placeholders that `marked` will pass through as HTML comments. This runs *before* `marked` and cannot collide with standard fenced code blocks.
3. **`marked` with custom extensions.**
    - `heading`: parses `tag:` prefix on `##` and attribute tail `{.width-class #id}`. Unknown tags become parse errors (see linter errors).
    - `image`: recognizes bare `![](fig-id)` and `![](fig-id){.width-class}`; resolves to `<figure>` AST nodes with a `resolve-later` flag.
    - `blockquote`: a post-parse walker inspects each blockquote's first text child. If it matches the literal pattern `^note:\s`, the node is retyped as a `speaker-note` AST node; otherwise it remains an ordinary blockquote. There is no other overloading of blockquote syntax.
    - **Attribute tokenizer.** The trailing `{.class #id}` syntax on headings and images is Pandoc-style; `marked`'s core does not ship it. The build includes a ~30-line inline tokenizer that parses `{ ... }` at end-of-line into `{classes: string[], id?: string}` and attaches the result to the host AST node. This tokenizer is the one intentional divergence from plain Markdown.
4. **Directive reification.** The placeholders from step 2 are resolved in a single AST walk into typed nodes: `margin`, `expand` (with label), `sketch` (with slot id), `etherpad` (with url). Nested directives are rejected at this stage.
5. **Reveal segmentation.** After directive reification, each chunk body is split at standalone `---` lines into an ordered array of reveal segments. Because frontmatter was stripped by `gray-matter` in step 1, and thematic-break `---` at chunk level is redefined as the reveal separator, there is no ambiguity. If an author genuinely needs a thematic break inside a chunk body (extremely rare), they can use `***` which `marked` treats as equivalent.
6. **Downstream passes** (ID validation, image dimension resolution, KaTeX, TOC, placement, renderers, linter) operate on the AST only – no string mangling of rendered HTML.

The `::: directive` syntax is the preferred form for anything non-trivial; `> note:` (speaker) and `> annot:` (presentation note) are convenience shorthands and are the *only* blockquote-based extensions. If you need a blockquote whose text begins with the literal word “note:” or “annot:”, escape it (`> \note:`) or use a fenced `::: note` directive (reserved synonym).

---

## 4. Visual language

Not templates. A small vocabulary of compositional moves.

### 4.1 Grid

Four column widths, expressed in `rem` so they reflow with zoom:

| Class | Width | Typical use |
|---|---|---|
| `narrow` | 28em | Pull quotes, single-sentence observations, marginalia-heavy chunks |
| `standard` | 36em | Default prose, principles, definitions, examples |
| `wide` | 52em | Two-part chunks, inline figures, comparisons |
| `full` | 72em | Large figures, process diagrams, full-width sketches |

(`narrow` was 22em until a semester of use showed it produced tall thin ribbons out of anything longer than a sentence. The table above is the implemented set; §2 carries the same numbers.)

Column width is the strongest compositional lever. Content of the same structural type looks entirely different in a `narrow` vs `wide` box without any per-chunk design work.

### 4.2 Typography

Type scale, used with discipline:

- `xs` (0.75rem) – marginalia, captions
- `sm` (0.875rem) – expansions, secondary detail
- `base` (1rem) – body
- `lg` (1.25rem) – chunk headings
- `xl` (1.75rem) – column headings
- `display` (2.75rem) – lecture title, reserved for title slides or pull statements

Weight palette: regular, medium, bold. Nothing else. Small caps for labels (`DEFINITION`, `EXAMPLE`, `NOTE`) via `font-variant-caps: all-small-caps`, not faked with CSS `text-transform`.

Fonts: one serif for body, one sans for labels and UI, one monospace for sketches and code. Self-hosted as variable fonts (WOFF2) so lectures remain durable across years. Reasonable starting set: Source Serif 4 or Spectral for body; Inter Tight or IBM Plex Sans for labels; IBM Plex Mono or JetBrains Mono for monospace. Avoid generic sans defaults.

**Root font size is viewport-relative:**

```css
:root {
  font-size: clamp(14px, calc(100vh / 40), 24px);
}
```

This anchors the entire scale to the projector's vertical resolution, keeping the ~15 line-heights budget regardless of 1080p vs 1024×768. On top of the clamp, the app applies a CSS custom property `--zoom` (default `1`) that the `+` / `-` / `0` hotkeys increment in fixed steps (e.g. 0.9, 1.0, 1.1, 1.25, 1.5). The effective root size is `calc(clamp(14px, 100vh/40, 24px) * var(--zoom))`. Because all widths are expressed in `rem`, text reflows at every step. Native browser Ctrl+/- also reflows (since no pixel dimensions are hard-coded) but is treated as a user-agent courtesy, not part of the contract.

**Density budget and zoom interaction.** The ~15 line-heights-per-chunk budget is defined and linted at `--zoom: 1.0`. At higher zoom steps, a `full` chunk's `60rem` width plus `14rem + 18rem` lanes may exceed the projector viewport width; the camera compensates by scaling out to fit, which cancels part of the zoom-in. This is by design – zoom is a readability tool for individual chunks, not a universal magnifier – but authors should know that zooming past `1.25` on `full`-width chunks gives diminishing returns. The linter emits a warning if a `full` chunk's content would not fit the camera frame at `--zoom: 1.5`.

### 4.3 Color

OKLCH palette, uchu-inspired, restrained. Calibrated for projector-distance readability (values observed from authoring sessions):

```css
--ink:        oklch(0.20 0.01 260);   /* body text – calibrated for back-of-room legibility */
--ink-soft:   oklch(0.62 0.01 260);   /* marginalia, captions, dimmed non-active chunks */
--paper:      oklch(0.98 0.00 0);     /* background */
--paper-warm: oklch(0.96 0.01 90);    /* dimmed background for unfocused surfaces */
--rule:       oklch(0.78 0.00 0);     /* hairlines */
--emph:       oklch(0.42 0.16 30);    /* bolded core claim text, sparingly */
```

`--ink-l` and `--ink-soft-l` are exposed as CSS custom properties so the lightness can be tuned in authoring without editing the color definitions. Both values (0.20 / 0.62) are the defaults that survived authoring and rehearsal – do not lighten `--ink` beyond ~0.25 without testing from the back of the actual lecture room.

Dimming of non-active slides goes to **opacity** (toward `0`), not to a color wash. Three modes: `dim` (always visible at `1 - 0.86 * 0.96 ≈ 4%` opacity), `fade-after-settle` (flash to full dim during camera pan, fade to 0 after), `hidden` (always 0). No background tinting, no blur – the slide frame is the isolation primitive.

### 4.4 Compositional moves

Because each slide fills the viewport and shares one frame, visual variability lives inside the slide. Three independent axes:

1. **Width class** → internal text-column max-width (`narrow 22em / standard 36em / wide 52em / full 72em`). A narrow chunk floats a tight column in whitespace; a full chunk fills the slide.
2. **Alignment** (`data-align="left" | "center" | "right"`) → where the text column sits within the slide horizontally. Left-anchored chunks feel like running prose; right-anchored feel like a closing remark.
3. **Per-tag treatment** – the canonical compositional vocabulary:
   - `title`: lecture cover. `title` in `display` size; below it `presenter` in `lg`; below that a multiline `info` block in `sm` soft ink (date, location, course code, URL, any extra line). Left-aligned. Vertically placed so the whole block sits in the lower-left third of the slide – *not* centered. Centered cover slides look institutional and dead; lower-left-third gives asymmetric weight and reads as intentional. Content is pulled from frontmatter; a non-empty chunk body overrides the `info` lines. `closing`: the bookend, drawn in the same composition with its own heading and body and neither the presenter nor the info lines.
   - `principle`: thick rule above, larger body (1.2× zoom), larger heading. Pull-quote feel.
   - `definition`: hairline rule above, math blocks centered, tight body. Academic feel.
   - `question`: centered, heading huge (2.4× zoom), body small + soft. Pause feel.
   - `figure`: heading small + smallcaps, ASCII sketch dominates. Diagram feel.
   - `exercise`: `EXERCISE` smallcap label above, italic heading. Task feel.
   - `free`: no special treatment. Narrative prose.

**The cover has ten compositions, not one, and the list runs from quiet to loud.** `cover:` in the frontmatter picks between them and `subtitle:` supplies the hierarchy step the original lacked – without it the line that says what the talk is *about* is set exactly like the line that says which conference it is, which is the whole of the "reads as a text file" complaint. Five are type alone: `classic` is the lower-left third above and stays the default; `masthead` sets the title as a nameplate at the top and the credits under a folio rule at the bottom, with the **title chunk's own body as the lede** in the field between them – and with no lede the nameplate is set larger, so the composition reads what it was given; `stack` centres the block on both axes, for an opening that wants to be still; `display` sets the title to fill the slide, so the scale is the whole design; `panel` puts the type on a full field of the theme's accent; `quote` opens the talk on a claim – the title chunk's body set large, with the lecture's own name reading as the attribution under it, and **no quotation mark**, because a sentence alone on a slide with a name under it already reads as one and the mark is what gets added when the composition is not trusted to say so. Four take a picture: `split` sets the type left and bleeds `cover-image` off the right edge; `hero` makes the picture the slide and reverses the type out of a bottom-up gradient; `beside` and `above` take their art from the **title chunk's own body**, so a `::: draw` can be the cover – inset beside the title, or above it with the type centred in the band below. `cover-ratio` (15–75%) sets how much of the slide the picture takes on the three that divide it, and `cover-align` (`top` / `middle` / `bottom`) sets where the type sits on the vertical for the six that leave it any freedom – one key rather than six more variant names, refused on the three that place their own type. Naming `split` or `hero` with no `cover-image` fails the build rather than drawing an empty half. The five type compositions each take a `::: backdrop` as well, which is how a photograph reaches a cover with no picture slot of its own; on `panel` the field becomes the scrim, so the picture reads through a plate of the accent rather than under the paper veil.

**`editorial` was the tenth and has been removed.** It drew a 4px accent rail down the left edge of the type. A coloured bar welded to the side of a text block carries no information and is present only so that the theme colour appears somewhere on the slide, which is the most reliable single tell of a machine-made layout; it is named as one in Anthropic's own artifact-design guidance, and it was the specific thing the lecturer objected to. Nothing replaced it one for one. Its one good idea – the meta set as a row of credits rather than four stacked lines of equal weight – is what `masthead` runs along the bottom of the slide. `rule` went with it for a smaller reason: it was `stack` plus two hairlines, and "centred" against "centred with lines" is not a choice a lecturer is making.

**A deck closes the arc with `## closing:`, and it is a tag rather than a second `title:` chunk.** The last slide is drawn in whatever composition `cover:` names, so the room sees the shape it started with – but it carries the author's own words and neither the presenter line nor the `info` block. Those two say who is talking and where, which the room learned an hour ago, and setting them again in the same composition is a slide that reads as a mistake in the deck rather than as an ending. The composition is inherited and the content is written, which is what makes it the same shape without being the same slide. Three things ruled out the alternatives. A title chunk's heading is *ignored* (§3) because the cover renders from frontmatter, so a closing slide could only get its own words by making the heading mean something on the second occurrence, which is a positional exception to a frozen rule; `lint.js` already warns that a second `title:` chunk does not render, so the two spellings would contradict each other; and a frontmatter key could only ever recombine the cover's own fields, which is exactly the repeat this slide exists not to be. The four picture compositions draw their type alone here – a closing slide never reaches for `cover-image` – and a `::: backdrop` on the chunk gives it a picture of its own.

**A finished 1.0.0 deck must be able to lay out the way it did**, and the three things that have moved since are each reachable as an ordinary preference: `fonts: {sans: Inter Tight}`, `style: {wrap: none}`, `ligatures: all`. Deliberately *not* a version key. One key naming a release reads as a promise to rebuild any past release, which is unbounded – every later stylesheet change would have to be gated on a generation and the untested combinations would multiply – and it puts the burden on the author to know which version their deck was authored against. Each of the three is a preference someone might want on its own merits, so the old look is a recipe rather than a mechanism. Title-chunk composition is outside the promise: a cover is one slide, and this revision was asked to fix it.

**A figure can walk itself.** `::: draw {autoplay=1200}` advances the figure's own steps on a timer once the slide is on screen, one delay for every step, so a cover figure moves while the room files in. It calls the same advance the Space key calls, so it is one counter and the speaker view follows for free; it runs in the audience only and stops for good on the first key, pointer or wheel event, because a lecturer who has touched the deck has taken over.

**A slide is a frame, and the frame can carry more than a text column.** Three directives, all additive:

- `::: backdrop <ref> {classes}` – a full-bleed image behind the whole slide, on any chunk. Its scrim is the theme's own paper by default, so ordinary ink stays legible over a photograph in all seven themes; `invert` turns the slide's ink light instead.
- `::: overlay {classes}` … `:::` – a grounded text block laid over the slide, placed in one of nine cells. The ground is the point rather than decoration: text laid straight onto a photograph is unreadable at the back of a room.
- `::: cards N` – N equal containers in a row, N from 1 to 6. Distinct from `::: cols N`, which is one text flow balanced across N tracks and may spill a paragraph from one column into the next. Use `cols` for an argument that runs long and `cards` for a comparison the room should be able to count. One card is a callout. A row is refused inside any directive that has already divided the measure, and so is a `::: draw` inside `::: cols`: both were silent no-ops that defeated the column flow, so the author wrote `cols 2` and got one column with nothing to say why.
- `::: rows` – the same container turned ninety degrees: a term in a card on the left, its body beside it, several stacked. Deliberately not a new construct – same slots, same fold, same print rules – because the only thing that differs is the arrangement of the item.
- `::: side` takes an optional ratio (`::: side 2:1`). That turned out to be the whole of what *figure beside the text* needed; figure *above* or *below* needs nothing at all, being document order.

**A section divider is not a second title slide.** `section:` gives a column's divider six compositions – `plain`, `tinted`, `rule`, `card`, `number`, `outline` – and every one is quieter than the cover, because a divider that can be mistaken for the title has failed at the one job it has: to say that a new part starts here and that it is part of the thing you are already in. `tinted` is the strongest of them and still only takes the accent at 12% over the paper, which is enough to arrive across a room before any word does. `outline` is the one that is a different slide rather than a treatment of the heading: it lists every part of the lecture and marks this one live, which answers the question a coloured field cannot – not *a new part starts* but *which part, out of how many, and how far in are we*. It is also the recurring element a long lecture needs, and it works only because the list is stable, so the heading **is** the live item rather than a second copy set beside it. **A divider can also carry its own content:** the lines between a `# Heading` and the first `##` chunk, which used to be dropped without a word, are the divider's slide. A blockquote there opens the part on a quotation, a `::: backdrop` on a photograph, a `::: draw` on a figure – three things authors ask for and no vocabulary added for any of them. Those words print, as a lede under the part title; the divider slide itself never has. The same list is available as a chunk, `## outline:`, for the agenda a lecture wants right after its cover, where there is no column boundary for a divider to be generated at. The hard-coded paragraph sign over the heading is gone – it is a legal-citation mark that reads as a statute number outside a German law faculty – and `section-mark:` puts a word there instead, or nothing.

**A chunk's heading can belong to the document and not to the slide.** `{.bare}` in the attribute tail renders the heading in `print.html` and in the search index, and not on the projection; `style: {headings: off}` says the same for a whole deck. The case is a talk that is a run of `::: draw` figures with speaker notes – the room looks at the drawing, and the deck still needs a name per slide to navigate by and to print. Leaving the heading *text* out gives up all four at once, which is why this exists as a separate switch. It is `display: none` rather than a dropped element, because the search index and the speaker's own lists read the heading out of the DOM. Neither table of contents does: both list column headings only, so a chunk heading was never in one.

**And where a chunk's prose sits can belong to the slide and not to the document.** `{.center}` is the tail's second non-width class: it sets the chunk's own paragraphs on a centre axis, on the projection and in the cockpit, and leaves `print.html` byte-identical. The case is the one or two lines under a figure – left-aligned they start at the far edge of a wide slide while the drawing sits in the middle, and the two read as unrelated blocks. It reaches `.chunk-body > .reveal-segment > p` and nothing nested, so a list, a table, a code listing and the prose inside a `::: side` pane or a `::: cards` row all keep the left edge they need. It is a class an author writes and **not** a default for the `figure:` tag: that was built first and reverted, because the seven-line paragraph under `lectures/diagrams` `#flowchart` came out ragged on both edges and hard to read, and no selector knows how long a caption is. It moves the prose and not the heading – where a heading sits is `style.headings`'s question, and a chunk class answering it too would be a second, stronger way to say the same thing that `style: {headings: left}` could no longer override.

**A lecture can set its own type, within bounds.** The `style:` block carries `headings` (`auto` keeps the per-tag treatment; `left` overrides all of it; `off` takes it off the projection), `rules` (the hairlines above principle and definition chunks), `labels` (the generated tag word), `link-codes` (the mark after an external link), `wrap`, and `heading-scale` / `body-scale` as multipliers on the tool's own scale. The two scales are bounded to 0.6–1.8, because outside that range the collapse mode, the code-width clamp and the auto-fit camera stop agreeing with each other and the result is not a look but a bug report.

**An external link says that its address can be shown.** The address view – both screens, set large, with a QR code beside it – is what a room actually needs from a link, and up to 1.0.0 it was reachable only by `Shift`-clicking, a gesture nothing on the slide mentioned. A small mark after every `https?://` link opens it now; `Shift`-click is unchanged, and a plain click still opens the page in a new tab. It is a `<button>` and not a second anchor, so it says what it does and answers a key – the key map stands back for that one button, because the deck binds `Space` and would otherwise advance the slide instead. `style: {link-codes: off}` takes the marks away, which is also how a deck gets the 1.0.0 rendering back.

Additional moves available inside the slide:

- **Bold core statement** inline in body, at most one per chunk.
- **Monospace sketch block** for ASCII figures.
- **Inline math** via KaTeX, display math via centered `$$` blocks.
- **Expandable detail** via a chevron in the bottom-right of the slide (label-abbreviated `Ex`, `Exp`, `Ref`, `?`, `Pf`, `Fig`, `Set`); opening splits the slide into content-left / expansion-right.
- **Annotation box** on the left, activated on demand, camera pans to reveal (see §2 annotation slot).

### 4.5 Collapse modes (projector-only)

The projector view can selectively hide parts of each slide's body to reduce information density while the slide is read aloud. `C` cycles two modes:

| Mode | What remains visible |
|---|---|
| `none` | All body prose – the rehearsal and recap mode |
| `topic-bold` | First sentence of every paragraph, plus any bold phrases in the rest |

`topic-bold` is the default: the speaker narrates the topic sentences aloud while bold phrases anchor the eye. The `topic`-only and `bold`-only modes from the original four-mode design were dropped – in practice nobody reached for them, and each extra stop in the cycle costs a keypress during a live talk.

Collapse applies to the *projector* stage only; the presenter view always shows the full text. The collapse setting is a lecture-time affordance, not a source-level decision – authors write the full prose once; the speaker chooses the collapse level per lecture.

**Explicit slide content (`::: slide` / `::: script`).** Deriving the slide from the shape of the prose asks a lot of the author: every paragraph has to open with a sentence that works as a standalone bullet, which fights against writing continuous text. Two directives opt a chunk out of the derivation and let the author state the split outright:

```markdown
## principle: Anonymity needs a crowd {#anon-crowd}

::: slide
- Anonymity is a property of the **crowd**, not of the channel
- A mix with a single user protects nobody
:::

Anonymity only arises once enough others do the same thing. A mix node that
forwards one message reveals it by timing alone – no cryptanalysis needed …
```

The dual form, for chunks where the narration is the shorter half to mark:

```markdown
## definition: Anonymity set {#anon-set}

The anonymity set is the set of all senders that could plausibly have sent
an observed message.

::: script
Formally an equivalence class over the attacker's observation model, and the
model decides the size …
:::
```

Precedence, highest first: a `::: slide` block is the slide; otherwise everything outside `::: script` is the slide; otherwise `topic-bold` applies as before. Rule 1 wins, so a chunk may carry both blocks. Consequences:

- **Per-chunk, not per-lecture.** Mixed decks work, and every existing lecture keeps behaving exactly as it did – the derivation is the fallback, not the deprecated path.
- **No new mode in the `C` cycle.** `none` still shows everything in source order; `topic-bold` still means “what the room sees”. The author's markup, not a global switch, decides which half that is.
- **Nothing is abridged inside an explicit block.** Sentence extraction skips those subtrees, so paragraphs, lists, figures, and code render whole.
- **The blocks nest.** A `::: slide` inside a `::: side` pane or a `::: cols` flow works: the wrapper stays visible because it contains the slide block, and only the wrapper's other content is hidden.
- **The unit is the reveal segment, not the chunk.** A chunk whose segment 0 carries a `::: slide` and whose segment 1 does not gets explicit treatment for the first and the derived treatment for the second.
- **Print keeps both halves** in source order, with the slide block marked by a hairline rule. The reading copy is the union; only the projector is the selection.
- **Density budgets (lint) apply to the on-screen half only.** Narration is deliberately unbudgeted.

**Collapse composes with progressive reveal (§4.6).** Each reveal segment is independently filtered by the active collapse mode. In `topic-bold` with three reveal segments, advancing reveal shows the topic sentence and bold phrases of segment 1, then segment 2, then segment 3 – never the full body unless collapse is toggled to `none`. Explicit blocks compose the same way: a `::: slide` inside segment 2 becomes visible when segment 2 does.

### 4.6 Progressive reveal

Chunks that build up an argument or list over time can be segmented with `---` lines in the body. At lecture time, the chunk enters with only segment 0 visible; subsequent segments reveal in place, without moving the camera.

```markdown
## free: An argument in steps {#stepped-argument}

Opening claim we start from.

---

First consequence that follows.

---

Second consequence, which is the punchline.
```

Semantics:

- **Forward navigation into the chunk.** Entering via a forward key, overview, or deep-link shows segment 0 only. Subsequent segments are hidden.
- **Forward** – `Space`, `↓`, `Enter`, `PageDown`, and `→` (see §5 for the one place `→` means something else): advance to the next segment on the active chunk. When all segments are visible, any of them passes through to “next chunk” navigation, so one key is the single forward key for a whole lecture. `↓` used to skip the reveals entirely, which meant navigating with the arrows silently swallowed every segmented slide.
- **Backward** – `↑`, `PageUp`, `Backspace`, and `←`: **take the last segment back**, and when the chunk is at its opening state, step to the previous chunk. Reveal is not a forward-only mechanism: a figure that assembles itself is often worth assembling twice, and a lecturer who has just finished building one and sees a puzzled room needs to be able to run it again without leaving the slide and coming back. The machinery was always symmetric – every beat's state is recomputed from the counter on each apply, and a diagram step renders in either direction – so this was a property of the key map rather than of the design.
- **Entering an earlier chunk from anywhere else** (`↑` from a chunk at its opening state, the overview, a deep link): the target chunk is shown **fully revealed**. It does not need to be re-performed on revisit; the speaker coming back to answer a question sees everything they already showed, and `←` then walks back into it if they want to replay it.
- **Camera.** Reveal never moves the camera. The slide stays framed; segments fade in place.
- **Speaker view.** Only the currently-focused slide reflects live reveal state. The next-previews pane and any scrubber thumbnail always show slides **fully revealed**, so the speaker can see where each upcoming slide will land.
- **Print view.** Reveal separators are invisible. Print always shows the full body in reading order.
- **Composition with collapse.** See §4.5. Each reveal segment is independently filtered by the active collapse mode; the two mechanisms are orthogonal.

Discipline: reveal is for the chunks where the *sequence* of ideas is the point – a definition that assembles itself, a numbered argument, a sketch that accumulates. Most chunks should be unsegmented. The linter (§9) warns if more than ~20% of chunks contain reveal separators, because at that point reveal has become the default mode and its dramatic effect is lost.

### 4.6a Diagrams and their steps

A `::: draw` block is a boxes-and-arrows figure written in the lecture source and compiled to inline SVG at build time. It exists because the two obvious alternatives both fail the same lecture:

- **Auto-layout tools (Mermaid, PlantUML)** decide where things go. For a diagram whose arrangement *is* the argument – a stack frame in address order, three parallel cipher blocks – the layout engine is the problem, not the service.
- **A drawing tool (Excalidraw, Inkscape, Figma) plus layers** gives free placement but knows an arrow only as a line. Move a box and every arrow touching it has to be redrawn by hand, in every step. Layers can reveal; they cannot re-route.

The DSL takes free placement from the second and connectivity from the first, and drops auto-layout:

```markdown
::: draw {unit=130x76}
box sender "Sender"
box mix    "Mix"       right of sender gap 0.6
box log    "Logfile"   below mix gap 0.8   {.dashed}

edge sender -> mix "encrypted"
edge mix -> log    {#leak .dashed}

text why "here the anonymity breaks" right of log gap 0.8 -> log {.hand}

step leak
  show log
step collapse
  move mix to below sender gap 1
  emph leak
:::
```

Grammar, in full:

| Statement | Meaning |
|---|---|
| `box <name> "label" <placement> [w n] [h n] [pad n]` | A rectangle that sizes itself to its label – unless `.fit` / `.shrink`, where the type sizes itself to the box |
| `dot <name> "label" <placement> [r n]` | A circle – XOR nodes, junctions, small glyphs |
| `image <name> <asset> <placement> [w n] [h n]` | A picture. `<asset>` resolves like `![](fig-id)`: `assets/<name>.{svg,png,…}`, a path, or an https URL |
| `text <name> "label" <placement> [w n] [h n] [pad n] [-- ref]` | Free text with no shape of its own, unless it carries a tone, and then it draws its own ground; `-- ref` grows a plain leader line to whatever it comments on, and `-> ref` one that points. `.left` / `.right` align it, and the anchor moves with them |
| `edge [<name>] <a> -> <b> ["label"] [side <word>] [pad n] [via x,y …]` | An arrow. `<-` reverses it, `--` drops the head, `<->` puts one at each end. The optional name goes **before** the from-endpoint. `side` says which side of the line the label sits on; with none it sits on the line. One `via` carries every waypoint |
| `container <name> ["label"] over a,b,c [pad n]` | A drawn box that fits itself around its members |
| `align x\|y <edge> a,b,c` | Line up one coordinate: `left`/`middle`/`right` on x, `top`/`middle`/`bottom` on y |
| `spread x\|y a,…,z` | Equal spacing between centres; the first and last stay put |
| `brace <name> over a,b [side <word>] ["label"] [pad n]` | A bracket spanning a subset, label outside |
| `default <kind> [@tag] {classes} [options]` | The base styling and size for that kind, optionally only for elements carrying a tag. The options are exactly the ones that kind's own statement takes – `w`/`h` for a box, text or image, `r` for a dot, `pad` for a container or brace |
| `bars <name> "values" ["ticks"] <placement> [w n] [h n] [aspect W:H] [space n] [emph i,j] [dim i,j] [ghost i,j] [series of <chart>] [stacked] [horizontal]` | A column chart, or a bar chart with `horizontal`. `series of` joins another chart's frame instead of drawing one |
| `grid <name> <kind> CxR <placement> [cell n] [space n]` | C by R copies of one box, dot or image |
| `plot <name> ["x title"] ["y title"] <placement> [w n] [h n] [aspect W:H] [x lo,hi] [y lo,hi] [tick n]` | A cartesian frame to draw in, and a mapping so `roc@0.35` names a value in its own units. `tick` is the interval between gridlines |
| `table <name> "head \| head" <placement> [w n] [col a,b,c] [row n] [space n]` | A grid of labelled cells. `row` is the height of one row and `w` the width of the whole frame, so `w` and `col` together are refused. The body rows are bare quoted strings on the lines beneath it |
| `lanes <name> "one \| two \| three" <placement> [w n] [band n]` | Bands of equal width with turned captions outside the left edge; `band` is the height of one band |
| `sequence <name> <placement> [w n] [header n] [space n] [unnumbered]` | A protocol running down the page; `header` is the height of one actor head. Its entries are the indented lines beneath it: `actor <name> "label"`, `[<name>] a -> b "label" ["second line"]`, and `note <a>[,<b>] "label"`. The statement sets the vertical rhythm and nothing else, so a note pushes what follows it down |
| `step <name>` | Opens a step; the indented lines below it are its operations. One name, spelled the way an element name is |

**Six of those statements draw nothing of their own: they expand, at parse time, into ordinary boxes, texts and edges.** `bars`, `grid`, `plot`, `table`, `lanes` and `sequence` are shorthand, not element kinds. Nothing downstream learns about them – so `brace over f-0,f-1,f-2` spans three columns of a chart, a `style` step tints one cell of a table, and the visibility rule, the tween, the viewBox and the linter all keep working on the elements they already understand. What makes the expansion possible is that an `at` may name another element's coordinate: every column, cell and band is placed against a frame the same statement creates, through the ordinary dependency walk.

The bar for adding one is the same each time, and it is not expressiveness: **the hand-built version has to be the thing that cannot be maintained.** A table of six rows by three columns costs twenty-one hand-named boxes and a chain of relative placements that has to be re-aimed whenever a row is inserted, which is the edit a diff and a reviewer both handle worst. A swimlane's bands cannot be `container`s at all, because a container fits its members and bands holding different numbers of things then come out ragged at both ends. A flowchart and a tree need no statement of their own – they are boxes and edges arranged, and `figure-design.md` shows each of them in a dozen lines. A sequence of messages passed the bar and `sequence` was added on the same test: the old grammar drew the picture already, in 41 lines and with no warning, and what justified the statement was what it cost to *change* it. Inserting one message in the middle of the hand-built version meant rewriting thirteen lines – five numbers, five vertical positions and four lifeline lengths – because nothing but the author was keeping the vertical rhythm. It is one line now.

**A coordinate is a number in grid cells, or another element's coordinate with an optional signed nudge:** `1.12`, `x0.cy`, `iv.left`, `mix.cx+0.2`. **Every place a coordinate pair is accepted takes that same form** – `at X,Y`, `move … to X,Y`, a waypoint, an edge endpoint – so `edge iv -> x0 via iv.cx,x0.cy` reads as what it is (straight down from the IV, then across at the height of the XOR) and `box m at c1.cx,m0.cy` puts a box in a column without measuring it. Referring to the wrong axis (`.top` where an x belongs) is an error naming the three that fit, and a reference in a placement is a real dependency, so a circular one comes out as `placement cycle: …` rather than a plausible wrong picture.

**An edge is addressable like anything else.** `w1.cx`, `w1.cy`, `above w1 gap 0.2` – the box a coordinate reads is the bounding box of the route. This matters for one thing above all: a phrase that describes a wire belongs to the wire. Pinned to one of the boxes at either end, it keeps its distance from the box and loses it from the line as soon as a fraction or a height changes, and nothing says so. An edge's dependencies are its two ends and its waypoints, all already in the layout walk, so it joins the same topological sort and a genuine circle is reported as `placement cycle` naming the line.

Because a coordinate is written `name.prop`, an **element name is letters, digits, `_` and `-`, starting with a letter**. A name with a dot in it would be indistinguishable from a coordinate; the build says so rather than resolving it one way in silence.

A **comment line starts with `#`**.

This exists because the alternative is measuring. Rebuilding the six example slides needed a browser open and three numbers read off the screen; every one of them is now a relation. A generated diagram has the same problem with no browser at all.

**The nudge is one optional signed term.** A graphical editor answering a drag must not replace a reference with an absolute number – that destroys the relation the author wrote. With the nudge in the grammar it rewrites exactly one token and the reference survives, which also means the token to replace is never ambiguous.

An edge endpoint may also be a bare coordinate – `edge a.left-0.8,a.cy -> a` is an arrow arriving from outside the picture. A literal rather than an invisible anchor element: there is nothing to delete by accident, and a graphical editor dragging that end rewrites two numbers on that line instead of moving an object nobody can see.

Placement is `at X,Y` in grid cells, a relation – `right of A`, `left of A`, `below A`, `above A`, each taking `gap <n>` and `flush <edge>` – or `between A,B [frac <n>]`, which is the position PIC spells “1/2 way between A and B”. Any of them takes a trailing `offset dx,dy`. **The first element defaults to the origin**, so the common case – a box, and everything else relative to it – needs no coordinates at all. Every element after it has to say where it goes; silently stacking two elements on `0,0` is not a default anyone means.

An element's **name is the word after its statement** – `box mix "…"` – and an `edge` or a `sequence` message, which have no such slot, take an optional name immediately before the from-endpoint: `edge wire p -> q`. What the braces at the end of a line hold is appearance and membership: `{.tone-1 !accent @crypto @phase2}`. Three sigils, three questions – `.` adds a class, `!` takes one off by exact name, `@` is membership. A tag is addressable wherever a name is: `show @crypto` in a step, `container tee over @crypto`, `align y middle @row2`. Membership lives on the element's own line, so adding an element to a set is a local edit and the order of declarations does not matter. There is no separate `group` statement; tags replace it, and one element can belong to as many sets as it likes.

**`align` and `spread` do not place an element, they take one coordinate of it from somewhere else.** The first element listed is the master and keeps its position; the rest follow. Both are modelled as an extra dependency plus a coordinate override inside the same topological walk, so there is still no solver and no second pass. `spread` distributes the interior members between the first and the last, on centres rather than on gaps – chained `right of … gap n` already gives equal *edge* gaps, and those are only the same thing when the elements are equally wide.

This is what closes the commonest alignment failure: two columns built as separate `below … gap n` chains drift apart as soon as their captions differ in height, and a line drawn between two drifted elements runs a degree or two off the axis, which reads as a mistake. `align y middle a, b` states the intent in one line. An element distributed by `spread` must not be what an endpoint is placed against – that is genuinely circular, and the build says `placement cycle: q → s → r → q` and names the line rather than drawing a plausible wrong answer.

Anchors are addressable and chosen automatically otherwise: `mix.right`, `ret.br`, and `mix.right:0.3` to slide the attachment point along that edge. **The fraction is what keeps two arrows between the same pair of boxes from collapsing into a lens** – give them `0.3` and `0.7` and they are two parallel arrows rather than two bows over the same chord. There is deliberately no automatic fan-out of parallel edges: it would change an existing diagram silently.

**Routing is the author's, with one bounded exception.** An edge is straight segments through the waypoints written for it; nothing steps around a box. `.elbow` is the exception: it turns once out and once in, the rail sits halfway across the gap on whichever axis the two ends are further apart, it looks at nothing else in the figure, and there is no option to move it. The rail is measured between the two elements' facing sides rather than between their centres, so several children of one parent turn on the same line and the set reads as one bracket, which is what a tree is made of. Writing `.elbow` and `via` on one edge is an error rather than a preference the build guesses at.

Step operations are `show`, `hide`, `move … to`, `move … by`, `emph`, `dim`, `ghost`, `style`, `label`. Nothing else. The three prominence verbs are the three prominence classes, so `dim a` and `style a {.dim}` are the same act; a `style` with nothing to add and nothing to remove is an error rather than a line that quietly does nothing. A step operation takes a tag wherever it takes a name, with one exception the build refuses rather than draws: `move @tag to …` would give every member of the set the same placement and stack them on one point, so it is an error naming `move @tag by dx,dy`, which is what translating a set means. A class added by `style` **displaces** the one already in its slot, the same rule the `default` block follows – adding it alongside would leave two rules matching at equal specificity and let stylesheet order decide.

`same as <element>` copies that element's width and height – “as wide as that one”, rather than a number repeated down the diagram. It copies geometry only; styling is what `default` is for.

`default box @dec {.round} w 0.48` refines the kind default for the elements carrying that tag. Three layers, resolved weakest first: the kind default, then the tag default, then the element's own `{…}`. At each layer a `!class` removes that exact name from what has accumulated and a `.class` displaces whatever else holds its slot, so the most specific layer wins and an element can opt out of a default by name. One per kind and one per (kind, tag), so the result never depends on the order of the declarations, and a tag no element carries is an error rather than a line with no effect.

**A lecture's figures should look like each other, so the same `default` statements can be written once for the whole lecture** – a `draw-defaults` frontmatter key, in the same language:

```yaml
draw-defaults: |
  default box       {.tone-2} w 1.0
  default text      {.small .muted}
  default container pad 0.4
  default box @dec  {.round} w 0.48
```

Repeating those lines in twelve blocks decays: change the look and it is twelve edits. **Not** a named-preset system (`use=house`) – a single lecture-wide set adds one key and one layer, where presets would add a keyword to the grammar, a lookup, a "no preset named …" error and another table for `lint.js` to mirror. If one lecture ever genuinely needs two visual families, presets stay additive and can be added then; until then the escape hatch is the one that already exists, a `default` line inside the block.

**Precedence is one sentence: the nearer the declaration, the stronger it is, and in one place a tag beats the bare kind.** So four layers, most specific last:

1. `draw-defaults` – `default <kind>`
2. `draw-defaults` – `default <kind> @tag`
3. the block's own `default <kind>`
4. the block's own `default <kind> @tag`
5. the element's own `{…}` and `w` / `h` / `r` / `pad`

Scope before selector, because "closer to the element wins" is the model everywhere else here. A block that says `default box {.tone-4}` means it, even for an element the lecture tags `@dec`.

The tag rule widens with the scope: **a block-level tag default must be used in its block; a lecture-level one must be used somewhere in the lecture.** One is written for one figure and the other for twelve, most of which will not carry `@dec` – but the build sees every diagram, so a typo in the frontmatter still fails rather than sitting there doing nothing. The block is validated even when no diagram uses it: anything but a `default` statement in there is an error naming the line.

**`default` applies to every element of its kind wherever it stands, and there can be only one per kind.** Position-dependent defaults – DOT's model, where a declaration affects only what follows – are more expressive and were rejected: they make the source order-sensitive in a way nothing on the page shows, so moving a declaration three lines up silently changes its colour. An element's own class **displaces** a default in the same slot rather than stacking with it: `.tone-1` on a box beats `default box {.tone-4}`, because otherwise both rules match at equal specificity and the one written later in the stylesheet wins, which is not a rule anyone can see. Two classes from the same slot in one attribute tail is an **error** for the same reason: the line gives two answers to one question, and either answer would be chosen by stylesheet order rather than by anything the author wrote.

The class vocabulary is a closed enumeration, and almost all of it occupies a **slot**, which holds one class at a time: fill (`tone-1`…`tone-4`, `clear`, `paper`), ink (`accent`, `muted`), stroke pattern (`dashed`, `dotted`), stroke weight (`thick`, `bare`), outline (`round`, `sharp`, `hex`, `diamond`, `chevron`, `wedge`, `cross`), size (`small`, `large`), family (`mono`, `serif`, `hand`), fit (`fit`, `shrink`), how a line is drawn (`smooth`, `elbow`), text alignment across (`left`, `right`) and down (`top`, `bottom`), prominence (`emph`, `dim`, `ghost`) and arrowheads (`no-head`, `one-head`, `both-heads`). `bold`, `turn` and `front` contend with nothing and stack freely. Two members of one slot in one tail is an error; a class in a slot a `default` already filled displaces it rather than stacking. **A class that competes for a channel arrives with its slot or it arrives broken**: `thick`/`bare` and `mono`/`serif`/`hand` were slotless once, so a `default box {.thick}` and an element's own `{.bare}` stacked and stylesheet order decided which one showed – and prominence and arrowheads were the same defect discovered later, `.dim` beside `.ghost` resolving and moving nothing, `.no-head` beside `.both-heads` drawing the opposite of the first.

**A class is also legal only on a kind that draws something it can reach.** `.hex` on an edge, `.left` on a brace, `.elbow` on a box: each is refused, and the refusal names the question the class answers rather than only the word. The three arrowhead classes are the one channel every edge is forced to speak on, because the arrow token is the operand separator – so a head class in an element's own tail or in a `default edge` block is refused as well, and a `style` step is the only place one may be written, being the one place a token cannot be re-run.

Four of those names answer needs the vocabulary could not express:

- **`clear` is a see-through interior.** `bare` removes the *stroke*, so a frame you can read through – an outline over an image, a box marking a region – had no spelling at all.
- **`paper` is the canvas colour, named.** It is a box's default, but a box under `default box {.tone-3}` had no way back to it, and a free `text` could not have a ground at all – which is the reason to give a label one, so it can knock out a line running behind it.
- **`serif` is the upright serif.** `hand` is the same family forced italic and accented, which is the annotation voice; until `serif` existed the family was reachable only through it.
- **`fit` and `shrink` size the type to the box** instead of the box to the type. Both need the box to be given – `w n` or `same as X` – and an element with neither is an error rather than a line that does nothing. The chosen size is clamped to 0.6–1.5× of the element's base size, so a long label cannot become unreadable and a short one cannot become a poster. The error term: label width here is *estimated* from a per-character table, tuned deliberately generous, and auto-fit compounds that, so the chosen size runs slightly small. That is the safe direction – small still fits – and it is the price of having no browser at build time.

A **free `text` draws a ground when it carries a fill**, and a box is the same mechanism read the other way: one draws the measured label box padded, the other defaults to paper and opts out with `clear`. `paper` counts as a fill for this. That is exactly how the two already looked, so nothing existing changes.

**An edge's label reads the same rule.** A fill class on an `edge` draws the same ground behind its label, and with no `side <word>` the words then sit *on* the line and knock it out; naming a side lifts them clear and carries the ground with them. It is an option rather than the four alignment classes, which on a box, dot or text are two independent channels and would have meant two geometries chosen by kind. What that buys over a `text` placed `between` two boxes is that the label is held at the middle of the *route*, so it stays there when the route bends or either end moves. Which of the two placements to use is a convention rather than a rule, and the reading that works is on-the-line for a token that identifies the line – a sequence number, a port, a message type – and beside it for a phrase describing what travels along it.

**`pad` works on a box and a text as well as on a container and a brace**, and it is the same sentence in all four: how far the outline sits from what it encloses. One number in grid units, measured on the vertical unit for both axes – as the container's already was, or the same word would mean two distances depending on the statement it sat on. **That is the general rule for every clearance in the grammar**, `gap` and `space` included: a number that *addresses* the grid is axis-keyed, because a cell has a width and a height, and a number that states a clearance is square with one row as its ruler. `gap` was the exception until the corpus showed the size of it – measured across the whole of it, `gap 1` sideways was on median 2.9 times `gap 1` downwards, with nothing in the source to say so. Without it the default stays an asymmetric px pair, because 13/9 is typographic taste rather than a point on the grid.

Inside a label, `_sub` and `^sup` shift a character or a `{group}`, `*accent*` colours a run with the theme accent and `~muted~` greys it. An unmatched marker stays a literal character. This exists because a sentence with two colour changes otherwise needs one `text` element per run, chained with `right of` – unreadable as source, and re-sorted by hand every time a word changes.

**A grid cell is not square, so `w` and `h` are a poor way to say what shape something is.** They are counts of grid cells, and at `unit=150x52` a plot written `w 1.9 h 1.5` lands 285px by 78px – nothing on that line hints at it, and it is the one place where the coordinate system leaks into a decision the author is making about the *picture*. `aspect W:H` on a `bars` or a `plot` states the proportion the reader sees and lets the build work the other number out. It is the only dimension in the grammar expressed in page terms rather than grid terms, and it is expressed that way because the grid is exactly what obscures it. Giving `w`, `h` and `aspect` together is refused: two ways of stating one number is two ways of stating different ones. `same as <chart>` is the third way, for the row of comparable frames the shared-baseline advice asks for, and it is the one place `same as` is answered while the line is read rather than during layout - a chart's contents are positioned from its own dimensions at parse time, so a size arriving later would move the frame and leave the gridlines behind it.

**A bar chart runs sideways with `horizontal`, and that is often the better reading**: a reader ranks lengths from a shared left edge more reliably than heights from a shared floor, and a category called "DNS cache poisoning" cannot be written under an upright column at all. One expansion serves both orientations, so a series, a `brace` over three bars, `emph` by column index and the tween all work unchanged; what swaps is the tick strip, which becomes a right-aligned column down the left margin, and the baseline, which stands on the left. A tick string containing `|` is split on that rather than on spaces, which is what lets those row labels be phrases – the same mark that separates a `table` row and a `lanes` name.

**How large a diagram lands is the chunk's width class, not the `unit` option.** `unit` sets the grid cell and therefore only the proportions inside the picture; the drawing then fills its chunk's measure the way any other figure does, capped so a tall one cannot push the prose off the slide. Put a small diagram in a `.standard` chunk and a dense one in `.full`.

Semantics that follow from the design, not from convenience:

- **A step is one press of `Space`**, the same key that advances a reveal segment, because it is the same counter. A chunk that mixes prose reveals and diagram steps advances through both in document order.
- **An element's position is a function of the step.** Layout is evaluated once per step, so an arrow between two boxes re-routes when either moves.
- **Visibility runs downhill, and it is one rule with three faces.** An edge is only as visible as the two things it connects; a `container` or `brace` only as visible as its members, and it fits the ones that are on screen; a `text` that grew a leader only as visible as what it points at. So most of a diagram needs no `show` of its own – revealing the boxes reveals the arrows between them, the outline around them and the note beside them – and nothing is ever drawn pointing at, or wrapped around, something nobody can see.
- **It is a default, and naming the element overrides it.** A `show` or a `hide` that names an edge, a container or a brace outright wins over the rule, in both directions and for that beat and every beat after it – so a wire that has to be on the slide before either of its ends, or one that has to come away while both ends stay, is one line rather than an impossibility. This is not a second mechanism: `show edge-1` already parsed and already wrote the state, and the rule then threw the answer away. Where no step says anything about an element, the rule decides, which is the case for nearly every line of nearly every figure.
- **Print is the last beat, and its prominence is the opening beat's** – a handout is the finished picture, not its first beat, and not the union of every beat either. The seam is the line rather than the word: a prominence class on an element's own line is part of the drawing and appears in the handout, while a prominence a `step` sets is a lecture-time act and does not. An arrowhead a step removed is not printed either. `hide` is the author saying an element is gone by the end; reprinting it lays a withdrawn arrow across whatever took its place. Everything shown and never hidden is in the last beat anyway, so for a diagram that only builds up the two readings agree. The static attributes in the emitted SVG *are* that state, which is also why a view with no JavaScript shows the finished picture; the runtime widens the viewBox to hold every beat when it boots, so only the live views pay for the room an element needs to walk into.
- **Motion is off under `prefers-reduced-motion`**; the steps still step, they just do not travel.
- **A vector image follows the theme, a raster does not.** An SVG asset is spliced in as a nested `<svg>`, so it inherits `--ink` and `--paper` and re-colours with the `A` cycle, exactly like an inlined SVG figure. A raster is embedded as a `data:` URI and keeps its own colours in every theme – a photograph is a photograph in dark mode too.

Discipline: the same as reveal. A diagram earns steps when the *sequence* is the teaching – a construction that assembles, an attack that walks through a structure. A diagram that appears whole is the normal case.

### 4.7 Discipline

The 70/30 rule: roughly 70% of chunks use a quiet repeating vocabulary (body prose, standard width, `free` or `definition` tags). Roughly 30% take compositional risks (principle with thick rule, question centered large, figure with sketch, full-width chunk). Invert this and risk becomes the baseline; monotony returns through the opposite door. The playground's “anti-pattern” preset – every chunk widened, every tag promoted to `principle` – is the concrete visualization of this failure mode.

Density budget per chunk: body text should occupy no more than ~12 line-heights at default zoom, with slide padding ~14%. The linter enforces this.

---

## 5. Camera and navigation

**Motion vocabulary.** Two families, forward and backward, the way a presentation tool is expected to behave: perform the slide, then move to the next one. Every key in them means the same thing on every slide. Columns – the one thing psi-slides has that a linear deck does not – are reached with `Shift` and the sideways arrows, from anywhere.

- **Forward** – `Space`, `↓`, `Enter`, `PageDown`: the next reveal segment or diagram step on this chunk (§4.6); when there is none left, the next chunk in reading order, crossing into the next column at the end of one.
- **Backward** – `↑`, `PageUp`, `Backspace`: the segment or step before it; when the chunk is at its opening state, the previous chunk, crossing back into the previous column at the start of one.
- **→ / ←** are that same pair, on every slide, with nothing to learn about where you are standing.
- **`Shift`-→ / `Shift`-← are the next and previous column**, from any chunk. `Shift`-← rewinds to the head of the column it is in before leaving it, so returning to the top of a part and leaving the part are one key. Both stand still when there is no column that way, the rule the chunk keys already follow at the two ends of the deck.

  This was the arrows themselves until it was not: they meant *next column* on the head of a column and *next slide* everywhere else. The exception cost more than it looks. It needed a guard in the key map (`nextCol` falls through to the end of the lecture, so the head of the *last* column had to be excluded by hand, or one press skipped six slides – on a single-column lecture, all of them), it needed a per-chunk `sideways` field for the guard and the marks to share so the two could not disagree, and it needed two marks on screen to say which meaning was in force. And it could not do the thing a lecturer actually asks for, which is to leave a part from the middle of it. `Shift` is one meaning everywhere: the guard, the field and both marks are gone, and `nextCol`/`prevCol` simply stand still at the ends.
- **The mark at the foot of the viewport** is `⌄`, and it appears when forward has nothing left to reveal and will leave the column next. It says where a key *goes*, not what it means, which is why it survived the two that went. Drawn at the edge rather than on the slide, quiet enough to sit on a projection, and absent on the overview board and behind a blanked screen.
- **On a coarse pointer** – a phone or a tablet with no keyboard – both live views carry a rail along the bottom edge. It holds forward, back, overview and the two zoom keys; `C`, `F`, `A`, `#`, search and text selection sit behind a `⋯` button, because eleven round targets do not fit a phone held upright and the five that matter mid-talk should not shrink to make room for the six that do not. Every button calls the function its key calls and never a second code path, so the rail cannot come to disagree with the key map. Text selection is the one place the two models differ on purpose: on a keyboard it is `Alt` held down, because a mode is state you can forget you are in and the forgotten state here is the one where dragging no longer pans; a finger has no modifier to hold, so it is a mode there, shown as a pressed button and cleared by `Esc`.
- Click the chevron to open the active chunk's expansion (`1`–`9` opens the n-th).
- `1`–`9`: open the nth expansion on the active chunk.
- `Esc`: collapse expansion, return to parent chunk. In overview, dismiss without moving.
- `O`: toggle birds-eye overview (see below).
- `T`: toggle TOC overlay (flat list of columns; see below).
- `/`: in overview, start fulltext search over all chunk bodies.
- `P`: open print view in a new tab.
- `B`: blank screen (press again to restore). A dead-simple attention reset.
- `V` (speaker only): freeze the projection – the room holds its slide while the speaker reads ahead. Pressing it again goes live and catches the room up, which is why there is no separate resync key.

**Camera implementation:** CSS `transform: translate()` on a stage `div`. **No `scale()` at the camera level** – each slide is rendered at its native viewport-matching size, and zoom is a text-size multiplier (§4.2), not a camera operation. This removes the reveal.js-style bitmap-scaling failure mode entirely.

Transition: **250ms**, `cubic-bezier(0.45, 0.0, 0.2, 1)`. Snappy by lecture standards – a slower transition (e.g. 500ms+) reads as sluggish in a room; calibrated values came out at 250ms. Interruptible – pressing a new nav key mid-transition retargets without rebounding.

Three translation behaviors:
- **Next/prev column:** translate by one viewport width plus `column-gap` (8vw). Feels like a page turn.
- **Next/prev chunk within column:** translate by the slide's min-height plus `chunk-gap`. Feels like a scroll.
- **Annotation active (§2 annotation slot):** camera offsets right so the slide's left edge lands at viewport-X ≈ 55%, revealing the annotation box on the left. `Esc` returns the camera to slide-centered.

Zoom-induced overflow (when a chunk's rendered height exceeds viewport at high zoom) is handled by in-chunk scrolling via the mouse wheel – the camera pans Y within the chunk's bounds. Arrow keys always navigate between chunks; they never scroll within a chunk, so scroll and navigation are unambiguous.

**Overview (`O`):** Birds-eye view of the entire lecture – all columns, all chunks, rendered at reduced scale on a single pannable plane. This is the primary live-navigation tool for jumping to an arbitrary chunk.

- Click a slide to **select** it (thick border, no camera move). Selection is a stable state: you can inspect neighbors, scroll around, keep looking.
- Arrow keys move the **selection**, not the live slide: `↑`/`↓` step chunk-wise, `←`/`→` jump to the neighbouring column's first chunk. Unlike a click, keyboard selection re-centres the camera on the new pick, because the target is often outside the current frame.
- Press `O` again (or `Enter`) to **land** on the selected slide: overview dismisses, camera pans to that chunk.
- `Esc` dismisses overview without moving.
- Drag to pan. Wheel to adjust zoom (CSS scale on the overview stage only, so distance changes but text still reflows at any zoom level).
- The framing is a pure function of `(anchor chunk, scale, pan)`, and all three travel in the sync payload, so audience and speaker show the same board pixel-for-pixel. The anchor is set on entry and on keyboard/search selection; a click changes only the outline. See `speaker.md` §2.
- `/` starts **fulltext search**: as you type, chunks whose body, heading, or expansion text matches narrow to highlighted matches; non-matches dim. Enter commits the first match as the selection. This is the tool for “I want the slide where I said X”.

**TOC overlay (`T`):** A fixed side panel with a **flat** list of column headings only, not chunks. `Enter` jumps the camera to that column's first slide. The TOC's primary home is the **print view**, where chapter-level navigation is load-bearing for a linear document; in the live view it is a quick section-jump fallback. Overview + fulltext search is the main live-navigation path.

**URL deep-links:** `?c=chunk-id` opens at that chunk. Useful for student references (“in the lecture, section 3.2...”) and for resuming mid-lecture after a crash.

---

## 6. Zoom and reflow

The reveal.js failure mode is CSS `transform: scale()` applied to the whole deck – text rescales as bitmap, lines don't rewrap, narrow screens become unreadable.

This spec avoids that by:
- All sizes in `rem` or viewport units, not pixels.
- Layout via CSS Grid and Flexbox with relative tracks, not absolute widths.
- Root font-size is `clamp(14px, 100vh/40, 24px) * var(--zoom)`, where `--zoom` is controlled by the app's `+` / `-` / `0` hotkeys in fixed steps.
- On any zoom step, a `resize`-triggered pass recomputes chunk geometry and the current camera target so the focused chunk stays centered.
- `transform: scale()` is used **only** by the camera for pan/zoom motion, never for text sizing.
- Chunk widths are set in rem, so zooming in shows fewer chunks per viewport but keeps text at readable density.
- Native browser Ctrl+/- is not broken – since nothing is pixel-hard-coded, text still reflows – but it does not re-target the camera, so `+` / `-` / `0` are the documented, room-safe controls.

---

## 7. Speaker view

Separate browser window on laptop display. Opens via hotkey `S` from audience view. Synced via `window.postMessage` over the opener relationship (no server).

**Why not `BroadcastChannel`.** This spec originally called for `BroadcastChannel`, and the implementation had to move off it. Chrome gives every `file://` document its own opaque origin, so two tabs loaded from disk are cross-origin to each other and a `BroadcastChannel` in one never reaches the other. Since opening the output from `file://` with no server is a §1 non-negotiable, the channel had to be one that survives opaque origins: `window.postMessage`, addressed through the `window.opener` / child-window handle that `S` establishes. See `speaker.md` §2–3 for the field-level protocol.

**Architectural constraint.** The consequence is the same, and if anything tighter. Audience and speaker are two windows in one browser, linked by an opener handle, so they must run on the same machine in the same browser instance – the typical setup is a lecturer's laptop with an extended display, audience on the external screen, speaker view on the built-in. Driving the audience view from one device and the speaker view from another (e.g. tablet speaker view, projector audience view) is **out of scope** for Phase 0–2. A WebSocket-based sync mode is deferred to Phase 3 if the single-machine setup turns out to be a real limitation in teaching practice.

**Layout (three panels):**
1. **Current chunk large** – same rendering as audience, middle pane. Reveal state mirrors the audience: segments reveal in step with the projector. Collapse mode also mirrors the audience. This panel is the single source of “what is on the screen right now”.
2. **Next previews** – thumbnails of the following 2–3 chunks in reading order. **Always fully revealed**, regardless of the audience's live reveal state, so the speaker sees the complete target state of upcoming slides.
3. **Notes pane** – speaker notes for the current chunk, independently scrollable. Can scroll ahead or back in notes without affecting audience.

The scrubber (see controls below) also shows all thumbnails fully revealed. Reveal is a live-performance layer; the speaker's planning surfaces show the author's artifact.

**Controls:**
- Lecture scrubber at bottom: timeline of all chunks, click to jump.
- “Push to audience” toggle: by default, navigation from speaker view moves the audience. Toggle off to browse notes privately without moving the projector.
- Timer: elapsed lecture time, discretely shown.
- Sketch slots: editable textarea for any sketch slot the current chunk contains. Typing here updates the audience view live.

**Persistence:** current chunk ID, timer state, and sketch slot contents persist to `localStorage` per lecture file every 5 seconds. On crash or accidental close, reopening restores position.

### 7.1 Annotation slot UX (in-viewport)

Every chunk carries an author-editable annotation slot intended for live speaker marginalia – notes, ASCII diagrams, references added mid-lecture. Independent of the speaker view (§7) which runs in its own window. This section specifies the interaction.

**DOM anchoring.** The annotation box is a child of `.chunk-content`, not `.chunk`. This means the slot is positioned relative to the *visible text column* (which varies by width class and layout archetype), not the slide frame. Across a `narrow` pull-quote, a `wide` side-by-side definition, and a `full` sketch-hero figure, the annotation always sits just to the left of the content, with uniform gap.

**Geometry.** Positioned with `right: calc(100% + 2.5vw)` inside `.chunk-content`. Width `21vw`. Top aligned with content's top. Font: monospace (`JetBrains Mono`) by default for ~65-column ASCII, sans toggleable.

**State model.**

| State | Trigger | Visual |
|---|---|---|
| No content, active chunk | – | Dimmed `+ note` affordance in the annotation position |
| No content, not active | – | Nothing |
| Has content, not editing | `N` pressed previously, then `Esc` / blur | Annotation visible, `opacity: 0.4`, in slide's left margin. Camera does **not** pan – slide stays centered. |
| Editing | `N` or click on annotation | Annotation at `opacity: 1`; camera pans so content's left edge is at viewport 33%, revealing full annotation on the left |

The rule separating “has content” from “editing” is critical: a chunk that has a note continues to feel like a normal slide, with the note peeking from the left margin at reduced opacity. Only active editing shifts the camera.

**Focus management.**
- `N` on the active slide → starts annotation (creates if empty, re-focuses if exists). Textarea receives focus.
- `Esc` while editing → blurs textarea; camera returns to slide-centered.
- Click on the annotation's textarea region → focuses it (editing).
- Click on slide content while editing → blurs annotation (returns to slide).

**Growth.** Textarea is a single line initially (`rows=1`, `min-height: 1.5em`, `overflow: hidden`). On input, a listener sets `height: auto; height: scrollHeight px` – grows one line at a time as text wraps or Enter is pressed. No scrollbar inside the textarea. In print view the same textarea grows to fit entire content without an inner scroll.

**Not for references.** Source-authored citations belong in a `Ref` expansion (right lane chevron labeled `Ref`), not in the annotation slot. The slot is reserved for speaker marginalia.

**Persistence.** Annotations are keyed by `chunk.id + lecture.id` and persist to `localStorage`. Once written, they survive reloads until deliberately cleared.

---

## 8. Live elements

Three kinds of live interaction, one architecture.

**Pre-authored sketches.** Inline fenced monospace blocks in the source. Nothing live; they just render. Covers 80% of your ASCII drawings – the ones you knew you'd draw when preparing.

**Live co-constructed sketches.** `::: sketch <id>` in source creates a named slot. Audience view renders it as read-only monospace. Speaker view renders it as editable textarea (monospace, fixed-width, no autocomplete). Typing on the speaker side propagates to audience in real time over the `postMessage` sync channel. Slot contents persist keyed by sketch-id + lecture-id, so last semester's sketch reappears next semester (or you clear it deliberately from a menu).

**Etherpad / shared editing.** Same `::: sketch <id>` mechanism, but with `::: etherpad <url>` as an alternative fence. Renders an iframe of the shared pad in both views. Audience sees the pad; you contribute from whichever device you use.

**Polls and live quizzes.** Reserved for later. The architecture is the same – a typed slot with an ID. Concrete choice deferred; candidates are embedded Mentimeter/Poll Everywhere (works but proprietary), a minimal self-hosted WebSocket poll server (~200 lines), or piggybacking on the university LMS if it has an API.

---

## 9. Build system

Single Node script, target <400 lines. Dependencies: `marked`, `katex`, `gray-matter`, `cheerio`, [`@chenglou/pretext`](https://github.com/chenglou/pretext) (build-time text measurement), and whatever font-loading primitive pretext needs in Node (typically `node-canvas` or equivalent). Nothing else – no bundler, no framework, no headless browser.

**Steps, in order:**

1. **Parse frontmatter and Markdown.**
2. **Chunk ID validation.** For each `##` heading, require an explicit `{#id}` attribute. Missing IDs are a build error with a listed suggested assignment per chunk. Normal builds and `--watch` never rewrite source. A separate `build.js --assign-ids` mode computes `column-slug/chunk-slug` for any chunk missing an ID, resolves collisions by appending `-2`, `-3`, …, and writes the attributes back. `--assign-ids` is idempotent on already-annotated sources and exits non-zero if anything was changed so CI can detect drift.
3. **Image shorthand resolution.** `![](fig-id)` → resolve to `images/fig-id.{ext}`, read dimensions, inject `width`/`height` attributes to prevent layout shift. Optional width hint: `![](fig-id){.wide}`. A sibling convention `![](sketch-id.txt)` inlines a monospace text file as a sketch.
4. **Math pre-rendering.** KaTeX renders `$...$` and `$$...$$` at build time. No runtime LaTeX flash when panning. KaTeX's emitted output carries explicit metrics on display-math containers; these are captured for the geometry pass.

   **Font payload (added once this shipped).** Build-time rendering is only half the promise: KaTeX also needs its own woff2 faces, and §1's `file://` requirement means they cannot be linked, they have to be base64'd into the stylesheet. All twenty faces are 254 KB, which no lecture without a formula should pay. So the stylesheet is emitted only when a view actually contains rendered math, and then only for the font families that view uses – which family maps to which class is read out of `katex.min.css` at build time rather than restated here, so it survives a KaTeX upgrade. A typical lecture lands around 120 KB per print view; one without math adds nothing. The live views carry roughly 46 KB more, because the `F` font toggle lets the reader put the body in sans or mono at run time and the maths follows – which means the sans and typewriter families have to be present even though the build cannot know whether they will be used.

   Delimiter parsing is a `marked` extension, not a pre-pass over the source string, so a `$` inside a fence or an inline code span is already a different token by the time math is considered. The inline rule additionally refuses to cross a backtick, because marked runs custom inline extensions before its own `codespan` tokenizer and a stray dollar in prose would otherwise pair with one inside a following code span.
5. **Geometry pass.** For every chunk, every text block (heading, body paragraph, margin note, expansion body, monospace sketch) is measured via [pretext](https://github.com/chenglou/pretext) against the self-hosted WOFF2 font metrics at zoom 1.0 and the chunk's declared width class. Math heights come from KaTeX metrics; image heights come from file-dimension reads (step 3). Heights are summed per chunk; the §2 placement algorithm then runs deterministically over the height map. The build emits each chunk's resolved geometry as CSS custom properties on the element: `--chunk-x`, `--chunk-y`, `--chunk-height`, plus per-column `--column-x` and `--column-track-width`. The audience, speaker, and print renderers consume these properties directly – there is no client-side measurement pass, no “ready” promise to gate camera moves on, and no sync-message buffering. Deep-links resolve on first paint.
6. **TOC generation.** Walk H1/H2, strip tags, emit JSON embedded in the page for the TOC overlay.
7. **Render views.** Produce `lecture.html` (audience), `speaker.html` (speaker view, loads same data), `print.html` (linear, expansions inlined, no speaker notes, no camera – designed for PDF export via browser).
8. **Linter.** Split into integrity errors (build fails, non-zero exit) and compositional warnings (build succeeds, reported on stderr).

   **Errors – break the build:**
   - Missing required frontmatter field (`title`, `course`, `lecture`).
   - Chunk missing an ID (every deep-link, speaker-sync message, and print anchor depends on it).
   - Duplicate chunk ID within a lecture.
   - Dead image reference (`images/fig-id.*` not found).
   - Orphaned sketch ID: speaker textarea referencing an undeclared slot, or a `::: sketch` slot never mentioned by id in the source structure.
   - Unknown structural tag on a `## tag:` heading (typo-catcher; the tag vocabulary in §2.1 is exhaustive).
   - Nested directive of any kind (`::: expand` inside `::: expand`, `::: footnote` inside `::: expand`, etc.). Directives do not nest – the parser and placement algorithm both rely on this.

   **Warnings – succeed but surface:**
   - Chunk exceeding the ~15 line-heights density budget at standard width.
   - Column wider than `full` allows.
   - Column with only one chunk (probably belongs to a neighbor).
   - `full`-width chunk mixed with `narrow` chunks in the same column (compositional smell; track width becomes dominated by the full chunk).
   - Ratio of risk chunks (pull quote, drop initial, full figure) to total exceeds the 70/30 discipline threshold.
   - More than ~20% of chunks contain reveal separators (§4.6) – reveal has become the default and its dramatic effect is diluted.
   - Lecture has no `## title:` chunk, or has more than one.

**No bundling, no minification, no transpilation, no framework.** Browser loads the output HTML directly. Edit source, save, refresh.

**Dev mode:** `node build.js --watch` rebuilds on save. A tiny WebSocket triggers browser reload. ~30 extra lines. This is the *only* WebSocket in the entire stack – used exclusively for dev reload. Runtime audience↔speaker sync uses `window.postMessage` between the two windows, not a server (see §7). Production-rendered output has no WebSocket dependency.

**`--assign-ids` workflow.** When an author adds a chunk without an ID, the normal `build.js --watch` fails with a diff showing the suggested IDs. The author runs `build.js --assign-ids` once (which writes the IDs into source), commits the result, and resumes editing. CI runs `--assign-ids` as a dry check: if it would have changed source, CI fails – this catches PRs that add chunks without running the init step. Because `--assign-ids` is the only path that mutates source, the dev loop stays pure and the ID-generation story is one explicit, recoverable step, not a hidden side effect.

**`--new <slug>` workflow.** Scaffolds a new lecture. Creates:

```
lectures/<slug>/
  source.md       # Markdown scaffold (frontmatter + title chunk + one empty column)
  assets/         # empty dir for images, sketches, etc.
```

The `source.md` scaffold is a fully valid Phase-1 source: frontmatter pre-populated with `title`, `presenter`, `info`, `course`, `lecture` (blanks where the author must fill in); one `## title: {#title}` chunk; one `# Introduction {#intro}` column with a single empty `## free:` placeholder chunk. Running `build.js` on the scaffolded file produces a viewable lecture immediately – authoring begins by filling prose into the placeholder, not by wiring up boilerplate.

Non-destructive: if `lectures/<slug>/` already exists, `--new` fails with a clear message and no files written. Intended to be run once per new lecture. The build script's `--watch` and default modes never touch the scaffold path – only `--new` creates files outside the output directory.

---

## 10. Aesthetic constraints – what NOT to do

These are as important as the positive rules. They are the failure modes.

- **No accent-color left borders** on admonitions, callouts, or notes. Use typography (small caps label, hanging position, rule above) instead.
- **No gradients** anywhere. Flat tones only.
- **No ubiquitous rounded corners.** Sharp corners by default. At most `border-radius: 2px` on specific elements if ever.
- **No glassmorphism, no blur, no translucency** for UI surfaces.
- **No drop shadows** except a single hairline under overlays (TOC, expansion). No fuzzy soft shadows.
- **No generic sans-serif body** (no Inter-as-default, no system-ui as the main reading face). Body is serif or a distinctive sans with real personality.
- **No centered body text.** Left-aligned, ragged right.
- **No bullet lists as the default body form.** Prose first; lists only when content is genuinely enumerable.
- **No emoji as icons.**
- **No unicode box-drawing for UI chrome** (sketches yes, interface no).
- **No dark mode ornament** – a dark mode exists for evening lectures, but it uses the same restraint as the light mode, inverted through OKLCH, not a separate “cool” theme.

---

## 11. Roadmap

### Phase 0 – This week (Week 1 MVP)

Deliverable: one real lecture taught in the new medium.

**Scope reduction vs. full spec.** Phase 0 ships a *subset* of the source format and skips the build pipeline. Authors stick to this subset so that the eventual §9 build can ingest Phase 0 sources unchanged:

- Single HTML + single JS file, no Node build script.
- Hand-author Markdown with hand-written IDs and explicit `{.width-class}` attributes just this once.
- Parsing is client-side `marked` with a minimal inline tokenizer for the `{.class #id}` attribute tail and the `::: expand` / `::: footnote` / `::: sketch` fences. The full §3.1 parsing contract and AST pipeline is Phase 1 work.
- Layout is **runtime-measured** via `getBoundingClientRect` in Phase 0 – no pretext, no build-time geometry. Deep-links are gated on a `ready` promise; sync messages are buffered until first measurement. This is explicitly the temporary path; §9 step 5 replaces it in Phase 1.
- Four chunk types available via CSS: narrow/standard/wide/full.
- Camera navigation (arrows, chevron click).
- Speaker window with notes pane via `postMessage` (single machine only, per §7 constraint).
- KaTeX runtime (accept the flash for now).
- Pre-authored ASCII sketches only. No live sketch yet.
- No print view yet.
- No TOC yet. Use URL deep-links as a fallback.
- No linter. Bad content breaks at runtime; fix and reload.

Target: ~400 lines HTML+CSS+JS, sitting in a folder with your Markdown.

### Phase 1 – Weeks 2–4

The goal of Phase 1 is to retire every “temporarily” in Phase 0 **and** close the gaps the first real-world lecture (`lectures/wlab01/`) surfaced. Ordered roughly by pain felt during that lecture:

**Build pipeline (enables everything else):**
- Node build script with §3.1 parsing pipeline, `--assign-ids` init, and `--new <slug>` scaffold.
- Build-time geometry pass via pretext (§9 step 5). Client-side measurement fully removed.
- Image shorthand resolution with file-dimension reads.
- Proper font loading (self-hosted WOFF2, loaded both in-browser and into the Node geometry pass).

**Views:**
- **Print view renderer** with TOC (flat, column-only) at the front. Accessible from the live view via `P` hotkey opening in a new tab. This was the single most missed feature in wlab01.
- **Speaker view** in a separate window, synced via `window.postMessage`: current chunk, next-previews (fully revealed, see §7), notes pane, scrubber, timer, freeze-the-projection toggle, crash-recovery `localStorage` persistence.

**Live interactions the wlab01 input shape broke:**
- **Progressive reveal** per §4.6. The `---` separator, `Space` or `↓` to advance, backward-nav resets to fully-revealed. This is what will make bullet-heavy content (the dominant shape in practice, despite the “prose first” intent) teachable at a controlled pace.
- **Title slide renderer** per §4.4 `title` tag – lower-left-third layout, frontmatter-driven.

**Overview upgrades (the wlab01 overview was a dead end once you entered it):**
- Click-to-select (thick border) + second-`O` to land.
- `/` fulltext search narrowing the overview to matches.
- `Esc` dismisses without moving.

**Linter** with both integrity errors and compositional warnings (including the §9 additions for reveal overuse and missing/duplicate title).

**Discipline check: `topic+bold` as default collapse.** In practice this will be the most-used mode; ensure the audience view boots in `topic+bold` unless overridden.

### Phase 2 – Mid-semester

- Extract the pattern language that actually emerged from 4–5 hand-authored lectures.
- Document it as **concrete examples**, not abstract rules.
- LLM-assisted conversion of old slide decks. **Gate condition:** do not start until the pattern language has been authored by hand across ≥5 lectures AND open question §12.12 (LLM vs. variance) has an explicit acceptance criterion. Starting earlier risks locking in an impoverished vocabulary or, worse, teaching the LLMs to produce plausible-looking violations that are hard to unlearn.
- Dark mode variant.
- Etherpad iframe integration.

### Phase 3 – End of semester

- Polls/quizzes (architecture decision deferred until then).
- Multi-lecture project structure: how 14 lectures of a course share assets, cross-reference, and render as a coherent student resource.
- Poll/quiz slots (concrete implementation choice).
- Cross-lecture deep-links.

---

## 12. Open questions – things this spec does not decide

These are the things I'd flag as genuinely underspecified rather than just deferred. Worth thinking about before they bite.

1. **Crash recovery during a live lecture.** Persistence to `localStorage` is in the spec, but what's the actual recovery ritual when the laptop freezes mid-lecture? Reboot, reopen browser, restore from URL + localStorage – do you trust that enough for a live room? Might need a backup printed handout as the true fallback. Worth deciding policy explicitly.

2. **Dark mode lighting policy.** Evening lectures with dim lecture halls vs bright daytime. The spec says both exist but doesn't define when to switch. A tiny hotkey toggle (`D`) is easy; the harder question is whether the print view and student web view follow suit, and whether figures need dark-mode variants.

3. **Student-facing web study view.** The spec has `audience.html`, `speaker.html`, `print.html`. Is there also a `study.html` – a web version for students that's different from both audience (no camera, all chunks visible) and print (scrollable, interactive expansions)? I think yes, but we haven't designed it. Probably the easiest win: print view + clickable chevrons for expansions.

4. **Poll/quiz architecture.** Named as a slot, implementation deferred. But polls are exactly the live element that makes the “why come to lecture” problem go away, so deferring too long weakens the whole pitch.

5. **Multi-lecture project structure.** A full course has 14 lectures. How do they share a styles file, a fonts folder, cross-reference each other, and render as a coherent course-wide student resource? Not just 14 separate HTML files in a folder – there should be a course index, navigation between lectures, and probably a single semester-wide PDF.

6. **Cross-references between lectures.** “Recall from lecture 3” – does that resolve to a link students can click? Implies chunk IDs are globally unique across a course, which is a small but real design decision.

7. **Font licensing and durability.** Self-hosting is in the spec. Actual font choices are suggestions. Pick two or three and commit – “we'll decide later” is how projects end up with six half-chosen fonts.

8. **Figure authoring pipeline.** Images work via shorthand, but where do the SVG figures come from? If you're converting from existing slide decks, there's an ecosystem question (Excalidraw, tldraw, Figma, hand-drawn scanned) worth deciding early so figures are editable long-term, not flattened PNGs.

9. **Accessibility baseline.** Not discussed at all. Keyboard navigation is in; contrast from OKLCH should be fine; but screen reader semantics for camera-moved content, and whether the print view is the canonical accessible version, deserve a paragraph.

10. **Performance ceiling.** Nothing in the spec says how many chunks a single lecture can hold before CSS transforms start stuttering on a 5-year-old laptop. Probably 200 chunks is fine, 1000 is not, but worth benchmarking with a dummy lecture before discovering it mid-lecture.

11. **Versioning across semesters.** You teach the same course again next year with 30% revised content. Is that a new lecture file, a Git branch, a tagged release? Small decision, but shapes the folder structure.

12. **The tension between visual variance and LLM-batch conversion.** If the pattern language is genuinely expressive, LLMs will produce plausible-looking violations. If it's tight enough to constrain LLMs cleanly, it's probably too rigid to avoid monotony. This is the single biggest open question and probably only resolves through authoring real content.

---

## 13. Anti-spec – what this is not

To prevent scope creep and keep the project shippable:

- Not a presentation tool. No remote control apps, laser pointer, live-feed integrations.
- Not a publication platform. No CMS, no server, no accounts.
- Not a note-taking tool for students. They receive the print PDF or study page.
- Not a concept-map tool. Relations between chunks are implicit in spatial layout and narration, not stored as typed edges (for now – could revisit).
- Not a LaTeX replacement. Math is supported; it's not a mathematical typesetting project.
- Not collaborative authoring. One author per lecture file; Git handles any collaboration needed.