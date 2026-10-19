// runtime/block-fit.js – style.code-fit and style.spacing on the live views.
//
// Spliced after runtime/audience.js (and, in the cockpit, after
// runtime/speaker.js) into the same script element, so it shares their scope,
// and only into a deck that uses either key or one of their chunk classes
// (usesBlockFit in build.js). Every other deck carries none of it and builds
// the bytes it did, which is also why it is a file of its own and not a few
// lines inside the functions it wraps.
//
// Two questions, answered on the live slide once its zoom is settled:
//
//   code-fit – how large may a top-level listing grow? In steps of 0.2 of its
//              own size, up to the ceiling the deck or the chunk names, and
//              only while the slide still passes the test the zoom fit holds
//              it to: its height inside the frame (fitAvail, flowHeightProbe)
//              and no line wider than its box (nowrapProbe). The same three
//              functions, not a second idea of what fits.
//   spacing  – where does the free height go? Under `even`, a third above the
//              heading, a third between it and the body, a third under the
//              body: the camera centres the content box, so a gap of a third
//              of the free height under the heading is all it takes.
//
// Order matters and is fixed: the zoom first, exactly as it would be without
// this file, then the listing, then the spacing out of whatever is left. So
// the prose on a slide is the size it would have been, and the code-fit of a
// slide never moves its own zoom - or a neighbour's.
//
// Both answers are measured on the chunk's final box. A segment past the
// current beat keeps its box (visibility: hidden), so the box is the same on
// every beat and a listing does not change size when the next one arrives.
//
// HOW IT IS HOOKED IN. The three functions every zoom decision and every
// camera move go through - fitZoomToChunk, clampZoomToWidth, focusCamera -
// are wrapped by reassignment: they are function declarations in this
// script's scope, and every caller reaches them by name. The two fits clear
// what this file wrote before they measure (a zoom solved against a grown
// listing would be a different zoom) and solve again after; the camera solves
// only when something the answer depends on has changed since the last solve,
// because it also runs on every pointermove of a stage drag.

const BLOCK_FIT_STEP = 0.2;
// The listings that grow: the ones that break out of the text column, named
// by the same selectors as the breakout rule in runtime/audience.css. A
// listing in a pane or a column keeps the size of its container.
const BLOCK_FIT_PRE = '.chunk-body .reveal-segment > pre, .chunk-body .reveal-segment > div > pre';

function blockFitWants(el) {
  const own = el.dataset, deck = document.body.dataset;
  const c = parseFloat(own.codeFit || deck.codeFit || '100') / 100;
  return { ceiling: c > 1 ? c : 1, even: (own.spacing || deck.spacing) === 'even' };
}
// The ladder, largest first: 1.2, 1.4, ... below the ceiling, and the ceiling
// itself. Fixed steps rather than a solved size, so two slides with listings
// of about the same length land on the same size.
function blockFitLadder(ceiling) {
  const out = [ceiling];
  for (let s = 1 + BLOCK_FIT_STEP; s < ceiling - 1e-6; s += BLOCK_FIT_STEP) out.push(Math.round(s * 10) / 10);
  return out.sort((a, b) => b - a);
}
// A chunk whose box is not the thing the camera centres, or not a column of
// type: the cover and the closing slide (composed against the frame already),
// a divider, a chunk with a dock or a panel (framed as a whole), a .bleed
// picture, an open expansion and an annotation being typed.
function blockFitFrames(el) {
  const tag = el.dataset.tag;
  if (tag === 'title' || tag === 'closing' || el.classList.contains('chunk-section')) return false;
  if (el.hasAttribute('data-dock') || el.hasAttribute('data-has-panel')) return false;
  if (el.dataset.width === 'bleed' || el.classList.contains('expanded')) return false;
  return annotEditingId !== el.dataset.chunkId;
}
function blockFitClear(el) {
  if (!el || el.psiBlockFit === undefined) return;
  el.style.removeProperty('--code-scale');
  el.style.removeProperty('--spread-gap');
  delete el.psiBlockFit;
}
function blockFitGrow(el, ceiling) {
  const avail = fitAvail(el);
  if (!(avail > 0)) return;
  const heightOf = flowHeightProbe(el);
  const overflowsX = nowrapProbe(el);
  const fits = () => heightOf() <= avail && !overflowsX();
  // A slide that does not fit as it is has no room to give a listing.
  if (!fits()) return;
  for (const s of blockFitLadder(ceiling)) {
    el.style.setProperty('--code-scale', String(s));
    if (fits()) return;
  }
  el.style.removeProperty('--code-scale');
}
function blockFitSpread(el, vp) {
  const content = el.querySelector(':scope > .chunk-content');
  const head = content && content.querySelector(':scope > .chunk-heading');
  // No heading on the slide (.bare, headings: off) is one block, and one
  // block centred is already even.
  if (!head || !head.offsetHeight) return;
  const free = vp.height - content.offsetHeight;
  if (free < 3) return;
  el.style.setProperty('--spread-gap', (free / 3).toFixed(1) + 'px');
}
function blockFitSolve(el) {
  if (!el || overview) return;
  const want = blockFitWants(el);
  if (want.ceiling === 1 && !want.even) { blockFitClear(el); return; }
  const vp = vpLayout();
  const key = [state.zoom, vp.width, vp.height, state.font, state.theme, state.collapse,
    el.classList.contains('expanded'), annotEditingId].join('|');
  if (el.psiBlockFit === key) return;
  blockFitClear(el);
  el.psiBlockFit = key;
  if (!blockFitFrames(el)) return;
  if (want.ceiling > 1 && el.querySelector(BLOCK_FIT_PRE)) blockFitGrow(el, want.ceiling);
  if (want.even) blockFitSpread(el, vp);
}

{
  const activeEl = () => { const e = flatChunks[state.activeIdx]; return e && e.el; };
  const fit = fitZoomToChunk, clamp = clampZoomToWidth, camera = focusCamera;
  fitZoomToChunk = function (ceiling) {
    const el = activeEl();
    blockFitClear(el);
    fit(ceiling);
    blockFitSolve(el);
  };
  clampZoomToWidth = function () {
    const el = activeEl();
    blockFitClear(el);
    const limited = clamp();
    blockFitSolve(el);
    return limited;
  };
  focusCamera = function (instant) {
    blockFitSolve(activeEl());
    return camera(instant);
  };
}
