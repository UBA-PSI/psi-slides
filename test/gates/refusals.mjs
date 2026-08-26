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
 * These fixtures are the ones the diagram revision was verified against –
 * items 1, 2, 3, 5, 8, 9, 12, 13, 16, 19, 20, 21, 22, 23, 30 and 31 of
 * `revision-proposal.md` – merged from the two scratch programs that carried
 * them. `item` is the proposal item, for anyone reading back.
 */
import { render, lintAll } from './harness.mjs';

export const name = 'build and lint agree on every refusal';

// Two preambles, because the fixtures were written against two. `PAIR` is
// enough for anything about one line; `QUAD` gives a second row, which the
// placement fixtures need in order to have somewhere to point.
const PAIR = 'box a "A" at 0,0\nbox c "C" right of a gap 1\n';
const QUAD = 'box a "A" at 0,0\nbox c "C" at 2,0\nbox p "P" at 0,1\nbox q "Q" at 2,1\n';

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
];

// Known gaps: the assertion reads as it should once the gap is closed, so the
// entry fails the day it is fixed and somebody deletes it.
const PENDING = {
  // `lint.js` never asks whether an element has a placement. Deciding it means
  // knowing which element is the first in the block – the one that may sit at
  // the origin without saying so – which the linter does track, but the check
  // was never written. The dangerous direction: this line merges green.
  'a later box needs a placement':
    'lint.js has no missing-placement check, so it is silent on a line the build refuses',
};

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

  const pending = FIXTURES.filter(f => f.name in PENDING).length;
  note(`${FIXTURES.length} fixtures · ${FIXTURES.filter(f => f.accept).length} of them acceptance cases `
    + `· ${agree} agree · ${pending} pending`);
  for (const w of wrong) if (!Object.keys(PENDING).some(k => w.includes(k))) note('  ' + w);
}
