/*
 * Which element a thing is measured from, and on which side.
 *
 * A relation is the whole point of this grammar – `below b gap 0.8` means the
 * dot follows the Mix box wherever it goes – but until now a drag could only
 * say *how far*. The gap was clamped at zero, so dragging the dot up past b's
 * bottom edge stopped dead: to put it above, or beside, or halfway between two
 * other elements, you had to edit the text. That is the one thing this editor
 * exists to spare people.
 *
 * Two answers, because the two halves want different gestures. Which *side* is
 * a drag: push the element through the reference and the direction word
 * follows, with the edge itself as the hysteresis so no nudge can flip it.
 * Which *element*, and which kind of relation, is a control: nothing about
 * dragging one box says "halfway between those two".
 */
export const name = 'editor · placement';
export const lecture = 'diagrams';
export const view = 'audience';

export async function run({ page, report, walkTo, ed }) {
  const { ok, note } = report;

  await walkTo('primitives');
  ok(await ed.open('primitives'), 'the editor is open on #primitives');
  await ed.beat(0);

  const pick = async (label) => {
    await page.evaluate((t) => {
      const row = [...document.querySelectorAll('#dge-side .dge-list button')].find(b => b.textContent.includes(t));
      if (row) row.click();
    }, label);
    await page.waitForTimeout(320);
  };
  const dotLine = () => ed.lineWith('dot  x');
  const pressed = (slot) => page.evaluate((sl) => {
    const s = [...document.querySelectorAll('#dge-side .dge-slot')].find(x => x.querySelector('b').textContent === sl);
    return s ? ([...s.querySelectorAll('.dge-sw')].find(b => b.getAttribute('aria-pressed') === 'true') || {}).textContent : null;
  }, slot);
  const clickChip = async (slot, text) => {
    await page.evaluate(([sl, t]) => {
      const s = [...document.querySelectorAll('#dge-side .dge-slot')].find(x => x.querySelector('b').textContent === sl);
      const b = s && [...s.querySelectorAll('.dge-sw')].find(x => x.textContent === t);
      if (b) b.click();
    }, [slot, text]);
    await page.waitForTimeout(420);
  };
  const setField = async (label, value) => {
    await page.evaluate(([l, v]) => {
      const f = [...document.querySelectorAll('#dge-side .dge-num')].find(n => n.querySelector('span').textContent === l);
      const i = f && f.querySelector('input');
      if (i) { i.value = v; i.dispatchEvent(new Event('change', { bubbles: true })); }
    }, [label, value]);
    await page.waitForTimeout(420);
  };

  await pick('"+"');
  ok(await ed.selection() === 'dot x', 'the dot is selected', await ed.selection());
  note('starts as: ' + (await dotLine()));

  // ── the pane says what the relation is ──
  ok(await pressed('kind') === 'beside', 'the pane reads the placement kind off the source',
    String(await pressed('kind')));
  ok(await pressed('side') === 'below', 'and which side it is docked to', String(await pressed('side')));

  // ── change the side from the pane ──
  await clickChip('side', 'right of');
  ok(/right of b\b/.test(await dotLine() || ''), 'a side chip re-docks it', await dotLine());
  ok(!(await ed.problems()).includes('line '), 'and the block parses', await ed.problems());

  // ── change what it is measured from ──
  await setField('of', 'a');
  const reDocked = await dotLine();
  note('re-docked : ' + reDocked);
  ok(/right of a\b/.test(reDocked || ''), 'the reference field docks it to another element', reDocked);
  ok(!(await ed.problems()).includes('line '), 'and the block still parses', await ed.problems());

  // ── a reference that does not exist is refused, not written ──
  await setField('of', 'nosuchthing');
  ok(await dotLine() === reDocked, 'a reference that names nothing is refused', await dotLine());
  const note1 = await page.evaluate(() => (document.querySelector('#dge-statusnote') || {}).textContent || '');
  ok(/not applied/.test(note1), 'and the status says so', JSON.stringify(note1));

  // ── halfway between two, which no drag can express ──
  await clickChip('kind', 'between two');
  const between = await dotLine();
  note('between   : ' + between);
  ok(/\bbetween \w+,\w+/.test(between || ''), 'the pane can say "halfway between two"', between);
  ok(!(await ed.problems()).includes('line '), 'and that parses too', await ed.problems());

  // ── and back to a relation, so the drag can be tested ──
  await clickChip('kind', 'beside');
  ok(/right of|left of|above|below/.test(await dotLine() || ''), 'and back again', await dotLine());
  await setField('of', 'b');
  await clickChip('side', 'below');
  const beforeDrag = await dotLine();
  note('before drag: ' + beforeDrag);
  ok(/below b\b/.test(beforeDrag || ''), 'set up below b for the drag', beforeDrag);

  // ── the drag: push it through the reference and the side follows ──
  const dot = await ed.centreOf('#dge-art-svg [id$="-x"]');
  await page.mouse.click(dot.x, dot.y);
  await page.waitForTimeout(300);
  await ed.drag(dot, 0, -260, 18);
  const dragged = await dotLine();
  note('after drag : ' + dragged);
  ok(/\babove b\b/.test(dragged || ''),
    'dragging it up through b re-docks it above, instead of stopping at gap 0', dragged);
  ok(!/gap -/.test(dragged || ''), 'and never writes a negative gap', dragged);
  ok(!(await ed.problems()).includes('line '), 'the block parses after the drag', await ed.problems());

  // ── a coordinate in a plot's own units ──
  //
  // `roc@0.35` is the one construct the model does not keep: the compiler
  // resolves it to an ordinary `roc.left + n` in grid cells before layout runs,
  // so nothing downstream learns that plots exist. A drag therefore planned a
  // nudge, found no nudge token in `roc@0.74` to rewrite, dropped the edit –
  // and the status bar reported the move it had not made. Silent, and reported
  // as a success, which is the worst pair.
  await page.evaluate(() => dgeClose());
  await page.waitForTimeout(400);
  await walkTo('plot');
  ok(await ed.open('plot'), 'the editor is open on #plot');

  // The waypoints first, at the beat where the curve is up: same reading, and
  // the same bug, one construct along.
  const goodLine = () => ed.lineWith('edge good ');
  const viaBefore = await goodLine();
  const plotWaypoints = (l) => ((l || '').match(/@[\d.]+/g) || []);
  note('curve : ' + viaBefore);
  ok(plotWaypoints(viaBefore).length >= 4,
    'the curve is written in the plot\u2019s own units', String(plotWaypoints(viaBefore).length));
  await page.evaluate(() => {
    const row = [...document.querySelectorAll('#dge-side .dge-list button .dge-nm')]
      .find((b) => b.textContent === 'good');
    if (row) row.closest('button').click();
  });
  await page.waitForTimeout(320);
  const grip = await ed.centreOf('#dge-guides [data-id="good"][data-handle="via-1"]');
  ok(!!grip, 'a waypoint on the curve has a handle', JSON.stringify(grip));
  await ed.drag(grip, 40, -30);
  const viaAfter = await goodLine();
  note('dragged: ' + viaAfter);
  ok(viaAfter !== viaBefore, 'dragging it writes something', viaAfter);
  ok(!/roc\.(left|bottom|top|right)/.test(viaAfter || ''),
    'and never trades the plot units for a resolved nudge', viaAfter);
  ok(plotWaypoints(viaAfter).length === plotWaypoints(viaBefore).length,
    'every waypoint is still a value in the plot', viaAfter);
  ok(!(await ed.problems()).includes('line '), 'the block parses', await ed.problems());

  // And the placement, at beat 0 where a drag rewrites it rather than writing
  // a move op.
  await ed.beat(0);
  await page.evaluate(() => {
    const row = [...document.querySelectorAll('#dge-side .dge-list button .dge-nm')]
      .find((b) => b.textContent === 'nchance');
    if (row) row.closest('button').click();
  });
  await page.waitForTimeout(320);
  ok(await ed.selection() === 'text nchance', 'the label on the diagonal is selected',
    await ed.selection());
  const chance = () => ed.lineWith('nchance');
  const atBefore = await chance();
  note('at     : ' + atBefore);
  const spot = await ed.centreOf('#dge-art-svg [id$="-nchance"]');
  await ed.drag(spot, 45, -35);
  const atAfter = await chance();
  note('dragged: ' + atAfter);
  ok(atAfter !== atBefore, 'dragging it moves the coordinate', atAfter);
  ok(/at roc@[\d.-]+,roc@[\d.-]+/.test(atAfter || ''),
    'and both halves stay values in the plot', atAfter);
  const note2 = await page.evaluate(() => (document.querySelector('#dge-statusnote') || {}).textContent || '');
  ok(!/Nothing in the source changed/.test(note2),
    'the status does not have to say nothing happened', JSON.stringify(note2));

  // The coordinate as a field, which is how anyone types one of these in the
  // first place. Every other placement kind had a control and `at` had none.
  const atField = () => page.evaluate(() => {
    const f = [...document.querySelectorAll('#dge-side .dge-num')]
      .find((n) => n.querySelector('span').textContent === 'at');
    return f ? f.querySelector('input').value : null;
  });
  ok((await atField()) !== null, 'the pane offers the coordinate as a field', String(await atField()));
  await page.evaluate(() => {
    const f = [...document.querySelectorAll('#dge-side .dge-num')]
      .find((n) => n.querySelector('span').textContent === 'at');
    const i = f.querySelector('input');
    i.value = 'roc@0.5,roc@0.5';
    i.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(420);
  ok(/at roc@0.5,roc@0.5/.test((await chance()) || ''), 'and typing one writes it', await chance());
  ok(!(await ed.problems()).includes('line '), 'the block still parses', await ed.problems());

  // ── emptying a positional token keeps its slot ──
  //
  // A plot's two axis titles are told apart by which comes first, so taking the
  // first one out promotes the second into its place: the y title silently
  // became the x title, on a figure that went on compiling.
  await page.evaluate(() => {
    const row = [...document.querySelectorAll('#dge-side .dge-list button .dge-nm')]
      .find((b) => b.textContent === 'roc');
    if (row) row.closest('button').click();
  });
  await page.waitForTimeout(320);
  const plotLine = () => ed.lineWith('plot roc');
  const titlesOf = (l) => ((l || '').match(/"[^"]*"/g) || []);
  const titlesBefore = titlesOf(await plotLine());
  note('titles : ' + titlesBefore.join(' '));
  await page.evaluate(() => {
    const f = [...document.querySelectorAll('#dge-side .dge-num')]
      .find((n) => n.querySelector('span').textContent === 'x axis');
    const i = f && f.querySelector('input');
    if (i) { i.value = ''; i.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  await page.waitForTimeout(420);
  const titlesAfter = titlesOf(await plotLine());
  note('cleared: ' + titlesAfter.join(' '));
  ok(titlesAfter.length === titlesBefore.length && titlesAfter[0] === '""',
    'clearing the x title empties it rather than removing the token', titlesAfter.join(' '));
  ok(titlesAfter[1] === titlesBefore[1],
    'so the y title is still the y title', titlesAfter.join(' '));
  ok(!(await ed.problems()).includes('line '), 'and the plot still compiles', await ed.problems());
}
