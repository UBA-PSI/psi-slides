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

# The part

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

## free: Warn {#warn}

Opening.

---

> note: **alone, and a beat follows**

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
`;

function buildFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-cue-'));
  fs.writeFileSync(path.join(dir, 'source.md'), SOURCE);
  const r = spawnSync(process.execPath, [path.join(ROOT, 'build.js'), path.join(dir, 'source.md')],
    { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) throw new Error('fixture build failed:\n' + r.stdout + r.stderr);
  const lint = spawnSync(process.execPath, [path.join(ROOT, 'lint.js'), path.join(dir, 'source.md')],
    { cwd: ROOT, encoding: 'utf8' });
  return { dir, speaker: fs.readFileSync(path.join(dir, 'speaker.html'), 'utf8'), lint: lint.stdout + lint.stderr };
}

const segsOf = (html, id) =>
  [...html.matchAll(new RegExp('<template data-cards-for="' + id + '" data-seg="(\\d+)">', 'g'))].map(m => Number(m[1]));

export async function run({ page, report }) {
  const { ok } = report;
  const { dir, speaker, lint } = buildFixture();

  // ── the parser's position rule, read off the built page ──────────
  ok(JSON.stringify(segsOf(speaker, 'three')) === '[0,1]', 'a note before the first --- is segment 0, one after it segment 1', JSON.stringify(segsOf(speaker, 'three')));
  ok(JSON.stringify(segsOf(speaker, 'legacy')) === '[0,0]', 'notes that all sit in the last segment are chunk notes on segment 0', JSON.stringify(segsOf(speaker, 'legacy')));
  ok(JSON.stringify(segsOf(speaker, 'empty')) === '[0,1]', 'a note alone behind the last --- slides back to the previous segment', JSON.stringify(segsOf(speaker, 'empty')));
  ok(JSON.stringify(segsOf(speaker, 'pane')) === '[0]', 'a note inside a pane takes the segment the pane stands in', JSON.stringify(segsOf(speaker, 'pane')));
  ok(JSON.stringify(segsOf(speaker, 'warn')) === '[0]', 'a note alone in a middle segment slides back too', JSON.stringify(segsOf(speaker, 'warn')));
  ok(/note-in-empty-beat/.test(lint) && (lint.match(/note-in-empty-beat/g) || []).length === 1,
     'and lint.js names exactly that one as note-in-empty-beat', lint.trim().split('\n').filter(l => /note-in/.test(l)).join(' | '));
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

  // Space × 6 through the chunk: card, card, reveal, card, reveal, slide
  const walk = [];
  for (let i = 0; i < 6; i++) { await press('Space'); walk.push({ ...(await both()), c: await cursor() }); }
  ok(walk.every(w => w.same), 'after every Space the projection and the cockpit agree on slide and reveal', JSON.stringify(walk.map(w => [w.a.rev, w.s.rev])));
  ok(walk[0].s.rev === 1 && /three/.test(walk[0].c.cur), 'first Space: the second card, the room saw nothing', JSON.stringify(walk[0]));
  ok(walk[1].s.rev === 1 && /reveal 1/.test(walk[1].c.cur), 'second: the cards are said, the reveal is next', JSON.stringify(walk[1]));
  ok(walk[2].s.rev === 2 && /four/.test(walk[2].c.cur) && walk[2].c.beat === 1 && walk[2].c.card === 0, 'third: the room got its reveal, the cursor is on beat 2 card 1', JSON.stringify(walk[2]));
  ok(walk[3].s.rev === 2 && /reveal 2/.test(walk[3].c.cur), 'fourth: beat 2 said, the second reveal is next', JSON.stringify(walk[3]));
  ok(walk[4].s.rev === 3 && /slide/.test(walk[4].c.cur), 'fifth: the last reveal, and the next slide is what is left', JSON.stringify(walk[4]));
  ok(walk[5].s.id === 'legacy' && walk[5].c.card === 0, 'sixth: the next slide, cursor on its first card', JSON.stringify(walk[5]));
  ok(walk[5].c.n === 4 && /legacy one/.test(walk[5].c.cur), 'the legacy chunk shows both end-notes on beat 1, then its reveal', JSON.stringify(walk[5].c));

  // Backspace × 6 undoes them one by one
  const back = [];
  for (let i = 0; i < 6; i++) { await press('Backspace'); back.push({ ...(await both()), c: await cursor() }); }
  ok(back.every(w => w.same), 'and after every Backspace', JSON.stringify(back.map(w => [w.a.rev, w.s.rev])));
  ok(back[0].s.id === 'three' && back[0].s.rev === 3 && /slide/.test(back[0].c.cur), 'back: the previous slide, fully revealed, cursor past its cards', JSON.stringify(back[0]));
  ok(back[1].s.rev === 2 && /reveal 2/.test(back[1].c.cur), 'back again: the last reveal is taken back and is next again', JSON.stringify(back[1]));
  ok(back[2].s.rev === 2 && /four/.test(back[2].c.cur) && back[2].c.card === 0, 'then the card of beat 2', JSON.stringify(back[2]));
  ok(back[3].s.rev === 1 && /reveal 1/.test(back[3].c.cur), 'then the first reveal', JSON.stringify(back[3]));
  ok(back[5].s.rev === 1 && back[5].c.card === 0 && /one.*two/.test(back[5].c.cur), 'six back: on the first card of beat 1 again', JSON.stringify(back[5]));

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
  for (let i = 0; i < 6; i++) { fig.push({ ...(await both()), c: await cursor() }); await press('Space'); }
  ok(fig.every(w => w.same), 'the two windows agree through a stepped figure', JSON.stringify(fig.map(w => [w.a.rev, w.s.rev])));
  ok(/on the opening beat/.test(fig[0].c.cur), 'the unpinned note opens it', JSON.stringify(fig[0].c));
  ok(/step 1/.test(fig[1].c.cur), 'then the first step, as its own entry', JSON.stringify(fig[1].c));
  ok(fig[2].s.rev === 2 && /after the first step/.test(fig[2].c.cur),
     'then the card pinned to from 1, with the figure already advanced', JSON.stringify(fig[2]));
  ok(/step 2/.test(fig[3].c.cur), 'then the second step', JSON.stringify(fig[3].c));
  ok(fig[4].s.rev === 3 && /after the second step/.test(fig[4].c.cur),
     'then the card pinned to from 2', JSON.stringify(fig[4]));
  ok(await spk.evaluate(() => !!document.querySelector('.cue-step .cue-what')),
     'a figure beat shows the step name the author gave it');

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

  ok(errors.length === 0, 'no page errors in either window', errors.join(' | '));
  await spk.close();
  await aud.close();
  server.close();
}
