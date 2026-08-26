/*
 * `bars … series of <chart>` – the one statement in the grammar that draws no
 * frame of its own.
 *
 * It joins the chart named after `series of`, borrows its width, its height,
 * its spacing, its ticks and its baseline, and brings only its own values and
 * its own look. That is why it has no box to select, drag or resize – and it
 * is also why, until the compiler started recording it in `model.statements`,
 * it had **no span-table entry at all**: `createSpanTable` keys elements, and
 * this statement is not one. Everything on the line was therefore reachable
 * only by typing into the source pane.
 *
 * So the spec is in two halves, and both matter. The controls have to write
 * the tokens they name – values, `stacked`, the two mark lists, the class tail
 * and the tags – and the geometry that belongs to the chart has to stay
 * missing, with the sentence that says whose it is.
 */
export const name = 'editor · a series of columns';
export const lecture = 'diagrams';
export const view = 'audience';

export async function run({ page, errors, report, walkTo, ed }) {
  const { ok, note } = report;

  const panes = () => page.evaluate(() =>
    [...document.querySelectorAll('#dge-side h3')].map((h) => h.textContent));
  const slots = () => page.evaluate(() =>
    [...document.querySelectorAll('#dge-side .dge-slot b')].map((b) => b.textContent));
  const field = (label, value) => page.evaluate(([l, v]) => {
    const h = [...document.querySelectorAll('#dge-side h3')].find((x) => x.textContent === l);
    const i = h && h.parentElement.querySelector('input, textarea');
    if (!i) return false;
    i.value = v;
    i.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }, [label, value]);
  const numField = (name_, value) => page.evaluate(([n, v]) => {
    const l = [...document.querySelectorAll('#dge-side .dge-num')]
      .find((x) => x.querySelector('span').textContent === n);
    if (!l) return false;
    const i = l.querySelector('input');
    i.value = v;
    i.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }, [name_, value]);
  // A fill swatch carries its colour and no text at all, so it is found by
  // its title – which is the class it writes – and everything else by its
  // label. One helper for both, or half the rows are unreachable from here.
  const swatch = (text) => page.evaluate((t) => {
    const b = [...document.querySelectorAll('#dge-side .dge-sw')]
      .find((x) => x.textContent === t || x.title === t);
    if (!b) return false;
    b.click();
    return true;
  }, text);
  const pressed = (text) => page.evaluate((t) => {
    const b = [...document.querySelectorAll('#dge-side .dge-sw')]
      .find((x) => x.textContent === t || x.title === t);
    return b ? b.getAttribute('aria-pressed') : null;
  }, text);

  await walkTo('series');
  ok(await ed.open('series'), 'the editor is open on #series');
  await ed.beat(0);

  // Clicking a column selects the statement that drew it, not the column: a
  // generated name has no line of its own to rewrite.
  const col = await ed.centreOf('#dge-art-svg [id$="-a2-1"]');
  await page.mouse.click(col.x, col.y);
  await page.waitForTimeout(360);
  ok(await ed.selection() === 'bars a2', 'clicking a column selects the series', await ed.selection());
  const start = await ed.lineWith('bars a2');
  note('before : ' + start);

  const heads = await panes();
  note('panes  : ' + heads.join(' · '));
  ok(heads.includes('values'), 'it offers the values it brought');
  ok(heads.includes('marked columns'), 'and the two words that mark a column');
  ok(heads.includes('look') && heads.includes('tags'), 'and its look and its tags');
  // The geometry belongs to the chart it joined, and the compiler errors on
  // every one of these – so they are absent rather than present and refusing.
  const rows = await slots();
  note('slots  : ' + rows.join(' · '));
  ok(rows.includes('grouping'), 'the one word that is its own: side by side, or stacked');
  const said = await page.evaluate(() =>
    (document.querySelector('#dge-side .dge-empty') || {}).textContent || '');
  ok(/no box of its own/.test(said) && /belong to the chart|belongs to the chart/.test(said)
    || /the width, the height and the spacing belong to the chart/.test(said),
  'and the sentence still says whose the geometry is', said.slice(0, 120));
  const sizeFields = await page.evaluate(() =>
    [...document.querySelectorAll('#dge-side .dge-num span')].map((s) => s.textContent));
  note('fields : ' + sizeFields.join(' · '));
  ok(!sizeFields.includes('w') && !sizeFields.includes('h') && !sizeFields.includes('space'),
    'no w, no h, no space – all three are the chart’s', sizeFields.join(' '));
  ok(!heads.includes('label'), 'and no label field, because the first string is the data');
  ok(!heads.includes('where it sits'), 'and no placement, which the statement refuses');

  // ── which chart it joined ──
  // The charts in a block are a closed list, which is this codebase's own
  // criterion for a control rather than a field – and only the ones declared
  // above the line, because the compiler refuses a series that names a chart
  // below it and a swatch that can only come back as a refusal is not a
  // control. a2 has exactly one such chart, and the row shows it anyway: with
  // nothing else to offer it is the panel saying what this run belongs to.
  ok(rows.includes('series of'), 'the chart it joined is a row, not a text field',
    rows.join(' · '));
  const chartRow = () => page.evaluate(() => {
    const slot = [...document.querySelectorAll('#dge-side .dge-slot')]
      .find((s) => s.querySelector('b').textContent === 'series of');
    return slot ? [...slot.querySelectorAll('.dge-sw')]
      .map((b) => b.textContent + '=' + b.getAttribute('aria-pressed')) : null;
  });
  note('charts : ' + JSON.stringify(await chartRow()));
  ok(JSON.stringify(await chartRow()) === JSON.stringify(['a=true']),
    'a2 is offered the one chart above it, and it reads as pressed',
    JSON.stringify(await chartRow()));

  // ── values ──
  ok(await field('values', '9,11,10,30'), 'the values field is there');
  await page.waitForTimeout(400);
  let line = await ed.lineWith('bars a2');
  note('values : ' + line);
  ok(/"9,11,10,30"/.test(line || ''), 'and typing into it rewrites the quoted data', line);

  // ── stacked, as a closed choice of two ──
  ok(await pressed('stacked') === 'false', 'the line does not say stacked yet');
  ok(await swatch('stacked'), 'the grouping row offers it');
  await page.waitForTimeout(400);
  line = await ed.lineWith('bars a2');
  note('stacked: ' + line);
  // A trailing option goes in front of the attribute tail, like every other
  // one – `bars a2 "…" {.tone-3} stacked` reads like a mistake.
  ok(/\bstacked\b\s*\{/.test(line || ''),
    'clicking it writes the word, in front of the attribute tail', line);
  ok(await pressed('stacked') === 'true', 'and the swatch reads back as pressed');
  ok(await swatch('side by side'), 'the other half of the row is there');
  await page.waitForTimeout(400);
  line = await ed.lineWith('bars a2');
  ok(!/stacked/.test(line || ''), 'and it takes the word off again', line);
  ok(!/  series of a  /.test(line || ''), 'without leaving a double space behind', line);

  // ── the prominence lists: one dial, three words, the same three
  // everywhere. `calm` used to be the second of them – a name with no class
  // behind it, and `ghost` had no field at all. ──
  ok(await numField('emph', '1,2'), 'the emph field is there');
  await page.waitForTimeout(400);
  line = await ed.lineWith('bars a2');
  note('emph   : ' + line);
  ok(/emph 1,2\b/.test(line || ''), 'and writes the whole list', line);
  ok(await numField('dim', ''), 'and dim can be cleared');
  await page.waitForTimeout(400);
  line = await ed.lineWith('bars a2');
  note('dim    : ' + line);
  ok(!/\bdim\b/.test(line || ''), 'which takes the keyword with it', line);
  ok(await numField('ghost', '0'), 'and ghost, which the pair never offered');
  await page.waitForTimeout(400);
  line = await ed.lineWith('bars a2');
  note('ghost  : ' + line);
  ok(/\bghost 0\b/.test(line || ''), 'is a field of its own now', line);
  ok(await numField('ghost', ''), 'and clears the same way');
  await page.waitForTimeout(400);

  // ── the class tail, offered for a box, because a column is one ──
  ok(await swatch('.tone-1'), 'a fill swatch is offered');
  await page.waitForTimeout(400);
  line = await ed.lineWith('bars a2');
  note('fill   : ' + line);
  ok(/\.tone-1/.test(line || '') && !/\.tone-3/.test(line || ''),
    'and it displaces the tone that was in the slot', line);

  // ── tags ──
  await page.evaluate(() => { window.prompt = () => 'second'; });
  const added = await page.evaluate(() => {
    const b = [...document.querySelectorAll('#dge-side .dge-chip')]
      .find((x) => x.textContent.startsWith('+ tag'));
    if (!b) return false;
    b.click();
    return true;
  });
  ok(added, 'the tag chip is there');
  await page.waitForTimeout(400);
  line = await ed.lineWith('bars a2');
  note('tag    : ' + line);
  ok(/@second/.test(line || ''), 'and a tag joins the attribute tail', line);

  // ── retargeting, on the series that has two charts to choose between ──
  // b2 sits below both `bars a` and `bars b`, so its row carries both, with
  // the one the line names pressed. Clicking the other replaces exactly one
  // token: the name after `of`.
  const col2 = await ed.centreOf('#dge-art-svg [id$="-b2-1"]');
  await page.mouse.click(col2.x, col2.y);
  await page.waitForTimeout(360);
  ok(await ed.selection() === 'bars b2', 'the second series is selected', await ed.selection());
  note('charts : ' + JSON.stringify(await chartRow()));
  ok(JSON.stringify(await chartRow()) === JSON.stringify(['a=false', 'b=true']),
    'both charts above it are offered, with its own pressed', JSON.stringify(await chartRow()));
  const b2Before = await ed.lineWith('bars b2');
  note('before : ' + b2Before);
  ok(await page.evaluate(() => {
    const slot = [...document.querySelectorAll('#dge-side .dge-slot')]
      .find((s) => s.querySelector('b').textContent === 'series of');
    const b = [...slot.querySelectorAll('.dge-sw')].find((x) => x.textContent === 'a');
    if (!b) return false;
    b.click();
    return true;
  }), 'the other chart is a click away');
  await page.waitForTimeout(450);
  const b2After = await ed.lineWith('bars b2');
  note('after  : ' + b2After);
  ok(/\bseries of a\b/.test(b2After || ''), 'and it retargets the run', b2After);
  ok(b2After.replace(' series of a ', ' series of b ') === b2Before,
    'by replacing that one token and nothing else', b2After);

  ok(!(await ed.problems()).includes('line '), 'every edit left the block compiling',
    await ed.problems());
  ok(errors.length === 0, 'no page errors', errors.join(' | '));
}
