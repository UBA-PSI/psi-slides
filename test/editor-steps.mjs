/*
 * Beats: what one does, and writing one.
 *
 * Two things the panel could not say. It could stand on a beat and it could
 * write a `move` into one by dragging, but there was no way to add a step, no
 * way to add any other op, and — the one that cost the most — no way to see
 * which elements a beat is about without pressing Space and watching.
 *
 * That last one is not a reading of the source. `show @xor` is one line and
 * three elements; an edge appears because both its ends did; a container
 * appears because its members did. So the panel diffs the resolved state
 * either side of the beat, and this spec asserts on exactly that gap: more
 * elements listed than there are lines written.
 */
export const name = 'editor · what a beat does, and writing one';
export const lecture = 'diagrams';
export const view = 'audience';

const chips = (page, after) => page.evaluate((a) => {
  const h = [...document.querySelectorAll('#dge-side .dge-hint')]
    .find((x) => x.textContent === a);
  const row = h ? h.nextElementSibling : null;
  return row ? [...row.querySelectorAll('.dge-chip')].map((c) => c.textContent.replace('×', '').trim()) : [];
}, after);

const does = (page) => page.evaluate(() => {
  const h = [...document.querySelectorAll('#dge-side h3')].find((x) => x.textContent === 'this step');
  if (!h) return null;
  // name row, then the effects row
  const row = h.nextElementSibling && h.nextElementSibling.nextElementSibling;
  return row ? [...row.querySelectorAll('.dge-chip')].map((c) => c.textContent.trim()) : [];
});

export async function run({ page, errors, report, walkTo, ed }) {
  const { ok, note } = report;

  await walkTo('cbc');
  ok(await ed.open('cbc'), 'the editor is open on #cbc');
  // This spec writes, and an edit is applied to the page and saved, so the
  // block would reach every later spec changed. Put it back at the end.
  const original = await page.evaluate(() => DGE.source);

  // Beat 2 of #cbc is `show @xor` plus `emph feed0, feed1, feed2`: two lines.
  await ed.beat(2);
  const effects = await does(page);
  note('beat 2 does: ' + (effects || []).join(' · '));
  ok(effects && effects.length === 6,
    'the beat lists every element it changes, not every line it was written with',
    JSON.stringify(effects));
  ok(effects.some((t) => /appears/.test(t)) && effects.some((t) => /emphasised/.test(t)),
    'and says what happens to each', JSON.stringify(effects));

  const written = await chips(page, 'written here:');
  ok(written.length === 2, 'while the source shows its two lines', JSON.stringify(written));

  // Adding an op to the beat you are standing on.
  await page.evaluate(() => {
    const row = [...document.querySelectorAll('#dge-side .dge-list button .dge-nm')]
      .find((x) => x.textContent === 'm0');
    if (row) row.closest('button').click();
  });
  await page.waitForTimeout(350);
  ok(await ed.selection() === 'box m0', 'an element is selected', await ed.selection());
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('#dge-side .dge-chip')].find((x) => x.textContent === 'emph');
    if (b) b.click();
  });
  await page.waitForTimeout(500);
  const src = await ed.source();
  ok(/\n\s*emph m0\b/.test(src), 'clicking an act writes it into that step',
    (src.split('\n').find((l) => /emph m0/.test(l)) || '(not found)'));
  ok(!(await ed.problems()).includes('line '), 'the block still parses', await ed.problems());

  const grew = await does(page);
  ok(grew.length === 7, 'and the beat now changes one more element', String(grew.length));

  // And off again, from the list of what is written.
  await page.evaluate(() => {
    const h = [...document.querySelectorAll('#dge-side .dge-hint')]
      .find((x) => x.textContent === 'written here:');
    const row = h && h.nextElementSibling;
    const b = row && [...row.querySelectorAll('.dge-chip')].find((c) => c.textContent.includes('emph m0'));
    if (b) b.click();
  });
  await page.waitForTimeout(500);
  ok(!/\n\s*emph m0\b/.test(await ed.source()), 'and removing it takes the line back out',
    (await ed.source()).split('\n').filter((l) => /emph/.test(l)).join(' | '));

  // A whole new beat.
  const before = (await ed.source()).match(/^\s*step\b/gm).length;
  await page.evaluate(() => {
    const b = document.querySelector('#dge-beats .dge-beat-add');
    if (b) b.click();
  });
  await page.waitForTimeout(600);
  const after = (await ed.source()).match(/^\s*step\b/gm).length;
  ok(after === before + 1, 'the add button writes a step', before + ' -> ' + after);
  ok(!(await ed.problems()).includes('line '), 'and the block still parses', await ed.problems());

  await page.evaluate((s) => dgeSetSource(s), original);
  await page.waitForTimeout(400);
  const restored = await page.evaluate(() => DGE.source);
  ok(restored === original, 'and the block is put back the way it was',
    JSON.stringify(restored.slice(-60)) + ' vs ' + JSON.stringify(original.slice(-60)));

  ok(errors.length === 0, 'no page errors', errors.join(' | '));
}
