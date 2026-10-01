#!/usr/bin/env node
/*
 * node test/pdf-export.mjs
 *
 * --slides-pdf: the states that become pages, what leaves the clone, where a
 * link points, and the four diagnostics the export promises. And, against the
 * same fixture, --print-pdf and --print-notes-pdf: A4, the note in one file
 * and not the other, a fragment link that still lands, one browser for three
 * PDFs, and every combination that would do nothing refused by name. And, on
 * a deck of its own, ::: pulse: the answers on paper, none of the widget's
 * chrome, no request, and nothing of it in the slides.
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
import { spawn, spawnSync } from 'node:child_process';
import dgram from 'node:dgram';
import net from 'node:net';
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

::: backdrop pic {.cover} reveal full, right 52%

### The frame closes over the ground

## figure: A block held back until a beat {.full #overlaid}

::: backdrop pic {.cover .clear}

::: overlay {.left .clear .standard} from 1
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

Two more that go nowhere and used to do worse: [an inherited name](#constructor),
which the link table answered with Object's constructor, and
<a href="#50%zz">a stray percent</a>, which decodeURIComponent threw on and
took the whole slide export with it.

## figure: An image that is not there {.full #missing}

![](./fehlt.png)

A path written out by hand, which the build passes through and the browser
cannot load.

## figure: A remote image {.full #remote}

![](https://example.invalid/there-is-no-such-host.png)

The export is offline, so this one is refused before it reaches the network.

## example: A hosted player {.wide #embed}

::: embed https://vimeo.com/76979871
:::

## free: A chunk that will not fit however small the type is {.standard #toolong}

${Array.from({ length: 40 }, (_, i) =>
  `Paragraph ${i + 1} of a chunk written to overflow the frame at every zoom the `
  + 'fit is allowed to reach, so that the overflow diagnostic has something '
  + 'honest to report about it rather than a contrived one-line case.').join('\n\n')}

## closing: That is the fixture {#end}

The bookend, which is a cover by another name.
`;

// A deck of its own for ::: pulse, because the main fixture asks the network
// for things on purpose and this one must be able to say it asked for
// nothing: two questions, one keyed by its chunk and one by {#key}, and not
// a word that the widget's chrome would print ("Answer", "Show answer",
// "Questions on this page") in the prose, so a hit on one is the chrome.
const PULSE_SOURCE = `---
title: The pulse fixture
lang: en
---

# Ciphers {#ciphers}

## definition: A block cipher {.standard #cipher}

A block cipher maps a fixed-size block to another block under a key.

::: pulse
What does a block cipher take besides the plaintext block?
---
A key, which selects one permutation from the family.
:::

## principle: Kerckhoffs {.standard #kerck}

Security must rest in the key alone.

> note: Kerckhoffs wrote this down in 1883.

::: pulse {#kerck-rest}
Where must the security of a cipher rest?
---
In the secrecy of the key, never of the algorithm.
:::
`;

// ── running the export ──────────────────────────────────────────────
function run(dir, flags, env = {}) {
  return build(dir, ['--slides-pdf', ...flags], env);
}
function build(dir, flags, env = {}) {
  return spawnSync(process.execPath,
    [path.join(ROOT, 'build.js'), path.join(dir, 'source.md'), ...flags],
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
  // comment: AUDIENCE_CSS explains why the TOC overlay is scoped to `nav#psiINT-toc`
  // rather than `id="psiINT-toc"`, and the export stylesheet says what stands where
  // an <iframe> was. Both are correct comments about elements that are not
  // there. Cut at the last </head> for the same reason settings.mjs anchors
  // on a body attribute: the literal appears in comments too.
  const dom = full.slice(full.lastIndexOf('</head>'));
  const err = r.stderr || '';
  const log = (r.stdout || '') + err;

  // The wrapper table, in document order. Every later assertion reads this
  // rather than counting substrings a second time.
  const pages = [...dom.matchAll(
    /<div class="pdf-page" id="(psiINT-pdf-p\d+)" style="--zoom: ([0-9.]+);">([\s\S]*?)(?=<div class="pdf-page"|<\/body>)/g)]
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
  for (const id of ['psiINT-link-overlay', 'psiINT-toc', 'psiINT-search-panel', 'psiINT-mode-badge',
    'psiINT-help-overlay', 'psiINT-start-menu', 'psiINT-start-menu-show', 'psiINT-laser-pointer', 'psiINT-touch-controls', 'psiINT-figure-overlay',
    'psiINT-stage-viewport']) {
    ok(!new RegExp(`id="${id}"`).test(dom), `no #${id} in the print DOM`);
  }
  ok(!/<script/i.test(dom), 'and no <script at all, the SVG step payload included');
  ok(!/> note:|belongs to print-notes/.test(dom), 'the speaker note is not in the PDF');
  ok(!/opens on a keypress in the live view/.test(dom), 'nor is the expansion body');

  console.log('\nlinks');
  ok(/<a [^>]*href="https:\/\/uba-psi\.github\.io\/psi-slides\/"/.test(dom),
     'an external link keeps its href and stays an <a>');
  const chunkHref = /href="#(psiINT-pdf-p\d+)"[^>]*>a chunk</.exec(dom)
    || /<a href="#(psiINT-pdf-p\d+)">a chunk<\/a>/.exec(dom);
  ok(!!chunkHref, 'a link to a chunk points at a page wrapper');
  if (chunkHref) {
    ok(chunkHref[1] === pages[firstOf['beatless']].id,
       'and at the FIRST page of that chunk', `${chunkHref[1]} vs ${pages[firstOf['beatless']].id}`);
  }
  const colHref = /<a href="#(psiINT-pdf-p\d+)">a column<\/a>/.exec(dom);
  ok(!!colHref, 'a link to a column id resolves too');
  if (colHref) {
    ok(colHref[1] === pages[firstOf['beats-section']].id,
       'and lands on the divider slide that column generates',
       `${colHref[1]} vs ${pages[firstOf['beats-section']].id}`);
  }
  ok(/<span[^>]*>nothing at all<\/span>/.test(dom),
     'a fragment that resolves to neither is demoted to a <span>');
  ok(/<span[^>]*>an inherited name<\/span>/.test(dom) && !/function Object/.test(dom),
     'a fragment named after an inherited property is dead too, not Object\'s constructor');
  ok(/<span[^>]*>a stray percent<\/span>/.test(dom) && /#50%zz/.test(err),
     'and one that is not valid percent-encoding is reported as written, not thrown on',
     err.split('\n').filter(l => /50%/.test(l)).join(''));
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
  const dests = [...pdf.matchAll(/\/Dest\s+\/(psiINT-pdf-p\d+)/g)].map(m => m[1]);
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
  // The ceiling is a dial, so it is checked as one: a higher one really does
  // let a page grow past the default, and a nonsense value is refused.
  const hiDom = path.join(dir, 'hi.html');
  const rh = run(dir, ['--pdf-zoom-max=2.2', `--pdf-out=${path.join(dir, 'hi.pdf')}`,
    `--pdf-dump-dom=${hiDom}`]);
  ok(rh.status === 0, '--pdf-zoom-max=<n> exits 0', (rh.stderr || '').slice(-300));
  if (rh.status === 0) {
    const t = fs.readFileSync(hiDom, 'utf8');
    const hz = [...t.slice(t.lastIndexOf('</head>')).matchAll(/--zoom: ([0-9.]+);/g)].map(m => Number(m[1]));
    ok(Math.max(...hz) > 1.35, 'and raising it really does let a page grow past the default',
       String(Math.max(...hz)));
    ok(Math.max(...hz) <= 2.2, 'but never past the one it was given', String(Math.max(...hz)));
  }
  const rm = run(dir, ['--pdf-zoom-max=9']);
  ok(rm.status !== 0 && /not a number between/.test(rm.stderr),
     'a --pdf-zoom-max outside 0.6-2.2 is refused', rm.stderr.split('\n')[0]);

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

  // ── the document ──────────────────────────────────────────────────
  console.log('\nthe document: --print-pdf and --print-notes-pdf');
  // All three in one command, which is also the one-browser check: the
  // Chromium line is printed with the first report and never again.
  const rd = build(dir, ['--slides-pdf', '--print-pdf', '--print-notes-pdf']);
  ok(rd.status === 0, '--slides-pdf --print-pdf --print-notes-pdf exits 0',
     (rd.stdout || '').slice(-400) + (rd.stderr || '').slice(-400));
  const rdOut = rd.stdout || '';
  const rdErr = rd.stderr || '';
  const chromiumLines = rdOut.split('\n').filter(l => l.startsWith('[pdf] Chromium'));
  ok(chromiumLines.length === 1, 'three PDFs, one browser: the [pdf] Chromium line appears once',
     String(chromiumLines.length));
  ok(/Wrote \S*slides\.pdf \(/.test(rdOut) && /Wrote \S*print\.pdf \(\d+ page\(s\) from print\.html, 210×297 mm\)/.test(rdOut)
     && /Wrote \S*print-notes\.pdf \(\d+ page\(s\) from print-notes\.html, 210×297 mm\)/.test(rdOut),
     'each file is reported, the documents with their page count and paper',
     rdOut.split('\n').filter(l => l.startsWith('Wrote')).join(' | '));
  const printPdf = path.join(dir, 'print.pdf');
  const notesPdf = path.join(dir, 'print-notes.pdf');
  const docs = {};
  for (const [name, p] of [['print.pdf', printPdf], ['print-notes.pdf', notesPdf]]) {
    const there = fs.existsSync(p);
    ok(there, `${name} is written beside source.md`);
    if (!there) continue;
    const bytes = fs.readFileSync(p, 'latin1');
    docs[name] = bytes;
    ok(bytes.startsWith('%PDF-'), `${name} is a PDF`);
    // Chromium's A4 is 594.96 x 841.92 pt, a point short of ISO's 595 x 842
    // on either side of the rounding.
    const mbd = mediaBox(bytes);
    ok(near(mbd[2], 595, 1.5) && near(mbd[3], 842, 1.5), `${name} is A4, from the view's own @page`,
       JSON.stringify(mbd));
    ok(pageTree(bytes) > 1, `${name} runs to more than one page`, String(pageTree(bytes)));
    // Every page is A4, not just the first: a page the view sized for itself
    // would stand out here.
    const boxes = [...bytes.matchAll(/\/MediaBox\s*\[\s*[-\d.]+\s+[-\d.]+\s+([-\d.]+)\s+([-\d.]+)/g)];
    ok(boxes.length >= pageTree(bytes) && boxes.every(b => near(Number(b[1]), 595, 1.5) && near(Number(b[2]), 842, 1.5)),
       `and so is every page of ${name}`);
  }
  if (have('pdfinfo')) {
    const info = spawnSync('pdfinfo', [printPdf], { encoding: 'utf8' }).stdout || '';
    ok(/Page size:.*\(A4\)/.test(info), 'pdfinfo calls print.pdf A4', (/Page size:.*/.exec(info) || [''])[0]);
  } else {
    note('pdfinfo is not on PATH – skipping its word for the paper.');
  }
  if (docs['print.pdf']) {
    // The fragment half of the link promise, read out of the file as the slide
    // test reads it: a named destination per internal link, and none for the
    // fragment that goes nowhere - the export demotes that one to text.
    const dd = [...docs['print.pdf'].matchAll(/\/Dest\s+\/([\w-]+)/g)].map(m => m[1]);
    ok(dd.includes('beatless'), 'a link to a chunk is a named destination in print.pdf', dd.join(', '));
    ok(dd.includes('beats'), 'and so is a link to a column', dd.join(', '));
    ok(!dd.includes('gibtsnicht'), 'the dead fragment is no destination at all');
    ok(!/\/URI \(#/.test(docs['print.pdf']), 'no fragment was written out as an external address');
    ok(/\/S\s*\/URI\s*\n?\/URI \(https:\/\/uba-psi\.github\.io\/psi-slides\/\)/.test(docs['print.pdf']),
       'the external link is a clickable URI annotation');
  }
  ok(rdErr.split('\n').some(l => /print\.pdf: links links to #gibtsnicht/.test(l)),
     'the document names the dead fragment and its chunk',
     rdErr.split('\n').filter(l => /print\.pdf:.*gibtsnicht/.test(l)).join(''));
  ok(rdErr.split('\n').some(l => /print\.pdf: missing has an image that did not load: \.\/fehlt\.png/.test(l)),
     'and the missing image and its chunk');
  const docBlocked = rdErr.split('\n').filter(l => /print\.pdf: blocked \d+ request/.test(l));
  ok(docBlocked.length === 1 && /example\.invalid/.test(docBlocked[0]) && !/hosted embed/.test(docBlocked[0]),
     'and the refused origin, without the slide export\'s advice about cards', JSON.stringify(docBlocked));
  ok(!rdErr.split('\n').some(l => /print(-notes)?\.pdf: .*does not fit the page/.test(l)),
     'and no overflow, which a paginated document does not have');
  if (have('pdftotext')) {
    const textOf = (p) => spawnSync('pdftotext', [p, '-'], { encoding: 'utf8' }).stdout.replace(/\s+/g, ' ');
    const noteLine = /This narration belongs to print-notes\.html, never to slides\.pdf/;
    ok(noteLine.test(textOf(notesPdf)), 'the speaker note is in print-notes.pdf');
    ok(!noteLine.test(textOf(printPdf)), 'and not in print.pdf');
    ok(/One paragraph, no segments, no steps, no frames/.test(textOf(printPdf)),
       'print.pdf is text, not a raster');
  } else {
    note('pdftotext is not on PATH – skipping the note check.');
  }

  console.log('\nthe document: ignores --*-only, and --pdf-out names its one file');
  fs.rmSync(path.join(dir, 'print.html'), { force: true });
  const named = path.join(dir, 'handout.pdf');
  const ro = build(dir, ['--audience-only', '--print-pdf', `--pdf-out=${named}`]);
  ok(ro.status === 0, '--audience-only --print-pdf --pdf-out=<path> exits 0', (ro.stderr || '').slice(-300));
  ok(fs.existsSync(path.join(dir, 'print.html')),
     'print.html is rebuilt even under --audience-only – an export of a stale view is worse than none');
  ok(fs.existsSync(named) && fs.readFileSync(named, 'latin1').startsWith('%PDF-'),
     '--pdf-out names the one document asked for');

  console.log('\nthe document: what would do nothing is refused by name');
  const refused = (flags, re, what) => {
    const rr = build(dir, flags);
    ok(rr.status !== 0 && re.test(rr.stderr || ''), what, (rr.stderr || '').split('\n')[0]);
    ok(!/\bat .*\(.*:\d+:\d+\)/.test(rr.stderr || ''), `  … without a stack trace (${flags.join(' ')})`);
    ok(!/\[pdf\] Chromium/.test(rr.stdout || ''), `  … before a browser starts (${flags.join(' ')})`);
  };
  refused(['--print-pdf', '--watch'],
    /^Error: --print-pdf and --watch are mutually exclusive\./,
    '--print-pdf with --watch');
  refused(['--slides-pdf', '--print-notes-pdf', '--watch'],
    /^Error: --slides-pdf, --print-notes-pdf and --watch are mutually exclusive\./,
    'any PDF flags with --watch, named together');
  refused(['--print-pdf', '--pdf-zoom=1.2'],
    /^Error: --pdf-zoom without --slides-pdf\.\n.*--print-pdf prints a document/,
    'a slide option beside a document export');
  refused(['--pdf-beats=final', '--pdf-collapse=none'],
    /^Error: --pdf-beats and --pdf-collapse without --slides-pdf\./,
    'slide options with no export at all');
  refused(['--print-pdf', '--print-notes-pdf', `--pdf-out=${named}`],
    /^Error: --pdf-out names one file, and --print-pdf and --print-notes-pdf write 2\./,
    '--pdf-out with two PDFs to write');
  refused([`--pdf-out=${named}`],
    /^Error: --pdf-out without a PDF to write\./,
    '--pdf-out with none');

  // ── ::: pulse ─────────────────────────────────────────────────────
  console.log('\n::: pulse: the answers on paper, the widget\'s chrome not, and no request');
  const pdir = path.join(dir, 'pulse');
  fs.mkdirSync(pdir);
  fs.writeFileSync(path.join(pdir, 'source.md'), PULSE_SOURCE);
  const pdom = path.join(pdir, 'dump.html');
  const rp = build(pdir, ['--slides-pdf', '--print-pdf', '--print-notes-pdf', `--pdf-dump-dom=${pdom}`]);
  ok(rp.status === 0, 'the pulse deck exports all three PDFs',
     (rp.stdout || '').slice(-400) + (rp.stderr || '').slice(-400));
  const rpOut = rp.stdout || '';
  const rpErr = rp.stderr || '';
  ok(!/blocked \d+ request/.test(rpErr) && !/pulse\.psi\.uni-bamberg\.de/.test(rpOut + rpErr),
     'the widget asks nothing of its server, or of anyone, during the export',
     rpErr.split('\n').filter(l => /blocked/.test(l)).join(' | '));
  ok(!/Pulse widget did not set up/.test(rpErr) && !/page reported an error/.test(rpErr),
     'every question was set up by the widget, and the page reported no error', rpErr.slice(-300));
  ok((rpOut.match(/^\[pdf\] 2 self-test question\(s\) printed with their answers\.$/mg) || []).length === 2,
     'each document reports its two questions, the slides none',
     rpOut.split('\n').filter(l => /self-test/.test(l)).join(' | '));
  const pBody = fs.existsSync(pdom) ? fs.readFileSync(pdom, 'utf8') : '';
  ok(pBody && !/<pulse-question|<pulse-summary|__pulseEmbedV2/.test(pBody),
     'no pulse-question, no summary and no widget reach the slides\' print DOM');
  if (have('pdftotext')) {
    const textOf = (p) => spawnSync('pdftotext', [p, '-'], { encoding: 'utf8' }).stdout.replace(/\s+/g, ' ');
    for (const name of ['print.pdf', 'print-notes.pdf']) {
      const t = textOf(path.join(pdir, name));
      ok(/What does a block cipher take besides the plaintext block\?/.test(t)
         && /Where must the security of a cipher rest\?/.test(t),
         `${name} carries both questions`);
      ok(/A key, which selects one permutation from the family\./.test(t)
         && /In the secrecy of the key, never of the algorithm\./.test(t),
         `${name} carries both answers – a closed <details> would have printed neither`);
      ok(!/\bAnswer\b|Show answer|I knew it|Did you know it|Questions on this page|None answered yet|for self-testing/.test(t),
         `${name} carries no button, no fold label and no summary`,
         (/.{30}(?:\bAnswer\b|Show answer|I knew it|Questions on this page|None answered yet).{30}/.exec(t) || [''])[0]);
    }
    const st = textOf(path.join(pdir, 'slides.pdf'));
    ok(/Security must rest in the key alone/.test(st) && !/Where must the security|never of the algorithm/.test(st),
       'slides.pdf has the slide and neither the question nor the answer');
  } else {
    note('pdftotext is not on PATH – skipping the pulse text checks.');
  }

  // ── what no route sees ────────────────────────────────────────────
  // A deck script can reach the network two ways page.route and
  // page.routeWebSocket do not see: WebRTC, which sent a STUN binding over
  // UDP, and a WebSocket opened in a Worker. Both are aimed at listeners on
  // loopback here, so the test needs no network to see one get through, and
  // the build runs asynchronously so the listeners can hear it.
  console.log('\nwhat no route sees: WebRTC and a worker\'s socket stay in the page');
  const ldir = path.join(dir, 'leak');
  fs.mkdirSync(ldir);
  const heard = [];
  const udp = dgram.createSocket('udp4');
  const tcp = net.createServer((s) => { heard.push('tcp'); s.destroy(); });
  udp.on('message', () => heard.push('udp'));
  await new Promise((res) => udp.bind(0, '127.0.0.1', res));
  await new Promise((res) => tcp.listen(0, '127.0.0.1', res));
  const udpPort = udp.address().port;
  const tcpPort = tcp.address().port;
  fs.writeFileSync(path.join(ldir, 'source.md'), `---
title: The leak fixture
---

## free: A slide whose script tries the network {#leak}

Nothing on this slide should reach a listener.

<script>
(function () {
  try {
    var pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:127.0.0.1:${udpPort}' }] });
    pc.createDataChannel('x');
    pc.createOffer().then(function (o) { return pc.setLocalDescription(o); });
  } catch (e) {}
  try {
    new Worker(URL.createObjectURL(new Blob(
      ["try { new WebSocket('ws://127.0.0.1:${tcpPort}/'); } catch (e) {}"],
      { type: 'text/javascript' })));
  } catch (e) {}
})();
</script>
`);
  const lr = await new Promise((res) => {
    const c = spawn(process.execPath,
      [path.join(ROOT, 'build.js'), path.join(ldir, 'source.md'), '--slides-pdf', '--print-pdf'],
      { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    c.stdout.on('data', (d) => { out += d; });
    c.stderr.on('data', (d) => { out += d; });
    c.on('close', (status) => res({ status, out }));
  });
  // A STUN retry or a late worker would land after exit, so listen a beat
  // longer than the build ran.
  await new Promise((res) => setTimeout(res, 1500));
  udp.close();
  tcp.close();
  ok(lr.status === 0, 'the leak deck exports', lr.out.slice(-400));
  ok(!heard.includes('udp'), 'no STUN packet from an RTCPeerConnection reaches its server', heard.join(','));
  ok(!heard.includes('tcp'), 'no WebSocket opened in a Worker reaches its server', heard.join(','));
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
