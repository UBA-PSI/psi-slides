/*
 * The cockpit's cue cards: a cursor in front of the reveal counter.
 *
 * The one property that matters is that the audience never learns the
 * cards exist. Space in the cockpit says a card, and only when the beat's
 * cards are used up does the press reach the counter both windows share -
 * so after every press, `revealed` and `activeIdx` have to agree between
 * the projection and the cockpit, and the cards have to be where the
 * cursor says. That needs two windows on one deck, which is why this spec
 * builds a fixture and opens the cockpit from the projection with S rather
 * than driving speaker.html alone.
 *
 * The fixture also carries the parser's position rule (which segment a
 * `> note:` belongs to, and the two fallbacks around it) and the linter's
 * mirror of it, read off the built page and off lint.js rather than
 * asserted in the browser - they are decided at build time, but they need
 * `parseLecture`, which the zero-dep gates cannot load.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, serve } from './harness.mjs';

export const name = 'cue cards · cockpit';
export const lecture = 'tutorial';

const SOURCE = `---
title: Cue cards
---

# The part {#part}

> note: The divider's own card: **said while the part title is still up**.

> note: from 1
> **after the divider's own beat**

A divider is a slide the speaker talks on, so what is written here is its own.

---

A second beat of the divider.

## title: Cue cards {#t}

## free: Three beats {#three}

First segment on the slide.

> note: Said while the slide opens: **one** and **two**.
>
> The second card of the first beat: **three**.

---

Second segment arrives.

> note: #### After the first click
> @0:00 The card that carries a mark: **four**.

---

Third segment arrives.

## free: Legacy {#legacy}

Opening text.

---

More text.

> note: Written at the end, the way every deck did: **legacy one**.

> note: And a second block there: **legacy two**.

## free: Empty last {#empty}

Opening text.

> note: **on beat one**

---

Second.

---

::: footnote
the source for the line above
:::

> note: **alone behind the last separator**

## free: Pane {#pane}

::: side
Left words.

> note: **inside a pane**

::: flip
Right words.
:::

---

After.

## free: Middle {#middle}

Opening.

---

> note: **alone, and a beat follows**

---

Last.

## free: Nothing on it {#dead}

Opening.

---

---

Last.

## figure: Steps {#steps}

::: draw 120x40
box a "A" at 0,0
box b "B" right of a gap 0.6
box c "C" right of b gap 0.6
edge a -> b
edge b -> c

step second
  show b
step third
  show c
:::

> note: **on the opening beat**, before either step

> note: from 1
> **after the first step**

> note: from 2
> **after the second step**

## free: Pinned too far {#toofar}

Only one beat here.

---

Second.

> note: from 5
> **pinned past the end**

## free: Named after the cockpit {#cue-panel}

A lecture may name a chunk anything, including what the cockpit calls its
own furniture. The chunks are in the cockpit's document too, inside the
mirror, so this one used to win getElementById against the panel.

## free: Last {#last}

The end.

## free: Pinned {#pinned}

Opens with the slide.

> note: Said as the slide opens.

--- from 2

> note: Said on the second press, not the first.

Arrives on the second press.

## free: Clicks {#clicks}

Opens with the slide.

> note: Said while the slide opens: **zero**.
>
> [Klick: the second line lights.]
>
> **one after the first click**
>
> [Pause.]
>
> [Klick: the third line lights.]
>
> **two after the second click**

---

The second line.

---

The third line.

## free: Too many clicks {#tooclicks}

One beat and nothing else.

> note: **a**
>
> [Klick: nothing left to light.]
>
> **b**
>
> [Klick: still nothing.]
>
> **c**

## question: How many hold this up? {#lead}

---

One. Perhaps two.

> note: **said while the heading stands alone**

> note: from 1
> **said once the answer is up**
`;

function buildFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-cue-'));
  fs.writeFileSync(path.join(dir, 'source.md'), SOURCE);
  const r = spawnSync(process.execPath, [path.join(ROOT, 'build.js'), path.join(dir, 'source.md')],
    { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) throw new Error('fixture build failed:\n' + r.stdout + r.stderr);
  const lint = spawnSync(process.execPath, [path.join(ROOT, 'lint.js'), path.join(dir, 'source.md')],
    { cwd: ROOT, encoding: 'utf8' });
  return { dir,
           speaker: fs.readFileSync(path.join(dir, 'speaker.html'), 'utf8'),
           printNotes: fs.readFileSync(path.join(dir, 'print-notes.html'), 'utf8'),
           lint: lint.stdout + lint.stderr };
}

const segsOf = (html, id) =>
  [...html.matchAll(new RegExp('<template data-cards-for="' + id + '" data-seg="(\\d+)">', 'g'))].map(m => Number(m[1]));

export async function run({ page, report }) {
  const { ok } = report;
  const { dir, speaker, printNotes, lint } = buildFixture();

  // ── the parser's position rule, read off the built page ──────────
  ok(JSON.stringify(segsOf(speaker, 'three')) === '[0,1]', 'a note before the first --- is segment 0, one after it segment 1', JSON.stringify(segsOf(speaker, 'three')));
  ok(JSON.stringify(segsOf(speaker, 'legacy')) === '[0,0]', 'notes that all sit in the last segment are chunk notes on segment 0', JSON.stringify(segsOf(speaker, 'legacy')));
  ok(JSON.stringify(segsOf(speaker, 'empty')) === '[0,2]', 'a note alone behind the last --- is filed on that beat, not on the one before it', JSON.stringify(segsOf(speaker, 'empty')));
  ok(JSON.stringify(segsOf(speaker, 'pane')) === '[0]', 'a note inside a pane takes the segment the pane stands in', JSON.stringify(segsOf(speaker, 'pane')));
  ok(JSON.stringify(segsOf(speaker, 'middle')) === '[1]', 'a note alone in a middle segment is filed on that segment', JSON.stringify(segsOf(speaker, 'middle')));
  // The aside written under the same separator carries the same number, so
  // the two arrive together: the footnote on the projection, the card in
  // the cockpit, on the press the author wrote the --- for.
  ok(/<aside class="margin-note[^"]*" data-seg="2"/.test(speaker),
     'and a ::: footnote written in that segment carries its number too',
     (/<aside class="margin-note[^>]*>/.exec(speaker) || [''])[0]);
  ok(/window\.PSI_CARDS/.test(speaker), 'the page carries the card grammar');

  // ── the from-pin: the escape hatch for a diagram's steps ─────────
  const pinsOf = (id) =>
    [...speaker.matchAll(new RegExp('<template data-cards-for="' + id + '" data-(at|seg)="(\\d+)">', 'g'))]
      .map(m => m[1] + m[2]);
  ok(JSON.stringify(pinsOf('steps')) === JSON.stringify(['seg0', 'at1', 'at2']),
     'a note that writes from N is filed by that number, not by its position', JSON.stringify(pinsOf('steps')));
  ok(/note-from-beyond/.test(lint) && (lint.match(/note-from-beyond/g) || []).length === 1,
     'and lint.js warns once when the number is past the chunk\'s last beat',
     lint.trim().split('\n').filter(l => /note-from/.test(l)).join(' | '));

  // ── a note under a # heading belongs to the divider ──────────────
  // It used to be an orphan and arrived as the first card of the chunk after
  // it: the sentence that says what the part is for was said one slide late,
  // and nothing anywhere reported it. A divider has no top-level segments -
  // a `---` under a heading is a beat marker inside one body - so an
  // unpinned block is a chunk note on beat 0 and `from N` names a later one.
  // ── a leading --- is the heading alone on beat 0 ─────────────────
  // The chunk a question slide is written as: heading, `---`, the answer.
  // The empty opening segment used to be dropped, so the answer arrived
  // with the question and a note pinned to from 1 could never fire. Kept,
  // the source's count of `---` is the deck's count of clicks.
  ok(JSON.stringify(pinsOf('lead')) === JSON.stringify(['seg0', 'at1']),
     'a note before a leading --- is beat 0 and the one pinned to from 1 is beat 1',
     JSON.stringify(pinsOf('lead')));
  // The other half of the same rule: every `---` is a beat, so what is left
  // to report is a beat with nothing whatever on it. The fixture has exactly
  // one - the second separator of #dead - and neither #lead's leading one,
  // nor #empty's trailing one with its footnote and its note, nor #middle's
  // with a note on it, is that.
  ok((lint.match(/empty-beat/g) || []).length === 1,
     'lint.js names the one --- of the fixture that buys a click with nothing on it',
     lint.trim().split('\n').filter(l => /empty-beat/.test(l)).join(' | '));

  ok(JSON.stringify(pinsOf('part-section')) === JSON.stringify(['seg0', 'at1']),
     'a note under a # heading is the divider\'s, on beat 0 or on the beat it pins itself to',
     JSON.stringify(pinsOf('part-section')));
  ok(/<template data-notes-for="part-section">/.test(speaker),
     'and the cockpit\'s notes pane finds it under the divider\'s own id');
  ok(!/data-notes-for="t"/.test(speaker),
     'the chunk that follows the divider gets none of it');
  ok(/class="column-heading">The part<\/h1>[\s\S]{0,4000}?speaker-note[\s\S]{0,400}?still up/.test(printNotes),
     'print-notes.html carries it under the part title');
  ok(!/\s+error\s+\S/.test(lint), 'and the linter says nothing about it', lint.split('\n')[0]);

  // ── two windows on the fixture ───────────────────────────────────
  const { server, port } = await serve(dir);
  const aud = await page.context().newPage();
  const errors = [];
  aud.on('pageerror', e => errors.push('audience: ' + e));
  await aud.goto('http://127.0.0.1:' + port + '/audience.html', { waitUntil: 'load' });
  await aud.waitForTimeout(600);
  const [spk] = await Promise.all([aud.context().waitForEvent('page'), aud.keyboard.press('s')]);
  spk.on('pageerror', e => errors.push('cockpit: ' + e));
  await spk.waitForLoadState();
  await spk.waitForTimeout(900);
  await spk.bringToFront();

  const both = async () => {
    const read = (p) => p.evaluate(() => ({ idx: state.activeIdx, id: flatChunks[state.activeIdx].id, rev: revealed[flatChunks[state.activeIdx].id] ?? null }));
    const [a, s] = await Promise.all([read(aud), read(spk)]);
    return { a, s, same: a.idx === s.idx && a.rev === s.rev };
  };
  const cursor = () => spk.evaluate(() => ({
    card: cue.card, beat: cue.beat,
    cur: (document.querySelector('.cue-entry.cur') || {}).textContent?.replace(/\s+/g, ' ').trim().slice(0, 60) || null,
    n: document.querySelectorAll('.cue-entry').length,
  }));
  const press = async (k, wait = 260) => { await spk.keyboard.press(k); await spk.waitForTimeout(wait); };

  // reach #three in the classic cockpit first
  for (let i = 0; i < 10; i++) {
    if ((await both()).s.id === 'three') break;
    await press('ArrowDown', 120);
  }
  ok((await both()).s.id === 'three', 'the cockpit reaches the three-beat chunk');

  ok(!(await spk.evaluate(() => document.body.classList.contains('cue-cards'))), 'the cockpit opens classic');
  await press('k', 400);
  ok(await spk.evaluate(() => document.body.classList.contains('cue-cards')), 'K turns the cue cards on');
  ok(await spk.evaluate(() => localStorage.getItem('psi-slides:cue-cards')) === 'on', 'and remembers it');
  ok(await spk.evaluate(() => document.getElementById('clock').closest('#cue-where') !== null), 'the clock moved into the column header');
  ok(await spk.evaluate(() => {
    const c = document.getElementById('clock').getBoundingClientRect();
    const h = document.getElementById('cue-where').getBoundingClientRect();
    return c.top >= h.top - 0.5 && c.bottom <= h.bottom + 0.5 && c.height > 18;
  }), 'and stands inside that header rather than clipped by it');
  ok(await spk.evaluate(() => document.getElementById('cue-btn').getAttribute('aria-pressed')) === 'true', 'the footer button shows pressed');

  let c = await cursor();
  ok(c.card === 0 && c.beat === 0 && /one.*two/.test(c.cur), 'the cursor opens on the first card of beat 1', JSON.stringify(c));
  ok(c.n === 6, 'the column lists two cards, a reveal, a card, a reveal, the next slide', JSON.stringify(c));

  // Space × 4 through the chunk: the second card, then the press on the
  // last card of a beat goes straight to the projector - reveal, reveal,
  // slide. No press moves the cursor onto a click and stops there.
  const walk = [];
  for (let i = 0; i < 4; i++) { await press('Space'); walk.push({ ...(await both()), c: await cursor() }); }
  ok(walk.every(w => w.same), 'after every Space the projection and the cockpit agree on slide and reveal', JSON.stringify(walk.map(w => [w.a.rev, w.s.rev])));
  ok(walk[0].s.rev === 1 && /three/.test(walk[0].c.cur), 'first Space: the second card, the room saw nothing', JSON.stringify(walk[0]));
  ok(walk[1].s.rev === 2 && /four/.test(walk[1].c.cur) && walk[1].c.beat === 1 && walk[1].c.card === 0, 'second: on the last card of beat 1 the press is the reveal, and the cursor is on beat 2 card 1', JSON.stringify(walk[1]));
  ok(walk[2].s.rev === 3 && /slide/.test(walk[2].c.cur), 'third: the last reveal, and a beat with no card leaves the next slide as the cursor', JSON.stringify(walk[2]));
  ok(walk[3].s.id === 'legacy' && walk[3].c.card === 0, 'fourth: the next slide, cursor on its first card', JSON.stringify(walk[3]));
  ok(walk[3].c.n === 4 && /legacy one/.test(walk[3].c.cur), 'the legacy chunk shows both end-notes on beat 1, then its reveal', JSON.stringify(walk[3].c));

  // Backspace × 4 undoes them one by one
  const back = [];
  for (let i = 0; i < 4; i++) { await press('Backspace'); back.push({ ...(await both()), c: await cursor() }); }
  ok(back.every(w => w.same), 'and after every Backspace', JSON.stringify(back.map(w => [w.a.rev, w.s.rev])));
  ok(back[0].s.id === 'three' && back[0].s.rev === 3 && /slide/.test(back[0].c.cur), 'back: the previous slide, fully revealed, its cardless last beat', JSON.stringify(back[0]));
  ok(back[1].s.rev === 2 && /four/.test(back[1].c.cur) && back[1].c.card === 0, 'back again: the last reveal is taken back, the cursor on the card said over it', JSON.stringify(back[1]));
  ok(back[2].s.rev === 1 && /three/.test(back[2].c.cur) && back[2].c.card === 1, 'then the first reveal, landing on the LAST card of beat 1', JSON.stringify(back[2]));
  ok(back[3].s.rev === 1 && back[3].c.card === 0 && /one.*two/.test(back[3].c.cur), 'four back: on the first card of beat 1 again', JSON.stringify(back[3]));

  // Enter skips the cards
  await press('Enter');
  let b = await both();
  ok(b.same && b.s.id === 'legacy' && b.s.rev === 1, 'Enter goes to the next slide, both windows', JSON.stringify(b));
  await press('ArrowLeft');
  await press('ArrowRight');
  c = await cursor();
  ok((await both()).s.id === 'legacy' && c.card === 0, 'an arrow onto a slide puts the cursor on its first card', JSON.stringify(c));

  // ── a diagram's steps carry cards ───────────────────────────────
  // The case the pin exists for: three beats that are figure steps, with a
  // card on each. No separator line can sit between two steps, so before
  // the pin every card of such a chunk landed on the opening beat.
  for (let i = 0; i < 30; i++) {
    if ((await both()).s.id === 'steps') break;
    await press('ArrowDown', 90);
  }
  ok((await both()).s.id === 'steps', 'the cockpit reaches the stepped figure');
  const fig = [];
  for (let i = 0; i < 3; i++) { fig.push({ ...(await both()), c: await cursor() }); await press('Space'); }
  ok(fig.every(w => w.same), 'the two windows agree through a stepped figure', JSON.stringify(fig.map(w => [w.a.rev, w.s.rev])));
  ok(/on the opening beat/.test(fig[0].c.cur), 'the unpinned note opens it', JSON.stringify(fig[0].c));
  ok(fig[0].c.n === 6, 'the column lists each step as its own entry between the cards', JSON.stringify(fig[0].c));
  ok(fig[1].s.rev === 2 && /after the first step/.test(fig[1].c.cur),
     'one press: the first step, and the card pinned to from 1 with it', JSON.stringify(fig[1]));
  ok(fig[2].s.rev === 3 && /after the second step/.test(fig[2].c.cur),
     'one more: the second step and the card pinned to from 2', JSON.stringify(fig[2]));
  ok(await spk.evaluate(() => !!document.querySelector('.cue-step .cue-what')),
     'a figure beat shows the step name the author gave it');

  // ── a [Klick ...] line in a note is a beat ───────────────────────
  // The other half of the same problem, and the one a whole keynote is
  // written in: the stage directions are already in the prose, so the
  // author writes no `from N` at all and the cockpit used to show the
  // whole block on the opening beat. Each click files the cards behind it
  // one advance on, which is the arithmetic `from N` does by hand.
  await spk.evaluate(() => jumpTo(flatChunks.findIndex(e => e.id === 'clicks')));
  await spk.waitForTimeout(400);
  ok((await both()).s.id === 'clicks', 'the cockpit reaches the chunk whose note carries clicks');
  const clicks = [];
  // Three presses, four states: a fourth press on the last card would be
  // the one that leaves the slide.
  for (let i = 0; i < 4; i++) { clicks.push({ ...(await both()), c: await cursor() }); if (i < 3) await press('Space'); }
  ok(clicks.every(w => w.same), 'the two windows agree through it', JSON.stringify(clicks.map(w => [w.a.rev, w.s.rev])));
  ok(clicks[0].c.n === 7,
     'the column lists a card, a reveal, two cards, a reveal, a card, the next slide',
     JSON.stringify(clicks[0].c));
  ok(clicks[0].s.rev === 1 && /zero/.test(clicks[0].c.cur), 'the card before the first click opens the slide', JSON.stringify(clicks[0].c));
  ok(clicks[1].s.rev === 2 && /after the first click/.test(clicks[1].c.cur) && clicks[1].c.beat === 1,
     'the press on it is the click, and the card written behind the click arrives with the reveal it names', JSON.stringify(clicks[1]));
  ok(/Pause/.test(clicks[2].c.cur) && clicks[2].s.rev === 2,
     'a bracketed line that is not a click is a card of its own on the same beat', JSON.stringify(clicks[2]));
  ok(clicks[3].s.rev === 3 && /after the second/.test(clicks[3].c.cur) && clicks[3].c.beat === 2,
     'and the card behind the second click arrives with it', JSON.stringify(clicks[3]));
  ok(await spk.evaluate(() => [...document.querySelectorAll('.cue-title')].some(t => /the third line lights/.test(t.textContent))),
     'the words of the click title the card it brings up');
  ok(/note-advance-beyond/.test(lint) && (lint.match(/note-advance-beyond/g) || []).length === 1,
     'and lint.js names the one chunk that asks for more clicks than it has beats',
     lint.trim().split('\n').filter(l => /note-advance/.test(l)).join(' | '));

  // ── the heading alone on beat 0, in both windows ─────────────────
  // The build ships an empty opening segment for a leading `---`; what has
  // to be true in the page is that it is a beat and not a block. The slide
  // opens with the heading and nothing else, one press paints the answer,
  // and the note pinned to from 1 is filed on that press rather than past
  // the end of the slide.
  await spk.evaluate(() => jumpTo(flatChunks.findIndex(e => e.id === 'lead')));
  await spk.waitForTimeout(400);
  ok((await both()).s.id === 'lead', 'the cockpit reaches the question slide');
  const shape = await aud.evaluate(() => {
    const el = document.getElementById('lead');
    const segs = [...el.querySelectorAll('.reveal-segment')];
    return {
      n: segs.length,
      empty: segs[0].hasAttribute('data-empty') && segs[0].textContent.trim() === '',
      total: countSegments(el),
      painted: segs.filter(s => !s.hasAttribute('data-hidden')).map(s => s.textContent.trim()),
    };
  });
  ok(shape.n === 2 && shape.empty, 'the slide carries an empty opening segment and the answer behind it', JSON.stringify(shape));
  ok(shape.total === 2, 'the projection counts two positions on it, so the press exists', JSON.stringify(shape));
  ok(shape.painted.join('') === '', 'and beat 0 paints nothing below the heading', JSON.stringify(shape.painted));
  const lead0 = await cursor();
  ok(/stands alone/.test(lead0.cur), 'the cockpit opens on the card said while the heading stands alone', JSON.stringify(lead0));
  ok(lead0.n === 4, 'and the column is that card, the press, the pinned card, the next slide', JSON.stringify(lead0));
  // One press: the card is the last of its beat, so the press it is said
  // over is the one that clicks.
  await press('Space');
  const lead1 = { ...(await both()), c: await cursor() };
  ok(lead1.same && lead1.s.rev === 2, 'one press, and both windows are on the answer', JSON.stringify(lead1));
  ok(/once the answer is up/.test(lead1.c.cur), 'and the note pinned to from 1 is the card it brings up', JSON.stringify(lead1.c));
  ok((await aud.evaluate(() => {
    const segs = [...document.getElementById('lead').querySelectorAll('.reveal-segment')];
    return segs[1].hasAttribute('data-hidden');
  })) === false, 'the answer is on the projection');

  // ── a beat that paints nothing still carries what rides it ───────
  // The idiom five slides of a real keynote are written in: a `---`, then a
  // ::: footnote and a `> note:` and nothing else. The slide stands, the
  // source line comes up under it, and the speaker says the next thing. The
  // segment used to be dropped and the press with it.
  // The walk above has already been through this chunk, so put its counter
  // back to the state the slide opens in before reading what is on it.
  await aud.evaluate(() => { revealed.empty = 1; applyRevealAll(); });
  await spk.evaluate(() => { revealed.empty = 1; jumpTo(flatChunks.findIndex(e => e.id === 'empty')); });
  await spk.waitForTimeout(400);
  ok((await both()).s.id === 'empty', 'the cockpit reaches the chunk whose last beat paints nothing');
  const noteState = () => aud.evaluate(() => {
    const el = document.getElementById('empty');
    const segs = [...el.querySelectorAll('.reveal-segment')];
    const fn = el.querySelector('.margin-note[data-seg]');
    return { n: segs.length, total: countSegments(el),
             empty: segs[2] && segs[2].hasAttribute('data-empty'),
             footnote: fn ? !fn.hasAttribute('data-beat-hidden') : null };
  });
  const emp0 = await noteState();
  ok(emp0.n === 3 && emp0.empty && emp0.total === 3,
     'the slide carries three segments, the last of them empty, and counts three positions', JSON.stringify(emp0));
  ok(emp0.footnote === false, 'the footnote is held back while the slide opens', JSON.stringify(emp0));
  // Walked rather than counted, because a card sits in front of each press
  // and how many of them a beat has is the fixture's business, not this
  // assertion's: what has to be true is that the card written under the
  // last `---` comes up on this slide, with the footnote and the third
  // position, and not one slide on.
  const walkEmpty = [];
  for (let i = 0; i < 4; i++) { await press('Space'); walkEmpty.push({ ...(await both()), c: await cursor(), s2: await noteState() }); }
  const trail = JSON.stringify(walkEmpty.map(w => [w.s.id, w.s.rev, w.c.cur]));
  ok(walkEmpty.every(w => w.same), 'the two windows agree through the chunk', trail);
  const said = walkEmpty.find(w => /alone behind the last separator/.test(w.c.cur || ''));
  ok(said && said.s.id === 'empty' && said.s.rev === 3,
     'the note written under the last --- is the card of the chunk\'s last beat', trail);
  ok(said && said.s2.footnote === true,
     'and the footnote written under the same --- has arrived with it', trail);

  // the two buttons that scale the cards, persisted like the notes zoom
  const size = () => spk.evaluate(() => parseFloat(getComputedStyle(document.getElementById('cue-rail')).fontSize));
  const s0 = await size();
  await spk.click('#cue-zoom-in');
  await spk.waitForTimeout(150);
  const s1 = await size();
  ok(s1 > s0, 'the + button makes the cards larger', s0 + ' -> ' + s1);
  ok(await spk.evaluate(() => localStorage.getItem('psi-slides:cue-scale')) !== null, 'and remembers the size');
  await spk.click('#cue-zoom-out');
  await spk.waitForTimeout(150);
  ok(Math.abs((await size()) - s0) < 0.5, 'the minus button takes it back', String(await size()));

  // ── the mirror is in the strip, and there is only one of it ──────
  ok(await spk.evaluate(() => document.getElementById('stage-cell').parentElement.id === 'preview-strip'),
     'the mirror sits inside the preview strip, in the place of the current thumbnail');
  ok(await spk.evaluate(() => {
    const cur = document.querySelector('.preview-slot.current');
    return !cur || getComputedStyle(cur).display === 'none';
  }), 'and that thumbnail is not drawn, so the slide is on screen once');

  // the drift: the card marked @0:00 was said, so the clock is behind it
  // by however long it has run. #three is the chunk that carries the mark,
  // so walk back to it rather than assuming where the last section left off.
  // Arriving from further on shows the slide fully revealed, so every card
  // of it is said and the mark of the last one that carries a mark is what
  // the clock is measured against - no further presses needed, and three of
  // them would leave the chunk again.
  for (let i = 0; i < 30; i++) {
    if ((await both()).s.id === 'three') break;
    await press('ArrowUp', 90);
  }
  const drift = await spk.evaluate(() => ({ hidden: document.getElementById('drift').hidden, text: document.getElementById('drift').textContent }));
  ok(!drift.hidden && /^[+±−]\d+:\d\d$/.test(drift.text), 'on a card with a time mark the drift stands beside the clock', JSON.stringify(drift));
  await spk.click('#clock');
  await spk.waitForTimeout(200);
  ok(/^0:0[01]$/.test(await spk.evaluate(() => document.getElementById('timer').textContent)), 'a click on the clock restarts it');

  // the laser pointer still travels from the small mirror
  const vp = await spk.locator('#stage-viewport').boundingBox();
  await spk.mouse.move(vp.x + vp.width * 0.5, vp.y + vp.height * 0.5);
  await spk.waitForTimeout(150);
  await spk.mouse.move(vp.x + vp.width * 0.55, vp.y + vp.height * 0.5);
  await spk.waitForTimeout(300);
  const laser = await aud.evaluate(() => ({ on: document.getElementById('laser-pointer').classList.contains('visible'), left: document.getElementById('laser-pointer').style.left }));
  ok(laser.on, 'hovering the small mirror lights the laser on the projection', JSON.stringify(laser));
  await spk.mouse.move(vp.x + vp.width + 300, vp.y + vp.height + 300);
  await spk.waitForTimeout(400);
  ok(!(await aud.evaluate(() => document.getElementById('laser-pointer').classList.contains('visible'))), 'and leaving it puts the laser out');

  // Shift-N is the way back to the textarea
  await spk.keyboard.press('Shift+N');
  await spk.waitForTimeout(300);
  ok(!(await spk.evaluate(() => document.body.classList.contains('cue-cards'))) && await spk.evaluate(() => document.activeElement === document.getElementById('notes-content')),
     'Shift-N leaves the cards and lands in the notes textarea');
  ok(await spk.evaluate(() => document.getElementById('clock').closest('#stage-cell') !== null), 'the clock is back over the stage');
  await spk.keyboard.press('Escape');
  await press('k', 300);
  ok(await spk.evaluate(() => document.body.classList.contains('cue-cards')), 'and K brings the cards back');

  // ── the strip is draggable here, and it takes the mirror with it ──
  const stripW = () => spk.evaluate(() => Math.round(document.getElementById('preview-strip').getBoundingClientRect().width));
  const before = await stripW();
  const handle = await spk.locator('#preview-resizer').boundingBox();
  ok(handle && handle.width < handle.height, 'the resizer stands on the seam as a vertical handle in this mode', JSON.stringify(handle));
  const mirrorBefore = await spk.evaluate(() => Math.round(document.getElementById('stage-cell').getBoundingClientRect().width));
  await spk.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await spk.mouse.down();
  for (let d = 20; d <= 120; d += 20) { await spk.mouse.move(handle.x + handle.width / 2 + d, handle.y + handle.height / 2); await spk.waitForTimeout(40); }
  await spk.mouse.up();
  await spk.waitForTimeout(300);
  const after = await stripW();
  ok(Math.abs((after - before) - 120) <= 4, 'dragging it right widens the strip by what the pointer moved', before + ' -> ' + after);
  ok(await spk.evaluate(() => Math.round(document.getElementById('stage-cell').getBoundingClientRect().width)) > mirrorBefore,
     'and the mirror grows with it, because it is a child of the strip');
  ok(Number(await spk.evaluate(() => localStorage.getItem('psi-slides:cue-strip-width'))) === after, 'the width is remembered');
  await spk.locator('#preview-resizer').dblclick();
  await spk.waitForTimeout(300);
  ok(await stripW() === before, 'and a double-click puts it back', String(await stripW()));

  // ── the cockpit's own ids are not the lecture's ──────────────────
  ok(await spk.evaluate(() => document.querySelectorAll('body > #cue-panel').length === 1
      && document.querySelector('body > #cue-panel').tagName === 'SECTION'),
     'the cue panel is the section, not a chunk that happens to share its name');
  ok(await spk.evaluate(() => {
    const chunk = [...document.querySelectorAll('.chunk')].find(c => c.id === 'cue-panel');
    return !!chunk && getComputedStyle(chunk).display !== 'none';
  }), 'and a chunk carrying that id is still drawn in the mirror');

  // ── the drift is measured against the deck, not the slide ────────
  ok(await spk.evaluate(() => !document.getElementById('drift').hidden),
     'the drift stands beside the clock on a slide that carries no mark of its own');

  // ── every note is reachable on a beat the slide has ────────────────
  // A property rather than a fixture: whatever a chunk's notes are, the map
  // has to file them under a whole number between 0 and the last beat, or
  // nothing reads them back. cueCardsFor filed a pinned segment's cards
  // under NaN once - not nullish, so the `?? 0` beside it looked like a
  // guard and was not - and the cockpit simply had no cards for that beat.
  //
  // #pinned above exists for this: the shape needs a note inside a segment
  // written `--- from N`, and no lecture in the repository has one. The
  // corpus could not have caught it, which is why the deck is built here.
  {
    const audit = await spk.evaluate(() => {
      const out = [];
      let withNotes = 0;
      // One element per id, first occurrence. Not a filter on #preview-strip:
      // cuePlaceStage moves the stage, so which copy is "the stage one"
      // changes mid-session and the filter emptied the list - and an audit
      // over an empty list passes, which is how this check first shipped
      // green while seeing nothing.
      const byId = new Map();
      for (const c of document.querySelectorAll('.chunk')) {
        if (!byId.has(c.dataset.chunkId)) byId.set(c.dataset.chunkId, c);
      }
      const chunks = [...byId.values()];
      for (const el of chunks) {
        const id = el.dataset.chunkId;
        if (!document.querySelectorAll('template[data-cards-for="' + CSS.escape(id) + '"]').length) continue;
        withNotes++;
        // Through cuePosition, not around it: it is what the cockpit calls,
        // and it used to filter every pinned beat out of the list before
        // cueCardsFor could see one - so a check that built the list itself
        // exercised code the cockpit never reaches.
        const p = cuePosition({ el, id });
        const maxC = p.maxC;
        const m = cueCardsFor(id, p.beats, maxC);
        let n = 0;
        for (const [k, v] of m) {
          n += v.length;
          if (!Number.isFinite(k)) out.push(`${id}: filed under ${String(k)}`);
          else if (k < 0 || k > maxC) out.push(`${id}: filed on ${k}, slide has 0..${maxC}`);
        }
        if (!n) out.push(`${id}: has notes and produced no cards`);
      }
      return { out, withNotes };
    });
    ok(audit.withNotes >= 3, 'the audit below actually saw chunks with notes',
       `only ${audit.withNotes}`);
    ok(audit.out.length === 0, 'every chunk\'s notes are filed on a beat the slide has', audit.out.join(' | '));
    const pinned = await spk.evaluate(() => {
      const el = [...document.querySelectorAll('.chunk')].find(c => c.dataset.chunkId === 'pinned');
      if (!el) return { ids: [...document.querySelectorAll('.chunk')].map(c => c.dataset.chunkId) };
      const p = cuePosition({ el, id: 'pinned' });
      const m = cueCardsFor('pinned', p.beats, p.maxC);
      return [...m.keys()].map(Number).sort((a, b) => a - b);
    });
    // Both notes matter: a chunk whose notes all sit in its last segment has
    // them read as chunk notes on the opening beat, which is the rule that
    // keeps every deck written before pinning existed working. So the
    // opening note is what makes the second one's beat the question.
    ok(Array.isArray(pinned) && pinned.length === 2 && pinned[0] === 0 && pinned[1] === 2,
       'a note inside a `--- from 2` segment is filed on beat 2, and the one above it on 0',
       JSON.stringify(pinned));
  }

  // ── no press is a dead one, and each press back undoes one ───────
  // The whole fixture, forward to the end and back to the start. A press
  // that changes nothing the room sees has to have moved the cursor onto
  // the next card of the same beat - it used to be able to move it onto
  // the entry for the click instead, and the click came one press later,
  // which on a rehearsed keynote was one press per beat for nothing. And
  // the walk back has to pass through every state of the walk forward, in
  // reverse, or a press back is not the undo of a press forward.
  {
    for (const p of [aud, spk]) {
      await p.evaluate(() => { Object.keys(revealed).forEach(k => delete revealed[k]); applyRevealAll(); });
    }
    await spk.evaluate(() => { jumpTo(0); cue = { id: null, beat: -1, card: 0 }; cueLast = { idx: -1, pos: 0 }; cueSync(); });
    await spk.waitForTimeout(400);
    const at = async () => {
      const w = await both();
      const c = await spk.evaluate(() => ({ card: cue.card,
        onCard: !!document.querySelector('#cue-rail .cue-entry.cur .cue-card') }));
      return { key: w.s.idx + '/' + w.s.rev + '/' + c.card, idx: w.s.idx, rev: w.s.rev, card: c.card, onCard: c.onCard, same: w.same };
    };
    const fwd = [await at()];
    for (let i = 0; i < 120; i++) {
      await press('Space', 160);
      const now = await at();
      if (now.key === fwd[fwd.length - 1].key) break;
      fwd.push(now);
    }
    const dead = [];
    for (let i = 1; i < fwd.length; i++) {
      const a = fwd[i - 1], b = fwd[i];
      if (a.idx === b.idx && a.rev === b.rev && !(b.card === a.card + 1 && a.onCard && b.onCard)) dead.push(a.key + ' -> ' + b.key);
    }
    const lastIdx = await spk.evaluate(() => flatChunks.length - 1);
    ok(fwd[fwd.length - 1].idx === lastIdx, 'Space alone walks the whole fixture to its last slide', fwd.map(f => f.key).join(' '));
    ok(fwd.every(f => f.same), 'and the two windows agree after every press of it');
    ok(dead.length === 0, 'no press on the way leaves the room unchanged without saying the next card of the same beat', dead.join(' | '));
    const bwd = [];
    for (let i = 0; i < fwd.length - 1; i++) { await press('Backspace', 160); bwd.push(await at()); }
    const want = fwd.slice(0, -1).reverse().map(f => f.key);
    ok(JSON.stringify(bwd.map(b => b.key)) === JSON.stringify(want),
       'Backspace retraces the walk state for state, so each press back undoes exactly one press forward',
       bwd.map(b => b.key).join(' ') + ' vs ' + want.join(' '));
  }

  ok(errors.length === 0, 'no page errors in either window', errors.join(' | '));
  await spk.close();
  await aud.close();
  server.close();
}
