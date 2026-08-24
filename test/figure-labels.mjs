/*
 * Where a label sits inside the thing that holds it.
 *
 * `left` means "as far left as this element allows", and what *allows* means
 * differs by kind: a shape's inner edge, and a free text's own extent, because
 * sizeOf gives a free text the bare glyph run with no padding at all. Insetting
 * both by the same number pushed every aligned free text 13px off its own box,
 * and on a `.paper` text – whose ground is drawn outwards from that box –
 * `left` came out flush against the right edge of its own ground.
 *
 * Two figures' worth of labels are measured against their own shapes, so the
 * assertion is the property rather than a coordinate: the same distance on
 * every element that claims the same side.
 */
export const name = 'figure labels';
export const lecture = 'diagrams';
export const view = 'audience';

export async function run({ page, errors, report, walkTo }) {
  const { ok, note } = report;

  await walkTo('justify');
  await page.waitForTimeout(600);

  const rows = await page.evaluate(() => {
    const out = [];
    const svg = document.querySelector('#justify svg.psi-diagram');
    for (const g of svg.querySelectorAll('g.dg-el')) {
      const t = g.querySelector('text');
      if (!t) continue;
      const shape = g.querySelector('path, rect, circle');
      const tb = t.getBoundingClientRect();
      const sb = shape ? shape.getBoundingClientRect() : null;
      out.push({
        id: g.id.replace(/^dg\d+-/, ''),
        kind: g.getAttribute('class').includes('dg-text') ? 'text' : 'box',
        left: sb ? +(tb.left - sb.left).toFixed(1) : null,
        right: sb ? +(sb.right - tb.right).toFixed(1) : null,
      });
    }
    return out;
  });

  const boxes = rows.filter(r => r.kind === 'box' && r.left !== null);
  ok(boxes.length >= 9, 'the nine boxes are measured', String(boxes.length));

  const leftBoxes = boxes.filter(r => /l$/.test(r.id));
  const rightBoxes = boxes.filter(r => /r$/.test(r.id));
  const same = (xs) => Math.max(...xs) - Math.min(...xs) < 1.5;
  note('left-aligned boxes, gap to their border: ' + leftBoxes.map(r => r.id + '=' + r.left).join(' '));
  ok(leftBoxes.length === 3 && same(leftBoxes.map(r => r.left)),
    'every left-aligned box label sits the same distance from its border',
    JSON.stringify(leftBoxes));
  ok(rightBoxes.length === 3 && same(rightBoxes.map(r => r.right)),
    'and every right-aligned one mirrors it', JSON.stringify(rightBoxes));
  ok(leftBoxes[0].left > 4, 'that distance is the padding, not zero', String(leftBoxes[0].left));

  // A free text has no padding, so its aligned label sits on its own extent.
  // This is the half that broke: insetting it by the shape padding pushed it
  // off its own box, invisibly, on every aligned label already written.
  const freeText = rows.filter(r => r.kind === 'text' && r.id.startsWith('f'));
  note('free texts: ' + JSON.stringify(freeText));
  ok(freeText.length === 2, 'the two free texts are measured', String(freeText.length));
  const fl = freeText.find(f => f.id === 'fl');
  const fr = freeText.find(f => f.id === 'fr');
  // Against the ground, which a `.paper` text draws *outwards* from its box.
  // The direction is the assertion, not a coordinate: a left-aligned label has
  // to be nearer its left edge than its right. Inset by a padding the text
  // does not have, `.left` came out nearer the right – the alignment inverted
  // rather than shifted, which is why this is worth a spec of its own.
  ok(fl && fl.left < fl.right, 'a left-aligned free text is nearer its left edge',
    JSON.stringify(fl));
  ok(fr && fr.right < fr.left, 'and a right-aligned one is nearer its right',
    JSON.stringify(fr));
  ok(fl && fr && Math.abs(fl.left - fr.right) < 1.5,
    'and the two mirror each other exactly', JSON.stringify([fl, fr]));

  // ── and where the word cannot act, it is refused ──
  //
  // Three kinds place their label by their own statement: a container's
  // caption on its own top border, a brace's beside the spine, an edge's at
  // the middle of the line. Written there, an alignment word used to resolve,
  // emit its CSS and move nothing – measured on the emitted SVG, `.left` moved
  // a node label and an edge label and no other, `.top` moved a node label
  // alone. A silent no-op is the failure this grammar keeps closing, so the
  // five combinations that cannot act are errors now.
  //
  // Compiled through the page's own compiler rather than against a lecture,
  // because a lecture cannot hold a line that does not build.
  const verdicts = await page.evaluate(() => {
    const compile = (line) => {
      const c = window.PSI_DG.createDiagramCompiler({
        resolveImage: () => null, imageAspect: () => 1, warn: () => {},
        escapeHtml: (s) => String(s), assetMarkup: () => '',
      });
      const src = ['box a "x" at 0,0', 'box b "y" below a gap 0.4', line].join('\n');
      return c.parseDiagramSource(src, '').errors.length > 0;
    };
    return {
      containerAcross: compile('container k "cap" over a,b {.left}'),
      containerDown: compile('container k "cap" over a,b {.top}'),
      braceAcross: compile('brace r "lab" over a,b right {.right}'),
      braceDown: compile('brace r "lab" over a,b right {.bottom}'),
      edgeDown: compile('edge a -- b "e" {.top}'),
      edgeAcross: compile('edge a -- b "e" {.left}'),
      nodeAcross: compile('box c "z" right of a gap 0.5 {.left}'),
      nodeDown: compile('box c "z" right of a gap 0.5 {.bottom}'),
    };
  });
  note('refused: ' + Object.entries(verdicts).filter(([, v]) => v).map(([k]) => k).join(' '));
  ok(verdicts.containerAcross && verdicts.containerDown
     && verdicts.braceAcross && verdicts.braceDown && verdicts.edgeDown,
    'the five combinations that could not act are refused', JSON.stringify(verdicts));
  ok(!verdicts.edgeAcross && !verdicts.nodeAcross && !verdicts.nodeDown,
    'and the three that do act are still allowed', JSON.stringify(verdicts));

  // ── the review's parser holes, closed and pinned ──
  //
  // Each of these was a silent failure or an order-sensitive refusal: a
  // half-empty coordinate parsed as 0, an id that shadows Object.prototype
  // broke the runtime's frame tables at step time, `point` written after a
  // `between` was consumed as a member name, and the span table took an
  // element named `w` for the width keyword and let a panel edit splice
  // over the wrong token.
  const holes = await page.evaluate(() => {
    const mk = () => window.PSI_DG.createDiagramCompiler({
      resolveImage: () => null, imageAspect: () => 1, warn: () => {},
      escapeHtml: (s) => String(s), assetMarkup: () => '',
    });
    const errs = (src) => mk().parseDiagramSource(src, '').errors.length;
    const spanProbe = () => {
      const src = 'box w "West" at 0,0\nbox e "East" right of w gap 1';
      const { model } = mk().parseDiagramSource(src, '');
      const t = window.PSI_DG.createSpanTable(model, src);
      const misW = t.spanOf('e', 'w');            // must not hit the reference
      const own = t.spanOf('w', 'w');             // must not hit the element's own name
      return !(misW && misW.present) && !(own && own.present);
    };
    return {
      halfCoord: errs('box a "x" at 3,') > 0,
      hexLiteral: errs('box a "x" at 0x10,1') > 0,
      reservedId: errs('box constructor "x" at 0,0') > 0,
      betweenPoint: errs('box a "x" at 0,0\nbox b "y" at 2,0\nbox c "go" between a,b point right {.chevron}') === 0,
      spanGuard: spanProbe(),
    };
  });
  ok(holes.halfCoord && holes.hexLiteral, 'a half-empty or hex coordinate is an error, not a silent 0', JSON.stringify(holes));
  ok(holes.reservedId, 'an id that shadows Object.prototype is refused', JSON.stringify(holes));
  ok(holes.betweenPoint, 'the newer options may follow a between placement', JSON.stringify(holes));
  ok(holes.spanGuard, 'spanOf never mistakes a name or reference for an option keyword', JSON.stringify(holes));

  ok(errors.length === 0, 'no page errors', errors.join(' | '));
}
