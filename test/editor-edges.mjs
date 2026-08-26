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
  let line = await ed.lineWith('edge feed0 ');
  ok(/"erste Zeile\\nzweite Zeile"/.test(line || ''),
    'a newline typed in the field lands as \\n in the source', line);
  ok(!(await page.locator('#dge-undo-btn').isDisabled()), 'undo enables once something changed');

  // ── retargeting an end answers with a name, not with coordinates ──
  const before = await ed.lineWith('edge feed0 ');
  note('before: ' + before);
  const handle = await page.evaluate(() => {
    const h = [...document.querySelectorAll('#dge-guides .dge-h-end')]
      .find(n => n.dataset.handle === 'from').getBoundingClientRect();
    const t = document.querySelector('#dge-art-svg [id$="c2--r"]').getBoundingClientRect();
    return { from: { x: h.x + h.width / 2, y: h.y + h.height / 2 },
             to: { x: t.x + t.width / 2, y: t.y + t.height / 2 } };
  });
  await ed.drag(handle.from, handle.to.x - handle.from.x, handle.to.y - handle.from.y);
  const after = await ed.lineWith('edge feed0 ');
  note('after : ' + after);
  ok(/^edge feed0 c2 -> x0/.test((after || '').trim()),
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
  ok(await ed.lineWith('edge feed0 ') === before, 'the undo button restores the previous source',
    await ed.lineWith('edge feed0 '));
  ok(!(await page.locator('#dge-redo-btn').isDisabled()), 'redo enables after an undo');
  await page.click('#dge-redo-btn');
  await page.waitForTimeout(400);
  ok(await ed.lineWith('edge feed0 ') === after, 'and redo puts it back');

  await page.evaluate(() =>
    [...document.querySelectorAll('#dge-side button')].find(b => b.textContent.includes('Swap ends')).click());
  await page.waitForTimeout(400);
  ok(/^edge feed0 x0 -> c2/.test((await ed.lineWith('edge feed0 ') || '').trim()),
    'Swap ends exchanges the two names', await ed.lineWith('edge feed0 '));

  // An empty endpoint is not "no endpoint". dgeWriteAttr's drop path would
  // take the token out and leave "edge  -> b", which does not parse - and
  // unlike a keyed option there is no keyword in front of it to eat, so the
  // panel has to refuse rather than write.
  const intact = await ed.lineWith('edge feed0 ');
  await page.evaluate(() => {
    const input = [...document.querySelectorAll('#dge-side .dge-num')]
      .find(n => n.querySelector('span').textContent === 'from').querySelector('input');
    input.value = '   ';
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(400);
  ok(await ed.lineWith('edge feed0 ') === intact,
    'clearing an endpoint field is refused rather than written', await ed.lineWith('edge feed0 '));

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

  // ── which side of the line the label sits on ──
  //
  // It is the `side` option now, not the four alignment classes. Those place a
  // label inside a box's own padding and are two independent channels there;
  // on an edge they named one thing – which side of the routed line the label
  // sits on – so the same four words meant two geometries chosen by kind, and
  // `{.top .left}` on an edge was writable although an edge has one side to
  // pick. The panel carried the scar: it offered `.left` / `.right` on every
  // edge and `.top` / `.bottom` on none, so on a horizontal arrow both rows
  // were wrong at once.
  //
  // Only the pair lying *across* the routed line can pick a side; the other
  // pair runs along it, moves nothing, and comes back as a build warning. So
  // the row offers that pair and `default`, and nothing else.
  //
  // #swimlane is the subject because it carries both orientations – the two
  // elbows read vertical where their label would sit, the handover between
  // them reads horizontal – and the expectation is derived from the drawing
  // rather than written out, so redrawing the figure cannot make the spec
  // wrong about the editor.
  await page.evaluate(() => dgeClose());
  await page.waitForTimeout(400);
  await walkTo('swimlane');
  ok(await ed.open('swimlane'), 'the editor is open on #swimlane');
  await ed.beat(0);

  const rowOf = (slot) => page.evaluate((sl) => {
    const s = [...document.querySelectorAll('#dge-side .dge-slot')]
      .find((x) => x.querySelector('b') && x.querySelector('b').textContent === sl);
    return s ? [...s.querySelectorAll('.dge-sw')].map((b) => b.textContent) : null;
  }, slot);
  const runsVertical = (id) => page.evaluate((i) => {
    const pts = dgeEdgePts(i);
    if (!pts) return null;
    const { dir } = window.PSI_DG.dgPolyPoint(pts, 0.5);
    return Math.abs(dir[1]) > Math.abs(dir[0]);
  }, id);

  const edgeIds = await page.evaluate(() => DGE.model.edges.filter(e => !e.lead).map(e => e.id));
  let bothWays = 0;
  for (const id of edgeIds) {
    await page.evaluate((i) => dgeSelect([i]), id);
    await page.waitForTimeout(220);
    const vertical = await runsVertical(id);
    const sides = await rowOf('side');
    note(id + (vertical ? ' vertical' : ' horizontal')
      + ' · side ' + (sides ? sides.join(',') : '(absent)'));
    if (vertical === null) continue;
    bothWays += vertical ? 1 : 2;
    ok(!!sides && sides.length === 3,
      id + ': the row offers default and the pair that can act',
      sides ? sides.join(',') : '(absent)');
    const want = vertical ? ['default', 'left', 'right'] : ['default', 'top', 'bottom'];
    ok(!!sides && want.every((w) => sides.includes(w)),
      id + ': and it is the pair lying across the line', JSON.stringify(sides));
  }
  ok(bothWays >= 3, 'the figure exercised both orientations', String(bothWays));

  // The two alignment rows are gone from an edge altogether. They were never a
  // choice the compiler would honour twice, and one of the pairs it did honour
  // meant something else entirely on the box in the row above.
  await page.evaluate((i) => dgeSelect([i]), edgeIds[0]);
  await page.waitForTimeout(220);
  ok((await rowOf('label across')) === null && (await rowOf('label down')) === null,
    'and the alignment rows are not offered on an edge at all',
    JSON.stringify([await rowOf('label across'), await rowOf('label down')]));

  // Writing a side and taking it off again, through the row.
  const horizontal = [];
  for (const id of edgeIds) if ((await runsVertical(id)) === false) horizontal.push(id);
  ok(horizontal.length > 0, 'the figure has a horizontal edge to write on');
  const target = horizontal[0];
  const lineOf = () => page.evaluate((i) => {
    const el = dgeFind(i);
    return el ? DGE.source.slice(el.span[0], el.span[1]) : null;
  }, target);
  const clickSideSw = (text) => page.evaluate((t) => {
    const s = [...document.querySelectorAll('#dge-side .dge-slot')]
      .find((x) => x.querySelector('b') && x.querySelector('b').textContent === 'side');
    const b = s && [...s.querySelectorAll('.dge-sw')].find((x) => x.textContent === t);
    if (b) b.click();
  }, text);

  await page.evaluate((i) => dgeSelect([i]), target);
  await page.waitForTimeout(250);
  await clickSideSw('bottom');
  await page.waitForTimeout(420);
  note('wrote  : ' + (await lineOf()));
  ok(/\bside bottom\b/.test((await lineOf()) || ''),
    'clicking a side writes the keyword and the word', await lineOf());
  ok(!(await ed.problems()).includes('line '), 'and the block parses', await ed.problems());

  await page.evaluate((i) => dgeSelect([i]), target);
  await page.waitForTimeout(250);
  await clickSideSw('default');
  await page.waitForTimeout(420);
  note('cleared: ' + (await lineOf()));
  ok(!/\bside\b/.test((await lineOf()) || ''), 'and default takes it back off', await lineOf());
  ok(!/ {2}/.test((await lineOf()) || ''), 'leaving no double space behind',
    JSON.stringify(await lineOf()));

  // The control: the pair the row hides is the pair the compiler warns about,
  // and a word that cannot act is still removable – `default` is in the row
  // whatever else is, so nothing has to be shown that could only warn.
  const warning = await page.evaluate((i) => {
    const el = dgeFind(i);
    const src = DGE.source;
    const line = src.slice(el.span[0], el.span[1]);
    dgeSetSource(src.slice(0, el.span[0]) + line + ' side left' + src.slice(el.span[1]));
    return (DGE.warnings || []).slice();
  }, target);
  ok(warning.some((w) => /runs along/.test(w)),
    'and writing the hidden word by hand is exactly the warning the row hides',
    JSON.stringify(warning));
  await page.evaluate((i) => dgeSelect([i]), target);
  await page.waitForTimeout(250);
  await clickSideSw('default');
  await page.waitForTimeout(420);
  ok(!/\bside\b/.test((await lineOf()) || ''),
    'and the row takes off a word it would never have offered', await lineOf());
  ok(!(await page.evaluate(() => (DGE.warnings || []).join(' '))).includes('runs along'),
    'with the warning gone with it');

  await page.keyboard.press('Control+z');
  await page.waitForTimeout(300);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(300);

  ok(!(await ed.problems()).includes('line '), 'the block compiles at the end', await ed.problems());
  ok(errors.length === 0, 'no page errors', errors.join(' | '));
}
