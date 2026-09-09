// The whole of what the window can reach. One function per IPC channel, two
// subscriptions and one file-path lookup – there is no general invoke, so a
// channel that is not named here does not exist for the renderer.
//
// pathForFile is the reason this file needs webUtils: a sandboxed renderer
// no longer sees File.path, and the drop target would otherwise have nothing
// to hand to openProject.

const { contextBridge, ipcRenderer, webUtils } = require('electron');

const call = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

function subscribe(channel, cb) {
  const listener = (_event, payload) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('builder', {
  chooseSource: () => call('chooseSource'),
  openProject: (p) => call('openProject', p),
  closeProject: () => call('closeProject'),
  createProject: (opts) => call('createProject', opts),
  chooseFolder: () => call('chooseFolder'),
  buildNow: () => call('buildNow'),
  setAuto: (enabled) => call('setAuto', enabled),
  setServe: (enabled) => call('setServe', enabled),
  openOutput: (kind) => call('openOutput', kind),
  openSource: () => call('openSource'),
  showFolder: () => call('showFolder'),
  getState: () => call('getState'),
  getSettings: () => call('getSettings'),
  setLanguage: (lang) => call('setLanguage', lang),
  setBrowserPreference: (pref) => call('setBrowserPreference', pref),
  removeRecent: (p) => call('removeRecent', p),
  openExternal: (which) => call('openExternal', which),

  onState: (cb) => subscribe('state', cb),
  onSettings: (cb) => subscribe('settings', cb),
  // Menu items that open something inside the window – the new-lecture form
  // and the settings sheet – arrive this way rather than as a second copy of
  // the interface in the main process.
  onCommand: (cb) => subscribe('command', cb),

  pathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return '';
    }
  },
});
