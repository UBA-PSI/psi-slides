/*
 * `::: draw autoplay N cycle` – the clock, and who is allowed to stop it.
 *
 * This spec exists because the feature shipped broken and nothing noticed.
 * `test/settings.mjs` asserted that `autoplay N` reaches the figure as
 * `data-autoplay`, which it did; no test ever ran the clock. The stop flag was
 * session-wide, and you reach a slide by pressing a key – so the keypress that
 * navigated to the figure retired the timer before the figure was on screen,
 * and autoplay could only ever run on a slide the deck happened to open on.
 * Jumping by address worked, which is why it looked fine when anyone checked.
 *
 * So the assertion that matters is not "a timer exists". It is **arrive at the
 * slide the way a lecturer does – by pressing a key – and see the beats move**,
 * and then that a key pressed once you are there still hands the deck back.
 *
 * The second half is the visit after the first, because that is the visit a
 * break slide gets. A `cycle` figure clicked through once in rehearsal, or
 * reached backwards, is never at its opening beat again, and the rule that
 * autoplay starts only from there left the lecturer's break slide standing
 * still on every arrival but the first. So: arrive at a cycle left on its last
 * step, by key, backwards, from the cockpit and by reload, and see it rewind
 * and play; see a snapshot from the cockpit that changes nothing leave the
 * clock running, where any snapshot used to stop it; see a key in either
 * window still stop it; and see a figure without `cycle` keep today's rule.
 *
 * It builds its own deck for the reason test/README.md gives: the shape it
 * needs is a slide with autoplay standing *after* another slide, a second one
 * without `cycle` behind it, and no lecture owes it that arrangement at a
 * stable id.
 */
import fs from 'node:fs';
import { tmpDir } from './tmp.mjs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { serve, settle, ROOT } from './harness.mjs';

export const name = 'autoplay · the clock, and who stops it';
export const lecture = 'tutorial';   // built for other specs already; unused here
export const view = 'audience';
// Run alone, after the parallel batch (test/run.mjs): the figure's beats run on a real timer the spec waits out.
export const serial = true;

// 260 ms so the spec is quick and still inside the documented 200 ms – 60 s.
// Three steps, so "it moved" is several beats rather than one and cannot be
// confused with the opening beat being counted twice.
const DECK = `---
title: T
collapse: none
---

## title: {#title}

## free: Before {#before}

Nothing here. This slide exists so the next one is reached by pressing a key.

## figure: Plays itself {#auto}

::: draw 150x56 autoplay 260 cycle
box a "A" at 0,0
box b "B" right of a gap 1
box c "C" right of b gap 1

step two
  show b
step three
  show c
:::

## figure: Plays once {#once}

::: draw 150x56 autoplay 260
box a "A" at 0,0
box b "B" right of a gap 1
box c "C" right of b gap 1

step two
  show b
step three
  show c
:::

## free: After {#after}

Nothing here either.
`;

function buildDeck() {
  const dir = tmpDir('psi-autoplay-');
  fs.writeFileSync(path.join(dir, 'source.md'), DECK);
  const r = spawnSync(process.execPath,
    [path.join(ROOT, 'build.js'), path.join(dir, 'source.md')],
    { cwd: ROOT, encoding: 'utf8' });
  return { dir, status: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

export async function run({ page, report }) {
  const { ok, note } = report;

  const built = buildDeck();
  ok(built.status === 0, 'the fixture deck builds', built.out);
  if (built.status !== 0) return;

  const { server, port } = await serve(built.dir);
  try {
    await page.goto(`http://127.0.0.1:${port}/audience.html`, { waitUntil: 'load' });
    await page.evaluate(() => { try { localStorage.clear(); } catch (e) { /* private window */ } });
    await page.goto(`http://127.0.0.1:${port}/audience.html`, { waitUntil: 'load' });
    await page.waitForTimeout(600);

    const st = () => page.evaluate(() => ({
      active: (flatChunks[state.activeIdx] || {}).id,
      revealed: revealed[(flatChunks[state.activeIdx] || {}).id] ?? 0,
      stoppedOn: autoplayStoppedOn,
      timer: autoplayTimer !== 0,
    }));

    // Park on the slide before it, then reach the figure by pressing a key.
    // Every keypress on the way is the thing that used to kill the clock.
    await page.evaluate(() => { location.hash = '#before'; });
    await page.waitForTimeout(500);
    let s = await st();
    ok(s.active === 'before', 'parked on the slide before the figure', JSON.stringify(s));

    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(500);
    const arrived = await st();
    note('arrived: ' + JSON.stringify(arrived));
    ok(arrived.active === 'auto', 'one key reaches the figure', JSON.stringify(arrived));
    // The take-over is recorded against the slide that was left, not the one
    // that arrived - which is what the capture-phase listener buys.
    ok(arrived.stoppedOn !== 'auto',
      'the arrival key is charged to the slide it left, not the one it reached',
      String(arrived.stoppedOn));
    ok(arrived.timer, 'and the clock is running on arrival', JSON.stringify(arrived));

    await page.waitForTimeout(1000);
    const moved = await st();
    note('later  : ' + JSON.stringify(moved));
    ok(moved.revealed > arrived.revealed,
      'the beats walk by themselves after a keyed arrival',
      `${arrived.revealed} -> ${moved.revealed}`);

    // And the promise in the other direction: touching the deck hands it back.
    // Pressed while a beat is still to come, so the key advances the figure
    // rather than leaving it for the slide behind.
    await page.waitForFunction(() => (revealed.auto ?? 0) < countSegments(flatChunks[state.activeIdx].el),
      null, { timeout: 2000, polling: 5 }).catch(() => {});
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(220);
    const took = await st();
    ok(took.stoppedOn === 'auto', 'a key pressed on the figure takes it over',
      String(took.stoppedOn));
    ok(!took.timer, 'and the clock is retired', JSON.stringify(took));

    await page.waitForTimeout(900);
    const after = await st();
    note('frozen : ' + JSON.stringify(after));
    ok(after.revealed === took.revealed,
      'the figure stays exactly where the lecturer left it',
      `${took.revealed} -> ${after.revealed}`);

    // ── the visit after the first ──
    const beatOf = (p, id) => p.evaluate((i) => revealed[i] ?? 0, id);
    const idNow = (p) => p.evaluate(() => (flatChunks[state.activeIdx] || {}).id);
    const segs = await page.evaluate(() => countSegments(flatChunks.find(c => c.id === 'auto').el));
    // Walk the cycle to its last step by hand, as a rehearsal leaves it.
    const walkToEnd = async () => {
      for (let i = 0; i < 4 && await beatOf(page, 'auto') < segs; i++) {
        await page.keyboard.press('ArrowRight');
        await page.waitForTimeout(80);
      }
    };
    await walkToEnd();
    ok(await beatOf(page, 'auto') === segs, 'the figure is walked to its last step by hand', String(await beatOf(page, 'auto')));
    // Off it forwards, onto the figure without cycle, and back with one key.
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(150);
    ok(await idNow(page) === 'once', 'one key leaves it', await idNow(page));
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(60);
    const backed = await st();
    note('back on it: ' + JSON.stringify(backed));
    ok(backed.active === 'auto' && backed.revealed === 1 && backed.timer,
      'arriving backwards at a cycle left on its last step rewinds it and starts the clock',
      JSON.stringify(backed));
    await page.waitForTimeout(700);
    ok(await beatOf(page, 'auto') > 1, 'and it plays', String(await beatOf(page, 'auto')));

    // Forwards onto it again, left by address while it stood past its
    // opening beat. (The address is cleared first: the same fragment twice
    // is no hashchange.)
    await page.waitForFunction(() => (revealed.auto ?? 0) > 1, null, { timeout: 2000, polling: 5 }).catch(() => {});
    await page.evaluate(() => { history.replaceState(null, '', location.pathname); location.hash = '#before'; });
    await page.waitForTimeout(150);
    const stale = await beatOf(page, 'auto');
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(60);
    const fwd = await st();
    ok(fwd.active === 'auto' && fwd.revealed === 1 && fwd.timer,
      'arriving forwards at it rewinds it as well', `left at ${stale}, ` + JSON.stringify(fwd));

    // The figure without cycle keeps the rule: it plays once from its opening
    // beat, and a second visit finds it finished and leaves it finished.
    await page.keyboard.press('ArrowRight');   // takes #auto over, or leaves it
    await page.waitForTimeout(60);
    if (await idNow(page) === 'auto') { await page.keyboard.press('ArrowRight'); await page.waitForTimeout(60); }
    for (let i = 0; i < 3 && await idNow(page) === 'auto'; i++) { await page.keyboard.press('ArrowRight'); await page.waitForTimeout(60); }
    ok(await idNow(page) === 'once', 'keys reach the figure without cycle', await idNow(page));
    await page.waitForFunction((n) => revealed.once === n, segs, { timeout: 3000, polling: 20 }).catch(() => {});
    ok(await beatOf(page, 'once') === segs, 'without cycle it plays to its last step', String(await beatOf(page, 'once')));
    await page.waitForTimeout(400);
    ok(await page.evaluate(() => autoplayTimer === 0), 'and stops there');
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(150);
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(500);
    const again = await page.evaluate(() => ({ id: flatChunks[state.activeIdx].id, r: revealed.once, timer: autoplayTimer !== 0 }));
    ok(again.id === 'once' && again.r === segs && !again.timer,
      'arriving again at a figure without cycle leaves it as it was, clock off', JSON.stringify(again));

    // A reload on the cycle while it is past its opening beat.
    await page.evaluate(() => { location.hash = '#auto'; });
    await page.waitForFunction(() => (revealed.auto ?? 0) > 1, null, { timeout: 2000, polling: 20 }).catch(() => {});
    await page.evaluate(() => history.replaceState(null, '', location.pathname));
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(500);
    const rl = await st();
    note('reloaded: ' + JSON.stringify(rl));
    ok(rl.active === 'auto' && rl.timer, 'a reload on the cycle starts its clock', JSON.stringify(rl));

    // ── with the cockpit attached ──
    // The cycle on its last step again, by hand, then the cockpit opened from
    // the projection (its opener) on the slide before.
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(60);
    await walkToEnd();
    await page.evaluate(() => { location.hash = '#before'; });
    await page.waitForTimeout(200);
    ok(await beatOf(page, 'auto') === segs, 'left on its last step before the cockpit opens', String(await beatOf(page, 'auto')));
    const [spk] = await Promise.all([page.context().waitForEvent('page'), page.keyboard.press('s')]);
    try {
      await spk.waitForLoadState();
      await settle(spk, 900);
      ok(await beatOf(spk, 'auto') === segs, 'and the cockpit knows it that way', String(await beatOf(spk, 'auto')));
      await spk.bringToFront();
      await spk.keyboard.press('ArrowDown');
      await page.waitForFunction(() => (flatChunks[state.activeIdx] || {}).id === 'auto', null, { timeout: 2000 }).catch(() => {});
      const driven = await st();
      note('cockpit drove: ' + JSON.stringify(driven));
      ok(driven.active === 'auto' && driven.timer, 'the cockpit drives the projection onto it and its clock runs',
        JSON.stringify(driven));
      await page.waitForTimeout(500);
      let pa, sa;
      for (let i = 0; i < 20; i++) {
        pa = await beatOf(page, 'auto'); sa = await beatOf(spk, 'auto');
        if (pa === sa) break;
        await spk.waitForTimeout(40);
      }
      ok(pa === sa, 'and the cockpit follows the rewound walk', `${sa} vs ${pa}`);

      // A snapshot from the cockpit that changes nothing on the slide - the
      // slide repeated, and the hand-over a cockpit gives a projection back
      // from a reload - is not a hand on it. Either used to stop the loop.
      await spk.evaluate(() => broadcastState());
      await spk.evaluate(() => viewHooks.onPeerBoot(false));
      await page.waitForTimeout(100);
      const echoed = await st();
      ok(echoed.timer && echoed.stoppedOn !== 'auto',
        'a snapshot from the cockpit that changes nothing leaves the clock running', JSON.stringify(echoed));

      // A key in the cockpit that changes the slide's zoom is a hand on it.
      await spk.keyboard.press('+');
      await page.waitForTimeout(150);
      const zoomed = await st();
      ok(zoomed.stoppedOn === 'auto' && !zoomed.timer, 'a zoom from the cockpit takes the figure over',
        JSON.stringify(zoomed));
      const z0 = await beatOf(page, 'auto');
      await page.waitForTimeout(700);
      ok(await beatOf(page, 'auto') === z0, 'and it stays where it was', `${z0} -> ${await beatOf(page, 'auto')}`);

      // Taken over from the cockpit, the cockpit leaves and comes back. No key
      // was pressed on the projection, and the figure plays again all the same.
      for (let i = 0; i < 5 && await idNow(page) === 'auto'; i++) {
        await spk.keyboard.press('ArrowUp');
        await spk.waitForTimeout(120);
      }
      await page.waitForTimeout(200);
      ok(await idNow(page) === 'before', 'the cockpit takes the projection off it', await idNow(page));
      await spk.keyboard.press('ArrowDown');
      await page.waitForFunction(() => (flatChunks[state.activeIdx] || {}).id === 'auto', null, { timeout: 2000 }).catch(() => {});
      const back2 = await st();
      ok(back2.active === 'auto' && back2.timer,
        'back onto it from the cockpit after a take-over from the cockpit, it plays again', JSON.stringify(back2));
    } finally {
      await spk.close();
    }
  } finally {
    server.close();
  }
}
