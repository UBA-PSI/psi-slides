/*
 * Leaving a shared axis by dragging.
 *
 * An element whose y comes from `align y middle` used to answer a vertical
 * drag with a flat refusal naming the line and telling the author to go and
 * edit it by hand. The information was right and the answer was wrong: that
 * edit is precisely what the editor exists to make, and a set you cannot
 * leave by dragging is a set the canvas cannot express.
 *
 * So the axis holds - visibly, with the axis drawn and the remaining distance
 * named - until the drag is DGE_BREAK_CELL past it or Alt is held, and then
 * the element is dropped from the statement and the drag goes through. The
 * threshold is the whole design: leaving has to be something you meant, or a
 * row of boxes dissolves under an ordinary nudge.
 */
export const name = 'editor · leaving an align set';
export const lecture = 'diagrams';
export const view = 'audience';

export async function run({ page, report, press, walkTo, ed }) {
  const { ok, note } = report;

  await walkTo('cbc');
  for (let i = 0; i < 3; i++) await press(' ');
  ok(await ed.open('cbc'), 'the editor is open on #cbc');
  // Placement, not a step: above beat 0 a drag writes `move` into the step and
  // the opening picture - which is what an align set describes - is untouched.
  await ed.beat(0);

  const alignLine = async () => (await ed.source()).split('\n').find(l => l.startsWith('align y middle iv'));
  const before = await alignLine();
  note('the statement: ' + before);
  ok(/\bc0\b/.test(before || ''), 'c0 is in the align set', before);

  const box = await ed.centreOf('#dge-art-svg [id$="c0--r"]');
  await page.mouse.click(box.x, box.y);
  await page.waitForTimeout(320);
  ok(await ed.selection() === 'box c0', 'c0 is selected', await ed.selection());

  // A small pull is held. Six pixels is far under half a cell at any zoom the
  // editor opens at.
  await page.mouse.move(box.x, box.y);
  await page.mouse.down();
  await page.mouse.move(box.x, box.y + 6, { steps: 4 });
  await page.waitForTimeout(200);
  const note1 = await page.evaluate(() => (document.querySelector('#dge-statusnote') || {}).textContent || '');
  const marked = await page.evaluate(() =>
    (document.querySelector('#dge-statusnote') || {}).className || '');
  const strongGuides = await page.locator('#dge-guides .dge-rel-strong').count();
  await page.mouse.up();
  await page.waitForTimeout(350);
  note('held: ' + note1);
  ok(/held by/.test(note1), 'a small pull is held, and says so', note1);
  ok(/Alt/.test(note1), 'and names the way out', note1);
  ok(strongGuides > 0, 'the axis it is held by is drawn while the drag pushes against it',
    String(strongGuides));
  // Being held by a set is the set doing its job, not a failure, so it is not
  // painted as one. Only a genuine refusal gets the error colour.
  ok(!/dge-bad/.test(marked), 'and it is not painted as an error', marked);
  ok(await alignLine() === before, 'and the statement is untouched', await alignLine());

  // A long pull leaves the set.
  const box2 = await ed.centreOf('#dge-art-svg [id$="c0--r"]');
  await ed.drag(box2, 0, 220, 16);
  const after = await alignLine();
  note('after a long pull: ' + after);
  ok(!!after && !/\bc0\b/.test(after), 'a long pull drops c0 from the statement', after);
  ok(!!after && /\biv\b/.test(after) && /\bc1\b/.test(after) && /\bc2\b/.test(after),
    'and leaves the other three in it', after);
  ok(!(await ed.problems()).includes('line '), 'the block still compiles', await ed.problems());

  await page.keyboard.press('Control+z');
  await page.waitForTimeout(400);
  ok(await alignLine() === before, 'undo puts c0 back in the set', await alignLine());

  // Alt leaves at once, without the distance.
  const box3 = await ed.centreOf('#dge-art-svg [id$="c0--r"]');
  await page.keyboard.down('Alt');
  await page.mouse.move(box3.x, box3.y);
  await page.mouse.down();
  await page.mouse.move(box3.x, box3.y + 8, { steps: 4 });
  await page.waitForTimeout(200);
  await page.mouse.up();
  await page.keyboard.up('Alt');
  await page.waitForTimeout(400);
  const altLine = await alignLine();
  note('after Alt + a short pull: ' + altLine);
  ok(!!altLine && !/\bc0\b/.test(altLine), 'Alt drops it on a pull too short to break out', altLine);

  await page.keyboard.press('Control+z');
  await page.waitForTimeout(400);
  ok(await alignLine() === before, 'and that undoes too', await alignLine());
}
