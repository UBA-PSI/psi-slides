/*
 * The diagram editor's treatment of an edge: selecting one, labelling it,
 * retargeting an end, and the two regressions that come with teaching the hit
 * test about lines. editor.md §15, "an arrow you could not point at".
 *
 * Everything here asserts on the *source text* the editor produced, never on
 * the picture. That is the contract the editor is built to: it rewrites the
 * smallest span it can and re-runs the compiler, so a drag that produced the
 * right picture from the wrong statement is a failure.
 */
export const name = 'editor · edges';
export const lecture = 'diagrams';
export const view = 'audience';

export async function run({ page, errors, report, press, walkTo, ed }) {
  const { ok, note } = report;

  await walkTo('cbc');
  for (let i = 0; i < 3; i++) await press(' ');
  ok(await ed.open('cbc'), 'the editor opens with E from a focused figure');

  // ── undo and redo are controls, not only keys (editor.md §4.2) ──
  ok(await page.locator('#dge-undo-btn').count() > 0, 'undo is in the toolbar');
  ok(await page.locator('#dge-redo-btn').count() > 0, 'redo is in the toolbar');
  ok(await page.locator('#dge-undo-btn').isDisabled(), 'undo starts disabled');

  // ── an edge can be clicked, and the click lands on the line ──
  ok(await ed.clickPath('#dge-art-svg [id$="feed0--p"]', 0.5), 'found the feed0 arrow');
  ok(await ed.selection() === 'edge feed0', 'clicking the arrow selects it', await ed.selection());
  ok(await page.locator('#dge-guides .dge-sel-path').count() > 0,
    'the selection traces the line rather than boxing it');
  ok(await page.locator('#dge-guides .dge-h-end').count() === 2,
    'it grows two endpoint handles', String(await page.locator('#dge-guides .dge-h-end').count()));

  // ── an edge has a label, and a label can hold a line break ──
  ok(await page.locator('#dge-side textarea').count() > 0, 'an edge gets a label field');
  const ends = await page.evaluate(() =>
    [...document.querySelectorAll('#dge-side .dge-num')].map(n => n.querySelector('span').textContent));
  ok(ends.includes('from') && ends.includes('to'), 'the panel offers from and to', JSON.stringify(ends));

  await page.fill('#dge-side textarea', 'erste Zeile\nzweite Zeile');
  await page.locator('#dge-side textarea').blur();
  await page.waitForTimeout(400);
  let line = await ed.lineWith('#feed0');
  ok(/"erste Zeile\\nzweite Zeile"/.test(line || ''),
    'a newline typed in the field lands as \\n in the source', line);
  ok(!(await page.locator('#dge-undo-btn').isDisabled()), 'undo enables once something changed');

  // ── retargeting an end answers with a name, not with coordinates ──
  const before = await ed.lineWith('#feed0');
  note('before: ' + before);
  const handle = await page.evaluate(() => {
    const h = [...document.querySelectorAll('#dge-guides .dge-h-end')]
      .find(n => n.dataset.handle === 'from').getBoundingClientRect();
    const t = document.querySelector('#dge-art-svg [id$="c2--r"]').getBoundingClientRect();
    return { from: { x: h.x + h.width / 2, y: h.y + h.height / 2 },
             to: { x: t.x + t.width / 2, y: t.y + t.height / 2 } };
  });
  await ed.drag(handle.from, handle.to.x - handle.from.x, handle.to.y - handle.from.y);
  const after = await ed.lineWith('#feed0');
  note('after : ' + after);
  ok(/^edge c2 -> x0/.test((after || '').trim()),
    'dragging the from-handle onto c2 rewrites the endpoint by name', after);
  // Derived from the line rather than written out: pinning a spec to a
  // lecture's exact coordinates makes it fail every time the figure is
  // redrawn, which says nothing about the editor. The property is that
  // retargeting one end leaves the route alone.
  const viaOf = (l) => ((l || '').match(/ via [^{]*/) || [''])[0].trim();
  ok(!!viaOf(before) && viaOf(after) === viaOf(before),
    'the waypoints on the line survive untouched',
    JSON.stringify(viaOf(before)) + ' -> ' + JSON.stringify(viaOf(after)));
  ok((after || '').includes('"erste Zeile\\nzweite Zeile"'), 'so does the label', after);

  // ── undo, redo, swap ──
  await page.click('#dge-undo-btn');
  await page.waitForTimeout(400);
  ok(await ed.lineWith('#feed0') === before, 'the undo button restores the previous source',
    await ed.lineWith('#feed0'));
  ok(!(await page.locator('#dge-redo-btn').isDisabled()), 'redo enables after an undo');
  await page.click('#dge-redo-btn');
  await page.waitForTimeout(400);
  ok(await ed.lineWith('#feed0') === after, 'and redo puts it back');

  await page.evaluate(() =>
    [...document.querySelectorAll('#dge-side button')].find(b => b.textContent.includes('Swap ends')).click());
  await page.waitForTimeout(400);
  ok(/^edge x0 -> c2/.test((await ed.lineWith('#feed0') || '').trim()),
    'Swap ends exchanges the two names', await ed.lineWith('#feed0'));

  // An empty endpoint is not "no endpoint". dgeWriteAttr's drop path would
  // take the token out and leave "edge  -> b", which does not parse - and
  // unlike a keyed option there is no keyword in front of it to eat, so the
  // panel has to refuse rather than write.
  const intact = await ed.lineWith('#feed0');
  await page.evaluate(() => {
    const input = [...document.querySelectorAll('#dge-side .dge-num')]
      .find(n => n.querySelector('span').textContent === 'from').querySelector('input');
    input.value = '   ';
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(400);
  ok(await ed.lineWith('#feed0') === intact,
    'clearing an endpoint field is refused rather than written', await ed.lineWith('#feed0'));

  // ── the two regressions teaching the hit test about lines could cause ──
  const box = await ed.centreOf('#dge-art-svg [id$="d1--r"]');
  await page.mouse.click(box.x, box.y);
  await page.waitForTimeout(320);
  ok(await ed.selection() === 'box d1', 'a click on a box still selects the box', await ed.selection());

  // An edge is not a legal endpoint: layoutDiagram has no box for one, so
  // `edge feed0 -> x0` parses, passes referential integrity, and draws
  // nothing at all. The edge tool must never name one.
  await press('a', 150);
  const onEdge = await ed.pointOnPath('#dge-art-svg [id$="feed1--p"]', 0.5);
  await page.mouse.move(onEdge.x, onEdge.y);
  await page.mouse.down();
  await page.mouse.move(onEdge.x - 240, onEdge.y + 120, { steps: 10 });
  const plan = await page.evaluate(() => (document.querySelector('#dge-statusline') || {}).textContent || '');
  await page.mouse.up();
  await page.waitForTimeout(400);
  ok(/^edge -?[\d.]+,-?[\d.]+ ->/.test(plan.trim()),
    'the edge tool starting on an arrow uses a coordinate, never the arrow name', plan);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(300);

  // ── the modal owns the keyboard, including every key navigation added ──
  const beneath = () => page.evaluate(() => {
    const a = document.querySelector('.chunk.active');
    const svg = document.querySelector('#cbc svg.psi-diagram');
    return {
      id: a && a.dataset.chunkId,
      beat: svg && svg.psiDiagram ? svg.psiDiagram.step : -1,
      theme: document.body.dataset.theme,
      collapse: document.body.dataset.collapse,
      blank: document.body.classList.contains('blanked'),
    };
  });
  const was = await beneath();
  for (const k of ['PageDown', 'PageUp', 'Backspace', 'Enter', 'Space',
                   'ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'b', 'a', 'c', 'f']) {
    await page.keyboard.press(k);
    await page.waitForTimeout(80);
  }
  await page.waitForTimeout(300);
  ok(JSON.stringify(was) === JSON.stringify(await beneath()),
    'no key reaches the lecture underneath while the editor is open',
    JSON.stringify(was) + ' → ' + JSON.stringify(await beneath()));
  ok(await page.locator('#dge-root').count() > 0, 'and the editor is still open');

  ok(!(await ed.problems()).includes('line '), 'the block still compiles', await ed.problems());
  ok(errors.length === 0, 'no page errors', errors.join(' | '));
}
