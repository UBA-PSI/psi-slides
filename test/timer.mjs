/*
 * The countdown timer (Shift-T), in the projection and in the cockpit.
 *
 * It is an overlay and a message family of its own, so what this checks is
 * what only a laid-out page can answer: that nothing is in the DOM while no
 * timer is set, that the bar is fixed, 10 px tall and takes no room from the
 * slide (the chunk's box is the same to the pixel before and after), that the
 * input grammar reads 5, 2:30 and 0:45 the way the ? panel says and refuses
 * the rest in the modal, that a slide change leaves it alone, that it
 * crosses to the other window and so does a mute, that expiry adds the alarm
 * state, and that an empty Enter clears it.
 *
 * It builds a deck of its own for the reason test/README.md gives: two plain
 * slides and a clean frontmatter are all it needs, and it opens the cockpit
 * from the projection the way live-sync does.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpDir } from './tmp.mjs';
import { serve, settle, ROOT } from './harness.mjs';

export const name = 'timer · Shift-T countdown in both windows';
export const lecture = 'tutorial';
export const view = 'audience';
// Run alone, after the parallel batch (test/run.mjs): it opens a second window and waits on real seconds.
export const serial = true;

const BODY = `
## title: {#title}

## free: One {#one}

The first plain slide.

## free: Two {#two}

The second plain slide.
`;

const shown = (p) => p.evaluate(() => {
  const n = document.getElementById('psiINT-countdown-num');
  const bar = document.getElementById('psiINT-countdown');
  return n && bar ? { text: n.textContent, done: bar.classList.contains('countdown-done') } : null;
});
const present = (p) => p.evaluate(() => ({
  bar: !!document.getElementById('psiINT-countdown'),
  read: !!document.getElementById('psiINT-countdown-read'),
  modal: !!document.getElementById('psiINT-countdown-modal'),
}));
const setTimer = async (p, text) => {
  await p.bringToFront();
  await p.keyboard.press('Shift+T');
  await p.waitForSelector('#psiINT-countdown-input', { timeout: 2000 });
  await p.keyboard.type(text);
  await p.keyboard.press('Enter');
  await settle(p, 200);
};
const until = (p, fn, arg) => p.waitForFunction(fn, arg, { timeout: 4000, polling: 20 }).then(() => true, () => false);

export async function run({ page, report }) {
  const { ok } = report;
  const errors = [];
  const dir = tmpDir('psi-timer-');
  fs.writeFileSync(path.join(dir, 'source.md'), `---\ntitle: Timer\n---\n${BODY}`);
  const r = spawnSync(process.execPath, [path.join(ROOT, 'build.js'), path.join(dir, 'source.md')],
    { cwd: ROOT, encoding: 'utf8' });
  ok(r.status === 0, 'the fixture deck builds', (r.stdout || '') + (r.stderr || ''));
  if (r.status !== 0) return;

  const { server, port } = await serve(dir);
  const ctx = await page.context().browser().newContext({ viewport: { width: 1440, height: 900 } });
  try {
    const aud = await ctx.newPage();
    aud.on('pageerror', e => errors.push('aud: ' + e));
    await aud.goto(`http://127.0.0.1:${port}/audience.html`, { waitUntil: 'load' });
    await aud.evaluate(() => { try { localStorage.clear(); } catch (e) { /* private window */ } });
    await aud.reload({ waitUntil: 'load' });
    await settle(aud, 600);
    const [spk] = await Promise.all([ctx.waitForEvent('page'), aud.keyboard.press('s')]);
    spk.on('pageerror', e => errors.push('spk: ' + e));
    await spk.waitForLoadState();
    await settle(spk, 900);

    // ── nothing at all without a timer ──
    let p = await present(aud), q = await present(spk);
    ok(!p.bar && !p.read && !p.modal && !q.bar && !q.read, 'no timer: nothing of it is in either window');

    // ── Shift-T opens a text field the slide keys cannot reach ──
    await aud.bringToFront();
    await aud.keyboard.press('Shift+T');
    await aud.waitForSelector('#psiINT-countdown-input', { timeout: 2000 });
    const focus = await aud.evaluate(() => document.activeElement && document.activeElement.id);
    ok(focus === 'psiINT-countdown-input', 'Shift-T opens the modal with its field focused', focus);
    const idxBefore = await aud.evaluate(() => state.activeIdx);
    await aud.keyboard.type('t b ');
    const still = await aud.evaluate(() => ({ idx: state.activeIdx, blanked: state.blanked, toc: !!document.querySelector('#psiINT-toc.open, nav#toc.open') }));
    ok(still.idx === idxBefore && !still.blanked, 'letters typed into the field reach no slide command', JSON.stringify(still));

    // ── invalid input keeps the modal and says why ──
    await aud.fill('#psiINT-countdown-input', '2:75');
    await aud.keyboard.press('Enter');
    const bad = await aud.evaluate(() => ({ modal: !!document.getElementById('psiINT-countdown-modal'), hint: document.getElementById('psiINT-countdown-hint').textContent, bad: document.getElementById('psiINT-countdown-hint').classList.contains('countdown-bad') }));
    ok(bad.modal && bad.bad && /Not a time/.test(bad.hint), 'invalid input shows a hint and the modal stays', JSON.stringify(bad));
    ok(!(await present(aud)).bar, 'and sets nothing');

    // ── Escape closes without change ──
    await aud.keyboard.press('Escape');
    ok(!(await present(aud)).modal, 'Escape closes the modal');

    // ── the chunk's box before and after ──
    const box = () => aud.evaluate(() => {
      const r = document.querySelector('.chunk.active').getBoundingClientRect();
      return [r.x, r.y, r.width, r.height].map(n => Math.round(n * 100) / 100).join(',');
    });
    const before = await box();
    await setTimer(aud, '5');
    const five = await shown(aud);
    ok(five && /^[45]:\d\d$/.test(five.text) && five.text !== '0:00' && /^(5:00|4:59)$/.test(five.text), '"5" sets five minutes', JSON.stringify(five));
    const after = await box();
    ok(after === before, 'the chunk is where it was with the timer up', before + ' -> ' + after);
    const geo = await aud.evaluate(() => {
      const b = document.getElementById('psiINT-countdown'), cs = getComputedStyle(b), r = b.getBoundingClientRect();
      return { pos: cs.position, h: r.height, top: r.top, w: r.width, vw: innerWidth };
    });
    ok(geo.pos === 'fixed' && geo.h === 10 && geo.top === 0 && geo.w === geo.vw, 'the bar is fixed, 10 px tall and spans the top edge', JSON.stringify(geo));

    // ── it reaches the cockpit ──
    ok(await until(spk, () => !!document.getElementById('psiINT-countdown-num')), 'the timer shows in the cockpit too');
    // There it stands over the cockpit's picture of the slide, not over the column bar.
    const sBox = await spk.evaluate(() => {
      const el = document.getElementById('psiINT-countdown');
      return getComputedStyle(el).position + ' ' + el.parentElement.id;
    });
    ok(sBox === 'absolute psiINT-stage-cell', 'and is an overlay over the slide picture there', sBox);

    // ── a slide change leaves it alone ──
    const endBefore = await aud.evaluate(() => countdown.end);
    await aud.keyboard.press('ArrowDown');
    await aud.keyboard.press('ArrowDown');
    await settle(aud, 300);
    const endAfter = await aud.evaluate(() => countdown.end);
    ok(endBefore === endAfter && (await shown(aud)), 'a slide change does not reset or clear it');
    const fillW = await aud.evaluate(() => document.getElementById('psiINT-countdown-fill').style.width);
    ok(parseFloat(fillW) >= 0 && parseFloat(fillW) < 5, 'the bar has barely started to grow', fillW);

    // ── 2:30 and 0:45, set from the cockpit ──
    await setTimer(spk, '2:30');
    const t230 = await shown(spk);
    ok(t230 && /^(2:30|2:29)$/.test(t230.text), '"2:30" sets two minutes thirty', JSON.stringify(t230));
    ok(await until(aud, () => /^(2:30|2:29)$/.test((document.getElementById('psiINT-countdown-num') || {}).textContent)), 'and the projection follows');
    await setTimer(aud, '0:45');
    const t45 = await shown(aud);
    ok(t45 && /^0:(45|44)$/.test(t45.text), '"0:45" sets forty-five seconds', JSON.stringify(t45));

    // ── mute syncs and strikes the bell through ──
    await aud.click('#psiINT-countdown-mute');
    const mutedHere = await aud.evaluate(() => document.getElementById('psiINT-countdown-mute').classList.contains('countdown-muted'));
    ok(mutedHere, 'a click on the bell mutes');
    ok(await until(spk, () => document.getElementById('psiINT-countdown-mute').classList.contains('countdown-muted')), 'and the mute reaches the cockpit');
    const strike = await spk.evaluate(() => getComputedStyle(document.querySelector('#psiINT-countdown-mute .countdown-strike')).display);
    ok(strike !== 'none', 'the muted bell is struck through', strike);
    const hit = await aud.evaluate(() => { const r = document.getElementById('psiINT-countdown-mute').getBoundingClientRect(); return Math.min(r.width, r.height); });
    ok(hit >= 24, 'the bell is at least 24 px to hit', String(hit));
    await spk.click('#psiINT-countdown-mute');
    ok(await until(aud, () => !document.getElementById('psiINT-countdown-mute').classList.contains('countdown-muted')), 'unmuting in the cockpit reaches the projection');

    // ── a reload keeps it ──
    await aud.reload({ waitUntil: 'load' });
    await settle(aud, 600);
    ok(!!(await shown(aud)), 'a reload brings the timer back');
    // A reloaded projection finds the cockpit again on the cockpit's ping, as for blank.
    await spk.bringToFront();
    await spk.keyboard.press('ArrowUp');
    ok(await until(aud, () => hasLivePeer()), 'the reloaded projection finds the cockpit again on its next push');

    // ── expiry: alarm state, then dismissal by a click ──
    await setTimer(aud, '0:02');
    ok(await until(aud, () => document.getElementById('psiINT-countdown').classList.contains('countdown-done')), 'at the end the bar takes the alarm state');
    ok(await until(spk, () => document.getElementById('psiINT-countdown').classList.contains('countdown-done')), 'in the cockpit too');
    const done = await aud.evaluate(() => ({ num: document.getElementById('psiINT-countdown-num').textContent, w: document.getElementById('psiINT-countdown-fill').style.width }));
    ok(done.num === '0:00' && done.w === '100%', 'it reads 0:00 with the bar full', JSON.stringify(done));
    // The window it was set in beeps, the other stays quiet: one laptop, one output.
    const beeps = { aud: await aud.evaluate(() => countdownBeeps), spk: await spk.evaluate(() => countdownBeeps) };
    ok(beeps.aud === 1 && beeps.spk === 0, 'only the window that set it beeps', JSON.stringify(beeps));
    await aud.click('#psiINT-countdown');
    ok(!(await present(aud)).bar, 'a click on the bar dismisses it');
    ok(await until(spk, () => !document.getElementById('psiINT-countdown')), 'and in the other window');

    // ── empty Enter clears a running timer ──
    await setTimer(spk, '3');
    ok(await until(aud, () => !!document.getElementById('psiINT-countdown')), 'a new timer appears again');
    await setTimer(aud, '');
    ok(!(await present(aud)).bar, 'an empty Enter clears it');
    ok(await until(spk, () => !document.getElementById('psiINT-countdown')), 'in both windows');
    await setTimer(aud, '1');
    await setTimer(aud, '0');
    ok(!(await present(aud)).bar, '"0" clears it as well');

    ok(errors.length === 0, 'no page errors', errors.join('\n'));
  } finally {
    await ctx.close();
    server.close();
  }
}
