/*
 * The command table in commands.mjs, the key map that dispatches from it,
 * and the ? panel rendered from it.
 *
 * The keys of the live views used to be two hand-kept lists - the cases of a
 * switch in AUDIENCE_JS and the rows of renderHelpOverlay - and they drifted
 * the way such pairs do: the audience's own N, the cockpit's Shift-W, the
 * go-to prompt's Backspace and four of the editor's keys were answered and
 * listed nowhere. Now a key is bound by an entry of COMMANDS, the panel's
 * row is rendered from the same entry, and the listener looks the press up in
 * keyMap(VIEW) and runs COMMAND_RUN[id]. What this gate holds, without a
 * browser and without build.js's dependencies:
 *
 *   - **The keys of before.** PRESSES is every press the switch answered when
 *     the table replaced it, per view, with the command it meant - taken from
 *     the switch's cases once, and the fixture this refactor was proved
 *     against. Each press is put through the page's own lookup
 *     (commandFor(keyMap(view), e)), so a key that drops out, moves to
 *     another command or starts answering where it did not fails here.
 *   - **A run function for every command a view answers**, read out of the
 *     literals the view is built from as text: the COMMAND_RUN object in
 *     AUDIENCE_JS, and the COMMAND_RUN['id'] assignments in SPEAKER_JS and
 *     SOUFFLEUSE_JS for the cockpit. A run function for an id the table does
 *     not have fails too. The prompter's command is the one exception the
 *     table states itself: it requires the prompter, and its run function
 *     ships only with it.
 *   - **The table's own rules** - one key, one command per view; every
 *     requires, reach, when and context a known word - are asserted by
 *     commands.mjs at load, so importing it is the check; the gate also
 *     proves the assertion can fire.
 *   - **Every key the view answers has a row in its panel**, and every key a
 *     command's row spells is one that command (or a command listed in its
 *     row) answers. The help half is the real thing: renderHelpOverlay is
 *     lifted out of build.js as text and run with helpGroups, and every <dt>
 *     is turned into the key combinations its kbd elements spell -
 *     Shift-C F A L is four shifted letters, Ctrl/Cmd-Shift-Z one chord,
 *     1–9 nine digits. The handler half is the table plus what the guards
 *     before the lookup still answer in code: the overview board's arrows,
 *     the search field's keys, the Alt that starts a selection - every e.key
 *     comparison in AUDIENCE_JS (and, for the cockpit, SPEAKER_JS and
 *     SOUFFLEUSE_JS). The editor's keys are read out of editor.mjs and held
 *     against the editor's own section, since its F and the slide's F are
 *     two keys.
 *
 *   - **The panel as a palette, and the start menu.** A row names its
 *     command on the dt only where runsFromPanel says the panel may run it -
 *     every command but the panel's own, never a doc row; the runnable rows
 *     stand before every other row, so the arrows skip none;
 *     both panels list Ctrl/Cmd-K; the listener answers Cmd-K before the
 *     field's keys and before the guard that hands chords to the browser.
 *     renderStartMenu is lifted out as text like renderHelpOverlay: its
 *     three buttons are START_MENU, run by the audience, spliced into one
 *     view.
 *
 * Not read: gotoKey, which is modal and whose Enter / Esc / digits the prompt
 * names on its own foot; the editor's arrow nudge, a startsWith written as
 * prose in its row; and the documents, whose reader keys are the
 * reader-help-keys string.
 *
 * NOT_A_ROW is the reviewed list of keys that are answered and deliberately
 * have no row, each with its reason. An entry that stops being answered, or
 * that gains a row, fails here too, so the list cannot rot into a blanket.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './harness.mjs';
import * as CMD from '../../commands.mjs';

export const name = 'the command table, the key map that dispatches from it, and the ? panel rendered from it';

const NOT_A_ROW = {
  audience: {
    'k': 'the cue cards are the cockpit\'s; the audience spends the press on nothing, as its switch did',
    '=': 'the unshifted spelling of + on a US layout, one physical key',
    '_': 'the shifted spelling of -, one physical key',
  },
  speaker: {
    '=': 'the unshifted spelling of + on a US layout, one physical key',
    '_': 'the shifted spelling of -, one physical key',
  },
  editor: {},
};

// Every press the switch in AUDIENCE_JS answered when the table replaced it,
// as Playwright would spell it, and the command it meant in the audience and
// in the cockpit (null: not answered there). A shifted letter arrives as an
// upper-case e.key with shiftKey set; ? # + _ arrive with Shift held. The
// last rows are the presses the switch let through and the table must too.
const PRESSES = [
  [' ', 'forward', 'forward'], ['ArrowDown', 'forward', 'forward'],
  ['Enter', 'forward', 'forward'], ['PageDown', 'forward', 'forward'],
  ['ArrowRight', 'forward', 'forward'], ['Shift+ ', 'forward', 'forward'],
  ['ArrowUp', 'back', 'back'], ['PageUp', 'back', 'back'],
  ['Backspace', 'back', 'back'], ['ArrowLeft', 'back', 'back'],
  ['Shift+ArrowRight', 'next-column', 'next-column'], ['Shift+ArrowLeft', 'prev-column', 'prev-column'],
  ...'123456789'.split('').map((d) => [d, 'expansion', 'expansion']),
  ['Escape', 'escape', 'escape'], ['Shift+Escape', 'escape', 'escape'],
  ['n', 'annotate', 'annotate'], ['Shift+N', 'annotate', 'notes-pane'],
  ['c', 'collapse', 'collapse'], ['Shift+C', 'collapse-back', 'collapse-back'],
  ['f', 'font', 'font'], ['Shift+F', 'font-back', 'font-back'],
  ['a', 'theme', 'theme'], ['Shift+A', 'theme-back', 'theme-back'],
  ['l', 'slide-numbers', 'slide-numbers'], ['Shift+L', 'slide-numbers-back', 'slide-numbers-back'],
  ['m', 'note-button', 'note-button'], ['Shift+M', 'note-button', 'note-button'],
  ['o', 'overview', 'overview'], ['Shift+O', 'overview', 'overview'],
  ['k', 'cue-cards', 'cue-cards'], ['Shift+K', 'cue-cards', 'cue-cards'],
  ['t', 'toc', 'toc'], ['g', 'goto', 'goto'], ['/', 'search', 'search'],
  ['Shift+#', 'auto-fit', 'auto-fit'],
  ['Shift++', 'zoom-in', 'zoom-in'], ['=', 'zoom-in', 'zoom-in'],
  ['-', 'zoom-out', 'zoom-out'], ['Shift+_', 'zoom-out', 'zoom-out'], ['0', 'zoom-reset', 'zoom-reset'],
  ['b', 'blank', 'blank'], ['Shift+B', 'blank', 'blank'],
  ['w', 'fullscreen', 'fullscreen'], ['Shift+W', 'fullscreen', 'fullscreen-window'],
  ['p', 'print', 'print'], ['d', 'demo', 'demo'],
  ['Shift+E', 'export-annotations', 'export-annotations'],
  ['s', 'cockpit', null], ['Shift+S', 'cockpit', 'prompter'],
  ['v', null, 'freeze'], ['Shift+V', null, 'preview-orientation'],
  ['Shift+?', 'help', 'help'],
  // Let through then, let through now.
  ['e', null, null], ['x', null, null], ['Tab', null, null],
];
// The one key this slice added: a presenter remote's black-screen key.
const ADDED = [['.', 'blank', 'blank']];

function press(spec) {
  const shift = spec.startsWith('Shift+') && spec.length > 6;
  const key = shift ? spec.slice(6) : spec;
  return { key: shift && key.length === 1 ? key.toUpperCase() : key, shiftKey: shift };
}

// ── the help half ──────────────────────────────────────────────────

const MODS = {
  shift: 'shift', 'ctrl/cmd': 'mod', ctrl: 'mod', cmd: 'mod',
  alt: 'alt', option: 'alt', 'alt/option': 'alt',
};
// What a modifier written alone in the key column means: holding it, which
// is the e.key name of the modifier itself.
const LONE_MOD = { shift: 'shift', mod: 'control', alt: 'alt' };
const GLYPH = {
  '↑': 'arrowup', '↓': 'arrowdown', '←': 'arrowleft', '→': 'arrowright',
  space: ' ', esc: 'escape', '−': '-',
};
const decode = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&minus;/g, '−').replace(/&amp;/g, '&').replace(/<[^>]+>/g, '').trim();
export function normKey(k) {
  const low = String(k).toLowerCase();
  return GLYPH[low] ?? GLYPH[k] ?? low;
}
const combo = (mods, key) => [...new Set(mods)].sort().concat(normKey(key)).join('+');

export function dtCombos(dt) {
  const expanded = dt.replace(/<kbd>(\d)<\/kbd>–<kbd>(\d)<\/kbd>/g, (m, a, b) => {
    let out = '';
    for (let d = +a; d <= +b; d++) out += '<kbd>' + d + '</kbd> ';
    return out;
  });
  const out = [];
  for (const part of expanded.split('·')) {
    const kbds = [...part.matchAll(/<kbd>([\s\S]*?)<\/kbd>/g)].map((m) => decode(m[1]));
    const mods = [];
    let i = 0;
    while (i < kbds.length && MODS[kbds[i].toLowerCase()]) mods.push(MODS[kbds[i++].toLowerCase()]);
    // Alt/option is written as two kbds with a slash between them.
    const keys = kbds.slice(i);
    if (!keys.length) { for (const m of mods) out.push(LONE_MOD[m]); continue; }
    for (const k of keys) out.push(combo(mods, k));
  }
  return out;
}

export function helpSections(html) {
  return [...html.matchAll(/<section( class="help-ref")?>\s*<h3>([\s\S]*?)<\/h3>([\s\S]*?)<\/section>/g)].map((m) => ({
    ref: !!m[1],
    title: m[2],
    rows: [...m[3].matchAll(/<dt([^>]*)>/g)].map((d) => (d[1].match(/data-cmd="([a-z0-9-]+)"/) || [])[1] || null),
    combos: [...m[3].matchAll(/<dt(?: [^>]*)?>([\s\S]*?)<\/dt>/g)].flatMap((d) => dtCombos(d[1])),
  }));
}

function loadRenderer(buildJs) {
  const start = buildJs.indexOf('function renderHelpOverlay(');
  const end = buildJs.indexOf('\n}\n', start);
  if (start < 0 || end < 0) throw new Error('renderHelpOverlay not found in build.js');
  const src = buildJs.slice(start, end + 2);
  const STRINGS = { en: { 'help-search': 'find', 'help-none': 'none' } };
  // eslint-disable-next-line no-new-func
  return new Function('STRINGS', 'escapeHtml', 'helpGroups', src + '\nreturn renderHelpOverlay;')(
    STRINGS, (s = '') => String(s), CMD.helpGroups);
}

// { main: Set, editor: Set } of the combos a view's panel lists.
function listed(render, view) {
  const withEd = helpSections(render(view, true, true));
  const without = new Set(helpSections(render(view, false, true)).map((s) => s.title));
  const main = new Set(), editor = new Set();
  for (const s of withEd) for (const c of s.combos) (without.has(s.title) ? main : editor).add(c);
  return { main, editor };
}

// ── the handler half ───────────────────────────────────────────────

function literal(text, name) {
  const open = 'const ' + name + ' = `';
  const start = text.indexOf(open);
  const end = text.indexOf('\n`;', start);
  if (start < 0 || end < 0) throw new Error(name + ' not found in build.js');
  return text.slice(start + open.length, end);
}
const stripComment = (line) => line.replace(/(^|\s)\/\/.*$/, '');

// The case labels of what switch is left in the listener: the overview
// board's arrows.
export function switchKeys(listener) {
  const out = new Set();
  for (const raw of listener.split('\n')) {
    for (const m of stripComment(raw).matchAll(/\bcase '((?:\\'|[^'])+)':/g)) out.add(normKey(m[1].replace(/\\'/g, "'")));
  }
  return out;
}

function comparedKeys(text) {
  return [...text.matchAll(/\be\.key\s*[!=]==\s*'((?:\\'|[^'])+)'/g)].map((m) => normKey(m[1].replace(/\\'/g, "'")));
}

function withoutFunction(text, head) {
  const start = text.indexOf(head);
  if (start < 0) return text;
  const end = text.indexOf('\n}\n', start);
  return text.slice(0, start) + text.slice(end + 2);
}

// The ids COMMAND_RUN answers in one literal: the keys of the object in
// AUDIENCE_JS, the assignments into it elsewhere.
function runIds(text) {
  const ids = new Set();
  const open = text.indexOf('const COMMAND_RUN = {\n');
  if (open >= 0) {
    const close = text.indexOf('\n};\n', open);
    for (const m of text.slice(open, close).matchAll(/^ {2}'([a-z0-9-]+)': \(e\) =>/gm)) ids.add(m[1]);
  }
  for (const m of text.matchAll(/COMMAND_RUN\['([a-z0-9-]+)'\] = \(e\) =>/g)) ids.add(m[1]);
  return ids;
}

function editorKeys(editorJs) {
  const out = new Set();
  const start = editorJs.indexOf('function dgeKeydown(ev) {');
  const end = editorJs.indexOf('\n}\n', start);
  if (start < 0 || end < 0) throw new Error('dgeKeydown not found in editor.mjs');
  let inMod = false;
  for (const raw of editorJs.slice(start, end).split('\n')) {
    const line = stripComment(raw);
    if (/^\s*if \(mod\) \{/.test(line)) { inMod = true; continue; }
    if (inMod && /^ {2}\}\s*$/.test(line)) { inMod = false; continue; }
    const chord = inMod || /ctrlKey|metaKey/.test(line);
    for (const m of line.matchAll(/toLowerCase\(\) === '(.)'/g)) {
      if (!chord) continue;
      out.add('mod+' + m[1]);
      if (/\bev\.shiftKey\b/.test(line)) out.add('mod+shift+' + m[1]);
    }
    if (inMod) continue;
    for (const m of line.matchAll(/\b(?:k|key|ev\.key) === '((?:\\'|[^'])+)'/g)) {
      const k = normKey(m[1]);
      if (/&&\s*ev\.shiftKey\b/.test(line)) { out.add('shift+' + k); continue; }
      out.add(k);
      if (/\bev\.shiftKey\b/.test(line)) out.add('shift+' + k);
    }
  }
  const tools = editorJs.slice(editorJs.indexOf('const DGE_TOOLS = ['));
  for (const m of tools.slice(0, tools.indexOf('];')).matchAll(/keys: \[([^\]]*)\]/g)) {
    for (const k of m[1].matchAll(/'([^']+)'/g)) out.add(normKey(k[1]));
  }
  // The slide binding that opens the editor on a focused figure.
  if (/ev\.key !== 'e' && ev\.key !== 'E'/.test(editorJs)) out.add('e');
  return out;
}

// ── the gate ───────────────────────────────────────────────────────

function missing(answered, rows, allowed) {
  return [...answered].filter((k) => !rows.has(k) && !(k in allowed)).sort();
}

export async function run({ report }) {
  const { ok, note } = report;
  const buildJs = fs.readFileSync(path.join(ROOT, 'build.js'), 'utf8');
  const editorJs = fs.readFileSync(path.join(ROOT, 'editor.mjs'), 'utf8');
  const render = loadRenderer(buildJs);

  const A = literal(buildJs, 'AUDIENCE_JS');
  const S = literal(buildJs, 'SPEAKER_JS');
  const P = literal(buildJs, 'SOUFFLEUSE_JS');

  // ── the table ──
  const commands = CMD.COMMANDS.filter((c) => c.keys);
  ok(commands.length > 30, 'the table has more than thirty commands', String(commands.length));
  // The load-time assertion has to be able to fire: a copy of the table with
  // one key bound twice is refused by the same code, evaluated again.
  const src = fs.readFileSync(path.join(ROOT, 'commands.mjs'), 'utf8');
  const twice = src.replace("keys: ['d'],", "keys: ['b'],");
  ok(twice !== src, 'the D binding is found in commands.mjs');
  let refused = '';
  try {
    // eslint-disable-next-line no-new-func
    new Function(twice.replace(/^export\s+/gm, ''))();
  } catch (err) { refused = err.message; }
  ok(/in the audience view b is bound to blank and to demo/.test(refused),
    'and a table binding B twice is refused at load', refused || 'not refused');
  ok(/const COMMAND_KEYS = PSI_COMMANDS\.keyMap\(VIEW\);/m.test(A)
    && /const id = PSI_COMMANDS\.commandFor\(COMMAND_KEYS, e\);\n\s*if \(id && COMMAND_RUN\[id\]\) COMMAND_RUN\[id\]\(e\);/.test(A),
  'the key map looks a press up in the table and runs COMMAND_RUN, and nothing else');
  ok(!/^\s*switch \(e\.key\) \{\s*\n\s*\/\/ Forward and back/m.test(A), 'the old switch is gone');
  ok(/window\.PSI_COMMANDS = \(function \(\) \{/.test(buildJs) && (buildJs.match(/\$\{commandsJs\(\)\}/g) || []).length === 2,
    'the table is spliced into both live views as window.PSI_COMMANDS');

  // ── the keys of before ──
  for (const [i, view] of CMD.VIEWS.entries()) {
    const map = CMD.keyMap(view);
    const wrong = [];
    for (const row of [...PRESSES, ...ADDED]) {
      const got = CMD.commandFor(map, press(row[0]));
      if (got !== row[1 + i]) wrong.push(`${row[0]} -> ${got} (was ${row[1 + i]})`);
    }
    ok(wrong.length === 0, `every press the ${view} view answered still means what it meant`, wrong.join('; '));
  }

  // ── a run function for every command ──
  const runA = runIds(A);
  const runS = new Set([...runA, ...runIds(S)]);
  const runP = runIds(P);
  ok(runA.size > 25, 'COMMAND_RUN is found in AUDIENCE_JS', String(runA.size));
  const ids = new Set(CMD.COMMANDS.map((c) => c.id));
  const stray = [...runA, ...runIds(S), ...runP].filter((id) => !ids.has(id));
  ok(stray.length === 0, 'every run function is for a command the table has', stray.join(', '));
  for (const view of CMD.VIEWS) {
    const have = view === 'speaker' ? runS : runA;
    const noRun = commands.filter((c) => c.views.includes(view))
      .filter((c) => !(have.has(c.id) || (c.requires === 'prompter' && runP.has(c.id))))
      .map((c) => c.id);
    ok(noRun.length === 0, `every command the ${view} view answers has a run function there`, noRun.join(', '));
  }
  ok(runP.has('prompter') && !runS.has('prompter'), 'the prompter\'s run function ships with the prompter and only there');

  // ── rows ──
  const lStart = A.indexOf("\ndocument.addEventListener('keydown', (e) => {\n  if (e.target.matches('.annot-textarea')) return;");
  const lEnd = A.indexOf('\n});\n', lStart);
  ok(lStart >= 0 && lEnd > lStart, 'the key map\'s listener is found in AUDIENCE_JS');
  const guards = switchKeys(A.slice(lStart, lEnd));
  ok(guards.size === 4, 'its overview switch answers the four arrows', [...guards].join(', '));
  const shared = withoutFunction(A, 'function gotoKey(e) {');
  const tableKeys = (view) => Object.keys(CMD.keyMap(view));
  const answered = {
    audience: new Set([...tableKeys('audience'), ...guards, ...comparedKeys(shared)]),
    speaker: new Set([...tableKeys('speaker'), ...guards, ...comparedKeys(shared), ...comparedKeys(S), ...comparedKeys(P)]),
  };
  const edKeys = editorKeys(editorJs);
  ok(edKeys.size > 25, 'the editor answers more than twenty-five keys', String(edKeys.size));

  // The parser, on the shapes the panel writes, before anything is judged by it.
  ok(dtCombos('<kbd>Shift</kbd>-<kbd>C</kbd> <kbd>F</kbd>').join() === 'shift+c,shift+f',
    'Shift-C F reads as two shifted keys');
  ok(dtCombos('<kbd>Ctrl/Cmd</kbd>-<kbd>Z</kbd> · <kbd>Shift</kbd>-<kbd>Ctrl/Cmd</kbd>-<kbd>Z</kbd>').join() === 'mod+z,mod+shift+z',
    'Ctrl/Cmd-Z · Shift-Ctrl/Cmd-Z reads as two chords');
  ok(dtCombos('<kbd>1</kbd>–<kbd>9</kbd>').length === 9, '1–9 reads as nine digits');
  ok(dtCombos('<kbd>Space</kbd> · <kbd>↓</kbd>').join() === ' ,arrowdown', 'Space and ↓ read as their e.key names');
  ok(CMD.COMMANDS.filter((c) => c.keys && !c.show).every((c) =>
    dtCombos(c.keys.map(CMD.keyText).join(' · ')).join() === c.keys.join()),
  'a generated key column reads back as exactly the keys it was made from');

  // A command's row spells only keys that command answers - a row cannot
  // advertise a key that does something else.
  const overclaim = [];
  for (const c of commands) {
    const own = new Set(c.keys);
    const col = c.show || c.keys.map(CMD.keyText).join(' · ');
    for (const k of dtCombos(col)) if (!own.has(k)) overclaim.push(`${c.id}: ${k}`);
  }
  ok(overclaim.length === 0, 'every key a command\'s row spells is answered by that command', overclaim.join(', '));

  let helpRows = 0;
  for (const view of CMD.VIEWS) {
    const rows = listed(render, view);
    helpRows += rows.main.size;
    const allowed = NOT_A_ROW[view];
    const gap = missing(answered[view], rows.main, allowed);
    ok(gap.length === 0, `every key the ${view} view answers has a row in its panel`,
      gap.map((k) => JSON.stringify(k)).join(', '));
    const stale = Object.keys(allowed).filter((k) => !answered[view].has(k) || rows.main.has(k));
    ok(stale.length === 0, `every NOT_A_ROW entry for the ${view} view is answered and has no row`,
      stale.join(', '));
    const edGap = missing(edKeys, rows.editor, NOT_A_ROW.editor);
    ok(edGap.length === 0, `every key the editor answers has a row in the ${view} view's editor section`,
      edGap.map((k) => JSON.stringify(k)).join(', '));
  }
  note(`${commands.length} commands; ${answered.audience.size} keys in the audience, ${answered.speaker.size} in the cockpit, `
    + `${edKeys.size} in the editor; ${helpRows} combinations listed`);

  // The gate has to be able to fail: take the B row out of a rendered panel
  // and the blank key must come back as missing.
  const html = render('audience', false, false);
  const cut = html.replace(/<dt(?: [^>]*)?><kbd>B<\/kbd> · <kbd>\.<\/kbd><\/dt><dd>[^<]*<\/dd>/, '');
  ok(cut !== html, 'the B row is found in the rendered panel');
  const cutRows = new Set(helpSections(cut).flatMap((s) => s.combos));
  ok(missing(answered.audience, cutRows, NOT_A_ROW.audience).includes('b'),
    'and a panel without it is caught');

  // ── the panel as a palette ──
  // A row the panel may run names its command on the dt; the runtime adds
  // whether this view has a run function. Every command but ? has a row of
  // its own and runs from it; a doc row names nothing. The runnable rows
  // come first, section by section, and every other row after them under
  // the reference's line, so the arrows, which walk the runnable rows, never
  // pass over one they cannot select.
  for (const view of CMD.VIEWS) {
    const panel = render(view, true, true);
    const named = [...panel.matchAll(/<dt [^>]*data-cmd="([a-z0-9-]+)">/g)].map((m) => m[1]);
    const byId = new Map(CMD.COMMANDS.map((c) => [c.id, c]));
    const rowIds = [...panel.matchAll(/<dt([^>]*)>/g)].map((m) => (m[1].match(/data-row="([a-z0-9-]+)"/) || [])[1]);
    ok(rowIds.length > 20 && rowIds.every((id) => byId.has(id)) && new Set(rowIds).size === rowIds.length,
      `every row of the ${view} panel names the entry it is, once`, rowIds.filter((id) => !byId.has(id)).join(', '));
    const wrong = named.filter((id) => !byId.has(id) || !byId.get(id).keys || id === 'help');
    ok(named.length > 20 && wrong.length === 0,
      `the ${view} panel names a command on every row it may run, and on no doc row`,
      `${named.length} named; wrong: ${wrong.join(', ')}`);
    ok(['blank', 'collapse-back', 'font-back', 'zoom-out', 'prev-column'].every((id) => named.includes(id))
      && !named.includes('sideways') && !named.includes('help'),
      `in the ${view} panel B and each of Shift-C F A L run, the → ← doc row and ? do not`);
    const secs = helpSections(panel);
    const firstRef = secs.findIndex((x) => x.ref);
    const order = secs.map((x) => x.ref);
    ok(firstRef > 0 && order.slice(firstRef).every(Boolean) && order.slice(0, firstRef).every((r) => !r),
      `the ${view} panel's runnable sections all stand before its reference sections`, order.join(','));
    ok(secs.every((x) => x.rows.every((id) => (id !== null) === !x.ref)),
      `in the ${view} panel a runnable section holds only runnable rows, a reference section none`);
    const partAt = panel.indexOf('class="help-part"');
    ok(partAt > panel.lastIndexOf('data-cmd=') && partAt < panel.indexOf('<section class="help-ref">'),
      `the ${view} panel's reference line stands between the two runs`);
    ok(helpSections(panel).some((sec) => sec.combos.includes('mod+k')),
      `the ${view} panel has a row for Ctrl/Cmd-K`);
  }
  const head = A.slice(lStart, lEnd);
  const kAt = head.indexOf('openPalette();');
  const guardAt = head.indexOf('if (e.metaKey || e.ctrlKey || e.altKey) return;');
  ok(kAt > 0 && guardAt > kAt && head.indexOf('if (e.target === helpSearch) {') > kAt,
    'Cmd-K is answered in the listener\'s head, before the field\'s keys and before the guard that hands chords to the browser');

  // ── the start menu ──
  // Rendered from START_MENU, into audience.html alone, and every button a
  // command the audience runs.
  const smStart = buildJs.indexOf('function renderStartMenu(');
  const smSrc = buildJs.slice(smStart, buildJs.indexOf('\n}\n', smStart) + 2);
  // eslint-disable-next-line no-new-func
  const startMenu = new Function('COMMANDS', 'START_MENU', 'keyText', 'escapeHtml', smSrc + '\nreturn renderStartMenu;')(
    CMD.COMMANDS, CMD.START_MENU, CMD.keyText, (x = '') => String(x))();
  const menuIds = [...startMenu.matchAll(/data-cmd="([a-z0-9-]+)"/g)].map((m) => m[1]);
  ok(menuIds.join() === 'fullscreen,cockpit,print', 'the start menu is fullscreen, the cockpit and the print view', menuIds.join());
  ok(menuIds.every((id) => runA.has(id)), 'and the audience has a run function for each');
  ok(/<kbd>W<\/kbd>/.test(startMenu) && /Speaker cockpit/.test(startMenu) && /id="psiINT-start-menu"[^>]* hidden>/.test(startMenu),
    'its names and keys come from the table, and it is rendered hidden', startMenu);
  ok((buildJs.match(/\$\{renderStartMenu\(opts\.absentViews\)\}/g) || []).length === 1
    && buildJs.indexOf('${renderStartMenu(opts.absentViews)}') < buildJs.indexOf('function renderSpeaker('),
  'it is spliced into one view, and that view is the audience');
  // A view the build did not put beside audience.html has its entry drawn
  // hidden - the page asks again when the menu is shown, and a later partial
  // build may have put the view there; the key stays bound and answers with
  // a notice (test/palette.mjs).
  const lone = new Function('COMMANDS', 'START_MENU', 'keyText', 'escapeHtml', smSrc + '\nreturn renderStartMenu;')(
    CMD.COMMANDS, CMD.START_MENU, CMD.keyText, (x = '') => String(x))(['speaker', 'print']);
  const loneIds = [...lone.matchAll(/data-cmd="([a-z0-9-]+)"(?! hidden)/g)].map((m) => m[1]);
  const loneHidden = [...lone.matchAll(/data-cmd="([a-z0-9-]+)" hidden/g)].map((m) => m[1]);
  ok(loneIds.join() === 'fullscreen', 'with neither the cockpit nor the print view beside it, the menu shows fullscreen alone', loneIds.join());
  ok(loneHidden.join() === 'cockpit,print', 'and draws the other two hidden, for the page to ask about again', loneHidden.join());
  ok(!/ hidden/.test(startMenu.replace(/id="psiINT-start-menu"[^>]*>/, '').replace(/id="psiINT-start-menu-show"[^>]*>/, '')),
    'with every view there, no entry is drawn hidden');
  ok(CMD.START_MENU.filter((id) => CMD.COMMANDS.find((c) => c.id === id).opens).join() === 'cockpit,print',
    'the commands that open a view of their own say which, so the build can ask whether it is there');
}
