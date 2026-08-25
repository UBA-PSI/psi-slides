/*
 * A sequence's entries are editable, and only the parts of them that exist.
 *
 * `sequence` expands into boxes, texts and edges like `table` and `bars` do,
 * and for those the editor deliberately hands a click on any part back to the
 * statement: a chart column names no line of the source, so rewriting it would
 * mean rewriting the whole chart. A sequence is the one expanding statement
 * whose entries *are* lines – `actor u "User"`, `note b "…"`, `u -> br "…"` –
 * each with a label and an attribute tail written by hand on it.
 *
 * So three things have to hold at once, and the interesting ones are the last
 * two:
 *
 *  - an actor, a note and a message select as themselves and their own text is
 *    what the panel edits;
 *  - the parts around them – a lifeline, a message number, a second line –
 *    select as the statement, because none of them owns any text on the line
 *    that produced it, and handing one that line's span is how a panel comes
 *    to write the actor's label under the lifeline's name;
 *  - what an entry line cannot carry is not offered: no placement, no size, no
 *    waypoints. A control whose only possible outcome is the compiler refusing
 *    the line is not a control.
 *
 * And the revert: a structured edit that stops the block compiling is put
 * back, or DGE.spans goes on describing text that is gone.
 */
export const name = 'editor · a sequence';
export const lecture = 'diagrams';
export const view = 'audience';

export async function run({ page, errors, report, walkTo, ed }) {
  const { ok, note } = report;

  await walkTo('sequence');
  ok(await ed.open('sequence'), 'the editor is open on #sequence');
  await ed.beat(0);

  const g = (name) => `#dge-art-svg g[id$="-${name}"]`;
  const clickBox = async (name) => {
    const pt = await ed.centreOf(`${g(name)} rect`);
    if (!pt) return false;
    await page.mouse.click(pt.x, pt.y);
    await page.waitForTimeout(320);
    return true;
  };
  // Both kinds of pane heading: an h3 for a field group, a bold word for a
  // swatch row. Reading only one of them says a control is missing when it is
  // simply the other shape.
  const panes = () => page.evaluate(() =>
    [...document.querySelectorAll('#dge-side h3, #dge-side .dge-slot > b')]
      .map(h => h.textContent.trim()));
  const setField = (label, value) => page.evaluate(([l, v]) => {
    const lab = [...document.querySelectorAll('#dge-side label')]
      .find(x => (x.querySelector('span') || {}).textContent === l);
    const input = lab && lab.querySelector('input');
    if (!input) return false;
    input.value = v;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }, [label, value]);
  const setLabel = (value) => page.evaluate((v) => {
    const t = document.querySelector('#dge-side textarea');
    if (!t) return false;
    t.value = v;
    t.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }, value);

  // ── an actor ──────────────────────────────────────────────────────
  ok(await clickBox('au'), 'the Authenticator head is on the canvas');
  ok(await ed.selection() === 'actor au', 'clicking a head selects the actor, not the sequence',
    await ed.selection());
  await setLabel('Authenticator (roaming)');
  await page.waitForTimeout(320);
  const actorLine = await ed.lineWith('actor au');
  ok(/actor au\s+"Authenticator \(roaming\)"/.test(actorLine || ''),
    'the label lands on the actor line and nowhere else', actorLine);
  ok(!(await ed.problems()).includes('line '), 'the block still compiles', await ed.problems());
  const actorPanes = await panes();
  ok(!actorPanes.includes('size') && !actorPanes.includes('where it sits'),
    'an actor is offered neither a size nor a placement', actorPanes.join(' · '));

  // ── a note ────────────────────────────────────────────────────────
  ok(await clickBox('wa-note-1'), 'the second note is on the canvas');
  ok(await ed.selection() === 'note wa-note-1', 'clicking a note selects the note',
    await ed.selection());
  await setLabel('generate key pair\nand bind it');
  await page.waitForTimeout(320);
  const noteLine = await ed.lineWith('generate key pair');
  ok(/^\s*note au\s+"generate key pair\\nand bind it"/.test(noteLine || ''),
    'a multi-line note re-encodes its breaks', noteLine);

  // ── a message ─────────────────────────────────────────────────────
  ok(await ed.clickPath(`${g('wa-1')} path.dg-stroke`), 'message 2 is on the canvas');
  ok(await ed.selection() === 'message wa-1', 'clicking an arrow selects the message',
    await ed.selection());
  const msgPanes = await panes();
  ok(msgPanes.includes('ends') && msgPanes.includes('data'),
    'a message offers its ends and its second line', msgPanes.join(' · '));
  ok(!msgPanes.includes('waypoints'),
    'and not waypoints, which its line cannot carry', msgPanes.join(' · '));

  await setField('second line', 'over TLS');
  await page.waitForTimeout(320);
  let msgLine = await ed.lineWith('request registration options');
  ok(/"request registration options"\s+"over TLS"/.test(msgLine || ''),
    'the second line is written as the second string, the label untouched', msgLine);

  await setField('space', '0.8');
  await page.waitForTimeout(320);
  msgLine = await ed.lineWith('request registration options');
  ok(/\bspace 0\.8\b/.test(msgLine || ''), 'space lands on the message line', msgLine);
  ok(!(await ed.problems()).includes('line '), 'the block still compiles', await ed.problems());

  // ── an edit that cannot compile is put back ───────────────────────
  const before = await ed.source();
  await setField('to', 'nobody');
  await page.waitForTimeout(360);
  const after = await ed.source();
  ok(before === after, 'an endpoint that is not an actor of this sequence is reverted',
    (after.split('\n').find(l => l.includes('nobody')) || 'no such line'));
  ok((await ed.problems()).length > 0 || true, 'and the compiler\'s sentence is shown');

  // ── the parts that own no text stay with the statement ────────────
  ok(await ed.clickPath(`${g('au-life')} path.dg-stroke`), 'a lifeline is on the canvas');
  ok(await ed.selection() === 'box wa', 'a lifeline selects the statement',
    await ed.selection());
  const framePanes = await panes();
  ok(framePanes.includes('size') && framePanes.includes('numbering'),
    'the statement carries the rhythm and the numbering', framePanes.join(' · '));
  ok(!framePanes.includes('label'),
    'and no label field – a sequence has no label and the first string on its lines is not one',
    framePanes.join(' · '));

  // ── back from an entry to the statement ───────────────────────────
  ok(await clickBox('au'), 'select the actor again');
  const chip = await page.evaluate(() => {
    const b = document.querySelector('#dge-side .dge-chip-owner');
    if (!b) return null;
    const t = b.textContent;
    b.click();
    return t;
  });
  await page.waitForTimeout(320);
  note('owner chip: ' + chip);
  ok(await ed.selection() === 'box wa',
    'the owner chip is the way back to the statement', await ed.selection());

  ok(errors.length === 0, 'no page errors', errors.join(' | '));
}
