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
 *      resolved - the lecture's folder alone when the one above is the home
 *      folder or a disk's top - and never a folder whose name starts with a
 *      dot, and a link only to a file of the kind its name says
 *      (`assetKindOf`). `assetEscape` in both files, on a real directory tree with real
 *      links, because a link is the case a string check gets wrong; the home
 *      folder is a parameter, so the gate says where it is;
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
import os from 'node:os';
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
  return new Function('fs', 'path', 'crypto', 'os', body)(fs, path, crypto, os);
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
  const containment = ['pathWithin', 'realpathLoose', 'assetRootOf', 'assetRootNarrowed', 'assetKindOf', 'assetEscape'];
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

  // A folder whose name starts with a dot is never read from, inside the
  // lecture's folder too, links resolved.
  fs.mkdirSync(path.join(lec, 'assets', '.hidden'));
  put(path.join(lec, 'assets', '.hidden', 'x.png'));
  fs.mkdirSync(path.join(repo, '.ssh'));
  put(path.join(repo, '.ssh', 'id_rsa'));
  link(path.join(repo, '.ssh', 'id_rsa'), path.join(lec, 'assets', 'dot.png'));
  put(path.join(lec, 'assets', '.dotfile.png'));
  for (const [what, abs] of [
    ['a file below assets/.hidden/', path.join(lec, 'assets', '.hidden', 'x.png')],
    ['a dot-file in assets/', path.join(lec, 'assets', '.dotfile.png')],
    ['../.ssh/id_rsa one level up', path.resolve(lec, '../.ssh/id_rsa')],
    ['a link in assets/ into ../.ssh', path.join(lec, 'assets', 'dot.png')],
  ]) {
    ok(cb.assetEscape(abs, lec) !== null && cl.assetEscape(abs, lec) !== null,
       `${what} is refused in both files`, cb.assetEscape(abs, lec));
  }
  // A link is read only when its target is the kind of file its name says: a
  // picture's name on a PDF, a key or a note is refused inside the root too,
  // because the build would inline the bytes into the page as a data: URI.
  put(path.join(lec, 'contract.pdf'));
  put(path.join(lec, 'notes.txt'));
  put(path.join(lec, 'clip.mp4'));
  put(path.join(lec, 'assets', 'real.webp'));
  put(path.join(lec, 'face.woff2'));
  link(path.join(lec, 'contract.pdf'), path.join(lec, 'assets', 'pic.png'));
  link(path.join(lec, 'notes.txt'), path.join(lec, 'assets', 'plain.svg'));
  link(path.join(lec, 'clip.mp4'), path.join(lec, 'assets', 'still.png'));
  link(path.join(lec, 'assets', 'real.webp'), path.join(lec, 'assets', 'alias.png'));
  link(path.join(lec, 'clip.mp4'), path.join(lec, 'assets', 'movie.webm'));
  link(path.join(lec, 'face.woff2'), path.join(lec, 'assets', 'face.otf'));
  link(path.join(lec, 'notes.txt'), path.join(lec, 'assets', 'noext'));
  for (const [what, abs, inside] of [
    ['a picture\'s name linked to a PDF', path.join(lec, 'assets', 'pic.png'), false],
    ['an .svg linked to a text file', path.join(lec, 'assets', 'plain.svg'), false],
    ['a picture\'s name linked to a clip', path.join(lec, 'assets', 'still.png'), false],
    ['a link with no extension to a text file', path.join(lec, 'assets', 'noext'), false],
    ['a .png linked to a .webp', path.join(lec, 'assets', 'alias.png'), true],
    ['a .webm linked to an .mp4', path.join(lec, 'assets', 'movie.webm'), true],
    ['an .otf linked to a .woff2', path.join(lec, 'assets', 'face.otf'), true],
  ]) {
    ok((cb.assetEscape(abs, lec) === null) === inside && (cl.assetEscape(abs, lec) === null) === inside,
       `${what} is ${inside ? 'read' : 'refused'} in both files`, cb.assetEscape(abs, lec));
  }
  // The kind table is spelled once per file and has to say what the build's
  // own extension lists say.
  const kinds = [['IMG_EXTS', 'image'], ['VIDEO_EXTS', 'video'], ['FONT_EXTS', 'font']];
  for (const [list, kind] of kinds) {
    const line = constLine(buildSrc, list);
    const exts = (line.match(/'([a-z0-9]+)'/g) || []).map(x => x.slice(1, -1));
    ok(exts.length > 0 && exts.every(e => cb.assetKindOf('x.' + e) === kind && cl.assetKindOf('x.' + e) === kind),
       `assetKindOf names every one of ${list} a ${kind}, in both files`, line);
  }
  ok(lift(buildSrc, 'assetKindOf', 'build.js') === lift(lintSrc, 'assetKindOf', 'lint.js'),
     'and the two copies of assetKindOf are the same text');

  // The home folder, injected: the review's fixture was a sibling link to a
  // key, which one level up allows - unless one level up is home.
  const home = path.join(base, 'home');
  const talk = path.join(home, 'talk');
  fs.mkdirSync(path.join(talk, 'assets'), { recursive: true });
  fs.mkdirSync(path.join(home, 'outside'));
  put(path.join(home, 'outside', 'id_rsa'));
  put(path.join(talk, 'assets', 'own.png'));
  link(path.join(home, 'outside', 'id_rsa'), path.join(talk, 'assets', 'leak.png'));
  put(path.join(home, 'outside', 'pic.png'));
  link(path.join(home, 'outside', 'pic.png'), path.join(talk, 'assets', 'near.png'));
  const other = path.join(base, 'elsewhere');
  for (const c of [cb, cl]) {
    ok(c.assetRootOf(talk, home) === talk && c.assetRootNarrowed(talk, home),
       'a lecture folder directly in the home folder is its own root');
    ok(c.assetRootOf(talk, other) === home && !c.assetRootNarrowed(talk, other),
       'and the same folder with home elsewhere reads one level up');
    ok(c.assetEscape(path.join(talk, 'assets', 'leak.png'), talk, home) !== null,
       'so the review\'s sibling link to id_rsa is refused when the parent is home');
    ok(c.assetEscape(path.join(talk, 'assets', 'near.png'), talk, home) !== null
       && c.assetEscape(path.join(talk, 'assets', 'near.png'), talk, other) === null,
       'and a sibling link to a picture is allowed when it is not (the one-level-up rule) –'
       + ' the key itself is refused either way now, as a link to a file that is no picture');
    ok(c.assetEscape(path.join(talk, 'assets', 'own.png'), talk, home) === null,
       'while the lecture\'s own files are read');
    ok(c.assetRootOf('/deck', home) === '/deck', 'a lecture folder at the top of a disk is its own root');
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
    ['![](assets/pic.png)', true], ['![](alias)', false],
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
