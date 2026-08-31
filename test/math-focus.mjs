/*
 * Clicking a display formula has to make more of it visible, not less.
 *
 * The overlay enlarges a focused formula by setting type - 0.12 of the slide
 * height, 108px at 1440x900, about three times what it had on the slide - and
 * then the card it sits on caps at 98vh with overflow-y hidden. Type does not
 * know how tall the screen is, so for anything with rows the two rules pull
 * against each other and the card wins: eight rows of an aligned block
 * measured 435px on the slide, fully visible, and 1285px inside an 882px card
 * once focused. A third of the formula was simply gone, on the gesture whose
 * whole purpose is to show it better.
 *
 * Scrolling looks like the obvious answer, because the code block beside it
 * has overflow: auto - and it is not one here. The overlay's wheel handler
 * preventDefaults and zooms, and a drag pans, so a scrollbar inside the card
 * can only be reached by dragging the bar, and on a touchscreen not at all.
 * The enlargement stops at the edge of the screen instead.
 *
 * This spec builds its own deck. No lecture in the repository has a formula
 * with more than one row - every display block in all five is a single line -
 * so nothing that ships can reach the case, which is most of why it shipped.
 * A fixture is not a lecture and does not belong in lectures/, and
 * test/settings.mjs, which is where ad-hoc sources normally live, drives no
 * browser.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { serve, ROOT } from './harness.mjs';

export const name = 'math · focus fits the screen';
export const lecture = 'tutorial';   // built for other specs already; unused here
export const view = 'audience';

const ROWS = 8;
const SOURCE = `---
title: T
---

## example: Tall {.wide #tall}

Eight rows.

$$
\\begin{aligned}
${Array.from({ length: ROWS }, (_, i) =>
  `a_${i + 1} &= b_${i + 1} + c_${i + 1} + d_${i + 1}`).join(' \\\\\n')}
\\end{aligned}
$$

## example: Short {.wide #short}

One row.

$$ E = mc^2 $$
`;

// The formula as the slide has it, and as the overlay shows it.
const onSlide = (page, id) => page.evaluate((id) => {
  const m = document.querySelector('#' + id + ' .math-display');
  return { h: Math.round(m.getBoundingClientRect().height),
           fs: parseFloat(getComputedStyle(m.querySelector('.katex')).fontSize) };
}, id);

const focused = (page) => page.evaluate(() => {
  const t = document.querySelector('#figure-overlay .figure-focus-target');
  if (!t) return null;
  const cs = getComputedStyle(t);
  const pad = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
  return {
    clientH: t.clientHeight, scrollH: t.scrollHeight,
    fill: (t.scrollHeight - pad) / Math.max(1, t.clientHeight - pad),
    fs: parseFloat(getComputedStyle(t.querySelector('.katex')).fontSize),
  };
});

export async function run({ page, report, walkTo }) {
  const { ok, note } = report;

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-mathfocus-'));
  fs.writeFileSync(path.join(dir, 'source.md'), SOURCE);
  const built = spawnSync(process.execPath,
    [path.join(ROOT, 'build.js'), path.join(dir, 'source.md'), '--audience-only'],
    { cwd: ROOT, encoding: 'utf8' });
  ok(built.status === 0, 'the fixture deck builds', (built.stdout || '') + (built.stderr || ''));
  if (built.status !== 0) return;

  const { server, port } = await serve(dir);
  try {
    // Two window sizes, because the enlargement is a fraction of the slide
    // height and the cap is a fraction of the viewport - a fit that only
    // works at one size is arithmetic that happens to agree there.
    for (const [w, h] of [[1440, 900], [1920, 1080]]) {
      await page.setViewportSize({ width: w, height: h });
      await page.goto(`http://127.0.0.1:${port}/audience.html`, { waitUntil: 'load' });
      await page.evaluate(() => { try { localStorage.clear(); } catch (e) { /* private window */ } });
      await page.reload({ waitUntil: 'load' });
      await page.waitForTimeout(700);

      await walkTo('tall');
      const slideTall = await onSlide(page, 'tall');
      await page.click('#tall .math-display');
      await page.waitForTimeout(500);
      const bigTall = await focused(page);
      ok(bigTall !== null, `the formula opens in the overlay (${w}x${h})`);

      ok(bigTall.scrollH <= bigTall.clientH + 1,
        `and all of it is inside the card, not a third of it below the clip (${w}x${h})`,
        `${bigTall.scrollH} of ${bigTall.clientH}`);

      // Fitting must not become shrinking: the point of the click is that the
      // formula gets bigger than it was on the slide.
      ok(bigTall.fs > slideTall.fs,
        `and it is still larger than the slide had it (${w}x${h})`,
        `${bigTall.fs.toFixed(1)}px focused vs ${slideTall.fs.toFixed(1)}px on the slide`);

      // It should also use the room it has - a fit that lands at half the
      // card is a bug in the ratio rather than in the clip.
      ok(bigTall.fill > 0.8,
        `and fills the card it was fitted to (${w}x${h})`, bigTall.fill.toFixed(2));
      note(`${w}x${h}: ${slideTall.fs.toFixed(1)}px on the slide -> ${bigTall.fs.toFixed(1)}px focused, `
         + `card ${bigTall.clientH}px, content ${bigTall.scrollH}px`);

      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);

      // A formula that already fits keeps the full enlargement: the fit only
      // bites where it must, or every formula in every deck gets smaller.
      await walkTo('short');
      await page.click('#short .math-display');
      await page.waitForTimeout(500);
      const bigShort = await focused(page);
      ok(bigShort.scrollH <= bigShort.clientH + 1, `a one-row formula is not clipped either (${w}x${h})`);
      ok(bigShort.fs > bigTall.fs,
        `and keeps the full enlargement, which the tall one had to give up (${w}x${h})`,
        `${bigShort.fs.toFixed(1)}px vs ${bigTall.fs.toFixed(1)}px`);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
    }
  } finally {
    server.close();
    await page.setViewportSize({ width: 1440, height: 900 });
  }
}
