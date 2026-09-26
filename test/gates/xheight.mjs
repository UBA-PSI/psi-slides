/*
 * The measured x-heights of the bundled text faces, held across two files.
 *
 * Every text-role entry of `BUNDLED_FONTS` carries `xHeight`, the height of a
 * lowercase x as a fraction of the em. Inline code is set in the mono role
 * inside a sentence set in the serif or the sans, and those roles differ by a
 * tenth of an em, so the code is sized to bring the two x-heights level – a
 * number the layout reads rather than a constant anybody can eyeball.
 *
 * Which is exactly the shape this suite exists for: a number that was measured
 * once, in a browser, and then copied by hand into a second file. Nothing
 * about a face with no `xHeight` looks wrong – the entry parses, the deck
 * builds, and the code in a sentence is merely the wrong size, which is the
 * kind of defect a reader blames on the typeface. So the gate asserts three
 * things and reads build.js as text to do it, the way the `frontmatter` gate
 * does and for the same reason: `build.js` calls `main()` at module scope and
 * cannot be imported.
 *
 *   1. every text-role entry carries an xHeight, and it is plausible
 *   2. tools/font-playground/xheights.json and the roster agree, family for
 *      family – so a re-measurement that was written to the JSON and never
 *      copied across fails here rather than never
 *   3. the scan found faces at all, and one of each role. A text scan that
 *      silently matches nothing passes every comparison above it.
 *
 * Re-measure with `node tools/font-playground/measure-xheight.mjs` (needs a
 * Chromium); it prints the table and rewrites the JSON.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './harness.mjs';
import { readTextFaces, TEXT_ROLES } from '../../tools/font-playground/text-roster.mjs';

export const name = 'xheight: the measured x-height of every bundled text face';

// A latin text face lives between about 0.45 and 0.56 em; the window is wider
// than the roster so that it fails on a transposed digit or a percentage
// written as a fraction rather than on an unusual but real face.
const LO = 0.35, HI = 0.65;

export async function run({ report }) {
  const { ok } = report;
  const faces = readTextFaces(path.join(ROOT, 'build.js'));

  // ── the scan itself ──────────────────────────────────────────────
  ok(faces.length >= 8, `the roster scan finds the text faces (${faces.length})`, faces.length);
  for (const role of TEXT_ROLES)
    ok(faces.some(f => f.role === role), `the scan finds at least one ${role} face`);

  // ── every entry carries a plausible number ───────────────────────
  for (const f of faces) {
    if (!ok(f.xHeight != null, `${f.family} carries an xHeight`,
      'no xHeight – measure it with tools/font-playground/measure-xheight.mjs')) continue;
    ok(f.xHeight > LO && f.xHeight < HI,
      `${f.family}: xHeight ${f.xHeight.toFixed(3)} is in (${LO}, ${HI})`, f.xHeight);
    // Three decimals is what the measuring script writes and what the comment
    // beside the roster promises; a longer number is a number somebody typed.
    ok(Math.abs(f.xHeight * 1000 - Math.round(f.xHeight * 1000)) < 1e-9,
      `${f.family}: xHeight is written to three decimals`, f.xHeight);
  }

  // ── the JSON the measurement wrote ───────────────────────────────
  const jsonPath = path.join(ROOT, 'tools/font-playground/xheights.json');
  if (!ok(fs.existsSync(jsonPath), 'tools/font-playground/xheights.json exists')) return;
  const measured = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

  for (const f of faces) {
    if (!ok(f.family in measured, `${f.family} is in xheights.json`,
      're-run measure-xheight.mjs after adding a face')) continue;
    ok(Math.abs(measured[f.family] - (f.xHeight ?? -1)) < 0.0005,
      `${f.family}: roster and xheights.json agree`,
      `roster ${f.xHeight}, measured ${measured[f.family]}`);
  }
  const extra = Object.keys(measured).filter(k => !faces.some(f => f.family === k));
  ok(extra.length === 0,
    'xheights.json holds no face the roster has dropped', extra.join(', '));
}
