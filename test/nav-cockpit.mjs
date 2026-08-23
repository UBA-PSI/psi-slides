/*
 * The navigation marks in the speaker cockpit, and the one rule that has to
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

export async function run({ page, errors, report, at, press }) {
  const { ok } = report;

  const opacity = (dir) => page.evaluate((d) =>
    getComputedStyle(document.querySelector('#nav-hints [data-hint="' + d + '"]')).opacity, dir);

  ok(await page.locator('#nav-hints').count() > 0, 'the cockpit carries the marks too');
  const start = await at();
  ok(start.hints[1] === 'R', 'the first slide offers a right mark', start.hints);
  const lit = Number(await opacity('right'));
  ok(lit > 0, 'and it is actually painted', String(lit));
  ok(lit > 0.22, 'a little louder than on the projection, because the mirror is scaled down',
    String(lit));

  await press('b', 450);
  ok(Number(await opacity('right')) > 0,
    'blanking the projection leaves the cockpit marks alone', await opacity('right'));
  await press('b', 450);

  await press('o', 550);
  ok(Number(await opacity('right')) === 0, 'the board still hides them', await opacity('right'));
  await press('Escape', 550);

  ok(errors.length === 0, 'no page errors', errors.join(' | '));
}
