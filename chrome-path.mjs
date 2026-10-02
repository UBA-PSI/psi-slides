/**
 * Where the browser is. One function, one file, because it had two homes and
 * a third was about to open.
 *
 * `docs/site/shoot-lib.mjs` and `test/harness.mjs` each carried a byte-identical
 * copy, with a comment in the second asking the reader to keep them in step.
 * That works until it does not: the search changed once, when a Linux runner
 * was added, and the only reason both copies changed together is that one
 * person did it in one sitting. `pdf-export.mjs` would have been the third,
 * and the third is the one where they come apart.
 *
 * Zero dependencies and zero project imports on purpose. It resolves a path;
 * it does not launch anything, so a caller that wants headless, a viewport or
 * a context still says so itself.
 */
import fs from 'node:fs';
import path from 'node:path';

// $PSI_CHROME wins, then the newest browser in the Playwright cache, then the
// system Google Chrome. Newest first, because an old cached build is the one
// that renders a stylesheet the current one handles.
export function findChrome() {
  const tried = [];
  const take = (p) => { tried.push(p); return fs.existsSync(p) ? p : null; };

  // $PSI_CHROME is an override, not an escape from being a path. Returning it
  // unchecked handed the caller something that fails later and elsewhere: the
  // PDF export answered a typo'd variable with Playwright's own
  // "Failed to launch chromium because executable doesn't exist", eight frames
  // of stack, and no mention of the variable that caused it. Checked here, the
  // one function that knows what it looked at says so.
  if (process.env.PSI_CHROME) {
    const set = take(process.env.PSI_CHROME);
    if (set) return set;
    return missing(tried, 'Set by $PSI_CHROME. Unset it to search the usual places.');
  }

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
  // Both halves have now actually run. macOS resolves out of the Playwright
  // cache; an ubuntu-24.04 runner answers with the first entry here,
  // /usr/bin/google-chrome, and drove the whole browser suite from it. Worth
  // checking rather than assuming, because release.yml runs on ubuntu-24.04:
  // "we build on macOS" is true of the laptop and false of the tag. If a
  // future runner image moves the browser, the failure stays loud and cheap -
  // release.yml resolves it in a step of its own before anything is staged or
  // published, so the cost is one red run and one path added here.
  const system = process.platform === 'darwin'
    ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium']
    : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium-browser', '/usr/bin/chromium'];
  for (const p of system) { const hit = take(p); if (hit) return hit; }

  return missing(tried);
}

// Naming what was looked for, because "no Chromium found" on a host whose
// layout this function does not know is a sentence with no next step in it.
// `userFacing` is what build.js's top-level handler reads to print the message
// without a stack trace - a trace here buries the one line that says what to do.
function missing(tried, why) {
  const err = new Error('no Chromium found – set $PSI_CHROME to a browser executable.\n'
    + (why ? why + '\n' : '')
    + 'Tried:\n  ' + tried.join('\n  '));
  err.userFacing = true;
  throw err;
}
