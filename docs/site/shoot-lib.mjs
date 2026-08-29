/**
 * What every screenshot script on this site needs and none of them should own
 * twice: find a browser, serve a directory of built pages over loopback, find
 * an encoder.
 *
 * It exists because there are two shooters now. `shoot.mjs` photographs one
 * chunk of a tracked lecture in six views; `shoot-gallery.mjs` photographs one
 * composition per throwaway deck. Those are different jobs and they do not
 * belong in one shot table - but the plumbing under them is the same three
 * functions, and a second copy is the kind that drifts silently until one
 * script finds a browser the other does not.
 *
 * A page is served rather than opened from `file://` because a live view has
 * to be able to fetch nothing at all and still work; serving it is also what
 * the third-party embeds need, and it costs one function.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// $PSI_CHROME wins, then the newest browser in the Playwright cache, then the
// system Google Chrome. Newest first, because an old cached build is the one
// that renders a stylesheet the current one handles.
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
  const system = process.platform === 'darwin'
    ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium']
    : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium-browser', '/usr/bin/chromium'];
  for (const p of system) { const hit = take(p); if (hit) return hit; }

  // Naming what was looked for, because "no Chromium found" on a host whose
  // layout this function does not know is a sentence with no next step in it.
  throw new Error('no Chromium found \u2013 set $PSI_CHROME to a browser executable.\n'
    + 'Tried:\n  ' + tried.join('\n  '));
}

export function serve(dir) {
  const server = http.createServer((req, res) => {
    const file = path.join(dir, path.basename(req.url.split('?')[0]));
    if (!fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(fs.readFileSync(file));
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1',
    () => resolve({ server, port: server.address().port })));
}

// cwebp if it is there, magick otherwise, and null if neither - the caller
// keeps the PNG and says so rather than failing, because a missing encoder is
// a machine that has not been set up, not a broken shot.
export function encoder() {
  for (const [bin, args] of [
    ['cwebp', (i, o, q) => ['-quiet', '-q', String(q), '-m', '6', i, '-o', o]],
    ['magick', (i, o, q) => [i, '-quality', String(q), '-define', 'webp:method=6', o]],
  ]) {
    if (spawnSync('which', [bin]).status === 0) return { bin, args };
  }
  return null;
}
