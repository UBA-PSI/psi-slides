// Every command the renderer can give, and nothing else.
//
// There is deliberately no readFile, no writeFile and no spawn passthrough.
// Each handler re-validates its arguments even though the window is the one
// the app opened itself: the renderer displays a file that somebody else may
// have written, and a rule that only holds when the renderer behaves is not
// a rule.

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { ipcMain, dialog, shell, app } = require('electron');

const { resolveSource, checkNewProject, isOutputKind, EXTERNAL_URLS } = require('./validation');
const { buildJsPath } = require('./engine');
const { openInBrowser, describeBrowser } = require('./browsers');

function register(ctx) {
  const { builder, settings } = ctx;

  // ── settings ──────────────────────────────────────────────────────

  // The renderer needs three things beside the settings themselves: the home
  // directory, so that it can shorten a path to `~/…` without knowing the
  // platform; whether this is a development run, so a missing dictionary key
  // can warn; and the version for the settings sheet.
  function settingsPayload() {
    const s = settings.get();
    return {
      ...s,
      recent: s.recent.map(r => ({ ...r, exists: fs.existsSync(r.path) })),
      homedir: require('node:os').homedir(),
      isDev: !app.isPackaged,
      version: app.getVersion(),
    };
  }
  ctx.settingsPayload = settingsPayload;

  const sendSettings = () => {
    const win = ctx.getWindow();
    if (win && !win.isDestroyed()) win.webContents.send('settings', settingsPayload());
  };
  ctx.sendSettings = sendSettings;

  // ── opening a project ─────────────────────────────────────────────

  function openProject(input) {
    const r = resolveSource(input);
    if (!r.ok) return { ok: false, error: r.error, path: String(input || '') };
    builder.setBrowser(describeBrowser(settings.get().browser));
    builder.open(r.source, { serve: settings.get().serve });
    settings.addRecent({ path: r.source, name: r.name });
    sendSettings();
    ctx.rebuildMenu();
    return { ok: true, source: r.source };
  }
  ctx.openProject = openProject;

  function closeProject() {
    builder.close();
    ctx.rebuildMenu();
    return { ok: true };
  }
  ctx.closeProject = closeProject;

  // ── handlers ──────────────────────────────────────────────────────

  // Also the File menu's Open item, which is why it is a function on ctx
  // rather than only a handler.
  async function chooseSource() {
    const win = ctx.getWindow();
    const res = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    });
    if (res.canceled || !res.filePaths.length) return { ok: false, canceled: true };
    return openProject(res.filePaths[0]);
  }
  ctx.chooseSource = chooseSource;

  ipcMain.handle('chooseSource', () => chooseSource());

  ipcMain.handle('openProject', (_e, p) => openProject(p));

  ipcMain.handle('closeProject', () => closeProject());

  ipcMain.handle('chooseFolder', async () => {
    const win = ctx.getWindow();
    const res = await dialog.showOpenDialog(win, {
      properties: ['openDirectory', 'createDirectory'],
    });
    if (res.canceled || !res.filePaths.length) return { ok: false, canceled: true };
    return { ok: true, path: res.filePaths[0] };
  });

  ipcMain.handle('createProject', async (_e, arg) => {
    const name = arg && arg.name;
    const into = arg && arg.into;
    const check = checkNewProject(name, into);
    if (!check.ok) return { ok: false, error: check.error };

    // The template is build.js's own, invoked the same way the command line
    // invokes it. Two copies of a scaffold would drift the first time either
    // side changed, and the app would then create lectures the CLI does not
    // recognise.
    const code = await new Promise((resolve) => {
      const child = spawn(process.execPath, [buildJsPath(), '--new', name, '--into', check.into], {
        cwd: check.into,
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
      let err = '';
      child.stderr.on('data', d => { err += d; });
      child.on('error', () => resolve({ code: -1, err: 'cannot start the build' }));
      child.on('exit', (c) => resolve({ code: c, err }));
    });
    if (code.code !== 0) {
      return { ok: false, error: 'error.openFailed', reason: (code.err || '').trim() || String(code.code) };
    }
    return openProject(check.source);
  });

  ipcMain.handle('buildNow', () => {
    builder.rebuild();
    return { ok: true };
  });

  ipcMain.handle('setAuto', (_e, enabled) => {
    builder.setAuto(!!enabled);
    return { ok: true };
  });

  ipcMain.handle('setServe', (_e, enabled) => {
    const want = !!enabled;
    settings.set({ serve: want });
    sendSettings();
    // --serve is decided when the process starts, so the switch restarts it.
    // Pages that are already open keep talking to a socket that is gone, and
    // the interface says to reload them.
    const st = builder.getState();
    if (st.phase !== 'closed' && st.source) builder.open(st.source, { serve: want });
    return { ok: true };
  });

  ipcMain.handle('openOutput', async (_e, kind) => {
    if (!isOutputKind(kind)) return { ok: false, error: 'error.openFailed' };
    const st = builder.getState();
    if (!st.dir) return { ok: false, error: 'error.openFailed' };
    // The path is built here from the folder the app opened, never taken
    // from the renderer: `kind` is a word from a list of four and the rest
    // is ours.
    const file = path.join(st.dir, `${kind}.html`);
    if (!fs.existsSync(file)) return { ok: false, error: 'outputs.notBuilt' };
    const target = st.serve.enabled && st.serve.url ? `${st.serve.url}/${kind}.html` : file;
    const res = await openInBrowser(target, settings.get().browser);
    if (res && res.ok === false) {
      return { ok: false, error: 'error.openFailed', path: `${kind}.html`, reason: res.reason };
    }
    return { ok: true };
  });

  ipcMain.handle('openSource', async () => {
    const st = builder.getState();
    if (!st.source) return { ok: false, error: 'error.openFailed' };
    const reason = await shell.openPath(st.source);
    if (reason) return { ok: false, error: 'error.openFailed', path: 'source.md', reason };
    return { ok: true };
  });

  ipcMain.handle('showFolder', () => {
    const st = builder.getState();
    if (!st.source) return { ok: false, error: 'error.openFailed' };
    shell.showItemInFolder(st.source);
    return { ok: true };
  });

  ipcMain.handle('getState', () => builder.getState());
  ipcMain.handle('getSettings', () => settingsPayload());

  ipcMain.handle('setLanguage', (_e, lang) => {
    if (lang !== 'de' && lang !== 'en') return { ok: false };
    settings.set({ language: lang });
    sendSettings();
    ctx.rebuildMenu();
    return { ok: true };
  });

  ipcMain.handle('setBrowserPreference', (_e, pref) => {
    if (pref !== 'auto' && pref !== 'default') return { ok: false };
    settings.set({ browser: pref });
    builder.setBrowser(describeBrowser(pref));
    sendSettings();
    return { ok: true };
  });

  ipcMain.handle('removeRecent', (_e, p) => {
    if (typeof p !== 'string') return { ok: false };
    settings.removeRecent(p);
    sendSettings();
    return { ok: true };
  });

  ipcMain.handle('openExternal', (_e, which) => {
    // By name, not by address. Nothing the renderer says ever becomes a URL.
    const url = EXTERNAL_URLS[which];
    if (!url) return { ok: false };
    shell.openExternal(url);
    return { ok: true };
  });
}

module.exports = { register };
