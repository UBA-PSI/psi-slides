/*
 * The neighbour guides (editor.md §9.2).
 *
 * Snapping in a drawing tool aligns pixels. Here every snap target
 * corresponds to a statement the grammar can write, so the thing to assert is
 * never where the element landed – it is **what got written down**. A drag
 * that put the box in the right place by writing a number is a failure of
 * exactly the kind this feature exists to close, and on a screenshot it looks
 * perfect.
 *
 * So each of the sections below checks the same three things: the guide
 * appeared on the canvas, the status bar named the statement before the button
 * came up, and the source afterwards carries the *relation* rather than the
 * number it resolves to.
 *
 * The last two sections build a deck of their own, and the reason is the one
 * test/README.md gives for the other five that do. They need three elements
 * collinear on a bare `at`, so that a drag along that line has a `between a,b`
 * to propose and a nudge across it has a `.cx` to snap back to. `#look` in
 * lectures/diagrams used to be that shape by accident, being one tall figure
 * of six rows; splitting it into a figure per slide - which is what a room
 * needs, since "the bottom row of the catalogue" is not a reference anyone can
 * hold - took the shape away. A fixture says what the sections need instead of
 * depending on a lecture keeping a shape it was never drawn to keep.
 *
 * Drags are given in cells, not pixels, and converted through the canvas CTM –
 * the figures are laid out in grid units and the editor's zoom is fitted to
 * the frame, so a spec written in screen pixels would be measuring the
 * viewport.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { serve, ROOT } from './harness.mjs';

export const name = 'editor · neighbour guides';
export const lecture = 'diagrams';
export const view = 'audience';

// Three boxes on one axis at x=0 (a, mid, b) and two on another at x=3 (c, d).
//
// **`b` is placed `below a` and that is load-bearing.** `dgeGuidePairs` only
// pairs elements that are already related - the two ends of an edge, the outer
// members of an `align` or `spread`, or a node and the element its relative
// placement names. Five boxes on five bare `at` coordinates produce no pairs at
// all and therefore no `between` candidate, however neatly they line up. The
// relation between a and b is what makes the pair the guide is allowed to
// propose.
//
// `mid` is then strictly between them and bare, so a drag *along* that axis has
// a `between` to offer; `d` merely shares c's centre line with nothing on the
// far side, so a nudge *across* that axis can only answer `.cx`. Both dragged
// elements are bare `at`, which is the other precondition: an element already
// carrying a relation has one to lose and is left alone.
const FIXTURE = `---
title: Guides
collapse: none
---

## figure: Guides {#fix}

::: draw {unit=118x74}
box a   "a"   at 0,0   w 0.6 h 0.4 {.tone-2}
box mid "mid" at 0,1.2 w 0.6 h 0.4 {.tone-3}
box b   "b"   below a gap 2.6 same as a {.tone-2}
box c   "c"   at 3,4.2 w 0.6 h 0.4 {.tone-2}
box d   "d"   at 3,5.6 w 0.6 h 0.4 {.tone-3}
:::
`;

function buildFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-guides-'));
  fs.writeFileSync(path.join(dir, 'source.md'), FIXTURE);
  const r = spawnSync(process.execPath,
    [path.join(ROOT, 'build.js'), path.join(dir, 'source.md'), '--audience-only'],
    { cwd: ROOT, encoding: 'utf8' });
  return { dir, status: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

export async function run({ page, report, walkTo, ed }) {
  const { ok, note } = report;

  const marks = () => page.locator('#dge-guides .dge-nb').count();
  const labels = () => page.evaluate(() =>
    [...document.querySelectorAll('#dge-guides .dge-nb-label')].map((t) => t.textContent));
  const statusNote = () => page.evaluate(() =>
    (document.querySelector('#dge-statusnote') || {}).textContent || '');
  const statusLine = () => page.evaluate(() =>
    (document.querySelector('#dge-statusline') || {}).textContent || '');
  // Screen pixels per grid cell, off the canvas transform. Everything below is
  // expressed in cells, which is the unit the source is written in.
  const cellPx = () => page.evaluate(() => {
    const m = document.querySelector('#dge-art-svg').getScreenCTM();
    return { x: m.a * DGE.model.unit[0], y: m.d * DGE.model.unit[1] };
  });
  const pick = async (id) => {
    const c = await ed.centreOf(`#dge-art-svg [id$="-${id}"]`);
    await page.mouse.click(c.x, c.y);
    await page.waitForTimeout(320);
    return ed.selection();
  };
  // Drag by cells, and report what the canvas and the status bar said while
  // the button was still down – the panel is not re-rendered during a gesture,
  // so the preview is read where the editor puts it.
  const dragCells = async (id, dx, dy, mods = {}) => {
    const c = await ed.centreOf(`#dge-art-svg [id$="-${id}"]`);
    const u = await cellPx();
    if (mods.ctrl) await page.keyboard.down('Control');
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await page.mouse.move(c.x + dx * u.x, c.y + dy * u.y, { steps: 16 });
    await page.waitForTimeout(220);
    const seen = { n: await marks(), labels: await labels(),
      note: await statusNote(), line: await statusLine() };
    await page.mouse.up();
    await page.waitForTimeout(400);
    if (mods.ctrl) await page.keyboard.up('Control');
    return seen;
  };

  // Out of the modal and on to the next figure. Two presses: the first drops
  // the selection, the second closes the editor – and the deck cannot be
  // walked until it has, because while the modal is up it owns the keyboard.
  const leave = async () => {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(280);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(450);
  };

  let seen;

  // The sections run in the order the figures sit in the lecture rather than
  // the order §9.2 lists the rows: forward is the only direction walkTo goes,
  // and a spec that walked backwards would be testing the harness.

  // ── equal spacing across three or more ──
  // The one candidate that writes a *statement* rather than a token, so it is
  // held to a third of the others' radius: a spread makes the element a
  // follower, and that has to be aimed at rather than stumbled into.
  await walkTo('unsafety');
  ok(await ed.open('unsafety'), 'the editor is open on #unsafety');
  await ed.beat(0);
  ok(await pick('df') === 'box df', 'a box in the middle of a run is selected', await ed.selection());
  ok(!(await ed.lineWith('spread ')), 'and the block has no spread statement yet');

  seen = await dragCells('df', -0.3, 0.5);
  note('labels : ' + JSON.stringify(seen.labels));
  note('status : ' + seen.note);
  ok(seen.labels.filter((t) => t === '=').length >= 2,
    'the matched marks appear between the centres', JSON.stringify(seen.labels));
  ok(/^spread [xy] /.test(seen.note),
    'and the status bar names the statement it would write', seen.note);
  const spread = await ed.lineWith('spread ');
  note('written: ' + spread);
  ok(/^spread [xy] \w+, \w+, \w+/.test((spread || '').trim()),
    'which is what the block gains – three or more names, the ends as anchors', spread);
  const dfAfter = await ed.lineWith('box  df');
  note('df     : ' + dfAfter);
  ok(!/offset/.test(dfAfter || ''),
    'and no offset is left on the line for the spread to override', dfAfter);
  ok(!(await ed.problems()).includes('line '), 'the block parses', await ed.problems());

  await leave();

  // ── another element's centre or edge line -> a ref coordinate ──
  // §9.2 calls this the row that matters most, because nobody types
  // `at c1.cx,m0.cy` from a standing start. #mac's "Security goals" note is
  // the case it is written for: a free label at 3.55,-1.05, held by nothing.
  await walkTo('mac');
  ok(await ed.open('mac'), 'the editor is open on #mac');
  await ed.beat(0);
  ok(await pick('goals') === 'text goals', 'the free label is selected', await ed.selection());
  const before = await ed.lineWith('text goals');
  ok(/at 3\.55,-1\.05/.test(before || ''), 'and starts on two bare numbers', before);

  seen = await dragCells('goals', -0.3, -0.2);
  note('labels : ' + JSON.stringify(seen.labels));
  note('status : ' + seen.note);
  ok(seen.n === 2, 'two guides light up, one per axis', String(seen.n));
  ok(seen.labels.some((t) => /^\w+\.(cx|left|right)$/.test(t))
    && seen.labels.some((t) => /^\w+\.(cy|top|bottom)$/.test(t)),
  'each names the line it would write', JSON.stringify(seen.labels));
  ok(/–/.test(seen.note) && seen.labels.every((t) => seen.note.includes(t)),
    'and the status bar names both before the button comes up', seen.note);
  ok(/at \w+\.\w+,\w+\.\w+/.test(seen.line),
    'while the line it is about to write is already a ref coordinate', seen.line);

  const after = await ed.lineWith('text goals');
  note('after  : ' + after);
  ok(/ at [a-z]\w*\.(cx|left|right),[a-z]\w*\.(cy|top|bottom) /.test(after || ''),
    'the source carries the relation, not the number it resolves to', after);
  ok(!/at [\d.-]+,/.test(after || ''), 'and no coordinate survived as a bare number', after);
  ok(await marks() === 0, 'the guides are gone once the button is up');
  ok(!(await ed.problems()).includes('line '), 'the block parses', await ed.problems());

  // The reference has to survive the *next* drag, or the guide would be a
  // one-shot: §9.3 rewrites the nudge, never the reference.
  seen = await dragCells('goals', 0.45, 0);
  const nudged = await ed.lineWith('text goals');
  note('nudged : ' + nudged);
  ok(/at [a-z]\w*\.(cx|left|right)[+-][\d.]+,/.test(nudged || ''),
    'a further drag moves the nudge and keeps the reference', nudged);

  // And coming back onto the line takes the nudge off again.
  seen = await dragCells('goals', -0.45, 0);
  const back = await ed.lineWith('text goals');
  note('back   : ' + back);
  ok(/at [a-z]\w*\.(cx|left|right),/.test(back || '') && !/[+-][\d.]+,/.test(back || ''),
    'and coming back onto the line takes the nudge away again', back);

  // Ctrl/Cmd suspends these exactly as it suspends the grid.
  seen = await dragCells('goals', 0.09, 0, { ctrl: true });
  ok(seen.n === 0, 'Ctrl suspends them – nothing lights up', String(seen.n));
  const freed = await ed.lineWith('text goals');
  note('ctrl   : ' + freed);
  ok(/at [a-z]\w*\.\w+[+-][\d.]+,/.test(freed || ''),
    'and the drag goes through as an ordinary nudge', freed);

  await leave();

  // ── the same gap a sibling already has ──
  // #look is the figure to do this on because its row labels sit at gaps of
  // their own beside three rows of siblings, so there is always another gap in
  // reach. **The number is read off the guide's own label rather than written
  // out here**, and then looked for in the source on a line that is not this
  // one: the property is that the drag lands on a number a sibling already
  // carries, not that it lands on any particular number. Pinning it to a
  // constant made the spec a statement about the lecture – when #look was
  // rebuilt the gaps moved, and a passing editor started failing.
  await walkTo('look');
  ok(await ed.open('look'), 'the editor is open on #look');
  await ed.beat(0);
  ok(await pick('tl') === 'text tl', 'the family label is selected', await ed.selection());
  const gapBefore = await ed.lineWith('text tl');
  const gapOf = (l) => ((l || '').match(/ gap ([\d.]+)/) || [])[1] || null;
  ok(!!gapOf(gapBefore), 'and it is held by a gap of its own', gapBefore);

  seen = await dragCells('tl', 0.1, 0);
  note('labels : ' + JSON.stringify(seen.labels));
  note('status : ' + seen.note);
  ok(seen.n >= 1, 'the sibling gap lights up', String(seen.n));
  const marked = ((seen.labels.find((t) => /^gap [\d.]+$/.test(t)) || '').match(/[\d.]+/) || [])[0];
  ok(!!marked && marked !== gapOf(gapBefore),
    'marked on the sibling that already has it, and it is not this element’s own number',
    JSON.stringify(seen.labels));
  ok(/the same gap \w+ has/.test(seen.note), 'and the status bar says whose', seen.note);
  const gapAfter = await ed.lineWith('text tl');
  note('after  : ' + gapAfter);
  ok(gapOf(gapAfter) === marked,
    'the gap lands on exactly the number the guide named', gapAfter + ' vs ' + marked);
  const alsoCarried = await page.evaluate((g) => DGE.source.split('\n')
    .filter((l) => !/^text tl\b/.test(l.trim()) && l.includes(' gap ' + g)).length, marked);
  ok(alsoCarried > 0,
    'and it really is a number some other line in the block carries', String(alsoCarried));
  ok(!(await ed.problems()).includes('line '), 'the block parses', await ed.problems());

  // A relation is not swapped out on a guess. An element written `right of a`
  // already says what holds it, and changing which *kind* of placement it has
  // is a control in the placement pane (§9.3), not a gesture – so no `between`
  // is ever proposed for one, however close the drop lands to a joining line.
  ok(await pick('t2') === 'text t2', 'a relation-placed element is selected', await ed.selection());
  seen = await dragCells('t2', -0.2, -0.6);
  const kept = await ed.lineWith('text t2');
  note('kept   : ' + kept);
  // A drag may still re-dock it – that is the direction word following the
  // gesture (§9.3), and it keeps the relation. What it must never do is
  // replace the relation with a `between` nobody asked for.
  ok(!/between/.test(kept || '') && /\b(right of|left of|below|above)\b/.test(kept || ''),
    'dragging one that already has a relation never proposes between', kept);

  await leave();

  // ── the fixture: three collinear elements, and two beside them ──
  const fix = buildFixture();
  ok(fix.status === 0, 'the fixture deck builds', fix.out);
  if (fix.status !== 0) return;
  const { server, port } = await serve(fix.dir);

  try {
    await page.goto(`http://127.0.0.1:${port}/audience.html`, { waitUntil: 'load' });
    await page.evaluate(() => { try { localStorage.clear(); } catch (e) { /* private window */ } });
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(600);
    ok(await ed.open('fix'), 'the editor is open on the fixture');
    await ed.beat(0);

    // ── the line joining two elements ──
    // The proposal is `between a,b`, and along it a `frac`. Only for an element
    // that has no relation to lose: `at x,y` says nothing about what holds it,
    // so proposing one costs nothing. `mid` sits on the a–b axis already, and
    // the drag keeps it there, which is what leaves `between` the best answer.
    ok(await pick('mid') === 'box mid', 'the middle box is selected', await ed.selection());
    const betweenBefore = await ed.lineWith('box mid');
    ok(/ at 0,1\.2 /.test(betweenBefore || ''), 'and starts on two bare numbers', betweenBefore);

    seen = await dragCells('mid', 0, 0.4);
    note('labels : ' + JSON.stringify(seen.labels));
    note('status : ' + seen.note);
    ok(seen.n >= 1, 'the joining line and the point on it are drawn', String(seen.n));
    ok(seen.labels.some((t) => /^between \w+,\w+( frac [\d.]+)?$/.test(t)),
      'labelled with the statement it would write', JSON.stringify(seen.labels));
    ok(/^between \w+,\w+/.test(seen.note), 'which the status bar says too', seen.note);
    const betweenAfter = await ed.lineWith('box mid');
    note('after  : ' + betweenAfter);
    ok(/ between [a-z]\w*,[a-z]\w*( frac [\d.]+)? /.test(betweenAfter || ''),
      'and the placement becomes the relation, with a frac along it', betweenAfter);
    ok(!/ at [\d.-]/.test(betweenAfter || ''), 'the two numbers are gone', betweenAfter);
    ok(!(await ed.problems()).includes('line '), 'the block parses', await ed.problems());

    // The case that looks like a no-op and is not. `d` already stands on c's
    // centre line, so a small drag on that axis snaps it back to where it
    // started – the *number* does not move and the *text* becomes `c.cx`,
    // which is the whole trade this feature exists to make. Skipping the edit
    // because the delta came out zero left the status bar naming a line the
    // source never got. Nothing sits on the far side of `d`, so `between` has
    // no pair to offer here and `.cx` is the only answer available.
    ok(await pick('d') === 'box d', 'a box already standing on a line is selected',
      await ed.selection());
    const coincidence = await ed.lineWith('box d');
    ok(/ at 3,5\.6 /.test(coincidence || ''), 'and it is written as two bare numbers', coincidence);
    seen = await dragCells('d', 0.06, 0);
    note('labels : ' + JSON.stringify(seen.labels));
    ok(seen.labels.some((t) => /^\w+\.cx$/.test(t)),
      'the line it was already on lights up', JSON.stringify(seen.labels));
    const written = await ed.lineWith('box d');
    note('written: ' + written);
    ok(/ at [a-z]\w*\.cx,5\.6 /.test(written || ''),
      'and the coincidence is written down as the relation it was all along', written);
  } finally {
    server.close();
  }

}
