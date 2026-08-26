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
  // ── item 2: one sentence per statement, and the derived stop sets ──
  { item: 2, name: 'rightof is not a word', body: QUAD + 'box b "B" rightof a gap 1' },
  { item: 2, name: 'space is not a gap', body: QUAD + 'text t "note" right of a space 1' },
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
  { item: 8, name: 'align on a placement is flush', body: QUAD + 'box b "B" above a gap 0.3 align left' },

  // ── item 1: calm was renamed to dim ───────────────────────────────
  { item: 1, name: 'calm as a step verb', body: PAIR + 'step s\n  calm a' },
  { item: 1, name: 'calm as a chart option', body: 'bars f "3,5" at 0,0 w 2 h 1 calm 0' },

  // ── item 5: flush on a placement, side on an edge ─────────────────
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
  { item: 13, name: 'a head class in the tail', body: PAIR + 'edge a -> c {.no-head}' },
  { item: 13, name: 'a head class in a default', body: 'default edge {.no-head}\n' + PAIR + 'edge a -> c' },

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
  { item: 12, accept: true, name: 'a head class styled onto an edge', body: PAIR + 'edge e1 a -> c\nstep s\n  style e1 {.no-head}' },
  { item: 12, accept: true, name: 'a prominence styled onto a box', body: PAIR + 'step s\n  style a {.dim}' },

  // The build reads the token after the head as the name and refuses the line
  // when there is none.
  { item: 2, name: 'a box with no name', body: PAIR + 'box' },
  { item: 2, name: 'a container with no name', body: PAIR + 'container' },
  { item: 2, name: 'a chart with no name', body: PAIR + 'bars' },
  { item: 2, name: 'a plot with no name', body: PAIR + 'plot' },
  { item: 2, name: 'a name that is only a tail', body: PAIR + 'box {.dim}' },

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
    const lintReports = lint[i].length > 0;
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

  const pending = FIXTURES.filter(f => f.name in PENDING).length;
  note(`${FIXTURES.length} fixtures · ${FIXTURES.filter(f => f.accept).length} of them acceptance cases `
    + `· ${agree} agree · ${pending} pending`);
  for (const w of wrong) if (!Object.keys(PENDING).some(k => w.includes(k))) note('  ' + w);
}
