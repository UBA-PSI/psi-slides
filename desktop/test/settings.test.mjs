// Settings and the recent list, round-tripped through a temporary folder.
// The directory is a constructor argument for exactly this reason.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createSettings, normalise, languageForLocale, RECENT_MAX } = require('../main/settings.js');

function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'psi-builder-settings-'));
}

test('defaults on a fresh folder', () => {
  const s = createSettings(tmpdir());
  const v = s.get();
  assert.equal(v.language, 'en');
  assert.equal(v.browser, 'auto');
  assert.equal(v.serve, false);
  assert.deepEqual(v.recent, []);
});

test('settings survive a reload', () => {
  const dir = tmpdir();
  const a = createSettings(dir);
  a.set({ language: 'de', browser: 'default', serve: true });
  const b = createSettings(dir);
  assert.equal(b.get().language, 'de');
  assert.equal(b.get().browser, 'default');
  assert.equal(b.get().serve, true);
});

test('an unknown value falls back to the default', () => {
  const s = createSettings(tmpdir());
  s.set({ language: 'fr', browser: 'safari' });
  assert.equal(s.get().language, 'en');
  assert.equal(s.get().browser, 'auto');
});

test('the recent list is most recent first, deduplicated and capped', () => {
  const s = createSettings(tmpdir());
  for (let i = 0; i < RECENT_MAX + 4; i++) s.addRecent({ path: `/l/${i}/source.md`, name: String(i) });
  let recent = s.get().recent;
  assert.equal(recent.length, RECENT_MAX);
  assert.equal(recent[0].path, `/l/${RECENT_MAX + 3}/source.md`);

  // Opening one again moves it to the front rather than adding a second row.
  s.addRecent({ path: `/l/${RECENT_MAX}/source.md`, name: 'again' });
  recent = s.get().recent;
  assert.equal(recent.length, RECENT_MAX);
  assert.equal(recent[0].path, `/l/${RECENT_MAX}/source.md`);
  assert.equal(recent.filter(r => r.path === `/l/${RECENT_MAX}/source.md`).length, 1);
});

test('an entry can be removed', () => {
  const s = createSettings(tmpdir());
  s.addRecent({ path: '/l/a/source.md', name: 'a' });
  s.addRecent({ path: '/l/b/source.md', name: 'b' });
  s.removeRecent('/l/a/source.md');
  assert.deepEqual(s.get().recent.map(r => r.path), ['/l/b/source.md']);
});

test('a corrupt file gives defaults rather than a crash', () => {
  const dir = tmpdir();
  fs.writeFileSync(path.join(dir, 'settings.json'), '{ this is not json');
  const s = createSettings(dir);
  assert.equal(s.get().language, 'en');
  assert.deepEqual(s.get().recent, []);
  // And writing works from there, so the app repairs itself on the next save.
  s.set({ language: 'de' });
  assert.equal(createSettings(dir).get().language, 'de');
});

test('normalise refuses junk in the recent list', () => {
  const v = normalise({ recent: [null, 42, { path: '' }, { path: '/l/a/source.md' }, { path: '/l/a/source.md' }] });
  assert.equal(v.recent.length, 1);
  assert.equal(v.recent[0].name, 'a');
  assert.equal(v.recent[0].openedAt, 0);
});

test('the system locale decides the first language', () => {
  assert.equal(languageForLocale('de'), 'de');
  assert.equal(languageForLocale('de-AT'), 'de');
  assert.equal(languageForLocale('en-GB'), 'en');
  assert.equal(languageForLocale(undefined), 'en');
});
