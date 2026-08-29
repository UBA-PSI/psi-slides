/*
 * Aiming an outline, and the options a statement actually takes.
 *
 * Two things the panel used to be unable to say, both of them options rather
 * than classes – which is the whole reason they were missing, since the panel
 * grew up writing classes and tags.
 *
 * `point` aims a chevron or a wedge. It is offered only where there is a
 * point to aim, because the compiler refuses it anywhere else and a control
 * that produces a refusal is not a control.
 *
 * And a `bars`, `grid` or `plot` frame is a box to the layout but not a `box`
 * line: offering `pad` there would write a word its statement rejects, and
 * `space` – which it does take – would never be offered at all. The size row
 * now reads the options off the statement.
 */
export const name = 'editor · aiming, and a statement’s own options';
export const lecture = 'diagrams';
export const view = 'audience';

const slotOpts = (page, label) => page.evaluate((l) => {
  const s = [...document.querySelectorAll('#dge-side .dge-slot')]
    .find((x) => x.querySelector('b').textContent === l);
  return s ? [...s.querySelectorAll('.dge-sw')].map((b) => b.textContent) : null;
}, label);

const clickSlot = async (page, label, text) => {
  await page.evaluate(([l, t]) => {
    const s = [...document.querySelectorAll('#dge-side .dge-slot')]
      .find((x) => x.querySelector('b').textContent === l);
    const b = s && [...s.querySelectorAll('.dge-sw')].find((x) => x.textContent === t);
    if (b) b.click();
  }, [label, text]);
  await page.waitForTimeout(420);
};

export async function run({ page, report, walkTo, ed }) {
  const { ok, note } = report;

  // #look carries one of every outline, so it is where an aimable element is.
  await walkTo('look');
  ok(await ed.open('look'), 'the editor is open on #look');
  await ed.beat(0);

  // s2 is the plain chevron: a point, and no direction written yet.
  await page.evaluate(() => {
    const row = [...document.querySelectorAll('#dge-side .dge-list button')]
      .find((b) => b.textContent.includes('chevron'));
    if (row) row.click();
  });
  await page.waitForTimeout(350);
  ok(await ed.selection() === 'box s2', 'the chevron is selected', await ed.selection());

  const aim = await slotOpts(page, 'aim');
  ok(aim && aim.length === 5, 'the panel offers a direction for it', JSON.stringify(aim));

  const lineOf = async (stem) => (await ed.source()).split('\n').find((l) => l.startsWith(stem));
  const before = await lineOf('box  s2');
  ok(!/\bpoint\b/.test(before || ''), 'and the line says nothing about aim yet', before);

  await clickSlot(page, 'aim', 'up');
  const aimed = await lineOf('box  s2');
  ok(/\bpoint up\b/.test(aimed || ''), 'clicking a direction writes it on that line', aimed);
  ok(!(await ed.problems()).includes('line '), 'the block still parses', await ed.problems());

  // And back off again, rather than to some other direction.
  await clickSlot(page, 'aim', 'default');
  const cleared = await lineOf('box  s2');
  ok(!/\bpoint\b/.test(cleared || ''), 'and "default" takes the option back off', cleared);
  ok(cleared === before, 'leaving the line exactly as it was', JSON.stringify(cleared));

  // And clicking it again is a no-op, not a refusal. Writing an option with
  // no value – a bare `point` - is what the compiler would reject, so the
  // author got a red message for clicking the option already selected.
  await clickSlot(page, 'aim', 'default');
  ok(!(await ed.problems()).includes('line '), 'clicking it twice changes nothing',
    await ed.problems());
  const note2 = await page.evaluate(() =>
    (document.querySelector('#dge-statusnote') || {}).textContent || '');
  ok(!/not applied/.test(note2), 'and says nothing was refused', JSON.stringify(note2));

  // A rectangle has no point, so it is not offered one.
  await page.evaluate(() => {
    const row = [...document.querySelectorAll('#dge-side .dge-list button')]
      .find((b) => b.textContent.includes('paper'));
    if (row) row.click();
  });
  await page.waitForTimeout(350);
  ok(await slotOpts(page, 'aim') === null,
    'a box with no point is offered no direction', await ed.selection());

  // The size row follows the statement, not the kind.
  await page.evaluate(() => dgeClose());
  await page.waitForTimeout(500);
  await walkTo('expand');
  ok(await ed.open('expand'), 'the editor is open on #expand');
  await ed.beat(0);
  await page.evaluate(() => {
    const row = [...document.querySelectorAll('#dge-side .dge-list button .dge-nm')]
      .find((b) => b.textContent === 'f');
    if (row) row.closest('button').click();
  });
  await page.waitForTimeout(350);
  ok(await ed.selection() === 'box f', 'the chart statement is selected', await ed.selection());

  const nums = await page.evaluate(() =>
    [...document.querySelectorAll('#dge-side .dge-num span')].map((s) => s.textContent));
  note('size row: ' + nums.join(' '));
  ok(nums.includes('space'), 'it offers the spacing its own statement takes', nums.join(' '));
  ok(!nums.includes('pad'), 'and not the one a box takes and it does not', nums.join(' '));

  // The trap this closed: a frame has no label, and the first quoted token on
  // its line is the chart's values. A label field here would have overwritten
  // them with whatever was typed, under a name that gave no warning.
  const labelled = await page.evaluate(() =>
    [...document.querySelectorAll('#dge-side h3')].some((h) => h.textContent === 'label'));
  ok(!labelled, 'and offers no label field, because the frame has none', String(labelled));

  // An option whose value is a comma list, not a number. `emph 1,3` singles
  // out two columns from the opening picture, and the field has to write the
  // whole list: a number field would have kept the 1 and dropped the 3, which
  // parses, draws, and is not what anyone typed.
  const bars = () => ed.lineWith('bars f');
  const barsWas = await bars();
  ok(!/\bemph\b/.test(barsWas || ''), 'the chart says nothing about emphasis yet', barsWas);
  const typed = await page.evaluate(() => {
    const lab = [...document.querySelectorAll('#dge-side .dge-num')]
      .find((x) => x.querySelector('span').textContent === 'emph');
    if (!lab) return false;
    const i = lab.querySelector('input');
    // With the spaces a hand would type them: the tokenizer splits on those,
    // and the second half would come back as an unexpected word.
    i.value = '0, 2';
    i.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  });
  ok(typed, 'the panel offers a field for it');
  await page.waitForTimeout(500);
  ok(/\bemph 0,2\b/.test((await bars()) || ''), 'typing a list writes the whole list', await bars());
  ok(!(await ed.problems()).includes('line '), 'the block still parses', await ed.problems());

  await page.evaluate(() => {
    const lab = [...document.querySelectorAll('#dge-side .dge-num')]
      .find((x) => x.querySelector('span').textContent === 'emph');
    const i = lab && lab.querySelector('input');
    if (i) { i.value = ''; i.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  await page.waitForTimeout(500);
  ok((await bars()) === barsWas, 'and clearing it leaves the line exactly as it was',
    JSON.stringify(await bars()));
}
