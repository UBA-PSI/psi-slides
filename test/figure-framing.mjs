/*
 * Every figure sits square in its own frame.
 *
 * The viewBox is computed from what the compiler *reserves* for each
 * drawable, and the drawing is what the browser paints. Those two can drift
 * apart silently: the picture still looks right, it just sits off to one side
 * of an oversized box, and on a slide that reads as a figure that is not
 * centred. Nothing else in the suite would notice.
 *
 * Two assertions per figure, and the first is the important one:
 *
 *  - nothing is clipped. Reserving too little is worse than too much, because
 *    the missing piece is simply gone from the projection.
 *  - the slack is roughly the same on both sides. What remains is the
 *    deliberate generosity of the text-width estimate (there is no browser at
 *    build time, and a box narrower than its label reads as broken), which
 *    measures about 11% on the bundled faces. The tolerance is well inside
 *    what the historical bugs cost: a label reserving a full width on *each*
 *    side of its origin, and container, brace and edge labels never recording
 *    a width at all and falling back to a hardcoded 120.
 */
export const name = 'figure framing';
export const lecture = 'diagrams';
export const view = 'audience';

const MARGIN = 12;          // DG_MARGIN, the pad boxFor adds on every side
const SKEW_FRACTION = 0.08; // of the viewBox width, generous against the estimate

export async function run({ page, errors, report }) {
  const { ok, note } = report;

  const figs = await page.evaluate(() => {
    const out = [];
    for (const svg of document.querySelectorAll('svg.psi-diagram')) {
      let bb; try { bb = svg.getBBox(); } catch (e) { continue; }
      if (!bb.width) continue;
      const vb = (svg.getAttribute('viewBox') || '').split(/\s+/).map(Number);
      out.push({
        id: (svg.closest('.chunk') || {}).id || '?',
        L: +(bb.x - vb[0]).toFixed(1),
        R: +((vb[0] + vb[2]) - (bb.x + bb.width)).toFixed(1),
        T: +(bb.y - vb[1]).toFixed(1),
        B: +((vb[1] + vb[3]) - (bb.y + bb.height)).toFixed(1),
        w: +vb[2].toFixed(1),
      });
    }
    return out;
  });

  ok(figs.length >= 10, 'found the figures to measure', String(figs.length));

  const clipped = figs.filter(f => f.L < -0.5 || f.R < -0.5 || f.T < -0.5 || f.B < -0.5);
  ok(clipped.length === 0, 'no figure is clipped by its own viewBox',
    JSON.stringify(clipped));

  const skewed = figs.filter(f => Math.abs(f.L - f.R) > f.w * SKEW_FRACTION);
  for (const f of figs) {
    note(f.id.padEnd(12) + ' L=' + String(f.L).padStart(6) + ' R=' + String(f.R).padStart(6)
      + '  (' + (100 * Math.abs(f.L - f.R) / f.w).toFixed(1) + '% of ' + f.w + ')');
  }
  ok(skewed.length === 0,
    'and every one sits within ' + (SKEW_FRACTION * 100) + '% of centre in its frame',
    JSON.stringify(skewed.map(f => f.id + ' L=' + f.L + ' R=' + f.R + ' w=' + f.w)));

  // The pad is uniform by construction, so a figure with nothing generous at
  // an edge should land exactly on it. If this drifts, DG_MARGIN moved.
  const tight = figs.filter(f => Math.abs(f.L - MARGIN) < 0.6 && Math.abs(f.R - MARGIN) < 0.6);
  ok(tight.length >= 4, 'several figures land exactly on the margin, so the pad is uniform',
    String(tight.length) + ' of ' + figs.length);

  ok(errors.length === 0, 'no page errors', errors.join(' | '));
}
