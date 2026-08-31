/*
 * The touch rail in the cockpit, against the furniture it shares an edge with.
 *
 * The rail is fixed to the bottom of the window in the audience view, where
 * there is nothing else down there. The cockpit stacks three things below the
 * stage - the notes pane, the thumbnail strip, the footer - and two of them
 * change size while the lecture runs. The rail used to clear them by summing
 * the numbers the grid rows are written in, and it summed two of the three:
 * the notes row is `auto`, so it has no number to read, and the opaque pill
 * covered 81-82% of the pane the moment Shift-N opened it. On a tablet at the
 * lectern - the case the rail exists for - the lecturer's notes were behind
 * the buttons, and nothing in any suite noticed.
 *
 * So this spec asserts the property rather than the arithmetic: whatever is
 * below the stage, the rail is not on top of it. That holds for a rule that
 * sums three numbers as well as for the one that sums none, which is the
 * point - the next thing added to the bottom of the cockpit is covered too.
 *
 * It builds its own browser context, because the rail lives behind
 * `@media (pointer: coarse)` and openDeck's context has a fine pointer - in
 * which the bar is not in the document at all, and a measurement of it
 * cheerfully reports no overlaps among no buttons.
 */
export const name = 'touch rail · cockpit';
export const lecture = 'tutorial';
export const view = 'speaker';

// Below the stage, and therefore never to be painted over. #stage-cell is
// left out on purpose: the rail shares that cell by design.
const BELOW = ['#notes-pane', '#preview-strip', '#speaker-footer'];

const measure = (page) => page.evaluate((below) => {
  const R = (s) => {
    const e = document.querySelector(s);
    if (!e) return null;
    const b = e.getBoundingClientRect();
    return { s, x: b.left, y: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height };
  };
  const rail = R('#touch-controls');
  if (!rail || !rail.w) return { rail: null };
  const covers = [];
  for (const sel of below) {
    const o = R(sel);
    if (!o || !o.w || !o.h) continue;
    const dy = Math.min(o.b, rail.b) - Math.max(o.y, rail.y);
    const dx = Math.min(o.r, rail.r) - Math.max(o.x, rail.x);
    if (dy > 0.5 && dx > 0.5) covers.push(`${sel} by ${Math.round(dy)}px (${Math.round(100 * dy / o.h)}% of it)`);
  }
  const btns = [...document.querySelectorAll('#touch-controls button')]
    .map(b => b.getBoundingClientRect()).filter(b => b.width);
  return {
    rail,
    covers,
    buttons: btns.length,
    small: btns.filter(b => b.width < 44 || b.height < 44).length,
    off: btns.filter(b => b.top < 0 || b.bottom > innerHeight || b.left < 0 || b.right > innerWidth).length,
    stageH: Math.round((R('#stage-cell') || { h: 0 }).h),
  };
}, BELOW);

export async function run({ page, report }) {
  const { ok, note } = report;
  const browser = page.context().browser();
  const url = page.url();
  const errors = [];

  // Portrait and landscape, because the cockpit re-lays-out between them, and
  // one tablet held each way is the whole of how this window is used.
  for (const [label, w, h] of [['portrait', 834, 1112], ['landscape', 1194, 834]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
    const p = await ctx.newPage();
    p.on('pageerror', e => errors.push(String(e)));
    p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await p.goto(url, { waitUntil: 'load' });
    await p.waitForTimeout(700);

    ok((await measure(p)).rail !== null,
      `the rail is there at all in ${label} - it needs a coarse pointer to exist`);

    // Shift-V moves the thumbnail strip to the right edge, which changes the
    // grid; Shift-N opens the notes pane, which is the row that was missed.
    for (const previewRight of [false, true]) {
      if (previewRight) { await p.keyboard.press('Shift+V'); await p.waitForTimeout(450); }
      await p.keyboard.press('Shift+N');
      await p.waitForTimeout(450);

      for (const paletteOpen of [false, true]) {
        if (paletteOpen) {
          await p.evaluate(() => document.querySelector('#touch-controls [data-action=more]').click());
          await p.waitForTimeout(300);
        }
        const m = await measure(p);
        const where = `${label}, strip ${previewRight ? 'right' : 'bottom'}, palette ${paletteOpen ? 'open' : 'closed'}`;
        ok(m.covers.length === 0, `nothing below the stage is under the rail (${where})`, m.covers.join('; '));
        ok(m.off === 0, `every button is on screen (${where})`, String(m.off));
        ok(m.small === 0, `and big enough to hit (${where})`, String(m.small));
        if (paletteOpen) {
          note(`${where}: ${m.buttons} buttons, rail ${Math.round(m.rail.y)}..${Math.round(m.rail.b)}, stage ${m.stageH}px tall`);
          await p.evaluate(() => document.querySelector('#touch-controls [data-action=more]').click());
          await p.waitForTimeout(250);
        }
      }
      await p.keyboard.press('Shift+N');       // close the notes again
      await p.waitForTimeout(350);
    }
    await ctx.close();
  }
  ok(errors.length === 0, 'no page errors in the contexts this spec opened itself', errors.join(' | '));
}
