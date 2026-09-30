/*
 * Every key the live views answer has a row in their ? panel.
 *
 * The panel is written by hand in renderHelpOverlay and the keys are answered
 * by hand in the keydown listeners, so the two drift the way any pair of
 * hand-kept lists does: a case is added to the switch, the feature works, and
 * the only person who can find it is the one who wrote it. Before this gate
 * the audience's own N (an annotation on the slide) had no row there, nor did
 * the cockpit's Shift-W, the go-to prompt's Backspace, or the editor's
 * Backspace, Shift-F and ?.
 *
 * Both halves are read without a browser and without build.js's dependencies:
 *
 *   - The help half is the real thing. renderHelpOverlay is lifted out of
 *     build.js as text and run, once per view, with and without the editor
 *     (the sections that appear only with it are the editor's), and every
 *     <dt> is turned into the key combinations its kbd elements spell -
 *     Shift-C F A L is four shifted letters, Ctrl/Cmd-Shift-Z one chord,
 *     1–9 nine digits. Only the key column counts: a key mentioned in a
 *     description is not a row a person can find.
 *   - The handler half is read out of the template literals. The shared key
 *     map in AUDIENCE_JS gives its case labels, a case group whose body tests
 *     e.shiftKey gives the Shift variant too; every e.key comparison elsewhere
 *     in AUDIENCE_JS (and, for the cockpit, SPEAKER_JS and SOUFFLEUSE_JS)
 *     gives a plain key. The editor's are read out of editor.mjs: the tool
 *     keys of DGE_TOOLS, the chords of dgeKeydown's modifier block, its plain
 *     comparisons, and the E that opens it - and those are held against the
 *     editor's section only, since its F and the slide's F are two keys.
 *
 * Not read: gotoKey, which is modal and whose Enter / Esc / digits the prompt
 * names on its own foot (its modifier pass-through would read as keys); the
 * editor's arrow nudge, which is a startsWith and is written as prose in its
 * row; and the documents, whose reader keys are the reader-help-keys string.
 *
 * NOT_A_ROW is the reviewed list of keys that are answered and deliberately
 * have no row, each with its reason. An entry that stops being answered, or
 * that gains a row, fails here too, so the list cannot rot into a blanket.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './harness.mjs';

export const name = 'every key the live views answer has a row in the ? panel';

const NOT_A_ROW = {
  audience: {
    'k': 'the cue cards are the cockpit\'s; viewHooks.onK does nothing in the audience',
    'v': 'the case breaks unless VIEW is speaker - freezing is the cockpit\'s',
    'shift+v': 'the preview strip is the cockpit\'s; the case breaks here',
    'shift+n': 'no private notes pane here - Shift-N falls through to N, the annotation',
    'shift+s': 'S opens the cockpit with or without Shift; Shift-S is the cockpit\'s prompter',
    'shift+w': 'the projection is this window, so Shift-W does what W does',
    'e': 'plain E is unbound in the map - only Shift-E acts; the editor\'s E is held in its section',
    '=': 'the unshifted spelling of + on a US layout, one physical key',
    '_': 'the shifted spelling of -, one physical key',
  },
  speaker: {
    's': 'opening the cockpit is the audience\'s; in the cockpit plain S does nothing',
    'e': 'plain E is unbound in the map - only Shift-E acts; the editor\'s E is held in its section',
    '=': 'the unshifted spelling of + on a US layout, one physical key',
    '_': 'the shifted spelling of -, one physical key',
  },
  editor: {},
};

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
  return [...html.matchAll(/<section>\s*<h3>([\s\S]*?)<\/h3>([\s\S]*?)<\/section>/g)].map((m) => ({
    title: m[1],
    combos: [...m[2].matchAll(/<dt>([\s\S]*?)<\/dt>/g)].flatMap((d) => dtCombos(d[1])),
  }));
}

function loadRenderer(buildJs) {
  const start = buildJs.indexOf('function renderHelpOverlay(');
  const end = buildJs.indexOf('\n}\n', start);
  if (start < 0 || end < 0) throw new Error('renderHelpOverlay not found in build.js');
  const src = buildJs.slice(start, end + 2);
  const STRINGS = { en: { 'help-search': 'find', 'help-none': 'none' } };
  // eslint-disable-next-line no-new-func
  return new Function('STRINGS', 'escapeHtml', src + '\nreturn renderHelpOverlay;')(
    STRINGS, (s = '') => String(s));
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

// The shared key map: case labels, with Shift where the group reads it.
export function switchKeys(listener) {
  const groups = [];
  let cur = null, open = false;
  for (const raw of listener.split('\n')) {
    const line = stripComment(raw);
    const keys = [...line.matchAll(/\bcase '((?:\\'|[^'])+)':/g)].map((m) => m[1].replace(/\\'/g, "'"));
    if (keys.length) {
      if (cur && open) cur.keys.push(...keys);
      else { cur = { keys, body: '' }; groups.push(cur); }
      cur.body += line + '\n';
      open = /^\s*(case '(?:\\'|[^'])+':\s*)+\{?\s*$/.test(line);
      continue;
    }
    if (cur) { cur.body += line + '\n'; open = false; }
  }
  const out = new Set();
  for (const g of groups) {
    for (const k of g.keys) {
      out.add(normKey(k));
      if (/\be\.shiftKey\b/.test(g.body)) out.add('shift+' + normKey(k));
    }
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
  const lStart = A.indexOf("// Keyboard\ndocument.addEventListener('keydown', (e) => {");
  const lEnd = A.indexOf('\n});\n', lStart);
  ok(lStart >= 0 && lEnd > lStart, 'the shared key map is found in AUDIENCE_JS');
  const map = switchKeys(A.slice(lStart, lEnd));
  ok(map.size > 30, 'and it answers more than thirty keys', String(map.size));

  const shared = withoutFunction(A, 'function gotoKey(e) {');
  const answered = {
    audience: new Set([...map, ...comparedKeys(shared)]),
    speaker: new Set([...map, ...comparedKeys(shared), ...comparedKeys(S), ...comparedKeys(P)]),
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

  let helpRows = 0;
  for (const view of ['audience', 'speaker']) {
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
  note(`${answered.audience.size} keys in the audience, ${answered.speaker.size} in the cockpit, `
    + `${edKeys.size} in the editor; ${helpRows} combinations listed`);

  // The gate has to be able to fail: take the B row out of a rendered panel
  // and the blank key must come back as missing.
  const html = render('audience', false, false);
  const cut = html.replace(/<dt><kbd>B<\/kbd><\/dt><dd>[^<]*<\/dd>/, '');
  ok(cut !== html, 'the B row is found in the rendered panel');
  const cutRows = new Set(helpSections(cut).flatMap((s) => s.combos));
  ok(missing(answered.audience, cutRows, NOT_A_ROW.audience).includes('b'),
    'and a panel without it is caught');
}
