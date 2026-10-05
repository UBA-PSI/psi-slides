/*
 * bleed · a `.bleed` chunk's figure is drawn on the slide frame
 *
 * `.bleed` is the fifth width word and a fourth canvas tier: the chunk pads
 * nothing, its column is the frame, and its figure's canvas is the frame
 * measured in labels. Every claim that makes is a size on a rendered page,
 * and each of them has a way of being quietly wrong that no gate can see:
 *
 *   - the svg is the frame, 1600 x 900 at the reference viewport. A margin
 *     left on the figure or a gap left on the column makes it 40 px taller
 *     than the frame and nothing says so;
 *   - the zoom stays where every other slide's is. A canvas one frame tall
 *     is over auto-fit's 0.94 by construction, so without its own bound the
 *     fit steps each bleed slide down a notch - and the labels with it;
 *   - the base label is the body em, as on every other tier. That is the one
 *     property the canvas exists for, and the one a "make it bigger" change
 *     loses first;
 *   - the steps still walk, and an overlay held to a beat arrives on it and
 *     stands in the frame's gutter rather than on its edge - the padding is
 *     zeroed on the property and not through the variable the overlay reads;
 *   - the cockpit shows the same slide at the same type, with the next step's
 *     name lying over the figure instead of under it;
 *   - and the printed document still hugs the drawing and keeps the heading
 *     `.bare` took off the slide.
 *
 * Its own fixture deck, for the reason test/README.md gives for the others:
 * the claims are about a figure drawn exactly to its canvas, one drawn well
 * inside it, and one with an overlay riding it, and a lecture that happened
 * to have all three would stop having them the day somebody edited a label.
 */
import fs from 'node:fs';
import { tmpDir } from './tmp.mjs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { serve, ROOT } from './harness.mjs';

export const name = 'bleed · the figure is the frame, at body-size labels';
export const lecture = 'tutorial';   // built for other specs already; unused here
export const view = 'audience';

const TOL = 0.06;        // of the body size, as in figure-type.mjs

// The grid is 80 x 40 px cells, so the frame's canvas (759.7 x 427.3 viewBox
// units at the ordinary em) is 9.5 cells across and 10.7 down. `#fill` and
// `#steps` put a box in two opposite corners of it; `#flat` uses a strip.
const SOURCE = `---
title: Bleed
auto-fit: true
---

## title: {#title}

## free: Before {#before}

Words on an ordinary slide, for the zoom every slide opens at.

## free: A drawing that is the slide {.bare .bleed #fill}

::: draw 80x40
box a "Alpha" at 0,0 w 2 {.tone-1}
box b "Beta" at 7.1,9 w 2 {.tone-2}
edge a -> b
:::

## free: Steps and a caption {.bare .bleed #steps}

::: draw 80x40
box a "Alpha" at 0,0 w 2 {.tone-1}
box b "Beta" at 3.5,4.5 w 2 {.tone-2}
box c "Gamma" at 7.1,9 w 2 {.tone-3}
edge a -> b
edge b -> c

step second
  show b

step third
  show c
:::

::: overlay {.bottom-left .paper} from 1
The caption arrives with the second box.
:::

## free: A flat one {.bare .bleed #flat}

::: draw 80x40
box a "Alpha" at 0,0 w 2 {.tone-1}
box b "Beta" at 6,0 w 2 {.tone-2}
edge a -> b
:::

## free: The same slide at .full {.bare .full #full}

::: draw 80x40
box a "Alpha" at 0,0 w 2 {.tone-1}
box b "Beta" at 6,0 w 2 {.tone-2}
edge a -> b
:::
`;

const jump = (page, id) => page.evaluate((id) => {
  const i = [...document.querySelectorAll('.chunk')].findIndex(c => c.dataset.chunkId === id);
  window.jumpTo(i);
}, id);

// What the slide's one figure measures, in layout pixels.
const measure = (page, id) => page.evaluate((id) => {
  const el = document.getElementById(id);
  const svg = el.querySelector('svg.psi-diagram');
  const cs = getComputedStyle(svg);
  const body = el.querySelector('.chunk-body') || el.querySelector('.chunk-content');
  const r = (e) => { const b = e.getBoundingClientRect(); return { left: b.left, top: b.top, right: b.right, bottom: b.bottom, width: b.width, height: b.height }; };
  const card = el.querySelector('.overlay-card');
  const layer = el.querySelector('.overlay-layer');
  const hint = el.querySelector('.dg-hint');
  return {
    w: svg.clientWidth, h: svg.clientHeight,
    svg: r(svg), chunk: r(el),
    chunkH: el.offsetHeight,
    tier: el.dataset.canvasTier || '',
    label: svg.clientWidth / parseFloat(cs.getPropertyValue('--dg-fit-w')),
    bodyPx: parseFloat(getComputedStyle(body).fontSize),
    zoom: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--zoom')),
    step: svg.psiDiagram ? svg.psiDiagram.step : -1,
    card: card ? { ...r(card), hidden: card.hasAttribute('data-hidden') } : null,
    layerPad: layer ? parseFloat(getComputedStyle(layer).paddingLeft) : 0,
    hint: hint ? { ...r(hint), position: getComputedStyle(hint).position, display: getComputedStyle(hint).display } : null,
  };
}, id);

export async function run({ page, report, press }) {
  const { ok, note } = report;

  const dir = tmpDir('psi-bleed-');
  fs.writeFileSync(path.join(dir, 'source.md'), SOURCE);
  const built = spawnSync(process.execPath, [path.join(ROOT, 'build.js'), path.join(dir, 'source.md')],
    { cwd: ROOT, encoding: 'utf8' });
  ok(built.status === 0, 'the fixture deck builds', (built.stdout || '') + (built.stderr || ''));
  if (built.status !== 0) return;
  const out = (built.stdout || '') + (built.stderr || '');
  ok(!/figure-overflows-canvas|figure-underfills-canvas in chunk #(fill|steps)/.test(out),
     'and the two figures drawn to the frame neither overflow nor underfill it', out.split('\n').filter(l => /figure-/.test(l)).join(' | '));
  ok(/figure-underfills-canvas in chunk #flat:[^\n]*?\.full in place of \.bleed/.test(out),
     'while the flat one is told it fills little of the frame, and that .full is the way back',
     out.split('\n').filter(l => /figure-underfills/.test(l)).join(' | ').slice(0, 300));

  const { server, port } = await serve(dir);
  try {
    // The reference viewport: the canvas is defined at 1600x900.
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto(`http://127.0.0.1:${port}/audience.html`, { waitUntil: 'load' });
    await page.evaluate(() => { try { localStorage.clear(); } catch (e) { /* private window */ } });
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(700);

    // 1.35 is the zoom a slide opens at and the em the canvas is measured in
    // (FIG_REF_ZOOM). Not "the zoom of the slide before": under auto-fit a
    // slide of two lines of prose is grown to 2.2, and a figure slide that
    // fits its canvas is exactly the one that stays put.
    // ── #fill: a drawing drawn to its canvas is the frame ──
    await jump(page, 'fill');
    await page.waitForTimeout(600);
    let m = await measure(page, 'fill');
    ok(m.tier === 'bleed', 'fill: the chunk carries the bleed tier', m.tier);
    ok(Math.abs(m.w - 1600) <= 1 && Math.abs(m.h - 900) <= 1,
       'fill: the svg is 1600 x 900, the frame', `${m.w} x ${m.h}`);
    ok(Math.abs(m.svg.left) <= 1 && Math.abs(m.svg.top) <= 1 && Math.abs(m.svg.right - 1600) <= 1 && Math.abs(m.svg.bottom - 900) <= 1,
       'fill: and it stands on the frame, edge to edge', JSON.stringify(m.svg));
    ok(Math.abs(m.chunkH - 900) <= 1, 'fill: the chunk is one frame tall, no margin or gap added to it', String(m.chunkH));
    ok(Math.abs(m.zoom - 1.35) < 0.001,
       'fill: auto-fit leaves the zoom where a figure on its canvas settles, 1.35', String(m.zoom));
    ok(Math.abs(m.label / m.bodyPx - 1) <= TOL,
       'fill: a base label is the size of the body type', `${m.label.toFixed(1)} px against ${m.bodyPx.toFixed(1)}`);
    note(`fill: svg ${m.w} x ${m.h}, zoom ${m.zoom}, base label ${m.label.toFixed(1)} px, body ${m.bodyPx.toFixed(1)} px`);

    // ── #steps: the beats walk, and the caption arrives on its own ──
    await jump(page, 'steps');
    await page.waitForTimeout(600);
    m = await measure(page, 'steps');
    ok(m.step === 0 && m.card && m.card.hidden, 'steps: opens on beat 0 with the caption held back', JSON.stringify({ step: m.step, card: m.card && m.card.hidden }));
    ok(Math.abs(m.w - 1600) <= 1 && Math.abs(m.h - 900) <= 1 && Math.abs(m.zoom - 1.35) < 0.001,
       'steps: the frame and the zoom again', `${m.w} x ${m.h} at ${m.zoom}`);
    await press('ArrowRight', 500);
    m = await measure(page, 'steps');
    ok(m.step === 1, 'steps: ArrowRight advances the figure', String(m.step));
    ok(m.card && !m.card.hidden, 'steps: and the overlay held to beat 1 is up', JSON.stringify(m.card));
    // The layer pads by the chunk's own --slide-pad-x, which .bleed leaves
    // alone: the card is inside the frame by that much, not on its edge.
    ok(m.layerPad > 60 && m.card.left >= m.layerPad - 1 && m.card.right <= 1600 - m.layerPad + 1
       && m.card.bottom <= 900 - 20 && m.card.top >= 20,
       'steps: the card stands in the frame\'s gutter', JSON.stringify({ pad: m.layerPad, card: m.card }));
    await press('ArrowRight', 500);
    m = await measure(page, 'steps');
    ok(m.step === 2, 'steps: and again', String(m.step));
    const after = await page.evaluate(() => document.querySelector('.chunk.active').dataset.chunkId);
    ok(after === 'steps', 'steps: still on the slide while it has beats', after);
    await press('ArrowRight', 600);
    const next = await page.evaluate(() => document.querySelector('.chunk.active').dataset.chunkId);
    ok(next === 'flat', 'steps: the press after the last beat leaves the slide', next);

    // ── #flat: the box is the frame whatever the drawing's shape ──
    m = await measure(page, 'flat');
    ok(Math.abs(m.w - 1600) <= 1 && Math.abs(m.h - 900) <= 1,
       'flat: a drawing well inside its canvas still gets the frame as its box', `${m.w} x ${m.h}`);
    ok(Math.abs(m.label / m.bodyPx - 1) <= TOL && Math.abs(m.zoom - 1.35) < 0.001,
       'flat: and its labels are body size, not blown up to fill it', `${m.label.toFixed(1)} px against ${m.bodyPx.toFixed(1)}`);
    await jump(page, 'full');
    await page.waitForTimeout(600);
    const f = await measure(page, 'full');
    ok(f.tier === 'picture' && Math.abs(f.w - 1408) <= 1,
       'full: the same drawing at .full sits on the 1408 px picture canvas', `${f.tier} ${f.w} x ${f.h}`);
    ok(Math.abs(f.label - m.label) < 0.5,
       'full: with labels the same size as on the bleed slide - .bleed offers room, not bigger type',
       `${f.label.toFixed(1)} px against ${m.label.toFixed(1)}`);

    // ── a window that is not 16:9 ──
    // The canvas is 16:9. A narrower window caps the figure at the frame's
    // width and the fit takes the type down to meet it, as on every other
    // width; a wider one leaves the figure 16:9 and centred.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(400);
    await jump(page, 'fill');
    await page.waitForTimeout(700);
    m = await measure(page, 'fill');
    // The zoom moves in steps of 0.05, so the figure lands within one step
    // under the frame's width rather than on it.
    ok(m.w <= 1440 && m.w > 1440 * 0.95 && m.h <= 900 && Math.abs(m.label / m.bodyPx - 1) <= TOL,
       'at 1440x900 the figure is as wide as the frame allows and the labels are still the body\'s size',
       `${m.w} x ${m.h}, label ${m.label.toFixed(1)} against ${m.bodyPx.toFixed(1)}, zoom ${m.zoom}`);
    await page.setViewportSize({ width: 1800, height: 900 });
    await page.waitForTimeout(400);
    await jump(page, 'before');
    await page.waitForTimeout(300);
    await jump(page, 'fill');
    await page.waitForTimeout(700);
    m = await measure(page, 'fill');
    ok(Math.abs(m.h - 900) <= 1 && Math.abs(m.w - 1600) <= 1
       && Math.abs((m.svg.left - m.chunk.left) - (m.chunk.right - m.svg.right)) <= 2,
       'at 1800x900 it is the frame\'s height, 16:9, and centred', JSON.stringify({ w: m.w, h: m.h, svg: m.svg, chunk: m.chunk }));
    await page.setViewportSize({ width: 1600, height: 900 });

    // ── the cockpit: the same type, the hint over the figure ──
    const ctx = page.context();
    const sp = await ctx.newPage();
    const spErrors = [];
    sp.on('pageerror', e => spErrors.push(String(e)));
    await sp.setViewportSize({ width: 1600, height: 900 });
    await sp.goto(`http://127.0.0.1:${port}/speaker.html`, { waitUntil: 'load' });
    await sp.waitForTimeout(900);
    await jump(sp, 'steps');
    await sp.waitForTimeout(700);
    const s = await measure(sp, 'steps');
    ok(Math.abs(s.zoom - 1.35) < 0.001 && Math.abs(s.label / s.bodyPx - 1) <= TOL,
       'cockpit: the bleed slide is at the projection\'s zoom, labels at body size',
       `${s.zoom}, ${s.label.toFixed(1)} px against ${s.bodyPx.toFixed(1)}`);
    ok(Math.abs(s.w / s.h - 16 / 9) < 0.01 && Math.abs(s.chunkH - s.h) <= 1,
       'cockpit: the mirror\'s figure is 16:9 and its chunk no taller than it', `${s.w} x ${s.h}, chunk ${s.chunkH}`);
    ok(s.hint && s.hint.display !== 'none' && s.hint.position === 'absolute'
       && s.hint.top >= s.svg.top - 1 && s.hint.bottom <= s.svg.bottom + 1,
       'cockpit: the next step\'s name lies over the figure, not under it', JSON.stringify({ hint: s.hint, svg: s.svg }));
    ok(spErrors.length === 0, 'cockpit: no page errors', spErrors.join(' | '));
    await sp.close();

    // ── the document: the drawing hugs, the heading is back ──
    const print = fs.readFileSync(path.join(dir, 'print.html'), 'utf8');
    const art = (/<article[^>]*id="fill"[\s\S]*?<\/article>/.exec(print) || [''])[0];
    ok(/<h2[^>]*>A drawing that is the slide<\/h2>/.test(art), 'print: the heading .bare took off the slide is in the document');
    const vb = (/<svg[^>]*class="psi-diagram"[^>]*viewBox="[-\d.]+ [-\d.]+ ([\d.]+) ([\d.]+)"/.exec(art) || []).slice(1).map(Number);
    const cv = (/data-canvas="([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+)"/.exec(art) || []).slice(1).map(Number);
    ok(vb.length === 2 && cv.length === 4 && Math.abs(vb[0] - cv[2]) < 0.6 && Math.abs(vb[1] - cv[3]) < 0.6,
       'print: the svg\'s viewBox is the box that hugs the drawing', `${vb.join(' x ')} against ${cv.join(' ')}`);
    ok(cv[0] >= vb[0] - 0.6 && cv[1] > vb[1],
       'print: and the frame-sized canvas is the live views\' alone', `${cv.join(' ')}`);
  } finally {
    server.close();
  }
}
