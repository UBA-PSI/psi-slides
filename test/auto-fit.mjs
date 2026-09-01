/*
 * auto-fit has three modes, and the middle one is a claim about a number.
 *
 * `off` leaves the zoom alone. `true` (full) sizes every slide to the
 * screen, which means it grows a short slide as readily as it shrinks a long
 * one - the ceiling is the global maximum, 2.2. `shrink` is the same fit
 * with the lecturer's own zoom as the ceiling, so it can only ever take size
 * away: a slide that already fits comes out at exactly the zoom that was set,
 * and a slide that does not comes out smaller and inside the frame.
 *
 * "Leaves the zoom alone" is the whole of what the mode promises and it is a
 * number, so it is measured rather than read: the assertion that matters is
 * the short slide sitting at 1.35 under shrink and above 1.35 under full, on
 * the same deck, one # press apart. Everything else about the modes -
 * which words the key takes, what the frontmatter resolves to, what travels
 * in a snapshot - needs no browser and is in test/settings.mjs.
 *
 * It builds its own deck for the reason math-focus does: the fixture is a
 * slide deliberately taller than any frame and one deliberately shorter,
 * which is not a lecture and does not belong in lectures/.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { serve, ROOT } from './harness.mjs';

export const name = 'auto-fit · shrink only ever takes size away';
export const lecture = 'tutorial';   // built for other specs already; unused here
export const view = 'audience';

// Every paragraph contributes its topic sentence to the collapsed slide, so
// the height is the count. Fourteen is comfortably past a 900px frame at the
// default zoom and still passes the density budget for a free chunk.
const TALL = Array.from({ length: 14 },
  (_, i) => `Zeile ${i + 1} steht fuer sich und traegt einen eigenen Gedanken.`).join('\n\n');

const SOURCE = `---
title: T
---

## title: {#title}

## free: Tall {#tall}

${TALL}

## free: Short {#short}

One line, and nothing else on the slide.

## free: Tall again {#tall2}

${TALL}
`;
// walkTo only presses ArrowDown, so the deck is ordered the way the spec
// reads it and the tall slide appears twice rather than being walked back to.

// The zoom the runtime settled on, and whether the slide is inside the frame.
const measure = (page) => page.evaluate(() => {
  const zoom = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--zoom'));
  const el = document.querySelector('.chunk.active');
  const vp = document.getElementById('stage-viewport');
  return {
    zoom,
    h: el ? Math.round(el.getBoundingClientRect().height) : 0,
    // FULL_FIT_FILL is the fraction of the viewport the fit aims at, so the
    // frame a fitted slide has to be inside is not the whole of it.
    frame: vp ? Math.round(vp.clientHeight) : 0,
  };
});

export async function run({ page, report, walkTo }) {
  const { ok, note } = report;

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-autofit-'));
  fs.writeFileSync(path.join(dir, 'source.md'), SOURCE);
  const built = spawnSync(process.execPath,
    [path.join(ROOT, 'build.js'), path.join(dir, 'source.md'), '--audience-only'],
    { cwd: ROOT, encoding: 'utf8' });
  ok(built.status === 0, 'the fixture deck builds', (built.stdout || '') + (built.stderr || ''));
  if (built.status !== 0) return;

  const { server, port } = await serve(dir);
  const DEFAULT_ZOOM = 1.35;
  try {
    await page.goto(`http://127.0.0.1:${port}/audience.html`, { waitUntil: 'load' });
    await page.evaluate(() => { try { localStorage.clear(); } catch (e) { /* private window */ } });
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(700);

    // ── off, which is where a deck that says nothing opens ──
    await walkTo('tall');
    const offTall = await measure(page);
    ok(Math.abs(offTall.zoom - DEFAULT_ZOOM) < 0.001,
       'with auto-fit off the lecturer zoom stands on a slide too tall for the frame',
       String(offTall.zoom));
    ok(offTall.h > offTall.frame,
       'and the slide really is taller than the frame, or the rest of this proves nothing',
       `${offTall.h}px in ${offTall.frame}px`);

    // ── one press: shrink ──
    await page.keyboard.press('#');
    await page.waitForTimeout(500);
    const shrinkTall = await measure(page);
    ok(shrinkTall.zoom < DEFAULT_ZOOM,
       'one press of # shrinks that slide', `${shrinkTall.zoom} from ${DEFAULT_ZOOM}`);
    ok(shrinkTall.h <= shrinkTall.frame + 1,
       'and brings it inside the frame', `${shrinkTall.h}px in ${shrinkTall.frame}px`);

    // The claim the mode is named for. Same mode, a slide that fits, and the
    // zoom has to be the one that was set - not a fit that happens to land
    // near it, which is what a proportional estimate with no ceiling gives.
    await walkTo('short');
    const shrinkShort = await measure(page);
    ok(Math.abs(shrinkShort.zoom - DEFAULT_ZOOM) < 0.001,
       'and leaves a slide that already fits at exactly the zoom that was set',
       String(shrinkShort.zoom));

    // ── a second press: full ──
    await page.keyboard.press('#');
    await page.waitForTimeout(500);
    const fullShort = await measure(page);
    ok(fullShort.zoom > DEFAULT_ZOOM,
       'a second press grows the same short slide, which is the difference between the two modes',
       `${fullShort.zoom} vs ${shrinkShort.zoom}`);
    note(`short slide: off/shrink ${shrinkShort.zoom}, full ${fullShort.zoom}; `
       + `tall slide: off ${offTall.zoom} (${offTall.h}px), shrink ${shrinkTall.zoom} (${shrinkTall.h}px)`);

    await walkTo('tall2');
    const fullTall = await measure(page);
    ok(fullTall.h <= fullTall.frame + 1,
       'and full still fits the tall one, which is what it always did',
       `${fullTall.h}px in ${fullTall.frame}px`);

    // ── a third press comes back round ──
    await page.keyboard.press('#');
    await page.waitForTimeout(500);
    const backOff = await measure(page);
    ok(Math.abs(backOff.zoom - DEFAULT_ZOOM) < 0.001,
       'and a third press is back to off, with the lecturer zoom restored untouched',
       String(backOff.zoom));
  } finally {
    server.close();
  }
}
