/*
 * Scratch directories that do not outlive the run.
 *
 * Every spec that builds a deck wants a directory to build it into, and for a
 * long time each one called fs.mkdtempSync and walked away. One directory is a
 * megabyte of HTML; the settings spec makes two dozen per run; an agent that
 * runs the suite in a loop makes thirty thousand a day. That filled a terabyte
 * disk to the last 140 MB before anyone looked, and nothing looked large,
 * because no single file was.
 *
 * So a spec asks for its directory here, and the process removes all of them
 * on the way out. An exit hook rather than try/finally around each spec:
 * several specs leave through process.exit(1) on the first failure, which
 * does not unwind the stack, so a finally would not run in exactly the case
 * that leaks the most. The 'exit' event does run then, and on an uncaught
 * exception too.
 *
 * It lives apart from harness.mjs because settings.mjs and the gates never
 * load a browser and should not have to import one to get a directory.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PREFIX = 'psi-';
const STALE_MS = 60 * 60 * 1000;

const dirs = new Set();

function cleanup() {
  for (const dir of dirs) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
  dirs.clear();
}

// A kill -9, or a supervisor's hard timeout, skips every hook there is. What
// such a run left behind is removed by the next one instead. An hour is far
// longer than any spec takes, so a suite running in another terminal keeps
// its directories.
function sweepStale() {
  const root = os.tmpdir();
  const cutoff = Date.now() - STALE_MS;
  let names;
  try { names = fs.readdirSync(root); } catch { return; }
  for (const name of names) {
    if (!name.startsWith(PREFIX)) continue;
    const dir = path.join(root, name);
    try {
      const st = fs.statSync(dir);
      if (st.isDirectory() && st.mtimeMs < cutoff) fs.rmSync(dir, { recursive: true, force: true });
    } catch {}
  }
}

let hooked = false;
function hook() {
  if (hooked) return;
  hooked = true;
  sweepStale();
  process.on('exit', cleanup);
  // Installing a handler replaces the default action, which was to die. So
  // the handler has to do the dying, with the exit code a shell expects.
  for (const [sig, n] of [['SIGINT', 2], ['SIGTERM', 15], ['SIGHUP', 1]]) {
    process.on(sig, () => process.exit(128 + n));
  }
}

/** A fresh directory under the system temp dir, removed when the process exits. */
export function tmpDir(prefix) {
  if (!prefix.startsWith(PREFIX)) throw new Error(`tmpDir: prefix must start with "${PREFIX}", got "${prefix}"`);
  hook();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  dirs.add(dir);
  return dir;
}
