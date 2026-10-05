/*
 * The slide's canvas: the three numbers behind it, held against the files
 * that actually decide them.
 *
 * `figureCanvas` in build.js reserves a fixed box for every `::: draw` in a
 * chunk body: the chunk's column wide, FIG_CANVAS_H_LABELS label-heights
 * tall (FIG_CANVAS_H_LABELS_PICTURE on a picture slide, ..._STACK on a
 * stacked divider, ..._BLEED on a `.bleed` chunk, whose column is the frame;
 * each under its own height cap in FIG_CAP). Three of its inputs are measurements of a stylesheet rather than
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

  // ── each tier's canvas height stays under that tier's height cap ──
  // --dg-box-w caps a figure at --slide-h * --fig-cap * --dg-ar, so a canvas
  // taller than its tier's share of the slide is height-capped and comes out
  // narrower than its own column - which is the uniformity it exists to
  // produce, lost. Four tiers, one table (FIG_CAP), four label counts - three
  // of them a whole number picked under a measured bound, and the fourth, a
  // `.bleed` chunk's, derived: the reference frame's height over the ordinary
  // em, written in build.js as that division. So this reads either form, and
  // holds the derived one to being exactly the frame and nothing typed.
  const rem = /const FIG_REF_REM_PX = ([\d.]+);/.exec(src);
  const capSrc = /const FIG_CAP = \{([^}]*)\}/.exec(src);
  ok(!!capSrc && !!rem, 'FIG_CAP and the reference rem are findable');
  const caps = new Map();
  if (capSrc) {
    for (const part of capSrc[1].split(',')) {
      const p = /([a-z]+)\s*:\s*([\d.]+)/.exec(part);
      if (p) caps.set(p[1], Number(p[2]));
    }
  }
  const tiers = [
    ['chunk', 'FIG_CANVAS_H_LABELS'],
    ['picture', 'FIG_CANVAS_H_LABELS_PICTURE'],
    ['stack', 'FIG_CANVAS_H_LABELS_STACK'],
    ['bleed', 'FIG_CANVAS_H_LABELS_BLEED'],
  ];
  const refH = /const FIG_REF_SLIDE_H_PX = ([\d.]+);/.exec(src);
  const refW = /const FIG_REF_SLIDE_W_PX = ([\d.]+);/.exec(src);
  ok(!!refH && Number(refH[1]) === 900 && !!refW && Number(refW[1]) === 1600,
     'the reference viewport is 1600x900', `${refW && refW[1]} x ${refH && refH[1]}`);
  const bodyPx = /const FIG_REF_BODY_PX = FIG_REF_REM_PX \* FIG_REF_ZOOM;/.test(src);
  ok(bodyPx, 'FIG_REF_BODY_PX is the rem times the zoom');
  const labelsOf = (constName) => {
    const typed = new RegExp(`const ${constName} = ([\\d.]+);`).exec(src);
    if (typed) return Number(typed[1]);
    const derived = new RegExp(`const ${constName} = FIG_REF_SLIDE_H_PX / FIG_REF_BODY_PX;`).test(src);
    return derived && refH && rem && refZoom && bodyPx
      ? Number(refH[1]) / (Number(rem[1]) * Number(refZoom[1])) : null;
  };
  ok(caps.size === tiers.length, 'FIG_CAP names exactly the four tiers',
     [...caps.entries()].map(([k, v]) => `${k}=${v}`).join(', '));
  for (const [tier, constName] of tiers) {
    const hLab = labelsOf(constName);
    const cap = caps.get(tier);
    ok(hLab > 0 && cap > 0, `the ${tier} tier has a label count and a cap`);
    if (!(hLab > 0 && cap > 0 && rem && refZoom)) continue;
    const px = hLab * Number(rem[1]) * Number(refZoom[1]);
    note(`the ${tier} canvas reserves ${px.toFixed(0)} px of a 900 px slide (${(px / 9).toFixed(0)}%)`);
    // 1e-6 px of slack: the bleed canvas IS its cap, reached by a division
    // and a multiplication that do not cancel exactly in binary.
    ok(px <= 900 * cap + 1e-6,
       `the ${tier} canvas is under the ${Math.round(cap * 100)}% its figure may be tall, or the column stops being the box`,
       `${px.toFixed(0)} px against ${(900 * cap).toFixed(0)}`);
  }
  // The bleed tier is the frame on both axes, and that is the whole of its
  // definition: the label count is derived (above, not typed), the cap is 1,
  // and the column is the reference width. A typed 28 or a cap of 0.99 would
  // each leave a strip of the frame outside the canvas.
  ok(!/const FIG_CANVAS_H_LABELS_BLEED = [\d.]+;/.test(src) && labelsOf('FIG_CANVAS_H_LABELS_BLEED') > 28,
     'the bleed label count is derived from the frame, not typed',
     String(labelsOf('FIG_CANVAS_H_LABELS_BLEED')));
  ok(caps.get('bleed') === 1, 'the bleed cap is the whole frame', String(caps.get('bleed')));
  ok(/const FIG_COLUMN_PX = \{[^}]*\bbleed: FIG_REF_SLIDE_W_PX\b[^}]*\}/.test(src),
     'and the bleed column is the reference width');
  // ...and the stylesheet says the same four numbers. The base cap is the
  // fallback of every `var(--fig-cap, N)`; the other three are rules of their own.
  const fallbacks = [...src.matchAll(/var\(--fig-cap, ([\d.]+)\)/g)].map(m => Number(m[1]));
  ok(fallbacks.length >= 2 && fallbacks.filter(n => n === caps.get('chunk')).length >= 2,
     'the max-height rule and --dg-box-w both fall back to the chunk cap', fallbacks.join(', '));
  const picCss = /\.chunk\[data-canvas-tier=picture\] \{ --fig-cap: ([\d.]+); \}/.exec(src);
  ok(!!picCss && Number(picCss[1]) === caps.get('picture'),
     'the picture slide rule sets the picture cap', String(picCss && picCss[1]));
  const bleedCss = /\.chunk\[data-canvas-tier=bleed\] \{ --fig-cap: ([\d.]+); \}/.exec(src);
  ok(!!bleedCss && Number(bleedCss[1]) === caps.get('bleed'),
     'the bleed chunk rule sets the bleed cap', String(bleedCss && bleedCss[1]));
  // A bleed chunk's box has to be the frame for that cap to mean anything:
  // no padding, a column as wide as the slide.
  ok(/\.chunk\[data-width=bleed\] \{ padding: 0; --content-w: var\(--slide-w\); min-height: var\(--slide-h\); \}/.test(src),
     'and a bleed chunk pads nothing and takes the slide as its column');
  const stackCss = /\.chunk-section\[data-section-layout=stack\] \{ --fig-cap: ([\d.]+); \}/.exec(src);
  ok(!!stackCss && Number(stackCss[1]) === caps.get('stack'),
     'the stacked divider rule sets the stack cap', String(stackCss && stackCss[1]));
  // The picture cap is also bounded from above, by auto-fit: FULL_FIT_FILL
  // of the frame less the chunk's padding (2 x 44 px) and the figure's own
  // margins (2 x 20 px) is what the svg may take before the type steps down.
  const fill = /const FULL_FIT_FILL = ([\d.]+);/.exec(src);
  ok(!!fill, 'FULL_FIT_FILL is findable');
  if (fill && caps.get('picture')) {
    const room = 900 * Number(fill[1]) - 88 - 40;
    ok(900 * caps.get('picture') <= room,
       'and the picture cap is under what auto-fit leaves a bare figure',
       `${(900 * caps.get('picture')).toFixed(0)} px against ${room.toFixed(0)}`);
  }
  // The bleed cap is bounded by auto-fit as well, and by a different number:
  // a canvas one frame tall can never be under 0.94 of the frame, so
  // fitZoomToChunk gives that tier the whole viewport (fitAvail) and the cap
  // is held against fill 1.0. Without the branch every bleed slide is stepped
  // down a notch, which is the label size the canvas promises.
  const bleedFit = /el\.dataset\.canvasTier === 'bleed'\s*\?\s*viewport\.clientHeight \+ 1\s*:\s*viewport\.clientHeight \* FULL_FIT_FILL/.test(src);
  ok(bleedFit, 'auto-fit gives a bleed chunk the whole frame instead of FULL_FIT_FILL of it');
  ok(!/viewport\.clientHeight \* FULL_FIT_FILL/.test(src.replace(/function fitAvail[\s\S]*?\n}\n/, '')),
     'and nothing reads FULL_FIT_FILL off the viewport beside fitAvail');
  if (caps.get('bleed')) {
    ok(900 * caps.get('bleed') <= 900 * 1.0,
       'so the bleed cap is under what auto-fit leaves it',
       `${(900 * caps.get('bleed')).toFixed(0)} px against 900`);
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
