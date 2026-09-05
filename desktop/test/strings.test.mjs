// The dictionary has to say everything in both languages, or the app ships a
// screen that is half German. The file is a plain script rather than a
// module – a module script from file:// in a sandboxed renderer is not
// guaranteed to load – so it is read through `vm` here rather than imported.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src = readFileSync(new URL('../renderer/strings.js', import.meta.url), 'utf8');
const sandbox = { module: { exports: {} } };
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const STRINGS = sandbox.module.exports;

const placeholders = (s) => (s.match(/\{(\w+)\}/g) || []).sort().join(',');

test('both languages exist and have entries', () => {
  assert.ok(STRINGS.en && STRINGS.de);
  assert.ok(Object.keys(STRINGS.en).length > 50);
});

test('every key is in both languages', () => {
  const en = Object.keys(STRINGS.en).sort();
  const de = Object.keys(STRINGS.de).sort();
  assert.deepEqual(de, en, 'the two dictionaries name different keys');
});

test('no string is empty', () => {
  for (const lang of ['en', 'de']) {
    for (const [key, value] of Object.entries(STRINGS[lang])) {
      assert.equal(typeof value, 'string', `${lang}.${key} is not a string`);
      assert.ok(value.trim().length > 0, `${lang}.${key} is empty`);
    }
  }
});

test('no em-dash anywhere', () => {
  // The house rule of the repository: en-dashes only. An em-dash in a
  // dictionary is the one place it would ship to a reader.
  for (const lang of ['en', 'de']) {
    for (const [key, value] of Object.entries(STRINGS[lang])) {
      assert.ok(!value.includes('—'), `${lang}.${key} contains an em-dash`);
    }
  }
});

test('the two languages carry the same placeholders', () => {
  for (const key of Object.keys(STRINGS.en)) {
    assert.equal(placeholders(STRINGS.de[key]), placeholders(STRINGS.en[key]),
      `${key} fills different placeholders in the two languages`);
  }
});
