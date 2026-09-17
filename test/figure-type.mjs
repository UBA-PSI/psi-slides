/*
 * A figure's labels are the size of the words beside them.
 *
 * The live views size a drawing from the type it stands in: `--dg-fit-w` is
 * the box on screen measured in base labels - the slide's canvas where the
 * chunk has one, the drawing's own box where it does not - so `--dg-fit-w × 1em`
 * is the width at
 * which a base label lands at exactly the size of the surrounding text. What
 * that is worth is one number per figure – the base label against the body
 * type on the same slide – and it is a number only a rendered page has. The
 * source says nothing about it: before the rule, this lecture's figures ran
 * from 0.53x to 1.84x of their own slide's prose, decided by however many grid
 * units each drawing happened to use.
 *
 * One claim, made per figure rather than over the deck, because the way this
 * breaks is one slide and an average hides it: **every drawing on a slide is
 * at the type size of that slide's own words.** A cap that is not the column
 * takes it below 1, and no other spec would see it.
 *
 * The cap that does it is one measured in the same ems as the type. Shrinking
 * the type shrinks what the figure asks for, so a cap in PIXELS – the column,
 * the height budget – is escaped and the gap closes; a cap in ems moves with
 * the type, the gap never closes, and `fitZoomToChunk`, which treats a capped
 * figure as "does not fit", walks that slide to its 0.6 floor with the figure
 * still behind the words. A figure chunk's 40em caption measure did exactly
 * that to thirteen measured slides of this lecture. The zoom each slide settled
 * at is a note beside the failure, because sitting at the floor is not wrong:
 * two of this lecture's drawings are big enough that the floor is the honest
 * answer, and the build says so as `figure-type-small`.
 *
 * Measured on the slide only: an `::: expand` body is off the projection and
 * sets its own type, and `.small` and `.large` are the vocabulary doing what
 * it says, so the comparison is the base label and not the smallest one.
 */
export const name = 'figure type · a label is the size of the words beside it';
export const lecture = 'diagrams';
export const view = 'audience';

const TOL = 0.06;        // of the body size; the zoom moves in 0.05 steps
const FLOOR = 0.61;      // fitZoomToChunk stops shrinking at 0.6

export async function run({ page, report, press }) {
  const { ok, note } = report;

  // Every chunk the deck walks through, measured where it settles. The walk
  // is the whole population rather than a list of ids, because the failure
  // this guards is one slide in a deck and naming six would miss it.
  const rows = [];
  for (let i = 0; i < 200; i++) {
    const row = await page.evaluate(() => {
      const act = document.querySelector('.chunk.active');
      if (!act) return null;
      const body = act.querySelector('.chunk-body') || act.querySelector('.chunk-content');
      const content = act.querySelector('.chunk-content');
      const colPx = content ? content.getBoundingClientRect().width : 0;
      const slideH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--slide-h'))
        || window.innerHeight;
      const figs = [];
      for (const svg of act.querySelectorAll('svg.psi-diagram')) {
        if (!svg.clientWidth || svg.closest('.exps')) continue;
        const cs = getComputedStyle(svg);
        // --dg-fit-w / --dg-fit-ar and not the print pair: a live view shows
        // the slide's canvas, and a base label is the rendered width over the
        // width of the box actually on screen. Measuring against the print
        // viewBox reads a figure that exactly fills its canvas as one whose
        // labels are half as big again as the words beside them.
        const typeW = parseFloat(cs.getPropertyValue('--dg-fit-w'));
        const ar = parseFloat(cs.getPropertyValue('--dg-fit-ar')) || 1;
        if (!(typeW > 0)) continue;
        figs.push({
          px: Math.round((svg.clientWidth / typeW) * 10) / 10,
          // The widest this drawing could be here whatever the type did: the
          // column, or the height budget turned into a width.
          w: Math.round(svg.clientWidth),
          room: Math.round(Math.min(colPx, slideH * 0.62 * ar)),
        });
      }
      return {
        id: act.id || '?',
        zoom: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--zoom')),
        bodyPx: body ? Math.round(parseFloat(getComputedStyle(body).fontSize) * 10) / 10 : 0,
        figs,
      };
    });
    if (!row) break;
    if (row.figs.length && !rows.some(r => r.id === row.id)) rows.push(row);
    await press('ArrowDown', 120);
  }

  ok(rows.length >= 10, 'the walk found the lecture’s figures', String(rows.length));
  if (!rows.length) return;

  const ratios = [];
  const off = [];
  for (const r of rows) {
    for (const f of r.figs) {
      const ratio = r.bodyPx ? f.px / r.bodyPx : 0;
      ratios.push(ratio);
      if (Math.abs(ratio - 1) > TOL) off.push(`#${r.id} ${f.px}px vs ${r.bodyPx}px (${ratio.toFixed(2)}x)`);
    }
  }
  ratios.sort((a, b) => a - b);
  note(`${ratios.length} figures on ${rows.length} slides: `
    + `${ratios[0].toFixed(2)}x to ${ratios[ratios.length - 1].toFixed(2)}x of the body type`);
  ok(!off.length, 'every figure’s base label is the size of its slide’s body type', off.join('; '));

  // Where the type ended up, for the reader of a failure rather than for the
  // assertion: a slide at the floor with matching labels is a drawing too big
  // for the frame, and the same slide with labels behind the words is the
  // runaway. The line above says which of the two it was.
  const floored = rows.filter(r => r.zoom <= FLOOR);
  note(floored.length
    ? `at the auto-fit floor: ${floored.map(r => '#' + r.id).join(', ')} – of ${rows.length} slides `
      + `with a figure, and their drawings fill ${floored.map(r => r.figs
        .map(f => Math.round(100 * f.w / f.room) + '%').join('/')).join(', ')} of the room the frame `
      + 'has for them'
    : 'no slide with a figure reached the auto-fit floor');
}
