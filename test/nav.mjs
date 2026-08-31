/*
 * Navigation: two key families that mean the same thing on every slide, a
 * third reached with Shift, and the one mark that says where forward goes
 * next. PRD §4.6 and §5.
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

  // ── the sideways arrows mean one thing ──
  // They used to mean "next column" on the head of a column and "next slide"
  // everywhere else, which is the exception Shift replaced. The first slide of
  // the deck IS a column head, so it is where the old meaning would still show
  // if anything of it survived.
  let s = await at();
  ok(s.colIdx === 0, 'the deck opens in its first column', JSON.stringify(s));
  await press('ArrowRight', 600);
  s = await at();
  ok(s.colIdx === 0 || shape[0].length === 1,
    'Right off a column head moves a slide, not a column', JSON.stringify(s));
  ok(s.id === shape[0][1] || shape[0].length === 1,
    'and the slide it moves to is the next one in reading order', JSON.stringify(s));
  await press('ArrowLeft', 600);
  ok((await at()).id === shape[0][0], 'and Left comes back to it', (await at()).id);

  // ── Shift is the column key, from anywhere ──
  await restart();
  await press('Shift+ArrowRight', 600);
  s = await at();
  ok(s.colIdx === 1 && s.id === shape[1][0],
    'Shift-Right off a column head lands on the head of the next column', JSON.stringify(s));

  // The half that the old model could not do at all: leave a column from
  // inside it. Two plain forwards first, so the test is standing somewhere a
  // column key used to be unavailable.
  await press('ArrowDown', 300); await press('ArrowDown', 300);
  const inside = await at();
  ok(inside.colIdx === 1, 'two forwards keep us inside that column', JSON.stringify(inside));
  await press('Shift+ArrowRight', 600);
  s = await at();
  ok(s.colIdx === 2 && s.id === shape[2][0],
    'Shift-Right from the middle of a column reaches the next one too', JSON.stringify(s));

  // Shift-Left rewinds to the head of the column it is in before leaving it,
  // so getting back to the top of a part is the same key as leaving it.
  await press('ArrowDown', 300);
  await press('Shift+ArrowLeft', 600);
  s = await at();
  ok(s.colIdx === 2 && s.id === shape[2][0],
    'Shift-Left from inside a column rewinds to its head first', JSON.stringify(s));
  await press('Shift+ArrowLeft', 600);
  ok((await at()).colIdx === 1, 'and the next press leaves for the column before it',
    JSON.stringify(await at()));

  // Both column keys stand still at the ends, the rule the chunk keys follow.
  // nextCol used to fall back to the last chunk of the whole lecture, which
  // the old key map kept out of reach with a guard and Shift does not.
  const lastCol = shape.length - 1;
  await restart();
  for (let i = 0; i < 40 && (await at()).colIdx < lastCol; i++) await press('Shift+ArrowRight', 160);
  const head = await at();
  ok(head.colIdx === lastCol && head.id === shape[lastCol][0],
    'Shift-Right walks column by column to the last one', JSON.stringify(head));
  await press('Shift+ArrowRight', 500);
  ok((await at()).id === head.id,
    'and stands still there rather than jumping to the end of the deck',
    JSON.stringify(await at()));
  await restart();
  await press('Shift+ArrowLeft', 500);
  ok((await at()).colIdx === 0, 'Shift-Left stands still on the first column too',
    JSON.stringify(await at()));

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
  ok(await beatOf('cbc') === 1, 'Left does the same - it is plain back on every slide now', String(await beatOf('cbc')));
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
  ok(await page.evaluate(() => document.querySelectorAll('#nav-hints span').length) === 1,
    'one mark, not three - the two sideways ones went with the exception they announced');
  await press('o', 500);
  ok(await hintOpacity() === '0', 'the marks are gone on the overview board');
  await press('Escape', 500);
  await press('b', 400);
  ok(await hintOpacity() === '0', 'and behind a blanked projection');
  await press('b', 400);
}
