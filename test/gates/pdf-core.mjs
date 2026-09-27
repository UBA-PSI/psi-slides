/*
 * The PDF export's policy, without a browser.
 *
 * pdf-core.mjs is driven by two drivers – Playwright on the command line,
 * Electron's own Chromium in the desktop app – and the one thing neither
 * driver's own test can see is whether the other is asked for the same things
 * in the same order. The order is where the export's load-bearing properties
 * live, so this gate hands exportSlides a driver that answers with canned
 * values and records every call, and asserts the order:
 *
 *   1. the page is opened, with the network refused, before anything loads
 *   2. auto-fit and the collapse (pageSetup) before the walk (pageCollect)
 *   3. the print DOM (pageInstall) before the pdf, and the pdf on 'screen'
 *
 * Plus the two halves that are plain functions: the option checks refuse what
 * build.js's pdfOptionsFrom refused before they moved, in the same words, and
 * formatReport turns fixed results into fixed lines. The expected messages
 * are written out here rather than read back from the module, because the
 * point is that they did not change when they moved.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './harness.mjs';
import {
  PDF_SIZES, PDF_FIT_CEILING, resolvePdfOptions, exportSlides, formatReport, linkTable,
} from '../../pdf-core.mjs';

export const name = 'pdf-core: the export\'s call order, option checks and report lines';

// ── a driver that records ───────────────────────────────────────────
function fakeDriver({ failAt = null } = {}) {
  const calls = [];
  const cb = {};
  const evalAnswers = {
    pagePrepare: { stills: 0, placeholders: 0, embeds: 1 },
    pageSetup: true,
    pageCollect: {
      pages: [
        { chunkId: 'a', beat: 0, wrapperId: 'pdf-p1', zoom: 1 },
        { chunkId: 'b', beat: 1, wrapperId: 'pdf-p2', zoom: 1 },
        { chunkId: 'b', beat: 2, wrapperId: 'pdf-p3', zoom: 1 },
      ],
      overflow: [],
      missingImages: [],
      firstPageOf: { a: 'pdf-p1', b: 'pdf-p2', 'part-section': 'pdf-p2' },
      columns: [{ id: 'part', sectionChunk: 'part-section', firstChunk: 'b' }],
      viewportH: 900,
    },
    pageInstall: { dead: [], pages: 3 },
  };
  const step = (what) => {
    calls.push(what);
    if (failAt === what) throw new Error('fake failure at ' + what);
  };
  const driver = {
    version: '999.0',
    where: '/fake/chrome',
    async open(o) {
      Object.assign(cb, o);
      step('open');
      return {
        async load(url) {
          step('load');
          // Requests and an error the page makes during its load, so the
          // counting paths run.
          cb.onBlocked('https://example.invalid');
          cb.onBlocked('https://example.invalid');
          cb.onPageError('boom');
          calls.push('load:' + url);
        },
        async waitFor(fn, t) { step('waitFor'); calls.push('waitFor:' + t); },
        async evaluate(fn, arg) {
          const n = fn.name || 'anonymous';
          step('evaluate:' + n);
          calls.push({ fn: n, arg });
          if (n === 'anonymous') return '<html>dump</html>';
          return evalAnswers[n];
        },
        async pdf(how) { step('pdf'); calls.push({ pdf: how }); return 'BYTES'; },
        async close() { calls.push('page.close'); },
      };
    },
    async close() { calls.push('driver.close'); },
  };
  return { driver, calls, cb };
}

const OPTS = {
  url: 'file:///deck/audience.html',
  beats: 'all', size: '16:9', w: 1600, h: 900, zoom: null,
  collapse: 'topic-bold', ceiling: 1.35, dumpDom: true,
};

// ── the messages, as pdfOptionsFrom wrote them before the move ──────
const REFUSALS = [
  [{ beats: 'some' }, 'Error: --pdf-beats=some is not a mode. Use all (default) or final.'],
  [{ size: '4:3' }, 'Error: --pdf-size=4:3 is not a size. Use 16:9 or 16:10.'],
  [{ zoomMax: '3' },
    'Error: --pdf-zoom-max=3 is not a number between 0.6 and 2.2.\n'
    + '  It is the largest zoom the fit may reach (default 1.35). Raise it to'
    + ' fill more of each page, lower it to keep the type even across the deck.'],
  [{ zoomMax: 'x' }, null],
  [{ zoom: 'big' },
    'Error: --pdf-zoom=big is neither `fit` nor a number between 0.6 and 2.2.\n'
    + '  fit (the default) sizes every chunk to the page and never enlarges past 1.35.\n'
    + '  A number holds every page at that zoom and reports what runs off it.'],
  [{ zoom: '0.5' }, null],
  [{ collapse: 'all' },
    'Error: --pdf-collapse=all is not a mode. Use topic-bold (the slide text'
    + ' alone) or none (the full prose). Omit it to follow the lecture.'],
];

export async function run({ report }) {
  const { ok } = report;

  // ── the order ──────────────────────────────────────────────────────
  {
    const { driver, calls } = fakeDriver();
    const r = await exportSlides(driver, OPTS);
    const order = calls.map(c => typeof c === 'string' ? c : (c.fn ? 'evaluate:' + c.fn : 'pdf-how'));
    const at = (what) => order.indexOf(what);
    ok(at('open') === 0, 'the page is opened first, and the network is refused in open()', order.join(' > '));
    ok(at('open') < at('load'), 'open (network refused) comes before load');
    ok(at('load') < at('waitFor'), 'load comes before the wait for psiExport and the fonts');
    ok(at('waitFor') < at('evaluate:pagePrepare'), 'nothing runs in the page before the wait');
    ok(at('evaluate:pagePrepare') < at('evaluate:pageSetup'),
      'videos and embeds are replaced before auto-fit measures');
    ok(at('evaluate:pageSetup') >= 0 && at('evaluate:pageSetup') < at('evaluate:pageCollect'),
      'auto-fit and the collapse (pageSetup) come before the walk (pageCollect)');
    ok(at('evaluate:pageCollect') < at('evaluate:pageInstall'),
      'the walk comes before the print DOM swap');
    ok(at('evaluate:pageInstall') < at('pdf'), 'the print DOM is installed before the pdf');
    ok(at('evaluate:anonymous') > at('evaluate:pageInstall') && at('evaluate:anonymous') < at('pdf'),
      'the DOM dump reads the installed print DOM, before the pdf');
    ok(order[order.length - 1] === 'page.close', 'the page is closed last');
    ok(!calls.includes('driver.close'), 'exportSlides never closes the driver – one browser, several exports');
    ok(calls.filter(c => c === 'open').length === 1, 'one page per export');

    const setup = calls.find(c => c.fn === 'pageSetup');
    ok(setup && setup.arg.collapse === 'topic-bold', 'pageSetup is given the collapse');
    const collect = calls.find(c => c.fn === 'pageCollect');
    ok(collect && JSON.stringify(collect.arg)
      === JSON.stringify({ beats: 'all', h: 900, zoom: null, collapse: 'topic-bold', ceiling: 1.35 }),
      'pageCollect is given beats, height, zoom, collapse and ceiling', JSON.stringify(collect && collect.arg));
    const install = calls.find(c => c.fn === 'pageInstall');
    ok(install && /--slide-w: 1600px !important/.test(install.arg.css)
      && /--slide-h: 900px !important/.test(install.arg.css) && !/%[WH]%/.test(install.arg.css),
      'the stylesheet reaches the page with the size filled in');
    ok(install && install.arg.links.part === 'pdf-p2' && install.arg.links.a === 'pdf-p1',
      'the link table carries chunks and columns');
    const how = calls.find(c => c.pdf);
    ok(how && how.pdf.media === 'screen' && how.pdf.w === 1600 && how.pdf.h === 900,
      'the pdf is printed on screen media at the export\'s own page size', JSON.stringify(how && how.pdf));
    ok(calls.includes('load:file:///deck/audience.html'), 'the url is loaded as given');
    ok(calls.includes('waitFor:30000'), 'the wait is bounded at thirty seconds');
    for (const [c, arg] of calls.filter(c => c.fn).map(c => [c.fn, c.arg])) {
      ok(arg === undefined || JSON.stringify(JSON.parse(JSON.stringify(arg))) === JSON.stringify(arg),
        `${c}'s argument survives JSON – the Electron driver sends it as text`);
    }

    ok(r.pdf === 'BYTES' && r.dom === '<html>dump</html>', 'the bytes and the dump come back, nothing is written');
    ok(r.pages === 3 && r.chunks === 2, 'pages and distinct chunks are counted', `${r.pages}/${r.chunks}`);
    ok(JSON.stringify(r.blocked) === JSON.stringify([{ origin: 'https://example.invalid', count: 2 }]),
      'blocked requests are counted per origin, as plain data', JSON.stringify(r.blocked));
    ok(r.pageErrors.length === 1 && r.pageErrors[0] === 'boom', 'page errors are collected');
    ok(r.version === '999.0' && r.where === '/fake/chrome', 'the driver names itself in the result');
  }

  {
    const { driver, calls } = fakeDriver();
    const r = await exportSlides(driver, { ...OPTS, dumpDom: false, collapse: null });
    ok(r.dom === null && !calls.some(c => c.fn === 'anonymous'), 'no dump is taken unless asked for');
  }

  {
    const { driver, calls } = fakeDriver({ failAt: 'evaluate:pageCollect' });
    let threw = false;
    try { await exportSlides(driver, OPTS); } catch (e) { threw = true; }
    ok(threw && calls[calls.length - 1] === 'page.close' && !calls.some(c => c.pdf),
      'a failure mid-walk still closes the page and prints nothing');
  }

  // ── the option checks ──────────────────────────────────────────────
  ok(PDF_SIZES['16:9'].w === 1600 && PDF_SIZES['16:9'].h === 900
    && PDF_SIZES['16:10'].h === 1000 && PDF_FIT_CEILING === 1.35, 'the sizes and the ceiling');
  ok(JSON.stringify(resolvePdfOptions({}))
    === JSON.stringify({ beats: 'all', size: '16:9', w: 1600, h: 900, zoom: null, collapse: null, ceiling: 1.35 }),
    'nothing given resolves to the defaults', JSON.stringify(resolvePdfOptions({})));
  const full = resolvePdfOptions({ beats: 'final', size: '16:10', zoom: '1.2', zoomMax: '1.6', collapse: 'none' });
  ok(full.beats === 'final' && full.h === 1000 && full.zoom === 1.2 && full.ceiling === 1.6 && full.collapse === 'none',
    'every value given is taken', JSON.stringify(full));
  ok(resolvePdfOptions({ zoom: 'fit' }).zoom === null, 'zoom=fit is null');
  for (const [raw, msg] of REFUSALS) {
    let err = null;
    try { resolvePdfOptions(raw); } catch (e) { err = e; }
    ok(err && err.userFacing === true, `${JSON.stringify(raw)} is refused as a userFacing error`);
    if (msg && err) ok(err.message === msg, `${JSON.stringify(raw)} is refused in the words it always was`, err.message);
  }
  ok(!(() => { try { resolvePdfOptions({ size: 'constructor' }); return true; } catch (e) { return false; } })(),
    'a size that is a property of every object is still not a size');
  {
    let err = null;
    try { resolvePdfOptions({ beats: 'x', collapse: 'y' }); } catch (e) { err = e; }
    ok(err && /--pdf-beats/.test(err.message), 'with two bad values the first in the old order is named');
  }

  // build.js goes through the module and keeps no copy of the words. Read as
  // text, because build.js calls main() at module scope.
  const buildJs = fs.readFileSync(path.join(ROOT, 'build.js'), 'utf8');
  ok(/import \{[^}]*\bresolvePdfOptions\b[^}]*\} from '\.\/pdf-core\.mjs'/.test(buildJs),
    'build.js imports the checks from pdf-core.mjs');
  ok(!/is not a mode\. Use all \(default\) or final/.test(buildJs)
    && !/const PDF_SIZES\b/.test(buildJs) && !/const PDF_FIT_CEILING\b/.test(buildJs),
    'build.js keeps no second copy of the sizes or the refusals');

  // ── the links ──────────────────────────────────────────────────────
  const links = linkTable({
    firstPageOf: { x: 'pdf-p1', y: 'pdf-p4' },
    columns: [
      { id: 'withheading', sectionChunk: 'withheading-section', firstChunk: 'y' },
      { id: 'noheading', sectionChunk: 'noheading-section', firstChunk: 'x' },
      { id: 'empty', sectionChunk: 'empty-section', firstChunk: null },
    ],
  });
  ok(links.noheading === 'pdf-p1' && links.withheading === 'pdf-p4' && !('empty' in links),
    'a column links to its divider, else its first chunk, else nowhere', JSON.stringify(links));

  // ── the report ─────────────────────────────────────────────────────
  const base = {
    size: '16:9', w: 1600, h: 900, beats: 'all', zoom: null, collapse: null, ceiling: 1.35,
    pages: 10, chunks: 7, version: '153.0', where: '/x/chrome',
    prep: { stills: 0, placeholders: 0, embeds: 0 },
    overflow: [], missingImages: [], dead: [], blocked: [], pageErrors: [],
  };
  const lines = (r) => formatReport(r, { outLabel: 'deck/slides.pdf' })
    .map(l => (l.level === 'warn' ? 'E ' : 'O ') + l.text);

  const clean = lines(base);
  ok(JSON.stringify(clean) === JSON.stringify([
    'O [pdf] Chromium 153.0 – /x/chrome',
    'O Wrote deck/slides.pdf (10 page(s) from 7 chunk(s), 16:9 at 1600×900, beats=all, zoom=fit≤1.35)',
  ]), 'a clean run says two lines', clean.join(' | '));

  const busy = lines({
    ...base, zoom: 1.2, collapse: 'topic-bold',
    prep: { stills: 1, placeholders: 2, embeds: 1 },
    overflow: [
      { chunkId: 'a', beat: 1, content: 1200, available: 900, zoom: 1.2 },
      { chunkId: 'b', beat: 2, content: 1000, available: 900, zoom: 1.2 },
      { chunkId: 'c', beat: 0, content: 950, available: 900, zoom: 1.2 },
    ],
    missingImages: [{ chunkId: 'm', src: './gone.png' }],
    dead: [{ chunkId: 'l', fragment: 'nowhere' }],
    blocked: [{ origin: 'https://example.invalid', count: 3 }],
    pageErrors: ['boom'],
  });
  const expected = [
    'E deck/slides.pdf: a beat 1 does not fit the page at zoom 1.20 (1200px of content, 900px available). Shorten it, split it, or drop --pdf-zoom and let each page size itself.',
    'E deck/slides.pdf: b beat 2 does not fit the page at zoom 1.20 (1000px of content, 900px available). Shorten it, split it, or drop --pdf-zoom and let each page size itself.',
    'E deck/slides.pdf: c beat 0 does not fit the page at zoom 1.20 (950px of content, 900px available). Shorten it, split it, or drop --pdf-zoom and let each page size itself.',
    'E deck/slides.pdf: 3 of 10 pages run off the page at --pdf-zoom=1.2. That is what a fixed zoom costs on a deck whose slides differ in length; --pdf-zoom=fit sizes each one instead.',
    'E deck/slides.pdf: m has an image that did not load: ./gone.png – check the path, or build with inlined images (the default).',
    'E deck/slides.pdf: l links to #nowhere, which is no chunk and no column – the link is now plain text. Fix the fragment or drop the link.',
    'E deck/slides.pdf: blocked 3 request(s) to https://example.invalid – the export is offline by design. A hosted embed prints as a card; a remote image prints empty, so inline it.',
    'E deck/slides.pdf: the page reported an error during the export: boom',
    'O [pdf] 3 video(s) replaced by a still (1 frame 0, 2 placeholder).',
    'O [pdf] 1 hosted embed(s) replaced by a card.',
    'O [pdf] Chromium 153.0 – /x/chrome',
    'O Wrote deck/slides.pdf (10 page(s) from 7 chunk(s), 16:9 at 1600×900, beats=all, zoom=1.2, collapse=topic-bold)',
  ];
  ok(busy.length === expected.length, `a run with every diagnostic says ${expected.length} lines`, String(busy.length));
  for (let i = 0; i < expected.length; i++) {
    ok(busy[i] === expected[i], `report line ${i + 1}: ${expected[i].slice(2, 50)}…`, busy[i]);
  }
  const fitOver = lines({ ...base, overflow: [{ chunkId: 'a', beat: 1, content: 2000, available: 900, zoom: 0.6 }] });
  ok(fitOver[0].endsWith('Shorten it or split it.') && fitOver.length === 3,
    'under fit, an overrun is one line and no wholesale warning', fitOver.join(' | '));
}
