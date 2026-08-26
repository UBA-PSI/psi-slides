/*
 * The same three drags, on the lecture the vocabulary was actually built
 * against.
 *
 * `editor-drag-guides.mjs` proves the rule on `lectures/diagrams`, where every
 * figure is a demonstration of one construct. This one runs it over
 * `lectures/network-security`, which is thirty-six real slides redrawn – full
 * of charts, grids, images and dog-legged wiring that no demonstration figure
 * has. It is a second spec rather than a loop inside the first because the
 * runner builds and serves per lecture and both are named in the export, and
 * the build is paid for already by `figure-framing-network`.
 *
 * Three figures, one row of the table each:
 *
 *   ns-b06  the two resize handles, on a rank of boxes with written widths
 *   ns-b06  a waypoint whose x is a reference and whose y is a bare number
 *   ns-b63  a move at a beat, on the densest figure in the tree
 */
export const name = 'editor · a guide on every drag · network-security';
export const lecture = 'network-security';
export const view = 'audience';

export async function run({ page, errors, report, walkTo, ed }) {
  const { ok, note } = report;

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
  const handleAt = (id, h) => page.evaluate(([i, hh]) => {
    const el = document.querySelector(`#dge-guides [data-handle="${hh}"][data-id="${i}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, [id, h]);
  const pick = async (id) => {
    const c = await ed.centreOf(`#dge-art-svg [id$="-${id}"]`);
    await page.mouse.click(c.x, c.y);
    await page.waitForTimeout(320);
    return ed.selection();
  };
  const dragCells = async (from, dx, dy) => {
    const u = await cellPx();
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + dx * u.x, from.y + dy * u.y, { steps: 16 });
    await page.waitForTimeout(220);
    const seen = { labels: await labels(), note: await statusNote(), line: await statusLine() };
    await page.mouse.up();
    await page.waitForTimeout(400);
    return seen;
  };
  const undo = async () => { await page.evaluate(() => dgeUndo()); await page.waitForTimeout(400); };
  const leave = async () => {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(280);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(450);
  };

  let seen;

  // ── ns-b06: two handles, and the wire that dodges the switch ──
  await walkTo('ns-b06');
  ok(await ed.open('ns-b06'), 'the editor is open on #ns-b06');
  await ed.beat(0);
  // A .full figure of this size fits at a zoom where the grips would cover the
  // boxes they belong to, so the editor leaves them off. Zoom in first – they
  // are measured on screen, which is exactly why zooming brings them back.
  await page.evaluate(() => dgeZoomBy(2.2));
  await page.waitForTimeout(350);

  ok(await pick('net') === 'box net', 'the Internet box is selected', await ed.selection());
  const netBefore = await ed.lineWith('box net ');
  ok(/ w 0\.8 /.test(netBefore || ''), 'and it is 0.8 wide, where the switch is 0.95', netBefore);

  const east = await handleAt('net', 'e');
  ok(!!east, 'it has an east grip at this zoom');
  seen = await dragCells(east, 0.15, 0);
  note('edge   : ' + JSON.stringify(seen.labels) + '  ·  ' + seen.note);
  ok(seen.labels.some((t) => t === 'w 0.95'),
    'the switch’s width lights up on the switch', JSON.stringify(seen.labels));
  ok(/the same width \w+ is given/.test(seen.note), 'and the status bar says whose', seen.note);
  ok(/ w 0\.95 /.test(await ed.lineWith('box net ') || ''),
    'and the number the line gets is that one exactly', await ed.lineWith('box net '));

  await undo();
  ok(await pick('net') === 'box net', 'the box is selected again', await ed.selection());
  const corner = await handleAt('net', 'se');
  ok(!!corner, 'it has a corner grip too');
  seen = await dragCells(corner, 0.15, 0);
  note('corner : ' + JSON.stringify(seen.labels) + '  ·  ' + seen.note);
  ok(seen.labels.some((t) => /^same as \w+$/.test(t)),
    'the corner proposes the relation instead', JSON.stringify(seen.labels));
  const netSame = await ed.lineWith('box net ');
  note('after  : ' + netSame);
  ok(/ same as [a-z]\w* /.test(netSame || '') && !/ w [\d.]/.test(netSame || ''),
    'and the width comes off with it', netSame);
  await undo();

  // Back to the fitted zoom for the rest: at 2.2x the far end of this figure
  // is off the canvas, and a handle whose client rect lies outside it cannot
  // be pressed – the pointer lands on the chrome instead and the gesture never
  // starts.
  await page.evaluate(() => dgeZoomFit());
  await page.waitForTimeout(350);

  // The wire from the first desktop down to the switch is routed through two
  // waypoints, each half reference and half number – the normal case in a
  // routed diagram rather than an edge case.
  const wire = await page.evaluate(() =>
    (DGE.model.edges.find((e) => (e.via || []).length && /^d1\b/.test(e.from.ref || '')) || {}).id);
  ok(!!wire, 'the desktop’s wire has waypoints', String(wire));
  await page.evaluate((i) => dgeSelect([i]), wire);
  await page.waitForTimeout(340);
  const wireBefore = await ed.lineWith('via d1.cx');
  note('before : ' + wireBefore);
  ok(/via d1\.cx,-?[\d.]+ /.test(wireBefore || ''),
    'x is a reference and y is a bare number', wireBefore);
  // Aim at the nearest line the grammar can name on the axis that is bare.
  const dy = await page.evaluate((i) => {
    const at = dgeEdgePts(i)[1];
    const uh = DGE.model.unit[1];
    let best = null;
    for (const [id, b] of DGE.boxes) {
      const el = dgeFind(id);
      if (!el || el.kind === 'edge' || (el.synth && el.synth !== el.id)) continue;
      for (const y of [b.y, b.y + b.h / 2, b.y + b.h]) {
        const d = (y - at[1]) / uh;
        if (Math.abs(d) < 0.05 || Math.abs(d) > 1) continue;
        if (!best || Math.abs(d) < Math.abs(best)) best = d;
      }
    }
    return best;
  }, wire);
  ok(dy !== null, 'there is a line within reach of the first waypoint', String(dy));
  const via0 = await handleAt(wire, 'via-0');
  ok(!!via0, 'and the waypoint has a handle');
  seen = await dragCells(via0, 0, dy);
  note('labels : ' + JSON.stringify(seen.labels) + '  ·  ' + seen.note);
  ok(seen.labels.some((t) => /^\w+\.(cy|top|bottom)$/.test(t)),
    'the line it landed on is drawn and named', JSON.stringify(seen.labels));
  const wireAfter = await ed.lineWith('via d1.cx');
  note('after  : ' + wireAfter);
  ok(/via d1\.cx,[a-z]\w*\.(cy|top|bottom) /.test(wireAfter || ''),
    'the bare half becomes a reference and the half that was one is untouched', wireAfter);
  ok(!(await ed.problems()).includes('line '), 'the block parses', await ed.problems());
  await leave();

  // ── ns-b63: a move at a beat, on 110 boxes ──
  await walkTo('ns-b63');
  ok(await ed.open('ns-b63'), 'the editor is open on #ns-b63');
  const beats = await page.evaluate(() =>
    document.querySelectorAll('#dge-beats .dge-beat').length);
  await ed.beat(beats - 1);
  ok(await pick('ask') === 'text ask', 'the handwritten question is selected', await ed.selection());
  const askBefore = await ed.lineWith('text ask ');
  ok(/below tlego gap 0\.55 flush left/.test(askBefore || ''),
    'it hangs below the legend at gap 0.55', askBefore);
  seen = await dragCells(await ed.centreOf('#dge-art-svg [id$="-ask"]'), -0.25, -0.2);
  note('labels : ' + JSON.stringify(seen.labels) + '  ·  ' + seen.note);
  ok(seen.labels.some((t) => /^gap [\d.]+$/.test(t)),
    'a sibling’s gap lights up on the sibling', JSON.stringify(seen.labels));
  ok(/opening picture is untouched/.test(seen.note),
    'and the status bar still says where the edit goes', seen.note);
  const stepOps = (await ed.source()).split('\n').map((l) => l.trim())
    .filter((l) => l.startsWith('move ask'));
  note('written: ' + stepOps.join(' | '));
  ok(stepOps.length === 1 && /^move ask to below tlego gap [\d.]+ flush left$/.test(stepOps[0]),
    'the step carries the whole relation, flush word included', JSON.stringify(stepOps));
  ok(/gap 0\.55/.test(await ed.lineWith('text ask ') || ''),
    'and the element’s own line is untouched', await ed.lineWith('text ask '));
  ok(!(await ed.problems()).includes('line '), 'the block parses', await ed.problems());

  ok(errors.length === 0, 'no page errors', errors.join(' | '));
}
