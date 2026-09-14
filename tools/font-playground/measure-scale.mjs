// Measure each display face's advance width against the deck's serif, and
// write scales.json.
//
// Why this exists: the cover's type size is tuned for Literata, and these
// faces disagree about width by a factor of three. Anton set at Literata's
// size looks timid; Press Start 2P set at it runs off the slide - which is
// exactly what it did in the first playground. A guessed correction would
// be wrong per face and silently so, so the correction is measured in the
// browser that will draw it.
//
// The metric is advance width and not cap height, because width is what
// decides how many lines a headline takes, and a headline that takes one
// line too many is the overflow. Normalising it makes every face wrap the
// reference title in the same number of lines.
//
//   node measure-scale.mjs            # rewrite scales.json
//   node measure-scale.mjs --print    # table only, write nothing
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { CANDIDATES } from './roster.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');

// A real German lecture title: umlauts, a long compound, and the descenders
// that make some of these faces set wider than their specimen suggests.
const REF = 'Datensicherheit im digitalen Alltag';
const CLAMP = [0.55, 1.45];

const b64 = (root, pkg, file) =>
  fs.readFileSync(path.join(root, 'node_modules', pkg, 'files', file)).toString('base64');

const faces = [
  { family: 'Literata', css: b64(repo, '@fontsource-variable/literata', 'literata-latin-wght-normal.woff2'), weight: '100 900' },
  ...CANDIDATES.map((c) => ({ family: c.pkg, css: b64(here, c.pkg, c.file), weight: c.weight, c })),
];

const page = `<!doctype html><meta charset="utf-8"><style>
${faces.map((f) => `@font-face{font-family:'${f.family}';font-weight:${f.weight};font-display:block;src:url(data:font/woff2;base64,${f.css}) format('woff2')}`).join('\n')}
</style><body></body>`;

const tmp = path.join(here, '.measure.html');
fs.writeFileSync(tmp, page);

let browser;
for (const opt of [process.env.PSI_CHROME && { executablePath: process.env.PSI_CHROME }, { channel: 'chrome' }, { channel: 'msedge' }].filter(Boolean)) {
  try { browser = await chromium.launch(opt); break; } catch {}
}
if (!browser) {
  console.error('No Chromium. Set $PSI_CHROME or install Chrome; scales.json left as it is.');
  fs.unlinkSync(tmp);
  process.exit(1);
}

const p = await browser.newPage();
await p.goto('file://' + tmp, { waitUntil: 'load' });
const raw = await p.evaluate(async ({ names, REF }) => {
  await Promise.all(names.map((n) => document.fonts.load("100px '" + n.family + "'", REF)));
  await document.fonts.ready;
  const cv = document.createElement('canvas').getContext('2d');
  const out = {};
  for (const n of names) {
    // The weight matters: a range measured at the default 400 is not the
    // weight a headline is set at.
    cv.font = (n.headWeight || 400) + " 100px '" + n.family + "'";
    out[n.family] = cv.measureText(REF).width;
  }
  return out;
}, { REF, names: faces.map((f) => ({ family: f.family, headWeight: headWeight(f) })) });
await browser.close();
fs.unlinkSync(tmp);

// A variable face is set at the top of its own range on a divider, not at 400.
function headWeight(f) {
  if (!f.c) return 400;
  const hi = String(f.c.weight).trim().split(/\s+/).pop();
  return Math.min(900, Number(hi) || 400);
}

const ref = raw['Literata'];
const rows = CANDIDATES.map((c) => {
  const w = raw[c.pkg];
  const exact = ref / w;
  const scale = Math.min(CLAMP[1], Math.max(CLAMP[0], Math.round(exact * 100) / 100));
  return { pkg: c.pkg, kind: c.kind, flavour: c.flavour, em: +(w / ref).toFixed(3), scale, clamped: scale !== Math.round(exact * 100) / 100 };
});

const wide = [...rows].sort((a, b) => b.em - a.em);
console.log(`reference: Literata, "${REF}" at 100px = ${ref.toFixed(0)}px\n`);
console.log('face                                    width   scale');
for (const r of wide)
  console.log(`${r.pkg.padEnd(40)}${r.em.toFixed(2).padStart(5)}   ${r.scale.toFixed(2)}${r.clamped ? '  (clamped)' : ''}`);

if (!process.argv.includes('--print')) {
  const out = Object.fromEntries(rows.map((r) => [r.pkg, r.scale]));
  fs.writeFileSync(path.join(here, 'scales.json'), JSON.stringify(out, null, 2) + '\n');
  console.log('\nwrote scales.json');
}
