#!/usr/bin/env node
/*
 * node tools/runtime-literals.mjs                                  # the inventory
 * node tools/runtime-literals.mjs --extract NAME FILE              # write one out
 * node tools/runtime-literals.mjs --extract NAME FILE --names A,B  # ... naming its placeholders
 *                                       (a name in comment delimiters: the comment form)
 *
 * The working tool of PLAN-runtime-extraction.md: which multi-line template
 * literals build.js still carries at the top level, and, for one of them, its
 * value written to a file of its own.
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
 * A literal with substitutions is written with a placeholder where each one
 * stood – __PSI_NAME__, the plan's "Substitution scheme" – and the names are
 * `--names A,B,...` in the order the substitutions stand, or else derived
 * from each expression's text (PRINT_PREF_KEYS.scheme -> PRINT_PREF_KEYS_SCHEME);
 * a name given inside comment delimiters is placed in the comment form, the
 * placeholder wrapped in a comment of its own.
 * The check is then the round trip the build will make: the literal is
 * evaluated for real, its substitutions too, by resolving every name the
 * expressions reach to its top-level declaration in build.js (a const or a
 * function, or an import from one of the zero-dep modules beside it); the
 * file is filled with those values by build.js's own fillRuntime, lifted out
 * as text; and the result has to be the literal's value, character for
 * character. The table the getter needs is printed, to paste where the
 * literal stood.
 *
 * --extract moves nothing in build.js: replacing the literal with a read of
 * the file is a hand edit, checked by the byte identity of every view.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const buildText = fs.readFileSync(path.join(ROOT, 'build.js'), 'utf8');
const lines = buildText.split('\n');

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

// From line i, the first line j at which lines i..j compile as a function
// body: the end of the statement that starts on line i.
function statementEnd(i) {
  for (let j = i; j < lines.length; j++) {
    try { new Function(lines.slice(i, j + 1).join('\n')); return j; } catch { /* not yet */ }
  }
  return -1;
}

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
    template, raw,
    segments: raw ? [...strings.raw] : [...strings],
    rawSegments: [...strings.raw],
  };
}

// The text of each substitution's expression, recovered from the template's
// source: after raw segment k and its `${`, the expression ends at the first
// `}` from which the next raw segment follows and up to which the text
// compiles as an expression – a `}` inside an object literal does neither.
function expressions(lit) {
  const t = lit.template, rs = lit.rawSegments, out = [];
  let pos = 1 + rs[0].length;
  for (let k = 0; k < rs.length - 1; k++) {
    if (!t.startsWith('${', pos)) throw new Error(`${lit.name}: expected \${ at offset ${pos}`);
    pos += 2;
    let q = pos, expr = null;
    for (; (q = t.indexOf('}', q)) >= 0; q++) {
      if (!t.startsWith(rs[k + 1], q + 1)) continue;
      try { new Function(`return (${t.slice(pos, q)});`); expr = t.slice(pos, q); break; } catch { /* not this one */ }
    }
    if (expr === null) throw new Error(`${lit.name}: substitution ${k + 1} has no end`);
    out.push(expr.trim());
    pos = q + 1 + rs[k + 1].length;
  }
  return out;
}

// The real values: every name an expression reaches is resolved to its
// top-level declaration in build.js and evaluated in this same scope, so a
// function finds the names its body uses the same way. Imports from Node
// itself and from the zero-dep modules beside build.js are imported; a
// package is refused, so a value that needs marked or Shiki cannot be checked
// here and the build's byte identity is the only check.
async function realScope() {
  const imported = new Map();
  const load = (spec) => import(spec.startsWith('node:') ? spec : pathToFileURL(path.join(ROOT, spec)).href);
  for (const m of buildText.matchAll(/^import \{([^}]*)\} from '(\.\/[^']+|node:[^']+)';/gm)) {
    const mod = await load(m[2]);
    for (const spec of m[1].split(',').map(s => s.trim()).filter(Boolean)) {
      const [from, as = from] = spec.split(/\s+as\s+/);
      imported.set(as, mod[from]);
    }
  }
  for (const m of buildText.matchAll(/^import (\w+) from '(node:[^']+)';/gm)) imported.set(m[1], (await load(m[2])).default);
  const cache = new Map();
  let real;
  const resolve = (k) => {
    if (cache.has(k)) return cache.get(k);
    if (imported.has(k)) { cache.set(k, imported.get(k)); return imported.get(k); }
    const esc = k.replace(/\$/g, '\\$');
    const declRe = new RegExp(`^(?:export )?(?:const|let|var) ${esc} = `);
    const fnRe = new RegExp(`^(?:export )?(?:async )?function\\*? ${esc}\\(`);
    const i = lines.findIndex(l => declRe.test(l) || fnRe.test(l));
    if (i < 0) throw new Error(`cannot resolve ${k}: no top-level declaration or relative import in build.js`);
    const j = statementEnd(i);
    if (j < 0) throw new Error(`cannot resolve ${k}: its declaration at build.js:${i + 1} does not end`);
    let text = lines.slice(i, j + 1).join('\n').replace(/^export /, '');
    const expr = fnRe.test(lines[i]) ? text : text.replace(declRe, '').replace(/;\s*$/, '');
    const v = new Function('__scope', `with (__scope) { return (${expr}); }`)(real);
    cache.set(k, v);
    return v;
  };
  real = new Proxy({}, {
    has: (t, k) => typeof k === 'string' && !(k in globalThis),
    get: (t, k) => (typeof k === 'string' ? resolve(k) : undefined),
  });
  // Wrapped: an async function's result is asked for `then`, which the
  // proxy would try to resolve as a name.
  return { real };
}

// build.js's own filler, lifted as text, so the round trip is the build's.
function liftFillRuntime() {
  const start = buildText.indexOf('\nfunction fillRuntime(');
  const end = buildText.indexOf('\n}\n', start);
  if (start < 0 || end < 0) throw new Error('fillRuntime not found in build.js');
  return new Function(buildText.slice(start, end + 2) + '\nreturn fillRuntime;')();
}

const NAME_RE = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/;
const derive = (expr) => expr.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');

const args = process.argv.slice(2);
const all = literals();

if (args[0] === '--extract') {
  const [, name, file] = args;
  const ni = args.indexOf('--names');
  const given = ni > 0 ? (args[ni + 1] || '').split(',').map(s => s.trim()) : null;
  if (!name || !file || file.startsWith('--')) { console.error('usage: --extract NAME FILE [--names A,B,...]'); process.exit(1); }
  const lit = all.find(l => l.name === name);
  if (!lit) { console.error(`${name}: no multi-line literal constant of that name in build.js`); process.exit(1); }
  if (lit.kind !== 'template') { console.error(`${name}: ${lit.kind} – not a template literal this tool can evaluate`); process.exit(1); }
  if (given && lit.subs === 0) { console.error(`${name}: static, so --names has nothing to name`); process.exit(1); }
  const out = path.resolve(file);
  if (fs.existsSync(out)) { console.error(`${path.relative(ROOT, out)} exists; not overwritten`); process.exit(1); }

  let text = lit.value, table = null;
  if (lit.subs > 0) {
    const exprs = expressions(lit);
    // A name given as /*NAME*/ writes the comment form, /*__PSI_NAME__*/,
    // for a generated block, where only a comment keeps the file valid CSS.
    const commented = (given || []).map(n => /^\/\*.*\*\/$/.test(n));
    const names = given ? given.map(n => n.replace(/^\/\*(.*)\*\/$/, '$1')) : exprs.map(derive);
    if (names.length !== exprs.length) { console.error(`${name}: ${exprs.length} substitution(s), ${names.length} name(s)`); process.exit(1); }
    for (const [k, n] of names.entries()) {
      if (!NAME_RE.test(n)) { console.error(`${name}: "${n}" is not a placeholder name (capitals, digits, single underscores)`); process.exit(1); }
      const first = names.indexOf(n);
      if (first !== k && exprs[first] !== exprs[k]) {
        console.error(`${name}: ${n} names two different expressions, ${exprs[first]} and ${exprs[k]}`); process.exit(1);
      }
    }
    if (lit.segments.some(s => s.includes('__PSI_'))) { console.error(`${name}: its text already contains __PSI_ – a placeholder would not be told apart`); process.exit(1); }
    const slot = (k) => (commented[k] ? `/*__PSI_${names[k]}__*/` : `__PSI_${names[k]}__`);
    text = lit.segments.map((s, k) => (k ? slot(k - 1) : '') + s).join('');

    const { real } = await realScope();
    let truth;
    try {
      truth = new Function('__scope', `with (__scope) { return ${lit.raw ? 'String.raw' : ''}${lit.template}; }`)(real);
    } catch (e) { console.error(`${name}: cannot evaluate the literal for real – ${e.message}`); process.exit(1); }
    const values = {};
    for (const [k, n] of names.entries()) {
      values[n] = new Function('__scope', `with (__scope) { return (${exprs[k]}); }`)(real);
    }
    let filled;
    try { filled = liftFillRuntime()(path.relative(ROOT, out), text, values); } catch (e) { console.error(`${name}: fillRuntime refused – ${e.message}`); process.exit(1); }
    if (filled !== truth) { console.error(`${name}: filling the placeholders does not give the literal's value back – not written`); process.exit(1); }
    table = names.map((n, k) => names.indexOf(n) === k ? `  ${n}: ${exprs[k]},` : null).filter(Boolean);
  }

  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, text);
  const back = fs.readFileSync(out, 'utf8');
  if (back !== text) { console.error('read back differs from what was written – not trusted'); process.exit(1); }
  console.log(`${name} (build.js ${lit.line}-${lit.end}) -> ${path.relative(ROOT, out)}: `
    + `${back.split('\n').length - 1} lines, ${Buffer.byteLength(back)} bytes, `
    + `${lit.valueIsSource ? 'value equals the source text' : 'value differs from the source text (escapes resolved)'}`
    + (table ? `; ${lit.subs} placeholder(s), filled back to the literal's value exactly` : ''));
  if (table) console.log(`\nThe values, to stand where the literal stood:\n\nconst ${name}_FILL = {\n${table.join('\n')}\n};`);
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
