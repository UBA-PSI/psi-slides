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

export async function run({ page, report, walkTo, ed }) {
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
      // The closed class vocabulary, as opposed to the placement's own swatch
      // rows, which share the outer class and write a relation rather than a
      // look. Only the first kind can be asked whether a swatch is dead.
      look: s.classList.contains('dge-slot-look'),
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

  // The third assertion, and the one whose absence let nineteen dead swatches
  // ship. "The block still parses" and "the tail is still a tail" are both
  // true of a click that does *nothing*: the class is written, the compiler
  // accepts it on the kind, and no rule in the stylesheet can reach it – which
  // is exactly what `.emph` on a free text, `.bare` on a brace and thirteen
  // others were doing. So measure the drawing: after a swatch that was not
  // already pressed, the element's own group has to come back different, in
  // its class attribute or in its geometry. `outerHTML` is both at once.
  const sigOf = () => page.evaluate(() => {
    const g = document.querySelector('#dge-art-svg [id$="-b"]');
    return g ? g.outerHTML : '';
  });
  const pressedAt = (slot, title) => page.evaluate(([sl, t]) => {
    const s = [...document.querySelectorAll('#dge-side .dge-slot')].find(x => x.querySelector('b').textContent === sl);
    const b = s && [...s.querySelectorAll('.dge-sw')].find(x => x.title === t);
    return b ? b.getAttribute('aria-pressed') === 'true' : null;
  }, [slot, title]);

  // The conditional set, named rather than left as a blanket tolerance. A
  // swatch is exempt only where "nothing changed" is the honest answer: a
  // swatch already pressed is the state the element is in, and `inherit` is an
  // act rather than a state, so where no default supplies the slot it means
  // the same as what is already written.
  const exempt = (slot, title, was) =>
    was !== false || /^drop this element/.test(title);

  let broke = null, unbraced = null;
  const dead = [];
  for (const s of slots) {
    for (const t of s.opts) {
      const was = await pressedAt(s.slot, t);
      const sig = await sigOf();
      await click(s.slot, t);
      const l = await lineB();
      const probs = await ed.problems();
      if (!broke && probs.includes('line ')) broke = s.slot + ' ' + t + ' -> ' + l + '  [' + probs.trim() + ']';
      // Whatever the tail ends up holding, it has to still be a tail.
      if (!unbraced && /\s\.[a-z-]/.test((l || '').replace(tailOf(l), ''))) {
        unbraced = s.slot + ' ' + t + ' -> ' + l;
      }
      if (s.look && !exempt(s.slot, t, was) && (await sigOf()) === sig) {
        dead.push(s.slot + ' · ' + t);
      }
    }
  }
  ok(!broke, 'the block parses after every swatch in every slot', broke);
  ok(!unbraced, 'and a class never escapes the attribute tail', unbraced);
  ok(dead.length === 0, 'and every swatch the panel offers actually changes the drawing',
    dead.join(' | '));

  // The point of the panel: the class has to reach the drawing, not just the
  // text. "Nothing happens" was the symptom, and it was true of the picture.
  await click('line', '.dashed');
  const painted = await page.evaluate(() => {
    const g = document.querySelector('#dge-art-svg [id$="-b"]');
    return g ? (g.getAttribute('class') || '') : '(not found)';
  });
  ok(/\bdashed\b/.test(painted), 'clicking a swatch repaints the element', painted);
  note('painted: ' + painted);

  // `.fit` and `.shrink` size the type to the box, so the compiler insists the
  // box be given - `w n` or `same as X`. That error is written for someone
  // typing text, who would have to invent a number; here the box is on screen
  // and its width is known, so the click writes it. A swatch you can press
  // has to do something.
  await click('type fits the box', '.fit');
  const fitted = await lineB();
  const note2 = await page.evaluate(() => (document.querySelector('#dge-statusnote') || {}).textContent || '');
  ok(/\bw [\d.]+/.test(fitted || '') && /\.fit/.test(fitted || ''),
    '.fit writes the width it needs rather than refusing', fitted);
  ok(/wrote/.test(note2) && /w [\d.]+/.test(note2),
    'and says so, because it wrote more than the click asked for', JSON.stringify(note2));
  ok(!(await ed.problems()).includes('line '), 'the block parses', await ed.problems());

  // The revert is still the safety net, and an endpoint typed as a name that
  // does not exist is the easiest way to reach it. Left standing, a broken
  // block leaves the span table describing text that is gone and every later
  // edit splices at offsets that have moved.
  await page.evaluate(() => {
    const row = [...document.querySelectorAll('#dge-side .dge-list button')]
      .find(b => b.textContent.includes('encrypted'));
    if (row) row.click();
  });
  await page.waitForTimeout(350);
  ok(await ed.selection() === 'edge edge-1', 'an edge is selected', await ed.selection());
  const edgeBefore = await ed.lineWith('"encrypted"');
  await page.evaluate(() => {
    const input = [...document.querySelectorAll('#dge-side .dge-num')]
      .find(n => n.querySelector('span').textContent === 'to').querySelector('input');
    input.value = 'nosuchbox';
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(450);
  const note3 = await page.evaluate(() => (document.querySelector('#dge-statusnote') || {}).textContent || '');
  ok(await ed.lineWith('"encrypted"') === edgeBefore,
    'an endpoint that names nothing leaves the source exactly as it was',
    JSON.stringify(await ed.lineWith('"encrypted"')));
  ok(/not applied/.test(note3) && /nosuchbox/.test(note3),
    'and the status says it was refused, and why', JSON.stringify(note3));
  // The compiler's sentence is about text that was rolled back, so a line
  // number would send the author to a line that no longer holds what it names.
  ok(!/\bline \d/.test(note3), 'and names no line, because that line is gone',
    JSON.stringify(note3));
  ok(!(await ed.problems()).includes('line '), 'the block is not left broken', await ed.problems());

  // Back to the box for what follows.
  await page.evaluate(() => {
    const row = [...document.querySelectorAll('#dge-side .dge-list button')].find(b => b.textContent.includes('Mix'));
    if (row) row.click();
  });
  await page.waitForTimeout(300);

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

  // ── the one word that moves a brace, and the two fields that shared a name ──
  //
  // `brace b over a,z side left "…"` says which side of its members the brace
  // stands on. It used to be a bare positional word – the last one in the
  // statement grammar – whose place on the line was free, so the panel needed a
  // one-off scanner to find it. It is an ordinary keyed option now, the same
  // word an edge's label side takes, and the row is backed by plain spanOf.
  await page.evaluate(() => dgeClose());
  await page.waitForTimeout(400);
  await walkTo('expand');
  ok(await ed.open('expand'), 'the editor is open on #expand');
  await ed.beat(0);

  const pickRow = async (name) => {
    await page.evaluate((n) => {
      const row = [...document.querySelectorAll('#dge-side .dge-list button .dge-nm')]
        .find((b) => b.textContent === n);
      if (row) row.closest('button').click();
    }, name);
    await page.waitForTimeout(320);
  };
  const sideRow = () => page.evaluate(() => {
    const s = [...document.querySelectorAll('#dge-side .dge-slot')]
      .find((x) => x.querySelector('b') && x.querySelector('b').textContent === 'side');
    if (!s) return null;
    return [...s.querySelectorAll('.dge-sw')].map((b) =>
      b.textContent + (b.getAttribute('aria-pressed') === 'true' ? '*' : ''));
  });
  const clickSide = async (text) => {
    await page.evaluate((t) => {
      const s = [...document.querySelectorAll('#dge-side .dge-slot')]
        .find((x) => x.querySelector('b') && x.querySelector('b').textContent === 'side');
      const b = s && [...s.querySelectorAll('.dge-sw')].find((x) => x.textContent === t);
      if (b) b.click();
    }, text);
    await page.waitForTimeout(420);
  };

  await pickRow('b1');
  ok(await ed.selection() === 'brace b1', 'a brace is selected', await ed.selection());
  const sides = await sideRow();
  note('side row: ' + (sides ? sides.join(' ') : '(absent)'));
  ok(!!sides && sides.length === 5, 'the panel offers the four sides and a default',
    sides ? sides.join(' ') : '(absent)');
  ok(!!sides && sides.includes('bottom*'), 'with the one the source says pressed',
    sides ? sides.join(' ') : '(absent)');

  const braceLine = () => ed.lineWith('"Bin 1"');
  await clickSide('right');
  ok(/\bside right\b/.test((await braceLine()) || ''),
    'clicking a side writes the keyword and the word', await braceLine());
  ok(!(await ed.problems()).includes('line '), 'and the block parses', await ed.problems());
  await clickSide('default');
  const bare2 = await braceLine();
  ok(!/\bside\b/.test(bare2 || ''),
    'the default swatch takes the keyword and the word off again', bare2);
  ok(!/ {2}/.test(bare2 || ''), 'and leaves no double space behind', JSON.stringify(bare2));
  ok(!(await ed.problems()).includes('line '), 'and that parses too', await ed.problems());

  // Two fields under one word in one panel is a coin toss over which is being
  // edited, and a `grid` had exactly that: what each cell draws and how wide
  // one is were both called `cell`. Typing 0.2 into the first wrote it over
  // `dot` and came back as the compiler's refusal.
  await pickRow('g');
  const names = await page.evaluate(() =>
    [...document.querySelectorAll('#dge-side .dge-num span')].map((x) => x.textContent));
  note('fields: ' + names.join(' '));
  const dupes = names.filter((n, i) => names.indexOf(n) !== i);
  ok(dupes.length === 0, 'no two fields in one panel answer to the same word',
    dupes.join(' ') || '(none)');
}
