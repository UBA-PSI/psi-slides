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
import { findChrome } from '../../chrome-path.mjs';

export { findChrome };

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
