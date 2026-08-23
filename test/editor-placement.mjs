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

export async function run({ page, errors, report, walkTo, ed }) {
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

  ok(errors.length === 0, 'no page errors', errors.join(' | '));
}
