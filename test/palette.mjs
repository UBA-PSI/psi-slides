/*
 * The ? panel as a command palette, in both live views, and the start menu
 * on the projection.
 *
 * A spec and not a gate, because all of it is about focus, a keydown
 * listener, a box that must not move, and a menu whose life is a page load:
 * Cmd-K and Ctrl-K open the panel with the field focused; a word and Enter
 * run the row it selects, exactly as the key would (B blanks); a doc row
 * runs nothing; Esc unwinds the panel first, as before; the panel's box is
 * the same before and after typing, and the rows are one column, filtered
 * or not: the runnable ones first, so ↓ always lands on the nearest runnable
 * row below and never passes over one it cannot select. The start menu
 * stands on slide 1 of a fresh page
 * load, folds on the first move from either window, on W and on its chevron,
 * remembers the chevron across a reload, answers a tap, and is in no other
 * view and in no frame of --frames. Built alone (--audience-only into an
 * empty folder), it offers no entry for a view that is not beside it, and S,
 * P and the palette say so instead of opening a window - and so do they
 * when the build saw print.html and it was deleted later, opened from
 * file://, where the page probes for it, in the projection and in the
 * cockpit alike. The other way round too: a view a
 * later partial build put beside it is found and offered, whatever the
 * first build wrote. Folded, it leaves a chevron beside the ?
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

export async function run({ page, report, errors: pageErrors }) {
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
        const dts = [...g.querySelectorAll('dt')].filter((d) => d.getClientRects().length);
        return { n: dts.length, lefts: new Set(dts.map((d) => Math.round(d.getBoundingClientRect().left))).size,
          descs: new Set(dts.map((d) => Math.round(d.nextElementSibling.getBoundingClientRect().left))).size };
      });
      ok(unf.n > 40 && unf.lefts === 1 && unf.descs === 1,
        `${v}: an empty field shows the reference as one column too - one left edge for the keys, one for the words`, JSON.stringify(unf));

      // The arrows: from nothing to the first runnable row, then from each
      // to the nearest runnable row below it, every one scrolled into view,
      // and no row they cannot select standing between two they can.
      const walk = async (what) => {
        const order = await page.evaluate(() => {
          const g = document.querySelector('#psiINT-help-overlay .help-grid');
          const root = g.hasAttribute('data-filtered') ? g.querySelector('.help-results') : g;
          return [...root.querySelectorAll('dt')].filter((d) => d.getClientRects().length)
            .map((d) => (d.classList.contains('help-run') ? 'run' : 'ref'));
        });
        const firstRef = order.indexOf('ref');
        ok(order.includes('run') && (firstRef < 0 || order.slice(firstRef).every((k) => k === 'ref')),
          `${v} ${what}: every runnable row stands before every row the arrows cannot select`,
          order.map((k) => k[1]).join(''));
        const list = await page.evaluate(() => {
          const g = document.querySelector('#psiINT-help-overlay .help-grid');
          const root = g.hasAttribute('data-filtered') ? g.querySelector('.help-results') : g;
          return [...root.querySelectorAll('dt.help-run')].filter((d) => d.getClientRects().length)
            .map((d) => d.dataset.cmd);
        });
        const steps = list.length;
        const bad = [];
        for (let i = 0; i <= steps; i++) {
          if (i > 0 || !(await panel()).sel) await page.keyboard.press('ArrowDown');
          const at = await page.evaluate(() => {
            const g = document.querySelector('#psiINT-help-overlay .help-grid');
            const sel = g.querySelector('dt.help-sel');
            if (!sel) return null;
            const r = sel.getBoundingClientRect();
            const gr = g.getBoundingClientRect();
            return { cmd: sel.dataset.cmd, inView: r.top >= gr.top - 1 && r.bottom <= gr.bottom + 1 };
          });
          const want = list[Math.min(i, steps - 1)];
          if (!at) { bad.push(`${i}: nothing selected`); break; }
          if (at.cmd !== want) bad.push(`${i}: ${at.cmd}, not ${want}`);
          if (!at.inView) bad.push(`${at.cmd} out of view`);
        }
        ok(bad.length === 0, `${v} ${what}: ↓ walks every runnable row in order, in view, and stops at the last`, bad.join('; '));
        return steps;
      };
      await press('Escape', 200);
      await press('Meta+k', 250);
      // The geometric half: ↓ from each runnable row lands on the row whose
      // top is the next one down among the runnable rows.
      const geo = async (what) => {
        const res = await page.evaluate(async () => {
          const g = document.querySelector('#psiINT-help-overlay .help-grid');
          const root = g.hasAttribute('data-filtered') ? g.querySelector('.help-results') : g;
          const runs = [...root.querySelectorAll('dt.help-run')].filter((d) => d.getClientRects().length);
          const abs = (d) => d.getBoundingClientRect().top + g.scrollTop;
          const bad = [];
          for (let i = 0; i < runs.length - 1; i++) {
            const here = abs(runs[i]);
            const below = runs.filter((d) => abs(d) > here + 1).sort((a, b) => abs(a) - abs(b))[0];
            if (below !== runs[i + 1]) bad.push(runs[i].dataset.cmd + ' -> ' + (below ? below.dataset.cmd : 'none'));
          }
          return { n: runs.length, bad };
        });
        ok(res.n > 3 && res.bad.length === 0, `${v} ${what}: the next runnable row in the arrows' order is the nearest one below`, res.bad.join(', ') || String(res.n));
      };
      await geo('unfiltered');
      const n0 = await walk('unfiltered');
      ok(n0 > 20, `${v}: the unfiltered panel has more than twenty runnable rows`, String(n0));
      await press('PageUp');
      const pgUp = (await panel()).sel;
      await press('PageDown');
      const pgDn = (await panel()).sel;
      ok(pgUp && pgDn && pgUp !== pgDn, `${v}: PageUp and PageDown move the selection by a panel`, [pgUp, pgDn].join(' → '));
      await press('Escape', 200);
      await press('Meta+k', 250);
      await type('the');
      await geo('filtered');
      await walk('filtered by "the"');
      await press('Escape');

      // The tracking of the panel's small capitals: a little, not spaced out.
      const track = await page.evaluate(() => [
        '#psiINT-help-inner h2', '.help-grid h3',
      ].map((q) => { const el = document.querySelector(q); const cs = getComputedStyle(el);
        return parseFloat(cs.letterSpacing) / parseFloat(cs.fontSize); }));
      ok(track.every((t) => t > 0 && t <= 0.1), `${v}: the panel's title and section headings are tracked at most 0.1em`, track.map((t) => t.toFixed(3)).join(' '));

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
    const mTrack = await page.$eval('#psiINT-start-menu button[data-cmd]', (x) => {
      const cs = getComputedStyle(x); return parseFloat(cs.letterSpacing) / parseFloat(cs.fontSize);
    });
    ok(mTrack > 0 && mTrack <= 0.1, 'its small capitals are tracked at most 0.1em, like the panel\'s', mTrack.toFixed(3));
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

    // A projection built alone: no entry for a view that is not beside it,
    // and its key says so rather than opening a window onto a missing file.
    {
      const lone = tmpDir('psi-palette-lone-');
      fs.writeFileSync(path.join(lone, 'source.md'), DECK);
      const lb = build(lone, '--audience-only');
      ok(lb.status === 0 && !fs.existsSync(path.join(lone, 'speaker.html')) && !fs.existsSync(path.join(lone, 'print.html')),
        '--audience-only into an empty folder writes audience.html alone', (lb.stdout || '') + (lb.stderr || ''));
      const ls = await serve(lone);
      try {
        await page.goto(`http://127.0.0.1:${ls.port}/audience.html`, { waitUntil: 'load' });
        await page.evaluate(() => { try { localStorage.clear(); } catch (e) { /* private window */ } });
        await page.reload({ waitUntil: 'load' });
        await page.waitForTimeout(600);
        const lonely = await page.$$eval('#psiINT-start-menu button[data-cmd]', (bs) => bs.filter((x) => !x.hidden).map((x) => x.textContent.trim()));
        ok(lonely.join(' | ') === 'Fullscreen W', 'its start menu offers Fullscreen alone', lonely.join(' | '));
        const opened = [];
        const onPage = (pg) => opened.push(pg.url());
        page.context().on('page', onPage);
        const badge = () => page.evaluate(() => {
          const m = document.getElementById('psiINT-mode-badge');
          return m.classList.contains('visible') ? m.textContent : '';
        });
        await press('p', 300);
        ok(/print\.html is not beside this file/.test(await badge()), 'P says the print view is not there', await badge());
        await page.waitForTimeout(1900);
        await press('s', 300);
        ok(/speaker\.html is not beside this file/.test(await badge()), 'S says the cockpit is not there', await badge());
        await page.waitForTimeout(1900);
        await press('Meta+k', 250);
        await type('print view');
        await press('Enter', 300);
        ok(/print\.html is not beside this file/.test(await badge()), 'and so does the palette row', await badge());
        await page.waitForTimeout(500);
        page.context().off('page', onPage);
        ok(opened.length === 0, 'and no window opens', opened.join(' '));
        ok(await menu() === 'shown', 'a refused press does not fold the menu');
        // A cockpit built alone beside it carries the build's list too, for
        // the page that cannot ask; a full build's carries none.
        ok(build(lone, '--speaker-only').status === 0
          && /window\.PSI_ABSENT_VIEWS = \["print"\]/.test(fs.readFileSync(path.join(lone, 'speaker.html'), 'utf8')),
          'a cockpit built without print.html beside it says so in its list of missing views');
        // The build's list is a hint, so the page asks the server anyway and
        // each answer for a view that is not there is a 404 on the console;
        // the harness leaves those two names' 404s off the page errors.

        // A later full build beside it: every entry is back. And a partial
        // build next to that full one keeps them, because the views on disk
        // count - the stale cockpit is the one the key should open.
        ok(build(lone).status === 0, 'a full build in the same folder succeeds');
        const full = fs.readFileSync(path.join(lone, 'audience.html'), 'utf8');
        ok(!full.includes('window.PSI_ABSENT_VIEWS = ')
          && !fs.readFileSync(path.join(lone, 'speaker.html'), 'utf8').includes('window.PSI_ABSENT_VIEWS = '),
          'and neither its audience.html nor its speaker.html carries a list of missing views');
        await page.reload({ waitUntil: 'load' });
        await page.waitForTimeout(500);
        const all = await page.$$eval('#psiINT-start-menu button[data-cmd]', (bs) => bs.map((x) => x.textContent.trim()));
        ok(all.join(' | ') === 'Fullscreen W | Speaker cockpit S | Print view P', 'offers all three entries', all.join(' | '));
        ok(build(lone, '--audience-only').status === 0
          && fs.readFileSync(path.join(lone, 'audience.html'), 'utf8') === full,
          '--audience-only beside a full build writes the same audience.html');
      } finally {
        ls.server.close();
        fs.rmSync(lone, { recursive: true, force: true });
      }
    }

    // Three partial builds into one empty folder, one view each. The
    // audience.html the first wrote still says both of the others are
    // missing - no later build rewrote it - and they are beside it now. The
    // build's list is a hint: the page asks, and what it finds wins, in the
    // menu and on the keys.
    {
      const part = tmpDir('psi-palette-partial-');
      fs.writeFileSync(path.join(part, 'source.md'), DECK);
      const pb = ['--audience-only', '--speaker-only', '--print-only'].map((f) => build(part, f).status);
      ok(pb.every((x) => x === 0), 'three partial builds, one view each, into an empty folder', pb.join());
      const html = fs.readFileSync(path.join(part, 'audience.html'), 'utf8');
      ok(/window\.PSI_ABSENT_VIEWS = \["speaker","print"\]/.test(html), 'the first one\'s audience.html says the other two are missing');
      const ctxP = await page.context().browser().newContext({ viewport: { width: 1440, height: 900 } });
      try {
        const pp = await ctxP.newPage();
        await pp.goto('file://' + path.join(part, 'audience.html'), { waitUntil: 'load' });
        await pp.waitForTimeout(800);
        const shown = await pp.$$eval('#psiINT-start-menu button[data-cmd]', (bs) => bs.filter((x) => !x.hidden).map((x) => x.dataset.cmd));
        ok(shown.join() === 'fullscreen,cockpit,print', 'the menu shows the two views it finds beside it', shown.join());
        const [sp] = await Promise.all([ctxP.waitForEvent('page', { timeout: 5000 }), pp.keyboard.press('s')]);
        await sp.waitForURL(/speaker\.html$/, { timeout: 5000 }).catch(() => {});
        ok(/speaker\.html$/.test(sp.url()), 'S opens the cockpit the build said was missing', sp.url());
        await pp.bringToFront();
        const [pr] = await Promise.all([ctxP.waitForEvent('page', { timeout: 5000 }), pp.keyboard.press('p')]);
        await pr.waitForURL(/print\.html$/, { timeout: 5000 }).catch(() => {});
        ok(/print\.html$/.test(pr.url()), 'and P the print view', pr.url());
      } finally {
        await ctxP.close();
        fs.rmSync(part, { recursive: true, force: true });
      }
    }

    // Handed on without its print view: a full build, so the build saw
    // print.html, and the file deleted after it, opened from file:// as a
    // mailed audience.html is. The page's own probe finds it missing: the
    // menu drops the entry, P and the palette row say so, and nothing opens
    // or navigates; the cockpit, which is there, still opens. And nothing a
    // probe loads runs or reaches the console as an exception.
    {
      const cut = tmpDir('psi-palette-file-');
      fs.writeFileSync(path.join(cut, 'source.md'), DECK);
      const cb = build(cut);
      ok(cb.status === 0 && fs.existsSync(path.join(cut, 'print.html')), 'a full build writes print.html beside audience.html', (cb.stdout || '') + (cb.stderr || ''));
      fs.rmSync(path.join(cut, 'print.html'));
      const errors = [];
      const onErr = (err) => errors.push(err.message);
      page.on('pageerror', onErr);
      const fileUrl = 'file://' + path.join(cut, 'audience.html');
      const logged = pageErrors.length;
      try {
        await page.goto(fileUrl, { waitUntil: 'load' });
        await page.evaluate(() => { try { localStorage.clear(); } catch (e) { /* private window */ } });
        await page.reload({ waitUntil: 'load' });
        await page.waitForTimeout(700);
        const entries = await page.$$eval('#psiINT-start-menu button[data-cmd]', (bs) => bs.filter((x) => !x.hidden).map((x) => x.textContent.trim()));
        ok(entries.join(' | ') === 'Fullscreen W | Speaker cockpit S', 'file://: the menu leaves out the print view that is not there', entries.join(' | '));
        const opened = [];
        const onPage = (pg) => opened.push(pg);
        page.context().on('page', onPage);
        const badge = () => page.evaluate(() => {
          const m = document.getElementById('psiINT-mode-badge');
          return m.classList.contains('visible') ? m.textContent : '';
        });
        await press('p', 400);
        ok(/print\.html is not beside this file/.test(await badge()), 'file://: P says the print view is not there', await badge());
        await page.waitForTimeout(1900);
        await press('Meta+k', 250);
        await type('print view');
        await press('Enter', 400);
        ok(/print\.html is not beside this file/.test(await badge()), 'file://: and so does the palette row', await badge());
        await page.waitForTimeout(300);
        ok(opened.length === 0 && page.url() === fileUrl, 'file://: and no window opens and the page stays', opened.map((x) => x.url()).join(' ') + ' ' + page.url());
        page.context().off('page', onPage);
        const [spk2] = await Promise.all([page.context().waitForEvent('page', { timeout: 5000 }), press('s', 300)]);
        await spk2.waitForLoadState();
        ok(/speaker\.html/.test(spk2.url()), 'file://: S still opens the cockpit, which is there', spk2.url());
        // The cockpit's P is the projection's run function, so it asks the
        // same way: its own mode badge says so, and nothing opens.
        await spk2.waitForTimeout(600);
        const spkBadge = () => spk2.evaluate(() => {
          const m = document.getElementById('psiINT-mode-badge');
          return m.classList.contains('visible') ? m.textContent : '';
        });
        const fromCockpit = [];
        const onCockpitPage = (pg) => fromCockpit.push(pg.url());
        page.context().on('page', onCockpitPage);
        await spk2.keyboard.press('p');
        await spk2.waitForTimeout(400);
        ok(/print\.html is not beside this file/.test(await spkBadge()), 'file://: the cockpit\'s P says the print view is not there', await spkBadge());
        await spk2.waitForTimeout(1900);
        await spk2.keyboard.press('Meta+k');
        await spk2.waitForTimeout(250);
        await spk2.keyboard.type('print view');
        await spk2.keyboard.press('Enter');
        await spk2.waitForTimeout(400);
        ok(/print\.html is not beside this file/.test(await spkBadge()), 'file://: and so does the cockpit\'s palette row', await spkBadge());
        ok(!/print\.html is not beside/.test(await badge()), 'file://: on the cockpit, not on the projection', await badge());
        await spk2.waitForTimeout(300);
        page.context().off('page', onCockpitPage);
        ok(fromCockpit.length === 0, 'file://: and the cockpit opens no window', fromCockpit.join(' '));
        await spk2.close();
        ok(errors.length === 0, 'file://: no probe left an exception behind', errors.join(' | '));
        // A probe of the missing file puts the browser's own "not found"
        // line on the console - the one case where it is news. The runner
        // counts console errors as page errors, so these, and only these,
        // are taken back off its list.
        const added = pageErrors.splice(logged);
        const other = added.filter((m) => !/ERR_FILE_NOT_FOUND/.test(m));
        ok(added.length > 0 && other.length === 0, 'file://: the console has the missing file\'s "not found" lines and nothing else', added.join(' | '));
        pageErrors.push(...other);
      } finally {
        page.off('pageerror', onErr);
        fs.rmSync(cut, { recursive: true, force: true });
      }
    }

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
