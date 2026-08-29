/*
 * Navigation: two key families, one column exception, and the marks that say
 * which of the two situations a slide is in. PRD §4.6 and §5.
 *
 * The reason this is a spec and not a paragraph in the PRD is that the model
 * has three moving parts that can only disagree at run time - the key map,
 * revealed[chunkId], and the geometry the diagram runtime paints - and a
 * regression in any of them is invisible until somebody is standing in front
 * of a room.
 */
export const name = 'navigation';
export const lecture = 'diagrams';
export const view = 'audience';

export async function run({ page, report, at, press, walkTo, beatOf, restart }) {
  const { ok, note } = report;

  const shape = await page.evaluate(() => [...document.querySelectorAll('.column')].map(c =>
    [...c.querySelectorAll('.chunk')].map(k => k.dataset.chunkId || '(section)')));
  note('columns: ' + JSON.stringify(shape.map(c => c.length)));

  // ── the column exception ──
  // The down mark is `colLast && nothing left to reveal`, so whether the first
  // slide carries one is a fact about this deck, not about the key model: it
  // does iff column 0 holds nothing after it. Read it off `shape` – a spec
  // that writes the answer in pins the lecture's shape, and a second chunk in
  // column 0 of `lectures/diagrams` is what broke the version that did.
  let s = await at();
  const firstD = shape[0].length === 1 ? 'D' : '-';
  ok(s.hints === '-R' + firstD,
    'the first slide of the deck offers a right mark and no left one', s.hints);

  await press('ArrowRight', 600);
  s = await at();
  ok(s.colIdx === 1, 'sideways from the first chunk of a column changes column', JSON.stringify(s));
  ok(s.hints[0] === 'L', 'and the slide it lands on offers the way back', s.hints);

  await press('ArrowLeft', 600);
  ok((await at()).colIdx === 0, 'and back again');

  // A mark that is absent has to mean the key is absent too. On the head of
  // the last column there is no column to the right, so the mark is off - and
  // the key must be plain forward. It used to call nextCol anyway, whose
  // fallback clamps to the end of the deck: one press skipped six slides, and
  // on a single-column lecture it skipped the whole lecture.
  const lastColHead = shape.length - 1;
  await restart();
  for (let i = 0; i < 60; i++) {
    const t = await at();
    if (t.colIdx === lastColHead && t.hints[0] === 'L') break;
    await press('ArrowRight', 200);
  }
  const head = await at();
  ok(head.colIdx === lastColHead && head.hints[1] === '-',
    'on the head of the last column there is no right mark', JSON.stringify(head));
  await press('ArrowRight', 500);
  const afterRight = await at();
  ok(afterRight.colIdx === lastColHead && afterRight.id === shape[lastColHead][1],
    'and the right arrow is plain forward there, not a jump to the end of the deck',
    JSON.stringify(afterRight) + ' expected ' + shape[lastColHead][1]);

  await restart();

  // ── forward is one key for the whole lecture ──
  const seen = [];
  let crossed = false;
  for (let i = 0; i < 14; i++) {
    await press(' ');
    const t = await at();
    seen.push('c' + t.colIdx + ':' + t.id + '[' + t.hints + ']');
    if (t.colIdx === 2) { crossed = true; break; }
  }
  note(seen.join(' → '));
  ok(crossed, 'Space crosses a column boundary on its own', seen.join(' '));

  const lastBefore = seen.filter((x, i) => seen[i + 1] && seen[i + 1].startsWith('c2:')).pop();
  ok(!!lastBefore && lastBefore.includes('D'),
    'the last chunk of a column carries the down mark once it is fully revealed', lastBefore);
  // One down mark per column end the walk passed, and none anywhere else. The
  // number of ends is the number of distinct columns the walk touched, minus
  // the one it is standing in when it stops.
  const colsCrossed = new Set(seen.map(x => x.split(':')[0])).size - 1;
  ok(seen.filter(x => x.includes('D')).length === colsCrossed,
    'and the chunks that carry it are exactly the column ends the walk passed',
    seen.filter(x => x.includes('D')).join(' ') + ' for ' + colsCrossed + ' column end(s)');

  // ── the point of the whole change: run a figure twice ──
  await restart();
  ok(await walkTo('cbc'), 'one forward key reaches a slide four columns in', (await at()).id);

  ok(await beatOf('cbc') === 0, 'the figure starts at its opening beat', String(await beatOf('cbc')));
  await press(' '); await press(' '); await press(' ');
  ok(await beatOf('cbc') === 3, 'three Spaces build it', String(await beatOf('cbc')));

  await press('ArrowUp');
  ok(await beatOf('cbc') === 2, 'Up takes one beat back', String(await beatOf('cbc')));
  ok((await at()).id === 'cbc', 'without leaving the slide');
  await press('ArrowLeft');
  ok(await beatOf('cbc') === 1, 'Left does the same, off the first chunk of a column', String(await beatOf('cbc')));
  await press('Backspace');
  ok(await beatOf('cbc') === 0, 'Backspace too', String(await beatOf('cbc')));

  await press('ArrowUp');
  ok((await at()).id !== 'cbc', 'at the opening beat, back leaves the slide', (await at()).id);
  await press('PageDown');
  ok((await at()).id === 'cbc', 'a presenter remote brings it back', (await at()).id);
  await press(' '); await press(' ');
  ok(await beatOf('cbc') === 2, 'and it builds again - explaining it twice is the point',
    String(await beatOf('cbc')));

  // ── the half of PRD §4.6 that survives ──
  await press('ArrowUp'); await press('ArrowUp'); await press('ArrowUp');
  const arrived = await page.evaluate(() => {
    const el = document.querySelector('.chunk.active');
    const segs = [...el.querySelectorAll('.reveal-segment')];
    return { id: el.dataset.chunkId, hidden: segs.filter(x => x.hasAttribute('data-hidden')).length };
  });
  ok(arrived.hidden === 0, 'a slide arrived at from elsewhere still comes up fully revealed',
    JSON.stringify(arrived));

  // ── the marks are for the slide, so they are absent everywhere else ──
  const hintOpacity = () => page.evaluate(() =>
    getComputedStyle(document.querySelector('#nav-hints span')).opacity);
  await press('o', 500);
  ok(await hintOpacity() === '0', 'the marks are gone on the overview board');
  await press('Escape', 500);
  await press('b', 400);
  ok(await hintOpacity() === '0', 'and behind a blanked projection');
  await press('b', 400);
}
