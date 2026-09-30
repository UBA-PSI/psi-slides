// Parity: the app's three PDFs against the command line's, of the same
// source bytes and with the same options. Neither driver's own test can see
// the two drift apart – each is checked against itself – so this is the
// assertion that holds them together: for slides.pdf, print.pdf and
// print-notes.pdf, the same page count and the same `pdftotext` on every
// page, and for the slides also the same chunk and beat on every page, read
// out of the print DOM each driver dumps (the command line's hidden
// --pdf-dump-dom, the app's PSI_PDF_DUMP_DOM in a development run).
//
// No pixel comparison: the two Chromiums differ in glyph antialiasing and
// nothing else (Stage 0 spike), and a pixel threshold would either miss a
// layout change or fail on hinting.
//
// It runs at the end of the smoke test, on the working copy the smoke's
// exports were written into, so it costs one command-line export and no
// second Electron launch. It also runs on its own against a working folder
// the smoke kept:
//
//   PSI_SMOKE_KEEP=1 npm run smoke          # prints the kept folder
//   npm run parity -- <that folder>         (from desktop/)
//
// The command-line half needs the engine's playwright-core, a Chromium and
// poppler's pdftotext. When one is missing it says so and passes, the way
// the repository's other browser checks degrade – except under CI, where a
// check that quietly did not run is a check that was never there.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');

// The one option the window offers, at the default the smoke leaves it on
// (Slide text, which the IPC sends as collapse 'topic-bold'), in the command
// line's spelling. Everything else is resolvePdfOptions's default on both
// sides: every beat, 16:9, fit, the 1.35 ceiling.
const CLI_SLIDE_FLAGS = ['--pdf-collapse=topic-bold'];

// Where the smoke's working folder keeps what the app wrote.
export const LECTURE = 'smoke-lecture';
export const APP_DUMP = 'app-slides-dom.html';
const FILES = ['slides.pdf', 'print.pdf', 'print-notes.pdf'];

const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

// What the command-line half needs, or the sentence saying what is missing.
async function prerequisites() {
  try {
    createRequire(path.join(repo, 'package.json')).resolve('playwright-core');
  } catch {
    return 'the engine has no playwright-core (npm install at the repository root)';
  }
  try {
    const { findChrome } = await import(pathToFileURL(path.join(repo, 'chrome-path.mjs')).href);
    findChrome();
  } catch (e) {
    return `no Chromium for the command line (${String(e.message).split('\n')[0]})`;
  }
  if (spawnSync('pdftotext', ['-v']).error) return 'pdftotext is not on PATH (poppler)';
  return null;
}

// Page by page, as pdftotext separates them: a form feed after each page.
function pagesText(pdf) {
  const r = spawnSync('pdftotext', ['-layout', pdf, '-'], { encoding: 'utf8', maxBuffer: 64 << 20 });
  if (r.status !== 0) throw new Error(`pdftotext failed on ${pdf}: ${r.stderr}`);
  const pages = r.stdout.split('\f');
  if (pages.length && pages[pages.length - 1] === '') pages.pop();
  return pages;
}

// The chunk-and-beat table of a slide export: one row per .pdf-page wrapper
// in document order – the chunk it shows, its beat (the page's place in its
// chunk's run of pages, which pdf-core walks from beat 1 up), the zoom the
// page was laid out at, and how many elements the reveal held back on it,
// which is what makes two beats of one chunk different pages. Read from the
// body only: the head's inlined stylesheets mention .pdf-page in comments.
export function beatTable(html) {
  const body = html.slice(html.lastIndexOf('</head>'));
  const rows = [];
  for (const m of body.matchAll(
    /<div class="pdf-page" id="psiINT-pdf-p\d+" style="--zoom: ([0-9.]+);">([\s\S]*?)(?=<div class="pdf-page"|<\/body>)/g)) {
    const chunk = (/data-chunk-id="([^"]+)"/.exec(m[2]) || [, null])[1];
    const prev = rows[rows.length - 1];
    rows.push({
      chunk,
      beat: prev && prev.chunk === chunk ? prev.beat + 1 : 1,
      zoom: m[1],
      held: (m[2].match(/\sdata-(?:hidden|beat-hidden)(?:=|\s|>)/g) || []).length,
    });
  }
  return rows;
}

const row = (r) => r ? `${r.chunk} beat ${r.beat}, zoom ${r.zoom}, ${r.held} held back` : '(no page)';

// The first line two texts of one page differ in, for the failure message.
function firstDifference(a, b) {
  const al = a.split('\n'), bl = b.split('\n');
  for (let i = 0; i < Math.max(al.length, bl.length); i++) {
    if (al[i] !== bl[i]) return `line ${i + 1}: app ${JSON.stringify(al[i] ?? null)} / cli ${JSON.stringify(bl[i] ?? null)}`;
  }
  return '';
}

// work: the smoke's working folder, holding LECTURE/ with the app's three
// PDFs beside its source.md, and APP_DUMP. check(what, ok) and log(...) are
// the caller's. Writes only into work/parity-cli/, and removes it.
export async function parity({ work, check, log }) {
  const appDir = path.join(work, LECTURE);
  const missing = await prerequisites();
  if (missing) {
    if (process.env.CI) { check(`parity: the command-line half can run – ${missing}`, false); return; }
    log(`parity: skipped – ${missing}`);
    return;
  }
  const absent = [...FILES.map(f => path.join(appDir, f)), path.join(work, APP_DUMP)]
    .filter(f => !fs.existsSync(f));
  if (absent.length) {
    check(`parity: the app's exports are there (missing ${absent.map(f => path.basename(f)).join(', ')})`, false);
    return;
  }

  // A second copy of the lecture under the same folder name, so the command
  // line writes its views and its PDFs there and not over the app's. The
  // source is compared by hash, because "the same source" is the premise.
  const cliRoot = path.join(work, 'parity-cli');
  const cliDir = path.join(cliRoot, LECTURE);
  fs.rmSync(cliRoot, { recursive: true, force: true });
  fs.mkdirSync(cliDir, { recursive: true });
  try {
    fs.copyFileSync(path.join(appDir, 'source.md'), path.join(cliDir, 'source.md'));
    if (fs.existsSync(path.join(appDir, 'assets'))) {
      fs.cpSync(path.join(appDir, 'assets'), path.join(cliDir, 'assets'), { recursive: true });
    }
    check('parity: the command line exports the same source.md',
      sha(path.join(appDir, 'source.md')) === sha(path.join(cliDir, 'source.md')));

    const cliDump = path.join(cliRoot, 'cli-slides-dom.html');
    const t0 = Date.now();
    const r = spawnSync(process.execPath, [path.join(repo, 'build.js'), path.join(cliDir, 'source.md'),
      '--slides-pdf', '--print-pdf', '--print-notes-pdf', ...CLI_SLIDE_FLAGS, `--pdf-dump-dom=${cliDump}`],
    { cwd: repo, encoding: 'utf8', timeout: 600000, maxBuffer: 64 << 20 });
    check('parity: the command line exported all three', r.status === 0);
    if (r.status !== 0) {
      console.error((r.stdout || '').slice(-1500) + (r.stderr || '').slice(-1500));
      return;
    }
    log(`parity: the command line took ${((Date.now() - t0) / 1000).toFixed(0)} s`);

    const { pdfFacts } = await import(pathToFileURL(path.join(repo, 'pdf-core.mjs')).href);
    for (const f of FILES) {
      const a = path.join(appDir, f), c = path.join(cliDir, f);
      const pa = pdfFacts(fs.readFileSync(a)).pages, pc = pdfFacts(fs.readFileSync(c)).pages;
      check(`parity: ${f} has the same page count (app ${pa}, cli ${pc})`, pa !== null && pa === pc);
      const ta = pagesText(a), tc = pagesText(c);
      const differ = [];
      for (let i = 0; i < Math.max(ta.length, tc.length); i++) {
        if (ta[i] !== tc[i]) differ.push(i + 1);
      }
      check(`parity: ${f} has the same text on each of its ${ta.length} pages`
        + (differ.length ? ` – ${differ.length} differ, first page ${differ[0]}: `
          + firstDifference(ta[differ[0] - 1] ?? '', tc[differ[0] - 1] ?? '') : ''),
      differ.length === 0 && ta.length === tc.length);
    }

    const ba = beatTable(fs.readFileSync(path.join(work, APP_DUMP), 'utf8'));
    const bc = beatTable(fs.readFileSync(cliDump, 'utf8'));
    const slidesPages = pdfFacts(fs.readFileSync(path.join(appDir, 'slides.pdf'))).pages;
    check(`parity: the app's beat table has a row per page of its slides.pdf (${ba.length})`,
      ba.length > 0 && ba.length === slidesPages);
    let at = -1;
    for (let i = 0; i < Math.max(ba.length, bc.length); i++) {
      if (row(ba[i]) !== row(bc[i])) { at = i; break; }
    }
    check(`parity: every slide page shows the same chunk at the same beat (${new Set(ba.map(x => x.chunk)).size} chunks)`
      + (at >= 0 ? ` – page ${at + 1}: app ${row(ba[at])} / cli ${row(bc[at])}` : ''), at < 0);
  } finally {
    fs.rmSync(cliRoot, { recursive: true, force: true });
  }
}

// On its own, against a working folder the smoke kept.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const work = process.argv[2];
  if (!work || !fs.existsSync(path.join(work, LECTURE))) {
    console.error('usage: npm run parity -- <the folder PSI_SMOKE_KEEP=1 npm run smoke kept>');
    process.exit(2);
  }
  let failures = 0;
  await parity({
    work: path.resolve(work),
    check: (what, ok) => { console.log(`${ok ? '  ✔' : '  ✘'} ${what}`); if (!ok) failures++; },
    log: (...a) => console.log('  ·', ...a),
  });
  console.log(failures === 0 ? '\nparity: ok' : `\nparity: ${failures} failure(s)`);
  process.exit(failures === 0 ? 0 : 1);
}
