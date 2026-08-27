/*
 * The constructs the grammar is supposed to still accept.
 *
 * This is the counterpart to `refusals.mjs`, and it is not decoration. Every
 * other check in this repository asks whether a *refusal* fires; a revision
 * that adds a hundred refusals can only fail in the other direction, and a
 * grammar that has quietly stopped accepting something is invisible until an
 * author writes it. That is not hypothetical: the pass that produced this list
 * found a guard written against a binding declared several hundred lines
 * further down, so every named message in a `sequence` threw
 * `Cannot access 'known' before initialization` rather than compiling. No
 * corpus line named a message, so nothing but a construct census could have
 * caught it.
 *
 * One entry per shape the grammar offers, not one per lecture line: the point
 * is coverage of the vocabulary, so a construct that appears nowhere in any
 * lecture belongs here more than one that appears forty times.
 *
 * **What this gate proves, exactly: the line parses and the block compiles.**
 * Not that it draws the right thing. That distinction is not pedantry – this
 * file carried `reg r <-> u` and went green while the message drew a single
 * arrowhead, because the sequence sub-grammar accepted the token and then
 * consulted a one-bit arrow model. `semantics.mjs` is the gate that reads the
 * emitted SVG back; a construct whose *meaning* can be wrong while it compiles
 * belongs there as well as here.
 */
import { render } from './harness.mjs';

export const name = 'every construct the grammar accepts still compiles';

const B = 'box a "A" at 0,0\nbox c "C" right of a gap 1\n';

const CONSTRUCTS = [
  ['a bare figure', 'box a "A"'],
  ['every placement form',
    B + 'box d "D" below a gap 1\nbox e "E" above a gap 1\nbox f "F" left of a gap 1\nbox g "G" between a,c'],
  ['flush on both axes',
    B + 'box d "D" right of a gap 1 flush top\nbox e "E" below a gap 1 flush middle'],
  ['align and spread',
    B + 'box d "D" below a gap 1\nalign x middle a,d\nspread y a,c,d'],
  ['every arrow token',
    B + 'edge a -> c\nedge a <- c\nedge a -- c\nedge a <-> c'],
  ['a named edge with a full tail',
    B + 'edge wire a -> c "x" {.dashed @w} pad 0.2 side top'],
  ['both leaders',
    B + 'text n "x" below a gap 1 -- a\ntext m "y" below c gap 1 -> c'],
  ['container and brace',
    B + 'container k "cap" over a,c pad 0.3\nbrace r "lab" over a,c side right pad 0.4'],
  ['every outline on a box',
    B + 'box h "" right of c gap 1 {.hex}\nbox i "" right of h gap 1 {.diamond}\n'
      + 'box j "" right of i gap 1 point up {.chevron}\nbox k2 "" right of j gap 1 point left {.wedge}\n'
      + 'box l "" right of k2 gap 1 {.cross}'],
  ['prominence, every state and both signs',
    B + 'box d "D" below a gap 1 {.emph}\nbox e "E" below d gap 1 {.dim}\nbox f "F" below e gap 1 {.ghost}\n'
      + 'step s\n  emph a\n  dim c\n  ghost d\n  style e {!dim}'],
  ['bars, every option', 'bars f "3,5,4" "a b c" at 0,0 aspect 4:3 space 0.2 emph 1 dim 0 ghost 2'],
  ['bars as a series', 'bars f "3,5,4" at 0,0 w 2 h 1\nbars g "1,2,3" series of f stacked {.tone-2}'],
  ['bars on their side', 'bars f "3,5,4" "a|b|c" at 0,0 w 2 h 1 horizontal'],
  ['a plot with ticks and a point in its own units',
    'plot p "x" "y" at 0,0 w 2 h 1 x 0,1 y 0,1 tick 0.25\ndot d "" at p@0.5,p@0.5'],
  ['a grid', 'grid g box 3x3 at 0,0 cell 0.3 space 0.05'],
  ['a table with rows', 'table t "A|B|C" at 0,0 col 1,1,1 row 0.42\n"1|2|3"\n"4|5|6"'],
  ['lanes with a band height', 'lanes s "User | SOC | IT" at 0,0 w 6 band 0.9'],
  ['a sequence, every entry shape',
    'sequence q at 0,0 header 0.9\n  actor u "User"\n  actor r "RP"\n  u -> r "register"\n'
      + '  note u "a note"\n  reg r <-> u "both ways" side bottom\n  u -> u "self"\n'
      + '  r -- u "plain" space 0.4 {.dashed}'],
  // The three shapes of annotation that follow a sequence's entry run. Each
  // one carries an arrow token, which is what used to drag it into the run and
  // report that the words in it are not actors - and it only did so when the
  // annotation came *first*, because a `brace` above it ended the run and both
  // then compiled. A statement keyword ends the run now, so all three parse
  // wherever they are written; the leader form is the one that broke, and the
  // `brace`-first form is the workaround that must not become the rule.
  ['an annotation with a leader, first line after a sequence',
    'sequence x at 0,0\n  actor a "A"\n  actor b "B"\n  a -> b "hello"\n'
      + 'text n "why here" right of x-0 gap 1 -- x-0'],
  ['the same annotation behind a brace',
    'sequence x at 0,0\n  actor a "A"\n  actor b "B"\n  a -> b "hello"\n'
      + 'brace br over x-0 "phase" side left\ntext n "why here" right of x-0 gap 1 -- x-0'],
  // The property the whole actor pre-scan exists for, and the one thing in
  // this family that is *legal*. A message may name an actor declared under
  // it - an ordinary forward reference, which the rest of the grammar allows
  // everywhere - so the ambiguity test cannot answer from the entries it has
  // read so far. Refusals hold the illegal shapes; nothing held this one, and
  // an implementation that quietly required actors-before-messages would have
  // passed every gate in the repository while making the scan pointless.
  ['a message naming actors declared under it',
    'sequence s at 0,0\n  a -> b "hi"\n  actor a "A"\n  actor b "B"'],
  ['the same with a note and a second message between',
    'sequence s at 0,0\n  a -> b "one"\n  note a "thinking"\n  b -> a "two"\n'
      + '  actor a "A"\n  actor b "B"'],
  ['an edge drawn between two sequence-generated names',
    'sequence x at 0,0\n  actor a "A"\n  actor b "B"\n  a -> b "hello"\n'
      + 'box far "elsewhere" right of b gap 2\nedge x-0 -> far {.dashed}'],
  // Prominence is one slot with three words, and one kind list behind all
  // three. `emph` on a text draws its glyphs in --emph; on an image it draws
  // no ink and still acts, because the slot displaces a `dim`. Both were
  // refused as classes while the *verb* was accepted and ungated, which is the
  // asymmetry these four fixtures exist to hold shut.
  ['prominence as a class on every kind it reaches',
    'box a "A" at 0,0 {.emph}\ntext t "T" right of a gap 1 {.emph}\n'
      + 'image i pic "P" below a gap 1 w 0.5 {.dim}\nedge a -> t {.ghost}'],
  ['prominence as a verb on the same kinds',
    'box a "A" at 0,0\ntext t "T" right of a gap 1\nimage i pic "P" below a gap 1 w 0.5\n'
      + 'step s\n  emph a, t, i\nstep s2\n  dim a\n  ghost t'],
  ['prominence through a style step on the same kinds',
    'box a "A" at 0,0\ntext t "T" right of a gap 1\nimage i pic "P" below a gap 1 w 0.5\n'
      + 'step s\n  style a {.emph}\n  style t {.emph}\n  style i {.emph}'],
  ['a class the table has nothing to say about, on a chart frame',
    'bars f "3,4,5" at 0,0 w 1 h 1 {.dim}\nstep s\n  style f {.dim}\n  emph f'],
  ['a default block and a tag default',
    'default box {.tone-1}\ndefault box @d w 0.5\nbox a "A" at 0,0 {@d}\nbox b "B" right of a gap 1 {.tone-3 !tone-1}'],
  ['steps, every op',
    B + 'box d "D" below a gap 1 {@t}\nstep s1\n  hide d\n  move a by 0.2,0\n  label c "new"\n'
      + 'step s2\n  show d\n  move d to 2,2\n  style @t {.tone-4}'],
  ['smooth and elbow, separately',
    B + 'edge a -> c via 1,1 {.smooth}\nedge e2 c -> a {.elbow}'],
];

export async function run({ report }) {
  const { ok, note } = report;
  let warned = 0;
  for (const [what, body] of CONSTRUCTS) {
    const r = render(body);
    warned += r.warns.length;
    ok(r.ok, what, r.ok ? undefined : r.msg.split('\n').slice(1, 4).join(' | ').trim());
  }
  note(`${CONSTRUCTS.length} constructs · ${warned} compiler warning(s) between them`);
}
