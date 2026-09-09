// The rules that decide whether a value from the window may become an
// action. Every one of these is called on something that arrived over IPC.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  isValidProjectName, isOutputKind, resolveSource, checkNewProject, EXTERNAL_URLS,
} = require('../main/validation.js');

function tmpdir() {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'psi-builder-validate-')));
}

test('the project name rule is build.js’s slug rule', () => {
  assert.ok(isValidProjectName('netsec-04'));
  assert.ok(isValidProjectName('a'));
  assert.ok(!isValidProjectName('4netsec'), 'must start with a letter');
  assert.ok(!isValidProjectName('Netsec'), 'no capitals');
  assert.ok(!isValidProjectName('net sec'), 'no spaces');
  assert.ok(!isValidProjectName('../etc'), 'no path segments');
  assert.ok(!isValidProjectName('net_sec'), 'no underscores');
  assert.ok(!isValidProjectName(''));
  assert.ok(!isValidProjectName(null));
  assert.ok(!isValidProjectName('a'.repeat(65)));
});

test('only the four view names are output kinds', () => {
  for (const k of ['audience', 'speaker', 'print', 'print-notes']) assert.ok(isOutputKind(k));
  assert.ok(!isOutputKind('source'));
  assert.ok(!isOutputKind('../../etc/passwd'));
  assert.ok(!isOutputKind(undefined));
});

test('only two external addresses exist, and they are named not typed', () => {
  assert.deepEqual(Object.keys(EXTERNAL_URLS).sort(), ['docs', 'tutorial']);
  for (const url of Object.values(EXTERNAL_URLS)) assert.ok(url.startsWith('https://'));
});

test('resolveSource accepts a readable .md file and reports the real path', () => {
  const dir = tmpdir();
  const project = path.join(dir, 'netsec-04');
  fs.mkdirSync(project);
  const source = path.join(project, 'source.md');
  fs.writeFileSync(source, '# hello\n');
  const r = resolveSource(source);
  assert.equal(r.ok, true);
  assert.equal(r.source, source);
  assert.equal(r.dir, project);
  assert.equal(r.name, 'netsec-04');
});

test('resolveSource refuses anything that is not markdown', () => {
  const dir = tmpdir();
  const other = path.join(dir, 'notes.txt');
  fs.writeFileSync(other, 'x');
  assert.equal(resolveSource(other).error, 'error.notMarkdown');
  assert.equal(resolveSource('').error, 'error.notMarkdown');
  assert.equal(resolveSource(null).error, 'error.notMarkdown');
  assert.equal(resolveSource(path.join(dir, 'gone.md')).error, 'error.unreadable');
});

test('resolveSource refuses a directory that happens to end in .md', () => {
  const dir = tmpdir();
  const trap = path.join(dir, 'lecture.md');
  fs.mkdirSync(trap);
  assert.equal(resolveSource(trap).error, 'error.unreadable');
});

test('a symlink is followed and its target has to be markdown too', (t) => {
  if (process.platform === 'win32') return t.skip('symlinks need a privilege on Windows');
  const dir = tmpdir();
  const real = path.join(dir, 'source.md');
  fs.writeFileSync(real, '# hi\n');
  const link = path.join(dir, 'link.md');
  fs.symlinkSync(real, link);
  const r = resolveSource(link);
  assert.equal(r.ok, true);
  // The real path is what gets stored and shown, so that a project reached
  // through a link is honest about where its files are.
  assert.equal(r.source, real);

  const binary = path.join(dir, 'thing.bin');
  fs.writeFileSync(binary, 'x');
  const trap = path.join(dir, 'trap.md');
  fs.symlinkSync(binary, trap);
  assert.equal(resolveSource(trap).error, 'error.notMarkdown');
});

test('checkNewProject wants a good name, a real folder and no collision', () => {
  const dir = tmpdir();
  assert.equal(checkNewProject('Bad Name', dir).error, 'new.badName');
  assert.equal(checkNewProject('good', '').error, 'new.noFolder');
  assert.equal(checkNewProject('good', path.join(dir, 'nowhere')).error, 'new.noFolder');

  const ok = checkNewProject('good', dir);
  assert.equal(ok.ok, true);
  assert.equal(ok.dest, path.join(dir, 'good'));
  assert.equal(ok.source, path.join(dir, 'good', 'source.md'));

  fs.mkdirSync(path.join(dir, 'taken'));
  assert.equal(checkNewProject('taken', dir).error, 'new.exists');
});
