// The PDF exports: the slide deck from audience.html, the document from
// print.html and print-notes.html, printed by Electron's own Chromium.
//
// What a page shows, which states become pages, every diagnostic and the
// order in which a browser is asked for anything are pdf-core.mjs's, the
// same module the command line drives through Playwright. It is loaded from
// the engine directory, so the app and `build.js --slides-pdf` run one text.
// This file is the other half: a driver written in Electron calls, the save
// dialog, the file written safely, and the result as data for the window.
//
// The pure half comes first and is exported for desktop/test/pdf.test.mjs:
// which file a kind writes, what the window may ask for, whether a build has
// to run first, and what the result says. Like builder.js, nothing here
// requires electron at load time – the driver and the controller require it
// when they run – so the test loads this file under a bare `node --test`.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');

// ── the pure half ───────────────────────────────────────────────────

// The three exports, named the way the command line names them: the view
// each one prints and the file it writes beside source.md (build.js's
// PDF_EXPORTS).
const PDF_KINDS = {
  slides: { view: 'audience.html', file: 'slides.pdf' },
  print: { view: 'print.html', file: 'print.pdf' },
  'print-notes': { view: 'print-notes.html', file: 'print-notes.pdf' },
};

function isPdfKind(kind) {
  return typeof kind === 'string' && Object.prototype.hasOwnProperty.call(PDF_KINDS, kind);
}

function defaultPdfPath(dir, kind) {
  return path.join(dir, PDF_KINDS[kind].file);
}

// A name typed into the save dialog without an extension still gets one: a
// file called `slides` that is a PDF is a file nobody can open by double
// click.
function withPdfExtension(file) {
  return path.extname(file) ? file : `${file}.pdf`;
}

// What the window may ask for: a kind, and for the slides the collapse –
// slide text or full prose, the two answers that are different documents.
// Null or absent means the lecture's own setting, which is the command
// line's default. Everything else takes the command line's defaults
// (resolvePdfOptions: fit, every beat, 16:9). No path, ever: the file is
// chosen in the main process's own dialog.
const COLLAPSE_CHOICES = ['topic-bold', 'none'];

function pdfRequest(kind, opts) {
  if (!isPdfKind(kind)) return { ok: false, error: 'pdf.badRequest' };
  if (kind !== 'slides') return { ok: true, kind, options: {} };
  const collapse = opts && opts.collapse !== undefined ? opts.collapse : null;
  if (collapse !== null && !COLLAPSE_CHOICES.includes(collapse)) {
    return { ok: false, error: 'pdf.badRequest' };
  }
  return { ok: true, kind, options: { collapse } };
}

// Whether the export can print what is on disk now, and if not, what it
// waits for. The build on disk is the one exported; when it is not the one
// in the editor, the export builds first rather than hand on a deck the
// author has already changed, and says nothing.
//
//   refuse   nothing to export from
//   rebuild  auto-build is off and source.md changed since the last build:
//            send `rebuild`, export on the next build-success
//   wait     a build is running already: export on its build-success
//   now      the views on disk are the current ones – or, after a failed
//            save, the last that worked, which is the app's promise
function exportPlan(state) {
  if (!state || state.phase === 'closed' || !state.dir) {
    return { action: 'refuse', error: 'pdf.noProject' };
  }
  if (state.auto === false && state.changedSinceBuild) return { action: 'rebuild' };
  if (state.phase === 'starting' || state.phase === 'building') return { action: 'wait' };
  return { action: 'now' };
}

// While the export waits for a build: which event ends the wait, and how.
function waitOutcome(event) {
  if (!event || typeof event.type !== 'string') return null;
  if (event.type === 'build-success') return 'export';
  if (event.type === 'build-error' || event.type === 'watch-error'
    || event.type === 'process-exit') return 'fail';
  return null;
}

// The result the window renders, as plain data: it crosses IPC as it is.
// The sentence is facts rather than words – the file's name and its page
// count – because the words are the window's, in two languages. The
// diagnostics are formatReport's `warn` lines with the chunk each names;
// the whole report goes along too, for the build details.
function exportResult({ kind, file, r, lines, stale = false, rebuilt = false, durationMs = 0 }) {
  return {
    ok: true,
    kind,
    file,
    name: path.basename(file),
    pages: r.pages === undefined ? null : r.pages,
    // Slides: the export's own page in CSS px. Documents: the view's paper
    // in points, as the file says it, or null when it could not be read.
    pageSize: kind === 'slides'
      ? { w: r.w, h: r.h, unit: 'px' }
      : (r.pageSize ? { w: r.pageSize.w, h: r.pageSize.h, unit: 'pt' } : null),
    stale: !!stale,
    rebuilt: !!rebuilt,
    durationMs,
    diagnostics: lines.filter(l => l.level === 'warn')
      .map(l => ({ text: l.text, chunk: l.chunk || null })),
    report: lines.map(l => ({ level: l.level, text: l.text })),
  };
}

// The print DOM of a slide export, for desktop/test/parity.mjs only: the
// app's counterpart of the command line's hidden --pdf-dump-dom, so the
// parity check can hold the app's page-by-page chunk and beat table against
// the command line's. It is an environment variable rather than a channel,
// because nothing in the window may ask for a path, and it is read only by
// a development run – a packaged app never looks at it, so the variable in
// someone's shell cannot make the shipped app write a file nobody chose.
// Null means no dump, which is every export a person ever makes.
function dumpDomPath(env, packaged) {
  if (packaged) return null;
  const p = env && env.PSI_PDF_DUMP_DOM;
  return typeof p === 'string' && path.isAbsolute(p) ? p : null;
}

// ── writing a file ──────────────────────────────────────────────────
//
// As pdf-export.mjs writes it: a fresh temporary name beside the target,
// opened exclusively, so a link planted under it is refused rather than
// written through, then a rename that replaces a link at the target instead
// of following it. `live()` is asked before the rename, so an export aborted
// while the bytes were going to disk leaves neither the temporary file nor a
// PDF behind.
async function writeAtomic(out, bytes, live = () => true) {
  const tmp = `${out}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  try {
    await fs.promises.writeFile(tmp, bytes, { flag: 'wx' });
    if (!live()) return false;
    await fs.promises.rename(tmp, out);
    return true;
  } finally {
    try { await fs.promises.unlink(tmp); } catch { /* renamed, or never made */ }
  }
}

// ── the Electron driver ─────────────────────────────────────────────
//
// The contract is in pdf-core.mjs's header. Each page is a hidden window on
// a partition of its own with no `persist:` prefix, so it starts with empty
// storage – the audience runtime restores position, zoom and theme from
// localStorage on boot – and nothing it stores outlives it.
//
// What the stage 0 spike measured, and this follows (Electron 44,
// Chromium 152):
//  - paintWhenInitiallyHidden stays at its default. Without it a hidden
//    window gets no animation frames and the walk, which waits two per
//    state, never finishes.
//  - Page.printToPDF does not exist over webContents.debugger in a window
//    that is not headless, so printing is webContents.printToPDF, after the
//    media is set over CDP.
//  - Runtime.enable sent before the first navigation hangs, so the window
//    loads about:blank first and the debugger attaches to that. The metrics
//    override set then survives the navigation to the view.
//  - The network is refused at the session, which sees WebSockets as well;
//    the Fetch domain does not.
let partitions = 0;

const BLOCKED_URLS = ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'];

function electronDriver() {
  const { BrowserWindow, session } = require('electron');
  const windows = new Set();

  const originOf = (url) => {
    try { return new URL(url).origin; } catch { return url; }
  };

  return {
    version: process.versions.chrome,
    where: `Electron ${process.versions.electron}`,

    async open({ w, h, onBlocked, onPageError }) {
      partitions += 1;
      const partition = `pdf-${partitions}`;
      const ses = session.fromPartition(partition, { cache: false });
      ses.webRequest.onBeforeRequest({ urls: BLOCKED_URLS }, (details, cb) => {
        onBlocked(originOf(details.url));
        cb({ cancel: true });
      });
      // A page from a source.md somebody else wrote asks for nothing.
      ses.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));

      const win = new BrowserWindow({
        show: false,
        width: w,
        height: h,
        webPreferences: {
          partition,
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          backgroundThrottling: false,
          spellcheck: false,
        },
      });
      windows.add(win);
      const wc = win.webContents;
      // The rule the app's own window keeps: nothing opens a second window
      // and nothing leaves the page it was loaded with.
      wc.setWindowOpenHandler(() => ({ action: 'deny' }));
      wc.on('will-navigate', (event) => event.preventDefault());

      const destroy = () => {
        windows.delete(win);
        if (!win.isDestroyed()) win.destroy();
      };

      try {
        await win.loadURL('about:blank');
        const dbg = wc.debugger;
        dbg.attach('1.3');
        dbg.on('message', (_e, method, params) => {
          if (method !== 'Runtime.exceptionThrown') return;
          const d = params.exceptionDetails || {};
          onPageError((d.exception && d.exception.description) || d.text || 'error');
        });
        const send = (method, params = {}) => dbg.sendCommand(method, params);
        await send('Runtime.enable');
        // The page size in CSS px at device scale 1, not the window's: a
        // Retina display doubles a window, and a laptop screen may clamp one.
        await send('Emulation.setDeviceMetricsOverride', {
          width: w, height: h, deviceScaleFactor: 1, mobile: false,
        });

        const run = (source) => wc.executeJavaScript(source, true);
        return {
          load: (url) => win.loadURL(url),
          async waitFor(fn, timeoutMs) {
            const end = Date.now() + timeoutMs;
            const source = `!!(${fn.toString()})()`;
            for (;;) {
              if (await run(source)) return;
              if (Date.now() > end) throw new Error(`the page was not ready after ${timeoutMs / 1000} s`);
              await new Promise(r => setTimeout(r, 50));
            }
          },
          evaluate: (fn, arg) =>
            run(`(${fn.toString()})(${arg === undefined ? '' : JSON.stringify(arg)})`),
          async pdf(how) {
            if (how.media !== 'screen' && how.media !== 'print') {
              throw new Error(`pdf: no print path for media ${how.media}`);
            }
            await send('Emulation.setEmulatedMedia', { media: how.media });
            const common = {
              printBackground: true,
              displayHeaderFooter: false,
              margins: { top: 0, bottom: 0, left: 0, right: 0 },
              generateTaggedPDF: false,
              generateDocumentOutline: false,
            };
            if (how.media === 'print') {
              // The document: the view's @page rule is the paper, its
              // margins and its margin boxes.
              return wc.printToPDF({ ...common, preferCSSPageSize: true });
            }
            return wc.printToPDF({
              ...common,
              preferCSSPageSize: false,
              pageSize: { width: how.w / 96, height: how.h / 96 },
            });
          },
          close: async () => destroy(),
        };
      } catch (e) {
        destroy();
        throw e;
      }
    },

    async close() {
      for (const win of [...windows]) if (!win.isDestroyed()) win.destroy();
      windows.clear();
    },
  };
}

// ── the controller ──────────────────────────────────────────────────
//
// One export at a time. A second request while one runs is refused with a
// result rather than queued: the window shows the export as busy, and a
// queue nobody can see is a second export nobody asked for twice.
//
// abort() is for closing the lecture, opening another one and closing the
// window. It ends the wait for a build, destroys the export's windows, and
// makes the running export resolve at once with `pdf.aborted`; a temporary
// file is removed by writeAtomic, and no PDF is written.

let corePromise = null;
function loadCore(engineDir) {
  if (!corePromise) {
    corePromise = import(pathToFileURL(path.join(engineDir, 'pdf-core.mjs')).href)
      .catch((e) => { corePromise = null; throw e; });
  }
  return corePromise;
}

function createPdfExporter({ builder, getWindow, engineDir, onReport, dialogTitle }) {
  let current = null;

  function abort() {
    if (!current) return;
    current.aborted = true;
    current.cancel();
  }

  // Resolves 'export' or 'fail' on the next event that ends a build; the
  // listener is registered before `rebuild` is sent, so its success cannot
  // be missed.
  function nextBuild(job) {
    return new Promise((resolve) => {
      const off = builder.onEvent((event) => {
        const outcome = waitOutcome(event);
        if (outcome) { off(); resolve(outcome); }
      });
      job.cancels.push(() => { off(); resolve('aborted'); });
    });
  }

  async function run(job, kind, options) {
    const { dialog } = require('electron');
    const t0 = Date.now();
    const st0 = builder.getState();
    const source = st0.source;

    const win = getWindow();
    const opts = {
      title: dialogTitle ? dialogTitle() : 'Export as PDF',
      defaultPath: defaultPdfPath(st0.dir, kind),
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
      properties: ['createDirectory', 'showOverwriteConfirmation'],
    };
    const res = win && !win.isDestroyed()
      ? await dialog.showSaveDialog(win, opts)
      : await dialog.showSaveDialog(opts);
    if (job.aborted) return { ok: false, error: 'pdf.aborted' };
    if (res.canceled || !res.filePath) return { ok: false, canceled: true };
    const file = withPdfExtension(res.filePath);

    // Decided after the dialog, not before: a save made while it was open
    // counts.
    const plan = exportPlan(builder.getState());
    if (plan.action === 'refuse') return { ok: false, error: plan.error };
    let rebuilt = false;
    if (plan.action === 'rebuild' || plan.action === 'wait') {
      const waiting = nextBuild(job);
      if (plan.action === 'rebuild') {
        rebuilt = true;
        if (!builder.rebuild()) { abortWait(job); return { ok: false, error: 'pdf.buildFailed' }; }
      }
      const outcome = await waiting;
      if (job.aborted || outcome === 'aborted') return { ok: false, error: 'pdf.aborted' };
      if (outcome === 'fail') {
        const e = builder.getState().lastError;
        return { ok: false, error: 'pdf.buildFailed', reason: e ? e.message : '' };
      }
    }

    const st = builder.getState();
    if (st.source !== source) return { ok: false, error: 'pdf.aborted' };
    const view = path.join(st.dir, PDF_KINDS[kind].view);
    if (!fs.existsSync(view)) return { ok: false, error: 'pdf.notBuilt' };
    const stale = st.phase === 'build-error';

    const core = await loadCore(engineDir());
    if (job.aborted) return { ok: false, error: 'pdf.aborted' };
    const driver = electronDriver();
    job.cancels.push(() => { driver.close().catch(() => {}); });
    const dumpDom = kind === 'slides'
      ? dumpDomPath(process.env, require('electron').app.isPackaged)
      : null;
    let r;
    try {
      const url = pathToFileURL(view).href;
      const work = kind === 'slides'
        ? core.exportSlides(driver, { ...core.resolvePdfOptions(options), url, dumpDom: !!dumpDom })
        : core.exportDocument(driver, { url });
      // The export's own promises may never settle once its window is
      // destroyed, so an abort wins the race rather than waiting for them.
      r = await Promise.race([work, job.aborted$]);
    } finally {
      await driver.close().catch(() => {});
    }
    if (job.aborted || !r) return { ok: false, error: 'pdf.aborted' };
    if (dumpDom && r.dom) await fs.promises.writeFile(dumpDom, r.dom);

    const written = await writeAtomic(file, r.pdf, () => !job.aborted);
    if (!written) return { ok: false, error: 'pdf.aborted' };

    const lines = core.formatReport(r, { outLabel: path.basename(file) });
    const result = exportResult({ kind, file, r, lines, stale, rebuilt, durationMs: Date.now() - t0 });
    return result;
  }

  function abortWait(job) {
    for (const c of job.cancels.splice(0)) c();
  }

  async function exportPdf(kind, opts) {
    const req = pdfRequest(kind, opts);
    if (!req.ok) return { ok: false, error: req.error };
    if (current) return { ok: false, error: 'pdf.busy' };
    const pre = exportPlan(builder.getState());
    if (pre.action === 'refuse') return { ok: false, error: pre.error };

    let resolveAbort;
    const job = {
      aborted: false,
      cancels: [],
      aborted$: new Promise((r) => { resolveAbort = r; }),
    };
    job.cancel = () => { resolveAbort(null); abortWait(job); };
    current = job;
    try {
      const result = await run(job, req.kind, req.options);
      if (result.ok && onReport) onReport(result);
      return result;
    } catch (e) {
      if (job.aborted) return { ok: false, error: 'pdf.aborted' };
      return { ok: false, error: 'pdf.failed', reason: String(e && e.message ? e.message : e) };
    } finally {
      abortWait(job);
      if (current === job) current = null;
    }
  }

  return { exportPdf, abort, busy: () => !!current };
}

module.exports = {
  PDF_KINDS,
  COLLAPSE_CHOICES,
  isPdfKind,
  defaultPdfPath,
  withPdfExtension,
  pdfRequest,
  exportPlan,
  waitOutcome,
  exportResult,
  dumpDomPath,
  writeAtomic,
  electronDriver,
  createPdfExporter,
};
