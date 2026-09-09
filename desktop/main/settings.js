// Settings and the recent list, as one JSON file in the app's own userData
// folder. No electron-store and no database: four keys and a list of ten
// paths do not need one, and every dependency here is a dependency the audit
// has to cover.
//
// The directory is a constructor argument rather than app.getPath('userData')
// read inside, so that the tests can round-trip through a temporary folder
// without Electron.

const fs = require('node:fs');
const path = require('node:path');

const RECENT_MAX = 10;

const DEFAULTS = {
  language: 'en',
  browser: 'auto',
  recent: [],
  serve: false,
};

// Anything read from disk is treated as a stranger. A file somebody hand-
// edited, or one a crash left half-written, must give the person a working
// app with default settings rather than a window that never appears.
function normalise(raw) {
  const out = { ...DEFAULTS, recent: [] };
  if (!raw || typeof raw !== 'object') return out;
  if (raw.language === 'de' || raw.language === 'en') out.language = raw.language;
  if (raw.browser === 'auto' || raw.browser === 'default') out.browser = raw.browser;
  out.serve = !!raw.serve;
  if (Array.isArray(raw.recent)) {
    const seen = new Set();
    for (const entry of raw.recent) {
      if (!entry || typeof entry !== 'object') continue;
      if (typeof entry.path !== 'string' || entry.path === '') continue;
      if (seen.has(entry.path)) continue;
      seen.add(entry.path);
      out.recent.push({
        path: entry.path,
        name: typeof entry.name === 'string' && entry.name ? entry.name : path.basename(path.dirname(entry.path)),
        openedAt: Number.isFinite(entry.openedAt) ? entry.openedAt : 0,
      });
      if (out.recent.length >= RECENT_MAX) break;
    }
  }
  return out;
}

// `de` for a German system, English for everything else. The plan's E7: the
// locale decides once, the setting decides afterwards.
function languageForLocale(locale) {
  return typeof locale === 'string' && locale.toLowerCase().startsWith('de') ? 'de' : 'en';
}

function createSettings(dir) {
  const file = path.join(dir, 'settings.json');
  let data = DEFAULTS;

  function load() {
    try {
      data = normalise(JSON.parse(fs.readFileSync(file, 'utf8')));
    } catch {
      // Missing is the first start and corrupt is a bad day; both mean the
      // same thing here, and neither is worth a dialog.
      data = normalise(null);
    }
    return data;
  }

  function save() {
    // Write beside the file and rename over it, so that a crash during the
    // write leaves the previous settings rather than half of the new ones.
    try {
      fs.mkdirSync(dir, { recursive: true });
      const tmp = file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
      fs.renameSync(tmp, file);
    } catch {
      // Settings that cannot be written are a smaller problem than an app
      // that refuses to run, so this is deliberately silent.
    }
  }

  load();

  return {
    file,
    get() { return { ...data, recent: data.recent.map(r => ({ ...r })) }; },
    set(patch) {
      data = normalise({ ...data, ...patch });
      save();
      return this.get();
    },
    addRecent(entry) {
      const rest = data.recent.filter(r => r.path !== entry.path);
      data.recent = [{ path: entry.path, name: entry.name, openedAt: Date.now() }, ...rest]
        .slice(0, RECENT_MAX);
      save();
      return this.get();
    },
    removeRecent(p) {
      data.recent = data.recent.filter(r => r.path !== p);
      save();
      return this.get();
    },
    reload: load,
  };
}

module.exports = { createSettings, normalise, languageForLocale, DEFAULTS, RECENT_MAX };
