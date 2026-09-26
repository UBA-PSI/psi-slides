// Draws the app icon and writes it as SVG. Rendered to PNG by rsvg-convert
// and to .icns by iconutil (see icon.sh beside it). The drawing is a
// document with a folded corner – the source.md – and two gears overlapping
// its lower right corner, the build that turns it into the views. The
// colours are the ones the app and the site use: the accent for the ground,
// paper for the document, ink for the gears.
//
// Run: node make-icon.mjs > icon.svg
const S = 1024;
// macOS icons keep their artwork inside a squircle that leaves about a
// tenth of the canvas clear on each side, so the icon sits level with the
// system's own in the Dock.
const PAD = 100, R = 232;

function gear(cx, cy, teeth, rOut, rIn, hole, rot = 0) {
  const pts = [];
  const step = (Math.PI * 2) / teeth;
  // Each tooth is a trapezoid: two points on the outer circle, two on the
  // inner one, with the tooth narrower at its tip.
  for (let i = 0; i < teeth; i++) {
    const a = i * step + rot;
    const tipHalf = step * 0.18, baseHalf = step * 0.30;
    pts.push([a - baseHalf, rIn], [a - tipHalf, rOut], [a + tipHalf, rOut], [a + baseHalf, rIn]);
  }
  const d = pts.map(([a, r], i) => `${i ? 'L' : 'M'}${(cx + r * Math.cos(a)).toFixed(1)} ${(cy + r * Math.sin(a)).toFixed(1)}`).join(' ') + ' Z';
  // The hole is a second subpath drawn the other way round, so the
  // even-odd rule leaves it open.
  const h = `M${cx + hole} ${cy} A${hole} ${hole} 0 1 0 ${cx - hole} ${cy} A${hole} ${hole} 0 1 0 ${cx + hole} ${cy} Z`;
  return d + ' ' + h;
}

const accent = '#8b352c', paper = '#fafaf7', ink = '#2c2e33', soft = '#b8b3ad';
// The document: portrait, a folded top-right corner, on the left half so
// the gears have the lower right to themselves.
const dx = 250, dy = 200, dw = 420, dh = 560, fold = 110;
const doc = `M${dx} ${dy} H${dx + dw - fold} L${dx + dw} ${dy + fold} V${dy + dh} H${dx} Z`;
const foldPath = `M${dx + dw - fold} ${dy} V${dy + fold} H${dx + dw} Z`;
// Text lines: one short bold line, the topic sentence, then quieter ones.
const lines = [
  [dx + 56, dy + 130, 200, 22, ink],
  [dx + 56, dy + 190, 300, 14, soft],
  [dx + 56, dy + 232, 260, 14, soft],
  [dx + 56, dy + 274, 300, 14, soft],
  [dx + 56, dy + 316, 180, 14, soft],
].map(([x, y, w, h, c]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="${c}"/>`).join('\n  ');

const g1 = gear(690, 690, 10, 168, 128, 44, 0.16);
const g2 = gear(520, 812, 8, 108, 80, 28, 0.42);

process.stdout.write(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}">
  <rect x="${PAD}" y="${PAD}" width="${S - 2 * PAD}" height="${S - 2 * PAD}" rx="${R}" fill="${accent}"/>
  <path d="${doc}" fill="${paper}"/>
  <path d="${foldPath}" fill="${soft}" opacity="0.9"/>
  ${lines}
  <!-- a paper ring keeps the large gear legible where it crosses the document -->
  <path d="${g1}" fill="${paper}" fill-rule="evenodd" stroke="${paper}" stroke-width="40" stroke-linejoin="round"/>
  <path d="${g1}" fill="${ink}" fill-rule="evenodd"/>
  <path d="${g2}" fill="${paper}" fill-rule="evenodd" stroke="${paper}" stroke-width="34" stroke-linejoin="round"/>
  <path d="${g2}" fill="${ink}" fill-rule="evenodd"/>
</svg>
`);
