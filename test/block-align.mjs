/*
 * Where a code block, a figure and a display formula sit across the slide.
 *
 * All three have been centred since the tool shipped, and centred is right
 * when the block is the slide. It is wrong when the block is one step of an
 * argument: a paragraph, then a formula, then a paragraph reads as three
 * blocks on three axes. `style: {blocks: left}` and the per-chunk
 * `.blocks-left` put all three on the prose's own axis.
 *
 * This is a browser spec and not a settings check because the three move by
 * three different mechanisms and none of them is legible in the stylesheet.
 * The pre is centred by a breakout - left: 50% plus a translate - so its box
 * moves and the listing inside it was left-aligned all along. The figure is
 * a flex column and its align-items moves the artwork and the caption inside
 * a box that does not move. The formula is KaTeX's own text-align, two rules
 * deep. Reading the CSS tells you all three rules exist; only a layout says
 * whether the left edges actually line up.
 *
 * The second thing it measures is the one number that could quietly be
 * wrong. A left-aligned pre keeps the breakout width, so its max-width is
 * computed from where the column starts rather than from the slide's middle:
 * 0.36 x slide + half the column. If that arithmetic is off, a wide listing
 * runs past the slide's padding and off the projection - which no assertion
 * about a left edge would ever notice. It is checked at both chunk widths
 * that bracket the range and at two window sizes, because a formula that
 * happens to agree at one size is not arithmetic.
 *
 * This spec builds its own decks. No lecture in the repository sets either
 * switch - the tutorial is the author's and is edited continuously - and the
 * pair only means anything when the same content is shown both ways.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { serve, ROOT } from './harness.mjs';

export const name = 'blocks · a code block, a figure and a formula on the prose axis';
export const lecture = 'tutorial';   // built for other specs already; unused here
export const view = 'audience';

// One long line, so the pre is always wider than the column it sits in and
// the breakout always has something to do.
const LONG = 'def score(page, links, weights, seen, depth, budget, verbose, tracer, cache):';
const CHUNK = (id, cls) => `## example: A heading long enough that the balancer has work to do {#${id}${cls}}

A paragraph whose left edge is the axis every block below is measured against.

$$ E = mc^2 + \\sum_{i=1}^{n} \\frac{a_i}{b_i} $$

\`\`\`python
${LONG}
\`\`\`

![A badge](badge)
`;

// Two decks: one that says nothing (so the classes are what moves things),
// and one that says blocks: left deck-wide (so the class has to move them
// back). Both directions of the switch have to be reachable or the key is
// only half a key.
const DECK_DEFAULT = `---
title: T
collapse: none
---

## title: {#title}

${CHUNK('plain', '')}
${CHUNK('left', ' .blocks-left')}
${CHUNK('narrow', ' .narrow .blocks-left')}
${CHUNK('full', ' .full .blocks-left')}
`;

const DECK_LEFT = `---
title: T
collapse: none
style:
  blocks: left
  wrap: none
---

## title: {#title}

${CHUNK('deckleft', '')}
${CHUNK('back', ' .blocks-center .wrap-balance')}
`;

const BADGE = `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="180" viewBox="0 0 420 180">
<rect x="1" y="1" width="418" height="178" fill="none" stroke="#888" stroke-width="2"/>
</svg>
`;

function buildDeck(source, tag) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-blocks-' + tag + '-'));
  fs.mkdirSync(path.join(dir, 'assets'));
  fs.writeFileSync(path.join(dir, 'assets/badge.svg'), BADGE);
  fs.writeFileSync(path.join(dir, 'source.md'), source);
  const r = spawnSync(process.execPath,
    [path.join(ROOT, 'build.js'), path.join(dir, 'source.md'), '--audience-only'],
    { cwd: ROOT, encoding: 'utf8' });
  return { dir, status: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

// Every edge one chunk puts on the screen, in one round trip. The slide box
// is the chunk's own rect rather than the viewport, because the camera is
// free to scale and translate the stage and a viewport fraction would then
// be measuring the wrong rectangle.
const edges = (page, id) => page.evaluate((cid) => {
  const c = document.getElementById(cid);
  const L = (el) => (el ? el.getBoundingClientRect().left : null);
  const R = (el) => (el ? el.getBoundingClientRect().right : null);
  const q = (s) => c.querySelector(s);
  const slide = c.getBoundingClientRect();
  // The formula's glyphs, not the block that holds them: KaTeX centres by
  // text-align, so every box down to .katex-html is the full measure and
  // reports the same left edge in both directions.
  const glyphs = q('.math-display .katex-html > span');
  const head = q('.chunk-heading');
  // Line boxes of the heading, for the wrap half: a balanced heading evens
  // its lines, a greedy one fills the first and strands the rest.
  const lines = head
    ? [...(() => { const r = document.createRange(); r.selectNodeContents(head); return r.getClientRects(); })()]
      .map(b => Math.round(b.width)).filter(w => w > 4)
    : [];
  return {
    prose: L(q('.chunk-body p')),
    pre: L(q('pre')), preR: R(q('pre')),
    formula: glyphs ? glyphs.getBoundingClientRect().left : null,
    img: L(q('figure.figure-img img, figure.figure-img svg')),
    cap: L(q('figure.figure-img figcaption')),
    slideL: slide.left, slideR: slide.right, slideW: slide.width,
    lines,
  };
}, id);

export async function run({ page, report, walkTo }) {
  const { ok, note } = report;

  const a = buildDeck(DECK_DEFAULT, 'a');
  const b = buildDeck(DECK_LEFT, 'b');
  ok(a.status === 0 && b.status === 0, 'both fixture decks build', a.out + b.out);
  if (a.status !== 0 || b.status !== 0) return;

  const near = (x, y, slack = 2) => x !== null && y !== null && Math.abs(x - y) <= slack;

  for (const [deck, dir] of [['default', a.dir], ['deck-wide left', b.dir]]) {
    const { server, port } = await serve(dir);
    try {
      for (const [w, h] of [[1600, 900], [1280, 800]]) {
        await page.setViewportSize({ width: w, height: h });
        await page.goto(`http://127.0.0.1:${port}/audience.html`, { waitUntil: 'load' });
        await page.evaluate(() => { try { localStorage.clear(); } catch (e) { /* private window */ } });
        await page.reload({ waitUntil: 'load' });
        await page.waitForTimeout(600);

        const at = `${deck}, ${w}x${h}`;
        const ids = deck === 'default' ? ['plain', 'left', 'narrow', 'full'] : ['deckleft', 'back'];
        const m = {};
        for (const id of ids) {
          await walkTo(id);
          await page.waitForTimeout(250);
          m[id] = await edges(page, id);
        }

        // The centred baseline, and the reason the key exists: three blocks,
        // three axes, none of them the prose's. The figure and the formula
        // sit inside the measure and start to the right of it; the listing
        // is the one that does not, because a wide breakout straddles the
        // column - so the property asserted for it is that it is centred on
        // the slide, which is what actually puts it on an axis of its own.
        const centred = deck === 'default' ? m.plain : m.back;
        ok(centred.img > centred.prose + 8 && centred.formula > centred.prose + 8,
           `centred leaves the figure and the formula off the prose's axis (${at})`,
           JSON.stringify(centred));
        ok(Math.abs((centred.pre - centred.slideL) - (centred.slideR - centred.preR)) <= 2
           && Math.abs(centred.pre - centred.prose) > 8,
           `and the listing on the slide's centre rather than the column's left (${at})`,
           `${Math.round(centred.pre - centred.slideL)} left of it, `
           + `${Math.round(centred.slideR - centred.preR)} right`);

        // And the switch, whichever level it came from.
        const left = deck === 'default' ? m.left : m.deckleft;
        ok(near(left.pre, left.prose), `the listing starts where the sentence starts (${at})`,
           `${left.pre} vs ${left.prose}`);
        ok(near(left.img, left.prose), `so does the figure (${at})`,
           `${left.img} vs ${left.prose}`);
        ok(near(left.cap, left.prose), `and its caption, which is a separate rule (${at})`,
           `${left.cap} vs ${left.prose}`);
        ok(near(left.formula, left.prose, 3), `and the formula's first glyph (${at})`,
           `${left.formula} vs ${left.prose}`);
        note(`${at}: prose ${Math.round(left.prose)}, pre ${Math.round(left.pre)}, `
           + `formula ${Math.round(left.formula)}, figure ${Math.round(left.img)}`);

        // The number that could be quietly wrong. A left-aligned breakout is
        // capped from the column's left edge; if the arithmetic is off the
        // listing runs past the slide's 14% padding and off the projection.
        for (const id of ids) {
          if (m[id].pre === null) continue;
          const pad = m[id].slideL + m[id].slideW * 0.86;
          ok(m[id].preR <= pad + 1,
             `#${id}'s listing stops at the slide's padding, not past it (${at})`,
             `${Math.round(m[id].preR)} vs ${Math.round(pad)}`);
        }
        // …and it must not have paid for that by giving the code less room
        // than the centred breakout gets. Same chunk width, same budget.
        if (deck === 'default') {
          const wide = m.full.preR - m.full.pre;
          ok(wide >= (m.plain.preR - m.plain.pre) - 1,
             `and a left listing is no narrower than the centred one (${at})`,
             `${Math.round(wide)} vs ${Math.round(m.plain.preR - m.plain.pre)}`);
        }

        // The wrap half, on the deck that turns balancing off. A balanced
        // heading evens its lines; a greedy one fills the first and leaves a
        // short tail, which is the whole complaint the key answers.
        if (deck === 'deck-wide left') {
          const greedy = m.deckleft.lines;
          const evened = m.back.lines;
          ok(greedy.length >= 2 && evened.length >= 2,
             `both headings take more than one line, or there is nothing to even (${at})`,
             JSON.stringify([greedy, evened]));
          if (greedy.length >= 2 && evened.length >= 2) {
            const spread = (ls) => Math.max(...ls) - Math.min(...ls);
            ok(spread(evened) < spread(greedy),
               `.wrap-balance evens a heading the deck-wide wrap: none left ragged (${at})`,
               `${spread(evened)}px spread balanced vs ${spread(greedy)}px greedy`);
          }
        }
      }
    } finally {
      server.close();
    }
  }
}
