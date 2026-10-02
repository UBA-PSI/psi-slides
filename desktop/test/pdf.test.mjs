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
  exportPlan, waitOutcome, exportResult, writeAtomic, dumpDomPath,
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

test('source.md changed since the last build: build first', () => {
  let s = reduceState(ready({ auto: false }), { type: 'changed', modifiedMs: 5 });
  assert.deepEqual(exportPlan(s), { action: 'rebuild' });
  // The engine reports `changed` only while auto-build is off, and turning it
  // back on builds nothing - so off, save, on, export still has an unbuilt
  // save on disk. It used to be exported as it stood, a build behind.
  s = reduceState(s, { type: 'auto', enabled: true });
  assert.equal(s.auto, true);
  assert.deepEqual(exportPlan(s), { action: 'rebuild' });
  // A build already running is waited for rather than asked for twice.
  assert.deepEqual(exportPlan(reduceState(s, { type: 'build-start' })), { action: 'wait' });
  // Nothing changed: the build on disk is the one in the editor, auto or not.
  assert.deepEqual(exportPlan(ready({ auto: false })), { action: 'now' });
  assert.deepEqual(exportPlan(ready()), { action: 'now' });
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

test('the DOM dump is the parity test\'s, and a packaged app never reads it', () => {
  const at = path.join(os.tmpdir(), 'dump.html');
  assert.equal(dumpDomPath({ PSI_PDF_DUMP_DOM: at }, false), at);
  assert.equal(dumpDomPath({ PSI_PDF_DUMP_DOM: at }, true), null);
  assert.equal(dumpDomPath({}, false), null);
  assert.equal(dumpDomPath({ PSI_PDF_DUMP_DOM: '' }, false), null);
  assert.equal(dumpDomPath({ PSI_PDF_DUMP_DOM: 'dump.html' }, false), null);
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

test('the export window keeps WebRTC off the network', () => {
  // The driver runs only under Electron, so this reads it as text. WebRTC
  // passes the session's webRequest by: a deck script's RTCPeerConnection
  // sent STUN over UDP from a window set up like this one until the policy
  // and the dead proxy were set. The command line's floor is OFFLINE_ARGS in
  // pdf-export.mjs, exercised for real by test/pdf-export.mjs.
  const src = fs.readFileSync(new URL('../main/pdf.js', import.meta.url), 'utf8');
  assert.match(src, /setWebRTCIPHandlingPolicy\('disable_non_proxied_udp'\)/);
  assert.match(src, /await ses\.setProxy\(\{ proxyRules: 'http:\/\/psi-offline\.invalid:9', proxyBypassRules: '<-loopback>' \}\)/);
});

// Parity's one allowance, measured on the tutorial's #arrows: Electron's
// Chromium 152 and Playwright's 153 measured it 845 and 849 px against an
// 846 px fit limit, so one fitted it a step larger than the other.
test('parity allows a borderline fit and nothing more', async () => {
  const { compareBeats, textDifferences, borderlineWithinShare, fitTable, beatTable } = await import('./parity.mjs');
  const r = (chunk, beat, zoom, held = 0, fit = null) => ({ chunk, beat, zoom, held, fit });
  // What each driver measured: the app fitted at 0.95 with 845 px against 846,
  // the command line stopped at 0.9 because 0.95 measured 849.
  const fa = { limit: 846, h: 845, up: 1, hUp: 880 };
  const fc = { limit: 846, h: 810, up: 0.95, hUp: 849 };
  const app = [r('pace', 1, '1.35'), r('arrows', 1, '0.95', 2, fa), r('arrows', 2, '0.95', 1, fa)];
  const cli = [r('pace', 1, '1.35'), r('arrows', 1, '0.9', 2, fc), r('arrows', 2, '0.9', 1, fc)];
  assert.deepEqual(compareBeats(app, cli), { at: -1, borderline: [1, 2] });
  // Either side of the pair may be the larger one.
  assert.deepEqual(compareBeats(cli, app), { at: -1, borderline: [1, 2] });
  // One step apart with the heights far from the limit is not a threshold –
  // it is what a missing picture or a fallback face looks like – and neither
  // is a step with no measurement behind it.
  const far = { limit: 846, h: 700, up: 0.95, hUp: 900 };
  assert.equal(compareBeats(app, [cli[0], r('arrows', 1, '0.9', 2, far), cli[2]]).at, 1);
  assert.equal(compareBeats([app[0], r('arrows', 1, '0.95', 2, { ...fa, h: 790 }), app[2]], cli).at, 1);
  assert.equal(compareBeats(app, [cli[0], r('arrows', 1, '0.9', 2), cli[2]]).at, 1);
  // The measurement has to be at the other driver's zoom.
  assert.equal(compareBeats(app, [cli[0], r('arrows', 1, '0.9', 2, { ...fc, up: 1 }), cli[2]]).at, 1);
  // The heights come out of the dump, a comment pdf-core appends after </html>.
  const page = (n, z) => `<div class="pdf-page" id="psiINT-pdf-p${n}" style="--zoom: ${z};"><article data-chunk-id="a-b"></article></div>`;
  const dump = `<html><head></head><body>${page(1, 0.95)}</body></html>\n<!-- psi-pdf-fit `
    + JSON.stringify([{ page: 'psiINT-pdf-p1', ...fa }]).replace(/-/g, '\\u002d') + ' -->\n';
  assert.equal(fitTable(dump)[0].h, 845);
  assert.deepEqual(beatTable(dump)[0].fit, { page: 'psiINT-pdf-p1', ...fa });
  assert.equal(beatTable(dump)[0].chunk, 'a-b');
  assert.deepEqual(fitTable('<html></html>'), []);
  // Two steps apart, another beat or another held-back count is a drift.
  assert.equal(compareBeats(app, [cli[0], r('arrows', 1, '0.85', 2, fc), cli[2]]).at, 1);
  assert.equal(compareBeats(app, [cli[0], r('arrows', 1, '0.9', 1, fc), cli[2]]).at, 1);
  assert.equal(compareBeats(app, [cli[0], r('expand', 1, '0.9', 2, fc), cli[2]]).at, 1);
  // On a borderline page the words have to be the same, on any other the text.
  const ta = ['a b', 'Two keys move\nyou through', 'x'];
  const tc = ['a b', 'Two keys\nmove you through', 'x'];
  assert.deepEqual(textDifferences(ta, tc, [1, 2]), []);
  assert.deepEqual(textDifferences(ta, tc, []), [2]);
  assert.deepEqual(textDifferences(ta, ['a b', 'Two keys move you', 'x'], [1]), [2]);
  // And a deck where most chunks are borderline is not a threshold.
  assert.equal(borderlineWithinShare(app, [1, 2]).ok, true);
  const many = Array.from({ length: 20 }, (_, i) => r('c' + i, 1, '1'));
  assert.equal(borderlineWithinShare(many, [0]).ok, true);
  assert.equal(borderlineWithinShare(many, [0, 1]).ok, false);
});
