/*
 * The files build.js reads beside itself, held against the list its
 * pre-flight checks.
 *
 * build.js reads 22 files of its own at run time – the sixteen in runtime/,
 * editor.css, and the modules it splices into a view as text – each through a
 * path constant `const NAME_PATH = new URL('./<file>', import.meta.url);` and
 * a memoised getter. A file missing from a broken install, a partial copy of
 * the engine or a staging list used to surface as an ENOENT stack out of
 * whichever renderer read it first. assertEngineComplete, at the head of
 * buildOnce, checks every file in ENGINE_FILES and refuses in one sentence
 * that names the missing ones; test/cli.mjs runs a copy of the engine with a
 * file taken away and holds that sentence.
 *
 * ENGINE_FILES is a list of the constants, so a path cannot drift from it –
 * but a new path constant can be left off it, and then the file it names is
 * missed by the pre-flight and fails in a renderer again. This gate holds the
 * list equal to every `new URL('./…', import.meta.url)` in build.js, in both
 * directions, by reading the file as text (desktop/test/stage-engine.test.mjs
 * reads the same pattern to hold the app's staging list); and it holds the
 * call where the check has to be – first in buildOnce, ahead of the
 * stylesheet check, which is the first thing to read one of the files.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './harness.mjs';

export const name = 'engine-files: every file build.js reads beside itself is checked before a build';

export async function run({ report }) {
  const src = fs.readFileSync(path.join(ROOT, 'build.js'), 'utf8');

  // Every run-time read, in the pattern the stage test reads – and each one a
  // path constant of the documented shape, so the list can name it.
  const reads = [...src.matchAll(/new URL\(\s*'\.\/([^']+)'\s*,\s*import\.meta\.url\s*\)/g)].map(m => m[1]);
  const consts = [...src.matchAll(/^const ([A-Z][A-Z0-9_]*) = new URL\('\.\/([^']+)', import\.meta\.url\);$/gm)]
    .map(m => ({ name: m[1], file: m[2] }));
  // A scan that finds nothing passes every comparison below, so the count is
  // asserted first.
  report.ok(reads.length >= 20, `build.js reads files beside itself (${reads.length} found)`);
  const shapeless = reads.filter(f => !consts.some(c => c.file === f));
  report.ok(!shapeless.length, 'every such read is a path constant of the shape const NAME = new URL(\'./<file>\', import.meta.url);',
    shapeless.join(', '));

  // The list, read as the identifiers between its brackets.
  const at = src.indexOf('\nconst ENGINE_FILES = [');
  const body = at < 0 ? '' : src.slice(at, src.indexOf('];', at));
  const listed = [...body.slice(body.indexOf('[') + 1).matchAll(/[A-Z][A-Z0-9_]*/g)].map(m => m[0]);
  if (!report.ok(listed.length > 0, `build.js carries ENGINE_FILES (${listed.length} entries)`)) return;
  const dup = listed.filter((n, i) => listed.indexOf(n) !== i);
  report.ok(!dup.length, 'no file is listed twice', dup.join(', '));
  const left = consts.filter(c => !listed.includes(c.name)).map(c => `${c.name} (${c.file})`);
  report.ok(!left.length, 'ENGINE_FILES lists every path constant – a file left off is not checked before a build',
    left.join(', '));
  const stray = listed.filter(n => !consts.some(c => c.name === n));
  report.ok(!stray.length, 'and nothing that is not one', stray.join(', '));
  const absent = consts.filter(c => !fs.statSync(path.join(ROOT, c.file), { throwIfNoEntry: false })?.isFile())
    .map(c => c.file);
  report.ok(!absent.length, `each of the ${consts.length} files is in the repository`, absent.join(', '));

  // Where the check runs: first in buildOnce, so every build reaches it –
  // the partial ones (--print-only and the others) and every rebuild of a
  // --watch – and ahead of the stylesheet check, which reads six of the files.
  const b = src.indexOf('\nfunction buildOnce(');
  const head = b < 0 ? '' : src.slice(src.indexOf('{\n', b) + 2, src.indexOf('{\n', b) + 200);
  report.ok(/^ {2}assertEngineComplete\(\);\n {2}assertStylesheetsWellFormed\(\);/.test(head),
    'buildOnce checks the files first, before the stylesheet check reads them', head.split('\n').slice(0, 2).join(' / '));
  const f = src.indexOf('\nfunction assertEngineComplete(');
  const fn = f < 0 ? '' : src.slice(f, src.indexOf('\n}\n', f));
  report.ok(/ENGINE_FILES\.filter\(/.test(fn) && /err\.userFacing = true;/.test(fn),
    'assertEngineComplete checks ENGINE_FILES and refuses without a stack (userFacing)');
}
