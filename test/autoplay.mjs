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
 * It builds its own two-chunk deck for the reason test/README.md gives: the
 * shape it needs is a slide with autoplay standing *after* another slide, and
 * no lecture owes it that arrangement at a stable id.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { serve, ROOT } from './harness.mjs';

export const name = 'autoplay · the clock, and who stops it';
export const lecture = 'tutorial';   // built for other specs already; unused here
export const view = 'audience';

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
`;

function buildDeck() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-autoplay-'));
  fs.writeFileSync(path.join(dir, 'source.md'), DECK);
  const r = spawnSync(process.execPath,
    [path.join(ROOT, 'build.js'), path.join(dir, 'source.md'), '--audience-only'],
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
  } finally {
    server.close();
  }
}
