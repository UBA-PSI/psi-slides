#!/usr/bin/env node
/**
 * Shoots the cover and divider gallery for the landing page.
 *
 *   node docs/site/shoot-gallery.mjs              # all of them, into docs/site/img/
 *   node docs/site/shoot-gallery.mjs hero panel   # just those
 *   node docs/site/shoot-gallery.mjs --keep-png   # leave the PNGs beside the WebP
 *
 * Why this is a second shooter rather than more rows in shoot.mjs. That script
 * photographs *one chunk of a tracked lecture in six views*: it needs the
 * lectures built, it walks the deck to a target chunk, and every shot shares a
 * source. This one photographs *one composition per deck*, and the reason it
 * cannot share a source is the reason the gallery has to exist at all - a deck
 * has exactly one `cover:` and one `section:`, so ten covers and six dividers
 * are sixteen decks. Folding that into the other shot table would have made
 * both of them conditional on which kind of shot they were.
 *
 * The decks are written and built here, into a temp directory, and thrown away
 * again. Tracking sixteen near-identical lectures to photograph them once
 * would put roughly 7 MB of HTML in the repository for a set of pictures, and
 * nothing in them is worth reading - they exist to be looked at, which is what
 * a picture is for. What *is* worth reading lives in lectures/decoration,
 * which shows every construction a single deck can carry.
 *
 * Reproducibility is the whole point, and it is the same argument the sibling
 * script makes in its own header: sixteen compositions of the same words have
 * to be shot at one size, one viewport and one zoom, or the gallery reads as
 * sixteen different products. Nothing here is composed by hand.
 *
 * Needs `playwright-core` from devDependencies and a Chromium (see
 * shoot-lib.mjs), and cwebp or magick to encode. It does not need any lecture
 * to have been built.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { findChrome, serve, encoder } from './shoot-lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const IMG = path.join(HERE, 'img');

// One frame for every tile: 16:9, the shape a projector has, at twice the
// width the gallery displays them at. Quality 80 rather than the 86 the
// landing-page screenshots use, because these are thumbnails and there are
// sixteen of them - measured, the difference is invisible at display size and
// roughly a third of the bytes.
const W = 1280, H = 720, DSF = 1.5, Q = 80;

// The picture the four picture-taking covers use. Drawn here rather than
// pulled from a lecture's assets folder: this script has to keep working when
// a lecture rearranges its own files, and an abstract horizon is a better
// stand-in for "a photograph" than a photograph of anything in particular
// would be - a real subject would compete with the composition the tile is
// about.
const ART = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" width="1600" height="900" role="img" aria-label="An abstract horizon in layered bands">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#16203a"/>
      <stop offset="0.5" stop-color="#3d4468"/>
      <stop offset="0.86" stop-color="#9a7d86"/>
      <stop offset="1" stop-color="#d8a882"/>
    </linearGradient>
    <linearGradient id="deep" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0e1526" stop-opacity="0"/>
      <stop offset="1" stop-color="#0b1020" stop-opacity="0.9"/>
    </linearGradient>
  </defs>
  <rect width="1600" height="900" fill="url(#sky)"/>
  <circle cx="1140" cy="286" r="52" fill="#f4dcc0" opacity="0.55"/>
  <path d="M0 604 L232 548 L438 596 L664 522 L890 588 L1132 536 L1362 592 L1600 552 L1600 900 L0 900 Z" fill="#2a2c46" opacity="0.82"/>
  <path d="M0 676 L286 638 L520 692 L790 626 L1042 690 L1318 640 L1600 684 L1600 900 L0 900 Z" fill="#1c1e33" opacity="0.9"/>
  <path d="M0 762 L340 724 L636 776 L936 718 L1246 772 L1600 736 L1600 900 L0 900 Z" fill="#12142440"/>
  <rect y="470" width="1600" height="430" fill="url(#deep)"/>
</svg>`;

// A `::: draw` for the two covers whose art is the chunk's own body. That is
// the documented reason those two exist - a diagram is not a file, so
// cover-image can never name one - so showing them with a drawing rather than
// with the SVG is showing what they are for.
const DRAW = `::: draw 150x56
box src  "Source"      at 0,0
box mid  "Measurement" right of src gap 1.4
box out  "Finding"     right of mid gap 1.4
edge src -> mid
edge mid -> out
:::`;

const FM = [
  'title: Crawling Under Observation',
  'subtitle: Detection, Evasion, and What They Cost Web Measurement Research',
  'presenter: Marit Osterhagen',
  'info: |',
  '  with Tomas Brekke and Ines Falk',
  '  Web Measurement Workshop · Delft · 10 April',
  'theme: light-blue',
  'font: sans',
  'lang: en',
];

const CLAIM = 'Every number in a crawl is conditional on not having been detected.';

// A cover tile: the frontmatter it adds, and what goes in the title chunk.
const cover = (name, lines, body = '') =>
  ({ name, kind: 'cover', fm: [`cover: ${name}`, ...lines], body });
// …and one that is a composition plus a key, so it names its own frontmatter.
const variant = (name, fm, body = '') => ({ name, kind: 'cover', fm, body });

// A divider tile: the deck is one part with one chunk in it, and the shot is
// the divider slide the column opens with - one press of Down from the cover.
const divider = (name) => ({ name: `section-${name}`, kind: 'divider', section: name });

const TILES = [
  // Ordered quiet to loud, the same order the vocabulary itself is listed in,
  // because that is the only question the list asks the author.
  cover('classic', []),
  cover('masthead', [], 'A crawler that gets recognised is served a different web, and the\nmeasurement it brings home never says so.'),
  cover('stack', []),
  cover('display', []),
  cover('panel', []),
  cover('quote', [], CLAIM),
  cover('split', ['cover-image: art']),
  cover('hero', ['cover-image: art']),
  cover('beside', [], DRAW),
  cover('above', [], DRAW),
  // The two keys that modify a composition rather than replacing it. Shown on
  // the compositions where the difference is unmistakable: `stack` centres on
  // both axes, so bottom is the whole of what changed.
  variant('stack-bottom', ['cover: stack', 'cover-align: bottom']),
  // The ratio is shown on `beside` and not on `split`, which is the cover an
  // author would reach for first, because at the time of writing
  // `.chunk[data-cover=split]` hard-codes its 42% and never reads
  // --cover-ratio - `beside` and `above` both do. A tile of the key on
  // `split` would have been a picture of it doing nothing. Move it back when
  // that is fixed; the ratio here is the same number either way.
  variant('beside-ratio', ['cover: beside', 'cover-ratio: 62%'], DRAW),
  ...['plain', 'tinted', 'rule', 'card', 'number', 'outline'].map(divider),
];

// ── the decks ────────────────────────────────────────────────────────────
// Each tile gets a folder of its own, because a deck has one cover and one
// section. They are built --audience-only: the gallery is about what the room
// sees, and building four views sixteen times is three quarters of the work
// thrown away.
function buildDecks(tiles, dir) {
  for (const t of tiles) {
    const d = path.join(dir, t.name);
    fs.mkdirSync(path.join(d, 'assets'), { recursive: true });
    fs.writeFileSync(path.join(d, 'assets', 'art.svg'), ART);
    const fm = t.kind === 'divider'
      ? [...FM, 'cover: classic', `section: ${t.section}`]
      : [...FM, ...t.fm];
    // A divider needs parts for `outline` to list and for `number` to count,
    // and it needs the one it opens to be the second of them, or every tile
    // in that row would say "part 1".
    const body = t.kind === 'divider'
      ? '## title: {#title}\n\n'
        + '# Why measure at all {#p1}\n\n## free: A {#a}\n\nText.\n\n'
        + '# What the trackers actually run {#p2}\n\n## free: B {#b}\n\nText.\n\n'
        + '# How we detected the detectors {#p3}\n\n## free: C {#c}\n\nText.\n'
      : `## title: {#title}\n\n${t.body}\n\n## free: Body {#b}\n\nText.\n`;
    fs.writeFileSync(path.join(d, 'source.md'), `---\n${fm.join('\n')}\n---\n\n${body}`);
    const r = spawnSync(process.execPath,
      [path.join(ROOT, 'build.js'), path.join(d, 'source.md'), '--audience-only'],
      { cwd: ROOT, encoding: 'utf8' });
    if (r.status !== 0) {
      throw new Error(`${t.name}: build failed\n${(r.stdout || '') + (r.stderr || '')}`);
    }
  }
}

// The live view's own chrome is not part of any composition: the help button
// and the edge arrows are controls, and a gallery tile is a picture of a
// slide. Everything else on these decks is already quiet - a title chunk
// drops its slide number by design, and a divider is auto-inserted and never
// carried one.
const RIG = `
<style>#help-button, #nav-hints { display: none !important; }</style>
`;

const argv = process.argv.slice(2);
const keepPng = argv.includes('--keep-png');
const wanted = argv.filter(a => !a.startsWith('--'));
const tiles = wanted.length ? TILES.filter(t => wanted.includes(t.name)) : TILES;
if (!tiles.length) {
  console.error(`unknown tile. known: ${TILES.map(t => t.name).join(', ')}`);
  process.exit(1);
}

let chromium;
try {
  ({ chromium } = await import('playwright-core'));
} catch {
  console.error('playwright-core is not installed. Run: npm install');
  process.exit(1);
}

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-gallery-'));
console.log(`building ${tiles.length} deck(s)…`);
buildDecks(tiles, work);

// One flat directory of pages for the server, named by tile.
const pages = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-gallery-pages-'));
for (const t of tiles) {
  fs.writeFileSync(path.join(pages, t.name + '.html'),
    fs.readFileSync(path.join(work, t.name, 'audience.html'), 'utf8') + RIG);
}

const { server, port } = await serve(pages);
const enc = encoder();
if (!enc) console.log('no cwebp or magick on PATH - writing PNG only');
const browser = await chromium.launch({ executablePath: findChrome() });
let bytes = 0;
try {
  for (const t of tiles) {
    const ctx = await browser.newContext({
      viewport: { width: W, height: H }, deviceScaleFactor: DSF,
    });
    const page = await ctx.newPage();
    await page.goto(`http://127.0.0.1:${port}/${t.name}.html`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    if (t.kind === 'divider') {
      // Three presses: past the cover, past the first part's divider and its
      // chunk, onto the second part's divider - so `number` shows a 2 and
      // `outline` has a part behind it and a part ahead of it. A tile of the
      // first divider would show the state the list spends least time in.
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(500);
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(500);
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(900);
    }
    // The camera has to have landed, or the tile is a picture of empty stage.
    // That has happened to the sibling script; it is fatal here too.
    const kind = await page.evaluate(() => {
      const a = document.querySelector('.chunk.active');
      return a ? (a.dataset.tag || '') : null;
    });
    const want = t.kind === 'divider' ? 'section' : 'title';
    if (kind !== want) throw new Error(`${t.name}: active chunk is "${kind}", expected "${want}"`);

    const png = path.join(IMG, t.name + '.png');
    await page.screenshot({ path: png });
    let out = png;
    if (enc) {
      out = path.join(IMG, t.name + '.webp');
      const r = spawnSync(enc.bin, enc.args(png, out, Q), { stdio: 'inherit' });
      if (r.status !== 0) throw new Error(`${enc.bin} failed on ${t.name}`);
      if (!keepPng) fs.rmSync(png);
    }
    const kb = Math.round(fs.statSync(out).size / 1024);
    bytes += fs.statSync(out).size;
    console.log(`  ${t.name.padEnd(16)} ${Math.round(W * DSF)}x${Math.round(H * DSF)}  ` +
                `${kb} KB  -> ${path.relative(ROOT, out)}`);
    await ctx.close();
  }
  console.log(`  ${String(tiles.length).padStart(2)} tile(s), ` +
              `${Math.round(bytes / 1024)} KB total`);
} finally {
  await browser.close();
  server.close();
  fs.rmSync(work, { recursive: true, force: true });
  fs.rmSync(pages, { recursive: true, force: true });
}
