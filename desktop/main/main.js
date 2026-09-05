// The app itself: one window, one project, one build process.
//
// Everything privileged happens here or in the four files beside it. The
// window is sandboxed, has no Node and cannot navigate anywhere; it asks for
// things over the channels in ipc.js and gets a state object back.

const path = require('node:path');
const fs = require('node:fs');
const { app, BrowserWindow, dialog, shell } = require('electron');

const STRINGS = require('../renderer/strings.js');
const { createSettings, languageForLocale } = require('./settings');
const { Builder } = require('./builder');
const { buildJsPath, engineIsPresent } = require('./engine');
const { describeBrowser } = require('./browsers');
const { buildMenu } = require('./menu');
const ipc = require('./ipc');

let win = null;
let settings = null;
let builder = null;
// A path handed to the app before the window exists – macOS fires open-file
// well before `ready` when a document opens the app – waits here.
let pendingOpen = null;
let lastMenuHasProject = null;

// ── one instance ────────────────────────────────────────────────────
//
// Two instances would mean two watch processes on the same folder, two
// recent lists and no answer to which window a dropped file belongs to. A
// second launch hands its file to the running app instead.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  start();
}

// A path from the command line, which is how Windows and Linux pass a
// document to an application. `--` flags and the executable itself are not
// documents, so the last argument that ends in .md is the answer.
function sourceFromArgv(argv) {
  for (let i = argv.length - 1; i >= 1; i--) {
    const a = argv[i];
    if (typeof a === 'string' && !a.startsWith('-') && /\.md$/i.test(a)) return a;
  }
  return null;
}

function t(key) {
  const lang = settings ? settings.get().language : 'en';
  const table = STRINGS[lang] || STRINGS.en;
  return table[key] || STRINGS.en[key] || key;
}

const ctx = {
  get builder() { return builder; },
  get settings() { return settings; },
  getWindow: () => win,
  t,
  rebuildMenu,
  actions: {
    chooseSource: () => ctx.chooseSource && ctx.chooseSource(),
    closeProject: () => ctx.closeProject && ctx.closeProject(),
    buildNow: () => builder && builder.rebuild(),
    command: (name) => { if (win) win.webContents.send('command', { name }); },
    openExternal: (which) => {
      const url = which === 'tutorial'
        ? 'https://uba-psi.github.io/psi-slides/tutorial/audience.html'
        : 'https://uba-psi.github.io/psi-slides/';
      shell.openExternal(url);
    },
  },
};

function rebuildMenu() {
  buildMenu(ctx);
  lastMenuHasProject = builder ? builder.getState().phase !== 'closed' : false;
}

function createWindow() {
  win = new BrowserWindow({
    width: 760,
    height: 600,
    minWidth: 600,
    minHeight: 480,
    show: false,
    title: STRINGS.en['app.name'],
    backgroundColor: '#f7f7f7',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      // The window shows one local page and nothing else; there is no
      // remote content for a spellchecker to see.
      spellcheck: false,
    },
  });

  // Nothing this window shows may open a second window or leave the page it
  // was loaded with. Links to the documentation go through openExternal,
  // which takes a name rather than an address.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());

  win.once('ready-to-show', () => win.show());
  win.on('closed', () => { win = null; });

  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
}

function sendState(state) {
  if (win && !win.isDestroyed()) win.webContents.send('state', state);
  // The File menu greys out Close and Build when nothing is open, so it has
  // to follow the phase.
  const hasProject = state.phase !== 'closed';
  if (hasProject !== lastMenuHasProject) rebuildMenu();
}

function start() {
  app.on('second-instance', (_event, argv) => {
    const p = sourceFromArgv(argv);
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
    if (p) openPath(p);
  });

  // Registered before `ready`, because macOS delivers it before `ready` when
  // a document starts the app.
  app.on('open-file', (event, p) => {
    event.preventDefault();
    openPath(p);
  });

  app.on('window-all-closed', () => {
    // Not just a kill: on macOS the app stays alive with no window, and a
    // state that still said "Ready" would describe a build process that is
    // no longer there. Closing the project is the truthful thing, and the
    // dock icon then reopens the start screen.
    if (builder) builder.close();
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('activate', () => {
    if (!win) createWindow();
  });

  app.on('before-quit', () => {
    if (builder) builder.stop();
  });

  // The belt to before-quit's braces. A crash in the main process still runs
  // exit handlers, and a watch process that outlives the app keeps a folder
  // busy and a port bound with nothing to talk to.
  process.on('exit', () => {
    if (builder) builder.stop();
  });

  app.whenReady().then(() => {
    settings = createSettings(app.getPath('userData'));
    // The system locale decides the first time and never again; after that
    // the setting is the answer, even on a machine that changed its language.
    const stored = settings.get();
    if (!fs.existsSync(settings.file)) {
      settings.set({ language: languageForLocale(app.getLocale()) });
    } else if (stored.language !== 'de' && stored.language !== 'en') {
      settings.set({ language: languageForLocale(app.getLocale()) });
    }

    builder = new Builder({ buildJsPath: buildJsPath(), onState: sendState });
    builder.setBrowser(describeBrowser(settings.get().browser));

    ipc.register(ctx);
    rebuildMenu();
    createWindow();

    if (!engineIsPresent()) {
      // A packaging fault rather than anything the person did, but it has to
      // be said in words rather than as a build that never starts.
      dialog.showErrorBox(t('app.name'), t('error.engineMissing'));
    }

    const fromArgv = sourceFromArgv(process.argv);
    if (fromArgv) openPath(fromArgv);
    else if (pendingOpen) { const p = pendingOpen; pendingOpen = null; openPath(p); }
  });
}

// Opening from outside the window – the dock, a drop on the app icon, the
// command line – goes through the same validation as a click inside it.
function openPath(p) {
  if (!builder || !ctx.openProject) { pendingOpen = p; return; }
  const res = ctx.openProject(p);
  if (!res.ok && win) win.webContents.send('command', { name: 'openFailed', error: res.error, path: p });
}
