/*
 * Build and linter agree on every refusal.
 *
 * `lint.js` is zero-dependency by design and therefore re-implements the
 * parsing contract by hand rather than importing the compiler. CLAUDE.md names
 * the price and the failure mode: a line the linter passes and the build
 * refuses merges green and fails every later build – and CI lints two lectures
 * (`lectures/network-security`, `lectures/diagrams`) that it did not used to
 * build at all, so the linter was the only gate those figures ever met. The
 * other direction is nearly as bad: a linter stricter than the build refuses
 * a line the author is entitled to write, and there is nothing to appeal to.
 *
 * So every fixture here is compiled through `diagram-core.mjs` *and* run
 * through `lint.js`, and all three of these have to line up:
 *
 *   - the build refuses it, or accepts it, as the fixture says;
 *   - the linter reports on it exactly when the build refuses it.
 *
 * The `accept: true` fixtures are not filler. Half the value of a differential
 * gate is the other direction, and three of the expectations in this list were
 * caught out by the grammar moving under them rather than by a bug.
 *
 * The name is still a claim about these fixtures rather than about the whole
 * language – no finite list can say more – so the way to keep it honest is to
 * add a fixture the moment anybody finds a line the two treat differently.
 * The last three came from an adversarial pass over the linter: the options a
 * `series of` line does not own, the kind gate inside a `style` step, and a
 * statement with no name. Each was the lax direction, each is a fixture here
 * now, and each failed here first.
 *
 * What this gate proves is agreement, not meaning: a fixture marked
 * `accept: true` says both sides let the line through, never that the drawing
 * it produces is the right one. `semantics.mjs` holds that half.
 *
 * These fixtures are the ones the diagram revision was verified against –
 * items 1, 2, 3, 5, 8, 9, 12, 13, 16, 19, 20, 21, 22, 23, 30 and 31 of
 * `revision-proposal.md` – merged from the two scratch programs that carried
 * them. `item` is the proposal item, for anyone reading back.
 */
import { render, lintAll } from './harness.mjs';
import { DG_KEYWORDS, DG_PLACED_HEADS, DG_PLACE_INTRO } from '../../diagram-core.mjs';

export const name = 'build and lint agree on every refusal';

// Two preambles, because the fixtures were written against two. `PAIR` is
// enough for anything about one line; `QUAD` gives a second row, which the
// placement fixtures need in order to have somewhere to point.
const PAIR = 'box a "A" at 0,0\nbox c "C" right of a gap 1\n';
const QUAD = 'box a "A" at 0,0\nbox c "C" at 2,0\nbox p "P" at 0,1\nbox q "Q" at 2,1\n';
// A sequence written as a prefix and a suffix, so a fixture can hang a tail on
// the statement line and still have the entries that make it a sequence.
const SEQ = 'sequence s at 0,0';
// A chart with room for a second run of columns in its frame.
const SERIES = 'bars f "1,2" at 0,0 w 2 h 1\n';
const SEQ_BODY = '\n  actor u "U"\n  actor r "R"\n  u -> r "m"';

// `accept: true` means both sides must let it through. Anything else must be
// refused by the build and reported by the linter.
const FIXTURES = [
  // ── the sequence identifier rule, in both directions ──────────────────
  // A message begins with its sender and the entry run ends at a statement
  // word, so an actor named after one could be declared and never spoken to.
  // The named-message half has no answer at all rather than a bad one: `edge
  // a -> b` is a message named `edge` and an ordinary edge between the two
  // heads, and nothing in it decides which.
  //
  // The mirrored pair is the point of these four. A message may name an actor
  // declared *under* it - that is an ordinary forward reference - so a check
  // that collected actors as it met them answered "no" for every message
  // written above its own cast, and the ambiguous line then fell out of the
  // run unchallenged. Both orders must produce the same one diagnostic.
  { item: 0, name: 'an actor named after a statement', body: SEQ + '\n  actor text "T"\n  actor b "B"\n  text -> b "hi"' },
  { item: 0, name: 'a message named after a statement', body: SEQ + SEQ_BODY + '\n  edge u -> r "hi"' },
  { item: 0, name: 'the same, with the actors declared below', body: SEQ + '\n  edge a -> b "hi"\n  actor a "A"\n  actor b "B"' },
  { item: 0, name: 'and with a note between them', body: SEQ + '\n  edge a -> b "hi"\n  note a "n"\n  actor a "A"\n  actor b "B"' },
  // ── item 2: one sentence per statement, and the derived stop sets ──
  { item: 2, name: 'rightof is not a word', body: QUAD + 'box b "B" rightof a gap 1' },
  { item: 2, name: 'padd is not pad', body: QUAD + 'container z "Z" over a,c padd 0.3' },
  { item: 2, name: 'gap on an edge', body: QUAD + 'edge a -> c gap 0.3' },
  { item: 2, name: 'point on no outline', body: QUAD + 'box b "B" point sideways' },
  { item: 2, name: 'a later box needs a placement', body: QUAD + 'box b "B"' },
  // `point` takes `up / down / left / right`, so a placement test that looks
  // for its words anywhere on the line reads this as placed. Ten lines of the
  // corpus carry that shape, and both signs of the near-miss are here because
  // the fixture that existed used `point up`, which the loose test caught.
  { item: 2, name: 'point left is not a placement', body: QUAD + 'box b "B" point left {.chevron}' },
  { item: 2, name: 'point right is not a placement', body: QUAD + 'box b "B" point right {.chevron}' },
  { item: 2, accept: true, name: 'point left beside a placement', body: QUAD + 'box b "B" right of a gap 1 point left {.chevron}' },
  { item: 2, name: 'a chart may be named series', body: QUAD + 'bars series "1,2,3"' },
  { item: 2, accept: true, name: 'a real series takes no placement', body: 'bars f "3,5" at 0,0 w 2 h 1\nbars g "1,2" series of f' },
  { item: 2, accept: true, name: 'at is a placement', body: QUAD + 'box b "B" at 1,1' },
  { item: 2, accept: true, name: 'between then point', body: QUAD + 'box b "B" between a,c point up {.chevron}' },
  { item: 2, accept: true, name: 'between then offset', body: QUAD + 'text t "x" between a,c offset 0,1' },
  { item: 2, accept: true, name: 'between then pad', body: QUAD + 'text t "x" between a,c pad 0.2' },
  { item: 2, name: 'point on a text', body: QUAD + 'text t "x" between a,c point up' },
  { item: 2, accept: true, name: 'same as', body: QUAD + 'box b "B" at 1,1 same as a' },
  { item: 2, name: 'same without as', body: QUAD + 'box b "B" at 1,1 same a' },
  { item: 2, name: 'between takes two', body: QUAD + 'box b "B" between a' },
  { item: 2, name: 'between takes only two', body: QUAD + 'box b "B" between a,c,p' },
  { item: 2, name: 'two placements', body: QUAD + 'text t "x" between a,c between p' },
  { item: 2, name: 'trailing nonsense', body: QUAD + 'box b "B" right of a nonsense' },
  { item: 2, name: 'gap without a neighbour', body: QUAD + 'box b "B" at 1,1 gap 0.3' },
  { item: 2, accept: true, name: 'a leader after a gap', body: QUAD + 'text t "x" right of a gap 0.5 -> c' },
  { item: 2, accept: true, name: 'a long but legal tail', body: QUAD + 'box b "B" right of a gap 0.5 flush top w 1 h 1 pad 0.2' },

  // ── item 3: one word for the distance between two elements ────────
  // One placement routine reads the tail for every placed kind, so the same
  // word on a `text` exercises nothing this does not – that fixture was here
  // too, under item 2, and is gone.
  { item: 3, name: 'space where gap is meant', body: QUAD + 'box b "B" right of a space 1' },
  { item: 3, name: 'gap where pad is meant', body: QUAD + 'brace y "Y" over a,c gap 0.3' },

  // ── item 8: the placement words themselves ────────────────────────
  { item: 8, name: 'above of', body: QUAD + 'box b "B" above of a gap 1' },
  { item: 8, name: 'below of', body: QUAD + 'box b "B" below of a' },
  { item: 8, name: 'right without of', body: QUAD + 'box b "B" right a gap 1' },
  { item: 8, name: 'left without of', body: QUAD + 'box b "B" left a' },
  { item: 8, name: 'above nothing', body: QUAD + 'box b "B" above' },
  { item: 8, accept: true, name: 'above X', body: QUAD + 'box b "B" above a' },
  { item: 8, accept: true, name: 'left of X', body: QUAD + 'box b "B" left of a' },

  // ── item 1: calm was renamed to dim ───────────────────────────────
  { item: 1, name: 'calm as a step verb', body: PAIR + 'step s\n  calm a' },
  { item: 1, name: 'calm as a chart option', body: 'bars f "3,5" at 0,0 w 2 h 1 calm 0' },

  // ── item 5: flush on a placement, side on an edge ─────────────────
  // The word on a placement is `flush`; `align` is a statement of its own.
  // Item 8 carried a second fixture for the same sentence, on a different
  // direction word, which is the placement table being tested twice.
  { item: 5, name: 'align on a placement', body: PAIR + 'box b "B" right of a gap 1 align top' },
  { item: 5, name: 'align x center', body: PAIR + 'align x center a,c' },
  { item: 5, name: 'an edge side as a class', body: PAIR + 'edge a -> c "x" {.top}' },
  { item: 5, name: 'an edge side that is not a side', body: PAIR + 'edge a -> c "x" side sideways' },
  { item: 5, accept: true, name: 'flush top', body: PAIR + 'box b "B" right of a gap 1 flush top' },
  { item: 5, accept: true, name: 'align x middle', body: PAIR + 'align x middle a,c' },
  { item: 5, accept: true, name: 'edge side top', body: PAIR + 'edge a -> c "x" side top' },

  // ── item 9: an edge and a message may be named ────────────────────
  { item: 9, name: 'an id tail on a box', body: PAIR + 'box z "Z" below a gap 1 {#zz}' },
  { item: 9, name: 'an id tail on an edge', body: PAIR + 'edge a -> c {#w}' },
  { item: 9, name: 'the edge name is taken', body: PAIR + 'edge a c -> c' },
  { item: 9, accept: true, name: 'a named edge', body: PAIR + 'edge wire a -> c' },
  {
    item: 9, accept: true, name: 'a named message',
    body: 'sequence q at 0,0\n  actor u "U"\n  actor r "R"\n  reg u -> r "x"\ntext n "k" right of reg gap 0.4',
  },
  {
    item: 9, name: 'the message name is taken',
    body: 'sequence q at 0,0\n  actor u "U"\n  actor r "R"\n  u r -> r "x"',
  },
  {
    item: 9, accept: true, name: 'a brace on a named message',
    body: 'sequence q at 0,0\n  actor u "U"\n  actor r "R"\n  reg u -> r "x"\n'
      + 'brace b over reg side right "p" pad 0.3',
  },
  {
    item: 9, name: 'two edges of one name',
    body: PAIR + 'edge f1 a.right:0.1 -> c.left:0.1\nedge f1 a.right:0.2 -> c.left:0.2',
  },

  // ── item 12: the kind gate, and the removal mark is not past it ───
  { item: 12, name: 'an outline removed from an edge', body: PAIR + 'edge a -> c {!hex}' },
  { item: 12, name: 'a stroke weight removed from a text', body: PAIR + 'text t "x" below a gap 1 {!bare}' },

  // ── item 13: the arrow tokens are their own tokens ────────────────
  { item: 13, name: 'no space around the arrow', body: QUAD + 'edge p->q' },
  { item: 13, name: 'no space before the arrow', body: QUAD + 'edge p ->q' },
  { item: 13, name: 'no space after the arrow', body: QUAD + 'edge p-> q' },
  { item: 13, accept: true, name: 'a two-headed arrow', body: QUAD + 'edge p <-> q' },
  { item: 13, name: 'no arrow at all', body: QUAD + 'edge p q' },
  { item: 13, accept: true, name: 'a plain arrow', body: QUAD + 'edge p -> q' },
  { item: 13, accept: true, name: 'a headless line', body: QUAD + 'edge p -- q' },

  // ── item 16: the removal mark ─────────────────────────────────────
  { item: 16, name: 'the same removal twice', body: PAIR + 'box z "Z" below a gap 1 {!dim !dim}' },
  { item: 16, name: 'added and removed at once', body: PAIR + 'box z "Z" below a gap 1 {.dim !dim}' },
  { item: 16, name: 'a removal of nothing', body: PAIR + 'box z "Z" below a gap 1 {!nope}' },
  { item: 16, accept: true, name: 'a plain removal', body: PAIR + 'box z "Z" below a gap 1 {!dim}' },

  // ── item 19: what may sit between a keyword and its operands ──────
  { item: 19, name: 'an edge with no source', body: QUAD + 'edge -> q' },
  { item: 19, name: 'an option before the source', body: QUAD + 'edge pad 0.1 p -> q' },
  { item: 19, name: 'nonsense after the target', body: QUAD + 'edge p -> q nonsense' },
  { item: 19, name: 'a container over nothing', body: QUAD + 'container z "Z" over' },
  { item: 19, accept: true, name: 'a container over two', body: QUAD + 'container z "Z" over a,c pad 0.3' },
  { item: 19, accept: true, name: 'a container over a spaced list', body: QUAD + 'container z "Z" over a, c pad 0.3' },
  { item: 19, accept: true, name: 'a container over one', body: QUAD + 'container z "Z" over a' },
  { item: 19, accept: true, name: 'a brace with pad then side', body: QUAD + 'brace y "Y" over a,c pad 0.3 side left' },
  { item: 19, accept: true, name: 'a brace with side then pad', body: QUAD + 'brace y "Y" over a,c side left pad 0.3' },
  { item: 19, accept: true, name: 'pad on an edge', body: QUAD + 'edge p -> q pad 0.2' },
  { item: 19, accept: true, name: 'via on an edge', body: QUAD + 'edge p -> q via 1,2' },
  { item: 19, name: 'padd on a brace', body: QUAD + 'brace y "Y" over a,c padd 0.3 side left' },

  // ── item 20: an option only where it can act ──────────────────────
  { item: 20, name: 'w on a dot', body: QUAD + 'dot d at 1,1 w 0.5' },
  { item: 20, name: 'r on a box', body: QUAD + 'box b "B" at 1,1 r 5' },
  { item: 20, name: 'r on a text', body: QUAD + 'text t "x" at 1,1 r 5' },
  { item: 20, name: 'r on an image', body: QUAD + 'image i logo at 1,1 r 5' },
  { item: 20, name: 'point on a dot', body: QUAD + 'dot d at 1,1 point up' },
  { item: 20, accept: true, name: 'r on a dot', body: QUAD + 'dot d at 1,1 r 0.2' },
  { item: 20, accept: true, name: 'point on a chevron', body: QUAD + 'box b "B" at 1,1 point up {.chevron}' },
  { item: 20, accept: true, name: 'w on an image', body: QUAD + 'image i logo at 1,1 w 0.5' },

  // ── item 21: a step name is one token ─────────────────────────────
  { item: 21, name: 'a step name with a space', body: QUAD + 'step my name\n  emph a' },
  { item: 21, name: 'a step name starting with a digit', body: QUAD + 'step 1st\n  emph a' },
  { item: 21, name: 'a step name with a trailing token', body: QUAD + 'step my-name extra\n  emph a' },
  { item: 21, accept: true, name: 'a hyphenated step name', body: QUAD + 'step ok-name\n  emph a' },
  { item: 21, accept: true, name: 'a step name starting with an underscore', body: QUAD + 'step _s2\n  emph a' },

  // ── item 22: which side a brace's spine sits on ───────────────────
  { item: 22, name: 'a bare brace side', body: PAIR + 'brace y "Y" over a,c left' },
  { item: 22, name: 'a brace side that is not a side', body: PAIR + 'brace y "Y" over a,c side sideways' },

  // ── item 23: the row height of a table, the band of a lane ────────
  { item: 23, name: 'h on a table', body: 'table t "A|B" at 0,0 col 1,1 h 0.4' },
  { item: 23, name: 'h on lanes', body: 'lanes s "a | b" at 0,0 w 5 h 0.9' },
  { item: 23, accept: true, name: 'row on a table', body: 'table t "A|B" at 0,0 col 1,1 row 0.4' },
  { item: 23, name: 'w and col on a table', body: 'table t "A|B" at 0,0 col 1,1 row 0.4 w 5' },

  // ── item 30: a plot's tick spacing ────────────────────────────────
  { item: 30, name: 'step on a plot', body: 'plot p "x" "y" at 0,0 w 2 h 1 step 0.5' },
  { item: 30, accept: true, name: 'tick on a plot', body: 'plot p "x" "y" at 0,0 w 2 h 1 tick 0.5' },

  // ── item 31: which leader tokens a text takes ─────────────────────
  { item: 31, name: 'a backwards leader', body: PAIR + 'text n "x" right of a gap 1 <- a' },
  { item: 31, accept: true, name: 'a plain leader', body: PAIR + 'text n "x" right of a gap 1 -- a' },

  // ── a step verb that is still a step verb ─────────────────────────
  { item: 1, accept: true, name: 'ghost as a step verb', body: PAIR + 'step s\n  ghost a' },

  // ── item 5: an option whose value is a closed word list ───────────
  // `default edge side bottom` used to be refused by the build ("side expects
  // a number") and accepted by this file, which skipped the value token
  // rather than reading it. Both halves are fixtures now: the value that must
  // be accepted, and the one that must not.
  { item: 5, accept: true, name: 'a word-valued edge default', body: 'default edge side bottom\n' + PAIR + 'edge a -> c "m"' },
  { item: 5, accept: true, name: 'a word-valued brace default', body: 'default brace side left\n' + PAIR + 'brace y "Y" over a,c' },
  { item: 5, accept: true, name: 'a word-valued box default', body: 'default box point up\n' + PAIR + 'box b "B" below a gap 1 {.chevron}' },
  { item: 5, name: 'a bad word on an edge default', body: 'default edge side sideways\n' + PAIR + 'edge a -> c "m"' },
  { item: 5, name: 'a bad word on a box default', body: 'default box point sideways\n' + PAIR + 'box b "B" below a gap 1 {.chevron}' },
  { item: 5, name: 'a number where the word list is', body: 'default edge side 3\n' + PAIR + 'edge a -> c "m"' },
  { item: 5, accept: true, name: 'a number-valued default beside it', body: 'default edge pad 0.2\n' + PAIR + 'edge a -> c "m"' },

  // ── the three gaps an adversarial pass found, now fixtures ────────
  // All three were the lax direction – the build refuses, the linter was
  // silent – which is the one that merges green and fails every later build.
  //
  // A series draws columns in a frame it does not own, so the frame, the
  // scale, the ticks and the placement all belong to the chart it joined.
  // `key "…"` names a run for the legend the chart draws. Its value is the
  // one quoted string on a chart line with a keyword in front of it, so the
  // build reads it off the raw tokens and the linter off the source, and the
  // two have to agree on what a key without its string is.
  { item: 2, name: 'a key without its name', body: SERIES + 'bars g "3,4" series of f key' },
  { item: 2, name: 'a key on a grid', body: QUAD + 'grid g box 2x2 at 0,1 cell 0.3 key "k"' },
  { item: 2, accept: true, name: 'a named run and a named series', body: 'bars f "3,5" "a b" at 0,0 w 2 h 1 key "one"\nbars g "1,2" series of f key "two"' },
  { item: 2, accept: true, name: 'a key before a size', body: 'bars f "3,5" at 0,0 key "one" w 2 h 1' },
  { item: 2, name: 'a series with a placement', body: SERIES + 'bars g "3,4" series of f at 1,1' },
  { item: 2, name: 'a series placed against its own chart', body: SERIES + 'bars g "3,4" series of f right of f' },
  { item: 2, name: 'a series with a width', body: SERIES + 'bars g "3,4" series of f w 2' },
  { item: 2, name: 'a series with a height', body: SERIES + 'bars g "3,4" series of f h 2' },
  { item: 2, name: 'a series with its own spacing', body: SERIES + 'bars g "3,4" series of f space 0.5' },
  { item: 2, name: 'stacked with nothing to stand on', body: SERIES + 'bars g "3,4" at 2,0 w 2 h 1 stacked' },
  { item: 2, accept: true, name: 'a series and nothing more', body: SERIES + 'bars g "3,4" series of f' },
  { item: 2, accept: true, name: 'a stacked series with a tail', body: SERIES + 'bars g "3,4" series of f stacked {.tone-2}' },

  // A `style` step was the one position the class table did not reach here,
  // and a tag expands to its members, so one bad member fails the statement.
  { item: 12, name: 'a head class styled onto a box', body: PAIR + 'step s\n  style a {.no-head}' },
  { item: 12, name: 'a head class removed from a box in a step', body: PAIR + 'step s\n  style a {!no-head}' },
  { item: 12, name: 'an outline styled onto a text', body: PAIR + 'text t "x" below a gap 1\nstep s\n  style t {.hex}' },
  {
    item: 12, name: 'a head class styled onto a tag of boxes',
    body: 'sequence q at 0,0\n  actor u "U"\n  actor r "R"\n  u -- r "m"\nstep s\n  style @q-actors {.both-heads}',
  },
  { item: 12, accept: true, name: 'a prominence styled onto a box', body: PAIR + 'step s\n  style a {.dim}' },

  // The build reads the token after the head as the name and refuses the line
  // when there is none.
  { item: 2, name: 'a box with no name', body: PAIR + 'box' },
  { item: 2, name: 'a container with no name', body: PAIR + 'container' },
  { item: 2, name: 'a chart with no name', body: PAIR + 'bars' },
  { item: 2, name: 'a plot with no name', body: PAIR + 'plot' },
  { item: 2, name: 'a name that is only a tail', body: PAIR + 'box {.dim}' },

  // ── item 12: where a label alignment cannot act ──────────────────
  // `.left` and its three siblings say where a label sits *inside* the thing
  // that holds it, so a kind with nothing to draw a label in has no reading
  // for them. Written there, the word used to resolve, emit its CSS and move
  // nothing – a silent no-op, which is the failure this grammar keeps
  // closing. Both axes on each holder, because the pair that runs across and
  // the pair that runs down are separate entries in the table. The edge's
  // `{.top}` half is item 5's 'an edge side as a class' above, which is where
  // that reading was replaced by `side`; this is the other axis.
  //
  // The brace fixtures say `side right` and not a bare `right` on purpose. A
  // bare side word is refused on its own (item 22), so the shorter spelling
  // is refused before the class is ever looked at – it would keep passing
  // with the whole kind gate for braces deleted, which is a fixture that
  // tests nothing.
  { item: 12, name: 'a label alignment across a container', body: PAIR + 'container k "cap" over a,c {.left}' },
  { item: 12, name: 'a label alignment down a container', body: PAIR + 'container k "cap" over a,c {.top}' },
  { item: 12, name: 'a label alignment across a brace', body: PAIR + 'brace r "lab" over a,c side right {.right}' },
  { item: 12, name: 'a label alignment down a brace', body: PAIR + 'brace r "lab" over a,c side right {.bottom}' },
  { item: 12, name: 'a label alignment across an edge', body: PAIR + 'edge a -- c "e" {.left}' },
  // The channels that do act: an edge picks a side with `side`, and a node
  // keeps the classes on both of its two independent axes.
  { item: 12, accept: true, name: 'an edge side across', body: PAIR + 'edge a -- c "e" side left' },
  { item: 12, accept: true, name: 'a label alignment across a box', body: PAIR + 'box z "Z" right of a gap 0.5 {.left}' },
  { item: 12, accept: true, name: 'a label alignment down a box', body: PAIR + 'box z "Z" right of a gap 0.5 {.bottom}' },

  // ── the review's parser holes ────────────────────────────────────
  // Two silent failures the compiler closed and the linter did not, which is
  // the direction that merges green: `Number('')` is 0, so the empty half of
  // `at 3,` placed the element on an axis origin, and `Number('0x10')` is 16.
  // Both are finite, so a bare isFinite test let them through – on the most
  // basic literal in the grammar. They were pinned in a browser spec that CI
  // never runs and that asked the build alone; asking both is what named the
  // gap. The third is an id that shadows Object.prototype, which breaks the
  // runtime's frame tables at step time because they are keyed by element id.
  { item: 0, name: 'a half-empty coordinate', body: 'box a "x" at 3,' },
  { item: 0, name: 'a hex coordinate', body: 'box a "x" at 0x10,1' },
  { item: 0, name: 'an id that shadows Object.prototype', body: 'box constructor "x" at 0,0' },

  // ── item 12: the kind gate on an expanding statement's own tail ───
  // Its tail lands on what the statement draws – a table's cells, a lane's
  // bands, a sequence's actor heads, all boxes – so a class no box can carry
  // is refused there. `bars` and `grid` were gated in both files from the
  // start and these three in neither, which is the direction that merges
  // green: the build refuses the line and CI never builds these lectures.
  { item: 12, name: 'an edge class on a sequence tail', body: SEQ + ' {.smooth}' + SEQ_BODY },
  { item: 12, name: 'an edge class removed on a sequence tail', body: SEQ + ' {!smooth}' + SEQ_BODY },
  { item: 12, name: 'an edge class on a lanes tail', body: 'lanes l "one | two" at 0,0 w 4 band 0.8 {.smooth}' },
  { item: 12, name: 'an edge class on a table tail', body: 'table t "A|B" at 0,0 col 1,1 row 0.4 {.smooth}\n  "1|2"' },
  { item: 12, accept: true, name: 'a box class on a sequence tail', body: SEQ + ' {.dim}' + SEQ_BODY },
  { item: 12, accept: true, name: 'a box class on a lanes tail', body: 'lanes l "one | two" at 0,0 w 4 band 0.8 {.sharp}' },
  { item: 12, accept: true, name: 'a box class on a table tail', body: 'table t "A|B" at 0,0 col 1,1 row 0.4 {.tone-2}\n  "1|2"' },
];

// Item 13's scope table, paired: every head state, both signs, in all three
// positions the rule names. Generated rather than written out, because the
// two that *were* written out are exactly the two that passed while four
// others in the same row did not – the review found `.no-head` refused on a
// message tail and `!no-head` accepted, and the sequence tail had all six.
// A rule stated for a channel is tested for the whole channel.
for (const cls of ['no-head', 'one-head', 'both-heads']) {
  for (const sign of ['.', '!']) {
    const tail = `{${sign}${cls}}`;
    FIXTURES.push(
      { item: 13, name: `${sign}${cls} in an edge tail`, body: PAIR + `edge a -> c ${tail}` },
      { item: 13, name: `${sign}${cls} in a default edge`, body: `default edge ${tail}\n` + PAIR + 'edge a -> c' },
      {
        item: 13, name: `${sign}${cls} in a message tail`,
        body: `sequence s at 0,0\n  actor u "U"\n  actor r "R"\n  u -> r "m" ${tail}`,
      },
      // The one place the channel may be written, which is what makes the
      // three refusals above a rule about position rather than about the word.
      {
        item: 13, accept: true, name: `${sign}${cls} in a style step`,
        body: PAIR + `edge e1 a -> c\nstep s\n  style e1 ${tail}`,
      });
  }
}

// Known gaps, for the day there is one again: the assertion reads as it
// should *once the gap is closed*, so the entry fails the moment somebody
// fixes it and forgets to delete it. Empty, and it has to stay empty for this
// gate's name to be true – a green exit with a reported pending item is not
// agreement, and summarising it as one is how the missing-placement hole came
// to sit here for a revision. That hole is closed: `lint.js` asks whether an
// element after the first has a placement, off the compiler's own tables.
const PENDING = {};

export async function run({ report }) {
  const { ok, pendingOk, note } = report;
  const lint = lintAll(FIXTURES);

  let agree = 0;
  const wrong = [];
  FIXTURES.forEach((f, i) => {
    const buildRefuses = !render(f.body).ok;
    // Refusals, not remarks: a fixture the build accepts may still draw a
    // warning from the linter - a pale tone the contrast check names - and
    // that is the linter doing its other job, not disagreeing with the build.
    const lintReports = lint[i].some((f) => f.sev === 'error');
    const expectRefusal = !f.accept;
    const good = buildRefuses === expectRefusal && lintReports === expectRefusal;
    if (good) agree++;
    else {
      wrong.push(`item ${f.item} · ${f.name}: build ${buildRefuses ? 'refuses' : 'accepts'}, `
        + `lint ${lintReports ? 'reports' : 'silent'}, expected ${expectRefusal ? 'a refusal' : 'both to accept'}`);
    }
    if (f.name in PENDING) { pendingOk(good, `item ${f.item} · ${f.name}`, PENDING[f.name]); return; }
    ok(good, `item ${f.item} · ${f.name}`,
      good ? undefined : `build ${buildRefuses ? 'refuses' : 'accepts'}, lint ${lintReports ? 'reports' : 'is silent'}`);
  });

  // ── where the actor pre-scan stops ────────────────────────────────
  // The ambiguity test for a keyword-named message needs to know whether the
  // names either side of the arrow are actors, and an actor may be declared
  // *under* the message. So a scan runs ahead of the entry run to collect
  // them - and where that scan stops is the whole of its correctness. Too
  // eager and it walks past a terminating annotation, which carries an arrow
  // of its own, and counts actors that belong to no sequence; the block then
  // gets told a line is ambiguous against a cast it never had.
  //
  // Calibrated in both directions on purpose: the message must appear for the
  // two real orders and must not appear for the annotation, and build and
  // lint must agree on the count in all three. They diverged four against
  // five on the third one, which is the failure this repository treats as the
  // most expensive of all.
  {
    const AMBIG = /is a statement word, so this line is both a message/;
    const CASES = [
      { name: 'a keyword-named message, actors above', want: true,
        body: 'sequence s at 0,0\n  actor a "A"\n  actor b "B"\n  edge a -> b "hi"' },
      { name: 'the same, actors declared below it', want: true,
        body: 'sequence s at 0,0\n  edge a -> b "hi"\n  actor a "A"\n  actor b "B"' },
      { name: 'actors past a terminating annotation are not this sequence’s', want: false,
        body: 'sequence s at 0,0\n  edge x -> y "hi"\n'
          + 'text n "outside" right of s gap 1 -- s\nactor x "X"\nactor y "Y"' },
    ];
    const lintOf = lintAll(CASES);
    CASES.forEach((c, i) => {
      const r = render(c.body);
      const said = !r.ok && AMBIG.test(r.msg);
      ok(said === c.want, (c.want ? 'ambiguity named: ' : 'ambiguity NOT named: ') + c.name,
        said ? 'the compiler named it' : 'the compiler did not name it');
      const lintSaid = lintOf[i].some((f) => AMBIG.test(f.msg));
      ok(lintSaid === c.want, 'lint.js agrees on: ' + c.name,
        lintSaid ? 'lint named it' : 'lint did not name it');
      const nBuild = r.ok ? 0 : Number((r.msg.match(/(\d+) problem/) || [0, 0])[1]);
      ok(nBuild === lintOf[i].length,
        'build and lint report the same count for: ' + c.name,
        `build ${nBuild}, lint ${lintOf[i].length}`);
    });
  }

  // ── the two placement tables, against the compiler ────────────────
  // `DG_PLACED_HEADS` and `DG_PLACE_INTRO` are read by `lint.js` and by
  // nothing else, so nothing forces them to stay true as the grammar grows –
  // a new node statement that nobody adds to the table makes the linter
  // silently blind rather than loudly wrong. This is the guard: every
  // statement in `DG_KEYWORDS` is either placed or on the exempt list, so a
  // new one fails here until somebody classifies it.
  const EXEMPT = new Set(['edge', 'container', 'brace', 'align', 'spread', 'default', 'step']);
  for (const head of DG_KEYWORDS) {
    ok(DG_PLACED_HEADS.has(head) !== EXEMPT.has(head),
      `${head} is classified: it either takes a placement or is exempt`,
      DG_PLACED_HEADS.has(head) ? 'it is in both lists' : 'it is in neither');
  }
  // And every intro word really introduces one, on a real second element.
  const INTRO_BODY = {
    at: 'at 1,1', between: 'between a,c', below: 'below a gap 1', above: 'above a gap 1',
    right: 'right of a gap 1', left: 'left of a gap 1',
  };
  for (const w of DG_PLACE_INTRO) {
    const r = render(QUAD + `box b "B" ${INTRO_BODY[w]}`);
    ok(r.ok, `"${w}" introduces a placement the compiler accepts`,
      INTRO_BODY[w] ? (r.ok ? '' : r.msg.split('\n')[1]) : 'no fixture for this word – add one');
  }

  // ── the list is a list, not a bag ─────────────────────────────────
  // Two fixtures with the same body and the same expectation are one fixture
  // run twice. Three of them accumulated the day the generated loop was added
  // beside the hand-written pair that prompted it, and nothing said so: the
  // gate reported agreement on 164 fixtures and meant 161. It cost a review
  // and a scratch program to find, and it costs a Map to ask.
  {
    const bodies = new Map();
    const dupes = [];
    for (const f of FIXTURES) {
      const key = JSON.stringify([f.body, !!f.accept]);
      if (bodies.has(key)) dupes.push(`'${f.name}' is '${bodies.get(key)}' again`);
      else bodies.set(key, f.name);
    }
    ok(dupes.length === 0, 'no two fixtures are the same line with the same expectation',
      dupes.join(' · '));
  }

  const pending = FIXTURES.filter(f => f.name in PENDING).length;
  note(`${FIXTURES.length} fixtures · ${FIXTURES.filter(f => f.accept).length} of them acceptance cases `
    + `· ${agree} agree · ${pending} pending`);
  for (const w of wrong) if (!Object.keys(PENDING).some(k => w.includes(k))) note('  ' + w);
}
