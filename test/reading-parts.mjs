// Keep pre/post-reading in the documents without leaking it into the live
// navigation or dropping room notes. Exercise the actual build entry point.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpDir } from './tmp.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = tmpDir('psi-reading-parts-');
const source = `---
title: Reading selection
reading-parts: script-only
fonts: none
section: outline
---
## title: {#title}
## outline: Agenda {#agenda}
# Reading: before class {#before}
## free: Preparation {#prep}
PREPARATION_SENTINEL
> note: PREPARATION_NOTE
# In class {#room}
## free: A room slide {#room-slide}
ROOM_SENTINEL

\`\`\`text
# Reading: this is a code example
\`\`\`

> note: ROOM_NOTE
# Reading: after class {#after}
## free: Follow-up {#followup}
FOLLOWUP_SENTINEL
> note: FOLLOWUP_NOTE
# Finish {#finish}
## closing: End {#end}
Done.
`;
const src = path.join(dir, 'source.md');
const run = (file, ...args) => spawnSync(process.execPath, [path.join(root, file), ...args], {encoding:'utf8'});
const build = (...flags) => {
  const r = run('build.js', src, ...flags);
  assert.equal(r.status, 0, r.stdout + r.stderr);
};
const read = name => fs.readFileSync(path.join(dir, name + '.html'), 'utf8');
fs.writeFileSync(src, source);
build();
const full = Object.fromEntries(['print', 'print-notes', 'audience', 'speaker'].map(n => [n, read(n)]));
for (const name of ['print', 'print-notes']) {
  assert.match(full[name], /PREPARATION_SENTINEL/);
  assert.match(full[name], /FOLLOWUP_SENTINEL/);
  assert.match(full[name], /ROOM_SENTINEL/);
}
for (const name of ['audience', 'speaker']) {
  assert.doesNotMatch(full[name], /PREPARATION_SENTINEL|FOLLOWUP_SENTINEL|PREPARATION_NOTE|FOLLOWUP_NOTE/);
  assert.doesNotMatch(full[name], /data-chunk-id="(?:prep|followup|before-section|after-section)"/);
  assert.match(full[name], /ROOM_SENTINEL/);
  assert.match(full[name], /Reading: this is a code example/);
  build('--' + name + '-only');
  assert.equal(read(name), full[name], name + ' partial build differs');
}
assert.match(full.speaker, /ROOM_NOTE/);
assert.doesNotMatch(full.audience, /ROOM_NOTE/);
assert.match(full['print-notes'], /PREPARATION_NOTE/);
assert.doesNotMatch(full.print, /PREPARATION_NOTE/);
assert.equal(fs.readFileSync(src, 'utf8'), source);
fs.writeFileSync(src, source.replace('reading-parts: script-only\n', ''));
build();
assert.match(read('audience'), /PREPARATION_SENTINEL/);
assert.match(read('speaker'), /FOLLOWUP_SENTINEL/);
fs.writeFileSync(src, source.replace('script-only', 'typo'));
for (const file of ['build.js', 'lint.js']) {
  const r = run(file, src);
  assert.notEqual(r.status, 0, file + ' accepted an invalid setting');
  assert.match(r.stdout + r.stderr, /reading-parts/);
}
console.log('Reading parts: documents, live navigation, notes, defaults, partial builds and validation pass.');
