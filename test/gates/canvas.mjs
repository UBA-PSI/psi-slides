/*
 * The slide's canvas: the three numbers behind it, held against the files
 * that actually decide them.
 *
 * `figureCanvas` in build.js reserves a fixed box for every `::: draw` in a
 * chunk body: the chunk's column wide, FIG_CANVAS_H_LABELS label-heights
 * tall. Three of its inputs are measurements of a stylesheet rather than
 * facts about a drawing, and a stylesheet cannot be imported from here – so
 * they are mirrored by hand, and this gate is what keeps the mirror honest.
 *
 *   FIG_BODY_REM     the `--body-fs:` coefficient of each chunk type, which
 *                    is the em a figure in such a chunk stands in. Get one
 *                    wrong and that type's figures are laid out against a box
 *                    they are not in: too narrow (a drawing that never fills
 *                    its column) or capped (labels smaller than the words
 *                    beside them), silently, on that chunk type only.
 *   FIG_REF_ZOOM     the live views' own default `--zoom`. Reading 1rem
 *                    instead – which the sizing comments did for a release –
 *                    is a quarter out in the direction that hurts.
 *   DG_FRAME_RE      the canvas written in grid units, spelled in
 *                    diagram-core.mjs for the `draw-defaults` block and in
 *                    tails.mjs for the `::: draw` opener. diagram-core has no
 *                    imports, so the two cannot be one constant; they can be
 *                    held against one another here.
 *
 * Read as text, like the frontmatter gate: build.js cannot be imported.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './harness.mjs';
import { DG_FRAME_RE } from '../../diagram-core.mjs';
import { validFrame, normaliseFrame, formatDrawOpener, parseDrawOpener } from '../../tails.mjs';

export const name = 'canvas: the measured numbers behind a figure box';

export async function run({ report }) {
  const { ok, note } = report;
  const src = fs.readFileSync(path.join(ROOT, 'build.js'), 'utf8');

  // ── FIG_BODY_REM against the stylesheet it mirrors ────────────────
  // Every `--body-fs:` rule in build.js, as {selector-tag -> coefficient}.
  // The base rule is `.chunk { --body-fs: calc(1rem * …) }` and every other
  // is `.chunk[data-tag=NAME] { --body-fs: calc(Nrem * …) }`; a fourth form
  // (`--body-fs: var(--statement-size)`) carries no coefficient at all and is
  // the one this table deliberately does not answer.
  const rules = new Map();
  let noCoefficient = 0;
  const re = /\.chunk(?:\[data-tag=([a-z]+)\])?\s*\{\s*--body-fs:\s*([^;]+);/g;
  let m;
  while ((m = re.exec(src))) {
    const tag = m[1] || '';
    const calc = /calc\(\s*([\d.]+)rem/.exec(m[2]);
    if (!calc) { noCoefficient++; continue; }
    rules.set(tag, Number(calc[1]));
  }
  ok(rules.size >= 3, `the scan finds the --body-fs rules (${rules.size})`,
     [...rules.entries()].map(([k, v]) => `${k || 'base'}=${v}`).join(', '));
  ok(rules.get('') === 1, 'the base chunk body is 1rem', String(rules.get('')));
  note(`${noCoefficient} rule(s) set --body-fs from a variable rather than a coefficient`);

  const tableSrc = /const FIG_BODY_REM = \{([^}]*)\}/.exec(src);
  ok(!!tableSrc, 'FIG_BODY_REM is findable in build.js');
  const table = new Map();
  if (tableSrc) {
    for (const part of tableSrc[1].split(',')) {
      const p = /([a-z]+)\s*:\s*([\d.]+)/.exec(part);
      if (p) table.set(p[1], Number(p[2]));
    }
  }
  // The direction that matters: a chunk type whose body is NOT 1rem and
  // which the table does not name is laid out against the wrong em.
  const missing = [...rules.entries()]
    .filter(([tag, v]) => tag && v !== 1 && table.get(tag) !== v)
    .map(([tag, v]) => `${tag} is ${v}rem, table says ${table.get(tag) ?? 'nothing'}`);
  ok(!missing.length,
     'every chunk type whose body is not 1rem is in FIG_BODY_REM at the same coefficient',
     missing.join('; '));
  // …and the milder one: a coefficient in the table that no rule carries any
  // more sizes that type's canvas against an em the page does not use.
  const stale = [...table.entries()]
    .filter(([tag, v]) => rules.get(tag) !== v)
    .map(([tag, v]) => `${tag}=${v}`);
  ok(!stale.length, 'and the table names no type the stylesheet has moved on from', stale.join(', '));

  // ── the reference zoom is the runtime's own default ───────────────
  // `state.zoom` in AUDIENCE_JS is what a slide opens at, and the canvas is
  // the column measured in that em. The two are a quarter apart if this
  // drifts, which is invisible: every figure simply comes out a little small.
  const refZoom = /const FIG_REF_ZOOM = ([\d.]+);/.exec(src);
  const stateZoom = /\n  zoom: ([\d.]+),/.exec(src);
  ok(!!refZoom && !!stateZoom, 'both zooms are findable',
     `${refZoom && refZoom[1]} / ${stateZoom && stateZoom[1]}`);
  if (refZoom && stateZoom) {
    ok(refZoom[1] === stateZoom[1],
       'FIG_REF_ZOOM is the runtime default --zoom',
       `FIG_REF_ZOOM ${refZoom[1]}, state.zoom ${stateZoom[1]}`);
  }

  // ── the canvas height stays under the height cap ──────────────────
  // --dg-box-w caps a figure at --slide-h * 0.62 * --dg-ar, so a canvas
  // taller than 62% of the slide is height-capped and comes out narrower
  // than its own column - which is the uniformity it exists to produce, lost.
  const hLab = /const FIG_CANVAS_H_LABELS = ([\d.]+);/.exec(src);
  const rem = /const FIG_REF_REM_PX = ([\d.]+);/.exec(src);
  ok(!!hLab && !!rem, 'the canvas height and the reference rem are findable');
  if (hLab && rem && refZoom) {
    const px = Number(hLab[1]) * Number(rem[1]) * Number(refZoom[1]);
    note(`the canvas reserves ${px.toFixed(0)} px of a 900 px slide (${(px / 9).toFixed(0)}%)`);
    ok(px <= 900 * 0.62,
       'and it is under the 62% a figure may be tall, or the column stops being the box',
       `${px.toFixed(0)} px against ${(900 * 0.62).toFixed(0)}`);
  }

  // ── one spelling of a frame, in two zero-dependency files ─────────
  const cases = [
    ['6x4', true], ['6.5x3.5', true], ['0.5x0.5', true],
    ['6X4', false], ['6x', false], ['x4', false], ['6 x 4', false], ['', false],
  ];
  for (const [text, want] of cases) {
    ok(DG_FRAME_RE.test(text) === want,
       `diagram-core reads "${text}" as ${want ? 'a frame' : 'not a frame'}`);
    // tails.mjs adds the bounds; inside them the two must agree exactly.
    if (want) ok(validFrame(text), `and tails.mjs accepts "${text}" too`);
    else ok(!validFrame(text), `and tails.mjs refuses "${text}" too`);
  }
  ok(validFrame('none') && !DG_FRAME_RE.test('none'),
     'and "none" is a word beside the pattern rather than part of it');
  ok(normaliseFrame('6.0x4.50') === '6x4.5' && normaliseFrame('none') === 'none',
     'a frame has one spelling', String(normaliseFrame('6.0x4.50')));

  // The opener and the formatter round-trip through the same spelling, which
  // is what the editor's write-back depends on: it copies the formatted line.
  const line = '::: draw 150x56 frame 6x4 autoplay 1200 cycle';
  const o = parseDrawOpener(line);
  ok(o && !o.problems.length && formatDrawOpener(o) === line,
     'the opener carrying a frame formats back to itself', JSON.stringify(o));

  // ── the canvas is reported in the same two units in both places ───
  // `figure-overflows-canvas` is emitted at the end of the parse and
  // `--check-fit`'s room line is measured in a browser, so the two cannot
  // share a helper – and they answer the same question about the same box:
  // how far apart the canvas and the drawing are on one axis. The figure was
  // base labels to one decimal in both, which at DG_FONT px a label hides up
  // to seven px, so "over by 0.2 across" and "room 0.2 across" were each
  // anything from 2.3 px to 3.7 px and an author tuning against either built
  // three times to find out which. Both spell the px beside the label now,
  // and this is the mirror: two functions, one sentence shape.
  const axis = [...src.matchAll(/\$\{lab\((\w+)\)\} \$\{(\w+)\} \(\$\{Math\.round\(\1\)\} px\)/g)];
  ok(axis.length === 2,
     'both canvas reports spell an axis as "<labels> <axis> (<px> px)"',
     `found ${axis.length}: ${axis.map(m => m[0]).join(' | ')}`);
  ok(/over by \$\{axes\.join\(' and '\)\}/.test(src),
     'the static complaint joins its axes with that shape');
  ok(/room \$\{axis\(dw, 'across'\)\} and \$\{axis\(dh, 'down'\)\}/.test(src),
     'and the room line is built from it too');
}
