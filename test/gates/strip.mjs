/*
 * The comments go on the way into a view, and nothing else does.
 *
 * strip-comments.mjs takes the comments out of the runtime, the compiler, the
 * editor and the stylesheets as build.js splices them into a view – about
 * 740 KB of every live view. A strip that takes one character too many ships
 * a page that does something else, and nothing in a build says so; one that
 * takes too few only costs bytes. So the gate holds the dangerous direction
 * three ways:
 *
 *   1. hand-written cases, each a place a regex strip goes wrong: '//' in a
 *      string, a template literal with ${…} nested in ${…}, a regex holding
 *      /* or //, division against regex after ) ] } ++ and a keyword, a
 *      comment that is the only thing between two tokens, automatic
 *      semicolon insertion across a comment that spans lines, and the
 *      comments that are load-bearing (/*!, @license, //# sourceURL=);
 *   2. the real modules spliced in as text – each stripped one still
 *      compiles, a second strip changes nothing, and every value it exports
 *      that is not a function (the vocabulary tables, the command table, the
 *      regexes by their source) is equal before and after, which is a check
 *      on strings and regexes that does not go through the tokenizer;
 *   3. build.js hands every runtime and stylesheet literal through shipJs /
 *      shipCss, read as text: a renderer that splices one bare ships its
 *      comments again, which is only bytes, but it is also how the two
 *      paths come to differ.
 *
 * And the step before the strip for a runtime/ file whose literal had
 * substitutions: fillRuntime, lifted out of build.js as text, fills its
 * placeholders and refuses every way one could ship unfilled; and each file's
 * placeholders are held against the table its getter fills them from
 * (PLAN-runtime-extraction.md, "Substitution scheme").
 *
 * During development the strip was also checked against acorn's tokenizer
 * (every script in every view of eight decks, token streams equal, no comment
 * left) and the stylesheets against Chromium's CSSOM (32 views, every rule's
 * cssText equal). Neither is a dependency, so neither is run here.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { ROOT } from './harness.mjs';
import { stripJs, stripCss } from '../../strip-comments.mjs';

export const name = 'strip: comments out of what a view is handed, and nothing else';

// The value a snippet evaluates to, by expression. Comparing values rather
// than texts is the point: two texts that differ only where comments were
// must compute the same thing.
const value = (src) => vm.runInNewContext(src, {});

const JS_CASES = [
  // [what, source, expected output or null to only compare values]
  ['a line comment goes, its line end stays', 'a = 1; // one\nb = 2;\n', 'a = 1;\nb = 2;\n'],
  ['a line that is only a comment goes', 'a = 1;\n  // gone\nb = 2;\n', 'a = 1;\nb = 2;\n'],
  ['a block comment goes', 'a = /* x */ 1;\n', 'a = 1;\n'],
  ['indentation stays', 'if (a) {\n    b(); // c\n}\n', 'if (a) {\n    b();\n}\n'],
  ['// in a string is a string', 'x = "http://a.b/c"; // d\n', 'x = "http://a.b/c";\n'],
  ["/* in a string is a string", "x = '/* not */';\n", "x = '/* not */';\n"],
  ['a comment between two words keeps them apart', 'return/**/x;\n', 'return x;\n'],
  ['between + and + too', 'y = a+/**/+b;\n', 'y = a+ +b;\n'],
  ['a comment spanning lines is a line end (ASI)', 'a = b/*\n*/c()\n', 'a = b\nc()\n'],
  ['a regex holding /* and //', 'r = /[/*]\\/\\//g; // c\n', 'r = /[/*]\\/\\//g;\n'],
  ['a regex with a slash in a class', 'r = /[/]x/; // c\n', 'r = /[/]x/;\n'],
  ['after ) a slash divides', 'x = (a) / 2 / 1; // c\n', 'x = (a) / 2 / 1;\n'],
  ['after if (…) a slash starts a regex', 'if (a) /x\\/\\/y/.test(s); // c\n', 'if (a) /x\\/\\/y/.test(s);\n'],
  ['after a name a slash divides', 'x = a / b; y = c / d; // e\n', 'x = a / b; y = c / d;\n'],
  ['after a++ a slash divides', 'x = a++ / 2; s = "//"; // c\n', 'x = a++ / 2; s = "//";\n'],
  ['after return a slash starts a regex', 'function f(){ return /\\/\\//; } // c\n', 'function f(){ return /\\/\\//; }\n'],
  ['x.return is a name, so a slash after it divides', 'x = o.return / 2; // c\n', 'x = o.return / 2;\n'],
  ['a template literal keeps its text, comments and all',
    'x = `a // b\n /* c */ ${1 /* d */ + 1}`; // e\n', 'x = `a // b\n /* c */ ${1 + 1}`;\n'],
  ['a template keeps its blank lines and trailing blanks',
    'x = `a  \n\n  b`;\n', 'x = `a  \n\n  b`;\n'],
  ['templates nest inside substitutions',
    'x = `${`${"}" /* a */}` + "//"}`; // b\n', 'x = `${`${"}" }` + "//"}`;\n'],
  ['an object literal inside a substitution', 'x = `${ {a: 1}.a }/2`;\n', 'x = `${ {a: 1}.a }/2`;\n'],
  ['/*! stays', '/*! keep */\nx = 1;\n', '/*! keep */\nx = 1;\n'],
  ['@license stays', '/* @license MIT */ x = 1;\n', '/* @license MIT */ x = 1;\n'],
  ['//# sourceURL= stays', 'x = 1;\n//# sourceURL=a.js\n', 'x = 1;\n//# sourceURL=a.js\n'],
  ['a string escape that looks like a quote', "x = 'a\\'//b'; // c\n", "x = 'a\\'//b';\n"],
  ['a division that would read as an unclosed regex', '}\nx = a\n/ 2 // c\n', '}\nx = a\n/ 2\n'],
  ['blank lines between statements go', 'a = 1;\n\n\nb = 2;\n', 'a = 1;\nb = 2;\n'],
];

const VALUE_CASES = [
  // Each one evaluated before and after; equal values or the strip changed code.
  '(function(){ var a = 6 /* x */ / 2 /* y */ / 1; return a; })()',
  '(function(){ var s = "//" + \'/*\' + `*/${"//"}`; return s; })()',
  '(function(){ var r = /\\/\\*[^*]*\\*\\// ; return r.source; })()',
  '(function(){ var a = 1\n/* no semicolon */\nvar b = 2; return a + b; })()',
  '(function(){ var i = 4; var x = i++ / 2; return [x, i].join(); })()',
  '(function(){ return `${ {"a": "}"}.a }`; })()',
  '(function(){ var t = 0; if (t) /x/.test("x"); else t = 3; return t; })()',
  '(function(){ return [1,2].map(x => x / 1 /* c */ ).join(); })()',
];

const CSS_CASES = [
  ['a comment goes', 'a { color: red; /* x */ }\n', 'a { color: red; }\n'],
  ['a line that is only a comment goes', '/* head */\na { b: c; }\n', 'a { b: c; }\n'],
  ['/* in a string stays', 'a::after { content: "/* no */"; }\n', 'a::after { content: "/* no */"; }\n'],
  ['/* in an unquoted url() stays', 'a { b: url(data:x/*y); }\n', 'a { b: url(data:x/*y); }\n'],
  ['two words a comment kept apart stay apart', 'a/**/b { c: d; }\n', 'a/**/b { c: d; }\n'],
  ['a comment beside a combinator leaves no space', '.a/* x */.b { c: d; }\n', '.a.b { c: d; }\n'],
  ['/*! stays', '/*! keep */\na { b: c; }\n', '/*! keep */\na { b: c; }\n'],
];

// The modules spliced into a view as text, as build.js splices them: the
// export keyword dropped, the names collected and returned.
const MODULES = ['diagram-core.mjs', 'editor.mjs', 'commands.mjs', 'cue-cards.mjs'];
// The literals that have left build.js for runtime/ (PLAN-runtime-extraction.md),
// each with the getter build.js reads it through: [file, getter]. A third
// name is the local a renderer holds the text in when it is spliced only
// under a flag – the prompter's, set to the getter's text under --prompter
// and to '' otherwise, and that local is what goes through ship*.
const RUNTIME = [['runtime/speaker.css', 'speakerCss'], ['runtime/print.js', 'printJs'],
  ['runtime/pulse-print.css', 'pulsePrintCss'], ['runtime/speaker.js', 'speakerJs'],
  ['runtime/souffleuse.css', 'souffleuseSheet', 'souffleuseCss'],
  ['runtime/souffleuse.js', 'souffleuseScript', 'souffleuseRuntime'],
  ['runtime/print-view.js', 'printViewJs'], ['runtime/print-reader.js', 'printReaderJs'],
  ['runtime/print-highlights.js', 'printHighlightsJs'], ['runtime/diagram.css', 'diagramCss']];
// The ones that ship raw, as their literals did: the failed-build banner,
// which goes into a watch build's reload script with its comments and
// nothing else. [file, getter]; held below to reloadScript and kept off ship*.
const RUNTIME_RAW = [['runtime/watch-banner.css', 'watchBannerCss'], ['runtime/watch-banner.js', 'watchBannerJs']];
const asScript = (text) => {
  const names = [...text.matchAll(/^export\s+(?:function|const|let)\s+([A-Za-z_$][\w$]*)/gm)].map(m => m[1]);
  return { names, body: text.replace(/^export\s+(function|const|let)\s/gm, '$1 ') };
};
// Every value an export holds that is not code, as text: tables, strings,
// regexes (by source and flags), Sets and Maps by their entries.
function shape(v, seen = new Set()) {
  if (typeof v === 'function') return 'fn';
  if (v instanceof RegExp) return `/${v.source}/${v.flags}`;
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? String(v);
  if (seen.has(v)) return 'cycle';
  seen.add(v);
  if (v instanceof Set) return `Set[${[...v].map(x => shape(x, seen)).join(',')}]`;
  if (v instanceof Map) return `Map[${[...v].map(([k, x]) => shape(k, seen) + ':' + shape(x, seen)).join(',')}]`;
  if (Array.isArray(v)) return `[${v.map(x => shape(x, seen)).join(',')}]`;
  return `{${Object.keys(v).map(k => JSON.stringify(k) + ':' + shape(v[k], seen)).join(',')}}`;
}

export async function run({ report }) {
  const { ok } = report;

  for (const [what, src, want] of JS_CASES) {
    let got;
    try { got = stripJs(src); } catch (e) { got = 'threw: ' + e.message; }
    ok(got === want, `js: ${what}`, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  }
  for (const src of VALUE_CASES) {
    let a, b;
    try { a = value(src); b = value(stripJs(src)); } catch (e) { b = 'threw: ' + e.message; }
    ok(a === b, `js value unchanged: ${src.slice(0, 60).replace(/\n/g, '⏎')}`, `${a} vs ${b}`);
  }
  for (const [what, src, want] of CSS_CASES) {
    let got;
    try { got = stripCss(src); } catch (e) { got = 'threw: ' + e.message; }
    ok(got === want, `css: ${what}`, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  }

  // ── the real modules ──
  for (const file of MODULES) {
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const stripped = stripJs(text);
    ok(stripJs(stripped) === stripped, `${file}: a second strip changes nothing`);
    ok(stripped.length < text.length * 0.9, `${file}: the strip took something (${text.length} → ${stripped.length} bytes)`);
    const before = asScript(text), after = asScript(stripped);
    ok(before.names.join() === after.names.join(), `${file}: the same exports are found after the strip (${before.names.length})`);
    if (!before.names.length) {
      // editor.mjs exports nothing and runs against a document: compiled only.
      let err = '';
      try { new vm.Script(after.body); } catch (e) { err = e.message; }
      ok(!err, `${file}: the stripped text compiles`, err);
      continue;
    }
    const load = (s) => vm.runInNewContext(`(function(){ ${s.body}\nreturn { ${s.names.join(', ')} }; })()`,
      { window: {}, document: undefined, console });
    let a = null, b = null;
    try { a = load(before); } catch (e) { ok(false, `${file}: the original loads in a vm`, e.message); }
    try { b = load(after); } catch (e) { ok(false, `${file}: the stripped text loads in a vm`, e.message); }
    if (a && b) {
      const diff = before.names.filter(k => shape(a[k]) !== shape(b[k]));
      ok(diff.length === 0, `${file}: every exported table, string and regex is equal after the strip`, diff.join(', '));
    }
  }
  // The stylesheets that are real files: editor.css, and the literals that
  // have moved out of build.js into runtime/ (PLAN-runtime-extraction.md).
  for (const file of ['editor.css', ...RUNTIME.map(([f]) => f).filter(f => f.endsWith('.css'))]) {
    const css = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const strippedCss = stripCss(css);
    ok(stripCss(strippedCss) === strippedCss, `${file}: a second strip changes nothing`);
    ok(!/\/\*/.test(strippedCss), `${file}: no comment is left`);
  }
  // The scripts among them are fragments run in a <script>, not modules:
  // each compiles as a script before and after the strip, the strip takes
  // something, and a second strip changes nothing.
  for (const file of RUNTIME.map(([f]) => f).filter(f => f.endsWith('.js'))) {
    const js = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const strippedJs = stripJs(js);
    ok(stripJs(strippedJs) === strippedJs, `${file}: a second strip changes nothing`);
    ok(strippedJs.length < js.length, `${file}: the strip took something (${js.length} → ${strippedJs.length} bytes)`);
    for (const [what, text] of [['the file', js], ['the stripped text', strippedJs]]) {
      let err = '';
      try { new vm.Script(text); } catch (e) { err = e.message; }
      ok(!err, `${file}: ${what} compiles as a script`, err);
    }
  }

  // ── build.js hands every runtime and stylesheet literal through ship* ──
  const build = fs.readFileSync(path.join(ROOT, 'build.js'), 'utf8');
  const LITERALS = ['AUDIENCE_JS', 'DIAGRAM_JS', 'AUDIENCE_CSS', 'PRINT_CSS'];
  for (const lit of LITERALS) {
    const bare = [...build.matchAll(new RegExp('\\$\\{(?:[^}]*\\? )?' + lit + '\\b', 'g'))].length;
    const shipped = [...build.matchAll(new RegExp('ship(?:Js|Css)\\(' + lit + '\\)', 'g'))].length;
    ok(bare === 0 && shipped > 0, `${lit} reaches a view only through shipJs / shipCss`,
      `${bare} bare, ${shipped} shipped`);
  }
  for (const fn of ['diagramCoreScript', 'cueCardsScript', 'commandsScript']) {
    const body = build.slice(build.indexOf(`function ${fn}()`), build.indexOf(`function ${fn}()`) + 200);
    ok(/shipJs\(fs\.readFileSync/.test(body), `${fn} strips the module it reads`);
  }
  ok(/editorJsCache \?\?= shipJs\(/.test(build), 'editor.mjs is stripped on its way in');
  ok(/shipCss\(editorCss\(\)\)/.test(build), 'editor.css is stripped on its way in');
  // A literal moved into runtime/ keeps the guarantee it had as a literal:
  // its text reaches a view only through ship*, never bare.
  for (const [file, getter, local] of RUNTIME) {
    const bare = [...build.matchAll(new RegExp('\\$\\{(?:[^}]*\\? )?' + getter + '\\(\\)', 'g'))].length;
    if (local) {
      // Spliced under a flag: the getter is read into the local, once, and
      // the local is what reaches the view – through ship*, never bare.
      const held = [...build.matchAll(new RegExp('const ' + local + ' = souffSettings \\? ' + getter + '\\(\\) : \'\';', 'g'))].length;
      const localBare = [...build.matchAll(new RegExp('\\$\\{(?:[^}]*\\? )?' + local + '\\}', 'g'))].length;
      const shipped = [...build.matchAll(new RegExp('ship(?:Js|Css)\\(' + local + '\\)', 'g'))].length;
      ok(held === 1 && bare === 0 && localBare === 0 && shipped > 0,
        `${file} (${getter}(), under --prompter as ${local}) reaches a view only through shipJs / shipCss`,
        `${held} held, ${bare + localBare} bare, ${shipped} shipped`);
      continue;
    }
    const shipped = [...build.matchAll(new RegExp('ship(?:Js|Css)\\(' + getter + '\\(\\)\\)', 'g'))].length;
    ok(bare === 0 && shipped > 0, `${file} (${getter}()) reaches a view only through shipJs / shipCss`,
      `${bare} bare, ${shipped} shipped`);
  }
  // ── a runtime/ file's placeholders, filled before ship* ──
  // fillRuntime, lifted out of build.js as text and run on fixtures: it fills
  // both forms with String() of the value, and refuses every way a
  // placeholder could reach a page unfilled or a value go nowhere.
  const fStart = build.indexOf('\nfunction fillRuntime(');
  const fEnd = build.indexOf('\n}\n', fStart);
  let fill = null;
  try { fill = new Function(build.slice(fStart, fEnd + 2) + '\nreturn fillRuntime;')(); } catch (e) { /* reported below */ }
  ok(fStart >= 0 && typeof fill === 'function', 'fillRuntime is found in build.js and compiles');
  if (fill) {
    const where = new URL('file:///x/psi/runtime/f.js');
    const refuses = (what, text, values, want) => {
      let msg = '';
      try { fill(where, text, values); } catch (e) { msg = e.message; }
      ok(msg.startsWith('runtime/f.js: ') && want.test(msg), `fillRuntime refuses ${what}`, msg || 'no error');
    };
    const got = fill(where, "a('__PSI_KEY__'); /*__PSI_BLOCK__*/ w(__PSI_W__px) __PSI_W__ $&\n",
      { KEY: 'psi-reader:scheme', BLOCK: '.x { y: $& }', W: 1216 - 0.02 });
    ok(got === "a('psi-reader:scheme'); .x { y: $& } w(1215.98px) 1215.98 $&\n",
      'fillRuntime fills both forms, a name used twice, a number as String() makes it, a $ pattern as written', got);
    ok(fill(where, 'a /* b */ c\n', {}) === 'a /* b */ c\n', 'fillRuntime leaves a text without placeholders as it is');
    refuses('a placeholder without a value', 'x(__PSI_KEY__, __PSI_NO__)', { KEY: 'k' }, /__PSI_NO__ has no value/);
    refuses('a value no placeholder uses', 'x(__PSI_KEY__)', { KEY: 'k', SPARE: 1 }, /no placeholder for __PSI_SPARE__/);
    refuses('a value that is not a string or a finite number', 'x(__PSI_T__)', { T: ['a', 'b'] }, /__PSI_T__ is an array/);
    refuses('a value that is not finite', 'x(__PSI_T__)', { T: NaN }, /__PSI_T__ is NaN/);
    refuses('a malformed placeholder', 'x(__PSI_lower__)', {}, /"__PSI_lower__\)" is not a placeholder/);
    refuses('a placeholder with a double underscore inside', 'x(__PSI_A__B__)', { A: 1 }, /is not a placeholder/);
    refuses('an inherited name', 'x(__PSI_TOSTRING__)', Object.create({ TOSTRING: 'x' }), /__PSI_TOSTRING__ has no value/);
  }
  // Per file, without a build: a file that holds a placeholder is read
  // through fillRuntime, from its own path, with a table whose keys (one per
  // line, read as text) are exactly its placeholder names – so a file read
  // only under a flag is held as well as one every build reads – and a file
  // without one is read as it is.
  for (const [file, getter] of [...RUNTIME, ...RUNTIME_RAW]) {
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const names = new Set([...text.matchAll(/__PSI_([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*)__/g)].map(m => m[1]));
    const at = build.indexOf(`\nconst ${getter} = `);
    const def = at < 0 ? '' : build.slice(at, build.indexOf(';\n', at) + 1);
    const call = def.match(/fillRuntime\((\w+), fs\.readFileSync\((\w+), 'utf8'\), (\w+)\)/);
    if (!call) {
      ok(def && !def.includes('fillRuntime') && !text.includes('__PSI_'),
        `${file}: holds no placeholder and ${getter}() reads it as it is`,
        def ? `${names.size} placeholder(s), ${def.includes('fillRuntime') ? 'an unreadable fillRuntime call' : 'no fillRuntime'}` : `no const ${getter} in build.js`);
      continue;
    }
    const [, where, read, table] = call;
    const pathOk = where === read && build.includes(`\nconst ${read} = new URL('./${file}', import.meta.url);`);
    const tStart = build.indexOf(`\nconst ${table} = {\n`);
    const tBody = tStart < 0 ? '' : build.slice(tStart, build.indexOf('\n};\n', tStart));
    const keys = new Set([...tBody.matchAll(/^ {2}([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*):/gm)].map(m => m[1]));
    const same = keys.size === names.size && [...names].every(n => keys.has(n));
    ok(pathOk && names.size > 0 && same,
      `${file}: ${getter}() fills its ${names.size} placeholder(s) from ${table}, whose keys are exactly their names`,
      `path ${pathOk ? 'ok' : `${where} / ${read} is not new URL('./${file}')`}; file ${[...names].join(', ') || 'none'}; ${table} ${[...keys].join(', ') || 'none'}`);
  }

  // A raw one stays raw, and stays in the reload script: every call of its
  // getter is inside reloadScript, and none goes through ship*, which would
  // change what a watch build ships.
  const reload = build.slice(build.indexOf('\nfunction reloadScript('), build.indexOf('\n}\n', build.indexOf('\nfunction reloadScript(')));
  for (const [file, getter] of RUNTIME_RAW) {
    const calls = (text) => [...text.matchAll(new RegExp('\\b' + getter + '\\(\\)', 'g'))].length;
    const inReload = calls(reload);
    const shipped = [...build.matchAll(new RegExp('ship(?:Js|Css)\\(' + getter + '\\(\\)\\)', 'g'))].length;
    const elsewhere = calls(build) - inReload;
    ok(reload.length > 0 && inReload > 0 && elsewhere === 0 && shipped === 0,
      `${file} (${getter}()) reaches a page only through reloadScript, raw`,
      `${inReload} in reloadScript, ${elsewhere} elsewhere, ${shipped} through ship*`);
  }
}
