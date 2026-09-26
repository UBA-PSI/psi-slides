/*
 * The guide layer as a property of *dragging*, not of one gesture.
 *
 * `editor-guides.mjs` covers the four neighbour guides on a move at beat 0,
 * which is where they started. The complaint this file exists for is that a
 * user learns "dragging here helps me write relations" and then finds it
 * silently stops holding – when they resize, when they drag a waypoint, when
 * they are on beat 3 rather than beat 0. **Inconsistent help is worse than no
 * help**, because the model the user built stops being trustworthy and they go
 * back to typing.
 *
 * So every drag that can produce a relation offers one, and each gesture has
 * exactly one relation-shaped answer in the grammar:
 *
 *   move, beat 0        at A.p,B.q / between / a sibling's gap / spread
 *   move, beat k        the same four, written as `move x to <relation>`
 *   resize, edge handle the number a sibling already carries
 *   resize, corner      `same as X`, when both dimensions land together
 *   waypoint            `via A.p,B.q` – a bare component becomes a reference
 *   endpoint            a name, or – inside a plot – the plot's own units
 *
 * As in `editor-guides.mjs`, the thing asserted is never where something
 * landed. It is **what got written down**, plus the two places the editor
 * promised it: the mark on the canvas and the sentence in the status bar. A
 * drag that produced the right picture from the wrong statement is the failure
 * this whole feature exists to close, and on a screenshot it looks perfect.
 *
 * Drags are given in cells and converted through the canvas CTM, because the
 * source is written in cells and the editor's zoom is fitted to the frame.
 */
export const name = 'editor · a guide on every drag';
export const lecture = 'diagrams';
export const view = 'audience';

export async function run({ page, report, walkTo, ed }) {
  const { ok, note } = report;

  const marks = () => page.locator('#dge-guides .dge-nb').count();
  const labels = () => page.evaluate(() =>
    [...document.querySelectorAll('#dge-guides .dge-nb-label')].map((t) => t.textContent));
  const statusNote = () => page.evaluate(() =>
    (document.querySelector('#dge-statusnote') || {}).textContent || '');
  const statusLine = () => page.evaluate(() =>
    (document.querySelector('#dge-statusline') || {}).textContent || '');
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
  // A resize grip or a waypoint square, by the element it belongs to. They are
  // drawn into the guide layer, so they exist only while something is
  // selected – and they are left off an element too small to carry them,
  // which is why every caller checks.
  const handleAt = (id, h) => page.evaluate(([i, hh]) => {
    const el = document.querySelector(`#dge-guides [data-handle="${hh}"][data-id="${i}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, [id, h]);
  // Drag from a screen point by a number of cells, and report what the canvas
  // and the status bar said while the button was still down: the panel is not
  // re-rendered during a gesture, so the preview is read where the editor
  // puts it.
  const dragCells = async (from, dx, dy, mods = {}) => {
    const u = await cellPx();
    if (mods.ctrl) await page.keyboard.down('Control');
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + dx * u.x, from.y + dy * u.y, { steps: 16 });
    await page.waitForTimeout(220);
    const seen = { n: await marks(), labels: await labels(),
      note: await statusNote(), line: await statusLine() };
    await page.mouse.up();
    await page.waitForTimeout(400);
    if (mods.ctrl) await page.keyboard.up('Control');
    return seen;
  };
  const dragOn = async (id, dx, dy, mods) =>
    dragCells(await ed.centreOf(`#dge-art-svg [id$="-${id}"]`), dx, dy, mods);
  const undo = async () => { await page.evaluate(() => dgeUndo()); await page.waitForTimeout(400); };
  const stepLines = async (needle) =>
    (await ed.source()).split('\n').map((l) => l.trim()).filter((l) => l.startsWith(needle));
  const leave = async () => {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(280);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(450);
  };

  let seen;

  // The sections run in the order the figures sit in the lecture: forward is
  // the only direction walkTo goes.

  // ── a spread is the one row a beat cannot offer ──
  // Every other guide has a step form – `move x to <relation>` takes any
  // placement the grammar has. `spread` is a lecture-wide statement with none,
  // so writing one at a beat would change the opening picture from inside a
  // gesture whose whole promise is that it does not. #unsafety is the figure
  // editor-guides uses for the spread at beat 0, so it is the one that shows
  // the difference.
  await walkTo('unsafety');
  ok(await ed.open('unsafety'), 'the editor is open on #unsafety');
  const beatsHere = await page.evaluate(() =>
    document.querySelectorAll('#dge-beats .dge-beat').length);
  ok(beatsHere > 1, 'and the figure has beats to stand on', String(beatsHere));
  await ed.beat(beatsHere - 1);
  ok(await pick('df') === 'box df', 'a box in the middle of a run is selected', await ed.selection());
  seen = await dragCells(await ed.centreOf('#dge-art-svg [id$="-df"]'), -0.3, 0.5);
  note('status : ' + seen.note);
  ok(!(await ed.lineWith('spread ')),
    'no spread statement is appended at a beat', await ed.lineWith('spread '));
  ok(/^move df by /.test(seen.line.trim()),
    'the drag stays the displacement it always was', seen.line);
  await leave();

  // ── move at a beat: the same guides, a different token ──
  // #mac's "Security goals" note is the case editor-guides is written for at
  // beat 0 – a free label at 3.55,-1.05, held by nothing. The point here is
  // that the *same element* under the *same drag* offers the *same relation*
  // at beat 2, and the only thing that changes is where it is written.
  await walkTo('mac');
  ok(await ed.open('mac'), 'the editor is open on #mac');
  const beats = await page.evaluate(() =>
    document.querySelectorAll('#dge-beats .dge-beat').length);

  await ed.beat(0);
  ok(await pick('goals') === 'text goals', 'the free label is selected', await ed.selection());
  seen = await dragOn('goals', -0.3, -0.2);
  const atBeat0 = seen.labels.slice().sort();
  note('beat 0 : ' + JSON.stringify(atBeat0) + '  ·  ' + seen.note);
  ok(atBeat0.length === 2, 'at beat 0 the drag lights up two lines', JSON.stringify(atBeat0));
  // That the drag writes a ref coordinate rather than a number is
  // `editor-guides.mjs`, on this element and this drag, and said more
  // strictly there – it separates the x words from the y words and asserts
  // that no bare number survived. This spec is about what the *beat* does to
  // the same gesture, which is what the undo and the last-beat drag below
  // measure.
  await undo();
  const back = await ed.lineWith('text goals');
  ok(/at 3\.55,-1\.05/.test(back || ''), 'undo puts the two bare numbers back', back);

  await ed.beat(beats - 1);
  ok(await pick('goals') === 'text goals', 'the same label is selected at the last beat',
    await ed.selection());
  seen = await dragOn('goals', -0.3, -0.2);
  note('beat k : ' + JSON.stringify(seen.labels.slice().sort()) + '  ·  ' + seen.note);
  ok(JSON.stringify(seen.labels.slice().sort()) === JSON.stringify(atBeat0),
    'the same two lines light up, on the same drag', JSON.stringify(seen.labels));
  ok(/^move goals to [a-z]\w*\.\w+,[a-z]\w*\.\w+$/.test(seen.line.trim()),
    'and the status bar names `move … to <relation>` before the button comes up', seen.line);
  ok(seen.labels.every((t) => seen.note.includes(t)) && /opening picture is untouched/.test(seen.note),
    'saying both what it writes and where it goes', seen.note);
  let step = await stepLines('move goals');
  note('written: ' + step.join(' | '));
  ok(step.length === 1 && /^move goals to [a-z]\w*\.\w+,[a-z]\w*\.\w+$/.test(step[0]),
    'the step gains one op, and it carries the relation', JSON.stringify(step));
  ok(/at 3\.55,-1\.05/.test(await ed.lineWith('text goals') || ''),
    'while the opening picture really is untouched', await ed.lineWith('text goals'));

  // Unsnapped is a different statement about intent, and it stays available.
  await undo();
  seen = await dragOn('goals', -0.3, -0.2, { ctrl: true });
  ok(seen.n === 0, 'Ctrl suspends them at a beat too', String(seen.n));
  step = await stepLines('move goals');
  note('ctrl   : ' + step.join(' | '));
  ok(step.length === 1 && /^move goals by /.test(step[0]),
    'and the drag goes back to being a displacement', JSON.stringify(step));
  await undo();

  // ── the gap guide, in a step ──
  // tagA sits `below macA gap 0.14`; macA and ver1 both sit `gap 0.3`. The
  // relation the guide proposes is the whole placement, flush word included –
  // `move … to` sets a placement, so anything left off it is a thing the step
  // would silently reset.
  ok(await pick('tagA') === 'text tagA', 'the tag caption is selected', await ed.selection());
  seen = await dragOn('tagA', 0, 0.17);
  note('gap    : ' + JSON.stringify(seen.labels) + '  ·  ' + seen.note);
  ok(seen.labels.some((t) => t === 'gap 0.3'),
    'the sibling gap is marked on the sibling that has it', JSON.stringify(seen.labels));
  ok(/the same gap \w+ has/.test(seen.note), 'and the status bar says whose', seen.note);
  step = await stepLines('move tagA');
  note('written: ' + step.join(' | '));
  ok(step.length === 1 && /^move tagA to below macA gap 0\.3\b/.test(step[0]),
    'and the step carries the relation, not a displacement', JSON.stringify(step));
  ok(!(await ed.problems()).includes('line '), 'the block parses', await ed.problems());
  await undo();

  // ── an axis a set owns is not the step's to place ──
  // `align y middle macA, ver1` overrides the placement *after* it resolves
  // and *before* the shift, so a `move … to` on that axis would promise a
  // position the layout then takes away. The ordinary `move … by` lands after
  // the override and still works, which is why the candidate is dropped rather
  // than the drag refused.
  ok(await pick('ver1') === 'text ver1', 'a follower of an align set is selected',
    await ed.selection());
  seen = await dragOn('ver1', 0, 0.4);
  note('held   : ' + JSON.stringify(seen.labels) + '  ·  ' + seen.note);
  ok(seen.n === 0, 'no guide is offered on the axis the set owns', String(seen.n));
  step = await stepLines('move ver1');
  ok(step.length === 1 && /^move ver1 by 0,/.test(step[0]),
    'and the drag goes through as a displacement, which still works there',
    JSON.stringify(step));
  await undo();

  // ── a waypoint, which is the same coordinate grammar ──
  // #wire is routed through two bare pairs. A component that lands on a line
  // the grammar can name becomes that name; the one beside it is untouched.
  await ed.beat(0);
  await page.evaluate(() => dgeSelect(['wire']));
  await page.waitForTimeout(340);
  const wire0 = await ed.lineWith('edge wire ');
  note('before : ' + wire0);
  ok(/ via [\d.]+,[\d.]+ [\d.]+,[\d.]+\s*$/.test(wire0 || ''),
    'both waypoints are bare numbers to begin with', wire0);
  const via0 = await handleAt('wire', 'via-0');
  ok(!!via0, 'the first waypoint has a handle');
  seen = await dragCells(via0, 0.54, 0);
  note('labels : ' + JSON.stringify(seen.labels) + '  ·  ' + seen.note);
  ok(seen.labels.some((t) => /^\w+\.(cx|left|right)$/.test(t)),
    'the line it landed on is drawn and named', JSON.stringify(seen.labels));
  ok(seen.labels.every((t) => seen.note.includes(t)),
    'and the status bar says the same sentence', seen.note);
  const wire1 = await ed.lineWith('edge wire ');
  note('after  : ' + wire1);
  ok(/ via [a-z]\w*\.(cx|left|right),1\.5 /.test(wire1 || ''),
    'the waypoint carries the reference, and only the x half of it', wire1);
  ok(/ [\d.]+,1\.5\s*$/.test(wire1 || ''),
    'the second waypoint is re-emitted untouched', wire1);

  // And the reference survives the next drag, or the guide would be a
  // one-shot: §9.3 rewrites the nudge, never the reference.
  const via0b = await handleAt('wire', 'via-0');
  seen = await dragCells(via0b, 0.3, 0);
  const wire2 = await ed.lineWith('edge wire ');
  note('nudged : ' + wire2);
  ok(/ via [a-z]\w*\.(cx|left|right)[+-][\d.]+,1\.5 /.test(wire2 || ''),
    'a further drag moves the nudge and keeps the reference', wire2);
  ok(!(await ed.problems()).includes('line '), 'the block parses', await ed.problems());
  await leave();

  // ── the two resize handles, which propose two different kinds of thing ──
  // s4 is `w 0.4 h 0.42`; s1 is `w 0.66 h 0.42`. The same 0.26-cell drag
  // therefore reaches s1's size on either handle – and the two answer
  // differently on purpose. An edge handle writes a **number**, because
  // `same as` copies both dimensions and a width-only drag must not change the
  // height. A corner writes the **relation**, because there it is one.
  await walkTo('outlines');
  ok(await ed.open('outlines'), 'the editor is open on #outlines');
  await ed.beat(0);
  // The outline row is drawn small enough that the fit-to-frame zoom puts the
  // diamond below the size at which grips are drawn at all. That suppression is deliberate – a grip on something a
  // few pixels across *is* the element, and a small dot could then only be
  // resized, never moved – and zooming in is what the code comment says brings
  // them back. The drags below are given in cells and converted through the
  // canvas CTM, so nothing else about this section changes.
  await page.evaluate(() => dgeZoomBy(1.7));
  await page.waitForTimeout(300);
  ok(await pick('s4') === 'box s4', 'the diamond is selected', await ed.selection());
  const s4Before = await ed.lineWith('box  s4');
  ok(/ w 0\.4 h 0\.42 /.test(s4Before || ''), 'and starts at 0.4 by 0.42', s4Before);

  const east = await handleAt('s4', 'e');
  ok(!!east, 'it has an east grip');
  seen = await dragCells(east, 0.26, 0);
  note('edge   : ' + JSON.stringify(seen.labels) + '  ·  ' + seen.note);
  ok(seen.labels.some((t) => t === 'w 0.66'),
    'the sibling width is marked on the sibling that carries it', JSON.stringify(seen.labels));
  ok(/the same width \w+ is given/.test(seen.note), 'and the status bar says whose', seen.note);
  const s4Wide = await ed.lineWith('box  s4');
  note('after  : ' + s4Wide);
  ok(/ w 0\.66 h 0\.42 /.test(s4Wide || ''),
    'the width lands on the sibling’s number exactly, and the height is left alone', s4Wide);
  ok(!/same as/.test(s4Wide || ''),
    'an edge handle never proposes `same as` – it would change the other dimension too', s4Wide);

  await undo();
  ok(/ w 0\.4 h 0\.42 /.test(await ed.lineWith('box  s4') || ''), 'undo puts the two numbers back');
  ok(await pick('s4') === 'box s4', 'the diamond is selected again', await ed.selection());
  const corner = await handleAt('s4', 'se');
  ok(!!corner, 'it has a corner grip');
  seen = await dragCells(corner, 0.26, 0);
  note('corner : ' + JSON.stringify(seen.labels) + '  ·  ' + seen.note);
  ok(seen.labels.some((t) => /^same as \w+$/.test(t)),
    'the corner proposes the relation, marked on the element it would copy',
    JSON.stringify(seen.labels));
  ok(/goes on matching/.test(seen.note),
    'and the status bar says what the relation is worth', seen.note);
  const s4Same = await ed.lineWith('box  s4');
  note('after  : ' + s4Same);
  ok(/ same as [a-z]\w* /.test(s4Same || ''), 'the line gains the relation', s4Same);
  ok(!/ w [\d.]/.test(s4Same || '') && !/ h [\d.]/.test(s4Same || ''),
    'and the two numbers come off, because `same as` is what sizes it now', s4Same);
  ok(!(await ed.problems()).includes('line '), 'the block parses', await ed.problems());
  await leave();

  // ── an endpoint dropped on empty paper, inside a plot ──
  // The documented fallback for empty paper is a coordinate, and that is
  // right. But `roc@0.35` is a value in the plot's own units, and answering
  // the drag in grid cells changed the units under the author without saying
  // so – legal, silent, and exactly the shape of defect this editor keeps
  // closing.
  await walkTo('plot');
  ok(await ed.open('plot'), 'the editor is open on #plot');
  await ed.beat(0);
  await page.evaluate(() => dgeSelect(['chance']));
  await page.waitForTimeout(340);
  const chance0 = await ed.lineWith('edge chance ');
  note('before : ' + chance0);
  ok(/(->|<-|<->|--) roc@[\d.]+,roc@[\d.]+/.test(chance0 || ''),
    'the diagonal ends on a value in the plot’s own units', chance0);
  // Genuinely empty paper: a point the hit test answers nothing for, so the
  // fallback is the branch under test rather than a drop onto the frame.
  const empty = await page.evaluate(() => {
    const b = DGE.boxes.get('roc');
    const [uw, uh] = DGE.model.unit;
    for (let k = 1; k < 14; k++) {
      const p = { x: b.x - k * 0.4 * uw, y: b.y - 0.3 * uh };
      if (dgeHitTest(p, { edges: false })) continue;
      const m = document.querySelector('#dge-art-svg').getScreenCTM();
      return { x: p.x * m.a + p.y * m.c + m.e, y: p.x * m.b + p.y * m.d + m.f };
    }
    return null;
  });
  ok(!!empty, 'there is empty paper to drop it on');
  const to = await handleAt('chance', 'to');
  ok(!!to, 'and the far end has a grip');
  await page.mouse.move(to.x, to.y);
  await page.mouse.down();
  await page.mouse.move(empty.x, empty.y, { steps: 14 });
  await page.waitForTimeout(220);
  const said = await statusLine();
  await page.mouse.up();
  await page.waitForTimeout(420);
  const chance1 = await ed.lineWith('edge chance ');
  note('status : ' + said);
  note('after  : ' + chance1);
  ok(/(->|<-|<->|--) roc@-?[\d.]+,roc@-?[\d.]+/.test(said),
    'the status bar shows the endpoint in the plot’s units before the button comes up', said);
  ok(/(->|<-|<->|--) roc@-?[\d.]+,roc@-?[\d.]+/.test(chance1 || ''),
    'and that is what the source gets – a value, not a position on the paper', chance1);
  ok(chance1 !== chance0, 'the endpoint really did move', chance1);
  ok(!(await ed.problems()).includes('line '), 'the block parses', await ed.problems());
}
