// The diagram editor.
//
// Read editor.md first – this file is the *what*, that file is the why. The
// short version: a `::: diagram` block is a figure written in a small
// relational language, and this is the graphical way to edit it. It parses
// the block, records where every token sits, answers a drag by rewriting the
// smallest span it can, and re-runs the same compiler the build runs.
//
// **It edits source text, not a model.** There is no second representation to
// drift, no export step that flattens relations into numbers, and no file the
// editor owns. Everything it produces is a block a human could have typed.
//
// Shipped as text, like AUDIENCE_JS – but read from disk rather than embedded
// in a template literal, which is why a backtick in here is safe and a
// backtick in AUDIENCE_JS is a parse error. Same for the regexes: `\s` means
// what it says here.
//
// Naming: everything is `dge*`. `dg*` is the compiler and is taken.
//
// Navigate by the `// ── section ──` banners.

// ── the browser half of the compiler's Node-only leaves ─────────────
// diagram-core.mjs is pure: four things it cannot do itself are injected by
// whoever runs it. In Node those read the disk. Here they read a table the
// build emitted beside each diagram, because by the time the page exists
// every asset is already resolved – the compiled SVG carries the data URI.

const DGE_WARNINGS = [];

// The placeholders imageTable() punched into the build's own image markup.
// NUL-delimited because nothing legitimate in an SVG contains one, and a
// sentinel that could occur in the content is a sentinel that will.
const DGE_ID_SLOT = '\u0000ID\u0000';
const DGE_GEO_SLOT = '\u0000GEO\u0000';
const DGE_ALT_SLOT = '\u0000ALT\u0000';

function dgeEscapeHtml(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// One compiler per figure, because the image table is per figure. Cheap:
// createDiagramCompiler closes over five functions and a counter.
// The lecture-wide `default` layer, parsed once from the text the build
// emitted. Every figure in the lecture resolves against it, exactly as the
// build did – four layers, scope before selector – so the editor's picture
// and the build's picture are the same picture.
let dgeBaseLayer;
function dgeBase() {
  if (dgeBaseLayer !== undefined) return dgeBaseLayer;
  const text = window.PSI_DG_DEFAULTS;
  dgeBaseLayer = null;
  if (text) {
    const { layer, errors } = window.PSI_DG.parseDiagramDefaults(text);
    // The build already refused a bad block, so an error here means the two
    // parsers disagree – worth saying rather than silently ignoring.
    if (errors.length) DGE_WARNINGS.push('diagram-defaults: ' + errors[0].msg);
    else dgeBaseLayer = layer;
  }
  return dgeBaseLayer;
}

function dgeCompilerFor(images) {
  const table = images || {};
  return window.PSI_DG.createDiagramCompiler({
    // `abs` is an opaque handle to the pair of leaves, not a path. Returning
    // the reference itself keeps the compiler's own branch – "did we resolve
    // it on disk?" – answering yes, which is what makes `aspect` get read.
    resolveImage: (ref) => (table[ref] ? { abs: ref, href: ref, remote: false } : null),
    imageAspect: (ref) => (table[ref] ? table[ref].aspect : null),
    warn: (msg) => { DGE_WARNINGS.push(msg); },
    escapeHtml: dgeEscapeHtml,
    // The markup the build already emitted, with the id and the geometry
    // lifted out as placeholders. That is what makes a re-render identical
    // rather than merely equivalent: a spliced vector asset is hundreds of
    // lines of someone else's SVG and there is no re-deriving it here.
    assetMarkup: (node, id, geo) => {
      const hit = table[node.src];
      if (!hit) return '';
      // The accessible name is not a substring to splice – it is carried by
      // a construct that is absent when there is none – so the build ships
      // both shapes and this picks. See imageTable in diagram-core.mjs.
      // One stored shape plus the range to cut out when there is no
      // accessible name – see imageTable in diagram-core.mjs.
      const markup = node.alt || !hit.drop
        ? hit.markup
        : hit.markup.slice(0, hit.drop[0]) + hit.markup.slice(hit.drop[0] + hit.drop[1]);
      return markup
        .split(DGE_ID_SLOT).join(id)
        .split(DGE_GEO_SLOT).join(geo)
        .split(DGE_ALT_SLOT).join(dgeEscapeHtml(node.alt || ''));
    },
  });
}

// ── figures ─────────────────────────────────────────────────────────
// Every diagram in the document, in source order, with its own source. The
// workspace (editor.md §6) is over this list rather than over one chunk: once
// the editor is open it stops being attached to the figure it was opened from.

const DGE_FIGURES = [];
// Step runtimes the editor created for figures that gained their first step
// while it was open. They are held so `Space` on the slide underneath keeps
// finding them; the build's own initDiagrams only ever runs at boot.
const DGE_NEW_RUNTIMES = [];

function dgeCollectFigures() {
  DGE_FIGURES.length = 0;
  // Deduplicated by the SVG element, not by the payload script. The speaker
  // view clones whole chunks into its preview strip, so a lecture with
  // eleven figures carries twenty-two payload scripts – and because
  // getElementById always answers with the original, every clone's script
  // resolves to a figure that is already in the list. Left in, the workspace
  // would offer each figure twice and `,` / `.` would step through ghosts.
  const seen = new Set();
  document.querySelectorAll('script.psi-diagram-source').forEach((sc) => {
    const svg = document.getElementById(sc.dataset.for);
    if (!svg || seen.has(svg)) return;
    seen.add(svg);
    let data;
    try { data = JSON.parse(sc.textContent); } catch (e) { return; }
    // The asset table travels separately, so a view that does not ship the
    // editor can drop it. Absent is normal – most figures have no image.
    const assetsEl = document.querySelector(
      'script.psi-diagram-assets[data-for="' + sc.dataset.for + '"]');
    let images = {};
    if (assetsEl) { try { images = JSON.parse(assetsEl.textContent); } catch (e) {} }
    const chunkEl = svg.closest('[id]');
    DGE_FIGURES.push({
      svg,
      figure: svg.closest('.figure-diagram'),
      // The build's own id prefix for this figure. Pinned when re-rendering,
      // or every element in the re-render would be named dg1-* regardless of
      // which figure it came from – and the comparison in dgeSelfTest would
      // fail for a reason that has nothing to do with the compiler.
      prefix: sc.dataset.for.replace(/root$/, ''),
      body: data.body,
      attrs: data.attrs,
      range: data.range,
      chunk: data.chunk,
      // Which diagram this is inside its chunk, counted here rather than
      // emitted: the payload is produced per block and does not know about
      // its siblings.
      nth: 0,
      width: data.width || 'standard',
      alt: data.alt || '',
      images,
      compiler: dgeCompilerFor(images),
    });
  });
  const perChunk = new Map();
  for (const f of DGE_FIGURES) {
    const n = (perChunk.get(f.chunk) || 0) + 1;
    perChunk.set(f.chunk, n);
    f.nth = n;
  }
  return DGE_FIGURES;
}

// Compile one figure's source and hand back the pieces the editor needs.
// Never throws: a parse error while the author is mid-edit is a normal state,
// not an exception, and the canvas has to keep the last good picture on
// screen rather than going blank (editor.md §11.7).
function dgeCompile(fig, body) {
  const src = body === undefined ? fig.body : body;
  const out = { source: src, ok: false, html: '', errors: [], warnings: [], model: null };
  const before = DGE_WARNINGS.length;
  try {
    const base = dgeBase();
    const res = fig.compiler.parseDiagramSource(src, fig.attrs, base);
    out.model = res.model;
    if (res.errors.length) {
      out.errors = dgeDedupe(res.errors);
      return out;
    }
    out.html = fig.compiler.renderDiagram(src, fig.attrs, { prefix: fig.prefix, alt: fig.alt, base });
    out.ok = true;
  } catch (err) {
    out.errors = dgeErrorsFrom(err);
  }
  out.warnings = DGE_WARNINGS.splice(before);
  return out;
}

// renderDiagram throws one Error carrying every problem, formatted for a
// terminal. The editor wants them back as lines it can mark in the source
// pane, so unpick the shape it built rather than showing a paragraph.
function dgeErrorsFrom(err) {
  const out = [];
  for (const line of String(err && err.message || '').split('\n')) {
    const m = line.match(/^\s*(?:line (\d+) of the block: )?(.*\S)\s*$/);
    if (!m || /problem\(s\):$/.test(line)) continue;
    out.push({ line: m[1] ? Number(m[1]) : 0, msg: m[2] });
  }
  return out;
}

function dgeDedupe(errors) {
  const seen = new Set();
  return errors.filter((e) => {
    const key = e.line + ' ' + e.msg;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── the identity check ──────────────────────────────────────────────
// editor.md phase 3: re-render every figure from its own source and compare
// against what the build emitted. This is the whole "one compiler, two
// runtimes" bet, cashed early and cheaply – any difference here is the bet
// failing, and it is much cheaper to find now than after six phases of UI
// have been built on top of it.
//
// Left in the shipped file on purpose. It costs nothing until called, and it
// is the thing to run first when a re-render ever looks wrong.

function dgeNormalise(html) {
  // The build writes the figure's SVG into a document; the browser then
  // reads it back through the DOM, which normalises attribute order,
  // whitespace between elements, and self-closing forms. Comparing strings
  // would compare the DOM's serialiser against the emitter's. Compare the
  // parsed trees instead, which is the thing that actually has to match.
  const holder = document.createElement('div');
  holder.innerHTML = html;
  return holder.querySelector('svg');
}

// Numbers in an attribute are compared as numbers. The emitter writes
// toFixed(2) and the step runtime writes Math.round(v * 100) / 100, so
// "12.30" and "12.3" are the same coordinate written by two code paths –
// comparing the strings would report a difference that is not one.
function dgeNormaliseAttr(v) {
  return String(v).replace(/-?\d+\.?\d*(?:e[-+]?\d+)?/gi, (n) => {
    const x = Number(n);
    return Number.isFinite(x) ? x.toFixed(2) : n;
  });
}

function dgeNodeSignature(el, into) {
  const attrs = [...el.attributes]
    .map((a) => a.name + '=' + dgeNormaliseAttr(a.value))
    .sort()
    .join(' ');
  into.push(el.tagName.toLowerCase() + '[' + attrs + ']');
  for (const child of el.children) dgeNodeSignature(child, into);
  const text = [...el.childNodes]
    .filter((n) => n.nodeType === 3)
    .map((n) => n.nodeValue)
    .join('');
  if (text.trim()) into.push('#text:' + text);
  return into;
}

function dgeSelfTest() {
  const figures = DGE_FIGURES.length ? DGE_FIGURES : dgeCollectFigures();
  const report = { figures: figures.length, ok: 0, failed: [], warnings: [] };
  for (const fig of figures) {
    const compiled = dgeCompile(fig);
    if (!compiled.ok) {
      report.failed.push({ chunk: fig.chunk, why: 'did not compile', errors: compiled.errors });
      continue;
    }
    // Compare like for like. The SVG in the page is not the SVG the build
    // wrote: the step runtime has already applied beat 0 to it (opacity,
    // classes, every geometry vector) and swapped the print viewBox for the
    // one that holds every beat. The emitter's static attributes are the
    // *last* beat, on purpose – a view with no JavaScript shows the finished
    // picture. So put the re-render through the same runtime before looking
    // at it, or the check reports the animation as a compiler difference.
    const root = dgeNormalise(compiled.html);
    const d = fig.svg.psiDiagram;
    if (d) {
      if (root.dataset.liveViewbox) {
        root.setAttribute('viewBox', root.dataset.liveViewbox);
        const w = Number(root.getAttribute('width'));
        const r = Number(root.dataset.liveRatio);
        if (w && r) root.setAttribute('height', String(Math.round(w * r)));
      }
      window.dgRenderInto(root, d, d.step);
    }
    const mine = dgeNodeSignature(root, []);
    const theirs = dgeNodeSignature(fig.svg, []);
    if (mine.length !== theirs.length) {
      report.failed.push({ chunk: fig.chunk, why: `node count ${mine.length} vs ${theirs.length}` });
      continue;
    }
    let diff = null;
    for (let i = 0; i < mine.length; i++) {
      if (mine[i] !== theirs[i]) { diff = { at: i, mine: mine[i], theirs: theirs[i] }; break; }
    }
    if (diff) report.failed.push({ chunk: fig.chunk, why: 'node differs', diff });
    else report.ok++;
    if (compiled.warnings.length) report.warnings.push({ chunk: fig.chunk, warnings: compiled.warnings });
  }
  return report;
}


// ── vocabulary, as the sidebar shows it ─────────────────────────────
// The class vocabulary is a closed enumeration and the editor exposes
// exactly those names and nothing else – no freehand, no arbitrary colours,
// no free font choice. Grouped by the slot each occupies, because that is
// what the swatch row *is*: one choice per slot, and picking one displaces
// whatever was there.

const DGE_SLOTS = [
  { key: 'fill', label: 'fill', kinds: ['box', 'dot', 'text', 'container'],
    options: [
      // Two swatches that can look alike and are not: the first is "whatever
      // a default says", the second names the canvas colour. Without the
      // second, a box under `default box {.tone-3}` had no way back to paper
      // and a free text could not have a ground at all.
      { cls: '', label: 'default', fill: '' },
      { cls: 'paper', fill: '' },
      { cls: 'tone-1', fill: 'tone-1' }, { cls: 'tone-2', fill: 'tone-2' },
      { cls: 'tone-3', fill: 'tone-3' }, { cls: 'tone-4', fill: 'tone-4' },
      { cls: 'clear', fill: 'clear' },
    ] },
  { key: 'ink', label: 'ink', kinds: null,
    options: [{ cls: '', label: 'ink' }, { cls: 'accent' }, { cls: 'muted' }] },
  { key: 'stroke', label: 'line', kinds: null,
    options: [{ cls: '', label: 'solid' }, { cls: 'dashed' }, { cls: 'dotted' }] },
  { key: 'weight', label: 'weight', kinds: null,
    options: [{ cls: '', label: 'normal' }, { cls: 'thick' }, { cls: 'bare' }] },
  // One slot, six outlines, because they are one slot in the grammar: a
  // hexagon has no corner radius to argue about, so picking one has to
  // displace whatever was there. A container is offered the two rectangles
  // and will be refused the other four by the compiler - which is the same
  // arrangement `.fit` has, and the status bar says why.
  { key: 'corner', label: 'outline', kinds: ['box', 'container'],
    // Which way a chevron or a wedge aims is the `point` option, not a class,
    // so the panel cannot set it yet - it writes classes and tags. Picking the
    // outline here and aiming it in the source is the current split.
    options: [{ cls: '', label: 'default' }, { cls: 'round' }, { cls: 'sharp' },
      { cls: 'hex' }, { cls: 'chevron', label: 'chev' },
      { cls: 'wedge' }, { cls: 'cross' }] },
  { key: 'reading', label: 'reading', kinds: ['box', 'text'],
    options: [{ cls: '', label: 'across' }, { cls: 'turn', label: 'up' }] },
  { key: 'curve', label: 'line shape', kinds: ['edge'],
    options: [{ cls: '', label: 'straight' }, { cls: 'smooth', label: 'curved' }] },
  { key: 'size', label: 'type size', kinds: null,
    options: [{ cls: 'small' }, { cls: '', label: 'normal' }, { cls: 'large' }] },
  { key: 'family', label: 'family', kinds: null,
    options: [{ cls: '', label: 'sans' }, { cls: 'mono' }, { cls: 'serif' }, { cls: 'hand' }] },
  { key: 'fitting', label: 'type fits the box', kinds: ['box', 'text'],
    options: [{ cls: '', label: 'no' }, { cls: 'fit' }, { cls: 'shrink' }] },
  { key: 'weightfont', label: 'text weight', kinds: null,
    options: [{ cls: '', label: 'regular' }, { cls: 'bold' }] },
  { key: 'align', label: 'text align', kinds: ['text'],
    options: [{ cls: 'left' }, { cls: '', label: 'centre' }, { cls: 'right' }] },
  { key: 'head', label: 'arrowheads', kinds: ['edge'],
    options: [{ cls: '', label: 'one' }, { cls: 'no-head', label: 'none' }, { cls: 'both-heads', label: 'both' }] },
  { key: 'softness', label: 'softness', kinds: null,
    options: [{ cls: '', label: 'full' }, { cls: 'ghost' }, { cls: 'dim' }, { cls: 'emph' }] },
];

// The tools. Placers put a new element somewhere; wrappers act on what is
// already selected, because that is what their statements mean. There is
// nothing to draw for a container – select three boxes and press 6.
const DGE_TOOLS = [
  { id: 'select', keys: ['1', 'v'], label: 'select', icon: 'M3 2l9 6-3.6 1L11 12l-1.6 1-2.5-3L4 13z' },
  { id: 'box', keys: ['2', 'r'], label: 'box', icon: 'M2 4h11v7H2z', placer: true },
  { id: 'dot', keys: ['3', 'c'], label: 'dot', icon: 'M7.5 3.2a4.3 4.3 0 100 8.6 4.3 4.3 0 000-8.6z', placer: true },
  { id: 'text', keys: ['4', 't'], label: 'text', icon: 'M2 3h11v2h-4.5v8h-2V5H2z', placer: true },
  { id: 'edge', keys: ['5', 'a'], label: 'edge', icon: 'M2 12L13 4M13 4l-4 .3M13 4l-.3 4', drag: true },
  { id: 'line', keys: ['9', 'l'], label: 'line', icon: 'M2 12L13 4', drag: true },
  { id: 'image', keys: ['8', 'i'], label: 'image', icon: 'M2 3h11v9H2zM2 10l3.5-3 3 2.4L11 7l2 2', placer: true },
  { sep: true },
  { id: 'container', keys: ['6'], label: 'container', icon: 'M2 2h11v11H2zM4.5 5h6v5h-6z', wrapper: true },
  { id: 'brace', keys: ['7'], label: 'brace', icon: 'M5 2c0 3-3 3-3 4.5C2 8 5 8 5 11M8 2h5M8 6.5h5M8 11h5', wrapper: true },
];

// What `default <kind>` and each statement accept, mirrored from the
// compiler's own table so the panel can never offer a field the build would
// reject. Imported, not re-stated – that is the whole point of the tables
// being exported.
function dgeKindOpts(kind) {
  return (window.PSI_DG.DG_KIND_OPTS[kind] || []).slice();
}

// ── editor state ────────────────────────────────────────────────────
// Deliberately small, and deliberately *not* a model of the diagram. The
// diagram is the source text; this is what the author is doing to it.

const DGE = {
  open: false,
  fig: null,             // the figure being edited
  index: 0,              // its position in DGE_FIGURES
  source: '',            // the current block body – the only thing that matters
  compiled: null,        // last successful compile, kept when a parse fails
  model: null,           // its model
  spans: null,           // createSpanTable over it
  spansFor: null,        // the source text that table describes
  boxes: null,           // id -> {x,y,w,h} at the beat on screen, in px
  prefix: '',            // the compiler's id prefix inside the painted SVG
  beat: 0,               // which beat the canvas shows
  selection: [],         // element ids, first is the master for align/spread
  strain: null,          // the shared axis a drag is currently pushing against
  tool: 'select',
  toolLocked: false,
  frame: 'slide',
  zoom: 1,
  pan: { x: 0, y: 0 },
  stripRight: false,
  boardOpen: false,
  undo: [],              // whole-body snapshots, one per gesture
  redo: [],
  clipboard: null,
  dirty: false,
  status: { line: '', note: '', bad: false },
};

const DGE_MAX_UNDO = 120;

// ── small DOM helpers ───────────────────────────────────────────────

function dgeEl(tag, attrs, kids) {
  const el = tag === 'svg' || tag === 'g' || tag === 'rect' || tag === 'line'
    || tag === 'circle' || tag === 'path' || tag === 'text' || tag === 'polyline'
    ? document.createElementNS('http://www.w3.org/2000/svg', tag)
    : document.createElement(tag);
  for (const k in (attrs || {})) {
    const v = attrs[k];
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.setAttribute('class', v);
    else if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const kid of (kids || [])) if (kid) el.appendChild(kid);
  return el;
}

const dgeQ = (sel) => document.querySelector(sel);
// A number as the DSL spells it: no trailing zeros, but only ever *after* a
// decimal point. Trimming unconditionally ate the zeros of integers – 10
// became 1 – which is invisible at the default two places, where the dot
// survives, and wrong on the rulers, which ask for none.
const dgeNum = (n, places) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return '0';
  const s = v.toFixed(places === undefined ? 2 : places);
  return s.includes('.') ? (s.replace(/0+$/, '').replace(/\.$/, '') || '0') : s;
};

// ── the frame (editor.md §5) ────────────────────────────────────────
// You cannot judge a figure without knowing how large it lands, and in this
// project that is not a property of the figure: `unit=WxH` sets only the grid
// cell and therefore the proportions inside the picture, while how large it
// arrives is the chunk's width class. An editor that let you pick an
// arbitrary canvas size would be lying to you.
//
// So the frames are computed, not chosen, and they are real destinations.
// Switching between them changes nothing in the source.

const DGE_FRAME_EM = {
  // the chunk's own width class, from AUDIENCE_CSS
  slide: { narrow: 28, standard: 36, wide: 52, full: 72 },
  // one pane of a ::: side or a ::: cols 2 at that class – just under half
  // the chunk in every class, and the portrait case: a .full pane is 35em
  // against the slide's 72em, and at .standard it is 17em. This is the one
  // place a landscape figure quietly stops working.
  column: { narrow: 13, standard: 17, wide: 25, full: 35 },
  // the document measure, where the 62vh cap does not apply at all
  print: { narrow: 28, standard: 36, wide: 52, full: 72 },
};

// The em base is the chunk's own font size, measured from the live document
// rather than assumed: it moves with the zoom key and with auto-fit.
function dgeEmPx() {
  const chunk = document.querySelector('.chunk');
  if (!chunk) return 16;
  const px = parseFloat(getComputedStyle(chunk).fontSize);
  return Number.isFinite(px) && px > 0 ? px : 16;
}

function dgeFrameMetrics() {
  const width = DGE.fig ? DGE.fig.width : 'standard';
  const em = DGE_FRAME_EM[DGE.frame][width] || 36;
  const px = em * dgeEmPx();
  // .psi-diagram is capped at 62vh in the live views and at nothing in
  // print. A figure that hits the cap leaves a band of the measure empty
  // beside it, and that is invisible until you look at the built page.
  const capPx = DGE.frame === 'print' ? Infinity : window.innerHeight * 0.62;
  return { em, px, capPx, width };
}

// ── the overlay ─────────────────────────────────────────────────────

let dgeRoot = null;

function dgeBuildChrome() {
  if (dgeRoot) return dgeRoot;

  const tools = dgeEl('nav', { id: 'dge-tools', 'aria-label': 'Tools' });
  for (const t of DGE_TOOLS) {
    if (t.sep) { tools.appendChild(dgeEl('hr', {})); continue; }
    const icon = dgeEl('svg', { viewBox: '0 0 15 15', 'aria-hidden': 'true' }, [
      dgeEl('path', { d: t.icon, fill: t.id === 'select' || t.id === 'box' || t.id === 'dot' || t.id === 'text' || t.id === 'image' || t.id === 'container' ? 'currentColor' : 'none', stroke: 'currentColor', 'stroke-width': 1.2, 'fill-opacity': t.id === 'box' || t.id === 'image' || t.id === 'container' ? 0.12 : 1 }),
    ]);
    const btn = dgeEl('button', {
      type: 'button', class: 'dge-btn dge-tool', 'data-tool': t.id,
      title: `${t.label}  (${t.keys.map(k => k.toUpperCase()).join(' or ')})`,
      'aria-pressed': 'false',
      onclick: () => dgePickTool(t.id),
    }, [icon, dgeEl('span', { text: t.keys[0].toUpperCase() })]);
    tools.appendChild(btn);
  }

  const seg = dgeEl('div', { class: 'dge-seg', id: 'dge-frames', role: 'group', 'aria-label': 'Frame' });
  for (const f of ['slide', 'column', 'print']) {
    seg.appendChild(dgeEl('button', {
      type: 'button', 'data-frame': f, 'aria-pressed': String(f === DGE.frame),
      onclick: () => dgeSetFrame(f),
    }, [document.createTextNode(f[0].toUpperCase() + f.slice(1)), dgeEl('i', { text: '' })]));
  }

  const top = dgeEl('header', { id: 'dge-top' }, [
    dgeEl('span', { class: 'dge-name', id: 'dge-name' }),
    dgeEl('div', { class: 'dge-group' }, [
      dgeEl('button', { type: 'button', class: 'dge-btn', 'data-act': 'prev', title: 'previous figure (, or PageUp)', text: '‹', onclick: () => dgeGoFigure(-1) }),
      dgeEl('span', { id: 'dge-figpos' }),
      dgeEl('button', { type: 'button', class: 'dge-btn', 'data-act': 'next', title: 'next figure (. or PageDown)', text: '›', onclick: () => dgeGoFigure(1) }),
      dgeEl('button', { type: 'button', class: 'dge-btn', id: 'dge-board-btn', title: 'the figure board', html: 'Board <kbd>O</kbd>', onclick: () => dgeToggleBoard() }),
      dgeEl('button', { type: 'button', class: 'dge-btn', text: 'New figure…', title: 'put a whole figure chunk on the clipboard, for source.md', onclick: () => dgeNewFigure() }),
    ]),
    dgeEl('div', { class: 'dge-group' }, [dgeEl('span', { class: 'dge-cap', text: 'frame' }), seg]),
    dgeEl('div', { class: 'dge-group' }, [
      dgeEl('button', { type: 'button', class: 'dge-btn', text: '−', title: 'zoom out', onclick: () => dgeZoomBy(1 / 1.2) }),
      dgeEl('span', { id: 'dge-zoom' }),
      dgeEl('button', { type: 'button', class: 'dge-btn', text: '+', title: 'zoom in', onclick: () => dgeZoomBy(1.2) }),
      dgeEl('button', { type: 'button', class: 'dge-btn', text: 'Fit', title: 'fit the frame in the canvas', onclick: () => dgeZoomFit() }),
    ]),
    dgeEl('span', { class: 'dge-spacer' }),
    dgeEl('span', { id: 'dge-room' }),
    dgeEl('div', { class: 'dge-group' }, [
      dgeEl('button', { type: 'button', class: 'dge-btn', id: 'dge-undo-btn', title: 'undo (⌘Z)', text: '↶', onclick: () => dgeUndo() }),
      dgeEl('button', { type: 'button', class: 'dge-btn', id: 'dge-redo-btn', title: 'redo (⇧⌘Z)', text: '↷', onclick: () => dgeRedo() }),
    ]),
    dgeEl('button', { type: 'button', class: 'dge-btn', id: 'dge-file-btn', text: 'Open source.md…', title: 'write back straight into the file (Chromium only)', onclick: () => dgePickSourceFile() }),
    dgeEl('button', { type: 'button', class: 'dge-btn', id: 'dge-revert-btn', text: 'Revert', title: 'discard your edits to this figure', onclick: () => dgeRevertLocal() }),
    dgeEl('button', { type: 'button', class: 'dge-btn dge-on', id: 'dge-copy-btn', html: 'Copy source <kbd>⌘S</kbd>', onclick: () => dgeCommit() }),
    dgeEl('button', { type: 'button', class: 'dge-btn', html: 'Close <kbd>Esc</kbd>', onclick: () => dgeClose() }),
  ]);

  // The guide layer is a sibling of the drawing *inside* #dge-art, not of the
  // frame: the frame has padding, so guides pinned to it would be offset by
  // that padding from the picture they annotate. Sharing the drawing's own
  // box and its viewBox is what makes a guide drawn at 3.2,1 land at 3.2,1.
  const guides = dgeEl('svg', { id: 'dge-guides', 'aria-hidden': 'true' });
  const art = dgeEl('div', { id: 'dge-art' }, [guides]);
  const frame = dgeEl('div', { id: 'dge-frame' }, [art]);
  const stage = dgeEl('div', { id: 'dge-stage' }, [frame]);
  const board = dgeEl('div', { id: 'dge-board', hidden: true });
  const assets = dgeEl('div', { id: 'dge-assets', hidden: true }, [
    dgeEl('div', { id: 'dge-assets-inner' }, [
      dgeEl('header', {}, [
        dgeEl('b', { text: 'Place a picture' }),
        dgeEl('button', { type: 'button', class: 'dge-btn', text: 'Cancel', onclick: () => dgeCloseAssetPicker() }),
      ]),
      dgeEl('div', { id: 'dge-assets-list' }),
      dgeEl('p', { id: 'dge-assets-note' }),
    ]),
  ]);
  const canvas = dgeEl('main', { id: 'dge-canvas' }, [stage, board, assets]);

  const side = dgeEl('aside', { id: 'dge-side' });
  const status = dgeEl('footer', { id: 'dge-status' }, [
    dgeEl('span', { class: 'dge-group', id: 'dge-beats', hidden: true }),
    dgeEl('span', { class: 'dge-line', id: 'dge-statusline' }),
    dgeEl('span', { class: 'dge-note', id: 'dge-statusnote' }),
    dgeEl('span', { class: 'dge-spacer' }),
    dgeEl('span', { id: 'dge-counts' }),
  ]);
  const strip = dgeEl('section', { id: 'dge-strip', 'aria-label': 'Figures' });

  tools.appendChild(dgeEl('hr', {}));
  tools.appendChild(dgeEl('button', {
    type: 'button', class: 'dge-btn dge-tool', id: 'dge-lock', 'aria-pressed': 'false',
    title: 'keep the current tool active instead of falling back to select  (Q)',
    onclick: () => { DGE.toolLocked = !DGE.toolLocked; dgeRenderTools(); },
  }, [
    dgeEl('svg', { viewBox: '0 0 15 15', 'aria-hidden': 'true' }, [
      dgeEl('path', { d: 'M4 7V5a3.5 3.5 0 017 0v2M3 7h9v6H3z', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.2 }),
    ]),
    dgeEl('span', { text: 'Q' }),
  ]));

  dgeRoot = dgeEl('div', {
    id: 'dge-root', role: 'dialog', 'aria-modal': 'true',
    'aria-label': 'Diagram editor', hidden: true,
  }, [top, tools, canvas, side, status, strip]);
  document.body.appendChild(dgeRoot);

  dgeWireCanvas(canvas, guides);
  return dgeRoot;
}

// ── open, close, render ─────────────────────────────────────────────

function dgeOpen(figOrIndex) {
  const figs = dgeCollectFigures();
  if (!figs.length) return false;
  let index = 0;
  if (typeof figOrIndex === 'number') index = figOrIndex;
  else if (figOrIndex) index = Math.max(0, figs.indexOf(figOrIndex));
  dgeBuildChrome();
  DGE.open = true;
  // Nothing to restore on the way out. The workspace moves between figures
  // inside the editor and never touches the lecture's own position, so
  // editing five figures does not move the projection five times – and
  // `revealed[chunkId]`, which the reveal, the sync, the freeze gate and the
  // localStorage recovery all share, is never written to at all.
  // Shown *before* the figure is fitted: every measurement fit needs -
  // the canvas box, the frame box - is zero while the overlay is hidden, so
  // fitting first sizes the figure against nothing and lands at 100%.
  dgeRoot.hidden = false;
  document.body.classList.add('dge-open');
  dgeLoadFigure(index, true);
  requestAnimationFrame(() => dgeZoomFit());
  dgeRoot.focus?.();
  return true;
}

function dgeClose() {
  if (!DGE.open) return;
  try { sessionStorage.removeItem(DGE_REOPEN); } catch (e) {}
  DGE.open = false;
  dgeRoot.hidden = true;
  document.body.classList.remove('dge-open');
  DGE.boardOpen = false;
}

function dgeLoadFigure(index, resetView) {
  const figs = DGE_FIGURES;
  DGE.index = Math.max(0, Math.min(figs.length - 1, index));
  DGE.fig = figs[DGE.index];
  const kept = dgeLoadLocal(DGE.fig);
  DGE.source = kept === null ? DGE.fig.body : kept;
  DGE.selection = [];
  DGE.undo = [];
  DGE.redo = [];
  DGE.dirty = false;
  // The editor opens at the beat that is on screen. `revealed[chunkId]` is
  // the single piece of state the reveal, the sync, the freeze gate and the
  // localStorage recovery all share, and the editor writes nothing back to
  // it: a lecturer who fixes a figure mid-talk has to find the room's slide
  // unchanged underneath.
  const live = DGE.fig.svg.psiDiagram;
  DGE.beat = live ? live.step : 0;
  if (resetView !== false) { DGE.zoom = 1; DGE.pan = { x: 0, y: 0 }; }
  DGE.frame = 'slide';
  dgeRecompile();
  dgeZoomFit();
  dgeRenderStrip();
}

// Recompile the current source and repaint everything that depends on it.
// A parse error never blanks the canvas: the last good render stays on
// screen, the offending line is marked in the source pane, and the commit
// button is disabled. While the author is mid-edit an intermediate state is
// normal, not exceptional.
// True while a pointer gesture is in flight. The sidebar rebuilds an element
// list and the whole source pane, and none of it changes between two
// pointermove events – the guides and the status bar carry the feedback. On a
// figure with fifty elements the difference is visible.
let dgeInGesture = false;

function dgeRecompile() {
  const res = dgeCompile(DGE.fig, DGE.source);
  DGE.problems = res.errors.length ? res.errors : [];
  DGE.warnings = res.warnings || [];
  if (res.ok) {
    DGE.compiled = res;
    DGE.model = res.model;
    DGE.spans = window.PSI_DG.createSpanTable(res.model, DGE.source);
    // What the table describes. dgeSetSource refuses to leave the block
    // broken, so this should always equal DGE.source - and if some path ever
    // gets round that, a gesture planned against the stale table would splice
    // at offsets that have moved. Cheaper to notice than to debug.
    DGE.spansFor = DGE.source;
    DGE.beat = Math.max(0, Math.min(res.model.steps.length, DGE.beat));
    DGE.boxes = dgeBoxesAt(res.model, DGE.beat);
    dgePaintArt(res.html);
    // A selection whose element the author just deleted by typing has to go.
    DGE.selection = DGE.selection.filter((id) => DGE.boxes.has(id) || dgeFind(id));
  }
  if (dgeInGesture) { dgeApplyFrame(); dgeDrawGuides(); return; }
  dgeRenderAll();
}

// The geometry of every element at one beat, in the diagram's own px space.
// Re-laying out only the beat on screen is deliberate: renderDiagram lays out
// once *per step*, so a diagram with eight steps would do eight layouts per
// pointermove. The whole thing re-runs on commit, which is also when the
// warnings refresh.
function dgeBoxesAt(model, beat) {
  const errors = [];
  const state = window.PSI_DG.dgStateAt(model, Math.max(0, Math.min(model.steps.length, beat)));
  return DGE.fig.compiler.layoutDiagram(model, state, errors);
}

function dgePaintArt(html) {
  const art = dgeQ('#dge-art');
  const holder = document.createElement('div');
  holder.innerHTML = html;
  const fig = holder.querySelector('figure');
  const svg = holder.querySelector('svg.psi-diagram');
  if (!svg) return;
  // The canvas shows the beat the author is on, so the live viewBox – the
  // one that holds every beat – is the right one here for the same reason it
  // is right in the live views: an element walking in from outside must not
  // be clipped for the whole of its journey.
  // While a gesture is in flight the viewBox is pinned to what it was when
  // the pointer went down. Otherwise the figure grows as `gap` grows, the
  // whole drawing rescales under the pointer, and the next pointermove
  // measures its delta against a different mapping – which compounds: a 60px
  // drag came out as a gap of 8.45. It is also the wrong *feel*; a picture
  // that rescales under your hand is not a picture you can aim at.
  if (DGE.pinnedViewBox) svg.setAttribute('viewBox', DGE.pinnedViewBox);
  else if (svg.dataset.liveViewbox) svg.setAttribute('viewBox', svg.dataset.liveViewbox);
  svg.removeAttribute('width');
  svg.removeAttribute('height');
  // The compiler prefixes every id inside the figure (dg3-mix, dg3-edge-1--p)
  // and the root carries the prefix too, so keep it before overwriting the id.
  // It is the only way back from a model id to the node the compiler drew for
  // it, and searching by suffix instead would match my-edge-1--p for edge-1--p.
  DGE.prefix = /root$/.test(svg.id || '') ? svg.id.replace(/root$/, '') : '';
  svg.id = 'dge-art-svg';
  // Paint the beat on screen into it, using the runtime the build already
  // ships – no second implementation of "what does step k look like".
  const payload = fig ? fig.querySelector('script.psi-diagram-frames') : null;
  if (payload) {
    try {
      const data = JSON.parse(payload.textContent);
      window.dgRenderInto(svg, { data, svg }, DGE.beat);
    } catch (e) { /* a diagram with no steps has no payload */ }
  }
  const guides = dgeQ('#dge-guides');
  art.replaceChildren(svg, guides);
  guides.setAttribute('viewBox', svg.getAttribute('viewBox'));
  guides.setAttribute('preserveAspectRatio', 'xMidYMid meet');
}

// ── layout of the canvas: frame, zoom, fit ──────────────────────────

function dgeApplyFrame() {
  const m = dgeFrameMetrics();
  const frame = dgeQ('#dge-frame');
  const art = dgeQ('#dge-art');
  const svg = dgeQ('#dge-art-svg');
  if (!frame || !svg) return;
  frame.style.width = (m.px * DGE.zoom) + 'px';
  frame.style.padding = (14 * DGE.zoom) + 'px';
  art.style.width = '100%';
  // Reproduce what .psi-diagram actually does at the destination: fill the
  // measure, and be capped in height in the live views but not in print.
  svg.style.maxWidth = '100%';
  svg.style.width = '100%';
  svg.style.height = 'auto';
  svg.style.maxHeight = m.capPx === Infinity ? 'none' : (m.capPx * DGE.zoom) + 'px';
  const vb = (svg.getAttribute('viewBox') || '0 0 1 1').split(/\s+/).map(Number);
  const ratio = vb[3] / (vb[2] || 1);
  const natural = (m.px - 28) * ratio;
  const capped = m.capPx !== Infinity && natural > m.capPx;
  let note = `${m.width} · ${m.em}em`;
  if (capped) {
    // Say it while the author can still fix it. This is invisible until you
    // look at the built page: a third of the measure stays empty beside the
    // drawing, because the height cap bound before the width did.
    note += ` · height-capped at 62vh, so ${Math.round(100 - 100 * (m.capPx / natural))}% of the measure stays empty beside it`;
  }
  frame.dataset.measure = note;
  dgeQ('#dge-frames').querySelectorAll('button').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.frame === DGE.frame));
    const em = DGE_FRAME_EM[b.dataset.frame][m.width];
    b.querySelector('i').textContent = b.dataset.frame === 'print' ? em + 'em' : em + 'em';
  });
}

// Zoom changes the frame's *size*, not a transform on it. A transform does
// not change the layout box, so at zoom 1 a 72em frame is wider than the
// canvas, the grid clamps the overflowing item to the start edge instead of
// centring it, and the scaled figure then sits well off to the right. Pan
// stays a transform, because pan is exactly a thing that should not affect
// layout.
function dgeApplyView() {
  const stage = dgeQ('#dge-stage');
  if (!stage) return;
  stage.style.transform = `translate(${DGE.pan.x}px, ${DGE.pan.y}px)`;
  dgeApplyFrame();
  const z = dgeQ('#dge-zoom');
  if (z) z.textContent = Math.round(DGE.zoom * 100) + '%';
}

function dgeSetFrame(name) {
  DGE.frame = name;
  dgeApplyFrame();
  dgeZoomFit();
  dgeDrawGuides();
}

function dgeCycleFrame(back) {
  const order = ['slide', 'column', 'print'];
  const i = order.indexOf(DGE.frame);
  dgeSetFrame(order[(i + (back ? order.length - 1 : 1)) % order.length]);
}

function dgeZoomBy(k) {
  DGE.zoom = Math.max(0.15, Math.min(8, DGE.zoom * k));
  dgeApplyView();
  dgeDrawGuides();
}

function dgeZoomFit() {
  dgeApplyFrame();
  const canvas = dgeQ('#dge-canvas');
  const frame = dgeQ('#dge-frame');
  if (!canvas || !frame) return;
  DGE.zoom = 1;
  DGE.pan = { x: 0, y: 0 };
  dgeApplyView();
  const cb = canvas.getBoundingClientRect();
  const fb = frame.getBoundingClientRect();
  if (!fb.width || !fb.height) return;
  const k = Math.min((cb.width - 70) / fb.width, (cb.height - 80) / fb.height);
  DGE.zoom = Math.max(0.15, Math.min(4, k));
  dgeApplyView();
  dgeDrawGuides();
}

// Pointer position in the diagram's own coordinate space – the one every
// number in the block is written in. getScreenCTM does the whole transform
// chain, so zoom, pan and the frame's own scaling are all accounted for.
function dgePointToDiagram(ev) {
  const guides = dgeQ('#dge-guides');
  const ctm = guides.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const inv = ctm.inverse();
  const p = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(inv);
  return { x: p.x, y: p.y };
}

// px -> grid cells, which is what the author writes. `unit` is the whole
// coordinate system of the block and is currently something they have to
// hold in their head; the rulers and every readout here are in cells.
function dgeUnits(model) {
  const u = ((model || DGE.model) && (model || DGE.model).unit) || [120, 72];
  return { uw: u[0], uh: u[1] };
}

// ── guides (editor.md §9.1) ─────────────────────────────────────────
// A diagram is made of relations, so draw them. The whole point of this
// grammar is that a figure is held together by relations rather than
// coordinates – and that structure is completely invisible in the rendered
// picture. Two boxes 0.55 apart look exactly like two boxes that happen to
// be 0.55 apart. The editor's first job, before it lets anyone drag
// anything, is to make the tidiness visible.
//
// This is also how a refusal stops being a surprise: §9.3 declines to drag a
// follower along its constrained axis, and if that axis is already drawn as
// a line through the set, the refusal is something the author saw coming.

let dgeSnapGuides = [];   // live during a drag, cleared on pointerup

function dgeDrawGuides() {
  const g = dgeQ('#dge-guides');
  if (!g || !DGE.model) return;
  g.replaceChildren();
  const { uw, uh } = dgeUnits();
  const vb = (g.getAttribute('viewBox') || '0 0 1 1').split(/\s+/).map(Number);
  const [vx, vy, vw, vh] = vb;

  // A faint cell grid, at very low contrast, behind the figure. `unit=WxH`
  // is the coordinate system every number in the block is written in, and
  // `gap 0.55` needs somewhere to be read off.
  const grid = dgeEl('g', { class: 'dge-cell' });
  const x0 = Math.floor(vx / uw) * uw, y0 = Math.floor(vy / uh) * uh;
  for (let x = x0; x <= vx + vw; x += uw) {
    grid.appendChild(dgeEl('line', { x1: x, y1: vy, x2: x, y2: vy + vh }));
  }
  for (let y = y0; y <= vy + vh; y += uh) {
    grid.appendChild(dgeEl('line', { x1: vx, y1: y, x2: vx + vw, y2: y }));
  }
  g.appendChild(grid);
  // The origin, which is where the first element sits for free.
  g.appendChild(dgeEl('g', { class: 'dge-axis' }, [
    dgeEl('line', { x1: vx, y1: 0, x2: vx + vw, y2: 0 }),
    dgeEl('line', { x1: 0, y1: vy, x2: 0, y2: vy + vh }),
  ]));

  // Rulers in cells, not pixels, along the top and left edges.
  const ruler = dgeEl('g', { class: 'dge-tick' });
  for (let x = x0; x <= vx + vw; x += uw) {
    ruler.appendChild(dgeEl('line', { x1: x, y1: vy, x2: x, y2: vy + 7 }));
    ruler.appendChild(dgeEl('text', {
      class: 'dge-ruler-label', x: x + 3, y: vy + 14, text: dgeNum(x / uw, 0),
    }));
  }
  for (let y = y0; y <= vy + vh; y += uh) {
    ruler.appendChild(dgeEl('line', { x1: vx, y1: y, x2: vx + 7, y2: y }));
    ruler.appendChild(dgeEl('text', {
      class: 'dge-ruler-label', x: vx + 3, y: y - 3, text: dgeNum(y / uh, 0),
    }));
  }
  g.appendChild(ruler);

  // Tag membership: a tinted halo behind the members. A tag is not
  // geometric, so it must not be drawn as a line – borrowing the alignment
  // treatment would say something false about what the tag does.
  if (DGE.hoverTag) {
    const halo = dgeEl('g', { class: 'dge-taghalo' });
    for (const id of (DGE.model.tags.get(DGE.hoverTag) || [])) {
      const b = DGE.boxes.get(id);
      if (!b) continue;
      halo.appendChild(dgeEl('rect', {
        x: b.x - 7, y: b.y - 7, width: b.w + 14, height: b.h + 14, rx: 8,
      }));
    }
    g.appendChild(halo);
  }

  // The selection, and what holds it. An edge gets its own line traced rather
  // than a rectangle: it has no box to draw, and the box it would be given is
  // mostly empty paper wherever the arrow runs diagonally.
  for (const id of DGE.selection) {
    const b = DGE.boxes.get(id);
    if (b) {
      g.appendChild(dgeEl('rect', {
        class: 'dge-sel', x: b.x - 3, y: b.y - 3, width: b.w + 6, height: b.h + 6, rx: 3,
      }));
      continue;
    }
    const pts = dgeEdgePts(id);
    if (pts) {
      g.appendChild(dgeEl('polyline', {
        class: 'dge-sel-path', points: pts.map((q) => q.join(',')).join(' '),
      }));
    }
  }
  dgeDrawBeatGuides(g);
  if (DGE.selection.length === 1) dgeDrawRelations(g, DGE.selection[0]);
  if (DGE.selection.length === 1 && DGE.tool === 'select') dgeDrawHandles(g, DGE.selection[0]);

  for (const node of dgeSnapGuides) g.appendChild(node);
}

// At rest, the selection shows what holds it: the placement it was written
// with, the sets it belongs to, the width it copies. Quiet – hairlines in
// --rule, labels in --ink-soft – and they answer, without a click, *why is
// this here?*
function dgeDrawRelations(g, id) {
  const el = dgeFind(id);
  const b = DGE.boxes.get(id);
  if (!el || !b) return;
  const { uw, uh } = dgeUnits();
  const mid = (x) => x.x + x.w / 2;
  const midY = (x) => x.y + x.h / 2;
  const label = (x, y, text) => g.appendChild(dgeEl('text', { class: 'dge-rel-label', x, y, text }));
  const tick = (x1, y1, x2, y2, strong) =>
    g.appendChild(dgeEl('line', { class: strong ? 'dge-rel-strong' : 'dge-rel', x1, y1, x2, y2 }));

  const p = el.place;
  if (p && p.kind === 'rel') {
    const ref = DGE.boxes.get(p.ref);
    if (ref) {
      // The gap itself, drawn between the two facing edges and labelled with
      // the number that is written on the line.
      if (p.dir === 'right' || p.dir === 'left') {
        const y = midY(b);
        const from = p.dir === 'right' ? ref.x + ref.w : ref.x;
        tick(from, y, p.dir === 'right' ? b.x : b.x + b.w, y, true);
        label((from + (p.dir === 'right' ? b.x : b.x + b.w)) / 2 - 12, y - 5, 'gap ' + dgeNum(p.gap));
      } else {
        const x = mid(b);
        const from = p.dir === 'below' ? ref.y + ref.h : ref.y;
        tick(x, from, x, p.dir === 'below' ? b.y : b.y + b.h, true);
        label(x + 5, (from + (p.dir === 'below' ? b.y : b.y + b.h)) / 2, 'gap ' + dgeNum(p.gap));
      }
      // The alignment edge the placement carries, as a hairline through both.
      const a = p.align;
      if (p.dir === 'right' || p.dir === 'left') {
        const ay = a === 'top' ? ref.y : a === 'bottom' ? ref.y + ref.h : midY(ref);
        tick(Math.min(ref.x, b.x) - 10, ay, Math.max(ref.x + ref.w, b.x + b.w) + 10, ay);
      } else {
        const ax = a === 'left' ? ref.x : a === 'right' ? ref.x + ref.w : mid(ref);
        tick(ax, Math.min(ref.y, b.y) - 10, ax, Math.max(ref.y + ref.h, b.y + b.h) + 10);
      }
    }
  } else if (p && p.kind === 'between') {
    const a = DGE.boxes.get(p.refs[0].ref), z = DGE.boxes.get(p.refs[1].ref);
    if (a && z) {
      tick(mid(a), midY(a), mid(z), midY(z), true);
      label(mid(b) + 6, midY(b) - 6, 'frac ' + dgeNum(p.frac));
    }
  } else if (p && p.kind === 'abs' && !p.implicit) {
    // A ref coordinate is the most valuable construct in the grammar and the
    // least discoverable. Where one is in play, draw the line it refers to.
    for (const [i, c] of (p.at || []).entries()) {
      if (!c || !c.ref) continue;
      const rb = DGE.boxes.get(c.ref);
      if (!rb) continue;
      if (i === 0) {
        const x = c.prop === 'left' ? rb.x : c.prop === 'right' ? rb.x + rb.w : mid(rb);
        tick(x, Math.min(rb.y, b.y) - 12, x, Math.max(rb.y + rb.h, b.y + b.h) + 12);
        label(x + 4, Math.min(rb.y, b.y) - 15, c.ref + '.' + c.prop + (c.nudge ? (c.nudge > 0 ? '+' : '') + dgeNum(c.nudge) : ''));
      } else {
        const y = c.prop === 'top' ? rb.y : c.prop === 'bottom' ? rb.y + rb.h : midY(rb);
        tick(Math.min(rb.x, b.x) - 12, y, Math.max(rb.x + rb.w, b.x + b.w) + 12, y);
        label(Math.max(rb.x + rb.w, b.x + b.w) + 15, y - 4, c.ref + '.' + c.prop + (c.nudge ? (c.nudge > 0 ? '+' : '') + dgeNum(c.nudge) : ''));
      }
    }
  }

  // The sets. A shared axis runs as a hairline through every member with the
  // master marked, so "that coordinate is not this element's to move" is
  // something you can see before you try.
  // While a drag is pushing against a shared axis, that axis is the answer to
  // what the author is trying to do, so it stops being a hairline and says
  // how much further they have to pull to leave it.
  const strained = (rec) => !!(DGE.strain && DGE.strain.owner && DGE.strain.owner.line === rec.line);
  const pullNote = ' · pull ' + (DGE.strain ? dgeNum(DGE.strain.need) : '') + ' more or hold Alt';
  for (const a of DGE.model.aligns) {
    if (!a.members.includes(id)) continue;
    const boxes = a.members.map((m) => DGE.boxes.get(m)).filter(Boolean);
    if (!boxes.length) continue;
    const master = DGE.boxes.get(a.members[0]);
    if (!master) continue;
    const hot = strained(a);
    const cap = 'align ' + a.axis + ' ' + a.edge + (hot ? pullNote : '');
    if (a.axis === 'x') {
      const x = a.edge === 'left' ? master.x : a.edge === 'right' ? master.x + master.w : mid(master);
      const ys = boxes.flatMap((q) => [q.y, q.y + q.h]);
      tick(x, Math.min(...ys) - 14, x, Math.max(...ys) + 14, hot);
      label(x + 4, Math.min(...ys) - 17, cap);
    } else {
      const y = a.edge === 'top' ? master.y : a.edge === 'bottom' ? master.y + master.h : midY(master);
      const xs = boxes.flatMap((q) => [q.x, q.x + q.w]);
      tick(Math.min(...xs) - 14, y, Math.max(...xs) + 14, y, hot);
      label(Math.max(...xs) + 17, y - 4, cap);
    }
  }
  for (const s of DGE.model.spreads) {
    if (!s.members.includes(id)) continue;
    const boxes = s.members.map((m) => DGE.boxes.get(m)).filter(Boolean);
    if (boxes.length < 2) continue;
    const hotSpread = strained(s);
    // Equal centre distances as matched marks, which is what `spread` means.
    for (let i = 1; i < boxes.length; i++) {
      const a = boxes[i - 1], z = boxes[i];
      if (s.axis === 'x') {
        const y = Math.min(...boxes.map((q) => q.y)) - 12;
        tick(mid(a), y, mid(z), y, hotSpread);
        label((mid(a) + mid(z)) / 2 - 6, y - 4, i === 1 && hotSpread ? '=' + pullNote : '=');
      } else {
        const x = Math.min(...boxes.map((q) => q.x)) - 12;
        tick(x, midY(a), x, midY(z), hotSpread);
        label(x - 12, (midY(a) + midY(z)) / 2, i === 1 && hotSpread ? '=' + pullNote : '=');
      }
    }
  }
  // `same as` as a width bracket mirrored onto its source.
  if (el.sameAs) {
    const src = DGE.boxes.get(el.sameAs);
    if (src) {
      tick(src.x, src.y - 9, src.x + src.w, src.y - 9);
      tick(b.x, b.y - 9, b.x + b.w, b.y - 9);
      label(src.x + src.w / 2 - 20, src.y - 13, 'same as');
    }
  }
}

// Resize handles, on a box that can actually be resized – and, on an edge,
// the two ends. Dragging one of those is the only gesture in the editor that
// changes *what* a statement refers to rather than where something sits, which
// is why it gets a different shape: a round grip, not a square corner.
function dgeDrawHandles(g, id) {
  const el = dgeFind(id);
  if (!el) return;
  if (el.kind === 'edge') {
    const pts = dgeEdgePts(id);
    if (!pts) return;
    // The drawn polyline is [start, ...waypoints, end], so waypoint k is
    // pts[k+1] and no second geometry is needed to find it. Only the two ends
    // are pulled back from their true position, to clear the arrowhead; the
    // interior points are exact.
    const via = el.via || [];
    // A hollow dot at the middle of every segment: the only visible answer to
    // "how do I make this arrow go around that box". Drawn first so a real
    // waypoint sitting near a midpoint is the one you grab.
    for (let i = 0; i + 1 < pts.length; i++) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
      g.appendChild(dgeEl('circle', {
        class: 'dge-handle dge-h-add', 'data-handle': 'add-' + i, 'data-id': id,
        cx: mx, cy: my, r: 3.5,
      }));
    }
    for (let k = 0; k < via.length && k + 1 < pts.length - 1; k++) {
      const p = pts[k + 1], r = 4.5;
      // Square, like the resize grips, because it moves a point; the round
      // ones retarget. Hollowed differently again when it holds a reference,
      // which is the thing a drag has to preserve rather than replace.
      const held = (via[k] || []).some((c) => c && c.ref);
      g.appendChild(dgeEl('rect', {
        class: 'dge-handle dge-h-via' + (held ? ' dge-h-held' : ''),
        'data-handle': 'via-' + k, 'data-id': id,
        x: p[0] - r, y: p[1] - r, width: r * 2, height: r * 2, rx: 1,
      }));
    }
    for (const [which, p] of [['from', pts[0]], ['to', pts[pts.length - 1]]]) {
      g.appendChild(dgeEl('circle', {
        class: 'dge-handle dge-h-end', 'data-handle': which, 'data-id': id,
        cx: p[0], cy: p[1], r: 5,
      }));
    }
    return;
  }
  const b = DGE.boxes.get(id);
  if (!b || !DGE.model.nodes.some((n) => n.id === id)) return;
  if (el.kind === 'image' || el.kind === 'dot' || el.kind === 'box' || el.kind === 'text') {
    const r = 4.5;
    const spots = [
      ['se', b.x + b.w, b.y + b.h], ['e', b.x + b.w, b.y + b.h / 2],
      ['s', b.x + b.w / 2, b.y + b.h],
    ];
    for (const [dir, x, y] of spots) {
      g.appendChild(dgeEl('rect', {
        class: 'dge-handle dge-h-' + dir, 'data-handle': dir, 'data-id': id,
        x: x - r, y: y - r, width: r * 2, height: r * 2, rx: 1,
      }));
    }
  }
}

function dgeFind(id, model) {
  const m = model || DGE.model;
  if (!m) return null;
  return [...m.nodes, ...m.edges, ...m.containers, ...m.braces]
    .find((e) => e.id === id) || null;
}

// ── which token a drag rewrites (editor.md §9.3) ────────────────────
// An element's position comes from exactly one placement expression, and the
// editor's job is to decide which token a drag belongs to. The table:
//
//   at X,Y numeric      main axis: that number        cross: that number
//   at X,Y with ref     the nudge (add one if absent) same
//   right/left of A     gap                           align, then offset
//   below/above A       gap                           align, then offset
//   between A,B         frac                          offset
//   owned by align x|y  –                             –
//   owned by spread x|y –                             –
//
// The last two rows are the interesting ones. That axis is not the
// element's to move, and the editor says so rather than silently breaking
// the set.

const DGE_SNAP_CELL = 0.05;      // round values on the cell grid
// How far a follower has to be pulled against its shared axis before it
// leaves the set. Half a cell: far enough that nudging one of a row of boxes
// keeps the row, close enough that leaving is a gesture rather than a fight.
const DGE_BREAK_CELL = 0.5;
const DGE_ALIGN_TOL = 0.06;      // how close counts as "on that edge", in cells

function dgeRound(v, step) {
  return Math.round(v / step) * step;
}

// Which axis a `rel` placement owns. `right of` puts the gap on x and the
// alignment on y; `below` the other way round.
function dgeMainAxis(place) {
  if (!place) return null;
  if (place.kind !== 'rel') return null;
  return (place.dir === 'right' || place.dir === 'left') ? 'x' : 'y';
}

// Everything a drag of one element by (dx, dy) grid cells would write, as a
// list of {attr, value, why}. Returning the *edits* rather than applying
// them is what lets the status bar show the line before the pointer is up.
// A relation as the grammar spells it. `right of a`, `left of a`, but
// `below a` and `above a` - the two vertical words take no "of".
function dgePlaceText(dir, ref, gap) {
  const word = (dir === 'right' || dir === 'left') ? dir + ' of' : dir;
  return word + ' ' + ref + (gap == null ? '' : ' gap ' + dgeNum(gap));
}

const DGE_DIRS = ['left', 'right', 'above', 'below'];

// Which side of the reference the element has been dragged to, and how far
// its facing edge now sits from the reference's. Returns null while the
// element is still on the side it already claims, so an ordinary drag keeps
// writing `gap` and nothing else.
function dgeRedock(ctx, id, place, dx, dy, snap) {
  const b = ctx.boxes.get(id);
  const ref = ctx.boxes.get(place.ref);
  if (!b || !ref) return null;
  const { uw, uh } = dgeUnits(ctx.model);
  const cx = b.x + b.w / 2 + dx * uw;
  const cy = b.y + b.h / 2 + dy * uh;
  const vx = cx - (ref.x + ref.w / 2);
  const vy = cy - (ref.y + ref.h / 2);
  // The dominant axis decides, measured from centre to centre - the same
  // question dgAutoAnchor asks about an edge's endpoint, and the same answer.
  const dir = Math.abs(vx) >= Math.abs(vy)
    ? (vx >= 0 ? 'right' : 'left')
    : (vy >= 0 ? 'below' : 'above');
  if (dir === place.dir) return null;
  const gapPx = dir === 'right' ? (cx - b.w / 2) - (ref.x + ref.w)
    : dir === 'left' ? ref.x - (cx + b.w / 2)
      : dir === 'below' ? (cy - b.h / 2) - (ref.y + ref.h)
        : ref.y - (cy + b.h / 2);
  const gap = Math.max(0, snap(gapPx / ((dir === 'right' || dir === 'left') ? uw : uh)));
  return {
    text: dgePlaceText(dir, place.ref, gap),
    why: 'docks it ' + (dir === 'right' || dir === 'left' ? dir + ' of ' : dir + ' ') + place.ref
      + ' – the whole relation, not an offset',
  };
}

function dgePlanDrag(ctx, id, dx, dy, opts) {
  const el = dgeFind(id, ctx.model);
  if (!el) return { edits: [], refusals: [] };
  const place = el.place;
  const edits = [];
  const refusals = [];
  const free = opts && opts.free;      // Ctrl/Cmd held: no snapping
  const leave = opts && opts.leave;    // Alt held: leave the set at once
  const snap = (v) => (free ? v : dgeRound(v, DGE_SNAP_CELL));
  let strain = null;

  // A coordinate owned by a set is not this element's to move - until the
  // author insists. Pulling a follower against its shared axis holds it on
  // the axis, draws the axis it is held by, and says how much further to pull;
  // past DGE_BREAK_CELL, or with Alt held, it drops the element from the
  // statement and the drag goes through.
  //
  // This used to be a flat refusal naming the line and telling the author to
  // go and make that edit by hand. The information was right and the answer
  // was wrong: a set you cannot leave by dragging is a set the canvas cannot
  // express, and "drop bob from that line" is precisely the edit the editor
  // exists to make. The threshold is what keeps the set from dissolving under
  // an ordinary nudge - leaving has to be something you meant.
  const held = (axis, delta) => {
    const owner = ctx.spans.constrainedBy(id, axis);
    if (!owner) return false;
    const past = Math.abs(delta) - DGE_BREAK_CELL;
    if (past < 0 && !leave) {
      const master = owner.members[0];
      strain = { axis, owner, need: -past };
      refusals.push(owner.kind === 'align'
        ? `${axis} is held by "align ${owner.axis} ${owner.edge}" on line ${owner.line}. `
          + `Pull ${dgeNum(-past)} further, or hold Alt, to drop ${id} from it – `
          + `or drag ${master} to move the whole row.`
        : `${axis} is held by "spread ${owner.axis}" on line ${owner.line}. `
          + `Pull ${dgeNum(-past)} further, or hold Alt, to drop ${id} from it – `
          + `or drag ${owner.members[0]} or ${owner.members[owner.members.length - 1]} to move the set.`);
      return true;
    }
    const rest = owner.members.filter((m) => m !== id);
    const text = dgeStatementText(owner, rest);
    edits.push(text === null
      ? {
        raw: dgeLineRange(ctx.source, owner.span), value: '',
        why: `takes line ${owner.line} away – ${owner.kind} needs ${owner.kind === 'align' ? 'two' : 'three'}`,
      }
      : {
        raw: owner.span, value: text,
        why: `drops ${id} from ${owner.kind} on line ${owner.line}`,
      });
    return false;
  };
  const xBlocked = dx !== 0 && held('x', dx);
  const yBlocked = dy !== 0 && held('y', dy);

  if (!place || place.implicit) {
    // Nothing in the source to rewrite. The first element sits at the origin
    // for free; giving it a position means writing the placement out.
    const at = `at ${dgeNum(snap(dx))},${dgeNum(snap(dy))}`;
    edits.push({ attr: 'place', value: at, why: 'writes the placement out' });
    return { edits, refusals, strain };
  }

  if (place.kind === 'abs') {
    const parts = place.at || [];
    const axes = [['x', 0, dx, xBlocked], ['y', 1, dy, yBlocked]];
    for (const [axis, i, delta, isBlocked] of axes) {
      if (!delta || isBlocked) continue;
      const c = parts[i];
      if (c && c.ref) {
        // A reference with a signed nudge. Rewrite the nudge, never the
        // reference: that is the whole reason the nudge is in the grammar.
        const next = snap((c.nudge || 0) + delta);
        edits.push({
          attr: `at.${axis}.nudge`,
          value: next === 0 ? '' : (next > 0 ? '+' : '') + dgeNum(next),
          why: `keeps ${c.ref}.${c.prop}`,
          whole: next === 0 ? null : undefined,
        });
      } else {
        edits.push({ attr: `at.${axis}`, value: dgeNum(snap((c ? c.unit : 0) + delta)) });
      }
    }
    return { edits, refusals, strain };
  }

  if (place.kind === 'between') {
    // Along the line joining the two, `frac`; off it, `offset`.
    const a = ctx.boxes.get(place.refs[0].ref), z = ctx.boxes.get(place.refs[1].ref);
    const { uw, uh } = dgeUnits(ctx.model);
    if (a && z) {
      const vx = (z.x + z.w / 2) - (a.x + a.w / 2), vy = (z.y + z.h / 2) - (a.y + a.h / 2);
      const len2 = vx * vx + vy * vy;
      if (len2 > 0) {
        const along = ((dx * uw) * vx + (dy * uh) * vy) / len2;
        const next = Math.max(0, Math.min(1, snap(place.frac + along)));
        if (Math.abs(along) > 1e-6 && !xBlocked && !yBlocked) {
          edits.push({ attr: 'frac', value: dgeNum(next) });
        }
        // The perpendicular component becomes the offset, which is
        // orthogonal to every placement on purpose.
        const px = (dx * uw) - along * vx, py = (dy * uh) - along * vy;
        if (Math.abs(px) > 0.5 || Math.abs(py) > 0.5) {
          const off = place.offset || [0, 0];
          edits.push({ attr: 'offset', value: `${dgeNum(snap(off[0] + px / uw))},${dgeNum(snap(off[1] + py / uh))}` });
        }
      }
    }
    return { edits, refusals, strain };
  }

  // A relation. The main axis is the gap; the cross axis is an alignment
  // edge if the drop lands near one, and an offset past a tolerance - unless
  // the drag has carried the element past the edge it is measured from, in
  // which case the *relation itself* is what changed.
  const main = dgeMainAxis(place);
  const mainDelta = main === 'x' ? dx : dy;
  const crossDelta = main === 'x' ? dy : dx;
  const sign = (place.dir === 'right' || place.dir === 'below') ? 1 : -1;
  const mainBlocked = main === 'x' ? xBlocked : yBlocked;
  const crossBlocked = main === 'x' ? yBlocked : xBlocked;

  // Dragging a box that sits `below b` up past b's bottom edge used to stop
  // dead at gap 0: the only thing a drag could say about a relation was how
  // far apart, never which side. So an element could be re-docked to another
  // side only by editing the text, which is the one thing this editor exists
  // to spare people. Past the edge, the direction word follows the gesture.
  //
  // The threshold is the edge itself, which gives the hysteresis for free: to
  // change sides you have to push the element right through the reference, so
  // no ordinary nudge can flip it.
  const flipped = mainDelta && !mainBlocked && !crossBlocked
    ? dgeRedock(ctx, id, place, dx, dy, snap) : null;
  if (flipped) {
    edits.push({ attr: 'place', value: flipped.text, why: flipped.why });
    return { edits, refusals, strain };
  }

  if (mainDelta && !mainBlocked) {
    const next = Math.max(0, snap(place.gap + sign * mainDelta));
    edits.push({ attr: 'gap', value: dgeNum(next) });
  }
  if (crossDelta && !crossBlocked) {
    const ref = ctx.boxes.get(place.ref);
    const b = ctx.boxes.get(id);
    const { uw, uh } = dgeUnits(ctx.model);
    const u = main === 'x' ? uh : uw;
    const words = main === 'x' ? ['top', 'middle', 'bottom'] : ['left', 'center', 'right'];
    let matched = null;
    if (ref && b) {
      // Where would each alignment word put this element's centre? Whichever
      // is within tolerance of where the pointer dropped it, wins – and that
      // is the guide that proposes the statement.
      const want = (main === 'x' ? b.y + b.h / 2 : b.x + b.w / 2) + crossDelta * u;
      const cands = main === 'x'
        ? [['top', ref.y + b.h / 2], ['middle', ref.y + ref.h / 2], ['bottom', ref.y + ref.h - b.h / 2]]
        : [['left', ref.x + b.w / 2], ['center', ref.x + ref.w / 2], ['right', ref.x + ref.w - b.w / 2]];
      for (const [word, at] of cands) {
        if (Math.abs(at - want) <= DGE_ALIGN_TOL * u) { matched = word; break; }
      }
    }
    if (matched && !free) {
      if (matched !== place.align) edits.push({ attr: 'align', value: matched, why: 'snapped to the edge' });
      // Landing on an alignment word means the offset it had on that axis is
      // no longer wanted; clearing it is what makes the snap actually snap.
      if (place.offset && (main === 'x' ? place.offset[1] : place.offset[0])) {
        edits.push({
          attr: 'offset',
          value: main === 'x' ? `${dgeNum(place.offset[0])},0` : `0,${dgeNum(place.offset[1])}`,
        });
      }
    } else {
      const off = place.offset || [0, 0];
      const nx = main === 'x' ? off[0] : snap(off[0] + crossDelta);
      const ny = main === 'x' ? snap(off[1] + crossDelta) : off[1];
      edits.push({ attr: 'offset', value: `${dgeNum(nx)},${dgeNum(ny)}` });
    }
  }
  // Held on the only axis this drag was about: nothing to write, and the
  // strain has to travel with the answer or the status bar paints a set doing
  // its job as an error.
  if (!words0(edits) && (xBlocked || yBlocked)) return { edits: [], refusals, strain };
  return { edits, refusals, strain };
}

const words0 = (a) => a.length > 0;

// Resizing. Dropping `same as` is the same reading as the tag default: a
// drag means "just this one".
function dgePlanResize(ctx, id, dw, dh, handle) {
  const el = dgeFind(id, ctx.model);
  const b = ctx.boxes.get(id);
  if (!el || !b) return { edits: [], refusals: [] };
  const { uw, uh } = dgeUnits(ctx.model);
  const edits = [];
  if (el.kind === 'dot') {
    const next = Math.max(0.02, dgeRound((b.w / 2 + dw * uw / 2) / uh, DGE_SNAP_CELL));
    edits.push({ attr: 'r', value: dgeNum(next) });
    return { edits, refusals: [] };
  }
  if (el.sameAs) {
    edits.push({ attr: 'same-as', value: '', drop: true, why: `"just this one" – drops "same as ${el.sameAs}"` });
  }
  if (handle !== 's') {
    edits.push({ attr: 'w', value: dgeNum(Math.max(0.05, dgeRound(b.w / uw + dw, DGE_SNAP_CELL))) });
  }
  if (handle !== 'e') {
    edits.push({ attr: 'h', value: dgeNum(Math.max(0.05, dgeRound(b.h / uh + dh, DGE_SNAP_CELL))) });
  }
  return { edits, refusals: [] };
}

// One edit to one splice against the text as it was at pointerdown. Kept as
// its own function because two callers need it and used to carry a copy each:
// dgeApplyEdits for a single element, dgeMoveSelection for a whole selection.
// Adding the `raw` case meant editing both, which is the reason to stop.
function dgeResolveEdits(ctx, id, edits, into) {
  for (const e of edits) {
    // An edit to somebody else's line. Leaving a shared axis rewrites the
    // align or spread statement, which is not an attribute of the element
    // being dragged and has no entry in its span table.
    if (e.raw) { into.push({ start: e.raw[0], end: e.raw[1], text: e.value }); continue; }
    const sp = ctx.spans.spanOf(id, e.attr === 'same-as' ? 'same-as' : e.attr);
    if (!sp) continue;
    if (e.drop || e.value === '') {
      // Removing an attribute means removing its keyword too, and the run of
      // whitespace in front of it – or the line grows a double space every
      // time something is dropped.
      if (!sp.present) continue;
      let start = sp.start;
      const before = ctx.source.slice(0, start);
      const m = e.attr === 'same-as'
        ? before.match(/\s+same\s+as\s+$/)
        : before.match(new RegExp('\\s+' + e.attr.replace('.', '\\.') + '\\s+$'));
      if (m) start -= m[0].length;
      into.push({ start, end: sp.end, text: '' });
      continue;
    }
    into.push({ start: sp.start, end: sp.end, text: sp.prefix + e.value + sp.suffix });
  }
  return into;
}

// Right to left, so the earlier spans keep the offsets they were measured at.
function dgeSplice(source, splices) {
  let out = source;
  for (const r of [...splices].sort((a, b) => b.start - a.start)) {
    out = out.slice(0, r.start) + r.text + out.slice(r.end);
  }
  return out;
}

// Apply a plan to the source.
function dgeApplyEdits(ctx, id, edits) {
  if (!edits.length) return ctx.source;
  return dgeSplice(ctx.source, dgeResolveEdits(ctx, id, edits, []));
}

// The align/spread statement without one of its members, written the way the
// grammar spells it. Regenerated rather than spliced: the member list is a
// comma-separated run and taking one out of the middle is not a token
// replacement. Returns null when what is left is too short to be a statement
// at all, which is the caller's signal to take the whole line away.
function dgeStatementText(owner, members) {
  const min = owner.kind === 'align' ? 2 : 3;
  if (members.length < min) return null;
  return owner.kind === 'align'
    ? `align ${owner.axis} ${owner.edge} ${members.join(', ')}`
    : `spread ${owner.axis} ${members.join(', ')}`;
}

// A statement's whole line, indentation and closing newline included, for
// when the statement itself has to go.
function dgeLineRange(src, span) {
  let a = span[0];
  while (a > 0 && src[a - 1] !== '\n') a--;
  let b = span[1];
  while (b < src.length && src[b] !== '\n') b++;
  if (b < src.length) b++;
  return [a, b];
}

// ── undo, and committing a gesture ──────────────────────────────────
// Snapshots of the whole block body, one per gesture: pointerdown captures,
// pointerup commits. Cheap for a couple of kilobytes, exact, and it cannot
// desynchronise from what will be written – which a model-level undo can.

function dgeSnapshot() {
  DGE.undo.push(DGE.source);
  if (DGE.undo.length > DGE_MAX_UNDO) DGE.undo.shift();
  DGE.redo.length = 0;
}

// Returns whether the edit stuck. A refusal rolls the source back and
// recompiles, which leaves DGE.problems empty again - so a caller that wants
// to say something about its own edit cannot tell from the state whether
// there was one, and dgeSetSlot went on to report a width it had just undone.
function dgeSetSource(next, opts) {
  if (next === DGE.source) return false;
  const before = DGE.source;
  const wasClean = !(DGE.problems && DGE.problems.length);
  const snapshotted = !opts || opts.snapshot !== false;
  if (snapshotted) dgeSnapshot();
  DGE.source = next;
  DGE.dirty = true;
  dgeRecompile();
  // A structured edit that stops the block compiling is a refusal, not a
  // state to leave anyone in. Two reasons, and the second is the serious one.
  //
  // The panel is not a text editor: every act it offers is a legal act or an
  // illegal one, so a result that does not parse means the compiler has an
  // objection the author should read, not source they now have to repair.
  //
  // And the span table is only rebuilt on a *successful* compile, so a block
  // left broken leaves DGE.spans describing text that no longer exists. Every
  // following edit is then spliced at offsets that have moved: clicking two
  // more swatches turned a tail into `{.a}.b}.c}`, and because the block never
  // compiled again the canvas never changed - the panel looked like it was
  // doing nothing while it took the source apart.
  if (wasClean && DGE.problems.length && !(opts && opts.allowBroken)) {
    const why = DGE.problems[0];
    DGE.source = before;
    if (snapshotted) DGE.undo.pop();
    dgeRecompile();
    // Say what happened before saying why, and **name no line**. The
    // compiler's sentence is about the text that was just rolled back, so a
    // line number sends the author to a line that no longer contains what the
    // message names - "line 3: box c: .shrink …" while line 3 reads
    // `box c "Empfänger" right of b gap 0.6 {.thick}`.
    dgeStatus('', 'not applied · ' + why.msg, true);
    return false;
  }
  dgeAfterEdit();
  return true;
}

// Everything a committed edit owes the world outside the canvas: the page
// itself repainted so the change survives leaving the editor, the reader's
// shelf updated, and the other window told.
function dgeAfterEdit() {
  if (!DGE.fig || (DGE.problems && DGE.problems.length)) return;
  dgeApplyToPage(DGE.fig, DGE.source);
  dgeSaveLocal();
  dgeBroadcastEdit();
}

function dgeUndo() {
  if (!DGE.undo.length) return;
  DGE.redo.push(DGE.source);
  DGE.source = DGE.undo.pop();
  DGE.dirty = true;
  dgeRecompile();
  dgeAfterEdit();
}

function dgeRedo() {
  if (!DGE.redo.length) return;
  DGE.undo.push(DGE.source);
  DGE.source = DGE.redo.pop();
  DGE.dirty = true;
  dgeRecompile();
  dgeAfterEdit();
}

// ── hit testing ─────────────────────────────────────────────────────
// Against the laid-out boxes rather than against the DOM: the boxes are what
// the compiler computed, so a click resolves to the element the *source*
// says is there. Innermost first, so a box inside a container wins.
//
// An edge is the exception, and it has to be: layoutDiagram never gives one a
// box, because an edge is not placed – it is drawn between two things that
// were. A bounding box would be the wrong shape anyway; what the author aims
// at is the line, and for a diagonal arrow the box is mostly empty paper.

// The polyline the author is looking at, read off the painted SVG. Not a
// second layout: the compiler wrote that `d` and the step runtime moved it, so
// it is by construction the geometry on screen at this beat, and on a
// pointermove a second dgFrameDrawables would re-measure every label in the
// block to learn what the DOM already knows. Coupled to dgPathD, which emits
// one M and a run of Ls and nothing else.
function dgeEdgePts(id) {
  const svg = dgeQ('#dge-art-svg');
  if (!svg) return null;
  // Scoped to the editor's own copy. The slide behind the modal holds the
  // same figure with the same prefixed ids, and getElementById would answer
  // with whichever of the two comes first in the document.
  const path = svg.querySelector('[id="' + DGE.prefix + id + '--p"]');
  const d = path && path.getAttribute('d');
  if (!d) return null;
  const nums = (d.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
  const pts = [];
  for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
  return pts.length >= 2 ? pts : null;
}

// Seven CSS pixels, in the diagram's own units, so a hairline is exactly as
// easy to hit at 4x as at 1x.
function dgeGrabTolerance(px = 7) {
  const guides = dgeQ('#dge-guides');
  const ctm = guides && guides.getScreenCTM();
  const s = ctm ? Math.hypot(ctm.a, ctm.b) : 1;
  return px / (s || 1);
}

function dgeSegDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.y - a[1]) * dy) / len2)) : 0;
  return Math.hypot(p.x - (a[0] + t * dx), p.y - (a[1] + t * dy));
}

// An arrow that is not on screen at this beat must not take a click on the
// empty paper where it will later be. The painted group carries the resolved
// number – dgOpacity writes it as an inline style and the step runtime sets
// it – so this asks the drawing rather than resolving visibility a second
// time. Boxes are deliberately not filtered this way: a hidden box still
// occupies the area you clicked, where a hidden hairline occupies nothing.
function dgeEdgeVisible(id) {
  const svg = dgeQ('#dge-art-svg');
  const g = svg && svg.querySelector('[id="' + DGE.prefix + id + '"]');
  if (!g) return true;
  return parseFloat(getComputedStyle(g).opacity || '1') > 0.02;
}

function dgeNearestEdge(pt) {
  if (!DGE.model) return null;
  let best = null, bestD = dgeGrabTolerance();
  for (const e of DGE.model.edges) {
    // A leader stub has no statement of its own – it belongs to the `text`
    // line that grew it – so there is nothing for a selection to edit.
    if (e.lead || !dgeEdgeVisible(e.id)) continue;
    const pts = dgeEdgePts(e.id);
    if (!pts) continue;
    for (let i = 1; i < pts.length; i++) {
      const d = dgeSegDist(pt, pts[i - 1], pts[i]);
      if (d < bestD) { bestD = d; best = e.id; }
    }
  }
  return best;
}

// `edges: false` is for a gesture that is choosing an edge *endpoint*. An edge
// cannot be one: layoutDiagram has no box for it, so the arrow pointed at it
// would silently not be drawn at all.
// What a click on this element should select. A `bars`, `grid` or `plot`
// expands into elements no line of the source declares, so clicking one of
// them and selecting it would hand the panel something it cannot edit - every
// drag a silent no-op. The statement is what the gesture means, so that is
// what it selects.
function dgeOwnerOf(id) {
  const el = dgeFind(id);
  return el && el.synth && el.synth !== el.id ? el.synth : id;
}

function dgeHitTest(pt, opts) {
  if (!DGE.boxes) return null;
  const hits = [];
  for (const [id, b] of DGE.boxes) {
    if (pt.x < b.x || pt.x > b.x + b.w || pt.y < b.y || pt.y > b.y + b.h) continue;
    const el = dgeFind(id);
    if (!el) continue;
    hits.push({ id: dgeOwnerOf(id), area: b.w * b.h, el });
  }
  hits.sort((a, b) => a.area - b.area);
  const box = hits[0] || null;
  if (opts && opts.edges === false) return box ? box.id : null;
  // Reading order settles the ties, because it is what the author sees: a box
  // wins over an arrow that crosses it, and an arrow wins over the container
  // or brace it runs through. Without the second half every edge inside a
  // container would be unreachable, which is most of them.
  const edge = dgeNearestEdge(pt);
  const edgeOwner = edge ? dgeOwnerOf(edge) : null;
  if (edgeOwner && (!box || box.el.kind === 'container' || box.el.kind === 'brace')) return edgeOwner;
  return box ? box.id : null;
}

// ── canvas interaction ──────────────────────────────────────────────

// A double-click on a handle cannot be recognised the two obvious ways. The
// first click ends a zero-length drag, whose gestureEnd repaints the guide
// layer - so the second click lands on a *different DOM node* carrying the
// same id, which means a dblclick listener fires on their common ancestor
// instead, and the browser resets pointerdown's own click counter to 1.
// Both looked like working controls and neither ever fired.
//
// Position and time survive the repaint, so that is what this asks.
let dgeLastTap = null;
function dgeIsSecondTap(key, ev) {
  const t = ev.timeStamp || 0;
  const again = !!dgeLastTap && dgeLastTap.key === key
    && t - dgeLastTap.t < 450
    && Math.abs(ev.clientX - dgeLastTap.x) < 6
    && Math.abs(ev.clientY - dgeLastTap.y) < 6;
  dgeLastTap = again ? null : { key, t, x: ev.clientX, y: ev.clientY };
  return again;
}

function dgeWireCanvas(canvas, guides) {
  canvas.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    const k = ev.deltaY < 0 ? 1.12 : 1 / 1.12;
    dgeZoomBy(k);
  }, { passive: false });

  canvas.addEventListener('pointerdown', (ev) => {
    if (!DGE.open || DGE.boardOpen) return;
    if (ev.button === 1 || DGE.spaceDown) return dgeStartPan(ev, canvas);
    const handle = ev.target.closest && ev.target.closest('[data-handle]');
    const pt = dgePointToDiagram(ev);
    if (handle) {
      const h = handle.dataset.handle;
      // A waypoint comes out the way it went in, at the same spot.
      if (h.startsWith('via-') && dgeIsSecondTap(handle.dataset.id + '/' + h, ev)) {
        ev.preventDefault();
        return dgeRemoveWaypoint(handle.dataset.id, Number(h.slice(4)));
      }
      if (h === 'from' || h === 'to') return dgeStartEndpoint(ev, handle.dataset.id, h);
      if (h.startsWith('via-')) return dgeStartWaypoint(ev, handle.dataset.id, Number(h.slice(4)));
      if (h.startsWith('add-')) return dgeAddWaypoint(ev, handle.dataset.id, Number(h.slice(4)));
      return dgeStartResize(ev, handle.dataset.id, h);
    }
    if (DGE.tool === 'select') {
      const hit = dgeHitTest(pt);
      if (!hit) {
        if (!ev.shiftKey) dgeSelect([]);
        return dgeStartMarquee(ev, canvas);
      }
      if (ev.shiftKey) dgeSelect(DGE.selection.includes(hit)
        ? DGE.selection.filter((x) => x !== hit) : [...DGE.selection, hit]);
      else if (!DGE.selection.includes(hit)) dgeSelect([hit]);
      return dgeStartMove(ev, pt);
    }
    if (DGE.tool === 'edge' || DGE.tool === 'line') return dgeStartEdge(ev, pt);
    return dgePlace(DGE.tool, pt);
  });
}

function dgeStartPan(ev, canvas) {
  const start = { x: ev.clientX, y: ev.clientY, px: DGE.pan.x, py: DGE.pan.y };
  canvas.classList.add('dge-panning');
  const move = (e) => {
    DGE.pan = { x: start.px + (e.clientX - start.x), y: start.py + (e.clientY - start.y) };
    dgeApplyView();
  };
  const up = () => {
    canvas.classList.remove('dge-panning');
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

// A drag is one gesture: pointerdown captures the source, pointermove
// previews the plan in the status bar and repaints, pointerup commits. The
// status bar always shows the line the editor is about to write, which is
// what makes every drag legible as a diff.
// A gesture plans against the state it started from – the source, the model,
// the boxes and the span table as they were at pointerdown – and never
// against the preview it has been painting. Re-deriving the spans from the
// *previewed* model while measuring offsets into the *base* text is how a
// 60px drag came out as `gap 8.45`: the two disagreed by however much the
// preview had already rewritten.
function dgeGestureBase() {
  if (DGE.spansFor !== DGE.source) {
    dgeStatus('', 'This block does not compile, so there is nothing to drag against – undo, or fix the line the message names.', true);
  }
  dgeInGesture = true;
  const svg = dgeQ('#dge-art-svg');
  if (svg) DGE.pinnedViewBox = svg.getAttribute('viewBox');
  return { source: DGE.source, model: DGE.model, boxes: DGE.boxes, spans: DGE.spans };
}

// Let the frame settle again once the gesture is over, and re-fit if the
// figure has outgrown it.
function dgeGestureEnd() {
  dgeInGesture = false;
  DGE.pinnedViewBox = null;
  dgeRecompile();
}

// Move everything that is selected, not just the first thing. The marquee,
// Ctrl-A, the selection rectangles and the help sheet all present a
// multi-selection as one movable unit; moving only selection[0] left the
// others behind with their outlines still drawn.
//
// Each element is planned separately against the same base, because each has
// its own placement and the §9.3 policy is per placement – one may rewrite a
// `gap`, its neighbour a nudge, and a third may refuse the axis outright.
// The splices are then applied together, right to left.
function dgeMoveSelection(ctx, dx, dy, opts) {
  let next = ctx.source;
  let first = null;
  let refusal = null;
  const parts = [];
  for (const id of DGE.selection) {
    const plan = dgePlanDrag(ctx, id, dx, dy, opts);
    if (!first) first = plan;
    if (!refusal && plan.refusals.length) refusal = plan.refusals[0];
    if (!plan.edits.length) continue;
    parts.push({ id, edits: plan.edits });
  }
  // Every element's spans are offsets into the same text, so they are
  // resolved together and spliced once. Applying one element at a time would
  // move the ground under the ones that follow.
  const splices = [];
  for (const { id, edits } of parts) dgeResolveEdits(ctx, id, edits, splices);
  next = dgeSplice(next, splices);
  return { next, plan: first, refusal };
}

function dgeStartMove(ev, pt0) {
  if (!DGE.selection.length) return;
  const id = DGE.selection[0];
  const ctx = dgeGestureBase();
  const { uw, uh } = dgeUnits(ctx.model);
  let last = null;
  const move = (e) => {
    const pt = dgePointToDiagram(e);
    const dx = (pt.x - pt0.x) / uw, dy = (pt.y - pt0.y) / uh;
    if (Math.abs(dx) < 0.005 && Math.abs(dy) < 0.005) return;
    if (DGE.beat > 0) {
      // In a beat, the same drag means something else: the element's
      // placement is the opening picture and must not move, so this writes
      // a `move` into the step instead.
      const step = dgeStepMove(ctx, id, dx, dy);
      if (!step) return;
      DGE.source = ctx.source.slice(0, step.start) + step.text + ctx.source.slice(step.end);
      last = { edits: [{ attr: 'move' }], refusals: [] };
      dgeRecompile();
      dgeStatus(step.line, `into step "${DGE.model.steps[DGE.beat - 1].name}" – the opening picture is untouched`);
      return;
    }
    const res = dgeMoveSelection(ctx, dx, dy,
      { free: e.ctrlKey || e.metaKey, leave: e.altKey });
    last = {
      edits: res.plan ? res.plan.edits : [],
      refusals: res.refusal ? [res.refusal] : [],
      soft: !!(res.plan && res.plan.strain),
    };
    // The axis an element is being held on is drawn while the drag pushes
    // against it, so "why will this not move" is answered on the canvas
    // rather than only in the status bar.
    DGE.strain = res.plan ? res.plan.strain : null;
    DGE.source = res.next;
    dgeRecompile();
    if (res.plan) dgeShowPlan(ctx, id, res.plan);
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    DGE.strain = null;
    if (DGE.source !== ctx.source) {
      const done = DGE.source;
      DGE.source = ctx.source;
      dgeSetSource(done);
    }
    dgeGestureEnd();
    if (last && last.refusals.length) dgeNote(last.refusals[0], true);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

function dgeStartResize(ev, id, handle) {
  const pt0 = dgePointToDiagram(ev);
  const ctx = dgeGestureBase();
  const { uw, uh } = dgeUnits(ctx.model);
  const move = (e) => {
    const pt = dgePointToDiagram(e);
    const plan = dgePlanResize(ctx, id, (pt.x - pt0.x) / uw, (pt.y - pt0.y) / uh, handle);
    DGE.source = dgeApplyEdits(ctx, id, plan.edits);
    dgeRecompile();
    dgeShowPlan(ctx, id, plan);
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    if (DGE.source !== ctx.source) { const done = DGE.source; DGE.source = ctx.source; dgeSetSource(done); }
    dgeGestureEnd();
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

// Retargeting an endpoint. The gesture answers with a *name* wherever it can:
// the whole value of this grammar is that an arrow stores "the right edge of
// mix" rather than a pair of numbers, and an editor that answered a drag with
// coordinates would destroy the very thing the construct exists for. A snapped
// coordinate is the fallback for empty paper, and it is a construct the
// grammar already has – `edge 2,1 -> mix`.
//
// Dropped back on the element it already names, the anchor the author wrote
// survives. Moved to a different element, it does not: `.right` was chosen
// against the old box and says nothing about where the arrow should meet the
// new one, and dgAutoAnchor picks a better one than a stale hint would.
function dgeStartEndpoint(ev, id, which) {
  const ctx = dgeGestureBase();
  const el = dgeFind(id, ctx.model);
  if (!el) { dgeGestureEnd(); return; }
  const here = el[which];
  const far = which === 'from' ? el.to : el.from;
  const pts0 = dgeEdgePts(id);
  const anchorPt = pts0 ? (which === 'from' ? pts0[pts0.length - 1] : pts0[0]) : [0, 0];
  const { uw, uh } = dgeUnits(ctx.model);
  const preview = dgeEl('line', {
    class: 'dge-snap', x1: anchorPt[0], y1: anchorPt[1], x2: anchorPt[0], y2: anchorPt[1],
  });
  dgeSnapGuides = [preview];
  dgeDrawGuides();

  const plan = (pt) => {
    const hit = dgeHitTest(pt, { edges: false });
    if (hit && !far.point && hit === far.ref) {
      return { refuse: `both ends would sit on ${hit} – an edge needs two different things to run between.` };
    }
    if (hit) {
      const keep = here.ref === hit && here.anchor;
      const value = keep
        ? hit + '.' + here.anchor + (here.frac !== 0.5 ? ':' + dgeNum(here.frac) : '')
        : hit;
      return { value, why: keep
        ? `still ${value} – the anchor you wrote survives a drag back onto the same element`
        : `${which} ${value} – the arrow re-routes whenever ${value} moves` };
    }
    const x = dgeNum(dgeRound(pt.x / uw, DGE_SNAP_CELL));
    const y = dgeNum(dgeRound(pt.y / uh, DGE_SNAP_CELL));
    return { value: `${x},${y}`, why: `${which} ${x},${y} – an endpoint in empty space, which stays put when things move` };
  };

  const move = (e) => {
    const pt = dgePointToDiagram(e);
    preview.setAttribute('x2', pt.x);
    preview.setAttribute('y2', pt.y);
    const p = plan(pt);
    if (p.refuse) { DGE.source = ctx.source; dgeRecompile(); dgeStatus('', p.refuse, true); return; }
    DGE.source = dgeApplyEdits(ctx, id, [{ attr: which, value: p.value, why: p.why }]);
    dgeRecompile();
    dgeShowPlan(ctx, id, { edits: [{ attr: which, why: p.why }], refusals: [] });
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    dgeSnapGuides = [];
    if (DGE.source !== ctx.source) { const done = DGE.source; DGE.source = ctx.source; dgeSetSource(done); }
    dgeGestureEnd();
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

// Moving a waypoint. Per axis, and the axes are decided separately, because
// `via iv.cx,d0.bottom+0.28` is half reference and half number – the x follows
// a box and the y is a measured drop below another one. That mixture is the
// normal case in a routed diagram, not an edge case.
//
// Where a component holds a reference the drag rewrites its **signed nudge**
// and never the reference. editor.md calls this out as one of the three
// constructs a graphical editor must round-trip: the nudge is one optional
// signed term with no other operators and no nesting precisely so the token to
// replace is always unambiguous. An editor that answered this drag with two
// numbers would turn a diagram that re-routes itself into one that does not.
function dgePlanWaypoint(ctx, id, k, dx, dy, free) {
  const el = dgeFind(id, ctx.model);
  const pair = el && (el.via || [])[k];
  if (!pair) return { edits: [], refusals: [] };
  const snap = (v) => (free ? v : dgeRound(v, DGE_SNAP_CELL));
  const edits = [];
  for (const [axis, i, delta] of [['x', 0, dx], ['y', 1, dy]]) {
    if (!delta) continue;
    const c = pair[i];
    if (c && c.ref) {
      const next = snap((c.nudge || 0) + delta);
      edits.push({
        attr: `via.${k}.${axis}.nudge`,
        value: next === 0 ? '' : (next > 0 ? '+' : '') + dgeNum(next),
        why: `keeps ${c.ref}.${c.prop}`,
      });
    } else {
      edits.push({ attr: `via.${k}.${axis}`, value: dgeNum(snap((c ? c.unit : 0) + delta)) });
    }
  }
  return { edits, refusals: [] };
}

function dgeStartWaypoint(ev, id, k) {
  const pt0 = dgePointToDiagram(ev);
  const ctx = dgeGestureBase();
  const { uw, uh } = dgeUnits(ctx.model);
  const move = (e) => {
    const pt = dgePointToDiagram(e);
    const plan = dgePlanWaypoint(ctx, id, k,
      (pt.x - pt0.x) / uw, (pt.y - pt0.y) / uh, e.ctrlKey || e.metaKey);
    DGE.source = dgeApplyEdits(ctx, id, plan.edits);
    dgeRecompile();
    dgeShowPlan(ctx, id, plan);
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    if (DGE.source !== ctx.source) { const done = DGE.source; DGE.source = ctx.source; dgeSetSource(done); }
    dgeGestureEnd();
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

// The whole `via` clause is rewritten for an insert or a remove, because the
// waypoints are one space-separated run and adding to the middle of it is not
// a token replacement. The coordinates that were already there are re-emitted
// verbatim from their own spans, so a reference survives an insert next to it.
function dgeViaWords(id) {
  const el = dgeFind(id);
  const out = [];
  for (let i = 0; i < (el.via || []).length; i++) {
    const sp = DGE.spans.spanOf(id, 'via.' + i);
    out.push(sp && sp.present ? sp.text : '0,0');
  }
  return out;
}

function dgeWriteVia(id, words) {
  const sp = DGE.spans.spanOf(id, 'via');
  if (!sp) return;
  const src = DGE.source;
  if (!words.length) {
    if (!sp.present) return;
    // A removed clause leaves behind the space that separated it. The span
    // starts *at* the keyword, so the drop path in dgeApplyEdits has no
    // keyword in front of it to eat; take that run of spaces here, and
    // nothing else. The first version tidied the whole block with a regex,
    // which re-indented every step body, collapsed column-aligned
    // declarations, and ate the double spaces inside quoted labels – all of
    // it written straight back into the author's source.md.
    let start = sp.start;
    while (start > 0 && (src[start - 1] === ' ' || src[start - 1] === '\t')) start--;
    dgeSetSource(src.slice(0, start) + src.slice(sp.end));
    return;
  }
  dgeSetSource(src.slice(0, sp.start) + (sp.present ? '' : sp.prefix)
    + 'via ' + words.join(' ')
    + (sp.present ? '' : sp.suffix) + src.slice(sp.end));
}

// Inserting lands the new waypoint under the pointer and hands the gesture
// straight to the move, so one press-drag-release both creates and places it.
function dgeAddWaypoint(ev, id, seg) {
  const pt = dgePointToDiagram(ev);
  const { uw, uh } = dgeUnits();
  const words = dgeViaWords(id);
  words.splice(seg, 0,
    `${dgeNum(dgeRound(pt.x / uw, DGE_SNAP_CELL))},${dgeNum(dgeRound(pt.y / uh, DGE_SNAP_CELL))}`);
  dgeWriteVia(id, words);
  if (DGE.problems && DGE.problems.length) return;
  dgeStatus('', `waypoint ${seg + 1} of ${words.length} – drag it, or double-click it to take it out again.`, false);
  dgeStartWaypoint(ev, id, seg);
}

function dgeRemoveWaypoint(id, k) {
  const words = dgeViaWords(id);
  if (k < 0 || k >= words.length) return;
  words.splice(k, 1);
  dgeWriteVia(id, words);
}

function dgeStartMarquee(ev, canvas) {
  const pt0 = dgePointToDiagram(ev);
  const rect = dgeEl('rect', { class: 'dge-snap', x: pt0.x, y: pt0.y, width: 0, height: 0 });
  dgeSnapGuides = [rect];
  dgeDrawGuides();
  const move = (e) => {
    const pt = dgePointToDiagram(e);
    rect.setAttribute('x', Math.min(pt0.x, pt.x));
    rect.setAttribute('y', Math.min(pt0.y, pt.y));
    rect.setAttribute('width', Math.abs(pt.x - pt0.x));
    rect.setAttribute('height', Math.abs(pt.y - pt0.y));
    const box = {
      x: Math.min(pt0.x, pt.x), y: Math.min(pt0.y, pt.y),
      w: Math.abs(pt.x - pt0.x), h: Math.abs(pt.y - pt0.y),
    };
    const inside = [];
    for (const [id, b] of DGE.boxes) {
      if (b.x >= box.x && b.y >= box.y && b.x + b.w <= box.x + box.w && b.y + b.h <= box.y + box.h) inside.push(id);
    }
    DGE.selection = inside;
    dgeRenderSide();
    dgeDrawGuides();
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    dgeSnapGuides = [];
    dgeDrawGuides();
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

// ── placing and wrapping (editor.md §4, §7) ─────────────────────────
// Not every tool is a placer. Excalidraw's model is: pick a tool, draw a
// shape, the shape has coordinates. Ours is: pick a tool, and the editor
// writes a *statement* – and `container over a,b,c` has nothing to draw.

function dgeFreshName(stem) {
  const taken = new Set(DGE.model ? [...DGE.model.byId.keys()] : []);
  if (!taken.has(stem)) return stem;
  for (let i = 2; i < 999; i++) if (!taken.has(stem + i)) return stem + i;
  return stem + Date.now();
}

// Creating an element does not write `at X,Y` if it can avoid it. Dropped
// roughly axis-aligned beside an existing element, within a tolerance, the
// editor proposes `right of A gap 0.6` – which is the form that survives an
// edit elsewhere in the diagram.
function dgeProposePlacement(pt) {
  const { uw, uh } = dgeUnits();
  let best = null;
  for (const [id, b] of (DGE.boxes || [])) {
    if (!DGE.model.nodes.some((n) => n.id === id)) continue;
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    const cands = [
      ['right', pt.x - (b.x + b.w), Math.abs(pt.y - cy) / uh, (pt.x - (b.x + b.w)) / uw],
      ['left', b.x - pt.x, Math.abs(pt.y - cy) / uh, (b.x - pt.x) / uw],
      ['below', pt.y - (b.y + b.h), Math.abs(pt.x - cx) / uw, (pt.y - (b.y + b.h)) / uh],
      ['above', b.y - pt.y, Math.abs(pt.x - cx) / uw, (b.y - pt.y) / uh],
    ];
    for (const [dir, along, off, gap] of cands) {
      if (along < 0 || gap > 2.2 || off > 0.55) continue;
      const score = off + Math.abs(gap) * 0.15;
      if (!best || score < best.score) {
        best = { score, text: `${dir === 'right' || dir === 'left' ? dir + ' of' : dir} ${id} gap ${dgeNum(Math.max(0, dgeRound(gap, DGE_SNAP_CELL)))}` };
      }
    }
  }
  if (best) return best.text;
  return `at ${dgeNum(dgeRound(pt.x / uw, DGE_SNAP_CELL))},${dgeNum(dgeRound(pt.y / uh, DGE_SNAP_CELL))}`;
}

function dgePlace(tool, pt) {
  const name = dgeFreshName({ box: 'b', dot: 'd', text: 't', image: 'img' }[tool] || 'e');
  const place = dgeProposePlacement(pt);
  let line;
  if (tool === 'image') {
    // Asynchronous, so the placement is captured now and used when the
    // picker resolves: `pt` is where the author clicked, not where the
    // pointer happens to be several seconds later.
    dgeOpenAssetPicker((asset) => {
      dgeAppendLine(`image ${name} ${asset.ref} ${place} w 1`);
      dgeSelect([name]);
      if (asset.note) dgeStatus('', asset.note, false);
    });
    if (!DGE.toolLocked) dgePickTool('select');
    return;
  } else {
    line = `${tool} ${name} "${tool}" ${place}`;
  }
  dgeAppendLine(line);
  dgeSelect([name]);
  if (!DGE.toolLocked) dgePickTool('select');
}

// ── the asset picker ────────────────────────────────────────────────
// `image <name> <asset>` resolves at *build* time, against assets/ beside
// source.md. A browser can read a picked file's bytes; it cannot put them
// where the next build will look. So the dialog is not the feature – what
// happens to the bytes is, and that differs by tier.
//
// Three sources, in order of how sure we are the reference will still
// resolve after the next build: assets this lecture already inlines, then
// everything in assets/ (only knowable with a watch socket), then a file
// from the machine.

const DGE_IMG_EXTS = ['svg', 'png', 'jpg', 'jpeg', 'gif', 'webp'];

function dgeOpenAssetPicker(onPick) {
  const box = dgeQ('#dge-assets');
  const list = dgeQ('#dge-assets-list');
  const note = dgeQ('#dge-assets-note');
  const inlined = DGE.fig.images || {};
  box.hidden = false;
  note.textContent = '';
  list.replaceChildren();

  const choose = (ref, extra) => { dgeCloseAssetPicker(); onPick({ ref, ...(extra || {}) }); };
  const row = (ref, sub, entry) => dgeEl('button', {
    type: 'button', class: 'dge-asset', onclick: () => choose(ref),
  }, [
    dgeAssetThumb(entry),
    dgeEl('b', { text: ref }),
    dgeEl('i', { text: sub }),
  ]);

  const seen = new Set();
  for (const ref of Object.keys(inlined)) {
    seen.add(ref);
    list.appendChild(row(ref, 'in this lecture', inlined[ref]));
  }

  // The file row is always last and always present: it is what makes an
  // empty assets/ a first step rather than a dead end.
  const file = dgeEl('input', { type: 'file', accept: DGE_IMG_EXTS.map(e => '.' + e).join(','), hidden: true });
  file.addEventListener('change', () => { if (file.files[0]) dgeTakeFile(file.files[0], choose, note); });
  list.appendChild(dgeEl('button', {
    type: 'button', class: 'dge-asset dge-asset-file', onclick: () => file.click(),
  }, [dgeEl('span', { class: 'dge-asset-blank', text: '+' }), dgeEl('b', { text: 'Choose a file…' }),
      dgeEl('i', { text: DGE_IMG_EXTS.join(' · ') })]));
  list.appendChild(file);

  const live = window.psiWatch && window.psiWatch.ready();
  if (!live) {
    note.textContent = 'Without --watch running, the editor cannot put a file into assets/. Choose one anyway and it writes the path into the figure and tells you where to copy the file.';
    return;
  }
  window.psiWatch.assets().then((res) => {
    if (!res.ok || !res.assets) return;
    const extra = res.assets.filter(a => !seen.has(a.id));
    if (!extra.length) return;
    const anchor = list.querySelector('.dge-asset-file');
    for (const a of extra) {
      list.insertBefore(row(a.id, `assets/${a.file} · ${Math.round(a.bytes / 1024)} KB`, null), anchor);
    }
  });
}

// A thumbnail out of the markup the build already emitted. The stored shape
// carries the slots the compiler fills in – an id and the geometry – so a
// preview substitutes something harmless into both and lets the outer box
// do the sizing. A file that is only on disk has no markup and gets a
// placeholder; the build is what resolves it, not the browser.
function dgeAssetThumb(entry) {
  const markup = entry && entry.markup;
  if (!markup) return dgeEl('span', { class: 'dge-asset-blank', text: '?' });
  const uid = 'dge-pick-' + (dgeAssetThumbSeq++);
  const filled = markup
    .split(DGE_ID_SLOT).join(uid)
    .split(DGE_GEO_SLOT).join('width="100%" height="100%" x="0" y="0"')
    .split(DGE_ALT_SLOT).join('');
  const host = dgeEl('span', { class: 'dge-asset-thumb' });
  host.innerHTML = filled;
  return host;
}
let dgeAssetThumbSeq = 0;

function dgeCloseAssetPicker() {
  const box = dgeQ('#dge-assets');
  if (box) box.hidden = true;
}

// A vector asset follows the theme and a raster does not. That is the trade
// the docs already make; the author should hear it while picking, not later.
const dgeAssetNote = (fileName) => (/\.svg$/i.test(fileName)
  ? 'An SVG is drawn into the page itself, so it changes colour with the A theme key.'
  : 'A raster image is embedded as it is, and keeps its own colours in every theme.');

// The gap between "the file is on disk" and "this page knows about it".
// The asset write does not rebuild, so the payload this page booted with
// still has no entry for the new reference and the in-browser compiler would
// refuse the line the editor is about to write. So register it here: enough
// for `resolveImage` to answer yes and for the layout to reserve the right
// shape. `markup` stays empty on purpose – the real thing is hundreds of
// lines of someone else's SVG and there is no re-deriving it here, so the
// canvas shows an empty slot for the second before the rebuild fills it.
function dgeRegisterPending(id, file, dataUrl) {
  return new Promise((resolve) => {
    const done = (aspect) => {
      DGE.fig.images = DGE.fig.images || {};
      DGE.fig.images[id] = { aspect: aspect || 1, markup: '', pending: true };
      resolve();
    };
    if (/\.svg$/i.test(file)) {
      // The viewBox is the only honest source of proportion for a vector.
      try {
        const svg = atob(String(dataUrl).split(',')[1] || '');
        const vb = svg.match(/viewBox\s*=\s*["']\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)/i);
        return done(vb ? Number(vb[2]) / Number(vb[1]) : 1);
      } catch (e) { return done(1); }
    }
    const probe = new Image();
    probe.onload = () => done(probe.naturalHeight / probe.naturalWidth || 1);
    probe.onerror = () => done(1);
    probe.src = dataUrl;
  });
}

function dgeTakeFile(f, choose, note) {
  const name = f.name.replace(/[^A-Za-z0-9._-]/g, '-');
  const id = name.replace(/\.[^.]+$/, '');
  const reader = new FileReader();
  reader.onload = () => {
    const b64 = String(reader.result).split(',')[1] || '';
    const live = window.psiWatch && window.psiWatch.ready();
    if (!live) {
      // The grammar takes a path as well as an id, so the line the editor
      // writes is already correct – it just needs the file to arrive.
      choose(`assets/${name}`, { note: `Copy ${f.name} into assets/ beside source.md; the line is already written. ` + dgeAssetNote(name) });
      return;
    }
    note.textContent = 'Writing ' + name + '…';
    window.psiWatch.putAsset(name, b64, false).then((res) => {
      if (res.ok && res.unchanged) {
        // Already there, byte for byte. Nothing was written; the reference
        // is simply one the build can already resolve.
        return dgeRegisterPending(id, name, String(reader.result))
          .then(() => choose(id, { note: dgeAssetNote(name) }));
      }
      if (!res.ok && res.exists) {
        note.textContent = res.why;
        note.appendChild(dgeEl('button', {
          type: 'button', class: 'dge-btn', text: 'Replace it',
          onclick: () => window.psiWatch.putAsset(name, b64, true).then((r2) => {
            if (!r2.ok) { note.textContent = r2.why; return; }
            dgeRegisterPending(id, name, String(reader.result))
              .then(() => choose(id, { note: dgeAssetNote(name) + ' It appears on the next build.' }));
          }),
        }));
        return;
      }
      if (!res.ok) { note.textContent = res.why; return; }
      // The asset write does not rebuild – fs.watch is on source.md. The
      // patch that adds this line is what kicks the build, and by then the
      // file is on disk. Hence: write first, place second, never the other
      // way round.
      dgeRegisterPending(id, name, String(reader.result)).then(() => {
        choose(id, { note: dgeAssetNote(name) + ' It appears on the next build.' });
      });
    });
  };
  reader.readAsDataURL(f);
}

// A new statement goes after the last definition rather than at the end of
// the block: `step` blocks are the tail of the file, and a definition after
// the first step ends step mode – appending there would silently swallow
// every step that followed.
function dgeAppendLine(line) {
  const lines = DGE.source.split('\n');
  let at = lines.length;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/^\s*step\b/.test(lines[i])) at = i;
  }
  lines.splice(at, 0, line);
  dgeSetSource(lines.join('\n'));
  dgeStatus(line, 'written');
}

function dgeStartEdge(ev, pt0) {
  // An endpoint is chosen with edges excluded, and it has to be: layoutDiagram
  // gives an edge no box, so `edge feed0 -> x0` compiles, passes referential
  // integrity, and then draws nothing at all. The arrow simply is not there.
  const fromId = dgeHitTest(pt0, { edges: false });
  const preview = dgeEl('line', { class: 'dge-snap', x1: pt0.x, y1: pt0.y, x2: pt0.x, y2: pt0.y });
  dgeSnapGuides = [preview];
  dgeDrawGuides();
  const { uw, uh } = dgeUnits();
  const move = (e) => {
    const pt = dgePointToDiagram(e);
    preview.setAttribute('x2', pt.x);
    preview.setAttribute('y2', pt.y);
    const toId = dgeHitTest(pt, { edges: false });
    const a = DGE.tool === 'line' || !fromId
      ? `${dgeNum(dgeRound(pt0.x / uw, DGE_SNAP_CELL))},${dgeNum(dgeRound(pt0.y / uh, DGE_SNAP_CELL))}` : fromId;
    const b = DGE.tool === 'line' || !toId
      ? `${dgeNum(dgeRound(pt.x / uw, DGE_SNAP_CELL))},${dgeNum(dgeRound(pt.y / uh, DGE_SNAP_CELL))}` : toId;
    dgeStatus(`edge ${a} ${DGE.tool === 'line' ? '--' : '->'} ${b}`, DGE.tool === 'line'
      ? 'a plain line: both endpoints are coordinates, so it does not snap to a box'
      : (fromId && toId ? 'an arrow between two elements – it re-routes when either moves' : 'an endpoint in empty space'));
  };
  const up = (e) => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    dgeSnapGuides = [];
    const pt = dgePointToDiagram(e);
    const toId = dgeHitTest(pt, { edges: false });
    const a = DGE.tool === 'line' || !fromId
      ? `${dgeNum(dgeRound(pt0.x / uw, DGE_SNAP_CELL))},${dgeNum(dgeRound(pt0.y / uh, DGE_SNAP_CELL))}` : fromId;
    const b = DGE.tool === 'line' || !toId
      ? `${dgeNum(dgeRound(pt.x / uw, DGE_SNAP_CELL))},${dgeNum(dgeRound(pt.y / uh, DGE_SNAP_CELL))}` : toId;
    if (a === b) { dgeDrawGuides(); return; }
    dgeAppendLine(`edge ${a} ${DGE.tool === 'line' ? '--' : '->'} ${b}`);
    if (!DGE.toolLocked) dgePickTool('select');
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

// Wrappers act on what is already selected, because that is what their
// statements mean. Select three boxes, press 6, get an outline around them –
// a better gesture than drawing a rectangle and hoping it contains the right
// things, and the only one that can produce the statement the grammar has.
function dgeWrap(kind) {
  if (DGE.selection.length < 1) {
    dgeStatus('', `${kind} goes over a selection – select the elements first, then press ${kind === 'container' ? '6' : '7'}.`, true);
    return;
  }
  const name = dgeFreshName(kind === 'container' ? 'grp' : 'br');
  const members = DGE.selection.join(',');
  dgeAppendLine(kind === 'container'
    ? `container ${name} over ${members}`
    : `brace ${name} over ${members} right ""`);
  dgeSelect([name]);
}

// align / spread are selection acts too, and the first element selected is
// the master – which is exactly what the statement means, so the UI teaches
// the semantics for free.
function dgeAlign(axis, edge) {
  if (DGE.selection.length < 2) {
    dgeStatus('', 'align takes at least two elements: the first one you select keeps its place, and the rest line up on it.', true);
    return;
  }
  dgeAppendLine(`align ${axis} ${edge} ${DGE.selection.join(', ')}`);
}

function dgeSpread(axis) {
  if (DGE.selection.length < 3) {
    dgeStatus('', 'spread needs at least three: the first and last stay put and the rest are distributed between them.', true);
    return;
  }
  dgeAppendLine(`spread ${axis} ${DGE.selection.join(', ')}`);
}

// Deleting lists what else refers to the element rather than leaving a block
// that will not compile.
function dgeDelete() {
  if (!DGE.selection.length) return;
  // Lines that name something being deleted, *excluding* the statements of
  // the other elements in the same selection – deleting a and b together
  // should not report b's own line as a reason not to delete a.
  const refs = [];
  const seenLines = new Set();
  for (const el of DGE.selection.map((x) => dgeFind(x))) if (el) seenLines.add(el.line);
  for (const id of DGE.selection) {
    for (const r of DGE.spans.referencesTo(id)) {
      if (r.from && DGE.selection.includes(r.from)) continue;
      if (seenLines.has(r.line)) continue;
      refs.push(`line ${r.line}: ${r.what}`);
    }
  }
  const what = DGE.selection.join(', ');
  if (refs.length && !window.confirm(
    `Delete ${what}?\n\n${refs.length} other line(s) name ${DGE.selection.length > 1 ? 'them' : 'it'}:\n`
    + refs.slice(0, 8).join('\n')
    + (refs.length > 8 ? `\n… and ${refs.length - 8} more` : '')
    + '\n\nDeleting only these lines leaves the block unable to compile; the lines above have to go too.\n\n'
    + 'OK deletes the element and every line that names it.')) return;
  // Delete the statements themselves and every line that names them, which
  // is what keeps the block compiling.
  const doomed = new Set();
  for (const id of DGE.selection) {
    const el = dgeFind(id);
    if (el && el.span) doomed.add(el.line);
    for (const r of DGE.spans.referencesTo(id)) doomed.add(r.line);
  }
  const lines = DGE.source.split('\n').filter((_, i) => !doomed.has(i + 1));
  const alsoGone = Math.max(0, doomed.size - seenLines.size);
  dgeSetSource(lines.join('\n'));
  dgeSelect([]);
  dgeStatus('', alsoGone
    ? `deleted ${what} and ${alsoGone} line(s) that named ${DGE.selection.length > 1 ? 'them' : 'it'}`
    : `deleted ${what}`);
}

function dgeDuplicate() {
  if (DGE.selection.length !== 1) return;
  const el = dgeFind(DGE.selection[0]);
  if (!el || !el.span) return;
  const line = DGE.source.slice(el.span[0], el.span[1]);
  const name = dgeFreshName(el.id);
  // Rename only the element's own name token – the second word of the
  // statement – so every reference inside the line survives.
  const toks = window.PSI_DG.dgTokenize(line, 0);
  if (!toks[1]) return;
  const renamed = line.slice(0, toks[1].s) + name + line.slice(toks[1].e);
  const placed = /\b(at|right of|left of|below|above|between)\b/.test(renamed)
    ? renamed : renamed + ' right of ' + el.id + ' gap 0.3';
  dgeAppendLine(placed);
  dgeSelect([name]);
}

// ── the sidebar ─────────────────────────────────────────────────────
// The *selection*: the closed class vocabulary as swatches, the geometry
// options that kind actually accepts, the label, the tags, and an element
// list that doubles as the "what refers to what" view. Distinct from the
// toolbar, which is acts and is transient.

function dgeSelect(ids) {
  DGE.selection = ids.slice();
  dgeRenderSide();
  dgeDrawGuides();
  dgeRenderTools();
}

function dgeRenderSide() {
  const side = dgeQ('#dge-side');
  if (!side || !DGE.model) return;
  side.replaceChildren();

  if (!DGE.selection.length) {
    side.appendChild(dgeEl('div', { class: 'dge-empty', html:
      'Nothing selected.<br><br>Click an element to see what holds it in place – '
      + 'the relations it was written with are drawn on the canvas.<br><br>'
      + 'Pick a tool on the left to add one, or select two elements and use the '
      + '&ldquo;line them up&rdquo; buttons below.' }));
    side.appendChild(dgeTagLegend());
    side.appendChild(dgeElementList());
    side.appendChild(dgeSourcePane());
    return;
  }

  const single = DGE.selection.length === 1 ? dgeFind(DGE.selection[0]) : null;

  const head = dgeEl('div', {}, [
    dgeEl('h3', { text: single ? `${single.kind} ${single.id}` : `${DGE.selection.length} selected` }),
  ]);
  side.appendChild(head);

  if (single) {
    // A label is multi-line. The tokenizer decodes \\n inside a quoted string
    // to a real line break and the drawing typesets one line per break, so a
    // single-line input could show the text but never type it. The textarea
    // holds the *decoded* string – which is what spanOf hands back for a
    // quoted token – and dgeQuote re-encodes it on the way to the source.
    //
    // Edges carry one too. Leaving them out of this field was a hole: the
    // grammar has always read `edge a -> b "why"`, the compiler lays the text
    // out along the line, and the only thing missing was the control.
    const sp = DGE.spans.spanOf(single.id, 'label');
    const input = dgeEl('textarea', {
      rows: 2, text: sp && sp.present ? sp.value : '',
      placeholder: 'label',
      onchange: (e) => dgeWriteAttr(single.id, 'label', e.target.value, true),
    });
    side.appendChild(dgeEl('div', {}, [
      dgeEl('h3', { text: 'label' }), input,
      dgeEl('div', { class: 'dge-hint', text: 'Enter breaks the line · ⌘S applies and writes back' }),
    ]));
  }

  // What an edge runs between. This is the one thing in the grammar that names
  // *other elements*, so the panel offers the names rather than coordinates,
  // and says what a name buys – an arrow written against a box follows it.
  if (single && single.kind === 'edge') {
    const row = dgeEl('div', { class: 'dge-nums' });
    for (const which of ['from', 'to']) {
      const sp = DGE.spans.spanOf(single.id, which);
      row.appendChild(dgeEl('label', { class: 'dge-num' }, [
        dgeEl('span', { text: which }),
        dgeEl('input', {
          type: 'text', value: sp && sp.present ? sp.value : '',
          placeholder: 'name or x,y',
          onchange: (e) => {
            const v = e.target.value.trim();
            // Not the same as clearing an option. dgeWriteAttr's drop path
            // would take the token out and leave "edge  -> b", which does not
            // parse, and there is no keyword in front of an endpoint for it
            // to eat either. Refuse, and put the field back.
            if (!v) {
              dgeStatus('', 'An edge needs something at both ends – an element name, or a coordinate like 1.5,2.', true);
              dgeRenderSide();
              return;
            }
            dgeWriteAttr(single.id, which, v);
          },
        }),
      ]));
    }
    const swap = dgeEl('button', {
      type: 'button', class: 'dge-btn', text: 'Swap ends',
      title: 'point the arrow the other way',
      onclick: () => dgeSwapEnds(single.id),
    });
    side.appendChild(dgeEl('div', {}, [
      dgeEl('h3', { text: 'ends' }), row,
      dgeEl('div', { class: 'dge-chips' }, [swap]),
      dgeEl('div', { class: 'dge-hint', text:
        'A name follows the element when it moves; x,y stays put. '
        + 'Add an anchor with a dot – mix.right – and a fraction along it with a colon – mix.right:0.3.' }),
    ]));

    // Waypoints. Listed rather than only draggable, because how many there are
    // and which of them holds a reference is not readable off the picture: a
    // waypoint written iv.cx,d0.bottom+0.28 and one written 1.4,2.06 land in
    // exactly the same place and behave completely differently afterwards.
    const via = single.via || [];
    const wrap = dgeEl('div', {});
    wrap.appendChild(dgeEl('h3', { text: 'waypoints' }));
    if (!via.length) {
      wrap.appendChild(dgeEl('div', { class: 'dge-hint', text:
        'None – the arrow runs straight. Drag one of the hollow dots on the line to bend it.' }));
    } else {
      const list = dgeEl('div', { class: 'dge-chips' });
      via.forEach((pair, k) => {
        const sp = DGE.spans.spanOf(single.id, 'via.' + k);
        const held = pair.some((c) => c && c.ref);
        list.appendChild(dgeEl('button', {
          type: 'button', class: 'dge-chip' + (held ? ' dge-chip-held' : ''),
          html: (sp && sp.present ? sp.text : '?') + '<span class="dge-x">×</span>',
          title: held ? 'follows another element – dragging shifts it a little and keeps the reference. Click to remove.'
            : 'a plain coordinate. Click to remove.',
          onclick: () => dgeRemoveWaypoint(single.id, k),
        }));
      });
      wrap.appendChild(list);
      wrap.appendChild(dgeEl('div', { class: 'dge-hint', text:
        'Drag a square on the line to move one, a hollow dot to add one, double-click a square to remove it.' }));
    }
    side.appendChild(wrap);
  }

  // Where it sits, as the three things a placement actually says: which kind
  // of relation, what it is measured from, and how far. A drag can say how
  // far and, since it learned to re-dock, which side - but which *element*
  // and which *kind* were only ever reachable by editing the text, and they
  // are the parts that carry the meaning. `between a,b` in particular has no
  // gesture at all: nothing about dragging one box says "halfway between
  // those two".
  if (single && DGE.model.nodes.some((x) => x.id === single.id)) {
    side.appendChild(dgePlacementPane(single));
  }

  // Geometry: exactly the options that kind's own statement accepts.
  if (single) {
    const opts = dgeKindOpts(single.kind);
    if (opts.length) {
      const row = dgeEl('div', { class: 'dge-nums' });
      for (const key of opts) {
        const span = DGE.spans.spanOf(single.id, key);
        const resolved = dgeResolve(single, key);
        row.appendChild(dgeEl('label', { class: 'dge-num' }, [
          dgeEl('span', { text: key }),
          dgeEl('input', {
            type: 'text',
            value: span && span.present ? span.value : '',
            placeholder: resolved.value === null ? 'auto' : dgeNum(resolved.value),
            onchange: (e) => dgeWriteAttr(single.id, key, e.target.value.trim()),
          }),
        ]));
      }
      side.appendChild(dgeEl('div', {}, [dgeEl('h3', { text: 'size' }), row,
        dgeProvenance(single, opts)]));
    }
  }

  // The closed class vocabulary, one row per slot.
  const slots = dgeEl('div', {});
  slots.appendChild(dgeEl('h3', { text: 'look' }));
  const kinds = new Set(DGE.selection.map((id) => (dgeFind(id) || {}).kind));
  for (const slot of DGE_SLOTS) {
    if (slot.kinds && ![...kinds].some((k) => slot.kinds.includes(k))) continue;
    const current = dgeSlotValue(slot);
    const row = dgeEl('div', { class: 'dge-swatches' });
    for (const opt of slot.options) {
      row.appendChild(dgeEl('button', {
        type: 'button', class: 'dge-sw',
        'data-fill': opt.fill === undefined ? null : (opt.fill || 'none'),
        'aria-pressed': String(current === opt.cls),
        title: opt.cls ? '.' + opt.cls : 'none of this slot',
        text: opt.fill !== undefined ? '' : (opt.label || opt.cls),
        onclick: () => dgeSetSlot(slot, opt.cls),
      }));
    }
    slots.appendChild(dgeEl('div', { class: 'dge-slot' }, [
      dgeEl('b', { text: slot.label }), row,
    ]));
  }
  side.appendChild(slots);

  // Tags. Membership is the one piece of structure that is completely
  // invisible in the drawing, so it is a first-class control here.
  const chips = dgeEl('div', { class: 'dge-chips' });
  const mine = new Set();
  for (const id of DGE.selection) for (const t of (dgeFind(id) || {}).tags || []) mine.add(t);
  for (const t of mine) {
    chips.appendChild(dgeEl('button', {
      type: 'button', class: 'dge-chip', html: '@' + t + '<span class="dge-x">×</span>',
      title: 'remove @' + t + ' from the selection',
      onmouseenter: () => { DGE.hoverTag = t; dgeDrawGuides(); },
      onmouseleave: () => { DGE.hoverTag = null; dgeDrawGuides(); },
      onclick: () => dgeToggleTag(t, false),
    }));
  }
  chips.appendChild(dgeEl('button', {
    type: 'button', class: 'dge-chip', text: '+ tag',
    onclick: () => {
      const name = window.prompt('Add a tag to the selection (letters, digits, _ and -):');
      if (name && /^[A-Za-z_][\w-]*$/.test(name)) dgeToggleTag(name, true);
    },
  }));
  side.appendChild(dgeEl('div', {}, [dgeEl('h3', { text: 'tags' }), chips]));

  // Alignment acts, on the selection, with the master named.
  if (DGE.selection.length >= 2) {
    const acts = dgeEl('div', { class: 'dge-chips' });
    for (const [axis, edge] of [['x', 'left'], ['x', 'center'], ['x', 'right'],
      ['y', 'top'], ['y', 'middle'], ['y', 'bottom']]) {
      acts.appendChild(dgeEl('button', {
        type: 'button', class: 'dge-btn', text: `${axis} ${edge}`,
        title: `align ${axis} ${edge} – ${DGE.selection[0]} is the master and keeps its place`,
        onclick: () => dgeAlign(axis, edge),
      }));
    }
    if (DGE.selection.length >= 3) {
      for (const axis of ['x', 'y']) {
        acts.appendChild(dgeEl('button', {
          type: 'button', class: 'dge-btn', text: 'spread ' + axis,
          onclick: () => dgeSpread(axis),
        }));
      }
    }
    side.appendChild(dgeEl('div', {}, [
      dgeEl('h3', { text: 'line them up' }),
      dgeEl('div', { class: 'dge-empty', text: `${DGE.selection[0]} is the master – it keeps its place and the rest follow.` }),
      acts,
    ]));
  }

  side.appendChild(dgeTagLegend());
  side.appendChild(dgeElementList());
  side.appendChild(dgeSourcePane());
}

// Which class of a slot the selection carries. Mixed selections show none
// pressed rather than lying about a shared value.
function dgeSlotValue(slot) {
  const names = slot.options.map((o) => o.cls).filter(Boolean);
  let found;
  for (const id of DGE.selection) {
    const el = dgeFind(id);
    if (!el) continue;
    const hit = (el.classes || []).find((c) => names.includes(c)) || '';
    if (found === undefined) found = hit;
    else if (found !== hit) return null;
  }
  return found === undefined ? null : found;
}

function dgeSetSlot(slot, cls) {
  const names = slot.options.map((o) => o.cls).filter(Boolean);
  const splices = [];
  const widened = [];
  for (const id of DGE.selection) {
    const el = dgeFind(id);
    if (!el) continue;
    const keep = (el.classes || []).filter((c) => !names.includes(c));
    if (cls) keep.push(cls);
    if (cls === 'fit' || cls === 'shrink') {
      const w = dgePlanFitWidth(id);
      if (w) { splices.push(w); widened.push(id + ' w ' + w.value); }
    }
    const tail = dgePlanTail(id, { classes: keep });
    if (tail) splices.push({ ...tail, seq: 1 });
  }
  const next = dgeApplySplices(splices);
  if (next === null) return;
  const applied = dgeSetSource(next);
  // Only if it stuck. A rolled-back edit leaves no problems behind, so the
  // old guard passed and the author was told the editor had written a width
  // that is not in the source - the opposite of what happened, on top of the
  // compiler's own refusal.
  if (applied && widened.length) {
    dgeStatus('', 'wrote ' + widened.join(', ') + ' as well – .' + cls
      + ' fits the type to the box, so the box has to say how wide it is.', false);
  }
}

function dgeToggleTag(tag, add) {
  const next = dgeApplySplices(DGE.selection.map((id) => {
    const el = dgeFind(id);
    if (!el) return null;
    const tags = new Set(el.tags || []);
    if (add) tags.add(tag); else tags.delete(tag);
    return dgePlanTail(id, { tags: [...tags] });
  }));
  if (next !== null) dgeSetSource(next);
}

// `.fit` and `.shrink` size the type to the box, so the compiler requires the
// box to be given - `w n` or `same as X` - and refuses otherwise. That error
// is written for someone typing text, who would have to invent a number. In
// the editor the box is on screen and its width is already known, so the only
// sensible reading of the click is "fit the type to this box, the size it is
// now". Writing that width is what makes the swatch a control rather than a
// thing that beeps at you.
function dgePlanFitWidth(id) {
  const el = dgeFind(id);
  const b = DGE.boxes.get(id);
  if (!el || !b) return null;
  if (el.w != null || el.sameAs) return null;
  // Only where a width is an option at all: a dot is sized by `r`, and
  // writing `w` on one would be a different kind of no-op.
  if (!dgeKindOpts(el.kind).includes('w')) return null;
  const sp = DGE.spans.spanOf(id, 'w');
  if (!sp || sp.present) return null;
  const { uw } = dgeUnits();
  const value = dgeNum(dgeRound(b.w / uw, DGE_SNAP_CELL));
  return { start: sp.start, end: sp.end, text: sp.prefix + value + sp.suffix, seq: 0, value };
}

// The attribute tail is one token and the order inside it is free, so the
// editor rebuilds it from the model rather than splicing into the middle of
// it. That is what guarantees the result parses.
function dgePlanTail(id, changes) {
  const el = dgeFind(id);
  if (!el) return null;
  const isEdge = el.kind === 'edge';
  const parts = [];
  const wantId = changes.id !== undefined ? changes.id : (isEdge && !/^edge-\d+$/.test(el.id) ? el.id : null);
  if (wantId) parts.push('#' + wantId);
  for (const c of (changes.classes !== undefined ? changes.classes : el.classes || [])) parts.push('.' + c);
  for (const t of (changes.tags !== undefined ? changes.tags : el.tags || [])) parts.push('@' + t);
  const sp = DGE.spans.spanOf(id, 'classes');
  if (!sp) return null;
  if (!parts.length) {
    if (!sp.present) return null;
    // Removing the tail takes the whitespace in front of it, or the line
    // grows a double space every time the last class comes off.
    let start = sp.start;
    const m = DGE.source.slice(0, start).match(/\s+$/);
    if (m) start -= m[0].length;
    return { start, end: sp.end, text: '' };
  }
  // The braces are the caller's to write. An absent tail carries them in the
  // span's prefix and suffix; a *present* one has empty affixes and a span
  // that covers `{...}` while its value is only what is between them - so
  // writing the value back over the span drops them, and the second click on
  // any swatch turned `{.dashed}` into a bare `.dashed .dim`. That does not
  // parse, so the block kept its last good compile and the panel looked like
  // it was doing nothing at all while it corrupted the source underneath.
  const open = sp.present ? '{' : sp.prefix;
  const close = sp.present ? '}' : sp.suffix;
  return { start: sp.start, end: sp.end, text: open + parts.join(' ') + close };
}

// Splice a set of edits computed against the *current* source in one pass,
// right to left so the earlier ones keep their offsets. Returns the text
// rather than installing it, so every structured write lands through
// dgeSetSource and gets the refusal check with it.
//
// This is why dgePlanTail plans rather than writes. A swatch click or a tag
// change acts on the whole selection, and every span is an offset into the
// source as it was: writing them one at a time moves the ground under the
// ones that follow, and the second element's tail lands somewhere in the
// middle of its own placement – or inside its quoted label, where it still
// compiles and the corruption is silent all the way to source.md.
function dgeApplySplices(list) {
  // Descending by position, and `seq` breaks a tie. Two insertions can share
  // an offset - a width and an attribute tail both go at the end of a line
  // that has neither - and applying right to left means the one applied
  // *first* ends up last in the text. Without the tie-break that order came
  // from Array.sort's stability, which is not something to rest an edit on.
  const out = list.filter(Boolean)
    .sort((a, b) => (b.start - a.start) || ((b.seq || 0) - (a.seq || 0)));
  if (!out.length) return null;
  let next = DGE.source;
  for (const r of out) next = next.slice(0, r.start) + r.text + next.slice(r.end);
  return next;
}

// A label as the DSL spells it. dgTokenize decodes a backslash escape and
// turns `\n` into a newline, so a label typed with a quote or a line break
// has to go back the same way or the statement ends mid-word.
// Swap by exchanging the two endpoint tokens rather than by flipping the
// arrow. Flipping reads smaller in the diff, but `--` has no direction to
// flip and the edit would silently do nothing there – the failure this DSL
// keeps closing. Exchanging the names means the same thing for all three.
function dgeSwapEnds(id) {
  const a = DGE.spans.spanOf(id, 'from');
  const b = DGE.spans.spanOf(id, 'to');
  if (!a || !b || !a.present || !b.present) return;
  const first = a.start < b.start ? a : b;
  const second = first === a ? b : a;
  const firstVal = first === a ? b.text : a.text;
  const secondVal = second === a ? b.text : a.text;
  const src = DGE.source;
  dgeSetSource(src.slice(0, first.start) + firstVal
    + src.slice(first.end, second.start) + secondVal + src.slice(second.end));
}

function dgeQuote(v) {
  return String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

function dgeWriteAttr(id, attr, value, quoted) {
  const sp = DGE.spans.spanOf(id, attr);
  if (!sp) {
    dgeStatus('', `${attr} cannot be written on ${id} here – give it a placement first.`, true);
    return;
  }
  let next;
  if (!value && sp.present && attr !== 'label') {
    let start = sp.start;
    const m = DGE.source.slice(0, start).match(new RegExp('\\s+' + attr + '\\s+$'));
    if (m) start -= m[0].length;
    next = DGE.source.slice(0, start) + DGE.source.slice(sp.end);
  } else {
    // An absent attribute's span carries the quotes in its prefix and suffix
    // – ' "' and '"' for a label – so quoting the value as well emits
    // `box a ""Hi""`, which parses as an empty label followed by two junk
    // tokens. Only a *present* span needs them, because there the span
    // covers the quotes that are already written.
    const body = quoted ? dgeQuote(value) : value;
    const text = sp.present && quoted ? '"' + body + '"' : body;
    next = DGE.source.slice(0, sp.start)
      + (sp.present ? '' : sp.prefix) + text + (sp.present ? '' : sp.suffix)
      + DGE.source.slice(sp.end);
  }
  // Through the one door, like every other structured write. These are the
  // panel's text fields – the label, the geometry, an edge's endpoints – and
  // an endpoint typed as a name that does not exist is the easiest way there
  // is to stop a block compiling. Left standing, that also leaves the span
  // table describing text that is gone, and the next edit splices at offsets
  // that have moved.
  dgeSetSource(next);
}

// Which of the five layers a resolved value came from. Without it, four
// layers is a guessing game – and the safe answer to changing one is still
// "write it on the element", with promoting one click away.
function dgeResolve(el, key) {
  if (el[key] != null) return { value: el[key], from: 'this element' };
  const layers = window.PSI_DG.dgDefaultLayers(DGE.model, el.kind, el.tags).reverse();
  for (const d of layers) {
    if (d[key] == null) continue;
    const lecture = (DGE.model.baseTagDefaults || []).includes(d)
      || Object.values(DGE.model.baseDefaults || {}).includes(d);
    return {
      value: d[key],
      from: (lecture ? 'the lecture defaults' : 'this block') + (d.tag ? ` · default ${d.kind} @${d.tag}` : ` · default ${d.kind}`),
    };
  }
  return { value: null, from: null };
}

function dgeProvenance(el, keys) {
  const rows = dgeEl('div', {});
  for (const key of keys) {
    const r = dgeResolve(el, key);
    if (r.value === null || r.from === 'this element') continue;
    rows.appendChild(dgeEl('div', {
      class: 'dge-from dge-inherited',
      text: `${key} ${dgeNum(r.value)} · from ${r.from}`,
    }));
  }
  return rows;
}

// A legend of every tag in the figure with its member count. Hover
// highlights the members, click selects them – §9.1's principle applied to
// membership rather than to geometry.
function dgeTagLegend() {
  const wrap = dgeEl('div', {});
  const tags = DGE.model ? [...DGE.model.tags.entries()] : [];
  if (!tags.length) return wrap;
  wrap.appendChild(dgeEl('h3', { text: 'tags in this figure' }));
  const chips = dgeEl('div', { class: 'dge-chips' });
  for (const [tag, members] of tags) {
    chips.appendChild(dgeEl('button', {
      type: 'button', class: 'dge-chip',
      html: '@' + tag + '<span class="dge-chip-count">' + members.length + '</span>',
      title: 'select the ' + members.length + ' element(s) carrying @' + tag,
      onmouseenter: () => { DGE.hoverTag = tag; dgeDrawGuides(); },
      onmouseleave: () => { DGE.hoverTag = null; dgeDrawGuides(); },
      onclick: () => dgeSelect(members.slice()),
    }));
  }
  wrap.appendChild(chips);
  return wrap;
}

// The placement, as three answers rather than one opaque phrase.
function dgePlacementPane(el) {
  const wrap = dgeEl('div', {});
  wrap.appendChild(dgeEl('h3', { text: 'placement' }));
  const p = el.place;
  const { uw, uh } = dgeUnits();
  const b = DGE.boxes.get(el.id);
  const others = [...DGE.model.nodes, ...DGE.model.containers, ...DGE.model.braces]
    .map((x) => x.id).filter((x) => x !== el.id);
  const write = (text, why) => {
    dgeWriteAttr(el.id, 'place', text);
    if (why && !(DGE.problems && DGE.problems.length)) dgeStatus('', why, false);
  };
  const here = () => (b
    ? `${dgeNum(dgeRound((b.x + b.w / 2) / uw, DGE_SNAP_CELL))},${dgeNum(dgeRound((b.y + b.h / 2) / uh, DGE_SNAP_CELL))}`
    : '0,0');

  // The first element of a block sits at the origin for free and has no
  // placement in the source at all, so there is no span to rewrite until one
  // is written out. spanOf says so; the pane offers to do it.
  if (!p || p.implicit) {
    wrap.appendChild(dgeEl('div', { class: 'dge-hint', text:
      'This element has no placement of its own – it sits where the block starts. '
      + 'Give it one to say where it belongs.' }));
    wrap.appendChild(dgeEl('div', { class: 'dge-chips' }, [
      dgeEl('button', { type: 'button', class: 'dge-btn', text: 'at ' + here(),
        onclick: () => write('at ' + here(), 'writes the placement out') }),
      others.length ? dgeEl('button', { type: 'button', class: 'dge-btn', text: 'beside ' + others[0],
        onclick: () => write(dgePlaceText('right', others[0], 0.6)) }) : null,
    ]));
    return wrap;
  }

  const kinds = dgeEl('div', { class: 'dge-chips' });
  const kindOf = p.kind === 'rel' ? 'beside' : p.kind === 'between' ? 'between' : 'at';
  for (const [key, label] of [['at', 'at x,y'], ['beside', 'beside'], ['between', 'between two']]) {
    kinds.appendChild(dgeEl('button', {
      type: 'button', class: 'dge-sw', 'aria-pressed': String(key === kindOf),
      text: label,
      title: key === 'at' ? 'a coordinate – it stays put when anything else moves'
        : key === 'beside' ? 'measured from one element, so it follows when that element moves'
          : 'halfway between two elements, and it stays halfway',
      onclick: () => {
        if (key === kindOf) return;
        if (key === 'at') return write('at ' + here());
        if (key === 'beside') {
          const ref = (p.kind === 'between' && p.refs[0] && p.refs[0].ref) || others[0];
          if (ref) write(dgePlaceText('right', ref, 0.6));
          return;
        }
        const a = p.kind === 'rel' ? p.ref : others[0];
        const rest = others.filter((x) => x !== a);
        if (a && rest.length) write(`between ${a},${rest[0]}`);
        else dgeStatus('', 'between needs two other elements to sit halfway along.', true);
      },
    }));
  }
  wrap.appendChild(dgeEl('div', { class: 'dge-slot' }, [dgeEl('b', { text: 'kind' }), kinds]));

  if (p.kind === 'rel') {
    const dirs = dgeEl('div', { class: 'dge-chips' });
    for (const d of DGE_DIRS) {
      dirs.appendChild(dgeEl('button', {
        type: 'button', class: 'dge-sw', 'aria-pressed': String(d === p.dir),
        text: d === 'right' || d === 'left' ? d + ' of' : d,
        title: 'dock it ' + d + ' of ' + p.ref + ' – dragging it past that edge does the same',
        onclick: () => { if (d !== p.dir) write(dgePlaceText(d, p.ref, p.gap)); },
      }));
    }
    wrap.appendChild(dgeEl('div', { class: 'dge-slot' }, [dgeEl('b', { text: 'side' }), dirs]));
    const row = dgeEl('div', { class: 'dge-nums' }, [
      dgeEl('label', { class: 'dge-num' }, [
        dgeEl('span', { text: 'of' }),
        dgeEl('input', {
          type: 'text', value: p.ref, list: 'dge-elids',
          onchange: (e) => {
            const v = e.target.value.trim();
            if (v && v !== p.ref) write(dgePlaceText(p.dir, v, p.gap)); else dgeRenderSide();
          },
        }),
      ]),
      dgeEl('label', { class: 'dge-num' }, [
        dgeEl('span', { text: 'gap' }),
        dgeEl('input', {
          type: 'text', value: dgeNum(p.gap),
          onchange: (e) => write(dgePlaceText(p.dir, p.ref, Number(e.target.value) || 0)),
        }),
      ]),
    ]);
    wrap.appendChild(row);
  } else if (p.kind === 'between') {
    const row = dgeEl('div', { class: 'dge-nums' });
    for (const i of [0, 1]) {
      row.appendChild(dgeEl('label', { class: 'dge-num' }, [
        dgeEl('span', { text: i ? 'and' : 'between' }),
        dgeEl('input', {
          type: 'text', value: (p.refs[i] || {}).ref || '', list: 'dge-elids',
          onchange: (e) => {
            const v = e.target.value.trim();
            const a = i === 0 ? v : (p.refs[0] || {}).ref;
            const z = i === 1 ? v : (p.refs[1] || {}).ref;
            if (a && z) write(`between ${a},${z}` + (p.frac !== 0.5 ? ' frac ' + dgeNum(p.frac) : ''));
            else dgeRenderSide();
          },
        }),
      ]));
    }
    row.appendChild(dgeEl('label', { class: 'dge-num' }, [
      dgeEl('span', { text: 'frac' }),
      dgeEl('input', {
        type: 'text', value: dgeNum(p.frac),
        onchange: (e) => write(`between ${p.refs[0].ref},${p.refs[1].ref} frac ${dgeNum(Number(e.target.value) || 0)}`),
      }),
    ]));
    wrap.appendChild(row);
  }

  // One list for every id in the block, so the reference fields complete
  // rather than having to be remembered.
  const dl = dgeEl('datalist', { id: 'dge-elids' });
  for (const o of others) dl.appendChild(dgeEl('option', { value: o }));
  wrap.appendChild(dl);
  wrap.appendChild(dgeEl('div', { class: 'dge-hint', text:
    'A relation follows what it is measured from. Drag past an edge to change '
    + 'sides; change what it is measured from here.' }));
  return wrap;
}

function dgeElementList() {
  const wrap = dgeEl('div', {});
  if (!DGE.model) return wrap;
  wrap.appendChild(dgeEl('h3', { text: 'elements' }));
  const list = dgeEl('div', { class: 'dge-list' });
  // Leader stubs are not statements, so they are not rows: the arrow is
  // visible in the text element's own line, as the `-> x` that made it. The
  // same holds for what a `bars`, `grid` or `plot` expands into - ninety-six
  // rows for one statement, none of which can be edited on its own. The frame
  // stays, because the frame is the statement.
  const own = (e) => !e.lead && !(e.synth && e.synth !== e.id);
  const all = [...DGE.model.nodes.filter(own), ...DGE.model.containers.filter(own),
    ...DGE.model.braces.filter(own), ...DGE.model.edges.filter(own)];
  for (const el of all) {
    list.appendChild(dgeEl('button', {
      type: 'button', 'aria-pressed': String(DGE.selection.includes(el.id)),
      onclick: (e) => dgeSelect(e.shiftKey ? [...DGE.selection, el.id] : [el.id]),
    }, [
      dgeEl('span', { class: 'dge-kind', text: el.kind }),
      dgeEl('span', { class: 'dge-nm', text: el.id }),
      dgeEl('span', { class: 'dge-from', text: el.label ? '"' + el.label.split('\n')[0] + '"' : '' }),
    ]));
  }
  wrap.appendChild(list);
  return wrap;
}

// One way, for now: the canvas writes and the pane displays, with the
// changed token highlighted. Editing text *and* dragging at the same time is
// where round-tripping editors historically come apart.
function dgeSourcePane() {
  const wrap = dgeEl('div', {});
  wrap.appendChild(dgeEl('h3', { text: 'source' }));
  const pane = dgeEl('div', { id: 'dge-source' });
  const errLines = new Set((DGE.problems || []).map((p) => p.line).filter(Boolean));
  DGE.source.split('\n').forEach((line, i) => {
    const sel = DGE.selection.some((id) => {
      const el = dgeFind(id);
      return el && el.line === i + 1;
    });
    const row = dgeEl('span', {
      class: errLines.has(i + 1) ? 'dge-errline' : null,
      text: line + '\n',
    });
    if (sel) {
      const mark = dgeEl('mark', { text: line });
      row.replaceChildren(mark, document.createTextNode('\n'));
    }
    pane.appendChild(row);
  });
  wrap.appendChild(pane);
  if ((DGE.problems || []).length || (DGE.warnings || []).length) {
    const box = dgeEl('div', { class: 'dge-problems' });
    for (const p of DGE.problems || []) {
      box.appendChild(dgeEl('div', { text: (p.line ? 'line ' + p.line + ': ' : '') + p.msg }));
    }
    for (const w of DGE.warnings || []) {
      box.appendChild(dgeEl('div', { class: 'dge-warn', text: w }));
    }
    wrap.appendChild(box);
  }
  return wrap;
}

// ── the status bar ──────────────────────────────────────────────────

// Leave the line alone and speak only in the note. Used where the line is
// the thing the author just wrote and the note is a caveat about it – on
// pointerup after a partly-refused drag, for instance, where clearing the
// line would throw away the one thing worth reading.
function dgeNote(note, bad) {
  dgeStatus(DGE.status.line, note, bad);
}

function dgeStatus(line, note, bad) {
  DGE.status = { line: line || '', note: note || '', bad: !!bad };
  const l = dgeQ('#dge-statusline');
  const n = dgeQ('#dge-statusnote');
  if (l) l.textContent = DGE.status.line;
  if (n) {
    n.textContent = DGE.status.note;
    n.className = 'dge-note' + (bad ? ' dge-bad' : '');
  }
}

// The line the editor is about to write, with the changed token marked.
function dgeShowPlan(ctx, id, plan) {
  // Being held on a shared axis is not a failure, it is the set doing its
  // job, so it is not painted as one. Only a genuine refusal is.
  const soft = !!(plan.soft || plan.strain);
  if (plan.refusals.length && !plan.edits.length) {
    dgeStatus('', plan.refusals[0], !soft);
    return;
  }
  const el = dgeFind(id);
  const line = el && el.span ? DGE.source.slice(el.span[0], el.span[1]) : '';
  const why = plan.edits.map((e) => e.why).filter(Boolean)[0]
    || plan.edits.map((e) => e.attr).join(' · ');
  // One axis moving does not make the other one's answer uninteresting: a
  // diagonal drag against a held axis used to move x and say nothing at all
  // about why y stayed where it was.
  dgeStatus(line, plan.refusals.length ? why + ' · ' + plan.refusals[0] : why, false);
}

// ── the figure strip and the board (editor.md §6) ───────────────────
// Once the editor is open it stops being attached to one chunk and becomes a
// figure workspace over the whole lecture. Every one of these has a control
// you can see and click; the keys are how it gets fast afterwards.

// A thumbnail keeps every id it was given. Stripping them was meant to avoid
// duplicates in the document, but a spliced vector asset's stylesheet is
// wrapped in `@scope (svg#…)` anchored to exactly one of those ids – delete
// it and the scope matches nothing, so the thumbnail arrives with no strokes
// and no fills. That is the failure inlineSvg documents at length.
//
// Uniqueness is kept by *renaming* instead: one prefix per thumbnail, applied
// to every id and to every reference that could point at one.
let dgeThumbSeq = 0;
function dgeThumbFor(fig) {
  const clone = fig.svg.cloneNode(true);
  clone.removeAttribute('width');
  clone.removeAttribute('height');
  const tag = 'dgt' + (++dgeThumbSeq) + '-';
  const ids = new Set();
  if (clone.id) ids.add(clone.id);
  clone.querySelectorAll('[id]').forEach((n) => ids.add(n.id));
  if (!ids.size) return clone;
  // One pass with a longest-first alternation, never a loop of replacements.
  // The ids in a diagram nest – `dg6-alice` is a prefix of `dg6-alice--i` –
  // so a second pass rewrites what the first one just inserted, and the
  // result was `dgt6-dgt6-dg6-alice--i`. A single `replace` never re-scans
  // its own output, and the longest alternative wins at each position.
  const alt = [...ids]
    .sort((a, b) => b.length - a.length)
    .map((id) => id.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&'))
    .join('|');
  const markup = clone.outerHTML.replace(new RegExp(alt, 'g'), (m) => tag + m);
  const holder = document.createElement('div');
  holder.innerHTML = markup;
  return holder.firstElementChild || clone;
}

function dgeRenderStrip() {
  const strip = dgeQ('#dge-strip');
  if (!strip) return;
  strip.replaceChildren();
  DGE_FIGURES.forEach((fig, i) => {
    strip.appendChild(dgeEl('button', {
      type: 'button', class: 'dge-thumb', 'aria-current': String(i === DGE.index),
      onclick: () => dgeGoTo(i),
    }, [dgeThumbFor(fig), dgeEl('b', { text: fig.chunk || 'figure ' + (i + 1) })]));
  });
}

function dgeToggleBoard(force) {
  DGE.boardOpen = force === undefined ? !DGE.boardOpen : force;
  const board = dgeQ('#dge-board');
  board.hidden = !DGE.boardOpen;
  if (!DGE.boardOpen) return;
  board.replaceChildren();
  DGE_FIGURES.forEach((fig, i) => {
    board.appendChild(dgeEl('button', {
      type: 'button', class: 'dge-card', 'aria-current': String(i === DGE.index),
      onclick: () => { dgeToggleBoard(false); dgeGoTo(i); },
    }, [dgeThumbFor(fig), dgeEl('b', { text: fig.chunk || 'figure ' + (i + 1) })]));
  });
}

function dgeGoTo(i) {
  if (i === DGE.index) return;
  dgeLoadFigure(i);
}

function dgeGoFigure(step) {
  const n = DGE_FIGURES.length;
  if (!n) return;
  dgeGoTo((DGE.index + step + n) % n);
}

// ── beats (editor.md §10) ───────────────────────────────────────────
// A stepped diagram has several pictures, and dragging in beat 2 means
// something different from dragging in beat 0: at beat 0 a drag rewrites the
// element's *placement*, and at beat k it writes a `move` op into step k.
// That is the one place in this editor where the same gesture means two
// things, so it has to look like a mode – the canvas says so, the status bar
// says so, and the beat strip is always visible on a figure that has steps.

function dgeSetBeat(k) {
  // While the source is intermediate there is no model and no last good
  // render, and stepping the beats then threw and wedged the editor. The
  // beat still moves – it is editor state – and the canvas catches up on the
  // next compile that succeeds.
  const steps = DGE.model ? DGE.model.steps.length : 0;
  DGE.beat = Math.max(0, Math.min(steps, k));
  if (!DGE.model || !DGE.compiled) { dgeRenderAll(); return; }
  DGE.boxes = dgeBoxesAt(DGE.model, DGE.beat);
  dgePaintArt(DGE.compiled.html);
  dgeApplyFrame();
  dgeRenderAll();
}

function dgeRenderBeats() {
  const host = dgeQ('#dge-beats');
  if (!host) return;
  host.replaceChildren();
  const steps = DGE.model ? DGE.model.steps : [];
  if (!steps.length) { host.hidden = true; return; }
  host.hidden = false;
  host.appendChild(dgeEl('span', { class: 'dge-cap', text: 'step' }));
  const chip = (k, label) => dgeEl('button', {
    type: 'button', class: 'dge-btn dge-beat', 'aria-pressed': String(k === DGE.beat),
    text: label, title: k === 0 ? 'the opening picture – a drag rewrites the placement'
      : `after step "${steps[k - 1].name}" – a drag writes a move into that step`,
    onclick: () => dgeSetBeat(k),
  });
  host.appendChild(chip(0, 'start'));
  steps.forEach((s, i) => host.appendChild(chip(i + 1, s.name)));
}

// Dragging at a beat writes into the step, not into the placement. One
// `move … by` op per element per step: a second drag adds to the one that is
// already there rather than stacking two, which would be legal and unreadable.
function dgeStepMove(ctx, id, dx, dy) {
  const step = ctx.model.steps[DGE.beat - 1];
  if (!step) return null;
  const snap = (v) => dgeRound(v, DGE_SNAP_CELL);
  const existing = step.ops.find((o) => o.op === 'move' && o.target === id && o.by);
  const indent = (ctx.source.split('\n')[step.line] || '  ').match(/^\s*/)[0] || '  ';
  if (existing) {
    const next = [snap(existing.by[0] + dx), snap(existing.by[1] + dy)];
    return {
      start: existing.span[0], end: existing.span[1],
      text: `move ${id} by ${dgeNum(next[0])},${dgeNum(next[1])}`,
      line: `move ${id} by ${dgeNum(next[0])},${dgeNum(next[1])}`,
    };
  }
  // After the last op of the step, or straight after the `step` line when it
  // has none yet.
  const last = step.ops.length ? step.ops[step.ops.length - 1].span[1] : step.span[1];
  const text = `move ${id} by ${dgeNum(snap(dx))},${dgeNum(snap(dy))}`;
  return { start: last, end: last, text: '\n' + indent + text, line: text };
}

// At a beat, the guides have to show both where the element is now and where
// it came from, or a `move` is invisible until you press Space. Two
// treatments, and which one ships is the open question in §12 – both are
// drawn so the choice can be made by looking rather than on paper.
function dgeDrawBeatGuides(g) {
  if (!DGE.beat || !DGE.model || !DGE.model.steps.length) return;
  const prev = dgeBoxesAt(DGE.model, DGE.beat - 1);
  const style = DGE.beatGuide || 'both';
  for (const [id, now] of DGE.boxes) {
    const was = prev.get(id);
    if (!was) continue;
    if (Math.abs(was.x - now.x) < 0.5 && Math.abs(was.y - now.y) < 0.5) continue;
    if (style === 'ghost' || style === 'both') {
      g.appendChild(dgeEl('rect', {
        class: 'dge-ghost', x: was.x, y: was.y, width: was.w, height: was.h, rx: 3,
      }));
    }
    if (style === 'path' || style === 'both') {
      g.appendChild(dgeEl('line', {
        class: 'dge-motion',
        x1: was.x + was.w / 2, y1: was.y + was.h / 2,
        x2: now.x + now.w / 2, y2: now.y + now.h / 2,
      }));
    }
  }
}

// ── tools and keys ──────────────────────────────────────────────────

function dgePickTool(id) {
  const t = DGE_TOOLS.find((x) => x.id === id);
  if (t && t.wrapper) { dgeWrap(id); return; }
  DGE.tool = id;
  dgeRenderTools();
  const canvas = dgeQ('#dge-canvas');
  canvas.classList.toggle('dge-placing', id !== 'select');
}

function dgeRenderTools() {
  const rail = dgeQ('#dge-tools');
  if (!rail) return;
  rail.querySelectorAll('.dge-tool').forEach((b) => {
    const t = DGE_TOOLS.find((x) => x.id === b.dataset.tool);
    b.setAttribute('aria-pressed', String(b.dataset.tool === DGE.tool));
    if (t && t.wrapper) b.disabled = DGE.selection.length < 1;
  });
  // Locked is a state of the rail, so it is drawn on the rail. A mode
  // announced once in the status bar is a mode nobody remembers being in.
  rail.classList.toggle('dge-locked', DGE.toolLocked);
  const lock = dgeQ('#dge-lock');
  if (lock) lock.setAttribute('aria-pressed', String(DGE.toolLocked));
}

// The modal owns the keyboard. While the editor is open the view's own
// handler is off entirely – no C, no F, no A, no Space – or every tool key
// would also do something to the lecture underneath. A hard requirement,
// not a nicety.
function dgeKeydown(ev) {
  if (!DGE.open) return;
  const tag = (ev.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea') {
    if (ev.key === 'Escape') ev.target.blur();
    // A textarea keeps Enter for itself, so the only way out of a multi-line
    // label is the commit key – and it has to mean here what it means
    // everywhere else. Blur first: the field's change event fires inside that
    // call, so the commit writes the text the author just typed rather than
    // the text that was there before they started.
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 's') {
      ev.preventDefault();
      ev.stopPropagation();
      ev.target.blur();
      dgeCommit();
    }
    return;
  }
  const mod = ev.ctrlKey || ev.metaKey;
  const k = ev.key;
  ev.stopPropagation();

  if (mod) {
    if (k.toLowerCase() === 'z') { ev.preventDefault(); ev.shiftKey ? dgeRedo() : dgeUndo(); return; }
    if (k.toLowerCase() === 'a') { ev.preventDefault(); dgeSelect([...DGE.boxes.keys()]); return; }
    if (k.toLowerCase() === 'd') { ev.preventDefault(); dgeDuplicate(); return; }
    if (k.toLowerCase() === 'c') { ev.preventDefault(); dgeCopy(); return; }
    if (k.toLowerCase() === 'v') { ev.preventDefault(); dgePaste(ev.shiftKey); return; }
    if (k.toLowerCase() === 's') { ev.preventDefault(); dgeCommit(); return; }
    return;
  }
  if (k === ' ') { DGE.spaceDown = true; dgeQ('#dge-canvas').classList.add('dge-pannable'); ev.preventDefault(); return; }
  if (k === 'Escape') {
    ev.preventDefault();
    // One rung at a time, identical to the ladder on the slide.
    if (!dgeQ('#dge-assets').hidden) return dgeCloseAssetPicker();
    if (DGE.boardOpen) return dgeToggleBoard(false);
    if (DGE.selection.length) return dgeSelect([]);
    if (DGE.tool !== 'select') return dgePickTool('select');
    return dgeClose();
  }
  if (k === 'Delete' || k === 'Backspace') { ev.preventDefault(); dgeDelete(); return; }
  if (k.startsWith('Arrow')) { ev.preventDefault(); dgeNudge(k, ev.shiftKey); return; }
  // `<` and `>` are Shift of the figure keys, which is the right relation:
  // a beat is a step *within* the figure the other pair moves between.
  if (k === '<') { ev.preventDefault(); dgeSetBeat(DGE.beat - 1); return; }
  if (k === '>') { ev.preventDefault(); dgeSetBeat(DGE.beat + 1); return; }
  if (k === ',' || k === 'PageUp') { ev.preventDefault(); dgeGoFigure(-1); return; }
  if (k === '.' || k === 'PageDown') { ev.preventDefault(); dgeGoFigure(1); return; }
  if (k === '?') { ev.preventDefault(); dgeHelp(); return; }

  const key = k.toLowerCase();
  if (key === 'o') { ev.preventDefault(); dgeToggleBoard(); return; }
  if (key === 'q') {
    ev.preventDefault();
    DGE.toolLocked = !DGE.toolLocked;
    dgeRenderTools();
    dgeStatus('', DGE.toolLocked
      ? 'tool locked – it stays active after each use'
      : 'tool unlocked – one shot, then back to select');
    return;
  }
  if (key === 'f') { ev.preventDefault(); dgeCycleFrame(ev.shiftKey); return; }
  if (key === 'v' && ev.shiftKey) {
    ev.preventDefault();
    DGE.stripRight = !DGE.stripRight;
    dgeRoot.classList.toggle('dge-strip-right', DGE.stripRight);
    dgeZoomFit();
    return;
  }
  const tool = DGE_TOOLS.find((t) => !t.sep && t.keys.includes(key));
  if (tool) { ev.preventDefault(); dgePickTool(tool.id); return; }
}

function dgeKeyup(ev) {
  if (ev.key === ' ') {
    DGE.spaceDown = false;
    const c = dgeQ('#dge-canvas');
    if (c) c.classList.remove('dge-pannable');
  }
}

// A nudge writes into the same token a drag would, so the arrows are precise
// drags rather than a second mechanism.
function dgeNudge(key, coarse) {
  if (!DGE.selection.length) return;
  const step = coarse ? 0.25 : 0.05;
  const dx = key === 'ArrowLeft' ? -step : key === 'ArrowRight' ? step : 0;
  const dy = key === 'ArrowUp' ? -step : key === 'ArrowDown' ? step : 0;
  const ctx = dgeGestureBase();
  const res = dgeMoveSelection(ctx, dx, dy, {});
  if (res.next !== ctx.source) dgeSetSource(res.next);
  // A nudge is a whole gesture in one keypress, so it has to release what a
  // gesture pins. Without this one arrow key froze the canvas viewBox for
  // the rest of the session – including across figure switches – and any
  // element that moved outside that box was clipped off the canvas.
  dgeGestureEnd();
  if (res.plan) dgeShowPlan(ctx, DGE.selection[0], res.plan);
  if (res.refusal) dgeNote(res.refusal, true);
}

// ── copy, paste, commit (editor.md §2.3, §7.1) ──────────────────────

// Paste the dependency closure. Naively this is impossible in a relational
// grammar – the selected lines refer to elements that do not exist in the
// target, and converting those relations to absolute coordinates is
// precisely what the grammar exists to avoid. So the editor pastes
// everything the selection depends on instead.
function dgeClosureOf(ids) {
  const want = new Set(ids);
  const add = (id) => { if (id && DGE.model.byId.has(id) && !want.has(id)) { want.add(id); grow = true; } };
  let grow = true;
  while (grow) {
    grow = false;
    for (const id of [...want]) {
      const el = dgeFind(id);
      if (!el) continue;
      const p = el.place;
      if (p && p.kind === 'rel') add(p.ref);
      if (p && p.kind === 'between') for (const r of p.refs) add(r.ref);
      if (p && p.kind === 'abs') for (const c of (p.at || [])) if (c && c.ref) add(c.ref);
      if (el.sameAs) add(el.sameAs);
      if (el.kind === 'edge') { if (!el.from.point) add(el.from.ref); if (!el.to.point) add(el.to.ref); }
      if (el.members) for (const m of el.members) add(m);
      // The master of any align/spread the selection is part of: without it
      // the statement lands with a name that is not there.
      for (const a of [...DGE.model.aligns, ...DGE.model.spreads]) {
        if (a.members.includes(id)) add(a.members[0]);
      }
    }
  }
  return want;
}

function dgeCopy() {
  if (!DGE.selection.length || !DGE.model) return;
  const want = dgeClosureOf(DGE.selection);
  const lines = [];
  const seen = new Set();
  for (const el of [...DGE.model.nodes, ...DGE.model.edges, ...DGE.model.containers, ...DGE.model.braces]) {
    if (!want.has(el.id) || seen.has(el.line)) continue;
    seen.add(el.line);
    lines.push({ line: el.line, text: DGE.source.slice(el.span[0], el.span[1]) });
  }
  for (const a of [...DGE.model.aligns, ...DGE.model.spreads]) {
    if (a.members.every((m) => want.has(m)) && !seen.has(a.line)) {
      seen.add(a.line);
      lines.push({ line: a.line, text: DGE.source.slice(a.span[0], a.span[1]) });
    }
  }
  // The `default <kind> @tag` blocks the selection's tags actually use.
  const tags = new Set();
  for (const id of want) for (const t of (dgeFind(id) || {}).tags || []) tags.add(t);
  for (const d of DGE.model.tagDefaults) {
    if (tags.has(d.tag) && d.span && !seen.has(d.line)) {
      seen.add(d.line);
      lines.push({ line: d.line, text: DGE.source.slice(d.span[0], d.span[1]) });
    }
  }
  lines.sort((a, b) => a.line - b.line);
  // Where the pasted set is anchored. A relation inside the set survives a
  // paste untouched – that is the whole point of pasting the closure – so
  // the only positions the paste has to decide are the ones nothing in the
  // set is placed against: the elements whose own placement is an absolute
  // coordinate, or the implicit origin the first element gets for free.
  // Recorded in cells, from the boxes as laid out here.
  const { uw, uh } = dgeUnits();
  const anchors = {};
  for (const id of want) {
    const el = dgeFind(id);
    const b = DGE.boxes.get(id);
    if (!el || !b || !el.place) continue;
    if (!(el.place.implicit || (el.place.kind === 'abs' && (el.place.at || []).every((c) => c && !c.ref)))) continue;
    anchors[id] = [(b.x + b.w / 2) / uw, (b.y + b.h / 2) / uh];
  }
  DGE.clipboard = {
    names: [...want],
    roots: DGE.selection.slice(),
    anchors,
    text: lines.map((l) => l.text).join('\n'),
  };
  dgeStatus(DGE.clipboard.text.split('\n')[0] + (lines.length > 1 ? ' …' : ''),
    `${lines.length} line(s) copied – the selection and everything it depends on`);
}

// Rename element names in a block, without touching what is inside a quoted
// label. A regex over the raw text cannot tell the two apart: copying
// `box mix "the mix of a and b"` into a figure that already has `mix` turned
// the caption into "the mix2 of a2 and b". So this tokenizes each line and
// rewrites only the tokens that can hold a *name* – bare tokens, and the
// `#id` inside an attribute tail. A quoted token is never one of them.
function dgeRenameIn(text, rename) {
  const alt = [...rename.keys()]
    .sort((a, b) => b.length - a.length)
    .map((n) => n.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&'))
    .join('|');
  if (!alt) return text;
  // A name is bounded by anything that cannot be part of one. Element names
  // are letters, digits, _ and -, which is what makes this exact.
  const re = new RegExp('(^|[^\\w-])(' + alt + ')(?![\\w-])', 'g');
  const swap = (str) => str.replace(re, (m, pre, name) => pre + (rename.get(name) || name));
  return text.split('\n').map((line) => {
    const toks = window.PSI_DG.dgTokenize(line, 0);
    const edits = [];
    for (const t of toks) {
      if (t.q) continue;                       // a label is not a name
      if (t.attr) {
        // Only the #id half of the tail: a .class is vocabulary and an @tag
        // is a set, and neither is an element name.
        const inner = t.v.replace(/#([A-Za-z_][\w-]*)/g, (m, n) => '#' + (rename.get(n) || n));
        if (inner !== t.v) edits.push({ start: t.s + 1, end: t.e - 1, text: inner });
        continue;
      }
      const next = swap(t.v);
      if (next !== t.v) edits.push({ start: t.s, end: t.e, text: next });
    }
    edits.sort((a, b) => b.start - a.start);
    let out = line;
    for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end);
    return out;
  }).join('\n');
}

function dgePaste(inPlace) {
  if (!DGE.clipboard) return;
  // Name collisions are renamed mechanically, with every reference *inside*
  // the pasted set rewritten. Safe because element names are letters,
  // digits, _ and - only.
  let text = DGE.clipboard.text;
  const rename = new Map();
  for (const name of DGE.clipboard.names) {
    if (!DGE.model.byId.has(name)) continue;
    rename.set(name, dgeFreshName(name));
  }
  if (rename.size) text = dgeRenameIn(text, rename);
  if (!inPlace) {
    // Ctrl-V drops the set where the pointer last was; Ctrl-Shift-V pastes
    // in place, keeping the coordinates it had – which is what makes a
    // series of figures line up.
    //
    // Re-rooting goes through the span table, not through a regex on the
    // text. Two things a regex got wrong here and this cannot: an anchor
    // whose placement is the *implicit* origin has nothing to replace and
    // needs one written, and a lazy pattern happily matched the placement of
    // some other line and left its `gap` behind as a syntax error.
    const pt = DGE.lastPoint || { x: 0, y: 0 };
    const { uw, uh } = dgeUnits();
    const anchors = DGE.clipboard.anchors || {};
    const names = Object.keys(anchors);
    if (names.length) {
      const base = anchors[names[0]];
      const dx = pt.x / uw - base[0];
      const dy = pt.y / uh - base[1];
      const parsed = DGE.fig.compiler.parseDiagramSource(text, DGE.fig.attrs, dgeBase());
      const table = window.PSI_DG.createSpanTable(parsed.model, text);
      const edits = [];
      for (const from of names) {
        const to = rename.get(from) || from;
        const sp = table.spanOf(to, 'place');
        if (!sp) continue;
        const at = `at ${dgeNum(dgeRound(anchors[from][0] + dx, DGE_SNAP_CELL))},`
          + `${dgeNum(dgeRound(anchors[from][1] + dy, DGE_SNAP_CELL))}`;
        edits.push({ start: sp.start, end: sp.end, text: sp.prefix + at + sp.suffix });
      }
      edits.sort((a, b) => b.start - a.start);
      for (const e of edits) text = text.slice(0, e.start) + e.text + text.slice(e.end);
    }
  }
  const lines = DGE.source.split('\n');
  let at = lines.length;
  for (let i = lines.length - 1; i >= 0; i--) if (/^\s*step\b/.test(lines[i])) at = i;
  lines.splice(at, 0, ...text.split('\n'));
  dgeSetSource(lines.join('\n'));
  dgeSelect(DGE.clipboard.roots.map((r) => rename.get(r) || r));
  dgeStatus('', `pasted ${text.split('\n').length} line(s)${rename.size ? `, ${rename.size} renamed to avoid a collision` : ''}`);
}

// ── where an edit goes (editor.md §2.3) ─────────────────────────────
// Four tiers, tried in order. Every one of them writes the *block body* and
// nothing else, so source.md stays the single source of truth and the editor
// never owns a parallel copy.

function dgeBlockText() {
  return '::: diagram' + (DGE.fig.attrs ? ' {' + DGE.fig.attrs + '}' : '') + '\n'
    + DGE.source + '\n:::';
}

function dgeCommit() {
  if (DGE.problems && DGE.problems.length) {
    dgeStatus(DGE.status.line, 'The block does not compile – fix the problems below before writing it back.', true);
    return;
  }
  // Tier 1 – the watch socket. The author's loop, and the cheapest of the
  // four: the server splices the byte range into source.md, fs.watch fires,
  // the normal rebuild runs, every tab reloads.
  if (window.psiWatch && window.psiWatch.ready() && DGE.fig.range) {
    dgeStatus(DGE.status.line, 'writing back to source.md…');
    // The write triggers a rebuild, which reloads every open tab – including
    // this one, with the editor in it. Leave a note for the next boot so the
    // author lands back on the figure they were working on instead of on a
    // slide. sessionStorage, not localStorage: this belongs to the reload,
    // not to the reader.
    try { sessionStorage.setItem(DGE_REOPEN, DGE.fig.chunk || String(DGE.index)); } catch (e) {}
    window.psiWatch.patch(DGE.fig.range, DGE.source, DGE.fig.body).then((res) => {
      if (res.ok) {
        DGE.dirty = false;
        dgeStatus(DGE.status.line, 'written to source.md – the rebuild will reload this page');
      } else {
        try { sessionStorage.removeItem(DGE_REOPEN); } catch (e) {}
        dgeStatus(DGE.status.line, res.why + ' · falling back to the clipboard', true);
        dgeCopyBlock();
      }
    });
    return;
  }
  // Tier 3 – File System Access, opportunistically. Feature-detected, never
  // load-bearing: Firefox and Safari have neither function, and persisting
  // the handle across reloads goes through IndexedDB under an opaque
  // file:// origin, which is the ground BroadcastChannel already fails on.
  // So: "pick the file every session", not "remember my source.md".
  if (DGE.fileHandle) { dgeWriteToFile(); return; }
  dgeCopyBlock();
}

// Tier 2 – the clipboard. Always available, every browser, file:// included,
// and the same idiom as Shift-E, which exports live annotations as a snippet
// to paste back into source.md.
function dgeCopyBlock() {
  const block = dgeBlockText();
  const done = (ok) => dgeStatus(DGE.status.line, ok
    ? 'copied – paste it over the ::: diagram block in source.md'
    : 'could not reach the clipboard; select the source pane and copy by hand', !ok);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(block).then(() => done(true), () => done(false));
  } else {
    done(false);
  }
}

const dgeCanPickFile = () => typeof window.showOpenFilePicker === 'function';

async function dgePickSourceFile() {
  if (!dgeCanPickFile()) return;
  try {
    const [handle] = await window.showOpenFilePicker({
      multiple: false,
      types: [{ description: 'Lecture source', accept: { 'text/markdown': ['.md'] } }],
    });
    DGE.fileHandle = handle;
    dgeStatus('', `${handle.name} is open – writing back goes there until this tab is reloaded`);
    dgeRenderAll();
  } catch (e) {
    // AbortError is the author closing the picker, which is not a problem.
    if (e && e.name !== 'AbortError') dgeStatus('', 'could not open that file: ' + e.message, true);
  }
}

async function dgeWriteToFile() {
  const h = DGE.fileHandle;
  if (!h || !DGE.fig.range) return dgeCopyBlock();
  try {
    const src = await (await h.getFile()).text();
    // The same three checks the watch server makes, for the same reason: a
    // range computed against a stale file must be refused, not applied at
    // the wrong offset.
    const [a, b] = DGE.fig.range;
    if (src.slice(a, b) !== DGE.fig.body) {
      dgeStatus(DGE.status.line, `${h.name} has changed since this page was built – reload it and try again`, true);
      return;
    }
    const w = await h.createWritable();
    await w.write(src.slice(0, a) + DGE.source + src.slice(b));
    await w.close();
    // The block now lives at a different range and holds different bytes.
    // Without this the *second* save of a session always failed, and failed
    // with the wrong diagnosis – "source.md has changed since this page was
    // built" when the only thing that changed was the author's own previous
    // save. The watch tier escapes this only because it triggers a reload.
    DGE.fig.range = [a, a + DGE.source.length];
    DGE.fig.body = DGE.source;
    DGE.dirty = false;
    dgeStatus(DGE.status.line, `written to ${h.name} – rebuild to see it`);
  } catch (e) {
    dgeStatus(DGE.status.line, 'could not write that file: ' + e.message + ' · falling back to the clipboard', true);
    dgeCopyBlock();
  }
}

// ── Tier 0, for the reader ──────────────────────────────────────────
// A student's edit has nowhere to go: their audience.html is a build
// artefact, gitignored, regenerated. So it goes on the same shelf as
// revealed[] and the theme preference, keyed by chunk id, and the figure
// shows their version with a quiet marker. It never touches disk and never
// syncs to the speaker window – there is no second window to sync to.

const DGE_STORE = 'psi-slides:diagram:';
// Which figure to come back to after a write-back reloads the page.
const DGE_REOPEN = 'psi-slides:diagram-editor-open';

// Keyed by the chunk *and* which diagram inside it, because a chunk may hold
// more than one and the chunk id alone put both on one shelf. `nth` is the
// figure's position within its chunk, which is stable against a diagram being
// added to a *different* chunk – unlike the build's global dg-N prefix, which
// shifts the moment one is inserted earlier in the lecture.
function dgeStoreKey(fig) {
  const base = fig.chunk || 'unnamed';
  return DGE_STORE + base + (fig.nth ? '#' + fig.nth : '');
}

function dgeSaveLocal() {
  if (!DGE.fig) return;
  try {
    if (DGE.source === DGE.fig.body) localStorage.removeItem(dgeStoreKey(DGE.fig));
    else localStorage.setItem(dgeStoreKey(DGE.fig), DGE.source);
  } catch (e) { /* private mode, or a storage policy – not worth a message */ }
}

function dgeLoadLocal(fig) {
  try { return localStorage.getItem(dgeStoreKey(fig)); } catch (e) { return null; }
}

function dgeRevertLocal() {
  if (!DGE.fig) return;
  try { localStorage.removeItem(dgeStoreKey(DGE.fig)); } catch (e) {}
  DGE.source = DGE.fig.body;
  DGE.dirty = false;
  dgeRecompile();
  // The page behind the editor, not only the canvas. Without this the slide
  // kept showing the version that was just reverted away from – and in a
  // two-window session the *peer* reverted correctly while the window that
  // pressed the button did not, which is the one divergence the sync exists
  // to prevent.
  dgeApplyToPage(DGE.fig, DGE.source);
  const marker = DGE.fig.figure && DGE.fig.figure.querySelector('.dge-edited');
  if (marker) marker.remove();
  dgeBroadcastEdit();
  dgeStatus('', 'back to the figure as it was written');
}

// Repaint a figure *in the page* from an edited body, so a reader's change
// survives leaving the editor, and so a synced edit lands in the other
// window. The live runtime's own data is rebuilt with it, or the next Space
// would tween back to the geometry of the old picture.
function dgeApplyToPage(fig, body) {
  const res = dgeCompile(fig, body);
  if (!res.ok) return false;
  const holder = document.createElement('div');
  holder.innerHTML = res.html;
  const next = holder.querySelector('svg.psi-diagram');
  const payload = holder.querySelector('script.psi-diagram-frames');
  if (!next) return false;
  const live = fig.svg.psiDiagram;
  if (next.dataset.liveViewbox) {
    next.setAttribute('viewBox', next.dataset.liveViewbox);
    const w = Number(next.getAttribute('width'));
    const r = Number(next.dataset.liveRatio);
    if (w && r) next.setAttribute('height', String(Math.round(w * r)));
  }
  fig.svg.replaceWith(next);
  fig.svg = next;
  // The frames payload is what the step runtime reads, and initDiagrams
  // found it by walking `script.psi-diagram-frames`. Leave the old one in
  // place and a figure that just *gained* steps has none the runtime can
  // see, while one that lost them keeps applying geometry from a picture
  // that no longer exists. Replace it alongside the drawing.
  const oldPayload = fig.figure
    ? fig.figure.querySelector('script.psi-diagram-frames') : null;
  if (payload) {
    payload.dataset.for = next.id;
    if (oldPayload) oldPayload.replaceWith(payload);
    else fig.figure.appendChild(payload);
  } else if (oldPayload) {
    oldPayload.remove();
  }
  if (payload) {
    try {
      const data = JSON.parse(payload.textContent);
      const d = live || { svg: next, step: 0, raf: 0, cur: null, cache: {},
        hint: fig.figure ? fig.figure.querySelector('.dg-hint') : null };
      d.data = data;
      d.svg = next;
      d.cache = {};
      d.cur = null;
      next.psiDiagram = d;
      if (!live) DGE_NEW_RUNTIMES.push(d);
      window.dgStep(d, Math.min(d.step, data.n - 1), true);
    } catch (e) { /* a payload that will not parse is not worth a crash */ }
  } else if (live) {
    // No steps any more: nothing left to tween, and the static attributes
    // the emitter wrote are already the finished picture.
    next.psiDiagram = null;
  }
  return true;
}

// ── sync (editor.md §2.4) ───────────────────────────────────────────
// An edit syncs. Everything else on the slide does, and a diagram that
// differed between the projection and the cockpit would be the first
// divergence in the product.
//
// It follows the *video* precedent rather than the state snapshot, and for
// the documented reason: applyRemoteState is a full apply, so folding an
// edit into the snapshot would drag the receiver's slide position along with
// it. So it is its own message, addressed by the diagram's id rather than by
// index – reordering a chunk must not be able to mis-target it – gated by
// the freeze flag like any other shared state, and echo-suppressed.

let dgeApplyingRemote = false;

function dgeBroadcastEdit() {
  if (dgeApplyingRemote || !DGE.fig) return;
  if (typeof sendToPeer !== 'function' || typeof shouldBroadcast !== 'function') return;
  if (!shouldBroadcast()) return;
  sendToPeer({ type: 'diagram-edit', id: DGE.fig.svg.id, source: DGE.source });
}

function dgeApplyRemoteEdit(m) {
  const figs = DGE_FIGURES.length ? DGE_FIGURES : dgeCollectFigures();
  const fig = figs.find((f) => f.svg.id === m.id);
  if (!fig) return;
  dgeApplyingRemote = true;
  try {
    dgeApplyToPage(fig, m.source);
    if (DGE.open && DGE.fig === fig) {
      DGE.source = m.source;
      dgeRecompile();
    }
  } finally {
    setTimeout(() => { dgeApplyingRemote = false; }, 0);
  }
}
window.psiApplyDiagramEdit = dgeApplyRemoteEdit;

// A whole chunk – heading, id, block – on the clipboard, for the case where
// no text editor is open. A convenience, not the path: a graphical editor is
// bad at exactly the part a new figure needs, and the chunk id in particular
// is frozen once authored and is the anchor for cross-references, TOC
// entries and sync snapshots.
function dgeNewFigure() {
  const taken = new Set(DGE_FIGURES.map((f) => f.chunk).filter(Boolean));
  let id = 'figure-1';
  for (let i = 1; taken.has(id); i++) id = 'figure-' + (i + 1);
  const chunk = `## figure: TODO – heading {.wide #${id}}\n\n`
    + '::: diagram\nbox a "A"\n:::\n';
  const done = (ok) => dgeStatus(ok ? `## figure: TODO – heading {.wide #${id}}` : '', ok
    ? 'a whole chunk is on the clipboard – paste it into source.md, rebuild, and it is here'
    : 'could not reach the clipboard', !ok);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(chunk).then(() => done(true), () => done(false));
  } else done(false);
}

function dgeHelp() {
  const help = document.getElementById('help-overlay');
  if (help) help.classList.toggle('hidden');
}

// ── painting the chrome ─────────────────────────────────────────────

function dgeRenderAll() {
  if (!DGE.open) return;
  const name = dgeQ('#dge-name');
  if (name) name.textContent = DGE.fig.chunk ? '#' + DGE.fig.chunk : 'figure ' + (DGE.index + 1);
  const pos = dgeQ('#dge-figpos');
  if (pos) pos.textContent = `${DGE.index + 1} / ${DGE_FIGURES.length}`;
  const counts = dgeQ('#dge-counts');
  if (counts && DGE.model) {
    counts.textContent = `${DGE.model.nodes.length + DGE.model.edges.length
      + DGE.model.containers.length + DGE.model.braces.length} elements`
      + (DGE.model.steps.length ? ` · step ${DGE.beat} of ${DGE.model.steps.length}` : '')
      + (DGE.dirty ? ' · edited' : '');
  }
  // One line of chrome saying which of the two situations this is. A private
  // editor mode is not a separate feature – it is the cockpit's existing
  // freeze, and saying so beats growing a second concept for the same thing.
  const room = dgeQ('#dge-room');
  if (room) {
    // Read off the cockpit's own control rather than a variable: `frozen` is
    // a top-level `let` in a classic script, which is not a property of
    // window, and the button is the state made visible anyway.
    const btn = document.getElementById('freeze-btn');
    const frozen = !!(btn && btn.getAttribute('aria-pressed') === 'true');
    const isSpeaker = document.body.dataset.view === 'speaker';
    room.textContent = isSpeaker
      ? (frozen ? 'the room is frozen – it will not see this until you unfreeze' : 'the room is following')
      : 'this window is the projection';
    room.className = isSpeaker && frozen ? 'dge-frozen' : 'dge-live';
  }
  // The commit button names the tier it will actually use, so "where does
  // this go?" is answered before it is pressed rather than after.
  const copy = dgeQ('#dge-copy-btn');
  if (copy) {
    copy.disabled = !!(DGE.problems && DGE.problems.length);
    const live = window.psiWatch && window.psiWatch.ready() && DGE.fig.range;
    copy.innerHTML = live ? 'Write to source.md <kbd>⌘S</kbd>'
      : DGE.fileHandle ? 'Write to ' + DGE.fileHandle.name + ' <kbd>⌘S</kbd>'
      : 'Copy source <kbd>⌘S</kbd>';
    copy.title = live
      ? 'write this block back into source.md, through the running --watch'
      : DGE.fileHandle ? 'write this block back into the file you opened'
      : 'copy the whole ::: diagram block to the clipboard';
  }
  // Tier 3 is opportunistic and never load-bearing: offered where the
  // picker exists and there is no watch socket already doing the job.
  const fileBtn = dgeQ('#dge-file-btn');
  if (fileBtn) {
    const useful = dgeCanPickFile() && !(window.psiWatch && window.psiWatch.ready());
    fileBtn.hidden = !useful || !!DGE.fileHandle;
  }
  // A reader's edits live in localStorage and nowhere else, so the way back
  // has to be visible. Shown only when this figure is actually showing
  // something other than what the author wrote.
  const revert = dgeQ('#dge-revert-btn');
  if (revert) revert.hidden = DGE.source === DGE.fig.body;
  // Every mechanism in here has to have a visible control with its key printed
  // on it – editor.md §4.2. Undo was the one that had only the key, and how
  // deep the stack is is a thing the author can otherwise only find out by
  // pressing it.
  const undoBtn = dgeQ('#dge-undo-btn');
  if (undoBtn) {
    undoBtn.disabled = !DGE.undo.length;
    undoBtn.title = DGE.undo.length ? `undo (⌘Z) – ${DGE.undo.length} change(s) back` : 'nothing to undo';
  }
  const redoBtn = dgeQ('#dge-redo-btn');
  if (redoBtn) {
    redoBtn.disabled = !DGE.redo.length;
    redoBtn.title = DGE.redo.length ? `redo (⇧⌘Z) – ${DGE.redo.length} change(s) forward` : 'nothing to redo';
  }
  dgeApplyFrame();
  dgeApplyView();
  dgeRenderTools();
  dgeRenderBeats();
  dgeRenderSide();
  dgeDrawGuides();
  dgeRoot.classList.toggle('dge-in-step', DGE.beat > 0);
  const strip = dgeQ('#dge-strip');
  if (strip) strip.querySelectorAll('.dge-thumb').forEach((b, i) => {
    b.setAttribute('aria-current', String(i === DGE.index));
  });
}

// ── the entry point ─────────────────────────────────────────────────
// The focus card opens the editor; it does not become it. Clicking a diagram
// already zooms it into the existing centred card, and the pencil there
// opens the editor as its own overlay above it. Reusing the card as the
// canvas would entangle the editor with FOCUSABLE_SEL, the card's pan/zoom
// and its own sync – three things that already work and none of which the
// editor wants to inherit.

function dgeFigureForNode(node) {
  const svg = node && node.querySelector ? node.querySelector('svg.psi-diagram') : null;
  if (!svg) return -1;
  const id = svg.id || '';
  const figs = dgeCollectFigures();
  // The focus card is a *clone*, so its svg carries the same id as the
  // original. Match on that rather than on identity.
  return figs.findIndex((f) => f.svg.id === id);
}

function dgeMountEntryPoint() {
  const overlay = document.getElementById('figure-overlay');
  if (!overlay) return;
  const sync = () => {
    const card = overlay.querySelector('.figure-focus-target');
    const existing = document.querySelector('.dge-pencil');
    if (existing) existing.remove();
    if (!card || !card.classList.contains('figure-diagram')) return;
    if (dgeFigureForNode(card) < 0) return;
    const btn = dgeEl('button', {
      type: 'button', class: 'dge-btn dge-pencil',
      html: 'Edit this figure <kbd>E</kbd>',
      title: 'open the diagram editor',
      onclick: (e) => { e.stopPropagation(); dgeOpenFromCard(); },
    });
    // Appended to the body, not to the overlay. It is position: fixed
    // either way, and putting it inside the subtree the observer watches
    // makes its own insertion a mutation – which re-runs sync, which
    // inserts it again. That loop hangs the tab and then kills it.
    document.body.appendChild(btn);
  };
  new MutationObserver(sync).observe(overlay, { childList: true });
  sync();
}

function dgeOpenFromCard() {
  const overlay = document.getElementById('figure-overlay');
  const card = overlay ? overlay.querySelector('.figure-focus-target') : null;
  const i = dgeFigureForNode(card);
  if (i < 0) return false;
  return dgeOpen(i);
}

// `E` is a slide binding, not an editor one: it opens the editor from a
// focused figure and does nothing otherwise. Captured, so it reaches the
// editor before the view's own handler and cannot advance the lecture.
function dgeMountKeys() {
  window.addEventListener('keydown', (ev) => {
    if (DGE.open) return dgeKeydown(ev);
    if (ev.key !== 'e' && ev.key !== 'E') return;
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const t = (ev.target.tagName || '').toLowerCase();
    if (t === 'input' || t === 'textarea') return;
    if (!document.body.classList.contains('figure-focused')) return;
    if (dgeOpenFromCard()) { ev.preventDefault(); ev.stopPropagation(); }
  }, true);
  window.addEventListener('keyup', dgeKeyup, true);
  window.addEventListener('pointermove', (ev) => {
    if (DGE.open && !DGE.boardOpen) DGE.lastPoint = dgePointToDiagram(ev);
  });
}

// ── boot ────────────────────────────────────────────────────────────

window.psiEditor = {
  figures: () => (DGE_FIGURES.length ? DGE_FIGURES : dgeCollectFigures()),
  compile: dgeCompile,
  selfTest: dgeSelfTest,
  spanTable: (fig, body) => window.PSI_DG.createSpanTable(
    fig.compiler.parseDiagramSource(body === undefined ? fig.body : body, fig.attrs, dgeBase()).model,
    body === undefined ? fig.body : body),
  open: dgeOpen,
  close: dgeClose,
  commit: dgeCommit,
  select: dgeSelect,
  setBeat: dgeSetBeat,
  boxesAt: (model, k) => DGE.fig.compiler.layoutDiagram(model, window.PSI_DG.dgStateAt(model, k), []),
  state: DGE,
};

// A reader's kept edits, applied to the page at boot so they survive a
// reload without the editor being open, each with a quiet marker saying the
// figure is not the one the author wrote.
function dgeRestoreLocal() {
  for (const fig of DGE_FIGURES) {
    const kept = dgeLoadLocal(fig);
    if (kept === null || kept === fig.body) continue;
    if (!dgeApplyToPage(fig, kept)) continue;
    const holder = fig.figure;
    if (!holder || holder.querySelector('.dge-edited')) continue;
    holder.appendChild(dgeEl('div', { class: 'dge-edited' }, [
      document.createTextNode('edited · '),
      dgeEl('button', {
        type: 'button', text: 'revert',
        onclick: (e) => {
          e.stopPropagation();
          try { localStorage.removeItem(dgeStoreKey(fig)); } catch (err) {}
          dgeApplyToPage(fig, fig.body);
          e.target.parentNode.remove();
        },
      }),
    ]));
  }
}

function dgeBoot() {
  dgeCollectFigures();
  dgeRestoreLocal();
  dgeMountEntryPoint();
  dgeMountKeys();
  // Come back to the figure a write-back reloaded away from. Consumed on
  // read, so a later manual reload lands on the slide as it should.
  let back = null;
  try { back = sessionStorage.getItem(DGE_REOPEN); sessionStorage.removeItem(DGE_REOPEN); } catch (e) {}
  if (back !== null && DGE_FIGURES.length) {
    const i = DGE_FIGURES.findIndex((f) => f.chunk === back);
    dgeOpen(i >= 0 ? i : Number(back) || 0);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', dgeBoot, { once: true });
} else {
  dgeBoot();
}
