# Prose, collapse discipline, and typography

Companion to `SKILL.md`. Everything here is about the *words* in a chunk body,
not about the syntax around them.

## The collapsed view is also your presenter prompt

In `topic-bold` mode a derived chunk shows the heading, the first sentence of
every paragraph, and the promoted `**bold**` fragments. That is what the room
reads and it is what you present from. A chunk that is not understandable from
those three things is not finished.

Practical conventions:

- Open each paragraph with a self-sufficient sentence: the claim or the
  signpost, not a warm-up.
- Prefer topic sentences that already carry the teaching point. Not „Three
  terms for the rest of this lecture“ but the terms' actual purpose.
- Treat the first sentence as a cue you could present from cold.
- If a paragraph's collapsed cue would be too vague, strengthen the opening
  sentence rather than leaning on continuation prose.
- Use `> note:` for detail that helps the presenter but would clutter the
  slide.
- Avoid many tiny bolds inside one sentence. Each becomes a separate prompt.
  Prefer one strong bold phrase, or none.
- When continuation text holds several parallel items, use a real Markdown list
  instead of one paragraph with many bold snippets.
- If a named example is only decorative, leave it unbolded. Bold names only
  when each name is itself a useful cue.
- In a figure chunk, the sentence below the image should say what to take from
  the figure, not that a figure exists.
- The same logic applies inside `::: expand` blocks.

Two tests, in order. Squint at the chunk and imagine seeing only the heading
plus the first sentences: could you recover the intended explanation in five to
ten seconds? Then imagine every `**bold**` rendered as its own tiny bullet: if
that looks fragmented, consolidate or remove the bolding.

Neither test needs imagining. `node build.js <source.md> --squint` writes both
out of the rendered projection: the heading and first sentences as `.` lines,
every promoted bold as the `-` bullet it becomes, and the prose the collapse
drops as a `~` line with its word count. Read `squint.txt` and the two tests
are a thing you look at rather than picture.

## Anti-patterns to scan for

**Meta-label bolds.** Opening a continuation paragraph with a bold connector
(`**Consequence:**`, `**Key finding:**`, `**Wichtig:**`, `**Aber:**`) produces a
bullet that shows the label and hides the content.

- Bad: `**Konsequenz:** Wir haben das Design umgebaut.`
- Good: `Wir haben das Design daraufhin komplett umgebaut.`

**Single-word bolds in continuation.** A standalone `**nicht**` or `**unter**`
collapses to a cryptic one-word bullet. Lift the word into a longer bold phrase
that stands alone, or move the emphasis into the topic sentence.

- Bad: `Die Tutor-Werte liegen sogar **unter** beiden KI-Bedingungen.`
- Good: `Die Tutor-Werte liegen sogar unter beiden KI-Bedingungen – das war die **unerwartetste Beobachtung** des Experiments.`

`lint.js` warns on this one as `single-word-bold`. It reproduces the renderer
rather than the rule of thumb, so **continuation is literal**: the bad line above
is only a finding once a sentence precedes it in the same paragraph. Standing
alone as a paragraph's first sentence, that same bold is inside the head and the
room reads the whole of it – which is the mechanism, not a gap in the check.

**Topic sentences that are pure connectors.** „Das ist gewollt.“, „Sie haben 10
Minuten.“ carry no claim. The presenter gets a thin prompt and the room gets
nothing. Rewrite so the first sentence contains the claim.

**Colon-cuts in the topic sentence.** If the first sentence ends mid-thought
with a colon and the substance lives after it, the collapsed cue is a dangling
fragment. Restructure so the claim completes before the colon.

**Listicle in a trench coat.** Three consecutive paragraphs each opening with a
bold mini-header always reads as a list in prose. Sometimes that is the right
shape for a long findings chunk – then commit to it and make every opener fully
self-sufficient. If three is too many, split the chunk.

**Heading-style lists.** Bullets shaped as `**Bolded header:** explanation` are
legitimate for a short list of options or readings, and an AI-documentation tell
when overused. Use them where the bold names a distinct option.

## Prose

Lecture slides are read by two hundred people at once, which makes every
stylistic tic far more visible than in a paper. Speaker notes are not
user-facing and may stay informal; the audit applies to chunk bodies, headings,
and `::: slide` blocks.

**Vocabulary to delete on sight.** English: *delve, tapestry, intricate,
pivotal, crucial, underscore, showcase, foster, garner, interplay, landscape*
(figurative), *testament, vibrant, groundbreaking, boasts, utilize, leverage*
(as a verb), *robust, streamline, harness, paradigm, synergy, ecosystem*
(figurative), *framework* (figurative), *seamless, realm*. German: *tatsächlich,
ehrlich gesagt, grundsätzlich, im Wesentlichen, letztendlich, nicht zuletzt,
maßgeblich, wegweisend, ganzheitlich*. Magic adverbs that manufacture
significance: *quietly, deeply, fundamentally, remarkably, arguably*.

**Structural patterns to avoid:**

- „Not only X but also Y“ and „It is not X, it is Y“. At most one per lecture,
  and only where the contrast is the point.
- „-ing“ tails that assert what a fact means (*…, highlighting the importance
  of…*). Delete the tail; the fact stands.
- Filler transitions: *It is worth noting that, Importantly, Notably,
  Interestingly, Zunächst einmal*.
- Copula avoidance: *serves as, stands as, marks, stellt dar* where plain *is*
  or *ist* works.
- Summary chunks that restate the previous three without adding a claim. A
  `principle` chunk with a new formulation is fine; „In summary“ is not.
- Invented concept labels presented as established terms. If you coin a term,
  say that you are coining it.
- Rhetorical self-Q-and-A („Das Ergebnis? Ernüchternd.“) and false suspense.
- Pedagogical hand-holding („Schauen wir uns das genauer an“, „Let us unpack
  this“). The heading already does that work.
- Anaphora: the same sentence opener three times across consecutive chunks. The
  overview board (`O`) makes this glaringly visible.

**Mannered prose.** A metaphor or a flourish where a literal phrase exists: *a
dial worth turning* for *a parameter worth varying*, *this point earns its keep*
for *this point still matters*, *the branch you take if somebody asks* for
*material you open only if somebody asks*. The phrase displays the writer, and
a metaphor carries connotations the writer did not choose. When a literal phrase
is available, use it. Three forms to scan for:

- Verbs that dramatise a mechanism – *travels in the file, walks in, lifts into
  a card, escapes into the margin, fights the button, reach for `::: slide`* –
  where the literal verb is *is embedded, moves, opens, goes, conflicts with,
  use*.
- Rhetorical compression that states how small or simple a thing is instead of
  stating the thing: *its whole structure is two words*, *and nothing else*,
  *that is the whole of it*, *two keys carry the whole lecture*. Say what it
  consists of: *a lecture consists of one or more columns, and each column
  holds one or more chunks*.
- Cross-references said sideways: *the speaker view, which has a part of its
  own later on*, *the next chunk is the way out*, *that slide is where the
  shortening is shown happening*. Say *which is discussed later on*, *the next
  chunk shows the alternative*, *that slide shows the shortening*.

**Claim discipline:**

- Every empirical claim on a slide needs a number, a figure, or a citation, or
  a verb weak enough to match the evidence. *zeigt* and *legt nahe* are not
  interchangeable with *beweist*.
- Replace vague magnitude with the range: not *deutlich besser* but *4 bis 7
  Punkte über der stärksten Vergleichsbedingung*.
- Keep legitimate hedging. *Die Daten legen nahe* is correct when the evidence
  is suggestive; „fixing“ it to *beweisen* manufactures an over-claim.
- Empty intensifiers go: *umfangreiche Experimente*, *eine Vielzahl von
  Datensätzen*. Name the three datasets.

## Typography

Fixed rules, no exceptions:

- Headings in sentence case, not Title Case.
- Boldface is a slide mechanism here, not decoration. Never bold for keyword
  highlighting.
- No decorative unicode in prose: no arrows, stars, or check marks. Inside a
  `::: slide` bullet list the marker is the list's job.
- **En-dash only.** Use `–` (U+2013) for parenthetical breaks, ranges
  (`2024–2026`, `20–21`), and pauses. Never the em-dash (U+2014). Ranges
  take an unspaced en-dash, a parenthetical break a spaced one. Before reaching
  for either, a comma, a pair of parentheses, or two sentences is usually
  better: a dash used purely for rhythm is itself one of the patterns above, so
  the goal is fewer dashes, not em-dashes converted and left in place. Hyphens
  stay hyphens.
- **Typographic quotes only.** German `„…“` (U+201E, U+201C), English `“…”`
  (U+201C, U+201D), French `«…»` if needed. Prefer the typographic apostrophe
  `’` (U+2019) over `'`.

Two mistakes worth checking for specifically. The classic German typo is a
straight `"` used as the closing mark after a correct `„`, which the counts
below catch. And straight quotes must stay **untouched inside code fences,
inline code spans, file paths, and the YAML frontmatter** – a curly quote in a
Python string is a bug, not typography. Check the fences before running any
whole-file replacement.

```bash
python3 -c "
import sys
t = open('source.md').read()
print('ASCII quote :', t.count(chr(0x22)))
print('open  DE    :', t.count(chr(0x201E)))
print('close DE    :', t.count(chr(0x201C)))
print('close EN    :', t.count(chr(0x201D)))
print('em-dash     :', t.count(chr(0x2014)))
print('en-dash     :', t.count(chr(0x2013)))
"
```

The `„` count must equal the German closing `“` count, and the em-dash count
must be zero.
