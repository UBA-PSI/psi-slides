// Measure the x-height of every text-role face in `BUNDLED_FONTS`, as a
// fraction of the em, and write xheights.json.
//
// Why this exists: inline code in prose is set in the mono role while the
// prose around it is set in the serif or the sans, and the two faces do not
// agree about how tall a lowercase letter is. Set at the same font-size, the
// code then reads either as a whisper inside the sentence or as a shout. The
// fix is to size the mono so its x-height matches the prose face's, which
// needs a number per face – and a guessed one is wrong per face and silently
// so, exactly as a guessed `sizeAdjust` was for the display roster. So it is
// measured in the browser that will draw it.
//
// The metric is the CSS `ex` unit, which Chrome resolves from the face's own
// OS/2 sxHeight: an element of `width: 1ex` at a large font-size, divided by
// that size. Weight 400, because that is what body text and an inline code
// span are set at; the weight axis moves an x-height by well under a
// thousandth of an em in these faces, but measuring at the weight that ships
// costs nothing.
//
// Noto Sans Mono Condensed is a *named instance* – the roster pins
// `font-variation-settings: 'wdth' 62.5` as an @font-face descriptor – so the
// face is declared here exactly as `fontStyleTag` declares it. The width axis
// does not move the x-height, but what gets measured has to be what ships.
//
//   node measure-xheight.mjs            # rewrite xheights.json
//   node measure-xheight.mjs --print    # table only, write nothing
//
// Then copy each number into the matching entry of BUNDLED_FONTS in build.js
// as `xHeight: 0.NNN`, and run `node test/gates/run.mjs xheight`, which is
// what holds the two in step.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { readTextFaces } from './text-roster.mjs';
// The one browser resolver in the repository – $PSI_CHROME, then the newest
// build in the Playwright cache, then the system Chrome. It has no
// dependencies of its own, so importing it here costs nothing.
import { findChrome } from '../../docs/site/shoot-lib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');

const faces = readTextFaces(path.join(repo, 'build.js'));

// The roster's own packages, out of the engine's node_modules – the same
// files `bundledFaces()` reads, so this measures the bytes a deck carries
// rather than a CDN's cut of the same family.
const missing = [];
for (const f of faces) {
  f.path = path.join(repo, 'node_modules', f.pkg, 'files', f.normal);
  if (!fs.existsSync(f.path)) missing.push(`${f.family}: ${f.path}`);
}
if (missing.length) {
  console.error('Font files missing. Run `npm install` at the repository root.\n  '
    + missing.join('\n  '));
  process.exit(1);
}

const SIZE = 1000;   // px; large enough that a sub-pixel rounding is noise
const WEIGHT = 400;

const css = faces.map((f, i) =>
  `@font-face{font-family:'xh${i}';font-style:normal;font-weight:${f.variable ? '100 900' : 400};`
  + (f.variations ? `font-variation-settings:${f.variations};` : '')
  + `font-display:block;src:url(data:font/woff2;base64,`
  + fs.readFileSync(f.path).toString('base64') + `) format('woff2');}`).join('\n');

const body = faces.map((_, i) =>
  `<div class="probe" id="p${i}" style="font-family:'xh${i}'">`
  + `<span class="ex"></span>x</div>`).join('\n');

const page = `<!doctype html><meta charset="utf-8"><style>
${css}
.probe{font-size:${SIZE}px;font-weight:${WEIGHT};line-height:1;position:absolute;visibility:hidden}
.ex{display:inline-block;width:1ex;height:1ex}
</style><body>${body}</body>`;

const tmp = path.join(here, '.measure-xheight.html');
fs.writeFileSync(tmp, page);

let browser;
try {
  browser = await chromium.launch({ executablePath: findChrome() });
} catch (e) {
  console.error('No Chromium. Set $PSI_CHROME or install Chrome; xheights.json left as it is.');
  fs.unlinkSync(tmp);
  process.exit(1);
}

const p = await browser.newPage();
await p.goto('file://' + tmp, { waitUntil: 'load' });
const raw = await p.evaluate(async ({ n, SIZE }) => {
  // A family used only through a rule the layout never forces is not loaded
  // by `document.fonts.ready` alone – the display playground learned that the
  // expensive way and reported every candidate as lacking umlauts. Ask for
  // each family by name first.
  for (let i = 0; i < n; i++) await document.fonts.load(`400 100px 'xh${i}'`, 'x');
  await document.fonts.ready;
  const cv = document.createElement('canvas').getContext('2d');
  const out = [];
  for (let i = 0; i < n; i++) {
    const ex = document.querySelector(`#p${i} .ex`).getBoundingClientRect().width / SIZE;
    // A second, independent reading of the same quantity: the ink height of a
    // lowercase x on a canvas. `ex` comes out of the face's OS/2 table and
    // falls back to half the em when that table lies, so a face whose two
    // numbers disagree is a face whose metadata cannot be trusted.
    cv.font = `400 100px 'xh${i}'`;
    const m = cv.measureText('x');
    out.push({ ex, ink: m.actualBoundingBoxAscent / 100 });
  }
  return out;
}, { n: faces.length, SIZE });
await browser.close();
fs.unlinkSync(tmp);

const rows = faces.map((f, i) => ({
  family: f.family, role: f.role,
  xHeight: Math.round(raw[i].ex * 1000) / 1000,
  ink: Math.round(raw[i].ink * 1000) / 1000,
  current: f.xHeight,
}));

console.log(`x-height in em, weight ${WEIGHT}, measured at ${SIZE}px\n`);
console.log('face                        role    x-height   ink(x)   roster');
for (const r of rows) {
  const drift = Math.abs(r.ink - r.xHeight) > 0.02 ? '  ← ex and ink disagree' : '';
  const roster = r.current == null ? '   –'
    : (Math.abs(r.current - r.xHeight) < 0.0005 ? '  ok' : `  was ${r.current.toFixed(3)}`);
  console.log(`${r.family.padEnd(28)}${r.role.padEnd(8)}${r.xHeight.toFixed(3).padStart(8)}`
    + `${r.ink.toFixed(3).padStart(9)}${roster}${drift}`);
}

if (!process.argv.includes('--print')) {
  const out = Object.fromEntries(rows.map(r => [r.family, r.xHeight]));
  fs.writeFileSync(path.join(here, 'xheights.json'), JSON.stringify(out, null, 2) + '\n');
  console.log('\nwrote xheights.json – copy the numbers into BUNDLED_FONTS in build.js');
}
