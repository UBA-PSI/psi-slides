/*
 * Waypoints, and the one property that matters about them: a drag on a
 * waypoint that holds a reference rewrites its signed nudge and never the
 * reference. editor.md §2.4 lists this as one of three constructs a graphical
 * editor has to round-trip, and it is the whole value of the format - an
 * editor that answered the drag with two numbers would turn a diagram that
 * re-routes itself into one that does not.
 *
 * #feed0 in the CBC figure is the right subject because both of its
 * components are references: `via iv.cx,d0.bottom+0.28` is "the horizontal
 * centre of the IV box, 0.28 below the bottom of the decrypt box".
 */
export const name = 'editor · waypoints';
export const lecture = 'diagrams';
export const view = 'audience';

export async function run({ page, errors, report, press, walkTo, ed }) {
  const { ok, note } = report;

  await walkTo('cbc');
  for (let i = 0; i < 3; i++) await press(' ');
  ok(await ed.open('cbc'), 'the editor is open');
  ok(await ed.clickPath('#dge-art-svg [id$="feed0--p"]', 0.5) && await ed.selection() === 'edge feed0',
    'feed0 selected', await ed.selection());

  const before = await ed.lineWith('#feed0');
  note('before : ' + before);

  // Counted off the line rather than written out, so redrawing the figure
  // does not make the spec wrong about the editor.
  const viaWords = (l) => ((l || '').match(/ via ([^{]*)/) || [null, ''])[1].trim().split(/\s+/).filter(Boolean);
  const held = viaWords(before).filter(w => /[A-Za-z_][\w-]*\.[a-z]+/.test(w));
  const want = viaWords(before).length;
  note(want + ' waypoint(s), ' + held.length + ' of them holding a reference');

  const nVia = () => page.locator('#dge-guides .dge-h-via').count();
  ok(await nVia() === want, 'a handle on every waypoint', String(await nVia()));
  ok(await page.locator('#dge-guides .dge-h-via.dge-h-held').count() === held.length,
    'and the ones holding a reference are marked as such');
  ok(await page.locator('#dge-guides .dge-h-add').count() === want + 1,
    'a hollow add-dot on every segment',
    String(await page.locator('#dge-guides .dge-h-add').count()));
  const headings = await page.evaluate(() =>
    [...document.querySelectorAll('#dge-side h3')].map(h => h.textContent));
  ok(headings.includes('waypoints'), 'the panel lists them', JSON.stringify(headings));

  // ── the load-bearing assertion ──
  await ed.drag(await ed.centreOf('#dge-guides .dge-h-via'), 70, 45);
  const moved = await ed.lineWith('#feed0');
  note('moved  : ' + moved);
  ok(moved !== before, 'the drag wrote something', moved);
  // The references are the assertion. Every name.prop the waypoint held has
  // to still be there, and none of them may have become a bare number.
  const refName = (w) => (w.match(/[A-Za-z_][\w-]*\.[a-z]+/g) || []);
  const kept = refName(viaWords(before).join(' '));
  const now = refName(viaWords(moved).join(' '));
  ok(kept.length > 0 && kept.every(r => now.includes(r)),
    'every reference the waypoints held is still there',
    JSON.stringify(kept) + ' -> ' + JSON.stringify(now));
  ok(/[A-Za-z_][\w-]*\.[a-z]+[+-][\d.]+/.test(moved || ''),
    'and the drag landed in a signed nudge rather than replacing one', moved);

  // ── inserting, and what must survive it ──
  const addDot = await page.evaluate(() => {
    const d = [...document.querySelectorAll('#dge-guides .dge-h-add')]
      .find(n => n.dataset.handle === 'add-0').getBoundingClientRect();
    return { x: d.x + d.width / 2, y: d.y + d.height / 2 };
  });
  // Ctrl held, because this section is about the *insert*. Inserting hands
  // the gesture straight to the move, and a move that lands on a neighbour's
  // line now names it (editor-drag-guides covers that) – which would be a
  // true fact about a different gesture standing in the way of this one.
  await page.keyboard.down('Control');
  await ed.drag(addDot, -60, -40, 10);
  await page.keyboard.up('Control');
  const added = await ed.lineWith('#feed0');
  note('added  : ' + added);
  const wordsAdded = viaWords(added);
  ok(wordsAdded.length === want + 1, 'one more waypoint than before',
    JSON.stringify(wordsAdded));
  ok(/^-?[\d.]+,-?[\d.]+$/.test(wordsAdded[0] || ''),
    'the new one lands first, as a plain coordinate', JSON.stringify(wordsAdded[0]));
  ok(wordsAdded.slice(1).join(' ') === viaWords(moved).join(' '),
    'and every waypoint that was already there is re-emitted verbatim',
    JSON.stringify(wordsAdded.slice(1)) + ' vs ' + JSON.stringify(viaWords(moved)));
  ok(await nVia() === want + 1, 'with a handle each', String(await nVia()));

  // ── removing, on the canvas ──
  // The double-click has to be recognised from position and time. The first
  // click ends a zero-length drag whose gestureEnd repaints the guide layer,
  // so the second lands on a different node carrying the same id: a dblclick
  // listener fires on their common ancestor instead, and the browser resets
  // pointerdown's own click counter. Both looked like working controls and
  // neither ever fired - which is how this shipped with no way at all to take
  // a waypoint off the canvas.
  const firstVia = await ed.centreOf('#dge-guides .dge-h-via');
  await page.mouse.dblclick(firstVia.x, firstVia.y);
  await page.waitForTimeout(450);
  ok(await nVia() === want, 'a double-click on a waypoint takes it out again',
    String(await nVia()) + ' handles, line: ' + (await ed.lineWith('#feed0')));
  ok(await ed.lineWith('#feed0') === moved,
    'and the line is back to what it was before the insert', await ed.lineWith('#feed0'));

  // ── and removing, from the panel ──
  const removeFirstChip = () => page.evaluate(() => {
    const chips = [...document.querySelectorAll('#dge-side .dge-chip-via')];
    if (chips[0]) chips[0].click();
  });
  const wholeBefore = (await ed.source()).split('\n');
  for (let i = 0; i < 8 && (await ed.lineWith('#feed0') || '').includes(' via '); i++) {
    await removeFirstChip();
    await page.waitForTimeout(350);
  }
  const bare = await ed.lineWith('#feed0');
  note('bare   : ' + bare);
  ok(!!bare && !bare.includes('via'), 'removing the last one takes the clause with it', bare);

  // The removal used to tidy the *whole block* with a regex over every line,
  // which re-indented every step body, collapsed column-aligned declarations
  // and ate the double spaces inside quoted labels. This text goes straight
  // back into the author's source.md over the watch socket, so the assertion
  // is the strict one: exactly one line may differ.
  const wholeAfter = (await ed.source()).split('\n');
  const differing = wholeBefore
    .map((l, i) => (l === wholeAfter[i] ? null : i))
    .filter(i => i !== null);
  ok(wholeBefore.length === wholeAfter.length && differing.length === 1
     && wholeBefore[differing[0]].includes('#feed0'),
    'and every other line of the block is untouched, byte for byte',
    JSON.stringify(differing.map(i => [wholeBefore[i], wholeAfter[i]])));
  // The via span starts at the keyword, so the drop path in dgeApplyEdits has
  // no keyword in front of it to eat. This file is the author's; a line with
  // a double space in it is a defect.
  ok(!!bare && !/ {2}/.test(bare), 'and leaves no double space behind', JSON.stringify(bare));

  ok(!(await ed.problems()).includes('line '), 'the block still compiles', await ed.problems());

  // ── a grip is a control, so it is the same size whatever the zoom ──
  //
  // The handles were constants in diagram units, which means they grew and
  // shrank with the zoom: at 4x a waypoint square covered a quarter of the
  // figure, and on a wide diagram at its fit zoom it was a speck. Measured in
  // screen pixels now, the way dgeDockAt has always sized its chips.
  const gripPx = () => page.evaluate(() => {
    const n = document.querySelector('#dge-guides .dge-h-end');
    if (!n) return null;
    const r = n.getBoundingClientRect();
    return Math.round(r.width * 10) / 10;
  });
  const gripUnits = () => page.evaluate(() => {
    const n = document.querySelector('#dge-guides .dge-h-end');
    return n ? Math.round(Number(n.getAttribute('r')) * 100) / 100 : null;
  });
  await ed.clickPath('#dge-art-svg [id$="feed0--p"]', 0.5);
  const px1 = await gripPx();
  const u1 = await gripUnits();
  await page.evaluate(() => dgeZoomBy(2));
  await page.waitForTimeout(300);
  const px2 = await gripPx();
  const u2 = await gripUnits();
  note(`endpoint grip: ${px1}px / ${u1}u at 1x, ${px2}px / ${u2}u at 2x`);
  ok(px1 !== null && Math.abs(px1 - px2) < 1.5,
    'an endpoint grip is the same size on screen at either zoom', `${px1} vs ${px2}`);
  ok(u1 !== null && u2 !== null && u2 < u1 * 0.75,
    'which means it is a different number of diagram units', `${u1} vs ${u2}`);

  // And the rule that follows from it: a grip sits centred on the edge it
  // resizes, so on anything only a few grips across it covers the whole
  // element and every pointerdown lands on a handle. Such an element could be
  // resized and never moved; below that size it has no handles and the panel's
  // own `r` or `w` field is the way.
  await page.evaluate(() => { DGE.zoom = 1; dgeApplyView(); dgeDrawGuides(); });
  await page.waitForTimeout(250);
  const smallest = await page.evaluate(() => {
    let best = null;
    for (const [id, b] of DGE.boxes) {
      const el = dgeFind(id);
      if (!el || !['box', 'dot', 'text', 'image'].includes(el.kind)) continue;
      if (!best || b.w * b.h < best.area) best = { id, area: b.w * b.h };
    }
    return best && best.id;
  });
  const handlesOn = (id) => page.evaluate((i) => {
    dgeSelect([i]);
    return document.querySelectorAll('#dge-guides [data-id="' + i + '"]').length;
  }, smallest);
  await page.waitForTimeout(250);
  const zoomedIn = await page.evaluate(async (i) => {
    DGE.zoom = 4; dgeApplyView(); dgeSelect([i]);
    return document.querySelectorAll('#dge-guides [data-id="' + i + '"]').length;
  }, smallest);
  const zoomedOut = await page.evaluate((i) => {
    DGE.zoom = 0.4; dgeApplyView(); dgeSelect([i]);
    return document.querySelectorAll('#dge-guides [data-id="' + i + '"]').length;
  }, smallest);
  note(`${smallest}: ${zoomedIn} handle(s) at 4x, ${zoomedOut} at 0.4x`);
  ok(zoomedIn === 3, 'the smallest element has its three grips when there is room',
    String(zoomedIn));
  ok(zoomedOut === 0, 'and none when they would cover it', String(zoomedOut));
  await page.evaluate(() => { DGE.zoom = 1; dgeApplyView(); dgeDrawGuides(); });

  ok(errors.length === 0, 'no page errors', errors.join(' | '));
}
