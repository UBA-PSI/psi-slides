/*
 * ::: side {middle} centres the shorter pane, and moves nothing else.
 *
 * The complaint it answers is a measurement: two lines of prose beside a tall
 * figure sit at the top of their half and leave most of it blank. The fix is
 * one declaration (align-items: center on the block) and the whole question
 * about it was one of granularity - should the word be per pane, since what
 * an author wants is usually the *prose* centred and the figure left alone?
 *
 * It should not, and this spec is the reason written as an assertion: a grid
 * row is as tall as its tallest item, so the tall pane already fills the row
 * and centring cannot move it. The block's switch therefore moves exactly the
 * short pane. That is asserted here in both directions - the short pane's
 * offset changes, the tall pane's does not, and the row's own height is the
 * same either way - so a future per-pane word would have to justify itself
 * against a case nothing can reach.
 *
 * Properties, never coordinates: the numbers below are all differences
 * between two boxes on the same page, so they hold at any window size, in any
 * theme, and at whatever the browser's default line height turns out to be.
 *
 * It builds its own deck for the reason math-focus does: no lecture in the
 * repository writes the word, because nothing did until now, and a fixture is
 * not a lecture.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { serve, ROOT } from './harness.mjs';

export const name = 'side · the anchor centres the short pane and nothing else';
export const lecture = 'tutorial';   // built for other specs already; unused here
export const view = 'audience';

// One short pane and one tall one, twice: the same content, once with the
// word and once without. Same content is what lets the two be compared at
// all - a difference between them is the word and can be nothing else.
const PANES = (open) => `${open}
Two lines of prose, which is the short pane and the whole of the case: it
sits at the top of its half and leaves the rest of it empty.

::: flip

- One
- Two
- Three
- Four
- Five
- Six
- Seven
- Eight
- Nine
- Ten

:::
`;

const SOURCE = `---
title: T
---

## example: Top {.wide #top}

${PANES('::: side 1:1')}

## example: Middle {.wide #mid}

${PANES('::: side 1:1 {middle}')}
`;

// Where the two panes sit inside the row that holds them, measured against
// the row rather than against the window: the two chunks are at different
// places in the deck, so an absolute top says nothing.
const paneGeometry = (page, id) => page.evaluate((id) => {
  const side = document.querySelector('#' + id + ' .side');
  const a = side.querySelector('.side-a');
  const b = side.querySelector('.side-b');
  const r = (el) => el.getBoundingClientRect();
  const box = (el) => ({ top: r(el).top - r(side).top, h: r(el).height });
  return { row: r(side).height, a: box(a), b: box(b) };
}, id);

export async function run({ page, report }) {
  const { ok, note } = report;

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-sideanchor-'));
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

    const top = await paneGeometry(page, 'top');
    const mid = await paneGeometry(page, 'mid');
    // The fixture is only a fixture if the two panes really are unequal -
    // with panes of one height every assertion below passes for free.
    ok(top.b.h > top.a.h * 1.5,
      'the fixture really does put a short pane beside a tall one',
      `${Math.round(top.a.h)}px beside ${Math.round(top.b.h)}px`);

    // Without the word, which is what a ::: side has always drawn: both
    // panes start at the top of the row, so the short one has the whole
    // remainder of its half below it.
    ok(Math.abs(top.a.top) < 2 && Math.abs(top.b.top) < 2,
      'without the word both panes start at the top of the row, as they always have',
      `short at ${top.a.top.toFixed(1)}px, tall at ${top.b.top.toFixed(1)}px`);
    ok(top.a.top + top.a.h / 2 < top.row / 2 - 2,
      'so the short pane\'s content sits above the middle of the row');

    // With it, the short pane is centred against the tall one. Written as
    // "the two centres agree", which is the property, rather than as the
    // offset it works out to.
    const centre = (p) => p.top + p.h / 2;
    ok(Math.abs(centre(mid.a) - centre(mid.b)) < 2,
      'with the word the short pane is centred against the tall one',
      `${centre(mid.a).toFixed(1)}px vs ${centre(mid.b).toFixed(1)}px`);
    ok(Math.abs(centre(mid.a) - mid.row / 2) < 2,
      'which is the middle of the row, because the tall pane is the row');

    // And the half of the answer that decides the granularity: the tall pane
    // did not move, and the row is the same height. A per-pane word would
    // buy the ability to leave the tall pane where it already is.
    ok(Math.abs(mid.b.top - top.b.top) < 2 && Math.abs(mid.b.h - top.b.h) < 2,
      'the tall pane does not move, which is why the switch is the block\'s',
      `${top.b.top.toFixed(1)}px/${Math.round(top.b.h)}px -> ${mid.b.top.toFixed(1)}px/${Math.round(mid.b.h)}px`);
    ok(Math.abs(mid.row - top.row) < 2,
      'and the row is exactly as tall as it was, so nothing below the block moves',
      `${Math.round(top.row)}px -> ${Math.round(mid.row)}px`);
    note(`short pane ${Math.round(top.a.h)}px in a ${Math.round(top.row)}px row: `
       + `top at ${top.a.top.toFixed(1)}px, middle at ${mid.a.top.toFixed(1)}px`);
  } finally {
    server.close();
  }
}
