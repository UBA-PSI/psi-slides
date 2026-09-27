/**
 * --slides-pdf, --print-pdf and --print-notes-pdf on the command line: the
 * Playwright driver for pdf-core.mjs.
 *
 * The second documented exception to the single-file build, and the reason is
 * different from diagram-core.mjs's. That one exists because the browser
 * editor has to run the same compiler as Node. This one exists because it
 * imports playwright-core, and build.js must keep building HTML on an install
 * that has no browser binding at all - so build.js reaches it through one
 * `await import()` behind the flag, and nothing here is loaded until an
 * author asks for a PDF.
 *
 * **What the export decides is not here.** Which states become pages, what
 * leaves the clone, what the print DOM is, every diagnostic and the order in
 * which the browser is asked for anything live in pdf-core.mjs, which has no
 * imports and is what the desktop app drives through Electron's own Chromium.
 * This file is the other half: a browser (findChrome, then chromium.launch),
 * the driver contract written in Playwright calls, the file written safely,
 * and the report printed where it has always been printed.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { findChrome } from './chrome-path.mjs';
import { exportSlides, exportDocument, formatReport } from './pdf-core.mjs';

function userError(msg) {
  const err = new Error(msg);
  err.userFacing = true;
  return err;
}

// ── the driver ──────────────────────────────────────────────────────
//
// The contract is in pdf-core.mjs's header. One browser, one fresh context
// per page, so each export starts with empty storage - the audience runtime
// restores position, zoom and theme from localStorage on boot.
async function playwrightDriver(chromium, executablePath) {
  const browser = await chromium.launch({ executablePath, headless: true });
  return {
    version: browser.version(),
    where: executablePath,
    async open({ w, h, onBlocked, onPageError }) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h } });
      const page = await ctx.newPage();
      page.on('pageerror', (e) => onPageError(String(e && e.message || e)));

      const originOf = (url) => {
        try { return new URL(url).origin; } catch (e) { return url; }
      };
      // Offline is a promise, so it is enforced rather than requested - and
      // before the page loads, because an embed on the opening slide loads
      // during the load. Routing is the right layer: one line, it acts ahead
      // of every runtime state, and it makes the promise checkable instead of
      // leaving it to the runtime's cooperation. A runtime export mode would
      // promise the same and hold only for the cases somebody thought of.
      await page.route(/^https?:/i, (route) => {
        onBlocked(originOf(route.request().url()));
        return route.abort();
      });
      // And the sockets, which page.route does not see. A one-shot build
      // carries none; a watch build carries the reload client, and a page
      // that kept it would reload in the middle of the walk the moment the
      // author saved. The desktop app exports watch builds, and the two
      // drivers keep one network rule. Not connecting to the server and
      // closing the route is the refusal.
      await page.routeWebSocket(/^wss?:/i, (ws) => {
        onBlocked(originOf(ws.url()));
        ws.close();
      });

      return {
        load: (url) => page.goto(url, { waitUntil: 'load' }),
        waitFor: (fn, timeoutMs) => page.waitForFunction(fn, null, { timeout: timeoutMs }),
        evaluate: (fn, arg) => page.evaluate(fn, arg),
        async pdf(how) {
          if (how.media === 'print') {
            // The document: the view's @page rule is the paper - A4, its
            // margins and the page number in the @bottom-center margin box.
            // No width, height or margin from here, or they would compete
            // with it; preferCSSPageSize makes the rule win the size, and
            // Chromium takes the margins from it too.
            await page.emulateMedia({ media: 'print' });
            return page.pdf({
              printBackground: true,
              preferCSSPageSize: true,
              displayHeaderFooter: false,
            });
          }
          if (how.media !== 'screen') {
            throw new Error(`pdf-export: no print path for media ${how.media}`);
          }
          await page.emulateMedia({ media: 'screen' });
          return page.pdf({
            width: `${how.w}px`,
            height: `${how.h}px`,
            margin: { top: 0, right: 0, bottom: 0, left: 0 },
            printBackground: true,
            preferCSSPageSize: false,
          });
        },
        close: () => ctx.close(),
      };
    },
    close: () => browser.close(),
  };
}

// ── writing a file ──────────────────────────────────────────────────
//
// Atomic: a killed run leaves neither a half-written slides.pdf nor a stale
// one that looks finished. The temporary name is fresh and opened exclusively
// ('wx'), so a link planted under it is refused rather than written through,
// and the rename then replaces a link at the target instead of following it -
// the rule writeOutputFile keeps for every view the build writes.
function writeAtomic(out, bytes) {
  const tmp = `${out}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(tmp, bytes, { flag: 'wx' });
    fs.renameSync(tmp, out);
  } finally {
    if (fs.existsSync(tmp)) { try { fs.unlinkSync(tmp); } catch (e) {} }
  }
}

// ── the run ─────────────────────────────────────────────────────────
//
// One browser for every PDF the command asked for: slides first, then the
// documents, each on a page of its own. The Chromium line is printed once,
// with the first report.
//
// jobs: { slides: null | {out, dumpDom, ...resolvePdfOptions}, documents:
// [{flag, html, out}] }, audienceHtml beside slides. build.js has refused
// every combination that would do nothing before this is reached.
const joinFlags = (names) => names.length < 2
  ? names.join('')
  : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

export async function exportPdfs(jobs) {
  const { slides, documents = [] } = jobs;
  const asked = [...(slides ? ['--slides-pdf'] : []), ...documents.map(d => d.flag)];

  let chromium;
  try {
    ({ chromium } = await import('playwright-core'));
  } catch (e) {
    throw userError(
      `${joinFlags(asked)} ${asked.length > 1 ? 'need' : 'needs'} playwright-core, and it is not installed.\n`
      + '  It is an optional dependency, so `npm install` may have skipped it:\n'
      + '    npm install playwright-core\n'
      + '  The export drives a headless Chromium; every other build target\n'
      + '  works without it.');
  }

  // Resolved before the browser starts, so a host with no Chromium says so in
  // a second and names the paths it tried. There is no deck yet at this point
  // and therefore no chunk to name - which is what the message must not
  // pretend otherwise.
  const executablePath = findChrome();

  let driver = null;
  let first = true;
  const say = (r, out) => {
    const outLabel = path.relative(process.cwd(), out) || out;
    for (const line of formatReport(r, { outLabel, withBrowser: first })) {
      (line.level === 'warn' ? console.error : console.log)(line.text);
    }
    first = false;
  };
  try {
    driver = await playwrightDriver(chromium, executablePath);
    const written = [];
    if (slides) {
      const { audienceHtml, out, dumpDom } = slides;
      const r = await exportSlides(driver, {
        ...slides,
        url: pathToFileURL(audienceHtml).href,
        dumpDom: !!dumpDom,
      });
      if (dumpDom) fs.writeFileSync(path.resolve(dumpDom), r.dom);
      writeAtomic(out, r.pdf);
      say(r, out);
      written.push({ out, pages: r.pages });
    }
    for (const d of documents) {
      const r = await exportDocument(driver, { url: pathToFileURL(d.html).href });
      writeAtomic(d.out, r.pdf);
      say(r, d.out);
      written.push({ out: d.out, pages: r.pages });
    }
    return written;
  } finally {
    if (driver) await driver.close().catch(() => {});
  }
}
