/*
 * Docking a dragged element onto whatever is under the pointer.
 *
 * A relation is what this grammar is for, and the two things it says are
 * *which element* and *which side*. Dragging past an edge already changes the
 * side (see editor-placement). This is the other half: four chips appear
 * around whatever the pointer is over, and releasing on one re-docks.
 *
 * Deliberately no modifier. Ctrl/Cmd suspends snapping and Alt leaves an align
 * set; a third would be a lot to hold, and Shift means axis-constrain in every
 * drawing tool. Releasing *on a chip* is the commitment, and nobody does that
 * by accident – so the spec has to check both halves: that hovering a chip
 * arms it, and that letting go anywhere else still behaves like an ordinary
 * drag.
 */
export const name = 'editor · docking';
export const lecture = 'diagrams';
export const view = 'audience';

export async function run({ page, errors, report, walkTo, ed }) {
  const { ok, note } = report;

  await walkTo('primitives');
  ok(await ed.open('primitives'), 'the editor is open on #primitives');
  await ed.beat(0);

  const dotLine = () => ed.lineWith('dot  x');
  const boxOf = (id) => ed.centreOf(`#dge-art-svg [id$="-${id}"]`);
  const chips = () => page.locator('#dge-guides .dge-dock').count();
  const armed = () => page.locator('#dge-guides .dge-dock.dge-dock-on').count();

  await page.mouse.click((await boxOf('x')).x, (await boxOf('x')).y);
  await page.waitForTimeout(320);
  ok(await ed.selection() === 'dot x', 'the dot is selected', await ed.selection());
  const before = await dotLine();
  note('before: ' + before);
  ok(/below b\b/.test(before || ''), 'and starts below b', before);

  // ── the chips appear over another element, and only then ──
  const dot = await boxOf('x');
  const target = await boxOf('c');           // the Empfänger box
  await page.mouse.move(dot.x, dot.y);
  await page.mouse.down();
  await page.mouse.move(dot.x + 40, dot.y + 10, { steps: 4 });
  await page.waitForTimeout(180);
  ok(await chips() === 0, 'no chips while the pointer is over empty paper', String(await chips()));

  await page.mouse.move(target.x, target.y, { steps: 10 });
  await page.waitForTimeout(200);
  ok(await chips() === 4, 'four chips once the pointer is over another element', String(await chips()));
  ok(await armed() === 0, 'none of them armed while the pointer is in the middle', String(await armed()));

  // ── releasing away from a chip is an ordinary drag ──
  await page.mouse.move(dot.x + 30, dot.y + 30, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  const plain = await dotLine();
  note('plain drag: ' + plain);
  ok(/below b\b/.test(plain || ''), 'releasing away from a chip does not re-dock', plain);
  ok(await chips() === 0, 'and the chips are gone');

  // ── releasing on one docks there ──
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(350);
  const dot2 = await boxOf('x');
  const t2 = await boxOf('c');
  await page.mouse.move(dot2.x, dot2.y);
  await page.mouse.down();
  await page.mouse.move(t2.x, t2.y, { steps: 12 });
  await page.waitForTimeout(200);
  // walk out to the chip below the target
  const below = await page.evaluate(() => {
    const n = [...document.querySelectorAll('#dge-guides .dge-dock')]
      .map(el => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })
      .sort((a, b) => b.y - a.y)[0];
    return n;
  });
  await page.mouse.move(below.x, below.y, { steps: 8 });
  await page.waitForTimeout(220);
  ok(await armed() === 1, 'the chip under the pointer arms', String(await armed()));
  // The source pane is not redrawn during a gesture – re-rendering the whole
  // panel on every pointermove would cost the focus in its fields – so the
  // preview is read where the editor puts it: the status bar always carries
  // the line it is about to write, and the canvas carries the picture.
  const previewLine = await page.evaluate(() =>
    (document.querySelector('#dge-statusline') || {}).textContent || '');
  note('preview: ' + previewLine);
  ok(/below c\b/.test(previewLine),
    'the status bar already shows the line, before the button comes up', previewLine);
  const movedTo = await page.evaluate(() => {
    const d = document.querySelector('#dge-art-svg [id$="-x"]');
    const c = document.querySelector('#dge-art-svg [id$="-c"]');
    if (!d || !c) return null;
    const a = d.getBoundingClientRect(), b = c.getBoundingClientRect();
    return { below: a.top > b.bottom - 4, alignedX: Math.abs((a.x + a.width / 2) - (b.x + b.width / 2)) < 30 };
  });
  ok(movedTo && movedTo.below && movedTo.alignedX,
    'and the canvas already shows it there', JSON.stringify(movedTo));
  await page.mouse.up();
  await page.waitForTimeout(400);
  const docked = await dotLine();
  note('docked : ' + docked);
  ok(/below c\b/.test(docked || ''), 'releasing on the chip re-docks it to the other element', docked);
  ok(!/gap -/.test(docked || ''), 'with no negative gap', docked);
  ok(!(await ed.problems()).includes('line '), 'the block parses', await ed.problems());

  // ── an edge has nowhere to put a placement, so it gets no chips ──
  // Its statement has no slot for one: the release would splice
  // `left of c gap 0.4` into a line that cannot hold it, the block would stop
  // compiling and the edit would be reverted – after the chip had promised it.
  await page.evaluate(() => {
    const row = [...document.querySelectorAll('#dge-side .dge-list button')]
      .find(b => b.textContent.includes('encrypted'));
    if (row) row.click();
  });
  await page.waitForTimeout(320);
  ok(await ed.selection() === 'edge edge-1', 'an edge is selected', await ed.selection());
  const onEdge = await ed.pointOnPath('#dge-art-svg [id$="edge-1--p"]', 0.5);
  const box3 = await boxOf('c');
  await page.mouse.move(onEdge.x, onEdge.y);
  await page.mouse.down();
  await page.mouse.move(box3.x, box3.y, { steps: 10 });
  await page.waitForTimeout(220);
  ok(await chips() === 0, 'no chips while dragging an edge', String(await chips()));
  await page.mouse.up();
  await page.waitForTimeout(300);

  // ── a host that can already reach the dragged element gets no chips ──
  // Dropping a container's own member on the container is a placement cycle.
  // The compiler catches it and the edit is reverted, but the chip should not
  // have been offered: the preview lies for the whole of the drag.
  // The modal is over the deck, so the deck cannot be walked while it is up.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await walkTo('grouping');
  ok(await ed.open('grouping'), 'the editor is open on #grouping');
  await ed.beat(0);
  const member = await ed.centreOf('#dge-art-svg [id$="-r1"]');
  await page.mouse.click(member.x, member.y);
  await page.waitForTimeout(300);
  ok(await ed.selection() === 'box r1', 'a container member is selected', await ed.selection());
  const before2 = await ed.lineWith('box r1');
  await page.mouse.move(member.x, member.y);
  await page.mouse.down();
  await page.mouse.move(member.x + 6, member.y + 40, { steps: 6 });
  await page.waitForTimeout(220);
  const seen = await chips();
  await page.mouse.up();
  await page.waitForTimeout(350);
  ok(seen === 0, 'no chips over a container that holds the dragged element', String(seen));
  ok(!(await ed.problems()).includes('line '), 'and nothing broke', await ed.problems());
  note('r1 after: ' + (await ed.lineWith('box r1')));

  ok(errors.length === 0, 'no page errors', errors.join(' | '));
}
