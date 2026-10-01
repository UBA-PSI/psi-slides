/*
 * Every id the build invents starts with psiINT-.
 *
 * An author's `{#id}` and the build's own ids share one HTML id namespace,
 * and the chunk articles stand before the chrome in document order - so a
 * chrome id a slide could also want (`#toc`, `#cue-panel`, both paid for)
 * made `getElementById` answer with the slide, and the build exited 0. The
 * fence has two halves. The author's half is `reserved-id`: parseTail in
 * tails.mjs refuses a heading id starting with RESERVED_ID_PREFIX, for
 * build.js and lint.js alike (fixtures in test/settings.mjs and the tails
 * gate). This is the build's half: a new element whose id is a bare word
 * would reopen the hole without anyone noticing, so every site in build.js,
 * editor.mjs, diagram-core.mjs, pdf-core.mjs and cue-cards.mjs that writes or
 * names an id is read here and has to be one of two things -
 *
 *   - a literal that starts with psiINT-, or
 *   - a site on ALLOWED below, which says why its id is not the build's to
 *     prefix (it is the author's, or it is built from a prefix that is), and
 *     how many times that exact text occurs - so a second copy of an allowed
 *     shape is a failure too, and somebody has to decide about it.
 *
 * The sites read: an `id="…"` / `id='…'` attribute in markup text (no space
 * round the `=`, which is how markup is written and how a JS assignment is
 * not), an `.id = …` assignment, an `id: …` in the editor's dgeEl() element
 * builder, and the literal argument of getElementById or a `#word` inside a
 * literal querySelector(All). A lookup through a computed argument
 * (`getElementById(h.chunk)`, `'[id="' + prefix + key + '"]'`) is a read of
 * an id something else emitted, and that emitter is what is checked.
 *
 * The stylesheets are the third half. Every `#id` that stands in a selector
 * of an inlined stylesheet - the six CSS literals in build.js (DIAGRAM_CSS,
 * PRINT_CSS, PULSE_PRINT_CSS, AUDIENCE_CSS, SPEAKER_CSS, SOUFFLEUSE_CSS),
 * editor.css and pdf-core.mjs's PDF_CSS - has to start with psiINT- (or be on
 * CSS_ALLOWED), and has to name an id some site above emits. The second rule
 * is the one that matters: `#toc-panel li` stood in the heading rule's :is
 * list from the day it was written and matched nothing, because the contents
 * panel was `nav#toc` - a selector naming no element is not an error to a
 * browser. A selector is told from a hex colour by position: comments,
 * template expressions, strings, `[…]` attribute tests and `url(…)` are
 * blanked first, and only the text before a `{` (a rule's prelude, not an
 * at-rule's other than @scope) is read for `#word`. Declarations end in `;`
 * or `}`, so `#fff` never stands there.
 *
 * Not read: pulse-embed.js, a verbatim copy of the Pulse client that
 * this repository does not edit. The widget names its own pieces pulse-N,
 * pulse-N-a and pulse-email-N; the question element's id is set by the build
 * (psiINT-pulse-<key>), so only those inner pieces are left in the author's
 * namespace.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './harness.mjs';
import { RESERVED_ID_PREFIX } from '../../tails.mjs';

export const name = 'every id the build invents starts with psiINT-';

const P = RESERVED_ID_PREFIX;
const FILES = ['build.js', 'editor.mjs', 'diagram-core.mjs', 'pdf-core.mjs', 'cue-cards.mjs'];

// file, kind, the id text as the scanner reads it, how often it occurs, why.
const ALLOWED = [
  // ── the author's ids, emitted verbatim - the whole point of the scheme ──
  ['build.js', 'attr', '${escapeHtml(id)}', 2,
    'renderChunk and renderAudienceChunk: a chunk article carries its author {#id}'],
  ['build.js', 'attr', '${escapeHtml(col.id)}', 2,
    'renderColumn and renderColumnsHtml: a column section carries its author {#id}'],
  ['build.js', 'attr', '${escapeHtml(chunk.id)}', 1,
    'renderTitleChunk: the title or closing chunk carries its author {#id}'],
  // ── built from a prefix that is itself psiINT- (asserted below) ──
  ['build.js', 'attr', '${rootId}', 1, 'inlineSvg: psiINT-fig-N-root'],
  ['build.js', 'attr', '${sym.id}', 1, 'dgAssetMarkup: a shared picture symbol, psiINT-sym-N'],
  ['build.js', 'attr', '${id}', 3, 'dgAssetMarkup: the id diagram-core hands it, psiINT-dgN-<name>--i'],
  ['build.js', 'attr', '${listId}', 1, 'the reader contents: psiINT-rd-part-N'],
  ['diagram-core.mjs', 'attr', '${id}', 3, 'a label group or a picture: ${prefix}<name>--l / --i'],
  ['diagram-core.mjs', 'attr', '${prefix}${e.id}--r', 4, 'a box, dot or container rectangle'],
  ['diagram-core.mjs', 'attr', '${prefix}${e.id}--c', 1, 'a dot circle'],
  ['diagram-core.mjs', 'attr', '${prefix}${e.id}--p', 1, 'an edge path'],
  ['diagram-core.mjs', 'attr', '${prefix}${e.id}${suffix}', 1, 'a brace or chart part'],
  ['diagram-core.mjs', 'attr', '${prefix}${e.id}--lw${i}', 1, 'a lane wash'],
  ['diagram-core.mjs', 'attr', '${prefix}${e.id}', 1, 'an element group'],
  ['diagram-core.mjs', 'attr', '${svgId}', 1, 'the figure root, ${prefix}root'],
];

// The stylesheets whose selectors are read: [file, literal name or null for
// a whole .css file].
const CSS_SOURCES = [
  ['build.js', 'DIAGRAM_CSS'], ['build.js', 'PRINT_CSS'], ['build.js', 'PULSE_PRINT_CSS'],
  ['build.js', 'AUDIENCE_CSS'], ['build.js', 'SPEAKER_CSS'], ['build.js', 'SOUFFLEUSE_CSS'],
  ['pdf-core.mjs', 'PDF_CSS'], ['editor.css', null],
];
// A selector id that is not psiINT-, or that no site emits: id, why. Empty,
// and should stay so - a chrome selector names a psiINT- id, and a selector
// aimed at an author's {#id} would be a stylesheet styling one lecture.
const CSS_ALLOWED = [];

const isComment = (t) => t.startsWith('//') || t.startsWith('*') || t.startsWith('/*');
const literal = (v) => /^(['"`])(.*)\1$/.exec(v.trim());

// One pass over a file's lines, returning every site that is not a psiINT-
// literal, as {kind, value, line}.
function scan(file, text) {
  const out = [];
  text.split('\n').forEach((line, i) => {
    if (isComment(line.trim())) return;
    const at = i + 1;
    // Markup: id="…" with the value read up to its closing quote, template
    // expressions included. An empty value opening a `[id="' + …` attribute
    // selector is a computed lookup, not an emitter.
    for (const m of line.matchAll(/(?<![\w.-])id=\\?(["'])((?:\$\{[^}]*\}|[^"'\\\s>])*)/g)) {
      if (!m[2] && line[m.index - 1] === '[') continue;
      if (!m[2].startsWith(P)) out.push({ kind: 'attr', value: m[2], line: at });
    }
    for (const m of line.matchAll(/(?<![\w$])[\w$\]).]*\.id\s*=(?![=>])\s*([^;,)]+)/g)) {
      const lit = /^(['"`])(.*)/.exec(m[1].trim());
      if (!(lit && lit[2].startsWith(P))) out.push({ kind: 'prop', value: m[1].trim(), line: at });
    }
    if (/\bdgeEl\(/.test(line)) {
      for (const m of line.matchAll(/(?<![\w.-])id:\s*([^,}]+)/g)) {
        const lit = /^(['"`])(.*)/.exec(m[1].trim());
        if (!(lit && lit[2].startsWith(P))) out.push({ kind: 'dgeEl', value: m[1].trim(), line: at });
      }
    }
    for (const m of line.matchAll(/getElementById\(\s*([^)]*)\)/g)) {
      const lit = literal(m[1]);
      if (lit && !lit[2].startsWith(P)) out.push({ kind: 'byId', value: lit[2], line: at });
    }
    for (const m of line.matchAll(/querySelector(?:All)?\(\s*(['"`])((?:\\.|(?!\1).)*)\1/g)) {
      const sel = m[2].replace(/\$\{[^}]*\}/g, '');
      for (const h of sel.matchAll(/#([A-Za-z_][\w-]*)/g)) {
        if (!h[1].startsWith(P)) out.push({ kind: 'qs', value: '#' + h[1], line: at });
      }
    }
  });
  return out;
}

// The lines of `const NAME = \`…\`;` in a file, or the whole file.
function cssLines(text, name) {
  const lines = text.split('\n');
  if (!name) return lines.map((t, i) => ({ no: i + 1, text: t }));
  const open = new RegExp(`^(?:export )?const ${name} = \``);
  const i = lines.findIndex(l => open.test(l));
  if (i < 0) return null;
  const out = [];
  for (let j = i; j < lines.length; j++) {
    let t = j === i ? lines[j].replace(open, '') : lines[j];
    const end = /(^|[^\\])`\s*;\s*$/.test(t);
    if (end) t = t.replace(/`\s*;\s*$/, '');
    out.push({ no: j + 1, text: t });
    if (end) break;
  }
  return out;
}

// Every #id standing in a selector of the given lines, as {id, line}.
function selectorIds(lines) {
  let s = lines.map(l => l.text).join('\n');
  const starts = [];
  let p = 0;
  for (const l of lines) { starts.push(p); p += l.text.length + 1; }
  const lineAt = (off) => {
    let k = 0;
    while (k + 1 < starts.length && starts[k + 1] <= off) k++;
    return lines[k].no;
  };
  // Same length, newlines kept, so an offset still finds its line.
  const blank = (m) => m.replace(/[^\n]/g, ' ');
  s = s.replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/\$\{(?:[^{}]|\{[^{}]*\})*\}/g, blank)
    .replace(/"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/g, blank)
    .replace(/\[[^\]\n]*\]/g, blank)
    .replace(/url\([^)]*\)/g, blank);
  const out = [];
  let from = 0;
  for (let k = 0; k < s.length; k++) {
    const c = s[k];
    if (c === '{') {
      const prelude = s.slice(from, k);
      const t = prelude.trim();
      if (!t.startsWith('@') || t.startsWith('@scope')) {
        for (const m of prelude.matchAll(/#(-?[A-Za-z_][\w-]*)/g)) out.push({ id: m[1], line: lineAt(from + m.index) });
      }
      from = k + 1;
    } else if (c === '}' || c === ';') from = k + 1;
  }
  return out;
}

// The psiINT- ids the emission sites write, as patterns: a template
// expression inside one (psiINT-pulse-${…}) stands for any id word.
function emittedPatterns(text) {
  const vals = new Set();
  for (const m of text.matchAll(/(?<![\w.-])id=\\?(["'])((?:\$\{[^}]*\}|[^"'\\\s>])*)/g)) vals.add(m[2]);
  for (const m of text.matchAll(/\.id\s*=(?![=>])\s*(['"`])([^'"`]*)/g)) vals.add(m[2]);
  for (const m of text.matchAll(/(?<![\w.-])id:\s*(['"`])([^'"`]*)/g)) vals.add(m[2]);
  return [...vals].filter(v => v.startsWith(P)).map(v => new RegExp('^' + v.split(/\$\{[^}]*\}/)
    .map(x => x.replace(/[.*+?^$()|[\]\\]/g, '\\$&')).join('[\\w-]+') + '$'));
}

// The scanner on its own, against lines that must and must not be reported -
// a gate that reads nothing passes everything.
function selfTest(ok) {
  const probe = [
    'return `<div id="clock">`;',
    "el.id = 'stage';",
    "const x = document.getElementById('timer');",
    "root.querySelector('#toc li');",
    "dgeEl('span', { id: 'dge-name' });",
  ].join('\n');
  const clean = [
    'return `<div id="psiINT-clock">`;',
    "el.id = 'psiINT-stage';",
    "const x = document.getElementById('psiINT-timer');",
    "root.querySelector('#psiINT-toc li');",
    "dgeEl('span', { id: 'psiINT-dge-name' });",
    "const g = root.querySelector('[id=\"' + prefix + key + '\"]');",
    'return `<figure data-fig-id="${escapeHtml(href)}">`;',
    "let id = 'figure-1';",
    '// a comment naming id="stage"',
  ].join('\n');
  const got = scan('probe', probe).map(s => s.kind).join(' ');
  ok(got === 'attr prop byId qs dgeEl', 'the scanner reports a bare id in each of the five site shapes', got);
  const quiet = scan('clean', clean);
  ok(quiet.length === 0, 'and nothing for a psiINT- id, a computed lookup, a data-*-id, a JS variable or a comment',
    quiet.map(s => `${s.kind} ${s.value}`).join(' | '));

  const css = [
    '/* #in-comment { } */',
    '#bare li, .x { color: #fff; background: url(#grad); }',
    '[href="#frag"], a[href^=#x] { border: 1px solid #1a2b3c }',
    '@media (min-width: 1px) { body :is(p, #psiINT-ok) { content: "#str {"; } }',
    '.y { fill: ${dark ? "#000" : "#fff"}; }',
    '@scope (svg#psiINT-root) { g { color: #abc; } }',
  ].map((t, i) => ({ no: i + 1, text: t }));
  const ids = selectorIds(css).map(x => `${x.id}@${x.line}`).join(' ');
  ok(ids === 'bare@2 psiINT-ok@4 psiINT-root@6',
    'the selector scanner reads #ids in selectors and not hex colours, url(#), strings, attribute values or comments', ids);
}

export async function run({ report }) {
  const { ok, note } = report;
  selfTest(ok);

  const texts = Object.fromEntries(FILES.map(f => [f, fs.readFileSync(path.join(ROOT, f), 'utf8')]));

  // The prefixes the allowed template sites are built from.
  ok(/const prefix = `psiINT-fig-\$\{inlineSvgCounter\}-`;/.test(texts['build.js']),
    'an inlined SVG asset\'s ids are prefixed psiINT-fig-N-');
  ok(/const prefix = opts\.prefix \|\| `psiINT-dg\$\{\+\+dgCounter\}-`;/.test(texts['diagram-core.mjs']),
    'a figure\'s default id prefix is psiINT-dgN-');
  ok(/id: `psiINT-sym-\$\{\+\+dgSymbolCounter\}`/.test(texts['build.js']),
    'a shared picture symbol is psiINT-sym-N');
  ok(/const listId = `psiINT-rd-part-\$\{\+\+part\}`;/.test(texts['build.js']),
    'a reader contents part list is psiINT-rd-part-N');

  const found = new Map();   // "file kind value" -> [lines]
  for (const f of FILES) {
    for (const s of scan(f, texts[f])) {
      const key = `${f} ${s.kind} ${s.value}`;
      found.set(key, [...(found.get(key) || []), s.line]);
    }
  }
  const allowed = new Map(ALLOWED.map(([f, kind, value, count, why]) => [`${f} ${kind} ${value}`, { count, why }]));

  const bare = [];
  for (const [key, lines] of found) {
    const a = allowed.get(key);
    if (!a) bare.push(`${key}  @${lines.join(',')}`);
    else if (a.count !== lines.length) bare.push(`${key}  occurs ${lines.length}x, allowed ${a.count}x  @${lines.join(',')}`);
  }
  ok(bare.length === 0,
    `every id site in ${FILES.join(', ')} is a ${P} literal or an allowed author/prefix site`,
    bare.join('\n           '));
  const stale = [...allowed.keys()].filter(k => !found.has(k));
  ok(stale.length === 0, 'and every allow-list entry still matches a site - a stale one is deleted, not kept',
    stale.join('\n           '));
  // ── the stylesheets ──
  const pats = FILES.flatMap(f => emittedPatterns(texts[f]));
  const cssAllowed = new Map(CSS_ALLOWED);
  const bareSel = [], deadSel = [];
  let selCount = 0;
  const usedAllowed = new Set();
  for (const [file, lit] of CSS_SOURCES) {
    const text = texts[file] ?? fs.readFileSync(path.join(ROOT, file), 'utf8');
    const lines = cssLines(text, lit);
    ok(lines !== null, lit ? `${file} still holds ${lit}` : `${file} is read whole`);
    if (!lines) continue;
    for (const { id, line } of selectorIds(lines)) {
      selCount++;
      if (cssAllowed.has(id)) { usedAllowed.add(id); continue; }
      const where = `${file}${lit ? ' ' + lit : ''} #${id} @${line}`;
      if (!id.startsWith(P)) bareSel.push(where);
      else if (!pats.some(r => r.test(id))) deadSel.push(where);
    }
  }
  ok(bareSel.length === 0, `every #id selector in the inlined stylesheets starts with ${P}`,
    bareSel.join('\n           '));
  ok(deadSel.length === 0, 'and names an id some site emits - a selector for an id nothing writes matches nothing',
    deadSel.join('\n           '));
  const staleCss = CSS_ALLOWED.map(([id]) => id).filter(id => !usedAllowed.has(id));
  ok(staleCss.length === 0, 'and every stylesheet allow-list entry still matches a selector', staleCss.join(' '));
  note(`${selCount} #id selectors in ${CSS_SOURCES.length} stylesheets, ${pats.length} emitted ${P} ids`);
  note(`${ALLOWED.length} allow-list entries, ${[...found.values()].reduce((n, l) => n + l.length, 0)} allowed sites`);
}
