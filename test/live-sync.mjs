/*
 * The two live windows, and the defects the pre-2.0.0 review reproduced
 * between them: what a frozen cockpit takes from the projection, where a
 * reloaded projection boots, what a second S does, where autoplay starts,
 * what a press during a fade acts on, how the overview is left, what a
 * diagram inside a `from N` card does before the card arrives, and whether
 * a figure focused in the cockpit stays focused on the projection.
 *
 * It builds two decks of its own for the reason test/README.md gives: the
 * shapes it needs - an autoplay figure behind a plain slide, a stepped figure
 * inside an overlay held to a beat, a deck that fades - are owed by no
 * lecture at a stable id. The fade is a frontmatter key, so it is a deck.
 */
import fs from 'node:fs';
import { tmpDir } from './tmp.mjs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { serve, ROOT } from './harness.mjs';

export const name = 'live-sync · freeze, landing and focus across the two windows';
export const lecture = 'tutorial';   // built for other specs already; unused here
export const view = 'audience';

const BODY = `
## title: {#title}

## free: One {#one}

The first plain slide.

## free: Two {#two}

The second plain slide.

## free: Three {#three}

The third plain slide.

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

## free: Held {#held}

Words on the slide from the start.

---

A second paragraph on the first press.

::: overlay {.top-right} from 2
::: draw 150x56
box p "P" at 0,0
box q "Q" right of p gap 1

step later
  show q
:::
:::

## figure: Focus {#focus}

::: draw 150x56
box f "F" at 0,0
box g "G" right of f gap 1
:::

## free: Four {#four}

The last plain slide.
`;

function buildDeck(front) {
  const dir = tmpDir('psi-live-sync-');
  fs.writeFileSync(path.join(dir, 'source.md'), `---\ntitle: Sync\ncollapse: none\n${front}---\n${BODY}`);
  const r = spawnSync(process.execPath, [path.join(ROOT, 'build.js'), path.join(dir, 'source.md')],
    { cwd: ROOT, encoding: 'utf8' });
  return { dir, status: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

const idOf = (p) => p.evaluate(() => (flatChunks[state.activeIdx] || {}).id);
const idxOf = (p, id) => p.evaluate((i) => flatChunks.findIndex(c => c.id === i), id);
const wait = (p, ms) => p.waitForTimeout(ms);

async function openPair(ctx, port, errors) {
  const aud = await ctx.newPage();
  aud.on('pageerror', e => errors.push('aud: ' + e));
  await aud.goto(`http://127.0.0.1:${port}/audience.html`, { waitUntil: 'load' });
  await aud.evaluate(() => { try { localStorage.clear(); } catch (e) { /* private window */ } });
  await aud.reload({ waitUntil: 'load' });
  await wait(aud, 600);
  const [spk] = await Promise.all([ctx.waitForEvent('page'), aud.keyboard.press('s')]);
  spk.on('pageerror', e => errors.push('spk: ' + e));
  await spk.waitForLoadState();
  await wait(spk, 900);
  return { aud, spk };
}

async function key(p, k, ms = 300) {
  await p.bringToFront();
  await p.keyboard.press(k);
  await wait(p, ms);
}

async function goTo(p, id) {
  // The deck's own hash route: jumpTo, broadcast and all.
  await p.bringToFront();
  await p.evaluate((i) => { location.hash = '#' + i; }, id);
  await wait(p, 500);
}

export async function run({ page, report }) {
  const { ok, note } = report;
  const errors = [];

  const pan = buildDeck('');
  ok(pan.status === 0, 'the fixture deck builds', pan.out);
  const fade = buildDeck('transition: fade\n');
  ok(fade.status === 0, 'the fading fixture deck builds', fade.out);
  if (pan.status !== 0 || fade.status !== 0) return;

  const { server, port } = await serve(pan.dir);
  const ctx = await page.context().browser().newContext({ viewport: { width: 1440, height: 900 } });
  try {
    let { aud, spk } = await openPair(ctx, port, errors);

    // ── 3. a second S focuses the cockpit and leaves it alone ──
    await key(spk, 'ArrowDown');
    await key(spk, 'v');
    await spk.evaluate(() => { window.__marker = 'still here'; });
    const pagesBefore = ctx.pages().length;
    await key(aud, 's', 900);
    const kept = await spk.evaluate(() => ({ marker: window.__marker || null, frozen }));
    ok(kept.marker === 'still here' && kept.frozen === true,
      'a second S on the projection does not reload the cockpit (freeze survives)', JSON.stringify(kept));
    ok(ctx.pages().length === pagesBefore, 'and opens no second cockpit',
      `${pagesBefore} -> ${ctx.pages().length}`);
    const peerOk = await aud.evaluate(() => hasLivePeer());
    ok(peerOk, 'the projection still holds the cockpit as its peer');

    // ── 1. a frozen cockpit is not dragged back by the projection ──
    // The cockpit is frozen on #one; walk it ahead privately.
    await key(spk, 'ArrowDown');
    await key(spk, 'ArrowDown');
    const ahead = await idOf(spk);
    ok(ahead === 'three', 'the frozen cockpit walks ahead privately', ahead);
    ok(await idOf(aud) === 'one', 'while the projection holds its slide', await idOf(aud));
    // A press on the projection's own keyboard broadcasts a snapshot.
    await key(aud, 'b', 400);
    const s1 = await spk.evaluate(() => ({ id: flatChunks[state.activeIdx].id, blanked: state.blanked }));
    ok(s1.id === 'three', 'a snapshot from the projection does not move a frozen cockpit', JSON.stringify(s1));
    ok(s1.blanked === true, 'but the cockpit still learns that the projection blanked', JSON.stringify(s1));
    await key(aud, 'b', 400);

    // ── 9. the projection's pan does not reach a frozen cockpit's camera ──
    await aud.evaluate(() => { manualPan = { dx: 40, dy: 30 }; broadcastPan(); });
    await wait(spk, 300);
    const sp = await spk.evaluate(() => ({ ...manualPan }));
    ok(sp.dx === 0 && sp.dy === 0, 'a pan from the projection leaves a frozen cockpit\'s camera alone', JSON.stringify(sp));
    await aud.evaluate(() => { manualPan = { dx: 0, dy: 0 }; broadcastPan(); });
    // The laser pointer is the room's: frozen, the cockpit sends none.
    await aud.evaluate(() => {
      window.__cursors = 0;
      window.addEventListener('message', (e) => { if (e.data && e.data.type === 'cursor' && e.data.chunkIdx >= 0) window.__cursors++; });
    });
    await spk.bringToFront();
    const vb = await spk.evaluate(() => { const r = viewport.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await spk.mouse.move(vb.x, vb.y);
    await spk.mouse.move(vb.x + 20, vb.y + 10, { steps: 4 });
    await wait(spk, 300);
    ok(await aud.evaluate(() => window.__cursors) === 0, 'a frozen cockpit sends no laser pointer to the room');

    // ── 2. reloading the projection while frozen shows the room's slide ──
    await aud.bringToFront();
    await aud.reload({ waitUntil: 'load' });
    await wait(aud, 700);
    ok(await idOf(aud) === 'one', 'a projection reloaded under a frozen cockpit boots onto the room\'s slide, not the look-ahead',
      await idOf(aud));

    // Thawing hands the room the cockpit's slide, and the stored position with it.
    await key(spk, 'v', 500);
    ok(await idOf(aud) === 'three', 'thawing hands the room the cockpit\'s slide', await idOf(aud));
    const stored = await aud.evaluate(() => localStorage.getItem(storageKey('activeIdx')));
    ok(Number(stored) === await idxOf(aud, 'three'), 'and the stored position follows the thaw', String(stored));

    // ── 4. autoplay starts when the cockpit drives onto the slide ──
    await key(spk, 'ArrowDown', 400);
    ok(await idOf(aud) === 'auto', 'the cockpit drives the projection onto the autoplay figure', await idOf(aud));
    const a0 = await aud.evaluate(() => revealed.auto ?? 0);
    await wait(aud, 900);
    const a1 = await aud.evaluate(() => revealed.auto ?? 0);
    ok(a1 !== a0 || await aud.evaluate(() => autoplayTimer !== 0),
      'and the figure plays itself on the projection', `${a0} -> ${a1}`);
    const sAuto = await spk.evaluate(() => revealed.auto ?? 0);
    ok(sAuto === await aud.evaluate(() => revealed.auto ?? 0), 'the cockpit follows the clock', String(sAuto));
    // A press in the cockpit takes the figure over on the projection too.
    await key(spk, 'ArrowUp', 100);
    await wait(aud, 200);
    const took = await aud.evaluate(() => ({ stopped: autoplayStoppedOn, timer: autoplayTimer !== 0, r: revealed.auto }));
    await wait(aud, 900);
    const after = await aud.evaluate(() => revealed.auto);
    ok(took.stopped === 'auto' && !took.timer && after === took.r,
      'a press in the cockpit takes the figure over on the projection', JSON.stringify({ took, after }));

    // ── 7. a diagram inside a `from 2` card waits for the card ──
    await goTo(spk, 'held');
    const beats = await aud.evaluate(() => {
      const e = flatChunks.find(c => c.id === 'held');
      return { total: countSegments(e.el), list: chunkBeats(e.el).map(b => b.type + ':' + (b.at ?? 'p' + b.pos)) };
    });
    note('held beats: ' + JSON.stringify(beats));
    const step = () => aud.evaluate(() => document.querySelector('#held svg.psi-diagram').psiDiagram.step);
    const card = () => aud.evaluate(() => document.querySelector('#held .overlay-card').hasAttribute('data-hidden'));
    ok(await step() === 0 && await card(), 'on arrival the card is hidden and its figure on its first step');
    await key(spk, 'ArrowDown', 400);
    ok(await step() === 0, 'the first press brings the paragraph, not the hidden card\'s step', String(await step()));
    await key(spk, 'ArrowDown', 400);
    ok(!(await card()) && await step() === 0, 'the second press brings the card on its first step', String(await step()));
    await key(spk, 'ArrowDown', 400);
    ok(await step() === 1, 'the third press plays the card\'s step', String(await step()));
    ok(beats.total === 4, 'the chunk counts the card\'s step after the card', String(beats.total));

    // ── 8. a figure focused in the cockpit stays focused on the projection ──
    await goTo(spk, 'focus');
    await spk.bringToFront();
    await spk.locator('#psiINT-stage #focus figure.figure-diagram').click();
    await wait(spk, 400);
    ok(await aud.evaluate(() => !!focusedFigure), 'a click in the cockpit focuses the figure on the projection');
    await key(spk, 'a', 400);  // a knob: the theme, which rides the snapshot
    const f = { aud: await aud.evaluate(() => !!focusedFigure), spk: await spk.evaluate(() => !!focusedFigure) };
    ok(f.aud && f.spk, 'a knob pressed in the cockpit leaves the figure focused in both windows', JSON.stringify(f));
    await key(spk, 'Escape', 300);
    ok(!(await aud.evaluate(() => !!focusedFigure)), 'Esc in the cockpit closes it on both');

    // ── 6. leaving the overview onto a slide goes through the landing path ──
    await goTo(spk, 'one');
    await aud.evaluate(() => { window.__landed = []; const o = restartAutoplay; restartAutoplay = function () { window.__landed.push(flatChunks[state.activeIdx].id); return o.apply(this, arguments); }; });
    await key(aud, 'o', 400);
    await key(aud, 'ArrowDown', 200);
    await key(aud, 'ArrowDown', 200);
    await key(aud, 'ArrowDown', 200);
    await key(aud, 'Enter', 600);
    const ov = await aud.evaluate(() => ({ id: flatChunks[state.activeIdx].id, ov: overview, landed: window.__landed }));
    ok(ov.id === 'auto' && !ov.ov, 'Enter in the overview lands on the selected slide', JSON.stringify(ov));
    ok(ov.landed.includes('auto'), 'through the landing path, so autoplay starts there', JSON.stringify(ov.landed));
    ok(await idOf(spk) === 'auto', 'and the cockpit follows', await idOf(spk));

    await spk.close();
    await aud.close();

    // ── 5. under fade, a second press within the swap acts on the target ──
    const f2 = await serve(fade.dir);
    try {
      const fa = await ctx.newPage();
      fa.on('pageerror', e => errors.push('fade: ' + e));
      await fa.goto(`http://127.0.0.1:${f2.port}/audience.html#one`, { waitUntil: 'load' });
      await wait(fa, 700);
      ok(await idOf(fa) === 'one', 'the fading deck opens on #one', await idOf(fa));
      await fa.keyboard.press('ArrowDown');
      await wait(fa, 40);
      await fa.keyboard.press('ArrowDown');
      await wait(fa, 800);
      ok(await idOf(fa) === 'three', 'two forward presses inside one fade go two slides', await idOf(fa));
      await fa.keyboard.press('ArrowDown');
      await wait(fa, 40);
      await fa.keyboard.press('ArrowUp');
      await wait(fa, 800);
      const back = await fa.evaluate(() => ({ id: flatChunks[state.activeIdx].id, autoR: revealed.auto }));
      // Forward lands on #auto at its opening beat, so back from there is
      // the slide before it. Read off the stale index it was #two.
      ok(back.id === 'three', 'forward then back inside one fade acts on the slide being arrived at',
        JSON.stringify(back));
      await fa.close();
    } finally { f2.server.close(); }
  } finally {
    await ctx.close();
    server.close();
  }
  ok(errors.length === 0, 'no page errors in either window', errors.join(' | '));
}
