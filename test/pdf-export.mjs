#!/usr/bin/env node
/*
 * node test/pdf-export.mjs
 *
 * --slides-pdf: the states that become pages, what leaves the clone, where a
 * link points, and the four diagnostics the export promises.
 *
 * Shaped after test/settings.mjs, not after test/run.mjs, and the difference
 * is the whole design. run.mjs builds a lecture, serves it, hands a spec an
 * open deck and asserts through a browser. This test wants none of that: it
 * writes one source into $TMPDIR, spawns build.js, and reads two files back.
 * Giving the spec runner a `standalone` branch for its only outlier would
 * bend the spec contract for one file.
 *
 * **It drives no browser and never imports playwright-core.** Chromium runs
 * in build.js's subprocess; the export writes `--pdf-dump-dom=<path>` before
 * printing, and the whole DOM half of the check becomes text search in Node -
 * the same thing settings.mjs does with built HTML.
 *
 * The fixture lives in $TMPDIR and not in lectures/, because lint.js and
 * gates.yml run over lectures/ and an over-long chunk with a dead fragment
 * link is exactly what a linter is right to shout about.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let passed = 0;
const failures = [];
function ok(cond, what, detail = '') {
  if (cond) { passed++; console.log('  ✓ ' + what); return; }
  failures.push(what + (detail ? ' — ' + detail : ''));
  console.log('  ✗ ' + what + (detail ? ' — ' + detail : ''));
}
function note(what) { console.log('    ' + what); }

// A 1x1 PNG. Enough to be an asset that resolves - the backdrop needs one,
// and the point of the fixture is the states, not the picture.
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64');

// One chunk per case, and every case is a promise made somewhere in the plan.
// The order is the reading order, so a page table read top to bottom is also
// the source read top to bottom.
const SOURCE = `---
title: The export fixture
subtitle: One chunk per case
presenter: A Person
cover: masthead
section: rule
theme: light-red
---

## title: {#cover}

A cover, which is a chunk with no beats at all.

# Beats {#beats}

## free: Three text segments {.standard #segments}

The first segment, which is also the topic sentence.

---

The second segment arrives on a press.

---

The third, and the chunk is then fully built up.

## figure: A drawing that arrives in pieces {.full #stepped}

::: draw
box a "First" at 0,0
box b "Second" right of a
box c "Third" right of b
edge a -> b
edge b -> c

step two
  emph b
step three
  emph c
:::

## figure: A drawing inside a reveal segment {.full #inseg}

An opening sentence before the figure.

---

::: draw
box p "Alone" at 0,0
:::

## figure: A picture behind the words {.full #backdrop}

::: backdrop pic {cover} reveal full, right 52%

### The frame closes over the ground

## figure: A block held back until a beat {.full #overlaid}

::: backdrop pic {cover clear}

::: overlay {left clear standard} from 1
### It arrives on the first press
:::

## principle: A chunk with no beats at all {.standard #beatless}

One paragraph, no segments, no steps, no frames. It is one page.

## example: Asides, a note and an address {.wide #asides}

A chunk that carries the three things the PDF must drop.

::: expand The aside
This body opens on a keypress in the live view and is not in the PDF at all.
:::

The address is [the project site](https://uba-psi.github.io/psi-slides/), which
stays a link, and its QR button does not.

> note: This narration belongs to print-notes.html, never to slides.pdf.

## free: Links that resolve, and one that does not {.standard #links}

A link to [a chunk](#beatless), a link to [a column](#beats), and a link to
[nothing at all](#gibtsnicht).

## figure: An image that is not there {.full #missing}

![](./fehlt.png)

A path written out by hand, which the build passes through and the browser
cannot load.

## figure: A remote image {.full #remote}

![](https://example.invalid/there-is-no-such-host.png)

The export is offline, so this one is refused before it reaches the network.

## example: A hosted player {.wide #embed}

::: embed https://vimeo.com/76979871

## free: A chunk that will not fit however small the type is {.standard #toolong}

${Array.from({ length: 40 }, (_, i) =>
  `Paragraph ${i + 1} of a chunk written to overflow the frame at every zoom the `
  + 'fit is allowed to reach, so that the overflow diagnostic has something '
  + 'honest to report about it rather than a contrived one-line case.').join('\n\n')}

## closing: That is the fixture {#end}

The bookend, which is a cover by another name.
`;

// ── running the export ──────────────────────────────────────────────
function run(dir, flags, env = {}) {
  return spawnSync(process.execPath,
    [path.join(ROOT, 'build.js'), path.join(dir, 'source.md'), '--slides-pdf', ...flags],
    { cwd: ROOT, encoding: 'utf8', env: { ...process.env, ...env } });
}

// ── reading the PDF ─────────────────────────────────────────────────
//
// Chromium writes PDF 1.4 without object streams, so /Count and /MediaBox are
// in the clear and twelve lines beat taking on a PDF parser the rest of the
// project would never touch again. But not the first match either: /Count also
// stands in an /Outlines tree, so this anchors on the page tree - the one
// /Type /Pages object with no /Parent - and says what it could not read rather
// than dereferencing a miss.
function pageTree(pdf) {
  for (const m of pdf.matchAll(/\d+ 0 obj([\s\S]*?)endobj/g)) {
    const body = m[1];
    if (!/\/Type\s*\/Pages\b/.test(body)) continue;
    if (/\/Parent\b/.test(body)) continue;
    const c = /\/Count\s+(\d+)/.exec(body);
    if (c) return Number(c[1]);
  }
  throw new Error(
    'could not read the page tree in slides.pdf. The browser has probably '
    + 'written a PDF structure this test does not know (compressed objects?). '
    + 'Check by hand: pdfinfo slides.pdf');
}
function mediaBox(pdf) {
  const m = /\/MediaBox\s*\[\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*\]/.exec(pdf);
  if (!m) {
    throw new Error('could not read a /MediaBox out of slides.pdf. Check by hand: pdfinfo slides.pdf');
  }
  return m.slice(1).map(Number);
}
const near = (a, b, tol = 1) => Math.abs(a - b) <= tol;

// A tool that is not installed is a machine nobody set up, not a defect - the
// same shape encoder() in shoot-lib.mjs has. Only these two are optional; the
// page count and the page size are not.
function have(tool) {
  return spawnSync(tool, ['-v'], { encoding: 'utf8' }).error === undefined;
}

// ── the run ─────────────────────────────────────────────────────────
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-pdf-'));
try {
  fs.mkdirSync(path.join(dir, 'assets'));
  fs.writeFileSync(path.join(dir, 'assets', 'pic.png'), PNG_1X1);
  fs.writeFileSync(path.join(dir, 'source.md'), SOURCE);

  const domPath = path.join(dir, 'dump.html');
  const pdfPath = path.join(dir, 'slides.pdf');

  console.log('\nthe export runs at all');
  const r = run(dir, [`--pdf-dump-dom=${domPath}`]);
  ok(r.status === 0, 'build.js --slides-pdf exits 0',
     (r.stdout || '').slice(-600) + (r.stderr || '').slice(-600));
  if (r.status !== 0) {
    console.log(`\n${passed} passed, ${failures.length + 1} failed`);
    process.exit(1);
  }
  const full = fs.readFileSync(domPath, 'utf8');
  // Everything asserted below is about the print DOM, which is the body. The
  // dump is documentElement.outerHTML, so <head> carries every inlined
  // stylesheet - and three of these checks first failed on prose inside a CSS
  // comment: AUDIENCE_CSS explains why the TOC overlay is scoped to `nav#toc`
  // rather than `id="toc"`, and the export stylesheet says what stands where
  // an <iframe> was. Both are correct comments about elements that are not
  // there. Cut at the last </head> for the same reason settings.mjs anchors
  // on a body attribute: the literal appears in comments too.
  const dom = full.slice(full.lastIndexOf('</head>'));
  const err = r.stderr || '';
  const log = (r.stdout || '') + err;

  // The wrapper table, in document order. Every later assertion reads this
  // rather than counting substrings a second time.
  const pages = [...dom.matchAll(
    /<div class="pdf-page" id="(pdf-p\d+)" style="--zoom: ([0-9.]+);">([\s\S]*?)(?=<div class="pdf-page"|<\/body>)/g)]
    .map(m => ({
      id: m[1],
      zoom: Number(m[2]),
      chunkId: (/data-chunk-id="([^"]+)"/.exec(m[3]) || [, null])[1],
      body: m[3],
    }));

  console.log('\nstates and pages');
  ok(pages.length > 0, 'the print DOM is a run of .pdf-page wrappers', String(pages.length));
  const order = pages.map(p => p.chunkId);
  const firstOf = {};
  order.forEach((id, i) => { if (firstOf[id] === undefined) firstOf[id] = i; });
  // Cumulative: every page of a chunk is adjacent to the rest of them, which
  // is what "the beats of a chunk are consecutive pages" means as an
  // assertion over the table.
  const contiguous = Object.entries(firstOf).every(([id, at]) => {
    const n = order.filter(x => x === id).length;
    return order.slice(at, at + n).every(x => x === id);
  });
  ok(contiguous, 'each chunk\'s pages are consecutive, in source order');
  // One opening page per chunk, and the chunks appear in source order.
  const expectOrder = ['cover', 'beats-section', 'segments', 'stepped', 'inseg',
    'backdrop', 'overlaid', 'beatless', 'asides', 'links', 'missing', 'remote',
    'embed', 'toolong', 'end'];
  ok(JSON.stringify(Object.keys(firstOf)) === JSON.stringify(expectOrder),
     'every chunk opens exactly one run of pages, in source order',
     JSON.stringify(Object.keys(firstOf)));
  const countOf = (id) => order.filter(x => x === id).length;
  ok(countOf('beatless') === 1, 'a chunk with no beats is exactly one page', String(countOf('beatless')));
  ok(countOf('cover') === 1, 'and so is the cover', String(countOf('cover')));
  ok(countOf('segments') === 3, 'three reveal segments are three pages', String(countOf('segments')));
  ok(countOf('stepped') === 3, 'a drawing with two steps is three pages – the opening state and two beats',
     String(countOf('stepped')));
  ok(countOf('backdrop') === 2, 'a backdrop with two reveal frames is two pages', String(countOf('backdrop')));
  ok(countOf('overlaid') === 2, 'an overlay with `from 1` is two pages', String(countOf('overlaid')));
  ok(pages.length === expectOrder.reduce((s, id) => s + countOf(id), 0),
     'and the total is the sum of them, with nothing else in the run');

  console.log('\nwhat the clone leaves behind');
  for (const sel of ['exps', 'exp-chev', 'exp-body', 'annot-box', 'annot-add', 'link-code']) {
    ok(!new RegExp(`class="[^"]*\\b${sel}\\b`).test(dom), `no .${sel} in the print DOM`);
  }
  for (const id of ['link-overlay', 'toc', 'search-panel', 'mode-badge', 'help-overlay',
    'laser-pointer', 'touch-controls', 'figure-overlay', 'stage-viewport']) {
    ok(!new RegExp(`id="${id}"`).test(dom), `no #${id} in the print DOM`);
  }
  ok(!/<script/i.test(dom), 'and no <script at all, the SVG step payload included');
  ok(!/> note:|belongs to print-notes/.test(dom), 'the speaker note is not in the PDF');
  ok(!/opens on a keypress in the live view/.test(dom), 'nor is the expansion body');

  console.log('\nlinks');
  ok(/<a [^>]*href="https:\/\/uba-psi\.github\.io\/psi-slides\/"/.test(dom),
     'an external link keeps its href and stays an <a>');
  const chunkHref = /href="#(pdf-p\d+)"[^>]*>a chunk</.exec(dom)
    || /<a href="#(pdf-p\d+)">a chunk<\/a>/.exec(dom);
  ok(!!chunkHref, 'a link to a chunk points at a page wrapper');
  if (chunkHref) {
    ok(chunkHref[1] === pages[firstOf['beatless']].id,
       'and at the FIRST page of that chunk', `${chunkHref[1]} vs ${pages[firstOf['beatless']].id}`);
  }
  const colHref = /<a href="#(pdf-p\d+)">a column<\/a>/.exec(dom);
  ok(!!colHref, 'a link to a column id resolves too');
  if (colHref) {
    ok(colHref[1] === pages[firstOf['beats-section']].id,
       'and lands on the divider slide that column generates',
       `${colHref[1]} vs ${pages[firstOf['beats-section']].id}`);
  }
  ok(/<span[^>]*>nothing at all<\/span>/.test(dom),
     'a fragment that resolves to neither is demoted to a <span>');
  // The strongest form of the rule, and the one that does not depend on
  // knowing which links the fixture wrote: nothing points anywhere absent.
  const dangling = [...dom.matchAll(/<a [^>]*href="#([^"]+)"/g)]
    .map(m => m[1])
    .filter(f => !new RegExp(`id="${f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`).test(dom));
  ok(dangling.length === 0, 'and no <a href="#…"> in the print DOM points at an id that is absent',
     dangling.join(', '));

  console.log('\ndiagrams');
  // The assertion the "do not prefix ids" decision hangs on. Two clones of one
  // ::: draw standing on different beats must differ somewhere in their
  // geometry - if they do not, a clone is reading another clone's definition
  // through a duplicated id and the rewriter is due after all.
  const stepPages = pages.filter(p => p.chunkId === 'stepped');
  const svgOf = (p) => (/<svg[\s\S]*?<\/svg>/.exec(p.body) || [''])[0];
  ok(stepPages.length >= 2 && svgOf(stepPages[0]) !== svgOf(stepPages[1]),
     'two beat clones of one ::: draw differ in what they draw');
  ok(stepPages.length >= 3 && svgOf(stepPages[1]) !== svgOf(stepPages[2]),
     'and so do the second and the third');
  const scopes = [...dom.matchAll(/@scope\s*\(([^)]*)\)/g)].map(m => m[1].trim());
  ok(scopes.length === 0 || new Set(scopes).size === 1,
     'every inlined SVG stylesheet keeps the @scope selector it was built with',
     [...new Set(scopes)].join(' | '));

  console.log('\nthe four diagnostics');
  ok(/#gibtsnicht/.test(err) && /\blinks\b/.test(err),
     'a dead fragment names the fragment and the chunk it is in',
     err.split('\n').filter(l => /gibtsnicht/.test(l)).join(''));
  ok(/fehlt\.png/.test(err) && /\bmissing\b/.test(err),
     'a missing image names the src and the chunk',
     err.split('\n').filter(l => /fehlt/.test(l)).join(''));
  const blockedLines = err.split('\n').filter(l => /^\S*: blocked \d+ request/.test(l));
  ok(blockedLines.length === 1 && /example\.invalid/.test(blockedLines[0]),
     'a refused origin is reported once, not once per request',
     JSON.stringify(blockedLines));
  // Two lines about one image, and both are wanted: one says the picture is
  // blank, the other says why. The origin line is the evidence for the offline
  // promise - the runtime does attempt the request, or there would be nothing
  // to count.
  ok(err.split('\n').filter(l => /example\.invalid/.test(l)).length === 2,
     'and the same remote image is also reported as a picture that did not load');
  ok(/toolong/.test(err) && /beat \d/.test(err) && /zoom 0\.60/.test(err),
     'an overflowing state names the chunk and the beat',
     err.split('\n').filter(l => /toolong/.test(l)).join(''));

  console.log('\nmedia');
  ok(!/<iframe/i.test(dom), 'no iframe survives into the PDF');
  ok(/pdf-embed-card/.test(dom), 'the hosted player becomes a card of the export\'s own');
  ok(!/serve the lecture over http|needs the lecture served/i.test(dom),
     'and not the live view\'s card, whose advice a PDF cannot take');
  ok(/vimeo\.com\/76979871/.test(dom), 'the address under it survives, which is what the card is for');

  console.log('\nthe file');
  const pdf = fs.readFileSync(pdfPath, 'latin1');
  ok(pdf.startsWith('%PDF-'), 'slides.pdf is a PDF');
  ok(fs.statSync(pdfPath).size > 10 * 1024, 'and is more than 10 KB',
     String(fs.statSync(pdfPath).size));
  // The count of the FILE, not of the wrappers. The measurement that started
  // this plan showed a DOM with four correctly sized wrappers printing as a
  // one-page PDF; no DOM assertion would have seen it.
  ok(pageTree(pdf) === pages.length, 'the page tree holds one page per wrapper',
     `${pageTree(pdf)} vs ${pages.length}`);
  const mb = mediaBox(pdf);
  ok(near(mb[2], 1200) && near(mb[3], 675.12),
     '16:9 is a 1200 x 675 pt page', JSON.stringify(mb));
  ok(!fs.existsSync(pdfPath + '.tmp'), 'and no .tmp is left behind');
  // The other half of the link promise, and the DOM cannot answer it: an <a>
  // with the right href is not yet a clickable annotation. Chromium writes an
  // external link as /S /URI and an internal one as a named /Dest, so both are
  // checkable in the clear alongside /Count.
  ok(/\/S\s*\/URI\s*\n?\/URI \(https:\/\/uba-psi\.github\.io\/psi-slides\/\)/.test(pdf),
     'the external link is a clickable URI annotation in the file');
  const dests = [...pdf.matchAll(/\/Dest\s+\/(pdf-p\d+)/g)].map(m => m[1]);
  ok(dests.includes(pages[firstOf['beatless']].id),
     'and the chunk link is a named destination on that chunk\'s first page',
     dests.join(', '));
  ok(dests.includes(pages[firstOf['beats-section']].id),
     'and the column link one on its divider slide', dests.join(', '));
  ok(!/\/URI \(#/.test(pdf), 'no fragment was written out as an external address');

  console.log('\n16:10, which is public contract and was never checked');
  const alt = path.join(dir, 'wide.pdf');
  const altDom = path.join(dir, 'wide.html');
  const r2 = run(dir, ['--pdf-size=16:10', '--pdf-beats=final',
    `--pdf-out=${alt}`, `--pdf-dump-dom=${altDom}`]);
  ok(r2.status === 0, '--pdf-size=16:10 --pdf-beats=final exits 0', (r2.stderr || '').slice(-400));
  if (r2.status === 0) {
    const dom2 = fs.readFileSync(altDom, 'utf8');
    const pages2 = [...dom2.matchAll(/<div class="pdf-page"/g)].length;
    ok(pages2 === expectOrder.length, '--pdf-beats=final is exactly one page per chunk',
       `${pages2} vs ${expectOrder.length}`);
    ok(/--slide-h: 1000px !important/.test(dom2), 'the DOM is pinned to 1000px of slide height');
    const mb2 = mediaBox(fs.readFileSync(alt, 'latin1'));
    ok(near(mb2[2], 1200) && near(mb2[3], 750), '16:10 is a 1200 x 750 pt page', JSON.stringify(mb2));
  }

  console.log('\nzoom: a ceiling on fit, and a fixed number as the way out');
  // The live view's fit ceiling is 2.2, which is right in a hall and wrong on
  // paper: it makes the type jump by a factor of 3.7 between neighbouring
  // pages. The export never enlarges past the runtime's own default zoom.
  const fitZooms = pages.map(p => p.zoom);
  ok(Math.max(...fitZooms) <= 1.35, 'no page is fitted above the 1.35 ceiling',
     String(Math.max(...fitZooms)));
  ok(new Set(fitZooms).size > 1, 'and fit still sizes chunks differently from one another',
     [...new Set(fitZooms)].sort().join(' '));

  const fx = path.join(dir, 'fixed.pdf');
  const fxDom = path.join(dir, 'fixed.html');
  const r4 = run(dir, ['--pdf-zoom=0.9', `--pdf-out=${fx}`, `--pdf-dump-dom=${fxDom}`]);
  ok(r4.status === 0, '--pdf-zoom=<n> exits 0', (r4.stderr || '').slice(-300));
  if (r4.status === 0) {
    // Body only. AUDIENCE_CSS declares `--zoom: 1.35` on :root in <head>, and
    // reading the whole dump picks that up as a second value - the same trap
    // the cleanliness assertions fell into.
    const fxFull = fs.readFileSync(fxDom, 'utf8');
    const fxBody = fxFull.slice(fxFull.lastIndexOf('</head>'));
    const zs = [...fxBody.matchAll(/--zoom: ([0-9.]+);/g)].map(m => m[1]);
    ok(zs.length === pages.length && new Set(zs).size === 1 && zs[0] === '0.9',
       'and holds every page at exactly that zoom', [...new Set(zs)].join(' '));
  }
  // Refused before a browser starts, like every other bad --pdf-* value.
  const r5 = run(dir, ['--pdf-zoom=huge']);
  ok(r5.status !== 0 && /neither `fit` nor a number/.test(r5.stderr),
     'a --pdf-zoom that is neither fit nor a number is refused', r5.stderr.split('\n')[0]);
  ok(!/\bat .*\(.*:\d+:\d+\)/.test(r5.stderr), 'without a stack trace');

  console.log('\ncollapse: which half of the text the pages carry');
  // Unset follows the lecture, like every other appearance option. The
  // override exists because the two answers are different documents: the slide
  // text is what the room saw, the full prose is the manuscript behind it.
  const collapsed = (mode) => {
    const d = path.join(dir, `c-${mode}.html`);
    const rr = run(dir, [`--pdf-collapse=${mode}`, `--pdf-out=${path.join(dir, `c-${mode}.pdf`)}`,
      `--pdf-dump-dom=${d}`]);
    if (rr.status !== 0) return null;
    const t = fs.readFileSync(d, 'utf8');
    return t.slice(t.lastIndexOf('</head>'));
  };
  const cb = collapsed('topic-bold');
  ok(cb && /<body[^>]*data-collapse="topic-bold"/.test(cb),
     '--pdf-collapse=topic-bold reaches the body of the print DOM');
  // The collapse is CSS over spans splitSentencesIn made at boot, so the words
  // are still in the DOM - what has to be true is that the walker ran and the
  // attribute the rules key off is set.
  ok(cb && /class="prose"/.test(cb),
     'and the continuation prose is wrapped, which is what the rules hide');
  const cn = collapsed('none');
  ok(cn && /<body[^>]*data-collapse="none"/.test(cn), '--pdf-collapse=none reaches it too');
  ok(/<body[^>]*data-collapse="topic-bold"/.test(dom),
     'and with neither given the export follows the lecture');
  const rc = run(dir, ['--pdf-collapse=short']);
  ok(rc.status !== 0 && /is not a mode/.test(rc.stderr),
     'an unknown collapse mode is refused before a browser starts', rc.stderr.split('\n')[0]);

  console.log('\na host with no browser');
  // No fixture needed and none wanted: this failure happens before a page
  // exists, so the message must name the paths it tried and NOT a chunk id.
  const r3 = run(dir, [], { PSI_CHROME: '/gibt/es/nicht' });
  ok(r3.status !== 0, 'a missing browser fails the run', String(r3.status));
  ok(/PSI_CHROME/.test(r3.stderr) && /Tried:/.test(r3.stderr)
     && /\/gibt\/es\/nicht/.test(r3.stderr),
     'and says what was looked for and what to set', r3.stderr.split('\n')[0]);
  ok(!/\bat .*\(.*:\d+:\d+\)/.test(r3.stderr), 'without a stack trace – err.userFacing',
     r3.stderr.split('\n').slice(0, 4).join(' / '));

  console.log('\nthe text is text (needs poppler)');
  if (have('pdftotext')) {
    const txt = path.join(dir, 'out.txt');
    spawnSync('pdftotext', [pdfPath, txt]);
    const text = fs.readFileSync(txt, 'utf8');
    ok(/One paragraph, no segments, no steps, no frames/.test(text.replace(/\s+/g, ' ')),
       'pdftotext extracts a sentence of the fixture, so no page is a raster');
  } else {
    note('pdftotext is not on PATH – skipping the extraction check.');
  }
  if (have('pdffonts')) {
    const f = spawnSync('pdffonts', [pdfPath], { encoding: 'utf8' }).stdout || '';
    const t3 = f.split('\n').filter(l => /Type 3/.test(l)).length;
    const cid = f.split('\n').filter(l => /CID/.test(l)).length;
    // Printed, never asserted: Type 3 is accepted for v1 and documented as
    // such, so a number here is a record, not a gate.
    note(`pdffonts: ${t3} Type 3 face(s), ${cid} CID face(s) – Type 3 is accepted for v1.`);
  } else {
    note('pdffonts is not on PATH – skipping the font note.');
  }

  note(`build log: ${log.split('\n').filter(l => l.startsWith('[pdf]')).join(' | ')}`);
} finally {
  // $PSI_PDF_KEEP leaves the fixture, the DOM dump and both PDFs in $TMPDIR.
  // A failing DOM assertion is a question about one string in a megabyte of
  // HTML, and the alternative to this line is re-deriving the fixture by hand.
  if (process.env.PSI_PDF_KEEP) console.log(`\n  (kept: ${dir})`);
  else fs.rmSync(dir, { recursive: true, force: true });
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log(failures.map(f => '  ✗ ' + f).join('\n'));
  process.exit(1);
}
