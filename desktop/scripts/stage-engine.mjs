// Stages the engine into desktop/engine/, which electron-builder copies into
// the package as resources/engine – outside the asar, because build.js
// reaches for three things at run time that an archive makes awkward:
// createRequire for the bundled fonts and the KaTeX stylesheet, a dynamic
// import() for ws, and a WASM load for Shiki's regex engine.
//
// What is copied is what the engine reads about itself: build.js plus the
// four files it splices in at run time over import.meta.url, and the
// package.json and lockfile that decide the dependency tree. Everything else
// in the repository – the lectures, the tests, the site – is not the engine.
//
// Run: npm run stage-engine   (from desktop/, and by npm run dist)

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const desktop = path.resolve(here, '..');
const repo = path.resolve(desktop, '..');
const engine = path.join(desktop, 'engine');

const FILES = [
  'build.js',
  'diagram-core.mjs',
  'tails.mjs',
  'editor.mjs',
  'editor.css',
  'package.json',
  'package-lock.json',
  'LICENSE',
];

// Wiped rather than updated: a stale file in here would ship, and nothing
// downstream would notice that it did not come from this checkout.
fs.rmSync(engine, { recursive: true, force: true });
fs.mkdirSync(engine, { recursive: true });

for (const name of FILES) {
  const from = path.join(repo, name);
  if (!fs.existsSync(from)) {
    console.error(`stage-engine: ${name} is missing from the repository root.`);
    process.exit(1);
  }
  fs.copyFileSync(from, path.join(engine, name));
}
console.log(`staged ${FILES.length} files into engine/`);

// --omit=dev because the app never runs the browser suite; --ignore-scripts
// because nothing in this tree has an install script worth running and a
// packaging step should not execute code it did not ask for.
const install = spawnSync('npm', ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], {
  cwd: engine,
  stdio: 'inherit',
  shell: process.platform === 'win32', // npm is a .cmd there and has no other entry point
});
if (install.status !== 0) {
  console.error('stage-engine: npm ci failed in engine/.');
  process.exit(install.status || 1);
}

// ── licences ────────────────────────────────────────────────────────
//
// The plan is explicit that the licence and notice files of everything
// bundled have to be in the distribution artefact. The fonts are the reason
// it matters most: over twenty megabytes of this tree is OFL-licensed type,
// and that licence asks to travel with the files.
const LICENCE_RE = /^(LICEN[CS]E|COPYING|NOTICE)/i;
const modules = path.join(engine, 'node_modules');
const out = path.join(engine, 'THIRD-PARTY-LICENSES');
fs.mkdirSync(out, { recursive: true });

function packageDirs() {
  const dirs = [];
  for (const entry of fs.readdirSync(modules, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === '.bin') continue;
    if (entry.name.startsWith('@')) {
      const scope = path.join(modules, entry.name);
      for (const inner of fs.readdirSync(scope, { withFileTypes: true })) {
        if (inner.isDirectory()) dirs.push([`${entry.name}/${inner.name}`, path.join(scope, inner.name)]);
      }
    } else {
      dirs.push([entry.name, path.join(modules, entry.name)]);
    }
  }
  return dirs;
}

let collected = 0;
for (const [name, dir] of packageDirs()) {
  const files = fs.readdirSync(dir, { withFileTypes: true })
    .filter(f => f.isFile() && LICENCE_RE.test(f.name));
  if (!files.length) continue;
  const dest = path.join(out, name);
  fs.mkdirSync(dest, { recursive: true });
  for (const f of files) {
    fs.copyFileSync(path.join(dir, f.name), path.join(dest, f.name));
    collected++;
  }
}
console.log(`collected ${collected} licence files from ${packageDirs().length} packages`);

// ── size ────────────────────────────────────────────────────────────

function measure(dir) {
  let bytes = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) bytes += measure(p);
    else if (entry.isFile()) bytes += fs.statSync(p).size;
  }
  return bytes;
}
const mb = measure(engine) / (1024 * 1024);
console.log(`engine/ is ${mb.toFixed(1)} MB`);
