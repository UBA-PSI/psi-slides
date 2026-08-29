/*
 * Beats: what one does, and writing one.
 *
 * Two things the panel could not say. It could stand on a beat and it could
 * write a `move` into one by dragging, but there was no way to add a step, no
 * way to add any other op, and – the one that cost the most – no way to see
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

// The status line after such an edit has to name the step it did *not* write
// into, or "the opening picture" is a phrase with nothing to hold it down.
const DGE_STEP_NAME_HINT = 'not into step';

export async function run({ page, report, walkTo, ed }) {
  const { ok, note } = report;

  await walkTo('cbc');
  ok(await ed.open('cbc'), 'the editor is open on #cbc');
  // This spec writes, and an edit is applied to the page and saved, so the
  // block would reach every later spec changed. Put it back at the end.
  const original = await page.evaluate(() => DGE.source);

  // Beat 2 of #cbc is `show @xor` plus `emph feed0, feed1, feed2`: two lines.
  // Nine elements, and the gap between two and nine is the whole point. Three
  // are the tag's members; three are the chaining arrows the author named, and
  // they are also arriving; the last three are the arrows into x0, x1 and x2,
  // which no line mentions at all and which come in because both their ends
  // did. That last group is the downhill rule, and it was six here until the
  // pane learned to read the resolved frames rather than only the ops.
  await ed.beat(2);
  const effects = await does(page);
  note('beat 2 does: ' + (effects || []).join(' · '));
  ok(effects && effects.length === 9,
    'the beat lists every element it changes, not every line it was written with',
    JSON.stringify(effects));
  ok(effects.some((t) => /appears/.test(t)) && effects.some((t) => /emphasised/.test(t))
    && effects.some((t) => /comes with its ends/.test(t)),
    'and says what happens to each, the author’s own verb first',
    JSON.stringify(effects));

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
  // Through the prominence row, not an act chip. Prominence is one channel
  // with four states, and it used to be offered twice in two spellings: an
  // `emph` button and a `calm` button in this pane, four swatches in the look
  // pane. It is the row alone now – standing on a beat it writes the step
  // verb, which is the same act as `style m0 {.emph}` one line shorter.
  const clickProminence = (text) => page.evaluate((t) => {
    const s = [...document.querySelectorAll('#dge-side .dge-slot')]
      .find((x) => x.querySelector('b') && x.querySelector('b').textContent === 'prominence');
    const b = s && [...s.querySelectorAll('.dge-sw')].find((x) => x.textContent === t);
    if (b) b.click();
  }, text);
  ok(!(await page.evaluate(() =>
    [...document.querySelectorAll('#dge-side .dge-chip')].some((x) => x.textContent === 'emph'))),
    'prominence is no longer an act chip of its own');
  await clickProminence('emph');
  await page.waitForTimeout(500);
  const src = await ed.source();
  ok(/\n\s*emph m0\b/.test(src), 'clicking the prominence row writes the verb into that step',
    (src.split('\n').find((l) => /emph m0/.test(l)) || '(not found)'));
  ok(!(await ed.problems()).includes('line '), 'the block still parses', await ed.problems());

  const grew = await does(page);
  ok(grew.length === 10, 'and the beat now changes one more element', String(grew.length));

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

  // ── a look row standing on a beat writes into that beat ──
  //
  // This section used to assert the opposite, in as many words: *"a swatch at a
  // beat writes no style op"* and *"it edits the element's own line"*. That was
  // never a decision, it was the shape of one `if` – only the prominence and
  // arrowhead rows crossed over – and the panel therefore answered two
  // different questions in one row, its pressed state reading `dgStateAt` for
  // beat 2 while a click rewrote beat 0. The spec is inverted rather than
  // deleted, because those two assertions are exactly what must never come back.
  //
  // Which rows can cross over is the compiler's `DG_STEP_FIXED` and nothing
  // else: the classes the emitter writes **once** for the whole figure stay
  // behind, greyed, with their reason. See the last block in this spec.
  await ed.beat(2);
  const select = (ids) => page.evaluate((xs) => window.psiEditor.select(xs), ids)
    .then(() => page.waitForTimeout(320));
  // The step's own lines, so an assertion can name the op it expects rather
  // than counting `style` matches across three steps.
  const opsOf = (k) => page.evaluate((i) => {
    const st = DGE.model && DGE.model.steps[i - 1];
    return st ? st.ops.map((o) => DGE.source.slice(o.span[0], o.span[1]).trim()) : [];
  }, k);
  // **The print state, measured rather than derived.** Print is the last beat
  // with the emphasis stripped, and the static attributes of the emitted SVG
  // *are* that state – so compile the block the way the build does and read the
  // class off each element group. Deriving it from `dgStateAt` here would only
  // assert the runtime against itself.
  const printCls = () => page.evaluate(() => {
    const res = window.psiEditor.compile(DGE.fig, DGE.source);
    if (!res.ok) return null;
    const d = document.createElement('div');
    d.innerHTML = res.html;
    const out = {};
    for (const g of d.querySelectorAll('g[data-base]')) {
      out[g.id.split('-').slice(1).join('-')] = g.getAttribute('class');
    }
    return out;
  });
  // The opening picture as the compiler resolves it – defaults, removals, and
  // every step up to beat 0, which is none of them. **This is the assertion
  // that separates the two behaviours**: a swatch that edits the element's own
  // line changes this, and a swatch that writes into a step cannot.
  const beat0 = (id) => page.evaluate((i) => {
    const st = window.PSI_DG.dgStateAt(DGE.model, 0).get(i);
    return st ? [...st.classes].sort().join(' ') : null;
  }, id);
  const clickSw = async (label, want) => {
    const hit = await page.evaluate(([l, w]) => {
      const slot = [...document.querySelectorAll('#dge-side .dge-slot')]
        .find((x) => x.querySelector('b') && x.querySelector('b').textContent === l);
      const b = slot && [...slot.querySelectorAll('.dge-sw')]
        .find((x) => x.title === w || x.textContent === w);
      if (b) b.click();
      return !!b;
    }, [label, want]);
    await page.waitForTimeout(500);
    return hit;
  };

  await select(['m0']);
  const m0Line = await ed.lineWith(' m0 ');
  const m0Open = await beat0('m0');
  const printBefore = await printCls();
  note('m0 opens as: ' + m0Open);

  // 1 · a grouped row. `.tone-1` displaces the `.tone-4` m0's own line gives
  // it, which is what a slot means – so the op is an addition and the removal
  // is implicit in the group.
  ok(await clickSw('fill', '.tone-1'), 'the fill row offers .tone-1 at a beat');
  let ops = await opsOf(2);
  ok(ops.includes('style m0 {.tone-1}'),
    'a grouped row at a beat writes its style op into that step', JSON.stringify(ops));
  ok((await ed.lineWith(' m0 ')) === m0Line,
    'and the opening element line is untouched', await ed.lineWith(' m0 '));
  ok((await beat0('m0')) === m0Open,
    'so the opening picture still wears what it opened with', await beat0('m0'));

  // 2 · an ungrouped toggle. `.bold` contends with nothing, so nothing is
  // displaced and the same machinery has to produce the same shape of line.
  ok(await clickSw('text weight', 'bold'), 'the text-weight row offers bold at a beat');
  ops = await opsOf(2);
  ok(ops.includes('style m0 {.bold}'),
    'an ungrouped toggle at a beat writes its own style op', JSON.stringify(ops));
  ok((await ed.lineWith(' m0 ')) === m0Line,
    'the element line is still untouched', await ed.lineWith(' m0 '));

  // 3 · the base swatch, on a class the element's **own line** gives it. This
  // is the case the mark exists for: at beat 0 the click writes a negation into
  // the tail, and at a beat it has to write one into the step instead – and the
  // element line has to survive either way.
  await select(['m1']);
  const m1Line = await ed.lineWith(' m1 ');
  const m1Open = await beat0('m1');
  ok(await clickSw('fill', 'none'), 'the fill row offers the base swatch at a beat');
  ops = await opsOf(2);
  ok(ops.includes('style m1 {!tone-4}'),
    'the base swatch at a beat writes the removal into the step', JSON.stringify(ops));
  ok((await ed.lineWith(' m1 ')) === m1Line && /\.tone-4/.test(m1Line || ''),
    'and .tone-4 stays on the element’s own line', m1Line);
  ok((await beat0('m1')) === m1Open && /tone-4/.test(m1Open || ''),
    'so the opening picture is unchanged', await beat0('m1'));

  // 4 · a mixed selection. Two elements at two different base states need two
  // different negations to reach one look, which is the grouping the writer
  // does – one line per operation, not one line per element.
  await select(['m0', 'm2']);
  const m2Line = await ed.lineWith(' m2 ');
  ok(await clickSw('fill', 'none'), 'the base swatch is offered on a mixed selection');
  ops = await opsOf(2);
  ok(ops.includes('style m0 {!tone-1}') && ops.includes('style m2 {!tone-4}'),
    'a mixed selection writes one op per base state, not one per element',
    JSON.stringify(ops));
  ok((await ed.lineWith(' m0 ')) === m0Line && (await ed.lineWith(' m2 ')) === m2Line,
    'and neither opening line moved',
    [await ed.lineWith(' m0 '), await ed.lineWith(' m2 ')].join(' | '));

  // The positive half of the same selection: one shared act is one line.
  ok(await clickSw('fill', '.tone-3'), 'the mixed selection can be given one fill');
  ops = await opsOf(2);
  ok(ops.includes('style m0, m2 {.tone-3}'),
    'one act shared by the selection is one line', JSON.stringify(ops));

  ok(!(await ed.problems()).includes('line '), 'and every one of those parses',
    await ed.problems());

  // ── what print shows, and the thing the review had backwards ──
  //
  // The review asked these tests to assert that the print state is unchanged.
  // **Measured, it is not, and it never was.** Print is the *last beat* with
  // `emph` and `dim` stripped, so a tone written into step 2 is still in force
  // at the last beat and comes out in print.html – exactly as it would have
  // under the old behaviour, which wrote it onto the element's line. The print
  // reading is therefore not a discriminating assertion for an ordinary class
  // at all: the opening-picture reading above is what separates the two
  // behaviours, and it is asserted on every case.
  //
  // What is true of print is the prominence half, and it is asserted as such.
  const printAfter = await printCls();
  note('print m0: ' + ((printAfter || {}).m0 || '(absent)'));
  ok(printAfter && /tone-3/.test(printAfter.m0 || ''),
    'a tone set at a beat does reach print – print is the last beat, not the first',
    (printAfter || {}).m0 || '(absent)');
  ok(printBefore && printAfter && !/\bemph\b/.test(Object.values(printAfter).join(' ')),
    'while the emphasis this figure sets in its steps is stripped from print');

  // ── the rows a beat cannot carry, greyed with their reason ──
  //
  // `DG_STEP_FIXED` is the compiler's table of classes the emitter writes once
  // for the whole figure, and the panel greys exactly those rather than keeping
  // a second list. The panel's own rule, one channel along: a control whose only
  // outcome is a compiler refusal is not a control.
  await select(['m0']);
  const rowState = (label) => page.evaluate((l) => {
    const slot = [...document.querySelectorAll('#dge-side .dge-slot')]
      .find((x) => x.querySelector('b') && x.querySelector('b').textContent === l);
    if (!slot) return null;
    return {
      live: [...slot.querySelectorAll('.dge-sw')]
        .filter((b) => !b.disabled && b.getAttribute('aria-pressed') !== 'true')
        .map((b) => b.textContent),
      why: (slot.querySelector('.dge-slot-why') || {}).textContent || '',
    };
  }, label);
  const rowIsFixed = async (label, why) => {
    const r = await rowState(label);
    ok(r && r.live.length === 0,
      'at a beat the “' + label + '” row offers no swatch that could act',
      JSON.stringify(r && r.live));
    ok(r && r.why.includes(why),
      'and says it is ' + why + ' that is settled once', JSON.stringify((r || {}).why));
  };
  for (const [label, why] of [['outline', 'the drawable kind'], ['type size', 'the type size'],
    ['label across', 'the label anchor']]) await rowIsFixed(label, why);
  // `.front` is an edge class, so the row a box is offered does not hold it and
  // the drawing-order reason has to be asked of an edge.
  await select(['feed0']);
  ok((await ed.selection()).includes('feed0'), 'an edge is selected', await ed.selection());
  await rowIsFixed('depth', 'the drawing order');

  // **The one row that is only half settled, and the reason the gate is asked
  // per swatch rather than per row.** `.smooth` is a path kind, chosen once for
  // every frame; `.elbow` draws two waypoints and is as beat-local as a tone.
  // A row-level reading would have taken the second away with the first.
  // An edge with no `via`: `.elbow` draws its own two waypoints, so the
  // compiler refuses one that is already bent by hand and the panel does not
  // offer it there. Found in the model rather than named, because an anonymous
  // edge's id is positional and moves when a line is inserted above it.
  const plainEdge = await page.evaluate(() =>
    (DGE.model.edges.find((e) => !(e.via || []).length) || {}).id || null);
  note('plain edge: ' + plainEdge);
  await select([plainEdge]);
  const shape = await rowState('line shape');
  note('line shape at a beat: ' + JSON.stringify(shape));
  ok(shape && shape.live.length === 1 && /elbow/.test(shape.live[0]),
    'the half-settled row keeps the swatch a step can carry', JSON.stringify(shape && shape.live));
  ok(shape && shape.why.includes('the path kind'),
    'and explains only the half it took away', JSON.stringify((shape || {}).why));
  // Not dead everywhere – that is the difference between "not at this beat" and
  // "not on this element", and it is why the row greys rather than vanishing.
  await ed.beat(0);
  await select(['m0']);
  const at0 = await rowState('outline');
  ok(at0 && at0.live.length > 0 && !at0.why,
    'and at the opening picture the same row is live again with nothing to explain',
    JSON.stringify(at0));

  await ed.beat(2);
  await select(['m0']);
  // The label field is the one control left that edits the element's own line
  // while a beat is standing – a `label` op swaps pre-rendered variants, so the
  // panel has no step form for it – and it is what the status note is about now.
  await page.evaluate(() => {
    const ta = [...document.querySelectorAll('#dge-side textarea')][0];
    if (!ta) return;
    ta.value = 'm_0!';
    ta.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(500);
  const said = await page.evaluate(() => (document.querySelector('#dge-statusnote') || {}).textContent || '');
  note('status after a label edit at a beat: ' + said);
  ok(/opening picture/.test(said) && new RegExp(DGE_STEP_NAME_HINT).test(said),
    'a label edit at a beat still says where it went', JSON.stringify(said));

  await page.evaluate((s) => dgeSetSource(s), original);
  await page.waitForTimeout(400);
  const restored = await page.evaluate(() => DGE.source);
  ok(restored === original, 'and the block is put back the way it was',
    JSON.stringify(restored.slice(-60)) + ' vs ' + JSON.stringify(original.slice(-60)));
}
