#!/usr/bin/env node
/*
 * node tools/runtime-literals.mjs                       # the inventory
 * node tools/runtime-literals.mjs --extract NAME FILE   # write a static one out
 *
 * The working tool of PLAN-runtime-extraction.md: which multi-line template
 * literals build.js still carries at the top level, and, for one with no
 * substitution, its value written to a file of its own.
 *
 * A literal's end is found by V8's parser, never by a pattern: from the
 * `const NAME = ...` line, the first line up to which the text compiles as a
 * function body ends the declaration (`new Function` compiles; nothing in
 * build.js runs). A line-pattern guess was wrong once in this project – a
 * literal closing mid-line took the code after it along.
 *
 * Each literal is then evaluated through a tag function, in a scope where
 * every name build.js would supply is a stand-in, so the substitutions are
 * counted rather than grepped (an escaped \${ is a browser template, not a
 * substitution) and the value is told apart from the source text. The two
 * differ wherever the source has an escape: `\\s` in build.js is `\s` in the
 * page. That is why a file is written from the value and never copied out of
 * the source, and why --extract reads its file back and compares.
 *
 * --extract moves nothing in build.js: replacing the literal with a read of
 * the file is a hand edit, checked by the byte identity of every view.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lines = fs.readFileSync(path.join(ROOT, 'build.js'), 'utf8').split('\n');

// Any name the scope does not know is this: callable, and every property of
// it is itself, so `${a.b(c).d}` evaluates without build.js being loaded.
const any = new Proxy(function () {}, {
  get: (t, k) => (k === Symbol.toPrimitive ? () => '' : any),
  apply: () => any,
  construct: () => any,
});
const scope = new Proxy({}, {
  has: (t, k) => typeof k === 'string' && !(k in globalThis) && k !== '__tag',
  // `with` asks its scope for Symbol.unscopables first; answering with the
  // stand-in would mark every name unscopable and send it past the scope.
  get: (t, k) => (k === Symbol.unscopables ? undefined : any),
});

function literals() {
  const found = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(?:export )?const ([A-Za-z_$][\w$]*) = (.*`.*)$/);
    if (!m) continue;
    for (let j = i; j < lines.length; j++) {
      if (!lines[j].includes('`')) continue;
      try { new Function(lines.slice(i, j + 1).join('\n')); } catch { continue; }
      if (j > i) found.push({ name: m[1], line: i + 1, end: j + 1, ...evaluate(i, j, m[2]) });
      i = j;
      break;
    }
  }
  return found;
}

function evaluate(i, j, head) {
  const rhs = [head, ...lines.slice(i + 1, j + 1)].join('\n').replace(/;\s*$/, '');
  const raw = rhs.startsWith('String.raw`');
  const template = raw ? rhs.slice('String.raw'.length) : rhs;
  if (!template.startsWith('`') || !template.endsWith('`')) return { kind: 'expression' };
  let strings, subs;
  const tag = (s, ...v) => { strings = s; subs = v.length; };
  try {
    new Function('__scope', '__tag', `with (__scope) { return __tag${template}; }`)(scope, tag);
  } catch (e) {
    return { kind: 'unevaluated', why: e.message };
  }
  const source = strings.raw.join('${…}');
  const value = raw ? source : strings.join('${…}');
  return {
    kind: 'template',
    subs,
    escapedDollar: (source.match(/\\\$\{/g) || []).length,
    backslashes: (source.match(/\\/g) || []).length,
    valueIsSource: value === source,
    value: subs === 0 ? (raw ? strings.raw[0] : strings[0]) : null,
  };
}

const args = process.argv.slice(2);
const all = literals();

if (args[0] === '--extract') {
  const [, name, file] = args;
  if (!name || !file) { console.error('usage: --extract NAME FILE'); process.exit(1); }
  const lit = all.find(l => l.name === name);
  if (!lit) { console.error(`${name}: no multi-line literal constant of that name in build.js`); process.exit(1); }
  if (lit.kind !== 'template' || lit.subs !== 0) {
    console.error(`${name}: ${lit.kind === 'template' ? `${lit.subs} substitution(s)` : lit.kind} – only a static literal is written out; one with substitutions needs the scheme the plan designs for it`);
    process.exit(1);
  }
  const out = path.resolve(file);
  if (fs.existsSync(out)) { console.error(`${path.relative(ROOT, out)} exists; not overwritten`); process.exit(1); }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, lit.value);
  const back = fs.readFileSync(out, 'utf8');
  if (back !== lit.value) { console.error('read back differs from the value – not trusted'); process.exit(1); }
  console.log(`${name} (build.js ${lit.line}-${lit.end}) -> ${path.relative(ROOT, out)}: `
    + `${back.split('\n').length - 1} lines, ${Buffer.byteLength(back)} bytes, `
    + `${lit.valueIsSource ? 'value equals the source text' : 'value differs from the source text (escapes resolved)'}`);
  process.exit(0);
}

const pad = (s, n) => String(s).padEnd(n);
console.log(`${pad('literal', 24)}${pad('lines', 13)}${pad('len', 6)}${pad('${}', 5)}${pad('\\${', 5)}${pad('\\', 5)}value`);
for (const l of all) {
  const cols = l.kind === 'template'
    ? `${pad(l.subs, 5)}${pad(l.escapedDollar, 5)}${pad(l.backslashes, 5)}${l.valueIsSource ? '= source' : '≠ source'}`
    : l.kind + (l.why ? `: ${l.why}` : '');
  console.log(`${pad(l.name, 24)}${pad(`${l.line}-${l.end}`, 13)}${pad(l.end - l.line + 1, 6)}${cols}`);
}
const t = all.filter(l => l.kind === 'template');
console.log(`\n${all.length} literal constants, ${all.reduce((n, l) => n + l.end - l.line + 1, 0)} lines; `
  + `${t.filter(l => l.subs === 0).length} static, ${t.filter(l => l.subs > 0).length} with substitutions`
  + (all.length > t.length ? `, ${all.length - t.length} not evaluated` : ''));
