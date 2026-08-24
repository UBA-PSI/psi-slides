#!/usr/bin/env node
/**
 * Rebuilds every compiled figure in docs/artifact/figures-you-write.html
 * from docs/artifact/figure-rules/source.md.
 *
 *   node docs/artifact/refresh-figures.mjs            # rebuild and splice
 *   node docs/artifact/refresh-figures.mjs --check    # report drift, write nothing
 *
 * The artifact is a hand-written page that embeds machine-made parts: the
 * seventeen still figures the rules are argued with, the two stepped demos,
 * and the diagram runtime that steps them. Those parts are not authored here
 * and must never be edited here - they are lifted out of a real build of the
 * lecture next door, so a change to the compiler reaches the page by running
 * this script rather than by anyone re-drawing anything.
 *
 * Two things this script exists to get right, both learned by getting them
 * wrong:
 *
 * - **Extract by marker, never by line number.** The runtime was first cut
 *   out of the built page with a fixed line range. Adding two chunks to the
 *   lecture moved it by one line, the slice cut mid-function, and the page
 *   then showed every figure at its *last* beat - because a diagram with no
 *   working runtime shows the static attributes, which are the print state.
 *   It looked like a design decision, not a syntax error. The runtime is now
 *   found between markers and parsed before it is written.
 *
 * - **Re-prefix every lifted id.** The compiler numbers figures per document
 *   (`dg1`, `dg2`, ...), so ids lifted from two different builds collide, and
 *   a duplicate id sends every `url(#...)` in the second copy to the first
 *   one's element - a drawing that arrives with no lines. Each figure is
 *   re-prefixed from its chunk id, which is unique by construction.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const LECTURE = path.join(HERE, 'figure-rules/source.md');
const PAGE = path.join(HERE, 'figures-you-write.html');
const CHECK = process.argv.includes('--check');

// The chunk ids are the contract with the lecture. Renaming one there without
// renaming it here is the one edit that breaks this quietly.
// The opening section builds one figure a line at a time, so its chunks are
// cumulative: each is the previous one plus what that step introduces.
const BASICS = ['b1', 'b2', 'b3', 'b4', 'b5', 'b6'];
const STILLS = [
  ...BASICS,
  'r1w', 'r1r', 'r2w', 'r2r', 'r3w', 'r3r',
  'r6aw', 'r6ar', 'r6bw', 'r6br', 'r7w', 'r7r', 'r8w', 'r8r',
  'tones',
];
const DEMOS = [
  { chunk: 'beats-demo', prefix: 'dgbeat' },
  { chunk: 'move-demo', prefix: 'dgmove' },
];

const RT_START = 'const DG_LIST = [];';
const RT_END = '\nfunction initDiagrams() {';
const NETSEC = path.join(ROOT, 'lectures/network-security/source.md');

const say = (s) => process.stdout.write(s + '\n');

// ── the DSL highlighter the page's source blocks use ─────────────────────
// Strings and attribute tails are parked before keywords are matched, so a
// keyword can never be painted inside a label. A comment is a line whose
// first non-space character is '#', and it has to win over everything else
// or a word inside one stops reading as a comment.
const KW = /\b(box|edge|text|container|brace|dot|image|bars|grid|plot|align|spread|default|same as|right of|left of|below|above|between|over|via|point|at|gap|pad|space|offset)\b/g;
const STEP_OPS = /^(\s*)(step|show|hide|move|emph|calm|style|label)\b/;

function hl(src) {
  const held = [];
  const park = (s) => ' ' + (held.push(s) - 1) + ' ';
  return src.split('\n').map((line) => {
    const esc = line.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    if (/^\s*#/.test(line)) return '<span class="cm">' + esc + '</span>';
    let t = esc;
    t = t.replace(/"[^"]*"/g, (m) => park('<span class="cl">' + m + '</span>'));
    t = t.replace(/\{[^}]*\}/g, (m) => park('<span class="cl">' + m + '</span>'));
    // step ops read as the spine of a stepped figure, so they get their own
    // weight rather than the keyword colour every placement word carries
    t = t.replace(STEP_OPS, (m, sp2, op) => sp2 + '<span class="st">' + op + '</span>');
    t = t.replace(KW, (m) => '<span class="kw">' + m + '</span>');
    return t.replace(/ (\d+) /g, (_, i) => held[+i]);
  }).join('\n');
}

// ── the ::: diagram block belonging to a chunk, verbatim ─────────────────
function diagramBlock(md, chunkId) {
  const lines = md.split('\n');
  const head = lines.findIndex((l) => l.startsWith('## ') && l.includes('#' + chunkId + '}'));
  if (head < 0) throw new Error('chunk #' + chunkId + ' not in the lecture');
  const next = lines.findIndex((l, i) => i > head && l.startsWith('## '));
  const open = lines.findIndex((l, i) => i > head && l.startsWith('::: diagram'));
  if (open < 0 || (next > 0 && open > next)) throw new Error('no diagram in #' + chunkId);
  let close = -1;
  for (let i = open + 1; i < lines.length; i++) if (lines[i] === ':::') { close = i; break; }
  if (close < 0) throw new Error('unclosed diagram in #' + chunkId);
  return lines.slice(open, close + 1).join('\n');
}

// ── build ────────────────────────────────────────────────────────────────
function build(flag, src = LECTURE) {
  execFileSync('node', [path.join(ROOT, 'build.js'), src, flag], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
  });
}

// ── lift one figure, re-prefixed so nothing collides ─────────────────────
function svgFor(html, chunkId, prefix) {
  const at = html.indexOf('id="' + chunkId + '"');
  if (at < 0) throw new Error('chunk #' + chunkId + ' not in the built page');
  const a = html.indexOf('<svg', at);
  const b = html.indexOf('</svg>', a);
  if (a < 0 || b < 0) throw new Error('no svg in chunk #' + chunkId);
  const svg = html.slice(a, b + 6);
  const m = svg.match(/id="([a-z0-9]+)-root"/);
  if (!m) throw new Error('figure in #' + chunkId + ' carries no root id');
  return { svg: svg.split(m[1] + '-').join(prefix + '-'), old: m[1] };
}

function payloadFor(html, oldPrefix, prefix) {
  const at = html.indexOf('data-for="' + oldPrefix + '-root"');
  if (at < 0) return null;
  const a = html.lastIndexOf('<script', at);
  const b = html.indexOf('</script>', at) + 9;
  return html.slice(a, b).split(oldPrefix + '-').join(prefix + '-');
}

// ── splice: replace the whole <svg> that carries this root id ────────────
function replaceSvg(page, rootId, svg) {
  const a = page.indexOf('<svg id="' + rootId + '"');
  if (a < 0) throw new Error('no <svg id="' + rootId + '"> in the artifact');
  const b = page.indexOf('</svg>', a) + 6;
  return page.slice(0, a) + svg + page.slice(b);
}

function replaceBetween(page, open, close, body, what) {
  const a = page.indexOf(open);
  if (a < 0) throw new Error('marker missing in artifact: ' + what);
  const b = page.indexOf(close, a + open.length);
  if (b < 0) throw new Error('closing marker missing in artifact: ' + what);
  return page.slice(0, a + open.length) + body + page.slice(b);
}

// ── run ──────────────────────────────────────────────────────────────────
say('building ' + path.relative(ROOT, LECTURE));
build('--print-only');
build('--audience-only');
const printed = fs.readFileSync(path.join(HERE, 'figure-rules/print.html'), 'utf8');
const live = fs.readFileSync(path.join(HERE, 'figure-rules/audience.html'), 'utf8');

let page = fs.readFileSync(PAGE, 'utf8');
const was = page;

// the still figures come from the print pass: no per-step payload to carry
let n = 0;
for (const id of STILLS) {
  const { svg } = svgFor(printed, id, 'rl' + id);
  page = replaceSvg(page, 'rl' + id + '-root', svg);
  n++;
}
say('  ' + n + ' still figures spliced');

// the stepped demos come from the live pass, which is the only one that
// emits the per-beat geometry the runtime interpolates between
const lectureMd = fs.readFileSync(LECTURE, 'utf8');

// ── the opening tutorial: each step's source, with what it added marked ──
// Diffed against the previous chunk rather than annotated by hand, so a line
// edited in step 4 is marked in step 4 without anyone remembering to say so.
let prevLines = [];
for (const id of BASICS) {
  const block = diagramBlock(lectureMd, id);
  const lines = block.split('\n');
  const before = new Set(prevLines);
  const marked = lines.map((l) => {
    const painted = hl(l);
    return before.has(l) || l.trim() === '' ? painted : '<span class="add">' + painted + '</span>';
  }).join('\n');
  page = replaceBetween(page, '<pre data-basicsrc="' + id + '">', '</pre><!--/basicsrc-->',
    marked, 'basics ' + id);
  prevLines = lines;
}
say('  ' + BASICS.length + ' tutorial steps, additions marked by diff');

for (const { chunk, prefix } of DEMOS) {
  const { svg, old } = svgFor(live, chunk, prefix);
  const payload = payloadFor(live, old, prefix);
  if (!payload) throw new Error('#' + chunk + ' has no frames payload - has it lost its steps?');
  const data = JSON.parse(payload.slice(payload.indexOf('>') + 1, payload.lastIndexOf('</script>')));
  page = replaceBetween(page,
    '<div class="demo-stage" data-demo="' + chunk + '">', '</div><!--/stage-->',
    svg + payload, 'stage ' + chunk);

  // The rail is generated from the payload, not written by hand: renaming a
  // step in the lecture would otherwise leave the page labelling beats with
  // names nothing in the figure answers to.
  const rail = ['opening', ...data.names].map((nm, i) =>
    '\n      <li><button type="button">' +
    (i === 0 ? '' : '<b>' + i + '</b> ') + nm.replace(/[&<>]/g, '') + '</button></li>').join('');
  page = replaceBetween(page, '<ol class="rail" data-rail="' + chunk + '">', '</ol><!--/rail-->',
    rail + '\n    ', 'rail ' + chunk);

  page = replaceBetween(page, '<pre class="demo-src" data-demosrc="' + chunk + '">', '</pre><!--/demosrc-->',
    hl(diagramBlock(lectureMd, chunk)), 'source ' + chunk);

  say('  ' + chunk + ': ' + data.n + ' beats [' + data.names.join(', ') + '], rail and source in step');
}

// ── the gallery: the figures themselves, then their source ───────────────
// These were screenshots for a while, which meant they showed whatever the
// compiler did on the day the screenshot was taken. A fix to the compiler
// could not reach them, and one did not: `.mono` labels went on rendering in
// the sans face in the gallery long after the rule was corrected. They are
// compiled figures now, so they follow this page's theme and cannot go stale.
build('--print-only', NETSEC);
const netsecHtml = fs.readFileSync(path.join(ROOT, 'lectures/network-security/print.html'), 'utf8');
const netsec = fs.readFileSync(NETSEC, 'utf8');
const slugs = [...page.matchAll(/<pre data-cardsrc="([a-z0-9-]+)">/g)].map((m) => m[1]);

let gal = 0;
for (const slug of slugs) {
  const { svg } = svgFor(netsecHtml, slug, 'gal' + slug.replace(/-/g, ''));
  page = replaceBetween(page, '<div class="shot" data-shot="' + slug + '">', '</div><!--/shot-->',
    svg, 'gallery figure ' + slug);
  gal++;
}
say('  ' + gal + ' gallery figures compiled from lectures/network-security');

for (const slug of slugs) {
  const block = diagramBlock(netsec, slug);
  page = replaceBetween(page, '<pre data-cardsrc="' + slug + '">', '</pre>',
    hl(block), 'card ' + slug);
  // the summary states the length, so it drifts the moment the figure grows
  const preAt = page.indexOf('<pre data-cardsrc="' + slug + '">');
  const lnAt = page.lastIndexOf('<span class="ln">', preAt);
  const lnEnd = page.indexOf('</span>', lnAt);
  if (lnAt < 0 || lnEnd < 0 || lnEnd > preAt) throw new Error('no line count beside card ' + slug);
  page = page.slice(0, lnAt) + '<span class="ln">' + block.split('\n').length + ' lines' + page.slice(lnEnd);
}
say('  ' + slugs.length + ' gallery card sources refreshed from lectures/network-security');

// ── the compiler's own stylesheet ────────────────────────────────────────
// This was a hand-made copy for a while, and it drifted the first time the
// stylesheet was corrected: `.mono` labels kept rendering in the sans face
// here for a whole commit after the rule that caused it had been fixed in
// build.js. It is lifted from the same build as everything else now.
const CSS_START = '.figure-diagram { margin: 0.7em 0; }';
const CSS_END = '@media (prefers-reduced-motion: reduce) {\n  .psi-diagram .dg-el { transition: none; }\n}';
const ca = live.indexOf(CSS_START);
const cb = live.indexOf(CSS_END, ca);
if (ca < 0 || cb < 0) throw new Error('diagram stylesheet not found in the built view');
const dgCss = live.slice(ca, cb + CSS_END.length);
if (!/\.psi-diagram \.dg-lbl text/.test(dgCss)) throw new Error('stylesheet slice looks wrong');
page = replaceBetween(page, '/* dg-css-start */', '/* dg-css-end */', '\n' + dgCss + '\n', 'diagram stylesheet');
say('  diagram stylesheet ' + dgCss.length + ' bytes, lifted');

// The runtime, verbatim, found by marker and syntax-checked before it is
// written. initDiagrams is the last function in the block, and the only line
// that is exactly "}" at column 0 is the one that closes it.
const a = live.indexOf(RT_START);
const b = live.indexOf(RT_END, a);
if (a < 0 || b < 0) throw new Error('runtime markers not found in the built view');
const end = live.indexOf('\n}\n', b);
if (end < 0) throw new Error('runtime end marker not found in the built view');
const runtime = live.slice(a, end + 3);
if (!/function initDiagrams\(\)/.test(runtime)) throw new Error('runtime slice lost initDiagrams');

// Parse it with node itself rather than in-process: a slice that ends mid
// function is exactly the failure this guards against, and it is invisible
// in the page - a diagram whose runtime never ran shows its static
// attributes, which are the print state, so every figure sits at its last
// beat and looks deliberate.
const probe = path.join(HERE, 'figure-rules/.runtime-probe.mjs');
fs.writeFileSync(probe, runtime);
try {
  execFileSync('node', ['--check', probe], { stdio: ['ignore', 'pipe', 'pipe'] });
} catch (e) {
  throw new Error('lifted runtime does not parse - the markers have drifted:\n' +
    String(e.stderr || e.message).split('\n').slice(0, 4).join('\n'));
} finally {
  fs.rmSync(probe, { force: true });
}
page = replaceBetween(page, '<script id="psi-dg-runtime">', '</script><!--/runtime-->',
  '\n' + runtime + '\n', 'runtime');
say('  runtime ' + runtime.length + ' bytes, parses');

// ── the guard the whole thing exists for ─────────────────────────────────
const roots = [...page.matchAll(/<svg id="([a-z0-9-]+)-root"/g)].map((m) => m[1]);
const dupes = roots.filter((r, i) => roots.indexOf(r) !== i);
if (dupes.length) throw new Error('duplicate figure ids after splice: ' + [...new Set(dupes)].join(', '));
say('  ' + roots.length + ' figures, all ids unique');

if (CHECK) {
  say(page === was ? '\nup to date' : '\nDRIFT: the page does not match a fresh build');
  process.exit(page === was ? 0 : 1);
}
fs.writeFileSync(PAGE, page);
say('\nwrote ' + path.relative(ROOT, PAGE) + ' (' + page.length + ' bytes)' +
  (page === was ? ' - unchanged' : ''));
