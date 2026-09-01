/*
 * Three things about the inside of a card that only a rendered page knows.
 *
 * 1. The two ways to open a card have to draw differently. The tutorial has
 *    documented since it was written that `- **A lead-in** its text` runs the
 *    bold into the sentence and `- **A heading**\` puts it on its own line,
 *    and for as long as it said so both drew the second way: the card was a
 *    flex column, which blockifies every child, so the bold was a flex item
 *    and the sentence after it an anonymous one. No stylesheet rule could
 *    have brought the run-in back. The property here is the difference, not
 *    a height: the same words written the two ways occupy a different number
 *    of line boxes.
 *
 * 2. The dash in front of a nested item has to sit on the middle of the line
 *    it belongs to. It was `top: 0.62em`, a guess at half a line, and the
 *    nested level is set at 0.88em with its own leading, so the dash rode
 *    high. Measured against the first line box rather than against a number,
 *    and measured again with the face, the size and the leading changed,
 *    because not depending on those is the whole point of the unit.
 *
 * 3. Reversed ink has to stay where the fill is. A `::: rows {accent}` block
 *    puts the fill on the term alone, and the item that carried the reversal
 *    is display: contents and spans both columns - so the body beside the
 *    card was painted in the page colour on the page. Contrast, in all seven
 *    themes, because that is what the defect was.
 *
 * Its own fixture deck rather than a lecture: what is under test is a
 * comparison between two cards that differ in one character, and no lecture
 * has that pair except the tutorial's own demonstration of it, which is
 * prose an author is free to rewrite.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { serve, ROOT } from './harness.mjs';

export const name = 'cards · lead-ins, nested marks and reversed ink';
export const lecture = 'tutorial';   // built for other specs already; unused here
export const view = 'audience';

const WORDS = 'the same words in both of these cards, so that only the opening differs';
const SOURCE = `---
title: T
collapse: none
---

## free: Leads {.wide #leads}

::: cards 2
- **Alpha** ${WORDS}
- **Beta**\\
  ${WORDS}
:::

## free: Nested {.wide #nest}

::: cards 2 {.show}
- **Alpha**
  - a nested item long enough to be sure of its own first line
  - a second
- **Beta**
  - a nested item long enough to be sure of its own first line
  - a second
:::

## free: Reversed {.wide #rev}

::: rows {accent}
- **Anonymity** comes from the others doing the same thing at the same time
- **Unlinkability** means two actions of one person cannot be tied together
:::
`;

// How many line boxes an item's text occupies. A Range over the contents
// gives one rect per line box, so counting distinct tops counts lines - and
// it counts them the same way whatever the wrapping happens to be.
const lineCount = (page, sel) => page.evaluate((sel) => {
  const li = document.querySelector(sel);
  const r = document.createRange();
  r.selectNodeContents(li);
  const tops = new Set([...r.getClientRects()].filter(x => x.height > 1).map(x => Math.round(x.top)));
  return { lines: tops.size, display: getComputedStyle(li.querySelector('strong')).display };
}, sel);

// The dash and the line it belongs to, both in page coordinates. A pseudo
// element has no rect of its own, so the mark is reconstructed from its used
// top, its height and whatever the transform moved it by - and the line is
// the element's own line-height from its content top, which is the line box
// the dash is supposed to be centred on.
const markVsLine = (page, sel, style) => page.evaluate(({ sel, style }) => {
  const li = document.querySelector(sel);
  li.style.cssText = style || '';
  li.getBoundingClientRect();          // settle the restyle before measuring
  const cs = getComputedStyle(li);
  const ps = getComputedStyle(li, '::before');
  const m = ps.transform && ps.transform !== 'none' ? ps.transform.match(/matrix\(([^)]+)\)/) : null;
  const ty = m ? parseFloat(m[1].split(',')[5]) : 0;
  const box = li.getBoundingClientRect();
  const markCentre = box.top + parseFloat(ps.top) + ty + parseFloat(ps.height) / 2;
  const lineCentre = box.top + parseFloat(cs.lineHeight) / 2;
  const r = document.createRange();
  r.selectNodeContents(li);
  const first = [...r.getClientRects()].filter(x => x.height > 1)[0];
  li.style.cssText = '';
  return {
    delta: markCentre - lineCentre,
    textDelta: first ? markCentre - (first.top + first.height / 2) : null,
    lh: parseFloat(cs.lineHeight),
    fs: parseFloat(cs.fontSize),
  };
}, { sel, style });

// sRGB relative luminance, off the computed colours the page actually paints.
const contrast = (page, sel) => page.evaluate((sel) => {
  const el = document.querySelector(sel);
  const lum = (c) => {
    const [r, g, b] = c;
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  // getComputedStyle hands back oklch() verbatim, so the paint is read off a
  // canvas instead of parsed - one code path for every colour syntax.
  const cv = document.createElement('canvas');
  cv.width = cv.height = 1;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const paint = (css) => { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 1, 1); ctx.fillStyle = css; ctx.fillRect(0, 0, 1, 1); return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3); };
  // The ground behind the text is the nearest ancestor that paints one -
  // and display: contents is exactly the case where an element reports a
  // background it never paints. A row's item declares the accent fill and
  // generates no box for it, so believing that report is how a measurement
  // agrees that invisible text is fine.
  let bg = null;
  for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
    const cs = getComputedStyle(n);
    if (cs.display === 'contents') continue;
    if (cs.backgroundColor === 'rgba(0, 0, 0, 0)') continue;
    bg = paint(cs.backgroundColor);
    break;
  }
  if (!bg) bg = paint(getComputedStyle(document.body).backgroundColor);
  const fg = paint(getComputedStyle(el).color);
  const a = lum(fg), b = lum(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}, sel);

export async function run({ page, report }) {
  const { ok, note } = report;

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-cards-'));
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

    // ── 1. the two openings draw differently ───────────────────────────
    const runIn = await lineCount(page, '#leads .cards li:nth-child(1)');
    const heading = await lineCount(page, '#leads .cards li:nth-child(2)');
    ok(runIn.display === 'inline',
      'a run-in lead-in is an inline bold, not a blockified flex item', runIn.display);
    ok(heading.display === 'block', 'a heading lead-in is a block', heading.display);
    ok(runIn.lines < heading.lines,
      'and the same words written the two ways do not occupy the same number of lines',
      `${runIn.lines} run-in vs ${heading.lines} heading`);
    note(`run-in ${runIn.lines} line(s), heading ${heading.lines}`);

    // ── 2. the nested mark sits on its line ────────────────────────────
    // Three faces and three leadings. The dash is placed in lh, so none of
    // them may move it off the middle - which is the reason for the unit
    // and not a property of the roster.
    const faces = [['serif', 'var(--serif)'], ['sans', 'var(--sans)'], ['mono', 'var(--mono)']];
    for (const [label, fam] of faces) {
      for (const lh of ['1.15', '1.38', '1.9']) {
        const m = await markVsLine(page, '#nest .cards li ul li',
          `font-family: ${fam}; line-height: ${lh}`);
        ok(Math.abs(m.delta) <= 1.5,
          `the nested dash is centred on its first line (${label}, line-height ${lh})`,
          `${m.delta.toFixed(2)}px off a ${m.lh.toFixed(1)}px line`);
      }
    }
    const plain = await markVsLine(page, '#nest .cards li ul li', '');
    ok(Math.abs(plain.textDelta) <= 2,
      'and lands on the words themselves, not only on the box that holds them',
      `${plain.textDelta.toFixed(2)}px from the middle of the glyphs`);
    note(`as shipped: ${plain.fs.toFixed(1)}px type on a ${plain.lh.toFixed(1)}px line, `
       + `dash ${plain.delta.toFixed(2)}px off centre`);

    // ── 3. an accent row's body is legible, in every theme ─────────────
    // 4.5 for the body, which is ordinary prose at the chunk's own size, and
    // 3 for the term, which is a short label in a card and large text by the
    // AA rule. The defect measured 1.0 in all seven, so any threshold at all
    // would have caught it; these are the two the guideline names.
    for (let i = 0; i < 7; i++) {
      const theme = await page.evaluate(() => document.body.dataset.theme);
      const body = await contrast(page, '#rev .cards.rows .row-body');
      const term = await contrast(page, '#rev .cards.rows strong');
      ok(body >= 4.5, `an accent row's body reads against the page (${theme})`, body.toFixed(2));
      ok(term >= 3, `and its term reads against the accent fill (${theme})`, term.toFixed(2));
      await page.keyboard.press('a');
      await page.waitForTimeout(160);
    }
  } finally {
    server.close();
  }
}
