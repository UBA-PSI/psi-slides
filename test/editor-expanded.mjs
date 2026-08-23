/*
 * What a `bars`, `grid` or `plot` expands into is not editable on its own.
 *
 * These three statements each stand for many elements: a twelve-column chart
 * is a frame, twelve boxes, twelve labels and a baseline, and none of the
 * twenty-five carries a line of source. They do carry the *statement's* span,
 * which is the trap: hand that span out under a column's name and the panel
 * rewrites the whole chart while the author thinks they are nudging one bar.
 *
 * So they are absent from the span table, absent from the element list, and a
 * click on one selects the statement instead - which is what the gesture
 * means anyway, because the frame is the statement and moving it moves the
 * chart.
 *
 * Worth a browser spec rather than a unit test for the usual reason: the
 * failure is not an exception, it is a control that looks like it works. A
 * drag on a bar would have produced no error and no change at all.
 */
export const name = 'editor · what a statement expands into';
export const lecture = 'diagrams';
export const view = 'audience';

export async function run({ page, errors, report, walkTo, ed }) {
  const { ok, note } = report;

  await walkTo('expand');
  ok(await ed.open('expand'), 'the editor is open on #expand');
  await ed.beat(0);

  // The chunk holds `bars f …` and `grid g dot 8x6 …`: two statements, and
  // between them twelve columns, twelve ticks, a baseline and forty-eight
  // cells. Read the row count off the panel, not the model.
  const rows = await page.evaluate(() =>
    [...document.querySelectorAll('#dge-side .dge-list button .dge-nm')].map(r => r.textContent));
  note(rows.length + ' rows: ' + rows.join(' '));
  ok(rows.includes('f') && rows.includes('g'),
    'both statements have a row', rows.join(' '));
  const expanded = rows.filter(id => /^(f|g)-/.test(id));
  ok(expanded.length === 0,
    'and nothing they expanded into does', expanded.join(' ') || '(none)');

  // Clicking a column has to land on the statement. The third bar is a real
  // element with a real box on the canvas, so this is a genuine hit, not a
  // miss that happens to fall through to the frame.
  const bar = await ed.centreOf('#dge-art-svg [id$="f-2--r"]');
  ok(!!bar, 'the third column is on the canvas', JSON.stringify(bar));
  await page.mouse.click(bar.x, bar.y);
  await page.waitForTimeout(320);
  ok(await ed.selection() === 'box f', 'clicking a column selects the statement',
    await ed.selection());

  // And the statement is editable in the ordinary way: its own line, its own
  // span, one class swapped.
  const lineOf = async () => (await ed.source()).split('\n').find(l => l.startsWith('bars f'));
  const before = await lineOf();
  await page.evaluate(() => {
    const slot = [...document.querySelectorAll('#dge-side .dge-slot')]
      .find(x => x.querySelector('b').textContent === 'fill');
    const b = slot && [...slot.querySelectorAll('.dge-sw')].find(x => x.title === '.tone-1');
    if (b) b.click();
  });
  await page.waitForTimeout(400);
  const after = await lineOf();
  ok(after !== before && /\.tone-1/.test(after || ''),
    'and a swatch rewrites that one line', JSON.stringify(after));
  ok(!(await ed.problems()).includes('line '), 'the block still parses', await ed.problems());
}
