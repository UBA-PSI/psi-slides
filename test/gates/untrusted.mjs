/*
 * Building a source.md somebody sent you: the parts of that decidable
 * without a build.
 *
 * A security review found four ways a deck reached past its own folder when
 * it was built, and each is now refused by a small function in build.js with
 * a mirror in lint.js. This gate runs those functions, lifted out of both
 * files as text, against the cases the review used:
 *
 *   1. the frontmatter's language. gray-matter picks its parser from what
 *      follows the opening `---`, and `---js` is handed to eval. Both files
 *      read that word with `frontmatterLanguage` and allow the same set;
 *      build.js must call gray-matter only through `safeMatter`, which a new
 *      bare `matter(` call would quietly get round;
 *   2. the asset root: the lecture's folder and the one above it, links
 *      resolved. `assetEscape` in both files, on a real directory tree with
 *      real links, because a link is the case a string check gets wrong;
 *   3. writing an output: a link at the path is replaced and never written
 *      through (`writeOutputFile`), an append refuses one (`appendOutputFile`);
 *   4. ImageMagick is told the decoder rather than left to guess it from the
 *      content (`magickInput`).
 *
 * build.js cannot be imported - it calls `main()` at module scope and imports
 * the Markdown stack - so the functions are lifted by name and evaluated with
 * the Node modules they use, the way `image-refs` does it. The build-level
 * half (a real build refusing a real deck, the view left on disk) needs
 * `npm install` and lives in `test/settings.mjs`.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { ROOT } from './harness.mjs';
import { tmpDir } from '../tmp.mjs';

export const name = 'untrusted: frontmatter language, asset root, output links, magick decoder';

function lift(src, fnName, file) {
  const start = src.indexOf(`\nfunction ${fnName}(`);
  if (start < 0) throw new Error(`${file} has no top-level function ${fnName}`);
  const end = src.indexOf('\n}\n', start);
  if (end < 0) throw new Error(`could not find the end of ${fnName} in ${file}`);
  return src.slice(start + 1, end + 3);
}

function load(file, names, extra = '') {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const body = names.map(n => lift(src, n, file)).join('\n') + extra
    + `\nreturn { ${names.join(', ')} };`;
  // eslint-disable-next-line no-new-func
  return new Function('fs', 'path', 'crypto', body)(fs, path, crypto);
}

const constLine = (src, name) => (src.match(new RegExp(`^const ${name} = .*$`, 'm')) || [''])[0];

export async function run({ report }) {
  const { ok } = report;
  const buildSrc = fs.readFileSync(path.join(ROOT, 'build.js'), 'utf8');
  const lintSrc = fs.readFileSync(path.join(ROOT, 'lint.js'), 'utf8');

  // ── 1. the frontmatter's language ─────────────────────────────────
  const b = load('build.js', ['frontmatterLanguage']);
  const l = load('lint.js', ['frontmatterLanguage']);
  const cases = [
    ['---\ntitle: T\n---\n', ''],
    ['---js\n{ title: 1 }\n---\n', 'js'],
    ['--- javascript \n{}\n---\n', 'javascript'],
    ['---coffee\ntitle: 1\n---\n', 'coffee'],
    ['---yaml\ntitle: T\n---\n', 'yaml'],
    ['---YML\r\ntitle: T\r\n---\r\n', 'YML'],
    ['﻿---js\n{}\n---\n', 'js'],
    ['----\nnot frontmatter\n', ''],
    ['# no frontmatter at all\n', ''],
  ];
  for (const [src, want] of cases) {
    const shown = JSON.stringify(src.slice(0, 14));
    ok(b.frontmatterLanguage(src) === want, `build.js reads ${shown} as language '${want}'`, b.frontmatterLanguage(src));
    ok(l.frontmatterLanguage(src) === want, `lint.js reads ${shown} the same`, l.frontmatterLanguage(src));
  }
  const setB = constLine(buildSrc, 'FRONTMATTER_LANGUAGES');
  ok(setB && setB === constLine(lintSrc, 'FRONTMATTER_LANGUAGES'),
     'the allowed languages are one list, spelled the same in both files', setB);
  ok(/^const FRONTMATTER_LANGUAGES = new Set\(\['', 'yaml', 'yml'\]\);$/.test(setB),
     'and that list is YAML and nothing else', setB);
  // Every call of gray-matter goes through safeMatter: a bare `matter(` added
  // anywhere else is a deck with `---js` running code again.
  const bare = [...buildSrc.matchAll(/(^|[^\w.$])matter\(/gm)]
    .map(m => buildSrc.slice(0, m.index).split('\n').length)
    .filter(line => !/^\s*\/\//.test(buildSrc.split('\n')[line - 1]));
  const inside = lift(buildSrc, 'safeMatter', 'build.js');
  const safeAt = buildSrc.split('\n').findIndex(x => x.startsWith('function safeMatter(')) + 1;
  const safeEnd = safeAt + inside.split('\n').length - 1;
  const stray = bare.filter(n => n < safeAt || n > safeEnd);
  ok(bare.length >= 1 && stray.length === 0,
     'build.js calls gray-matter only inside safeMatter', `bare calls on lines ${stray.join(', ')}`);
  ok(/javascript: refusedFrontmatterEngine/.test(inside) && /coffee: refusedFrontmatterEngine/.test(inside),
     'and safeMatter hands gray-matter refusing engines for javascript and coffee as a second layer');

  // ── 2. the asset root ─────────────────────────────────────────────
  const containment = ['pathWithin', 'realpathLoose', 'assetRootOf', 'assetEscape'];
  const cb = load('build.js', containment);
  const cl = load('lint.js', containment);
  const base = fs.realpathSync(tmpDir('psi-untrusted-'));
  const repo = path.join(base, 'repo');            // the asset root
  const lec = path.join(repo, 'lec');               // the lecture's folder
  for (const d of [path.join(lec, 'assets'), path.join(repo, 'shared'), path.join(base, 'outside'),
    path.join(base, 'repo-old')]) fs.mkdirSync(d, { recursive: true });
  const put = (p) => { fs.writeFileSync(p, 'x'); return p; };
  put(path.join(lec, 'assets', 'own.png'));
  put(path.join(repo, 'shared', 'pic.png'));
  put(path.join(base, 'outside', 'key'));
  put(path.join(base, 'repo-old', 'x.png'));
  const link = (target, at) => { fs.symlinkSync(target, at); return at; };
  link(path.join(base, 'outside', 'key'), path.join(lec, 'assets', 'leak.png'));
  link(path.join(repo, 'shared', 'pic.png'), path.join(lec, 'assets', 'near.png'));
  link(path.join(base, 'outside'), path.join(lec, 'out-dir'));
  const rows = [
    ['a file in the lecture folder', path.join(lec, 'assets', 'own.png'), true],
    ['a shared picture one level up', path.resolve(lec, '../shared/pic.png'), true],
    ['a file two levels up', path.resolve(lec, '../../outside/key'), false],
    ['a sibling whose name starts with the root\'s', path.resolve(lec, '../../repo-old/x.png'), false],
    ['a link in assets/ pointing out of the root', path.join(lec, 'assets', 'leak.png'), false],
    ['a link in assets/ pointing one level up', path.join(lec, 'assets', 'near.png'), true],
    ['a missing file below a linked folder that leaves', path.join(lec, 'out-dir', 'nothing.png'), false],
    ['a missing file inside the folder', path.join(lec, 'assets', 'nothing.png'), true],
    ['an absolute path elsewhere', path.join(base, 'outside', 'key'), false],
  ];
  for (const [what, abs, inside] of rows) {
    ok((cb.assetEscape(abs, lec) === null) === inside,
       `build.js: ${what} is ${inside ? 'read' : 'refused'}`, cb.assetEscape(abs, lec));
    ok((cl.assetEscape(abs, lec) === null) === inside,
       `lint.js agrees on ${what}`, cl.assetEscape(abs, lec));
  }
  ok(cb.assetRootOf(lec) === repo, 'the root named in the message is the lecture folder\'s parent', cb.assetRootOf(lec));
  // A lecture folder reached through a link is judged where it really is: its
  // root is its real parent, so its own files and that parent's are read, and
  // a `../` written against the link's parent - which the build resolves
  // lexically, so a third folder - is refused.
  fs.mkdirSync(path.join(base, 'via', 'shared'), { recursive: true });
  put(path.join(base, 'via', 'shared', 'pic.png'));
  const alias = link(lec, path.join(base, 'via', 'alias'));
  for (const c of [cb, cl]) {
    ok(c.assetRootOf(alias) === repo, 'a lecture reached through a link takes its root from its real folder', c.assetRootOf(alias));
    ok(c.assetEscape(path.join(alias, 'assets', 'own.png'), alias) === null
       && c.assetEscape(path.resolve(alias, '../shared/pic.png'), alias) !== null
       && c.assetEscape(path.join(alias, 'assets', 'leak.png'), alias) !== null,
       'so its own files are read, and the link\'s parent and a link out are refused');
  }

  // ── 3. writing an output ──────────────────────────────────────────
  const io = load('build.js', ['writeOutputFile', 'appendOutputFile']);
  const victim = put(path.join(base, 'outside', 'profile'));
  const view = link(victim, path.join(lec, 'print.html'));
  io.writeOutputFile(view, '<!doctype html>');
  ok(fs.readFileSync(victim, 'utf8') === 'x', 'a view whose path is a link does not write through it');
  ok(!fs.lstatSync(view).isSymbolicLink() && fs.readFileSync(view, 'utf8') === '<!doctype html>',
     'the link is replaced by the view');
  ok(!fs.readdirSync(lec).some(f => f.endsWith('.tmp')), 'and no temporary file is left behind');
  if (process.platform !== 'win32') {
    const log = link(victim, path.join(lec, 'prompter-x.jsonl'));
    let code = null;
    try { io.appendOutputFile(log, '{}\n'); } catch (e) { code = e.code; }
    ok(code === 'ELOOP' && fs.readFileSync(victim, 'utf8') === 'x',
       'an append to a log whose path is a link is refused', code);
    const plain = path.join(lec, 'prompter-y.jsonl');
    io.appendOutputFile(plain, 'a\n'); io.appendOutputFile(plain, 'b\n');
    ok(fs.readFileSync(plain, 'utf8') === 'a\nb\n', 'and an ordinary log is appended to');
  }

  // ── 4. the ImageMagick decoder ────────────────────────────────────
  const mg = load('build.js', ['magickInput'], '\n' + constLine(buildSrc, 'MAGICK_DECODERS'));
  ok(mg.magickInput('/a/b.png') === 'png:/a/b.png', 'a .png goes to magick as png:');
  ok(mg.magickInput('/a/b.JPG') === 'jpeg:/a/b.JPG' && mg.magickInput('/a/b.jpeg') === 'jpeg:/a/b.jpeg',
     'a .jpg or .jpeg as jpeg:');
  let threw = false;
  try { mg.magickInput('/a/b.svg'); } catch { threw = true; }
  ok(threw, 'and a file with no named decoder is refused rather than sniffed');
  ok(/execFileSync\('magick', \[\.\.\.args, `webp:\$\{dst\}`\]/.test(buildSrc),
     'the output is named webp: too – the temporary name ends in .tmp, which magick cannot read a format from');

  // ── the linter says it ────────────────────────────────────────────
  const deck = path.join(lec, 'source.md');
  const lintOf = (src) => {
    fs.writeFileSync(deck, src);
    try { return execFileSync(process.execPath, [path.join(ROOT, 'lint.js'), deck], { encoding: 'utf8' }); }
    catch (e) { return String(e.stdout || ''); }
  };
  const BODY = '\n## title: {#title}\n\nHi.\n\n# P {#p}\n\n## free: A | x {#a}\n\nIMG\n\n## free: B | y {#b}\n\nT.\n';
  ok(/frontmatter-language/.test(lintOf('---js\n{ title: 1 }\n---\n' + BODY.replace('IMG', ''))),
     'lint.js reports ---js as frontmatter-language');
  ok(!/frontmatter-language/.test(lintOf('---yaml\ntitle: T\n---\n' + BODY.replace('IMG', ''))),
     'and passes ---yaml');
  for (const [ref, bad] of [['![](assets/leak.png)', true], ['![](leak)', true], ['![](../../outside/key)', true],
    ['![](../shared/pic.png)', false], ['`![](../../outside/key)`', false]]) {
    const out = lintOf('---\ntitle: T\n---\n' + BODY.replace('IMG', ref));
    ok(/asset-outside-root/.test(out) === bad, `lint.js ${bad ? 'reports' : 'passes'} ${ref}`, out.split('\n')[0]);
  }
  const fm = lintOf('---\ntitle: T\ncover: hero\ncover-image: ../../outside/key\n---\n' + BODY.replace('IMG', ''));
  ok(/:4\s+error\s+asset-outside-root/.test(fm), 'and a cover-image out of the root, on its frontmatter line', fm.split('\n')[0]);
  const bd = lintOf('---\ntitle: T\n---\n' + BODY.replace('IMG', '::: backdrop ../../outside/key\n\nWords.'));
  ok(/asset-outside-root/.test(bd), 'and a backdrop', bd.split('\n')[0]);
  const dg = lintOf('---\ntitle: T\n---\n' + BODY.replace('IMG', '::: draw\nimage k ../../outside/key at 1,1 h 2\n:::'));
  ok(/asset-outside-root/.test(dg), 'and a ::: draw image', dg.split('\n')[0]);
}
