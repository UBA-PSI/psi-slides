/*
 * A sequence keeps its rhythm.
 *
 * `sequence` owns exactly one thing – the vertical spacing – and the way it
 * fails is specific and invisible to every other check: a band that reserves
 * less room than the thing standing in it draws is still a correct figure by
 * the viewBox's reckoning, it just has a note box cutting through the label of
 * the message beneath it. That is precisely what the hand-written version of
 * this figure did, and it is the reason the statement exists.
 *
 * So this measures the emitted SVG the way figure-framing does, and asserts
 * the two halves of that promise on the two sequences in the lecture:
 *
 *  - nothing in a sequence overlaps anything else in it vertically. Every
 *    element is compared against every other, in page coordinates, with a
 *    tolerance of a pixel; the lifelines are excluded, because everything in
 *    the figure is meant to sit across them.
 *  - the generated names are the ones documented as the interface. An
 *    annotation hung off `wa-3` is an ordinary line in the lecture source, and
 *    it stops being one the day the scheme changes without the docs.
 */
export const name = 'figure sequence';
export const lecture = 'diagrams';
export const view = 'audience';

const TOL = 1.5;   // px of overlap tolerated before it is a collision

export async function run({ page, report }) {
  const { ok, note } = report;

  const figs = await page.evaluate(() => {
    const out = [];
    for (const id of ['sequence', 'seqmore']) {
      const chunk = document.getElementById(id);
      const svg = chunk && chunk.querySelector('svg.psi-diagram');
      if (!svg) { out.push({ id, missing: true }); continue; }
      const els = [];
      for (const g of svg.querySelectorAll('g.dg-el')) {
        let bb;
        try { bb = g.getBBox(); } catch (e) { continue; }
        if (!bb.width && !bb.height) continue;
        els.push({
          name: (g.id || '').replace(/^dg\d+-/, ''),
          cls: g.getAttribute('class') || '',
          x: bb.x, y: bb.y, w: bb.width, h: bb.height,
        });
      }
      out.push({ id, els });
    }
    return out;
  });

  ok(figs.every(f => !f.missing), 'both sequence figures are on the page',
    JSON.stringify(figs.filter(f => f.missing).map(f => f.id)));

  for (const fig of figs) {
    if (fig.missing) continue;
    // A lifeline runs the height of the figure and everything is meant to sit
    // across it; the frame is invisible and holds all of it by construction.
    const parts = fig.els.filter(e => !/-life$/.test(e.name) && e.name !== fig.els[0].name
      && !/\bbare\b/.test(e.cls));
    const hits = [];
    for (let i = 0; i < parts.length; i++) {
      for (let j = i + 1; j < parts.length; j++) {
        const a = parts[i], b = parts[j];
        const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        if (ox > TOL && oy > TOL) hits.push(a.name + ' × ' + b.name);
      }
    }
    note(fig.id.padEnd(10) + String(parts.length).padStart(3) + ' elements, '
      + hits.length + ' overlap(s)');
    ok(hits.length === 0, 'nothing in #' + fig.id + ' collides with anything else in it',
      hits.join(', '));
  }

  // The names the lecture, CLAUDE.md and lint.js all address. A rename would
  // break every annotation written against them, in every content repo, and
  // nothing else here would say so.
  const wa = figs.find(f => f.id === 'sequence');
  const have = new Set((wa.els || []).map(e => e.name));
  for (const n of ['wa', 'u', 'br', 'au', 'rp', 'u-life', 'au-life',
    'wa-0', 'wa-8', 'wa-n-0', 'wa-sub-3', 'wa-note-0']) {
    ok(have.has(n), 'the generated name ' + n + ' is what the compiler emits',
      [...have].join(' '));
  }
}
