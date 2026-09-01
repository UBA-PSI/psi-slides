/*
 * What a ::: marginalia does to the frame.
 *
 * A marginalia is absolutely positioned out past the text column, so it
 * lands in the chunk's scrollWidth like anything else that overflows - and
 * the width probe that decides the zoom read that as "this slide is cut off"
 * and walked the type down to its 0.6 floor. The tutorial's own marginalia
 * chunk came out at 0.6 with the slide before it at 1.35: the words the room
 * was there to read were less than half the size of every other slide's,
 * because of an aside the camera was never framing anyway. It survived
 * because it looks deliberate. A small slide is a design decision until you
 * put it next to its neighbour.
 *
 * So the assertions are about the frame and never about a coordinate, and
 * the reference is another chunk of the same deck rather than a number:
 *
 *  - at rest the slide is framed and sized exactly as one with no aside, and
 *    the aside runs off the right edge, which is the whole affordance;
 *  - a click slides the frame right until all of the aside is on it, without
 *    changing the type size or the vertical framing;
 *  - Esc and a click on the slide both give the original frame back, to the
 *    pixel - the camera solves for a state rather than accumulating an
 *    offset, and an offset is what does not come back.
 */
export const name = 'marginalia · frame';
export const lecture = 'tutorial';
export const view = 'audience';

// The chunk that carries an aside, and a chunk that carries nothing the
// width probe could legitimately shrink. Both found rather than named: which
// chunks those are belongs to the lecture, and its ids have been renumbered
// before. The second list is NOWRAP_SEL plus everything else that can be
// wider than the text column, so the reference chunk is one the fit has no
// reason to touch - which makes its zoom the lecturer's chosen zoom.
const findChunks = (page) => page.evaluate(() => {
  const all = [...document.querySelectorAll('.chunk')].filter(c => c.dataset.chunkId);
  const aside = all.find(c => c.querySelector('.marginalia'));
  const plain = all.find(c => !c.querySelector(
    '.marginalia, pre, table, .katex-display, figure, img, svg, .cols, .side'));
  return {
    aside: aside ? aside.dataset.chunkId : null,
    plain: plain ? plain.dataset.chunkId : null,
  };
});

const geom = (page) => page.evaluate(() => {
  const c = document.querySelector('.chunk.active');
  const vp = document.getElementById('stage-viewport').getBoundingClientRect();
  // Relative to the frame, because that is the question: the speaker window
  // scales its whole stage, so a raw client rect is in a different space.
  const R = (e) => {
    if (!e) return null;
    const b = e.getBoundingClientRect();
    return {
      l: b.left - vp.left, r: b.right - vp.left,
      t: b.top - vp.top, b: b.bottom - vp.top,
      w: b.width, h: b.height,
    };
  };
  return {
    id: c.dataset.chunkId,
    vw: vp.width, vh: vp.height,
    zoom: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--zoom')),
    panned: document.body.classList.contains('aside-panned'),
    chunk: R(c), content: R(c.querySelector('.chunk-content')),
    marg: R(c.querySelector('.marginalia')),
  };
});

const same = (a, b, slack = 1) => Math.abs(a - b) <= slack;

export async function run({ page, report, press, walkTo, restart }) {
  const { ok, note } = report;

  const ids = await findChunks(page);
  ok(!!ids.aside, 'the tutorial still has a chunk with a ::: marginalia', String(ids.aside));
  ok(!!ids.plain, 'and one with nothing on it the fit could shrink, to compare against',
    String(ids.plain));
  if (!ids.aside || !ids.plain) return;

  // ── the reference: a slide with no aside ──────────────────────────
  await restart();
  await walkTo(ids.plain);
  await page.waitForTimeout(500);
  const plain = await geom(page);

  // ── at rest: framed as if the aside were not there ────────────────
  await restart();
  await walkTo(ids.aside);
  await page.waitForTimeout(500);
  const rest = await geom(page);

  ok(!!rest.marg, 'the aside is in the DOM with a box of its own');
  if (!rest.marg) return;

  ok(same(rest.zoom, plain.zoom, 0.001),
    'a marginalia costs the slide no type size - it is set at the same zoom as a slide without one',
    `${rest.zoom} vs ${plain.zoom}`);
  ok(same(rest.chunk.l, plain.chunk.l) && same(rest.chunk.r, plain.chunk.r),
    'and no framing: the slide sits on the same centre line as one without an aside',
    `${Math.round(rest.chunk.l)}..${Math.round(rest.chunk.r)}`
    + ` vs ${Math.round(plain.chunk.l)}..${Math.round(plain.chunk.r)}`);
  ok(same(rest.chunk.l, 0) && same(rest.chunk.r, rest.vw),
    'which is the frame itself, so the words are centred in it rather than pushed off one side');

  // The hint. Some of the aside is on the slide and some of it is not: the
  // frame cutting it off is what says there is more of it, and no ornament
  // is asked to say so instead.
  ok(rest.marg.l > rest.content.r,
    'the aside is out past the text column, where a margin note belongs');
  ok(rest.marg.r > rest.vw,
    'and runs off the right edge of the frame rather than being framed with the slide',
    `aside right ${Math.round(rest.marg.r)} of ${Math.round(rest.vw)}`);
  ok(rest.marg.l < rest.vw,
    'while enough of it is on screen to be seen and clicked',
    `${Math.round(rest.vw - rest.marg.l)}px of ${Math.round(rest.marg.w)}px visible`);
  note(`at rest ${Math.round(100 * (rest.marg.r - rest.vw) / rest.marg.w)}% of the aside is off the frame`);

  // ── the click: the whole aside, and nothing else moved ────────────
  await page.click(`#${ids.aside} .marginalia`, { position: { x: 8, y: 8 } });
  await page.waitForTimeout(600);
  const panned = await geom(page);

  ok(panned.panned, 'the click put the view into its panned state');
  ok(panned.marg.l >= -1 && panned.marg.r <= panned.vw + 1,
    'and the whole aside is inside the frame',
    `aside ${Math.round(panned.marg.l)}..${Math.round(panned.marg.r)} of ${Math.round(panned.vw)}`);
  ok(panned.chunk.l < rest.chunk.l,
    'because the camera moved right, not because the aside moved');
  ok(same(panned.zoom, rest.zoom, 0.001),
    'the type size is untouched - this is a pan, not a fit',
    `${panned.zoom} vs ${rest.zoom}`);
  ok(same(panned.chunk.t, rest.chunk.t) && same(panned.chunk.b, rest.chunk.b),
    'and so is the vertical framing: the move is sideways only');
  ok(panned.content.r > 0 && panned.content.l < panned.vw,
    'the slide the aside belongs to is still on screen - centring the aside took it off',
    `content ${Math.round(panned.content.l)}..${Math.round(panned.content.r)}`);

  // ── Esc: the original frame back, to the pixel ────────────────────
  await press('Escape', 600);
  let back = await geom(page);
  ok(!back.panned, 'Esc left the panned state');
  ok(same(back.chunk.l, rest.chunk.l) && same(back.marg.r, rest.marg.r),
    'and gave the resting frame back exactly',
    `${Math.round(back.chunk.l)} vs ${Math.round(rest.chunk.l)}`);

  // ── a click on the slide does the same ────────────────────────────
  await page.click(`#${ids.aside} .marginalia`, { position: { x: 8, y: 8 } });
  await page.waitForTimeout(600);
  ok((await geom(page)).panned, 'the aside can be brought in again after Esc');
  await page.click(`#${ids.aside} .chunk-content`, { position: { x: 6, y: 6 } });
  await page.waitForTimeout(600);
  back = await geom(page);
  ok(!back.panned, 'a click on the slide itself pans back');
  ok(same(back.chunk.l, rest.chunk.l),
    'to the same frame Esc returns to - one state, two ways out',
    `${Math.round(back.chunk.l)} vs ${Math.round(rest.chunk.l)}`);

  // ── and leaving the slide does not carry the pan with it ──────────
  await page.click(`#${ids.aside} .marginalia`, { position: { x: 8, y: 8 } });
  await page.waitForTimeout(600);
  await press('ArrowDown', 600);
  await press('ArrowUp', 600);
  const revisit = await geom(page);
  ok(!revisit.panned && same(revisit.chunk.l, rest.chunk.l),
    'coming back to the slide finds it framed, not still panned',
    `${Math.round(revisit.chunk.l)} vs ${Math.round(rest.chunk.l)}`);
}
