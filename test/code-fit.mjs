/*
 * style.code-fit and style.spacing: a short listing grows to fill a slide
 * with room to spare, and the free height is shared out evenly.
 *
 * A browser spec because both answers are measurements. code-fit grows a
 * listing in steps until the slide would stop passing the zoom fit's own test
 * - height inside the frame, no line wider than its box - so whether a step
 * is taken depends on the laid-out type, and spacing hands out what is left
 * of the frame, which no stylesheet knows. The build half (which attribute
 * goes where, the refusals, that a deck without the keys carries none of the
 * runtime) is in test/settings.mjs.
 *
 * What is held here:
 *   - a four-line listing grows to the ceiling, and its slide keeps the zoom
 *     a declining slide has: the listing grows, the prose does not;
 *   - a twenty-line listing and a listing with one 70-character line do not
 *     grow at all, and no listing ends up wider than its box;
 *   - under `even` the space above the heading, under the heading and under
 *     the body are the same to a few pixels, and the slide is inside the frame;
 *   - the answer is the same on every beat: a listing that arrives on the
 *     second press has the size and the place on the first it has on the second;
 *   - `.code-fit-100 .spacing-compact` declines both on one chunk;
 *   - the cockpit's stage gives the same answer as the projection.
 *
 * It builds its own deck: no lecture in the repository sets either key.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpDir } from './tmp.mjs';
import { serve, ROOT, openDeck, settle } from './harness.mjs';

export const name = 'code-fit · short listings grow, the free height is shared out';
export const lecture = 'tutorial';   // built for other specs already; unused here
export const view = 'audience';

const SHORT = 'for (int i = 0; i < 3; i++)\n{\n    printf("meow\\n");\n}';
const LONG = Array.from({ length: 20 }, (_, i) => `int v${i} = ${i};`).join('\n');
const WIDE = 'printf("%s and %s and %s and %s\\n", first, second, third, fourth, n);';

const DECK = `---
title: T
auto-fit: shrink
style:
  code-fit: 1.6
  spacing: even
---

## title: {#title}

## free: A short listing {.wide #short}

\`\`\`c
${SHORT}
\`\`\`

## free: The listing arrives on the second press {.wide #beat}

---

\`\`\`c
${SHORT}
\`\`\`

## free: A long listing {.wide #long}

\`\`\`c
${LONG}
\`\`\`

## free: One wide line {.wide #wide}

\`\`\`c
${WIDE}
\`\`\`

## free: Declines both {.wide .code-fit-100 .spacing-compact #declines}

\`\`\`c
${SHORT}
\`\`\`
`;

function buildDeck() {
  const dir = tmpDir('psi-code-fit-');
  fs.writeFileSync(path.join(dir, 'source.md'), DECK);
  const r = spawnSync(process.execPath,
    [path.join(ROOT, 'build.js'), path.join(dir, 'source.md')],
    { cwd: ROOT, encoding: 'utf8' });
  return { dir, status: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

const measure = (page, id) => page.evaluate((cid) => {
  const c = document.getElementById(cid);
  const vp = document.getElementById('psiINT-stage-viewport').getBoundingClientRect();
  const R = (el) => el.getBoundingClientRect();
  const head = R(c.querySelector('.chunk-heading'));
  const content = R(c.querySelector('.chunk-content'));
  const pre = c.querySelector('pre');
  const p = R(pre);
  // Back into the slide's own coordinates: the cockpit draws its stage scaled.
  const k = vp.height / document.getElementById('psiINT-stage-viewport').offsetHeight;
  return {
    scale: c.style.getPropertyValue('--code-scale') || '',
    gap: c.style.getPropertyValue('--spread-gap') || '',
    zoom: parseFloat(getComputedStyle(c).getPropertyValue('--zoom')),
    fs: parseFloat(getComputedStyle(pre).fontSize),
    overflows: pre.scrollWidth > pre.clientWidth + 1,
    above: (head.top - vp.top) / k,
    // Less the listing's own top margin: 0.4 of its size, so it grows with
    // the listing, and it is not the spacing being measured.
    under: (p.top - parseFloat(getComputedStyle(pre).marginTop) * k - head.bottom) / k,
    below: (vp.bottom - content.bottom) / k,
    preTop: (p.top - vp.top) / k,
    preH: p.height / k,
    inside: content.top >= vp.top - 1 && content.bottom <= vp.bottom + 1,
  };
}, id);

export async function run({ page, report, walkTo, press }) {
  const { ok } = report;
  const b = buildDeck();
  ok(b.status === 0, 'the fixture deck builds', b.out.split('\n').slice(-3).join(' | '));
  if (b.status !== 0) return;
  const { server, port } = await serve(b.dir);
  try {
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto(`http://127.0.0.1:${port}/audience.html`, { waitUntil: 'load' });
    await page.evaluate(() => { try { localStorage.clear(); } catch (e) { /* private window */ } });
    await page.reload({ waitUntil: 'load' });
    await settle(page, 700, { floor: 150 });

    const m = {};
    for (const id of ['short', 'long', 'wide', 'declines']) {
      ok(await walkTo(id), `the walk reaches #${id}`);
      await settle(page, 400);
      m[id] = await measure(page, id);
    }
    const near = (a, b, slack) => Math.abs(a - b) <= slack;

    ok(m.short.scale === '1.6' && near(m.short.fs, m.declines.fs * 1.6, 0.6),
       'a four-line listing grows to the ceiling, 1.6 times the size of one that declines',
       JSON.stringify({ short: m.short.fs, declines: m.declines.fs, scale: m.short.scale }));
    ok(m.short.zoom === m.declines.zoom,
       'and its slide keeps the zoom it would have had: the listing grows, the prose does not',
       `${m.short.zoom} vs ${m.declines.zoom}`);
    // Against the zoom: the long slide is shrunk by auto-fit, so its listing
    // is smaller than the declining one's without having been touched.
    const perZoom = (x) => x.fs / x.zoom;
    ok(m.long.scale === '' && near(perZoom(m.long), perZoom(m.declines), 0.3),
       'a twenty-line listing does not grow', JSON.stringify(m.long));
    ok(m.wide.scale === '' && near(perZoom(m.wide), perZoom(m.declines), 0.3),
       'nor does a listing whose one line would run past its box at the first step', JSON.stringify(m.wide));
    ok(['short', 'long', 'wide', 'declines'].every(id => !m[id].overflows),
       'no listing is wider than its box');

    ok(near(m.short.above, m.short.below, 3) && m.short.under > m.short.above - 3,
       'under even, the space above the heading and under the body is the same, and the gap under the heading takes its third',
       JSON.stringify({ above: m.short.above, under: m.short.under, below: m.short.below, gap: m.short.gap }));
    ok(near(m.short.under - parseFloat(m.short.gap), m.declines.under, 3),
       'and that third is on top of the gap a compact slide has', `${m.short.under} - ${m.short.gap} vs ${m.declines.under}`);
    ok(m.short.inside && m.long.inside, 'both slides stay inside the frame');
    ok(m.declines.gap === '' && m.declines.scale === '' && m.declines.under < 60,
       '.code-fit-100 .spacing-compact declines both on one chunk', JSON.stringify(m.declines));

    // The beat: the listing's segment keeps its box while it is hidden, so
    // the answer on the first press is the answer on the second.
    await page.evaluate(() => { try { localStorage.clear(); } catch (e) { /* private window */ } });
    await page.reload({ waitUntil: 'load' });
    await settle(page, 700, { floor: 150 });
    ok(await walkTo('beat'), 'the walk reaches #beat');
    await settle(page, 400);
    const b0 = await measure(page, 'beat');
    await press('ArrowRight', 400);
    const b1 = await measure(page, 'beat');
    ok(b0.scale === '1.6' && b0.scale === b1.scale && near(b0.preTop, b1.preTop, 1) && near(b0.preH, b1.preH, 1),
       'a listing that arrives on the second press has its size and place on the first',
       JSON.stringify({ b0: [b0.scale, b0.preTop, b0.preH], b1: [b1.scale, b1.preTop, b1.preH] }));

    // The cockpit runs the same runtime over the same layout, scaled.
    const cockpit = await openDeck(port, 'speaker', { width: 1600, height: 900 });
    try {
      await cockpit.page.goto(`http://127.0.0.1:${port}/speaker.html#short`, { waitUntil: 'load' });
      await settle(cockpit.page, 900, { floor: 300 });
      const s = await measure(cockpit.page, 'short');
      ok(s.scale === m.short.scale && near(parseFloat(s.gap), parseFloat(m.short.gap), 2),
         'the cockpit gives the same answer as the projection',
         JSON.stringify({ cockpit: [s.scale, s.gap], projection: [m.short.scale, m.short.gap] }));
    } finally {
      await cockpit.close();
    }
  } finally {
    server.close();
  }
}
