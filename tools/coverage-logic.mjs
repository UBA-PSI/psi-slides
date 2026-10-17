#!/usr/bin/env node
/*
 * node tools/coverage-logic.mjs [coverage/lcov.info]
 *
 * build.js's line coverage without its inlined runtime. V8 counts a template
 * literal as one expression, so the moment `const AUDIENCE_JS = ...` is
 * evaluated every line of that script counts as covered, and the file's
 * line figure says more about how much of it is CSS and browser JS than about
 * what the tests exercise. This prints the figure for the lines outside the
 * top-level literal constants, which is the one that should not fall when
 * those literals move into files of their own.
 *
 * A literal's end is found by V8's own parser, not by a pattern: from the
 * `const NAME = ...` line, the first line up to which the text compiles as a
 * function body (`new Function`, which compiles and runs nothing) ends the
 * declaration. A pattern got this wrong once – a literal closing mid-line
 * took the code after it along, and the figure came out four points low.
 *
 * Run by `npm run test:coverage` after c8 has written the report.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LCOV = path.resolve(process.argv[2] || path.join(ROOT, 'coverage', 'lcov.info'));
if (!fs.existsSync(LCOV)) {
  console.log(`coverage-logic: no ${path.relative(ROOT, LCOV)} – run npm run test:coverage first`);
  process.exit(0);
}

const lines = fs.readFileSync(path.join(ROOT, 'build.js'), 'utf8').split('\n');
const inLiteral = new Set();
let constants = 0;
for (let i = 0; i < lines.length; i++) {
  if (!/^(?:export )?const [A-Za-z_$][\w$]* = .*`/.test(lines[i])) continue;
  for (let j = i; j < lines.length; j++) {
    if (!lines[j].includes('`')) continue;
    try { new Function(lines.slice(i, j + 1).join('\n')); } catch { continue; }
    if (j > i) { constants++; for (let n = i + 2; n <= j + 1; n++) inLiteral.add(n); }
    i = j;
    break;
  }
}

const hits = new Map();
let file = null;
for (const line of fs.readFileSync(LCOV, 'utf8').split('\n')) {
  if (line.startsWith('SF:')) file = path.resolve(ROOT, line.slice(3));
  else if (line.startsWith('DA:') && file === path.join(ROOT, 'build.js')) {
    const [n, h] = line.slice(3).split(',');
    hits.set(Number(n), Number(h));
  }
}
if (!hits.size) {
  console.log('coverage-logic: build.js is not in the report');
  process.exit(0);
}

const tally = (keep) => {
  let all = 0, hit = 0;
  for (const [n, h] of hits) if (keep(n)) { all++; if (h > 0) hit++; }
  return `${(100 * hit / all).toFixed(1)} % of ${all.toLocaleString('en')} lines`;
};
console.log(`coverage-logic: build.js ${tally(() => true)}; `
  + `inside its ${constants} multi-line literal constants ${tally(n => inLiteral.has(n))}; `
  + `outside them ${tally(n => !inLiteral.has(n))}`);
