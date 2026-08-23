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

  const nVia = () => page.locator('#dge-guides .dge-h-via').count();
  ok(await nVia() === 1, 'one waypoint handle', String(await nVia()));
  ok(await page.locator('#dge-guides .dge-h-via.dge-h-held').count() === 1,
    'marked as holding a reference');
  ok(await page.locator('#dge-guides .dge-h-add').count() === 2,
    'a hollow add-dot on each of the two segments',
    String(await page.locator('#dge-guides .dge-h-add').count()));
  const headings = await page.evaluate(() =>
    [...document.querySelectorAll('#dge-side h3')].map(h => h.textContent));
  ok(headings.includes('waypoints'), 'the panel lists them', JSON.stringify(headings));

  // ── the load-bearing assertion ──
  await ed.drag(await ed.centreOf('#dge-guides .dge-h-via'), 70, 45);
  const moved = await ed.lineWith('#feed0');
  note('moved  : ' + moved);
  ok(/via iv\.cx[+-][\d.]+,d0\.bottom[+-][\d.]+/.test(moved || ''),
    'a drag rewrites both nudges and keeps iv.cx and d0.bottom', moved);
  ok(!/via [\d.]+,[\d.]+/.test(moved || ''),
    'it did not collapse the reference into a pair of numbers', moved);

  // ── inserting, and what must survive it ──
  const addDot = await page.evaluate(() => {
    const d = [...document.querySelectorAll('#dge-guides .dge-h-add')]
      .find(n => n.dataset.handle === 'add-0').getBoundingClientRect();
    return { x: d.x + d.width / 2, y: d.y + d.height / 2 };
  });
  await ed.drag(addDot, -60, -40, 10);
  const added = await ed.lineWith('#feed0');
  note('added  : ' + added);
  ok(/via [-\d.]+,[-\d.]+ iv\.cx/.test(added || ''),
    'the new waypoint lands first and the reference one is re-emitted verbatim', added);
  ok(await nVia() === 2, 'two waypoint handles now', String(await nVia()));

  // ── and removing ──
  const removeFirstChip = () => page.evaluate(() => {
    const chips = [...document.querySelectorAll('#dge-side .dge-chip')].filter(c => c.textContent.includes(','));
    if (chips[0]) chips[0].click();
  });
  await removeFirstChip();
  await page.waitForTimeout(400);
  ok(await ed.lineWith('#feed0') === moved,
    'removing it restores the line exactly', await ed.lineWith('#feed0'));

  const wholeBefore = (await ed.source()).split('\n');
  await removeFirstChip();
  await page.waitForTimeout(400);
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
  ok(errors.length === 0, 'no page errors', errors.join(' | '));
}
