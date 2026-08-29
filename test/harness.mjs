/*
 * The bits every spec needs: a Chromium, a loopback server, and a set of
 * helpers that drive a built deck the way a lecturer does.
 *
 * Why a browser and not a unit test. Almost everything worth breaking in this
 * project only exists in the built page: the runtime and the stylesheets are
 * template literals inside build.js, the editor re-runs the compiler in the
 * browser, and the interesting failures are things like "the modal stopped
 * owning the keyboard" or "a drag measured its delta against a mapping the
 * previous drag had already changed". None of that is reachable from Node.
 * The pure parts (the span table, the compiler) need no harness and are
 * exercised through it anyway, because the specs assert on the source text
 * the editor produces.
 *
 * Deliberately no test framework. The project has no runtime dependencies
 * worth the name and two devDependencies; a third for describe/it would buy
 * a nicer report and cost more than it is worth at this size.
 *
 * Writing a spec here - four things learned the hard way:
 *
 *  - **Assert on the source text the editor produced, never on the picture.**
 *    The editor's contract is that it rewrites the smallest span it can and
 *    re-runs the compiler, so a drag that produced the right picture from the
 *    wrong statement is a failure - and on a screenshot it looks fine.
 *  - **Derive the expectation from the line, do not pin a lecture's
 *    coordinates.** Specs written against `via iv.cx,d0.bottom+0.28` all broke
 *    the day that figure was redrawn, and not one of them had found a real
 *    problem. Read the clause, count the waypoints, assert that the references
 *    survived.
 *  - **The editor opens at the last beat.** Above beat 0 a drag means "write a
 *    `move` into this step" and leaves the placement alone, so a spec about
 *    placement has to call `ed.beat(0)` out loud.
 *  - **Use `restart()`, not `page.reload()`.** A reload restores the last
 *    active chunk from localStorage, so where a spec lands depends on where
 *    its previous section finished.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// A second copy of this lives in docs/site/shoot-lib.mjs, which serves a
// standalone script rather than a module and predates this file. It changes
// when a Playwright cache layout changes, which is roughly never, and when a
// host is added, which happened once: until then this looked only in a macOS
// cache under an arm64 directory and at /Applications, so the suite could not
// run on a Linux runner at all - which is why the CI job that would have
// caught two lint.js gaps was never written. Keep the two in step.
export function findChrome() {
  if (process.env.PSI_CHROME) return process.env.PSI_CHROME;
  const tried = [];
  const take = (p) => { tried.push(p); return fs.existsSync(p) ? p : null; };

  // The Playwright cache, newest build first. Only two things differ between
  // hosts: where the cache lives, and whether a build is an .app bundle or a
  // bare binary.
  const home = process.env.HOME || '';
  const cache = process.platform === 'darwin'
    ? path.join(home, 'Library/Caches/ms-playwright')
    : path.join(home, '.cache/ms-playwright');
  if (fs.existsSync(cache)) {
    const builds = fs.readdirSync(cache)
      .filter(d => /^chromium-\d+$/.test(d))
      .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
    for (const b of builds) {
      for (const plat of ['chrome-mac-arm64', 'chrome-mac', 'chrome-linux']) {
        const at = path.join(cache, b, plat);
        if (!fs.existsSync(at)) continue;
        if (plat === 'chrome-linux') {
          const exe = take(path.join(at, 'chrome'));
          if (exe) return exe;
          continue;
        }
        for (const app of fs.readdirSync(at).filter(f => f.endsWith('.app'))) {
          const exe = take(path.join(at, app, 'Contents/MacOS', app.replace(/\.app$/, '')));
          if (exe) return exe;
        }
      }
    }
  }

  // A browser the host installed. `/usr/bin/google-chrome` is what a GitHub
  // ubuntu runner has, which is the whole reason this function knows about
  // more than one platform.
  //
  // UNTESTED ON LINUX. Everything here was written and verified on macOS: the
  // branch selection and this path list were exercised by forcing
  // process.platform, but no Linux host has ever actually run it, and whether
  // a GitHub runner image really ships a browser at one of these four paths is
  // an empirical question about that image rather than about this code. The
  // authoring machine is a Mac, so nothing local depends on it - but
  // release.yml runs on ubuntu-latest, so a tag does. The failure is safe and
  // loud rather than subtle: release.yml calls this in a step of its own
  // before it stages or publishes anything, so a wrong guess costs one failed
  // release run and one line here. `browser.yml` exists partly to find that
  // out on a branch first.
  const system = process.platform === 'darwin'
    ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium']
    : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium-browser', '/usr/bin/chromium'];
  for (const p of system) { const hit = take(p); if (hit) return hit; }

  // Naming what was looked for, because "no Chromium found" on a host whose
  // layout this function does not know is a sentence with no next step in it.
  const err = new Error('no Chromium found \u2013 set $PSI_CHROME to a browser executable.\n'
    + 'Tried:\n  ' + tried.join('\n  '));
  err.userFacing = true;
  throw err;
}

// Build rather than assume. A suite that runs against whatever HTML happens
// to be on disk reports on the last build somebody made by hand, which is the
// one thing a regression suite must not do.
export function buildLecture(slug, flags = []) {
  const src = path.join(ROOT, 'lectures', slug, 'source.md');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'build.js'), src, ...flags],
    { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(`build of ${slug} failed:\n${r.stdout || ''}${r.stderr || ''}`);
  }
  return path.join(ROOT, 'lectures', slug);
}

export function serve(dir) {
  const server = http.createServer((req, res) => {
    const name = path.basename(req.url.split('?')[0]);
    // The views are self-contained, so the only request a page makes is the
    // one the browser makes for itself. Answering it keeps "no page errors"
    // an assertion about the lecture rather than about the server.
    if (name === 'favicon.ico') { res.writeHead(204); res.end(); return; }
    const file = path.join(dir, name);
    if (!fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(fs.readFileSync(file));
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1',
    () => resolve({ server, port: server.address().port })));
}

// ── the report ──────────────────────────────────────────────────────
export function createReport() {
  const failures = [];
  let passed = 0;
  return {
    ok(cond, what, got) {
      if (cond) { passed++; console.log('  ✓ ' + what); return true; }
      failures.push(what);
      console.log('  ✗ ' + what + (got === undefined ? '' : '\n      got: ' + got));
      return false;
    },
    note(line) { console.log('    ' + line); },
    get passed() { return passed; },
    get failures() { return failures; },
  };
}

// ── driving a built deck ────────────────────────────────────────────
// One Chromium for the whole run. Launching cost ~1.5s per spec and the
// suite pays it fifteen times over; a browser context gives each spec the
// same isolation (fresh localStorage, fresh windows) for a few milliseconds.
let sharedBrowser = null;
export async function closeBrowser() {
  if (sharedBrowser) { const b = sharedBrowser; sharedBrowser = null; await b.close(); }
}

export async function openDeck(port, view = 'audience', viewport = { width: 1440, height: 900 }) {
  sharedBrowser ??= await chromium.launch({ executablePath: findChrome(), headless: true });
  const context = await sharedBrowser.newContext({ viewport });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${port}/${view}.html`, { waitUntil: 'load' });
  await page.waitForTimeout(700);
  // `close` shuts this spec's context; the browser itself lives until
  // closeBrowser() at the end of the run.
  return { page, errors, close: () => context.close(), ...deckHelpers(page) };
}

function deckHelpers(page) {
  // Every column of a named section opens with an auto-inserted divider chunk
  // that carries no author id, and it is the chunk the sideways keys act on,
  // so the specs have to be able to name it.
  const at = () => page.evaluate(() => {
    const a = document.querySelector('.chunk.active');
    if (!a) return { id: null, colIdx: -1, hints: '---' };
    const w = document.getElementById('nav-hints');
    const on = (d) => !!(w && w.querySelector('[data-hint="' + d + '"]').hasAttribute('data-on'));
    return {
      id: a.dataset.chunkId || '(section)',
      colIdx: Number(a.closest('.column').dataset.col),
      hints: (on('left') ? 'L' : '-') + (on('right') ? 'R' : '-') + (on('down') ? 'D' : '-'),
    };
  });

  const press = async (key, wait = 240) => {
    await page.keyboard.press(key);
    await page.waitForTimeout(wait);
  };

  // Forward is one key now, across reveals and across columns, so reaching a
  // slide is that key until it comes up. Asserting the walk terminates is
  // itself worth something: it is the property "one key runs the lecture".
  const walkTo = async (id, limit = 200) => {
    for (let i = 0; i < limit; i++) {
      if ((await at()).id === id) return true;
      await press('ArrowDown', 90);
    }
    return (await at()).id === id;
  };

  // The step a diagram is showing, read off the runtime rather than counted
  // from the keys pressed, so a spec cannot agree with itself about a beat
  // that never actually landed.
  const beatOf = (chunkId) => page.evaluate((c) => {
    const svg = document.querySelector('#' + c + ' svg.psi-diagram');
    return svg && svg.psiDiagram ? svg.psiDiagram.step : -1;
  }, chunkId);

  // A plain reload does not put the deck back at the start: loadPersisted
  // restores the last active chunk from localStorage, so where a spec lands
  // depends on where the previous section of that same spec finished. Clear
  // the storage first and a reload means what it looks like it means.
  const restart = async (page_ = page) => {
    await page_.evaluate(() => { try { localStorage.clear(); } catch (e) { /* private window */ } });
    await page_.reload({ waitUntil: 'load' });
    await page_.waitForTimeout(700);
  };

  return { at, press, walkTo, beatOf, restart };
}

// ── driving the diagram editor ──────────────────────────────────────
export function editorHelpers(page) {
  const open = async (chunkId) => {
    await page.click(`#${chunkId} figure.figure-diagram svg`, { position: { x: 8, y: 8 } });
    await page.waitForTimeout(400);
    await page.keyboard.press('e');
    await page.waitForTimeout(700);
    // Open at the last beat: an element hidden at beat 0 has geometry but no
    // stroke to aim at, and a spec that clicked one would be testing the hit
    // test against something the author cannot see either.
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('#dge-beats .dge-beat')];
      if (b.length) b[b.length - 1].click();
    });
    await page.waitForTimeout(400);
    return page.locator('#dge-root').count().then(n => n > 0);
  };

  const source = () => page.evaluate(() =>
    (document.querySelector('#dge-source') || {}).textContent || '');
  const lineWith = async (needle) =>
    (await source()).split('\n').find(l => l.includes(needle));
  // The head of the *selection* pane by name, not the first h3 in the panel.
  // The step pane sits above it whenever a beat is standing, and "this step"
  // is not what is selected.
  const selection = () => page.evaluate(() =>
    ((document.querySelector('#dge-side .dge-sel-head') || {}).textContent || '').trim());

  // A point that is genuinely on the stroke. A bounding-box centre is not:
  // for a diagonal or dog-legged arrow it is usually empty paper, which is
  // exactly the case the hit test exists to handle.
  const pointOnPath = (selector, frac = 0.5) => page.evaluate(([s, f]) => {
    const p = document.querySelector(s);
    if (!p) return null;
    const svg = document.querySelector('#dge-art-svg');
    const at = p.getPointAtLength(p.getTotalLength() * f);
    const m = svg.getScreenCTM();
    return { x: at.x * m.a + at.y * m.c + m.e, y: at.x * m.b + at.y * m.d + m.f };
  }, [selector, frac]);

  const clickPath = async (selector, frac = 0.5) => {
    const pt = await pointOnPath(selector, frac);
    if (!pt) return false;
    await page.mouse.click(pt.x, pt.y);
    await page.waitForTimeout(320);
    return true;
  };

  const centreOf = (selector) => page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, selector);

  const drag = async (from, dx, dy, steps = 12) => {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + dx, from.y + dy, { steps });
    await page.waitForTimeout(140);
    await page.mouse.up();
    await page.waitForTimeout(380);
  };

  // Which beat the canvas shows. It matters to more than the picture: at a
  // beat above zero a drag means "write a move into this step" and leaves the
  // placement alone, so a spec about placement has to say beat 0 out loud.
  const beat = async (k) => {
    await page.evaluate((i) => {
      const b = [...document.querySelectorAll('#dge-beats .dge-beat')];
      if (b[i]) b[i].click();
    }, k);
    await page.waitForTimeout(350);
  };

  const problems = () => page.evaluate(() =>
    (document.querySelector('.dge-problems') || {}).textContent || '');

  return { open, beat, source, lineWith, selection, pointOnPath, clickPath, centreOf, drag, problems };
}
