// Where build.js is.
//
// Packaged, the engine sits unpacked under resources/engine – outside the
// asar, because build.js reaches for three things at run time that an archive
// makes awkward: createRequire for the bundled fonts and the KaTeX
// stylesheet, a dynamic import() for ws, and a WASM load for Shiki's regex
// engine. In development it is the repository root two levels up, which has
// its own node_modules.

const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');

function engineDir() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'engine')
    : path.resolve(__dirname, '..', '..');
}

function buildJsPath() {
  return path.join(engineDir(), 'build.js');
}

// Checked once at startup rather than on the first build, so that a broken
// package says so before somebody has chosen a lecture.
function engineIsPresent() {
  try {
    return fs.statSync(buildJsPath()).isFile();
  } catch {
    return false;
  }
}

module.exports = { engineDir, buildJsPath, engineIsPresent };
