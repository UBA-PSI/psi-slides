/*
 * beats-footnote · a ::: footnote arrives with the reveal segment it was
 * written in
 *
 * The parser lifts an aside out of the chunk body into a chunk-level node, so
 * a `::: footnote` cannot carry a BEAT_MARK the way a `---` inside a pane or a
 * card row does: a marker's beat is the element siblings after it inside one
 * parent, and the aside has left that parent. It carries the *number* of the
 * segment it stood in instead (`data-seg`), and applyReveal mirrors that
 * segment's own visibility onto it.
 *
 * Only a browser can answer this, and the discriminating case is the third
 * chunk below. A footnote in the second segment of a chunk whose first
 * segment holds a stepped figure is not "the footnote arrives on beat 1":
 * beat 1 is the figure's step, and the segment does not arrive until beat 2.
 * A rule written against beat numbers passes the first two chunks and fails
 * that one, which is why the fixture has it.
 *
 * Its own fixture deck, like beats-nested: no lecture in the repository
 * writes a footnote after a `---`, and the assertion is about a sequence.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { serve, ROOT } from './harness.mjs';

export const name = 'beats-footnote · a ::: footnote rides the segment it was written in';
export const lecture = 'tutorial';   // built for other specs already; unused here
export const view = 'audience';

const SOURCE = `---
title: T
collapse: none
---

## title: {#title}

## free: Before the first mark {.wide #fn-early}

Topic.

::: footnote
Early source.
:::

---

Second.

## free: After a mark {.wide #fn-late}

Topic.

---

Second.

::: footnote
Late source.
:::

## free: A figure step between the two segments {.wide #fn-step}

::: draw 120x40
box a "A" at 0,0
box b "B" below a gap 0.5
step one
  emph b
:::

---

After the step.

::: footnote
Rides the segment.
:::

## free: After {.wide #after}

So the walk has somewhere to go.
`;

// What the room can see of a chunk, by first words - the beats-nested helper,
// with the footnote's own paragraph in the net.
const visible = (page, id) => page.evaluate((id) => {
  const el = [...document.querySelectorAll('.chunk')].find(c => c.dataset.chunkId === id);
  return [...el.querySelectorAll('p')]
    .filter(e => !e.closest('[data-beat-hidden], [data-hidden]'))
    .map(e => e.textContent.trim().split(/\s+/).slice(0, 2).join(' '))
    .join(' | ');
}, id);

const jump = (page, id) => page.evaluate((id) => {
  const i = [...document.querySelectorAll('.chunk')].findIndex(c => c.dataset.chunkId === id);
  window.jumpTo(i);
}, id);

export async function run({ page, report }) {
  const { ok, note } = report;

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-fnbeat-'));
  fs.writeFileSync(path.join(dir, 'source.md'), SOURCE);
  const built = spawnSync(process.execPath,
    [path.join(ROOT, 'build.js'), path.join(dir, 'source.md')],
    { cwd: ROOT, encoding: 'utf8' });
  ok(built.status === 0, 'the fixture deck builds', (built.stdout || '') + (built.stderr || ''));
  if (built.status !== 0) return;

  // The document is not a projection: print shows every footnote at once, and
  // the attribute that holds one back has no business being in it.
  const printed = fs.readFileSync(path.join(dir, 'print.html'), 'utf8');
  ok(printed.includes('Late source.') && printed.includes('Rides the segment.')
    && !/chunk-expansion[^>]*data-seg=/.test(printed),
     'print carries every footnote, with nothing holding one back');

  const { server, port } = await serve(dir);
  try {
    await page.goto(`http://127.0.0.1:${port}/audience.html`, { waitUntil: 'load' });
    await page.evaluate(() => { try { localStorage.clear(); } catch (e) { /* private window */ } });
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(700);

    // ── the attribute is written only where it changes something ──
    const attrs = await page.evaluate(() => {
      const seg = (id) => {
        const el = [...document.querySelectorAll('.chunk')].find(c => c.dataset.chunkId === id);
        const a = el.querySelector('.margin-note');
        return a ? (a.dataset.seg ?? null) : 'no footnote';
      };
      return { early: seg('fn-early'), late: seg('fn-late'), step: seg('fn-step') };
    });
    ok(attrs.early === null,
       'a footnote before the first --- names no segment, so every deck written before this builds the same bytes',
       JSON.stringify(attrs));
    ok(attrs.late === '1' && attrs.step === '1',
       'a footnote after a --- names the segment it stood in', JSON.stringify(attrs));

    // ── before the first mark: on the slide from beat 0, as it always was ──
    await jump(page, 'fn-early');
    await page.waitForTimeout(300);
    const e0 = await visible(page, 'fn-early');
    ok(e0 === 'Topic. | Early source.', 'a footnote in the opening segment is on the slide at beat 0', e0);

    // ── after a mark: held back, then in ────────────────────────────────
    await jump(page, 'fn-late');
    await page.waitForTimeout(300);
    const l0 = await visible(page, 'fn-late');
    ok(l0 === 'Topic.', 'a footnote after a --- is off the slide at beat 0', l0);
    await page.keyboard.press('Space');
    await page.waitForTimeout(300);
    const l1 = await visible(page, 'fn-late');
    ok(l1 === 'Topic. | Second. | Late source.',
       'and arrives with the segment it was written in', l1);

    // It rides that segment rather than adding an advance of its own.
    const lateBeats = await page.evaluate(() => countSegments(
      [...document.querySelectorAll('.chunk')].find(c => c.dataset.chunkId === 'fn-late')));
    ok(lateBeats === 2, 'the footnote adds no beat of its own', `countSegments returned ${lateBeats}`);
    await page.keyboard.press('Space');
    await page.waitForTimeout(350);
    const leftLate = await page.evaluate(() => document.querySelector('.chunk.active')?.dataset.chunkId);
    ok(leftLate === 'fn-step', 'so the next press leaves the chunk', leftLate);

    // ── the case a beat number gets wrong ───────────────────────────────
    // Beat 1 is the figure's step; the second segment does not arrive until
    // beat 2, and the footnote written in it must not arrive before it.
    await jump(page, 'fn-step');
    await page.waitForTimeout(450);
    const s = [await visible(page, 'fn-step')];
    for (let k = 0; k < 2; k++) {
      await page.keyboard.press('Space');
      await page.waitForTimeout(420);
      s.push(await visible(page, 'fn-step'));
    }
    ok(s[0] === '', 'the stepped chunk opens on the figure alone', s[0]);
    ok(s[1] === '', 'the first press plays the figure step and brings no footnote with it', s[1]);
    ok(s[2] === 'After the | Rides the',
       'the second press brings the segment and its footnote together', s[2]);
    note(`fn-step walked: ${JSON.stringify(s)}`);
  } finally {
    server.close();
  }
}
