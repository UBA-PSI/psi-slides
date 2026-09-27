// The half of the PDF export that decides without Electron: which file a kind
// writes, what the window may ask for, whether a build has to run first,
// which event ends the wait for it, and what the result tells the window.
// The Electron half – the driver, the dialog – is checked against the real
// module by running it, not here.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  PDF_KINDS, isPdfKind, defaultPdfPath, withPdfExtension, pdfRequest,
  exportPlan, waitOutcome, exportResult, writeAtomic,
} = require('../main/pdf.js');
const { initialState, reduceState } = require('../main/builder.js');
const { formatReport, resolvePdfOptions } = await import('../../pdf-core.mjs');

test('each kind writes the file the command line writes, beside the source', () => {
  assert.deepEqual(Object.keys(PDF_KINDS), ['slides', 'print', 'print-notes']);
  assert.equal(defaultPdfPath('/a/lecture', 'slides'), path.join('/a/lecture', 'slides.pdf'));
  assert.equal(defaultPdfPath('/a/lecture', 'print'), path.join('/a/lecture', 'print.pdf'));
  assert.equal(defaultPdfPath('/a/lecture', 'print-notes'), path.join('/a/lecture', 'print-notes.pdf'));
  assert.equal(PDF_KINDS.slides.view, 'audience.html');
  assert.equal(PDF_KINDS['print-notes'].view, 'print-notes.html');
});

test('build.js names the same three files', () => {
  // The CLI's table, read as text: importing build.js would load the engine.
  const buildJs = fs.readFileSync(new URL('../../build.js', import.meta.url), 'utf8');
  for (const { view, file } of Object.values(PDF_KINDS)) {
    assert.match(buildJs, new RegExp(`view: '${view}', file: '${file}'`),
      `build.js does not pair ${view} with ${file}`);
  }
});

test('a kind is a word from the list and nothing else', () => {
  assert.equal(isPdfKind('slides'), true);
  assert.equal(isPdfKind('audience'), false);
  assert.equal(isPdfKind('constructor'), false);
  assert.equal(isPdfKind('__proto__'), false);
  assert.equal(isPdfKind(undefined), false);
});

test('a name without an extension gets .pdf, one with an extension keeps it', () => {
  assert.equal(withPdfExtension('/x/deck'), '/x/deck.pdf');
  assert.equal(withPdfExtension('/x/deck.pdf'), '/x/deck.pdf');
  assert.equal(withPdfExtension('/x/deck.PDF'), '/x/deck.PDF');
});

test('the window asks for a kind and a collapse, never a path', () => {
  assert.deepEqual(pdfRequest('slides', { collapse: 'topic-bold' }),
    { ok: true, kind: 'slides', options: { collapse: 'topic-bold' } });
  assert.deepEqual(pdfRequest('slides', { collapse: 'none' }).options, { collapse: 'none' });
  // Absent or null follows the lecture, as the command line does.
  assert.deepEqual(pdfRequest('slides').options, { collapse: null });
  assert.deepEqual(pdfRequest('slides', { collapse: null }).options, { collapse: null });
  assert.equal(pdfRequest('slides', { collapse: 'full' }).ok, false);
  assert.equal(pdfRequest('slides', { collapse: 1 }).ok, false);
  // The documents take no option; a path in the options goes nowhere.
  assert.deepEqual(pdfRequest('print', { out: '/etc/passwd' }), { ok: true, kind: 'print', options: {} });
  assert.deepEqual(pdfRequest('audience'), { ok: false, error: 'pdf.badRequest' });
});

test('the slide options resolve to the command line defaults', () => {
  const r = resolvePdfOptions(pdfRequest('slides', { collapse: 'topic-bold' }).options);
  assert.equal(r.beats, 'all');
  assert.equal(r.size, '16:9');
  assert.equal(r.w, 1600);
  assert.equal(r.h, 900);
  assert.equal(r.zoom, null);
  assert.equal(r.collapse, 'topic-bold');
  assert.equal(resolvePdfOptions(pdfRequest('slides').options).collapse, null);
});

const ready = (over = {}) => ({
  ...reduceState({ ...initialState(), phase: 'building', source: '/l/source.md', dir: '/l' },
    { type: 'build-success', views: ['audience'], durationMs: 1 }, 1),
  ...over,
});

test('nothing open, nothing to export', () => {
  assert.deepEqual(exportPlan(initialState()), { action: 'refuse', error: 'pdf.noProject' });
  assert.deepEqual(exportPlan(null), { action: 'refuse', error: 'pdf.noProject' });
});

test('a current build is exported as it stands', () => {
  assert.deepEqual(exportPlan(ready()), { action: 'now' });
  // Auto-build on and a save seen: the engine is building it already, and
  // the export waits for that build rather than asking for a second.
  assert.deepEqual(exportPlan(ready({ phase: 'building' })), { action: 'wait' });
  assert.deepEqual(exportPlan(ready({ phase: 'starting' })), { action: 'wait' });
});

test('auto-build off and source.md changed: build first', () => {
  let s = reduceState(ready({ auto: false }), { type: 'changed', modifiedMs: 5 });
  assert.deepEqual(exportPlan(s), { action: 'rebuild' });
  // Auto on, the same save: no rebuild is asked for.
  s = reduceState(ready(), { type: 'changed', modifiedMs: 5 });
  assert.notEqual(exportPlan(s).action, 'rebuild');
  // Off, nothing changed: the build on disk is the one in the editor.
  assert.deepEqual(exportPlan(ready({ auto: false })), { action: 'now' });
});

test('after a failed save the last good build is what is exported', () => {
  const s = reduceState(ready(), { type: 'build-error', message: 'line 3' }, 2);
  assert.equal(s.phase, 'build-error');
  assert.deepEqual(exportPlan(s), { action: 'now' });
});

test('the wait for a build ends on its success or its failure', () => {
  assert.equal(waitOutcome({ type: 'build-success' }), 'export');
  assert.equal(waitOutcome({ type: 'build-error', message: 'x' }), 'fail');
  assert.equal(waitOutcome({ type: 'watch-error', message: 'x' }), 'fail');
  assert.equal(waitOutcome({ type: 'process-exit', code: 1 }), 'fail');
  for (const type of ['build-start', 'changed', 'patch', 'asset', 'auto', 'watching', 'serving']) {
    assert.equal(waitOutcome({ type }), null, type);
  }
  assert.equal(waitOutcome(null), null);
});

const slideRun = {
  kind: 'slides', pdf: new Uint8Array(1), dom: null,
  size: '16:9', w: 1600, h: 900, beats: 'all', zoom: null, collapse: 'topic-bold', ceiling: 1.35,
  pages: 84, chunks: 40, version: '152.0', where: 'Electron 44.0.0',
  prep: { stills: 0, placeholders: 0, embeds: 0 },
  overflow: [{ chunkId: 'long', beat: 2, zoom: 0.6, content: 1200, available: 820 }],
  missingImages: [{ chunkId: 'pic', src: 'x.png' }],
  dead: [{ fragment: 'gone', chunkId: 'links' }],
  blocked: [{ origin: 'https://example.org', count: 2 }],
  reloadSockets: 1,
  pageErrors: ['TypeError: nope'],
};

test('the result is facts for the sentence and diagnostics with their chunk', () => {
  const lines = formatReport(slideRun, { outLabel: 'slides.pdf' });
  const r = exportResult({ kind: 'slides', file: '/l/slides.pdf', r: slideRun, lines, rebuilt: true, durationMs: 7 });
  assert.equal(r.ok, true);
  assert.equal(r.name, 'slides.pdf');
  assert.equal(r.pages, 84);
  assert.deepEqual(r.pageSize, { w: 1600, h: 900, unit: 'px' });
  assert.equal(r.rebuilt, true);
  assert.equal(r.stale, false);
  assert.deepEqual(r.diagnostics.map(d => d.chunk), ['long', 'pic', 'links', null, null]);
  assert.match(r.diagnostics[0].text, /^slides\.pdf: long beat 2 does not fit/);
  assert.match(r.diagnostics[3].text, /blocked 2 request\(s\) to https:\/\/example\.org/);
  // The reload socket of a watch build is refused and not reported.
  assert.ok(!r.report.some(l => /127\.0\.0\.1|ws:/.test(l.text)));
  assert.match(r.report.at(-1).text, /^Wrote slides\.pdf \(84 page\(s\) from 40 chunk\(s\)/);
  // No bytes go back to the window.
  assert.equal('pdf' in r, false);
  assert.doesNotThrow(() => structuredClone(r));
});

test('a document result carries its paper, or null when unread', () => {
  const doc = {
    kind: 'document', pdf: new Uint8Array(1), view: 'print.html', pages: 12,
    pageSize: { w: 594.96, h: 841.92 }, pictures: 3, version: '152.0', where: 'Electron 44.0.0',
    missingImages: [], dead: [], blocked: [], reloadSockets: 1, pageErrors: [],
  };
  const r = exportResult({ kind: 'print', file: '/l/print.pdf', r: doc, lines: formatReport(doc, { outLabel: 'print.pdf' }) });
  assert.deepEqual(r.pageSize, { w: 594.96, h: 841.92, unit: 'pt' });
  assert.deepEqual(r.diagnostics, []);
  assert.equal(r.report.at(-1).text, 'Wrote print.pdf (12 page(s) from print.html, 210×297 mm)');
  const unread = exportResult({ kind: 'print', file: '/l/print.pdf', r: { ...doc, pages: null, pageSize: null }, lines: [] });
  assert.equal(unread.pages, null);
  assert.equal(unread.pageSize, null);
});

test('the file is written whole or not at all', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-pdf-test-'));
  try {
    const out = path.join(dir, 'slides.pdf');
    assert.equal(await writeAtomic(out, Buffer.from('%PDF-1')), true);
    assert.equal(fs.readFileSync(out, 'utf8'), '%PDF-1');
    // Aborted between the bytes and the rename: the old file stays, and no
    // temporary file is left beside it.
    assert.equal(await writeAtomic(out, Buffer.from('%PDF-2'), () => false), false);
    assert.equal(fs.readFileSync(out, 'utf8'), '%PDF-1');
    assert.deepEqual(fs.readdirSync(dir), ['slides.pdf']);
    // A link at the target is replaced, not written through.
    const victim = path.join(dir, 'victim.txt');
    fs.writeFileSync(victim, 'keep');
    const link = path.join(dir, 'linked.pdf');
    fs.symlinkSync(victim, link);
    assert.equal(await writeAtomic(link, Buffer.from('%PDF-3')), true);
    assert.equal(fs.readFileSync(victim, 'utf8'), 'keep');
    assert.equal(fs.lstatSync(link).isSymbolicLink(), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
