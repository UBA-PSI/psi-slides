// The rules that decide whether a value from the renderer may become an
// action. They live in their own file with no Electron import for two
// reasons: the unit tests can require them without a display, and a rule
// that is hard to reach is a rule somebody re-implements inline.
//
// Nothing here trusts its argument. Every one of these is called on a value
// that arrived over IPC, and the renderer is only as trustworthy as the
// Markdown file somebody dropped on it.

const fs = require('node:fs');
const path = require('node:path');

// The same expression build.js uses for `--new <slug>`, and deliberately so:
// the app hands the name straight to that command, so a name this accepts
// and build.js refuses would be an error the person never asked for.
const PROJECT_NAME_RE = /^[a-z][a-z0-9-]*$/;

function isValidProjectName(name) {
  return typeof name === 'string' && name.length > 0 && name.length <= 64
    && PROJECT_NAME_RE.test(name);
}

// The four views, as the renderer may name them. A kind is a word from this
// list or nothing – the file path is built here from the project folder, so
// the renderer never gets to say which file is opened.
const OUTPUT_KINDS = ['audience', 'speaker', 'print', 'print-notes'];

function isOutputKind(kind) {
  return OUTPUT_KINDS.includes(kind);
}

// The two addresses the Help menu and the start screen may open, by name
// rather than by URL, so that no string from the renderer ever reaches
// shell.openExternal.
const EXTERNAL_URLS = {
  docs: 'https://uba-psi.github.io/psi-slides/',
  tutorial: 'https://uba-psi.github.io/psi-slides/tutorial/audience.html',
};

// Resolves a path the person chose, dropped or clicked in the recent list
// into the project it names. `error` is a strings.js key, because whatever
// refuses here is shown to a reader, not logged.
//
// The realpath is what gets stored and displayed: the plan asks for the real
// path so that a project reached through a symlink is honest about where its
// files are.
function resolveSource(input) {
  if (typeof input !== 'string' || input.trim() === '') {
    return { ok: false, error: 'error.notMarkdown' };
  }
  if (!/\.md$/i.test(input)) {
    return { ok: false, error: 'error.notMarkdown' };
  }
  let real;
  try {
    real = fs.realpathSync(input);
  } catch {
    return { ok: false, error: 'error.unreadable' };
  }
  // The extension is checked again on the resolved path: a symlink called
  // `deck.md` may point at anything at all.
  if (!/\.md$/i.test(real)) {
    return { ok: false, error: 'error.notMarkdown' };
  }
  try {
    const st = fs.statSync(real);
    if (!st.isFile()) return { ok: false, error: 'error.unreadable' };
    fs.accessSync(real, fs.constants.R_OK);
  } catch {
    return { ok: false, error: 'error.unreadable' };
  }
  const dir = path.dirname(real);
  return { ok: true, source: real, dir, name: path.basename(dir) };
}

// `into` must be a directory that exists, and `into/name` must not. Both are
// checked here rather than left to build.js, because build.js answers with an
// exit code and the form wants a sentence beside the field.
function checkNewProject(name, into) {
  if (!isValidProjectName(name)) return { ok: false, error: 'new.badName' };
  if (typeof into !== 'string' || into.trim() === '') {
    return { ok: false, error: 'new.noFolder' };
  }
  let realInto;
  try {
    realInto = fs.realpathSync(into);
    if (!fs.statSync(realInto).isDirectory()) return { ok: false, error: 'new.noFolder' };
  } catch {
    return { ok: false, error: 'new.noFolder' };
  }
  const dest = path.join(realInto, name);
  if (fs.existsSync(dest)) return { ok: false, error: 'new.exists' };
  return { ok: true, into: realInto, dest, source: path.join(dest, 'source.md') };
}

module.exports = {
  PROJECT_NAME_RE, OUTPUT_KINDS, EXTERNAL_URLS,
  isValidProjectName, isOutputKind, resolveSource, checkNewProject,
};
