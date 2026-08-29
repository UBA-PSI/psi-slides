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

export async function run({ page, report, walkTo, ed }) {
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

  // ── a swatch on a message must not write the tail it reads ────────
  // `dgePlanTail` rebuilds the whole tail from the model, and a message's
  // model classes hold two the author never wrote: the ground the expansion
  // gives every message label, and the head class its arrow token seeds. The
  // second is refused in a message tail outright, so writing it back would
  // stop the block compiling and the edit would revert – a panel that looks
  // dead on the first swatch click. `autoClasses` is what stops it, and this
  // is the assertion that it is set on a message and not only on an edge.
  const clickSlot = (slot, text) => page.evaluate(([sl, t]) => {
    const s = [...document.querySelectorAll('#dge-side .dge-slot')]
      .find((x) => x.querySelector('b') && x.querySelector('b').textContent === sl);
    const b = s && [...s.querySelectorAll('.dge-sw')].find((x) => x.textContent === t);
    if (b) b.click();
    return !!b;
  }, [slot, text]);
  ok(await clickSlot('line', 'dashed'), 'the message offers the line-pattern row');
  await page.waitForTimeout(360);
  msgLine = await ed.lineWith('request registration options');
  ok(/\.dashed/.test(msgLine || ''), 'the swatch writes its class onto the message line', msgLine);
  ok(!/head/.test(msgLine || ''),
    'and not the head class the arrow token seeded, which the tail refuses', msgLine);
  ok(!(await ed.problems()).includes('line '),
    'so the block still compiles after a swatch click', await ed.problems());

  // ── an edit that cannot compile is put back ───────────────────────
  const before = await ed.source();
  await setField('to', 'nobody');
  await page.waitForTimeout(360);
  const after = await ed.source();
  ok(before === after, 'an endpoint that is not an actor of this sequence is reverted',
    (after.split('\n').find(l => l.includes('nobody')) || 'no such line'));
  // Not the problems pane: after a revert the block compiles again, so there
  // is nothing in it. The refusal is in the status note, which is where every
  // rolled-back edit says what it would have cost. This assertion read
  // `.length > 0 || true` and passed on any software at all.
  const said = await page.evaluate(() => (document.querySelector('#dge-statusnote') || {}).textContent || '');
  ok(/not applied/.test(said) && /nobody/.test(said),
    'and the status note says it was refused, and names the endpoint', JSON.stringify(said));

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

  // ── a generated name must not become authored ─────────────────────
  //
  // `wa-1` is *positional*: it counts messages, so inserting one above it
  // makes it something else. Anything the panel writes that pins it into the
  // source turns a name the statement owns into a name the author now owns,
  // and every later edit has to keep it true. `{#id}` used to be the way that
  // happened; now the risk is the leading name slot, and the rule the panel
  // follows is the compiler's `named` flag rather than the shape of the id.
  const nameField = () => page.evaluate(() => {
    const h = [...document.querySelectorAll('#dge-side h3')]
      .find((x) => x.textContent.trim() === 'name');
    const i = h && h.parentElement.querySelector('input');
    return i ? { value: i.value, placeholder: i.getAttribute('placeholder') || '' } : null;
  });
  const setName = async (v) => {
    await page.evaluate((val) => {
      const h = [...document.querySelectorAll('#dge-side h3')]
        .find((x) => x.textContent.trim() === 'name');
      const i = h && h.parentElement.querySelector('input');
      if (!i) return;
      i.value = val;
      i.dispatchEvent(new Event('change', { bubbles: true }));
    }, v);
    await page.waitForTimeout(430);
  };

  ok(await ed.clickPath(`${g('wa-1')} path.dg-stroke`), 'message 2 again');
  ok(await ed.selection() === 'message wa-1', 'the message is selected', await ed.selection());
  const idField = await nameField();
  note('name field: ' + JSON.stringify(idField));
  ok(!!idField && idField.value === '' && idField.placeholder === 'wa-1',
    'an anonymous message shows its generated id as a placeholder and nothing as a value',
    JSON.stringify(idField));

  // A tail edit, which is the act that used to pin a name into the line.
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('#dge-side .dge-chip')].find((x) => x.textContent.includes('+ tag'));
    if (b) { window.prompt = () => 'probe'; b.click(); }
  });
  await page.waitForTimeout(430);
  let seqMsg = await ed.lineWith('request registration options');
  note('after a tag: ' + seqMsg);
  ok(/@probe/.test(seqMsg || ''), 'the tag lands in the tail', seqMsg);
  ok(/^\s*br\s+->\s+rp\b/.test(seqMsg || ''),
    'and no name token appears in front of the first endpoint', seqMsg);
  ok(!(await ed.problems()).includes('line '), 'the block compiles', await ed.problems());

  // Naming it is the author's act, and it is one insertion in the slot the
  // span table points at.
  await setName('reqopts');
  seqMsg = await ed.lineWith('request registration options');
  note('named     : ' + seqMsg);
  ok(/^\s*reqopts\s+br\s+->\s+rp\b/.test(seqMsg || ''),
    'typing a name writes it in front of the from-token', seqMsg);
  ok(await ed.selection() === 'message reqopts', 'and the selection follows it',
    await ed.selection());
  ok(!(await ed.problems()).includes('line '), 'the block compiles', await ed.problems());

  await setName('reqopt2');
  seqMsg = await ed.lineWith('request registration options');
  ok(/^\s*reqopt2\s+br\s+->\s+rp\b/.test(seqMsg || ''), 'and renaming rewrites that token', seqMsg);

  await setName('');
  seqMsg = await ed.lineWith('request registration options');
  ok(/^\s*br\s+->\s+rp\b/.test(seqMsg || ''),
    'clearing an optional name takes the token off again', seqMsg);
  ok(!/ {2}br/.test((seqMsg || '').replace(/^\s+/, ' ')),
    'and leaves no double space behind', JSON.stringify(seqMsg));
  ok(!(await ed.problems()).includes('line '), 'the block compiles', await ed.problems());

  // ── a rename is one edit, declaration and references together ─────
  //
  // #seqmore is the figure that needs it: the brace is hung off the message's
  // own name precisely because a generated one would wander. Renaming the
  // message has to take the brace with it or the block stops compiling – which
  // is the thing a text editor gets wrong and this control exists to get right.
  await page.evaluate(() => dgeClose());
  await page.waitForTimeout(400);
  await walkTo('seqmore');
  ok(await ed.open('seqmore'), 'the editor is open on #seqmore');
  await ed.beat(0);
  ok(await ed.clickPath('#dge-art-svg [id$="-tunnel"] path.dg-stroke'),
    'the named message is on the canvas');
  ok(await ed.selection() === 'message tunnel', 'and selects as itself', await ed.selection());
  const named = await nameField();
  ok(!!named && named.value === 'tunnel',
    'a named message shows its own name as the value', JSON.stringify(named));

  await setName('payload');
  const msg2 = await ed.lineWith('encrypted tunnel');
  const braceLine = await ed.lineWith('brace tun');
  note('message: ' + msg2 + '\n    brace  : ' + braceLine);
  ok(/^\s*payload\s+c\s+--\s+s\b/.test(msg2 || ''), 'the declaration is rewritten', msg2);
  ok(/\bover payload\b/.test(braceLine || ''),
    'and so is the line that names it, in the same edit', braceLine);
  ok(/"encrypted tunnel, end to end"/.test(msg2 || ''),
    'while the word inside the quoted label is left alone', msg2);
  ok(!(await ed.problems()).includes('line '), 'the block compiles', await ed.problems());

  // The three refusals, none of which touches the source.
  const beforeBad = await ed.source();
  await setName('c');
  ok(await ed.source() === beforeBad, 'a name already taken is refused', await ed.lineWith('c --'));
  await setName('2fast');
  ok(await ed.source() === beforeBad, 'and so is one the grammar would not accept');
  await setName('constructor');
  ok(await ed.source() === beforeBad, 'and so is one that shadows Object.prototype');
  ok(!(await ed.problems()).includes('line '), 'and the block was never broken', await ed.problems());
}
