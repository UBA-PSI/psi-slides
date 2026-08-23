/*
 * A `text n "…" -> x` grows a leader stub, and the compiler models that stub
 * as an edge in `model.edges` so the visibility rule ("a note whose stub leads
 * nowhere is never what the author meant") has something to hang on. The stub
 * carries the *text statement's* span, because it has no line of its own.
 *
 * That was harmless while an edge could only be reached from the element list
 * and offered no label field. It stopped being harmless the moment edges
 * became clickable: the panel would bind to the wrong statement, the label
 * field would rewrite the text node's label, and the `from`/`to` fields would
 * resolve against the literal `->` on the node's line and offer its `gap`
 * value as an endpoint.
 *
 * #primitives is the subject because it has a leader and, in the same block,
 * the column-aligned declarations a careless whitespace fixup would eat.
 */
export const name = 'editor · leader stubs';
export const lecture = 'diagrams';
export const view = 'audience';

export async function run({ page, errors, report, walkTo, ed }) {
  const { ok, note } = report;

  await walkTo('primitives');
  ok(await ed.open('primitives'), 'the editor is open on #primitives');

  const textLine = await ed.lineWith('a free label');
  note('the text statement: ' + textLine);
  ok(/-> x/.test(textLine || ''), 'it really does carry a leader', textLine);

  // The stub is drawn, so it has a path in the canvas and a clickable line.
  const hasStub = await page.evaluate(() =>
    !!document.querySelector('#dge-art-svg [id$="n--lead--p"]'));
  ok(hasStub, 'and the stub is drawn');

  if (hasStub) {
    await ed.clickPath('#dge-art-svg [id$="n--lead--p"]', 0.5);
    const sel = await ed.selection();
    ok(sel !== 'edge n--lead', 'clicking the stub does not select it as an edge', sel);
  }

  const listed = await page.evaluate(() =>
    [...document.querySelectorAll('#dge-side .dge-list .dge-nm')].map(n => n.textContent));
  ok(!listed.includes('n--lead'), 'and it is not offered as a row in the element list',
    JSON.stringify(listed.filter(x => x.includes('lead'))));

  // The guard that actually closes this is in createSpanTable, which leaves
  // leader stubs out of its table so no span of theirs can be handed out at
  // all. Asserted end-to-end rather than by reaching into the module: after
  // all of the above, the text statement must be byte-identical.
  ok(await ed.lineWith('a free label') === textLine,
    'the text statement is byte-identical after all of that', await ed.lineWith('a free label'));

  const whole = await ed.source();
  ok(/^box {2}a "Sender"/m.test(whole),
    'and the column-aligned declarations in the block are intact',
    JSON.stringify(whole.split('\n').filter(l => l.startsWith('box'))));

  ok(!(await ed.problems()).includes('line '), 'the block still compiles', await ed.problems());
  ok(errors.length === 0, 'no page errors', errors.join(' | '));
}
