/*
 * dock · a ::: dock is part of the frame, and the text yields to it
 *
 * The claims are geometry, which only a rendered page can settle: that the
 * dock and the content column never share a pixel, that a column reaches
 * the slide's edge and its full height, that a band reaches both edges and
 * sits under the content, that `from N` reserves the track from beat 0 so
 * the text never moves when the dock arrives, and that auto-fit still finds
 * a zoom of one or more with a slide-high column standing in the chunk -
 * which is what the flowHeightProbe exception is for.
 *
 * Its own fixture deck, for the reason test/README.md gives for the others:
 * no lecture in the corpus writes a dock, and the deck is built to have
 * every edge, an inherited dock with a live marker, and a beat.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { serve, ROOT } from './harness.mjs';

export const name = 'dock · the text yields to it, it reaches the frame, from N moves nothing';
export const lecture = 'tutorial';   // built for other specs already; unused here
export const view = 'audience';

const SOURCE = `---
title: T
auto-fit: true
collapse: none
---

## title: {#title}

# Part {#p}

::: dock {.left .every}
- [Alpha](#a)
- [Beta](#b)
- [Gamma](#c)
:::

## free: Alpha {#a}

**One sentence that stands on its own.** A second that does not have to.

## free: Beta {.wide #b}

::: cols 2
**Left column of the wide chunk.** Prose enough to fill a line or two of it.

**Right column of the wide chunk.** Prose enough to fill a line or two of it.
:::

## free: Gamma {#c}

**A remark arrives on the second beat.** The text has held its track since the first.

---

Beat one.

---

Beat two.

::: dock {.right .glass} from 2
**Merke:** the column was here from the start.
:::

## free: Delta {#d}

**A band under the words.** It takes a row of the grid, not a share of the width.

---

Beat one.

::: dock {.bottom .ink .third}
A band, a third high.
:::
`;

const jump = (page, id) => page.evaluate((id) => {
  const i = [...document.querySelectorAll('.chunk')].findIndex(c => c.dataset.chunkId === id);
  window.jumpTo(i);
}, id);

// Boxes in page coordinates, rounded, plus what the chunk resolves
// --content-w to and the zoom it settled on.
const boxes = (page, id) => page.evaluate((id) => {
  const el = document.getElementById(id);
  const r = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return { left: Math.round(b.left), top: Math.round(b.top), right: Math.round(b.right), bottom: Math.round(b.bottom), width: Math.round(b.width), height: Math.round(b.height) }; };
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;width:var(--content-w);visibility:hidden';
  el.appendChild(probe);
  const contentW = probe.getBoundingClientRect().width;
  probe.remove();
  const cols = [...el.querySelectorAll('.cols > *')].map(r);
  return { chunk: r(el), dock: r(el.querySelector('.dock')), content: r(el.querySelector('.chunk-content')),
           num: r(el.querySelector('.chunk-num')), contentW, cols,
           dockHidden: el.querySelector('.dock')?.hasAttribute('data-hidden'),
           zoom: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--zoom')) || null,
           slideH: parseFloat(getComputedStyle(el).getPropertyValue('--slide-h')) || null };
}, id);

const overlap = (a, b) => a && b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

export async function run({ page, report }) {
  const { ok, note } = report;

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-dock-'));
  fs.writeFileSync(path.join(dir, 'source.md'), SOURCE);
  const built = spawnSync(process.execPath,
    [path.join(ROOT, 'build.js'), path.join(dir, 'source.md'), '--audience-only'],
    { cwd: ROOT, encoding: 'utf8' });
  ok(built.status === 0, 'the fixture deck builds', (built.stdout || '') + (built.stderr || ''));
  if (built.status !== 0) return;

  const { server, port } = await serve(dir);
  try {
    await page.goto(`http://127.0.0.1:${port}/audience.html`, { waitUntil: 'load' });
    await page.evaluate(() => { try { localStorage.clear(); } catch (e) { /* private window */ } });
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(700);

    // ── #a: an inherited left column ──
    await jump(page, 'a');
    await page.waitForTimeout(500);
    let g = await boxes(page, 'a');
    ok(!overlap(g.dock, g.content), 'a: the dock and the content column share no pixel', JSON.stringify([g.dock, g.content]));
    ok(g.dock.left === g.chunk.left && Math.abs(g.dock.height - g.chunk.height) <= 1,
       'a: the column reaches the left edge and the full height', JSON.stringify([g.dock, g.chunk]));
    ok(g.content.width <= g.contentW + 1, 'a: the content column is no wider than --content-w', `${g.content.width} vs ${g.contentW}`);
    ok(g.zoom == null || g.zoom >= 1, 'a: auto-fit does not fall through the floor beside a slide-high column', String(g.zoom));
    const marker = await page.evaluate(() => {
      const st = (id, href) => document.getElementById(id).querySelector(`.dock a[href="${href}"]`)?.dataset.state;
      return { aOnA: st('a', '#a'), bOnA: st('a', '#b'), bOnB: st('b', '#b'), aOnB: st('b', '#a'), onDivider: [...document.querySelector('[data-chunk-id="p-section"]').querySelectorAll('.dock a')].map(x => x.dataset.state).join(',') };
    });
    ok(marker.aOnA === 'now' && marker.bOnA === 'next' && marker.bOnB === 'now' && marker.aOnB === 'done',
       'the live marker follows the chunk: now here, next below, done above', JSON.stringify(marker));
    ok(!/now/.test(marker.onDivider), 'and on the divider nobody is live yet', marker.onDivider);
    note(`a: zoom ${g.zoom}, dock ${g.dock.width}px wide, content ${g.content.width}px of ${Math.round(g.contentW)}`);

    // ── #b: wide chunk with two columns beside the dock ──
    await jump(page, 'b');
    await page.waitForTimeout(500);
    g = await boxes(page, 'b');
    ok(!overlap(g.dock, g.content), 'b: no overlap on the wide chunk either', JSON.stringify([g.dock, g.content]));
    ok(g.content.width <= g.contentW + 1, 'b: the wide measure is capped by --content-w', `${g.content.width} vs ${g.contentW}`);
    ok(g.cols.length === 2 && Math.abs(g.cols[0].top - g.cols[1].top) < 4 && g.cols[0].right <= g.cols[1].left,
       'b: ::: cols 2 is still two columns side by side', JSON.stringify(g.cols));

    // ── #c: an own right dock held to beat 2 ──
    await jump(page, 'c');
    await page.waitForTimeout(500);
    const c0 = await boxes(page, 'c');
    await page.keyboard.press('Space'); await page.waitForTimeout(350);
    const c1 = await boxes(page, 'c');
    await page.keyboard.press('Space'); await page.waitForTimeout(700);
    const c2 = await boxes(page, 'c');
    ok(c0.dockHidden && c1.dockHidden && !c2.dockHidden, 'c: the dock is held back on beats 0 and 1 and arrives on 2', JSON.stringify([c0.dockHidden, c1.dockHidden, c2.dockHidden]));
    ok(c0.content.left === c1.content.left && c1.content.left === c2.content.left && c0.content.width === c2.content.width,
       'c: the text neither moves nor narrows when the dock arrives', JSON.stringify([c0.content, c2.content]));
    ok(!overlap(c2.dock, c2.content), 'c: no overlap once it is there', JSON.stringify([c2.dock, c2.content]));
    ok(c2.dock.right === c2.chunk.right, 'c: the column reaches the right edge', JSON.stringify([c2.dock, c2.chunk]));
    ok(c2.num && c2.num.right <= c2.dock.left + 1, 'c: the slide number stays off the dock', JSON.stringify([c2.num, c2.dock]));

    // ── #d: a band, a third high ──
    await jump(page, 'd');
    await page.waitForTimeout(500);
    g = await boxes(page, 'd');
    ok(!overlap(g.dock, g.content), 'd: the band and the content share no pixel', JSON.stringify([g.dock, g.content]));
    ok(g.dock.width === g.chunk.width && Math.abs(g.dock.bottom - g.chunk.bottom) <= 1, 'd: the band reaches both edges and the foot', JSON.stringify([g.dock, g.chunk]));
    ok(g.dock.top >= g.content.bottom - 1, 'd: the band sits under the words', JSON.stringify([g.dock, g.content]));
    ok(g.slideH == null || g.dock.height >= g.slideH / 3 - 1, 'd: a third-high band is at least a third of the slide', `${g.dock.height} vs ${g.slideH}`);
    ok(g.zoom == null || g.zoom >= 1, 'd: auto-fit holds beside a band too', String(g.zoom));

    // ── --check-fit on the same deck ──
    const cf = spawnSync(process.execPath, [path.join(ROOT, 'build.js'), path.join(dir, 'source.md'), '--check-fit'],
      { cwd: ROOT, encoding: 'utf8' });
    ok(cf.status === 0, '--check-fit passes the fixture deck', (cf.stdout || '') + (cf.stderr || ''));
  } finally {
    server.close();
  }
}
