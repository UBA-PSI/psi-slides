/*
 * The two live windows, and the defects the pre-2.0.0 review reproduced
 * between them: what a frozen cockpit takes from the projection, where a
 * reloaded projection boots, what a second S does, where autoplay starts,
 * what a press during a fade acts on, how the overview is left, what a
 * diagram inside a `from N` card does before the card arrives, whether
 * a figure focused in the cockpit stays focused on the projection, what a
 * thaw does with a card opened or closed while frozen, whether an autoplay
 * figure's clock outlives a cockpit's move under fade, what two column
 * presses inside one fade do, and which cockpit S finds from file:// on a
 * tab that went from one deck to another.
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

// Columns, for the column keys under fade. Its own deck because a column
// heading inserts a divider slide, which would move every press above.
const COLS = `
## title: {#title}

# Part A

## free: A one {#a1}

Words.

## free: A two {#a2}

Words.

# Part B

## free: B one {#b1}

Words.

## free: B two {#b2}

Words.

# Part C

## free: C one {#c1}

Words.

# Part D

## free: D one {#d1}

Words.
`;

function buildDeck(front, body = BODY) {
  const dir = tmpDir('psi-live-sync-');
  fs.writeFileSync(path.join(dir, 'source.md'), `---\ntitle: Sync\ncollapse: none\n${front}---\n${body}`);
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
  const cols = buildDeck('transition: fade\n', COLS);
  ok(cols.status === 0, 'the fading deck with columns builds', cols.out);
  if (pan.status !== 0 || fade.status !== 0 || cols.status !== 0) return;

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

    // ── 10. a thaw reconciles the focus card ──
    // A frozen cockpit sends no figure message, and the thaw's snapshot is
    // on the same slide, so the card has to be named on its own.
    const card8 = spk.locator('#psiINT-stage #focus figure.figure-diagram');
    const focusedIn = async () => ({ aud: await aud.evaluate(() => !!focusedFigure), spk: await spk.evaluate(() => !!focusedFigure) });
    await spk.bringToFront();
    await card8.click();
    await wait(spk, 300);
    await key(spk, 'v', 200);
    await key(spk, 'Escape', 200);
    ok(await aud.evaluate(() => !!focusedFigure), 'closed in a frozen cockpit, the card stays on the projection');
    await key(spk, 'v', 500);
    let fc = await focusedIn();
    ok(!fc.aud && !fc.spk, 'V, Esc, V: the thaw closes the card on the projection', JSON.stringify(fc));
    await card8.click();
    await wait(spk, 300);
    await key(spk, 'v', 200);
    await goTo(spk, 'four');
    await goTo(spk, 'focus');
    ok(await aud.evaluate(() => !!focusedFigure), 'frozen, away and back: the projection still shows the card');
    await key(spk, 'v', 500);
    fc = await focusedIn();
    ok(!fc.aud && !fc.spk, 'and the thaw on the same slide closes it', JSON.stringify(fc));
    await key(spk, 'v', 200);
    await card8.click();
    await wait(spk, 300);
    await key(spk, '+', 200);
    ok(!(await aud.evaluate(() => !!focusedFigure)), 'a card opened in a frozen cockpit stays off the projection');
    await key(spk, 'v', 500);
    const zs = { aud: await aud.evaluate(() => focusedFigure ? figureScale : 0), spk: await spk.evaluate(() => figureScale) };
    ok(zs.aud > 1 && zs.aud === zs.spk, 'and the thaw opens it there, at the cockpit\'s zoom', JSON.stringify(zs));
    await key(spk, 'Escape', 300);

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

      // ── 11. a cockpit's move off an autoplay figure, under fade ──
      // The projection lands the move at the bottom of its dip, and the
      // figure's clock used to tick inside it: the tick advanced the slide
      // being left and broadcast it, and the cockpit went back there while
      // the projection went on - with no broadcast from the landing, which
      // runs as a remote apply.
      const p2 = await openPair(ctx, f2.port, errors);
      await goTo(p2.spk, 'auto');
      ok(await idOf(p2.aud) === 'auto', 'fade: the cockpit drives the projection onto the autoplay figure', await idOf(p2.aud));
      // End to end, timed so the old clock's next tick falls in the dip: the
      // press comes as the last beat lands, and the cockpit's dip plus the
      // projection's are about one autoplay delay long.
      const segs = await p2.aud.evaluate(() => countSegments(flatChunks[state.activeIdx].el));
      await p2.aud.waitForFunction((n) => revealed.auto === n, segs, { timeout: 4000, polling: 5 }).catch(() => {});
      await p2.spk.waitForFunction((n) => revealed.auto === n, segs, { timeout: 1000, polling: 5 }).catch(() => {});
      await p2.spk.bringToFront();
      await p2.spk.keyboard.press('ArrowDown');
      await wait(p2.spk, 900);
      const both = { aud: await idOf(p2.aud), spk: await idOf(p2.spk) };
      ok(both.aud === 'held' && both.spk === 'held', 'fade: ↓ on the last beat moves both windows off the figure', JSON.stringify(both));
      // And directly: inside the projection's dip the slide being left has no
      // clock. The figure is made new again in both windows so it plays.
      await goTo(p2.spk, 'three');
      await p2.aud.evaluate(() => { delete revealed.auto; autoplayStoppedOn = null; });
      await p2.spk.evaluate(() => { delete revealed.auto; autoplayStoppedOn = null; });
      await goTo(p2.spk, 'auto');
      await p2.aud.waitForFunction(() => autoplayTimer !== 0, null, { timeout: 2000 }).catch(() => {});
      await p2.spk.evaluate(() => { location.hash = '#held'; });
      const dip = await p2.aud.waitForFunction(() => fadePending ? { timer: autoplayTimer } : null, null, { timeout: 2000, polling: 5 })
        .then((h) => h.jsonValue()).catch(() => null);
      ok(dip && dip.timer === 0, 'fade: inside the dip the figure being left has stopped its clock', JSON.stringify(dip));
      await p2.spk.close();
      await p2.aud.close();
    } finally { f2.server.close(); }

    // ── 12. under fade, two quick column presses move two columns ──
    // nextCol and prevCol read the live slide to find the target, so a press
    // inside the first one's dip counted from the column being left.
    const f3 = await serve(cols.dir);
    try {
      const fc3 = await ctx.newPage();
      fc3.on('pageerror', e => errors.push('cols: ' + e));
      await fc3.goto(`http://127.0.0.1:${f3.port}/audience.html#a1`, { waitUntil: 'load' });
      await wait(fc3, 700);
      const colOf = () => fc3.evaluate(() => flatChunks[state.activeIdx].colIdx);
      const c0 = await colOf();
      await fc3.keyboard.press('Shift+ArrowRight');
      await wait(fc3, 40);
      await fc3.keyboard.press('Shift+ArrowRight');
      await wait(fc3, 800);
      ok(await colOf() === c0 + 2, 'fade: two Shift-→ inside one fade move two columns', `${c0} -> ${await colOf()}`);
      await fc3.keyboard.press('Shift+ArrowLeft');
      await wait(fc3, 40);
      await fc3.keyboard.press('Shift+ArrowLeft');
      await wait(fc3, 800);
      // On a column's head, Shift-← leaves for the head of the one before.
      ok(await colOf() === c0, 'fade: and two Shift-← inside one fade move two columns back',
        `${c0 + 2} -> ${await colOf()}`);
      // The hash route (G, the contents, a search hit all compare with the
      // live slide the same way): back to the slide being left inside a dip.
      // The address has to change to fire, so it names #b1 and the keys walk
      // on to #b2 before the press whose dip it lands in.
      await fc3.evaluate(() => { location.hash = '#b1'; });
      await wait(fc3, 700);
      await fc3.keyboard.press('ArrowDown');
      await wait(fc3, 700);
      ok(await idOf(fc3) === 'b2', 'fade: ↓ walks on to #b2', await idOf(fc3));
      await fc3.keyboard.press('ArrowDown');
      await wait(fc3, 30);
      await fc3.evaluate(() => { location.hash = '#b2'; });
      await wait(fc3, 800);
      ok(await idOf(fc3) === 'b2', 'fade: an address pointing back at the slide being left lands there', await idOf(fc3));
      await fc3.close();
    } finally { f3.server.close(); }

    // ── 13. S from file:// finds only this deck's cockpit ──
    // A file:// page cannot read another file's address, and the window
    // named psi-slides-speaker that S finds used to be taken for this deck's
    // cockpit on that ground alone. A tab that went from one deck to another
    // then drove the first deck's cockpit. Two decks, two folders.
    {
      const ctx2 = await page.context().browser().newContext({ viewport: { width: 1440, height: 900 } });
      try {
        const urlA = 'file://' + path.join(pan.dir, 'audience.html');
        const urlB = 'file://' + path.join(fade.dir, 'audience.html');
        const tab = await ctx2.newPage();
        tab.on('pageerror', e => errors.push('fileA: ' + e));
        await tab.goto(urlA, { waitUntil: 'load' });
        await wait(tab, 500);
        const [cA] = await Promise.all([ctx2.waitForEvent('page'), tab.keyboard.press('s')]);
        await cA.waitForLoadState();
        await wait(cA, 700);
        ok(cA.url().startsWith('file://' + pan.dir), 'file://: S opens deck A\'s cockpit', cA.url());
        await tab.goto(urlB, { waitUntil: 'load' });
        await wait(tab, 600);
        // Deck A's cockpit still holds this tab as its opener: what it sends
        // is another deck's and is dropped.
        const bBefore = await idOf(tab);
        await key(cA, 'ArrowDown', 500);
        ok(await idOf(tab) === bBefore, 'file://: deck A\'s cockpit does not move deck B\'s projection', `${bBefore} -> ${await idOf(tab)}`);
        await tab.bringToFront();
        await tab.keyboard.press('s');
        await wait(tab, 1200);
        ok(cA.url().startsWith('file://' + fade.dir) && /speaker\.html$/.test(cA.url()),
          'file://: S on deck B sends the found window to deck B\'s cockpit', cA.url());
        ok(ctx2.pages().length === 2, 'and opens no second window', String(ctx2.pages().length));
        await key(tab, 'ArrowDown', 600);
        const ids = { aud: await idOf(tab), spk: await idOf(cA) };
        ok(ids.aud === ids.spk && ids.aud !== bBefore, 'deck B\'s projection and its cockpit move together', JSON.stringify(ids));
        // This deck's own cockpit, found again after the projection reloads,
        // is asked, answers, and is left alone.
        await cA.evaluate(() => { window.__marker = 'kept'; });
        await tab.reload({ waitUntil: 'load' });
        await wait(tab, 600);
        await key(tab, 's', 800);
        ok(await cA.evaluate(() => window.__marker || null) === 'kept', 'file://: S finds this deck\'s own cockpit and does not reload it');
        ok(await tab.evaluate(() => hasLivePeer()) && ctx2.pages().length === 2, 'and takes it as its peer again');
      } finally { await ctx2.close(); }
    }
  } finally {
    await ctx.close();
    server.close();
  }
  ok(errors.length === 0, 'no page errors in either window', errors.join(' | '));
}
