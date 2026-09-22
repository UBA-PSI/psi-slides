/*
 * The overlap census measures ink, and the two ways a line box is not ink.
 *
 * `dgOverlapWarnings` asks whether two authored elements are fighting for the
 * same paper. Everything it compares is the extent the layout gave the
 * element, and for a `box`, a `dot` and an `image` that extent is exactly what
 * the room sees. For a `text` it is not, in two directions at once:
 *
 *   - **down**, because the block is DG_LINE_H per line and a line inks
 *     DG_INK_H of it. The leading is invisible, and it is not split evenly:
 *     `dgTextEl` drops each baseline DG_BASE_DROP below its line box's centre,
 *     so the air is 0.245 em above the caps and 0.075 em below the descenders;
 *   - **across**, because the block is as wide as its *widest* line and its
 *     other lines do not reach that far.
 *
 * Both cost the census a real defect, and both are in this file as the shape
 * that cost it. The check used to answer the first with a 24 px floor wherever
 * either side was a text, which is more than a whole line of figure type: the
 * geometry it exists for – a label with an outline drawn through the words –
 * crosses that outline by a fraction of one line by construction, so it was
 * exactly the case the floor could not see. `lectures/network-security`
 * `#ns-a41` shipped for the length of a branch with its verification block
 * printed across the box above it and a silent build.
 *
 * What the ceiling in `corpus.mjs` guards and this does not: that no figure in
 * the repository gains a warning. Between them, both halves of the change are
 * held – this one that the rule fires on the geometry it was written for, that
 * one that it stays quiet on 138 real figures.
 *
 * The three fixtures are transcriptions and not inventions. Two are the
 * geometry `lectures/network-security` shipped, taken off the lines the fix
 * commit rewrote (`45a0ee5`); the third is the ragged pair that stands in the
 * same lecture today and must stay silent. Each carries its lecture's
 * `draw-defaults` layer as an ordinary `default` line, because `default text
 * {.small}` is what sets the type these numbers are in.
 */
import { makeCore } from './harness.mjs';
import { dgTextInkRects, DG_LINE_H, DG_INK_H, DG_CAP_H, DG_DESC_H, DG_BASE_DROP }
  from '../../diagram-core.mjs';

export const name = 'overlap: the census measures ink and not the line box';

function overlaps(body, head = '') {
  const { core, warns } = makeCore();
  core.renderDiagram(body, head ? `unit=${head}` : '', {});
  return warns.filter(w => / overlap by /.test(w));
}

// `#ns-a41`, as it shipped: a three-line verification block centred on a
// half-row chevron, which reaches a line and a half above that chevron's
// middle – further up than the 0.2 rows of clear paper under the box above it.
// The line box crossed `sig`'s bottom outline by 5.5 px and the ink by 2.6.
const STRUCK = `default box {.tone-3} w 2.78 pad 0.3lh
default text {.small}
box  sig "Signature over ClientHello,\\nServerHello, and Certificate" at 0,0
box  a2 "" below sig gap 0.2 flush left w 0.5 h 0.45 point left {.chevron}
text vf "Verify certificate  Verify signature\\nCompute secret = DH(c, S)  Derive keys = KDF(secret)\\nVerify MAC" right of a2 gap 0.4 {.left}`;

// The same figure after the fix: two lines instead of three, and the chevron
// 0.45 rows below the block rather than 0.2. Nothing else moved.
const CLEAR = `default box {.tone-3} w 2.78 pad 0.3lh
default text {.small}
box  sig "Signature over ClientHello,\\nServerHello, and Certificate" at 0,0
box  a2 "" below sig gap 0.45 flush left w 0.5 h 0.45 point left {.chevron}
text vf "Verify certificate  Verify signature\\nCompute secret = DH(c, S)  Derive keys = KDF(secret)  Verify MAC" right of a2 gap 0.4 {.left}`;

// `#ns-a49` as it stands today: a chevron pointing at a one-word value, whose
// top passes 6 px under the two-line block above it. That block's *long* line
// is 186 px of "Basic Constraints ( 2.5.29.19 )" and its short one is 22 px of
// "YES"; only the short one is anywhere near the chevron, and it stops 10 px
// short of it. Read as one rectangle the pair intersects by 155x6 and the
// build called it a collision.
const RAGGED = `default text {.small}
text l2 "Extension\\nCritical" at 0,0 {.right .muted}
text v2 "Basic Constraints ( 2.5.29.19 )\\nYES" right of l2 gap 0.2 flush top {.left}
text l2b "Certificate Authority" below l2 gap 0 flush right {.right .muted}
text v2b "NO" right of l2b gap 0.2 flush top {.left}
box ca "no signing of other keys!" right of v2b gap 0.5 h 0.9 point left {.chevron .tone-4}`;

export async function run({ report }) {
  const { ok, note } = report;

  // ── the metric itself ────────────────────────────────────────────
  // The three fractions have to sum back to the two numbers that were already
  // written down, or the band this gate is about is in the wrong place.
  ok(Math.abs((DG_CAP_H + DG_DESC_H) - DG_INK_H) < 1e-9,
    'cap height plus descender is DG_INK_H', DG_CAP_H + DG_DESC_H);
  const air = DG_LINE_H - DG_INK_H;
  const above = DG_LINE_H / 2 - (DG_CAP_H - DG_BASE_DROP);
  const below = DG_LINE_H / 2 - (DG_BASE_DROP + DG_DESC_H);
  ok(Math.abs(above + below - air) < 1e-9,
    'the leading above and below one line is the whole of it', `${above} + ${below}`);
  ok(above > below * 2,
    'and it is not split evenly – a line carries most of its air on top',
    `${above.toFixed(3)} above, ${below.toFixed(3)} below`);

  // One line of 15 px type, centred on the origin: the rectangle is the glyph
  // band and not the line box, and it sits 0.245 em below the box's top edge.
  const one = dgTextInkRects('Verify MAC', new Set(), 15, [100, 50, 0], 'middle');
  ok(one.length === 1, 'one line gives one rectangle', one.length);
  ok(Math.abs(one[0].h - 15 * DG_INK_H) < 1e-9,
    'its height is the ink and not the line box', one[0].h);
  ok(Math.abs((one[0].y - (50 - 15 * DG_LINE_H / 2)) - 15 * above) < 1e-9,
    'and its top is the leading below the line box', one[0].y);

  // Two lines of different lengths give two rectangles of different widths –
  // the whole of the second half of this change.
  const two = dgTextInkRects('Basic Constraints\nYES', new Set(), 12, [0, 0, 0], 'start');
  ok(two.length === 2, 'two lines give two rectangles', two.length);
  ok(two[0].w > two[1].w * 4,
    'each as wide as its own line, not as wide as the block',
    `${two[0].w.toFixed(1)} and ${two[1].w.toFixed(1)}`);
  ok(two[0].x === 0 && two[1].x === 0,
    'anchored start, both begin at the origin', `${two[0].x}, ${two[1].x}`);
  const ends = dgTextInkRects('Basic Constraints\nYES', new Set(), 12, [0, 0, 0], 'end');
  ok(Math.abs((ends[0].x + ends[0].w) - 0) < 1e-9
    && Math.abs((ends[1].x + ends[1].w) - 0) < 1e-9,
  'anchored end, both finish at it', `${ends[0].x + ends[0].w}, ${ends[1].x + ends[1].w}`);

  // A blank line is spacing the author wrote: it reserves its line box and
  // inks nothing, so it is not a rectangle anything can collide with.
  const blank = dgTextInkRects('Key ID\n \n ', new Set(), 12, [0, 0, 0], 'start');
  ok(blank.length === 1, 'a line of spaces inks nothing', blank.length);

  // A turned label reads bottom-to-top, so its rectangles stack across rather
  // than down and each one is as *tall* as its own line is long.
  const turned = dgTextInkRects('Bandwidth', new Set(['turn']), 15, [40, 40, -90], 'middle');
  ok(turned.length === 1 && turned[0].h > turned[0].w * 3,
    'a turned line is a vertical strip', turned[0] && `${turned[0].w}x${turned[0].h}`);
  ok(Math.abs(turned[0].w - 15 * DG_INK_H) < 1e-9,
    'and the ink is across it rather than down it', turned[0].w);

  // ── the geometry the rule was written for ────────────────────────
  const struck = overlaps(STRUCK, '120x40');
  ok(struck.length === 1 && /\bsig\b/.test(struck[0]) && /\bvf\b/.test(struck[0]),
    'a label struck through by an outline is reported',
    struck.length ? struck.join('\n      ') : 'nothing reported');
  if (struck.length) note(struck[0].replace(/ – nothing can be drawn[\s\S]*$/, ''));

  // ── and what the number is said in ───────────────────────────────
  // The message used to carry px alone, and a px here is not a px in the
  // room: the figure is scaled to fill its canvas – about 1.9x in the case
  // this check was written from – so "overlap by 76x15 px" described a thing
  // the room sees as 145x28. The compiler cannot know that scale, so the
  // number is said in rows, which is the unit a `gap` is written in on both
  // axes, and the px beside it are named as the drawing's own.
  ok(/ overlap by [\d.]+×[\d.]+ rows \(\d+×\d+ px of the drawing's own grid/.test(struck[0] || ''),
     'the overlap is given in rows first, with the drawing\'s own px beside it', struck[0]);
  ok(!/overlap by \d+×\d+ px/.test(struck[0] || ''),
     'and never as a bare px figure, which an author reads as the px they can see');
  // The two figures are one quantity twice: rows are the px over the grid's
  // row height, which is 40 on this fixture's `120x40`. A row and not a
  // column on both axes, because that is what a `gap` is measured in.
  {
    const m = /by ([\d.]+)×([\d.]+) rows \((\d+)×(\d+) px/.exec(struck[0] || '') || [];
    // 0.8 px of slack: the px are rounded to whole ones and the rows to two
    // decimals, which is 0.2 px of the row on top of the half a px.
    ok(m.length === 5 && Math.abs(+m[1] * 40 - +m[3]) < 0.8 && Math.abs(+m[2] * 40 - +m[4]) < 0.8,
       'the rows and the px are one quantity twice, over the grid\'s row height on both axes',
       m.slice(1).join(' '));
  }
  ok(overlaps(CLEAR, '120x40').length === 0,
    'and the redrawn figure beside it is silent', overlaps(CLEAR, '120x40').join('\n      '));

  // ── and the two ways it must stay quiet ──────────────────────────
  const ragged = overlaps(RAGGED, '150x30');
  ok(ragged.length === 0,
    'a block whose long line is nowhere near the shape is silent',
    ragged.join('\n      '));

  // Leading alone is never a collision: two captions a hair apart in line
  // boxes have clear paper between the words. `gap 0` on a 40 px row puts the
  // second line box directly under the first, so every px of the 0.32 em of
  // air between the two glyph runs is the leading and nothing else.
  ok(overlaps('text a "first caption" at 0,0\ntext b "second caption" below a gap 0', '120x40').length === 0,
    'two captions in touching line boxes are silent');

  // What has not changed: two drawn shapes are still held to 2 px, and
  // containment is still nesting rather than collision.
  const boxes = overlaps('box p "Filter" at 0,0 w 1 h 1\nbox q "Queue" at 0.6,0 w 1 h 1', '120x72');
  ok(boxes.length === 1, 'two boxes sharing paper are still reported',
    boxes.length ? boxes.join('\n      ') : 'nothing reported');
  ok(overlaps('box p "" at 0,0 w 3 h 2\ntext t "inside" at 0,0', '120x72').length === 0,
    'a label inside the box it is written in is nesting, not collision');
  ok(overlaps('box p "" at 0,0 w 3 h 2\ndot d "" at 0,0 r 0.2', '120x72').length === 0,
    'and so is a dot marking a box centre');
}
