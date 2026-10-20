/*
 * A cockpit with no projection.
 *
 * speaker.html opened on its own used to show a green "● live", spend S on
 * nothing, and answer B with "projection blanked" over a projection that did
 * not exist. A projection closed by mistake and opened again by hand, with S
 * pressed there, opened a second cockpit whose clock read 0:00 while the
 * first drove nothing.
 *
 * Now the footer's light says "no projection" until a projection answers, S
 * in the cockpit opens audience.html as a window this cockpit is the opener
 * of, a closed one is opened again the same way and attaches to the same
 * cockpit with its clock, B, W and D say there is no projection, and a
 * projection opened by hand while a cockpit runs says where the cockpit is
 * rather than opening a second one.
 *
 * From file://, where every file is an origin of its own and the opener
 * relationship is the only channel there is. And after a rebuild, a reload
 * of either window reloads the other, which still shows the build before.
 * A fixture deck, because the
 * assertions are about the windows and not about any slide.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpDir } from './tmp.mjs';
import { ROOT } from './harness.mjs';

export const name = 'cockpit · alone, and the projection it opens';
export const lecture = 'tutorial';

const SOURCE = `---
title: Cockpit alone
---

## free: One {#one}

The first slide.

## free: Two {#two}

The second slide.

## free: Three {#three}

The third slide.

## free: Four {#four}

The last slide.
`;

function rebuild(dir, source) {
  fs.writeFileSync(path.join(dir, 'source.md'), source);
  const r = spawnSync(process.execPath,
    [path.join(ROOT, 'build.js'), path.join(dir, 'source.md'), '--no-optimize-images'],
    { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) throw new Error('fixture build failed:\n' + r.stdout + r.stderr);
}
function buildFixture() {
  const dir = tmpDir('psi-alone-');
  rebuild(dir, SOURCE);
  return dir;
}

const idOf = (p) => p.evaluate(() => (flatChunks[state.activeIdx] || {}).id);
const light = (p) => p.evaluate(() => {
  const b = document.getElementById('psiINT-freeze-btn');
  return { text: b.textContent, noPeer: b.classList.contains('no-peer') };
});
const badge = (p) => p.evaluate(() => document.getElementById('psiINT-mode-badge').textContent);
// Polled rather than slept: the cockpit notices a closed window on its
// one-second tick, and a projection that booted within milliseconds.
const until = (p, fn, arg, timeout = 5000) =>
  p.waitForFunction(fn, arg, { timeout, polling: 100 }).then(() => true, () => false);
const isLive = (p) => until(p, () => document.getElementById('psiINT-freeze-btn').textContent === '● live');
const isAlone = (p) => until(p, () => document.getElementById('psiINT-freeze-btn').classList.contains('no-peer'));
const onSlide = (p, id) => until(p, (i) => (flatChunks[state.activeIdx] || {}).id === i, id);

export async function run({ page, report }) {
  const { ok } = report;
  const dir = buildFixture();
  const ctx = await page.context().browser().newContext({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  const watch = (p, who) => p.on('pageerror', e => errors.push(who + ': ' + e));
  try {
    // ── 1. speaker.html on its own ──
    const spk = await ctx.newPage();
    watch(spk, 'cockpit');
    await spk.goto('file://' + path.join(dir, 'speaker.html'), { waitUntil: 'load' });
    await spk.waitForTimeout(300);
    const l0 = await light(spk);
    ok(l0.noPeer && /no projection/.test(l0.text), 'a cockpit opened on its own says there is no projection', JSON.stringify(l0));
    ok(!/live/.test(l0.text), 'and not "live"', l0.text);

    await spk.keyboard.press('b');
    ok(await spk.evaluate(() => state.blanked) === false, 'B without a projection blanks nothing');
    const b0 = await badge(spk);
    ok(/no projection/.test(b0) && !/projection blanked/.test(b0), 'and says so instead of "projection blanked"', b0);
    await spk.keyboard.press('w');
    ok(/no projection/.test(await badge(spk)), 'W says there is no projection', await badge(spk));

    // The talk starts in the cockpit: the clock runs, the cockpit moves on.
    await spk.keyboard.press('ArrowDown');
    await onSlide(spk, 'two');
    const t0 = await spk.evaluate(() => tStart);
    ok(Number.isFinite(t0), 'the first press starts the cockpit\'s clock', String(t0));
    await spk.evaluate(() => { window.__marker = 'first'; });

    // ── 2. S opens the projection, attached to this cockpit ──
    const [aud] = await Promise.all([ctx.waitForEvent('page'), spk.keyboard.press('s')]);
    watch(aud, 'projection');
    // The window opens blank and is then sent to the file.
    await aud.waitForURL(/audience\.html$/, { timeout: 5000 }).catch(() => {});
    ok(/audience\.html$/.test(aud.url()), 'S in the cockpit opens audience.html', aud.url());
    ok(await isLive(spk), 'the cockpit says "live" once the projection answers', (await light(spk)).text);
    ok(await onSlide(aud, 'two'), 'the projection opens on the cockpit\'s slide', await idOf(aud));
    ok(await aud.evaluate(() => hasLivePeer()), 'and holds the cockpit as its peer');
    await spk.keyboard.press('ArrowDown');
    ok(await onSlide(aud, 'three'), 'a press in the cockpit moves the projection', await idOf(aud));
    await spk.keyboard.press('b');
    ok(await until(aud, () => state.blanked === true), 'B now blanks the projection');
    ok(/projection blanked/.test(await badge(spk)), 'and says so', await badge(spk));
    await spk.keyboard.press('b');
    ok(await until(aud, () => state.blanked === false), 'B again brings it back');

    // S in that projection brings the cockpit forward and opens nothing.
    await aud.bringToFront();
    await aud.keyboard.press('s');
    await aud.waitForTimeout(400);
    ok(ctx.pages().length === 2, 'S in the projection opens no second cockpit', String(ctx.pages().length));

    // ── 3. a reload of the projection: the cockpit asks again ──
    await aud.reload({ waitUntil: 'load' });
    ok(await isLive(spk), 'after a projection reload the cockpit says "live" again', (await light(spk)).text);
    ok(await onSlide(aud, 'three'), 'and the reloaded projection is on the cockpit\'s slide', await idOf(aud));

    // ── 4. the projection closed by mistake, and opened again from the cockpit ──
    await aud.close();
    ok(await isAlone(spk), 'a closed projection turns the light back to "no projection"', (await light(spk)).text);
    await spk.bringToFront();
    const [aud2] = await Promise.all([ctx.waitForEvent('page'), spk.keyboard.press('s')]);
    watch(aud2, 'projection 2');
    await aud2.waitForLoadState('load');
    ok(await isLive(spk), 'S opens it again and the cockpit says "live"', (await light(spk)).text);
    ok(await onSlide(aud2, 'three'), 'on the cockpit\'s slide', await idOf(aud2));
    ok(await spk.evaluate(() => window.__marker) === 'first', 'one cockpit: the same window, not reloaded');
    ok(await spk.evaluate(() => tStart) === t0, 'and its clock was not reset');
    ok(ctx.pages().length === 2, 'two windows in all', String(ctx.pages().length));
    await spk.keyboard.press('ArrowDown');
    ok(await onSlide(aud2, 'four'), 'and the cockpit drives the new projection', await idOf(aud2));

    // ── 5. a projection opened by hand beside the running cockpit ──
    const hand = await ctx.newPage();
    watch(hand, 'by hand');
    await hand.goto('file://' + path.join(dir, 'audience.html'), { waitUntil: 'load' });
    await hand.waitForTimeout(300);
    await hand.keyboard.press('s');
    await hand.waitForTimeout(500);
    ok(ctx.pages().length === 3, 'S in a projection opened by hand opens no second cockpit while one runs', String(ctx.pages().length));
    ok(/cockpit is open/.test(await badge(hand)), 'it says where the cockpit is', await badge(hand));
    const [spk2] = await Promise.all([ctx.waitForEvent('page'), hand.keyboard.press('s')]);
    await spk2.waitForURL(/speaker\.html$/, { timeout: 5000 }).catch(() => {});
    ok(/speaker\.html$/.test(spk2.url()), 'S once more opens one anyway', spk2.url());
    await spk2.close();
    await hand.close();

    // ── 6. a rebuild, and one of the two windows reloaded ──
    // The other one follows: the reloaded window greets as another build,
    // and the window still showing the old one reloads itself, on its slide.
    const says = (p, word) => until(p, (w) => document.body.textContent.includes(w), word);
    rebuild(dir, SOURCE.replace('The last slide.', 'The last slide, rebuilt.'));
    await aud2.evaluate(() => { window.__marker = 'old'; });
    await spk.reload({ waitUntil: 'load' });
    ok(await says(aud2, 'rebuilt'), 'a cockpit reloaded after a rebuild reloads the projection with it');
    ok(await aud2.evaluate(() => window.__marker) === undefined, 'which is a reload, not a patch');
    ok(await onSlide(aud2, 'four'), 'and the projection stays on its slide', await idOf(aud2));
    rebuild(dir, SOURCE.replace('The last slide.', 'The last slide, twice.'));
    await spk.evaluate(() => { window.__marker = 'old'; });
    await aud2.reload({ waitUntil: 'load' });
    ok(await says(spk, 'twice'), 'a projection reloaded after a rebuild reloads the cockpit with it');
    ok(await onSlide(spk, 'four'), 'and the cockpit stays on its slide', await idOf(spk));
    await aud2.evaluate(() => { window.__marker = 'kept'; });
    await spk.reload({ waitUntil: 'load' });
    ok(await isLive(spk), 'a reload with nothing rebuilt finds the projection again', (await light(spk)).text);
    await aud2.waitForTimeout(500);
    ok(await aud2.evaluate(() => window.__marker) === 'kept', 'and does not reload it');
  } finally {
    await ctx.close();
  }
  ok(errors.length === 0, 'no page errors in any window', errors.join(' | '));
}
