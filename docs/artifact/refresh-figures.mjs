#!/usr/bin/env node
/**
 * Rebuilds every compiled figure in docs/artifact/figures-you-write.html
 * from docs/artifact/figure-rules/source.md.
 *
 *   node docs/artifact/refresh-figures.mjs            # rebuild and splice
 *   node docs/artifact/refresh-figures.mjs --check    # report drift, write nothing
 *
 * The artifact is a hand-written page that embeds machine-made parts: the
 * still figures the rules are argued with, the stepped demos,
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
import { DG_STEP_FIXED } from '../../diagram-core.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const LECTURE = path.join(HERE, 'figure-rules/source.md');
const PAGE = path.join(HERE, 'figures-you-write.html');
const CHECK = process.argv.includes('--check');

// The chunk ids are the contract with the lecture. Renaming one there without
// renaming it here is the one edit that breaks this quietly.
// The masthead figure. Its listing keeps the fence, which is what shows where
// a diagram block sits in a lecture file, and drops the comments, which are
// notes to whoever maintains this lecture. No other list pairs those two
// treatments: PAIRS drops both, SHAPES keeps both.
const OPENERS = ['hero'];
// The opening section builds one figure a line at a time, so its chunks are
// cumulative: each is the previous one plus what that step introduces.
const BASICS = ['b1', 'b2', 'b3', 'b4', 'b5', 'b6'];
// The advanced specimens. Their listings were written by hand beside compiled
// drawings until one of them lost the two lines that draw a marker and a point
// visible in its own figure.
// sp4b/sp4c and sp11 are the two rows that used to be paragraphs four to six
// of #sp4 and paragraph three of #sp6: one column of prose a screen and a half
// tall beside one small plot. A claim about what a chart's proportions are, or
// about a dependency that cannot be written, is a drawing like any other.
const SPECS = ['sp1', 'sp2', 'sp3', 'sp10', 'sp8', 'sp9', 'sp4', 'sp4b', 'sp4c', 'sp5', 'sp6', 'sp11', 'sp7'];
// The still arrangements a lecture keeps asking for; the table and the stepped
// protocol are in DEMOS instead, because both are argued a beat at a time.
// Their listings keep their comments and their fence, unlike the specimens
// above: the page says they are real source in the number of lines shown, and
// half a block is not that.
const SHAPES = ['fc', 'swim', 'tree', 'seq'];
const STILLS = [
  ...OPENERS,
  ...BASICS,
  ...SPECS,
  ...SHAPES,
  'r1w', 'r1r', 'r2w', 'r2r', 'r3w', 'r3r',
  'r6aw', 'r6ar', 'r6c', 'r6bw', 'r6br', 'r7w', 'r7r', 'r8w', 'r8r', 'r8s',
  'r11w', 'r11r', 'r14w', 'r14r',
  'tones',
];
// `bare: true` strips the block's comments from the listing. Every demo but
// the masthead one keeps them, because there they carry the explanation. The
// masthead demo has to show the *shape* of a stepped block - the cast at the
// top, the beats underneath, one blank line between - and six lines of
// commentary sitting in that blank line hide it.
const DEMOS = [
  { chunk: 'follow', prefix: 'dgfollow', bare: true },
  { chunk: 'beats-demo', prefix: 'dgbeat' },
  { chunk: 'move-demo', prefix: 'dgmove' },
  { chunk: 'table-demo', prefix: 'dgtable' },
  { chunk: 'seq-demo', prefix: 'dgseq' },
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
const KW = /\b(box|edge|text|container|brace|dot|image|bars|grid|plot|table|lanes|sequence|actor|note|align|spread|default|same as|series of|stacked|right of|left of|below|above|between|over|via|point|at|gap|pad|space|col|row|band|header|tick|side|flush|offset)\b/g;
// The prominence verbs are the prominence classes, which is the whole of item
// 1: `calm` was a fourth name for a state the class list already had, and
// `ghost` was reachable as a class and not as a step. Keep this list equal to
// DG_STEP_OPS - a verb missing here is silently unpainted in every listing.
const STEP_OPS = /^(\s*)(step|show|hide|move|emph|dim|ghost|style|label)\b/;

function hl(src) {
  const held = [];
  // The placeholder has to be something the source cannot contain. It was
  // ' N ' - a space, an index, a space - which `gap 0 same as tp` matches
  // exactly, so every listing with a bare number in it had a span from
  // somewhere else spliced into the middle of a word.
  const park = (s) => '\u0000' + (held.push(s) - 1) + '\u0000';
  return src.split('\n').map((line) => {
    const esc = line.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    // A comment is a line like any other, so it carries `srcln` like any
    // other. It did not: the lines are joined with nothing because `srcln` is
    // `display: block` and supplies its own break, so a bare inline `cm` had
    // nothing separating it from the line before, and a run of comment lines
    // arrived as one paragraph with the hashes buried in it.
    if (/^\s*#/.test(line)) return '<span class="srcln cm">' + esc + '</span>';
    let t = esc;
    t = t.replace(/"[^"]*"/g, (m) => park('<span class="cl">' + m + '</span>'));
    t = t.replace(/\{[^}]*\}/g, (m) => park('<span class="cl">' + m + '</span>'));
    // step ops read as the spine of a stepped figure, so they get their own
    // weight rather than the keyword colour every placement word carries
    t = t.replace(STEP_OPS, (m, sp2, op) => sp2 + '<span class="st">' + op + '</span>');
    t = t.replace(KW, (m) => '<span class="kw">' + m + '</span>');
    // Each source line is its own block, so a hanging indent hangs per line.
    // Set on the <pre> instead, text-indent outdents only the first physical
    // line of the whole listing and indents every other one, which makes a
    // wrapped continuation indistinguishable from the next statement.
    return '<span class="srcln">' + t.replace(/\u0000(\d+)\u0000/g, (_, i) => held[+i]) + '</span>';
    // Joined with nothing: each line is a block now, so the newline that used
    // to separate them would render as a second break and leave a blank line
    // after every statement.
  }).join('');
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
  // Two families of id have to be renamed, not one. The element ids are
  // numbered per document; the <symbol> an embedded picture is defined in is
  // numbered per *figure*, so two figures out of the same build both call
  // theirs psi-sym-1. Lifted into one page, the second figure's <use> resolves
  // against the first figure's symbol - which is how the base-rate figure came
  // to show a smiling face where its own file draws a frown, with a correct
  // reference pointing at a correct symbol belonging to somebody else.
  return {
    svg: svg.split(m[1] + '-').join(prefix + '-').split('psi-sym-').join(prefix + '-sym-'),
    old: m[1],
  };
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

// ── webfonts, embedded ───────────────────────────────────────────────────
// The page fetched its three families from Google Fonts, which is one request
// to a third party telling them who reads the documentation of a tool whose
// whole promise is that its own outputs fetch nothing at run time. The same
// reasoning the project site already follows, and the same three families
// build.js bundles into every lecture - read out of node_modules rather than
// checked in, for the same reason bundledFaces() does: the packages carry
// their own licence files and npm install is required anyway.
//
// All three are SIL OFL 1.1, which grants permission to "use, study, copy,
// merge, embed, modify" and requires the notice to travel with the bytes.
//
// The wght file, never the opsz one. Literata ships both, and the optical
// size axis is what made a 74px heading arrive as a Didone while the lectures
// showed a text face - see the font-optical-sizing note on the headings.
const PAGE_FONTS = [
  ['Literata',      'literata',      'literata-latin-wght'],
  ['IBM Plex Sans', 'ibm-plex-sans', 'ibm-plex-sans-latin-wght'],
  ['JetBrains Mono','jetbrains-mono','jetbrains-mono-latin-wght'],
];
const OFL = `/* Literata, IBM Plex Sans and JetBrains Mono, each under the SIL Open
   Font License 1.1 (https://openfontlicense.org). The licence permits this
   embedding and requires the notice to travel with it. Full text:
   node_modules/@fontsource-variable/<family>/LICENSE */`;

function pageFontCss() {
  const out = [OFL];
  let bytes = 0;
  for (const [family, pkg, stem] of PAGE_FONTS) {
    for (const style of ['normal', 'italic']) {
      const file = path.join(ROOT, 'node_modules/@fontsource-variable', pkg, 'files', stem + '-' + style + '.woff2');
      if (!fs.existsSync(file)) throw new Error('font missing, run npm install: ' + file);
      const b64 = fs.readFileSync(file).toString('base64');
      bytes += b64.length;
      out.push('@font-face{font-family:\'' + family + "';font-style:" + style +
        ';font-weight:100 900;font-display:block;src:url(data:font/woff2;base64,' +
        b64 + ") format('woff2')}");
    }
  }
  return { css: out.join('\n'), bytes };
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

// ── the anatomy diagram, drawn from the code line it annotates ───────────
// Counting columns by hand put every bracket one to four characters too wide,
// and the error accumulated along the line, so the last one sat four columns
// right of the token it pointed at. Generated, it cannot.
const ANAT_CODE = 'box   sw   "Switch"   right of a gap 1.15   w 1.2   {.tone-1 @net}';
const ANAT_GROUPS = [
  ['box', 'statement: what kind of thing this is'],
  ['sw', 'name: how later lines refer to this element. Never drawn'],
  ['"Switch"', 'label: what the reader sees. Optional, and "" is a legal empty one'],
  ['right of a gap 1.15', 'placement: where it goes, relative to something else'],
  ['w 1.2', 'options: size, padding, routing'],
  ['{.tone-1 @net}', 'tail: classes and tags'],
];

function anatomy() {
  let from = 0;
  const spans = ANAT_GROUPS.map(([tok, label]) => {
    const a = ANAT_CODE.indexOf(tok, from);
    if (a < 0) throw new Error('anatomy: token not in the code line: ' + tok);
    from = a + tok.length;
    return { a, b: a + tok.length - 1, tick: a + Math.floor((tok.length - 1) / 2), label };
  });
  const put = (row, col, str) => {
    while (row.length < col) row.push(' ');
    for (let i = 0; i < str.length; i++) row[col + i] = str[i];
  };

  // ASCII only, and that is the whole point. The box-drawing characters this
  // used to be made of are not in the mono face - measured at 7.129px against
  // its own 7.105 - so they arrive from whatever fallback the reader's machine
  // picks, and the drift depends on the machine. It measured within a pixel
  // here and ran tens of pixels out on the author's screen. Underscore, pipe,
  // hyphen and apostrophe are in every mono face there is.
  const rule = [];
  for (const sp of spans) put(rule, sp.a, '_'.repeat(sp.b - sp.a + 1));

  const order = [...spans].reverse();
  const rows = order.map((sp, i) => {
    const row = [];
    for (const t of order.slice(i + 1)) put(row, t.tick, '|');
    put(row, sp.tick, "'-- " + sp.label);
    return row.join('').replace(/\s+$/, '');
  });
  // one row of bare stems between the rule and the first label, so the rule
  // and the leaders do not touch
  const stems = [];
  for (const sp of spans) put(stems, sp.tick, '|');

  const esc = (t) => t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const code = esc(ANAT_CODE)
    .replace('box', '<span class="kw">box</span>')
    .replace('"Switch"', '<span class="cl">"Switch"</span>')
    .replace('right of', '<span class="kw">right of</span>')
    .replace(' gap ', ' <span class="kw">gap</span> ')
    .replace('w 1.2', '<span class="kw">w</span> 1.2')
    .replace('{.tone-1 @net}', '<span class="cl">{.tone-1 @net}</span>');

  const ruleStr = rule.join('').replace(/\s+$/, '');
  for (const sp of spans) {
    const seg = ruleStr.slice(sp.a, sp.b + 1);
    if (seg !== '_'.repeat(sp.b - sp.a + 1)) {
      throw new Error('anatomy: rule under "' + ANAT_CODE.slice(sp.a, sp.b + 1) + '" is wrong');
    }
    if (ruleStr[sp.a - 1] === '_' || ruleStr[sp.b + 1] === '_') {
      throw new Error('anatomy: rule under "' + ANAT_CODE.slice(sp.a, sp.b + 1) + '" runs into its neighbour');
    }
  }
  if (/[^\x20-\x7e]/.test(ruleStr + stems.join('') + rows.join(''))) {
    throw new Error('anatomy: the drawing must be ASCII, or it will not stay aligned');
  }
  return code + '\n<span class="an">' + esc(ruleStr) + '\n'
    + esc(stems.join('').replace(/\s+$/, '')) + '\n' + rows.map(esc).join('\n') + '</span>';
}
page = replaceBetween(page, '<pre class="anat">', '</pre>', anatomy(), 'anatomy diagram');

// ── which classes a beat cannot change ───────────────────────────────────
// Generated, not transcribed. The page carried no account of this at all,
// although it is a real authoring boundary: seventeen of the forty-one classes
// are legal on an element's own line and refused inside a `step`, so a reader
// who had been told the prominence verbs *are* the prominence classes would
// reasonably expect any class to work in a beat and be refused by nearly half
// the vocabulary. `DG_STEP_FIXED` is the compiler's own answer, and it is
// already grouped by what each class settles, so the sentence it produces is
// the reason as well as the list - which is why this is spliced from the table
// rather than written out beside it, where the next consolidation would leave
// it behind exactly as it left "sixteen statements" behind.
function stepFixed() {
  const cs = (list) => list.map(c => '<code>.' + c + '</code>').join(' ');
  const parts = Object.entries(DG_STEP_FIXED).map(([what, list]) => what + ' (' + cs(list) + ')');
  return parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1];
}
page = replaceBetween(page, '<!--stepfixed:start-->', '<!--stepfixed:end-->',
  stepFixed(), 'step-fixed class list');
say('  ' + Object.values(DG_STEP_FIXED).flat().length
  + ' step-fixed classes listed from DG_STEP_FIXED');

say('  anatomy diagram drawn from its own code line');

// ── the masthead figure: its whole block, minus the maintainer's comments ──
for (const id of OPENERS) {
  page = replaceBetween(page, '<pre data-opensrc="' + id + '">', '</pre><!--/opensrc-->',
    hl(diagramBlock(lectureMd, id).split('\n').filter((l) => !/^\s*#/.test(l)).join('\n')),
    'opener source ' + id);
}
say('  ' + OPENERS.length + ' masthead listing refreshed from the lecture');

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
    // Joined with nothing, for the reason hl() is: every line comes back as a
    // `srcln`, which is `display: block` and brings its own break, so a
    // newline here is a second one. It was one, and these six listings came
    // out double-spaced with the `add` wash painted down the blank lines.
  }).join('');
  page = replaceBetween(page, '<pre data-basicsrc="' + id + '">', '</pre><!--/basicsrc-->',
    marked, 'basics ' + id);
  prevLines = lines;
}
say('  ' + BASICS.length + ' tutorial steps, additions marked by diff');

// ── the wrong/right pairs show their own source ──────────────────────────
// Hand-copied until the day the drawings were compiled and the listings were
// not: rule 8 gained a `.bottom` and a shorter box, the picture changed and
// the text beside it went on describing the version before.
const PAIRS = ['r1w', 'r1r', 'r2w', 'r2r', 'r3w', 'r3r',
  'r6aw', 'r6ar', 'r6c', 'r6bw', 'r6br', 'r7w', 'r7r', 'r8w', 'r8r', 'r8s',
  'r11w', 'r11r', 'r14w', 'r14r'];
for (const id of PAIRS) {
  page = replaceBetween(page, '<pre data-pairsrc="' + id + '">', '</pre>',
    hl(diagramBlock(lectureMd, id).split('\n').filter((l) => !/^\s*#/.test(l) && l !== ':::' && !l.startsWith(':::')).join('\n')),
    'pair source ' + id);
}
say('  ' + PAIRS.length + ' wrong/right listings refreshed from the lecture');

for (const { chunk, prefix, bare } of DEMOS) {
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

  const demoBlock = bare
    ? diagramBlock(lectureMd, chunk).split('\n').filter((l) => !/^\s*#/.test(l)).join('\n')
    : diagramBlock(lectureMd, chunk);
  page = replaceBetween(page, '<pre class="demo-src" data-demosrc="' + chunk + '">', '</pre><!--/demosrc-->',
    hl(demoBlock), 'source ' + chunk);

  say('  ' + chunk + ': ' + data.n + ' beats [' + data.names.join(', ') + '], rail and source in step');
}

for (const id of SPECS) {
  page = replaceBetween(page, '<pre data-specsrc="' + id + '">', '</pre><!--/specsrc-->',
    hl(diagramBlock(lectureMd, id).split('\n').filter((l) => !/^\s*#/.test(l) && !l.startsWith(':::')).join('\n')),
    'specimen source ' + id);
}
say('  ' + SPECS.length + ' advanced listings refreshed from the lecture');

for (const id of SHAPES) {
  page = replaceBetween(page, '<pre data-specsrc="' + id + '">', '</pre><!--/specsrc-->',
    hl(diagramBlock(lectureMd, id)), 'shape source ' + id);
}
say('  ' + SHAPES.length + ' whole-block listings refreshed from the lecture');

// ── the gallery: the figures themselves, then their source ───────────────
// These were screenshots for a while, which meant they showed whatever the
// compiler did on the day the screenshot was taken. A fix to the compiler
// could not reach them, and one did not: `.mono` labels went on rendering in
// the sans face in the gallery long after the rule was corrected. They are
// compiled figures now, so they follow this page's theme and cannot go stale.
// The live build, not the print one: it is the only pass that emits the
// per-beat geometry, and its static attributes are still the print state, so
// a card that is never opened shows the finished picture exactly as before.
build('--audience-only', NETSEC);
const netsecHtml = fs.readFileSync(path.join(ROOT, 'lectures/network-security/audience.html'), 'utf8');
const netsec = fs.readFileSync(NETSEC, 'utf8');
const slugs = [...page.matchAll(/<pre data-cardsrc="([a-z0-9-]+)">/g)].map((m) => m[1]);

let gal = 0;
let stepped = 0;
for (const slug of slugs) {
  const pre = 'gal' + slug.replace(/-/g, '');
  const { svg, old } = svgFor(netsecHtml, slug, pre);
  let payload = payloadFor(netsecHtml, old, pre) || '';
  let names = [];
  if (payload) {
    const data = JSON.parse(payload.slice(payload.indexOf('>') + 1, payload.lastIndexOf('</script>')));
    names = data.names || [];
    // A different class from the one initDiagrams() looks for. These figures
    // must stay at the last beat until a reader opens the card: registering
    // them at load would swap in the viewBox that holds every beat and rewind
    // them to the first, so fifteen finished pictures would become fifteen
    // half-drawn ones for no reason the reader asked for.
    payload = payload.replace('class="psi-diagram-frames"', 'class="psi-card-frames"');
    stepped++;
  }
  page = replaceBetween(page, '<div class="shot" data-shot="' + slug + '">', '</div><!--/shot-->',
    svg + payload, 'gallery figure ' + slug);

  const bar = names.length
    ? ['opening', ...names].map((nm, i) =>
        '\n          <li><button type="button">' + (i === 0 ? '' : '<b>' + i + '</b> ')
        + nm.replace(/[&<>]/g, '') + '</button></li>').join('')
    : '';
  page = replaceBetween(page, '<ol class="rail" data-cardrail="' + slug + '">', '</ol><!--/cardrail-->',
    bar + '\n        ', 'card rail ' + slug);
  gal++;
}
say('  ' + gal + ' gallery figures compiled, ' + stepped + ' of them with beats');

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

const pf = pageFontCss();
page = replaceBetween(page, '/* fonts-start */', '/* fonts-end */', '\n' + pf.css + '\n', 'webfonts');
say('  6 webfaces embedded, ' + Math.round(pf.bytes / 1024) + ' KB base64 (OFL-1.1)');

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
// Every id in the page, not only the figure roots. The root check passed for
// a whole commit while two figures shared a <symbol> id, because the thing
// that collided was not a root.
const allIds = [...page.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
const dupes = [...new Set(allIds.filter((r, i) => allIds.indexOf(r) !== i))];
if (dupes.length) {
  throw new Error('duplicate ids after splice (' + dupes.length + '): ' + dupes.slice(0, 8).join(', '));
}
const roots = allIds.filter((i) => /-root$/.test(i));
say('  ' + roots.length + ' figures, ' + allIds.length + ' ids, all unique');

if (CHECK) {
  say(page === was ? '\nup to date' : '\nDRIFT: the page does not match a fresh build');
  process.exit(page === was ? 0 : 1);
}
fs.writeFileSync(PAGE, page);
say('\nwrote ' + path.relative(ROOT, PAGE) + ' (' + page.length + ' bytes)' +
  (page === was ? ' - unchanged' : ''));
