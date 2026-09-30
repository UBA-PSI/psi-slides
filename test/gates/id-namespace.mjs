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
 * Not read: the inlined CSS's `#id` selectors (a hex colour looks the same to
 * a scanner), and pulse-embed.js, a verbatim copy of the Pulse client that
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
  note(`${ALLOWED.length} allow-list entries, ${[...found.values()].reduce((n, l) => n + l.length, 0)} allowed sites`);
}
