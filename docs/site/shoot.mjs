#!/usr/bin/env node
/**
 * Re-shoots the landing page's screenshots from lectures/python-intro.
 *
 *   node docs/site/shoot.mjs                 # all seven, into docs/site/img/
 *   node docs/site/shoot.mjs cockpit search  # just those two
 *   node docs/site/shoot.mjs --keep-png      # leave the PNGs beside the WebP
 *
 * Requires the lecture to be built first (`node build.js
 * lectures/python-intro/source.md`), `playwright-core` from devDependencies,
 * and a Chromium: $PSI_CHROME wins, then a browser in the Playwright cache,
 * then the system Google Chrome. Encoding needs cwebp or magick on PATH; with
 * neither, the PNGs are kept and the WebP step is skipped with a note.
 *
 * Why a script and not a manual pass with the screenshot key:
 *
 * - The shots have to be reproducible. They are all the same chunk of the
 *   same lecture in six different views, and hand-taken versions drifted in
 *   framing and in size (one shipped at 860 px while the rest were 1440).
 * - `chrome --headless --screenshot` cannot do it. It captures from the
 *   document origin, cannot scroll, and cannot press a key, so a live view is
 *   only ever photographed in its initial state. A driver can put the deck in
 *   the state each figure is about and wait for the camera to settle.
 * - deviceScaleFactor is where the resolution comes from. The viewport stays
 *   at the size the shots were composed at (1440x900) and only the pixel
 *   density goes up, so the layout is identical and the type is not resampled.
 *
 * The audience view is walked to the target chunk with the arrow keys rather
 * than addressed by fragment. That was a workaround for the bug where the
 * browser scrolled #stage-viewport to the fragment target and left the camera
 * framing empty space; the runtime resets that scroll now (see
 * resetViewportScroll in build.js), and the walk stays because it is also
 * what a lecturer does, and because the assertion below is worth keeping
 * honest against a fragment path that has been wrong once.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const LECTURE = path.join(ROOT, 'lectures', 'python-intro');
const IMG = path.join(HERE, 'img');
const TARGET = 'why-playwright';

// The document views are trimmed to the two chunks the figure frames. Same
// job the fragment does for the live views, done with CSS because print.html
// has no runtime to ask.
const DOC_RIG = `
<style>
.chunk { display: none !important; }
#${TARGET}, #playwright-install { display: revert !important; }
.column-heading, nav.toc { display: none !important; }
main { padding-top: 0 !important; margin-top: 0 !important; }
</style>
`;

const SHOTS = [
  { name: 'collapsed', src: 'audience.html', w: 1440, h: 900, dsf: 1.5, live: true },
  { name: 'full', src: 'audience.html', w: 1440, h: 900, dsf: 1.5, live: true,
    // Long enough for the "collapse: show everything" toast to fade: it is
    // feedback for the lecturer, not part of the slide.
    act: async (p) => { await p.keyboard.press('c'); await p.waitForTimeout(3000); } },
  { name: 'overview', src: 'audience.html', w: 1440, h: 900, dsf: 1.5, live: true,
    act: async (p) => { await p.keyboard.press('o'); await p.waitForTimeout(1500); } },
  { name: 'search', src: 'audience.html', w: 1440, h: 900, dsf: 1.5, live: true,
    act: async (p) => {
      await p.keyboard.press('/');
      await p.fill('#search-input', 'async');
      await p.waitForTimeout(500);
    } },
  { name: 'cockpit', src: 'speaker.html', w: 1440, h: 900, dsf: 1.5, frag: true },
  { name: 'printed', src: 'print.html', w: 1000, h: 625, dsf: 2.15, rig: DOC_RIG },
  { name: 'handout', src: 'print-notes.html', w: 860, h: 690, dsf: 2.5, rig: DOC_RIG },
];

// ── browser ──────────────────────────────────────────────────────────────
function findChrome() {
  if (process.env.PSI_CHROME) return process.env.PSI_CHROME;
  const cache = path.join(process.env.HOME, 'Library/Caches/ms-playwright');
  if (fs.existsSync(cache)) {
    const builds = fs.readdirSync(cache)
      .filter(d => /^chromium-\d+$/.test(d))
      .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
    for (const b of builds) {
      const mac = path.join(cache, b, 'chrome-mac-arm64');
      if (!fs.existsSync(mac)) continue;
      for (const app of fs.readdirSync(mac).filter(f => f.endsWith('.app'))) {
        const exe = path.join(mac, app, 'Contents/MacOS', app.replace(/\.app$/, ''));
        if (fs.existsSync(exe)) return exe;
      }
    }
  }
  const system = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if (fs.existsSync(system)) return system;
  throw new Error('no Chromium found - set $PSI_CHROME to a browser executable');
}

// ── the rig, and a server for it ─────────────────────────────────────────
function buildRig() {
  const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'psi-shoot-'));
  const needed = [...new Set(SHOTS.map(s => s.src))];
  for (const src of needed) {
    const abs = path.join(LECTURE, src);
    if (!fs.existsSync(abs)) {
      const err = new Error(
        `${path.relative(ROOT, abs)} is missing.\n` +
        'Build the lecture first: node build.js lectures/python-intro/source.md');
      err.userFacing = true;
      throw err;
    }
  }
  for (const s of SHOTS) {
    const html = fs.readFileSync(path.join(LECTURE, s.src), 'utf8');
    fs.writeFileSync(path.join(dir, s.name + '.html'), html + (s.rig || ''));
  }
  return dir;
}

function serve(dir) {
  const server = http.createServer((req, res) => {
    const file = path.join(dir, path.basename(req.url.split('?')[0]));
    if (!fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(fs.readFileSync(file));
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1',
    () => resolve({ server, port: server.address().port })));
}

// ── driving the deck ─────────────────────────────────────────────────────
const activeId = (p) => p.evaluate(() => {
  const a = document.querySelector('.chunk.active');
  return a ? a.id : null;
});

// Down steps within a column, Right moves to the next one, so a sweep needs
// both: Down until it stops changing anything, then Right, then Down again.
async function walkTo(p) {
  let last = await activeId(p);
  for (let i = 0; i < 200; i++) {
    if (last === TARGET) return;
    await p.keyboard.press('ArrowDown');
    await p.waitForTimeout(110);
    let now = await activeId(p);
    if (now === last) {
      await p.keyboard.press('ArrowRight');
      await p.waitForTimeout(110);
      now = await activeId(p);
      if (now === last) throw new Error(`stuck at #${last || '(no id)'}`);
    }
    last = now;
  }
  throw new Error(`never reached #${TARGET}`);
}

// A chunk outside the viewport means the camera did not land, and the shot
// would be of an empty stage. That has happened; it is fatal here.
async function assertOnScreen(p, name) {
  const r = await p.evaluate((id) => {
    const b = document.getElementById(id).getBoundingClientRect();
    const v = document.getElementById('stage-viewport').getBoundingClientRect();
    return {
      on: b.x < v.right && b.y < v.bottom && b.x + b.width > v.left && b.y + b.height > v.top,
      x: Math.round(b.x), y: Math.round(b.y),
    };
  }, TARGET);
  if (!r.on) throw new Error(`${name}: #${TARGET} is off screen (x=${r.x} y=${r.y})`);
}

// ── encoding ─────────────────────────────────────────────────────────────
function encoder() {
  for (const [bin, args] of [
    ['cwebp', (i, o) => ['-quiet', '-q', '86', '-m', '6', i, '-o', o]],
    ['magick', (i, o) => [i, '-quality', '86', '-define', 'webp:method=6', o]],
  ]) {
    if (spawnSync('which', [bin]).status === 0) return { bin, args };
  }
  return null;
}

// ── main ─────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const keepPng = argv.includes('--keep-png');
const wanted = argv.filter(a => !a.startsWith('--'));
const shots = wanted.length ? SHOTS.filter(s => wanted.includes(s.name)) : SHOTS;
if (!shots.length) {
  console.error(`unknown shot. known: ${SHOTS.map(s => s.name).join(', ')}`);
  process.exit(1);
}

let chromium;
try {
  ({ chromium } = await import('playwright-core'));
} catch {
  console.error('playwright-core is not installed. Run: npm install');
  process.exit(1);
}

const dir = buildRig();
const { server, port } = await serve(dir);
const enc = encoder();
if (!enc) console.log('no cwebp or magick on PATH - writing PNG only');

const browser = await chromium.launch({ executablePath: findChrome() });
try {
  for (const s of shots) {
    const ctx = await browser.newContext({
      viewport: { width: s.w, height: s.h },
      deviceScaleFactor: s.dsf,
    });
    const page = await ctx.newPage();
    await page.goto(`http://127.0.0.1:${port}/${s.name}.html` + (s.frag ? `#${TARGET}` : ''),
      { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    if (s.live) { await walkTo(page); await page.waitForTimeout(700); }
    // Checked before the state change: overview and search deliberately
    // cover or shrink the stage, so the assertion belongs to the landing.
    if (s.live || s.frag) await assertOnScreen(page, s.name);
    if (s.act) await s.act(page);

    const png = path.join(IMG, s.name + '.png');
    await page.screenshot({ path: png });
    let out = png;
    if (enc) {
      out = path.join(IMG, s.name + '.webp');
      const r = spawnSync(enc.bin, enc.args(png, out), { stdio: 'inherit' });
      if (r.status !== 0) throw new Error(`${enc.bin} failed on ${s.name}`);
      if (!keepPng) fs.rmSync(png);
    }
    const kb = Math.round(fs.statSync(out).size / 1024);
    console.log(`  ${s.name.padEnd(10)} ` +
                `${Math.round(s.w * s.dsf)}x${Math.round(s.h * s.dsf)}  ${kb} KB  ` +
                `-> ${path.relative(ROOT, out)}`);
    await ctx.close();
  }
} finally {
  await browser.close();
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
}
