/*
 * print.html on a phone: a wide table and a bar chart.
 *
 *  - at 390 px the page itself never scrolls sideways: a table wider than the
 *    column scrolls inside its own box, and a table that fits gets no
 *    scrollbar and keeps its width;
 *  - the axis letters and the caption of a 26-bar chart are drawn at 11 px
 *    at least, where the figure's own scale would put them at about 8;
 *  - at 1280 px nothing of either is touched: the chart is not marked and
 *    its labels keep the size the drawing gives them, and the wide table
 *    fits without a scrollbar.
 *
 * Chromium, like the rest of the suite; the same page was checked by eye in
 * WebKit at both widths when this landed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpDir } from './tmp.mjs';
import { ROOT, serve } from './harness.mjs';

const WIDE = '| position | ' + Array.from({ length: 14 }, (_, i) => i).join(' | ') + ' |\n'
  + '|---|' + '---|'.repeat(14) + '\n'
  + '| letter | ' + 'EVERYSATURDAYS'.split('').join(' | ') + ' |\n';
const SOURCE = `---
title: Phone fixture
fonts: none
---
## free: Tables {#tables}
A table that fits.

| a | b |
|---|---|
| 1 | 2 |

A table that does not.

${WIDE}
## free: A histogram {#histogram}
::: draw 150x52 frame 3.5x2.3
bars en "797,142,244,445,1252,194,239,641,702,19,105,424,200,655,771,160,18,538,591,992,323,78,240,14,210,7" "A B C D E F G H I J K L M N O P Q R S T U V W X Y Z" at 0,0 w 3.3 h 1.1 emph 4
text en-t "English text: how often each letter occurs" below en gap 0.4 {.small .muted}
:::
`;

export const name = 'document · a phone: wide tables scroll in their own box, bar labels stay legible';
export const lecture = 'tutorial';   // built for other specs already; unused here
export const view = 'audience';
export async function run({ page, report }) {
  const { ok } = report;
  const browser = page.context().browser();
  const dir = tmpDir('psi-print-phone-');
  fs.writeFileSync(path.join(dir, 'source.md'), SOURCE);
  const built = spawnSync(process.execPath, [path.join(ROOT, 'build.js'), path.join(dir, 'source.md'), '--print-only'],
    { cwd: ROOT, encoding: 'utf8' });
  ok(built.status === 0, 'the fixture builds', (built.stdout || '') + (built.stderr || ''));
  if (built.status !== 0) return;
  const { server, port } = await serve(dir);
  const errors = [];
  const measure = async (width) => {
    const ctx = await browser.newContext({ viewport: { width, height: 800 } });
    const p = await ctx.newPage();
    p.on('pageerror', e => errors.push(String(e)));
    await p.goto(`http://127.0.0.1:${port}/print.html`, { waitUntil: 'load' });
    await p.waitForTimeout(300);
    const m = await p.evaluate(() => {
      const [small, wide] = [...document.querySelectorAll('#tables table')];
      const fig = document.querySelector('#histogram figure.figure-diagram');
      // The size a label is drawn at: its font size in the drawing's units,
      // times the drawing's scale, times the scale print.css puts on it.
      const svg = fig.querySelector('svg');
      const unit = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
      const labels = [...fig.querySelectorAll('.dg-text .dg-lbl')].map(g => {
        const tf = getComputedStyle(g).transform;
        const k = tf === 'none' ? 1 : new DOMMatrix(tf).a;
        return parseFloat(g.querySelector('text').getAttribute('font-size')) * unit * k;
      });
      const T = (t) => ({ cw: t.clientWidth, sw: t.scrollWidth, w: Math.round(t.getBoundingClientRect().width) });
      return {
        page: document.documentElement.scrollWidth,
        small: T(small), wide: T(wide),
        // In the table's own em, because the root size follows the window.
        smallCells: +(small.rows[0].getBoundingClientRect().width / parseFloat(getComputedStyle(small).fontSize)).toFixed(2),
        marked: fig.hasAttribute('data-lbl-grow'),
        k: fig.style.getPropertyValue('--dg-lbl-k'),
        label: Math.min(...labels),
        count: labels.length,
      };
    });
    await ctx.close();
    return m;
  };
  try {
    const phone = await measure(390);
    ok(phone.page <= 390, 'at 390 px the page does not scroll sideways', JSON.stringify(phone));
    ok(phone.wide.sw > phone.wide.cw + 50 && phone.wide.cw <= 390,
       'a table wider than the column scrolls in its own box', JSON.stringify(phone.wide));
    ok(phone.small.sw <= phone.small.cw, 'and one that fits has nothing to scroll', JSON.stringify(phone.small));
    ok(phone.count === 27 && phone.marked && phone.label >= 10.9,
       'the 26 axis letters and the caption are drawn at 11 px at least', JSON.stringify(phone));

    const desk = await measure(1280);
    ok(desk.page <= 1280 && desk.wide.sw <= desk.wide.cw,
       'at 1280 px the wide table fits without a scrollbar', JSON.stringify(desk));
    ok(!desk.marked && desk.k === '' && desk.label >= 10.9,
       'and the chart is not marked: its labels are drawn large enough as they are', JSON.stringify(desk));
    ok(Math.abs(desk.smallCells - phone.smallCells) < 0.05, 'a table that fits is as wide on a phone as on a desk, in its own em',
       JSON.stringify([phone.smallCells, desk.smallCells]));
    ok(errors.length === 0, 'no page errors in the fixture', errors.join(' | '));
  } finally {
    server.close();
  }
}
