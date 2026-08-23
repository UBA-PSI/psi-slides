/*
 * Where a label sits inside the thing that holds it.
 *
 * `left` means "as far left as this element allows", and what *allows* means
 * differs by kind: a shape's inner edge, and a free text's own extent, because
 * sizeOf gives a free text the bare glyph run with no padding at all. Insetting
 * both by the same number pushed every aligned free text 13px off its own box,
 * and on a `.paper` text - whose ground is drawn outwards from that box -
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
  // does not have, `.left` came out nearer the right - the alignment inverted
  // rather than shifted, which is why this is worth a spec of its own.
  ok(fl && fl.left < fl.right, 'a left-aligned free text is nearer its left edge',
    JSON.stringify(fl));
  ok(fr && fr.right < fr.left, 'and a right-aligned one is nearer its right',
    JSON.stringify(fr));
  ok(fl && fr && Math.abs(fl.left - fr.right) < 1.5,
    'and the two mirror each other exactly', JSON.stringify([fl, fr]));

  ok(errors.length === 0, 'no page errors', errors.join(' | '));
}
