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
import { tmpDir } from './tmp.mjs';
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

// The second fixture, and it is a cover rather than a slide of prose.
//
// A composition may pin the foot of its type block to the bottom of a box that
// is already stretched to the frame - masthead does, which is also what lands
// its folio rule at the top of the credits. The extent from the words at the
// top to the words at the bottom is then the box's height at every type size,
// so the fit's height test never comes true and it walks to its 0.6 floor.
// Measured before the fix: one presenter line took this cover from 2.2 to 0.6,
// and nothing anywhere said why.
//
// It is the fifth construct to make that mistake - the dock's reserved track,
// the overlay layer, a band panel, this, and the stretched .chunk-content
// under all of them - and every one was found by something bottoming out
// rather than by reading the code. Hence a test that watches the floor.
//
// auto-fit rides in the frontmatter here instead of on a # press, because the
// cover is the first slide and walkTo only ever goes forward.
const COVER_SOURCE = `---
title: T
subtitle: S
cover: masthead
auto-fit: true
presenter: P
---

## title: {#title}

## free: F {#f}

One line, and nothing else on the slide.
`;

// The third fixture: the same cover with a lede in its field, and a closing
// slide with a body, which is the shape a real lecture has (measured on
// 38-softsec-defences before the fix: both at 0.6 under full and under
// shrink, where the slide after the cover was at 1.75).
//
// Two more boxes the frame sizes rather than the type. The lede field takes
// the slack between the nameplate and the credits (flex: 1, overflow:
// hidden), so its box is never smaller whatever the zoom; and on a closing
// slide, which has no credits, the body takes the bottom anchor with
// margin-top: auto. Either one made the span the frame's height and the fit
// walk to the floor - on the cover even though the lede is the presenter's
// own words and the credits were already kept out.
const LEDE_SOURCE = `---
title: T
subtitle: S
cover: masthead
auto-fit: true
presenter: P
info: |
  Course · Session 4
  University
---

## title: {#title}

Last week one careless read handed an attacker the return address. This week
the defences that make that hard, and the attacks that answer each one.

## free: F {#f}

One line, and nothing else on the slide.

## closing: Next: Accounts | who you are and how you prove it {#end}

We leave memory behind. Next: how systems decide who you are, passwords and
the factors.
`;

// The zoom the runtime settled on, and whether the slide is inside the frame.
const measure = (page) => page.evaluate(() => {
  const el = document.querySelector('.chunk.active');
  const zoom = parseFloat(getComputedStyle(el || document.documentElement).getPropertyValue('--zoom'));
  const vp = document.getElementById('psiINT-stage-viewport');
  return {
    zoom,
    h: el ? Math.round(el.getBoundingClientRect().height) : 0,
    // FULL_FIT_FILL is the fraction of the viewport the fit aims at, so the
    // frame a fitted slide has to be inside is not the whole of it.
    frame: vp ? Math.round(vp.clientHeight) : 0,
  };
});

// The walk writes its trial zooms on the chunk it measures and commits the
// answer once (fitZoomToChunk, onChunk, commitZoom): at once on the slides
// that can be on screen, and on <html> at the catch-up a moment later
// (showZoom, catchUpZoom). What that owes everything else: the live slide
// shows the zoom state.zoom says it does, at once; and once the catch-up has
// run, no chunk is left with a zoom of its own, which + and - could not
// reach, and <html> shows it too. Read without psiExport, whose first use
// switches the catch-up off.
const zoomHeld = (page) => page.evaluate(() => ({
  root: parseFloat(document.documentElement.style.getPropertyValue('--zoom')),
  live: parseFloat(getComputedStyle(document.querySelector('.chunk.active')).getPropertyValue('--zoom')),
  state: state.zoom,
  private: [...document.querySelectorAll('.chunk')]
    .filter(c => c.style.getPropertyValue('--zoom') !== '').map(c => c.id),
}));

export async function run({ page, report, walkTo }) {
  const { ok, note } = report;

  const dir = tmpDir('psi-autofit-');
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

    const checkHeld = async (when) => {
      let h = await zoomHeld(page);
      ok(h.live === h.state, `${when}: the live slide shows the zoom the runtime holds`, `${h.live} vs ${h.state}`);
      // The catch-up waits ZOOM_CATCH_UP_MS (500) after the last change and
      // then for an idle moment.
      for (let t = 0; t < 30 && (h.private.length || h.root !== h.state); t++) {
        await page.waitForTimeout(100);
        h = await zoomHeld(page);
      }
      ok(h.private.length === 0, `${when}: no chunk keeps a zoom of its own after the catch-up`, h.private.join(', '));
      ok(h.root === h.state, `${when}: <html> shows the zoom the runtime holds after it`, `${h.root} vs ${h.state}`);
    };

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
    await checkHeld('shrink, tall slide');

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
    await checkHeld('full, tall slide');

    // A throw in the middle of a walk, from the first trial write on a chunk
    // at a zoom other than the one the walk started from. Each trial moves
    // state.zoom, so this is the case that tells a walk rolled back from one
    // that commits the step it had reached; a throw at the starting zoom
    // could not tell the two apart. (Counting writes instead was tried: on
    // this slide the third write lands back on the starting zoom.)
    const threw = await page.evaluate(() => {
      const P = window.psiExport;
      const before = P.zoom();
      const proto = CSSStyleDeclaration.prototype;
      const real = proto.setProperty;
      const root = document.documentElement.style;
      let at = null;
      proto.setProperty = function (name, value, ...rest) {
        if (name === '--zoom' && this !== root && Number(value) !== before) {
          at = Number(value);
          throw new Error('probe failed');
        }
        return real.call(this, name, value, ...rest);
      };
      let msg = 'no throw';
      try { P.settle(); } catch (e) { msg = e.message; }
      finally { proto.setProperty = real; }
      return { msg, before, at, after: P.zoom(),
               root: parseFloat(root.getPropertyValue('--zoom')) };
    });
    ok(threw.msg === 'probe failed', 'a probe that throws mid-walk reaches the caller', threw.msg);
    ok(threw.at !== null && threw.at !== threw.before,
       'and it threw part-way, at a zoom other than the one the walk started from',
       `${threw.at} from ${threw.before}`);
    ok(threw.after === threw.before && threw.root === threw.before,
       'the walk that threw leaves the zoom it started from, on the runtime and on <html>',
       `state ${threw.after}, <html> ${threw.root}, started ${threw.before}`);
    await checkHeld('after a walk that threw');

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

  // ── a cover whose credits are pinned to the foot ──
  const cdir = tmpDir('psi-autofit-cover-');
  fs.writeFileSync(path.join(cdir, 'source.md'), COVER_SOURCE);
  const cbuilt = spawnSync(process.execPath,
    [path.join(ROOT, 'build.js'), path.join(cdir, 'source.md'), '--audience-only'],
    { cwd: ROOT, encoding: 'utf8' });
  ok(cbuilt.status === 0, 'the cover fixture builds', (cbuilt.stdout || '') + (cbuilt.stderr || ''));
  if (cbuilt.status !== 0) return;
  const { server: cserver, port: cport } = await serve(cdir);
  try {
    await page.goto(`http://127.0.0.1:${cport}/audience.html`, { waitUntil: 'load' });
    await page.evaluate(() => { try { localStorage.clear(); } catch (e) { /* private window */ } });
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(900);
    const cover = await measure(page);
    // The floor itself, not a threshold near it: the failure this guards is
    // not "a bit small", it is the loop running out of room to shrink.
    ok(cover.zoom > 0.61,
       'a masthead cover with a presenter is not pinned at the auto-fit floor',
       String(cover.zoom));
    ok(cover.zoom > DEFAULT_ZOOM,
       'and full mode grows it, the same claim the short slide above makes',
       `${cover.zoom} vs ${DEFAULT_ZOOM}`);
    ok(cover.h <= cover.frame + 1,
       'while the slide is still inside the frame',
       `${cover.h}px in ${cover.frame}px`);
    note(`masthead cover under full: zoom ${cover.zoom}, ${cover.h}px in ${cover.frame}px`);
  } finally {
    cserver.close();
  }

  // ── a cover with a lede, and a closing slide with a body ──
  const ldir = tmpDir('psi-autofit-lede-');
  fs.writeFileSync(path.join(ldir, 'source.md'), LEDE_SOURCE);
  const lbuilt = spawnSync(process.execPath,
    [path.join(ROOT, 'build.js'), path.join(ldir, 'source.md'), '--audience-only'],
    { cwd: ROOT, encoding: 'utf8' });
  ok(lbuilt.status === 0, 'the lede fixture builds', (lbuilt.stdout || '') + (lbuilt.stderr || ''));
  if (lbuilt.status !== 0) return;
  const { server: lserver, port: lport } = await serve(ldir);
  try {
    await page.goto(`http://127.0.0.1:${lport}/audience.html`, { waitUntil: 'load' });
    await page.evaluate(() => { try { localStorage.clear(); } catch (e) { /* private window */ } });
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(900);
    const lede = await measure(page);
    ok(lede.zoom > DEFAULT_ZOOM,
       'a masthead cover with a lede is grown under full, not walked to the floor',
       `${lede.zoom} vs ${DEFAULT_ZOOM}`);
    ok(lede.h <= lede.frame + 1,
       'and stays inside the frame', `${lede.h}px in ${lede.frame}px`);
    // The field clips what does not fit it, so "inside the frame" alone would
    // pass a lede cut in half.
    const clipped = await page.evaluate(() => {
      const f = document.querySelector('.chunk.active .title-field');
      return f ? f.scrollHeight - f.clientHeight : -1;
    });
    ok(clipped === 0, 'with none of the lede clipped by its field', String(clipped));

    await walkTo('end');
    const closing = await measure(page);
    ok(closing.zoom > DEFAULT_ZOOM,
       'a masthead closing slide with a body is grown under full, not walked to the floor',
       `${closing.zoom} vs ${DEFAULT_ZOOM}`);
    ok(closing.h <= closing.frame + 1,
       'and stays inside the frame', `${closing.h}px in ${closing.frame}px`);

    // # from full is off, and again is shrink. The closing slide fits at the
    // lecturer's zoom, so shrink has nothing to take away from it.
    await page.keyboard.press('#');
    await page.waitForTimeout(500);
    await page.keyboard.press('#');
    await page.waitForTimeout(500);
    const shrunk = await measure(page);
    ok(Math.abs(shrunk.zoom - DEFAULT_ZOOM) < 0.001,
       'and shrink leaves it at the zoom that was set, as on any slide that fits',
       String(shrunk.zoom));
    note(`masthead with lede under full: cover ${lede.zoom}, closing ${closing.zoom}; closing under shrink ${shrunk.zoom}`);
  } finally {
    lserver.close();
  }
}
