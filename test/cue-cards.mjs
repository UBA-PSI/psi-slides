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

## free: Last {#last}

The end.
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
    card: cue.card, seg: cue.seg,
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
  ok(await spk.evaluate(() => document.getElementById('cue-btn').getAttribute('aria-pressed')) === 'true', 'the footer button shows pressed');

  let c = await cursor();
  ok(c.card === 0 && c.seg === 0 && /one.*two/.test(c.cur), 'the cursor opens on the first card of beat 1', JSON.stringify(c));
  ok(c.n === 6, 'the column lists two cards, a reveal, a card, a reveal, the next slide', JSON.stringify(c));

  // Space × 6 through the chunk: card, card, reveal, card, reveal, slide
  const walk = [];
  for (let i = 0; i < 6; i++) { await press('Space'); walk.push({ ...(await both()), c: await cursor() }); }
  ok(walk.every(w => w.same), 'after every Space the projection and the cockpit agree on slide and reveal', JSON.stringify(walk.map(w => [w.a.rev, w.s.rev])));
  ok(walk[0].s.rev === 1 && /three/.test(walk[0].c.cur), 'first Space: the second card, the room saw nothing', JSON.stringify(walk[0]));
  ok(walk[1].s.rev === 1 && /reveal 1/.test(walk[1].c.cur), 'second: the cards are said, the reveal is next', JSON.stringify(walk[1]));
  ok(walk[2].s.rev === 2 && /four/.test(walk[2].c.cur) && walk[2].c.seg === 1 && walk[2].c.card === 0, 'third: the room got its reveal, the cursor is on beat 2 card 1', JSON.stringify(walk[2]));
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

  // the drift: the card marked @0:00 was said, so the clock is behind it
  // by however long it has run
  await press('ArrowLeft');
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

  ok(errors.length === 0, 'no page errors in either window', errors.join(' | '));
  await spk.close();
  await aud.close();
  server.close();
}
