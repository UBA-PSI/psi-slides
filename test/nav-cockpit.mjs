/*
 * The navigation mark in the speaker cockpit, and the one rule that has to
 * differ there. Blanking darkens the *projection*; the cockpit keeps working,
 * which is the whole point of the key. So the marks have to survive it in the
 * cockpit - that is exactly the moment a lecturer is navigating with the room
 * dark and cannot see the slide to judge where they are.
 *
 * `.blanked` goes on document.body in both views, so a rule written without
 * the view in it silently strips the marks from the one window that needed
 * them. Every other blanking rule in the stylesheet is already scoped this
 * way; this spec is what keeps a new one from forgetting.
 */
export const name = 'navigation · cockpit';
export const lecture = 'diagrams';
export const view = 'speaker';

export async function run({ page, report, at, press }) {
  const { ok } = report;

  const opacity = (dir) => page.evaluate((d) =>
    getComputedStyle(document.querySelector('#nav-hints [data-hint="' + d + '"]')).opacity, dir);

  ok(await page.locator('#nav-hints').count() > 0, 'the cockpit carries the mark too');

  // Walk forward until the mark lights. It says "the next forward press
  // leaves this column", so it appears on the last chunk of a column once
  // nothing is left to reveal - which chunk that is belongs to the lecture,
  // not to this spec, so the spec looks for it rather than writing it in.
  let lit = 0;
  for (let i = 0; i < 40; i++) {
    lit = Number(await opacity('down'));
    if (lit > 0) break;
    await press('ArrowDown', 150);
  }
  ok(lit > 0, 'the mark lights at the end of a column, and is actually painted', String(lit));
  ok(lit > 0.22, 'a little louder than on the projection, because the mirror is scaled down',
    String(lit));

  await press('b', 450);
  ok(Number(await opacity('down')) > 0,
    'blanking the projection leaves the cockpit mark alone', await opacity('down'));
  await press('b', 450);

  await press('o', 550);
  ok(Number(await opacity('down')) === 0, 'the board still hides it', await opacity('down'));
  await press('Escape', 550);
}
