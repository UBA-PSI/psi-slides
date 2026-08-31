/*
 * The two ways an edit to build.js's inlined CSS and JS goes wrong silently,
 * or loudly in a place that names the wrong thing.
 *
 * Roughly two thirds of build.js is stylesheets and runtime scripts held in
 * template literals and written into every output. Editing text inside a
 * template literal is not editing a stylesheet or a script: the literal is
 * resolved first, and two ordinary characters mean something there that they
 * do not mean anywhere else. CLAUDE.md names both, which is the surest sign
 * they have been paid for.
 *
 *   A raw backtick ends the literal - including one inside a comment, which
 *   is where it always happens, because a comment is where a person writes
 *   `hidden` or `->` to name a thing. build.js then fails to parse, and the
 *   SyntaxError points at the identifier after the backtick: "Unexpected
 *   identifier 'hidden'", eight thousand lines into a file, in a CSS comment
 *   about an attribute. That is loud but it names the wrong thing, and it
 *   costs a build to find out. This gate names the line and the reason in
 *   milliseconds. Three separate edits in one afternoon hit it.
 *
 *   A single-backslash escape in a regex is resolved by the literal, so
 *   source `/\s+/g` emits `/s+/g` - a regex that matches the letter s. This
 *   one ships. Nothing throws, nothing looks wrong in the source, and the
 *   built page runs a regex that quietly does something else. It cost a
 *   search index with every `s` stripped out of its text. It has to be
 *   written `/\\s+/g` here.
 *
 * The third documented trap, an unterminated block comment swallowing every
 * rule after it, is already a hard error at build time -
 * `assertStylesheetsWellFormed()` runs on every buildOnce. It is not repeated
 * here: a check that already refuses the build does not need a second home.
 *
 * Scope is deliberately build.js alone. `diagram-core.mjs` and `editor.mjs`
 * are real modules, not text inside a literal, and both characters mean the
 * ordinary thing there.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './harness.mjs';

export const name = 'the inlined CSS and JS survive being edited';

// A literal opens with `const NAME = \`` alone on its line and closes with a
// line that is exactly a backtick and a semicolon. That is the shape every
// one of them is written in, and matching it is what lets this gate say which
// literal a bad line is in rather than only that the file has one.
function literalRegions(lines) {
  const out = [];
  let open = null;
  lines.forEach((line, i) => {
    if (open === null) {
      const m = /^const ([A-Z_0-9]+)\s*=\s*`\s*$/.exec(line);
      if (m) open = { name: m[1], from: i + 1, lines: [] };
      return;
    }
    if (line.trimEnd() === '`;') { out.push(open); open = null; return; }
    open.lines.push({ no: i + 1, text: line });
  });
  return out;
}

// `\s` `\d` `\w` `\b` and their negations inside a regex literal. A single
// backslash elsewhere is often right - '⌄' is a character this file
// means to resolve, and a CSS content: '\\201C' is already doubled - so the
// test is narrowed to the one context where a single backslash is always a
// defect: between the slashes of a regex.
const REGEX_LITERAL = /(^|[=(,:;!&|?{[\s])\/(?![/*])((?:\\.|\[(?:\\.|[^\]\\])*\]|[^/\\\n])+)\/[gimsuyv]*/g;
const CLASS_ESCAPE = /(^|[^\\])\\[sdwbSDWB]/;

export async function run({ report }) {
  const { ok, note } = report;
  const src = fs.readFileSync(path.join(ROOT, 'build.js'), 'utf8').split('\n');
  const regions = literalRegions(src);

  ok(regions.length > 0, 'build.js still holds its inlined CSS and JS in template literals',
    String(regions.length));
  note(regions.length + ' literal(s): ' + regions.map(r => r.name).join(', '));

  // ── a raw backtick ends the literal ──
  const ticks = [];
  for (const r of regions) {
    for (const { no, text } of r.lines) {
      // An escaped backtick is how the file writes a real one on purpose,
      // and it appears in every nested template expression in AUDIENCE_JS.
      if (text.replace(/\\`/g, '').includes('`')) ticks.push(`${r.name}:${no}  ${text.trim().slice(0, 90)}`);
    }
  }
  ok(ticks.length === 0,
    'no raw backtick inside an inlined literal - one ends it, and build.js stops parsing',
    ticks.join('\n           '));

  // ── a single-backslash class escape in a regex is eaten by the literal ──
  const escapes = [];
  for (const r of regions) {
    for (const { no, text } of r.lines) {
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
  ok(escapes.length === 0,
    'every regex class escape in an inlined literal is doubled - a single one ships as plain text',
    escapes.join('\n           '));
}
