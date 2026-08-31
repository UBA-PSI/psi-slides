/*
 * What an open expansion does to the frame.
 *
 * The stylesheet builds an expanded chunk as one composition - the slide's
 * own column on the left, the pane on the right - and for the whole life of
 * the audience renderer focusCamera centred the *pane*, which is half of it.
 * Nothing here was ever asserted, and the two defects that follow from it are
 * exactly the kind that a screenshot forgives:
 *
 *  - On a wide window the slide's column was pushed off the left edge. The
 *    pane looked perfect. You had to notice that the heading beside it was
 *    cropped, on a slide you had opened in order to read the pane.
 *  - Under 900px the pane is taken out of the grid, and it used to be taken
 *    out with `position: fixed`. A fixed box inside a transformed ancestor is
 *    positioned against that ancestor, and getOffset walks offsetParent - of
 *    which it has none - up to the stage, so the camera answered with
 *    translate(-4320px, -40850px). The card landed where fixed positioning
 *    put it and looked right; the slide behind it was gone. Two errors that
 *    cancelled inside one rectangle and nowhere else.
 *
 * So the assertions here are about the frame and never about a coordinate.
 * Derive, do not pin: the pane's floor is the narrow width class, because
 * that is the vocabulary's own smallest column and both tracks used to come
 * out below it; the split is read back off the chunk's own padding rather
 * than written in.
 */
export const name = 'expansions · frame';
export const lecture = 'tutorial';
export const view = 'audience';

// A chunk that carries expansions, found rather than named: which one it is
// belongs to the lecture, and #expand has been renumbered before.
const findExpandable = (page) => page.evaluate(() => {
  for (const c of document.querySelectorAll('.chunk')) {
    if (c.querySelector('.exps .exp-chev') && c.dataset.chunkId) return c.dataset.chunkId;
  }
  return null;
});

const geom = (page) => page.evaluate(() => {
  const c = document.querySelector('.chunk.active');
  const cc = c.querySelector('.chunk-content');
  const pane = c.querySelector('.exp-body.on');
  const exps = c.querySelector('.exps');
  const R = (e) => { const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; };
  const cs = getComputedStyle(c);
  return {
    vw: innerWidth, vh: innerHeight,
    em: parseFloat(getComputedStyle(cc).fontSize),
    padX: parseFloat(cs.paddingLeft),
    expanded: c.classList.contains('expanded'),
    panePos: pane ? getComputedStyle(pane).position : null,
    chunk: R(c), content: R(cc), exps: R(exps), pane: pane ? R(pane) : null,
  };
});

// Every rendered line of the slide's own words, as rectangles. A collision
// with the chevron band is then a fact rather than an impression.
const textHits = (page) => page.evaluate(() => {
  const c = document.querySelector('.chunk.active');
  const band = c.querySelector('.exps').getBoundingClientRect();
  const w = document.createTreeWalker(c.querySelector('.chunk-content'), NodeFilter.SHOW_TEXT);
  let n, hits = 0;
  while ((n = w.nextNode())) {
    if (!n.nodeValue.trim()) continue;
    const r = document.createRange(); r.selectNodeContents(n);
    for (const b of r.getClientRects()) {
      if (b.width < 1) continue;
      if (b.bottom > band.top && b.top < band.bottom && b.right > band.left && b.left < band.right) hits++;
    }
  }
  return hits;
});

export async function run({ page, report, press, walkTo, restart }) {
  const { ok, note } = report;

  const id = await findExpandable(page);
  ok(!!id, 'the tutorial still has a chunk with expansions to open', String(id));
  if (!id) return;

  // ── the wide window: one composition, and all of it on screen ──
  await restart();
  await walkTo(id);
  await press('1', 500);

  let g = await geom(page);
  ok(g.expanded, 'the digit opened the pane');
  ok(!!g.pane, 'and the pane is in the DOM with a box');

  ok(g.chunk.l >= -1 && g.chunk.r <= g.vw + 1,
    'the whole chunk is inside the frame, not just the pane',
    `chunk ${Math.round(g.chunk.l)}..${Math.round(g.chunk.r)} of ${g.vw}`);
  ok(g.content.l >= 0 && g.content.r <= g.vw,
    'so the words the pane belongs to are still readable',
    `content ${Math.round(g.content.l)}..${Math.round(g.content.r)}`);
  ok(g.pane.l > g.content.r,
    'and the pane sits beside them rather than over them');

  // The pane is what the room is reading, so it keeps the vertical centring.
  const paneMid = (g.pane.t + g.pane.b) / 2;
  ok(Math.abs(paneMid - g.vh / 2) < 12,
    'the pane is still centred vertically, which is the half of that camera worth keeping',
    `mid ${Math.round(paneMid)} of ${g.vh / 2}`);

  // Both tracks used to come out at 21.0em whatever the chunk's width class
  // said - below `narrow`, the smallest column the width vocabulary offers -
  // and the cause was the margin, not the 36em cap, which never binds. Two
  // 28em tracks do not fit a 1440px window at the default zoom either, so the
  // floor is not a width class; what is testable without inventing a number
  // is that the expanded composition keeps a narrower margin than the closed
  // one, and how much of the slide that leaves the columns.
  await press('1', 400);                      // close it and read the closed margin
  const closedPadX = (await geom(page)).padX;
  await press('1', 500);
  g = await geom(page);
  ok(g.padX < closedPadX,
    'an expanded chunk keeps a narrower margin than a closed one - two panels, not one column',
    `${Math.round(g.padX)}px expanded vs ${Math.round(closedPadX)}px closed`);

  // The two tracks plus the gap fill the slide minus its margins: read back
  // off the chunk rather than restated, so trimming the margin cannot make
  // this pass by accident.
  const inner = g.chunk.w - 2 * g.padX;
  note(`content ${(g.content.w / g.em).toFixed(1)}em, pane ${(g.pane.w / g.em).toFixed(1)}em; `
     + `the columns get ${Math.round(100 * inner / g.chunk.w)}% of the slide, and used to get 72%`);
  ok(inner > g.chunk.w * 0.85,
    'and the two columns get most of the slide rather than a single column’s margins',
    `${Math.round(100 * inner / g.chunk.w)}%`);
  ok(g.content.w + g.pane.w <= inner + 1 && g.content.w + g.pane.w > inner * 0.85,
    'sharing it between them, with one gap',
    `${Math.round(g.content.w + g.pane.w)} of ${Math.round(inner)}`);

  // The pane paints at z-index 5 and the chevrons at 2, so a pane that
  // reaches the floor of the slide swallows the buttons that opened it.
  ok(g.pane.b <= g.exps.t + 1,
    'the pane clears the chevron band instead of painting over it',
    `pane bottom ${Math.round(g.pane.b)}, band top ${Math.round(g.exps.t)}`);

  // ── the chevron band against the words, closed, at the zoom it broke at ──
  await restart();
  await walkTo(id);
  ok(await textHits(page) === 0, 'no line of prose sits under the chevrons at the default zoom');
  for (let i = 0; i < 6; i++) await press('+', 110);   // 1.35 -> 1.95
  const zoom = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--zoom').trim());
  ok(await textHits(page) === 0,
    'nor at the zoom where it did - the reserve is written in the chevron’s own terms',
    'zoom ' + zoom);
  await press('0', 300);

  // ── the narrow window: the pane leaves the grid, the deck stays put ──
  await page.setViewportSize({ width: 800, height: 1000 });
  await page.waitForTimeout(300);
  await restart();
  await walkTo(id);
  await press('1', 600);

  g = await geom(page);
  ok(g.panePos !== 'fixed',
    'the stacked pane is in flow: fixed inside the transformed stage is not fixed to the window',
    String(g.panePos));
  ok(g.pane.t < g.vh && g.pane.b > 0 && g.pane.l < g.vw && g.pane.r > 0,
    'the pane is on screen');
  ok(g.chunk.t < g.vh && g.chunk.b > 0,
    'and so is the slide it came out of - it used to be 37,000px away',
    `chunk ${Math.round(g.chunk.t)}..${Math.round(g.chunk.b)} of ${g.vh}`);
  ok(g.content.b <= g.pane.t + 1,
    'stacked means stacked: the words sit above the pane, not behind it',
    `content bottom ${Math.round(g.content.b)}, pane top ${Math.round(g.pane.t)}`);
  ok(g.pane.b <= g.exps.t + 1,
    'and the chevrons are clear here too',
    `pane bottom ${Math.round(g.pane.b)}, band top ${Math.round(g.exps.t)}`);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(200);
}
