// Which browser the four views open in, and how.
//
// The README of psi-slides says the views are developed and presented in
// Chrome; Safari and Firefox are untested rather than unsupported. On the
// machine of the person this app is for, the default browser is often Safari,
// and three things that are only checked in Chrome meet there at once:
// file:// pages, the live-reload WebSocket and the window.opener sync between
// the presentation and the cockpit. So the app looks for Chrome, then Edge,
// then Chromium, and falls back to the default browser while saying so.
// The setting "always the default browser" turns the search off.

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

// Ordered by preference, not alphabetically: Chrome is the browser the views
// are tested in, Edge is the same engine, Chromium is the same engine again
// without the branding.
function candidates() {
  if (process.platform === 'darwin') {
    const home = process.env.HOME || '';
    return [
      { kind: 'chrome', name: 'Google Chrome', at: '/Applications/Google Chrome.app' },
      { kind: 'chrome', name: 'Google Chrome', at: path.join(home, 'Applications/Google Chrome.app') },
      { kind: 'edge', name: 'Microsoft Edge', at: '/Applications/Microsoft Edge.app' },
      { kind: 'edge', name: 'Microsoft Edge', at: path.join(home, 'Applications/Microsoft Edge.app') },
      { kind: 'chromium', name: 'Chromium', at: '/Applications/Chromium.app' },
      { kind: 'chromium', name: 'Chromium', at: path.join(home, 'Applications/Chromium.app') },
    ];
  }
  if (process.platform === 'win32') {
    const pf = process.env['ProgramFiles'] || 'C:\\Program Files';
    const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    const local = process.env['LOCALAPPDATA'] || '';
    return [
      { kind: 'chrome', name: 'Google Chrome', at: path.join(pf, 'Google\\Chrome\\Application\\chrome.exe') },
      { kind: 'chrome', name: 'Google Chrome', at: path.join(pf86, 'Google\\Chrome\\Application\\chrome.exe') },
      { kind: 'chrome', name: 'Google Chrome', at: local ? path.join(local, 'Google\\Chrome\\Application\\chrome.exe') : '' },
      { kind: 'edge', name: 'Microsoft Edge', at: path.join(pf86, 'Microsoft\\Edge\\Application\\msedge.exe') },
      { kind: 'edge', name: 'Microsoft Edge', at: path.join(pf, 'Microsoft\\Edge\\Application\\msedge.exe') },
    ];
  }
  // Linux: the binaries are on PATH, and which one is there varies by
  // distribution more than by preference.
  return [
    { kind: 'chrome', name: 'Google Chrome', bin: 'google-chrome' },
    { kind: 'chrome', name: 'Google Chrome', bin: 'google-chrome-stable' },
    { kind: 'edge', name: 'Microsoft Edge', bin: 'microsoft-edge' },
    { kind: 'chromium', name: 'Chromium', bin: 'chromium' },
    { kind: 'chromium', name: 'Chromium', bin: 'chromium-browser' },
  ];
}

// A PATH lookup without a shell. `which` would be one word, but it is also a
// command, and the rule for this app is that a file name is never handed to
// something that could read it as a command.
function onPath(bin) {
  const dirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  for (const d of dirs) {
    const p = path.join(d, bin);
    try {
      fs.accessSync(p, fs.constants.X_OK);
      return p;
    } catch { /* not here, try the next entry */ }
  }
  return null;
}

let cached = null;

function findBrowser() {
  if (cached !== null) return cached;
  cached = null;
  for (const c of candidates()) {
    if (c.at) {
      if (c.at && fs.existsSync(c.at)) { cached = { ...c, exe: c.at }; return cached; }
    } else if (c.bin) {
      const exe = onPath(c.bin);
      if (exe) { cached = { ...c, exe }; return cached; }
    }
  }
  cached = false;
  return cached;
}

// What the project screen reports. `default` is the case the browser hint
// exists for.
function describeBrowser(preference) {
  if (preference === 'default') return { kind: 'default', name: '' };
  const found = findBrowser();
  if (!found) return { kind: 'default', name: '' };
  return { kind: found.kind, name: found.name };
}

// `target` is either an absolute file path or an http address. The `shell`
// module is required lazily so that this file can be loaded in a test
// without Electron.
function openInBrowser(target, preference) {
  const { shell } = require('electron');
  const isUrl = /^https?:\/\//.test(target);
  const found = preference === 'default' ? null : findBrowser();

  if (found) {
    try {
      if (process.platform === 'darwin') {
        // `open -a` rather than spawning the executable inside the bundle:
        // it reuses a running instance, which is what a person expects when
        // they click Cockpit after Presentation.
        spawn('open', ['-a', found.exe, target], { stdio: 'ignore', detached: true }).unref();
      } else {
        spawn(found.exe, [target], { stdio: 'ignore', detached: true }).unref();
      }
      return { ok: true };
    } catch {
      // Falls through to the default browser below. A browser that is on
      // disk but will not start is not worth a dialog of its own.
    }
  }

  const url = isUrl ? target : require('node:url').pathToFileURL(target).href;
  return shell.openExternal(url).then(() => ({ ok: true }), (err) => ({
    ok: false, reason: String(err && err.message ? err.message : err),
  }));
}

module.exports = { findBrowser, describeBrowser, openInBrowser };
