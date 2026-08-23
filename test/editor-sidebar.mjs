/*
 * Every swatch in the look panel, clicked, twice over.
 *
 * The bug this exists for only appeared on the *second* click in a slot. The
 * first one writes a tail where there was none, and the span for an absent
 * tail carries its braces in prefix/suffix; the second replaces a tail that
 * is already there, whose span covers `{...}` while its value is only what
 * sits between them. Writing the value back over the span dropped the braces,
 * `{.dashed}` became a bare `.dashed .dim`, and that does not parse - so the
 * editor kept its last good compile and the panel looked like it was doing
 * nothing at all while it corrupted the source underneath.
 *
 * Hence: click everything, check after every click, and check the drawing as
 * well as the text. A spec that sampled one swatch would have passed.
 */
export const name = 'editor · the look panel';
export const lecture = 'diagrams';
export const view = 'audience';

export async function run({ page, errors, report, walkTo, ed }) {
  const { ok, note } = report;

  await walkTo('primitives');
  ok(await ed.open('primitives'), 'the editor is open on #primitives');
  await ed.beat(0);
  await page.evaluate(() => {
    const row = [...document.querySelectorAll('#dge-side .dge-list button')]
      .find(b => b.textContent.includes('Mix'));
    if (row) row.click();
  });
  await page.waitForTimeout(350);
  ok(await ed.selection() === 'box b', 'box b is selected', await ed.selection());

  const slots = await page.evaluate(() =>
    [...document.querySelectorAll('#dge-side .dge-slot')].map(s => ({
      slot: s.querySelector('b').textContent,
      opts: [...s.querySelectorAll('.dge-sw')].map(b => b.title),
    })));
  note(slots.length + ' slots, ' + slots.reduce((n, s) => n + s.opts.length, 0) + ' swatches');
  ok(slots.length >= 8, 'the panel offers the slots a box has', String(slots.length));

  const click = async (slot, title) => {
    await page.evaluate(([sl, t]) => {
      const s = [...document.querySelectorAll('#dge-side .dge-slot')].find(x => x.querySelector('b').textContent === sl);
      const b = s && [...s.querySelectorAll('.dge-sw')].find(x => x.title === t);
      if (b) b.click();
    }, [slot, title]);
    await page.waitForTimeout(220);
  };
  const lineB = () => ed.lineWith('"Mix"');
  const tailOf = (l) => ((l || '').match(/\{[^}]*\}/) || [''])[0];

  let broke = null, unbraced = null;
  for (const s of slots) {
    for (const t of s.opts) {
      await click(s.slot, t);
      const l = await lineB();
      const probs = await ed.problems();
      if (!broke && probs.includes('line ')) broke = s.slot + ' ' + t + ' -> ' + l + '  [' + probs.trim() + ']';
      // Whatever the tail ends up holding, it has to still be a tail.
      if (!unbraced && /\s\.[a-z-]/.test((l || '').replace(tailOf(l), ''))) {
        unbraced = s.slot + ' ' + t + ' -> ' + l;
      }
    }
  }
  ok(!broke, 'the block parses after every swatch in every slot', broke);
  ok(!unbraced, 'and a class never escapes the attribute tail', unbraced);

  // The point of the panel: the class has to reach the drawing, not just the
  // text. "Nothing happens" was the symptom, and it was true of the picture.
  await click('line', '.dashed');
  const painted = await page.evaluate(() => {
    const g = document.querySelector('#dge-art-svg [id$="-b"]');
    return g ? (g.getAttribute('class') || '') : '(not found)';
  });
  ok(/\bdashed\b/.test(painted), 'clicking a swatch repaints the element', painted);
  note('painted: ' + painted);

  // A refusal has to be a refusal, not a broken block. `.fit` on a box with
  // neither `w` nor `same as` is a documented hard error - there is nothing to
  // fit the type into - and the panel offers the swatch anyway, because
  // whether it is legal depends on the element. So the act has to bounce: the
  // source unchanged, the compiler's own sentence in the status bar. Leaving
  // the block broken instead is what let the *next* click splice at offsets
  // that had moved, because the span table is only rebuilt on a good compile.
  const beforeFit = await lineB();
  await click('type fits the box', '.fit');
  const note2 = await page.evaluate(() => (document.querySelector('#dge-statusnote') || {}).textContent || '');
  ok(await lineB() === beforeFit, 'an illegal class leaves the source exactly as it was',
    JSON.stringify(await lineB()));
  ok(/\.fit/.test(note2) && /w n|same as/.test(note2),
    'and the compiler says why, in the status bar', JSON.stringify(note2));
  ok(/not applied/.test(note2), 'the message says the act was refused, not just why',
    JSON.stringify(note2));
  // The compiler's sentence is about text that was rolled back, so a line
  // number would send the author to a line that no longer holds what it names.
  ok(!/\bline \d/.test(note2), 'and it names no line, because that line is gone',
    JSON.stringify(note2));
  ok(!(await ed.problems()).includes('line '), 'the block is not left broken', await ed.problems());

  // Tags go through the same tail.
  const before = await lineB();
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('#dge-side .dge-chip')].find(x => x.textContent.includes('+ tag'));
    if (b) { window.prompt = () => 'probe'; b.click(); }
  });
  await page.waitForTimeout(400);
  const tagged = await lineB();
  ok(/@probe/.test(tagged || '') && /\{[^}]*@probe[^}]*\}/.test(tagged || ''),
    'a tag lands inside the tail', tagged);
  ok(!(await ed.problems()).includes('line '), 'and the block still parses', await ed.problems());
  note('before: ' + before + '\n    after : ' + tagged);

  // Nothing may have leaked into a neighbouring statement.
  const src = (await ed.source()).split('\n').filter(Boolean);
  ok(src.length === 8, 'the block still has its eight statements, one per line',
    String(src.length) + ': ' + JSON.stringify(src));

  ok(errors.length === 0, 'no page errors', errors.join(' | '));
}
