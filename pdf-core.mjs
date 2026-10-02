/*
 * pdf-core.mjs – everything about the PDF export that is not a browser.
 *
 * Zero imports and zero Node APIs, like souffleuse.mjs, cue-cards.mjs,
 * tails.mjs and diagram-core.mjs, and for the reason souffleuse.mjs gives: it
 * loads anywhere, so the command line (pdf-export.mjs, through Playwright)
 * and the desktop app (through Electron's own Chromium) run the one policy,
 * and the parts that need no browser are decided in a gate in milliseconds
 * (test/gates/pdf-core.mjs). build.js imports it statically for the option
 * checks, so the CLI and the app refuse the same values in the same words.
 * It is never spliced into a page: the in-page functions below reach the page
 * through the driver's evaluate, one at a time, as text.
 *
 * **The order of the beats is not reimplemented here.** It has exactly one
 * definition, in AUDIENCE_JS, and this module calls it through
 * `window.psiExport` - eleven members of mechanism that ship in the two live
 * views. That is what makes the export unable to be wrong about the order;
 * it can only be wrong about the rendering, and that is a class of fault you
 * look at rather than hunt for.
 *
 * What lives here is the policy: which states become pages, what leaves the
 * clone, what the print DOM is, every diagnostic, and the order in which a
 * browser is asked for anything. Three things about that order, in the order
 * they bite:
 *
 *  - **Auto-fit is forced on, whatever the frontmatter says.** In the hall a
 *    chunk taller than the frame is *panned* - focusCamera pins its head and
 *    follows its foot down as it is revealed. A sheet of paper cannot pan.
 *    Auto-fit is the mechanism that already forces a chunk into the frame, so
 *    turning it on is the honest translation of panning onto paper rather than
 *    a second layout mode.
 *  - **The network is refused before the page loads, not after.**
 *    jumpTo -> applyState -> updateEmbedLoading sets iframe.src for the active
 *    chunk, and wireEmbeds only intercepts YouTube under file://. A Vimeo embed
 *    therefore really loads, and one on the opening slide loads during the
 *    load itself. Replacing the frames after cloning is too late.
 *  - **The print DOM is built by inclusion, never by exclusion.** Only cloned
 *    chunks go in, and document.body's children are then replaced wholesale.
 *    Help, search, TOC, the mode badge, the laser dot and the figure overlay
 *    are siblings of #psiINT-stage and vanish without anyone naming them - which
 *    matters, because all eleven `position: fixed` rules in AUDIENCE_CSS sit on
 *    id-selected chrome, and a fixed element in a paginated document repeats on
 *    *every* page. A strike list could miss one. Inclusion cannot.
 *
 * ── the driver ──────────────────────────────────────────────────────
 *
 * Everything an export needs from a browser, and nothing it decides. Two
 * levels, because one browser serves any number of exports in a run and each
 * export gets a page of its own:
 *
 *   driver.version                    the Chromium version, for the report
 *   driver.where                      what to print beside it (a path, "Electron")
 *   driver.open({w, h, onBlocked, onPageError}) -> page
 *       a page of w x h CSS px at device scale 1 and fresh storage, with every
 *       http(s) and ws(s) request refused - onBlocked(origin) once per
 *       request - and uncaught page errors reported - onPageError(message) -
 *       before open() resolves, so before anything can load
 *   driver.close()                    ends the browser; the caller's to call
 *
 *   page.load(url)                    resolves on the load event
 *   page.waitFor(fn, timeoutMs)       polls fn in the page until it is truthy
 *   page.evaluate(fn, arg)            fn is self-contained and arg is plain
 *                                     JSON; fn may return a promise
 *   page.pdf(how) -> bytes            backgrounds always, no browser header
 *                                     or footer. {media: 'screen', w, h}: the
 *                                     export's own page size, no margins.
 *                                     {media: 'print', css: true}: the view's
 *                                     own @page rule decides size, margins
 *                                     and margin boxes (preferCSSPageSize)
 *   page.close()
 *
 * The plan sketched one flat object whose open() made the page. The split is
 * what "one browser, several exports" needs without a driver having to keep a
 * current page: exportSlides opens its page and closes it, and never the
 * browser.
 *
 * exportSlides calls these in a fixed order, and **the order is the
 * contract**: open (the network is refused) before load; pageSetup (auto-fit
 * and the collapse) before pageCollect (the walk); pageInstall (the print
 * DOM) before pdf. Because the order lives here and not in a driver, a driver
 * cannot get it wrong, and test/gates/pdf-core.mjs holds it with a driver
 * that only records its calls. exportDocument is the short form of the same
 * order: open, load, self-test answers checked, pictures decoded, diagnostics
 * read, pdf on print media.
 */

// ── sizes and the ceiling ───────────────────────────────────────────
//
// The number pair is the contract, not the ratio. The base type is
// clamp(20px, --slide-h * 0.026, 38px), so a 720px-high page hits the lower
// clamp and prints type that is *larger* relative to the slide than any
// projection above 769px; at 900px it sits in the linear range and the slide
// has the proportions of a lecture hall. And one number serves viewport and
// paper at once: page.pdf() lays out at paper width x 96dpi, so identical
// numbers remove every scale calculation and the rounding that produces
// blank trailing pages.
export const PDF_SIZES = {
  '16:9':  { w: 1600, h: 900 },
  '16:10': { w: 1600, h: 1000 },
};

// How large the type is allowed to get, and it is a ceiling rather than a
// choice: the export shrinks a chunk to make it fit and never enlarges it past
// what an ordinary slide gets.
//
// The live view's auto-fit ceiling is 2.2, which is right there - a lecturer
// who presses `#` on a slide holding four words wants those four words to fill
// the room. Printed, that same rule makes the type jump by a factor of 3.7
// between neighbouring pages. Measured over the five lectures: 75% of
// python-intro's states and 63% of decoration's sit above 1.6, while
// network-security's median is 0.95. 1.35 is the runtime's own default zoom,
// so the rule states itself - a page is at most as large as a slide nobody
// fitted, and smaller when it has to be.
export const PDF_FIT_CEILING = 1.35;

// ── the option checks ───────────────────────────────────────────────
//
// Raw values in, as the command line spells them (null for a flag not given),
// the resolved options out - or a userFacing error whose words name the flag,
// which is what build.js's pdfOptionsFrom has always said. It keeps parsing
// argv and refusing --watch; everything about a value is decided here.
function optionError(msg) {
  const err = new Error(msg);
  err.userFacing = true;
  return err;
}

export function checkPdfBeats(v) {
  const beats = v ?? 'all';
  if (beats !== 'all' && beats !== 'final') {
    throw optionError(`Error: --pdf-beats=${beats} is not a mode. Use all (default) or final.`);
  }
  return beats;
}

export function checkPdfSize(v) {
  const size = v ?? '16:9';
  if (!Object.prototype.hasOwnProperty.call(PDF_SIZES, size)) {
    throw optionError(
      `Error: --pdf-size=${size} is not a size. Use ${Object.keys(PDF_SIZES).join(' or ')}.`);
  }
  return size;
}

// `fit` shrinks what does not fit and stops at the ceiling above; a number
// is that number on every page, and whatever overruns is reported and
// printed cut. Not the other way round, and the measurement says why: at a
// fixed 1.35, 85% of network-security's states and 67% of the diagram
// lecture's run off the page. A fixed zoom is an honest choice for a deck
// whose slides are alike, and a bad default for one whose slides are not.
// The ceiling is a dial and not a truth, because the two things an author
// wants of it pull against each other: a low one keeps the type even across
// the deck, a high one fills each page. Measured on network-security under
// --pdf-collapse=topic-bold, the median page fill runs 85% at 1.35, 90% at
// 1.6 and 92% at 2.2, and the zoom range widens with it. 1.35 is the default
// because evenness is the thing a reader notices across a whole document.
export function checkPdfZoomMax(v) {
  if (v === null || v === undefined) return PDF_FIT_CEILING;
  const ceiling = Number(v);
  if (!Number.isFinite(ceiling) || ceiling < 0.6 || ceiling > 2.2) {
    throw optionError(
      `Error: --pdf-zoom-max=${v} is not a number between 0.6 and 2.2.\n`
      + `  It is the largest zoom the fit may reach (default ${PDF_FIT_CEILING}). Raise it to`
      + ' fill more of each page, lower it to keep the type even across the deck.');
  }
  return ceiling;
}

// null means `fit`.
export function checkPdfZoom(v) {
  const zoomArg = v ?? 'fit';
  if (zoomArg === 'fit') return null;
  const zoom = Number(zoomArg);
  if (!Number.isFinite(zoom) || zoom < 0.6 || zoom > 2.2) {
    throw optionError(
      `Error: --pdf-zoom=${zoomArg} is neither \`fit\` nor a number between 0.6 and 2.2.\n`
      + '  fit (the default) sizes every chunk to the page and never enlarges past '
      + `${PDF_FIT_CEILING}.\n`
      + '  A number holds every page at that zoom and reports what runs off it.');
  }
  return zoom;
}

// Which half of the text the pages carry. Unset means the lecture's own
// setting, which is what every other appearance option does - a deck that
// opens in full prose exports in full prose. The override exists because the
// two answers are genuinely different documents: the slide text is what the
// room saw, the full prose is the manuscript behind it.
export function checkPdfCollapse(v) {
  const collapse = v ?? null;
  if (collapse !== null && collapse !== 'topic-bold' && collapse !== 'none') {
    throw optionError(
      `Error: --pdf-collapse=${collapse} is not a mode. Use topic-bold (the slide text`
      + ' alone) or none (the full prose). Omit it to follow the lecture.');
  }
  return collapse;
}

// All five, in the order the command line has always checked them, so a
// command with two bad values names the same one first it always did.
export function resolvePdfOptions({ beats, size, zoom, zoomMax, collapse } = {}) {
  const b = checkPdfBeats(beats);
  const s = checkPdfSize(size);
  const ceiling = checkPdfZoomMax(zoomMax);
  const z = checkPdfZoom(zoom);
  const c = checkPdfCollapse(collapse);
  return { beats: b, size: s, ...PDF_SIZES[s], zoom: z, collapse: c, ceiling };
}

// ── the export stylesheet ───────────────────────────────────────────
//
// Scoped to [data-psi-pdf] on <html>, which is set at the same moment the body
// is swapped, so nothing here can affect a live view.
export const PDF_CSS = `
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

  // Only a clip inside a chunk. The live view also carries #psiINT-demo-video, the
  // element a screen capture plays into under `D`, which sits outside every
  // chunk, never has a source here and is left out of the print DOM anyway -
  // counting it made every deck report a placeholder it never printed.
  const videos = async () => {
    for (const v of [...document.querySelectorAll('.chunk video')]) {
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
//
// pageSetup is its own evaluate, ahead of pageCollect, so the order the
// contract promises - auto-fit and the collapse before the first beat - is an
// order of driver calls that a fake driver can see, rather than three lines
// at the head of a function it cannot look into.
function pageSetup(cfg) {
  const P = window.psiExport;
  // Unconditional, and before anything else: an autoplaying figure that ticks
  // during the walk would advance a chunk behind the exporter's back.
  P.setAutoFit(true);
  // Before the walk, not after: the fit measures a collapsed chunk as a much
  // shorter one, so setting this afterwards would size every page against text
  // it does not show.
  if (cfg.collapse) P.setCollapse(cfg.collapse);
  P.quiesce();
  return true;
}

function pageCollect(cfg) {
  const P = window.psiExport;
  const chunks = P.chunks();
  const viewport = document.getElementById('psiINT-stage-viewport');

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
  const firstPageOf = Object.create(null);   // chunk id -> wrapper id of its first page
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
    wrap.id = 'psiINT-pdf-p' + (++n);
    wrap.style.setProperty('--zoom', zoomShown);
    const slide = document.createElement('div');
    slide.className = 'pdf-slide';
    slide.appendChild(clone);
    wrap.appendChild(slide);
    frag.appendChild(wrap);
    if (firstPageOf[id] === undefined) firstPageOf[id] = wrap.id;
    pages.push({ chunkId: id, beat, wrapperId: wrap.id, zoom: P.zoom() });
  };

  // What the fit measured on the page just captured, for the dump only: the
  // chunk's flow height at the zoom shown and one fit step above it, and the
  // limit it is held to. Two Chromiums a few pixels apart straddle that limit
  // whenever a chunk lands close to it, and fit the chunk a step apart; only
  // these numbers tell such a page from a real difference that also comes
  // out a step apart (a picture that did not load, a fallback face). The
  // numbers are the runtime's own, through psiExport.fitMeasure, because a
  // second measurement here would disagree with the fit by tens of pixels.
  // A page without the member, or one it answers with nothing, carries no
  // numbers, and the parity check then counts the page as a difference rather
  // than passing it. The hook puts the shown zoom back before returning.
  const fitMeasure = (el, shown) => {
    if (typeof P.fitMeasure !== 'function') return;
    const up = Math.round((Number(shown) + 0.05) * 100) / 100;
    let m;
    try { m = P.fitMeasure(el, [shown, up]); } catch { return; }
    if (!m || !(m.limit > 0) || !Array.isArray(m.heights) || m.heights.length !== 2) return;
    const r1 = (x) => Math.round(x * 10) / 10;
    pages[pages.length - 1].fit = {
      limit: r1(m.limit), h: r1(m.heights[0]), up, hUp: r1(m.heights[1]),
    };
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
        if (cfg.zoom === null) fitMeasure(el, shown);
      }
    }
  };

  return run().then(() => {
    // Read while the live DOM still exists: after the swap there are no
    // columns to ask, and naturalWidth is only meaningful on an <img> that
    // has been given the chance to load - which every chunk has now had.
    // Two shapes of the same fault. A path the build could not resolve never
    // becomes an <img>: it is drawn as a `.figure-missing` placeholder that
    // prints its own name, and the build has already warned without saying
    // which chunk. A path it passed through (a remote one) is an <img> the
    // browser failed to load.
    const missingImages = [];
    for (const { el, id } of chunks) {
      for (const fig of el.querySelectorAll('figure.figure-missing')) {
        missingImages.push({ chunkId: id, src: fig.dataset.figId || '' });
      }
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
  style.id = 'psiINT-pdf-css';
  style.textContent = cfg.css;
  document.head.appendChild(style);
  document.documentElement.setAttribute('data-psi-pdf', '');

  // A link that goes nowhere in a PDF is worse than no link, so an
  // unresolvable fragment is reported and demoted rather than left to point
  // at whatever the viewer decides.
  const dead = [];
  for (const a of [...document.querySelectorAll('a[href^="#"]')]) {
    // A fragment that is not valid percent-encoding (#50%) threw here and took
    // the whole export with it; docCollect already kept such a one as written.
    // And the table is looked up by own property only: #constructor found
    // Object's constructor and was rewritten to its source text.
    const raw = a.getAttribute('href').slice(1);
    let frag = raw;
    try { frag = decodeURIComponent(raw); } catch (e) { /* keep it raw */ }
    const target = Object.prototype.hasOwnProperty.call(cfg.links, frag)
      && typeof cfg.links[frag] === 'string' ? cfg.links[frag] : null;
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

// ── the link table ──────────────────────────────────────────────────
//
// Chunk id -> first page, then column id -> the same mapping for the divider
// slide it generates, falling back to its first chunk when the column has no
// heading and therefore no divider.
//
// Own properties only, on both sides: an id is an author's word, and a column
// whose first chunk is #constructor found Object's constructor here. The page
// that reads the table (pageInstall) checks again, because the table crosses
// into it as a plain object.
export function linkTable(got) {
  const pages = (got && got.firstPageOf) || {};
  const own = (k) => (typeof k === 'string' && Object.prototype.hasOwnProperty.call(pages, k)
    && typeof pages[k] === 'string' ? pages[k] : undefined);
  const links = {};
  for (const k of Object.keys(pages)) if (own(k)) links[k] = pages[k];
  for (const col of (got && got.columns) || []) {
    const via = own(col.sectionChunk) ?? (col.firstChunk ? own(col.firstChunk) : undefined);
    if (via) links[col.id] = via;
  }
  return links;
}

// ── the slide export ────────────────────────────────────────────────
//
// opts: { url, beats, size, w, h, zoom, collapse, ceiling, dumpDom }, the
// first a file: URL of a built audience.html - the caller turns a path into
// one, because this file has no path module - and the rest what
// resolvePdfOptions returns. dumpDom asks for the print DOM as text, for
// test/pdf-export.mjs.
//
// Returns the bytes and everything formatReport says about them. Writes
// nothing: the file is the caller's, because only the caller knows where it
// goes and how it is written safely there.
const psiReady = () => !!window.psiExport && document.fonts.status === 'loaded';

// ── what the network refusal counted ────────────────────────────────
//
// Every refused request, per origin - except the one a watch build makes on
// every load. A view built under --watch carries a reload client that opens
// ws://127.0.0.1:<port> (reloadScript in build.js), and the desktop app only
// ever exports watch builds. That socket is still refused, because a page
// that kept it would reload on the author's next save, in the middle of the
// walk or between load and print. But it is not a request the deck made, and
// reporting it beside a remote image put advice about embeds and inlining
// under every export the app would ever make. So it is counted on its own and
// formatReport says nothing about it; a one-shot build has no such socket,
// which is why the command line's output is unchanged. Loopback on any port,
// because the watch port is not known here - a deck that talks to a socket
// of its own on loopback is not a case this project has.
const RELOAD_SOCKET = /^wss?:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?\/?$/i;

function blockCounter() {
  const blocked = new Map();      // origin -> count
  let reloadSockets = 0;
  return {
    onBlocked(origin) {
      const o = String(origin);
      if (RELOAD_SOCKET.test(o)) { reloadSockets += 1; return; }
      blocked.set(o, (blocked.get(o) || 0) + 1);
    },
    // An array rather than the Map, so a result crosses an IPC boundary as
    // it is.
    result: () => ({
      blocked: [...blocked].map(([origin, count]) => ({ origin, count })),
      reloadSockets,
    }),
  };
}

export async function exportSlides(driver, opts) {
  const { url, beats, size, w, h, zoom, collapse, ceiling, dumpDom } = opts;
  const net = blockCounter();
  const pageErrors = [];

  const page = await driver.open({
    w, h,
    onBlocked: net.onBlocked,
    onPageError: (msg) => pageErrors.push(String(msg)),
  });
  try {
    await page.load(url);
    await page.waitFor(psiReady, 30000);

    const prep = await page.evaluate(pagePrepare);
    await page.evaluate(pageSetup, { collapse });
    const got = await page.evaluate(pageCollect, { beats, h, zoom, collapse, ceiling });

    const css = PDF_CSS.replace(/%W%/g, String(w)).replace(/%H%/g, String(h));
    const installed = await page.evaluate(pageInstall, { css, links: linkTable(got) });

    let dom = dumpDom
      ? await page.evaluate(() => document.documentElement.outerHTML)
      : null;
    // The fit's measurements ride the dump and never the print DOM, so the
    // PDF is the same bytes whether a dump was asked for or not. One comment
    // after </html>, a JSON array in page order; every `-` is escaped so no
    // chunk id can close the comment.
    const fits = got.pages.map(p => p.fit ? { page: p.wrapperId, ...p.fit } : null);
    if (dom !== null && fits.some(Boolean)) {
      dom += '\n<!-- psi-pdf-fit ' + JSON.stringify(fits).replace(/-/g, '\\u002d') + ' -->\n';
    }

    // The live views carry @media print rules meant for a document, not for
    // slides; 'screen' is what the pages were laid out against.
    const pdf = await page.pdf({ media: 'screen', w, h });

    return {
      kind: 'slides',
      pdf,
      dom,
      size, w, h, beats, zoom, collapse, ceiling,
      pages: installed.pages,
      chunks: new Set(got.pages.map(p => p.chunkId)).size,
      version: driver.version,
      where: driver.where,
      prep,
      overflow: got.overflow,
      missingImages: got.missingImages,
      dead: installed.dead,
      ...net.result(),
      pageErrors,
    };
  } finally {
    await Promise.resolve(page.close()).catch(() => {});
  }
}

// ── in-page: the document ───────────────────────────────────────────
//
// The document export prints the view as it stands: no state to walk, no
// clone, no swapped DOM, and the view's own @page rule sets the paper. What
// it adds over Cmd-P is what the slide export promises - no network, no
// browser header or footer, the same file on every machine with the same
// build - and the diagnostics a printed document can have. Overflow is not
// one of them: a paginated document has no frame to run out of.
const docReady = () => document.readyState === 'complete' && document.fonts.status === 'loaded';

// Every picture in a chunk decoded, and a lazy one told not to be: printing
// does not scroll, so a picture waiting to be scrolled to would print empty.
// Three seconds per picture, as the walk allows, then two frames so the
// layout has seen them.
function docSettle() {
  const imgs = [...document.querySelectorAll('.chunk img')];
  for (const img of imgs) if (img.loading === 'lazy') img.loading = 'eager';
  return Promise.all([
    document.fonts.ready,
    ...imgs.map(img => Promise.race([
      img.decode().catch(() => {}),
      new Promise(r => setTimeout(r, 3000)),
    ])),
  ])
    .then(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))
    .then(() => imgs.length);
}

// ::: pulse, the self-test questions a document carries (build.js,
// renderPulseQuestion). The markup is a question and a closed <details>
// holding the answer, and a closed <details> prints its summary and nothing
// else - measured: the answer is missing from the PDF, the word Answer is
// not. Pulse Embed v2 rebuilds each question on DOMContentLoaded, moving the
// answer out of the <details> into a box its own @media print rule shows,
// and hiding its buttons and the two <pulse-summary> boxes on paper. Its
// set-up is synchronous, so docReady (readyState complete) already waits for
// it: a question still carrying its <details> then is one the widget will
// never touch, because it failed or was not there. Such a question is
// opened here, so its answer prints under the summary's label, and reported.
//
// Nothing here reaches the network. The widget asks its server only with a
// sign-in token in localStorage, and both drivers open every export with
// fresh storage; test/pdf-export.mjs holds the zero.
function docPulse() {
  const all = [...document.querySelectorAll('pulse-question')];
  const unread = [];
  for (const q of all) {
    if (q.classList.contains('pulse-ready')) continue;
    const d = q.querySelector(':scope > details');
    if (!d) continue;
    d.open = true;
    const chunk = q.closest('.chunk');
    unread.push({ chunkId: chunk && chunk.id ? chunk.id : '?', key: q.getAttribute('key') || '' });
  }
  return { questions: all.length, unread };
}

// The two diagnostics that can be read off the page, in the shapes the slide
// export reports them in. A chunk in the documents is an <article> whose id
// is the chunk id; a link outside one (the contents, a divider) names its
// column. A dead fragment is demoted to a span for the reason pageInstall
// gives: a link that goes nowhere in a PDF is worse than no link.
function docCollect() {
  const where = (el) => {
    const chunk = el.closest('.chunk');
    if (chunk && chunk.id) return chunk.id;
    const col = el.closest('.column');
    return col && col.id ? col.id : '?';
  };
  const missingImages = [];
  for (const fig of document.querySelectorAll('.chunk figure.figure-missing')) {
    missingImages.push({ chunkId: where(fig), src: fig.dataset.figId || '' });
  }
  for (const img of document.querySelectorAll('.chunk img')) {
    if (img.getAttribute('src') && img.naturalWidth === 0) {
      missingImages.push({ chunkId: where(img), src: img.getAttribute('src') });
    }
  }
  const dead = [];
  for (const a of [...document.querySelectorAll('a[href^="#"]')]) {
    const raw = a.getAttribute('href').slice(1);
    if (!raw) continue;
    let frag = raw;
    try { frag = decodeURIComponent(raw); } catch (e) { /* keep it raw */ }
    if (document.getElementById(frag)) continue;
    dead.push({ fragment: frag, chunkId: where(a) });
    const span = document.createElement('span');
    span.className = a.className;
    span.append(...a.childNodes);
    a.replaceWith(span);
  }
  return { missingImages, dead };
}

// ── reading the file back ───────────────────────────────────────────
//
// The document's page count is the browser's pagination, so only the file
// knows it. Chromium writes PDF 1.4 without object streams, so the page tree
// is in the clear: the one /Type /Pages object with no /Parent carries
// /Count, and the first /MediaBox is the first page's paper. Either can be
// null - a browser that writes compressed objects - and the report then says
// less rather than something wrong. Bytes as a Buffer, a Uint8Array, an
// ArrayBuffer or (the gate's fake) a string.
function latin1(bytes) {
  if (typeof bytes === 'string') return bytes;
  const u8 = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) {
    s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  }
  return s;
}

export function pdfFacts(bytes) {
  const text = latin1(bytes);
  let pages = null;
  for (const m of text.matchAll(/\d+ 0 obj([\s\S]*?)endobj/g)) {
    const body = m[1];
    if (!/\/Type\s*\/Pages\b/.test(body) || /\/Parent\b/.test(body)) continue;
    const c = /\/Count\s+(\d+)/.exec(body);
    if (c) { pages = Number(c[1]); break; }
  }
  const mb = /\/MediaBox\s*\[\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*\]/.exec(text);
  const pageSize = mb
    ? { w: Number(mb[3]) - Number(mb[1]), h: Number(mb[4]) - Number(mb[2]) }
    : null;
  return { pages, pageSize };
}

// ── the document export ─────────────────────────────────────────────
//
// opts: { url }, a file: URL of a built print.html or print-notes.html. The
// page is opened at A4's width in CSS px, which only the screen layout before
// printing sees - the paper is the view's @page rule. Returns the bytes and
// what formatReport says about them, and writes nothing, as exportSlides.
export const DOC_VIEWPORT = { w: 794, h: 1123 };

export async function exportDocument(driver, opts) {
  const { url } = opts;
  const net = blockCounter();
  const pageErrors = [];

  const page = await driver.open({
    w: DOC_VIEWPORT.w, h: DOC_VIEWPORT.h,
    onBlocked: net.onBlocked,
    onPageError: (msg) => pageErrors.push(String(msg)),
  });
  try {
    await page.load(url);
    await page.waitFor(docReady, 30000);
    // Before the pictures: an answer opened here may hold one.
    const pulse = await page.evaluate(docPulse);
    const pictures = await page.evaluate(docSettle);
    const got = await page.evaluate(docCollect);
    // Print media: the documents' @media print rules are what a document is.
    const pdf = await page.pdf({ media: 'print', css: true });
    const facts = pdfFacts(pdf);
    return {
      kind: 'document',
      pdf,
      view: String(url).split(/[?#]/)[0].split('/').pop(),
      pages: facts.pages,
      pageSize: facts.pageSize,
      pictures,
      pulse,
      version: driver.version,
      where: driver.where,
      missingImages: got.missingImages,
      dead: got.dead,
      ...net.result(),
      pageErrors,
    };
  } finally {
    await Promise.resolve(page.close()).catch(() => {});
  }
}

// ── what the run says afterwards ────────────────────────────────────
//
// Four error classes each get a line with a next step in it, rather than
// staying silent, and each names the context it can actually have. Returned
// as lines rather than printed: `warn` is a diagnostic (stderr on the command
// line, the build-error place in the app), `info` is the run's own account
// (stdout). outLabel is how the file is named in them - a path relative to
// the working directory on the command line. A `warn` about one chunk also
// carries `chunk`, its id, for the app, which shows the chunk beside the line.
//
// A result of either export: exportDocument's carries kind 'document' and no
// overflow, no still and no card. withBrowser: false drops the Chromium line,
// for every export after the first in a run that started one browser.
export function formatReport(r, { outLabel, withBrowser = true }) {
  const rel = outLabel;
  const lines = [];
  // A diagnostic about one chunk carries its id as well, so the app can name
  // the slide without reading it back out of the words.
  const warn = (text, chunk) => lines.push(chunk && chunk !== '?' ? { level: 'warn', text, chunk } : { level: 'warn', text });
  const info = (text) => lines.push({ level: 'info', text });
  const doc = r.kind === 'document';

  for (const o of (doc ? [] : r.overflow)) {
    warn(
      `${rel}: ${o.chunkId} beat ${o.beat} does not fit the page at zoom ${o.zoom.toFixed(2)} `
      + `(${o.content}px of content, ${o.available}px available). `
      + (r.zoom === null
        ? 'Shorten it or split it.'
        : 'Shorten it, split it, or drop --pdf-zoom and let each page size itself.'), o.chunkId);
  }
  // One line rather than one per page when a fixed zoom is overrunning
  // wholesale: that is a decision to revisit, not a list to work through.
  if (!doc && r.zoom !== null && r.overflow.length > r.pages * 0.2) {
    warn(
      `${rel}: ${r.overflow.length} of ${r.pages} pages run off the page at --pdf-zoom=${r.zoom}. `
      + 'That is what a fixed zoom costs on a deck whose slides differ in length; '
      + '--pdf-zoom=fit sizes each one instead.');
  }
  for (const m of r.missingImages) {
    warn(`${rel}: ${m.chunkId} has an image that did not load: ${m.src}`
      + ' – check the path, or build with inlined images (the default).', m.chunkId);
  }
  for (const d of r.dead) {
    warn(`${rel}: ${d.chunkId} links to #${d.fragment}, which is no chunk and no column`
      + ' – the link is now plain text. Fix the fragment or drop the link.', d.chunkId);
  }
  // The document prints the view as it is, so the card is the slide
  // export's alone and so is the sentence about it.
  for (const { origin, count } of r.blocked) {
    warn(`${rel}: blocked ${count} request(s) to ${origin}`
      + (doc
        ? ' – the export is offline by design. A remote image prints empty, so inline it.'
        : ' – the export is offline by design. A hosted embed prints as a card;'
          + ' a remote image prints empty, so inline it.'));
  }
  for (const e of r.pageErrors) {
    warn(`${rel}: the page reported an error during the export: ${e}`);
  }
  // Absent on a slide result and on a result from before the field existed.
  const pulse = r.pulse || { questions: 0, unread: [] };
  for (const u of pulse.unread) {
    warn(`${rel}: ${u.chunkId} has a self-test question (${u.key}) the Pulse widget did not set up`
      + ' – its answer prints unfolded, under the Answer label and as plain markup.', u.chunkId);
  }

  if (doc) {
    if (pulse.questions) {
      info(`[pdf] ${pulse.questions} self-test question(s) printed with their answers.`);
    }
    if (withBrowser) info(`[pdf] Chromium ${r.version} – ${r.where}`);
    // Points to millimetres, rounded: Chromium's A4 is 594.96 x 841.92 pt,
    // which is 210 x 297 mm to the millimetre and 209.9 x 297.0 to the tenth.
    const mm = (pt) => Math.round(pt / 72 * 25.4);
    info(`Wrote ${rel} (${r.pages === null ? 'an unread number of' : r.pages} page(s) `
      + `from ${r.view}`
      + `${r.pageSize ? `, ${mm(r.pageSize.w)}×${mm(r.pageSize.h)} mm` : ''})`);
    return lines;
  }

  const still = r.prep.stills + r.prep.placeholders;
  if (still) {
    info(`[pdf] ${still} video(s) replaced by a still `
      + `(${r.prep.stills} frame 0, ${r.prep.placeholders} placeholder).`);
  }
  if (r.prep.embeds) info(`[pdf] ${r.prep.embeds} hosted embed(s) replaced by a card.`);
  // The browser is half the reproducibility promise the plan makes, and it
  // costs one line: the same machine with the same build produces the same
  // PDF, two machines may differ in hyphenation and fallback glyphs.
  if (withBrowser) info(`[pdf] Chromium ${r.version} – ${r.where}`);
  info(`Wrote ${rel} (${r.pages} page(s) from ${r.chunks} chunk(s), `
    + `${r.size} at ${r.w}×${r.h}, beats=${r.beats}, `
    + `zoom=${r.zoom === null ? `fit≤${r.ceiling}` : r.zoom}`
    + `${r.collapse ? `, collapse=${r.collapse}` : ''})`);
  return lines;
}
