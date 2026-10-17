/*
 * The two characters that mean something else inside a template literal –
 * in the literals still left in build.js, and, the other way round, in the
 * runtime files that used to be literals.
 *
 * The runtime scripts and stylesheets were template literals in build.js
 * until they moved into runtime/ (PLAN-runtime-extraction.md). Editing text
 * inside a template literal is not editing a script or a stylesheet: the
 * literal is resolved first, and two ordinary characters mean something
 * there that they mean nowhere else. What is left in build.js is small –
 * the markup constants (*_HTML), the two one-line scripts that run before
 * the first paint (PRINT_VIEW_EARLY_JS, READER_EARLY_JS), DOCUMENT_PAGE_CSS
 * and SANS_STACK_TAIL – and for those both traps still hold:
 *
 *   A raw backtick ends the literal – including one inside a comment, which
 *   is where it always happens, because a comment is where a person writes
 *   `hidden` or `->` to name a thing. build.js then fails to parse, and the
 *   SyntaxError points at the identifier after the backtick, thousands of
 *   lines into the file. That is loud but it names the wrong thing, and it
 *   costs a build to find out. This gate names the line and the reason in
 *   milliseconds; three separate edits in one afternoon hit it while the
 *   runtime was still a literal.
 *
 *   A single-backslash escape in a regex is resolved by the literal, so
 *   source `/\s+/g` emits `/s+/g` – a regex that matches the letter s. This
 *   one ships. Nothing throws, nothing looks wrong in the source, and the
 *   built page runs a regex that quietly does something else. It cost a
 *   search index with every `s` stripped out of its text. Inside a literal
 *   it has to be written `/\\s+/g`; of the literals left, only the two
 *   one-line scripts can hold a regex.
 *
 * **The runtime files carry the second trap the other way round.** A file in
 * runtime/ is the literal's *value*, written from the evaluated literal, so
 * a regex there is written once: `/\s+/g`. A line copied back from an old
 * build.js – a diff, a branch from before the move, a snippet in a plan –
 * brings the doubled form with it, and `/\\s+/g` in a file is a regex for a
 * backslash followed by the letter s. It ships as silently as the original
 * mistake did. So every regex literal in a runtime/*.js file is read, and an
 * even run of backslashes before s, d, w or b (or a capital) is reported –
 * an odd run is a class escape, with or without escaped backslashes before
 * it. A regex that really matches a backslash and one of those letters goes
 * on ALLOWED below, by file and text, with the reason.
 *
 * Finding the regex literals without a parser: the file goes through
 * stripJs first, the tokenizer the build strips every view with, so no
 * comment is left to be read as code; then a slash counts as opening a regex
 * only where nothing else can stand – at a line's start, after a punctuator
 * that ends no operand (= ( , : ; ! & | ? { } [) or after a keyword that
 * takes an expression. Conservative in the safe direction for a gate: a
 * division is never read as a regex, and the one shape it does not see is
 * a regex straight after a closing parenthesis (`if (x) /re/.test(s)`),
 * which no runtime file writes. Measured on the files when this was
 * written: the same 38 regex literals strip-comments.mjs's own tokenizer
 * reads, none missed and none extra. The self-test below holds both
 * scanners to lines that must and must not be reported, so neither passes
 * by reading nothing.
 *
 * The third documented trap, an unterminated block comment swallowing every
 * rule after it, is a hard error at build time – assertStylesheetsWellFormed()
 * runs on every buildOnce and reads the runtime sheets as files. It is not
 * repeated here: a check that already refuses the build does not need a
 * second home. A stray backtick in a runtime script, which cannot end a
 * literal any more, is a syntax error the strip gate finds: it compiles
 * every runtime/*.js file as a script.
 *
 * Not read: diagram-core.mjs, editor.mjs and the other modules spliced in as
 * text. They were never literals, so no line in them was ever written in
 * the doubled form.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './harness.mjs';
import { stripJs } from '../../strip-comments.mjs';

export const name = 'the escapes a template literal resolves, in the literals left and in runtime/';

// A regex in a runtime/*.js file that really matches a backslash followed by
// s, d, w or b (or a capital): [file, the regex as written, why]. Empty: no
// runtime file has one.
const ALLOWED = [];

// A literal opens with `const NAME = \`` and closes with an unescaped
// backtick and a semicolon at the end of a line. Naming the region is what
// lets this gate say which literal a bad line is in rather than only that the
// file has one.
//
// The opener used to require the backtick to be the last character on its
// line, and the closer to be a line that was exactly a backtick and a
// semicolon. That was the shape of the big CSS and JS literals – and not of
// the ones that hold inlined markup, which open with a tag on the same line
// (BLANK_BADGE_HTML opens and closes on one), so none of those was scanned
// while the gate reported seven literals and passed. A raw backtick in them
// ends the literal exactly as it does anywhere else, and inlined markup is
// if anything the likelier place to write one, because a comment beside a
// button is where a person names an attribute.
//
// The content of the opening and closing lines is kept, not skipped: a raw
// backtick on the line that opens a literal is still a raw backtick.
function literalRegions(lines) {
  const out = [];
  let open = null;
  // A backtick preceded by an even number of backslashes is the real thing,
  // not an escaped one. Scanning for it is only safe because any *other*
  // unescaped backtick in a well-formed region is the defect this gate
  // exists to report - so the closer is looked for at the end of a line,
  // where a terminator is, and a stray one in the middle stays content.
  const CLOSE = /(^|[^\\])`\s*;\s*$/;
  const close = (text, no) => {
    const cut = text.replace(CLOSE, (m, p1) => p1 || '');
    if (cut.length) open.lines.push({ no, text: cut });
    out.push(open); open = null;
  };
  lines.forEach((line, i) => {
    const no = i + 1;
    if (open === null) {
      const m = /^const ([A-Z_0-9]+)\s*=\s*`(.*)$/.exec(line);
      if (!m) return;
      open = { name: m[1], from: no, lines: [] };
      // Single-line literals - BLANK_BADGE_HTML is one - open and close here.
      if (CLOSE.test(m[2])) { close(m[2], no); return; }
      if (m[2].length) open.lines.push({ no, text: m[2] });
      return;
    }
    if (CLOSE.test(line)) { close(line, no); return; }
    open.lines.push({ no, text: line });
  });
  return out;
}

// `\s` `\d` `\w` `\b` and their negations inside a regex literal. A single
// backslash elsewhere in a literal is often right - a CSS content: '\\201C'
// is already doubled, a \u escape in a string means to be resolved - so the
// test is narrowed to the one context where a single backslash is always a
// defect: between the slashes of a regex.
const REGEX_LITERAL = /(^|[=(,:;!&|?{[\s])\/(?![/*])((?:\\.|\[(?:\\.|[^\]\\])*\]|[^/\\\n])+)\/[gimsuyv]*/g;
const CLASS_ESCAPE = /(^|[^\\])\\[sdwbSDWB]/;

// The raw-backtick and single-escape findings for a list of regions.
function literalFindings(regions) {
  const ticks = [], escapes = [];
  for (const r of regions) {
    for (const { no, text } of r.lines) {
      // An escaped backtick is how a literal writes a real one on purpose.
      if (text.replace(/\\`/g, '').includes('`')) ticks.push(`${r.name}:${no}  ${text.trim().slice(0, 90)}`);
      const trimmed = text.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;
      for (const m of text.matchAll(REGEX_LITERAL)) {
        if (CLASS_ESCAPE.test(m[2])) {
          escapes.push(`${r.name}:${no}  ${trimmed.slice(0, 90)}`);
          break;
        }
      }
    }
  }
  return { ticks, escapes };
}

// The regex literals of a script, read after stripJs: a slash opens one only
// at a line's start, after a punctuator that ends no operand, or after a
// keyword that takes an expression - never after a name, a number, a string
// or a closing bracket, where it divides. The body is read up to the closing
// slash outside a character class, escapes stepped over.
const RUNTIME_REGEX = /(^|[=(,:;!&|?{}[]|\b(?:return|typeof|case|in|of|delete|void|throw|yield|await)\b)\s*(\/(?![/*])(?:\\.|\[(?:\\.|[^\]\\\n])*\]|[^/\\\n[])+\/[dgimsuyv]*)/g;
// An even run of backslashes before a class letter: an escaped backslash,
// then the plain letter - the doubled form of \s, \d, \w or \b.
const DOUBLED_ESCAPE = /(?<!\\)(?:\\\\)+[sdwbSDWB]/;

// Each as {line, regex}, the line counted in the file as written (the strip
// drops comment lines, so the regex is looked up in the original text).
function runtimeRegexes(text) {
  const out = [];
  let from = 0;
  for (const line of stripJs(text).split('\n')) {
    for (const m of line.matchAll(RUNTIME_REGEX)) {
      const at = text.indexOf(m[2], from);
      if (at >= 0) from = at + m[2].length;
      out.push({ line: at < 0 ? 0 : text.slice(0, at).split('\n').length, regex: m[2] });
    }
  }
  return out;
}

// Both scanners on their own, against lines that must and must not be
// reported - a gate that reads nothing passes everything.
function selfTest(ok) {
  const lit = literalRegions([
    'const A_HTML = `<div>`hidden`</div>`;',
    'const B_JS = `<script>s.replace(/\\s+/g, " ")</script>`;',
    'const C_JS = `<script>s.replace(/\\\\s+/g, " ")</script>`;',
    'const D_HTML = `<b>\\`x\\`</b>`;',
  ]);
  const got = literalFindings(lit);
  ok(lit.length === 4 && got.ticks.length === 1 && got.ticks[0].startsWith('A_HTML:1')
    && got.escapes.length === 1 && got.escapes[0].startsWith('B_JS:2'),
  'the literal scanner reports a raw backtick and a single regex escape, and not an escaped backtick or a doubled escape',
  JSON.stringify(got));

  const doubled = [
    'const re = /[.!?](?=\\\\s)/g;',
    "x = s.replace(/^\\\\s+/, '');",
    'if (/\\\\d/.test(s)) n++;',
    'return /\\\\w+$/u.exec(s);',
    'const r = a ? /\\\\B/ : null;',
  ];
  const clean = [
    'const re = /[.!?](?=\\s)/g;',
    "x = s.split('\\\\n');",
    "const r = new RegExp('\\\\s+');",
    '// a comment holding /\\\\s/ is not code',
    'const q = a / b / c;',
    'const t = n / 2; const u = w / 4;',
    'const b = /\\\\\\s/;',
    'const e = /[\\\\/]/g;',
  ];
  const report = (src) => runtimeRegexes(src).filter(r => DOUBLED_ESCAPE.test(r.regex)).map(r => r.line);
  const hits = report(doubled.join('\n'));
  ok(hits.join() === '1,2,3,4,5',
    'the runtime scanner reports a doubled class escape in a regex after =, (, a call, return and ?', hits.join(','));
  const quiet = report(clean.join('\n'));
  ok(quiet.length === 0,
    'and nothing for a single escape, a string, a comment, a division, an escaped backslash before a class or one in a class',
    quiet.join(','));
}

export async function run({ report }) {
  const { ok, note } = report;
  selfTest(ok);

  // ── the literals left in build.js ──
  const src = fs.readFileSync(path.join(ROOT, 'build.js'), 'utf8').split('\n');
  const regions = literalRegions(src);
  note(regions.length + ' literal(s): ' + regions.map(r => r.name).join(', '));
  const { ticks, escapes } = literalFindings(regions);
  ok(ticks.length === 0,
    'no raw backtick inside an inlined literal - one ends it, and build.js stops parsing',
    ticks.join('\n           '));
  ok(escapes.length === 0,
    'every regex class escape in an inlined literal is doubled - a single one ships as plain text',
    escapes.join('\n           '));

  // ── runtime/*.js, the literals that left: written once, never doubled ──
  const dir = path.join(ROOT, 'runtime');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.js')).sort();
  const allowed = new Map(ALLOWED.map(([f, re, why]) => [`${f} ${re}`, why]));
  const used = new Set();
  const doubled = [];
  let count = 0;
  for (const f of files) {
    const file = 'runtime/' + f;
    for (const { line, regex } of runtimeRegexes(fs.readFileSync(path.join(dir, f), 'utf8'))) {
      count++;
      if (!DOUBLED_ESCAPE.test(regex)) continue;
      const key = `${file} ${regex}`;
      if (allowed.has(key)) { used.add(key); continue; }
      doubled.push(`${file}:${line}  ${regex.slice(0, 90)}`);
    }
  }
  ok(files.length > 0 && count > 0, 'the runtime scripts and their regex literals are found',
    `${files.length} file(s), ${count} regex literal(s)`);
  note(`${count} regex literal(s) in ${files.length} runtime file(s): ${files.join(', ')}`);
  ok(doubled.length === 0,
    'no regex in a runtime/*.js file doubles a class escape - the file is the value, and \\\\s there matches a backslash',
    doubled.join('\n           '));
  const stale = [...allowed.keys()].filter(k => !used.has(k));
  ok(stale.length === 0, 'and every allow-list entry still matches a regex - a stale one is deleted, not kept',
    stale.join('\n           '));
}
