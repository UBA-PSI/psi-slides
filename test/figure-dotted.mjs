/*
 * A muted dot is a plain dot in the muted ink (PLAN-figure-defaults.md §7,
 * entry 15).
 *
 * .muted thins a stroke to 1.05 and .dotted draws a disc one stroke-width
 * across, so the pair drew dots of about 1.9 px at a typical figure scale,
 * anti-aliased below their own colour: on every theme a band across the line
 * carried a quarter of a muted line's ink or less. The stylesheet now floors
 * a muted dotted stroke at the plain weight, 1.4, and states the gap against
 * the floored width. What this spec holds is the computed stroke, because the
 * rule is CSS and the SVG bytes do not move:
 *
 *   - the pair draws 1.4 with a 3.5 gap, on an edge and on an outline;
 *   - everything round it is untouched - .muted, .dashed .muted and .dotted
 *     keep their widths and patterns;
 *   - a heavier weight wins over the floor: .thick .muted .dotted keeps 2.6;
 *   - a plot's grid, which the compiler writes as this pair, gets it too -
 *     measured on lectures/diagrams#plot, the one real grid the suite has.
 *
 * It builds a deck of its own for the controls, for the reason test/README.md
 * gives: no lecture draws the six specimens side by side, and none owes this
 * spec a .thick .muted .dotted line.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { serve, ROOT } from './harness.mjs';

export const name = 'figure dotted muted';
export const lecture = 'diagrams';
export const view = 'audience';

const FIXTURE = `---
title: Dotted and muted
collapse: none
---

## figure: Six strokes {#fix}

::: draw
edge e1 0,0 -- 2,0
edge e2 0,0.5 -- 2,0.5 {.muted}
edge e3 0,1.0 -- 2,1.0 {.dashed .muted}
edge e4 0,1.5 -- 2,1.5 {.dotted}
edge e5 0,2.0 -- 2,2.0 {.dotted .muted}
edge e6 0,2.5 -- 2,2.5 {.dotted .muted .thick}
box b5 "b5" at 3,0 w 1 h 0.4 {.dotted .muted}
box b4 "b4" at 3,1 w 1 h 0.4 {.dotted}
:::
`;

function buildFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-dotted-'));
  fs.writeFileSync(path.join(dir, 'source.md'), FIXTURE);
  const r = spawnSync(process.execPath,
    [path.join(ROOT, 'build.js'), path.join(dir, 'source.md'), '--audience-only'],
    { cwd: ROOT, encoding: 'utf8' });
  return { dir, status: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

// Stroke width and dash pattern in the SVG's own units, per generated id.
const strokes = (page, chunk) => page.evaluate((chunk) => {
  const svg = document.querySelector('#' + chunk + ' svg.psi-diagram');
  const out = {};
  if (!svg) return out;
  for (const g of svg.querySelectorAll('g.dg-el')) {
    const s = g.querySelector('.dg-stroke') || g.querySelector(':scope > rect');
    if (!s) continue;
    const cs = getComputedStyle(s);
    out[g.id.replace(/^dg\d+-/, '')] = cs.strokeWidth + ' ' + cs.strokeDasharray;
  }
  return out;
}, chunk);

export async function run({ page, report, walkTo }) {
  const { ok } = report;

  // ── the real grid ──
  ok(await walkTo('plot'), 'reaches #plot');
  const grid = await strokes(page, 'plot');
  const gridIds = Object.keys(grid).filter(k => /-g[xy]-\d+$/.test(k));
  ok(gridIds.length > 0 && gridIds.every(k => grid[k] === '1.4px 0px, 3.5px'),
    'a plot\'s grid is a plain dot in the muted ink: 1.4 across, 3.5 apart',
    JSON.stringify(gridIds.slice(0, 3).map(k => [k, grid[k]])));

  // ── the fixture ──
  const fix = buildFixture();
  ok(fix.status === 0, 'the fixture deck builds', fix.out);
  if (fix.status !== 0) return;
  const { server, port } = await serve(fix.dir);
  try {
    await page.goto(`http://127.0.0.1:${port}/audience.html`, { waitUntil: 'load' });
    await page.waitForTimeout(500);
    const s = await strokes(page, 'fix');
    ok(s.e5 === '1.4px 0px, 3.5px', 'a .dotted .muted edge is floored at the plain weight', s.e5);
    ok(s.b5 === '1.4px 0px, 3.5px', 'so is a .dotted .muted outline', s.b5);
    ok(s.e4 === '1.4px 0px, 3.5px' && s.b4 === '1.4px 0px, 3.5px',
      '.dotted alone is what the floor copies, and does not move', s.e4 + ' / ' + s.b4);
    ok(s.e2 === '1.05px none', '.muted alone keeps its 1.05', s.e2);
    ok(s.e3 === '1.05px 2.31px, 1.575px', '.dashed .muted keeps its 1.05 and its dash', s.e3);
    ok(s.e1 === '1.4px none', 'a plain edge is untouched', s.e1);
    ok(s.e6 === '2.6px 0px, 6.5px', 'a .thick weight wins over the floor', s.e6);
  } finally {
    server.close();
    fs.rmSync(fix.dir, { recursive: true, force: true });
  }
}
