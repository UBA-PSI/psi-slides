/*
 * The ? panel as a command palette, in both live views, and the start menu
 * on the projection.
 *
 * A spec and not a gate, because all of it is about focus, a keydown
 * listener, a box that must not move, and a menu whose life is a page load:
 * Cmd-K and Ctrl-K open the panel with the field focused; a word and Enter
 * run the row it selects, exactly as the key would (B blanks); a doc row
 * runs nothing; Esc unwinds the panel first, as before; the panel's box is
 * the same before and after typing, and a filter lays its hits out as one
 * list across the box. The start menu stands on slide 1 of a fresh page
 * load, folds on the first move from either window, on W and on its chevron,
 * remembers the chevron across a reload, answers a tap, and is in no other
 * view and in no frame of --frames. Folded, it leaves a chevron beside the ?
 * circle that opens it again on any slide and forgets the stored choice. What the commands gate
 * already holds without a browser - which rows name a command, that Cmd-K is
 * answered before the chord guard, what the menu is made of - is not
 * repeated here.
 *
 * It builds a deck of its own, three slides with a reveal on the first, for
 * the reason test/README.md gives: the menu is about the first slide of a
 * page load and its first beat, and no lecture here owes a spec that shape.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpDir } from './tmp.mjs';
import { serve, ROOT } from './harness.mjs';

export const name = 'help · the palette and the start menu';
export const lecture = 'tutorial';
export const view = 'audience';

const DECK = `---
title: Palette
---

# Part

## statement: One {#one}

The first slide.

---

Its second beat.

## statement: Two {#two}

The second slide.

## statement: Three {#three}

The third slide.
`;

function build(dir, ...flags) {
  return spawnSync(process.execPath, [path.join(ROOT, 'build.js'), path.join(dir, 'source.md'), ...flags],
    { cwd: ROOT, encoding: 'utf8' });
}

export async function run({ page, report }) {
  const { ok } = report;
  const dir = tmpDir('psi-palette-');
  fs.writeFileSync(path.join(dir, 'source.md'), DECK);
  const b = build(dir);
  ok(b.status === 0, 'the fixture builds', (b.stdout || '') + (b.stderr || ''));
  if (b.status !== 0) return;
  const srv = await serve(dir);
  const url = (v) => `http://127.0.0.1:${srv.port}/${v}.html`;

  const panel = (p = page) => p.evaluate(() => {
    const o = document.getElementById('psiINT-help-overlay');
    const f = o.querySelector('#psiINT-help-search');
    const inner = document.getElementById('psiINT-help-inner').getBoundingClientRect();
    const sel = o.querySelector('dt.help-sel');
    return {
      open: !o.classList.contains('hidden'),
      focused: document.activeElement === f,
      value: f.value,
      box: [inner.x, inner.y, inner.width, inner.height].map(Math.round).join(','),
      sel: sel ? sel.dataset.cmd : null,
    };
  });
  const knobs = (p = page) => p.evaluate(() => ({
    blanked: !!state.blanked, font: state.font, overview: document.body.classList.contains('overview-mode'),
  }));
  const menu = (p = page) => p.evaluate(() => {
    const m = document.getElementById('psiINT-start-menu');
    if (!m) return 'absent';
    return !m.hidden && m.getBoundingClientRect().width > 0 ? 'shown' : 'hidden';
  });
  const chev = (p = page) => p.evaluate(() => {
    const c = document.getElementById('psiINT-start-menu-show');
    if (!c) return 'absent';
    return getComputedStyle(c).display !== 'none' && c.getBoundingClientRect().width > 0 ? 'shown' : 'hidden';
  });
  const stored = (p = page) => p.evaluate(() => { try { return localStorage.getItem('psi-slides:start-menu'); } catch (e) { return 'n/a'; } });
  const press = async (k, wait = 150, p = page) => { await p.keyboard.press(k); await p.waitForTimeout(wait); };
  const type = async (s, p = page) => { await p.keyboard.type(s, { delay: 20 }); await p.waitForTimeout(150); };
  const fresh = async (v = 'audience') => {
    await page.goto(url(v), { waitUntil: 'load' });
    await page.evaluate(() => { try { localStorage.clear(); } catch (e) { /* private window */ } });
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(600);
  };

  try {
    // ── the palette, in both views ──
    for (const v of ['audience', 'speaker']) {
      for (const chord of ['Meta+k', 'Control+k']) {
        await fresh(v);
        await press(chord, 250);
        const p = await panel();
        ok(p.open && p.focused && p.sel === null, `${v}: ${chord} opens the panel with the field focused and nothing selected`, JSON.stringify(p));
        await press(chord, 200);
        ok(!(await panel()).open, `${v}: ${chord} again, from the field, closes it`);
      }

      await fresh(v);
      const before = await knobs();
      await press('Meta+k', 250);
      const box0 = (await panel()).box;
      await type('bl');
      const box1 = (await panel()).box;
      await type('ank');
      let p = await panel();
      ok(box0 === box1 && box1 === p.box, `${v}: the panel's box does not move while the field is typed into`, [box0, box1, p.box].join(' | '));
      ok(p.sel === 'blank', `${v}: "blank" selects the B row`, String(p.sel));
      // A filter: the hits are one list across the box - every key in one
      // column at the box's left, and a line as wide as the box.
      await press('Backspace'); await press('Backspace'); await press('Backspace');
      await press('Backspace'); await press('Backspace');
      await type('note');
      const lay = await page.evaluate(() => {
        const g = document.querySelector('#psiINT-help-overlay .help-grid');
        const gr = g.getBoundingClientRect();
        const pad = parseFloat(getComputedStyle(g).paddingLeft) + parseFloat(getComputedStyle(g).paddingRight);
        const dts = [...g.querySelectorAll('.help-results dt')].filter((d) => !d.hidden);
        const lefts = new Set(dts.map((d) => Math.round(d.getBoundingClientRect().left)));
        const widths = dts.map((d) => d.nextElementSibling.nextElementSibling.getBoundingClientRect().right - d.getBoundingClientRect().left);
        return { n: dts.length, lefts: lefts.size, left: Math.round(dts[0].getBoundingClientRect().left - gr.left),
          ratio: Math.min(...widths) / (g.clientWidth - pad) };
      });
      ok(lay.n > 1 && lay.lefts === 1 && lay.left <= 1 && lay.ratio > 0.97,
        `${v}: a filter lays its hits out as one column across the whole box`, JSON.stringify(lay));
      const box2 = (await panel()).box;
      ok(box2 === box0, `${v}: and the box keeps its size`, [box0, box2].join(' | '));
      await press('Escape');
      const unf = await page.evaluate(() => {
        const g = document.querySelector('#psiINT-help-overlay .help-grid');
        return new Set([...g.querySelectorAll('dt')].map((d) => Math.round(d.getBoundingClientRect().left))).size;
      });
      ok(unf > 1, `${v}: an empty field brings the reference's columns back`, String(unf));

      // Best match first: the command a word names before the rows that
      // mention it, and a row of four commands is four lines, each runnable.
      const hits = () => page.evaluate(() => [...document.querySelectorAll('#psiINT-help-overlay .help-results dt')]
        .filter((d) => !d.hidden).map((d) => d.dataset.cmd || '-'));
      await type('overview');
      let h = await hits();
      ok(h[0] === 'overview' && (await panel()).sel === 'overview', `${v}: "overview" puts O first and selects it`, h.join(' '));
      await press('Escape');
      await type('shift');
      h = await hits();
      ok(['collapse-back', 'font-back', 'theme-back', 'slide-numbers-back', 'next-column', 'prev-column'].every((id) => h.includes(id)),
        `${v}: Shift-C F A L and Shift-→ ← are a line each, each runnable`, h.join(' '));
      await press('Escape');
      await type('font backwards');
      ok((await panel()).sel === 'font-back', `${v}: "font backwards" selects Shift-F`, String((await panel()).sel));
      const font0 = (await knobs()).font;
      await press('Enter', 250);
      ok(!(await panel()).open && (await knobs()).font !== font0, `${v}: and Enter runs it`, (await knobs()).font);
      await press('f', 200);
      await press('Meta+k', 250);
      await type('blank');
      await press('Enter', 250);
      p = await panel();
      ok(!p.open && (await knobs()).blanked === !before.blanked, `${v}: Enter closes the panel and blanks, as B does`, JSON.stringify(await knobs()));
      await press('b', 200);

      // The arrows walk the runnable rows, and a click on one runs it.
      await press('Meta+k', 250);
      await type('projection');
      const first = (await panel()).sel;
      await press('ArrowDown');
      const second = (await panel()).sel;
      await press('ArrowUp');
      ok(first && second && second !== first && (await panel()).sel === first,
        `${v}: ↓ and ↑ move the selection between runnable rows`, [first, second, (await panel()).sel].join(' → '));
      await press('Escape');
      await type('font');
      await page.locator('#psiINT-help-overlay .help-results dt[data-cmd="font"] + dd').click();
      await page.waitForTimeout(250);
      ok(!(await panel()).open && (await knobs()).font !== before.font, `${v}: a click on the row runs it`, (await knobs()).font);
      await press('Shift+F', 200);

      // A doc row is not runnable: clicking it leaves the panel open and
      // nothing happens; a query that finds only doc rows selects nothing.
      await press('Meta+k', 250);
      await type('drag the slide');
      p = await panel();
      ok(p.sel === null, `${v}: a doc row is never selected`, String(p.sel));
      const docRow = page.locator('#psiINT-help-overlay .help-results dd', { hasText: 'pan within a chunk' });
      ok(!(await docRow.evaluate((d) => d.classList.contains('help-run'))), `${v}: and is not marked runnable`);
      await docRow.click();
      await press('Enter', 200);
      ok((await panel()).open, `${v}: a click or Enter on it runs nothing and leaves the panel open`);
      await press('Escape');
      await press('Escape', 200);

      // Esc: the panel first, the overview behind it second.
      await press('o', 400);
      await press('Meta+k', 250);
      await type('zz');
      await press('Escape');
      p = await panel();
      ok(p.open && p.value === '', `${v}: Esc first empties the field`);
      await press('Escape', 250);
      ok(!(await panel()).open && (await knobs()).overview, `${v}: the next Esc closes the panel and leaves the overview`);
      await press('Escape', 400);
      ok(!(await knobs()).overview, `${v}: and the one after that leaves the overview`);

      // Cmd-K in another field is that field's.
      await press('/', 250);
      await press('Meta+k', 200);
      ok(!(await panel()).open, `${v}: Cmd-K typed into the search box does not open the panel`);
      await press('Escape', 200);
    }

    // ── the start menu ──
    await fresh();
    ok(await menu() === 'shown', 'the start menu stands on slide 1 of a fresh page load');
    ok(await chev() === 'hidden', 'and the chevron that brings it back does not');
    const labels = await page.$$eval('#psiINT-start-menu button[data-cmd]', (bs) => bs.map((x) => x.textContent.trim()));
    ok(labels.join(' | ') === 'Fullscreen W | Speaker cockpit S | Print view P', 'with the three names and keys from the table', labels.join(' | '));
    await press('ArrowRight', 300);
    ok(await menu() === 'hidden', 'the first forward press - a beat on slide 1 - ends it');
    ok(await chev() === 'shown', 'and leaves the chevron beside the ? circle');
    await press('ArrowLeft', 300);
    ok(await menu() === 'hidden', 'and going back to where it started does not bring it back');
    await press('ArrowRight', 300);
    await press('ArrowRight', 300);
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(500);
    ok(await menu() === 'hidden', 'a reload that opens on a later slide opens without it');
    ok(await chev() === 'shown', 'but with the chevron');
    await page.click('#psiINT-start-menu-show');
    await page.waitForTimeout(200);
    ok(await menu() === 'shown' && await chev() === 'hidden', 'the chevron opens the menu mid-talk, on demand');
    await press('ArrowRight', 300);
    ok(await menu() === 'hidden' && await chev() === 'shown', 'and the next move folds it again');
    await press('b', 300);
    ok(await chev() === 'hidden', 'a blanked projection hides the chevron as it hides the ? circle');
    await press('b', 300);
    await fresh();
    ok(await menu() === 'shown', 'a page load on slide 1 brings it back');

    await press('w', 500);
    ok(await page.evaluate(() => !!document.fullscreenElement) && await menu() === 'hidden', 'W ends it');
    await press('w', 400);

    await fresh();
    await page.click('#psiINT-start-menu-hide');
    await page.waitForTimeout(200);
    ok(await menu() === 'hidden', 'the chevron puts it away');
    ok(await chev() === 'shown' && await stored() === 'away', 'leaves the way back beside the ? circle, and remembers the choice');
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(500);
    ok(await menu() === 'hidden', 'and it stays away across a reload');
    ok(await chev() === 'shown', 'with the way back still there');
    await page.click('#psiINT-start-menu-show');
    await page.waitForTimeout(200);
    ok(await menu() === 'shown' && await chev() === 'hidden', 'the way back opens the menu again');
    ok(await stored() === null, 'and forgets the stored choice', String(await stored()));
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(500);
    ok(await menu() === 'shown', 'so a reload on slide 1 opens with the menu');

    await fresh();
    await page.goto(url('audience') + '#two', { waitUntil: 'load' });
    await page.waitForTimeout(500);
    ok(await menu() === 'hidden', 'an address naming a slide opens without it');

    // The cockpit, opened from the menu, moves the projection: that ends it.
    await fresh();
    const [spk] = await Promise.all([
      page.context().waitForEvent('page'),
      page.click('#psiINT-start-menu [data-cmd="cockpit"]'),
    ]);
    await spk.waitForLoadState();
    await spk.waitForTimeout(900);
    ok(/speaker\.html/.test(spk.url()), 'the cockpit entry opens the cockpit', spk.url());
    ok(await menu() === 'shown', 'and the menu is still up while nothing has moved');
    ok(await menu(spk) === 'absent' && await chev(spk) === 'absent', 'the cockpit carries no start menu and no chevron');
    await press('Meta+k', 250, spk);
    await type('blank', spk);
    await press('Enter', 300, spk);
    ok((await knobs()).blanked, 'B run from the cockpit\'s palette blanks the projection');
    await press('b', 300, spk);
    await press('ArrowRight', 500, spk);
    ok(await menu() === 'hidden', 'a forward press in the cockpit ends the projection\'s menu');
    await spk.close();

    await page.goto(url('print'), { waitUntil: 'load' });
    ok(await menu() === 'absent' && await chev() === 'absent', 'the print view carries no start menu and no chevron');

    // A tap.
    const touch = await page.context().browser().newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const tp = await touch.newPage();
    await tp.goto(url('audience'), { waitUntil: 'load' });
    await tp.waitForTimeout(600);
    ok(await menu(tp) === 'shown', 'on a phone the menu stands too');
    const [pr] = await Promise.all([
      touch.waitForEvent('page'),
      tp.tap('#psiINT-start-menu [data-cmd="print"]'),
    ]);
    await pr.waitForLoadState();
    ok(/print\.html/.test(pr.url()), 'and a tap on Print view opens the print view', pr.url());
    const tapBox = await tp.$eval('#psiINT-start-menu [data-cmd="print"]', (x) => x.getBoundingClientRect().height);
    ok(tapBox >= 44, 'its targets are a fingertip high', String(tapBox));
    await tp.tap('#psiINT-start-menu-hide');
    await tp.waitForTimeout(200);
    const chevBox = await tp.$eval('#psiINT-start-menu-show', (x) => { const r = x.getBoundingClientRect(); return [r.width, r.height]; });
    ok(chevBox[0] >= 44 && chevBox[1] >= 44, 'and so is the chevron that brings it back', chevBox.join('x'));
    await tp.tap('#psiINT-start-menu-show');
    await tp.waitForTimeout(200);
    ok(await menu(tp) === 'shown', 'which a tap answers');
    await touch.close();

    // --frames: the first frame is the room's first slide, not a set-up.
    const shots = path.join(dir, 'frames');
    const f = build(dir, '--frames', shots);
    const png = fs.existsSync(shots) ? fs.readdirSync(shots).filter((n) => /^001-/.test(n))[0] : null;
    if (f.status !== 0 || !png) {
      ok(/no Chrome|playwright-core is not installed/.test(f.stderr || ''), '--frames ran, or said why not', (f.stdout || '') + (f.stderr || ''));
    } else {
      await page.goto(url('audience'), { waitUntil: 'load' });
      const data = fs.readFileSync(path.join(shots, png)).toString('base64');
      // The strip the menu stands in, beside the circle: in frame 1 it must
      // be the paper and nothing else.
      const colours = await page.evaluate(async (b64) => {
        const img = new Image();
        img.src = 'data:image/png;base64,' + b64;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        const g = c.getContext('2d');
        g.drawImage(img, 0, 0);
        const d = g.getImageData(44, img.height - 36, 470, 24).data;
        const seen = new Set();
        for (let i = 0; i < d.length; i += 4) seen.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]);
        return seen.size;
      }, data);
      ok(colours === 1, '--frames: frame 1 has nothing where the start menu or its chevron would stand', `${colours} colours in that strip`);
    }
  } finally {
    srv.server.close();
  }
}
