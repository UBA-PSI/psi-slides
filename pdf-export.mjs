/**
 * --slides-pdf: a portable slide deck, one page per presentation state.
 *
 * The second documented exception to the single-file build, and the reason is
 * different from diagram-core.mjs's. That one exists because the browser
 * editor has to run the same compiler as Node. This one exists because it
 * imports playwright-core, and build.js must keep building HTML on an install
 * that has no browser binding at all - so build.js reaches it through one
 * `await import()` behind the flag, and nothing here is loaded until an
 * author asks for a PDF.
 *
 * **The order of the beats is not reimplemented here.** It has exactly one
 * definition, in AUDIENCE_JS, and this module calls it through `window.psiExport`
 * - ten lines of mechanism that ship in the two live views. That is what makes
 * the export unable to be wrong about the order; it can only be wrong about
 * the rendering, and that is a class of fault you look at rather than hunt for.
 *
 * What lives here is the policy: which states become pages, what leaves the
 * clone, what the print DOM is, and every diagnostic. None of it ships in
 * audience.html.
 *
 * Three things about the shape of the run, in the order they bite:
 *
 *  - **Auto-fit is forced on, whatever the frontmatter says.** In the hall a
 *    chunk taller than the frame is *panned* - focusCamera pins its head and
 *    follows its foot down as it is revealed. A sheet of paper cannot pan.
 *    Auto-fit is the mechanism that already forces a chunk into the frame, so
 *    turning it on is the honest translation of panning onto paper rather than
 *    a second layout mode.
 *  - **HTTP(S) is routed to /dev/null before the first goto, not after.**
 *    jumpTo -> applyState -> updateEmbedLoading sets iframe.src for the active
 *    chunk, and wireEmbeds only intercepts YouTube under file://. A Vimeo embed
 *    therefore really loads, and one on the opening slide loads during
 *    page.goto() itself. Replacing the frames after cloning is too late.
 *  - **The print DOM is built by inclusion, never by exclusion.** Only cloned
 *    chunks go in, and document.body's children are then replaced wholesale.
 *    Help, search, TOC, the mode badge, the laser dot and the figure overlay
 *    are siblings of #stage and vanish without anyone naming them - which
 *    matters, because all eleven `position: fixed` rules in AUDIENCE_CSS sit on
 *    id-selected chrome, and a fixed element in a paginated document repeats on
 *    *every* page. A strike list could miss one. Inclusion cannot.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { findChrome } from './chrome-path.mjs';

// ── the export stylesheet ───────────────────────────────────────────
//
// Scoped to [data-psi-pdf] on <html>, which is set at the same moment the body
// is swapped, so nothing here can affect a live view.
const PDF_CSS = `
/* Without these two declarations the whole deck prints as ONE page. Measured,
   Chromium 1228, four page-sized divs: height:100%/overflow:hidden gives
   /Count 1, height:auto/overflow:visible gives /Count 4. AUDIENCE_CSS sets
   them on html,body because that is right for a window and fatal for a
   paginated document. */
html[data-psi-pdf], html[data-psi-pdf] body {
  height: auto !important;
  overflow: visible !important;
}
/* The runtime writes --slide-w/--slide-h inline on <html> from a resize
   handler. An author stylesheet with !important beats an inline style without
   one, which is the whole trick: no listener has to be unregistered, and a
   late resize cannot move the geometry out from under the page. */
:root[data-psi-pdf] {
  --slide-w: %W%px !important;
  --slide-h: %H%px !important;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
[data-psi-pdf] .pdf-page {
  width: var(--slide-w);
  height: var(--slide-h);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--paper);
  break-after: page;
  break-inside: avoid;
}
/* The difference between the right page count and one blank page at the end. */
[data-psi-pdf] .pdf-page:last-child { break-after: auto; }
/* display: contents, so the flex centring above applies to the chunk itself
   rather than to a box wrapped around it. The wrapper exists to name the
   thing, not to lay it out. */
[data-psi-pdf] .pdf-slide { display: contents; }
[data-psi-pdf] .chunk { opacity: 1 !important; }
[data-psi-pdf] *, [data-psi-pdf] *::before, [data-psi-pdf] *::after {
  transition: none !important;
  animation: none !important;
}
/* Left where a <video> was. Quiet on purpose: it is a still of something that
   moved, not an error. */
[data-psi-pdf] .pdf-video-still {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 0.4em; aspect-ratio: 16 / 9; width: 100%;
  border: 1px solid var(--rule, currentColor);
  color: var(--ink-soft, currentColor);
  font-family: var(--sans); font-size: 0.72rem; text-align: center; padding: 1em;
}
[data-psi-pdf] .pdf-video-still .pdf-play { font-size: 2.2rem; line-height: 1; opacity: 0.55; }
/* And where an <iframe> was. Not the wireEmbeds card - its text says "serve
   the lecture over http", which is advice a PDF cannot take. */
[data-psi-pdf] .pdf-embed-card {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 0.3em; aspect-ratio: 16 / 9; width: 100%;
  border: 1px solid var(--rule, currentColor);
  color: var(--ink-soft, currentColor);
  font-family: var(--sans); font-size: 0.78rem; text-align: center; padding: 1em;
}
[data-psi-pdf] .pdf-embed-card .pdf-embed-provider {
  font-variant-caps: all-small-caps; letter-spacing: 0.08em; opacity: 0.75;
}
`;

// ── in-page: everything that is not a beat ──────────────────────────
//
// Runs once, before the state walk, and deliberately mutates the live DOM
// rather than each clone: a video still and an embed card are the same on
// every beat, and doing it up front means the heights auto-fit measures are
// the heights that get printed.
function pagePrepare() {
  const out = { stills: 0, placeholders: 0, embeds: 0 };

  const stillFrom = async (video) => {
    // Frame 0 is deterministic - the objection to grabbing a frame was about
    // the *running* one. Under file:// the origin is opaque, so drawImage
    // taints the canvas and toDataURL throws SecurityError; for a data: URI
    // clip it works. The fallback is the planned normal case, not a fault, so
    // this budgets three seconds and gives up without ceremony.
    try {
      if (video.readyState < 2) {
        video.preload = 'auto';
        try { video.currentTime = 0; } catch (e) { /* not seekable yet */ }
        video.load();
        await Promise.race([
          new Promise(r => video.addEventListener('loadeddata', r, { once: true })),
          new Promise(r => setTimeout(r, 3000)),
        ]);
      }
      if (video.readyState < 2 || !video.videoWidth) return null;
      const c = document.createElement('canvas');
      c.width = video.videoWidth;
      c.height = video.videoHeight;
      c.getContext('2d').drawImage(video, 0, 0);
      return c.toDataURL('image/png');
    } catch (e) {
      return null;
    }
  };

  const nameOf = (video) => {
    const fig = video.closest('figure');
    const cap = fig && fig.querySelector('figcaption');
    if (cap && cap.textContent.trim()) return cap.textContent.trim();
    const src = video.getAttribute('src') || '';
    if (/^data:/.test(src)) return 'video';
    return src.split('/').pop().split('?')[0] || 'video';
  };

  const videos = async () => {
    for (const v of [...document.querySelectorAll('video')]) {
      const uri = await stillFrom(v);
      if (uri) {
        const img = document.createElement('img');
        img.src = uri;
        img.alt = nameOf(v);
        img.style.width = '100%';
        v.replaceWith(img);
        out.stills += 1;
      } else {
        const box = document.createElement('div');
        box.className = 'pdf-video-still';
        const play = document.createElement('div');
        play.className = 'pdf-play';
        play.textContent = '▶';
        const label = document.createElement('div');
        label.textContent = nameOf(v);
        box.append(play, label);
        v.replaceWith(box);
        out.placeholders += 1;
      }
    }
  };

  // The iframe goes before any state is set, so updateEmbedLoading has nothing
  // to give a src to. Belt to the route's braces, and the reason the card can
  // carry the right words: the address under it is already emitted by the
  // build, so the card only has to name the provider.
  const embeds = () => {
    for (const fig of document.querySelectorAll('.figure-embed')) {
      const frame = fig.querySelector('.embed-frame, .embed-blocked');
      if (!frame) continue;
      const card = document.createElement('div');
      card.className = 'pdf-embed-card';
      const who = document.createElement('div');
      who.className = 'pdf-embed-provider';
      who.textContent = fig.dataset.embedProvider || 'video';
      const what = document.createElement('div');
      what.textContent = 'Hosted video – the address below opens it.';
      card.append(who, what);
      frame.replaceWith(card);
      out.embeds += 1;
    }
  };

  return videos().then(embeds).then(() => out);
}

// ── in-page: the state walk ─────────────────────────────────────────
function pageCollect(cfg) {
  const P = window.psiExport;
  const chunks = P.chunks();
  const viewport = document.getElementById('stage-viewport');

  // Unconditional, and before anything else: an autoplaying figure that ticks
  // during the walk would advance a chunk behind the exporter's back.
  P.setAutoFit(true);
  // Before the walk, not after: the fit measures a collapsed chunk as a much
  // shorter one, so setting this afterwards would size every page against text
  // it does not show.
  if (cfg.collapse) P.setCollapse(cfg.collapse);
  P.quiesce();

  const twoFrames = () => new Promise(r =>
    requestAnimationFrame(() => requestAnimationFrame(r)));

  const imagesDecoded = (el) => Promise.all(
    [...el.querySelectorAll('img')].map(img => Promise.race([
      img.decode().catch(() => {}),
      new Promise(r => setTimeout(r, 3000)),
    ])));

  const frag = document.createDocumentFragment();
  const pages = [];
  const overflow = [];
  const firstPageOf = {};        // chunk id -> wrapper id of its first page
  let n = 0;

  // Only what sits *inside* a chunk. Everything outside one is gone by
  // construction, because the print DOM is built by inclusion.
  const DROP = [
    '.exps', '.exp-chev', '.exp-body', '.chunk-expansion',
    '.annot-box', '.annot-add',
    '.link-code',
    'script',                    // including the application/json step payload
    '[data-fig-edit]',
  ].join(', ');

  const capture = (el, id, beat, zoomShown) => {
    const clone = el.cloneNode(true);
    clone.querySelectorAll(DROP).forEach(node => node.remove());
    const wrap = document.createElement('div');
    wrap.className = 'pdf-page';
    wrap.id = 'pdf-p' + (++n);
    wrap.style.setProperty('--zoom', zoomShown);
    const slide = document.createElement('div');
    slide.className = 'pdf-slide';
    slide.appendChild(clone);
    wrap.appendChild(slide);
    frag.appendChild(wrap);
    if (firstPageOf[id] === undefined) firstPageOf[id] = wrap.id;
    pages.push({ chunkId: id, beat, wrapperId: wrap.id, zoom: P.zoom() });
  };

  const run = async () => {
    for (let i = 0; i < chunks.length; i++) {
      const { el, id } = chunks[i];
      const total = P.countSegments(el);
      // countSegments returns 0 for a chunk with no beats at all, and 1 means
      // "in the chunk, nothing advanced yet" - the convention jumpTo and
      // advanceReveal were already written against.
      const positions = total === 0
        ? [0]
        : (cfg.beats === 'final'
          ? [total]
          : Array.from({ length: total }, (_, k) => k + 1));

      for (const pos of positions) {
        // Four steps, because applyReveal on its own is not a state. jumpTo
        // is not convenience: it sets .active (without which the clone is
        // dimmed by the audience stylesheet), closes any expansion, drops a
        // figure-focus overlay and resets the pan.
        P.jumpTo(i);
        P.setRevealed(id, pos);
        P.applyReveal(el, id, true);
        if (cfg.zoom === null) {
          // A reveal changes the chunk's height and therefore, under auto-fit,
          // the zoom it needs. Skip this and beat 3 comes out at a different
          // type size than it has in the hall.
          P.settle();
        } else {
          // A fixed zoom, written straight onto <html> after jumpTo rather
          // than through the hook. jumpTo has already run applyState, which is
          // the last thing that writes --zoom, so this wins; and keeping it
          // here keeps the policy in the exporter, which is the whole split.
          document.documentElement.style.setProperty('--zoom', cfg.zoom);
        }
        // The ceiling, applied after the fit rather than through it.
        // fitZoomToChunk takes a cap, but it also returns early when the chunk
        // already fits and state.zoom is at or above that cap - so passing a
        // lower one leaves whatever the previous slide happened to end on, and
        // the ceiling silently does nothing. (That early return is also why a
        // chunk's fitted zoom depends on the order the deck was walked in.)
        // Clamping afterwards needs no re-solve and cannot be wrong: the fit
        // has just shown the chunk fits at a larger size, so it fits at a
        // smaller one.
        if (cfg.zoom === null && P.zoom() > cfg.ceiling) {
          document.documentElement.style.setProperty('--zoom', cfg.ceiling);
        }
        P.quiesce();
        await twoFrames();
        await imagesDecoded(el);

        // Reported against the page box rather than against auto-fit's 94%
        // breathing room: what the PDF actually clips is the page, and a
        // warning that fires on air the reader never loses is one authors
        // learn to ignore. Under `fit` this can only happen at the 0.6 floor;
        // at a fixed zoom it is the ordinary case, which is the trade the
        // author made when they named a number.
        const shown = cfg.zoom !== null ? cfg.zoom : Math.min(P.zoom(), cfg.ceiling);
        const box = el.getBoundingClientRect();
        if (box.height > cfg.h + 1) {
          overflow.push({
            chunkId: id,
            beat: pos,
            content: Math.round(box.height),
            available: cfg.h,
            zoom: shown,
          });
        }
        capture(el, id, pos, shown);
      }
    }
  };

  return run().then(() => {
    // Read while the live DOM still exists: after the swap there are no
    // columns to ask, and naturalWidth is only meaningful on an <img> that
    // has been given the chance to load - which every chunk has now had.
    const missingImages = [];
    for (const { el, id } of chunks) {
      for (const img of el.querySelectorAll('img')) {
        if (img.naturalWidth === 0) {
          missingImages.push({ chunkId: id, src: img.getAttribute('src') || '' });
        }
      }
    }
    // Column ids live on <section class="column">, and the divider slide a
    // column generates is a chunk called `${col.id}-section` - so a link to a
    // column has to be resolved through a second table. chunkIdxFromHash in
    // the runtime knows only flatChunks and cannot do this today, which is
    // why the export builds its own from the same data rather than borrowing.
    const columns = [];
    document.querySelectorAll('.column').forEach(col => {
      if (!col.id) return;
      const first = col.querySelector('.chunk');
      columns.push({
        id: col.id,
        sectionChunk: col.id + '-section',
        firstChunk: first ? first.dataset.chunkId : null,
      });
    });
    window.__psiPdfFrag = frag;
    return { pages, overflow, missingImages, firstPageOf, columns, viewportH: viewport ? viewport.clientHeight : 0 };
  });
}

// ── in-page: the swap ───────────────────────────────────────────────
function pageInstall(cfg) {
  // The body's own attributes stay: data-collapse, data-mode and data-view
  // hang there and half the appearance hangs off them. Only its children go.
  const body = document.body;
  while (body.firstChild) body.removeChild(body.firstChild);
  body.appendChild(window.__psiPdfFrag);
  delete window.__psiPdfFrag;

  const style = document.createElement('style');
  style.id = 'psi-pdf-css';
  style.textContent = cfg.css;
  document.head.appendChild(style);
  document.documentElement.setAttribute('data-psi-pdf', '');

  // A link that goes nowhere in a PDF is worse than no link, so an
  // unresolvable fragment is reported and demoted rather than left to point
  // at whatever the viewer decides.
  const dead = [];
  for (const a of [...document.querySelectorAll('a[href^="#"]')]) {
    const frag = decodeURIComponent(a.getAttribute('href').slice(1));
    const target = cfg.links[frag];
    const page = a.closest('.pdf-page');
    const chunk = a.closest('.chunk');
    if (target) { a.setAttribute('href', '#' + target); continue; }
    dead.push({
      fragment: frag,
      chunkId: chunk ? chunk.dataset.chunkId : (page ? page.id : '?'),
    });
    const span = document.createElement('span');
    span.className = a.className;
    span.innerHTML = a.innerHTML;
    a.replaceWith(span);
  }
  return { dead, pages: document.querySelectorAll('.pdf-page').length };
}

// ── the run ─────────────────────────────────────────────────────────
function userError(msg) {
  const err = new Error(msg);
  err.userFacing = true;
  return err;
}

export async function exportSlidesPdf(opts) {
  const { audienceHtml, beats, size, w, h, zoom, collapse, ceiling, out, dumpDom } = opts;

  let chromium;
  try {
    ({ chromium } = await import('playwright-core'));
  } catch (e) {
    throw userError(
      '--slides-pdf needs playwright-core, and it is not installed.\n'
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

  const tmp = out + '.tmp';
  const blocked = new Map();      // origin -> count
  const pageErrors = [];
  let browser = null;

  try {
    browser = await chromium.launch({ executablePath, headless: true });
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => pageErrors.push(String(e && e.message || e)));

    // Offline is a promise, so it is enforced rather than requested - and
    // before the goto, because an embed on the opening slide loads during it.
    // Routing is the right layer: one line, it acts ahead of every runtime
    // state, and it makes the promise checkable instead of leaving it to the
    // runtime's cooperation. A runtime export mode would promise the same and
    // hold only for the cases somebody thought of.
    await page.route(/^https?:/i, (route) => {
      let origin = route.request().url();
      try { origin = new URL(origin).origin; } catch (e) { /* keep the raw url */ }
      blocked.set(origin, (blocked.get(origin) || 0) + 1);
      return route.abort();
    });

    await page.goto(pathToFileURL(audienceHtml).href, { waitUntil: 'load' });
    await page.waitForFunction(
      () => !!window.psiExport && document.fonts.status === 'loaded',
      null, { timeout: 30000 });

    const prep = await page.evaluate(pagePrepare);
    const got = await page.evaluate(pageCollect, { beats, h, zoom, collapse, ceiling });

    // Chunk id -> first page, then column id -> the same mapping for the
    // divider slide it generates, falling back to its first chunk when the
    // column has no heading and therefore no divider.
    const links = { ...got.firstPageOf };
    for (const col of got.columns) {
      const via = got.firstPageOf[col.sectionChunk]
        ?? (col.firstChunk ? got.firstPageOf[col.firstChunk] : undefined);
      if (via) links[col.id] = via;
    }

    const css = PDF_CSS.replace(/%W%/g, String(w)).replace(/%H%/g, String(h));
    const installed = await page.evaluate(pageInstall, { css, links });

    if (dumpDom) {
      const html = await page.evaluate(() => document.documentElement.outerHTML);
      fs.writeFileSync(path.resolve(dumpDom), html);
    }

    // The live views carry @media print rules meant for a document, not for
    // slides; 'screen' is what the pages were laid out against.
    await page.emulateMedia({ media: 'screen' });
    const buf = await page.pdf({
      width: `${w}px`,
      height: `${h}px`,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      printBackground: true,
      preferCSSPageSize: false,
    });

    // Atomic: a killed run leaves neither a half-written slides.pdf nor a
    // stale one that looks finished.
    fs.writeFileSync(tmp, buf);
    fs.renameSync(tmp, out);

    report({
      out, size, w, h, beats, zoom, collapse, ceiling,
      pages: installed.pages,
      chunks: new Set(got.pages.map(p => p.chunkId)).size,
      version: browser.version(),
      executablePath,
      prep,
      overflow: got.overflow,
      missingImages: got.missingImages,
      dead: installed.dead,
      blocked,
      pageErrors,
    });
    return { out, pages: installed.pages };
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (fs.existsSync(tmp)) { try { fs.unlinkSync(tmp); } catch (e) {} }
  }
}

// ── what the run says afterwards ────────────────────────────────────
//
// Four error classes each get a line with a next step in it, rather than
// staying silent, and each names the context it can actually have.
function report(r) {
  const rel = path.relative(process.cwd(), r.out) || r.out;

  for (const o of r.overflow) {
    console.error(
      `${rel}: ${o.chunkId} beat ${o.beat} does not fit the page at zoom ${o.zoom.toFixed(2)} `
      + `(${o.content}px of content, ${o.available}px available). `
      + (r.zoom === null
        ? 'Shorten it or split it.'
        : 'Shorten it, split it, or drop --pdf-zoom and let each page size itself.'));
  }
  // One line rather than one per page when a fixed zoom is overrunning
  // wholesale: that is a decision to revisit, not a list to work through.
  if (r.zoom !== null && r.overflow.length > r.pages * 0.2) {
    console.error(
      `${rel}: ${r.overflow.length} of ${r.pages} pages run off the page at --pdf-zoom=${r.zoom}. `
      + 'That is what a fixed zoom costs on a deck whose slides differ in length; '
      + '--pdf-zoom=fit sizes each one instead.');
  }
  for (const m of r.missingImages) {
    console.error(`${rel}: ${m.chunkId} has an image that did not load: ${m.src}`
      + ' – check the path, or build with inlined images (the default).');
  }
  for (const d of r.dead) {
    console.error(`${rel}: ${d.chunkId} links to #${d.fragment}, which is no chunk and no column`
      + ' – the link is now plain text. Fix the fragment or drop the link.');
  }
  for (const [origin, n] of r.blocked) {
    console.error(`${rel}: blocked ${n} request(s) to ${origin}`
      + ' – the export is offline by design. A hosted embed prints as a card;'
      + ' a remote image prints empty, so inline it.');
  }
  for (const e of r.pageErrors) {
    console.error(`${rel}: the page reported an error during the export: ${e}`);
  }

  const still = r.prep.stills + r.prep.placeholders;
  if (still) {
    console.log(`[pdf] ${still} video(s) replaced by a still `
      + `(${r.prep.stills} frame 0, ${r.prep.placeholders} placeholder).`);
  }
  if (r.prep.embeds) console.log(`[pdf] ${r.prep.embeds} hosted embed(s) replaced by a card.`);
  // The browser is half the reproducibility promise the plan makes, and it
  // costs one line: the same machine with the same build produces the same
  // PDF, two machines may differ in hyphenation and fallback glyphs.
  console.log(`[pdf] Chromium ${r.version} – ${r.executablePath}`);
  console.log(`Wrote ${rel} (${r.pages} page(s) from ${r.chunks} chunk(s), `
    + `${r.size} at ${r.w}×${r.h}, beats=${r.beats}, `
    + `zoom=${r.zoom === null ? `fit≤${r.ceiling}` : r.zoom}`
    + `${r.collapse ? `, collapse=${r.collapse}` : ''})`);
}
