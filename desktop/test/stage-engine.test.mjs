// FILES in scripts/stage-engine.mjs is a hand-written list of the files
// build.js reads about itself, and nothing but this test holds the two
// together. When they disagree the packaged app does not degrade – a
// run-time read that is not staged throws ENOENT inside a renderer, before
// any view reaches disk, so every build in the app fails with a stack trace.
// cue-cards.mjs sat off the list from the day it landed through
// builder-0.1.0 and builder-0.1.1.
//
// Both files are read as text. build.js cannot be imported here: it is the
// engine, it pulls in Shiki and marked, and importing it to learn which
// paths it spells would be a minute of work to answer a question a regex
// answers in a millisecond. stage-engine.mjs cannot be imported either – it
// wipes engine/ and runs npm ci at module scope.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const buildJs = readFileSync(new URL('../../build.js', import.meta.url), 'utf8');
const stageJs = readFileSync(new URL('../scripts/stage-engine.mjs', import.meta.url), 'utf8');

// The list, parsed out of its own source rather than guessed at.
function stagedFiles() {
  const block = stageJs.match(/const FILES = \[([\s\S]*?)\];/);
  assert.ok(block, 'FILES is not in stage-engine.mjs in the shape this test reads');
  return [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

// Files build.js reaches for at run time, relative to itself. Anchored on
// import.meta.url rather than on `new URL(`, because the runtime JS inlined
// into the views builds URLs too and those belong to the page, not to Node.
function runtimeReads() {
  return [...buildJs.matchAll(/new URL\(\s*'\.\/([^']+)'\s*,\s*import\.meta\.url\s*\)/g)]
    .map((m) => m[1]);
}

// Files build.js imports statically. These fail at module load rather than
// mid-build, so they are the milder half – but they are the same list.
function staticImports() {
  return [...buildJs.matchAll(/^\s*import\s[\s\S]*?from\s+'\.\/([^']+)'/gm)]
    .map((m) => m[1]);
}

test('FILES is the list this test thinks it is', () => {
  const files = stagedFiles();
  assert.ok(files.includes('build.js'), `FILES parsed as ${files.join(', ')}`);
  assert.ok(files.length >= 8, `FILES parsed to only ${files.length} names`);
});

test('every file build.js reads at run time is staged', () => {
  const reads = runtimeReads();
  // A scan that silently finds nothing passes every comparison and guards
  // nothing, so the count is asserted before the membership.
  assert.equal(reads.length, 4, `expected 4 run-time reads, found ${reads.length}: ${reads.join(', ')}`);
  const files = stagedFiles();
  for (const name of reads) {
    assert.ok(files.includes(name),
      `build.js reads ./${name} at run time but stage-engine.mjs does not stage it – ` +
      'the packaged app would fail every build with ENOENT');
  }
});

test('every file build.js imports statically is staged', () => {
  const imports = staticImports();
  assert.ok(imports.length > 0, 'found no relative imports in build.js – the scan is broken');
  const files = stagedFiles();
  for (const name of imports) {
    assert.ok(files.includes(name),
      `build.js imports ./${name} but stage-engine.mjs does not stage it – ` +
      'the packaged app would fail at module load');
  }
});

// The third copy of the same list. desktop.yml is path-filtered on the engine
// files by hand, so a file the app stages but the filter does not name is a
// change that ships into the app without running a single desktop job – the
// state cue-cards.mjs was in, and part of why nothing caught it.
test('desktop.yml runs on every engine file the app stages', () => {
  const yml = readFileSync(new URL('../../.github/workflows/desktop.yml', import.meta.url), 'utf8');
  const filtered = new Set([...yml.matchAll(/^\s*- '([^']+)'$/gm)].map((m) => m[1]));
  assert.ok(filtered.has('desktop/**'), 'the path filter is not in the shape this test reads');
  for (const name of stagedFiles()) {
    assert.ok(filtered.has(name),
      `stage-engine.mjs stages ${name} but desktop.yml does not run on it – ` +
      'a change to it would ship into the app untested');
  }
});

test('nothing is staged that no longer exists in the repository', () => {
  // stage-engine.mjs refuses a missing name at run time; this says so in a
  // second, without wiping engine/ and running npm ci to find out.
  for (const name of stagedFiles()) {
    assert.doesNotThrow(() => readFileSync(new URL(`../../${name}`, import.meta.url)),
      `stage-engine.mjs stages ${name}, which is not in the repository root`);
  }
});
